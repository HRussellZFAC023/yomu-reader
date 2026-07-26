// Render the canonical app icon (public/yomu-icon.svg) into the Yomu Gaming
// desktop icon assets: yomu-gaming-512.png plus a prebuilt yomu-gaming.icns
// with every macOS representation rendered from the vector at its exact size.
// electron-builder's app-builder downscaler corrupts the small (16/32px) icns
// reps when it derives them from a single 512 PNG, so we never let it — the
// committed .icns is handed to it verbatim.
//
// This runs as part of `npm run build:gaming`. The outputs stay committed (Linux
// and Windows cannot produce an .icns at all), so the work here is incremental:
// generated-from.json records which revision of the SVG each output was rendered
// from, and a build whose outputs already match costs one hash and never starts a
// browser. Anything stale is re-rendered; anything this platform cannot re-render
// is named in the log instead of shipping quietly out of date.
// Run directly with: node scripts/generate-gaming-icon.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'app-icons');
const stampPath = join(outDir, 'generated-from.json');
const svg = readFileSync(join(root, 'public/yomu-icon.svg'), 'utf8');
const sourceRevision = createHash('sha256').update(svg).digest('hex');

const PNG_NAME = 'yomu-gaming-512.png';
const ICNS_NAME = 'yomu-gaming.icns';

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

const renderedFrom = readRenderedFrom(stampPath);
const stale = [PNG_NAME, ICNS_NAME]
    .filter(name => !existsSync(join(outDir, name)) || renderedFrom[name] !== sourceRevision);

if (stale.length === 0) {
    console.log('✓ Yomu Gaming icons match public/yomu-icon.svg.');
    process.exit(0);
}

// iconutil is macOS-only, and an .icns only reaches a macOS package, which is
// built on a macOS runner. Elsewhere keep the committed file and say so.
const buildable = process.platform === 'darwin' ? stale : stale.filter(name => name !== ICNS_NAME);
for (const name of stale.filter(entry => !buildable.includes(entry))) {
    console.warn(`Keeping the committed ${name}: rebuilding it needs macOS (iconutil). Regenerate it there before a macOS release.`);
}
if (buildable.length === 0) process.exit(0);

const renders = await renderIcon(buildable.includes(ICNS_NAME) ? iconsetReps.map(rep => rep.size) : [512]);

mkdirSync(outDir, { recursive: true });
if (buildable.includes(PNG_NAME)) {
    writeFileSync(join(outDir, PNG_NAME), renders.get(512));
    renderedFrom[PNG_NAME] = sourceRevision;
    console.log(`✓ ${PNG_NAME}`);
}
if (buildable.includes(ICNS_NAME)) {
    writeIcns(renders);
    renderedFrom[ICNS_NAME] = sourceRevision;
    console.log(`✓ ${ICNS_NAME}`);
}
writeFileSync(stampPath, `${JSON.stringify({ source: 'public/yomu-icon.svg', renderedFrom }, null, 4)}\n`);

function readRenderedFrom(file) {
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, 'utf8')).renderedFrom ?? {};
}

async function renderIcon(sizes) {
    // Imported on demand so an up-to-date build never pays for Playwright, and so
    // a missing browser download only ever surfaces when a render is actually due.
    const { chromium } = await import('playwright');
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    const browser = await chromium.launch();
    const rendered = new Map();
    try {
        for (const size of new Set(sizes)) {
            const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
            await page.setContent(
                `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}` +
                `img{display:block;width:${size}px;height:${size}px}</style>` +
                `<img src="${dataUri}">`,
                { waitUntil: 'load' },
            );
            await page.waitForTimeout(150); // let the inline SVG (system-font glyph) settle
            rendered.set(size, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
            await page.close();
        }
    } finally {
        await browser.close();
    }
    return rendered;
}

function writeIcns(rendered) {
    const iconsetDir = mkdtempSync(join(tmpdir(), 'yomu-gaming-'));
    const iconset = join(iconsetDir, 'yomu-gaming.iconset');
    mkdirSync(iconset);
    try {
        for (const { size, name } of iconsetReps) writeFileSync(join(iconset, name), rendered.get(size));
        execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(outDir, ICNS_NAME)]);
    } finally {
        rmSync(iconsetDir, { recursive: true, force: true });
    }
}
