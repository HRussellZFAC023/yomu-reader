import { isSettingsAuthorityStorageKey } from '../settings/settings-authority-storage-keys';
import { isHostedYomuOrigin } from './hosted-storage-fallback';
import {
    captureLocalFallbackStoredState,
    localFallbackStoredStatesMatch,
    restoreLocalFallbackStoredState,
    type LocalFallbackStoredState,
} from './local-mirror-provenance';

export interface ManagedStoredValueState {
    readonly existed: boolean;
    readonly value: unknown;
}

export interface ManagedWriteReceipt {
    readonly key: string;
    readonly previous: ManagedStoredValueState;
}

export interface ManagedWriteJournal {
    capture(key: string): Promise<ManagedWriteReceipt>;
    adoptInterrupted(
        receipt: ManagedWriteReceipt,
        previous: ManagedStoredValueState,
        localPrevious?: ManagedStoredValueState,
    ): void;
    write(receipt: ManagedWriteReceipt, value: unknown): Promise<void>;
    restore(receipt: ManagedWriteReceipt, message: string): Promise<void>;
    commit(): void;
    rollback(message: string, stopOnError?: boolean): Promise<void>;
    reject(error: unknown, message: string, stopOnError?: boolean): Promise<never>;
}

export interface ManagedWriteStorageBoundary {
    readAuthority(key: string): Promise<ManagedStoredValueState>;
    writeAuthority(key: string, value: unknown, preserveLocalFallback: boolean): Promise<void>;
    restoreAuthority(key: string, target: ManagedStoredValueState): Promise<void>;
    readLocalTarget(key: string): ManagedStoredValueState;
    restoreLocalTarget(key: string, target: ManagedStoredValueState): void;
}

interface ManagedWriteReceiptRecord extends ManagedWriteReceipt {
    authorityTarget: ManagedStoredValueState;
    localTarget: ManagedStoredValueState;
    localBefore?: LocalFallbackStoredState;
    readonly stagedAuthority: unknown[];
    readonly stagedLocal: LocalFallbackStoredState[];
    interrupted: boolean;
    active: boolean;
}

class ConcreteManagedWriteJournal implements ManagedWriteJournal {
    private readonly receipts = new Map<string, ManagedWriteReceiptRecord>();
    private readonly active: ManagedWriteReceiptRecord[] = [];
    private open = true;

    constructor(
        private readonly storage: ManagedWriteStorageBoundary,
        private readonly preserveLocalFallbackOnWriteFailure: boolean,
    ) {}

    async capture(key: string): Promise<ManagedWriteReceipt> {
        const existing = this.receipts.get(key);
        if (existing) return existing;
        const previous = await this.storage.readAuthority(key);
        const observedLocal = shouldTrackExactLocalFallback(key)
            ? captureLocalFallbackStoredState(key)
            : undefined;
        const receipt: ManagedWriteReceiptRecord = {
            key,
            previous,
            authorityTarget: previous,
            localTarget: observedLocal ? previous : { existed: false, value: null },
            localBefore: observedLocal,
            stagedAuthority: [],
            stagedLocal: [],
            interrupted: false,
            active: false,
        };
        this.receipts.set(key, receipt);
        return receipt;
    }

    adoptInterrupted(
        receipt: ManagedWriteReceipt,
        previous: ManagedStoredValueState,
        localPrevious = previous,
    ): void {
        const record = receipt as ManagedWriteReceiptRecord;
        record.authorityTarget = previous;
        record.localTarget = localPrevious;
        record.interrupted = true;
        if (record.localBefore) rememberLocalStage(record, record.localBefore, record.previous);
        this.activate(record);
    }

    async write(receipt: ManagedWriteReceipt, value: unknown): Promise<void> {
        const record = receipt as ManagedWriteReceiptRecord;
        this.activate(record);
        const attempted = { existed: true, value };
        record.stagedAuthority.push(value);
        try {
            await this.storage.writeAuthority(
                record.key,
                value,
                this.preserveLocalFallbackOnWriteFailure,
            );
        } finally {
            if (record.localBefore) {
                rememberLocalStage(record, captureLocalFallbackStoredState(record.key), attempted);
            }
        }
    }

    async restore(receipt: ManagedWriteReceipt, message: string): Promise<void> {
        const record = receipt as ManagedWriteReceiptRecord;
        this.activate(record);
        const errors = await rollbackManagedWrite(
            this.storage,
            record,
            this.preserveLocalFallbackOnWriteFailure,
        );
        if (errors.length) throw new AggregateError(errors, message);
    }

    commit(): void {
        this.open = false;
    }

    async rollback(message: string, stopOnError = false): Promise<void> {
        if (!this.open) return;
        this.open = false;
        const errors = await rollbackManagedWrites(
            this.storage,
            this.active,
            stopOnError,
            this.preserveLocalFallbackOnWriteFailure,
        );
        if (errors.length) throw new AggregateError(errors, `${message} for ${errors.length} operation(s).`);
    }

    async reject(error: unknown, message: string, stopOnError = false): Promise<never> {
        if (!this.open) throw error;
        this.open = false;
        const rollbackErrors = await rollbackManagedWrites(
            this.storage,
            this.active,
            stopOnError,
            this.preserveLocalFallbackOnWriteFailure,
        );
        if (!rollbackErrors.length) throw error;
        throw new AggregateError(
            [error, ...rollbackErrors],
            `${message} and ${rollbackErrors.length} rollback operation(s) also failed.`,
        );
    }

    private activate(receipt: ManagedWriteReceiptRecord): void {
        if (!this.open) throw new Error('Managed storage write journal is already closed.');
        if (receipt.active) return;
        receipt.active = true;
        this.active.push(receipt);
    }
}

export function createConcreteManagedWriteJournal(
    storage: ManagedWriteStorageBoundary,
    preserveLocalFallbackOnWriteFailure = false,
): ManagedWriteJournal {
    return new ConcreteManagedWriteJournal(storage, preserveLocalFallbackOnWriteFailure);
}

async function rollbackManagedWrites(
    storage: ManagedWriteStorageBoundary,
    receipts: readonly ManagedWriteReceiptRecord[],
    stopOnError: boolean,
    forceAuthorityRestore: boolean,
): Promise<unknown[]> {
    const errors: unknown[] = [];
    for (let index = receipts.length - 1; index >= 0; index--) {
        const current = await rollbackManagedWrite(storage, receipts[index]!, forceAuthorityRestore);
        errors.push(...current);
        if (stopOnError && current.length) break;
    }
    return errors;
}

async function rollbackManagedWrite(
    storage: ManagedWriteStorageBoundary,
    receipt: ManagedWriteReceiptRecord,
    forceAuthorityRestore: boolean,
): Promise<unknown[]> {
    const errors: unknown[] = [];
    const currentLocal = captureManagedWriteLocal(receipt, errors);
    await rollbackManagedWriteAuthority(storage, receipt, forceAuthorityRestore, errors);
    rollbackManagedWriteLocal(storage, receipt, currentLocal, errors);
    return errors;
}

function captureManagedWriteLocal(
    receipt: ManagedWriteReceiptRecord,
    errors: unknown[],
): LocalFallbackStoredState | undefined {
    if (!receipt.localBefore) return undefined;
    try {
        return captureLocalFallbackStoredState(receipt.key);
    } catch (error) {
        errors.push(error);
        return undefined;
    }
}

async function rollbackManagedWriteAuthority(
    storage: ManagedWriteStorageBoundary,
    receipt: ManagedWriteReceiptRecord,
    forceAuthorityRestore: boolean,
    errors: unknown[],
): Promise<void> {
    const current = await readRollbackAuthority(storage, receipt.key, errors);
    if (!current) return;
    if (!authorityRestoreIsRequired(receipt, current, forceAuthorityRestore)) return;
    if (!authorityRollbackIsSafe(receipt, current)) {
        errors.push(managedWriteConflict(receipt.key, 'Managed storage value'));
        return;
    }
    await restoreRollbackAuthority(storage, receipt, errors);
}

function authorityRestoreIsRequired(
    receipt: ManagedWriteReceiptRecord,
    current: ManagedStoredValueState,
    forceAuthorityRestore: boolean,
): boolean {
    return forceAuthorityRestore
        || !managedStoredValueStatesMatch(current, receipt.authorityTarget);
}

function authorityRollbackIsSafe(
    receipt: ManagedWriteReceiptRecord,
    current: ManagedStoredValueState,
): boolean {
    return managedStoredValueStatesMatch(current, receipt.authorityTarget)
        || authorityWasStaged(receipt, current);
}

async function readRollbackAuthority(
    storage: ManagedWriteStorageBoundary,
    key: string,
    errors: unknown[],
): Promise<ManagedStoredValueState | undefined> {
    try {
        return await storage.readAuthority(key);
    } catch (error) {
        errors.push(error);
        return undefined;
    }
}

async function restoreRollbackAuthority(
    storage: ManagedWriteStorageBoundary,
    receipt: ManagedWriteReceiptRecord,
    errors: unknown[],
): Promise<void> {
    try {
        await storage.restoreAuthority(receipt.key, receipt.authorityTarget);
    } catch (error) {
        errors.push(error);
    }
}

function rollbackManagedWriteLocal(
    storage: ManagedWriteStorageBoundary,
    receipt: ManagedWriteReceiptRecord,
    current: LocalFallbackStoredState | undefined,
    errors: unknown[],
): void {
    try {
        restoreManagedWriteLocal(storage, receipt, current);
    } catch (error) {
        errors.push(error);
    }
}

function restoreManagedWriteLocal(
    storage: ManagedWriteStorageBoundary,
    receipt: ManagedWriteReceiptRecord,
    current: LocalFallbackStoredState | undefined,
): void {
    if (!receipt.localBefore) return restoreUntrackedWriteLocal(storage, receipt);
    if (!current) return;
    assertLocalStateCanRollback(storage, receipt, current);
    if (!receipt.interrupted) return restoreLocalFallbackStoredState(receipt.key, receipt.localBefore);
    storage.restoreLocalTarget(receipt.key, receipt.localTarget);
}

function restoreUntrackedWriteLocal(
    storage: ManagedWriteStorageBoundary,
    receipt: ManagedWriteReceiptRecord,
): void {
    if (!receipt.interrupted) storage.restoreLocalTarget(receipt.key, receipt.localTarget);
}

function assertLocalStateCanRollback(
    storage: ManagedWriteStorageBoundary,
    receipt: ManagedWriteReceiptRecord,
    current: LocalFallbackStoredState,
): void {
    if (localStateCanRollback(storage, receipt, current)) return;
    throw managedWriteConflict(receipt.key, 'Local fallback value');
}

function localStateCanRollback(
    storage: ManagedWriteStorageBoundary,
    receipt: ManagedWriteReceiptRecord,
    current: LocalFallbackStoredState,
): boolean {
    if (localStateWasCaptured(receipt, current)) return true;
    return receipt.interrupted
        && managedStoredValueStatesMatch(storage.readLocalTarget(receipt.key), receipt.localTarget);
}

function localStateWasCaptured(
    receipt: ManagedWriteReceiptRecord,
    current: LocalFallbackStoredState,
): boolean {
    return Boolean(receipt.localBefore && localFallbackStoredStatesMatch(current, receipt.localBefore))
        || receipt.stagedLocal.some(state => localFallbackStoredStatesMatch(current, state));
}

function authorityWasStaged(receipt: ManagedWriteReceiptRecord, current: ManagedStoredValueState): boolean {
    if (managedStoredValueStatesMatch(current, receipt.previous)) return true;
    return current.existed && receipt.stagedAuthority.some(value => managedStoredValuesMatch(current.value, value));
}

function rememberLocalStage(
    receipt: ManagedWriteReceiptRecord,
    local: LocalFallbackStoredState,
    authority: ManagedStoredValueState,
): void {
    if (!rawLocalStateRepresentsAuthority(local, authority)) return;
    if (!receipt.stagedLocal.some(item => localFallbackStoredStatesMatch(item, local))) {
        receipt.stagedLocal.push(local);
    }
}

function rawLocalStateRepresentsAuthority(
    local: LocalFallbackStoredState,
    authority: ManagedStoredValueState,
): boolean {
    if (!authority.existed) return local.serializedValue === null;
    if (local.serializedValue === null) return false;
    try {
        return managedStoredValuesMatch(JSON.parse(local.serializedValue), authority.value);
    } catch {
        return false;
    }
}

function shouldTrackExactLocalFallback(key: string): boolean {
    return !isSettingsAuthorityStorageKey(key) || isHostedYomuOrigin();
}

function managedStoredValueStatesMatch(
    left: ManagedStoredValueState,
    right: ManagedStoredValueState,
): boolean {
    return left.existed === right.existed
        && (!left.existed || managedStoredValuesMatch(left.value, right.value));
}

function managedStoredValuesMatch(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

function managedWriteConflict(key: string, label: string): Error {
    return new Error(`${label} "${key}" changed after staging; rollback left the newer value intact.`);
}
