import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { NewTabController } from '../../src/reader/newtab/controller';
import { normalizeNewTabRecallAnswer } from '../../src/reader/newtab/recall-practice';
import { targetSupportsCharacterLookup, targetSupportsHandwriting } from '../../src/reader/languages/character-lookup';
import { createNewTabStudySession } from '../../src/reader/newtab/study-session';
import { suggestedStudyGrade } from '../../src/reader/newtab/study-outcomes';
import { pitchPatternFromPosition } from '../../src/reader/lookup/pitch-accent';
import { cardKey } from '../../src/reader/cards/utils';
import {
    adoptLearningTargetLanguage,
    resetActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import { testEnSettings } from './helpers/settings-fixture';

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

interface StepState {
    recall?: { answer?: string; outcome?: string };
    type?: { answer?: string; outcome?: string };
    pitch?: { position: number; outcome: 'correct' | 'wrong' };
    speak?: 'correct' | 'wrong';
    doodle?: { outcome?: 'correct' | 'wrong'; firstAttempt?: Map<string, 'correct' | 'wrong'> };
}

interface TypeWordInternals {
    allWords: JPDBCard[];
    visibleWords: JPDBCard[];
    index: number;
    reviewCountMode: boolean;
    state: Record<string, unknown>;
    studyStepStates: Map<string, StepState>;
    renderWord(root: HTMLElement, card: JPDBCard): void;
    bindRootEvents(root: HTMLElement): void;
    setStudyStepOverrideForCard(card: JPDBCard, id: string): void;
    submitTypeWordAnswer(root: HTMLElement): void;
    advanceTypeWordHandwriting(answer: HTMLElement, card: JPDBCard, outcome: 'correct' | 'wrong'): void;
}

function typeWordController(
    cards: JPDBCard[],
    settings: Partial<ReaderSettings> = {},
    overrides: Partial<ConstructorParameters<typeof NewTabController>[0]> = {},
) {
    const mergedSettings: ReaderSettings = {
        ...testEnSettings(),
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
        ...overrides,
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
    resetActiveLearningTargetLanguage();
    document.body.replaceChildren();
    vi.clearAllMocks();
});

describe('type-word step sequencing and gating', () => {
    it('places the writing (type-word) step right after the word step', () => {
        // Single-kanji spelling keeps exactly one kanji-doodle step (a word card
        // yields one doodle step per distinct kanji), so this asserts ordering.
        const session = createNewTabStudySession(typeCard({ spelling: '水', reading: 'みず', sentence: '水を飲む。' }), {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: true,
            pitchAvailable: true,
        });
        expect(session.steps.map(step => step.kind)).toEqual([
            'kanji-doodle',
            'word',
            'type-word',
            'recall-cloze',
            'listen-pitch',
            'speaking',
            'final-reveal',
        ]);
    });

    it('keeps Type immediately after Word even when a saved order placed it elsewhere', () => {
        const session = createNewTabStudySession(typeCard(), {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: true,
            pitchAvailable: true,
            stepOrder: ['type-word', 'speaking', 'word'],
        });
        const kinds = session.steps.map(step => step.kind);
        expect(kinds.indexOf('type-word')).toBe(kinds.indexOf('word') + 1);
    });

    it('is optional: disabling the step removes it from the flow', () => {
        const session = createNewTabStudySession(typeCard(), {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: true,
            pitchAvailable: true,
            disabledSteps: ['type-word'],
        });
        expect(session.steps.map(step => step.kind)).not.toContain('type-word');
    });

    it('does not leave Type in the flow when its preceding Word step is disabled', () => {
        const session = createNewTabStudySession(typeCard(), {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: true,
            pitchAvailable: true,
            disabledSteps: ['word'],
        });
        expect(session.steps.map(step => step.kind)).not.toContain('word');
        expect(session.steps.map(step => step.kind)).not.toContain('type-word');
    });

    it('keeps the mobile release flow Word to Type while a sourced cloze is unavailable', () => {
        const session = createNewTabStudySession(typeCard({ spelling: 'のみもの', reading: 'のみもの', sentence: undefined }), {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            pitchAvailable: true,
        });
        expect(session.steps.map(step => step.kind)).toEqual([
            'word',
            'type-word',
            'listen-pitch',
            'speaking',
            'final-reveal',
        ]);
    });
});

describe('type-word typed answers', () => {
    it.each([
        {
            name: 'Spanish',
            language: 'es',
            spelling: 'comiendo',
            reading: 'comiendo',
            typed: 'comiendo',
            visible: 'comiendo',
            direction: 'ltr',
            outcome: 'correct',
        },
        {
            name: 'Russian',
            language: 'ru',
            spelling: 'читаю',
            reading: 'читаю',
            typed: 'читаю',
            visible: 'читаю',
            direction: 'ltr',
            outcome: 'correct',
        },
        {
            name: 'Arabic',
            language: 'ar',
            spelling: 'آكل',
            reading: 'آكل',
            typed: 'آكل',
            visible: 'آكل',
            direction: 'rtl',
            outcome: 'correct',
        },
        {
            name: 'Japanese',
            language: 'ja',
            spelling: '飲み物',
            reading: 'のみもの',
            typed: 'nomimono',
            visible: 'のみもの',
            direction: 'ltr',
            outcome: 'accepted',
        },
    ])('uses $name target input behaviour without rewriting another script', ({
        language,
        spelling,
        reading,
        typed,
        visible,
        direction,
        outcome,
    }) => {
        adoptLearningTargetLanguage(language);
        const card = typeCard({
            language,
            spelling,
            reading,
            sentence: undefined,
            pitchAccent: [],
        });
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            renderTypeWordStep(internals, root, card);
            const input = root.querySelector<HTMLInputElement>('[data-newtab-type-input]')!;
            input.value = typed;
            internals.submitTypeWordAnswer(root);

            const visibleInput = root.querySelector<HTMLInputElement>('[data-newtab-type-input]')!;
            expect(visibleInput.value).toBe(visible);
            expect(visibleInput.lang).toBe(language);
            expect(visibleInput.dir).toBe(direction);
            expect(normalizeNewTabRecallAnswer(typed)).toBe(visible);
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBe(outcome);
        } finally {
            controller.destroy();
        }
    });

    it('upgrades Type to an installed-dictionary N+1 cloze without exposing the answer', async () => {
        const card = typeCard({ sentence: undefined });
        const dictionarySentence = '冷たい飲み物が欲しい。';
        const { controller, internals } = typeWordController([card], {}, {
            loadCardRenderData: vi.fn(async () => ({
                localEntries: [{
                    expression: '飲み物',
                    reading: 'のみもの',
                    glossary: [{
                        tag: 'div',
                        'data-sc-content': 'example-sentence',
                        content: dictionarySentence,
                    }],
                    dictionary: 'Installed test dictionary',
                }],
            } as never)),
        });
        const root = studyRoot();
        try {
            renderTypeWordStep(internals, root, card);
            await vi.waitFor(() => {
                const prompt = root.querySelector<HTMLElement>('[data-newtab-prompt]');
                expect(prompt?.querySelector('.jpdb-reader-newtab-recall-gap')).not.toBeNull();
                expect(prompt?.textContent).toContain('冷たい');
                expect(prompt?.textContent).not.toContain('飲み物');
            });
            const steps = [...root.querySelectorAll<HTMLElement>('[data-study-step-kind]')]
                .map(step => step.dataset.studyStepKind);
            expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);
            expect(steps).not.toContain('recall-cloze');
        } finally {
            controller.destroy();
        }
    });

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
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBe('correct');
            expect(root.querySelector('[data-newtab-type-result]')?.getAttribute('data-newtab-type-result')).toBe('correct');

            // A later wrong answer never rewrites the recorded first attempt.
            const again = root.querySelector<HTMLInputElement>('[data-newtab-type-input]');
            again!.value = 'まちがい';
            internals.submitTypeWordAnswer(root);
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBe('correct');
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
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBe('accepted');
        } finally {
            controller.destroy();
        }
    });

    it('converts a romaji answer to kana before grading', () => {
        const card = typeCard();
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            internals.bindRootEvents(root);
            renderTypeWordStep(internals, root, card);
            const input = root.querySelector<HTMLInputElement>('[data-newtab-type-input]');
            input!.value = 'nomimono';
            internals.submitTypeWordAnswer(root);
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBe('accepted');
            expect(root.querySelector<HTMLInputElement>('[data-newtab-type-input]')?.value).toBe('のみもの');
        } finally {
            controller.destroy();
        }
    });

    it('submits Type with Enter and preserves in-progress input across rerenders', () => {
        const card = typeCard();
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            internals.bindRootEvents(root);
            renderTypeWordStep(internals, root, card);
            const input = root.querySelector<HTMLInputElement>('[data-newtab-type-input]')!;
            input.value = 'nomimono';
            input.dispatchEvent(new InputEvent('input', { bubbles: true }));
            expect(internals.studyStepStates.get(cardKey(card))?.type?.answer).toBe('nomimono');

            internals.renderWord(root, card);
            const rerendered = root.querySelector<HTMLInputElement>('[data-newtab-type-input]')!;
            expect(rerendered.value).toBe('nomimono');
            rerendered.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBe('accepted');
        } finally {
            controller.destroy();
        }
    });

    it('handles mobile form submission but ignores Enter used to commit IME composition', () => {
        const card = typeCard();
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            internals.bindRootEvents(root);
            renderTypeWordStep(internals, root, card);
            const input = root.querySelector<HTMLInputElement>('[data-newtab-type-input]')!;
            input.value = 'nomimono';
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBeUndefined();

            const form = root.querySelector<HTMLFormElement>('[data-newtab-type-form]')!;
            const submit = new Event('submit', { bubbles: true, cancelable: true });
            expect(form.dispatchEvent(submit)).toBe(false);
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBe('accepted');
        } finally {
            controller.destroy();
        }
    });

    it('focuses the Type input synchronously while a mobile tap still owns user activation', () => {
        const originalMatchMedia = window.matchMedia;
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn((query: string) => ({ matches: query === '(pointer: coarse)' })),
        });
        const card = typeCard();
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            renderTypeWordStep(internals, root, card);
            expect(document.activeElement).toBe(root.querySelector('[data-newtab-type-input]'));
        } finally {
            controller.destroy();
            if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
            else delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia;
        }
    });

    it('never shows the answer in the copy prompt sentence', () => {
        const card = typeCard();
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            internals.bindRootEvents(root);
            renderTypeWordStep(internals, root, card);
            const prompt = root.querySelector<HTMLElement>('[data-newtab-prompt]');
            expect(prompt?.textContent).not.toContain('飲み物');
            expect(prompt?.querySelector('.jpdb-reader-newtab-recall-gap')).not.toBeNull();
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
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBe('incorrect');
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
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBe('skipped');
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
            internals.advanceTypeWordHandwriting(root.querySelector('[data-newtab-reading]')!, card, 'correct');
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBe('correct');
        } finally {
            controller.destroy();
        }
    });

    it('mounts an interactive Write surface for an unrevealed WaniKani vocabulary card', () => {
        const card = typeCard({
            vid: 8801,
            sid: 7701,
            source: 'wanikani',
            reviewSource: 'wanikani-api',
            wanikaniSubjectId: 8801,
            wanikaniAssignmentId: 7701,
            wanikaniSubjectType: 'vocabulary',
            wanikaniSrsStage: 'apprentice',
        });
        const { controller, internals } = typeWordController([card], { newTabTypeWordInputMode: 'handwriting' });
        const root = studyRoot();
        try {
            internals.state.source = 'wanikani';
            renderTypeWordStep(internals, root, card);
            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(false);
            expect(root.classList.contains('jpdb-reader-newtab-kanji-mode')).toBe(false);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('type-word');
            expect(root.querySelector('.jpdb-reader-doodle-canvas')).not.toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('keeps kana visible and asks for only the kanji in a mixed word', () => {
        const card = typeCard();
        const { controller, internals } = typeWordController([card], { newTabTypeWordInputMode: 'handwriting' });
        const root = studyRoot();
        try {
            renderTypeWordStep(internals, root, card);
            const cells = () => [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-type-handwriting-cell')];
            expect(cells().map(cell => cell.textContent)).toEqual(['＿', 'み', '＿']);
            expect(cells().map(cell => cell.dataset.fixed)).toEqual(['false', 'true', 'false']);
            expect(cells().findIndex(cell => cell.dataset.active === 'true')).toBe(0);

            internals.advanceTypeWordHandwriting(root.querySelector('[data-newtab-reading]')!, card, 'correct');
            expect(cells().map(cell => cell.textContent)).toEqual(['飲', 'み', '＿']);
            expect(cells().findIndex(cell => cell.dataset.active === 'true')).toBe(2);

            internals.advanceTypeWordHandwriting(root.querySelector('[data-newtab-reading]')!, card, 'correct');
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBe('correct');
        } finally {
            controller.destroy();
        }
    });

    it('falls back to typing and disables Write for kana-only words', () => {
        const card = typeCard({ spelling: 'おはよう', reading: 'おはよう', sentence: '朝におはようと言う。' });
        const { controller, internals } = typeWordController([card], { newTabTypeWordInputMode: 'handwriting' });
        const root = studyRoot();
        try {
            renderTypeWordStep(internals, root, card);
            expect(root.querySelector('[data-newtab-type-input]')).not.toBeNull();
            expect(root.querySelector('.jpdb-reader-doodle-canvas')).toBeNull();
            const modes = [...root.querySelectorAll<HTMLButtonElement>('.jpdb-reader-newtab-type-mode')];
            expect(modes).toHaveLength(2);
            expect(modes[0]?.textContent).toBe('Type');
            expect(modes[0]?.dataset.active).toBe('true');
            expect(modes[1]?.disabled).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('uses target self-check handwriting without invoking Japanese stroke providers for Chinese', () => {
        adoptLearningTargetLanguage('zh');
        const card = typeCard({
            language: 'zh',
            spelling: '学习',
            reading: 'xuéxí',
            sentence: '我学习中文。',
            pitchAccent: [],
        });
        const loadKanjiDetails = vi.fn();
        const { controller, internals } = typeWordController(
            [card],
            { newTabTypeWordInputMode: 'handwriting' },
            { jpdbKanji: { lookup: loadKanjiDetails } as never },
        );
        const root = studyRoot();
        try {
            renderTypeWordStep(internals, root, card);
            internals.bindRootEvents(root);
            expect(root.querySelector('[data-newtab-type-input]')).toBeNull();
            expect(root.querySelector('.jpdb-reader-doodle-canvas')).not.toBeNull();
            expect(root.querySelector('[data-type-word-self-check]')).not.toBeNull();
            expect(loadKanjiDetails).not.toHaveBeenCalled();

            const compare = root.querySelector<HTMLButtonElement>('[data-newtab-action="type-word-handwriting-check"]')!;
            expect(compare.disabled).toBe(true);
            // Canvas events are owned by the doodle unit. Enabling the action
            // here represents a non-empty stroke set and exercises the actual
            // Study handlers from compare through first-attempt grading.
            compare.disabled = false;
            compare.click();
            expect(root.querySelector<HTMLElement>('[data-type-word-self-check-answer]')?.hidden).toBe(false);
            root.querySelector<HTMLButtonElement>('[data-newtab-action="type-word-handwriting-match"]')?.click();
            expect(internals.studyStepStates.get(cardKey(card))?.type?.outcome).toBe('correct');
            expect(root.querySelector('[data-newtab-type-result="correct"]')).not.toBeNull();
        } finally {
            controller.destroy();
        }
    });

    // REGRESSION 2026-08-02: the Write step gated on character LOOKUP (per-character
    // dictionary entries) when what it needs is stroke data. Those coincided while
    // Japanese was the only target with either, so the wrong question returned the
    // right answer. The moment Chinese gained per-character dictionaries, a Chinese
    // learner who had once chosen handwriting was handed the Japanese KanjiVG grader.
    // The target-owned self-check keeps Write meaningful without inventing stroke data.
    it('keeps character dictionaries and self-check handwriting as separate Han experiences', () => {
        adoptLearningTargetLanguage('zh');
        const card = typeCard({ language: 'zh', spelling: '学习', reading: 'xuéxí', sentence: '我学习中文。', pitchAccent: [] });
        const { controller, internals } = typeWordController([card], { newTabTypeWordInputMode: 'handwriting' });
        const root = studyRoot();
        try {
            renderTypeWordStep(internals, root, card);
            // Chinese HAS character lookup now — that is the whole point of the case.
            expect(targetSupportsCharacterLookup()).toBe(true);
            expect(targetSupportsHandwriting()).toBe(true);
            expect(root.querySelector('[data-newtab-type-input]')).toBeNull();
            expect(root.querySelector('[data-type-word-self-check]')).not.toBeNull();
            expect(root.querySelector('.jpdb-reader-doodle-canvas')).not.toBeNull();
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

describe('final-reveal suggested grade', () => {
    it('removes the results pills while retaining the advisory grade suggestion', () => {
        const card = typeCard();
        const { controller, internals } = typeWordController([card]);
        const root = studyRoot();
        try {
            internals.studyStepStates.set(cardKey(card), {
                recall: { outcome: 'correct' },
                pitch: { position: 3, outcome: 'correct' },
                type: { outcome: 'correct' },
            });
            internals.state.revealAnswer = true;
            internals.renderWord(root, card);
            expect(root.querySelector('[data-newtab-study-summary]')).toBeNull();
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
            internals.studyStepStates.set(cardKey(card), {
                pitch: { position: 1, outcome: 'wrong' },
                type: { outcome: 'correct' },
            });
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
