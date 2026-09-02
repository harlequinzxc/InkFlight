/**
 * Renders PWA icons from public/icon.svg via @resvg/resvg-js.
 * Transparent icons for general use; navy-backed variants for
 * maskable (Android) and apple-touch-icon (iOS mats transparency to black).
 */
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'icon.svg'), 'utf8');

const PLANE_TRANSFORM = 'translate(256 256) scale(0.78) translate(-256 -256)';

const transparentSvg = svg;

const navySvg = svg.replace(
  '<!-- gold folded paper plane · transparent background -->',
  `<rect width="512" height="512" fill="#071b33"/><g transform="${PLANE_TRANSFORM}">`
).replace('</svg>', '</g></svg>');

const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });

function render(name, svgText, width, height) {
  const resvg = new Resvg(svgText, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false }
  });
  const png = resvg.render().asPng();
  writeFileSync(join(outDir, name), png);
  console.log(`✓ ${name} (${width}×${height ?? width})`);
}

// transparent (any purpose)
render('icon-192.png', transparentSvg, 192);
render('icon-512.png', transparentSvg, 512);
render('favicon.png', transparentSvg, 48);

// maskable — full-bleed navy, plane in safe zone
render('icon-maskable-512.png', navySvg, 512);

// apple touch icon — iOS composites transparency onto black otherwise
render('apple-touch-icon.png', navySvg, 180);

writeFileSync(join(root, 'public', 'favicon.svg'), transparentSvg);
console.log('✓ favicon.svg (copied)');
