import { afterEach, describe, expect, it } from 'vitest';
import {
    attachVideo,
    controllerInternals,
    createInstalledSubtitleController,
    mockElementRect,
    registerSubtitleControllerCleanup,
    withViewport,
    SubtitlePlayerController,
} from './fixtures';

const IN_FLOW_PLAYER_RECT = new DOMRect(140, 80, 720, 600);
// What a page parks in the corner once the reader scrolls past a playing player.
const DOCKED_PLAYER_RECT = new DOMRect(560, 500, 400, 225);

const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');

function setPageScrollY(value: number): void {
    Object.defineProperty(window, 'scrollY', { configurable: true, value });
}

function restorePageScrollY(): void {
    if (originalScrollY) Object.defineProperty(window, 'scrollY', originalScrollY);
    else delete (window as unknown as { scrollY?: number }).scrollY;
}

function setupDockablePlayer(rect: DOMRect): {
    align: () => void;
    controller: SubtitlePlayerController;
    root: HTMLElement;
    shell: HTMLElement;
    video: HTMLVideoElement;
} {
    document.body.innerHTML = '<div id="player-shell"><video id="player" controls></video></div>';
    const shell = document.querySelector<HTMLElement>('#player-shell')!;
    const video = document.querySelector<HTMLVideoElement>('#player')!;
    const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
    attachVideo(controller, { video, rect });
    controller.refresh();
    const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
    const align = controllerInternals<{ alignToVideo: () => void }>(controller).alignToVideo.bind(controller);
    return { align, controller, root, shell, video };
}

function overlayHidden(root: HTMLElement): boolean {
    return root.classList.contains('jpdb-subtitle-video-out-of-view');
}

// A page only docks a player it is still playing, which is why the report only
// ever saw the stranded overlay while playing.
function markPlaying(video: HTMLVideoElement): void {
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
}

describe('SubtitlePlayerController — overlay visibility for pinned players', () => {
    registerSubtitleControllerCleanup();

    afterEach(() => {
        restorePageScrollY();
        document.body.innerHTML = '';
    });

    it('keeps the overlay while the player is genuinely in view', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);

            try {
                align();

                expect(overlayHidden(root)).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });

    it('hides the overlay when the reader scrolls past a paused player', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, video } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);

            try {
                align();

                expect(overlayHidden(root)).toBe(false);

                setPageScrollY(700);
                mockElementRect(video, new DOMRect(140, -620, 720, 600));
                align();

                expect(overlayHidden(root)).toBe(true);
            } finally {
                controller.destroy();
            }
        });
    });

    it('hides the overlay when the page docks a playing player into the viewport', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, shell, video } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);
            markPlaying(video);

            try {
                align();

                expect(overlayHidden(root)).toBe(false);

                setPageScrollY(700);
                shell.style.position = 'fixed';
                mockElementRect(video, DOCKED_PLAYER_RECT);
                align();

                expect(overlayHidden(root)).toBe(true);
            } finally {
                controller.destroy();
            }
        });
    });

    it('hides the overlay when a sticky player sticks as the reader scrolls past it', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, shell, video } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);
            shell.style.position = 'sticky';
            markPlaying(video);

            try {
                align();

                expect(overlayHidden(root)).toBe(false);

                setPageScrollY(700);
                mockElementRect(video, new DOMRect(140, 0, 720, 600));
                align();

                expect(overlayHidden(root)).toBe(true);
            } finally {
                controller.destroy();
            }
        });
    });

    // A sticky ancestor reads as sticky whether or not it is currently stuck,
    // and the in-flow slot can move for good while the frame is pinned (an ad
    // above the player collapsing). If the pin could only be released by the
    // frame returning to its REMEMBERED anchor, it would latch forever and the
    // overlay would stay hidden over a fully visible, unstuck player. Motion is
    // the tell: a frame that holds still in document space through a real
    // scroll is back in flow, wherever it now sits.
    it('recovers the overlay after the in-flow slot moves while a sticky player is stuck', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, shell, video } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);
            shell.style.position = 'sticky';
            markPlaying(video);

            try {
                align();
                expect(overlayHidden(root)).toBe(false);

                // Stuck at the viewport top while the reader scrolls past.
                setPageScrollY(700);
                mockElementRect(video, new DOMRect(140, 0, 720, 600));
                align();
                expect(overlayHidden(root)).toBe(true);

                // Content above the player collapsed: the slot moved for good.
                // The reader scrolls back up and the UNSTUCK player is fully on
                // screen at its new in-flow position — document-space top holds
                // still (1300) across a real scroll, which is the release.
                setPageScrollY(1200);
                mockElementRect(video, new DOMRect(140, 100, 720, 600));
                align();
                setPageScrollY(1100);
                mockElementRect(video, new DOMRect(140, 200, 720, 600));
                align();

                expect(overlayHidden(root)).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });

    it('keeps the overlay for a player the page pinned before it was ever in flow', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, shell, video } = setupDockablePlayer(DOCKED_PLAYER_RECT);
            shell.style.position = 'fixed';
            markPlaying(video);

            try {
                align();

                expect(overlayHidden(root)).toBe(false);

                setPageScrollY(700);
                align();

                expect(overlayHidden(root)).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });

    it('restores the overlay when a docked player returns to its in-flow position', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, shell, video } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);
            markPlaying(video);

            try {
                align();
                setPageScrollY(700);
                shell.style.position = 'fixed';
                mockElementRect(video, DOCKED_PLAYER_RECT);
                align();

                expect(overlayHidden(root)).toBe(true);

                setPageScrollY(0);
                shell.style.position = '';
                mockElementRect(video, IN_FLOW_PLAYER_RECT);
                align();

                expect(overlayHidden(root)).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });

    it('keeps the overlay when the page relays a still-visible player out without scrolling', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, video } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);

            try {
                align();

                mockElementRect(video, new DOMRect(140, 190, 720, 600));
                align();

                expect(overlayHidden(root)).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });
});
