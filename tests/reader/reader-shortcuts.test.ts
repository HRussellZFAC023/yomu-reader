import { describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { isEditableTarget } from '../../src/reader/ui/browser';

interface ReaderShortcutInternals {
    settings: ReaderSettings;
    subtitles: { refresh: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
    toast: ReturnType<typeof vi.fn>;
    handleReaderUtilityShortcut(event: KeyboardEvent): boolean;
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

    it('toggles the subtitle overlay with the configured shortcut', () => {
        const app = new ReaderApp();
        const internals = app as unknown as ReaderShortcutInternals;
        const refresh = vi.fn();
        const destroy = vi.fn();
        const toast = vi.fn();

        internals.settings = {
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'en',
            subtitleOverlayVisible: false,
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                toggleSubtitleOverlay: 'Shift+H',
            },
        };
        internals.subtitles = { refresh, destroy };
        internals.toast = toast;

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
        } finally {
            app.destroy();
        }
    });
});
