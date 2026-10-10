import { describe, expect, it } from 'vitest';

import { ACADEMY_SRS_LABEL } from '../../src/reader/app/constants';
import { renderNewTabStatsContent } from '../../src/reader/newtab/stats-view';
import { combineStatsSources, emptyStatsSource, statsFromApiCards, type StatsCardBreakdown, type StatsDailyPoint, type StatsDashboardSnapshot, type StatsSourceSnapshot, type StatsSourceStatus } from '../../src/reader/app/stats';

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

function renderStats(selectedDate?: string): HTMLElement {
    return renderNewTabStatsContent({
        activityMetric: 'reviews',
        language: 'en',
        selectedDate,
        selectedSource: 'combined',
        snapshot: snapshot(),
        text: key => String(key),
    });
}

describe('new tab stats view', () => {
    it('draws no selected bar outline without an explicit day selection (today-default looked stuck)', () => {
        const root = renderStats();
        expect(root.querySelectorAll('.jpdb-reader-stats-bar').length).toBeGreaterThan(0);
        expect(root.querySelector('.jpdb-reader-stats-bar[data-selected="true"]')).toBeNull();
        expect(root.querySelector('.jpdb-reader-stats-heatmap-cell[data-selected="true"]')).toBeNull();
    });

    it('marks only the explicitly selected day', () => {
        const root = renderStats(ACTIVE_DAY);
        const selected = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-stats-bar[data-selected="true"]'));
        expect(selected.map(bar => bar.dataset.statsDay)).toEqual([ACTIVE_DAY]);
    });

    it('renders separate source tabs only for visible stats sources', () => {
        const visibleSnapshot = snapshot();
        visibleSnapshot.bunpro = { ...statsSource('bunpro'), status: 'setup', daily: [], cards: { ...EMPTY_CARDS } };
        visibleSnapshot.anki = { ...statsSource('anki'), status: 'setup', daily: [], cards: { ...EMPTY_CARDS } };
        const root = renderNewTabStatsContent({
            activityMetric: 'reviews',
            language: 'en',
            selectedSource: 'combined',
            snapshot: visibleSnapshot,
            text: key => String(key),
        });
        const tabs = Array.from(root.querySelectorAll<HTMLElement>('[data-stats-source]')).map(tab => tab.dataset.statsSource);

        expect(tabs).toEqual(['combined', 'jpdb', 'jiten', 'yomu-local', 'wanikani']);
    });
});

describe('new tab stats connection cards', () => {
    // A keyless learner's Academy card once read "No stats yet." over an
    // "Anki settings" button: every source that was not JPDB or Jiten fell
    // through to Anki's actions.
    function connectionSnapshot(ankiStatus: StatsSourceStatus): StatsDashboardSnapshot {
        const yomuLocal = emptyStatsSource('yomu-local', ACADEMY_SRS_LABEL, 'No stats yet.', 'ready');
        return {
            jpdb: emptyStatsSource('jpdb', 'JPDB', 'JPDB card states loaded.', 'ready'),
            jiten: emptyStatsSource('jiten', 'Jiten', 'Jiten SRS loaded.', 'ready'),
            bunpro: emptyStatsSource('bunpro', 'Bunpro', 'Bunpro is unavailable.', 'error'),
            wanikani: emptyStatsSource('wanikani', 'WaniKani', 'WaniKani loaded.', 'ready'),
            yomuLocal,
            anki: emptyStatsSource('anki', 'Anki', 'Anki is unavailable.', ankiStatus),
            // Some history, so the dashboard and every source card render.
            combined: { ...yomuLocal, id: 'combined', totalReviews: 3 },
        };
    }

    function renderConnections(ankiStatus: StatsSourceStatus): HTMLElement {
        return renderNewTabStatsContent({
            activityMetric: 'reviews',
            language: 'en',
            selectedSource: 'combined',
            snapshot: connectionSnapshot(ankiStatus),
            text: key => String(key),
        });
    }

    // Each card's buttons as "action label", keyed by its source id.
    function connectionActions(ankiStatus: StatsSourceStatus): Record<string, string[]> {
        const root = renderConnections(ankiStatus);
        return Object.fromEntries(Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-stats-connection')).map(card => [
            card.className.replace('jpdb-reader-stats-connection is-', ''),
            Array.from(card.querySelectorAll<HTMLElement>('[data-newtab-action]')).map(button => `${button.dataset.newtabAction} ${button.textContent}`),
        ]));
    }

    // Academy, loaded and with nothing to connect, gets no card: "Academy SRS
    // loaded." under the dashboard said nothing the dashboard did not.
    it('offers each source only its own actions, and Academy no card', () => {
        expect(connectionActions('error')).toEqual({
            jpdb: ['stats-open-api-settings statsOpenJpdbSettings', 'stats-import-jpdb statsChooseJpdbFile'],
            jiten: ['stats-open-api-settings statsOpenApiSettings'],
            bunpro: ['stats-open-api-settings statsOpenApiSettings'],
            wanikani: ['stats-open-api-settings statsOpenApiSettings'],
            anki: ['stats-connect-anki statsConnectAnki', 'stats-open-anki-settings statsOpenAnkiSettings'],
        });
    });

    it('drops Connect Anki once Anki is connected but keeps its settings', () => {
        expect(connectionActions('ready').anki).toEqual(['stats-open-anki-settings statsOpenAnkiSettings']);
    });

    it('keeps a card that reports a problem, without an empty action row', () => {
        const snapshot = connectionSnapshot('ready');
        snapshot.yomuLocal = { ...snapshot.yomuLocal, status: 'error', message: 'Academy could not load.' };
        const root = renderNewTabStatsContent({ activityMetric: 'reviews', language: 'en', selectedSource: 'combined', snapshot, text: key => String(key) });
        const academy = root.querySelector('.jpdb-reader-stats-connection.is-yomu-local');
        expect(academy?.textContent).toContain('Academy could not load.');
        expect(academy?.querySelector('.jpdb-reader-stats-connection-actions')).toBeNull();
        expect(root.querySelector('.jpdb-reader-stats-connection.is-anki .jpdb-reader-stats-connection-actions')).not.toBeNull();
    });
});

describe('new tab stats for an account with nothing yet', () => {
    function emptySnapshot(): StatsDashboardSnapshot {
        const yomuLocal = emptyStatsSource('yomu-local', ACADEMY_SRS_LABEL, '', 'setup');
        return {
            jpdb: emptyStatsSource('jpdb', 'JPDB', ''),
            jiten: emptyStatsSource('jiten', 'Jiten', ''),
            bunpro: emptyStatsSource('bunpro', 'Bunpro', ''),
            wanikani: emptyStatsSource('wanikani', 'WaniKani', ''),
            yomuLocal,
            anki: emptyStatsSource('anki', 'Anki', ''),
            combined: { ...yomuLocal, id: 'combined' },
        };
    }

    function render(snapshot: StatsDashboardSnapshot): HTMLElement {
        return renderNewTabStatsContent({ activityMetric: 'reviews', language: 'en', selectedSource: 'combined', snapshot, text: key => String(key) });
    }

    // A screen of zero tiles, empty bars and empty calendars said nothing.
    it('shows one sentence and the two ways to start instead of a dashboard of zeros', () => {
        const root = render(emptySnapshot());

        expect(root.dataset.statsEmpty).toBe('true');
        expect(root.querySelector('.jpdb-reader-stats-empty p')?.textContent).toBe('statsEmptyHelp');
        expect(Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-stats-empty [data-newtab-action]'))
            .map(button => `${button.dataset.newtabAction}:${button.dataset.mode ?? ''}`)).toEqual(['mode:word', 'practice-sessions:']);
        for (const dashboard of ['.jpdb-reader-stats-metrics', '.jpdb-reader-stats-activity', '.jpdb-reader-stats-month-strip', '.jpdb-reader-stats-distribution', '.jpdb-reader-stats-progress']) {
            expect(root.querySelector(dashboard), dashboard).toBeNull();
        }
    });

    it('drops a source card that has nothing to offer but keeps ones with a next step', () => {
        const snapshot = emptySnapshot();
        snapshot.yomuLocal = { ...snapshot.yomuLocal, status: 'ready', message: 'No stats yet.' };
        snapshot.anki = { ...snapshot.anki, status: 'error', message: 'Anki is unavailable.' };
        snapshot.combined = { ...snapshot.yomuLocal, id: 'combined' };
        const root = render(snapshot);
        expect(Array.from(root.querySelectorAll('.jpdb-reader-stats-connection')).map(card => card.className)).toEqual(['jpdb-reader-stats-connection is-anki']);
    });

    it('keeps a first load quiet while no statistics have arrived', () => {
        const snapshot = emptySnapshot();
        snapshot.combined = { ...snapshot.combined, status: 'loading' };
        const root = render(snapshot);
        expect(root.querySelector('.jpdb-reader-stats-empty')?.textContent).toContain('statsLoading');
        expect(root.querySelector('.jpdb-reader-stats-bars')).toBeNull();
        expect(root.getAttribute('aria-busy')).toBe('true');
    });
});

describe('Stats data availability', () => {
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

describe('new tab stats units', () => {
    function metric(root: HTMLElement, label: string): HTMLElement | undefined {
        return Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-stats-metric'))
            .find(tile => tile.querySelector('.jpdb-reader-stats-metric-label')?.textContent === label);
    }

    function withDue(minutes: number): StatsDashboardSnapshot {
        const due = snapshot();
        due.combined = {
            ...due.combined,
            cards: { ...EMPTY_CARDS, total: 4, review: 4, due: 4 },
            daily: [{ date: ACTIVE_DAY, reviews: 3, correct: 3, failed: 0, newCards: 1, minutes }],
        };
        return due;
    }

    // "Due now" is a count of cards; without a time estimate it once read "cards/min".
    it('shows Due now as a count with its time estimate, never as a rate', () => {
        const render = (minutes: number) => renderNewTabStatsContent({ activityMetric: 'reviews', language: 'en', selectedSource: 'combined', snapshot: withDue(minutes), text: key => String(key) });
        expect(metric(render(6), 'statsDueNow')?.querySelector('strong')?.textContent).toBe('4');
        expect(metric(render(6), 'statsDueNow')?.querySelector('.jpdb-reader-stats-metric-detail')?.textContent).toMatch(/^statsEstimatedDueTime: \d+m$/u);
        const untimed = metric(render(0), 'statsDueNow');
        expect(untimed?.querySelector('strong')?.textContent).toBe('4');
        expect(untimed?.querySelector('.jpdb-reader-stats-metric-detail')).toBeNull();
        expect(untimed?.textContent).not.toContain('statsCardsPerMinute');
    });

    it('leaves an unknown rate out rather than showing n/a or a dash', () => {
        const root = renderStats();
        expect(metric(root, 'statsRetention')).toBeUndefined();
        expect(root.textContent).not.toContain('n/a');
        expect(root.querySelector('.jpdb-reader-stats-metrics')?.textContent ?? '').not.toContain('—');
    });
});

describe('new tab stats with some history', () => {
    function render(snapshot: StatsDashboardSnapshot, options: Partial<Parameters<typeof renderNewTabStatsContent>[0]> = {}): HTMLElement {
        return renderNewTabStatsContent({ activityMetric: 'reviews', language: 'en', selectedSource: 'combined', snapshot, text: key => String(key), ...options });
    }

    function measures(root: HTMLElement): Array<[string, string]> {
        return Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-stats-metric'))
            .map(tile => [tile.querySelector('.jpdb-reader-stats-metric-label')?.textContent ?? '', tile.querySelector('strong')?.textContent ?? '']);
    }

    // Two starter cards graded once: the phone's first screen was six tiles of
    // which four read 0 or "—", each over a section name ("Daily activity",
    // "Total reviews", "Card distribution") instead of information.
    it('shows only measures with a value, without section names under them', () => {
        const academy = { ...statsSource('yomu-local'), message: 'Academy SRS loaded.', reviewsToday: 2, daily: [], totalReviews: 0, cards: { ...EMPTY_CARDS, total: 2, learning: 2 } };
        const root = render({ ...snapshot(), combined: { ...academy, id: 'combined' } });
        expect(measures(root)).toEqual([['statsReviewsToday', '2']]);
        const details = Array.from(root.querySelectorAll('.jpdb-reader-stats-metric-detail')).map(detail => detail.textContent);
        for (const sectionName of ['statsDailyActivity', 'statsTotalReviews', 'statsCardDistribution']) expect(details).not.toContain(sectionName);
    });

    it('leads with three measures and puts the rest on one quiet line', () => {
        const busy = snapshot();
        busy.combined = {
            ...busy.combined,
            reviewsToday: 12,
            totalReviews: 400,
            retention: 0.87,
            currentStreak: 5,
            longestStreak: 9,
            savedOnly: 2,
            cards: { ...EMPTY_CARDS, total: 120, review: 100, due: 8, known: 60 },
        };
        const root = render(busy);
        const lead = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-stats-metrics > .jpdb-reader-stats-metric'));
        const more = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-stats-more .jpdb-reader-stats-metric'));
        expect(lead.map(tile => tile.querySelector('.jpdb-reader-stats-metric-label')?.textContent)).toEqual(['statsReviewsToday', 'statsDueNow', 'statsCurrentStreak']);
        expect(more.map(item => item.querySelector('.jpdb-reader-stats-metric-label')?.textContent)).toContain('statsRetention');
        expect(more.find(item => item.dataset.newtabAction === 'stats-open-saved')?.querySelector('strong')?.textContent).toBe('2');
    });

    it('draws one activity chart and offers the calendar on request', () => {
        const bars = render(snapshot());
        expect(bars.querySelector('.jpdb-reader-stats-bars')).not.toBeNull();
        expect(bars.querySelector('.jpdb-reader-stats-month-strip')).toBeNull();
        const toggle = bars.querySelector<HTMLElement>('[data-newtab-action="stats-activity-view"]');
        expect(toggle?.getAttribute('aria-pressed')).toBe('false');
        expect(toggle?.getAttribute('aria-label')).toBe('statsMonthlyHeatmap');

        const calendar = render(snapshot(), { activityView: 'calendar' });
        expect(calendar.querySelector('.jpdb-reader-stats-month-strip')).not.toBeNull();
        expect(calendar.querySelector('.jpdb-reader-stats-bars')).toBeNull();
        expect(calendar.querySelector('[data-newtab-action="stats-activity-view"]')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('says a source has loaded at most once', () => {
        const academy = { ...statsSource('yomu-local'), message: 'Academy SRS loaded.', reviewsToday: 2 };
        const root = render({ ...snapshot(), yomuLocal: academy, combined: { ...academy, id: 'combined' } });
        expect(root.textContent?.split('Academy SRS loaded.').length ?? 0).toBeLessThanOrEqual(2);
        expect(root.querySelector('.jpdb-reader-stats-header p')).toBeNull();
    });
});

describe('new tab stats on an empty source tab', () => {
    // JPDB with a long history and Anki enabled but not running: choosing the
    // Anki tab replaced the whole page, tabs included, with "after your first
    // session", and nothing led back to All until a reload.
    function jpdbAndBrokenAnki(): StatsDashboardSnapshot {
        const empty = (id: StatsSourceSnapshot['id'], label: string) => emptyStatsSource(id, label, '');
        const jpdb = { ...statsSource('jpdb'), label: 'JPDB', message: 'JPDB card states loaded.', totalReviews: 30_000, cards: { ...EMPTY_CARDS, total: 4000, review: 4000 } };
        const anki = emptyStatsSource('anki', 'Anki', 'Anki is unavailable.', 'error');
        return {
            jpdb,
            jiten: empty('jiten', 'Jiten'),
            bunpro: empty('bunpro', 'Bunpro'),
            wanikani: empty('wanikani', 'WaniKani'),
            yomuLocal: empty('yomu-local', ACADEMY_SRS_LABEL),
            anki,
            combined: { ...jpdb, id: 'combined' },
        };
    }

    it('keeps the source tabs and shows what that source reports', () => {
        const root = renderNewTabStatsContent({ activityMetric: 'reviews', language: 'en', selectedSource: 'anki', snapshot: jpdbAndBrokenAnki(), text: key => String(key) });
        const tabs = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-stats-tabs [data-newtab-action="stats-source"]'));
        expect(root.querySelector<HTMLElement>('.jpdb-reader-stats-tabs')?.hidden).toBe(false);
        expect(tabs.map(tab => [tab.dataset.statsSource, tab.dataset.active === 'true'])).toEqual([['combined', false], ['jpdb', false], ['anki', true]]);
        expect(root.dataset.statsEmpty).not.toBe('true');
        expect(root.textContent).not.toContain('statsEmptyHelp');
        expect(Array.from(root.querySelectorAll('.jpdb-reader-stats-connection')).map(card => card.className)).toEqual(['jpdb-reader-stats-connection is-anki']);
        expect(root.querySelector('.jpdb-reader-stats-connection.is-anki')?.textContent).toContain('Anki is unavailable.');
    });
});
