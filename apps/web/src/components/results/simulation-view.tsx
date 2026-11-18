'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarRange,
  Dices,
  GitBranch,
  Pencil,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  BUSY_STATUSES,
  type FullAnalysis,
  SCENARIOS,
  type ScenarioKey,
  type SimulationDto,
  type SimulationResult,
} from '@futuria/shared';
import { Notice } from '@/components/notice';
import { ActionPlan } from '@/components/results/action-plan';
import { FanChart } from '@/components/results/fan-chart';
import { PathSwatch } from '@/components/results/path-color';
import { PathCards } from '@/components/results/path-cards';
import { ProgressScreen } from '@/components/results/progress-screen';
import { SaveProfile } from '@/components/results/save-profile';
import { TimeMachine } from '@/components/results/time-machine';
import { Tornado } from '@/components/results/tornado';
import { TweakPanel } from '@/components/results/tweak-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { NotFound } from '@/components/wizard/wizard';
import { useEngine } from '@/engine/use-engine';
import { ApiError, api, errorMessage, queryKeys } from '@/lib/api';
import { useNavigate } from '@/lib/navigation';
import { type TweakValues, activeTweaks, applyTweaks, slidersFor } from '@/lib/tweaks';

const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  optimistic: 'Optimistic',
  realistic: 'Realistic',
  pessimistic: 'Pessimistic',
};

const POLL_MS = 1500;

/** The path the insights open on: the riskiest one that isn't "stay in my job". */
function defaultPathId(result: SimulationResult): string {
  const candidates = result.paths.filter((p) => p.type !== 'stay');
  const pool = candidates.length ? candidates : result.paths;
  return [...pool].sort((a, b) => b.metrics.probRunOut - a.metrics.probRunOut)[0]!.pathId;
}

export function SimulationView({ id }: { id: string }) {
  const navigate = useNavigate();
  const simulation = useQuery({
    queryKey: queryKeys.simulation(id),
    queryFn: () => api.getSimulation(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && BUSY_STATUSES.includes(status) ? POLL_MS : false;
    },
  });

  const status = simulation.data?.status;
  const inWizard = status === 'draft' || status === 'intake_ready' || status === 'model_ready';
  useEffect(() => {
    if (inWizard) navigate(`/new/${id}`, { replace: true });
  }, [inWizard, navigate, id]);

  if (simulation.isError) {
    return simulation.error instanceof ApiError && simulation.error.status === 404 ? (
      <NotFound />
    ) : (
      <Notice variant="error" title="We couldn't load this simulation">
        {errorMessage(simulation.error)}
      </Notice>
    );
  }
  if (!simulation.data || inWizard) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  return <Results simulation={simulation.data} />;
}

function Results({ simulation }: { simulation: SimulationDto }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const busy = BUSY_STATUSES.includes(simulation.status);
  const model = simulation.model;

  const [scenario, setScenario] = useState<ScenarioKey>('realistic');
  const [values, setValues] = useState<TweakValues>({});
  const [pathId, setPathId] = useState<string | null>(null);
  // After "Update story" the stored results are cleared until the new run finishes; keep
  // showing this device's computation of the same model (same seed, so the same numbers).
  const [rerunning, setRerunning] = useState(false);

  const groups = useMemo(() => (model ? slidersFor(model) : []), [model]);
  const sliders = useMemo(() => groups.flatMap((g) => g.sliders), [groups]);
  const tweaks = useMemo(() => activeTweaks(values, sliders), [values, sliders]);
  const tweaked = Object.keys(tweaks).length > 0;
  const tweakedModel = useMemo(
    () => (model && tweaked ? applyTweaks(model, tweaks) : null),
    [model, tweaks, tweaked],
  );
  const needsLocal = !simulation.analysis && rerunning && model !== null;
  const engine = useEngine(tweakedModel ?? (needsLocal ? model : null), simulation.seed);

  const stored = simulation.analysis;
  const local = tweakedModel || needsLocal;
  const result: SimulationResult | null = local
    ? (engine.result ?? stored?.result ?? null)
    : (stored?.result ?? null);
  const analysis: FullAnalysis | null = local ? (engine.analysis ?? stored ?? null) : stored;

  const rerun = useMutation({
    mutationFn: async (next: 'tweaks' | 'same') => {
      if (next === 'tweaks' && model) {
        await api.updateModel(simulation.id, applyTweaks(model, tweaks, { markAsUser: true }));
      }
      return api.run(simulation.id);
    },
    onSuccess: (queued) => {
      setRerunning(true);
      setValues({});
      queryClient.setQueryData(queryKeys.simulation(simulation.id), queued);
      void queryClient.invalidateQueries({ queryKey: queryKeys.simulations });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.simulation(simulation.id) });
    },
  });

  const editAll = useMutation({
    mutationFn: () => api.updateModel(simulation.id, model!),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.simulation(simulation.id), updated);
      navigate(`/new/${simulation.id}`);
    },
  });
  const [confirmEdit, setConfirmEdit] = useState(false);

  // A fresh run from the wizard: nothing to show until the engine step is done.
  if (!result || !model) {
    if (busy) return <ProgressScreen status={simulation.status} />;
    return (
      <Notice
        variant="error"
        title="This simulation didn't finish"
        action={
          <Button size="sm" onClick={() => rerun.mutate('same')} disabled={rerun.isPending}>
            <RefreshCw />
            Try again
          </Button>
        }
      >
        {simulation.error ?? 'Something went wrong while simulating.'}
        {rerun.isError ? <p className="mt-1">{errorMessage(rerun.error)}</p> : null}
      </Notice>
    );
  }

  const currency = result.currency;
  const horizon = result.horizonMonths;
  const colorIndex = Object.fromEntries(model.paths.map((p, i) => [p.id, i]));
  const selectedPathId =
    pathId && result.paths.some((p) => p.pathId === pathId) ? pathId : defaultPathId(result);
  const selectedPath = result.paths.find((p) => p.pathId === selectedPathId)!;
  // The story describes the stored run, so the Time Machine always uses the stored numbers.
  const storedPath = stored?.result.paths.find((p) => p.pathId === selectedPathId) ?? selectedPath;
  const narrative = simulation.narrative?.[selectedPathId];
  const storyPending = busy && !narrative;
  const pathAnalysis = analysis?.byPath[selectedPathId];
  const baselineCash =
    pathAnalysis?.interventions[0]?.before.medianCashAtHorizon ??
    selectedPath.metrics.cashAtHorizon.p50;

  const tweakPanel = (idPrefix: string) => (
    <TweakPanel
      idPrefix={idPrefix}
      groups={groups}
      values={values}
      currency={currency}
      colorIndex={colorIndex}
      tweaked={tweaked}
      computing={engine.computing}
      updating={rerun.isPending}
      onChange={(sliderId, v) => setValues((current) => ({ ...current, [sliderId]: v }))}
      onReset={() => setValues({})}
      onUpdateStory={() => rerun.mutate('tweaks')}
    />
  );

  const pathPicker = (
    <Segmented
      value={selectedPathId}
      onValueChange={setPathId}
      aria-label="Path"
      className="flex-wrap gap-2 rounded-none border-0 bg-transparent p-0 sm:w-full"
    >
      {result.paths.map((p) => (
        <SegmentedItem
          key={p.pathId}
          value={p.pathId}
          className="h-9 flex-none gap-2 border border-border bg-surface px-3.5 shadow-card hover:border-border-strong data-[state=on]:border-accent data-[state=on]:bg-accent-soft data-[state=on]:shadow-none"
        >
          <PathSwatch index={colorIndex[p.pathId] ?? 0} />
          {p.name}
        </SegmentedItem>
      ))}
    </Segmented>
  );

  return (
    <div className="grid gap-8 pb-20 lg:grid-cols-[minmax(0,1fr)_20rem] lg:pb-0">
      <div className="flex min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-3">
          <Link
            href="/dashboard"
            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            All simulations
          </Link>
          <h1 className="font-display text-3xl leading-[1.1] sm:text-4xl">{simulation.title}</h1>
          <p className="max-w-2xl text-base text-muted sm:text-lg">
            &ldquo;{simulation.decisionText}&rdquo;
          </p>
        </header>

        {busy ? (
          <Notice
            variant="info"
            title={simulation.status === 'narrating' ? 'Writing your stories…' : 'Simulating…'}
          >
            The numbers below are final; the stories appear as soon as they&apos;re written.
          </Notice>
        ) : null}
        {!busy && simulation.error ? (
          <Notice variant="warning" title="Part of the story is missing">
            {simulation.error} The numbers are complete.
          </Notice>
        ) : null}
        {tweaked ? (
          <Notice
            variant="warning"
            title="You're exploring tweaked numbers"
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => rerun.mutate('tweaks')} disabled={rerun.isPending}>
                  Update the story
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setValues({})}>
                  Reset
                </Button>
              </div>
            }
          >
            The story and the action plan text still describe your original assumptions.
          </Notice>
        ) : null}
        {rerun.isError ? (
          <Notice variant="error" title="We couldn't start a new run">
            {errorMessage(rerun.error)}
          </Notice>
        ) : null}
        {engine.error ? (
          <Notice variant="error" title="These values can't be simulated">
            {engine.error}
          </Notice>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ul
            className="flex flex-wrap gap-2 text-xs text-muted"
            aria-label="About this simulation"
          >
            {[
              { icon: Dices, text: '1,000 simulated futures per path' },
              { icon: CalendarRange, text: `${horizon} months` },
              { icon: GitBranch, text: `${result.paths.length} paths` },
            ].map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-2.5 py-1"
              >
                <Icon className="size-3.5" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
          <Segmented
            value={scenario}
            onValueChange={(v) => setScenario(v as ScenarioKey)}
            aria-label="Scenario"
          >
            {SCENARIOS.map((key) => (
              <SegmentedItem key={key} value={key}>
                {SCENARIO_LABELS[key]}
              </SegmentedItem>
            ))}
          </Segmented>
        </div>

        <Tabs defaultValue="compare" className="flex flex-col gap-6">
          <TabsList aria-label="Results">
            <TabsTrigger value="compare">Compare</TabsTrigger>
            <TabsTrigger value="drivers" aria-label="What matters most">
              <span className="sm:hidden">Drivers</span>
              <span className="hidden sm:inline">What matters most</span>
            </TabsTrigger>
            <TabsTrigger value="time-machine">Time Machine</TabsTrigger>
            <TabsTrigger value="actions" aria-label="Action plan">
              <span className="sm:hidden">Actions</span>
              <span className="hidden sm:inline">Action plan</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compare" className="flex flex-col gap-6">
            <PathCards
              paths={result.paths}
              colorIndex={colorIndex}
              scenario={scenario}
              currency={currency}
              horizonMonths={horizon}
            />
            <Card>
              <FanChart
                paths={result.paths}
                colorIndex={colorIndex}
                scenario={scenario}
                currency={currency}
                horizonMonths={horizon}
                emergencyFloor={model.baseline.emergencyFloor}
              />
            </Card>
          </TabsContent>

          <TabsContent value="drivers" className="flex flex-col gap-4">
            {pathPicker}
            <Card>
              {pathAnalysis ? (
                <Tornado
                  items={pathAnalysis.sensitivity}
                  baseline={baselineCash}
                  currency={currency}
                  horizonMonths={horizon}
                />
              ) : (
                <Skeleton className="h-64" />
              )}
            </Card>
          </TabsContent>

          <TabsContent value="time-machine" className="flex flex-col gap-4">
            {pathPicker}
            {tweaked ? (
              <p className="text-sm text-muted">
                The Time Machine follows your original assumptions until you update the story.
              </p>
            ) : null}
            <Card>
              <TimeMachine
                path={storedPath}
                scenario={scenario}
                narrative={narrative}
                storyPending={storyPending}
                currency={currency}
                horizonMonths={horizon}
              />
            </Card>
          </TabsContent>

          <TabsContent value="actions" className="flex flex-col gap-4">
            {pathPicker}
            {pathAnalysis ? (
              <ActionPlan
                narrative={narrative}
                interventions={pathAnalysis.interventions}
                storyPending={storyPending}
                currency={currency}
              />
            ) : (
              <Skeleton className="h-48" />
            )}
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-4 border-t border-border pt-6">
          <div className="flex flex-wrap gap-2">
            <SaveProfile model={model} />
            {confirmEdit ? (
              <Notice
                variant="warning"
                className="w-full"
                action={
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => editAll.mutate()}
                      disabled={editAll.isPending || busy}
                    >
                      Edit assumptions
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmEdit(false)}>
                      Cancel
                    </Button>
                  </div>
                }
              >
                Editing every assumption clears these results until you run the simulation again
                (with a new story). To explore without losing them, use the sliders.
              </Notice>
            ) : (
              <Button variant="secondary" onClick={() => setConfirmEdit(true)} disabled={busy}>
                <Pencil />
                Edit all assumptions
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href="/new">New simulation</Link>
            </Button>
          </div>
          {editAll.isError ? <Notice variant="error">{errorMessage(editAll.error)}</Notice> : null}
        </div>
      </div>

      {/* Desktop: the sliders stay beside the charts. */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl border border-border bg-surface/85 p-5 shadow-pop backdrop-blur-xl">
          <h2 className="mb-4 flex items-center gap-3 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <SlidersHorizontal className="size-4" aria-hidden />
            </span>
            Tweak the future
          </h2>
          {tweakPanel('desk')}
        </div>
      </aside>

      {/* Phones and tablets: a sheet that leaves the charts visible. */}
      <div className="fixed right-4 bottom-4 z-30 lg:hidden">
        <Sheet modal={false}>
          <SheetTrigger asChild>
            <Button size="lg">
              <SlidersHorizontal />
              Tweak
            </Button>
          </SheetTrigger>
          <SheetContent
            overlay={false}
            title="Tweak the future"
            className="max-h-[55dvh] sm:max-h-none"
            onInteractOutside={(event) => event.preventDefault()}
          >
            {tweakPanel('sheet')}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
