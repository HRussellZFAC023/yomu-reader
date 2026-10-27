import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ensureManagedWebStorageEpochCurrent,
    managedLocalStorage,
    managedSessionStorage,
    resetManagedWebStorageForTests,
} from '../../src/reader/app/managed-web-storage';
import type { ManagedStateEpoch } from '../../src/reader/app/managed-state-epoch';
import { ensureManagedWebStorageEpochCurrentSync, type ManagedWebStorageOwner } from "../../src/reader/app/managed-web-storage";

const LOCAL_MARKER = 'yomu:web-storage-epoch:v1:local';
const SESSION_MARKER = 'yomu:web-storage-epoch:v1:session';
const SLOT_PREFIX = 'yomu:web-storage-slot:v1:';

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetManagedWebStorageForTests();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
});

describe('managed web-storage epoch barrier', () => {
    it('certifies generation zero without deleting legacy managed values', async () => {
        localStorage.setItem('yomu-ocr-cache-v2', '{"legacy":true}');
        sessionStorage.setItem('yomu:jps', '["from","to",1]');

        await ensureManagedWebStorageEpochCurrent(epoch(0, 'legacy'));

        expect(managedLocalStorage.getItem('yomu-ocr-cache-v2')).toBe('{"legacy":true}');
        expect(managedSessionStorage.getItem('yomu:jps')).toBe('["from","to",1]');
        expect(localStorage.getItem(LOCAL_MARKER)).toBe('0:legacy');
        expect(sessionStorage.getItem(SESSION_MARKER)).toBe('0:legacy');
    });

    it('purges each stale area, preserves host keys, and stores current values in epoch slots', async () => {
        localStorage.setItem('yomu-ocr-cache-v2', '{"stale":true}');
        sessionStorage.setItem('yomu:jps', '["stale"]');
        localStorage.setItem('foreign-token', 'keep-local');
        sessionStorage.setItem('foreign-tab-token', 'keep-session');

        await ensureManagedWebStorageEpochCurrent(epoch(1, 'reset-one'));
        managedLocalStorage.setItem('yomu-ocr-cache-v2', '{"fresh":true}');
        managedSessionStorage.setItem('yomu:jps', '["fresh"]');

        expect(localStorage.getItem('yomu-ocr-cache-v2')).toBeNull();
        expect(sessionStorage.getItem('yomu:jps')).toBeNull();
        expect(managedLocalStorage.getItem('yomu-ocr-cache-v2')).toBe('{"fresh":true}');
        expect(managedSessionStorage.getItem('yomu:jps')).toBe('["fresh"]');
        expect(storageKeys(localStorage).some(key => key.startsWith(SLOT_PREFIX))).toBe(true);
        expect(storageKeys(sessionStorage).some(key => key.startsWith(SLOT_PREFIX))).toBe(true);
        expect(localStorage.getItem('foreign-token')).toBe('keep-local');
        expect(sessionStorage.getItem('foreign-tab-token')).toBe('keep-session');
    });

    it('fails closed without stamping when enumeration is incomplete', async () => {
        const brokenLocal = memoryStorage({ 'yomu-ocr-cache-v2': 'stale', foreign: 'keep' }, { nullKeyAt: 0 });
        vi.stubGlobal('localStorage', brokenLocal);

        await expect(ensureManagedWebStorageEpochCurrent(epoch(1, 'reset-one')))
            .rejects.toThrow('enumeration was incomplete');

        expect(brokenLocal.getItem(LOCAL_MARKER)).toBeNull();
        expect(brokenLocal.getItem('yomu-ocr-cache-v2')).toBe('stale');
        expect(() => managedLocalStorage.getItem('yomu-ocr-cache-v2')).toThrow('has not passed');
    });

    it('fails closed without stamping when a managed removal is not retained', async () => {
        const brokenLocal = memoryStorage({ 'yomu-ocr-cache-v2': 'stale', foreign: 'keep' }, {
            retainedRemovalKey: 'yomu-ocr-cache-v2',
        });
        vi.stubGlobal('localStorage', brokenLocal);

        await expect(ensureManagedWebStorageEpochCurrent(epoch(1, 'reset-one')))
            .rejects.toThrow('retained managed key');

        expect(brokenLocal.getItem(LOCAL_MARKER)).toBeNull();
        expect(brokenLocal.getItem('foreign')).toBe('keep');
    });

    it('rejects a malformed area marker without purging or replacing it', async () => {
        localStorage.setItem(LOCAL_MARKER, 'not-an-epoch');
        localStorage.setItem('yomu-ocr-cache-v2', 'stale');

        await expect(ensureManagedWebStorageEpochCurrent(epoch(1, 'reset-one')))
            .rejects.toThrow('newer or conflicting');

        expect(localStorage.getItem(LOCAL_MARKER)).toBe('not-an-epoch');
        expect(localStorage.getItem('yomu-ocr-cache-v2')).toBe('stale');
        expect(sessionStorage.getItem(SESSION_MARKER)).toBeNull();
    });

    it('purges a stale per-tab session cache even when localStorage is already current', async () => {
        localStorage.setItem(LOCAL_MARKER, '1:reset-one');
        sessionStorage.setItem(SESSION_MARKER, '0:legacy');
        sessionStorage.setItem('yomu:jps', '["before-reset"]');
        sessionStorage.setItem('foreign-tab-token', 'keep');

        await ensureManagedWebStorageEpochCurrent(epoch(1, 'reset-one'));

        expect(managedSessionStorage.getItem('yomu:jps')).toBeNull();
        expect(sessionStorage.getItem(SESSION_MARKER)).toBe('1:reset-one');
        expect(sessionStorage.getItem('foreign-tab-token')).toBe('keep');
    });

    it('rejects a late generation-zero write after a newer realm certifies generation one', async () => {
        const oldRealm = await import('../../src/reader/app/managed-web-storage');
        oldRealm.resetManagedWebStorageForTests();
        await oldRealm.ensureManagedWebStorageEpochCurrent(epoch(0, 'legacy'));

        vi.resetModules();
        const freshRealm = await import('../../src/reader/app/managed-web-storage');
        await freshRealm.ensureManagedWebStorageEpochCurrent(epoch(1, 'reset-one'));
        freshRealm.managedLocalStorage.setItem('yomu-ocr-cache-v2', 'fresh');

        expect(() => oldRealm.managedLocalStorage.setItem('yomu-ocr-cache-v2', 'stale'))
            .toThrow('not certified');
        expect(freshRealm.managedLocalStorage.getItem('yomu-ocr-cache-v2')).toBe('fresh');
    });
});

function epoch(generation: number, resetId: string): ManagedStateEpoch {
    return generation === 0
        ? { version: 1, generation: 0, resetId: 'legacy', committedAt: 0 }
        : { version: 1, generation, resetId, committedAt: generation * 1_000 };
}

function storageKeys(storage: Storage): string[] {
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null);
}

function memoryStorage(
    initial: Record<string, string>,
    options: { nullKeyAt?: number; retainedRemovalKey?: string } = {},
): Storage {
    const values = new Map(Object.entries(initial));
    return {
        get length() { return values.size; },
        clear() { values.clear(); },
        getItem(key) { return values.get(key) ?? null; },
        key(index) {
            if (options.nullKeyAt === index) return null;
            return [...values.keys()][index] ?? null;
        },
        removeItem(key) {
            if (key !== options.retainedRemovalKey) values.delete(key);
        },
        setItem(key, value) { values.set(key, String(value)); },
    };
}

describe("managed web storage owner", () => {
    const initial: ManagedStateEpoch = { version: 1, generation: 0, resetId: 'legacy', committedAt: 0 };
    const owners: ManagedWebStorageOwner[] = ['standalone', 'userscript', 'extension'];
    const learnerKey = 'yomu:srs-local:v1';
    const uiKey = 'jpdb-reader-newtab-ui';
    const RAW_MARKER = 'yomu:web-storage-epoch:v1:local';
    const PAGE_RECORD = 'yomu:jpdb-review-examples-visible:v1';

    afterEach(() => { resetManagedWebStorageForTests(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

    function open(owner: ManagedWebStorageOwner, epoch = initial) {
        resetManagedWebStorageForTests();
        ensureManagedWebStorageEpochCurrentSync(epoch, owner);
    }

    // Standalone and installed owners share page storage only on a Yomu website.
    it.each(owners)('limits %s reset cleanup to that owner', resetting => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        localStorage.setItem('unrelated-host-data', 'keep');
        for (const owner of owners) {
            open(owner);
            managedLocalStorage.setItem(learnerKey, `${owner}-learner-record`);
            managedSessionStorage.setItem(uiKey, `${owner}-position`);
        }
        resetManagedWebStorageForTests();
        ensureManagedWebStorageEpochCurrentSync({ version: 1, generation: 1, resetId: 'reset', committedAt: 1 }, resetting);
        expect(managedLocalStorage.getItem(learnerKey)).toBeNull();
        expect(managedSessionStorage.getItem(uiKey)).toBeNull();
        for (const owner of owners.filter(owner => owner !== resetting)) {
            open(owner);
            expect(managedLocalStorage.getItem(learnerKey)).toBe(`${owner}-learner-record`);
            expect(managedSessionStorage.getItem(uiKey)).toBe(`${owner}-position`);
        }
        expect(localStorage.getItem('unrelated-host-data')).toBe('keep');
    });

    it('refuses to change owner within a certified session', () => {
        open('userscript');
        expect(() => ensureManagedWebStorageEpochCurrentSync(initial, 'extension')).toThrow('owner changed');
    });

    it('lets an upgraded Reader keep the page record v1.9.3 left on a site until it writes its own', () => {
        vi.stubGlobal('location', new URL('https://jpdb.io/review'));
        localStorage.setItem(RAW_MARKER, '0:legacy');
        localStorage.setItem(PAGE_RECORD, 'false');
        open('userscript');
        expect(managedLocalStorage.getItem(PAGE_RECORD)).toBe('false');
        managedLocalStorage.setItem(PAGE_RECORD, 'true');
        expect(managedLocalStorage.getItem(PAGE_RECORD)).toBe('true');
        expect(localStorage.getItem(PAGE_RECORD)).toBeNull();
    });

    it('reads a v1.9.3 record only while its raw area belongs to the current epoch', () => {
        vi.stubGlobal('location', new URL('https://jpdb.io/review'));
        localStorage.setItem(RAW_MARKER, '0:legacy');
        localStorage.setItem(PAGE_RECORD, 'false');
        open('extension', { version: 1, generation: 1, resetId: 'reset', committedAt: 1 });
        expect(managedLocalStorage.getItem(PAGE_RECORD)).toBeNull();
    });

    it('reads but never changes the website store from an installed owner on a Yomu website', () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        open('standalone');
        managedLocalStorage.setItem(PAGE_RECORD, 'false');
        open('extension');
        expect(managedLocalStorage.getItem(PAGE_RECORD)).toBe('false');
        managedLocalStorage.setItem(PAGE_RECORD, 'true');
        managedLocalStorage.removeItem(PAGE_RECORD);
        open('standalone');
        expect(managedLocalStorage.getItem(PAGE_RECORD)).toBe('false');
    });
});
