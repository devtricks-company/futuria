'use client';

import { Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  type TooltipContentProps,
  type TooltipValueType,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type PathResult,
  SCENARIO_PERCENTILE,
  type ScenarioKey,
  milestoneMonths,
} from '@futuria/shared';
import { PathSwatch, pathColor } from '@/components/results/path-color';
import { Button } from '@/components/ui/button';
import { formatMoney, formatMoneyCompact } from '@/lib/format';

interface Row {
  month: number;
  [key: string]: number | [number, number];
}

const SCENARIO_NAMES: Record<ScenarioKey, string> = {
  optimistic: 'Optimistic (P90)',
  realistic: 'Realistic (median)',
  pessimistic: 'Pessimistic (P10)',
};

/**
 * Savings over time: for each path, the band where 80% of simulated futures fall (P10–P90) as a
 * light wash, and the selected scenario's line on top.
 */
export function FanChart({
  paths,
  colorIndex,
  scenario,
  currency,
  horizonMonths,
  emergencyFloor,
}: {
  paths: PathResult[];
  /** Path id -> colour slot (by model order). */
  colorIndex: Record<string, number>;
  scenario: ScenarioKey;
  currency: string;
  horizonMonths: number;
  emergencyFloor: number;
}) {
  const [asTable, setAsTable] = useState(false);
  const pct = SCENARIO_PERCENTILE[scenario];

  const rows = useMemo<Row[]>(
    () =>
      Array.from({ length: horizonMonths + 1 }, (_, month) => {
        const row: Row = { month };
        for (const p of paths) {
          row[`${p.pathId}:band`] = [p.cash.p10[month] ?? 0, p.cash.p90[month] ?? 0];
          row[`${p.pathId}:line`] = p.cash[pct][month] ?? 0;
        }
        return row;
      }),
    [paths, pct, horizonMonths],
  );

  const ticks = [0, ...milestoneMonths(horizonMonths)];
  const names = Object.fromEntries(paths.map((p) => [p.pathId, p.name]));

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption>
          <p className="font-semibold">Savings over time</p>
          <p className="text-sm text-muted">
            Line: {SCENARIO_NAMES[scenario].toLowerCase()}. Shaded: where 8 in 10 futures land.
          </p>
        </figcaption>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAsTable((t) => !t)}
          aria-pressed={asTable}
        >
          <Table2 />
          {asTable ? 'Show chart' : 'Show table'}
        </Button>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Legend">
        {paths.map((p) => (
          <li key={p.pathId} className="flex items-center gap-1.5">
            <PathSwatch index={colorIndex[p.pathId] ?? 0} />
            {p.name}
          </li>
        ))}
      </ul>

      {asTable ? (
        <FanTable paths={paths} scenario={scenario} currency={currency} months={ticks} />
      ) : (
        <div className="-ml-2 h-72 sm:h-80" role="img" aria-label="Savings over time by path">
          <ComposedChart
            responsive
            data={rows}
            margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
            style={{ width: '100%', height: '100%' }}
          >
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="month"
              type="number"
              domain={[0, horizonMonths]}
              ticks={ticks}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
              tickFormatter={(m: number) => (m === 0 ? 'Now' : `M${m}`)}
            />
            <YAxis
              width={56}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
              tickFormatter={(v: number) => formatMoneyCompact(v, currency)}
            />
            <ReferenceLine
              y={emergencyFloor}
              stroke="var(--danger)"
              strokeOpacity={0.6}
              label={{
                value: emergencyFloor === 0 ? 'Out of money' : 'Emergency floor',
                position: 'insideBottomLeft',
                fill: 'var(--muted)',
                fontSize: 11,
              }}
            />
            {paths.map((p) => (
              <Area
                key={`${p.pathId}:band`}
                dataKey={`${p.pathId}:band`}
                stroke="none"
                fill={pathColor(colorIndex[p.pathId] ?? 0)}
                fillOpacity={0.12}
                isAnimationActive={false}
                activeDot={false}
              />
            ))}
            {paths.map((p) => (
              <Line
                key={`${p.pathId}:line`}
                dataKey={`${p.pathId}:line`}
                stroke={pathColor(colorIndex[p.pathId] ?? 0)}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
            <Tooltip
              cursor={{ stroke: 'var(--muted)', strokeWidth: 1 }}
              content={(props) => <FanTooltip {...props} names={names} currency={currency} />}
            />
          </ComposedChart>
        </div>
      )}
    </figure>
  );
}

function FanTooltip({
  active,
  payload,
  label,
  names,
  currency,
}: TooltipContentProps<TooltipValueType, string | number> & {
  names: Record<string, string>;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;
  const lines = payload.filter((item) => String(item.dataKey).endsWith(':line'));
  return (
    <div className="min-w-48 rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 text-xs text-muted">{label === 0 ? 'Today' : `Month ${label}`}</p>
      <ul className="flex flex-col gap-1">
        {lines.map((item) => {
          const pathId = String(item.dataKey).split(':')[0]!;
          const band = row[`${pathId}:band`] as [number, number];
          return (
            <li key={pathId} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-2 h-0.5 w-3 shrink-0 rounded-full"
                style={{ background: item.color }}
              />
              <span className="flex flex-col">
                <strong className="font-semibold tabular-nums">
                  {formatMoney(Number(item.value), currency)}
                </strong>
                <span className="text-xs text-muted">
                  {names[pathId]} · range {formatMoneyCompact(band[0], currency)}–
                  {formatMoneyCompact(band[1], currency)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FanTable({
  paths,
  scenario,
  currency,
  months,
}: {
  paths: PathResult[];
  scenario: ScenarioKey;
  currency: string;
  months: number[];
}) {
  const pct = SCENARIO_PERCENTILE[scenario];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Savings by month and path</caption>
        <thead className="text-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Month
            </th>
            {paths.map((p) => (
              <th key={p.pathId} scope="col" className="py-2 pr-4 font-medium">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m} className="border-t border-border">
              <th scope="row" className="py-2 pr-4 font-normal text-muted">
                {m === 0 ? 'Now' : m}
              </th>
              {paths.map((p) => (
                <td key={p.pathId} className="py-2 pr-4 tabular-nums">
                  {formatMoney(p.cash[pct][m] ?? 0, currency)}
                  <span className="block text-xs text-muted">
                    {formatMoneyCompact(p.cash.p10[m] ?? 0, currency)}–
                    {formatMoneyCompact(p.cash.p90[m] ?? 0, currency)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
