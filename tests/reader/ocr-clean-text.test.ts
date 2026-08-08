import { afterEach, describe, expect, it } from 'vitest';

import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import { createLearningTargetModule } from '../../src/reader/languages/module';
import {
    registerLearningTargetModule,
    unregisterLearningTargetModule,
} from '../../src/reader/languages/registry';
import { normalizeOcrResult } from '../../src/reader/ocr/response';
import { cleanOcrText } from '../../src/reader/ocr/response-shared';

// Regression: a code screenshot with one embedded kanji had EVERY space in
// the line stripped ("radar updated :reply" → "radarupdated:reply"), because
// containing any Japanese used to switch the whole line to space-less
// joining. Whitespace is OCR noise only BETWEEN Japanese characters.
describe('cleanOcrText', () => {
    it('strips OCR segment spaces inside Japanese runs', () => {
        expect(cleanOcrText('日本 語 を 読む')).toBe('日本語を読む');
        expect(cleanOcrText('読む。 それ から')).toBe('読む。それから');
    });

    it('keeps Latin spacing in mixed lines with embedded Japanese', () => {
        expect(cleanOcrText('{:radar updated :reply string :options 菜单-or-nil}'))
            .toBe('{:radar updated :reply string :options 菜单-or-nil}');
        expect(cleanOcrText('Deterministic control flow; の 説明'))
            .toBe('Deterministic control flow; の説明');
    });

    it('keeps the natural space at Latin-Japanese boundaries', () => {
        expect(cleanOcrText('iPhone を 買う')).toBe('iPhone を買う');
    });

    it('collapses whitespace runs in Latin-only lines', () => {
        expect(cleanOcrText('state  machine \t grounding')).toBe('state machine grounding');
    });

    it('normalizes fullwidth ellipsis dots', () => {
        expect(cleanOcrText('それ ．．． から')).toBe('それ…から');
    });
});

/**
 * The same rule, one layer up. A recognizer's own line fields used to be read
 * with a private space-stripper instead of the cleaner above, so every OCR
 * surface honoured the rule except the one that turns a provider's JSON into
 * lines — and a space-delimited target came back as a single blob no
 * dictionary could match.
 */
describe('recognizer line text', () => {
    const SWEDISH = 'sv';

    function studySwedish() {
        const target = registerLearningTargetModule(createLearningTargetModule({
            id: 'sv-ocr-response-test-target',
            language: SWEDISH,
            featureSemantics: {
                characterSystem: 'latin',
                phoneticScripts: ['latin'],
                pronunciation: 'none',
                readingAnnotation: 'none',
            },
            detectsText: /[A-Za-zÅÄÖåäö]/u,
        }));
        expect(setActiveLearningTargetLanguage(SWEDISH)).toBe(target);
    }

    afterEach(() => {
        resetActiveLearningTargetLanguage();
        unregisterLearningTargetModule(SWEDISH);
    });

    function lineTexts(value: unknown): string[] {
        return normalizeOcrResult(value, 800, 450)?.lines.map(line => line.text) ?? [];
    }

    it('keeps a Japanese line spaceless, exactly as before', () => {
        expect(lineTexts({
            lines: [{ text: '冒険 を 始めよう', box: { left: 10, top: 20, width: 180, height: 28 } }],
        })).toEqual(['冒険を始めよう']);
    });

    it('keeps the words apart in the language being studied', () => {
        studySwedish();

        expect(lineTexts({
            lines: [{ text: 'Tryck på A', box: { left: 10, top: 20, width: 180, height: 28 } }],
        })).toEqual(['Tryck på A']);
    });

    it('joins the lines of a boxless result without gluing words together', () => {
        // No per-line box, so the whole result collapses into one string.
        const boxless = {
            results: [{
                box: { left: 10, top: 20, width: 180, height: 60 },
                text: [{ content: 'Tryck på' }, { content: 'knappen' }],
            }],
        };

        studySwedish();
        expect(lineTexts(boxless)).toEqual(['Tryck på knappen']);

        resetActiveLearningTargetLanguage();
        expect(lineTexts({
            results: [{
                box: { left: 10, top: 20, width: 180, height: 60 },
                text: [{ content: '冒険を' }, { content: '始めよう' }],
            }],
        })).toEqual(['冒険を始めよう']);
    });
});
