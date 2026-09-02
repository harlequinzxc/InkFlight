import { useEffect, useRef, useState } from 'react';
import Paper from './Paper';
import type { LayoutKind, MenuDoc, PaperSize } from '../lib/types';

const PX_PER_MM = 96 / 25.4;
const SIZE_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A6: { w: 105, h: 148 }
};

interface PaperPreviewProps {
  doc: MenuDoc;
  layout: LayoutKind;
  size: PaperSize;
  fontScale: number;
  paperRef?: React.Ref<HTMLDivElement>;
}

/** Renders the paper at true mm size, scaled to fit the available width. */
export default function PaperPreview({ doc, layout, size, fontScale, paperRef }: PaperPreviewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerPaperRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);
  const [paperH, setPaperH] = useState(SIZE_MM[size].h * PX_PER_MM);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      if (w > 0) setScale(Math.min(1, (w - 4) / (SIZE_MM[size].w * PX_PER_MM)));
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [size]);

  useEffect(() => {
    const el = innerPaperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setPaperH(Math.max(SIZE_MM[size].h * PX_PER_MM, el.scrollHeight));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  const mergedRef = (node: HTMLDivElement | null) => {
    innerPaperRef.current = node;
    if (typeof paperRef === 'function') paperRef(node);
    else if (paperRef && typeof paperRef === 'object') (paperRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  return (
    <div className="paper-viewport" ref={wrapRef}>
      <div className="paper-slot" style={{ height: paperH * scale, width: SIZE_MM[size].w * PX_PER_MM * scale }}>
        <div className="paper-scale" style={{ width: SIZE_MM[size].w * PX_PER_MM, transform: `scale(${scale})` }}>
          <Paper doc={doc} layout={layout} size={size} fontScale={fontScale} paperRef={mergedRef} />
        </div>
      </div>
    </div>
  );
}
