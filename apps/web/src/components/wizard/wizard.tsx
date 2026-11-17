'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BUSY_STATUSES, PLANS } from '@futuria/shared';
import { Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AssumptionsStep } from '@/components/wizard/assumptions-step';
import { IntakeSteps } from '@/components/wizard/intake-steps';
import { RoutedScreen } from '@/components/wizard/routed-screen';
import { ApiError, api, errorMessage, queryKeys } from '@/lib/api';
import { useNavigate } from '@/lib/navigation';

function WizardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}

export function NotFound({ what = 'simulation' }: { what?: string }) {
  return (
    <Notice
      variant="error"
      title={`We couldn't find this ${what}`}
      action={
        <Button asChild size="sm" variant="secondary">
          <Link href="/dashboard">Go to my simulations</Link>
        </Button>
      }
    >
      It may have been deleted, or it belongs to another account.
    </Notice>
  );
}

/**
 * Wizard steps 2–4 for one simulation. The step follows the stored status, so a refresh or a
 * link from the dashboard resumes in the right place.
 */
export function Wizard({ id }: { id: string }) {
  const navigate = useNavigate();
  const [editingAnswers, setEditingAnswers] = useState(false);
  const simulation = useQuery({
    queryKey: queryKeys.simulation(id),
    queryFn: () => api.getSimulation(id),
  });
  const me = useQuery({ queryKey: queryKeys.me, queryFn: api.me });
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile });

  const status = simulation.data?.status;
  const ranOrRunning =
    status !== undefined &&
    (BUSY_STATUSES.includes(status) || status === 'ready' || status === 'failed');
  useEffect(() => {
    if (ranOrRunning) navigate(`/s/${id}`, { replace: true });
  }, [ranOrRunning, navigate, id]);

  if (simulation.isError) {
    return simulation.error instanceof ApiError && simulation.error.status === 404 ? (
      <NotFound />
    ) : (
      <Notice variant="error" title="We couldn't load this simulation">
        {errorMessage(simulation.error)}
      </Notice>
    );
  }
  // Profile and plan only tune defaults: don't block on a failure, but wait for them to load.
  if (!simulation.data || me.isPending || profile.isPending || ranOrRunning) {
    return <WizardSkeleton />;
  }

  const sim = simulation.data;
  const limits = me.data?.limits ?? PLANS.free;
  const routing = sim.intake?.routing;
  if (routing && routing !== 'ok') {
    return <RoutedScreen routing={routing} decisionText={sim.decisionText} />;
  }

  if (sim.status === 'model_ready' && sim.model && !editingAnswers) {
    return (
      <AssumptionsStep
        // A rebuilt model starts a fresh editor.
        key={sim.updatedAt}
        simulation={sim}
        maxHorizonMonths={limits.maxHorizonMonths}
        onEditAnswers={sim.intake ? () => setEditingAnswers(true) : undefined}
      />
    );
  }

  if (sim.intake && (sim.status === 'intake_ready' || editingAnswers)) {
    return (
      <IntakeSteps
        simulation={sim}
        profile={profile.data?.profile ?? null}
        maxPaths={limits.maxPaths}
        onCancel={editingAnswers ? () => setEditingAnswers(false) : undefined}
      />
    );
  }

  return (
    <Notice
      variant="info"
      title="This simulation has nothing to review yet"
      action={
        <Button asChild size="sm">
          <Link href="/new">Start a new one</Link>
        </Button>
      }
    >
      It was created without a decision to analyze.
    </Notice>
  );
}
