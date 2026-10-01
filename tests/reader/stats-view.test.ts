import { describe, expect, it } from 'vitest';

import { ACADEMY_SRS_LABEL } from '../../src/reader/app/constants';
import { renderNewTabStatsContent } from '../../src/reader/newtab/stats-view';
import { emptyStatsSource, type StatsCardBreakdown, type StatsDailyPoint, type StatsDashboardSnapshot, type StatsSourceSnapshot, type StatsSourceStatus } from '../../src/reader/app/stats';

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
            combined: { ...yomuLocal, id: 'combined' },
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

    it('offers each source only its own actions, and Academy none', () => {
        expect(connectionActions('error')).toEqual({
            jpdb: ['stats-open-api-settings statsOpenJpdbSettings', 'stats-import-jpdb statsChooseJpdbFile'],
            jiten: ['stats-open-api-settings statsOpenApiSettings'],
            'yomu-local': [],
            bunpro: ['stats-open-api-settings statsOpenApiSettings'],
            wanikani: ['stats-open-api-settings statsOpenApiSettings'],
            anki: ['stats-connect-anki statsConnectAnki', 'stats-open-anki-settings statsOpenAnkiSettings'],
        });
    });

    it('drops Connect Anki once Anki is connected but keeps its settings', () => {
        expect(connectionActions('ready').anki).toEqual(['stats-open-anki-settings statsOpenAnkiSettings']);
    });

    it('leaves out the empty action row on a card with no actions', () => {
        const root = renderConnections('ready');
        expect(root.querySelector('.jpdb-reader-stats-connection.is-yomu-local .jpdb-reader-stats-connection-actions')).toBeNull();
        expect(root.querySelector('.jpdb-reader-stats-connection.is-anki .jpdb-reader-stats-connection-actions')).not.toBeNull();
    });
});
