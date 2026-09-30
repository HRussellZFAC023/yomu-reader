import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    decryptProfileEvent,
    encryptProfileEvent,
    wrapProfileKey,
    type EncryptedProfileEvent,
} from '../../src/academy/account/sync-client';
import {
    academyReaderDeviceStatus,
    claimAcademyReaderDevice,
    createAcademyReaderRecoveryPairing,
    disconnectAcademyReaderDevice,
    installAcademyReaderSrsSync,
    syncAcademyReaderSrs,
} from '../../src/reader/srs/account-sync';
import { LocalYomuSrsRepository, createYomuLocalSrsAdapter } from '../../src/reader/srs/local-yomu';
import type { StoredYomuSrsCard } from '../../src/reader/srs/local-yomu-deck';
import { canonicalStudyCardKey } from '../../src/reader/srs/shared';
import { createApiSrsProviderAdapters } from '../../src/reader/cards/srs-providers';
import { createYomuLocalReviewService } from '../../src/academy/integration/yomu-local-review';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard } from '../../src/reader/app/types';

const CODE = '0234-5678-ABCD-EFGH-JKMN';
const PROFILE_KEY = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
const PAIRING_ID = '12345678-1234-4123-8123-123456789012';
const PROFILE_ID = '22345678-1234-4123-8123-123456789012';
const DEVICE_ID = '32345678-1234-4123-8123-123456789012';

describe('Reader Academy account sync', () => {
    const gmValues = new Map<string, unknown>();

    beforeEach(() => {
        gmValues.clear();
        localStorage.clear();
        sessionStorage.clear();
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => gmValues.get(key) ?? fallback));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { gmValues.set(key, value); }));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { gmValues.delete(key); }));
        vi.stubGlobal('GM_listValues', vi.fn(() => [...gmValues.keys()]));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('claims through direct GM transport, stores secrets privately, and starts event sync', async () => {
        const transport = await installDeviceTransport();
        const repository = new LocalYomuSrsRepository(() => 1_000);
        await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });

        await expect(claimAcademyReaderDevice(CODE)).resolves.toMatchObject({
            connected: true,
            displayName: 'Learner',
        });
        expect(transport.nativeFetch).not.toHaveBeenCalled();
        expect(transport.requests.some(details => details.url.endsWith('/academy/api/device/pairings/claim'))).toBe(true);
        expect(transport.requests.filter(details => details.url.includes('/srs/pull'))).toHaveLength(2);
        expect(transport.pushed).toHaveLength(1);
        await expect(decryptProfileEvent(PROFILE_KEY, 'reader-srs-event', transport.pushed[0]!)).resolves.toMatchObject({
            kind: 'card', card: { expression: '読む', reading: 'よむ', updatedAt: 1_000 },
        });
        expect(await academyReaderDeviceStatus()).toMatchObject({ connected: true, displayName: 'Learner' });

        const stored = gmValues.get('yomu:private:academy-device:v1') as { key?: string; credential?: string };
        expect(stored.key).toBe(PROFILE_KEY);
        expect(stored.credential).toMatch(/^yda1\./u);
        expect(localStorage.getItem('yomu:private:academy-device:v1')).toBeNull();
        expect(sessionStorage.getItem('yomu:private:academy-device:v1')).toBeNull();

        await expect(createAcademyReaderRecoveryPairing()).resolves.toMatchObject({ pairingId: PAIRING_ID, code: CODE });
        expect(transport.requests.some(details => details.url.endsWith(`/academy/api/device/pairings/${PAIRING_ID}`))).toBe(true);

        await disconnectAcademyReaderDevice();
        expect(gmValues.has('yomu:private:academy-device:v1')).toBe(false);
    });

    it('merges reverse-order remote schedules, converges the winning card, and applies a newer deletion', async () => {
        const transport = await installDeviceTransport();
        await claimAcademyReaderDevice(CODE);
        const repository = new LocalYomuSrsRepository(() => 10_000);
        const newer = storedCard({ updatedAt: 3_000, dueAt: 9_000, reviews: 2 });
        const older = storedCard({ updatedAt: 2_000, dueAt: 4_000, reviews: 1 });
        transport.remoteEvents.push(
            { ...await encryptedCard(newer), cursor: 1 },
            { ...await encryptedCard(older), cursor: 2 },
        );

        await syncAcademyReaderSrs(repository);

        expect((await repository.snapshot()).cards[newer.id]).toMatchObject({
            updatedAt: 3_000, dueAt: 9_000, reviews: 2,
        });
        // The server page ended with the stale event. Reader republishes the
        // deterministic winning envelope so another device converges too.
        expect(transport.pushed).toHaveLength(1);
        await expect(decryptProfileEvent(PROFILE_KEY, 'reader-srs-event', transport.pushed[0]!)).resolves.toMatchObject({
            kind: 'card', card: { id: newer.id, updatedAt: 3_000, dueAt: 9_000 },
        });

        const deletedAt = 4_000;
        const deletion = { version: 1, kind: 'delete', id: newer.id, expression: '読む', reading: 'よむ', deletedAt } as const;
        transport.remoteEvents.push({
            ...await encryptProfileEvent(PROFILE_KEY, 1, 'reader-srs-event', deletion, deletedAt),
            cursor: 3,
        });
        await syncAcademyReaderSrs(repository);

        const deleted = await repository.snapshot();
        expect(deleted.cards[newer.id]).toBeUndefined();
        expect(deleted.tombstones?.[newer.id]).toBe(deletedAt);
        const signal = gmValues.get('yomu:private:card-state-signal:v1') as { card?: { spelling?: string; cardState?: string[] } };
        expect(signal.card).toMatchObject({ spelling: '読む', cardState: ['not-in-deck'] });
    });

    it('recovers a missed deck notification at startup and then pushes live local reviews', async () => {
        const transport = await installDeviceTransport();
        await claimAcademyReaderDevice(CODE);
        const repository = new LocalYomuSrsRepository(() => 5_000);
        const mined = await repository.mine({ expression: '書く', reading: 'かく', meaning: 'to write' });

        // The mine happened before listeners were installed. Startup marks a
        // full reconciliation, so the card is still discovered and uploaded.
        installAcademyReaderSrsSync();
        await vi.waitFor(() => expect(transport.pushed).toHaveLength(1));
        // A save syncs as collected-only, so no other device schedules it.
        await expect(pushedCard(transport, 0)).resolves.toMatchObject({ expression: '書く', reviews: 0, reviewEnabled: false });

        // The learner's explicit Add to review is itself a live local change.
        const enrolled = await repository.startReview(mined.card!.providerCardId);
        await vi.waitFor(() => expect(transport.pushed).toHaveLength(2));
        const enrolment = await pushedCard(transport, 1);
        expect(enrolment).toMatchObject({ expression: '書く', reviews: 0, dueAt: 5_000 });
        expect(enrolment).not.toHaveProperty('reviewEnabled');

        await repository.review({ card: enrolled, grade: 'good' });
        await vi.waitFor(() => expect(transport.pushed).toHaveLength(3));
        await expect(pushedCard(transport, 2)).resolves.toMatchObject({ expression: '書く', reviews: 1, lastReviewAt: 5_000 });
    });

    // Runs after the startup-recovery case: live mutation listeners are module-global.
    it('records a deliberate Reader grade of a word saved to Academy and syncs the enrolled review', async () => {
        const transport = await installDeviceTransport();
        await claimAcademyReaderDevice(CODE);
        installAcademyReaderSrsSync();
        const repository = new LocalYomuSrsRepository(() => 5_000);
        const academy = createApiSrsProviderAdapters({
            jpdb: {} as never,
            isJpdbBackedCard: () => false,
            yomuLocal: createYomuLocalSrsAdapter(repository),
        }, { ...DEFAULT_SETTINGS, apiKey: '', yomuLocalSrsEnabled: true }).find(provider => provider.id === 'yomu-local')!;
        const word: JPDBCard = {
            vid: 0, sid: 0, rid: 0, spelling: '書く', reading: 'かく', frequencyRank: null, partOfSpeech: [],
            meanings: [{ glosses: ['to write'], partOfSpeech: [] }], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null,
        };

        await academy.addToDeck('yomu-local', word, '手紙を書く。');
        // Saved to the collection, not yet scheduled: shown as in the deck.
        expect(word).toMatchObject({ cardState: ['in-deck'], reviewSource: 'yomu-local', dueAt: undefined });
        expect((await repository.queue()).cards).toEqual([]);
        await vi.waitFor(() => expect(transport.pushed).toHaveLength(1));
        await expect(pushedCard(transport, 0)).resolves.toMatchObject({ expression: '書く', reviews: 0, reviewEnabled: false });

        // Grading is the learner's explicit review: it enrols the saved word
        // (already in the collection, so not reported as newly added) and records the grade.
        await expect(academy.reviewCard(word, 'okay', { sentence: '手紙を書く。' })).resolves.toEqual({ addedBeforeReview: false });
        expect(word).toMatchObject({ cardState: ['learning'], reviewSource: 'yomu-local', lastReviewAt: 5_000, dueAt: 5_000 + 2 * 86_400_000 });
        await vi.waitFor(() => expect(transport.pushed).toHaveLength(2));
        const reviewed = await pushedCard(transport, 1);
        expect(reviewed).toMatchObject({ expression: '書く', sentence: '手紙を書く。', reviews: 1, lastReviewAt: 5_000 });
        expect(reviewed).not.toHaveProperty('reviewEnabled');
    });

    it('enrols a Reader-saved word on the Academy seed schedule, then records and syncs its Academy grade', async () => {
        const transport = await installDeviceTransport();
        await claimAcademyReaderDevice(CODE);
        installAcademyReaderSrsSync();
        let now = 5_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const review = createYomuLocalReviewService(repository, () => now);
        await repository.mine({ expression: '書く', reading: 'かく', meaning: 'to write' });
        await vi.waitFor(() => expect(transport.pushed).toHaveLength(1));

        now = 10_000;
        await review.ingest([{
            id: 'write-letter',
            conceptId: 'concept:write',
            reason: 'new-learning',
            schedule: { dueAfterMs: 60_000 },
            content: { expression: '書く', reading: 'かく', meanings: ['to write'] },
        }]);
        await vi.waitFor(() => expect(transport.pushed).toHaveLength(2));
        const seeded = await pushedCard(transport, 1);
        // The save time was a placeholder, not a learner schedule.
        expect(seeded).toMatchObject({ reviews: 0, dueAt: 70_000, academyProvenance: { 'academy:review-seed:write-letter': { kind: 'review-seed' } } });
        expect(seeded).not.toHaveProperty('reviewEnabled');
        await expect(review.due(10)).resolves.toEqual([]);

        now = 70_000;
        const [item] = await review.due(10);
        expect(item).toMatchObject({ expression: '書く', dueAt: 70_000 });
        await review.rate(item!.id, 'good');
        await vi.waitFor(() => expect(transport.pushed).toHaveLength(3));
        await expect(pushedCard(transport, 2)).resolves.toMatchObject({ expression: '書く', reviews: 1, lastReviewAt: 70_000 });
    });

    async function pushedCard(transport: { pushed: EncryptedProfileEvent[] }, index: number): Promise<Record<string, unknown>> {
        const event = await decryptProfileEvent(PROFILE_KEY, 'reader-srs-event', transport.pushed[index]!) as { kind?: string; card?: Record<string, unknown> };
        expect(event.kind).toBe('card');
        return event.card!;
    }

    async function installDeviceTransport() {
        const envelope = await wrapProfileKey(PROFILE_KEY, CODE, PAIRING_ID, 1);
        const nativeFetch = vi.fn(async () => { throw new Error('page CSP blocked fetch'); });
        vi.stubGlobal('fetch', nativeFetch);
        const requests: Array<Parameters<UserscriptHttpRequest>[0]> = [];
        const pushed: EncryptedProfileEvent[] = [];
        const remoteEvents: Array<EncryptedProfileEvent & { cursor: number }> = [];
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn((details: Parameters<UserscriptHttpRequest>[0]) => {
            requests.push(details);
            const url = new URL(details.url);
            let status = 200;
            let body: unknown;
            if (url.pathname.endsWith('/pairings/claim')) {
                const claim = JSON.parse(String(details.data)) as { deviceSecret: string };
                body = {
                    pairingId: PAIRING_ID,
                    profileId: PROFILE_ID,
                    deviceId: DEVICE_ID,
                    credential: `yda1.${DEVICE_ID}.${claim.deviceSecret}`,
                    keyEnvelope: envelope,
                };
                status = 201;
            } else if (url.pathname.endsWith('/device/pairings') && details.method === 'POST') {
                body = { pairingId: PAIRING_ID, code: CODE, expiresAt: Date.now() + 600_000 };
                status = 201;
            } else if (url.pathname.endsWith(`/device/pairings/${PAIRING_ID}`) && details.method === 'PUT') {
                body = { pairingId: PAIRING_ID, ready: true };
            } else if (url.pathname.endsWith('/srs/push')) {
                const events = (JSON.parse(String(details.data)) as { events: EncryptedProfileEvent[] }).events;
                pushed.push(...events);
                body = { accepted: events.length, inserted: events.length, duplicates: 0, conflicts: [] };
            } else if (url.pathname.endsWith('/srs/pull')) {
                const cursor = Number(url.searchParams.get('cursor') ?? 0);
                const events = remoteEvents.filter(event => event.cursor > cursor);
                body = {
                    events,
                    nextCursor: events.at(-1)?.cursor ?? cursor,
                    hasMore: false,
                };
            } else if (url.pathname.endsWith('/status')) {
                body = { connected: true, displayName: 'Learner', keyVersion: 1 };
            } else if (url.pathname.endsWith('/device') && details.method === 'DELETE') {
                body = { revoked: true };
            } else {
                status = 404;
                body = { error: 'unexpected test route' };
            }
            queueMicrotask(() => details.onload?.({ status, response: JSON.stringify(body), responseText: JSON.stringify(body) }));
            return { abort: vi.fn() };
        }));
        return { nativeFetch, requests, pushed, remoteEvents };
    }
});

function storedCard(overrides: Partial<StoredYomuSrsCard> = {}): StoredYomuSrsCard {
    const id = canonicalStudyCardKey('読む', 'よむ');
    return {
        id,
        expression: '読む',
        reading: 'よむ',
        meanings: ['to read'],
        dueAt: 1_000,
        lastReviewAt: null,
        createdAt: 500,
        updatedAt: 1_000,
        reviews: 0,
        lapses: 0,
        intervalDays: 0,
        ease: 2.5,
        retainWithoutAcademyProvenance: true,
        academyProvenance: {},
        ...overrides,
    };
}

function encryptedCard(card: StoredYomuSrsCard): Promise<EncryptedProfileEvent> {
    return encryptProfileEvent(
        PROFILE_KEY,
        1,
        'reader-srs-event',
        { version: 1, kind: 'card', card },
        card.updatedAt,
    );
}
