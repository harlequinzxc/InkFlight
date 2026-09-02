/**
 * Shared dispatcher for /api/getcabin and /api/menu.
 *
 * Used by BOTH:
 *  - the Vercel serverless functions (api/getcabin.ts, api/menu.ts)
 *  - the Vite dev-server middleware (vite.config.ts) so local dev matches prod
 *
 * All upstream logic lives in src/lib/sq.ts (single-module contract).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { apiGetCabin, apiGetMenu } from '../src/lib/sq';

export function handleApiRequest(
  kind: 'getcabin' | 'menu',
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (kind === 'getcabin') return apiGetCabin(req, res);
  return apiGetMenu(req, res);
}
