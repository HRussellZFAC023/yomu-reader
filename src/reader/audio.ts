import { Logger } from './logger';
import type { AudioSelectionMode, AudioSourceSetting, AudioSourceType, JPDBCard, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';

interface AudioCandidate {
    url: string;
    sourceUrl: string;
}

const REQUIRED_JA_AUDIO_SOURCES: AudioSourceType[] = ['jpod101', 'language-pod-101', 'jisho', 'text-to-speech'];
const JAPANESE_POD_101_UNAVAILABLE_SIZE = 52288;
const JAPANESE_POD_101_UNAVAILABLE_SHA256 = 'ae6398b5a27bc8c0a771df6c907ade794be15518174773c58c7c7ddd17098906';
const log = Logger.scope('Audio');

export class AudioPlayer {
    private current?: HTMLAudioElement;
    private utterance?: SpeechSynthesisUtterance;
    private fallbackChimeContext?: AudioContext;
    private lastBlobUrl?: string;
    private playRequestId = 0;
    private shuffledAudio = new ShuffledAudioDeck();

    constructor(private getSettings: () => ReaderSettings) {}

    async play(card: JPDBCard): Promise<void> {
        const requestId = ++this.playRequestId;
        const settings = this.getSettings();
        if (!settings.audioEnabled) throw new Error('Audio playback is disabled.');

        const sources = getOrderedAudioSources(settings);
        this.stopCurrent();
        if (!sources.length) {
            log.warn('No audio sources configured', { term: card.spelling });
            await this.playMissingAudioFallback(settings, requestId);
            return;
        }

        const done = log.time('play', { term: card.spelling, sources: sources.map(source => source.type), viaBlob: settings.audioViaBlob });
        const errors: string[] = [];
        const triedUrls = new Set<string>();
        for (const source of sources) {
            if (requestId !== this.playRequestId) {
                log.debug('Audio request superseded', { term: card.spelling, requestId });
                done();
                return;
            }
            try {
                if (await this.playFromSource(source, card, settings, requestId, triedUrls)) {
                    log.debug('Audio source succeeded', { term: card.spelling, source: source.type });
                    done();
                    return;
                }
            } catch (error) {
                log.debug('Audio source failed; trying next source', { term: card.spelling, source: source.type }, error);
                errors.push(error instanceof Error ? error.message : String(error));
            }
        }

        done();
        log.warn('No playable audio found', { term: card.spelling, errors });
        await this.playMissingAudioFallback(settings, requestId);
    }

    stop(): void {
        this.playRequestId++;
        this.stopCurrent();
        log.debug('Audio stopped');
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
        if (this.lastBlobUrl) {
            URL.revokeObjectURL(this.lastBlobUrl);
            this.lastBlobUrl = undefined;
        }
    }

    private async playFromSource(source: AudioSourceSetting, card: JPDBCard, settings: ReaderSettings, requestId: number, triedUrls: Set<string>): Promise<boolean> {
        if (source.type === 'text-to-speech' || source.type === 'text-to-speech-reading') {
            if (requestId !== this.playRequestId) return true;
            await this.playTextToSpeech(source.type === 'text-to-speech-reading' ? card.reading : card.spelling, source.voice);
            log.debug('Text-to-speech playback started', { source: source.type, voice: source.voice || 'auto' });
            return true;
        }

        const candidates = await getAudioCandidates(source, card, settings.audioTimeoutMs);
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
                const audioUrl = shouldFetchCandidateAsBlob(settings, candidate)
                    ? await this.fetchAudioAsBlobUrl(candidate.url, candidate.sourceUrl, settings.audioTimeoutMs, settings.audioSelectionMode)
                    : candidate.url;
                if (requestId !== this.playRequestId) return true;
                const audio = new Audio(audioUrl);
                audio.preload = 'auto';
                this.current = audio;
                await audio.play();
                if (requestId !== this.playRequestId) audio.pause();
                this.shuffledAudio.markPlayed(bagKey, id);
                log.debug('Audio candidate playing', { source: source.type, viaBlob: audioUrl.startsWith('blob:'), sourceHost: safeHost(candidate.sourceUrl) });
                return true;
            } catch {
                // Try the next source or candidate.
            }
        }
        return false;
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
        this.lastBlobUrl = URL.createObjectURL(response);
        log.debug('Audio blob URL created', { sourceHost: safeHost(sourceUrl), type: response.type, size: response.size });
        return this.lastBlobUrl;
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

    private async playMissingAudioFallback(settings: ReaderSettings, requestId: number): Promise<void> {
        if (!settings.audioFallbackChimeEnabled) {
            log.debug('Missing-audio fallback is silent');
            return;
        }
        if (requestId !== this.playRequestId) return;

        try {
            await this.playSoftChime(requestId);
            log.debug('Missing-audio fallback chime played');
        } catch (error) {
            log.debug('Missing-audio fallback chime unavailable', {}, error);
        }
    }

    private async playSoftChime(requestId: number): Promise<void> {
        const AudioContextCtor = window.AudioContext
            ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) return;

        const context = new AudioContextCtor();
        this.fallbackChimeContext = context;
        if (context.state === 'suspended') await context.resume().catch(() => undefined);
        if (requestId !== this.playRequestId) return;

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
        if (/^https?:\/\//.test(value)) return [normalizeAudioUrl(value, sourceUrl)];
        return [];
    }
    if (Array.isArray(value)) {
        return value.flatMap(item => findAudioUrls(item, sourceUrl));
    }
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const direct = ['url', 'audio', 'audioUrl', 'src', 'source'].flatMap(key => findAudioUrls(record[key], sourceUrl));
        if (direct.length) return direct;
        return Object.values(record).flatMap(nested => findAudioUrls(nested, sourceUrl));
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

function shouldFetchCandidateAsBlob(settings: ReaderSettings, candidate: AudioCandidate): boolean {
    return shouldFetchAudioAsBlob(settings)
        || isJapanesePod101Url(candidate.url)
        || isJapanesePod101Url(candidate.sourceUrl);
}

function shouldFetchAudioAsBlob(settings: ReaderSettings): boolean {
    return settings.audioViaBlob && isLikelyIosBrowser();
}

function isLikelyIosBrowser(): boolean {
    if (typeof navigator === 'undefined') return false;
    const platform = navigator.platform || '';
    const userAgent = navigator.userAgent || '';
    return /iPad|iPhone|iPod/i.test(platform)
        || /iPad|iPhone|iPod/i.test(userAgent)
        || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
