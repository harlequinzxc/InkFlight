/** Client → our own /api (same-origin). Typed errors, no leaks upstream. */

import type { ApiError, CabinOption, SectorOption } from './types';

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

async function request<T>(path: string, init: RequestInit): Promise<{ data: T; stale: boolean; mode: 'mock' | 'live' | null }> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err; // caller decides (race guard)
    throw new ApiFailure({ code: 'UPSTREAM_NETWORK', message: 'You appear to be offline. Check your connection and try again.' });
  }
  const mode = res.headers.get('x-inkflight-mode') === 'mock' ? 'mock' : res.headers.get('x-inkflight-mode') === 'live' ? 'live' : null;

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
  return { data: env.data, stale: env.stale === true, mode };
}

function withTimeout(signal: AbortSignal | undefined): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onOuterAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onOuterAbort);
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
    }
  };
}

/** GET /api/cabins?flight=11&date=YYYY-MM-DD — normalized cabin options. */
export interface CabinCheckData {
  flight: string;
  flightDate: string;
  cabins: CabinOption[];
  /** Discovered live from the flight's legs[] — present only for multi-sector runs. */
  sectors?: SectorOption[];
}

export async function fetchCabins(
  flightNumber: string,
  flightDate: string,
  signal?: AbortSignal
): Promise<{ data: CabinCheckData; stale: boolean; mode: 'mock' | 'live' | null }> {
  const t = withTimeout(signal);
  try {
    return await request<CabinCheckData>(
      `/api/cabins?flight=${encodeURIComponent(flightNumber)}&date=${encodeURIComponent(flightDate)}`,
      { method: 'GET', signal: t.signal, headers: { Accept: 'application/json' } }
    );
  } finally {
    t.done();
  }
}

export async function fetchMenu(
  flightNumber: string,
  flightDate: string,
  cabinClass: string,
  signal?: AbortSignal
): Promise<{ data: unknown; stale: boolean }> {
  const t = withTimeout(signal);
  try {
    const r = await request<unknown>('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ flightNumber, flightDate, cabinClass }),
      signal: t.signal
    });
    return { data: r.data, stale: r.stale };
  } finally {
    t.done();
  }
}
