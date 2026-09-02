import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleApiRequest } from './_shared';

/** GET /api/cabins?flight=11&date=YYYY-MM-DD (also accepts POST JSON). */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: { code: 'BAD_INPUT', message: 'GET or POST only.' } }));
    return;
  }
  await handleApiRequest('cabins', req, res);
}
