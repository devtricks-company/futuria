import { Eye, LockKeyhole, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  type DecisionModel,
  type InterventionResult,
  type PathResult,
  type SensitivityItem,
  isDistribution,
  likelyValue,
  metaForField,
} from '@futuria/shared';
import { getField } from '@futuria/engine';
import { pathColor } from '@/components/results/path-color';
import { RiskBadge } from '@/components/results/risk';
import { formatMoney, formatPercent, formatValue } from '@/lib/format';

/** One feature: what it is in a sentence, then Sara's real result as the picture. */
function Feature({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-6 border-t border-border pt-6">
      <div className="max-w-md">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-1.5 text-muted">{body}</p>
      </div>
      <div>{children}</div>
    </li>
  );
}

function Drivers({ items, index }: { items: SensitivityItem[]; index: number }) {
  const max = Math.max(...items.map((i) => i.share), 0.01);
  return (
    <ul className="flex flex-col gap-3" aria-label="What matters most, by share of the swing">
      {items.map((item) => (
        <li
          key={item.field}
          className="grid grid-cols-[minmax(0,11.5rem)_1fr_2.5rem] items-center gap-3"
        >
          <span className="text-sm leading-tight">{item.label}</span>
          <span
            aria-hidden
            className="h-2 rounded-r-[4px]"
            style={{
              width: `${(item.share / max) * 100}%`,
              background: pathColor(index),
            }}
          />
          <span className="text-right text-sm text-muted tabular-nums">
            {formatPercent(item.share)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Actions({ items }: { items: InterventionResult[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border border-y border-border">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-3"
        >
          <span className="text-sm font-medium">{item.label}</span>
          <span className="flex items-center gap-2 text-sm text-muted">
            Runs out
            <strong className="font-semibold text-foreground tabular-nums">
              {formatPercent(item.after.probRunOut)}
            </strong>
            <RiskBadge probRunOut={item.after.probRunOut} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Timeline({
  path,
  index,
  months,
  currency,
}: {
  path: PathResult;
  index: number;
  months: number[];
  currency: string;
}) {
  const series = path.cash.p50;
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const points = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * 100;
      const y = 4 + (1 - (v - lo) / Math.max(hi - lo, 1)) * 32;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <div className="flex flex-col gap-4">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-14 w-full" aria-hidden>
        <polyline
          points={points}
          fill="none"
          stroke={pathColor(index)}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <ol className="grid grid-cols-3 gap-4">
        {months.map((m) => (
          <li key={m} className="border-l border-border-strong pl-3">
            <p className="text-xs text-muted">Month {m}</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatMoney(series[m] ?? 0, currency)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface RangeRow {
  label: string;
  low: string;
  likely: string;
  high: string;
  /** Where "likely" sits between low and high (0–1). */
  at: number;
}

/** The low–likely–high ranges behind a path, read from the model. */
export function rangeRows(
  model: DecisionModel,
  pathId: string,
  fields: { field: string; label: string }[],
): RangeRow[] {
  const currency = model.baseline.currency;
  return fields.flatMap(({ field, label }) => {
    const value = getField(model, field.startsWith('baseline.') ? '' : pathId, field);
    if (!isDistribution(value) || value.kind !== 'range') return [];
    const unit = metaForField(field)?.unit;
    const fmt = (n: number) => formatValue(n, unit, currency);
    const span = value.high - value.low;
    return [
      {
        label,
        low: fmt(value.low),
        likely: fmt(likelyValue(value)),
        high: fmt(value.high),
        at: span > 0 ? (value.likely - value.low) / span : 0.5,
      },
    ];
  });
}

function Ranges({ rows, index }: { rows: RangeRow[]; index: number }) {
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row) => (
        <li key={row.label} className="flex flex-col gap-1.5">
          <p className="flex items-baseline justify-between gap-2 text-sm">
            <span>{row.label}</span>
            <span className="text-xs text-muted tabular-nums">
              likely <span className="font-medium text-foreground">{row.likely}</span>
            </span>
          </p>
          <span aria-hidden className="relative block h-1.5 rounded-full bg-border">
            <span
              className="absolute top-1/2 size-3 -translate-1/2 rounded-full ring-2 ring-background"
              style={{ left: `${row.at * 100}%`, background: pathColor(index) }}
            />
          </span>
          <p className="flex justify-between text-xs text-muted tabular-nums">
            <span>{row.low}</span>
            <span>{row.high}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

/** The features section: each preview is drawn from Sara's real simulation of one path. */
export function FeatureTiles({
  model,
  path,
  pathIndex,
  drivers,
  actions,
  timelineMonths,
  ranges,
}: {
  model: DecisionModel;
  path: PathResult;
  pathIndex: number;
  drivers: SensitivityItem[];
  actions: InterventionResult[];
  timelineMonths: number[];
  ranges: RangeRow[];
}) {
  return (
    <ul className="grid gap-x-12 gap-y-14 md:grid-cols-2">
      <Feature
        title="What matters most"
        body="Which assumptions swing the outcome most, so you know what to pin down before you jump."
      >
        <Drivers items={drivers} index={pathIndex} />
      </Feature>
      <Feature
        title="Moves that lower the risk"
        body="Concrete changes to your plan, each simulated again, with the new chance of running out."
      >
        <Actions items={actions} />
      </Feature>
      <Feature
        title="Time Machine"
        body={`Jump to month ${timelineMonths.join(', ').replace(/, (\d+)$/, ' or $1')} and read the story of that future, with the engine's numbers beside it.`}
      >
        <Timeline
          path={path}
          index={pathIndex}
          months={timelineMonths}
          currency={model.baseline.currency}
        />
      </Feature>
      <Feature
        title="Every assumption as a range"
        body="Low, likely and high values show where things are uncertain. AI estimates are marked, and you can change any number."
      >
        <Ranges rows={ranges} index={pathIndex} />
      </Feature>
    </ul>
  );
}

const PRIVACY = [
  { icon: SlidersHorizontal, text: 'Sliders run on your device and cost nothing.' },
  { icon: LockKeyhole, text: 'Only your account can open your simulations.' },
  { icon: Eye, text: 'Describe your decision without names; we never need them.' },
] as const;

/** Three plain privacy facts, one line each. */
export function PrivacyNotes() {
  return (
    <ul className="grid gap-4 text-sm sm:grid-cols-3">
      {PRIVACY.map(({ icon: Icon, text }) => (
        <li key={text} className="flex gap-3">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          {text}
        </li>
      ))}
    </ul>
  );
}
