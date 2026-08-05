/**
 * The one owner of *when* a hover popover closes: the close deadline, and the poll
 * that notices departures the DOM never dispatched an event for.
 *
 * The close used to be a bare timer that every caller re-created — the scheduler
 * cleared whatever was pending and armed a fresh delay. One of its callers is the
 * coalesced pointermove path, which runs once per animation frame for as long as the
 * pointer is off the hover surfaces, so a frame arriving every ~16ms reset any
 * configured delay longer than a frame before it could elapse: while the hand kept
 * moving, the close timer never fired at all. What actually closed the panel was the
 * watchdog below, whose phase is fixed at mount time and has nothing to do with when
 * the pointer left. Measured on 1.8.85 with the close delay set to 600ms, four
 * gestures closed at 178ms, 221ms, 407ms and 441ms — every one of them dismissed from
 * the watchdog tick, not one from the close timer.
 *
 * Hence: the deadline is MONOTONIC. The first departure owns it and a re-arm can only
 * bring it earlier, never push it out. That is what makes the observable latency the
 * learner's configured delay rather than a slice of a poll period, and it is why the
 * per-frame re-arm is now harmless instead of load-bearing.
 *
 * Cancelling stays explicit and unconditional: it is how the paths that mean "the
 * pointer is back on a hover surface" (re-entering the panel, re-hovering the word, a
 * new lookup taking over) release a close. None of the v1.8.80 anti-spontaneous-close
 * guarantees move — the pointer latch, the position lock and the transit corridor all
 * live in the host's hover-context test, which still gets the last word when the
 * deadline lands.
 */

/** Which signals the hover-context test may not trust for this particular question. */
export interface HoverContextQuery {
    /** The CSS `:hover` state is stale or absent (Firefox clears it mid-scroll). */
    readonly ignoreCssHover?: boolean;
    /** The last known pointer point is a stale sample of a DOM that re-rendered. */
    readonly ignorePointerPosition?: boolean;
}

/**
 * How often the watchdog re-asks whether the pointer is still in the hover context.
 * It used to be `max(90, hoverCloseDelayMs)`, where the delay term existed only so the
 * poll could not dismiss before the configured delay had passed — now the scheduler's
 * job, which leaves the floor as the whole rule. A fixed period also means a learner
 * who raised their close delay no longer waits a whole delay for the poll to notice a
 * departure whose exit event the DOM swallowed.
 */
export const HOVER_WATCH_PERIOD_MS = 90;

export interface HoverCloseHost {
    /** A hover-mode popover is the active one. Nothing here applies to a modal. */
    isHoverPopoverActive(): boolean;
    /** The learner's configured hover close delay, in milliseconds. */
    closeDelayMs(): number;
    /** The pointer is still on the word, the panel, or the corridor between them. */
    isHoverContextActive(query: HoverContextQuery): boolean;
    /** Take the panel down. Called only after isHoverContextActive said no. */
    close(): void;
}

/** Injected so this is testable without a DOM and without patching globals. */
export interface HoverCloseTimers {
    now(): number;
    setTimeout(handler: () => void, delayMs: number): number;
    clearTimeout(handle: number | undefined): void;
}

export const domHoverCloseTimers: HoverCloseTimers = {
    now: () => Date.now(),
    setTimeout: (handler, delayMs) => window.setTimeout(handler, delayMs),
    clearTimeout: handle => window.clearTimeout(handle),
};

export class HoverCloseController {
    private closeTimer?: number;
    private deadline = 0;
    private watchTimer?: number;

    constructor(private readonly timers: HoverCloseTimers, private readonly host: HoverCloseHost) {}

    get pending(): boolean {
        return this.closeTimer !== undefined;
    }

    /** Milliseconds until the armed close, or undefined when none is armed. */
    get remainingMs(): number | undefined {
        return this.pending ? Math.max(0, this.deadline - this.timers.now()) : undefined;
    }

    /**
     * Ask for the popover to close in `delayMs`. Earliest deadline wins, so the repeat
     * arming a moving pointer produces is a no-op rather than an extension.
     */
    arm(delayMs: number, query: HoverContextQuery = {}): void {
        const delay = Math.max(0, delayMs);
        const deadline = this.timers.now() + delay;
        if (this.pending && deadline >= this.deadline) return;
        this.timers.clearTimeout(this.closeTimer);
        this.deadline = deadline;
        this.closeTimer = this.timers.setTimeout(() => {
            this.closeTimer = undefined;
            if (!this.host.isHoverPopoverActive() || this.host.isHoverContextActive(query)) return;
            this.host.close();
        }, delay);
    }

    cancel(): void {
        this.timers.clearTimeout(this.closeTimer);
        this.closeTimer = undefined;
        this.deadline = 0;
    }

    /**
     * Start watching for a departure no exit event reported — a re-render can detach
     * the node the pointer was over before the browser dispatches its pointerleave, and
     * a hover popover would then have nothing left to close it.
     *
     * The watchdog only ARMS the close, and keeps polling either way. It used to
     * dismiss on the spot, which is how it ended up deciding close latency instead of
     * merely detecting the departure. Arming is strictly less eager to close than
     * dismissing was, because the deadline re-checks the hover context before acting.
     */
    startWatch(): void {
        this.stopWatch();
        const tick = () => {
            this.watchTimer = undefined;
            if (!this.host.isHoverPopoverActive()) return;
            // ignorePointerPosition asking, ignoreCssHover arming: the poll distrusts
            // the stale pointer sample, and the close it schedules distrusts the CSS
            // state, which is what a mid-scroll :hover clear corrupts.
            if (!this.host.isHoverContextActive({ ignorePointerPosition: true })) {
                this.arm(this.host.closeDelayMs(), { ignoreCssHover: true });
            }
            this.watchTimer = this.timers.setTimeout(tick, HOVER_WATCH_PERIOD_MS);
        };
        this.watchTimer = this.timers.setTimeout(tick, HOVER_WATCH_PERIOD_MS);
    }

    stopWatch(): void {
        this.timers.clearTimeout(this.watchTimer);
        this.watchTimer = undefined;
    }

    /** Both timers, for teardown paths that drop the popover entirely. */
    stop(): void {
        this.cancel();
        this.stopWatch();
    }
}
