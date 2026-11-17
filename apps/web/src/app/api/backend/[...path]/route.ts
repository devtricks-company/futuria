import type { NextRequest } from 'next/server';
import type { ApiErrorBody } from '@futuria/shared';
import { DEV_USER_COOKIE, backendFetch } from '@/lib/backend';

/*
 * Same-origin proxy to the FUTURIA API. The browser calls /api/backend/<path>; this handler adds
 * the user's credentials and forwards only known endpoints, so the request (and its token) can't
 * be pointed anywhere else. The API stays private and needs no CORS for the web app.
 */
const ALLOWED: RegExp[] = [
  /^me$/,
  /^me\/profile$/,
  /^simulations$/,
  /^simulations\/intake$/,
  /^simulations\/[a-f0-9]{24}$/,
  /^simulations\/[a-f0-9]{24}\/(answers|model|run|renarrate)$/,
];

const MAX_BODY_BYTES = 256 * 1024;

function errorResponse(body: ApiErrorBody): Response {
  return Response.json(body, { status: body.statusCode, headers: { 'cache-control': 'no-store' } });
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

  let upstream: Response;
  try {
    upstream = await backendFetch(`/${path}`, {
      method: request.method,
      body: body || undefined,
      devUser: request.cookies.get(DEV_USER_COOKIE)?.value,
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
  return new Response(payload, { status: upstream.status, headers });
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
