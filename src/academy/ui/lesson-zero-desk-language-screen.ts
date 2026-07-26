import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import { playLearningVoiceBinding } from '../audio/learning-voice';
import {
    currentLessonZeroDeskWord,
    startLessonZeroDeskLanguageSession,
    transitionLessonZeroDeskLanguageSession,
    type LessonZeroDeskLanguageAction,
    type LessonZeroDeskLanguageDefinition,
    type LessonZeroDeskLanguageSessionState,
    type LessonZeroDeskLanguageTransition,
    type LessonZeroDeskPropId,
    type LessonZeroDeskWord,
} from '../domain/lesson-zero-desk-language-session';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import { academyBackgroundPicture, backButton, choiceToken, element } from './dom';

export interface LessonZeroDeskLanguageScreenOptions {
    readonly language: AcademyLanguage;
    readonly definition: LessonZeroDeskLanguageDefinition;
    readonly initialState: LessonZeroDeskLanguageSessionState;
    readonly pronunciation: PronunciationService;
    readonly onTransition: (
        before: LessonZeroDeskLanguageSessionState,
        transition: LessonZeroDeskLanguageTransition,
    ) => void | Promise<void>;
    readonly onRestart: (state: LessonZeroDeskLanguageSessionState) => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
    readonly onComplete: () => void | Promise<void>;
}

export interface LessonZeroDeskLanguageScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

const COPY = {
    eyebrow: { en: 'Two things on your desk', ja: '机の上の二つ' },
    title: { en: 'Know what Rie means', ja: 'りえ先生のことばを聞き分ける' },
    meet: { en: 'Meet it', ja: '聞く' },
    practice: { en: 'Find it', ja: '見つける' },
    transfer: { en: 'Find it again', ja: 'もう一度見つける' },
    homeworkLine: {
        en: 'This sheet goes home with you. I’ll call it shukudai.',
        ja: 'このプリントは持ち帰ります。「しゅくだい」と言います。',
    },
    exampleLine: {
        en: 'This sheet already shows how the answer works. I’ll call it rei.',
        ja: 'このプリントには答え方が書いてあります。「れい」と言います。',
    },
    kanaOptional: {
        en: 'Follow the sound and the paper. You do not need to read the kana yet.',
        ja: 'まず音とプリントを結びましょう。まだかなを読めなくても大丈夫です。',
    },
    nextExample: { en: 'Show me the other paper', ja: 'もう一枚を見る' },
    beginPractice: { en: 'Try both', ja: '二つを聞き分ける' },
    hear: { en: 'Hear Rie', ja: 'りえ先生を聞く' },
    playing: { en: 'Rie is speaking…', ja: 'りえ先生が話しています…' },
    practicePrompt: {
        en: 'Rie names one paper. Which one does she mean?',
        ja: 'りえ先生が一枚の名前を言います。どちらでしょう。',
    },
    transferPrompt: {
        en: 'The papers moved. Listen once, then find the right one.',
        ja: 'プリントの場所が変わりました。一度聞いて、見つけましょう。',
    },
    homeworkPurpose: { en: 'Work for later', ja: 'あとですること' },
    examplePurpose: { en: 'A model to follow', ja: 'まねをする見本' },
    repairTitle: { en: 'Look at just this one', ja: 'この一枚だけ見ましょう' },
    homeworkRepair: {
        en: 'Shukudai is the work you take away.',
        ja: '「しゅくだい」は、持ち帰ってする課題です。',
    },
    exampleRepair: {
        en: 'Rei is the worked model you can follow.',
        ja: '「れい」は、まねをする見本です。',
    },
    retry: { en: 'Listen and try again', ja: 'もう一度聞いて選ぶ' },
    transferReady: { en: 'You found both.', ja: '二つとも見つけました。' },
    transferReadyBody: {
        en: 'Rie swaps the papers. Find them once more without the English labels.',
        ja: 'りえ先生がプリントを入れ替えます。英語なしでもう一度見つけましょう。',
    },
    beginTransfer: { en: 'Swap the papers', ja: 'プリントを入れ替える' },
    complete: { en: 'You can tell a task from a model.', ja: '課題と見本を聞き分けられました。' },
    completeBody: {
        en: 'These two words will return when the class uses real handouts.',
        ja: 'この二つは、授業で本物のプリントを使うときにまた出てきます。',
    },
    continue: { en: 'Continue your day', ja: '今日の続きを見る' },
    again: { en: 'Practise again', ja: 'もう一度練習する' },
    saveLeave: { en: 'Save and leave', ja: '保存して戻る' },
    audioError: {
        en: 'Rie could not be heard. Try the replay button again.',
        ja: '音声を再生できませんでした。もう一度お試しください。',
    },
    saveError: {
        en: 'That step could not be saved. Please try again.',
        ja: '保存できませんでした。もう一度お試しください。',
    },
} as const;

export function createLessonZeroDeskLanguageScreen(
    options: LessonZeroDeskLanguageScreenOptions,
): LessonZeroDeskLanguageScreen {
    const lifecycle = new AbortController();
    let renderLifecycle = new AbortController();
    let state = startLessonZeroDeskLanguageSession(options.definition, options.initialState);
    let playback: Disposable | null = null;
    let busy = false;
    let disposed = false;
    let actionQueue: Promise<void> = Promise.resolve();

    const screen = element('section', 'academy-screen academy-desk-language-screen');
    screen.dataset.academyScreen = 'lesson-zero-desk-language';
    screen.dataset.academyPresentation = 'focus';
    screen.dataset.activityId = options.definition.activityId;
    screen.append(academyBackgroundPicture('classroom'));

    const shell = element('div', 'academy-desk-language-shell');
    const header = element('header', 'academy-desk-language-header');
    const back = backButton(options.language);
    back.classList.add('academy-desk-language-back');
    back.textContent = '←';
    back.title = back.getAttribute('aria-label') ?? '';
    back.addEventListener('click', () => void pauseAndLeave(), { signal: lifecycle.signal });
    const heading = element('div', 'academy-desk-language-heading');
    heading.append(
        localized('p', 'academy-desk-language-eyebrow', COPY.eyebrow, options.language),
        localized('h1', 'academy-desk-language-title', COPY.title, options.language),
    );
    const progress = element('p', 'academy-desk-language-progress');
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-live', 'polite');
    header.append(back, heading, progress);

    const body = element('div', 'academy-desk-language-body');
    const live = element('p', 'academy-desk-language-live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    shell.append(header, body, live);
    screen.append(shell);

    const render = (): void => {
        renderLifecycle.abort();
        renderLifecycle = new AbortController();
        const signal = renderLifecycle.signal;
        body.replaceChildren();
        live.textContent = '';
        screen.dataset.sessionStatus = state.status;
        screen.dataset.sessionStage = state.stage;
        progress.textContent = progressCopy()[options.language];
        if (state.stage === 'meet-homework' || state.stage === 'meet-example') {
            renderMeet(signal);
        } else if (state.stage === 'practice' || state.stage === 'transfer') {
            renderChoice(state.stage, signal);
        } else if (state.stage === 'practice-repair' || state.stage === 'transfer-repair') {
            renderRepair(signal);
        } else if (state.stage === 'transfer-ready') {
            renderTransferReady(signal);
        } else {
            renderComplete(signal);
        }
    };

    const renderMeet = (signal: AbortSignal): void => {
        const word = currentLessonZeroDeskWord(options.definition, state);
        const root = element('section', 'academy-desk-language-meet');
        const desk = deskScene();
        const focusPaper = propSheet(word.propId, {
            className: 'academy-desk-language-focus-paper',
            purpose: purposeFor(word)[options.language],
            showPurpose: true,
        });
        desk.append(focusPaper);
        const lesson = livingPaper('academy-desk-language-meet-paper');
        const speaker = element('strong', 'academy-desk-language-speaker');
        speaker.textContent = options.language === 'ja' ? 'りえ先生' : 'Rie-sensei';
        const line = localized(
            'p',
            'academy-desk-language-dialogue',
            word.id === 'homework' ? COPY.homeworkLine : COPY.exampleLine,
            options.language,
        );
        const sound = wordMark(word, true);
        const replay = replayButton(word, signal);
        const note = localized(
            'p',
            'academy-desk-language-kana-note',
            COPY.kanaOptional,
            options.language,
        );
        const next = actionButton(
            (word.id === 'homework' ? COPY.nextExample : COPY.beginPractice)[options.language],
            'academy-button-primary',
        );
        next.dataset.deskAction = 'next-introduction';
        next.addEventListener('click', () => void advanceIntroduction(), { signal });
        lesson.append(speaker, line, sound, replay, note, next);
        root.append(desk, lesson);
        body.append(root, leaveControl(signal));
    };

    const renderChoice = (
        round: 'practice' | 'transfer',
        signal: AbortSignal,
    ): void => {
        const word = currentLessonZeroDeskWord(options.definition, state);
        const root = element('section', `academy-desk-language-choice academy-desk-language-choice-${round}`);
        const prompt = livingPaper('academy-desk-language-choice-paper');
        const promptCopy = localized(
            'p',
            'academy-desk-language-choice-prompt',
            round === 'practice' ? COPY.practicePrompt : COPY.transferPrompt,
            options.language,
        );
        const wordNode = wordMark(word, false);
        const replay = replayButton(word, signal);
        prompt.append(promptCopy, wordNode, replay);

        const choices = element('div', 'academy-desk-language-props');
        choices.setAttribute('role', 'group');
        choices.setAttribute(
            'aria-label',
            options.language === 'ja' ? '二枚のプリント' : 'Two papers',
        );
        const propOrder: readonly LessonZeroDeskPropId[] = round === 'practice'
            ? ['take-home-sheet', 'worked-example']
            : ['worked-example', 'take-home-sheet'];
        propOrder.forEach((propId, index) => {
            const button = element('button', 'academy-desk-language-prop-choice');
            button.type = 'button';
            button.dataset.choice = choiceToken(index);
            button.setAttribute('aria-label', propAccessibleLabel(propId, round));
            button.append(propSheet(propId, {
                className: 'academy-desk-language-choice-sheet',
                purpose: purposeForProp(propId)[options.language],
                showPurpose: round === 'practice',
            }));
            button.addEventListener('click', () => void chooseProp(propId), { signal });
            choices.append(button);
        });
        const workspace = element('div', 'academy-desk-language-workspace');
        workspace.append(choices);
        root.append(prompt, workspace);
        body.append(root, leaveControl(signal));
        queueMicrotask(() => replay.focus({ preventScroll: true }));
    };

    const renderRepair = (signal: AbortSignal): void => {
        const word = currentLessonZeroDeskWord(options.definition, state);
        const root = element('section', 'academy-desk-language-repair');
        const portrait = characterPortrait('academy-desk-language-repair-rie');
        const paper = livingPaper('academy-desk-language-repair-paper');
        paper.append(
            localized('h2', 'academy-desk-language-repair-title', COPY.repairTitle, options.language),
            propSheet(word.propId, {
                className: 'academy-desk-language-repair-sheet',
                purpose: purposeFor(word)[options.language],
                showPurpose: true,
            }),
            wordMark(word, true),
            localized(
                'p',
                'academy-desk-language-repair-copy',
                word.id === 'homework' ? COPY.homeworkRepair : COPY.exampleRepair,
                options.language,
            ),
            replayButton(word, signal),
        );
        const retry = actionButton(COPY.retry[options.language], 'academy-button-primary');
        retry.dataset.deskAction = 'retry';
        retry.addEventListener('click', () => void beginRetry(), { signal });
        paper.append(retry);
        root.append(portrait, paper);
        body.append(root, leaveControl(signal));
        queueMicrotask(() => retry.focus({ preventScroll: true }));
    };

    const renderTransferReady = (signal: AbortSignal): void => {
        const root = element('section', 'academy-desk-language-transfer-ready');
        const portrait = characterPortrait('academy-desk-language-transfer-ready-rie');
        const paper = livingPaper('academy-desk-language-transfer-ready-paper');
        const swap = element('div', 'academy-desk-language-swap');
        swap.setAttribute('aria-hidden', 'true');
        swap.append(
            propSheet('worked-example', {
                className: 'academy-desk-language-swap-sheet',
                purpose: purposeForProp('worked-example')[options.language],
                showPurpose: false,
            }),
            propSheet('take-home-sheet', {
                className: 'academy-desk-language-swap-sheet',
                purpose: purposeForProp('take-home-sheet')[options.language],
                showPurpose: false,
            }),
        );
        const next = actionButton(COPY.beginTransfer[options.language], 'academy-button-primary');
        next.dataset.deskAction = 'begin-transfer';
        next.addEventListener('click', () => void beginTransfer(), { signal });
        paper.append(
            localized('h2', 'academy-desk-language-pass-title', COPY.transferReady, options.language),
            localized('p', 'academy-desk-language-pass-copy', COPY.transferReadyBody, options.language),
            swap,
            next,
        );
        root.append(portrait, paper);
        body.append(root, leaveControl(signal));
        queueMicrotask(() => next.focus({ preventScroll: true }));
    };

    const renderComplete = (signal: AbortSignal): void => {
        const root = element('section', 'academy-desk-language-complete');
        const desk = deskScene();
        const pair = element('div', 'academy-desk-language-complete-pair');
        pair.append(
            propSheet('take-home-sheet', {
                className: 'academy-desk-language-complete-sheet',
                purpose: purposeForProp('take-home-sheet')[options.language],
                showPurpose: true,
            }),
            propSheet('worked-example', {
                className: 'academy-desk-language-complete-sheet',
                purpose: purposeForProp('worked-example')[options.language],
                showPurpose: true,
            }),
        );
        desk.append(pair);
        const paper = livingPaper('academy-desk-language-complete-paper');
        const actions = element('div', 'academy-desk-language-complete-actions');
        const done = actionButton(COPY.continue[options.language], 'academy-button-primary');
        done.dataset.deskAction = 'complete';
        done.addEventListener('click', () => void notify(options.onComplete), { signal });
        const again = actionButton(COPY.again[options.language], 'academy-button-secondary');
        again.dataset.deskAction = 'restart';
        again.addEventListener('click', () => void restart(), { signal });
        actions.append(done, again);
        paper.append(
            localized('h2', 'academy-desk-language-complete-title', COPY.complete, options.language),
            localized('p', 'academy-desk-language-complete-copy', COPY.completeBody, options.language),
            actions,
        );
        root.append(desk, paper);
        body.append(root);
        queueMicrotask(() => done.focus({ preventScroll: true }));
    };

    const deskScene = (): HTMLElement => {
        const scene = element('div', 'academy-desk-language-scene');
        const image = element('img', 'academy-desk-language-scene-image');
        image.src = ACADEMY_ASSETS.items.classroomBelongings;
        image.alt = '';
        image.setAttribute('aria-hidden', 'true');
        image.decoding = 'async';
        scene.append(image, characterPortrait('academy-desk-language-rie'));
        return scene;
    };

    const replayButton = (
        word: LessonZeroDeskWord,
        signal: AbortSignal,
    ): HTMLButtonElement => {
        const replay = actionButton(`▶ ${COPY.hear[options.language]}`, 'academy-desk-language-replay');
        replay.dataset.deskAction = 'replay';
        replay.addEventListener('click', () => void playWord(word, replay), { signal });
        return replay;
    };

    const leaveControl = (signal: AbortSignal): HTMLElement => {
        const footer = element('footer', 'academy-desk-language-footer');
        const leave = actionButton(COPY.saveLeave[options.language], 'academy-button-secondary');
        leave.addEventListener('click', () => void pauseAndLeave(), { signal });
        footer.append(leave);
        return footer;
    };

    const runTransition = async (
        transition: LessonZeroDeskLanguageTransition,
    ): Promise<boolean> => {
        if (busy || transition.state === state) return false;
        const before = state;
        try {
            busy = true;
            screen.setAttribute('aria-busy', 'true');
            await options.onTransition(before, transition);
            playback?.dispose();
            playback = null;
            state = transition.state;
            render();
            return true;
        } catch {
            live.textContent = COPY.saveError[options.language];
            return false;
        } finally {
            busy = false;
            screen.removeAttribute('aria-busy');
        }
    };

    const enqueueAction = <T>(action: () => Promise<T>): Promise<T> => {
        const queued = actionQueue.then(action, action);
        actionQueue = queued.then(() => undefined, () => undefined);
        return queued;
    };

    const transition = (
        action: LessonZeroDeskLanguageAction,
    ): LessonZeroDeskLanguageTransition => transitionLessonZeroDeskLanguageSession(
        options.definition,
        state,
        action,
        Date.now(),
    );

    const advanceIntroduction = async (): Promise<void> => {
        await enqueueAction(async () => {
            if (state.status === 'ready' && !(await runTransition(transition({ kind: 'start' })))) {
                return;
            }
            await runTransition(transition({ kind: 'next-introduction' }));
        });
    };

    const chooseProp = async (propId: LessonZeroDeskPropId): Promise<void> => {
        await enqueueAction(() => runTransition(transition({ kind: 'choose-prop', propId })));
    };

    const beginRetry = async (): Promise<void> => {
        await enqueueAction(() => runTransition(transition({ kind: 'begin-retry' })));
    };

    const beginTransfer = async (): Promise<void> => {
        await enqueueAction(() => runTransition(transition({ kind: 'begin-transfer' })));
    };

    const pauseAndLeave = async (): Promise<void> => {
        await enqueueAction(async () => {
            if (state.status === 'active') {
                if (!(await runTransition(transition({ kind: 'pause' })))) return;
            }
            await notify(options.onBack);
        });
    };

    const restart = async (): Promise<void> => {
        await enqueueAction(async () => {
            const fresh = startLessonZeroDeskLanguageSession(options.definition);
            try {
                busy = true;
                screen.setAttribute('aria-busy', 'true');
                await options.onRestart(fresh);
                playback?.dispose();
                playback = null;
                state = fresh;
                render();
            } catch {
                live.textContent = COPY.saveError[options.language];
            } finally {
                busy = false;
                screen.removeAttribute('aria-busy');
            }
        });
    };

    const playWord = async (
        word: LessonZeroDeskWord,
        control: HTMLButtonElement,
    ): Promise<void> => {
        if (disposed) return;
        playback?.dispose();
        playback = null;
        control.disabled = true;
        control.textContent = COPY.playing[options.language];
        try {
            const active = await playLearningVoiceBinding(
                options.pronunciation,
                word.voiceBindingId,
                word.voiceJapanese,
                lifecycle.signal,
            );
            if (disposed) active?.dispose();
            else playback = active;
        } catch {
            if (!disposed) live.textContent = COPY.audioError[options.language];
        } finally {
            if (!disposed) {
                control.disabled = false;
                control.textContent = `▶ ${COPY.hear[options.language]}`;
            }
        }
    };

    const progressCopy = () => {
        if (state.stage.startsWith('meet')) return COPY.meet;
        if (state.stage.startsWith('practice')) return COPY.practice;
        return COPY.transfer;
    };

    const purposeFor = (word: LessonZeroDeskWord) =>
        word.id === 'homework' ? COPY.homeworkPurpose : COPY.examplePurpose;

    const purposeForProp = (propId: LessonZeroDeskPropId) =>
        propId === 'take-home-sheet' ? COPY.homeworkPurpose : COPY.examplePurpose;

    const propAccessibleLabel = (
        propId: LessonZeroDeskPropId,
        round: 'practice' | 'transfer',
    ): string => {
        if (round === 'practice') return purposeForProp(propId)[options.language];
        if (options.language === 'ja') {
            return propId === 'take-home-sheet'
                ? '日付とチェック欄があるプリント'
                : '矢印と答え方があるプリント';
        }
        return propId === 'take-home-sheet'
            ? 'Paper with a date and tick boxes'
            : 'Paper with arrows and a worked answer';
    };

    render();
    return {
        element: screen,
        dispose() {
            if (disposed) return;
            disposed = true;
            lifecycle.abort();
            renderLifecycle.abort();
            playback?.dispose();
            playback = null;
        },
    };
}

function livingPaper(className: string): HTMLElement {
    return element('div', `academy-desk-language-paper ${className}`);
}

function characterPortrait(className: string): HTMLImageElement {
    const portrait = element('img', className);
    portrait.src = ACADEMY_ASSETS.rie;
    portrait.alt = '';
    portrait.setAttribute('aria-hidden', 'true');
    portrait.decoding = 'async';
    return portrait;
}

function propSheet(
    propId: LessonZeroDeskPropId,
    options: Readonly<{
        className: string;
        purpose: string;
        showPurpose: boolean;
    }>,
): HTMLElement {
    const sheet = element(
        'span',
        `academy-desk-language-prop-sheet ${options.className} ${
            propId === 'take-home-sheet'
                ? 'academy-desk-language-prop-take-home'
                : 'academy-desk-language-prop-worked'
        }`,
    );
    sheet.setAttribute('aria-hidden', 'true');
    const clip = element('span', 'academy-desk-language-paperclip');
    const date = element('span', 'academy-desk-language-prop-date');
    date.textContent = propId === 'take-home-sheet' ? 'DAY 1' : 'A → B';
    const marks = element('span', 'academy-desk-language-prop-marks');
    marks.append(
        element('i', 'academy-desk-language-prop-line'),
        element('i', 'academy-desk-language-prop-line'),
        element('i', 'academy-desk-language-prop-line'),
    );
    const purpose = element('strong', 'academy-desk-language-prop-purpose');
    purpose.textContent = options.showPurpose ? options.purpose : '';
    sheet.append(clip, date, marks, purpose);
    return sheet;
}

function wordMark(word: LessonZeroDeskWord, showMeaning: boolean): HTMLElement {
    const mark = element('div', 'academy-desk-language-word');
    mark.append(
        japanese('strong', 'academy-desk-language-japanese', word.japanese),
        textSpan(word.soundCue, 'academy-desk-language-sound'),
    );
    if (showMeaning) {
        const meaning = element('span', 'academy-desk-language-meaning');
        meaning.textContent = word.meaning.en;
        meaning.dataset.jpdbReaderSurfaceIgnore = '';
        mark.append(meaning);
    }
    return mark;
}

function japanese<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    value: string,
): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    node.lang = 'ja';
    node.dataset.yomuRuntimeSurface = 'academy-desk-language';
    node.dataset.yomuFuriganaMode = 'all';
    node.textContent = value;
    return node;
}

function localized<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    value: Readonly<{ en: string; ja: string }>,
    language: AcademyLanguage,
): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    node.lang = language;
    node.textContent = value[language];
    if (language === 'ja') {
        node.dataset.yomuRuntimeSurface = 'academy-desk-language-copy';
        node.dataset.yomuFuriganaMode = 'all';
    } else {
        node.dataset.jpdbReaderSurfaceIgnore = '';
    }
    return node;
}

function textSpan(value: string, className: string): HTMLSpanElement {
    const span = element('span', className);
    span.textContent = value;
    span.dataset.jpdbReaderSurfaceIgnore = '';
    return span;
}

function actionButton(label: string, extraClass: string): HTMLButtonElement {
    const button = element('button', `academy-button ${extraClass}`);
    button.type = 'button';
    button.textContent = label;
    return button;
}

async function notify(callback: () => void | Promise<void>): Promise<void> {
    await callback();
}
