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

function routeCodesOf(fd: Json | null): string {
  if (!fd) return '';
  const dep = str(fd.departureAirportCode);
  const arr = str(fd.arrivalAirportCode);
  return dep && arr ? `${dep} → ${arr}` : '';
}

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
  const category = str(raw.category) || 'Menu';
  return {
    id: uid('cs'),
    // Hot Beverage + Snack + Chocolate + cold-drink courses hidden by default (toggle them back in the editor)
    include:
      !/^hot\s?bev/i.test(category) &&
      !/^snack/i.test(category) &&
      !/^chocolate/i.test(category) &&
      !(/bev|drink/i.test(category) && COLDISH_RE.test(category)),
    category,
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

/** Looks like a proper-noun place name: every content word capitalised
 *  (small glue words like "of"/"de"/"the" allowed). Kills tasting fragments
 *  such as "Pale in colour" or "with lovely citrus" without any hardcoding. */
function looksProperPlace(c: string): boolean {
  const SMALL = new Set(['of', 'the', 'in', 'on', 'de', 'del', 'della', 'di', 'da', 'du', 'la', 'le', 'les', 'el', 'al', 'and', 'der', 'den', 'val', 'do', 'auf', 'an']);
  let sawUpper = false;
  for (const w of c.split(/\s+/)) {
    const bare = w.toLowerCase().replace(/[^a-zà-ÿ']/g, '');
    if (bare && SMALL.has(bare)) continue;
    if (!/^[A-ZÀ-Þ]/.test(w)) return false;
    sawUpper = true;
  }
  return sawUpper;
}

/** SQ packs wine tasting notes as "Region, blurb…" (e.g. "Marlborough,
 *  New Zealand, This vibrant variety is celebrated…"). Keep only the leading
 *  geographic chunks — proper-noun place words, no digits, no sentences —
 *  and drop tasting-note fragments ("Pale in colour") wherever they appear. */
export function wineRegion(desc: string): string {
  const out: string[] = [];
  for (const raw of desc.split(',')) {
    let c = raw.trim();
    const stop = c.search(/[.;]/); // sentence boundary ends the region list
    if (stop >= 0) c = c.slice(0, stop).trim();
    if (!c || c.length > 28 || /\d/.test(c) || !looksProperPlace(c)) break;
    if (out.some((x) => x.toLowerCase() === c.toLowerCase())) break; // prose restarts on the region name
    out.push(c);
    if (stop >= 0 || out.length >= 3) break;
  }
  return out.join(', ');
}

// ---------- cold-drink detection + defaults ---------------------------------

/** Cold-drink-ish names are never on by default — works at category AND
 *  group level, for any future menu naming. */
const COLDISH_RE = /cold|soft|juice|water|soda|mineral|beer|cocktail/i;

// ---------- protein highlight (compact one-look) ----------------------------

/** Meat & seafood protein vocabulary — matched on word boundaries with the
 *  dish name at render time, so it generalises to any future menu data.
 *  Egg, cheese and vegetarian proteins deliberately not included. */
const PROTEIN_RE =
  /\b(beef|steak|wagyu|veal|chicken|duck|turkey|pork|bacon|ham|lamb|mutton|venison|quail|sausage|chorizo|salami|prosciutto|pepperoni|meatball|fish|salmon|tuna|cod|haddock|seabass|sea bass|barramundi|snapper|mackerel|sardine|trout|halibut|swordfish|prawns|prawn|shrimp|crab|lobster|scallop|mussels|mussel|clam|oyster|squid|calamari|octopus|anchovy)\b/i;

/** First protein word in a dish name → [start, end) or null. */
export function proteinRange(text: string): [number, number] | null {
  const m = PROTEIN_RE.exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
}

// ---------- starch side (compact one-look) ----------------------------------

/** Starchy sides/sauces-vocabulary — the compact sheet drops descriptions, so
 *  the side is pulled from the description and appended to the dish name.
 *  Word-boundary matched; generalises to any future menu data. */
const STARCH_RE =
  /\b(potato|potatoes|r[oö]sti|rice|pilaf|pilau|biryani|congee|noodles?|pasta|fusilli|penne|spaghetti|linguine|fettuccine|tagliatelle|macaroni|pappardelle|vermicelli|gnocchi|polenta|couscous|quinoa|bread|rolls?|bun|brioche|focaccia|ciabatta|sourdough|baguette|croissant|toast|naan|roti|paratha|tortilla|wrap|pita|fries|chips|wedges|udon|soba|ramen)\b/i;

/** Savoury courses that get the starch appended (not desserts/bakery/snacks). */
const FOOD_COURSE_RE = /\b(main|appetis|appetiz|light|starter|entree|entr[eé]e)\b/i;

/** Pull the starch phrase out of a description:
 *  "Braised chicken in red wine sauce, with mashed potatoes, baby spinach"
 *  → "mashed potatoes"; "…served with Asian vegetables and steamed jasmine
 *  rice" → "steamed jasmine rice"; "Singapore-style wok-fried rice noodles
 *  with seafood" → "Singapore-style wok-fried rice noodles" (consecutive
 *  starch nouns are kept whole — "rice" alone would misname the dish).
 *  Returns null when the description names no starch. */
export function starchPhrase(desc: string): string | null {
  for (const raw of desc.split(',')) {
    const seg = raw.trim();
    // when the segment joins two things ("Asian vegetables and steamed
    // jasmine rice"), prefer the half that actually holds the starch
    const halves = seg.split(/\s+and\s+/i);
    const picked = halves.find((h) => STARCH_RE.test(h));
    if (!picked) continue;
    const half = picked.replace(/^(?:served\s+)?(?:with\s+)?/i, '').trim();
    const m = STARCH_RE.exec(half);
    if (!m) continue;
    // keep every modifier ahead of the starch core, cutting at the last
    // linking word ("served with fragrant egg fried rice" → "fragrant egg
    // fried rice", "slow cooked in clay pot with steamed rice" → "steamed rice")
    const before = half.slice(0, m.index);
    let cut = 0;
    for (const lm of before.matchAll(/\b(?:served|with|and|in|on|over|alongside|topped)\b/gi)) {
      cut = (lm.index ?? 0) + lm[0].length;
    }
    // extend through consecutive starch nouns ("rice noodles", not "rice")
    let end = m.index + m[0].length;
    for (let tk = /^\s+([A-Za-z'-]+)/.exec(half.slice(end)); tk && STARCH_RE.test(tk[1]); tk = /^\s+([A-Za-z'-]+)/.exec(half.slice(end))) {
      end += tk[0].length;
    }
    const phrase = half.slice(cut, end).replace(/\s+/g, ' ').trim();
    if (phrase.length > 2) return phrase;
  }
  return null;
}

/** Compact dish line: append the starchy side from the description when the
 *  name doesn't already carry one — "Coq Au Vin" → "Coq Au Vin with mashed
 *  potatoes", "Braised Beef Ragout with Smoked Paprika" → "…with Smoked
 *  Paprika and steamed new potatoes" (name already has "with" → join with
 *  "and"). Dishes whose name names its vehicle (focaccia, wrap, pasta, …)
 *  are left alone; elegant keeps full descriptions instead. */
export function dishLine(name: string, desc: string, category: string): string {
  if (!FOOD_COURSE_RE.test(category)) return name;
  if (STARCH_RE.test(name)) return name;
  const side = desc ? starchPhrase(desc) : null;
  if (!side) return name;
  const joiner = /\bwith\b/i.test(name) ? 'and' : 'with';
  return `${name} ${joiner} ${side}`;
}

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
        // Fortified Wine + cold-drink groups hidden by default (editor eye toggles them back)
        const groupName = subName || catName;
        groups.push({ id: uid('bg'), include: !/fortified/i.test(groupName) && !COLDISH_RE.test(groupName), name: groupName, items });
      }
    }
    if (groups.length > 0) {
      // default OFF for everything except the Champagne & Wine list
      // (cold-drink exclusion guards against combined names)
      out.push({ id: uid('bc'), include: /champagne|wine/i.test(catName) && !COLDISH_RE.test(catName), name: catName || 'Beverages', groups });
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
    // snacks hidden by default — toggle back per group in the editor
    if (items.length > 0) groups.push({ id: uid('sg'), include: false, name: str(sub.name) || 'Snacks', items });
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

  const out: LegSection = {
    id: uid('leg'),
    include: true,
    routeLabel,
    routeCodes: routeCodesOf(fd),
    destCode: fd ? str(fd.arrivalAirportCode) : '',
    timeLabel,
    meals,
    beverages,
    snacks,
    snackNote,
    amenities,
    amenityNote,
    amenitiesOn: false,
    banners,
    bannersOn: false,
    notes,
    notesOn: false
  };
  return out;
}

// ---------- full doc -----------------------------------------------------------

export interface RawPayloadMeta {
  flightNumber?: unknown;
  flightDate?: unknown;
  cabinClass?: unknown;
}

/**
 * Build one menu document.
 *
 * `sectorIndex` (0-based position in each cabin's legs[]) restricts the doc to
 * a single sector — used for multi-sector services where each sector is
 * printed as its own sheet. Cabins that don't operate that sector are omitted.
 */
export function buildDoc(
  query: { flightNumber: string; flightDate: string },
  rawByCabin: Array<{ cabin: CabinCode; payload: unknown }>,
  sectorIndex?: number
): MenuDoc {
  const cabins: CabinSection[] = [];

  for (const { cabin, payload } of rawByCabin) {
    const root = obj(payload);
    let legs = arr(root?.legs)
      .map((l) => obj(l))
      .filter((l): l is Json => l !== null)
      .map(mapLeg);
    if (sectorIndex !== undefined) legs = legs.filter((_, i) => i === sectorIndex);
    cabins.push({
      id: uid('cab'),
      code: cabin,
      title: CABIN_LABELS[cabin],
      legs: legs.filter((l) => l.meals.length > 0 || l.beverages.length > 0 || l.snacks.length > 0 || l.banners.length > 0 || l.amenities.length > 0)
    });
  }

  const filled = cabins.filter((c) => c.legs.length > 0);
  filled.sort((a, b) => CABIN_ORDER.indexOf(a.code) - CABIN_ORDER.indexOf(b.code));

  // sheet title from the live leg data (first available leg)
  let sheetTitle: string | undefined;
  if (sectorIndex !== undefined) {
    const leg = filled.flatMap((c) => c.legs)[0];
    sheetTitle = leg?.routeLabel || undefined;
  }

  return {
    flightLabel: `SQ ${query.flightNumber}`,
    dateLabel: prettyDate(query.flightDate),
    dateISO: query.flightDate,
    defaultsV: 5,
    sheetTitle,
    headerNote: '',
    cabins: filled,
    showDescriptions: true,
    attribution: 'Menu content © Singapore Airlines · Compiled with InkFlight — an unofficial crew tool'
  };
}

/** Bring legacy persisted docs up to the current model (missing print toggles). */
export function migrateDoc(doc: MenuDoc): MenuDoc {
  const v = doc.defaultsV ?? 0;
  for (const cab of doc.cabins) {
    for (const leg of cab.legs) {
      if (leg.amenitiesOn === undefined) leg.amenitiesOn = false;
      if (leg.bannersOn === undefined) leg.bannersOn = false;
      if (leg.notesOn === undefined) leg.notesOn = false;
      for (const cat of leg.beverages) {
        if (cat.include === undefined) cat.include = /champagne|wine/i.test(cat.name) && !COLDISH_RE.test(cat.name);
        else if (v < 4 && COLDISH_RE.test(cat.name)) cat.include = false; // new in v4
        for (const g of cat.groups) {
          if (g.include === undefined) g.include = !/fortified/i.test(g.name) && !COLDISH_RE.test(g.name);
          else if (v < 3 && /fortified/i.test(g.name)) g.include = false; // new in v3
          else if (v < 4 && COLDISH_RE.test(g.name)) g.include = false; // new in v4
        }
      }
      for (const group of leg.snacks) {
        if (group.include === undefined) group.include = false;
      }
      for (const meal of leg.meals) {
        for (const sel of meal.selections) {
          for (const course of sel.courses) {
            if (course.include === undefined) {
              course.include = !/^hot\s?bev/i.test(course.category) && !/^snack/i.test(course.category) && !/^chocolate/i.test(course.category);
            } else {
              if (v < 2 && /^snack/i.test(course.category)) course.include = false; // v2
              if (v < 3 && /^chocolate/i.test(course.category)) course.include = false; // v3
              if (v < 5 && /bev|drink/i.test(course.category) && COLDISH_RE.test(course.category)) course.include = false; // v5
            }
          }
        }
      }
    }
  }
  doc.defaultsV = 5;
  return doc;
}
