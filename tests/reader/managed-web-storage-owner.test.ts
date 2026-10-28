import { afterEach, expect, it, vi } from 'vitest';
import type { ManagedStateEpoch } from '../../src/reader/app/managed-state-epoch';
import {
    ensureManagedWebStorageEpochCurrentSync,
    managedLocalStorage,
    managedSessionStorage,
    resetManagedWebStorageForTests,
    type ManagedWebStorageOwner,
} from '../../src/reader/app/managed-web-storage';

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
