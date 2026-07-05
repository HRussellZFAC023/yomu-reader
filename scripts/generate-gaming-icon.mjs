// Render the canonical app icon (public/yomu-icon.svg) into the Yomu Gaming
// desktop icon assets: yomu-gaming-512.png plus a prebuilt yomu-gaming.icns
// with every macOS representation rendered from the vector at its exact size.
// electron-builder's app-builder downscaler corrupts the small (16/32px) icns
// reps when it derives them from a single 512 PNG, so we never let it — the
// committed .icns is handed to it verbatim. Run: node scripts/generate-gaming-icon.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'app-icons');
const svg = readFileSync(join(root, 'public/yomu-icon.svg'), 'utf8');
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const iconsetReps = [
    { size: 16, name: 'icon_16x16.png' },
    { size: 32, name: 'icon_16x16@2x.png' },
    { size: 32, name: 'icon_32x32.png' },
    { size: 64, name: 'icon_32x32@2x.png' },
    { size: 128, name: 'icon_128x128.png' },
    { size: 256, name: 'icon_128x128@2x.png' },
    { size: 256, name: 'icon_256x256.png' },
    { size: 512, name: 'icon_256x256@2x.png' },
    { size: 512, name: 'icon_512x512.png' },
    { size: 1024, name: 'icon_512x512@2x.png' },
];

const browser = await chromium.launch();
const renders = new Map();
try {
    for (const size of new Set(iconsetReps.map(rep => rep.size))) {
        const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
        await page.setContent(
            `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}` +
            `img{display:block;width:${size}px;height:${size}px}</style>` +
            `<img src="${dataUri}">`,
            { waitUntil: 'load' },
        );
        await page.waitForTimeout(150); // let the inline SVG (system-font glyph) settle
        renders.set(size, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
        await page.close();
    }
} finally {
    await browser.close();
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'yomu-gaming-512.png'), renders.get(512));
console.log('✓ yomu-gaming-512.png');

if (process.platform !== 'darwin') {
    console.warn('Skipping yomu-gaming.icns (iconutil requires macOS).');
    process.exit(0);
}

const iconsetDir = mkdtempSync(join(tmpdir(), 'yomu-gaming-'));
const iconset = join(iconsetDir, 'yomu-gaming.iconset');
mkdirSync(iconset);
try {
    for (const { size, name } of iconsetReps) writeFileSync(join(iconset, name), renders.get(size));
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(outDir, 'yomu-gaming.icns')]);
    console.log('✓ yomu-gaming.icns');
} finally {
    rmSync(iconsetDir, { recursive: true, force: true });
}
