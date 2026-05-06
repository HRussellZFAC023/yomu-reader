import type { AudioSelectionMode, AudioSourceSetting, AudioSourceType, JPDBCard, ReaderSettings } from './types';

interface AudioCandidate {
    url: string;
    sourceUrl: string;
}

const REQUIRED_JA_AUDIO_SOURCES: AudioSourceType[] = ['jpod101', 'language-pod-101', 'jisho'];

export class AudioPlayer {
    private current?: HTMLAudioElement;
    private utterance?: SpeechSynthesisUtterance;
    private lastBlobUrl?: string;

    constructor(private getSettings: () => ReaderSettings) {}

    async play(card: JPDBCard): Promise<void> {
        const settings = this.getSettings();
        if (!settings.audioEnabled) throw new Error('Audio playback is disabled.');

        const sources = getOrderedAudioSources(settings);
        if (!sources.length) throw new Error('No audio sources configured.');

        this.stop();
        const errors: string[] = [];
        for (const source of sources) {
            try {
                if (await this.playFromSource(source, card, settings)) return;
            } catch (error) {
                errors.push(error instanceof Error ? error.message : String(error));
            }
        }

        throw new Error(errors.length ? `No playable audio found. ${errors[0]}` : 'No playable audio found.');
    }

    stop(): void {
        this.current?.pause();
        this.current = undefined;
        if (this.utterance) {
            speechSynthesis.cancel();
            this.utterance = undefined;
        }
        if (this.lastBlobUrl) {
            URL.revokeObjectURL(this.lastBlobUrl);
            this.lastBlobUrl = undefined;
        }
    }

    private async playFromSource(source: AudioSourceSetting, card: JPDBCard, settings: ReaderSettings): Promise<boolean> {
        if (source.type === 'text-to-speech' || source.type === 'text-to-speech-reading') {
            await this.playTextToSpeech(source.type === 'text-to-speech-reading' ? card.reading : card.spelling, source.voice);
            return true;
        }

        const candidates = pickCandidates(await getAudioCandidates(source, card, settings.audioTimeoutMs), settings.audioSelectionMode);
        for (const candidate of candidates) {
            try {
                const audioUrl = settings.audioViaBlob
                    ? await this.fetchAudioAsBlobUrl(candidate.url, candidate.sourceUrl, settings.audioTimeoutMs, settings.audioSelectionMode)
                    : await this.resolveAudioUrl(candidate.url, candidate.sourceUrl, settings.audioTimeoutMs, settings.audioSelectionMode);
                const audio = new Audio(audioUrl);
                audio.preload = 'auto';
                this.current = audio;
                await audio.play();
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
        this.lastBlobUrl = URL.createObjectURL(response);
        return this.lastBlobUrl;
    }

    private async resolveAudioUrl(url: string, sourceUrl: string, timeoutMs: number, mode: AudioSelectionMode): Promise<string> {
        const response = await requestUrl(url, 'text', timeoutMs);
        if (typeof response !== 'string') return url;

        try {
            return findAudioUrl(JSON.parse(response), sourceUrl, mode) ?? url;
        } catch {
            return url;
        }
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

function getOrderedAudioSources(settings: ReaderSettings): AudioSourceSetting[] {
    const sources = settings.audioSources.filter(source => source.enabled);
    if (!settings.audioEnableDefaultSources) return sources;

    const configuredTypes = new Set(sources.map(source => source.type));
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

function pickCandidates(candidates: AudioCandidate[], mode: AudioSelectionMode): AudioCandidate[] {
    if (mode !== 'random' || candidates.length < 2) return candidates;
    return [...candidates].sort(() => Math.random() - 0.5);
}

function getJapanesePod101Url(card: JPDBCard): string {
    const params = new URLSearchParams();
    if (card.spelling !== card.reading) params.set('kanji', card.spelling);
    params.set('kana', card.reading);
    return `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?${params.toString()}`;
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
    if (typeof GM_xmlhttpRequest === 'function') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType,
                timeout: timeoutMs,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.response ?? response.responseText ?? '');
                    } else {
                        reject(new Error(`Audio request failed (${response.status}).`));
                    }
                },
                onerror: reject,
                ontimeout: () => reject(new Error('Audio request timed out.')),
            });
        });
    }

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

function getProxyUrl(url: string): string {
    if (typeof GM_xmlhttpRequest === 'function') return url;
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return url;
    if (!/^https?:\/\//.test(url)) return url;
    return `/__jpdb-reader-audio-proxy?url=${encodeURIComponent(url)}`;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
