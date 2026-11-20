import { renderToBuffer } from '@react-pdf/renderer';
import type { NextRequest } from 'next/server';
import type { ApiErrorBody, SimulationDto } from '@futuria/shared';
import { ReportDocument } from '@/components/report/report-document';
import { DEV_USER_COOKIE, backendFetch } from '@/lib/backend';
import { reportFileName } from '@/lib/report';

/*
 * GET /api/report/<id>: the simulation as a PDF (Pro and up). The API decides: its
 * /simulations/:id/report route checks the owner and the plan, and its errors (403 plan_feature,
 * 404, 409 not_ready) pass through as JSON for the client's upgrade dialog. The PDF is rendered
 * here with @react-pdf/renderer (one of Next's default server-external packages).
 */
const OBJECT_ID = /^[a-f0-9]{24}$/;

function errorResponse(body: ApiErrorBody): Response {
  return Response.json(body, { status: body.statusCode, headers: { 'cache-control': 'no-store' } });
}

export async function GET(request: NextRequest, { params }: RouteContext<'/api/report/[id]'>) {
  const { id } = await params;
  if (!OBJECT_ID.test(id)) {
    return errorResponse({
      statusCode: 404,
      error: 'Not Found',
      code: 'not_found',
      message: 'Simulation not found',
    });
  }

  let upstream: Response;
  try {
    // The signed-in user's Clerk session (the default), or the dev identity in AUTH_MODE=dev.
    // No anonymous id: reports need an account.
    upstream = await backendFetch(`/simulations/${id}/report`, {
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
  if (!upstream.ok) {
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  }

  const simulation = (await upstream.json()) as SimulationDto;
  const pdf = await renderToBuffer(
    <ReportDocument simulation={simulation} generatedAt={new Date()} />,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${reportFileName(simulation.title)}"`,
      'cache-control': 'private, no-store',
    },
  });
}
