import { uiText } from '../app/i18n';
import { Logger } from '../app/logger';
import { ShuffledAudioDeck } from './playback-queue';
import {
    fetchAudioBlob,
    getAudioCandidates,
    preconnectAudioUrl,
    shouldCacheAudioCandidates,
    shouldFetchCandidateAsBlob,
    shouldFetchDirectMediaAsBlob,
    shouldForceBlobAudioCandidate,
    shouldForceBlobAudioPlayback,
} from './candidates';
import {
    audioCandidateSelectionMode,
    audioPreloadLimits,
    cloneAudioCandidates,
    getAudioBagKey,
    getAudioCandidateCacheKey,
    getJpdbAudioBagKey,
    getOrderedAudioSources,
    isApiTextToSpeechSource,
    isBrowserTextToSpeechSource,
    isTextToSpeechFallbackSource,
    orderAudioCandidates,
    orderAudioSources,
    preparedAudioCacheKey,
    preloadableAudioSources,
    registerAudioAttempt,
    type AudioCandidate,
    type AudioPreloadOptions,
    type OrderedAudioSource,
} from './source-resolution';
import { canAttemptAudiblePlayback, reserveGestureAudioElement } from './media-activation';
import {
    fetchJpdbAudioBlob,
    jpdbAudioPlaybackCandidates,
    type JpdbAudioPlaybackCandidate,
} from '../jpdb/jpdb-audio-file';
import { ObjectUrlCache } from '../core/object-url-cache';
import { pruneExpiringMapEntries } from '../core/expiring-map';
import { createPageMediaUrl } from '../app/page-media-url';
import type { AudioSelectionMode, AudioSourceSetting, AudioSourceType, JPDBCard, ReaderSettings } from '../app/types';

interface AudioPlaybackOptions {
    isCurrent?: () => boolean;
    userGesture?: boolean;
}

interface AudioSourcePlayResult {
    state: 'played' | 'superseded' | 'miss' | 'playback-error';
    errors: string[];
}

interface AudioSourcePlaybackContext {
    card: JPDBCard;
    settings: ReaderSettings;
    requestId: number;
    triedUrls: Set<string>;
    isCurrent: () => boolean;
    errors: string[];
    reservedAudio?: HTMLAudioElement;
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

const AUDIO_CANDIDATE_CACHE_TTL_MS = 10 * 60 * 1000;
const AUDIO_BLOB_CACHE_TTL_MS = 10 * 60 * 1000;
const READY_AUDIO_CACHE_TTL_MS = 5 * 60 * 1000;
const AUDIO_CANDIDATE_CACHE_LIMIT = 600;
const READY_AUDIO_CACHE_LIMIT = 160;
const AUDIO_SOURCE_RACE_STAGGER_MS = 120;
const SOFT_CHIME_NOTES: SoftChimeNote[] = [
    { frequency: 587.33, offset: 0, duration: 0.22, gain: 0.032 },
    { frequency: 783.99, offset: 0.11, duration: 0.28, gain: 0.024 },
];
const JPDB_AUDIO_UNAVAILABLE_TTL_MS = 10 * 60 * 1000;
const log = Logger.scope('Audio');

export { ShuffledAudioDeck } from './playback-queue';
export { decodeJpdbAudioBlob, fetchJpdbAudioBlob, jpdbAudioRequest, normalizeJpdbAudioIds } from '../jpdb/jpdb-audio-file';
export {
    blobToDataUrl,
    fetchAudioBlob,
    findAudioUrl,
    findAudioUrls,
    formatAudioUrl,
    getAudioCandidates,
    isJapanesePod101Url,
    isUnavailableJapanesePod101Audio,
} from './candidates';

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
        return this.reserveCurrentGestureAudioElement();
    }

    private reserveCurrentGestureAudioElement(): HTMLAudioElement {
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
        const context: AudioSourcePlaybackContext = { card, settings, requestId, triedUrls, isCurrent, errors, reservedAudio };
        const fallbackContext: AudioSourcePlaybackContext = { ...context, reservedAudio: undefined };
        if (settings.audioTtsMode === 'source-order') {
            const result = await this.playOrderedSources(orderAudioSources(sources, settings.audioSelectionMode, card, this.shuffledAudio), context);
            return { state: result, errors };
        }

        const realAudioSources = sources.filter(source => !isTextToSpeechFallbackSource(source));
        const realAudioResult = await this.playGreedyAudioSources(orderAudioSources(realAudioSources, settings.audioSelectionMode, card, this.shuffledAudio), context);
        if (realAudioResult !== 'miss') return { state: realAudioResult, errors };

        const apiTextToSpeechResult = await this.playOrderedSources(orderAudioSources(sources.filter(isApiTextToSpeechSource), settings.audioSelectionMode, card, this.shuffledAudio), fallbackContext);
        if (apiTextToSpeechResult !== 'miss') return { state: apiTextToSpeechResult, errors };

        const textToSpeechResult = await this.playOrderedSources(orderAudioSources(sources.filter(isBrowserTextToSpeechSource), settings.audioSelectionMode, card, this.shuffledAudio), fallbackContext);
        return { state: textToSpeechResult, errors };
    }

    private async playOrderedSources(
        sources: OrderedAudioSource[],
        context: AudioSourcePlaybackContext,
    ): Promise<AudioSourcePlayResult['state']> {
        for (const sourceEntry of sources) {
            const result = await this.playSourceWithErrors(sourceEntry, context);
            if (result !== 'miss') return result;
        }
        return 'miss';
    }

    private async playGreedyAudioSources(
        sources: OrderedAudioSource[],
        context: AudioSourcePlaybackContext,
    ): Promise<AudioSourcePlayResult['state']> {
        if (sources.length <= 1) {
            return await this.playOrderedSources(sources, context);
        }

        const race = new AudioSourcePreparationRace(sources, sourceEntry =>
            this.prepareSourceWithErrors(sourceEntry, context),
        );

        while (race.hasWork()) {
            const current = await race.next();
            if (!current) {
                continue;
            }

            const result = await this.playPreparedSourceResult(current.result, context);
            if (result !== 'miss') return result;
        }
        return 'miss';
    }

    private async playPreparedSourceResult(
        result: AudioSourcePrepareResult,
        context: AudioSourcePlaybackContext,
    ): Promise<AudioSourcePlayResult['state']> {
        if (result.state === 'superseded') return 'superseded';
        if (result.state !== 'ready' || !result.prepared) return 'miss';
        return await this.playPreparedCandidate(result.prepared, context.settings, context.requestId, context.isCurrent, context.reservedAudio)
            .catch(error => audioPlaybackAttemptResult(error, context.errors));
    }

    private prepareSourceWithErrors(
        sourceEntry: OrderedAudioSource,
        context: AudioSourcePlaybackContext,
    ): PendingAudioSourcePreparation {
        let promise!: PendingAudioSourcePreparation;
        promise = this.prepareSource(sourceEntry, context.card, context.settings, context.requestId, context.triedUrls, context.isCurrent)
            .catch(error => {
                context.errors.push(error instanceof Error ? error.message : String(error));
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
        context: AudioSourcePlaybackContext,
    ): Promise<AudioSourcePlayResult['state']> {
        if (!this.isPlaybackCurrent(context.requestId, context.isCurrent)) {
            return 'superseded';
        }
        try {
            const played = await this.playFromSource(sourceEntry, context.card, context.settings, context.requestId, context.triedUrls, context.isCurrent, context.reservedAudio);
            const result = this.audioSourceAttemptResult(played, context.requestId, context.isCurrent);
            if (result === 'played') this.shuffledAudio.markPlayed(sourceEntry.bagKey, sourceEntry.id);
            else if (result === 'miss') this.shuffledAudio.markSkipped(sourceEntry.bagKey, sourceEntry.id);
            return result;
        } catch (error) {
            context.errors.push(error instanceof Error ? error.message : String(error));
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
                        if (!registerAudioAttempt(triedUrls, candidate)) continue;
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

    // Runtime audio adapter: ReaderAudioActions calls this through dependency injection.
    // fallow-ignore-next-line unused-class-member
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
        return this.reserveCurrentGestureAudioElement();
    }

    private jpdbAudioBlobUrl(audioId: string, settings: ReaderSettings): Promise<string> {
        return this.jpdbAudioBlobUrlCache.getOrCreate(audioId, async () => {
            return createPageMediaUrl(await fetchJpdbAudioBlob(audioId, settings));
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
        const audio = await this.createReadyAudio(audioUrl, reservedAudio);
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
        return this.createReadyAudio(audioUrl, reservedAudio);
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
        pruneExpiringMapEntries(this.readyAudioCache, READY_AUDIO_CACHE_LIMIT, now);
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
        pruneExpiringMapEntries(this.candidateCache, AUDIO_CANDIDATE_CACHE_LIMIT, now);
        return promise.then(cloneAudioCandidates);
    }

    private async fetchAudioAsBlobUrl(url: string, sourceUrl: string, timeoutMs: number, mode: AudioSelectionMode): Promise<string> {
        const settings = this.getSettings();
        return createPageMediaUrl(await fetchAudioBlob(url, sourceUrl, timeoutMs, mode, settings.corsProxyUrl, settings.interfaceLanguage));
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

class AudioSourcePreparationRace {
    private pending = new Set<PendingAudioSourcePreparation>();
    private nextSourceIndex = 0;

    constructor(
        private sources: OrderedAudioSource[],
        private prepare: (source: OrderedAudioSource) => PendingAudioSourcePreparation,
    ) {}

    hasWork(): boolean {
        return this.pending.size > 0 || this.hasQueuedSources();
    }

    async next(): Promise<CompletedAudioSourcePreparation | undefined> {
        if (!this.pending.size) return this.startNextSource();
        const current = await this.racePendingSources();
        if (!current) return this.startNextSource();
        this.pending.delete(current.promise);
        return current;
    }

    private racePendingSources(): Promise<CompletedAudioSourcePreparation | null> {
        return this.hasQueuedSources()
            ? Promise.race([...this.pending, delayAudioSourceRace(AUDIO_SOURCE_RACE_STAGGER_MS)])
            : Promise.race(this.pending);
    }

    private startNextSource(): undefined {
        const sourceEntry = this.sources[this.nextSourceIndex++];
        if (sourceEntry) this.pending.add(this.prepare(sourceEntry));
        return undefined;
    }

    private hasQueuedSources(): boolean {
        return this.nextSourceIndex < this.sources.length;
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

function shouldReserveGestureAudioElement(request: AudioPlaybackRequest): boolean {
    return request.userGesture
        && request.sources.some(source => !isBrowserTextToSpeechSource(source));
}

function delayAudioSourceRace(ms: number): Promise<null> {
    return new Promise(resolve => window.setTimeout(() => resolve(null), ms));
}

function audioPlaybackAttemptResult(error: unknown, errors: string[]): AudioSourcePlayResult['state'] {
    errors.push(error instanceof Error ? error.message : String(error));
    return error instanceof AudioPlaybackAttemptError ? 'playback-error' : 'miss';
}
