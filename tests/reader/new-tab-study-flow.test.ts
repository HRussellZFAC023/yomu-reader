import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { NewTabController } from '../../src/reader/newtab/controller';
import { pitchPatternFromPosition } from '../../src/reader/lookup/pitch-accent';
import { cardKey } from '../../src/reader/cards/utils';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

// 飲み物 (nomimono, "drink") — the owner's ambiguous example: ＿み物 alone fits
// 読み物 / 飲み物 / 編み物, so the draw prompt must carry the meaning.
function drinkCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 30,
        sid: 31,
        rid: 0,
        spelling: '飲み物',
        reading: 'のみもの',
        frequencyRank: 1500,
        partOfSpeech: ['n'],
        meanings: [{ glosses: ['drink', 'beverage'], partOfSpeech: ['n'] }],
        cardState: ['due'],
        pitchAccent: [pitchPatternFromPosition('のみもの', 3)],
        wordWithReading: null,
        source: 'jpdb',
        reviewSource: 'jpdb-api',
        sentence: '冷たい飲み物が欲しい。',
        ...overrides,
    } as JPDBCard;
}

function studyRoot(): HTMLElement {
    const root = document.createElement('main');
    root.className = 'jpdb-reader-newtab';
    root.dataset.jpdbReaderRoot = 'true';
    root.innerHTML = `
        <section class="jpdb-reader-newtab-study" data-newtab-study>
            <div class="jpdb-reader-newtab-study-steps" data-newtab-study-steps role="list"></div>
            <div data-newtab-study-tour hidden></div>
            <div data-newtab-count></div>
            <h1 data-newtab-prompt></h1>
            <div data-newtab-reading></div>
            <div data-newtab-meaning></div>
            <button data-newtab-status></button>
            <nav data-newtab-controls></nav>
            <button data-newtab-action="reveal"></button>
        </section>
    `;
    document.body.replaceChildren(root);
    return root;
}

interface StudyInternals {
    allWords: JPDBCard[];
    visibleWords: JPDBCard[];
    index: number;
    reviewCountMode: boolean;
    state: Record<string, unknown>;
    studyHintDepth: Map<string, number>;
    pitchOutcomes: Map<string, { position: number; outcome: 'correct' | 'wrong' }>;
    renderWord(root: HTMLElement, card: JPDBCard): void;
    bindRootEvents(root: HTMLElement): void;
    pickListenPosition(position: number): void;
}

function studyController(cards: JPDBCard[], settings: Partial<ReaderSettings> = {}) {
    const playWordAudio = vi.fn(async () => undefined);
    const mergedSettings: ReaderSettings = {
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        enableReviews: true,
        jpdbMiningEnabled: true,
        apiKey: 'jpdb-key',
        ...settings,
    };
    const controller = new NewTabController({
        getSettings: () => mergedSettings,
        anki: {} as never,
        jpdb: { reviewCard: vi.fn(async () => undefined) } as never,
        jiten: {} as never,
        jpdbKanji: { lookup: vi.fn(async () => null) } as never,
        kanjiVG: {} as never,
        rtk: {} as never,
        immersionKit: {} as never,
        jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }), reveal: vi.fn(), grade: vi.fn(), requestCurrent: vi.fn() } as never,
        parser: {} as never,
        dictionaries: {} as never,
        onSettingsChange: vi.fn(),
        applyTheme: vi.fn(),
        showSettings: vi.fn(),
        dismiss: vi.fn(),
        dismissLookup: vi.fn(),
        toast: vi.fn(),
        playWordAudio,
    } as never);
    const internals = controller as unknown as StudyInternals;
    internals.allWords = cards.slice();
    internals.visibleWords = cards.slice();
    internals.index = 0;
    internals.reviewCountMode = true;
    internals.state = {
        mode: 'kanji',
        listenSubMode: 'perceive',
        sort: 'random',
        filter: 'study',
        source: 'jpdb',
        revealAnswer: false,
        jpdbDeck: '',
        ankiDeck: '',
        keyHintsDismissed: false,
    };
    return { controller, internals, playWordAudio };
}

afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
});

describe('study flow: kanji-draw prompt clarity', () => {
    it('carries the word meaning and blanks EVERY kanji in the cloze', () => {
        const { controller, internals } = studyController([drinkCard()]);
        const root = studyRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            const context = root.querySelector('.jpdb-reader-newtab-kanji-front-context');
            expect(context?.querySelector('.jpdb-reader-newtab-kanji-front-meaning')?.textContent).toBe('drink');
            // 物 is the answer to the SECOND kanji draw step — a visible 物 on
            // the 飲 step leaked it (owner: "gives answer to next question").
            expect(context?.querySelector('.jpdb-reader-newtab-kanji-front-cloze')?.textContent).toBe('＿み＿');
            // The reading is never leaked on the draw front.
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).not.toContain('のみもの');
        } finally {
            controller.destroy();
        }
    });
});

describe('study flow: progressive hints', () => {
    it('reveals hints one tier at a time on the kanji-draw step, never the reading', () => {
        const { controller, internals } = studyController([drinkCard({ kanjiKeyword: 'drink (v.)' })]);
        const root = studyRoot();
        try {
            internals.bindRootEvents(root);
            internals.renderWord(root, internals.visibleWords[0]);
            // The meaning is already fronted, so the Hint button offers the keyword.
            const hintBtn = root.querySelector<HTMLElement>('.jpdb-reader-newtab-study-hint-btn');
            expect(hintBtn?.textContent).toBe('Hint');
            expect(root.querySelectorAll('.jpdb-reader-newtab-study-hint-item')).toHaveLength(0);

            hintBtn?.click();
            const items = root.querySelectorAll('.jpdb-reader-newtab-study-hint-item');
            expect(items).toHaveLength(1);
            expect(items[0]?.textContent).toContain('drink (v.)');
            // Still short of the full reading.
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).not.toContain('のみもの');
        } finally {
            controller.destroy();
        }
    });

    it('folds hint usage into a minimal reveal summary', () => {
        const { controller, internals } = studyController([drinkCard({ kanjiKeyword: 'drink (v.)' })]);
        const root = studyRoot();
        try {
            internals.bindRootEvents(root);
            internals.renderWord(root, internals.visibleWords[0]);
            root.querySelector<HTMLElement>('.jpdb-reader-newtab-study-hint-btn')?.click();
            internals.state.revealAnswer = true;
            internals.renderWord(root, internals.visibleWords[0]);
            expect(root.querySelector('.jpdb-reader-newtab-study-hint-summary')?.textContent).toBe('Used 1 hint');
        } finally {
            controller.destroy();
        }
    });
});

describe('study flow: swipe grading gate', () => {
    it('ignores grade swipes until the answer is revealed, then grades once revealed', () => {
        const { controller, internals } = studyController([drinkCard()], { newTabSwipeReviews: true });
        const root = studyRoot();
        const swipeable = controller as unknown as {
            handleNewTabSwipe(root: HTMLElement, action: 'good'): void;
            gradeCurrentCard(grade: string, target: unknown): Promise<void>;
        };
        try {
            internals.state.mode = 'word';
            internals.renderWord(root, internals.visibleWords[0]);
            const gradeSpy = vi.spyOn(swipeable, 'gradeCurrentCard').mockResolvedValue(undefined);

            // Mid-step (answer hidden) a horizontal drag must NOT submit a
            // provider grade — the answer was never shown.
            swipeable.handleNewTabSwipe(root, 'good');
            expect(gradeSpy).not.toHaveBeenCalled();

            internals.state.revealAnswer = true;
            internals.renderWord(root, internals.visibleWords[0]);
            swipeable.handleNewTabSwipe(root, 'good');
            expect(gradeSpy).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });
});

describe('study flow: post-grade queue refresh coalescing', () => {
    function reviewPool(count: number): JPDBCard[] {
        return Array.from({ length: count }, (_, index) => drinkCard({ vid: 5000 + index, sid: 1 }));
    }

    function coalescingHarness(cards: JPDBCard[]) {
        const { controller, internals } = studyController(cards);
        const root = studyRoot();
        internals.state.mode = 'word';
        internals.state.source = 'jpdb';
        const anyController = controller as unknown as {
            sourceLabel: string;
            markQueueRefreshed(): void;
            advanceAfterGrade(root: HTMLElement, card: JPDBCard, grade?: string): void;
            loadWordsInto(...args: unknown[]): Promise<void>;
        };
        anyController.sourceLabel = 'JPDB';
        const loadSpy = vi.spyOn(anyController, 'loadWordsInto').mockResolvedValue(undefined);
        anyController.markQueueRefreshed();
        return { controller, internals, root, anyController, loadSpy };
    }

    it('refreshes the provider queue once per ten grades on a deep pool, not per grade', () => {
        const { controller, internals, root, anyController, loadSpy } = coalescingHarness(reviewPool(60));
        try {
            for (let grade = 0; grade < 9; grade += 1) {
                anyController.advanceAfterGrade(root, internals.visibleWords[0], 'okay');
            }
            // Nine grades: the graded cards left the pool locally with zero
            // provider round-trips (a 500-due session must not be ~500 fetches).
            expect(loadSpy).not.toHaveBeenCalled();
            anyController.advanceAfterGrade(root, internals.visibleWords[0], 'okay');
            expect(loadSpy).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('refreshes early when the local pool runs low', () => {
        const { controller, internals, root, anyController, loadSpy } = coalescingHarness(reviewPool(21));
        try {
            anyController.advanceAfterGrade(root, internals.visibleWords[0], 'okay');
            expect(loadSpy).not.toHaveBeenCalled();
            // Second grade drops the pool below the low-water mark.
            anyController.advanceAfterGrade(root, internals.visibleWords[0], 'okay');
            expect(loadSpy).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });
});

describe('study flow: pitch-selection outcome persistence', () => {
    it('keeps the pitch pick when the learner steps away and back within a card', () => {
        const card = drinkCard();
        const { controller, internals } = studyController([card], {
            newTabStudyDisabledSteps: ['kanji-doodle', 'word', 'recall-cloze', 'speaking'],
        });
        const root = studyRoot();
        try {
            internals.state.mode = 'listen';
            internals.renderWord(root, card);
            // Pick a (wrong) downstep position; correctness stays hidden pre-reveal.
            internals.pickListenPosition(1);
            expect(internals.pitchOutcomes.get(cardKey(card))).toMatchObject({ position: 1, outcome: 'wrong' });

            // Leave to a different step (word) and come back to the pitch step.
            internals.state.mode = 'word';
            internals.renderWord(root, card);
            internals.state.mode = 'listen';
            internals.renderWord(root, card);
            // The prior pick is restored — the picker shows the saved verdict.
            expect(root.querySelector('.jpdb-reader-newtab-listen-verdict')).not.toBeNull();
            // Grading did not happen on pick (single grade at final reveal).
            expect(root.querySelector('[data-newtab-action="listen-next"]')).toBeNull();
        } finally {
            controller.destroy();
        }
    });
});
