'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label, Textarea } from '@/components/ui/input';
import { INTAKE_MESSAGES, Working } from '@/components/wizard/working';
import { track } from '@/lib/analytics';
import { api, errorMessage, queryKeys } from '@/lib/api';
import { EXAMPLE_DECISIONS } from '@/lib/examples';
import { openGate } from '@/lib/gate-events';
import { useNavigate } from '@/lib/navigation';
import { quotaLeft, quotaUpgrade, upgradeFromError } from '@/lib/plan-gates';

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

const MIN = 5;
const MAX = 1000;

/** Wizard step 1: the decision in the person's own words. */
export function DecisionForm() {
  const params = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [text, setText] = useState(() => (params.get('q') ?? '').slice(0, MAX));
  const me = useQuery({ queryKey: queryKeys.me, queryFn: api.me });
  // No runs left: say so before Claude reads a decision that couldn't be simulated.
  const outOfRuns = me.data !== undefined && !me.data.anonymous && quotaLeft(me.data) === 0;
  const upgrade = me.data ? quotaUpgrade(me.data.plan) : null;
  const resets = me.data?.usage.periodEnd
    ? dateFormat.format(new Date(me.data.usage.periodEnd))
    : null;

  const intake = useMutation({
    mutationFn: (decisionText: string) => api.intake(decisionText),
    onSuccess: (simulation) => {
      queryClient.setQueryData(queryKeys.simulation(simulation.id), simulation);
      void queryClient.invalidateQueries({ queryKey: queryKeys.simulations });
      navigate(`/new/${simulation.id}`);
    },
  });

  // Keep showing progress while the next page loads.
  if (intake.isPending || intake.isSuccess) {
    return <Working messages={INTAKE_MESSAGES} expectedSeconds={10} />;
  }

  const trimmed = text.trim();
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed.length < MIN) return;
        // Funnel step 2. Never the text itself: only that a decision was submitted.
        track('intake_started', { fromLanding: params.has('q') });
        intake.mutate(trimmed);
      }}
    >
      {outOfRuns ? (
        <Notice
          variant="warning"
          title="You've used all your simulations"
          action={
            upgrade ? (
              <Button
                size="sm"
                onClick={() => openGate({ kind: 'upgrade', reason: 'quota', plan: upgrade })}
              >
                See plans
              </Button>
            ) : undefined
          }
        >
          {upgrade
            ? 'Upgrade to simulate a new decision. Your finished simulations and their sliders stay available.'
            : `Your simulations reset${resets ? ` on ${resets}` : ' at the start of your next billing period'}.`}
        </Notice>
      ) : null}

      <Card className="flex flex-col gap-3 shadow-pop">
        <Label htmlFor="decision" className="text-base">
          What decision are you thinking about?
        </Label>
        <p className="text-sm text-muted">
          Describe it the way you would to a friend. Leave out names and anything that identifies
          you.
        </p>
        <div className="rounded-2xl border border-border bg-background/60 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/20 hover:border-border-strong">
          <Textarea
            id="decision"
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, MAX))}
            placeholder="What if I quit my job to…"
            rows={4}
            autoFocus
            required
            minLength={MIN}
            maxLength={MAX}
            className="min-h-32 resize-none border-0 bg-transparent px-4 pt-3.5 text-base shadow-none hover:border-0 focus-visible:ring-0 sm:text-base"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3">
            <span className="pl-1 text-xs text-muted tabular-nums">
              {trimmed.length}/{MAX}
            </span>
            <Button type="submit" disabled={trimmed.length < MIN || outOfRuns}>
              Continue
              <ArrowRight />
            </Button>
          </div>
        </div>
      </Card>

      {intake.isError && !upgradeFromError(intake.error) ? (
        <Notice variant="error" title="We couldn't read your decision">
          {errorMessage(intake.error)}
        </Notice>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">Need inspiration?</p>
        <ul className="flex flex-wrap gap-2">
          {EXAMPLE_DECISIONS.map((example) => (
            <li key={example.text}>
              <button
                type="button"
                onClick={() => setText(example.text)}
                className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm shadow-card transition-colors hover:border-accent/50 hover:bg-accent-soft"
              >
                {example.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}
