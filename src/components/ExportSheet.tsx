import { useState } from 'react';
import { buildDocx, docxFilename } from '../lib/docbuild';
import { exportPaperImage, imageFilename, triggerDownload, type ImageFormat } from '../lib/exportImage';
import type { LayoutKind, MenuDoc, PaperSize } from '../lib/types';

interface ExportSheetProps {
  open: boolean;
  onClose: () => void;
  doc: MenuDoc;
  layout: LayoutKind;
  size: PaperSize;
  paperRef: React.RefObject<HTMLDivElement | null>;
  onToast: (msg: string, kind?: 'ok' | 'err') => void;
}

export default function ExportSheet({ open, onClose, doc, layout, size, paperRef, onToast }: ExportSheetProps) {
  const [format, setFormat] = useState<ImageFormat>('png');
  const [hiRes, setHiRes] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (!open) return null;

  const doImage = async (): Promise<void> => {
    const node = paperRef.current;
    if (!node) {
      onToast('Menu sheet is not ready yet.', 'err');
      return;
    }
    setBusy('image');
    // Neutralise the preview's scale wrapper while rasterising, otherwise the
    // capture inherits the on-screen transform and comes out tiny/clipped.
    const scaleWrap = node.closest('.paper-scale') as HTMLElement | null;
    const slot = node.closest('.paper-slot') as HTMLElement | null;
    const prev = {
      transform: scaleWrap?.style.transform ?? '',
      w: slot?.style.width ?? '',
      h: slot?.style.height ?? ''
    };
    if (scaleWrap) scaleWrap.style.transform = 'none';
    if (slot) {
      slot.style.width = 'auto';
      slot.style.height = 'auto';
    }
    try {
      await exportPaperImage(node, {
        format,
        scale: hiRes ? 3 : 2,
        filename: imageFilename(doc, layout, size, format)
      });
      onToast(`${format.toUpperCase()} saved — check your downloads.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Export failed.', 'err');
    } finally {
      if (scaleWrap) scaleWrap.style.transform = prev.transform;
      if (slot) {
        slot.style.width = prev.w;
        slot.style.height = prev.h;
      }
      setBusy(null);
    }
  };

  const doDocx = async (): Promise<void> => {
    setBusy('docx');
    try {
      const blob = await buildDocx(doc, layout, size);
      triggerDownload(URL.createObjectURL(blob), docxFilename(doc, layout, size));
      onToast('Word document saved — check your downloads.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Export failed.', 'err');
    } finally {
      setBusy(null);
    }
  };

  const doPrint = (): void => {
    document.body.classList.add('print-paper');
    const cleanup = (): void => {
      document.body.classList.remove('print-paper');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Export menu">
        <div className="sheet-handle" />
        <div className="sheet-title">Export menu sheet</div>
        <div className="sheet-note">
          {size} · {layout === 'elegant' ? 'Elegant' : 'Compact'} layout — change these from the toolbar.
        </div>

        <div className="export-group">
          <div className="sheet-label">Printable image</div>
          <div className="seg seg-row">
            <button type="button" className={format === 'png' ? 'on' : ''} onClick={() => setFormat('png')}>PNG</button>
            <button type="button" className={format === 'jpeg' ? 'on' : ''} onClick={() => setFormat('jpeg')}>JPEG</button>
          </div>
          <div className="seg seg-row seg-sm">
            <button type="button" className={!hiRes ? 'on' : ''} onClick={() => setHiRes(false)}>Standard</button>
            <button type="button" className={hiRes ? 'on' : ''} onClick={() => setHiRes(true)}>High res</button>
          </div>
          <button type="button" className="btn btn-primary btn-lg sheet-btn" disabled={busy !== null} onClick={() => void doImage()}>
            {busy === 'image' ? 'Rendering…' : `Download ${format.toUpperCase()}`}
          </button>
        </div>

        <div className="export-group">
          <div className="sheet-label">Word document</div>
          <button type="button" className="btn btn-ghost btn-lg sheet-btn" disabled={busy !== null} onClick={() => void doDocx()}>
            {busy === 'docx' ? 'Building…' : 'Download .docx'}
          </button>
        </div>

        <div className="export-group">
          <button type="button" className="btn btn-ghost sheet-btn" onClick={doPrint}>🖨 Print directly</button>
        </div>

        <button type="button" className="sheet-close" onClick={onClose}>Close</button>
      </div>
    </>
  );
}
