import type {
  ApiErrorBody,
  DecisionModel,
  IntakeAnswersRequest,
  MeDto,
  Profile,
  ProfileDto,
  SimulationDto,
  SimulationSummaryDto,
} from '@futuria/shared';

/*
 * Browser client for the FUTURIA API, through the same-origin proxy at /api/backend (see
 * app/api/backend/[...path]/route.ts). Use it from Client Components (TanStack Query).
 */

const BASE = '/api/backend';

/** An API error with its structured body ({ statusCode, code, message, issues }). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly issues: ApiErrorBody['issues'];

  constructor(status: number, body: Partial<ApiErrorBody> | null) {
    super(body?.message || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code;
    this.issues = body?.issues;
  }

  /** Worth retrying: the server or AI was busy or unavailable, not a problem with the request. */
  get retryable(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

/** Show a readable message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, { message: 'You appear to be offline. Check your connection.' });
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, data as Partial<ApiErrorBody> | null);
  return data as T;
}

export const api = {
  me: () => request<MeDto>('GET', '/me'),
  profile: () => request<ProfileDto>('GET', '/me/profile'),
  saveProfile: (profile: Profile) => request<ProfileDto>('PUT', '/me/profile', profile),

  listSimulations: () => request<SimulationSummaryDto[]>('GET', '/simulations'),
  getSimulation: (id: string) => request<SimulationDto>('GET', `/simulations/${id}`),
  deleteSimulation: (id: string) => request<void>('DELETE', `/simulations/${id}`),

  /** Claude reads the decision: scope, safety, questions and proposed paths (~10 s). */
  intake: (decisionText: string) =>
    request<SimulationDto>('POST', '/simulations/intake', { decisionText }),
  saveAnswers: (id: string, body: IntakeAnswersRequest) =>
    request<SimulationDto>('PATCH', `/simulations/${id}/answers`, body),
  /** Claude builds the decision model from the answers (~30 s). */
  buildModel: (id: string) => request<SimulationDto>('POST', `/simulations/${id}/model`),
  updateModel: (id: string, model: DecisionModel) =>
    request<SimulationDto>('PATCH', `/simulations/${id}/model`, { model }),
  /** Queue the engine + story pipeline (202); poll getSimulation until ready or failed. */
  run: (id: string) => request<SimulationDto>('POST', `/simulations/${id}/run`),
};

export const queryKeys = {
  me: ['me'] as const,
  profile: ['profile'] as const,
  simulations: ['simulations'] as const,
  simulation: (id: string) => ['simulation', id] as const,
};
