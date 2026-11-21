'use client';

import { Lightbulb, RotateCcw, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PathResult } from '@futuria/shared';
import { PathSwatch } from '@/components/results/path-color';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { formatPercent, formatValue } from '@/lib/format';
import type { SliderDef, SliderGroup, TweakValues } from '@/lib/tweaks';
import { cn } from '@/lib/utils';

export function SliderRow({
  idPrefix,
  slider,
  value,
  currency,
  onChange,
}: {
  idPrefix: string;
  slider: SliderDef;
  value: number;
  currency: string;
  onChange: (value: number) => void;
}) {
  const changed = Math.abs(value - slider.base) > 1e-9;
  const fmt = (n: number) => formatValue(n, slider.unit, currency);
  const id = `${idPrefix}-${slider.id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {slider.label}
        </label>
        <span
          className={cn(
            'shrink-0 text-sm whitespace-nowrap tabular-nums',
            changed ? 'font-semibold' : 'text-muted',
          )}
        >
          {fmt(value)}
        </span>
      </div>
      <Slider
        id={id}
        aria-label={slider.label}
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={[value]}
        onValueChange={([v]) => onChange(v ?? slider.base)}
      />
      {changed ? (
        <p className="text-xs text-muted">
          Assumed {fmt(slider.base)}.{' '}
          <button
            type="button"
            className="text-accent underline-offset-2 hover:underline"
            onClick={() => onChange(slider.base)}
          >
            Undo
          </button>
        </p>
      ) : null}
    </div>
  );
}

/** "Tweak the future" with a live dot that pulses while the engine recomputes. */
export function TweakHeading({
  computing,
  level: Heading = 'h2',
  children,
}: {
  computing: boolean;
  level?: 'h2' | 'h3';
  /** The line under the title. */
  children: ReactNode;
}) {
  return (
    <div>
      <Heading className="flex items-center gap-2 font-semibold">
        <span className="relative flex size-2">
          <span
            className={cn(
              'absolute inline-flex size-full rounded-full bg-success opacity-60',
              computing && 'motion-safe:animate-ping',
            )}
          />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        Tweak the future
      </Heading>
      <p className="mt-1 text-xs text-muted">{children}</p>
    </div>
  );
}

/** A dashed "try this first" tip. */
export function TweakHint({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2.5 rounded-xl border border-dashed border-border-strong p-3 text-xs text-muted">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-estimate" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Each path's chance of running out, before the tweaks and now. */
export function RiskChange({
  before,
  after,
  colorIndex,
}: {
  before: PathResult[];
  after: PathResult[];
  colorIndex: Record<string, number>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95">
      <p className="text-xs font-medium text-muted">Chance of running out, before → now</p>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
        {after.map((path) => {
          const was = before.find((p) => p.pathId === path.pathId);
          return (
            <li key={path.pathId} className="flex items-center gap-2">
              <PathSwatch index={colorIndex[path.pathId] ?? 0} />
              <span className="min-w-0 flex-1 truncate" title={path.name}>
                {path.name}
              </span>
              <span className="text-muted tabular-nums">
                {was ? formatPercent(was.metrics.probRunOut) : '–'}
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
              <span className="font-semibold tabular-nums">
                {formatPercent(path.metrics.probRunOut)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * "Tweak the future": sliders recompute every chart on this device, instantly and for free.
 * "Update story" saves the tweaks and asks Claude for a new story about them.
 *
 * Everything flows top to bottom with no inner scroll: as a `panel` (beside the results) the
 * frame grows to fit every slider; in a `sheet` the sheet itself scrolls.
 */
export function TweakPanel({
  idPrefix,
  variant,
  groups,
  values,
  currency,
  colorIndex,
  tweaked,
  computing,
  updating,
  hint,
  before,
  after,
  onChange,
  onReset,
  onUpdateStory,
}: {
  /** Unique per rendered copy (desktop panel, phone sheet). */
  idPrefix: string;
  /** The sheet has its own "Tweak the future" title. */
  variant: 'panel' | 'sheet';
  groups: SliderGroup[];
  values: TweakValues;
  currency: string;
  colorIndex: Record<string, number>;
  tweaked: boolean;
  computing: boolean;
  updating: boolean;
  /** Shown before any slider moves. */
  hint?: ReactNode;
  /** The stored results and the tweaked ones, for the before → now summary. */
  before: PathResult[];
  after: PathResult[];
  onChange: (id: string, value: number) => void;
  onReset: () => void;
  onUpdateStory: () => void;
}) {
  const intro = 'Drag a slider: every number re-runs right here in your browser, for free.';
  const panel = variant === 'panel';
  return (
    <div className="flex flex-col gap-5">
      {panel ? (
        <TweakHeading computing={computing}>{intro}</TweakHeading>
      ) : (
        <p className="text-sm text-muted">{intro}</p>
      )}
      {/* On top and always there, so each slider's effect shows while it moves. */}
      <RiskChange before={before} after={after} colorIndex={colorIndex} />
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.pathId ?? 'baseline'} className="flex flex-col gap-4">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-muted">
              {group.pathId ? <PathSwatch index={colorIndex[group.pathId] ?? 0} /> : null}
              {group.title}
            </h3>
            {group.sliders.map((slider) => (
              <SliderRow
                key={slider.id}
                idPrefix={idPrefix}
                slider={slider}
                value={values[slider.id] ?? slider.base}
                currency={currency}
                onChange={(v) => onChange(slider.id, v)}
              />
            ))}
          </section>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {tweaked ? (
          <Button onClick={onUpdateStory} disabled={updating}>
            <Sparkles />
            {updating ? 'Starting…' : 'Update the story'}
          </Button>
        ) : hint ? (
          <TweakHint>{hint}</TweakHint>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={onReset}
          disabled={!tweaked || updating}
        >
          <RotateCcw />
          Reset to my assumptions
        </Button>
        {tweaked ? (
          <p className="text-xs text-muted">
            Updating saves these values and writes a new story about them (about a minute).
          </p>
        ) : null}
      </div>
    </div>
  );
}
