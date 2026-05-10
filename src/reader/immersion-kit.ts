import type { ReaderSettings } from './types';

const API_BASE = 'https://apiv2.immersionkit.com';
const OBJECT_STORE_BASE = 'https://us-southeast-1.linodeobjects.com/immersionkit';

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
    demon_slayer: 'Demon Slayer',
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
        if (cached) return cached;

        const params = new URLSearchParams({
            q: query,
            limit: String(Math.max(settings.immersionKitLimit * 4, settings.immersionKitLimit)),
            sort: settings.immersionKitSort === 'random' ? 'sentence_length:asc' : settings.immersionKitSort,
        });
        if (settings.immersionKitExactMatch) params.set('exactMatch', 'true');
        if (settings.immersionKitCategory !== 'all') params.set('category', settings.immersionKitCategory);

        const data = await requestJson(`${API_BASE}/search?${params}`, settings.audioTimeoutMs);
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
        return result;
    }

    mediaUrl(example: ImmersionKitExample, kind: 'image' | 'sound'): string {
        const direct = kind === 'image' ? example.imageUrl : example.soundUrl;
        if (direct) return direct;

        const file = kind === 'image' ? example.imageFile : example.soundFile;
        if (!file) return '';
        const category = example.category || categoryFromId(example.id);
        const title = example.sourceTitle || titleFromSlug(example.titleSlug || titleSlugFromId(example.id));
        const path = `media/${category}/${title}/media/${file}`;

        // The API proxy mirrors the Immersion Kit app and avoids some CORS/object-store edge cases.
        return `${API_BASE}/download_media?${new URLSearchParams({ path })}`;
    }

    async fetchBlobUrl(url: string, timeoutMs: number): Promise<string> {
        const blob = await requestBlob(url, timeoutMs);
        return URL.createObjectURL(blob);
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
        if (typeof GM_xmlhttpRequest === 'function') {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'text',
                timeout: timeoutMs,
                onload: response => {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(`Immersion Kit returned HTTP ${response.status}.`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(String(response.responseText ?? response.response ?? 'null')));
                    } catch {
                        reject(new Error('Immersion Kit returned invalid JSON.'));
                    }
                },
                onerror: () => reject(new Error('Immersion Kit request failed.')),
                ontimeout: () => reject(new Error('Immersion Kit request timed out.')),
            });
            return;
        }

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
        if (typeof GM_xmlhttpRequest === 'function') {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                timeout: timeoutMs,
                onload: response => {
                    if (response.status < 200 || response.status >= 300 || !(response.response instanceof Blob)) {
                        reject(new Error(`Media returned HTTP ${response.status}.`));
                        return;
                    }
                    resolve(response.response);
                },
                onerror: () => reject(new Error('Media request failed.')),
                ontimeout: () => reject(new Error('Media request timed out.')),
            });
            return;
        }

        fetch(url, { credentials: 'omit' })
            .then(response => {
                if (!response.ok) throw new Error(`Media returned HTTP ${response.status}.`);
                return response.blob();
            })
            .then(resolve, reject);
    });
}
