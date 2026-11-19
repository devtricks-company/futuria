import type { PublicShareDto, SharedPathDto } from '@futuria/shared';
import { formatPercent } from './format';

/*
 * Pure helpers for public share pages (`/share/[slug]`) and the share dialog. Everything here
 * works from the public view, which holds chances and months, never amounts.
 */

/** The public page of a share link. */
export function sharePath(slug: string): string {
  return `/share/${slug}`;
}

/** Drivers worth naming: at least 5% of the total swing. */
export function meaningfulDrivers(path: SharedPathDto): SharedPathDto['topDrivers'] {
  return path.topDrivers.filter((d) => d.share >= 0.05);
}

/**
 * Levers that make a path safer or break even sooner, biggest drop in the chance of running out
 * first (then earlier break-even).
 */
export function helpfulLevers(path: SharedPathDto, max = 3): SharedPathDto['levers'] {
  const monthsGained = (l: SharedPathDto['levers'][number]) =>
    l.breakEvenMonthAfter === null
      ? 0
      : (l.breakEvenMonthBefore ?? l.breakEvenMonthAfter + 12) - l.breakEvenMonthAfter;
  return path.levers
    .filter((l) => l.probRunOutBefore - l.probRunOutAfter >= 0.005 || monthsGained(l) > 0)
    .sort(
      (a, b) =>
        b.probRunOutBefore - b.probRunOutAfter - (a.probRunOutBefore - a.probRunOutAfter) ||
        monthsGained(b) - monthsGained(a),
    )
    .slice(0, max);
}

/** The path a visitor most needs advice on: the riskiest one that isn't "stay in my job". */
export function riskiestPath(paths: SharedPathDto[]): SharedPathDto | undefined {
  const pool = paths.filter((p) => p.type !== 'stay');
  return [...(pool.length ? pool : paths)].sort((a, b) => b.probRunOut - a.probRunOut)[0];
}

const MAX_DESCRIPTION = 300;

/**
 * One or two sentences for link previews: each path's chance of running out and when it covers
 * its costs. Never amounts, even when the page shows them.
 */
export function shareDescription(share: Pick<PublicShareDto, 'paths' | 'horizonMonths'>): string {
  const parts = share.paths.map((p) => {
    const risk = `${p.name}: ${formatPercent(p.probRunOut)} chance of running out`;
    return p.type === 'stay' || p.medianBreakEvenMonth === null
      ? risk
      : `${risk}, covers its costs from month ${p.medianBreakEvenMonth}`;
  });
  const text = `${parts.join('. ')}. ${share.horizonMonths} months, simulated with FUTURIA.`;
  return text.length <= MAX_DESCRIPTION ? text : `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`;
}
