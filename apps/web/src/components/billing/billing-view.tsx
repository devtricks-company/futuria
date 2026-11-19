'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, ExternalLink } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { type MeDto, PLANS, planPrice } from '@futuria/shared';
import { PlanOptions, useCheckout } from '@/components/billing/plan-options';
import { Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage, queryKeys } from '@/lib/api';
import { parseUpgradeParams, quotaLeft, quotaUpgrade } from '@/lib/plan-gates';
import { cn } from '@/lib/utils';

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

type Arrival =
  | { kind: 'syncing' }
  | { kind: 'welcome'; plan: string }
  | { kind: 'cancelled' }
  | { kind: 'sync-failed'; message: string }
  | null;

function UsageMeter({ me }: { me: MeDto }) {
  const { simulations, simulationsPeriod } = me.limits;
  const used = Math.min(me.usage.simulationsUsed, simulations);
  const left = quotaLeft(me);
  const resets = me.usage.periodEnd ? dateFormat.format(new Date(me.usage.periodEnd)) : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">Simulations</span>
        <span className="text-muted tabular-nums">
          {used} of {simulations} used
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-label="Simulations used"
        aria-valuemin={0}
        aria-valuemax={simulations}
        aria-valuenow={used}
      >
        <div
          className={cn('h-full rounded-full', left === 0 ? 'bg-danger' : 'bg-brand')}
          style={{ width: `${(used / simulations) * 100}%` }}
        />
      </div>
      <p className="text-xs text-muted">
        {simulationsPeriod === 'lifetime'
          ? 'A total to start with. Every run, including a story update, uses one.'
          : `Every run, including a story update, uses one.${resets ? ` Resets on ${resets}.` : ''}`}
      </p>
    </div>
  );
}

/**
 * /settings/billing: the plan, its usage, and the way to upgrade (Checkout) or manage it (the
 * Customer Portal). It is also where Checkout returns (`?session_id=`) and where the pricing
 * page sends people (`?upgrade=pro&interval=year`, possibly after signing up).
 */
export function BillingView() {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const me = useQuery({ queryKey: queryKeys.me, queryFn: api.me });
  // What brought the person here, read once from the URL.
  const [landing] = useState(() => ({
    sessionId: params.get('session_id'),
    cancelled: params.get('checkout') === 'cancelled',
    intent: parseUpgradeParams(params),
  }));
  const intent = landing.intent ?? undefined;
  const [arrival, setArrival] = useState<Arrival>(() =>
    landing.sessionId ? { kind: 'syncing' } : landing.cancelled ? { kind: 'cancelled' } : null,
  );
  const checkout = useCheckout();

  const portal = useMutation({
    mutationFn: api.portal,
    onSuccess: ({ url }) => window.location.assign(url),
  });

  // Clean the URL, and right after Checkout sync the plan instead of waiting for the webhook.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    if (window.location.search) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
    if (!landing.sessionId) return;
    api
      .syncBilling(landing.sessionId)
      .then(() => queryClient.fetchQuery({ queryKey: queryKeys.me, queryFn: api.me }))
      .then((fresh) => setArrival({ kind: 'welcome', plan: PLANS[fresh.plan].name }))
      .catch((error: unknown) => setArrival({ kind: 'sync-failed', message: errorMessage(error) }));
  }, [landing, queryClient]);

  // From the pricing page: go straight on to Checkout when it makes sense.
  const started = useRef(false);
  const data = me.data;
  useEffect(() => {
    if (!intent || !data || started.current) return;
    const live = data.billing.subscription && LIVE_STATUSES.has(data.billing.subscription.status);
    if (data.anonymous || live || !data.billing.enabled || data.plan === intent.plan) return;
    started.current = true;
    checkout.mutate(intent);
  }, [intent, data, checkout]);

  if (me.isError) {
    return (
      <Notice variant="error" title="We couldn't load your plan">
        {errorMessage(me.error)}
      </Notice>
    );
  }
  if (!data) return <Skeleton className="h-64" />;

  const plan = PLANS[data.plan];
  const subscription = data.billing.subscription;
  const live = subscription !== null && LIVE_STATUSES.has(subscription.status);
  const interval = subscription?.interval ?? 'month';
  const periodEnd = subscription?.currentPeriodEnd
    ? dateFormat.format(new Date(subscription.currentPeriodEnd))
    : null;
  const next = quotaUpgrade(data.plan) ?? 'pro';

  return (
    <div className="flex flex-col gap-6">
      {arrival?.kind === 'syncing' ? (
        <Notice title="Activating your plan…">This takes a moment after checkout.</Notice>
      ) : null}
      {arrival?.kind === 'welcome' ? (
        <Notice title={`Welcome to ${arrival.plan}`}>
          Your new limits apply right away. Thank you for supporting FUTURIA.
        </Notice>
      ) : null}
      {arrival?.kind === 'cancelled' ? (
        <Notice title="Checkout cancelled">Nothing was charged.</Notice>
      ) : null}
      {arrival?.kind === 'sync-failed' ? (
        <Notice variant="warning" title="Your payment went through, the plan is still updating">
          {arrival.message} Refresh this page in a minute.
        </Notice>
      ) : null}
      {checkout.isPending || checkout.isSuccess ? (
        <Notice title="Opening checkout…">You&apos;ll be redirected to Stripe.</Notice>
      ) : null}
      {checkout.isError ? (
        <Notice variant="error" title="We couldn't open checkout">
          {errorMessage(checkout.error)}
        </Notice>
      ) : null}

      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardDescription>Your plan</CardDescription>
            <CardTitle className="mt-1 font-display text-3xl font-normal">{plan.name}</CardTitle>
            {live ? (
              <p className="mt-1 text-sm text-muted">
                ${planPrice(data.plan, interval)} {interval === 'year' ? 'a year' : 'a month'}
                {periodEnd
                  ? subscription.cancelAtPeriodEnd
                    ? ` · ends on ${periodEnd}`
                    : ` · renews on ${periodEnd}`
                  : ''}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">Free forever. Upgrade when you need more.</p>
            )}
          </div>
          {subscription ? (
            <Button
              variant="secondary"
              onClick={() => portal.mutate()}
              disabled={portal.isPending || !data.billing.enabled}
            >
              <CreditCard />
              {live ? 'Manage billing' : 'Billing history'}
              <ExternalLink className="opacity-60" />
            </Button>
          ) : null}
        </div>
        {subscription?.status === 'past_due' ? (
          <Notice variant="warning" title="Your last payment didn't go through">
            Stripe will retry it. Update your card in Manage billing to keep {plan.name}.
          </Notice>
        ) : null}
        {portal.isError ? <Notice variant="error">{errorMessage(portal.error)}</Notice> : null}
        <UsageMeter me={data} />
      </Card>

      {live ? (
        data.plan !== 'premium' ? (
          <p className="text-sm text-muted">
            To switch to {PLANS.premium.name} or change how often you pay, use Manage billing.
          </p>
        ) : null
      ) : (
        <section aria-labelledby="upgrade-title" className="flex flex-col gap-4">
          <h2 id="upgrade-title" className="text-lg font-semibold">
            Upgrade
          </h2>
          <PlanOptions
            highlight={intent?.plan ?? next}
            me={data}
            initialInterval={intent?.interval}
          />
        </section>
      )}
    </div>
  );
}
