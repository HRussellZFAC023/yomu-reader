import { academyCopyHasMissingJapanese, academyText } from '../../src/reader/app/academy-copy';

describe('Academy interface copy', () => {
    it('has Japanese for every visible interface key', () => {
        expect(academyCopyHasMissingJapanese()).toBe(false);
        expect(academyText('ja', 'accessTitle')).not.toBe('未翻訳');
        expect(academyText('ja', 'fictionNote')).toContain('フィクション');
    });
});
