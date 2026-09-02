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
  | 'NOT_FOUND'
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

const TTL_OK = 6 * 60 * 60 * 1000; // menus rarely change pre-flight (spec: ~6 h)
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

async function callUpstream(path: string, body: UpstreamBody): Promise<{ http: number; json: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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
    if (ctrl.signal.aborted) throw new SqError('UPSTREAM_TIMEOUT', 'The menu service took too long to answer.', 504);
    throw new SqError('UPSTREAM_NETWORK', 'Could not reach the menu service.', 502);
  } finally {
    clearTimeout(timer);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new SqError('UPSTREAM_HTTP', 'The menu service returned a malformed response.', 502);
  }
  if (!res.ok) throw new SqError('UPSTREAM_HTTP', `The menu service returned HTTP ${res.status}.`, 502);
  return { http: res.status, json };
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
        'No flight found for that number and date. Menus are typically published from today up to 8 days before departure.',
        404
      );
    }
    throw new SqError('UPSTREAM_HTTP', `The menu service reported status ${sc}.`, 502);
  }
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

export async function getCabins(q: SqQuery): Promise<{ cabinClasses: string[]; stale?: boolean }> {
  const flightNumber = cleanFlightNumber(q.flightNumber);
  const flightDate = cleanDate(q.flightDate);
  const key = `cabin:SQ${flightNumber}:${flightDate}`;

  const hit = cacheGet(key);
  if (hit && Date.now() - hit.at < hit.ttlMs) return { cabinClasses: (hit.payload as { cabinClasses: string[] }).cabinClasses };

  try {
    const { json } = await callUpstream('getcabin', {
      carrierId: 'SQ',
      flightNumber,
      flightDate,
      sessionId: sessionId()
    });
    assertBodyStatus(json);
    const cabins = (json as { cabinClasses?: unknown })?.cabinClasses;
    if (!Array.isArray(cabins) || cabins.length === 0) {
      throw new SqError(
        'NOT_FOUND',
        'No flight found for that number and date. Menus are typically published from today up to 8 days before departure.',
        404
      );
    }
    const payload = { cabinClasses: cabins.filter((c): c is string => typeof c === 'string') };
    cachePut(key, payload, TTL_OK);
    return payload;
  } catch (err) {
    // Stale-fallback only for transient upstream failures — NEVER for a real miss.
    if (hit && err instanceof SqError && err.code !== 'NOT_FOUND' && err.code !== 'BAD_INPUT') {
      return { cabinClasses: (hit.payload as { cabinClasses: string[] }).cabinClasses, stale: true };
    }
    throw err;
  }
}

export async function getMenu(q: SqQuery): Promise<{ data: unknown; stale?: boolean }> {
  const flightNumber = cleanFlightNumber(q.flightNumber);
  const flightDate = cleanDate(q.flightDate);
  const cabinClass = cleanCabin(q.cabinClass);
  const key = `SQ${flightNumber}:${flightDate}:${cabinClass}`;

  const hit = cacheGet(key);
  if (hit && Date.now() - hit.at < hit.ttlMs) return { data: hit.payload };

  try {
    const { json } = await callUpstream('menu', {
      carrierId: 'SQ',
      flightNumber,
      flightDate,
      cabinClass,
      sessionId: sessionId()
    });
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
    sendJson(res, 200, { ok: true, data, ...(data.stale ? { stale: true } : {}) });
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

