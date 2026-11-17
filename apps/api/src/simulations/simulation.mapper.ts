import type { SimulationDto, SimulationSummaryDto } from '@futuria/shared';
import type { Simulation } from './simulation.schema.js';

type StoredSimulation = Simulation & { _id: unknown };

const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : null);

export function toSimulationDto(doc: StoredSimulation): SimulationDto {
  return {
    id: String(doc._id),
    title: doc.title,
    decisionText: doc.decisionText,
    status: doc.status,
    model: doc.model ?? null,
    seed: doc.seed,
    analysis: doc.analysis ?? null,
    engineVersion: doc.engineVersion ?? null,
    error: doc.error ?? null,
    share: { slug: doc.share?.slug ?? null, isPublic: doc.share?.isPublic ?? false },
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
