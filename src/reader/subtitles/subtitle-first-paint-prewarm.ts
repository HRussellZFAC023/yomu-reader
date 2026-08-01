import { promiseWithTimeout } from '../core/async-utils';
import { findActiveSubtitleCue, findInitialLeadInCue, type SubtitleCue } from './subtitle-cues';

const FIRST_PAINT_PREWARM_BUDGET_MS = 1200;

export interface SubtitleFirstPaintPrewarmOptions {
    cues: SubtitleCue[];
    currentTime: number;
    parse(text: string): Promise<unknown>;
    isCurrent(): boolean;
}

// Prepare the visible cue before its successor so both cannot compete for the
// shared public-lookup queue. The bounded wait preserves subtitle timing when
// the active parse rejects or a provider stalls.
export async function prewarmSubtitleFirstPaint(options: SubtitleFirstPaintPrewarmOptions): Promise<boolean> {
    const activeCue = findActiveSubtitleCue(options.cues, options.currentTime)
        ?? findInitialLeadInCue(options.cues, options.currentTime);
    let activeIndex = activeCue ? options.cues.indexOf(activeCue) : -1;
    if (activeIndex < 0) activeIndex = options.cues.findIndex(cue => cue.end >= options.currentTime);
    const activeText = options.cues[activeIndex]?.text.trim();
    if (!activeText) return options.isCurrent();

    await promiseWithTimeout(
        options.parse(activeText),
        FIRST_PAINT_PREWARM_BUDGET_MS,
        'Subtitle first-paint prewarm timed out.',
    ).catch(() => undefined);
    if (!options.isCurrent()) return false;

    const nextText = options.cues[activeIndex + 1]?.text.trim();
    if (nextText) void options.parse(nextText).catch(() => undefined);
    return true;
}
