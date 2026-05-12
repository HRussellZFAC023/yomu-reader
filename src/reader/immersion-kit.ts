import { Logger } from './logger';
import type { ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';

const API_BASE = 'https://apiv2.immersionkit.com';
const OBJECT_STORE_BASE = 'https://us-southeast-1.linodeobjects.com/immersionkit';
const log = Logger.scope('ImmersionKit');

const TITLE_OVERRIDES: Record<string, string> = {
    steins_gate: 'Steins Gate',
    toradora_: 'Toradora!',
    your_name: 'Your Name',
    weathering_with_you: 'Weathering With You',
    from_up_on_poppy_hill: 'From Up on Poppy Hill',
    spirited_away: 'Spirited Away',
    hunter_x_hunter: 'Hunter × Hunter',
    fullmetal_alchemist_brotherhood: 'Fullmetal Alchemist: Brotherhood',
    attack_on_titan: 'Attack on Titan',
    angel_beats_: 'Angel Beats!',
    durarara__: 'Durarara!!',
    k_on_: 'K-On!',
    kanon__2006_: 'Kanon (2006)',
    new_game_: 'New Game!',
    demon_slayer: 'Demon Slayer',
    sound__euphonium: 'Sound! Euphonium',
    god_s_blessing_on_this_wonderful_world_: "God's Blessing on this Wonderful World!",
};

export interface ImmersionKitExample {
    id: string;
    sentence: string;
    sentenceWithFurigana: string;
    translation: string;
    sourceTitle: string;
    titleSlug: string;
    category: string;
    soundFile: string;
    imageFile: string;
    soundUrl: string;
    imageUrl: string;
}

export class ImmersionKitClient {
    private cache = new Map<string, ImmersionKitExample[]>();
    private inflight = new Map<string, Promise<ImmersionKitExample[]>>();
    private preloadKeys = new Set<string>();

    async search(term: string, settings: ReaderSettings): Promise<ImmersionKitExample[]> {
        const query = term.trim();
        if (!query || !settings.immersionKitEnabled) return [];

        const cacheKey = JSON.stringify({
            query,
            limit: settings.immersionKitLimit,
            min: settings.immersionKitMinLength,
            max: settings.immersionKitMaxLength,
            category: settings.immersionKitCategory,
            sort: settings.immersionKitSort,
            exact: settings.immersionKitExactMatch,
        });
        const cached = this.cache.get(cacheKey);
        if (cached) {
            log.debug('Search cache hit', { query, examples: cached.length });
            return cached;
        }
        const inflight = this.inflight.get(cacheKey);
        if (inflight) {
            log.debug('Search joined in-flight request', { query });
            return inflight;
        }

        const params = new URLSearchParams({
            q: query,
            limit: String(Math.max(settings.immersionKitLimit * 4, settings.immersionKitLimit)),
            sort: settings.immersionKitSort === 'random' ? 'sentence_length:asc' : settings.immersionKitSort,
        });
        if (settings.immersionKitExactMatch) params.set('exactMatch', 'true');
        if (settings.immersionKitCategory !== 'all') params.set('category', settings.immersionKitCategory);

        const done = log.time('search', { query, category: settings.immersionKitCategory, exact: settings.immersionKitExactMatch });
        const promise = requestJson(`${API_BASE}/search?${params}`, settings.audioTimeoutMs)
            .then(data => {
                const examples = collectExamples(data)
                    .map(normalizeExample)
                    .filter((example): example is ImmersionKitExample => Boolean(example))
                    .filter(example => sentenceLength(example.sentence) >= settings.immersionKitMinLength)
                    .filter(example => !settings.immersionKitMaxLength || sentenceLength(example.sentence) <= settings.immersionKitMaxLength);

                const ordered = settings.immersionKitSort === 'random'
                    ? shuffle(examples)
                    : examples;
                const result = ordered.slice(0, settings.immersionKitLimit);
                this.cache.set(cacheKey, result);
                log.debug('Search completed', { query, rawExamples: examples.length, returned: result.length });
                return result;
            })
            .finally(() => {
                this.inflight.delete(cacheKey);
                done();
            });
        this.inflight.set(cacheKey, promise);
        return promise;
    }

    mediaUrl(example: ImmersionKitExample, kind: 'image' | 'sound'): string {
        return this.mediaUrls(example, kind)[0] ?? '';
    }

    mediaUrls(example: ImmersionKitExample, kind: 'image' | 'sound'): string[] {
        const direct = kind === 'image' ? example.imageUrl : example.soundUrl;
        if (direct) return [direct];

        const file = kind === 'image' ? example.imageFile : example.soundFile;
        if (!file) return [];
        const category = example.category || categoryFromId(example.id);
        const titles = mediaTitleCandidates(example, file);

        // The API proxy mirrors the Immersion Kit app and avoids some CORS/object-store edge cases.
        return uniqueStrings(titles.flatMap(title => {
            const path = `media/${category}/${title}/media/${file}`;
            return [
                `${API_BASE}/download_media?${new URLSearchParams({ path })}`,
                `${OBJECT_STORE_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`,
            ];
        }));
    }

    preload(term: string, settings: ReaderSettings): void {
        const query = term.trim();
        if (!query || !settings.immersionKitEnabled || this.preloadKeys.has(query)) return;
        this.preloadKeys.add(query);
        log.debug('Preload queued', { query });

        void this.search(query, settings)
            .then(examples => {
                log.debug('Preload search completed', { query, examples: examples.length });
                for (const example of examples.slice(0, 2)) {
                    const imageUrls = settings.immersionKitShowImages ? this.mediaUrls(example, 'image') : [];
                    if (imageUrls.length) {
                        void this.fetchBlobUrl(imageUrls, settings.audioTimeoutMs)
                            .then(url => {
                                const image = new Image();
                                image.decoding = 'async';
                                image.loading = 'eager';
                                image.onload = () => window.setTimeout(() => URL.revokeObjectURL(url), 30000);
                                image.onerror = () => URL.revokeObjectURL(url);
                                image.src = url;
                            })
                            .catch(error => log.debug('Preload image failed quietly', { query, sourceTitle: example.sourceTitle }, error));
                    }

                    const soundUrls = this.mediaUrls(example, 'sound');
                    if (soundUrls.length) {
                        void this.fetchBlobUrl(soundUrls, settings.audioTimeoutMs)
                            .then(url => window.setTimeout(() => URL.revokeObjectURL(url), 30000))
                            .catch(error => log.debug('Preload audio failed quietly', { query, sourceTitle: example.sourceTitle }, error));
                    }
                }
            })
            .catch(error => log.debug('Preload search failed quietly', { query }, error));
    }

    async fetchBlobUrl(url: string | string[], timeoutMs: number): Promise<string> {
        const blob = await requestFirstBlob(url, timeoutMs);
        log.debug('Blob URL created', { host: safeHost(url), size: blob.size, type: blob.type });
        return URL.createObjectURL(blob);
    }

    async fetchDataUrl(url: string | string[], timeoutMs: number): Promise<string> {
        const blob = await requestFirstBlob(url, timeoutMs);
        log.debug('Data URL media fetched', { host: safeHost(url), size: blob.size, type: blob.type });
        return blobToDataUrl(blob);
    }
}

function collectExamples(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.examples)) return record.examples;
    if (Array.isArray(record.results)) return record.results;
    if (Array.isArray(record.data)) return record.data;
    return [];
}

function normalizeExample(value: unknown): ImmersionKitExample | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const id = text(record.id);
    const sentence = text(record.sentence || record.text);
    if (!sentence) return null;

    const titleSlug = text(record.title || record.deck || record.source) || titleSlugFromId(id);
    const sourceTitle = text(record.sourceTitle || record.display_title || record.displayTitle) || titleFromSlug(titleSlug);
    const category = text(record.category) || categoryFromId(id);
    const soundFile = text(record.sound || record.audio || record.audio_file || record.audioFile);
    const imageFile = text(record.image || record.image_file || record.imageFile);

    return {
        id,
        sentence,
        sentenceWithFurigana: text(record.sentence_with_furigana || record.sentenceWithFurigana),
        translation: text(record.translation || record.translation_en || record.english),
        sourceTitle,
        titleSlug,
        category,
        soundFile,
        imageFile,
        soundUrl: absoluteMediaUrl(text(record.sound_url || record.audio_url || record.soundUrl || record.audioUrl)),
        imageUrl: absoluteMediaUrl(text(record.image_url || record.imageUrl)),
    };
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function titleSlugFromId(id: string): string {
    const parts = id.split('_');
    if (parts.length < 3) return '';
    return parts.slice(1, -1).join('_');
}

function categoryFromId(id: string): string {
    const [category] = id.split('_');
    return category || 'anime';
}

function titleFromSlug(slug: string): string {
    if (!slug) return 'Unknown';
    const override = TITLE_OVERRIDES[slug];
    if (override) return override;
    return slug
        .replace(/_+$/g, '')
        .split('_')
        .filter(Boolean)
        .map(part => part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1))
        .join(' ');
}

function mediaTitleCandidates(example: ImmersionKitExample, file: string): string[] {
    const slug = example.titleSlug || titleSlugFromId(example.id);
    return uniqueStrings([
        example.sourceTitle,
        titleFromSlug(slug),
        titleFromMediaFile(file),
        slug,
    ].filter(Boolean));
}

function titleFromMediaFile(file: string): string {
    const stem = file.replace(/\.[^.]+$/u, '');
    const episodeMatch = /^(.+?)(?:_S\d|_\d|_E\d|-\s*\d)/i.exec(stem);
    const title = (episodeMatch?.[1] || stem)
        .replace(/^A[_-]/, '')
        .replace(/_/g, ' ')
        .trim();
    if (!title) return '';
    return title
        .replace(/\bKOn\b/u, 'K-On!')
        .replace(/\bDurarara\b/u, 'Durarara!!')
        .replace(/\bAngel Beats!?\b/u, 'Angel Beats!');
}

function uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values.map(item => item.trim()).filter(Boolean)) {
        if (seen.has(value)) continue;
        seen.add(value);
        result.push(value);
    }
    return result;
}

function absoluteMediaUrl(value: string): string {
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
    if (value.startsWith('media/')) return `${OBJECT_STORE_BASE}/${value.split('/').map(encodeURIComponent).join('/')}`;
    return '';
}

function sentenceLength(sentence: string): number {
    return Array.from(sentence.replace(/\s+/g, '')).length;
}

function shuffle<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}

function requestJson(url: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const userscriptRequest = getUserscriptHttpRequest();
        if (userscriptRequest) {
            log.debug('JSON request via userscript API', { host: safeHost(url) });
            const handleLoad = (response: UserscriptHttpResponse) => {
                if (response.status < 200 || response.status >= 300) {
                    reject(new Error(`Immersion Kit returned HTTP ${response.status}.`));
                    return;
                }
                try {
                    resolve(JSON.parse(String(response.responseText ?? response.response ?? 'null')));
                } catch {
                    reject(new Error('Immersion Kit returned invalid JSON.'));
                }
            };
            const result = userscriptRequest({
                method: 'GET',
                url,
                responseType: 'text',
                timeout: timeoutMs,
                onload: handleLoad,
                onerror: () => reject(new Error('Immersion Kit request failed.')),
                ontimeout: () => reject(new Error('Immersion Kit request timed out.')),
            });
            if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
                (result as Promise<UserscriptHttpResponse>).then(handleLoad, () => reject(new Error('Immersion Kit request failed.')));
            }
            return;
        }

        log.debug('JSON request via fetch', { host: safeHost(url) });
        fetch(url, { credentials: 'omit' })
            .then(response => {
                if (!response.ok) throw new Error(`Immersion Kit returned HTTP ${response.status}.`);
                return response.json();
            })
            .then(resolve, reject);
    });
}

function requestBlob(url: string, timeoutMs: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const userscriptRequest = getUserscriptHttpRequest();
        if (userscriptRequest) {
            log.debug('Media request via userscript API', { host: safeHost(url) });
            const handleLoad = (response: UserscriptHttpResponse) => {
                if (response.status < 200 || response.status >= 300 || !(response.response instanceof Blob)) {
                    reject(new Error(`Media returned HTTP ${response.status}.`));
                    return;
                }
                if (isErrorDocumentBlob(response.response)) {
                    reject(new Error('Media request returned an error document instead of audio or image.'));
                    return;
                }
                resolve(response.response);
            };
            const result = userscriptRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                timeout: timeoutMs,
                onload: handleLoad,
                onerror: () => reject(new Error('Media request failed.')),
                ontimeout: () => reject(new Error('Media request timed out.')),
            });
            if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
                (result as Promise<UserscriptHttpResponse>).then(handleLoad, () => reject(new Error('Media request failed.')));
            }
            return;
        }

        log.debug('Media request via fetch', { host: safeHost(url) });
        fetch(url, { credentials: 'omit' })
            .then(response => {
                if (!response.ok) throw new Error(`Media returned HTTP ${response.status}.`);
                return response.blob();
            })
            .then(blob => {
                if (isErrorDocumentBlob(blob)) throw new Error('Media request returned an error document instead of audio or image.');
                return blob;
            })
            .then(resolve, reject);
    });
}

async function requestFirstBlob(urls: string | string[], timeoutMs: number): Promise<Blob> {
    const candidates = Array.isArray(urls) ? urls : [urls];
    let lastError: unknown;
    for (const url of candidates) {
        try {
            return await requestBlob(url, timeoutMs);
        } catch (error) {
            lastError = error;
            log.debug('Media candidate failed; trying next', { host: safeHost(url) }, error);
        }
    }
    throw lastError instanceof Error ? lastError : new Error('No Immersion Kit media candidate could be loaded.');
}

function isErrorDocumentBlob(blob: Blob): boolean {
    const type = blob.type.toLowerCase();
    return type.includes('xml') || type.includes('html') || type.includes('json') || type.startsWith('text/');
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error ?? new Error('Could not read media.'));
        reader.readAsDataURL(blob);
    });
}

function safeHost(value: string | string[]): string {
    try {
        const url = Array.isArray(value) ? value[0] : value;
        return new URL(url, location.href).host;
    } catch {
        return 'invalid-url';
    }
}
