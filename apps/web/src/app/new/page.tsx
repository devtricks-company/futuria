import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { DecisionForm } from '@/components/wizard/decision-form';
import { Stepper } from '@/components/wizard/stepper';

export const metadata: Metadata = { title: 'New simulation' };

export default function NewSimulationPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <Stepper current="Decision" />
      <PageHeader
        title={<span className="text-gradient pr-1">What if…?</span>}
        description="Start with the decision. We'll ask a few questions, then simulate how each path could play out."
      />
      {/* The form reads ?q= from the URL, which is request data under Cache Components. */}
      <Suspense fallback={<Skeleton className="h-56" />}>
        <DecisionForm />
      </Suspense>
    </main>
  );
}
