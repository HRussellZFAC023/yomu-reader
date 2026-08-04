import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearManagedStoredValues,
    unregisteredManagedStorageKeys,
} from '../../src/reader/app/storage';
import {
    beginManagedStateReset,
    endManagedStateReset,
    managedStateEntries,
    managedStateWritesSuppressed,
    registeredManagedIndexedDbNames,
    registeredManagedStorageKeys,
    registeredManagedStoragePrefixes,
    type ManagedStateEntry,
} from '../../src/reader/app/managed-state-registry';
import { endSettingsResetGuard } from '../../src/reader/settings/index';
import { PitchSrsStore } from '../../src/reader/newtab/pitch-srs';
import { flushPersistedOcrCache, persistOcrCacheSoon } from '../../src/reader/ocr/ocr-cache-store';
import { enumerateLocalYomuSrsStorageKeys } from '../../src/reader/srs/local-yomu-store';

// The registry is the reset inventory. These tests seed every declared store,
// derive writer targets independently from reader source, and assert nothing
// managed survives. The independent source scan is what catches a future store
// whose owner forgets to register it.

function sampleKeyForPrefix(prefix: string): string {
    return `${prefix}sentinel`;
}

const FACTORY_RESET_CONTROL_KEYS = new Set([
    'yomu:factory-reset-signal',
    'yomu:state-epoch',
]);
const FACTORY_RESET_CONTROL_PREFIXES = ['yomu:state-epoch-lease:v1:'];

/** Concrete keys for every registered entry (exact keys + one sample per prefix). */
function seededKeysForKind(kinds: ManagedStateEntry['kind'][]): string[] {
    const keys = new Set<string>();
    for (const entry of managedStateEntries()) {
        if (entry.kind === 'idb') continue;
        if (!kinds.includes(entry.kind)) continue;
        if (entry.key && !FACTORY_RESET_CONTROL_KEYS.has(entry.key)) keys.add(entry.key);
        if (entry.prefix && !FACTORY_RESET_CONTROL_PREFIXES.includes(entry.prefix)) {
            keys.add(sampleKeyForPrefix(entry.prefix));
        }
    }
    return [...keys];
}

// Extra keys the reader writes that the registry MUST net, discovered dynamically
// so a new managed-prefix key is exercised even before it is added to the manifest.
const DYNAMIC_DISCOVERY_KEYS = [
    'yomu-some-future-store:v1',
    'jpdb-reader-some-future-panel',
    'yomu:some-future-cache:v1',
    'yomu.someFuturePreference.v1',
];

function readerTypeScriptFiles(directory = path.join(process.cwd(), 'src/reader')): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return readerTypeScriptFiles(target);
        return entry.isFile() && entry.name.endsWith('.ts') ? [target] : [];
    });
}

function sourceManagedStorageSamples(): string[] {
    const samples = new Set<string>();
    const declarationPattern = /(?:export\s+)?const\s+([A-Z0-9_]*(?:KEY|PREFIX)[A-Z0-9_]*)\s*=\s*(['"])(yomu[^'"\n]*|jpdb[^'"\n]*|__yomu[^'"\n]*)\2/gu;
    for (const file of readerTypeScriptFiles()) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(declarationPattern)) {
            const [, identifier, , value] = match;
            if (identifier.includes('PREFIX')) {
                samples.add(`${value}source-inventory-probe`);
                continue;
            }
            const escapedIdentifier = identifier.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
            const directWrite = new RegExp(
                `(?:gmStorageSet(?:Sync)?|(?:localStorage|sessionStorage|managedLocalStorage|managedSessionStorage)\\.setItem)\\(\\s*${escapedIdentifier}\\b`,
                'u',
            );
            if (directWrite.test(source)) samples.add(value);
        }
    }
    return [...samples].sort();
}

describe('factory reset invariant — nothing managed survives resetAllData', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        endSettingsResetGuard();
        endManagedStateReset();
        localStorage.clear();
        sessionStorage.clear();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('registers every managed store as an exact key, prefix, or IDB name', () => {
        // Sanity: the registry is populated (import side-effect ran) and self-consistent.
        expect(registeredManagedStorageKeys().length).toBeGreaterThan(20);
        expect(registeredManagedStoragePrefixes().length).toBeGreaterThan(0);
        expect(registeredManagedIndexedDbNames()).toContain('yomu-anki-status-index');
        expect(registeredManagedIndexedDbNames()).toContain('jpdb-popup-reader-yomitan');
    });

    it('clears every registered + dynamically-discovered key on the userscript GM path', async () => {
        // GM storage is Yomu-private (the userscript owns its whole GM store), so the
        // whole GM store is swept via GM_listValues; a foreign key lives in
        // localStorage where the managed-prefix filter must spare it.
        const store = new Map<string, unknown>();
        for (const key of [...seededKeysForKind(['gm', 'local', 'session']), ...DYNAMIC_DISCOVERY_KEYS]) {
            store.set(key, { sentinel: true });
        }
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => (store.has(key) ? store.get(key) : fallback)));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { store.set(key, value); }));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { store.delete(key); }));
        vi.stubGlobal('GM_listValues', vi.fn(() => [...store.keys()]));
        localStorage.setItem('foreign-site-token', 'keep-me');

        await clearManagedStoredValues();

        expect([...store.keys()]).toEqual([]);
        expect(localStorage.getItem('foreign-site-token')).toBe('keep-me');
    });

    it('clears hosted web storage when no shared GM backend exists', async () => {
        // A standalone hosted app has only per-origin web storage. This remains a
        // complete inventory because there is no hidden shared GM store.
        const localSeed = [
            ...seededKeysForKind(['gm']),
            ...seededKeysForKind(['local']),
            ...DYNAMIC_DISCOVERY_KEYS,
        ];
        for (const key of localSeed) localStorage.setItem(key, JSON.stringify({ sentinel: true }));
        for (const key of seededKeysForKind(['session'])) {
            sessionStorage.setItem(key, JSON.stringify({ sentinel: true }));
        }
        localStorage.setItem('foreign-site-token', 'keep-me');

        await clearManagedStoredValues();

        const remainingLocal: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) remainingLocal.push(key);
        }
        expect(remainingLocal).toEqual(['foreign-site-token']);
        expect(sessionStorage.length).toBe(0);
    });

    it('refuses a partial GM reset when listValues is unavailable', async () => {
        const store = new Map<string, unknown>([
            ['yomu:srs-local:v2:index', { version: 2, revision: 1, cardIds: ['sentinel'], tombstoneIds: [] }],
            ['yomu:srs-local:v2:card:sentinel', { spelling: '読む' }],
            ['yomu-dictionary-archives', {
                jitendex: { title: 'Jitendex', filename: 'jitendex.zip', size: 4, chunkCount: 1 },
            }],
            ['yomu-dictionary-archive:jitendex:0', 'bytes'],
        ]);
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=reset',
            hostname: 'www.youtube.com',
            pathname: '/watch',
            origin: 'https://www.youtube.com',
        });
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => store.has(key) ? store.get(key) : fallback));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { store.delete(key); }));
        vi.stubGlobal('GM_listValues', undefined);

        await expect(clearManagedStoredValues()).rejects.toMatchObject({
            name: 'ManagedStateResetError',
            yomuUiCopyKey: 'factoryResetStorageIncomplete',
        });

        expect([...store.keys()].sort()).toEqual([
            'yomu-dictionary-archive:jitendex:0',
            'yomu-dictionary-archives',
            'yomu:srs-local:v2:card:sentinel',
            'yomu:srs-local:v2:index',
        ]);
    });

    it('derives local SRS prefix keys from the owner index', async () => {
        const store = new Map<string, unknown>([
            ['yomu:srs-local:v2:index', {
                version: 2,
                revision: 1,
                cardIds: ['読む'],
                tombstoneIds: ['消す'],
            }],
        ]);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => store.has(key) ? store.get(key) : fallback));

        await expect(enumerateLocalYomuSrsStorageKeys()).resolves.toEqual([
            'yomu:srs-local:v2:index',
            `yomu:srs-local:v2:card:${encodeURIComponent('読む')}`,
            `yomu:srs-local:v2:tombstone:${encodeURIComponent('消す')}`,
        ]);
    });

    it('clears the managed IndexedDB databases', async () => {
        const deleted: string[] = [];
        vi.stubGlobal('indexedDB', {
            deleteDatabase: vi.fn((name: string) => {
                deleted.push(name);
                const request: Partial<IDBOpenDBRequest> = {};
                queueMicrotask(() => (request as { onsuccess?: () => void }).onsuccess?.());
                return request as IDBOpenDBRequest;
            }),
        });

        await clearManagedStoredValues();

        for (const name of registeredManagedIndexedDbNames()) {
            expect(deleted).toContain(name);
        }
    });

    it('registers managed storage targets discovered from writer source', () => {
        const sourceSamples = sourceManagedStorageSamples();
        expect(sourceSamples).toContain('yomu-dictionary-archives');
        expect(sourceSamples).toContain('yomu-dictionary-archive:source-inventory-probe');
        expect(sourceSamples).toContain('yomu:dictionary-replica-purge:v1');
        expect(sourceSamples).toContain('yomu:dictionary-replica-purged:v1');
        expect(unregisteredManagedStorageKeys(sourceSamples)).toEqual([]);
    });
});

describe('factory reset write-suppression — debounced writers cannot re-create keys mid-reset', () => {
    afterEach(() => {
        endSettingsResetGuard();
        endManagedStateReset();
        localStorage.clear();
        sessionStorage.clear();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('the suppression flag begins/ends cleanly', () => {
        expect(managedStateWritesSuppressed()).toBe(false);
        beginManagedStateReset();
        expect(managedStateWritesSuppressed()).toBe(true);
        endManagedStateReset();
        expect(managedStateWritesSuppressed()).toBe(false);
    });

    it('pitch-srs flushSync does not re-write cleared keys while suppressed', async () => {
        // Pre-seed GM storage with a pitch item so the store loads a non-empty set;
        // then simulate the post-clear state (empty store) and assert a suppressed
        // teardown flush does NOT re-create the cleared keys.
        const store = new Map<string, unknown>([
            ['yomu-pitch-items:v1', { 'たべもの#0': { key: 'たべもの#0', reading: 'たべもの', pitchNumber: 0, pattern: 'LHHH', pitchClass: '', displaySpelling: '食べ物', due: Date.now(), intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, introducedAt: Date.now() } }],
        ]);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => (store.has(key) ? store.get(key) : fallback)));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { store.set(key, value); }));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { store.delete(key); }));
        vi.stubGlobal('GM_listValues', vi.fn(() => [...store.keys()]));

        const pitch = new PitchSrsStore();
        await pitch.load();
        // Reset has now cleared storage.
        store.clear();

        beginManagedStateReset();
        pitch.flushSync();
        await pitch.flushItems();
        await pitch.flushHistory();

        expect(store.has('yomu-pitch-items:v1')).toBe(false);
        expect(store.has('yomu-pitch-history:v1')).toBe(false);
    });

    it('OCR cache flush does not re-write the cleared key while suppressed', () => {
        vi.useFakeTimers();
        localStorage.clear();
        const cache = new Map<string, unknown>([['src:https://example.com/p1.png', { lines: [] }]]);

        beginManagedStateReset();
        persistOcrCacheSoon(cache as Map<string, never>, Date.now());
        vi.runAllTimers();
        flushPersistedOcrCache();

        expect(localStorage.getItem('yomu-ocr-cache-v1')).toBeNull();
        expect(localStorage.getItem('yomu-ocr-cache-v2')).toBeNull();
    });
});
