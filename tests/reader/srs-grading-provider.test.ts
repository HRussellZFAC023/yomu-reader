import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import {
    apiGradingProviderPreference,
    apiSrsProviderAvailability,
    apiSrsProviderViewForCard,
    apiSrsSwitchableProviderIds,
    createApiSrsProviderAdapters,
    isBunproGradeableCard,
} from '../../src/reader/cards/srs-providers';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';

function settings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return { ...DEFAULT_SETTINGS, ...overrides };
}

// Mirrors the reader's real backing rule so jiten-source cards are not jpdb-backed.
const isJpdbBackedCard = (card: JPDBCard): boolean => (!card.source || card.source === 'jpdb') && card.vid > 0;

const baseCard: JPDBCard = {
    vid: 1, sid: 2, rid: 3, spelling: '食べる', reading: 'たべる',
    frequencyRank: 100, partOfSpeech: ['v1'], meanings: [], cardState: ['not-in-deck'],
    pitchAccent: [], wordWithReading: null,
};

// A jpdb-parsed word that also resolved a Jiten identity (the lookup enrichment).
const dualCard: JPDBCard = { ...baseCard, source: 'jpdb', jitenWordId: 42, jitenReadingIndex: 0 };
const jpdbOnlyCard: JPDBCard = { ...baseCard, source: 'jpdb' };
const jitenCard: JPDBCard = { ...baseCard, source: 'jiten', vid: 42, sid: 0, jitenWordId: 42, jitenReadingIndex: 0 };
const bunproCard: JPDBCard = {
    ...baseCard,
    source: 'bunpro',
    reviewSource: 'bunpro-api',
    bunproReviewId: '123',
    bunproReviewableId: 456,
    bunproReviewableType: 'vocabulary',
    bunproReviewSessionId: '44',
    bunproReviewInputMode: 'regular',
    bunproReviewEndpoint: 'review',
};

describe('apiGradingProviderPreference', () => {
    it('defaults to jiten and honors an explicit jpdb preference', () => {
        expect(apiGradingProviderPreference(settings())).toBe('jiten');
        expect(apiGradingProviderPreference(settings({ apiGradingProvider: 'jiten' }))).toBe('jiten');
        expect(apiGradingProviderPreference(settings({ apiGradingProvider: 'jpdb' }))).toBe('jpdb');
        expect(apiGradingProviderPreference(settings({ apiGradingProvider: 'bunpro' }))).toBe('bunpro');
    });
});

describe('apiSrsProviderAvailability', () => {
    it('reports a provider available only when its key is set and the card carries its identity', () => {
        const bothKeys = settings({ apiKey: 'jpdb-key', jitenApiKey: 'jiten-key' });
        expect(apiSrsProviderAvailability(dualCard, bothKeys, isJpdbBackedCard)).toEqual({ jpdb: true, jiten: true });
        expect(apiSrsProviderAvailability(jpdbOnlyCard, bothKeys, isJpdbBackedCard)).toEqual({ jpdb: true, jiten: false });
        expect(apiSrsProviderAvailability(jitenCard, bothKeys, isJpdbBackedCard)).toEqual({ jpdb: false, jiten: true });
        expect(apiSrsProviderAvailability(dualCard, settings({ apiKey: 'jpdb-key' }), isJpdbBackedCard)).toEqual({ jpdb: true, jiten: false });
    });
});

describe('apiSrsSwitchableProviderIds', () => {
    it('cycles jpdb/jiten on keys alone and adds Bunpro only for usable Bunpro-backed cards', () => {
        const bothKeys = settings({ apiKey: 'jpdb-key', jitenApiKey: 'jiten-key' });
        expect(apiSrsSwitchableProviderIds(baseCard, bothKeys)).toEqual(['jpdb', 'jiten']);
        const withBunpro = settings({
            ...bothKeys,
            bunproFrontendApiToken: 'bunpro-token',
            bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
        });
        expect(apiSrsSwitchableProviderIds(bunproCard, withBunpro)).toEqual(['bunpro']);
        // Words without a Bunpro identity cannot be switched to Bunpro …
        expect(apiSrsSwitchableProviderIds(baseCard, withBunpro)).toEqual(['jpdb', 'jiten']);
        // … and an expired token drops Bunpro from the cycle.
        const expired = settings({ ...withBunpro, bunproFrontendApiTokenExpiresAt: '2000-01-01T00:00:00.000Z' });
        expect(apiSrsSwitchableProviderIds(bunproCard, expired)).toEqual(['jpdb', 'jiten']);
        // A Bunpro-only setup has a single grading service: nothing to cycle.
        const bunproOnly = settings({
            apiKey: '',
            jitenApiKey: '',
            bunproFrontendApiToken: 'bunpro-token',
            bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
        });
        expect(apiSrsSwitchableProviderIds(bunproCard, bunproOnly)).toEqual(['bunpro']);
        // Grammar points are not words — no jpdb/jiten leg to switch to.
        const grammarCard: JPDBCard = { ...bunproCard, bunproReviewableType: 'grammar' };
        expect(apiSrsSwitchableProviderIds(grammarCard, withBunpro)).toEqual(['bunpro']);
    });

    it('rejects corrupt or non-numeric Bunpro review ids before rendering grade controls', () => {
        expect(isBunproGradeableCard(bunproCard)).toBe(true);
        expect(isBunproGradeableCard({ ...bunproCard, bunproReviewId: 'reviewable:123' })).toBe(false);
        expect(isBunproGradeableCard({ ...bunproCard, bunproReviewId: '0' })).toBe(false);
        expect(isBunproGradeableCard({ ...bunproCard, bunproReviewId: undefined })).toBe(false);
    });
});

describe('apiSrsProviderViewForCard', () => {
    it('follows the toggled grading provider when both keys are set and the card is gradable by both', () => {
        const bothKeys = settings({ apiKey: 'jpdb-key', jitenApiKey: 'jiten-key' });
        expect(apiSrsProviderViewForCard(dualCard, bothKeys, isJpdbBackedCard)?.id).toBe('jiten');
        expect(apiSrsProviderViewForCard(dualCard, { ...bothKeys, apiGradingProvider: 'jpdb' }, isJpdbBackedCard)?.id).toBe('jpdb');
    });

    it('uses whichever provider backs the card when only one is usable', () => {
        const bothKeys = settings({ apiKey: 'jpdb-key', jitenApiKey: 'jiten-key', apiGradingProvider: 'jiten' });
        // A jpdb-only word stays jpdb even when the preference is jiten.
        expect(apiSrsProviderViewForCard(jpdbOnlyCard, bothKeys, isJpdbBackedCard)?.id).toBe('jpdb');
        // A jiten word stays jiten even when the preference is jpdb.
        expect(apiSrsProviderViewForCard(jitenCard, { ...bothKeys, apiGradingProvider: 'jpdb' }, isJpdbBackedCard)?.id).toBe('jiten');
    });

    it('never drops a gradable JPDB word for a keyless Jiten view (single-key regression)', () => {
        // dualCard is keylessly enriched with a jiten identity, but only the JPDB
        // key is set — the gradable JPDB provider must win, with a usable key.
        const jpdbKeyOnly = settings({ apiKey: 'jpdb-key', jitenApiKey: '', apiGradingProvider: 'jiten' });
        const view = apiSrsProviderViewForCard(dualCard, jpdbKeyOnly, isJpdbBackedCard);
        expect(view?.id).toBe('jpdb');
        expect(view?.hasApiKey).toBe(true);
        // Mirror image: only the Jiten key is set → grade via Jiten.
        const jitenKeyOnly = settings({ apiKey: '', jitenApiKey: 'jiten-key', apiGradingProvider: 'jpdb' });
        expect(apiSrsProviderViewForCard(dualCard, jitenKeyOnly, isJpdbBackedCard)?.id).toBe('jiten');
    });

    it('falls back to local Yomu SRS when external keys are absent', () => {
        expect(apiSrsProviderViewForCard(jpdbOnlyCard, settings({ apiKey: 'jpdb-key' }), isJpdbBackedCard)?.hasApiKey).toBe(true);
        expect(apiSrsProviderViewForCard(jpdbOnlyCard, settings({ apiKey: '' }), isJpdbBackedCard)).toMatchObject({
            id: 'yomu-local',
            label: 'Academy',
            hasApiKey: true,
        });
        expect(apiSrsProviderViewForCard(jpdbOnlyCard, settings({ apiKey: '', yomuLocalSrsEnabled: false }), isJpdbBackedCard)).toMatchObject({
            id: 'jpdb',
            hasApiKey: false,
        });
    });

    it('honors the per-card override set by the popover toggle', () => {
        const bothKeys = settings({ apiKey: 'jpdb-key', jitenApiKey: 'jiten-key' });
        expect(apiSrsProviderViewForCard({ ...dualCard, apiGradingProviderOverride: 'jpdb' }, bothKeys, isJpdbBackedCard)?.id).toBe('jpdb');
        // A Bunpro identity without a live session cannot hijack the ordinary
        // JPDB/Jiten provider choice.
        const withBunpro = settings({
            ...bothKeys,
            bunproFrontendApiToken: 'bunpro-token',
            bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
        });
        const dualBunproCard: JPDBCard = { ...dualCard, bunproReviewId: '123' };
        expect(apiSrsProviderViewForCard(dualBunproCard, withBunpro, isJpdbBackedCard)?.id).toBe('jiten');
        expect(apiSrsProviderViewForCard({ ...dualBunproCard, apiGradingProviderOverride: 'jiten' }, withBunpro, isJpdbBackedCard)?.id).toBe('jiten');
        // An override the card cannot use falls back to normal resolution.
        expect(apiSrsProviderViewForCard({ ...dualCard, apiGradingProviderOverride: 'bunpro' }, bothKeys, isJpdbBackedCard)?.id).toBe('jiten');
    });

    it('never grades a non-Bunpro card to Bunpro from the stored preference', () => {
        const prefBunpro = settings({ apiKey: 'jpdb-key', jitenApiKey: 'jiten-key', apiGradingProvider: 'bunpro' });
        expect(apiSrsProviderViewForCard(dualCard, prefBunpro, isJpdbBackedCard)?.id).toBe('jiten');
    });

    it('uses Bunpro for Bunpro-backed cards and respects frontend token expiry', () => {
        const active = settings({
            bunproFrontendApiToken: 'bunpro-token',
            bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
            bunproMiningEnabled: true,
            apiGradingProvider: 'bunpro',
        });
        const expired = settings({
            ...active,
            bunproFrontendApiTokenExpiresAt: '2000-01-01T00:00:00.000Z',
        });

        expect(apiSrsProviderViewForCard(bunproCard, active, isJpdbBackedCard)).toMatchObject({
            id: 'bunpro',
            label: 'Bunpro',
            deckSource: 'bunpro',
            hasApiKey: true,
        });
        expect(apiSrsProviderViewForCard(bunproCard, expired, isJpdbBackedCard)).toMatchObject({
            id: 'bunpro',
            hasApiKey: false,
        });
    });
});

describe('Academy provider mutation state', () => {
    it('applies the repository result after mining and review instead of broadcasting stale provider state', async () => {
        const mine = vi.fn(async () => ({
            card: {
                providerId: 'yomu-local' as const,
                providerCardId: '食べる\u0000たべる',
                kind: 'vocabulary' as const,
                expression: '食べる',
                reading: 'たべる',
                meanings: [],
                state: ['new'] as JPDBCard['cardState'],
                dueAt: 1_000,
                lastReviewAt: null,
            },
        }));
        const review = vi.fn(async () => ({
            card: {
                providerId: 'yomu-local' as const,
                providerCardId: '食べる\u0000たべる',
                kind: 'vocabulary' as const,
                expression: '食べる',
                reading: 'たべる',
                meanings: [],
                state: ['learning'] as JPDBCard['cardState'],
                dueAt: 2_000,
                lastReviewAt: 1_000,
            },
        }));
        const [provider] = createApiSrsProviderAdapters({
            jpdb: {} as never,
            yomuLocal: {
                id: 'yomu-local',
                label: 'Academy',
                capabilities: { stats: true, queue: true, review: true, mine: true, import: true },
                hasCredential: () => true,
                verify: async () => true,
                stats: async () => ({ providerId: 'yomu-local', fetchedAt: 0 }),
                queue: async () => ({ providerId: 'yomu-local', fetchedAt: 0, cards: [], dueCount: 0, newCount: 0, reviewCount: 0 }),
                mine,
                review,
            },
            isJpdbBackedCard,
        }, settings({ apiKey: '', yomuLocalSrsEnabled: true })).filter(candidate => candidate.id === 'yomu-local');
        const target = { ...baseCard, provisionalState: true };

        await provider!.addToDeck('yomu-local', target);
        expect(target).toMatchObject({ cardState: ['new'], reviewSource: 'yomu-local', dueAt: 1_000, lastReviewAt: null });
        expect(target.provisionalState).toBeUndefined();

        await provider!.reviewCard(target, 'okay');
        expect(target).toMatchObject({ cardState: ['learning'], reviewSource: 'yomu-local', dueAt: 2_000, lastReviewAt: 1_000 });
    });
});
