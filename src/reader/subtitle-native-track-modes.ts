import { ensureTextTrackReadable } from './subtitle-track-loader';
import { isYouTubePage } from './subtitle-youtube';

export interface SubtitleNativeTrackModeOption {
    id: string;
    label: string;
    kind: string;
    track?: TextTrack;
    youtubeTrack?: unknown;
}

export interface SubtitleNativeTrackModeState<T extends SubtitleNativeTrackModeOption> {
    tracks: T[];
    selectedTrackId: string;
    secondaryTrackId: string;
    overlayVisible: boolean;
    hasPrimaryCues: boolean;
    currentCueText?: string;
    youtubeDomCaptionFallbackTrackId: string;
    lastYomuCaptionsActive: boolean;
}

export function applySubtitleNativeTrackModes<T extends SubtitleNativeTrackModeOption>(
    state: SubtitleNativeTrackModeState<T>,
): boolean {
    const youtubePage = isYouTubePage();
    const hasYomuCaptionContent = Boolean(state.hasPrimaryCues || state.currentCueText);
    const yomuCaptionsActive = Boolean(state.overlayVisible && (state.selectedTrackId || hasYomuCaptionContent));
    if (!youtubePage) return applyGenericNativeTrackModes(state);
    return applyYouTubeNativeTrackModes(state, yomuCaptionsActive);
}

function applyGenericNativeTrackModes<T extends SubtitleNativeTrackModeOption>(
    state: SubtitleNativeTrackModeState<T>,
): boolean {
    for (const option of state.tracks) {
        if (option.track && isSelectedSubtitleTrack(option, state)) ensureTextTrackReadable(option.track);
    }
    document.documentElement.classList.remove('jpdb-subtitle-yomu-captions-active');
    return false;
}

function applyYouTubeNativeTrackModes<T extends SubtitleNativeTrackModeOption>(
    state: SubtitleNativeTrackModeState<T>,
    yomuCaptionsActive: boolean,
): boolean {
    applyYouTubeTextTrackModes(state);
    const hideYouTubeNativeCaptions = yomuCaptionsActive;
    document.documentElement.classList.toggle('jpdb-subtitle-yomu-captions-active', hideYouTubeNativeCaptions);
    return hideYouTubeNativeCaptions;
}

function applyYouTubeTextTrackModes<T extends SubtitleNativeTrackModeOption>(
    state: SubtitleNativeTrackModeState<T>,
): void {
    for (const option of state.tracks) {
        if (option.track) option.track.mode = isSelectedSubtitleTrack(option, state) ? 'hidden' : 'disabled';
    }
}

function isSelectedSubtitleTrack(
    option: SubtitleNativeTrackModeOption,
    state: Pick<SubtitleNativeTrackModeState<SubtitleNativeTrackModeOption>, 'selectedTrackId' | 'secondaryTrackId'>,
): boolean {
    return option.id === state.selectedTrackId || option.id === state.secondaryTrackId;
}
