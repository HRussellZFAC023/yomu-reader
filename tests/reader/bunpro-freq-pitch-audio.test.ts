import { describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { getAudioCandidates } from '../../src/reader/audio/player';
import { isKnownCorsBlockedPublicAudioCdnUrl } from '../../src/reader/network/proxy-fetch';
import { DEFAULT_SETTINGS, normalizeAudioSources } from '../../src/reader/settings';
import { bunproFrequencyRank } from '../../src/reader/cards/frequency-ranks';
import { normalizePitchPatternsForReading, pitchLevelsForDisplay } from '../../src/reader/lookup/pitch-accent';
import { renderWordPills } from '../../src/reader/sources/word-pills';
import type { AudioSourceSetting, JPDBCard, ReaderSettings } from '../../src/reader/app/types';

type LoaderDependencies = ConstructorParameters<typeof CardRenderDataLoader>[0];

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    return { promise: new Promise<T>(done => { resolve = done; }), resolve };
}

function card(spelling: string, reading: string): JPDBCard {
    return {
        vid: 1,
        sid: 2,
        rid: 3,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: ['noun'],
        meanings: [],
        cardState: ['new'],
        pitchAccent: [],
        wordWithReading: null,
    };
}

function bunproSource(voice = ''): AudioSourceSetting {
    return { type: 'bunpro', url: '', voice, enabled: true };
}

function bunproLoader(
    settings: Partial<ReaderSettings>,
    publicPitch: () => Promise<string[]> = async () => [],
): CardRenderDataLoader {
    return new CardRenderDataLoader({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: false,
            ankiEnabled: false,
            jpdbDefinitionsEnabled: false,
            jitenDefinitionsEnabled: false,
            jpdbMiningEnabled: false,
            bunproFrontendApiToken: 'redacted-test-token',
            bunproFrontendApiTokenExpiresAt: '2099-01-01T00:00:00.000Z',
            ...settings,
        }),
        dictionaries: {
            lookup: vi.fn(async () => []),
            lookupKanji: vi.fn(async () => []),
            lookupTermMeta: vi.fn(async () => []),
        },
        jpdbPublicPitch: { lookup: vi.fn(publicPitch) },
        jpdbVocabulary: { lookup: vi.fn(async () => null), search: vi.fn(async () => []) },
        anki: { findExistingCards: vi.fn(), deckNames: vi.fn() },
        jpdb: { listDecks: vi.fn() },
        bunpro: {
            search: vi.fn(async () => ({ vocabs: { data: [{
                id: 42,
                attributes: { id: 42, title: '人間', kana: 'にんげん', slug: '人間', meaning: 'human being' },
            }] } })),
            getVocab: vi.fn(async () => ({
                data: { attributes: {
                    pitch_accent_stress: 'HLLL',
                    frequency_anime: 793,
                    frequency_novels: 6182,
                    frequency_netflix: 778,
                    frequency_dictionary: 40271,
                } },
                included: [],
            })),
            getGrammarPoint: vi.fn(async () => ({})),
        },
        isJpdbBackedCard: () => false,
    } as unknown as LoaderDependencies);
}

describe('Bunpro pronunciation audio source', () => {
    it('yields female and male CDN candidates for the word', async () => {
        const candidates = await getAudioCandidates(bunproSource(), card('人間', 'にんげん'), 1000, '');
        expect(candidates.map(candidate => candidate.url)).toEqual([
            'https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/pronunciation/%E4%BA%BA%E9%96%93-female.mp3',
            'https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/pronunciation/%E4%BA%BA%E9%96%93-male.mp3',
        ]);
    });

    it('respects the voice filter', async () => {
        const candidates = await getAudioCandidates(bunproSource('male'), card('人間', 'にんげん'), 1000, '');
        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.url).toContain('-male.mp3');
    });

    it('yields no candidates for non-Japanese spellings', async () => {
        expect(await getAudioCandidates(bunproSource(), card('abc', 'abc'), 1000, '')).toEqual([]);
    });

    it('is seeded OPT-IN (disabled) in defaults and into existing saved source lists', () => {
        const seeded = DEFAULT_SETTINGS.audioSources.find(source => source.type === 'bunpro');
        expect(seeded?.enabled).toBe(false);
        const migrated = normalizeAudioSources([
            { type: 'jpod101', url: '', voice: '', enabled: true },
            { type: 'text-to-speech', url: '', voice: '', enabled: true },
        ]);
        const added = migrated.find(source => source.type === 'bunpro');
        expect(added).toBeTruthy();
        expect(added?.enabled).toBe(false);
    });

    it('routes CDN blob fetches through the worker proxy (no CORS headers on the CDN)', () => {
        expect(isKnownCorsBlockedPublicAudioCdnUrl('https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/pronunciation/人間-female.mp3')).toBe(true);
    });
});

describe('Bunpro pitch accent stress', () => {
    it('LHHHH normalizes to a renderable heiban contour for こんにちは', () => {
        const patterns = normalizePitchPatternsForReading(['LHHHH'], 'こんにちは');
        expect(patterns).toHaveLength(1);
        expect(pitchLevelsForDisplay(patterns[0]!, 'こんにちは')).toEqual(['L', 'H', 'H', 'H', 'H']);
    });

    it('appending never clobbers an existing JPDB pattern', () => {
        const existing = ['LHHH'];
        const bunpro = normalizePitchPatternsForReading(['LHHH'], 'にんげん');
        const merged = [...existing, ...bunpro.filter(pattern => !existing.includes(pattern))];
        expect(merged).toEqual(existing);
    });

    it('waits for primary pitch evidence before appending Bunpro variants', async () => {
        const publicPitch = deferred<string[]>();
        const c = card('人間', 'にんげん');
        const load = bunproLoader({ bunproDefinitionsEnabled: true, showPitchAccent: true }, () => publicPitch.promise).load(c);

        await Promise.resolve();
        await Promise.resolve();
        expect(c.pitchAccent).toEqual([]);

        publicPitch.resolve(['LHHH']);
        await load.pitchAccent;
        expect(c.pitchAccent).toEqual(['LHHH', 'HLLL']);
    });
});

describe('Bunpro frequency evidence separation', () => {
    it('does not leak into the Jiten/JPDB single-rank pills', () => {
        const c = card('人間', 'にんげん');
        const rank = bunproFrequencyRank(c, {
            expression: '人間',
            reading: 'にんげん',
            frequencies: [{ list: 'general', rank: 178 }, { list: 'anime', rank: 188 }],
        });
        const html = renderWordPills({
            card: c,
            jpdbUrl: 'https://jpdb.io/vocabulary/1/人間/にんげん',
            settings: DEFAULT_SETTINGS,
            frequencyRanks: rank ? { bunpro: rank } : {},
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        });
        expect(html).toContain('>General #178</span>');
        expect(html).not.toContain('Jiten #');
        expect(html).not.toContain('JPDB #');
    });

    it('loads enabled frequency evidence even when Bunpro definitions are hidden', async () => {
        const c = card('人間', 'にんげん');
        const data = await bunproLoader({
            bunproDefinitionsEnabled: false,
            showPitchAccent: false,
        }).load(c).all;

        expect(data.bunproDefinitionStatus).toEqual({ state: 'disabled', reason: 'definitions-disabled' });
        expect(data.bunproDefinitionInfo).toBeNull();
        expect(data.frequencyRanks?.bunpro).toMatchObject({
            provider: 'bunpro',
            rank: 40271,
            lists: [
                { list: 'anime', rank: 793 },
                { list: 'novels', rank: 6182 },
                { list: 'netflix', rank: 778 },
                { list: 'dictionary', rank: 40271 },
            ],
        });
    });
});
