import { afterEach, describe, expect, it } from 'vitest';
import type { ReaderSettings } from '../../src/reader/app/types';
import { publishSettingsChange } from '../../src/reader/settings/settings-change-bus';
import { ACCENT_SWATCHES } from '../../src/reader/theme/accent-swatches';
import {
    DEFAULT_SETTINGS,
    createSettingsDialog,
    resetSettingsDialogTestEnvironment,
} from './helpers/settings-dialog-controller-fixture';

const color = (id: string) => ACCENT_SWATCHES.find(swatch => swatch.id === id)!.color;

afterEach(() => {
    resetSettingsDialogTestEnvironment();
});

describe('an open Settings form after another tab saves', () => {
    it('keeps its unsaved Appearance choices selected and painted, and moves only what the other tab changed', () => {
        let current: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: color('ai'), theme: 'light' };
        const { dependencies, form } = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
        });
        const input = (selector: string) => form.querySelector<HTMLInputElement>(selector)!;
        input('[data-accent-swatch="murasaki"]').click();
        input('input[name="underlineQuick"][value="off"]').click();
        form.querySelector<HTMLButtonElement>('[data-theme-switch]')!.click();
        dependencies.applyTheme.mockClear();

        publishSettingsChange({ settings: { ...current, popupMode: 'sheet' }, remote: true });

        expect(current).toMatchObject({ popupMode: 'sheet', accentColor: color('ai'), theme: 'light' });
        expect(form.querySelector<HTMLSelectElement>('select[name="popupMode"]')!.value).toBe('sheet');
        expect(form.querySelector<HTMLInputElement>('input[name="accentSwatch"]:checked')?.dataset.accentSwatch).toBe('murasaki');
        expect(form.querySelector<HTMLInputElement>('input[name="underlineQuick"]:checked')?.value).toBe('off');
        expect(input('[data-theme-value]').value).toBe('dark');
        // The host painted the saved settings; the form's choices go back on top.
        expect(dependencies.applyTheme.mock.lastCall?.[0]).toMatchObject({
            accentColor: color('murasaki'),
            wordUnderlineColorSource: 'off',
            subtitleUnderlineColorSource: 'off',
            theme: 'dark',
            popupMode: 'sheet',
        });
    });

    it('takes a value the other tab changed, so the form and the page show it', () => {
        let current: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: color('ai') };
        const { dependencies, form } = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
        });
        form.querySelector<HTMLInputElement>('[data-accent-swatch="murasaki"]')!.click();

        publishSettingsChange({ settings: { ...current, accentColor: color('shu') }, remote: true });

        expect(form.querySelector<HTMLInputElement>('input[name="accentSwatch"]:checked')?.dataset.accentSwatch).toBe('shu');
        expect(dependencies.applyTheme.mock.lastCall?.[0]).toMatchObject({ accentColor: color('shu') });
    });
});
