import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    splitContextFile,
    splitUtf8Buffer,
} from '../../scripts/academy-honen/split-context.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

describe('Honen context splitter', () => {
    it('splits on line boundaries without losing source bytes', () => {
        const source = Buffer.from('first line\nsecond line\nthird line\n'.repeat(100));
        const parts = splitUtf8Buffer(source, 1024);

        expect(Buffer.concat(parts)).toEqual(source);
        expect(parts.length).toBeGreaterThan(1);
    });

    it('writes independently importable parts with source identity', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'honen-context-'));
        temporaryDirectories.push(directory);
        const inputPath = path.join(directory, 'context.md');
        const outputDir = path.join(directory, 'parts');
        fs.writeFileSync(inputPath, `${'source line\n'.repeat(300)}`);

        const result = splitContextFile({
            inputPath,
            outputDir,
            maxBytes: 1024,
        });

        expect(result.partCount).toBeGreaterThan(1);
        expect(result.parts.every(part => fs.existsSync(part.outputPath))).toBe(true);
        expect(fs.readFileSync(result.parts[0].outputPath, 'utf8')).toContain(
            `Source SHA-256: \`${result.sourceSha256}\``,
        );
    });
});
