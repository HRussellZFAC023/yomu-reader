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
    it('names its actions without restating the language', () => {
        const mounted = openFloatingButton({ actions: { hasSubtitleVideo: () => true, isYouTube: () => true } });
        try {
            const puck = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab');
            expect(puck?.getAttribute('aria-label')).toBe('よむ');
            expect(puck?.dataset.targetLanguage).toBeUndefined();
            expect(document.querySelector('[data-radial-id="study"]')?.getAttribute('aria-label')).toBe('Study');
            expect(document.querySelector('[data-radial-id="power"]')?.getAttribute('aria-label')).toBe('Hide furigana');
            expect(document.querySelector('[data-radial-id="subtitles"]')?.getAttribute('aria-label')).toBe('Auto-detect subtitles');
            expect(document.querySelector('[data-radial-id="subtitles"] svg')).not.toBeNull();
            expect(document.querySelector('[data-radial-id="youtube"]')?.getAttribute('aria-label')).toBe('Japanese YouTube only');
            expect(document.querySelector('[data-radial-id="japanese-site"]')?.getAttribute('aria-label')).toBe('Open Japanese versions of sites');
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
            expect(document.querySelector('[data-radial-id="japanese-site"]')?.getAttribute('aria-label')).toBe('日本語版のサイトを開く');
        } finally {
            mounted.dispose();
        }
    });
});
