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

interface AudioRequestOptions {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    data?: string;
}

interface AudioSourcePlayResult {
    state: 'played' | 'superseded' | 'miss';
    errors: string[];
}

const REQUIRED_JA_AUDIO_SOURCES: AudioSourceType[] = ['jpod101', 'language-pod-101', 'jisho', 'text-to-speech'];
const JAPANESE_POD_101_UNAVAILABLE_SIZE = 52288;
const JAPANESE_POD_101_UNAVAILABLE_SHA256 = 'ae6398b5a27bc8c0a771df6c907ade794be15518174773c58c7c7ddd17098906';
const AUDIO_CANDIDATE_CACHE_TTL_MS = 10 * 60 * 1000;
const AUDIO_BLOB_CACHE_TTL_MS = 10 * 60 * 1000;
const READY_AUDIO_CACHE_TTL_MS = 5 * 60 * 1000;
const preconnectedAudioOrigins = new Set<string>();
const log = Logger.scope('Audio');

export class AudioPlayer {
    private current?: HTMLAudioElement;
    private utterance?: SpeechSynthesisUtterance;
    private fallbackChimeContext?: AudioContext;
    private playRequestId = 0;
    private shuffledAudio = new ShuffledAudioDeck();
    private candidateCache = new Map<string, { expiresAt: number; promise: Promise<AudioCandidate[]> }>();
    private blobUrlCache = new ObjectUrlCache(AUDIO_BLOB_CACHE_TTL_MS, 'audio');
    private readyAudioCache = new Map<string, { expiresAt: number; promise: Promise<HTMLAudioElement> }>();

    constructor(private getSettings: () => ReaderSettings) {}

    async play(card: JPDBCard, options: AudioPlaybackOptions = {}): Promise<boolean> {
        const requestId = ++this.playRequestId;
        const isCurrent = options.isCurrent ?? (() => true);
        const settings = this.getSettings();
        if (!settings.audioEnabled) throw new Error('Audio playback is disabled.');
        if (!isCurrent()) return false;

        const sources = getOrderedAudioSources(settings);
        this.stopCurrent();
        if (!sources.length) {
            log.warn('No audio sources configured', { term: card.spelling });
            return await this.playMissingAudioFallback(settings, requestId, isCurrent);
        }

        const done = log.time('play', { term: card.spelling, sources: sources.map(source => source.type), viaBlob: true });
        const result = await this.playFromSources(sources, card, settings, requestId, isCurrent);
        done();
        return this.finishPlaybackResult(card, settings, requestId, isCurrent, result);
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
            log.debug('Audio request superseded', { term: card.spelling, requestId });
            return 'superseded';
        }
        try {
            const played = await this.playFromSource(source, card, settings, requestId, triedUrls, isCurrent);
            if (!this.isPlaybackCurrent(requestId, isCurrent)) return 'superseded';
            if (!played) return 'miss';
            log.debug('Audio source succeeded', { term: card.spelling, source: source.type });
            return 'played';
        } catch (error) {
            log.debug('Audio source failed; trying next source', { term: card.spelling, source: source.type }, error);
            errors.push(error instanceof Error ? error.message : String(error));
            return 'miss';
        }
    }

    preload(card: JPDBCard, options: AudioPreloadOptions = {}): void {
        const settings = this.getSettings();
        if (!settings.audioEnabled) return;
        const sourceLimit = Math.max(1, options.sourceLimit ?? 1);
        const candidateLimit = Math.max(1, options.candidateLimit ?? 1);
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
                            .catch(error => log.debug('Audio preload failed quietly', { source: source.type, term: card.spelling, sourceHost: safeHost(candidate.sourceUrl) }, error));
                    }
                })
                .catch(error => log.debug('Audio candidate preload failed quietly', { source: source.type, term: card.spelling }, error));
        }
    }

    stop(): void {
        this.playRequestId++;
        this.stopCurrent();
        log.debug('Audio stopped');
    }

    async playJapaneseText(text: string, voiceName = ''): Promise<void> {
        const requestId = ++this.playRequestId;
        const trimmed = text.trim();
        if (!trimmed) throw new Error('No text to read aloud.');

        this.stopCurrent();
        await this.playTextToSpeech(trimmed, voiceName);
        if (requestId !== this.playRequestId) this.stopCurrent();
        log.debug('Japanese text-to-speech playback started', { textLength: trimmed.length, voice: voiceName || 'auto' });
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
        log.debug('Audio candidates resolved', { source: source.type, candidates: candidates.length });
        const bagKey = getAudioBagKey(source, card);
        return await this.playFromAudioCandidates(source, candidates, settings, requestId, triedUrls, isCurrent, bagKey);
    }

    private async playFromTextToSpeechSource(source: AudioSourceSetting, card: JPDBCard, requestId: number, isCurrent: () => boolean): Promise<boolean> {
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        await this.playTextToSpeech(source.type === 'text-to-speech-reading' ? card.reading : card.spelling, source.voice);
        log.debug('Text-to-speech playback started', { source: source.type, voice: source.voice || 'auto' });
        return this.isPlaybackCurrent(requestId, isCurrent);
    }

    private async playFromAudioCandidates(
        source: AudioSourceSetting,
        candidates: AudioCandidate[],
        settings: ReaderSettings,
        requestId: number,
        triedUrls: Set<string>,
        isCurrent: () => boolean,
        bagKey: string,
    ): Promise<boolean> {
        for (const { candidate, id } of orderAudioCandidates(candidates, settings.audioSelectionMode, bagKey, this.shuffledAudio)) {
            if (!registerAudioAttempt(triedUrls, source, candidate)) continue;
            if (await this.playAudioCandidate(source, candidate, id, bagKey, settings, requestId, isCurrent)) return true;
        }
        return false;
    }

    private async playAudioCandidate(
        source: AudioSourceSetting,
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
            log.debug('Audio candidate playing', { source: source.type, viaBlob: audio.src.startsWith('blob:'), sourceHost: safeHost(candidate.sourceUrl) });
            return true;
        } catch (error) {
            log.debug('Audio candidate failed', { source: source.type, sourceHost: safeHost(candidate.sourceUrl) }, error);
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
        try {
            if (audio.readyState > HTMLMediaElement.HAVE_NOTHING) audio.currentTime = 0;
        } catch {
            // Some direct remote audio URLs do not allow seeking before metadata loads.
        }
        await audio.play();
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
            log.debug('Audio candidate cache hit', { source: source.type, term: card.spelling });
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
        log.debug('Audio media URL created', { sourceHost: safeHost(sourceUrl), type: response.type, size: response.size, viaDataUrl: blobUrl.startsWith('data:') });
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
        if (!settings.audioFallbackChimeEnabled) {
            log.debug('Missing-audio fallback is silent');
            return false;
        }
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;

        try {
            const played = await this.playSoftChime(requestId, isCurrent);
            if (!played) return false;
            log.debug('Missing-audio fallback chime played');
            return true;
        } catch (error) {
            log.debug('Missing-audio fallback chime unavailable', {}, error);
            return false;
        }
    }

    private async playSoftChime(requestId: number, isCurrent: () => boolean): Promise<boolean> {
        const AudioContextCtor = window.AudioContext
            ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) return false;

        const context = new AudioContextCtor();
        this.fallbackChimeContext = context;
        if (context.state === 'suspended') await context.resume().catch(() => undefined);
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;

        const start = context.currentTime + 0.015;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1800, start);

        const master = context.createGain();
        master.gain.setValueAtTime(0.72, start);
        filter.connect(master);
        master.connect(context.destination);

        [
            { frequency: 587.33, offset: 0, duration: 0.22, gain: 0.032 },
            { frequency: 783.99, offset: 0.11, duration: 0.28, gain: 0.024 },
        ].forEach(note => {
            const noteStart = start + note.offset;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(note.frequency, noteStart);
            gain.gain.setValueAtTime(0.0001, noteStart);
            gain.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.018);
            gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration);
            oscillator.connect(gain);
            gain.connect(filter);
            oscillator.start(noteStart);
            oscillator.stop(noteStart + note.duration + 0.03);
        });

        await new Promise(resolve => window.setTimeout(resolve, 460));
        if (this.fallbackChimeContext === context) {
            this.fallbackChimeContext = undefined;
            await context.close().catch(() => undefined);
        }
        return true;
    }
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
    if (!value) return [];
    if (typeof value === 'string') return findAudioUrlsInString(value, sourceUrl);
    if (Array.isArray(value)) return uniqueAudioUrls(value.flatMap(item => findAudioUrls(item, sourceUrl)));
    if (typeof value === 'object') return findAudioUrlsInRecord(value as Record<string, unknown>, sourceUrl);
    return [];
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

function registerAudioAttempt(triedUrls: Set<string>, source: AudioSourceSetting, candidate: AudioCandidate): boolean {
    const candidateKey = normalizeAttemptedAudioUrl(candidate.url);
    if (triedUrls.has(candidateKey)) {
        log.debug('Skipping duplicate audio candidate', { source: source.type, sourceHost: safeHost(candidate.sourceUrl) });
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
    const data = new URLSearchParams({
        post: 'dictionary_reference',
        match_type: 'exact',
        search_query: card.spelling,
        vulgar: 'true',
    }).toString();
    const response = await requestUrl(url, 'text', timeoutMs, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data,
    });
    if (typeof response !== 'string') return [];

    const urls: string[] = [];
    for (const row of findHtmlBlocksByClass(response, 'dc-result-row')) {
        const kanaHtml = findHtmlElementByClass(row, 'span', 'dc-vocab_kana');
        const kana = stripHtml(kanaHtml ?? '').trim();
        if (card.reading !== card.spelling && kana !== card.reading) continue;
        urls.push(...extractAudioSourceUrls(row, url));
    }
    return uniqueAudioUrls(urls);
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
        log.debug('Audio request via userscript API', { responseType, host: safeHost(responseUrl) });
        return requestViaUserscriptAudio(responseUrl, responseType, timeoutMs, options, userscriptRequest)
            .catch(error => {
                if (!browserUrl) throw error;
                log.debug('Audio request via userscript API failed; retrying with browser fetch', { responseType, host: safeHost(responseUrl), error: String(error instanceof Error ? error.message : error) });
                return requestViaAudioFetch(browserUrl, responseType, timeoutMs, options);
            });
    }

    if (!browserUrl) {
        return Promise.reject(new Error('Cross-origin audio request needs a userscript HTTP bridge.'));
    }

    log.debug('Audio request via browser fetch', { responseType, host: safeHost(browserUrl) });
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
        const attributes = match[1] ?? '';
        if (!attributePattern || attributePattern.test(attributes)) matches.push(match[0]);
    }
    return matches;
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
        if (!sourceUrl) return nested.href.replace(/\\/g, '/');

        const source = new URL(sourceUrl);
        const nestedIsLoopback = ['localhost', '127.0.0.1', '::1'].includes(nested.hostname);
        const sourceIsLoopback = ['localhost', '127.0.0.1', '::1'].includes(source.hostname);
        if (nestedIsLoopback && !sourceIsLoopback && nested.port === source.port) {
            nested.protocol = source.protocol;
            nested.hostname = source.hostname;
        }
        return nested.href.replace(/\\/g, '/');
    } catch {
        return value.replace(/\\/g, '/');
    }
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
    return typeof record.url === 'string'
        && (
            isLikelyAudioUrl(record.url)
            || ['audio', 'audioSource'].includes(String(record.type ?? ''))
            || typeof record.name === 'string'
        );
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
    let origin = '';
    try {
        origin = new URL(value, location.href).origin;
    } catch {
        return;
    }
    if (!origin || preconnectedAudioOrigins.has(origin)) return;
    preconnectedAudioOrigins.add(origin);

    for (const rel of ['preconnect', 'dns-prefetch']) {
        const link = document.createElement('link');
        link.rel = rel;
        link.href = origin;
        if (rel === 'preconnect') link.crossOrigin = 'anonymous';
        document.head?.append(link);
    }
}

function getBrowserFetchUrl(url: string): string | null {
    if (!/^https?:\/\//i.test(url)) return url;
    if (isLocalDevHost(location.hostname)) return `/__jpdb-reader-audio-proxy?url=${encodeURIComponent(url)}`;
    try {
        return new URL(url).origin === location.origin ? url : null;
    } catch {
        return null;
    }
}

function isLocalDevHost(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeHost(value: string): string {
    try {
        return new URL(value, location.href).host;
    } catch {
        return 'invalid-url';
    }
}
