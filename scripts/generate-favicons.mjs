// Rasterize the canonical app icon (public/yomu-icon.svg) into the PNG favicons,
// so apple-touch-icon / favicon-32x32 / favicon-16x16 always match the SVG.
// Chromium renders the vector natively at each target size (sharp downscaling of
// the actual artwork, not a re-resampled raster). Run: node scripts/generate-favicons.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/yomu-icon.svg'), 'utf8');
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const targets = [
    { size: 180, name: 'apple-touch-icon.png' },
    { size: 32, name: 'favicon-32x32.png' },
    { size: 16, name: 'favicon-16x16.png' },
];
const outDirs = ['public', 'docs/public'];

const browser = await chromium.launch();
try {
    for (const { size, name } of targets) {
        const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
        await page.setContent(
            `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}` +
            `img{display:block;width:${size}px;height:${size}px}</style>` +
            `<img src="${dataUri}">`,
            { waitUntil: 'load' },
        );
        await page.waitForTimeout(150); // let the inline SVG (system-font glyph) settle
        const buffer = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
        for (const dir of outDirs) writeFileSync(join(root, dir, name), buffer);
        await page.close();
        console.log(`✓ ${name} ${size}x${size} → ${outDirs.join(', ')} (${buffer.length}B)`);
    }
} finally {
    await browser.close();
}
