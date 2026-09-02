/**
 * Shared dispatcher for /api/getcabin and /api/menu.
 *
 * Used by BOTH:
 *  - the Vercel serverless functions (api/getcabin.ts, api/menu.ts)
 *  - the Vite dev-server middleware (vite.config.ts) so local dev matches prod
 *
 * Real upstream logic lives in src/lib/sq.ts (single-module contract).
 * Setting SQ_API_BASE=mock swaps in src/lib/sq-mock.ts for demos/tests.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { apiGetCabin as realGetCabin, apiGetMenu as realGetMenu } from '../src/lib/sq';
import { apiGetCabin as mockGetCabin, apiGetMenu as mockGetMenu } from '../src/lib/sq-mock';

export function handleApiRequest(
  kind: 'getcabin' | 'menu',
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const useMock = process.env.SQ_API_BASE === 'mock';
  if (kind === 'getcabin') return (useMock ? mockGetCabin : realGetCabin)(req, res);
  return (useMock ? mockGetMenu : realGetMenu)(req, res);
}
