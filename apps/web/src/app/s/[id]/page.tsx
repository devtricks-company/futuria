import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SimulationView } from '@/components/results/simulation-view';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Your futures' };

export default function SimulationPage({ params }: PageProps<'/s/[id]'>) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<Skeleton className="h-96" />}>
        {params.then(({ id }) => (
          <SimulationView id={id} />
        ))}
      </Suspense>
    </main>
  );
}
