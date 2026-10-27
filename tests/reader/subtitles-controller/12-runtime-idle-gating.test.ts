import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    controllerInternals,
    createSubtitleController,
    createInstalledSubtitleController,
    attachVideo,
    makeSubtitleSettings,
    SubtitlePlayerController,
} from './fixtures';
import type { ReaderSettings } from './fixtures';
import { registerSubtitleControllerCleanup, setupInstalledVideoController } from "./fixtures";

// Cluster G4 (iPad heat / battery): the subtitle controller used to install a
// body MutationObserver + a self-re-arming 1.5s tick unconditionally, even when
// subtitlePlayerEnabled is false and no video is bound — every SPA mutation ran
// syncYouTubeMobileBottomSheetState for a feature nobody was using. When idle
// the controller must install no observer and park the tick; enabling the
// feature (or binding a video) must bring the runtime back promptly.

interface RuntimeInternals {
    observer?: MutationObserver;
    observerMode: 'full' | 'discovery' | 'off';
    tickTimer?: number;
    video?: HTMLVideoElement;
}

const controllers: SubtitlePlayerController[] = [];

function initController(settings: ReaderSettings): { controller: SubtitlePlayerController; internals: RuntimeInternals } {
    const { controller } = createSubtitleController(settings);
    controller.init();
    controllers.push(controller);
    return { controller, internals: controllerInternals<RuntimeInternals>(controller) };
}

afterEach(() => {
    while (controllers.length) controllers.pop()?.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('subtitle runtime idle gating', () => {
    it('does not probe native sheets for reader-only mutation batches', () => {
        const { controller } = initController(makeSubtitleSettings());
        attachVideo(controller);
        const internals = controllerInternals<{
            root: HTMLElement;
            handleRuntimeMutations: (records: MutationRecord[]) => void;
            syncYouTubeMobileBottomSheetState: () => void;
        }>(controller);
        const probe = vi.spyOn(internals, 'syncYouTubeMobileBottomSheetState');
        const record = { target: internals.root, type: 'attributes', attributeName: 'class', addedNodes: [], removedNodes: [] } as unknown as MutationRecord;
        for (let i = 0; i < 100; i++) internals.handleRuntimeMutations([record]);
        expect(probe).not.toHaveBeenCalled();
        internals.handleRuntimeMutations([{ ...record, target: document.body } as MutationRecord]);
        expect(probe).toHaveBeenCalledOnce();
    });
    it('keeps the initial surface hidden until a player is attached', () => {
        const { controller } = createInstalledSubtitleController({ subtitlePlayerEnabled: true });
        const internals = controllerInternals<{ root: HTMLElement }>(controller);
        expect(internals.root.hidden).toBe(true);
        attachVideo(controller);
        controller.refresh();
        expect(internals.root.hidden).toBe(false);
        controllerInternals<{ clearDiscoveredVideoCandidate(): void }>(controller).clearDiscoveredVideoCandidate();
        expect(internals.root.hidden).toBe(true);
    });
    it('installs no observer and parks the tick when disabled with no video', () => {
        const { internals } = initController(makeSubtitleSettings({ subtitlePlayerEnabled: false }));

        expect(internals.observerMode).toBe('off');
        expect(internals.observer).toBeUndefined();
        expect(internals.tickTimer).toBeUndefined();
    });

    it('brings up a discovery observer and starts the tick when the feature is enabled', () => {
        const settings: ReaderSettings = makeSubtitleSettings({ subtitlePlayerEnabled: false });
        const { controller, internals } = initController(settings);
        expect(internals.observerMode).toBe('off');

        settings.subtitlePlayerEnabled = true;
        controller.refresh();

        // No video yet: a childList-only discovery observer, and the tick is
        // running again so a video that appears is picked up.
        expect(internals.observerMode).toBe('discovery');
        expect(internals.observer).toBeInstanceOf(MutationObserver);
        expect(internals.tickTimer).not.toBeUndefined();
    });

    it('runs the full attribute observer while the feature is enabled', () => {
        const { internals } = initController(makeSubtitleSettings({ subtitlePlayerEnabled: true }));

        // Enabled but no bound video on a bare page: discovery mode watches for
        // a video appearing; the tick keeps running.
        expect(internals.observerMode).toBe('discovery');
        expect(internals.observer).toBeInstanceOf(MutationObserver);
        expect(internals.tickTimer).not.toBeUndefined();
    });

    it('ignores an already-queued tick from the previous same-instance lifecycle', () => {
        const scheduled = new Map<number, () => void>();
        let nextTimerId = 1;
        vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler) => {
            if (typeof handler !== 'function') throw new TypeError('Expected a timeout callback');
            const id = nextTimerId++;
            scheduled.set(id, handler as () => void);
            return id;
        }) as typeof window.setTimeout);
        vi.spyOn(window, 'clearTimeout').mockImplementation(id => {
            if (typeof id === 'number') scheduled.delete(id);
        });

        const { controller, internals } = initController(makeSubtitleSettings({ subtitlePlayerEnabled: true }));
        const staleTimer = internals.tickTimer!;
        const staleCallback = scheduled.get(staleTimer)!;

        // Re-init clears the old timer and installs a new lifecycle timer. A
        // callback already queued by the browser can still arrive after clear.
        controller.init();
        const currentTimer = internals.tickTimer!;
        const currentCallback = scheduled.get(currentTimer)!;
        expect(currentTimer).not.toBe(staleTimer);

        staleCallback();

        expect(internals.tickTimer).toBe(currentTimer);
        expect(scheduled.has(currentTimer)).toBe(true);

        const getSettings = vi.spyOn(
            controllerInternals<{ options: { getSettings: () => ReaderSettings } }>(controller).options,
            'getSettings',
        );
        controller.destroy();
        const settingsReadsAfterDestroy = getSettings.mock.calls.length;

        // Neither callback may revive a stopped lifecycle. In particular the
        // old callback must not clear the current handle before it is rejected.
        staleCallback();
        currentCallback();

        expect(internals.tickTimer).toBeUndefined();
        expect(scheduled.size).toBe(0);
        expect(nextTimerId).toBe(3);
        expect(getSettings).toHaveBeenCalledTimes(settingsReadsAfterDestroy);
    });
});

describe('SubtitlePlayerController frame-synced sampler lifecycle', () => {
    // The per-frame cue/karaoke sampler must be armed only while the bound video
    // plays and cancelled on pause/destroy — a sampler left spinning on a paused or
    // destroyed controller drains battery (the highest-risk regression of the sync
    // fix). jsdom has no requestVideoFrameCallback, so this exercises the rAF path.

    registerSubtitleControllerCleanup();

    interface FrameSyncInternals {
        startFrameSync(video: HTMLVideoElement): void;
        stopFrameSync(): void;
        frameSyncHandle?: number;
    }

    it('arms a sampler on start and cancels it on stop and on destroy', () => {
        const requested: number[] = [];
        const cancelled: number[] = [];
        const realRaf = window.requestAnimationFrame;
        const realCancel = window.cancelAnimationFrame;
        let nextId = 1;
        window.requestAnimationFrame = ((): number => {
            const id = nextId++;
            requested.push(id);
            return id;
        }) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = ((id: number): void => {
            cancelled.push(id);
        }) as typeof window.cancelAnimationFrame;
        try {
            const { controller, video } = setupInstalledVideoController(new DOMRect(0, 0, 390, 693));
            const internals = controllerInternals<FrameSyncInternals>(controller);

            internals.startFrameSync(video);
            const handle = internals.frameSyncHandle;
            expect(handle).toBeDefined();
            expect(requested).toContain(handle);

            internals.stopFrameSync();
            expect(internals.frameSyncHandle).toBeUndefined();
            expect(cancelled).toContain(handle);

            // Destroy must cancel an armed sampler so nothing keeps ticking.
            internals.startFrameSync(video);
            const secondHandle = internals.frameSyncHandle;
            expect(secondHandle).toBeDefined();
            controller.destroy();
            expect(internals.frameSyncHandle).toBeUndefined();
            expect(cancelled).toContain(secondHandle);
        } finally {
            window.requestAnimationFrame = realRaf;
            window.cancelAnimationFrame = realCancel;
        }
    });

    it('exposes the bound video via getBoundVideo only while it is connected', () => {
        const { controller, video } = setupInstalledVideoController(new DOMRect(0, 0, 390, 693));
        try {
            // The mining-pause path resolves the player to pause through this
            // accessor, so it must return the bound video while attached and
            // nothing once it is detached (e.g. a YouTube element swap).
            document.body.append(video);
            expect(controller.getBoundVideo()).toBe(video);
            video.remove();
            expect(controller.getBoundVideo()).toBeUndefined();
        } finally {
            controller.destroy();
        }
    });
});
