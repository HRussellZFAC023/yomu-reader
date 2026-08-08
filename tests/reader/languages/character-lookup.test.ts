import { afterEach, describe, expect, it } from 'vitest';

import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import {
    targetCanLookupCharacter,
    targetCanLookupWritingUnit,
    targetSupportsCharacterLookup,
    usesJapaneseProviders,
} from '../../../src/reader/languages/character-lookup';
import { isUnifiedIdeograph } from '../../../src/reader/languages/han';
import { learningTargetModuleFor, registerLearningTargetModule, unregisterLearningTargetModule } from '../../../src/reader/languages/registry';
import { isKanjiCharacter } from '../../../src/reader/popup/pitch';
import {
    card,
    renderModalCard,
    testCardPopoverRenderer,
} from '../jpdb/fixtures';

afterEach(() => {
    resetActiveLearningTargetLanguage();
    unregisterLearningTargetModule('zh');
    document.body.replaceChildren();
});

describe('character lookup capability', () => {
    it('recognises Japanese kanji beyond the BMP without truncating surrogate pairs', () => {
        for (const character of ['𠮶', '𡃁', '𠮟', '𩸽']) {
            expect(isUnifiedIdeograph(character)).toBe(true);
            expect(isKanjiCharacter(character)).toBe(true);
            expect(Array.from(character)).toHaveLength(1);
        }
        expect(isUnifiedIdeograph('𠮶a')).toBe(false);
        expect(isUnifiedIdeograph('々')).toBe(false);
    });

    it('gives Han targets character lookup without giving them Japanese providers', () => {
        // The two questions were deliberately separated when this module was
        // written: "does this target have trustworthy per-character data" and "may
        // Japanese-only providers run". Chinese answered no to both because the
        // catalogue shipped no Chinese character data — and the file's own comment
        // anticipated the day it would: "A future Chinese target may gain
        // trustworthy per-character data without thereby becoming eligible for
        // JPDB, Jiten, Japanese pitch, or the Japanese parser."
        //
        // MEASURED 2026-08-02: that day has arrived. The published catalogue ships
        // CC-CEDICT.Hanzi, EDHCC, Wiktionary Hanzi and 康熙字典 for zh, and Words.hk
        // Honzi for yue — real per-character Yomitan kanji banks. So character
        // lookup is now correct for Han targets, and the invariant this test exists
        // to protect is the OTHER half: Japanese providers stay Japanese.
        expect(targetSupportsCharacterLookup()).toBe(true);
        expect(targetCanLookupCharacter('𠮟')).toBe(true);
        expect(usesJapaneseProviders()).toBe(true);

        for (const target of ['zh', 'yue'] as const) {
            expect(setActiveLearningTargetLanguage(target)).not.toBeNull();
            expect(targetSupportsCharacterLookup()).toBe(true);
            expect(targetCanLookupCharacter('𡃁')).toBe(true);
            // The load-bearing assertion: never a Japanese provider for Chinese.
            expect(usesJapaneseProviders()).toBe(false);
        }
    });

    it('uses a one-grapheme term lookup when a target has no character bank', () => {
        for (const [target, unit] of [['es', 'ñ'], ['ru', 'ё'], ['th', 'น้ำ']] as const) {
            expect(setActiveLearningTargetLanguage(target)).not.toBeNull();
            expect(targetSupportsCharacterLookup()).toBe(true);
            expect(targetCanLookupWritingUnit(unit)).toBe(true);
            expect(targetCanLookupWritingUnit(`${unit}${unit}`)).toBe(false);
            // Dedicated character-bank UI remains off; this Adapter enters the
            // ordinary term dictionary with one intact grapheme.
            expect(targetCanLookupCharacter('漢')).toBe(false);
            expect(usesJapaneseProviders()).toBe(false);
        }
    });

    it('does not infer Japanese provider eligibility from character support', () => {
        const chinese = learningTargetModuleFor('zh');
        expect(chinese).not.toBeNull();
        registerLearningTargetModule({
            ...chinese!,
            id: 'zh-character-data-test',
            capabilities: {
                ...chinese!.capabilities,
                'character-lookup': true,
            },
        });
        setActiveLearningTargetLanguage('zh');

        expect(targetSupportsCharacterLookup()).toBe(true);
        expect(targetCanLookupCharacter('学')).toBe(true);
        expect(usesJapaneseProviders()).toBe(false);
    });

    it('renders inline kanji navigation only when the active target owns character data', () => {
        const japanese = renderModalCard(testCardPopoverRenderer(), {
            ...card,
            spelling: '𠮟る',
            reading: 'しかる',
        }, '𠮟る。');
        expect(japanese).toContain('data-jpdb-reader-kanji-nav');
        expect(japanese).toContain('data-action="kanji" data-kanji="𠮟"');

        // Han targets now own character data (see above), so the navigation is
        // correct for them too — a Cantonese reader can open 𡃁 the same way.
        for (const target of ['zh', 'yue'] as const) {
            setActiveLearningTargetLanguage(target);
            const han = renderModalCard(testCardPopoverRenderer(), {
                ...card,
                spelling: '𡃁好',
                reading: 'ngam4 hou2',
            }, '我𡃁好。');
            expect(han).toContain('data-jpdb-reader-kanji-nav');
            // Each Han character becomes its own opener, exactly as 𠮟 does above —
            // the literal spelling no longer appears as one run because the
            // navigation wraps every character, which is the point of it.
            expect(han).toContain('data-action="kanji" data-kanji="𡃁"');
            expect(han).toContain('data-action="kanji" data-kanji="好"');
        }

        // A target with no per-character script must render none of it.
        setActiveLearningTargetLanguage('es');
        const spanish = renderModalCard(testCardPopoverRenderer(), {
            ...card,
            spelling: 'hablamos',
            reading: 'aˈβlamos',
        }, 'Hablamos español.');
        expect(spanish).not.toContain('data-jpdb-reader-kanji-nav');
        expect(spanish).not.toContain('data-action="kanji"');
    });
});
