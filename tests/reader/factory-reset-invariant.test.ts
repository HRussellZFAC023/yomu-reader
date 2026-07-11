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

// The registry is the single source of truth for managed state; this test is the
// enforcement. It seeds EVERY registered store (plus dynamically discovered
// yomu-* / jpdb-reader-* keys) and asserts nothing survives resetAllData, and
// that debounced writers cannot re-create a key mid-reset. A future store that
// forgets to register will leave a key behind here → this test fails.

function sampleKeyForPrefix(prefix: string): string {
    return `${prefix}sentinel`;
}

/** Concrete keys for every registered entry (exact keys + one sample per prefix). */
function seededKeysForKind(kinds: ManagedStateEntry['kind'][]): string[] {
    const keys = new Set<string>();
    for (const entry of managedStateEntries()) {
        if (entry.kind === 'idb') continue;
        if (!kinds.includes(entry.kind)) continue;
        if (entry.key) keys.add(entry.key);
        if (entry.prefix) keys.add(sampleKeyForPrefix(entry.prefix));
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

    it('clears every registered + discovered key on the hosted web-storage path (no GM_listValues)', async () => {
        // Hosted origin (no usable GM_listValues): exact GM keys must still be reached
        // via the registry's exact-key net; prefix-family keys land in localStorage
        // (the storage layer mirrors GM writes to localStorage on the hosted origin)
        // where the managed-prefix sweep nets them.
        const store = new Map<string, unknown>();
        for (const entry of managedStateEntries()) {
            if (entry.kind === 'gm' && entry.key) store.set(entry.key, { sentinel: true });
        }
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => (store.has(key) ? store.get(key) : fallback)));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { store.delete(key); }));
        vi.stubGlobal('GM_listValues', undefined);

        // localStorage-resident keys, mirrored prefix-family keys, and discovery keys.
        const localSeed = [
            ...seededKeysForKind(['local']),
            ...managedStateEntries().filter(e => e.kind === 'gm' && e.prefix).map(e => sampleKeyForPrefix(e.prefix as string)),
            ...DYNAMIC_DISCOVERY_KEYS,
        ];
        for (const key of localSeed) localStorage.setItem(key, JSON.stringify({ sentinel: true }));
        for (const key of seededKeysForKind(['session'])) {
            sessionStorage.setItem(key, JSON.stringify({ sentinel: true }));
        }
        localStorage.setItem('foreign-site-token', 'keep-me');

        await clearManagedStoredValues();

        // Every exact registered GM key must be gone even without listValues.
        expect([...store.keys()]).toEqual([]);

        const remainingLocal: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) remainingLocal.push(key);
        }
        expect(remainingLocal).toEqual(['foreign-site-token']);
        expect(sessionStorage.length).toBe(0);
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

    it('reports no unregistered managed keys for the reader-owned prefixes', () => {
        // The safety-net invariant: keys the prefix/GM sweep catches must all be
        // registered. Any reader-owned key that is NOT in the registry is a store
        // that escaped registration. (This mirrors the runtime warning path.)
        const swept = new Set<string>([
            ...seededKeysForKind(['gm', 'local', 'session']),
        ]);
        expect(unregisteredManagedStorageKeys(swept)).toEqual([]);
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
