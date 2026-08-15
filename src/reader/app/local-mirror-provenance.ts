import { isRecord } from '../core/object-utils';
import {
    MANAGED_STATE_EPOCH_KEY,
    managedStateEpochToken,
    parseManagedStateEpoch,
    sameManagedStateEpoch,
    type ManagedStateEpoch,
} from './managed-state-epoch';
import {
    localStorageGet,
    localStorageSet,
    localStorageSetOrThrow,
    removeLocalStorageKey,
    removeSessionStorageKey,
    storageWriteError,
} from './storage-local-values';

const PROVENANCE_KEY = 'yomu:local-storage-provenance:v1';
const JAPANESE_SITE_LANGUAGE_KEY = 'yomu:prefer-japanese-site-language:v1';

interface LocalMirrorProvenanceEntry {
    readonly epoch: string;
    readonly fingerprint: string;
}

export interface LocalFallbackStoredState {
    readonly serializedValue: string | null;
    readonly provenance: LocalMirrorProvenanceEntry | null;
}

export function captureLocalFallbackStoredState(key: string): LocalFallbackStoredState {
    try {
        const serializedValue = localStorage.getItem(key);
        const entry = provenanceValues()[key];
        return {
            serializedValue,
            provenance: entry ? { ...entry } : null,
        };
    } catch (error) {
        throw storageWriteError(key, 'Local fallback read failed', error);
    }
}

export function localFallbackStoredStatesMatch(
    left: LocalFallbackStoredState,
    right: LocalFallbackStoredState | undefined,
): boolean {
    return Boolean(right
        && left.serializedValue === right.serializedValue
        && provenanceEntriesMatch(left.provenance, right.provenance));
}

function provenanceEntriesMatch(
    left: LocalMirrorProvenanceEntry | null,
    right: LocalMirrorProvenanceEntry | null,
): boolean {
    return left === null
        ? right === null
        : right !== null && left.epoch === right.epoch && left.fingerprint === right.fingerprint;
}

export function restoreLocalFallbackStoredState(key: string, state: LocalFallbackStoredState): void {
    try {
        if (state.serializedValue === null) localStorage.removeItem(key);
        else localStorage.setItem(key, state.serializedValue);
        if (localStorage.getItem(key) !== state.serializedValue) throw new Error('read-back did not match');
    } catch (error) {
        throw storageWriteError(key, 'Local fallback restore failed', error);
    }
    updateProvenance(key, state.provenance, true);
}

export function writeLocalManagedValueOrThrow(key: string, value: unknown, epoch: ManagedStateEpoch): void {
    const previous = captureLocalFallbackStoredState(key);
    try {
        const serialized = localStorageSetOrThrow(key, value);
        updateProvenance(key, {
            epoch: managedStateEpochToken(epoch),
            fingerprint: fingerprint(serialized),
        }, true);
    } catch (error) {
        try {
            restoreLocalFallbackStoredState(key, previous);
        } catch (rollbackError) {
            throw new AggregateError(
                [error, rollbackError],
                `Local fallback publication and rollback failed for "${key}".`,
            );
        }
        throw error;
    }
}

export function mirrorLocalManagedValue(
    key: string,
    value: unknown,
    epoch: ManagedStateEpoch,
    onFailure: (error: unknown) => void,
): void {
    try {
        writeLocalManagedValueOrThrow(key, value, epoch);
    } catch (error) {
        onFailure(error);
    }
}

export function removeLocalManagedValue(key: string): void {
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
    updateProvenance(key, null);
}

export function restoreLocalFallbackStoredValueAtEpoch(
    key: string,
    value: unknown,
    existed: boolean,
    epoch: ManagedStateEpoch | null,
): void {
    if (!existed) return removeLocalManagedValue(key);
    if (!epoch) throw storageWriteError(key, 'Managed storage cannot restore its localStorage fallback');
    writeLocalManagedValueOrThrow(key, value, epoch);
}

export function cacheManagedStateEpochForLocalFallback(epoch: ManagedStateEpoch): void {
    if (epoch.generation <= 0) return removeLocalStorageKey(MANAGED_STATE_EPOCH_KEY);
    try {
        const cached = parseManagedStateEpoch(localStorageGet<unknown>(MANAGED_STATE_EPOCH_KEY, undefined));
        if (sameManagedStateEpoch(cached, epoch)) return;
    } catch {
        // Replace malformed or page-written cache state with shared authority.
    }
    localStorageSet(MANAGED_STATE_EPOCH_KEY, epoch);
}

export function localMirrorBelongsToEpoch(key: string, epoch: ManagedStateEpoch): boolean {
    const serialized = recoverableSerializedValue(key);
    if (serialized === null) return false;
    const entry = provenanceValues()[key];
    return entry
        ? entry.epoch === managedStateEpochToken(epoch) && entry.fingerprint === fingerprint(serialized)
        : epoch.generation === 0;
}

export function removeLocalMirrorProvenance(key: string): void {
    updateProvenance(key, null);
}

function updateProvenance(key: string, entry: LocalMirrorProvenanceEntry | null, strict = false): void {
    const values = provenanceValues();
    if (!mutateProvenance(values, key, entry)) return;
    persistProvenance(values, strict);
}

function mutateProvenance(
    values: Record<string, LocalMirrorProvenanceEntry>,
    key: string,
    entry: LocalMirrorProvenanceEntry | null,
): boolean {
    if (entry) {
        values[key] = entry;
        return true;
    }
    if (!(key in values)) return false;
    delete values[key];
    return true;
}

function persistProvenance(values: Record<string, LocalMirrorProvenanceEntry>, strict: boolean): void {
    if (Object.keys(values).length) {
        const value = { version: 1, values };
        if (strict) localStorageSetOrThrow(PROVENANCE_KEY, value);
        else localStorageSet(PROVENANCE_KEY, value);
        return;
    }
    removeLocalStorageKey(PROVENANCE_KEY);
}

function provenanceValues(): Record<string, LocalMirrorProvenanceEntry> {
    const stored = localStorageGet<unknown>(PROVENANCE_KEY, null);
    if (!isStoredProvenance(stored)) return {};
    const values: Record<string, LocalMirrorProvenanceEntry> = {};
    for (const [key, value] of Object.entries(stored.values)) {
        const normalized = normalizedEntry(value);
        if (normalized) values[key] = normalized;
    }
    return values;
}

function isStoredProvenance(value: unknown): value is { version: 1; values: Record<string, unknown> } {
    if (!isRecord(value) || value.version !== 1) return false;
    return isRecord(value.values);
}

function normalizedEntry(value: unknown): LocalMirrorProvenanceEntry | null {
    if (!isRecord(value)) return null;
    if (typeof value.epoch !== 'string') return null;
    if (typeof value.fingerprint !== 'string') return null;
    return { epoch: value.epoch, fingerprint: value.fingerprint };
}

function recoverableSerializedValue(key: string): string | null {
    if (key === JAPANESE_SITE_LANGUAGE_KEY) return null;
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function fingerprint(serialized: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < serialized.length; index++) {
        hash = Math.imul(hash ^ serialized.charCodeAt(index), 0x01000193);
    }
    return `${serialized.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
