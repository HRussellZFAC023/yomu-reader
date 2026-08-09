import { afterEach, describe, expect, it, vi } from 'vitest';

import { targetLanguageDisplayName } from '../../src/reader/app/target-language-name';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import { LEARNING_TARGET_ROSTER } from '../../src/reader/languages/roster';
import {
    DEFAULT_SETTINGS,
    FloatingButtonController,
    ReaderApp,
    mockFloatingButtonRects,
    registerReaderHelpersCleanup,
    stubFloatingButtonActions,
    withImmediateAnimationFrame,
    withViewport,
} from './jpdb/fixtures';
import type { ReaderSettings } from './jpdb/fixtures';

registerReaderHelpersCleanup();

afterEach(() => {
    resetActiveLearningTargetLanguage();
});

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

describe('target-aware floating button actions', () => {
    it('uses a two-state annotation switch without mutating furigana for a non-Japanese target', async () => {
        type PowerCycleInternals = {
            settings: ReaderSettings;
            cyclePowerState(): Promise<void>;
            puckPowerState(): 'on' | 'no-furigana' | 'paused';
            applyAnnotationsPausedState(): void;
            toast(message: string): void;
            destroy(): void;
        };
        const app = new ReaderApp() as unknown as PowerCycleInternals;
        app.applyAnnotationsPausedState = vi.fn();
        app.toast = vi.fn();
        app.settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all', annotationsPaused: false };
        setActiveLearningTargetLanguage('es');

        try {
            expect(app.puckPowerState()).toBe('on');
            await app.cyclePowerState();
            expect(app.puckPowerState()).toBe('paused');
            expect(app.settings.furiganaMode).toBe('all');
            await app.cyclePowerState();
            expect(app.puckPowerState()).toBe('on');
            expect(app.settings.furiganaMode).toBe('all');
        } finally {
            app.destroy();
        }
    });

    it('shows the active target and keeps target-routed puck actions for Spanish', () => {
        setActiveLearningTargetLanguage('es');
        const mounted = openFloatingButton({ actions: { hasSubtitleVideo: () => true } });
        try {
            const puck = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab');
            expect(puck?.dataset.targetLanguage).toBe('es');
            expect(puck?.getAttribute('aria-label')).toBe('よむ — learning target: Spanish');
            expect(document.querySelector('[data-radial-id="study"]')?.getAttribute('aria-label')).toBe('Study Spanish');
            expect(document.querySelector('[data-radial-id="power"]')?.getAttribute('aria-label')).toBe('Pause annotations');
            expect(document.querySelector('[data-radial-id="subtitles"]')?.getAttribute('aria-label'))
                .toBe('Auto-detect Spanish subtitles');
            expect(document.querySelector('[data-radial-id="japanese-site"]')).toBeNull();
        } finally {
            mounted.dispose();
        }
    });

    it('shows target-labelled subtitle and YouTube actions for all 33 targets', () => {
        for (const target of LEARNING_TARGET_ROSTER) {
            expect(setActiveLearningTargetLanguage(target.id), target.id).not.toBeNull();
            const mounted = openFloatingButton({
                actions: { hasSubtitleVideo: () => true, isYouTube: () => true },
            });
            try {
                const targetName = targetLanguageDisplayName(DEFAULT_SETTINGS);
                expect(
                    document.querySelector('[data-radial-id="subtitles"]')?.getAttribute('aria-label'),
                    target.id,
                ).toBe(`Auto-detect ${targetName} subtitles`);
                expect(
                    document.querySelector('[data-radial-id="youtube"]')?.getAttribute('aria-label'),
                    target.id,
                ).toBe(`Filter YouTube for ${targetName}`);
                expect(document.querySelector('[data-radial-id="subtitles"] svg'), target.id).not.toBeNull();
                expect(Boolean(document.querySelector('[data-radial-id="japanese-site"]')), target.id)
                    .toBe(target.id === 'ja');
            } finally {
                mounted.dispose();
            }
        }
    });

    it('names target-routed puck actions in the Japanese interface too', () => {
        expect(setActiveLearningTargetLanguage('es')).not.toBeNull();
        const mounted = openFloatingButton({
            actions: { hasSubtitleVideo: () => true, isYouTube: () => true },
            settings: { interfaceLanguage: 'ja' },
        });
        try {
            expect(document.querySelector('[data-radial-id="subtitles"]')?.getAttribute('aria-label'))
                .toBe('スペイン語の字幕を自動検出');
            expect(document.querySelector('[data-radial-id="youtube"]')?.getAttribute('aria-label'))
                .toBe('YouTubeをスペイン語向けに絞る');
        } finally {
            mounted.dispose();
        }
    });
});
