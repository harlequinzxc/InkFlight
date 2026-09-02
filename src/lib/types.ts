/** Normalized + editable document model for InkFlight. */

export type CabinCode = 'FCL' | 'JCL' | 'SCL' | 'YCL';

/** Normalized cabin option returned by /api/cabins (spec shape). */
export interface CabinOption {
  code: CabinCode;
  label: string;
  short: string;
}

export const CABIN_META: CabinOption[] = [
  { code: 'FCL', label: 'Suites & First Class', short: 'First' },
  { code: 'JCL', label: 'Business Class', short: 'Business' },
  { code: 'SCL', label: 'Premium Economy', short: 'Premium Economy' },
  { code: 'YCL', label: 'Economy Class', short: 'Economy' }
];

export const CABIN_LABELS: Record<CabinCode, string> = Object.fromEntries(
  CABIN_META.map((c) => [c.code, c.label])
) as Record<CabinCode, string>;

export const CABIN_ORDER: CabinCode[] = CABIN_META.map((c) => c.code);

// ---------------------------------------------------------------------------
// Editable menu document (what the paper renders)
// ---------------------------------------------------------------------------

export interface MenuItem {
  id: string;
  include: boolean;
  name: string;
  desc: string;
}

export interface Course {
  id: string;
  include: boolean;
  category: string;
  /** >1 means "choose one of N" (from upstream maxSequence) */
  choose: number;
  items: MenuItem[];
}

export interface Selection {
  id: string;
  include: boolean;
  name: string;
  footnote: string;
  courses: Course[];
}

export interface MealService {
  id: string;
  include: boolean;
  name: string;
  writeUp: string;
  selections: Selection[];
}

export interface BeverageItem {
  id: string;
  include: boolean;
  name: string;
  desc: string;
}

/** Sub-category level (e.g. "White", "Red", "Aperitifs"). */
export interface BeverageGroup {
  id: string;
  include: boolean;
  name: string;
  items: BeverageItem[];
}

export interface BeverageCategory {
  id: string;
  include: boolean;
  name: string;
  groups: BeverageGroup[];
}

export interface SnackGroup {
  id: string;
  include: boolean;
  name: string;
  items: BeverageItem[];
}

export interface LegSection {
  id: string;
  include: boolean;
  routeLabel: string; // "Singapore → Tokyo"
  timeLabel: string; // "14:20 → 17:50 +1d · 6h 45m"
  meals: MealService[];
  beverages: BeverageCategory[];
  snacks: SnackGroup[];
  snackNote: string;
  amenities: string[];
  amenityNote: string;
  banners: string[];
  notes: string[];
}

export interface CabinSection {
  id: string;
  code: CabinCode;
  title: string;
  legs: LegSection[];
}

export interface MenuDoc {
  flightLabel: string; // "SQ 346"
  dateLabel: string; // "Sat, 6 Sep 2026"
  /** Route label of this sheet when part of a multi-sector print run */
  sheetTitle?: string;
  headerNote: string; // optional line under the title
  cabins: CabinSection[];
  showDescriptions: boolean;
  attribution: string;
}

export type LayoutKind = 'elegant' | 'compact';
export type PaperSize = 'A4' | 'A6';

// ---------------------------------------------------------------------------
// Raw API envelope from our own /api
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | 'BAD_INPUT'
  | 'BAD_DATE'
  | 'NOT_FOUND'
  | 'NO_CABINS'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_NETWORK'
  | 'UPSTREAM_HTTP'
  | 'RATE_LIMITED';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

let uidCounter = 0;
export function uid(prefix = 'x'): string {
  uidCounter += 1;
  return `${prefix}${Date.now().toString(36)}${uidCounter}`;
}
