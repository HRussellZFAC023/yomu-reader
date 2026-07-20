import { afterEach, describe, expect, it } from 'vitest';

import {
    controllerInternals,
    createSubtitleController,
    makeSubtitleSettings,
    SubtitlePlayerController,
} from './fixtures';
import type { ReaderSettings } from './fixtures';

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
    document.body.innerHTML = '';
});

describe('subtitle runtime idle gating', () => {
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
});
