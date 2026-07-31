export const MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX = 'yomu:state-epoch-lease:v1:';
export const STORAGE_LEASE_KEY_PREFIX = 'yomu:lease:';

export interface GmStorageLeaseOptions {
    readonly leaseMs?: number;
    readonly pollMs?: number;
    readonly timeoutMs?: number;
}

export type GmLeaseGetValue = <T>(key: string, defaultValue: T) => T | Promise<T>;
export type GmLeaseSetValue = (key: string, value: unknown) => void | Promise<void>;
export type GmLeaseDeleteValue = (key: string) => void | Promise<void>;
export type GmLeaseListValues = () => string[] | Promise<string[]>;

export interface GmStorageLeaseBackend {
    readonly getValue: GmLeaseGetValue | null;
    readonly setValue: GmLeaseSetValue | null;
    readonly deleteValue: GmLeaseDeleteValue | null;
    readonly listValues: GmLeaseListValues | null;
}

export interface GmStorageLeaseEnvironment<Epoch> {
    readonly backend: GmStorageLeaseBackend;
    readonly captureEpoch: (getValue: GmLeaseGetValue | null) => Promise<Epoch>;
    readonly assertMutationFence: (getValue: GmLeaseGetValue | null, epoch: Epoch) => Promise<void>;
    readonly epochToken: (epoch: Epoch) => string;
}

interface StorageLeaseClaim {
    readonly version: 1;
    readonly claimId: string;
    readonly owner: string;
    readonly epoch: string;
    readonly choosing: boolean;
    readonly ticket: number;
    readonly leaseUntil: number;
}

/**
 * Serializes a storage transaction across tabs, userscript worlds, and packaged
 * extension contexts. Each contender owns a separate GM key, so acquiring the
 * lease never relies on an unsafe read-modify-write of one shared lock value.
 * Expired claims are ignored, allowing recovery after a tab or process dies.
 */
export async function withGmStorageLeaseCore<T, Epoch>(
    name: string,
    operation: () => Promise<T>,
    options: GmStorageLeaseOptions,
    environment: GmStorageLeaseEnvironment<Epoch>,
): Promise<T> {
    const { getValue, setValue, deleteValue, listValues } = environment.backend;
    if (!getValue || !setValue || !deleteValue || !listValues) {
        return withWebStorageLock(name, async () => {
            const epoch = await environment.captureEpoch(getValue);
            await environment.assertMutationFence(getValue, epoch);
            const result = await operation();
            await environment.assertMutationFence(getValue, epoch);
            return result;
        });
    }

    const epoch = await environment.captureEpoch(getValue);
    await environment.assertMutationFence(getValue, epoch);
    const leaseMs = boundedLeaseOption(options.leaseMs, 60_000, 1_000, 10 * 60_000);
    const pollMs = boundedLeaseOption(options.pollMs, 20, 1, 1_000);
    const timeoutMs = boundedLeaseOption(options.timeoutMs, 90_000, leaseMs, 15 * 60_000);
    const owner = createStorageCoordinationId();
    const claimId = createStorageCoordinationId();
    const prefix = `${STORAGE_LEASE_KEY_PREFIX}${normalizedStorageLeaseName(name)}:`;
    const key = `${prefix}${owner}`;
    const startedAt = Date.now();
    let claim: StorageLeaseClaim = {
        version: 1,
        claimId,
        owner,
        epoch: environment.epochToken(epoch),
        choosing: true,
        ticket: 0,
        leaseUntil: startedAt + leaseMs,
    };

    const writeClaim = async (nextClaim: StorageLeaseClaim): Promise<void> => {
        await environment.assertMutationFence(getValue, epoch);
        try {
            await setValue(key, nextClaim);
            await environment.assertMutationFence(getValue, epoch);
            await assertStorageLeaseClaimOwned(key, nextClaim, getValue);
        } catch (error) {
            await deleteStorageLeaseClaimIfOwned(key, nextClaim, getValue, deleteValue).catch(cleanupError => {
                debugStorageLeaseError('GM storage lease rollback failed', key, cleanupError);
            });
            throw error;
        }
    };

    await writeClaim(claim);
    try {
        const initialClaims = await readStorageLeaseClaims(
            prefix,
            listValues,
            getValue,
            environment.epochToken(epoch),
            Date.now(),
        );
        const highestTicket = initialClaims.reduce((highest, item) => Math.max(highest, item.ticket), 0);
        claim = { ...claim, choosing: false, ticket: highestTicket + 1, leaseUntil: Date.now() + leaseMs };
        await writeClaim(claim);

        while (true) {
            await environment.assertMutationFence(getValue, epoch);
            const now = Date.now();
            if (now - startedAt >= timeoutMs) throw new Error(`Timed out waiting for storage lease: ${name}`);
            const claims = await readStorageLeaseClaims(
                prefix,
                listValues,
                getValue,
                environment.epochToken(epoch),
                now,
            );
            const blocked = claims.some(other => other.owner !== owner && (
                other.choosing
                || other.ticket < claim.ticket
                || (other.ticket === claim.ticket && other.owner.localeCompare(owner) < 0)
            ));
            if (!blocked) break;
            if (claim.leaseUntil - now <= leaseMs / 2) {
                claim = { ...claim, leaseUntil: now + leaseMs };
                await writeClaim(claim);
            }
            await storageLeaseDelay(pollMs);
        }

        let renewalStopped = false;
        let renewal = Promise.resolve();
        let leaseLost: unknown;
        let leaseWasLost = false;
        const renewalTimer = setInterval(() => {
            renewal = renewal.then(async () => {
                if (renewalStopped || leaseLost) return;
                await assertStorageLeaseClaimOwned(key, claim, getValue);
                claim = { ...claim, leaseUntil: Date.now() + leaseMs };
                await writeClaim(claim);
            }).catch(error => {
                leaseLost = error;
                leaseWasLost = true;
                debugStorageLeaseError('GM storage lease renewal failed', key, error);
            });
        }, Math.max(250, Math.floor(leaseMs / 3)));
        let result!: T;
        let operationError: unknown;
        let operationFailed = false;
        try {
            await environment.assertMutationFence(getValue, epoch);
            await assertStorageLeaseClaimOwned(key, claim, getValue);
            result = await operation();
            await environment.assertMutationFence(getValue, epoch);
            await assertStorageLeaseClaimOwned(key, claim, getValue);
        } catch (error) {
            operationFailed = true;
            operationError = error;
        } finally {
            renewalStopped = true;
            clearInterval(renewalTimer);
            await renewal;
        }
        if (operationFailed) throw operationError;
        if (leaseWasLost) throw leaseLost;
        return result;
    } finally {
        try {
            await deleteStorageLeaseClaimIfOwned(key, claim, getValue, deleteValue);
        } catch (error) {
            debugStorageLeaseError('GM storage lease release failed', key, error);
        }
    }
}

export interface ManagedStateEpochControlLeaseEnvironment {
    readonly backend: GmStorageLeaseBackend;
}

/**
 * Serializes the epoch register itself without consulting the epoch being
 * protected. The control claims are raw and require authoritative GM
 * enumeration so concurrent reset commits cannot race the epoch register.
 */
export async function withManagedStateEpochControlLeaseCore<T>(
    operation: () => Promise<T>,
    environment: ManagedStateEpochControlLeaseEnvironment,
): Promise<T> {
    const { getValue, setValue, deleteValue, listValues } = environment.backend;
    const available = [getValue, setValue, deleteValue, listValues].filter(Boolean).length;
    if (available === 0) return withWebStorageLock('managed-state-epoch-control', operation);
    if (!getValue || !setValue || !deleteValue || !listValues) {
        throw new Error('Managed storage cannot serialize epoch reconciliation without GM_listValues.');
    }

    const leaseMs = 30_000;
    const pollMs = 10;
    const timeoutMs = 90_000;
    const owner = createStorageCoordinationId();
    const key = `${MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX}${owner}`;
    const startedAt = Date.now();
    let claim: StorageLeaseClaim = {
        version: 1,
        claimId: createStorageCoordinationId(),
        owner,
        epoch: 'epoch-control:v1',
        choosing: true,
        ticket: 0,
        leaseUntil: startedAt + leaseMs,
    };

    const writeClaim = async (nextClaim: StorageLeaseClaim): Promise<void> => {
        try {
            await setValue(key, nextClaim);
            await assertStorageLeaseClaimOwned(key, nextClaim, getValue);
        } catch (error) {
            await deleteStorageLeaseClaimIfOwned(key, nextClaim, getValue, deleteValue).catch(cleanupError => {
                debugStorageLeaseError('Raw GM storage lease rollback failed', key, cleanupError);
            });
            throw error;
        }
    };

    await writeClaim(claim);
    try {
        const initialClaims = await readStorageLeaseClaims(
            MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX,
            listValues,
            getValue,
            claim.epoch,
            Date.now(),
        );
        const highestTicket = initialClaims.reduce((highest, item) => Math.max(highest, item.ticket), 0);
        claim = { ...claim, choosing: false, ticket: highestTicket + 1, leaseUntil: Date.now() + leaseMs };
        await writeClaim(claim);

        while (true) {
            const now = Date.now();
            if (now - startedAt >= timeoutMs) throw new Error('Timed out waiting for the managed-state epoch lease.');
            const claims = await readStorageLeaseClaims(
                MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX,
                listValues,
                getValue,
                claim.epoch,
                now,
            );
            const blocked = claims.some(other => other.owner !== owner && (
                other.choosing
                || other.ticket < claim.ticket
                || (other.ticket === claim.ticket && other.owner.localeCompare(owner) < 0)
            ));
            if (!blocked) break;
            if (claim.leaseUntil - now <= leaseMs / 2) {
                claim = { ...claim, leaseUntil: now + leaseMs };
                await writeClaim(claim);
            }
            await storageLeaseDelay(pollMs);
        }

        let stopped = false;
        let lost = false;
        let lostError: unknown;
        let renewal = Promise.resolve();
        const timer = setInterval(() => {
            renewal = renewal.then(async () => {
                if (stopped || lost) return;
                await assertStorageLeaseClaimOwned(key, claim, getValue);
                claim = { ...claim, leaseUntil: Date.now() + leaseMs };
                await writeClaim(claim);
            }).catch(error => {
                lost = true;
                lostError = error;
            });
        }, Math.floor(leaseMs / 3));

        let result!: T;
        let failed = false;
        let operationError: unknown;
        try {
            await assertStorageLeaseClaimOwned(key, claim, getValue);
            result = await operation();
            await assertStorageLeaseClaimOwned(key, claim, getValue);
        } catch (error) {
            failed = true;
            operationError = error;
        } finally {
            stopped = true;
            clearInterval(timer);
            await renewal;
        }
        if (failed) throw operationError;
        if (lost) throw lostError;
        return result;
    } finally {
        await deleteStorageLeaseClaimIfOwned(key, claim, getValue, deleteValue)
            .catch(error => debugStorageLeaseError('Managed-state epoch lease release failed', key, error));
    }
}

async function readStorageLeaseClaims(
    prefix: string,
    listValues: GmLeaseListValues,
    getValue: GmLeaseGetValue,
    epochToken: string,
    now: number,
): Promise<StorageLeaseClaim[]> {
    const keys = (await listValues()).filter(key => key.startsWith(prefix));
    const values = await Promise.all(keys.map(key => getValue<unknown>(key, null)));
    return values.flatMap(value => {
        const claim = parseStorageLeaseClaim(value);
        return claim && claim.epoch === epochToken && claim.leaseUntil > now ? [claim] : [];
    });
}

function parseStorageLeaseClaim(value: unknown): StorageLeaseClaim | null {
    if (!isPlainRecord(value) || value.version !== 1 || typeof value.owner !== 'string'
        || (value.claimId !== undefined && typeof value.claimId !== 'string')
        || (value.epoch !== undefined && typeof value.epoch !== 'string')
        || typeof value.choosing !== 'boolean' || !Number.isSafeInteger(value.ticket)
        || (value.ticket as number) < 0 || !Number.isSafeInteger(value.leaseUntil)) return null;
    return {
        version: 1,
        claimId: value.claimId || value.owner,
        owner: value.owner,
        epoch: value.epoch || '0:legacy',
        choosing: value.choosing,
        ticket: value.ticket as number,
        leaseUntil: value.leaseUntil as number,
    };
}

async function assertStorageLeaseClaimOwned(
    key: string,
    expected: StorageLeaseClaim,
    getValue: GmLeaseGetValue,
): Promise<void> {
    const actual = parseStorageLeaseClaim(await getValue<unknown>(key, null));
    if (!actual || !sameStorageLeaseClaimIdentity(actual, expected)) {
        throw new Error(`Storage lease ownership was lost: ${key}`);
    }
}

async function deleteStorageLeaseClaimIfOwned(
    key: string,
    expected: StorageLeaseClaim,
    getValue: GmLeaseGetValue,
    deleteValue: GmLeaseDeleteValue,
): Promise<void> {
    const actual = parseStorageLeaseClaim(await getValue<unknown>(key, null));
    if (actual && sameStorageLeaseClaimIdentity(actual, expected)) await deleteValue(key);
}

function sameStorageLeaseClaimIdentity(left: StorageLeaseClaim, right: StorageLeaseClaim): boolean {
    return left.claimId === right.claimId && left.owner === right.owner && left.epoch === right.epoch;
}

function normalizedStorageLeaseName(name: string): string {
    const normalized = name.trim().replaceAll(/[^a-z0-9._-]+/giu, '-').slice(0, 80);
    if (!normalized) throw new TypeError('Storage lease name is required.');
    return normalized;
}

function boundedLeaseOption(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError('Invalid storage lease option.');
    return value;
}

function storageLeaseDelay(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function withWebStorageLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const lockManager = typeof navigator === 'undefined'
        ? undefined
        : (navigator as Navigator & {
            locks?: { request<Result>(name: string, callback: () => Promise<Result>): Promise<Result> };
        }).locks;
    return lockManager ? lockManager.request(`yomu:${normalizedStorageLeaseName(name)}`, operation) : operation();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function createStorageCoordinationId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function debugStorageLeaseError(message: string, key: string, error: unknown): void {
    if (typeof console !== 'undefined') console.debug('[Yomu] Storage', message, { key, error });
}
