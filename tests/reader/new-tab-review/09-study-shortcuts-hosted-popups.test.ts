import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    WORD_ONLY_STUDY_DISABLED_STEPS,
    DEFAULT_SETTINGS,
    newTabTestCard,
    deferred,
    newTabSentenceToken,
    newTabPromptController,
    renderSeededNewTabWord,
    dispatchNewTabKeyboard,
    newTabPromptText,
    stubKanjiDoodleBrowserApis,
    withKanjiStudyCompanionMissing,
    NewTabController,
    NewTabRuntime,
    waitForExpect,
} from './fixtures';
import type {
    AnkiLookupResult,
    JPDBCard,
    JPDBToken,
} from './fixtures';
import { cardKey } from '../../../src/reader/cards/utils';
import { bindPrivateCommandCapability } from '../../../src/reader/dom/private-command-capabilities';
import { renderedWordPrivateValue } from '../../../src/reader/dom/rendered-word-private-state';
import { isolate } from '../../../src/reader/locales/direction';

function bindKeyboardGradeFixture(controller: NewTabController, grades: string[]): { root: HTMLElement; clicks: string[] } {
    const root = document.createElement('main');
    root.className = 'jpdb-reader-newtab';
    root.dataset.jpdbReaderRoot = 'true';
    const study = document.createElement('div');
    study.dataset.newtabStudy = 'true';
    const clicks: string[] = [];
    grades.forEach(grade => {
        const button = document.createElement('button');
        button.dataset.newtabAction = 'grade';
        button.dataset.grade = grade;
        button.addEventListener('click', () => clicks.push(grade));
        study.append(button);
    });
    root.append(study);
    Object.assign(controller as unknown as { state: { route: string; revealAnswer: boolean }; allWords: unknown[] }, {
        state: { route: 'study', revealAnswer: true },
        allWords: [{}],
    });
    (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
    document.body.append(root);
    return { root, clicks };
}

describe('new tab review — study shortcuts & hosted popup lookups', () => {
    registerNewTabReviewCleanup();
    beforeEach(() => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
    });


    it('continues to the reveal step, then reveals word study cards with Space and Enter', () => {
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, newTabStudyDisabledSteps: [] });
        const card = newTabTestCard({
            spelling: '読む',
            reading: 'よむ',
            meanings: [{ glosses: ['read'], partOfSpeech: [] }],
            sentence: '本を読む。',
            pitchAccent: ['LH'],
        });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });

        try {
            const study = root.querySelector<HTMLElement>('[data-newtab-study]')!;
            const space = dispatchNewTabKeyboard(root, ' ');
            expect(space.defaultPrevented).toBe(true);
            expect(study.dataset.newtabStudyStep).toBe('type-word');
            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(false);

            const enter = dispatchNewTabKeyboard(study, 'Enter');
            expect(enter.defaultPrevented).toBe(true);
            expect(study.dataset.newtabStudyStep).toBe('recall-cloze');
            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(false);
        } finally {
            root.remove();
        }
    });

    it('uses configurable shortcuts for study reveal and navigation', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                studyReveal: 'R',
                studyRevealAlternate: '',
                studyPrevious: 'H',
                studyPreviousAlternate: '',
                studyNext: 'L',
                studyNextAlternate: '',
            },
        });
        const cards = [
            newTabTestCard({ spelling: '一', reading: 'いち' }),
            newTabTestCard({ spelling: '二', reading: 'に' }),
        ];
        const root = renderSeededNewTabWord(controller, cards[0]!, {
            visibleWords: cards,
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });
        const navigation = { next: 0, previous: 0 };
        (controller as unknown as { showNextWord(): void }).showNextWord = () => {
            navigation.next += 1;
        };
        (controller as unknown as { showPreviousWord(): void }).showPreviousWord = () => {
            navigation.previous += 1;
        };

        try {
            expect(root.querySelector('[data-newtab-action="next"] .jpdb-reader-newtab-key-hint')?.textContent).toBe('R');

            const space = dispatchNewTabKeyboard(root, ' ');
            expect(space.defaultPrevented).toBe(false);
            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(false);

            const reveal = dispatchNewTabKeyboard(root, 'R');
            expect(reveal.defaultPrevented).toBe(true);
            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(true);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('final-reveal');

            const previous = dispatchNewTabKeyboard(root, 'H');
            expect(previous.defaultPrevented).toBe(true);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('word');

            const previousCard = dispatchNewTabKeyboard(root, 'H');
            expect(previousCard.defaultPrevented).toBe(true);
            expect(navigation.previous).toBe(1);
        } finally {
            root.remove();
        }
    });

    it('shows a compact first-run guide for the enabled merged study steps', async () => {
        const settings = { ...DEFAULT_SETTINGS, newTabStudyTourSeen: false, newTabStudyDisabledSteps: [] };
        const onSettingsChange = vi.fn();
        const controller = newTabPromptController(settings, { onSettingsChange });
        const card = newTabTestCard({
            spelling: '猫',
            reading: 'ねこ',
            meanings: [{ glosses: ['cat'], partOfSpeech: [] }],
            sentence: '猫が好きです。',
            pitchAccent: ['LH'],
        });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });

        try {
            const tour = root.querySelector<HTMLElement>('[data-newtab-study-tour]')!;
            expect(tour.hidden).toBe(false);
            expect(tour.textContent).toContain('One review, a few quick checks. Grade once at the reveal.');
            expect(tour.textContent).toContain('Draw it before the answers appear.');
            expect(tour.textContent).toContain('Type the missing Japanese.');
            expect(tour.textContent).toContain('Listen and choose the pitch shape.');
            expect(tour.textContent).toContain('Check the details, then grade.');

            root.querySelector<HTMLButtonElement>('[data-newtab-action="dismiss-study-tour"]')!.click();

            expect(settings.newTabStudyTourSeen).toBe(true);
            await waitForExpect(() => {
                expect(onSettingsChange).toHaveBeenCalledTimes(1);
                expect(tour.hidden).toBe(true);
            });
        } finally {
            root.remove();
        }
    });

    it('uses configurable navigation shortcuts to advance merged study subtasks before changing cards', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            newTabStudyDisabledSteps: ['kanji-doodle', 'listen-pitch', 'speaking'],
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                studyPrevious: 'H',
                studyPreviousAlternate: '',
                studyNext: 'L',
                studyNextAlternate: '',
            },
        });
        const card = newTabTestCard({
            spelling: '猫',
            reading: 'ねこ',
            meanings: [{ glosses: ['cat'], partOfSpeech: [] }],
            sentence: '猫が好きです。',
            pitchAccent: [],
        });
        const nextCard = newTabTestCard({ spelling: '犬', reading: 'いぬ' });
        const root = renderSeededNewTabWord(controller, card, {
            visibleWords: [card, nextCard],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });
        const navigation = { next: 0 };
        (controller as unknown as { showNextWord(): void }).showNextWord = () => {
            navigation.next += 1;
        };

        try {
            const study = root.querySelector<HTMLElement>('[data-newtab-study]')!;
            expect(study.dataset.newtabStudyStep).toBe('word');

            const next = dispatchNewTabKeyboard(root, 'L');
            expect(next.defaultPrevented).toBe(true);
            expect(navigation.next).toBe(0);
            expect(study.dataset.newtabStudyStep).toBe('type-word');
            expect(root.querySelector('[data-newtab-type-input]')).not.toBeNull();

            const previous = dispatchNewTabKeyboard(root, 'H');
            expect(previous.defaultPrevented).toBe(true);
            expect(study.dataset.newtabStudyStep).toBe('word');
        } finally {
            root.remove();
        }
    });

    it('keeps the Type field primary, supports retry feedback, and advances only after a correct retry', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            newTabStudyDisabledSteps: ['kanji-doodle', 'listen-pitch', 'speaking'],
        });
        const card = newTabTestCard({
            spelling: '猫',
            reading: 'ねこ',
            meanings: [{ glosses: ['cat'], partOfSpeech: [] }],
            sentence: '猫が好きです。',
            pitchAccent: [],
        });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });

        try {
            root.querySelector<HTMLButtonElement>('[data-study-step-kind="type-word"]')?.click();
            const input = root.querySelector<HTMLInputElement>('[data-newtab-type-input]')!;
            expect(input).not.toBeNull();
            expect(root.querySelector('[data-action="study-word-audio"]')).not.toBeNull();
            expect(root.querySelector('[data-newtab-action="previous"]')?.textContent).toBe('Previous');

            input.value = 'いぬ';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            root.querySelector<HTMLButtonElement>('[data-newtab-action="type-word-submit"]')?.click();

            expect(root.querySelector('[data-newtab-type-result]')?.textContent).toBe('Not quite — try again');
            expect(root.querySelector('[data-newtab-type-result]')?.textContent).not.toContain('猫');
            expect(root.querySelector<HTMLInputElement>('[data-newtab-type-input]')?.readOnly).toBe(false);

            const retry = root.querySelector<HTMLInputElement>('[data-newtab-type-input]')!;
            retry.value = 'ねこ';
            retry.dispatchEvent(new Event('input', { bubbles: true }));
            root.querySelector<HTMLButtonElement>('[data-newtab-action="type-word-submit"]')?.click();

            expect(root.querySelector('[data-newtab-type-result]')?.textContent)
                .toBe(`Reading accepted · ${isolate('猫')}`);
            expect(root.querySelector<HTMLInputElement>('[data-newtab-type-input]')?.readOnly).toBe(true);
            const states = (controller as unknown as {
                studyStepStates: Map<string, { type?: { outcome?: string; feedback?: string } }>;
            }).studyStepStates;
            expect(states.get(cardKey(card))?.type).toMatchObject({ outcome: 'incorrect', feedback: 'accepted' });

            root.querySelector<HTMLButtonElement>('[data-newtab-action="type-word-submit"]')?.click();
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('recall-cloze');
        } finally {
            root.remove();
        }
    });

    it('uses arrow keys for previous and next word study cards', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
        });
        const cards = [
            newTabTestCard({ spelling: '一', reading: 'いち' }),
            newTabTestCard({ spelling: '二', reading: 'に' }),
        ];
        const root = renderSeededNewTabWord(controller, cards[0]!, {
            visibleWords: cards,
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });
        const navigation = { next: 0, previous: 0 };
        (controller as unknown as { showNextWord(): void }).showNextWord = () => {
            navigation.next += 1;
        };
        (controller as unknown as { showPreviousWord(): void }).showPreviousWord = () => {
            navigation.previous += 1;
        };

        try {
            const study = root.querySelector<HTMLElement>('[data-newtab-study]')!;
            expect(study.dataset.newtabStudyStep).toBe('word');

            const right = dispatchNewTabKeyboard(root, 'ArrowRight');
            expect(right.defaultPrevented).toBe(true);
            expect(study.dataset.newtabStudyStep).toBe('final-reveal');
            expect(navigation.next).toBe(0);

            const nextCard = dispatchNewTabKeyboard(root, 'ArrowRight');
            expect(nextCard.defaultPrevented).toBe(true);
            expect(navigation.next).toBe(1);

            const left = dispatchNewTabKeyboard(root, 'ArrowLeft');
            expect(left.defaultPrevented).toBe(true);
            expect(study.dataset.newtabStudyStep).toBe('word');
            expect(navigation.previous).toBe(0);

            const previousCard = dispatchNewTabKeyboard(root, 'ArrowLeft');
            expect(previousCard.defaultPrevented).toBe(true);
            expect(navigation.previous).toBe(1);
        } finally {
            root.remove();
        }
    });

    it('uses arrow keys for previous and next kanji study cards', () => {
        const controller = newTabPromptController();
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        Object.assign(controller as unknown as { state: { mode: string; revealAnswer: boolean } }, {
            state: { mode: 'kanji', revealAnswer: false },
        });
        const navigation = { next: 0, previous: 0 };
        (controller as unknown as { showNextWord(): void }).showNextWord = () => {
            navigation.next += 1;
        };
        (controller as unknown as { showPreviousWord(): void }).showPreviousWord = () => {
            navigation.previous += 1;
        };
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
        document.body.append(root);

        try {
            const right = dispatchNewTabKeyboard(root, 'ArrowRight');
            expect(right.defaultPrevented).toBe(true);
            expect(navigation.next).toBe(1);

            const left = dispatchNewTabKeyboard(root, 'ArrowLeft');
            expect(left.defaultPrevented).toBe(true);
            expect(navigation.previous).toBe(1);
        } finally {
            root.remove();
        }
    });

    it('grades revealed cards with the 1..5 digit keys in button order (SH-8, jpdb parity)', () => {
        const controller = newTabPromptController();
        const { root, clicks } = bindKeyboardGradeFixture(controller, ['nothing', 'something', 'hard', 'okay', 'easy']);

        try {
            expect(dispatchNewTabKeyboard(root, '4').defaultPrevented).toBe(true);
            expect(dispatchNewTabKeyboard(root, '1').defaultPrevented).toBe(true);
            expect(clicks).toEqual(['okay', 'nothing']);

            // Hidden card front: digits do nothing.
            (controller as unknown as { state: { route: string; revealAnswer: boolean } }).state.revealAnswer = false;
            expect(dispatchNewTabKeyboard(root, '2').defaultPrevented).toBe(false);
            expect(clicks).toHaveLength(2);
        } finally {
            root.remove();
        }
    });

    it('grades Bunpro cards with 1 Hard / 2 Good when controls sit beside the Study surface', () => {
        const controller = newTabPromptController();
        const card = newTabTestCard({
            spelling: '予習',
            reading: 'よしゅう',
            source: 'bunpro',
            reviewSource: 'bunpro-api',
            bunproReviewId: '7701',
            bunproReviewableId: 8801,
            bunproReviewableType: 'vocabulary',
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        const study = document.createElement('div');
        study.dataset.newtabStudy = 'true';
        const controls = document.createElement('div');
        controls.dataset.newtabControls = 'true';
        const clicks: string[] = [];
        for (const grade of ['fail', 'pass']) {
            const button = document.createElement('button');
            button.dataset.newtabAction = 'grade';
            button.dataset.grade = grade;
            button.addEventListener('click', () => clicks.push(grade));
            controls.append(button);
        }
        root.append(study, controls);
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            state: { route: string; revealAnswer: boolean };
        }, {
            allWords: [card],
            visibleWords: [card],
            index: 0,
            state: { route: 'study', revealAnswer: true },
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
        document.body.append(root);

        try {
            expect(dispatchNewTabKeyboard(root, '2').defaultPrevented).toBe(true);
            expect(dispatchNewTabKeyboard(root, '1').defaultPrevented).toBe(true);
            expect(dispatchNewTabKeyboard(root, '3').defaultPrevented).toBe(false);
            expect(clicks).toEqual(['pass', 'fail']);
        } finally {
            root.remove();
        }
    });

    it('uses configurable shortcuts for study grading', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                gradeOkay: 'G',
            },
        });
        const { root, clicks } = bindKeyboardGradeFixture(controller, ['nothing', 'something', 'hard', 'okay', 'easy']);

        try {
            expect(dispatchNewTabKeyboard(root, '4').defaultPrevented).toBe(false);
            expect(dispatchNewTabKeyboard(root, 'G').defaultPrevented).toBe(true);
            expect(clicks).toEqual(['okay']);
        } finally {
            root.remove();
        }
    });

    it('does not hijack study shortcuts from text inputs or selects', () => {
        const controller = newTabPromptController();
        const cards = [
            newTabTestCard({ spelling: '読む', reading: 'よむ', meanings: [{ glosses: ['read'], partOfSpeech: [] }] }),
            newTabTestCard({ spelling: '書く', reading: 'かく', meanings: [{ glosses: ['write'], partOfSpeech: [] }] }),
        ];
        const root = renderSeededNewTabWord(controller, cards[0]!, {
            visibleWords: cards,
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });
        const input = document.createElement('input');
        const select = document.createElement('select');
        root.append(input, select);

        try {
            const space = dispatchNewTabKeyboard(input, ' ');
            const right = dispatchNewTabKeyboard(input, 'ArrowRight');
            const enter = dispatchNewTabKeyboard(select, 'Enter');

            expect(space.defaultPrevented).toBe(false);
            expect(right.defaultPrevented).toBe(false);
            expect(enter.defaultPrevented).toBe(false);
            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(false);
            expect(newTabPromptText(root)).toContain('読む');
        } finally {
            root.remove();
        }
    });

    it('ignores duplicate pointer navigation clicks from touch browsers', () => {
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
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
        root.innerHTML = '<button type="button" data-newtab-action="next">Next</button>';
        Object.assign(controller as unknown as { visibleWords: JPDBCard[] }, {
            visibleWords: [{
                vid: 1,
                sid: 1,
                rid: 1,
                spelling: '読む',
                reading: 'よむ',
                frequencyRank: null,
                partOfSpeech: [],
                meanings: [],
                cardState: ['new'],
                pitchAccent: [],
                wordWithReading: null,
                source: 'local',
            }],
        });
        let advances = 0;
        (controller as unknown as { showNextWord(): void }).showNextWord = () => {
            advances += 1;
        };
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        const button = root.querySelector('button')!;
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(advances).toBe(1);
    });

    it('routes nested kanji detail buttons and dictionary links to the popup lookup handlers', () => {
        const lookupText = vi.fn();
        const lookupDictionaryReference = vi.fn();
        const showKanjiCard = vi.fn();
        const card: JPDBCard = {
            vid: 1,
            sid: 1,
            rid: 1,
            spelling: '事情',
            reading: 'じじょう',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['circumstances'], partOfSpeech: [] }],
            cardState: ['new'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'local',
            sentence: '事情を説明する。',
        };
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            lookupText,
            lookupDictionaryReference,
            showKanjiCard,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = `
            <section data-newtab-study>
                <a class="gloss-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="国家" data-dictionary-reading="こっか" data-dictionary="Jitendex">国家</a>
                <button type="button" data-action="similar-word" data-expression="何事" data-reading="なにごと">何事</button>
                <button type="button" data-action="kanji" data-kanji="事">事</button>
            </section>
        `;
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; index: number }, {
            visibleWords: [card],
            index: 0,
        });
        const [similarWord, kanji] = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
        bindPrivateCommandCapability(similarWord!, {
            kind: 'kanji-word',
            expression: '何事',
            reading: 'なにごと',
        });
        bindPrivateCommandCapability(kanji!, { kind: 'kanji-lookup', kanji: '事' });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        root.querySelector<HTMLAnchorElement>('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        root.querySelectorAll<HTMLButtonElement>('button')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        root.querySelectorAll<HTMLButtonElement>('button')[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(lookupDictionaryReference).toHaveBeenCalledWith('国家', 'こっか', 'Jitendex', root.querySelector('a'), expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
        expect(lookupText).toHaveBeenCalledWith('何事', 'なにごと', root.querySelectorAll('button')[0], expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
        expect(showKanjiCard).toHaveBeenCalledWith(card, '事', '事情を説明する。', root.querySelectorAll('button')[1], expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
    });

    it('keeps kanji drill-down history and sheet height in hosted new-tab popups', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '漢字', reading: 'かんじ', sentence: '漢字です。' });
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            showKanjiLookupCard(card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): Promise<void>;
        };

        try {
            internals.settings = {
                ...DEFAULT_SETTINGS,
                popupMode: 'sheet',
                jpdbKanjiEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                uchisenEnabled: false,
            };

            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.textContent = '漢';
            document.body.append(trigger);
            trigger.focus();

            await internals.showKanjiLookupCard(card, '漢', '漢字です。', trigger);
            const popover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
            popover.style.setProperty('--jpdb-reader-sheet-height', '620px');

            expect(document.querySelector('.jpdb-reader-backdrop')).toBeNull();
            expect(popover.getAttribute('aria-modal')).toBe('true');
            expect(popover.getAttribute('role')).toBe('dialog');
            expect(document.activeElement).toBe(popover);
            expect(trigger.getAttribute('aria-hidden')).toBe('true');
            expect(popover.querySelector<HTMLButtonElement>('[data-action="word-back"]')?.title).toBe('Back to word: 漢字');

            const nextKanji = document.createElement('button');
            nextKanji.type = 'button';
            nextKanji.dataset.action = 'kanji';
            nextKanji.dataset.kanji = '字';
            nextKanji.textContent = '字';
            bindPrivateCommandCapability(nextKanji, { kind: 'kanji-lookup', kanji: '字' });
            popover.append(nextKanji);
            nextKanji.click();

            await waitForExpect(() => {
                const active = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
                expect(active).toBe(popover);
                expect(active.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('620px');
                expect(active.querySelector('.jpdb-reader-kanji-display')?.textContent).toBe('字');
                expect(active.querySelector<HTMLButtonElement>('[data-action="kanji-history-back"]')?.title).toBe('Back to kanji: 漢');
            });

            popover.querySelector<HTMLButtonElement>('[data-action="kanji-history-back"]')?.click();

            await waitForExpect(() => {
                expect(popover.querySelector('.jpdb-reader-kanji-display')?.textContent).toBe('漢');
                expect(popover.querySelector<HTMLButtonElement>('[data-action="word-back"]')?.title).toBe('Back to word: 漢字');
                expect(popover.querySelector('[data-action="kanji-history-back"]')).toBeNull();
                expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('620px');
            });
        } finally {
            runtime.destroy();
            restoreCanvas();
            document.body.replaceChildren();
        }
    });

    it('renders a dictionary-only hosted new-tab kanji drilldown fallback when the split library is missing', async () => {
        await withKanjiStudyCompanionMissing(async () => {
            const restoreCanvas = stubKanjiDoodleBrowserApis();
            const runtime = new NewTabRuntime();
            const card = newTabTestCard({ spelling: '漢字', reading: 'かんじ', sentence: '漢字です。' });
            const internals = runtime as unknown as {
                settings: typeof DEFAULT_SETTINGS;
                showKanjiLookupCard(card: JPDBCard, kanji: string, sentence?: string): Promise<void>;
            };

            try {
                internals.settings = {
                    ...DEFAULT_SETTINGS,
                    jpdbKanjiEnabled: true,
                    localDictionariesEnabled: false,
                    localDictionaryShowKanji: false,
                    rtkEnabled: true,
                    kanjivgEnabled: true,
                    kanjiOriginsEnabled: true,
                    kanjiOriginGraphEnabled: true,
                    uchisenEnabled: false,
                };

                await internals.showKanjiLookupCard(card, '漢', '漢字です。');
                const popover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;

                await waitForExpect(() => {
                    expect(popover.textContent).not.toContain('Install or update the Yomu Kanji/Study companion');
                    expect(popover.textContent).toContain('Kanji details are not available yet.');
                    expect(popover.querySelector('.jpdb-reader-jpdb-kanji')).toBeNull();
                    expect(popover.querySelector('.jpdb-reader-rtk')).toBeNull();
                    expect(popover.querySelector('.jpdb-reader-kanjivg-svg')).toBeNull();
                    expect(popover.querySelector('.jpdb-reader-origin-graph-wrap')).toBeNull();
                });
            } finally {
                runtime.destroy();
                restoreCanvas();
                document.body.replaceChildren();
            }
        });
    });

    it('parses Japanese settings chrome in hosted new-tab settings with segmented fallback', async () => {
        const runtime = new NewTabRuntime();
        const form = document.createElement('form');
        const parse = vi.fn(async (texts: string[], options?: { allowSegmentedFallback?: boolean }): Promise<JPDBToken[][]> => texts.map(text => {
            void options;
            const start = text.indexOf('設定');
            if (start < 0) return [];
            return [{
                card: newTabTestCard({
                    spelling: '設定',
                    reading: 'せってい',
                    source: 'fallback',
                    pitchAccent: ['LHHH'],
                    cardState: ['not-in-deck'],
                }),
                start,
                end: start + '設定'.length,
                length: '設定'.length,
                rubies: [{ text: 'せってい', start, end: start + '設定'.length, length: '設定'.length }],
                pitchClass: 'heiban',
                sentence: text,
            }];
        }));
        form.className = 'jpdb-reader-settings';
        form.dataset.jpdbReaderRoot = 'true';
        form.innerHTML = `
            <div class="jpdb-reader-settings-head"><h2>よむ 設定</h2></div>
            <div class="jpdb-reader-settings-tabs" role="tablist">
                <button class="jpdb-reader-settings-tab" type="button" role="tab">外観</button>
                <button class="jpdb-reader-settings-tab" type="button" role="tab">学習</button>
            </div>
            <fieldset data-settings-panel="appearance">
                <legend>基本</legend>
                <label><span class="jpdb-reader-settings-label-text">設定の表示言語</span><select><option>日本語</option></select></label>
                <div class="jpdb-reader-help">設定を変更します。</div>
            </fieldset>
        `;
        document.body.append(form);
        const internals = runtime as unknown as {
            activeDialog?: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            parser: { canParse(): boolean; parse: typeof parse };
            parseSettingsJapanese(form: HTMLFormElement): Promise<void>;
            enrichPublicVocabularyWords(tokens: JPDBToken[]): Promise<void>;
            enrichPitchWords(tokens: JPDBToken[]): Promise<void>;
        };

        try {
            internals.activeDialog = form;
            internals.settings = {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'ja',
                showFurigana: true,
                furiganaMode: 'all',
                showPitchAccent: true,
            };
            internals.parser = { canParse: () => true, parse };
            internals.enrichPublicVocabularyWords = vi.fn(async () => undefined);
            internals.enrichPitchWords = vi.fn(async () => undefined);

            await internals.parseSettingsJapanese(form);

            expect(parse).toHaveBeenCalledWith(expect.arrayContaining(['よむ 設定']), expect.objectContaining({
                allowJpdbTimeoutFallback: true,
                allowSegmentedFallback: true,
                includeLocalPitch: false,
                jpdbTimeoutMs: 10000,
            }));
            const titleWord = form.querySelector<HTMLElement>('h2 .jpdb-reader-word[data-expression="設定"]');
            expect(titleWord).toBeTruthy();
            expect(titleWord?.querySelector('rt')?.textContent).toBe('せってい');
            expect(titleWord?.dataset.pitchClass).toBe('heiban');
            expect(titleWord?.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(form.querySelector('.jpdb-reader-settings-label-text .jpdb-reader-word[data-expression="設定"]')).toBeTruthy();
            expect(form.querySelector('option .jpdb-reader-word')).toBeNull();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('releases the settings modal background when the new-tab backdrop dismisses settings', () => {
        const runtime = new NewTabRuntime();
        const form = document.createElement('form');
        const backdrop = document.createElement('div');
        const releaseModalBackground = vi.fn();
        form.className = 'jpdb-reader-settings';
        document.body.append(backdrop, form);
        const internals = runtime as unknown as {
            activeDialog?: HTMLElement;
            activeBackdrop?: HTMLElement;
            settingsDialog: { releaseModalBackground(): void };
            dismiss(): void;
        };
        internals.activeDialog = form;
        internals.activeBackdrop = backdrop;
        internals.settingsDialog = { releaseModalBackground };

        try {
            internals.dismiss();

            expect(form.isConnected).toBe(false);
            expect(backdrop.isConnected).toBe(false);
            expect(releaseModalBackground).toHaveBeenCalledOnce();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('dismisses mounted settings when the new-tab backdrop receives pointer input', () => {
        const runtime = new NewTabRuntime();
        const form = document.createElement('form');
        const backdrop = document.createElement('div');
        const releaseModalBackground = vi.fn();
        form.className = 'jpdb-reader-settings';
        backdrop.className = 'jpdb-reader-backdrop';
        const internals = runtime as unknown as {
            settingsDialog: { releaseModalBackground(): void };
            mountSettingsDialog(backdrop: HTMLElement, form: HTMLFormElement): void;
        };
        internals.settingsDialog = { releaseModalBackground };

        try {
            internals.mountSettingsDialog(backdrop, form);
            backdrop.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

            expect(form.isConnected).toBe(false);
            expect(backdrop.isConnected).toBe(false);
            expect(releaseModalBackground).toHaveBeenCalledOnce();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('uses segmented fallback for hosted Japanese settings chrome without JPDB', async () => {
        const runtime = new NewTabRuntime();
        const parse = vi.fn(async (_texts: string[], _options?: unknown): Promise<JPDBToken[][]> => [[]]);
        const form = document.createElement('form');
        form.className = 'jpdb-reader-settings';
        form.innerHTML = `
            <h2>よむ 設定</h2>
            <nav class="jpdb-reader-settings-tabs"><button type="button" role="tab">外観</button></nav>
            <input data-settings-search value="" aria-label="設定を検索">
            <fieldset data-settings-panel="appearance">
                <legend>外観</legend>
                <label>設定の表示言語 <span data-settings-select-options-meta>日本語</span></label>
            </fieldset>
        `;
        document.body.append(form);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            activeDialog?: HTMLElement;
            parser: { canParse(): boolean; parse: typeof parse };
            jpdbVocabulary: { search(query: string, limit?: number): Promise<JPDBCard[]> };
            jpdbPublicPitch: { lookup(expression: string, reading: string): Promise<string[]> };
            parseSettingsJapanese(form: HTMLFormElement): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'ja',
            apiKey: '',
            localDictionariesEnabled: false,
            showFurigana: true,
            furiganaMode: 'all',
            showPitchAccent: true,
        };
        internals.activeDialog = form;
        internals.parser = { canParse: () => true, parse };
        internals.jpdbVocabulary = { search: vi.fn(async () => []) };
        internals.jpdbPublicPitch = { lookup: vi.fn(async () => []) };

        try {
            await internals.parseSettingsJapanese(form);

            expect(parse).toHaveBeenCalledWith(
                expect.arrayContaining(['よむ 設定', '外観', '設定の表示言語']),
                expect.objectContaining({
                    allowJpdbTimeoutFallback: true,
                    allowSegmentedFallback: true,
                    includeLocalPitch: false,
                    jpdbTimeoutMs: 10_000,
                    requireJpdb: false,
                    skipJpdb: true,
                }),
            );
            expect(parse.mock.calls[0]?.[0] ?? []).not.toContain('日本語');
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('uses a longer JPDB parse window for hosted new-tab study text than popovers', async () => {
        const runtime = new NewTabRuntime();
        const parse = vi.fn(async () => [[]]);
        const studyRoot = document.createElement('div');
        studyRoot.innerHTML = '<span class="jpdb-reader-parseable">大切です。</span>';
        document.body.append(studyRoot);
        const internals = runtime as unknown as {
            parser: { canParse(): boolean; parse: typeof parse };
            createNewTabController(): NewTabController;
            parseNewTabContent(root: HTMLElement, options?: { jpdbTimeoutMs?: number; allowJpdbTimeoutFallback?: boolean }): Promise<void>;
        };
        internals.parser = { canParse: () => true, parse };

        try {
            const controller = internals.createNewTabController() as unknown as {
                dependencies: { parseContent(root: HTMLElement): Promise<void> | void };
            };

            await controller.dependencies.parseContent(studyRoot);

            expect(parse).toHaveBeenLastCalledWith(['大切です。'], { jpdbTimeoutMs: 15_000, allowJpdbTimeoutFallback: false, includeLocalPitch: false, allowSegmentedFallback: true, skipApi: false });

            parse.mockClear();
            const popover = document.createElement('div');
            popover.innerHTML = '<span class="jpdb-reader-parseable">日本語です。</span>';
            document.body.append(popover);

            await internals.parseNewTabContent(popover);

            expect(parse).toHaveBeenCalledWith(['日本語です。'], { jpdbTimeoutMs: 1_200, allowJpdbTimeoutFallback: false, includeLocalPitch: false, allowSegmentedFallback: true, skipApi: false });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps hosted popover sentence parsing clickable when a stale JPDB key is present', async () => {
        const runtime = new NewTabRuntime();
        const parse = vi.fn(async () => [[]]);
        const popover = document.createElement('div');
        popover.innerHTML = '<span class="jpdb-reader-parseable">日本語です。</span>';
        document.body.append(popover);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { canParse(): boolean; parse: typeof parse };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, apiKey: 'stale-jpdb-key', localDictionariesEnabled: false };
        internals.parser = { canParse: () => true, parse };

        try {
            await internals.parseNewTabContent(popover);

            expect(parse).toHaveBeenCalledWith(['日本語です。'], { jpdbTimeoutMs: 1_200, allowJpdbTimeoutFallback: false, includeLocalPitch: false, allowSegmentedFallback: true, skipApi: false });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('applies cached Anki status colouring to hosted parsed new-tab content', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ vid: 1234, sid: 5, spelling: '日本語', reading: 'にほんご' });
        const parse = vi.fn(async (): Promise<JPDBToken[][]> => [[newTabSentenceToken(card, '日本語です。')]]);
        const findCachedStatusBatch = vi.fn(async (): Promise<AnkiLookupResult[]> => [{
            state: 'known',
            notes: [],
            primary: {
                noteId: 1404,
                modelName: 'Yomu',
                deckNames: ['Core'],
                cardIds: [404],
                primaryCardId: 404,
                state: 'known',
                fields: {},
                tags: [],
                reps: 8,
                lapses: 1,
            },
            trusted: true,
        }]);
        const root = document.createElement('div');
        root.innerHTML = '<span class="jpdb-reader-parseable">日本語です。</span>';
        document.body.append(root);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { canParse(): boolean; parse: typeof parse };
            anki: { findCachedStatusBatch: typeof findCachedStatusBatch };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            showPitchAccent: false,
        };
        internals.parser = { canParse: () => true, parse };
        internals.anki = { findCachedStatusBatch };

        try {
            await internals.parseNewTabContent(root);

            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('.jpdb-reader-word')!;
                expect(word.classList.contains('anki-known')).toBe(true);
                expect(renderedWordPrivateValue(word, 'ankiState')).toBe('known');
                expect(renderedWordPrivateValue(word, 'ankiDecks')).toBe('Core');
                expect(word.title).toContain('Anki: Known');
            });
            expect(findCachedStatusBatch).toHaveBeenCalledWith([card]);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('forwards hosted nested lookup navigation options through the runtime adapter', async () => {
        const runtime = new NewTabRuntime();
        const lookupText = vi.fn(async () => undefined);
        const showLookupCard = vi.fn(async () => undefined);
        const showKanjiLookupCard = vi.fn(async () => undefined);
        const current = newTabTestCard({ spelling: '読む', reading: 'よむ', sentence: '読む。' });
        const next = newTabTestCard({ spelling: '下', reading: 'した', sentence: '下です。' });
        const previousNavigationEntry = { kind: 'word' as const, card: current, sentence: current.sentence };
        const anchor = document.createElement('span');
        const internals = runtime as unknown as {
            lookupText: typeof lookupText;
            showLookupCard: typeof showLookupCard;
            showKanjiLookupCard: typeof showKanjiLookupCard;
            activeLookupPopover?: HTMLElement;
            createNewTabController(): NewTabController;
        };
        internals.lookupText = lookupText;
        internals.showLookupCard = showLookupCard;
        internals.showKanjiLookupCard = showKanjiLookupCard;

        try {
            const controller = internals.createNewTabController() as unknown as {
                dependencies: {
                    lookupText(text: string, reading: string, anchor?: HTMLElement, options?: {
                        navigation?: string;
                        previousNavigationEntry?: typeof previousNavigationEntry;
                        reuseActivePopover?: boolean;
                        userGesture?: boolean;
                    }): Promise<void> | void;
                    lookupDictionaryReference(query: string, reading: string, dictionary: string, anchor?: HTMLElement, options?: {
                        navigation?: string;
                        previousNavigationEntry?: typeof previousNavigationEntry;
                        reuseActivePopover?: boolean;
                        userGesture?: boolean;
                    }): Promise<void> | void;
                    showLookupCard(card: JPDBCard, sentence: string, anchor?: HTMLElement, options?: {
                        navigation?: string;
                        previousNavigationEntry?: typeof previousNavigationEntry;
                        reuseActivePopover?: boolean;
                        userGesture?: boolean;
                    }): Promise<void> | void;
                    showKanjiCard(card: JPDBCard, kanji: string, sentence: string, anchor?: HTMLElement, options?: {
                        navigation?: string;
                        previousNavigationEntry?: typeof previousNavigationEntry;
                        reuseActivePopover?: boolean;
                        userGesture?: boolean;
                    }): Promise<void> | void;
                    dismissLookup(): void;
                };
            };

            await controller.dependencies.lookupText('下', 'した', anchor, {
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            });
            await controller.dependencies.lookupDictionaryReference('国家', 'こっか', 'JPDB', anchor, {
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            });
            await controller.dependencies.showLookupCard(next, '下です。', anchor, {
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            });
            await controller.dependencies.showKanjiCard(next, '下', '下です。', anchor, {
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            });

            expect(lookupText).toHaveBeenNthCalledWith(1, '下', 'した', anchor, expect.objectContaining({
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).toHaveBeenNthCalledWith(2, '国家', 'こっか', anchor, expect.objectContaining({
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(showLookupCard).toHaveBeenCalledWith(next, '下です。', anchor, expect.objectContaining({
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                autoPlay: false,
                userGesture: true,
            }));
            expect(showKanjiLookupCard).toHaveBeenCalledWith(next, '下', '下です。', anchor, expect.objectContaining({
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            }));

            const popover = document.createElement('div');
            popover.className = 'jpdb-reader-popover';
            document.body.append(popover);
            internals.activeLookupPopover = popover;

            controller.dependencies.dismissLookup();

            expect(popover.isConnected).toBe(false);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('uses the current study card as nested lookup history when no lookup popover is open', () => {
        const runtime = new NewTabRuntime();
        const current = newTabTestCard({ spelling: '読む', reading: 'よむ', sentence: '本を読む。' });
        const internals = (runtime as unknown as {
            createNewTabController(): NewTabController;
        }).createNewTabController() as unknown as {
            visibleWords: JPDBCard[];
            index: number;
            state: { mode: string };
            nestedLookupOptions(): {
                navigation?: string;
                previousNavigationEntry?: { kind: string; card: JPDBCard; sentence?: string };
                reuseActivePopover?: boolean;
                userGesture?: boolean;
            };
        };

        try {
            internals.visibleWords = [current];
            internals.index = 0;
            internals.state = { mode: 'word' };

            expect(internals.nestedLookupOptions()).toMatchObject({
                navigation: 'push-current',
                previousNavigationEntry: { kind: 'word', card: current, sentence: '本を読む。' },
                reuseActivePopover: true,
                userGesture: true,
            });
        } finally {
            runtime.destroy();
        }
    });

    it('dedupes matching in-flight hosted new-tab parses', async () => {
        const runtime = new NewTabRuntime();
        const parseResult = deferred<JPDBToken[][]>();
        const parse = vi.fn(() => parseResult.promise);
        const root = document.createElement('div');
        root.innerHTML = '<span class="jpdb-reader-parseable">日本語です。</span>';
        document.body.append(root);
        const internals = runtime as unknown as {
            parser: { canParse(): boolean; parse: typeof parse };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.parser = { canParse: () => true, parse };

        try {
            const first = internals.parseNewTabContent(root);
            const second = internals.parseNewTabContent(root);

            expect(parse).toHaveBeenCalledTimes(1);

            parseResult.resolve([[]]);
            await Promise.all([first, second]);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('reuses parsed hosted new-tab content across freshly rendered matching roots', async () => {
        const runtime = new NewTabRuntime();
        const parse = vi.fn(async () => [[]]);
        const firstRoot = document.createElement('div');
        const secondRoot = document.createElement('div');
        firstRoot.innerHTML = '<span class="jpdb-reader-parseable">大切です。</span>';
        secondRoot.innerHTML = '<span class="jpdb-reader-parseable">大切です。</span>';
        document.body.append(firstRoot, secondRoot);
        const internals = runtime as unknown as {
            parser: { canParse(): boolean; parse: typeof parse };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.parser = { canParse: () => true, parse };

        try {
            await internals.parseNewTabContent(firstRoot);
            await internals.parseNewTabContent(secondRoot);

            expect(parse).toHaveBeenCalledTimes(1);
            expect(parse).toHaveBeenCalledWith(['大切です。'], { jpdbTimeoutMs: 1_200, allowJpdbTimeoutFallback: false, includeLocalPitch: false, allowSegmentedFallback: true, skipApi: false });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('segments hosted new-tab Japanese content without a JPDB API key', async () => {
        const runtime = new NewTabRuntime();
        const root = document.createElement('div');
        root.innerHTML = '<span class="jpdb-reader-parseable">青空を見ます。</span>';
        document.body.append(root);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jpdbDefinitionsEnabled: false,
            localDictionariesEnabled: false,
            showPitchAccent: false,
        };

        try {
            await internals.parseNewTabContent(root);

            expect([...root.querySelectorAll<HTMLElement>('.jpdb-reader-word')].map(word => word.textContent)).toEqual(['青空', 'を', '見ます']);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });
});
