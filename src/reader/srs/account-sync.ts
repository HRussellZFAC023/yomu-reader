import {
    decryptProfileEvent,
    encryptProfileEvent,
    unwrapProfileKey,
    wrapProfileKey,
    type EncryptedProfileEvent,
} from '../../academy/account/sync-client';
import { parseAcademyPairingTicket, type AcademyPairingTicket } from './account-contract';
import { publishCardStateSignal } from '../app/card-state-signal';
import {
    gmPrivateStorageDelete,
    gmPrivateStorageGet,
    gmPrivateStorageSet,
    subscribeToStoredValueChanges,
    withGmStorageLease,
} from '../app/storage';
import type { JPDBCard } from '../app/types';
import { requestPrivateApi } from '../network/private-request';
import { LocalYomuSrsRepository, subscribeLocalYomuSrsMutations } from './local-yomu';
import { mergeStoredYomuSrsDecks, type StoredYomuSrsCard, type StoredYomuSrsDeck } from './local-yomu-deck';
import type { YomuSrsLookupItem } from './types';

const API_ORIGIN = 'https://yomureader.com';
const DEVICE_STATE_KEY = 'yomu:private:academy-device:v1';
const PENDING_CLAIM_KEY = 'yomu:private:academy-device-pending:v1';
const EVENT_PURPOSE = 'reader-srs-event';
const LOCAL_DECK_STORAGE_KEY = 'yomu:srs-local:v1';
// A push uses two D1 statements per envelope. Twenty stays below the Workers
// Free plan's 50-query invocation ceiling after authentication/rate limiting.
const PUSH_BATCH_SIZE = 20;

export interface AcademyReaderDeviceStatus {
    readonly connected: boolean;
    readonly displayName: string;
    readonly lastSyncAt: number | null;
    readonly error: string | null;
}

interface StoredDeviceState {
    readonly version: 2;
    readonly credential: string;
    readonly profileId: string;
    readonly deviceId: string;
    readonly keyVersion: number;
    readonly key: string;
    readonly cursor: number;
    readonly syncedEventByCard: Readonly<Record<string, string>>;
    readonly dirtyCardIds: readonly string[];
    readonly needsFullSeed: boolean;
    readonly displayName: string;
    readonly lastSyncAt: number | null;
}

interface PendingDeviceClaim {
    readonly version: 1;
    readonly code: string;
    readonly claimId: string;
    readonly deviceSecret: string;
}

interface DevicePairingClaim {
    readonly pairingId: string;
    readonly profileId: string;
    readonly deviceId: string;
    readonly credential: string;
    readonly keyEnvelope: {
        readonly keyVersion: number;
        readonly salt: string;
        readonly nonce: string;
        readonly ciphertext: string;
    };
}

interface RemoteEventPage {
    readonly events: readonly (EncryptedProfileEvent & { readonly cursor: number })[];
    readonly nextCursor: number;
    readonly hasMore: boolean;
}

type ReaderDeckEvent =
    | { readonly version: 1; readonly kind: 'card'; readonly card: StoredYomuSrsCard }
    | {
        readonly version: 1;
        readonly kind: 'delete';
        readonly id: string;
        readonly expression: string;
        readonly reading: string;
        readonly partOfSpeech?: string;
        readonly language?: string;
        readonly deletedAt: number;
    };

type ReaderDeckIdentity = Omit<YomuSrsLookupItem, 'reading'> & { readonly reading: string };

let pending = Promise.resolve<unknown>(undefined);
let scheduled = false;
let reconnectInstalled = false;

export async function academyReaderDeviceStatus(): Promise<AcademyReaderDeviceStatus> {
    return enqueue(academyReaderDeviceStatusNow);
}

async function academyReaderDeviceStatusNow(): Promise<AcademyReaderDeviceStatus> {
    const state = await loadDeviceState();
    if (!state) return { connected: false, displayName: '', lastSyncAt: null, error: null };
    try {
        const response = await deviceRequest('/academy/api/device/status', state);
        if (!response.ok) {
            if (response.status === 401) {
                await gmPrivateStorageDelete(DEVICE_STATE_KEY);
                return { connected: false, displayName: '', lastSyncAt: null, error: 'This Reader device was disconnected. Pair it again to sync.' };
            }
            throw await responseError(response);
        }
        const body = await response.json() as { connected?: unknown; displayName?: unknown; keyVersion?: unknown };
        if (body.connected !== true || typeof body.displayName !== 'string' || body.keyVersion !== state.keyVersion) {
            throw new Error('Reader account status was malformed.');
        }
        const updated = { ...state, displayName: body.displayName };
        await saveDeviceState(updated);
        return statusFromState(updated);
    } catch (error) {
        return { ...statusFromState(state), error: errorMessage(error) };
    }
}

export async function claimAcademyReaderDevice(rawCode: string): Promise<AcademyReaderDeviceStatus> {
    return enqueue(async () => {
        const code = normalizedPairingCode(rawCode);
        const savedPending = parsePendingClaim(await gmPrivateStorageGet<unknown>(PENDING_CLAIM_KEY, null));
        const claim = savedPending?.code === code ? savedPending : {
            version: 1 as const,
            code,
            claimId: createUuid(),
            deviceSecret: randomBase64Url(32),
        };
        await gmPrivateStorageSet(PENDING_CLAIM_KEY, claim);
        const response = await requestPrivateApi(`${API_ORIGIN}/academy/api/device/pairings/claim`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: claim.code, claimId: claim.claimId, deviceSecret: claim.deviceSecret }),
        });
        if (!response.ok) throw await responseError(response);
        const paired = parsePairingClaim(await response.json());
        const key = await unwrapProfileKey(paired.keyEnvelope, code, paired.pairingId);
        const state: StoredDeviceState = {
            version: 2,
            credential: paired.credential,
            profileId: paired.profileId,
            deviceId: paired.deviceId,
            keyVersion: paired.keyEnvelope.keyVersion,
            key,
            cursor: 0,
            syncedEventByCard: {},
            dirtyCardIds: [],
            needsFullSeed: true,
            displayName: '',
            lastSyncAt: null,
        };
        await saveDeviceState(state);
        await gmPrivateStorageDelete(PENDING_CLAIM_KEY);
        await syncAcademyReaderSrsNow();
        return academyReaderDeviceStatusNow();
    });
}

/** Create a code that can restore the website key from this surviving Reader. */
export function createAcademyReaderRecoveryPairing(): Promise<AcademyPairingTicket> {
    return enqueue(async () => {
        const state = await loadDeviceState();
        if (!state) throw new Error('Connect this Reader before creating a recovery code.');
        const created = await deviceRequest('/academy/api/device/pairings', state, { method: 'POST', body: '{}' });
        if (!created.ok) throw await responseError(created);
        const ticket = parseAcademyPairingTicket(await created.json());
        const envelope = await wrapProfileKey(state.key, ticket.code, ticket.pairingId, state.keyVersion);
        const completed = await deviceRequest(`/academy/api/device/pairings/${ticket.pairingId}`, state, {
            method: 'PUT',
            body: JSON.stringify(envelope),
        });
        if (!completed.ok) throw await responseError(completed);
        return ticket;
    });
}

function scheduleAcademyReaderSrsSync(): void {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
        scheduled = false;
        void syncAcademyReaderSrs().catch(() => undefined);
    }, 0);
}

export function installAcademyReaderSrsSync(): void {
    if (reconnectInstalled || typeof window === 'undefined') return;
    reconnectInstalled = true;
    const reconcileAndSchedule = (): void => {
        void enqueue(markFullSeed).finally(scheduleAcademyReaderSrsSync);
    };
    reconcileAndSchedule();
    subscribeLocalYomuSrsMutations(cardIds => {
        void enqueue(() => markDirtyCards(cardIds));
        scheduleAcademyReaderSrsSync();
    });
    // Academy runs in the page bundle while the Reader may run in a userscript
    // or extension context. Observe the shared deck store so those mutations
    // are reconciled even though module-local listeners cannot cross worlds.
    subscribeToStoredValueChanges(LOCAL_DECK_STORAGE_KEY, reconcileAndSchedule);
    window.addEventListener('online', scheduleAcademyReaderSrsSync);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') scheduleAcademyReaderSrsSync();
    });
}

async function markFullSeed(): Promise<void> {
    const state = await loadDeviceState();
    if (!state || state.needsFullSeed) return;
    await saveDeviceState({ ...state, needsFullSeed: true });
}

export function syncAcademyReaderSrs(repository = new LocalYomuSrsRepository()): Promise<AcademyReaderDeviceStatus> {
    return enqueue(() => syncAcademyReaderSrsNow(repository));
}

export async function disconnectAcademyReaderDevice(): Promise<void> {
    return enqueue(async () => {
        const state = await loadDeviceState();
        if (state) {
            const response = await deviceRequest('/academy/api/device', state, { method: 'DELETE', body: '{}' });
            if (!response.ok && response.status !== 401) throw await responseError(response);
        }
        await gmPrivateStorageDelete(DEVICE_STATE_KEY);
        await gmPrivateStorageDelete(PENDING_CLAIM_KEY);
    });
}

async function syncAcademyReaderSrsNow(repository = new LocalYomuSrsRepository()): Promise<AcademyReaderDeviceStatus> {
    let state = await loadDeviceState();
    if (!state) return { connected: false, displayName: '', lastSyncAt: null, error: null };
    const changed = new Map<string, ReaderDeckIdentity>();
    state = await pullRemoteEvents(state, repository, changed);
    state = await pushLocalEvents(state, await repository.snapshot());
    state = await pullRemoteEvents(state, repository, changed);
    state = { ...state, lastSyncAt: Date.now() };
    await saveDeviceState(state);
    await publishChangedCards(repository, changed);
    return statusFromState(state);
}

async function pullRemoteEvents(
    initial: StoredDeviceState,
    repository: LocalYomuSrsRepository,
    changed: Map<string, ReaderDeckIdentity>,
): Promise<StoredDeviceState> {
    let state = initial;
    let hasMore = true;
    while (hasMore) {
        const response = await deviceRequest(`/academy/api/device/srs/pull?cursor=${state.cursor}&limit=200`, state);
        if (!response.ok) throw await responseError(response);
        const page = parseRemoteEventPage(await response.json(), state.keyVersion);
        const synced = { ...state.syncedEventByCard };
        const latestEnvelopeByCard = new Map<string, EncryptedProfileEvent>();
        let pageDeck: StoredYomuSrsDeck = { version: 1, cards: {}, tombstones: {} };
        for (const envelope of page.events) {
            const event = parseReaderDeckEvent(await decryptProfileEvent(state.key, EVENT_PURPOSE, envelope));
            if (event.kind === 'card') {
                pageDeck = applyReaderDeckEvent(pageDeck, event);
                changed.set(event.card.id, {
                    expression: event.card.expression,
                    reading: event.card.reading,
                    partOfSpeech: event.card.partOfSpeech,
                    language: event.card.language,
                });
                synced[event.card.id] = envelope.id;
                latestEnvelopeByCard.set(event.card.id, envelope);
            } else {
                pageDeck = applyReaderDeckEvent(pageDeck, event);
                changed.set(event.id, {
                    expression: event.expression,
                    reading: event.reading,
                    partOfSpeech: event.partOfSpeech,
                    language: event.language,
                });
                synced[event.id] = envelope.id;
                latestEnvelopeByCard.set(event.id, envelope);
            }
        }
        const merged = page.events.length
            ? await repository.mergeSnapshot(pageDeck, { notifyMutations: false })
            : await repository.snapshot();
        const mergedEventByCard = new Map(deckEvents(merged).map(item => [item.cardId, item]));
        const dirty = new Set(state.dirtyCardIds);
        for (const [cardId, remoteEnvelope] of latestEnvelopeByCard) {
            const localEvent = mergedEventByCard.get(cardId);
            if (!localEvent) {
                dirty.add(cardId);
                continue;
            }
            const localEnvelope = await encryptProfileEvent(
                state.key,
                state.keyVersion,
                EVENT_PURPOSE,
                localEvent.event,
                localEvent.occurredAt,
            );
            if (localEnvelope.id === remoteEnvelope.id) dirty.delete(cardId);
            else dirty.add(cardId);
        }
        state = { ...state, cursor: page.nextCursor, syncedEventByCard: synced, dirtyCardIds: [...dirty] };
        await saveDeviceState(state);
        hasMore = page.hasMore;
    }
    return state;
}

async function pushLocalEvents(state: StoredDeviceState, deck: StoredYomuSrsDeck): Promise<StoredDeviceState> {
    const pendingIds = state.needsFullSeed
        ? new Set([...Object.keys(deck.cards), ...Object.keys(deck.tombstones ?? {})])
        : new Set(state.dirtyCardIds);
    const candidates = await Promise.all(deckEvents(deck).filter(item => pendingIds.has(item.cardId)).map(async item => ({
        cardId: item.cardId,
        envelope: await encryptProfileEvent(state.key, state.keyVersion, EVENT_PURPOSE, item.event, item.occurredAt),
    })));
    const unsynced = candidates.filter(item => state.syncedEventByCard[item.cardId] !== item.envelope.id);
    let next = state;
    for (const batch of eventBatches(unsynced)) {
        const response = await deviceRequest('/academy/api/device/srs/push', next, {
            method: 'POST',
            body: JSON.stringify({ events: batch.map(item => item.envelope) }),
        });
        if (!response.ok) throw await responseError(response);
        const body = await response.json() as { accepted?: unknown; conflicts?: unknown };
        if (body.accepted !== batch.length || !Array.isArray(body.conflicts) || body.conflicts.length) {
            throw new Error('Reader SRS event push was not accepted.');
        }
        const synced = { ...next.syncedEventByCard };
        batch.forEach(item => { synced[item.cardId] = item.envelope.id; });
        const acceptedIds = new Set(batch.map(item => item.cardId));
        next = { ...next, syncedEventByCard: synced, dirtyCardIds: next.dirtyCardIds.filter(id => !acceptedIds.has(id)) };
        await saveDeviceState(next);
    }
    const candidateIds = new Set(candidates.map(item => item.cardId));
    const nextDirty = next.dirtyCardIds.filter(id => !candidateIds.has(id));
    next = { ...next, dirtyCardIds: nextDirty, needsFullSeed: false };
    await saveDeviceState(next);
    return next;
}

function eventBatches<T extends { envelope: EncryptedProfileEvent }>(items: readonly T[]): T[][] {
    const batches: T[][] = [];
    let current: T[] = [];
    for (const item of items) {
        const candidate = [...current, item];
        const bytes = new TextEncoder().encode(JSON.stringify({ events: candidate.map(entry => entry.envelope) })).byteLength;
        if (current.length && (candidate.length > PUSH_BATCH_SIZE || bytes > 250 * 1024)) {
            batches.push(current);
            current = [item];
        } else {
            current = candidate;
        }
    }
    if (current.length) batches.push(current);
    return batches;
}

async function markDirtyCards(cardIds: readonly string[]): Promise<void> {
    if (!cardIds.length) return;
    const state = await loadDeviceState();
    if (!state) return;
    const dirty = new Set([...state.dirtyCardIds, ...cardIds]);
    await saveDeviceState({ ...state, dirtyCardIds: [...dirty] });
}

function deckEvents(deck: StoredYomuSrsDeck): Array<{ cardId: string; occurredAt: number; event: ReaderDeckEvent }> {
    const events: Array<{ cardId: string; occurredAt: number; event: ReaderDeckEvent }> = Object.values(deck.cards).map(card => ({
        cardId: card.id,
        occurredAt: card.updatedAt,
        event: { version: 1 as const, kind: 'card' as const, card },
    }));
    for (const [id, deletedAt] of Object.entries(deck.tombstones ?? {})) {
        const identity = deletedCardIdentity(id);
        events.push({
            cardId: id,
            occurredAt: deletedAt,
            event: { version: 1, kind: 'delete', id, ...identity, deletedAt },
        });
    }
    return events;
}

/** Replays decrypted version-1 events, including legacy cards with no language field. */
export function rebuildReaderDeckEventStream(values: readonly unknown[]): StoredYomuSrsDeck {
    return values.reduce<StoredYomuSrsDeck>(
        (deck, value) => applyReaderDeckEvent(deck, parseReaderDeckEvent(value)),
        { version: 1, cards: {} },
    );
}

function applyReaderDeckEvent(deck: StoredYomuSrsDeck, event: ReaderDeckEvent): StoredYomuSrsDeck {
    return event.kind === 'card'
        ? mergeStoredYomuSrsDecks(deck, { version: 1, cards: { [event.card.id]: event.card } })
        : mergeStoredYomuSrsDecks(deck, {
            version: 1,
            cards: {},
            tombstones: { [event.id]: event.deletedAt },
        });
}

async function publishChangedCards(
    repository: LocalYomuSrsRepository,
    changed: Map<string, ReaderDeckIdentity>,
): Promise<void> {
    if (!changed.size) return;
    const cards = await repository.lookupCards([...changed.values()]);
    const found = new Set(cards.map(card => card.providerCardId));
    cards.forEach(card => publishCardStateSignal({
        vid: 0, sid: 0, rid: 0, spelling: card.expression, reading: card.reading,
        language: card.language, meanings: card.meanings,
        partOfSpeech: card.partOfSpeech ? [card.partOfSpeech] : [],
        pitchAccent: [], frequencyRank: null,
        wordWithReading: null, cardState: card.state, source: 'yomu-local', reviewSource: 'yomu-local',
        dueAt: card.dueAt, lastReviewAt: card.lastReviewAt,
    } satisfies JPDBCard));
    for (const [id, identity] of changed) {
        if (found.has(id)) continue;
        publishCardStateSignal({
            vid: 0, sid: 0, rid: 0, spelling: identity.expression, reading: identity.reading,
            language: identity.language, meanings: [], partOfSpeech: [], pitchAccent: [], frequencyRank: null,
            wordWithReading: null, cardState: ['not-in-deck'], source: 'yomu-local', reviewSource: 'yomu-local',
        } satisfies JPDBCard);
    }
}

function deletedCardIdentity(id: string): ReaderDeckIdentity {
    const [expression = id, reading = expression, partOfSpeech = '', language = ''] = id.split('\u0000');
    return {
        expression,
        reading,
        ...(partOfSpeech ? { partOfSpeech } : {}),
        ...(language ? { language } : {}),
    };
}

function deviceRequest(path: string, state: StoredDeviceState, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${state.credential}`);
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    return requestPrivateApi(`${API_ORIGIN}${path}`, { ...init, headers });
}

async function loadDeviceState(): Promise<StoredDeviceState | null> {
    return parseStoredDeviceState(await gmPrivateStorageGet<unknown>(DEVICE_STATE_KEY, null));
}

function saveDeviceState(state: StoredDeviceState): Promise<void> {
    return gmPrivateStorageSet(DEVICE_STATE_KEY, state);
}

function parseStoredDeviceState(value: unknown): StoredDeviceState | null {
    if (!isRecord(value) || value.version !== 2
        || typeof value.credential !== 'string' || !/^yda1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/iu.test(value.credential)
        || typeof value.profileId !== 'string' || typeof value.deviceId !== 'string'
        || !Number.isSafeInteger(value.keyVersion) || (value.keyVersion as number) < 1
        || typeof value.key !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value.key)
        || !Number.isSafeInteger(value.cursor) || (value.cursor as number) < 0
        || !isRecord(value.syncedEventByCard) || Object.values(value.syncedEventByCard).some(id => typeof id !== 'string')
        || !Array.isArray(value.dirtyCardIds) || value.dirtyCardIds.some(id => typeof id !== 'string')
        || typeof value.needsFullSeed !== 'boolean'
        || typeof value.displayName !== 'string'
        || (value.lastSyncAt !== null && !Number.isSafeInteger(value.lastSyncAt))) return null;
    return value as unknown as StoredDeviceState;
}

function parsePendingClaim(value: unknown): PendingDeviceClaim | null {
    if (!isRecord(value) || value.version !== 1 || typeof value.code !== 'string'
        || typeof value.claimId !== 'string' || !isUuid(value.claimId)
        || typeof value.deviceSecret !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value.deviceSecret)) return null;
    return value as unknown as PendingDeviceClaim;
}

function parsePairingClaim(value: unknown): DevicePairingClaim {
    if (!isRecord(value) || typeof value.pairingId !== 'string' || typeof value.profileId !== 'string'
        || typeof value.deviceId !== 'string' || typeof value.credential !== 'string'
        || !isRecord(value.keyEnvelope) || !Number.isSafeInteger(value.keyEnvelope.keyVersion)
        || typeof value.keyEnvelope.salt !== 'string' || typeof value.keyEnvelope.nonce !== 'string'
        || typeof value.keyEnvelope.ciphertext !== 'string') throw new Error('Reader device pairing response was malformed.');
    return value as unknown as DevicePairingClaim;
}

function parseRemoteEventPage(value: unknown, keyVersion: number): RemoteEventPage {
    if (!isRecord(value) || !Array.isArray(value.events) || !Number.isSafeInteger(value.nextCursor)
        || typeof value.hasMore !== 'boolean') throw new Error('Reader SRS event page was malformed.');
    const events = value.events.map(candidate => {
        if (!isRecord(candidate) || typeof candidate.id !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(candidate.id)
            || !Number.isSafeInteger(candidate.cursor) || !Number.isSafeInteger(candidate.occurredAt)
            || candidate.keyVersion !== keyVersion || typeof candidate.nonce !== 'string'
            || typeof candidate.ciphertext !== 'string') throw new Error('Reader SRS event page was malformed.');
        return candidate as unknown as RemoteEventPage['events'][number];
    });
    return { events, nextCursor: value.nextCursor as number, hasMore: value.hasMore };
}

function parseReaderDeckEvent(value: unknown): ReaderDeckEvent {
    if (!isRecord(value) || value.version !== 1) throw new Error('Reader SRS event was malformed.');
    if (value.kind === 'card' && isRecord(value.card)) return value as unknown as ReaderDeckEvent;
    if (value.kind === 'delete' && typeof value.id === 'string' && typeof value.expression === 'string'
        && typeof value.reading === 'string'
        && (value.partOfSpeech === undefined || typeof value.partOfSpeech === 'string')
        && (value.language === undefined || typeof value.language === 'string')
        && Number.isSafeInteger(value.deletedAt)) return value as unknown as ReaderDeckEvent;
    throw new Error('Reader SRS event was malformed.');
}

function normalizedPairingCode(value: string): string {
    const code = value.normalize('NFKC').trim().toUpperCase().replaceAll(/[-\s]/gu, '');
    if (!/^[023456789ABCDEFGHJKMNPQRSTUVWXYZ]{20}$/u.test(code)) throw new Error('Enter the 20-character one-time pairing code.');
    return code;
}

async function responseError(response: Response): Promise<Error> {
    let message = `Reader account request failed (${response.status}).`;
    try {
        const body = await response.json() as { error?: unknown };
        if (typeof body.error === 'string') message = body.error;
    } catch { /* keep bounded generic status */ }
    return new Error(message);
}

function statusFromState(state: StoredDeviceState): AcademyReaderDeviceStatus {
    return { connected: true, displayName: state.displayName, lastSyncAt: state.lastSyncAt, error: null };
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const coordinated = (): Promise<T> => withGmStorageLease('academy-reader-account-sync', operation);
    const result = pending.then(coordinated, coordinated);
    pending = result.then(() => undefined, () => undefined);
    return result;
}

function randomBase64Url(length: number): string {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function createUuid(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
