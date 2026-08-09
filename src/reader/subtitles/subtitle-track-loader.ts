import { isAbortError } from '../core/errors';
import { targetSubtitleLanguageTag } from '../languages/resolve';
import { normalizeSubtitleCues, parseSubtitleText, stripWebVttCueMarkup, type SubtitleCue } from './subtitle-cues';
import { translateSubtitleCues } from './subtitle-translate';
import {
    hasFreshYouTubeCaptionSemanticMiss,
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
    requestText: (url: string, signal?: AbortSignal) => Promise<string>;
    signal?: AbortSignal;
    translationFallback?: 'full' | 'skip';
    onRemoteEmpty?: (track: T) => void;
    onRemoteError?: (track: T, error: unknown) => void;
    onYouTubeRequestError?: YouTubeTrackLoadOptions<T>['onRequestError'];
}

export async function loadSubtitleTrackCues<T extends SubtitleTrackLoadable>(
    track: T,
    options: SubtitleTrackLoadOptions<T>,
): Promise<{ track: T; cues: SubtitleCue[] }> {
    throwIfSubtitleTrackLoadAborted(options.signal);
    if (track.cues?.length) return { track, cues: track.cues };
    
    if (track.translatedFromTrackId) {
        return loadTranslatedTrackCues(track, options);
    }

    if (track.track) return loadNativeTrackCues(track);

    if (isRemoteSubtitleTrack(track)) {
        const cues = await loadRemoteTrackCues(track, options);
        throwIfSubtitleTrackLoadAborted(options.signal);
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
    if (options.translationFallback === 'skip') return { track, cues: [] };
    const sourceTrack = options.tracks.find(t => t.id === track.translatedFromTrackId);
    if (!sourceTrack) return { track, cues: [] };
    const { cues: sourceCues } = await loadSubtitleTrackCues(sourceTrack, options);
    throwIfSubtitleTrackLoadAborted(options.signal);
    const translatedCues = await translateSubtitleCues(
        sourceCues,
        translatedSourceTag(track, sourceTrack),
        targetSubtitleLanguageTag(track),
        { signal: options.signal },
    );
    throwIfSubtitleTrackLoadAborted(options.signal);
    track.cues = translatedCues;
    return { track, cues: translatedCues };
}

function translatedSourceTag(
    track: SubtitleTrackLoadable,
    sourceTrack: SubtitleTrackLoadable,
): string {
    return track.sourceLanguage || sourceTrack.language || sourceTrack.sourceLanguage || 'en';
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
        signal: options.signal,
    };
    const cues = await loadYouTubeTrackCues(track, youtubeOptions);
    throwIfSubtitleTrackLoadAborted(options.signal);
    if (cues.length) {
        track.cues = cues;
        return { track, cues };
    }
    const translatedSource = await loadYouTubeTranslationSourceFallback(track, options);
    throwIfSubtitleTrackLoadAborted(options.signal);
    if (translatedSource.length) {
        track.cues = translatedSource;
        return { track, cues: translatedSource };
    }
    // An HTTP-200 empty response settles this source identity for a bounded
    // window. Translation tracks still get their one source-language fallback
    // above; walking compatible siblings after that would only replay the same
    // empty caption source under another track object.
    if (hasFreshYouTubeCaptionSemanticMiss(track, options.requestText)) {
        track.cues = [];
        return { track, cues: [] };
    }
    return loadYouTubeSiblingOrEmpty(track, options, youtubeOptions);
}

async function loadYouTubeSiblingOrEmpty<T extends SubtitleTrackLoadable>(
    track: T,
    options: SubtitleTrackLoadOptions<T>,
    youtubeOptions: YouTubeTrackLoadOptions<T>,
): Promise<{ track: T; cues: SubtitleCue[] }> {
    const fallback = await loadFirstUsableYouTubeSibling(track, options.tracks, youtubeOptions);
    if (fallback) return fallback;
    track.cues = [];
    return { track, cues: [] };
}

async function loadYouTubeTranslationSourceFallback<T extends SubtitleTrackLoadable>(
    track: T,
    options: SubtitleTrackLoadOptions<T>,
): Promise<SubtitleCue[]> {
    const plan = youtubeTranslationSourcePlan(track, options);
    if (!plan) return [];
    const { cues: sourceCues } = await loadSubtitleTrackCues(plan.sourceTrack, options);
    if (!sourceCues.length) return [];
    return translateSubtitleCues(
        sourceCues,
        youtubeTranslationSourceLanguage(plan),
        plan.targetLanguage,
        { signal: options.signal },
    );
}

interface YouTubeTranslationSourcePlan<T extends SubtitleTrackLoadable> {
    sourceTrack: T;
    sourceLanguage: string;
    targetLanguage: string;
}

function youtubeTranslationSourcePlan<T extends SubtitleTrackLoadable>(
    track: T,
    options: SubtitleTrackLoadOptions<T>,
): YouTubeTranslationSourcePlan<T> | null {
    if (options.translationFallback === 'skip' || track.sourceType !== 'translation') return null;
    const sourceTrack = findYouTubeTranslationSourceTrack(track, options.tracks);
    if (!sourceTrack) return null;
    return youtubeTranslationLanguagePlan(track, sourceTrack);
}

function youtubeTranslationLanguagePlan<T extends SubtitleTrackLoadable>(
    track: T,
    sourceTrack: T,
): YouTubeTranslationSourcePlan<T> | null {
    const sourceLanguage = normalizedTrackLanguage(track.sourceLanguage);
    const targetLanguage = normalizedYouTubeTranslationTargetLanguage(track);
    if (!sourceLanguage || !targetLanguage) return null;
    if (sourceLanguage === targetLanguage) return null;
    return { sourceTrack, sourceLanguage, targetLanguage };
}

function youtubeTranslationSourceLanguage<T extends SubtitleTrackLoadable>(
    plan: YouTubeTranslationSourcePlan<T>,
): string {
    return plan.sourceTrack.language || plan.sourceTrack.sourceLanguage || plan.sourceLanguage;
}

function normalizedYouTubeTranslationTargetLanguage(track: SubtitleTrackLoadable): string {
    return normalizedTrackLanguage(track.targetLanguage || track.language);
}

function findYouTubeTranslationSourceTrack<T extends SubtitleTrackLoadable>(track: T, tracks: T[]): T | null {
    const sourceLanguage = normalizedTrackLanguage(track.sourceLanguage);
    if (!sourceLanguage) return null;
    return tracks.find(candidate => candidate.kind === 'youtube'
        && candidate !== track
        && candidate.sourceType !== 'translation'
        && Boolean(candidate.url)
        && normalizedTrackLanguage(candidate.language || candidate.sourceLanguage) === sourceLanguage) ?? null;
}

function normalizedTrackLanguage(language: string | undefined): string {
    return (language ?? '').trim().toLowerCase();
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
            // Keep the bounded poll safe if a test/document realm is torn down
            // while a native track is still waiting for its browser-populated
            // cue list. `window` may disappear before the timeout fires; the
            // global timer remains valid and lets the poll reach its timeout
            // without surfacing an uncaught teardown error.
            globalThis.setTimeout(poll, 50);
        };
        poll();
    });
}

export function getTextTrackCueText(cue: VTTCue | TextTrackCue): string {
    if (!('text' in cue) || typeof cue.text !== 'string') return '';
    // Preserve the raw text for ordinary cues so normalizeCaptionText remains
    // the only entity-decoding boundary. getCueAsHTML() would decode once here
    // and make escaped literal entities decode a second time downstream.
    if (!/<\/?x-word-ms(?:\s|>)/i.test(cue.text)) return cue.text;
    return stripWebVttCueMarkup(cue.text);
}

async function loadRemoteTrackCues<T extends SubtitleTrackLoadable>(
    track: T,
    options: SubtitleTrackLoadOptions<T>,
): Promise<SubtitleCue[]> {
    try {
        return settleRemoteTrackCues(track, options, await requestRemoteTrackCues(track, options));
    } catch (error) {
        return settleRemoteTrackError(track, options, error);
    }
}

async function requestRemoteTrackCues<T extends SubtitleTrackLoadable>(
    track: T,
    options: SubtitleTrackLoadOptions<T>,
): Promise<SubtitleCue[]> {
    const text = await options.requestText(track.url ?? '', options.signal);
    return normalizeSubtitleCues(parseSubtitleText(text), { transcriptEligible: options.transcriptEligible });
}

function settleRemoteTrackCues<T extends SubtitleTrackLoadable>(
    track: T,
    options: SubtitleTrackLoadOptions<T>,
    cues: SubtitleCue[],
): SubtitleCue[] {
    if (cues.length) return cues;
    options.onRemoteEmpty?.(track);
    return [];
}

function settleRemoteTrackError<T extends SubtitleTrackLoadable>(
    track: T,
    options: SubtitleTrackLoadOptions<T>,
    error: unknown,
): SubtitleCue[] {
    throwIfRemoteTrackLoadAborted(options.signal, error);
    options.onRemoteError?.(track, error);
    return [];
}

function throwIfRemoteTrackLoadAborted(signal: AbortSignal | undefined, error: unknown): void {
    throwIfSubtitleTrackLoadAborted(signal);
    if (isAbortError(error)) throw error;
}

function throwIfSubtitleTrackLoadAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}
