import { bindAppearanceQuickRow } from '../../../src/reader/settings/appearance-quick-row';
import { bindLiveSettingsSync } from '../../../src/reader/settings/live-settings-sync';
import { publishSettingsChange } from '../../../src/reader/settings/settings-change-bus';
import { ACCENT_SWATCHES } from '../../../src/reader/theme/accent-swatches';
import { DEFAULT_SETTINGS, localizeSettingsForm, readFormSettings, renderSettingsTestForm, registerSettingsFormCleanup } from './fixtures';
import { reportInvalidSettingsForm } from "../../../src/reader/settings/settings-form-validation";
import { applySettingsSearch } from "./fixtures";

const AI = ACCENT_SWATCHES.find(swatch => swatch.id === 'ai')!.color;

function quickForm(settings = DEFAULT_SETTINGS) {
    const form = renderSettingsTestForm(settings);
    document.body.append(form);
    const commitAccent = vi.fn();
    bindAppearanceQuickRow(form, { commitAccent });
    return { form, commitAccent };
}

function select(form: HTMLFormElement, name: string): HTMLSelectElement {
    return form.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;
}

describe('appearance quick row', () => {
    registerSettingsFormCleanup();

    it('is the first row of Appearance, outside Tuning', () => {
        const { form } = quickForm();
        const panel = form.querySelector<HTMLElement>('[data-settings-panel="appearance"]')!;
        const firstRow = Array.from(panel.children).find(child => child.tagName !== 'LEGEND');
        expect(firstRow?.matches('[data-appearance-quick]')).toBe(true);
        const group = panel.querySelector<HTMLElement>('[role="radiogroup"][data-accent-swatches]')!;
        expect(group.closest('details')).toBeNull();
        expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(6);
        expect(form.querySelectorAll('[name="accentColor"]')).toHaveLength(1);
        expect(form.querySelector('[data-accent-custom]')?.getAttribute('type')).toBe('color');
        // The default accent is 紅, so the custom swatch is not the active one.
        expect(form.querySelector<HTMLInputElement>('[data-accent-swatch="kurenai"]')!.checked).toBe(true);
        expect(form.querySelector('[data-accent-custom]')!.hasAttribute('data-active')).toBe(false);
        expect(form.querySelector<HTMLInputElement>('input[name="underlineQuick"][value="status"]')!.checked).toBe(true);
    });

    it('commits a swatch through the accent preview path and saves it as accentColor', () => {
        const { form, commitAccent } = quickForm();
        const ai = form.querySelector<HTMLInputElement>('[data-accent-swatch="ai"]')!;
        ai.click();
        expect(commitAccent).toHaveBeenCalledWith(AI);
        expect(form.querySelector<HTMLInputElement>('[data-accent-custom]')!.value).toBe(AI);
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).accentColor).toBe(AI);
    });

    it('marks the custom swatch when the picker holds a colour no preset matches', () => {
        const { form } = quickForm({ ...DEFAULT_SETTINGS, accentColor: '#123456' });
        const custom = form.querySelector<HTMLInputElement>('[data-accent-custom]')!;
        expect(custom.hasAttribute('data-active')).toBe(true);
        expect(form.querySelectorAll('input[name="accentSwatch"]:checked')).toHaveLength(0);
        custom.value = AI;
        custom.dispatchEvent(new Event('input', { bubbles: true }));
        expect(custom.hasAttribute('data-active')).toBe(false);
        expect(form.querySelector<HTMLInputElement>('[data-accent-swatch="ai"]')!.checked).toBe(true);
    });

    it('sets the page and subtitle underline channels together', () => {
        const { form } = quickForm();
        const changed: string[] = [];
        form.addEventListener('change', event => changed.push((event.target as HTMLSelectElement).name));
        form.querySelector<HTMLInputElement>('input[name="underlineQuick"][value="pitch"]')!.click();
        expect(select(form, 'wordUnderlineColorSource').value).toBe('pitch');
        expect(select(form, 'subtitleUnderlineColorSource').value).toBe('pitch');
        expect(changed).toEqual(expect.arrayContaining(['wordUnderlineColorSource', 'subtitleUnderlineColorSource']));
        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect([saved.wordUnderlineColorSource, saved.subtitleUnderlineColorSource]).toEqual(['pitch', 'pitch']);
        expect(form.querySelector<HTMLDetailsElement>('[data-settings-tuning="appearance"]')!.open).toBe(false);
    });

    it('shows no shared choice when Tuning splits the channels', () => {
        const { form } = quickForm();
        const subtitle = select(form, 'subtitleUnderlineColorSource');
        subtitle.value = 'pitch';
        subtitle.dispatchEvent(new Event('change', { bubbles: true }));
        expect(form.querySelectorAll('input[name="underlineQuick"]:checked')).toHaveLength(0);
        select(form, 'wordUnderlineColorSource').value = 'pitch';
        select(form, 'wordUnderlineColorSource').dispatchEvent(new Event('change', { bubbles: true }));
        expect(form.querySelector<HTMLInputElement>('input[name="underlineQuick"]:checked')?.value).toBe('pitch');
    });

    it('follows a save from another tab, so the saved choice is selected and the old one can be picked again', () => {
        const { form, commitAccent } = quickForm();
        const sync = new AbortController();
        let settings = DEFAULT_SETTINGS;
        bindLiveSettingsSync(form, {
            isActive: () => form.isConnected,
            getSettings: () => settings,
            adoptSettings: next => { settings = next; },
            applyTheme: () => undefined,
            previewForm: () => undefined,
        }, sync.signal);
        publishSettingsChange({
            settings: { ...DEFAULT_SETTINGS, accentColor: AI, wordUnderlineColorSource: 'pitch', subtitleUnderlineColorSource: 'pitch' },
            remote: true,
        });
        expect(form.querySelector<HTMLInputElement>('input[name="accentSwatch"]:checked')?.dataset.accentSwatch).toBe('ai');
        expect(form.querySelector<HTMLInputElement>('input[name="underlineQuick"]:checked')?.value).toBe('pitch');
        form.querySelector<HTMLInputElement>('[data-accent-swatch="kurenai"]')!.click();
        expect(commitAccent).toHaveBeenCalledWith(DEFAULT_SETTINGS.accentColor);
        form.querySelector<HTMLInputElement>('input[name="underlineQuick"][value="status"]')!.click();
        expect(select(form, 'wordUnderlineColorSource').value).toBe('status');
        sync.abort();
    });

    it('relabels in Japanese with no untranslated text', () => {
        const { form } = quickForm();
        localizeSettingsForm(form, 'ja');
        const row = form.querySelector<HTMLElement>('[data-appearance-quick]')!;
        const names = Array.from(row.querySelectorAll('[aria-label]'), element => element.getAttribute('aria-label')).join(' ');
        expect(`${row.textContent} ${names}`).not.toContain('未翻訳');
        expect(row.textContent).toContain('アクセントカラー');
        expect(row.textContent).toContain('下線');
        expect(row.textContent).toContain('ピッチ');
        expect(names).toContain('藍（あい）');
        expect(form.querySelector('[data-accent-custom]')?.getAttribute('aria-label')).toBe('カスタムカラー');
    });
});

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

    // Fonts and per-channel colour are expert tuning; the accent and the
    // underline choice, language, theme, popup behaviour and a plain preview
    // lead the panel.
    it('leads with everyday choices and a plain preview, with fonts and channel colours tucked away', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const panel = form.querySelector<HTMLElement>('[data-settings-panel="appearance"]')!;
        const details = panel.querySelector<HTMLDetailsElement>('[data-settings-tuning="appearance"]')!;
        for (const name of ['readerFontFamily', 'popupFontFamily', 'wordUnderlineColorSource', 'subtitleUnderlineColorSource']) {
            expect(details.querySelector(`[name="${name}"]`), name).not.toBeNull();
        }
        for (const name of ['theme', 'popupMode', 'hoverPopupMode', 'accentColor', 'accentSwatch', 'underlineQuick']) {
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
