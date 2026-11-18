import { auth } from '@clerk/nextjs/server';
import { clerkEnabled } from './clerk';

/*
 * Server-side access to the FUTURIA API (NestJS). Only Route Handlers and Server Components may
 * import this module: it reads the Clerk session and the server-only API_URL.
 */

/** Base URL of the API, server-side only. */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Dev identity for the API's AUTH_MODE=dev (ignored by the API in Clerk mode, and dev mode is
 * refused in production). The Playwright tests set it per test so their data stays separate.
 */
export const DEV_USER_COOKIE = 'futuria_dev_user';
const DEV_USER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface BackendRequest {
  method?: string;
  /** JSON text, forwarded as-is. */
  body?: string;
  devUser?: string;
}

/** Call the API as the current user: Clerk session token when signed in, else the dev identity. */
export async function backendFetch(path: string, init: BackendRequest = {}): Promise<Response> {
  const headers = new Headers({ accept: 'application/json' });
  if (init.body !== undefined) headers.set('content-type', 'application/json');

  const token = clerkEnabled ? await (await auth()).getToken() : null;
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.devUser && DEV_USER_PATTERN.test(init.devUser)) headers.set('x-dev-user', init.devUser);

  return fetch(new URL(path, API_URL), {
    method: init.method ?? 'GET',
    headers,
    body: init.body,
    redirect: 'error',
    cache: 'no-store',
  });
}
