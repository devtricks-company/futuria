import { Fragment } from 'react';
import { formatMoney } from '@futuria/engine';
import type { FuturesChart as ChartData } from '@futuria/shared';
import { PathSwatch, pathColor } from '@/components/results/path-color';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

const pct = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

/** Lines may wrap between words, never at a hyphen ("full-" / "time"). */
function keepHyphenated(text: string) {
  return text.split(' ').map((word, i) => (
    <Fragment key={i}>
      {i > 0 ? ' ' : null}
      {word.includes('-') ? <span className="whitespace-nowrap">{word}</span> : word}
    </Fragment>
  ));
}

/**
 * The hero: real simulated futures fanning out from today's savings. Lines are SVG stretched to
 * the box (strokes stay 1px); every label is HTML positioned by percentage, so text never
 * distorts. On load the futures unfold from left to right, once. Charts with hidden money
 * (public shares) label the start "Today" and each path with its chance of running out.
 */
export function FuturesChart({
  data,
  currency,
  className,
}: {
  data: ChartData;
  currency: string;
  className?: string;
}) {
  const { width, height, bundles, startY, floorY, startCash } = data;
  const mid = Math.round(data.horizonMonths / 2);

  return (
    <div className={className}>
      <div className="grid gap-x-6 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="relative h-64 sm:h-[22rem] lg:h-[24rem]">
          {/* Below the emergency floor: out of money. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 border-t border-danger/50 bg-danger-surface/55"
            style={{ top: pct(floorY) }}
          />
          <p
            className="absolute left-3 mt-2 text-xs font-medium text-danger"
            style={{ top: pct(floorY) }}
          >
            {startCash === null ? 'Out of money' : `${formatMoney(0, currency)}: out of money`}
          </p>

          <div
            aria-hidden
            className="absolute inset-0 motion-safe:animate-[futures-unfold_2.2s_cubic-bezier(0.33,0.7,0.2,1)_0.7s_both]"
          >
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              className="size-full overflow-visible"
              fill="none"
            >
              {bundles.map((b) => (
                <path
                  key={b.pathId}
                  d={b.runs}
                  stroke={pathColor(b.index)}
                  strokeWidth={1}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className="[stroke-opacity:0.2] dark:[stroke-opacity:0.3]"
                />
              ))}
              {bundles.map((b) => (
                <path
                  key={`${b.pathId}-median`}
                  d={b.median}
                  stroke={pathColor(b.index)}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          </div>

          {/* Today: every future starts from the same savings. */}
          <span
            aria-hidden
            className="absolute left-0 size-3 -translate-1/2 rounded-full bg-foreground ring-4 ring-background"
            style={{ top: pct(startY) }}
          />
          {/* Lifted clear of the lines, which rise slowly from the start on wide charts. */}
          <p
            className="absolute left-3 hidden -translate-y-[calc(100%+1.5rem)] text-sm font-medium tabular-nums [text-shadow:0_0_4px_var(--background),0_0_8px_var(--background)] sm:block"
            style={{ top: pct(startY) }}
          >
            {startCash === null ? 'Today' : `${formatMoney(startCash, currency)} today`}
          </p>

          <ol
            aria-hidden
            className="absolute inset-x-0 top-full mt-2 flex justify-between text-xs text-muted"
          >
            <li>
              {startCash !== null ? (
                <>
                  <span className="font-medium text-foreground tabular-nums sm:hidden">
                    {formatMoney(startCash, currency)}{' '}
                  </span>
                  <span className="sm:hidden">today</span>
                  <span className="hidden sm:inline">Today</span>
                </>
              ) : (
                'Today'
              )}
            </li>
            <li>Month {mid}</li>
            <li>Month {data.horizonMonths}</li>
          </ol>
        </div>

        {/* End labels beside the chart, at the height where each median ends. */}
        <ul className="relative hidden sm:block motion-safe:animate-[futures-fade_0.6s_ease-out_2.5s_both]">
          {bundles.map((b) => (
            <li
              key={b.pathId}
              className="absolute inset-x-0 -translate-y-1/2"
              style={{ top: pct(b.labelY) }}
            >
              <EndLabel bundle={b} currency={currency} />
            </li>
          ))}
        </ul>
      </div>

      {/* Small screens: a legend in the chart's top-to-bottom order. */}
      <ul className="mt-10 flex flex-col gap-3 sm:hidden">
        {[...bundles]
          .sort((a, b) => a.endY - b.endY)
          .map((b) => (
            <li key={b.pathId}>
              <EndLabel bundle={b} currency={currency} inline />
            </li>
          ))}
      </ul>
    </div>
  );
}

function EndLabel({
  bundle: { name, index, end, probRunOut },
  currency,
  inline,
}: {
  bundle: ChartData['bundles'][number];
  currency: string;
  inline?: boolean;
}) {
  return (
    <p className={cn('text-sm leading-snug', inline && 'flex items-baseline gap-2')}>
      <span className={cn('flex gap-2 font-medium', inline && 'min-w-0 flex-1')}>
        <PathSwatch index={index} shape="line" className="mt-[0.6em]" />
        <span>{keepHyphenated(name)}</span>
      </span>
      <span className={cn('block text-muted tabular-nums', !inline && 'pl-5.5')}>
        {end === null
          ? `${formatPercent(probRunOut)} chance of running out`
          : `${formatMoney(end, currency)} typical`}
      </span>
    </p>
  );
}
