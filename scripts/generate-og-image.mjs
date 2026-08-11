// Keep the raster social card byte-for-byte derived from its reviewable SVG.
// `docs:build` runs this before VitePress copies public assets, while --check
// gives tests and release gates a non-mutating stale-artifact assertion.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(root, 'docs', 'public', 'og-image.svg');
const outputPath = join(root, 'docs', 'public', 'og-image.png');
const checkOnly = process.argv.includes('--check');

const rendered = await sharp(readFileSync(sourcePath), { density: 96 })
    .resize(1200, 630, { fit: 'fill' })
    .png({
        adaptiveFiltering: false,
        compressionLevel: 9,
        force: true,
        palette: false,
    })
    .toBuffer();

const current = existsSync(outputPath) ? readFileSync(outputPath) : null;
if (current?.equals(rendered)) {
    console.log('✓ docs/public/og-image.png matches og-image.svg.');
    process.exit(0);
}

if (checkOnly) {
    console.error('docs/public/og-image.png is stale; run npm run docs:og-image.');
    process.exit(1);
}

writeFileSync(outputPath, rendered);
console.log('✓ Regenerated docs/public/og-image.png from og-image.svg.');
