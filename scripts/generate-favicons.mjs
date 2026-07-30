// Rasterize the canonical app icon (public/yomu-icon.svg) into every shipped PNG,
// so browser-extension icons and website favicons always match the SVG.
// Chromium renders the vector natively at each target size (sharp downscaling of
// the actual artwork, not a re-resampled raster). Run: node scripts/generate-favicons.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const { FAVICON_ICO_SOURCES, faviconIcoBytes } = createRequire(import.meta.url)('./lib/favicon-ico.cjs');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/yomu-icon.svg'), 'utf8');
writeFileSync(join(root, 'docs/public/yomu-icon.svg'), svg);
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

// Android treats a web app as installable only when the manifest offers a
// raster icon of at least 192px, so the Study PWA needs 192 and 512 alongside
// the favicons. The maskable copy insets the artwork inside an opaque plate:
// Android crops a maskable icon to the inner 80% circle, and a full-bleed
// rounded square loses its corners (and the pink flourish) to that crop.
const MASKABLE_ART_RATIO = 0.6;
const MASKABLE_PLATE = '#181b20';

const targets = [
    { size: 180, name: 'apple-touch-icon.png', outDirs: ['public', 'docs/public'] },
    { size: 32, name: 'favicon-32x32.png', outDirs: ['public', 'docs/public'] },
    { size: 16, name: 'favicon-16x16.png', outDirs: ['public', 'docs/public'] },
    { size: 192, name: 'pwa-icon-192.png', outDirs: ['public', 'docs/public'] },
    { size: 512, name: 'pwa-icon-512.png', outDirs: ['public', 'docs/public'] },
    { size: 512, name: 'pwa-icon-maskable-512.png', outDirs: ['public', 'docs/public'], maskable: true },
    ...[16, 32, 48, 128].map(size => ({
        size,
        name: `icon${size}.png`,
        outDirs: ['public/extension-icons'],
    })),
];

const browser = await chromium.launch();
const rendered = new Map();
try {
    for (const { size, name, outDirs, maskable } of targets) {
        const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
        const artSize = maskable ? Math.round(size * MASKABLE_ART_RATIO) : size;
        const plate = maskable
            ? `html,body{background:${MASKABLE_PLATE}}body{display:grid;place-items:center;width:${size}px;height:${size}px}`
            : '';
        await page.setContent(
            `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}${plate}` +
            `img{display:block;width:${artSize}px;height:${artSize}px}</style>` +
            `<img src="${dataUri}">`,
            { waitUntil: 'load' },
        );
        await page.waitForTimeout(150); // let the inline SVG (system-font glyph) settle
        const buffer = await page.screenshot({
            omitBackground: !maskable,
            clip: { x: 0, y: 0, width: size, height: size },
        });
        for (const dir of outDirs) writeFileSync(join(root, dir, name), buffer);
        rendered.set(name, buffer);
        await page.close();
        console.log(`✓ ${name} ${size}x${size} → ${outDirs.join(', ')} (${buffer.length}B)`);
    }
} finally {
    await browser.close();
}

// The root .ico every browser and unfurler asks for without being told to.
const icoOutDirs = ['public', 'docs/public'];
const ico = faviconIcoBytes(FAVICON_ICO_SOURCES.map(name => rendered.get(name)));
for (const dir of icoOutDirs) writeFileSync(join(root, dir, 'favicon.ico'), ico);
console.log(`✓ favicon.ico ${FAVICON_ICO_SOURCES.join(' + ')} → ${icoOutDirs.join(', ')} (${ico.length}B)`);
