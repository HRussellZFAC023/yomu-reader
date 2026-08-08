import { afterEach, describe, expect, it, vi } from 'vitest';
import { positionSubtitleStylePopover } from '../../../src/reader/subtitles/subtitle-style-popover';
import {
    DEFAULT_SETTINGS,
    registerSubtitleControllerCleanup,
    SUBTITLES_YOUTUBE_CSS,
    mockElementRect,
    makeSubtitleSettings,
    controllerInternals,
    createSubtitleController,
    createInstalledSubtitleController,
    attachVideo,
    setSingleJapaneseSubtitleTrack,
    setSubtitleStyleControlValue,
    setSubtitleStyleSelectValue,
    pointerEvent,
    BASE_DEFAULT_SETTINGS,
    LOAD_SUBTITLE_FILES_EVENT,
    withViewport,
    SubtitlePlayerController,
} from './fixtures';

interface ExactSubtitleSizeHarness {
    controller: SubtitlePlayerController;
    root: HTMLElement;
    lines: HTMLElement;
    syncSelectedSize: () => void;
}

function withExactSubtitleSizeHarness(run: (harness: ExactSubtitleSizeHarness) => void): void {
    const { controller } = createInstalledSubtitleController({
        subtitleOverlayVisible: true,
        subtitleFontSize: 60,
    });
    try {
        const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
        const lines = root.querySelector<HTMLElement>('.jpdb-subtitle-lines')!;
        const syncSelectedSize = () => {
            controllerInternals<{ syncSubtitleTextSize: () => void }>(controller).syncSubtitleTextSize();
        };
        run({ controller, root, lines, syncSelectedSize });
    } finally {
        controller.destroy();
    }
}

function expectExactSubtitleSize(root: HTMLElement, { secondary = false } = {}): void {
    expect(root.style.getPropertyValue('--subtitle-font-size-target')).toBe('60px');
    expect(root.style.getPropertyValue('--subtitle-font-size')).toBe('60px');
    if (secondary) expect(root.style.getPropertyValue('--subtitle-secondary-font-size')).toBe('22px');
}

describe('SubtitlePlayerController — styling & transcript panel', () => {
    registerSubtitleControllerCleanup();

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('flips and horizontally clamps the style popover when the rail sits near the viewport edge', () => {
        const rail = document.createElement('div');
        const popover = document.createElement('div');
        vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
            x: 330,
            y: 720,
            top: 720,
            right: 374,
            bottom: 764,
            left: 330,
            width: 44,
            height: 44,
            toJSON: () => ({}),
        });
        Object.defineProperty(popover, 'scrollHeight', { configurable: true, value: 460 });

        positionSubtitleStylePopover(popover, rail, { left: 0, top: 0, width: 390, height: 800 });

        expect(popover.style.top).toBe('auto');
        expect(popover.style.bottom).toBe('calc(100% + 8px)');
        expect(popover.style.maxHeight).toBe('520px');
        expect(popover.style.left).toBe('-231px');
    });

    it('updates subtitle style settings from the compact rail controls', () => {
        const onSettingsChange = vi.fn();
        const { settings, controller } = createInstalledSubtitleController({
            subtitleOverlayVisible: true,
            subtitleFontSize: 28,
            subtitleBottomOffset: 16,
            subtitleBackgroundOpacity: 0,
            subtitleNativeBlurStrength: 12,
            subtitleHoverPause: true,
        }, { onSettingsChange });
        const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
        const transcriptPanel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
        const toggle = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="style"]')!;

        try {
            toggle.click();

            const popover = root.querySelector<HTMLElement>('[data-subtitle-style-popover]')!;
            expect(popover.hidden).toBe(false);
            expect(toggle.getAttribute('aria-expanded')).toBe('true');
            expect(root.classList.contains('jpdb-subtitle-style-open')).toBe(true);
            expect(popover.textContent).toContain('Subtitle font size');
            expect(popover.textContent).toContain('Subtitle font weight');
            expect(popover.textContent).toContain('Translation');
            expect(popover.textContent).toContain('Blur until reveal (recommended)');
            expect(popover.textContent).toContain('Blur strength');
            expect(popover.textContent).toContain('Pause video on subtitle hover');
            expect(popover.textContent).toContain('Reset defaults');

            setSubtitleStyleControlValue(popover, 'subtitleFontSize', '36');
            setSubtitleStyleControlValue(popover, 'subtitleFontWeight', '620');
            setSubtitleStyleControlValue(popover, 'subtitleBackgroundOpacity', '0.35');
            setSubtitleStyleControlValue(popover, 'subtitleNativeBlurStrength', '18');
            setSubtitleStyleSelectValue(popover);
            popover.querySelector<HTMLInputElement>('[data-subtitle-style-setting="subtitleHoverPause"]')!.click();

            expect(settings.subtitleFontSize).toBe(36);
            expect(settings.subtitleFontWeight).toBe(620);
            // The bottom offset is repositioned by dragging the line, not a slider.
            expect(popover.querySelector('[data-subtitle-style-setting="subtitleBottomOffset"]')).toBeNull();
            expect(settings.subtitleBackgroundOpacity).toBe(0.35);
            expect(settings.subtitleNativeBlurStrength).toBe(18);
            expect(settings.subtitleHoverPause).toBe(false);
            expect(root.style.getPropertyValue('--subtitle-font-size-target')).toBe('36px');
            expect(root.style.getPropertyValue('--subtitle-font-size')).toBe('36px');
            expect(root.style.getPropertyValue('--subtitle-secondary-font-size')).toBe('22px');
            expect(root.style.getPropertyValue('--subtitle-weight')).toBe('620');
            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('16%');
            expect(root.style.getPropertyValue('--subtitle-background-rgba')).toContain(',0.35)');
            expect(root.style.getPropertyValue('--subtitle-native-blur-radius')).toBe('18px');
            expect(root.style.getPropertyValue('--subtitle-native-blur-outer-radius')).toBe('22px');
            expect(transcriptPanel.style.getPropertyValue('--subtitle-native-blur-radius')).toBe('18px');
            expect(transcriptPanel.style.getPropertyValue('--subtitle-native-blur-outer-radius')).toBe('22px');
            expect(root.style.getPropertyValue('--subtitle-family')).toContain('Noto Serif JP');
            expect(popover.querySelector<HTMLOutputElement>('[data-subtitle-style-output="subtitleFontWeight"]')?.textContent).toBe('620');
            expect(popover.querySelector<HTMLOutputElement>('[data-subtitle-style-output="subtitleBackgroundOpacity"]')?.textContent).toBe('35%');
            expect(onSettingsChange).toHaveBeenCalled();
            expect(onSettingsChange).toHaveBeenCalledWith(['subtitleNativeBlurStrength']);

            popover.querySelector<HTMLButtonElement>('[data-action="style-reset"]')!.click();

            expect(settings.subtitleFontSize).toBe(BASE_DEFAULT_SETTINGS.subtitleFontSize);
            expect(settings.subtitleFontWeight).toBe(BASE_DEFAULT_SETTINGS.subtitleFontWeight);
            expect(settings.subtitleBottomOffset).toBe(BASE_DEFAULT_SETTINGS.subtitleBottomOffset);
            expect(settings.subtitleBackgroundOpacity).toBe(BASE_DEFAULT_SETTINGS.subtitleBackgroundOpacity);
            expect(settings.subtitleNativeBlurStrength).toBe(BASE_DEFAULT_SETTINGS.subtitleNativeBlurStrength);
            expect(settings.subtitleFontFamily).toBe(BASE_DEFAULT_SETTINGS.subtitleFontFamily);
            expect(settings.subtitleHoverPause).toBe(BASE_DEFAULT_SETTINGS.subtitleHoverPause);
            expect(root.style.getPropertyValue('--subtitle-font-size-target')).toBe(`${BASE_DEFAULT_SETTINGS.subtitleFontSize}px`);
            expect(root.style.getPropertyValue('--subtitle-font-size')).toBe(`${BASE_DEFAULT_SETTINGS.subtitleFontSize}px`);
            expect(root.style.getPropertyValue('--subtitle-weight')).toBe(String(BASE_DEFAULT_SETTINGS.subtitleFontWeight));
            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe(`${BASE_DEFAULT_SETTINGS.subtitleBottomOffset}%`);
            expect(popover.querySelector<HTMLOutputElement>('[data-subtitle-style-output="subtitleBackgroundOpacity"]')?.textContent).toBe('0%');
            expect(popover.querySelector<HTMLOutputElement>('[data-subtitle-style-output="subtitleNativeBlurStrength"]')?.textContent).toBe(`${BASE_DEFAULT_SETTINGS.subtitleNativeBlurStrength}px`);

            toggle.click();

            expect(popover.hidden).toBe(true);
            expect(toggle.getAttribute('aria-expanded')).toBe('false');
            expect(root.classList.contains('jpdb-subtitle-style-open')).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('offers blurred, shown, and fully hidden native translations in the player controls', () => {
        const onSettingsChange = vi.fn();
        const { settings, controller } = createInstalledSubtitleController({
            subtitleSecondaryVisible: true,
            subtitleSecondaryVisibleChosen: false,
            subtitleNativeBlurred: true,
        }, { onSettingsChange });
        const internals = controllerInternals<{
            render: () => void;
            secondaryCue?: { start: number; end: number; text: string; transcriptEligible: boolean };
        }>(controller);

        try {
            internals.secondaryCue = { start: 0, end: 2, text: 'Read only when needed.', transcriptEligible: true };
            internals.render();
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            root.querySelector<HTMLButtonElement>('[data-action="style"]')!.click();
            const popover = root.querySelector<HTMLElement>('[data-subtitle-style-popover]')!;
            const mode = popover.querySelector<HTMLSelectElement>('[data-subtitle-style-setting="subtitleNativeDisplay"]')!;
            const strength = popover.querySelector<HTMLElement>('[data-subtitle-style-field="subtitleNativeBlurStrength"]')!;
            const originalNativeLine = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-secondary')!;

            expect(mode.value).toBe('blurred');
            expect(strength.hidden).toBe(false);

            mode.value = 'shown';
            mode.dispatchEvent(new Event('change', { bubbles: true }));

            expect(settings.subtitleSecondaryVisible).toBe(true);
            expect(settings.subtitleSecondaryVisibleChosen).toBe(true);
            expect(settings.subtitleNativeBlurred).toBe(false);
            expect(strength.hidden).toBe(true);
            expect(root.querySelector('.jpdb-subtitle-secondary')).toBe(originalNativeLine);
            expect(onSettingsChange).toHaveBeenLastCalledWith([
                'subtitleSecondaryVisible',
                'subtitleSecondaryVisibleChosen',
                'subtitleNativeBlurred',
            ]);

            mode.value = 'hidden';
            mode.dispatchEvent(new Event('change', { bubbles: true }));

            expect(settings.subtitleSecondaryVisible).toBe(false);
            expect(root.querySelector('.jpdb-subtitle-secondary')).toBeNull();

            popover.querySelector<HTMLButtonElement>('[data-action="style-reset"]')!.click();

            expect(mode.value).toBe('blurred');
            expect(settings.subtitleSecondaryVisible).toBe(true);
            expect(settings.subtitleNativeBlurred).toBe(true);
            // Reset restores the default reveal mode but WITHDRAWS the choice
            // instead of recording it: pinning `subtitleSecondaryVisible: true`
            // as an explicit choice is what let Reset re-enable native
            // subtitles and then revert the next attempt to turn them off.
            expect(settings.subtitleSecondaryVisibleChosen).toBe(false);
            expect(onSettingsChange).toHaveBeenLastCalledWith([], [
                'subtitleSecondaryVisible',
                'subtitleSecondaryVisibleChosen',
                'subtitleNativeBlurred',
                'subtitleNativeBlurStrength',
                'subtitleFontSize',
                'subtitleFontWeight',
                'subtitleBottomOffset',
                'subtitleBackgroundOpacity',
                'subtitleFontFamily',
                'subtitleMiningPause',
                'subtitleHoverPause',
            ]);

            expect(strength.hidden).toBe(false);
            expect(root.querySelector('.jpdb-subtitle-secondary-blurred')).not.toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('contains pointer and click events inside subtitle style controls', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
        const toggle = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="style"]')!;
        try {
            toggle.click();
            const popover = root.querySelector<HTMLElement>('[data-subtitle-style-popover]')!;
            const range = popover.querySelector<HTMLInputElement>('[data-subtitle-style-setting="subtitleFontSize"]')!;
            const checkbox = popover.querySelector<HTMLInputElement>('[data-subtitle-style-setting="subtitleHoverPause"]')!;
            const documentPointer = vi.fn();
            const documentPointerUp = vi.fn();
            const documentClick = vi.fn();
            document.addEventListener('pointerdown', documentPointer);
            document.addEventListener('pointerup', documentPointerUp);
            document.addEventListener('click', documentClick);

            range.dispatchEvent(pointerEvent('pointerdown', { clientY: 120, pointerId: 31 }));
            range.dispatchEvent(pointerEvent('pointerup', { clientY: 120, pointerId: 31 }));
            range.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            checkbox.dispatchEvent(pointerEvent('pointerdown', { clientY: 160, pointerId: 32 }));
            checkbox.dispatchEvent(pointerEvent('pointerup', { clientY: 160, pointerId: 32 }));
            checkbox.click();

            expect(documentPointer).not.toHaveBeenCalled();
            expect(documentPointerUp).not.toHaveBeenCalled();
            expect(documentClick).not.toHaveBeenCalled();
            expect(popover.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-style-open')).toBe(true);

            popover.querySelector<HTMLButtonElement>('[data-action="style-reset"]')!.click();
            expect(documentClick).not.toHaveBeenCalled();
            expect(popover.hidden).toBe(false);

            document.removeEventListener('pointerdown', documentPointer);
            document.removeEventListener('pointerup', documentPointerUp);
            document.removeEventListener('click', documentClick);
        } finally {
            controller.destroy();
        }
    });

    it('keeps subtitle text at the exact user-selected pixel size', () => {
        withExactSubtitleSizeHarness(({ root, lines, syncSelectedSize }) => {
            mockElementRect(root, new DOMRect(0, 0, 1920, 1080));
            lines.innerHTML = '<div class="jpdb-subtitle-primary">短い。</div>';
            syncSelectedSize();

            expectExactSubtitleSize(root, { secondary: true });
        });
    });

    it('does not measure or shrink overflowing primary and secondary subtitle lines', () => {
        withExactSubtitleSizeHarness(({ root, lines, syncSelectedSize }) => {
            mockElementRect(root, new DOMRect(0, 0, 1280, 720));
            lines.innerHTML = '<div class="jpdb-subtitle-primary-row"><div class="jpdb-subtitle-primary">今日は読む。</div></div><button class="jpdb-subtitle-secondary">A very long native subtitle block.</button>';
            Object.defineProperties(lines, {
                clientHeight: { configurable: true, get: () => { throw new Error('subtitle height must not be measured'); } },
                clientWidth: { configurable: true, get: () => { throw new Error('subtitle width must not be measured'); } },
                scrollHeight: { configurable: true, get: () => { throw new Error('subtitle overflow must not be measured'); } },
                scrollWidth: { configurable: true, get: () => { throw new Error('subtitle overflow must not be measured'); } },
            });

            syncSelectedSize();

            expectExactSubtitleSize(root, { secondary: true });
        });
    });

    it('reasserts the selected size through cue and deferred parsed-html replacements', () => {
        withExactSubtitleSizeHarness(({ controller, root }) => {
            const internals = controllerInternals<{
                render: () => void;
                replacePrimaryHtml: (html: string, serial: number) => HTMLElement | null;
                renderSerial: number;
                cues: Array<{ start: number; end: number; text: string; transcriptEligible: boolean }>;
                currentCue: { start: number; end: number; text: string; transcriptEligible: boolean };
            }>(controller);
            const first = { start: 0, end: 2, text: '最初の字幕です。', transcriptEligible: true };
            internals.cues = [first];
            internals.currentCue = first;
            internals.render();
            expectExactSubtitleSize(root);

            root.style.setProperty('--subtitle-font-size', '14px');
            expect(internals.replacePrimaryHtml('<span class="jpdb-reader-word">最初</span>の字幕です。', internals.renderSerial)).not.toBeNull();
            expectExactSubtitleSize(root);

            const second = { start: 2, end: 4, text: '次の長い字幕も同じ大きさです。', transcriptEligible: true };
            internals.cues = [first, second];
            internals.currentCue = second;
            root.style.setProperty('--subtitle-font-size', '14px');
            internals.render();
            expectExactSubtitleSize(root);
        });
    });

    it('restores the selected size after a hidden-tab or zoom layout reports zero geometry', () => {
        withExactSubtitleSizeHarness(({ root, lines, syncSelectedSize }) => {
            mockElementRect(root, new DOMRect(0, 0, 0, 0));
            lines.innerHTML = '<div class="jpdb-subtitle-primary-row"><div class="jpdb-subtitle-primary">長い字幕。</div></div>';
            Object.defineProperties(lines, {
                clientHeight: { configurable: true, value: 0 },
                clientWidth: { configurable: true, value: 0 },
                scrollHeight: { configurable: true, value: 1000 },
                scrollWidth: { configurable: true, value: 1000 },
            });
            root.style.setProperty('--subtitle-font-size', '14px');

            syncSelectedSize();

            expectExactSubtitleSize(root);
        });
    });

    it('does not cap the selected pixel size in touch layouts', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).not.toContain('font-size: min(var(--subtitle-font-size)');
        expect(normalizedCss).toMatch(/\.jpdb-subtitle-text \{[^}]*display: flex;[^}]*flex-direction: column;/);
        expect(normalizedCss).toMatch(/\.jpdb-subtitle-lines \{[^}]*align-content: end;/);
        expect(normalizedCss).toMatch(/\.jpdb-subtitle-primary \{[^}]*font-size: var\(--subtitle-font-size\) !important;/);
        expect(normalizedCss).toMatch(/\.jpdb-subtitle-primary :is\([^}]*\.jpdb-reader-word,[^}]*ruby,[^}]*\.jpdb-reader-ruby-base[^}]*\) \{[^}]*font-size: inherit !important;/);
        expect(normalizedCss).toMatch(/\.jpdb-subtitle-primary \.jpdb-reader-furi \{[^}]*font-size: \.58em !important;/);
    });

    it('keeps plain overlay and transcript captions selectable while annotations are paused', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).toMatch(/\.jpdb-subtitle-player \{[^}]*-webkit-user-select: none;[^}]*user-select: none;/);
        expect(normalizedCss).toMatch(/\.jpdb-subtitle-list \{[^}]*-webkit-user-select: none;[^}]*user-select: none;/);
        expect(normalizedCss).toMatch(
            /\.jpdb-subtitle-player\.jpdb-subtitle-annotations-paused \.jpdb-subtitle-primary \{[^}]*pointer-events: auto;/,
        );
        const selectableRule = normalizedCss.match(
            /:is\(\.jpdb-subtitle-player, \.jpdb-subtitle-list\)\.jpdb-subtitle-annotations-paused :is\(\.jpdb-subtitle-primary, \.jpdb-subtitle-secondary, \.jpdb-subtitle-row-text, \.jpdb-subtitle-row-secondary\) \{[^}]*\}/,
        )?.[0] ?? '';
        expect(selectableRule).toContain('-webkit-user-select: text');
        expect(selectableRule).toContain('user-select: text');
        expect(selectableRule).toContain('cursor: text');
    });

    it('preserves selected plain caption text without seeking or toggling the native line', () => {
        const cue = { start: 4, end: 6, text: '今日は読む。', transcriptEligible: true };
        const { controller, settings } = createInstalledSubtitleController({
            annotationsPaused: true,
            subtitleOverlayVisible: true,
            subtitleSecondaryVisible: true,
            subtitleTranscriptVisible: false,
        });
        const video = attachVideo(controller, { currentTime: 0.5 });
        const internals = controllerInternals<{
            cues: Array<typeof cue>;
            currentCue: typeof cue;
            secondaryCue: typeof cue;
            render: () => void;
            openLinesPanel: () => void;
        }>(controller);
        internals.cues = [cue];
        internals.currentCue = cue;
        internals.secondaryCue = { ...cue, text: 'Read today.' };

        const selectText = (element: HTMLElement): void => {
            const text = element.firstChild;
            if (!text) throw new Error('Expected selectable caption text.');
            const range = document.createRange();
            range.setStart(text, 0);
            range.setEnd(text, Math.min(4, text.textContent?.length ?? 0));
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
        };

        try {
            internals.render();
            const secondary = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-secondary')!;
            const blurBefore = settings.subtitleNativeBlurred;
            selectText(secondary);
            const secondaryClick = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
            secondary.dispatchEvent(secondaryClick);

            expect(secondaryClick.defaultPrevented).toBe(true);
            expect(settings.subtitleNativeBlurred).toBe(blurBefore);
            expect(window.getSelection()?.toString()).toBe('Read');

            internals.openLinesPanel();
            const rowText = document.querySelector<HTMLElement>('.jpdb-subtitle-list-row .jpdb-subtitle-row-text')!;
            selectText(rowText);
            const rowClick = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
            rowText.dispatchEvent(rowClick);

            expect(rowClick.defaultPrevented).toBe(true);
            expect(video.currentTime).toBe(0.5);
            expect(window.getSelection()?.toString()).toBe('今日は読');
        } finally {
            window.getSelection()?.removeAllRanges();
            controller.destroy();
        }
    });

    it('gates compound pitch gradients on the subtitle underline setting independently of page words', () => {
        const reset = SUBTITLES_YOUTUBE_CSS.match(
            /:is\(\.jpdb-subtitle-primary,[^}]+data-pitch-components="true"]::after\s*\{[^}]*\}/,
        )?.[0] ?? '';
        const enabled = SUBTITLES_YOUTUBE_CSS.match(
            /\.jpdb-reader-subtitle-underline-pitch\s+:is\(\.jpdb-subtitle-primary,[^}]+data-pitch-components="true"]::after\s*\{[^}]*\}/,
        )?.[0] ?? '';

        // A page-level pitch setting must not leak the component background
        // through a status/JPDB subtitle underline.
        expect(reset).toContain('border-block-end: var(--jpdb-reader-word-underline-thickness)');
        expect(reset).toContain('background-image: none');
        // Conversely, subtitle pitch must paint even when ordinary page words
        // use a different underline source.
        expect(enabled).toContain('border-block-end: 0');
        expect(enabled).toContain('var(--jpdb-reader-inline-pitch-gradient)');
    });

    it('renders the primary cue in its own row so the native secondary keeps a reserved bottom slot', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleSecondaryVisible: true });
        try {
            const internals = controllerInternals<{
                render: () => void;
                cues: Array<{ start: number; end: number; text: string; transcriptEligible: boolean }>;
                currentCue: { start: number; end: number; text: string; transcriptEligible: boolean };
                secondaryCue?: { start: number; end: number; text: string; transcriptEligible: boolean };
            }>(controller);
            const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
            internals.cues = [cue];
            internals.currentCue = cue;
            internals.secondaryCue = { start: 0, end: 2, text: 'I will read today.', transcriptEligible: true };
            internals.render();

            const lines = document.querySelector<HTMLElement>('.jpdb-subtitle-lines')!;
            const row = lines.querySelector<HTMLElement>(':scope > .jpdb-subtitle-primary-row')!;
            expect(row).not.toBeNull();
            expect(row.querySelector('.jpdb-subtitle-primary')?.textContent).toContain('今日は読む。');
            const secondary = lines.querySelector<HTMLElement>(':scope > .jpdb-subtitle-secondary')!;
            expect(secondary).not.toBeNull();
            // DOM order: the secondary occupies the LAST (bottom) grid row.
            expect(row.nextElementSibling).toBe(secondary);
        } finally {
            controller.destroy();
        }
    });

    it('keeps the pause-opened transcript closed while subtitle style controls are open', () => {
        const { controller } = createInstalledSubtitleController({
            subtitleOverlayVisible: true,
            subtitlePausePanel: true,
            subtitleTranscriptVisible: false,
            subtitleFontSize: 28,
        });
        const video = attachVideo(controller, { currentTime: 0.5 });
        Object.defineProperty(video, 'paused', { configurable: true, value: true });
        Object.defineProperty(video, 'ended', { configurable: true, value: false });
        const cue = { start: 0, end: 2, text: '一時停止した行。', transcriptEligible: true };
        const internals = controllerInternals<{
            cues: Array<typeof cue>;
            currentCue: typeof cue;
            syncPauseTranscriptPanel: () => void;
        }>(controller);
        internals.cues = [cue];
        internals.currentCue = cue;

        try {
            controller.refresh();
            internals.syncPauseTranscriptPanel();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const toggle = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="style"]')!;

            expect(panel.hidden).toBe(false);
            expect(panel.textContent).toContain('一時停止した行');

            toggle.click();

            const popover = root.querySelector<HTMLElement>('[data-subtitle-style-popover]')!;
            setSubtitleStyleControlValue(popover, 'subtitleFontSize', '34');
            expect(popover.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-style-open')).toBe(true);
            expect(panel.hidden).toBe(true);

            internals.syncPauseTranscriptPanel();

            expect(panel.hidden).toBe(true);

            toggle.click();
            internals.syncPauseTranscriptPanel();

            expect(root.classList.contains('jpdb-subtitle-style-open')).toBe(false);
            expect(panel.hidden).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('keeps playback out of the drawer transport cluster too', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller } = createInstalledSubtitleController();
        attachVideo(controller, { currentTime: 0.5 });

        try {
            const internals = controllerInternals<{
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const previous = panel.querySelector<HTMLButtonElement>('.jpdb-subtitle-drawer-playback [data-action="previous"]')!;
            const next = panel.querySelector<HTMLButtonElement>('.jpdb-subtitle-drawer-playback [data-action="next"]')!;

            expect(previous.hidden).toBe(false);
            expect(next.hidden).toBe(false);
            expect(panel.querySelector('.jpdb-subtitle-drawer-playback [data-action="playback"]')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('toggles subtitle visibility for the current video from the rail eye button', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const onSettingsChange = vi.fn();
        const { controller, settings } = createInstalledSubtitleController({ subtitleOverlayVisible: true }, { onSettingsChange });

        try {
            attachVideo(controller, { currentTime: 0.5 });
            const internals = controllerInternals<{
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const visibility = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="visibility"]')!;

            expect(root.classList.contains('jpdb-subtitle-hidden')).toBe(false);
            expect(visibility.getAttribute('aria-pressed')).toBe('true');
            expect(visibility.getAttribute('aria-label')).toBe('Show subtitle overlay');

            visibility.click();

            expect(settings.subtitleOverlayVisible).toBe(false);
            expect(onSettingsChange).toHaveBeenCalledTimes(1);
            expect(root.classList.contains('jpdb-subtitle-hidden')).toBe(true);
            expect(visibility.getAttribute('aria-pressed')).toBe('false');
            expect(visibility.getAttribute('aria-label')).toBe('Show subtitle overlay');

            visibility.click();

            expect(settings.subtitleOverlayVisible).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-hidden')).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('keeps drawer line navigation enabled while the docked side panel is open during playback', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller } = createInstalledSubtitleController();
        const video = attachVideo(controller, { currentTime: 0.5 });
        Object.defineProperty(video, 'paused', { configurable: true, value: false });

        try {
            const internals = controllerInternals<{
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const previous = panel.querySelector<HTMLButtonElement>('.jpdb-subtitle-drawer-playback [data-action="previous"]')!;
            const next = panel.querySelector<HTMLButtonElement>('.jpdb-subtitle-drawer-playback [data-action="next"]')!;

            expect(panel.hidden).toBe(false);
            // While the panel is open the drawer transport takes over, so the
            // rail's own prev/next copies hide (they only show panel-closed).
            const railPrevious = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="previous"]')!;
            const railNext = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="next"]')!;
            expect(railPrevious.hidden).toBe(true);
            expect(railNext.hidden).toBe(true);
            expect(previous.hidden).toBe(false);
            expect(previous.disabled).toBe(false);
            expect(next.hidden).toBe(false);
            expect(next.disabled).toBe(false);
            expect(panel.querySelector('.jpdb-subtitle-drawer-playback [data-action="playback"]')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('shows rail prev/next line while the panel is closed and hides them once it opens', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller } = createInstalledSubtitleController();
        const video = attachVideo(controller, { currentTime: 0.5 });
        Object.defineProperty(video, 'paused', { configurable: true, value: false });

        try {
            const internals = controllerInternals<{
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const railPrevious = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="previous"]')!;
            const railNext = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="next"]')!;
            // Panel closed: rail transport is visible and live.
            expect(railPrevious.hidden).toBe(false);
            expect(railPrevious.disabled).toBe(false);
            expect(railNext.hidden).toBe(false);
            expect(railNext.disabled).toBe(false);
            expect(railPrevious.getAttribute('aria-label')).toBe('Previous subtitle');
            expect(railNext.getAttribute('aria-label')).toBe('Next subtitle');

            // Opening the panel hides the rail copies (drawer transport takes over).
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();
            expect(railPrevious.hidden).toBe(true);
            expect(railNext.hidden).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('reaches the Tracks tab through the drawer instead of a duplicate rail shortcut', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller } = createInstalledSubtitleController();

        try {
            attachVideo(controller, { currentTime: 0.5 });
            setSingleJapaneseSubtitleTrack(controller);
            const internals = controllerInternals<{
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const panelButton = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!;
            expect(panelButton.hidden).toBe(false);
            expect(document.querySelector('.jpdb-subtitle-rail [data-action="panel-tracks"]')).toBeNull();

            panelButton.click();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);
            const tracksTab = panel.querySelector<HTMLButtonElement>('.jpdb-subtitle-panel-mode [data-action="panel-tracks"]')!;
            expect(tracksTab).not.toBeNull();

            tracksTab.click();

            expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('keeps the video rail hidden when tracks exist but no video frame is present', () => {
        const { controller } = createInstalledSubtitleController();
        const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
        controllerInternals<{ tracks: unknown[] }>(controller).tracks = [{ id: 'stale-track' }];

        try {
            controller.refresh();

            expect(root.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-has-video-frame')).toBe(false);
            expect(root.querySelector('.jpdb-subtitle-rail')).not.toBeNull();
            expect(SUBTITLES_YOUTUBE_CSS).toContain('.jpdb-subtitle-player:not(.jpdb-subtitle-has-video-frame) .jpdb-subtitle-rail');
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('keeps the tracks upload panel open before a video is detected', () => {
        const { controller } = createInstalledSubtitleController();

        try {
            controllerInternals<{ openTracksPanel: () => void }>(controller).openTracksPanel();
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(root.hidden).toBe(false);
            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(true);
            expect(panel.textContent).toContain('Load Japanese subtitles');
            expect(panel.textContent).toContain('Load native subtitles');
            expect(panel.querySelector('[data-action="panel-lines"]')).toBeNull();
            expect(panel.querySelector('[data-action="panel-shadow"]')).toBeNull();
            expect(panel.querySelector('[data-action="panel-mine"]')).toBeNull();
            // Placement lives in the panel-options menu; the close (X) is now a
            // standalone one-click head button OUTSIDE that menu. Both appear even
            // before a transcript exists — only the mode tabs need a surface.
            expect(panel.querySelector('[data-panel-options]')).not.toBeNull();
            const closeButton = panel.querySelector('.jpdb-subtitle-drawer-head [data-action="close-panel"]');
            expect(closeButton).not.toBeNull();
            expect(closeButton?.classList.contains('jpdb-subtitle-panel-close')).toBe(true);
            expect(closeButton?.closest('.jpdb-subtitle-panel-options-menu')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('shows the remembered transcript placement on the closed rail toggle', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitleTranscriptPlacement: 'left' as const,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });

        try {
            (controller as unknown as { install: () => void }).install();
            const button = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!;
            expect(button.getAttribute('aria-pressed')).toBe('false');
            expect(button.innerHTML).toContain('M10 5v14');
        } finally {
            controller.destroy();
        }
    });

    it('advertises the forced bottom drawer on the closed rail toggle at compact widths', () => {
        withViewport(390, 844, () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                subtitleTranscriptPlacement: 'left' as const,
            };
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange: () => undefined,
            });

            try {
                (controller as unknown as { install: () => void }).install();
                const button = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!;
                expect(button.getAttribute('aria-pressed')).toBe('false');
                // Compact viewports always open the drawer as a bottom sheet, so
                // the closed toggle must show the panel-bottom icon, not the
                // stored side preference.
                expect(button.innerHTML).toContain('M4 14h16');
                expect(button.innerHTML).not.toContain('M10 5v14');
            } finally {
                controller.destroy();
            }
        });
    });

    it('does not mount native subtitle file inputs inside the floating player', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });
        const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);

        try {
            (controller as unknown as { install: () => void; openTracksPanel: () => void }).install();
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;

            expect(root.querySelector('input[type="file"]')).toBeNull();

            (controller as unknown as { openTracksPanel: () => void }).openTracksPanel();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-list [data-action="load"]')!.click();

            const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
            expect(root.querySelector('input[type="file"]')).toBeNull();
            expect(picker.multiple).toBe(true);
            expect(picker.accept).toContain('.ass');
            expect(picker.accept).toContain('text/plain');
            expect(picker.accept).toContain('application/x-subrip');
            expect(picker.style.getPropertyValue('display')).toBe('none');
            expect(picker.style.getPropertyPriority('display')).toBe('important');
            expect(clickSpy).toHaveBeenCalledTimes(1);

            picker.dispatchEvent(new Event('cancel'));
            expect(document.querySelector('input[type="file"]')).toBeNull();
        } finally {
            clickSpy.mockRestore();
            controller.destroy();
        }
    });

    it('keeps manual subtitle picker files readable until upload finishes', async () => {
        const { controller } = createSubtitleController(makeSubtitleSettings());
        const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
        const primary = new File([`
[Script Info]
Title: picker
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:04.00,Default,,0,0,0,,猫を見る
`], 'episode.ja.ass', { type: 'text/plain' });
        const native = new File([`1
00:00:00,000 --> 00:00:04,000
Watch the cat
`], 'episode.en.srt', { type: 'application/x-subrip' });

        try {
            controller.init();
            attachVideo(controller, { currentTime: 1 });
            (controller as unknown as { openTracksPanel: () => void }).openTracksPanel();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-list [data-action="load"]')!.click();

            const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
            Object.defineProperty(picker, 'files', { configurable: true, value: [native, primary] });
            picker.dispatchEvent(new Event('change'));

            expect(document.querySelector('input[type="file"]')).toBe(picker);

            // Loaded CI runners can stretch the parse/upload path past the 1s
            // default; only patience changes here, not the contract.
            await vi.waitFor(() => {
                expect(document.querySelector('input[type="file"]')).toBeNull();
                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list');
                expect(panel?.textContent).toContain('episode.ja');
                expect(panel?.textContent).toContain('episode.en');
                expect(panel?.querySelector('[data-action="panel-shadow"]')).not.toBeNull();
                expect(panel?.querySelector('[data-action="panel-mine"]')).not.toBeNull();
            }, { timeout: 10_000 });

            const internals = controllerInternals<{
                selectedTrackId: string;
                secondaryTrackId: string;
                tracks: Array<{ id: string; label: string }>;
            }>(controller);
            expect(internals.tracks.find(track => track.id === internals.selectedTrackId)?.label).toBe('episode.ja');
            expect(internals.tracks.find(track => track.id === internals.secondaryTrackId)?.label).toBe('episode.en');
        } finally {
            clickSpy.mockRestore();
            controller.destroy();
        }
    }, 30_000);

    it('loads host-provided subtitle files and opens the Japanese transcript', async () => {
        const { controller } = createSubtitleController(makeSubtitleSettings());
        const primary = new File([`WEBVTT

00:00:00.000 --> 00:00:04.000
猫を見る
`], 'episode.ja.vtt', { type: 'text/vtt' });
        const native = new File([`WEBVTT

00:00:00.000 --> 00:00:04.000
Watch the cat
`], 'episode.en.vtt', { type: 'text/vtt' });

        try {
            controller.init();
            attachVideo(controller, { currentTime: 1 });

            window.dispatchEvent(new CustomEvent(LOAD_SUBTITLE_FILES_EVENT, {
                detail: { files: [native, primary], openPanel: 'auto' },
            }));

            await vi.waitFor(() => {
                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list');
                expect(panel?.hidden).toBe(false);
                expect(panel?.classList.contains('jpdb-subtitle-lines-panel')).toBe(true);
                expect(panel?.textContent).toContain('猫を見る');
                expect(panel?.textContent).not.toContain('Watch the cat');
            });

            const internals = controllerInternals<{
                selectedTrackId: string;
                secondaryTrackId: string;
                tracks: Array<{ id: string; label: string }>;
            }>(controller);
            expect(internals.tracks.find(track => track.id === internals.selectedTrackId)?.label).toBe('episode.ja');
            expect(internals.tracks.find(track => track.id === internals.secondaryTrackId)?.label).toBe('episode.en');
        } finally {
            controller.destroy();
        }
    });

    it('opens and closes the transcript drawer from the rail panel toggle', async () => {
        vi.useFakeTimers();
        const onSettingsChange = vi.fn();
        const { settings, controller } = createInstalledSubtitleController({ subtitleTranscriptVisible: false }, { onSettingsChange });

        try {
            const video = document.createElement('video');
            const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                transcriptPanelSessionOpen: boolean;
            };
            internals.video = video;
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const button = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!;

            expect(button.disabled).toBe(false);
            expect(button.getAttribute('aria-pressed')).toBe('false');

            button.click();

            expect(panel.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-panel-open')).toBe(true);
            expect(button.getAttribute('aria-pressed')).toBe('true');
            // Runtime open is tracked in page-scoped state, NOT persisted into the
            // global "open by default" preference (that leaked across tabs).
            expect(internals.transcriptPanelSessionOpen).toBe(true);
            expect(settings.subtitleTranscriptVisible).toBe(false);

            button.click();

            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-panel-closing')).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-panel-open')).toBe(false);
            expect(button.getAttribute('aria-pressed')).toBe('false');
            expect(internals.transcriptPanelSessionOpen).toBe(false);
            expect(settings.subtitleTranscriptVisible).toBe(false);
            // Opening/closing the drawer must not write persisted settings.
            expect(onSettingsChange).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(181);

            expect(panel.hidden).toBe(true);
            expect(panel.classList.contains('jpdb-subtitle-panel-closing')).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('closes the transcript drawer from the standalone head X button', async () => {
        vi.useFakeTimers();
        const onSettingsChange = vi.fn();
        const { settings, controller } = createInstalledSubtitleController({ subtitleTranscriptVisible: false }, { onSettingsChange });

        try {
            const video = document.createElement('video');
            const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                openLinesPanel: () => void;
            };
            internals.video = video;
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();
            internals.openLinesPanel();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);

            // The X is a one-click head button, not buried in the options popover.
            const closeButton = panel.querySelector<HTMLButtonElement>('.jpdb-subtitle-drawer-head .jpdb-subtitle-panel-close[data-action="close-panel"]')!;
            expect(closeButton).not.toBeNull();
            expect(closeButton.closest('.jpdb-subtitle-panel-options-menu')).toBeNull();

            closeButton.click();

            expect(panel.classList.contains('jpdb-subtitle-panel-closing')).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-panel-open')).toBe(false);
            await vi.advanceTimersByTimeAsync(181);
            expect(panel.hidden).toBe(true);
            // A one-click close is page-scoped and never rewrites persisted state.
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(onSettingsChange).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('does not auto-open the drawer when opened elsewhere: default stays off (no cross-tab/homepage leak)', () => {
        const onSettingsChange = vi.fn();
        const { settings, controller } = createInstalledSubtitleController({ subtitleTranscriptVisible: false }, { onSettingsChange });

        try {
            const video = document.createElement('video');
            const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                openLinesPanel: () => void;
            };
            internals.video = video;
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            // Open the drawer at runtime (as on a video site)...
            internals.openLinesPanel();
            expect(document.querySelector<HTMLElement>('.jpdb-subtitle-list')!.hidden).toBe(false);
            // ...the persisted "open by default" preference must stay off, so a
            // fresh tab / the homepage (which reads this global setting on load)
            // does NOT auto-open.
            expect(settings.subtitleTranscriptVisible).toBe(false);

            // A brand-new controller sharing the same (still-false) settings — i.e.
            // another tab — keeps its drawer closed after refresh.
            const secondTab = createInstalledSubtitleController({ subtitleTranscriptVisible: false });
            try {
                const otherInternals = secondTab.controller as unknown as {
                    video: HTMLVideoElement;
                    cues: Array<typeof cue>;
                    currentCue: typeof cue;
                };
                otherInternals.video = document.createElement('video');
                otherInternals.cues = [cue];
                otherInternals.currentCue = cue;
                secondTab.controller.refresh();
                const panels = document.querySelectorAll<HTMLElement>('.jpdb-subtitle-list');
                expect([...panels].every(panel => panel.hidden)).toBe(true);
            } finally {
                secondTab.controller.destroy();
            }
        } finally {
            controller.destroy();
        }
    });
});
