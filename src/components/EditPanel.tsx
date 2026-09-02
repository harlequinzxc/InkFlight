import Editable from './Editable';
import { uid, type MenuDoc, type SnackGroup } from '../lib/types';

interface EditPanelProps {
  doc: MenuDoc;
  onChange: (next: MenuDoc) => void;
}

/** Deep-clone the doc, run a recipe, hand it back up. */
function useMutator(doc: MenuDoc, onChange: (n: MenuDoc) => void) {
  return (recipe: (d: MenuDoc) => void): void => {
    const next: MenuDoc = structuredClone(doc);
    recipe(next);
    onChange(next);
  };
}

function Eye({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`eye${on ? ' on' : ''}`}
      title={on ? 'Included — tap to hide' : 'Hidden — tap to include'}
      onClick={onToggle}
    >
      {on ? '◉' : '○'}
    </button>
  );
}

function Del({ onDelete }: { onDelete: () => void }) {
  return (
    <button type="button" className="del" title="Delete" onClick={onDelete}>
      ✕
    </button>
  );
}

export default function EditPanel({ doc, onChange }: EditPanelProps) {
  const mutate = useMutator(doc, onChange);

  // ---------- finders (ids survive structuredClone) ----------

  // ---------- list editor for plain strings (notes, banners, amenities) ----------
  const StringList = ({ title, list, onList, placeholder }: { title: string; list: string[]; onList: (n: string[]) => void; placeholder: string }) => (
    <div className="ep-stringlist">
      <div className="ep-label">{title}</div>
      {list.map((s, i) => (
        <div className="ep-line" key={i}>
          <Editable className="ep-text" value={s} onChange={(v) => onList(list.map((x, j) => (j === i ? v : x)).filter((x) => x !== ''))} placeholder={placeholder} />
          <Del onDelete={() => onList(list.filter((_, j) => j !== i))} />
        </div>
      ))}
      <button type="button" className="addbtn" onClick={() => onList([...list, ''])}>+ Add</button>
    </div>
  );

  return (
    <div className="edit-panel">
      <div className="ep-hint">
        ◉ include · ○ hide from the sheet · tap any text to edit — the sheet on the other tab updates live.
      </div>

      {/* ---------- document details ---------- */}
      <details className="acc" open>
        <summary>Menu details</summary>
        <div className="acc-body">
          <div className="ep-line"><span className="ep-key">Flight</span><Editable className="ep-text strong" value={doc.flightLabel} onChange={(v) => mutate((d) => { d.flightLabel = v; })} /></div>
          <div className="ep-line"><span className="ep-key">Date</span><Editable className="ep-text" value={doc.dateLabel} onChange={(v) => mutate((d) => { d.dateLabel = v; })} /></div>
          <div className="ep-line"><span className="ep-key">Note</span><Editable className="ep-text" value={doc.headerNote} onChange={(v) => mutate((d) => { d.headerNote = v; })} placeholder="Optional line under the title" /></div>
          <div className="ep-line"><span className="ep-key">Footer</span><Editable className="ep-text small" value={doc.attribution} onChange={(v) => mutate((d) => { d.attribution = v; })} multiline /></div>
        </div>
      </details>

      {/* ---------- cabins ---------- */}
      {doc.cabins.map((cab) => (
        <details className="acc" key={cab.id} open>
          <summary>
            <span className="acc-code">{cab.code}</span> {cab.title}
          </summary>
          <div className="acc-body">
            <div className="ep-line"><span className="ep-key">Title</span><Editable className="ep-text strong" value={cab.title} onChange={(v) => mutate((d) => { d.cabins.find((c) => c.id === cab.id)!.title = v; })} /></div>

            {cab.legs.map((leg) => (
              <details className="acc sub" key={leg.id} open>
                <summary>
                  <Eye on={leg.include} onToggle={() => mutate((d) => { const l = d.cabins.flatMap((c) => c.legs).find((x) => x.id === leg.id); if (l) l.include = !l.include; })} />
                  <span className="acc-name">{leg.routeLabel || 'Sector'} {leg.timeLabel ? <em>· {leg.timeLabel}</em> : null}</span>
                </summary>
                <div className="acc-body">
                  <div className="ep-line"><span className="ep-key">Route</span><Editable className="ep-text" value={leg.routeLabel} onChange={(v) => mutate((d) => { const l = d.cabins.flatMap((c) => c.legs).find((x) => x.id === leg.id); if (l) l.routeLabel = v; })} /></div>
                  <div className="ep-line"><span className="ep-key">Times</span><Editable className="ep-text" value={leg.timeLabel} onChange={(v) => mutate((d) => { const l = d.cabins.flatMap((c) => c.legs).find((x) => x.id === leg.id); if (l) l.timeLabel = v; })} /></div>

                  {/* meals */}
                  {leg.meals.map((meal) => (
                    <details className="acc sub2" key={meal.id} open>
                      <summary>
                        <Eye on={meal.include} onToggle={() => mutate((d) => { const m = d.cabins.flatMap((c) => c.legs).flatMap((l) => l.meals).find((x) => x.id === meal.id); if (m) m.include = !m.include; })} />
                        <span className="acc-name">{meal.name}</span>
                      </summary>
                      <div className="acc-body">
                        <div className="ep-line"><span className="ep-key">Service</span><Editable className="ep-text strong" value={meal.name} onChange={(v) => mutate((d) => { const m = d.cabins.flatMap((c) => c.legs).flatMap((l) => l.meals).find((x) => x.id === meal.id); if (m) m.name = v; })} /></div>
                        {meal.writeUp ? (
                          <div className="ep-line"><span className="ep-key">Intro</span><Editable className="ep-text small" value={meal.writeUp} onChange={(v) => mutate((d) => { const m = d.cabins.flatMap((c) => c.legs).flatMap((l) => l.meals).find((x) => x.id === meal.id); if (m) m.writeUp = v; })} multiline /></div>
                        ) : null}

                        {meal.selections.map((sel) => (
                          <details className="acc sub3" key={sel.id} open>
                            <summary>
                              <Eye on={sel.include} onToggle={() => mutate((d) => { const s = d.cabins.flatMap((c) => c.legs).flatMap((l) => l.meals).flatMap((m) => m.selections).find((x) => x.id === sel.id); if (s) s.include = !s.include; })} />
                              <span className="acc-name">{sel.name || 'Menu selection'}</span>
                            </summary>
                            <div className="acc-body">
                              <div className="ep-line"><span className="ep-key">Name</span><Editable className="ep-text" value={sel.name} onChange={(v) => mutate((d) => { const s = d.cabins.flatMap((c) => c.legs).flatMap((l) => l.meals).flatMap((m) => m.selections).find((x) => x.id === sel.id); if (s) s.name = v; })} /></div>
                              {sel.footnote ? (
                                <div className="ep-line"><span className="ep-key">Footnote</span><Editable className="ep-text small" value={sel.footnote} onChange={(v) => mutate((d) => { const s = d.cabins.flatMap((c) => c.legs).flatMap((l) => l.meals).flatMap((m) => m.selections).find((x) => x.id === sel.id); if (s) s.footnote = v; })} /></div>
                              ) : null}

                              {sel.courses.map((course) => (
                                <div className="ep-course" key={course.id}>
                                  <div className="ep-course-head">
                                    <Eye on={course.include} onToggle={() => mutate((d) => { const c = d.cabins.flatMap((x) => x.legs).flatMap((l) => l.meals).flatMap((m) => m.selections).flatMap((s) => s.courses).find((y) => y.id === course.id); if (c) c.include = !c.include; })} />
                                    <Editable className="ep-text strong" value={course.category} onChange={(v) => mutate((d) => { const c = d.cabins.flatMap((x) => x.legs).flatMap((l) => l.meals).flatMap((m) => m.selections).flatMap((s) => s.courses).find((y) => y.id === course.id); if (c) c.category = v; })} />
                                    {course.items.filter((i) => i.include).length >= 2 ? (
                                      <span className="ep-choose">choose one of {course.items.filter((i) => i.include).length}</span>
                                    ) : null}
                                  </div>
                                  {course.items.map((item) => (
                                    <div className="ep-item" key={item.id}>
                                      <Eye on={item.include} onToggle={() => mutate((d) => {
                                        for (const c of d.cabins.flatMap((x) => x.legs).flatMap((l) => l.meals).flatMap((m) => m.selections).flatMap((s) => s.courses)) {
                                          const it = c.items.find((y) => y.id === item.id);
                                          if (it) { it.include = !it.include; return; }
                                        }
                                      })} />
                                      <div className="ep-item-fields">
                                        <Editable className="ep-text" value={item.name} onChange={(v) => mutate((d) => {
                                          for (const c of d.cabins.flatMap((x) => x.legs).flatMap((l) => l.meals).flatMap((m) => m.selections).flatMap((s) => s.courses)) {
                                            const it = c.items.find((y) => y.id === item.id);
                                            if (it) { it.name = v; return; }
                                          }
                                        })} placeholder="Dish name" />
                                        <Editable className="ep-text small" value={item.desc} onChange={(v) => mutate((d) => {
                                          for (const c of d.cabins.flatMap((x) => x.legs).flatMap((l) => l.meals).flatMap((m) => m.selections).flatMap((s) => s.courses)) {
                                            const it = c.items.find((y) => y.id === item.id);
                                            if (it) { it.desc = v; return; }
                                          }
                                        })} placeholder="Description (optional)" />
                                      </div>
                                      <Del onDelete={() => mutate((d) => {
                                        for (const c of d.cabins.flatMap((x) => x.legs).flatMap((l) => l.meals).flatMap((m) => m.selections).flatMap((s) => s.courses)) {
                                          const idx = c.items.findIndex((y) => y.id === item.id);
                                          if (idx >= 0) { c.items.splice(idx, 1); return; }
                                        }
                                      })} />
                                    </div>
                                  ))}
                                  <button type="button" className="addbtn" onClick={() => mutate((d) => {
                                    const c = d.cabins.flatMap((x) => x.legs).flatMap((l) => l.meals).flatMap((m) => m.selections).flatMap((s) => s.courses).find((y) => y.id === course.id);
                                    c?.items.push({ id: uid('it'), include: true, name: 'New dish', desc: '' });
                                  })}>+ Add dish</button>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}

                  {/* beverages */}
                  {leg.beverages.length > 0 && (
                    <details className="acc sub2">
                      <summary><span className="acc-name">Beverages ({leg.beverages.length} categories)</span></summary>
                      <div className="acc-body">
                        {leg.beverages.map((cat) => (
                          <details className="acc sub3" key={cat.id} open>
                            <summary>
                              <Eye on={cat.include} onToggle={() => mutate((d) => { const c = d.cabins.flatMap((x) => x.legs).flatMap((l) => l.beverages).find((y) => y.id === cat.id); if (c) c.include = !c.include; })} />
                              <span className="acc-name">{cat.name}</span>
                            </summary>
                            <div className="acc-body">
                              <div className="ep-line"><span className="ep-key">Name</span><Editable className="ep-text" value={cat.name} onChange={(v) => mutate((d) => { const c = d.cabins.flatMap((x) => x.legs).flatMap((l) => l.beverages).find((y) => y.id === cat.id); if (c) c.name = v; })} /></div>
                              {cat.groups.map((group) => (
                                <div className="ep-group" key={group.id}>
                                  <div className="ep-course-head">
                                    <Eye on={group.include} onToggle={() => mutate((d) => {
                                      for (const c of d.cabins.flatMap((x) => x.legs).flatMap((l) => l.beverages)) {
                                        const g = c.groups.find((y) => y.id === group.id);
                                        if (g) { g.include = !g.include; return; }
                                      }
                                    })} />
                                    <Editable className="ep-text strong" value={group.name} onChange={(v) => mutate((d) => {
                                      for (const c of d.cabins.flatMap((x) => x.legs).flatMap((l) => l.beverages)) {
                                        const g = c.groups.find((y) => y.id === group.id);
                                        if (g) { g.name = v; return; }
                                      }
                                    })} />
                                  </div>
                                  {group.items.map((item) => (
                                    <div className="ep-item" key={item.id}>
                                      <Eye on={item.include} onToggle={() => mutate((d) => {
                                        for (const c of d.cabins.flatMap((x) => x.legs).flatMap((l) => l.beverages)) for (const g of c.groups) {
                                          const it = g.items.find((y) => y.id === item.id);
                                          if (it) { it.include = !it.include; return; }
                                        }
                                      })} />
                                      <div className="ep-item-fields">
                                        <Editable className="ep-text" value={item.name} onChange={(v) => mutate((d) => {
                                          for (const c of d.cabins.flatMap((x) => x.legs).flatMap((l) => l.beverages)) for (const g of c.groups) {
                                            const it = g.items.find((y) => y.id === item.id);
                                            if (it) { it.name = v; return; }
                                          }
                                        })} />
                                      </div>
                                      <Del onDelete={() => mutate((d) => {
                                        for (const c of d.cabins.flatMap((x) => x.legs).flatMap((l) => l.beverages)) for (const g of c.groups) {
                                          const idx = g.items.findIndex((y) => y.id === item.id);
                                          if (idx >= 0) { g.items.splice(idx, 1); return; }
                                        }
                                      })} />
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* snacks */}
                  {leg.snacks.length > 0 && (
                    <details className="acc sub2">
                      <summary><span className="acc-name">Snacks ({leg.snacks.length} groups)</span></summary>
                      <div className="acc-body">
                        <div className="ep-line"><span className="ep-key">Note</span><Editable className="ep-text small" value={leg.snackNote} onChange={(v) => mutate((d) => { const l = d.cabins.flatMap((c) => c.legs).find((x) => x.id === leg.id); if (l) l.snackNote = v; })} /></div>
                        {leg.snacks.map((group: SnackGroup) => (
                          <div className="ep-group" key={group.id}>
                            <div className="ep-course-head">
                              <Eye on={group.include} onToggle={() => mutate((d) => {
                                for (const l of d.cabins.flatMap((c) => c.legs)) {
                                  const g = l.snacks.find((y) => y.id === group.id);
                                  if (g) { g.include = !g.include; return; }
                                }
                              })} />
                              <Editable className="ep-text strong" value={group.name} onChange={(v) => mutate((d) => {
                                for (const l of d.cabins.flatMap((c) => c.legs)) {
                                  const g = l.snacks.find((y) => y.id === group.id);
                                  if (g) { g.name = v; return; }
                                }
                              })} />
                            </div>
                            {group.items.map((item) => (
                              <div className="ep-item" key={item.id}>
                                <Eye on={item.include} onToggle={() => mutate((d) => {
                                  for (const l of d.cabins.flatMap((c) => c.legs)) for (const g of l.snacks) {
                                    const it = g.items.find((y) => y.id === item.id);
                                    if (it) { it.include = !it.include; return; }
                                  }
                                })} />
                                <div className="ep-item-fields">
                                  <Editable className="ep-text" value={item.name} onChange={(v) => mutate((d) => {
                                    for (const l of d.cabins.flatMap((c) => c.legs)) for (const g of l.snacks) {
                                      const it = g.items.find((y) => y.id === item.id);
                                      if (it) { it.name = v; return; }
                                    }
                                  })} />
                                </div>
                                <Del onDelete={() => mutate((d) => {
                                  for (const l of d.cabins.flatMap((c) => c.legs)) for (const g of l.snacks) {
                                    const idx = g.items.findIndex((y) => y.id === item.id);
                                    if (idx >= 0) { g.items.splice(idx, 1); return; }
                                  }
                                })} />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* amenities */}
                  {leg.amenities.length > 0 && (
                    <details className="acc sub2" open={leg.amenitiesOn}>
                      <summary>
                        <Eye on={leg.amenitiesOn} onToggle={() => mutate((d) => { const l = d.cabins.flatMap((c) => c.legs).find((x) => x.id === leg.id); if (l) l.amenitiesOn = !l.amenitiesOn; })} />
                        <span className="acc-name">Amenities</span>
                      </summary>
                      <div className="acc-body">
                        <div className="ep-line"><span className="ep-key">Note</span><Editable className="ep-text small" value={leg.amenityNote} onChange={(v) => mutate((d) => { const l = d.cabins.flatMap((c) => c.legs).find((x) => x.id === leg.id); if (l) l.amenityNote = v; })} /></div>
                        <StringList
                          title="Items"
                          list={leg.amenities}
                          onList={(n) => mutate((d) => { const l = d.cabins.flatMap((c) => c.legs).find((x) => x.id === leg.id); if (l) l.amenities = n; })}
                          placeholder="Amenity"
                        />
                      </div>
                    </details>
                  )}

                  {/* banners & notes */}
                  {leg.banners.length > 0 && (
                    <details className="acc sub2" open={leg.bannersOn}>
                      <summary>
                        <Eye on={leg.bannersOn} onToggle={() => mutate((d) => { const l = d.cabins.flatMap((c) => c.legs).find((x) => x.id === leg.id); if (l) l.bannersOn = !l.bannersOn; })} />
                        <span className="acc-name">Banners</span>
                      </summary>
                      <div className="acc-body">
                        <StringList title="Banners" list={leg.banners} onList={(n) => mutate((d) => { const l = d.cabins.flatMap((c) => c.legs).find((x) => x.id === leg.id); if (l) l.banners = n; })} placeholder="Banner" />
                      </div>
                    </details>
                  )}

                  {leg.notes.length > 0 && (
                    <details className="acc sub2" open={leg.notesOn}>
                      <summary>
                        <Eye on={leg.notesOn} onToggle={() => mutate((d) => { const l = d.cabins.flatMap((c) => c.legs).find((x) => x.id === leg.id); if (l) l.notesOn = !l.notesOn; })} />
                        <span className="acc-name">Notes</span>
                      </summary>
                      <div className="acc-body">
                        <StringList title="Notes" list={leg.notes} onList={(n) => mutate((d) => { const l = d.cabins.flatMap((c) => c.legs).find((x) => x.id === leg.id); if (l) l.notes = n; })} placeholder="Note" />
                      </div>
                    </details>
                  )}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

