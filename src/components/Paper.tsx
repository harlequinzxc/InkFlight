/**
 * Paper — the printable menu sheet, rendered at true mm dimensions.
 *
 * Two layouts:
 *  · `elegant` — modelled on the SQ seatback menu card: route rail top-left,
 *    serif service title, navy rule, then a course timeline (labels on a left
 *    rail, ring markers on a vertical line, dishes on the right).
 *  · `compact` — modelled on the crew one-look sheet: per-service header line
 *    (SQ265 (→ BNE) JCL (LUNCH) 020926), then COURSE: DISHES with hanging
 *    continuation lines. Names only, all caps.
 *
 * Optimised for html2canvas-pro capture: plain hex colours, no shadows on the
 * sheet, real DOM elements for the timeline (no pseudo-element content).
 */

import type { BeverageCategory, LegSection, MenuDoc, SnackGroup } from '../lib/types';

function PlaneGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="pgA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EFD489" />
          <stop offset="1" stopColor="#C29D45" />
        </linearGradient>
        <linearGradient id="pgB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B98F33" />
          <stop offset="1" stopColor="#8F6D22" />
        </linearGradient>
        <linearGradient id="pgC" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7A5C1B" />
          <stop offset="1" stopColor="#5C460F" />
        </linearGradient>
      </defs>
      <polygon points="456,72 56,268 216,300" fill="url(#pgA)" />
      <polygon points="456,72 216,300 324,368" fill="url(#pgB)" />
      <polygon points="216,300 324,368 296,468" fill="url(#pgC)" />
    </svg>
  );
}

// ---------------------------------------------------------------- helpers --

function joinNames(names: string[]): string {
  return names.join(', ');
}

/** {head:"Champagne and Wine — White", body:"Cloudy Bay, Kistler"} flattened drink lines */
function beverageLines(leg: LegSection): Array<{ head: string; body: string }> {
  const lines: Array<{ head: string; body: string }> = [];
  for (const cat of leg.beverages) {
    if (!cat.include) continue;
    const activeGroups = cat.groups.filter((g) => g.include && g.items.some((i) => i.include));
    if (activeGroups.length === 0) continue;
    const multi = activeGroups.length > 1;
    for (const g of activeGroups) {
      const names = g.items.filter((i) => i.include).map((i) => i.name);
      if (names.length === 0) continue;
      // one group under the category → just the group name ("Champagne", "White");
      // several groups → keep the category for context ("Champagne and Wine — Red")
      const head = multi ? `${cat.name} — ${g.name}` : g.name !== cat.name ? g.name : cat.name;
      lines.push({ head, body: joinNames(names) });
    }
  }
  return lines;
}

function snackLines(leg: LegSection): Array<{ head: string; body: string }> {
  return leg.snacks
    .filter((g: SnackGroup) => g.include && g.items.some((i) => i.include))
    .map((g) => ({ head: g.name, body: g.items.filter((i) => i.include).map((i) => i.name).join(', ') }));
}

/** "Main Course" → "MAIN", "Appetiser" → "APP", "Hot Beverage" → "HOT BEV" … */
function shortCourseLabel(category: string): string {
  const map: Array<[RegExp, string]> = [
    [/^main/i, 'MAIN'],
    [/^app[e]?/i, 'APP'],
    [/^canap/i, 'CANAPE'],
    [/^dessert/i, 'DESSERT'],
    [/^bread|^bakery/i, 'BREAD'],
    [/^praline/i, 'PRALINES'],
    [/^hot\s?bev/i, 'HOT BEV'],
    [/^salad/i, 'SALAD'],
    [/^soup/i, 'SOUP'],
    [/^snack/i, 'SNACK'],
    [/^amenit/i, 'AMENITY'],
    [/^beverage/i, 'BEVERAGES']
  ];
  for (const [re, label] of map) {
    if (re.test(category.trim())) return label;
  }
  const words = category.trim().toUpperCase().split(/\s+/);
  let out = '';
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > 14) break;
    out = next;
  }
  return (out || words[0] || '').replace(/[&—-]\s*$/, '').trim();
}

/** "2026-09-05" → "050926" (falls back to parsing the pretty label). */
function dateCode(doc: MenuDoc): string {
  const iso = doc.dateISO;
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(2, 4);
  }
  const m = /(\d{1,2})\s+(\w{3})\s+(\d{4})/.exec(doc.dateLabel);
  if (m) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mi = months.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
    if (mi >= 0) return String(m[1]).padStart(2, '0') + String(mi + 1).padStart(2, '0') + m[3].slice(2);
  }
  return '';
}

function flightCode(doc: MenuDoc): string {
  return doc.flightLabel.replace(/\s+/g, '');
}

// ===========================================================================
// ELEGANT LAYOUT — SQ seatback card style
// ===========================================================================

function ElegantBeverageRows({ leg }: { leg: LegSection }) {
  const bev = beverageLines(leg);
  const snacks = snackLines(leg);
  const rows: Array<{ label: string; lines: Array<{ head: string; body: string }> }> = [];
  if (bev.length > 0) rows.push({ label: 'Beverages', lines: bev });
  if (snacks.length > 0) rows.push({ label: 'Snacks', lines: snacks });
  if (leg.amenitiesOn && leg.amenities.length > 0) rows.push({ label: 'Amenities', lines: [{ head: '', body: joinNames(leg.amenities) }] });
  if (rows.length === 0) return null;
  return (
    <div className="eg-timeline">
      {rows.map((row) => (
        <div className="eg-row" key={row.label}>
          <div className="eg-label">{row.label}</div>
          <div className="eg-marker"><i /></div>
          <div className="eg-dishes">
            {row.lines.map((line, i) => (
              <div className="eg-item eg-kv" key={i}>
                {line.head ? (
                  <>
                    <b>{line.head}</b>
                    <em>{line.body}</em>
                  </>
                ) : (
                  <em className="eg-kvplain">{line.body}</em>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ElegantPaper({ doc }: { doc: MenuDoc }) {
  const multiCabin = doc.cabins.length > 1;
  return (
    <>
      <header className="eg-mast">
        <span>{doc.flightLabel}</span>
        <i>◆</i>
        <span>{doc.dateLabel}</span>
        <i>◆</i>
        <span>{doc.cabins.map((c) => c.code).join(' · ')}</span>
      </header>
      {doc.headerNote ? <div className="eg-headnote">{doc.headerNote}</div> : null}

      {doc.cabins.map((cab) => {
        const legs = cab.legs.filter((l) => l.include);
        return (
          <section className="eg-cabin" key={cab.id}>
            {multiCabin && <h2 className="eg-cabin-title"><span>{cab.title}</span></h2>}
            {legs.map((leg) => (
              <div className="eg-leg" key={leg.id}>
                {leg.bannersOn && leg.banners.map((b, i) => (
                  <div className="eg-banner" key={i}>{b}</div>
                ))}

                {leg.meals.filter((m) => m.include).map((meal) => (
                  <div className="eg-service" key={meal.id}>
                    <div className="eg-header">
                      <div className="eg-route">{leg.routeLabel.replace(' → ', ' to ')}</div>
                      <div className="eg-vr" />
                      <h3 className="eg-title">{meal.name}</h3>
                    </div>
                    <div className="eg-rule" />

                    {meal.selections.filter((s) => s.include).map((sel) => (
                      <div className="eg-sel" key={sel.id}>
                        {sel.name ? <h4 className="eg-selname">{sel.name}</h4> : null}
                        {sel.footnote && doc.showDescriptions ? <p className="eg-selfoot">{sel.footnote}</p> : null}
                        <div className="eg-timeline">
                          {sel.courses
                            .filter((c) => c.include && c.items.some((i) => i.include))
                            .map((course) => {
                              const n = course.items.filter((i) => i.include).length;
                              return (
                              <div className="eg-row" key={course.id}>
                                <div className="eg-label">
                                  {course.category}
                                  {n >= 2 ? <small>Choose one of {n}</small> : null}
                                </div>
                                <div className="eg-marker"><i /></div>
                                <div className="eg-dishes">
                                  {course.items.filter((i) => i.include).map((item) => (
                                    <div className="eg-item" key={item.id}>
                                      <b>{item.name}</b>
                                      {doc.showDescriptions && item.desc ? <em>{item.desc}</em> : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                <ElegantBeverageRows leg={leg} />

                {leg.notesOn &&
                  leg.notes.filter(Boolean).map((n, i) => (
                    <p className="eg-footnote" key={i}>{n}</p>
                  ))}
              </div>
            ))}
          </section>
        );
      })}

      <footer className="eg-foot">{doc.attribution}</footer>
    </>
  );
}

// ===========================================================================
// COMPACT LAYOUT — crew one-look sheet
// ===========================================================================

function CompactCourse({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  const head = `${label}:`;
  return (
    <>
      <div className="cx-line">
        <b>{head}</b> {names[0]}
      </div>
      {names.slice(1).map((n, i) => (
        <div className="cx-line cx-cont" key={i}>
          {n}
        </div>
      ))}
    </>
  );
}

function CompactPaper({ doc }: { doc: MenuDoc }) {
  const dc = dateCode(doc);
  const fc = flightCode(doc);
  return (
    <div className="cx">
      {doc.cabins.map((cab) => {
        const legs = cab.legs.filter((l) => l.include);
        if (legs.length === 0) return null;
        return legs.map((leg) => {
          const dest = leg.destCode ? ` (→ ${leg.destCode})` : leg.routeCodes ? ` (→ ${leg.routeCodes.split('→').pop()?.trim()})` : '';
          const meals = leg.meals.filter((m) => m.include);
          const bev = beverageLines(leg);
          const snacks = snackLines(leg);
          return (
            <section className="cx-leg" key={leg.id}>
              {meals.map((meal) => (
                <div className="cx-service" key={meal.id}>
                  <div className="cx-head">
                    {fc}
                    {dest} {cab.code} ({meal.name.toUpperCase()}) {dc}
                  </div>
                  {meal.selections.filter((s) => s.include).map((sel) => (
                    <div className="cx-block" key={sel.id}>
                      {meal.selections.length > 1 && sel.name ? <div className="cx-sel">{sel.name.toUpperCase()}</div> : null}
                      {sel.courses
                        .filter((c) => c.include && c.items.some((i) => i.include))
                        .map((course) => (
                          <CompactCourse
                            key={course.id}
                            label={shortCourseLabel(course.category)}
                            names={course.items.filter((i) => i.include).map((i) => i.name)}
                          />
                        ))}
                    </div>
                  ))}
                </div>
              ))}

              {bev.length > 0 && (
                <div className="cx-block">
                  <div className="cx-head">{fc}{dest} {cab.code} (BEVERAGES) {dc}</div>
                  {bev.map((line, i) => (
                    <CompactCourse key={i} label={shortCourseLabel(line.head.split(' — ').pop() ?? line.head)} names={[line.body]} />
                  ))}
                </div>
              )}

              {snacks.length > 0 && (
                <div className="cx-block">
                  {snacks.map((line, i) => (
                    <CompactCourse key={i} label={shortCourseLabel(line.head)} names={[line.body]} />
                  ))}
                </div>
              )}

              {leg.amenitiesOn && leg.amenities.length > 0 && (
                <CompactCourse label="AMENITY" names={[joinNames(leg.amenities).toUpperCase()]} />
              )}

              {leg.bannersOn &&
                leg.banners.map((b, i) => (
                  <div className="cx-banner" key={i}>NOTE: {b.toUpperCase()}</div>
                ))}
            </section>
          );
        });
      })}
      <footer className="cx-foot">{doc.attribution}</footer>
    </div>
  );
}

// ===========================================================================

export interface PaperProps {
  doc: MenuDoc;
  layout: 'elegant' | 'compact';
  size: 'A4' | 'A6';
  fontScale: number;
  paperRef?: React.Ref<HTMLDivElement>;
}

export default function Paper({ doc, layout, size, fontScale, paperRef }: PaperProps) {
  return (
    <div
      ref={paperRef}
      id="inkflight-paper"
      className={`paper layout-${layout} size-${size}`}
      style={{ ['--doc-scale' as string]: String(fontScale) }}
    >
      {layout === 'elegant' ? <ElegantPaper doc={doc} /> : <CompactPaper doc={doc} />}
    </div>
  );
}

export { PlaneGlyph };
export type { BeverageCategory };
