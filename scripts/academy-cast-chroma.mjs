import process from 'node:process';
import sharp from 'sharp';

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/academy-cast-chroma.mjs <input.png> <output.png>');
    process.exit(1);
}

const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const visited = new Uint8Array(width * height);
const queue = new Int32Array(width * height);
let queueHead = 0;
let queueTail = 0;

function isChromaCandidate(pixelIndex) {
    const offset = pixelIndex * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const strongestOther = Math.max(red, blue);
    return green >= 72
        && green - strongestOther >= 12
        && green > red * 1.08
        && green > blue * 1.08;
}

function enqueue(pixelIndex) {
    if (visited[pixelIndex] || !isChromaCandidate(pixelIndex)) return;
    visited[pixelIndex] = 1;
    queue[queueTail++] = pixelIndex;
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
    const pixelIndex = queue[queueHead++];
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (x > 0) enqueue(pixelIndex - 1);
    if (x + 1 < width) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - width);
    if (y + 1 < height) enqueue(pixelIndex + width);
}

for (let pixelIndex = 0; pixelIndex < visited.length; pixelIndex += 1) {
    const offset = pixelIndex * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const alpha = data[offset + 3];
    const strongestOther = Math.max(red, blue);
    const dominance = green - strongestOther;
    const strongChroma = green >= 100 && dominance >= 28;
    if (!visited[pixelIndex] && !strongChroma) continue;
    const matte = dominance >= 28
        ? 1
        : Math.min(1, Math.max(0, (dominance - 10) / 18));
    const coverage = 1 - matte;

    if (coverage <= 0.02) {
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 0;
        continue;
    }

    data[offset] = Math.min(255, Math.round(red / coverage));
    data[offset + 1] = Math.min(
        255,
        Math.max(0, Math.round((green - matte * 255) / coverage)),
    );
    data[offset + 2] = Math.min(255, Math.round(blue / coverage));
    data[offset + 3] = Math.round(alpha * coverage);
}

for (let pixelIndex = 0; pixelIndex < visited.length; pixelIndex += 1) {
    const offset = pixelIndex * channels;
    const alpha = data[offset + 3];
    if (alpha === 0) continue;

    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const strongestOther = Math.max(red, blue);
    const spill = green - strongestOther;

    if (spill <= 5) continue;

    const edgeWeight = 1 - alpha / 255;
    const correction = Math.max(
        0,
        Math.min(spill, spill * (0.72 + edgeWeight * 0.28)),
    );
    data[offset + 1] = Math.max(
        Math.round((red + blue) / 2),
        Math.round(green - correction),
    );
}

const keyed = await sharp(data, { raw: { width, height, channels } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({
        width: 1430,
        height: 1940,
        fit: 'inside',
        withoutEnlargement: false,
    })
    .png()
    .toBuffer();

const metadata = await sharp(keyed).metadata();
const left = Math.floor((1536 - metadata.width) / 2);
const right = 1536 - metadata.width - left;
const top = Math.max(40, 2048 - metadata.height);
const bottom = 2048 - metadata.height - top;

await sharp(keyed)
    .extend({
        top,
        bottom,
        left,
        right,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath);

console.log(`${outputPath}: ${width}x${height} -> 1536x2048`);
