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

const TIMEOUT_MS = 16_000; // slightly above the server's 12 s upstream timeout

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
  } catch {
    clearTimeout(timer);
    throw new ApiFailure({ code: 'UPSTREAM_NETWORK', message: 'You appear to be offline. Check your connection and try again.' });
  }
  clearTimeout(timer);

  let env: ApiEnvelope<T>;
  try {
    env = (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiFailure({ code: 'UPSTREAM_HTTP', message: 'The service returned something unreadable. Try again.' });
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
