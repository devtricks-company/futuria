'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { SimulationStatus, SimulationSummaryDto } from '@futuria/shared';
import { Notice } from '@/components/notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage, queryKeys } from '@/lib/api';

const STATUS: Record<
  SimulationStatus,
  { label: string; variant: 'muted' | 'accent' | 'estimate' | 'success' | 'danger' }
> = {
  draft: { label: 'Draft', variant: 'muted' },
  intake_ready: { label: 'Answer questions', variant: 'estimate' },
  model_ready: { label: 'Review assumptions', variant: 'estimate' },
  queued: { label: 'Running', variant: 'accent' },
  simulating: { label: 'Running', variant: 'accent' },
  narrating: { label: 'Writing story', variant: 'accent' },
  ready: { label: 'Ready', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
};

function hrefFor(sim: SimulationSummaryDto): string {
  return sim.status === 'draft' || sim.status === 'intake_ready' || sim.status === 'model_ready'
    ? `/new/${sim.id}`
    : `/s/${sim.id}`;
}

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

function Row({ sim }: { sim: SimulationSummaryDto }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteSimulation(sim.id),
    onSuccess: () => {
      queryClient.setQueryData<SimulationSummaryDto[]>(queryKeys.simulations, (list) =>
        list?.filter((s) => s.id !== sim.id),
      );
      queryClient.removeQueries({ queryKey: queryKeys.simulation(sim.id) });
    },
  });
  const status = STATUS[sim.status];
  return (
    <li
      className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6"
      data-testid="simulation-row"
    >
      <Link href={hrefFor(sim)} className="group flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium group-hover:text-accent">{sim.title}</p>
          <p className="text-sm text-muted">
            {sim.pathCount > 0 ? `${sim.pathCount} paths · ` : ''}
            Updated {dateFormat.format(new Date(sim.updatedAt))}
          </p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
        <ChevronRight className="size-4 text-muted" aria-hidden />
      </Link>
      {confirming ? (
        <div className="flex items-center gap-2 text-sm">
          <span>Delete it?</span>
          <Button
            size="sm"
            variant="danger"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${sim.title}`}
          className="self-start sm:self-auto"
        >
          <Trash2 />
          <span className="sm:hidden">Delete</span>
        </Button>
      )}
      {remove.isError ? <p className="text-sm text-danger">{errorMessage(remove.error)}</p> : null}
    </li>
  );
}

export function SimulationList() {
  const list = useQuery({ queryKey: queryKeys.simulations, queryFn: api.listSimulations });
  if (list.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (list.isError) {
    return (
      <Notice variant="error" title="We couldn't load your simulations">
        {errorMessage(list.error)}
      </Notice>
    );
  }
  if (list.data.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-medium">No simulations yet</p>
        <p className="text-sm text-muted">Describe a decision and see how it could play out.</p>
        <Button asChild>
          <Link href="/new">
            <Plus />
            New simulation
          </Link>
        </Button>
      </Card>
    );
  }
  return (
    <Card className="p-0 sm:p-0">
      <ul className="divide-y divide-border">
        {list.data.map((sim) => (
          <Row key={sim.id} sim={sim} />
        ))}
      </ul>
    </Card>
  );
}
