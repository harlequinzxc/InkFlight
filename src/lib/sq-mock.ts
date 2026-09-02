/**
 * sq-mock.ts — DEMO/TEST-ONLY stand-in for the real SQ upstream.
 *
 * Enabled with SQ_API_BASE=mock (used for previews and UI demos). It emits the
 * SAME envelope + typed-error semantics as src/lib/sq.ts, so the whole app —
 * gates, banners, snack-bag handling, NOT_FOUND copy, dynamic sector discovery
 * — behaves exactly as it will against the real service in production.
 *
 * Sector handling mirrors production: sector options are DERIVED FROM THE
 * legs[] of the menu payload (never a separate table). Route fixtures:
 *  - 11: SIN→HND→LAX   · 12: LAX→NRT→SIN        (Tokyo tag)
 *  - 25: SIN→FRA→JFK   · 26: JFK→FRA→SIN        (Frankfurt tag)
 *  - 478: SIN→JNB→CPT  · 479: CPT→JNB→SIN       (South Africa tag)
 *  - 700: SIN→BCN→MAD→SIN — a 3-sector FUTURE route to prove dynamism
 *  - other flights → single-sector; 200 → only SCL+YCL; YCL → snack bag
 *  - 999 → statusCode 101 · 300 → NO_CABINS · past/+6wk+ → BAD_DATE
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { SqError, sendJson } from './sq';
import { CABIN_META, CABIN_ORDER, type CabinCode, type CabinOption, type SectorOption } from './types';

type Json = Record<string, unknown>;

const CABINS_ALL: CabinOption[] = CABIN_META;
const CABINS_TWO: CabinOption[] = CABIN_META.filter((c) => c.code === 'SCL' || c.code === 'YCL');

type Station = { city: string; code: string };

const ST: Record<string, Station> = {
  SIN: { city: 'Singapore', code: 'SIN' },
  HND: { city: 'Tokyo', code: 'HND' },
  NRT: { city: 'Tokyo Narita', code: 'NRT' },
  LAX: { city: 'Los Angeles', code: 'LAX' },
  FRA: { city: 'Frankfurt', code: 'FRA' },
  JFK: { city: 'New York', code: 'JFK' },
  JNB: { city: 'Johannesburg', code: 'JNB' },
  CPT: { city: 'Cape Town', code: 'CPT' },
  BCN: { city: 'Barcelona', code: 'BCN' },
  MAD: { city: 'Madrid', code: 'MAD' },
  KUL: { city: 'Kuala Lumpur', code: 'KUL' }
};

function routeStations(fn: number): Station[] {
  switch (fn) {
    case 11: return [ST.SIN, ST.HND, ST.LAX];
    case 12: return [ST.LAX, ST.NRT, ST.SIN];
    case 25: return [ST.SIN, ST.FRA, ST.JFK];
    case 26: return [ST.JFK, ST.FRA, ST.SIN];
    case 478: return [ST.SIN, ST.JNB, ST.CPT];
    case 479: return [ST.CPT, ST.JNB, ST.SIN];
    case 700: return [ST.SIN, ST.BCN, ST.MAD, ST.SIN];
    default: return [ST.SIN, ST.HND, ST.SIN];
  }
}

async function bodyOf(req: IncomingMessage): Promise<Json> {
  const pre = (req as { body?: unknown }).body;
  if (pre !== undefined && pre !== null && typeof pre === 'object' && !Array.isArray(pre)) {
    return pre as Json;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Json;
  } catch {
    return {};
  }
}

function fail(res: ServerResponse, err: SqError): void {
  sendJson(res, err.httpStatus, { ok: false, error: { code: err.code, message: err.message } });
}

function isoShift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const flightOf = (raw: unknown): number => {
  const m = /0*(\d{1,4})/.exec(String(raw ?? '').trim());
  return m ? Number(m[1]) : Number.NaN;
};

// ---------------------------------------------------------------- fixtures --

const item = (name: string, description = ''): Json => ({ name, description });

/** UTC stamp helpers — each sector departs 5 h after the previous one, 6 h block time. */
function legTimes(date: string, index: number): { depLocal: string; arrLocal: string; depUtc: string; arrUtc: string; shift: string } {
  const base = Date.parse(`${date}T01:00:00Z`) + index * 5 * 3_600_000;
  const dep = new Date(base);
  const arr = new Date(base + 6 * 3_600_000);
  const iso = (d: Date): string => d.toISOString().slice(0, 16).replace('T', ' ') + ':00';
  // mock "local" clocks run at UTC+8 for every station (display-only fixture)
  const local = (d: Date): Date => new Date(d.getTime() + 8 * 3_600_000);
  const shift = local(dep).toISOString().slice(0, 10) === local(arr).toISOString().slice(0, 10) ? '' : ' +1d';
  return { depLocal: iso(local(dep)), arrLocal: iso(local(arr)), depUtc: iso(dep), arrUtc: iso(arr), shift };
}

function legContent(index: number): Json {
  if (index === 0) {
    return {
      menu: { language: { EN_UK: {
        apologyFootnote: 'Please accept our apologies if your choice is unavailable.',
        meals: [
          {
            mealServiceNumber: '1', mealServiceCode: 'BFS_855', mealServiceName: 'Breakfast',
            mealServiceWriteUp: 'A selection of fresh seasonal produce, prepared to order.',
            selectionDetails: [
              {
                name: 'International Menu', code: 'ALC-International Menu',
                footnoteId: '', footnoteName: '', footnoteIconImagePath: '',
                mealCourses: [
                  { category: 'Appetiser', code: 'AP', maxSequence: 1, items: [item('Seasonal Fruit Plate', 'Tropical fruits with a lime drizzle')] },
                  { category: 'Main Course', code: 'MC', maxSequence: 3, items: [
                    item('Nasi Lemak with Chicken Rendang', 'Fragrant coconut rice, slow-braised chicken'),
                    item('Eggs Benedict', 'Poached eggs, smoked ham, hollandaise'),
                    item('Pan-Seared Salmon', 'Miso butter, seasonal greens')
                  ] },
                  { category: 'Dessert', code: 'DS', maxSequence: 1, items: [item('Dark Chocolate Cake', 'With gold-dusted ganache')] },
                  { category: 'From The Bakery', code: 'BB', maxSequence: 1, items: [item('Assorted Breakfast Pastries'), item('Multigrain Toast', 'With butter and jam')] }
                ]
              },
              {
                name: 'Hanakoireki By Yoshihiro Murata', code: 'ETHNIC-Hanakoireki',
                footnoteId: 'ICP', footnoteName: 'International Culinary Panel', footnoteIconImagePath: '',
                mealCourses: [
                  { category: 'Main Course', code: 'MC', maxSequence: 2, items: [
                    item('Grilled Spanish Mackerel', 'Saikyo miso, ginger flower'),
                    item('Steamed Rice with Tororo', 'With pickled plum')
                  ] }
                ]
              }
            ]
          }
        ]
      } } },
      beverage: { language: { EN_UK: { categories: [
        { name: 'Champagne and Wine', categorySequence: 1, subcategories: [
          { name: 'Champagne', code: 'CH', footer: '', specialities: [{ items: [item('Charles Heidsieck Brut Réserve'), item('Louis Roederer Collection 244', 'Champagne, France, Champagne, located in the north of France, with its cool climate and famed chalky soil, makes the most famous sparkling wines in the world.')] }] },
          { name: 'White', code: 'WH', footer: '', specialities: [{ items: [item('Cloudy Bay Sauvignon Blanc 2024', 'Marlborough, New Zealand'), item('Kistler Chardonnay 2023', 'Sonoma Coast')] }] },
          { name: 'Red', code: 'RD', footer: '', specialities: [{ items: [item('Penfolds Bin 389 Cabernet Shiraz 2022', 'South Australia')] }] }
        ] },
        { name: 'Spirits and Liqueurs', categorySequence: 2, subcategories: [
          { name: 'Whisky', code: 'WK', footer: '', specialities: [{ items: [item('The Macallan Double Cask 12 Years'), item('Hibiki Japanese Harmony')] }] }
        ] },
        { name: 'Soft Drinks', categorySequence: 3, subcategories: [
          { name: 'Juices', code: 'JC', footer: '', specialities: [{ items: [item('Freshly Squeezed Orange Juice'), item('Tomato Juice')] }] }
        ] }
      ] } } },
      drySnack: {
        header: 'We have a variety of snacks available on request.',
        category: { name: 'Snacks', subcategories: [
          { name: 'Noodles', items: [item('Tom Yum Flavoured'), item('Abalone Noodles')] },
          { name: 'Biscuits & Nuts', items: [item('Quality Street Chocolates'), item('Mixed Nuts')] }
        ] }
      },
      amenities: {
        header: 'A selection of onboard amenities is available upon request.', footer: null,
        items: [ { itemName: 'Amenity Kit', itemDescription: '' }, { itemName: 'Eyeshade', itemDescription: '' } ]
      }
    };
  }
  return {
    menu: { language: { EN_UK: {
      apologyFootnote: '',
      meals: [
        { mealServiceNumber: '1', mealServiceCode: 'SNCK', mealServiceName: 'Light Bites', mealServiceWriteUp: '',
          selectionDetails: [
            { name: 'International Menu', code: 'ALC-International Menu', footnoteId: '', footnoteName: '', footnoteIconImagePath: '',
              mealCourses: [ { category: 'Snack', code: 'SN', maxSequence: 1, items: [item('Chicken Curry Puff'), item('Satay', 'Chicken and lamb skewers'), item('Ice Cream', 'Vanilla or chocolate')] } ] }
          ] }
      ]
    } } },
    beverage: { language: { EN_UK: { categories: [
      { name: 'Soft Drinks', categorySequence: 1, subcategories: [ { name: 'Juices', code: 'JC', footer: '', specialities: [{ items: [item('Apple Juice')] }] } ] }
    ] } } },
    drySnack: {
      header: 'We have a variety of snacks available on request.',
      category: { name: 'Snacks', subcategories: [ { name: 'Noodles', items: [item('Tom Yum Flavoured')] } ] }
    },
    amenities: { header: '', footer: null, items: [] }
  };
}

function fullMenu(fn: number, date: string): Json {
  const stations = routeStations(fn);
  const legs: Json[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const t = legTimes(date, i);
    const content = legContent(i);
    legs.push({
      legseqno: i + 1,
      flightDetails: {
        departureAirportCode: stations[i].code, departureCityName: stations[i].city,
        arrivalAirportCode: stations[i + 1].code, arrivalCityName: stations[i + 1].city,
        departureLocalDate: t.depLocal, arrivalLocalDate: t.arrLocal,
        departureUtcDate: t.depUtc, arrivalUtcDate: t.arrUtc,
        flightStatus: 'SCHEDULED'
      },
      ...content,
      guestChef: i === 1 ? { id: 'GCH', header: 'Guest Chef', message: 'A special menu by Chef Kenji.' } : { id: '', header: '', message: '' },
      isSnackBag: false,
      isBentoBox: false,
      isNoMenuPlanned: i === 1,
      isHawkerPromo: false
    });
  }
  return {
    flightNumber: String(fn).padStart(4, '0'),
    flightDate: date,
    cabinClass: 'JCL',
    serviceType: 'J',
    statusCode: 200,
    legs
  };
}

function snackBagMenu(fn: number, date: string): Json {
  // snack-bag service operates on EVERY sector of the route
  const stations = routeStations(fn);
  const legs: Json[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const t = legTimes(date, i);
    legs.push({
      legseqno: i + 1,
      flightDetails: {
        departureAirportCode: stations[i].code, departureCityName: stations[i].city,
        arrivalAirportCode: stations[i + 1].code, arrivalCityName: stations[i + 1].city,
        departureLocalDate: t.depLocal, arrivalLocalDate: t.arrLocal,
        departureUtcDate: t.depUtc, arrivalUtcDate: t.arrUtc,
        flightStatus: 'SCHEDULED'
      },
      menu: { language: { EN_UK: { meals: [] } } },
      beverage: { language: { EN_UK: { categories: [] } } },
      amenities: { header: '', footer: null, items: [] },
      guestChef: { id: '', header: '', message: '' },
      isSnackBag: true, isBentoBox: false, isNoMenuPlanned: false, isHawkerPromo: false
    });
  }
  return {
    flightNumber: String(fn).padStart(4, '0'),
    flightDate: date,
    cabinClass: 'YCL',
    serviceType: 'Y',
    statusCode: 200,
    legs
  };
}

/** Sectors derived from the SAME legs the menu serves — exactly like production. */
function sectorsFromMenu(menu: Json): SectorOption[] | undefined {
  const legs = (menu.legs ?? []) as Array<{ flightDetails?: Json }>;
  const out: SectorOption[] = legs.map((leg, i) => {
    const fd = leg.flightDetails ?? {};
    const dep = String(fd.departureAirportCode ?? '');
    const arr = String(fd.arrivalAirportCode ?? '');
    return { seq: i + 1, label: `${dep} → ${arr}` };
  });
  return out.length > 1 ? out : undefined;
}

// ------------------------------------------------------------------ public --

export async function apiGetCabin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await bodyOf(req);
    const fn = flightOf(body.flightNumber ?? body.flight);
    const date = String(body.flightDate ?? body.date ?? '');
    if (!Number.isInteger(fn) || fn < 1 || fn > 9999) throw new SqError('BAD_INPUT', 'That does not look like an SQ flight number.', 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new SqError('BAD_INPUT', 'Date must be YYYY-MM-DD.', 400);
    if (date < isoShift(0) || date > isoShift(43)) {
      throw new SqError('BAD_DATE', 'That date is outside the booking window — menus can be checked from today up to 6 weeks ahead.', 400);
    }
    if (fn === 999) {
      throw new SqError('NOT_FOUND', 'No flight found for that number and date. Check the flight operates that day, or try again closer to departure.', 404);
    }
    if (fn === 300) {
      throw new SqError('NO_CABINS', 'We found the flight, but no menu cabins are open for it yet. Try again closer to departure.', 404);
    }
    const cabins = fn === 200 ? CABINS_TWO : CABINS_ALL;
    const data: Json = { flight: String(fn), flightDate: date, cabins };
    // Sector discovery mirrors production: read the legs of a menu payload.
    if (fn !== 200) {
      const sectors = sectorsFromMenu(fullMenu(fn, date));
      if (sectors) data.sectors = sectors;
    }
    sendJson(res, 200, { ok: true, data });
  } catch (err) {
    fail(res, err instanceof SqError ? err : new SqError('UPSTREAM_HTTP', 'Unexpected mock error.', 500));
  }
}

export async function apiGetMenu(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await bodyOf(req);
    const fn = flightOf(body.flightNumber ?? body.flight);
    const date = String(body.flightDate ?? body.date ?? '');
    const cabin = String(body.cabinClass ?? body.cabin ?? '');
    if (!Number.isInteger(fn) || fn < 1 || fn > 9999) throw new SqError('BAD_INPUT', 'That does not look like an SQ flight number.', 400);
    if (!CABIN_ORDER.includes(cabin as CabinCode)) throw new SqError('BAD_INPUT', 'Unknown cabin class.', 400);
    if (date < isoShift(0) || date > isoShift(43)) {
      throw new SqError('BAD_DATE', 'That date is outside the booking window — menus can be checked from today up to 6 weeks ahead.', 400);
    }
    if (fn === 999) {
      throw new SqError('NOT_FOUND', 'No flight found for that number and date. Check the flight operates that day, or try again closer to departure.', 404);
    }
    const payload = cabin === 'YCL' ? snackBagMenu(fn, date) : fullMenu(fn, date);
    sendJson(res, 200, { ok: true, data: payload });
  } catch (err) {
    fail(res, err instanceof SqError ? err : new SqError('UPSTREAM_HTTP', 'Unexpected mock error.', 500));
  }
}
