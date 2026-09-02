/** Client → our own /api (same-origin). Typed errors, no leaks upstream. */

import type { ApiError } from './types';

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  stale?: boolean;
  error?: ApiError;
}

export class ApiFailure extends Error {
  code: ApiError['code'];
  constructor(err: ApiError) {
    super(err.message);
    this.code = err.code;
  }
}

const TIMEOUT_MS = 16_000; // slightly above the server's upstream timeout

function unreadableHint(status: number): string {
  if (status === 200 || status === 404)
    return 'This deployment served a web page instead of the menu API — the /api functions look missing. Redeploy the latest commit and try again (see README → Troubleshooting).';
  if (status === 504 || status === 502)
    return 'The request timed out at the server. Give it a moment and try again.';
  return `The service answered HTTP ${status} with an unreadable body. Try again.`;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<{ data: T; stale: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiFailure({ code: 'UPSTREAM_TIMEOUT', message: 'The menu service took too long to answer. Try again.' });
    }
    throw new ApiFailure({ code: 'UPSTREAM_NETWORK', message: 'You appear to be offline. Check your connection and try again.' });
  }
  clearTimeout(timer);

  const text = await res.text();
  let env: ApiEnvelope<T> | null = null;
  try {
    env = JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    env = null;
  }
  if (!env || typeof env.ok !== 'boolean') {
    throw new ApiFailure({ code: 'UPSTREAM_HTTP', message: unreadableHint(res.status) });
  }
  if (!env.ok || !env.data) {
    throw new ApiFailure(env.error ?? { code: 'UPSTREAM_HTTP', message: 'Unknown service error.' });
  }
  return { data: env.data, stale: env.stale === true };
}

export interface CabinResult {
  cabinClasses: string[];
}

export function fetchCabins(flightNumber: string, flightDate: string): Promise<{ data: CabinResult; stale: boolean }> {
  return post<CabinResult>('/api/getcabin', { flightNumber, flightDate });
}

export function fetchMenu(flightNumber: string, flightDate: string, cabinClass: string): Promise<{ data: unknown; stale: boolean }> {
  return post<unknown>('/api/menu', { flightNumber, flightDate, cabinClass });
}
