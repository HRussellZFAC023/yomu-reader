import { describe, expect, it } from 'vitest';

import { appearancePreviewContentHtml, appearancePreviewHtml, renderSettingsForm } from '../../src/reader/settings/form';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

describe('appearance preview (UT-47)', () => {
    it('renders the preview shell in the form and annotated samples for bind time', () => {
        const html = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        expect(html).toContain('data-yomu-appearance-preview');
        expect(html).toContain('data-settings-preview-title');
        expect(html).toContain('jpdb-reader-settings-appearance-preview-line');
        expect(html).not.toContain('jpdb-reader-word-highlight-jpdb jpdb-reader-word-underline-pitch jpdb-reader-word-text-status');
        const sample = appearancePreviewHtml();
        expect(sample).toContain('jpdb-reader-word');
        expect(sample).toContain('jpdb-reader-furi');
        expect(sample).toContain('あたら');
        expect(sample).toContain('jpdb-never-forget');
        expect(sample).toContain('anki-known');
        expect(sample).toContain('jpdb-pitch-heiban');
        expect(sample).toContain('jpdb-pitch-atamadaka');
        expect(sample).toContain('jpdb-pitch-nakadaka');
        expect(sample).toContain('jpdb-pitch-odaka');
        expect(sample).toContain('jpdb-pitch-unknown');
        expect(sample).not.toContain('jpdb-pitch-kifuku');
        expect(appearancePreviewContentHtml()).toContain('jpdb-reader-settings-appearance-preview-line');
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
        expect(form.querySelector('[data-settings-preview-title]')?.textContent).toBe('Preview');
        expect(before).toBeGreaterThan(0);
        expect(after).toBe(before);
    });
});
