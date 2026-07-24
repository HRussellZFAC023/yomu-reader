import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import { playLearningVoiceBinding } from '../audio/learning-voice';
import {
    CLASSROOM_INSTRUCTION_ACTION_PRESENTATIONS,
    type ClassroomInstructionActionPresentation,
} from '../content/lesson-zero-follow-instructions';
import {
    classroomInstructionCurrentCue,
    startClassroomInstructionSession,
    transitionClassroomInstructionSession,
    type ClassroomInstructionActionId,
    type ClassroomInstructionCue,
    type ClassroomInstructionRound,
    type ClassroomInstructionSessionDefinition,
    type ClassroomInstructionSessionState,
    type ClassroomInstructionSessionTransition,
} from '../domain/classroom-instruction-session';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import { academyBackgroundPicture, backButton, element } from './dom';

export interface ClassroomInstructionScreenOptions {
    readonly language: AcademyLanguage;
    readonly definition: ClassroomInstructionSessionDefinition;
    readonly initialState: ClassroomInstructionSessionState;
    readonly pronunciation: PronunciationService;
    readonly onTransition: (
        before: ClassroomInstructionSessionState,
        transition: ClassroomInstructionSessionTransition,
    ) => void | Promise<void>;
    readonly onRestart: (state: ClassroomInstructionSessionState) => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
}

export interface ClassroomInstructionScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

const COPY = {
    eyebrow: { en: 'Classroom rhythm', ja: '教室のリズム' },
    title: { en: 'Seven moves you’ll hear every day', ja: '毎日聞く七つの動き' },
    ready: {
        en: 'You don’t need to read these yet. Hear one line, move the room, then I’ll mix them up.',
        ja: 'まだ読めなくても大丈夫です。一つずつ聞いて動いてから、順番を変えてみましょう。',
    },
    start: { en: 'Meet the first move', ja: '最初の動きを聞く' },
    teachLabel: { en: 'Meet this move', ja: 'この動きを聞く' },
    noReadingNeeded: { en: 'Listen first. Reading can wait.', ja: 'まずは音を聞きましょう。読むのはあとで大丈夫です。' },
    tryMove: { en: 'Try this move', ja: 'この動きをやってみる' },
    practice: { en: 'Listen, then move the room.', ja: '聞いてから、教室を動かしましょう。' },
    recall: { en: 'Same seven. New order.', ja: '同じ七つを、違う順番で聞きましょう。' },
    practiceBadge: { en: 'Learn', ja: '覚える' },
    recallBadge: { en: 'Mix', ja: 'まぜる' },
    replay: { en: 'Hear Rie again', ja: 'もう一度聞く' },
    playing: { en: 'Rie is speaking…', ja: 'りえ先生が話しています…' },
    actions: { en: 'Classroom actions', ja: '教室の動作' },
    correct: { en: 'That’s the move.', ja: 'その動きです。' },
    recalled: { en: 'You caught it in the mix.', ja: '違う順番でも聞き取れました。' },
    incorrect: { en: 'That was a different classroom action.', ja: '別の動作を選びました。' },
    heard: { en: 'What Rie said', ja: 'りえ先生のことば' },
    next: { en: 'Meet the next move', ja: '次の動きを聞く' },
    nextRecall: { en: 'Next mixed line', ja: '次の一言を聞く' },
    beginRecall: { en: 'Mix the seven', ja: '七つをまぜる' },
    finish: { en: 'See what you can now follow', ja: 'できるようになったことを見る' },
    retry: { en: 'Hear it and try again', ja: 'もう一度聞いて動く' },
    complete: { en: 'You kept up with the room.', ja: '教室の流れについていけました。' },
    completeBody: {
        en: 'You followed all seven once, then caught them in a new order. They’ll return in short reviews.',
        ja: '七つを一度ずつ覚えて、違う順番でも聞き取れました。短い復習でまた会います。',
    },
    again: { en: 'Run the room again', ja: 'もう一度教室を動かす' },
    return: { en: 'Continue your day', ja: '今日の続きを見る' },
    pause: { en: 'Save and leave', ja: '保存して戻る' },
    audioError: { en: 'Rie could not be heard. Try the replay control once more.', ja: '音声を再生できませんでした。もう一度お試しください。' },
    saveError: { en: 'That move could not be saved. Please try once more.', ja: '動作を保存できませんでした。もう一度お試しください。' },
} as const;

interface InstructionFeedback {
    readonly cue: ClassroomInstructionCue;
    readonly chosen: ClassroomInstructionActionPresentation;
    readonly outcome: 'pass' | 'lapse';
    readonly round: ClassroomInstructionRound;
}

export function createClassroomInstructionScreen(
    options: ClassroomInstructionScreenOptions,
): ClassroomInstructionScreen {
    const lifecycle = new AbortController();
    let renderLifecycle = new AbortController();
    let state = startClassroomInstructionSession(options.definition, options.initialState);
    let playback: Disposable | null = null;
    let feedback: InstructionFeedback | null = null;
    let busy = false;
    let disposed = false;

    const screen = element('section', 'academy-screen academy-classroom-instruction-screen');
    screen.dataset.academyScreen = 'classroom-instruction';
    screen.dataset.activityId = options.definition.activityId;
    screen.append(academyBackgroundPicture('classroom'));

    const shell = element('div', 'academy-classroom-instruction-shell');
    const header = element('header', 'academy-classroom-instruction-header');
    const back = backButton(options.language);
    back.classList.add('academy-classroom-instruction-back');
    back.textContent = '←';
    back.title = back.getAttribute('aria-label') ?? '';
    back.addEventListener('click', () => void pauseAndLeave(), { signal: lifecycle.signal });
    const heading = element('div', 'academy-classroom-instruction-heading');
    const eyebrow = element('p', 'academy-classroom-instruction-eyebrow');
    eyebrow.textContent = COPY.eyebrow[options.language];
    const title = element('h1', 'academy-classroom-instruction-title');
    title.textContent = COPY.title[options.language];
    heading.append(eyebrow, title);
    const progress = element('p', 'academy-classroom-instruction-progress');
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-live', 'polite');
    header.append(back, heading, progress);

    const body = element('main', 'academy-classroom-instruction-body');
    const live = element('div', 'academy-classroom-instruction-live');
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
        screen.dataset.sessionStage = state.stage ?? 'teach';
        const recalling = state.stage === 'recall' || state.stage === 'recall-repair' || state.stage === 'complete';
        const progressCount = recalling ? (state.recalledCueIds ?? []).length : state.passedCueIds.length;
        progress.textContent = options.language === 'ja'
            ? recalling ? `まぜて ${progressCount}/7` : `覚えた動き ${progressCount}/7`
            : recalling ? `Mixed recall ${progressCount}/7` : `Learned ${progressCount}/7`;
        if (state.status === 'ready') {
            renderReady(signal);
            return;
        }
        if (feedback) {
            renderFeedback(feedback, signal);
            return;
        }
        if (state.status === 'complete') {
            renderComplete(signal);
            return;
        }
        renderActive(signal);
    };

    const renderReady = (signal: AbortSignal): void => {
        const intro = element('section', 'academy-classroom-instruction-intro');
        const portrait = riePortrait('academy-classroom-instruction-intro-portrait');
        const copy = element('div', 'academy-classroom-instruction-intro-copy');
        const line = localizedParagraph(COPY.ready, options.language, 'academy-classroom-instruction-intro-line');
        const start = element('button', 'academy-button academy-button-primary academy-classroom-instruction-start');
        start.type = 'button';
        start.textContent = COPY.start[options.language];
        start.addEventListener('click', () => void begin(), { signal });
        copy.append(line, start);
        intro.append(portrait, copy);
        body.append(intro);
    };

    const renderActive = (signal: AbortSignal): void => {
        const cue = classroomInstructionCurrentCue(options.definition, state);
        if (!cue) {
            state = {
                ...state,
                status: 'complete',
                stage: 'complete',
                cursor: options.definition.cues.length,
            };
            render();
            return;
        }
        if (state.stage === 'teach') {
            renderTeach(cue, signal);
            return;
        }
        body.append(riePrompt(signal), roomStage(undefined), actionRail(cue, signal), pauseAction(signal));
    };

    const renderTeach = (cue: ClassroomInstructionCue, signal: AbortSignal): void => {
        const root = element('section', 'academy-classroom-instruction-teach');
        const portrait = riePortrait('academy-classroom-instruction-teach-portrait');
        const paper = element('div', 'academy-classroom-instruction-teach-paper');
        const label = element('p', 'academy-classroom-instruction-teach-label');
        label.textContent = `${COPY.teachLabel[options.language]} · ${state.passedCueIds.length + 1}/7`;
        const japanese = element('p', 'academy-classroom-instruction-teach-japanese');
        japanese.lang = 'ja';
        japanese.dataset.yomuRuntimeSurface = 'academy-classroom-instruction-teach';
        japanese.dataset.yomuFuriganaMode = 'all';
        japanese.textContent = cue.japanese;
        const meaning = localizedParagraph(
            cue.meaning,
            options.language,
            'academy-classroom-instruction-teach-meaning',
        );
        const note = localizedParagraph(
            COPY.noReadingNeeded,
            options.language,
            'academy-classroom-instruction-teach-note',
        );
        const replay = element('button', 'academy-button academy-classroom-instruction-replay');
        replay.type = 'button';
        replay.textContent = `▶ ${COPY.replay[options.language]}`;
        replay.addEventListener('click', () => void playCurrent(replay), { signal });
        const tryMove = element('button', 'academy-button academy-button-primary academy-classroom-instruction-try');
        tryMove.type = 'button';
        tryMove.textContent = COPY.tryMove[options.language];
        tryMove.addEventListener('click', () => void introduceCurrent(), { signal });
        const actions = element('div', 'academy-classroom-instruction-teach-actions');
        actions.append(replay, tryMove);
        paper.append(label, japanese, meaning, note, actions);
        root.append(portrait, roomStage(cue.actionId), paper);
        body.append(root, pauseAction(signal));
    };

    const riePrompt = (signal: AbortSignal): HTMLElement => {
        const prompt = element('section', 'academy-classroom-instruction-prompt');
        const portrait = riePortrait('academy-classroom-instruction-prompt-portrait');
        const dialogue = element('div', 'academy-classroom-instruction-dialogue');
        const name = element('strong', 'academy-classroom-instruction-name');
        name.textContent = options.language === 'ja' ? 'りえ先生' : 'Rie-sensei';
        const recalling = state.stage === 'recall' || state.stage === 'recall-repair';
        const badge = element('span', 'academy-classroom-instruction-round');
        badge.textContent = (recalling ? COPY.recallBadge : COPY.practiceBadge)[options.language];
        const line = localizedParagraph(
            recalling ? COPY.recall : COPY.practice,
            options.language,
            'academy-classroom-instruction-line',
        );
        const replay = element('button', 'academy-button academy-classroom-instruction-replay');
        replay.type = 'button';
        replay.textContent = `▶ ${COPY.replay[options.language]}`;
        replay.addEventListener('click', () => void playCurrent(replay), { signal });
        dialogue.append(name, badge, line, replay);
        prompt.append(portrait, dialogue);
        return prompt;
    };

    const roomStage = (action?: ClassroomInstructionActionId): HTMLElement => {
        const stage = element('div', 'academy-classroom-instruction-room');
        stage.dataset.roomAction = action ?? 'waiting';
        stage.setAttribute('aria-hidden', 'true');
        const board = element('div', 'academy-classroom-instruction-board');
        board.append(element('span'), element('span'), element('span'));
        const desk = element('div', 'academy-classroom-instruction-desk');
        const book = element('div', 'academy-classroom-instruction-book');
        book.append(element('span'), element('span'));
        const pencil = element('div', 'academy-classroom-instruction-pencil');
        const clock = element('div', 'academy-classroom-instruction-clock');
        const voices = element('div', 'academy-classroom-instruction-voices');
        voices.textContent = '・・・';
        const sound = element('div', 'academy-classroom-instruction-sound');
        sound.textContent = ')))';
        desk.append(book, pencil, clock);
        stage.append(board, desk, voices, sound);
        return stage;
    };

    const actionRail = (cue: ClassroomInstructionCue, signal: AbortSignal): HTMLElement => {
        const rail = element('div', 'academy-classroom-instruction-actions');
        rail.setAttribute('role', 'group');
        rail.setAttribute('aria-label', COPY.actions[options.language]);
        for (const action of actionChoices(cue)) {
            const button = element('button', 'academy-classroom-instruction-action');
            button.type = 'button';
            button.dataset.actionId = action.actionId;
            button.setAttribute('aria-label', action.label[options.language]);
            const glyph = element('span', 'academy-classroom-instruction-action-glyph');
            glyph.lang = 'ja';
            glyph.textContent = action.glyph;
            const label = element('span', 'academy-classroom-instruction-action-label');
            label.textContent = action.label[options.language];
            button.append(glyph, label);
            button.addEventListener('click', () => void choose(cue, action), { signal });
            rail.append(button);
        }
        return rail;
    };

    const renderFeedback = (result: InstructionFeedback, signal: AbortSignal): void => {
        const root = element('section', 'academy-classroom-instruction-feedback');
        root.dataset.outcome = result.outcome;
        root.append(roomStage(result.chosen.actionId));
        const paper = element('div', 'academy-classroom-instruction-feedback-paper');
        const heading = element('h2', 'academy-classroom-instruction-feedback-title');
        heading.textContent = (
            result.outcome === 'pass'
                ? result.round === 'recall' ? COPY.recalled : COPY.correct
                : COPY.incorrect
        )[options.language];
        const reaction = localizedParagraph(
            result.chosen.roomReaction,
            options.language,
            'academy-classroom-instruction-reaction',
        );
        const heardLabel = element('span', 'academy-classroom-instruction-heard-label');
        heardLabel.textContent = COPY.heard[options.language];
        const japanese = element('p', 'academy-classroom-instruction-heard-japanese');
        japanese.lang = 'ja';
        japanese.dataset.yomuRuntimeSurface = 'academy-classroom-instruction-feedback';
        japanese.dataset.yomuFuriganaMode = 'all';
        japanese.textContent = result.cue.japanese;
        const meaning = localizedParagraph(
            result.cue.meaning,
            options.language,
            'academy-classroom-instruction-heard-meaning',
        );
        const action = element('button', 'academy-button academy-button-primary academy-classroom-instruction-continue');
        action.type = 'button';
        if (result.outcome === 'lapse') {
            action.textContent = COPY.retry[options.language];
            action.addEventListener('click', () => void clearFeedbackAndPlay(), { signal });
        } else {
            const nextCopy = state.status === 'complete'
                ? COPY.finish
                : state.stage === 'recall' && (state.recalledCueIds ?? []).length === 0
                    ? COPY.beginRecall
                    : state.stage === 'recall'
                        ? COPY.nextRecall
                        : COPY.next;
            action.textContent = nextCopy[options.language];
            action.addEventListener('click', () => void clearFeedbackAndContinue(), { signal });
        }
        paper.append(heading, reaction, heardLabel, japanese, meaning, action);
        root.append(paper);
        body.append(root);
        queueMicrotask(() => action.focus({ preventScroll: true }));
    };

    const renderComplete = (signal: AbortSignal): void => {
        const root = element('section', 'academy-classroom-instruction-complete');
        const portrait = riePortrait('academy-classroom-instruction-complete-portrait');
        const copy = element('div', 'academy-classroom-instruction-complete-copy');
        const seal = element('span', 'academy-classroom-instruction-complete-seal');
        seal.lang = 'ja';
        seal.textContent = '聴';
        seal.setAttribute('aria-hidden', 'true');
        const heading = element('h2', 'academy-classroom-instruction-complete-title');
        heading.textContent = COPY.complete[options.language];
        const line = localizedParagraph(COPY.completeBody, options.language, 'academy-classroom-instruction-complete-line');
        const actions = element('div', 'academy-classroom-instruction-complete-actions');
        const done = element('button', 'academy-button academy-button-primary');
        done.type = 'button';
        done.textContent = COPY.return[options.language];
        done.addEventListener('click', () => void notify(options.onBack), { signal });
        const again = element('button', 'academy-button academy-button-secondary');
        again.type = 'button';
        again.textContent = COPY.again[options.language];
        again.addEventListener('click', () => void restart(), { signal });
        actions.append(done, again);
        copy.append(seal, heading, line, actions);
        root.append(portrait, copy);
        body.append(root);
        queueMicrotask(() => done.focus({ preventScroll: true }));
    };

    const pauseAction = (signal: AbortSignal): HTMLElement => {
        const footer = element('footer', 'academy-classroom-instruction-footer');
        const pause = element('button', 'academy-button academy-classroom-instruction-pause');
        pause.type = 'button';
        pause.textContent = COPY.pause[options.language];
        pause.addEventListener('click', () => void pauseAndLeave(), { signal });
        footer.append(pause);
        return footer;
    };

    const begin = async (): Promise<void> => {
        if (busy) return;
        const before = state;
        const transition = transitionClassroomInstructionSession(
            options.definition,
            state,
            { kind: 'start' },
            Date.now(),
        );
        try {
            busy = true;
            await options.onTransition(before, transition);
            state = transition.state;
            render();
        } catch {
            live.textContent = COPY.saveError[options.language];
            return;
        } finally {
            busy = false;
        }
        await playCurrent();
    };

    const introduceCurrent = async (): Promise<void> => {
        if (busy || state.stage !== 'teach') return;
        const before = state;
        const transition = transitionClassroomInstructionSession(
            options.definition,
            state,
            { kind: 'introduce' },
            Date.now(),
        );
        try {
            busy = true;
            await options.onTransition(before, transition);
            state = transition.state;
            render();
        } catch {
            live.textContent = COPY.saveError[options.language];
            return;
        } finally {
            busy = false;
        }
        await playCurrent();
    };

    const choose = async (
        cue: ClassroomInstructionCue,
        action: ClassroomInstructionActionPresentation,
    ): Promise<void> => {
        if (busy) return;
        const before = state;
        const transition = transitionClassroomInstructionSession(
            options.definition,
            state,
            { kind: 'choose', actionId: action.actionId },
            Date.now(),
        );
        if (!transition.evaluation || transition.cue?.id !== cue.id) return;
        playback?.dispose();
        playback = null;
        try {
            busy = true;
            screen.setAttribute('aria-busy', 'true');
            await options.onTransition(before, transition);
            state = transition.state;
            feedback = {
                cue,
                chosen: action,
                outcome: transition.evaluation.result.outcome,
                round: transition.round ?? 'practice',
            };
            render();
        } catch {
            live.textContent = COPY.saveError[options.language];
        } finally {
            busy = false;
            screen.removeAttribute('aria-busy');
        }
    };

    const playCurrent = async (control?: HTMLButtonElement): Promise<void> => {
        const cue = classroomInstructionCurrentCue(options.definition, state);
        if (!cue || disposed) return;
        playback?.dispose();
        playback = null;
        if (control) {
            control.disabled = true;
            control.textContent = COPY.playing[options.language];
        }
        try {
            const active = await playLearningVoiceBinding(
                options.pronunciation,
                cue.voiceBindingId,
                cue.japanese,
                lifecycle.signal,
            );
            if (disposed) active?.dispose();
            else playback = active;
        } catch {
            if (!disposed) live.textContent = COPY.audioError[options.language];
        } finally {
            if (control && !disposed) {
                control.disabled = false;
                control.textContent = `▶ ${COPY.replay[options.language]}`;
            }
        }
    };

    const clearFeedbackAndPlay = async (): Promise<void> => {
        const before = state;
        const transition = transitionClassroomInstructionSession(
            options.definition,
            state,
            { kind: 'begin-retry' },
            Date.now(),
        );
        await options.onTransition(before, transition);
        state = transition.state;
        feedback = null;
        render();
        await playCurrent();
    };

    const clearFeedbackAndContinue = async (): Promise<void> => {
        feedback = null;
        render();
        if (state.status !== 'complete') await playCurrent();
    };

    const pauseAndLeave = async (): Promise<void> => {
        if (busy) return;
        if (state.status === 'active') {
            const before = state;
            const transition = transitionClassroomInstructionSession(
                options.definition,
                state,
                { kind: 'pause' },
                Date.now(),
            );
            await options.onTransition(before, transition);
            state = transition.state;
        }
        await notify(options.onBack);
    };

    const restart = async (): Promise<void> => {
        if (busy) return;
        const fresh = startClassroomInstructionSession(options.definition);
        try {
            busy = true;
            await options.onRestart(fresh);
            state = fresh;
            feedback = null;
            render();
        } finally {
            busy = false;
        }
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

function riePortrait(className: string): HTMLImageElement {
    const portrait = element('img', className);
    portrait.src = ACADEMY_ASSETS.rie;
    portrait.alt = '';
    portrait.setAttribute('aria-hidden', 'true');
    return portrait;
}

function actionChoices(cue: ClassroomInstructionCue): readonly ClassroomInstructionActionPresentation[] {
    const actions = CLASSROOM_INSTRUCTION_ACTION_PRESENTATIONS;
    const index = actions.findIndex(action => action.actionId === cue.actionId);
    if (index < 0) return actions.slice(0, 3);
    const selected = new Set([
        cue.actionId,
        actions[(index + 2) % actions.length]!.actionId,
        actions[(index + 4) % actions.length]!.actionId,
    ]);
    return actions.filter(action => selected.has(action.actionId));
}

function localizedParagraph(
    value: Readonly<{ en: string; ja: string }>,
    language: AcademyLanguage,
    className: string,
): HTMLParagraphElement {
    const paragraph = element('p', className);
    paragraph.lang = language;
    paragraph.textContent = value[language];
    if (language === 'ja') {
        paragraph.dataset.yomuRuntimeSurface = 'academy-classroom-instruction-copy';
        paragraph.dataset.yomuFuriganaMode = 'all';
    } else {
        paragraph.dataset.jpdbReaderSurfaceIgnore = '';
    }
    return paragraph;
}

async function notify(callback: () => void | Promise<void>): Promise<void> {
    await callback();
}
