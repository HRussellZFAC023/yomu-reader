/**
 * A coalesced post-paint pass: many callers ask for one, it runs once on the
 * next frame.
 *
 * The naive shape — a module-level `if (pendingFrame) return;` around a bare
 * `requestAnimationFrame` — has two ways to latch PERMANENTLY, and each one
 * silently freezes the pass for the rest of the page's life rather than failing:
 *
 * 1. **A frame nobody can clear.** The latch is only ever reset from inside its
 *    own callback, so once a frame is armed against a scheduler that then goes
 *    away — a realm the host swapped out, a userscript manager handing the page
 *    over from the sandbox to the page world, an SPA shim replacing
 *    `requestAnimationFrame` — the callback can never run and the latch stays
 *    set. Every later request is dropped as "already pending".
 * 2. **A frame that was never armed.** `requestAnimationFrame` invoked as a FREE
 *    function reaches Gecko's WebIDL binding with no Window receiver and throws
 *    `'requestAnimationFrame' called on an object that does not implement
 *    interface Window` inside a Firefox userscript-manager sandbox. The throw
 *    escapes into whatever scheduled the pass — a mutation-observer callback, a
 *    scroll handler — and takes the rest of that work with it.
 *
 * So the frame is always requested as a method on its window, and the latch
 * remembers the exact scheduler that owes it a callback: a request routed
 * through a DIFFERENT scheduler arms its own frame instead of being swallowed by
 * a latch that scheduler can never clear. Coalescing is unchanged while the page
 * keeps one scheduler, which is the whole steady-state case. A realm with no
 * animation frames at all (an embedded webview, a sandboxed frame) has nothing
 * to wait for, so its pass runs inline.
 *
 * Extra frames are harmless by construction: the pass drains its own work up
 * front, so a redundant callback finds nothing to do.
 */
type FrameScheduler = (callback: FrameRequestCallback) => number;

export interface PostPaintPass {
    /**
     * Ask for a pass on `view`'s next paint. Repeated calls before that paint
     * coalesce into one run.
     */
    schedule(view: Window | null | undefined): void;
}

export function createPostPaintPass(run: () => void): PostPaintPass {
    let pendingScheduler: FrameScheduler | null = null;
    const flush = (): void => {
        pendingScheduler = null;
        run();
    };
    return {
        schedule(view) {
            const request = view?.requestAnimationFrame as FrameScheduler | undefined;
            if (typeof request !== 'function') {
                flush();
                return;
            }
            if (pendingScheduler === request) return;
            const previous = pendingScheduler;
            // Armed before the call so a scheduler that runs its callback
            // synchronously still clears the latch through flush().
            pendingScheduler = request;
            try {
                request.call(view, flush);
            } catch (error) {
                // Nothing was armed, so nothing would ever clear this latch.
                if (pendingScheduler === request) pendingScheduler = previous;
                throw error;
            }
        },
    };
}

/** The realm a node belongs to — the only window that can honour its frames. */
export function viewForNode(node: Node | null | undefined): Window | null {
    if (!node) return null;
    const document = node.nodeType === Node.DOCUMENT_NODE ? node as Document : node.ownerDocument;
    return document?.defaultView ?? null;
}
