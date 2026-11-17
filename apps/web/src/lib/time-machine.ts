import {
  type EngineEvent,
  type EngineEventType,
  type InterventionResult,
  type Milestone,
  type PathNarrative,
  type PathResult,
  type ScenarioKey,
  milestoneMonths,
} from '@futuria/shared';

/*
 * The Time Machine pairs each story milestone with the engine's numbers for the same month of
 * the same representative run, so every figure on screen comes from the engine, never from the
 * prose. Without a story (still writing, or refused) the engine timeline stands on its own.
 */

export interface TimelineStep {
  month: number;
  cash: number;
  income: number;
  expenses: number;
  /** Engine events since the previous step (month > previous, ≤ this month). */
  events: EngineEvent[];
  milestone: Milestone | null;
}

export const EVENT_LABELS: Record<EngineEventType, string> = {
  first_client: 'First paying client',
  client_lost: 'Lost a client',
  layoff: 'Laid off',
  reemployed: 'Back in a job',
  first_revenue: 'First revenue',
  funded: 'Raised funding',
  startup_failed: 'Business shut down',
  job_found: 'Started the new job',
  switched_full_time: 'Went full-time freelance',
  ran_out: 'Ran out of money',
};

export function buildTimeline(
  path: PathResult,
  scenario: ScenarioKey,
  narrative: PathNarrative | null | undefined,
  horizonMonths: number,
): TimelineStep[] {
  const run = path.scenarios[scenario];
  const story = new Map<number, Milestone>();
  for (const m of narrative?.scenarios[scenario] ?? []) {
    // Claude writes the month; ignore anything outside the simulated range.
    if (Number.isInteger(m.month) && m.month >= 0 && m.month <= horizonMonths)
      story.set(m.month, m);
  }
  const months = [...new Set([...milestoneMonths(horizonMonths), ...story.keys()])].sort(
    (a, b) => a - b,
  );
  let previous = 0;
  return months.map((month) => {
    const step: TimelineStep = {
      month,
      cash: run.cash[month] ?? 0,
      income: run.income[month] ?? 0,
      expenses: run.expenses[month] ?? 0,
      events: run.events.filter((e) => e.month > previous && e.month <= month),
      milestone: story.get(month) ?? null,
    };
    previous = month;
    return step;
  });
}

export interface ActionCard {
  key: string;
  title: string;
  why: string | null;
  steps: string[];
  impact: InterventionResult | null;
}

/**
 * Story action items joined to the engine's intervention impacts (by interventionId), then the
 * levers the story didn't mention, so every computed impact is visible.
 */
export function buildActions(
  narrative: PathNarrative | null | undefined,
  interventions: InterventionResult[],
): { story: ActionCard[]; other: ActionCard[] } {
  const byId = new Map(interventions.map((i) => [i.id, i]));
  const used = new Set<string>();
  const story = (narrative?.actionPlan ?? []).map((item, index) => {
    const impact = item.interventionId ? (byId.get(item.interventionId) ?? null) : null;
    if (impact) used.add(impact.id);
    return {
      key: `story-${index}`,
      title: item.title,
      why: item.why,
      steps: item.steps,
      impact,
    };
  });
  const other = interventions
    .filter((i) => !used.has(i.id))
    .map((i) => ({ key: i.id, title: i.label, why: i.description, steps: [], impact: i }));
  return { story, other };
}
