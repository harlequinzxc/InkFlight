import { useRef, useState } from 'react';
import EditPanel from '../components/EditPanel';
import ExportSheet from '../components/ExportSheet';
import PaperPreview from '../components/PaperPreview';
import type { LayoutKind, MenuDoc, PaperSize } from '../lib/types';

interface EditorProps {
  doc: MenuDoc;
  onDocChange: (next: MenuDoc) => void;
  layout: LayoutKind;
  size: PaperSize;
  fontScale: number;
  onLayout: (l: LayoutKind) => void;
  onSize: (s: PaperSize) => void;
  onFontScale: (f: number) => void;
  onBack: () => void;
  onToast: (msg: string, kind?: 'ok' | 'err') => void;
}

export default function Editor(props: EditorProps) {
  const { doc, layout, size, fontScale } = props;
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<'sheet' | 'edit'>('sheet');
  const [exportOpen, setExportOpen] = useState(false);

  const toggleDescriptions = (): void => {
    props.onDocChange({ ...doc, showDescriptions: !doc.showDescriptions });
  };

  return (
    <div className="view editor">
      <header className="ed-topbar chrome">
        <button type="button" className="backlink" onClick={props.onBack} aria-label="Back to search">
          ‹
        </button>
        <div className="ed-title">
          <div className="ed-flight">{doc.flightLabel}</div>
          <div className="ed-date">{doc.dateLabel}</div>
        </div>
        <button type="button" className="btn btn-primary ed-export" onClick={() => setExportOpen(true)}>
          Export
        </button>
      </header>

      <div className="ed-toolbar chrome">
        <div className="seg" aria-label="Layout">
          <button type="button" className={layout === 'elegant' ? 'on' : ''} onClick={() => props.onLayout('elegant')}>Elegant</button>
          <button type="button" className={layout === 'compact' ? 'on' : ''} onClick={() => props.onLayout('compact')}>Compact</button>
        </div>
        <div className="seg" aria-label="Paper size">
          <button type="button" className={size === 'A4' ? 'on' : ''} onClick={() => props.onSize('A4')}>A4</button>
          <button type="button" className={size === 'A6' ? 'on' : ''} onClick={() => props.onSize('A6')}>A6</button>
        </div>
        <div className="seg" aria-label="Text size">
          <button type="button" onClick={() => props.onFontScale(Math.max(0.85, Math.round((fontScale - 0.07) * 100) / 100))} aria-label="Smaller text">A−</button>
          <button type="button" className="noclick">{Math.round(fontScale * 100)}%</button>
          <button type="button" onClick={() => props.onFontScale(Math.min(1.2, Math.round((fontScale + 0.07) * 100) / 100))} aria-label="Bigger text">A+</button>
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
          <PaperPreview doc={doc} layout={layout} size={size} fontScale={fontScale} paperRef={paperRef} />
          <div className="ed-sheetfoot chrome">Live preview · exactly what will be exported ({size})</div>
        </div>
        <div className="ed-editpane">
          <EditPanel doc={doc} onChange={props.onDocChange} />
        </div>
      </div>

      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        doc={doc}
        layout={layout}
        size={size}
        paperRef={paperRef}
        onToast={props.onToast}
      />
    </div>
  );
}
