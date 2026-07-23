import {
    createKatakanaNameDraft,
    profileNameForEditing,
} from '../../src/academy/content/learner-name';

describe('Academy learner name', () => {
    it('does not turn an account email or generic placeholder into the learner naming moment', () => {
        expect(profileNameForEditing('henry@example.com')).toBe('');
        expect(profileNameForEditing(' Learner ')).toBe('');
        expect(profileNameForEditing('Henry')).toBe('Henry');
    });

    it('returns a careful katakana draft for a known name', () => {
        expect(createKatakanaNameDraft('Henry')).toEqual({
            usualName: 'Henry',
            katakana: 'ヘンリー',
            source: 'known-name',
        });
    });

    it('converts kana without pretending to know an unknown English pronunciation', () => {
        expect(createKatakanaNameDraft('みな')).toEqual({
            usualName: 'みな',
            katakana: 'ミナ',
            source: 'hiragana',
        });
        expect(createKatakanaNameDraft('riku')).toEqual({
            usualName: 'riku',
            katakana: 'リク',
            source: 'known-name',
        });
        expect(createKatakanaNameDraft('Chloë')).toEqual({
            usualName: 'Chloë',
            katakana: null,
            source: 'unavailable',
        });
    });
});
