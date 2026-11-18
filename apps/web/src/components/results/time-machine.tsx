import { CircleDot } from 'lucide-react';
import type { PathNarrative, PathResult, ScenarioKey } from '@futuria/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/format';
import { EVENT_LABELS, buildTimeline } from '@/lib/time-machine';

const SCENARIO_TEXT: Record<ScenarioKey, string> = {
  optimistic: 'an optimistic future (better than 9 in 10)',
  realistic: 'a typical future (the median)',
  pessimistic: 'a tough future (worse than 9 in 10)',
};

function StoryList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-muted">{title}</p>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Month by month along one simulated future. The prose comes from Claude; every number beside it
 * comes from the engine's representative run for this scenario.
 */
export function TimeMachine({
  path,
  scenario,
  narrative,
  storyPending,
  currency,
  horizonMonths,
}: {
  path: PathResult;
  scenario: ScenarioKey;
  narrative: PathNarrative | null | undefined;
  /** The story is still being written. */
  storyPending: boolean;
  currency: string;
  horizonMonths: number;
}) {
  const steps = buildTimeline(path, scenario, narrative, horizonMonths);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {path.name}: {SCENARIO_TEXT[scenario]}. One of the 1,000 simulated futures, told month by
        month.
      </p>
      {!narrative && !storyPending ? (
        <p className="text-sm text-muted">
          The story for this path isn&apos;t available, so here are the engine&apos;s numbers on
          their own.
        </p>
      ) : null}
      <ol
        className="relative flex flex-col gap-6 border-l border-border pl-6"
        data-testid="time-machine"
      >
        {steps.map((step) => (
          <li key={step.month} className="relative">
            <span
              aria-hidden
              className="absolute top-1 -left-[1.95rem] flex size-4 items-center justify-center rounded-full bg-background"
            >
              <CircleDot className="size-4 text-accent" />
            </span>
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
              <div className="flex shrink-0 flex-col gap-1 sm:w-44">
                <p className="font-semibold">Month {step.month}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-sm tabular-nums">
                  <dt className="text-muted">Savings</dt>
                  <dd className={step.cash < 0 ? 'text-danger' : undefined}>
                    {formatMoney(step.cash, currency)}
                  </dd>
                  <dt className="text-muted">Income</dt>
                  <dd>{formatMoney(step.income, currency)}/mo</dd>
                  <dt className="text-muted">Spending</dt>
                  <dd>{formatMoney(step.expenses, currency)}/mo</dd>
                </dl>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {step.events.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {step.events.map((event, i) => (
                      <li
                        key={`${event.type}-${event.month}-${i}`}
                        className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs"
                      >
                        {EVENT_LABELS[event.type]} · month {event.month}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {step.milestone ? (
                  <>
                    <p className="font-medium">{step.milestone.headline}</p>
                    <StoryList title="What happened" items={step.milestone.events} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <StoryList title="Opportunities" items={step.milestone.opportunities} />
                      <StoryList title="Challenges" items={step.milestone.challenges} />
                      <StoryList title="Risks" items={step.milestone.risks} />
                    </div>
                  </>
                ) : storyPending ? (
                  <div className="flex flex-col gap-2" aria-label="Writing the story">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
