import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { playLearningVoiceBinding } from '../audio/learning-voice';
import { lessonZeroVowelAnchor } from '../content/lesson-zero-vowel-anchors';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import {
    lessonZeroVowelResponse,
    restartLessonZeroVowelSession,
    transitionLessonZeroVowelSession,
    type LessonZeroVowelSessionState,
    type LessonZeroVowelSessionTransition,
    type LessonZeroVowelVariant,
} from '../domain/lesson-zero-vowel-session';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import type { KanaSoundMapItem, KanaSoundMapModel, KanaSoundMapResponse } from '../minigames/kana-sound-map';
import { academyBackgroundPicture, backButton, choiceToken, element } from './dom';

type LocalizedCopy = Readonly<{ en: string; ja: string }>;

export interface LessonZeroVowelScreenOptions {
    readonly language: AcademyLanguage;
    readonly model: KanaSoundMapModel;
    readonly bingoModel: KanaSoundMapModel;
    readonly initialState: LessonZeroVowelSessionState;
    readonly pronunciation: PronunciationService;
    readonly xingyuSprite: string;
    readonly evaluate: (variant: LessonZeroVowelVariant, response: KanaSoundMapResponse) => ActivityEvaluation;
    readonly onTransition: (
        before: LessonZeroVowelSessionState,
        transition: LessonZeroVowelSessionTransition,
    ) => void | Promise<void>;
    readonly onRestart: (state: LessonZeroVowelSessionState) => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
    readonly onComplete: () => void | Promise<void>;
}

export interface LessonZeroVowelScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

const COPY = {
    eyebrow: { en: 'First sound lab', ja: '最初の音ラボ' },
    introTitle: { en: 'Five sounds open the language', ja: '五つの音から、日本語が始まる' },
    introDialogue: {
        en: "Xingyu: Japanese keeps returning to five vowel sounds. Hear those clearly and new words stop feeling like one long blur.",
        ja: 'シンユ：日本語は、五つの母音に何度も戻ります。ここが聞こえると、新しいことばが一つの長い音に聞こえなくなります。',
    },
    introReason: {
        en: "We'll meet each sound first. Then I'll hide the paper and play them in a new order.",
        ja: 'まず一音ずつ会いましょう。そのあと紙を隠して、違う順番で流します。',
    },
    start: { en: 'Take the headphones', ja: 'ヘッドホンを取る' },
    learnTitle: { en: 'Give each sound a place', ja: '一つずつ、音の場所を作ろう' },
    audioMode: { en: 'Sound', ja: '音で進む' },
    visualMode: { en: 'Visual cue', ja: '目で進む' },
    accessNote: {
        en: 'Use Sound when you can listen. Visual cue works anywhere.',
        ja: 'どちらの方法でも、同じ五文字を学び、同じ復習に保存します。',
    },
    hear: { en: 'Hear it in a word', ja: 'ことばの中で聞く' },
    hearAgain: { en: 'Hear it again', ja: 'もう一度聞く' },
    studyShape: { en: 'Hold this shape', ja: 'この形を覚える' },
    nextSound: { en: 'Keep this sound', ja: 'この音を残す' },
    readyTitle: { en: 'The paper comes away', ja: '紙を外します' },
    readyBody: {
        en: "Xingyu: I’ll play all five in a fresh order. Listen before you choose; nothing is timed.",
        ja: 'シンユ：五つを新しい順番で流します。選ぶ前に聞いてください。時間制限はありません。',
    },
    beginAttempt: { en: 'Listen without the paper', ja: '紙を見ずに聞く' },
    attemptTitle: { en: 'Which first sound did you hear?', ja: '最初に、どの音が聞こえましたか' },
    bingoTitle: { en: 'Sound bingo', ja: '音のビンゴ' },
    playSound: { en: 'Play the sound', ja: '音を再生' },
    replaySound: { en: 'Replay', ja: 'もう一度' },
    playing: { en: 'Playing…', ja: '再生中…' },
    chooseAfter: { en: 'Now choose one character.', ja: '聞こえた文字を一つ選びましょう。' },
    visualCue: { en: 'Accessible cue', ja: '視覚の手がかり' },
    visualCueBody: { en: 'Choose the hiragana for this first sound:', ja: 'この最初の音に合うひらがなを選びましょう：' },
    firstSoundOnly: { en: 'Focus on the first sound.', ja: '最初の音だけに注目します。' },
    saveError: { en: 'That step did not save. Please try it once more.', ja: '保存できませんでした。もう一度お試しください。' },
    audioError: {
        en: 'The sound did not play. Retry, or switch to the visual route without losing your place.',
        ja: '音を再生できませんでした。もう一度試すか、場所を失わずに視覚ルートへ切り替えられます。',
    },
    repairTitle: { en: 'Stay with the sound that slipped', ja: '迷った音だけ、もう一度' },
    repairDialogue: {
        en: "Xingyu: No full restart. We'll listen to the sound that moved, put it back, then try the five together.",
        ja: 'シンユ：最初からやり直しません。迷った音だけ戻してから、五つをもう一度つなげます。',
    },
    repairReady: { en: 'Try the five again', ja: '五つをもう一度試す' },
    contrastTitle: { en: 'Compare the neighbours', ja: '近い音を比べる' },
    lessonCompleteTitle: { en: 'You can hear the room now', ja: '教室の音が聞こえました' },
    lessonCompleteDialogue: {
        en: "Xingyu: That’s the first map. あ・い・う・え・お will keep turning up, but now each one has somewhere to land.",
        ja: 'シンユ：これが最初の地図です。「あ・い・う・え・お」は何度も出てきますが、もう一つずつ着地する場所があります。',
    },
    reviewLine: { en: 'All five are waiting in your review queue.', ja: '五つとも復習に入りました。' },
    playBingo: { en: 'Play sound bingo', ja: '音のビンゴで遊ぶ' },
    bingoCompleteTitle: { en: 'Bingo. The five still held.', ja: 'ビンゴ。五つの音が残りました。' },
    bingoCompleteDialogue: {
        en: "Xingyu: Different order, same anchors. That is what we're keeping.",
        ja: 'シンユ：順番が変わっても、音の場所は同じです。それを残していきましょう。',
    },
    playAgain: { en: 'Shuffle another board', ja: 'もう一枚まぜる' },
    continue: { en: 'Continue into class', ja: '授業へ進む' },
    restart: { en: 'Start the five sounds again', ja: '五つの音を最初から' },
    leave: { en: 'Save and return', ja: '保存して戻る' },
} as const;

export function createLessonZeroVowelScreen(options: LessonZeroVowelScreenOptions): LessonZeroVowelScreen {
    const lifecycle = new AbortController();
    let renderLifecycle = new AbortController();
    let state = options.initialState;
    let playback: Disposable | null = null;
    let busy = false;
    let disposed = false;
    let message = '';

    const screen = element('section', 'academy-screen academy-vowel-screen');
    screen.dataset.academyScreen = 'lesson-zero-vowel-lab';
    screen.dataset.activityId = options.model.id;
    const augmentation = options.bingoModel.payload.source.augmentation;
    if (augmentation) {
        screen.dataset.curriculumAugmentation = augmentation.provider;
        screen.dataset.curriculumCourseId = augmentation.courseId;
        screen.dataset.curriculumTopicId = augmentation.topicId;
        screen.dataset.curriculumActivityId = augmentation.activityId;
        screen.dataset.curriculumRenderOwner = augmentation.renderOwner;
    }
    screen.append(academyBackgroundPicture('languageLab'));

    const shell = element('div', 'academy-vowel-shell');
    const header = element('header', 'academy-vowel-header');
    const back = backButton(options.language);
    back.className = 'academy-vowel-back';
    back.textContent = '←';
    back.title = back.getAttribute('aria-label') ?? '';
    back.addEventListener('click', () => void pauseAndLeave(), { signal: lifecycle.signal });
    const identity = element('div', 'academy-vowel-identity');
    identity.append(localized('p', 'academy-vowel-eyebrow', COPY.eyebrow, options.language));
    header.append(back, identity);
    const body = element('div', 'academy-vowel-body');
    const live = element('p', 'academy-vowel-live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    screen.append(shell);
    shell.append(header, body, live);

    const render = (): void => {
        renderLifecycle.abort();
        renderLifecycle = new AbortController();
        const signal = renderLifecycle.signal;
        body.replaceChildren();
        live.textContent = message;
        screen.dataset.stage = state.status === 'ready' ? 'ready' : state.stage;
        screen.dataset.variant = state.variant;
        identity.replaceChildren(
            localized('p', 'academy-vowel-eyebrow', COPY.eyebrow, options.language),
            progressLabel(),
        );
        if (state.status === 'ready') renderIntro(signal);
        else if (state.stage === 'learn') renderLearn(signal);
        else if (state.stage === 'attempt') renderAttempt(signal);
        else if (state.stage === 'repair') renderRepair(signal);
        else renderComplete(signal);
    };

    const renderIntro = (signal: AbortSignal): void => {
        const scene = sceneFrame('academy-vowel-intro');
        const paper = livingPaper('academy-vowel-intro-paper');
        paper.append(
            localized('h1', 'academy-vowel-title', COPY.introTitle, options.language),
            dialogue(COPY.introDialogue),
            localized('p', 'academy-vowel-copy', COPY.introReason, options.language),
            action(COPY.start, 'primary', signal, async () => { await apply({ kind: 'start' }); }),
        );
        scene.append(xingyuPortrait('academy-vowel-intro-portrait'), paper);
        body.append(scene);
    };

    const renderLearn = (signal: AbortSignal): void => {
        const learned = state.learnedItemIds.length;
        const item = options.model.payload.items[learned];
        const scene = sceneFrame('academy-vowel-learn');
        const paper = livingPaper('academy-vowel-learn-paper');
        paper.append(
            localized('h1', 'academy-vowel-title', COPY.learnTitle, options.language),
            modeSwitch(signal),
            localized('p', 'academy-vowel-access-note', COPY.accessNote, options.language),
            vowelRail(learned),
        );
        if (item) paper.append(teachingNote(item, signal));
        else {
            const ready = element('div', 'academy-vowel-ready');
            ready.append(
                localized('h2', 'academy-vowel-subtitle', COPY.readyTitle, options.language),
                dialogue(COPY.readyBody),
                action(COPY.beginAttempt, 'primary', signal, async () => { await apply({ kind: 'begin-attempt' }); }),
            );
            paper.append(ready);
        }
        scene.append(xingyuPortrait('academy-vowel-learn-portrait'), paper);
        body.append(scene);
    };

    const teachingNote = (item: KanaSoundMapItem, signal: AbortSignal): HTMLElement => {
        const anchor = lessonZeroVowelAnchor(item.id);
        const note = element('section', 'academy-vowel-teaching-note');
        const kana = element('span', 'academy-vowel-kana');
        kana.lang = 'ja';
        kana.textContent = item.kana;
        const romaji = element('span', 'academy-vowel-romaji');
        romaji.textContent = item.romaji;
        const word = element('p', 'academy-vowel-anchor-word');
        word.lang = 'ja';
        const first = element('span', 'academy-vowel-anchor-first');
        first.textContent = anchor.kana;
        const rest = element('span', 'academy-vowel-anchor-rest');
        rest.textContent = anchor.spokenJapanese.slice(anchor.kana.length);
        word.append(first, rest);
        const meaning = element('p', 'academy-vowel-anchor-meaning');
        meaning.textContent = anchor.meaning[options.language];
        meaning.dataset.jpdbReaderSurfaceIgnore = '';
        note.append(
            kana,
            romaji,
            word,
            meaning,
            localized('p', 'academy-vowel-first-sound', COPY.firstSoundOnly, options.language),
            localized('p', 'academy-vowel-articulation', anchor.mouthCue, options.language),
        );
        const label = state.mode === 'audio' ? COPY.hear : COPY.studyShape;
        note.append(action(label, 'listen', signal, async button => {
            if (state.mode === 'audio') {
                const played = await play(item, button);
                if (!played) return;
            }
            await apply({ kind: 'learn-item', itemId: item.id });
        }));
        return note;
    };

    const renderAttempt = (signal: AbortSignal): void => {
        const item = currentItem();
        if (!item) return;
        const scene = sceneFrame('academy-vowel-attempt');
        const paper = livingPaper('academy-vowel-attempt-paper');
        paper.append(
            localized('h1', 'academy-vowel-title', state.variant === 'bingo' ? COPY.bingoTitle : COPY.attemptTitle, options.language),
            modeSwitch(signal),
            state.variant === 'bingo' ? bingoBoard() : attemptRail(),
        );
        const prompt = element('section', 'academy-vowel-question');
        const heard = state.heardRoundIds.includes(item.id);
        if (state.mode === 'audio') {
            prompt.append(action(heard ? COPY.replaySound : COPY.playSound, 'listen', signal, async button => {
                const played = await play(item, button);
                if (played && !heard) await apply({ kind: 'mark-heard', roundId: item.id });
            }));
            if (heard) prompt.append(localized('p', 'academy-vowel-choice-instruction', COPY.chooseAfter, options.language));
        } else {
            const anchor = lessonZeroVowelAnchor(item.id);
            const cue = element('div', 'academy-vowel-visual-cue');
            cue.append(
                localized('span', 'academy-vowel-visual-label', COPY.visualCue, options.language),
                localized('span', 'academy-vowel-visual-copy', COPY.visualCueBody, options.language),
                textNode('strong', 'academy-vowel-visual-romaji', item.romaji),
                textNode('span', 'academy-vowel-visual-anchor', anchor.meaning[options.language]),
            );
            prompt.append(cue);
        }
        if (state.mode === 'visual' || heard) prompt.append(choiceGrid(item, signal));
        paper.append(prompt);
        scene.append(xingyuPortrait('academy-vowel-attempt-portrait'), paper);
        body.append(scene);
    };

    const renderRepair = (signal: AbortSignal): void => {
        const itemId = state.repairItemIds[state.repairCursor];
        const item = options.model.payload.items.find(candidate => candidate.id === itemId);
        const scene = sceneFrame('academy-vowel-repair');
        const paper = livingPaper('academy-vowel-repair-paper');
        paper.append(
            localized('h1', 'academy-vowel-title', COPY.repairTitle, options.language),
            dialogue(COPY.repairDialogue),
            modeSwitch(signal),
            localized('p', 'academy-vowel-access-note', COPY.accessNote, options.language),
        );
        if (item) {
            const repair = teachingNote(item, signal);
            repair.classList.add('academy-vowel-repair-note');
            const oldButton = repair.querySelector<HTMLButtonElement>('button');
            oldButton?.remove();
            repair.append(action(state.mode === 'audio' ? COPY.hearAgain : COPY.nextSound, 'listen', signal, async button => {
                if (state.mode === 'audio') {
                    const played = await play(item, button);
                    if (!played) return;
                }
                await apply({ kind: 'complete-repair-item', itemId: item.id });
            }));
            paper.append(repair);
            const contrast = state.variant === 'bingo'
                ? options.bingoModel.payload.contrastRepairs?.find(candidate =>
                    candidate.itemIds.includes(item.id))
                : undefined;
            if (contrast) {
                const note = element('aside', 'academy-vowel-contrast-repair');
                note.dataset.curriculumQuestionId = contrast.sourceQuestionId;
                note.append(
                    localized('h2', 'academy-vowel-contrast-title', COPY.contrastTitle, options.language),
                    localized('p', 'academy-vowel-contrast-copy', contrast.cue, options.language),
                );
                paper.append(note);
            }
        } else {
            paper.append(action(COPY.repairReady, 'primary', signal, async () => { await apply({ kind: 'begin-retry' }); }));
        }
        scene.append(xingyuPortrait('academy-vowel-repair-portrait'), paper);
        body.append(scene);
    };

    const renderComplete = (signal: AbortSignal): void => {
        const bingo = state.variant === 'bingo';
        const scene = sceneFrame('academy-vowel-complete');
        const paper = livingPaper('academy-vowel-complete-paper');
        paper.append(
            localized('h1', 'academy-vowel-title', bingo ? COPY.bingoCompleteTitle : COPY.lessonCompleteTitle, options.language),
            dialogue(bingo ? COPY.bingoCompleteDialogue : COPY.lessonCompleteDialogue),
            completedVowels(),
        );
        if (!bingo) paper.append(localized('p', 'academy-vowel-review-line', COPY.reviewLine, options.language));
        const actions = element('div', 'academy-vowel-complete-actions');
        actions.append(
            action(bingo ? COPY.playAgain : COPY.playBingo, 'secondary', signal, async () => {
                await apply({ kind: 'start-bingo' });
            }),
            action(COPY.continue, 'primary', signal, options.onComplete),
            action(COPY.restart, 'quiet', signal, restart),
        );
        paper.append(actions);
        scene.append(xingyuPortrait('academy-vowel-complete-portrait'), paper);
        body.append(scene);
    };

    const modeSwitch = (signal: AbortSignal): HTMLElement => {
        const group = element('div', 'academy-vowel-mode');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', options.language === 'ja' ? '学習方法' : 'Learning route');
        ([['audio', COPY.audioMode], ['visual', COPY.visualMode]] as const).forEach(([mode, copy]) => {
            const button = action(copy, 'mode', signal, async () => { await apply({ kind: 'choose-mode', mode }); });
            button.setAttribute('aria-pressed', String(state.mode === mode));
            group.append(button);
        });
        return group;
    };

    const choiceGrid = (target: KanaSoundMapItem, signal: AbortSignal): HTMLElement => {
        const grid = element('div', 'academy-vowel-choices');
        grid.setAttribute('role', 'group');
        grid.setAttribute('aria-label', options.language === 'ja' ? 'ひらがなを選ぶ' : 'Choose one hiragana');
        choiceOrder(target.id).forEach((item, index) => {
            const button = element('button', 'academy-vowel-choice');
            button.type = 'button';
            button.dataset.jpdbReaderSurfaceIgnore = '';
            button.dataset.option = choiceToken(index);
            button.setAttribute('aria-label', options.language === 'ja' ? `${item.kana}を選ぶ` : `Choose ${item.kana}`);
            const kana = element('span', 'academy-vowel-choice-kana');
            kana.lang = 'ja';
            kana.textContent = item.kana;
            button.append(kana);
            button.addEventListener('click', () => void select(item.id), { signal });
            grid.append(button);
        });
        grid.addEventListener('keydown', event => moveChoiceFocus(event, grid), { signal });
        return grid;
    };

    const select = async (kanaId: string): Promise<void> => {
        const finalSelection = state.selections.length + 1 === options.model.payload.items.length;
        const transition = await apply({ kind: 'select', kanaId }, !finalSelection);
        if (!transition || transition.state.selections.length !== options.model.payload.items.length) return;
        const response = lessonZeroVowelResponse(options.model, transition.state);
        const evaluation = options.evaluate(transition.state.variant, response);
        await apply({ kind: 'record-result', evaluation });
    };

    const apply = async (
        actionValue: Parameters<typeof transitionLessonZeroVowelSession>[2],
        renderAfter = true,
    ): Promise<LessonZeroVowelSessionTransition | undefined> => {
        if (busy || disposed) return undefined;
        const before = state;
        const transition = transitionLessonZeroVowelSession(options.model, state, actionValue, Date.now());
        try {
            busy = true;
            screen.setAttribute('aria-busy', 'true');
            await options.onTransition(before, transition);
            state = transition.state;
            message = '';
            if (renderAfter) render();
            return transition;
        } catch (error) {
            console.error('Lesson Zero vowel transition failed.', error);
            message = COPY.saveError[options.language];
            live.textContent = message;
            return undefined;
        } finally {
            busy = false;
            screen.removeAttribute('aria-busy');
        }
    };

    const play = async (item: KanaSoundMapItem, button: HTMLButtonElement): Promise<boolean> => {
        if (busy || disposed) return false;
        playback?.dispose();
        playback = null;
        button.disabled = true;
        const label = button.textContent ?? '';
        button.textContent = COPY.playing[options.language];
        try {
            const anchor = lessonZeroVowelAnchor(item.id);
            const active = await playLearningVoiceBinding(
                options.pronunciation,
                anchor.bindingId,
                anchor.spokenJapanese,
                lifecycle.signal,
            );
            if (!active) return false;
            if (disposed) active.dispose();
            else playback = active;
            message = '';
            return true;
        } catch {
            message = COPY.audioError[options.language];
            live.textContent = message;
            return false;
        } finally {
            if (!disposed) {
                button.disabled = false;
                button.textContent = label;
            }
        }
    };

    const pauseAndLeave = async (): Promise<void> => {
        if (busy) return;
        playback?.dispose();
        playback = null;
        if (state.status === 'active') {
            const before = state;
            const transition = transitionLessonZeroVowelSession(options.model, state, { kind: 'pause' }, Date.now());
            await options.onTransition(before, transition);
            state = transition.state;
        }
        await options.onBack();
    };

    const restart = async (): Promise<void> => {
        if (busy) return;
        const fresh = restartLessonZeroVowelSession(options.model);
        await options.onRestart(fresh);
        state = fresh;
        message = '';
        render();
    };

    const progressLabel = (): HTMLElement => {
        const value = state.stage === 'learn'
            ? state.learnedItemIds.length
            : state.stage === 'attempt'
                ? state.selections.length
                : state.stage === 'repair'
                    ? state.repairCursor
                    : 5;
        const total = state.stage === 'repair' ? Math.max(1, state.repairItemIds.length) : 5;
        const label = element('p', 'academy-vowel-progress');
        label.textContent = `${Math.min(value, total)}/${total}`;
        label.dataset.jpdbReaderSurfaceIgnore = '';
        return label;
    };

    const vowelRail = (learned: number): HTMLElement => {
        const rail = element('ol', 'academy-vowel-rail');
        rail.setAttribute('aria-label', options.language === 'ja' ? '五つの母音' : 'Five vowel anchors');
        options.model.payload.items.forEach((item, index) => {
            const cell = element('li', 'academy-vowel-rail-cell');
            cell.dataset.state = index < learned ? 'learned' : index === learned ? 'current' : 'waiting';
            cell.textContent = index <= learned ? item.kana : '·';
            cell.lang = index <= learned ? 'ja' : '';
            rail.append(cell);
        });
        return rail;
    };

    const attemptRail = (): HTMLElement => {
        const rail = element('ol', 'academy-vowel-attempt-rail');
        state.roundOrder.forEach((_, index) => {
            const cell = element('li', 'academy-vowel-attempt-cell');
            const selection = state.selections[index];
            cell.dataset.state = selection ? 'marked' : index === state.selections.length ? 'current' : 'waiting';
            cell.textContent = selection
                ? options.model.payload.items.find(item => item.id === selection.kanaId)?.kana ?? '·'
                : '·';
            rail.append(cell);
        });
        return rail;
    };

    const bingoBoard = (): HTMLElement => {
        const board = element('div', 'academy-vowel-bingo-board');
        board.setAttribute('aria-label', options.language === 'ja' ? '五つの音のビンゴ盤' : 'Five-sound bingo board');
        const positions = [0, 2, 4, 6, 8];
        const placement = choiceOrder(`board:${state.attempts.length}`);
        for (let index = 0; index < 9; index += 1) {
            const tile = element('span', 'academy-vowel-bingo-tile');
            const vowelIndex = positions.indexOf(index);
            if (vowelIndex < 0) {
                tile.classList.add('academy-vowel-bingo-free');
                tile.textContent = '✦';
                tile.setAttribute('aria-hidden', 'true');
            } else {
                const item = placement[vowelIndex];
                const marked = state.selections.some(selection => selection.kanaId === item.id);
                tile.dataset.marked = String(marked);
                tile.textContent = item.kana;
                tile.lang = 'ja';
            }
            board.append(tile);
        }
        return board;
    };

    const completedVowels = (): HTMLElement => {
        const row = element('p', 'academy-vowel-completed-row');
        row.lang = 'ja';
        row.textContent = options.model.payload.items.map(item => item.kana).join('・');
        return row;
    };

    const choiceOrder = (seed: string): readonly KanaSoundMapItem[] => {
        const items = [...options.model.payload.items];
        const shift = [...seed].reduce((sum, character) => sum + character.charCodeAt(0), 0) % items.length;
        return [...items.slice(shift), ...items.slice(0, shift)];
    };

    const currentItem = (): KanaSoundMapItem | undefined => {
        const id = state.roundOrder[state.selections.length];
        return options.model.payload.items.find(item => item.id === id);
    };

    const sceneFrame = (className: string): HTMLElement => element('div', `academy-vowel-scene ${className}`);
    const livingPaper = (className: string): HTMLElement => {
        const paper = element('div', `academy-vowel-paper ${className}`);
        const clip = element('span', 'academy-vowel-paperclip');
        clip.setAttribute('aria-hidden', 'true');
        paper.append(clip);
        return paper;
    };
    const dialogue = (copy: LocalizedCopy): HTMLElement => {
        const quote = localized('p', 'academy-vowel-dialogue', copy, options.language);
        quote.dataset.speaker = 'xingyu';
        return quote;
    };
    const xingyuPortrait = (className: string): HTMLImageElement => {
        const image = element('img', `academy-vowel-xingyu ${className}`);
        image.src = options.xingyuSprite;
        image.alt = '';
        image.setAttribute('aria-hidden', 'true');
        image.decoding = 'async';
        return image;
    };
    const action = (
        copy: LocalizedCopy,
        variant: 'primary' | 'secondary' | 'listen' | 'quiet' | 'mode',
        signal: AbortSignal,
        callback: (button: HTMLButtonElement) => void | Promise<void>,
    ): HTMLButtonElement => {
        const button = element('button', `academy-button academy-vowel-action academy-vowel-action-${variant}`);
        button.type = 'button';
        button.dataset.jpdbReaderSurfaceIgnore = '';
        button.textContent = copy[options.language];
        button.setAttribute('aria-label', copy[options.language]);
        button.addEventListener('click', () => void callback(button), { signal });
        return button;
    };

    if (state.status === 'paused') {
        state = transitionLessonZeroVowelSession(options.model, state, { kind: 'resume' }, Date.now()).state;
    }
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

function localized<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    copy: LocalizedCopy,
    language: AcademyLanguage,
): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    node.lang = language;
    node.textContent = copy[language];
    if (language === 'ja') {
        node.dataset.yomuRuntimeSurface = 'lesson-zero-vowel-copy';
        node.dataset.yomuFuriganaMode = 'all';
    } else node.dataset.jpdbReaderSurfaceIgnore = '';
    return node;
}

function textNode<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    node.textContent = text;
    return node;
}

function moveChoiceFocus(event: KeyboardEvent, root: HTMLElement): void {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const choices = [...root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!choices.length) return;
    const current = Math.max(0, choices.indexOf(document.activeElement as HTMLButtonElement));
    const next = event.key === 'Home' ? 0
        : event.key === 'End' ? choices.length - 1
            : event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? (current + 1) % choices.length
                : (current - 1 + choices.length) % choices.length;
    event.preventDefault();
    choices[next].focus();
}
