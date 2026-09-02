/** exportImage.ts — paper DOM node → PNG/JPEG download (html2canvas-pro). */

export type ImageFormat = 'png' | 'jpeg';

export async function exportPaperImage(
  node: HTMLElement,
  opts: { format: ImageFormat; scale?: number; filename: string; greyscale?: boolean }
): Promise<void> {
  const { format, filename } = opts;
  const scale = opts.scale ?? 2;

  // ensure webfonts are ready before rasterising
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    /* older browsers — proceed */
  }

  const html2canvas = (await import('html2canvas-pro')).default;
  const canvas = await html2canvas(node, {
    scale,
    backgroundColor: '#ffffff',
    logging: false,
    useCORS: false,
    allowTaint: false
  });

  if (opts.greyscale) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = y;
      }
      ctx.putImageData(img, 0, 0);
    }
  }

  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, format === 'jpeg' ? 0.92 : undefined));
  if (!blob) throw new Error('Could not rasterise the menu sheet.');

  triggerDownload(URL.createObjectURL(blob), filename);
}

export function imageFilename(doc: { flightLabel: string; dateLabel: string }, layout: string, size: string, format: ImageFormat): string {
  const stamp = doc.dateLabel.replace(/[^\w]+/g, '-');
  return `InkFlight-${doc.flightLabel.replace(/\s+/g, '')}-${stamp}-${size}-${layout}.${format === 'png' ? 'png' : 'jpg'}`;
}

export function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // give the browser a moment before revoking
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
