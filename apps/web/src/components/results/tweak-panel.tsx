'use client';

import { RotateCcw, Sparkles } from 'lucide-react';
import { PathSwatch } from '@/components/results/path-color';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { formatValue } from '@/lib/format';
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

/**
 * "Tweak the future": sliders recompute every chart on this device, instantly and for free.
 * "Update story" saves the tweaks and asks Claude for a new story about them.
 */
export function TweakPanel({
  idPrefix,
  groups,
  values,
  currency,
  colorIndex,
  tweaked,
  computing,
  updating,
  onChange,
  onReset,
  onUpdateStory,
}: {
  /** Unique per rendered copy (desktop panel, phone sheet). */
  idPrefix: string;
  groups: SliderGroup[];
  values: TweakValues;
  currency: string;
  colorIndex: Record<string, number>;
  tweaked: boolean;
  computing: boolean;
  updating: boolean;
  onChange: (id: string, value: number) => void;
  onReset: () => void;
  onUpdateStory: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        Move a slider and every number updates. It runs on your device and costs nothing.
        {computing ? <span className="ml-1 text-foreground">Recomputing…</span> : null}
      </p>
      {groups.map((group) => (
        <section key={group.pathId ?? 'baseline'} className="flex flex-col gap-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-muted">
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
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Button onClick={onUpdateStory} disabled={!tweaked || updating}>
          <Sparkles />
          {updating ? 'Starting…' : 'Update the story'}
        </Button>
        <Button variant="ghost" onClick={onReset} disabled={!tweaked || updating}>
          <RotateCcw />
          Reset to my assumptions
        </Button>
        <p className="text-xs text-muted">
          Updating saves these values and writes a new story about them (about a minute).
        </p>
      </div>
    </div>
  );
}
