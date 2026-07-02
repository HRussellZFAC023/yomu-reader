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
    shouldFetchMediaUrlAsBlobBeforePlayback,
    shouldForceBlobAudioCandidate,
    shouldForceBlobAudioPlayback,
} from './candidates';
import {
    audioCandidateSelectionMode,
    audioPreloadLimits,
    cheapCandidatePreloadAudioSources,
    cloneAudioCandidates,
    getAudioBagKey,
    getAudioCandidateCacheKey,
    getJpdbAudioBagKey,
    getOrderedAudioSources,
    normalizeAttemptedAudioUrl,
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
import { canAttemptAudiblePlayback, canAttemptWebAudioFallback, reserveGestureAudioElement } from './media-activation';
import {
    fetchJpdbAudioBlob,
    jpdbAudioPlaybackCandidates,
    type JpdbAudioPlaybackCandidate,
} from '../jpdb/jpdb-audio-file';
import { ObjectUrlCache } from '../core/object-url-cache';
import { pruneExpiringMapEntries } from '../core/expiring-map';
import { createPageMediaUrl, getPageMediaBlob, revokePageMediaUrl } from '../app/page-media-url';
import type { AudioSelectionMode, AudioSourceSetting, AudioSourceType, JPDBCard, ReaderSettings } from '../app/types';

interface AudioPlaybackOptions {
    isCurrent?: () => boolean;
    userGesture?: boolean;
    reservedGesture?: boolean;
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
    avoidIdentity?: string;
    attemptState: AudioSourcePlaybackAttemptState;
    reservedAudio?: HTMLAudioElement;
    userGesture: boolean;
}

interface AudioSourcePlaybackAttemptState {
    skippedAvoidedIdentity: boolean;
}

interface AudioSourcePlaybackAttemptResult {
    state: AudioSourcePlayResult['state'];
    skippedAvoidedIdentity: boolean;
}

interface AudioPlaybackRequest {
    requestId: number;
    isCurrent: () => boolean;
    settings: ReaderSettings;
    sources: AudioSourceSetting[];
    userGesture: boolean;
    reservedGesture: boolean;
}

interface SoftChimeNote {
    frequency: number;
    offset: number;
    duration: number;
    gain: number;
}

interface TextToSpeechVoiceChoice {
    deckId?: string;
    deckKey?: string;
    voice: SpeechSynthesisVoice | null;
}

interface TextToSpeechPlaybackOptions {
    avoidIdentity?: string;
    onAvoided?: () => void;
    onPlayed?: (identity: string) => void;
}

const AUDIO_CANDIDATE_CACHE_TTL_MS = 10 * 60 * 1000;
const AUDIO_BLOB_CACHE_TTL_MS = 10 * 60 * 1000;
const READY_AUDIO_CACHE_TTL_MS = 5 * 60 * 1000;
const AUDIO_CANDIDATE_CACHE_LIMIT = 600;
const READY_AUDIO_CACHE_LIMIT = 160;
const GESTURE_AUDIO_RESERVATION_TTL_MS = 8000;
const LAST_AUDIO_IDENTITY_LIMIT = 400;
const WEB_AUDIO_RESUME_TIMEOUT_MS = 250;
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
    private blobUrlCache = new ObjectUrlCache(AUDIO_BLOB_CACHE_TTL_MS, revokePageMediaUrl);
    private jpdbAudioBlobUrlCache = new ObjectUrlCache(AUDIO_BLOB_CACHE_TTL_MS, revokePageMediaUrl);
    private readyAudioCache = new Map<string, { expiresAt: number; promise: Promise<HTMLAudioElement> }>();
    private unavailableJpdbAudioIds = new Map<string, number>();
    private lastAudioIdentityByCard = new Map<string, string>();
    private gestureReservation?: { audio: HTMLAudioElement; expiresAt: number; timer: number };

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
        const reservedAudio = this.takeGestureAudioElement(request) ?? this.reserveGestureAudioElement(request);
        this.stopCurrent(reservedAudio);
        if (!request.sources.length) return await this.playNoAudioSources(card, request);

        const done = log.time('play', { term: card.spelling, sources: request.sources.map(source => source.type), viaBlob: true });
        const result = await this.playFromSources(request.sources, card, request.settings, request.requestId, request.isCurrent, request.userGesture, reservedAudio);
        done();
        return this.finishPlaybackResult(card, request.settings, request.requestId, request.isCurrent, request.userGesture, result);
    }

    private audioPlaybackRequest(options: AudioPlaybackOptions): AudioPlaybackRequest {
        const settings = this.getSettings();
        return {
            requestId: ++this.playRequestId,
            isCurrent: options.isCurrent ?? (() => true),
            settings,
            sources: getOrderedAudioSources(settings),
            userGesture: options.userGesture ?? false,
            reservedGesture: options.reservedGesture ?? false,
        };
    }

    private reserveGestureAudioElement(request: AudioPlaybackRequest): HTMLAudioElement | undefined {
        if (!shouldReserveGestureAudioElement(request)) return undefined;
        this.stopCurrent();
        return this.reserveCurrentGestureAudioElement();
    }

    private reserveCurrentGestureAudioElement(): HTMLAudioElement {
        const audio = reserveGestureAudioElement(audioUrl => this.createAudioElement(audioUrl));
        this.current = audio;
        return audio;
    }

    primeUserGesture(): boolean {
        const request = this.audioPlaybackRequest({ userGesture: true });
        if (!request.settings.audioEnabled || !shouldReserveGestureAudioElement(request)) return false;
        this.releaseGestureReservation();
        this.stopCurrent();
        const audio = this.reserveCurrentGestureAudioElement();
        this.gestureReservation = {
            audio,
            expiresAt: Date.now() + GESTURE_AUDIO_RESERVATION_TTL_MS,
            timer: window.setTimeout(() => this.expireGestureReservation(audio), GESTURE_AUDIO_RESERVATION_TTL_MS),
        };
        return true;
    }

    private takeGestureAudioElement(request: AudioPlaybackRequest): HTMLAudioElement | undefined {
        if (!shouldUseGestureAudioReservation(request)) return undefined;
        const reservation = this.gestureReservation;
        if (!reservation) return undefined;
        this.gestureReservation = undefined;
        window.clearTimeout(reservation.timer);
        if (reservation.expiresAt < Date.now()) {
            if (this.current === reservation.audio) this.stopCurrent();
            return undefined;
        }
        return reservation.audio;
    }

    private ensureAudioEnabled(settings: ReaderSettings): void {
        if (!settings.audioEnabled) throw new Error(uiText(settings.interfaceLanguage, 'audioPlaybackDisabledToast'));
    }

    private async playNoAudioSources(card: JPDBCard, request: AudioPlaybackRequest): Promise<boolean> {
        log.warn('No audio sources configured', { term: card.spelling });
        return await this.playMissingAudioFallback(request.settings, request.requestId, request.isCurrent, request.userGesture);
    }

    private async finishPlaybackResult(
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
        userGesture: boolean,
        result: AudioSourcePlayResult,
    ): Promise<boolean> {
        if (result.state === 'played') return true;
        if (result.state === 'playback-error') return false;
        if (result.state === 'superseded' || !this.isPlaybackCurrent(requestId, isCurrent)) return false;
        log.warn('No playable audio found', { term: card.spelling, errors: result.errors });
        return await this.playMissingAudioFallback(settings, requestId, isCurrent, userGesture);
    }

    private async playFromSources(
        sources: AudioSourceSetting[],
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
        userGesture: boolean,
        reservedAudio?: HTMLAudioElement,
    ): Promise<AudioSourcePlayResult> {
        const errors: string[] = [];
        const avoidIdentity = settings.audioSelectionMode === 'random'
            ? this.lastPlayedAudioIdentity(card)
            : undefined;
        const result = await this.playFromSourcesAttempt(sources, card, settings, requestId, isCurrent, errors, userGesture, reservedAudio, avoidIdentity);
        if (result.state === 'miss' && result.skippedAvoidedIdentity) {
            const retry = await this.playFromSourcesAttempt(sources, card, settings, requestId, isCurrent, errors, userGesture, reservedAudio);
            return { state: retry.state, errors };
        }
        return { state: result.state, errors };
    }

    private async playFromSourcesAttempt(
        sources: AudioSourceSetting[],
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
        errors: string[],
        userGesture: boolean,
        reservedAudio?: HTMLAudioElement,
        avoidIdentity?: string,
    ): Promise<AudioSourcePlaybackAttemptResult> {
        const triedUrls = new Set<string>();
        const attemptState: AudioSourcePlaybackAttemptState = { skippedAvoidedIdentity: false };
        const context: AudioSourcePlaybackContext = { card, settings, requestId, triedUrls, isCurrent, errors, reservedAudio, avoidIdentity, attemptState, userGesture };
        const fallbackContext: AudioSourcePlaybackContext = { ...context, reservedAudio: undefined };
        if (settings.audioTtsMode === 'source-order') {
            const result = await this.playOrderedSources(orderAudioSources(sources, card), context);
            return { state: result, skippedAvoidedIdentity: attemptState.skippedAvoidedIdentity };
        }

        const realSourceSettings = sources.filter(source => !isTextToSpeechFallbackSource(source));
        const realAudioSources = orderAudioSources(realSourceSettings, card);
        const realAudioResult = await this.playOrderedSources(realAudioSources, context);
        if (realAudioResult !== 'miss') return { state: realAudioResult, skippedAvoidedIdentity: attemptState.skippedAvoidedIdentity };
        if (attemptState.skippedAvoidedIdentity) return { state: 'miss', skippedAvoidedIdentity: true };

        const apiTextToSpeechResult = await this.playOrderedSources(orderAudioSources(sources.filter(isApiTextToSpeechSource), card), fallbackContext);
        if (apiTextToSpeechResult !== 'miss') return { state: apiTextToSpeechResult, skippedAvoidedIdentity: attemptState.skippedAvoidedIdentity };
        if (attemptState.skippedAvoidedIdentity) return { state: 'miss', skippedAvoidedIdentity: true };

        const textToSpeechResult = await this.playOrderedSources(orderAudioSources(sources.filter(isBrowserTextToSpeechSource), card), fallbackContext);
        return { state: textToSpeechResult, skippedAvoidedIdentity: attemptState.skippedAvoidedIdentity };
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

    private async playSourceWithErrors(
        sourceEntry: OrderedAudioSource,
        context: AudioSourcePlaybackContext,
    ): Promise<AudioSourcePlayResult['state']> {
        if (!this.isPlaybackCurrent(context.requestId, context.isCurrent)) {
            return 'superseded';
        }
        try {
            const played = await this.playFromSource(sourceEntry, context);
            const result = this.audioSourceAttemptResult(played, context.requestId, context.isCurrent);
            if (result === 'played') this.shuffledAudio.markPlayed(sourceEntry.bagKey, sourceEntry.id);
            else if (result === 'miss') this.shuffledAudio.markSkipped(sourceEntry.bagKey, sourceEntry.id);
            return result;
        } catch (error) {
            context.errors.push(error instanceof Error ? error.message : String(error));
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

    preload(card: JPDBCard, options: AudioPreloadOptions = {}): boolean {
        const settings = this.getSettings();
        if (!settings.audioEnabled) return false;
        const { sourceLimit, candidateLimit, prepareAudio } = audioPreloadLimits(options);
        const candidateSources = preloadableAudioSources(getOrderedAudioSources(settings), settings);
        const preloadedSources = prepareAudio ? candidateSources : cheapCandidatePreloadAudioSources(candidateSources, card);
        const sources = orderAudioSources(preloadedSources, card).slice(0, sourceLimit);
        if (!sources.length) return false;

        for (const { source } of sources) {
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
        return true;
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
        await this.playTextToSpeech(trimmed, voiceName, this.textToSpeechTextBagKey(trimmed, voiceName, settings));
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
        const userGesture = Boolean(options.userGesture);
        const reservedAudio = this.reserveJpdbGestureAudioElement(userGesture);
        const isCurrent = () => true;
        const bagKey = getJpdbAudioBagKey(candidates.map(candidate => candidate.deckId));
        const byDeckId = new Map(candidates.map(candidate => [candidate.deckId, candidate]));
        for (const deckId of this.shuffledAudio.order(bagKey, candidates.map(candidate => candidate.deckId))) {
            const candidate = byDeckId.get(deckId);
            if (!candidate) continue;
            try {
                if (await this.playJpdbAudioCandidate(candidate, settings, requestId, isCurrent, userGesture, reservedAudio)) {
                    this.shuffledAudio.markPlayed(bagKey, deckId);
                    return true;
                }
            } catch {
                candidate.audioIds.forEach(audioId => this.markJpdbAudioUnavailable(audioId));
                this.shuffledAudio.markSkipped(bagKey, deckId);
                // Try the next JPDB candidate when a page lists more than one.
            }
        }
        return await this.playMissingAudioFallback(settings, requestId, isCurrent, userGesture);
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
        return await this.playPreparedAudio(audio, requestId, () => true, { userGesture: true });
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
        userGesture: boolean,
        reservedAudio?: HTMLAudioElement,
    ): Promise<boolean> {
        return await this.playJpdbAudioSegment(candidate.audioIds, 0, settings, requestId, isCurrent, userGesture, reservedAudio);
    }

    private async playJpdbAudioSegment(
        audioIds: string[],
        index: number,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
        userGesture: boolean,
        reservedAudio?: HTMLAudioElement,
    ): Promise<boolean> {
        const audioId = audioIds[index];
        if (!audioId) return false;
        const audioUrl = await this.jpdbAudioBlobUrl(audioId, settings);
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        const audio = await this.createReadyAudio(audioUrl, reservedAudio);
        if (!(await this.playPreparedAudio(audio, requestId, isCurrent, { userGesture }))) return false;
        this.queueNextJpdbAudioSegment(audio, audioIds, index + 1, settings, requestId, isCurrent, userGesture);
        return true;
    }

    private queueNextJpdbAudioSegment(
        audio: HTMLAudioElement,
        audioIds: string[],
        index: number,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
        userGesture: boolean,
    ): void {
        if (index >= audioIds.length) return;
        audio.addEventListener('ended', () => {
            if (!this.isPlaybackCurrent(requestId, isCurrent)) return;
            void this.playJpdbAudioSegment(audioIds, index, settings, requestId, isCurrent, userGesture)
                .catch(error => {
                    const audioId = audioIds[index];
                    if (audioId) this.markJpdbAudioUnavailable(audioId);
                    log.warn('JPDB grouped audio segment failed', { audioId }, error);
                });
        }, { once: true });
    }

    private stopCurrent(except?: HTMLAudioElement): void {
        if (this.current && this.current !== except) this.current.pause();
        this.current = except;
        if (this.utterance) {
            speechSynthesis.cancel();
            this.utterance = undefined;
        }
        if (this.fallbackChimeContext) {
            void this.fallbackChimeContext.close().catch(() => undefined);
            this.fallbackChimeContext = undefined;
        }
    }

    private releaseGestureReservation(): void {
        const reservation = this.gestureReservation;
        if (!reservation) return;
        this.gestureReservation = undefined;
        window.clearTimeout(reservation.timer);
    }

    private expireGestureReservation(audio: HTMLAudioElement): void {
        const reservation = this.gestureReservation;
        if (!reservation || reservation.audio !== audio) return;
        this.gestureReservation = undefined;
        if (this.current === audio) this.stopCurrent();
    }

    private async playFromSource(
        sourceEntry: OrderedAudioSource,
        context: AudioSourcePlaybackContext,
    ): Promise<boolean> {
        const { card, settings, requestId, isCurrent } = context;
        const { source } = sourceEntry;
        if (isBrowserTextToSpeechSource(source)) return await this.playFromTextToSpeechSource(source, context);

        const candidates = await this.getCachedAudioCandidates(source, card, settings.audioTimeoutMs, settings.corsProxyUrl);
        if (!candidates.length) {
            context.errors.push(`${source.type}: ${uiText(settings.interfaceLanguage, 'audioSourceReturnedNoAudio')}`);
            return false;
        }
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        const bagKey = getAudioBagKey(source, card);
        return await this.playFromAudioCandidates(candidates, source.type, context, bagKey);
    }

    private async playFromTextToSpeechSource(source: AudioSourceSetting, context: AudioSourcePlaybackContext): Promise<boolean> {
        const { card, settings, requestId, isCurrent } = context;
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        const text = source.type === 'text-to-speech-reading' ? card.reading : card.spelling;
        const played = await this.playTextToSpeech(text, source.voice, this.textToSpeechSourceBagKey(source, card, settings), {
            avoidIdentity: context.avoidIdentity,
            onAvoided: () => { context.attemptState.skippedAvoidedIdentity = true; },
            onPlayed: identity => this.markAudioIdentityPlayed(card, identity),
        });
        return played && this.isPlaybackCurrent(requestId, isCurrent);
    }

    private async playFromAudioCandidates(
        candidates: AudioCandidate[],
        sourceType: AudioSourceType,
        context: AudioSourcePlaybackContext,
        bagKey: string,
    ): Promise<boolean> {
        const { card, settings, requestId, triedUrls, isCurrent, reservedAudio } = context;
        const playableCandidates = this.availableAudioCandidates(sourceType, candidates);
        for (const { candidate, id } of orderAudioCandidates(playableCandidates, audioCandidateSelectionMode(sourceType, settings.audioSelectionMode), bagKey, this.shuffledAudio)) {
            if (!registerAudioAttempt(triedUrls, candidate)) {
                this.shuffledAudio.markSkipped(bagKey, id);
                continue;
            }
            if (this.shouldDeferRepeatedAudioCandidate(candidate, context)) {
                this.shuffledAudio.markSkipped(bagKey, id);
                continue;
            }
            if (await this.playAudioCandidate(candidate, sourceType, id, bagKey, settings, requestId, isCurrent, card, context.errors, context.userGesture, reservedAudio)) return true;
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
        card: JPDBCard,
        errors: string[],
        userGesture: boolean,
        reservedAudio?: HTMLAudioElement,
    ): Promise<boolean> {
        let audio: HTMLAudioElement;
        try {
            audio = await this.createPlayableAudio(candidate, sourceType, settings, reservedAudio);
        } catch (error) {
            const fallbackAudio = await this.createDirectMediaFallbackAfterBlobError(candidate, sourceType, reservedAudio).catch(() => undefined);
            if (fallbackAudio) {
                audio = fallbackAudio;
                log.warn('Blob-prepared audio failed; retrying as direct media', { url: candidate.url, error: audioErrorMessage(error) });
            } else {
                errors.push(audioErrorMessage(error));
                if (sourceType === 'jpdb-tts' && candidate.jpdbAudioId) this.markJpdbAudioUnavailable(candidate.jpdbAudioId);
                return false;
            }
        }
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        let played = false;
        try {
            played = await this.playPreparedAudio(audio, requestId, isCurrent, { userGesture });
        } catch (error) {
            throw new AudioPlaybackAttemptError(error);
        }
        if (!played) return false;
        this.shuffledAudio.markPlayed(bagKey, id);
        this.markAudioCandidatePlayed(card, candidate);
        return true;
    }

    private async createDirectMediaFallbackAfterBlobError(
        candidate: AudioCandidate,
        sourceType: AudioSourceType,
        reservedAudio?: HTMLAudioElement,
    ): Promise<HTMLAudioElement | undefined> {
        if (sourceType === 'jpdb-tts' || candidate.jpdbAudioId) return undefined;
        if (!shouldFetchMediaUrlAsBlobBeforePlayback(candidate.url)) return undefined;
        if (!/^https?:\/\//i.test(candidate.url)) return undefined;
        return reservedAudio
            ? this.createReadyAudio(candidate.url, reservedAudio)
            : this.createAudioElement(candidate.url);
    }

    private shouldDeferRepeatedAudioCandidate(candidate: AudioCandidate, context: AudioSourcePlaybackContext): boolean {
        const identity = audioCandidatePlaybackIdentity(candidate);
        if (!identity || identity !== context.avoidIdentity) return false;
        context.attemptState.skippedAvoidedIdentity = true;
        return true;
    }

    private lastPlayedAudioIdentity(card: JPDBCard): string | undefined {
        for (const key of audioIdentityCardKeys(card)) {
            const identity = this.lastAudioIdentityByCard.get(key);
            if (identity) return identity;
        }
        return undefined;
    }

    private markAudioCandidatePlayed(card: JPDBCard, candidate: AudioCandidate): void {
        const identity = audioCandidatePlaybackIdentity(candidate);
        if (!identity) return;
        this.markAudioIdentityPlayed(card, identity);
    }

    private markAudioIdentityPlayed(card: JPDBCard, identity: string): void {
        for (const key of audioIdentityCardKeys(card)) {
            this.lastAudioIdentityByCard.delete(key);
            this.lastAudioIdentityByCard.set(key, identity);
        }
        while (this.lastAudioIdentityByCard.size > LAST_AUDIO_IDENTITY_LIMIT) {
            const oldest = this.lastAudioIdentityByCard.keys().next().value;
            if (!oldest) break;
            this.lastAudioIdentityByCard.delete(oldest);
        }
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
        const audioViaBlob = sourceType !== 'jiten-tts'
            && (settings.audioViaBlob || shouldForceBlobAudioPlayback(sourceType) || shouldForceBlobAudioCandidate(candidate));
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
        if (cached && cached.expiresAt > now) {
            return cached.promise.then(audio => this.createReadyAudio(audio.src));
        }
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

    private async playPreparedAudio(
        audio: HTMLAudioElement,
        requestId: number,
        isCurrent: () => boolean,
        options: { userGesture?: boolean } = {},
    ): Promise<boolean> {
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        this.current = audio;
        this.rewindPreparedAudio(audio);
        try {
            const play = audio.play();
            const started = await Promise.race([
                play.then(() => true),
                waitForAudioContextResumeTimeout(1800),
            ]).finally(() => {
                void play.catch(() => undefined);
            });
            if (!started) {
                if (this.current === audio) audio.pause();
                return false;
            }
            if (!this.isPlaybackCurrent(requestId, isCurrent)) {
                if (this.current === audio) audio.pause();
                return false;
            }
        } catch (error) {
            // Pages with a strict CSP media-src (e.g. claude.ai) refuse blob/
            // data URLs on media elements; Web Audio decoding is not subject
            // to media-src, so fall through to it before giving up.
            if (canAttemptWebAudioFallback(options.userGesture) && await this.playViaWebAudio(audio.src, requestId, isCurrent)) return true;
            throw error;
        }
        return true;
    }

    private async playViaWebAudio(audioUrl: string, requestId: number, isCurrent: () => boolean): Promise<boolean> {
        const AudioContextCtor = getAudioContextConstructor();
        if (!AudioContextCtor) return false;
        const bytes = await this.webAudioBytes(audioUrl);
        if (!bytes) return false;
        let context: AudioContext | undefined;
        try {
            context = new AudioContextCtor();
            if (!(await resumeAudioContext(context))) return false;
            if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
            const decoded = await context.decodeAudioData(bytes);
            const source = context.createBufferSource();
            source.buffer = decoded;
            source.connect(context.destination);
            await new Promise<void>(resolve => {
                source.onended = () => resolve();
                source.start();
            });
            return true;
        } catch {
            return false;
        } finally {
            await context?.close().catch(() => undefined);
        }
    }

    // Web Audio decoding is exempt from the page's media-src, so it is the only way
    // to play audio refused by a strict CSP (chatgpt.com, claude.ai). It needs the
    // raw bytes: prefer the Blob we already fetched (via the userscript bridge,
    // which bypasses the page CSP) since re-fetching a blob:/data: URL is itself
    // blocked by connect-src. fetch() is only a fallback for non-strict pages.
    private async webAudioBytes(audioUrl: string): Promise<ArrayBuffer | undefined> {
        const blob = getPageMediaBlob(audioUrl);
        if (blob) {
            try {
                return await blob.arrayBuffer();
            } catch {
                return undefined;
            }
        }
        if (!audioUrl.startsWith('blob:') && !audioUrl.startsWith('data:')) return undefined;
        try {
            return await (await fetch(audioUrl)).arrayBuffer();
        } catch {
            return undefined;
        }
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
        return createPageMediaUrl(await fetchAudioBlob(url, sourceUrl, timeoutMs, mode, settings.corsProxyUrl, settings.interfaceLanguage), url);
    }

    private playTextToSpeech(
        text: string,
        voiceName: string,
        deckKey?: string,
        options: TextToSpeechPlaybackOptions = {},
    ): Promise<boolean> {
        const settings = this.getSettings();
        if (!('speechSynthesis' in window)) throw new Error(uiText(settings.interfaceLanguage, 'textToSpeechUnavailable'));
        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ja-JP';
            const voices = speechSynthesis.getVoices();
            const choice = this.textToSpeechVoiceChoice(voices, voiceName, deckKey);
            const identity = textToSpeechPlaybackIdentity(text, choice.voice);
            if (identity === options.avoidIdentity) {
                this.markTextToSpeechVoiceSkipped(choice);
                options.onAvoided?.();
                resolve(false);
                return;
            }
            utterance.voice = choice.voice;
            utterance.onend = () => {
                this.markTextToSpeechVoicePlayed(choice);
                options.onPlayed?.(identity);
                resolve(true);
            };
            utterance.onerror = () => {
                this.markTextToSpeechVoiceSkipped(choice);
                reject(new Error(uiText(settings.interfaceLanguage, 'textToSpeechFailed')));
            };
            this.utterance = utterance;
            speechSynthesis.speak(utterance);
        });
    }

    private textToSpeechVoiceChoice(voices: SpeechSynthesisVoice[], voiceName: string, deckKey?: string): TextToSpeechVoiceChoice {
        const selectedVoiceName = voiceName.trim();
        if (selectedVoiceName) {
            return {
                voice: voices.find(voice => voice.name === selectedVoiceName)
                    ?? this.firstJapaneseTextToSpeechVoice(voices),
            };
        }

        const japaneseVoices = textToSpeechJapaneseVoices(voices);
        if (!deckKey || japaneseVoices.length < 2) {
            return { voice: japaneseVoices[0]?.voice ?? null };
        }

        const entries = japaneseVoices.map(({ voice }, index) => ({
            deckId: textToSpeechVoiceDeckId(voice, index),
            voice,
        }));
        const byId = new Map(entries.map(entry => [entry.deckId, entry.voice]));
        const deckId = this.shuffledAudio.order(deckKey, entries.map(entry => entry.deckId))
            .find(id => byId.has(id));
        return {
            deckId,
            deckKey,
            voice: deckId ? byId.get(deckId) ?? null : japaneseVoices[0]?.voice ?? null,
        };
    }

    private firstJapaneseTextToSpeechVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
        return textToSpeechJapaneseVoices(voices)[0]?.voice ?? null;
    }

    private markTextToSpeechVoicePlayed(choice: TextToSpeechVoiceChoice): void {
        if (choice.deckKey && choice.deckId) this.shuffledAudio.markPlayed(choice.deckKey, choice.deckId);
    }

    private markTextToSpeechVoiceSkipped(choice: TextToSpeechVoiceChoice): void {
        if (choice.deckKey && choice.deckId) this.shuffledAudio.markSkipped(choice.deckKey, choice.deckId);
    }

    private textToSpeechSourceBagKey(source: AudioSourceSetting, card: JPDBCard, settings: ReaderSettings): string | undefined {
        return settings.audioSelectionMode === 'random' && !source.voice.trim()
            ? getAudioBagKey(source, card)
            : undefined;
    }

    private textToSpeechTextBagKey(text: string, voiceName: string, settings: ReaderSettings): string | undefined {
        return settings.audioSelectionMode === 'random' && !voiceName.trim()
            ? ['text-to-speech', text].join('\u0001')
            : undefined;
    }

    private async playMissingAudioFallback(settings: ReaderSettings, requestId: number, isCurrent: () => boolean, userGesture = false): Promise<boolean> {
        if (!this.shouldPlayMissingAudioFallback(settings, requestId, isCurrent, userGesture)) return false;
        return await this.tryPlayMissingAudioFallback(requestId, isCurrent);
    }

    private shouldPlayMissingAudioFallback(settings: ReaderSettings, requestId: number, isCurrent: () => boolean, userGesture = false): boolean {
        if (settings.audioFallbackChimeEnabled && canAttemptWebAudioFallback(userGesture)) return this.isPlaybackCurrent(requestId, isCurrent);
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
        if (!(await resumeAudioContext(context))) {
            if (this.fallbackChimeContext === context) this.fallbackChimeContext = undefined;
            await context.close().catch(() => undefined);
            return false;
        }
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

function textToSpeechJapaneseVoices(voices: SpeechSynthesisVoice[]): Array<{ voice: SpeechSynthesisVoice }> {
    return voices
        .filter(voice => voice.lang.toLowerCase().startsWith('ja'))
        .map(voice => ({ voice }));
}

function textToSpeechVoiceDeckId(voice: SpeechSynthesisVoice, index: number): string {
    return [
        voice.name,
        voice.lang,
        String(index),
    ].join('\u0000');
}

function audioCandidatePlaybackIdentity(candidate: AudioCandidate): string {
    if (candidate.jpdbAudioId) return `jpdb:${candidate.jpdbAudioId}`;
    return normalizeAttemptedAudioUrl(candidate.url);
}

function textToSpeechPlaybackIdentity(text: string, _voice: SpeechSynthesisVoice | null): string {
    return [
        'text-to-speech',
        text,
    ].join('\u0001');
}

function audioIdentityCardKeys(card: JPDBCard): string[] {
    const keys = [[
        card.spelling,
        card.reading,
    ].join('\u0001')];
    if (card.spelling) keys.push(['spelling', card.spelling].join('\u0001'));
    return [...new Set(keys)];
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
    return window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

async function resumeAudioContext(context: AudioContext): Promise<boolean> {
    if (context.state !== 'suspended') return true;
    const resumed = context.resume()
        .then(() => true)
        .catch(() => false);
    const completed = await Promise.race([
        resumed,
        waitForAudioContextResumeTimeout(),
    ]);
    return completed && context.state !== 'suspended';
}

function waitForAudioContextResumeTimeout(timeoutMs = WEB_AUDIO_RESUME_TIMEOUT_MS): Promise<boolean> {
    return new Promise(resolve => {
        window.setTimeout(() => resolve(false), timeoutMs);
    });
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
        && hasGestureReservableAudioSource(request);
}

function shouldUseGestureAudioReservation(request: AudioPlaybackRequest): boolean {
    return (request.userGesture || request.reservedGesture)
        && hasGestureReservableAudioSource(request);
}

function hasGestureReservableAudioSource(request: AudioPlaybackRequest): boolean {
    return request.sources.some(source => !isBrowserTextToSpeechSource(source));
}

function audioErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
