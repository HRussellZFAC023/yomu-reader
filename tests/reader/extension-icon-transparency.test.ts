import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, it } from 'vitest';

it.each([16, 32, 48, 128])('ships a transparent %s px extension icon without a white matte', async size => {
    const bytes = readFileSync(join(process.cwd(), 'public/extension-icons', `icon${size}.png`));
    const metadata = await sharp(bytes).metadata();
    expect(metadata.width).toBe(size);
    expect(metadata.height).toBe(size);
    expect(metadata.hasAlpha).toBe(true);
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const corners = [0, size - 1, size * (size - 1), size * size - 1];
    // The 16 px raster may retain a faint antialias fringe, never a matte.
    const alpha = corners.map(pixel => data[pixel * info.channels + 3]!);
    expect(alpha.every(value => value <= (size === 16 ? 16 : 0))).toBe(true);
});
