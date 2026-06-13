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
    suppressNativeCaptions?: boolean;
    video?: HTMLVideoElement;
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
    const yomuCaptionsActive = Boolean(state.suppressNativeCaptions || (state.overlayVisible && (state.selectedTrackId || hasYomuCaptionContent)));
    if (!youtubePage) return applyGenericNativeTrackModes(state, yomuCaptionsActive);
    return applyYouTubeNativeTrackModes(state, yomuCaptionsActive);
}

function applyGenericNativeTrackModes<T extends SubtitleNativeTrackModeOption>(
    state: SubtitleNativeTrackModeState<T>,
    yomuCaptionsActive: boolean,
): boolean {
    for (const option of state.tracks) {
        if (!option.track) continue;
        if (isSelectedSubtitleTrack(option, state)) {
            if (yomuCaptionsActive) option.track.mode = 'hidden';
            else ensureTextTrackReadable(option.track);
            continue;
        }
        if (yomuCaptionsActive) option.track.mode = 'disabled';
    }
    if (yomuCaptionsActive) suppressGenericCaptionPlayerUi(state.video);
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

interface GenericCaptionPlayer {
    media?: unknown;
    captions?: { active?: boolean; toggled?: boolean };
    currentTrack?: number;
    toggleCaptions?: (active: boolean) => unknown;
}

function suppressGenericCaptionPlayerUi(video?: HTMLVideoElement): void {
    for (const player of genericCaptionPlayersForVideo(video)) {
        try {
            player.toggleCaptions?.(false);
        } catch {
            // Third-party player APIs are best-effort.
        }
    }
    suppressPressedCaptionButtons(video);
}

function genericCaptionPlayersForVideo(video?: HTMLVideoElement): GenericCaptionPlayer[] {
    const players: GenericCaptionPlayer[] = [];
    const seen = new Set<GenericCaptionPlayer>();
    for (const candidate of genericCaptionPlayerCandidates()) {
        if (!isGenericCaptionPlayer(candidate)) continue;
        if (seen.has(candidate)) continue;
        if (video && candidate.media instanceof HTMLMediaElement && candidate.media !== video) continue;
        seen.add(candidate);
        players.push(candidate);
    }
    return players;
}

function genericCaptionPlayerCandidates(): unknown[] {
    const typedWindow = window as Window & {
        player?: unknown;
        plyr?: unknown;
        players?: unknown;
    };
    return [
        typedWindow.player,
        typedWindow.plyr,
        ...(Array.isArray(typedWindow.players) ? typedWindow.players : []),
    ];
}

function isGenericCaptionPlayer(value: unknown): value is GenericCaptionPlayer {
    if (!value || typeof value !== 'object') return false;
    const player = value as GenericCaptionPlayer;
    return typeof player.toggleCaptions === 'function'
        && (player.media instanceof HTMLMediaElement || Boolean(player.captions) || typeof player.currentTrack === 'number');
}

function suppressPressedCaptionButtons(video?: HTMLVideoElement): void {
    const scope = genericCaptionButtonScope(video);
    const buttons = Array.from(scope.querySelectorAll<HTMLElement>(
        '[data-plyr="captions"][aria-pressed="true"], [data-plyr="captions"].plyr__control--pressed',
    ));
    for (const button of buttons) {
        try {
            button.click();
        } catch {
            // Clicking player controls is a fallback for pages without an
            // exposed API; if it fails, TextTrack modes still stay suppressed.
        }
    }
}

function genericCaptionButtonScope(video?: HTMLVideoElement): ParentNode {
    return video?.closest('.plyr, [class*="player" i], [class*="video" i]') ?? document;
}
