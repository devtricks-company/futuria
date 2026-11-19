import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import type { ApiErrorBody } from '@futuria/shared';
import { ANON_COOKIE, anonCookieOptions, validAnonId } from '@/lib/anon';
import { DEV_USER_COOKIE, backendFetch, sessionToken } from '@/lib/backend';
import { clerkEnabled } from '@/lib/clerk';

/*
 * Same-origin proxy to the FUTURIA API. The browser calls /api/backend/<path>; this handler adds
 * the user's credentials and forwards only known endpoints, so the request (and its token) can't
 * be pointed anywhere else. The API stays private and needs no CORS for the web app.
 *
 * With Clerk, a signed-out visitor gets an anonymous id (lib/anon.ts) so they can draft a
 * simulation before the signup gate; the first signed-in call hands it over and drops it.
 */
const ALLOWED: RegExp[] = [
  /^me$/,
  /^me\/profile$/,
  /^simulations$/,
  /^simulations\/intake$/,
  /^simulations\/[a-f0-9]{24}$/,
  /^simulations\/[a-f0-9]{24}\/(answers|model|run|renarrate|share)$/,
  /^billing\/(checkout|portal|sync)$/,
];

const MAX_BODY_BYTES = 256 * 1024;

function errorResponse(body: ApiErrorBody): Response {
  return Response.json(body, { status: body.statusCode, headers: { 'cache-control': 'no-store' } });
}

/** Who to call the API as: the Clerk session, plus the anonymous id when there is one. */
async function identity(request: NextRequest) {
  const cookie = validAnonId(request.cookies.get(ANON_COOKIE)?.value);
  if (!clerkEnabled) return { token: null, anonId: undefined, issued: undefined, claim: false };
  const token = await sessionToken();
  if (token) return { token, anonId: cookie, issued: undefined, claim: Boolean(cookie) };
  const anonId = cookie ?? randomUUID();
  return { token: null, anonId, issued: cookie ? undefined : anonId, claim: false };
}

async function forward(
  request: NextRequest,
  { params }: RouteContext<'/api/backend/[...path]'>,
): Promise<Response> {
  const path = (await params).path.join('/');
  if (!ALLOWED.some((pattern) => pattern.test(path))) {
    return errorResponse({
      statusCode: 404,
      error: 'Not Found',
      code: 'not_found',
      message: 'Unknown endpoint',
    });
  }

  const hasBody = request.method !== 'GET' && request.method !== 'DELETE';
  const body = hasBody ? await request.text() : undefined;
  if (body && body.length > MAX_BODY_BYTES) {
    return errorResponse({
      statusCode: 413,
      error: 'Payload Too Large',
      code: 'too_large',
      message: 'Request body is too large',
    });
  }

  const who = await identity(request);
  let upstream: Response;
  try {
    upstream = await backendFetch(`/${path}`, {
      method: request.method,
      body: body || undefined,
      devUser: request.cookies.get(DEV_USER_COOKIE)?.value,
      token: who.token,
      anonId: who.anonId,
    });
  } catch {
    return errorResponse({
      statusCode: 502,
      error: 'Bad Gateway',
      code: 'api_unreachable',
      message: 'The FUTURIA API is not reachable right now. Please try again shortly.',
    });
  }

  const headers = new Headers({ 'cache-control': 'no-store' });
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const payload = upstream.status === 204 ? null : await upstream.arrayBuffer();
  const response = new NextResponse(payload, { status: upstream.status, headers });
  if (who.issued) response.cookies.set(ANON_COOKIE, who.issued, anonCookieOptions);
  // A successful signed-in call with the anonymous id has claimed its drafts.
  if (who.claim && upstream.ok) response.cookies.delete(ANON_COOKIE);
  return response;
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
