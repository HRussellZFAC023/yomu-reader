import { isYouTubePage } from './subtitle-youtube';

const GENERIC_NATIVE_CAPTIONS_SUPPRESSED_CLASS = 'jpdb-subtitle-native-captions-suppressed';
const YOUTUBE_NATIVE_CAPTIONS_SUPPRESSED_CLASS = 'jpdb-subtitle-yomu-captions-active';

export type SubtitleNativeTrackModeSnapshot = Map<TextTrack, TextTrackMode>;

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
    suppressCaptionPlayerUi?: boolean;
    video?: HTMLVideoElement;
    hasPrimaryCues: boolean;
    currentCueText?: string;
    youtubeDomCaptionFallbackTrackId: string;
    lastYomuCaptionsActive: boolean;
}

export function snapshotSubtitleNativeTrackModes(
    snapshot: SubtitleNativeTrackModeSnapshot,
    tracks: SubtitleNativeTrackModeOption[],
): void {
    for (const option of tracks) {
        if (option.track && !snapshot.has(option.track)) snapshot.set(option.track, option.track.mode);
    }
}

export function releaseSubtitleNativeTrackModes(snapshot: SubtitleNativeTrackModeSnapshot): void {
    setDocumentClassState(GENERIC_NATIVE_CAPTIONS_SUPPRESSED_CLASS, false);
    setDocumentClassState(YOUTUBE_NATIVE_CAPTIONS_SUPPRESSED_CLASS, false);
    for (const [track, mode] of snapshot) {
        try {
            track.mode = mode;
        } catch {
            // Detached/page-owned tracks may reject writes during teardown.
        }
    }
    snapshot.clear();
}

export function applySubtitleNativeTrackModes<T extends SubtitleNativeTrackModeOption>(
    state: SubtitleNativeTrackModeState<T>,
): boolean {
    const youtubePage = isYouTubePage();
    const hasYomuCaptionContent = Boolean(state.hasPrimaryCues || state.currentCueText);
    // The controller supplies an explicit ownership decision for the active
    // cue. `false` means its async parse has not produced a visual commit yet,
    // so page/native captions must remain readable. Direct utility callers
    // that omit the field retain the historical inferred behaviour.
    const yomuCaptionsActive = state.suppressNativeCaptions === undefined
        ? Boolean(state.overlayVisible && (state.selectedTrackId || hasYomuCaptionContent))
        : state.suppressNativeCaptions;
    if (!youtubePage) return applyGenericNativeTrackModes(state, yomuCaptionsActive);
    setDocumentClassState(GENERIC_NATIVE_CAPTIONS_SUPPRESSED_CLASS, false);
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
            else option.track.mode = 'showing';
            continue;
        }
        if (yomuCaptionsActive) option.track.mode = 'disabled';
    }
    if (yomuCaptionsActive && (state.suppressCaptionPlayerUi ?? true)) suppressGenericCaptionPlayerUi(state.video);
    setDocumentClassState(GENERIC_NATIVE_CAPTIONS_SUPPRESSED_CLASS, yomuCaptionsActive);
    setDocumentClassState(YOUTUBE_NATIVE_CAPTIONS_SUPPRESSED_CLASS, false);
    return false;
}

function applyYouTubeNativeTrackModes<T extends SubtitleNativeTrackModeOption>(
    state: SubtitleNativeTrackModeState<T>,
    yomuCaptionsActive: boolean,
): boolean {
    applyYouTubeTextTrackModes(state);
    const hideYouTubeNativeCaptions = yomuCaptionsActive;
    setDocumentClassState(YOUTUBE_NATIVE_CAPTIONS_SUPPRESSED_CLASS, hideYouTubeNativeCaptions);
    return hideYouTubeNativeCaptions;
}

function setDocumentClassState(className: string, enabled: boolean): void {
    const root = document.documentElement;
    if (root.classList.contains(className) !== enabled) root.classList.toggle(className, enabled);
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

interface VidstackTextTrack {
    mode?: string;
}

interface VidstackTextTrackList extends Iterable<VidstackTextTrack> {
    selected?: VidstackTextTrack | null;
}

interface VidstackMediaPlayer extends HTMLElement {
    textTracks?: VidstackTextTrackList;
}

function suppressGenericCaptionPlayerUi(video?: HTMLVideoElement): void {
    for (const player of genericCaptionPlayersForVideo(video)) {
        try {
            player.toggleCaptions?.(false);
        } catch {
            // Third-party player APIs are best-effort.
        }
    }
    suppressVidstackCaptionPlayers(video);
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

function suppressVidstackCaptionPlayers(video?: HTMLVideoElement): void {
    for (const player of vidstackCaptionPlayersForVideo(video)) {
        const tracks = player.textTracks;
        if (!tracks) continue;
        try {
            if (tracks.selected) tracks.selected.mode = 'disabled';
            for (const track of Array.from(tracks)) {
                if (track.mode && track.mode !== 'disabled') track.mode = 'disabled';
            }
        } catch {
            // Vidstack's custom element API is page-owned; leave native track
            // modes and CSS suppression as the fallback if it refuses writes.
        }
    }
}

function vidstackCaptionPlayersForVideo(video?: HTMLVideoElement): VidstackMediaPlayer[] {
    const scope = genericCaptionButtonScope(video);
    const scopedPlayer = scope instanceof Element && isVidstackMediaPlayer(scope) ? [scope] : [];
    return [
        ...scopedPlayer,
        ...Array.from(scope.querySelectorAll<VidstackMediaPlayer>('media-player, [data-media-player]')).filter(isVidstackMediaPlayer),
    ].filter((player, index, players) => players.indexOf(player) === index);
}

function isVidstackMediaPlayer(value: unknown): value is VidstackMediaPlayer {
    return value instanceof HTMLElement
        && (value.localName === 'media-player' || value.hasAttribute('data-media-player'))
        && Boolean((value as VidstackMediaPlayer).textTracks);
}

function suppressPressedCaptionButtons(video?: HTMLVideoElement): void {
    const scope = genericCaptionButtonScope(video);
    const buttons = Array.from(scope.querySelectorAll<HTMLElement>(
        [
            '[data-plyr="captions"][aria-pressed="true"]',
            '[data-plyr="captions"].plyr__control--pressed',
            'media-caption-button[aria-pressed="true"]',
            'media-caption-button[data-pressed]',
            '[data-media-tooltip="caption"][aria-pressed="true"]',
            '[data-media-tooltip="caption"][data-pressed]',
            '[aria-label*="caption" i][aria-pressed="true"]',
            '[title*="caption" i][aria-pressed="true"]',
        ].join(', '),
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
    return video?.closest('media-player, [data-media-player], .plyr, [class*="player" i], [class*="video" i]') ?? document;
}
