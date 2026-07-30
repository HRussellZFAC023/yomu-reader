import { describe, expect, it } from 'vitest';
import {
    userFacingError,
    userFacingErrorText,
} from '../../src/reader/app/user-facing-errors';
import { JpdbApiError } from '../../src/reader/jpdb/jpdb-api';

describe('user-facing error copy', () => {
    it('keeps the English diagnostic separate from localized feedback', () => {
        const error = userFacingError('reviewBlockedBlacklisted');

        expect(error.message).toBe('Blacklisted. Unlist before reviewing.');
        expect(userFacingErrorText('ja', 'reviewFailed', error))
            .toBe('ブラックリスト入りです。解除するとレビューできます。');
    });

    it('recognizes copy IDs structurally across companion bundle boundaries', () => {
        const companionError = {
            message: 'Blacklisted. Unlist before reviewing.',
            yomuUiCopyKey: 'reviewBlockedBlacklisted',
        };

        expect(userFacingErrorText('ja', 'reviewFailed', companionError))
            .toBe('ブラックリスト入りです。解除するとレビューできます。');
    });

    it('maps JPDB failure codes to specific Japanese feedback', () => {
        const error = new JpdbApiError('rejected-key', 'JPDB rejected the API key.');

        expect(error.yomuJpdbFailureCode).toBe('rejected-key');
        expect(userFacingErrorText('ja', 'jpdbLookupFailed', error))
            .toBe('JPDBがAPIキーを拒否しました。設定でキーを確認してください。');
    });
});
