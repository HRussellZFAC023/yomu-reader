import { afterEach, describe, expect, it } from 'vitest';
import {
    createSettingsDialog,
    DEFAULT_SETTINGS,
    resetSettingsDialogTestEnvironment,
} from './helpers/settings-dialog-controller-fixture';

afterEach(() => resetSettingsDialogTestEnvironment());

// The title row's way out (owner, 2026-10-07: Back and Close sat too close and the
// header read wrong): the title leads, one quiet close sits at the trailing edge.
describe('the Settings title row', () => {
    it('leads with the title and closes from a labelled icon button at its trailing edge', () => {
        const { form, dismiss } = createSettingsDialog({ getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '' }) });
        const head = form.querySelector<HTMLElement>('.jpdb-reader-settings-head')!;
        const visible = [...head.children].filter(child => !child.classList.contains('jpdb-reader-settings-drag-handle'));
        expect(visible.map(child => child.tagName)).toEqual(['H2', 'BUTTON']);
        const close = head.querySelector<HTMLButtonElement>('[data-settings-close]')!;
        expect(close.type).toBe('button');
        expect(close.getAttribute('aria-label')).toBe('Close settings');
        expect(close.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

        close.click();
        expect(dismiss).toHaveBeenCalledTimes(1);
        // Cancel still dismisses on its own; the title-row button did not take its listener.
        form.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.click();
        expect(dismiss).toHaveBeenCalledTimes(2);
    });
});
