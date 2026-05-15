import { ensureTextTrackReadable } from './subtitle-track-loader';
import { activateYouTubeCaptionTrack, disableYouTubeNativeCaptions, isYouTubePage } from './subtitle-youtube';

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
    const yomuCaptionsActive = Boolean(state.overlayVisible
        && (state.selectedTrackId || state.hasPrimaryCues || state.currentCueText));
    if (!isYouTubePage()) return applyGenericNativeTrackModes(state);
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
    document.documentElement.classList.toggle('jpdb-subtitle-yomu-captions-active', yomuCaptionsActive);
    if (shouldDisableYouTubeNativeCaptions(state, yomuCaptionsActive)) disableYouTubeNativeCaptions();
    if (shouldRestoreYouTubeNativeCaptions(state, yomuCaptionsActive)) restoreYouTubeNativeCaptionTrack(state);
    return yomuCaptionsActive;
}

function applyYouTubeTextTrackModes<T extends SubtitleNativeTrackModeOption>(
    state: SubtitleNativeTrackModeState<T>,
): void {
    for (const option of state.tracks) {
        if (option.track) option.track.mode = isSelectedSubtitleTrack(option, state) ? 'hidden' : 'disabled';
    }
}

function shouldDisableYouTubeNativeCaptions<T extends SubtitleNativeTrackModeOption>(
    state: SubtitleNativeTrackModeState<T>,
    yomuCaptionsActive: boolean,
): boolean {
    return yomuCaptionsActive
        && !needsYouTubeDomCaptionFallback(state)
        && !state.lastYomuCaptionsActive;
}

function shouldRestoreYouTubeNativeCaptions<T extends SubtitleNativeTrackModeOption>(
    state: SubtitleNativeTrackModeState<T>,
    yomuCaptionsActive: boolean,
): boolean {
    return !yomuCaptionsActive && state.lastYomuCaptionsActive;
}

function restoreYouTubeNativeCaptionTrack<T extends SubtitleNativeTrackModeOption>(
    state: SubtitleNativeTrackModeState<T>,
): void {
    const selected = state.tracks.find(track => track.id === state.selectedTrackId && track.kind === 'youtube');
    if (selected) activateYouTubeCaptionTrack(selected);
}

function needsYouTubeDomCaptionFallback<T extends SubtitleNativeTrackModeOption>(
    state: SubtitleNativeTrackModeState<T>,
): boolean {
    return Boolean(state.youtubeDomCaptionFallbackTrackId
        && state.youtubeDomCaptionFallbackTrackId === state.selectedTrackId);
}

function isSelectedSubtitleTrack(
    option: SubtitleNativeTrackModeOption,
    state: Pick<SubtitleNativeTrackModeState<SubtitleNativeTrackModeOption>, 'selectedTrackId' | 'secondaryTrackId'>,
): boolean {
    return option.id === state.selectedTrackId || option.id === state.secondaryTrackId;
}
