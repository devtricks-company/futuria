'use client';

import { Table2 } from 'lucide-react';
import { useState } from 'react';
import type { SensitivityItem } from '@futuria/shared';
import { Button } from '@/components/ui/button';
import { formatMoney, formatMoneyCompact, formatPercent, formatValue } from '@/lib/format';
import { metaForField } from '@futuria/shared';

const MAX_ROWS = 6;

/**
 * "What matters most": for each uncertain input, typical savings at the horizon when it sits at
 * the low vs the high end of its range, around the baseline. Bars to the right mean more money
 * (blue), to the left less (red). Rows are sorted by impact.
 */
export function Tornado({
  items,
  baseline,
  currency,
  horizonMonths,
}: {
  items: SensitivityItem[];
  /** Typical (median) savings at the horizon with every input as assumed. */
  baseline: number;
  currency: string;
  horizonMonths: number;
}) {
  const [asTable, setAsTable] = useState(false);
  const rows = items.slice(0, MAX_ROWS);
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        Every input on this path is a single known value, so nothing here is uncertain enough to
        rank.
      </p>
    );
  }
  const values = rows.flatMap((r) => [r.low.medianCashAtHorizon, r.high.medianCashAtHorizon]);
  const min = Math.min(baseline, ...values);
  const max = Math.max(baseline, ...values);
  const span = max - min || 1;
  const pos = (v: number) => ((v - min) / span) * 100;
  const base = pos(baseline);

  const top = rows.slice(0, 2);
  const topShare = top.reduce((sum, r) => sum + r.share, 0);

  return (
    <figure className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <figcaption>
          <p className="font-semibold">What matters most</p>
          <p className="text-sm text-muted">
            {top.length === 2
              ? `${top[0]!.label} and ${top[1]!.label.toLowerCase()} drive ${formatPercent(topShare)} of the difference in your savings at month ${horizonMonths}.`
              : `${top[0]!.label} drives most of the difference in your savings at month ${horizonMonths}.`}
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

      {asTable ? (
        <TornadoTable rows={rows} currency={currency} />
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-worse" /> Less money than assumed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-better" /> More money than assumed
            </span>
            <span>
              Centre line: {formatMoney(baseline, currency)} typical savings at month{' '}
              {horizonMonths}
            </span>
          </div>
          <ul className="flex flex-col gap-3" data-testid="tornado">
            {rows.map((row) => {
              const meta = metaForField(row.field);
              const fmt = (n: number) => formatValue(n, meta?.unit, currency);
              const lowV = row.low.medianCashAtHorizon;
              const highV = row.high.medianCashAtHorizon;
              const left = Math.min(lowV, highV);
              const right = Math.max(lowV, highV);
              // Which input end gives less / more money (for expenses, the low end gives more).
              const worseEnd = lowV <= highV ? row.low : row.high;
              const betterEnd = lowV <= highV ? row.high : row.low;
              const description = `${row.label}: at ${fmt(worseEnd.input)}, ${formatMoney(worseEnd.medianCashAtHorizon, currency)}; at ${fmt(betterEnd.input)}, ${formatMoney(betterEnd.medianCashAtHorizon, currency)}.`;
              return (
                <li
                  key={row.field}
                  className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-center sm:gap-4"
                >
                  <div className="flex items-baseline justify-between gap-2 sm:block">
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="text-xs text-muted">{formatPercent(row.share)} of the swing</p>
                  </div>
                  <div
                    className="group relative h-9 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    tabIndex={0}
                    aria-label={description}
                    title={description}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 w-px bg-muted/50"
                      style={{ left: `${base}%` }}
                    />
                    {left < baseline ? (
                      <span
                        aria-hidden
                        className="absolute top-1 h-4 rounded-l bg-worse transition-opacity group-hover:opacity-80"
                        style={{
                          left: `${pos(left)}%`,
                          width: `${Math.max(base - pos(left), 0.5)}%`,
                        }}
                      />
                    ) : null}
                    {right > baseline ? (
                      <span
                        aria-hidden
                        className="absolute top-1 h-4 rounded-r bg-better transition-opacity group-hover:opacity-80"
                        style={{
                          left: `calc(${base}% + 1px)`,
                          width: `${Math.max(pos(right) - base, 0.5)}%`,
                        }}
                      />
                    ) : null}
                    <span
                      aria-hidden
                      className="absolute bottom-0 text-[11px] leading-none whitespace-nowrap text-muted tabular-nums"
                      style={{ left: `${pos(left)}%` }}
                    >
                      {fmt(worseEnd.input)}
                    </span>
                    <span
                      aria-hidden
                      className="absolute bottom-0 text-[11px] leading-none whitespace-nowrap text-muted tabular-nums"
                      style={{ right: `${100 - pos(right)}%` }}
                    >
                      {fmt(betterEnd.input)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </figure>
  );
}

function TornadoTable({ rows, currency }: { rows: SensitivityItem[]; currency: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">What matters most</caption>
        <thead className="text-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Input
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Low end
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              High end
            </th>
            <th scope="col" className="py-2 font-medium">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const unit = metaForField(row.field)?.unit;
            return (
              <tr key={row.field} className="border-t border-border">
                <th scope="row" className="py-2 pr-4 font-normal">
                  {row.label}
                </th>
                <td className="py-2 pr-4 tabular-nums">
                  {formatValue(row.low.input, unit, currency)} →{' '}
                  {formatMoneyCompact(row.low.medianCashAtHorizon, currency)}
                </td>
                <td className="py-2 pr-4 tabular-nums">
                  {formatValue(row.high.input, unit, currency)} →{' '}
                  {formatMoneyCompact(row.high.medianCashAtHorizon, currency)}
                </td>
                <td className="py-2 tabular-nums">{formatPercent(row.share)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
