import { SUBTITLE_CUE_BOUNDARY_PADDING_SECONDS, type SubtitleCue } from './subtitle-cues';

export const SUBTITLE_PENDING_PAINT_BUDGET_MS = 1200;

/** Playback can advance while parsing; caption actions belong to the painted pair. */
export class SubtitlePaintCommit {
    private requested?: SubtitleCue;
    private pendingSince?: number;
    private pending = false;
    pair?: { primary: SubtitleCue; secondary?: SubtitleCue };

    advance(cue: SubtitleCue, now = performance.now()): boolean {
        const previous = this.requested;
        this.requested = cue;
        // Follow every observed boundary, including cues that never painted.
        // A backward jump or a real silence cannot inherit an old frame.
        const contiguous = Boolean(this.pair && !this.pending && previous && previous.start <= cue.start
            && previous.end >= cue.start - SUBTITLE_CUE_BOUNDARY_PADDING_SECONDS);
        if (!contiguous) return false;
        this.pendingSince ??= now;
        return now - this.pendingSince < SUBTITLE_PENDING_PAINT_BUDGET_MS;
    }

    commit(primary: SubtitleCue | undefined, secondary: SubtitleCue | undefined, pending = false): void {
        this.pair = primary ? { primary, secondary } : undefined;
        this.pending = pending;
        this.pendingSince = undefined;
    }

    clear(): void {
        this.requested = undefined;
        this.pair = undefined;
        this.pendingSince = undefined;
    }
}
