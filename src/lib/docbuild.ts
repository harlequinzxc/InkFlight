/**
 * docbuild.ts — MenuDoc → .docx (A4/A6, elegant/compact).
 * Page sizes: A4 = 11906×16838 twips, A6 = 5953×8391 twips (1mm ≈ 56.6929 tw).
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun,
  type IParagraphOptions,
  type ISectionOptions
} from 'docx';
import type { LegSection, MenuDoc } from './types';

const NAVY = '13294B';
const GOLD = '9A7B2D';
const GOLD_SOFT = 'C9A24B';
const INK = '1A1A1A';
const GREY = '595959';
const PAPER_GREY = 'F2F2F2';

const PAGE = {
  A4: { width: 11906, height: 16838, margin: 900 },
  A6: { width: 5953, height: 8391, margin: 480 }
} as const;

const SERIF = 'Georgia';
const SANS = 'Arial';

function beverageLines(leg: LegSection): Array<{ head: string; body: string }> {
  const lines: Array<{ head: string; body: string }> = [];
  for (const cat of leg.beverages) {
    if (!cat.include) continue;
    const active = cat.groups.filter((g) => g.include && g.items.some((i) => i.include));
    const multi = active.length > 1;
    for (const g of active) {
      const names = g.items.filter((i) => i.include).map((i) => i.name);
      if (names.length === 0) continue;
      // one group under the category → just the group name ("Champagne", "White");
      // several groups → keep the category for context ("Champagne and Wine — Red")
      const head = multi ? `${cat.name} — ${g.name}` : g.name !== cat.name ? g.name : cat.name;
      lines.push({ head, body: names.join(', ') });
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Elegant
// ---------------------------------------------------------------------------

function snackLines(leg: LegSection): Array<{ head: string; body: string }> {
  return leg.snacks
    .filter((g) => g.include && g.items.some((i) => i.include))
    .map((g) => ({ head: g.name, body: g.items.filter((i) => i.include).map((i) => i.name).join(', ') }));
}

/** "Main Course" → "MAIN", "Appetiser" → "APP" … (mirrors Paper.tsx) */
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

function dateCode(doc: MenuDoc): string {
  if (doc.dateISO && /^\d{4}-\d{2}-\d{2}$/.test(doc.dateISO)) {
    return doc.dateISO.slice(8, 10) + doc.dateISO.slice(5, 7) + doc.dateISO.slice(2, 4);
  }
  const m = /(\d{1,2})\s+(\w{3})\s+(\d{4})/.exec(doc.dateLabel);
  if (m) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mi = months.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
    if (mi >= 0) return String(m[1]).padStart(2, '0') + String(mi + 1).padStart(2, '0') + m[3].slice(2);
  }
  return '';
}

// ---------------------------------------------------------------------------
// Elegant — SQ seatback card style (per-service header, timeline content)
// ---------------------------------------------------------------------------

function elegantChildren(doc: MenuDoc): Paragraph[] {
  const out: Paragraph[] = [];
  const p = (opts: IParagraphOptions): void => {
    out.push(new Paragraph(opts));
  };
  const rule = (color: string, spaceAfter = 80): void => {
    p({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 2 } }, spacing: { after: spaceAfter } });
  };

  // masthead: flight · date · cabins
  p({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [new TextRun({ text: [doc.flightLabel, doc.dateLabel.toUpperCase(), doc.cabins.map((c) => c.code).join(' · ')].join('   ◆   '), font: SANS, size: 16, color: GOLD, characterSpacing: 40 })]
  });
  if (doc.headerNote) p({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: doc.headerNote, font: SERIF, italics: true, size: 18, color: GREY })] });

  for (const cab of doc.cabins) {
    const legs = cab.legs.filter((l) => l.include);
    if (legs.length === 0) continue;
    if (doc.cabins.length > 1) {
      p({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: cab.title.toUpperCase(), font: SANS, size: 20, bold: true, color: NAVY, characterSpacing: 40 })]
      });
    }
    for (const leg of legs) {
      for (const b of leg.banners) {
        p({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: b, font: SANS, size: 14, italics: true, color: GOLD })] });
      }
      for (const meal of leg.meals.filter((m) => m.include)) {
        p({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 10 }, children: [new TextRun({ text: leg.routeLabel.replace(' → ', ' to ').toUpperCase(), font: SANS, size: 15, color: GREY, characterSpacing: 30 })] });
        p({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: meal.name, font: SERIF, size: 42, bold: true, color: NAVY })] });
        rule(NAVY, 60);
        if (meal.writeUp && doc.showDescriptions) p({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: meal.writeUp, font: SERIF, italics: true, size: 17, color: GREY })] });

        for (const sel of meal.selections.filter((sl) => sl.include)) {
          if (sel.name) p({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 10 }, children: [new TextRun({ text: sel.name, font: SERIF, size: 27, bold: true, color: NAVY })] });
          if (sel.footnote && doc.showDescriptions) p({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: sel.footnote, font: SANS, italics: true, size: 14, color: GREY })] });
          for (const course of sel.courses.filter((c) => c.include && c.items.some((i) => i.include))) {
            const label = course.choose > 1 ? `${course.category} · choose 1 of ${course.choose}` : course.category;
            p({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 30 }, children: [new TextRun({ text: label, font: SANS, italics: true, size: 19, color: '2B3245' })] });
            for (const item of course.items.filter((i) => i.include)) {
              p({ alignment: AlignmentType.CENTER, spacing: { after: 8 }, children: [new TextRun({ text: item.name, font: SANS, size: 21, bold: true, color: INK })] });
              if (doc.showDescriptions && item.desc) p({ alignment: AlignmentType.CENTER, spacing: { after: 24 }, children: [new TextRun({ text: item.desc, font: SANS, italics: true, size: 17, color: GREY })] });
            }
          }
        }

        const bev = beverageLines(leg);
        const snacks = snackLines(leg);
        const extras: Array<{ label: string; lines: Array<{ head: string; body: string }> }> = [];
        if (bev.length > 0) extras.push({ label: 'Beverages', lines: bev });
        if (snacks.length > 0) extras.push({ label: 'Snacks', lines: snacks });
        if (leg.amenities.length > 0) extras.push({ label: 'Amenities', lines: [{ head: '', body: leg.amenities.join(', ') }] });
        for (const ex of extras) {
          p({ alignment: AlignmentType.CENTER, spacing: { before: 90, after: 30 }, children: [new TextRun({ text: ex.label, font: SANS, italics: true, size: 19, color: '2B3245' })] });
          for (const line of ex.lines) {
            const runs = line.head
              ? [new TextRun({ text: `${line.head} — `, font: SANS, size: 17, bold: true, color: NAVY }), new TextRun({ text: line.body, font: SANS, size: 17, color: INK })]
              : [new TextRun({ text: line.body, font: SANS, size: 17, color: INK })];
            p({ alignment: AlignmentType.CENTER, spacing: { after: 15 }, children: runs });
          }
        }

        for (const n of leg.notes.filter(Boolean)) {
          p({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: n, font: SERIF, italics: true, size: 16, color: GREY })] });
        }
      }
    }
  }

  rule(GOLD_SOFT, 60);
  p({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: doc.attribution, font: SANS, size: 12, color: GREY })] });
  return out;
}

// ---------------------------------------------------------------------------
// Compact — crew one-look sheet (header line + COURSE: NAMES)
// ---------------------------------------------------------------------------

function compactChildren(doc: MenuDoc): Paragraph[] {
  const out: Paragraph[] = [];
  const p = (opts: IParagraphOptions): void => {
    out.push(new Paragraph(opts));
  };
  const dc = dateCode(doc);
  const fc = doc.flightLabel.replace(/\s+/g, '');
  const cont = 1_100; // continuation indent (twips)

  for (const cab of doc.cabins) {
    for (const leg of cab.legs.filter((l) => l.include)) {
      const dest = leg.destCode ? ` (→ ${leg.destCode})` : leg.routeCodes ? ` (→ ${leg.routeCodes.split('→').pop()?.trim()})` : '';
      for (const meal of leg.meals.filter((m) => m.include)) {
        p({
          spacing: { before: 60, after: 20 },
          children: [new TextRun({ text: `${fc}${dest} ${cab.code} (${meal.name.toUpperCase()}) ${dc}`, font: SANS, size: 19, bold: true, color: INK })]
        });
        for (const sel of meal.selections.filter((sl) => sl.include)) {
          if (meal.selections.length > 1 && sel.name) {
            p({ spacing: { after: 15 }, children: [new TextRun({ text: sel.name.toUpperCase(), font: SANS, size: 15, color: GREY })] });
          }
          for (const course of sel.courses.filter((c) => c.include && c.items.some((i) => i.include))) {
            const items = course.items.filter((i) => i.include).map((i) => i.name.toUpperCase());
            const label = `${shortCourseLabel(course.category)}${course.choose > 1 ? ` (CHOOSE 1 OF ${course.choose})` : ''}:`;
            items.forEach((name, idx) => {
              if (idx === 0) {
                p({ spacing: { after: 8 }, children: [new TextRun({ text: `${label} `, font: SANS, size: 19, bold: true, color: INK }), new TextRun({ text: name, font: SANS, size: 19, color: INK })] });
              } else {
                p({ indent: { left: cont }, spacing: { after: 8 }, children: [new TextRun({ text: name, font: SANS, size: 19, color: INK })] });
              }
            });
          }
        }
      }

      const bev = beverageLines(leg);
      if (bev.length > 0) {
        p({ spacing: { before: 60, after: 20 }, children: [new TextRun({ text: `${fc}${dest} ${cab.code} (BEVERAGES) ${dc}`, font: SANS, size: 19, bold: true, color: INK })] });
        for (const line of bev) {
          p({ spacing: { after: 8 }, children: [new TextRun({ text: `${shortCourseLabel(line.head.split(' — ').pop() ?? line.head)}: `, font: SANS, size: 19, bold: true, color: INK }), new TextRun({ text: line.body.toUpperCase(), font: SANS, size: 19, color: INK })] });
        }
      }
      for (const line of snackLines(leg)) {
        p({ spacing: { after: 8 }, children: [new TextRun({ text: `${shortCourseLabel(line.head.split(' — ').pop() ?? line.head)}: `, font: SANS, size: 19, bold: true, color: INK }), new TextRun({ text: line.body.toUpperCase(), font: SANS, size: 19, color: INK })] });
      }
      if (leg.amenities.length > 0) {
        p({ spacing: { after: 8 }, children: [new TextRun({ text: 'AMENITY: ', font: SANS, size: 19, bold: true, color: INK }), new TextRun({ text: leg.amenities.join(', ').toUpperCase(), font: SANS, size: 19, color: INK })] });
      }
      for (const b of leg.banners) {
        p({ spacing: { after: 10 }, children: [new TextRun({ text: `NOTE: ${b.toUpperCase()}`, font: SANS, size: 15, italics: true, color: GREY })] });
      }
    }
  }

  p({ spacing: { before: 80 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: GOLD_SOFT, space: 4 } }, children: [new TextRun({ text: doc.attribution, font: SANS, size: 11, color: GREY })] });
  return out;
}



export async function buildDocx(doc: MenuDoc, layout: 'elegant' | 'compact', size: 'A4' | 'A6'): Promise<Blob> {
  const page = PAGE[size];
  const section: ISectionOptions = {
    properties: {
      page: {
        size: { width: page.width, height: page.height },
        margin: { top: page.margin, right: page.margin, bottom: page.margin, left: page.margin }
      }
    },
    children: layout === 'elegant' ? elegantChildren(doc) : compactChildren(doc)
  };

  const document = new Document({
    creator: 'InkFlight',
    title: `${doc.flightLabel} — ${doc.dateLabel} (${layout}, ${size})`,
    styles: {
      default: {
        document: {
          run: { font: layout === 'elegant' ? SERIF : SANS, size: 16 }
        }
      }
    },
    sections: [section]
  });

  return Packer.toBlob(document);
}

export function docxFilename(doc: MenuDoc, layout: string, size: string): string {
  const stamp = doc.dateLabel.replace(/[^\w]+/g, '-');
  return `InkFlight-${doc.flightLabel.replace(/\s+/g, '')}-${stamp}-${size}-${layout}.docx`;
}
