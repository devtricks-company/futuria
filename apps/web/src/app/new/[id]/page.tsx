import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Wizard } from '@/components/wizard/wizard';

export const metadata: Metadata = { title: 'Set up your simulation' };

export default function WizardPage({ params }: PageProps<'/new/[id]'>) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <Suspense fallback={<Skeleton className="h-64" />}>
        {params.then(({ id }) => (
          <Wizard id={id} />
        ))}
      </Suspense>
    </main>
  );
}
