import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { playLearningVoiceBinding } from '../audio/learning-voice';
import { getLessonZeroHiraganaVisualAnchor } from '../content/lesson-zero-hiragana-visuals';
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
    eyebrow: { en: 'Studio A', ja: 'スタジオA' },
    introTitle: { en: 'Five vowel sounds', ja: '五つの母音' },
    introDialogue: {
        en: 'Xingyu: Listen. Then choose.',
        ja: 'シンユ：聞いて、選んでください。',
    },
    start: { en: 'Put on headphones', ja: 'ヘッドホンをつける' },
    learnTitle: { en: 'Listen and repeat', ja: '聞いて、まねする' },
    audioMode: { en: 'Audio', ja: '音声' },
    visualMode: { en: 'Visual', ja: '文字' },
    accessNote: {
        en: 'No audio? Use Visual.',
        ja: '音が使えないときは「文字」を選んでください。',
    },
    hear: { en: 'Play word', ja: '単語を聞く' },
    hearAgain: { en: 'Play again', ja: 'もう一度聞く' },
    studyShape: { en: 'Next', ja: '次へ' },
    nextSound: { en: 'Next', ja: '次へ' },
    readyTitle: { en: 'Ready?', ja: '準備はいい？' },
    readyBody: {
        en: 'Xingyu: Choose all five.',
        ja: 'シンユ：五つ全部を選んでください。',
    },
    beginAttempt: { en: 'Start', ja: '始める' },
    attemptTitle: { en: 'Which sound?', ja: 'どの音？' },
    bingoTitle: { en: 'Vowel bingo', ja: '母音ビンゴ' },
    playSound: { en: 'Play', ja: '聞く' },
    replaySound: { en: 'Replay', ja: 'もう一度' },
    playing: { en: 'Playing…', ja: '再生中…' },
    chooseAfter: { en: 'Choose.', ja: '一つ選んでください。' },
    visualCue: { en: 'Visual clue', ja: '文字ヒント' },
    visualCueBody: { en: 'Match this sound:', ja: 'この音を選んでください：' },
    saveError: { en: 'Not saved. Try again.', ja: '保存できませんでした。もう一度。' },
    audioError: {
        en: 'No sound. Replay or use Visual.',
        ja: '音が出ません。もう一度聞くか、「文字」を使ってください。',
    },
    repairReady: { en: 'Try again', ja: 'もう一度' },
    contrastTitle: { en: 'Quick tip', ja: 'ヒント' },
    lessonCompleteTitle: { en: 'Five vowel sounds: done', ja: '五つの母音、できました' },
    lessonCompleteDialogue: {
        en: 'Xingyu: Good. Let’s use them.',
        ja: 'シンユ：いいですね。次で使いましょう。',
    },
    reviewLine: { en: 'Saved for review.', ja: '復習に保存しました。' },
    playBingo: { en: 'Play bingo', ja: 'ビンゴに挑戦' },
    bingoCompleteTitle: { en: 'Bingo!', ja: 'ビンゴ！' },
    bingoCompleteDialogue: {
        en: 'Xingyu: All five.',
        ja: 'シンユ：五つ全部、できました。',
    },
    playAgain: { en: 'Play again', ja: 'もう一度' },
    continue: { en: 'Continue', ja: '次へ' },
    restart: { en: 'Restart', ja: '最初から' },
    leave: { en: 'Save and exit', ja: '保存して戻る' },
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
        rest.textContent = anchor.wordKana.slice(anchor.kana.length);
        word.append(first, rest);
        const image = anchorImage(item.id);
        const meaning = element('p', 'academy-vowel-anchor-meaning');
        meaning.textContent = anchor.meaning[options.language];
        meaning.dataset.jpdbReaderSurfaceIgnore = '';
        note.append(
            kana,
            romaji,
            word,
            image,
            meaning,
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
            localized('h1', 'academy-vowel-title', repairTitle(item), options.language),
            modeSwitch(signal),
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
        group.setAttribute('aria-label', options.language === 'ja' ? '練習方法' : 'Practice mode');
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
    const anchorImage = (itemId: string): HTMLImageElement => {
        const visual = getLessonZeroHiraganaVisualAnchor(itemId);
        const image = element('img', 'academy-vowel-anchor-image');
        image.src = visual.imagePath;
        image.alt = visual.imageAlt;
        image.width = 384;
        image.height = 384;
        image.decoding = 'async';
        image.dataset.vowelAnchorImage = itemId;
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

function repairTitle(item: KanaSoundMapItem | undefined): LocalizedCopy {
    if (!item) return { en: 'Ready?', ja: '準備はいい？' };
    return { en: `Try ${item.kana} again`, ja: `「${item.kana}」をもう一度` };
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
