import { academyCopyHasMissingJapanese, academyText } from '../../src/reader/app/academy-copy';

describe('Academy interface copy', () => {
    it('has Japanese for every visible interface key', () => {
        expect(academyCopyHasMissingJapanese()).toBe(false);
        expect(academyText('ja', 'accessBody')).not.toBe('未翻訳');
        expect(academyText('ja', 'fictionNote')).toContain('フィクション');
        expect(academyText('en', 'rieUnlockEyebrow')).toBe('Your teacher');
        expect(academyText('ja', 'rieUnlockEyebrow')).toBe('先生');
    });

    it('uses the confirmed Latin display name for Aakash in Japanese copy', () => {
        expect(academyText('en', 'aakashUnlockTitle')).toBe('Aakash');
        expect(academyText('ja', 'sourceContinue')).toContain('Aakash');
        expect(academyText('ja', 'aakashUnlockTitle')).toBe('Aakash');
        expect(academyText('ja', 'aakashMemoryBody')).toContain('Aakash');
        expect(academyText('ja', 'journalAakash')).toBe('Aakash');
        expect([
            academyText('ja', 'sourceContinue'),
            academyText('ja', 'aakashUnlockTitle'),
            academyText('ja', 'aakashMemoryBody'),
            academyText('ja', 'journalAakash'),
        ].join(' ')).not.toContain('アーカーシュ');
    });
});
