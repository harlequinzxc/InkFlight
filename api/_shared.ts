/**
 * Shared dispatcher for the /api routes.
 *
 * Used by BOTH:
 *  - the Vercel serverless functions (api/cabins.ts, api/getcabin.ts, api/menu.ts)
 *  - the Vite dev-server middleware (vite.config.ts) so local dev matches prod
 *
 * Real upstream logic lives in src/lib/sq.ts (single-module contract).
 * Setting SQ_API_BASE=mock swaps in src/lib/sq-mock.ts for demos/tests.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { apiGetCabin as realGetCabin, apiGetMenu as realGetMenu } from '../src/lib/sq';
import { apiGetCabin as mockGetCabin, apiGetMenu as mockGetMenu } from '../src/lib/sq-mock';

export type ApiKind = 'cabins' | 'menu';

/** Synthesize a body object from the query string for GET requests. */
function bodyFromUrl(req: IncomingMessage): Record<string, unknown> {
  const url = new URL(req.url ?? '/', 'http://local');
  const out: Record<string, unknown> = {};
  for (const [k, v] of url.searchParams.entries()) out[k] = v;
  return out;
}

export async function handleApiRequest(
  kind: ApiKind,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // GET /api/cabins?flight=11&date=YYYY-MM-DD — spec client shape.
  if (req.method === 'GET') {
    (req as IncomingMessage & { body?: unknown }).body = bodyFromUrl(req);
  }

  const useMock = process.env.SQ_API_BASE === 'mock';
  if (kind === 'cabins') return (useMock ? mockGetCabin : realGetCabin)(req, res);
  return (useMock ? mockGetMenu : realGetMenu)(req, res);
}
