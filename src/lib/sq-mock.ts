/**
 * sq-mock.ts — DEMO/TEST-ONLY stand-in for the real SQ upstream.
 *
 * Enabled with SQ_API_BASE=mock (used for previews and UI demos). It emits the
 * SAME envelope + typed-error semantics as src/lib/sq.ts, so the whole app —
 * gates, banners, snack-bag handling, NOT_FOUND copy — behaves exactly as it
 * will against the real service in production.
 *
 * Demo rules:
 *  - flight 999 → statusCode 101 (no flight found)
 *  - dates beyond today+8 or in the past → 101 (publication window)
 *  - flight 200 → only YCL + SCL operate (single/two-cabin demo)
 *  - YCL menu → snack-bag sector (banner, no fabricated meal list)
 *  - other flights → two-sector JCL-style menu, date-aware stamps
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { SqError, sendJson } from './sq';
import { CABIN_META, CABIN_ORDER, type CabinCode, type CabinOption } from './types';

type Json = Record<string, unknown>;

const CABINS_ALL: CabinOption[] = CABIN_META;
const CABINS_TWO: CabinOption[] = CABIN_META.filter((c) => c.code === 'SCL' || c.code === 'YCL');

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

function fullMenu(fn: number, date: string): Json {
  // SIN is UTC+8: 07:15 local = 23:15 UTC on the previous calendar day
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const prevDay = d.toISOString().slice(0, 10);
  return {
    flightNumber: String(fn).padStart(4, '0'),
    flightDate: date,
    cabinClass: 'JCL',
    serviceType: 'J',
    statusCode: 200,
    legs: [
      {
        legseqno: 1,
        flightDetails: {
          departureAirportCode: 'SIN', departureCityName: 'Singapore',
          arrivalAirportCode: 'HND', arrivalCityName: 'Tokyo',
          departureLocalDate: `${date} 07:15:00`, arrivalLocalDate: `${date} 15:05:00`,
          departureUtcDate: `${prevDay} 23:15:00`, arrivalUtcDate: `${date} 06:05:00`,
          flightStatus: 'SCHEDULED'
        },
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
                    { category: 'Bread', code: 'BB', maxSequence: 1, items: [item('Assorted Breakfast Pastries'), item('Multigrain Toast', 'With butter and jam')] }
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
            { name: 'Champagne', code: 'CH', footer: '', specialities: [{ items: [item('Charles Heidsieck Brut Réserve')] }] },
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
        },
        guestChef: { id: '', header: '', message: '' },
        isSnackBag: false, isBentoBox: false, isNoMenuPlanned: false, isHawkerPromo: false
      },
      {
        legseqno: 2,
        flightDetails: {
          departureAirportCode: 'HND', departureCityName: 'Tokyo',
          arrivalAirportCode: 'SIN', arrivalCityName: 'Singapore',
          departureLocalDate: `${date} 17:10:00`, arrivalLocalDate: `${date} 23:45:00`,
          departureUtcDate: `${date} 08:10:00`, arrivalUtcDate: `${date} 14:45:00`,
          flightStatus: 'SCHEDULED'
        },
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
        amenities: { header: '', footer: null, items: [] },
        guestChef: { id: 'GCH', header: 'Guest Chef', message: 'A special menu by Chef Kenji.' },
        isSnackBag: false, isBentoBox: false, isNoMenuPlanned: true, isHawkerPromo: false
      }
    ]
  };
}

function snackBagMenu(fn: number, date: string): Json {
  return {
    flightNumber: String(fn).padStart(4, '0'),
    flightDate: date,
    cabinClass: 'YCL',
    serviceType: 'Y',
    statusCode: 200,
    legs: [ {
      legseqno: 1,
      flightDetails: {
        departureAirportCode: 'SIN', departureCityName: 'Singapore',
        arrivalAirportCode: 'KUL', arrivalCityName: 'Kuala Lumpur',
        departureLocalDate: `${date} 09:00:00`, arrivalLocalDate: `${date} 10:10:00`,
        departureUtcDate: `${date} 01:00:00`, arrivalUtcDate: `${date} 02:10:00`,
        flightStatus: 'SCHEDULED'
      },
      menu: { language: { EN_UK: { meals: [] } } },
      beverage: { language: { EN_UK: { categories: [] } } },
      amenities: { header: '', footer: null, items: [] },
      guestChef: { id: '', header: '', message: '' },
      isSnackBag: true, isBentoBox: false, isNoMenuPlanned: false, isHawkerPromo: false
    } ]
  };
}

// ------------------------------------------------------------------ public --

export async function apiGetCabin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await bodyOf(req);
    const fn = flightOf(body.flightNumber ?? body.flight);
    const date = String(body.flightDate ?? body.date ?? '');
    if (!Number.isInteger(fn) || fn < 1 || fn > 9999) throw new SqError('BAD_INPUT', 'That does not look like an SQ flight number.', 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new SqError('BAD_INPUT', 'Date must be YYYY-MM-DD.', 400);
    if (date < isoShift(0) || date > isoShift(8)) {
      throw new SqError('BAD_DATE', 'That date is outside the menu window — menus publish from today up to 8 days before departure.', 400);
    }
    if (fn === 999) {
      throw new SqError('NOT_FOUND', 'No flight found for that number and date. Menus are typically published from today up to 8 days before departure.', 404);
    }
    if (fn === 300) {
      throw new SqError('NO_CABINS', 'We found the flight, but no menu cabins are open for it yet. Try again closer to departure.', 404);
    }
    const cabins = fn === 200 ? CABINS_TWO : CABINS_ALL;
    sendJson(res, 200, { ok: true, data: { flight: String(fn), flightDate: date, cabins } });
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
    if (date < isoShift(0) || date > isoShift(8)) {
      throw new SqError('BAD_DATE', 'That date is outside the menu window — menus publish from today up to 8 days before departure.', 400);
    }
    if (fn === 999) {
      throw new SqError('NOT_FOUND', 'No flight found for that number and date. Menus are typically published from today up to 8 days before departure.', 404);
    }
    const payload = cabin === 'YCL' ? snackBagMenu(fn, date) : fullMenu(fn, date);
    sendJson(res, 200, { ok: true, data: payload });
  } catch (err) {
    fail(res, err instanceof SqError ? err : new SqError('UPSTREAM_HTTP', 'Unexpected mock error.', 500));
  }
}
