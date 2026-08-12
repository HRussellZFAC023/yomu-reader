import {
    MANAGED_STORAGE_KEY_PREFIXES,
    isManagedStorageKey,
    isManagedStorageSlotKey,
    isPrivateManagedStorageKey,
    logicalManagedStorageKey,
} from './managed-storage-keys';
import { isPromiseLike } from '../core/async-utils';
import { DOCS_ORIGIN } from './constants';
import { getUserscriptGmStorage } from '../userscript/storage-bridge';
import './managed-state-manifest';
import {
    MANAGED_STATE_EPOCH_KEY,
    StaleManagedStateEpochError,
    isStaleManagedStateEpochError,
    managedStateEpochSessionForRealm,
    managedStateEpochToken,
    managedStateLogicalValue,
    managedStateResetEnumerationValue,
    managedStateStoredValue,
    nextManagedStateEpoch,
    parseManagedStateEpoch,
    sameManagedStateEpoch,
    type ManagedStateEpoch,
} from './managed-state-epoch';
import {
    authoritativeManagedStateEpoch,
    isMissingSentinel,
    managedGmValue,
    managedStateStorageKey,
    MISSING,
    rawAuthoritativeManagedStateEpoch,
    readManagedGmValue,
    type GmGetValue,
} from './managed-read-path';
import {
    registeredManagedStorageKeys,
    registeredManagedIndexedDbNames,
    managedStateEntries,
    managedStateWritesSuppressed,
} from './managed-state-registry';
import {
    ensureManagedWebStorageEpochCurrent,
    ensureManagedWebStorageEpochCurrentSync,
    managedLocalStorage,
    managedSessionStorage,
} from './managed-web-storage';
import {
    MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX,
    createStorageCoordinationId as createFactoryResetId,
    withGmStorageLeaseCore,
    withManagedStateEpochControlLeaseCore,
    type GmStorageLeaseOptions,
} from './gm-storage-lease';
import { isManagedStorageBackupKey } from './managed-storage-backup-policy';
import {
    hostedSettingsLocalFallbackValue,
    hostedStoragePromotionValue,
    isHostedSettingsStorageKey,
    isHostedYomuLocation,
    pendingHostedSettingsPatch,
} from './hosted-storage-fallback';
import { localStorageGet, localStorageSet, localStorageSetOrThrow, storageWriteError } from './storage-local-values';

export { managedLocalStorage, managedSessionStorage };
export type { GmStorageLeaseOptions } from './gm-storage-lease';

const FACTORY_RESET_SIGNAL_KEY = 'yomu:factory-reset-signal';
const FACTORY_RESET_CHANNEL_NAME = 'yomu:factory-reset';
const LOCAL_MIRROR_PROVENANCE_KEY = 'yomu:local-storage-provenance:v1';
const YOMU_LOCAL_SRS_STORAGE_KEY = 'yomu:srs-local:v1';
const YOMU_LOCAL_SRS_V2_INDEX_KEY = 'yomu:srs-local:v2:index';
const YOMU_LOCAL_SRS_V2_CARD_PREFIX = 'yomu:srs-local:v2:card:';
const YOMU_LOCAL_SRS_V2_TOMBSTONE_PREFIX = 'yomu:srs-local:v2:tombstone:';
// A dictionary database can hold gigabytes; Firefox routinely needs tens of
// seconds to delete one. The old 2s budget made factory reset fail on exactly
// the installs that most need it. Blocked deletions (another Yomu tab holding
// a connection) still surface the close-other-tabs message at the deadline.
const MANAGED_IDB_DELETE_TIMEOUT_MS = 60_000;
const MANAGED_CACHE_NAME_PREFIXES = [
    'yomu-newtab-',
    'yomu-pdf-reader-',
    'yomu-video-player-',
    'yomu-docs-shell-',
];
const FACTORY_RESET_CONTROL_STORAGE_KEYS = new Set([
    FACTORY_RESET_SIGNAL_KEY,
    MANAGED_STATE_EPOCH_KEY,
]);
const managedStateEpochSession = managedStateEpochSessionForRealm();

export class ManagedStateResetError extends Error {
    readonly epochMayHaveCommitted: boolean;

    constructor(diagnostic: string, options: ErrorOptions = {}, epochMayHaveCommitted = false) {
        super(diagnostic, options);
        Object.assign(this, { yomuUiCopyKey: 'factoryResetStorageIncomplete' as const });
        this.name = 'ManagedStateResetError';
        this.epochMayHaveCommitted = epochMayHaveCommitted;
    }
}

export function managedStateResetEpochMayHaveCommitted(error: unknown): boolean {
    return Boolean(error
        && typeof error === 'object'
        && (error as { epochMayHaveCommitted?: unknown }).epochMayHaveCommitted === true);
}

type SyncStorageRead<T> = { kind: 'found'; value: T } | { kind: 'deleted' } | { kind: 'fallback' };
type GmSetValue = (key: string, value: unknown) => void | Promise<void>;
type GmDeleteValue = (key: string) => void | Promise<void>;
type GmListValues = () => string[] | Promise<string[]>;
type GmValueChangeListener = (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void;
type GmAddValueChangeListener = (key: string, listener: GmValueChangeListener) => number;
type GmRemoveValueChangeListener = (listenerId: number) => void;
interface ExtensionStorageArea {
    get(key: string | null): Promise<Record<string, unknown>>;
    set(values: Record<string, unknown>): Promise<void>;
    remove(key: string): Promise<void>;
    getKeys?(): Promise<string[]>;
}
interface ExtensionStorageChange {
    readonly newValue?: unknown;
}
interface ExtensionStorageChangedEvent {
    addListener(listener: (changes: Record<string, ExtensionStorageChange>, areaName: string) => void): void;
    removeListener(listener: (changes: Record<string, ExtensionStorageChange>, areaName: string) => void): void;
}

interface LocalMirrorProvenanceEntry {
    readonly epoch: string;
    readonly fingerprint: string;
}

interface LocalMirrorProvenance {
    readonly version: 1;
    readonly values: Readonly<Record<string, LocalMirrorProvenanceEntry>>;
}

export type FactoryResetSignalPhase = 'prepare' | 'complete';

export interface FactoryResetSignal {
    id: string;
    phase: FactoryResetSignalPhase;
    at: number;
    href: string;
}

export interface FactoryResetSignalSource {
    remote: boolean;
    transport: 'gm-storage' | 'broadcast-channel' | 'web-storage';
}

export interface StoredValueChangeSource {
    readonly remote: boolean;
    readonly transport: 'gm-storage' | 'extension-storage' | 'web-storage';
}

async function assertRealmManagedStateEpoch(getValue: GmGetValue | null): Promise<ManagedStateEpoch> {
    const readEpoch = getValue
        ? async () => {
            const epoch = await authoritativeManagedStateEpoch(getValue);
            return epoch.generation === 0 ? undefined : epoch;
        }
        : async () => localStorageGet<unknown>(MANAGED_STATE_EPOCH_KEY, undefined);
    const epoch = await managedStateEpochSession.assertCurrent(readEpoch);
    if (getValue) cacheManagedStateEpochForLocalFallback(epoch);
    return epoch;
}

async function writeManagedGmValue(
    key: string,
    value: unknown,
    epoch: ManagedStateEpoch,
    getValue: GmGetValue,
    setValue: GmSetValue,
): Promise<void> {
    await assertManagedStateMutationFence(getValue, epoch);
    const stored = managedStateStoredValue(value, epoch);
    const storageKey = managedStateStorageKey(key, epoch);
    await setValue(storageKey, stored);
    await assertManagedStateMutationFence(getValue, epoch);
}

async function deleteManagedGmValue(
    key: string,
    epoch: ManagedStateEpoch,
    getValue: GmGetValue,
    setValue: GmSetValue | null,
    deleteValue: GmDeleteValue | null,
): Promise<void> {
    const storageKey = managedStateStorageKey(key, epoch);
    if (managedStateWritesSuppressed()) {
        if (!deleteValue) throw new Error('Managed storage cannot delete its value during factory reset.');
        await deleteValue(storageKey);
        if (storageKey !== key) await deleteValue(key);
        await assertRealmManagedStateEpoch(getValue);
        return;
    }
    if (storageKey === key) {
        if (!deleteValue) throw new Error('Managed storage cannot delete its legacy value.');
        await deleteValue(key);
        await assertRealmManagedStateEpoch(getValue);
        return;
    }
    if (!setValue) throw new Error('Managed storage cannot persist a deletion tombstone.');

    // A tombstone occupies the current epoch's disjoint slot. Even if cleanup
    // of a compatibility mirror fails, readers cannot fall through to it; and
    // a delayed older-epoch delete targets a different physical key.
    await setValue(storageKey, managedStateStoredValue(MISSING, epoch));
    await assertRealmManagedStateEpoch(getValue);
    if (deleteValue) {
        try {
            await deleteValue(key);
        } catch (error) {
            debugStorageError('Managed GM logical-key delete mirror failed', key, error);
        }
        await assertRealmManagedStateEpoch(getValue);
    }
}

function managedStateEpochFromSynchronousGetter(getValue: GmGetValue): ManagedStateEpoch | null {
    const stored = getValue<unknown | typeof MISSING>(MANAGED_STATE_EPOCH_KEY, MISSING);
    if (isPromiseLike(stored)) return null;
    const shared = parseManagedStateEpoch(isMissingSentinel(stored) ? undefined : stored);
    managedStateEpochSession.assertCurrentSync(shared.generation === 0 ? undefined : shared);
    cacheManagedStateEpochForLocalFallback(shared);
    return shared;
}

function managedStateEpochForSynchronousLocalRead(): ManagedStateEpoch | null {
    try {
        const getValue = directGmGetValue();
        if (getValue) {
            const synchronous = managedStateEpochFromSynchronousGetter(getValue);
            if (synchronous) return synchronous;
            return managedStateEpochSession.current() ?? null;
        }
        if (asyncGmGetValue()) return managedStateEpochSession.current() ?? null;
        return managedStateEpochSession.assertCurrentSync(
            localStorageGet<unknown>(MANAGED_STATE_EPOCH_KEY, undefined),
        );
    } catch (error) {
        debugStorageError('Managed state epoch sync read failed', MANAGED_STATE_EPOCH_KEY, error);
        return null;
    }
}

// True when reads/writes reach a shared GM store (direct GM_* APIs or the
// hosted storage bridge) rather than falling back to per-origin localStorage.
export function hasAsyncGmStorageBackend(): boolean {
    return asyncGmGetValue() !== null;
}

/** Fence a non-GM managed-state mutation such as an IndexedDB write. */
export async function assertManagedStateMutationAllowed(): Promise<ManagedStateEpoch> {
    const getValue = asyncGmGetValue();
    const epoch = await assertRealmManagedStateEpoch(getValue);
    await assertManagedStateMutationFence(getValue, epoch);
    return epoch;
}

/**
 * Fence a non-GM managed-state READ: the realm-liveness half only. It still
 * refuses a realm whose epoch was retired, but skips the write-suppression
 * signal, because suppressing writes during a reset is no reason to fail a read.
 * One GM round trip rather than the mutation fence's four.
 */
export const assertManagedStateReadAllowed = (): Promise<ManagedStateEpoch> =>
    assertRealmManagedStateEpoch(asyncGmGetValue());

/** Reconcile and certify this origin's local/session managed caches before boot. */
export async function ensureManagedWebStorageCurrent(): Promise<void> {
    const epoch = await assertRealmManagedStateEpoch(asyncGmGetValue());
    await ensureManagedWebStorageEpochCurrent(epoch);
}

/** Fast document-start barrier when the active GM backend is synchronous. */
export function ensureManagedWebStorageCurrentSync(): boolean {
    const epoch = managedStateEpochForSynchronousLocalRead();
    if (!epoch) return false;
    ensureManagedWebStorageEpochCurrentSync(epoch);
    return true;
}

// Raw read of this origin's localStorage fallback copy, bypassing GM. Used to
// recover values a bridge-less session stranded here before the GM backend
// became available.
export function localFallbackStoredValue<T>(key: string, fallback: T): T {
    const epoch = managedStateEpochForSynchronousLocalRead();
    if (!epoch || !localMirrorBelongsToEpoch(key, epoch)) return fallback;
    return localStorageGet(key, fallback);
}

export async function gmStorageGet<T>(key: string, fallback: T): Promise<T> {
    const getValue = asyncGmGetValue();
    if (!getValue) return localOnlyManagedValue(key, fallback, await assertRealmManagedStateEpoch(null));
    let epoch: ManagedStateEpoch | undefined;
    try {
        epoch = await assertRealmManagedStateEpoch(getValue);
        return await sharedManagedValue(getValue, key, fallback, epoch);
    } catch (error) {
        return failedManagedReadValue(error, key, fallback, epoch);
    }
}

/** Shared-only read: never promote or fall back to page-readable storage. */
export async function gmStorageGetShared<T>(key: string, fallback: T): Promise<T> {
    const getValue = asyncGmGetValue();
    if (!getValue) return fallback;
    return sharedOwnedManagedValue(getValue, key, fallback, 'Shared GM storage read failed');
}

async function sharedOwnedManagedValue<T>(
    getValue: GmGetValue,
    key: string,
    fallback: T,
    errorLabel: string,
): Promise<T> {
    try {
        const epoch = await assertRealmManagedStateEpoch(getValue);
        return await managedGmValue(getValue, key, fallback, epoch);
    } catch (error) {
        if (isStaleManagedStateEpochError(error)) throw error;
        debugStorageError(errorLabel, key, error);
        return fallback;
    }
}

/**
 * Read several managed keys behind ONE realm fence, in the order given. Per-key
 * recovery and error handling are exactly `gmStorageGet`'s.
 *
 * One logical read takes one fence. Every key in the pass is slot-scoped
 * (`managedStateStorageKey`) to the epoch the fence certified, so none of them
 * can observe a newer epoch — see managed-read-path.ts for the full argument.
 * This is a same-operation coalesce, not a cache: the pass reads every key it is
 * given and holds no value past its own return.
 */
export async function gmStorageGetMany<T>(keys: readonly string[], fallback: T): Promise<T[]> {
    if (!keys.length) return [];
    const getValue = asyncGmGetValue();
    if (!getValue) {
        const epoch = await assertRealmManagedStateEpoch(null);
        return keys.map(key => localOnlyManagedValue(key, fallback, epoch));
    }
    let passEpoch: ManagedStateEpoch;
    try {
        passEpoch = await assertRealmManagedStateEpoch(getValue);
    } catch (error) {
        return keys.map(key => failedManagedReadValue(error, key, fallback, undefined));
    }
    return Promise.all(keys.map(async key => {
        try {
            return await sharedManagedValue(getValue, key, fallback, passEpoch);
        } catch (error) {
            return failedManagedReadValue(error, key, fallback, passEpoch);
        }
    }));
}

async function sharedManagedValue<T>(getValue: GmGetValue, key: string, fallback: T, epoch: ManagedStateEpoch): Promise<T> {
    const pendingPatch = pendingHostedLocalPatch(key, epoch);
    return pendingPatch
        ? reconcilePendingHostedLocalPatch(getValue, key, pendingPatch, epoch)
        : sharedManagedValueWithoutPendingPatch(getValue, key, fallback, epoch);
}

async function reconcilePendingHostedLocalPatch<T>(
    getValue: GmGetValue,
    key: string,
    pendingPatch: Record<string, unknown>,
    epoch: ManagedStateEpoch,
): Promise<T> {
    const shared = await managedGmValue(getValue, key, undefined, epoch);
    const sharedRecord = isPlainRecord(shared) ? shared : {};
    const reconciled = { ...sharedRecord, ...pendingPatch } as T;
    await gmStorageSet(key, reconciled);
    return reconciled;
}

async function sharedManagedValueWithoutPendingPatch<T>(
    getValue: GmGetValue,
    key: string,
    fallback: T,
    epoch: ManagedStateEpoch,
): Promise<T> {
    const read = await readManagedGmValue<T>(getValue, key, epoch);
    if (read.kind === 'found') return read.value;
    if (read.kind === 'deleted') return fallback;
    return promoteLocalManagedValue(key, fallback, epoch);
}

async function promoteLocalManagedValue<T>(key: string, fallback: T, epoch: ManagedStateEpoch): Promise<T> {
    const migrated = localMirrorBelongsToEpoch(key, epoch)
        ? localStorageGet<T>(key, MISSING as T)
        : MISSING as T;
    if (!isMissingSentinel(migrated)) {
        const promoted = hostedStoragePromotionValue(key, migrated, isHostedYomuOrigin());
        await gmStorageSet(key, promoted);
        return promoted;
    }
    return fallback;
}

function failedManagedReadValue<T>(error: unknown, key: string, fallback: T, epoch?: ManagedStateEpoch): T {
    if (isStaleManagedStateEpochError(error)) throw error;
    debugStorageError('GM storage read failed', key, error);
    if (epoch && localMirrorBelongsToEpoch(key, epoch)) {
        return localStorageGet(key, fallback);
    }
    return fallback;
}

function localOnlyManagedValue<T>(key: string, fallback: T, epoch: ManagedStateEpoch): T {
    const local = localMirrorBelongsToEpoch(key, epoch) ? localStorageGet<T | typeof MISSING>(key, MISSING) : MISSING;
    if (!isMissingSentinel(local)) return local as T;
    // Establish the standalone hosted profile as a comparison baseline before
    // the user edits it. A later bridge can then persist a field-level patch,
    // rather than mistaking the entire default-filled settings object for user
    // intent and overwriting unrelated settings already present in GM storage.
    mirrorStandaloneHostedSettingsBaseline(key, fallback, epoch);
    return fallback;
}

function mirrorStandaloneHostedSettingsBaseline<T>(key: string, fallback: T, epoch: ManagedStateEpoch): void {
    if (isHostedSettingsStorageKey(key) && isHostedYomuOrigin() && isPlainRecord(fallback)) {
        mirrorManagedValueToHostedStorage(key, fallback, epoch);
    }
}

/** Raw, non-promoting read used by owner-defined factory-reset enumerators. */
export async function gmStorageGetForResetEnumeration<T>(key: string, fallback: T): Promise<T> {
    const getValue = asyncGmGetValue();
    if (getValue) {
        const before = await authoritativeManagedStateEpoch(getValue);
        const storageKey = managedStateStorageKey(key, before);
        let stored = await getValue<unknown | typeof MISSING>(storageKey, MISSING);
        const readFromCurrentSlot = !isMissingSentinel(stored);
        if (!readFromCurrentSlot && storageKey !== key) {
            stored = await getValue<unknown | typeof MISSING>(key, MISSING);
        }
        const after = await authoritativeManagedStateEpoch(getValue);
        if (!sameManagedStateEpoch(before, after)) {
            throw new ManagedStateResetError(`Managed storage changed epoch while enumerating "${key}".`);
        }
        if (isMissingSentinel(stored)) return fallback;
        const logical = managedStateResetEnumerationValue<unknown>(stored);
        return isMissingSentinel(logical) ? fallback : logical as T;
    }
    if (asyncGmSetValue() || asyncGmDeleteValue()) {
        throw new ManagedStateResetError(`Managed storage cannot read the index "${key}".`);
    }
    const stored = localStorageGet<unknown | typeof MISSING>(key, MISSING);
    return isMissingSentinel(stored) ? fallback : managedStateResetEnumerationValue<T>(stored);
}

/**
 * Read secret material only from the extension/userscript-owned store. This
 * deliberately never migrates from or falls back to page-readable web storage.
 */
export async function gmPrivateStorageGet<T>(key: string, fallback: T): Promise<T> {
    assertPrivateStorageKey(key);
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
    const getValue = directGmGetValue();
    if (!getValue) return fallback;
    return sharedOwnedManagedValue(getValue, key, fallback, 'Private GM storage read failed');
}

export async function withGmStorageLease<T>(
    name: string,
    operation: () => Promise<T>,
    options: GmStorageLeaseOptions = {},
): Promise<T> {
    return withGmStorageLeaseCore(name, operation, options, {
        backend: gmStorageLeaseBackend(),
        captureEpoch: assertRealmManagedStateEpoch,
        assertMutationFence: assertManagedStateMutationFence,
        epochToken: managedStateEpochToken,
    });
}

async function withManagedStateEpochControlLease<T>(operation: () => Promise<T>): Promise<T> {
    return withManagedStateEpochControlLeaseCore(operation, {
        backend: gmStorageLeaseBackend(),
    });
}

function gmStorageLeaseBackend() {
    return {
        getValue: asyncGmGetValue(),
        setValue: asyncGmSetValue(),
        deleteValue: asyncGmDeleteValue(),
        listValues: asyncGmListValues(),
    };
}

export function gmStorageGetSync<T>(key: string, fallback: T): T {
    const getValue = typeof GM_getValue === 'function' ? GM_getValue as GmGetValue : null;
    let epoch: ManagedStateEpoch | null = null;
    if (getValue) {
        epoch = managedStateEpochFromSynchronousGetter(getValue);
        if (!epoch) return fallback;
        const read = gmStorageSyncRead<T>(key, getValue, epoch);
        if (read.kind === 'found') return read.value;
        if (read.kind === 'deleted') return fallback;
    }
    // Reuse the epoch this same synchronous turn already read. Not a memo across
    // an await: nothing can run between the read above and this line, so asking
    // the backend again would return the identical byte for the identical
    // instant. Only a getter-less realm still resolves it from the local mirror.
    epoch ??= managedStateEpochForSynchronousLocalRead();
    return epoch && localMirrorBelongsToEpoch(key, epoch) ? localStorageGet(key, fallback) : fallback;
}

// Read only when the shared userscript backend can answer synchronously.
// Unlike gmStorageGetSync, this deliberately never falls back to this origin's
// localStorage copy: callers use it when a stale per-origin value must not
// outrank an async shared setting.
export function gmStorageGetSharedSync<T>(key: string, fallback: T): T {
    const getValue = typeof GM_getValue === 'function' ? GM_getValue as GmGetValue : null;
    if (!getValue) return fallback;
    try {
        const epoch = managedStateEpochFromSynchronousGetter(getValue);
        if (!epoch) return fallback;
        const storageKey = managedStateStorageKey(key, epoch);
        let stored = getValue<unknown | typeof MISSING>(storageKey, MISSING);
        if (isPromiseLike(stored)) return fallback;
        if (isMissingSentinel(stored) && storageKey !== key) {
            stored = getValue<unknown | typeof MISSING>(key, MISSING);
        }
        if (isPromiseLike(stored) || isMissingSentinel(stored)) return fallback;
        const unreadable = Symbol('unreadable-managed-state');
        const logical = managedStateLogicalValue<T | typeof MISSING | typeof unreadable>(stored, epoch, unreadable);
        return logical === unreadable || isMissingSentinel(logical) ? fallback : logical as T;
    } catch (error) {
        debugStorageError('Shared GM storage sync read failed', key, error);
        return fallback;
    }
}

function gmStorageSyncRead<T>(key: string, getValue: GmGetValue, epoch: ManagedStateEpoch): SyncStorageRead<T> {
    try {
        const storageKey = managedStateStorageKey(key, epoch);
        let stored = getValue<unknown | typeof MISSING>(storageKey, MISSING);
        if (isPromiseLike(stored)) return { kind: 'fallback' };
        const readFromCurrentSlot = !isMissingSentinel(stored);
        if (isMissingSentinel(stored) && storageKey !== key) {
            stored = getValue<unknown | typeof MISSING>(key, MISSING);
            if (isPromiseLike(stored)) return { kind: 'fallback' };
        }
        if (!isMissingSentinel(stored)) {
            const unreadable = Symbol('unreadable-managed-state');
            const value = managedStateLogicalValue<T | typeof MISSING | typeof unreadable>(stored, epoch, unreadable);
            if (value === unreadable) return readFromCurrentSlot ? { kind: 'deleted' } : { kind: 'fallback' };
            if (isMissingSentinel(value)) return { kind: 'deleted' };
            return { kind: 'found', value: value as T };
        }
        return migratedLocalStorageSyncValue(key, epoch);
    } catch (error) {
        debugStorageError('GM storage sync read failed', key, error);
        return { kind: 'fallback' };
    }
}

function migratedLocalStorageSyncValue<T>(key: string, epoch: ManagedStateEpoch): SyncStorageRead<T> {
    if (!localMirrorBelongsToEpoch(key, epoch)) return { kind: 'fallback' };
    const migrated = localStorageGet<T>(key, MISSING as T);
    if (isMissingSentinel(migrated)) return { kind: 'fallback' };
    const promoted = hostedStoragePromotionValue(key, migrated, isHostedYomuOrigin());
    void gmStorageSet(key, promoted);
    return { kind: 'found', value: promoted };
}

function pendingHostedLocalPatch(key: string, epoch: ManagedStateEpoch): Record<string, unknown> | undefined {
    if (!isHostedSettingsStorageKey(key) || !isHostedYomuOrigin()) return undefined;
    if (!localMirrorBelongsToEpoch(key, epoch)) return undefined;
    return pendingHostedSettingsPatch(key, localStorageGet<unknown>(key, undefined), true);
}

function localFallbackValueForWrite(key: string, value: unknown): unknown {
    if (!isHostedSettingsStorageKey(key)) return value;
    return hostedSettingsLocalFallbackValue(
        key,
        value,
        isHostedYomuOrigin(),
        () => localStorageGet<unknown>(key, undefined),
    );
}

interface GmStorageSetOptions {
    readonly localFallbackOnAuthoritativeFailure?: 'write' | 'preserve';
}

export async function gmStorageSet(
    key: string,
    value: unknown,
    options: GmStorageSetOptions = {},
): Promise<void> {
    if (managedStateWritesSuppressed()) throw new Error('Managed state writes are suppressed during factory reset.');
    const getValue = asyncGmGetValue();
    const setValue = asyncGmSetValue();
    if (setValue) return setSharedManagedValue(key, value, options, getValue, setValue);
    const epoch = await assertRealmManagedStateEpoch(null);
    writeLocalManagedValueOrThrow(key, localFallbackValueForWrite(key, value), epoch);
}

async function setSharedManagedValue(
    key: string,
    value: unknown,
    options: GmStorageSetOptions,
    getValue: GmGetValue | null,
    setValue: GmSetValue,
): Promise<void> {
    let epoch: ManagedStateEpoch | undefined;
    try {
        if (!getValue) throw new Error('Managed storage cannot validate its state epoch.');
        epoch = await assertRealmManagedStateEpoch(getValue);
        await writeManagedGmValue(key, value, epoch, getValue, setValue);
        mirrorManagedValueToHostedStorage(key, value, epoch);
    } catch (error) {
        await handleSharedManagedWriteFailure(key, value, options, error, epoch);
    }
}

async function handleSharedManagedWriteFailure(
    key: string,
    value: unknown,
    options: GmStorageSetOptions,
    error: unknown,
    epoch: ManagedStateEpoch | undefined,
): Promise<never> {
    if (isStaleManagedStateEpochError(error)) throw error;
    debugStorageError('GM storage write failed', key, error);
    if (options.localFallbackOnAuthoritativeFailure === 'preserve') {
        throw storageWriteError(key, 'GM storage write failed', error);
    }
    await writeFailedManagedValueFallback(key, value, error, epoch);
    throw storageWriteError(key, 'GM storage write failed; saved only to localStorage fallback', error);
}

async function writeFailedManagedValueFallback(
    key: string,
    value: unknown,
    error: unknown,
    epoch: ManagedStateEpoch | undefined,
): Promise<void> {
    try {
        const fallbackEpoch = epoch ?? await assertRealmManagedStateEpoch(null);
        writeLocalManagedValueOrThrow(key, localFallbackValueForWrite(key, value), fallbackEpoch);
    } catch (fallbackError) {
        throw storageWriteError(key, 'GM storage and localStorage fallback writes failed', error, fallbackError);
    }
}

/** Store secret material fail-closed; page localStorage is never a fallback. */
export async function gmPrivateStorageSet(key: string, value: unknown): Promise<void> {
    assertPrivateStorageKey(key);
    if (managedStateWritesSuppressed()) throw new Error('Managed state writes are suppressed during factory reset.');
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
    const getValue = directGmGetValue();
    const setValue = directGmSetValue();
    if (!getValue || !setValue) throw new Error('Secure extension storage is unavailable.');
    try {
        const epoch = await assertRealmManagedStateEpoch(getValue);
        await writeManagedGmValue(key, value, epoch, getValue, setValue);
    } catch (error) {
        if (isStaleManagedStateEpochError(error)) throw error;
        debugStorageError('Private GM storage write failed', key, error);
        throw new Error('Secure extension storage is unavailable.');
    }
}

export function gmStorageSetSync(key: string, value: unknown): void {
    if (managedStateWritesSuppressed()) {
        debugStorageError('Managed state write suppressed during factory reset', key, null);
        return;
    }
    const getValue = typeof GM_getValue === 'function' ? GM_getValue as GmGetValue : null;
    const setValue = typeof GM_setValue === 'function' ? GM_setValue as GmSetValue : null;
    let epoch: ManagedStateEpoch | null = null;
    if (getValue && setValue) {
        try {
            epoch = managedStateEpochFromSynchronousGetter(getValue);
            if (!epoch) {
                void gmStorageSet(key, value).catch(error => debugStorageError('GM storage async write failed', key, error));
                return;
            }
            const stored = managedStateStoredValue(value, epoch);
            const storageKey = managedStateStorageKey(key, epoch);
            const result = setValue(storageKey, stored);
            if (isPromiseLike(result)) {
                void result
                    .then(async () => {
                        await assertRealmManagedStateEpoch(getValue);
                        mirrorManagedValueToHostedStorage(key, value, epoch as ManagedStateEpoch);
                    })
                    .catch(error => debugStorageError('GM storage async write failed', key, error));
                return;
            }
            const after = managedStateEpochFromSynchronousGetter(getValue);
            if (!after || !sameManagedStateEpoch(epoch, after)) return;
            mirrorManagedValueToHostedStorage(key, value, epoch);
            return;
        } catch (error) {
            if (isStaleManagedStateEpochError(error)) {
                debugStorageError('Rejected stale managed state write', key, error);
                return;
            }
            debugStorageError('GM storage sync write failed', key, error);
        }
    }
    if ((!getValue || !setValue) && asyncGmSetValue()) {
        void gmStorageSet(key, value).catch(error => debugStorageError('GM storage async write failed', key, error));
        return;
    }
    try {
        epoch ??= managedStateEpochForSynchronousLocalRead();
        if (!epoch) return;
        writeLocalManagedValueOrThrow(key, localFallbackValueForWrite(key, value), epoch);
    } catch (error) {
        debugStorageError('localStorage sync write failed', key, error);
    }
}

export async function gmStorageDelete(key: string): Promise<void> {
    const getValue = asyncGmGetValue();
    const setValue = asyncGmSetValue();
    const deleteValue = asyncGmDeleteValue();
    const hasBackend = Boolean(getValue || setValue || deleteValue);
    if (hasBackend && !getValue) {
        throw storageWriteError(key, 'Managed storage cannot validate and delete the same backend value');
    }
    if (getValue) {
        try {
            const epoch = await assertRealmManagedStateEpoch(getValue);
            await deleteManagedGmValue(key, epoch, getValue, setValue, deleteValue);
        } catch (error) {
            if (isStaleManagedStateEpochError(error)) throw error;
            debugStorageError('GM storage delete failed', key, error);
            throw storageWriteError(key, 'GM storage delete failed', error);
        }
    } else {
        await assertRealmManagedStateEpoch(null);
    }
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
    removeLocalMirrorProvenance(key);
}

async function deleteManagedStoredValue(key: string): Promise<void> {
    const getValue = asyncGmGetValue();
    const deleteValue = asyncGmDeleteValue();
    if (getValue && !deleteValue) {
        throw new ManagedStateResetError(`Managed storage cannot delete "${key}".`);
    }
    const epoch = !isManagedStorageSlotKey(key) && getValue
        ? await authoritativeManagedStateEpoch(getValue)
        : null;
    const targets = new Set<string>([key]);
    // Owner enumerators and exact manifest rows speak in logical keys. Delete
    // both that compatibility key and its authoritative current-epoch slot;
    // a raw GM listing may also hand us an older physical slot directly.
    if (epoch) targets.add(managedStateStorageKey(key, epoch));
    if (deleteValue) {
        for (const target of targets) {
            try {
                await deleteValue(target);
            } catch (error) {
                throw new ManagedStateResetError(`Managed storage failed to delete "${target}".`, { cause: error });
            }
        }
    }
    for (const target of targets) {
        removeLocalStorageKey(target);
        removeSessionStorageKey(target);
    }

    if (getValue) {
        for (const target of targets) {
            let stored: unknown;
            try {
                stored = await getValue<unknown | typeof MISSING>(target, MISSING);
            } catch (error) {
                throw new ManagedStateResetError(`Managed storage could not verify deletion of "${target}".`, { cause: error });
            }
            if (!isMissingSentinel(stored)) {
                throw new ManagedStateResetError(`Managed storage still contains "${target}" after deletion.`);
            }
        }
    }
    for (const target of targets) {
        if (resetWebStorageHasKey(localStorage, target, 'localStorage')
            || resetWebStorageHasKey(sessionStorage, target, 'sessionStorage')) {
            throw new ManagedStateResetError(`Web storage still contains "${target}" after deletion.`);
        }
    }
}

/** Delete secret material from GM storage and scrub any legacy web fallback. */
export async function gmPrivateStorageDelete(key: string): Promise<void> {
    assertPrivateStorageKey(key);
    const getValue = directGmGetValue();
    const setValue = directGmSetValue();
    const deleteValue = directGmDeleteValue();
    if (!getValue || (!setValue && !deleteValue)) throw new Error('Secure extension storage is unavailable.');
    if (getValue) {
        try {
            const epoch = await assertRealmManagedStateEpoch(getValue);
            await deleteManagedGmValue(key, epoch, getValue, setValue, deleteValue);
        } catch (error) {
            if (isStaleManagedStateEpochError(error)) throw error;
            debugStorageError('Private GM storage delete failed', key, error);
            throw new Error('Secure extension storage is unavailable.');
        }
    }
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
}

function assertPrivateStorageKey(key: string): void {
    if (!isPrivateManagedStorageKey(key)) throw new TypeError('Private storage requires a yomu:private: key.');
}

export function gmStorageDeleteSync(key: string): void {
    const getValue = typeof GM_getValue === 'function' ? GM_getValue as GmGetValue : null;
    const setValue = typeof GM_setValue === 'function' ? GM_setValue as GmSetValue : null;
    const deleteValue = typeof GM_deleteValue === 'function' ? GM_deleteValue as GmDeleteValue : null;
    if (getValue && (setValue || deleteValue)) {
        try {
            const epoch = managedStateEpochFromSynchronousGetter(getValue);
            if (!epoch) {
                void gmStorageDelete(key).catch(error => debugStorageError('GM storage async delete failed', key, error));
                return;
            }
            const storageKey = managedStateStorageKey(key, epoch);
            const result = storageKey === key
                ? deleteValue?.(key)
                : setValue?.(storageKey, managedStateStoredValue(MISSING, epoch));
            if (result === undefined && (storageKey === key ? !deleteValue : !setValue)) {
                void gmStorageDelete(key).catch(error => debugStorageError('GM storage async delete failed', key, error));
                return;
            }
            if (isPromiseLike(result)) {
                void result
                    .then(async () => {
                        await assertRealmManagedStateEpoch(getValue);
                        removeLocalManagedValue(key);
                    })
                    .catch(error => debugStorageError('GM storage async delete failed', key, error));
                return;
            }
            const after = managedStateEpochFromSynchronousGetter(getValue);
            if (!after || !sameManagedStateEpoch(epoch, after)) return;
            removeLocalManagedValue(key);
            return;
        } catch (error) {
            debugStorageError('GM storage sync delete failed', key, error);
            return;
        }
    }
    if (asyncGmDeleteValue() || asyncGmSetValue()) {
        void gmStorageDelete(key).catch(error => debugStorageError('GM storage async delete failed', key, error));
        return;
    }
    try {
        if (!managedStateEpochForSynchronousLocalRead()) return;
        removeLocalManagedValue(key);
    } catch (error) {
        debugStorageError('localStorage sync delete failed', key, error);
    }
}

async function exportStoredValues(prefixes: string[]): Promise<Record<string, unknown>> {
    // Backups have always included persistent localStorage state, but not
    // tab-scoped sessionStorage. Certify the local area before projecting any
    // generation-specific web-storage slots back to their logical keys.
    await ensureManagedWebStorageCurrent();
    const keys = (await storageKeys(prefixes)).filter(isManagedStorageBackupKey);
    const entries = await Promise.all(keys.map(async key => [key, await storedBackupValue(key)] as const));
    return Object.fromEntries(entries.filter(([, value]) => !isMissingSentinel(value)));
}

async function storedBackupValue(key: string): Promise<unknown | typeof MISSING> {
    const shared = await gmStorageGet<unknown | typeof MISSING>(key, MISSING);
    if (!isMissingSentinel(shared)) return shared;
    try {
        const serialized = managedLocalStorage.getItem(key);
        return serialized === null ? MISSING : JSON.parse(serialized) as unknown;
    } catch {
        // Match the legacy localStorage fallback contract: malformed or
        // unreadable values are omitted instead of poisoning the whole export.
        return MISSING;
    }
}

export async function exportManagedStoredValues(): Promise<Record<string, unknown>> {
    return await exportStoredValues(MANAGED_STORAGE_KEY_PREFIXES);
}

export async function importStoredValues(values: unknown): Promise<number> {
    let count = 0;
    const entries = managedStoredValueEntries(values).sort(([left], [right]) =>
        Number(left === YOMU_LOCAL_SRS_V2_INDEX_KEY) - Number(right === YOMU_LOCAL_SRS_V2_INDEX_KEY));
    for (const [key, value] of entries) {
        const storedValue = key === YOMU_LOCAL_SRS_STORAGE_KEY
            ? await mergeYomuLocalSrsDeckImport(value)
            : await mergeYomuLocalSrsV2Import(key, value);
        await gmStorageSet(key, storedValue);
        count++;
    }
    return count;
}

async function mergeYomuLocalSrsV2Import(key: string, imported: unknown): Promise<unknown> {
    if (key === YOMU_LOCAL_SRS_V2_INDEX_KEY) {
        const existing = await gmStorageGet<unknown>(key, null).catch(() => null);
        if (!isPlainRecord(imported) || !isPlainRecord(existing)) return imported;
        return {
            version: 2,
            revision: Math.max(
                nonNegativeSafeInteger(existing.revision),
                nonNegativeSafeInteger(imported.revision),
            ) + 1,
            cardIds: mergedStringIds(existing.cardIds, imported.cardIds),
            tombstoneIds: mergedStringIds(existing.tombstoneIds, imported.tombstoneIds),
        };
    }
    if (key.startsWith(YOMU_LOCAL_SRS_V2_CARD_PREFIX)) {
        const id = decodeStoredYomuSrsId(key.slice(YOMU_LOCAL_SRS_V2_CARD_PREFIX.length));
        const existing = await gmStorageGet<unknown>(key, null).catch(() => null);
        if (!id || !isPlainRecord(imported) || !isPlainRecord(existing)) return imported;
        return mergeYomuLocalSrsCards(
            { [id]: existing },
            { [id]: imported },
        )[id] ?? imported;
    }
    if (key.startsWith(YOMU_LOCAL_SRS_V2_TOMBSTONE_PREFIX)) {
        const existing = await gmStorageGet<unknown>(key, null).catch(() => null);
        return Math.max(nonNegativeSafeInteger(existing), nonNegativeSafeInteger(imported));
    }
    return imported;
}

function mergedStringIds(left: unknown, right: unknown): string[] {
    return [...new Set([
        ...(Array.isArray(left) ? left.filter((value): value is string => typeof value === 'string') : []),
        ...(Array.isArray(right) ? right.filter((value): value is string => typeof value === 'string') : []),
    ])].sort();
}

function nonNegativeSafeInteger(value: unknown): number {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function decodeStoredYomuSrsId(value: string): string | null {
    try {
        return decodeURIComponent(value);
    } catch {
        return null;
    }
}

function managedStoredValueEntries(values: unknown): Array<[string, unknown]> {
    return isStorageImportRecord(values)
        ? Object.entries(values).filter(([key]) => isManagedStorageBackupKey(key))
        : [];
}

function isStorageImportRecord(values: unknown): values is Record<string, unknown> {
    return Boolean(values && typeof values === 'object' && !Array.isArray(values));
}

async function mergeYomuLocalSrsDeckImport(imported: unknown): Promise<unknown> {
    const importedDeck = yomuLocalSrsDeckRecord(imported);
    if (!importedDeck) return imported;
    const existingDeck = yomuLocalSrsDeckRecord(await gmStorageGet<unknown>(YOMU_LOCAL_SRS_STORAGE_KEY, null).catch(() => null));
    if (!existingDeck) return importedDeck;
    return {
        version: 1,
        cards: mergeYomuLocalSrsCards(existingDeck.cards, importedDeck.cards),
    };
}

function yomuLocalSrsDeckRecord(value: unknown): { version: 1; cards: Record<string, Record<string, unknown>> } | null {
    if (!isPlainRecord(value) || value.version !== 1 || !isPlainRecord(value.cards)) return null;
    const cards: Record<string, Record<string, unknown>> = {};
    for (const [id, card] of Object.entries(value.cards)) {
        if (isPlainRecord(card)) cards[id] = card;
    }
    return { version: 1, cards };
}

function mergeYomuLocalSrsCards(
    existingCards: Record<string, Record<string, unknown>>,
    importedCards: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
    const cards = { ...existingCards };
    for (const [id, importedCard] of Object.entries(importedCards)) {
        const existingCard = cards[id];
        cards[id] = existingCard ? mergeYomuLocalSrsCard(existingCard, importedCard) : importedCard;
    }
    return cards;
}

function mergeYomuLocalSrsCard(existingCard: Record<string, unknown>, importedCard: Record<string, unknown>): Record<string, unknown> {
    return {
        ...importedCard,
        ...existingCard,
        meanings: uniquePrimitiveStrings([
            ...stringArray(importedCard.meanings),
            ...stringArray(existingCard.meanings),
        ]),
        sentence: existingCard.sentence || importedCard.sentence,
        sourceUrl: existingCard.sourceUrl || importedCard.sourceUrl,
        tags: uniquePrimitiveStrings([
            ...stringArray(importedCard.tags),
            ...stringArray(existingCard.tags),
        ]),
        createdAt: minFiniteNumber(importedCard.createdAt, existingCard.createdAt) ?? existingCard.createdAt ?? importedCard.createdAt,
        updatedAt: maxFiniteNumber(importedCard.updatedAt, existingCard.updatedAt) ?? existingCard.updatedAt ?? importedCard.updatedAt,
    };
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function uniquePrimitiveStrings(values: string[]): string[] {
    return Array.from(new Set(values));
}

function minFiniteNumber(a: unknown, b: unknown): number | undefined {
    const values = [a, b].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return values.length ? Math.min(...values) : undefined;
}

function maxFiniteNumber(a: unknown, b: unknown): number | undefined {
    const values = [a, b].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return values.length ? Math.max(...values) : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function clearManagedStoredValues(): Promise<number> {
    const keys = await allStorageKeys();
    await clearBridgePrivateManagedValuesForReset();
    let count = 0;
    for (const key of keys) {
        await deleteManagedStoredValue(key);
        count++;
    }
    await clearManagedIndexedDatabases();
    count += await clearManagedBrowserCaches();
    count += await unregisterManagedServiceWorkers();
    return count;
}

export async function managedStoredKeysStillPresent(): Promise<string[]> {
    const keys = await allStorageKeys();
    await clearBridgePrivateManagedValuesForReset();
    return keys;
}

export async function clearManagedBrowserCaches(): Promise<number> {
    if (typeof caches === 'undefined') return 0;
    try {
        const keys = await caches.keys();
        const managedKeys = keys.filter(isManagedBrowserCacheName);
        const deleted = await Promise.all(managedKeys.map(key => caches.delete(key)));
        const failed = managedKeys.filter((_key, index) => !deleted[index]);
        if (failed.length) throw new ManagedStateResetError(`Managed browser caches remained: ${failed.join(', ')}`);
        return deleted.length;
    } catch (error) {
        debugStorageError('Cache API clear failed', 'managed-caches', error);
        if (error instanceof ManagedStateResetError) throw error;
        throw new ManagedStateResetError('Managed browser caches could not be cleared.', { cause: error });
    }
}

export async function unregisterManagedServiceWorkers(): Promise<number> {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker?.getRegistrations) return 0;
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const managedRegistrations = registrations.filter(isManagedServiceWorkerRegistration);
        const unregistered = await Promise.all(managedRegistrations.map(registration => registration.unregister()));
        const failed = managedRegistrations.filter((_registration, index) => !unregistered[index]);
        if (failed.length) throw new ManagedStateResetError('Managed service workers remained registered.');
        return unregistered.length;
    } catch (error) {
        debugStorageError('Service worker unregister failed', 'managed-service-workers', error);
        if (error instanceof ManagedStateResetError) throw error;
        throw new ManagedStateResetError('Managed service workers could not be unregistered.', { cause: error });
    }
}

async function setRawControlStorageValue(key: string, value: unknown): Promise<void> {
    const setValue = asyncGmSetValue();
    if (setValue) {
        await setValue(key, value);
        if (key === MANAGED_STATE_EPOCH_KEY || isHostedYomuOrigin()) localStorageSet(key, value);
        return;
    }
    localStorageSetOrThrow(key, value);
}

async function deleteRawControlStorageValue(key: string): Promise<void> {
    const getValue = asyncGmGetValue();
    const deleteValue = asyncGmDeleteValue();
    if (getValue && !deleteValue) throw new Error(`Managed storage cannot delete control key "${key}".`);
    if (deleteValue) await deleteValue(key);
    if (getValue) {
        const stored = await getValue<unknown | typeof MISSING>(key, MISSING);
        if (!isMissingSentinel(stored)) throw new Error(`Managed storage retained control key "${key}".`);
    }
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
}

export async function clearFactoryResetSignal(): Promise<void> {
    await deleteRawControlStorageValue(FACTORY_RESET_SIGNAL_KEY);
}

export function createFactoryResetSignal(phase: FactoryResetSignalPhase, id = createFactoryResetId()): FactoryResetSignal {
    return {
        id,
        phase,
        at: Date.now(),
        href: location.href,
    };
}

export async function publishFactoryResetSignal(signal: FactoryResetSignal): Promise<void> {
    const normalized = normalizeFactoryResetSignal(signal);
    await setRawControlStorageValue(FACTORY_RESET_SIGNAL_KEY, normalized);
    publishBroadcastFactoryResetSignal(normalized);
}

export async function commitManagedStateResetEpoch(resetId: string): Promise<ManagedStateEpoch> {
    const getValue = asyncGmGetValue();
    const setValue = asyncGmSetValue();
    if (Boolean(getValue) !== Boolean(setValue)) {
        throw new ManagedStateResetError('Managed storage cannot persist the reset epoch safely.');
    }

    let epochMayHaveCommitted = false;
    try {
        return await withManagedStateEpochControlLease(async () => {
            // Re-read while holding the raw control lease so concurrent reset
            // commits share one serialization domain.
            const current = getValue && setValue
                ? await authoritativeManagedStateEpoch(getValue)
                : parseManagedStateEpoch(localStorageGet<unknown>(MANAGED_STATE_EPOCH_KEY, undefined));
            const captured = managedStateEpochSession.current();
            if (captured && !sameManagedStateEpoch(captured, current)) {
                throw new StaleManagedStateEpochError(captured, current);
            }
            const next = nextManagedStateEpoch(current, resetId);
            await setRawControlStorageValue(MANAGED_STATE_EPOCH_KEY, next);
            epochMayHaveCommitted = true;

            // With a shared backend, that register is authoritative. The local
            // epoch copy is only a cache and may be unavailable (privacy mode,
            // quota); rejecting after the shared commit would falsely report a
            // failed reset even though the irreversible epoch advance landed.
            const persisted = getValue
                ? parseManagedStateEpoch(await rawAuthoritativeManagedStateEpoch(getValue))
                : parseManagedStateEpoch(localStorageGet<unknown>(MANAGED_STATE_EPOCH_KEY, undefined));
            if (!sameManagedStateEpoch(next, persisted)) {
                throw new ManagedStateResetError('Managed storage did not retain the new reset epoch.');
            }
            return next;
        });
    } catch (error) {
        if (error instanceof ManagedStateResetError && error.epochMayHaveCommitted === epochMayHaveCommitted) throw error;
        throw new ManagedStateResetError(
            'Managed storage could not commit the reset epoch.',
            { cause: error },
            epochMayHaveCommitted,
        );
    }
}

export function subscribeToFactoryResetSignals(onSignal: (signal: FactoryResetSignal, source: FactoryResetSignalSource) => void): () => void {
    const cleanups: Array<() => void> = [];

    addGmValueChangeCleanup(cleanups, FACTORY_RESET_SIGNAL_KEY, (_key, _oldValue, newValue, remote) => {
        const signal = parseFactoryResetSignal(newValue);
        if (signal) onSignal(signal, { remote, transport: 'gm-storage' });
    }, 'GM factory reset listener failed');

    if (typeof BroadcastChannel === 'function') {
        try {
            const channel = new BroadcastChannel(FACTORY_RESET_CHANNEL_NAME);
            channel.onmessage = event => {
                const signal = parseFactoryResetSignal(event.data);
                if (signal) onSignal(signal, { remote: true, transport: 'broadcast-channel' });
            };
            cleanups.push(() => channel.close());
        } catch (error) {
            debugStorageError('Broadcast factory reset listener failed', FACTORY_RESET_CHANNEL_NAME, error);
        }
    }

    addWebStorageCleanup(cleanups, FACTORY_RESET_SIGNAL_KEY, event => {
        const signal = parseFactoryResetSignal(event.newValue);
        if (signal) onSignal(signal, { remote: true, transport: 'web-storage' });
    });

    return () => runStorageCleanups(cleanups);
}

export function subscribeToStoredValueChanges(
    key: string,
    onChange: (newValue: unknown, source: StoredValueChangeSource) => void,
): () => void {
    const cleanups: Array<() => void> = [];
    const subscriptionEpoch = managedStateEpochForSynchronousLocalRead();
    const sharedKeys = new Set([key]);
    if (subscriptionEpoch) sharedKeys.add(managedStateStorageKey(key, subscriptionEpoch));
    let notificationQueue = Promise.resolve();
    const enqueueManagedChange = (_stored: unknown, source: StoredValueChangeSource): void => {
        notificationQueue = notificationQueue
            .then(() => notifyManagedStoredValueChange(key, source, onChange))
            .catch(error => debugStorageError('Managed stored value listener failed', key, error));
    };

    for (const sharedKey of sharedKeys) {
        addGmValueChangeCleanup(cleanups, sharedKey, (_key, _oldValue, newValue, remote) => {
            enqueueManagedChange(newValue, { remote, transport: 'gm-storage' });
        }, 'GM stored value listener failed');
    }
    addWebStorageCleanup(cleanups, key, event => {
        const epoch = managedStateEpochForSynchronousLocalRead();
        if (!epoch || !localMirrorBelongsToEpoch(key, epoch)) return;
        onChange(JSON.parse(event.newValue || 'null'), { remote: true, transport: 'web-storage' });
    });
    const extensionChanges = extensionStorageChangedEvent();
    if (extensionChanges) {
        const listener = (changes: Record<string, ExtensionStorageChange>, areaName: string): void => {
            if (areaName !== 'local') return;
            for (const sharedKey of sharedKeys) {
                if (!(sharedKey in changes)) continue;
                enqueueManagedChange(
                    changes[sharedKey]?.newValue,
                    { remote: true, transport: 'extension-storage' },
                );
            }
        };
        extensionChanges.addListener(listener);
        cleanups.push(() => extensionChanges.removeListener(listener));
    }

    return () => runStorageCleanups(cleanups);
}

async function notifyManagedStoredValueChange(
    key: string,
    source: StoredValueChangeSource,
    onChange: (newValue: unknown, source: StoredValueChangeSource) => void,
): Promise<void> {
    const getValue = asyncGmGetValue();
    if (!getValue) return;
    const epoch = await assertRealmManagedStateEpoch(getValue);
    const read = await readManagedGmValue<unknown>(getValue, key, epoch);
    onChange(read.kind === 'found' ? read.value : undefined, source);
}

function addGmValueChangeCleanup(
    cleanups: Array<() => void>,
    key: string,
    listener: GmValueChangeListener,
    errorLabel: string,
): void {
    const ambientAddValueChangeListener = typeof GM_addValueChangeListener === 'function'
        ? GM_addValueChangeListener as GmAddValueChangeListener
        : undefined;
    const addValueChangeListener = ambientAddValueChangeListener ?? (globalThis as {
        GM_addValueChangeListener?: GmAddValueChangeListener;
    }).GM_addValueChangeListener;
    if (typeof addValueChangeListener !== 'function') return;

    try {
        const listenerId = addValueChangeListener(key, listener);
        cleanups.push(() => {
            const ambientRemoveValueChangeListener = typeof GM_removeValueChangeListener === 'function'
                ? GM_removeValueChangeListener as GmRemoveValueChangeListener
                : undefined;
            const removeValueChangeListener = ambientRemoveValueChangeListener ?? (globalThis as {
                GM_removeValueChangeListener?: GmRemoveValueChangeListener;
            }).GM_removeValueChangeListener;
            if (typeof removeValueChangeListener === 'function') removeValueChangeListener(listenerId);
        });
    } catch (error) {
        debugStorageError(errorLabel, key, error);
    }
}

function addWebStorageCleanup(
    cleanups: Array<() => void>,
    key: string,
    listener: (event: StorageEvent) => void,
): void {
    const onStorage = (event: StorageEvent): void => {
        if (event.key !== key) return;
        listener(event);
    };
    window.addEventListener('storage', onStorage);
    cleanups.push(() => window.removeEventListener('storage', onStorage));
}

function runStorageCleanups(cleanups: Array<() => void>): void {
    while (cleanups.length) {
        try {
            cleanups.pop()?.();
        } catch {
            // Best-effort listener cleanup.
        }
    }
}

async function storageKeys(prefixes: string[]): Promise<string[]> {
    const keys = new Set<string>();
    await addPrefixedGmStorageKeys(keys, prefixes);
    addLocalStorageKeys(keys, prefixes);
    await addKnownManagedStorageKeys(keys, prefixes);
    return [...keys].sort();
}

async function addPrefixedGmStorageKeys(keys: Set<string>, prefixes: string[]): Promise<void> {
    const listValues = asyncGmListValues();
    if (!listValues) return;
    try {
        addMatchingStorageKeys(keys, await listValues(), prefixes);
    } catch (error) {
        debugStorageError('GM storage list failed', 'GM_listValues', error);
    }
}

function addLocalStorageKeys(keys: Set<string>, prefixes: string[]): void {
    try {
        const candidates: string[] = [];
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (key) candidates.push(key);
        }
        addMatchingStorageKeys(keys, candidates, prefixes);
    } catch {
        // Ignore localStorage enumeration failures.
    }
}

async function addKnownManagedStorageKeys(keys: Set<string>, prefixes: string[]): Promise<void> {
    for (const key of registeredManagedStorageKeys()) {
        if (storageKeyMatchesPrefix(key, prefixes) && await storedValueExists(key)) keys.add(key);
    }
}

function addMatchingStorageKeys(keys: Set<string>, candidates: string[], prefixes: string[]): void {
    for (const key of candidates) {
        const logicalKey = logicalManagedStorageKey(key);
        if (logicalKey && storageKeyMatchesPrefix(logicalKey, prefixes)) keys.add(logicalKey);
    }
}

function storageKeyMatchesPrefix(key: string, prefixes: string[]): boolean {
    return prefixes.some(prefix => key.startsWith(prefix));
}

async function allStorageKeys(): Promise<string[]> {
    await preflightFactoryResetEpoch();
    const bridgePrivateValuesHandledSeparately = bridgePrivateManagedResetAvailable();
    const keys = new Set<string>();
    const gmEnumeration = await addGmStorageKeys(keys);
    collectWebStorageKeys(localStorage, keys, 'localStorage');
    collectWebStorageKeys(sessionStorage, keys, 'sessionStorage');
    await addKnownStoredKeys(keys, bridgePrivateValuesHandledSeparately);
    if (!gmEnumeration.complete) {
        const incompleteOwners = await addDeclaredGmPrefixKeys(keys);
        if (incompleteOwners.length) {
            throw new ManagedStateResetError([
                gmEnumeration.diagnostic,
                `Missing authoritative prefix inventory: ${incompleteOwners.join(', ')}`,
            ].filter(Boolean).join(' '));
        }
    }
    warnUnregisteredManagedKeys(keys);
    return [...keys].filter(key => !isFactoryResetControlStorageKey(key)).sort();
}

function bridgePrivateManagedResetAvailable(): boolean {
    return !directGmGetValue() && Boolean(getUserscriptGmStorage());
}

async function clearBridgePrivateManagedValuesForReset(): Promise<boolean> {
    if (!bridgePrivateManagedResetAvailable()) return false;
    const bridge = getUserscriptGmStorage();
    if (!bridge) return false;
    try {
        await bridge.clearPrivateManagedValues();
        return true;
    } catch (error) {
        throw new ManagedStateResetError('Factory reset could not clear private managed storage.', { cause: error });
    }
}

function isFactoryResetControlStorageKey(key: string): boolean {
    return FACTORY_RESET_CONTROL_STORAGE_KEYS.has(key)
        || key.startsWith(MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX);
}

async function preflightFactoryResetEpoch(): Promise<void> {
    try {
        await assertRealmManagedStateEpoch(asyncGmGetValue());
    } catch (error) {
        throw new ManagedStateResetError('Factory reset cannot validate the current managed-state epoch.', { cause: error });
    }
}

// Safety-net invariant: every managed key the legacy prefix/GM sweep catches
// should also be declared in the managed-state registry. A key here that the
// registry does not know about means a store escaped registration — the
// factory-reset-invariant test asserts this stays empty, which is the
// enforcement that fails when a future store forgets to register.
export function unregisteredManagedStorageKeys(keys: Iterable<string>): string[] {
    const exactKeys = new Set(registeredManagedStorageKeys());
    const prefixes = managedStateEntries()
        .filter(entry => entry.kind !== 'idb' && entry.prefix)
        .map(entry => entry.prefix as string);
    const unregistered: string[] = [];
    for (const key of keys) {
        if (isFactoryResetControlStorageKey(key)) continue;
        const logicalKey = logicalManagedStorageKey(key) ?? key;
        if (exactKeys.has(logicalKey)) continue;
        if (prefixes.some(prefix => logicalKey.startsWith(prefix))) continue;
        unregistered.push(key);
    }
    return unregistered;
}

function warnUnregisteredManagedKeys(keys: Set<string>): void {
    const unregistered = unregisteredManagedStorageKeys(keys);
    if (unregistered.length) {
        debugStorageError('Managed key not in registry (unregistered store escaping reset)', unregistered.join(','), null);
    }
}

interface GmStorageEnumerationResult {
    readonly complete: boolean;
    readonly diagnostic?: string;
}

async function addGmStorageKeys(keys: Set<string>): Promise<GmStorageEnumerationResult> {
    const listValues = asyncGmListValues();
    if (!listValues) {
        const hasGmBackend = Boolean(asyncGmGetValue() || asyncGmSetValue() || asyncGmDeleteValue());
        return hasGmBackend
            ? { complete: false, diagnostic: 'GM_listValues is unavailable.' }
            : { complete: true };
    }
    try {
        for (const key of await listValues()) keys.add(key);
        return { complete: true };
    } catch (error) {
        debugStorageError('GM storage list failed', 'GM_listValues', error);
        return { complete: false, diagnostic: 'GM_listValues failed.' };
    }
}

async function addDeclaredGmPrefixKeys(keys: Set<string>): Promise<string[]> {
    const incompleteOwners: string[] = [];
    for (const entry of managedStateEntries()) {
        if (entry.kind !== 'gm' || !entry.prefix) continue;
        if (!entry.enumerate) {
            incompleteOwners.push(entry.owner);
            continue;
        }
        try {
            const enumerated = await entry.enumerate();
            if (enumerated.some(key => !key.startsWith(entry.prefix as string))) {
                incompleteOwners.push(entry.owner);
                continue;
            }
            for (const key of enumerated) keys.add(key);
        } catch (error) {
            debugStorageError('Managed prefix enumeration failed', entry.owner, error);
            incompleteOwners.push(entry.owner);
        }
    }
    return [...new Set(incompleteOwners)].sort();
}

async function addKnownStoredKeys(keys: Set<string>, bridgePrivateValuesHandledSeparately: boolean): Promise<void> {
    // The registry is the single source of truth for managed exact keys.
    for (const key of registeredManagedStorageKeys()) {
        if (bridgePrivateValuesHandledSeparately && isPrivateManagedStorageKey(key)) continue;
        if (await resetStoredValueExists(key)) keys.add(key);
    }
}

function collectWebStorageKeys(storage: Storage, keys: Set<string>, label: string): void {
    try {
        for (let index = 0; index < storage.length; index++) {
            const key = storage.key(index);
            if (key && isManagedStorageKey(key)) keys.add(key);
        }
    } catch (error) {
        throw new ManagedStateResetError(`Factory reset could not enumerate ${label}.`, { cause: error });
    }
}

async function resetStoredValueExists(key: string): Promise<boolean> {
    const getValue = asyncGmGetValue();
    if (getValue) {
        try {
            const epoch = await authoritativeManagedStateEpoch(getValue);
            const storageKey = managedStateStorageKey(key, epoch);
            const stored = await getValue<unknown | typeof MISSING>(storageKey, MISSING);
            if (!isMissingSentinel(stored)) return true;
            if (storageKey !== key) {
                const logical = await getValue<unknown | typeof MISSING>(key, MISSING);
                if (!isMissingSentinel(logical)) return true;
            }
        } catch (error) {
            throw new ManagedStateResetError(`Factory reset could not inspect "${key}".`, { cause: error });
        }
    }
    return resetWebStorageHasKey(localStorage, key, 'localStorage')
        || resetWebStorageHasKey(sessionStorage, key, 'sessionStorage');
}

function removeLocalStorageKey(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // Ignore storage failures.
    }
}

function removeSessionStorageKey(key: string): void {
    try {
        sessionStorage.removeItem(key);
    } catch {
        // Ignore storage failures.
    }
}

export async function storedValueExists(key: string): Promise<boolean> {
    const getValue = asyncGmGetValue();
    if (getValue) {
        try {
            const epoch = await assertRealmManagedStateEpoch(getValue);
            const read = await readManagedGmValue<unknown>(getValue, key, epoch);
            if (read.kind === 'found') return true;
            if (read.kind === 'deleted') return false;
        } catch (error) {
            if (isStaleManagedStateEpochError(error)) throw error;
            debugStorageError('GM storage existence check failed', key, error);
        }
    }
    const epoch = managedStateEpochForSynchronousLocalRead();
    return Boolean(epoch && localMirrorBelongsToEpoch(key, epoch)
        && (webStorageHasKey(localStorage, key) || webStorageHasKey(sessionStorage, key)));
}

function webStorageHasKey(storage: Storage, key: string): boolean {
    try {
        return storage.getItem(key) !== null;
    } catch {
        return false;
    }
}

function resetWebStorageHasKey(storage: Storage, key: string, label: string): boolean {
    try {
        return storage.getItem(key) !== null;
    } catch (error) {
        throw new ManagedStateResetError(`Factory reset could not verify ${label} key "${key}".`, { cause: error });
    }
}

function mirrorManagedValueToHostedStorage(key: string, value: unknown, epoch: ManagedStateEpoch): void {
    if (!shouldMirrorManagedValueToHostedStorage(key)) return;
    try {
        writeLocalManagedValueOrThrow(key, value, epoch);
    } catch (error) {
        // The shared GM write is authoritative. A failed startup mirror must
        // never make that successful write appear to have failed, and must
        // never stamp old local bytes as belonging to the current epoch.
        debugStorageError('Hosted localStorage mirror failed', key, error);
    }
}

function cacheManagedStateEpochForLocalFallback(epoch: ManagedStateEpoch): void {
    if (epoch.generation <= 0) {
        removeLocalStorageKey(MANAGED_STATE_EPOCH_KEY);
        return;
    }
    try {
        const local = parseManagedStateEpoch(localStorageGet<unknown>(MANAGED_STATE_EPOCH_KEY, undefined));
        if (sameManagedStateEpoch(local, epoch)) return;
    } catch {
        // Replace malformed or page-written cache state with shared authority.
    }
    localStorageSet(MANAGED_STATE_EPOCH_KEY, epoch);
}

export function cacheManagedValueForHostedStartup(key: string, value: unknown): void {
    const epoch = managedStateEpochForSynchronousLocalRead();
    if (epoch) mirrorManagedValueToHostedStorage(key, value, epoch);
}

function writeLocalManagedValueOrThrow(key: string, value: unknown, epoch: ManagedStateEpoch): void {
    const serialized = localStorageSetOrThrow(key, value);
    recordLocalMirrorProvenance(key, epoch, serialized);
}

function removeLocalManagedValue(key: string): void {
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
    removeLocalMirrorProvenance(key);
}

function localMirrorBelongsToEpoch(key: string, epoch: ManagedStateEpoch): boolean {
    const serialized = recoverableLocalStorageSerializedValue(key);
    if (serialized === null) return false;
    const entry = localMirrorProvenanceRecord()?.values[key];
    if (!entry) return epoch.generation === 0;
    return entry.epoch === managedStateEpochToken(epoch)
        && entry.fingerprint === localMirrorFingerprint(serialized);
}

function recordLocalMirrorProvenance(key: string, epoch: ManagedStateEpoch, serialized: string): void {
    const current = localMirrorProvenanceRecord();
    const next: LocalMirrorProvenance = {
        version: 1,
        values: {
            ...(current?.values ?? {}),
            [key]: {
                epoch: managedStateEpochToken(epoch),
                fingerprint: localMirrorFingerprint(serialized),
            },
        },
    };
    localStorageSetOrThrow(LOCAL_MIRROR_PROVENANCE_KEY, next);
}

function removeLocalMirrorProvenance(key: string): void {
    const current = localMirrorProvenanceRecord();
    if (!current || !(key in current.values)) return;
    const values = { ...current.values };
    delete values[key];
    if (Object.keys(values).length) localStorageSet(LOCAL_MIRROR_PROVENANCE_KEY, { version: 1, values });
    else removeLocalStorageKey(LOCAL_MIRROR_PROVENANCE_KEY);
}

export function restoreLocalFallbackStoredValue(key: string, value: unknown, existed: boolean): void {
    if (managedStateWritesSuppressed()) return;
    if (!existed) return removeLocalManagedValue(key);
    const epoch = managedStateEpochForSynchronousLocalRead();
    if (!epoch) throw storageWriteError(key, 'Managed storage cannot restore its localStorage fallback');
    writeLocalManagedValueOrThrow(key, value, epoch);
}

function localMirrorProvenanceRecord(): LocalMirrorProvenance | null {
    const value = localStorageGet<unknown>(LOCAL_MIRROR_PROVENANCE_KEY, null);
    if (!isPlainRecord(value) || value.version !== 1 || !isPlainRecord(value.values)) return null;
    const values: Record<string, LocalMirrorProvenanceEntry> = {};
    for (const [key, entry] of Object.entries(value.values)) {
        if (!isPlainRecord(entry) || typeof entry.epoch !== 'string' || typeof entry.fingerprint !== 'string') continue;
        values[key] = { epoch: entry.epoch, fingerprint: entry.fingerprint };
    }
    return { version: 1, values };
}

function recoverableLocalStorageSerializedValue(key: string): string | null {
    if (key === 'yomu:prefer-japanese-site-language:v1') return null;
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function localMirrorFingerprint(serialized: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < serialized.length; index++) {
        hash ^= serialized.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `${serialized.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function shouldMirrorManagedValueToHostedStorage(key: string): boolean {
    return isManagedStorageKey(key) && !isPrivateManagedStorageKey(key) && isHostedYomuOrigin();
}

export function isHostedYomuOrigin(): boolean {
    try {
        return isHostedYomuLocation(location.origin, location.hostname, location.pathname);
    } catch {
        return false;
    }
}


async function clearManagedIndexedDatabases(): Promise<void> {
    // The registry is the single source of truth for managed IndexedDB names.
    await Promise.all(registeredManagedIndexedDbNames().map(deleteIndexedDbDatabase));
}

function isManagedBrowserCacheName(name: string): boolean {
    return MANAGED_CACHE_NAME_PREFIXES.some(prefix => name.startsWith(prefix));
}

function isManagedServiceWorkerRegistration(registration: ServiceWorkerRegistration): boolean {
    return [
        registration.scope,
        registration.active?.scriptURL,
        registration.installing?.scriptURL,
        registration.waiting?.scriptURL,
    ].some(hasManagedYomuServiceWorkerPath);
}

function hasManagedYomuServiceWorkerPath(value: string | undefined): boolean {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value, location.href);
        if (!isManagedServiceWorkerOrigin(url)) return false;
        return url.pathname === '/sw.js'
            || url.pathname.endsWith('/sw.js')
            || url.pathname.includes('/study/')
            || url.pathname.includes('/newtab/')
            || url.pathname.includes('/pdf-reader/')
            || url.pathname.includes('/video-player/');
    } catch {
        return value.includes('/study/')
            || value.includes('/newtab/')
            || value.includes('/pdf-reader/')
            || value.includes('/video-player/')
            || value.endsWith('/sw.js');
    }
}

function isManagedServiceWorkerOrigin(url: URL): boolean {
    return url.origin === DOCS_ORIGIN
        || url.hostname === 'hrussellzfac023.github.io'
        || /^(127\.0\.0\.1|localhost|\[::1\])$/.test(url.hostname);
}

function deleteIndexedDbDatabase(name: string): Promise<void> {
    if (typeof indexedDB === 'undefined') return Promise.resolve();
    return new Promise((resolve, reject) => {
        let blockedCause: unknown;
        let settled = false;
        const finish = (complete: () => void): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            complete();
        };
        const timeout = setTimeout(() => finish(() => reject(new ManagedStateResetError(
            blockedCause
                ? `IndexedDB deletion remained blocked for "${name}". Close other よむ tabs and retry.`
                : `IndexedDB deletion timed out for "${name}".`,
            { cause: blockedCause },
        ))), MANAGED_IDB_DELETE_TIMEOUT_MS);
        try {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => finish(resolve);
            request.onerror = error => {
                debugStorageError('IndexedDB delete failed', name, error);
                finish(() => reject(new ManagedStateResetError(`IndexedDB failed to delete "${name}".`, { cause: error })));
            };
            request.onblocked = error => {
                debugStorageError('IndexedDB delete blocked', name, error);
                blockedCause = error;
            };
        } catch (error) {
            debugStorageError('IndexedDB delete threw', name, error);
            finish(() => reject(new ManagedStateResetError(`IndexedDB could not delete "${name}".`, { cause: error })));
        }
    });
}


function asyncGmGetValue(): GmGetValue | null {
    if (typeof GM_getValue === 'function') return GM_getValue as GmGetValue;
    const modern = (globalThis as { GM?: { getValue?: GmGetValue } }).GM?.getValue;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    if (extension) return (async <T>(key: string, fallback: T): Promise<T> => {
        const value = (await extension.get(key))[key];
        return value === undefined ? fallback : value as T;
    }) as GmGetValue;
    const bridge = getUserscriptGmStorage();
    return bridge ? (key, fallback) => bridge.getValue(key, fallback) : null;
}

function directGmGetValue(): GmGetValue | null {
    if (typeof GM_getValue === 'function') return GM_getValue as GmGetValue;
    const modern = (globalThis as { GM?: { getValue?: GmGetValue } }).GM?.getValue;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    return extension ? (async <T>(key: string, fallback: T): Promise<T> => {
        const value = (await extension.get(key))[key];
        return value === undefined ? fallback : value as T;
    }) as GmGetValue : null;
}

function asyncGmSetValue(): GmSetValue | null {
    if (typeof GM_setValue === 'function') return GM_setValue as GmSetValue;
    const modern = (globalThis as { GM?: { setValue?: GmSetValue } }).GM?.setValue;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    if (extension) return (key, value) => extension.set({ [key]: value });
    if (directGmGetValue()) return null;
    const bridge = getUserscriptGmStorage();
    return bridge ? (key, value) => bridge.setValue(key, value) : null;
}

function directGmSetValue(): GmSetValue | null {
    if (typeof GM_setValue === 'function') return GM_setValue as GmSetValue;
    const modern = (globalThis as { GM?: { setValue?: GmSetValue } }).GM?.setValue;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    return extension ? (key, value) => extension.set({ [key]: value }) : null;
}

function asyncGmDeleteValue(): GmDeleteValue | null {
    if (typeof GM_deleteValue === 'function') return GM_deleteValue as GmDeleteValue;
    const modern = (globalThis as { GM?: { deleteValue?: GmDeleteValue } }).GM?.deleteValue;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    if (extension) return key => extension.remove(key);
    if (directGmGetValue()) return null;
    const bridge = getUserscriptGmStorage();
    return bridge ? key => bridge.deleteValue(key) : null;
}

function directGmDeleteValue(): GmDeleteValue | null {
    if (typeof GM_deleteValue === 'function') return GM_deleteValue as GmDeleteValue;
    const modern = (globalThis as { GM?: { deleteValue?: GmDeleteValue } }).GM?.deleteValue;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    return extension ? key => extension.remove(key) : null;
}

function asyncGmListValues(): GmListValues | null {
    if (typeof GM_listValues === 'function') return GM_listValues as GmListValues;
    const directListValues = (globalThis as { GM_listValues?: GmListValues }).GM_listValues;
    if (typeof directListValues === 'function') return directListValues;
    const modern = (globalThis as { GM?: { listValues?: GmListValues } }).GM?.listValues;
    if (typeof modern === 'function') return modern.bind((globalThis as { GM?: unknown }).GM);
    const extension = extensionStorageArea();
    if (extension) return async () => extension.getKeys ? extension.getKeys() : Object.keys(await extension.get(null));
    if (directGmGetValue()) return null;
    const bridge = getUserscriptGmStorage();
    return bridge ? () => bridge.listValues() : null;
}

function extensionStorageArea(): ExtensionStorageArea | null {
    const candidate = (globalThis as unknown as {
        browser?: { runtime?: { id?: string }; storage?: { local?: ExtensionStorageArea } };
        chrome?: { runtime?: { id?: string }; storage?: { local?: ExtensionStorageArea } };
    });
    const browser = candidate.browser;
    if (browser?.runtime?.id && browser.storage?.local) return browser.storage.local;
    const chrome = candidate.chrome;
    if (chrome?.runtime?.id && chrome.storage?.local) return chrome.storage.local;
    return null;
}

function extensionStorageChangedEvent(): ExtensionStorageChangedEvent | null {
    const candidate = (globalThis as unknown as {
        browser?: { runtime?: { id?: string }; storage?: { onChanged?: ExtensionStorageChangedEvent } };
        chrome?: { runtime?: { id?: string }; storage?: { onChanged?: ExtensionStorageChangedEvent } };
    });
    if (candidate.browser?.runtime?.id && candidate.browser.storage?.onChanged) return candidate.browser.storage.onChanged;
    if (candidate.chrome?.runtime?.id && candidate.chrome.storage?.onChanged) return candidate.chrome.storage.onChanged;
    return null;
}

function normalizeFactoryResetSignal(signal: FactoryResetSignal): FactoryResetSignal {
    return {
        id: normalizedFactoryResetId(signal.id),
        phase: normalizedFactoryResetPhase(signal.phase),
        at: normalizedFactoryResetAt(signal.at),
        href: normalizedFactoryResetHref(signal.href),
    };
}

function normalizedFactoryResetId(id: string): string {
    return String(id || createFactoryResetId());
}

function normalizedFactoryResetPhase(phase: FactoryResetSignalPhase): FactoryResetSignalPhase {
    return phase === 'complete' ? 'complete' : 'prepare';
}

function normalizedFactoryResetAt(at: number): number {
    return typeof at === 'number' && Number.isFinite(at) ? at : Date.now();
}

function normalizedFactoryResetHref(href: string): string {
    return typeof href === 'string' ? href : location.href;
}

function parseFactoryResetSignal(value: unknown): FactoryResetSignal | null {
    const parsed = typeof value === 'string' ? parseJsonRecord(value) : value;
    if (!isFactoryResetSignalRecord(parsed)) return null;
    const record = parsed;
    if (!isValidFactoryResetPhase(record.phase)) return null;
    return {
        id: record.id,
        phase: record.phase,
        at: factoryResetSignalTime(record.at),
        href: factoryResetSignalHref(record.href),
    };
}

function factoryResetSignalTime(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

function factoryResetSignalHref(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function isFactoryResetSignalRecord(value: unknown): value is Partial<FactoryResetSignal> & { id: string } {
    return Boolean(value
        && typeof value === 'object'
        && !Array.isArray(value)
        && typeof (value as Partial<FactoryResetSignal>).id === 'string'
        && (value as Partial<FactoryResetSignal>).id?.trim());
}

function isValidFactoryResetPhase(value: unknown): value is FactoryResetSignal['phase'] {
    return value === 'prepare' || value === 'complete';
}

function parseJsonRecord(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function publishBroadcastFactoryResetSignal(signal: FactoryResetSignal): void {
    if (typeof BroadcastChannel !== 'function') return;
    try {
        const channel = new BroadcastChannel(FACTORY_RESET_CHANNEL_NAME);
        channel.postMessage(signal);
        channel.close();
    } catch (error) {
        debugStorageError('Broadcast factory reset publish failed', FACTORY_RESET_CHANNEL_NAME, error);
    }
}

async function assertManagedStateMutationFence(
    getValue: GmGetValue | null,
    expected: ManagedStateEpoch,
): Promise<void> {
    if (managedStateWritesSuppressed()) throw new Error('Managed state writes are suppressed during factory reset.');
    const before = getValue
        ? await authoritativeManagedStateEpoch(getValue)
        : parseManagedStateEpoch(localStorageGet<unknown>(MANAGED_STATE_EPOCH_KEY, undefined));
    if (!sameManagedStateEpoch(expected, before)) throw new StaleManagedStateEpochError(expected, before);

    const rawSignal = getValue
        ? await getValue<unknown | typeof MISSING>(FACTORY_RESET_SIGNAL_KEY, MISSING)
        : localStorageGet<unknown | typeof MISSING>(FACTORY_RESET_SIGNAL_KEY, MISSING);
    const signal = isMissingSentinel(rawSignal) ? null : parseFactoryResetSignal(rawSignal);
    if (signal?.phase === 'prepare' || managedStateWritesSuppressed()) {
        throw new Error('Managed state writes are suppressed during factory reset.');
    }

    const after = getValue
        ? await authoritativeManagedStateEpoch(getValue)
        : parseManagedStateEpoch(localStorageGet<unknown>(MANAGED_STATE_EPOCH_KEY, undefined));
    if (!sameManagedStateEpoch(expected, after)) throw new StaleManagedStateEpochError(expected, after);
}

function debugStorageError(message: string, key: string, error: unknown): void {
    if (typeof console !== 'undefined') console.debug('[Yomu] Storage', message, { key, error });
}
