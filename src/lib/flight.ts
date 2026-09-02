/** Flight-number & date helpers (client-side Gate 1 + display formatting). */

/** Gate 1 — offline syntax check. Normalizes "SQ346" / " sia 21 " → "21". */
export function normalizeFlight(raw: string): { ok: true; value: string } | { ok: false } {
  const m = /^(?:SQ|SIA)?0*(\d{1,4})[A-Z]?$/i.exec(raw.trim().replace(/\s+/g, ''));
  if (!m) return { ok: false };
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > 9999) return { ok: false };
  return { ok: true, value: String(n) };
}

// ---------------------------------------------------------------------------
// Dates — all local-device time; "YYYY-MM-DD" keys everywhere
// ---------------------------------------------------------------------------

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return todayISO(dt);
}

export function daysBetweenISO(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ta = new Date(ay, am - 1, ad).getTime();
  const tb = new Date(by, bm - 1, bd).getTime();
  return Math.round((tb - ta) / 86_400_000);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = DAYS_SHORT[dt.getDay()];
  return `${dow}, ${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

export function monthName(monthIdx: number): string {
  return MONTHS[monthIdx];
}

export function dowShorts(): string[] {
  return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
}

// ---------------------------------------------------------------------------
// Time parsing from upstream "2026-08-29 14:20:00" strings
// ---------------------------------------------------------------------------

export interface ParsedStamp {
  datePart: string; // "2026-08-29"
  hhmm: string; // "14:20"
  valid: boolean;
}

export function parseStamp(raw: unknown): ParsedStamp {
  if (typeof raw !== 'string' || raw.length < 16) return { datePart: '', hhmm: '', valid: false };
  const datePart = raw.slice(0, 10);
  const hhmm = raw.slice(11, 16);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(datePart) && /^\d{2}:\d{2}$/.test(hhmm);
  return { datePart, hhmm, valid };
}

/** Duration from the UTC pair ONLY — local-clock subtraction lies across time zones. */
export function durationFromUtc(depUtc: unknown, arrUtc: unknown): string {
  const a = parseStamp(depUtc);
  const b = parseStamp(arrUtc);
  if (!a.valid || !b.valid) return '';
  const t1 = Date.parse(`${a.datePart}T${a.hhmm}:00Z`);
  const t2 = Date.parse(`${b.datePart}T${b.hhmm}:00Z`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t2 <= t1) return '';
  const mins = Math.round((t2 - t1) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/** +1d badge = calendar-date difference of the two LOCAL dates. */
export function dayShiftLabel(depLocal: unknown, arrLocal: unknown): string {
  const a = parseStamp(depLocal);
  const b = parseStamp(arrLocal);
  if (!a.valid || !b.valid) return '';
  const shift = daysBetweenISO(a.datePart, b.datePart);
  if (shift <= 0) return '';
  return `+${shift}d`;
}
