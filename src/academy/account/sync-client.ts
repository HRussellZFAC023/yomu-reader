import {
    parseAcademyAccountView,
    parseAcademyEntitlementView,
    parseAcademyPairingClaim,
    parseAcademyPairingTicket,
    parseAcademyProfileView,
    parseAcademySyncPage,
    parseAcademySyncPushResult,
    type AcademyAccountView,
    type AcademyEncryptedSyncEventInput,
    type AcademyEntitlementView,
    type AcademyPairingKeyEnvelope,
    type AcademyPairingTicket,
    type AcademyProfileView,
} from '../../reader/srs/account-contract';
import type { LearnerEvent, LearnerEventRepository } from '../domain/learner-record';

const STORAGE_KEY = 'yomu:academy:profile-sync:v1';
const SYNC_BATCH_SIZE = 50;
const PAIRING_INFO = 'yomu-academy-device-pairing-v1';

/**
 * Observable states for the paid-account and sync surface.
 *
 * - `local`     learning on this device only; no server profile requested yet.
 * - `sign-in`   a server profile or paid activation needs Google sign-in first.
 * - `recovery`  an account-recovery session is starting Google sign-in.
 * - `signed-out` the account session ended while this device retained its key.
 * - `pending`   a paid purchase is still being confirmed / not yet redeemable.
 * - `claimed`   a paid entitlement was just activated for the signed-in account.
 * - `pair`      signed in, but this device must pair to obtain the encrypted key.
 * - `conflict`  the code is bound to another account, or this account owns one.
 * - `syncing`   encrypting and exchanging events with the server.
 * - `ready`     encrypted events are synced.
 * - `offline`   offline; queued events are waiting.
 * - `retry`     a transient failure; retrying is safe.
 * - `error`     an unexpected failure.
 */
export type AcademySyncPhase =
    | 'local'
    | 'sign-in'
    | 'recovery'
    | 'signed-out'
    | 'pending'
    | 'claimed'
    | 'pair'
    | 'conflict'
    | 'syncing'
    | 'ready'
    | 'offline'
    | 'retry'
    | 'error';

export interface AcademySyncStatus {
    readonly phase: AcademySyncPhase;
    readonly profile: AcademyProfileView | null;
    readonly account: AcademyAccountView | null;
    readonly entitlement: AcademyEntitlementView | null;
    readonly pending: number;
    readonly lastSyncAt: number | null;
    readonly error: string | null;
}

export interface AcademySyncStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

interface StoredSyncState {
    readonly profile: AcademyProfileView;
    readonly key: string;
    readonly cursor: number;
    readonly envelopes: Readonly<Record<string, AcademyEncryptedSyncEventInput>>;
    readonly eventSyncIds: Readonly<Record<string, string>>;
    readonly lastSyncAt: number | null;
}

export interface AcademySyncClientOptions {
    readonly events: LearnerEventRepository;
    readonly storage?: AcademySyncStorage | null;
    readonly request?: typeof fetch;
    readonly online?: () => boolean;
    readonly navigate?: (url: string) => void;
    readonly currentUrl?: () => string;
    readonly replaceUrl?: (url: string) => void;
    readonly onRemoteEvents?: () => Promise<void> | void;
}

/**
 * Client-only encrypted event replication and paid-account activation. The
 * 32-byte profile sync key never leaves the client except wrapped inside a
 * pairing envelope, and no server profile is requested until the learner opts
 * into durable sync. Every invitation — paid, generated, or class-provided —
 * must sign in with Google before a server profile or protected media is
 * reachable.
 */
export class AcademySyncClient {
    private readonly storage: AcademySyncStorage | null;
    private readonly request: typeof fetch;
    private readonly online: () => boolean;
    private readonly navigate: (url: string) => void;
    private readonly currentUrl: () => string;
    private readonly replaceUrl: (url: string) => void;
    private state: StoredSyncState | null;
    private account: AcademyAccountView | null = null;
    private entitlement: AcademyEntitlementView | null = null;
    /** A bound profile this device cannot decrypt until it pairs for the key. */
    private awaitingPairProfile: AcademyProfileView | null = null;
    private phase: AcademySyncPhase = 'local';
    private error: string | null = null;
    private pending = Promise.resolve();
    /** Single-flight cookie rotation shared by concurrent 401 responses. */
    private sessionResume: Promise<boolean> | null = null;
    /** A definitive refusal stops further automatic attempts until a new session succeeds. */
    private sessionResumeRefused = false;
    /** Invalidates delayed rotation work as soon as sign-out starts. */
    private sessionEpoch = 0;
    private readonly queuedLocalEventIds = new Set<string>();

    constructor(private readonly options: AcademySyncClientOptions) {
        this.storage = options.storage === undefined ? safeStorage() : options.storage;
        this.request = options.request ?? ((...args) => fetch(...args));
        this.online = options.online ?? (() => navigator.onLine);
        this.navigate = options.navigate ?? (url => window.location.assign(url));
        this.currentUrl = options.currentUrl ?? (() => window.location.href);
        this.replaceUrl = options.replaceUrl ?? (url => window.history.replaceState(window.history.state, '', url));
        this.state = loadState(this.storage);
    }

    /**
     * True once this session's Google account is confirmed, or this device
     * already holds an account-bound profile from an earlier sign-in. This is
     * the only evidence that may open Academy routes past the sign-in gate.
     */
    get hasLinkedAccount(): boolean {
        return Boolean(this.account ?? this.awaitingPairProfile?.accountId ?? this.state?.profile.accountId);
    }

    get status(): AcademySyncStatus {
        const queuedForEncryption = this.state
            ? [...this.queuedLocalEventIds].filter(eventId => !this.state?.eventSyncIds[eventId]).length
            : 0;
        return {
            phase: this.phase,
            profile: this.awaitingPairProfile ?? this.state?.profile ?? null,
            account: this.account,
            entitlement: this.entitlement,
            pending: this.awaitingPairProfile ? 0 : Object.keys(this.state?.envelopes ?? {}).length + queuedForEncryption,
            lastSyncAt: this.state?.lastSyncAt ?? null,
            error: this.error,
        };
    }

    /**
     * Request the server profile and begin encrypted sync. Account-required sessions
     * that have not signed in with Google surface `sign-in`; paid purchases
     * awaiting redemption surface `pending`; a new device on an existing
     * account surfaces `pair`. Local progress is imported only once a profile
     * with a usable key is bound.
     */
    connect(): Promise<AcademySyncStatus> {
        return this.enqueue(() => this.establish());
    }

    /** Rehydrate account state after the Worker returns from Google OIDC. */
    async completeGoogleReturn(): Promise<boolean> {
        const url = new URL(this.currentUrl());
        if (url.searchParams.get('account') !== 'linked') return false;
        url.searchParams.delete('account');
        this.replaceUrl(`${url.pathname}${url.search}${url.hash}`);
        await this.connect();
        return true;
    }

    /** Queueing happens after local persistence and never waits for the network. */
    queueLocalEvents(events: readonly LearnerEvent[]): void {
        if (!this.state || this.awaitingPairProfile) return;
        const queuedIds = events
            .map(event => event.eventId)
            .filter(eventId => !this.state?.eventSyncIds[eventId] && !this.queuedLocalEventIds.has(eventId));
        queuedIds.forEach(eventId => this.queuedLocalEventIds.add(eventId));
        void this.enqueue(async () => {
            try {
                if (!this.state || this.awaitingPairProfile) return;
                await this.queueEvents(events);
                if (!this.persistOrReflect()) return;
                if (this.phase !== 'signed-out') this.scheduleSync();
            } finally {
                queuedIds.forEach(eventId => this.queuedLocalEventIds.delete(eventId));
            }
        });
    }

    retry(): Promise<AcademySyncStatus> {
        return this.enqueue(async () => {
            if (!this.state || this.awaitingPairProfile || (this.state.profile.accountId && !this.account)) {
                await this.establish();
            }
            else await this.syncNow();
            return this.status;
        });
    }

    /**
     * Flush a previously connected profile after the browser regains network
     * access. This deliberately never starts a profile, signs a learner in,
     * or guesses a pairing key: those remain explicit learner actions.
     */
    resumeOnReconnect(): Promise<AcademySyncStatus> {
        return this.enqueue(async () => {
            if (!this.canResumeOnReconnect()) return this.status;
            await this.syncNow();
            return this.status;
        });
    }

    /**
     * Bootstrap an account profile only after the learner explicitly confirms
     * this is its first keyed device. Existing server events make this unsafe,
     * so they keep the client in pairing mode.
     */
    initializeAccountProfile(): Promise<AcademySyncStatus> {
        return this.enqueue(async () => {
            const profile = this.awaitingPairProfile
                ?? parseAcademyProfileView(await this.json('/academy/api/profile'));
            if (!profile.accountId) throw new Error('Only an account profile needs first-device setup.');
            const previousState = this.state;
            const reusableState = previousState?.profile.profileId === profile.profileId ? previousState : null;
            if (!reusableState && await this.remoteHasEvents()) {
                this.phase = 'pair';
                this.error = 'This account already has encrypted history. Pair with a device that can decrypt it.';
                return this.status;
            }
            const candidate = reusableState ?? freshState(profile);
            this.state = candidate;
            if (!this.persistOrReflect()) return this.status;
            try {
                await this.pinProfileKey(candidate);
            } catch (error) {
                if (error instanceof AcademyRequestError && error.status === 409) {
                    this.state = previousState?.profile.profileId === profile.profileId ? null : previousState;
                    this.persist();
                    this.awaitingPairProfile = profile;
                    this.phase = 'pair';
                    this.error = error.message;
                    return this.status;
                }
                this.reflectSyncError(error);
                return this.status;
            }
            this.awaitingPairProfile = null;
            this.account = await this.loadAccount();
            this.entitlement = await this.loadEntitlement();
            await this.queueKnownEvents();
            this.persist();
            await this.syncNow();
            return this.status;
        });
    }

    /** Redeem a paid or generated code into the already signed-in account. */
    redeemCode(code: string): Promise<AcademySyncStatus> {
        return this.enqueue(async () => {
            try {
                this.entitlement = parseAcademyEntitlementView(
                    await this.json('/academy/api/entitlement/redeem', { method: 'POST', body: { code } }),
                );
                this.phase = 'claimed';
                this.error = null;
            } catch (error) {
                this.reflectActivationError(error);
            }
            return this.status;
        });
    }

    async startPairing(): Promise<AcademyPairingTicket> {
        await this.connect();
        if (this.awaitingPairProfile) throw new Error('Pair this device before creating another pairing code.');
        const state = this.requireState();
        await this.pinProfileKey(state);
        const ticket = parseAcademyPairingTicket(await this.json('/academy/api/pairings', { method: 'POST' }));
        const envelope = await wrapProfileKey(state.key, ticket.code, ticket.pairingId, state.profile.keyVersion);
        await this.json(`/academy/api/pairings/${ticket.pairingId}`, { method: 'PUT', body: envelope });
        return ticket;
    }

    claimPairing(code: string): Promise<AcademySyncStatus> {
        return this.enqueue(async () => {
            const claim = parseAcademyPairingClaim(await this.json('/academy/api/pairings/claim', {
                method: 'POST', body: { code },
            }));
            const key = await unwrapProfileKey(claim.keyEnvelope, code, claim.pairingId);
            const profile = parseAcademyProfileView(await this.json('/academy/api/profile'));
            if (profile.profileId !== claim.profileId || profile.deviceId !== claim.deviceId) {
                throw new Error('Pairing completed with an unexpected profile. Try the one-time code again.');
            }
            this.awaitingPairProfile = null;
            this.state = { profile, key, cursor: 0, envelopes: {}, eventSyncIds: {}, lastSyncAt: null };
            // The Worker consumes the one-time code before returning the key.
            // Persist it before any follow-up request so recovery survives a
            // network failure or reload at this exact point.
            if (!this.persistOrReflect()) return this.status;
            this.phase = 'syncing';
            this.error = null;
            try {
                this.account = profile.accountId ? await this.loadAccount() : null;
                this.entitlement = profile.accountId ? await this.loadEntitlement() : null;
                // Learn remote event ids before encrypting local history. A
                // locally retained copy of the same event must not be pushed
                // under a second sync id after account recovery.
                await this.pullRemote();
                await this.queueKnownEvents();
                this.persist();
                await this.syncNow();
            } catch (error) {
                this.reflectSyncError(error);
                this.persist();
            }
            return this.status;
        });
    }

    /** Begin Google sign-in for the current session (activates paid codes). */
    beginGoogleLink(): void {
        this.navigate('/academy/api/auth/google/start');
    }

    /** Create an account-recovery session, then begin Google sign-in for it. */
    async beginRecovery(): Promise<void> {
        await this.json('/academy/api/auth/google/recovery', { method: 'POST', body: {} });
        this.phase = 'recovery';
        this.error = null;
        this.navigate('/academy/api/auth/google/start');
    }

    async exportData(): Promise<Blob> {
        await this.connect();
        const endpoint = this.account ? '/academy/api/account/export' : '/academy/api/profile/export';
        const response = await this.authorizedRequest(endpoint, { credentials: 'same-origin' });
        if (!response.ok) throw await responseError(response);
        return response.blob();
    }

    async signOut(): Promise<void> {
        // Start revocation immediately instead of waiting behind sync. The
        // Worker revokes the stable session family, while this epoch makes any
        // already-started rotation ineligible to retry protected requests.
        this.sessionEpoch += 1;
        this.sessionResumeRefused = true;
        const logout = this.request('/academy/api/logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: '{}',
        });
        const response = await logout;
        if (!response.ok) throw await responseError(response);
        await this.enqueue(async () => {
            this.account = null;
            this.entitlement = null;
            this.awaitingPairProfile = null;
            this.phase = 'signed-out';
            this.error = null;
        });
    }

    async deleteRemoteData(scope: 'profile' | 'account'): Promise<void> {
        const confirmation = scope === 'account' ? 'delete-account' : 'delete-profile';
        await this.json(`/academy/api/${scope}`, { method: 'DELETE', body: { confirmation } });
        this.disconnect();
    }

    disconnect(): void {
        this.state = null;
        this.account = null;
        this.entitlement = null;
        this.awaitingPairProfile = null;
        this.phase = 'local';
        this.error = null;
        this.persist();
    }

    private async establish(): Promise<AcademySyncStatus> {
        let profile: AcademyProfileView;
        try {
            profile = parseAcademyProfileView(await this.json('/academy/api/profile'));
        } catch (error) {
            if (error instanceof AcademyRequestError && error.status === 403) {
                this.account = await this.loadAccount();
                this.entitlement = await this.loadEntitlement();
            }
            return this.reflectGate(error);
        }
        await this.adoptProfile(profile);
        return this.status;
    }

    private async adoptProfile(profile: AcademyProfileView): Promise<void> {
        const reuse = this.state?.profile.profileId === profile.profileId ? this.state : null;
        if (!reuse && profile.accountId) {
            this.awaitingPairProfile = profile;
            this.account = await this.loadAccount();
            this.entitlement = await this.loadEntitlement();
            this.phase = this.online() ? 'pair' : 'offline';
            this.error = null;
            return;
        }
        this.awaitingPairProfile = null;
        this.state = reuse ? { ...reuse, profile } : freshState(profile);
        if (!this.persistOrReflect()) return;
        try {
            await this.pinProfileKey(this.requireState());
        } catch (error) {
            if (error instanceof AcademyRequestError && error.status === 409) {
                this.state = null;
                this.persist();
                this.awaitingPairProfile = profile;
                this.account = profile.accountId ? await this.loadAccount() : null;
                this.entitlement = profile.accountId ? await this.loadEntitlement() : null;
                this.phase = 'pair';
                this.error = error.message;
                return;
            }
            this.reflectSyncError(error);
            this.persist();
            return;
        }
        this.account = profile.accountId ? await this.loadAccount() : null;
        this.entitlement = profile.accountId ? await this.loadEntitlement() : null;
        await this.queueKnownEvents();
        this.persist();
        await this.syncNow();
    }

    private async remoteHasEvents(): Promise<boolean> {
        const page = parseAcademySyncPage(await this.json('/academy/api/srs/pull?cursor=0&limit=1'));
        return page.events.length > 0;
    }

    private async pinProfileKey(state: StoredSyncState): Promise<void> {
        await this.json('/academy/api/profile/key', {
            method: 'POST',
            body: { keyCommitment: await profileKeyCommitment(state.key) },
        });
    }

    private scheduleSync(): void {
        if (!this.state || !this.online()) return;
        setTimeout(() => {
            void this.enqueue(async () => { await this.syncNow(); });
        }, 0);
    }

    private async syncNow(): Promise<void> {
        if (!this.state || this.awaitingPairProfile) return;
        if (!this.persistOrReflect()) return;
        if (!this.online()) {
            this.phase = 'offline';
            this.error = null;
            return;
        }
        this.phase = 'syncing';
        this.error = null;
        try {
            await this.pushPending();
            await this.pullRemote();
            this.state = { ...this.requireState(), lastSyncAt: Date.now() };
            this.phase = 'ready';
            if (!this.persist()) this.reflectPersistenceError();
        } catch (error) {
            this.reflectSyncError(error);
            if (!this.persist()) this.reflectPersistenceError();
        }
    }

    private async pushPending(): Promise<void> {
        while (true) {
            const state = this.requireState();
            const entries = Object.entries(state.envelopes).slice(0, SYNC_BATCH_SIZE);
            if (!entries.length) return;
            // Push returns its result body on both 200 (all merged) and 409
            // (byte conflict on at least one id); other statuses are failures.
            const response = await this.authorizedRequest('/academy/api/srs/push', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ events: entries.map(([, event]) => event) }),
            });
            if (response.status !== 200 && response.status !== 409) throw await responseError(response);
            const result = parseAcademySyncPushResult(await response.json());
            const conflicts = new Set(result.conflicts);
            const envelopes = { ...state.envelopes };
            entries.forEach(([eventId]) => {
                if (!conflicts.has(eventId)) delete envelopes[eventId];
            });
            this.state = { ...state, envelopes };
            this.persist();
            if (result.conflicts.length) {
                throw new AcademySyncConflict(
                    'This device holds a different key for some events. Pair with a device that already has your Academy history.',
                );
            }
        }
    }

    private async pullRemote(): Promise<void> {
        let cursor = this.requireState().cursor;
        while (true) {
            const page = parseAcademySyncPage(await this.json(`/academy/api/srs/pull?cursor=${cursor}&limit=200`));
            const remote = await Promise.all(page.events.map(async envelope => ({
                envelope,
                event: await decryptEvent(this.requireState().key, envelope),
            })));
            if (remote.length) {
                const eventSyncIds = { ...this.requireState().eventSyncIds };
                remote.forEach(({ envelope, event }) => { eventSyncIds[event.eventId] ??= envelope.id; });
                this.state = { ...this.requireState(), eventSyncIds };
                await this.options.events.append(remote.map(({ event }) => event));
                await this.options.onRemoteEvents?.();
            }
            cursor = page.nextCursor;
            this.state = { ...this.requireState(), cursor };
            this.persist();
            if (!page.hasMore) return;
        }
    }

    private async queueKnownEvents(): Promise<void> {
        await this.queueEvents(await this.options.events.readAll());
    }

    private async queueEvents(events: readonly LearnerEvent[]): Promise<void> {
        const state = this.requireState();
        const envelopes = { ...state.envelopes };
        const eventSyncIds = { ...state.eventSyncIds };
        for (const event of events) {
            if (eventSyncIds[event.eventId]) continue;
            const id = createUuid();
            eventSyncIds[event.eventId] = id;
            envelopes[id] = await encryptEvent(state.key, state.profile.keyVersion, id, event);
        }
        this.state = { ...state, envelopes, eventSyncIds };
    }

    private async loadAccount(): Promise<AcademyAccountView> {
        return parseAcademyAccountView(await this.json('/academy/api/account'));
    }

    /** Entitlement is informational and never blocks sync, so failures are absorbed. */
    private async loadEntitlement(): Promise<AcademyEntitlementView | null> {
        try {
            return parseAcademyEntitlementView(await this.json('/academy/api/entitlement'));
        } catch {
            return null;
        }
    }

    private reflectGate(error: unknown): AcademySyncStatus {
        if (error instanceof AcademyRequestError) {
            if (error.status === 401) { this.phase = 'sign-in'; this.error = null; }
            else if (error.status === 403) { this.phase = 'pending'; this.error = null; }
            else if (error.status === 409) { this.phase = 'conflict'; this.error = error.message; }
            else if (error.status >= 500) { this.phase = 'retry'; this.error = null; }
            else { this.phase = 'error'; this.error = error.message; }
        } else if (!this.online()) {
            this.phase = 'offline';
            this.error = null;
        } else {
            this.phase = 'retry';
            this.error = null;
        }
        return this.status;
    }

    private reflectActivationError(error: unknown): void {
        if (error instanceof AcademyRequestError) {
            if (error.status === 401) { this.phase = 'sign-in'; this.error = null; return; }
            if (error.status === 409 && /pending/iu.test(error.message)) { this.phase = 'pending'; this.error = null; return; }
            if (error.status === 409) { this.phase = 'conflict'; this.error = error.message; return; }
            if (error.status >= 500) { this.phase = 'retry'; this.error = null; return; }
            this.phase = 'error';
            this.error = error.message;
            return;
        }
        if (!this.online()) { this.phase = 'offline'; this.error = null; return; }
        this.phase = 'retry';
        this.error = null;
    }

    private reflectSyncError(error: unknown): void {
        if (error instanceof AcademySyncConflict) { this.phase = 'conflict'; this.error = error.message; return; }
        if (error instanceof AcademyRequestError && error.status >= 500) { this.phase = 'retry'; this.error = null; return; }
        if (error instanceof AcademyRequestError && error.status !== 401) { this.phase = 'error'; this.error = error.message; return; }
        if (error instanceof AcademyRequestError) {
            this.account = null;
            this.entitlement = null;
            this.phase = 'sign-in';
            this.error = null;
            return;
        }
        if (!this.online()) { this.phase = 'offline'; this.error = null; return; }
        this.phase = 'retry';
        this.error = null;
    }

    private async json(path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
        const response = await this.authorizedRequest(path, {
            method: init.method ?? 'GET',
            credentials: 'same-origin',
            headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
        if (!response.ok) throw await responseError(response);
        return response.json();
    }

    /**
     * Authorized requests recover an expired short session exactly once: the
     * Worker rotates the HttpOnly cookie while the 30-day offline-resume
     * window holds, so a long-lived tab crossing the eight-hour authorization
     * boundary keeps its account, profile, and entitlement without replaying
     * an invite. A refused rotation surfaces the original 401 unchanged.
     */
    private async authorizedRequest(path: string, init: RequestInit): Promise<Response> {
        const epoch = this.sessionEpoch;
        const response = await this.request(path, init);
        if (response.ok && epoch === this.sessionEpoch) this.sessionResumeRefused = false;
        if (response.status !== 401 || this.sessionResumeRefused || epoch !== this.sessionEpoch) return response;

        // `/profile` intentionally returns 401 for a healthy session that has
        // not linked Google yet. Probe the session contract before rotating so
        // that ordinary sign-in gates do not consume a resume or change cookies.
        const session = await this.request('/academy/api/session', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
        });
        if (epoch !== this.sessionEpoch) return response;
        if (session.ok) {
            this.sessionResumeRefused = false;
            return response;
        }
        if (session.status !== 401 || !(await this.resumeExpiredSession(epoch))) return response;
        if (epoch !== this.sessionEpoch) return response;
        return this.request(path, init);
    }

    private resumeExpiredSession(epoch: number): Promise<boolean> {
        if (this.sessionResume) return this.sessionResume;
        const attempt = (async () => {
            try {
                const rotated = await this.request('/academy/api/session/resume', {
                    method: 'POST',
                    credentials: 'same-origin',
                    cache: 'no-store',
                });
                if (epoch !== this.sessionEpoch) return false;
                // A refused rotation (revoked or beyond the 30-day window) is
                // final for this session; do not burn further attempts on it.
                if (rotated.status === 401 || rotated.status === 403) this.sessionResumeRefused = true;
                if (rotated.ok) this.sessionResumeRefused = false;
                return rotated.ok;
            } catch {
                return false;
            }
        })();
        this.sessionResume = attempt;
        void attempt.finally(() => {
            if (this.sessionResume === attempt) this.sessionResume = null;
        });
        return attempt;
    }

    private requireState(): StoredSyncState {
        if (!this.state) throw new Error('Turn on encrypted sync before using this action.');
        return this.state;
    }

    private persist(): boolean {
        try {
            if (this.state) {
                if (!this.storage) return false;
                this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
            } else {
                this.storage?.removeItem(STORAGE_KEY);
            }
            return true;
        } catch {
            return false;
        }
    }

    private persistOrReflect(): boolean {
        if (this.persist()) return true;
        this.reflectPersistenceError();
        return false;
    }

    private reflectPersistenceError(): void {
        this.phase = 'error';
        this.error = 'This browser could not save the encryption key. Learning remains local; free browser storage and try again before closing this tab.';
    }

    private canResumeOnReconnect(): boolean {
        if (!this.state || this.awaitingPairProfile) return false;
        return !['local', 'sign-in', 'recovery', 'signed-out', 'pending', 'pair', 'conflict', 'error'].includes(this.phase);
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.pending.then(operation);
        this.pending = result.then(() => undefined, () => undefined);
        return result;
    }
}

/** Repositories remain local-first; this observer has no authority to block them. */
export function createSyncingLearnerEventRepository(
    repository: LearnerEventRepository,
    client: AcademySyncClient,
): LearnerEventRepository {
    return {
        readAll: () => repository.readAll(),
        async append(events) {
            await repository.append(events);
            client.queueLocalEvents(events);
        },
    };
}

class AcademyRequestError extends Error {
    constructor(readonly status: number, message: string) { super(message); }
}

class AcademySyncConflict extends Error {}

async function responseError(response: Response): Promise<AcademyRequestError> {
    let message = 'Academy could not complete that request.';
    try {
        const body = await response.json() as { error?: unknown };
        if (typeof body.error === 'string') message = body.error;
    } catch { /* keep the safe generic message */ }
    return new AcademyRequestError(response.status, message);
}

function safeStorage(): AcademySyncStorage | null {
    try { return localStorage; } catch { return null; }
}

function freshState(profile: AcademyProfileView): StoredSyncState {
    return { profile, key: toBase64Url(randomBytes(32)), cursor: 0, envelopes: {}, eventSyncIds: {}, lastSyncAt: null };
}

function loadState(storage: AcademySyncStorage | null): StoredSyncState | null {
    try {
        const value = storage?.getItem(STORAGE_KEY);
        if (!value) return null;
        const parsed = JSON.parse(value) as Partial<StoredSyncState>;
        const profile = parseAcademyProfileView(parsed.profile);
        if (typeof parsed.key !== 'string' || decodedLength(parsed.key) !== 32
            || !Number.isSafeInteger(parsed.cursor) || (parsed.cursor ?? -1) < 0
            || !isRecord(parsed.envelopes) || !isRecord(parsed.eventSyncIds)
            || (parsed.lastSyncAt !== null && parsed.lastSyncAt !== undefined
                && (!Number.isSafeInteger(parsed.lastSyncAt) || parsed.lastSyncAt < 0))) return null;
        const envelopes = parsed.envelopes as Record<string, unknown>;
        if (Object.entries(envelopes).some(([id, envelope]) => !storedEnvelopeIsValid(id, envelope, profile.keyVersion))) return null;
        if (Object.entries(parsed.eventSyncIds).some(([eventId, id]) => !eventId || typeof id !== 'string' || !UUID_V4.test(id))) return null;
        return {
            profile,
            key: parsed.key,
            cursor: parsed.cursor as number,
            envelopes: envelopes as Record<string, AcademyEncryptedSyncEventInput>,
            eventSyncIds: parsed.eventSyncIds as Record<string, string>,
            lastSyncAt: parsed.lastSyncAt ?? null,
        };
    } catch { return null; }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function storedEnvelopeIsValid(id: string, value: unknown, keyVersion: number): boolean {
    if (!isRecord(value) || value.id !== id || !UUID_V4.test(id)
        || !Number.isSafeInteger(value.occurredAt) || (value.occurredAt as number) < 0
        || value.keyVersion !== keyVersion || typeof value.nonce !== 'string' || decodedLength(value.nonce) !== 12
        || typeof value.ciphertext !== 'string') return false;
    const ciphertextLength = decodedLength(value.ciphertext);
    return ciphertextLength >= 17 && ciphertextLength <= 16 * 1024;
}

function decodedLength(value: string): number {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) return -1;
    try { return fromBase64Url(value).byteLength; } catch { return -1; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function encryptEvent(
    key: string,
    keyVersion: number,
    id: string,
    event: LearnerEvent,
): Promise<AcademyEncryptedSyncEventInput> {
    const nonce = randomBytes(12);
    const occurredAt = event.at;
    const aad = eventAdditionalData(id, occurredAt, keyVersion);
    const ciphertext = await aesEncrypt(fromBase64Url(key), nonce, new TextEncoder().encode(JSON.stringify(event)), aad);
    return { id, occurredAt, keyVersion, nonce: toBase64Url(nonce), ciphertext: toBase64Url(ciphertext) };
}

async function decryptEvent(
    key: string,
    envelope: { readonly id: string; readonly occurredAt: number; readonly keyVersion: number; readonly nonce: string; readonly ciphertext: string },
): Promise<LearnerEvent> {
    const aad = eventAdditionalData(envelope.id, envelope.occurredAt, envelope.keyVersion);
    const plaintext = await aesDecrypt(fromBase64Url(key), fromBase64Url(envelope.nonce), fromBase64Url(envelope.ciphertext), aad);
    return JSON.parse(new TextDecoder().decode(plaintext)) as LearnerEvent;
}

function eventAdditionalData(id: string, occurredAt: number, keyVersion: number): Uint8Array {
    return new TextEncoder().encode(`event:${id}:${occurredAt}:v${keyVersion}`);
}

async function wrapProfileKey(
    key: string,
    code: string,
    pairingId: string,
    keyVersion: number,
): Promise<AcademyPairingKeyEnvelope> {
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    const wrappingKey = await derivePairingKey(code, salt);
    const ciphertext = await aesEncrypt(wrappingKey, nonce, fromBase64Url(key), pairingAdditionalData(pairingId, keyVersion));
    return { keyVersion, salt: toBase64Url(salt), nonce: toBase64Url(nonce), ciphertext: toBase64Url(ciphertext) };
}

async function unwrapProfileKey(
    envelope: AcademyPairingKeyEnvelope,
    code: string,
    pairingId: string,
): Promise<string> {
    const wrappingKey = await derivePairingKey(code, fromBase64Url(envelope.salt));
    const aad = pairingAdditionalData(pairingId, envelope.keyVersion);
    return toBase64Url(await aesDecrypt(wrappingKey, fromBase64Url(envelope.nonce), fromBase64Url(envelope.ciphertext), aad));
}

function pairingAdditionalData(pairingId: string, keyVersion: number): Uint8Array {
    return new TextEncoder().encode(`pairing:${pairingId}:v${keyVersion}`);
}

/** HKDF-SHA-256 over the compact (dash-free) pairing code, per the Worker contract. */
async function derivePairingKey(code: string, salt: Uint8Array): Promise<Uint8Array> {
    const compact = code.normalize('NFKC').trim().toUpperCase().replaceAll(/[-\s]/gu, '');
    const material = await crypto.subtle.importKey('raw', cryptoBuffer(new TextEncoder().encode(compact)), 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: cryptoBuffer(salt), info: cryptoBuffer(new TextEncoder().encode(PAIRING_INFO)) },
        material,
        256,
    );
    return new Uint8Array(bits);
}

async function aesEncrypt(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, additionalData: Uint8Array): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey('raw', cryptoBuffer(key), 'AES-GCM', false, ['encrypt']);
    return new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: cryptoBuffer(nonce), additionalData: cryptoBuffer(additionalData) },
        cryptoKey,
        cryptoBuffer(plaintext),
    ));
}

async function aesDecrypt(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, additionalData: Uint8Array): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey('raw', cryptoBuffer(key), 'AES-GCM', false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: cryptoBuffer(nonce), additionalData: cryptoBuffer(additionalData) },
        cryptoKey,
        cryptoBuffer(ciphertext),
    ));
}

function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

function createUuid(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function profileKeyCommitment(key: string): Promise<string> {
    return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', cryptoBuffer(fromBase64Url(key)))));
}

function fromBase64Url(value: string): Uint8Array {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

function cryptoBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.slice().buffer as ArrayBuffer;
}
