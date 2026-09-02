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
      const head = multi && g.name !== cat.name ? `${cat.name} — ${g.name}` : cat.name;
      lines.push({ head, body: names.join(', ') });
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Elegant
// ---------------------------------------------------------------------------

function elegantChildren(doc: MenuDoc): Paragraph[] {
  const out: Paragraph[] = [];
  const p = (opts: IParagraphOptions): void => {
    out.push(new Paragraph(opts));
  };
  const smallRule = (): void => {
    p({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD_SOFT, space: 2 } }, spacing: { after: 140 } });
  };

  p({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'SINGAPORE AIRLINES', font: SANS, size: 15, color: GOLD, characterSpacing: 60 })] });
  p({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 20 }, children: [new TextRun({ text: doc.flightLabel, font: SERIF, size: 52, bold: true, color: NAVY })] });
  p({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: doc.dateLabel, font: SANS, size: 17, color: GREY })] });
  if (doc.headerNote) p({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: doc.headerNote, font: SERIF, italics: true, size: 17, color: GREY })] });
  smallRule();

  for (const cab of doc.cabins) {
    const legs = cab.legs.filter((l) => l.include);
    if (legs.length === 0) continue;

    p({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 60 },
      children: [new TextRun({ text: cab.title.toUpperCase(), font: SANS, size: 21, bold: true, color: NAVY, characterSpacing: 40 })]
    });
    p({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD_SOFT, space: 4 } },
      children: []
    });

    for (const leg of legs) {
      if (leg.routeLabel || leg.timeLabel) {
        p({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: [leg.routeLabel, leg.timeLabel].filter(Boolean).join('  ·  '), font: SANS, size: 15, color: GREY })]
        });
      }
      for (const b of leg.banners) {
        p({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: b, font: SANS, size: 14, italics: true, color: GOLD })] });
      }

      for (const meal of leg.meals.filter((m) => m.include)) {
        p({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 30 },
          children: [new TextRun({ text: `◆  ${meal.name}  ◆`, font: SERIF, size: 26, color: NAVY, bold: true })]
        });
        if (meal.writeUp) p({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: meal.writeUp, font: SERIF, italics: true, size: 16, color: GREY })] });

        for (const sel of meal.selections.filter((s) => s.include)) {
          if (sel.name) p({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 20 }, children: [new TextRun({ text: sel.name.toUpperCase(), font: SANS, size: 17, bold: true, color: GOLD, characterSpacing: 30 })] });
          if (sel.footnote) p({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: sel.footnote, font: SANS, italics: true, size: 13, color: GREY })] });

          for (const course of sel.courses.filter((c) => c.include)) {
            const label = course.choose > 1 ? `${course.category} · CHOOSE ONE OF ${course.choose}` : course.category.toUpperCase();
            p({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 }, children: [new TextRun({ text: label, font: SANS, size: 15, bold: true, color: NAVY, characterSpacing: 30 })] });
            for (const item of course.items.filter((i) => i.include)) {
              p({ alignment: AlignmentType.CENTER, spacing: { after: 10 }, children: [new TextRun({ text: item.name, font: SERIF, size: 21, bold: true, color: INK })] });
              if (doc.showDescriptions && item.desc)
                p({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: item.desc, font: SANS, italics: true, size: 14, color: GREY })] });
            }
          }
        }
      }

      const bev = beverageLines(leg);
      if (bev.length > 0) {
        p({
          alignment: AlignmentType.CENTER,
          spacing: { before: 140, after: 40 },
          children: [new TextRun({ text: 'BEVERAGES', font: SANS, size: 16, bold: true, color: NAVY, characterSpacing: 40 })]
        });
        for (const line of bev) {
          p({
            alignment: AlignmentType.CENTER,
            spacing: { after: 20 },
            children: [
              new TextRun({ text: `${line.head} — `, font: SANS, size: 15, bold: true, color: INK }),
              new TextRun({ text: line.body, font: SANS, size: 15, color: INK })
            ]
          });
        }
      }

      if (leg.snacks.length > 0) {
        p({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 40 },
          children: [new TextRun({ text: 'SNACKS', font: SANS, size: 16, bold: true, color: NAVY, characterSpacing: 40 })]
        });
        if (leg.snackNote) p({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: leg.snackNote, font: SANS, italics: true, size: 13, color: GREY })] });
        for (const g of leg.snacks.filter((g) => g.include)) {
          const names = g.items.filter((i) => i.include).map((i) => i.name);
          if (names.length === 0) continue;
          p({
            alignment: AlignmentType.CENTER,
            spacing: { after: 20 },
            children: [
              new TextRun({ text: `${g.name} — `, font: SANS, size: 15, bold: true, color: INK }),
              new TextRun({ text: names.join(', '), font: SANS, size: 15, color: INK })
            ]
          });
        }
      }

      if (leg.amenities.length > 0) {
        p({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 40 },
          children: [new TextRun({ text: 'AMENITIES', font: SANS, size: 16, bold: true, color: NAVY, characterSpacing: 40 })]
        });
        if (leg.amenityNote) p({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: leg.amenityNote, font: SANS, italics: true, size: 13, color: GREY })] });
        p({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: leg.amenities.join(', '), font: SANS, size: 15, color: INK })] });
      }

      for (const n of leg.notes.filter(Boolean)) {
        p({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: n, font: SERIF, italics: true, size: 14, color: GREY })] });
      }
    }
  }

  smallRule();
  p({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: doc.attribution, font: SANS, size: 12, color: GREY })] });
  return out;
}

// ---------------------------------------------------------------------------
// Compact
// ---------------------------------------------------------------------------

function compactChildren(doc: MenuDoc): Paragraph[] {
  const out: Paragraph[] = [];
  const p = (opts: IParagraphOptions): void => {
    out.push(new Paragraph(opts));
  };

  p({
    spacing: { after: 10 },
    shading: { fill: NAVY },
    children: [
      new TextRun({ text: ` ${doc.flightLabel}`, font: SANS, size: 22, bold: true, color: 'FFFFFF' }),
      new TextRun({ text: `   ·   ${doc.dateLabel} `, font: SANS, size: 16, color: GOLD_SOFT })
    ]
  });
  if (doc.headerNote) p({ spacing: { after: 40 }, children: [new TextRun({ text: doc.headerNote, font: SANS, size: 13, italics: true, color: GREY })] });

  for (const cab of doc.cabins) {
    const legs = cab.legs.filter((l) => l.include);
    if (legs.length === 0) continue;

    p({
      spacing: { before: 80, after: 30 },
      shading: { fill: PAPER_GREY },
      children: [new TextRun({ text: ` ${cab.title.toUpperCase()}`, font: SANS, size: 18, bold: true, color: NAVY })]
    });

    for (const leg of legs) {
      if (leg.routeLabel || leg.timeLabel) {
        p({ spacing: { after: 30 }, children: [new TextRun({ text: [leg.routeLabel, leg.timeLabel].filter(Boolean).join('  ·  '), font: SANS, size: 14, color: GREY })] });
      }
      for (const b of leg.banners) {
        p({ spacing: { after: 30 }, children: [new TextRun({ text: `▸ ${b}`, font: SANS, size: 13, italics: true, color: GOLD })] });
      }

      for (const meal of leg.meals.filter((m) => m.include)) {
        p({
          spacing: { before: 50, after: 20 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 6 } },
          children: [new TextRun({ text: meal.name, font: SANS, size: 18, bold: true, color: NAVY })]
        });
        for (const sel of meal.selections.filter((s) => s.include)) {
          if (sel.name) p({ spacing: { after: 20 }, children: [new TextRun({ text: sel.name, font: SANS, size: 15, bold: true, italics: true, color: GOLD })] });
          for (const course of sel.courses.filter((c) => c.include)) {
            const items = course.items.filter((i) => i.include);
            if (items.length === 0) continue;
            const runs: TextRun[] = [
              new TextRun({ text: `${course.category}${course.choose > 1 ? ` (choose 1 of ${course.choose})` : ''}: `, font: SANS, size: 16, bold: true, color: INK })
            ];
            items.forEach((item, idx) => {
              runs.push(new TextRun({ text: item.name, font: SANS, size: 16, color: INK }));
              if (doc.showDescriptions && item.desc) runs.push(new TextRun({ text: ` (${item.desc})`, font: SANS, size: 13, color: GREY }));
              if (idx < items.length - 1) runs.push(new TextRun({ text: '  ·  ', font: SANS, size: 16, bold: true, color: GOLD }));
            });
            p({ spacing: { after: 20 }, children: runs });
          }
        }
      }

      const bev = beverageLines(leg);
      if (bev.length > 0) {
        p({ spacing: { before: 50, after: 20 }, children: [new TextRun({ text: 'BEVERAGES', font: SANS, size: 15, bold: true, color: NAVY, characterSpacing: 20 })] });
        for (const line of bev) {
          p({
            spacing: { after: 15 },
            children: [
              new TextRun({ text: `${line.head}: `, font: SANS, size: 14, bold: true, color: INK }),
              new TextRun({ text: line.body, font: SANS, size: 14, color: INK })
            ]
          });
        }
      }

      if (leg.snacks.length > 0) {
        p({ spacing: { before: 50, after: 20 }, children: [new TextRun({ text: 'SNACKS', font: SANS, size: 15, bold: true, color: NAVY, characterSpacing: 20 })] });
        for (const g of leg.snacks.filter((g) => g.include)) {
          const names = g.items.filter((i) => i.include).map((i) => i.name);
          if (names.length === 0) continue;
          p({
            spacing: { after: 15 },
            children: [
              new TextRun({ text: `${g.name}: `, font: SANS, size: 14, bold: true, color: INK }),
              new TextRun({ text: names.join(', '), font: SANS, size: 14, color: INK })
            ]
          });
        }
      }

      if (leg.amenities.length > 0) {
        p({
          spacing: { before: 50, after: 15 },
          children: [
            new TextRun({ text: 'AMENITIES: ', font: SANS, size: 15, bold: true, color: NAVY, characterSpacing: 20 }),
            new TextRun({ text: leg.amenities.join(', '), font: SANS, size: 14, color: INK })
          ]
        });
      }

      for (const n of leg.notes.filter(Boolean)) {
        p({ spacing: { after: 15 }, children: [new TextRun({ text: n, font: SANS, size: 12, italics: true, color: GREY })] });
      }
    }
  }

  p({ spacing: { before: 60 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: GOLD_SOFT, space: 4 } }, children: [new TextRun({ text: doc.attribution, font: SANS, size: 11, color: GREY })] });
  return out;
}

// ---------------------------------------------------------------------------

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
