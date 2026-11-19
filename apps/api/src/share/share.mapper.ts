import { futuresChart } from '@futuria/engine';
import {
  PLANS,
  type PathAnalysis,
  type PlanId,
  type ShareViewDto,
  type SharedPathDto,
  type SimulationResult,
} from '@futuria/shared';
import { iso } from '../simulations/simulation.mapper.js';
import type { Simulation } from '../simulations/simulation.schema.js';

/** What a share view reads; the decision text, intake and AI usage are never even loaded. */
export type SharedSimulation = Pick<
  Simulation,
  'title' | 'model' | 'analysis' | 'narrative' | 'share' | 'lastRunAt'
>;

/** Inputs listed per path as "what matters most". */
const TOP_DRIVERS = 3;
/** Chart size for strangers: enough futures to show the spread, small enough for social cards. */
const SHARE_RUNS_PER_PATH = 24;
const SHARE_MAX_POINTS = 25;

function sharedPath(
  path: SimulationResult['paths'][number],
  index: number,
  analysis: PathAnalysis | undefined,
): SharedPathDto {
  const { metrics } = path;
  return {
    pathId: path.pathId,
    name: path.name,
    type: path.type,
    index,
    probRunOut: metrics.probRunOut,
    medianRunOutMonth: metrics.medianRunOutMonth,
    probBreakEven: metrics.probBreakEven,
    medianBreakEvenMonth: metrics.medianBreakEvenMonth,
    topDrivers: [...(analysis?.sensitivity ?? [])]
      .sort((a, b) => b.share - a.share)
      .slice(0, TOP_DRIVERS)
      .map(({ label, share }) => ({ label, share })),
    // Labels only: descriptions quote amounts ("add about $X to your savings").
    levers: (analysis?.interventions ?? []).map(({ label, before, after }) => ({
      label,
      probRunOutBefore: before.probRunOut,
      probRunOutAfter: after.probRunOut,
      breakEvenMonthBefore: before.medianBreakEvenMonth,
      breakEvenMonthAfter: after.medianBreakEvenMonth,
    })),
  };
}

/**
 * The public view of a shared simulation. Without `showNumbers` it holds chances, months, labels
 * and chart geometry (whose scale isn't included), never amounts. `ownerPlan` decides the
 * watermark: plans with `watermarkedShare` (Free) get one.
 */
export function toShareView(doc: SharedSimulation, ownerPlan: PlanId): ShareViewDto {
  const slug = doc.share.slug!;
  const watermark = PLANS[ownerPlan].features.watermarkedShare;
  const { analysis, model } = doc;
  if (!analysis || !model) return { status: 'updating', slug, title: doc.title, watermark };

  const showNumbers = doc.share.showNumbers ?? false;
  const { result } = analysis;
  const indexOf = (pathId: string) =>
    Math.max(
      0,
      model.paths.findIndex((p) => p.id === pathId),
    );
  return {
    status: 'ready',
    slug,
    title: doc.title,
    lastRunAt: iso(doc.lastRunAt),
    horizonMonths: result.horizonMonths,
    currency: result.currency,
    watermark,
    showNumbers,
    chart: futuresChart(model, result, {
      seed: result.seed,
      runsPerPath: SHARE_RUNS_PER_PATH,
      maxPoints: SHARE_MAX_POINTS,
      hideMoney: !showNumbers,
    }),
    paths: result.paths.map((path) =>
      sharedPath(path, indexOf(path.pathId), analysis.byPath[path.pathId]),
    ),
    details: showNumbers
      ? {
          analysis,
          narrative: doc.narrative ?? null,
          emergencyFloor: model.baseline.emergencyFloor,
        }
      : null,
  };
}
