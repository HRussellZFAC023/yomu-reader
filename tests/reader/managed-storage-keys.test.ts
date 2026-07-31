import { describe, expect, it } from 'vitest';
import { isBridgeManagedStorageKey, logicalManagedStorageKey } from '../../src/reader/app/managed-storage-keys';

describe('managed storage slot keys', () => {
    it('keeps private logical keys private inside GM and web-storage slots', () => {
        const privateKey = encodeURIComponent('yomu:private:academy-device:v1');
        const gmSlot = `yomu:state-slot:v1:1%3Areset:${privateKey}`;
        const webSlot = `yomu:web-storage-slot:v1:1%3Areset:${privateKey}`;

        expect(logicalManagedStorageKey(gmSlot)).toBe('yomu:private:academy-device:v1');
        expect(logicalManagedStorageKey(webSlot)).toBe('yomu:private:academy-device:v1');
        expect(isBridgeManagedStorageKey(gmSlot)).toBe(false);
        expect(isBridgeManagedStorageKey(webSlot)).toBe(false);
    });

    it('rejects malformed slots at the page-world bridge boundary', () => {
        expect(logicalManagedStorageKey('yomu:state-slot:v1:broken')).toBeNull();
        expect(isBridgeManagedStorageKey('yomu:state-slot:v1:broken')).toBe(false);
        const nested = `yomu:state-slot:v1:1%3Areset:${encodeURIComponent(
            `yomu:state-slot:v1:1%3Areset:${encodeURIComponent('yomu:private:academy-device:v1')}`,
        )}`;
        expect(logicalManagedStorageKey(nested)).toBeNull();
        expect(isBridgeManagedStorageKey(nested)).toBe(false);
    });

    it('still permits public logical values and their physical slots', () => {
        const slot = `yomu:state-slot:v1:1%3Areset:${encodeURIComponent('jpdb-popup-reader-settings')}`;
        expect(isBridgeManagedStorageKey('jpdb-popup-reader-settings')).toBe(true);
        expect(isBridgeManagedStorageKey(slot)).toBe(true);
    });
});
