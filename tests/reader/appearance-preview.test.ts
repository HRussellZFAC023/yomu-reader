import { describe, expect, it } from 'vitest';

import { appearancePreviewHtml, renderSettingsForm } from '../../src/reader/settings/form';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

describe('appearance preview (UT-47)', () => {
    it('renders the preview shell in the form and annotated samples for bind time', () => {
        const html = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        expect(html).toContain('data-yomu-appearance-preview');
        const sample = appearancePreviewHtml();
        expect(sample).toContain('jpdb-reader-word');
        expect(sample).toContain('jpdb-reader-furi');
        expect(sample).toContain('あたら');
        expect(sample).toContain('jpdb-never-forget');
    });
});

describe('appearance preview survives dialog passes (UT-47)', () => {
    it('keeps sample words after localizeSettingsForm', async () => {
        const { localizeSettingsForm } = await import('../../src/reader/settings/form');
        const { setInnerHtml } = await import('../../src/reader/dom/index');
        const form = document.createElement('form');
        setInnerHtml(form, renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings'));
        const before = form.querySelectorAll('[data-yomu-appearance-preview] .jpdb-reader-word').length;
        localizeSettingsForm(form, 'en');
        const after = form.querySelectorAll('[data-yomu-appearance-preview] .jpdb-reader-word').length;
        expect(before).toBeGreaterThan(0);
        expect(after).toBe(before);
    });
});
