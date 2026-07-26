import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import { playLearningVoiceBinding } from '../audio/learning-voice';
import {
    startLessonZeroRepeatRequestSession,
    transitionLessonZeroRepeatRequestSession,
    type LessonZeroRepeatRequestChunk,
    type LessonZeroRepeatRequestChunkId,
    type LessonZeroRepeatRequestDefinition,
    type LessonZeroRepeatRequestSessionAction,
    type LessonZeroRepeatRequestSessionState,
    type LessonZeroRepeatRequestSessionTransition,
} from '../domain/lesson-zero-repeat-request-session';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import { academyBackgroundPicture, backButton, choiceToken, element } from './dom';

export interface LessonZeroRepeatRequestScreenOptions {
    readonly language: AcademyLanguage;
    readonly definition: LessonZeroRepeatRequestDefinition;
    readonly initialState: LessonZeroRepeatRequestSessionState;
    readonly pronunciation: PronunciationService;
    readonly onTransition: (
        before: LessonZeroRepeatRequestSessionState,
        transition: LessonZeroRepeatRequestSessionTransition,
    ) => void | Promise<void>;
    readonly onRestart: (state: LessonZeroRepeatRequestSessionState) => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
    readonly onComplete: () => void | Promise<void>;
}

export interface LessonZeroRepeatRequestScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

const COPY = {
    eyebrow: { en: 'When you miss something', ja: '聞き逃したとき' },
    title: { en: 'Ask Rie to say it again', ja: 'りえ先生にもう一度頼む' },
    progressMeet: { en: 'Meet it', ja: '聞く' },
    progressPractice: { en: 'Build it', ja: '組み立てる' },
    progressTransfer: { en: 'Use it', ja: '使う' },
    rieMeet: {
        en: 'If I go too fast, ask me to say it again. Listen for two parts.',
        ja: '速すぎたら、もう一度言うように頼んでください。二つの部分を聞きましょう。',
    },
    noKana: {
        en: 'You do not need to read kana yet. Follow the sound and meaning.',
        ja: 'まだかなを読めなくても大丈夫です。音と意味をたどりましょう。',
    },
    replay: { en: 'Hear Rie', ja: 'りえ先生を聞く' },
    playing: { en: 'Rie is speaking…', ja: 'りえ先生が話しています…' },
    begin: { en: 'Build the request', ja: '頼み方を組み立てる' },
    practicePrompt: {
        en: 'Tap the two parts in the order you heard them.',
        ja: '聞こえた順番に、二つの部分をタップしましょう。',
    },
    transferPrompt: {
        en: 'Ask the cashier to say the price again.',
        ja: '店員さんに、値段をもう一度言うように頼みましょう。',
    },
    aakashLine: {
        en: 'I missed the price too. Can you ask them to say it again?',
        ja: '値段を聞き逃した。もう一度言ってもらえる？',
    },
    slots: { en: 'Your request', ja: 'あなたの頼み方' },
    choices: { en: 'Sound pieces', ja: '音のピース' },
    emptySlot: { en: 'Tap a sound', ja: '音をタップ' },
    select: { en: 'Tap to select', ja: 'タップして選ぶ' },
    remove: { en: 'Tap again to remove', ja: 'もう一度タップで外す' },
    submitPractice: { en: 'Ask Rie', ja: 'りえ先生に頼む' },
    submitTransfer: { en: 'Ask at the counter', ja: 'カウンターで頼む' },
    repairTitle: { en: 'One small fix', ja: '一か所だけ直す' },
    repairPrefix: {
        en: 'Keep what worked. This is the sound to repair:',
        ja: 'できたところはそのまま。直す音はこれです。',
    },
    retry: { en: 'Rebuild it', ja: 'もう一度組み立てる' },
    practicePass: { en: 'Good. You asked me to repeat.', ja: 'いいですね。もう一度頼めました。' },
    practicePassBody: {
        en: 'Try it once more at the cafe, without my example.',
        ja: '次は見本なしで、カフェでもう一度使いましょう。',
    },
    beginTransfer: { en: 'Try it at the cafe', ja: 'カフェで使ってみる' },
    complete: { en: 'You did it without the example.', ja: '見本なしで言えました。' },
    completeBody: {
        en: 'You asked again instead of guessing. We’ll bring this phrase back in a short review.',
        ja: '分かったふりをせず、もう一度頼めました。この一言は短い復習でもう一度出てきます。',
    },
    continue: { en: 'Continue your day', ja: '今日の続きを見る' },
    again: { en: 'Practise it again', ja: 'もう一度練習する' },
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

export function createLessonZeroRepeatRequestScreen(
    options: LessonZeroRepeatRequestScreenOptions,
): LessonZeroRepeatRequestScreen {
    const lifecycle = new AbortController();
    let renderLifecycle = new AbortController();
    let state = startLessonZeroRepeatRequestSession(options.definition, options.initialState);
    let playback: Disposable | null = null;
    let busy = false;
    let disposed = false;
    let actionQueue: Promise<void> = Promise.resolve();

    const screen = element('section', 'academy-screen academy-repeat-request-screen');
    screen.dataset.academyScreen = 'lesson-zero-repeat-request';
    screen.dataset.academyPresentation = 'focus';
    screen.dataset.activityId = options.definition.activityId;
    screen.append(academyBackgroundPicture('classroom'));

    const shell = element('div', 'academy-repeat-request-shell');
    const header = element('header', 'academy-repeat-request-header');
    const back = backButton(options.language);
    back.classList.add('academy-repeat-request-back');
    back.textContent = '←';
    back.title = back.getAttribute('aria-label') ?? '';
    back.addEventListener('click', () => void pauseAndLeave(), { signal: lifecycle.signal });
    const heading = element('div', 'academy-repeat-request-heading');
    const eyebrow = localized('p', 'academy-repeat-request-eyebrow', COPY.eyebrow, options.language);
    const title = localized('h1', 'academy-repeat-request-title', COPY.title, options.language);
    heading.append(eyebrow, title);
    const progress = element('p', 'academy-repeat-request-progress');
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-live', 'polite');
    header.append(back, heading, progress);

    const body = element('div', 'academy-repeat-request-body');
    const live = element('p', 'academy-repeat-request-live');
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
        if (state.status === 'ready' || state.stage === 'meet') {
            renderMeet(signal);
        } else if (state.stage === 'practice' || state.stage === 'transfer') {
            renderBuild(state.stage, signal);
        } else if (state.stage === 'practice-repair' || state.stage === 'transfer-repair') {
            renderRepair(signal);
        } else if (state.stage === 'transfer-ready') {
            renderTransferReady(signal);
        } else {
            renderComplete(signal);
        }
    };

    const renderMeet = (signal: AbortSignal): void => {
        const scene = element('section', 'academy-repeat-request-meet');
        const portrait = characterPortrait(ACADEMY_ASSETS.rie, 'academy-repeat-request-rie');
        const dialogue = paper('academy-repeat-request-meet-paper');
        const speaker = element('strong', 'academy-repeat-request-speaker');
        speaker.textContent = options.language === 'ja' ? 'りえ先生' : 'Rie-sensei';
        const line = localized('p', 'academy-repeat-request-dialogue', COPY.rieMeet, options.language);
        const target = japanese('p', 'academy-repeat-request-target', options.definition.target.japanese);
        const meaning = localized(
            'p',
            'academy-repeat-request-target-meaning',
            options.definition.target.meaning,
            options.language,
        );
        const replay = replayButton(signal);
        const chunkStrip = element('div', 'academy-repeat-request-meet-chunks');
        for (const chunkId of options.definition.practiceChunkIds) {
            chunkStrip.append(chunkLesson(chunkFor(chunkId)));
        }
        const note = localized('p', 'academy-repeat-request-note', COPY.noKana, options.language);
        const begin = actionButton(COPY.begin[options.language], 'academy-button-primary');
        begin.dataset.repeatAction = 'begin';
        begin.addEventListener('click', () => void beginPractice(), { signal });
        dialogue.append(speaker, line, target, meaning, replay, chunkStrip, note, begin);
        scene.append(portrait, dialogue);
        body.append(scene, leaveControl(signal));
    };

    const renderBuild = (
        round: 'practice' | 'transfer',
        signal: AbortSignal,
    ): void => {
        const root = element('section', `academy-repeat-request-build academy-repeat-request-build-${round}`);
        if (round === 'transfer') root.append(transferVignette());
        else root.append(riePrompt());
        const work = paper('academy-repeat-request-work');
        const prompt = localized(
            'p',
            'academy-repeat-request-build-prompt',
            round === 'practice' ? COPY.practicePrompt : COPY.transferPrompt,
            options.language,
        );
        const slotLabel = localized('h2', 'academy-repeat-request-slot-label', COPY.slots, options.language);
        const slots = element('div', 'academy-repeat-request-slots');
        slots.setAttribute('aria-label', COPY.slots[options.language]);
        for (let index = 0; index < options.definition.transferChunkIds.length; index += 1) {
            const slot = element('div', 'academy-repeat-request-slot');
            slot.dataset.slot = String(index + 1);
            const selectedId = state.selectedChunkIds[index];
            if (selectedId) {
                const selected = chunkFor(selectedId);
                slot.append(
                    japanese('span', 'academy-repeat-request-slot-japanese', selected.japanese),
                    textSpan(selected.soundCue, 'academy-repeat-request-slot-sound'),
                );
            } else {
                slot.append(localized('span', 'academy-repeat-request-slot-empty', COPY.emptySlot, options.language));
            }
            slots.append(slot);
        }
        const choiceLabel = localized('h2', 'academy-repeat-request-choice-label', COPY.choices, options.language);
        const choices = element('div', 'academy-repeat-request-choices');
        choices.setAttribute('role', 'group');
        choices.setAttribute('aria-label', COPY.choices[options.language]);
        const choiceIds: readonly LessonZeroRepeatRequestChunkId[] = round === 'practice'
            ? [...options.definition.practiceChunkIds].reverse()
            : options.definition.transferChoiceIds;
        choiceIds.forEach((chunkId, index) => {
            choices.append(chunkChoice(chunkFor(chunkId), index, signal));
        });
        const submit = actionButton(
            (round === 'practice' ? COPY.submitPractice : COPY.submitTransfer)[options.language],
            'academy-button-primary',
        );
        submit.dataset.repeatAction = 'submit';
        submit.disabled = state.selectedChunkIds.length !== options.definition.transferChunkIds.length;
        submit.addEventListener('click', () => void submitBuild(), { signal });
        work.append(prompt, slotLabel, slots, choiceLabel, choices, submit);
        root.append(work);
        body.append(root, leaveControl(signal));
    };

    const renderRepair = (signal: AbortSignal): void => {
        const attempt = [...state.attempts].reverse().find(candidate => candidate.outcome === 'lapse');
        const slipped = chunkFor(attempt?.slippedChunkId ?? 'once-more');
        const root = element('section', 'academy-repeat-request-repair');
        const portrait = characterPortrait(ACADEMY_ASSETS.rie, 'academy-repeat-request-repair-rie');
        const dialogue = paper('academy-repeat-request-repair-paper');
        const title = localized('h2', 'academy-repeat-request-repair-title', COPY.repairTitle, options.language);
        const prefix = localized('p', 'academy-repeat-request-repair-prefix', COPY.repairPrefix, options.language);
        const focus = element('div', 'academy-repeat-request-repair-focus');
        focus.append(
            japanese('strong', 'academy-repeat-request-repair-japanese', slipped.japanese),
            textSpan(slipped.soundCue, 'academy-repeat-request-repair-sound'),
            localized('span', 'academy-repeat-request-repair-meaning', slipped.meaning, options.language),
        );
        const explanation = localized(
            'p',
            'academy-repeat-request-repair-explanation',
            repairCopy(attempt?.errorTag, slipped.id),
            options.language,
        );
        const retry = actionButton(COPY.retry[options.language], 'academy-button-primary');
        retry.dataset.repeatAction = 'retry';
        retry.addEventListener('click', () => void beginRetry(), { signal });
        dialogue.append(title, prefix, focus, explanation, retry);
        root.append(portrait, dialogue);
        body.append(root, leaveControl(signal));
        queueMicrotask(() => retry.focus({ preventScroll: true }));
    };

    const renderTransferReady = (signal: AbortSignal): void => {
        const root = element('section', 'academy-repeat-request-transfer-ready');
        const portrait = characterPortrait(ACADEMY_ASSETS.rie, 'academy-repeat-request-transfer-ready-rie');
        const dialogue = paper('academy-repeat-request-transfer-ready-paper');
        const title = localized('h2', 'academy-repeat-request-pass-title', COPY.practicePass, options.language);
        const line = localized(
            'p',
            'academy-repeat-request-pass-line',
            COPY.practicePassBody,
            options.language,
        );
        const next = actionButton(COPY.beginTransfer[options.language], 'academy-button-primary');
        next.dataset.repeatAction = 'begin-transfer';
        next.addEventListener('click', () => void beginTransfer(), { signal });
        dialogue.append(title, line, next);
        root.append(portrait, dialogue);
        body.append(root, leaveControl(signal));
        queueMicrotask(() => next.focus({ preventScroll: true }));
    };

    const renderComplete = (signal: AbortSignal): void => {
        const root = element('section', 'academy-repeat-request-complete');
        const pair = element('div', 'academy-repeat-request-complete-cast');
        pair.append(
            characterPortrait(ACADEMY_ASSETS.rie, 'academy-repeat-request-complete-rie'),
            characterPortrait(
                ACADEMY_ASSETS.characters.approved.aakash,
                'academy-repeat-request-complete-aakash',
            ),
        );
        const dialogue = paper('academy-repeat-request-complete-paper');
        const seal = japanese('span', 'academy-repeat-request-seal', 'もう一度');
        seal.setAttribute('aria-hidden', 'true');
        const title = localized('h2', 'academy-repeat-request-complete-title', COPY.complete, options.language);
        const line = localized('p', 'academy-repeat-request-complete-line', COPY.completeBody, options.language);
        const target = japanese('p', 'academy-repeat-request-complete-target', options.definition.target.japanese);
        const replay = replayButton(signal);
        const actions = element('div', 'academy-repeat-request-complete-actions');
        const done = actionButton(COPY.continue[options.language], 'academy-button-primary');
        done.dataset.repeatAction = 'complete';
        done.addEventListener('click', () => void notify(options.onComplete), { signal });
        const again = actionButton(COPY.again[options.language], 'academy-button-secondary');
        again.dataset.repeatAction = 'restart';
        again.addEventListener('click', () => void restart(), { signal });
        actions.append(done, again);
        dialogue.append(seal, title, line, target, replay, actions);
        root.append(pair, dialogue);
        body.append(root);
        queueMicrotask(() => done.focus({ preventScroll: true }));
    };

    const riePrompt = (): HTMLElement => {
        const prompt = element('div', 'academy-repeat-request-rie-prompt');
        prompt.append(
            characterPortrait(ACADEMY_ASSETS.rie, 'academy-repeat-request-prompt-rie'),
            localized(
                'p',
                'academy-repeat-request-prompt-line',
                {
                    en: 'Your turn. I’ll wait.',
                    ja: 'あなたの番です。待っています。',
                },
                options.language,
            ),
        );
        return prompt;
    };

    const transferVignette = (): HTMLElement => {
        const vignette = element('div', 'academy-repeat-request-transfer-vignette');
        const plate = academyBackgroundPicture('cafe');
        plate.classList.add('academy-repeat-request-transfer-plate');
        const portrait = characterPortrait(
            ACADEMY_ASSETS.characters.approved.aakash,
            'academy-repeat-request-aakash',
        );
        const dialogue = localized(
            'p',
            'academy-repeat-request-aakash-line',
            COPY.aakashLine,
            options.language,
        );
        const name = element('strong', 'academy-repeat-request-aakash-name');
        name.textContent = options.language === 'ja' ? 'アーカーシュ' : 'Aakash';
        dialogue.prepend(name);
        vignette.append(plate, portrait, dialogue);
        return vignette;
    };

    const chunkChoice = (
        chunk: LessonZeroRepeatRequestChunk,
        index: number,
        signal: AbortSignal,
    ): HTMLButtonElement => {
        const selected = state.selectedChunkIds.includes(chunk.id);
        const button = element('button', 'academy-repeat-request-choice');
        button.type = 'button';
        button.dataset.choice = choiceToken(index);
        button.dataset.chunkId = chunk.id;
        button.dataset.selected = String(selected);
        button.setAttribute('aria-pressed', String(selected));
        button.setAttribute(
            'aria-label',
            `${chunk.soundCue}: ${chunk.meaning[options.language]}. ${
                selected ? COPY.remove[options.language] : COPY.select[options.language]
            }`,
        );
        button.append(
            japanese('span', 'academy-repeat-request-choice-japanese', chunk.japanese),
            textSpan(chunk.soundCue, 'academy-repeat-request-choice-sound'),
            localized('span', 'academy-repeat-request-choice-meaning', chunk.meaning, options.language),
        );
        button.addEventListener('click', () => void selectChunk(chunk.id), { signal });
        return button;
    };

    const chunkLesson = (chunk: LessonZeroRepeatRequestChunk): HTMLElement => {
        const root = element('div', 'academy-repeat-request-chunk-lesson');
        root.append(
            japanese('strong', 'academy-repeat-request-chunk-japanese', chunk.japanese),
            textSpan(chunk.soundCue, 'academy-repeat-request-chunk-sound'),
            localized('span', 'academy-repeat-request-chunk-meaning', chunk.meaning, options.language),
        );
        return root;
    };

    const replayButton = (signal: AbortSignal): HTMLButtonElement => {
        const replay = actionButton(`▶ ${COPY.replay[options.language]}`, 'academy-repeat-request-replay');
        replay.dataset.repeatAction = 'replay';
        replay.addEventListener('click', () => void playTarget(replay), { signal });
        return replay;
    };

    const leaveControl = (signal: AbortSignal): HTMLElement => {
        const footer = element('footer', 'academy-repeat-request-footer');
        const leave = actionButton(COPY.saveLeave[options.language], 'academy-button-secondary');
        leave.addEventListener('click', () => void pauseAndLeave(), { signal });
        footer.append(leave);
        return footer;
    };

    const runTransition = async (
        transition: LessonZeroRepeatRequestSessionTransition,
    ): Promise<boolean> => {
        if (busy || transition.state === state) return false;
        const before = state;
        try {
            busy = true;
            screen.setAttribute('aria-busy', 'true');
            await options.onTransition(before, transition);
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

    const enqueueTransition = (
        action: LessonZeroRepeatRequestSessionAction,
    ): Promise<boolean> => enqueueAction(() => runTransition(
        transitionLessonZeroRepeatRequestSession(
            options.definition,
            state,
            action,
            Date.now(),
        ),
    ));

    const beginPractice = async (): Promise<void> => {
        const moved = await enqueueTransition({ kind: 'start' });
        if (moved) playback?.dispose();
    };

    const selectChunk = async (chunkId: LessonZeroRepeatRequestChunkId): Promise<void> => {
        await enqueueTransition({ kind: 'select', chunkId });
    };

    const submitBuild = async (): Promise<void> => {
        await enqueueTransition({ kind: 'submit' });
    };

    const beginRetry = async (): Promise<void> => {
        await enqueueTransition({ kind: 'begin-retry' });
    };

    const beginTransfer = async (): Promise<void> => {
        await enqueueTransition({ kind: 'begin-transfer' });
    };

    const pauseAndLeave = async (): Promise<void> => {
        await enqueueAction(async () => {
            if (state.status === 'active') {
                const transition = transitionLessonZeroRepeatRequestSession(
                    options.definition,
                    state,
                    { kind: 'pause' },
                    Date.now(),
                );
                if (!(await runTransition(transition))) return;
            }
            await notify(options.onBack);
        });
    };

    const restart = async (): Promise<void> => {
        await enqueueAction(async () => {
            const fresh = startLessonZeroRepeatRequestSession(options.definition);
            try {
                busy = true;
                await options.onRestart(fresh);
                state = fresh;
                playback?.dispose();
                playback = null;
                render();
            } catch {
                live.textContent = COPY.saveError[options.language];
            } finally {
                busy = false;
            }
        });
    };

    const playTarget = async (control?: HTMLButtonElement): Promise<void> => {
        if (disposed) return;
        playback?.dispose();
        playback = null;
        if (control) {
            control.disabled = true;
            control.textContent = COPY.playing[options.language];
        }
        try {
            const active = await playLearningVoiceBinding(
                options.pronunciation,
                options.definition.target.voiceBindingId,
                options.definition.target.japanese,
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

    const progressCopy = () => {
        if (state.stage === 'meet' || state.status === 'ready') return COPY.progressMeet;
        if (state.stage.startsWith('practice')) return COPY.progressPractice;
        return COPY.progressTransfer;
    };

    const chunkFor = (id: LessonZeroRepeatRequestChunkId): LessonZeroRepeatRequestChunk => {
        const chunk = options.definition.chunks.find(candidate => candidate.id === id);
        if (!chunk) throw new TypeError(`Unknown repeat-request chunk ${id}.`);
        return chunk;
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

function repairCopy(
    errorTag: string | undefined,
    slippedChunkId: LessonZeroRepeatRequestChunkId,
): Readonly<{ en: string; ja: string }> {
    if (errorTag === 'repeat-request-known-pattern-intrusion') {
        return {
            en: 'desu finishes a statement. onegaishimasu turns this into a polite request.',
            ja: '「です」は文を結びます。「お願いします」で丁寧な頼み方になります。',
        };
    }
    if (errorTag === 'repeat-request-order') {
        return {
            en: 'Start with mou ichido. Finish with onegaishimasu.',
            ja: '「もう一度」から始めて、「お願いします」で結びます。',
        };
    }
    return slippedChunkId === 'please'
        ? {
            en: 'Finish with onegaishimasu so it sounds like a polite request.',
            ja: '「お願いします」で結ぶと、丁寧な頼み方になります。',
        }
        : {
            en: 'Start with mou ichido: “one more time.”',
            ja: '「もう一度」から始めます。',
        };
}

function paper(className: string): HTMLElement {
    return element('div', `academy-repeat-request-paper ${className}`);
}

function characterPortrait(source: string, className: string): HTMLImageElement {
    const portrait = element('img', className);
    portrait.src = source;
    portrait.alt = '';
    portrait.setAttribute('aria-hidden', 'true');
    portrait.decoding = 'async';
    return portrait;
}

function japanese<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    value: string,
): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    node.lang = 'ja';
    node.dataset.yomuRuntimeSurface = 'academy-repeat-request';
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
        node.dataset.yomuRuntimeSurface = 'academy-repeat-request-copy';
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
