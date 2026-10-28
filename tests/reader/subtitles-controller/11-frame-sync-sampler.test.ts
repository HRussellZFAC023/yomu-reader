import { describe, expect, it } from 'vitest';
import {
    registerSubtitleControllerCleanup,
    controllerInternals,
    setupInstalledVideoController,
} from './fixtures';

// The per-frame cue/karaoke sampler must be armed only while the bound video
// plays and cancelled on pause/destroy — a sampler left spinning on a paused or
// destroyed controller drains battery (the highest-risk regression of the sync
// fix). jsdom has no requestVideoFrameCallback, so this exercises the rAF path.
describe('SubtitlePlayerController frame-synced sampler lifecycle', () => {
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
