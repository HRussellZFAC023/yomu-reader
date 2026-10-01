import { afterEach, expect, it, vi } from 'vitest';
import { LocalYomuSrsRepository, createYomuLocalSrsAdapter } from '../../src/reader/srs/local-yomu';
import { canonicalStudyCardKey } from '../../src/reader/srs/shared';
import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../src/reader/languages/active';
import { DEFAULT_SETTINGS, newTabApiSourceController, renderEnabledNewTabRoot, renderLoadedApiStats } from './new-tab-review/fixtures';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); localStorage.clear(); sessionStorage.clear(); resetActiveLearningTargetLanguage(); });

function metric(root: HTMLElement, label: string): string {
    const tile = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-stats-metric')]
        .find(candidate => candidate.querySelector('.jpdb-reader-stats-metric-label')?.textContent === label);
    return tile?.querySelector('strong')?.textContent ?? '';
}

function savedTile(root: HTMLElement): HTMLButtonElement | null {
    return root.querySelector<HTMLButtonElement>('.jpdb-reader-stats-metric-link');
}

function libraryRow(root: HTMLElement, expression: string): HTMLElement | undefined {
    return [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-item')]
        .find(row => row.querySelector(`[data-expression="${expression}"]`));
}

function libraryAddToReview(root: HTMLElement, expression: string): HTMLButtonElement | null {
    return libraryRow(root, expression)?.querySelector<HTMLButtonElement>('[data-newtab-action="browse-start-review"]') ?? null;
}

function libraryState(root: HTMLElement, expression: string): string {
    return libraryRow(root, expression)?.querySelector('.jpdb-reader-newtab-browse-state')?.textContent?.trim() ?? '';
}

function pressedChips(root: HTMLElement): string[] {
    return [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-chip[aria-pressed="true"]')].map(chip => chip.textContent ?? '');
}

function openView(root: HTMLElement, mode: 'word' | 'search' | 'stats'): void {
    root.querySelector<HTMLButtonElement>(`.jpdb-reader-newtab-mode [data-newtab-action="mode"][data-mode="${mode}"]`)!.click();
}

function academyStatsController(repository: LocalYomuSrsRepository, interfaceLanguage: 'en' | 'ja' = 'en', yomuLocalSrsEnabled = true) {
    return newTabApiSourceController(
        { ...DEFAULT_SETTINGS, apiKey: '', interfaceLanguage, learningTargetChosen: true, yomuLocalSrsEnabled },
        { srsAdapters: { 'yomu-local': createYomuLocalSrsAdapter(repository) } },
    );
}

async function loadAcademyStats(repository: LocalYomuSrsRepository, interfaceLanguage: 'en' | 'ja' = 'en'): Promise<HTMLElement> {
    const controller = academyStatsController(repository, interfaceLanguage);
    try {
        return await renderLoadedApiStats(controller);
    } finally { controller.destroy(); }
}

// Stats describes review work, so "Cards" counts every word in review, due or
// not. A saved word waits in Library for "Add to review" and joins it then.
it('counts every Academy card in review, not only the due queue', async () => {
    setActiveLearningTargetLanguage('ja');
    const repository = new LocalYomuSrsRepository();
    const read = await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
    await repository.review({ card: read.card!, grade: 'good' });
    await repository.mine({ expression: '書く', reading: 'かく', meaning: 'to write' });

    const reviewed = await loadAcademyStats(repository);
    expect(metric(reviewed, 'Due now')).toBe('0');
    expect(metric(reviewed, 'Cards')).toBe('1');
    expect(reviewed.querySelector('.jpdb-reader-stats-legend')?.textContent).toBe('Learning 1');

    await repository.startReview(canonicalStudyCardKey('書く', 'かく'));
    document.body.replaceChildren();
    const added = await loadAcademyStats(repository);
    expect(metric(added, 'Due now')).toBe('1');
    expect(metric(added, 'Cards')).toBe('2');
    const legend = [...added.querySelectorAll('.jpdb-reader-stats-legend span')].map(item => item.textContent);
    expect(legend).toEqual(expect.arrayContaining(['New 1', 'Learning 1']));
});

// A slow Stats load must not paint over the view the learner moved to.
it('keeps a late Stats load from replacing Library after the learner leaves Stats', async () => {
    setActiveLearningTargetLanguage('ja');
    const repository = new LocalYomuSrsRepository();
    await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
    const adapter = createYomuLocalSrsAdapter(repository);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const controller = newTabApiSourceController(
        { ...DEFAULT_SETTINGS, apiKey: '', learningTargetChosen: true, yomuLocalSrsEnabled: true },
        { srsAdapters: { 'yomu-local': {
            ...adapter,
            stats: async () => { await gate; return adapter.stats(); },
            queue: async (...args: Parameters<typeof adapter.queue>) => { await gate; return adapter.queue(...args); },
            collection: async (...args: Parameters<NonNullable<typeof adapter.collection>>) => { await gate; return adapter.collection!(...args); },
        } } },
    );
    try {
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const internals = controller as unknown as {
            state: { route: string };
            loadStatsInto(root: HTMLElement, force?: boolean): Promise<void>;
        };
        internals.state.route = 'stats';
        const loading = internals.loadStatsInto(root, true);
        // The loading dashboard is up; the Academy data is still on its way.
        await vi.waitFor(() => expect(root.querySelector('.jpdb-reader-stats-metric')).not.toBeNull());
        // The learner opens Library, which paints into the same surface.
        internals.state.route = 'search';
        const surface = root.querySelector<HTMLElement>('[data-newtab-study]')!;
        surface.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Library' }));
        release();
        await loading;
        expect(surface.textContent).toBe('Library');
    } finally { controller.destroy(); }
});

// Saved words are not review work, so they are not "Cards", but Stats still
// says how many wait in Library: one "Saved" tile, only when there are some.
it('counts saved words in a Saved tile, shown only when there are any', async () => {
    setActiveLearningTargetLanguage('ja');
    const repository = new LocalYomuSrsRepository();
    const read = await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
    await repository.review({ card: read.card!, grade: 'good' });

    const none = await loadAcademyStats(repository);
    expect(metric(none, 'Cards')).toBe('1');
    expect(savedTile(none)).toBeNull();
    expect(metric(none, 'Saved')).toBe('');

    await repository.mine({ expression: '書く', reading: 'かく', meaning: 'to write' });
    await repository.mine({ expression: '見る', reading: 'みる', meaning: 'to see' });
    document.body.replaceChildren();
    const saved = await loadAcademyStats(repository);
    expect(metric(saved, 'Saved')).toBe('2');
    expect(metric(saved, 'Cards')).toBe('1');
    expect(savedTile(saved)?.textContent).toContain('Add to review in Library');
    // Saved words are not a stage of review, so the distribution leaves them out.
    expect(saved.querySelector('.jpdb-reader-stats-legend')?.textContent).toBe('Learning 1');
});

// The tile is the way to those words. Adding one to review there makes it a
// card, and Stats shows that the next time the learner opens it.
it('opens Library from the Saved tile, and Add to review moves the word to Cards', async () => {
    setActiveLearningTargetLanguage('ja');
    const repository = new LocalYomuSrsRepository();
    await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
    await repository.mine({ expression: '書く', reading: 'かく', meaning: 'to write' });
    const controller = academyStatsController(repository);
    try {
        const root = await renderLoadedApiStats(controller);
        expect(metric(root, 'Saved')).toBe('2');
        expect(metric(root, 'Cards')).toBe('0');
        const tile = savedTile(root)!;
        // A native button: Tab reaches it, and Enter or Space opens Library.
        expect(tile.tagName).toBe('BUTTON');
        expect(tile.type).toBe('button');

        tile.click();
        const addToReview = await vi.waitFor(() => {
            const button = libraryAddToReview(root, '読む');
            expect(button).not.toBeNull();
            return button!;
        });
        expect(root.classList.contains('jpdb-reader-newtab-search-mode')).toBe(true);
        // Library names the words as Stats did, and shows Academy's words.
        expect([libraryState(root, '読む'), libraryState(root, '書く')]).toEqual(['Saved', 'Saved']);
        expect(pressedChips(root)).toEqual(['Academy 2', 'Saved 2']);
        addToReview.click();
        await vi.waitFor(() => expect(libraryAddToReview(root, '読む')).toBeNull());
        expect(libraryAddToReview(root, '書く')).not.toBeNull();

        openView(root, 'stats');
        await vi.waitFor(() => expect(metric(root, 'Cards')).toBe('1'));
        expect(metric(root, 'Saved')).toBe('1');
    } finally { controller.destroy(); }
});

/**
 * Stats loaded with one saved Academy word (読む) while `saveMore` saves 書く:
 * Stats must count it, and its Saved tile open Library on both words.
 */
async function savedWordReachesStats(saveMore: (root: HTMLElement, controller: ReturnType<typeof academyStatsController>, repository: LocalYomuSrsRepository) => Promise<number>): Promise<void> {
    setActiveLearningTargetLanguage('ja');
    const repository = new LocalYomuSrsRepository();
    await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
    const controller = academyStatsController(repository);
    try {
        const root = await renderLoadedApiStats(controller);
        expect(metric(root, 'Saved')).toBe('1');
        const saved = await saveMore(root, controller, repository);
        await vi.waitFor(() => expect(metric(root, 'Saved')).toBe(String(saved)));
        savedTile(root)!.click();
        await vi.waitFor(() => expect(libraryAddToReview(root, '書く')).not.toBeNull());
        expect(libraryAddToReview(root, '読む')).not.toBeNull();
    } finally { controller.destroy(); }
}

// "Add to deck +" in Study's lookup popup saves to Academy after Stats and the
// Library its tile opens have loaded: both must count the new word.
it('counts a word saved from the Study lookup popup in Stats and the Library the tile opens', () => savedWordReachesStats(async (root, controller, repository) => {
    savedTile(root)!.click();
    await vi.waitFor(() => expect(libraryAddToReview(root, '読む')).not.toBeNull());
    openView(root, 'word');

    // The popup's save, then the card-changed notice the Study runtime passes on.
    await repository.mine({ expression: '書く', reading: 'かく', meaning: 'to write' });
    controller.refreshBrowseAfterCardMutation();
    openView(root, 'stats');
    await vi.waitFor(() => expect(metric(root, 'Saved')).toBe('2'));
    // A save that lands while Stats is open (a grade still being written,
    // say) shows there at once, and does not leave Stats loading.
    await repository.mine({ expression: '見る', reading: 'みる', meaning: 'to see' });
    return 3;
}));

// Reading in one tab with Study open in another: a save there reaches this
// tab only as a change to the shared deck, not through this tab's own signal.
it('counts a word saved in another tab in Stats and the Library the tile opens', () => savedWordReachesStats(async () => {
    vi.resetModules();
    const otherTab = await import('../../src/reader/srs/local-yomu');
    await new otherTab.LocalYomuSrsRepository().mine({ expression: '書く', reading: 'かく', meaning: 'to write' });
    const index = 'yomu:srs-local:v2:index';
    window.dispatchEvent(new StorageEvent('storage', { key: index, newValue: localStorage.getItem(index), storageArea: localStorage }));
    return 2;
}));

// With "Enable Academy" off, Library cannot list Academy words, so Stats must
// not count them either: a Saved tile would lead to an empty Library.
it('leaves Academy out of Stats while Academy is turned off', async () => {
    setActiveLearningTargetLanguage('ja');
    const repository = new LocalYomuSrsRepository();
    const read = await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
    await repository.review({ card: read.card!, grade: 'good' });
    await repository.mine({ expression: '書く', reading: 'かく', meaning: 'to write' });
    await repository.mine({ expression: '見る', reading: 'みる', meaning: 'to see' });
    const controller = academyStatsController(repository, 'en', false);
    try {
        const root = await renderLoadedApiStats(controller);
        expect(savedTile(root)).toBeNull();
        expect(metric(root, 'Saved')).toBe('');
        expect(metric(root, 'Cards')).toBe('0');
        // Library, which the tile would open, lists no Academy words: it is the bare dictionary search.
        openView(root, 'search');
        await vi.waitFor(() => expect(root.querySelector('[data-newtab-search-results] .jpdb-reader-newtab-search-empty')).not.toBeNull());
        expect(root.querySelector('.jpdb-reader-newtab-browse-item')).toBeNull();
    } finally { controller.destroy(); }
});

// The tile promises the saved words, so Library must show them even when the
// learner narrowed it earlier with a state chip or a search.
it('opens Library on the saved words whatever chip or search narrowed it before', async () => {
    setActiveLearningTargetLanguage('ja');
    const repository = new LocalYomuSrsRepository();
    const read = await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
    await repository.review({ card: read.card!, grade: 'good' });
    await repository.mine({ expression: '書く', reading: 'かく', meaning: 'to write' });
    await repository.mine({ expression: '見る', reading: 'みる', meaning: 'to see' });
    const controller = academyStatsController(repository);
    try {
        const root = await renderLoadedApiStats(controller);
        openView(root, 'search');
        const learning = await vi.waitFor(() => {
            const chip = root.querySelector<HTMLButtonElement>('[data-newtab-action="browse-filter"][data-browse-filter="learning"]');
            expect(chip).not.toBeNull();
            return chip!;
        });
        learning.click();
        await vi.waitFor(() => expect(libraryAddToReview(root, '書く')).toBeNull());
        // A search the learner left in Library, as a shared search link leaves one.
        (controller as unknown as { searchController: { setInitialQuery(query: string): void } }).searchController.setInitialQuery('読');
        openView(root, 'stats');
        await vi.waitFor(() => expect(savedTile(root)).not.toBeNull());

        savedTile(root)!.click();
        await vi.waitFor(() => {
            expect(libraryAddToReview(root, '書く')).not.toBeNull();
            expect(libraryAddToReview(root, '見る')).not.toBeNull();
        });
        expect(pressedChips(root)).toEqual(['Academy 3', 'Saved 2']);
        // The word already in review is not one the tile promised.
        expect(libraryRow(root, '読む')).toBeUndefined();
        expect(root.querySelector<HTMLInputElement>('[data-newtab-search-input]')?.value).toBe('');
    } finally { controller.destroy(); }
});

// Saved words have no due date, so in queue order they come after every
// scheduled card: past a page of those, the tile must still open on them.
it('opens Library on the saved words behind more than a page of scheduled Academy cards', async () => {
    setActiveLearningTargetLanguage('ja');
    const repository = new LocalYomuSrsRepository();
    const scheduled = Array.from({ length: 55 }, (_, index) => ({ expression: `語${index}`, reading: `ご${index}`, meanings: ['word'], dueAt: Date.now() + 86_400_000 + index }));
    await repository.importBatch({ source: 'fixture', importedAt: Date.now(), items: scheduled });
    for (const [expression, reading] of [['書く', 'かく'], ['見る', 'みる']]) await repository.mine({ expression, reading, meaning: 'saved' });
    const controller = academyStatsController(repository);
    try {
        const root = await renderLoadedApiStats(controller);
        expect([metric(root, 'Cards'), metric(root, 'Saved')]).toEqual(['55', '2']);
        savedTile(root)!.click();
        await vi.waitFor(() => expect(libraryAddToReview(root, '書く')).not.toBeNull());
        expect(libraryAddToReview(root, '見る')).not.toBeNull();
        expect(root.querySelectorAll('.jpdb-reader-newtab-browse-item')).toHaveLength(2);
        expect(pressedChips(root)).toEqual(['Academy 57', 'Saved 2']);
    } finally { controller.destroy(); }
});

// Changing the learning target while Stats is open shows the new target's
// figures straight away, not an empty dashboard waiting for a refresh.
it('reloads Stats for the new learning target while Stats is open', async () => {
    setActiveLearningTargetLanguage('ja');
    const repository = new LocalYomuSrsRepository();
    await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
    await repository.mine({ expression: 'leer', reading: 'leer', meaning: 'to read', language: 'es' });
    await repository.mine({ expression: 'ver', reading: 'ver', meaning: 'to see', language: 'es' });
    const controller = academyStatsController(repository);
    try {
        const root = await renderLoadedApiStats(controller);
        expect(metric(root, 'Saved')).toBe('1');

        setActiveLearningTargetLanguage('es');
        controller.invalidateForTargetChange();
        await vi.waitFor(() => expect(metric(root, 'Saved')).toBe('2'));
    } finally { controller.destroy(); }
});

// Study and Library read Academy for the active learning target, so Stats does
// too: "Saved" is then exactly what Library offers to add to review.
it('counts Academy words of the active learning target only', async () => {
    setActiveLearningTargetLanguage('ja');
    const repository = new LocalYomuSrsRepository();
    const write = await repository.mine({ expression: '書く', reading: 'かく', meaning: 'to write' });
    await repository.review({ card: write.card!, grade: 'good' });
    await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
    await repository.mine({ expression: 'comer', reading: 'comer', meaning: 'to eat', language: 'es' });
    await repository.startReview(canonicalStudyCardKey('comer', 'comer', { language: 'es' }));
    await repository.mine({ expression: 'leer', reading: 'leer', meaning: 'to read', language: 'es' });
    await repository.mine({ expression: 'ver', reading: 'ver', meaning: 'to see', language: 'es' });

    const japanese = await loadAcademyStats(repository);
    expect([metric(japanese, 'Due now'), metric(japanese, 'Cards'), metric(japanese, 'Saved')]).toEqual(['0', '1', '1']);

    setActiveLearningTargetLanguage('es');
    document.body.replaceChildren();
    const spanish = await loadAcademyStats(repository);
    expect([metric(spanish, 'Due now'), metric(spanish, 'Cards'), metric(spanish, 'Saved')]).toEqual(['1', '1', '2']);
});

it('labels the Saved tile, and the Library rows it opens, in Japanese', async () => {
    setActiveLearningTargetLanguage('ja');
    const repository = new LocalYomuSrsRepository();
    await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });

    const controller = academyStatsController(repository, 'ja');
    try {
        const root = await renderLoadedApiStats(controller);
        expect(metric(root, '保存済み')).toBe('1');
        expect(savedTile(root)?.textContent).toContain('単語帳で復習に追加できます');
        expect(root.textContent).not.toContain('未翻訳');
        expect(root.textContent).not.toContain('Add to review in Library');
        // Library, opened from the tile, uses the same word for these words.
        savedTile(root)!.click();
        await vi.waitFor(() => expect(libraryState(root, '読む')).toBe('保存済み'));
        expect(root.textContent).not.toContain('未翻訳');
    } finally { controller.destroy(); }
});
