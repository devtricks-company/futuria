import type { NextRequest } from 'next/server';
import { ANALYTICS, RELAY_REQUEST_HEADERS, relayTarget } from '@/lib/analytics-config';

/*
 * /ingest/*: relays the browser's analytics to PostHog (events to the API host, the SDK's
 * static files to the assets host). Only the body, query and a few harmless headers go through:
 * never cookies or the Clerk session, which a plain rewrite would forward. Off (404) without a
 * PostHog key. Clerk's proxy skips this path (src/proxy.ts matcher).
 */

async function relay(
  request: NextRequest,
  { params }: RouteContext<'/ingest/[...path]'>,
): Promise<Response> {
  if (!ANALYTICS.key) return new Response(null, { status: 404 });
  const target = relayTarget((await params).path, request.nextUrl.search, ANALYTICS);

  const headers = new Headers();
  for (const name of RELAY_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // PostHog places events by the visitor's IP (country), not ours.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (ip) headers.set('x-forwarded-for', ip);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return new Response(null, { status: 502 });
  }

  // fetch has already decoded the body, so content-encoding and length don't carry over.
  const out = new Headers();
  for (const name of ['content-type', 'cache-control']) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { relay as GET, relay as POST, relay as OPTIONS };
