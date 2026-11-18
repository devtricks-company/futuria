'use client';

import { RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DecisionModel, SimulationResult } from '@futuria/shared';
import { FanChart } from '@/components/results/fan-chart';
import { PathCards } from '@/components/results/path-cards';
import { RiskChange, SliderRow, TweakHeading, TweakHint } from '@/components/results/tweak-panel';
import { Button } from '@/components/ui/button';
import { useEngine } from '@/engine/use-engine';
import { DEMO_SEED, DEMO_SLIDERS } from '@/lib/demo';
import {
  type SliderDef,
  type TweakValues,
  activeTweaks,
  applyTweaks,
  slidersFor,
} from '@/lib/tweaks';

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
        <PathCards
          paths={result.paths}
          colorIndex={colorIndex}
          scenario="realistic"
          currency={result.currency}
          horizonMonths={horizon}
          live
        />
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
        <TweakHeading computing={engine.computing} level="h3">
          Drag a slider: {(result.runs * result.paths.length).toLocaleString('en-US')} futures
          re-run right here in your browser.
        </TweakHeading>
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
            <RiskChange before={initial.paths} after={result.paths} colorIndex={colorIndex} />
          ) : topDriver ? (
            <TweakHint>
              Try <strong className="font-medium text-foreground">{topDriver.toLowerCase()}</strong>{' '}
              first: it moves Sara&apos;s freelance outcome more than anything else.
            </TweakHint>
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
