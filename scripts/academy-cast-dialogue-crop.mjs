#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/academy-cast-dialogue-crop.mjs <fullbody.png> <halfbody.png>');
    process.exit(1);
}

const TARGET_WIDTH = 1536;
const TARGET_HEIGHT = 2048;
const SCALE = 1.6;
const TARGET_CONTENT_TOP = 90;

const source = sharp(inputPath).ensureAlpha();
const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });

let minX = info.width;
let minY = info.height;
let maxX = -1;
let maxY = -1;

for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
        if (data[(y * info.width + x) * 4 + 3] <= 8) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
}

if (maxX < minX || maxY < minY) {
    throw new Error(`No visible pixels found in ${inputPath}`);
}

const scaledWidth = Math.round(info.width * SCALE);
const scaledHeight = Math.round(info.height * SCALE);
const contentCenterX = ((minX + maxX) / 2) * SCALE;
const left = Math.max(
    0,
    Math.min(
        scaledWidth - TARGET_WIDTH,
        Math.round(contentCenterX - TARGET_WIDTH / 2),
    ),
);
const top = Math.max(
    0,
    Math.min(
        scaledHeight - TARGET_HEIGHT,
        Math.round(minY * SCALE - TARGET_CONTENT_TOP),
    ),
);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
await sharp(inputPath)
    .resize({
        width: scaledWidth,
        height: scaledHeight,
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
    })
    .extract({
        left,
        top,
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);

console.log(`${outputPath}: dialogue crop ${TARGET_WIDTH}x${TARGET_HEIGHT} from ${path.basename(inputPath)}`);
