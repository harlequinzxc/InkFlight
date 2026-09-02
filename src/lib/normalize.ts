/**
 * Raw /menu payload → normalized, editable MenuDoc.
 *
 * Parsing rules (from the API contract):
 *  - sectors first: legs[] parsed independently, never merged
 *  - EN_UK only — other locale blocks are empty shells
 *  - maxSequence > 1 ⇒ "choose one of N"
 *  - snacks may be absent — absence is normal, not an error
 *  - isSnackBag is a flag ⇒ banner, never a snack list
 *  - empty strings/arrays mean absent — render nothing, skip nullish
 *  - never fabricate: only map what actually arrived
 */

import {
  CABIN_LABELS,
  CABIN_ORDER,
  uid,
  type BeverageCategory,
  type BeverageGroup,
  type BeverageItem,
  type CabinCode,
  type CabinSection,
  type Course,
  type LegSection,
  type MealService,
  type MenuDoc,
  type Selection,
  type SnackGroup
} from './types';
import { dayShiftLabel, durationFromUtc, parseStamp, prettyDate } from './flight';

// ---------- loose raw shapes (upstream is undocumented — stay tolerant) -----

type Json = Record<string, unknown>;

const obj = (v: unknown): Json | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const bool = (v: unknown): boolean => v === true;

function enUk(node: unknown): Json | null {
  const lang = obj(node)?.language;
  const langObj = obj(lang);
  if (!langObj) return null;
  return obj(langObj.EN_UK) ?? obj(langObj.en_uk);
}

// ---------- times / route ---------------------------------------------------

function routeAndTime(fd: Json | null): { routeLabel: string; timeLabel: string } {
  if (!fd) return { routeLabel: '', timeLabel: '' };
  const depCity = str(fd.departureCityName) || str(fd.departureAirportCode);
  const arrCity = str(fd.arrivalCityName) || str(fd.arrivalAirportCode);
  const dep = parseStamp(fd.departureLocalDate);
  const arr = parseStamp(fd.arrivalLocalDate);
  const route = depCity && arrCity ? `${depCity} → ${arrCity}` : depCity || arrCity;
  const shift = dayShiftLabel(fd.departureLocalDate, fd.arrivalLocalDate);
  const dur = durationFromUtc(fd.departureUtcDate, fd.arrivalUtcDate);
  const time = dep.valid && arr.valid ? `${dep.hhmm} → ${arr.hhmm}${shift ? ' ' + shift : ''}` : '';
  const timeLabel = [time, dur].filter(Boolean).join(' · ');
  return { routeLabel: route, timeLabel };
}

// ---------- meals -----------------------------------------------------------

function mapItem(raw: Json): BeverageItem {
  const name = str(raw.name);
  let desc = str(raw.description);
  if (!desc) desc = str(raw.longDescription);
  if (!desc) desc = str(raw.footnote);
  return { id: uid('it'), include: true, name, desc };
}

function mapCourse(raw: Json): Course {
  const items = arr(raw.items)
    .map((i) => obj(i))
    .filter((i): i is Json => i !== null && str(i.name) !== '')
    .map(mapItem);
  const maxSeq = typeof raw.maxSequence === 'number' ? raw.maxSequence : 0;
  return {
    id: uid('cs'),
    include: true,
    category: str(raw.category) || 'Menu',
    choose: maxSeq > 1 ? maxSeq : 0,
    items
  };
}

function mapSelection(raw: Json): Selection {
  const footnote = [str(raw.footnoteName), str(raw.footnote)].filter(Boolean).join(' · ');
  return {
    id: uid('sel'),
    include: true,
    name: str(raw.name),
    footnote,
    courses: arr(raw.mealCourses)
      .map((c) => obj(c))
      .filter((c): c is Json => c !== null)
      .map(mapCourse)
  };
}

function mapMealService(raw: Json): MealService {
  const sels = arr(raw.selectionDetails)
    .map((s) => obj(s))
    .filter((s): s is Json => s !== null)
    .map(mapSelection);
  // Fallback: meals with courses but no selectionDetails wrapper
  if (sels.length === 0 && Array.isArray(raw.mealCourses)) {
    sels.push({
      id: uid('sel'),
      include: true,
      name: '',
      footnote: '',
      courses: arr(raw.mealCourses)
        .map((c) => obj(c))
        .filter((c): c is Json => c !== null)
        .map(mapCourse)
    });
  }
  return {
    id: uid('ms'),
    include: true,
    name: str(raw.mealServiceName) || 'Meal Service',
    writeUp: str(raw.mealServiceWriteUp),
    selections: sels.filter((s) => s.courses.some((c) => c.items.length > 0))
  };
}

// ---------- beverages -------------------------------------------------------

function mapBeverages(bevRoot: unknown): BeverageCategory[] {
  const block = enUk(bevRoot);
  if (!block) return [];
  const cats = arr(block.categories)
    .map((c) => obj(c))
    .filter((c): c is Json => c !== null);

  const out: BeverageCategory[] = [];
  for (const cat of cats) {
    const catName = str(cat.name);
    const groups: BeverageGroup[] = [];
    for (const sub of arr(cat.subcategories).map((s) => obj(s)).filter((s): s is Json => s !== null)) {
      const subName = str(sub.name);
      const items: BeverageItem[] = [];
      for (const spec of arr(sub.specialities).map((s) => obj(s)).filter((s): s is Json => s !== null)) {
        for (const item of arr(spec.items).map((i) => obj(i)).filter((i): i is Json => i !== null)) {
          const mapped = mapItem(item);
          if (mapped.name) items.push(mapped);
        }
      }
      if (items.length > 0) {
        groups.push({ id: uid('bg'), include: true, name: subName || catName, items });
      }
    }
    if (groups.length > 0) {
      out.push({ id: uid('bc'), include: true, name: catName || 'Beverages', groups });
    }
  }
  return out;
}

// ---------- snacks & amenities ----------------------------------------------

function mapSnacks(drySnack: unknown): { groups: SnackGroup[]; note: string } {
  const root = obj(drySnack);
  if (!root) return { groups: [], note: '' };
  const cat = obj(root.category);
  const note = str(root.header);
  const groups: SnackGroup[] = [];
  for (const sub of arr(cat?.subcategories).map((s) => obj(s)).filter((s): s is Json => s !== null)) {
    const items = arr(sub.items)
      .map((i) => obj(i))
      .filter((i): i is Json => i !== null && str(i.name) !== '')
      .map(mapItem);
    if (items.length > 0) groups.push({ id: uid('sg'), include: true, name: str(sub.name) || 'Snacks', items });
  }
  return { groups, note };
}

function mapAmenities(am: unknown): { items: string[]; note: string } {
  const root = obj(am);
  if (!root) return { items: [], note: '' };
  const note = str(root.header);
  const items = arr(root.items)
    .map((i) => obj(i))
    .filter((i): i is Json => i !== null)
    .map((i) => {
      const n = str(i.itemName) || str(i.name);
      const d = str(i.itemDescription);
      return d ? `${n} (${d})` : n;
    })
    .filter((n) => n !== '');
  return { items, note };
}

// ---------- one leg -----------------------------------------------------------

function mapLeg(legRaw: Json): LegSection {
  const fd = obj(legRaw.flightDetails);
  const { routeLabel, timeLabel } = routeAndTime(fd);

  // meals — EN_UK only, sorted by mealServiceNumber
  const mealBlock = enUk(obj(legRaw.menu));
  const meals = arr(mealBlock?.meals)
    .map((m) => obj(m))
    .filter((m): m is Json => m !== null)
    .sort((a, b) => {
      const na = Number(a.mealServiceNumber ?? 0) || 0;
      const nb = Number(b.mealServiceNumber ?? 0) || 0;
      return na - nb;
    })
    .map(mapMealService)
    .filter((m) => m.selections.length > 0);

  const beverages = mapBeverages(legRaw.beverage);
  const { groups: snacks, note: snackNote } = mapSnacks(legRaw.drySnack);
  const { items: amenities, note: amenityNote } = mapAmenities(legRaw.amenities);

  const banners: string[] = [];
  if (bool(legRaw.isNoMenuPlanned)) banners.push('Menu is not yet confirmed — selections may change without prior notice.');
  if (bool(legRaw.isSnackBag)) banners.push('This sector operates a snack bag service instead of a full meal service.');
  if (bool(legRaw.isBentoBox)) banners.push('A bento box service operates on this sector.');
  if (bool(legRaw.isHawkerPromo)) banners.push('A special local promotion features on this sector.');

  const notes: string[] = [];
  const chef = obj(legRaw.guestChef);
  if (chef) {
    const h = str(chef.header);
    const m = str(chef.message);
    if (h || m) notes.push([h, m].filter(Boolean).join(' — '));
  }
  const apology = str(mealBlock?.apologyFootnote);
  if (apology) notes.push(apology);

  return {
    id: uid('leg'),
    include: true,
    routeLabel,
    timeLabel,
    meals,
    beverages,
    snacks,
    snackNote,
    amenities,
    amenityNote,
    banners,
    notes
  };
}

// ---------- full doc -----------------------------------------------------------

export interface RawPayloadMeta {
  flightNumber?: unknown;
  flightDate?: unknown;
  cabinClass?: unknown;
}

export function buildDoc(
  query: { flightNumber: string; flightDate: string },
  rawByCabin: Array<{ cabin: CabinCode; payload: unknown }>
): MenuDoc {
  const cabins: CabinSection[] = [];

  for (const { cabin, payload } of rawByCabin) {
    const root = obj(payload);
    const legs = arr(root?.legs)
      .map((l) => obj(l))
      .filter((l): l is Json => l !== null)
      .map(mapLeg);
    cabins.push({
      id: uid('cab'),
      code: cabin,
      title: CABIN_LABELS[cabin],
      legs: legs.filter((l) => l.meals.length > 0 || l.beverages.length > 0 || l.snacks.length > 0 || l.banners.length > 0 || l.amenities.length > 0)
    });
  }

  cabins.sort((a, b) => CABIN_ORDER.indexOf(a.code) - CABIN_ORDER.indexOf(b.code));

  return {
    flightLabel: `SQ ${query.flightNumber}`,
    dateLabel: prettyDate(query.flightDate),
    headerNote: '',
    cabins,
    showDescriptions: true,
    attribution: 'Menu content © Singapore Airlines · Compiled with InkFlight — an unofficial crew tool'
  };
}
