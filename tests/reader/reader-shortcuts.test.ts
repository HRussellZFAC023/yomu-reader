import { describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/reader/settings/index';
import { testEnSettings } from './helpers/settings-fixture';
import { isEditableEventContext, isEditableTarget } from '../../src/reader/ui/browser';
import type { ReaderSettingsSurface } from '../../src/reader/app/startup';

interface ReaderShortcutInternals {
    settings: ReaderSettings;
    settingsSurface?: ReaderSettingsSurface;
    subtitles: { refresh: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
    toast: ReturnType<typeof vi.fn>;
    getSettingsDialog: ReturnType<typeof vi.fn>;
    handleReaderUtilityShortcut(event: KeyboardEvent): boolean;
    showSettings(panel?: string): void;
}

describe('reader shortcuts', () => {
    it('treats rich text editors as editable shortcut targets', () => {
        const comment = document.createElement('div');
        comment.setAttribute('contenteditable', 'plaintext-only');
        comment.innerHTML = '<span>Typing a comment</span>';

        expect(isEditableTarget(comment.querySelector('span'))).toBe(true);

        comment.setAttribute('contenteditable', 'false');

        expect(isEditableTarget(comment.querySelector('span'))).toBe(false);
    });

    it('treats typing in a shadow-DOM input as an editable context so shortcuts do not swallow keys', () => {
        // YouTube's search box (and many web-component sites) put the <input>
        // inside an open shadow root, so a keydown there retargets to the shadow
        // HOST — isEditableTarget(target) misses it and shortcuts ate normal typing
        // (e.g. Shift+H). The event's composed path still contains the real input.
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        const input = document.createElement('input');
        shadow.append(input);
        document.body.append(host);
        try {
            let editableInsideShadow: boolean | undefined;
            const onKeydown = (event: Event) => { editableInsideShadow = isEditableEventContext(event); };
            document.addEventListener('keydown', onKeydown);
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'H', shiftKey: true, bubbles: true, composed: true }));
            document.removeEventListener('keydown', onKeydown);
            // At the document the target is the shadow host, which closest() cannot
            // resolve to the inner input — the legacy check called it "not editable".
            expect(isEditableTarget(host)).toBe(false);
            expect(editableInsideShadow).toBe(true);

            let editableOnPlainDiv: boolean | undefined;
            const plain = document.createElement('div');
            document.body.append(plain);
            const onKeydown2 = (event: Event) => { editableOnPlainDiv = isEditableEventContext(event); };
            document.addEventListener('keydown', onKeydown2);
            plain.dispatchEvent(new KeyboardEvent('keydown', { key: 'H', shiftKey: true, bubbles: true, composed: true }));
            document.removeEventListener('keydown', onKeydown2);
            expect(editableOnPlainDiv).toBe(false);
            plain.remove();
        } finally {
            host.remove();
        }
    });

    it('toggles the subtitle overlay without persisting a packaged memory-only snapshot', async () => {
        const app = new ReaderApp(() => Promise.resolve(), false);
        const internals = app as unknown as ReaderShortcutInternals;
        const refresh = vi.fn();
        const destroy = vi.fn();
        const toast = vi.fn();

        internals.settings = {
            ...testEnSettings(),
            subtitleOverlayVisible: false,
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                toggleSubtitleOverlay: 'Shift+H',
            },
        };
        internals.subtitles = { refresh, destroy };
        internals.toast = toast;
        localStorage.removeItem(SETTINGS_STORAGE_KEY);

        try {
            const event = new KeyboardEvent('keydown', {
                key: 'H',
                shiftKey: true,
                bubbles: true,
                cancelable: true,
            });

            expect(internals.handleReaderUtilityShortcut(event)).toBe(true);

            expect(event.defaultPrevented).toBe(true);
            expect(internals.settings.subtitleOverlayVisible).toBe(true);
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(toast).toHaveBeenCalledWith('Subtitle overlay enabled.');
            await Promise.resolve();
            expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
        } finally {
            app.destroy();
        }
    });

    it('routes Reader settings requests through the host surface without mounting the local dialog', async () => {
        const app = new ReaderApp();
        const internals = app as unknown as ReaderShortcutInternals;
        const open = vi.fn(async () => undefined);
        internals.settings = testEnSettings();
        internals.settingsSurface = { open };
        internals.getSettingsDialog = vi.fn();

        try {
            internals.showSettings();
            internals.showSettings('api');
            internals.showSettings('dictionaries');

            await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(3));
            expect(open.mock.calls).toEqual([[undefined], ['api'], ['dictionaries']]);
            expect(internals.getSettingsDialog).not.toHaveBeenCalled();
            expect(document.querySelector('.jpdb-reader-settings,[data-sensitive-settings-launcher]')).toBeNull();
        } finally {
            app.destroy();
        }
    });

    it('reports a host settings handoff failure without falling back to the local dialog', async () => {
        const app = new ReaderApp();
        const internals = app as unknown as ReaderShortcutInternals;
        const failure = new Error('native window unavailable');
        internals.settings = testEnSettings();
        internals.settingsSurface = { open: vi.fn(async () => { throw failure; }) };
        internals.getSettingsDialog = vi.fn();
        internals.toast = vi.fn();

        try {
            internals.showSettings('appearance');

            await vi.waitFor(() => expect(internals.toast).toHaveBeenCalledWith(
                'Settings could not be opened.',
            ));
            expect(internals.getSettingsDialog).not.toHaveBeenCalled();
            expect(document.querySelector('.jpdb-reader-settings,[data-sensitive-settings-launcher]')).toBeNull();
        } finally {
            app.destroy();
        }
    });
});
