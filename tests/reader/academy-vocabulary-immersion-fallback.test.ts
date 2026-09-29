import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import * as http from '../../src/reader/network/http';
import { ImmersionKitClient } from '../../src/reader/immersion/kit';
import { StudyExamples } from '../../src/reader/newtab/study-examples';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

afterEach(() => { vi.restoreAllMocks(); });

describe('Academy vocabulary Immersion fallback', () => {
    it.each([
        { surface: 'おきます', reading: 'おきる', lemma: '起きる', sentence: '毎朝六時に起きる。' },
        { surface: '*review こうえん', reading: 'こうえん', lemma: '公園', sentence: '近くの公園で遊びます。' },
    ])('renders an example for $lemma after trying its authored surface $surface', async ({ surface, reading, lemma, sentence }) => {
        const transport = vi.spyOn(http, 'requestJson').mockImplementation(async url => ({
            examples: new URL(url).searchParams.get('q') === lemma ? [{ id: lemma, sentence }] : [],
        }));
        const card: JPDBCard = {
            vid: -1, sid: -1, rid: 0, spelling: surface, reading,
            frequencyRank: null, partOfSpeech: [], meanings: [], cardState: ['not-in-deck'],
            pitchAccent: [], wordWithReading: null, source: 'fallback', fallbackLookupTerms: [lemma],
        };
        const settings: ReaderSettings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true,
            immersionKitExampleSource: 'immersion-kit', immersionKitShowImages: false,
            immersionKitAutoPlayAudio: false, jpdbDefinitionsEnabled: false };
        const examples = new StudyExamples({
            getSettings: () => settings,
            immersionKit: new ImmersionKitClient(),
            parser: { canParse: () => false, parse: async () => [], fallbackCardFromText: () => card },
            sentences: { peek: () => undefined, prepare: async () => [], enrich: async () => false, highlight() {} },
        });
        const mount = document.createElement('div');
        document.body.append(mount);
        try {
            examples.present({ mount, card, mode: 'word', revealed: true });
            await vi.waitFor(() => expect(mount.querySelector('.jpdb-reader-newtab-immersion')?.textContent).toContain(sentence));
            expect(transport.mock.calls.map(([url]) => new URL(url).searchParams.get('q')))
                .toEqual([surface, reading, lemma]);
            expect(card.spelling).toBe(surface);
            expect(card.fallbackLookupTerms).toEqual([lemma]);
        } finally {
            examples.dispose();
            mount.remove();
        }
    });
});
