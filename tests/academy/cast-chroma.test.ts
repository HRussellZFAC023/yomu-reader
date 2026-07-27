import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

describe('Academy cast background extraction', () => {
    it('removes a generated checker field while preserving the illustrated subject', async () => {
        const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-cast-chroma-'));
        const inputPath = path.join(temporaryDirectory, 'checker-source.png');
        const outputPath = path.join(temporaryDirectory, 'cutout.png');
        const width = 64;
        const height = 64;
        const pixels = Buffer.alloc(width * height * 4);

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const offset = (y * width + x) * 4;
                const checker = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 238 : 255;
                const subject = x >= 22 && x < 42 && y >= 10 && y < 58;
                pixels[offset] = subject ? 22 : checker;
                pixels[offset + 1] = subject ? 73 : checker;
                pixels[offset + 2] = subject ? 82 : checker;
                pixels[offset + 3] = 255;
            }
        }

        try {
            await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toFile(inputPath);
            execFileSync(
                process.execPath,
                ['scripts/academy-cast-chroma.mjs', inputPath, outputPath],
                { cwd: path.resolve('.'), stdio: 'pipe' },
            );

            const image = sharp(outputPath);
            const metadata = await image.metadata();
            const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            const pixel = (x: number, y: number) => {
                const offset = (y * info.width + x) * info.channels;
                return [...data.subarray(offset, offset + info.channels)];
            };

            expect(metadata).toMatchObject({
                width: 1536,
                height: 2048,
                hasAlpha: true,
            });
            expect(pixel(0, 0)[3]).toBe(0);
            expect(pixel(Math.floor(info.width / 2), Math.floor(info.height / 2))).toEqual([
                22,
                73,
                82,
                255,
            ]);
        } finally {
            fs.rmSync(temporaryDirectory, { recursive: true, force: true });
        }
    });
});
