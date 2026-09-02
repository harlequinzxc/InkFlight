/**
 * ============================================================================
 *  src/lib/sq.ts — THE ENTIRE UPSTREAM SINGAPORE AIRLINES INFLIGHT-MENU
 *  CONTRACT LIVES HERE. SERVER-SIDE ONLY — never import from client code.
 * ============================================================================
 *
 *  This is an observed, UNDOCUMENTED internal API. It may change shape or
 *  gain protection at any time — if it breaks, this one module is the only
 *  place that needs an edit.
 *
 *  Discovered by inspecting the client bundle of
 *  https://inflightmenu.singaporeair.com/home (Redux Toolkit Query catalog).
 *  No auth exists: `sessionId` is a client-generated UUID, `checksum` is an
 *  optional cache hint we safely omit.
 *
 *  Be a polite client: we cache per key, rate-limit, timeout, and fall back
 *  to stale copies. We never fabricate menu items.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { CABIN_META, CABIN_ORDER, type CabinCode, type CabinOption, type SectorOption } from './types';

// ---------------------------------------------------------------------------
// Endpoints & headers
// ---------------------------------------------------------------------------

const BASE = process.env.SQ_API_BASE ?? 'https://cifp.auto.prod.c0.singaporeair.com/api';
const SITE_ORIGIN = 'https://inflightmenu.singaporeair.com';
const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const TIMEOUT_MS = 8_000; // must sit WELL under the serverless function cap (10 s) so we always answer typed JSON, never a platform timeout page

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export type SqErrorCode =
  | 'BAD_INPUT'
  | 'BAD_DATE'
  | 'NOT_FOUND'
  | 'NO_CABINS'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_NETWORK'
  | 'UPSTREAM_HTTP'
  | 'RATE_LIMITED';

export class SqError extends Error {
  code: SqErrorCode;
  httpStatus: number;
  constructor(code: SqErrorCode, message: string, httpStatus: number) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// ---------------------------------------------------------------------------
// Input validation (server-side clamping — the client does its own Gate 1)
// ---------------------------------------------------------------------------

const FLIGHT_RE = /^(?:SQ|SIA)?0*(\d{1,4})[A-Z]?$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface SqQuery {
  flightNumber: string; // digits only, e.g. "11"
  flightDate: string; // YYYY-MM-DD
  cabinClass?: string;
}

function cleanFlightNumber(raw: unknown): string {
  if (typeof raw !== 'string') throw new SqError('BAD_INPUT', 'Flight number is required.', 400);
  const m = FLIGHT_RE.exec(raw.trim());
  if (!m) throw new SqError('BAD_INPUT', 'That does not look like an SQ flight number.', 400);
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > 9999)
    throw new SqError('BAD_INPUT', 'Flight number out of range (1–9999).', 400);
  return String(n);
}

function cleanDate(raw: unknown): string {
  if (typeof raw !== 'string' || !DATE_RE.test(raw.trim()))
    throw new SqError('BAD_INPUT', 'Date must be YYYY-MM-DD.', 400);
  return raw.trim();
}

function cleanCabin(raw: unknown): string {
  const known = ['FCL', 'JCL', 'SCL', 'YCL'];
  const v = String(raw ?? '').trim().toUpperCase();
  if (!known.includes(v)) throw new SqError('BAD_INPUT', 'Unknown cabin class.', 400);
  return v;
}

function sessionId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Cache — per key, TTL, stale fallback. In-memory per serverless instance;
// that is deliberate politeness (fewer upstream hits), not durability.
// ---------------------------------------------------------------------------

interface CacheEntry {
  at: number;
  ttlMs: number;
  payload: unknown;
}

const cache = new Map<string, CacheEntry>();
const CACHE_MAX = 300;

function cacheGet(key: string): CacheEntry | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  // refresh LRU position
  cache.delete(key);
  cache.set(key, e);
  return e;
}

function cachePut(key: string, payload: unknown, ttlMs: number): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), ttlMs, payload });
}

const TTL_OK = 30 * 60 * 1000; // within the 15–60 min politeness band (menus rarely change pre-flight)
const TTL_MISS = 5 * 60 * 1000; // NOT_FOUND — menus get published, so minutes only

// ---------------------------------------------------------------------------
// Rate limiting — mild per-IP sliding window (per warm instance)
// ---------------------------------------------------------------------------

const RATE_MAX = 30;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, number[]>();

function rateLimit(ip: string): void {
  const now = Date.now();
  const hits = (rateBuckets.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    throw new SqError('RATE_LIMITED', 'Too many requests — give it a few seconds.', 429);
  }
  hits.push(now);
  rateBuckets.set(ip, hits);
  if (rateBuckets.size > 5000) rateBuckets.clear();
}

function ipOf(req: IncomingMessage): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Upstream call
// ---------------------------------------------------------------------------

interface UpstreamBody {
  carrierId: 'SQ';
  flightNumber: string;
  flightDate: string;
  cabinClass?: string;
  sessionId: string;
}

async function callUpstream(path: string, body: UpstreamBody, timeoutMs = TIMEOUT_MS): Promise<{ http: number; json: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: SITE_ORIGIN,
        Referer: `${SITE_ORIGIN}/`,
        'User-Agent': UA
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
  } catch (err) {
    if (ctrl.signal.aborted) throw new SqError('UPSTREAM_TIMEOUT', 'The menu service is temporarily unreachable. Please retry in a moment.', 504);
    console.error(`[sq] ${path} network failure:`, err instanceof Error ? err.message : err);
    throw new SqError('UPSTREAM_NETWORK', 'The menu service is temporarily unreachable. Please retry in a moment.', 502);
  } finally {
    clearTimeout(timer);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    console.error(`[sq] ${path} HTTP ${res.status} returned a non-JSON body (length ${Number(res.headers.get('content-length')) || '?'}) — upstream may be blocking datacenter requests or an edge page intervened.`);
    throw new SqError('UPSTREAM_HTTP', 'The menu service is temporarily unreachable. Please retry in a moment.', 502);
  }
  if (!res.ok) {
    console.error(`[sq] ${path} HTTP ${res.status} with body statusCode ${(json as { statusCode?: number })?.statusCode}`);
    throw new SqError('UPSTREAM_HTTP', `The menu service answered HTTP ${res.status}.`, 502);
  }
  return { http: res.status, json };
}

/**
 * Deadline-budgeted call: the serverless function has a hard wall-clock cap,
 * so we retry transient upstream failures only while time actually remains
 * (one fast retry). `statusCode 101` NOT_FOUND is thrown by the caller and
 * is deliberately NEVER retried — it is a real answer, not a failure.
 */
const DEADLINE_MS = 8_600;
async function callUpstreamWithRetry(path: string, body: UpstreamBody, budgetMs = DEADLINE_MS): Promise<{ http: number; json: unknown }> {
  const start = Date.now();
  let attempt = 0;
  for (;;) {
    const remaining = budgetMs - (Date.now() - start);
    try {
      return await callUpstream(path, body, Math.min(6_000, Math.max(1_500, remaining)));
    } catch (err) {
      const retryable = err instanceof SqError && (err.code === 'UPSTREAM_TIMEOUT' || err.code === 'UPSTREAM_NETWORK' || err.code === 'UPSTREAM_HTTP');
      const timeLeft = budgetMs - (Date.now() - start);
      if (retryable && attempt < 2 && timeLeft >= 2_200) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 300 * attempt));
        continue;
      }
      throw err;
    }
  }
}

/**
 * The HTTP status is NOT authoritative — the body's `statusCode` is.
 * 200 = ok · 101 = flight/menu not found (usually the date window).
 */
function assertBodyStatus(json: unknown): void {
  const sc = (json as { statusCode?: number } | null)?.statusCode;
  if (sc !== undefined && sc !== 200) {
    if (sc === 101) {
      throw new SqError(
        'NOT_FOUND',
        'No flight found for that number and date. Check the flight operates that day, or try again closer to departure.',
        404
      );
    }
    throw new SqError('UPSTREAM_HTTP', `The menu service reported status ${sc}.`, 502);
  }
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

/** Server-side date window: today … +6 weeks (the live menu site's horizon),
 *  with ±1 day of slack for timezone skew (the server runs UTC). */
function assertDateWindow(flightDate: string): void {
  const now = new Date();
  const iso = (d: Date): string =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const today = new Date(`${iso(now)}T00:00:00Z`);
  const min = new Date(today.getTime() - 86_400_000);
  const max = new Date(today.getTime() + 43 * 86_400_000);
  const d = new Date(`${flightDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d < min || d > max) {
    throw new SqError(
      'BAD_DATE',
      'That date is outside the booking window — menus can be checked from today up to 6 weeks ahead.',
      400
    );
  }
}

export interface CabinCheckResult {
  flight: string;
  flightDate: string;
  cabins: CabinOption[];
  /** Live-discovered sectors — only when the flight operates 2+ legs. */
  sectors?: SectorOption[];
}

function normalizeCabins(raw: unknown): CabinOption[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(CABIN_ORDER);
  const out: CabinOption[] = CABIN_ORDER.map((code) => (raw.includes(code) ? CABIN_META.find((m) => m.code === code) : undefined)).filter(
    (c): c is CabinOption => c !== undefined
  );
  // preserve any unknown upstream codes at the end rather than dropping them
  for (const r of raw) {
    if (typeof r === 'string' && !known.has(r)) out.push({ code: r as CabinCode, label: r, short: r });
  }
  return out;
}

/**
 * Derive the sector list straight from the live legs[] — never hardcoded.
 * Labels are the 3-letter IATA station pair (e.g. "SIN → NRT"), in the exact
 * order the menu system returns, so the picker always matches the flight.
 */
function sectorOptionsFrom(payload: unknown): SectorOption[] | undefined {
  const legs = (payload as { legs?: unknown } | null)?.legs;
  if (!Array.isArray(legs)) return undefined;
  const out: SectorOption[] = [];
  legs.forEach((leg, i) => {
    const fd = (leg as { flightDetails?: Record<string, unknown> } | null)?.flightDetails ?? {};
    const dep = String(fd.departureAirportCode || fd.departureCityName || '').trim();
    const arr = String(fd.arrivalAirportCode || fd.arrivalCityName || '').trim();
    if (!dep || !arr) return;
    out.push({ seq: i + 1, label: `${dep} → ${arr}` });
  });
  return out.length > 1 ? out : undefined;
}

export async function getCabins(q: SqQuery): Promise<CabinCheckResult & { stale?: boolean }> {
  const flightNumber = cleanFlightNumber(q.flightNumber);
  const flightDate = cleanDate(q.flightDate);
  assertDateWindow(flightDate);
  const key = `cabin:SQ${flightNumber}:${flightDate}`;

  const hit = cacheGet(key);
  if (hit && Date.now() - hit.at < hit.ttlMs) return hit.payload as CabinCheckResult;

  try {
    const { json } = await callUpstreamWithRetry('getcabin', {
      carrierId: 'SQ',
      flightNumber,
      flightDate,
      sessionId: sessionId()
    }, 5_000);
    assertBodyStatus(json);
    const cabins = normalizeCabins((json as { cabinClasses?: unknown })?.cabinClasses);
    if (cabins.length === 0) {
      throw new SqError('NO_CABINS', 'We found the flight, but no menu cabins are open for it yet. Try again closer to departure.', 404);
    }
    const payload: CabinCheckResult = { flight: flightNumber, flightDate, cabins };

    // Dynamic sector discovery (best-effort): pull the menu for the first known
    // cabin and read its legs[] flightDetails. Later, when the user picks cabins
    // for real, this menu comes back as a cache hit — no extra upstream load.
    // Total serverless budget stays < 10 s: 5 s (cabins) + 3.4 s (discovery).
    const firstKnown = cabins.find((c) => (CABIN_ORDER as string[]).includes(c.code));
    if (firstKnown) {
      try {
        const menu = await getMenu({ flightNumber, flightDate, cabinClass: firstKnown.code }, 3_400);
        const sectors = sectorOptionsFrom(menu.data);
        if (sectors) payload.sectors = sectors;
      } catch (err) {
        console.error('[sq] sector discovery skipped:', err instanceof Error ? err.message : err);
      }
    }

    cachePut(key, payload, TTL_OK);
    return payload;
  } catch (err) {
    // Stale-fallback only for transient upstream failures — NEVER for a real miss.
    if (hit && err instanceof SqError && err.code !== 'NOT_FOUND' && err.code !== 'BAD_INPUT' && err.code !== 'BAD_DATE' && err.code !== 'NO_CABINS') {
      return { ...(hit.payload as CabinCheckResult), stale: true };
    }
    throw err;
  }
}

export async function getMenu(q: SqQuery, budgetMs = DEADLINE_MS): Promise<{ data: unknown; stale?: boolean }> {
  const flightNumber = cleanFlightNumber(q.flightNumber);
  const flightDate = cleanDate(q.flightDate);
  const cabinClass = cleanCabin(q.cabinClass);
  const key = `SQ${flightNumber}:${flightDate}:${cabinClass}`;

  const hit = cacheGet(key);
  if (hit && Date.now() - hit.at < hit.ttlMs) return { data: hit.payload };

  try {
    const { json } = await callUpstreamWithRetry('menu', {
      carrierId: 'SQ',
      flightNumber,
      flightDate,
      cabinClass,
      sessionId: sessionId()
    }, budgetMs);
    assertBodyStatus(json);
    cachePut(key, json, TTL_OK);
    return { data: json };
  } catch (err) {
    if (hit && err instanceof SqError && err.code !== 'NOT_FOUND' && err.code !== 'BAD_INPUT') {
      return { data: hit.payload, stale: true }; // offline copy · may be outdated
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// HTTP plumbing shared by the Vercel functions and the dev middleware
// ---------------------------------------------------------------------------

export type ApiResult = { status: number; json: Record<string, unknown> };

function ipRate(req: IncomingMessage): void {
  rateLimit(ipOf(req));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  // Vercel pre-parses JSON bodies into `req.body`; the dev middleware does not.
  const pre = (req as { body?: unknown }).body;
  if (pre !== undefined && pre !== null && typeof pre === 'object' && !Array.isArray(pre)) {
    return pre as Record<string, unknown>;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new SqError('BAD_INPUT', 'Request body must be JSON.', 400);
  }
}


export function sendJson(res: ServerResponse, status: number, json: unknown): void {
  const body = JSON.stringify(json);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

export async function apiGetCabin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    ipRate(req);
    const body = await readJsonBody(req);
    const data = await getCabins({
      flightNumber: String(body.flightNumber ?? ''),
      flightDate: String(body.flightDate ?? '')
    });
    const { stale, ...payload } = data;
    sendJson(res, 200, { ok: true, data: payload, ...(stale ? { stale: true } : {}) });
  } catch (err) {
    if (err instanceof SqError) sendJson(res, err.httpStatus, { ok: false, error: { code: err.code, message: err.message } });
    else sendJson(res, 500, { ok: false, error: { code: 'UPSTREAM_HTTP', message: 'Unexpected server error.' } });
  }
}

export async function apiGetMenu(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    ipRate(req);
    const body = await readJsonBody(req);
    const result = await getMenu({
      flightNumber: String(body.flightNumber ?? ''),
      flightDate: String(body.flightDate ?? ''),
      cabinClass: String(body.cabinClass ?? '')
    });
    sendJson(res, 200, { ok: true, data: result.data, ...(result.stale ? { stale: true } : {}) });
  } catch (err) {
    if (err instanceof SqError) {
      sendJson(res, err.httpStatus, { ok: false, error: { code: err.code, message: err.message } });
    } else sendJson(res, 500, { ok: false, error: { code: 'UPSTREAM_HTTP', message: 'Unexpected server error.' } });
  }
}

