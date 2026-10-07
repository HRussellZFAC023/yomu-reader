import { DEFAULT_NEW_TAB_UI_STATE } from '../../../src/reader/newtab/state';
import { describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    DEFAULT_SETTINGS,
    newTabTestCard,
    deferred,
    dispatchPointerSwipe,
    dispatchNewTabKeyboard,
    newTabPromptController,
    renderEnabledNewTabRoot,
    newTabBareController,
    newTabLocalDictionarySummary,
    renderSeededNewTabWord,
    resetNewTabReviewStorage,
    newTabStatusButton,
    expectNewTabPromptText,
    newTabPromptText,
    newTabSourceSelect,
    newTabSourceSelectValues,
    switchNewTabSource,
    expectNewTabSourcePrompt,
    newTabJpdbAnkiSourceFixture,
    newTabApiSourceController,
    stubKanjiDoodleBrowserApis,
    renderNewTabGradeControlButtons,
    summarizeNewTabReviewSources,
    waitForExpect,
} from './fixtures';
import type {
    NewTabControllerOptions,
    NewTabSettings,
    JPDBCard,
    JPDBGrade,
} from './fixtures';
import { readReviewTargetCapability } from '../../../src/reader/dom/private-command-capabilities';

type JpdbDeckOption = {
    id: string;
    name: string;
    vocabularyCount?: number;
    knownCoverage?: number;
};

function newTabJpdbBrowseController(listDeckCards: NewTabControllerOptions['jpdb']['listDeckCards']) {
    return newTabApiSourceController({
        ...DEFAULT_SETTINGS,
        apiKey: 'jpdb-key',
    }, {
        jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
    });
}

function newTabJpdbDeckSelectorFixture(
    settings: NewTabSettings,
    listDecks: () => Promise<JpdbDeckOption[]>,
) {
    const controller = newTabPromptController(settings);
    const internals = controller as unknown as {
        dependencies: { jpdb: { listDecks?: () => Promise<JpdbDeckOption[]> } };
        populateDeckSelector(select: HTMLSelectElement, currentSettings: NewTabSettings): Promise<void>;
    };
    internals.dependencies.jpdb.listDecks = vi.fn(listDecks);
    const select = document.createElement('select');
    document.body.append(select);
    return {
        controller,
        select,
        populate: () => internals.populateDeckSelector(select, settings),
    };
}

describe('new tab review — session progress, grade bar & deck selectors', () => {
    registerNewTabReviewCleanup();


    it('labels the current card origin in the mixed new-tab footer', () => {
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            jitenApiKey: 'jiten-key',
            immersionKitEnabled: false,
        }));
        const root = renderEnabledNewTabRoot(controller);
        try {
            const cards = [
                newTabTestCard({ spelling: '一番', source: 'jpdb', reviewSource: 'jpdb-api' }),
                newTabTestCard({ spelling: '二番', source: 'jiten', reviewSource: 'jiten-api', jitenWordId: 42, jitenReadingIndex: 0 }),
                newTabTestCard({ spelling: '三番', source: 'anki', reviewSource: 'anki' }),
                newTabTestCard({ spelling: '四番', source: 'local' }),
            ];
            Object.assign(controller as unknown as {
                visibleWords: JPDBCard[];
                index: number;
                reviewCountMode: boolean;
                sourceLabel: string;
                state: { route: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            }, {
                visibleWords: cards,
                index: 0,
                reviewCountMode: false,
                sourceLabel: 'Jiten + JPDB + Anki',
                state: { ...DEFAULT_NEW_TAB_UI_STATE, route: 'study', sort: 'random', filter: 'study', source: 'auto', revealAnswer: false },
            });

            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[0]!);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('1 / 4');
            expect(root.querySelector<HTMLElement>('[data-newtab-status] .jpdb-reader-newtab-status-light')?.dataset.source).toBe('jpdb');
            expect(newTabSourceSelect(root).hidden).toBe(false);

            (controller as unknown as { index: number }).index = 1;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[1]!);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('2 / 4');
            expect(root.querySelector<HTMLElement>('[data-newtab-status] .jpdb-reader-newtab-status-light')?.dataset.source).toBe('jiten');
            expect(newTabSourceSelect(root).hidden).toBe(false);

            (controller as unknown as { index: number }).index = 2;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[2]!);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('3 / 4');
            expect(root.querySelector<HTMLElement>('[data-newtab-status] .jpdb-reader-newtab-status-light')?.dataset.source).toBe('anki');
            expect(newTabSourceSelect(root).value).toBe('anki');

            (controller as unknown as { index: number }).index = 3;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[3]!);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
            expect(root.querySelector('[data-newtab-status] .jpdb-reader-newtab-status-light')).toBeNull();
            expect(newTabSourceSelect(root).value).toBe('yomu-local');
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('labels the shared API source toggle as Jiten when only Jiten SRS is configured', () => {
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: true,
            newTabAnkiEnabled: true,
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        });
        const card = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
        const root = renderSeededNewTabWord(controller, card, {
            allWords: [card],
            visibleWords: [card],
            sourceLabel: 'Anki',
            state: { source: 'anki' },
        });

        try {
            const status = newTabStatusButton(root);

            expect(status.textContent).not.toContain('Anki');
            expect(status.textContent).not.toContain('⇄');
            expect(status.disabled).toBe(true);
            const select = newTabSourceSelect(root);
            expect(select.hidden).toBe(false);
            expect(select.value).toBe('anki');
            expect(newTabSourceSelectValues(root)).toContain('jpdb');
            expect(select.querySelector<HTMLOptionElement>('option[value="jpdb"]')?.textContent).toBe('Jiten');
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('keeps the Anki switch indicator on Jiten-labeled API cards', () => {
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb',
            immersionKitEnabled: false,
        });
        const card = newTabTestCard({
            spelling: '百科事典',
            reading: 'ひゃっかじてん',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
        });
        const root = renderSeededNewTabWord(controller, card, {
            allWords: [card],
            visibleWords: [card],
            reviewCountMode: true,
            sourceLabel: 'Jiten',
            state: { source: 'jpdb' },
        });

        try {
            const status = newTabStatusButton(root);

            expect(status.textContent).not.toContain('⇄');
            expect(status.disabled).toBe(true);
            const select = newTabSourceSelect(root);
            expect(select.hidden).toBe(false);
            expect(select.value).toBe('jpdb');
            expect(select.querySelector<HTMLOptionElement>('option[value="jpdb"]')?.textContent).toBe('Jiten');
            expect(newTabSourceSelectValues(root)).toContain('anki');
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('renders SRS session progress and timer labels while navigating left and right', () => {
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-newtab').forEach(root => root.remove());
        // Timed Study is opt-in since 2.1.0 (ba2b781a5): the timer label belongs
        // to a learner who chose a daily goal. The untimed default is pinned by
        // the deep-queue test below and 12-fallbacks-refresh-shared-url.
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabDailyGoalMinutes: 60,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const first = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['due'],
        });
        const second = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['learning'],
        });
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { route: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            bindRootEvents(root: HTMLElement): void;
            renderWord(root: HTMLElement, card: JPDBCard): void;
            showNextWord(): void;
            showPreviousWord(): void;
        };
        try {
            Object.assign(internals, {
                allWords: [first, second],
                visibleWords: [first, second],
                index: 0,
                reviewCountMode: true,
                sourceLabel: 'JPDB',
                state: { ...DEFAULT_NEW_TAB_UI_STATE, route: 'study', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
            });
            internals.bindRootEvents(root);
            internals.renderWord(root, first);

            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
            expect(newTabSourceSelect(root).value).toBe('jpdb');
            const progress = root.querySelector<HTMLElement>('[data-newtab-count]')!;
            expect(progress.textContent).toMatch(/^Done 0 · Left 2 · Due 2 · \d\d:\d\d · 0\/60 min$/);
            expect(progress.dataset.sessionCompletedReviews).toBe('0');
            expect(progress.dataset.sessionRemainingCards).toBe('2');
            expect(progress.dataset.sessionRemainingDueCards).toBe('2');
            expect(progress.dataset.sessionRemaining).toMatch(/^\d\d:\d\d$/);
            expect(progress.dataset.sessionJpdbAvailable).toBe('true');
            expect(progress.dataset.sessionJpdbRemainingCards).toBe('2');

            internals.showNextWord();

            expect(internals.index).toBe(1);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
            expect(newTabSourceSelect(root).value).toBe('jpdb');
            expect(root.querySelector('[data-newtab-count]')?.textContent).toMatch(/^Done 0 · Left 2 · Due 2 · \d\d:\d\d · 0\/60 min$/);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('日本語');

            internals.showPreviousWord();

            expect(internals.index).toBe(0);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
            expect(newTabSourceSelect(root).value).toBe('jpdb');
            expect(root.querySelector('[data-newtab-count]')?.textContent).toMatch(/^Done 0 · Left 2 · Due 2 · \d\d:\d\d · 0\/60 min$/);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('復習');
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('keeps orphaned session clocks from rewriting replacement new-tab roots', () => {
        vi.useFakeTimers();
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-newtab').forEach(root => root.remove());
        const staleController = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            // Both clocks must actually run (timed Study is opt-in since ba2b781a5).
            newTabDailyGoalMinutes: 60,
        });
        const activeController = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            // Both clocks must actually run (timed Study is opt-in since ba2b781a5).
            newTabDailyGoalMinutes: 60,
        });
        const staleCards = [
            newTabTestCard({ vid: 101, spelling: '古い', reading: 'ふるい', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] }),
            newTabTestCard({ vid: 102, spelling: '小さい', reading: 'ちいさい', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] }),
        ];
        const activeCards = Array.from({ length: 4 }, (_, index) => newTabTestCard({
            vid: 201 + index,
            spelling: `新${index + 1}`,
            reading: `しん${index + 1}`,
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['due'],
        }));
        const staleRoot = renderSeededNewTabWord(staleController, staleCards[0]!, {
            allWords: staleCards,
            visibleWords: staleCards,
            reviewCountMode: true,
            sourceLabel: 'JPDB',
            appendToDocument: true,
        });
        staleRoot.remove();
        const activeRoot = renderSeededNewTabWord(activeController, activeCards[0]!, {
            allWords: activeCards,
            visibleWords: activeCards,
            reviewCountMode: true,
            sourceLabel: 'JPDB',
            appendToDocument: true,
        });

        try {
            vi.advanceTimersByTime(1000);

            expect(activeRoot.querySelector('[data-newtab-count]')?.textContent).toMatch(/^Done 0 · Left 4 · Due 4 · \d\d:\d\d · 0\/60 min$/);
            expect(activeRoot.querySelector('[data-newtab-count]')?.textContent).not.toContain('Left 2');
        } finally {
            staleController.destroy();
            activeController.destroy();
            activeRoot.remove();
        }
    });

    it('does not show raw queue ordinals for deep SRS review queues', async () => {
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-newtab').forEach(root => root.remove());
        const cards = Array.from({ length: 539 }, (_, index) => newTabTestCard({
            vid: index + 1,
            sid: 1,
            spelling: `語${index + 1}`,
            reading: `ご${index + 1}`,
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['due'],
        }));
        const reviewCard = vi.fn(async () => {});
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
        }, {
            jpdb: { reviewCard } as never,
        });
        const current = cards[359]!;
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const loadWordsInto = vi.fn(async () => {});
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { route: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            bindRootEvents(root: HTMLElement): void;
            renderWord(root: HTMLElement, card: JPDBCard): void;
            loadWordsInto: typeof loadWordsInto;
        };
        try {
            Object.assign(internals, {
                allWords: cards,
                visibleWords: cards,
                index: 359,
                reviewCountMode: true,
                sourceLabel: 'JPDB',
                state: { ...DEFAULT_NEW_TAB_UI_STATE, route: 'study', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
                loadWordsInto,
            });
            internals.bindRootEvents(root);
            internals.renderWord(root, current);

            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
            expect(newTabSourceSelect(root).value).toBe('jpdb');
            // Default profile: no daily goal, so no unsolicited timer (ba2b781a5).
            expect(root.querySelector('[data-newtab-count]')?.textContent).toBe('Done 0 · Left 539 · Due 539');
            expect(root.textContent).not.toContain('360 / 539');

            root.querySelector<HTMLButtonElement>('[data-grade="okay"]')?.click();

            await waitForExpect(() => {
                expect(reviewCard).toHaveBeenCalledWith(current, 'okay');
                expect(root.querySelector('[data-newtab-count]')?.textContent).toBe('Done 1 · Left 538 · Due 538');
                expect(root.textContent).not.toContain('360 / 539');
                expect(root.textContent).not.toContain('360 / 538');
            });
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('keeps SRS intervals off the visible new-tab grade button labels', () => {
        const mount = document.createElement('div');
        mount.append(...renderNewTabGradeControlButtons({
            apiShortLabel: 'JPDB',
            bothLabel: 'Both',
            grades: [['nothing', 'Again'], ['hard', 'Hard'], ['okay', 'Good']],
            intervals: {
                nothing: { intervalLabel: '1m' },
                hard: { intervalLabel: '10m' },
                okay: { intervalLabel: '4.1y' },
            },
            selectorLabel: 'Target',
            summary: summarizeNewTabReviewSources(['anki']),
            targetLabel: 'Grades Anki',
            targetOptions: [],
        }));

        const buttons = Array.from(mount.querySelectorAll<HTMLButtonElement>('[data-newtab-action="grade"]'));
        expect(buttons.map(button => button.dataset.grade)).toEqual(['nothing', 'hard', 'okay']);
        expect(buttons.map(button => button.dataset.gradeInterval)).toEqual(['1m', '10m', '4.1y']);
        expect(buttons.map(button => button.querySelector('.jpdb-reader-newtab-grade-label')?.textContent)).toEqual(['Again', 'Hard', 'Good']);
        expect(mount.querySelector('.jpdb-reader-newtab-grade-interval')).toBeNull();
        expect(buttons[0]?.getAttribute('aria-label')).toBe('Again, 1m: Grades Anki');
        expect(buttons[0]?.title).toBe('Grades Anki · 1m');
    });

    it('renders mixed JPDB and Anki grading target selection as one compact row', () => {
        const mount = document.createElement('div');
        mount.append(...renderNewTabGradeControlButtons({
            apiShortLabel: 'JPDB',
            bothLabel: 'Both',
            grades: [['fail', 'Fail'], ['pass', 'Pass']],
            selectorLabel: 'Target',
            selectedOption: {
                id: 'both',
                kind: 'both',
                label: 'Grades JPDB + Anki card: Core #404',
                shortLabel: 'Both',
            },
            summary: summarizeNewTabReviewSources(['jpdb-api', 'anki']),
            targetLabel: 'Grades JPDB + Anki card: Core #404',
            targetOptions: [
                { id: 'both', kind: 'both', label: 'Grades JPDB + Anki card: Core #404', shortLabel: 'Both' },
                { id: 'jpdb', kind: 'jpdb', label: 'Grades JPDB', shortLabel: 'JPDB' },
                { id: 'anki:404', kind: 'anki', label: 'Grades Anki card: Core #404', shortLabel: 'Anki #404', ankiCardId: 404 },
            ],
        }));

        const targetRows = mount.querySelectorAll('[data-newtab-grade-target]');
        const select = mount.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]');
        expect(targetRows).toHaveLength(1);
        expect(targetRows[0]).toBeInstanceOf(HTMLDetailsElement);
        expect((targetRows[0] as HTMLDetailsElement).open).toBe(false);
        expect(mount.querySelectorAll('[data-newtab-grade-target-selector]')).toHaveLength(1);
        expect(mount.querySelector('.jpdb-reader-newtab-grade-target-summary')).not.toBeNull();
        expect(select?.closest('.jpdb-reader-newtab-grade-target-panel')).not.toBeNull();
        expect(mount.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Both');
        expect(mount.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
        expect(mount.querySelector('[data-newtab-grade-target]')?.classList.contains('jpdb-reader-newtab-grade-target-context')).toBe(true);
        expect(select?.selectedOptions[0]?.textContent).toBe('Both');
        expect(select?.selectedOptions[0]?.dataset.newtabGradeTargetLabel).toBe('Grades JPDB + Anki card: Core #404');
        expect(Array.from(mount.querySelectorAll<HTMLButtonElement>('[data-newtab-action="grade"]')).map(button => button.querySelector('.jpdb-reader-newtab-grade-label')?.textContent)).toEqual(['Fail', 'Pass']);
    });

    it('wires card.reviewGradeIntervals into the main new-tab grade bar', () => {
        const buttons = renderNewTabGradeControlButtons({
            apiShortLabel: 'Jiten',
            bothLabel: 'Both',
            grades: [['fail', 'Fail'], ['okay', 'Pass']],
            intervals: {
                fail: { buttonLabel: '10m' },
                okay: { buttonLabel: '+3d' },
            },
            selectorLabel: 'Grade target',
            selectedOption: undefined,
            summary: '',
            targetLabel: 'Grades Jiten',
            targetOptions: [],
        } as never);
        const gradeButtons = buttons.filter(node => node.matches?.('[data-newtab-action="grade"]')) as HTMLButtonElement[];

        expect(gradeButtons.map(button => button.dataset.gradeInterval)).toEqual(['10m', '+3d']);
        expect(gradeButtons[0]?.getAttribute('aria-label')).toContain('10m');
        expect(gradeButtons[1]?.title).toContain('+3d');
    });

    it('gates swipe grades on the revealed answer: pre-reveal drags navigate cards, revealed swipes grade', async () => {
        vi.stubGlobal('PointerEvent', class {});
        const runSwipe = async (deltaX: number, expectedGrade: JPDBGrade): Promise<void> => {
            const current = newTabTestCard({
                spelling: deltaX < 0 ? '失敗' : '成功',
                reading: deltaX < 0 ? 'しっぱい' : 'せいこう',
                source: 'jpdb',
                reviewSource: 'jpdb-api',
                cardState: ['due'],
            });
            const next = newTabTestCard({
                spelling: '次',
                reading: 'つぎ',
                source: 'jpdb',
                reviewSource: 'jpdb-api',
                cardState: ['due'],
            });
            const reviewCard = vi.fn(async () => {});
            const controller = newTabPromptController({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
                immersionKitEnabled: false,
            }, {
                jpdb: { reviewCard } as never,
            });
            const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
            const internals = controller as unknown as {
                allWords: JPDBCard[];
                visibleWords: JPDBCard[];
                index: number;
                reviewCountMode: boolean;
                sourceLabel: string;
                state: { route: string; sort: string; filter: string; source: string; revealAnswer: boolean };
                bindRootEvents(root: HTMLElement): void;
                renderWord(root: HTMLElement, card: JPDBCard): void;
            };
            try {
                Object.assign(internals, {
                    allWords: [current, next],
                    visibleWords: [current, next],
                    index: 0,
                    reviewCountMode: true,
                    sourceLabel: 'JPDB',
                    state: { ...DEFAULT_NEW_TAB_UI_STATE, route: 'study', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
                });
                internals.bindRootEvents(root);
                internals.renderWord(root, current);

                // Hidden answers may navigate, but must never submit a provider grade.
                const navigationMethod = deltaX < 0 ? 'showNextWord' : 'showPreviousWord';
                const navigate = vi.spyOn(
                    controller as unknown as { showNextWord(): void; showPreviousWord(): void },
                    navigationMethod,
                ).mockImplementation(() => {});
                dispatchPointerSwipe(root.querySelector<HTMLElement>('[data-newtab-study]')!, window, deltaX);
                await Promise.resolve();
                expect(navigate).toHaveBeenCalledOnce();
                expect(reviewCard).not.toHaveBeenCalled();
                navigate.mockRestore();

                // Reveal the answer on the final-reveal step: the same swipe grades.
                internals.state.revealAnswer = true;
                internals.state.route = 'study';
                internals.renderWord(root, current);
                dispatchPointerSwipe(root.querySelector<HTMLElement>('[data-newtab-study]')!, window, deltaX);
                await Promise.resolve();
                await Promise.resolve();

                expect(root.dataset.newtabSwipeDirection).toBe(deltaX < 0 ? 'left' : 'right');
                expect(root.dataset.newtabSwipeAction).toBe(deltaX < 0 ? 'again' : 'good');
                await waitForExpect(() => expect(reviewCard).toHaveBeenCalledWith(current, expectedGrade));
            } finally {
                controller.destroy();
                root.remove();
            }
        };

        await runSwipe(-140, 'nothing');
        await runSwipe(140, 'okay');
    });

    it('lets the status footer toggle JPDB and Anki directly and persists the source setting', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto' as const,
            newTabJpdbDeck: 'deck',
            newTabJpdbReviewMode: 'api-vocabulary' as const,
            immersionKitEnabled: false,
        };
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '日本語', reading: 'にほんご', source: 'jpdb' });
        const ankiCard = newTabTestCard({ vid: -1, sid: -1, rid: 101, spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
        const dictionaryCard = newTabTestCard({ vid: -2, sid: 0, spelling: '書く', reading: 'かく', source: 'local', reviewSource: 'dictionary' });
        const listNewTabCards = vi.fn(async () => [ankiCard]);
        const listDeckCards = vi.fn(async () => [jpdbCard]);
        const controller = newTabBareController(settings, {
            anki: {
                listNewTabCards,
            } as never,
            jpdb: {
                listDeckCards,
            } as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(() => dictionaryCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms: vi.fn(async () => [{ expression: '書く', reading: 'かく', glossary: ['to write'], score: 1, dictionary: 'Local' }]),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        expectNewTabPromptText('日本語');
        expect(listDeckCards).toHaveBeenCalledTimes(1);
        expect(listNewTabCards).toHaveBeenCalledTimes(1);
        const status = newTabStatusButton();
        expect(status.textContent).not.toContain('⇄');
        expect(status.disabled).toBe(true);
        expect(status.closest('[data-newtab-controls]')).toBeNull();
        expect(Array.from(document.querySelectorAll<HTMLElement>('[data-newtab-controls] [data-newtab-action]'))
            .map(element => element.dataset.newtabAction)).toEqual(['previous', 'reveal', 'next']);
        expect(newTabSourceSelect().hidden).toBe(false);
        expect(newTabSourceSelect().value).toBe('jpdb');
        expect(newTabSourceSelectValues()).toContain('anki');

        switchNewTabSource('anki');
        await expectNewTabSourcePrompt(settings, 'anki', '暗記');
        expect(listDeckCards).toHaveBeenCalledTimes(1);
        expect(listNewTabCards).toHaveBeenCalledTimes(1);
        expect(newTabSourceSelect().value).toBe('anki');
        expect(newTabSourceSelectValues()).toContain('jpdb');

        switchNewTabSource('jpdb');
        await expectNewTabSourcePrompt(settings, 'jpdb', '日本語');
        expect(listDeckCards).toHaveBeenCalledTimes(1);
        expect(newTabSourceSelect().value).toBe('jpdb');

        switchNewTabSource('anki');
        await expectNewTabSourcePrompt(settings, 'anki', '暗記');
        expect(listNewTabCards).toHaveBeenCalledTimes(1);

        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    it('switches from JPDB to Anki when saved source state is already stale Anki', async () => {
        resetNewTabReviewStorage();
        const { settings, listDeckCards, listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('jpdb');

        try {
            await controller.renderPage();
            expectNewTabPromptText('日本語');
            expect(newTabSourceSelectValues()).toContain('anki');

            const internals = controller as unknown as {
                state: { route: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            };
            internals.state = { ...internals.state, source: 'anki' };
            switchNewTabSource('anki');

            await expectNewTabSourcePrompt(settings, 'anki', '暗記');
            expect(listDeckCards).toHaveBeenCalledOnce();
            expect(listNewTabCards).toHaveBeenCalledOnce();
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('stamps deck-scoped jpdb-api cards with the Part-of-deck membership line (SH-4)', async () => {
        resetNewTabReviewStorage();
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '世界', reading: 'せかい', cardState: ['due'], vid: 31, source: 'jpdb', reviewSource: 'jpdb-api' }),
        ]);
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            newTabJpdbDeck: '92',
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => [{ id: '92', name: 'Persona 5' }]) } as never,
        });
        try {
            await controller.renderPage();
            const internals = controller as unknown as { allWords: Array<{ spelling: string; jpdbDeckMembership?: string }> };
            await waitForExpect(() => {
                const card = internals.allWords.find(word => word.spelling === '世界');
                expect(card?.jpdbDeckMembership).toBe('Part of the Persona 5 deck');
            });
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('renders the Part-of-deck line for Anki and Jiten cards from their own deck data', () => {
        const controller = newTabPromptController(DEFAULT_SETTINGS, {});
        try {
            const internals = controller as unknown as { providerDeckMembershipLine(card: JPDBCard): string };
            const ankiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki', ankiDeckNames: ['Core 2k'] });
            expect(internals.providerDeckMembershipLine(ankiCard)).toBe('Part of the Core 2k deck');
            const jitenCard = newTabTestCard({ spelling: '辞典', reading: 'じてん', source: 'jiten', reviewSource: 'jiten-api', sourceDeckName: 'ペルソナ5' });
            expect(internals.providerDeckMembershipLine(jitenCard)).toBe('Part of the ペルソナ5 deck');
            const plain = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'local' });
            expect(internals.providerDeckMembershipLine(plain)).toBe('');
        } finally {
            controller.destroy();
        }
    });

    it('filters the Word-tab pool with the JPDB-style Show-only state filter', async () => {
        resetNewTabReviewStorage();
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], vid: 11, source: 'jpdb', reviewSource: 'jpdb-api' }),
            newTabTestCard({ spelling: '書く', reading: 'かく', cardState: ['due'], vid: 12, source: 'jpdb', reviewSource: 'jpdb-api' }),
        ]);
        const controller = newTabJpdbBrowseController(listDeckCards);
        try {
            await controller.renderPage();
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-filter-select]')!;
            await waitForExpect(() => {
                expect(select.hidden).toBe(false);
                expect([...select.options].map(option => option.value)).toContain('known');
            });
            // The default scheduled queue hides the known card.
            expectNewTabPromptText('書く');

            select.value = 'known';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            const internals = controller as unknown as { visibleWords: Array<{ spelling: string }> };
            await waitForExpect(() => {
                expect(internals.visibleWords.map(card => card.spelling)).toEqual(['読む']);
            });
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('keeps the newest Show-only selection when an older pool load resolves later', async () => {
        resetNewTabReviewStorage();
        const olderPool = deferred<JPDBCard[]>();
        const due = newTabTestCard({ spelling: '書く', reading: 'かく', cardState: ['due'], vid: 12, source: 'jpdb', reviewSource: 'jpdb-api' });
        const known = newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], vid: 11, source: 'jpdb', reviewSource: 'jpdb-api' });
        const blacklisted = newTabTestCard({ spelling: '消す', reading: 'けす', cardState: ['blacklisted'], vid: 13, source: 'jpdb', reviewSource: 'jpdb-api' });
        const listDeckCards = vi.fn()
            .mockResolvedValueOnce([due])
            .mockImplementationOnce(() => olderPool.promise);
        const controller = newTabJpdbBrowseController(listDeckCards);
        try {
            await controller.renderPage();
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-filter-select]')!;
            select.value = 'known';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await waitForExpect(() => expect(listDeckCards).toHaveBeenCalledTimes(2));

            select.value = 'blacklisted';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            olderPool.resolve([known, due, blacklisted]);

            const internals = controller as unknown as {
                state: { filter: string };
                visibleWords: Array<{ spelling: string }>;
            };
            await waitForExpect(() => {
                expect(internals.state.filter).toBe('blacklisted');
                expect(internals.visibleWords.map(card => card.spelling)).toEqual(['消す']);
            });
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('keeps a Show-only selection when a lookup popup changes a card while its pool loads', async () => {
        resetNewTabReviewStorage();
        const pool = deferred<JPDBCard[]>();
        const due = newTabTestCard({ spelling: '書く', reading: 'かく', cardState: ['due'], vid: 12, source: 'jpdb', reviewSource: 'jpdb-api' });
        const known = newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], vid: 11, source: 'jpdb', reviewSource: 'jpdb-api' });
        const savedFromPopup = newTabTestCard({ spelling: '見る', reading: 'みる', cardState: ['known'], vid: 14, source: 'jpdb', reviewSource: 'jpdb-api' });
        const listDeckCards = vi.fn()
            .mockResolvedValueOnce([due])
            .mockImplementationOnce(() => pool.promise)
            .mockResolvedValue([known, savedFromPopup, due]);
        const controller = newTabJpdbBrowseController(listDeckCards);
        const internals = controller as unknown as {
            state: { filter: string };
            visibleWords: Array<{ spelling: string }>;
        };
        const showOnly = (value: string): void => {
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-filter-select]')!;
            select.value = value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        };
        try {
            await controller.renderPage();
            showOnly('known');
            await waitForExpect(() => expect(listDeckCards).toHaveBeenCalledTimes(2));

            // NewTabRuntime's call after a popup grade or save lands mid-load.
            controller.refreshBrowseAfterCardMutation();
            pool.resolve([known, due]);
            await waitForExpect(() => {
                expect(internals.state.filter).toBe('known');
                expect(internals.visibleWords.map(card => card.spelling)).toEqual(['読む']);
            });

            // The next Show-only choice loads the words again, with the popup's change.
            showOnly('study');
            showOnly('known');
            await waitForExpect(() => expect(internals.visibleWords.map(card => card.spelling).sort()).toEqual(['見る', '読む'].sort()));
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('hides the Show-only state filter when no provider credential exists (keyless)', async () => {
        resetNewTabReviewStorage();
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', ankiEnabled: false });
        try {
            await controller.renderPage();
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-filter-select]')!;
            // Keyless cards carry no provider states, so the filter would
            // only ever hide everything (user-reported confusion).
            expect(select.hidden).toBe(true);
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('broadcasts the refreshed card state after a live-bridge grade when an API key exists (mutation-bus P0)', async () => {
        vi.useFakeTimers();
        const refreshCardState = vi.fn(async (card: JPDBCard) => { card.cardState = ['known']; });
        const grade = vi.fn();
        const requestCurrent = vi.fn();
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key' }, {
            jpdb: { refreshCardState } as never,
            jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: true }), grade, requestCurrent } as never,
        });
        try {
            const internals = controller as unknown as {
                submitLiveJpdbGrade(card: JPDBCard, grade: JPDBGrade): void;
                publishGradedCardState(card: JPDBCard): void;
            };
            const published: string[] = [];
            internals.publishGradedCardState = card => { published.push(card.cardState.join(',')); };
            const card = newTabTestCard({ vid: 2850623, sid: 1446586255, spelling: '出来事', reading: 'できごと', cardState: ['due'], source: 'jpdb', reviewSource: 'jpdb-live' });

            internals.submitLiveJpdbGrade(card, 'okay');
            expect(grade).toHaveBeenCalledWith('okay');
            await vi.advanceTimersByTimeAsync(1000);

            expect(refreshCardState).toHaveBeenCalledWith(card);
            // Broadcast carries the TRUE post-grade state read back from jpdb.
            expect(published).toEqual(['known']);
        } finally {
            controller.destroy();
            vi.useRealTimers();
        }
    });

    it('extracts real vid/sid from the live bridge card id so the refresh can target it', () => {
        const controller = newTabPromptController(DEFAULT_SETTINGS, {});
        try {
            const internals = controller as unknown as { cardFromLiveJpdb(card: { kind: string; id: string; spelling: string; reading: string }): JPDBCard | null };
            const card = internals.cardFromLiveJpdb({ kind: 'vocabulary', id: 'vf,2850623,1446586255', spelling: '出来事', reading: 'できごと' });
            expect(card?.vid).toBe(2850623);
            expect(card?.sid).toBe(1446586255);
            const unparsable = internals.cardFromLiveJpdb({ kind: 'vocabulary', id: '出来事:できごと', spelling: '出来事', reading: 'できごと' });
            expect(unparsable?.vid).toBe(0);
        } finally {
            controller.destroy();
        }
    });

    it('keeps Anki native review separate from optional kanji practice', () => {
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS,  }, {});
        try {
            const internals = controller as unknown as {
                studySessionForCard(card: JPDBCard, renderAsKanji?: boolean): {
                    steps: Array<{ kind: string; kanji?: string }>;
                    practiceSteps: Array<{ kind: string; kanji?: string; gradeable: boolean }>;
                };
            };
            const wordCard = newTabTestCard({ vid: -1, sid: -1, rid: 401, ankiCardId: 401, spelling: '暗記', reading: 'あんき', cardState: ['due'], source: 'anki', reviewSource: 'anki' });
            const rtkCard = newTabTestCard({ vid: -2, sid: -2, rid: 402, ankiCardId: 402, spelling: '記', reading: 'き', cardState: ['known'], source: 'anki', reviewSource: 'anki', kanjiKeyword: 'scribe' });
            const wordSession = internals.studySessionForCard(wordCard, false);
            const rtkSession = internals.studySessionForCard(rtkCard, true);

            expect(wordSession.practiceSteps.filter(step => step.kind === 'kanji-doodle').map(step => step.kanji)).toEqual(['暗', '記']);
            expect(rtkSession.practiceSteps.filter(step => step.kind === 'kanji-doodle').map(step => step.kanji)).toEqual(['記']);
            expect(wordSession.steps.map(step => step.kind)).toEqual(['word', 'final-reveal']);
            expect(wordSession.practiceSteps.every(step => !step.gradeable)).toBe(true);
            expect(rtkSession.practiceSteps.every(step => !step.gradeable)).toBe(true);
            expect(wordCard).toMatchObject({ spelling: '暗記', ankiCardId: 401, source: 'anki', reviewSource: 'anki' });
            expect(rtkCard).toMatchObject({ spelling: '記', ankiCardId: 402, kanjiKeyword: 'scribe' });
        } finally {
            controller.destroy();
        }
    });

    it('scopes the Anki queue to the deck chosen in the in-page deck selector (SH-6 Anki)', async () => {
        resetNewTabReviewStorage();
        const { listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('anki');
        const internals = controller as unknown as { dependencies: { anki: { invoke?: (action: string) => Promise<string[]> } } };
        internals.dependencies.anki.invoke = vi.fn(async () => ['Core', 'Mining']);
        try {
            await controller.renderPage();
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-deck-select]')!;
            await waitForExpect(() => {
                expect(select.hidden).toBe(false);
                expect([...select.options].map(option => option.value)).toContain('Core');
            });
            select.value = 'Core';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await waitForExpect(() => {
                expect(listNewTabCards).toHaveBeenCalledWith(expect.anything(), 'Core');
            });
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('keeps the JPDB deck selector populated while deck options are fetching', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            newTabJpdbDeck: 'deck',
        };
        const decks = deferred<JpdbDeckOption[]>();
        const { controller, select, populate } = newTabJpdbDeckSelectorFixture(settings, () => decks.promise);

        try {
            const populated = populate();
            expect([...select.options].map(option => option.value)).toEqual(['deck']);
            expect(select.textContent).toBe('deck');
            expect(select.value).toBe('deck');

            decks.resolve([{ id: 'deck', name: '誕生日', vocabularyCount: 39, knownCoverage: 65.12 }]);
            await populated;

            expect([...select.options].map(option => option.textContent)).toContain('誕生日 · 39 · 65%');
            expect(select.value).toBe('deck');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('scopes the study queue to the deck chosen in the in-page deck selector (SH-6)', async () => {
        resetNewTabReviewStorage();
        const { listDeckCards, controller } = newTabJpdbAnkiSourceFixture('jpdb');
        const internals = controller as unknown as { dependencies: { jpdb: { listDecks?: () => Promise<Array<{ id: string; name: string }>> } } };
        internals.dependencies.jpdb.listDecks = vi.fn(async () => [{ id: '89', name: '誕生日', vocabularyCount: 39, knownCoverage: 65.12 }]);

        try {
            await controller.renderPage();
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-deck-select]')!;
            await waitForExpect(() => {
                expect(select.hidden).toBe(false);
                const labels = [...select.options].map(option => option.textContent);
                expect(labels).toContain('All vocabulary');
                // jpdb Learn parity: deck entries carry their progress.
                expect(labels).toContain('誕生日 · 39 · 65%');
            });
            // Initial load used the settings deck.
            expect(listDeckCards).toHaveBeenCalledWith('deck', expect.anything(), expect.anything());

            select.value = '89';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await waitForExpect(() => {
                expect(listDeckCards).toHaveBeenCalledWith('89', expect.anything(), expect.anything());
            });
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('scopes the study queue to a Jiten deck from the in-page deck selector', async () => {
        resetNewTabReviewStorage();
        const first = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 0,
        });
        const second = newTabTestCard({
            spelling: '勉強',
            reading: 'べんきょう',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 43,
            jitenReadingIndex: 0,
        });
        const listStudyBatchCards = vi.fn(async () => [first, second]);
        const listStudyDecks = vi.fn(async () => [{ id: '7', name: 'Persona' }]);
        const studyDeckWordKeys = vi.fn(async () => new Set(['43:0']));
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            jiten: { listStudyBatchCards, listStudyDecks, studyDeckWordKeys, reviewCard: vi.fn() } as never,
        });

        try {
            await controller.renderPage();
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-deck-select]')!;
            await waitForExpect(() => {
                expect(select.hidden).toBe(false);
                expect([...select.options].map(option => option.value)).toContain('jiten:7');
            });

            select.value = 'jiten:7';
            select.dispatchEvent(new Event('change', { bubbles: true }));

            await waitForExpect(() => {
                expect(studyDeckWordKeys).toHaveBeenCalledWith(7);
                expect(newTabPromptText()).toBe('勉強');
            });
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('refreshes Jiten deck options when a legacy Jiten API key changes', async () => {
        resetNewTabReviewStorage();
        let settings: NewTabSettings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'ak_old-jiten-key',
            jitenApiKey: '',
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        };
        const listStudyDecks = vi.fn()
            .mockResolvedValueOnce([{ id: 7, name: 'Old Persona' }])
            .mockResolvedValueOnce([{ id: 8, name: 'New Persona' }]);
        const controller = newTabBareController(() => settings, {
            jiten: { listStudyDecks, listStudyBatchCards: vi.fn(async () => []), reviewCard: vi.fn() } as never,
        });
        const internals = controller as unknown as {
            populateDeckSelector(select: HTMLSelectElement, settings: NewTabSettings): Promise<void>;
        };
        const select = document.createElement('select');
        document.body.append(select);

        try {
            await internals.populateDeckSelector(select, settings);
            expect([...select.options].map(option => option.value)).toContain('jiten:7');

            settings = { ...settings, apiKey: 'ak_new-jiten-key' };
            await internals.populateDeckSelector(select, settings);

            expect(listStudyDecks).toHaveBeenCalledTimes(2);
            expect([...select.options].map(option => option.value)).toContain('jiten:8');
            expect([...select.options].map(option => option.value)).not.toContain('jiten:7');
        } finally {
            document.body.replaceChildren();
            resetNewTabReviewStorage();
        }
    });

    it('advertises grading keys on the study controls like jpdb.io and Jiten (SH-8)', () => {
        const buttons = renderNewTabGradeControlButtons({
            apiShortLabel: 'JPDB',
            bothLabel: 'Both',
            grades: [['nothing', 'Nothing'], ['something', 'Something'], ['hard', 'Hard'], ['okay', 'Okay'], ['easy', 'Easy']],
            selectorLabel: 'Grade target',
            keyHints: { nothing: '1', something: '2', hard: '3', okay: '4', easy: '5' },
            selectedOption: undefined,
            summary: '',
            targetLabel: 'Grades JPDB',
            targetOptions: [],
        } as never);
        const gradeButtons = buttons.filter(node => node.matches?.('[data-newtab-action="grade"]')) as HTMLButtonElement[];
        // Defaults still show the familiar rendered-order digits.
        expect(gradeButtons.map(button => button.querySelector('.jpdb-reader-newtab-key-hint')?.textContent)).toEqual(['1', '2', '3', '4', '5']);
        // Hints stay out of the accessible name (digit order is positional).
        expect(gradeButtons[0]?.querySelector('.jpdb-reader-newtab-key-hint')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('uses four positional Jiten shortcuts and hints', () => {
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, jitenApiKey: 'jiten-key' }, {});
        const card = newTabTestCard({ source: 'jiten', reviewSource: 'jiten-api' });
        const internals = controller as unknown as { studyGradeShortcutHints(card: JPDBCard): unknown };
        expect(internals.studyGradeShortcutHints(card)).toEqual({ nothing: '1', hard: '2', okay: '3', easy: '4' });
        controller.destroy();
    });

    it.each([false, true])('uses the actual Anki destination for a Jiten-origin card (Jiten available=%s)', async jitenAvailable => {
        const answerCard = vi.fn(async () => undefined);
        const reviewCard = vi.fn(async () => undefined);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: jitenAvailable ? 'jiten-key' : '',
            ankiEnabled: true, newTabAnkiEnabled: true, newTabParsingEnabled: false, immersionKitEnabled: false,
        }, { anki: { answerCard } as never, jiten: { reviewCard } as never });
        const card = newTabTestCard({ source: 'jiten', reviewSource: 'jiten-api', ankiCardId: 404, cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, { state: { source: 'jpdb', revealAnswer: true }, bindRootEvents: true });
        try {
            const select = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]');
            if (jitenAvailable) {
                expect(root.querySelectorAll('[data-newtab-action="grade"]')).toHaveLength(4);
                select!.selectedIndex = [...select!.options].findIndex(option => readReviewTargetCapability(option)?.target === 'anki');
                const option = select!.options[select!.selectedIndex]!;
                option.dataset.newtabReviewTarget = 'jiten';
                option.dataset.ankiCardId = '999';
                select!.dispatchEvent(new Event('change', { bubbles: true }));
            } else expect(select).toBeNull();
            expect(root.querySelectorAll('[data-newtab-action="grade"]')).toHaveLength(4);
            expect([...root.querySelectorAll('.jpdb-reader-newtab-grade-label')].map(node => node.textContent)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
            const hard = root.querySelector<HTMLButtonElement>('[data-grade="hard"]')!;
            hard.dataset.grade = 'easy';
            expect(dispatchNewTabKeyboard(root, '2').defaultPrevented).toBe(true);
            await waitForExpect(() => expect(answerCard).toHaveBeenCalledWith(404, 'hard'));
            expect(answerCard).toHaveBeenCalledTimes(1);
            expect(reviewCard).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('rejects a grade when the displayed card was replaced in the queue', async () => {
        const reviewCard = vi.fn(async () => undefined);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, jitenApiKey: 'jiten-key', newTabParsingEnabled: false, immersionKitEnabled: false },
            { jiten: { reviewCard } as never });
        const displayed = newTabTestCard({ vid: 42, source: 'jiten', reviewSource: 'jiten-api', cardState: ['due'] });
        const replacement = newTabTestCard({ vid: 43, spelling: '別', source: 'jiten', reviewSource: 'jiten-api', cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, displayed, { state: { source: 'jpdb', revealAnswer: true }, bindRootEvents: true });
        try {
            Object.assign(controller, { visibleWords: [replacement], allWords: [replacement], index: 0 });
            dispatchNewTabKeyboard(root, '2');
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(reviewCard).not.toHaveBeenCalled();
        } finally { controller.destroy(); root.remove(); }
    });

    it('rejects a replacement Anki card with the same word identity', async () => {
        const answerCard = vi.fn(async () => undefined);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, jitenApiKey: '', apiKey: '', ankiEnabled: true,
            newTabAnkiEnabled: true, newTabParsingEnabled: false, immersionKitEnabled: false,
        }, { anki: { answerCard } as never });
        const displayed = newTabTestCard({ source: 'jiten', reviewSource: 'jiten-api', ankiCardId: 404, cardState: ['due'] });
        const replacement = { ...displayed, ankiCardId: 405 };
        const root = renderSeededNewTabWord(controller, displayed, { state: { source: 'jpdb', revealAnswer: true }, bindRootEvents: true });
        try {
            Object.assign(controller, { visibleWords: [replacement], allWords: [replacement], index: 0 });
            dispatchNewTabKeyboard(root, '2');
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(answerCard).not.toHaveBeenCalled();
        } finally { controller.destroy(); root.remove(); }
    });

    it('submits at most one Jiten grade while the first provider request is pending', async () => {
        const pending = deferred<void>();
        const reviewCard = vi.fn(() => pending.promise);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, jitenApiKey: 'jiten-key', newTabParsingEnabled: false, immersionKitEnabled: false },
            { jiten: { reviewCard } as never });
        const card = newTabTestCard({ source: 'jiten', reviewSource: 'jiten-api', cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, { state: { source: 'jpdb', revealAnswer: true }, bindRootEvents: true });
        try {
            dispatchNewTabKeyboard(root, '2');
            dispatchNewTabKeyboard(root, '3');
            root.querySelector<HTMLButtonElement>('[data-grade="easy"]')!.click();
            await waitForExpect(() => expect(reviewCard).toHaveBeenCalled());
            expect(reviewCard).toHaveBeenCalledTimes(1);
        } finally { pending.resolve(); controller.destroy(); root.remove(); }
    });

    it('unlocks after a rejected Jiten request and allows the next rendered card', async () => {
        const pending = deferred<void>();
        const reviewCard = vi.fn().mockImplementationOnce(async () => { await pending.promise; throw new Error('Provider rejected the review'); }).mockResolvedValue(undefined);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, jitenApiKey: 'jiten-key', newTabOfflineEnabled: false, newTabParsingEnabled: false, immersionKitEnabled: false },
            { jiten: { reviewCard } as never });
        const first = newTabTestCard({ vid: 42, source: 'jiten', reviewSource: 'jiten-api', cardState: ['due'] });
        const next = newTabTestCard({ vid: 43, source: 'jiten', reviewSource: 'jiten-api', cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, first, { state: { source: 'jpdb', revealAnswer: true }, bindRootEvents: true });
        try {
            dispatchNewTabKeyboard(root, '2');
            pending.resolve();
            await waitForExpect(() => expect((controller as unknown as { gradeSubmissionInFlight: boolean }).gradeSubmissionInFlight).toBe(false));
            Object.assign(controller, { visibleWords: [next], allWords: [next], index: 0 });
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, next);
            dispatchNewTabKeyboard(root, '2');
            await waitForExpect(() => expect(reviewCard).toHaveBeenCalledWith(next, 'hard'));
            expect(reviewCard).toHaveBeenCalledTimes(2);
        } finally { controller.destroy(); root.remove(); }
    });

    it.each([['jiten', false], ['jiten', true], ['jpdb', false]] as const)('preserves Both writes for %s-origin merged cards with Anki=%s', async (source, withAnki) => {
        const jitenReview = vi.fn(async () => undefined);
        const jpdbReview = vi.fn(async () => undefined);
        const answerCard = vi.fn(async () => undefined);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, jitenApiKey: 'jiten-key', apiKey: 'jpdb-key',
            ankiEnabled: withAnki, newTabAnkiEnabled: withAnki, newTabParsingEnabled: false, immersionKitEnabled: false,
        }, { jiten: { reviewCard: jitenReview } as never, jpdb: { reviewCard: jpdbReview } as never, anki: { answerCard } as never });
        const card = newTabTestCard({ source, reviewSource: 'jpdb-api', jitenWordId: 42, jitenReadingIndex: 0, ankiCardId: withAnki ? 404 : undefined, cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, { state: { source: 'jpdb', revealAnswer: true }, bindRootEvents: true });
        try {
            const select = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]')!;
            expect(readReviewTargetCapability(select.options[select.selectedIndex])?.target).toBe('both');
            expect(root.querySelectorAll('[data-newtab-action="grade"]')).toHaveLength(4);
            dispatchNewTabKeyboard(root, '2');
            await waitForExpect(() => {
                expect(jitenReview).toHaveBeenCalledWith(card, 'hard');
                expect(jpdbReview).toHaveBeenCalledWith(card, 'hard');
                expect(answerCard).toHaveBeenCalledTimes(withAnki ? 1 : 0);
            });
            expect(jitenReview).toHaveBeenCalledTimes(1);
            expect(jpdbReview).toHaveBeenCalledTimes(1);
        } finally { controller.destroy(); root.remove(); }
    });

    it.each(['regular', 'fsrs'] as const)('preserves Bunpro %s input with the two-button preference enabled', async mode => {
        vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('pointer: fine') || query.includes('hover: hover') }));
        const review = vi.fn(async (_request: { grade: JPDBGrade }) => ({}));
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, twoButtonReviews: true,
            bunproFrontendApiToken: 'bunpro-token', bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
            newTabParsingEnabled: false, immersionKitEnabled: false,
        }, { srsAdapters: { bunpro: { hasCredential: () => true, review } as never } });
        const card = newTabTestCard({ source: 'bunpro', reviewSource: 'bunpro-api', bunproReviewId: '7701',
            bunproReviewableId: 8801, bunproReviewableType: 'vocabulary', bunproReviewSessionId: '44',
            bunproReviewInputMode: mode, bunproReviewEndpoint: 'review', cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, { state: { source: 'bunpro', revealAnswer: true }, bindRootEvents: true });
        try {
            expect([...root.querySelectorAll('.jpdb-reader-newtab-grade-label')].map(node => node.textContent)).toEqual(mode === 'fsrs' ? ['Again', 'Hard', 'Good', 'Easy'] : ['Hard', 'Good']);
            expect([...root.querySelectorAll('[data-newtab-action="grade"] .jpdb-reader-newtab-key-hint')].map(node => node.textContent)).toEqual(mode === 'fsrs' ? ['1', '2', '3', '4'] : ['1', '2']);
            dispatchNewTabKeyboard(root, '2');
            await waitForExpect(() => expect(review).toHaveBeenCalledTimes(1));
            expect(review.mock.calls[0]?.[0].grade).toBe(mode === 'fsrs' ? 'hard' : 'pass');
        } finally { controller.destroy(); root.remove(); }
    });

    it.each(['jpdb', 'anki', 'both'] as const)('switches five-to-four native controls and submits only the selected %s destination', async selectedTarget => {
        const reviewCard = vi.fn(async () => undefined);
        const answerCard = vi.fn(async () => undefined);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jitenApiKey: '', ankiEnabled: true,
            newTabAnkiEnabled: true, newTabParsingEnabled: false, immersionKitEnabled: false,
        }, { jpdb: { reviewCard } as never, anki: { answerCard } as never });
        const card = newTabTestCard({ source: 'jpdb', reviewSource: 'jpdb-api', ankiCardId: 404, cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, { state: { source: 'jpdb', revealAnswer: true }, bindRootEvents: true });
        try {
            const select = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]')!;
            for (const target of ['both', 'anki', 'jpdb', selectedTarget]) {
                select.selectedIndex = [...select.options].findIndex(option => readReviewTargetCapability(option)?.target === target);
                select.dispatchEvent(new Event('change', { bubbles: true }));
                expect([...root.querySelectorAll('.jpdb-reader-newtab-grade-label')].map(node => node.textContent)).toEqual(target === 'anki'
                    ? ['Again', 'Hard', 'Good', 'Easy'] : ['Nothing', 'Something', 'Hard', 'Okay', 'Easy']);
                if (target === 'anki') {
                    dispatchNewTabKeyboard(root, '5');
                    await new Promise(resolve => setTimeout(resolve, 0));
                    expect(answerCard).not.toHaveBeenCalled();
                    expect(reviewCard).not.toHaveBeenCalled();
                }
            }
            dispatchNewTabKeyboard(root, '2');
            await waitForExpect(() => {
                expect(reviewCard).toHaveBeenCalledTimes(selectedTarget === 'anki' ? 0 : 1);
                expect(answerCard).toHaveBeenCalledTimes(selectedTarget === 'jpdb' ? 0 : 1);
            });
            if (selectedTarget !== 'anki') expect(reviewCard).toHaveBeenCalledWith(card, 'something');
            if (selectedTarget !== 'jpdb') expect(answerCard).toHaveBeenCalledWith(404, selectedTarget === 'anki' ? 'hard' : 'something');
        } finally { controller.destroy(); root.remove(); }
    });

    it.each(['jiten', 'anki', 'both'] as const)('submits to %s after cycling actual Jiten/Anki/Both controls', async selectedTarget => {
        vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('pointer: fine') || query.includes('hover: hover') }));
        const reviewCard = vi.fn(async () => undefined);
        const answerCard = vi.fn(async () => undefined);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, jitenApiKey: 'jiten-key', apiKey: '', ankiEnabled: true,
            newTabAnkiEnabled: true, newTabParsingEnabled: false, immersionKitEnabled: false,
        }, { jiten: { reviewCard } as never, anki: { answerCard } as never });
        const card = newTabTestCard({ source: 'jiten', reviewSource: 'jiten-api', ankiCardId: 404, cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, { state: { source: 'jpdb', revealAnswer: true }, bindRootEvents: true });
        try {
            const select = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]')!;
            for (const target of ['jiten', 'anki', 'both', selectedTarget]) {
                select.selectedIndex = [...select.options].findIndex(option => readReviewTargetCapability(option)?.target === target);
                select.dispatchEvent(new Event('change', { bubbles: true }));
                expect([...root.querySelectorAll('[data-newtab-action="grade"] .jpdb-reader-newtab-key-hint')].map(node => node.textContent))
                    .toEqual(['1', '2', '3', '4']);
            }
            dispatchNewTabKeyboard(root, '2');
            await waitForExpect(() => {
                expect(reviewCard).toHaveBeenCalledTimes(selectedTarget === 'anki' ? 0 : 1);
                expect(answerCard).toHaveBeenCalledTimes(selectedTarget === 'jiten' ? 0 : 1);
            });
            if (selectedTarget !== 'anki') expect(reviewCard).toHaveBeenCalledWith(card, 'hard');
            if (selectedTarget !== 'jiten') expect(answerCard).toHaveBeenCalledWith(404, 'hard');
        } finally { controller.destroy(); root.remove(); }
    });

    it('fails closed on Study click, key and swipe until its own selector is restored', async () => {
        const reviewCard = vi.fn(async () => undefined);
        const answerCard = vi.fn(async () => undefined);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, jitenApiKey: 'jiten-key', apiKey: '', ankiEnabled: true,
            newTabAnkiEnabled: true, newTabSwipeReviews: true, newTabParsingEnabled: false, immersionKitEnabled: false,
        }, { jiten: { reviewCard } as never, anki: { answerCard } as never });
        const card = newTabTestCard({ source: 'jiten', reviewSource: 'jiten-api', ankiCardId: 404, cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, { state: { source: 'jpdb', revealAnswer: true }, bindRootEvents: true });
        try {
            const select = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]')!;
            const parent = select.parentElement!;
            select.remove();
            root.querySelector<HTMLButtonElement>('[data-grade="hard"]')!.click();
            dispatchNewTabKeyboard(root, '2');
            (controller as unknown as { handleNewTabSwipe(root: HTMLElement, action: string, direction: string): void }).handleNewTabSwipe(root, 'good', 'left');
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(reviewCard).not.toHaveBeenCalled();
            expect(answerCard).not.toHaveBeenCalled();
            parent.append(select);
            dispatchNewTabKeyboard(root, '2');
            await waitForExpect(() => {
                expect(reviewCard).toHaveBeenCalledWith(card, 'hard');
                expect(answerCard).toHaveBeenCalledWith(404, 'hard');
            });
            expect(reviewCard).toHaveBeenCalledTimes(1);
            expect(answerCard).toHaveBeenCalledTimes(1);
        } finally { controller.destroy(); root.remove(); }
    });

    it('advertises Space on the active Study control', () => {
        const controller = newTabPromptController(DEFAULT_SETTINGS, {});
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'local' });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { source: 'dictionary', revealAnswer: false },
        });
        try {
            expect(root.querySelector('[data-newtab-action="reveal"] .jpdb-reader-newtab-key-hint')?.textContent).toBe('Space');
        } finally {
            controller.destroy();
        }
    });

    it('hides reveal shortcut hints when Study shortcut hints are disabled', () => {
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, newTabShortcutHintsEnabled: false }, {});
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'local' });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { source: 'dictionary', revealAnswer: false },
        });
        try {
            expect(root.querySelector('[data-newtab-action="reveal"] .jpdb-reader-newtab-key-hint')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('does not render reveal shortcut hints on touch-only devices', () => {
        const originalMatchMedia = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
        Object.defineProperty(globalThis, 'matchMedia', {
            configurable: true,
            value: (query: string) => ({
                matches: query === '(pointer: coarse)' || query === '(hover: none)',
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            } as unknown as MediaQueryList),
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, {});
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'local' });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { source: 'dictionary', revealAnswer: false },
        });
        try {
            expect(root.querySelector('[data-newtab-action="reveal"] .jpdb-reader-newtab-key-hint')).toBeNull();
        } finally {
            controller.destroy();
            root.remove();
            if (originalMatchMedia) Object.defineProperty(globalThis, 'matchMedia', originalMatchMedia);
            else Reflect.deleteProperty(globalThis, 'matchMedia');
        }
    });

    it('renders the Composed-of component-kanji line on revealed word backs (SH-4)', async () => {
        const rtkLookup = vi.fn(async (kanji: string) => kanji === '日' ? { keyword: 'day' } : null);
        const jpdbKanjiLookup = vi.fn(async (kanji: string) => kanji === '本' ? { keyword: 'book' } : null);
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            rtk: { lookup: rtkLookup } as never,
            jpdbKanji: { lookup: jpdbKanjiLookup } as never,
        });
        const card = newTabTestCard({ spelling: '日本', reading: 'にほん', source: 'jpdb', cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'JPDB',
            state: { source: 'jpdb', revealAnswer: true },
            appendToDocument: true,
        });
        try {
            const row = root.querySelector<HTMLElement>('[data-newtab-composed-of]')!;
            expect(row).not.toBeNull();
            const chips = [...row.querySelectorAll<HTMLElement>('[data-kanji]')];
            expect(chips.map(chip => chip.dataset.kanji)).toEqual(['日', '本']);
            // Chips reuse the kanji popover action for drilldown.
            expect(chips[0].dataset.action).toBe('kanji');
            await waitForExpect(() => {
                expect(row.textContent).toContain('day');
                expect(row.textContent).toContain('book');
            });
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('composed-of chips open the kanji popover in place, keeping the studied card', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const showKanjiCard = vi.fn();
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: false,

        }, {
            showKanjiCard,
            rtk: { lookup: vi.fn(async () => null) } as never,
            dictionaries: { lookupKanji: vi.fn(async () => []) } as never,
        });
        const card = newTabTestCard({ spelling: '日本', reading: 'にほん', source: 'jpdb', cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'JPDB',
            state: { source: 'jpdb', revealAnswer: true },
            studyStepId: 'final-reveal',
            appendToDocument: true,
            bindRootEvents: true,
        });
        try {
            const chip = root.querySelector<HTMLButtonElement>('[data-newtab-composed-of] [data-kanji="本"]')!;
            expect(chip).not.toBeNull();
            chip.click();
            // The kanji surfaces in the standard anchored popover; the study card
            // stays put — no disruptive swap to a synthetic kanji queue.
            expect(showKanjiCard).toHaveBeenCalledTimes(1);
            expect(showKanjiCard.mock.calls[0][1]).toBe('本');
            expect(root.classList.contains('jpdb-reader-newtab-kanji-mode')).toBe(false);
            const state = (controller as unknown as { state: { route: string; revealAnswer: boolean } }).state;
            expect(state.route).toBe('study');
            expect(state.revealAnswer).toBe(true);
        } finally {
            controller.destroy();
            document.body.replaceChildren();
            restoreCanvas();
        }
    });

    it('skips the Composed-of line for kana-only words', () => {
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            rtk: { lookup: vi.fn(async () => null) } as never,
        });
        const card = newTabTestCard({ spelling: 'よむ', reading: 'よむ', source: 'jpdb', cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'JPDB',
            state: { source: 'jpdb', revealAnswer: true },
        });
        try {
            expect(root.querySelector('[data-newtab-composed-of]')).toBeNull();
        } finally {
            controller.destroy();
        }
    });
});
