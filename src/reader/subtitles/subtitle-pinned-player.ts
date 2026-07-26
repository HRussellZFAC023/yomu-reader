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
// in-flow position (a mini-player the reader deliberately opened at the top of
// the page) never gets an anchor, so it keeps its overlay.
//
// Two standing limits keep the projection honest. It may only ever HIDE a frame
// the page parked in view; it may never vouch for a frame that has left the
// viewport by some route this tracker cannot see (an inner scroller, a
// relayout), because that strands the subtitle box over whatever the reader is
// actually reading. And a frame that fills the viewport is a fullscreen of some
// kind, never a dock, whether or not the mechanism was one Yomu recognises.

// Sub-pixel jitter and rounding move a frame by a pixel or two per pass without
// meaning anything; anything larger is either a real relayout or a pin.
const PINNED_FRAME_DRIFT_TOLERANCE = 8;

// A box covering this much of the viewport in both axes cannot be a dock, which
// is by definition a shrunken box. Plenty of players promote their shell to
// cover the page with CSS alone and never call the Fullscreen API, so the
// controller's fullscreen flag cannot see that state; the geometry can.
const VIEWPORT_FILLING_RATIO = 0.85;

// A release has to hold over more than one pass. A single frame in which the
// dock's own viewport position moves against the scroll — a dock-in animation,
// deferred repositioning of fixed elements during momentum scrolling — reads
// exactly like a frame that settled back into the flow, and adopting the dock's
// own box as the anchor would put the overlay back over the dock.
const SETTLED_PASSES_FOR_RELEASE = 3;

// How long a pinning verdict is reused while the pin holds. The ancestor
// chain's `position` values change on discrete events, never continuously
// through a scroll, and the controller invalidates on those events.
const FRAME_PINNING_CACHE_TTL_MS = 250;

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

    // Where the frame settled in document space, the scroll position it settled
    // at, and how many passes it has held there — the release evidence.
    private settled?: { top: number; scrollY: number; passes: number };

    private pinningQuery?: { value: FramePinning; at: number };

    private sighted = false;

    reset(): void {
        this.anchored = undefined;
        this.anchor = undefined;
        this.sighted = false;
        this.pinningQuery = undefined;
        this.unpin();
    }

    // The ancestor chain's positioning only changes on discrete signals, which
    // the controller already tracks for the fullscreen host; take the same ones.
    invalidatePinning(): void {
        this.pinningQuery = undefined;
    }

    // Called once per alignment pass with the frame box the gate is about to
    // judge, so the anchor is refreshed from the same measurement the layout
    // uses and cannot drift out of step with it.
    observe(video: HTMLVideoElement | undefined, rect: DOMRect, suspended = false): void {
        if (!video) {
            this.reset();
            return;
        }
        if (video !== this.anchored) {
            this.reset();
            this.anchored = video;
        }
        const view = video.ownerDocument.defaultView;
        // Fullscreen measures the viewport rather than the frame's own slot, so
        // there is no in-flow position worth reading while it lasts — and a box
        // that fills the viewport is a fullscreen however the site got there.
        // Drop the pin but KEEP the remembered slot, so coming back out lands on
        // the anchor that was true before instead of on no anchor at all.
        if (suspended || fillsViewport(rect, view)) {
            this.unpin();
            return;
        }
        const documentRect = toDocumentSpace(rect, view);
        const scrollY = scrollOffsetY(view);
        const anchor = this.anchor ?? this.firstAnchorFor(video, documentRect, scrollY);
        if (!anchor) {
            this.unpin();
            return;
        }
        this.anchor = anchor;
        // Holding still in document space is what "scrolls with the page" means,
        // and it is also the cheap answer: only a frame that has left its
        // remembered place is worth a computed-style walk.
        if (Math.abs(documentRect.top - anchor.top) <= PINNED_FRAME_DRIFT_TOLERANCE) {
            this.anchor = documentRect;
            this.unpin();
            return;
        }
        // Only a pinned ancestor can hold a frame back against the scroll; for
        // anything else the page simply relaid out and the new box is the truth.
        if (this.framePinningVerdict(video) === 'none') {
            this.anchor = documentRect;
            this.unpin();
            return;
        }
        if (this.frameSettledBackIntoFlow(documentRect.top, scrollY)) {
            this.anchor = documentRect;
            this.unpin();
            return;
        }
        this.pinned = true;
    }

    // The box the visibility gate should judge: the live one normally, the
    // frame's in-flow box projected back into the viewport once it is pinned.
    visibilityRect(video: HTMLVideoElement | undefined, rect: DOMRect): DOMRect {
        if (!this.pinned || !this.anchor || !video || video !== this.anchored) return rect;
        const view = video.ownerDocument.defaultView;
        // The pin exists to hide a frame the page parked in view; it must never
        // claim more of the viewport than the live frame actually occupies. A
        // player whose slot leaves the viewport without a window scroll — an
        // inner scroller, a relayout — would otherwise be reported as visible
        // and strand the subtitle box over the content the reader is reading.
        if (!meetsViewport(rect, view)) return rect;
        return new DOMRect(
            this.anchor.left - scrollOffsetX(view),
            this.anchor.top - scrollOffsetY(view),
            this.anchor.width,
            this.anchor.height,
        );
    }

    // The in-flow position to remember for a frame that has none yet, or
    // nothing for the one frame that must keep its overlay: a mini-player the
    // reader opened while the page was at the top.
    private firstAnchorFor(video: HTMLVideoElement, documentRect: InFlowAnchor, scrollY: number): InFlowAnchor | undefined {
        const firstSight = !this.sighted;
        this.sighted = true;
        if (this.framePinningVerdict(video) !== 'fixed') return documentRect;
        // A frame that was ALREADY pinned when the tracker first saw it — a
        // reload deep in the comments, a video rebind, the exit from a
        // fullscreen round trip — has no remembered slot, and refusing to
        // anchor it left the reported bug alive on exactly those paths. Being
        // pinned while the page is already scrolled is the evidence that the
        // page docked it as the reader scrolled past. Players live at the top
        // of their page, so that is where the missing slot is assumed to be;
        // the first pass that sees the frame back in flow replaces the
        // assumption with the truth, and a small scroll leaves the assumed slot
        // on screen, so nothing is hidden until the reader has actually scrolled
        // past a player-sized box.
        if (!firstSight || scrollY <= 0) return undefined;
        return { left: documentRect.left, top: 0, width: documentRect.width, height: documentRect.height };
    }

    // A sticky ancestor reads as sticky whether or not it is currently stuck,
    // and the in-flow slot can move for good while the frame is pinned (an ad
    // above the player collapsing, a theater/responsive reflow). Returning to
    // the remembered anchor is then impossible and the pin would latch forever
    // with the overlay hidden over a fully visible player. Motion tells the
    // truth computed style cannot: a pinned frame's document-space top follows
    // the scroll one-for-one, while a frame back in flow holds still through a
    // scroll. Comparing adjacent passes made that answer depend on how fast the
    // reader scrolls — a trackpad, a momentum tail or smooth scrolling delivers
    // a few pixels per animation frame and never cleared the tolerance in one
    // pass, so the pin survived scrolls of any length. Measure the scroll that
    // has accumulated since the frame settled where it now sits instead, which
    // makes the release scale-free.
    private frameSettledBackIntoFlow(top: number, scrollY: number): boolean {
        const settled = this.settled;
        if (!settled || Math.abs(top - settled.top) > PINNED_FRAME_DRIFT_TOLERANCE) {
            this.settled = { top, scrollY, passes: 1 };
            return false;
        }
        settled.passes += 1;
        return settled.passes >= SETTLED_PASSES_FOR_RELEASE
            && Math.abs(scrollY - settled.scrollY) > PINNED_FRAME_DRIFT_TOLERANCE;
    }

    // Re-confirming a pin that already holds is the sustained cost: a docked
    // player is re-judged on every animation frame for as long as the reader
    // keeps reading, and an ancestor walk resolves live styles for the whole
    // chain. Only that repeat question is served from the cache — the verdict
    // that decides whether to pin in the first place stays authoritative.
    private framePinningVerdict(video: HTMLVideoElement): FramePinning {
        const cached = this.pinningQuery;
        if (this.pinned && cached && performance.now() - cached.at < FRAME_PINNING_CACHE_TTL_MS) return cached.value;
        const value = framePinning(video);
        this.pinningQuery = { value, at: performance.now() };
        return value;
    }

    private unpin(): void {
        this.pinned = false;
        this.settled = undefined;
    }
}

function toDocumentSpace(rect: DOMRect, view: Window | null): InFlowAnchor {
    return {
        left: rect.left + scrollOffsetX(view),
        top: rect.top + scrollOffsetY(view),
        width: rect.width,
        height: rect.height,
    };
}

function fillsViewport(rect: DOMRect, view: Window | null): boolean {
    const width = viewportWidth(view);
    const height = viewportHeight(view);
    if (width <= 0 || height <= 0) return false;
    const visibleWidth = Math.min(rect.right, width) - Math.max(rect.left, 0);
    const visibleHeight = Math.min(rect.bottom, height) - Math.max(rect.top, 0);
    return visibleWidth >= width * VIEWPORT_FILLING_RATIO && visibleHeight >= height * VIEWPORT_FILLING_RATIO;
}

function meetsViewport(rect: DOMRect, view: Window | null): boolean {
    const width = viewportWidth(view);
    const height = viewportHeight(view);
    if (width <= 0 || height <= 0) return true;
    return rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height;
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

function viewportWidth(view: Window | null): number {
    if (!view) return 0;
    return view.innerWidth || view.document?.documentElement?.clientWidth || 0;
}

function viewportHeight(view: Window | null): number {
    if (!view) return 0;
    return view.innerHeight || view.document?.documentElement?.clientHeight || 0;
}

function scrollOffsetX(view: Window | null): number {
    if (!view) return 0;
    return view.scrollX || view.pageXOffset || view.document?.documentElement?.scrollLeft || 0;
}

function scrollOffsetY(view: Window | null): number {
    if (!view) return 0;
    return view.scrollY || view.pageYOffset || view.document?.documentElement?.scrollTop || 0;
}
