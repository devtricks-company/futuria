'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { type MouseEvent, type ReactNode, useEffect, useState } from 'react';
import { PLANS } from '@futuria/shared';
import { PlanOptions } from '@/components/billing/plan-options';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { api, queryKeys } from '@/lib/api';
import { type GateRequest, onGate } from '@/lib/gate-events';
import { UPGRADE_COPY } from '@/lib/plan-gates';

/** Sign-up and sign-in links that come back to `returnTo` (Clerk reads `redirect_url`). */
export function authHref(kind: 'sign-up' | 'sign-in', returnTo: string): string {
  return `/${kind}?redirect_url=${encodeURIComponent(returnTo)}`;
}

function SignupGate({ returnTo, pathCount }: { returnTo: string; pathCount?: number }) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-2 text-sm text-muted">
        <li>Your draft and every value you checked are saved.</li>
        <li>
          The free plan includes {PLANS.free.simulations} simulations. Moving sliders is always
          free.
        </li>
        <li>No card needed.</li>
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild size="lg" className="sm:flex-1">
          <Link href={authHref('sign-up', returnTo)}>
            Create free account{pathCount ? ` and see ${pathCount} futures` : ''}
          </Link>
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href={authHref('sign-in', returnTo)}>I have an account</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The one place plan gates show up: the upgrade dialog (plan cards, Stripe Checkout) and the
 * signup gate (journey step 5). Opened through `openGate()` (lib/gate-events.ts), by locked
 * controls and by any mutation that fails with a plan error.
 */
export function GateProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<GateRequest | null>(null);
  const [open, setOpen] = useState(false);
  // Only ask who the user is when a gate opens (the landing page shouldn't call the API).
  const me = useQuery({ queryKey: queryKeys.me, queryFn: api.me, enabled: open });

  useEffect(
    () =>
      onGate((next) => {
        // The signup gate comes back to this page unless told otherwise.
        const here = window.location.pathname + window.location.search;
        setRequest(next.kind === 'signup' ? { ...next, returnTo: next.returnTo ?? here } : next);
        setOpen(true);
      }),
    [],
  );

  // This provider outlives the page, so a link in the dialog (sign up, sign in, manage plan)
  // would navigate client-side underneath it. Close the dialog when one is followed here; a
  // modified click opens a new tab and leaves the dialog as it is.
  const closeOnLink = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (event.target instanceof Element && event.target.closest('a[href]')) setOpen(false);
  };

  let content: ReactNode = null;
  if (request?.kind === 'upgrade') {
    const copy = UPGRADE_COPY[request.reason];
    content = (
      <DialogContent title={copy.title} description={copy.body} onClick={closeOnLink}>
        <PlanOptions highlight={request.plan} me={me.data} />
      </DialogContent>
    );
  } else if (request?.kind === 'signup') {
    content = (
      <DialogContent
        title={
          request.pathCount
            ? `Create a free account to see your ${request.pathCount} futures`
            : 'Create a free account to continue'
        }
        description="It takes a few seconds, and your draft comes with you."
        onClick={closeOnLink}
      >
        <SignupGate returnTo={request.returnTo ?? '/'} pathCount={request.pathCount} />
      </DialogContent>
    );
  }

  return (
    <>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        {content}
      </Dialog>
    </>
  );
}
