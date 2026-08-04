import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    deleteDictionaryArchive,
    enumerateDictionaryArchiveStorageKeys,
    listDictionaryArchives,
    persistDictionaryArchive,
    readDictionaryArchiveFile,
} from '../../src/reader/dictionaries/archive-cache';

// GM storage shim: the archive cache must round-trip through the userscript
// manager's cross-origin values, not page storage.
const gmValues = new Map<string, unknown>();

function installGmShim(): void {
    (globalThis as Record<string, unknown>).GM_getValue = (key: string, fallback: unknown) => gmValues.has(key) ? gmValues.get(key) : fallback;
    (globalThis as Record<string, unknown>).GM_setValue = (key: string, value: unknown) => { gmValues.set(key, value); };
    (globalThis as Record<string, unknown>).GM_deleteValue = (key: string) => { gmValues.delete(key); };
}

function removeGmShim(): void {
    delete (globalThis as Record<string, unknown>).GM_getValue;
    delete (globalThis as Record<string, unknown>).GM_setValue;
    delete (globalThis as Record<string, unknown>).GM_deleteValue;
}

function fileBytes(file: File): Promise<Uint8Array> {
    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then(buffer => new Uint8Array(buffer));
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

beforeEach(() => {
    gmValues.clear();
    localStorage.clear();
    installGmShim();
});

afterEach(() => {
    removeGmShim();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('dictionary archive cache', () => {
    it('round-trips a file archive through chunked GM storage', async () => {
        const bytes = new Uint8Array(70_000).map((_, index) => index % 251);
        await persistDictionaryArchive({ title: 'Jitendex.org [2026-06-06]', filename: 'jitendex.zip', file: new Blob([bytes]) });

        const archives = await listDictionaryArchives();
        expect(archives['jitendex.org']).toMatchObject({ title: 'Jitendex.org [2026-06-06]', size: 70_000 });

        const file = await readDictionaryArchiveFile('jitendex.org');
        expect(file).not.toBeNull();
        expect(await fileBytes(file!)).toEqual(bytes);
        expect(await enumerateDictionaryArchiveStorageKeys()).toEqual([
            'yomu-dictionary-archive:jitendex.org:0',
        ]);
    });

    it('stores only the URL for downloadable dictionaries', async () => {
        await persistDictionaryArchive({ title: 'Kanjium Pitch', filename: 'kanjium.zip', downloadUrl: 'https://example.test/kanjium.zip' });
        const archives = await listDictionaryArchives();
        expect(archives['kanjium pitch']).toMatchObject({ downloadUrl: 'https://example.test/kanjium.zip', chunkCount: 0 });
        expect(await readDictionaryArchiveFile('kanjium pitch')).toBeNull();
    });

    it('keeps catalogue integrity metadata with a URL-only archive', async () => {
        const sha256 = 'a'.repeat(64);
        await persistDictionaryArchive({
            title: 'JMdict [2026-07-23]',
            filename: 'jmdict.zip',
            downloadUrl: 'https://dictionaries.yomureader.com/objects/jmdict.zip',
            integrity: { sha256, bytes: 123_456 },
        });

        expect((await listDictionaryArchives()).jmdict).toMatchObject({
            downloadUrl: 'https://dictionaries.yomureader.com/objects/jmdict.zip',
            sha256,
            size: 123_456,
            chunkCount: 0,
        });
    });

    it('deletes archives with their chunks', async () => {
        await persistDictionaryArchive({ title: 'Jitendex.org [2026-06-06]', filename: 'jitendex.zip', file: new Blob([new Uint8Array(1000)]) });
        await deleteDictionaryArchive('Jitendex.org [2026-06-06]');
        expect(await listDictionaryArchives()).toEqual({});
        expect([...gmValues.keys()].filter(key => key.startsWith('yomu-dictionary-archive:'))).toEqual([]);
    });
});
