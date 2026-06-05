import { uiText } from './i18n';
import { Logger } from './logger';
import { ShuffledAudioDeck } from './audio-playback-queue';
import { requestAudioUrl as requestUrl, type AudioRequestOptions } from './audio-request';
import {
    audioCandidateSelectionMode,
    audioPreloadLimits,
    cloneAudioCandidates,
    getAudioBagKey,
    getAudioCandidateCacheKey,
    getJpdbAudioBagKey,
    getOrderedAudioSources,
    isBrowserTextToSpeechSource,
    isJpdbWordAudioSource,
    isTextToSpeechFallbackSource,
    normalizeAttemptedAudioUrl,
    orderAudioCandidates,
    orderAudioSources,
    preparedAudioCacheKey,
    preloadableAudioSources,
    registerAudioAttempt,
    type AudioCandidate,
    type AudioPreloadOptions,
    type OrderedAudioSource,
} from './audio-source-resolution';
import { canAttemptAudiblePlayback, reserveGestureAudioElement } from './media-activation';
import { ObjectUrlCache } from './object-url-cache';
import { createPageMediaUrl } from './page-media-url';
import { DEFAULT_YOMU_PUBLIC_PROXY_URL, isKnownCorsBlockedPublicAudioCdnUrl } from './proxy-fetch';
import { uniqueStrings } from './string-utils';
import { getUserscriptHttpRequest } from './userscript';
import type { AudioSelectionMode, AudioSourceSetting, AudioSourceType, JPDBCard, ReaderSettings } from './types';

interface AudioPlaybackOptions {
    isCurrent?: () => boolean;
    userGesture?: boolean;
}

interface JpdbAudioPlaybackCandidate {
    audioIds: string[];
    deckId: string;
}

interface AudioSourcePlayResult {
    state: 'played' | 'superseded' | 'miss' | 'playback-error';
    errors: string[];
}

interface PreparedAudioCandidate {
    audio: HTMLAudioElement;
    candidate: AudioCandidate;
    id: string;
    bagKey: string;
    sourceType: AudioSourceType;
    sourceId: string;
    sourceBagKey: string;
}

interface AudioSourcePrepareResult {
    state: 'ready' | 'miss' | 'superseded';
    prepared?: PreparedAudioCandidate;
}

type PendingAudioSourcePreparation = Promise<CompletedAudioSourcePreparation>;

interface CompletedAudioSourcePreparation {
    promise: PendingAudioSourcePreparation;
    result: AudioSourcePrepareResult;
}

interface AudioPlaybackRequest {
    requestId: number;
    isCurrent: () => boolean;
    settings: ReaderSettings;
    sources: AudioSourceSetting[];
    userGesture: boolean;
}

interface SoftChimeNote {
    frequency: number;
    offset: number;
    duration: number;
    gain: number;
}

const JAPANESE_POD_101_UNAVAILABLE_SIZE = 52288;
const JAPANESE_POD_101_UNAVAILABLE_SHA256 = 'ae6398b5a27bc8c0a771df6c907ade794be15518174773c58c7c7ddd17098906';
const AUDIO_CANDIDATE_CACHE_TTL_MS = 10 * 60 * 1000;
const AUDIO_BLOB_CACHE_TTL_MS = 10 * 60 * 1000;
const READY_AUDIO_CACHE_TTL_MS = 5 * 60 * 1000;
const AUDIO_CANDIDATE_CACHE_LIMIT = 600;
const READY_AUDIO_CACHE_LIMIT = 160;
const AUDIO_SOURCE_RACE_STAGGER_MS = 120;
const LOOPBACK_AUDIO_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const KANA_ONLY_RE = /^[\u3040-\u30ffー・]+$/u;
const SOFT_CHIME_NOTES: SoftChimeNote[] = [
    { frequency: 587.33, offset: 0, duration: 0.22, gain: 0.032 },
    { frequency: 783.99, offset: 0.11, duration: 0.28, gain: 0.024 },
];
const JPDB_VOCABULARY_BASE_URL = 'https://jpdb.io/vocabulary';
const JPDB_SEARCH_URL = 'https://jpdb.io/search';
const JPDB_AUDIO_BASE_URL = 'https://jpdb.io/static/v';
const JPDB_AUDIO_ACCESS_HEADER = "please don't steal these files";
const JPDB_AUDIO_XOR_BYTES = [0x06, 0x23, 0x54, 0x0f] as const;
const JPDB_AUDIO_ID_RE = /^(?:\/static\/user\/)?[A-Za-z0-9_./-]+$/;
const JPDB_AUDIO_UNAVAILABLE_TTL_MS = 10 * 60 * 1000;
const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const AUDIO_PRECONNECT_RELS = ['preconnect', 'dns-prefetch'] as const;
const preconnectedAudioOrigins = new Set<string>();
const log = Logger.scope('Audio');

export { ShuffledAudioDeck } from './audio-playback-queue';

class AudioPlaybackAttemptError extends Error {
    constructor(error: unknown) {
        super(error instanceof Error ? error.message : String(error));
        this.name = 'AudioPlaybackAttemptError';
    }
}

export class AudioPlayer {
    private current?: HTMLAudioElement;
    private utterance?: SpeechSynthesisUtterance;
    private fallbackChimeContext?: AudioContext;
    private playRequestId = 0;
    private shuffledAudio = new ShuffledAudioDeck();
    private candidateCache = new Map<string, { expiresAt: number; promise: Promise<AudioCandidate[]> }>();
    private blobUrlCache = new ObjectUrlCache(AUDIO_BLOB_CACHE_TTL_MS);
    private jpdbAudioBlobUrlCache = new ObjectUrlCache(AUDIO_BLOB_CACHE_TTL_MS);
    private readyAudioCache = new Map<string, { expiresAt: number; promise: Promise<HTMLAudioElement> }>();
    private unavailableJpdbAudioIds = new Map<string, number>();

    constructor(private getSettings: () => ReaderSettings) {}

    clearCaches(): void {
        this.candidateCache.clear();
        this.blobUrlCache.clear();
        this.jpdbAudioBlobUrlCache.clear();
        this.readyAudioCache.clear();
        this.unavailableJpdbAudioIds.clear();
    }

    async play(card: JPDBCard, options: AudioPlaybackOptions = {}): Promise<boolean> {
        const request = this.audioPlaybackRequest(options);
        this.ensureAudioEnabled(request.settings);
        if (!canAttemptAudiblePlayback(request.userGesture)) return false;
        if (!request.isCurrent()) return false;
        this.stopCurrent();
        const reservedAudio = this.reserveGestureAudioElement(request);
        if (!request.sources.length) return await this.playNoAudioSources(card, request);

        const done = log.time('play', { term: card.spelling, sources: request.sources.map(source => source.type), viaBlob: true });
        const result = await this.playFromSources(request.sources, card, request.settings, request.requestId, request.isCurrent, reservedAudio);
        done();
        return this.finishPlaybackResult(card, request.settings, request.requestId, request.isCurrent, result);
    }

    private audioPlaybackRequest(options: AudioPlaybackOptions): AudioPlaybackRequest {
        const settings = this.getSettings();
        return {
            requestId: ++this.playRequestId,
            isCurrent: options.isCurrent ?? (() => true),
            settings,
            sources: getOrderedAudioSources(settings),
            userGesture: options.userGesture ?? false,
        };
    }

    private reserveGestureAudioElement(request: AudioPlaybackRequest): HTMLAudioElement | undefined {
        if (!shouldReserveGestureAudioElement(request)) return undefined;
        const audio = reserveGestureAudioElement(audioUrl => this.createAudioElement(audioUrl));
        this.current = audio;
        return audio;
    }

    private ensureAudioEnabled(settings: ReaderSettings): void {
        if (!settings.audioEnabled) throw new Error(uiText(settings.interfaceLanguage, 'audioPlaybackDisabledToast'));
    }

    private async playNoAudioSources(card: JPDBCard, request: AudioPlaybackRequest): Promise<boolean> {
        log.warn('No audio sources configured', { term: card.spelling });
        return await this.playMissingAudioFallback(request.settings, request.requestId, request.isCurrent);
    }

    private async finishPlaybackResult(
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
        result: AudioSourcePlayResult,
    ): Promise<boolean> {
        if (result.state === 'played') return true;
        if (result.state === 'playback-error') return false;
        if (result.state === 'superseded' || !this.isPlaybackCurrent(requestId, isCurrent)) return false;
        log.warn('No playable audio found', { term: card.spelling, errors: result.errors });
        return await this.playMissingAudioFallback(settings, requestId, isCurrent);
    }

    private async playFromSources(
        sources: AudioSourceSetting[],
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
        reservedAudio?: HTMLAudioElement,
    ): Promise<AudioSourcePlayResult> {
        const errors: string[] = [];
        const triedUrls = new Set<string>();
        if (settings.audioTtsMode === 'source-order') {
            const result = await this.playOrderedSources(orderAudioSources(sources, settings.audioSelectionMode, card, this.shuffledAudio), card, settings, requestId, triedUrls, isCurrent, errors, reservedAudio);
            return { state: result, errors };
        }

        const realAudioSources = sources.filter(source => !isTextToSpeechFallbackSource(source));
        const realAudioResult = await this.playGreedyAudioSources(orderAudioSources(realAudioSources, settings.audioSelectionMode, card, this.shuffledAudio), card, settings, requestId, triedUrls, isCurrent, errors, reservedAudio);
        if (realAudioResult !== 'miss') return { state: realAudioResult, errors };

        const jpdbWordAudioResult = await this.playOrderedSources(orderAudioSources(sources.filter(isJpdbWordAudioSource), settings.audioSelectionMode, card, this.shuffledAudio), card, settings, requestId, triedUrls, isCurrent, errors);
        if (jpdbWordAudioResult !== 'miss') return { state: jpdbWordAudioResult, errors };

        const textToSpeechResult = await this.playOrderedSources(orderAudioSources(sources.filter(isBrowserTextToSpeechSource), settings.audioSelectionMode, card, this.shuffledAudio), card, settings, requestId, triedUrls, isCurrent, errors);
        return { state: textToSpeechResult, errors };
    }

    private async playOrderedSources(
        sources: OrderedAudioSource[],
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        triedUrls: Set<string>,
        isCurrent: () => boolean,
        errors: string[],
        reservedAudio?: HTMLAudioElement,
    ): Promise<AudioSourcePlayResult['state']> {
        for (const sourceEntry of sources) {
            const result = await this.playSourceWithErrors(sourceEntry, card, settings, requestId, triedUrls, isCurrent, errors, reservedAudio);
            if (result !== 'miss') return result;
        }
        return 'miss';
    }

    private async playGreedyAudioSources(
        sources: OrderedAudioSource[],
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        triedUrls: Set<string>,
        isCurrent: () => boolean,
        errors: string[],
        reservedAudio?: HTMLAudioElement,
    ): Promise<AudioSourcePlayResult['state']> {
        if (sources.length <= 1) {
            return await this.playOrderedSources(sources, card, settings, requestId, triedUrls, isCurrent, errors, reservedAudio);
        }

        const pending = new Set<PendingAudioSourcePreparation>();
        let nextSourceIndex = 0;
        const startNextSource = () => {
            const sourceEntry = sources[nextSourceIndex++];
            if (sourceEntry) pending.add(this.prepareSourceWithErrors(sourceEntry, card, settings, requestId, triedUrls, isCurrent, errors));
        };

        while (pending.size || nextSourceIndex < sources.length) {
            if (!pending.size) {
                startNextSource();
                continue;
            }

            const current = nextSourceIndex < sources.length
                ? await Promise.race([
                    ...pending,
                    delayAudioSourceRace(AUDIO_SOURCE_RACE_STAGGER_MS),
                ])
                : await Promise.race(pending);
            if (!current) {
                startNextSource();
                continue;
            }
            pending.delete(current.promise);
            if (current.result.state === 'superseded') return 'superseded';
            if (current.result.state !== 'ready' || !current.result.prepared) continue;

            const result = await this.playPreparedCandidate(current.result.prepared, settings, requestId, isCurrent, reservedAudio)
                .catch(error => {
                    errors.push(error instanceof Error ? error.message : String(error));
                    return error instanceof AudioPlaybackAttemptError ? 'playback-error' as const : 'miss' as const;
                });
            if (result !== 'miss') return result;
        }
        return 'miss';
    }

    private prepareSourceWithErrors(
        sourceEntry: OrderedAudioSource,
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        triedUrls: Set<string>,
        isCurrent: () => boolean,
        errors: string[],
    ): PendingAudioSourcePreparation {
        let promise!: PendingAudioSourcePreparation;
        promise = this.prepareSource(sourceEntry, card, settings, requestId, triedUrls, isCurrent)
            .catch(error => {
                errors.push(error instanceof Error ? error.message : String(error));
                this.shuffledAudio.markSkipped(sourceEntry.bagKey, sourceEntry.id);
                return { state: 'miss' as const };
            })
            .then(result => ({ promise, result }));
        return promise;
    }

    private async prepareSource(
        sourceEntry: OrderedAudioSource,
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        triedUrls: Set<string>,
        isCurrent: () => boolean,
    ): Promise<AudioSourcePrepareResult> {
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return { state: 'superseded' };
        const { source } = sourceEntry;
        const candidates = await this.getCachedAudioCandidates(source, card, settings.audioTimeoutMs, settings.corsProxyUrl);
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return { state: 'superseded' };
        const bagKey = getAudioBagKey(source, card);
        for (const { candidate, id } of orderAudioCandidates(candidates, audioCandidateSelectionMode(source.type, settings.audioSelectionMode), bagKey, this.shuffledAudio)) {
            if (!registerAudioAttempt(triedUrls, candidate)) {
                this.shuffledAudio.markSkipped(bagKey, id);
                continue;
            }
            const audio = await Promise.resolve(this.createPlayableAudio(candidate, source.type, settings)).catch(() => null);
            if (!this.isPlaybackCurrent(requestId, isCurrent)) return { state: 'superseded' };
            if (audio) return { state: 'ready', prepared: { audio, candidate, id, bagKey, sourceType: source.type, sourceId: sourceEntry.id, sourceBagKey: sourceEntry.bagKey } };
            this.shuffledAudio.markSkipped(bagKey, id);
        }
        this.shuffledAudio.markSkipped(sourceEntry.bagKey, sourceEntry.id);
        return { state: 'miss' };
    }

    private async playPreparedCandidate(
        prepared: PreparedAudioCandidate,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
        reservedAudio?: HTMLAudioElement,
    ): Promise<AudioSourcePlayResult['state']> {
        let played = false;
        try {
            const audio = reservedAudio
                ? await this.createPlayableAudio(prepared.candidate, prepared.sourceType, settings, reservedAudio)
                : prepared.audio;
            played = await this.playPreparedAudio(audio, requestId, isCurrent);
        } catch (error) {
            throw new AudioPlaybackAttemptError(error);
        }
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return 'superseded';
        if (!played) return 'miss';
        this.shuffledAudio.markPlayed(prepared.bagKey, prepared.id);
        this.shuffledAudio.markPlayed(prepared.sourceBagKey, prepared.sourceId);
        return 'played';
    }

    private async playSourceWithErrors(
        sourceEntry: OrderedAudioSource,
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        triedUrls: Set<string>,
        isCurrent: () => boolean,
        errors: string[],
        reservedAudio?: HTMLAudioElement,
    ): Promise<AudioSourcePlayResult['state']> {
        if (!this.isPlaybackCurrent(requestId, isCurrent)) {
            return 'superseded';
        }
        try {
            const played = await this.playFromSource(sourceEntry, card, settings, requestId, triedUrls, isCurrent, reservedAudio);
            const result = this.audioSourceAttemptResult(played, requestId, isCurrent);
            if (result === 'played') this.shuffledAudio.markPlayed(sourceEntry.bagKey, sourceEntry.id);
            else if (result === 'miss') this.shuffledAudio.markSkipped(sourceEntry.bagKey, sourceEntry.id);
            return result;
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
            if (error instanceof AudioPlaybackAttemptError) return 'playback-error';
            this.shuffledAudio.markSkipped(sourceEntry.bagKey, sourceEntry.id);
            return 'miss';
        }
    }

    private audioSourceAttemptResult(
        played: boolean,
        requestId: number,
        isCurrent: () => boolean,
    ): AudioSourcePlayResult['state'] {
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return 'superseded';
        if (!played) return 'miss';
        return 'played';
    }

    preload(card: JPDBCard, options: AudioPreloadOptions = {}): void {
        const settings = this.getSettings();
        if (!settings.audioEnabled) return;
        const { sourceLimit, candidateLimit, prepareAudio } = audioPreloadLimits(options);
        const sources = preloadableAudioSources(getOrderedAudioSources(settings), settings).slice(0, sourceLimit);
        if (!sources.length) return;

        for (const source of sources) {
            void this.getCachedAudioCandidates(source, card, settings.audioTimeoutMs, settings.corsProxyUrl)
                .then(candidates => {
                    const triedUrls = new Set<string>();
                    for (const { candidate } of orderAudioCandidates(candidates, audioCandidateSelectionMode(source.type, settings.audioSelectionMode), getAudioBagKey(source, card), this.shuffledAudio).slice(0, candidateLimit)) {
                        const candidateKey = normalizeAttemptedAudioUrl(candidate.url);
                        if (triedUrls.has(candidateKey)) continue;
                        triedUrls.add(candidateKey);
                        preconnectAudioUrl(candidate.url);
                        if (!prepareAudio) continue;
                        void this.preparePlayableAudio(candidate, settings.audioTimeoutMs, settings.audioSelectionMode, true)
                            .catch(() => undefined);
                    }
                })
                .catch(() => undefined);
        }
    }

    stop(): void {
        this.playRequestId++;
        this.stopCurrent();
    }

    async playJapaneseText(text: string, voiceName = ''): Promise<void> {
        const settings = this.getSettings();
        const requestId = ++this.playRequestId;
        const trimmed = text.trim();
        if (!trimmed) throw new Error(uiText(settings.interfaceLanguage, 'noTextToRead'));

        this.stopCurrent();
        await this.playTextToSpeech(trimmed, voiceName);
        if (requestId !== this.playRequestId) this.stopCurrent();
    }

    async playJpdbAudio(audioIds: string | string[], options: { userGesture?: boolean } = {}): Promise<boolean> {
        const settings = this.getSettings();
        this.ensureAudioEnabled(settings);
        if (!canAttemptAudiblePlayback(options.userGesture)) return false;
        const candidates = this.availableJpdbPlaybackCandidates(jpdbAudioPlaybackCandidates(audioIds));
        if (!candidates.length) throw new Error(uiText(settings.interfaceLanguage, 'jpdbExampleAudioUnavailable'));

        const requestId = ++this.playRequestId;
        this.stopCurrent();
        const reservedAudio = this.reserveJpdbGestureAudioElement(options.userGesture);
        const isCurrent = () => true;
        const bagKey = getJpdbAudioBagKey(candidates.map(candidate => candidate.deckId));
        const byDeckId = new Map(candidates.map(candidate => [candidate.deckId, candidate]));
        for (const deckId of this.shuffledAudio.order(bagKey, candidates.map(candidate => candidate.deckId))) {
            const candidate = byDeckId.get(deckId);
            if (!candidate) continue;
            try {
                if (await this.playJpdbAudioCandidate(candidate, settings, requestId, isCurrent, reservedAudio)) {
                    this.shuffledAudio.markPlayed(bagKey, deckId);
                    return true;
                }
            } catch {
                candidate.audioIds.forEach(audioId => this.markJpdbAudioUnavailable(audioId));
                this.shuffledAudio.markSkipped(bagKey, deckId);
                // Try the next JPDB candidate when a page lists more than one.
            }
        }
        return await this.playMissingAudioFallback(settings, requestId, isCurrent);
    }

    async playMediaUrl(audioUrl: string): Promise<boolean> {
        const settings = this.getSettings();
        this.ensureAudioEnabled(settings);
        if (!canAttemptAudiblePlayback(true)) return false;
        const requestId = ++this.playRequestId;
        this.stopCurrent();
        const playableUrl = await this.prepareDirectMediaUrl(audioUrl, settings);
        const audio = await this.createReadyAudio(playableUrl);
        return await this.playPreparedAudio(audio, requestId, () => true);
    }

    private async prepareDirectMediaUrl(audioUrl: string, settings: ReaderSettings): Promise<string> {
        if (!shouldFetchDirectMediaAsBlob(audioUrl)) return audioUrl;
        return await this.fetchAudioAsBlobUrl(audioUrl, audioUrl, settings.audioTimeoutMs, settings.audioSelectionMode);
    }

    private reserveJpdbGestureAudioElement(userGesture = false): HTMLAudioElement | undefined {
        if (!userGesture) return undefined;
        const audio = reserveGestureAudioElement(audioUrl => this.createAudioElement(audioUrl));
        this.current = audio;
        return audio;
    }

    private jpdbAudioBlobUrl(audioId: string, settings: ReaderSettings): Promise<string> {
        const request = jpdbAudioRequest(audioId);
        return this.jpdbAudioBlobUrlCache.getOrCreate(audioId, async () => {
            const response = await requestUrl(request.url, 'blob', settings.audioTimeoutMs, {
                headers: request.headers,
                proxyUrl: settings.corsProxyUrl,
                language: settings.interfaceLanguage,
                credentials: 'same-origin',
                withCredentials: true,
            });
            if (!(response instanceof Blob)) throw new Error(uiText(settings.interfaceLanguage, 'jpdbAudioPlayableFileMissing'));
            return createPageMediaUrl(await decodeJpdbAudioBlob(response, request.encoded));
        });
    }

    private async playJpdbAudioCandidate(
        candidate: JpdbAudioPlaybackCandidate,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
        reservedAudio?: HTMLAudioElement,
    ): Promise<boolean> {
        return await this.playJpdbAudioSegment(candidate.audioIds, 0, settings, requestId, isCurrent, reservedAudio);
    }

    private async playJpdbAudioSegment(
        audioIds: string[],
        index: number,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
        reservedAudio?: HTMLAudioElement,
    ): Promise<boolean> {
        const audioId = audioIds[index];
        if (!audioId) return false;
        const audioUrl = await this.jpdbAudioBlobUrl(audioId, settings);
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        const audio = reservedAudio
            ? await this.createReadyAudio(audioUrl, reservedAudio)
            : await this.createReadyAudio(audioUrl);
        if (!(await this.playPreparedAudio(audio, requestId, isCurrent))) return false;
        this.queueNextJpdbAudioSegment(audio, audioIds, index + 1, settings, requestId, isCurrent);
        return true;
    }

    private queueNextJpdbAudioSegment(
        audio: HTMLAudioElement,
        audioIds: string[],
        index: number,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
    ): void {
        if (index >= audioIds.length) return;
        audio.addEventListener('ended', () => {
            if (!this.isPlaybackCurrent(requestId, isCurrent)) return;
            void this.playJpdbAudioSegment(audioIds, index, settings, requestId, isCurrent)
                .catch(error => {
                    const audioId = audioIds[index];
                    if (audioId) this.markJpdbAudioUnavailable(audioId);
                    log.warn('JPDB grouped audio segment failed', { audioId }, error);
                });
        }, { once: true });
    }

    private stopCurrent(): void {
        this.current?.pause();
        this.current = undefined;
        if (this.utterance) {
            speechSynthesis.cancel();
            this.utterance = undefined;
        }
        if (this.fallbackChimeContext) {
            void this.fallbackChimeContext.close().catch(() => undefined);
            this.fallbackChimeContext = undefined;
        }
    }

    private async playFromSource(
        sourceEntry: OrderedAudioSource,
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        triedUrls: Set<string>,
        isCurrent: () => boolean,
        reservedAudio?: HTMLAudioElement,
    ): Promise<boolean> {
        const { source } = sourceEntry;
        if (isBrowserTextToSpeechSource(source)) return await this.playFromTextToSpeechSource(source, card, requestId, isCurrent);

        const candidates = await this.getCachedAudioCandidates(source, card, settings.audioTimeoutMs, settings.corsProxyUrl);
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        const bagKey = getAudioBagKey(source, card);
        return await this.playFromAudioCandidates(candidates, source.type, settings, requestId, triedUrls, isCurrent, bagKey, reservedAudio);
    }

    private async playFromTextToSpeechSource(source: AudioSourceSetting, card: JPDBCard, requestId: number, isCurrent: () => boolean): Promise<boolean> {
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        await this.playTextToSpeech(source.type === 'text-to-speech-reading' ? card.reading : card.spelling, source.voice);
        return this.isPlaybackCurrent(requestId, isCurrent);
    }

    private async playFromAudioCandidates(
        candidates: AudioCandidate[],
        sourceType: AudioSourceType,
        settings: ReaderSettings,
        requestId: number,
        triedUrls: Set<string>,
        isCurrent: () => boolean,
        bagKey: string,
        reservedAudio?: HTMLAudioElement,
    ): Promise<boolean> {
        const playableCandidates = this.availableAudioCandidates(sourceType, candidates);
        for (const { candidate, id } of orderAudioCandidates(playableCandidates, audioCandidateSelectionMode(sourceType, settings.audioSelectionMode), bagKey, this.shuffledAudio)) {
            if (!registerAudioAttempt(triedUrls, candidate)) {
                this.shuffledAudio.markSkipped(bagKey, id);
                continue;
            }
            if (await this.playAudioCandidate(candidate, sourceType, id, bagKey, settings, requestId, isCurrent, reservedAudio)) return true;
            this.shuffledAudio.markSkipped(bagKey, id);
        }
        return false;
    }

    private async playAudioCandidate(
        candidate: AudioCandidate,
        sourceType: AudioSourceType,
        id: string,
        bagKey: string,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
        reservedAudio?: HTMLAudioElement,
    ): Promise<boolean> {
        let audio: HTMLAudioElement;
        try {
            audio = await this.createPlayableAudio(candidate, sourceType, settings, reservedAudio);
        } catch {
            if (sourceType === 'jpdb-tts' && candidate.jpdbAudioId) this.markJpdbAudioUnavailable(candidate.jpdbAudioId);
            return false;
        }
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        let played = false;
        try {
            played = await this.playPreparedAudio(audio, requestId, isCurrent);
        } catch (error) {
            throw new AudioPlaybackAttemptError(error);
        }
        if (!played) return false;
        this.shuffledAudio.markPlayed(bagKey, id);
        return true;
    }

    private availableAudioCandidates(sourceType: AudioSourceType, candidates: AudioCandidate[]): AudioCandidate[] {
        if (sourceType !== 'jpdb-tts') return candidates;
        const available = candidates.filter(candidate =>
            !candidate.jpdbAudioId || !this.isJpdbAudioUnavailable(candidate.jpdbAudioId)
        );
        return available.length ? available : candidates;
    }

    private availableJpdbPlaybackCandidates(candidates: JpdbAudioPlaybackCandidate[]): JpdbAudioPlaybackCandidate[] {
        const available = candidates.filter(candidate => candidate.audioIds.every(audioId => !this.isJpdbAudioUnavailable(audioId)));
        return available.length ? available : candidates;
    }

    private markJpdbAudioUnavailable(audioId: string): void {
        this.unavailableJpdbAudioIds.set(audioId, Date.now() + JPDB_AUDIO_UNAVAILABLE_TTL_MS);
    }

    private isJpdbAudioUnavailable(audioId: string): boolean {
        const expiresAt = this.unavailableJpdbAudioIds.get(audioId);
        if (!expiresAt) return false;
        if (expiresAt > Date.now()) return true;
        this.unavailableJpdbAudioIds.delete(audioId);
        return false;
    }

    private createPlayableAudio(candidate: AudioCandidate, sourceType: AudioSourceType, settings: ReaderSettings, reservedAudio?: HTMLAudioElement): Promise<HTMLAudioElement> | HTMLAudioElement {
        if (sourceType === 'jpdb-tts' && candidate.jpdbAudioId) {
            return this.preparePlayableJpdbAudio(candidate.jpdbAudioId, settings, reservedAudio);
        }
        const audioViaBlob = settings.audioViaBlob || shouldForceBlobAudioPlayback(sourceType) || shouldForceBlobAudioCandidate(candidate);
        return audioViaBlob
            ? this.preparePlayableAudio(candidate, settings.audioTimeoutMs, settings.audioSelectionMode, audioViaBlob, reservedAudio)
            : reservedAudio ? this.createReadyAudio(candidate.url, reservedAudio) : this.createAudioElement(candidate.url);
    }

    private async preparePlayableJpdbAudio(audioId: string, settings: ReaderSettings, reservedAudio?: HTMLAudioElement): Promise<HTMLAudioElement> {
        const audioUrl = await this.jpdbAudioBlobUrl(audioId, settings);
        return reservedAudio ? this.createReadyAudio(audioUrl, reservedAudio) : this.createReadyAudio(audioUrl);
    }

    private isPlaybackCurrent(requestId: number, isCurrent: () => boolean): boolean {
        return requestId === this.playRequestId && isCurrent();
    }

    private prepareAudioUrl(candidate: AudioCandidate, timeoutMs: number, mode: AudioSelectionMode, audioViaBlob: boolean): Promise<string> {
        const fetchAsBlob = shouldFetchCandidateAsBlob(candidate, audioViaBlob);
        if (!fetchAsBlob) return Promise.resolve(candidate.url);

        preconnectAudioUrl(candidate.url);
        const key = preparedAudioCacheKey(candidate, mode, fetchAsBlob);
        return this.blobUrlCache.getOrCreate(key, () => this.fetchAudioAsBlobUrl(candidate.url, candidate.sourceUrl, timeoutMs, mode));
    }

    private preparePlayableAudio(candidate: AudioCandidate, timeoutMs: number, mode: AudioSelectionMode, audioViaBlob: boolean, reservedAudio?: HTMLAudioElement): Promise<HTMLAudioElement> {
        const fetchAsBlob = shouldFetchCandidateAsBlob(candidate, audioViaBlob);
        const key = preparedAudioCacheKey(candidate, mode, fetchAsBlob);
        if (reservedAudio) return this.prepareAudioUrl(candidate, timeoutMs, mode, audioViaBlob)
            .then(audioUrl => this.createReadyAudio(audioUrl, reservedAudio));

        const now = Date.now();
        const cached = this.readyAudioCache.get(key);
        if (cached && cached.expiresAt > now) return cached.promise;
        if (cached) this.readyAudioCache.delete(key);

        let promise!: Promise<HTMLAudioElement>;
        promise = this.prepareAudioUrl(candidate, timeoutMs, mode, audioViaBlob)
            .then(audioUrl => this.createReadyAudio(audioUrl))
            .catch(error => {
                if (this.readyAudioCache.get(key)?.promise === promise) this.readyAudioCache.delete(key);
                throw error;
            });
        this.readyAudioCache.set(key, { expiresAt: now + READY_AUDIO_CACHE_TTL_MS, promise });
        pruneTimedCache(this.readyAudioCache, READY_AUDIO_CACHE_LIMIT, now);
        return promise;
    }

    private async createReadyAudio(audioUrl: string, audio = this.createAudioElement(audioUrl)): Promise<HTMLAudioElement> {
        audio.loop = false;
        if (audio.src !== audioUrl) audio.src = audioUrl;
        audio.load?.();
        return audio;
    }

    private createAudioElement(audioUrl: string): HTMLAudioElement {
        const audio = document.createElement('audio');
        audio.src = audioUrl;
        audio.preload = 'auto';
        return audio;
    }

    private async playPreparedAudio(audio: HTMLAudioElement, requestId: number, isCurrent: () => boolean): Promise<boolean> {
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        this.current = audio;
        this.rewindPreparedAudio(audio);
        await audio.play();
        return true;
    }

    private rewindPreparedAudio(audio: HTMLAudioElement): void {
        try {
            if (audio.readyState > HTMLMediaElement.HAVE_NOTHING) audio.currentTime = 0;
        } catch {
            // Some direct remote audio URLs do not allow seeking before metadata loads.
        }
    }

    private getCachedAudioCandidates(source: AudioSourceSetting, card: JPDBCard, timeoutMs: number, proxyUrl: string): Promise<AudioCandidate[]> {
        const key = getAudioCandidateCacheKey(source, card);
        const now = Date.now();
        const cached = this.candidateCache.get(key);
        if (cached && cached.expiresAt > now) {
            return cached.promise.then(cloneAudioCandidates);
        }

        let promise!: Promise<AudioCandidate[]>;
        promise = getAudioCandidates(source, card, timeoutMs, proxyUrl)
            .then(candidates => {
                if (!shouldCacheAudioCandidates(source, candidates) && this.candidateCache.get(key)?.promise === promise) {
                    this.candidateCache.delete(key);
                }
                return cloneAudioCandidates(candidates);
            })
            .catch(error => {
                if (this.candidateCache.get(key)?.promise === promise) this.candidateCache.delete(key);
                throw error;
            });
        this.candidateCache.set(key, { expiresAt: now + AUDIO_CANDIDATE_CACHE_TTL_MS, promise });
        pruneTimedCache(this.candidateCache, AUDIO_CANDIDATE_CACHE_LIMIT, now);
        return promise.then(cloneAudioCandidates);
    }

    private async fetchAudioAsBlobUrl(url: string, sourceUrl: string, timeoutMs: number, mode: AudioSelectionMode): Promise<string> {
        const settings = this.getSettings();
        const response = await requestUrl(url, 'blob', timeoutMs, { proxyUrl: settings.corsProxyUrl, language: settings.interfaceLanguage });
        if (isJsonAudioResponse(response)) return this.fetchNestedAudioBlobUrl(response, sourceUrl, timeoutMs, mode, settings);

        if (!(response instanceof Blob)) throw new Error(uiText(settings.interfaceLanguage, 'audioSourceReturnedNoAudio'));
        await assertPlayableAudioBlob(response, url, sourceUrl, settings.interfaceLanguage);
        const blobUrl = await createPageMediaUrl(response);
        return blobUrl;
    }

    private async fetchNestedAudioBlobUrl(response: Blob, sourceUrl: string, timeoutMs: number, mode: AudioSelectionMode, settings: ReaderSettings): Promise<string> {
        const json = JSON.parse(await response.text()) as unknown;
        const nestedUrl = findAudioUrl(json, sourceUrl, mode);
        if (!nestedUrl) throw new Error(uiText(settings.interfaceLanguage, 'audioJsonMissingPlayableUrl'));
        return this.fetchAudioAsBlobUrl(nestedUrl, sourceUrl, timeoutMs, mode);
    }

    private playTextToSpeech(text: string, voiceName: string): Promise<void> {
        const settings = this.getSettings();
        if (!('speechSynthesis' in window)) throw new Error(uiText(settings.interfaceLanguage, 'textToSpeechUnavailable'));
        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ja-JP';
            const voices = speechSynthesis.getVoices();
            utterance.voice = (voiceName ? voices.find(voice => voice.name === voiceName) : undefined)
                ?? voices.find(voice => voice.lang.toLowerCase().startsWith('ja'))
                ?? null;
            utterance.onend = () => resolve();
            utterance.onerror = () => reject(new Error(uiText(settings.interfaceLanguage, 'textToSpeechFailed')));
            this.utterance = utterance;
            speechSynthesis.speak(utterance);
        });
    }

    private async playMissingAudioFallback(settings: ReaderSettings, requestId: number, isCurrent: () => boolean): Promise<boolean> {
        if (!this.shouldPlayMissingAudioFallback(settings, requestId, isCurrent)) return false;
        return await this.tryPlayMissingAudioFallback(requestId, isCurrent);
    }

    private shouldPlayMissingAudioFallback(settings: ReaderSettings, requestId: number, isCurrent: () => boolean): boolean {
        if (settings.audioFallbackChimeEnabled) return this.isPlaybackCurrent(requestId, isCurrent);
        return false;
    }

    private async tryPlayMissingAudioFallback(requestId: number, isCurrent: () => boolean): Promise<boolean> {
        try {
            return await this.playSoftChime(requestId, isCurrent);
        } catch {
            return false;
        }
    }

    private async playSoftChime(requestId: number, isCurrent: () => boolean): Promise<boolean> {
        const AudioContextCtor = getAudioContextConstructor();
        if (!AudioContextCtor) return false;

        const context = new AudioContextCtor();
        this.fallbackChimeContext = context;
        await resumeAudioContext(context);
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;

        scheduleSoftChime(context, context.currentTime + 0.015);
        await waitForSoftChime();
        if (this.fallbackChimeContext === context) {
            this.fallbackChimeContext = undefined;
            await context.close().catch(() => undefined);
        }
        return true;
    }
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
    return window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

async function resumeAudioContext(context: AudioContext): Promise<void> {
    if (context.state !== 'suspended') return;
    await context.resume().catch(() => undefined);
}

function scheduleSoftChime(context: AudioContext, start: number): void {
    const output = createSoftChimeOutput(context, start);
    SOFT_CHIME_NOTES.forEach(note => scheduleSoftChimeNote(context, output, start, note));
}

function createSoftChimeOutput(context: AudioContext, start: number): BiquadFilterNode {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, start);

    const master = context.createGain();
    master.gain.setValueAtTime(0.72, start);
    filter.connect(master);
    master.connect(context.destination);
    return filter;
}

function scheduleSoftChimeNote(context: AudioContext, output: AudioNode, start: number, note: SoftChimeNote): void {
    const noteStart = start + note.offset;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + note.duration + 0.03);
}

function waitForSoftChime(): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, 460));
}

export function formatAudioUrl(template: string, card: JPDBCard): string {
    const replacements: Record<string, string> = {
        term: card.spelling,
        reading: card.reading,
        language: 'ja',
    };

    return template.replace(/\{(term|reading|language)\}/g, (_, key: string) =>
        encodeURIComponent(replacements[key] ?? ''),
    );
}

export function findAudioUrl(value: unknown, sourceUrl?: string, mode: AudioSelectionMode = 'first'): string | null {
    const urls = findAudioUrls(value, sourceUrl);
    if (!urls.length) return null;
    return mode === 'random' ? urls[Math.floor(Math.random() * urls.length)] : urls[0];
}

export function findAudioUrls(value: unknown, sourceUrl?: string): string[] {
    const direct = directAudioUrlsForValue(value, sourceUrl);
    return direct ?? [];
}

export function blobToDataUrl(blob: Blob, language: ReaderSettings['interfaceLanguage'] = 'en'): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error ?? new Error(uiText(language, 'couldNotReadAudio')));
        reader.readAsDataURL(blob);
    });
}

function directAudioUrlsForValue(value: unknown, sourceUrl?: string): string[] | null {
    if (!value) return [];
    if (typeof value === 'string') return findAudioUrlsInString(value, sourceUrl);
    return structuredAudioUrlsForValue(value, sourceUrl);
}

function shouldForceBlobAudioPlayback(sourceType: AudioSourceType): boolean {
    return sourceType === 'jpod101';
}

function shouldForceBlobAudioCandidate(candidate: AudioCandidate): boolean {
    return isKnownCorsBlockedPublicAudioCdnUrl(candidate.url)
        || isKnownCorsBlockedPublicAudioCdnUrl(candidate.sourceUrl);
}

function shouldFetchDirectMediaAsBlob(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

function structuredAudioUrlsForValue(value: unknown, sourceUrl?: string): string[] | null {
    if (Array.isArray(value)) return uniqueAudioUrls(value.flatMap(item => findAudioUrls(item, sourceUrl)));
    return typeof value === 'object' ? findAudioUrlsInRecord(value as Record<string, unknown>, sourceUrl) : null;
}

function findAudioUrlsInString(value: string, sourceUrl?: string): string[] {
    if (value.startsWith('data:audio/')) return [value];
    if (/^https?:\/\//.test(value) && isLikelyAudioUrl(value)) return [normalizeAudioUrl(value, sourceUrl)];
    return uniqueAudioUrls(Array.from(value.matchAll(/https?:\/\/[^\s)"'<>\]]+/gi))
        .map(match => match[0])
        .filter(isLikelyAudioUrl)
        .map(url => normalizeAudioUrl(url, sourceUrl)));
}

function findAudioUrlsInRecord(record: Record<string, unknown>, sourceUrl?: string): string[] {
    const known = uniqueAudioUrls([...preferredAudioRecordUrls(record, sourceUrl), ...directAudioRecordUrls(record, sourceUrl)]);
    return known.length ? known : nestedAudioRecordUrls(record, sourceUrl);
}

function preferredAudioRecordUrls(record: Record<string, unknown>, sourceUrl?: string): string[] {
    return ['audioSources', 'sources', 'audio', 'audioUrl', 'src', 'source']
        .flatMap(key => findAudioUrls(record[key], sourceUrl));
}

function directAudioRecordUrls(record: Record<string, unknown>, sourceUrl?: string): string[] {
    return typeof record.url === 'string' && isLikelyAudioRecord(record)
        ? findAudioUrls(record.url, sourceUrl)
        : [];
}

function nestedAudioRecordUrls(record: Record<string, unknown>, sourceUrl?: string): string[] {
    const knownKeys = new Set(['url', 'audioSources', 'sources', 'audio', 'audioUrl', 'src', 'source']);
    return uniqueAudioUrls(Object.entries(record)
        .filter(([key]) => !knownKeys.has(key))
        .flatMap(([, nested]) => findAudioUrls(nested, sourceUrl)));
}

export async function isUnavailableJapanesePod101Audio(blob: Blob): Promise<boolean> {
    if (blob.size !== JAPANESE_POD_101_UNAVAILABLE_SIZE) return false;
    try {
        const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        const hash = [...new Uint8Array(digest)]
            .map(value => value.toString(16).padStart(2, '0'))
            .join('');
        return hash === JAPANESE_POD_101_UNAVAILABLE_SHA256;
    } catch {
        return true;
    }
}

export function isJsonAudioResponse(response: unknown): response is Blob {
    return response instanceof Blob && response.type.includes('json');
}

export async function assertPlayableAudioBlob(response: Blob, url: string, sourceUrl: string, language: ReaderSettings['interfaceLanguage'] = 'en'): Promise<void> {
    if (isErrorDocumentAudioBlob(response) || (!isLikelyAudioBlob(response) && !isLikelyAudioUrl(url) && !isLikelyAudioUrl(sourceUrl))) {
        throw new Error(formatNonAudioResponseMessage(language, response.type));
    }
    if ((isJapanesePod101Url(url) || isJapanesePod101Url(sourceUrl)) && await isUnavailableJapanesePod101Audio(response)) {
        throw new Error(uiText(language, 'japanesePod101NoAudio'));
    }
}

function formatNonAudioResponseMessage(language: ReaderSettings['interfaceLanguage'], contentType: string): string {
    const label = contentType || uiText(language, 'audioUnknownContentType');
    return uiText(language, 'audioRequestReturnedNonAudioWithType').replace('{type}', label);
}

function isErrorDocumentAudioBlob(blob: Blob): boolean {
    const type = blob.type.toLowerCase();
    return type.startsWith('text/') || ['html', 'xml', 'json'].some(marker => type.includes(marker));
}

function isLikelyAudioBlob(blob: Blob): boolean {
    return blob.type.toLowerCase().startsWith('audio/');
}

function shouldReserveGestureAudioElement(request: AudioPlaybackRequest): boolean {
    return request.userGesture
        && request.sources.some(source => !isBrowserTextToSpeechSource(source));
}

function delayAudioSourceRace(ms: number): Promise<null> {
    return new Promise(resolve => window.setTimeout(() => resolve(null), ms));
}

function pruneTimedCache<T>(cache: Map<string, { expiresAt: number; promise: Promise<T> }>, limit: number, now = Date.now()): void {
    for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(key);
    }
    while (cache.size > limit) {
        const oldest = cache.keys().next().value;
        if (typeof oldest !== 'string') break;
        cache.delete(oldest);
    }
}

export async function getAudioCandidates(source: AudioSourceSetting, card: JPDBCard, timeoutMs: number, proxyUrl: string): Promise<AudioCandidate[]> {
    return await (AUDIO_CANDIDATE_LOADERS[source.type] ?? loadNoAudioCandidates)(source, card, timeoutMs, proxyUrl);
}

function shouldCacheAudioCandidates(source: AudioSourceSetting, candidates: AudioCandidate[]): boolean {
    return source.type !== 'jpdb-tts' || candidates.length > 1;
}

type AudioCandidateLoader = (source: AudioSourceSetting, card: JPDBCard, timeoutMs: number, proxyUrl: string) => Promise<AudioCandidate[]>;

const AUDIO_CANDIDATE_LOADERS: Partial<Record<AudioSourceType, AudioCandidateLoader>> = {
    custom: loadCustomAudioCandidates,
    'custom-json': loadCustomJsonAudioCandidates,
    jpod101: loadJapanesePod101AudioCandidates,
    'language-pod-101': loadLanguagePod101AudioCandidates,
    jisho: async (_source, card, timeoutMs, proxyUrl) => urlsToAudioCandidates(await getJishoAudioUrls(card, timeoutMs, proxyUrl)),
    'lingua-libre': async (_source, card, timeoutMs, proxyUrl) => urlsToAudioCandidates(await getCommonsAudioUrls(card.spelling, 'lingua-libre', timeoutMs, proxyUrl)),
    wiktionary: async (_source, card, timeoutMs, proxyUrl) => urlsToAudioCandidates(await getCommonsAudioUrls(card.spelling, 'wiktionary', timeoutMs, proxyUrl)),
    'jpdb-tts': async (_source, card, timeoutMs, proxyUrl) => jpdbAudioIdsToCandidates(await getJpdbTtsAudioIds(card, timeoutMs, proxyUrl)),
};

async function loadNoAudioCandidates(): Promise<AudioCandidate[]> {
    return [];
}

async function loadCustomAudioCandidates(source: AudioSourceSetting, card: JPDBCard): Promise<AudioCandidate[]> {
    if (!source.url.trim()) return [];
    const url = formatAudioUrl(source.url, card);
    return [{ url, sourceUrl: url }];
}

async function loadCustomJsonAudioCandidates(source: AudioSourceSetting, card: JPDBCard, timeoutMs: number, proxyUrl: string): Promise<AudioCandidate[]> {
    if (!source.url.trim()) return [];
    const sourceUrl = formatAudioUrl(source.url, card);
    const response = await requestUrl(sourceUrl, 'text', timeoutMs, { proxyUrl });
    const urls = typeof response === 'string' ? findAudioUrls(JSON.parse(response), sourceUrl) : [];
    return urls.map(url => ({ url, sourceUrl }));
}

async function loadJapanesePod101AudioCandidates(_source: AudioSourceSetting, card: JPDBCard): Promise<AudioCandidate[]> {
    const url = getJapanesePod101Url(card);
    return [{ url, sourceUrl: url }];
}

async function loadLanguagePod101AudioCandidates(_source: AudioSourceSetting, card: JPDBCard, timeoutMs: number, proxyUrl: string): Promise<AudioCandidate[]> {
    const urls = await getLanguagePod101AudioUrls(card, timeoutMs, proxyUrl);
    return urlsToAudioCandidates(urls.length ? urls : [getJapanesePod101Url(card)]);
}

function urlsToAudioCandidates(urls: string[]): AudioCandidate[] {
    return urls.map(url => ({ url, sourceUrl: url }));
}

function jpdbAudioIdsToCandidates(audioIds: string[]): AudioCandidate[] {
    return normalizeJpdbAudioIds(audioIds).map(audioId => ({
        url: jpdbAudioRequest(audioId).url,
        sourceUrl: jpdbAudioPageSourceUrl(audioId),
        jpdbAudioId: audioId,
    }));
}

function getJapanesePod101Url(card: JPDBCard): string {
    const spelling = card.spelling.trim();
    const reading = card.reading.trim() || spelling;
    const params = new URLSearchParams();
    if (spelling && spelling !== reading) params.set('kanji', spelling);
    params.set('kana', reading);
    return `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?${params.toString()}`;
}

export function isJapanesePod101Url(value: string): boolean {
    try {
        const url = new URL(value);
        return url.hostname === 'assets.languagepod101.com' && url.pathname.endsWith('/audiomp3.php');
    } catch {
        return false;
    }
}

async function getJpdbTtsAudioIds(card: JPDBCard, timeoutMs: number, proxyUrl = ''): Promise<string[]> {
    for (const url of jpdbVocabularyAudioLookupUrls(card)) {
        const response = await requestUrl(url, 'text', timeoutMs, { proxyUrl, credentials: 'same-origin', withCredentials: true }).catch(() => '');
        if (typeof response !== 'string') continue;
        const audioIds = extractJpdbVocabularyAudioIds(response, card, url);
        if (audioIds.length) return audioIds;
    }
    return [];
}

function jpdbVocabularyAudioLookupUrls(card: JPDBCard): string[] {
    const urls: string[] = [];
    if (card.vid > 0) urls.push(jpdbVocabularyUrl(card.vid, card.spelling, card.reading));
    for (const query of uniqueStrings([card.spelling, card.reading].filter(Boolean))) {
        urls.push(`${JPDB_SEARCH_URL}?q=${encodeURIComponent(query)}`);
    }
    return uniqueStrings(urls);
}

function jpdbVocabularyUrl(vid: number, spelling: string, reading: string): string {
    return `${JPDB_VOCABULARY_BASE_URL}/${vid}/${encodeURIComponent(spelling)}/${encodeURIComponent(reading || spelling)}`;
}

function extractJpdbVocabularyAudioIds(html: string, card: JPDBCard, sourceUrl = ''): string[] {
    return uniqueStrings(jpdbVocabularyAudioHtmlBlocks(html, card, sourceUrl)
        .flatMap(extractJpdbVocabularyAudioIdsFromHtml));
}

function jpdbVocabularyAudioHtmlBlocks(html: string, card: JPDBCard, sourceUrl = ''): string[] {
    const resultBlocks = findHtmlBlocksByClass(html, 'result')
        .filter(block => htmlBlockHasClass(block, 'vocabulary') && jpdbVocabularyBlockMatchesCard(block, card));
    if (resultBlocks.length) return resultBlocks;
    const singleSearchResultBlocks = findHtmlBlocksByClass(html, 'result')
        .filter(block => htmlBlockHasClass(block, 'vocabulary'));
    if (canUseSingleJpdbAliasAudioResult(singleSearchResultBlocks, card, sourceUrl)) return singleSearchResultBlocks;
    return jpdbHtmlMatchesCard(html, card) ? [html] : [];
}

function canUseSingleJpdbAliasAudioResult(resultBlocks: string[], card: JPDBCard, sourceUrl: string): boolean {
    return resultBlocks.length === 1
        && isJpdbSearchUrl(sourceUrl)
        && isJpdbAliasLookup(card, sourceUrl)
        && extractJpdbVocabularyAudioIdsFromHtml(resultBlocks[0] ?? '').length > 0;
}

function isJpdbSearchUrl(value: string): boolean {
    try {
        const url = new URL(value, 'https://jpdb.io');
        return url.hostname === 'jpdb.io' && url.pathname === '/search';
    } catch {
        return false;
    }
}

function isJpdbAliasLookup(card: JPDBCard, sourceUrl: string): boolean {
    const query = jpdbSearchQuery(sourceUrl);
    if (!query || JAPANESE_TEXT_RE.test(query)) return false;
    const normalizedQuery = cleanJpdbIdentityText(query);
    return [card.spelling, card.reading]
        .some(value => cleanJpdbIdentityText(value) === normalizedQuery);
}

function jpdbSearchQuery(value: string): string {
    try {
        return new URL(value, 'https://jpdb.io').searchParams.get('q')?.trim() ?? '';
    } catch {
        return '';
    }
}

function jpdbVocabularyBlockMatchesCard(html: string, card: JPDBCard): boolean {
    return jpdbVocabularyIdentities(html).some(identity => jpdbVocabularyIdentityMatches(identity, card));
}

function jpdbHtmlMatchesCard(html: string, card: JPDBCard): boolean {
    if (jpdbVocabularyBlockMatchesCard(html, card)) return true;
    const canonical = getHtmlAttributeFromOpeningTag(html, 'link', 'href', /\brel\s*=\s*(["'])canonical\1/i);
    return canonical ? jpdbVocabularyIdentityMatches(jpdbVocabularyIdentityFromUrl(canonical), card) : false;
}

interface JpdbVocabularyIdentity {
    vid: number;
    expression: string;
    reading: string;
}

function jpdbVocabularyIdentities(html: string): Array<JpdbVocabularyIdentity | null> {
    const pattern = /\bhref\s*=\s*(["'])([\s\S]*?\/vocabulary\/[\s\S]*?)\1/gi;
    const identities: Array<JpdbVocabularyIdentity | null> = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) identities.push(jpdbVocabularyIdentityFromUrl(match[2] ?? ''));
    return identities;
}

function jpdbVocabularyIdentityFromUrl(value: string): JpdbVocabularyIdentity | null {
    try {
        const url = new URL(value, 'https://jpdb.io');
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0] !== 'vocabulary') return null;
        const vid = Number.parseInt(parts[1] ?? '', 10);
        return {
            vid: Number.isFinite(vid) ? vid : 0,
            expression: decodeURIComponent(parts[2] ?? ''),
            reading: decodeURIComponent(parts[3] ?? ''),
        };
    } catch {
        return null;
    }
}

function jpdbVocabularyIdentityMatches(identity: JpdbVocabularyIdentity | null, card: JPDBCard): boolean {
    if (!identity) return false;
    if (card.vid > 0 && identity.vid === card.vid) return true;
    const requested = new Set([cleanJpdbIdentityText(card.spelling), cleanJpdbIdentityText(card.reading)].filter(Boolean));
    const expression = cleanJpdbIdentityText(identity.expression);
    const reading = cleanJpdbIdentityText(identity.reading);
    if (!requested.size) return true;
    if (!requested.has(expression) && !requested.has(reading)) return false;
    const requestedReading = cleanJpdbIdentityText(card.reading);
    return !requestedReading || reading === requestedReading || expression === requestedReading || expression === cleanJpdbIdentityText(card.spelling);
}

function cleanJpdbIdentityText(value: string): string {
    return value.replace(/\s+/g, '').trim();
}

function extractJpdbVocabularyAudioIdsFromHtml(html: string): string[] {
    const audioIds: string[] = [];
    const pattern = /<a\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
        const attributes = match[1] ?? '';
        if (!attributesHaveClass(attributes, 'vocabulary-audio')) continue;
        audioIds.push(...normalizeJpdbAudioIds(getHtmlAttribute(attributes, 'data-audio') ?? ''));
    }
    return audioIds;
}

function htmlBlockHasClass(html: string, className: string): boolean {
    const opening = /^<[^/\s>]+\b([^>]*)>/i.exec(html)?.[1] ?? '';
    return attributesHaveClass(opening, className);
}

function getHtmlAttributeFromOpeningTag(html: string, tag: string, attribute: string, attributePattern?: RegExp): string | null {
    const pattern = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
        const attributes = match[1] ?? '';
        if (attributes && (!attributePattern || attributePattern.test(attributes))) {
            return getHtmlAttribute(attributes, attribute);
        }
    }
    return null;
}

function jpdbAudioPageSourceUrl(audioId: string): string {
    return audioId.startsWith('/static/user/') ? 'https://jpdb.io/' : JPDB_AUDIO_BASE_URL;
}

async function getJishoAudioUrls(card: JPDBCard, timeoutMs: number, proxyUrl = ''): Promise<string[]> {
    if (shouldSkipJishoLookup(proxyUrl)) return [];
    const url = `https://jisho.org/search/${encodeURIComponent(card.spelling)}`;
    const response = await requestUrl(url, 'text', timeoutMs, {
        proxyUrl: jishoLookupProxyUrl(proxyUrl),
        preferFetch: false,
    }).catch(() => '');
    if (typeof response !== 'string') return [];

    const audioHtml = findJishoAudioElement(response, card);
    return audioHtml
        ? extractAudioSourceUrls(audioHtml, url).filter(isLikelyAudioUrl).slice(0, 1)
        : [];
}

function shouldSkipJishoLookup(proxyUrl: string): boolean {
    return !jishoLookupProxyUrl(proxyUrl) && !getUserscriptHttpRequest();
}

function jishoLookupProxyUrl(proxyUrl: string): string {
    return isDefaultYomuPublicProxyUrl(proxyUrl) ? '' : proxyUrl;
}

function isDefaultYomuPublicProxyUrl(proxyUrl: string): boolean {
    if (!proxyUrl.trim()) return false;
    try {
        return new URL(proxyUrl).origin === new URL(DEFAULT_YOMU_PUBLIC_PROXY_URL).origin;
    } catch {
        return false;
    }
}

function findJishoAudioElement(html: string, card: JPDBCard): string | null {
    const exact = findHtmlElementById(html, 'audio', `audio_${card.spelling}:${card.reading}`);
    if (exact) return exact;
    if (!canUseKanaJishoAudioFallback(card)) return null;
    return findUniqueJishoReadingAudioElement(html, card.reading.trim());
}

function canUseKanaJishoAudioFallback(card: JPDBCard): boolean {
    const spelling = card.spelling.trim();
    const reading = card.reading.trim();
    return Boolean(spelling && reading && KANA_ONLY_RE.test(spelling));
}

function findUniqueJishoReadingAudioElement(html: string, reading: string): string | null {
    const matches = findHtmlElements(html, 'audio')
        .filter(element => jishoAudioReading(element).trim() === reading);
    return matches.length === 1 ? matches[0] : null;
}

function jishoAudioReading(audioHtml: string): string {
    const id = htmlAttributeValue(audioHtml, 'id') ?? '';
    const marker = id.startsWith('audio_') ? id.slice('audio_'.length) : '';
    const colon = marker.lastIndexOf(':');
    return colon >= 0 ? marker.slice(colon + 1) : '';
}

async function getLanguagePod101AudioUrls(card: JPDBCard, timeoutMs: number, proxyUrl = ''): Promise<string[]> {
    const url = 'https://www.japanesepod101.com/learningcenter/reference/dictionary_post';
    const response = await requestUrl(url, 'text', timeoutMs, { ...languagePod101RequestOptions(card), proxyUrl }).catch(() => '');
    if (typeof response !== 'string') return [];

    const urls: string[] = [];
    for (const row of findHtmlBlocksByClass(response, 'dc-result-row')) {
        if (!languagePod101RowMatchesCard(row, card)) continue;
        urls.push(...extractAudioSourceUrls(row, url));
    }
    return uniqueAudioUrls(urls);
}

function languagePod101RequestOptions(card: JPDBCard): AudioRequestOptions {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: languagePod101RequestBody(card),
    };
}

function languagePod101RequestBody(card: JPDBCard): string {
    const searchQuery = card.spelling.trim() || card.reading;
    return new URLSearchParams({
        post: 'dictionary_reference',
        match_type: 'exact',
        search_query: searchQuery,
        vulgar: 'true',
    }).toString();
}

interface JpdbAudioRequest {
    url: string;
    headers?: Record<string, string>;
    encoded: boolean;
}

export function normalizeJpdbAudioIds(value: string | string[]): string[] {
    return uniqueAudioUrls(normalizeJpdbAudioGroups(value)
        .flatMap(group => group.split('+')));
}

export function normalizeJpdbAudioGroups(value: string | string[]): string[] {
    const values = Array.isArray(value) ? value : value.split(',');
    return uniqueAudioUrls(values
        .map(normalizeJpdbAudioGroup)
        .filter(Boolean));
}

function normalizeJpdbAudioGroup(value: string): string {
    const ids = value.split('+')
        .map(item => item.trim())
        .filter(Boolean);
    return ids.length && ids.every(isValidJpdbAudioId) ? ids.join('+') : '';
}

function jpdbAudioPlaybackCandidates(value: string | string[]): JpdbAudioPlaybackCandidate[] {
    const groups = normalizeJpdbAudioGroups(value);
    return groups.map(group => ({ audioIds: group.split('+'), deckId: `jpdb:${group}` }));
}

export function jpdbAudioRequest(audioId: string, language: ReaderSettings['interfaceLanguage'] = 'en'): JpdbAudioRequest {
    if (!isValidJpdbAudioId(audioId)) throw new Error(uiText(language, 'invalidJpdbAudioId'));
    if (audioId.startsWith('/static/user/')) {
        return { url: new URL(audioId, 'https://jpdb.io').toString(), encoded: false };
    }
    const devUrl = localDevJpdbAudioUrl(audioId);
    if (devUrl) {
        return {
            url: devUrl,
            headers: jpdbAudioHeaders(),
            encoded: true,
        };
    }
    return {
        url: `${JPDB_AUDIO_BASE_URL}/${encodeJpdbAudioPath(audioId)}`,
        headers: jpdbAudioHeaders(),
        encoded: true,
    };
}

export async function decodeJpdbAudioBlob(response: Blob, encoded: boolean, language: ReaderSettings['interfaceLanguage'] = 'en'): Promise<Blob> {
    const bytes = new Uint8Array(await blobArrayBuffer(response, language));
    const decoded = encoded ? decodeJpdbAudioBytes(bytes) : bytes;
    const sniffedType = jpdbAudioMimeTypeForBytes(decoded);
    if (!sniffedType) {
        if (!encoded && isAudioBlobType(response.type)) return new Blob([blobPart(decoded)], { type: response.type });
        throw new Error(uiText(language, 'jpdbAudioResponseNotPlayable'));
    }
    return new Blob([blobPart(decoded)], { type: sniffedType });
}

function blobArrayBuffer(blob: Blob, language: ReaderSettings['interfaceLanguage'] = 'en'): Promise<ArrayBuffer> {
    if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error(uiText(language, 'couldNotReadAudioBlob')));
        reader.readAsArrayBuffer(blob);
    });
}

function jpdbAudioHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'X-Access': JPDB_AUDIO_ACCESS_HEADER };
    if (shouldForceJpdbCafAudio()) headers['X-ForceCAF'] = '1';
    return headers;
}

function shouldForceJpdbCafAudio(): boolean {
    const audio = document.createElement('audio');
    return audio.canPlayType('audio/ogg; codecs=opus') === ''
        && audio.canPlayType('audio/x-caf') !== '';
}

function decodeJpdbAudioBytes(bytes: Uint8Array): Uint8Array {
    const decoded = new Uint8Array(bytes);
    JPDB_AUDIO_XOR_BYTES.forEach((mask, index) => {
        if (index < decoded.length) decoded[index] = decoded[index] ^ mask;
    });
    return decoded;
}

function jpdbAudioMimeTypeForBytes(bytes: Uint8Array): string {
    if (startsWithAscii(bytes, 'OggS')) return 'audio/ogg; codecs=opus';
    if (startsWithAscii(bytes, 'caff')) return 'audio/x-caf';
    if (startsWithAscii(bytes, 'RIFF')) return 'audio/wav';
    if (startsWithAscii(bytes, 'ID3') || isMp3Frame(bytes)) return 'audio/mpeg';
    if (asciiAt(bytes, 4, 'ftyp')) return 'audio/mp4';
    return '';
}

function startsWithAscii(bytes: Uint8Array, signature: string): boolean {
    return asciiAt(bytes, 0, signature);
}

function asciiAt(bytes: Uint8Array, offset: number, signature: string): boolean {
    if (bytes.length < offset + signature.length) return false;
    return Array.from(signature).every((char, index) => bytes[offset + index] === char.charCodeAt(0));
}

function isMp3Frame(bytes: Uint8Array): boolean {
    return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

function isAudioBlobType(type: string): boolean {
    return /^audio\//i.test(type.trim());
}

function blobPart(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function localDevJpdbAudioUrl(audioId: string): string {
    if (!isLocalNewTabDevOrigin()) return '';
    const url = new URL(`/__yomu-jpdb-audio/${encodeJpdbAudioPath(audioId)}`, location.href);
    if (shouldForceJpdbCafAudio()) url.searchParams.set('force_caf', '1');
    return url.toString();
}

function isLocalNewTabDevOrigin(): boolean {
    if (typeof window === 'undefined' || typeof location === 'undefined') return false;
    if ((window as typeof window & { __YOMU_READER_RUNTIME__?: string }).__YOMU_READER_RUNTIME__ !== 'newtab') return false;
    return /^https?:$/.test(location.protocol)
        && LOOPBACK_AUDIO_HOSTS.has(location.hostname.replace(/^\[|\]$/g, ''));
}

function encodeJpdbAudioPath(value: string): string {
    return value.split('/').map(encodeURIComponent).join('/');
}

function isValidJpdbAudioId(value: string): boolean {
    return Boolean(value && JPDB_AUDIO_ID_RE.test(value) && !value.includes('..') && !value.startsWith('//'));
}

function languagePod101RowMatchesCard(row: string, card: JPDBCard): boolean {
    return card.reading === card.spelling || languagePod101RowKana(row) === card.reading;
}

function languagePod101RowKana(row: string): string {
    const kanaHtml = findHtmlElementByClass(row, 'span', 'dc-vocab_kana');
    return stripHtml(kanaHtml ?? '').trim();
}

async function getCommonsAudioUrls(term: string, source: 'lingua-libre' | 'wiktionary', timeoutMs: number, proxyUrl = ''): Promise<string[]> {
    const apiUrl = commonsSearchApiUrl(term, source);
    const response = await requestUrl(apiUrl, 'text', timeoutMs, { proxyUrl });
    if (typeof response !== 'string') return [];

    const urls: string[] = [];
    for (const title of commonsSearchTitles(response)) {
        urls.push(...await getCommonsAudioUrlsForTitle(title, term, source, timeoutMs, proxyUrl));
    }
    return urls;
}

function commonsSearchApiUrl(term: string, source: 'lingua-libre' | 'wiktionary'): string {
    const search = source === 'lingua-libre'
        ? `intitle:/-(${escapeRegExp(term)}).wav/i incategory:"Lingua_Libre_pronunciation-jpn"`
        : `intitle:/ja(-[a-zA-Z]{2})?-${escapeRegExp(term)}[0123456789]*.ogg/i`;
    return `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&origin=*&srsearch=${encodeURIComponent(search)}`;
}

function commonsSearchTitles(response: string): string[] {
    const pages = (JSON.parse(response) as { query?: { search?: Array<{ title?: string }> } }).query?.search ?? [];
    return pages.slice(0, 6).map(page => page.title).filter((title): title is string => Boolean(title));
}

async function getCommonsAudioUrlsForTitle(title: string, term: string, source: 'lingua-libre' | 'wiktionary', timeoutMs: number, proxyUrl = ''): Promise<string[]> {
    const info = await requestUrl(commonsImageInfoUrl(title), 'text', timeoutMs, { proxyUrl }).catch(() => null);
    if (typeof info !== 'string') return [];
    return commonsImageInfoUrls(info, title, term, source);
}

function commonsImageInfoUrl(title: string): string {
    return `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&origin=*&titles=${encodeURIComponent(title)}`;
}

function commonsImageInfoUrls(info: string, title: string, term: string, source: 'lingua-libre' | 'wiktionary'): string[] {
    const filePages = (JSON.parse(info) as { query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string; user?: string }> }> } }).query?.pages ?? {};
    return Object.values(filePages)
        .map(filePage => filePage.imageinfo?.[0])
        .filter(image => Boolean(image?.url && isValidCommonsAudioFilename(title, image.user ?? '', term, source)))
        .map(image => image?.url ?? '');
}

function findHtmlElementById(html: string, tag: string, id: string): string | null {
    return findHtmlElement(html, tag, new RegExp(`\\bid\\s*=\\s*(["'])${escapeRegExp(id)}\\1`, 'i'));
}

function htmlAttributeValue(html: string, attribute: string): string | null {
    const match = new RegExp(`\\b${escapeRegExp(attribute)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(html);
    return match?.[2] ?? null;
}

function findHtmlElementByClass(html: string, tag: string, className: string): string | null {
    return findHtmlElementsByClass(html, tag, className)[0] ?? null;
}

function findHtmlElementsByClass(html: string, tag: string, className: string): string[] {
    return findHtmlElements(html, tag).filter(element => htmlElementHasClass(element, tag, className));
}

function findHtmlBlocksByClass(html: string, className: string): string[] {
    const starts: number[] = [];
    const startPattern = /<[^/!][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = startPattern.exec(html))) {
        if (tagAttributesHaveClass(match[0], className)) starts.push(match.index);
    }
    return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function findHtmlElement(html: string, tag: string, attributePattern?: RegExp): string | null {
    return findHtmlElements(html, tag, attributePattern)[0] ?? null;
}

function findHtmlElements(html: string, tag: string, attributePattern?: RegExp): string[] {
    const pattern = new RegExp(`<${tag}\\b([^>]*)>[\\s\\S]*?<\\/${tag}>`, 'gi');
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
        if (htmlElementMatchesAttributes(match, attributePattern)) matches.push(match[0]);
    }
    return matches;
}

function htmlElementMatchesAttributes(match: RegExpExecArray, attributePattern?: RegExp): boolean {
    const attributes = match[1] ?? '';
    return attributePattern ? attributePattern.test(attributes) : true;
}

function htmlElementHasClass(element: string, tag: string, className: string): boolean {
    const opening = new RegExp(`^<${tag}\\b([^>]*)>`, 'i').exec(element)?.[1] ?? '';
    return attributesHaveClass(opening, className);
}

function tagAttributesHaveClass(openingTag: string, className: string): boolean {
    const attributes = /^<[^/\s>]+\b([^>]*)>/i.exec(openingTag)?.[1] ?? '';
    return attributesHaveClass(attributes, className);
}

function attributesHaveClass(attributes: string, className: string): boolean {
    return (getHtmlAttribute(attributes, 'class') ?? '').split(/\s+/).includes(className);
}

function extractAudioSourceUrls(html: string, baseUrl: string): string[] {
    const urls: string[] = [];
    const sourcePattern = /<source\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = sourcePattern.exec(html))) {
        const src = getHtmlAttribute(match[1] ?? '', 'src');
        const url = src ? resolveAudioSourceUrl(src, baseUrl) : '';
        if (url) urls.push(url);
    }
    return uniqueAudioUrls(urls);
}

function resolveAudioSourceUrl(src: string, baseUrl: string): string {
    try {
        return new URL(src, baseUrl).href;
    } catch {
        return '';
    }
}

function getHtmlAttribute(attributes: string, name: string): string | null {
    const match = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(attributes);
    return match ? decodeHtmlAttribute(match[2]) : null;
}

function decodeHtmlAttribute(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(value: string): string {
    return decodeHtmlAttribute(value.replace(/<[^>]+>/g, ''));
}

function isValidCommonsAudioFilename(filename: string | undefined, fileUser: string, term: string, source: 'lingua-libre' | 'wiktionary'): boolean {
    if (!filename) return false;
    if (source === 'lingua-libre') {
        return new RegExp(`^File:LL-Q\\d+\\s+\\(jpn\\)-${escapeRegExp(fileUser)}-${escapeRegExp(term)}\\.wav$`, 'i').test(filename);
    }
    return new RegExp(`^File:ja(-\\w\\w)?-${escapeRegExp(term)}\\d*\\.ogg$`, 'i').test(filename);
}

function normalizeAudioUrl(value: string, sourceUrl?: string): string {
    try {
        const nested = new URL(value);
        if (sourceUrl) alignLoopbackAudioUrl(nested, new URL(sourceUrl));
        return normalizeAudioUrlSlashes(nested.href);
    } catch {
        return normalizeAudioUrlSlashes(value);
    }
}

function alignLoopbackAudioUrl(nested: URL, source: URL): void {
    if (!shouldAlignLoopbackAudioUrl(nested, source)) return;
    nested.protocol = source.protocol;
    nested.hostname = source.hostname;
}

function shouldAlignLoopbackAudioUrl(nested: URL, source: URL): boolean {
    return isLoopbackAudioHost(nested.hostname)
        && !isLoopbackAudioHost(source.hostname)
        && nested.port === source.port;
}

function isLoopbackAudioHost(hostname: string): boolean {
    return LOOPBACK_AUDIO_HOSTS.has(hostname);
}

function normalizeAudioUrlSlashes(value: string): string {
    return value.replace(/\\/g, '/');
}

function isLikelyAudioRecord(record: Record<string, unknown>): boolean {
    return typeof record.url === 'string' && audioRecordHasPlayableSignal(record);
}

function audioRecordHasPlayableSignal(record: Record<string, unknown>): boolean {
    return isLikelyAudioUrl(String(record.url))
        || ['audio', 'audioSource'].includes(String(record.type ?? ''))
        || typeof record.name === 'string';
}

function isLikelyAudioUrl(value: string): boolean {
    if (value.startsWith('data:audio/')) return true;
    try {
        const url = new URL(value, location.href);
        const pathname = url.pathname.toLowerCase();
        return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/.test(pathname)
            || /(^|[-_/])(audio|sound|voice|pronunciation)([-_/]|$)/i.test(pathname);
    } catch {
        return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)(?:$|[?#])/i.test(value);
    }
}

function uniqueAudioUrls(urls: string[]): string[] {
    const seen = new Set<string>();
    return urls.filter(url => {
        const key = normalizeAttemptedAudioUrl(url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function shouldFetchCandidateAsBlob(candidate: AudioCandidate, audioViaBlob: boolean): boolean {
    if (!canFetchAudioCandidateAsBlob(candidate, audioViaBlob)) return false;
    return isBlobFetchableAudioCandidate(candidate);
}

function canFetchAudioCandidateAsBlob(candidate: AudioCandidate, audioViaBlob: boolean): boolean {
    return audioViaBlob
        && !candidate.url.startsWith('blob:')
        && !candidate.url.startsWith('data:audio/');
}

function isBlobFetchableAudioCandidate(candidate: AudioCandidate): boolean {
    return /^https?:\/\//i.test(candidate.url)
        || isAppleMobileBrowser()
        || isJapanesePod101Url(candidate.url)
        || isJapanesePod101Url(candidate.sourceUrl);
}

function isAppleMobileBrowser(): boolean {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    return /iPad|iPhone|iPod/i.test(userAgent)
        || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function preconnectAudioUrl(value: string): void {
    const origin = audioPreconnectOrigin(value);
    if (!origin || preconnectedAudioOrigins.has(origin)) return;
    preconnectedAudioOrigins.add(origin);
    appendAudioPreconnectLinks(origin);
}

function audioPreconnectOrigin(value: string): string | null {
    try {
        return new URL(value, location.href).origin;
    } catch {
        return null;
    }
}

function appendAudioPreconnectLinks(origin: string): void {
    for (const rel of AUDIO_PRECONNECT_RELS) appendAudioPreconnectLink(origin, rel);
}

function appendAudioPreconnectLink(origin: string, rel: (typeof AUDIO_PRECONNECT_RELS)[number]): void {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = origin;
    if (rel === 'preconnect') link.crossOrigin = 'anonymous';
    document.head?.append(link);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
