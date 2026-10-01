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

function libraryAddToReview(root: HTMLElement, expression: string): HTMLButtonElement | null {
    return [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-item')]
        .find(row => row.querySelector(`[data-expression="${expression}"]`))
        ?.querySelector<HTMLButtonElement>('[data-newtab-action="browse-start-review"]') ?? null;
}

function academyStatsController(repository: LocalYomuSrsRepository, interfaceLanguage: 'en' | 'ja' = 'en') {
    return newTabApiSourceController(
        { ...DEFAULT_SETTINGS, apiKey: '', interfaceLanguage, learningTargetChosen: true, yomuLocalSrsEnabled: true },
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
        addToReview.click();
        await vi.waitFor(() => expect(libraryAddToReview(root, '読む')).toBeNull());
        expect(libraryAddToReview(root, '書く')).not.toBeNull();

        root.querySelector<HTMLButtonElement>('.jpdb-reader-newtab-mode [data-newtab-action="mode"][data-mode="stats"]')!.click();
        await vi.waitFor(() => expect(metric(root, 'Cards')).toBe('1'));
        expect(metric(root, 'Saved')).toBe('1');
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

it('labels the Saved tile in Japanese', async () => {
    setActiveLearningTargetLanguage('ja');
    const repository = new LocalYomuSrsRepository();
    await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });

    const root = await loadAcademyStats(repository, 'ja');
    expect(metric(root, '保存済み')).toBe('1');
    expect(savedTile(root)?.textContent).toContain('単語帳で復習に追加できます');
    expect(root.textContent).not.toContain('未翻訳');
    expect(root.textContent).not.toContain('Add to review in Library');
});
