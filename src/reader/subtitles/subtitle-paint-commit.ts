import { SUBTITLE_CUE_BOUNDARY_PADDING_SECONDS, type SubtitleCue } from './subtitle-cues';

/** Playback can advance while parsing; caption actions belong to the painted pair. */
export class SubtitlePaintCommit {
    private requested?: SubtitleCue;
    pair?: { primary: SubtitleCue; secondary?: SubtitleCue };

    advance(cue: SubtitleCue): boolean {
        const previous = this.requested;
        this.requested = cue;
        // Follow every observed boundary, including cues that never painted.
        // A backward jump or a real silence cannot inherit an old frame.
        return Boolean(this.pair && previous && previous.start <= cue.start
            && previous.end >= cue.start - SUBTITLE_CUE_BOUNDARY_PADDING_SECONDS);
    }

    commit(primary: SubtitleCue | undefined, secondary: SubtitleCue | undefined): void {
        this.pair = primary ? { primary, secondary } : undefined;
    }

    clear(): void {
        this.requested = undefined;
        this.pair = undefined;
    }
}
