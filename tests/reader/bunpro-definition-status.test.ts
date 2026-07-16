import { describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { searchWordDetailHtml } from '../../src/reader/newtab/search-view';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';

type LoaderDependencies = ConstructorParameters<typeof CardRenderDataLoader>[0];

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    return { promise: new Promise<T>(done => { resolve = done; }), resolve };
}

const card: JPDBCard = {
    vid: 1,
    sid: 0,
    rid: 0,
    spelling: '食べる',
    reading: 'たべる',
    frequencyRank: null,
    partOfSpeech: ['verb'],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: [],
    wordWithReading: null,
};

function loader(
    settings: Partial<ReaderSettings>,
    search: (...args: any[]) => Promise<unknown> = vi.fn(async () => ({})),
    bunproAvailable = true,
): CardRenderDataLoader {
    return new CardRenderDataLoader({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: false,
            showPitchAccent: false,
            ankiEnabled: false,
            jpdbDefinitionsEnabled: false,
            jitenDefinitionsEnabled: false,
            jpdbMiningEnabled: false,
            ...settings,
        }),
        dictionaries: {
            lookup: vi.fn(async () => []),
            lookupKanji: vi.fn(async () => []),
            lookupTermMeta: vi.fn(async () => []),
        },
        jpdbPublicPitch: { lookup: vi.fn(async () => []) },
        jpdbVocabulary: { lookup: vi.fn(async () => null), search: vi.fn(async () => []) },
        anki: { findExistingCards: vi.fn(), deckNames: vi.fn() },
        jpdb: { listDecks: vi.fn() },
        bunpro: bunproAvailable ? {
            search,
            getVocab: vi.fn(async () => ({})),
            getGrammarPoint: vi.fn(async () => ({})),
        } : undefined,
        isJpdbBackedCard: () => false,
    } as unknown as LoaderDependencies);
}

async function statusFor(settings: Partial<ReaderSettings>, search: (...args: any[]) => Promise<unknown> = vi.fn(async () => ({}))): Promise<unknown> {
    const data = await loader(settings, search).load(card).all;
    return (data as typeof data & { bunproDefinitionStatus: unknown }).bunproDefinitionStatus;
}

describe('Bunpro definition absence status', () => {
    it('distinguishes disabled, missing-auth, and expired-auth states without a request', async () => {
        await expect(statusFor({ bunproDefinitionsEnabled: false })).resolves.toMatchObject({ state: 'disabled' });
        await expect(statusFor({ bunproDefinitionsEnabled: true, bunproFrontendApiToken: '' })).resolves.toMatchObject({ state: 'auth-missing' });
        await expect(statusFor({
            bunproDefinitionsEnabled: true,
            bunproFrontendApiToken: 'redacted-test-token',
            bunproFrontendApiTokenExpiresAt: '2020-01-01T00:00:00.000Z',
        })).resolves.toMatchObject({ state: 'auth-expired' });
    });

    it('distinguishes an unavailable client and a caller-excluded definition load', async () => {
        const credential = {
            bunproDefinitionsEnabled: true,
            bunproFrontendApiToken: 'redacted-test-token',
            bunproFrontendApiTokenExpiresAt: '2099-01-01T00:00:00.000Z',
        };
        await expect(loader(credential, undefined, false).load(card).all).resolves.toMatchObject({
            bunproDefinitionStatus: { state: 'client-unavailable' },
        });
        await expect(loader(credential).load(card, { includeBunproDefinition: false }).all).resolves.toMatchObject({
            bunproDefinitionStatus: { state: 'disabled', reason: 'load-excluded' },
        });
    });

    it('distinguishes an exact-match miss from a request error', async () => {
        const credential = {
            bunproDefinitionsEnabled: true,
            bunproFrontendApiToken: 'redacted-test-token',
            bunproFrontendApiTokenExpiresAt: '2099-01-01T00:00:00.000Z',
        };
        await expect(statusFor(credential, vi.fn(async () => ({ vocabs: { data: [] } })))).resolves.toMatchObject({ state: 'no-match' });
        await expect(statusFor(credential, vi.fn(async () => { throw new Error('network down'); }))).resolves.toMatchObject({ state: 'error' });
    });

    it('reports success only for an exact expression-and-reading match', async () => {
        await expect(statusFor({
            bunproDefinitionsEnabled: true,
            bunproFrontendApiToken: 'redacted-test-token',
            bunproFrontendApiTokenExpiresAt: '2099-01-01T00:00:00.000Z',
        }, vi.fn(async () => ({
            vocabs: { data: [{ id: 42, attributes: { id: 42, title: '食べる', kana: 'たべる', meaning: 'to eat' } }] },
        })))).resolves.toMatchObject({ state: 'success' });
    });

    it('reports the initial timeout and the eventual no-match outcome on the shared request', async () => {
        vi.useFakeTimers();
        try {
            const response = deferred<unknown>();
            const search = vi.fn(() => response.promise);
            const load = loader({
                bunproDefinitionsEnabled: true,
                bunproFrontendApiToken: 'redacted-test-token',
                bunproFrontendApiTokenExpiresAt: '2099-01-01T00:00:00.000Z',
            }, search).load(card);

            await vi.advanceTimersByTimeAsync(4_000);
            await expect(load.all).resolves.toMatchObject({ bunproDefinitionStatus: { state: 'timeout' } });

            response.resolve({ vocabs: { data: [] } });
            await expect(load.hydrateBunproDefinitionResult?.()).resolves.toMatchObject({
                info: null,
                status: { state: 'no-match', reason: 'no-results' },
            });
            expect(search).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('exposes non-visual lookup status evidence on rendered search details', () => {
        const html = searchWordDetailHtml(card, {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbVocabularyInfo: null,
            bunproDefinitionStatus: { state: 'no-match', reason: 'reading-mismatch' },
        }, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en' }),
            text: key => key,
            sourceAttributes: () => '',
            dictionaryLabel: name => name,
            kanjiSourceTitle: sourceId => sourceId,
        });

        expect(html).toContain('data-bunpro-definition-status="no-match"');
        expect(html).toContain('data-bunpro-definition-reason="reading-mismatch"');
        expect(html).not.toContain('redacted-test-token');
    });
});
