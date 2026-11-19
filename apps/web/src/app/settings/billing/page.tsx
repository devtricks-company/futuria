import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BillingView } from '@/components/billing/billing-view';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Plan and billing' };

export default function BillingPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        title="Plan and billing"
        description="Your plan, how much of it you've used, and your subscription. Moving sliders is free on every plan."
      />
      {/* The view reads ?session_id= and ?upgrade= from the URL (request data). */}
      <Suspense fallback={<Skeleton className="h-64" />}>
        <BillingView />
      </Suspense>
    </main>
  );
}
