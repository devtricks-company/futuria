import type { ShareSettingsDto, SimulationDto, SimulationSummaryDto } from '@futuria/shared';
import type { Simulation } from './simulation.schema.js';

type StoredSimulation = Simulation & { _id: unknown };

export const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : null);

/** Share settings; documents from before `showNumbers` existed keep amounts private. */
export function toShareSettings(share: StoredSimulation['share'] | undefined): ShareSettingsDto {
  return {
    slug: share?.slug ?? null,
    isPublic: share?.isPublic ?? false,
    showNumbers: share?.showNumbers ?? false,
  };
}

export function toSimulationDto(doc: StoredSimulation): SimulationDto {
  return {
    id: String(doc._id),
    title: doc.title,
    decisionText: doc.decisionText,
    status: doc.status,
    intake: doc.intake ?? null,
    model: doc.model ?? null,
    seed: doc.seed,
    analysis: doc.analysis ?? null,
    narrative: doc.narrative ?? null,
    engineVersion: doc.engineVersion ?? null,
    promptVersion: doc.promptVersion ?? null,
    error: doc.error ?? null,
    share: toShareSettings(doc.share),
    createdAt: iso(doc.createdAt)!,
    updatedAt: iso(doc.updatedAt)!,
    lastRunAt: iso(doc.lastRunAt),
  };
}

export function toSimulationSummaryDto(
  doc: Pick<
    StoredSimulation,
    '_id' | 'title' | 'status' | 'model' | 'createdAt' | 'updatedAt' | 'lastRunAt'
  >,
): SimulationSummaryDto {
  return {
    id: String(doc._id),
    title: doc.title,
    status: doc.status,
    pathCount: doc.model?.paths.length ?? 0,
    createdAt: iso(doc.createdAt)!,
    updatedAt: iso(doc.updatedAt)!,
    lastRunAt: iso(doc.lastRunAt),
  };
}
