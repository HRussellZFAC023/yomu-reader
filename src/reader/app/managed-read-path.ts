import { MANAGED_STATE_SLOT_KEY_PREFIX } from './managed-storage-keys';
import {
    MANAGED_STATE_EPOCH_KEY,
    managedStateEpochToken,
    managedStateLogicalValue,
    parseManagedStateEpoch,
    type ManagedStateEpoch,
} from './managed-state-epoch';

/**
 * The managed-state READ path: resolve one logical key against one epoch.
 *
 * Value resolution here is a pure function of the epoch it is handed — nothing
 * in this module takes the realm fence, which is what lets it sit below
 * storage.ts (where the fence lives) instead of importing back into it. See
 * `readManagedGmValue` for why a read needs no fence of its own; its callers
 * take one before calling in. The two `*AuthoritativeManagedStateEpoch` helpers
 * are the raw epoch READERS that storage.ts builds its fence out of, not fences.
 */

export type GmGetValue = <T>(key: string, defaultValue: T) => T | Promise<T>;

export type ManagedGmRead<T> = { kind: 'found'; value: T } | { kind: 'deleted' } | { kind: 'missing' };

// Missing-value sentinel. Message-based GM implementations (Safari
// Userscripts, FireMonkey, world bridges) structured-clone the default they
// hand back, so identity alone cannot detect "key not stored" — compare
// structurally as well or every read of an absent key returns the sentinel
// clone as if it were stored data (defaults + onboarding on every site).
export const MISSING = { __yomuStorageValueMissing: true };

export function isMissingSentinel(value: unknown): boolean {
    if (value === MISSING) return true;
    return Boolean(value
        && typeof value === 'object'
        && !Array.isArray(value)
        && (value as Record<string, unknown>).__yomuStorageValueMissing === true);
}

export async function rawAuthoritativeManagedStateEpoch(getValue: GmGetValue): Promise<unknown> {
    const stored = await getValue<unknown | typeof MISSING>(MANAGED_STATE_EPOCH_KEY, MISSING);
    return isMissingSentinel(stored) ? undefined : stored;
}

export async function authoritativeManagedStateEpoch(getValue: GmGetValue): Promise<ManagedStateEpoch> {
    // Page-local storage is only a cache. Whenever a userscript/extension
    // backend exists, its epoch is the sole authority; a host page must never
    // be able to advance global managed state by planting a larger local value.
    return parseManagedStateEpoch(await rawAuthoritativeManagedStateEpoch(getValue));
}

/** The physical key one logical key occupies in a given epoch. */
export function managedStateStorageKey(key: string, epoch: ManagedStateEpoch): string {
    if (epoch.generation === 0) return key;
    return `${MANAGED_STATE_SLOT_KEY_PREFIX}${encodeURIComponent(managedStateEpochToken(epoch))}:${encodeURIComponent(key)}`;
}

/**
 * Read one managed key as of `epoch`, taking no fence of its own.
 *
 * WRITES are bracketed by the mutation fence on both sides, and deletes re-take
 * the realm fence after each physical delete. A READ deliberately takes neither,
 * because there is no invariant left for an after-fence to protect:
 *
 *  - A read can never observe a NEWER epoch's data. Epochs are slot-disjoint by
 *    key (`managedStateStorageKey`), so a concurrent reset writes somewhere this
 *    read never looks; and `managedStateLogicalValue` accepts a payload only
 *    when its envelope names the epoch this read was given, so the compatibility
 *    fall-through to the bare logical key cannot surface a newer value either.
 *  - The worst case is therefore a RETIRED-epoch value, returned a moment before
 *    the realm notices it was retired. The caller's next managed operation still
 *    fences: reads keep the fence their caller took before this one, and every
 *    write path (gmStorageSet, gmStorageDelete, the IndexedDB writers) re-fences
 *    itself, so a retired realm still cannot persist anything. The after-fence
 *    bought a few microseconds of detection latency on a value that has no
 *    durable effect, at the price of doubling every read's round trips.
 *
 * That price was the whole shape of the hover-lookup storage profile: one lookup
 * made 46 GM round trips, 35 of them on `yomu:state-epoch`, because ~10 real
 * value reads were each bracketed twice. Under Tampermonkey each round trip is
 * an IPC hop to the extension worker, and the amplification scales with the read
 * fan-out — an SRS deck of N cards paid 3 round trips per card, not 1.
 */
export async function readManagedGmValue<T>(
    getValue: GmGetValue,
    key: string,
    epoch: ManagedStateEpoch,
): Promise<ManagedGmRead<T>> {
    const storageKey = managedStateStorageKey(key, epoch);
    const scoped = await getValue<unknown | typeof MISSING>(storageKey, MISSING);
    const readFromCurrentSlot = !isMissingSentinel(scoped);
    const stored = readFromCurrentSlot || storageKey === key
        ? scoped
        : await getValue<unknown | typeof MISSING>(key, MISSING);
    if (isMissingSentinel(stored)) return { kind: 'missing' };
    const unreadable = Symbol('unreadable-managed-state');
    const logical = managedStateLogicalValue<unknown | typeof MISSING | typeof unreadable>(stored, epoch, unreadable);
    if (logical === unreadable) return readFromCurrentSlot ? { kind: 'deleted' } : { kind: 'missing' };
    if (isMissingSentinel(logical)) return { kind: 'deleted' };
    return { kind: 'found', value: logical as T };
}

export async function managedGmValue<T>(
    getValue: GmGetValue,
    key: string,
    fallback: T,
    epoch: ManagedStateEpoch,
): Promise<T> {
    const read = await readManagedGmValue(getValue, key, epoch);
    return read.kind === 'found' ? read.value as T : fallback;
}
