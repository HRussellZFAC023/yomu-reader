import { describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    DEFAULT_SETTINGS,
    NEW_TAB_CSS,
    IMMERSION_CSS,
    NORMALIZED_NEW_TAB_CSS,
    newTabCssRule,
    immersionCssRule,
    newTabTestCard,
    stubBoundingClientRect,
    newTabPromptController,
    newTabBareController,
    renderBoundNewTabSearchRoot,
    newTabApiSourceController,
    renderLoadedApiStats,
    expectApiStatsSettingsButton,
    NewTabController,
    NEW_TAB_BROWSE_DECK_LIMIT,
    newTabSourceLoadPlan,
    parseJpdbReviewDocument,
    assessKanjiStrokes,
    rankKanjiStrokeCandidates,
    waitForExpect,
} from './fixtures';
import type {
    ImmersionKitExample,
    JPDBCard,
} from './fixtures';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';

describe('new tab review — stats, My Cards & kanji-doodle grading', () => {
    registerNewTabReviewCleanup();

    it('keeps new-tab source load fallback policy explicit', () => {
        expect(newTabSourceLoadPlan('auto', 3)).toEqual({
            kind: 'auto-review',
            primarySources: ['yomu-local', 'jpdb', 'bunpro', 'wanikani', 'anki'],
            studyFallback: { kind: 'unconfigured-auto-study' },
        });
        expect(newTabSourceLoadPlan('jpdb', 3)).toEqual({
            kind: 'explicit-source',
            primarySources: ['jpdb'],
            studyFallback: { kind: 'study-supplement', minCards: 3 },
        });
        expect(newTabSourceLoadPlan('anki', 3)).toEqual({
            kind: 'explicit-source',
            primarySources: ['anki'],
            studyFallback: { kind: 'none' },
        });
        expect(newTabSourceLoadPlan('dictionary', 3)).toEqual({
            kind: 'explicit-source',
            primarySources: ['dictionary'],
            studyFallback: { kind: 'study-supplement', minCards: 3 },
        });
        expect(newTabSourceLoadPlan('bunpro', 3)).toEqual({
            kind: 'explicit-source',
            primarySources: ['bunpro'],
            studyFallback: { kind: 'study-supplement', minCards: 3 },
        });
        expect(newTabSourceLoadPlan('yomu-local', 3)).toEqual({
            kind: 'explicit-source',
            primarySources: ['yomu-local'],
            studyFallback: { kind: 'study-supplement', minCards: 3 },
        });
    });



    it('keeps Immersion Kit media subtitles in video-caption colors across themes', () => {
        const normalizedCss = NEW_TAB_CSS.replace(/\s+/g, ' ');
        const imageSentenceRule = newTabCssRule('.jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence');
        const subtitleWordRule = newTabCssRule('.jpdb-reader-newtab-immersion .jpdb-reader-example-sentence .jpdb-reader-word');
        const imageWordRule = newTabCssRule('.jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence .jpdb-reader-word');
        const normalizedImmersionCss = IMMERSION_CSS.replace(/\s+/g, ' ');
        const sharedSentenceRule = immersionCssRule(normalizedImmersionCss, '.jpdb-reader-example-card.has-image .jpdb-reader-example-sentence');

        // Overlay geometry is shared (immersion-study.css); the new-tab rule only
        // reskins it as a video subtitle.
        expect(sharedSentenceRule).toContain('left: 50%;');
        expect(sharedSentenceRule).toContain('transform: translateX(-50%);');
        expect(sharedSentenceRule).toContain('color: var(--jpdb-reader-white);');
        expect(sharedSentenceRule).toContain('background: var(--jpdb-ocr-background-rgba, var(--jpdb-reader-ocr-bg));');
        expect(sharedSentenceRule).toContain('calc(var(--yomu-immersion-frame-width, 100%) - 12px)');
        expect(imageSentenceRule).toContain('max-width: min( calc(100% - clamp(28px, 8%, 52px)), calc(var(--yomu-immersion-frame-width, 100%) - 12px) );');
        expect(imageSentenceRule).toContain('text-shadow: 0 1px 2px var(--subtitle-outline, var(--jpdb-reader-video-outline))');
        expect(imageSentenceRule).not.toContain('right: clamp(');
        expect(subtitleWordRule)
            .toContain('--jpdb-reader-subtitle-fallback: var(--jpdb-reader-white);');
        expect(imageWordRule).toContain('-webkit-text-stroke: 0.02em');
        expect(normalizedImmersionCss).toContain(':is(.jpdb-reader-example-target, .jpdb-reader-word.jpdb-reader-example-target) { --jpdb-reader-word-underline: transparent; background: color-mix( in srgb, var(--jpdb-reader-accent-readable, var(--jpdb-reader-accent)) 34%, var(--jpdb-reader-video-target-backdrop) ) !important;');
        // Deduped: new-tab.css must not re-declare the shared target/blur rules.
        expect(normalizedCss).not.toContain('.jpdb-reader-newtab-immersion .jpdb-reader-example-target {');
        expect(normalizedCss).not.toContain('.jpdb-reader-newtab-immersion .jpdb-reader-example-sentence .jpdb-reader-word.jpdb-reader-example-target {');
        expect(normalizedCss).not.toContain('translation-blurred');
        expect(normalizedCss)
            .not.toContain(':is(.jpdb-reader-theme-light, .yomu-page-theme-light) .jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence { --jpdb-reader-subtitle-fallback: var(--jpdb-reader-text); background: transparent; box-shadow: none; }');
        expect(normalizedCss)
            .not.toContain(':is(.jpdb-reader-theme-light, .yomu-page-theme-light) .jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence .jpdb-reader-word { --jpdb-reader-subtitle-fallback: var(--jpdb-reader-text); background: transparent !important; }');
        expect(normalizedCss)
            .not.toContain(':is(.jpdb-reader-theme-light, .yomu-page-theme-light) .jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence .jpdb-reader-furi { color: currentColor; opacity: 0.82; text-shadow: none; }');
        expect(normalizedCss)
            .toContain(':is(.jpdb-reader-theme-light, .yomu-page-theme-light) .jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-translation { color: var(--jpdb-reader-muted); text-shadow: none; }');
    });

    it('keeps generic new-tab accent surfaces on accent tokens', () => {
        const genericAccentRules = [
            newTabCssRule('.jpdb-reader-newtab-mode button[data-active="true"]'),
            newTabCssRule('.jpdb-reader-newtab-searchbox button[type="submit"]'),
            newTabCssRule('.jpdb-reader-newtab-count::before'),
        ];

        expect(genericAccentRules.join(' ')).toContain('--jpdb-reader-accent');
        expect(newTabCssRule('.jpdb-reader-newtab-mode button[data-active="true"]'))
            .toContain('var(--jpdb-reader-accent-soft)');
        expect(newTabCssRule('.jpdb-reader-newtab-mode button[data-active="true"]'))
            .toContain('var(--jpdb-reader-accent-readable, var(--jpdb-reader-text))');
        expect(newTabCssRule('.jpdb-reader-newtab-searchbox button[type="submit"]'))
            .toContain('var(--jpdb-reader-accent-readable, var(--jpdb-reader-text))');

        for (const rule of genericAccentRules) {
            expect(rule).not.toContain('--jpdb-reader-state-known');
            expect(rule).not.toContain('--jpdb-reader-state-new-bright');
            expect(rule).not.toContain('--jpdb-reader-state-learning');
        }

        // UT-21: the page edge glows are swipe-grade affordances — left mirrors
        // the fail grade, right mirrors the pass grade, and both stay hidden
        // unless a drag is in progress.
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab::before { left: 0; background: linear-gradient( 90deg, color-mix(in srgb, var(--jpdb-reader-study-fail) 62%, transparent), transparent ); }');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab::after { right: 0; background: linear-gradient( 270deg, color-mix(in srgb, var(--jpdb-reader-study-pass) 62%, transparent), transparent ); }');
        expect(newTabCssRule('.jpdb-reader-newtab::before, .jpdb-reader-newtab::after')).toContain('opacity: 0');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab[data-newtab-swipe-mode="grade"][data-newtab-swipe-direction="left"]::before, .jpdb-reader-newtab[data-newtab-swipe-mode="grade"][data-newtab-swipe-direction="right"]::after { opacity: calc(0.25 + 0.75 * var(--jpdb-reader-newtab-swipe-progress, 0)); }');
        expect(NORMALIZED_NEW_TAB_CSS).not.toContain('.jpdb-reader-newtab-review-mode .jpdb-reader-newtab-study::before');

        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab-controls button[data-grade="fail"], .jpdb-reader-newtab-controls button[data-grade="nothing"] { --jpdb-newtab-grade-accent: var(--jpdb-reader-study-fail); }');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab-controls button[data-grade="pass"], .jpdb-reader-newtab-controls button[data-grade="okay"] { --jpdb-newtab-grade-accent: var(--jpdb-reader-study-pass); }');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab-status-light[data-source="anki"] { background: var(--jpdb-reader-state-new-bright);');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab-status-light[data-source="jiten"] { background: var(--jpdb-reader-state-learning);');
    });

    it('selects the nearest stats day when coarse-pointer users tap compact chart gaps', () => {
        const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn((query: string) => ({
                matches: query === '(pointer: coarse)',
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
        try {
            const controller = newTabPromptController();
            const internals = controller as unknown as {
                handleRootClick(root: HTMLElement, event: MouseEvent): void;
                statsController: { render(root: HTMLElement): void; selectedDate: string | null };
            };
            internals.statsController.render = vi.fn();
            const root = document.createElement('main');
            root.className = 'jpdb-reader-newtab';
            root.innerHTML = `
                <div class="jpdb-reader-stats-bars">
                    <button type="button" data-newtab-action="stats-select-day" data-stats-day="2026-06-01"></button>
                    <button type="button" data-newtab-action="stats-select-day" data-stats-day="2026-06-02"></button>
                </div>
                <div class="jpdb-reader-stats-heatmap-grid">
                    <span class="jpdb-reader-stats-heatmap-spacer"></span>
                    <button type="button" data-newtab-action="stats-select-day" data-stats-day="2026-06-03"></button>
                    <button type="button" data-newtab-action="stats-select-day" data-stats-day="2026-06-04"></button>
                </div>
            `;
            root.addEventListener('click', event => internals.handleRootClick(root, event as MouseEvent));
            const bars = root.querySelector<HTMLElement>('.jpdb-reader-stats-bars')!;
            const [firstBar, secondBar] = Array.from(bars.querySelectorAll<HTMLElement>('[data-stats-day]'));
            stubBoundingClientRect(firstBar!, { left: 0, top: 0, right: 10, bottom: 100, width: 10, height: 100 });
            stubBoundingClientRect(secondBar!, { left: 22, top: 0, right: 32, bottom: 100, width: 10, height: 100 });

            bars.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 18, clientY: 50 }));

            expect(internals.statsController.selectedDate).toBe('2026-06-02');
            expect(internals.statsController.render).toHaveBeenCalledWith(root);

            const heatmap = root.querySelector<HTMLElement>('.jpdb-reader-stats-heatmap-grid')!;
            const [firstCell, secondCell] = Array.from(heatmap.querySelectorAll<HTMLElement>('[data-stats-day]'));
            stubBoundingClientRect(firstCell!, { left: 12, top: 0, right: 22, bottom: 10, width: 10, height: 10 });
            stubBoundingClientRect(secondCell!, { left: 26, top: 0, right: 36, bottom: 10, width: 10, height: 10 });

            heatmap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 25, clientY: 5 }));

            expect(internals.statsController.selectedDate).toBe('2026-06-04');
        } finally {
            if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
            else delete (window as unknown as Record<string, unknown>).matchMedia;
        }
    });

    it('surfaces Jiten SRS in the new-tab API stats connection without JPDB import controls', async () => {
        const jitenCard = newTabTestCard({
            source: 'jiten',
            reviewSource: 'jiten-api',
            cardState: ['due'],
            jitenWordId: 42,
            jitenReadingIndex: 2,
            spelling: '読む',
            reading: 'よむ',
        });
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const listRecentReviews = vi.fn(async () => [
            { wordId: 42, readingIndex: 2, wordText: '読む', rating: 4, reviewDateTime: '2026-06-24T17:04:00Z', reviewedAt: Date.parse('2026-06-24T17:04:00Z'), reviewDuration: 12_000, cardState: 2 },
            { wordId: 42, readingIndex: 2, wordText: '読む', rating: 1, reviewDateTime: '2026-06-24T17:03:00Z', reviewedAt: Date.parse('2026-06-24T17:03:00Z'), reviewDuration: 18_000, cardState: 3 },
        ]);
        const showSettings = vi.fn();
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, listRecentReviews, reviewCard: vi.fn() } as never,
            showSettings,
        });
        try {
            const root = await renderLoadedApiStats(controller);

            expect(listStudyBatchCards).toHaveBeenCalled();
            expect(listRecentReviews).toHaveBeenCalledWith(1000);
            expect(root.textContent).toContain('Jiten SRS loaded.');
            expect(root.textContent).toContain('50%');
            expect(root.textContent).toContain('4.0');
            expect(root.querySelectorAll('[data-stats-source]')).toHaveLength(0);
            expect(root.querySelector('[data-newtab-action="stats-import-jpdb"]')).toBeNull();
            expect(root.querySelector('[data-stats-jpdb-file]')).toBeNull();
            expectApiStatsSettingsButton(root, showSettings);
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('renders Jiten card-state breakdowns on the stats page across SRS states', async () => {
        const states: Array<[string, Array<'due' | 'known' | 'learning' | 'new'>]> = [
            ['読む', ['due']],
            ['書く', ['known']],
            ['話す', ['learning']],
            ['聞く', ['new']],
        ];
        const listStudyBatchCards = vi.fn(async () => states.map(([spelling, cardState], index) => newTabTestCard({
            source: 'jiten',
            reviewSource: 'jiten-api',
            cardState,
            jitenWordId: index + 1,
            spelling,
            reading: spelling,
        })));
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });
        try {
            const root = await renderLoadedApiStats(controller);

            expect(root.textContent).toContain('Jiten SRS loaded.');
            const breakdown = root.querySelector('[data-stats-breakdown]') ?? root;
            // All four states must be represented in the rendered stats.
            expect(breakdown.textContent).toMatch(/due/i);
            expect(breakdown.textContent).toMatch(/known/i);
            expect(breakdown.textContent).toMatch(/learning/i);
            expect(breakdown.textContent).toMatch(/new/i);
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('renders the JPDB-style learning-progress strip with totals and known percentage', async () => {
        const states: Array<[string, Array<'due' | 'known' | 'learning' | 'new'>]> = [
            ['読む', ['known']],
            ['書く', ['known']],
            ['話す', ['learning']],
            ['聞く', ['new']],
        ];
        const listStudyBatchCards = vi.fn(async () => states.map(([spelling, cardState], index) => newTabTestCard({
            source: 'jiten',
            reviewSource: 'jiten-api',
            cardState,
            jitenWordId: index + 1,
            spelling,
            reading: spelling,
        })));
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });
        try {
            const root = await renderLoadedApiStats(controller);

            const progress = root.querySelector<HTMLElement>('.jpdb-reader-stats-progress');
            expect(progress).not.toBeNull();
            expect(progress!.classList.contains('jpdb-reader-stats-panel')).toBe(false);
            expect(progress!.querySelector('h2')).toBeNull();
            expect(progress!.textContent).not.toContain('Learning progress');
            expect(progress!.textContent).toContain('Learning');
            expect(progress!.textContent).toContain('You know');
            const values = [...progress!.querySelectorAll('.jpdb-reader-stats-progress-item strong')].map(item => item.textContent);
            expect(values[0]).toBe('4');
            expect(values[1]).toBe('1');
            expect(values[2]).toContain('2');
            expect(values[2]).toMatch(/50/);
            expect(progress!.querySelector('.jpdb-reader-stats-progress-rail')).not.toBeNull();
            expect(root.textContent).toContain('Total known non-redundant vocabulary: 2');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('fronts JPDB-backed cards with the JPDB example sentence, not Immersion Kit (SH-5)', async () => {
        const jpdbLookup = vi.fn(async () => ({ examples: [{ sentence: '日本語を勉強します。' }] }));
        const immersionSearch = vi.fn(async () => [{ sentence: '勉強の鬼になる。' } as ImmersionKitExample]);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitEnabled: true, jpdbDefinitionsEnabled: true }, {
            jpdbVocabulary: { lookup: jpdbLookup, search: vi.fn(async () => []) } as never,
            immersionKit: { search: immersionSearch, mediaUrls: vi.fn(() => []) } as never,
        });
        try {
            const internals = controller as unknown as { fetchFrontSentence(card: JPDBCard): Promise<string> };
            const jpdbCard = newTabTestCard({ spelling: '勉強', reading: 'べんきょう', source: 'jpdb', cardState: ['due'] });
            await expect(internals.fetchFrontSentence(jpdbCard)).resolves.toContain('日本語を勉強します');

            // Non-JPDB cards keep the Immersion Kit-first superset behavior.
            const localCard = newTabTestCard({ spelling: '勉強', reading: 'べんきょう', source: 'local' });
            await expect(internals.fetchFrontSentence(localCard)).resolves.toContain('勉強の鬼になる');
        } finally {
            controller.destroy();
        }
    });

    it('does not scrape JPDB example sentences for keyless study cards', async () => {
        const jpdbLookup = vi.fn(async () => ({ examples: [{ sentence: '日本語を勉強します。' }] }));
        const immersionSearch = vi.fn(async () => [{ sentence: '勉強の鬼になる。' } as ImmersionKitExample]);
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            immersionKitEnabled: true,
            jpdbDefinitionsEnabled: true,
        }, {
            jpdbVocabulary: { lookup: jpdbLookup, search: vi.fn(async () => []) } as never,
            immersionKit: { search: immersionSearch, mediaUrls: vi.fn(() => []) } as never,
        });
        try {
            const internals = controller as unknown as { fetchFrontSentence(card: JPDBCard): Promise<string> };
            const jpdbCard = newTabTestCard({ spelling: '勉強', reading: 'べんきょう', source: 'jpdb', cardState: ['due'] });

            await expect(internals.fetchFrontSentence(jpdbCard)).resolves.toContain('勉強の鬼になる');
            expect(jpdbLookup).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('shows due-in buckets on Anki rows in the My Cards browser (SH-3 due-in column)', async () => {
        const listDeckCards = vi.fn(async () => []);
        const listNewTabCards = vi.fn(async () => [
            newTabTestCard({ vid: -1, sid: -1, rid: 301, ankiCardId: 301, spelling: '暗記', reading: 'あんき', cardState: ['due'], source: 'anki', reviewSource: 'anki' }),
            newTabTestCard({ vid: -2, sid: -2, rid: 302, ankiCardId: 302, spelling: '勉強', reading: 'べんきょう', cardState: ['learning'], source: 'anki', reviewSource: 'anki' }),
        ]);
        const invoke = vi.fn(async (action: string, params?: Record<string, unknown>) => {
            if (action !== 'findCards') throw new Error(`unexpected ${action}`);
            const query = String(params?.query ?? '');
            if (query === 'is:due') return [301];
            if (query.includes('prop:due<=7')) return [302];
            return [];
        });
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
            anki: { listNewTabCards, invoke } as never,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);
            for (let i = 0; i < 6; i += 1) await new Promise(resolve => setTimeout(resolve, 0));

            const rows = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-item')];
            const rowText = (term: string) => rows.find(row => row.textContent?.includes(term))?.textContent ?? '';
            await waitForExpect(() => {
                expect(rowText('暗記')).toContain('Due');
                expect(rowText('勉強')).toContain('≤7d');
            });
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('includes Anki cards in the My Cards browser pool without touching the JPDB stats source (SH-3 v2)', async () => {
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], vid: 1, source: 'jpdb' }),
        ]);
        const listNewTabCards = vi.fn(async () => [
            newTabTestCard({ vid: -1, sid: -1, rid: 201, spelling: '暗記', reading: 'あんき', cardState: ['due'], source: 'anki', reviewSource: 'anki' }),
        ]);
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
            anki: { listNewTabCards } as never,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);
            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(listNewTabCards).toHaveBeenCalled();
            const rows = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-row')];
            expect(rows.some(row => row.textContent?.includes('暗記'))).toBe(true);
            expect(rows.some(row => row.textContent?.includes('読む'))).toBe(true);

            // The JPDB stats source keeps its own provider list (no Anki).
            const internals = controller as unknown as { statsController: { jpdbStatsApiProviders(settings: unknown): Array<{ label: string }> } };
            const labels = internals.statsController.jpdbStatsApiProviders({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', ankiEnabled: true, newTabAnkiEnabled: true }).map(provider => provider.label);
            expect(labels).toEqual(['JPDB']);
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps My Cards on the active target before provider caps and legacy-card normalization', async () => {
        setActiveLearningTargetLanguage('es');
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], source: 'jpdb' }),
        ]);
        const listNewTabCards = vi.fn(async () => [
            newTabTestCard({ spelling: '暗記', reading: 'あんき', cardState: ['due'], source: 'anki', reviewSource: 'anki' }),
        ]);
        const listDecks = vi.fn(async () => []);
        const listStudyBatchCards = vi.fn(async () => [
            newTabTestCard({ spelling: '辞書', reading: 'じしょ', cardState: ['due'], source: 'jiten', reviewSource: 'jiten-api' }),
        ]);
        const bunproQueue = vi.fn();
        const wanikaniQueue = vi.fn();
        const queue = vi.fn(async () => ({
            providerId: 'yomu-local' as const,
            fetchedAt: Date.now(),
            dueCount: 1,
            newCount: 0,
            reviewCount: 1,
            cards: [{
                providerId: 'yomu-local' as const,
                providerCardId: 'es-agua',
                kind: 'vocabulary' as const,
                expression: 'agua',
                reading: 'agua',
                language: 'es' as const,
                meanings: [{ glosses: ['water'], partOfSpeech: ['noun'] }],
                state: ['due' as const],
            }],
        }));
        const spanishSettings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jitenApiKey: 'jiten-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabJpdbDeck: 'stale-japanese-deck',
            yomuLocalSrsEnabled: true,
            languageProfiles: DEFAULT_SETTINGS.languageProfiles.map(profile => ({
                ...profile,
                targetLanguage: 'es' as const,
            })),
        };
        const controller = newTabApiSourceController(spanishSettings, {
            jpdb: { listDeckCards, listDecks } as never,
            jiten: { listStudyBatchCards } as never,
            anki: { listNewTabCards } as never,
            srsAdapters: {
                bunpro: { label: 'Bunpro', hasCredential: () => true, queue: bunproQueue, stats: vi.fn(), review: vi.fn() },
                wanikani: { label: 'WaniKani', hasCredential: () => true, queue: wanikaniQueue, stats: vi.fn(), review: vi.fn() },
                'yomu-local': { label: 'Academy', hasCredential: () => true, queue, stats: vi.fn(), review: vi.fn() },
            } as never,
        });
        try {
            const internals = controller as unknown as {
                browseSourceFilters: Set<string>;
                invalidateForTargetChange(): void;
            };
            internals.browseSourceFilters.add('jpdb');
            internals.invalidateForTargetChange();
            const root = renderBoundNewTabSearchRoot(controller);
            await waitForExpect(() => {
                const rows = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-row')];
                expect(rows).toHaveLength(1);
                expect(rows[0]?.textContent).toContain('agua');
                expect(rows[0]?.querySelector<HTMLElement>('.jpdb-reader-newtab-browse-term')?.lang).toBe('es');
            });
            expect(queue).toHaveBeenCalledWith(expect.any(Number), { language: 'es' });
            expect(listDeckCards).not.toHaveBeenCalled();
            expect(listDecks).not.toHaveBeenCalled();
            expect(listStudyBatchCards).not.toHaveBeenCalled();
            expect(listNewTabCards).not.toHaveBeenCalled();
            expect(bunproQueue).not.toHaveBeenCalled();
            expect(wanikaniQueue).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            document.body.replaceChildren();
            resetActiveLearningTargetLanguage();
        }
    });

    it('discards a Japanese My Cards response that resolves after the target changes', async () => {
        let resolveDeckCards!: (cards: JPDBCard[]) => void;
        const listDeckCards = vi.fn(() => new Promise<JPDBCard[]>(resolve => {
            resolveDeckCards = resolve;
        }));
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
        });
        const internals = controller as unknown as {
            browsePool?: JPDBCard[];
            loadBrowsePool(): Promise<JPDBCard[]>;
            invalidateForTargetChange(): void;
        };
        try {
            const pending = internals.loadBrowsePool();
            await waitForExpect(() => expect(listDeckCards).toHaveBeenCalled());

            setActiveLearningTargetLanguage('es');
            internals.invalidateForTargetChange();
            resolveDeckCards([
                newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], source: 'jpdb' }),
            ]);

            await expect(pending).resolves.toEqual([]);
            expect(internals.browsePool).toBeUndefined();
        } finally {
            controller.destroy();
            resetActiveLearningTargetLanguage();
        }
    });

    it('includes Bunpro and local Yomu SRS cards in the My Cards browser pool', async () => {
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], vid: 1, source: 'jpdb' }),
        ]);
        const bunproQueue = vi.fn(async () => ({
            providerId: 'bunpro',
            fetchedAt: Date.now(),
            dueCount: 1,
            newCount: 0,
            reviewCount: 1,
            cards: [{
                providerId: 'bunpro',
                providerCardId: 'bp-101',
                providerReviewId: 'review-101',
                providerReviewableId: '101',
                kind: 'vocabulary',
                expression: '文法',
                reading: 'ぶんぽう',
                meanings: [{ glosses: ['grammar'], partOfSpeech: [] }],
                state: ['due'],
                srsLevel: 'Seasoned',
            }],
        }));
        const yomuQueue = vi.fn(async () => ({
            providerId: 'yomu-local',
            fetchedAt: Date.now(),
            dueCount: 0,
            newCount: 1,
            reviewCount: 1,
            cards: [{
                providerId: 'yomu-local',
                providerCardId: 'local-1',
                kind: 'vocabulary',
                expression: '自習',
                reading: 'じしゅう',
                meanings: [{ glosses: ['self study'], partOfSpeech: [] }],
                state: ['new'],
            }],
        }));
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            yomuLocalSrsEnabled: true,
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
            srsAdapters: {
                bunpro: { label: 'Bunpro', hasCredential: () => true, queue: bunproQueue, stats: vi.fn(), review: vi.fn() },
                'yomu-local': { label: 'Academy', hasCredential: () => true, queue: yomuQueue, stats: vi.fn(), review: vi.fn() },
            } as never,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);

            await waitForExpect(() => {
                expect(bunproQueue).toHaveBeenCalled();
                expect(yomuQueue).toHaveBeenCalled();
                const text = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-row')].map(row => row.textContent ?? '').join('\n');
                expect(text).toContain('読む');
                expect(text).toContain('文法');
                expect(text).toContain('自習');
                expect(root.querySelector('[data-browse-source-filter="bunpro"]')?.textContent).toBe('Bunpro 1');
                expect(root.querySelector('[data-browse-source-filter="yomu-local"]')?.textContent).toBe('Academy 1');
            });
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('opens Jiten My Cards rows as source-card popovers so mining controls stay available', async () => {
        const jitenCard = newTabTestCard({
            spelling: '電車',
            reading: 'でんしゃ',
            cardState: ['learning'],
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 2700,
            jitenReadingIndex: 0,
            sourceDeckName: 'Core Anime',
        });
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const showLookupCard = vi.fn();
        const lookupText = vi.fn();
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            showLookupCard,
            lookupText,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);
            await waitForExpect(() => {
                expect(root.querySelector<HTMLButtonElement>('.jpdb-reader-newtab-browse-row')?.textContent).toContain('電車');
            });

            const row = root.querySelector<HTMLButtonElement>('.jpdb-reader-newtab-browse-row')!;
            row.click();

            expect(showLookupCard).toHaveBeenCalledWith(jitenCard, '電車', row, expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('loads all Jiten study deck vocabulary for the Search tab source filters', async () => {
        const deckCards = [
            newTabTestCard({
                spelling: '日本語',
                reading: 'にほんご',
                cardState: ['new'],
                source: 'jiten',
                reviewSource: 'jiten-api',
                jitenWordId: 101,
                jitenReadingIndex: 0,
            }),
            newTabTestCard({
                spelling: '復習',
                reading: 'ふくしゅう',
                cardState: ['due'],
                source: 'jiten',
                reviewSource: 'jiten-api',
                jitenWordId: 102,
                jitenReadingIndex: 0,
            }),
        ];
        const listStudyDecks = vi.fn(async () => [{ id: 7, name: 'Vocab 2k' }]);
        const listStudyDeckVocabularyCards = vi.fn(async () => deckCards);
        const listStudyBatchCards = vi.fn(async () => [
            newTabTestCard({ spelling: 'Queue only', source: 'jiten', reviewSource: 'jiten-api', jitenWordId: 1, jitenReadingIndex: 0 }),
        ]);
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, listStudyDecks, listStudyDeckVocabularyCards, reviewCard: vi.fn() } as never,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);

            await waitForExpect(() => {
                expect(listStudyDeckVocabularyCards).toHaveBeenCalledWith(7, NEW_TAB_BROWSE_DECK_LIMIT);
                expect(root.querySelector('[data-browse-source-filter="jiten"]')?.textContent).toBe('Jiten 2');
            });
            expect(listStudyBatchCards).not.toHaveBeenCalled();
            const rows = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-row')];
            expect(rows.map(row => row.textContent)).toEqual([
                expect.stringContaining('日本語'),
                expect.stringContaining('復習'),
            ]);
            const internals = controller as unknown as { browsePool?: JPDBCard[] };
            expect(internals.browsePool?.map(card => card.sourceDeckName)).toEqual(['Vocab 2k', 'Vocab 2k']);
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('bulk-blacklists the selected page of My Cards through the shared card-action path (SH-3 v2)', async () => {
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], vid: 21, source: 'jpdb' }),
            newTabTestCard({ spelling: '書く', reading: 'かく', cardState: ['due'], vid: 22, source: 'jpdb' }),
        ]);
        const performCardAction = vi.fn(async (..._args: [HTMLButtonElement, JPDBCard, string?, HTMLElement?]) => {});
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
            performCardAction,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);
            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 0));

            // Select mode is opt-in (user-tested: rows should not always
            // carry checkboxes) — toggle it on first.
            expect(root.querySelector('[data-browse-select-page]')).toBeNull();
            root.querySelector<HTMLButtonElement>('[data-newtab-action="browse-select-mode"]')!.click();
            await new Promise(resolve => setTimeout(resolve, 0));

            const selectPage = root.querySelector<HTMLInputElement>('[data-browse-select-page]')!;
            expect(selectPage).not.toBeNull();
            const bulkButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="browse-bulk"][data-bulk-action="blacklist"]')!;
            expect(bulkButton.disabled).toBe(true);

            selectPage.checked = true;
            selectPage.dispatchEvent(new Event('change', { bubbles: true }));
            expect(bulkButton.disabled).toBe(false);
            expect([...root.querySelectorAll<HTMLInputElement>('[data-browse-select]')].every(box => box.checked)).toBe(true);

            bulkButton.click();
            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(performCardAction).toHaveBeenCalledTimes(2);
            const actions = performCardAction.mock.calls.map(call => call[0].dataset.action);
            expect(actions).toEqual(['blacklist', 'blacklist']);
            const spellings = performCardAction.mock.calls.map(call => call[1].spelling).sort();
            expect(spellings).toEqual(['書く', '読む']);
            // The pool reloads so the rows recolor with post-action states.
            expect(listDeckCards.mock.calls.length).toBeGreaterThanOrEqual(2);
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('shows the My Cards browser with state chips on the idle search tab (SH-3)', async () => {
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], vid: 1 }),
            newTabTestCard({ spelling: '書く', reading: 'かく', cardState: ['due'], vid: 2 }),
            newTabTestCard({ spelling: '聞く', reading: 'きく', cardState: ['new'], vid: 3 }),
        ]);
        const lookupText = vi.fn();
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
            lookupText,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);
            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(listDeckCards).toHaveBeenCalled();
            const chips = root.querySelectorAll('[data-newtab-action="browse-filter"]');
            expect(chips.length).toBeGreaterThanOrEqual(4); // All + New + Due + Known
            expect(root.querySelectorAll('.jpdb-reader-newtab-browse-row')).toHaveLength(3);

            // Filtering by Due leaves one row.
            const dueChip = [...chips].find(chip => (chip as HTMLElement).dataset.browseFilter === 'due') as HTMLButtonElement;
            dueChip.click();
            expect(root.querySelectorAll('.jpdb-reader-newtab-browse-row')).toHaveLength(1);
            expect(root.textContent).toContain('書く');

            // Clicking a row opens the lookup for that word.
            root.querySelector<HTMLButtonElement>('.jpdb-reader-newtab-browse-row')!.click();
            expect(lookupText).toHaveBeenCalledWith('書く', 'かく', expect.anything());

            // With a chip active, typing searches MY cards instead of the
            // dictionaries (SH-3 v2).
            (controller as unknown as { searchController: { setInitialQuery(query: string): void } }).searchController.setInitialQuery('よむ');
            (controller as unknown as { searchController: { renderSearch(root: HTMLElement): void } }).searchController.renderSearch(root);
            const rows = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-row')];
            expect(rows).toHaveLength(0); // 読む is known, filter is still 'due'
            const knownChip = [...root.querySelectorAll<HTMLElement>('[data-newtab-action="browse-filter"]')]
                .find(chip => chip.dataset.browseFilter === 'known') as HTMLButtonElement;
            knownChip.click();
            const knownRows = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-row')];
            expect(knownRows).toHaveLength(1);
            expect(knownRows[0]?.textContent).toContain('読む');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('shows an error state on the stats page when the Jiten API fails instead of going blank', async () => {
        const listStudyBatchCards = vi.fn(async () => {
            throw new Error('Jiten API unreachable');
        });
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });
        try {
            const root = await renderLoadedApiStats(controller);

            expect(listStudyBatchCards).toHaveBeenCalled();
            expect(root.textContent).toContain('Jiten API unreachable');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('combines Jiten and JPDB SRS in the new-tab API stats connection', async () => {
        const jpdbCard = newTabTestCard({
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            spelling: '復習',
            reading: 'ふくしゅう',
            cardState: ['due'],
        });
        const jitenCard = newTabTestCard({
            source: 'jiten',
            reviewSource: 'jiten-api',
            cardState: ['due'],
            jitenWordId: 42,
            jitenReadingIndex: 2,
            spelling: '日本語',
            reading: 'にほんご',
        });
        const listDeckCards = vi.fn(async () => [jpdbCard]);
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const showSettings = vi.fn();
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jitenApiKey: 'jiten-key',
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            showSettings,
        });
        try {
            const root = await renderLoadedApiStats(controller);

            expect(listDeckCards).toHaveBeenCalledWith('all', 2000);
            expect(listStudyBatchCards).toHaveBeenCalledWith(2000);
            expect(root.textContent).toContain('Jiten SRS loaded.');
            expect(root.textContent).toContain('JPDB card states loaded.');
            expect(Array.from(root.querySelectorAll('[data-stats-source]')).map(tab => tab.textContent)).toEqual(['Combined', 'JPDB', 'Jiten']);
            expect(root.querySelector('[data-newtab-action="stats-import-jpdb"]')).not.toBeNull();
            expect(root.querySelector('[data-stats-jpdb-file]')).not.toBeNull();
            const settingsButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="stats-open-jpdb-settings"]'));
            const apiSettings = settingsButtons.find(button => button.textContent === 'API settings');
            expect(apiSettings).toBeTruthy();
            apiSettings?.click();
            expect(showSettings).toHaveBeenCalledWith('api');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('parses live JPDB kanji review fronts from the review card id', () => {
        const doc = new DOMParser().parseFromString(`
            <main>
                <input name="c" value="kb,記">
                <div class="kind">Kanji</div>
                <div class="plain">record</div>
            </main>
        `, 'text/html');

        const status = parseJpdbReviewDocument(doc, 'https://jpdb.io/review?c=kb,%E8%A8%98');

        expect(status.connected).toBe(true);
        expect(status.card?.kind).toBe('kanji');
        expect(status.card?.phase).toBe('front');
        expect(status.card?.kanji).toBe('記');
        expect(status.card?.prompt).toContain('record');
    });

    it('carries the jpdb.io deck-membership line through the review bridge (SH-4)', () => {
        const doc = new DOMParser().parseFromString(`
            <main>
                <div class="kind">Vocabulary</div>
                <div class="card-sentence"><div class="sentence">はい、<span class="highlight">よくできました</span>。</div></div>
                <div>Part of the <a href="/deck?id=92">Persona 5</a> deck (3x)</div>
            </main>
        `, 'text/html');

        const status = parseJpdbReviewDocument(doc, 'https://jpdb.io/review#a');

        expect(status.card?.deckMembership).toBe('Part of the Persona 5 deck (3x)');
    });

    it('parses JPDB vocabulary review sentences and highlighted targets', () => {
        const doc = new DOMParser().parseFromString(`
            <main>
                <div class="kind">Vocabulary</div>
                <div class="card-sentence">
                    <div class="sentence">ここへ<span class="highlight">来て</span>見てみなよ。</div>
                </div>
            </main>
        `, 'text/html');

        const status = parseJpdbReviewDocument(doc, 'https://jpdb.io/review#demo');

        expect(status.card?.kind).toBe('vocabulary');
        expect(status.card?.sentence).toContain('ここへ');
        expect(status.card?.spelling).toBe('来て');
    });

    it('grades kanji doodles from stroke count and basic drawing coverage', () => {
        const assessment = assessKanjiStrokes([
            [{ x: 0.1, y: 0.1, pressure: 0.5 }, { x: 0.9, y: 0.1, pressure: 0.5 }],
            [{ x: 0.2, y: 0.2, pressure: 0.5 }, { x: 0.2, y: 0.9, pressure: 0.5 }],
        ], 2);

        expect(assessment.passed).toBe(true);
        expect(assessment.score).toBeGreaterThanOrEqual(68);
    });

    it('checks same-count kanji doodles against the expected KanjiVG stroke shape', () => {
        const twoTemplate = [
            [{ x: 0.23, y: 0.30 }, { x: 0.74, y: 0.27 }],
            [{ x: 0.11, y: 0.74 }, { x: 0.89, y: 0.70 }],
        ];

        const correct = assessKanjiStrokes([
            [{ x: 0.20, y: 0.31, pressure: 0.5 }, { x: 0.79, y: 0.29, pressure: 0.5 }],
            [{ x: 0.10, y: 0.77, pressure: 0.5 }, { x: 0.90, y: 0.73, pressure: 0.5 }],
        ], 2, twoTemplate);
        const wrongShape = assessKanjiStrokes([
            [{ x: 0.30, y: 0.18, pressure: 0.5 }, { x: 0.30, y: 0.82, pressure: 0.5 }],
            [{ x: 0.70, y: 0.18, pressure: 0.5 }, { x: 0.70, y: 0.82, pressure: 0.5 }],
        ], 2, twoTemplate);
        const wrongOrder = assessKanjiStrokes([
            [{ x: 0.10, y: 0.77, pressure: 0.5 }, { x: 0.90, y: 0.73, pressure: 0.5 }],
            [{ x: 0.20, y: 0.31, pressure: 0.5 }, { x: 0.79, y: 0.29, pressure: 0.5 }],
        ], 2, twoTemplate);

        expect(correct.passed).toBe(true);
        expect(correct.shapeScore).toBeGreaterThanOrEqual(0.56);
        expect(wrongShape.passed).toBe(false);
        expect(wrongShape.message).toContain('shape/order');
        expect(wrongOrder.passed).toBe(false);
        expect(wrongOrder.message).toContain('shape/order');
    });

    it('ranks kanji shape candidates without requiring stroke order or direction', () => {
        const twoTemplate = [
            [{ x: 0.23, y: 0.30 }, { x: 0.74, y: 0.27 }],
            [{ x: 0.11, y: 0.74 }, { x: 0.89, y: 0.70 }],
        ];
        const riverTemplate = [
            [{ x: 0.24, y: 0.18 }, { x: 0.20, y: 0.82 }],
            [{ x: 0.50, y: 0.12 }, { x: 0.46, y: 0.88 }],
            [{ x: 0.76, y: 0.16 }, { x: 0.72, y: 0.84 }],
        ];

        const matches = rankKanjiStrokeCandidates([
            [{ x: 0.90, y: 0.73, pressure: 0.5 }, { x: 0.10, y: 0.77, pressure: 0.5 }],
            [{ x: 0.79, y: 0.29, pressure: 0.5 }, { x: 0.20, y: 0.31, pressure: 0.5 }],
        ], [
            { kanji: '川', strokeShapes: riverTemplate },
            { kanji: '二', strokeShapes: twoTemplate },
        ]);

        expect(matches[0]?.kanji).toBe('二');
        expect(matches[0]?.score).toBeGreaterThan(0.7);
    });

    it('keeps mother near the top for connected, out-of-order handwriting', () => {
        const matches = rankKanjiStrokeCandidates([
            [{ x: 0.28, y: 0.24, pressure: 0.5 }, { x: 0.84, y: 0.29, pressure: 0.5 }],
            [{ x: 0.34, y: 0.16, pressure: 0.5 }, { x: 0.29, y: 0.58, pressure: 0.5 }, { x: 0.27, y: 0.76, pressure: 0.5 }, { x: 0.70, y: 0.78, pressure: 0.5 }, { x: 0.78, y: 0.78, pressure: 0.5 }],
            [{ x: 0.78, y: 0.30, pressure: 0.5 }, { x: 0.74, y: 0.58, pressure: 0.5 }, { x: 0.70, y: 0.88, pressure: 0.5 }],
            [{ x: 0.20, y: 0.48, pressure: 0.5 }, { x: 0.88, y: 0.56, pressure: 0.5 }],
            [{ x: 0.50, y: 0.36, pressure: 0.5 }, { x: 0.61, y: 0.45, pressure: 0.5 }],
            [{ x: 0.50, y: 0.58, pressure: 0.5 }, { x: 0.62, y: 0.68, pressure: 0.5 }],
        ], [
            {
                kanji: '用',
                strokeShapes: [
                    [{ x: 0.30, y: 0.18 }, { x: 0.24, y: 0.90 }],
                    [{ x: 0.31, y: 0.20 }, { x: 0.78, y: 0.20 }, { x: 0.76, y: 0.90 }],
                    [{ x: 0.50, y: 0.22 }, { x: 0.50, y: 0.88 }],
                    [{ x: 0.28, y: 0.45 }, { x: 0.76, y: 0.45 }],
                    [{ x: 0.28, y: 0.66 }, { x: 0.76, y: 0.66 }],
                ],
            },
            {
                kanji: '母',
                strokeShapes: [
                    [{ x: 0.31, y: 0.24 }, { x: 0.82, y: 0.28 }],
                    [{ x: 0.35, y: 0.16 }, { x: 0.28, y: 0.56 }, { x: 0.27, y: 0.76 }, { x: 0.74, y: 0.78 }],
                    [{ x: 0.80, y: 0.28 }, { x: 0.75, y: 0.57 }, { x: 0.70, y: 0.88 }],
                    [{ x: 0.22, y: 0.49 }, { x: 0.86, y: 0.56 }],
                    [{ x: 0.50, y: 0.37 }, { x: 0.62, y: 0.47 }],
                    [{ x: 0.50, y: 0.59 }, { x: 0.63, y: 0.69 }],
                ],
            },
            {
                kanji: '回',
                strokeShapes: [
                    [{ x: 0.22, y: 0.20 }, { x: 0.22, y: 0.82 }],
                    [{ x: 0.22, y: 0.20 }, { x: 0.84, y: 0.20 }, { x: 0.84, y: 0.82 }],
                    [{ x: 0.38, y: 0.40 }, { x: 0.68, y: 0.40 }, { x: 0.68, y: 0.66 }, { x: 0.38, y: 0.66 }, { x: 0.38, y: 0.40 }],
                    [{ x: 0.22, y: 0.82 }, { x: 0.84, y: 0.82 }],
                ],
            },
        ]);

        expect(matches[0]?.kanji).toBe('母');
    });

    it('uses Google-style handwriting recognition instead of the browser Handwriting API', async () => {
        const nativeRecognizer = vi.fn(() => {
            throw new Error('Native handwriting should not be used');
        });
        Object.defineProperty(navigator, 'createHandwritingRecognizer', {
            configurable: true,
            value: nativeRecognizer,
        });
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
            'SUCCESS',
            [['request-id', ['母', '父', '日', '月', '火', '水', '木', '金'], [], { is_html_escaped: false }]],
        ]))));
        const controller = new NewTabController({
            getSettings: () => DEFAULT_SETTINGS,
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = '<div data-newtab-handwriting-candidates></div>';
        document.body.append(root);
        Object.assign(controller as unknown as {
            state: { route: string };
        }, {
            state: { route: 'search' },
        });
        const handwritingInternals = (controller as unknown as { searchController: {
            searchHandwritingGeneration: number;
            recognizeSearchHandwriting(root: HTMLElement, strokes: Parameters<typeof rankKanjiStrokeCandidates>[0], generation: number): Promise<void>;
        } }).searchController;
        handwritingInternals.searchHandwritingGeneration = 7;

        await handwritingInternals.recognizeSearchHandwriting(root, [
            [{ x: 0.3, y: 0.2, pressure: 0.5 }, { x: 0.8, y: 0.3, pressure: 0.5 }],
            [{ x: 0.3, y: 0.2, pressure: 0.5 }, { x: 0.3, y: 0.8, pressure: 0.5 }],
        ], 7);

        expect(nativeRecognizer).not.toHaveBeenCalled();
        expect(root.querySelector('[data-newtab-handwriting-candidates]')?.textContent).toContain('母');
        root.remove();
    });
});
