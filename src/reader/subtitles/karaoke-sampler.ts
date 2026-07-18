import { readerWordSurfaceText } from '../dom/index';
import {
    compactTextLength,
    cueHasExactWordTimings,
    karaokeCharacterProgress,
    type SubtitleCue,
    type SubtitleWordTiming,
} from './subtitle-cues';

function applyKaraokeClassToWordElement(element: HTMLElement, cursor: number, progress: number): number {
    element.classList.remove('jpdb-subtitle-word-pending', 'jpdb-subtitle-word-spoken', 'jpdb-subtitle-word-current');
    const surface = readerWordSurfaceText(element).replace(/\s+/g, '');
    if (!surface) return cursor;
    const start = cursor;
    const end = cursor + compactTextLength(surface);
    element.classList.add(karaokeWordClass(progress, start, end));
    return end;
}

function karaokeWordClass(progress: number, start: number, end: number): string {
    if (progress >= end) return 'jpdb-subtitle-word-spoken';
    return progress > start ? 'jpdb-subtitle-word-current' : 'jpdb-subtitle-word-pending';
}

// Everything the karaoke sampler reads back off the controller: just the live
// subtitle element it queries the primary line + rendered word spans out of.
export interface SubtitleKaraokeSamplerDeps {
    getSubtitleElement(): HTMLElement | undefined;
}

// Word-level karaoke highlight progression across the active cue, extracted
// from the controller: owns the per-frame dirty-check state and maps the cue's
// character progress at a sampled playback time onto the rendered primary word
// spans (pending/current/spoken classes). The controller keeps the frame/tick
// sampler that decides WHEN to sample and delegates the highlight pass here;
// every controller input flows through SubtitleKaraokeSamplerDeps.
export class SubtitleKaraokeSampler {
    // Dirty-check for the per-frame karaoke pass: classes only flip at integer
    // character boundaries, so skip the class churn between crossings.
    lastKaraokeProgressKey?: number;
    lastKaraokePrimaryWord?: HTMLElement | null;

    constructor(private readonly deps: SubtitleKaraokeSamplerDeps) {}

    applyKaraokeStateToPrimary(cue: SubtitleCue, time: number): void {
        const state = this.primaryKaraokeState(cue);
        if (!state) {
            this.lastKaraokeProgressKey = undefined;
            this.lastKaraokePrimaryWord = undefined;
            return;
        }

        const progress = karaokeCharacterProgress(cue, state.words, time);
        const progressKey = Math.floor(progress);
        const primaryWord = state.wordElements[0] ?? null;
        // The sampler runs this every presented frame, but karaoke classes only
        // flip when the integer character progress crosses a word boundary. Skip
        // the per-word classList churn while neither the progress bucket nor the
        // rendered primary (a re-render makes new word elements) has changed.
        if (progressKey === this.lastKaraokeProgressKey && primaryWord === this.lastKaraokePrimaryWord) return;
        this.lastKaraokeProgressKey = progressKey;
        this.lastKaraokePrimaryWord = primaryWord;

        let cursor = 0;
        for (const element of state.wordElements) {
            cursor = applyKaraokeClassToWordElement(element, cursor, progress);
        }
    }

    private primaryKaraokeState(cue: SubtitleCue): { words: SubtitleWordTiming[]; wordElements: HTMLElement[] } | null {
        const primary = this.deps.getSubtitleElement()?.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        if (!primary || !cueHasExactWordTimings(cue)) return null;
        const words = cue.words;
        const wordElements = Array.from(primary.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        return words.length && wordElements.length ? { words, wordElements } : null;
    }
}
