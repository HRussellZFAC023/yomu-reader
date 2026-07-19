import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    createDeterministicZip,
    validateReleaseVersions,
} from '../../scripts/build-amo-source-package.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('Firefox reviewer source packaging', () => {
    it('creates byte-identical ZIPs regardless of input insertion order', () => {
        const first = createDeterministicZip(new Map([
            ['Yomu/src/b.ts', new Uint8Array(Buffer.from('second\n'))],
            ['Yomu/src/a.ts', new Uint8Array(Buffer.from('first\n'))],
        ]));
        const second = createDeterministicZip(new Map([
            ['Yomu/src/a.ts', new Uint8Array(Buffer.from('first\n'))],
            ['Yomu/src/b.ts', new Uint8Array(Buffer.from('second\n'))],
        ]));

        expect(createHash('sha256').update(first).digest('hex'))
            .toBe(createHash('sha256').update(second).digest('hex'));
    });

    it('rejects generated dependency trees from source ZIP entries', () => {
        expect(() => createDeterministicZip(new Map([
            ['Yomu/node_modules/unsafe.js', new Uint8Array()],
        ]))).toThrow(/Unsafe or generated path/);
    });

    it('requires the tag, package, Chrome, and Firefox versions to agree', async () => {
        const directory = await mkdtemp(path.join(tmpdir(), 'yomu-amo-source-test-'));
        temporaryDirectories.push(directory);
        const packageJson = path.join(directory, 'package.json');
        const chromePackage = path.join(directory, 'chrome.zip');
        const firefoxPackage = path.join(directory, 'firefox.xpi');
        await writeFile(packageJson, JSON.stringify({ version: '1.2.3' }));
        await writeFile(chromePackage, createDeterministicZip(new Map([
            ['manifest.json', new Uint8Array(Buffer.from(JSON.stringify({ version: '1.2.3' })))],
        ])));
        await writeFile(firefoxPackage, createDeterministicZip(new Map([
            ['manifest.json', new Uint8Array(Buffer.from(JSON.stringify({ version: '1.2.4' })))],
        ])));

        await expect(validateReleaseVersions({
            releaseTag: 'v1.2.3',
            packageJson,
            chromePackage,
            firefoxPackage,
        })).rejects.toThrow(/firefox=1\.2\.4/);
    });
});
