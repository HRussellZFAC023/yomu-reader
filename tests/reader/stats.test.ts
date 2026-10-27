import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    applyJpdbReviewImport,
    applyJitenReviewHistory,
    averageReviewSpeed,
    combineStatsSources,
    dailyActivityStreakAt,
    estimatedDueMinutes,
    loadAnkiConnectStats,
    monthlyActivityHeatmaps,
    parseJpdbReviewExport,
    statsActivityMetricTotal,
    statsCardSegments,
    statsFromJitenCards,
    statsFromJpdbCards,
} from '../../src/reader/app/stats';
import type { JPDBCard } from '../../src/reader/app/types';
import { renderNewTabStatsContent } from "../../src/reader/newtab/stats-view";
import { emptyStatsSource, statsFromApiCards, type StatsCardBreakdown, type StatsDailyPoint, type StatsDashboardSnapshot, type StatsSourceSnapshot } from "../../src/reader/app/stats";

function statsCard(overrides: Partial<JPDBCard>): JPDBCard {
    return {
        vid: 1,
        sid: 1,
        rid: 1,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['new'],
        pitchAccent: [],
        wordWithReading: null,
        ...overrides,
    };
}

function createStatsApiMock(options: {
    decks?: string[];
    reviewedToday?: number;
    reviewedByDay?: unknown[];
    deckStats?: Record<string, unknown>;
    cards?: number[];
} = {}) {
    const calls: Array<{ action: string; params?: Record<string, unknown> }> = [];
    const decks = options.decks ?? ['Core', 'Mining', 'Anime::Subs'];
    const responses: Record<string, unknown> = {
        deckNames: decks,
        getNumCardsReviewedToday: options.reviewedToday ?? 0,
        getNumCardsReviewedByDay: options.reviewedByDay ?? [],
        getDeckStats: options.deckStats ?? {},
        findCards: options.cards ?? [],
    };
    const api = {
        invoke: async <T>(action: string, params?: Record<string, unknown>): Promise<T> => {
            calls.push({ action, params });
            if (Object.hasOwn(responses, action)) return responses[action] as T;
            throw new Error(`unexpected action ${action}`);
        },
    } as Parameters<typeof loadAnkiConnectStats>[0];
    return { api, calls };
}

describe('stats aggregation', () => {
    it('loads the Anki due forecast through prop:due scheduler queries (SH-7)', async () => {
        const calls: Array<{ action: string; params?: Record<string, unknown> }> = [];
        const api = {
            invoke: async <T>(action: string, params?: Record<string, unknown>): Promise<T> => {
                calls.push({ action, params });
                if (action === 'deckNames') return ['Core'] as T;
                if (action === 'getNumCardsReviewedToday') return 0 as T;
                if (action === 'getNumCardsReviewedByDay') return [] as T;
                if (action === 'getDeckStats') return {} as T;
                if (action === 'findCards') {
                    const query = String(params?.query ?? '');
                    if (query.includes('prop:due<=7')) return [1, 2] as T;
                    if (query.includes('prop:due<=30')) return [1, 2, 3, 4, 5] as T;
                    return [] as T;
                }
                throw new Error(`unexpected action ${action}`);
            },
        } as Parameters<typeof loadAnkiConnectStats>[0];

        const source = await loadAnkiConnectStats(api);

        expect(source.dueForecast).toEqual({ in7: 2, in30: 5 });
        const forecastQueries = calls.filter(call => String(call.params?.query ?? '').includes('prop:due')).map(call => String(call.params?.query));
        // Anki's own scheduler answers the window; suspended cards excluded,
        // today's due pile excluded (prop:due>0).
        expect(forecastQueries.every(query => query.includes('-is:suspended') && query.includes('prop:due>0'))).toBe(true);
    });


    afterEach(() => {
        vi.useRealTimers();
    });

    it('parses JPDB review exports into daily activity and retention inputs', () => {
        const imported = parseJpdbReviewExport({
            cards_vocabulary_jp_en: [
                {
                    reviews: [
                        { timestamp: '2026-05-20T10:00:00Z', grade: 'fail', time_spent_ms: 3000 },
                        { timestamp: '2026-05-20T10:10:00Z', grade: 'okay', time_spent_ms: 9000 },
                    ],
                },
                {
                    reviews: [
                        { timestamp: '2026-05-21T08:00:00Z', grade: 'easy', duration: 6 },
                        { timestamp: '2026-05-21T08:05:00Z', grade: 'abandoned' },
                    ],
                },
            ],
        });

        expect(imported.cardCount).toBe(2);
        expect(imported.daily).toEqual([
            expect.objectContaining({ date: '2026-05-20', reviews: 2, correct: 1, failed: 1, newCards: 1 }),
            expect.objectContaining({ date: '2026-05-21', reviews: 1, correct: 1, failed: 0, newCards: 1 }),
        ]);
    });

    it('merges JPDB cards, imported history, and Anki stats into the combined source', async () => {
        vi.setSystemTime(new Date('2026-05-23T12:00:00Z'));
        const jpdb = applyJpdbReviewImport(
            statsFromJpdbCards([
                statsCard({ cardState: ['new'] }),
                statsCard({ cardState: ['learning'] }),
                statsCard({ cardState: ['known'] }),
                statsCard({ cardState: ['failed'] }),
            ]),
            {
                importedAt: Date.now(),
                cardCount: 1,
                daily: [
                    { date: '2026-05-22', reviews: 2, correct: 1, failed: 1, newCards: 1, minutes: 1 },
                    { date: '2026-05-23', reviews: 3, correct: 3, failed: 0, newCards: 0, minutes: 1 },
                ],
            },
        );
        const api = {
            invoke: async <T>(action: string): Promise<T> => {
                const reply = (value: unknown): T => value as T;
                if (action === 'deckNames') return reply(['Default']);
                if (action === 'getNumCardsReviewedToday') return reply(4);
                if (action === 'getNumCardsReviewedByDay') return reply([['2026-05-23', 4]]);
                if (action === 'getDeckStats') {
                    return reply({
                        deck: {
                            new_count: 2,
                            learn_count: 1,
                            review_count: 5,
                            total_in_deck: 8,
                        },
                    });
                }
                if (action === 'findCards') return reply([10]);
                if (action === 'getReviewsOfCards') {
                    return reply({
                        10: [
                            { id: Date.parse('2026-05-23T09:00:00Z'), ease: 1, time: 4000 },
                            { id: Date.parse('2026-05-23T09:05:00Z'), ease: 3, time: 6000 },
                        ],
                    });
                }
                throw new Error(`unexpected action ${action}`);
            },
        } as Parameters<typeof loadAnkiConnectStats>[0];
        const anki = await loadAnkiConnectStats(api);
        const combined = combineStatsSources(jpdb, anki);

        expect(combined.reviewsToday).toBe(7);
        expect(combined.totalReviews).toBe(9);
        expect(combined.retention).toBeCloseTo(5 / 7);
        expect(combined.cards).toMatchObject({ total: 12, new: 3, learning: 2, review: 7, due: 6, failed: 1 });
        expect(averageReviewSpeed(combined)).toBeCloseTo(9 / (2 + (10 / 60)));
        expect(estimatedDueMinutes(combined)).toBeCloseTo(6 / (9 / (2 + (10 / 60))));
        expect(statsActivityMetricTotal(combined.daily, 'newCards')).toBe(1);
        expect(statsCardSegments(combined.cards)).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: 'failed', value: 1 }),
            expect.objectContaining({ key: 'due', value: 5 }),
        ]));
        expect(combined.status).toBe('ready');
    });

    it('uses the configured API provider label in combined stats messages', () => {
        const jiten = statsFromJitenCards([statsCard({ source: 'jiten', reviewSource: 'jiten-api' })]);
        const emptyAnki = {
            id: 'anki' as const,
            label: 'Anki',
            status: 'setup' as const,
            message: 'Connect Anki.',
            daily: [],
            cards: {
                total: 0,
                new: 0,
                learning: 0,
                review: 0,
                due: 0,
                failed: 0,
                known: 0,
                suspended: 0,
                ignored: 0,
            },
            reviewsToday: 0,
            totalReviews: 0,
            retention: null,
            currentStreak: 0,
            longestStreak: 0,
            updatedAt: null,
        };

        expect(combineStatsSources(jiten, emptyAnki).message).toBe('Showing Jiten stats.');
    });

    it('computes Jiten retention and review speed from recent review history', () => {
        const source = applyJitenReviewHistory(
            statsFromJitenCards([statsCard({ source: 'jiten', reviewSource: 'jiten-api', cardState: ['due'] })]),
            [
                { rating: 4, reviewDateTime: new Date(2026, 5, 24, 17, 4).toISOString(), reviewDuration: 12_000 },
                { rating: 1, reviewDateTime: new Date(2026, 5, 24, 17, 3).toISOString(), reviewDuration: 18_000 },
                { rating: 3, reviewDateTime: new Date(2026, 5, 23, 9).toISOString(), reviewDuration: 30_000 },
            ],
        );

        expect(source.totalReviews).toBe(3);
        expect(source.retention).toBeCloseTo(2 / 3);
        expect(averageReviewSpeed(source)).toBeCloseTo(3 / 1);
        expect(source.daily).toEqual(expect.arrayContaining([
            expect.objectContaining({ date: '2026-06-24', reviews: 2, correct: 1, failed: 1, minutes: 0.5 }),
            expect.objectContaining({ date: '2026-06-23', reviews: 1, correct: 1, failed: 0, minutes: 0.5 }),
        ]));
    });

    it('builds compact calendar months for stats heatmaps', () => {
        const months = monthlyActivityHeatmaps([
            { date: '2026-04-30', reviews: 2, correct: 1, failed: 1, newCards: 1, minutes: 3 },
            { date: '2026-05-01', reviews: 4, correct: 4, failed: 0, newCards: 0, minutes: 2 },
            { date: '2026-05-23', reviews: 6, correct: 5, failed: 1, newCards: 2, minutes: 4 },
        ], 2, new Date('2026-05-23T12:00:00'));

        expect(months.map(month => month.key)).toEqual(['2026-04', '2026-05']);
        expect(months[0]).toMatchObject({
            month: 4,
            startWeekday: 2,
            total: expect.objectContaining({ reviews: 2, correct: 1, failed: 1, newCards: 1, minutes: 3 }),
        });
        expect(months[1].days).toHaveLength(31);
        expect(months[1].days[0]).toMatchObject({ date: '2026-05-01', reviews: 4 });
        expect(months[1].total).toMatchObject({ reviews: 10, correct: 9, failed: 1, newCards: 2, minutes: 6 });
    });

    it('reports the active streak ending on a selected stats day', () => {
        const daily = [
            { date: '2026-05-18', reviews: 2, correct: 2, failed: 0, newCards: 1, minutes: 2 },
            { date: '2026-05-19', reviews: 3, correct: 3, failed: 0, newCards: 0, minutes: 3 },
            { date: '2026-05-20', reviews: 0, correct: 0, failed: 0, newCards: 0, minutes: 0 },
            { date: '2026-05-21', reviews: 1, correct: 1, failed: 0, newCards: 0, minutes: 1 },
            { date: '2026-05-22', reviews: 4, correct: 3, failed: 1, newCards: 2, minutes: 4 },
            { date: '2026-05-23', reviews: 2, correct: 2, failed: 0, newCards: 0, minutes: 2 },
        ];

        expect(dailyActivityStreakAt(daily, '2026-05-23')).toBe(3);
        expect(dailyActivityStreakAt(daily, '2026-05-20')).toBe(0);
        expect(dailyActivityStreakAt(daily, '2026-05-19')).toBe(2);
    });

    it('loads Anki stats across every deck returned by AnkiConnect', async () => {
        const { api, calls } = createStatsApiMock();

        const anki = await loadAnkiConnectStats(api);

        expect(anki.message).toBe('Connected to 3 decks.');
        expect(anki.deckNames).toEqual(['Core', 'Mining', 'Anime::Subs']);
        expect(anki.activeDeckNames).toEqual(['Core', 'Mining', 'Anime::Subs']);
        expect(calls.find(call => call.action === 'getDeckStats')?.params).toEqual({
            decks: ['Core', 'Mining', 'Anime::Subs'],
        });
        expect(calls.find(call => call.action === 'findCards')?.params).toEqual({ query: 'rated:30' });
    });

    it('filters Anki stats with disabled deck toggles', async () => {
        const { api, calls } = createStatsApiMock();

        const anki = await loadAnkiConnectStats(api, { disabledDeckNames: ['Mining'] });

        expect(anki.message).toBe('Connected to 2 of 3 decks.');
        expect(anki.deckNames).toEqual(['Core', 'Mining', 'Anime::Subs']);
        expect(anki.activeDeckNames).toEqual(['Core', 'Anime::Subs']);
        expect(calls.find(call => call.action === 'getDeckStats')?.params).toEqual({
            decks: ['Core', 'Anime::Subs'],
        });
        const findCardsQueries = calls.filter(call => call.action === 'findCards').map(call => String(call.params?.query));
        expect(findCardsQueries.filter(query => query.includes('rated:'))).toEqual([
            'deck:"Core" rated:30',
            'deck:"Anime::Subs" rated:30',
        ]);
        // The due forecast respects the deck toggle scope too.
        const forecastQueries = findCardsQueries.filter(query => query.includes('prop:due'));
        expect(forecastQueries).toHaveLength(2);
        expect(forecastQueries.every(query => query.includes('deck:"Core"') && query.includes('deck:"Anime::Subs"') && !query.includes('deck:"Mining"'))).toBe(true);
    });
});

describe('Stats data availability', () => {
    const EMPTY_CARDS: StatsCardBreakdown = {
        total: 0, new: 0, learning: 0, review: 0, due: 0, failed: 0, known: 0, suspended: 0, ignored: 0,
    };

    // The chart windows the last 30 days relative to the real clock, so the
    // fixture days must be derived from today to stay inside it.
    function localDateKey(daysAgo: number): string {
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        const pad = (value: number): string => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    const ACTIVE_DAY = localDateKey(5);
    const QUIET_DAY = localDateKey(4);

    const DAILY: StatsDailyPoint[] = [
        { date: ACTIVE_DAY, reviews: 3, correct: 3, failed: 0, newCards: 1, minutes: 5 },
        { date: QUIET_DAY, reviews: 0, correct: 0, failed: 0, newCards: 0, minutes: 0 },
    ];

    function statsSource(id: StatsSourceSnapshot['id']): StatsSourceSnapshot {
        return {
            id,
            label: String(id),
            status: 'ready',
            message: '',
            daily: DAILY,
            cards: { ...EMPTY_CARDS },
            reviewsToday: 0,
            totalReviews: 3,
            retention: null,
            currentStreak: 0,
            longestStreak: 0,
            updatedAt: null,
        };
    }

    function snapshot(): StatsDashboardSnapshot {
        return {
            jpdb: statsSource('jpdb'),
            jiten: statsSource('jiten'),
            bunpro: statsSource('bunpro'),
            wanikani: statsSource('wanikani'),
            yomuLocal: statsSource('yomu-local'),
            anki: statsSource('anki'),
            combined: { ...statsSource('jpdb'), id: 'combined' },
        };
    }


    it('keeps event reviews and distinct reviewed cards separate in All and source views', () => {
        const state = snapshot();
        const local = { ...statsFromApiCards([], 'Academy', '', 'yomu-local'), status: 'ready' as const, reviewedCardsToday: 1, cards: { ...EMPTY_CARDS, total: 1, learning: 1 } };
        const remote = { ...statsSource('jpdb'), reviewsToday: 3, daily: [{ date: localDateKey(0), reviews: 3, correct: 2, failed: 1, newCards: 0, minutes: 1 }] };
        state.yomuLocal = local;
        state.jpdb = remote;
        state.combined = combineStatsSources(local, remote);
        expect(state.combined.reviewsToday).toBe(3);
        expect(state.combined.reviewedCardsToday).toBe(1);
        expect(state.combined.reviewHistoryAvailable).toBe(false);
        const render = (selectedSource: 'combined' | 'jpdb' | 'yomu-local') => renderNewTabStatsContent({ activityMetric: 'reviews', language: 'en', selectedSource, snapshot: state, text: key => String(key) });
        const all = render('combined');
        const values = [...all.querySelectorAll('.jpdb-reader-stats-metric')].map(node => [node.querySelector('.jpdb-reader-stats-metric-label')?.textContent, node.querySelector('strong')?.textContent]);
        expect(values).toEqual(expect.arrayContaining([['statsReviewsToday', '3'], ['statsWordsReviewedToday', '1']]));
        expect(all.querySelector('.jpdb-reader-stats-activity')).toBeNull();
        expect(all.textContent).not.toContain('statsRetention');
        expect(all.textContent).not.toContain('statsCurrentStreak');
        expect(render('jpdb').querySelector('.jpdb-reader-stats-activity')).not.toBeNull();
        expect(render('yomu-local').querySelector('.jpdb-reader-stats-activity')).toBeNull();
    });

    it('does not let an empty or unavailable source suppress another source history', () => {
        const remote = statsSource('jpdb');
        const emptyLocal = statsFromApiCards([], 'Academy', '', 'yomu-local');
        for (const other of [emptyLocal, emptyStatsSource('anki', 'Anki', '', 'setup'), emptyStatsSource('anki', 'Anki', 'Unavailable', 'error')]) {
            expect(combineStatsSources(remote, other).reviewHistoryAvailable).toBe(true);
        }
    });

    it('reads the selected WaniKani snapshot rather than the aggregate', () => {
        const state = snapshot();
        state.wanikani.reviewsToday = 7;
        state.combined.reviewsToday = 2;
        const root = renderNewTabStatsContent({ activityMetric: 'reviews', language: 'en', selectedSource: 'wanikani', snapshot: state, text: key => String(key) });
        const today = [...root.querySelectorAll('.jpdb-reader-stats-metric')].find(node => node.querySelector('.jpdb-reader-stats-metric-label')?.textContent === 'statsReviewsToday');
        expect(today?.querySelector('strong')?.textContent).toBe('7');
    });

    it('keeps source tabs when unavailable sources leave the aggregate empty', () => {
        const state = snapshot();
        for (const key of ['jpdb', 'jiten', 'bunpro', 'wanikani', 'yomuLocal', 'anki'] as const) {
            state[key] = emptyStatsSource(state[key].id, state[key].label, 'Unavailable', 'error');
        }
        state.combined = combineStatsSources(state.jpdb, state.jiten, state.yomuLocal, state.bunpro, state.wanikani, state.anki);
        const root = renderNewTabStatsContent({ activityMetric: 'reviews', language: 'en', selectedSource: 'wanikani', snapshot: state, text: key => String(key) });
        expect(root.querySelector('[data-stats-source="combined"]')).not.toBeNull();
        expect(root.querySelector('[data-stats-source="wanikani"][data-active="true"]')).not.toBeNull();
        expect(root.querySelector('.jpdb-reader-stats-tabs')?.hasAttribute('hidden')).toBe(false);
    });
});
