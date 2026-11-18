import type { CSSProperties } from 'react';
import { type PathResult, SCENARIO_PERCENTILE, type ScenarioKey } from '@futuria/shared';
import { CountUp } from '@/components/motion/count-up';
import { PathSwatch } from '@/components/results/path-color';
import { RiskBadge, RiskMeter } from '@/components/results/risk';
import { formatMoney, formatMonth } from '@/lib/format';
import { cn } from '@/lib/utils';

const SAVINGS_LABEL: Record<ScenarioKey, string> = {
  optimistic: 'Savings, optimistic',
  realistic: 'Typical savings',
  pessimistic: 'Savings, pessimistic',
};

/** Sustained break-even: income covers expenses from that month to the horizon. */
function breakEvenText(probability: number, month: number | null): string {
  if (probability < 0.5 || month === null) return 'Not in most futures';
  return month <= 1 ? 'From the start' : formatMonth(month);
}

/**
 * One compact card per path: the chance of running out, the savings at the horizon (for the
 * selected scenario) and when income starts covering costs. Used by the results page and the
 * landing page's live demo.
 */
export function PathCards({
  paths,
  colorIndex,
  scenario,
  currency,
  horizonMonths,
  live = false,
}: {
  paths: PathResult[];
  colorIndex: Record<string, number>;
  scenario: ScenarioKey;
  currency: string;
  horizonMonths: number;
  /** Announce changes to screen readers (the demo, where sliders are the whole point). */
  live?: boolean;
}) {
  const pct = SCENARIO_PERCENTILE[scenario];
  return (
    <ul
      className={cn(
        'grid gap-3',
        paths.length === 2 || paths.length === 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
      )}
      aria-live={live ? 'polite' : undefined}
    >
      {paths.map((path, i) => {
        const m = path.metrics;
        const index = colorIndex[path.pathId] ?? 0;
        const cash = pct === 'p25' || pct === 'p75' ? m.cashAtHorizon.p50 : m.cashAtHorizon[pct];
        return (
          <li
            key={path.pathId}
            className="rise"
            style={{ '--rise-delay': `${i * 90}ms` } as CSSProperties}
          >
            <section
              className="flex h-full flex-col rounded-2xl border border-border bg-surface-muted/40 p-4 transition-colors duration-300 hover:border-border-strong"
              data-testid="path-card"
            >
              <h3 className="flex items-start gap-2 text-sm leading-snug font-semibold">
                <PathSwatch index={index} className="mt-1.5" />
                {path.name}
              </h3>
              <p className="mt-auto pt-4 text-xs text-muted">Chance of running out</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="font-display text-4xl leading-none">
                  <CountUp value={m.probRunOut} format="percent" testId="prob-run-out" />
                </p>
                <RiskBadge probRunOut={m.probRunOut} />
              </div>
              <RiskMeter probRunOut={m.probRunOut} className="mt-3" />
              <dl className="mt-3 flex flex-col gap-1.5 text-xs">
                {[
                  [
                    `${SAVINGS_LABEL[scenario]}, month ${horizonMonths}`,
                    formatMoney(cash, currency),
                  ],
                  ['Income covers costs', breakEvenText(m.probBreakEven, m.medianBreakEvenMonth)],
                ].map(([term, value]) => (
                  <div key={term} className="flex justify-between gap-2">
                    <dt className="text-muted">{term}</dt>
                    <dd className="text-right font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </li>
        );
      })}
    </ul>
  );
}
