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
        const ja = uiText('ja', 'onboardingAddApiKey');
        const en = uiText('en', 'onboardingAddApiKey');
        expect(en).toBe('Add API key');
        expect(ja).toBe('APIキーを追加');
        expect(ja).not.toBe(en);
        expect(ja).not.toBe('未翻訳');
    });
});
