'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';

let browserQueryClient: QueryClient | undefined;

function makeQueryClient(): QueryClient {
  return new QueryClient({
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
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
