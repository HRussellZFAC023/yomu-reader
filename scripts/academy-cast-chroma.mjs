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

const cornerPixels = [
    0,
    width - 1,
    (height - 1) * width,
    height * width - 1,
];
const cornerMean = cornerPixels.reduce(
    (mean, pixelIndex) => {
        const offset = pixelIndex * channels;
        mean.red += data[offset];
        mean.green += data[offset + 1];
        mean.blue += data[offset + 2];
        return mean;
    },
    { red: 0, green: 0, blue: 0 },
);
for (const channel of Object.keys(cornerMean)) cornerMean[channel] /= cornerPixels.length;

const chromaMode = cornerMean.green > Math.max(cornerMean.red, cornerMean.blue) * 1.08
    ? 'green'
    : Math.min(cornerMean.red, cornerMean.blue) - cornerMean.green >= 48
        ? 'magenta'
        : Math.min(cornerMean.red, cornerMean.green, cornerMean.blue) >= 210
            && Math.max(cornerMean.red, cornerMean.green, cornerMean.blue)
                - Math.min(cornerMean.red, cornerMean.green, cornerMean.blue) <= 16
            ? 'checker'
            : undefined;

if (!chromaMode) {
    throw new Error(
        `Could not infer a green, magenta, or light checker field from border colour `
        + `rgb(${Math.round(cornerMean.red)}, ${Math.round(cornerMean.green)}, ${Math.round(cornerMean.blue)}).`,
    );
}

function chromaDominance(red, green, blue) {
    if (chromaMode === 'green') return green - Math.max(red, blue);
    if (chromaMode === 'magenta') return Math.min(red, blue) - green;
    return Math.min(red, green, blue);
}

function isChromaCandidate(pixelIndex) {
    const offset = pixelIndex * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const dominance = chromaDominance(red, green, blue);
    if (chromaMode === 'checker') {
        return Math.min(red, green, blue) >= 208
            && Math.max(red, green, blue) - Math.min(red, green, blue) <= 18;
    }
    return chromaMode === 'green'
        ? green >= 72
            && dominance >= 12
            && green > red * 1.08
            && green > blue * 1.08
        : red >= 120
            && blue >= 120
            && dominance >= 40;
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
    const dominance = chromaDominance(red, green, blue);
    const strongChroma = chromaMode === 'green'
        ? green >= 100 && dominance >= 28
        : chromaMode === 'magenta'
            ? red >= 150 && blue >= 150 && dominance >= 70
            : Math.min(red, green, blue) >= 224
                && Math.max(red, green, blue) - Math.min(red, green, blue) <= 14;
    if (!visited[pixelIndex] && !strongChroma) continue;
    if (chromaMode === 'checker') {
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 0;
        continue;
    }
    const fullMatteDominance = chromaMode === 'green' ? 28 : 70;
    const featherDominance = chromaMode === 'green' ? 10 : 28;
    const matte = dominance >= fullMatteDominance
        ? 1
        : Math.min(
            1,
            Math.max(0, (dominance - featherDominance) / (fullMatteDominance - featherDominance)),
        );
    const coverage = 1 - matte;

    if (coverage <= 0.02) {
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 0;
        continue;
    }

    if (chromaMode === 'green') {
        data[offset] = Math.min(255, Math.round(red / coverage));
        data[offset + 1] = Math.min(
            255,
            Math.max(0, Math.round((green - matte * 255) / coverage)),
        );
        data[offset + 2] = Math.min(255, Math.round(blue / coverage));
    } else {
        data[offset] = Math.min(255, Math.max(0, Math.round((red - matte * 255) / coverage)));
        data[offset + 1] = Math.min(255, Math.round(green / coverage));
        data[offset + 2] = Math.min(255, Math.max(0, Math.round((blue - matte * 255) / coverage)));
    }
    data[offset + 3] = Math.round(alpha * coverage);
}

const keyedPixels = Buffer.from(data);

function residualChromaDominance(red, green, blue) {
    return chromaDominance(red, green, blue);
}

function hasStrongResidualChroma(red, green, blue) {
    const dominance = residualChromaDominance(red, green, blue);
    return chromaMode === 'green'
        ? green >= 72 && dominance >= 12
        : chromaMode === 'magenta'
            ? red >= 100 && blue >= 100 && dominance >= 24
            : Math.min(red, green, blue) >= 205
                && Math.max(red, green, blue) - Math.min(red, green, blue) <= 22;
}

function hasWeakResidualChroma(red, green, blue) {
    const dominance = chromaDominance(red, green, blue);
    return chromaMode === 'green'
        ? green >= 72 && dominance >= 12
        : chromaMode === 'magenta'
            ? red >= 100 && blue >= 90 && dominance >= 10
            : Math.min(red, green, blue) >= 165
                && Math.max(red, green, blue) - Math.min(red, green, blue) <= 38;
}

function hasTransparentNeighbour(pixelIndex, radius = 12) {
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
            const nextX = x + dx;
            const nextY = y + dy;
            if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
            const nextOffset = (nextY * width + nextX) * channels;
            if (keyedPixels[nextOffset + 3] === 0) return true;
        }
    }
    return false;
}

function findInteriorColour(pixelIndex, maxRadius = 12) {
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    for (let radius = 1; radius <= maxRadius; radius += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                const nextX = x + dx;
                const nextY = y + dy;
                if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
                const nextOffset = (nextY * width + nextX) * channels;
                if (keyedPixels[nextOffset + 3] < 245) continue;
                const red = keyedPixels[nextOffset];
                const green = keyedPixels[nextOffset + 1];
                const blue = keyedPixels[nextOffset + 2];
                if (hasWeakResidualChroma(red, green, blue)) continue;
                return [red, green, blue];
            }
        }
    }
    return undefined;
}

for (let pixelIndex = 0; pixelIndex < visited.length; pixelIndex += 1) {
    const offset = pixelIndex * channels;
    const alpha = keyedPixels[offset + 3];
    if (alpha === 0) continue;

    const red = keyedPixels[offset];
    const green = keyedPixels[offset + 1];
    const blue = keyedPixels[offset + 2];
    const nearTransparent = hasTransparentNeighbour(pixelIndex);
    const residualChroma = hasStrongResidualChroma(red, green, blue)
        || (nearTransparent && hasWeakResidualChroma(red, green, blue));
    if (!residualChroma && (alpha === 255 || !nearTransparent)) continue;

    const interior = findInteriorColour(pixelIndex);
    if (!interior) {
        if (residualChroma || alpha < 128) {
            data[offset] = 0;
            data[offset + 1] = 0;
            data[offset + 2] = 0;
            data[offset + 3] = 0;
        }
        continue;
    }
    data[offset] = interior[0];
    data[offset + 1] = interior[1];
    data[offset + 2] = interior[2];
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

console.log(`${outputPath}: ${chromaMode} ${width}x${height} -> 1536x2048`);
