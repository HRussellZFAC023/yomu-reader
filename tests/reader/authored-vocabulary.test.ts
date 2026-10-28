import { describe, expect, it, vi } from 'vitest';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';
import {
    applyAuthoredVocabularyOverrides,
    AUTHORED_VOCABULARY_ATTRIBUTE,
    encodeAuthoredVocabularyAnnotations,
} from '../../src/reader/lookup/authored-vocabulary';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { renderedWordPrivateValue } from '../../src/reader/dom/rendered-word-private-state';

describe('authored vocabulary disambiguation', () => {
    it('replaces a valid but contextually wrong homograph without changing unrelated tokens', () => {
        const sentence = 'この道をまっすぐ行って、右です。';
        const root = document.createElement('p');
        root.setAttribute(AUTHORED_VOCABULARY_ATTRIBUTE, encodeAuthoredVocabularyAnnotations([{
            surface: '行って',
            lemma: '行く',
            reading: 'いって',
            pitch: { pattern: 'LHHH', source: 'Jiten 1578850/0 + authored te-form' },
        }]));
        const wrong = token(sentence, '行って', '行う', 'おこなう');
        const right = token(sentence, '右', '右', 'みぎ');

        const result = applyAuthoredVocabularyOverrides({ text: sentence, parent: root }, [wrong, right]);
        const repaired = result.find(item => item.start === sentence.indexOf('行って'));

        expect(result).toHaveLength(2);
        expect(result).toContain(right);
        expect(repaired?.card).toMatchObject({
            spelling: '行って',
            reading: 'いって',
            source: 'fallback',
            fallbackLookupTerms: ['行く'],
            pitchAccent: [],
        });
        expect(repaired?.rubies).toEqual([{
            text: 'いって',
            start: sentence.indexOf('行って'),
            end: sentence.indexOf('行って') + 3,
            length: 3,
        }]);
        expect(repaired?.pitchClass).toBe('heiban');
    });

    it('fails closed for malformed or linguistically invalid declarations', () => {
        const root = document.createElement('p');
        root.setAttribute(AUTHORED_VOCABULARY_ATTRIBUTE, '{bad json');
        const original = token('行って', '行って', '行う', 'おこなう');
        expect(applyAuthoredVocabularyOverrides({ text: '行って', parent: root }, [original])).toEqual([original]);

        root.setAttribute(AUTHORED_VOCABULARY_ATTRIBUTE, JSON.stringify([{
            surface: '行って', lemma: '行く', reading: 'go', pitch: { pattern: 'LHHH', source: 'invented' },
        }]));
        expect(applyAuthoredVocabularyOverrides({ text: '行って', parent: root }, [original])).toEqual([original]);
    });

    it('keeps a local parser pitch class when an authored surface supplies only reading and lemma', () => {
        const root = document.createElement('p');
        root.setAttribute(AUTHORED_VOCABULARY_ATTRIBUTE, encodeAuthoredVocabularyAnnotations([{
            surface: '駅', lemma: '駅', reading: 'えき',
        }]));
        const parsed = token('駅', '駅', '駅', 'えき');
        parsed.pitchClass = 'heiban';

        const [result] = applyAuthoredVocabularyOverrides({ text: '駅', parent: root }, [parsed]);

        expect(result?.card).toMatchObject({ source: 'fallback', fallbackLookupTerms: ['駅'] });
        expect(result?.pitchClass).toBe('heiban');
        expect(result?.rubies).toEqual([{ text: 'えき', start: 0, end: 1, length: 1 }]);
    });

    it('repairs the contextual reading before the canonical page scanner paints or enriches it', async () => {
        const sentence = 'この道をまっすぐ行って、右です。';
        const line = document.createElement('p');
        line.lang = 'ja';
        line.textContent = sentence;
        line.setAttribute(AUTHORED_VOCABULARY_ATTRIBUTE, encodeAuthoredVocabularyAnnotations([{
            surface: '行って',
            lemma: '行く',
            reading: 'いって',
            pitch: { pattern: 'LHHH', source: 'Jiten 1578850/0 + authored te-form' },
        }]));
        document.body.replaceChildren(line);
        // The default jsdom URL now matches the hosted-docs profile (curated
        // `.vp-doc` only); this authored line is ordinary page prose, so scan it
        // as a plain page.
        window.history.pushState({}, '', '/reading/');
        const restoreRects = mockVisibleElementRects();
        const enrichPitchWords = vi.fn(async (tokens: JPDBToken[]) => {
            expect(tokens.find(item => item.start === sentence.indexOf('行って'))?.card).toMatchObject({
                spelling: '行って',
                reading: 'いって',
                fallbackLookupTerms: ['行く'],
            });
        });
        const scanner = new VisiblePageScanner({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                showFurigana: true,
                furiganaMode: 'all',
                showPitchAccent: true,
            }),
            parseJapanese: vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [token(text, '行って', '行う', 'おこなう')])),
            pauseMutationObserver: callback => callback(),
            preloadParsedTokens: vi.fn(),
            enrichPitchWords,
            enrichAnkiWords: vi.fn(),
            toast: vi.fn(),
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const word = line.querySelector<HTMLElement>('.jpdb-reader-word[data-surface="行って"]');
            expect(enrichPitchWords).toHaveBeenCalledTimes(1);
            expect(word?.dataset.expression).toBe('行って');
            expect(word?.dataset.reading).toBe('いって');
            expect(word?.dataset.pitchClass).toBe('heiban');
            expect(word && renderedWordPrivateValue(word, 'cardSource')).toBe('fallback');
            // The Reader correctly keeps okurigana on the base and only puts
            // the non-visible reading for 行 above the kanji.
            expect(word?.querySelector('rt')?.textContent).toBe('い');
            expect(line.textContent?.replace('(い)', '')).toBe(sentence);
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.replaceChildren();
            window.history.pushState({}, '', '/');
        }
    });
});

function mockVisibleElementRects(): () => void {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        width: 320,
        height: 40,
        top: 0,
        right: 320,
        bottom: 40,
        left: 0,
        toJSON: () => ({}),
    } as DOMRect);
    return () => {
        HTMLElement.prototype.getBoundingClientRect = originalRect;
    };
}

function token(sentence: string, surface: string, spelling: string, reading: string): JPDBToken {
    const start = sentence.indexOf(surface);
    const card: JPDBCard = {
        vid: 42,
        sid: 0,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
    };
    return {
        card,
        start,
        end: start + surface.length,
        length: surface.length,
        rubies: [{ text: reading, start, end: start + surface.length, length: surface.length }],
        pitchClass: '',
        sentence,
    };
}
