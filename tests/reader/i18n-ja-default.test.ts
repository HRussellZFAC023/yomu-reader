import { describe, expect, it } from 'vitest';

import { resolveUiLanguage, uiText } from '../../src/reader/app/i18n';

// Counterpart to the English-pinned reader suites (see helpers/settings-fixture
// testEnSettings): confirm the Japanese interface actually renders localized UI
// copy rather than falling back to the English table or the untranslated
// placeholder. Uses uiText directly as the cheapest translation surface.
describe('Japanese interface copy', () => {
    it('resolves an explicit ja language to Japanese', () => {
        expect(resolveUiLanguage('ja')).toBe('ja');
    });

    it('renders a Japanese UI string distinct from the English copy', () => {
        const ja = uiText('ja', 'addAudioSource');
        const en = uiText('en', 'addAudioSource');
        expect(en).toBe('Add audio source');
        expect(ja).toBe('音声ソースを追加');
        expect(ja).not.toBe(en);
        expect(ja).not.toBe('未翻訳');
    });
});
