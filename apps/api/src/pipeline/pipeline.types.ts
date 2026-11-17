import type { PathNarrative, AiUsageRecord } from '@futuria/shared';

/** Inngest event that starts a run. */
export const RUN_EVENT = 'simulation/run.requested';

/**
 * One pipeline run. `runId` is stored on the simulation when the run is queued; every step only
 * touches the simulation while it still carries that id, so a stale run (the person edited the
 * model or started another run) can never overwrite newer state.
 */
export interface RunJob {
  simulationId: string;
  userId: string;
  runId: string;
  /** "full": engine + narrative. "narrate": refresh the story, keep the engine results. */
  mode: 'full' | 'narrate';
}

export interface ClaimedRun {
  pathIds: string[];
  needsEngine: boolean;
}

export interface PathStory {
  pathId: string;
  narrative: PathNarrative | null;
  usage: AiUsageRecord | null;
  /** Public message when the story for this path couldn't be written. */
  error: string | null;
}
