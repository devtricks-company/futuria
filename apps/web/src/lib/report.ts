import type { PathResult, SimulationDto } from '@futuria/shared';
import { ApiError } from './api';

/*
 * PDF reports (Pro). The browser fetches `/api/report/<id>` (app/api/report/[id]/route.tsx),
 * which reads the simulation from the API (where the plan is enforced) and renders the PDF.
 */

export function reportUrl(id: string): string {
  return `/api/report/${id}`;
}

/** "Freelance or stay?" -> "futuria-freelance-or-stay.pdf" (ASCII only, for every browser). */
export function reportFileName(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  return `futuria-${slug || 'report'}.pdf`;
}

/** Fetch a report. API errors (plan, not ready) become ApiError, like every other call. */
export async function fetchReport(id: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(reportUrl(id), { cache: 'no-store' });
  } catch {
    throw new ApiError(0, { message: 'You appear to be offline. Check your connection.' });
  }
  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new ApiError(res.status, body);
  }
  return res.blob();
}

/** Hand a file to the browser's downloads. */
export function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface ReportSummaryRow {
  pathId: string;
  name: string;
  /** Position in the model: the colour slot. */
  index: number;
  probRunOut: number;
  /** Median savings at the horizon, and the P10-P90 spread. */
  cashP10: number;
  cashP50: number;
  cashP90: number;
  medianBreakEvenMonth: number | null;
}

/** One summary line per path, in the model's order. */
export function reportSummary(
  simulation: Pick<SimulationDto, 'model' | 'analysis'>,
): ReportSummaryRow[] {
  const paths: PathResult[] = simulation.analysis?.result.paths ?? [];
  const order = simulation.model?.paths.map((p) => p.id) ?? [];
  return paths
    .map((p) => ({
      pathId: p.pathId,
      name: p.name,
      index: Math.max(0, order.indexOf(p.pathId)),
      probRunOut: p.metrics.probRunOut,
      cashP10: p.metrics.cashAtHorizon.p10,
      cashP50: p.metrics.cashAtHorizon.p50,
      cashP90: p.metrics.cashAtHorizon.p90,
      medianBreakEvenMonth: p.metrics.medianBreakEvenMonth,
    }))
    .sort((a, b) => a.index - b.index);
}
