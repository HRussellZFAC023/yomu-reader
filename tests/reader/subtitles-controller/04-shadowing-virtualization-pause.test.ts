import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_SETTINGS,
    registerSubtitleControllerCleanup,
    mockElementRect,
    controllerInternals,
    createInstalledSubtitleController,
    attachVideo,
    setupTranscriptCueController,
    setSingleJapaneseSubtitleTrack,
    subtitlePanelToggleElements,
    expectJapaneseTracksPanelOpen,
    expectSubtitlePanelActionsAbsent,
    pointerEvent,
    makeSubtitleToken,
    OPEN_SUBTITLE_TRACKS_EVENT,
    subtitleCueSignature,
    withViewport,
    SubtitlePlayerController,
} from './fixtures';

describe('SubtitlePlayerController — shadowing, transcript virtualization & pause panel', () => {
    registerSubtitleControllerCleanup();

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('changes transcript docking from the drawer panel-options menu', () => {
        withViewport(1600, 900, () => {
            const onSettingsChange = vi.fn();
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                subtitleTranscriptVisible: false,
                subtitleTranscriptPlacement: 'right' as const,
            };
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange,
            });

            try {
                const video = document.createElement('video');
                document.body.appendChild(video);
                mockElementRect(video, new DOMRect(80, 80, 1040, 585));
                const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                const internals = controller as unknown as {
                    install: () => void;
                    video: HTMLVideoElement;
                    cues: Array<typeof cue>;
                    currentCue: typeof cue;
                    openLinesPanel: () => void;
                    openTracksPanel: () => void;
                };
                internals.install();
                internals.video = video;
                internals.cues = [cue];
                internals.currentCue = cue;

                internals.openLinesPanel();

                let panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                const menu = panel.querySelector<HTMLElement>('.jpdb-subtitle-panel-options-menu')!;
                expect(menu.hidden).toBe(true);
                expect(panel.querySelectorAll('[data-action="transcript-placement"][data-placement]')).toHaveLength(3);
                expect(panel.querySelector('[data-action="close-panel"]')).not.toBeNull();

                panel.querySelector<HTMLButtonElement>('[data-action="panel-options"]')!.click();
                expect(panel.querySelector<HTMLElement>('.jpdb-subtitle-panel-options-menu')!.hidden).toBe(false);

                panel.querySelector<HTMLButtonElement>('[data-action="transcript-placement"][data-placement="bottom"]')!.click();

                panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                expect(settings.subtitleTranscriptPlacement).toBe('bottom');
                expect(panel.dataset.transcriptPlacement).toBe('bottom');
                expect(panel.querySelector<HTMLButtonElement>('[data-placement="bottom"]')?.getAttribute('aria-pressed')).toBe('true');
                // Choosing a placement dismisses the menu.
                expect(panel.querySelector<HTMLElement>('.jpdb-subtitle-panel-options-menu')!.hidden).toBe(true);

                panel.querySelector<HTMLButtonElement>('[data-action="panel-options"]')!.click();
                panel.querySelector<HTMLButtonElement>('[data-action="transcript-placement"][data-placement="right"]')!.click();

                panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                expect(settings.subtitleTranscriptPlacement).toBe('right');
                expect(panel.dataset.transcriptPlacement).toBe('right');
                expect(panel.querySelector<HTMLButtonElement>('[data-placement="right"]')?.getAttribute('aria-pressed')).toBe('true');

                internals.openTracksPanel();
                panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(true);
                expect(panel.querySelector('[data-action="close-panel"]')).not.toBeNull();
                expect(panel.querySelectorAll('[data-action="transcript-placement"][data-placement]')).toHaveLength(3);
                expect(onSettingsChange).toHaveBeenCalled();
            } finally {
                controller.destroy();
            }
        });
    });

    it('opens a shadowing drawer tab for active-line replay practice', async () => {
        const parseJapanese = vi.fn(async () => [makeSubtitleToken('今日は', { reading: 'きょうは' })]);
        const { settings, controller } = createInstalledSubtitleController({ subtitleSecondaryVisible: true }, { parseJapanese });
        const cue = { start: 3, end: 5, text: '今日は読む。', transcriptEligible: true };
        const secondaryCue = { start: 3, end: 5, text: 'I will read today.', transcriptEligible: false };
        const internals = controllerInternals<{
            cues: Array<typeof cue>;
            currentCue: typeof cue;
            secondaryCues: Array<typeof secondaryCue>;
        }>(controller);

        try {
            attachVideo(controller, { currentTime: 3.25 });
            internals.cues = [cue];
            internals.currentCue = cue;
            internals.secondaryCues = [secondaryCue];
            controller.refresh();

            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-list [data-action="panel-shadow"]')!.click();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-shadow-panel')).toBe(true);
            expect(panel.querySelector<HTMLButtonElement>('[data-action="panel-shadow"]')?.getAttribute('aria-pressed')).toBe('true');
            expect(panel.textContent).toContain('Shadow');
            expect(panel.textContent).toContain('I will read today.');
            expect(panel.querySelector<HTMLElement>('.jpdb-subtitle-shadow-secondary')?.classList.contains('jpdb-subtitle-secondary-blurred')).toBe(true);

            await vi.waitFor(() => {
                expect(panel.querySelector<HTMLElement>('.jpdb-subtitle-shadow-line .jpdb-reader-word[data-expression="今日は"]')).not.toBeNull();
            });

            panel.querySelector<HTMLButtonElement>('.jpdb-subtitle-shadow-secondary')!.click();

            expect(settings.subtitleNativeBlurred).toBe(false);
            expect(panel.querySelector<HTMLElement>('.jpdb-subtitle-shadow-secondary')?.classList.contains('jpdb-subtitle-secondary-clear')).toBe(true);

            panel.querySelector<HTMLButtonElement>('[data-action="shadow-toggle-text"]')!.click();

            expect(panel.querySelector<HTMLElement>('.jpdb-subtitle-shadow-line')?.classList.contains('jpdb-subtitle-shadow-line-hidden')).toBe(true);
            expect(panel.querySelector<HTMLButtonElement>('[data-action="shadow-toggle-text"]')?.getAttribute('aria-pressed')).toBe('true');

            panel.querySelector<HTMLButtonElement>('[data-action="shadow-toggle-text"]')!.click();

            expect(panel.querySelector<HTMLElement>('.jpdb-subtitle-shadow-line')?.classList.contains('jpdb-subtitle-shadow-line-hidden')).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    // Owner-reported on a phone: the line that hides the translation had to be
    // tapped several times. The drawer re-emits every control it owns as markup
    // and replaces the panel on each cue, so a cue advancing mid-tap rebuilds
    // the very control under the finger. Measured in Chromium: once the pressed
    // node is removed, a mouse click is dropped outright and a touch click is
    // re-hit-tested at release — landing on whichever control the rebuild moved
    // into that spot, which in this card is a seek. Re-attaching the same node
    // does not rescue it either, so the render waits for the finger instead.
    it('holds a drawer rebuild while a finger is on one of its controls', () => {
        const { settings, controller } = createInstalledSubtitleController({
            subtitleSecondaryVisible: true,
            subtitleNativeBlurred: true,
        });
        const cue = { start: 3, end: 5, text: '今日は読む。', transcriptEligible: true };
        const nextCue = { start: 5, end: 7, text: '別の行です。', transcriptEligible: true };
        const secondaryCue = { start: 3, end: 5, text: 'I will read today.', transcriptEligible: false };
        const nextSecondaryCue = { start: 5, end: 7, text: 'Another line.', transcriptEligible: false };
        const internals = controllerInternals<{
            cues: Array<typeof cue>;
            currentCue: typeof cue;
            secondaryCues: Array<typeof secondaryCue>;
            renderShadowPanel: (force?: boolean) => void;
        }>(controller);

        try {
            attachVideo(controller, { currentTime: 3.25 });
            internals.cues = [cue, nextCue];
            internals.currentCue = cue;
            internals.secondaryCues = [secondaryCue, nextSecondaryCue];
            controller.refresh();

            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-list [data-action="panel-shadow"]')!.click();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const line = panel.querySelector<HTMLButtonElement>('.jpdb-subtitle-shadow-secondary')!;
            expect(line.classList.contains('jpdb-subtitle-secondary-blurred')).toBe(true);

            // The finger lands on the control.
            line.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'touch', pointerId: 9 }));

            // The video plays on under it: the cue advances and the drawer
            // would otherwise rebuild its whole card.
            internals.currentCue = nextCue;
            internals.renderShadowPanel(true);

            expect(line.isConnected).toBe(true);
            expect(panel.querySelector('.jpdb-subtitle-shadow-secondary')).toBe(line);
            expect(panel.querySelector('.jpdb-subtitle-shadow-line')?.textContent).toContain('今日は読む。');

            // One tap, one toggle.
            line.click();

            expect(settings.subtitleNativeBlurred).toBe(false);
            // ...and the drawer catches up with the cue it held back.
            expect(panel.querySelector('.jpdb-subtitle-shadow-line')?.textContent).toContain('別の行です。');
            expect(panel.querySelector('.jpdb-subtitle-shadow-secondary')?.textContent).toContain('Another line.');
            expect(panel.querySelector<HTMLElement>('.jpdb-subtitle-shadow-secondary')?.classList.contains('jpdb-subtitle-secondary-clear')).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    // A tap that never becomes a click — a scroll steals the pointer — must not
    // leave the drawer frozen on a stale cue.
    it('releases a held drawer rebuild when the press is cancelled', () => {
        const { controller } = createInstalledSubtitleController({ subtitleSecondaryVisible: true });
        const cue = { start: 3, end: 5, text: '今日は読む。', transcriptEligible: true };
        const nextCue = { start: 5, end: 7, text: '別の行です。', transcriptEligible: true };
        const internals = controllerInternals<{
            cues: Array<typeof cue>;
            currentCue: typeof cue;
            renderShadowPanel: (force?: boolean) => void;
        }>(controller);

        try {
            attachVideo(controller, { currentTime: 3.25 });
            internals.cues = [cue, nextCue];
            internals.currentCue = cue;
            controller.refresh();

            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-list [data-action="panel-shadow"]')!.click();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const replay = panel.querySelector<HTMLButtonElement>('[data-action="shadow-replay"]')!;
            replay.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'touch', pointerId: 11 }));

            internals.currentCue = nextCue;
            internals.renderShadowPanel(true);
            expect(panel.querySelector('.jpdb-subtitle-shadow-line')?.textContent).toContain('今日は読む。');

            replay.dispatchEvent(pointerEvent('pointercancel', { pointerType: 'touch', pointerId: 11 }));

            expect(panel.querySelector('.jpdb-subtitle-shadow-line')?.textContent).toContain('別の行です。');
        } finally {
            controller.destroy();
        }
    });

    it('toggles shadow auto-pause from the drawer and pauses near the cue end', () => {
        const onSettingsChange = vi.fn();
        const { settings, controller } = createInstalledSubtitleController({ subtitleShadowAutoPause: false }, { onSettingsChange });
        const cue = { start: 3, end: 5, text: '一文ずつ止める。', transcriptEligible: true };
        const internals = controllerInternals<{
            cues: Array<typeof cue>;
            currentCue: typeof cue;
            panelMode: 'lines' | 'shadow' | 'tracks';
            syncShadowAutoPause: () => void;
            shadowAutoPausedCueSignature: string;
        }>(controller);

        try {
            const video = attachVideo(controller, { currentTime: 4.97 });
            let paused = false;
            const pause = vi.fn(() => { paused = true; });
            Object.defineProperties(video, {
                paused: { configurable: true, get: () => paused },
                pause: { configurable: true, value: pause },
            });
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-list [data-action="panel-shadow"]')!.click();

            let panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            panel.querySelector<HTMLButtonElement>('[data-action="shadow-auto-pause"]')!.click();

            expect(settings.subtitleShadowAutoPause).toBe(true);
            expect(onSettingsChange).toHaveBeenCalled();
            panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.querySelector<HTMLButtonElement>('[data-action="shadow-auto-pause"]')?.getAttribute('aria-pressed')).toBe('true');

            internals.panelMode = 'shadow';
            internals.syncShadowAutoPause();

            expect(pause).toHaveBeenCalledTimes(1);
            expect(paused).toBe(true);

            paused = false;
            internals.syncShadowAutoPause();

            expect(pause).toHaveBeenCalledTimes(1);
            expect(internals.shadowAutoPausedCueSignature).toBe(subtitleCueSignature(cue));
        } finally {
            controller.destroy();
        }
    });

    it('loops the active shadowing cue from the drawer control', () => {
        const { controller } = createInstalledSubtitleController();
        const cue = { start: 3, end: 5, text: '今日は読む。', transcriptEligible: true };
        const internals = controllerInternals<{
            cues: Array<typeof cue>;
            currentCue: typeof cue;
            syncShadowLoop: () => void;
        }>(controller);

        try {
            const video = attachVideo(controller, { currentTime: 4.25 });
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-list [data-action="panel-shadow"]')!.click();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            panel.querySelector<HTMLButtonElement>('[data-action="shadow-loop"]')!.click();

            expect(video.currentTime).toBe(3);
            expect(panel.querySelector<HTMLButtonElement>('[data-action="shadow-loop"]')?.getAttribute('aria-pressed')).toBe('true');

            video.currentTime = 5.05;
            internals.syncShadowLoop();

            expect(video.currentTime).toBe(3);
        } finally {
            controller.destroy();
        }
    });

    it('keeps looping the pinned line after playback overshoots into the next cue', () => {
        const { controller } = createInstalledSubtitleController();
        const cue1 = { start: 3, end: 5, text: '一行目。', transcriptEligible: true };
        const cue2 = { start: 5, end: 7, text: '二行目。', transcriptEligible: true };
        const internals = controllerInternals<{
            cues: Array<typeof cue1>;
            currentCue: typeof cue1;
            shadowLoopCue: typeof cue1 | undefined;
            syncShadowLoop: () => void;
        }>(controller);

        try {
            const video = attachVideo(controller, { currentTime: 3.25 });
            internals.cues = [cue1, cue2];
            internals.currentCue = cue1;
            controller.refresh();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-list [data-action="panel-shadow"]')!.click();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            panel.querySelector<HTMLButtonElement>('[data-action="shadow-loop"]')!.click();
            expect(internals.shadowLoopCue).toBe(cue1);

            // The boundary frame was missed: playback ran into cue2 and the live
            // currentCue already advanced. The loop must still pull back to cue1.
            internals.currentCue = cue2;
            video.currentTime = 5.2;
            internals.syncShadowLoop();

            expect(video.currentTime).toBe(3);
            expect(internals.currentCue).toBe(cue1);
        } finally {
            controller.destroy();
        }
    });

    it('shows previous and next context lines and jumps the focus when one is tapped', () => {
        const { controller } = createInstalledSubtitleController();
        const cue1 = { start: 3, end: 5, text: 'まえの行。', transcriptEligible: true };
        const cue2 = { start: 5, end: 7, text: 'いまの行。', transcriptEligible: true };
        const cue3 = { start: 7, end: 9, text: 'つぎの行。', transcriptEligible: true };
        const internals = controllerInternals<{
            cues: Array<typeof cue1>;
            currentCue: typeof cue1;
        }>(controller);

        try {
            attachVideo(controller, { currentTime: 5.5 });
            internals.cues = [cue1, cue2, cue3];
            internals.currentCue = cue2;
            controller.refresh();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-list [data-action="panel-shadow"]')!.click();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.querySelector<HTMLElement>('.jpdb-subtitle-shadow-context-prev')?.textContent).toContain('まえの行');
            expect(panel.querySelector<HTMLElement>('.jpdb-subtitle-shadow-context-next')?.textContent).toContain('つぎの行');

            panel.querySelector<HTMLButtonElement>('.jpdb-subtitle-shadow-context-next')!.click();
            expect(internals.currentCue).toBe(cue3);
        } finally {
            controller.destroy();
        }
    });

    it('clears the saved shadow recording when the learner moves to another line', () => {
        const { controller } = createInstalledSubtitleController();
        const cue1 = { start: 3, end: 5, text: '録音した行。', transcriptEligible: true };
        const cue2 = { start: 5, end: 7, text: '次の行。', transcriptEligible: true };
        const internals = controllerInternals<{
            cues: Array<typeof cue1>;
            currentCue: typeof cue1;
            shadowRecordingUrl?: string;
            shadowRecordingCueSignature: string;
            seekToCueObject: (cue: typeof cue1, options?: { exact?: boolean }) => void;
        }>(controller);
        const previousRevokeObjectUrl = URL.revokeObjectURL;
        const revokeObjectUrl = vi.fn();

        try {
            Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
            attachVideo(controller, { currentTime: 3.5 });
            internals.cues = [cue1, cue2];
            internals.currentCue = cue1;
            internals.shadowRecordingUrl = 'blob:yomu-shadow-line';
            internals.shadowRecordingCueSignature = subtitleCueSignature(cue1);

            internals.seekToCueObject(cue2, { exact: true });

            expect(internals.shadowRecordingUrl).toBeUndefined();
            expect(internals.shadowRecordingCueSignature).toBe('');
            expect(revokeObjectUrl).toHaveBeenCalledWith('blob:yomu-shadow-line');
            expect(internals.currentCue).toBe(cue2);
        } finally {
            if (previousRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: previousRevokeObjectUrl });
            controller.destroy();
        }
    });

    it('exposes a self-recording control and omits context lines for a lone cue', () => {
        const { controller } = createInstalledSubtitleController();
        const cue = { start: 3, end: 5, text: '録音テスト。', transcriptEligible: true };
        const internals = controllerInternals<{ cues: Array<typeof cue>; currentCue: typeof cue }>(controller);

        try {
            attachVideo(controller, { currentTime: 3.5 });
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-list [data-action="panel-shadow"]')!.click();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.querySelector('[data-action="shadow-record"]')).not.toBeNull();
            expect(panel.querySelector('.jpdb-subtitle-shadow-context')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('opens the tracks drawer from the rail panel toggle when lines are unavailable', () => {
        const onSettingsChange = vi.fn();
        const { settings, controller } = createInstalledSubtitleController({ subtitleTranscriptVisible: false }, { onSettingsChange });

        try {
            const video = attachVideo(controller);
            video.dataset.yomuAnimeSearch = 'Sousou.no.Frieren.S01E01.mkv';
            setSingleJapaneseSubtitleTrack(controller);
            controller.refresh();

            const { root, panel, button } = subtitlePanelToggleElements();

            button.click();

            expectJapaneseTracksPanelOpen(panel);
            const jimakuSearch = panel.querySelector<HTMLAnchorElement>('[data-jimaku-anime-search]')!;
            expect(jimakuSearch.textContent).toBe('Search anime subtitles');
            expect(jimakuSearch.href).toBe('https://jimaku.cc/opensearch/redirect?anime=true&query=Sousou%20no%20Frieren%20S01E01');
            expect(jimakuSearch.target).toBe('_blank');
            expect(jimakuSearch.rel).toContain('noopener');
            expectSubtitlePanelActionsAbsent(panel, ['tracks', 'lines', 'shadow', 'mine']);
            expect(root.classList.contains('jpdb-subtitle-panel-open')).toBe(true);
            expect(settings.subtitleTranscriptVisible).toBe(false);
            // Opening the tracks drawer is page-scoped runtime state, not a
            // persisted settings change.
            expect(onSettingsChange).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('cleans streaming-site title noise from the anime subtitle lookup query', () => {
        const previousTitle = document.title;
        document.title = 'Watch Sousou no Frieren Episode 12 English Subbed Online - AnimeVerse';
        const onSettingsChange = vi.fn();
        const { settings, controller } = createInstalledSubtitleController({ subtitleTranscriptVisible: false }, { onSettingsChange });

        try {
            attachVideo(controller);
            setSingleJapaneseSubtitleTrack(controller);
            controller.refresh();

            const { panel, button } = subtitlePanelToggleElements();

            button.click();

            expectJapaneseTracksPanelOpen(panel);
            const jimakuSearch = panel.querySelector<HTMLAnchorElement>('[data-jimaku-anime-search]')!;
            expect(jimakuSearch.href).toBe('https://jimaku.cc/opensearch/redirect?anime=true&query=Sousou%20no%20Frieren');
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(onSettingsChange).not.toHaveBeenCalled();
        } finally {
            document.title = previousTitle;
            controller.destroy();
        }
    });

    it('opens the transcript while paused without changing the saved default', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitlePausePanel: true,
            subtitleTranscriptVisible: false,
        };
        const onSettingsChange = vi.fn();
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange,
        });

        try {
            (controller as unknown as { install: () => void }).install();
            const video = document.createElement('video');
            Object.defineProperties(video, {
                paused: { configurable: true, value: true },
                ended: { configurable: true, value: false },
            });
            const cue = { start: 0, end: 2, text: '一時停止した行。', transcriptEligible: true };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            };
            internals.video = video;
            internals.cues = [cue];
            internals.currentCue = cue;

            controller.refresh();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(false);
            expect(panel.textContent).toContain('一時停止した行');
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(onSettingsChange).not.toHaveBeenCalled();

            Object.defineProperty(video, 'paused', { configurable: true, value: false });
            controller.refresh();

            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-panel-closing')).toBe(true);
            await vi.advanceTimersByTimeAsync(181);
            expect(panel.hidden).toBe(true);
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(onSettingsChange).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('shows the pause-opened transcript immediately and defers the full row render', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitlePausePanel: true,
            subtitleTranscriptVisible: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: vi.fn(),
        });

        try {
            (controller as unknown as { install: () => void }).install();
            vi.stubGlobal('ResizeObserver', class {
                observe(): void {}
                disconnect(): void {}
            });
            const video = document.createElement('video');
            let paused = false;
            Object.defineProperties(video, {
                paused: { configurable: true, get: () => paused },
                ended: { configurable: true, value: false },
            });
            const cues = Array.from({ length: 5 }, (_, index) => ({
                start: index,
                end: index + 0.8,
                text: `一時停止した行${index}`,
                transcriptEligible: true,
            }));
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: typeof cues;
                currentCue: typeof cues[number];
                observeVideoLayout: (video: HTMLVideoElement) => void;
            };
            internals.video = video;
            internals.cues = cues;
            internals.currentCue = cues[2];
            internals.observeVideoLayout(video);

            paused = true;
            video.dispatchEvent(new Event('pause'));

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);
            expect(panel.querySelectorAll('.jpdb-subtitle-list-row')).toHaveLength(3);
            expect(panel.textContent).toContain('一時停止した行2');

            await vi.advanceTimersByTimeAsync(20);
            expect(panel.querySelectorAll('.jpdb-subtitle-list-row')).toHaveLength(3);

            await vi.advanceTimersByTimeAsync(500);
            await vi.advanceTimersByTimeAsync(0);

            expect(panel.querySelectorAll('.jpdb-subtitle-list-row')).toHaveLength(5);
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('virtualizes long transcript drawers instead of mounting every row', () => {
        const cues = Array.from({ length: 300 }, (_, index) => ({
            start: index,
            end: index + 0.8,
            text: `長い字幕${index}`,
            transcriptEligible: true,
        }));
        const { controller, internals } = setupTranscriptCueController(cues);

        try {
            internals.openLinesPanel();

            const scroller = document.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll')!;
            const rows = Array.from(scroller.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row'));
            expect(scroller.dataset.virtualized).toBe('true');
            expect(scroller.dataset.totalRows).toBe('300');
            expect(rows).toHaveLength(21);
            expect(rows[0]?.dataset.rowIndex).toBe('0');
            expect(rows.at(-1)?.dataset.rowIndex).toBe('20');
            expect(scroller.querySelector<HTMLElement>('.jpdb-subtitle-list-spacer')?.style.height).toBe('22320px');
        } finally {
            controller.destroy();
        }
    });

    it('calibrates virtual transcript row estimates from rendered row heights with damping and clamps', () => {
        const cues = Array.from({ length: 300 }, (_, index) => ({
            start: index,
            end: index + 0.8,
            text: `背の高い字幕${index}`,
            transcriptEligible: true,
        }));
        const { controller, internals } = setupTranscriptCueController<typeof cues[number], {
            calibrateTranscriptRowEstimate: () => void;
            transcriptRowEstimatePx: number;
        }>(cues);
        const setRenderedRowHeights = (height: number) => {
            document.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row').forEach(row => {
                Object.defineProperty(row, 'offsetHeight', {
                    configurable: true,
                    value: height,
                });
            });
        };

        try {
            internals.openLinesPanel();

            setRenderedRowHeights(140);
            internals.calibrateTranscriptRowEstimate();
            expect(internals.transcriptRowEstimatePx).toBeCloseTo(116, 4);

            internals.transcriptRowEstimatePx = 230;
            setRenderedRowHeights(400);
            internals.calibrateTranscriptRowEstimate();
            expect(internals.transcriptRowEstimatePx).toBe(240);

            internals.transcriptRowEstimatePx = 50;
            setRenderedRowHeights(1);
            internals.calibrateTranscriptRowEstimate();
            expect(internals.transcriptRowEstimatePx).toBe(40);
        } finally {
            controller.destroy();
        }
    });

    it('freezes the row estimate while the user is hand-scrolling the transcript', () => {
        const cues = Array.from({ length: 300 }, (_, index) => ({
            start: index,
            end: index + 0.8,
            text: `背の高い字幕${index}`,
            transcriptEligible: true,
        }));
        const { controller, internals } = setupTranscriptCueController<typeof cues[number], {
            calibrateTranscriptRowEstimate: () => void;
            transcriptRowEstimatePx: number;
            noteTranscriptScrollIntent: () => void;
            noteTranscriptScroll: () => void;
        }>(cues);

        try {
            internals.openLinesPanel();
            document.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row').forEach(row => {
                Object.defineProperty(row, 'offsetHeight', { configurable: true, value: 140 });
            });
            const before = internals.transcriptRowEstimatePx;

            // A user scroll pauses auto-follow; the estimate must freeze so the
            // spacer/scroll geometry stays idempotent under the user's finger.
            internals.noteTranscriptScrollIntent();
            internals.noteTranscriptScroll();
            internals.calibrateTranscriptRowEstimate();
            expect(internals.transcriptRowEstimatePx).toBe(before);
        } finally {
            controller.destroy();
        }
    });

    it('recenters a virtualized transcript when playback advances past the rendered rows', () => {
        const cues = Array.from({ length: 300 }, (_, index) => ({
            start: index,
            end: index + 0.8,
            text: `長い字幕${index}`,
            transcriptEligible: true,
        }));
        const { controller, internals } = setupTranscriptCueController<typeof cues[number], {
            currentCue: typeof cues[number];
            renderTranscriptPanel: (force?: boolean) => void;
        }>(cues, {
            currentCue: cues[0],
            settings: { subtitleTranscriptAutoScroll: true },
        });

        try {
            internals.openLinesPanel();
            internals.currentCue = cues[120]!;
            internals.renderTranscriptPanel(true);

            const scroller = document.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll')!;
            const rows = Array.from(scroller.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row'));
            const active = scroller.querySelector<HTMLElement>('.jpdb-subtitle-list-row.active');
            expect(scroller.dataset.virtualized).toBe('true');
            expect(rows[0]?.dataset.rowIndex).toBe('110');
            expect(rows.at(-1)?.dataset.rowIndex).toBe('130');
            expect(active?.dataset.rowIndex).toBe('120');
        } finally {
            controller.destroy();
        }
    });

    it('keeps the transcript scroll container in place when a hand scroll shifts the virtual window', async () => {
        // On tablets, a virtual-window shift used to route through a full panel
        // render that replaced .jpdb-subtitle-list-scroll with a new element,
        // detaching it from the in-flight native touch scroll gesture and
        // stopping the scroll dead. The scroller node must survive a scroll-
        // driven window shift so the gesture keeps tracking it.
        vi.useFakeTimers();
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalCancelAnimationFrame = window.cancelAnimationFrame;
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as typeof window.cancelAnimationFrame;

        try {
            const cues = Array.from({ length: 300 }, (_, index) => ({
                start: index,
                end: index + 0.8,
                text: `長い字幕${index}`,
                transcriptEligible: true,
            }));
            const { controller, internals } = setupTranscriptCueController(cues, {
                currentCue: cues[0],
                settings: { subtitleTranscriptAutoScroll: false },
            });

            try {
                internals.openLinesPanel();

                const scrollerBefore = document.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll')!;
                const rowsBefore = Array.from(scrollerBefore.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row'));
                expect(rowsBefore[0]?.dataset.rowIndex).toBe('0');
                expect(rowsBefore.at(-1)?.dataset.rowIndex).toBe('20');

                Object.defineProperty(scrollerBefore, 'scrollTop', {
                    configurable: true,
                    value: 4000,
                    writable: true,
                });
                scrollerBefore.dispatchEvent(new Event('scroll'));

                await vi.advanceTimersByTimeAsync(1);
                await Promise.resolve();

                const scrollerAfter = document.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll')!;
                // Same DOM node, not a replacement -- this is what keeps a tablet's
                // native touch scroll gesture alive across the virtual window shift.
                expect(scrollerAfter).toBe(scrollerBefore);
                expect(scrollerAfter.scrollTop).toBe(4000);

                const rowsAfter = Array.from(scrollerAfter.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row'));
                expect(scrollerAfter.dataset.totalRows).toBe('300');
                expect(rowsAfter[0]?.dataset.rowIndex).toBe('47');
                expect(rowsAfter.at(-1)?.dataset.rowIndex).toBe('67');
            } finally {
                controller.destroy();
            }
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        }
    });

    it('keeps the previous transcript row anchored through a cue gap, then glides once to the next row', () => {
        const rafDescriptor = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
        const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
        const scrollSpy = vi.fn();
        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            value: (callback: FrameRequestCallback) => { callback(performance.now()); return 1; },
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollSpy });
        const cues = [
            { start: 0, end: 1, text: '前の字幕', transcriptEligible: true },
            { start: 2, end: 3, text: '次の字幕', transcriptEligible: true },
        ];
        const { controller, internals, video } = setupTranscriptCueController<typeof cues[number], {
            currentCue: typeof cues[number] | undefined;
            updateFromLoadedCues: () => void;
            renderTranscriptPanel: (force?: boolean) => void;
        }>(cues, {
            currentCue: cues[0],
            currentTime: 0.5,
            selectedTrackId: 'file-primary',
            settings: { subtitleTranscriptAutoScroll: true },
        });

        try {
            internals.openLinesPanel();
            internals.updateFromLoadedCues();
            internals.renderTranscriptPanel();
            scrollSpy.mockClear();

            video.currentTime = 1.5;
            internals.updateFromLoadedCues();

            expect(internals.currentCue).toBeUndefined();
            expect(document.querySelector('.jpdb-subtitle-primary')).toBeNull();
            expect(document.querySelector<HTMLElement>('.jpdb-subtitle-list-row.active')?.dataset.rowIndex).toBe('0');
            expect(scrollSpy).not.toHaveBeenCalled();

            video.currentTime = 2.1;
            internals.updateFromLoadedCues();

            expect(internals.currentCue).toBe(cues[1]);
            expect(document.querySelector<HTMLElement>('.jpdb-subtitle-list-row.active')?.dataset.rowIndex).toBe('1');
            expect(scrollSpy).toHaveBeenCalledTimes(1);
            expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth', block: 'center' }));
        } finally {
            controller.destroy();
            if (rafDescriptor) Object.defineProperty(window, 'requestAnimationFrame', rafDescriptor);
            if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
            else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
        }
    });

    it('does not keep a transcript gap anchor when auto-follow is disabled', () => {
        const cues = [
            { start: 0, end: 1, text: '前の字幕', transcriptEligible: true },
            { start: 2, end: 3, text: '次の字幕', transcriptEligible: true },
        ];
        const { controller, internals, video } = setupTranscriptCueController<typeof cues[number], {
            currentCue: typeof cues[number] | undefined;
            updateFromLoadedCues: () => void;
        }>(cues, {
            currentCue: cues[0],
            currentTime: 0.5,
            selectedTrackId: 'file-primary',
            settings: { subtitleTranscriptAutoScroll: false },
        });

        try {
            internals.openLinesPanel();
            video.currentTime = 1.5;
            internals.updateFromLoadedCues();

            expect(internals.currentCue).toBeUndefined();
            expect(document.querySelector('.jpdb-subtitle-list-row.active')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('patches appended virtual transcript rows and centres the new active row before returning', () => {
        const rafDescriptor = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
        const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
        const scrollSpy = vi.fn();
        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            value: (callback: FrameRequestCallback) => { callback(performance.now()); return 1; },
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollSpy });
        const cues = Array.from({ length: 80 }, (_, index) => ({
            start: index,
            end: index + 0.8,
            text: `追加字幕${index}`,
            transcriptEligible: true,
        }));
        const initialCues = cues.slice(0, 70);
        const { controller, internals, video } = setupTranscriptCueController<typeof cues[number], {
            renderTranscriptPanel: (force?: boolean) => void;
        }>(initialCues, {
            currentCue: initialCues[65],
            currentTime: 65.2,
            selectedTrackId: 'file-primary',
            settings: { subtitleTranscriptAutoScroll: true },
        });

        try {
            internals.openLinesPanel();
            const scrollerBefore = document.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll')!;
            scrollSpy.mockClear();

            internals.cues = cues;
            internals.currentCue = cues[75]!;
            video.currentTime = 75.2;
            internals.renderTranscriptPanel();

            const scrollerAfter = document.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll')!;
            const active = scrollerAfter.querySelector<HTMLElement>('.jpdb-subtitle-list-row.active');
            expect(scrollerAfter).toBe(scrollerBefore);
            expect(scrollerAfter.dataset.totalRows).toBe('80');
            expect(document.querySelector('.jpdb-subtitle-drawer-meta')?.textContent).toContain('80');
            expect(active?.dataset.rowIndex).toBe('75');
            expect(scrollerAfter.querySelectorAll('.jpdb-subtitle-list-row').length).toBeGreaterThan(0);
            expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto', block: 'center' }));
        } finally {
            controller.destroy();
            if (rafDescriptor) Object.defineProperty(window, 'requestAnimationFrame', rafDescriptor);
            if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
            else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
        }
    });

    it('honours reduced motion and distinguishes smooth auto-follow from a real touch interruption', () => {
        const rafDescriptor = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
        const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
        const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
        const scrollSpy = vi.fn();
        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            value: (callback: FrameRequestCallback) => { callback(performance.now()); return 1; },
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollSpy });
        const cues = Array.from({ length: 10 }, (_, index) => ({
            start: index,
            end: index + 1,
            text: `字幕${index}`,
            transcriptEligible: true,
        }));
        const { controller, internals, video } = setupTranscriptCueController<typeof cues[number], {
            currentCue: typeof cues[number];
            renderTranscriptPanel: (force?: boolean) => void;
        }>(cues, {
            currentCue: cues[0],
            currentTime: 0.5,
            selectedTrackId: 'file-primary',
            settings: { subtitleTranscriptAutoScroll: true, subtitleTranscriptAutoScrollResumeSeconds: 30 },
        });

        try {
            internals.openLinesPanel();
            scrollSpy.mockClear();
            internals.currentCue = cues[1]!;
            video.currentTime = 1.2;
            internals.renderTranscriptPanel();
            expect(scrollSpy).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'smooth' }));

            const scroller = document.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll')!;
            scroller.dispatchEvent(new Event('scroll'));
            expect(document.querySelector('.jpdb-subtitle-list')?.classList.contains('jpdb-subtitle-auto-scroll-paused')).toBe(false);

            // A tap/click can trigger a seek and a programmatic active-row
            // scroll; pointerdown alone is not manual-scroll intent.
            scroller.dispatchEvent(pointerEvent('pointerdown', { clientY: 20, pointerId: 44 }));
            scroller.dispatchEvent(new Event('scroll'));
            expect(document.querySelector('.jpdb-subtitle-list')?.classList.contains('jpdb-subtitle-auto-scroll-paused')).toBe(false);

            scroller.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
            scroller.dispatchEvent(new Event('scroll'));
            expect(document.querySelector('.jpdb-subtitle-list')?.classList.contains('jpdb-subtitle-auto-scroll-paused')).toBe(true);
            document.querySelector<HTMLButtonElement>('[data-action="jump-current"]')!.click();
            expect(document.querySelector('.jpdb-subtitle-list')?.classList.contains('jpdb-subtitle-auto-scroll-paused')).toBe(false);

            scroller.dispatchEvent(new Event('touchmove'));
            scroller.dispatchEvent(new Event('scroll'));
            expect(document.querySelector('.jpdb-subtitle-list')?.classList.contains('jpdb-subtitle-auto-scroll-paused')).toBe(true);

            Object.defineProperty(window, 'matchMedia', {
                configurable: true,
                value: () => ({ matches: false }),
            });
            // Clear the manual pause, then prove a large seek stays instant even
            // when motion is otherwise allowed.
            document.querySelector<HTMLButtonElement>('[data-action="jump-current"]')!.click();
            expect(document.querySelector('.jpdb-subtitle-list')?.classList.contains('jpdb-subtitle-auto-scroll-paused')).toBe(false);
            scroller.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
            scroller.dispatchEvent(new Event('scroll'));
            expect(document.querySelector('.jpdb-subtitle-list')?.classList.contains('jpdb-subtitle-auto-scroll-paused')).toBe(true);
            document.querySelector<HTMLButtonElement>('[data-action="jump-current"]')!.click();
            expect(document.querySelector('.jpdb-subtitle-list')?.classList.contains('jpdb-subtitle-auto-scroll-paused')).toBe(false);
            scrollSpy.mockClear();
            internals.currentCue = cues[9]!;
            video.currentTime = 9.2;
            internals.renderTranscriptPanel();
            expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));

            Object.defineProperty(window, 'matchMedia', {
                configurable: true,
                value: () => ({ matches: true }),
            });
            scrollSpy.mockClear();
            internals.currentCue = cues[8]!;
            video.currentTime = 8.2;
            internals.renderTranscriptPanel();
            expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
        } finally {
            controller.destroy();
            if (rafDescriptor) Object.defineProperty(window, 'requestAnimationFrame', rafDescriptor);
            if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
            else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
            if (matchMediaDescriptor) Object.defineProperty(window, 'matchMedia', matchMediaDescriptor);
            else delete (window as Partial<Window>).matchMedia;
        }
    });

    it('keeps an explicitly closed pause panel closed until the video plays again', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitlePausePanel: true,
            subtitleTranscriptVisible: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: vi.fn(),
        });

        try {
            (controller as unknown as { install: () => void }).install();
            const video = document.createElement('video');
            let paused = true;
            Object.defineProperties(video, {
                paused: { configurable: true, get: () => paused },
                ended: { configurable: true, value: false },
            });
            const cue = { start: 0, end: 2, text: '一時停止した行。', transcriptEligible: true };
            const internals = controller as unknown as { video: HTMLVideoElement; cues: Array<typeof cue>; currentCue: typeof cue };
            internals.video = video;
            internals.cues = [cue];
            internals.currentCue = cue;

            controller.refresh();
            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);

            // User explicitly closes while still paused.
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();
            await vi.advanceTimersByTimeAsync(181);
            expect(panel.hidden).toBe(true);

            // A pause-driven sync must not reopen what the user just closed.
            controller.refresh();
            expect(panel.hidden).toBe(true);
            (controller as unknown as { syncPauseTranscriptPanel: () => void }).syncPauseTranscriptPanel();
            expect(panel.hidden).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('exposes auto-hide in the drawer header and uses it as the close-on-play mode', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitlePausePanel: false,
            subtitleTranscriptVisible: false,
        };
        const onSettingsChange = vi.fn();
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange,
        });

        try {
            (controller as unknown as { install: () => void }).install();
            const video = document.createElement('video');
            Object.defineProperties(video, {
                paused: { configurable: true, value: false },
                ended: { configurable: true, value: false },
            });
            const cue = { start: 0, end: 2, text: '自動で隠す。', transcriptEligible: true };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                openLinesPanel: () => void;
                observeVideoLayout: (video: HTMLVideoElement) => void;
            };
            internals.video = video;
            internals.cues = [cue];
            internals.currentCue = cue;
            vi.stubGlobal('ResizeObserver', class {
                observe(): void {}
                disconnect(): void {}
            });
            internals.observeVideoLayout(video);

            internals.openLinesPanel();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const autoButton = panel.querySelector<HTMLButtonElement>('[data-action="toggle-pause-panel"]')!;
            expect(autoButton).toBeTruthy();
            expect(autoButton.textContent).toContain('Auto');
            expect(autoButton.getAttribute('aria-pressed')).toBe('false');
            expect(autoButton.title).toBe('Auto-hide panel while playing');
            expect(panel.querySelector('[data-action="close-panel"]')).not.toBeNull();
            expect(panel.querySelectorAll('[data-action="transcript-placement"][data-placement]')).toHaveLength(3);

            autoButton.click();

            expect(settings.subtitlePausePanel).toBe(true);
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-panel-closing')).toBe(true);
            await vi.advanceTimersByTimeAsync(181);
            expect(panel.hidden).toBe(true);
            expect(onSettingsChange).toHaveBeenCalled();

            Object.defineProperty(video, 'paused', { configurable: true, value: true });
            controller.refresh();

            const reopenedButton = panel.querySelector<HTMLButtonElement>('[data-action="toggle-pause-panel"]')!;
            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-lines-panel')).toBe(true);
            expect(panel.textContent).toContain('自動で隠す');
            expect(reopenedButton.getAttribute('aria-pressed')).toBe('true');
            expect(reopenedButton.title).toBe('Keep panel open while playing');

            Object.defineProperty(video, 'paused', { configurable: true, value: false });
            video.dispatchEvent(new Event('playing'));
            await vi.advanceTimersByTimeAsync(16);
            await vi.advanceTimersByTimeAsync(0);
            await vi.advanceTimersByTimeAsync(181);
            expect(panel.hidden).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('keeps auto-hide active after switching the pause-opened drawer to tracks', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitlePausePanel: true,
            subtitleTranscriptVisible: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });

        try {
            (controller as unknown as { install: () => void }).install();
            vi.stubGlobal('ResizeObserver', class {
                observe(): void {}
                disconnect(): void {}
            });
            const video = document.createElement('video');
            let paused = true;
            Object.defineProperties(video, {
                paused: { configurable: true, get: () => paused },
                ended: { configurable: true, value: false },
            });
            const cue = { start: 0, end: 2, text: '一時停止中。', transcriptEligible: true };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                observeVideoLayout: (video: HTMLVideoElement) => void;
                openTracksPanel: () => void;
            };
            internals.video = video;
            internals.cues = [cue];
            internals.currentCue = cue;
            internals.observeVideoLayout(video);

            controller.refresh();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-lines-panel')).toBe(true);

            internals.openTracksPanel();

            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(true);

            paused = false;
            video.dispatchEvent(new Event('play'));

            // The pause-panel sync is deferred past the next paint so play/pause
            // stays responsive; flush the rAF + timeout before asserting.
            await vi.advanceTimersByTimeAsync(20);
            expect(panel.classList.contains('jpdb-subtitle-panel-closing')).toBe(true);
            await vi.advanceTimersByTimeAsync(181);
            expect(panel.hidden).toBe(true);
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('opens the tracks drawer from the hosted video page subtitle button event', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitleTranscriptVisible: false,
        };
        const onSettingsChange = vi.fn();
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange,
        });

        try {
            controller.init();
            (controller as unknown as { tracks: unknown[] }).tracks = [{
                id: 'file-ja',
                kind: 'file',
                label: 'Japanese file',
                language: 'ja',
                cues: [],
            }];

            window.dispatchEvent(new CustomEvent(OPEN_SUBTITLE_TRACKS_EVENT));

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(true);
            expect(panel.querySelector('.jpdb-subtitle-track-row')?.textContent).toContain('Japanese file');
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(onSettingsChange).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('keeps the YouTube side panel toggle available when tracks arrive before the video wrapper settles', () => {
        const originalLocation = window.location;
        const onSettingsChange = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        const { controller } = createInstalledSubtitleController({ subtitleTranscriptVisible: false }, { onSettingsChange });

        try {
            setSingleJapaneseSubtitleTrack(controller);
            controller.refresh();

            const { root, panel, button } = subtitlePanelToggleElements();

            expect(root.hidden).toBe(false);
            expect(button.disabled).toBe(false);

            button.click();

            expectJapaneseTracksPanelOpen(panel);
            // Opening the tracks drawer is page-scoped runtime state, not a
            // persisted settings change.
            expect(onSettingsChange).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });
});
