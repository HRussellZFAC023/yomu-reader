import { Logger } from './logger';
import { ObjectUrlCache } from './object-url-cache';
import { createPageMediaUrl } from './page-media-url';
import type { AudioSelectionMode, AudioSourceSetting, AudioSourceType, JPDBCard, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';

interface AudioCandidate {
    url: string;
    sourceUrl: string;
}

interface AudioPlaybackOptions {
    isCurrent?: () => boolean;
}

interface AudioPreloadOptions {
    sourceLimit?: number;
    candidateLimit?: number;
}

interface AudioPreloadLimits {
    sourceLimit: number;
    candidateLimit: number;
}

interface AudioRequestOptions {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    data?: string;
}

interface AudioSourcePlayResult {
    state: 'played' | 'superseded' | 'miss';
    errors: string[];
}

interface AudioPlaybackRequest {
    requestId: number;
    isCurrent: () => boolean;
    settings: ReaderSettings;
    sources: AudioSourceSetting[];
}

interface SoftChimeNote {
    frequency: number;
    offset: number;
    duration: number;
    gain: number;
}

const REQUIRED_JA_AUDIO_SOURCES: AudioSourceType[] = ['jpod101', 'language-pod-101', 'jisho', 'text-to-speech'];
const JAPANESE_POD_101_UNAVAILABLE_SIZE = 52288;
const JAPANESE_POD_101_UNAVAILABLE_SHA256 = 'ae6398b5a27bc8c0a771df6c907ade794be15518174773c58c7c7ddd17098906';
const AUDIO_CANDIDATE_CACHE_TTL_MS = 10 * 60 * 1000;
const AUDIO_BLOB_CACHE_TTL_MS = 10 * 60 * 1000;
const READY_AUDIO_CACHE_TTL_MS = 5 * 60 * 1000;
const LOOPBACK_AUDIO_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SOFT_CHIME_NOTES: SoftChimeNote[] = [
    { frequency: 587.33, offset: 0, duration: 0.22, gain: 0.032 },
    { frequency: 783.99, offset: 0.11, duration: 0.28, gain: 0.024 },
];
const AUDIO_PRECONNECT_RELS = ['preconnect', 'dns-prefetch'] as const;
const preconnectedAudioOrigins = new Set<string>();
const log = Logger.scope('Audio');

export class AudioPlayer {
    private current?: HTMLAudioElement;
    private utterance?: SpeechSynthesisUtterance;
    private fallbackChimeContext?: AudioContext;
    private playRequestId = 0;
    private shuffledAudio = new ShuffledAudioDeck();
    private candidateCache = new Map<string, { expiresAt: number; promise: Promise<AudioCandidate[]> }>();
    private blobUrlCache = new ObjectUrlCache(AUDIO_BLOB_CACHE_TTL_MS);
    private readyAudioCache = new Map<string, { expiresAt: number; promise: Promise<HTMLAudioElement> }>();

    constructor(private getSettings: () => ReaderSettings) {}

    async play(card: JPDBCard, options: AudioPlaybackOptions = {}): Promise<boolean> {
        const request = this.audioPlaybackRequest(options);
        this.ensureAudioEnabled(request.settings);
        if (!request.isCurrent()) return false;
        this.stopCurrent();
        if (!request.sources.length) return await this.playNoAudioSources(card, request);

        const done = log.time('play', { term: card.spelling, sources: request.sources.map(source => source.type), viaBlob: true });
        const result = await this.playFromSources(request.sources, card, request.settings, request.requestId, request.isCurrent);
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
        };
    }

    private ensureAudioEnabled(settings: ReaderSettings): void {
        if (!settings.audioEnabled) throw new Error('Audio playback is disabled.');
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
    ): Promise<AudioSourcePlayResult> {
        const errors: string[] = [];
        const triedUrls = new Set<string>();
        for (const source of sources) {
            const result = await this.playSourceWithErrors(source, card, settings, requestId, triedUrls, isCurrent, errors);
            if (result !== 'miss') return { state: result, errors };
        }
        return { state: 'miss', errors };
    }

    private async playSourceWithErrors(
        source: AudioSourceSetting,
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        triedUrls: Set<string>,
        isCurrent: () => boolean,
        errors: string[],
    ): Promise<AudioSourcePlayResult['state']> {
        if (!this.isPlaybackCurrent(requestId, isCurrent)) {
            return 'superseded';
        }
        try {
            const played = await this.playFromSource(source, card, settings, requestId, triedUrls, isCurrent);
            return this.audioSourceAttemptResult(played, requestId, isCurrent);
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
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
        const { sourceLimit, candidateLimit } = audioPreloadLimits(options);
        const sources = getOrderedAudioSources(settings)
            .filter(source => source.type !== 'text-to-speech' && source.type !== 'text-to-speech-reading')
            .slice(0, sourceLimit);
        if (!sources.length) return;

        for (const source of sources) {
            void this.getCachedAudioCandidates(source, card, settings.audioTimeoutMs)
                .then(candidates => {
                    const triedUrls = new Set<string>();
                    for (const { candidate } of orderAudioCandidates(candidates, settings.audioSelectionMode, getAudioBagKey(source, card), this.shuffledAudio).slice(0, candidateLimit)) {
                        const candidateKey = normalizeAttemptedAudioUrl(candidate.url);
                        if (triedUrls.has(candidateKey)) continue;
                        triedUrls.add(candidateKey);
                        preconnectAudioUrl(candidate.url);
                        void this.preparePlayableAudio(candidate, settings.audioTimeoutMs, settings.audioSelectionMode, settings.audioViaBlob)
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
        const requestId = ++this.playRequestId;
        const trimmed = text.trim();
        if (!trimmed) throw new Error('No text to read aloud.');

        this.stopCurrent();
        await this.playTextToSpeech(trimmed, voiceName);
        if (requestId !== this.playRequestId) this.stopCurrent();
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
        source: AudioSourceSetting,
        card: JPDBCard,
        settings: ReaderSettings,
        requestId: number,
        triedUrls: Set<string>,
        isCurrent: () => boolean,
    ): Promise<boolean> {
        if (isTextToSpeechSource(source)) return await this.playFromTextToSpeechSource(source, card, requestId, isCurrent);

        const candidates = await this.getCachedAudioCandidates(source, card, settings.audioTimeoutMs);
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        const bagKey = getAudioBagKey(source, card);
        return await this.playFromAudioCandidates(candidates, settings, requestId, triedUrls, isCurrent, bagKey);
    }

    private async playFromTextToSpeechSource(source: AudioSourceSetting, card: JPDBCard, requestId: number, isCurrent: () => boolean): Promise<boolean> {
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        await this.playTextToSpeech(source.type === 'text-to-speech-reading' ? card.reading : card.spelling, source.voice);
        return this.isPlaybackCurrent(requestId, isCurrent);
    }

    private async playFromAudioCandidates(
        candidates: AudioCandidate[],
        settings: ReaderSettings,
        requestId: number,
        triedUrls: Set<string>,
        isCurrent: () => boolean,
        bagKey: string,
    ): Promise<boolean> {
        for (const { candidate, id } of orderAudioCandidates(candidates, settings.audioSelectionMode, bagKey, this.shuffledAudio)) {
            if (!registerAudioAttempt(triedUrls, candidate)) continue;
            if (await this.playAudioCandidate(candidate, id, bagKey, settings, requestId, isCurrent)) return true;
        }
        return false;
    }

    private async playAudioCandidate(
        candidate: AudioCandidate,
        id: string,
        bagKey: string,
        settings: ReaderSettings,
        requestId: number,
        isCurrent: () => boolean,
    ): Promise<boolean> {
        try {
            const audio = await this.createPlayableAudio(candidate, settings);
            if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
            const played = await this.playPreparedAudio(audio, requestId, isCurrent);
            if (!played) return false;
            this.shuffledAudio.markPlayed(bagKey, id);
            return true;
        } catch {
            return false;
        }
    }

    private createPlayableAudio(candidate: AudioCandidate, settings: ReaderSettings): Promise<HTMLAudioElement> | HTMLAudioElement {
        return settings.audioViaBlob
            ? this.preparePlayableAudio(candidate, settings.audioTimeoutMs, settings.audioSelectionMode, settings.audioViaBlob)
            : this.createAudioElement(candidate.url);
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

    private preparePlayableAudio(candidate: AudioCandidate, timeoutMs: number, mode: AudioSelectionMode, audioViaBlob: boolean): Promise<HTMLAudioElement> {
        const fetchAsBlob = shouldFetchCandidateAsBlob(candidate, audioViaBlob);
        const key = preparedAudioCacheKey(candidate, mode, fetchAsBlob);
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
        return promise;
    }

    private async createReadyAudio(audioUrl: string): Promise<HTMLAudioElement> {
        const audio = this.createAudioElement(audioUrl);
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
        return this.finishPreparedAudio(audio, requestId, isCurrent);
    }

    private rewindPreparedAudio(audio: HTMLAudioElement): void {
        try {
            if (audio.readyState > HTMLMediaElement.HAVE_NOTHING) audio.currentTime = 0;
        } catch {
            // Some direct remote audio URLs do not allow seeking before metadata loads.
        }
    }

    private finishPreparedAudio(audio: HTMLAudioElement, requestId: number, isCurrent: () => boolean): boolean {
        if (!this.isPlaybackCurrent(requestId, isCurrent)) {
            audio.pause();
            return false;
        }
        return true;
    }

    private getCachedAudioCandidates(source: AudioSourceSetting, card: JPDBCard, timeoutMs: number): Promise<AudioCandidate[]> {
        const key = getAudioCandidateCacheKey(source, card);
        const now = Date.now();
        const cached = this.candidateCache.get(key);
        if (cached && cached.expiresAt > now) {
            return cached.promise.then(cloneAudioCandidates);
        }

        let promise!: Promise<AudioCandidate[]>;
        promise = getAudioCandidates(source, card, timeoutMs)
            .then(candidates => cloneAudioCandidates(candidates))
            .catch(error => {
                if (this.candidateCache.get(key)?.promise === promise) this.candidateCache.delete(key);
                throw error;
            });
        this.candidateCache.set(key, { expiresAt: now + AUDIO_CANDIDATE_CACHE_TTL_MS, promise });
        return promise.then(cloneAudioCandidates);
    }

    private async fetchAudioAsBlobUrl(url: string, sourceUrl: string, timeoutMs: number, mode: AudioSelectionMode): Promise<string> {
        const response = await requestUrl(url, 'blob', timeoutMs);
        if (isJsonAudioResponse(response)) return this.fetchNestedAudioBlobUrl(response, sourceUrl, timeoutMs, mode);

        if (!(response instanceof Blob)) throw new Error('Audio source did not return audio.');
        await assertPlayableAudioBlob(response, url, sourceUrl);
        const blobUrl = await createPageMediaUrl(response);
        return blobUrl;
    }

    private async fetchNestedAudioBlobUrl(response: Blob, sourceUrl: string, timeoutMs: number, mode: AudioSelectionMode): Promise<string> {
        const json = JSON.parse(await response.text()) as unknown;
        const nestedUrl = findAudioUrl(json, sourceUrl, mode);
        if (!nestedUrl) throw new Error('Audio JSON did not include a playable URL.');
        return this.fetchAudioAsBlobUrl(nestedUrl, sourceUrl, timeoutMs, mode);
    }

    private playTextToSpeech(text: string, voiceName: string): Promise<void> {
        if (!('speechSynthesis' in window)) throw new Error('Text-to-speech is not available in this browser.');
        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ja-JP';
            const voices = speechSynthesis.getVoices();
            utterance.voice = (voiceName ? voices.find(voice => voice.name === voiceName) : undefined)
                ?? voices.find(voice => voice.lang.toLowerCase().startsWith('ja'))
                ?? null;
            utterance.onend = () => resolve();
            utterance.onerror = () => reject(new Error('Text-to-speech failed.'));
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
        this.logSilentMissingAudioFallback();
        return false;
    }

    private logSilentMissingAudioFallback(): void {
    }

    private async tryPlayMissingAudioFallback(requestId: number, isCurrent: () => boolean): Promise<boolean> {
        try {
            const played = await this.playSoftChime(requestId, isCurrent);
            return this.finishMissingAudioFallback(played);
        } catch {
            return false;
        }
    }

    private finishMissingAudioFallback(played: boolean): boolean {
        if (played) {
            return true;
        }
        return false;
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

export class ShuffledAudioDeck {
    private bags = new Map<string, ShuffledAudioBag>();

    constructor(private random: () => number = Math.random) {}

    order(key: string, ids: string[]): string[] {
        if (ids.length < 2) return ids;

        const signature = ids.join('\u0000');
        const current = this.bags.get(key);
        if (reusableAudioBag(current, signature)) return [...current.remaining];

        const next = this.buildAudioBag(ids, signature, current);
        this.bags.set(key, next);
        return [...next.remaining];
    }

    private buildAudioBag(ids: string[], signature: string, current: ShuffledAudioBag | undefined): ShuffledAudioBag {
        const remaining = this.shuffle(ids);
        const lastPlayed = current?.signature === signature ? current.lastPlayed : undefined;
        rotateRepeatedAudioLead(remaining, lastPlayed);
        return { signature, remaining, lastPlayed };
    }

    markPlayed(key: string, id: string): void {
        const current = this.bags.get(key);
        if (!current) return;

        const index = current.remaining.indexOf(id);
        if (index >= 0) current.remaining.splice(index, 1);
        current.lastPlayed = id;
    }

    private shuffle(values: string[]): string[] {
        const shuffled = [...values];
        for (let index = shuffled.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(this.random() * (index + 1));
            [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
        }
        return shuffled;
    }
}

interface ShuffledAudioBag {
    signature: string;
    remaining: string[];
    lastPlayed?: string;
}

function reusableAudioBag(bag: ShuffledAudioBag | undefined, signature: string): bag is ShuffledAudioBag {
    return Boolean(bag && bag.signature === signature && bag.remaining.length);
}

function rotateRepeatedAudioLead(ids: string[], lastPlayed: string | undefined): void {
    if (lastPlayed && ids.length > 1 && ids[0] === lastPlayed) ids.push(ids.shift()!);
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

function directAudioUrlsForValue(value: unknown, sourceUrl?: string): string[] | null {
    if (!value) return [];
    if (typeof value === 'string') return findAudioUrlsInString(value, sourceUrl);
    return structuredAudioUrlsForValue(value, sourceUrl);
}

function structuredAudioUrlsForValue(value: unknown, sourceUrl?: string): string[] | null {
    if (Array.isArray(value)) return uniqueAudioUrls(value.flatMap(item => findAudioUrls(item, sourceUrl)));
    return typeof value === 'object' ? findAudioUrlsInRecord(value as Record<string, unknown>, sourceUrl) : null;
}

function findAudioUrlsInString(value: string, sourceUrl?: string): string[] {
    if (value.startsWith('data:audio/')) return [value];
    if (/^https?:\/\//.test(value) && isLikelyAudioUrl(value)) return [normalizeAudioUrl(value, sourceUrl)];
    return [];
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

function isJsonAudioResponse(response: unknown): response is Blob {
    return response instanceof Blob && response.type.includes('json');
}

async function assertPlayableAudioBlob(response: Blob, url: string, sourceUrl: string): Promise<void> {
    if ((isJapanesePod101Url(url) || isJapanesePod101Url(sourceUrl)) && await isUnavailableJapanesePod101Audio(response)) {
        throw new Error('JapanesePod101 has no audio for this term.');
    }
}

function getOrderedAudioSources(settings: ReaderSettings): AudioSourceSetting[] {
    const sources = settings.audioSources.filter(source => source.enabled);
    if (!settings.audioEnableDefaultSources) return sources;

    const configuredTypes = new Set(settings.audioSources.map(source => source.type));
    return [
        ...sources,
        ...REQUIRED_JA_AUDIO_SOURCES
            .filter(type => !configuredTypes.has(type))
            .map(type => ({ type, url: '', voice: '', enabled: true })),
    ];
}

function audioPreloadLimits(options: AudioPreloadOptions): AudioPreloadLimits {
    return {
        sourceLimit: Math.max(1, options.sourceLimit ?? 1),
        candidateLimit: Math.max(1, options.candidateLimit ?? 1),
    };
}

async function getAudioCandidates(source: AudioSourceSetting, card: JPDBCard, timeoutMs: number): Promise<AudioCandidate[]> {
    return await (AUDIO_CANDIDATE_LOADERS[source.type] ?? loadNoAudioCandidates)(source, card, timeoutMs);
}

type AudioCandidateLoader = (source: AudioSourceSetting, card: JPDBCard, timeoutMs: number) => Promise<AudioCandidate[]>;

const AUDIO_CANDIDATE_LOADERS: Partial<Record<AudioSourceType, AudioCandidateLoader>> = {
    custom: loadCustomAudioCandidates,
    'custom-json': loadCustomJsonAudioCandidates,
    jpod101: loadJapanesePod101AudioCandidates,
    'language-pod-101': async (_source, card, timeoutMs) => urlsToAudioCandidates(await getLanguagePod101AudioUrls(card, timeoutMs)),
    jisho: async (_source, card, timeoutMs) => urlsToAudioCandidates(await getJishoAudioUrls(card, timeoutMs)),
    'lingua-libre': async (_source, card, timeoutMs) => urlsToAudioCandidates(await getCommonsAudioUrls(card.spelling, 'lingua-libre', timeoutMs)),
    wiktionary: async (_source, card, timeoutMs) => urlsToAudioCandidates(await getCommonsAudioUrls(card.spelling, 'wiktionary', timeoutMs)),
};

async function loadNoAudioCandidates(): Promise<AudioCandidate[]> {
    return [];
}

async function loadCustomAudioCandidates(source: AudioSourceSetting, card: JPDBCard): Promise<AudioCandidate[]> {
    if (!source.url.trim()) return [];
    const url = formatAudioUrl(source.url, card);
    return [{ url, sourceUrl: url }];
}

async function loadCustomJsonAudioCandidates(source: AudioSourceSetting, card: JPDBCard, timeoutMs: number): Promise<AudioCandidate[]> {
    if (!source.url.trim()) return [];
    const sourceUrl = formatAudioUrl(source.url, card);
    const response = await requestUrl(sourceUrl, 'text', timeoutMs);
    const urls = typeof response === 'string' ? findAudioUrls(JSON.parse(response), sourceUrl) : [];
    return urls.map(url => ({ url, sourceUrl }));
}

async function loadJapanesePod101AudioCandidates(_source: AudioSourceSetting, card: JPDBCard): Promise<AudioCandidate[]> {
    const url = getJapanesePod101Url(card);
    return [{ url, sourceUrl: url }];
}

function urlsToAudioCandidates(urls: string[]): AudioCandidate[] {
    return urls.map(url => ({ url, sourceUrl: url }));
}

function orderAudioCandidates(
    candidates: AudioCandidate[],
    mode: AudioSelectionMode,
    bagKey: string,
    shuffledAudio: ShuffledAudioDeck,
): Array<{ candidate: AudioCandidate; id: string }> {
    const entries = candidates.map((candidate, index) => ({
        candidate,
        id: `${index}\u0000${candidate.url}\u0000${candidate.sourceUrl}`,
    }));
    if (mode !== 'random' || entries.length < 2) return entries;

    const byId = new Map(entries.map(entry => [entry.id, entry]));
    return shuffledAudio.order(bagKey, entries.map(entry => entry.id))
        .map(id => byId.get(id))
        .filter((entry): entry is { candidate: AudioCandidate; id: string } => Boolean(entry));
}

function isTextToSpeechSource(source: AudioSourceSetting): boolean {
    return source.type === 'text-to-speech' || source.type === 'text-to-speech-reading';
}

function registerAudioAttempt(triedUrls: Set<string>, candidate: AudioCandidate): boolean {
    const candidateKey = normalizeAttemptedAudioUrl(candidate.url);
    if (triedUrls.has(candidateKey)) {
        return false;
    }
    triedUrls.add(candidateKey);
    return true;
}

function getAudioBagKey(source: AudioSourceSetting, card: JPDBCard): string {
    return [
        source.type,
        source.url,
        source.voice,
        card.spelling,
        card.reading,
    ].join('\u0001');
}

function getAudioCandidateCacheKey(source: AudioSourceSetting, card: JPDBCard): string {
    return [
        source.type,
        source.url.trim(),
        source.voice.trim(),
        card.spelling,
        card.reading,
    ].join('\u0001');
}

function preparedAudioCacheKey(candidate: AudioCandidate, mode: AudioSelectionMode, audioViaBlob: boolean): string {
    return [
        normalizeAttemptedAudioUrl(candidate.url),
        normalizeAttemptedAudioUrl(candidate.sourceUrl),
        mode,
        audioViaBlob ? 'blob' : 'direct',
    ].join('\u0001');
}

function cloneAudioCandidates(candidates: AudioCandidate[]): AudioCandidate[] {
    return candidates.map(candidate => ({ ...candidate }));
}

function getJapanesePod101Url(card: JPDBCard): string {
    const params = new URLSearchParams();
    if (card.spelling !== card.reading) params.set('kanji', card.spelling);
    params.set('kana', card.reading);
    return `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?${params.toString()}`;
}

function isJapanesePod101Url(value: string): boolean {
    try {
        const url = new URL(value);
        return url.hostname === 'assets.languagepod101.com' && url.pathname.endsWith('/audiomp3.php');
    } catch {
        return false;
    }
}

async function getJishoAudioUrls(card: JPDBCard, timeoutMs: number): Promise<string[]> {
    const url = `https://jisho.org/search/${encodeURIComponent(card.spelling)}`;
    const response = await requestUrl(url, 'text', timeoutMs);
    if (typeof response !== 'string') return [];

    const audioHtml = findHtmlElementById(response, 'audio', `audio_${card.spelling}:${card.reading}`) ?? findHtmlElement(response, 'audio');
    return audioHtml ? extractAudioSourceUrls(audioHtml, url).slice(0, 1) : [];
}

async function getLanguagePod101AudioUrls(card: JPDBCard, timeoutMs: number): Promise<string[]> {
    const url = 'https://www.japanesepod101.com/learningcenter/reference/dictionary_post';
    const response = await requestUrl(url, 'text', timeoutMs, languagePod101RequestOptions(card));
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
    return new URLSearchParams({
        post: 'dictionary_reference',
        match_type: 'exact',
        search_query: card.spelling,
        vulgar: 'true',
    }).toString();
}

function languagePod101RowMatchesCard(row: string, card: JPDBCard): boolean {
    return card.reading === card.spelling || languagePod101RowKana(row) === card.reading;
}

function languagePod101RowKana(row: string): string {
    const kanaHtml = findHtmlElementByClass(row, 'span', 'dc-vocab_kana');
    return stripHtml(kanaHtml ?? '').trim();
}

async function getCommonsAudioUrls(term: string, source: 'lingua-libre' | 'wiktionary', timeoutMs: number): Promise<string[]> {
    const apiUrl = commonsSearchApiUrl(term, source);
    const response = await requestUrl(apiUrl, 'text', timeoutMs);
    if (typeof response !== 'string') return [];

    const urls: string[] = [];
    for (const title of commonsSearchTitles(response)) {
        urls.push(...await getCommonsAudioUrlsForTitle(title, term, source, timeoutMs));
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

async function getCommonsAudioUrlsForTitle(title: string, term: string, source: 'lingua-libre' | 'wiktionary', timeoutMs: number): Promise<string[]> {
    const info = await requestUrl(commonsImageInfoUrl(title), 'text', timeoutMs).catch(() => null);
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

function requestUrl(responseUrl: string, responseType: 'blob' | 'text', timeoutMs: number, options: AudioRequestOptions = {}): Promise<unknown> {
    const userscriptRequest = getUserscriptHttpRequest();
    const browserUrl = getBrowserFetchUrl(responseUrl);
    if (userscriptRequest) {
        return requestViaUserscriptAudio(responseUrl, responseType, timeoutMs, options, userscriptRequest)
            .catch(error => {
                if (!browserUrl) throw error;
                return requestViaAudioFetch(browserUrl, responseType, timeoutMs, options);
            });
    }

    if (!browserUrl) {
        return Promise.reject(new Error('Cross-origin audio request needs a userscript HTTP bridge.'));
    }

    return requestViaAudioFetch(browserUrl, responseType, timeoutMs, options);
}

function requestViaUserscriptAudio(
    responseUrl: string,
    responseType: 'blob' | 'text',
    timeoutMs: number,
    options: AudioRequestOptions,
    userscriptRequest: UserscriptHttpRequest,
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const handleLoad = (response: UserscriptHttpResponse) => {
            if (response.status >= 200 && response.status < 300) {
                const value = response.response ?? response.responseText;
                if (responseType === 'blob' && value instanceof Blob) {
                    resolve(value);
                    return;
                }
                if (responseType === 'text' && typeof value === 'string') {
                    resolve(value);
                    return;
                }
            }
            reject(new Error(`Audio request failed (${response.status}).`));
        };

        const result = userscriptRequest({
            method: options.method ?? 'GET',
            url: responseUrl,
            headers: options.headers,
            data: options.data,
            responseType,
            timeout: timeoutMs,
            onload: handleLoad,
            onerror: () => reject(new Error('Audio request failed.')),
            ontimeout: () => reject(new Error('Audio request timed out.')),
        });
        if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
            (result as Promise<UserscriptHttpResponse>).then(handleLoad, () => reject(new Error('Audio request failed.')));
        }
    });
}

function requestViaAudioFetch(responseUrl: string, responseType: 'blob' | 'text', timeoutMs: number, options: AudioRequestOptions): Promise<unknown> {
    return fetch(responseUrl, {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.data,
        signal: AbortSignal.timeout(timeoutMs),
    }).then(async response => {
        if (!response.ok) throw new Error(`Audio request failed (${response.status}).`);
        return responseType === 'blob' ? await response.blob() : await response.text();
    });
}

function findHtmlElementById(html: string, tag: string, id: string): string | null {
    return findHtmlElement(html, tag, new RegExp(`\\bid\\s*=\\s*(["'])${escapeRegExp(id)}\\1`, 'i'));
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
        if (src) urls.push(new URL(src, baseUrl).href);
    }
    return uniqueAudioUrls(urls);
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

function normalizeAttemptedAudioUrl(value: string): string {
    try {
        const url = new URL(value, location.href);
        url.hash = '';
        return url.href;
    } catch {
        return value;
    }
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

function getBrowserFetchUrl(url: string): string | null {
    if (!isHttpAudioUrl(url)) return url;
    return sameOriginAudioUrl(url);
}

function isHttpAudioUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

function sameOriginAudioUrl(url: string): string | null {
    try {
        return new URL(url).origin === location.origin ? url : null;
    } catch {
        return null;
    }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
