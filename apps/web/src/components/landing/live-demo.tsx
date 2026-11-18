'use client';

import { Lightbulb, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DecisionModel, SimulationResult } from '@futuria/shared';
import { CountUp } from '@/components/motion/count-up';
import { FanChart } from '@/components/results/fan-chart';
import { PathSwatch } from '@/components/results/path-color';
import { RiskBadge, RiskMeter } from '@/components/results/risk';
import { SliderRow } from '@/components/results/tweak-panel';
import { Button } from '@/components/ui/button';
import { useEngine } from '@/engine/use-engine';
import { DEMO_SEED, DEMO_SLIDERS } from '@/lib/demo';
import { formatMoney, formatPercent } from '@/lib/format';
import {
  type SliderDef,
  type TweakValues,
  activeTweaks,
  applyTweaks,
  slidersFor,
} from '@/lib/tweaks';
import { cn } from '@/lib/utils';

/**
 * Sara's three futures, live: the same cards, chart and engine as the results page. The first
 * render uses the numbers computed when the page was built; a slider re-runs the engine in a Web
 * Worker with the same seed.
 */
export function LiveDemo({
  model,
  initial,
  topDriver,
}: {
  model: DecisionModel;
  initial: SimulationResult;
  /** The assumption that moves the freelance outcome most, e.g. "Billable hours per week". */
  topDriver?: string;
}) {
  const all = useMemo(() => slidersFor(model).flatMap((g) => g.sliders), [model]);
  const sliders = useMemo(
    () =>
      DEMO_SLIDERS.flatMap(({ id, label }): SliderDef[] => {
        const slider = all.find((s) => s.id === id);
        return slider ? [{ ...slider, label }] : [];
      }),
    [all],
  );
  const [values, setValues] = useState<TweakValues>({});
  const tweaks = useMemo(() => activeTweaks(values, all), [values, all]);
  const tweaked = Object.keys(tweaks).length > 0;
  const tweakedModel = useMemo(
    () => (tweaked ? applyTweaks(model, tweaks) : null),
    [model, tweaks, tweaked],
  );
  const engine = useEngine(tweakedModel, DEMO_SEED);
  const result = (tweaked ? engine.result : null) ?? initial;
  const colorIndex = Object.fromEntries(model.paths.map((p, i) => [p.id, i]));
  const horizon = result.horizonMonths;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_17.5rem]">
      <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
        <ul className="grid gap-3 sm:grid-cols-3" aria-live="polite">
          {result.paths.map((path) => (
            <li
              key={path.pathId}
              className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface-muted/40 p-4"
            >
              <p className="flex items-start gap-2 text-sm leading-snug font-semibold">
                <PathSwatch index={colorIndex[path.pathId] ?? 0} className="mt-1.5" />
                {path.name}
              </p>
              <p className="mt-auto pt-3 text-xs text-muted">Chance of running out</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-display text-4xl leading-none">
                  <CountUp value={path.metrics.probRunOut} format="percent" />
                </span>
                <RiskBadge probRunOut={path.metrics.probRunOut} />
              </div>
              <RiskMeter probRunOut={path.metrics.probRunOut} className="mt-3" />
              <p className="mt-3 flex justify-between gap-2 text-xs text-muted">
                Typical savings, month {horizon}
                <span className="font-medium text-foreground tabular-nums">
                  {formatMoney(path.metrics.cashAtHorizon.p50, result.currency)}
                </span>
              </p>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl border border-border bg-surface-muted/40 p-4 pb-2">
          <FanChart
            paths={result.paths}
            colorIndex={colorIndex}
            scenario="realistic"
            currency={result.currency}
            horizonMonths={horizon}
            emergencyFloor={model.baseline.emergencyFloor}
          />
        </div>
      </div>

      <aside
        aria-label="Tweak Sara's numbers"
        className="flex flex-col gap-5 border-t border-border bg-surface-muted/60 p-5 sm:p-6 lg:border-t-0 lg:border-l"
      >
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <span className="relative flex size-2">
              <span
                className={cn(
                  'absolute inline-flex size-full rounded-full bg-success opacity-60',
                  engine.computing && 'motion-safe:animate-ping',
                )}
              />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            Tweak the future
          </p>
          <p className="mt-1 text-xs text-muted">
            Drag a slider: 3,000 futures re-run right here in your browser.
          </p>
        </div>
        {sliders.map((slider) => (
          <SliderRow
            key={slider.id}
            idPrefix="demo"
            slider={slider}
            value={values[slider.id] ?? slider.base}
            currency={result.currency}
            onChange={(v) => setValues((current) => ({ ...current, [slider.id]: v }))}
          />
        ))}
        <div className="mt-auto flex flex-col gap-4">
          {tweaked ? (
            <div className="rounded-2xl border border-border bg-surface p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95">
              <p className="text-xs font-medium text-muted">Chance of running out, before → now</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {result.paths.map((path) => {
                  const before = initial.paths.find((p) => p.pathId === path.pathId);
                  return (
                    <li key={path.pathId} className="flex items-center gap-2">
                      <PathSwatch index={colorIndex[path.pathId] ?? 0} />
                      <span className="min-w-0 flex-1 truncate" title={path.name}>
                        {path.name}
                      </span>
                      <span className="text-muted tabular-nums">
                        {before ? formatPercent(before.metrics.probRunOut) : '–'}
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
          ) : topDriver ? (
            <p className="flex gap-2.5 rounded-xl border border-dashed border-border-strong p-3 text-xs text-muted">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-estimate" aria-hidden />
              <span>
                Try{' '}
                <strong className="font-medium text-foreground">{topDriver.toLowerCase()}</strong>{' '}
                first: it moves Sara&apos;s freelance outcome more than anything else.
              </span>
            </p>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => setValues({})}
            disabled={!tweaked}
          >
            <RotateCcw />
            Reset Sara&apos;s numbers
          </Button>
        </div>
      </aside>
    </div>
  );
}
