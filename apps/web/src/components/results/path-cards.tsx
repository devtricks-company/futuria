import type { CSSProperties } from 'react';
import { type PathResult, SCENARIO_PERCENTILE, type ScenarioKey } from '@futuria/shared';
import { CountUp } from '@/components/motion/count-up';
import { PathSwatch, pathColor } from '@/components/results/path-color';
import { RiskBadge, RiskMeter } from '@/components/results/risk';
import { formatMoney, formatMonth } from '@/lib/format';
import { cn } from '@/lib/utils';

const SAVINGS_LABEL: Record<ScenarioKey, string> = {
  optimistic: 'Savings, optimistic',
  realistic: 'Savings, typical',
  pessimistic: 'Savings, pessimistic',
};

/** Sustained break-even: income covers expenses from that month to the horizon. */
function breakEvenText(probability: number, month: number | null): string {
  if (probability < 0.5 || month === null) return 'Not in most futures';
  return month <= 1 ? 'From the start' : formatMonth(month);
}

/** One stat card per path: risk, savings at the horizon (per scenario), break-even. */
export function PathCards({
  paths,
  colorIndex,
  scenario,
  currency,
  horizonMonths,
}: {
  paths: PathResult[];
  colorIndex: Record<string, number>;
  scenario: ScenarioKey;
  currency: string;
  horizonMonths: number;
}) {
  const pct = SCENARIO_PERCENTILE[scenario];
  return (
    <ul
      className={cn(
        'grid gap-4',
        paths.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3',
      )}
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
              className="@container relative flex h-full flex-col gap-5 overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-card transition-[border-color,box-shadow] duration-300 hover:border-border-strong hover:shadow-pop sm:p-6"
              data-testid="path-card"
            >
              {/* The path's colour key: a hairline across the top of the card. */}
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: pathColor(index) }}
              />
              <div className="flex items-start gap-2">
                <PathSwatch index={index} className="mt-1.5" />
                <h3 className="leading-snug font-bold">{path.name}</h3>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">Chance of running out of money</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-display text-5xl leading-none">
                    <CountUp value={m.probRunOut} format="percent" testId="prob-run-out" />
                  </p>
                  <RiskBadge probRunOut={m.probRunOut} />
                </div>
                <RiskMeter probRunOut={m.probRunOut} className="mt-1" />
                {/* Only worth saying when running out is a real possibility. */}
                {m.medianRunOutMonth !== null && m.probRunOut >= 0.05 ? (
                  <p className="text-xs text-muted">
                    When it happens, typically around month {m.medianRunOutMonth}
                  </p>
                ) : null}
              </div>
              {/* Narrow cards (three paths beside the sliders) list the facts as rows; wide ones as a grid. */}
              <dl className="mt-auto grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border text-sm @[22rem]:grid-cols-2">
                {[
                  [
                    `${SAVINGS_LABEL[scenario]}, month ${horizonMonths}`,
                    formatMoney(cash, currency),
                  ],
                  ['Income covers costs', breakEvenText(m.probBreakEven, m.medianBreakEvenMonth)],
                  [
                    'Lowest point (typical)',
                    `${formatMoney(m.lowestMedianCash.value, currency)} · month ${m.lowestMedianCash.month}`,
                  ],
                  [
                    `Income, month ${horizonMonths}`,
                    `${formatMoney(m.incomeAtHorizon.p50, currency)}/mo`,
                  ],
                ].map(([term, value]) => (
                  <div
                    key={term}
                    className="flex items-baseline justify-between gap-3 bg-surface-muted px-3.5 py-2.5 @[22rem]:flex-col @[22rem]:items-start @[22rem]:justify-start @[22rem]:gap-1 @[22rem]:p-3"
                  >
                    <dt className="text-xs leading-snug text-muted">{term}</dt>
                    <dd className="text-right font-semibold tabular-nums @[22rem]:text-left">
                      {value}
                    </dd>
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
