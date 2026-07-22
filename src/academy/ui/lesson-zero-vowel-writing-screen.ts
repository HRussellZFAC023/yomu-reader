import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { installKanjiDoodle, type DoodleStroke } from '../../reader/kanji/doodle';
import { assessKanjiStrokes } from '../../reader/kanji/stroke-grader';
import {
    evaluateLessonZeroVowelWriting,
    type LessonZeroVowelWritingDefinition,
    type LessonZeroVowelWritingItem,
} from '../content/lesson-zero-vowel-writing';
import {
    restartLessonZeroVowelWritingSession,
    transitionLessonZeroVowelWritingSession,
    type LessonZeroVowelWritingSessionState,
    type LessonZeroVowelWritingTransition,
} from '../domain/lesson-zero-vowel-writing-session';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import { academyBackgroundPicture, backButton, choiceToken, element } from './dom';

type Localized = Readonly<{ en: string; ja: string }>;
type DoodleRoot = HTMLElement & { __yomuKanjiDoodleCleanup?: () => void };

export interface LessonZeroVowelWritingScreenOptions {
    readonly language: AcademyLanguage;
    readonly definition: LessonZeroVowelWritingDefinition;
    readonly initialState: LessonZeroVowelWritingSessionState;
    readonly pronunciation: PronunciationService;
    readonly rieSprite: string;
    readonly onTransition: (
        before: LessonZeroVowelWritingSessionState,
        transition: LessonZeroVowelWritingTransition,
    ) => void | Promise<void>;
    readonly onRestart: (state: LessonZeroVowelWritingSessionState) => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
    readonly onComplete: () => void | Promise<void>;
}

export interface LessonZeroVowelWritingScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

const COPY = {
    eyebrow: { en: 'First writing desk', ja: '最初の文字机' },
    introTitle: { en: 'Let the five sounds leave a mark', ja: '五つの音を、紙に残そう' },
    introDialogue: {
        en: "Rie: You already found these sounds with your ears. Now we'll give each one a shape your hand can remember.",
        ja: 'りえ：耳で見つけた五つの音に、今度は手で覚えられる形をつけましょう。',
    },
    introReason: {
        en: 'Writing is not a decoration here. It makes the small turns and separate strokes visible, which helps you tell similar kana apart later.',
        ja: 'ここで書くのは飾りではありません。線の曲がり方や離れ方が見えると、あとで似たかなを区別しやすくなります。',
    },
    start: { en: 'Open the practice book', ja: '練習帳を開く' },
    learnTitle: { en: 'Meet the shape before the pen moves', ja: '書く前に、形と会う' },
    learnDialogue: {
        en: "Rie: Look once, say the sound, then make your own attempt. I won't put the stroke guide under your hand unless you need it.",
        ja: 'りえ：一度見て、音を言ってから、自分で書いてみましょう。必要になるまで、書き順の見本は下に置きません。',
    },
    drawMode: { en: 'Draw it', ja: '書いて進む' },
    planMode: { en: 'Choose the stroke plan', ja: '書き順で進む' },
    accessNote: {
        en: 'Both routes check stroke count, order, and direction. The drawing route also checks the shape you made.',
        ja: 'どちらも画数・順番・方向を確認します。書くルートでは、できた形も確認します。',
    },
    hear: { en: 'Hear the sound', ja: '音を聞く' },
    beginDraw: { en: 'Write this kana', ja: 'このかなを書く' },
    beginPlan: { en: 'Choose its stroke plan', ja: '書き順を選ぶ' },
    drawTitle: { en: 'Write it from the shape you kept', ja: '覚えた形を、書いてみよう' },
    planTitle: { en: 'How does the pen move?', ja: 'ペンは、どう動きますか' },
    drawPrompt: { en: 'Lift between strokes. When it feels finished, check your mark.', ja: '一画ごとにペンを離します。書けたら、確認しましょう。' },
    planPrompt: { en: 'Choose one complete stroke plan, then check it.', ja: '書き順を一つ選んでから、確認しましょう。' },
    clear: { en: 'Clear page', ja: '消す' },
    checkMark: { en: 'Check my mark', ja: '書いた形を確認' },
    checkPlan: { en: 'Check the plan', ja: '書き順を確認' },
    soundPlaying: { en: 'Playing…', ja: '再生中…' },
    audioError: { en: 'That sound did not play. Your writing place is still saved.', ja: '音を再生できませんでした。書く場所は保存されています。' },
    chooseFirst: { en: 'Choose a stroke plan first.', ja: '先に書き順を一つ選んでください。' },
    drawFirst: { en: 'Make at least one complete stroke first.', ja: 'まず一画、最後まで書いてください。' },
    saveError: { en: 'That attempt did not save. Please try it once more.', ja: '保存できませんでした。もう一度お試しください。' },
    repairTitle: { en: 'Keep the kana. Repair only the movement.', ja: 'かなはそのまま。動きだけ直そう' },
    repairDialogue: {
        en: "Rie: Good. Now we know exactly where the pen lost the shape. Look at this one guide, then try the same kana again.",
        ja: 'りえ：大丈夫。どこで形が離れたか分かりました。この一つだけ見て、同じかなをもう一度書きましょう。',
    },
    practiceSheet: { en: "Rie's five-vowel practice sheet", ja: 'りえの五十音練習シート' },
    guideNote: { en: 'The numbered line appears on your next attempt.', ja: '次の練習では、番号つきの線が表示されます。' },
    retry: { en: 'Try this kana again', ja: 'このかなをもう一度' },
    completeTitle: { en: 'The first line is yours', ja: '最初の一行が、できました' },
    completeDialogue: {
        en: "Rie: There. Five sounds, five marks. You don't need to make them beautiful yet. You only need to know how each one begins.",
        ja: 'りえ：できました。五つの音、五つの形。まだきれいでなくて大丈夫です。それぞれの始まり方が分かれば十分です。',
    },
    completeNote: { en: 'The five kana are now in your review queue, one shape at a time.', ja: '五つのかなが、一文字ずつ復習に入りました。' },
    continue: { en: 'Carry the line into class', ja: 'この一行を授業へ持っていく' },
    restart: { en: 'Practice all five again', ja: '五つを最初から練習' },
} as const;

export function createLessonZeroVowelWritingScreen(
    options: LessonZeroVowelWritingScreenOptions,
): LessonZeroVowelWritingScreen {
    const lifecycle = new AbortController();
    let renderLifecycle = new AbortController();
    let state = options.initialState;
    let playback: Disposable | null = null;
    let activeDoodle: DoodleRoot | null = null;
    let activeStrokes: DoodleStroke[] = [];
    let selectedPlanId = '';
    let busy = false;
    let disposed = false;
    let message = '';

    const screen = element('section', 'academy-screen academy-vowel-screen academy-vowel-writing-screen');
    screen.dataset.academyScreen = 'lesson-zero-vowel-writing';
    screen.dataset.activityId = options.definition.id;
    screen.append(academyBackgroundPicture('writingStudio'));

    const shell = element('div', 'academy-vowel-shell');
    const header = element('header', 'academy-vowel-header');
    const back = backButton(options.language);
    back.className = 'academy-vowel-back';
    back.textContent = '←';
    back.title = back.getAttribute('aria-label') ?? '';
    back.addEventListener('click', () => void pauseAndLeave(), { signal: lifecycle.signal });
    const identity = element('div', 'academy-vowel-identity');
    header.append(back, identity);
    const body = element('div', 'academy-vowel-body');
    const live = element('p', 'academy-vowel-live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    screen.append(shell);
    shell.append(header, body, live);

    const render = (): void => {
        activeDoodle?.__yomuKanjiDoodleCleanup?.();
        activeDoodle = null;
        activeStrokes = [];
        selectedPlanId = '';
        renderLifecycle.abort();
        renderLifecycle = new AbortController();
        const signal = renderLifecycle.signal;
        body.replaceChildren();
        live.textContent = message;
        screen.dataset.stage = state.status === 'ready' ? 'ready' : state.stage;
        screen.dataset.mode = state.mode;
        identity.replaceChildren(
            localized('p', 'academy-vowel-eyebrow', COPY.eyebrow),
            progressLabel(),
        );
        if (state.status === 'ready') renderIntro(signal);
        else if (state.stage === 'learn') renderLearn(signal);
        else if (state.stage === 'attempt') renderAttempt(signal);
        else if (state.stage === 'repair') renderRepair(signal);
        else renderComplete(signal);
    };

    const renderIntro = (signal: AbortSignal): void => {
        const paper = livingPaper('academy-vowel-writing-intro-paper');
        paper.append(
            localized('h1', 'academy-vowel-title', COPY.introTitle),
            dialogue(COPY.introDialogue),
            localized('p', 'academy-vowel-copy', COPY.introReason),
            action(COPY.start, 'primary', signal, async () => { await apply({ kind: 'start' }); }),
        );
        appendScene(paper, 'academy-vowel-writing-intro');
    };

    const renderLearn = (signal: AbortSignal): void => {
        const item = currentItem();
        if (!item) return;
        const paper = livingPaper('academy-vowel-writing-learn-paper');
        paper.append(
            localized('h1', 'academy-vowel-title', COPY.learnTitle),
            dialogue(COPY.learnDialogue),
            modeSwitch(signal),
            localized('p', 'academy-vowel-access-note', COPY.accessNote),
            kanaRail(),
            targetCard(item, signal),
        );
        appendScene(paper, 'academy-vowel-writing-learn');
    };

    const renderAttempt = (signal: AbortSignal): void => {
        const item = currentItem();
        if (!item) return;
        const guided = state.guideItemIds.includes(item.id);
        const paper = livingPaper('academy-vowel-writing-attempt-paper');
        paper.append(
            localized('h1', 'academy-vowel-title', state.mode === 'draw' ? COPY.drawTitle : COPY.planTitle),
            modeSwitch(signal),
            kanaRail(),
            targetGlyph(item),
        );
        if (state.mode === 'draw') paper.append(drawingAttempt(item, guided, signal));
        else paper.append(planAttempt(item, signal));
        appendScene(paper, 'academy-vowel-writing-attempt');
    };

    const renderRepair = (signal: AbortSignal): void => {
        const item = currentItem();
        if (!item) return;
        const paper = livingPaper('academy-vowel-writing-repair-paper');
        paper.append(
            localized('h1', 'academy-vowel-title', COPY.repairTitle),
            dialogue(COPY.repairDialogue),
            kanaRail(),
            strokeGuide(item),
            sourceSheet(),
            localized('p', 'academy-vowel-writing-guide-note', COPY.guideNote),
            action(COPY.retry, 'primary', signal, async () => { await apply({ kind: 'begin-retry' }); }),
        );
        appendScene(paper, 'academy-vowel-writing-repair');
    };

    const renderComplete = (signal: AbortSignal): void => {
        const paper = livingPaper('academy-vowel-writing-complete-paper');
        paper.append(
            localized('h1', 'academy-vowel-title', COPY.completeTitle),
            dialogue(COPY.completeDialogue),
            completedLine(),
            localized('p', 'academy-vowel-writing-complete-note', COPY.completeNote),
        );
        const actions = element('div', 'academy-vowel-complete-actions');
        actions.append(
            action(COPY.restart, 'secondary', signal, restart),
            action(COPY.continue, 'primary', signal, options.onComplete),
        );
        paper.append(actions);
        appendScene(paper, 'academy-vowel-writing-complete');
    };

    const targetCard = (item: LessonZeroVowelWritingItem, signal: AbortSignal): HTMLElement => {
        const card = element('section', 'academy-vowel-writing-target');
        card.append(targetGlyph(item));
        const copy = element('div', 'academy-vowel-writing-target-copy');
        const line = element('p', 'academy-vowel-writing-target-line');
        line.textContent = options.language === 'ja'
            ? `音は「${item.kana}」。形を一度だけ見てください。`
            : `The sound is ${item.romaji}. Look at the shape once.`;
        line.dataset.jpdbReaderSurfaceIgnore = '';
        const controls = element('div', 'academy-vowel-writing-target-actions');
        controls.append(
            action(COPY.hear, 'listen', signal, button => play(item, button)),
            action(state.mode === 'draw' ? COPY.beginDraw : COPY.beginPlan, 'primary', signal,
                async () => { await apply({ kind: 'learn-item', itemId: item.id }); }),
        );
        copy.append(line, controls);
        card.append(copy);
        return card;
    };

    const targetGlyph = (item: LessonZeroVowelWritingItem): HTMLElement => {
        const target = element('div', 'academy-vowel-writing-glyph');
        target.lang = 'ja';
        target.textContent = item.kana;
        target.setAttribute('aria-label', options.language === 'ja' ? `${item.kana}の形` : `Shape of ${item.kana}`);
        target.dataset.jpdbReaderSurfaceIgnore = '';
        return target;
    };

    const drawingAttempt = (
        item: LessonZeroVowelWritingItem,
        guided: boolean,
        signal: AbortSignal,
    ): HTMLElement => {
        const section = element('section', 'academy-vowel-writing-work');
        section.append(localized('p', 'academy-vowel-writing-prompt', COPY.drawPrompt));
        const doodle = doodleShell(item, guided);
        activeDoodle = doodle;
        section.append(doodle);
        const check = action(COPY.checkMark, 'primary', signal, async () => {
            const valid = activeStrokes.filter(stroke => stroke.length > 1);
            if (!valid.length) {
                message = COPY.drawFirst[options.language];
                live.textContent = message;
                return;
            }
            const assessment = assessKanjiStrokes(
                activeStrokes,
                item.strokeCount,
                item.strokeShapes.map(stroke => stroke.map(point => ({ ...point }))),
            );
            await submit(item, { mode: 'draw', assessment });
        });
        section.append(check);
        installKanjiDoodle(doodle, () => options.language, {
            onChange(strokes) {
                activeStrokes = strokes.map(stroke => stroke.map(point => ({ ...point })));
                message = '';
                live.textContent = '';
            },
            onClear() {
                activeStrokes = [];
                message = '';
                live.textContent = '';
            },
        });
        return section;
    };

    const planAttempt = (item: LessonZeroVowelWritingItem, signal: AbortSignal): HTMLElement => {
        const section = element('section', 'academy-vowel-writing-work');
        section.append(localized('p', 'academy-vowel-writing-prompt', COPY.planPrompt));
        const choices = element('div', 'academy-vowel-writing-plans');
        choices.setAttribute('role', 'group');
        choices.setAttribute('aria-label', options.language === 'ja' ? `${item.kana}の書き順` : `Stroke plan for ${item.kana}`);
        planOrder(item).forEach((plan, index) => {
            const button = element('button', 'academy-vowel-writing-plan');
            button.type = 'button';
            button.dataset.option = choiceToken(index);
            button.dataset.jpdbReaderSurfaceIgnore = '';
            button.setAttribute('aria-pressed', 'false');
            button.textContent = plan.label[options.language];
            button.addEventListener('click', () => {
                selectedPlanId = plan.id;
                choices.querySelectorAll<HTMLButtonElement>('button').forEach(candidate =>
                    candidate.setAttribute('aria-pressed', String(candidate === button)));
                message = '';
                live.textContent = '';
            }, { signal });
            choices.append(button);
        });
        choices.addEventListener('keydown', event => movePlanFocus(event, choices), { signal });
        section.append(
            choices,
            action(COPY.checkPlan, 'primary', signal, async () => {
                if (!selectedPlanId) {
                    message = COPY.chooseFirst[options.language];
                    live.textContent = message;
                    return;
                }
                await submit(item, { mode: 'plan', selectedPlanId });
            }),
        );
        return section;
    };

    const doodleShell = (item: LessonZeroVowelWritingItem, guided: boolean): DoodleRoot => {
        const root = element('div', 'academy-doodle academy-vowel-writing-doodle jpdb-reader-kanjivg') as DoodleRoot;
        root.dataset.guided = String(guided);
        const stage = element('div', 'jpdb-reader-doodle-stage');
        stage.dataset.kanji = item.kana;
        if (!guided) stage.classList.add('trace-hidden');
        const ghost = element('div', 'jpdb-reader-doodle-ghost');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.hidden = !guided;
        ghost.append(strokeSvg(item, true));
        const canvas = element('canvas', 'jpdb-reader-doodle-canvas');
        canvas.tabIndex = 0;
        canvas.setAttribute('aria-label', options.language === 'ja'
            ? `${item.kana}を書くキャンバス`
            : `Canvas for writing ${item.kana}`);
        stage.append(ghost, canvas);
        const tools = element('div', 'jpdb-reader-doodle-tools');
        if (guided) {
            const count = element('span', 'academy-vowel-writing-stroke-count');
            count.textContent = options.language === 'ja' ? `${item.strokeCount}画` : `${item.strokeCount} strokes`;
            count.dataset.jpdbReaderSurfaceIgnore = '';
            tools.append(count);
        }
        const clear = action(COPY.clear, 'quiet', renderLifecycle.signal, () => undefined);
        clear.dataset.doodleClear = '';
        tools.append(clear);
        root.append(stage, tools);
        return root;
    };

    const strokeGuide = (item: LessonZeroVowelWritingItem): HTMLElement => {
        const guide = element('section', 'academy-vowel-writing-guide');
        const visual = element('div', 'academy-vowel-writing-guide-visual');
        visual.append(strokeSvg(item, true));
        const copy = element('div', 'academy-vowel-writing-guide-copy');
        const title = element('h2', 'academy-vowel-writing-guide-kana');
        title.lang = 'ja';
        title.textContent = `${item.kana} · ${options.language === 'ja' ? `${item.strokeCount}画` : `${item.strokeCount} strokes`}`;
        title.dataset.jpdbReaderSurfaceIgnore = '';
        copy.append(
            title,
            localized('p', 'academy-vowel-writing-direction', item.directionCue),
            localized('p', 'academy-vowel-writing-memory', item.memoryCue),
        );
        guide.append(visual, copy);
        return guide;
    };

    const sourceSheet = (): HTMLElement => {
        const figure = element('figure', 'academy-vowel-writing-source-sheet');
        const image = element('img', 'academy-vowel-writing-source-image');
        image.src = options.definition.source.runtimeUrl;
        image.alt = COPY.practiceSheet[options.language];
        image.loading = 'lazy';
        image.decoding = 'async';
        const caption = localized('figcaption', 'academy-vowel-writing-source-caption', COPY.practiceSheet);
        figure.append(image, caption);
        return figure;
    };

    const modeSwitch = (signal: AbortSignal): HTMLElement => {
        const group = element('div', 'academy-vowel-mode');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', options.language === 'ja' ? '文字の練習方法' : 'Writing practice route');
        ([['draw', COPY.drawMode], ['plan', COPY.planMode]] as const).forEach(([mode, copy]) => {
            const button = action(copy, 'mode', signal, async () => { await apply({ kind: 'choose-mode', mode }); });
            button.setAttribute('aria-pressed', String(state.mode === mode));
            group.append(button);
        });
        return group;
    };

    const kanaRail = (): HTMLElement => {
        const rail = element('ol', 'academy-vowel-rail academy-vowel-writing-rail');
        rail.setAttribute('aria-label', options.language === 'ja' ? '五つの母音の練習' : 'Five-vowel writing progress');
        options.definition.items.forEach((item, index) => {
            const cell = element('li', 'academy-vowel-rail-cell');
            cell.dataset.state = index < state.completedItemIds.length
                ? 'learned'
                : index === state.completedItemIds.length ? 'current' : 'waiting';
            cell.textContent = index <= state.completedItemIds.length ? item.kana : '·';
            cell.lang = index <= state.completedItemIds.length ? 'ja' : '';
            rail.append(cell);
        });
        return rail;
    };

    const completedLine = (): HTMLElement => {
        const line = element('div', 'academy-vowel-writing-finished-line');
        options.definition.items.forEach((item, index) => {
            const mark = element('span', 'academy-vowel-writing-finished-mark');
            mark.lang = 'ja';
            mark.textContent = item.kana;
            mark.style.setProperty('--mark-turn', `${[-2, 1, -1, 2, 0][index]}deg`);
            line.append(mark);
        });
        return line;
    };

    const appendScene = (paper: HTMLElement, className: string): void => {
        const scene = element('div', `academy-vowel-scene academy-vowel-writing-scene ${className}`);
        const portrait = element('img', 'academy-vowel-xingyu academy-vowel-writing-rie');
        portrait.src = options.rieSprite;
        portrait.alt = '';
        portrait.setAttribute('aria-hidden', 'true');
        portrait.decoding = 'async';
        scene.append(portrait, paper);
        body.append(scene);
    };

    const livingPaper = (className: string): HTMLElement => {
        const paper = element('div', `academy-vowel-paper academy-vowel-writing-paper ${className}`);
        const clip = element('span', 'academy-vowel-paperclip');
        clip.setAttribute('aria-hidden', 'true');
        paper.append(clip);
        return paper;
    };

    const dialogue = (copy: Localized): HTMLElement => {
        const node = localized('p', 'academy-vowel-dialogue academy-vowel-writing-dialogue', copy);
        node.dataset.speaker = 'rie';
        return node;
    };

    const progressLabel = (): HTMLElement => {
        const label = element('p', 'academy-vowel-progress');
        label.textContent = `${state.completedItemIds.length}/5`;
        label.dataset.jpdbReaderSurfaceIgnore = '';
        return label;
    };

    const planOrder = (item: LessonZeroVowelWritingItem) => {
        const index = options.definition.items.findIndex(candidate => candidate.id === item.id);
        const shift = [1, 2, 0, 1, 2][Math.max(0, index)] ?? 0;
        return [...item.plans.slice(shift), ...item.plans.slice(0, shift)];
    };

    const currentItem = (): LessonZeroVowelWritingItem | undefined =>
        options.definition.items[state.completedItemIds.length];

    const submit = async (
        item: LessonZeroVowelWritingItem,
        response: Parameters<typeof evaluateLessonZeroVowelWriting>[2],
    ): Promise<void> => {
        const evaluation = evaluateLessonZeroVowelWriting(options.definition, item, response);
        await apply({ kind: 'record-result', evaluation });
    };

    const apply = async (
        actionValue: Parameters<typeof transitionLessonZeroVowelWritingSession>[2],
    ): Promise<LessonZeroVowelWritingTransition | undefined> => {
        if (busy || disposed) return undefined;
        const before = state;
        const transition = transitionLessonZeroVowelWritingSession(options.definition, state, actionValue, Date.now());
        try {
            busy = true;
            screen.setAttribute('aria-busy', 'true');
            await options.onTransition(before, transition);
            state = transition.state;
            message = '';
            render();
            return transition;
        } catch (error) {
            console.error('Lesson Zero vowel-writing transition failed.', error);
            message = COPY.saveError[options.language];
            live.textContent = message;
            return undefined;
        } finally {
            busy = false;
            screen.removeAttribute('aria-busy');
        }
    };

    const play = async (item: LessonZeroVowelWritingItem, button: HTMLButtonElement): Promise<void> => {
        if (busy || disposed) return;
        playback?.dispose();
        playback = null;
        const label = button.textContent ?? '';
        button.disabled = true;
        button.textContent = COPY.soundPlaying[options.language];
        try {
            const active = await options.pronunciation.play(item.kana, item.kana, lifecycle.signal);
            if (disposed) active.dispose();
            else playback = active;
        } catch {
            message = COPY.audioError[options.language];
            live.textContent = message;
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
            const transition = transitionLessonZeroVowelWritingSession(
                options.definition,
                state,
                { kind: 'pause' },
                Date.now(),
            );
            await options.onTransition(before, transition);
            state = transition.state;
        }
        await options.onBack();
    };

    const restart = async (): Promise<void> => {
        if (busy) return;
        const fresh = restartLessonZeroVowelWritingSession(options.definition);
        await options.onRestart(fresh);
        state = fresh;
        message = '';
        render();
    };

    const action = (
        copy: Localized,
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

    const localized = <K extends keyof HTMLElementTagNameMap>(
        tag: K,
        className: string,
        copy: Localized,
    ): HTMLElementTagNameMap[K] => {
        const node = element(tag, className);
        node.lang = options.language;
        node.textContent = copy[options.language];
        if (options.language === 'ja') {
            node.dataset.yomuRuntimeSurface = 'lesson-zero-vowel-writing-copy';
            node.dataset.yomuFuriganaMode = 'all';
        } else node.dataset.jpdbReaderSurfaceIgnore = '';
        return node;
    };

    if (state.status === 'paused') {
        state = transitionLessonZeroVowelWritingSession(
            options.definition,
            state,
            { kind: 'resume' },
            Date.now(),
        ).state;
    }
    render();
    return {
        element: screen,
        dispose() {
            if (disposed) return;
            disposed = true;
            lifecycle.abort();
            renderLifecycle.abort();
            activeDoodle?.__yomuKanjiDoodleCleanup?.();
            activeDoodle = null;
            playback?.dispose();
            playback = null;
        },
    };
}

function strokeSvg(item: LessonZeroVowelWritingItem, numbered: boolean): SVGSVGElement {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.classList.add('academy-vowel-writing-stroke-svg');
    item.strokeShapes.forEach((stroke, index) => {
        const path = document.createElementNS(namespace, 'polyline');
        path.setAttribute('points', stroke.map(point => `${point.x * 100},${point.y * 100}`).join(' '));
        path.setAttribute('pathLength', '1');
        path.classList.add('academy-vowel-writing-stroke-path');
        path.style.setProperty('--stroke-index', String(index));
        svg.append(path);
        if (!numbered || !stroke[0]) return;
        const circle = document.createElementNS(namespace, 'circle');
        circle.setAttribute('cx', String(stroke[0].x * 100));
        circle.setAttribute('cy', String(stroke[0].y * 100));
        circle.setAttribute('r', '6');
        circle.classList.add('academy-vowel-writing-stroke-number-bg');
        const label = document.createElementNS(namespace, 'text');
        label.setAttribute('x', String(stroke[0].x * 100));
        label.setAttribute('y', String(stroke[0].y * 100 + 2.7));
        label.classList.add('academy-vowel-writing-stroke-number');
        label.textContent = String(index + 1);
        svg.append(circle, label);
    });
    return svg;
}

function movePlanFocus(event: KeyboardEvent, root: HTMLElement): void {
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
