'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { GateProvider } from '@/components/billing/gate-provider';
import { ApiError } from '@/lib/api';
import { openGate } from '@/lib/gate-events';
import { isSignupRequired, upgradeFromError } from '@/lib/plan-gates';

let browserQueryClient: QueryClient | undefined;

function makeQueryClient(): QueryClient {
  return new QueryClient({
    // Any mutation that hits a plan gate opens the upgrade dialog or the signup gate.
    mutationCache: new MutationCache({
      onError: (error) => {
        const upgrade = upgradeFromError(error);
        if (upgrade) openGate({ kind: 'upgrade', ...upgrade });
        else if (isSignupRequired(error)) openGate({ kind: 'signup' });
      },
    }),
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // Retry only failures worth retrying (network, 5xx); a 404 or 409 won't change.
        retry: (failures, error) =>
          failures < 2 && (!(error instanceof ApiError) || error.retryable || error.status === 0),
      },
      mutations: { retry: false },
    },
  });
}

function getQueryClient(): QueryClient {
  // Keep server renders isolated and the browser cache alive across renders.
  if (typeof window === 'undefined') return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <GateProvider>{children}</GateProvider>
    </QueryClientProvider>
  );
}
