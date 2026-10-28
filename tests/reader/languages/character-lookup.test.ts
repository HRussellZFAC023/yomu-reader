import { afterEach, describe, expect, it } from 'vitest';

import {
    targetCanLookupCharacter,
    usesJapaneseProviders,
} from '../../../src/reader/languages/character-lookup';
import { isUnifiedIdeograph } from '../../../src/reader/languages/han';
import { isKanjiCharacter } from '../../../src/reader/popup/pitch';
import {
    card,
    renderModalCard,
    testCardPopoverRenderer,
} from '../jpdb/fixtures';

afterEach(() => {
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

    it('looks up kanji with the Japanese providers and never Latin letters', () => {
        expect(usesJapaneseProviders()).toBe(true);
        expect(targetCanLookupCharacter('猫')).toBe(true);
        expect(targetCanLookupCharacter('𠮟')).toBe(true);
        expect(targetCanLookupCharacter('a')).toBe(false);
    });

    it('renders inline kanji navigation for Japanese headwords', () => {
        const japanese = renderModalCard(testCardPopoverRenderer(), {
            ...card,
            spelling: '𠮟る',
            reading: 'しかる',
        }, '𠮟る。');
        expect(japanese).toContain('data-jpdb-reader-kanji-nav');
        expect(japanese).toContain('data-action="kanji" data-kanji="𠮟"');
    });
});
