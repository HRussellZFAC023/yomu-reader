import { afterEach, describe, expect, it, vi } from 'vitest';
import { LookupModalAccessibility } from '../../src/reader/popup/modal-accessibility-impl';
import { mountSettingsSurfaceLauncher } from '../../src/reader/settings/sensitive-settings-surface';
import {
    createSettingsDialog,
    DEFAULT_SETTINGS,
    resetSettingsDialogTestEnvironment,
} from './helpers/settings-dialog-controller-fixture';

afterEach(() => {
    resetSettingsDialogTestEnvironment();
    document.body.replaceChildren();
});

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

    it('gives the userscript Settings launcher the same title row and no second way out', () => {
        const dismiss = vi.fn();
        const launcher = mountSettingsSurfaceLauncher({
            createBackdrop: () => document.body.appendChild(document.createElement('div')),
            mountDialog: (backdrop, surface) => backdrop.append(surface),
            sensitiveSettingsSurface: () => ({ trusted: false, launcherUrl: 'https://yomureader.com/study/#settings=api' }),
            dismiss,
            toast: () => undefined,
        }, new LookupModalAccessibility(), 'ja');
        const head = launcher.querySelector<HTMLElement>('.jpdb-reader-settings-head')!;
        expect([...head.children].map(child => child.tagName)).toEqual(['H2', 'BUTTON']);
        const close = head.querySelector<HTMLButtonElement>('[data-settings-close]')!;
        expect(close.getAttribute('aria-label')).toBe('設定を閉じる');
        expect(close.querySelector('svg[data-icon="close"][aria-hidden="true"]')).not.toBeNull();
        // One way out: the footer Cancel that duplicated it is gone.
        expect(launcher.querySelector('[data-action="cancel"], .footer')).toBeNull();

        close.click();
        expect(dismiss).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['en', 'よむ Settings', 'Open in Study'],
        ['ja', 'よむ 設定', 'Studyで開く'],
    ] as const)('says each thing once in the %s launcher: the Settings title, one line, one action', (language, title, action) => {
        const launcher = mountSettingsSurfaceLauncher({
            createBackdrop: () => document.body.appendChild(document.createElement('div')),
            mountDialog: (backdrop, surface) => backdrop.append(surface),
            sensitiveSettingsSurface: () => ({ trusted: false, launcherUrl: 'https://yomureader.com/study/#settings=api' }),
            dismiss: vi.fn(),
            toast: () => undefined,
        }, new LookupModalAccessibility(), language);
        // The same title as every other Settings surface, and as the dialog's own name.
        expect(launcher.querySelector('h2')?.textContent).toBe(title);
        expect(launcher.getAttribute('aria-label')).toBe(title);
        const help = [...launcher.querySelectorAll('.jpdb-reader-help')];
        expect(help).toHaveLength(1);
        expect(help[0]!.textContent!.length).toBeLessThanOrEqual(60);
        const buttons = [...launcher.querySelectorAll<HTMLButtonElement>('.jpdb-reader-settings-scroll button')];
        expect(buttons.map(button => button.textContent)).toEqual([action]);
        expect(buttons[0]!.classList.contains('add')).toBe(true);
    });
});
