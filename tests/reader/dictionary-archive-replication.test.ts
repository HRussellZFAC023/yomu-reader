import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDictionaryArchive, listDictionaryArchives, persistDictionaryArchive, readDictionaryArchiveFile } from '../../src/reader/dictionaries/archive-cache';
import { ensureLocalDictionariesReplicated, type DictionaryReplicationStore } from '../../src/reader/dictionaries/replication';
import type { ImportSummary } from '../../src/reader/dictionaries/yomitan';
import type { ReaderSettings } from '../../src/reader/app/types';

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

function settingsWith(preferences: { name: string; enabled: boolean }[]): ReaderSettings {
    return {
        localDictionariesEnabled: true,
        dictionaryPreferences: preferences.map((preference, index) => ({
            name: preference.name,
            alias: preference.name,
            enabled: preference.enabled,
            priority: index,
            type: 'terms' as const,
        })),
    } as unknown as ReaderSettings;
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

function importSummary(title: string): ImportSummary {
    return { dictionaries: [title], entries: 1, terms: 1, kanji: 0, termMeta: 0, kanjiMeta: 0 };
}

beforeEach(() => {
    gmValues.clear();
    localStorage.clear();
    installGmShim();
});

afterEach(() => {
    removeGmShim();
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
    });

    it('stores only the URL for downloadable dictionaries', async () => {
        await persistDictionaryArchive({ title: 'Kanjium Pitch', filename: 'kanjium.zip', downloadUrl: 'https://example.test/kanjium.zip' });
        const archives = await listDictionaryArchives();
        expect(archives['kanjium pitch']).toMatchObject({ downloadUrl: 'https://example.test/kanjium.zip', chunkCount: 0 });
        expect(await readDictionaryArchiveFile('kanjium pitch')).toBeNull();
    });

    it('deletes archives with their chunks', async () => {
        await persistDictionaryArchive({ title: 'Jitendex.org [2026-06-06]', filename: 'jitendex.zip', file: new Blob([new Uint8Array(1000)]) });
        await deleteDictionaryArchive('Jitendex.org [2026-06-06]');
        expect(await listDictionaryArchives()).toEqual({});
        expect([...gmValues.keys()].filter(key => key.startsWith('yomu-dictionary-archive:'))).toEqual([]);
    });
});

describe('ensureLocalDictionariesReplicated', () => {
    it('imports a settings-listed dictionary the local store lacks', async () => {
        await persistDictionaryArchive({ title: 'Jitendex.org [2026-06-06]', filename: 'jitendex.zip', file: new Blob([new Uint8Array(64)]) });
        const importFile = vi.fn(async () => importSummary('Jitendex.org [2026-06-06]'));
        const store: DictionaryReplicationStore = {
            summary: async () => ({ dictionaries: [] }),
            importFile,
            importFromUrl: vi.fn(async () => importSummary('unused')),
        };
        const onReplicated = vi.fn();
        const imported = await ensureLocalDictionariesReplicated({
            dictionaries: store,
            getSettings: () => settingsWith([{ name: 'Jitendex.org [2026-06-06]', enabled: true }]),
            onReplicated,
        });
        expect(imported).toEqual(['Jitendex.org [2026-06-06]']);
        expect(importFile).toHaveBeenCalledOnce();
        expect(importFile).toHaveBeenCalledWith(expect.any(File), undefined, '', { persistArchive: false });
        expect(onReplicated).toHaveBeenCalledWith(['Jitendex.org [2026-06-06]']);
    });

    it('skips dictionaries already installed on this origin', async () => {
        await persistDictionaryArchive({ title: 'Jitendex.org [2026-06-06]', filename: 'jitendex.zip', file: new Blob([new Uint8Array(64)]) });
        const importFile = vi.fn(async () => importSummary('Jitendex.org [2026-06-06]'));
        const imported = await ensureLocalDictionariesReplicated({
            dictionaries: {
                summary: async () => ({ dictionaries: [{ title: 'Jitendex.org [2026-06-06]' }] }),
                importFile,
                importFromUrl: vi.fn(async () => importSummary('unused')),
            },
            getSettings: () => settingsWith([{ name: 'Jitendex.org [2026-06-06]', enabled: true }]),
            onReplicated: vi.fn(),
        });
        expect(imported).toEqual([]);
        expect(importFile).not.toHaveBeenCalled();
    });

    it('treats an installed newer revision as covering the stale preference row', async () => {
        await persistDictionaryArchive({ title: 'Jitendex.org [2026-06-06]', filename: 'jitendex.zip', file: new Blob([new Uint8Array(64)]) });
        const importFile = vi.fn(async () => importSummary('Jitendex.org [2026-06-06]'));
        const imported = await ensureLocalDictionariesReplicated({
            dictionaries: {
                summary: async () => ({ dictionaries: [{ title: 'Jitendex.org [2026-07-07]' }] }),
                importFile,
                importFromUrl: vi.fn(async () => importSummary('unused')),
            },
            getSettings: () => settingsWith([{ name: 'Jitendex.org [2026-06-06]', enabled: true }]),
            onReplicated: vi.fn(),
        });
        expect(imported).toEqual([]);
        expect(importFile).not.toHaveBeenCalled();
    });

    it('ignores archives whose preference row is disabled and downloads URL-only archives', async () => {
        await persistDictionaryArchive({ title: 'Old Dict', filename: 'old.zip', file: new Blob([new Uint8Array(32)]) });
        await persistDictionaryArchive({ title: 'Kanjium Pitch', filename: 'kanjium.zip', downloadUrl: 'https://example.test/kanjium.zip' });
        const importFromUrl = vi.fn(async () => importSummary('Kanjium Pitch'));
        const imported = await ensureLocalDictionariesReplicated({
            dictionaries: {
                summary: async () => ({ dictionaries: [] }),
                importFile: vi.fn(async () => importSummary('Old Dict')),
                importFromUrl,
            },
            getSettings: () => settingsWith([{ name: 'Old Dict', enabled: false }, { name: 'Kanjium Pitch', enabled: true }]),
            onReplicated: vi.fn(),
        });
        expect(imported).toEqual(['Kanjium Pitch']);
        expect(importFromUrl).toHaveBeenCalledWith('https://example.test/kanjium.zip', 'kanjium.zip', undefined, { persistArchive: false });
    });

    it('backs off an archive that keeps failing on this origin', async () => {
        await persistDictionaryArchive({ title: 'Broken Dict', filename: 'broken.zip', file: new Blob([new Uint8Array(32)]) });
        const importFile = vi.fn(async () => { throw new Error('corrupt zip'); });
        const store: DictionaryReplicationStore = {
            summary: async () => ({ dictionaries: [] }),
            importFile,
            importFromUrl: vi.fn(async () => importSummary('unused')),
        };
        const options = {
            dictionaries: store,
            getSettings: () => settingsWith([{ name: 'Broken Dict', enabled: true }]),
            onReplicated: vi.fn(),
            now: () => 1_000_000,
        };
        expect(await ensureLocalDictionariesReplicated(options)).toEqual([]);
        expect(importFile).toHaveBeenCalledTimes(1);
        // Same origin, immediately again: inside the backoff window → skipped.
        expect(await ensureLocalDictionariesReplicated(options)).toEqual([]);
        expect(importFile).toHaveBeenCalledTimes(1);
    });
});
