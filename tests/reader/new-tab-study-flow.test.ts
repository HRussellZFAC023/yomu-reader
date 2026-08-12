import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { NewTabController, type NewTabControllerOptions } from '../../src/reader/newtab/controller';
import { setInnerHtml } from '../../src/reader/dom/index';
import { bindPrivateCommandCapability } from '../../src/reader/dom/private-command-capabilities';
import { pitchPatternFromPosition } from '../../src/reader/lookup/pitch-accent';
import { cardKey } from '../../src/reader/cards/utils';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';

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
    studyStepStates: Map<string, {
        pitch?: { position: number; outcome: 'correct' | 'wrong' };
        doodle?: { outcome?: 'correct' | 'wrong'; firstAttempt?: Map<string, 'correct' | 'wrong'> };
    }>;
    recordDoodleOutcome(card: JPDBCard, kanji: string, passed: boolean): void;
    renderWord(root: HTMLElement, card: JPDBCard): void;
    bindRootEvents(root: HTMLElement): void;
    pickListenPosition(position: number): void;
}

function studyController(cards: JPDBCard[], settings: Partial<ReaderSettings> = {}, extraDeps: Record<string, unknown> = {}, options: NewTabControllerOptions = {}) {
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
        ...extraDeps,
    } as never, options);
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
    resetActiveLearningTargetLanguage();
    document.body.replaceChildren();
    vi.clearAllMocks();
});

describe('study flow: kanji-draw prompt clarity', () => {
    it('hides the word meaning and blanks EVERY kanji in the cloze', () => {
        const { controller, internals } = studyController([drinkCard()]);
        const root = studyRoot();
        try {
            internals.renderWord(root, internals.visibleWords[0]);
            const context = root.querySelector('.jpdb-reader-newtab-kanji-front-context');
            // The meaning is the answer to the session's word step — it must not
            // front on the draw prompt (owner: "gives away the next part").
            expect(context?.querySelector('.jpdb-reader-newtab-kanji-front-meaning')).toBeNull();
            expect(context?.textContent).not.toContain('drink');
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
            // The meaning is hidden from the prompt, so it is the FIRST hint tier;
            // the per-kanji keyword follows.
            const hintBtn = root.querySelector<HTMLElement>('.jpdb-reader-newtab-study-hint-btn');
            expect(hintBtn?.textContent).toBe('Hint');
            expect(root.querySelectorAll('.jpdb-reader-newtab-study-hint-item')).toHaveLength(0);

            hintBtn?.click();
            const items = root.querySelectorAll('.jpdb-reader-newtab-study-hint-item');
            expect(items).toHaveLength(1);
            expect(items[0]?.textContent).toContain('drink');

            root.querySelector<HTMLElement>('.jpdb-reader-newtab-study-hint-btn')?.click();
            const moreItems = root.querySelectorAll('.jpdb-reader-newtab-study-hint-item');
            expect(moreItems).toHaveLength(2);
            expect(moreItems[1]?.textContent).toContain('drink (v.)');
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

interface SwipeInternals {
    handleNewTabSwipe(root: HTMLElement, action: 'again' | 'good', direction: 'left' | 'right'): void;
    swipeStartAllowedForStepNavigation(target: HTMLElement | null): boolean;
    canSwipeCurrentStudyCard(): boolean;
    gradeCurrentCard(grade: string, target: unknown): Promise<void>;
    navigateStudyStep(direction: 'next' | 'previous'): boolean;
    studySessionForCard(card: JPDBCard, renderAsKanji?: boolean): { activeStep: { id: string; kind: string }; steps: unknown[] };
    shouldRenderCardAsKanji(card: JPDBCard): boolean;
}

describe('study flow: swipe grading gate', () => {
    it('ignores grade swipes until the answer is revealed, then grades once revealed', () => {
        const { controller, internals } = studyController([drinkCard()], { newTabSwipeReviews: true });
        const root = studyRoot();
        const swipeable = controller as unknown as SwipeInternals;
        try {
            internals.state.mode = 'word';
            internals.renderWord(root, internals.visibleWords[0]);
            const gradeSpy = vi.spyOn(swipeable, 'gradeCurrentCard').mockResolvedValue(undefined);
            // Isolate the grade path from step-nav: force the final-reveal step.
            vi.spyOn(swipeable, 'canSwipeCurrentStudyCard').mockReturnValue(false);

            // Mid-step (answer hidden) a horizontal drag must NOT submit a
            // provider grade — the answer was never shown.
            swipeable.handleNewTabSwipe(root, 'good', 'right');
            expect(gradeSpy).not.toHaveBeenCalled();

            (swipeable.canSwipeCurrentStudyCard as ReturnType<typeof vi.fn>).mockReturnValue(true);
            internals.state.revealAnswer = true;
            internals.renderWord(root, internals.visibleWords[0]);
            swipeable.handleNewTabSwipe(root, 'good', 'right');
            expect(gradeSpy).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });
});

describe('study flow: swipe navigates study steps', () => {
    function activeStepKind(swipeable: SwipeInternals, card: JPDBCard): string {
        return swipeable.studySessionForCard(card, swipeable.shouldRenderCardAsKanji(card)).activeStep.kind;
    }
    function activeStepId(swipeable: SwipeInternals, card: JPDBCard): string {
        return swipeable.studySessionForCard(card, swipeable.shouldRenderCardAsKanji(card)).activeStep.id;
    }

    it('walks steps on a non-final step instead of grading (left = next, right = previous)', () => {
        const card = drinkCard();
        // Drop the kanji sub-steps so the session starts on a plain Word step —
        // the everyday mid-session case, free of the kanji-queue mode quirk.
        const { controller, internals } = studyController([card], {
            newTabSwipeReviews: true,
            newTabStudyDisabledSteps: ['kanji-doodle'],
        });
        const root = studyRoot();
        const swipeable = controller as unknown as SwipeInternals;
        try {
            internals.state.mode = 'word';
            internals.renderWord(root, card);
            const startId = activeStepId(swipeable, card);
            expect(activeStepKind(swipeable, card)).toBe('word');
            const gradeSpy = vi.spyOn(swipeable, 'gradeCurrentCard').mockResolvedValue(undefined);
            const navSpy = vi.spyOn(swipeable, 'navigateStudyStep');

            // Swipe LEFT advances forward through the session; never grades.
            swipeable.handleNewTabSwipe(root, 'again', 'left');
            expect(gradeSpy).not.toHaveBeenCalled();
            expect(navSpy).toHaveBeenLastCalledWith('next');
            const forwardId = activeStepId(swipeable, card);
            expect(forwardId).not.toBe(startId);
            expect(activeStepKind(swipeable, card)).not.toBe('final-reveal');

            // Swipe RIGHT steps back to where we started.
            swipeable.handleNewTabSwipe(root, 'good', 'right');
            expect(navSpy).toHaveBeenLastCalledWith('previous');
            expect(gradeSpy).not.toHaveBeenCalled();
            expect(activeStepId(swipeable, card)).toBe(startId);
        } finally {
            controller.destroy();
        }
    });

    it('still grades on the final-reveal step (grade swipe is not regressed)', () => {
        const card = drinkCard();
        const { controller, internals } = studyController([card], { newTabSwipeReviews: true });
        const root = studyRoot();
        const swipeable = controller as unknown as SwipeInternals;
        try {
            internals.state.mode = 'word';
            internals.state.revealAnswer = true;
            internals.renderWord(root, card);
            expect(activeStepKind(swipeable, card)).toBe('final-reveal');
            const gradeSpy = vi.spyOn(swipeable, 'gradeCurrentCard').mockResolvedValue(undefined);
            const navSpy = vi.spyOn(swipeable, 'navigateStudyStep');

            swipeable.handleNewTabSwipe(root, 'good', 'right');
            expect(gradeSpy).toHaveBeenCalledTimes(1);
            expect(navSpy).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('refuses a nav swipe that starts on the doodle canvas or a text input', () => {
        const card = drinkCard();
        const { controller, internals } = studyController([card], { newTabSwipeReviews: true });
        const root = studyRoot();
        const swipeable = controller as unknown as SwipeInternals;
        try {
            internals.state.mode = 'kanji';
            internals.renderWord(root, card);

            const canvas = document.createElement('canvas');
            root.querySelector('[data-newtab-study]')!.append(canvas);
            const input = document.createElement('input');
            root.querySelector('[data-newtab-study]')!.append(input);

            // A generic drag over the card body is allowed.
            expect(swipeable.swipeStartAllowedForStepNavigation(root.querySelector('h1'))).toBe(true);
            // Handwriting/doodle canvas and text inputs own the pointer.
            expect(swipeable.swipeStartAllowedForStepNavigation(canvas)).toBe(false);
            expect(swipeable.swipeStartAllowedForStepNavigation(input)).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('gates step-nav swipes behind the same enablement flag as grade swipes', () => {
        const card = drinkCard();
        const { controller, internals } = studyController([card], { newTabSwipeReviews: false });
        const root = studyRoot();
        const swipeable = controller as unknown as SwipeInternals;
        try {
            internals.state.mode = 'kanji';
            internals.renderWord(root, card);
            expect(swipeable.swipeStartAllowedForStepNavigation(root.querySelector('h1'))).toBe(false);
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
            expect(internals.studyStepStates.get(cardKey(card))?.pitch).toMatchObject({ position: 1, outcome: 'wrong' });

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

describe('study flow: composed-of chip drilldown', () => {
    function kanjiCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
        return drinkCard({
            vid: 40,
            sid: 41,
            spelling: '飲食',
            reading: 'いんしょく',
            meanings: [{ glosses: ['food and drink'], partOfSpeech: ['n'] }],
            sentence: '飲食を控える。',
            ...overrides,
        });
    }

    it('opens the kanji popover in place — no card swap, no navigation, no render loop', () => {
        const card = kanjiCard();
        const showKanjiCard = vi.fn(async (..._args: unknown[]) => undefined);
        const { controller, internals } = studyController([card], {}, { showKanjiCard });
        const root = studyRoot();
        const anyController = controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void };
        const pushSpy = vi.spyOn(history, 'pushState');
        try {
            internals.state.mode = 'word';
            internals.state.revealAnswer = true;
            internals.bindRootEvents(root);
            internals.renderWord(root, card);

            const renderSpy = vi.spyOn(anyController, 'renderWord');
            const chip = root.querySelector<HTMLElement>('[data-newtab-composed-of] [data-action="kanji"][data-kanji]');
            expect(chip).not.toBeNull();
            const kanji = chip!.dataset.kanji;

            const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
            chip!.dispatchEvent(event);

            // The kanji surfaces in the standard anchored popover.
            expect(showKanjiCard).toHaveBeenCalledTimes(1);
            expect(showKanjiCard.mock.calls[0][1]).toBe(kanji);
            // The click is consumed — no default navigation from the button.
            expect(event.defaultPrevented).toBe(true);
            // The studied card stays put: no re-pool, no mode swap, no re-render
            // cascade, no history navigation, page still alive.
            expect(renderSpy).not.toHaveBeenCalled();
            expect(internals.state.route).toBe('study');
            expect(internals.state.revealAnswer).toBe(true);
            expect(root.isConnected).toBe(true);
            expect(pushSpy).not.toHaveBeenCalled();
        } finally {
            pushSpy.mockRestore();
            controller.destroy();
        }
    });

    it('does not render or hydrate composed-of chips and swallows a stale kanji action for a Chinese target', () => {
        setActiveLearningTargetLanguage('zh');
        const card = kanjiCard({
            language: 'zh',
            spelling: '学习',
            reading: 'xuéxí',
            sentence: '我学习中文。',
        });
        const rtkLookup = vi.fn(async () => ({ keyword: 'study' }));
        const jpdbKanjiLookup = vi.fn(async () => ({ keyword: 'study' }));
        const showKanjiCard = vi.fn(async () => undefined);
        const lookupText = vi.fn(async () => undefined);
        const { controller, internals } = studyController([card], {}, {
            rtk: { lookup: rtkLookup } as never,
            jpdbKanji: { lookup: jpdbKanjiLookup } as never,
            showKanjiCard,
            lookupText,
        });
        const root = studyRoot();
        try {
            internals.state.revealAnswer = true;
            internals.bindRootEvents(root);
            internals.renderWord(root, card);
            expect(root.querySelector('[data-newtab-composed-of]')).toBeNull();
            expect(rtkLookup).not.toHaveBeenCalled();
            expect(jpdbKanjiLookup).not.toHaveBeenCalled();

            const stale = document.createElement('button');
            stale.dataset.action = 'kanji';
            stale.dataset.kanji = '学';
            bindPrivateCommandCapability(stale, { kind: 'kanji-lookup', kanji: '学' });
            root.querySelector('[data-newtab-meaning]')?.append(stale);
            const event = new MouseEvent('click', { bubbles: true, cancelable: true });
            stale.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(true);
            expect(showKanjiCard).not.toHaveBeenCalled();
            expect(lookupText).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });
});

describe('study flow: unrevealed headword opens the word, not a kanji popup', () => {
    function headwordCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
        return drinkCard({
            vid: 50,
            sid: 51,
            spelling: '勉強',
            reading: 'べんきょう',
            meanings: [{ glosses: ['study'], partOfSpeech: ['n'] }],
            sentence: '毎日勉強する。',
            ...overrides,
        });
    }

    function headwordController(revealAnswer: boolean) {
        const lookupText = vi.fn(async (..._args: unknown[]) => undefined);
        const showKanjiCard = vi.fn(async (..._args: unknown[]) => undefined);
        const showLookupCard = vi.fn(async (..._args: unknown[]) => undefined);
        const card = headwordCard();
        const { controller, internals } = studyController([card], {
            // Land on the Word step so the headword is the prompt.
            newTabStudyDisabledSteps: ['kanji-doodle', 'recall-cloze', 'listen-pitch', 'speaking'],
        }, { lookupText, showKanjiCard, showLookupCard });
        const root = studyRoot();
        internals.state.mode = 'word';
        internals.state.revealAnswer = revealAnswer;
        internals.bindRootEvents(root);
        internals.renderWord(root, card);
        return { controller, internals, root, card, lookupText, showKanjiCard, showLookupCard };
    }

    it('routes a kanji affordance inside the UNREVEALED headword to the word lookup', () => {
        const { controller, root, showKanjiCard, showLookupCard, lookupText } = headwordController(false);
        try {
            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word');
            expect(word).not.toBeNull();
            // The unrevealed headword carries no kanji-nav host…
            expect(word!.dataset.jpdbReaderKanjiNav).toBeUndefined();
            // …so a per-kanji button nested in it (stale/leaked affordance) must
            // not hijack the click into a kanji popup.
            setInnerHtml(word!, '<button type="button" class="jpdb-reader-kanji-inline" data-action="kanji" data-kanji="勉">勉</button><button type="button" class="jpdb-reader-kanji-inline" data-action="kanji" data-kanji="強">強</button>');
            const kanjiBtn = word!.querySelector<HTMLElement>('[data-action="kanji"]');
            const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 7, clientY: 7 });
            kanjiBtn!.dispatchEvent(event);

            expect(showKanjiCard).not.toHaveBeenCalled();
            expect(showLookupCard.mock.calls.length + lookupText.mock.calls.length).toBe(1);
        } finally {
            controller.destroy();
        }
    });

    it('opens the WORD popover from the revealed headword instead of a per-kanji popup', () => {
        const { controller, root, showKanjiCard, showLookupCard, lookupText } = headwordController(true);
        try {
            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word');
            // The revealed headword is no longer a kanji-nav host: per-kanji
            // buttons covered the whole surface, making the word unreachable.
            expect(word!.dataset.jpdbReaderKanjiNav).toBeUndefined();
            expect(word!.querySelector('[data-action="kanji"][data-kanji]')).toBeNull();
            const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8 });
            word!.dispatchEvent(event);
            expect(showKanjiCard).not.toHaveBeenCalled();
            expect(showLookupCard.mock.calls.length + lookupText.mock.calls.length).toBe(1);
        } finally {
            controller.destroy();
        }
    });

    it('carries late pitch enrichment from a shared Study wrapper into the source-card popover', () => {
        // Portable share-link sources are not necessarily tagged as a normal
        // provider review source. Exact enriched pitch still makes this the
        // authoritative card for its own word popover.
        const source = headwordCard({ pitchAccent: [], reviewSource: undefined });
        const visible = headwordCard({
            source: 'local',
            reviewSource: 'yomu-local',
            sourceCardKey: cardKey(source),
            pitchAccent: ['LHHH'],
        });
        const showLookupCard = vi.fn(async (..._args: unknown[]) => undefined);
        const { controller, internals } = studyController([source], {
            newTabStudyDisabledSteps: ['kanji-doodle', 'recall-cloze', 'listen-pitch', 'speaking'],
        }, { showLookupCard });
        const root = studyRoot();
        try {
            internals.visibleWords = [visible];
            internals.state.mode = 'word';
            internals.bindRootEvents(root);
            internals.renderWord(root, visible);

            root.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word')
                ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(showLookupCard).toHaveBeenCalledWith(source, source.sentence, expect.any(HTMLElement), expect.any(Object));
            expect(source.pitchAccent).toEqual(['LHHH']);
        } finally {
            controller.destroy();
        }
    });

    it('restores exact rendered pitch when a Study word falls back to its cached lookup card', () => {
        const visible = headwordCard({
            vid: 0,
            sid: 0,
            source: 'local',
            reviewSource: undefined,
            sourceCardKey: undefined,
            pitchAccent: ['LHHH'],
        });
        const cached = headwordCard({ vid: 0, sid: 0, pitchAccent: [] });
        const showLookupCard = vi.fn(async (..._args: unknown[]) => undefined);
        const getCachedCard = vi.fn(() => cached);
        const { controller, internals } = studyController([visible], {
            newTabStudyDisabledSteps: ['kanji-doodle', 'recall-cloze', 'listen-pitch', 'speaking'],
        }, { parser: { getCachedCard }, showLookupCard });
        const root = studyRoot();
        try {
            internals.visibleWords = [visible];
            internals.state.mode = 'word';
            internals.bindRootEvents(root);
            internals.renderWord(root, visible);

            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word');
            word?.closest<HTMLElement>('[data-newtab-prompt]')?.classList.add('jpdb-reader-parseable');
            expect(word?.dataset.pitchAccent).toBe('LHHH');
            word?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(getCachedCard).toHaveBeenCalledWith(0, 0);
            expect(showLookupCard).toHaveBeenCalledWith(cached, visible.sentence, word, expect.any(Object));
            expect(cached.pitchAccent).toEqual(['LHHH']);
        } finally {
            controller.destroy();
        }
    });

    it('restores exact rendered pitch onto the provider source card chosen for the popover', () => {
        const source = headwordCard({ pitchAccent: [] });
        const visible = headwordCard({
            source: 'local',
            reviewSource: 'yomu-local',
            sourceCardKey: cardKey(source),
            pitchAccent: ['LHHH'],
        });
        const showLookupCard = vi.fn(async (..._args: unknown[]) => undefined);
        const { controller, internals } = studyController([source], {
            newTabStudyDisabledSteps: ['kanji-doodle', 'recall-cloze', 'listen-pitch', 'speaking'],
        }, { showLookupCard });
        const root = studyRoot();
        try {
            internals.visibleWords = [visible];
            internals.state.mode = 'word';
            internals.bindRootEvents(root);
            internals.renderWord(root, visible);

            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word');
            word?.closest<HTMLElement>('[data-newtab-prompt]')?.classList.add('jpdb-reader-parseable');
            expect(word?.dataset.pitchAccent).toBe('LHHH');
            // Model the live async seam: the DOM has the resolved contour, but
            // the visible wrapper and provider source are still pitch-empty.
            visible.pitchAccent = [];
            source.pitchAccent = [];
            word?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(showLookupCard).toHaveBeenCalledWith(source, source.sentence, word, expect.any(Object));
            expect(source.pitchAccent).toEqual(['LHHH']);
        } finally {
            controller.destroy();
        }
    });

    it('uses the matching visible Study card when neither provider source nor parser cache is available', () => {
        const visible = headwordCard({
            vid: 0,
            sid: 0,
            source: 'local',
            reviewSource: undefined,
            sourceCardKey: undefined,
            pitchAccent: ['LHHH'],
        });
        const showLookupCard = vi.fn(async (..._args: unknown[]) => undefined);
        const lookupText = vi.fn(async (..._args: unknown[]) => undefined);
        const { controller, internals } = studyController([visible], {
            newTabStudyDisabledSteps: ['kanji-doodle', 'recall-cloze', 'listen-pitch', 'speaking'],
        }, { showLookupCard, lookupText });
        const root = studyRoot();
        try {
            internals.state.mode = 'word';
            internals.bindRootEvents(root);
            internals.renderWord(root, visible);

            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word');
            word?.closest<HTMLElement>('[data-newtab-prompt]')?.classList.add('jpdb-reader-parseable');
            word?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(showLookupCard).toHaveBeenCalledWith(visible, visible.sentence, word, expect.any(Object));
            expect(lookupText).not.toHaveBeenCalled();
            expect(visible.pitchAccent).toEqual(['LHHH']);
        } finally {
            controller.destroy();
        }
    });
});

describe('study flow: revealed answer reading stays visible', () => {
    function revealedWordController(settings: Partial<ReaderSettings>) {
        const card = drinkCard({
            vid: 50,
            sid: 51,
            spelling: '勉強',
            reading: 'べんきょう',
            cardState: ['due'],
            meanings: [{ glosses: ['study'], partOfSpeech: ['n'] }],
            sentence: '毎日勉強する。',
        });
        const { controller, internals } = studyController([card], {
            newTabStudyDisabledSteps: ['kanji-doodle', 'recall-cloze', 'listen-pitch', 'speaking'],
            ...settings,
        });
        const root = studyRoot();
        internals.state.mode = 'word';
        internals.state.revealAnswer = true;
        internals.bindRootEvents(root);
        internals.renderWord(root, card);
        return { controller, root };
    }

    it('renders due-card answer furigana under selective modes and marks the headword scope', () => {
        // known-status mode hides due-word furigana on the page; the revealed
        // study answer is the content and must render ruby regardless, with
        // the data-yomu-headword marker that exempts it from the hide CSS.
        const { controller, root } = revealedWordController({ showFurigana: true, furiganaMode: 'known-status', furiganaHiddenStateGroups: ['due'] });
        try {
            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word')!;
            expect(word.dataset.yomuHeadword).toBe('true');
            expect(word.querySelector('rt.jpdb-reader-furi')?.textContent).toBe('べんきょう');
            expect(root.querySelector('.jpdb-reader-newtab-study-tools .jpdb-reader-reading')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('forces answer ruby on reveal even when furigana is disabled', () => {
        // Reveal surfaces are answer surfaces: the reading is the content, so
        // ruby renders regardless of the user's page-furigana preference and
        // the redundant plain chip stays suppressed.
        const { controller, root } = revealedWordController({ showFurigana: false, furiganaMode: 'off' });
        try {
            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word')!;
            expect(word.querySelector('rt.jpdb-reader-furi')?.textContent).toBe('べんきょう');
            expect(root.querySelector('.jpdb-reader-newtab-study-tools .jpdb-reader-reading')).toBeNull();
        } finally {
            controller.destroy();
        }
    });
});

describe('study flow: doodle first-attempt discipline', () => {
    it('keeps a kanji pass on redraw and lets a different failed kanji fail the card', () => {
        const card = drinkCard();
        const { controller, internals } = studyController([card]);
        try {
            const key = cardKey(card);
            // 飲 drawn correctly first, then cleared and redrawn wrong: the first
            // pass must latch — a redraw of the SAME kanji never launders it.
            internals.recordDoodleOutcome(card, '飲', true);
            internals.recordDoodleOutcome(card, '飲', false);
            expect(internals.studyStepStates.get(key)?.doodle?.outcome).toBe('correct');

            // A DIFFERENT kanji failing must still fail the whole card (roughest
            // draw wins across the word's kanji-doodle steps).
            internals.recordDoodleOutcome(card, '物', false);
            expect(internals.studyStepStates.get(key)?.doodle?.outcome).toBe('wrong');

            // Once wrong, a later kanji passing can't launder the card back.
            internals.recordDoodleOutcome(card, '飲', true);
            expect(internals.studyStepStates.get(key)?.doodle?.outcome).toBe('wrong');
        } finally {
            controller.destroy();
        }
    });
});

describe('standalone Study entry step', () => {
    it('starts every fresh card at the first configured learning step', () => {
        const cards = [drinkCard(), drinkCard({ vid: 32, sid: 33, spelling: '読書', reading: 'どくしょ' })];
        const { controller, internals } = studyController(cards, {}, {}, { surface: 'standalone' });
        const root = studyRoot();
        try {
            internals.state.mode = 'word';
            internals.renderWord(root, cards[0]);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('kanji-doodle');

            internals.index = 1;
            internals.renderWord(root, cards[1]);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('kanji-doodle');
        } finally {
            controller.destroy();
        }
    });
});

interface PitchGateInternals {
    loadWordPitch(card: JPDBCard): Promise<string[]>;
}

function kanaCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 40,
        sid: 41,
        rid: 0,
        spelling: 'じ',
        reading: 'じ',
        frequencyRank: 5000,
        partOfSpeech: ['n'],
        meanings: [{ glosses: ['self'], partOfSpeech: ['n'] }],
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        reviewSource: 'jpdb-api',
        sentence: 'じがすき',
        ...overrides,
    } as JPDBCard;
}

async function flushMicrotasks(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe('study flow: Listen/Speak gated on resolved pitch', () => {
    it('hides Listen and Speak when the card truly has no resolved pitch', async () => {
        const card = kanaCard();
        const { controller, internals } = studyController([card]);
        const root = studyRoot();
        const pitchInternals = controller as unknown as PitchGateInternals;
        pitchInternals.loadWordPitch = vi.fn(() => Promise.resolve([]));
        try {
            internals.state.mode = 'word';
            internals.renderWord(root, card);
            const study = root.querySelector<HTMLElement>('[data-newtab-study]');
            expect(study?.dataset.newtabStudyFlow).not.toContain('listen-pitch');
            expect(study?.dataset.newtabStudyFlow).not.toContain('speaking');

            await flushMicrotasks();
            // Nothing resolved, so a later render of the same card stays gated.
            internals.renderWord(root, card);
            const settled = root.querySelector<HTMLElement>('[data-newtab-study]');
            expect(settled?.dataset.newtabStudyFlow).not.toContain('listen-pitch');
            expect(settled?.dataset.newtabStudyFlow).not.toContain('speaking');
        } finally {
            controller.destroy();
        }
    });

    it('adds Listen and Speak once pitch resolves even when inline pitch display is disabled', async () => {
        const card = kanaCard();
        const { controller, internals } = studyController([card], { showPitchAccent: false });
        const root = studyRoot();
        const pitchInternals = controller as unknown as PitchGateInternals;
        pitchInternals.loadWordPitch = vi.fn(() => Promise.resolve(['H']));
        try {
            internals.state.mode = 'word';
            internals.renderWord(root, card);
            const beforeFlow = root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyFlow;
            expect(beforeFlow).not.toContain('listen-pitch');
            expect(beforeFlow).not.toContain('speaking');

            await flushMicrotasks();

            expect(card.pitchAccent).toEqual(['H']);
            const afterFlow = root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyFlow;
            expect(afterFlow).toContain('listen-pitch');
            expect(afterFlow).toContain('speaking');
        } finally {
            controller.destroy();
        }
    });

    it('does not apply a stale pitch upgrade after the learner navigates to another card', async () => {
        const first = kanaCard({ vid: 40, spelling: 'じ', reading: 'じ' });
        const second = kanaCard({ vid: 42, spelling: 'て', reading: 'て' });
        let resolvePitch = (_pitch: string[]): void => {};
        const pendingPitch = new Promise<string[]>(resolve => { resolvePitch = resolve; });
        const { controller, internals } = studyController([first, second]);
        const root = studyRoot();
        const pitchInternals = controller as unknown as PitchGateInternals;
        pitchInternals.loadWordPitch = vi.fn(card => card === first ? pendingPitch : Promise.resolve([]));
        try {
            internals.state.mode = 'word';
            internals.renderWord(root, first);
            internals.index = 1;
            internals.renderWord(root, second);

            resolvePitch(['H']);
            await flushMicrotasks();

            // The resolved pitch may be cached on the old card, but must not
            // reshape or rerender the different card now on screen.
            expect(first.pitchAccent).toEqual(['H']);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyFlow).not.toContain('listen-pitch');
            expect(root.querySelector<HTMLElement>('[data-newtab-prompt]')?.textContent).toContain('て');
        } finally {
            controller.destroy();
        }
    });
});
