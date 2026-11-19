'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  BILLABLE_PLANS,
  type BillablePlanId,
  type BillingInterval,
  type MeDto,
  PLANS,
} from '@futuria/shared';
import { Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { ApiError, api, errorMessage, queryKeys } from '@/lib/api';
import { planHighlights, priceLabel, upgradeHref, yearlySavings } from '@/lib/plan-gates';
import { cn } from '@/lib/utils';

export function IntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
}) {
  return (
    <Segmented
      aria-label="Billing period"
      value={value}
      onValueChange={(next) => onChange(next as BillingInterval)}
    >
      <SegmentedItem value="month">Monthly</SegmentedItem>
      <SegmentedItem value="year">
        Yearly
        <span className="ml-1.5 text-xs font-bold text-accent">2 months free</span>
      </SegmentedItem>
    </Segmented>
  );
}

/** Start Checkout and leave for Stripe. */
export function useCheckout() {
  return useMutation({
    mutationFn: (choice: { plan: BillablePlanId; interval: BillingInterval }) =>
      api.checkout(choice),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

/**
 * Pro and Premium side by side with a monthly/yearly switch. Choosing one starts Stripe
 * Checkout; a signed-out visitor signs up first and comes back to the billing page.
 */
export function PlanOptions({
  highlight,
  me,
  initialInterval = 'month',
}: {
  highlight?: BillablePlanId;
  me: MeDto | undefined;
  initialInterval?: BillingInterval;
}) {
  const [interval, setInterval] = useState<BillingInterval>(initialInterval);
  const checkout = useCheckout();
  const current = me?.plan ?? 'free';
  const billingOff = me !== undefined && !me.billing.enabled;
  const subscribed =
    checkout.error instanceof ApiError && checkout.error.code === 'already_subscribed';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-center sm:justify-start">
        <IntervalToggle value={interval} onChange={setInterval} />
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {BILLABLE_PLANS.map((id) => {
          const plan = PLANS[id];
          const price = priceLabel(id, interval);
          const isCurrent = current === id;
          const lower = plan.priceUsdMonthly <= PLANS[current].priceUsdMonthly && !isCurrent;
          const starting = checkout.isPending && checkout.variables?.plan === id;
          return (
            <li
              key={id}
              className={cn(
                'flex flex-col rounded-2xl p-5',
                id === highlight
                  ? 'border-gradient shadow-[0_24px_60px_-30px_rgb(11_207_119/0.5)]'
                  : 'border border-border bg-surface-muted/40',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold">{plan.name}</h3>
                {id === highlight && !isCurrent ? (
                  <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-on-brand">
                    Recommended
                  </span>
                ) : null}
                {isCurrent ? (
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">
                    Your plan
                  </span>
                ) : null}
              </div>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="font-display text-4xl tabular-nums">{price.amount}</span>
                <span className="text-sm text-muted">{price.per}</span>
              </p>
              <p className="mt-1 h-4 text-xs text-muted">
                {interval === 'year' ? `Save $${yearlySavings(id)} a year` : ''}
              </p>
              <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-sm">
                {planHighlights(plan).map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span className="mt-px flex size-4.5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <Check className="size-3" strokeWidth={3} aria-hidden />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-5">
                {me?.anonymous ? (
                  <Button
                    asChild
                    className="w-full"
                    variant={id === highlight ? 'primary' : 'secondary'}
                  >
                    <Link
                      href={`/sign-up?redirect_url=${encodeURIComponent(upgradeHref(id, interval))}`}
                    >
                      Sign up for {plan.name}
                    </Link>
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={id === highlight ? 'primary' : 'secondary'}
                    disabled={isCurrent || lower || billingOff || checkout.isPending || !me}
                    onClick={() => checkout.mutate({ plan: id, interval })}
                  >
                    {isCurrent
                      ? 'Current plan'
                      : starting
                        ? 'Opening checkout…'
                        : `Upgrade to ${plan.name}`}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {billingOff ? (
        <Notice variant="info" title="Payments aren’t set up here yet">
          This server runs without Stripe keys, so plans can’t be bought (local development).
        </Notice>
      ) : null}
      {checkout.error ? (
        <Notice
          variant="error"
          title="We couldn't open checkout"
          action={
            subscribed ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/settings/billing">Manage your plan</Link>
              </Button>
            ) : undefined
          }
        >
          {errorMessage(checkout.error)}
        </Notice>
      ) : null}
    </div>
  );
}

/** The signed-in user's plan and usage (shared cache with the rest of the app). */
export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: api.me });
}
