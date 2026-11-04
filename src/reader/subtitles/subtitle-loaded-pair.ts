import { findActiveSubtitleCue, findAlignedCue, type SubtitleCue } from './subtitle-cues';
import type { SubtitleTrackOption } from './subtitle-track-options';

interface LoadedSubtitlePairInput {
    tracks: readonly SubtitleTrackOption[];
    selectedTrackId: string;
    secondaryTrackId: string;
    primaryCues: SubtitleCue[];
    secondaryCues: SubtitleCue[];
    currentPrimary: SubtitleCue | undefined;
    time: number;
}

/** Generated translations retain source timings. Missing target cues must not
 * borrow a neighbouring translation through native caption boundary grace. */
export function loadedSubtitlePair(input: LoadedSubtitlePairInput): { primary: SubtitleCue | undefined; secondary: SubtitleCue | undefined } {
    const exact = input.tracks.some(track => (track.id === input.selectedTrackId || track.id === input.secondaryTrackId)
        && track.translationOutcome !== undefined);
    const active = exact ? exactActiveCue : findActiveSubtitleCue;
    const secondary = input.secondaryTrackId ? active(input.secondaryCues, input.time) : undefined;
    if (!input.selectedTrackId) return { primary: undefined, secondary };
    const direct = active(input.primaryCues, input.time);
    if (exact) return { primary: direct, secondary };
    return { primary: nativePrimaryCue(input, direct, secondary), secondary };
}

function nativePrimaryCue(input: LoadedSubtitlePairInput, direct: SubtitleCue | undefined, secondary: SubtitleCue | undefined): SubtitleCue | undefined {
    // Native and YouTube caption languages may be segmented independently.
    const aligned = secondary ? findAlignedCue(input.primaryCues, secondary) : undefined;
    if (direct || aligned) return direct ?? aligned;
    const current = input.currentPrimary;
    if (!current) return undefined;
    if (input.time >= current.start - 0.12 && input.time <= current.end + 0.12) return current;
    return secondary && findAlignedCue(input.secondaryCues, current) === secondary ? current : undefined;
}

function exactActiveCue(cues: SubtitleCue[], time: number): SubtitleCue | undefined {
    let low = 0;
    let high = cues.length - 1;
    let latest = -1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (cues[middle].start <= time) {
            latest = middle;
            low = middle + 1;
        } else high = middle - 1;
    }
    for (let index = latest; index >= 0; index--) {
        if (time < cues[index].end) return cues[index];
    }
    return undefined;
}
