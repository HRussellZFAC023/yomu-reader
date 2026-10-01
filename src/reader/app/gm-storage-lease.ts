export const MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX = 'yomu:state-epoch-lease:v1:';
export const STORAGE_LEASE_KEY_PREFIX = 'yomu:lease:';
/**
 * The lease for a critical section that is only storage work, such as a local
 * deck or settings save: a tab that dies mid-save keeps the other tabs waiting
 * this long at most while storage answers promptly. Pair it with `guards`, so
 * a holder that is still saving renews it and one whose lease lapsed cannot
 * write. A lease held across network requests keeps the one-minute default:
 * its holder can be alive yet write nothing while it waits for a reply.
 */
export const STORAGE_WORK_LEASE_MS = 5_000;
const DEFAULT_LEASE_MS = 60_000;
// Slow storage stretches each claim by this many of its round trips (ADR-0019):
// a waiting tab polls in about seven (the three-read fence, the claims, its
// claim write) and renews only once half its claim is spent.
const LEASE_ROUND_TRIPS = 20;
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
    /**
     * The managed-state mutation fence, checked on each poll and around the
     * section rather than around each claim write: it costs three storage
     * reads. The epoch-control lease guards the epoch itself and has none.
     */
    readonly fence: () => Promise<void>;
    readonly leaseMs: number;
    readonly pollMs: number;
    readonly timeoutMs: number;
    readonly timeoutMessage: string;
    readonly wait?: StorageLeaseWait;
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

/**
 * The holder stalled and another tab took the lease, so what it read inside
 * may be stale and its writes were refused. Matched by name: a bundle can
 * carry its own copy of this module.
 */
export function isStorageLeaseLapsed(error: unknown): boolean {
    return error instanceof Error && error.name === 'StorageLeaseLapsedError';
}

// The guarding leases this realm holds. Each tab is its own realm, so a write
// only ever fences the leases of the tab that makes it.
const guardingLeases = new Set<GuardingStorageLease>();
// This realm's claimants (by owner) and web lock requests (by name): waiting
// behind one of them is waiting for this tab's own save, not another tab's.
const realmClaimOwners = new Set<string>();
const realmWebLockRequests = new Map<string, number>();

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
    const wait = new StorageLeaseWait(options.onWait);
    // The GM claims serialize every tab without the web lock, and any script on
    // the page can take that lock and keep it: a caller with the claims waits
    // for the lock for one lease at most.
    const lockWaitMs = storageLeaseIo(environment.backend) ? options.leaseMs ?? DEFAULT_LEASE_MS : undefined;
    try {
        return await withWebStorageLock(name, () => withSharedStorageLease(name, () => {
            wait.end();
            return operation();
        }, options, environment, wait), wait, lockWaitMs);
    } finally {
        wait.end();
    }
}

/**
 * Tells `onWait` once another tab has kept the caller waiting ~1.5 s, and again
 * when the wait ends. Only another tab's turn counts: slow storage, or this
 * tab's own earlier save, is not a wait for another tab.
 */
class StorageLeaseWait {
    private state: 'running' | 'blocked' | 'told' | 'ended' = 'running';
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly onWait: GmStorageLeaseOptions['onWait']) {}

    /** Another tab holds the lease, or is ahead in its queue. */
    blocked(): void {
        if (!this.onWait || this.state !== 'running') return;
        this.state = 'blocked';
        this.timer = setTimeout(() => {
            this.state = 'told';
            this.onWait?.(true);
        }, WAIT_NOTICE_MS);
    }

    /** The caller got past what blocked it; a wait it was not yet told about starts over. */
    passed(): void {
        if (this.state !== 'blocked') return;
        clearTimeout(this.timer);
        this.state = 'running';
    }

    end(): void {
        clearTimeout(this.timer);
        if (this.state === 'told') this.onWait?.(false);
        this.state = 'ended';
    }
}

async function withSharedStorageLease<T, Epoch>(
    name: string,
    operation: () => Promise<T>,
    options: GmStorageLeaseOptions,
    environment: GmStorageLeaseEnvironment<Epoch>,
    wait: StorageLeaseWait,
): Promise<T> {
    const { getValue } = environment.backend;
    const epoch = await environment.captureEpoch(getValue);
    await environment.assertMutationFence(getValue, epoch);
    const io = storageLeaseIo(environment.backend);
    if (!io) {
        const result = await operation();
        await environment.assertMutationFence(getValue, epoch);
        return result;
    }

    const leaseMs = boundedLeaseOption(options.leaseMs, DEFAULT_LEASE_MS, 1_000, 10 * 60_000);
    return new StorageLeaseClaimant({
        guards: options.guards,
        prefix: `${STORAGE_LEASE_KEY_PREFIX}${normalizedStorageLeaseName(name)}:`,
        epoch: environment.epochToken(epoch),
        io,
        fence: () => environment.assertMutationFence(getValue, epoch),
        leaseMs,
        pollMs: boundedLeaseOption(options.pollMs, 20, 1, 1_000),
        timeoutMs: boundedLeaseOption(options.timeoutMs, 90_000, leaseMs, 15 * 60_000),
        timeoutMessage: `Timed out waiting for storage lease: ${name}`,
        wait,
    }).run(operation);
}

/** The backend, when it has all four calls the GM claims need. */
function storageLeaseIo(backend: GmStorageLeaseBackend): StorageLeaseSpec['io'] | null {
    const { getValue, setValue, deleteValue, listValues } = backend;
    return [getValue, setValue, deleteValue, listValues].every(Boolean) ? backend as StorageLeaseSpec['io'] : null;
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
    // Time for a write to land while the claim it extends is still live, when storage is prompt.
    private readonly promptLandingMs: number;
    private claim: StorageLeaseClaim;
    // The leaseUntil other tabs can already read: a claim counts once its write has landed.
    private liveUntil = 0;
    // How long storage took to answer one call of the last claim write.
    private roundTripMs = 0;

    constructor(private readonly lease: StorageLeaseSpec) {
        const owner = createStorageCoordinationId();
        this.key = `${lease.prefix}${owner}`;
        this.promptLandingMs = Math.min(1_000, Math.floor(lease.leaseMs / 5));
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
        realmClaimOwners.add(this.claim.owner);
        try {
            await this.waitForTurn();
            return await this.hold(operation);
        } finally {
            realmClaimOwners.delete(this.claim.owner);
            const { getValue, deleteValue } = this.lease.io;
            try {
                await deleteStorageLeaseClaimIfOwned(this.key, this.claim, getValue, deleteValue);
            } catch (error) {
                debugStorageLeaseError('GM storage lease release failed', this.key, error);
            }
        }
    }

    /**
     * A claim must outlast the storage round trips its holder makes before it
     * renews, so slow storage stretches it by LEASE_ROUND_TRIPS of them, up to
     * the default lease: slowness delays a save instead of lapsing it.
     */
    private leaseMs(): number {
        const { leaseMs } = this.lease;
        return Math.min(leaseMs + LEASE_ROUND_TRIPS * this.roundTripMs, Math.max(leaseMs, DEFAULT_LEASE_MS));
    }

    // Slow storage takes longer to land a write: allow it two round trips.
    private live(): boolean {
        return Date.now() + Math.max(this.promptLandingMs, 2 * this.roundTripMs) < this.liveUntil;
    }

    private async waitForTurn(): Promise<void> {
        const { lease } = this;
        while (true) {
            await lease.fence();
            if (Date.now() - this.startedAt >= lease.timeoutMs) throw new Error(lease.timeoutMessage);
            try {
                // A throttled waiter's place may have lapsed and been overtaken: it queues again.
                if (!this.live()) await this.queue();
                else if (this.liveUntil - Date.now() <= this.leaseMs() / 2) await this.writeClaim();
            } catch (error) {
                if (error instanceof StorageLeaseLapsedError) continue;
                throw error;
            }
            const ahead = await this.claimsAhead();
            if (!ahead.length && this.live()) return;
            if (ahead.some(other => !realmClaimOwners.has(other.owner))) lease.wait?.blocked();
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

    private async claimsAhead(): Promise<StorageLeaseClaim[]> {
        const { prefix, epoch, io: { listValues, getValue } } = this.lease;
        const { owner, ticket } = this.claim;
        const claims = await readStorageLeaseClaims(prefix, listValues, getValue, epoch, Date.now());
        return claims.filter(other => other.owner !== owner && (
            other.choosing
            || other.ticket < ticket
            || (other.ticket === ticket && other.owner.localeCompare(owner) < 0)
        ));
    }

    /** `requeue` writes a new place in the queue instead of extending the live claim. */
    private async writeClaim(changes: Partial<StorageLeaseClaim> = {}, requeue = false): Promise<void> {
        const { getValue, setValue, deleteValue } = this.lease.io;
        if (!requeue && !this.live()) throw new StorageLeaseLapsedError(this.key);
        const writtenAt = Date.now();
        const next = { ...this.claim, ...changes, leaseUntil: writtenAt + this.leaseMs() };
        this.claim = next;
        try {
            await setValue(this.key, next);
            const landedAt = Date.now();
            this.liveUntil = next.leaseUntil;
            await assertStorageLeaseClaimOwned(this.key, next, getValue);
            // The faster of the write and the read confirming it: one call that
            // a frozen tab held up is not slow storage.
            this.roundTripMs = Math.min(landedAt - writtenAt, Date.now() - landedAt);
        } catch (error) {
            await deleteStorageLeaseClaimIfOwned(this.key, next, getValue, deleteValue).catch(cleanupError => {
                debugStorageLeaseError('GM storage lease rollback failed', this.key, cleanupError);
            });
            throw error;
        }
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
        // A guarded write was refused, as against a renewal that failed after the last write.
        let refused = false;
        let renewal: Promise<void> | undefined;
        // Due a sixth of the way into the claim: while storage is prompt, that is
        // on every tick, with half a period of slack for the time the last
        // renewal took to land. A tick may then run up to leaseMs - renewEveryMs
        // - landingMs late (2.3 s of a 5 s lease), more once slow storage
        // stretches the claim.
        const due = (): boolean => held && this.liveUntil - Date.now() <= this.leaseMs() * 5 / 6;
        const renewIfDue = (): void => {
            if (lost || renewal || !due()) return;
            renewal = this.writeClaim().catch(error => {
                lost ??= { error };
                debugStorageLeaseError('GM storage lease renewal failed', key, error);
            }).finally(() => {
                renewal = undefined;
                // A renewal that found storage slow renews again at once, for a longer claim.
                renewIfDue();
            });
        };
        const guarding: GuardingStorageLease | undefined = lease.guards && {
            guards: lease.guards,
            fenceWrite: () => {
                if (!lost && !this.live()) lost = { error: new StorageLeaseLapsedError(key) };
                if (lost) {
                    refused = true;
                    throw lost.error;
                }
                renewIfDue();
            },
        };
        if (guarding) guardingLeases.add(guarding);
        const timer = setInterval(renewIfDue, renewEveryMs);
        // A waiter may enter with half its claim spent: renew before the first tick.
        renewIfDue();
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
        // A lapsed claim is never renewed, so a guarded write that passed the
        // fence was made while the lease was live, as was everything before it.
        // When none was refused, the operation finished under the lease, and a
        // renewal that failed after its last write (a tab frozen with one in
        // flight) does not turn a finished save into a failure.
        if (lost && (!guarding || refused)) throw lost.error;
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

interface WebLockManager {
    request<Result>(name: string, options: { signal?: AbortSignal }, callback: () => Promise<Result>): Promise<Result>;
}

function webLockManager(): WebLockManager | undefined {
    return typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { locks?: WebLockManager }).locks;
}

async function withWebStorageLock<T>(name: string, operation: () => Promise<T>, wait?: StorageLeaseWait, waitMs?: number): Promise<T> {
    const lockManager = webLockManager();
    if (!lockManager) return operation();
    const lockName = `yomu:${normalizedStorageLeaseName(name)}`;
    // A free lock is granted at once, so a wait that lasts is another tab's turn.
    if (!countRealmWebLockRequest(lockName, 1)) wait?.blocked();
    try {
        return await requestWebLock(lockManager, lockName, () => {
            wait?.passed();
            return operation();
        }, waitMs);
    } finally {
        countRealmWebLockRequest(lockName, -1);
    }
}

/** Counts this realm's pending requests for a web lock, and returns how many it had before. */
function countRealmWebLockRequest(lockName: string, change: 1 | -1): number {
    const before = realmWebLockRequests.get(lockName) ?? 0;
    if (before + change > 0) realmWebLockRequests.set(lockName, before + change);
    else realmWebLockRequests.delete(lockName);
    return before;
}

/**
 * Runs `operation` under the lock or, given `waitMs`, without it when the lock
 * is not granted in that time (or the request fails before it is).
 */
async function requestWebLock<T>(locks: WebLockManager, name: string, operation: () => Promise<T>, waitMs?: number): Promise<T> {
    if (waitMs === undefined) return locks.request(name, {}, operation);
    const giveUp = new AbortController();
    const timer = setTimeout(() => giveUp.abort(), waitMs);
    let granted = false;
    try {
        return await locks.request(name, { signal: giveUp.signal }, () => {
            granted = true;
            clearTimeout(timer);
            return operation();
        });
    } catch (error) {
        if (granted) throw error;
        return operation();
    } finally {
        clearTimeout(timer);
    }
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
