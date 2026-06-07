import type { SubtitleCue } from './subtitle-cues';
import type { SubtitleTrackOption } from './subtitle-track-options';
import { getYouTubeVideoId, isYouTubeOwnedVideoElement, isYouTubePage } from './subtitle-youtube';
import { mutationInsideClosest } from '../dom/mutation';
import type { ReaderSettings } from '../types';

export function subtitleSourceContextKey(video?: HTMLVideoElement): string {
    const url = new URL(location.href);
    url.hash = '';
    if (isYouTubePage()) return getYouTubeVideoId() ? `youtube:${getYouTubeVideoId()}` : '';
    if (isCijVideoPage()) return `cij:${url.origin}${url.pathname}${url.search}`;
    const videoSource = videoSourceKey(video);
    return `page:${url.origin}${url.pathname}${url.search}${videoSource ? `|video:${videoSource}` : ''}`;
}

function videoSourceKey(video?: HTMLVideoElement): string {
    if (!video) return '';
    const direct = video.currentSrc || video.src;
    if (direct) return normalizeMediaSourceForContext(direct);
    const source = video.querySelector<HTMLSourceElement>('source[src]')?.src;
    return source ? normalizeMediaSourceForContext(source) : '';
}

function normalizeMediaSourceForContext(value: string): string {
    try {
        const url = new URL(value, location.href);
        url.hash = '';
        return url.href;
    } catch {
        return value;
    }
}

function isCijVideoPage(): boolean {
    return /(^|\.)cijapanese\.com$/i.test(location.hostname) && /^\/video\//i.test(location.pathname);
}

export function shouldHideSubtitleRoot(settings: ReaderSettings, video: HTMLVideoElement | undefined, cues: readonly SubtitleCue[], tracks: readonly unknown[]): boolean {
    return !settings.subtitlePlayerEnabled || !Boolean(video || cues.length || tracks.length);
}

export function shouldKeepIdleControlClass(root: HTMLElement, settings: ReaderSettings): boolean {
    return settings.subtitleControlsMode === 'auto' && root.classList.contains('jpdb-subtitle-controls-idle');
}

export function canUseDomCaptionFallback(options: {
    selected: SubtitleTrackOption | undefined;
    tracks: readonly SubtitleTrackOption[];
    selectedTrackId: string;
    cues: readonly SubtitleCue[];
    video: HTMLVideoElement | undefined;
}): boolean {
    if (isYouTubePage()) {
        return Boolean(getYouTubeVideoId())
            && isYouTubeOwnedVideoElement(options.video)
            && Boolean(options.selectedTrackId || !options.tracks.some(track => track.kind === 'youtube'));
    }
    const selectedNativeTrackNeedsDomFallback = Boolean(options.selected?.kind === 'native' && options.selected.track && !options.cues.length);
    return !options.selectedTrackId || selectedNativeTrackNeedsDomFallback;
}

export function videoSummary(video: HTMLVideoElement): Record<string, unknown> {
    return {
        currentSrcHost: safeHost(video.currentSrc || video.src),
        width: video.videoWidth || video.clientWidth,
        height: video.videoHeight || video.clientHeight,
        textTracks: video.textTracks.length,
    };
}

function safeHost(value: string): string {
    try {
        return new URL(value, location.href).host;
    } catch {
        return value ? 'inline-or-invalid' : '';
    }
}

export function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    return mutationInsideClosest(mutation, '[data-jpdb-reader-root]');
}

export function mutationCouldAffectVideoDiscovery(mutation: MutationRecord): boolean {
    return Array.from(mutation.addedNodes)
        .concat(Array.from(mutation.removedNodes))
        .some(nodeContainsVideoElement);
}

function nodeContainsVideoElement(node: Node): boolean {
    if (node instanceof HTMLVideoElement) return true;
    return node instanceof Element && Boolean(node.querySelector('video'));
}
