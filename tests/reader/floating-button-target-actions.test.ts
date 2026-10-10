import { describe, expect, it, vi } from 'vitest';

import {
    DEFAULT_SETTINGS,
    FloatingButtonController,
    mockFloatingButtonRects,
    registerReaderHelpersCleanup,
    stubFloatingButtonActions,
    withImmediateAnimationFrame,
    withViewport,
} from './jpdb/fixtures';
import type { ReaderSettings } from './jpdb/fixtures';

registerReaderHelpersCleanup();

type FloatingButtonActionOverrides = Parameters<typeof stubFloatingButtonActions>[0];

function openFloatingButton(options: {
    actions?: FloatingButtonActionOverrides;
    settings?: Partial<ReaderSettings>;
} = {}): { controller: FloatingButtonController; dispose: () => void } {
    const controller = new FloatingButtonController();
    const restoreRects = mockFloatingButtonRects(760, 520);
    withViewport(1200, 900, () => withImmediateAnimationFrame(() => {
        controller.install(
            { ...DEFAULT_SETTINGS, showFloatingButton: true, ...options.settings },
            vi.fn(),
            stubFloatingButtonActions(options.actions),
        );
        document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click();
    }));
    return {
        controller,
        dispose: () => {
            controller.destroy();
            restoreRects();
            document.body.innerHTML = '';
        },
    };
}

describe('floating button actions', () => {
    it('forwards the original Settings click so Study can open within that gesture', () => {
        const openSettings = vi.fn();
        const mounted = openFloatingButton({ actions: { openSettings } });
        try {
            const event = new MouseEvent('click', { bubbles: true, cancelable: true });
            document.querySelector('[data-radial-id="settings"]')!.dispatchEvent(event);
            expect(openSettings).toHaveBeenCalledWith(event);
        } finally { mounted.dispose(); }
    });
    it('names its actions without restating the language', () => {
        const mounted = openFloatingButton({ actions: { hasSubtitleVideo: () => true, isYouTube: () => true } });
        try {
            const puck = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab');
            expect(puck?.getAttribute('aria-label')).toBe('よむ on · furigana shown');
            expect(puck?.dataset.targetLanguage).toBeUndefined();
            expect(document.querySelector('[data-radial-id="study"]')?.getAttribute('aria-label')).toBe('Study');
            expect(document.querySelector('[data-radial-id="power"]')?.getAttribute('aria-label')).toBe('よむ on · furigana shown');
            expect(document.querySelector('[data-radial-id="subtitles"]')?.getAttribute('aria-label')).toBe('Auto-detect subtitles');
            expect(document.querySelector('[data-radial-id="subtitles"] svg')).not.toBeNull();
            expect(document.querySelector('[data-radial-id="youtube"]')?.getAttribute('aria-label')).toBe('Japanese YouTube only');
            expect(document.querySelector('[data-radial-id="japanese-site"]')?.getAttribute('aria-label')).toBe('Request Japanese sites');
        } finally {
            mounted.dispose();
        }
    });

    it('names the same actions in the Japanese interface', () => {
        const mounted = openFloatingButton({
            actions: { hasSubtitleVideo: () => true, isYouTube: () => true },
            settings: { interfaceLanguage: 'ja' },
        });
        try {
            expect(document.querySelector('[data-radial-id="study"]')?.getAttribute('aria-label')).toBe('学習');
            expect(document.querySelector('[data-radial-id="subtitles"]')?.getAttribute('aria-label')).toBe('字幕を自動検出');
            expect(document.querySelector('[data-radial-id="youtube"]')?.getAttribute('aria-label')).toBe('日本語のYouTubeのみ');
            expect(document.querySelector('[data-radial-id="japanese-site"]')?.getAttribute('aria-label')).toBe('日本語版サイトをリクエスト');
            expect(document.querySelector('[data-radial-id="power"]')?.getAttribute('aria-label')).toBe('よむ オン・ふりがな表示');
            expect(document.querySelector('.jpdb-reader-fab')?.getAttribute('aria-label')).toBe('よむ オン・ふりがな表示');
        } finally {
            mounted.dispose();
        }
    });
});

describe('the open puck menu after a settings echo', () => {
    // A saved toggle comes back through install(), sometimes after a later
    // write has already landed. The open menu must follow the settings, not
    // keep the label it had when the item was pressed.
    it('relabels the power item when the reader state changes underneath it', () => {
        let state: 'on' | 'no-furigana' | 'paused' = 'paused';
        const actions = { powerState: () => state, isPaused: () => state === 'paused' };
        const mounted = openFloatingButton({ actions });
        try {
            const power = () => document.querySelector('[data-radial-id="power"]')?.getAttribute('aria-label');
            expect(power()).toBe('よむ off');
            state = 'on';
            mounted.controller.install({ ...DEFAULT_SETTINGS, showFloatingButton: true }, vi.fn(), stubFloatingButtonActions(actions));
            expect(power()).toBe('よむ on · furigana shown');
            expect(document.querySelector('.jpdb-reader-fab')?.getAttribute('aria-label')).toBe('よむ on · furigana shown');
        } finally {
            mounted.dispose();
        }
    });

    it('shows the state a press lands in once its save settles, not the state before it', async () => {
        // Resuming from off lands only after its save: the state changes when the
        // press's promise resolves, not when the item is pressed.
        let state: 'on' | 'no-furigana' | 'paused' = 'paused';
        let finishSave!: () => void;
        const cyclePowerState = vi.fn(() => new Promise<void>(resolve => { finishSave = resolve; }).then(() => { state = 'on'; }));
        const mounted = openFloatingButton({ actions: { cyclePowerState, powerState: () => state, isPaused: () => state === 'paused' } });
        try {
            const power = () => document.querySelector<HTMLButtonElement>('[data-radial-id="power"]')!;
            power().click();
            expect(cyclePowerState).toHaveBeenCalledOnce();
            expect(power().getAttribute('aria-label')).toBe('よむ off');

            finishSave();
            await vi.waitFor(() => expect(power().getAttribute('aria-label')).toBe('よむ on · furigana shown'));
            expect(power().classList.contains('is-on')).toBe(true);
            expect(document.querySelector('.jpdb-reader-fab-radial.is-open')).not.toBeNull();
        } finally {
            mounted.dispose();
        }
    });
});
