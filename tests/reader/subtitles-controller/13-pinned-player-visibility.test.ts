import { afterEach, describe, expect, it, vi } from 'vitest';
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
                // still (1300) across a real scroll, which is the release. A
                // real scroll delivers a frame per animation frame and the
                // release is confirmed across them, so drive it as one.
                setPageScrollY(1200);
                mockElementRect(video, new DOMRect(140, 100, 720, 600));
                align();
                setPageScrollY(1150);
                mockElementRect(video, new DOMRect(140, 150, 720, 600));
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

    // Plenty of players promote their shell to cover the page with CSS alone
    // ("web fullscreen"/theater buttons that never call the Fullscreen API), so
    // the controller's fullscreen flag cannot see that state. Read as a dock it
    // would black out the overlay over a video that now fills the screen — and
    // the page usually cannot be scrolled in that state, so nothing would bring
    // it back. A viewport-filling box is a fullscreen of some kind; a dock is by
    // definition a shrunken one.
    it('keeps the overlay when a docked player is promoted to a CSS-only web fullscreen', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, shell, video } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);
            markPlaying(video);

            try {
                align();

                setPageScrollY(1500);
                shell.style.position = 'fixed';
                mockElementRect(video, DOCKED_PLAYER_RECT);
                align();

                expect(overlayHidden(root)).toBe(true);

                mockElementRect(video, new DOMRect(0, 0, 1000, 800));
                align();

                expect(overlayHidden(root)).toBe(false);

                // The reader cannot scroll out of it either: it must stay shown.
                align();

                expect(overlayHidden(root)).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });

    // The pin may only ever hide a frame the page parked in view; it must never
    // vouch for a frame that has left the viewport by a route the window scroll
    // cannot see (an inner scroller, a relayout), because the layout follows the
    // LIVE box and would park the subtitle box over the content being read.
    it('hides the overlay when a stuck player leaves the viewport without a window scroll', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, shell, video } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);
            shell.style.position = 'sticky';
            markPlaying(video);

            try {
                align();

                expect(overlayHidden(root)).toBe(false);

                // An inner scroll pane carried the player far above the viewport
                // while the window itself never moved.
                mockElementRect(video, new DOMRect(140, -1400, 720, 600));
                align();

                expect(overlayHidden(root)).toBe(true);

                // And it comes back when the pane brings the player back.
                mockElementRect(video, IN_FLOW_PLAYER_RECT);
                align();

                expect(overlayHidden(root)).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });

    // A reload deep in the comments (or any rebind taken while scrolled past)
    // gives the tracker its first look at a player the page has ALREADY docked.
    // Refusing to anchor that frame left the reported bug alive on exactly those
    // paths; being pinned while the page is already scrolled is the evidence
    // that this is a scroll dock and not a mini-player opened on purpose.
    it('hides the overlay for a player first seen while the page already docked it', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(900);
            const { align, controller, root, shell, video } = setupDockablePlayer(DOCKED_PLAYER_RECT);
            shell.style.position = 'fixed';
            markPlaying(video);

            try {
                align();

                expect(overlayHidden(root)).toBe(true);
            } finally {
                controller.destroy();
            }
        });
    });

    it('keeps a docked player hidden across a fullscreen round trip', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, shell, video } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);
            markPlaying(video);
            const internals = controllerInternals<{ fullscreen: boolean }>(controller);

            try {
                align();

                setPageScrollY(700);
                shell.style.position = 'fixed';
                mockElementRect(video, DOCKED_PLAYER_RECT);
                align();

                expect(overlayHidden(root)).toBe(true);

                // Fullscreen measures the viewport, so the frame's own box says
                // nothing while it lasts — but the slot it came from is still
                // true when the reader drops back onto the dock.
                internals.fullscreen = true;
                mockElementRect(video, new DOMRect(0, 0, 1000, 800));
                align();
                internals.fullscreen = false;
                mockElementRect(video, DOCKED_PLAYER_RECT);
                align();

                expect(overlayHidden(root)).toBe(true);
            } finally {
                controller.destroy();
            }
        });
    });

    // Where the player belongs is still true while fullscreen lasts, so the
    // round trip must not cost the tracker that memory: a player whose slot the
    // reader has NOT yet scrolled past keeps its overlay, dock or no dock.
    it('remembers where a docked player belongs across a fullscreen round trip', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const deepSlot = new DOMRect(140, 900, 720, 600);
            const { align, controller, root, shell, video } = setupDockablePlayer(deepSlot);
            markPlaying(video);
            const internals = controllerInternals<{ fullscreen: boolean }>(controller);

            try {
                align();

                // Scrolled just past the top of the slot — most of it is still on
                // screen — and the page docks the player anyway.
                setPageScrollY(1000);
                shell.style.position = 'fixed';
                mockElementRect(video, DOCKED_PLAYER_RECT);
                align();

                expect(overlayHidden(root)).toBe(false);

                internals.fullscreen = true;
                mockElementRect(video, new DOMRect(0, 0, 1000, 800));
                align();
                internals.fullscreen = false;
                mockElementRect(video, DOCKED_PLAYER_RECT);
                align();

                expect(overlayHidden(root)).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });

    // A trackpad, a momentum tail and smooth scrolling all deliver a few pixels
    // per animation frame. Judging the release on one frame's scroll delta made
    // it unreachable at those speeds, so a player whose slot had moved for good
    // stayed hidden however far the reader scrolled.
    it('releases a mis-pinned player under slow scrolling, not just a flick', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, shell, video } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);
            shell.style.position = 'sticky';
            markPlaying(video);

            try {
                align();

                setPageScrollY(700);
                mockElementRect(video, new DOMRect(140, 0, 720, 600));
                align();

                expect(overlayHidden(root)).toBe(true);

                // The slot moved for good; the player is unstuck and fully on
                // screen, and the reader scrolls 5px per animation frame.
                let scrollY = 700;
                let top = 100;
                for (let pass = 0; pass < 12; pass += 1) {
                    scrollY += 5;
                    top -= 5;
                    setPageScrollY(scrollY);
                    mockElementRect(video, new DOMRect(140, top, 720, 600));
                    align();
                }

                expect(overlayHidden(root)).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });

    // A dock that moves in the viewport for its own reasons (a dock-in
    // animation, deferred repositioning during momentum scrolling) can hold
    // still in document space for a single frame, which reads exactly like a
    // frame that settled back into the flow. Adopting the dock's own box as the
    // anchor would put the overlay straight back over the dock.
    it('does not release the pin on a single frame where the dock moves against the scroll', () => {
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

                // The page scrolls 20px while the dock slides 20px up the
                // viewport: its document-space top is unchanged.
                setPageScrollY(720);
                mockElementRect(video, new DOMRect(560, 480, 400, 225));
                align();

                expect(overlayHidden(root)).toBe(true);

                setPageScrollY(760);
                align();

                expect(overlayHidden(root)).toBe(true);
            } finally {
                controller.destroy();
            }
        });
    });

    // Re-confirming an established pin is the sustained cost: a docked player is
    // re-judged on every animation frame for as long as the reader keeps
    // reading, and each judgement resolved live styles for the whole ancestor
    // chain. Positioning changes on discrete events, never continuously through
    // a scroll, so the verdict outlives the frame that produced it.
    it('does not walk the ancestor chain on every frame while the player stays docked', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, shell, video } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);
            markPlaying(video);
            const computedStyle = vi.spyOn(window, 'getComputedStyle');

            try {
                align();

                setPageScrollY(700);
                shell.style.position = 'fixed';
                mockElementRect(video, DOCKED_PLAYER_RECT);
                align();

                expect(overlayHidden(root)).toBe(true);

                computedStyle.mockClear();
                for (let pass = 0; pass < 12; pass += 1) {
                    setPageScrollY(700 + pass * 40);
                    align();
                }

                const shellWalks = computedStyle.mock.calls.filter(([element]) => element === shell).length;

                expect(shellWalks).toBeLessThanOrEqual(1);
                expect(overlayHidden(root)).toBe(true);
            } finally {
                computedStyle.mockRestore();
                controller.destroy();
            }
        });
    });

    // The cached verdict must never outlive a signal that can move the player in
    // its ancestor chain, or a player the page hands back to the flow would stay
    // judged as pinned until the cache aged out.
    it('re-reads the player topology after a refresh when the page hands it back to the flow', () => {
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

                // Un-docked into a slot that is not the remembered one, so only
                // a fresh look at the chain can tell the pin is over.
                shell.style.position = '';
                mockElementRect(video, new DOMRect(140, 100, 720, 600));
                controller.refresh();
                align();

                expect(overlayHidden(root)).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });

    // The app destroys and re-inits this controller in place, so a remembered
    // frame would keep the detached media element alive and judge the next one
    // against a dead anchor.
    it('forgets the tracked player on destroy', () => {
        withViewport(1000, 800, () => {
            setPageScrollY(0);
            const { align, controller, root, shell, video } = setupDockablePlayer(IN_FLOW_PLAYER_RECT);
            markPlaying(video);
            const tracker = controllerInternals<{
                pinnedPlayer: { visibilityRect: (video: HTMLVideoElement, rect: DOMRect) => DOMRect };
            }>(controller).pinnedPlayer;

            try {
                align();
                setPageScrollY(700);
                shell.style.position = 'fixed';
                mockElementRect(video, DOCKED_PLAYER_RECT);
                align();

                expect(overlayHidden(root)).toBe(true);
                expect(tracker.visibilityRect(video, DOCKED_PLAYER_RECT)).not.toBe(DOCKED_PLAYER_RECT);

                controller.destroy();

                expect(tracker.visibilityRect(video, DOCKED_PLAYER_RECT)).toBe(DOCKED_PLAYER_RECT);
                expect((tracker as unknown as { anchored?: HTMLVideoElement }).anchored).toBeUndefined();
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
