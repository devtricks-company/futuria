import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SimulationList } from '@/components/dashboard/simulation-list';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'My simulations' };

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My simulations</h1>
        <Button asChild>
          <Link href="/new">
            <Plus />
            New simulation
          </Link>
        </Button>
      </div>
      <SimulationList />
    </main>
  );
}
