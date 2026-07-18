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
    pointerEvent,
    expectSubtitleControlsReturnToIdle,
    withViewport,
    SubtitlePlayerController,
} from './fixtures';

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
        document.body.innerHTML = '<div id="movie_player" class="html5-video-player ytp-autohide" tabindex="-1"><video></video></div><a id="subtitle-underlay" href="#unexpected">Under subtitle</a>';
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller } = createSubtitleController(makeSubtitleSettings({ subtitleOverlayVisible: true }));
        controller.init();

        try {
            const video = document.querySelector<HTMLVideoElement>('video')!;
            mockElementRect(video, new DOMRect(0, 0, 640, 360));
            mockElementRect(document.querySelector<HTMLElement>('#movie_player')!, new DOMRect(0, 0, 640, 360));
            attachVideo(controller, { video });
            const internals = controllerInternals<{
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                alignToVideo: () => void;
                hideControlsImmediately: () => void;
                syncPlayerChromeIdleState: () => void;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();
            internals.alignToVideo();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = root.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            root.classList.add('jpdb-subtitle-has-lines');

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

    it('returns subtitle word hit testing to overlapping YouTube native controls only', () => {
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

            const internals = controllerInternals<{ syncNativePlayerControlHitProtection: () => void }>(controller);
            internals.syncNativePlayerControlHitProtection();

            expect(shareWord.dataset.jpdbSubtitleNativeControlSafeZone).toBe('true');
            expect(fullscreenWord.dataset.jpdbSubtitleNativeControlSafeZone).toBe('true');
            expect(clearWord.dataset.jpdbSubtitleNativeControlSafeZone).toBeUndefined();
            expect(SUBTITLES_YOUTUBE_CSS).toContain(
                '.jpdb-subtitle-player .jpdb-reader-word[data-jpdb-subtitle-native-control-safe-zone="true"]',
            );
            expect(SUBTITLES_YOUTUBE_CSS).toMatch(/native-control-safe-zone="true"[^}]+pointer-events:\s*none\s*!important/s);

            mockElementRect(share, new DOMRect(500, 610, 48, 48));
            mockElementRect(fullscreen, new DOMRect(500, 680, 48, 48));
            internals.syncNativePlayerControlHitProtection();
            expect(shareWord.dataset.jpdbSubtitleNativeControlSafeZone).toBeUndefined();
            expect(fullscreenWord.dataset.jpdbSubtitleNativeControlSafeZone).toBeUndefined();
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

    it('lets a drag push the subtitle below the video frame while keeping it on screen', () => {
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
            // the space below the frame is draggable-into territory.
            mockElementRect(root, new DOMRect(0, 0, 640, 360));
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));

            handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 100, pointerId: 9 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 500, pointerId: 9 }));
            window.dispatchEvent(pointerEvent('pointerup', { clientY: 500, pointerId: 9 }));

            // 400px down over a 360px frame ≈ -95%: well below the old hard
            // floor of 2%, but still above the on-screen minimum (≈ -110%).
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

            // A mobile tap leaves the rail button focused; without the blur
            // the sticky :focus-within would block idling forever. Use the
            // always-present visibility toggle — prev/next hide without lines.
            const railButton = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="visibility"]')!;
            railButton.focus();

            overlay.classList.remove('fadein');
            internals.syncPlayerChromeIdleState();
            expect(document.activeElement).not.toBe(railButton);
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
