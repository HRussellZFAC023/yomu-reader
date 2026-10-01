export const MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX = 'yomu:state-epoch-lease:v1:';
export const STORAGE_LEASE_KEY_PREFIX = 'yomu:lease:';
/**
 * The lease for a critical section that is only storage work, such as a local
 * deck or settings save: a tab that dies mid-save keeps the other tabs waiting
 * this long at most. Pair it with `guards`, so a holder that is still saving
 * renews it and one whose lease lapsed cannot write. A lease held across
 * network requests keeps the one-minute default: its holder can be alive yet
 * write nothing while it waits for a reply.
 */
export const STORAGE_WORK_LEASE_MS = 5_000;
// How long another tab may keep a caller waiting before onWait says so.
const WAIT_NOTICE_MS = 1_500;

export interface GmStorageLeaseOptions {
    readonly leaseMs?: number;
    readonly pollMs?: number;
    readonly timeoutMs?: number;
    /**
     * The storage keys the lease protects. While it is held, each managed write
     * of one of them first checks that the lease is still live and renews it
     * when due (fenceStorageLeaseWrite). A holder that is still writing keeps
     * its lease however the browser throttles its timers; a holder whose lease
     * lapsed (a frozen tab another tab has since overtaken) cannot write them.
     */
    readonly guards?: (key: string) => boolean;
    /** Told true once another tab has kept this caller waiting ~1.5 s, then false when the wait ends. */
    readonly onWait?: (waiting: boolean) => void;
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

interface StorageLeaseSpec extends Pick<GmStorageLeaseOptions, 'guards'> {
    readonly prefix: string;
    readonly epoch: string;
    readonly io: { readonly [Method in keyof GmStorageLeaseBackend]: NonNullable<GmStorageLeaseBackend[Method]> };
    /** The managed-state mutation fence; the epoch-control lease guards the epoch itself and has none. */
    readonly fence: () => Promise<void>;
    readonly leaseMs: number;
    readonly pollMs: number;
    readonly timeoutMs: number;
    readonly timeoutMessage: string;
}

/** A held lease with `guards`: managed writes of its keys fence through it. */
interface GuardingStorageLease {
    readonly guards: (key: string) => boolean;
    readonly fenceWrite: () => void;
}

class StorageLeaseLapsedError extends Error {
    override readonly name = 'StorageLeaseLapsedError';

    constructor(key: string) {
        super(`Storage lease lapsed before it was renewed: ${key}`);
    }
}

// The guarding leases this realm holds. Each tab is its own realm, so a write
// only ever fences the leases of the tab that makes it.
const guardingLeases = new Set<GuardingStorageLease>();

/**
 * Managed storage calls this synchronously before it issues a write of `key`,
 * so nothing runs between the check and the write. A lapsed lease that guards
 * the key refuses the write; a live one is renewed when due, which makes the
 * holder's own writes its heartbeat.
 */
export function fenceStorageLeaseWrite(key: string): void {
    for (const lease of guardingLeases) if (lease.guards(key)) lease.fenceWrite();
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
    // A same-origin tab holds this realm up at the web lock, any other at the GM claims.
    const wait = storageLeaseWait(options.onWait);
    try {
        return await withWebStorageLock(name, () => withSharedStorageLease(name, () => {
            wait.end();
            return operation();
        }, options, environment));
    } finally {
        wait.end();
    }
}

/** Tells `onWait` once the caller has waited ~1.5 s for its turn, and again when the wait ends. */
function storageLeaseWait(onWait: GmStorageLeaseOptions['onWait']): { end(): void } {
    let state: 'waiting' | 'told' | 'ended' = 'waiting';
    const timer = onWait && setTimeout(() => {
        state = 'told';
        onWait(true);
    }, WAIT_NOTICE_MS);
    return {
        end: () => {
            clearTimeout(timer);
            if (state === 'told') onWait?.(false);
            state = 'ended';
        },
    };
}

async function withSharedStorageLease<T, Epoch>(
    name: string,
    operation: () => Promise<T>,
    options: GmStorageLeaseOptions,
    environment: GmStorageLeaseEnvironment<Epoch>,
): Promise<T> {
    const { getValue, setValue, deleteValue, listValues } = environment.backend;
    const epoch = await environment.captureEpoch(getValue);
    await environment.assertMutationFence(getValue, epoch);
    if (!getValue || !setValue || !deleteValue || !listValues) {
        const result = await operation();
        await environment.assertMutationFence(getValue, epoch);
        return result;
    }

    const leaseMs = boundedLeaseOption(options.leaseMs, 60_000, 1_000, 10 * 60_000);
    return new StorageLeaseClaimant({
        guards: options.guards,
        prefix: `${STORAGE_LEASE_KEY_PREFIX}${normalizedStorageLeaseName(name)}:`,
        epoch: environment.epochToken(epoch),
        io: { getValue, setValue, deleteValue, listValues },
        fence: () => environment.assertMutationFence(getValue, epoch),
        leaseMs,
        pollMs: boundedLeaseOption(options.pollMs, 20, 1, 1_000),
        timeoutMs: boundedLeaseOption(options.timeoutMs, 90_000, leaseMs, 15 * 60_000),
        timeoutMessage: `Timed out waiting for storage lease: ${name}`,
    }).run(operation);
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
    return new StorageLeaseClaimant({
        prefix: MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX,
        epoch: 'epoch-control:v1',
        io: { getValue, setValue, deleteValue, listValues },
        fence: async () => undefined,
        leaseMs: 30_000,
        pollMs: 10,
        timeoutMs: 90_000,
        timeoutMessage: 'Timed out waiting for the managed-state epoch lease.',
    }).run(operation);
}

/**
 * One contender's claim from queueing to release: a bakery lock over GM
 * storage, which has no compare-and-set. Each contender owns one claim key and
 * takes a ticket above every live claim; the lowest live ticket holds the
 * lease. Other tabs ignore a claim once its leaseUntil passes, so a claim is
 * renewed only while they can still see it and is never written back to life:
 * a waiter whose claim lapsed queues again, and a holder whose claim lapsed
 * has lost the lease.
 */
class StorageLeaseClaimant {
    private readonly key: string;
    private readonly startedAt = Date.now();
    // Time for a claim write to land while the claim it extends is still live.
    private readonly landingMs: number;
    private claim: StorageLeaseClaim;
    // The leaseUntil other tabs can already read: a claim counts once its write has landed.
    private liveUntil = 0;

    constructor(private readonly lease: StorageLeaseSpec) {
        const owner = createStorageCoordinationId();
        this.key = `${lease.prefix}${owner}`;
        this.landingMs = Math.min(1_000, Math.floor(lease.leaseMs / 5));
        this.claim = {
            version: 1,
            claimId: createStorageCoordinationId(),
            owner,
            epoch: lease.epoch,
            choosing: true,
            ticket: 0,
            leaseUntil: 0,
        };
    }

    async run<T>(operation: () => Promise<T>): Promise<T> {
        try {
            await this.waitForTurn();
            return await this.hold(operation);
        } finally {
            const { getValue, deleteValue } = this.lease.io;
            try {
                await deleteStorageLeaseClaimIfOwned(this.key, this.claim, getValue, deleteValue);
            } catch (error) {
                debugStorageLeaseError('GM storage lease release failed', this.key, error);
            }
        }
    }

    private live(): boolean {
        return Date.now() + this.landingMs < this.liveUntil;
    }

    private async waitForTurn(): Promise<void> {
        const { lease } = this;
        while (true) {
            await lease.fence();
            if (Date.now() - this.startedAt >= lease.timeoutMs) throw new Error(lease.timeoutMessage);
            try {
                // A throttled waiter's place may have lapsed and been overtaken: it queues again.
                if (!this.live()) await this.queue();
                else if (this.liveUntil - Date.now() <= lease.leaseMs / 2) await this.writeClaim();
            } catch (error) {
                if (error instanceof StorageLeaseLapsedError) continue;
                throw error;
            }
            if (!await this.othersAhead() && this.live()) return;
            await storageLeaseDelay(lease.pollMs);
        }
    }

    private async queue(): Promise<void> {
        const { prefix, epoch, io: { listValues, getValue } } = this.lease;
        await this.writeClaim({ choosing: true, ticket: 0 }, true);
        const claims = await readStorageLeaseClaims(prefix, listValues, getValue, epoch, Date.now());
        const highestTicket = claims.reduce((highest, item) => Math.max(highest, item.ticket), 0);
        await this.writeClaim({ choosing: false, ticket: highestTicket + 1 });
    }

    private async othersAhead(): Promise<boolean> {
        const { prefix, epoch, io: { listValues, getValue } } = this.lease;
        const { owner, ticket } = this.claim;
        const claims = await readStorageLeaseClaims(prefix, listValues, getValue, epoch, Date.now());
        return claims.some(other => other.owner !== owner && (
            other.choosing
            || other.ticket < ticket
            || (other.ticket === ticket && other.owner.localeCompare(owner) < 0)
        ));
    }

    /** `requeue` writes a new place in the queue instead of extending the live claim. */
    private async writeClaim(changes: Partial<StorageLeaseClaim> = {}, requeue = false): Promise<void> {
        const { fence, leaseMs, io: { getValue, setValue, deleteValue } } = this.lease;
        await fence();
        if (!requeue && !this.live()) throw new StorageLeaseLapsedError(this.key);
        const next = { ...this.claim, ...changes, leaseUntil: Date.now() + leaseMs };
        this.claim = next;
        try {
            await setValue(this.key, next);
            await fence();
            await assertStorageLeaseClaimOwned(this.key, next, getValue);
        } catch (error) {
            await deleteStorageLeaseClaimIfOwned(this.key, next, getValue, deleteValue).catch(cleanupError => {
                debugStorageLeaseError('GM storage lease rollback failed', this.key, cleanupError);
            });
            throw error;
        }
        this.liveUntil = next.leaseUntil;
    }

    /**
     * Runs the operation while a timer renews the claim and, for a lease with
     * `guards`, while each guarded write renews it too: those writes reach
     * storage over messaging, so throttled timers cannot starve them.
     */
    private async hold<T>(operation: () => Promise<T>): Promise<T> {
        const { lease, key } = this;
        const { getValue } = lease.io;
        const renewEveryMs = Math.max(250, Math.floor(lease.leaseMs / 3));
        let held = true;
        let lost: { readonly error: unknown } | undefined;
        let renewal: Promise<void> | undefined;
        const renewIfDue = (): void => {
            if (!held || lost || renewal || this.liveUntil - Date.now() > lease.leaseMs - renewEveryMs) return;
            renewal = (async () => {
                await assertStorageLeaseClaimOwned(key, this.claim, getValue);
                await this.writeClaim();
            })().catch(error => {
                lost ??= { error };
                debugStorageLeaseError('GM storage lease renewal failed', key, error);
            }).finally(() => { renewal = undefined; });
        };
        const guarding: GuardingStorageLease | undefined = lease.guards && {
            guards: lease.guards,
            fenceWrite: () => {
                if (!lost && !this.live()) lost = { error: new StorageLeaseLapsedError(key) };
                if (lost) throw lost.error;
                renewIfDue();
            },
        };
        if (guarding) guardingLeases.add(guarding);
        const timer = setInterval(renewIfDue, renewEveryMs);
        let outcome: { readonly value: T } | { readonly error: unknown };
        try {
            await lease.fence();
            await assertStorageLeaseClaimOwned(key, this.claim, getValue);
            const value = await operation();
            await lease.fence();
            await assertStorageLeaseClaimOwned(key, this.claim, getValue);
            outcome = { value };
        } catch (error) {
            outcome = { error };
        } finally {
            held = false;
            if (guarding) guardingLeases.delete(guarding);
            clearInterval(timer);
            await renewal;
        }
        if ('error' in outcome) throw outcome.error;
        if (lost) throw lost.error;
        return outcome.value;
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
