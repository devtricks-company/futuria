import { AlertTriangle } from 'lucide-react';
import { type PathResult, SCENARIO_PERCENTILE, type ScenarioKey } from '@futuria/shared';
import { PathSwatch } from '@/components/results/path-color';
import { Card } from '@/components/ui/card';
import { formatMoney, formatMonth, formatPercent } from '@/lib/format';
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
        'grid gap-3',
        paths.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {paths.map((path) => {
        const m = path.metrics;
        const highRisk = m.probRunOut >= 0.2;
        const cash = pct === 'p25' || pct === 'p75' ? m.cashAtHorizon.p50 : m.cashAtHorizon[pct];
        return (
          <li key={path.pathId}>
            <Card className="flex h-full flex-col gap-4 p-5" data-testid="path-card">
              <div className="flex items-center gap-2">
                <PathSwatch index={colorIndex[path.pathId] ?? 0} />
                <h3 className="font-semibold">{path.name}</h3>
              </div>
              <div>
                <p className="text-sm text-muted">Chance of running out of money</p>
                <p
                  className="flex items-center gap-2 text-3xl font-semibold tracking-tight"
                  data-testid="prob-run-out"
                >
                  {formatPercent(m.probRunOut)}
                  {highRisk ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-danger-surface px-2 py-0.5 text-xs font-medium text-danger">
                      <AlertTriangle className="size-3" aria-hidden />
                      High risk
                    </span>
                  ) : null}
                </p>
                {/* Only worth saying when running out is a real possibility. */}
                {m.medianRunOutMonth !== null && m.probRunOut >= 0.05 ? (
                  <p className="text-xs text-muted">
                    When it happens, typically around month {m.medianRunOutMonth}
                  </p>
                ) : null}
              </div>
              <dl className="flex flex-col divide-y divide-border border-t border-border text-sm">
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
                  <div key={term} className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="text-muted">{term}</dt>
                    <dd className="text-right font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
