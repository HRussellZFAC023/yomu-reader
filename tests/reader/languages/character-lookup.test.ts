import { afterEach, describe, expect, it } from 'vitest';

import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import {
    targetCanLookupCharacter,
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

    it('keeps Japanese character cards enabled and disables them for Chinese targets', () => {
        expect(targetSupportsCharacterLookup()).toBe(true);
        expect(targetCanLookupCharacter('𠮟')).toBe(true);
        expect(usesJapaneseProviders()).toBe(true);

        for (const target of ['zh', 'yue'] as const) {
            expect(setActiveLearningTargetLanguage(target)).not.toBeNull();
            expect(targetSupportsCharacterLookup()).toBe(false);
            expect(targetCanLookupCharacter('𡃁')).toBe(false);
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

        for (const target of ['zh', 'yue'] as const) {
            setActiveLearningTargetLanguage(target);
            const chinese = renderModalCard(testCardPopoverRenderer(), {
                ...card,
                spelling: '𡃁好',
                reading: 'ngam4 hou2',
            }, '我𡃁好。');
            expect(chinese).not.toContain('data-jpdb-reader-kanji-nav');
            expect(chinese).not.toContain('data-action="kanji"');
            expect(chinese).toContain('𡃁好');
        }
    });
});
