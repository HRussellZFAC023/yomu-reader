/**
 * When a scheduled hover lookup is allowed to run.
 *
 * Both hover schedulers (annotated word, and pointer text on an unannotated
 * surface) deliberately ignore the learner's hover-open delay once a hover
 * popover is already on screen, so that re-anchoring to the next word reads as
 * instant rather than as a second deliberate hover. They did that by hardcoding a
 * delay of zero, and a zero delay means no timer is armed at all — which in turn
 * means the retarget path that supersedes a pending lookup with a newer word had
 * nothing to retarget.
 *
 * Measured with an instrumented sweep across a sentence, popover already open:
 * the pointer crossed 11 further words and started 11 full lookups, every one at
 * delay 0. Ten of them were words the pointer merely passed through. Each is a
 * parse plus a dictionary read plus a card render, and the in-flight generation
 * check only discards the RESULT — the work is already spent by then.
 *
 * The switch therefore gets a coalescing floor instead of zero. It is not a
 * dwell delay: it exists only so the next pointer sample can supersede a word
 * the pointer is passing over, which is what collapses a sweep into one lookup
 * on the word the pointer actually stops on. 50ms is under the ~100ms at which a
 * UI response stops being read as immediate, and well under one pointer-sweep
 * word crossing.
 *
 * The FIRST open is untouched: that delay is the learner's `hoverOpenDelayMs`
 * setting, whose default of zero is a deliberate product choice.
 */
const HOVER_ANCHOR_SWITCH_COALESCE_MS = 50;

export interface HoverLookupDelayInput {
    /** A hover popover is on screen and this lookup would move its anchor. */
    readonly switchesAnchor: boolean;
    /** The learner's configured hover-open delay, in milliseconds. */
    readonly hoverOpenDelayMs: number;
    /** A caller-imposed floor, such as the popover-transit settle delay. */
    readonly minimumDelayMs?: number;
}

export function hoverLookupScheduleDelay(input: HoverLookupDelayInput): number {
    const normal = input.switchesAnchor
        ? HOVER_ANCHOR_SWITCH_COALESCE_MS
        : Math.max(0, input.hoverOpenDelayMs);
    return Math.max(normal, input.minimumDelayMs ?? 0);
}
