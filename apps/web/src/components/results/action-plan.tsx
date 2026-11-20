import { ArrowRight } from 'lucide-react';
import type { InterventionResult, PathNarrative } from '@futuria/shared';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney, formatPercent } from '@/lib/format';
import { type ActionCard, buildActions } from '@/lib/time-machine';

/** Chance of running out, before -> after, as a dumbbell on a 0–100% track. */
function RiskChange({ impact, currency }: { impact: InterventionResult; currency: string }) {
  const before = impact.before.probRunOut;
  const after = impact.after.probRunOut;
  const cashDelta = impact.after.medianCashAtHorizon - impact.before.medianCashAtHorizon;
  const lo = Math.min(before, after) * 100;
  const hi = Math.max(before, after) * 100;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="text-muted">Chance of running out</span>
        <strong className="text-base font-semibold">
          {formatPercent(before)} <ArrowRight className="inline size-3.5" aria-label="to" />{' '}
          {formatPercent(after)}
        </strong>
      </p>
      <div className="relative h-3" aria-hidden>
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        <span
          className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-muted/60"
          style={{ left: `${lo}%`, width: `${hi - lo}%` }}
        />
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted ring-2 ring-surface"
          style={{ left: `${before * 100}%` }}
        />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
          style={{ left: `${after * 100}%` }}
        />
      </div>
      <p className="text-xs text-muted">
        Typical savings at the end {cashDelta >= 0 ? 'rise' : 'fall'} by{' '}
        {formatMoney(Math.abs(cashDelta), currency)}.
      </p>
    </div>
  );
}

function ActionItemCard({ card, currency }: { card: ActionCard; currency: string }) {
  return (
    <Card className="flex flex-col gap-3 p-5" data-testid="action-card">
      <h3 className="font-semibold">{card.title}</h3>
      {card.impact ? <RiskChange impact={card.impact} currency={currency} /> : null}
      {card.why ? <p className="text-sm text-muted">{card.why}</p> : null}
      {card.steps.length ? (
        <ol className="list-decimal pl-5 text-sm">
          {card.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}

/** Actions that lower the risk, each with the engine's before/after impact. */
export function ActionPlan({
  narrative,
  interventions,
  storyPending,
  currency,
}: {
  narrative: PathNarrative | null | undefined;
  interventions: InterventionResult[];
  storyPending: boolean;
  currency: string;
}) {
  const { story, other } = buildActions(narrative, interventions);
  return (
    <div className="flex flex-col gap-6">
      {storyPending && !story.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : null}
      {story.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {story.map((card) => (
            <ActionItemCard key={card.key} card={card} currency={currency} />
          ))}
        </div>
      ) : null}
      {other.length ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">
            {story.length ? 'Other levers we tested' : 'Levers we tested'}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {other.map((card) => (
              <ActionItemCard key={card.key} card={card} currency={currency} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
