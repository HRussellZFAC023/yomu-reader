import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import { renderTokensToHtml } from '../../src/reader/dom/index';
import { activeLearningTarget } from '../../src/reader/languages/active';
import { ReaderParser } from '../../src/reader/lookup/parser';
import { pointerTextLookupFromTextNode } from '../../src/reader/lookup/pointer-text-lookup';
import { isTargetLanguageText } from '../../src/reader/lookup/target-text';
import { isLookupableJapaneseText, lookupCandidateSentence } from '../../src/reader/lookup/text-helpers';
import { createTextLookupDisplayContext } from '../../src/reader/main/text-lookup';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';
import { testEnSettings } from './helpers/settings-fixture';

const ENGLISH_PAGE = [
    'Sign in to your account',
    'Enter your password right now to continue.',
    'Need help? Contact support.',
];

const NON_JAPANESE_LINES = [
    'right',
    'corazón',
    'ＪＲＡ ２０２６',
    'Привет мир',
    '학교에 갑니다',
    'كِتاب',
    '12345',
];

function latinToken(sentence: string, spelling: string, language?: string): JPDBToken {
    const start = sentence.indexOf(spelling);
    const end = start + spelling.length;
    return {
        card: {
            vid: -start - 1,
            sid: -start - 1,
            rid: 0,
            spelling,
            reading: '',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: ['definition'],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'local',
            ...(language ? { language } : {}),
        },
        start,
        end,
        length: end - start,
        rubies: [],
        pitchClass: '',
        sentence,
    } as unknown as JPDBToken;
}

function visibleRects(): () => void {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({
        x: 0, y: 0, width: 100, height: 20, top: 0, right: 100, bottom: 20, left: 0, toJSON: () => ({}),
    } as DOMRect);
    return () => {
        HTMLElement.prototype.getBoundingClientRect = original;
    };
}

async function parserWithDictionary(terms: Array<Record<string, unknown>>): Promise<ReaderParser> {
    const store = new YomitanDictionaryStore();
    await store.clear();
    await store.importFile(new File([JSON.stringify({
        formatName: 'yomu-yomitan-dictionaries',
        formatVersion: 2,
        terms: terms.map(term => ({ dictionary: 'Japanese-only fixture', glossary: ['gloss'], ...term })),
    })], 'japanese-only-fixture.json', { type: 'application/json' }));
    return new ReaderParser({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: true,
            parserProvider: 'local',
            showPitchAccent: false,
        }),
        jpdb: {} as never,
        dictionaries: store,
    });
}

describe('Yomu reads Japanese only', () => {
    beforeEach(() => {
        window.history.pushState({}, '', '/reading/');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('treats a stored non-Japanese learning target as Japanese without rewriting it', () => {
        const stored = {
            parserProvider: 'local' as const,
            activeLanguageProfileId: 'learner-en-es',
            languageProfiles: [{
                schemaVersion: 2,
                id: 'learner-en-es',
                outputLanguage: 'en',
                learnerLanguage: 'en',
                targetLanguage: 'es',
                uiLocale: 'en',
                parserProvider: 'local',
                dictionaries: { installed: [], enabled: [], order: [] },
                definitionTranslationProviderIds: [],
            }],
        };

        const settings = normalizeReaderSettings(stored as unknown as Partial<ReaderSettings>);

        // The profile keeps what the learner once chose, so a Save writes it
        // back unchanged; nothing at runtime reads it.
        expect(settings.languageProfiles[0]?.targetLanguage).toBe('es');
        expect(activeLearningTarget().language).toBe('ja');
        expect(activeLearningTarget().isLookupableText('right')).toBe(false);
        expect(activeLearningTarget().isLookupableText('日本語')).toBe(true);
        expect('learningTargetChosen' in settings).toBe(false);
        expect('onboardingSeen' in settings).toBe(false);
    });

    it('never treats Latin, Cyrillic, Hangul, Arabic or digits as lookup text', () => {
        for (const line of NON_JAPANESE_LINES) {
            expect(isTargetLanguageText(line), line).toBe(false);
            expect(isLookupableJapaneseText(line), line).toBe(false);
            expect(lookupCandidateSentence(line), line).toBe('');
        }
        // Japanese punctuation on its own is not a word either.
        expect(isLookupableJapaneseText('ー')).toBe(false);
        expect(isLookupableJapaneseText('right・')).toBe(false);
        expect(isLookupableJapaneseText('GIの中でも')).toBe(true);
        expect(isLookupableJapaneseText('ＪＲＡの馬')).toBe(true);
    });

    it('opens no text lookup for an English or punctuation-only selection', () => {
        const state = {
            activePopoverAnchor: undefined,
            defaultTrigger: 'modal' as const,
            hasActivePopover: false,
            previousNavigationEntry: () => undefined,
        };
        expect(createTextLookupDisplayContext('right', {}, state)).toBeNull();
        expect(createTextLookupDisplayContext('Привет', {}, state)).toBeNull();
        expect(createTextLookupDisplayContext('・', {}, state)).toBeNull();
        expect(createTextLookupDisplayContext('日本', {}, state)?.selected).toBe('日本');
    });

    it('finds no pointer word in English text, and only the Japanese word in mixed text', () => {
        document.body.innerHTML = '<p id="en">Enter your password right now</p><p id="mixed">GIの中でも</p>';
        const english = document.getElementById('en')!.firstChild as Text;
        for (let offset = 0; offset < english.data.length; offset++) {
            expect(pointerTextLookupFromTextNode(english, offset), `offset ${offset}`).toBeNull();
        }
        const mixed = document.getElementById('mixed')!.firstChild as Text;
        expect(pointerTextLookupFromTextNode(mixed, 0)).toBeNull();
        expect(pointerTextLookupFromTextNode(mixed, 1)).toBeNull();
        expect(pointerTextLookupFromTextNode(mixed, 3)).not.toBeNull();
    });

    it('paints no word over non-Japanese source text, whatever a provider token claims', () => {
        const sentence = 'Enter your password right now';
        const html = renderTokensToHtml(sentence, [
            latinToken(sentence, 'right'),
            latinToken(sentence, 'password', 'es'),
        ], testEnSettings());
        const root = document.createElement('div');
        root.innerHTML = html;
        expect(root.querySelectorAll('.jpdb-reader-word')).toHaveLength(0);
        expect(root.textContent).toBe(sentence);
    });

    it('parses only the Japanese words of mixed text, even with Latin headwords installed', async () => {
        const parser = await parserWithDictionary([
            { expression: 'right', reading: 'right' },
            { expression: 'GI', reading: 'GI' },
            { expression: 'JRA', reading: 'JRA' },
            { expression: 'ＪＲＡ', reading: 'ＪＲＡ' },
            { expression: 'Привет', reading: 'Привет' },
            { expression: '学校', reading: 'がっこう' },
            { expression: '中', reading: 'なか' },
            { expression: 'の', reading: 'の' },
            { expression: '馬', reading: 'うま' },
        ]);
        const paragraphs = ['Enter your password right now', 'GIの中でも', 'ＪＲＡの馬', 'Привет мир'];

        const parsed = await parser.parse(paragraphs, { allowSegmentedFallback: true });

        expect(parsed[0]).toEqual([]);
        expect(parsed[3]).toEqual([]);
        const surfaces = (index: number) => parsed[index]!.map(token => paragraphs[index]!.slice(token.start, token.end));
        expect(surfaces(1).some(surface => /[A-Za-z]/u.test(surface))).toBe(false);
        expect(surfaces(1)).toContain('中');
        expect(surfaces(2).some(surface => /[Ａ-Ｚａ-ｚA-Za-z]/u.test(surface))).toBe(false);
        expect(surfaces(2)).toContain('馬');
        expect(await parser.lookupTokenAt('Enter your password right now', 21)).toBeUndefined();
    });

    it('annotates nothing and parses nothing on an English-only page', async () => {
        const restoreRects = visibleRects();
        document.body.innerHTML = ENGLISH_PAGE.map(line => `<p>${line}</p>`).join('');
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [latinToken(text, text.split(' ')[0]!)]));
        const scanner = new VisiblePageScanner({
            getSettings: () => testEnSettings(),
            parseJapanese,
            pauseMutationObserver: callback => callback(),
            preloadParsedTokens: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            toast: vi.fn(),
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            expect(parseJapanese).not.toHaveBeenCalled();
            expect(document.querySelectorAll('.jpdb-reader-word')).toHaveLength(0);
            expect(document.body.textContent).toBe(ENGLISH_PAGE.join(''));
        } finally {
            scanner.destroy();
            restoreRects();
        }
    });
});
