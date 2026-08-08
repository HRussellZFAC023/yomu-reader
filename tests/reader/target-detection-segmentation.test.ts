import { afterEach, describe, expect, it } from 'vitest';

import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import { createLearningTargetModule } from '../../src/reader/languages/module';
import type { LearningTargetModule } from '../../src/reader/languages/types';
import {
    registerLearningTargetModule,
    unregisterLearningTargetModule,
} from '../../src/reader/languages/registry';
import type {
    YomitanExactTermCandidateRequest,
    YomitanTermEntry,
} from '../../src/reader/dictionaries/yomitan';

// Core call sites, imported exactly as core ships them. None of these files
// knows that any target other than Japanese exists.
import { collectFragmentTextTargetsIn, documentHasJapaneseText } from '../../src/reader/dom/index';
import { isCompactInteractiveChromeText } from '../../src/reader/dom/decoration-policy';
import { fallbackLookupRangeAtOffset, ReaderParser } from '../../src/reader/lookup/parser';
import {
    pointerTextLookupFromTextNode,
    pointerTextRunAt,
} from '../../src/reader/lookup/pointer-text-lookup';
import { pushTargetLanguageOcrLine } from '../../src/reader/ocr/response-shared';
import { isTargetLanguageText, segmentTargetLanguageText } from '../../src/reader/lookup/target-text';
import type { OcrLine, OcrRect } from '../../src/reader/ocr/response-shared';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

const AD_HOC_LANGUAGE = 'sv';

afterEach(() => {
    resetActiveLearningTargetLanguage();
    unregisterLearningTargetModule(AD_HOC_LANGUAGE);
    document.body.innerHTML = '';
});

/**
 * A Latin-script target with the generic whitespace segmentation from
 * `languages/module.ts`. Latin is deliberately a script Japanese detection can
 * never claim, so every assertion below reads as a straight yes/no on which
 * target answered.
 */
function activateLatinTarget() {
    const target = registerLearningTargetModule(createLearningTargetModule({
        id: 'sv-detection-test-target',
        language: AD_HOC_LANGUAGE,
        featureSemantics: {
            characterSystem: 'latin',
            phoneticScripts: ['latin'],
            pronunciation: 'none',
            readingAnnotation: 'none',
        },
        detectsText: /[A-Za-z]/u,
    }));
    expect(setActiveLearningTargetLanguage(AD_HOC_LANGUAGE)).toBe(target);
    return target;
}

function exactLookupParser(term: string): ReaderParser {
    const entry: YomitanTermEntry = {
        expression: term,
        reading: term,
        glossary: [`definition of ${term}`],
        dictionary: 'Target detection fixture',
    };
    return new ReaderParser({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            parserProvider: 'local',
            localDictionariesEnabled: true,
            showPitchAccent: false,
        }),
        jpdb: {} as never,
        dictionaries: {
            hasTermDictionaries: async () => true,
            findTermMatches: async () => [],
            lookupExactTermCandidates: async (
                requests: readonly YomitanExactTermCandidateRequest[],
                _preferences: unknown,
                target: LearningTargetModule,
            ) => requests.flatMap((request, requestIndex) => (
                target.normalizeText(request.lookupCandidate.term) === target.normalizeText(entry.expression)
                    ? [{ request, requestIndex, entry }]
                    : []
            )),
            lookupTermMeta: async () => [],
            lookupKanji: async () => [],
        } as never,
    });
}

function box(): OcrRect {
    return { left: 0, top: 0, width: 40, height: 10 };
}

describe('detection resolves through the active learning target', () => {
    it('keeps the Japanese answers the hardcoded regex used to give', () => {
        expect(isTargetLanguageText('日本語')).toBe(true);
        expect(isTargetLanguageText('hej du')).toBe(false);
        expect(isTargetLanguageText('')).toBe(false);
    });

    it('follows a non-Japanese target instead', () => {
        activateLatinTarget();

        expect(isTargetLanguageText('hej du')).toBe(true);
        expect(isTargetLanguageText('日本語')).toBe(false);
    });

    // dom/index.ts — the page-eligibility probe boot and main gate the whole
    // reader on. While this was HAS_JAPANESE, no other target could wake Yomu up.
    it('decides page eligibility for the active target', () => {
        document.body.innerHTML = '<p>Hej, vad heter du?</p>';
        expect(documentHasJapaneseText()).toBe(false);

        activateLatinTarget();
        expect(documentHasJapaneseText()).toBe(true);
    });

    it('still finds a Japanese page eligible under the default target', () => {
        document.body.innerHTML = '<p>日本語のページです</p>';
        expect(documentHasJapaneseText()).toBe(true);
    });

    // dom/index.ts — the text-node scan filter that decides what is annotatable.
    it('collects annotatable text targets for the active target', () => {
        document.body.innerHTML = '<p>Hej, vad heter du?</p>';
        expect(collectFragmentTextTargetsIn(document.body, 40, false, '', { minLength: 1 })).toHaveLength(0);

        activateLatinTarget();
        const targets = collectFragmentTextTargetsIn(document.body, 40, false, '', { minLength: 1 });
        expect(targets.map(target => target.text)).toEqual(['Hej, vad heter du?']);
    });

    it('keeps collecting Japanese text targets under the default target', () => {
        document.body.innerHTML = '<p>日本語のページです</p>';
        const targets = collectFragmentTextTargetsIn(document.body, 40, false, '', { minLength: 1 });
        expect(targets.map(target => target.text)).toEqual(['日本語のページです']);
    });

    // dom/decoration-policy.ts — chrome-label admission.
    it('admits compact chrome labels in the active target language', () => {
        expect(isCompactInteractiveChromeText('Meny')).toBe(false);
        expect(isCompactInteractiveChromeText('設定')).toBe(true);

        activateLatinTarget();
        expect(isCompactInteractiveChromeText('Meny')).toBe(true);
        expect(isCompactInteractiveChromeText('設定')).toBe(false);
    });

    // ocr/response-shared.ts — OCR line admission. The OCR request itself
    // already asks for the active target's language, so the response filter
    // that threw away everything non-Japanese was discarding its own answer.
    it('keeps OCR lines in the active target language', () => {
        const japaneseOnly: OcrLine[] = [];
        pushTargetLanguageOcrLine(japaneseOnly, 'Hej du', box());
        pushTargetLanguageOcrLine(japaneseOnly, '日本語', box());
        expect(japaneseOnly.map(line => line.text)).toEqual(['日本語']);

        activateLatinTarget();
        const latin: OcrLine[] = [];
        pushTargetLanguageOcrLine(latin, 'Hej du', box());
        pushTargetLanguageOcrLine(latin, '日本語', box());
        expect(latin.map(line => line.text)).toEqual(['Hej du']);
    });
});

describe('segmentation resolves through the active learning target', () => {
    it('keeps the Japanese segmenter as Japanese behaviour', () => {
        expect(segmentTargetLanguageText('日本語を読む').map(segment => segment.text))
            .toEqual(['日本語', 'を', '読む']);
        // Japanese is scriptio continua, so the generic whitespace segmenter
        // would return the whole run; this proves the real segmenter still runs.
        expect(segmentTargetLanguageText('日本語を読む')).not.toHaveLength(1);
    });

    it('uses the active target segmenter for a non-Japanese target', () => {
        activateLatinTarget();
        expect(segmentTargetLanguageText('hej vad heter du').map(segment => segment.text))
            .toEqual(['hej', 'vad', 'heter', 'du']);
    });

    // lookup/parser.ts — the pointer-lookup range, driven off segmentation.
    it('resolves a fallback lookup range through the active target segmenter', () => {
        // Japanese: the segmenter finds the word the offset lands inside.
        expect(fallbackLookupRangeAtOffset('日本語を読む', 1)).toEqual({ start: 0, end: 3 });
        // Latin text has no Japanese segment and no Japanese script group.
        expect(fallbackLookupRangeAtOffset('hej vad heter du', 5)).toBeUndefined();

        activateLatinTarget();
        expect(fallbackLookupRangeAtOffset('hej vad heter du', 5)).toEqual({ start: 4, end: 7 });
    });
});

describe('pointer lookup resolves through the active learning target', () => {
    const cases = [
        { language: 'ja', text: '私は日本語を読む', runTerm: '私は日本語を読む', term: '日本語', offset: 3 },
        { language: 'ko', text: '나는 한국어를 읽는다', runTerm: '한국어를', term: '한국어를', offset: 4 },
        { language: 'es', text: 'Leo español cada día', runTerm: 'español', term: 'español', offset: 6 },
        { language: 'ar', text: 'أقرأ العربية يوميا', runTerm: 'العربية', term: 'العربية', offset: 7 },
        { language: 'el', text: 'Διαβάζω ελληνικά κάθε μέρα', runTerm: 'ελληνικά', term: 'ελληνικά', offset: 9 },
    ] as const;

    it.each(cases)('$language opens the active profile word under the pointer', async ({ language, text, runTerm, term, offset }) => {
        expect(setActiveLearningTargetLanguage(language)).not.toBeNull();
        document.body.innerHTML = `<p>${text}</p>`;
        const node = document.querySelector('p')?.firstChild;
        expect(node).toBeInstanceOf(Text);

        const lookup = pointerTextLookupFromTextNode(node as Text, offset);
        expect(lookup).not.toBeNull();
        expect(lookup && lookup.text.slice(lookup.start, lookup.end)).toBe(runTerm);
        const token = await exactLookupParser(term).lookupTokenAt(
            lookup!.text,
            lookup!.offset,
            { start: lookup!.start, end: lookup!.end },
        );
        expect(token).toMatchObject({
            start: text.indexOf(term),
            end: text.indexOf(term) + term.length,
            card: { spelling: term },
        });
    });

    it('keeps every Japanese caret boundary byte-for-byte equal to the old run algorithm', () => {
        const text = 'abc 日本語を読む。カタカナー・々ヶ xyz';
        const legacyCharacter = /[぀-ヿ㐀-鿿々〆ヵヶー]/u;
        const legacyRunAt = (offset: number) => {
            let index = Math.min(Math.max(offset, 0), text.length - 1);
            const isCharacterAt = (at: number) => legacyCharacter.test(text[at] ?? '');
            if (!isCharacterAt(index) && index > 0 && isCharacterAt(index - 1)) index--;
            if (!isCharacterAt(index)) return null;
            let start = index;
            let end = index + 1;
            while (start > 0 && isCharacterAt(start - 1)) start--;
            while (end < text.length && isCharacterAt(end)) end++;
            return { start, end, offset: index };
        };

        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        const before = Array.from({ length: text.length + 3 }, (_, index) => legacyRunAt(index - 1));
        const after = Array.from({ length: text.length + 3 }, (_, index) => pointerTextRunAt(text, index - 1));
        expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    });
});
