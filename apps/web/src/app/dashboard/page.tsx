import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SimulationList } from '@/components/dashboard/simulation-list';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'My simulations' };

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        title="My simulations"
        description="Every decision you've explored. Open one to compare its futures again."
        actions={
          <Button asChild>
            <Link href="/new">
              <Plus />
              New simulation
            </Link>
          </Button>
        }
      />
      <SimulationList />
    </main>
  );
}
