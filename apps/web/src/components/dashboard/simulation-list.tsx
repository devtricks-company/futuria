'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, GitBranch, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type CSSProperties, useState } from 'react';
import type { SimulationStatus, SimulationSummaryDto } from '@futuria/shared';
import { LogoMark } from '@/components/brand';
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

function Row({ sim, index }: { sim: SimulationSummaryDto; index: number }) {
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
      className="rise group relative flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-card transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-pop sm:flex-row sm:items-center sm:p-5"
      style={{ '--rise-delay': `${Math.min(index, 8) * 60}ms` } as CSSProperties}
      data-testid="simulation-row"
    >
      <Link
        href={hrefFor(sim)}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-muted text-accent transition-[background-color,color,border-color,transform] duration-300 group-hover:-rotate-6 group-hover:border-transparent group-hover:bg-brand group-hover:text-on-brand"
        >
          <GitBranch className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{sim.title}</p>
          <p className="text-sm text-muted">
            {sim.pathCount > 0 ? `${sim.pathCount} paths · ` : ''}
            Updated {dateFormat.format(new Date(sim.updatedAt))}
          </p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
        <ArrowUpRight
          className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
          aria-hidden
        />
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
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
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
      <Card className="flex flex-col items-center gap-4 rounded-[2rem] py-16 text-center">
        <LogoMark className="size-14 rounded-2xl motion-safe:animate-[futures-pulse_3s_ease-in-out_infinite]" />
        <div>
          <p className="font-display text-2xl sm:text-3xl">No simulations yet</p>
          <p className="mt-1 text-sm text-muted">
            Describe a decision and see how it could play out.
          </p>
        </div>
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
    <ul className="flex flex-col gap-3">
      {list.data.map((sim, i) => (
        <Row key={sim.id} sim={sim} index={i} />
      ))}
    </ul>
  );
}
