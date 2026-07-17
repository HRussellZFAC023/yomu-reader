import { academyCopyHasMissingJapanese, academyText } from '../../src/reader/app/academy-copy';

describe('Academy interface copy', () => {
    it('has Japanese for every visible interface key', () => {
        expect(academyCopyHasMissingJapanese()).toBe(false);
        expect(academyText('ja', 'accessBody')).not.toBe('未翻訳');
        expect(academyText('ja', 'fictionNote')).toContain('フィクション');
        expect(academyText('en', 'rieUnlockEyebrow')).toBe('Teacher profile');
        expect(academyText('ja', 'rieUnlockEyebrow')).toBe('先生プロフィール');
        expect(academyText('en', 'navClass')).toBe('Class');
        expect(academyText('ja', 'classPathWeeks')).toBe('道のり');
        expect(academyText('en', 'navPresentationCourse')).toBe('Course view');
        expect(academyText('ja', 'navPresentationStory')).toBe('物語ビュー');
        expect(academyText('en', 'navReview')).toBe('Study');
        expect(academyText('ja', 'navReview')).toBe('学習');
        expect(academyText('en', 'navSwitchToCourse')).toBe('Switch to course view');
        expect(academyText('en', 'startManualBody')).toBe('From N5 basics to N1 advanced.');
        expect(academyText('ja', 'startManualBody')).toBe('N5（初級）からN1（最上級）まで。');
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
