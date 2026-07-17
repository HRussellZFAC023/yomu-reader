import { describe, expect, it } from 'vitest';
import { cardStateLabel } from '../../src/reader/app/i18n';

describe('card state labels', () => {
    it('maps shared card states to localized labels', () => {
        expect(cardStateLabel('due', 'en')).toBe('Due');
        expect(cardStateLabel('young', 'en')).toBe('Young');
        expect(cardStateLabel('mature', 'en')).toBe('Mature');
        expect(cardStateLabel('mastered', 'en')).toBe('Mastered');
        expect(cardStateLabel('not-in-deck', 'en')).toBe('Not in deck');
        expect(cardStateLabel('blacklisted', 'en')).toBe('Blacklisted');
        expect(cardStateLabel('frequent', 'en')).toBe('Frequent');
        expect(cardStateLabel('unparsed', 'en')).toBe('Unparsed');
    });

    it('keeps fallback text for unknown states', () => {
        expect(cardStateLabel('custom-state', 'en')).toBe('custom-state');
        expect(cardStateLabel('custom-state', 'en', 'custom state')).toBe('custom state');
    });

});
