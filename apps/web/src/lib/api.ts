/** Server-side base URL of the FUTURIA API. */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export interface ApiHealth {
  status: 'ok';
  service: string;
  engineVersion: string;
  time: string;
}

export async function fetchHealth(): Promise<ApiHealth | null> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return (await res.json()) as ApiHealth;
  } catch {
    return null;
  }
}
