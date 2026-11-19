'use client';

import { useAuth } from '@clerk/nextjs';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { type BillablePlanId, type BillingInterval, PLANS, type PlanLimits } from '@futuria/shared';
import { IntervalToggle } from '@/components/billing/plan-options';
import { authHref } from '@/components/billing/gate-provider';
import { Button } from '@/components/ui/button';
import { clerkEnabled } from '@/lib/clerk';
import { planHighlights, priceLabel, upgradeHref, yearlySavings } from '@/lib/plan-gates';
import { cn } from '@/lib/utils';

/** With Clerk: signed-in people go straight to Checkout, everyone else signs up first. */
function ClerkUpgradeLink({ href, label }: { href: string; label: string }) {
  const { isSignedIn } = useAuth();
  return (
    <Button asChild variant="secondary" className="w-full">
      <Link href={isSignedIn ? href : authHref('sign-up', href)}>{label}</Link>
    </Button>
  );
}

function UpgradeLink({ plan, interval }: { plan: BillablePlanId; interval: BillingInterval }) {
  const href = upgradeHref(plan, interval);
  const label = `Get ${PLANS[plan].name}`;
  if (clerkEnabled) return <ClerkUpgradeLink href={href} label={label} />;
  return (
    <Button asChild variant="secondary" className="w-full">
      <Link href={href}>{label}</Link>
    </Button>
  );
}

function PlanCard({
  plan,
  interval,
  highlight,
}: {
  plan: PlanLimits;
  interval: BillingInterval;
  highlight?: boolean;
}) {
  const free = plan.id === 'free';
  const price = free ? { amount: '$0', per: 'forever' } : priceLabel(plan.id, interval);
  return (
    <li
      className={cn(
        'relative flex flex-col rounded-3xl p-7 transition-transform duration-500 hover:-translate-y-1 sm:p-8',
        highlight
          ? 'border-gradient shadow-[0_30px_80px_-30px_rgb(11_207_119/0.45)]'
          : 'border border-border bg-surface/60',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold">{plan.name}</h3>
        {highlight ? (
          <span className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-on-brand">
            Start here
          </span>
        ) : null}
      </div>
      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="font-display text-5xl tabular-nums">{price.amount}</span>
        <span className="text-muted">{price.per}</span>
      </p>
      <p className="mt-1 h-5 text-sm text-accent">
        {!free && interval === 'year' ? `Save $${yearlySavings(plan.id)} a year` : ''}
      </p>
      <ul className="mt-6 flex flex-col gap-3 border-t border-border pt-7 text-sm">
        {planHighlights(plan).map((line) => (
          <li key={line} className="flex gap-3">
            <span className="mt-px flex size-4.5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Check className="size-3" strokeWidth={3} aria-hidden />
            </span>
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-9">
        {free ? (
          <Button asChild className="w-full">
            <Link href="/new">Start free</Link>
          </Button>
        ) : (
          <UpgradeLink plan={plan.id as BillablePlanId} interval={interval} />
        )}
      </div>
    </li>
  );
}

/** Landing-page pricing: Free, Pro and Premium with a monthly/yearly switch. */
export function Pricing() {
  const [interval, setInterval] = useState<BillingInterval>('month');
  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-center">
        <IntervalToggle value={interval} onChange={setInterval} />
      </div>
      <ul className="grid gap-5 md:grid-cols-3">
        <PlanCard plan={PLANS.free} interval={interval} highlight />
        <PlanCard plan={PLANS.pro} interval={interval} />
        <PlanCard plan={PLANS.premium} interval={interval} />
      </ul>
    </div>
  );
}
