import { bindAppearanceQuickRow } from '../../../src/reader/settings/appearance-quick-row';
import { ACCENT_SWATCHES } from '../../../src/reader/theme/accent-swatches';
import { DEFAULT_SETTINGS, localizeSettingsForm, readFormSettings, renderSettingsTestForm, registerSettingsFormCleanup } from './fixtures';

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
