export const MANAGED_STATE_EPOCH_KEY = 'yomu:state-epoch';

const MANAGED_STATE_ENVELOPE_VERSION = 1;
const MANAGED_STATE_EPOCH_SESSION_SLOT = Symbol.for('yomu.managed-state-epoch-session.v1');
const MANAGED_STATE_EPOCH_CANONICAL_SESSION_SLOT = Symbol.for('yomu.managed-state-epoch-canonical-session.v1');

export interface ManagedStateEpoch {
    readonly version: 1;
    readonly generation: number;
    readonly resetId: string;
    readonly committedAt: number;
}

export type ManagedStateEpochTokenRelation = 'same' | 'older' | 'newer' | 'conflict' | 'malformed';

interface ManagedStateEnvelope {
    readonly __yomuManagedStateEnvelope: 1;
    readonly epoch: string;
    readonly value: unknown;
}

const INITIAL_MANAGED_STATE_EPOCH: ManagedStateEpoch = Object.freeze({
    version: 1,
    generation: 0,
    resetId: 'legacy',
    committedAt: 0,
});

export class StaleManagedStateEpochError extends Error {
    readonly code = 'YOMU_STALE_MANAGED_STATE_EPOCH';

    constructor(
        readonly expected: ManagedStateEpoch,
        readonly actual: ManagedStateEpoch,
    ) {
        super(`Managed state belongs to epoch ${managedStateEpochToken(expected)}, but the current epoch is ${managedStateEpochToken(actual)}.`);
        this.name = 'StaleManagedStateEpochError';
    }
}

/** Cross-bundle guard: companion and core IIFEs have different class identities. */
export function isStaleManagedStateEpochError(error: unknown): error is StaleManagedStateEpochError {
    return Boolean(error
        && typeof error === 'object'
        && (error as { code?: unknown }).code === 'YOMU_STALE_MANAGED_STATE_EPOCH');
}

/**
 * Per-JavaScript-realm epoch capture. The captured value deliberately never
 * advances: a realm that hydrated state before a reset must reload before it
 * can persist again, even when reset notifications never reach that realm.
 */
export class ManagedStateEpochSession {
    private captured?: ManagedStateEpoch;
    private captureInFlight?: Promise<ManagedStateEpoch>;

    current(): ManagedStateEpoch | undefined {
        return this.captured;
    }

    async capture(readEpoch: () => Promise<unknown>): Promise<ManagedStateEpoch> {
        if (this.captured) return this.captured;
        if (!this.captureInFlight) {
            this.captureInFlight = readEpoch()
                .then(parseManagedStateEpoch)
                .then(epoch => {
                    this.captured = epoch;
                    return epoch;
                })
                .finally(() => {
                    this.captureInFlight = undefined;
                });
        }
        return this.captureInFlight;
    }

    captureSync(rawEpoch: unknown): ManagedStateEpoch {
        const epoch = parseManagedStateEpoch(rawEpoch);
        this.captured ??= epoch;
        return this.captured;
    }

    async assertCurrent(readEpoch: () => Promise<unknown>): Promise<ManagedStateEpoch> {
        const expected = await this.capture(readEpoch);
        const actual = parseManagedStateEpoch(await readEpoch());
        assertManagedStateEpoch(expected, actual);
        return expected;
    }

    assertCurrentSync(rawEpoch: unknown): ManagedStateEpoch {
        const expected = this.captureSync(rawEpoch);
        const actual = parseManagedStateEpoch(rawEpoch);
        assertManagedStateEpoch(expected, actual);
        return expected;
    }

    /** Test-only lifecycle support for Vitest's reused JavaScript realm. */
    resetForTests(): void {
        this.captured = undefined;
        this.captureInFlight = undefined;
    }
}

/**
 * Return the one immutable epoch capture shared by every bundle in this realm.
 * The userscript core and its @require runtime are separate IIFEs, so module
 * scope alone is not a realm boundary.
 */
export function managedStateEpochSessionForRealm(root: typeof globalThis = globalThis): ManagedStateEpochSession {
    const slots = root as unknown as Record<PropertyKey, unknown>;
    const existing = slots[MANAGED_STATE_EPOCH_SESSION_SLOT];
    if (isManagedStateEpochSession(existing)) return existing;
    const session = new ManagedStateEpochSession();
    slots[MANAGED_STATE_EPOCH_SESSION_SLOT] = session;
    slots[MANAGED_STATE_EPOCH_CANONICAL_SESSION_SLOT] ??= session;
    return session;
}

/** Test-only: model a genuinely new realm while older imported modules remain alive. */
export function installFreshManagedStateEpochSessionForTests(root: typeof globalThis = globalThis): void {
    const slots = root as unknown as Record<PropertyKey, unknown>;
    slots[MANAGED_STATE_EPOCH_SESSION_SLOT] = new ManagedStateEpochSession();
}

/** Test-only: reset fork-reused state and restore the realm's original session. */
export function resetManagedStateEpochSessionsForTests(root: typeof globalThis = globalThis): void {
    const slots = root as unknown as Record<PropertyKey, unknown>;
    const current = slots[MANAGED_STATE_EPOCH_SESSION_SLOT];
    const canonical = slots[MANAGED_STATE_EPOCH_CANONICAL_SESSION_SLOT];
    if (isManagedStateEpochSession(current)) current.resetForTests();
    if (isManagedStateEpochSession(canonical)) canonical.resetForTests();
    if (isManagedStateEpochSession(canonical)) slots[MANAGED_STATE_EPOCH_SESSION_SLOT] = canonical;
    else delete slots[MANAGED_STATE_EPOCH_SESSION_SLOT];
}

export function parseManagedStateEpoch(value: unknown): ManagedStateEpoch {
    if (value === undefined || value === null) return INITIAL_MANAGED_STATE_EPOCH;
    if (!isPlainRecord(value)
        || value.version !== 1
        || !Number.isSafeInteger(value.generation)
        || (value.generation as number) < 1
        || typeof value.resetId !== 'string'
        || !value.resetId.trim()
        || typeof value.committedAt !== 'number'
        || !Number.isFinite(value.committedAt)
        || value.committedAt <= 0) {
        throw new Error('The managed-state epoch is malformed.');
    }
    return {
        version: 1,
        generation: value.generation as number,
        resetId: value.resetId,
        committedAt: value.committedAt,
    };
}

export function nextManagedStateEpoch(current: ManagedStateEpoch, resetId: string, committedAt = Date.now()): ManagedStateEpoch {
    if (!resetId.trim()) throw new TypeError('A reset id is required to advance managed state.');
    if (!Number.isSafeInteger(current.generation + 1)) throw new Error('The managed-state epoch cannot advance further.');
    return {
        version: 1,
        generation: current.generation + 1,
        resetId,
        committedAt,
    };
}

export function managedStateStoredValue(value: unknown, epoch: ManagedStateEpoch): unknown {
    // Generation zero is the backwards-compatible legacy format. Envelopes
    // start only after a user has reset once, so existing installs and backups
    // continue to read their current raw values without migration churn.
    if (epoch.generation === 0) return value;
    const envelope: ManagedStateEnvelope = {
        __yomuManagedStateEnvelope: MANAGED_STATE_ENVELOPE_VERSION,
        epoch: managedStateEpochToken(epoch),
        value,
    };
    return envelope;
}

export function managedStateLogicalValue<T>(stored: unknown, epoch: ManagedStateEpoch, fallback: T): T {
    if (epoch.generation === 0) {
        if (!isManagedStateEnvelope(stored)) return stored as T;
        return stored.epoch === managedStateEpochToken(epoch) ? stored.value as T : fallback;
    }
    if (!isManagedStateEnvelope(stored)) return fallback;
    return stored.epoch === managedStateEpochToken(epoch) ? stored.value as T : fallback;
}

/**
 * Recover the physical payload for reset-owned index enumeration. Unlike a
 * normal managed-state read, reset must inspect valid envelopes from every
 * generation so that a late stale index cannot hide the child keys it owns.
 */
export function managedStateResetEnumerationValue<T>(stored: unknown): T {
    if (!isPlainRecord(stored) || !Object.hasOwn(stored, '__yomuManagedStateEnvelope')) {
        return stored as T;
    }
    if (!isManagedStateEnvelope(stored)) {
        throw new Error('The managed-state envelope is malformed.');
    }
    return stored.value as T;
}

export function managedStateEpochToken(epoch: ManagedStateEpoch): string {
    return `${epoch.generation}:${epoch.resetId}`;
}

/**
 * Order a durable per-database marker against the realm's authoritative epoch.
 * Equal generations with different reset ids are a split-brain conflict, not
 * an ordering tie: neither realm may overwrite the other's marker.
 */
export function managedStateEpochTokenRelation(
    storedToken: string,
    current: ManagedStateEpoch,
): ManagedStateEpochTokenRelation {
    if (storedToken === managedStateEpochToken(current)) return 'same';
    const separator = storedToken.indexOf(':');
    if (separator <= 0) return 'malformed';
    const generationText = storedToken.slice(0, separator);
    if (!/^(?:0|[1-9]\d*)$/u.test(generationText)) return 'malformed';
    const storedGeneration = Number(generationText);
    if (!Number.isSafeInteger(storedGeneration)) return 'malformed';
    if (storedGeneration < current.generation) return 'older';
    if (storedGeneration > current.generation) return 'newer';
    return 'conflict';
}

export function sameManagedStateEpoch(left: ManagedStateEpoch, right: ManagedStateEpoch): boolean {
    return left.generation === right.generation && left.resetId === right.resetId;
}

function assertManagedStateEpoch(expected: ManagedStateEpoch, actual: ManagedStateEpoch): void {
    if (!sameManagedStateEpoch(expected, actual)) throw new StaleManagedStateEpochError(expected, actual);
}

function isManagedStateEnvelope(value: unknown): value is ManagedStateEnvelope {
    return isPlainRecord(value)
        && value.__yomuManagedStateEnvelope === MANAGED_STATE_ENVELOPE_VERSION
        && typeof value.epoch === 'string'
        && Object.hasOwn(value, 'value');
}

function isManagedStateEpochSession(value: unknown): value is ManagedStateEpochSession {
    return Boolean(value
        && typeof value === 'object'
        && typeof (value as ManagedStateEpochSession).current === 'function'
        && typeof (value as ManagedStateEpochSession).capture === 'function'
        && typeof (value as ManagedStateEpochSession).assertCurrent === 'function'
        && typeof (value as ManagedStateEpochSession).resetForTests === 'function');
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
