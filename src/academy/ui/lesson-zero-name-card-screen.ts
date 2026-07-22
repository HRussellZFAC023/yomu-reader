import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import {
    lessonZeroNameCardLine,
    startLessonZeroNameCardSession,
    transitionLessonZeroNameCardSession,
    type LessonZeroNameCardDefinition,
    type LessonZeroNameCardSessionAction,
    type LessonZeroNameCardSessionState,
    type LessonZeroNameCardSessionTransition,
    type LessonZeroNameCardToken,
} from '../domain/lesson-zero-name-card-session';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import { academyBackgroundPicture, backButton, element } from './dom';

type LocalizedCopy = Readonly<{ en: string; ja: string }>;

export interface LessonZeroNameCardScreenOptions {
    readonly language: AcademyLanguage;
    readonly definition: LessonZeroNameCardDefinition;
    readonly initialState: LessonZeroNameCardSessionState;
    readonly pronunciation: PronunciationService;
    readonly onTransition: (
        before: LessonZeroNameCardSessionState,
        transition: LessonZeroNameCardSessionTransition,
    ) => void | Promise<void>;
    readonly onRestart: (state: LessonZeroNameCardSessionState) => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
    readonly onComplete: () => void | Promise<void>;
}

export interface LessonZeroNameCardScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

const COPY = {
    eyebrow: { en: 'First introduction', ja: 'はじめての自己紹介' },
    title: { en: 'Put your name on the desk', ja: '名前を机に置こう' },
    progress: { en: 'One short sentence', ja: '短い文を一つ' },
    instruction: {
        en: 'I wrote the name you chose. Put it before です.',
        ja: '選んだ名前を書きました。「です」の前に置きましょう。',
    },
    modelLabel: { en: "Rie's example", ja: 'りえ先生の例' },
    hearModel: { en: "Hear Rie's example", ja: 'りえ先生の例を聞く' },
    playing: { en: 'Playing…', ja: '再生中…' },
    sentenceMeaning: { en: '___ です = I am ___.', ja: '「___です」で名前を伝えます。' },
    sentenceLabel: { en: 'Build the sentence', ja: '文を作る' },
    piecesLabel: { en: 'Choose the two pieces in order', ja: '二つを順番に選ぶ' },
    emptySlot: { en: 'Choose a piece', ja: 'ことばを選ぶ' },
    clear: { en: 'Clear', ja: 'やり直す' },
    check: { en: 'Check', ja: '確認する' },
    repairTitle: { en: 'Try the order again', ja: '順番をもう一度' },
    repair: { en: 'Your name comes first.', ja: '名前が先です。' },
    showHelp: { en: 'Show the pattern', ja: '形を見る' },
    pattern: { en: '1. your name   2. です', ja: '1. あなたの名前　2. です' },
    retry: { en: 'Try again', ja: 'もう一度' },
    completeTitle: { en: 'Your card is ready', ja: '名札ができました' },
    sayIt: { en: 'Say the line once aloud.', ja: '文を一度、声に出して言いましょう。' },
    hearRie: { en: 'Hear Rie', ja: 'りえ先生を聞く' },
    continue: { en: 'Put it on the desk', ja: '机に置く' },
    again: { en: 'Practice again', ja: 'もう一度練習する' },
    saveError: { en: 'That did not save. Try once more.', ja: '保存できませんでした。もう一度お試しください。' },
    audioError: { en: 'The audio did not play. Try once more.', ja: '音声を再生できませんでした。もう一度お試しください。' },
} as const;

export function createLessonZeroNameCardScreen(
    options: LessonZeroNameCardScreenOptions,
): LessonZeroNameCardScreen {
    const lifecycle = new AbortController();
    let renderLifecycle = new AbortController();
    let state = options.initialState;
    let playback: Disposable | null = null;
    let busy = false;
    let disposed = false;

    const screen = element('section', 'academy-screen academy-name-card-screen');
    screen.dataset.academyScreen = 'lesson-zero-name-card';
    screen.dataset.activityId = options.definition.activityId;
    screen.append(academyBackgroundPicture('classroom'));

    const shell = element('div', 'academy-name-card-shell');
    const header = element('header', 'academy-name-card-header');
    const back = backButton(options.language);
    back.classList.add('academy-name-card-back');
    back.textContent = '←';
    back.title = back.getAttribute('aria-label') ?? '';
    back.addEventListener('click', () => void pauseAndLeave(), { signal: lifecycle.signal });
    const heading = element('div', 'academy-name-card-heading');
    heading.append(
        localized('p', 'academy-name-card-eyebrow', COPY.eyebrow, options.language),
        localized('h1', 'academy-name-card-title', COPY.title, options.language),
    );
    const progress = localized('p', 'academy-name-card-progress', COPY.progress, options.language);
    progress.setAttribute('role', 'status');
    header.append(back, heading, progress);
    const body = element('main', 'academy-name-card-body');
    const live = element('p', 'academy-name-card-live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    shell.append(header, body, live);
    screen.append(shell);

    const render = (): void => {
        renderLifecycle.abort();
        renderLifecycle = new AbortController();
        body.replaceChildren();
        live.textContent = '';
        screen.dataset.sessionStatus = state.status;
        screen.dataset.sessionStage = state.stage;
        screen.dataset.attemptCount = String(state.attempts.length);
        if (state.status === 'complete') renderComplete(renderLifecycle.signal);
        else if (state.stage === 'result') renderRepair(renderLifecycle.signal);
        else renderBuild(renderLifecycle.signal);
    };

    const renderBuild = (signal: AbortSignal): void => {
        const scene = sceneRoot();
        const paper = livingPaper();
        paper.append(
            speakerName(),
            localized('p', 'academy-name-card-dialogue', COPY.instruction, options.language),
            modelStrip(signal),
            nameCardBuilder(signal),
        );
        if (state.modelRevealed) {
            paper.append(localized('p', 'academy-name-card-pattern', COPY.pattern, options.language));
        }
        const actions = element('div', 'academy-name-card-actions');
        const clear = actionButton(COPY.clear, 'secondary', signal, () => apply({ kind: 'clear-tokens' }));
        clear.disabled = state.selectedTokenIds.length === 0;
        const check = actionButton(COPY.check, 'primary', signal, () => apply({ kind: 'check' }));
        check.disabled = state.selectedTokenIds.length !== options.definition.correctOrder.length;
        actions.append(clear, check);
        paper.append(actions);
        scene.append(portrait(), paper);
        body.append(scene);
    };

    const renderRepair = (signal: AbortSignal): void => {
        const scene = sceneRoot();
        const paper = livingPaper();
        paper.dataset.outcome = 'lapse';
        paper.append(
            speakerName(),
            localized('h2', 'academy-name-card-section-title', COPY.repairTitle, options.language),
            localized('p', 'academy-name-card-dialogue', COPY.repair, options.language),
        );
        if (state.modelRevealed) {
            paper.append(localized('p', 'academy-name-card-pattern', COPY.pattern, options.language));
        }
        const actions = element('div', 'academy-name-card-actions');
        if (!state.modelRevealed) {
            actions.append(actionButton(COPY.showHelp, 'secondary', signal, () => apply({ kind: 'reveal-model' })));
        }
        actions.append(actionButton(COPY.retry, 'primary', signal, () => apply({ kind: 'retry' })));
        paper.append(actions);
        scene.append(portrait(), paper);
        body.append(scene);
    };

    const renderComplete = (signal: AbortSignal): void => {
        const scene = sceneRoot();
        const paper = livingPaper();
        const card = element('section', 'academy-name-card-finished');
        card.append(
            localized('p', 'academy-name-card-card-label', COPY.completeTitle, options.language),
            japanese(lessonZeroNameCardLine(options.definition), 'academy-name-card-final-line'),
            localized('p', 'academy-name-card-final-meaning', {
                en: `I'm ${options.definition.learnerName}.`,
                ja: `${options.definition.learnerName}です。`,
            }, options.language),
        );
        const response = element('section', 'academy-name-card-response');
        response.append(
            speakerName(),
            japanese(options.definition.response.japanese, 'academy-name-card-response-japanese'),
            localized('p', 'academy-name-card-response-meaning', options.definition.response.meaning, options.language),
            localized('p', 'academy-name-card-say-it', COPY.sayIt, options.language),
            audioButton(COPY.hearRie, options.definition.response.japanese, options.definition.response.reading, signal),
        );
        const actions = element('div', 'academy-name-card-actions');
        actions.append(
            actionButton(COPY.again, 'secondary', signal, restart),
            actionButton(COPY.continue, 'primary', signal, options.onComplete),
        );
        response.append(actions);
        paper.append(card, response);
        scene.append(portrait(), paper);
        body.append(scene);
    };

    const modelStrip = (signal: AbortSignal): HTMLElement => {
        const model = element('section', 'academy-name-card-model');
        const copy = element('div', 'academy-name-card-model-copy');
        copy.append(
            localized('span', 'academy-name-card-model-label', COPY.modelLabel, options.language),
            japanese(options.definition.model.japanese, 'academy-name-card-model-line'),
            localized('span', 'academy-name-card-model-meaning', options.definition.model.meaning, options.language),
        );
        model.append(copy, audioButton(COPY.hearModel, options.definition.model.japanese, options.definition.model.reading, signal));
        return model;
    };

    const nameCardBuilder = (signal: AbortSignal): HTMLElement => {
        const builder = element('section', 'academy-name-card-builder');
        builder.setAttribute('aria-label', COPY.sentenceLabel[options.language]);
        builder.append(
            localized('h2', 'academy-name-card-section-title', COPY.sentenceLabel, options.language),
            localized('p', 'academy-name-card-builder-label', COPY.piecesLabel, options.language),
        );
        const rail = element('div', 'academy-name-card-rail');
        rail.setAttribute('role', 'list');
        for (let index = 0; index < options.definition.correctOrder.length; index += 1) {
            const tokenId = state.selectedTokenIds[index];
            if (!tokenId) {
                const slot = localized('span', 'academy-name-card-slot academy-name-card-slot-empty', COPY.emptySlot, options.language);
                slot.setAttribute('aria-hidden', 'true');
                rail.append(slot);
                continue;
            }
            const token = tokenFor(tokenId);
            const button = tokenButton(token, 'selected', signal, () => apply({ kind: 'remove-token', tokenId }));
            button.setAttribute('aria-label', `${token.text}: ${options.language === 'ja' ? '外す' : 'remove'}`);
            rail.append(button);
        }
        const bank = element('div', 'academy-name-card-bank');
        bank.setAttribute('role', 'group');
        bank.setAttribute('aria-label', COPY.piecesLabel[options.language]);
        options.definition.tokens.forEach(token => {
            if (state.selectedTokenIds.includes(token.id)) return;
            bank.append(tokenButton(token, 'available', signal, () => apply({ kind: 'select-token', tokenId: token.id })));
        });
        builder.append(rail, bank, localized('p', 'academy-name-card-frame-meaning', COPY.sentenceMeaning, options.language));
        return builder;
    };

    const tokenButton = (
        token: LessonZeroNameCardToken,
        stateName: 'selected' | 'available',
        signal: AbortSignal,
        action: () => void | Promise<void>,
    ): HTMLButtonElement => {
        const button = element('button', `academy-name-card-token academy-name-card-token-${stateName}`);
        button.type = 'button';
        button.dataset.tokenId = token.id;
        button.append(
            token.id === 'desu'
                ? japanese(token.text, 'academy-name-card-token-text')
                : textNode(token.text, 'academy-name-card-token-text'),
            localized('span', 'academy-name-card-token-cue', token.cue, options.language),
        );
        button.addEventListener('click', () => void action(), { signal });
        return button;
    };

    const apply = async (action: LessonZeroNameCardSessionAction): Promise<void> => {
        if (busy || disposed) return;
        try {
            busy = true;
            screen.setAttribute('aria-busy', 'true');
            const before = state;
            const transition = transitionLessonZeroNameCardSession(options.definition, state, action, Date.now());
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
        if (busy || disposed) return;
        if (state.status === 'active') {
            const before = state;
            const transition = transitionLessonZeroNameCardSession(options.definition, state, { kind: 'pause' }, Date.now());
            await options.onTransition(before, transition);
            state = transition.state;
        }
        await options.onBack();
    };

    const restart = async (): Promise<void> => {
        if (busy || disposed) return;
        const fresh = startLessonZeroNameCardSession(options.definition);
        await options.onRestart(fresh);
        state = fresh;
        render();
    };

    const audioButton = (
        copy: LocalizedCopy,
        japaneseText: string,
        reading: string,
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
                const active = await options.pronunciation.play(japaneseText, reading);
                if (disposed) active.dispose();
                else playback = active;
            } catch {
                live.textContent = COPY.audioError[options.language];
            } finally {
                if (!disposed) {
                    button.disabled = false;
                    button.textContent = label;
                }
            }
        });
        button.dataset.audioTerm = japaneseText;
        button.textContent = `▶ ${button.textContent}`;
        return button;
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

    function tokenFor(id: LessonZeroNameCardToken['id']): LessonZeroNameCardToken {
        const token = options.definition.tokens.find(candidate => candidate.id === id);
        if (!token) throw new TypeError(`Unknown name-card piece: ${id}`);
        return token;
    }

    function sceneRoot(): HTMLElement {
        return element('section', 'academy-name-card-scene');
    }

    function livingPaper(): HTMLElement {
        const paper = element('section', 'academy-name-card-paper');
        paper.append(element('span', 'academy-name-card-paperclip'));
        return paper;
    }

    function portrait(): HTMLImageElement {
        const image = element('img', 'academy-name-card-portrait');
        image.src = ACADEMY_ASSETS.rie;
        image.alt = '';
        image.setAttribute('aria-hidden', 'true');
        return image;
    }

    function speakerName(): HTMLElement {
        const node = element('strong', 'academy-name-card-speaker');
        node.textContent = options.language === 'ja' ? 'りえ先生' : 'Rie-sensei';
        node.dataset.speakerId = 'rie';
        return node;
    }

    function actionButton(
        copy: LocalizedCopy,
        variant: 'primary' | 'secondary' | 'listen',
        signal: AbortSignal,
        action: () => void | Promise<void>,
    ): HTMLButtonElement {
        const button = element('button', `academy-button academy-name-card-action academy-name-card-action-${variant}`);
        button.type = 'button';
        button.textContent = copy[options.language];
        button.setAttribute('aria-label', copy[options.language]);
        button.addEventListener('click', () => void action(), { signal });
        return button;
    }
}

function japanese(value: string, className: string): HTMLElement {
    const node = element('span', className);
    node.lang = 'ja';
    node.dataset.yomuRuntimeSurface = 'lesson-zero-name-card-japanese';
    node.dataset.yomuFuriganaMode = 'all';
    node.textContent = value;
    return node;
}

function textNode(value: string, className: string): HTMLElement {
    const node = element('span', className);
    node.textContent = value;
    node.dataset.jpdbReaderSurfaceIgnore = '';
    return node;
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
        node.dataset.yomuRuntimeSurface = 'lesson-zero-name-card-copy';
        node.dataset.yomuFuriganaMode = 'all';
    } else {
        node.dataset.jpdbReaderSurfaceIgnore = '';
    }
    return node;
}
