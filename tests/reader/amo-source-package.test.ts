import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    createDeterministicZip,
    validateReleaseVersionValues,
} from '../../scripts/build-amo-source-package.mjs';

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

    it('requires the tag, package, Chrome, and Firefox versions to agree', () => {
        expect(() => validateReleaseVersionValues({
            tag: '1.2.3',
            package: '1.2.3',
            chrome: '1.2.3',
            firefox: '1.2.4',
        })).toThrow(/firefox=1\.2\.4/);
    });
});
