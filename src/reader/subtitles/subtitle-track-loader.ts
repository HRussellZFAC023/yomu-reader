import { normalizeSubtitleCues, parseSubtitleText, type SubtitleCue } from './subtitle-cues';
import { translateSubtitleCues } from './subtitle-translate';
import {
    loadFirstUsableYouTubeSibling,
    loadYouTubeTrackCues,
    type YouTubeSubtitleTrack,
    type YouTubeTrackLoadOptions,
} from './subtitle-youtube';

export interface SubtitleTrackLoadable extends YouTubeSubtitleTrack {
    id: string;
    label: string;
    kind: 'native' | 'file' | 'youtube' | 'remote';
    track?: TextTrack;
    cues?: SubtitleCue[];
    url?: string;
    translatedFromTrackId?: string;
    targetLanguage?: string;
}

export interface SubtitleTrackLoadOptions<T extends SubtitleTrackLoadable> {
    tracks: T[];
    transcriptEligible: boolean;
    requestText: (url: string) => Promise<string>;
    onRemoteEmpty?: (track: T) => void;
    onRemoteError?: (track: T, error: unknown) => void;
    onYouTubeRequestError?: YouTubeTrackLoadOptions<T>['onRequestError'];
}

export async function loadSubtitleTrackCues<T extends SubtitleTrackLoadable>(
    track: T,
    options: SubtitleTrackLoadOptions<T>,
): Promise<{ track: T; cues: SubtitleCue[] }> {
    if (track.cues?.length) return { track, cues: track.cues };
    
    if (track.translatedFromTrackId) {
        return loadTranslatedTrackCues(track, options);
    }

    if (track.track) return loadNativeTrackCues(track);

    if (isRemoteSubtitleTrack(track)) {
        const cues = await loadRemoteTrackCues(track, options);
        track.cues = cues;
        return { track, cues };
    }

    if (isYouTubeSubtitleTrack(track)) return loadYouTubeTrackWithFallback(track, options);

    return { track, cues: track.cues ?? [] };
}

async function loadTranslatedTrackCues<T extends SubtitleTrackLoadable>(
    track: T,
    options: SubtitleTrackLoadOptions<T>,
): Promise<{ track: T; cues: SubtitleCue[] }> {
    const sourceTrack = options.tracks.find(t => t.id === track.translatedFromTrackId);
    if (!sourceTrack) return { track, cues: [] };
    const { cues: sourceCues } = await loadSubtitleTrackCues(sourceTrack, options);
    const translatedCues = await translateSubtitleCues(sourceCues, sourceTrack.language || 'en', track.targetLanguage || track.language || 'ja');
    track.cues = translatedCues;
    return { track, cues: translatedCues };
}

function isRemoteSubtitleTrack(track: SubtitleTrackLoadable): boolean {
    return track.kind === 'remote' && Boolean(track.url);
}

function isYouTubeSubtitleTrack(track: SubtitleTrackLoadable): boolean {
    return track.kind === 'youtube' && Boolean(track.url);
}

async function loadNativeTrackCues<T extends SubtitleTrackLoadable>(track: T): Promise<{ track: T; cues: SubtitleCue[] }> {
    const nativeTrack = track.track;
    if (!nativeTrack) return { track, cues: [] };
    ensureTextTrackReadable(nativeTrack);
    const cues = readTextTrackCues(nativeTrack);
    return { track, cues: cues.length ? cues : await waitForTextTrackCues(nativeTrack) };
}

async function loadYouTubeTrackWithFallback<T extends SubtitleTrackLoadable>(
    track: T,
    options: SubtitleTrackLoadOptions<T>,
): Promise<{ track: T; cues: SubtitleCue[] }> {
    const youtubeOptions = {
        requestText: options.requestText,
        onRequestError: options.onYouTubeRequestError,
    };
    const cues = await loadYouTubeTrackCues(track, youtubeOptions);
    if (cues.length) {
        track.cues = cues;
        return { track, cues };
    }
    const fallback = await loadFirstUsableYouTubeSibling(track, options.tracks, youtubeOptions);
    if (fallback) return fallback;
    track.cues = [];
    return { track, cues: [] };
}

export function ensureTextTrackReadable(track: TextTrack): void {
    if (track.mode === 'disabled') track.mode = 'hidden';
}

export function readTextTrackCues(track: TextTrack): SubtitleCue[] {
    return normalizeSubtitleCues(Array.from(track.cues ?? [])
        .map(cue => ({ start: cue.startTime, end: cue.endTime, text: getTextTrackCueText(cue as VTTCue | TextTrackCue).trim() }))
        .filter(cue => cue.text)
        .sort((a, b) => a.start - b.start));
}

export function waitForTextTrackCues(track: TextTrack, timeoutMs = 900): Promise<SubtitleCue[]> {
    const startedAt = performance.now();
    return new Promise(resolve => {
        const poll = () => {
            const cues = readTextTrackCues(track);
            if (cues.length || performance.now() - startedAt >= timeoutMs) {
                resolve(cues);
                return;
            }
            window.setTimeout(poll, 50);
        };
        poll();
    });
}

export function getTextTrackCueText(cue: VTTCue | TextTrackCue): string {
    if ('text' in cue && typeof cue.text === 'string') return cue.text;
    return '';
}

async function loadRemoteTrackCues<T extends SubtitleTrackLoadable>(
    track: T,
    options: SubtitleTrackLoadOptions<T>,
): Promise<SubtitleCue[]> {
    try {
        const cues = normalizeSubtitleCues(parseSubtitleText(await options.requestText(track.url ?? '')), {
            transcriptEligible: options.transcriptEligible,
        });
        if (cues.length) return cues;
        options.onRemoteEmpty?.(track);
    } catch (error) {
        options.onRemoteError?.(track, error);
    }
    return [];
}
