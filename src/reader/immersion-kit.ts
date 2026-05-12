import { Logger } from './logger';
import { ObjectUrlCache } from './object-url-cache';
import type { ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';

const API_BASE = 'https://apiv2.immersionkit.com';
const OBJECT_STORE_BASE = 'https://us-southeast-1.linodeobjects.com/immersionkit';
const MEDIA_BLOB_CACHE_TTL_MS = 10 * 60 * 1000;
const NAVIGATION_EXAMPLE_LIMIT = 24;
const MIN_LEARNING_SENTENCE_LENGTH = 8;
const DEFAULT_EXAMPLE_SORT = 'random';
const log = Logger.scope('ImmersionKit');

// Immersion Kit media paths use these canonical deck titles, while search results only include slugs.
const IMMERSION_KIT_TITLES: Record<string, string> = {
    your_lie_in_april: 'Your Lie in April',
    princess_mononoke: 'Princess Mononoke',
    girls_band_cry: 'Girls Band Cry',
    only_yesterday: 'Only Yesterday',
    chobits: 'Chobits',
    k_on_: 'K-On!',
    weathering_with_you: 'Weathering with You',
    from_the_new_world: 'From the New World',
    grave_of_the_fireflies: 'Grave of the Fireflies',
    steins_gate: 'Steins Gate',
    sword_art_online: 'Sword Art Online',
    nisekoi: 'Nisekoi',
    death_note: 'Death Note',
    wolf_children: 'Wolf Children',
    demon_slayer___kimetsu_no_yaiba: 'Demon Slayer - Kimetsu no Yaiba',
    your_name: 'Your Name',
    alya_sometimes_hides_her_feelings_in_russian: 'Alya Sometimes Hides Her Feelings in Russian',
    cardcaptor_sakura: 'Cardcaptor Sakura',
    kill_la_kill: 'Kill la Kill',
    howl_s_moving_castle: "Howl's Moving Castle",
    whisper_of_the_heart: 'Whisper of the Heart',
    bunny_drop: 'Bunny Drop',
    fermat_kitchen: 'Fermat Kitchen',
    haruhi_suzumiya: 'Haruhi Suzumiya',
    hunter_x_hunter: 'Hunter × Hunter',
    god_s_blessing_on_this_wonderful_world_: "God's Blessing on this Wonderful World!",
    assassination_classroom_season_1: 'Assassination Classroom Season 1',
    durarara__: 'Durarara!!',
    bakemonogatari: 'Bakemonogatari',
    hyouka: 'Hyouka',
    relife: 'ReLIFE',
    from_up_on_poppy_hill: 'From Up on Poppy Hill',
    sound__euphonium: 'Sound! Euphonium',
    lucky_star: 'Lucky Star',
    kokoro_connect: 'Kokoro Connect',
    my_little_sister_can_t_be_this_cute: "My Little Sister Can't Be This Cute",
    is_the_order_a_rabbit: 'Is The Order a Rabbit',
    clannad: 'Clannad',
    angel_beats_: 'Angel Beats!',
    daily_lives_of_high_school_boys: 'Daily Lives of High School Boys',
    new_game_: 'New Game!',
    the_wind_rises: 'The Wind Rises',
    fate_zero: 'Fate Zero',
    toradora_: 'Toradora!',
    anohana_the_flower_we_saw_that_day: 'Anohana the flower we saw that day',
    wandering_witch_the_journey_of_elaina: 'Wandering Witch The Journey of Elaina',
    kino_s_journey: "Kino's Journey",
    boku_no_hero_academia_season_1: 'Boku no Hero Academia Season 1',
    fullmetal_alchemist_brotherhood: 'Fullmetal Alchemist Brotherhood',
    one_week_friends: 'One Week Friends',
    erased: 'Erased',
    mononoke: 'Mononoke',
    little_witch_academia: 'Little Witch Academia',
    re_zero___starting_life_in_another_world: 'Re Zero − Starting Life in Another World',
    fruits_basket_season_1: 'Fruits Basket Season 1',
    mahou_shoujo_madoka_magica: 'Mahou Shoujo Madoka Magica',
    the_irregular_at_magic_high_school: 'The Irregular at Magic High School',
    clannad_after_story: 'Clannad After Story',
    frieren_beyond_journey_s_end: "Frieren Beyond Journey's End",
    kakegurui: 'Kakegurui',
    the_garden_of_words: 'The Garden of Words',
    when_marnie_was_there: 'When Marnie Was There',
    castle_in_the_sky: 'Castle in the sky',
    shirokuma_cafe: 'Shirokuma Cafe',
    my_neighbor_totoro: 'My Neighbor Totoro',
    kiki_s_delivery_service: "Kiki's Delivery Service",
    the_girl_who_leapt_through_time: 'The Girl Who Leapt Through Time',
    fate_stay_night_unlimited_blade_works: 'Fate Stay Night Unlimited Blade Works',
    code_geass_season_1: 'Code Geass Season 1',
    the_world_god_only_knows: 'The World God Only Knows',
    the_pet_girl_of_sakurasou: 'The Pet Girl of Sakurasou',
    no_game_no_life: 'No Game No Life',
    kanon__2006_: 'Kanon (2006)',
    psycho_pass: 'Psycho Pass',
    the_cat_returns: 'The Cat Returns',
    the_secret_world_of_arrietty: 'The Secret World of Arrietty',
    spirited_away: 'Spirited Away',
    noragami: 'Noragami',
    fairy_tail: 'Fairy Tail',
    i_m_taking_the_day_off: "I'm Taking the Day Off",
    border: 'Border',
    weakest_beast: 'Weakest Beast',
    mob_psycho_100: 'Mob Psycho 100',
    the_journalist: 'The Journalist',
    sailor_suit_and_machine_gun__2006_: 'Sailor Suit and Machine Gun (2006)',
    smoking: 'Smoking',
    i_am_mita__your_housekeeper: 'I am Mita, Your Housekeeper',
    good_morning_call: 'Good Morning Call',
    overprotected_kahoko: 'Overprotected Kahoko',
    quartet: 'Quartet',
    million_yen_woman: 'Million Yen Woman',
    legal_high_season_1: 'Legal High Season 1',
    witcher_3: 'Witcher 3',
    cyberpunk_2077: 'Cyberpunk 2077',
    skyrim: 'Skyrim',
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
    private mediaBlobUrlCache = new ObjectUrlCache(MEDIA_BLOB_CACHE_TTL_MS, 'immersion-kit-media');

    async search(term: string, settings: ReaderSettings): Promise<ImmersionKitExample[]> {
        const query = term.trim();
        if (!query || !settings.immersionKitEnabled) return [];

        const cacheKey = JSON.stringify({
            query,
            limit: Math.max(settings.immersionKitLimit, NAVIGATION_EXAMPLE_LIMIT),
            min: this.minimumSentenceLength(settings),
            max: settings.immersionKitMaxLength,
            category: settings.immersionKitCategory,
            sort: this.effectiveSort(settings),
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

        const resultLimit = Math.max(settings.immersionKitLimit, NAVIGATION_EXAMPLE_LIMIT);
        const params = new URLSearchParams({
            q: query,
            limit: String(resultLimit * 4),
            sort: this.apiSort(settings),
        });
        if (settings.immersionKitExactMatch) params.set('exactMatch', 'true');
        if (settings.immersionKitCategory !== 'all') params.set('category', settings.immersionKitCategory);

        const done = log.time('search', { query, category: settings.immersionKitCategory, exact: settings.immersionKitExactMatch });
        const promise = requestJson(`${API_BASE}/search?${params}`, settings.audioTimeoutMs)
            .then(data => {
                const examples = collectExamples(data)
                    .map(normalizeExample)
                    .filter((example): example is ImmersionKitExample => Boolean(example))
                    .filter(example => sentenceLength(example.sentence) >= this.minimumSentenceLength(settings))
                    .filter(example => !settings.immersionKitMaxLength || sentenceLength(example.sentence) <= settings.immersionKitMaxLength);

                const ordered = this.effectiveSort(settings) === 'random'
                    ? shuffle(examples)
                    : examples;
                const result = ordered.slice(0, resultLimit);
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

    private effectiveSort(settings: ReaderSettings): string {
        return settings.immersionKitSort === 'sentence_length:asc' ? DEFAULT_EXAMPLE_SORT : settings.immersionKitSort;
    }

    private apiSort(settings: ReaderSettings): string {
        const sort = this.effectiveSort(settings);
        return sort === 'random' ? 'sentence_length:asc' : sort;
    }

    private minimumSentenceLength(settings: ReaderSettings): number {
        return Math.max(settings.immersionKitMinLength, MIN_LEARNING_SENTENCE_LENGTH);
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
                                image.src = url;
                            })
                            .catch(error => log.debug('Preload image failed quietly', { query, sourceTitle: example.sourceTitle }, error));
                    }

                    const soundUrls = this.mediaUrls(example, 'sound');
                    if (soundUrls.length) {
                        void this.fetchBlobUrl(soundUrls, settings.audioTimeoutMs)
                            .then(() => undefined)
                            .catch(error => log.debug('Preload audio failed quietly', { query, sourceTitle: example.sourceTitle }, error));
                    }
                }
            })
            .catch(error => log.debug('Preload search failed quietly', { query }, error));
    }

    async fetchBlobUrl(url: string | string[], timeoutMs: number): Promise<string> {
        const urls = Array.isArray(url) ? url : [url];
        const key = urls.join('\u0001');
        return this.mediaBlobUrlCache.getOrCreate(key, async () => {
            const blob = await requestFirstBlob(url, timeoutMs);
            const blobUrl = URL.createObjectURL(blob);
            log.debug('Blob URL created', { host: safeHost(url), size: blob.size, type: blob.type });
            return blobUrl;
        });
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
    const override = IMMERSION_KIT_TITLES[slug];
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
        titleFromSlug(slug),
        example.sourceTitle,
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
    if (type.startsWith('image/') || type.startsWith('audio/') || type.startsWith('video/')) return false;
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
