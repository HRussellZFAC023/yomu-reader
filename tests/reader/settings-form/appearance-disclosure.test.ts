import { reportInvalidSettingsForm } from '../../../src/reader/settings/settings-form-validation';
import { DEFAULT_SETTINGS, applySettingsSearch, localizeSettingsForm, readFormSettings, renderSettingsTestForm, registerSettingsFormCleanup } from './fixtures';

describe('appearance progressive disclosure', () => {
    registerSettingsFormCleanup();

    it('keeps common choices visible and preserves closed tuning values on Save', () => {
        const settings = { ...DEFAULT_SETTINGS, popoverWidth: 530, popupFontWeight: 650 };
        const form = renderSettingsTestForm(settings);
        const details = form.querySelector<HTMLDetailsElement>('[data-settings-tuning]')!;
        expect(details).not.toBeNull();
        expect(details.open).toBe(false);
        expect(details.querySelector('[name="popoverWidth"]')).not.toBeNull();
        expect(details.querySelector('[name="theme"]')).toBeNull();
        const saved = readFormSettings(new FormData(form), settings);
        expect(saved.popoverWidth).toBe(530);
        expect(saved.popupFontWeight).toBe(650);
    });

    it('opens matching search results and restores the learner’s original disclosure state', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const details = form.querySelector<HTMLDetailsElement>('[data-settings-tuning]')!;
        const label = details.querySelector('[name="popoverWidth"]')?.closest('label')?.textContent?.trim();
        expect(label).toBeTruthy();
        applySettingsSearch(form, label!);
        expect(details.open).toBe(true);
        applySettingsSearch(form, 'no-such-option');
        applySettingsSearch(form, '');
        expect(details.open).toBe(false);
        details.open = true;
        applySettingsSearch(form, label!);
        applySettingsSearch(form, '');
        expect(details.open).toBe(true);
        localizeSettingsForm(form, 'ja');
        expect(details.querySelector('summary')?.textContent).toContain('詳細');
    });

    it('opens the disclosure containing an invalid saved field before focusing it', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        document.body.append(form);
        const details = form.querySelector<HTMLDetailsElement>('[data-settings-tuning]')!;
        const input = details.querySelector<HTMLInputElement>('[name="popoverWidth"]')!;
        input.value = '305';
        const toast = vi.fn();
        reportInvalidSettingsForm(form, 'en', toast);
        expect(details.open).toBe(true);
        expect(document.activeElement).toBe(input);
        expect(toast).toHaveBeenCalledOnce();
    });
});
