#!/usr/bin/env node
// Cast sprite repair: strip a transparency CHECKERBOARD that a generator baked into
// RGB, then resize to the canonical 1536x2048 master (docs/academy/art-review/
// HOUSE-STYLE.md). Reach for academy:cast:chroma instead when the background is a
// flat colour rather than a baked checker — that one keys off the corner mean, which
// a two-tone checker defeats.
//
//   npm run academy:cast:remove-baked-matte -- <input.png> <output.png>

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const [, , inputArg, outputArg] = process.argv;

if (!inputArg || !outputArg) {
    console.error('Usage: node scripts/academy-remove-baked-matte.mjs <input.png> <output.png>');
    process.exit(1);
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const image = sharp(inputPath).ensureAlpha();
const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const pixelCount = width * height;
const matte = new Uint8Array(pixelCount);
const queue = new Int32Array(pixelCount);
let queueHead = 0;
let queueTail = 0;

function isMatteCandidate(index, relaxed = false) {
    const offset = index * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const minimum = Math.min(red, green, blue);
    const maximum = Math.max(red, green, blue);
    const chroma = maximum - minimum;

    return relaxed
        ? minimum >= 172 && chroma <= 42
        : minimum >= 208 && chroma <= 24;
}

function isCertainCheckerPixel(index) {
    const offset = index * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const minimum = Math.min(red, green, blue);
    const maximum = Math.max(red, green, blue);

    return minimum >= 225 && maximum - minimum <= 14;
}

function enqueue(index) {
    if (matte[index] || !isMatteCandidate(index)) return;
    matte[index] = 1;
    queue[queueTail++] = index;
}

// Checker cells can be enclosed by loose hair or a bent arm, so the brightest
// neutral pixels are safe global seeds. The wider matte range still requires
// connection to one of these seeds or to the canvas edge.
for (let index = 0; index < pixelCount; index += 1) {
    if (!isCertainCheckerPixel(index)) continue;
    matte[index] = 1;
    queue[queueTail++] = index;
}

for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
}

for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
}

while (queueHead < queueTail) {
    const index = queue[queueHead++];
    const x = index % width;
    const y = Math.floor(index / width);

    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
}

// Pull in the pale antialias fringe without crossing the character's inked edge.
for (let pass = 0; pass < 3; pass += 1) {
    const additions = [];
    for (let index = 0; index < pixelCount; index += 1) {
        if (matte[index] || !isMatteCandidate(index, true)) continue;
        const x = index % width;
        const y = Math.floor(index / width);
        const touchesMatte =
            (x > 0 && matte[index - 1]) ||
            (x + 1 < width && matte[index + 1]) ||
            (y > 0 && matte[index - width]) ||
            (y + 1 < height && matte[index + width]);
        if (touchesMatte) additions.push(index);
    }
    for (const index of additions) matte[index] = 1;
}

let removedPixels = 0;
for (let index = 0; index < pixelCount; index += 1) {
    if (!matte[index]) continue;
    data[index * channels + 3] = 0;
    removedPixels += 1;
}

await mkdir(dirname(outputPath), { recursive: true });
await sharp(data, { raw: { width, height, channels } })
    .resize(1536, 2048, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);

console.log(
    JSON.stringify(
        {
            input: inputPath,
            output: outputPath,
            source: { width, height },
            target: { width: 1536, height: 2048 },
            removedPixels,
            removedRatio: Number((removedPixels / pixelCount).toFixed(4)),
        },
        null,
        2,
    ),
);
