'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronDown, Lock, Pencil, Play, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Assumption, DecisionModel, PlanId, SimulationDto } from '@futuria/shared';
import { Notice } from '@/components/notice';
import { PathSwatch } from '@/components/results/path-color';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { Stepper } from '@/components/wizard/stepper';
import { ValueEditor } from '@/components/wizard/value-editor';
import { api, errorMessage, queryKeys } from '@/lib/api';
import { openGate } from '@/lib/gate-events';
import { useNavigate } from '@/lib/navigation';
import {
  type FieldGroup,
  type ModelField,
  estimateKeys,
  groupFields,
  restoreField,
  setFieldValue,
  valueParts,
} from '@/lib/model-fields';
import { PATH_TYPE_HINTS } from '@/lib/paths';
import { horizonUpgrade, isSignupRequired } from '@/lib/plan-gates';
import { cn } from '@/lib/utils';

const HORIZONS = [12, 24, 36, 60] as const;
/** Set on the return URL of the signup gate: run the simulation as soon as the account is back. */
export const RUN_AFTER_SIGNUP = 'run';

/** DOM ids from field keys like "freelance:freelance.hourlyRate". */
const domId = (key: string) => key.replace(/[^a-zA-Z0-9-]/g, '-');

export function SourceBadge({ assumption }: { assumption: Assumption | undefined }) {
  if (!assumption) return null;
  switch (assumption.source) {
    case 'ai_estimate':
      return (
        <Badge variant="estimate" title={`AI estimate, ${assumption.confidence} confidence`}>
          <Sparkles aria-hidden />
          AI estimate
          {assumption.confidence === 'low' ? ', low confidence' : ''}
        </Badge>
      );
    case 'user':
      return <Badge variant="success">From you</Badge>;
    default:
      return <Badge>Typical default</Badge>;
  }
}

/** The value, right-aligned on wider screens; a range shows its most likely point beneath. */
function FieldValue({ field, currency }: { field: ModelField; currency: string }) {
  const { main, likely } = valueParts(field.value, field.meta, currency);
  return (
    <span className="flex shrink-0 flex-col tabular-nums sm:items-end sm:text-right">
      <span className="font-semibold">{main}</span>
      {likely ? <span className="text-xs text-muted">most likely {likely}</span> : null}
    </span>
  );
}

interface RowActions {
  editing: boolean;
  onEdit: () => void;
  onSave: (value: ModelField['value']) => void;
  onCancel: () => void;
}

function Editor({
  field,
  onSave,
  onCancel,
}: { field: ModelField } & Pick<RowActions, 'onSave' | 'onCancel'>) {
  return (
    <ValueEditor
      idPrefix={domId(field.key)}
      value={field.value}
      meta={field.meta}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

function EditButton({ field, onEdit }: { field: ModelField; onEdit: () => void }) {
  return (
    <Button
      id={`edit-${domId(field.key)}`}
      variant="ghost"
      size="sm"
      onClick={onEdit}
      aria-label={`Edit ${field.label}`}
    >
      <Pencil />
      Edit
    </Button>
  );
}

/**
 * An AI estimate on the checklist. Open, it shows Claude's reasoning with "Looks right" and
 * "Edit"; once confirmed or changed it folds to one line with "Undo".
 */
function EstimateRow({
  field,
  currency,
  editing,
  onEdit,
  onSave,
  onCancel,
  onConfirm,
  onUndo,
}: {
  field: ModelField;
  currency: string;
  onConfirm: () => void;
  onUndo: () => void;
} & RowActions) {
  const checked = field.assumption?.source !== 'ai_estimate';
  const id = domId(field.key);
  return (
    <li
      data-testid="assumption"
      data-source={field.assumption?.source ?? 'none'}
      className={cn(
        'flex flex-col gap-3 px-5 py-4 transition-colors duration-300 sm:px-7',
        !checked &&
          'border-l-4 border-l-estimate-border bg-estimate-surface/35 pl-4 sm:pl-6 sm:py-5',
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-start gap-3">
          {checked ? (
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-surface text-success motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300">
              <Check className="size-3" strokeWidth={3} aria-hidden />
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <span data-testid="assumption-label" className="font-medium">
              {field.label}
            </span>
            {checked ? (
              <span className="text-xs text-success">Checked</span>
            ) : (
              <SourceBadge assumption={field.assumption} />
            )}
          </div>
        </div>
        <div
          className={cn(
            'flex items-center justify-between gap-3 sm:justify-end',
            checked && 'pl-8 sm:pl-0',
          )}
        >
          <FieldValue field={field} currency={currency} />
          {checked && !editing ? (
            <div className="flex shrink-0">
              <Button
                id={`undo-${id}`}
                variant="ghost"
                size="sm"
                onClick={onUndo}
                aria-label={`Undo: ${field.label}`}
              >
                <Undo2 />
                Undo
              </Button>
              <EditButton field={field} onEdit={onEdit} />
            </div>
          ) : null}
        </div>
      </div>

      {!checked && field.assumption?.rationale ? (
        <p className="text-sm text-muted">{field.assumption.rationale}</p>
      ) : null}

      {editing ? (
        <Editor field={field} onSave={onSave} onCancel={onCancel} />
      ) : !checked ? (
        <div className="flex flex-wrap gap-2">
          <Button
            id={`confirm-${id}`}
            variant="secondary"
            size="sm"
            onClick={onConfirm}
            aria-label={`Looks right: ${field.label}`}
          >
            <Check />
            Looks right
          </Button>
          <EditButton field={field} onEdit={onEdit} />
        </div>
      ) : null}
    </li>
  );
}

/** A value from the person's answers or a typical default: one line until edited. */
function ValueRow({
  field,
  currency,
  editing,
  onEdit,
  onSave,
  onCancel,
}: { field: ModelField; currency: string } & RowActions) {
  const source = field.assumption?.source;
  return (
    <li
      data-testid="assumption"
      data-source={source ?? 'none'}
      className="flex flex-col gap-3 px-5 py-3.5 sm:px-7"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col">
          <span data-testid="assumption-label" className="font-medium">
            {field.label}
          </span>
          {source === 'user' || source === 'default' ? (
            <span className="text-xs text-muted">
              {source === 'user' ? 'From your answers' : 'Typical default'}
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <FieldValue field={field} currency={currency} />
          {!editing ? <EditButton field={field} onEdit={onEdit} /> : null}
        </div>
      </div>
      {editing ? (
        <>
          {field.assumption?.rationale ? (
            <p className="text-sm text-muted">{field.assumption.rationale}</p>
          ) : null}
          <Editor field={field} onSave={onSave} onCancel={onCancel} />
        </>
      ) : null}
    </li>
  );
}

function GroupCard({
  group,
  pathIndex,
  toCheck,
  currency,
  editingKey,
  onEdit,
  onSave,
  onCancel,
  onConfirm,
  onUndo,
}: {
  group: FieldGroup;
  /** Position among the paths (for the colour), or null for the starting point. */
  pathIndex: number | null;
  toCheck: ReadonlySet<string>;
  currency: string;
  editingKey: string | null;
  onEdit: (field: ModelField) => void;
  onSave: (field: ModelField, value: ModelField['value']) => void;
  onCancel: (field: ModelField) => void;
  onConfirm: (field: ModelField) => void;
  onUndo: (field: ModelField) => void;
}) {
  // The checklist was fixed when the step opened, so confirmed rows stay where they are.
  const estimates = group.fields.filter((f) => toCheck.has(f.key));
  const rest = group.fields.filter((f) => !toCheck.has(f.key));
  const open = estimates.filter((f) => f.assumption?.source === 'ai_estimate').length;
  const fromYou = rest.filter((f) => f.assumption?.source === 'user').length;
  const actions = (field: ModelField): RowActions => ({
    editing: editingKey === field.key,
    onEdit: () => onEdit(field),
    onSave: (value) => onSave(field, value),
    onCancel: () => onCancel(field),
  });

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-7 sm:py-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            {pathIndex !== null ? <PathSwatch index={pathIndex} /> : null}
            {group.title}
          </h2>
          <p className="text-sm text-muted">
            {group.type ? PATH_TYPE_HINTS[group.type] : 'Shared by every path.'}
          </p>
        </div>
        {estimates.length ? (
          open ? (
            <Badge variant="estimate">{open} to check</Badge>
          ) : (
            <Badge variant="success">
              <Check aria-hidden />
              All checked
            </Badge>
          )
        ) : null}
      </div>

      {estimates.length ? (
        <ul className="divide-y divide-border">
          {estimates.map((field) => (
            <EstimateRow
              key={field.key}
              field={field}
              currency={currency}
              {...actions(field)}
              onConfirm={() => onConfirm(field)}
              onUndo={() => onUndo(field)}
            />
          ))}
        </ul>
      ) : null}

      {rest.length ? (
        <details className={cn('group/more', estimates.length && 'border-t border-border')}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-sm select-none hover:bg-surface-muted/50 sm:px-7 [&::-webkit-details-marker]:hidden">
            <span className="flex flex-col">
              <span className="font-medium">
                {estimates.length ? `${rest.length} more values` : `${rest.length} values`}
              </span>
              <span className="text-muted">
                {fromYou && rest.length - fromYou
                  ? `${fromYou} from your answers and ${rest.length - fromYou} typical ${rest.length - fromYou === 1 ? 'default' : 'defaults'}`
                  : fromYou
                    ? 'From your answers'
                    : 'Typical defaults'}
              </span>
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-muted transition-transform duration-300 group-open/more:rotate-180"
              aria-hidden
            />
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {rest.map((field) => (
              <ValueRow key={field.key} field={field} currency={currency} {...actions(field)} />
            ))}
          </ul>
        </details>
      ) : null}

      {group.notes.length ? (
        <div className="border-t border-border px-5 py-4 text-sm sm:px-7">
          <p className="font-medium">Other notes</p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {group.notes.map((note) => (
              <li key={note.id}>
                {note.label}: {note.rationale}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

/** The checklist's progress: how many of the AI estimates the person has looked at. */
function EstimateProgress({ checked, total }: { checked: number; total: number }) {
  const done = checked === total;
  return (
    <Card className="border-gradient flex flex-col gap-3 border-transparent">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold">
          {done ? `All ${total} estimates checked` : 'Check our estimates'}
        </h2>
        <p className="text-sm font-semibold tabular-nums" aria-live="polite">
          <span className={done ? 'text-success' : 'text-accent'}>{checked}</span>
          <span className="text-muted"> of {total} checked</span>
        </p>
      </div>
      <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-border">
        <span
          className="block h-full rounded-full bg-[linear-gradient(90deg,var(--grad-1),var(--grad-2))] transition-[width] duration-500 ease-[var(--ease-out)]"
          style={{ width: `${(checked / total) * 100}%` }}
        />
      </span>
      <p className="text-sm text-muted">
        {done
          ? 'Run the simulation when you’re ready. You can still change any value below.'
          : `You didn’t give us ${total === 1 ? 'this value' : 'these values'}, so we estimated ${total === 1 ? 'it' : 'them'}. Confirm each with “Looks right”, or change it: you know your situation better.`}
      </p>
    </Card>
  );
}

/**
 * Wizard step 4: "Here's what we assumed". The AI estimates form a checklist (confirm or edit
 * each one); the person's own answers and typical defaults fold away. Every value is editable.
 */
export function AssumptionsStep({
  simulation,
  plan,
  anonymous,
  onEditAnswers,
}: {
  simulation: SimulationDto;
  plan: PlanId;
  /** A signed-out visitor: running is the signup gate (journey step 5). */
  anonymous: boolean;
  onEditAnswers?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const original = simulation.model!;
  const [model, setModel] = useState<DecisionModel>(original);
  const [dirty, setDirty] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const groups = useMemo(() => groupFields(model), [model]);
  const [toCheck] = useState(() => estimateKeys(groupFields(original)));
  const checked = groups
    .flatMap((g) => g.fields)
    .filter((f) => toCheck.has(f.key) && f.assumption?.source !== 'ai_estimate').length;
  const currency = model.baseline.currency;

  // After a row changes shape, keep keyboard focus on the button that took the old one's place.
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    focusNext.current = null;
    document.getElementById(id)?.focus();
  });

  const change = (next: DecisionModel) => {
    setModel(next);
    setDirty(true);
  };
  const afterRow = (field: ModelField, kind: 'confirm' | 'undo' | 'edit') => {
    focusNext.current = `${kind}-${domId(field.key)}`;
  };

  const save = useMutation({
    mutationFn: () => api.updateModel(simulation.id, model),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.simulation(simulation.id), updated);
      setDirty(false);
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      if (dirty) await api.updateModel(simulation.id, model);
      return api.run(simulation.id);
    },
    onSuccess: (queued) => {
      queryClient.setQueryData(queryKeys.simulation(simulation.id), queued);
      void queryClient.invalidateQueries({ queryKey: queryKeys.simulations });
      navigate(`/s/${simulation.id}`);
    },
  });

  const pathCount = model.paths.length;
  const returnTo = `/new/${simulation.id}?${RUN_AFTER_SIGNUP}=1`;
  // The signup gate: keep the edits, then ask for an account. Running comes after.
  const gate = useMutation({
    mutationFn: async () => {
      if (dirty) {
        const updated = await api.updateModel(simulation.id, model);
        queryClient.setQueryData(queryKeys.simulation(simulation.id), updated);
        setDirty(false);
      }
    },
    onSuccess: () => openGate({ kind: 'signup', returnTo, pathCount }),
  });

  // Back from the signup gate with an account: start the run once.
  const autoRun = useRef(false);
  useEffect(() => {
    if (anonymous || autoRun.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(RUN_AFTER_SIGNUP) !== '1') return;
    autoRun.current = true;
    url.searchParams.delete(RUN_AFTER_SIGNUP);
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
    run.mutate();
  }, [anonymous, run]);

  const busy = save.isPending || run.isPending || run.isSuccess || gate.isPending;
  // The signup gate opens as a dialog; its 401 isn't an error to show here.
  const error = [run.error, save.error, gate.error].find((e) => e && !isSignupRequired(e));
  const chooseHorizon = (months: number) => {
    const upgrade = horizonUpgrade(months, plan);
    if (upgrade) openGate({ kind: 'upgrade', reason: 'horizon', plan: upgrade });
    else change({ ...model, horizonMonths: months });
  };

  return (
    // Controls scroll (and focus) into view above the fixed action bar, never under it.
    <div className="flex flex-col gap-6 pb-24 [&_:is(button,input,summary)]:scroll-mb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Stepper current="Assumptions" />
        {onEditAnswers ? (
          <Button variant="ghost" size="sm" onClick={onEditAnswers} disabled={busy}>
            <ArrowLeft />
            Change answers
          </Button>
        ) : null}
      </div>
      <div>
        <h1 className="font-display text-3xl leading-[1.1] sm:text-4xl">
          Here&apos;s what we assumed
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          The simulation uses these numbers. Ranges mean we&apos;re unsure: each simulated future
          picks a value inside the range.
        </p>
      </div>

      {toCheck.size ? <EstimateProgress checked={checked} total={toCheck.size} /> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p id="horizon-label" className="text-sm font-medium">
          How far ahead to simulate
        </p>
        <Segmented
          aria-labelledby="horizon-label"
          value={String(model.horizonMonths)}
          onValueChange={(value) => chooseHorizon(Number(value))}
        >
          {HORIZONS.map((h) => {
            const locked = horizonUpgrade(h, plan) !== null;
            return (
              <SegmentedItem
                key={h}
                value={String(h)}
                aria-label={locked ? `${h} months (paid plans)` : `${h} months`}
                // Four choices fit a phone: "24 mo" there, "24 months" from sm up.
                className="gap-1 px-2.5 sm:gap-1.5 sm:px-3.5"
              >
                {locked ? <Lock className="size-3 shrink-0" aria-hidden /> : null}
                {h}
                <span className="sm:hidden">mo</span>
                <span className="hidden sm:inline">months</span>
              </SegmentedItem>
            );
          })}
        </Segmented>
      </div>

      {groups.map((group, index) => (
        <GroupCard
          key={group.pathId ?? 'baseline'}
          group={group}
          // Groups are the starting point, then each path in model order.
          pathIndex={group.pathId === null ? null : index - 1}
          toCheck={toCheck}
          currency={currency}
          editingKey={editingKey}
          onEdit={(field) => setEditingKey(field.key)}
          onCancel={(field) => {
            afterRow(field, 'edit');
            setEditingKey(null);
          }}
          onSave={(field, value) => {
            afterRow(field, toCheck.has(field.key) ? 'undo' : 'edit');
            change(setFieldValue(model, field, value));
            setEditingKey(null);
          }}
          onConfirm={(field) => {
            afterRow(field, 'undo');
            change(setFieldValue(model, field, field.value));
          }}
          onUndo={(field) => {
            afterRow(field, 'confirm');
            change(restoreField(model, original, field.key));
          }}
        />
      ))}

      {error ? (
        <Notice variant="error" title="That didn't work">
          {errorMessage(error)}
        </Notice>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="text-sm text-muted">
            {dirty ? 'You have unsaved changes' : `Horizon: ${model.horizonMonths} months`}
          </span>
          <div className="flex gap-2">
            {dirty ? (
              <Button variant="secondary" onClick={() => save.mutate()} disabled={busy}>
                Save
              </Button>
            ) : null}
            {anonymous ? (
              <Button onClick={() => gate.mutate()} disabled={busy || editingKey !== null}>
                <Play />
                {gate.isPending ? 'Saving…' : `See my ${pathCount} futures`}
              </Button>
            ) : (
              <Button onClick={() => run.mutate()} disabled={busy || editingKey !== null}>
                <Play />
                {run.isPending || run.isSuccess ? 'Starting…' : 'Run simulation'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
