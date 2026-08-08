import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_SETTINGS,
    registerSubtitleControllerCleanup,
    SUBTITLES_YOUTUBE_CSS,
    withMatchMedia,
    mockElementRect,
    makeSubtitleSettings,
    controllerInternals,
    createSubtitleController,
    createInstalledSubtitleController,
    attachVideo,
    setupInstalledVideoController,
    handlePointerActivity,
    mountYouTubePlayerSubtitleController,
    pointerEvent,
    expectSubtitleControlsReturnToIdle,
    withViewport,
    SubtitlePlayerController,
} from './fixtures';
import { loadSettings, NO_EXPLICIT_USER_CHOICE, saveSettings } from '../../../src/reader/settings/index';

describe('SubtitlePlayerController — idle controls, overlay drag & rail visibility', () => {
    registerSubtitleControllerCleanup();

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('returns compact subtitle controls to idle after pointer activity over video', async () => {
        vi.useFakeTimers();
        const { controller, root } = setupInstalledVideoController(new DOMRect(0, 0, 1920, 1080));

        try {
            await expectSubtitleControlsReturnToIdle(controller, root);
        } finally {
            controller.destroy();
        }
    });

    it('returns subtitle controls to idle on coarse pointer devices', async () => {
        vi.useFakeTimers();
        await withMatchMedia(query => query === '(pointer: coarse)', async () => {
            const { controller, root } = setupInstalledVideoController(new DOMRect(0, 0, 390, 240));

            try {
                await expectSubtitleControlsReturnToIdle(controller, root);
            } finally {
                controller.destroy();
            }
        });
    });

    it('reveals the move handle from a displaced subtitle tap without intercepting native player space', async () => {
        vi.useFakeTimers();
        const { controller, internals, root, subtitleFrame, video } = mountYouTubePlayerSubtitleController({
            extraBodyHtml: '<a id="subtitle-underlay" href="#unexpected">Under subtitle</a>',
        });

        try {
            // In the normal position, blank subtitle-band clicks still belong
            // to the native player (play/pause or revealing its chrome).
            mockElementRect(subtitleFrame, new DOMRect(16, 280, 608, 64));
            const nativePlayerClick = vi.fn();
            video.addEventListener('click', nativePlayerClick);
            const onVideoClick = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 320,
                clientY: 310,
            });
            video.dispatchEvent(onVideoClick);
            expect(onVideoClick.defaultPrevented).toBe(false);
            expect(nativePlayerClick).toHaveBeenCalledTimes(1);

            // The line now sits wholly below the 360px-tall video.
            mockElementRect(subtitleFrame, new DOMRect(16, 400, 608, 72));
            internals.hideControlsImmediately();
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            // Lookup handlers are allowed to stop bubbling; the capture-phase
            // surface wake must still observe a touch on the subtitle line.
            subtitleFrame.addEventListener('pointerdown', event => event.stopPropagation());
            subtitleFrame.dispatchEvent(pointerEvent('pointerdown', {
                clientX: 320,
                clientY: 430,
                pointerId: 21,
                pointerType: 'touch',
            }));

            // A deliberate tap inside the painted subtitle rectangle reveals
            // the otherwise unreachable move handle, even when a lookup word
            // stops the event before it can bubble.
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);
            internals.syncPlayerChromeIdleState();
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);

            const underlay = document.querySelector<HTMLAnchorElement>('#subtitle-underlay')!;
            // The transparent frame does not become a hit target. A press that
            // targets the page underneath but lands inside the displaced line
            // must keep the capture-phase wake when it bubbles back to document.
            internals.hideControlsImmediately();
            await vi.advanceTimersByTimeAsync(400);
            underlay.dispatchEvent(pointerEvent('pointerdown', {
                clientX: 320,
                clientY: 430,
                pointerId: 22,
                pointerType: 'touch',
            }));
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-controls-away')).toBe(false);

            const underlayClick = vi.fn();
            underlay.addEventListener('click', underlayClick);
            const click = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 320,
                clientY: 430,
            });
            underlay.dispatchEvent(click);
            expect(click.defaultPrevented).toBe(true);
            expect(underlayClick).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(document.querySelector('#movie_player'));

            // A reader-owned surface paints ABOVE the subtitle layer, so a
            // press on it is never page content the frame is covering — the
            // shield must not touch it. Previously the capture-phase
            // stopPropagation killed the dialog's own listeners, so Cancel over
            // a video did nothing but focus the player and reveal its controls.
            const dialog = document.createElement('div');
            dialog.dataset.jpdbReaderRoot = 'true';
            const cancel = document.createElement('button');
            const cancelClick = vi.fn();
            cancel.addEventListener('click', cancelClick);
            dialog.append(cancel);
            document.body.append(dialog);
            internals.hideControlsImmediately();
            await vi.advanceTimersByTimeAsync(400);

            cancel.dispatchEvent(pointerEvent('pointerdown', {
                clientX: 320,
                clientY: 430,
                pointerId: 23,
                pointerType: 'touch',
            }));
            // Pressing the dialog must not wake the rail either.
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            const dialogClick = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 320,
                clientY: 430,
            });
            cancel.dispatchEvent(dialogClick);
            expect(dialogClick.defaultPrevented).toBe(false);
            expect(cancelClick).toHaveBeenCalledTimes(1);
            dialog.remove();

            await vi.advanceTimersByTimeAsync(2600);
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            // Hovering the displaced line is still only a reading gesture —
            // recovery is deliberate tap/click behavior, not hover flicker.
            subtitleFrame.dispatchEvent(pointerEvent('pointermove', {
                clientX: 320,
                clientY: 430,
                pointerId: 22,
                pointerType: 'mouse',
            }));
            await vi.advanceTimersByTimeAsync(20);
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);
        } finally {
            controller.destroy();
            document.body.innerHTML = '';
        }
    });

    // Owner-reported twice on iPad: "pressing the native subtitle to blur it
    // instead focuses and expands the rail". The wake is a capture-phase
    // POINTERDOWN, so on touch it answers the tap before any click handler
    // runs — gating only the click would leave the bug exactly as reported.
    it('blurs the native line from a touch tap while leaving the rail idle', async () => {
        vi.useFakeTimers();
        const onSettingsChange = vi.fn();
        const { controller, internals, root, settings, subtitleFrame } = mountYouTubePlayerSubtitleController({
            hooks: { onSettingsChange },
            settings: { subtitleSecondaryVisible: true, subtitleNativeBlurred: true },
        });

        try {
            internals.secondaryCue = { start: 0, end: 2, text: 'I will read today.', transcriptEligible: true };
            internals.render();
            mockElementRect(subtitleFrame, new DOMRect(16, 280, 608, 72));
            const nativeLine = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-secondary')!;

            // Discoverability: the line announces as a toggle button that is
            // currently pressed (blurred), not as unexplained caption text.
            expect(nativeLine.getAttribute('aria-pressed')).toBe('true');
            expect(nativeLine.getAttribute('aria-label')).toBe('Toggle native subtitle blur');

            internals.hideControlsImmediately();
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            // Blank space inside the same rectangle still wakes the rail — that
            // recovery gesture is legitimate and must survive the fix. Proving
            // it here also proves the geometric gate is live at this point, so
            // the native-line assertions below cannot pass vacuously.
            subtitleFrame.dispatchEvent(pointerEvent('pointerdown', {
                clientX: 320,
                clientY: 300,
                pointerId: 31,
                pointerType: 'touch',
            }));
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-controls-away')).toBe(false);

            internals.hideControlsImmediately();
            await vi.advanceTimersByTimeAsync(400);
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-controls-away')).toBe(true);

            // Same rectangle, same coordinates — only the target differs.
            nativeLine.dispatchEvent(pointerEvent('pointerdown', {
                clientX: 320,
                clientY: 300,
                pointerId: 32,
                pointerType: 'touch',
            }));
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            // Browsers that focus a pressed button must not wake it either.
            nativeLine.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            onSettingsChange.mockClear();
            nativeLine.click();

            expect(settings.subtitleNativeBlurred).toBe(false);
            expect(onSettingsChange).toHaveBeenCalledTimes(1);
            expect(nativeLine.classList.contains('jpdb-subtitle-secondary-clear')).toBe(true);
            expect(nativeLine.getAttribute('aria-pressed')).toBe('false');
            // Still fully hidden: the blur toggled without the rail so much as
            // reappearing, let alone unfolding over the video.
            expect(root.classList.contains('jpdb-subtitle-controls-away')).toBe(true);

            // The in-place toggle must still match what a fresh render emits,
            // or the next tick rebuilds the line it just updated.
            internals.render();
            expect(root.querySelector('.jpdb-subtitle-secondary')).toBe(nativeLine);
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            // Tapping it back on is equally quiet.
            nativeLine.dispatchEvent(pointerEvent('pointerdown', {
                clientX: 320,
                clientY: 300,
                pointerId: 33,
                pointerType: 'touch',
            }));
            nativeLine.click();
            expect(settings.subtitleNativeBlurred).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);
        } finally {
            controller.destroy();
            document.body.innerHTML = '';
        }
    });

    // Owner-reported on a phone: "tapping the native line to blur it, I have to
    // tap multiple times for it to work." Measured cause: the primary line and
    // the native line were written as ONE innerHTML blob, so every primary
    // change — the next cue, a karaoke tick, a parse landing — destroyed and
    // rebuilt the native-line button. A browser only delivers click when the
    // pressed node is still in the document at release, so any tap that spanned
    // a caption change was dropped entirely. The finger is down for far longer
    // than a cue lasts, so most taps lost.
    it('toggles the native line from a single tap that spans a caption change', () => {
        const onSettingsChange = vi.fn();
        const { controller, internals, root, settings } = mountYouTubePlayerSubtitleController<{
            secondaryCue?: { start: number; end: number; text: string; transcriptEligible: boolean };
            currentCue?: { start: number; end: number; text: string; transcriptEligible: boolean };
            render(): void;
        }>({
            hooks: { onSettingsChange },
            settings: { subtitleSecondaryVisible: true, subtitleNativeBlurred: true },
        });

        try {
            internals.secondaryCue = { start: 0, end: 2, text: 'I will read today.', transcriptEligible: true };
            internals.render();
            const nativeLine = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-secondary')!;

            // The finger lands on the control.
            nativeLine.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'touch', pointerId: 41 }));

            // The video plays on under the finger: the Japanese line advances
            // and re-renders while the tap is still in flight.
            internals.currentCue = { start: 2, end: 4, text: '別の行です。', transcriptEligible: true };
            internals.render();

            // The pressed control must still BE the live control. If the render
            // swapped it out, the browser never fires click and the tap is lost.
            expect(nativeLine.isConnected).toBe(true);
            expect(root.querySelector('.jpdb-subtitle-secondary')).toBe(nativeLine);

            // The finger lifts — one tap, one toggle.
            nativeLine.dispatchEvent(pointerEvent('pointerup', { pointerType: 'touch', pointerId: 41 }));
            nativeLine.click();

            expect(settings.subtitleNativeBlurred).toBe(false);
            expect(onSettingsChange).toHaveBeenCalledTimes(1);
            expect(nativeLine.classList.contains('jpdb-subtitle-secondary-clear')).toBe(true);
            expect(nativeLine.getAttribute('aria-pressed')).toBe('false');

            // The native line also survives its OWN text changing, so a tap
            // spanning a translation change is not lost either.
            internals.secondaryCue = { start: 2, end: 4, text: 'Another line.', transcriptEligible: true };
            internals.render();
            expect(root.querySelector('.jpdb-subtitle-secondary')).toBe(nativeLine);
            expect(nativeLine.textContent).toContain('Another line.');
            // ...and the toggled state is not resurrected by that re-render.
            expect(nativeLine.getAttribute('aria-pressed')).toBe('false');

            // A second tap toggles straight back: no dead first tap either way.
            nativeLine.click();
            expect(settings.subtitleNativeBlurred).toBe(true);
            expect(nativeLine.getAttribute('aria-pressed')).toBe('true');
        } finally {
            controller.destroy();
            document.body.innerHTML = '';
        }
    });

    // The peek-on-hover reveal must not be what answers a tap: a touch browser
    // latches :hover on first contact, so an unconditional hover rule showed the
    // translation without toggling anything and the line needed tapping again.
    it('keeps the native-line peek on hovering pointers and its tap target finger-sized', () => {
        expect(SUBTITLES_YOUTUBE_CSS).toMatch(
            /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.jpdb-subtitle-secondary-blurred:hover/,
        );
        // Keyboard users keep the peek on every device.
        expect(SUBTITLES_YOUTUBE_CSS).toMatch(/\.jpdb-subtitle-secondary-blurred:focus-visible \{/);
        // The detached shadowing panel shares the blur rule, so it must define
        // the colour variable outside the live subtitle line's DOM subtree.
        expect(SUBTITLES_YOUTUBE_CSS).toMatch(
            /\.jpdb-subtitle-shadow-secondary \{[^}]*--jpdb-subtitle-secondary-color:/,
        );
        // No double-tap-zoom hold-back on a control that is only ever a toggle.
        expect(SUBTITLES_YOUTUBE_CSS).toMatch(/\.jpdb-subtitle-secondary \{[^}]*touch-action: manipulation/);
        // On touch the ~24px line gets a 42px box of its own, with the padding
        // handed straight back as negative margin so nothing moves. It has to be
        // the element's own box, not a pseudo-element halo: the safe-zone sweep
        // measures getBoundingClientRect, which a halo is invisible to.
        const coarse = SUBTITLES_YOUTUBE_CSS.match(
            /@media \(pointer: coarse\) \{\s*\.jpdb-subtitle-secondary \{([^}]*)\}/,
        );
        expect(coarse?.[1]).toBeDefined();
        expect(coarse![1]).toMatch(/min-height: 42px/);
        expect(coarse![1]).toMatch(/padding-top: 4px/);
        expect(coarse![1]).toMatch(/padding-bottom: 14px/);
        expect(coarse![1]).toMatch(/margin-top: 4px/);
        expect(coarse![1]).toMatch(/margin-bottom: -14px/);
        expect(SUBTITLES_YOUTUBE_CSS).not.toMatch(/\.jpdb-subtitle-secondary::after/);
    });

    it('marks the rail away while the player chrome is hidden so it disappears entirely', async () => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="movie_player" class="html5-video-player ytp-autohide" tabindex="-1"><video></video></div>';
        const { controller } = createSubtitleController(makeSubtitleSettings({ subtitleOverlayVisible: true }));
        controller.init();
        try {
            const video = document.querySelector<HTMLVideoElement>('video')!;
            mockElementRect(video, new DOMRect(0, 0, 640, 360));
            attachVideo(controller, { video });
            const internals = controllerInternals<{ syncPlayerChromeIdleState: () => void }>(controller);
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;

            // The fully-hidden commit is debounced so a strobing autohide class
            // cannot flash the rail; it lands once the fade has stayed stable.
            internals.syncPlayerChromeIdleState();
            await vi.advanceTimersByTimeAsync(400);
            expect(root.classList.contains('jpdb-subtitle-controls-away')).toBe(true);

            // Chrome re-appearing reveals the rail immediately (no debounce on show).
            document.querySelector('#movie_player')!.classList.remove('ytp-autohide');
            internals.syncPlayerChromeIdleState();
            expect(root.classList.contains('jpdb-subtitle-controls-away')).toBe(false);
        } finally {
            controller.destroy();
            document.body.innerHTML = '';
        }
    });

    it('keeps the collapsed rail available on portrait YouTube Shorts with persistent ytp-autohide', async () => {
        vi.useFakeTimers();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/shorts/short123') as unknown as Location,
        });
        document.body.innerHTML = `
            <ytd-shorts>
                <ytd-reel-video-renderer>
                    <div id="movie_player" class="html5-video-player ytp-autohide"><video class="html5-main-video"></video></div>
                </ytd-reel-video-renderer>
            </ytd-shorts>
        `;
        const { controller, settings } = createSubtitleController(makeSubtitleSettings({
            subtitleOverlayVisible: true,
            subtitleControlsMode: 'auto',
        }));
        controller.init();
        try {
            const movie = document.querySelector<HTMLElement>('#movie_player')!;
            const video = document.querySelector<HTMLVideoElement>('video')!;
            mockElementRect(movie, new DOMRect(40, 0, 390, 780));
            mockElementRect(video, new DOMRect(40, 0, 390, 780));
            attachVideo(controller, { video });
            const internals = controllerInternals<{
                hideControlsImmediately: () => void;
                syncPlayerChromeIdleState: () => void;
            }>(controller);
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const grip = root.querySelector<HTMLButtonElement>('[data-action="rail-expand"]')!;

            internals.hideControlsImmediately();
            internals.syncPlayerChromeIdleState();
            await vi.advanceTimersByTimeAsync(400);

            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-controls-away')).toBe(false);
            expect(grip.getAttribute('aria-expanded')).toBe('false');

            grip.click();
            expect(settings.subtitleControlsMode).toBe('always');
            expect(root.classList.contains('jpdb-subtitle-controls-always')).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-controls-away')).toBe(false);
            expect(grip.getAttribute('aria-expanded')).toBe('true');
        } finally {
            controller.destroy();
            document.body.innerHTML = '';
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
        }
    });

    it('returns subtitle hit testing to overlapping YouTube native controls only', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/shorts/short123') as unknown as Location,
        });
        document.body.innerHTML = `
            <ytd-shorts>
                <ytd-reel-video-renderer>
                    <div id="movie_player" class="html5-video-player">
                        <video class="html5-main-video"></video>
                        <button id="shorts-share" aria-label="Share">共有</button>
                        <button id="shorts-fullscreen" aria-label="Fullscreen">⛶</button>
                    </div>
                </ytd-reel-video-renderer>
            </ytd-shorts>
        `;
        const { controller } = createSubtitleController(makeSubtitleSettings({ subtitleOverlayVisible: true }));
        controller.init();
        try {
            const movie = document.querySelector<HTMLElement>('#movie_player')!;
            const video = document.querySelector<HTMLVideoElement>('video')!;
            mockElementRect(movie, new DOMRect(40, 0, 390, 780));
            mockElementRect(video, new DOMRect(40, 0, 390, 780));
            attachVideo(controller, { video });

            const primary = document.querySelector<HTMLElement>('.jpdb-subtitle-primary')
                ?? (() => {
                    const element = document.createElement('div');
                    element.className = 'jpdb-subtitle-primary';
                    document.querySelector('.jpdb-subtitle-lines')!.appendChild(element);
                    return element;
                })();
            primary.innerHTML = `
                <span id="share-word" class="jpdb-reader-word">共有</span>
                <span id="fullscreen-word" class="jpdb-reader-word">全画面</span>
                <span id="clear-word" class="jpdb-reader-word">字幕</span>
            `;
            // The native caption line is a control too, and on touch its box is
            // grown to finger size — an invisible strip of overlay that has to
            // stand down over the player's own controls exactly like a word.
            const nativeLine = document.createElement('button');
            nativeLine.className = 'jpdb-subtitle-secondary';
            nativeLine.dataset.action = 'toggle-native-blur';
            document.querySelector('.jpdb-subtitle-lines')!.appendChild(nativeLine);

            const share = document.querySelector<HTMLElement>('#shorts-share')!;
            const fullscreen = document.querySelector<HTMLElement>('#shorts-fullscreen')!;
            const shareWord = document.querySelector<HTMLElement>('#share-word')!;
            const fullscreenWord = document.querySelector<HTMLElement>('#fullscreen-word')!;
            const clearWord = document.querySelector<HTMLElement>('#clear-word')!;
            mockElementRect(share, new DOMRect(330, 610, 48, 48));
            mockElementRect(fullscreen, new DOMRect(330, 680, 48, 48));
            mockElementRect(shareWord, new DOMRect(320, 605, 72, 58));
            mockElementRect(fullscreenWord, new DOMRect(320, 675, 72, 58));
            mockElementRect(clearWord, new DOMRect(140, 605, 72, 58));
            // Its grown box reaches down onto the fullscreen button.
            mockElementRect(nativeLine, new DOMRect(120, 660, 240, 42));

            const internals = controllerInternals<{ syncNativePlayerControlHitProtection: () => void }>(controller);
            internals.syncNativePlayerControlHitProtection();

            expect(shareWord.dataset.jpdbSubtitleNativeControlSafeZone).toBe('true');
            expect(fullscreenWord.dataset.jpdbSubtitleNativeControlSafeZone).toBe('true');
            expect(clearWord.dataset.jpdbSubtitleNativeControlSafeZone).toBeUndefined();
            expect(nativeLine.dataset.jpdbSubtitleNativeControlSafeZone).toBe('true');
            expect(SUBTITLES_YOUTUBE_CSS).toContain(
                '.jpdb-subtitle-player [data-jpdb-subtitle-native-control-safe-zone="true"]',
            );
            expect(SUBTITLES_YOUTUBE_CSS).toMatch(/native-control-safe-zone="true"[^}]+pointer-events:\s*none\s*!important/s);

            mockElementRect(share, new DOMRect(500, 610, 48, 48));
            mockElementRect(fullscreen, new DOMRect(500, 680, 48, 48));
            internals.syncNativePlayerControlHitProtection();
            expect(shareWord.dataset.jpdbSubtitleNativeControlSafeZone).toBeUndefined();
            expect(fullscreenWord.dataset.jpdbSubtitleNativeControlSafeZone).toBeUndefined();
            expect(nativeLine.dataset.jpdbSubtitleNativeControlSafeZone).toBeUndefined();
        } finally {
            controller.destroy();
            document.body.innerHTML = '';
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
        }
    });

    it('returns subtitle hit testing to the detached mobile YouTube fullscreen control', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://m.youtube.com/watch?v=mobile123') as unknown as Location,
        });
        document.body.innerHTML = `
            <ytm-player>
                <video></video>
            </ytm-player>
            <div id="player-control-overlay" class="fadein">
                <button id="mobile-fullscreen" type="button" aria-label="Fullscreen">⛶</button>
            </div>
        `;
        const { controller } = createSubtitleController(makeSubtitleSettings({ subtitleOverlayVisible: true }));
        controller.init();
        try {
            const player = document.querySelector<HTMLElement>('ytm-player')!;
            const video = document.querySelector<HTMLVideoElement>('video')!;
            const fullscreen = document.querySelector<HTMLButtonElement>('#mobile-fullscreen')!;
            mockElementRect(player, new DOMRect(0, 0, 390, 220));
            mockElementRect(video, new DOMRect(0, 0, 390, 220));
            mockElementRect(fullscreen, new DOMRect(330, 154, 48, 48));
            attachVideo(controller, { video });

            const primary = document.createElement('div');
            primary.className = 'jpdb-subtitle-primary';
            primary.innerHTML = `
                <span id="fullscreen-word" class="jpdb-reader-word">新しいもの</span>
                <span id="clear-word" class="jpdb-reader-word">字幕</span>
            `;
            document.querySelector('.jpdb-subtitle-lines')!.appendChild(primary);
            const fullscreenWord = document.querySelector<HTMLElement>('#fullscreen-word')!;
            const clearWord = document.querySelector<HTMLElement>('#clear-word')!;
            // The visible glyphs finish above the icon, but the word's line box
            // reaches into YouTube's larger fullscreen tap target.
            mockElementRect(fullscreenWord, new DOMRect(292, 130, 82, 54));
            mockElementRect(clearWord, new DOMRect(120, 130, 64, 54));

            const internals = controllerInternals<{ syncNativePlayerControlHitProtection: () => void }>(controller);
            internals.syncNativePlayerControlHitProtection();

            expect(fullscreenWord.dataset.jpdbSubtitleNativeControlSafeZone).toBe('true');
            expect(clearWord.dataset.jpdbSubtitleNativeControlSafeZone).toBeUndefined();
        } finally {
            controller.destroy();
            document.body.innerHTML = '';
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
        }
    });

    it('does not strobe the rail away when the player chrome fade flickers (hover-autoplay)', async () => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="movie_player" class="html5-video-player" tabindex="-1"><video></video></div>';
        const { controller } = createSubtitleController(makeSubtitleSettings({ subtitleOverlayVisible: true }));
        controller.init();
        try {
            const video = document.querySelector<HTMLVideoElement>('video')!;
            mockElementRect(video, new DOMRect(0, 0, 640, 360));
            attachVideo(controller, { video });
            const player = document.querySelector('#movie_player')!;
            const internals = controllerInternals<{ syncPlayerChromeIdleState: () => void }>(controller);
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;

            // Chrome fade rapidly flips hidden/visible faster than the commit delay.
            for (let i = 0; i < 6; i += 1) {
                player.classList.add('ytp-autohide');
                internals.syncPlayerChromeIdleState();
                await vi.advanceTimersByTimeAsync(80);
                player.classList.remove('ytp-autohide');
                internals.syncPlayerChromeIdleState();
                await vi.advanceTimersByTimeAsync(80);
            }
            // The flicker settled on "visible" each time, so the debounced hide is
            // abandoned — the rail never committed to away and stayed steady.
            expect(root.classList.contains('jpdb-subtitle-controls-away')).toBe(false);
        } finally {
            controller.destroy();
            document.body.innerHTML = '';
        }
    });

    it('fully hides the rail on idle for a generic player with no chrome-fade signal', async () => {
        vi.useFakeTimers();
        const { controller } = createSubtitleController(makeSubtitleSettings({ subtitleOverlayVisible: true }));
        controller.init();
        try {
            const video = document.createElement('video');
            video.controls = true;
            document.body.appendChild(video);
            mockElementRect(video, new DOMRect(0, 0, 640, 360));
            attachVideo(controller, { video });
            const internals = controllerInternals<{ hideControlsImmediately: () => void }>(controller);
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;

            internals.hideControlsImmediately();
            // Minimised to the grip immediately...
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);
            // ...then disappears entirely once the debounced away commits, because
            // a generic <video> exposes no native chrome fade to keep the stub for.
            await vi.advanceTimersByTimeAsync(400);
            expect(root.classList.contains('jpdb-subtitle-controls-away')).toBe(true);
        } finally {
            controller.destroy();
            document.body.innerHTML = '';
        }
    });

    it('keeps a pinned rail fully visible regardless of pointer traffic or idle', async () => {
        vi.useFakeTimers();
        const { controller } = createSubtitleController(makeSubtitleSettings({
            subtitleOverlayVisible: true,
            subtitleControlsMode: 'always',
        }));
        controller.init();
        try {
            const video = document.createElement('video');
            video.controls = true;
            document.body.appendChild(video);
            mockElementRect(video, new DOMRect(0, 0, 640, 360));
            attachVideo(controller, { video });
            controller.refresh();
            const internals = controllerInternals<{
                hideControlsImmediately: () => void;
                syncPointerActivity: (x: number, y: number) => void;
            }>(controller);
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;

            expect(root.classList.contains('jpdb-subtitle-controls-always')).toBe(true);
            // Pointer far from the rail must not collapse a pinned rail.
            internals.syncPointerActivity(5000, 5000);
            internals.hideControlsImmediately();
            await vi.advanceTimersByTimeAsync(3000);
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-controls-away')).toBe(false);
        } finally {
            controller.destroy();
            document.body.innerHTML = '';
        }
    });

    // blurvy, v1.8.77: "the show native subtitles toggle isn't saving... it turns
    // itself back on". Two causes, both here: the rail eye declared no intent
    // (its keyboard twin always did), so the recorded pin replaced the fresh
    // false before storage; and the *Chosen guard on the reveal applied only to
    // AUTOMATIC track picks, so a track selection switched the overlay back on.
    it('keeps a rail-toggled overlay off through storage and every later track reveal', async () => {
        const store = new Map<string, unknown>();
        const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
        vi.stubGlobal('GM_getValue', vi.fn(async (key: string, fallback: unknown) =>
            clone(store.has(key) ? store.get(key) : fallback)));
        vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
            store.set(key, clone(value));
        }));
        const { controller, settings } = createInstalledSubtitleController(
            { subtitleOverlayVisible: true, subtitleOverlayVisibleChosen: false },
            {
                onSettingsChange: (explicitUserChoiceKeys, clearExplicitUserChoiceKeys) => {
                    void saveSettings(settings, { explicitUserChoiceKeys, clearExplicitUserChoiceKeys });
                },
            },
        );
        try {
            const eye = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="visibility"]')!;
            eye.click();
            expect(settings.subtitleOverlayVisible).toBe(false);
            expect(settings.subtitleOverlayVisibleChosen).toBe(true);

            // A stale context saves the whole settings object it read before the
            // click. Nothing it carries may resurrect the overlay.
            await vi.waitFor(() => expect(store.get('yomu:settings-intent:v2')).toBeTruthy());
            await saveSettings({ ...settings, subtitleOverlayVisible: true, subtitleOverlayVisibleChosen: false }, {
                explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE,
            });
            expect((await loadSettings()).subtitleOverlayVisible).toBe(false);

            // Selecting a track reveals the overlay only for a learner who has
            // not decided; auto or not, this one has.
            const internals = controllerInternals<{
                revealPrimarySubtitleOverlay(): void;
                revealSecondarySubtitleOverlay(): void;
            }>(controller);
            internals.revealPrimarySubtitleOverlay();
            expect(settings.subtitleOverlayVisible).toBe(false);

            settings.subtitleSecondaryVisible = false;
            settings.subtitleSecondaryVisibleChosen = true;
            internals.revealSecondarySubtitleOverlay();
            expect(settings.subtitleSecondaryVisible).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('moves the Yomu subtitle overlay by updating the shared bottom-offset setting', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const onSettingsChange = vi.fn();
        const { controller, settings } = createInstalledSubtitleController(
            { subtitleOverlayVisible: true, subtitleBottomOffset: 16 },
            { onSettingsChange },
        );
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            const internals = controllerInternals<{
                clearTransientSubtitleState(): void;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            const handle = document.querySelector<HTMLButtonElement>('[data-subtitle-drag-handle]')!;
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));

            handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 7 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 260, pointerId: 7 }));

            expect(settings.subtitleBottomOffset).toBe(16);
            expect(onSettingsChange).not.toHaveBeenCalled();
            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('16%');
            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('-40px');
            expect(root.classList.contains('jpdb-subtitle-dragging')).toBe(true);

            window.dispatchEvent(pointerEvent('pointerup', { clientY: 260, pointerId: 7 }));
            expect(root.classList.contains('jpdb-subtitle-dragging')).toBe(false);
            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('27%');
            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
            expect(onSettingsChange).toHaveBeenCalledTimes(1);

            internals.clearTransientSubtitleState();
            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('27%');
            expect(settings.subtitleBottomOffset).toBe(27);
        } finally {
            controller.destroy();
        }
    });

    it('keeps the drag handle available when only the native subtitle line is visible', () => {
        const nativeCue = { start: 0, end: 2, text: 'I will read today.', transcriptEligible: true };
        const onSettingsChange = vi.fn();
        const { controller, settings } = createInstalledSubtitleController(
            {
                subtitleOverlayVisible: true,
                subtitleSecondaryVisible: true,
                subtitleBottomOffset: 16,
            },
            { onSettingsChange },
        );
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            const internals = controllerInternals<{
                currentCue: undefined;
                secondaryCue: typeof nativeCue;
                render(): void;
                syncControls(): void;
            }>(controller);
            internals.currentCue = undefined;
            internals.secondaryCue = nativeCue;
            internals.render();
            internals.syncControls();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            const handle = document.querySelector<HTMLButtonElement>('[data-subtitle-drag-handle]')!;
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 48));

            expect(root.querySelector('.jpdb-subtitle-primary')).toBeNull();
            expect(root.querySelector('.jpdb-subtitle-secondary')?.textContent).toContain(nativeCue.text);
            expect(root.classList.contains('jpdb-subtitle-has-lines')).toBe(true);

            handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 17 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 260, pointerId: 17 }));
            window.dispatchEvent(pointerEvent('pointerup', { clientY: 260, pointerId: 17 }));

            expect(settings.subtitleBottomOffset).toBe(27);
            expect(onSettingsChange).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('lets a drag use visible space below a short video without leaving the viewport', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller, settings } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleBottomOffset: 16 });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            const internals = controllerInternals<{ cues: Array<typeof cue>; currentCue: typeof cue }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            const handle = document.querySelector<HTMLButtonElement>('[data-subtitle-drag-handle]')!;
            // Video frame fills only the top 360px of a 768px-tall viewport:
            // the space below the frame remains draggable-into territory.
            mockElementRect(root, new DOMRect(0, 0, 640, 360));
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));

            handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 100, pointerId: 9 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 500, pointerId: 9 }));
            window.dispatchEvent(pointerEvent('pointerup', { clientY: 500, pointerId: 9 }));

            expect(settings.subtitleBottomOffset).toBe(-95);

            handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 100, pointerId: 10 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 1500, pointerId: 10 }));
            window.dispatchEvent(pointerEvent('pointerup', { clientY: 1500, pointerId: 10 }));

            // A wild drag clamps at the viewport bottom instead of vanishing.
            expect(settings.subtitleBottomOffset).toBe(-110);
        } finally {
            controller.destroy();
        }
    });

    it('keeps a saved below-player position reachable when the next media frame fills the viewport', () => {
        withViewport(390, 820, () => {
            const { controller, settings } = createInstalledSubtitleController({
                subtitleOverlayVisible: true,
                subtitleBottomOffset: -110,
            });
            try {
                const video = attachVideo(controller, { rect: new DOMRect(0, 0, 390, 360) });
                const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                const subtitleFrame = root.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
                const internals = controllerInternals<{ applyEffectiveSubtitleBottom(): void }>(controller);

                mockElementRect(root, new DOMRect(0, 0, 390, 360));
                mockElementRect(video, new DOMRect(0, 0, 390, 360));
                mockElementRect(subtitleFrame, new DOMRect(8, 684, 374, 72));
                internals.applyEffectiveSubtitleBottom();
                expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('-110%');

                // Signed-in mobile Shorts geometry: the player/root owns its
                // chrome, while the actual video occupies the inner frame.
                mockElementRect(root, new DOMRect(0, 64, 390, 756));
                mockElementRect(video, new DOMRect(0, 139, 390, 606));
                mockElementRect(subtitleFrame, new DOMRect(8, 1200, 374, 72));
                internals.applyEffectiveSubtitleBottom();
                expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('2%');

                // The effective correction is viewport-dependent: returning
                // to shorter media restores the deliberate saved preference.
                mockElementRect(root, new DOMRect(0, 0, 390, 360));
                mockElementRect(video, new DOMRect(0, 0, 390, 360));
                mockElementRect(subtitleFrame, new DOMRect(8, 684, 374, 72));
                internals.applyEffectiveSubtitleBottom();
                expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('-110%');
                expect(settings.subtitleBottomOffset).toBe(-110);
            } finally {
                controller.destroy();
            }
        });
    });

    it('uses the positioned overlay root when the recycled video rect remains offscreen', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/shorts/short123') as unknown as Location,
        });
        withViewport(390, 820, () => {
            document.body.innerHTML = `
                <ytd-shorts>
                    <ytd-reel-video-renderer>
                        <div id="movie_player" class="html5-video-player"><video></video></div>
                    </ytd-reel-video-renderer>
                </ytd-shorts>
            `;
            const { controller, settings } = createInstalledSubtitleController({
                subtitleOverlayVisible: true,
                subtitleBottomOffset: -110,
            });
            try {
                const video = document.querySelector<HTMLVideoElement>('video')!;
                const player = document.querySelector<HTMLElement>('#movie_player')!;
                attachVideo(controller, { video });
                const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                const subtitleFrame = root.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
                mockElementRect(player, new DOMRect(0, 64, 390, 756));
                mockElementRect(root, new DOMRect(0, 64, 390, 756));
                mockElementRect(video, new DOMRect(0, 980, 390, 606));
                mockElementRect(subtitleFrame, new DOMRect(8, 1200, 374, 72));

                controllerInternals<{ applyEffectiveSubtitleBottom(): void }>(controller)
                    .applyEffectiveSubtitleBottom();

                expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('2%');
                expect(settings.subtitleBottomOffset).toBe(-110);
            } finally {
                controller.destroy();
                Object.defineProperty(window, 'location', {
                    configurable: true,
                    value: originalLocation,
                });
            }
        });
    });

    it('starts a recovery drag from the reachable position instead of the hidden saved value', () => {
        withViewport(390, 780, () => {
            const { controller, settings } = createInstalledSubtitleController({
                subtitleOverlayVisible: true,
                subtitleBottomOffset: -110,
            });
            try {
                attachVideo(controller, { rect: new DOMRect(0, 0, 390, 780) });
                const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                const subtitleFrame = root.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
                const handle = root.querySelector<HTMLButtonElement>('[data-subtitle-drag-handle]')!;
                mockElementRect(root, new DOMRect(0, 0, 390, 780));
                mockElementRect(subtitleFrame, new DOMRect(8, 696, 374, 72));
                controllerInternals<{ applyEffectiveSubtitleBottom(): void }>(controller).applyEffectiveSubtitleBottom();

                handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 700, pointerId: 41, pointerType: 'touch' }));
                window.dispatchEvent(pointerEvent('pointermove', { clientY: 622, pointerId: 41, pointerType: 'touch' }));
                window.dispatchEvent(pointerEvent('pointerup', { clientY: 622, pointerId: 41, pointerType: 'touch' }));

                expect(settings.subtitleBottomOffset).toBe(12);
                expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('12%');
                expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
            } finally {
                controller.destroy();
            }
        });
    });

    it('keeps drag-updated subtitle position in sync with compact style controls', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleBottomOffset: 16 });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            const internals = controllerInternals<{ cues: Array<typeof cue>; currentCue: typeof cue }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            const handle = document.querySelector<HTMLButtonElement>('[data-subtitle-drag-handle]')!;
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));
            handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 9 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 260, pointerId: 9 }));
            window.dispatchEvent(pointerEvent('pointerup', { clientY: 260, pointerId: 9 }));

            // The drag is the only bottom-offset control now; it lands in the
            // persisted setting and the rendered CSS variable directly.
            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('27%');
        } finally {
            controller.destroy();
        }
    });

    it('coalesces native subtitle drag work and saves the bottom offset only when released', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const onSettingsChange = vi.fn();
        const { controller, settings } = createInstalledSubtitleController(
            { subtitleOverlayVisible: true, subtitleBottomOffset: 16 },
            { onSettingsChange },
        );
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            const internals = controllerInternals<{ cues: Array<typeof cue>; currentCue: typeof cue }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            const handle = document.querySelector<HTMLButtonElement>('[data-subtitle-drag-handle]')!;
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));
            const querySpy = vi.spyOn(document, 'querySelectorAll');
            try {
                querySpy.mockClear();

                handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 17 }));
                for (const clientY of [260, 252, 244, 240]) {
                    window.dispatchEvent(pointerEvent('pointermove', { clientY, pointerId: 17 }));
                }

                expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('-40px');
                expect(settings.subtitleBottomOffset).toBe(16);
                expect(onSettingsChange).not.toHaveBeenCalled();
                expect(querySpy).not.toHaveBeenCalled();

                window.dispatchEvent(pointerEvent('pointerup', { clientY: 240, pointerId: 17 }));
                expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
                expect(settings.subtitleBottomOffset).toBe(33);
                expect(onSettingsChange).toHaveBeenCalledTimes(1);
            } finally {
                querySpy.mockRestore();
            }
        } finally {
            controller.destroy();
        }
    });

    it('snaps the subtitle overlay back to the baseline when the position is reset', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller, settings } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleBottomOffset: 16 });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            const internals = controllerInternals<{
                clearTransientSubtitleState(): void;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            const handle = document.querySelector<HTMLButtonElement>('[data-subtitle-drag-handle]')!;
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));

            handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 8 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 260, pointerId: 8 }));
            window.dispatchEvent(pointerEvent('pointerup', { clientY: 260, pointerId: 8 }));
            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('27%');
            expect(settings.subtitleBottomOffset).toBe(27);

            handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('16%');
            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
            expect(settings.subtitleBottomOffset).toBe(16);

            internals.clearTransientSubtitleState();
            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('16%');
            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
        } finally {
            controller.destroy();
        }

        // The reset is durable: a freshly installed overlay starts at the baseline,
        // proving the reset wrote fraction 0 to storage rather than only clearing
        // the in-memory field.
        const next = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('16%');
            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
        } finally {
            next.controller.destroy();
        }
    });

    it('stores Yomu subtitle position as a bottom offset instead of a hidden viewport nudge', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        let draggedBottomOffset = 16;
        withViewport(1280, 360, () => {
            const { controller, settings } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleBottomOffset: 16 });
            try {
                attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
                const internals = controllerInternals<{ cues: Array<typeof cue>; currentCue: typeof cue }>(controller);
                internals.cues = [cue];
                internals.currentCue = cue;
                controller.refresh();

                const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
                const handle = document.querySelector<HTMLButtonElement>('[data-subtitle-drag-handle]')!;
                mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));
                handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 12 }));
                window.dispatchEvent(pointerEvent('pointermove', { clientY: 210, pointerId: 12 }));
                window.dispatchEvent(pointerEvent('pointerup', { clientY: 210, pointerId: 12 }));
                const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                draggedBottomOffset = settings.subtitleBottomOffset;
                expect(draggedBottomOffset).toBe(40);
                expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('40%');
                expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
            } finally {
                controller.destroy();
            }
        });

        withViewport(1280, 1080, () => {
            const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleBottomOffset: draggedBottomOffset });
            try {
                const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('40%');
                expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
            } finally {
                controller.destroy();
            }
        });
    });

    it('keyboard nudging updates the same subtitle bottom offset setting', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller, settings } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleBottomOffset: 16 });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            const internals = controllerInternals<{ cues: Array<typeof cue>; currentCue: typeof cue }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            const handle = document.querySelector<HTMLButtonElement>('[data-subtitle-drag-handle]')!;
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));
            expect(handle.getAttribute('aria-label')).toContain('arrow');
            expect(handle.getAttribute('aria-keyshortcuts')).toBe('ArrowUp ArrowDown PageUp PageDown Home 0');
            handle.focus();
            expect(document.activeElement).toBe(handle);
            handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }));

            expect(settings.subtitleBottomOffset).toBe(23);
            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('23%');
            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
        } finally {
            controller.destroy();
        }
    });

    it('does not move subtitle overlay from ordinary subtitle text pointer activity', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            const internals = controllerInternals<{
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));

            subtitleFrame.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 3 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 260, pointerId: 3 }));
            window.dispatchEvent(pointerEvent('pointerup', { clientY: 260, pointerId: 3 }));

            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
            expect(root.classList.contains('jpdb-subtitle-dragging')).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('temporarily moves subtitle overlay from mouse drag when pointer events are not delivered', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const onSettingsChange = vi.fn();
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true }, { onSettingsChange });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            const internals = controllerInternals<{
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            const handle = document.querySelector<HTMLButtonElement>('[data-subtitle-drag-handle]')!;
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));

            handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: 300 }));
            window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientY: 260 }));

            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('16%');
            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('-40px');
            expect(onSettingsChange).not.toHaveBeenCalled();
            expect(root.classList.contains('jpdb-subtitle-dragging')).toBe(true);

            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientY: 260 }));
            expect(root.classList.contains('jpdb-subtitle-dragging')).toBe(false);
            expect(root.style.getPropertyValue('--subtitle-bottom')).toBe('27%');
            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
            expect(onSettingsChange).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('temporarily moves ASBPlayer subtitle overlays only from the inserted move handle', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            document.body.insertAdjacentHTML('beforeend', `
                <div class="asbplayer-subtitles-container-bottom" style="transform: translateX(-50%)">
                    <span class="jpdb-reader-word">今日は読む。</span>
                </div>
            `);
            const internals = controllerInternals<{ clearTransientSubtitleState(): void }>(controller);
            const asbRoot = document.querySelector<HTMLElement>('.asbplayer-subtitles-container-bottom')!;
            mockElementRect(asbRoot, new DOMRect(80, 260, 480, 64));

            controller.refresh();

            const handle = asbRoot.querySelector<HTMLButtonElement>('[data-yomu-asb-subtitle-drag-handle="true"]')!;
            expect(handle).not.toBeNull();
            expect(asbRoot.classList.contains('jpdb-subtitle-asb-movable')).toBe(true);
            expect(asbRoot.style.getPropertyValue('--jpdb-subtitle-asb-base-transform')).not.toBe('');

            handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 11 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 260, pointerId: 11 }));

            expect(asbRoot.style.getPropertyValue('--jpdb-subtitle-asb-drag-offset-y')).toBe('-40px');
            expect(asbRoot.classList.contains('jpdb-subtitle-dragging')).toBe(true);

            window.dispatchEvent(pointerEvent('pointerup', { clientY: 260, pointerId: 11 }));
            expect(asbRoot.classList.contains('jpdb-subtitle-dragging')).toBe(false);

            // The remembered nudge survives a video change here too.
            internals.clearTransientSubtitleState();
            expect(asbRoot.style.getPropertyValue('--jpdb-subtitle-asb-drag-offset-y')).toBe('-40px');
        } finally {
            controller.destroy();
        }
    });

    it('skips the document-wide drag-handle scan each tick when no asbplayer overlay exists', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            const internals = controllerInternals<{ syncAsbPlayerSubtitleMoveHandles: () => void }>(controller);
            const querySpy = vi.spyOn(document, 'querySelectorAll');

            // No .asbplayer-subtitles-container-bottom in the DOM: the per-tick
            // sync must do at most the single roots probe, never the extra
            // document-wide handle-cleanup scan (regression v0.6.176 ran both
            // every ~250ms on every video on every site).
            internals.syncAsbPlayerSubtitleMoveHandles();

            const handleScans = querySpy.mock.calls
                .filter(call => String(call[0]).includes('yomu-asb-subtitle-drag-handle'));
            expect(handleScans).toHaveLength(0);
            querySpy.mockRestore();
        } finally {
            controller.destroy();
        }
    });

    it('does not move ASBPlayer subtitle overlays from ordinary subtitle text pointer activity', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            document.body.insertAdjacentHTML('beforeend', `
                <div class="asbplayer-subtitles-container-bottom">
                    <span>今日は読む。</span>
                </div>
            `);
            const asbRoot = document.querySelector<HTMLElement>('.asbplayer-subtitles-container-bottom')!;
            const asbText = asbRoot.querySelector<HTMLElement>('span')!;
            mockElementRect(asbRoot, new DOMRect(80, 260, 480, 64));

            controller.refresh();
            asbText.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 12 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 260, pointerId: 12 }));
            window.dispatchEvent(pointerEvent('pointerup', { clientY: 260, pointerId: 12 }));

            expect(asbRoot.style.getPropertyValue('--jpdb-subtitle-asb-drag-offset-y')).toBe('0px');
            expect(asbRoot.classList.contains('jpdb-subtitle-dragging')).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('keeps subtitle controls idle when YouTube player chrome is autohidden', () => {
        let controller: SubtitlePlayerController | undefined;
        try {
            document.body.innerHTML = '<div id="movie_player" class="html5-video-player ytp-autohide"><video></video></div>';
            controller = createInstalledSubtitleController().controller;
            const player = document.querySelector<HTMLElement>('#movie_player')!;
            const video = document.querySelector<HTMLVideoElement>('video')!;
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 640, 360) });
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            handlePointerActivity(controller);

            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            player.classList.remove('ytp-autohide');
            handlePointerActivity(controller);

            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);
        } finally {
            controller?.destroy();
        }
    });

    it.each(['auto', 'always'] as const)('keeps focused %s rail controls outside YouTube simulated-fullscreen ancestry', async controlsMode => {
        vi.useFakeTimers();
        let controller: SubtitlePlayerController | undefined;
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=focus123') as unknown as Location,
        });
        try {
            document.body.innerHTML = '<div id="movie_player" class="html5-video-player ytp-fullscreen"><video></video></div>';
            controller = createSubtitleController(makeSubtitleSettings({ subtitleControlsMode: controlsMode })).controller;
            controller.init();
            const player = document.querySelector<HTMLElement>('#movie_player')!;
            const video = player.querySelector<HTMLVideoElement>('video')!;
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 1024, 576) });
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const railHandle = root.querySelector<HTMLButtonElement>('[data-action="rail-expand"]')!;
            const fullscreenState = controllerInternals<{ syncFullscreenState: () => void }>(controller);
            fullscreenState.syncFullscreenState();

            // A CSS fullscreen class changes geometry, not browser top-layer
            // ancestry. Keeping the reader root at body means YouTube never
            // sees Yomu's focused control as focus inside its player subtree.
            expect(root.parentElement).toBe(document.body);
            expect(player.contains(root)).toBe(false);

            railHandle.dispatchEvent(pointerEvent('pointerdown', {
                clientX: 24,
                clientY: 24,
                pointerId: 41,
                pointerType: 'touch',
            }));
            railHandle.focus();

            expect(document.activeElement).toBe(railHandle);
            const focusState = controllerInternals<{ subtitleStylePanelOpen: boolean }>(controller);
            expect(focusState.subtitleStylePanelOpen).toBe(false);
            expect(player.classList.contains('ytp-autohide')).toBe(false);

            railHandle.dispatchEvent(pointerEvent('pointerup', {
                clientX: 24,
                clientY: 24,
                pointerId: 41,
                pointerType: 'touch',
            }));

            await vi.advanceTimersByTimeAsync(2600);

            expect(document.activeElement).toBe(railHandle);
            expect(player.contains(document.activeElement)).toBe(false);
            expect(player.classList.contains('ytp-autohide')).toBe(false);
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
            controller?.destroy();
            vi.useRealTimers();
        }
    });

    it('preserves programmatic rail focus without explicit pointer provenance', async () => {
        vi.useFakeTimers();
        let controller: SubtitlePlayerController | undefined;
        try {
            document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><video></video></div>';
            controller = createSubtitleController(makeSubtitleSettings({ subtitleControlsMode: 'auto' })).controller;
            controller.init();
            const video = document.querySelector<HTMLVideoElement>('video')!;
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 1024, 576) });
            controller.refresh();

            const railHandle = document.querySelector<HTMLButtonElement>('[data-action="rail-expand"]')!;
            railHandle.focus();

            expect(document.activeElement).toBe(railHandle);

            await vi.advanceTimersByTimeAsync(2600);

            expect(document.activeElement).toBe(railHandle);
        } finally {
            controller?.destroy();
            vi.useRealTimers();
        }
    });

    it('does not discard focus inside an open style panel', async () => {
        vi.useFakeTimers();
        let controller: SubtitlePlayerController | undefined;
        try {
            document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><video></video></div>';
            controller = createSubtitleController(makeSubtitleSettings({ subtitleControlsMode: 'auto' })).controller;
            controller.init();
            const video = document.querySelector<HTMLVideoElement>('video')!;
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 1024, 576) });
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            root.querySelector<HTMLButtonElement>('[data-action="style"]')!.click();
            const range = root.querySelector<HTMLInputElement>('[data-subtitle-style-setting="subtitleFontSize"]')!;
            const labelText = range.closest('label')!.querySelector<HTMLElement>('span')!;
            const focusState = controllerInternals<{
                controlsIdleTimer?: number;
                subtitleStylePanelOpen: boolean;
            }>(controller);
            labelText.dispatchEvent(pointerEvent('pointerdown', {
                clientX: 24,
                clientY: 24,
                pointerId: 42,
                pointerType: 'touch',
            }));
            range.focus();
            labelText.dispatchEvent(pointerEvent('pointerup', {
                clientX: 24,
                clientY: 24,
                pointerId: 42,
                pointerType: 'touch',
            }));
            labelText.click();

            expect(focusState.subtitleStylePanelOpen).toBe(true);
            expect(document.activeElement).toBe(range);
            expect(focusState.controlsIdleTimer).toBeDefined();

            await vi.advanceTimersByTimeAsync(2600);

            expect(document.activeElement).toBe(range);
            expect(focusState.subtitleStylePanelOpen).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-style-open')).toBe(true);
        } finally {
            controller?.destroy();
            vi.useRealTimers();
        }
    });

    it('preserves a style control when keyboard input follows its pointer focus', async () => {
        vi.useFakeTimers();
        let controller: SubtitlePlayerController | undefined;
        try {
            document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><video></video></div>';
            controller = createSubtitleController(makeSubtitleSettings({ subtitleControlsMode: 'auto' })).controller;
            controller.init();
            const video = document.querySelector<HTMLVideoElement>('video')!;
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 1024, 576) });
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            root.querySelector<HTMLButtonElement>('[data-action="style"]')!.click();
            const range = root.querySelector<HTMLInputElement>('[data-subtitle-style-setting="subtitleFontSize"]')!;
            range.dispatchEvent(pointerEvent('pointerdown', {
                pointerId: 44,
                pointerType: 'touch',
            }));
            range.focus();
            range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            range.dispatchEvent(pointerEvent('pointerup', {
                pointerId: 44,
                pointerType: 'touch',
            }));

            await vi.advanceTimersByTimeAsync(2600);

            expect(document.activeElement).toBe(range);
        } finally {
            controller?.destroy();
            vi.useRealTimers();
        }
    });

    it('keeps the mobile rail in lockstep while preserving deliberate keyboard focus', async () => {
        vi.useFakeTimers();
        let controller: SubtitlePlayerController | undefined;
        // #player-control-overlay is m.youtube chrome; the controller only
        // probes for it there (the per-tick query burned cycles elsewhere).
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://m.youtube.com/watch?v=abc123') as unknown as Location,
        });
        try {
            document.body.innerHTML = '<div id="player-control-overlay" class="fadein" tabindex="-1"><video></video></div>';
            controller = createSubtitleController(makeSubtitleSettings()).controller;
            controller.init();
            const overlay = document.querySelector<HTMLElement>('#player-control-overlay')!;
            const video = document.querySelector<HTMLVideoElement>('video')!;
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 390, 220) });
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const internals = controllerInternals<{ syncPlayerChromeIdleState: () => void }>(controller);

            // A mobile tap may leave the rail button focused. The root remains
            // outside the player, so native chrome idling must not discard that
            // valid focus just to work around YouTube ancestry.
            const railButton = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="visibility"]')!;
            railButton.dispatchEvent(pointerEvent('pointerdown', {
                clientX: 24,
                clientY: 24,
                pointerId: 43,
                pointerType: 'touch',
            }));
            railButton.focus();
            railButton.dispatchEvent(pointerEvent('pointerup', {
                clientX: 24,
                clientY: 24,
                pointerId: 43,
                pointerType: 'touch',
            }));

            overlay.classList.remove('fadein');
            internals.syncPlayerChromeIdleState();
            expect(document.activeElement).toBe(railButton);
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            // Chrome fades back in (viewer tapped the video): the rail returns
            // alongside the player's own controls.
            overlay.classList.add('fadein');
            internals.syncPlayerChromeIdleState();
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);

            // A hardware-keyboard user on the same touch device must not lose
            // focus merely because YouTube fades its own chrome.
            railButton.focus();
            railButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
            overlay.classList.remove('fadein');
            internals.syncPlayerChromeIdleState();
            expect(document.activeElement).toBe(railButton);

            overlay.focus();
            await vi.advanceTimersByTimeAsync(2600);
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
            controller?.destroy();
            vi.useRealTimers();
        }
    });

    it('lets video rail controls auto-hide while the transcript panel is open', async () => {
        vi.useFakeTimers();
        const { controller, root } = setupInstalledVideoController(new DOMRect(0, 72, 960, 540));

        try {
            const internals = controllerInternals<{
                cues: Array<{ start: number; end: number; text: string; transcriptEligible: boolean }>;
                openLinesPanel: () => void;
            }>(controller);
            internals.cues = [
                { start: 0, end: 1, text: '一番', transcriptEligible: true },
                { start: 1, end: 2, text: '二番', transcriptEligible: true },
            ];

            internals.openLinesPanel();

            expect(document.querySelector<HTMLElement>('.jpdb-subtitle-list')?.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-panel-open')).toBe(true);

            await expectSubtitleControlsReturnToIdle(controller, root);
        } finally {
            controller.destroy();
        }
    });

    it('selects the most visible video in scroll feeds instead of an offscreen earlier video', () => {
        withViewport(1000, 800, () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
            };
            document.body.innerHTML = '<video id="old-short"></video><video id="current-short"></video>';
            const oldShort = document.querySelector<HTMLVideoElement>('#old-short')!;
            const currentShort = document.querySelector<HTMLVideoElement>('#current-short')!;
            for (const video of [oldShort, currentShort]) {
                Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
            }
            mockElementRect(oldShort, new DOMRect(200, -700, 600, 600));
            mockElementRect(currentShort, new DOMRect(200, 80, 600, 600));
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange: () => undefined,
            });

            try {
                const candidate = (controller as unknown as { discoverVideoCandidate: () => HTMLVideoElement | undefined }).discoverVideoCandidate();

                expect(candidate).toBe(currentShort);
            } finally {
                controller.destroy();
            }
        });
    });

    it('skips ignored decorative videos during subtitle discovery', () => {
        withViewport(1000, 800, () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
            };
            document.body.innerHTML = `
                <video id="phone-demo" data-jpdb-reader-surface-ignore="true"></video>
                <div data-yomu-video-frame><video id="captioned-player" controls></video></div>
            `;
            const phoneDemo = document.querySelector<HTMLVideoElement>('#phone-demo')!;
            const captionedPlayer = document.querySelector<HTMLVideoElement>('#captioned-player')!;
            for (const video of [phoneDemo, captionedPlayer]) {
                Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
            }
            mockElementRect(phoneDemo, new DOMRect(120, 40, 720, 680));
            mockElementRect(captionedPlayer, new DOMRect(300, 180, 420, 260));
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange: () => undefined,
            });

            try {
                const candidate = (controller as unknown as { discoverVideoCandidate: () => HTMLVideoElement | undefined }).discoverVideoCandidate();

                expect(candidate).toBe(captionedPlayer);
            } finally {
                controller.destroy();
            }
        });
    });

    it('hides the rail and subtitles while the selected video is mostly out of view', () => {
        withViewport(1000, 800, () => {
            const { controller, root, video } = setupInstalledVideoController(
                new DOMRect(140, -520, 720, 600),
                { subtitleOverlayVisible: true },
            );
            const internals = controllerInternals<{ alignToVideo: () => void }>(controller);

            try {
                internals.alignToVideo();

                expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(true);

                mockElementRect(video, new DOMRect(140, -360, 720, 600));
                internals.alignToVideo();

                expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(true);

                mockElementRect(video, new DOMRect(140, 80, 720, 600));
                internals.alignToVideo();

                expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });
});
