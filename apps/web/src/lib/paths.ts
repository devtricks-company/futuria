import type { PathType, ProposedPath } from '@futuria/shared';

export const PATH_TYPE_LABELS: Record<PathType, string> = {
  stay: 'Stay in my job',
  freelance: 'Freelance full-time',
  hybrid: 'Freelance on the side, then switch',
  startup: 'Start a business',
  newJob: 'Take a new job',
};

export const PATH_TYPE_HINTS: Record<PathType, string> = {
  stay: 'Keep the current job, with raises and a small layoff risk.',
  freelance: 'Quit and find clients: time to the first client, rate and hours drive it.',
  hybrid: 'Keep the job for a while, build clients on the side, then go full-time.',
  startup: 'Build a company: time to revenue, growth and burn drive it.',
  newJob: 'Switch employers: time to find the job and the new pay drive it.',
};

/** A unique, API-valid id for a new path of this type ("freelance", "freelance-2", ...). */
export function newPathId(type: PathType, existing: readonly { id: string }[]): string {
  const base = type.toLowerCase();
  const taken = new Set(existing.map((p) => p.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const id = `${base}-${i}`;
    if (!taken.has(id)) return id;
  }
}

/** True when the person renamed, edited, removed, added or reordered a path. */
export function pathsChanged(a: readonly ProposedPath[], b: readonly ProposedPath[]): boolean {
  if (a.length !== b.length) return true;
  return a.some(
    (p, i) =>
      p.id !== b[i]!.id ||
      p.name !== b[i]!.name ||
      p.type !== b[i]!.type ||
      p.summary !== b[i]!.summary,
  );
}

/** Trim names and summaries the way the API stores them. */
export function cleanPaths(paths: readonly ProposedPath[]): ProposedPath[] {
  return paths.map((p) => ({
    ...p,
    name: p.name.trim(),
    summary: p.summary.trim().slice(0, 300),
  }));
}
