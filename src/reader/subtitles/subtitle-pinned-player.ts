// Pages routinely pin a PLAYING player to a corner of the viewport once the
// reader scrolls past it (YouTube's scroll dock is the loudest example, but any
// sticky player frame does the same). The visibility gate measures the frame's
// viewport box, and a dock is a perfectly visible box — so the overlay kept
// floating over the dock while the reader was three screens down in the
// comments. A paused player is never docked, which is why the bug only showed
// while playing.
//
// The distinction that matters is the one the annotation layer already draws
// between document space and viewport space: a frame that stops moving with the
// document has been pinned. Track the frame's last known in-flow position in
// document space and, once it is pinned, judge visibility from where the frame
// WOULD be rather than from where the page parked it. A frame that never had an
// in-flow position (a mini-player the reader deliberately opened) never gets an
// anchor, so it keeps its overlay.

// Sub-pixel jitter and rounding move a frame by a pixel or two per pass without
// meaning anything; anything larger is either a real relayout or a pin.
const PINNED_FRAME_DRIFT_TOLERANCE = 8;

type InFlowAnchor = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type FramePinning = 'fixed' | 'sticky' | 'none';

export class SubtitlePinnedPlayerTracker {
    private anchored?: HTMLVideoElement;

    private anchor?: InFlowAnchor;

    private pinned = false;

    private pinnedSample?: { top: number; scrollY: number };

    reset(): void {
        this.anchored = undefined;
        this.anchor = undefined;
        this.pinned = false;
        this.pinnedSample = undefined;
    }

    // Called once per alignment pass with the frame box the gate is about to
    // judge, so the anchor is refreshed from the same measurement the layout
    // uses and cannot drift out of step with it.
    observe(video: HTMLVideoElement | undefined, rect: DOMRect, suspended = false): void {
        if (!video || suspended) {
            this.reset();
            return;
        }
        if (video !== this.anchored) {
            this.reset();
            this.anchored = video;
        }
        const documentRect = toDocumentSpace(video, rect);
        if (!this.anchor) {
            // A frame that is already pinned has no in-flow position to remember,
            // and anchoring one would let a mini-player the reader deliberately
            // opened be mistaken later for a scroll dock.
            if (framePinning(video) !== 'fixed') this.anchor = documentRect;
            this.pinned = false;
            return;
        }
        // Holding still in document space is what "scrolls with the page" means,
        // and it is also the cheap answer: only a frame that has left its
        // remembered place is worth a computed-style walk.
        if (Math.abs(documentRect.top - this.anchor.top) <= PINNED_FRAME_DRIFT_TOLERANCE) {
            this.anchor = documentRect;
            this.pinned = false;
            this.pinnedSample = undefined;
            return;
        }
        // Only a pinned ancestor can hold a frame back against the scroll; for
        // anything else the page simply relaid out and the new box is the truth.
        if (framePinning(video) === 'none') {
            this.anchor = documentRect;
            this.pinned = false;
            this.pinnedSample = undefined;
            return;
        }
        // A sticky ancestor reads as sticky whether or not it is currently
        // stuck, and the in-flow slot can move for good while the frame is
        // pinned (an ad above the player collapsing, a theater/responsive
        // reflow). Returning to the remembered anchor is then impossible and
        // the pin would latch forever with the overlay hidden over a fully
        // visible player. Motion tells the truth computed style cannot: a
        // pinned frame's document-space top follows the scroll one-for-one,
        // while a frame back in flow holds still through a scroll. When a real
        // scroll passes and the frame does not move in document space, it is
        // in flow again wherever it now sits — re-anchor there.
        const scrollY = scrollOffsetY(video.ownerDocument.defaultView);
        const previous = this.pinnedSample;
        this.pinnedSample = { top: documentRect.top, scrollY };
        if (previous
            && Math.abs(scrollY - previous.scrollY) > PINNED_FRAME_DRIFT_TOLERANCE
            && Math.abs(documentRect.top - previous.top) <= PINNED_FRAME_DRIFT_TOLERANCE) {
            this.anchor = documentRect;
            this.pinned = false;
            this.pinnedSample = undefined;
            return;
        }
        this.pinned = true;
    }

    // The box the visibility gate should judge: the live one normally, the
    // frame's in-flow box projected back into the viewport once it is pinned.
    visibilityRect(video: HTMLVideoElement | undefined, rect: DOMRect): DOMRect {
        if (!this.pinned || !this.anchor || !video || video !== this.anchored) return rect;
        const view = video.ownerDocument.defaultView;
        return new DOMRect(
            this.anchor.left - scrollOffsetX(view),
            this.anchor.top - scrollOffsetY(view),
            this.anchor.width,
            this.anchor.height,
        );
    }
}

function toDocumentSpace(video: HTMLVideoElement, rect: DOMRect): InFlowAnchor {
    const view = video.ownerDocument.defaultView;
    return {
        left: rect.left + scrollOffsetX(view),
        top: rect.top + scrollOffsetY(view),
        width: rect.width,
        height: rect.height,
    };
}

// The player frame is always an ancestor of the <video>, so walking up from the
// element covers every player topology without having to name one.
function framePinning(video: HTMLVideoElement): FramePinning {
    const document = video.ownerDocument;
    const view = document.defaultView;
    if (!view) return 'none';
    let sticky = false;
    let current: Element | null = video;
    while (current && current !== document.documentElement && current !== document.body) {
        const position = view.getComputedStyle(current).position;
        if (position === 'fixed') return 'fixed';
        if (position === 'sticky') sticky = true;
        current = composedParentElement(current);
    }
    return sticky ? 'sticky' : 'none';
}

function composedParentElement(element: Element): Element | null {
    const slot = (element as Element & { assignedSlot?: HTMLSlotElement | null }).assignedSlot;
    if (slot) return slot;
    const parent = element.parentNode;
    if (parent && parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        return (parent as ShadowRoot).host ?? null;
    }
    return element.parentElement;
}

function scrollOffsetX(view: Window | null): number {
    if (!view) return 0;
    return view.scrollX || view.pageXOffset || view.document?.documentElement?.scrollLeft || 0;
}

function scrollOffsetY(view: Window | null): number {
    if (!view) return 0;
    return view.scrollY || view.pageYOffset || view.document?.documentElement?.scrollTop || 0;
}
