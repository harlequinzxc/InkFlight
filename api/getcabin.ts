import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleApiRequest } from './_shared';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: { code: 'BAD_INPUT', message: 'POST only.' } }));
    return;
  }
  await handleApiRequest('getcabin', req, res);
}
