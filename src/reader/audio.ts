import { Logger } from './logger';
import { ObjectUrlCache } from './object-url-cache';
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
        const errors: string[] = [];
        const triedUrls = new Set<string>();
        for (const source of sources) {
            if (!this.isPlaybackCurrent(requestId, isCurrent)) {
                log.debug('Audio request superseded', { term: card.spelling, requestId });
                done();
                return false;
            }
            try {
                const played = await this.playFromSource(source, card, settings, requestId, triedUrls, isCurrent);
                if (!this.isPlaybackCurrent(requestId, isCurrent)) {
                    done();
                    return false;
                }
                if (played) {
                    log.debug('Audio source succeeded', { term: card.spelling, source: source.type });
                    done();
                    return true;
                }
            } catch (error) {
                log.debug('Audio source failed; trying next source', { term: card.spelling, source: source.type }, error);
                errors.push(error instanceof Error ? error.message : String(error));
            }
        }

        done();
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        log.warn('No playable audio found', { term: card.spelling, errors });
        return await this.playMissingAudioFallback(settings, requestId, isCurrent);
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
        if (source.type === 'text-to-speech' || source.type === 'text-to-speech-reading') {
            if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
            await this.playTextToSpeech(source.type === 'text-to-speech-reading' ? card.reading : card.spelling, source.voice);
            log.debug('Text-to-speech playback started', { source: source.type, voice: source.voice || 'auto' });
            return this.isPlaybackCurrent(requestId, isCurrent);
        }

        const candidates = await this.getCachedAudioCandidates(source, card, settings.audioTimeoutMs);
        if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
        log.debug('Audio candidates resolved', { source: source.type, candidates: candidates.length });
        const bagKey = getAudioBagKey(source, card);
        for (const { candidate, id } of orderAudioCandidates(candidates, settings.audioSelectionMode, bagKey, this.shuffledAudio)) {
            const candidateKey = normalizeAttemptedAudioUrl(candidate.url);
            if (triedUrls.has(candidateKey)) {
                log.debug('Skipping duplicate audio candidate', { source: source.type, sourceHost: safeHost(candidate.sourceUrl) });
                continue;
            }
            triedUrls.add(candidateKey);
            try {
                const audio = settings.audioViaBlob
                    ? await this.preparePlayableAudio(candidate, settings.audioTimeoutMs, settings.audioSelectionMode, settings.audioViaBlob)
                    : this.createAudioElement(candidate.url);
                if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
                const played = await this.playPreparedAudio(audio, requestId, isCurrent);
                if (!played) return false;
                this.shuffledAudio.markPlayed(bagKey, id);
                log.debug('Audio candidate playing', { source: source.type, viaBlob: audio.src.startsWith('blob:'), sourceHost: safeHost(candidate.sourceUrl) });
                return true;
            } catch (error) {
                log.debug('Audio candidate failed', { source: source.type, sourceHost: safeHost(candidate.sourceUrl) }, error);
            }
        }
        return false;
    }

    private isPlaybackCurrent(requestId: number, isCurrent: () => boolean): boolean {
        return requestId === this.playRequestId && isCurrent();
    }

    private prepareAudioUrl(candidate: AudioCandidate, timeoutMs: number, mode: AudioSelectionMode, audioViaBlob: boolean): Promise<string> {
        if (!shouldFetchCandidateAsBlob(candidate, audioViaBlob)) return Promise.resolve(candidate.url);

        preconnectAudioUrl(candidate.url);
        const key = preparedAudioCacheKey(candidate, mode, audioViaBlob);
        return this.blobUrlCache.getOrCreate(key, () => this.fetchAudioAsBlobUrl(candidate.url, candidate.sourceUrl, timeoutMs, mode));
    }

    private preparePlayableAudio(candidate: AudioCandidate, timeoutMs: number, mode: AudioSelectionMode, audioViaBlob: boolean): Promise<HTMLAudioElement> {
        const key = preparedAudioCacheKey(candidate, mode, audioViaBlob);
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
        if (response instanceof Blob && response.type.includes('json')) {
            const json = JSON.parse(await response.text()) as unknown;
            const nestedUrl = findAudioUrl(json, sourceUrl, mode);
            if (!nestedUrl) throw new Error('Audio JSON did not include a playable URL.');
            return this.fetchAudioAsBlobUrl(nestedUrl, sourceUrl, timeoutMs, mode);
        }

        if (!(response instanceof Blob)) throw new Error('Audio source did not return audio.');
        if ((isJapanesePod101Url(url) || isJapanesePod101Url(sourceUrl)) && await isUnavailableJapanesePod101Audio(response)) {
            throw new Error('JapanesePod101 has no audio for this term.');
        }
        const blobUrl = URL.createObjectURL(response);
        log.debug('Audio blob URL created', { sourceHost: safeHost(sourceUrl), type: response.type, size: response.size });
        return blobUrl;
    }

    private playTextToSpeech(text: string, voiceName: string): Promise<void> {
        if (!('speechSynthesis' in window)) throw new Error('Text-to-speech is not available in this browser.');
        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ja-JP';
            utterance.voice = speechSynthesis.getVoices().find(voice =>
                voice.name === voiceName || voice.lang.toLowerCase().startsWith('ja'),
            ) ?? null;
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
    private bags = new Map<string, { signature: string; remaining: string[]; lastPlayed?: string }>();

    constructor(private random: () => number = Math.random) {}

    order(key: string, ids: string[]): string[] {
        if (ids.length < 2) return ids;

        const signature = ids.join('\u0000');
        const current = this.bags.get(key);
        if (!current || current.signature !== signature || !current.remaining.length) {
            const next = this.shuffle(ids);
            const lastPlayed = current?.signature === signature ? current.lastPlayed : undefined;
            if (lastPlayed && next.length > 1 && next[0] === lastPlayed) {
                next.push(next.shift()!);
            }
            this.bags.set(key, { signature, remaining: next, lastPlayed });
            return [...next];
        }

        return [...current.remaining];
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
    if (typeof value === 'string') {
        if (value.startsWith('data:audio/')) return [value];
        if (/^https?:\/\//.test(value) && isLikelyAudioUrl(value)) return [normalizeAudioUrl(value, sourceUrl)];
        return [];
    }
    if (Array.isArray(value)) {
        return uniqueAudioUrls(value.flatMap(item => findAudioUrls(item, sourceUrl)));
    }
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const preferred = [
            ...findAudioUrls(record.audioSources, sourceUrl),
            ...findAudioUrls(record.sources, sourceUrl),
            ...findAudioUrls(record.audio, sourceUrl),
            ...findAudioUrls(record.audioUrl, sourceUrl),
            ...findAudioUrls(record.src, sourceUrl),
            ...findAudioUrls(record.source, sourceUrl),
        ];
        const directUrl = typeof record.url === 'string' && isLikelyAudioRecord(record)
            ? findAudioUrls(record.url, sourceUrl)
            : [];
        const known = uniqueAudioUrls([...preferred, ...directUrl]);
        if (known.length) return known;
        return uniqueAudioUrls(Object.entries(record)
            .filter(([key]) => !['url', 'audioSources', 'sources', 'audio', 'audioUrl', 'src', 'source'].includes(key))
            .flatMap(([, nested]) => findAudioUrls(nested, sourceUrl)));
    }
    return [];
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
    switch (source.type) {
        case 'custom':
            if (!source.url.trim()) return [];
            return [{ url: formatAudioUrl(source.url, card), sourceUrl: formatAudioUrl(source.url, card) }];
        case 'custom-json': {
            if (!source.url.trim()) return [];
            const sourceUrl = formatAudioUrl(source.url, card);
            const response = await requestUrl(sourceUrl, 'text', timeoutMs);
            const urls = typeof response === 'string' ? findAudioUrls(JSON.parse(response), sourceUrl) : [];
            return urls.map(url => ({ url, sourceUrl }));
        }
        case 'jpod101':
        case 'language-pod-101':
            return [{ url: getJapanesePod101Url(card), sourceUrl: getJapanesePod101Url(card) }];
        case 'jisho':
            return (await getJishoAudioUrls(card, timeoutMs)).map(url => ({ url, sourceUrl: url }));
        case 'lingua-libre':
            return (await getCommonsAudioUrls(card.spelling, 'lingua-libre', timeoutMs)).map(url => ({ url, sourceUrl: url }));
        case 'wiktionary':
            return (await getCommonsAudioUrls(card.spelling, 'wiktionary', timeoutMs)).map(url => ({ url, sourceUrl: url }));
        default:
            return [];
    }
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

    const doc = new DOMParser().parseFromString(response, 'text/html');
    const audio = doc.getElementById(`audio_${card.spelling}:${card.reading}`) ?? doc.querySelector('audio');
    const source = audio?.querySelector('source')?.getAttribute('src');
    return source ? [new URL(source, url).href] : [];
}

async function getCommonsAudioUrls(term: string, source: 'lingua-libre' | 'wiktionary', timeoutMs: number): Promise<string[]> {
    const search = source === 'lingua-libre'
        ? `intitle:/-(${escapeRegExp(term)}).wav/i incategory:"Lingua_Libre_pronunciation-jpn"`
        : `intitle:/ja(-[a-zA-Z]{2})?-${escapeRegExp(term)}[0123456789]*.ogg/i`;
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&origin=*&srsearch=${encodeURIComponent(search)}`;
    const response = await requestUrl(apiUrl, 'text', timeoutMs);
    if (typeof response !== 'string') return [];

    const pages = (JSON.parse(response) as { query?: { search?: Array<{ title?: string }> } }).query?.search ?? [];
    const urls: string[] = [];
    for (const page of pages.slice(0, 6)) {
        if (!page.title) continue;
        const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&origin=*&titles=${encodeURIComponent(page.title)}`;
        const info = await requestUrl(infoUrl, 'text', timeoutMs).catch(() => null);
        if (typeof info !== 'string') continue;
        const filePages = (JSON.parse(info) as { query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string }> }> } }).query?.pages ?? {};
        for (const filePage of Object.values(filePages)) {
            const fileUrl = filePage.imageinfo?.[0]?.url;
            if (fileUrl) urls.push(fileUrl);
        }
    }
    return urls;
}

function requestUrl(responseUrl: string, responseType: 'blob' | 'text', timeoutMs: number): Promise<unknown> {
    const url = getProxyUrl(responseUrl);
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        log.debug('Audio request via userscript API', { responseType, host: safeHost(url) });
        return new Promise((resolve, reject) => {
            const handleLoad = (response: UserscriptHttpResponse) => {
                if (response.status >= 200 && response.status < 300) {
                    resolve(response.response ?? response.responseText ?? '');
                } else {
                    reject(new Error(`Audio request failed (${response.status}).`));
                }
            };
            const result = userscriptRequest({
                method: 'GET',
                url,
                responseType,
                timeout: timeoutMs,
                onload: handleLoad,
                onerror: reject,
                ontimeout: () => reject(new Error('Audio request timed out.')),
            });
            if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
                (result as Promise<UserscriptHttpResponse>).then(handleLoad, reject);
            }
        });
    }

    log.debug('Audio request via fetch', { responseType, host: safeHost(url) });
    return fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).then(async response => {
        if (!response.ok) throw new Error(`Audio request failed (${response.status}).`);
        return responseType === 'blob' ? await response.blob() : await response.text();
    });
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
    return audioViaBlob && !candidate.url.startsWith('blob:') && !candidate.url.startsWith('data:audio/');
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

function getProxyUrl(url: string): string {
    if (getUserscriptHttpRequest()) return url;
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return url;
    if (!/^https?:\/\//.test(url)) return url;
    return `/__jpdb-reader-audio-proxy?url=${encodeURIComponent(url)}`;
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
