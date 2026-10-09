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

    // Fonts and colour are expert tuning; language, theme, popup behaviour and
    // a plain preview lead the panel.
    it('leads with everyday choices and a plain preview, with fonts and colour tucked away', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const panel = form.querySelector<HTMLElement>('[data-settings-panel="appearance"]')!;
        const details = panel.querySelector<HTMLDetailsElement>('[data-settings-tuning="appearance"]')!;
        for (const name of ['readerFontFamily', 'popupFontFamily', 'accentColor']) {
            expect(details.querySelector(`[name="${name}"]`), name).not.toBeNull();
        }
        for (const name of ['theme', 'popupMode', 'hoverPopupMode']) {
            expect(panel.querySelector(`[name="${name}"]`)?.closest('details'), name).toBeNull();
        }
        expect(panel.querySelector('[name="popoverBackdropEnabled"]')).toBeNull();
        const preview = panel.querySelector('[data-yomu-appearance-preview]')!;
        expect(preview.closest('details')).toBeNull();
        expect(preview.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
        // The footer status beside Save carries the message; a toast would
        // repeat it and, on a phone, cover the field being fixed.
        const status = form.querySelector<HTMLElement>('[data-settings-save-status]')!;
        expect(status.hidden).toBe(false);
        expect(status.textContent).toBe(input.validationMessage);
        expect(status.dataset.statusTone).toBe('error');
        expect(toast).not.toHaveBeenCalled();
    });

    it('falls back to a toast when the form has no visible status line', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        document.body.append(form);
        form.querySelector('[data-settings-save-status]')?.remove();
        const input = form.querySelector<HTMLInputElement>('[name="popoverWidth"]')!;
        input.value = '5';
        const toast = vi.fn();
        reportInvalidSettingsForm(form, 'en', toast);
        expect(document.activeElement).toBe(input);
        expect(toast).toHaveBeenCalledWith(input.validationMessage);
    });
});
