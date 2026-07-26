import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import {
    startLessonZeroSentenceFrameSession,
    transitionLessonZeroSentenceFrameSession,
    type LessonZeroSentenceFrameDefinition,
    type LessonZeroSentenceFrameSessionAction,
    type LessonZeroSentenceFrameSessionDefinition,
    type LessonZeroSentenceFrameSessionState,
    type LessonZeroSentenceFrameSessionTransition,
} from '../domain/lesson-zero-sentence-frame-session';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import { playLearningVoiceBinding } from '../audio/learning-voice';
import { academyBackgroundPicture, backButton, element } from './dom';

type LocalizedCopy = Readonly<{ en: string; ja: string }>;

export interface LessonZeroSentenceFrameScreenOptions {
    readonly language: AcademyLanguage;
    readonly definition: LessonZeroSentenceFrameSessionDefinition;
    readonly initialState: LessonZeroSentenceFrameSessionState;
    readonly pronunciation: PronunciationService;
    readonly onTransition: (
        before: LessonZeroSentenceFrameSessionState,
        transition: LessonZeroSentenceFrameSessionTransition,
    ) => void | Promise<void>;
    readonly onRestart: (state: LessonZeroSentenceFrameSessionState) => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
    readonly onComplete: () => void | Promise<void>;
}

export interface LessonZeroSentenceFrameScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

const COPY = {
    eyebrow: { en: 'First sentences', ja: 'はじめての文' },
    title: { en: 'Your first five sentences', ja: '最初の五つの文' },
    readyProgress: { en: 'Five sentences', ja: '五つの文' },
    welcome: {
        en: 'I’ve put five sentence starters on the desk. We’ll use them to introduce you, fix a mix-up, ask Sophie a question, and talk about this class.',
        ja: '机に、五つの文の始まりを置きました。自己紹介をして、まちがいを直し、ソフィーさんに質問して、このクラスについて話します。',
    },
    welcomeReason: {
        en: 'I’ll show you one pattern at a time. After all five, I’ll cover the patterns and you’ll try them once more.',
        ja: '文の形を一つずつ見せます。五つ作ったら、形をかくして、もう一度使います。',
    },
    begin: { en: 'Start with “I am…”', ja: '「わたしは…」から始める' },
    pattern: { en: 'Sentence pattern', ja: '文の形' },
    example: { en: 'Example', ja: '例' },
    hearExample: { en: 'Hear the example', ja: '例を聞く' },
    playing: { en: 'Playing…', ja: '再生中…' },
    tryTurn: { en: 'Try this turn', ja: 'この文を作る' },
    yourSentence: { en: 'Your sentence', ja: 'あなたの文' },
    wordDesk: { en: 'Words on the desk', ja: '机のことば' },
    empty: { en: 'Choose the first word.', ja: '最初のことばを選んでください。' },
    clear: { en: 'Put every word back', ja: 'ことばを全部戻す' },
    check: { en: 'Check the sentence', ja: '文を確かめる' },
    repairTitle: { en: 'A word is out of place', ja: 'ことばの場所がちがいます' },
    repairBody: {
        en: 'Look at the pattern again, then put the words in that order.',
        ja: 'もう一度、文の形を見て、その順番にことばを並べましょう。',
    },
    transferRepairBody: {
        en: 'Listen to the sentence in your head. If you need it, uncover Rie’s model, then rebuild it.',
        ja: '頭の中で文を聞いてみましょう。必要なら、りえ先生のお手本を見て、もう一度作りましょう。',
    },
    showModel: { en: 'Show the answer', ja: '答えを見る' },
    modelLabel: { en: 'Model sentence', ja: 'お手本の文' },
    retry: { en: 'Rebuild the sentence', ja: '文をもう一度作る' },
    next: { en: 'Use the next shape', ja: '次の形を使う' },
    beginTransfer: { en: 'Try all five without the patterns', ja: '文の形を見ずに五つ使う' },
    transferEyebrow: { en: 'From memory', ja: '思い出して' },
    transferNote: {
        en: 'The pattern is covered now. Rebuild the sentence from the conversation.',
        ja: '文の形をかくしました。会話を思い出して、文を作ってください。',
    },
    transferPass: { en: 'Good. One more is ready.', ja: 'いいですね。次もいきましょう。' },
    nextTransfer: { en: 'Recall the next sentence', ja: '次の文を思い出す' },
    completeTitle: { en: 'You joined the conversation', ja: '会話に入れました' },
    completeBody: {
        en: 'You introduced yourself, fixed a mix-up, asked Sophie a question, and described the class. Those five lines are now in review.',
        ja: '自己紹介をして、まちがいを直し、ソフィーさんに質問して、クラスについて話しました。五つの文は復習に入りました。',
    },
    memories: { en: 'Five lines are now in review', ja: '五つの文が復習に入りました' },
    continue: { en: 'Continue your day', ja: '今日の続きを始める' },
    again: { en: 'Build the five lines again', ja: '五つの文をもう一度作る' },
    saveError: { en: 'That turn did not save. Please try once more.', ja: '保存できませんでした。もう一度お試しください。' },
    audioError: { en: 'That line did not play. Try once more.', ja: '音声を再生できませんでした。もう一度お試しください。' },
} as const;

export function createLessonZeroSentenceFrameScreen(
    options: LessonZeroSentenceFrameScreenOptions,
): LessonZeroSentenceFrameScreen {
    const lifecycle = new AbortController();
    let renderLifecycle = new AbortController();
    let state = options.initialState;
    let playback: Disposable | null = null;
    let busy = false;
    let disposed = false;

    const screen = element('section', 'academy-screen academy-sentence-frame-screen');
    screen.dataset.academyScreen = 'lesson-zero-sentence-frames';
    screen.dataset.activityId = options.definition.activityId;
    screen.append(academyBackgroundPicture('classroom'));

    const shell = element('div', 'academy-sentence-frame-shell');
    const header = element('header', 'academy-sentence-frame-header');
    const back = backButton(options.language);
    back.classList.add('academy-sentence-frame-back');
    back.textContent = '←';
    back.title = back.getAttribute('aria-label') ?? '';
    back.addEventListener('click', () => void pauseAndLeave(), { signal: lifecycle.signal });
    const heading = element('div', 'academy-sentence-frame-heading');
    heading.append(
        localized('p', 'academy-sentence-frame-eyebrow', COPY.eyebrow, options.language),
        localized('h1', 'academy-sentence-frame-title', COPY.title, options.language),
    );
    const progress = element('p', 'academy-sentence-frame-progress');
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-live', 'polite');
    header.append(back, heading, progress);
    const body = element('div', 'academy-sentence-frame-body');
    const live = element('p', 'academy-sentence-frame-live');
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
        screen.dataset.sessionPhase = isTransferStage(state.stage) ? 'transfer' : 'practice';
        screen.dataset.frameId = currentFrame().id;
        const completed = isTransferStage(state.stage)
            ? options.definition.frames.filter(frame => state.attempts.some(attempt =>
                attempt.frameId === frame.id
                && attempt.phase === 'transfer'
                && attempt.outcome === 'pass')).length
            : state.passedFrameIds.length;
        screen.dataset.frameProgress = `${completed}/${options.definition.frames.length}`;
        progress.textContent = progressText();
        if (state.status === 'ready') renderWelcome(signal);
        else if (state.status === 'complete') renderComplete(signal);
        else if (state.stage === 'teach') renderTeach(signal);
        else if (state.stage === 'build' || state.stage === 'transfer-build') {
            renderBuild(signal, state.stage === 'transfer-build');
        } else {
            renderResult(signal, state.stage === 'transfer-result');
        }
    };

    const renderWelcome = (signal: AbortSignal): void => {
        const scene = sceneWithPortrait('rie');
        const paper = livingPaper();
        paper.append(
            speakerName('rie', options.language),
            localized('p', 'academy-sentence-frame-dialogue', COPY.welcome, options.language),
            localized('p', 'academy-sentence-frame-note', COPY.welcomeReason, options.language),
            actionButton(COPY.begin, 'primary', signal, () => apply({ kind: 'start' }), options.language),
        );
        scene.append(portrait('rie'), paper);
        body.append(scene);
    };

    const renderTeach = (signal: AbortSignal): void => {
        const frame = currentFrame();
        const scene = sceneWithPortrait('rie');
        const paper = livingPaper();
        paper.append(
            speakerName('rie', options.language),
            localized('h2', 'academy-sentence-frame-section-title', frame.title, options.language),
            localized('p', 'academy-sentence-frame-dialogue', frame.teaching, options.language),
            patternRail(frame, options.language),
            exampleSheet(frame, signal),
            actionButton(COPY.tryTurn, 'primary', signal, () => apply({ kind: 'open-build' }), options.language),
        );
        scene.append(portrait('rie'), paper);
        body.append(scene);
    };

    const renderBuild = (signal: AbortSignal, transfer: boolean): void => {
        const frame = currentFrame();
        const scene = sceneWithPortrait('rie');
        const paper = livingPaper();
        paper.append(
            speakerName('rie', options.language),
            ...(transfer
                ? [
                    localized('p', 'academy-sentence-frame-small-title', COPY.transferEyebrow, options.language),
                    localized('h2', 'academy-sentence-frame-section-title', frame.transferPrompt, options.language),
                    localized('p', 'academy-sentence-frame-note', COPY.transferNote, options.language),
                ]
                : [
                    localized('h2', 'academy-sentence-frame-section-title', frame.prompt, options.language),
                    patternRail(frame, options.language),
                ]),
        );
        const revealed = transfer
            ? state.revealedTransferModelFrameIds ?? []
            : state.revealedModelFrameIds;
        if (revealed.includes(frame.id)) paper.append(modelSheet(frame, signal));
        const workspace = element('div', 'academy-sentence-frame-workspace');
        const selectedSection = element('section', 'academy-sentence-frame-selected');
        selectedSection.append(localized('h3', 'academy-sentence-frame-small-title', COPY.yourSentence, options.language));
        const selectedRail = element('div', 'academy-sentence-frame-selected-rail');
        selectedRail.setAttribute('role', 'group');
        selectedRail.setAttribute('aria-label', COPY.yourSentence[options.language]);
        if (state.selectedTokenIds.length === 0) {
            selectedRail.append(localized('p', 'academy-sentence-frame-empty', COPY.empty, options.language));
        } else {
            state.selectedTokenIds.forEach(tokenId => {
                const token = tokenButton(frame, tokenId, true);
                token.addEventListener('click', () => void apply({ kind: 'remove-token', tokenId }), { signal });
                selectedRail.append(token);
            });
        }
        selectedSection.append(selectedRail);

        const bankSection = element('section', 'academy-sentence-frame-bank-section');
        bankSection.append(localized('h3', 'academy-sentence-frame-small-title', COPY.wordDesk, options.language));
        const bank = element('div', 'academy-sentence-frame-bank');
        bank.setAttribute('role', 'group');
        bank.setAttribute('aria-label', COPY.wordDesk[options.language]);
        bankOrder(frame, transfer).forEach(tokenId => {
            if (state.selectedTokenIds.includes(tokenId)) return;
            const token = tokenButton(frame, tokenId, false);
            token.addEventListener('click', () => void apply({ kind: 'select-token', tokenId }), { signal });
            bank.append(token);
        });
        bankSection.append(bank);
        workspace.append(selectedSection, bankSection);
        paper.append(workspace);

        const actions = element('div', 'academy-sentence-frame-actions');
        const clear = actionButton(COPY.clear, 'quiet', signal, () => apply({ kind: 'clear-tokens' }), options.language);
        clear.disabled = state.selectedTokenIds.length === 0;
        const check = actionButton(COPY.check, 'primary', signal, () => apply({ kind: 'check' }), options.language);
        check.disabled = state.selectedTokenIds.length !== frame.target.tokens.length;
        actions.append(clear, check);
        paper.append(actions);
        scene.append(portrait('rie'), paper);
        body.append(scene);
    };

    const renderResult = (signal: AbortSignal, transfer: boolean): void => {
        const frame = currentFrame();
        const attempt = lastAttempt(frame, transfer ? 'transfer' : 'practice');
        if (!attempt) throw new TypeError(`Sentence-frame result ${frame.id} has no attempt.`);
        const passed = attempt.outcome === 'pass';
        const speaker = passed && !transfer ? frame.response.speakerId : 'rie';
        const scene = sceneWithPortrait(speaker);
        const paper = livingPaper();
        paper.dataset.outcome = attempt.outcome;
        paper.append(
            speakerName(speaker, options.language),
            localized('h2', 'academy-sentence-frame-section-title', passed ? frame.title : COPY.repairTitle, options.language),
            builtLine(frame, attempt.order, attempt.outcome),
        );
        if (passed) {
            if (transfer) {
                paper.append(
                    localized('p', 'academy-sentence-frame-dialogue', COPY.transferPass, options.language),
                    actionButton(
                        COPY.nextTransfer,
                        'primary',
                        signal,
                        () => apply({ kind: 'next-transfer' }),
                        options.language,
                    ),
                );
            } else {
                const finalPractice = state.cursor === options.definition.frames.length - 1;
                paper.append(
                    localized('p', 'academy-sentence-frame-meaning', frame.target.meaning, options.language),
                    responseLine(frame, signal),
                    actionButton(
                        finalPractice ? COPY.beginTransfer : COPY.next,
                        'primary',
                        signal,
                        () => apply({ kind: finalPractice ? 'begin-transfer' : 'next-frame' }),
                        options.language,
                    ),
                );
            }
        } else {
            if (!transfer) paper.append(patternRail(frame, options.language));
            paper.append(
                localized(
                    'p',
                    'academy-sentence-frame-dialogue',
                    transfer ? COPY.transferRepairBody : COPY.repairBody,
                    options.language,
                ),
            );
            const revealed = transfer
                ? state.revealedTransferModelFrameIds ?? []
                : state.revealedModelFrameIds;
            if (revealed.includes(frame.id)) paper.append(modelSheet(frame, signal));
            const actions = element('div', 'academy-sentence-frame-actions');
            if (!revealed.includes(frame.id)) {
                actions.append(actionButton(COPY.showModel, 'secondary', signal, () => apply({ kind: 'reveal-model' }), options.language));
            }
            actions.append(actionButton(COPY.retry, 'primary', signal, () => apply({ kind: 'retry' }), options.language));
            paper.append(actions);
        }
        scene.append(portrait(speaker), paper);
        body.append(scene);
    };

    const renderComplete = (signal: AbortSignal): void => {
        const finalFrame = options.definition.frames.at(-1)!;
        const scene = sceneWithPortrait('sophie');
        const paper = livingPaper();
        paper.append(
            speakerName('sophie', options.language),
            localized('h2', 'academy-sentence-frame-section-title', COPY.completeTitle, options.language),
            responseLine(finalFrame, signal),
            localized('p', 'academy-sentence-frame-dialogue', COPY.completeBody, options.language),
        );
        const lines = element('ol', 'academy-sentence-frame-finished-lines');
        options.definition.frames.forEach(frame => {
            const item = element('li', 'academy-sentence-frame-finished-line');
            item.lang = 'ja';
            item.dataset.yomuRuntimeSurface = 'lesson-zero-sentence-frame-review';
            item.dataset.yomuFuriganaMode = 'all';
            item.textContent = frame.target.japanese;
            lines.append(item);
        });
        paper.append(lines, localized('p', 'academy-sentence-frame-memory-note', COPY.memories, options.language));
        const actions = element('div', 'academy-sentence-frame-actions');
        actions.append(
            actionButton(COPY.again, 'secondary', signal, restart, options.language),
            actionButton(COPY.continue, 'primary', signal, options.onComplete, options.language),
        );
        paper.append(actions);
        scene.append(portrait('sophie'), paper);
        body.append(scene);
    };

    const exampleSheet = (frame: LessonZeroSentenceFrameDefinition, signal: AbortSignal): HTMLElement => {
        const sheet = element('section', 'academy-sentence-frame-example');
        sheet.append(
            localized('h3', 'academy-sentence-frame-small-title', COPY.example, options.language),
            japaneseLine(frame.nearbyExample.japanese, 'academy-sentence-frame-example-japanese'),
            localized('p', 'academy-sentence-frame-example-meaning', frame.nearbyExample.meaning, options.language),
            audioButton(
                COPY.hearExample,
                `lesson-zero:sentence-frame:${frame.id}:example`,
                frame.nearbyExample.japanese,
                signal,
            ),
        );
        return sheet;
    };

    const modelSheet = (frame: LessonZeroSentenceFrameDefinition, signal: AbortSignal): HTMLElement => {
        const sheet = element('section', 'academy-sentence-frame-model');
        sheet.dataset.repairModel = frame.id;
        sheet.append(
            localized('h3', 'academy-sentence-frame-small-title', COPY.modelLabel, options.language),
            japaneseLine(frame.target.japanese, 'academy-sentence-frame-model-japanese'),
            localized('p', 'academy-sentence-frame-model-meaning', frame.target.meaning, options.language),
            audioButton(
                { en: 'Hear Rie’s sentence', ja: 'りえ先生の文を聞く' },
                `lesson-zero:sentence-frame:${frame.id}:target`,
                frame.target.japanese,
                signal,
            ),
        );
        return sheet;
    };

    const responseLine = (frame: LessonZeroSentenceFrameDefinition, signal: AbortSignal): HTMLElement => {
        const response = element('section', 'academy-sentence-frame-response');
        response.append(
            speakerName(frame.response.speakerId, options.language, frame.response.speakerName),
            japaneseLine(frame.response.japanese, 'academy-sentence-frame-response-japanese'),
            localized('p', 'academy-sentence-frame-response-meaning', frame.response.meaning, options.language),
            audioButton(
                { en: `Hear ${frame.response.speakerName.en}`, ja: `${frame.response.speakerName.ja}を聞く` },
                `lesson-zero:sentence-frame:${frame.id}:response`,
                frame.response.japanese,
                signal,
            ),
        );
        return response;
    };

    const audioButton = (
        copy: LocalizedCopy,
        bindingId: string,
        japanese: string,
        signal: AbortSignal,
    ): HTMLButtonElement => {
        const button = actionButton(copy, 'listen', signal, async () => {
            if (busy || disposed) return;
            playback?.dispose();
            playback = null;
            button.disabled = true;
            const label = button.textContent;
            button.textContent = COPY.playing[options.language];
            try {
                const active = await playLearningVoiceBinding(
                    options.pronunciation,
                    bindingId,
                    japanese,
                    signal,
                );
                if (disposed) active?.dispose();
                else playback = active;
            } catch {
                live.textContent = COPY.audioError[options.language];
            } finally {
                if (!disposed) {
                    button.disabled = false;
                    button.textContent = label;
                }
            }
        }, options.language);
        button.dataset.audioTerm = japanese;
        return button;
    };

    const apply = async (action: LessonZeroSentenceFrameSessionAction): Promise<void> => {
        if (busy) return;
        const before = state;
        const transition = transitionLessonZeroSentenceFrameSession(
            options.definition,
            state,
            action,
            Date.now(),
        );
        try {
            busy = true;
            screen.setAttribute('aria-busy', 'true');
            await options.onTransition(before, transition);
            state = transition.state;
            render();
        } catch {
            live.textContent = COPY.saveError[options.language];
        } finally {
            busy = false;
            screen.removeAttribute('aria-busy');
        }
    };

    const pauseAndLeave = async (): Promise<void> => {
        if (busy) return;
        if (state.status === 'active') {
            const before = state;
            const transition = transitionLessonZeroSentenceFrameSession(
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
        const fresh = startLessonZeroSentenceFrameSession(options.definition);
        await options.onRestart(fresh);
        state = fresh;
        render();
    };

    const currentFrame = (): LessonZeroSentenceFrameDefinition => options.definition.frames[state.cursor]!;
    const lastAttempt = (
        frame: LessonZeroSentenceFrameDefinition,
        phase: 'practice' | 'transfer',
    ) => [...state.attempts].reverse().find(attempt =>
        attempt.frameId === frame.id && (attempt.phase ?? 'practice') === phase);
    const progressText = (): string => {
        if (state.status === 'ready') return COPY.readyProgress[options.language];
        if (state.status === 'complete') return options.language === 'ja' ? '5 / 5 完了' : '5 / 5 complete';
        if (isTransferStage(state.stage)) {
            return options.language === 'ja'
                ? `思い出す ${state.cursor + 1} / ${options.definition.frames.length}`
                : `Recall ${state.cursor + 1} / ${options.definition.frames.length}`;
        }
        return options.language === 'ja'
            ? `${state.cursor + 1} / ${options.definition.frames.length} · ${currentFrame().title.ja}`
            : `${state.cursor + 1} / ${options.definition.frames.length} · ${currentFrame().title.en}`;
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

function sceneWithPortrait(speaker: 'rie' | 'sophie'): HTMLElement {
    const scene = element('section', 'academy-sentence-frame-scene');
    scene.dataset.speaker = speaker;
    return scene;
}

function livingPaper(): HTMLElement {
    const paper = element('div', 'academy-sentence-frame-paper');
    paper.append(element('span', 'academy-sentence-frame-paperclip'));
    return paper;
}

function portrait(speaker: 'rie' | 'sophie'): HTMLImageElement {
    const image = element('img', 'academy-sentence-frame-portrait');
    image.src = speaker === 'sophie'
        ? ACADEMY_ASSETS.characters.approved.sophie
        : ACADEMY_ASSETS.rie;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    return image;
}

function speakerName(
    speaker: 'rie' | 'sophie',
    language: AcademyLanguage,
    provided?: LocalizedCopy,
): HTMLElement {
    const node = element('strong', 'academy-sentence-frame-speaker');
    const fallback = speaker === 'sophie'
        ? { en: 'Sophie', ja: 'ソフィー' }
        : { en: 'Rie-sensei', ja: 'りえ先生' };
    const copy = provided ?? fallback;
    node.textContent = copy[language];
    node.dataset.speakerId = speaker;
    return node;
}

function patternRail(frame: LessonZeroSentenceFrameDefinition, language: AcademyLanguage): HTMLElement {
    const root = element('section', 'academy-sentence-frame-pattern');
    const label = element('span', 'academy-sentence-frame-pattern-label');
    label.textContent = COPY.pattern[language];
    const value = japaneseLine(frame.pattern, 'academy-sentence-frame-pattern-value');
    root.append(label, value);
    return root;
}

function builtLine(
    frame: LessonZeroSentenceFrameDefinition,
    order: readonly string[],
    outcome: 'pass' | 'lapse',
): HTMLElement {
    const line = japaneseLine(
        order.map(id => frame.target.tokens.find(token => token.id === id)?.japanese ?? '').join(''),
        'academy-sentence-frame-built-line',
    );
    line.dataset.outcome = outcome;
    return line;
}

function tokenButton(
    frame: LessonZeroSentenceFrameDefinition,
    tokenId: string,
    selected: boolean,
): HTMLButtonElement {
    const token = frame.target.tokens.find(candidate => candidate.id === tokenId);
    if (!token) throw new TypeError(`Unknown sentence-frame token ${tokenId}.`);
    const button = element('button', 'academy-sentence-frame-token');
    button.type = 'button';
    button.lang = 'ja';
    button.dataset.tokenId = tokenId;
    button.dataset.selected = String(selected);
    button.dataset.yomuRuntimeSurface = 'lesson-zero-sentence-frame-token';
    button.dataset.yomuFuriganaMode = 'all';
    button.textContent = token.japanese;
    button.setAttribute('aria-label', `${selected ? 'Return' : 'Add'} ${token.japanese}`);
    return button;
}

function bankOrder(
    frame: LessonZeroSentenceFrameDefinition,
    transfer: boolean,
): readonly string[] {
    if (!transfer) return frame.target.bankOrder;
    const offset = 2;
    return [
        ...frame.target.bankOrder.slice(offset),
        ...frame.target.bankOrder.slice(0, offset),
    ];
}

function isTransferStage(stage: LessonZeroSentenceFrameSessionState['stage']): boolean {
    return stage === 'transfer-build' || stage === 'transfer-result';
}

function japaneseLine(value: string, className: string): HTMLElement {
    const node = element('p', className);
    node.lang = 'ja';
    node.dataset.yomuRuntimeSurface = 'lesson-zero-sentence-frame-japanese';
    node.dataset.yomuFuriganaMode = 'all';
    node.textContent = value;
    return node;
}

function actionButton(
    copy: LocalizedCopy,
    variant: 'primary' | 'secondary' | 'quiet' | 'listen',
    signal: AbortSignal,
    action: () => void | Promise<void>,
    language: AcademyLanguage,
): HTMLButtonElement {
    const button = element('button', `academy-button academy-sentence-frame-action academy-sentence-frame-action-${variant}`);
    button.type = 'button';
    button.textContent = copy[language];
    button.setAttribute('aria-label', copy[language]);
    button.addEventListener('click', () => void action(), { signal });
    return button;
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
        node.dataset.yomuRuntimeSurface = 'lesson-zero-sentence-frame-copy';
        node.dataset.yomuFuriganaMode = 'all';
    } else {
        node.dataset.jpdbReaderSurfaceIgnore = '';
    }
    return node;
}
