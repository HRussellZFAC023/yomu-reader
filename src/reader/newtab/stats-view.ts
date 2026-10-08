import { el } from '../dom/builder';
import type { UiCopyKey } from '../app/i18n';
import {
    averageReviewSpeed,
    dailyActivityStreakAt,
    estimatedDueMinutes,
    formatCompactNumber,
    formatPercent,
    monthlyActivityHeatmaps,
    recentDailyPoints,
    statsActivityMetricTotal,
    statsActivityMetricValue,
    statsCardSegments,
    statsSourceHasVisibleData,
    statsSourceForId,
    type StatsActivityMetric,
    type StatsDailyPoint,
    type StatsDashboardSnapshot,
    type StatsSourceId,
    type StatsSourceSnapshot,
} from '../app/stats';
import type { NewTabCopyKey } from './i18n';
import { ACADEMY_SRS_LABEL } from '../app/constants';
import { newTabAction, type NewTabAction } from './actions';

type NewTabStatsTextKey = UiCopyKey | NewTabCopyKey;
type NewTabStatsText = (key: NewTabStatsTextKey) => string;
type StatsRenderSource = StatsSourceSnapshot | ReturnType<typeof statsSourceForId>;

export interface NewTabStatsContentOptions {
    activityMetric: StatsActivityMetric;
    language: string;
    selectedDate?: string;
    selectedSource: StatsSourceId;
    snapshot: StatsDashboardSnapshot;
    text: NewTabStatsText;
}

interface NewTabStatsRenderContext extends NewTabStatsContentOptions {
    source: StatsRenderSource;
}

export function renderNewTabStatsContent(options: NewTabStatsContentOptions): HTMLElement {
    const selectedSource = resolvedStatsSourceId(options.snapshot, options.selectedSource);
    const context: NewTabStatsRenderContext = {
        ...options,
        selectedSource,
        source: statsSourceForId(options.snapshot, selectedSource),
    };
    const { source, text } = context;
    const empty = isEmptyStatsSource(source);
    return el('div', { class: 'jpdb-reader-stats', dataset: { statsStatus: source.status, statsEmpty: empty } },
        el('div', { class: 'jpdb-reader-stats-header' },
            el('div', { class: 'jpdb-reader-stats-title' },
                el('h1', {}, text('stats')),
                empty ? null : el('p', {}, source.message || text('statsNoData')),
            ),
            el('button', {
                type: 'button',
                class: 'jpdb-reader-stats-refresh',
                dataset: { newtabAction: newTabAction('stats-refresh') },
                'aria-label': text('statsRefresh'),
                title: text('statsRefresh'),
            }, '↻'),
        ),
        ...(empty ? [renderStatsEmpty(text)] : renderStatsDashboard(context)),
        renderStatsConnections(context, empty),
    );
}

// Nothing reviewed, saved or loaded yet: a screen of zeros, empty charts and
// calendars says nothing, so one line says what will appear and how to start.
function isEmptyStatsSource(source: StatsRenderSource): boolean {
    return source.status !== 'loading'
        && source.totalReviews === 0
        && source.cards.total === 0
        && !source.savedOnly
        && source.daily.every(point => !point.reviews && !point.newCards && !point.minutes);
}

function renderStatsEmpty(text: NewTabStatsText): HTMLElement {
    return el('section', { class: 'jpdb-reader-stats-empty' },
        el('p', {}, text('statsEmptyHelp')),
        el('div', { class: 'jpdb-reader-stats-empty-actions' },
            el('button', { type: 'button', class: 'is-primary', dataset: { newtabAction: newTabAction('mode'), mode: 'word' } }, text('study')),
            el('button', { type: 'button', dataset: { newtabAction: newTabAction('practice-sessions') } }, text('practiceTitle')),
        ),
    );
}

function renderStatsDashboard(context: NewTabStatsRenderContext): HTMLElement[] {
    return [
        renderStatsSourceTabs(context),
        renderStatsMetrics(context),
        renderStatsLearningProgress(context),
        renderStatsActivity(context),
        renderStatsDistribution(context),
    ];
}

export function normalizeNewTabStatsActivityMetric(value: string | undefined): StatsActivityMetric {
    return value === 'minutes' || value === 'newCards' || value === 'reviews' ? value : 'reviews';
}

export function isNewTabStatsDateKey(value: string | undefined): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function renderStatsSourceTabs(context: NewTabStatsRenderContext): HTMLElement {
    const { selectedSource, snapshot, text } = context;
    const sources = visibleStatsSources(snapshot);
    const tabs: Array<[StatsSourceId, string]> = sources.length > 1
        ? [
            ['combined', text('statsCombined')],
            ...sources.map(([source, snapshot]) => [source, snapshot.label || fallbackStatsSourceLabel(source)] as [StatsSourceId, string]),
        ]
        : [];
    return el('div', { class: 'jpdb-reader-stats-tabs', role: 'group', 'aria-label': text('stats'), hidden: tabs.length === 0, style: `--stats-tabs-count:${Math.max(1, tabs.length)}` },
        tabs.map(([source, label]) => el('button', {
            type: 'button',
            dataset: {
                newtabAction: newTabAction('stats-source'),
                statsSource: source,
                active: source === selectedSource,
            },
        }, label)),
    );
}

function renderStatsMetrics(context: NewTabStatsRenderContext): HTMLElement {
    const { source, text } = context;
    const speed = averageReviewSpeed(source);
    const dueEstimate = estimatedDueMinutes(source);
    return el('div', { class: 'jpdb-reader-stats-metrics' },
        renderStatsMetric(text('statsReviewsToday'), formatCompactNumber(source.reviewsToday), reviewsTodayDetail(context)),
        // Jiten Today-panel parity (SH-7): due-now with the time estimate.
        renderStatsMetric(text('statsDueNow'), formatCompactNumber(source.cards.due), statsDueTimeDetail(dueEstimate, context)),
        renderStatsMetric(text('statsCurrentStreak'), formatCompactNumber(source.currentStreak), `${text('statsLongestStreak')}: ${formatCompactNumber(source.longestStreak)} ${text('statsDays')}`),
        renderStatsMetric(text('statsRetention'), formatPercent(source.retention), text('statsTotalReviews')),
        renderStatsMetric(text('statsAverageSpeed'), formatStatsSpeed(speed), text('statsCardsPerMinute')),
        renderStatsMetric(text('statsCards'), formatCompactNumber(source.cards.total), cardSummaryText(source.cards, text)),
        renderStatsSavedMetric(context),
    );
}

// Saved words are not review work, so they are not "Cards". The tile is the
// way to them: it opens Library on them, where "Add to review" schedules each one.
function renderStatsSavedMetric({ source, text }: NewTabStatsRenderContext): HTMLElement | null {
    if (!source.savedOnly) return null;
    return el('button', {
        type: 'button',
        class: 'jpdb-reader-stats-metric jpdb-reader-stats-metric-link',
        dataset: { newtabAction: newTabAction('stats-open-saved') },
    }, statsMetricContent(text('savedWord'), formatCompactNumber(source.savedOnly), text('statsSavedDetail')));
}

function reviewsTodayDetail(context: NewTabStatsRenderContext): string {
    const { source, text } = context;
    const today = recentDailyPoints(source.daily, 1)[0];
    const newToday = today?.newCards ?? 0;
    return newToday > 0 ? `+${formatCompactNumber(newToday)} ${text('statsNewToday')}` : text('statsDailyActivity');
}

function renderStatsMetric(label: string, value: string, detail: string): HTMLElement {
    return el('section', { class: 'jpdb-reader-stats-metric' }, statsMetricContent(label, value, detail));
}

function statsMetricContent(label: string, value: string, detail: string): HTMLElement[] {
    return [
        el('span', { class: 'jpdb-reader-stats-metric-label' }, label),
        el('strong', {}, value),
        el('span', { class: 'jpdb-reader-stats-metric-detail' }, detail),
    ];
}

function renderStatsActivity(context: NewTabStatsRenderContext): HTMLElement {
    const { activityMetric, source, text } = context;
    const points = recentDailyPoints(source.daily, 30);
    const maxValue = Math.max(1, ...points.map(point => statsActivityMetricValue(point, activityMetric)));
    const selected = selectedStatsDayPoint(source.daily, points, context);
    return el('section', { class: 'jpdb-reader-stats-panel jpdb-reader-stats-activity' },
        el('div', { class: 'jpdb-reader-stats-panel-heading' },
            el('h2', {}, text('statsDailyActivity')),
            el('div', { class: 'jpdb-reader-stats-panel-actions' },
                renderStatsActivityMetricTabs(context),
                el('span', {}, statsActivityTotalLabel(points, activityMetric, context)),
            ),
        ),
        el('p', { class: 'jpdb-reader-stats-activity-summary' }, statsDayLabel(selected, source.daily, context)),
        el('div', { class: 'jpdb-reader-stats-bars', role: 'group', 'aria-label': text('statsDailyActivity') },
            // Only an explicit user pick draws the selected outline; the
            // implicit today-default made the final bar look permanently
            // "selected" (user-reported).
            points.map(point => renderStatsActivityBar(point, maxValue, activityMetric, isNewTabStatsDateKey(context.selectedDate) ? selected.date : '', source.daily, context)),
        ),
        renderStatsMonthStrip(source, activityMetric, context),
    );
}

function renderStatsActivityMetricTabs(context: NewTabStatsRenderContext): HTMLElement {
    const { activityMetric, text } = context;
    const metrics: Array<[StatsActivityMetric, string]> = [
        ['reviews', text('statsActivityReviews')],
        ['minutes', text('statsActivityMinutes')],
        ['newCards', text('statsActivityNewCards')],
    ];
    return el('div', { class: 'jpdb-reader-stats-activity-tabs', role: 'group', 'aria-label': text('statsDailyActivity') },
        metrics.map(([metric, label]) => el('button', {
            type: 'button',
            dataset: {
                newtabAction: newTabAction('stats-activity-metric'),
                statsActivityMetric: metric,
                active: metric === activityMetric,
            },
            'aria-pressed': String(metric === activityMetric),
        }, label)),
    );
}

function renderStatsActivityBar(point: StatsDailyPoint, maxValue: number, metric: StatsActivityMetric, selectedDate: string, sourcePoints: StatsDailyPoint[], context: NewTabStatsRenderContext): HTMLElement {
    const value = statsActivityMetricValue(point, metric);
    const height = Math.max(value > 0 ? 7 : 1, Math.round((value / maxValue) * 100));
    const label = statsDayLabel(point, sourcePoints, context);
    return el('button', {
        type: 'button',
        class: 'jpdb-reader-stats-bar',
        title: label,
        'aria-label': label,
        style: `--stats-bar-height:${height}%`,
        dataset: {
            newtabAction: newTabAction('stats-select-day'),
            statsDay: point.date,
            tooltip: label,
            active: value > 0,
            selected: point.date === selectedDate,
        },
    },
        el('span', { class: 'jpdb-reader-stats-bar-fill' }),
    );
}

function renderStatsMonthStrip(source: StatsRenderSource, metric: StatsActivityMetric, context: NewTabStatsRenderContext): HTMLElement {
    const months = monthlyActivityHeatmaps(source.daily, 6);
    const days = months.flatMap(month => month.days);
    const maxValue = Math.max(1, ...days.map(day => statsActivityMetricValue(day, metric)));
    return el('div', { class: 'jpdb-reader-stats-month-strip', 'aria-label': `${context.text('statsMonthlyHeatmap')}: ${statsActivityTotalLabel(days, metric, context)}` },
        months.map(month => renderStatsHeatmapMonth(month, maxValue, metric, source.daily, context)),
    );
}

function renderStatsHeatmapMonth(month: ReturnType<typeof monthlyActivityHeatmaps>[number], maxValue: number, metric: StatsActivityMetric, sourcePoints: StatsDailyPoint[], context: NewTabStatsRenderContext): HTMLElement {
    const label = formatStatsMonthLabel(month.year, month.month, context.language);
    const metricSummary = `${formatStatsActivityValue(statsActivityMetricTotal(month.days, metric), metric)} ${statsActivityMetricLabel(metric, context.text).toLowerCase()}`;
    const cells: Array<HTMLElement | null> = [
        ...Array.from({ length: month.startWeekday }, () => el('span', { class: 'jpdb-reader-stats-heatmap-spacer', 'aria-hidden': 'true' })),
        ...month.days.map(day => renderStatsHeatmapDay(day, maxValue, metric, sourcePoints, context)),
    ];
    return el('article', { class: 'jpdb-reader-stats-month', title: `${label}: ${metricSummary}` },
        el('div', { class: 'jpdb-reader-stats-month-heading' },
            el('strong', {}, label),
            el('span', {}, metricSummary),
        ),
        el('div', { class: 'jpdb-reader-stats-heatmap-grid', role: 'grid', 'aria-label': `${label}: ${metricSummary}` }, cells),
    );
}

function renderStatsHeatmapDay(point: StatsDailyPoint, maxValue: number, metric: StatsActivityMetric, sourcePoints: StatsDailyPoint[], context: NewTabStatsRenderContext): HTMLElement {
    const value = statsActivityMetricValue(point, metric);
    // '' fallback: only an explicit user pick marks a cell selected (the
    // today-default outline is the bar chart bug, same here).
    const selectedDate = selectedStatsDate(context, '');
    const label = statsDayLabel(point, sourcePoints, context);
    return el('button', {
        type: 'button',
        class: 'jpdb-reader-stats-heatmap-cell',
        title: label,
        'aria-label': label,
        dataset: {
            newtabAction: newTabAction('stats-select-day'),
            statsDay: point.date,
            day: String(Number(point.date.slice(-2))),
            tooltip: label,
            active: value > 0,
            level: statsHeatmapLevel(value, maxValue),
            selected: point.date === selectedDate,
            today: point.date === todayStatsDate(),
        },
    });
}

// JPDB Learn parity: the "Learning | You know" progress table. Only rows the
// active provider can honestly report are rendered (the public JPDB API has
// no kanji or indirect-count endpoints, so those rows stay provider-side).
function renderStatsLearningProgress(context: NewTabStatsRenderContext): HTMLElement {
    const { source, text } = context;
    const cards = source.cards;
    const learningCount = cards.learning + cards.failed;
    const knownPct = cards.total > 0 ? formatPercent(cards.known / cards.total) : '';
    const knownRatio = cards.total > 0 ? (cards.known / cards.total) * 100 : 0;
    const learningRatio = cards.total > 0 ? (learningCount / cards.total) * 100 : 0;
    return el('section', { class: 'jpdb-reader-stats-progress', 'aria-label': text('statsLearningProgress') },
        el('div', { class: 'jpdb-reader-stats-progress-grid' },
            renderStatsProgressItem(text('statsWordsRow'), formatCompactNumber(cards.total)),
            renderStatsProgressItem(text('statsLearningColumn'), formatCompactNumber(learningCount)),
            renderStatsProgressItem(
                text('statsKnownColumn'),
                knownPct ? `${formatCompactNumber(cards.known)} (${knownPct})` : formatCompactNumber(cards.known),
            ),
        ),
        el('div', { class: 'jpdb-reader-stats-progress-rail', 'aria-hidden': 'true' },
            el('span', { class: 'is-learning', style: `width:${formatProgressRailWidth(learningRatio)}%` }),
            el('span', { class: 'is-known', style: `width:${formatProgressRailWidth(knownRatio)}%` }),
        ),
        el('p', { class: 'jpdb-reader-stats-progress-total' },
            `${text('statsTotalKnownVocabulary')}: ${formatCompactNumber(cards.known)}`,
        ),
    );
}

function renderStatsProgressItem(label: string, value: string): HTMLElement {
    return el('div', { class: 'jpdb-reader-stats-progress-item' },
        el('span', { class: 'jpdb-reader-stats-progress-item-label' }, label),
        el('strong', {}, value),
    );
}

function formatProgressRailWidth(value: number): string {
    return Math.max(0, Math.min(100, value)).toFixed(2).replace(/\.?0+$/u, '');
}

function renderStatsDistribution(context: NewTabStatsRenderContext): HTMLElement {
    const { source, text } = context;
    const segments = statsCardSegments(source.cards);
    const visibleTotal = Math.max(1, segments.reduce((sum, segment) => sum + segment.value, 0));
    const troubleCount = source.cards.due;
    return el('section', { class: 'jpdb-reader-stats-panel jpdb-reader-stats-distribution' },
        el('div', { class: 'jpdb-reader-stats-panel-heading' },
            el('h2', {}, text('statsCardDistribution')),
            el('div', { class: 'jpdb-reader-stats-panel-actions' },
                el('span', {}, `${formatCompactNumber(source.cards.total)} ${text('statsCards').toLowerCase()}`),
                el('button', {
                    type: 'button',
                    class: 'jpdb-reader-stats-panel-button',
                    dataset: { newtabAction: newTabAction('stats-study-trouble') },
                    disabled: troubleCount <= 0,
                    title: text('statsStudyTroubleHint'),
                }, text('statsStudyTroubleCards')),
            ),
        ),
        el('div', { class: 'jpdb-reader-stats-stackbar', role: 'img', 'aria-label': text('statsCardDistribution') },
            segments.length
                ? segments.map(segment => el('span', {
                    class: `jpdb-reader-stats-stack-segment is-${String(segment.key)}`,
                    style: `width:${Math.max(4, (segment.value / visibleTotal) * 100)}%`,
                    title: `${segment.label}: ${segment.value}`,
                }))
                : el('span', { class: 'jpdb-reader-stats-stack-empty' }),
        ),
        el('div', { class: 'jpdb-reader-stats-legend' },
            segments.length
                ? segments.map(segment => el('span', { class: `is-${String(segment.key)}` }, `${localizedStatsSegmentLabel(segment.label, text)} ${formatCompactNumber(segment.value)}`))
                : el('span', {}, text('statsNoData')),
        ),
    );
}

// With nothing to show yet, only a source that offers a next step earns a card:
// another "No stats yet." beside the empty-state line says nothing new.
function renderStatsConnections(context: NewTabStatsRenderContext, actionableOnly = false): HTMLElement {
    const { snapshot, text } = context;
    const sources = visibleStatsSources(snapshot).map(([, source]) => source)
        .filter(source => !actionableOnly || statsConnectionActions(source, text).length > 0);
    return el('section', { class: 'jpdb-reader-stats-connections', 'aria-label': text('statsConnections') },
        sources.map(source => renderStatsConnectionCard(source, context)),
    );
}

function renderStatsConnectionCard(source: StatsSourceSnapshot, context: NewTabStatsRenderContext): HTMLElement {
    const actions = statsConnectionActions(source, context.text);
    return el('article', { class: `jpdb-reader-stats-connection is-${source.id}`, dataset: { statsStatus: source.status } },
        renderStatsConnectionMain(source, context),
        actions.length ? el('div', { class: 'jpdb-reader-stats-connection-actions' }, actions) : null,
        renderStatsConnectionDropzone(source.id === 'jpdb', context.text),
    );
}

function renderStatsConnectionMain(source: StatsSourceSnapshot, context: NewTabStatsRenderContext): HTMLElement {
    return el('div', { class: 'jpdb-reader-stats-connection-main' },
        el('strong', {}, source.label),
        el('span', {}, source.message),
        statsConnectionDeckToggles(source, context),
    );
}

function statsConnectionDeckToggles(source: StatsSourceSnapshot, context: NewTabStatsRenderContext): HTMLElement | null {
    if (source.id !== 'anki' || !source.deckNames?.length) return null;
    return renderStatsAnkiDeckToggles(source, context.text);
}

// Each card offers only what its own source needs. A source with nothing to
// connect or set up gets no buttons rather than another source's.
function statsConnectionActions(source: StatsSourceSnapshot, text: NewTabStatsText): HTMLElement[] {
    if (source.id === 'jpdb') return [
        statsConnectionButton(newTabAction('stats-open-api-settings'), text('statsOpenJpdbSettings')),
        statsConnectionButton(newTabAction('stats-import-jpdb'), text('statsChooseJpdbFile')),
    ];
    // Their keys and tokens all live in API settings.
    if (source.id === 'jiten' || source.id === 'bunpro' || source.id === 'wanikani') return [
        statsConnectionButton(newTabAction('stats-open-api-settings'), text('statsOpenApiSettings')),
    ];
    if (source.id === 'anki') return [
        ...(isAnkiConnected(source) ? [] : [statsConnectionButton(newTabAction('stats-connect-anki'), text('statsConnectAnki'))]),
        statsConnectionButton(newTabAction('stats-open-anki-settings'), text('statsOpenAnkiSettings')),
    ];
    // Academy is local: nothing to connect, and the Saved tile above is
    // already its way into Library.
    return [];
}

function statsConnectionButton(action: NewTabAction, label: string): HTMLElement {
    return el('button', { type: 'button', dataset: { newtabAction: action } }, label);
}

function isAnkiConnected(source: StatsSourceSnapshot): boolean {
    return source.status === 'ready' || source.status === 'partial' || Boolean(source.deckNames?.length);
}

function renderStatsConnectionDropzone(isJpdb: boolean, text: NewTabStatsText): HTMLElement | null {
    if (!isJpdb) return null;
    return el('label', { class: 'jpdb-reader-stats-dropzone', dataset: { statsDropzone: true, dragging: false } },
        el('input', { type: 'file', accept: '.json,application/json', dataset: { statsJpdbFile: true } }),
        el('span', {}, text('statsDropJpdbFile')),
    );
}

function visibleStatsSources(snapshot: StatsDashboardSnapshot): Array<[Exclude<StatsSourceId, 'combined'>, StatsSourceSnapshot]> {
    return ([
        ['jpdb', snapshot.jpdb],
        ['jiten', snapshot.jiten],
        ['yomu-local', snapshot.yomuLocal],
        ['bunpro', snapshot.bunpro],
        ['wanikani', snapshot.wanikani],
        ['anki', snapshot.anki],
    ] as Array<[Exclude<StatsSourceId, 'combined'>, StatsSourceSnapshot]>).filter(([, source]) => statsSourceHasVisibleData(source));
}

function resolvedStatsSourceId(snapshot: StatsDashboardSnapshot, requested: StatsSourceId): StatsSourceId {
    const visible = visibleStatsSources(snapshot).map(([id]) => id);
    if (visible.length <= 1) return visible[0] ?? 'combined';
    if (requested === 'combined' || visible.includes(requested as Exclude<StatsSourceId, 'combined'>)) return requested;
    return 'combined';
}

function fallbackStatsSourceLabel(source: Exclude<StatsSourceId, 'combined'>): string {
    if (source === 'jpdb') return 'JPDB';
    if (source === 'jiten') return 'Jiten';
    if (source === 'bunpro') return 'Bunpro';
    if (source === 'wanikani') return 'WaniKani';
    if (source === 'yomu-local') return ACADEMY_SRS_LABEL;
    return 'Anki';
}

function renderStatsAnkiDeckToggles(source: StatsSourceSnapshot, text: NewTabStatsText): HTMLElement | null {
    if (!source.deckNames?.length) return null;
    const activeDecks = new Set(source.activeDeckNames ?? source.deckNames);
    return el('div', { class: 'jpdb-reader-stats-decks', role: 'group', 'aria-label': text('statsAnkiDecks') },
        source.deckNames.map(deck => {
            const active = activeDecks.has(deck);
            return el('label', { class: 'jpdb-reader-stats-deck-toggle', dataset: { active } },
                el('input', {
                    type: 'checkbox',
                    checked: active,
                    dataset: { newtabAction: newTabAction('stats-toggle-anki-deck'), statsAnkiDeck: deck },
                }),
                el('span', {}, deck),
            );
        }),
    );
}

function cardSummaryText(cards: StatsSourceSnapshot['cards'], text: NewTabStatsText): string {
    const parts = [
        cards.failed ? `${text('stateFailed')} ${formatCompactNumber(cards.failed)}` : '',
        cards.due ? `${text('statsDue')} ${formatCompactNumber(cards.due)}` : '',
        cards.known ? `${text('statsKnown')} ${formatCompactNumber(cards.known)}` : '',
    ].filter(Boolean);
    return parts.join(' · ') || text('statsCardDistribution');
}

function localizedStatsSegmentLabel(label: string, text: NewTabStatsText): string {
    const keyByLabel: Record<string, NewTabStatsTextKey> = {
        New: 'stateNew',
        Learning: 'stateLearning',
        Failed: 'stateFailed',
        Due: 'statsDue',
        Review: 'stateDue',
        Known: 'statsKnown',
        Suspended: 'stateSuspended',
        Ignored: 'wordColorIgnored',
    };
    const key = keyByLabel[label];
    return key ? text(key) : label;
}

function selectedStatsDayPoint(points: StatsDailyPoint[], fallbackPoints: StatsDailyPoint[], context: NewTabStatsRenderContext): StatsDailyPoint {
    const fallback = fallbackPoints[fallbackPoints.length - 1] ?? emptyStatsDailyPoint(todayStatsDate());
    const date = selectedStatsDate(context, fallback.date);
    const byDate = new Map([...points, ...fallbackPoints].map(point => [point.date, point]));
    return byDate.get(date) ?? emptyStatsDailyPoint(date);
}

function selectedStatsDate(context: NewTabStatsRenderContext, fallback: string): string {
    return isNewTabStatsDateKey(context.selectedDate) ? context.selectedDate : fallback;
}

function emptyStatsDailyPoint(date: string): StatsDailyPoint {
    return { date, reviews: 0, correct: 0, failed: 0, newCards: 0, minutes: 0 };
}

function todayStatsDate(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatStatsDateLabel(dateKey: string, language: string): string {
    const date = new Date(`${dateKey}T00:00:00`);
    if (!Number.isFinite(date.getTime())) return dateKey;
    return new Intl.DateTimeFormat(statsLocale(language), { month: 'short', day: 'numeric', weekday: 'short' }).format(date);
}

function formatStatsMonthLabel(year: number, month: number, language: string): string {
    const date = new Date(year, month - 1, 1);
    return new Intl.DateTimeFormat(statsLocale(language), { month: 'short', year: 'numeric' }).format(date);
}

function statsLocale(language: string): string {
    return language === 'ja' ? 'ja-JP' : 'en-US';
}

function statsDayLabel(point: StatsDailyPoint, sourcePoints: StatsDailyPoint[], context: NewTabStatsRenderContext): string {
    const { language, text } = context;
    const attempts = point.correct + point.failed;
    const accuracy = attempts > 0 ? formatPercent(point.correct / attempts) : '—';
    const streak = dailyActivityStreakAt(sourcePoints, point.date);
    return [
        formatStatsDateLabel(point.date, language),
        `${text('statsActivityReviews')}: ${formatCompactNumber(point.reviews)}`,
        `${text('statsActivityMinutes')}: ${formatStatsDuration(point.minutes)}`,
        `${text('statsActivityNewCards')}: ${formatCompactNumber(point.newCards)}`,
        `${text('statsStreak')}: ${formatStatsDayCount(streak, context)}`,
        `${text('statsAccuracy')}: ${accuracy}`,
    ].join(' · ');
}

function formatStatsDayCount(value: number, context: NewTabStatsRenderContext): string {
    const days = formatCompactNumber(value);
    return context.language === 'ja' ? `${days}${context.text('statsDays')}` : `${days} ${context.text('statsDays')}`;
}

function statsHeatmapLevel(value: number, maxValue: number): string {
    if (value <= 0 || maxValue <= 0) return '0';
    return String(Math.max(1, Math.min(4, Math.ceil((value / maxValue) * 4))));
}

function statsActivityMetricLabel(metric: StatsActivityMetric, text: NewTabStatsText): string {
    const labelByMetric: Record<StatsActivityMetric, NewTabStatsTextKey> = {
        minutes: 'statsActivityMinutes',
        newCards: 'statsActivityNewCards',
        reviews: 'statsActivityReviews',
    };
    return text(labelByMetric[metric]);
}

function statsActivityTotalLabel(points: StatsDailyPoint[], metric: StatsActivityMetric, context: NewTabStatsRenderContext): string {
    const total = statsActivityMetricTotal(points, metric);
    return `${formatStatsActivityValue(total, metric)} ${statsActivityMetricLabel(metric, context.text).toLowerCase()}`;
}

function formatStatsActivityValue(value: number, metric: StatsActivityMetric): string {
    if (metric === 'minutes') return formatStatsDuration(value);
    return formatCompactNumber(value);
}

function formatStatsSpeed(speed: number | null): string {
    return speed === null ? '—' : `${speed.toFixed(speed >= 10 ? 0 : 1)}`;
}

function statsDueTimeDetail(minutes: number | null, context: NewTabStatsRenderContext): string {
    const { source, text } = context;
    const parts: string[] = [];
    if (minutes !== null) parts.push(`${text('statsEstimatedDueTime')}: ${formatStatsDuration(minutes)}`);
    // Jiten Today-panel parity: upcoming-review forecast where the provider's
    // scheduler can answer exactly (Anki).
    const forecast = source.dueForecast;
    if (forecast) parts.push(`${text('statsNext7d')}: ${formatCompactNumber(forecast.in7)} · ${text('statsNext30d')}: ${formatCompactNumber(forecast.in30)}`);
    return parts.length ? parts.join(' · ') : text('statsCards').toLowerCase();
}

function formatStatsDuration(minutes: number): string {
    if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
    if (minutes < 60) return `${Math.round(minutes)}m`;
    return `${(minutes / 60).toFixed(minutes >= 600 ? 0 : 1).replace(/\.0$/u, '')}h`;
}
