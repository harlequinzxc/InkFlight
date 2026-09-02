import { useEffect, useRef, useState } from 'react';
import EditPanel from '../components/EditPanel';
import ExportSheet from '../components/ExportSheet';
import PaperPreview from '../components/PaperPreview';
import type { LayoutKind, MenuDoc, PaperSize } from '../lib/types';

interface EditorProps {
  sheets: MenuDoc[];
  onSheetsChange: (next: MenuDoc[]) => void;
  layout: LayoutKind;
  size: PaperSize;
  fontScale: number;
  onLayout: (l: LayoutKind) => void;
  onSize: (s: PaperSize) => void;
  onFontScale: (f: number) => void;
  onBack: () => void;
  onToast: (msg: string, kind?: 'ok' | 'err') => void;
}

export default function Editor({ sheets, onSheetsChange, layout, size, fontScale, onLayout, onSize, onFontScale, onBack, onToast }: EditorProps) {
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<'sheet' | 'edit'>('sheet');
  const [exportOpen, setExportOpen] = useState(false);
  const [active, setActive] = useState(0);

  const idx = Math.min(active, sheets.length - 1);
  const doc = sheets[idx];
  const multi = sheets.length > 1;

  // if a new fetch replaces the sheets, land on the first one
  useEffect(() => {
    setActive(0);
  }, [sheets]);

  if (!doc) return null;

  const updateSheet = (next: MenuDoc): void => {
    onSheetsChange(sheets.map((s, i) => (i === idx ? next : s)));
  };

  const toggleDescriptions = (): void => {
    updateSheet({ ...doc, showDescriptions: !doc.showDescriptions });
  };

  const sheetName = (s: MenuDoc, i: number): string => s.sheetTitle ?? `Sheet ${i + 1}`;

  return (
    <div className="view editor">
      <header className="ed-topbar chrome">
        <button type="button" className="backlink" onClick={onBack} aria-label="Back to search">
          ‹
        </button>
        <div className="ed-title">
          <div className="ed-flight">
            {doc.flightLabel}
            {multi ? <span className="ed-count"> · {sheets.length} sheets</span> : null}
          </div>
          <div className="ed-date">{doc.dateLabel}{multi && doc.sheetTitle ? ` · ${sheetName(doc, idx)}` : ''}</div>
        </div>
        <button type="button" className="btn btn-primary ed-export" onClick={() => setExportOpen(true)}>
          Export
        </button>
      </header>

      {multi && (
        <div className="sheet-pager chrome" role="tablist" aria-label="Menu sheets">
          {sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === idx}
              className={`pager-pill${i === idx ? ' on' : ''}`}
              onClick={() => setActive(i)}
            >
              <span className="pager-num">{i + 1}</span>
              <span className="pager-name">{sheetName(s, i)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ed-toolbar chrome">
        <div className="seg" aria-label="Layout">
          <button type="button" className={layout === 'elegant' ? 'on' : ''} onClick={() => onLayout('elegant')}>Elegant</button>
          <button type="button" className={layout === 'compact' ? 'on' : ''} onClick={() => onLayout('compact')}>Compact</button>
        </div>
        <div className="seg" aria-label="Paper size">
          <button type="button" className={size === 'A4' ? 'on' : ''} onClick={() => onSize('A4')}>A4</button>
          <button type="button" className={size === 'A6' ? 'on' : ''} onClick={() => onSize('A6')}>A6</button>
        </div>
        <div className="seg" aria-label="Text size">
          <button type="button" onClick={() => onFontScale(Math.max(0.85, Math.round((fontScale - 0.07) * 100) / 100))} aria-label="Smaller text">A−</button>
          <button type="button" className="noclick">{Math.round(fontScale * 100)}%</button>
          <button type="button" onClick={() => onFontScale(Math.min(1.2, Math.round((fontScale + 0.07) * 100) / 100))} aria-label="Bigger text">A+</button>
        </div>
        <button type="button" className={`togglechip${doc.showDescriptions ? ' on' : ''}`} onClick={toggleDescriptions}>
          {doc.showDescriptions ? '✓' : ''} Descriptions
        </button>
      </div>

      <div className="ed-tabs chrome">
        <div className="seg seg-wide">
          <button type="button" className={tab === 'sheet' ? 'on' : ''} onClick={() => setTab('sheet')}>Menu sheet</button>
          <button type="button" className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>Edit content</button>
        </div>
      </div>

      <div className={`ed-body ${tab === 'sheet' ? 'show-sheet' : 'show-edit'}`}>
        <div className="ed-sheetpane">
          <PaperPreview key={idx} doc={doc} layout={layout} size={size} fontScale={fontScale} paperRef={paperRef} />
          <div className="ed-sheetfoot chrome">
            {multi ? `Sheet ${idx + 1} of ${sheets.length} · live preview (${size})` : `Live preview · exactly what will be exported (${size})`}
          </div>
        </div>
        <div className="ed-editpane">
          <EditPanel doc={doc} onChange={updateSheet} />
        </div>
      </div>

      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        doc={doc}
        layout={layout}
        size={size}
        sheetTag={multi ? `S${idx + 1}` : undefined}
        paperRef={paperRef}
        onToast={onToast}
      />
    </div>
  );
}
