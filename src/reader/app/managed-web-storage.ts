import {
    MANAGED_WEB_STORAGE_SLOT_KEY_PREFIX,
    isManagedStorageKey,
    isManagedStorageSlotKey,
} from './managed-storage-keys';
import {
    MANAGED_STATE_EPOCH_KEY,
    managedStateEpochToken,
    managedStateEpochTokenRelation,
    managedStateLogicalValue,
    managedStateStoredValue,
    type ManagedStateEpoch,
} from './managed-state-epoch';

export type ManagedWebStorageArea = 'local' | 'session';

const AREA_MARKER_KEYS: Readonly<Record<ManagedWebStorageArea, string>> = {
    local: 'yomu:web-storage-epoch:v1:local',
    session: 'yomu:web-storage-epoch:v1:session',
};

const PRESERVED_LOCAL_CONTROL_KEYS = new Set([
    MANAGED_STATE_EPOCH_KEY,
    AREA_MARKER_KEYS.local,
]);

let certifiedEpoch: ManagedStateEpoch | undefined;
let reconciliation: Promise<ManagedStateEpoch> | undefined;
let reconciliationToken: string | undefined;

/**
 * Bring both page-owned storage areas into the realm's captured reset epoch.
 * Each area is independently verified and stamped only after its stale managed
 * keys have been completely removed. Calls coalesce because boot surfaces often
 * share this gate through settings, OCR, and new-tab startup.
 */
export function ensureManagedWebStorageEpochCurrent(epoch: ManagedStateEpoch): Promise<ManagedStateEpoch> {
    if (certifiedEpoch) {
        if (managedStateEpochToken(certifiedEpoch) !== managedStateEpochToken(epoch)) {
            return Promise.reject(new Error('Managed web storage is already certified for another epoch.'));
        }
        try {
            assertAreaCertificate('local', epoch);
            assertAreaCertificate('session', epoch);
            return Promise.resolve(epoch);
        } catch {
            certifiedEpoch = undefined;
        }
    }
    const expectedToken = managedStateEpochToken(epoch);
    if (reconciliation) {
        return reconciliationToken === expectedToken
            ? reconciliation
            : Promise.reject(new Error('Managed web storage is reconciling another epoch.'));
    }
    reconciliationToken = expectedToken;
    reconciliation = Promise.resolve().then(() => ensureManagedWebStorageEpochCurrentSync(epoch)).finally(() => {
        reconciliation = undefined;
        reconciliationToken = undefined;
    });
    return reconciliation;
}

export function ensureManagedWebStorageEpochCurrentSync(epoch: ManagedStateEpoch): ManagedStateEpoch {
    if (certifiedEpoch) {
        if (managedStateEpochToken(certifiedEpoch) !== managedStateEpochToken(epoch)) {
            throw new Error('Managed web storage is already certified for another epoch.');
        }
        try {
            assertAreaCertificate('local', epoch);
            assertAreaCertificate('session', epoch);
            return epoch;
        } catch {
            certifiedEpoch = undefined;
        }
    }
    reconcileArea('local', epoch);
    reconcileArea('session', epoch);
    certifiedEpoch = epoch;
    return epoch;
}

function reconcileArea(area: ManagedWebStorageArea, epoch: ManagedStateEpoch): void {
    const storage = storageArea(area);
    const markerKey = AREA_MARKER_KEYS[area];
    const expectedToken = managedStateEpochToken(epoch);
    const marker = readStorageValue(storage, markerKey, `${area}Storage epoch marker`);
    if (marker === expectedToken) return;

    if (marker !== null) {
        const relation = managedStateEpochTokenRelation(marker, epoch);
        if (relation === 'newer' || relation === 'conflict' || relation === 'malformed') {
            throw new Error(`${area}Storage belongs to a newer or conflicting managed-state epoch.`);
        }
    }

    // Generation zero contains every pre-epoch install's legacy values. Certify
    // it in place; only an actual reset (generation > 0) may purge those bytes.
    if (epoch.generation > 0) purgeManagedArea(storage, area);
    writeAndVerify(storage, markerKey, expectedToken, `${area}Storage epoch marker`);
}

function purgeManagedArea(storage: Storage, area: ManagedWebStorageArea): void {
    const preserved = area === 'local'
        ? PRESERVED_LOCAL_CONTROL_KEYS
        : new Set([AREA_MARKER_KEYS.session]);
    const keys = enumerateStorageKeys(storage, `${area}Storage`);
    const managedKeys = keys.filter(key => isManagedStorageKey(key) && !preserved.has(key));
    for (const key of managedKeys) {
        removeStorageValue(storage, key, `${area}Storage key "${key}"`);
        if (readStorageValue(storage, key, `${area}Storage key "${key}"`) !== null) {
            throw new Error(`${area}Storage retained managed key "${key}".`);
        }
    }
    const remaining = enumerateStorageKeys(storage, `${area}Storage`)
        .filter(key => isManagedStorageKey(key) && !preserved.has(key));
    if (remaining.length) throw new Error(`${area}Storage retained managed keys: ${remaining.join(', ')}.`);
}

function enumerateStorageKeys(storage: Storage, label: string): string[] {
    let length: number;
    try {
        length = storage.length;
    } catch (error) {
        throw new Error(`${label} could not be enumerated.`, { cause: error });
    }
    if (!Number.isSafeInteger(length) || length < 0) throw new Error(`${label} reported an invalid length.`);
    const keys: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < length; index++) {
        let key: string | null;
        try {
            key = storage.key(index);
        } catch (error) {
            throw new Error(`${label} could not enumerate key ${index}.`, { cause: error });
        }
        if (key === null || seen.has(key)) throw new Error(`${label} enumeration was incomplete.`);
        seen.add(key);
        keys.push(key);
    }
    try {
        if (storage.length !== length) throw new Error(`${label} changed during enumeration.`);
    } catch (error) {
        if (error instanceof Error && error.message.endsWith('changed during enumeration.')) throw error;
        throw new Error(`${label} could not verify enumeration.`, { cause: error });
    }
    return keys;
}

export const managedLocalStorage = managedStorageFacade('local');
export const managedSessionStorage = managedStorageFacade('session');

function managedStorageFacade(area: ManagedWebStorageArea): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
    return {
        getItem(key: string): string | null {
            const { storage, epoch } = certifiedArea(area);
            const raw = readStorageValue(storage, physicalStorageKey(key, epoch), `${area}Storage key "${key}"`);
            if (raw === null || epoch.generation === 0) return raw;
            try {
                const unreadable = Symbol('unreadable-managed-web-storage');
                const value = managedStateLogicalValue<unknown | typeof unreadable>(JSON.parse(raw), epoch, unreadable);
                return typeof value === 'string' ? value : null;
            } catch {
                return null;
            }
        },
        setItem(key: string, value: string): void {
            assertManagedLogicalKey(key);
            const { storage, epoch } = certifiedArea(area);
            const stored = epoch.generation === 0 ? value : JSON.stringify(managedStateStoredValue(value, epoch));
            writeAndVerify(storage, physicalStorageKey(key, epoch), stored, `${area}Storage key "${key}"`);
            assertAreaCertificate(area, epoch);
        },
        removeItem(key: string): void {
            assertManagedLogicalKey(key);
            const { storage, epoch } = certifiedArea(area);
            const physicalKey = physicalStorageKey(key, epoch);
            removeStorageValue(storage, physicalKey, `${area}Storage key "${key}"`);
            if (readStorageValue(storage, physicalKey, `${area}Storage key "${key}"`) !== null) {
                throw new Error(`${area}Storage retained managed key "${key}".`);
            }
            assertAreaCertificate(area, epoch);
        },
    };
}

function certifiedArea(area: ManagedWebStorageArea): { storage: Storage; epoch: ManagedStateEpoch } {
    const epoch = certifiedEpoch;
    if (!epoch) throw new Error('Managed web storage has not passed its epoch barrier.');
    assertAreaCertificate(area, epoch);
    return { storage: storageArea(area), epoch };
}

function assertAreaCertificate(area: ManagedWebStorageArea, epoch: ManagedStateEpoch): void {
    const marker = readStorageValue(storageArea(area), AREA_MARKER_KEYS[area], `${area}Storage epoch marker`);
    if (marker !== managedStateEpochToken(epoch)) {
        throw new Error(`${area}Storage is not certified for the captured managed-state epoch.`);
    }
}

function physicalStorageKey(key: string, epoch: ManagedStateEpoch): string {
    assertManagedLogicalKey(key);
    if (epoch.generation === 0) return key;
    return `${MANAGED_WEB_STORAGE_SLOT_KEY_PREFIX}${encodeURIComponent(managedStateEpochToken(epoch))}:${encodeURIComponent(key)}`;
}

function assertManagedLogicalKey(key: string): void {
    if (!isManagedStorageKey(key) || isManagedStorageSlotKey(key)) {
        throw new TypeError(`Managed web storage requires a logical Yomu key, received "${key}".`);
    }
}

function storageArea(area: ManagedWebStorageArea): Storage {
    try {
        const storage = area === 'local' ? localStorage : sessionStorage;
        if (!storage) throw new Error(`${area}Storage is unavailable.`);
        return storage;
    } catch (error) {
        throw new Error(`${area}Storage is unavailable.`, { cause: error });
    }
}

function readStorageValue(storage: Storage, key: string, label: string): string | null {
    try {
        return storage.getItem(key);
    } catch (error) {
        throw new Error(`${label} could not be read.`, { cause: error });
    }
}

function writeAndVerify(storage: Storage, key: string, value: string, label: string): void {
    try {
        storage.setItem(key, value);
    } catch (error) {
        throw new Error(`${label} could not be written.`, { cause: error });
    }
    if (readStorageValue(storage, key, label) !== value) throw new Error(`${label} failed read-back verification.`);
}

function removeStorageValue(storage: Storage, key: string, label: string): void {
    try {
        storage.removeItem(key);
    } catch (error) {
        throw new Error(`${label} could not be removed.`, { cause: error });
    }
}

/** Test-only: Vitest reuses workers across fresh JSDOM realms. */
export function resetManagedWebStorageForTests(): void {
    certifiedEpoch = undefined;
    reconciliation = undefined;
    reconciliationToken = undefined;
}
