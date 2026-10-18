import { afterEach, describe, expect, it } from 'vitest';
import { gmStorageSet, subscribeToStoredValueChanges } from '../../src/reader/app/storage';
import { LOCAL_MIRROR_PROVENANCE_KEY } from '../../src/reader/app/local-mirror-provenance';

const KEY = 'jpdb-popup-reader-settings';

function storageEvent(key: string): void {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) }));
}

afterEach(() => {
    localStorage.clear();
});

describe('a value another tab wrote to localStorage', () => {
    // The writer stores the value first and its provenance second, so this tab
    // can see the value's event while it still holds the old provenance.
    it('arrives once its provenance lands, and only once', async () => {
        await gmStorageSet(KEY, { popupMode: 'auto' });
        const oldProvenance = localStorage.getItem(LOCAL_MIRROR_PROVENANCE_KEY)!;
        await gmStorageSet(KEY, { popupMode: 'sheet' });
        const newProvenance = localStorage.getItem(LOCAL_MIRROR_PROVENANCE_KEY)!;
        expect(newProvenance).not.toBe(oldProvenance);
        const changes: unknown[] = [];
        const unsubscribe = subscribeToStoredValueChanges(KEY, value => { changes.push(value); });
        try {
            localStorage.setItem(LOCAL_MIRROR_PROVENANCE_KEY, oldProvenance);
            storageEvent(KEY);
            expect(changes).toEqual([]);

            localStorage.setItem(LOCAL_MIRROR_PROVENANCE_KEY, newProvenance);
            storageEvent(LOCAL_MIRROR_PROVENANCE_KEY);
            // A later provenance write for some other key repeats nothing.
            storageEvent(LOCAL_MIRROR_PROVENANCE_KEY);
            expect(changes).toEqual([{ popupMode: 'sheet' }]);
        } finally {
            unsubscribe();
        }
    });
});
