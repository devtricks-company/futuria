'use client';

import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Briefcase,
  Check,
  Laptop,
  type LucideIcon,
  Pencil,
  Plus,
  Rocket,
  Split,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PATH_TYPES, PLANS, type PathType, type PlanId, type ProposedPath } from '@futuria/shared';
import { Notice } from '@/components/notice';
import { PathSwatch } from '@/components/results/path-color';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Textarea } from '@/components/ui/input';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { openGate } from '@/lib/gate-events';
import { PATH_TYPE_HINTS, PATH_TYPE_LABELS, newPathId } from '@/lib/paths';
import { pathsUpgrade } from '@/lib/plan-gates';
import { cn } from '@/lib/utils';

const PATH_TYPE_ICONS: Record<PathType, LucideIcon> = {
  stay: Briefcase,
  freelance: Laptop,
  hybrid: Split,
  startup: Rocket,
  newJob: ArrowLeftRight,
};

/** The open form for one path: name, kind and what it means for the person. */
function PathEditor({
  path,
  onChange,
  onDone,
}: {
  path: ProposedPath;
  onChange: (patch: Partial<ProposedPath>) => void;
  onDone: () => void;
}) {
  const [tried, setTried] = useState(false);
  const nameMissing = tried && !path.name.trim();
  const done = () => {
    setTried(true);
    if (path.name.trim()) onDone();
  };
  const nameId = `path-name-${path.id}`;

  return (
    <div className="flex flex-col gap-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-300">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={path.name}
          maxLength={80}
          autoFocus
          onChange={(e) => onChange({ name: e.target.value })}
          // Enter closes the editor here; it must not submit the whole step.
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              done();
            }
          }}
          aria-invalid={nameMissing ? true : undefined}
          aria-describedby={nameMissing ? `${nameId}-error` : undefined}
        />
        {nameMissing ? (
          <p id={`${nameId}-error`} className="text-sm text-danger">
            Give this path a name.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label id={`path-type-${path.id}-label`}>Kind of path</Label>
        <RadioGroup
          aria-labelledby={`path-type-${path.id}-label`}
          aria-describedby={`path-type-${path.id}-hint`}
          value={path.type}
          onValueChange={(value) => onChange({ type: value as PathType })}
          className="sm:grid-cols-2"
        >
          {PATH_TYPES.map((type) => {
            const Icon = PATH_TYPE_ICONS[type];
            return (
              <RadioCard key={type} value={type}>
                <span className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                  {PATH_TYPE_LABELS[type]}
                </span>
              </RadioCard>
            );
          })}
        </RadioGroup>
        <p id={`path-type-${path.id}-hint`} className="text-sm text-muted">
          {PATH_TYPE_HINTS[path.type]}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`path-summary-${path.id}`}>What it means for you (optional)</Label>
        <Textarea
          id={`path-summary-${path.id}`}
          value={path.summary}
          maxLength={300}
          rows={2}
          className="min-h-16"
          onChange={(e) => onChange({ summary: e.target.value })}
        />
      </div>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={done}>
          <Check />
          Done
        </Button>
      </div>
    </div>
  );
}

/**
 * Wizard step 3. Claude's proposed paths read as a short list (most people keep them); each one
 * opens into a small form on "Edit". New paths start from a kind and open ready to name. The
 * colour dot is the colour the path keeps in the results charts.
 */
export function PathsStep({
  paths,
  maxPaths,
  plan,
  onChange,
  onBack,
  onSubmit,
  error,
}: {
  paths: ProposedPath[];
  maxPaths: number;
  plan: PlanId;
  onChange: (paths: ProposedPath[]) => void;
  /** Undefined when there were no questions to go back to. */
  onBack?: () => void;
  onSubmit: () => void;
  error: string | null;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set());
  const update = (id: string, patch: Partial<ProposedPath>) =>
    onChange(paths.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const invalid = paths.some((p) => !p.name.trim());
  const upgrade = pathsUpgrade(plan);

  // Keep keyboard focus on the row someone just closed or next to the one they removed.
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    focusNext.current = null;
    document.getElementById(`path-edit-${id}`)?.focus();
  });

  const setEditing = (id: string, editing: boolean) =>
    setOpen((current) => {
      const next = new Set(current);
      if (editing) next.add(id);
      else next.delete(id);
      return next;
    });

  const add = (type: PathType) => {
    const id = newPathId(type, paths);
    onChange([...paths, { id, name: PATH_TYPE_LABELS[type], type, summary: '' }]);
    setEditing(id, true);
    setAdded((current) => new Set(current).add(id));
  };

  const remove = (index: number) => {
    const neighbour = paths[index + 1] ?? paths[index - 1];
    focusNext.current = neighbour?.id ?? null;
    setEditing(paths[index]!.id, false);
    onChange(paths.filter((_, i) => i !== index));
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) onSubmit();
      }}
    >
      <div>
        <h1 className="font-display text-3xl leading-[1.1] sm:text-4xl">The futures to compare</h1>
        <p className="mt-2 text-muted">
          Each path is one way your decision could go. We&apos;ll simulate them side by side.
        </p>
      </div>

      <Card className="overflow-hidden p-0 shadow-pop sm:p-0">
        <ol className="divide-y divide-border">
          {paths.map((path, index) => {
            const Icon = PATH_TYPE_ICONS[path.type];
            const editing = open.has(path.id);
            const label = path.name.trim() || `path ${index + 1}`;
            return (
              <li
                key={path.id}
                data-testid="path-option"
                className={cn(
                  'flex flex-col gap-5 px-5 py-5 transition-colors sm:px-7',
                  editing && 'bg-surface-muted/35',
                  added.has(path.id) &&
                    'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500',
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Phones skip the icon so the name and summary get the width. */}
                  <span className="hidden size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent sm:flex">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h2 className="flex items-center gap-2 text-base leading-snug font-semibold">
                      <PathSwatch index={index} />
                      <span className="min-w-0 break-words">
                        {path.name.trim() || <span className="text-muted">Untitled path</span>}
                      </span>
                    </h2>
                    <p className="text-sm text-muted">{PATH_TYPE_LABELS[path.type]}</p>
                    {path.summary.trim() && !editing ? (
                      <p className="mt-1 text-sm text-foreground/85">{path.summary}</p>
                    ) : null}
                  </div>
                  <div className="-mt-1 -mr-2 flex shrink-0 items-center">
                    {!editing ? (
                      <Button
                        id={`path-edit-${path.id}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(path.id, true)}
                        aria-label={`Edit ${label}`}
                      >
                        <Pencil />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={paths.length <= 1}
                      onClick={() => remove(index)}
                      aria-label={`Remove ${label}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                {editing ? (
                  <div className="sm:pl-15">
                    <PathEditor
                      path={path}
                      onChange={(patch) => update(path.id, patch)}
                      onDone={() => {
                        focusNext.current = path.id;
                        setEditing(path.id, false);
                      }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </Card>

      {paths.length < maxPaths ? (
        <section aria-labelledby="add-path" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="add-path" className="text-base font-semibold">
              Add another path
            </h2>
            <p className="text-sm text-muted tabular-nums">
              {paths.length} of {maxPaths} on your plan
            </p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {PATH_TYPES.map((type) => {
              const Icon = PATH_TYPE_ICONS[type];
              return (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => add(type)}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-sm shadow-card transition-colors outline-none hover:border-accent/50 hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="size-4 text-accent" aria-hidden />
                    <Icon className="size-4 text-muted" aria-hidden />
                    <span className="sr-only">Add: </span>
                    {PATH_TYPE_LABELS[type]}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-muted">
          You&apos;re comparing {maxPaths} paths, the most your plan allows. Remove one to try a
          different kind
          {upgrade ? (
            <>
              , or{' '}
              <button
                type="button"
                className="font-medium text-accent underline-offset-4 hover:underline"
                onClick={() => openGate({ kind: 'upgrade', reason: 'paths', plan: upgrade })}
              >
                compare up to {PLANS[upgrade].maxPaths} with {PLANS[upgrade].name}
              </button>
            </>
          ) : null}
          .
        </p>
      )}

      {error ? (
        <Notice variant="error" title="We couldn't build your simulation">
          {error}
        </Notice>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3">
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft />
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={invalid}>
          Build my simulation
          <ArrowRight />
        </Button>
      </div>
    </form>
  );
}
