import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { NewTabController } from '../../src/reader/newtab/controller';
import { createNewTabStudySession } from '../../src/reader/newtab/study-session';
import { suggestedStudyGrade } from '../../src/reader/newtab/study-outcomes';
import { pitchPatternFromPosition } from '../../src/reader/lookup/pitch-accent';
import { cardKey } from '../../src/reader/cards/utils';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

function typeCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
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
            <div data-newtab-answer></div>
            <div data-newtab-meaning></div>
            <button data-newtab-status></button>
            <nav data-newtab-controls></nav>
            <button data-newtab-action="reveal"></button>
        </section>
    `;
    document.body.replaceChildren(root);
    return root;
}

interface TypeWordInternals {
    allWords: JPDBCard[];
    visibleWords: JPDBCard[];
    index: number;
    reviewCountMode: boolean;
    state: Record<string, unknown>;
    typeOutcomes: Map<string, string>;
    recallOutcomes: Map<string, string>;
    pitchOutcomes: Map<string, { position: number; outcome: 'correct' | 'wrong' }>;
    renderWord(root: HTMLElement, card: JPDBCard): void;
    bindRootEvents(root: HTMLElement): void;
    setStudyStepOverrideForCard(card: JPDBCard, id: string): void;
    submitTypeWordAnswer(root: HTMLElement): void;
}

function typeWordController(cards: JPDBCard[], settings: Partial<ReaderSettings> = {}) {
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
        playWordAudio: vi.fn(async () => undefined),
    } as never);
    const internals = controller as unknown as TypeWordInternals;
    internals.allWords = cards.slice();
    internals.visibleWords = cards.slice();
    internals.index = 0;
    internals.reviewCountMode = true;
    internals.state = {
        mode: 'word',
        listenSubMode: 'perceive',
        sort: 'random',
        filter: 'study',
        source: 'jpdb',
        revealAnswer: false,
        jpdbDeck: '',
        ankiDeck: '',
        keyHintsDismissed: false,
    };
    return { controller, internals, settings: mergedSettings };
}

function renderTypeWordStep(internals: TypeWordInternals, root: HTMLElement, card: JPDBCard): void {
    internals.setStudyStepOverrideForCard(card, 'type-word');
    internals.renderWord(root, card);
}

afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
});

describe('type-word step sequencing and gating', () => {
    it('places the type-word step after speaking and before the final reveal', () => {
        // Single-kanji spelling keeps exactly one kanji-doodle step (a word card
        // yields one doodle step per distinct kanji), so this asserts ordering.
        const session = createNewTabStudySession(typeCard({ spelling: '水', reading: 'みず', sentence: '水を飲む。' }), {
            mode: 'word',
            listenSubMode: 'perceive',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: true,
        });
        expect(session.steps.map(step => step.kind)).toEqual([
            'kanji-doodle',
            'word',
            'recall-cloze',
            'listen-pitch',
            'speaking',
            'type-word',
            'final-reveal',
        ]);
    });

    it('is optional: disabling the step removes it from the flow', () => {
        const session = createNewTabStudySession(typeCard(), {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: true,
            disabledSteps: ['type-word'],
        });
        expect(session.steps.map(step => step.kind)).not.toContain('type-word');
    });

    it('is gated on an example sentence: no cloze means no type-word step', () => {
        const session = createNewTabStudySession(typeCard(), {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
        });
        expect(session.steps.map(step => step.kind)).not.toContain('type-word');
        // Recall shares the same gate, so it should also be absent.
        expect(session.steps.map(step => step.kind)).not.toContain('recall-cloze');
    });
});

describe('type-word typed answers', () => {
    it('grades a typed answer and records the first attempt only', () => {
        const card = typeCard();
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            internals.bindRootEvents(root);
            renderTypeWordStep(internals, root, card);
            const input = root.querySelector<HTMLInputElement>('[data-newtab-type-input]');
            expect(input).not.toBeNull();
            input!.value = '飲み物';
            internals.submitTypeWordAnswer(root);
            expect(internals.typeOutcomes.get(cardKey(card))).toBe('correct');
            expect(root.querySelector('[data-newtab-type-result]')?.getAttribute('data-newtab-type-result')).toBe('correct');

            // A later wrong answer never rewrites the recorded first attempt.
            const again = root.querySelector<HTMLInputElement>('[data-newtab-type-input]');
            again!.value = 'まちがい';
            internals.submitTypeWordAnswer(root);
            expect(internals.typeOutcomes.get(cardKey(card))).toBe('correct');
        } finally {
            controller.destroy();
        }
    });

    it('accepts the kana reading as an accepted answer', () => {
        const card = typeCard();
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            internals.bindRootEvents(root);
            renderTypeWordStep(internals, root, card);
            const input = root.querySelector<HTMLInputElement>('[data-newtab-type-input]');
            input!.value = 'のみもの';
            internals.submitTypeWordAnswer(root);
            expect(internals.typeOutcomes.get(cardKey(card))).toBe('accepted');
        } finally {
            controller.destroy();
        }
    });

    it('grades a wrong typed answer as incorrect and shows the result in place', () => {
        const card = typeCard();
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            internals.bindRootEvents(root);
            renderTypeWordStep(internals, root, card);
            const input = root.querySelector<HTMLInputElement>('[data-newtab-type-input]');
            input!.value = 'まちがい';
            internals.submitTypeWordAnswer(root);
            expect(internals.typeOutcomes.get(cardKey(card))).toBe('incorrect');
            expect(root.querySelector('[data-newtab-type-result]')?.getAttribute('data-newtab-type-result')).toBe('incorrect');
        } finally {
            controller.destroy();
        }
    });

    it('skip records a skipped outcome and advances the step', () => {
        const card = typeCard();
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            internals.bindRootEvents(root);
            renderTypeWordStep(internals, root, card);
            root.querySelector<HTMLElement>('[data-newtab-action="type-word-skip"]')?.click();
            expect(internals.typeOutcomes.get(cardKey(card))).toBe('skipped');
        } finally {
            controller.destroy();
        }
    });

    it('handwriting advances character-by-character and records a pass once all clear', () => {
        // Kana auto-advances; kanji pass on assessment. Drive the advance path
        // directly (canvas stroke grading is not observable under jsdom) to
        // prove per-character progress folds into one first-attempt outcome.
        const card = typeCard({ spelling: '水', reading: 'みず', sentence: '水を飲む。' });
        const { controller, internals } = typeWordController([card], { newTabTypeWordInputMode: 'handwriting' });
        const root = studyRoot();
        try {
            internals.bindRootEvents(root);
            renderTypeWordStep(internals, root, card);
            expect(root.querySelector('.jpdb-reader-doodle-canvas')).not.toBeNull();
            // Single-kanji target: one pass clears the whole word.
            (internals as unknown as { advanceTypeWordHandwriting(a: HTMLElement, c: JPDBCard, o: 'correct' | 'wrong'): void })
                .advanceTypeWordHandwriting(root.querySelector('[data-newtab-reading]')!, card, 'correct');
            expect(internals.typeOutcomes.get(cardKey(card))).toBe('correct');
        } finally {
            controller.destroy();
        }
    });

    it('offers a handwriting toggle that remembers the last used mode', () => {
        const card = typeCard();
        const { controller, internals, settings } = typeWordController([card]);
        const root = studyRoot();
        try {
            internals.bindRootEvents(root);
            renderTypeWordStep(internals, root, card);
            root.querySelector<HTMLElement>('[data-type-word-mode="handwriting"]')?.click();
            expect(settings.newTabTypeWordInputMode).toBe('handwriting');
            expect(root.querySelector('.jpdb-reader-doodle-canvas')).not.toBeNull();
            expect(root.querySelector('[data-newtab-type-input]')).toBeNull();
        } finally {
            controller.destroy();
        }
    });
});

describe('final-reveal per-step summary and suggested grade', () => {
    it('renders a per-step results strip above the grade buttons and highlights a suggestion', () => {
        const card = typeCard();
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            internals.recallOutcomes.set(cardKey(card), 'correct');
            internals.pitchOutcomes.set(cardKey(card), { position: 3, outcome: 'correct' });
            internals.typeOutcomes.set(cardKey(card), 'correct');
            internals.state.revealAnswer = true;
            internals.renderWord(root, card);
            const strip = root.querySelector('[data-newtab-study-summary]');
            expect(strip).not.toBeNull();
            expect(strip?.querySelector('[data-study-summary-step="recall-cloze"]')?.getAttribute('data-study-summary-outcome')).toBe('correct');
            expect(strip?.querySelector('[data-study-summary-step="type-word"]')?.getAttribute('data-study-summary-outcome')).toBe('correct');
            expect(strip?.querySelector('[data-study-summary-step="speaking"]')?.getAttribute('data-study-summary-outcome')).toBe('none');
            const suggested = root.querySelector<HTMLElement>('[data-grade][data-suggested="true"]');
            expect(suggested?.dataset.grade).toBe('okay');
        } finally {
            controller.destroy();
        }
    });

    it('suggests a fail-side grade when a step went wrong, without auto-grading', () => {
        const card = typeCard();
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            internals.pitchOutcomes.set(cardKey(card), { position: 1, outcome: 'wrong' });
            internals.typeOutcomes.set(cardKey(card), 'correct');
            internals.state.revealAnswer = true;
            internals.renderWord(root, card);
            const suggested = root.querySelector<HTMLElement>('[data-grade][data-suggested="true"]');
            expect(suggested?.dataset.grade).toBe('hard');
            // Suggestion only — no grade was submitted.
            expect(root.querySelectorAll('[data-grade]').length).toBeGreaterThan(1);
        } finally {
            controller.destroy();
        }
    });
});

describe('suggested grade mapping', () => {
    const fiveButton = ['nothing', 'something', 'hard', 'okay', 'easy'] as const;
    const twoButton = ['fail', 'pass'] as const;

    it('suggests nothing recorded -> null', () => {
        expect(suggestedStudyGrade({}, [...fiveButton])).toBeNull();
        expect(suggestedStudyGrade({ 'type-word': 'skipped' }, [...fiveButton])).toBeNull();
    });

    it('all correct -> okay / pass', () => {
        expect(suggestedStudyGrade({ 'recall-cloze': 'correct', 'listen-pitch': 'correct' }, [...fiveButton])).toBe('okay');
        expect(suggestedStudyGrade({ 'recall-cloze': 'correct' }, [...twoButton])).toBe('pass');
    });

    it('some wrong -> hard / fail; all wrong -> nothing / fail', () => {
        expect(suggestedStudyGrade({ 'recall-cloze': 'correct', 'type-word': 'wrong' }, [...fiveButton])).toBe('hard');
        expect(suggestedStudyGrade({ 'recall-cloze': 'wrong', 'type-word': 'wrong' }, [...fiveButton])).toBe('nothing');
        expect(suggestedStudyGrade({ 'recall-cloze': 'wrong' }, [...twoButton])).toBe('fail');
    });

    it('skipped steps do not drag the suggestion down', () => {
        expect(suggestedStudyGrade({ 'recall-cloze': 'correct', 'type-word': 'skipped' }, [...fiveButton])).toBe('okay');
    });
});
