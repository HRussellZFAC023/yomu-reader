import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewTabStatsController, type NewTabStatsControllerDeps } from '../../src/reader/newtab/stats-controller';
import { gmStorageGet, gmStorageSet } from '../../src/reader/app/storage';
import { newTabCardFromSrsReviewable } from '../../src/reader/newtab/srs-card-adapter';
import { NEW_TAB_STATS_JPDB_HISTORY_KEY } from '../../src/reader/newtab/controller-config';
import type { JpdbReviewImport } from '../../src/reader/app/stats';
import type { YomuSrsReviewable, YomuSrsStatsSnapshot } from '../../src/reader/srs/types';
import { testEnSettings } from './helpers/settings-fixture';

vi.mock('../../src/reader/app/storage', async importOriginal => ({
    ...await importOriginal<typeof import('../../src/reader/app/storage')>(),
    gmStorageGet: vi.fn(async (_key: string, fallback: unknown) => fallback),
    gmStorageSet: vi.fn(async () => undefined),
}));

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

function statsSnapshot(): YomuSrsStatsSnapshot {
    return { providerId: 'yomu-local', fetchedAt: Date.now(), reviewsDue: 0, reviewsToday: 0 };
}

const reviewable: YomuSrsReviewable = {
    providerId: 'yomu-local', providerCardId: '1', kind: 'vocabulary',
    expression: '読む', reading: 'よむ', state: ['new'],
    meanings: [{ glosses: ['to read'], partOfSpeech: [] }], dueAt: Date.now() + 86_400_000,
};

function fixture(shadow = false) {
    const host = document.createElement('div');
    document.body.append(host);
    const surface = shadow ? host.attachShadow({ mode: 'open' }) : host;
    const root = document.createElement('div');
    root.innerHTML = '<div data-newtab-study></div>';
    surface.append(root);
    const stats = vi.fn(async () => statsSnapshot());
    const collection = vi.fn(async (): Promise<YomuSrsReviewable[]> => []);
    const deps: NewTabStatsControllerDeps = {
        getSettings: () => ({ ...testEnSettings(), ankiEnabled: false }),
        ankiProviderContext: () => 'fixture',
        jpdb: { listDeckCards: vi.fn(async () => []), listDecks: vi.fn(async () => []) },
        anki: { invoke: vi.fn(async () => { throw new Error('Anki is disabled'); }), requestPermission: vi.fn(async () => undefined) },
        srsAdapters: { 'yomu-local': {
            label: 'Local', hasCredential: () => true, stats, collection,
            queue: vi.fn(async () => ({ providerId: 'yomu-local' as const, fetchedAt: 0, cards: [], dueCount: 0, newCount: 0, reviewCount: 0 })),
            review: vi.fn(async () => ({})),
        } },
        srsReviewableToNewTabCard: newTabCardFromSrsReviewable,
        canUseBunproSource: () => false, canUseWanikaniSource: () => false, canUseYomuLocalSource: () => true,
        text: key => key, formatText: key => key, resolvedLanguage: () => 'en',
        syncMode: vi.fn(), syncThemeToggle: vi.fn(), showSettings: vi.fn(), openSavedWords: vi.fn(),
        hasCoarsePointer: () => false, statsVisible: () => true, studyTroubleCards: vi.fn(),
    };
    return { controller: new NewTabStatsController(deps), root, surface, stats, collection };
}

function button(root: HTMLElement, selector: string): HTMLButtonElement {
    const element = root.querySelector<HTMLButtonElement>(selector);
    expect(element).not.toBeNull();
    return element!;
}

beforeEach(() => { vi.mocked(gmStorageGet).mockImplementation(async (_key, fallback) => fallback); });
afterEach(() => { document.body.replaceChildren(); vi.clearAllMocks(); });

describe('Stats loading and keyboard continuity', () => {
    it('keeps a quiet empty surface while the first load waits, and ignores repeated refresh taps', async () => {
        const { controller, root, stats } = fixture();
        const waiting = deferred<YomuSrsStatsSnapshot>();
        stats.mockReturnValueOnce(waiting.promise);
        const first = controller.loadInto(root);
        const second = controller.loadInto(root);
        await vi.waitFor(() => expect(stats).toHaveBeenCalledTimes(1));
        const refresh = button(root, '.jpdb-reader-stats-refresh');
        controller.handleClick(root, refresh, new MouseEvent('click'), 'stats-refresh');
        controller.handleClick(root, refresh, new MouseEvent('click'), 'stats-refresh');
        expect(root.querySelector('.jpdb-reader-stats-bars')).toBeNull();
        expect(root.querySelector('.jpdb-reader-stats-metrics')).toBeNull();
        expect(root.querySelector('.jpdb-reader-stats-empty')?.textContent).toContain('statsLoading');
        expect(refresh.getAttribute('aria-disabled')).toBe('true');
        waiting.resolve(statsSnapshot());
        await Promise.all([first, second]);
        expect(stats).toHaveBeenCalledTimes(1);
        expect(root.querySelector('.jpdb-reader-stats-empty')?.textContent).toContain('statsEmptyHelp');
        expect(root.querySelector('.jpdb-reader-stats')?.getAttribute('aria-busy')).toBe('false');
    });

    it('retains populated statistics and the actual refresh button while reloading, then restores its focus', async () => {
        const { controller, root, stats, collection } = fixture();
        collection.mockResolvedValue([reviewable]);
        await controller.loadInto(root);
        const refresh = button(root, '.jpdb-reader-stats-refresh');
        const chart = root.querySelector('.jpdb-reader-stats-panel');
        expect(chart, root.textContent ?? '').not.toBeNull();
        refresh.focus();
        const waiting = deferred<YomuSrsStatsSnapshot>();
        stats.mockReturnValueOnce(waiting.promise);
        const load = controller.loadInto(root, true);
        expect(root.querySelector('.jpdb-reader-stats-panel')).toBe(chart);
        expect(root.querySelector('.jpdb-reader-stats-refresh')).toBe(refresh);
        expect(document.activeElement).toBe(refresh);
        waiting.resolve(statsSnapshot());
        await load;
        expect(document.activeElement).toBe(root.querySelector('.jpdb-reader-stats-refresh'));
    });

    it.each([false, true])('keeps keyboard focus across chart choices in a shadow surface: %s', async shadow => {
        const { controller, root, surface } = fixture(shadow);
        const history: JpdbReviewImport = {
            importedAt: Date.now(), cardCount: 1,
            daily: [{ date: new Date().toISOString().slice(0, 10), reviews: 3, correct: 2, failed: 1, newCards: 1, minutes: 2 }],
        };
        vi.mocked(gmStorageGet).mockImplementation(async (key, fallback) => key === NEW_TAB_STATS_JPDB_HISTORY_KEY ? history : fallback);
        await controller.loadInto(root);
        for (const [selector, action] of [
            ['[data-stats-activity-metric="minutes"]', 'stats-activity-metric'],
            ['[data-newtab-action="stats-activity-view"]', 'stats-activity-view'],
            ['[data-stats-day]', 'stats-select-day'],
        ] as const) {
            const target = button(root, selector);
            const date = target.dataset.statsDay;
            target.focus();
            controller.handleClick(root, target, new MouseEvent('click'), action);
            const expected = date ? root.querySelector(`[data-stats-day="${date}"]`) : root.querySelector(selector);
            expect(surface instanceof ShadowRoot ? surface.activeElement : document.activeElement).toBe(expected);
        }
    });

    it('does not pull focus back after the learner moves to a different control during a refresh', async () => {
        const { controller, root, stats } = fixture();
        await controller.loadInto(root);
        button(root, '.jpdb-reader-stats-refresh').focus();
        const waiting = deferred<YomuSrsStatsSnapshot>();
        stats.mockReturnValueOnce(waiting.promise);
        const load = controller.loadInto(root, true);
        const outside = document.createElement('input');
        document.body.append(outside);
        outside.focus();
        waiting.resolve(statsSnapshot());
        await load;
        expect(document.activeElement).toBe(outside);
    });

    it('cancels a stale load before provider requests when reset happens during preference loading', async () => {
        const waiting = deferred<string[]>();
        vi.mocked(gmStorageGet).mockReturnValueOnce(waiting.promise);
        const { controller, root, stats } = fixture();
        const old = controller.loadInto(root);
        controller.resetProviderContext();
        await controller.loadInto(root);
        waiting.resolve([]);
        await old;
        expect(stats).toHaveBeenCalledTimes(1);
        expect(root.querySelector('.jpdb-reader-stats')?.getAttribute('aria-busy')).toBe('false');
    });

    it('does not persist a superseded import whose file finishes reading after a provider reset', async () => {
        const { controller, root } = fixture();
        await controller.loadInto(root);
        const waiting = deferred<string>();
        const file = new File([], 'history.json', { type: 'application/json' });
        Object.defineProperty(file, 'text', { value: () => waiting.promise });
        const importing = controller.importJpdbFile(root, file);
        controller.resetProviderContext();
        await controller.loadInto(root);
        waiting.resolve(JSON.stringify({ cards_vocabulary_jp_en: [{ reviews: [{ timestamp: new Date().toISOString(), grade: 'okay' }] }] }));
        await importing;
        expect(gmStorageSet).not.toHaveBeenCalled();
        expect(root.querySelector('.jpdb-reader-stats-bars')).toBeNull();
        expect(root.querySelector('.jpdb-reader-stats')?.getAttribute('aria-busy')).toBe('false');
    });

    it('keeps an imported review history when an earlier refresh finishes later', async () => {
        const { controller, root, stats } = fixture();
        await controller.loadInto(root);
        const waiting = deferred<YomuSrsStatsSnapshot>();
        stats.mockReturnValueOnce(waiting.promise);
        const older = controller.loadInto(root, true);
        await vi.waitFor(() => expect(stats).toHaveBeenCalledTimes(2));
        const file = new File([], 'history.json', { type: 'application/json' });
        Object.defineProperty(file, 'text', { value: async () => JSON.stringify({
            cards_vocabulary_jp_en: [{ reviews: [{ timestamp: new Date().toISOString(), grade: 'okay', time_spent_ms: 3000 }] }],
        }) });
        await controller.importJpdbFile(root, file);
        expect(root.querySelector('.jpdb-reader-stats-bars')).not.toBeNull();
        waiting.resolve(statsSnapshot());
        await older;
        controller.render(root);
        expect(root.querySelector('.jpdb-reader-stats-bars')).not.toBeNull();
        const today = new Date().toISOString().slice(0, 10);
        expect(root.querySelector(`[data-stats-day="${today}"]`)?.getAttribute('aria-label')).toContain('statsActivityReviews: 1');
    });

    it.each(['old-first', 'new-first'])('keeps the newest forced load for completion order %s', async order => {
        const { controller, root, stats, collection } = fixture();
        collection.mockResolvedValue([reviewable]);
        await controller.loadInto(root);
        const oldData = deferred<YomuSrsStatsSnapshot>();
        const newData = deferred<YomuSrsStatsSnapshot>();
        stats.mockReturnValueOnce(oldData.promise).mockReturnValueOnce(newData.promise);
        const older = controller.loadInto(root, true);
        await vi.waitFor(() => expect(stats).toHaveBeenCalledTimes(2));
        const newer = controller.loadInto(root, true);
        await vi.waitFor(() => expect(stats).toHaveBeenCalledTimes(3));
        if (order === 'old-first') {
            oldData.resolve({ ...statsSnapshot(), reviewsDue: 5 });
            await older;
            expect(root.querySelector('.jpdb-reader-stats')?.getAttribute('aria-busy')).toBe('true');
        }
        newData.resolve({ ...statsSnapshot(), reviewsDue: 1 });
        await newer;
        const currentText = root.textContent;
        if (order === 'new-first') {
            oldData.resolve({ ...statsSnapshot(), reviewsDue: 5 });
            await older;
        }
        controller.render(root);
        expect(root.textContent).toBe(currentText);
        expect(root.querySelector('.jpdb-reader-stats')?.getAttribute('aria-busy')).toBe('false');
    });
});
