/**
 * Known multi-sector SQ services. The menu API returns one `legs[]` per
 * sector; these flight numbers operate two named sectors each, so we offer
 * a sector picker before fetching.
 *
 * Labels are display hints for the pre-fetch picker ONLY — after the menu
 * arrives, sheet titles come from the live leg data (departureCityName →
 * arrivalCityName), so a schedule/station change still renders truthfully.
 */

export interface SectorInfo {
  /** 1-based leg position (order in the upstream legs[] array) */
  seq: number;
  label: string;
}

const ROUTE_TABLE: Record<number, string[]> = {
  11: ['Singapore → Tokyo Narita', 'Tokyo Narita → Los Angeles'],
  12: ['Los Angeles → Tokyo Narita', 'Tokyo Narita → Singapore'],
  25: ['Singapore → Frankfurt', 'Frankfurt → New York JFK'],
  26: ['New York JFK → Frankfurt', 'Frankfurt → Singapore'],
  377: ['Barcelona → Milan Malpensa', 'Milan Malpensa → Singapore'],
  378: ['Singapore → Milan Malpensa', 'Milan Malpensa → Barcelona'],
  478: ['Singapore → Johannesburg', 'Johannesburg → Cape Town'],
  479: ['Cape Town → Johannesburg', 'Johannesburg → Singapore']
};

/** Returns the sector plan for multi-sector flights, or null for single-sector. */
export function sectorPlanFor(flightNumber: string): SectorInfo[] | null {
  const legs = ROUTE_TABLE[Number(flightNumber)];
  if (!legs || legs.length < 2) return null;
  return legs.map((label, i) => ({ seq: i + 1, label }));
}
