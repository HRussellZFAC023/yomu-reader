import { afterEach, expect, it } from 'vitest';
import {
    ensureManagedWebStorageEpochCurrentSync,
    managedLocalStorage,
    managedSessionStorage,
    resetManagedWebStorageForTests,
    type ManagedWebStorageOwner,
} from '../../src/reader/app/managed-web-storage';

const initial = { version: 1, generation: 0, resetId: 'legacy', committedAt: 0 } as const;
const owners: ManagedWebStorageOwner[] = ['standalone', 'userscript', 'extension'];
const learnerKey = 'yomu:srs-local:v1';
const uiKey = 'jpdb-reader-newtab-ui';

afterEach(() => { resetManagedWebStorageForTests(); localStorage.clear(); sessionStorage.clear(); });

function open(owner: ManagedWebStorageOwner, epoch = initial) {
    resetManagedWebStorageForTests();
    ensureManagedWebStorageEpochCurrentSync(epoch, owner);
}

it.each(owners)('limits %s reset cleanup to that owner', resetting => {
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
