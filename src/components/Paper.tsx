/**
 * Paper — the printable menu sheet, rendered at true mm dimensions.
 * Two layouts: `elegant` (fancy restaurant, single page) and `compact`
 * (minimal gaps, one-look). Optimised for html2canvas-pro capture:
 * plain hex colours, no oklch, no shadows on the sheet, gradients only linear.
 */

import type { MenuDoc } from '../lib/types';

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

function joinNames(names: string[]): string {
  return names.join(', ');
}

function beverageLines(doc: MenuDoc, leg: MenuDoc['cabins'][number]['legs'][number]): Array<{ head: string; body: string }> {
  const lines: Array<{ head: string; body: string }> = [];
  for (const cat of leg.beverages) {
    if (!cat.include) continue;
    const activeGroups = cat.groups.filter((g) => g.include && g.items.some((i) => i.include));
    if (activeGroups.length === 0) continue;
    const multi = activeGroups.length > 1;
    for (const g of activeGroups) {
      const names = g.items.filter((i) => i.include).map((i) => i.name);
      if (names.length === 0) continue;
      const head = multi && g.name !== cat.name ? `${cat.name} — ${g.name}` : cat.name;
      lines.push({ head, body: joinNames(names) });
    }
  }
  return lines;
}

// ===========================================================================
// ELEGANT LAYOUT
// ===========================================================================

function ElegantPaper({ doc }: { doc: MenuDoc }) {
  return (
    <>
      <header className="el-head">
        <PlaneGlyph className="el-plane" />
        <div className="el-brand">Singapore Airlines</div>
        <h1 className="el-flight">{doc.flightLabel}</h1>
        {doc.sheetTitle ? (
          <div className="el-route">{doc.sheetTitle}</div>
        ) : doc.cabins.length === 1 && doc.cabins[0].legs.some((l) => l.include) ? (
          <div className="el-route">{doc.cabins[0].legs.filter((l) => l.include).map((l) => l.routeLabel).filter(Boolean)[0]}</div>
        ) : null}
        <div className="el-date">{doc.dateLabel}</div>
        {doc.headerNote ? <div className="el-headnote">{doc.headerNote}</div> : null}
        <div className="el-rule">
          <span />
          <i>◆</i>
          <span />
        </div>
      </header>

      {doc.cabins.map((cab) => {
        const legs = cab.legs.filter((l) => l.include);
        return (
          <section className="el-cabin" key={cab.id}>
            <h2 className="el-cabin-title"><span>{cab.title}</span></h2>
            {legs.map((leg) => (
              <div className="el-leg" key={leg.id}>
                {(leg.routeLabel || leg.timeLabel) && (
                  <div className="el-legmeta">
                    {leg.routeLabel}
                    {leg.timeLabel ? <em> · {leg.timeLabel}</em> : null}
                  </div>
                )}
                {leg.banners.map((b, i) => (
                  <div className="el-banner" key={i}>{b}</div>
                ))}

                {leg.meals.filter((m) => m.include).map((meal) => (
                  <div className="el-meal" key={meal.id}>
                    <div className="el-mealname"><i>◆</i><span>{meal.name}</span><i>◆</i></div>
                    {meal.writeUp ? <div className="el-writeup">{meal.writeUp}</div> : null}
                    {meal.selections.filter((s) => s.include).map((sel) => (
                      <div className="el-sel" key={sel.id}>
                        {meal.selections.filter((s) => s.include).length > 1 || sel.name ? (
                          <div className="el-selname">{sel.name}</div>
                        ) : null}
                        {sel.footnote ? <div className="el-selfoot">{sel.footnote}</div> : null}
                        {sel.courses.filter((c) => c.include).map((course) => (
                          <div className="el-course" key={course.id}>
                            <div className="el-coursecat">
                              {course.category}
                              {course.choose > 1 ? <span className="el-choose"> · choose one of {course.choose}</span> : null}
                            </div>
                            {course.items.filter((i) => i.include).map((item) => (
                              <div className="el-item" key={item.id}>
                                <div className="el-itemname">{item.name}</div>
                                {doc.showDescriptions && item.desc ? <div className="el-itemdesc">{item.desc}</div> : null}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}

                {(() => {
                  const bev = beverageLines(doc, leg);
                  if (bev.length === 0) return null;
                  return (
                    <div className="el-extra">
                      <h3 className="el-extra-title">Beverages</h3>
                      {bev.map((line, i) => (
                        <p className="el-bev" key={i}>
                          <strong>{line.head}</strong> — {line.body}
                        </p>
                      ))}
                    </div>
                  );
                })()}

                {leg.snacks.length > 0 && (
                  <div className="el-extra">
                    <h3 className="el-extra-title">Snacks</h3>
                    {leg.snackNote ? <p className="el-note">{leg.snackNote}</p> : null}
                    {leg.snacks.filter((g) => g.include).map((g) => {
                      const names = g.items.filter((i) => i.include).map((i) => i.name);
                      if (names.length === 0) return null;
                      return (
                        <p className="el-bev" key={g.id}>
                          <strong>{g.name}</strong> — {joinNames(names)}
                        </p>
                      );
                    })}
                  </div>
                )}

                {leg.amenities.length > 0 && (
                  <div className="el-extra">
                    <h3 className="el-extra-title">Amenities</h3>
                    {leg.amenityNote ? <p className="el-note">{leg.amenityNote}</p> : null}
                    <p className="el-bev">{joinNames(leg.amenities)}</p>
                  </div>
                )}

                {leg.notes.filter(Boolean).map((n, i) => (
                  <p className="el-note" key={i}>{n}</p>
                ))}
              </div>
            ))}
          </section>
        );
      })}

      <footer className="el-foot">
        <span />
        <div>{doc.attribution}</div>
        <span />
      </footer>
    </>
  );
}

// ===========================================================================
// COMPACT LAYOUT
// ===========================================================================

function CompactPaper({ doc }: { doc: MenuDoc }) {
  return (
    <>
      <header className="cp-head">
        <div className="cp-row">
          <span className="cp-flight">{doc.flightLabel}</span>
          <span className="cp-date">{doc.dateLabel}</span>
        </div>
        {doc.sheetTitle ? <div className="cp-sheetline">{doc.sheetTitle}</div> : null}
      </header>
      {doc.headerNote ? <div className="cp-headnote">{doc.headerNote}</div> : null}

      {doc.cabins.map((cab) => {
        const legs = cab.legs.filter((l) => l.include);
        if (legs.length === 0) return null;
        return (
          <section className="cp-cabin" key={cab.id}>
            <div className="cp-cabin-title">{cab.title}</div>
            {legs.map((leg) => (
              <div className="cp-leg" key={leg.id}>
                {(leg.routeLabel || leg.timeLabel) && (
                  <div className="cp-legmeta">
                    {leg.routeLabel}
                    {leg.timeLabel ? <span> · {leg.timeLabel}</span> : null}
                  </div>
                )}
                {leg.banners.map((b, i) => (
                  <div className="cp-banner" key={i}>{b}</div>
                ))}

                {leg.meals.filter((m) => m.include).map((meal) => (
                  <div className="cp-meal" key={meal.id}>
                    <div className="cp-mealname">{meal.name}</div>
                    {meal.writeUp && doc.showDescriptions ? <div className="cp-writeup">{meal.writeUp}</div> : null}
                    {meal.selections.filter((s) => s.include).map((sel) => (
                      <div className="cp-sel" key={sel.id}>
                        {sel.name ? <div className="cp-selname">{sel.name}</div> : null}
                        {sel.footnote && doc.showDescriptions ? <div className="cp-selfoot">{sel.footnote}</div> : null}
                        {sel.courses.filter((c) => c.include).map((course) => {
                          const items = course.items.filter((i) => i.include);
                          if (items.length === 0) return null;
                          return (
                            <div className="cp-course" key={course.id}>
                              <span className="cp-cat">{course.category}{course.choose > 1 ? ` (choose 1 of ${course.choose})` : ''}: </span>
                              {items.map((item, idx) => (
                                <span className="cp-item" key={item.id}>
                                  {item.name}
                                  {doc.showDescriptions && item.desc ? <span className="cp-desc"> ({item.desc})</span> : null}
                                  {idx < items.length - 1 ? <span className="cp-sep"> · </span> : null}
                                </span>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}

                {(() => {
                  const bev = beverageLines(doc, leg);
                  if (bev.length === 0) return null;
                  return (
                    <div className="cp-block">
                      <div className="cp-blockname">Beverages</div>
                      {bev.map((line, i) => (
                        <div className="cp-line" key={i}>
                          <span className="cp-cat">{line.head}: </span>
                          {line.body}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {leg.snacks.length > 0 && (
                  <div className="cp-block">
                    <div className="cp-blockname">Snacks</div>
                    {leg.snacks.filter((g) => g.include).map((g) => {
                      const names = g.items.filter((i) => i.include).map((i) => i.name);
                      if (names.length === 0) return null;
                      return (
                        <div className="cp-line" key={g.id}>
                          <span className="cp-cat">{g.name}: </span>
                          {joinNames(names)}
                        </div>
                      );
                    })}
                  </div>
                )}

                {leg.amenities.length > 0 && (
                  <div className="cp-block">
                    <div className="cp-blockname">Amenities</div>
                    <div className="cp-line">{joinNames(leg.amenities)}</div>
                  </div>
                )}

                {leg.notes.filter(Boolean).map((n, i) => (
                  <div className="cp-note" key={i}>{n}</div>
                ))}
              </div>
            ))}
          </section>
        );
      })}

      <footer className="cp-foot">{doc.attribution}</footer>
    </>
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
