import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import 'fake-indexeddb/auto';
import { userFacingCopyKeyOf } from '../../src/reader/app/user-facing-errors';
import { sha256Hex } from '../../src/reader/dictionaries/catalog';
import { requestBlob as requestDictionaryBlob } from '../../src/reader/dictionaries/yomitan/file-utils';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import { localBytesFromBufferSource } from '../../src/reader/platform/binary-realm';
import { yomitanZipBytes } from './zip-fixture';

const FIREFOX_153_XRAY_ERROR =
    'Accessing TypedArray data over Xrays is slow, and forbidden in order to encourage performant code. ' +
    'To copy TypedArrays across origin boundaries, consider using Components.utils.cloneInto().';

describe('Firefox 153 dictionary binary compatibility (GitHub #39)', () => {
    const stores: YomitanDictionaryStore[] = [];

    afterEach(async () => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;
        for (const store of stores.splice(0).reverse()) {
            await store.deleteDatabase({ timeoutMs: 2_000 }).catch(() => undefined);
        }
    });

    it('copies the manager-world Blob and its ArrayBuffer before integrity hashing', async () => {
        const bytes = new TextEncoder().encode('dictionary archive');
        const expected = await sha256Hex(bytes);
        const responseBlob = xrayBlob(new Blob([arrayBufferSlice(bytes)], { type: 'application/zip' }), bytes);
        const manager: UserscriptHttpRequest = details => {
            details.onload?.({ status: 200, response: responseBlob });
            return { abort: vi.fn() };
        };
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn(manager));

        const downloaded = await requestDictionaryBlob(
            'https://dictionaries.yomureader.com/objects/sha256/fixture.zip',
            '',
        );

        await expect(sha256Hex(downloaded)).resolves.toBe(expected);
    });

    it('copies Xray-wrapped ArrayBuffer and Uint8Array values before reading indexed data', async () => {
        const bytes = new TextEncoder().encode('verified dictionary fixture');
        const expected = await sha256Hex(bytes);

        await expect(sha256Hex(xrayArrayBuffer(bytes))).resolves.toBe(expected);
        await expect(sha256Hex(xrayBytes(bytes))).resolves.toBe(expected);
    });

    it('localizes genuine foreign views and a local view with a foreign backing buffer', () => {
        const foreignView = runInNewContext('new Uint8Array([11, 22, 33])') as Uint8Array;
        const foreignBuffer = runInNewContext('new Uint8Array([44, 55, 66]).buffer') as ArrayBuffer;
        const localViewWithForeignBacking = new Uint8Array(foreignBuffer);

        expect(foreignView).not.toBeInstanceOf(Uint8Array);
        expect(foreignBuffer).not.toBeInstanceOf(ArrayBuffer);
        expect(localViewWithForeignBacking).toBeInstanceOf(Uint8Array);
        expect(localViewWithForeignBacking.buffer).not.toBeInstanceOf(ArrayBuffer);

        const localizedValues = [
            [localBytesFromBufferSource(foreignView), [11, 22, 33]],
            [localBytesFromBufferSource(foreignBuffer), [44, 55, 66]],
            [localBytesFromBufferSource(localViewWithForeignBacking), [44, 55, 66]],
        ] as const;
        for (const [localized, expected] of localizedValues) {
            expect(localized).toBeInstanceOf(Uint8Array);
            expect(localized.buffer).toBeInstanceOf(ArrayBuffer);
            expect([...localized]).toEqual(expected);
        }
    });

    it('copies Xray-wrapped ZIP stream chunks before parsing and importing them', async () => {
        const bytes = yomitanZipBytes({
            'index.json': { title: 'Firefox Xray Fixture', format: 3 },
            'term_bank_1.json': [['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, '']],
        });
        const file = new File([arrayBufferSlice(bytes)], 'firefox-xray.zip', { type: 'application/zip' });
        const sha256 = await sha256Hex(bytes);
        let readCount = 0;
        const arrayBuffer = vi.fn(() => Promise.reject(new Error('ZIP bytes were read twice.')));
        Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: arrayBuffer });
        Object.defineProperty(file, 'stream', {
            configurable: true,
            value: () => ({
                getReader: () => ({
                    read: async () => readCount++ === 0
                        ? { done: false as const, value: xrayBytes(bytes) }
                        : { done: true as const, value: undefined },
                }),
            }),
        });
        const store = new YomitanDictionaryStore();
        stores.push(store);
        await store.clear();
        const progress = vi.fn();

        await expect(store.importFile(file, progress, '', {
            integrity: { sha256, bytes: bytes.byteLength },
            persistArchive: false,
        })).resolves.toMatchObject({
            dictionaries: ['Firefox Xray Fixture'],
            terms: 1,
        });
        expect(readCount).toBe(2);
        expect(arrayBuffer).not.toHaveBeenCalled();
        expect(progress).toHaveBeenCalled();
        await expect(store.lookup('読む', 'よむ', 5)).resolves.toMatchObject([
            { dictionary: 'Firefox Xray Fixture', glossary: ['to read'] },
        ]);
    });

    it('keeps the missing-bridge failure machine-readable for the manual ZIP recovery', async () => {
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', undefined);
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;

        const error = await requestDictionaryBlob('ftp://example.test/dictionary.zip', '')
            .then(() => undefined, reason => reason);

        expect(userFacingCopyKeyOf(error)).toBe('dictionaryDownloadNeedsBridge');
    });
});

function xrayValue<T extends object>(raw: T, forbidden: ReadonlySet<PropertyKey> = new Set()): T {
    return new Proxy(raw, {
        get(target, key) {
            if (key === 'wrappedJSObject') return target;
            if (forbidden.has(key)) throw new Error(FIREFOX_153_XRAY_ERROR);
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

function xrayArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return xrayValue(arrayBufferSlice(bytes), new Set(['byteLength', Symbol.iterator]));
}

function xrayBytes(bytes: Uint8Array): Uint8Array {
    return xrayValue(bytes, new Set(['byteLength', 'byteOffset', 'buffer', 'length', Symbol.iterator]));
}

function xrayBlob(raw: Blob, bytes: Uint8Array): Blob {
    return new Proxy(raw, {
        get(target, key) {
            if (key === 'wrappedJSObject') return target;
            if (key === 'arrayBuffer') return async () => xrayArrayBuffer(bytes);
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

function arrayBufferSlice(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
