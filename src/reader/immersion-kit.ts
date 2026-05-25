import { Logger } from './logger';
import { ObjectUrlCache } from './object-url-cache';
import { createPageMediaUrl } from './page-media-url';
import { requestBlob as requestReaderBlob, requestJson as requestReaderJson } from './reader-http';
import type { ReaderSettings } from './types';

const API_BASE = 'https://apiv2express.immersionkit.com';
const LEGACY_API_BASE = 'https://apiv2.immersionkit.com';
const API_BASES = [API_BASE, LEGACY_API_BASE];
const NADESHIKO_API_BASE = 'https://api.nadeshiko.co/v1';
const OBJECT_STORE_BASE = 'https://us-southeast-1.linodeobjects.com/immersionkit';
const MEDIA_BLOB_CACHE_TTL_MS = 10 * 60 * 1000;
const MEDIA_CANDIDATE_LIMIT = 4;
const SEARCH_EXAMPLE_LIMIT = 250;
const SEARCH_CACHE_LIMIT = 160;
const SEARCH_RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000;
const PRELOAD_KEY_LIMIT = 300;
const NADESHIKO_SEARCH_LIMIT = 25;
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
    provider?: 'immersion-kit' | 'nadeshiko';
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
    publicId?: string;
    mediaPublicId?: string;
}

export interface ImmersionKitSearchOptions {
    requestLimit?: number;
    resultLimit?: number;
    fastFirst?: boolean;
    signal?: AbortSignal;
}

export class ImmersionKitClient {
    private cache = new Map<string, ImmersionKitExample[]>();
    private inflight = new Map<string, Promise<ImmersionKitExample[]>>();
    private preloadKeys = new Set<string>();
    private mediaBlobUrlCache = new ObjectUrlCache(MEDIA_BLOB_CACHE_TTL_MS);
    private immersionKitRateLimitedUntil = 0;

    async search(term: string, settings: ReaderSettings, options: ImmersionKitSearchOptions = {}): Promise<ImmersionKitExample[]> {
        const query = term.trim();
        if (!canSearchImmersionExamples(query, settings)) return [];

        const cacheKey = this.searchCacheKey(query, settings, options);
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;
        const cacheInflight = !options.signal;
        const inflight = cacheInflight ? this.inflight.get(cacheKey) : undefined;
        if (inflight) return inflight;

        const done = log.time('search', { query, source: settings.immersionKitExampleSource, category: settings.immersionKitCategory, exact: settings.immersionKitExactMatch });
        const promise = this.searchEnabledSources(query, settings, options)
            .then(examples => {
                const result = applySearchExampleLimit(examples, settings, options);
                if (!options.signal?.aborted) {
                    this.cache.set(cacheKey, result);
                    pruneOldestMapEntries(this.cache, SEARCH_CACHE_LIMIT);
                }
                return result;
            })
            .finally(() => {
                if (cacheInflight) this.inflight.delete(cacheKey);
                done();
            });
        if (cacheInflight) this.inflight.set(cacheKey, promise);
        return promise;
    }

    private async searchEnabledSources(query: string, settings: ReaderSettings, options: ImmersionKitSearchOptions): Promise<ImmersionKitExample[]> {
        const sources = enabledImmersionExampleSources(settings);
        if (settings.immersionKitExampleSource === 'combined' && options.fastFirst && sources.length > 1) {
            return this.searchCombinedFastFirst(query, settings, options, sources);
        }
        const resultSets = await Promise.all(sources.map(source =>
            this.searchSource(source, query, settings, options),
        ));
        return settings.immersionKitExampleSource === 'combined'
            ? deterministicMergedExamples(sources, resultSets, this.combinedShuffleSeed(query, settings))
            : resultSets.flat();
    }

    private searchCombinedFastFirst(
        query: string,
        settings: ReaderSettings,
        options: ImmersionKitSearchOptions,
        sources: Array<'immersion-kit' | 'nadeshiko'>,
    ): Promise<ImmersionKitExample[]> {
        let pending = sources.length;
        const emptyResults: ImmersionKitExample[][] = [];
        return new Promise((resolve, reject) => {
            sources.forEach(source => {
                void this.searchSource(source, query, settings, options)
                    .then(examples => {
                        if (examples.length) {
                            resolve(examples);
                            return;
                        }
                        emptyResults.push(examples);
                        pending -= 1;
                        if (pending === 0) resolve(emptyResults.flat());
                    })
                    .catch(reject);
            });
        });
    }

    private searchSource(
        source: 'immersion-kit' | 'nadeshiko',
        query: string,
        settings: ReaderSettings,
        options: ImmersionKitSearchOptions,
    ): Promise<ImmersionKitExample[]> {
        return source === 'nadeshiko'
            ? this.searchNadeshiko(query, settings, options).catch(error => {
                if (isAbortError(error)) throw error;
                log.warn('Nadeshiko examples failed', { query }, error);
                return [];
            })
            : this.searchImmersionKit(query, settings, options).catch(error => {
                if (isAbortError(error) || isImmersionKitRateLimitError(error)) throw error;
                log.warn('Immersion Kit examples failed', { query }, error);
                return [];
            });
    }

    private searchImmersionKit(query: string, settings: ReaderSettings, options: ImmersionKitSearchOptions): Promise<ImmersionKitExample[]> {
        this.assertImmersionKitSearchAllowed();
        return requestJson(apiUrls(`/search?${this.searchParams(query, settings, options)}`), settings.audioTimeoutMs, settings.corsProxyUrl, options.signal)
            .then(data => filterSearchExamples(data, query, settings, this.minimumSentenceLength(settings), 'immersion-kit'))
            .catch(error => {
                if (isImmersionKitRateLimitError(error)) this.noteImmersionKitRateLimit();
                throw error;
            });
    }

    private assertImmersionKitSearchAllowed(): void {
        if (Date.now() < this.immersionKitRateLimitedUntil) {
            throw new Error('Immersion Kit is temporarily rate-limited; retrying later.');
        }
    }

    private noteImmersionKitRateLimit(): void {
        this.immersionKitRateLimitedUntil = Date.now() + SEARCH_RATE_LIMIT_COOLDOWN_MS;
    }

    private searchNadeshiko(query: string, settings: ReaderSettings, options: ImmersionKitSearchOptions): Promise<ImmersionKitExample[]> {
        const apiKey = settings.nadeshikoApiKey.trim();
        if (!apiKey) return Promise.resolve([]);
        return requestReaderJson(`${NADESHIKO_API_BASE}/search`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            data: JSON.stringify(nadeshikoSearchPayload(query, settings, this.minimumSentenceLength(settings))),
            timeoutMs: settings.audioTimeoutMs,
            allowDirectCrossOrigin: true,
            allowPublicProxies: false,
            allowConfiguredProxy: false,
            preferFetch: shouldPreferFetchForImmersionKitRequests(),
            signal: options.signal,
            failureLabel: 'Nadeshiko request',
            timeoutLabel: 'Nadeshiko request timed out.',
        }).then(data => filterNadeshikoExamples(data, query, settings, this.minimumSentenceLength(settings)));
    }

    private searchCacheKey(query: string, settings: ReaderSettings, options: ImmersionKitSearchOptions): string {
        return JSON.stringify({
            query,
            source: settings.immersionKitExampleSource,
            nadeshikoKey: sensitiveFingerprint(settings.nadeshikoApiKey),
            limit: searchRequestLimit(options),
            userLimit: searchResultLimit(settings, options),
            min: this.minimumSentenceLength(settings),
            max: settings.immersionKitMaxLength,
            category: settings.immersionKitCategory,
            sort: this.effectiveSort(settings),
            exact: settings.immersionKitExactMatch,
            fastFirst: Boolean(options.fastFirst),
        });
    }

    private combinedShuffleSeed(query: string, settings: ReaderSettings): string {
        return JSON.stringify({
            query,
            source: settings.immersionKitExampleSource,
            key: sensitiveFingerprint(settings.nadeshikoApiKey),
            min: this.minimumSentenceLength(settings),
            max: settings.immersionKitMaxLength,
            category: settings.immersionKitCategory,
            exact: settings.immersionKitExactMatch,
        });
    }

    private searchParams(query: string, settings: ReaderSettings, options: ImmersionKitSearchOptions): URLSearchParams {
        const params = new URLSearchParams({
            q: query,
            limit: String(searchRequestLimit(options)),
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
        if (!canSearchImmersionExamples(query, settings) || this.preloadKeys.has(query)) return;
        this.preloadKeys.add(query);
        pruneOldestSetEntries(this.preloadKeys, PRELOAD_KEY_LIMIT);

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

function canSearchImmersionExamples(query: string, settings: ReaderSettings): boolean {
    return Boolean(query && settings.immersionKitEnabled);
}

function enabledImmersionExampleSources(settings: ReaderSettings): Array<'immersion-kit' | 'nadeshiko'> {
    if (settings.immersionKitExampleSource === 'nadeshiko') return ['nadeshiko'];
    if (settings.immersionKitExampleSource === 'combined') return ['immersion-kit', 'nadeshiko'];
    return ['immersion-kit'];
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

function filterSearchExamples(
    data: unknown,
    query: string,
    settings: ReaderSettings,
    minLength: number,
    provider: 'immersion-kit' | 'nadeshiko' = 'immersion-kit',
): ImmersionKitExample[] {
    return collectExamples(data)
        .map(value => normalizeExample(value, provider))
        .filter((example): example is ImmersionKitExample => Boolean(example))
        .filter(example => isSearchExampleInRange(example, settings, minLength))
        .filter(example => isSearchExampleSurfaceMatch(example, query));
}

function filterNadeshikoExamples(data: unknown, query: string, settings: ReaderSettings, minLength: number): ImmersionKitExample[] {
    const response = nadeshikoResponseRecord(data);
    if (!response) return [];
    const media = nadeshikoMediaMap(response);
    return nadeshikoSegments(response)
        .map(value => normalizeNadeshikoExample(value, media))
        .filter((example): example is ImmersionKitExample => Boolean(example))
        .filter(example => isSearchExampleInRange(example, settings, minLength))
        .filter(example => isSearchExampleSurfaceMatch(example, query));
}

function applySearchExampleLimit(examples: ImmersionKitExample[], settings: ReaderSettings, options: ImmersionKitSearchOptions = {}): ImmersionKitExample[] {
    const limit = searchResultLimit(settings, options);
    return limit ? examples.slice(0, limit) : examples;
}

function searchRequestLimit(options: ImmersionKitSearchOptions): number {
    return boundedSearchLimit(options.requestLimit, SEARCH_EXAMPLE_LIMIT);
}

function searchResultLimit(settings: ReaderSettings, options: ImmersionKitSearchOptions): number {
    if (options.resultLimit !== undefined) return boundedSearchLimit(options.resultLimit, SEARCH_EXAMPLE_LIMIT);
    return settings.immersionKitLimitEnabled
        ? boundedSearchLimit(settings.immersionKitLimit, SEARCH_EXAMPLE_LIMIT)
        : 0;
}

function boundedSearchLimit(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(1, Math.min(SEARCH_EXAMPLE_LIMIT, Math.trunc(value)));
}

function isSearchExampleInRange(example: ImmersionKitExample, settings: ReaderSettings, minLength: number): boolean {
    const length = sentenceLength(example.sentence);
    return length >= minLength && (!settings.immersionKitMaxLength || length <= settings.immersionKitMaxLength);
}

function isSearchExampleSurfaceMatch(example: ImmersionKitExample, query: string): boolean {
    return !requiresSurfaceMatch(query) || sentenceContainsQuery(example.sentence, query);
}

function normalizeExample(value: unknown, provider: 'immersion-kit' | 'nadeshiko' = 'immersion-kit'): ImmersionKitExample | null {
    return isRecord(value) ? normalizeExampleRecord(value, provider) : null;
}

function normalizeExampleRecord(record: Record<string, unknown>, provider: 'immersion-kit' | 'nadeshiko' = 'immersion-kit'): ImmersionKitExample | null {
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
        provider,
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

function nadeshikoSearchPayload(query: string, settings: ReaderSettings, minLength: number): unknown {
    const maxLength = settings.immersionKitMaxLength || 1000;
    return {
        query: { search: query },
        take: NADESHIKO_SEARCH_LIMIT,
        filters: {
            segmentLengthChars: {
                min: minLength,
                max: Math.max(minLength, maxLength),
            },
        },
    };
}

function nadeshikoResponseRecord(data: unknown): Record<string, unknown> | null {
    if (Array.isArray(data)) return { segments: data };
    return isRecord(data) ? data : null;
}

function nadeshikoSegments(response: Record<string, unknown>): unknown[] {
    return firstArrayField(response, ['segments', 'examples', 'results', 'data']);
}

function nadeshikoMediaMap(response: Record<string, unknown>): Record<string, unknown> {
    const includes = response.includes;
    const media = isRecord(includes) ? includes.media : undefined;
    return isRecord(media) ? media : {};
}

function normalizeNadeshikoExample(value: unknown, mediaById: Record<string, unknown>): ImmersionKitExample | null {
    if (!isRecord(value)) return null;
    const sentence = nestedText(value, 'textJa', ['content', 'text'])
        || firstText(value, ['sentence', 'text', 'textJa']);
    if (!sentence) return null;

    const publicId = firstText(value, ['publicId', 'public_id', 'id']);
    const mediaPublicId = firstText(value, ['mediaPublicId', 'media_public_id', 'mediaId']);
    const media: Record<string, unknown> = isRecord(mediaById[mediaPublicId]) ? mediaById[mediaPublicId] as Record<string, unknown> : {};
    const urls: Record<string, unknown> = isRecord(value.urls) ? value.urls : {};
    const sourceTitle = firstText(media, ['nameRomaji', 'name_romaji', 'titleRomaji', 'title_romaji', 'name', 'title', 'nameJa'])
        || firstText(value, ['mediaName', 'sourceTitle', 'source', 'title'])
        || 'Nadeshiko';

    return {
        id: `nadeshiko_${publicId || mediaPublicId || hashString(sentence).toString(36)}`,
        provider: 'nadeshiko',
        sentence,
        sentenceWithFurigana: firstText(value, ['furi_sentence', 'sentenceWithFurigana', 'sentence_with_furigana']),
        translation: nestedText(value, 'textEn', ['content', 'text'])
            || firstText(value, ['translation', 'translation_en', 'english']),
        sourceTitle,
        titleSlug: slugFromTitle(sourceTitle),
        category: firstText(media, ['type', 'category']) || firstText(value, ['category']) || 'anime',
        soundFile: '',
        imageFile: '',
        soundUrl: absoluteMediaUrl(firstText(urls, ['audioUrl', 'soundUrl', 'audio_url', 'sound_url'])
            || firstText(value, ['audioUrl', 'soundUrl', 'audio_url', 'sound_url'])),
        imageUrl: absoluteMediaUrl(firstText(urls, ['imageUrl', 'image_url'])
            || firstText(value, ['imageUrl', 'image_url'])),
        publicId,
        mediaPublicId,
    };
}

function nestedText(record: Record<string, unknown>, key: string, fields: string[]): string {
    const value = record[key];
    return isRecord(value) ? firstText(value, fields) : '';
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
        `${OBJECT_STORE_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`,
        ...apiUrls(`/download_media?${new URLSearchParams({ path })}`),
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

function slugFromTitle(title: string): string {
    return title.trim().toLowerCase().replace(/[^a-z0-9ぁ-んァ-ン一-龯]+/gi, '_').replace(/^_+|_+$/g, '');
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

function deterministicShuffle<T>(values: T[], seed: string): T[] {
    const result = [...values];
    let state = hashString(seed) || 1;
    for (let index = result.length - 1; index > 0; index--) {
        state = nextRandomState(state);
        const swapIndex = state % (index + 1);
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

function deterministicMergedExamples(
    sources: Array<'immersion-kit' | 'nadeshiko'>,
    resultSets: ImmersionKitExample[][],
    seed: string,
): ImmersionKitExample[] {
    const groups = deterministicShuffle(sources.map((source, index) => ({
        source,
        examples: deterministicShuffle(resultSets[index] ?? [], `${seed}:${source}`),
    })), `${seed}:providers`).filter(group => group.examples.length);
    const result: ImmersionKitExample[] = [];
    while (groups.some(group => group.examples.length)) {
        for (const group of groups) {
            const example = group.examples.shift();
            if (example) result.push(example);
        }
    }
    return result;
}

function nextRandomState(value: number): number {
    return (Math.imul(value, 1664525) + 1013904223) >>> 0;
}

function sensitiveFingerprint(value: string): string {
    const trimmed = value.trim();
    return trimmed ? hashString(trimmed).toString(36) : '';
}

function hashString(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
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

async function requestJson(url: string | string[], timeoutMs: number, proxyUrl = '', signal?: AbortSignal): Promise<unknown> {
    let lastError: unknown;
    for (const candidate of urlCandidates(url)) {
        try {
            return await requestJsonCandidate(candidate, timeoutMs, proxyUrl, signal);
        } catch (error) {
            if (isAbortError(error) || isImmersionKitRateLimitError(error)) throw error;
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

function requestJsonCandidate(url: string, timeoutMs: number, proxyUrl = '', signal?: AbortSignal): Promise<unknown> {
    return requestReaderJson(url, {
        proxyUrl,
        timeoutMs,
        allowDirectCrossOrigin: true,
        allowPublicProxies: false,
        preferFetch: shouldPreferFetchForImmersionKitRequests(),
        signal,
        failureLabel: 'Immersion Kit request',
        timeoutLabel: 'Immersion Kit request timed out.',
    }).catch(error => {
        if (isAbortError(error)) throw error;
        if (isImmersionKitRateLimitError(error)) throw error;
        if (error instanceof Error && /blocked|cross-origin|cors/i.test(error.message)) {
            throw new Error('Immersion Kit search is blocked in this browser. Configure browser/CORS or use the built-in fallback settings.');
        }
        throw requestError(error, 'Immersion Kit request failed.');
    });
}

function isAbortError(error: unknown): boolean {
    return errorName(error) === 'AbortError';
}

function errorName(error: unknown): string {
    if (!error || typeof error !== 'object') return '';
    const name = (error as { name?: unknown }).name;
    return typeof name === 'string' ? name : '';
}

export function isImmersionKitRateLimitError(error: unknown): boolean {
    return error instanceof Error && /\b(?:429|too many requests|rate[- ]?limited)\b/i.test(error.message);
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
    for (const candidate of candidates) {
        try {
            return await requestBlob(candidate, timeoutMs, proxyUrl);
        } catch (error) {
            lastError = error;
        }
    }
    throw requestError(lastError, 'No Immersion Kit media candidate could be loaded.');
}

function prioritizeMediaCandidates(urls: string[]): string[] {
    return [...urls].sort((a, b) => Number(isObjectStoreMediaUrl(b)) - Number(isObjectStoreMediaUrl(a)));
}

function pruneOldestMapEntries<K, V>(map: Map<K, V>, limit: number): void {
    while (map.size > limit) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
    }
}

function pruneOldestSetEntries<T>(set: Set<T>, limit: number): void {
    while (set.size > limit) {
        const oldest = set.values().next().value;
        if (oldest === undefined) break;
        set.delete(oldest);
    }
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
