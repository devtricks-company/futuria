import type { UpgradeRequest } from './plan-gates';

/*
 * A tiny event bus between whatever hits a plan gate (a mutation error anywhere, a locked
 * control) and the one GateProvider that shows the dialog. The TanStack MutationCache lives
 * outside React, so it can't use context directly.
 */
export type GateRequest =
  | ({ kind: 'upgrade' } & UpgradeRequest)
  | {
      kind: 'signup';
      /** Where to come back after signing up (defaults to the current page). */
      returnTo?: string;
      /** For "see your N futures". */
      pathCount?: number;
    };

type Listener = (request: GateRequest) => void;
const listeners = new Set<Listener>();

export function openGate(request: GateRequest): void {
  for (const listener of listeners) listener(request);
}

export function onGate(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
