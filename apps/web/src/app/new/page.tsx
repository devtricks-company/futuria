import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { DecisionForm } from '@/components/wizard/decision-form';
import { Stepper } from '@/components/wizard/stepper';

export const metadata: Metadata = { title: 'New simulation' };

export default function NewSimulationPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <Stepper current="Decision" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">What if…?</h1>
        <p className="mt-1 text-muted">
          Start with the decision. We&apos;ll ask a few questions, then simulate how each path could
          play out.
        </p>
      </div>
      {/* The form reads ?q= from the URL, which is request data under Cache Components. */}
      <Suspense fallback={<Skeleton className="h-56" />}>
        <DecisionForm />
      </Suspense>
    </main>
  );
}
