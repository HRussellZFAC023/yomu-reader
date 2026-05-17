import { Logger } from './logger';
import { ObjectUrlCache } from './object-url-cache';
import { createPageMediaUrl } from './page-media-url';
import { requestBlob as requestReaderBlob, requestJson as requestReaderJson } from './reader-http';
import type { ReaderSettings } from './types';

const API_BASE = 'https://apiv2express.immersionkit.com';
const LEGACY_API_BASE = 'https://apiv2.immersionkit.com';
const API_BASES = [API_BASE, LEGACY_API_BASE];
const OBJECT_STORE_BASE = 'https://us-southeast-1.linodeobjects.com/immersionkit';
const MEDIA_BLOB_CACHE_TTL_MS = 10 * 60 * 1000;
const MEDIA_CANDIDATE_LIMIT = 4;
const SEARCH_EXAMPLE_LIMIT = 250;
const MIN_LEARNING_SENTENCE_LENGTH = 8;
const DEFAULT_EXAMPLE_SORT = 'sentence_length:asc';
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
    private mediaBlobUrlCache = new ObjectUrlCache(MEDIA_BLOB_CACHE_TTL_MS);

    async search(term: string, settings: ReaderSettings): Promise<ImmersionKitExample[]> {
        const query = term.trim();
        if (!canSearchImmersionKit(query, settings)) return [];

        const cacheKey = this.searchCacheKey(query, settings);
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;
        const inflight = this.inflight.get(cacheKey);
        if (inflight) return inflight;

        const done = log.time('search', { query, category: settings.immersionKitCategory, exact: settings.immersionKitExactMatch });
        const promise = requestJson(apiUrls(`/search?${this.searchParams(query, settings)}`), settings.audioTimeoutMs, settings.corsProxyUrl)
            .then(data => {
                const examples = applySearchExampleLimit(
                    filterSearchExamples(data, query, settings, this.minimumSentenceLength(settings)),
                    settings,
                );

                const result = examples;
                this.cache.set(cacheKey, result);
                return result;
            })
            .finally(() => {
                this.inflight.delete(cacheKey);
                done();
            });
        this.inflight.set(cacheKey, promise);
        return promise;
    }

    private searchCacheKey(query: string, settings: ReaderSettings): string {
        return JSON.stringify({
            query,
            limit: SEARCH_EXAMPLE_LIMIT,
            userLimit: settings.immersionKitLimitEnabled ? settings.immersionKitLimit : 0,
            min: this.minimumSentenceLength(settings),
            max: settings.immersionKitMaxLength,
            category: settings.immersionKitCategory,
            sort: this.effectiveSort(settings),
            exact: settings.immersionKitExactMatch,
        });
    }

    private searchParams(query: string, settings: ReaderSettings): URLSearchParams {
        const params = new URLSearchParams({
            q: query,
            limit: String(SEARCH_EXAMPLE_LIMIT),
            sort: this.apiSort(settings),
        });
        if (settings.immersionKitExactMatch) params.set('exactMatch', 'true');
        if (settings.immersionKitCategory !== 'all') params.set('category', settings.immersionKitCategory);
        return params;
    }

    private effectiveSort(settings: ReaderSettings): string {
        return settings.immersionKitSort === 'random' ? DEFAULT_EXAMPLE_SORT : settings.immersionKitSort;
    }

    private apiSort(settings: ReaderSettings): string {
        const sort = this.effectiveSort(settings);
        return sort;
    }

    private minimumSentenceLength(settings: ReaderSettings): number {
        return Math.max(settings.immersionKitMinLength, MIN_LEARNING_SENTENCE_LENGTH);
    }

    mediaUrl(example: ImmersionKitExample, kind: 'image' | 'sound'): string {
        return this.mediaUrls(example, kind)[0] ?? '';
    }

    mediaUrls(example: ImmersionKitExample, kind: 'image' | 'sound'): string[] {
        const direct = directMediaUrl(example, kind);
        if (direct) return [direct];

        const file = mediaFileName(example, kind);
        if (!file) return [];
        return mediaFileUrls(example, file).slice(0, MEDIA_CANDIDATE_LIMIT);
    }

    preload(term: string, settings: ReaderSettings): void {
        const query = term.trim();
        if (!canSearchImmersionKit(query, settings) || this.preloadKeys.has(query)) return;
        this.preloadKeys.add(query);

        void this.search(query, settings)
            .then(examples => {
                for (const example of examples.slice(0, 1)) {
                    const imageUrls = settings.immersionKitShowImages ? this.mediaUrls(example, 'image') : [];
                    if (imageUrls.length) {
                        void this.fetchBlobUrl(imageUrls, settings.audioTimeoutMs, settings.corsProxyUrl)
                            .then(url => {
                                const image = new Image();
                                image.decoding = 'async';
                                image.loading = 'eager';
                                image.src = url;
                            })
                            .catch(() => undefined);
                    }

                    const soundUrls = this.mediaUrls(example, 'sound');
                    if (soundUrls.length) {
                        void this.fetchBlobUrl(soundUrls, settings.audioTimeoutMs, settings.corsProxyUrl)
                            .then(() => undefined)
                            .catch(() => undefined);
                    }
                }
            })
            .catch(() => undefined);
    }

    async fetchBlobUrl(url: string | string[], timeoutMs: number, proxyUrl = ''): Promise<string> {
        const urls = urlCandidates(url);
        const key = urls.join('\u0001');
        return this.mediaBlobUrlCache.getOrCreate(key, async () => {
            const blob = await requestFirstBlob(url, timeoutMs, proxyUrl);
            const blobUrl = await createPageMediaUrl(blob);
            return blobUrl;
        });
    }

    async fetchDataUrl(url: string | string[], timeoutMs: number, proxyUrl = ''): Promise<string> {
        const blob = await requestFirstBlob(url, timeoutMs, proxyUrl);
        return blobToDataUrl(blob);
    }
}

function canSearchImmersionKit(query: string, settings: ReaderSettings): boolean {
    return Boolean(query && settings.immersionKitEnabled);
}

function collectExamples(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    return firstArrayField(record, ['examples', 'results', 'data']);
}

function firstArrayField(record: Record<string, unknown>, keys: string[]): unknown[] {
    return keys.map(key => record[key]).find(Array.isArray) ?? [];
}

function filterSearchExamples(data: unknown, query: string, settings: ReaderSettings, minLength: number): ImmersionKitExample[] {
    return collectExamples(data)
        .map(normalizeExample)
        .filter((example): example is ImmersionKitExample => Boolean(example))
        .filter(example => isSearchExampleInRange(example, settings, minLength))
        .filter(example => isSearchExampleSurfaceMatch(example, query));
}

function applySearchExampleLimit(examples: ImmersionKitExample[], settings: ReaderSettings): ImmersionKitExample[] {
    return settings.immersionKitLimitEnabled
        ? examples.slice(0, Math.max(1, settings.immersionKitLimit))
        : examples;
}

function isSearchExampleInRange(example: ImmersionKitExample, settings: ReaderSettings, minLength: number): boolean {
    const length = sentenceLength(example.sentence);
    return length >= minLength && (!settings.immersionKitMaxLength || length <= settings.immersionKitMaxLength);
}

function isSearchExampleSurfaceMatch(example: ImmersionKitExample, query: string): boolean {
    return !requiresSurfaceMatch(query) || sentenceContainsQuery(example.sentence, query);
}

function normalizeExample(value: unknown): ImmersionKitExample | null {
    return isRecord(value) ? normalizeExampleRecord(value) : null;
}

function normalizeExampleRecord(record: Record<string, unknown>): ImmersionKitExample | null {
    const id = text(record.id);
    const sentence = firstText(record, ['sentence', 'text']);
    if (!sentence) return null;

    const titleSlug = exampleTitleSlug(record, id);
    const sourceTitle = exampleSourceTitle(record, titleSlug);
    const category = exampleCategory(record, id);
    const soundFile = firstText(record, ['sound', 'audio', 'audio_file', 'audioFile']);
    const imageFile = firstText(record, ['image', 'image_file', 'imageFile']);

    return {
        id,
        sentence,
        sentenceWithFurigana: firstText(record, ['sentence_with_furigana', 'sentenceWithFurigana']),
        translation: firstText(record, ['translation', 'translation_en', 'english']),
        sourceTitle,
        titleSlug,
        category,
        soundFile,
        imageFile,
        soundUrl: absoluteMediaUrl(firstText(record, ['sound_url', 'audio_url', 'soundUrl', 'audioUrl'])),
        imageUrl: absoluteMediaUrl(firstText(record, ['image_url', 'imageUrl'])),
    };
}

function directMediaUrl(example: ImmersionKitExample, kind: 'image' | 'sound'): string {
    return kind === 'image' ? example.imageUrl : example.soundUrl;
}

function mediaFileName(example: ImmersionKitExample, kind: 'image' | 'sound'): string {
    return kind === 'image' ? example.imageFile : example.soundFile;
}

function mediaFileUrls(example: ImmersionKitExample, file: string): string[] {
    const category = example.category || categoryFromId(example.id);
    return uniqueStrings(mediaTitleCandidates(example, file).flatMap(title => mediaFileTitleUrls(category, title, file)));
}

function mediaFileTitleUrls(category: string, title: string, file: string): string[] {
    const path = `media/${category}/${title}/media/${file}`;
    return [
        ...apiUrls(`/download_media?${new URLSearchParams({ path })}`),
        `${OBJECT_STORE_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`,
    ];
}

function exampleTitleSlug(record: Record<string, unknown>, id: string): string {
    return firstText(record, ['title', 'deck', 'source']) || titleSlugFromId(id);
}

function exampleSourceTitle(record: Record<string, unknown>, titleSlug: string): string {
    return firstText(record, ['sourceTitle', 'display_title', 'displayTitle']) || titleFromSlug(titleSlug);
}

function exampleCategory(record: Record<string, unknown>, id: string): string {
    return text(record.category) || categoryFromId(id);
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
        const value = text(record[key]);
        if (value) return value;
    }
    return '';
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    if (isAbsoluteMediaUrl(value)) return value;
    if (value.startsWith('media/')) return `${OBJECT_STORE_BASE}/${value.split('/').map(encodeURIComponent).join('/')}`;
    return '';
}

function isAbsoluteMediaUrl(value: string): boolean {
    return /^https?:\/\//i.test(value) || value.startsWith('data:');
}

function sentenceLength(sentence: string): number {
    return Array.from(sentence.replace(/\s+/g, '')).length;
}

function requiresSurfaceMatch(query: string): boolean {
    return /[0-9０-９]/u.test(query);
}

function sentenceContainsQuery(sentence: string, query: string): boolean {
    const normalizedSentence = normalizeForSurfaceMatch(sentence);
    const normalizedQuery = normalizeForSurfaceMatch(query);
    return Boolean(normalizedQuery) && normalizedSentence.includes(normalizedQuery);
}

function normalizeForSurfaceMatch(value: string): string {
    return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

async function requestJson(url: string | string[], timeoutMs: number, proxyUrl = ''): Promise<unknown> {
    let lastError: unknown;
    for (const candidate of urlCandidates(url)) {
        try {
            return await requestJsonCandidate(candidate, timeoutMs, proxyUrl);
        } catch (error) {
            lastError = error;
        }
    }
    throw requestError(lastError, 'Immersion Kit request failed.');
}

function urlCandidates(url: string | string[]): string[] {
    return Array.isArray(url) ? url : [url];
}

function requestError(error: unknown, fallback: string): Error {
    return error instanceof Error ? error : new Error(fallback);
}

function requestJsonCandidate(url: string, timeoutMs: number, proxyUrl = ''): Promise<unknown> {
    return requestReaderJson(url, {
        proxyUrl,
        timeoutMs,
        allowDirectCrossOrigin: true,
        preferFetch: shouldPreferFetchForImmersionKitRequests(),
        failureLabel: 'Immersion Kit request',
        timeoutLabel: 'Immersion Kit request timed out.',
    }).catch(error => {
        if (error instanceof Error && /blocked|cross-origin|cors/i.test(error.message)) {
            throw new Error('Immersion Kit search is blocked in this browser. Configure browser/CORS or use the built-in fallback settings.');
        }
        throw requestError(error, 'Immersion Kit request failed.');
    });
}

function requestBlob(url: string, timeoutMs: number, proxyUrl = ''): Promise<Blob> {
    return requestReaderBlob(url, {
        proxyUrl,
        timeoutMs,
        allowDirectCrossOrigin: true,
        preferFetch: shouldPreferFetchForImmersionKitRequests(),
        failureLabel: 'Media request',
        timeoutLabel: 'Media request timed out.',
    }).then(blob => {
        if (isErrorDocumentBlob(blob)) throw new Error('Media request returned an error document instead of audio or image.');
        return blob;
    });
}

async function requestFirstBlob(urls: string | string[], timeoutMs: number, proxyUrl = ''): Promise<Blob> {
    const candidates = prioritizeMediaCandidates(urlCandidates(urls)).slice(0, MEDIA_CANDIDATE_LIMIT);
    let lastError: unknown;
    for (const url of candidates) {
        try {
            return await requestBlob(url, timeoutMs, proxyUrl);
        } catch (error) {
            lastError = error;
        }
    }
    throw requestError(lastError, 'No Immersion Kit media candidate could be loaded.');
}

function prioritizeMediaCandidates(urls: string[]): string[] {
    return [...urls].sort((a, b) => Number(isObjectStoreMediaUrl(a)) - Number(isObjectStoreMediaUrl(b)));
}

function isObjectStoreMediaUrl(url: string): boolean {
    try {
        return new URL(url, location.href).origin === new URL(OBJECT_STORE_BASE).origin;
    } catch {
        return false;
    }
}

function isErrorDocumentBlob(blob: Blob): boolean {
    const type = blob.type.toLowerCase();
    if (isMediaBlobType(type)) return false;
    return ERROR_DOCUMENT_TYPE_MARKERS.some(marker => type.includes(marker)) || type.startsWith('text/');
}

const ERROR_DOCUMENT_TYPE_MARKERS = ['xml', 'html', 'json'];

function isMediaBlobType(type: string): boolean {
    return ['image/', 'audio/', 'video/'].some(prefix => type.startsWith(prefix));
}

function shouldPreferFetchForImmersionKitRequests(): boolean {
    return typeof window !== 'undefined'
        && (window as typeof window & { __YOMU_READER_RUNTIME__?: string }).__YOMU_READER_RUNTIME__ === 'newtab';
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error ?? new Error('Could not read media.'));
        reader.readAsDataURL(blob);
    });
}

function apiUrls(path: string): string[] {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return API_BASES.map(base => `${base}${cleanPath}`);
}
