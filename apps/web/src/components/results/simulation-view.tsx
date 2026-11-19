'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarRange,
  Dices,
  FileDown,
  GitBranch,
  LoaderCircle,
  Lock,
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
import { PathCards } from '@/components/results/path-cards';
import { PathPicker } from '@/components/results/path-picker';
import { ProgressScreen } from '@/components/results/progress-screen';
import { SaveProfile } from '@/components/results/save-profile';
import { ShareButton } from '@/components/results/share-dialog';
import { TimeMachine } from '@/components/results/time-machine';
import { Tornado } from '@/components/results/tornado';
import { TweakPanel } from '@/components/results/tweak-panel';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { NotFound } from '@/components/wizard/wizard';
import { useEngine } from '@/engine/use-engine';
import { ApiError, api, errorMessage, queryKeys } from '@/lib/api';
import { openGate } from '@/lib/gate-events';
import { useNavigate } from '@/lib/navigation';
import { pdfUpgrade, storyUpgrade, upgradeFromError } from '@/lib/plan-gates';
import { fetchReport, reportFileName, saveFile } from '@/lib/report';
import { PANEL, SCENARIO_LABELS, defaultPathId } from '@/lib/results-view';
import { type TweakValues, activeTweaks, applyTweaks, slidersFor } from '@/lib/tweaks';
import { cn } from '@/lib/utils';

const POLL_MS = 1500;

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

  // On Free a finished simulation keeps its results: a new story (or new assumptions, which
  // need one) is a paid feature. The sliders stay free either way.
  const me = useQuery({ queryKey: queryKeys.me, queryFn: api.me });
  const storyPlan = me.data && stored ? storyUpgrade(me.data.plan) : null;
  const upgradeForStory = storyPlan
    ? () => openGate({ kind: 'upgrade', reason: 'story', plan: storyPlan })
    : null;
  const updateStory = () => (upgradeForStory ? upgradeForStory() : rerun.mutate('tweaks'));

  // PDF reports are a paid feature: Free sees a locked button that opens the upgrade dialog.
  // A plan error from the server opens the same dialog (MutationCache).
  const report = useMutation({
    mutationFn: () => fetchReport(simulation.id),
    onSuccess: (blob) => saveFile(blob, reportFileName(simulation.title)),
  });
  const pdfPlan = me.data ? pdfUpgrade(me.data.plan) : null;
  const downloadReport = () =>
    pdfPlan ? openGate({ kind: 'upgrade', reason: 'pdf', plan: pdfPlan }) : report.mutate();

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

  // The tip names the assumption that moves the selected path most, when it has a slider here.
  const topDriver = stored?.byPath[selectedPathId]?.sensitivity[0];
  const topSlider = topDriver
    ? sliders.find(
        (s) =>
          s.id ===
          (topDriver.field.startsWith('baseline.')
            ? `baseline:${topDriver.field}`
            : `${selectedPathId}:${topDriver.field}`),
      )
    : undefined;
  const hint = topSlider ? (
    <>
      Try <strong className="font-medium text-foreground">{topSlider.label.toLowerCase()}</strong>{' '}
      first: no other assumption moves &ldquo;{selectedPath.name}&rdquo; as much.
    </>
  ) : undefined;

  const tweakPanel = (idPrefix: string, variant: 'panel' | 'sheet') => (
    <TweakPanel
      idPrefix={idPrefix}
      variant={variant}
      groups={groups}
      values={values}
      currency={currency}
      colorIndex={colorIndex}
      tweaked={tweaked}
      computing={engine.computing}
      updating={rerun.isPending}
      hint={hint}
      before={stored?.result.paths ?? result.paths}
      after={result.paths}
      onChange={(sliderId, v) => setValues((current) => ({ ...current, [sliderId]: v }))}
      onReset={() => setValues({})}
      onUpdateStory={updateStory}
    />
  );

  const pathPicker = (
    <PathPicker
      paths={result.paths}
      value={selectedPathId}
      onValueChange={setPathId}
      colorIndex={colorIndex}
    />
  );

  return (
    <div className="flex flex-col gap-6 pb-20 lg:pb-0">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            All simulations
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={downloadReport}
              disabled={!stored || report.isPending}
              aria-label="Download PDF"
            >
              {report.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : pdfPlan ? (
                <Lock />
              ) : (
                <FileDown />
              )}
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">
                {report.isPending ? 'Preparing PDF…' : 'Download PDF'}
              </span>
            </Button>
            <ShareButton simulation={simulation} plan={me.data?.plan} />
          </div>
        </div>
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
              <Button size="sm" onClick={updateStory} disabled={rerun.isPending}>
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
      {/* Plan errors open the upgrade dialog instead. */}
      {rerun.isError && !upgradeFromError(rerun.error) ? (
        <Notice variant="error" title="We couldn't start a new run">
          {errorMessage(rerun.error)}
        </Notice>
      ) : null}
      {report.isError && !upgradeFromError(report.error) ? (
        <Notice variant="error" title="We couldn't create the PDF">
          {errorMessage(report.error)}
        </Notice>
      ) : null}
      {engine.error ? (
        <Notice variant="error" title="These values can't be simulated">
          {engine.error}
        </Notice>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ul className="flex flex-wrap gap-2 text-xs text-muted" aria-label="About this simulation">
          {[
            {
              icon: Dices,
              text: `${result.runs.toLocaleString('en-US')} simulated futures per path`,
            },
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

      <Tabs defaultValue="compare" className="flex flex-col gap-5">
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

        {/* One frame: the selected view on the left, the sliders built into its right edge.
            overflow-clip (not hidden) rounds the corners without breaking the sticky sliders. */}
        <div className="border-gradient overflow-clip rounded-3xl shadow-[0_40px_120px_-40px_rgb(11_207_119/0.3)] sm:rounded-[2rem]">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="min-w-0 p-3 sm:p-6">
              <TabsContent value="compare" className="flex flex-col gap-4">
                <PathCards
                  paths={result.paths}
                  colorIndex={colorIndex}
                  scenario={scenario}
                  currency={currency}
                  horizonMonths={horizon}
                />
                <div className={cn(PANEL, 'pb-2 sm:pb-2')}>
                  <FanChart
                    paths={result.paths}
                    colorIndex={colorIndex}
                    scenario={scenario}
                    currency={currency}
                    horizonMonths={horizon}
                    emergencyFloor={model.baseline.emergencyFloor}
                  />
                </div>
              </TabsContent>

              <TabsContent value="drivers" className="flex flex-col gap-4">
                {pathPicker}
                <div className={PANEL}>
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
                </div>
              </TabsContent>

              <TabsContent value="time-machine" className="flex flex-col gap-4">
                {pathPicker}
                {tweaked ? (
                  <p className="text-sm text-muted">
                    The Time Machine follows your original assumptions until you update the story.
                  </p>
                ) : null}
                <div className={PANEL}>
                  <TimeMachine
                    path={storedPath}
                    scenario={scenario}
                    narrative={narrative}
                    storyPending={storyPending}
                    currency={currency}
                    horizonMonths={horizon}
                  />
                </div>
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
            </div>

            {/* Desktop: the sliders stay beside the charts. The view on the left sets the frame's
                height (the absolute layer keeps the sliders out of it); the panel fills that
                height, or the screen's on long views, where it sticks while the page scrolls. */}
            <aside
              aria-label="Tweak the future"
              className="relative hidden min-h-[34rem] border-l border-border bg-surface-muted/60 lg:block"
            >
              <div className="absolute inset-0">
                <div className="sticky top-24 flex h-full max-h-[calc(100dvh-7rem)] flex-col p-6">
                  {tweakPanel('desk', 'panel')}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </Tabs>

      <div className="flex flex-col gap-4">
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
              Editing every assumption clears these results until you run the simulation again (with
              a new story). To explore without losing them, use the sliders.
            </Notice>
          ) : (
            <Button
              variant="secondary"
              onClick={() => (upgradeForStory ? upgradeForStory() : setConfirmEdit(true))}
              disabled={busy}
            >
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
            {tweakPanel('sheet', 'sheet')}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
