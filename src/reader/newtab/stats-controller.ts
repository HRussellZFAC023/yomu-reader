import type { JPDBCard, ReaderSettings } from '../app/types';
import type { JpdbClient } from '../jpdb/jpdb';
import type { JitenApiClient } from '../dictionaries/jiten';
import type { YomuSrsAdapter, YomuSrsReviewable } from '../srs/types';
import type { resolveUiLanguage, UiCopyKey } from '../app/i18n';
import type { NewTabCopyKey } from './i18n';
import type { NewTabConcreteSource } from './source';
import type { NewTabUiState } from './state';
import { Logger } from '../app/logger';
import { gmStorageGet, gmStorageSet } from '../app/storage';
import { OperationTracker } from '../core/operation-token';
import { nearestElementByPoint, pointerPointFromEvent } from '../dom/pointer-geometry';
import { effectiveJitenApiKey, hasJpdbApiCredential, hasJitenApiCredential } from '../settings/api-credential';
import { loadJitenDailyStats } from '../dictionaries/jiten-stats-cache';
import { ACADEMY_SRS_LABEL } from '../app/constants';
import { dedupeWords } from './card-selection';
import {
    JPDB_ALL_DECKS,
    JPDB_DECK_SAMPLE_LIMIT,
    NEW_TAB_SOURCE_LABELS,
    NEW_TAB_STATS_DISABLED_ANKI_DECKS_KEY,
    NEW_TAB_STATS_JPDB_CARD_LIMIT,
    NEW_TAB_STATS_JPDB_HISTORY_KEY,
} from './controller-config';
import { isNewTabStatsDateKey, normalizeNewTabStatsActivityMetric, renderNewTabStatsContent } from './stats-view';
import {
    applyJitenDailyStats,
    applyJitenReviewHistory,
    applyJpdbReviewImport,
    combineStatsSources,
    emptyStatsDashboardSnapshot,
    emptyStatsSource,
    loadAnkiConnectStats,
    parseJpdbReviewExportText,
    statsFromApiCards,
    statsFromJitenCards,
    type JpdbReviewImport,
    type StatsActivityMetric,
    type StatsDashboardSnapshot,
    type StatsSourceId,
    type StatsSourceSnapshot,
} from '../app/stats';
import { nearestNewTabAction, newTabActionSelector, type NewTabAction } from './actions';

const log = Logger.scope('NewTab');

const NEW_TAB_STATS_JITEN_HISTORY_LIMIT = 1000;

type NewTabStatsTextKey = UiCopyKey | NewTabCopyKey;
type NewTabSrsAdapterSource = Extract<NewTabConcreteSource, 'bunpro' | 'wanikani' | 'yomu-local'>;
type NewTabSrsQueueAdapter = Pick<YomuSrsAdapter, 'label' | 'hasCredential' | 'stats' | 'queue' | 'review'>;

// A single labelled card fetcher used to build a stats pool. Also the shape of
// the controller's My-Cards browse-pool providers, hence exported.
export interface NewTabStatsApiProvider {
    label: string;
    load: () => Promise<JPDBCard[]>;
}

interface NewTabStatsApiProviderResult {
    provider: NewTabStatsApiProvider;
    cards: JPDBCard[];
    error: unknown | null;
}

export async function loadNewTabStatsApiProvider(provider: NewTabStatsApiProvider): Promise<NewTabStatsApiProviderResult> {
    try {
        return { provider, cards: await provider.load(), error: null };
    } catch (error) {
        log.warn(`${provider.label} stats failed`, error);
        return { provider, cards: [], error };
    }
}

function orderedNewTabStatsProviderLabel(results: NewTabStatsApiProviderResult[]): string {
    return results
        .map(result => result.provider.label)
        .sort((a, b) => newTabStatsProviderLabelRank(a) - newTabStatsProviderLabelRank(b))
        .join(' + ');
}

function newTabStatsProviderLabelRank(label: string): number {
    if (label.startsWith('Jiten')) return 0;
    if (label.startsWith('JPDB')) return 1;
    if (label.startsWith('Anki')) return 2;
    return 3;
}

function statsSourceIdFromValue(value: string | undefined): StatsSourceId {
    if (value === 'jpdb' || value === 'jiten' || value === 'bunpro' || value === 'wanikani' || value === 'yomu-local' || value === 'anki' || value === 'combined') return value;
    return 'combined';
}

/**
 * The stats page owns the `stats-`-prefixed slice of the Study action
 * vocabulary; the router hands every other action elsewhere.
 */
type NewTabStatsAction = Extract<NewTabAction, `stats-${string}`>;

function isNewTabStatsAction(action: NewTabAction | undefined): action is NewTabStatsAction {
    return action !== undefined && action.startsWith('stats-');
}

interface StatsClickRequest {
    action: NewTabStatsAction;
    chartDayTarget: HTMLElement | null;
    target: HTMLElement;
}

interface StoredAnkiDeckPreferences {
    version: 2;
    accounts: Record<string, string[]>;
}

type StatsClickHandler = (root: HTMLElement, target: HTMLElement, request: StatsClickRequest) => void;

// Everything the stats surface reads off the controller, made explicit. This
// interface documents the stats page's real coupling: the review-source
// clients (jpdb/jiten/anki/srsAdapters) plus availability checks, the SRS
// reviewable→card mapper, i18n, three page-chrome callbacks (mode/theme sync,
// settings navigation), the coarse-pointer heuristic used by chart taps, and
// one bridge back into the study surface ("study my trouble cards").
export interface NewTabStatsControllerDeps {
    getSettings(): ReaderSettings;
    ankiProviderContext(): string;
    jpdb: Pick<JpdbClient, 'listDeckCards' | 'listDecks'>;
    jiten?: Pick<JitenApiClient, 'listStudyBatchCards'> & Partial<Pick<JitenApiClient, 'listRecentReviews'>>;
    anki: {
        invoke: <T>(action: string, params?: Record<string, unknown>) => Promise<T>;
        requestPermission: () => Promise<unknown>;
    };
    srsAdapters?: Partial<Record<NewTabSrsAdapterSource, NewTabSrsQueueAdapter>>;
    srsReviewableToNewTabCard(card: YomuSrsReviewable): JPDBCard | null;
    canUseBunproSource(): boolean;
    canUseWanikaniSource(): boolean;
    canUseYomuLocalSource(): boolean;
    text(key: NewTabStatsTextKey): string;
    formatText(key: NewTabCopyKey, values: Record<string, string>): string;
    resolvedLanguage(): ReturnType<typeof resolveUiLanguage>;
    syncMode(root: HTMLElement): void;
    syncThemeToggle(root: HTMLElement): void;
    showSettings(tab: 'api' | 'mining'): void;
    hasCoarsePointer(): boolean;
    // "Study these" from the stats page: switches the study surface to the
    // selected source's trouble cards. Stays a controller concern because it
    // rewrites study state (pool, mode, word load).
    studyTroubleCards(root: HTMLElement): void;
}

// The stats page surface extracted from the controller god class: owns the
// dashboard snapshot + view state (selected source/metric/day, Anki deck
// toggles), the per-source data loading, and the stats click handling. The
// controller instantiates it and forwards renders/clicks.
export class NewTabStatsController {
    private snapshot: StatsDashboardSnapshot = emptyStatsDashboardSnapshot();
    private selectedSource: StatsSourceId = 'combined';
    private activityMetric: StatsActivityMetric = 'reviews';
    private selectedDate = '';
    private loaded = false;
    private deckPrefsLoaded = false;
    private disabledAnkiDecks = new Set<string>();
    private deckPrefsContext = '';
    // Latest-wins guard for in-flight loads (the 1.6.173 'stats' scope).
    private readonly operations = new OperationTracker();

    private readonly clickHandlers: Partial<Record<NewTabStatsAction, StatsClickHandler>> = {
        'stats-source': (root, target) => this.selectSource(root, target),
        'stats-activity-metric': (root, target) => this.selectActivityMetric(root, target),
        'stats-select-day': (root, target, request) => this.selectDay(root, target, request.chartDayTarget),
        'stats-study-trouble': root => this.deps.studyTroubleCards(root),
        'stats-refresh': root => { void this.loadInto(root, true); },
        'stats-toggle-anki-deck': (root, target) => this.toggleAnkiDeck(root, target),
        'stats-connect-anki': root => { void this.connectAnki(root); },
        'stats-open-jpdb-settings': () => this.deps.showSettings('api'),
        'stats-open-anki-settings': () => this.deps.showSettings('mining'),
        'stats-import-jpdb': root => {
            root.querySelector<HTMLInputElement>('[data-stats-jpdb-file]')?.click();
        },
    };

    constructor(private readonly deps: NewTabStatsControllerDeps) {}

    // Drop loaded data so the next render re-fetches (source switch / reload);
    // also supersedes any in-flight stats load.
    reset(): void {
        this.snapshot = emptyStatsDashboardSnapshot();
        this.loaded = false;
        this.selectedDate = '';
        this.operations.begin('stats'); // invalidate any in-flight stats load
    }

    resetProviderContext(): void {
        this.reset();
        this.deckPrefsLoaded = false;
        this.deckPrefsContext = '';
        this.disabledAnkiDecks.clear();
    }

    // The study source matching the selected stats source (for "study these").
    selectedStudySource(): NewTabUiState['source'] {
        if (this.selectedSource === 'jpdb' || this.selectedSource === 'jiten') return 'jpdb';
        if (this.selectedSource === 'bunpro') return 'bunpro';
        if (this.selectedSource === 'wanikani') return 'wanikani';
        if (this.selectedSource === 'yomu-local') return 'yomu-local';
        if (this.selectedSource === 'anki') return 'anki';
        return 'auto';
    }

    render(root: HTMLElement): void {
        this.deps.syncMode(root);
        root.classList.remove('jpdb-reader-newtab-setup-mode', 'jpdb-reader-newtab-empty-mode', 'jpdb-reader-newtab-revealed', 'jpdb-reader-newtab-review-mode');
        this.deps.syncThemeToggle(root);
        const study = root.querySelector<HTMLElement>('[data-newtab-study]');
        if (!study) return;
        study.removeAttribute('data-newtab-card');
        study.replaceChildren(renderNewTabStatsContent({
            activityMetric: this.activityMetric,
            language: this.deps.resolvedLanguage(),
            selectedDate: this.selectedDate,
            selectedSource: this.selectedSource,
            snapshot: this.snapshot,
            text: key => this.deps.text(key),
        }));
    }

    async loadInto(root: HTMLElement, force = false): Promise<void> {
        if (this.shouldSkipLoad(force)) return;
        await this.loadDeckPrefs();
        const settings = this.deps.getSettings();
        const statsOp = this.operations.begin('stats');
        this.snapshot = this.loadingSnapshot(settings);
        this.render(root);
        const [history, jpdb, jiten, bunpro, wanikani, yomuLocal, anki] = await Promise.all([
            this.readJpdbHistory(),
            this.loadJpdbSource(),
            this.loadJitenSource(),
            this.loadSrsAdapterSource('bunpro'),
            this.loadSrsAdapterSource('wanikani'),
            this.loadSrsAdapterSource('yomu-local'),
            this.loadAnkiSource(),
        ]);
        if (!this.isCurrentLoad(statsOp.superseded, root)) return;
        const jpdbWithHistory = applyJpdbReviewImport(jpdb, history);
        const jitenWithHistory = applyJitenDailyStats(jiten, loadJitenDailyStats(effectiveJitenApiKey(this.deps.getSettings())));
        this.snapshot = {
            jpdb: jpdbWithHistory,
            jiten: jitenWithHistory,
            bunpro,
            wanikani,
            yomuLocal,
            anki,
            combined: combineStatsSources(jpdbWithHistory, jitenWithHistory, yomuLocal, bunpro, wanikani, anki),
        };
        this.loaded = true;
        this.render(root);
    }

    private shouldSkipLoad(force: boolean): boolean {
        return this.loaded && !force;
    }

    private isCurrentLoad(superseded: boolean, root: HTMLElement): boolean {
        return !superseded && root.isConnected;
    }

    private loadingSnapshot(settings: ReaderSettings): StatsDashboardSnapshot {
        return {
            jpdb: this.loadingOrUnavailable(hasJpdbApiCredential(settings), this.snapshot.jpdb, emptyStatsSource('jpdb', 'JPDB', this.deps.text('statsApiKeyMissing'), 'setup')),
            jiten: this.loadingOrUnavailable(hasJitenApiCredential(settings), this.snapshot.jiten, emptyStatsSource('jiten', 'Jiten', this.deps.text('statsApiKeyMissing'), 'setup')),
            bunpro: this.loadingOrUnavailable(this.deps.canUseBunproSource(), this.snapshot.bunpro, emptyStatsSource('bunpro', 'Bunpro', this.deps.text('statsApiKeyMissing'), 'setup')),
            wanikani: this.loadingOrUnavailable(this.deps.canUseWanikaniSource(), this.snapshot.wanikani, emptyStatsSource('wanikani', 'WaniKani', this.deps.text('statsApiKeyMissing'), 'setup')),
            yomuLocal: this.loadingOrUnavailable(this.deps.canUseYomuLocalSource(), this.snapshot.yomuLocal, emptyStatsSource('yomu-local', ACADEMY_SRS_LABEL, this.deps.text('statsNoData'), 'setup')),
            anki: this.loadingOrUnavailable(this.shouldLoadAnki(settings), this.snapshot.anki, emptyStatsSource('anki', 'Anki', this.deps.text('statsConnectAnki'), 'setup')),
            combined: this.loadingSource(this.snapshot.combined),
        };
    }

    private loadingOrUnavailable<T extends StatsSourceSnapshot>(available: boolean, source: T, unavailable: T): T {
        return available ? this.loadingSource(source) : unavailable;
    }

    // --- click handling ---

    handleClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action?: NewTabAction): boolean {
        const request = this.clickRequest(root, target, action, event);
        if (!request) return false;
        event.preventDefault();
        return this.performClick(root, request);
    }

    private clickRequest(root: HTMLElement, target: HTMLElement, action: NewTabAction | undefined, event: MouseEvent): StatsClickRequest | null {
        const chartDayTarget = action ? null : this.nearestChartDayTarget(root, target, event);
        const resolvedAction = action ?? nearestNewTabAction(chartDayTarget);
        return isNewTabStatsAction(resolvedAction)
            ? { action: resolvedAction, chartDayTarget, target: chartDayTarget ?? target }
            : null;
    }

    private performClick(root: HTMLElement, request: StatsClickRequest): boolean {
        const handler = this.clickHandlers[request.action];
        if (!handler) return false;
        handler(root, request.target, request);
        return true;
    }

    private selectSource(root: HTMLElement, target: HTMLElement): void {
        const source = target.closest<HTMLElement>('[data-stats-source]')?.dataset.statsSource;
        this.selectedSource = statsSourceIdFromValue(source);
        this.render(root);
    }

    private selectActivityMetric(root: HTMLElement, target: HTMLElement): void {
        const metric = target.closest<HTMLElement>('[data-stats-activity-metric]')?.dataset.statsActivityMetric;
        this.activityMetric = normalizeNewTabStatsActivityMetric(metric);
        this.render(root);
    }

    private selectDay(root: HTMLElement, target: HTMLElement, chartDayTarget: HTMLElement | null): void {
        const date = target.closest<HTMLElement>('[data-stats-day]')?.dataset.statsDay ?? chartDayTarget?.dataset.statsDay;
        if (!isNewTabStatsDateKey(date)) return;
        this.selectedDate = date;
        this.render(root);
    }

    private nearestChartDayTarget(root: HTMLElement, target: HTMLElement, event: MouseEvent): HTMLElement | null {
        if (!this.deps.hasCoarsePointer()) return null;
        const point = pointerPointFromEvent(event);
        if (!point) return null;
        return nearestElementByPoint(this.nearbyChartDayTargets(root, target), point);
    }

    private nearbyChartDayTargets(root: HTMLElement, target: HTMLElement): HTMLElement[] {
        const chart = target.closest<HTMLElement>('.jpdb-reader-stats-bars, .jpdb-reader-stats-heatmap-grid');
        if (!chart || !root.contains(chart)) return [];
        return Array.from(chart.querySelectorAll<HTMLElement>(newTabActionSelector('stats-select-day', '[data-stats-day]')));
    }

    // --- per-source data loading ---

    private loadingSource<T extends StatsSourceSnapshot | StatsDashboardSnapshot['combined']>(source: T): T {
        return { ...source, status: 'loading', message: this.deps.text('statsLoading') };
    }

    private async loadJpdbSource(): Promise<StatsSourceSnapshot> {
        const providers = this.jpdbStatsApiProviders(this.deps.getSettings());
        if (!providers.length) return emptyStatsSource('jpdb', 'JPDB', this.deps.text('statsApiKeyMissing'), 'setup');
        const results = await Promise.all(providers.map(provider => loadNewTabStatsApiProvider(provider)));
        return this.jpdbSourceFromApiResults(results);
    }

    // SH-3 v2: the stats page keeps its own provider list — Anki must NOT join
    // here (it has a dedicated stats source and would double-count); the
    // My-Cards browse pool composes its own wider list on the controller.
    jpdbStatsApiProviders(settings: ReaderSettings): NewTabStatsApiProvider[] {
        const providers: NewTabStatsApiProvider[] = [];
        if (hasJpdbApiCredential(settings)) providers.push({
            label: 'JPDB',
            load: () => this.loadJpdbCards(),
        });
        return providers;
    }

    async loadJpdbCards(): Promise<JPDBCard[]> {
        try {
            return await this.deps.jpdb.listDeckCards(JPDB_ALL_DECKS, NEW_TAB_STATS_JPDB_CARD_LIMIT);
        } catch (error) {
            log.warn('JPDB deck stats fallback', error);
        }
        const decks = await this.deps.jpdb.listDecks();
        const groups = await Promise.all(decks.slice(0, JPDB_DECK_SAMPLE_LIMIT).map(deck =>
            this.deps.jpdb.listDeckCards(deck.id, Math.ceil(NEW_TAB_STATS_JPDB_CARD_LIMIT / JPDB_DECK_SAMPLE_LIMIT)).catch((): JPDBCard[] => []),
        ));
        return dedupeWords(groups.flat()).slice(0, NEW_TAB_STATS_JPDB_CARD_LIMIT);
    }

    private jpdbSourceFromApiResults(results: NewTabStatsApiProviderResult[]): StatsSourceSnapshot {
        const loaded = results.filter(result => result.error === null);
        const label = orderedNewTabStatsProviderLabel(loaded.length ? loaded : results);
        if (!loaded.length) {
            const error = results.find(result => result.error)?.error;
            return emptyStatsSource('jpdb', label, error instanceof Error ? error.message : this.deps.text('couldNotLoadWords'), 'error');
        }
        const cards = dedupeWords(loaded.flatMap(result => result.cards)).slice(0, NEW_TAB_STATS_JPDB_CARD_LIMIT);
        const message = this.apiLoadedMessage(label, cards.length);
        return statsFromApiCards(cards, label, message);
    }

    private apiLoadedMessage(label: string, cardCount: number): string {
        if (!cardCount) return this.deps.text('statsNoData');
        if (label === 'JPDB') return this.deps.text('statsJpdbLoaded');
        if (label === 'Jiten') return this.deps.text('statsJitenLoaded');
        return this.deps.formatText('statsApiLoaded', { providers: label });
    }

    private async loadJitenSource(): Promise<StatsSourceSnapshot> {
        const settings = this.deps.getSettings();
        const jiten = this.deps.jiten;
        if (!hasJitenApiCredential(settings) || typeof jiten?.listStudyBatchCards !== 'function') {
            return emptyStatsSource('jiten', 'Jiten', this.deps.text('statsApiKeyMissing'), 'setup');
        }
        try {
            const [cards, reviews] = await Promise.all([
                jiten.listStudyBatchCards(NEW_TAB_STATS_JPDB_CARD_LIMIT),
                this.loadJitenRecentReviews().catch(error => {
                    log.warn('Jiten review history failed', error);
                    return [];
                }),
            ]);
            const source = statsFromJitenCards(cards, this.apiLoadedMessage('Jiten', cards.length));
            return applyJitenReviewHistory(source, reviews);
        } catch (error) {
            log.warn('Jiten stats failed', error);
            return emptyStatsSource('jiten', 'Jiten', error instanceof Error ? error.message : this.deps.text('couldNotLoadWords'), 'error');
        }
    }

    private async loadJitenRecentReviews(): Promise<Array<{ rating: number; reviewDateTime: string; reviewDuration: number | null }>> {
        const jiten = this.deps.jiten;
        if (typeof jiten?.listRecentReviews !== 'function') return [];
        return (await jiten.listRecentReviews(NEW_TAB_STATS_JITEN_HISTORY_LIMIT)).map(review => ({
            rating: review.rating,
            reviewDateTime: review.reviewDateTime,
            reviewDuration: review.reviewDuration,
        }));
    }

    private async loadSrsAdapterSource(source: NewTabSrsAdapterSource): Promise<StatsSourceSnapshot> {
        const adapter = this.deps.srsAdapters?.[source];
        const label = adapter?.label || NEW_TAB_SOURCE_LABELS[source];
        if (!adapter || !adapter.hasCredential()) {
            return emptyStatsSource(source, label, source === 'yomu-local' ? this.deps.text('statsNoData') : this.deps.text('statsApiKeyMissing'), 'setup');
        }
        try {
            const [stats, queue] = await Promise.all([
                adapter.stats(),
                adapter.queue(NEW_TAB_STATS_JPDB_CARD_LIMIT),
            ]);
            const cards = queue.cards
                .map((card: YomuSrsReviewable) => this.deps.srsReviewableToNewTabCard(card))
                .filter((card): card is JPDBCard => card !== null);
            const snapshot = statsFromApiCards(cards, label, this.apiLoadedMessage(label, cards.length), source);
            return {
                ...snapshot,
                message: cards.length || stats.reviewsDue || stats.reviewsToday ? snapshot.message : this.deps.text('statsNoData'),
                reviewsToday: stats.reviewsToday ?? snapshot.reviewsToday,
                cards: {
                    ...snapshot.cards,
                    due: stats.reviewsDue ?? snapshot.cards.due,
                },
                updatedAt: stats.fetchedAt,
            };
        } catch (error) {
            log.warn(`${label} stats failed`, error);
            return emptyStatsSource(source, label, error instanceof Error ? error.message : this.deps.text('couldNotLoadWords'), 'error');
        }
    }

    private async loadAnkiSource(): Promise<StatsSourceSnapshot> {
        if (!this.shouldLoadAnki(this.deps.getSettings())) {
            return emptyStatsSource('anki', 'Anki', this.deps.text('statsConnectAnki'), 'setup');
        }
        try {
            return await loadAnkiConnectStats({
                invoke: (action, params) => this.deps.anki.invoke(action, params),
            }, {
                disabledDeckNames: [...this.disabledAnkiDecks],
            });
        } catch (error) {
            log.warn('Anki stats failed', error);
            return emptyStatsSource('anki', 'Anki', this.deps.text('statsAnkiUnavailable'), 'error');
        }
    }

    private shouldLoadAnki(settings: ReaderSettings): boolean {
        return settings.ankiEnabled || settings.newTabAnkiEnabled;
    }

    // --- Anki connect + deck toggles ---

    private async connectAnki(root: HTMLElement): Promise<void> {
        try {
            await this.deps.anki.requestPermission();
        } catch (error) {
            log.warn('Anki permission request failed', error);
            this.snapshot = {
                ...this.snapshot,
                anki: emptyStatsSource('anki', 'Anki', this.deps.text('statsAnkiUnavailable'), 'error'),
            };
            this.snapshot.combined = combineStatsSources(this.snapshot.jpdb, this.snapshot.jiten, this.snapshot.yomuLocal, this.snapshot.bunpro, this.snapshot.wanikani, this.snapshot.anki);
            this.render(root);
            return;
        }
        this.loaded = false;
        await this.loadInto(root, true);
    }

    private toggleAnkiDeck(root: HTMLElement, target: HTMLElement): void {
        const deck = target.closest<HTMLElement>('[data-stats-anki-deck]')?.dataset.statsAnkiDeck;
        if (!deck) return;
        if (!this.hasDeckPrefsFor(this.deps.ankiProviderContext())) {
            void this.loadDeckPrefs().then(() => this.toggleAnkiDeck(root, target));
            return;
        }
        this.disabledAnkiDecks = setWithToggledValue(this.disabledAnkiDecks, deck);
        this.applyAnkiDeckToggles(root);
        void this.saveDeckPrefs().catch(error => {
            log.warn('Anki stats deck preference save failed', error);
        });
        this.loaded = false;
        void this.loadInto(root, true);
    }

    private applyAnkiDeckToggles(root: HTMLElement): void {
        const anki = this.snapshot.anki;
        if (!anki.deckNames?.length) return;
        const activeDeckNames = anki.deckNames.filter(deck => !this.disabledAnkiDecks.has(deck));
        const nextAnki: StatsSourceSnapshot = {
            ...anki,
            status: 'ready',
            message: this.ankiDeckSelectionMessage(activeDeckNames.length, anki.deckNames.length),
            activeDeckNames,
        };
        this.snapshot = {
            ...this.snapshot,
            anki: nextAnki,
            combined: combineStatsSources(this.snapshot.jpdb, this.snapshot.jiten, this.snapshot.yomuLocal, this.snapshot.bunpro, this.snapshot.wanikani, nextAnki),
        };
        this.render(root);
    }

    private ankiDeckSelectionMessage(activeDeckCount: number, totalDeckCount: number): string {
        if (!totalDeckCount) return this.deps.text('statsAnkiConnected');
        if (!activeDeckCount) return this.deps.formatText('statsAnkiNoDecksSelected', { total: String(totalDeckCount) });
        if (activeDeckCount === totalDeckCount) {
            return this.deps.formatText('statsAnkiDecksSelected', {
                count: String(totalDeckCount),
                plural: totalDeckCount === 1 ? '' : 's',
            });
        }
        return this.deps.formatText('statsAnkiPartialDecksSelected', {
            count: String(activeDeckCount),
            total: String(totalDeckCount),
        });
    }

    // --- JPDB review-history import ---

    async importJpdbFile(root: HTMLElement, file: File): Promise<void> {
        try {
            const imported = parseJpdbReviewExportText(await file.text());
            await gmStorageSet(NEW_TAB_STATS_JPDB_HISTORY_KEY, imported);
            const jpdb = applyJpdbReviewImport({
                ...this.snapshot.jpdb,
                message: this.deps.text('statsImportReady'),
                status: this.snapshot.jpdb.status === 'ready' ? 'ready' : 'partial',
            }, imported);
            this.snapshot = {
                jpdb,
                jiten: this.snapshot.jiten,
                bunpro: this.snapshot.bunpro,
                wanikani: this.snapshot.wanikani,
                yomuLocal: this.snapshot.yomuLocal,
                anki: this.snapshot.anki,
                combined: combineStatsSources(jpdb, this.snapshot.jiten, this.snapshot.yomuLocal, this.snapshot.bunpro, this.snapshot.wanikani, this.snapshot.anki),
            };
            this.selectedSource = this.selectedSource === 'anki' ? 'combined' : this.selectedSource;
            this.loaded = true;
        } catch (error) {
            log.warn('JPDB stats import failed', error);
            this.snapshot = {
                ...this.snapshot,
                jpdb: {
                    ...this.snapshot.jpdb,
                    status: 'error',
                    message: this.deps.text('statsImportFailed'),
                },
            };
            this.snapshot.combined = combineStatsSources(this.snapshot.jpdb, this.snapshot.jiten, this.snapshot.yomuLocal, this.snapshot.bunpro, this.snapshot.wanikani, this.snapshot.anki);
        }
        this.render(root);
    }

    private async readJpdbHistory(): Promise<JpdbReviewImport | null> {
        try {
            const value = await gmStorageGet<JpdbReviewImport | null>(NEW_TAB_STATS_JPDB_HISTORY_KEY, null);
            return value && Array.isArray(value.daily) ? value : null;
        } catch {
            return null;
        }
    }

    private async loadDeckPrefs(): Promise<void> {
        const context = this.deps.ankiProviderContext();
        if (this.hasDeckPrefsFor(context)) return;
        const disabled = await this.readDeckPrefs(context);
        if (!this.isCurrentDeckPrefsContext(context)) return;
        this.disabledAnkiDecks = disabled;
        this.deckPrefsContext = context;
        this.deckPrefsLoaded = true;
    }

    private async readDeckPrefs(context: string): Promise<Set<string>> {
        try {
            const stored = await gmStorageGet<StoredAnkiDeckPreferences | string[]>(NEW_TAB_STATS_DISABLED_ANKI_DECKS_KEY, []);
            return new Set(storedAnkiDecksForContext(stored, context));
        } catch {
            return new Set();
        }
    }

    private hasDeckPrefsFor(context: string): boolean {
        return this.deckPrefsLoaded && this.deckPrefsContext === context;
    }

    private isCurrentDeckPrefsContext(context: string): boolean {
        return context === this.deps.ankiProviderContext();
    }

    private async saveDeckPrefs(): Promise<void> {
        const context = this.deps.ankiProviderContext();
        const disabledDecks = [...this.disabledAnkiDecks];
        const stored = await gmStorageGet<StoredAnkiDeckPreferences | string[]>(NEW_TAB_STATS_DISABLED_ANKI_DECKS_KEY, []);
        const accounts = !Array.isArray(stored) && stored?.version === 2 ? { ...stored.accounts } : {};
        accounts[context] = disabledDecks;
        await gmStorageSet(NEW_TAB_STATS_DISABLED_ANKI_DECKS_KEY, { version: 2, accounts } satisfies StoredAnkiDeckPreferences);
    }
}

function storedAnkiDecksForContext(stored: StoredAnkiDeckPreferences | string[], context: string): string[] {
    if (Array.isArray(stored)) return [];
    const disabled = stored.version === 2 ? stored.accounts[context] : [];
    return Array.isArray(disabled) ? disabled.filter(isString) : [];
}

function setWithToggledValue(values: ReadonlySet<string>, value: string): Set<string> {
    const next = new Set(values);
    if (!next.delete(value)) next.add(value);
    return next;
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}
