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

async function loadAcademyStats(repository: LocalYomuSrsRepository): Promise<HTMLElement> {
    const controller = newTabApiSourceController(
        { ...DEFAULT_SETTINGS, apiKey: '', learningTargetChosen: true, yomuLocalSrsEnabled: true },
        { srsAdapters: { 'yomu-local': createYomuLocalSrsAdapter(repository) } },
    );
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
