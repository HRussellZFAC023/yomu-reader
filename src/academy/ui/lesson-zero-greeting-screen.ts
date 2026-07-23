import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import {
    createPrivatePracticeRecorder,
    type PrivatePracticeCapture,
    type PrivatePracticeRecorder,
    type PrivatePracticeRecording,
} from '../audio/private-practice-recorder';
import { playLearningVoiceBinding } from '../audio/learning-voice';
import {
    startLessonZeroGreetingSession,
    transitionLessonZeroGreetingSession,
    type LessonZeroGreetingChunk,
    type LessonZeroGreetingMode,
    type LessonZeroGreetingSessionDefinition,
    type LessonZeroGreetingSessionState,
    type LessonZeroGreetingSessionTransition,
} from '../domain/lesson-zero-greeting-session';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import { academyBackgroundPicture, backButton, element } from './dom';

type LocalizedCopy = Readonly<{ en: string; ja: string }>;

export interface LessonZeroGreetingScreenOptions {
    readonly language: AcademyLanguage;
    readonly definition: LessonZeroGreetingSessionDefinition;
    readonly initialState: LessonZeroGreetingSessionState;
    readonly pronunciation: PronunciationService;
    readonly recorder?: PrivatePracticeRecorder;
    readonly onTransition: (
        before: LessonZeroGreetingSessionState,
        transition: LessonZeroGreetingSessionTransition,
    ) => void | Promise<void>;
    readonly onRestart: (state: LessonZeroGreetingSessionState) => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
    readonly onComplete: () => void | Promise<void>;
}

export interface LessonZeroGreetingScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

const COPY = {
    eyebrow: { en: 'Your first hello', ja: '最初のあいさつ' },
    title: { en: 'Step into the room', ja: '教室に入ろう' },
    progressReady: { en: 'Meet Rie', ja: 'りえ先生に会う' },
    progressArrange: { en: 'Build the greeting', ja: 'あいさつを作る' },
    progressRehearse: { en: 'Say it your way', ja: '自分の方法で言う' },
    progressComplete: { en: 'You are in', ja: '教室に入れました' },
    welcome: {
        en: "You're here. Good. Before we open anything, let's give the room one small hello.",
        ja: '来ましたね。では、何かを開く前に、教室へ短いあいさつをしましょう。',
    },
    reason: {
        en: 'Four pieces are enough to enter a classroom, meet someone, and give your name.',
        ja: '四つのことばで、教室に入り、初めて会う人へ名前を伝えられます。',
    },
    hearRie: { en: 'Hear Rie', ja: 'りえ先生を聞く' },
    playing: { en: 'Rie is speaking…', ja: 'りえ先生が話しています…' },
    begin: { en: 'Build my greeting', ja: 'あいさつを作る' },
    arrangeTitle: { en: 'Put Rie’s four pieces in order', ja: 'りえ先生の四つのことばを順番に並べよう' },
    arrangeBody: {
        en: 'Tap each paper strip in the order you would say it. Tap a chosen strip to put it back.',
        ja: '言う順番に紙を選んでください。選んだ紙を押すと、元に戻せます。',
    },
    yourGreeting: { en: 'Your greeting', ja: 'あなたのあいさつ' },
    phraseDesk: { en: 'Phrase desk', ja: 'ことばの机' },
    emptySequence: { en: 'Choose the first phrase.', ja: '最初のことばを選んでください。' },
    checkOrder: { en: 'Check the order', ja: '順番を確かめる' },
    orderWrong: {
        en: 'Almost. Evening first, then the first-meeting hello, your name, and the polite close.',
        ja: 'もう少しです。夜のあいさつ、初対面のあいさつ、名前、丁寧な結びの順です。',
    },
    orderRight: { en: 'That is the shape of it.', ja: 'その順番です。' },
    rehearseLine: {
        en: 'Now let the paper go. Say the whole greeting to me.',
        ja: 'では、紙を見ないで、あいさつを全部言ってみてください。',
    },
    chooseWay: { en: 'Choose how you want to rehearse', ja: '練習の方法を選ぶ' },
    record: { en: 'Record privately', ja: '端末だけで録音する' },
    recordDetail: { en: 'Record, listen back, then check your own turn.', ja: '録音して聞き、自分のあいさつを確かめます。' },
    speak: { en: 'Speak without recording', ja: '録音せずに話す' },
    speakDetail: { en: 'Say it aloud, then check the two parts that matter.', ja: '声に出してから、大事な二点を確かめます。' },
    type: { en: 'Use the keyboard', ja: 'キーボードを使う' },
    typeDetail: { en: 'Build the same greeting in text.', ja: '同じあいさつを文字で作ります。' },
    privacy: {
        en: 'This take stays on this device and disappears when you leave.',
        ja: '録音はこの端末だけに残り、画面を離れると消えます。',
    },
    startRecording: { en: 'Start recording', ja: '録音を始める' },
    stopRecording: { en: 'Stop recording', ja: '録音を止める' },
    recording: { en: 'Recording… Say all four pieces.', ja: '録音中です。四つ全部を言ってください。' },
    recorded: { en: 'Listen to your take', ja: '自分の録音を聞く' },
    anotherTake: { en: 'Make another take', ja: 'もう一度録音する' },
    recorderUnavailable: {
        en: 'Private recording is unavailable here. You can still speak aloud or use the keyboard.',
        ja: 'この環境では録音できません。声に出すか、キーボードを使えます。',
    },
    saidIt: { en: 'I said the whole greeting', ja: 'あいさつを全部言いました' },
    selfCheckTitle: { en: 'Check what reached Rie', ja: 'りえ先生に伝わったことを確かめる' },
    checkOrderLabel: { en: 'I used all four pieces in order.', ja: '四つのことばを順番どおりに言いました。' },
    checkNameLabel: { en: 'My name was clear before です.', ja: '「です」の前に名前をはっきり言いました。' },
    commitCheck: { en: 'Commit my greeting', ja: 'あいさつを決める' },
    typeLabel: { en: 'Write the greeting you would say', ja: '言うあいさつを書いてください' },
    typePlaceholder: { en: 'こんばんは。…', ja: 'こんばんは。…' },
    submitTyped: { en: 'Send it to Rie', ja: 'りえ先生に送る' },
    switchMode: { en: 'Choose another way', ja: '別の方法を選ぶ' },
    repairTitle: { en: 'Keep the turn. Fix one piece.', ja: 'もう一度、一か所だけ直そう' },
    repairBody: {
        en: 'Rie leaves the full line beside you. Read it once, then try the whole greeting again.',
        ja: 'りえ先生が全文を置いてくれました。一度読んでから、もう一度全部言いましょう。',
    },
    modelLabel: { en: 'Rie’s model', ja: 'りえ先生の見本' },
    saveError: { en: 'That turn did not save. Please try once more.', ja: '保存できませんでした。もう一度お試しください。' },
    audioError: { en: 'Rie’s line did not play. Try once more.', ja: '音声を再生できませんでした。もう一度お試しください。' },
    completeLine: {
        en: 'Good evening. You gave the room your name. Now you belong in the lesson.',
        ja: 'こんばんは。教室に名前が届きました。これで授業を始められます。',
    },
    reviewTitle: { en: 'Four small memories are waiting for review', ja: '四つのことばが復習に入りました' },
    return: { en: 'Enter the lesson', ja: '授業に入る' },
    again: { en: 'Greet Rie again', ja: 'もう一度りえ先生にあいさつする' },
    leave: { en: 'Save and return', ja: '保存して戻る' },
} as const;

const SCRAMBLED_CHUNK_ORDER: readonly LessonZeroGreetingChunk['id'][] = [
    'closing',
    'name',
    'evening',
    'first-meeting',
];

export function createLessonZeroGreetingScreen(
    options: LessonZeroGreetingScreenOptions,
): LessonZeroGreetingScreen {
    const lifecycle = new AbortController();
    let renderLifecycle = new AbortController();
    const recorder = options.recorder ?? createPrivatePracticeRecorder();
    let state = options.initialState;
    let playback: Disposable | null = null;
    let capture: PrivatePracticeCapture | null = null;
    let recording: PrivatePracticeRecording | null = null;
    let arrangementMessage: 'right' | 'wrong' | null = null;
    let selfCheckOpen = false;
    let recorderMessage = '';
    let busy = false;
    let disposed = false;

    const screen = element('section', 'academy-screen academy-greeting-screen');
    screen.dataset.academyScreen = 'lesson-zero-greeting';
    screen.dataset.activityId = options.definition.activityId;
    screen.append(academyBackgroundPicture('classroom'));

    const shell = element('div', 'academy-greeting-shell');
    const header = element('header', 'academy-greeting-header');
    const back = backButton(options.language);
    back.classList.add('academy-greeting-back');
    back.textContent = '←';
    back.title = back.getAttribute('aria-label') ?? '';
    back.addEventListener('click', () => void pauseAndLeave(), { signal: lifecycle.signal });
    const heading = element('div', 'academy-greeting-heading');
    heading.append(
        localized('p', 'academy-greeting-eyebrow', COPY.eyebrow, options.language),
        localized('h1', 'academy-greeting-title', COPY.title, options.language),
    );
    const progress = element('p', 'academy-greeting-progress');
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-live', 'polite');
    header.append(back, heading, progress);

    const body = element('main', 'academy-greeting-body');
    const live = element('p', 'academy-greeting-live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    shell.append(header, body, live);
    screen.append(shell);

    const render = (): void => {
        renderLifecycle.abort();
        renderLifecycle = new AbortController();
        const signal = renderLifecycle.signal;
        body.replaceChildren();
        live.textContent = recorderMessage;
        screen.dataset.sessionStatus = state.status;
        screen.dataset.sessionStage = state.stage;
        progress.textContent = progressCopy(state)[options.language];
        if (state.status === 'ready') {
            renderWelcome(signal);
        } else if (state.status === 'complete') {
            renderComplete(signal);
        } else if (state.stage === 'arrange') {
            renderArrange(signal);
        } else {
            renderRehearse(signal);
        }
    };

    const renderWelcome = (signal: AbortSignal): void => {
        const scene = element('section', 'academy-greeting-welcome');
        const portrait = riePortrait('academy-greeting-welcome-portrait');
        const paper = livingPaper('academy-greeting-welcome-paper');
        paper.append(
            speakerName(options.language),
            localized('p', 'academy-greeting-dialogue', COPY.welcome, options.language),
            localized('p', 'academy-greeting-reason', COPY.reason, options.language),
        );
        const actions = element('div', 'academy-greeting-actions');
        actions.append(modelAudioButton(signal), actionButton(COPY.begin, 'primary', signal, () => apply({ kind: 'start' }), options.language));
        paper.append(actions);
        scene.append(portrait, paper);
        body.append(scene);
    };

    const renderArrange = (signal: AbortSignal): void => {
        const root = element('section', 'academy-greeting-arrange');
        const paper = livingPaper('academy-greeting-arrange-paper');
        paper.append(
            localized('h2', 'academy-greeting-section-title', COPY.arrangeTitle, options.language),
            localized('p', 'academy-greeting-section-copy', COPY.arrangeBody, options.language),
        );
        const selected = element('section', 'academy-greeting-sequence');
        selected.setAttribute('aria-label', COPY.yourGreeting[options.language]);
        selected.append(localized('h3', 'academy-greeting-small-title', COPY.yourGreeting, options.language));
        const selectedRail = element('div', 'academy-greeting-selected-rail');
        if (state.selectedChunkIds.length === 0) {
            selectedRail.append(localized('p', 'academy-greeting-empty', COPY.emptySequence, options.language));
        } else {
            state.selectedChunkIds.forEach((id, index) => {
                const chunk = findChunk(id);
                const button = phraseStrip(chunk, options.language, true);
                button.dataset.selectedPosition = String(index + 1);
                button.addEventListener('click', () => void chooseChunk('remove-chunk', chunk.id), { signal });
                selectedRail.append(button);
            });
        }
        selected.append(selectedRail);

        const desk = element('section', 'academy-greeting-phrase-desk');
        desk.setAttribute('aria-label', COPY.phraseDesk[options.language]);
        desk.append(localized('h3', 'academy-greeting-small-title', COPY.phraseDesk, options.language));
        const bank = element('div', 'academy-greeting-phrase-bank');
        SCRAMBLED_CHUNK_ORDER.forEach(id => {
            if (state.selectedChunkIds.includes(id)) return;
            const chunk = findChunk(id);
            const button = phraseStrip(chunk, options.language, false);
            button.addEventListener('click', () => void chooseChunk('select-chunk', chunk.id), { signal });
            bank.append(button);
        });
        desk.append(bank);

        if (arrangementMessage) {
            const feedback = localized(
                'p',
                'academy-greeting-arrangement-feedback',
                arrangementMessage === 'right' ? COPY.orderRight : COPY.orderWrong,
                options.language,
            );
            feedback.dataset.outcome = arrangementMessage === 'right' ? 'pass' : 'lapse';
            feedback.setAttribute('role', 'status');
            paper.append(selected, desk, feedback);
        } else {
            paper.append(selected, desk);
        }
        const check = actionButton(COPY.checkOrder, 'primary', signal, checkArrangement, options.language);
        check.disabled = state.selectedChunkIds.length !== options.definition.chunks.length;
        paper.append(check);
        root.append(paper, riePortrait('academy-greeting-arrange-portrait'));
        body.append(root);
    };

    const renderRehearse = (signal: AbortSignal): void => {
        const root = element('section', 'academy-greeting-rehearse');
        const portrait = riePortrait('academy-greeting-rehearse-portrait');
        const paper = livingPaper('academy-greeting-rehearse-paper');
        paper.append(
            speakerName(options.language),
            localized('h2', 'academy-greeting-section-title', COPY.rehearseLine, options.language),
        );
        const lastAttempt = state.attempts.at(-1);
        if (lastAttempt?.outcome === 'lapse') paper.append(repairSheet(signal));
        if (!state.mode) paper.append(modeChooser(signal));
        else if (state.mode === 'typed') paper.append(typedRehearsal(signal));
        else if (state.mode === 'recorded') paper.append(recordedRehearsal(signal));
        else paper.append(unrecordedRehearsal(signal));
        root.append(portrait, paper);
        body.append(root);
    };

    const modeChooser = (signal: AbortSignal): HTMLElement => {
        const chooser = element('fieldset', 'academy-greeting-mode-chooser');
        const legend = localized('legend', 'academy-greeting-small-title', COPY.chooseWay, options.language);
        chooser.append(legend);
        const modes: readonly [LessonZeroGreetingMode, LocalizedCopy, LocalizedCopy][] = [
            ['recorded', COPY.record, COPY.recordDetail],
            ['unrecorded', COPY.speak, COPY.speakDetail],
            ['typed', COPY.type, COPY.typeDetail],
        ];
        modes.forEach(([mode, labelCopy, detailCopy]) => {
            if (mode === 'recorded' && !recorder.supported) return;
            const button = element('button', 'academy-greeting-mode');
            button.type = 'button';
            button.dataset.mode = mode;
            const label = localized('strong', 'academy-greeting-mode-label', labelCopy, options.language);
            const detail = localized('span', 'academy-greeting-mode-detail', detailCopy, options.language);
            button.append(label, detail);
            button.addEventListener('click', () => void chooseMode(mode), { signal });
            chooser.append(button);
        });
        if (!recorder.supported) {
            chooser.append(localized('p', 'academy-greeting-recorder-note', COPY.recorderUnavailable, options.language));
        }
        return chooser;
    };

    const recordedRehearsal = (signal: AbortSignal): HTMLElement => {
        const root = element('section', 'academy-greeting-recording');
        root.append(localized('p', 'academy-greeting-privacy', COPY.privacy, options.language));
        if (capture) {
            root.append(
                localized('p', 'academy-greeting-recording-status', COPY.recording, options.language),
                actionButton(COPY.stopRecording, 'record', signal, stopRecording, options.language),
            );
            return root;
        }
        if (!recording) {
            root.append(actionButton(COPY.startRecording, 'record', signal, startRecording, options.language));
            root.append(modeSwitch(signal));
            return root;
        }
        const label = localized('p', 'academy-greeting-audio-label', COPY.recorded, options.language);
        const audio = element('audio', 'academy-greeting-take');
        audio.controls = true;
        audio.preload = 'metadata';
        audio.src = recording.url;
        const another = actionButton(COPY.anotherTake, 'secondary', signal, startRecording, options.language);
        root.append(label, audio, another, selfCheck(signal), modeSwitch(signal));
        return root;
    };

    const unrecordedRehearsal = (signal: AbortSignal): HTMLElement => {
        const root = element('section', 'academy-greeting-unrecorded');
        root.append(modelAudioButton(signal));
        if (!selfCheckOpen) root.append(actionButton(COPY.saidIt, 'primary', signal, () => {
            selfCheckOpen = true;
            render();
        }, options.language));
        else root.append(selfCheck(signal));
        root.append(modeSwitch(signal));
        return root;
    };

    const typedRehearsal = (signal: AbortSignal): HTMLElement => {
        const root = element('form', 'academy-greeting-typed');
        const label = localized('label', 'academy-greeting-type-label', COPY.typeLabel, options.language);
        label.htmlFor = 'academy-greeting-response';
        const input = element('textarea', 'academy-greeting-type-input');
        input.id = 'academy-greeting-response';
        input.name = 'greeting';
        input.rows = 4;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = COPY.typePlaceholder[options.language];
        const submit = actionButton(COPY.submitTyped, 'primary', signal, () => undefined, options.language);
        submit.type = 'submit';
        root.addEventListener('submit', event => {
            event.preventDefault();
            void apply({ kind: 'submit-typed', response: input.value });
        }, { signal });
        root.append(label, input, submit, modeSwitch(signal));
        queueMicrotask(() => input.focus({ preventScroll: true }));
        return root;
    };

    const selfCheck = (signal: AbortSignal): HTMLElement => {
        const fieldset = element('fieldset', 'academy-greeting-self-check');
        fieldset.append(localized('legend', 'academy-greeting-small-title', COPY.selfCheckTitle, options.language));
        const order = checkRow('greeting-order', COPY.checkOrderLabel, options.language);
        const name = checkRow('name-intelligible', COPY.checkNameLabel, options.language);
        const submit = actionButton(COPY.commitCheck, 'primary', signal, () => void apply({
            kind: 'submit-self-check',
            greetingOrder: order.input.checked,
            nameIntelligible: name.input.checked,
        }), options.language);
        fieldset.append(order.label, name.label, submit);
        return fieldset;
    };

    const repairSheet = (signal: AbortSignal): HTMLElement => {
        const repair = element('aside', 'academy-greeting-repair');
        repair.append(
            localized('h3', 'academy-greeting-repair-title', COPY.repairTitle, options.language),
            localized('p', 'academy-greeting-repair-copy', COPY.repairBody, options.language),
            localized('span', 'academy-greeting-model-label', COPY.modelLabel, options.language),
        );
        const model = element('p', 'academy-greeting-model-japanese');
        model.lang = 'ja';
        model.dataset.yomuRuntimeSurface = 'lesson-zero-greeting-model';
        model.dataset.yomuFuriganaMode = 'all';
        model.textContent = options.definition.chunks.map(chunk => chunk.japanese).join('');
        const meaning = element('ol', 'academy-greeting-model-meanings');
        options.definition.chunks.forEach(chunk => {
            const item = element('li');
            item.textContent = chunk.meaning[options.language];
            meaning.append(item);
        });
        repair.append(model, meaning, modelAudioButton(signal));
        return repair;
    };

    const renderComplete = (signal: AbortSignal): void => {
        const root = element('section', 'academy-greeting-complete');
        const portrait = riePortrait('academy-greeting-complete-portrait');
        const paper = livingPaper('academy-greeting-complete-paper');
        const seal = element('span', 'academy-greeting-seal');
        seal.lang = 'ja';
        seal.textContent = '縁';
        seal.setAttribute('aria-hidden', 'true');
        const title = element('h2', 'academy-greeting-complete-title');
        title.textContent = options.language === 'ja'
            ? `${options.definition.learnerName}さん、こんばんは。`
            : `Good evening, ${options.definition.learnerName}.`;
        const memories = element('div', 'academy-greeting-review-strip');
        memories.setAttribute('aria-label', COPY.reviewTitle[options.language]);
        memories.append(localized('h3', 'academy-greeting-small-title', COPY.reviewTitle, options.language));
        options.definition.chunks.forEach(chunk => {
            const phrase = element('span', 'academy-greeting-review-phrase');
            phrase.lang = 'ja';
            phrase.dataset.yomuRuntimeSurface = 'lesson-zero-greeting-review';
            phrase.dataset.yomuFuriganaMode = 'all';
            phrase.textContent = chunk.japanese;
            memories.append(phrase);
        });
        const actions = element('div', 'academy-greeting-actions');
        actions.append(
            actionButton(COPY.return, 'primary', signal, () => notify(options.onComplete), options.language),
            actionButton(COPY.again, 'secondary', signal, restart, options.language),
        );
        paper.append(seal, title, localized('p', 'academy-greeting-complete-line', COPY.completeLine, options.language), memories, actions);
        root.append(portrait, paper);
        body.append(root);
    };

    const modelAudioButton = (signal: AbortSignal): HTMLButtonElement => {
        const button = actionButton(COPY.hearRie, 'listen', signal, () => playModel(button, signal), options.language);
        button.dataset.audioTarget = 'rie-model';
        return button;
    };

    const modeSwitch = (signal: AbortSignal): HTMLButtonElement => actionButton(
        COPY.switchMode,
        'quiet',
        signal,
        async () => {
            capture?.cancel();
            capture = null;
            recording?.dispose();
            recording = null;
            selfCheckOpen = false;
            await apply({ kind: 'clear-mode' });
        },
        options.language,
    );

    const findChunk = (id: LessonZeroGreetingChunk['id']): LessonZeroGreetingChunk => {
        const chunk = options.definition.chunks.find(candidate => candidate.id === id);
        if (!chunk) throw new TypeError(`Greeting definition is missing ${id}.`);
        return chunk;
    };

    const chooseChunk = async (
        kind: 'select-chunk' | 'remove-chunk',
        chunkId: LessonZeroGreetingChunk['id'],
    ): Promise<void> => {
        arrangementMessage = null;
        await apply({ kind, chunkId });
    };

    const checkArrangement = async (): Promise<void> => {
        const before = state;
        const transition = transitionLessonZeroGreetingSession(
            options.definition,
            state,
            { kind: 'check-arrangement' },
            Date.now(),
        );
        arrangementMessage = transition.arrangementCorrect ? 'right' : 'wrong';
        await persist(before, transition);
        if (transition.arrangementCorrect) {
            live.textContent = COPY.orderRight[options.language];
        } else render();
    };

    const chooseMode = async (mode: LessonZeroGreetingMode): Promise<void> => {
        selfCheckOpen = false;
        recorderMessage = '';
        await apply({ kind: 'choose-mode', mode });
    };

    const startRecording = async (): Promise<void> => {
        if (busy || capture) return;
        recording?.dispose();
        recording = null;
        recorderMessage = '';
        try {
            capture = await recorder.start();
            const active = capture;
            render();
            void active.completion.then(take => {
                if (disposed || active !== capture) {
                    take?.dispose();
                    return;
                }
                capture = null;
                recording = take;
                selfCheckOpen = Boolean(take);
                render();
            });
        } catch {
            capture = null;
            recorderMessage = COPY.recorderUnavailable[options.language];
            render();
        }
    };

    const stopRecording = (): void => capture?.stop();

    const playModel = async (button: HTMLButtonElement, signal: AbortSignal): Promise<void> => {
        if (busy || disposed) return;
        playback?.dispose();
        playback = null;
        button.disabled = true;
        button.textContent = COPY.playing[options.language];
        try {
            const active = await playLearningVoiceBinding(
                options.pronunciation,
                'lesson-zero:greeting-rie-model',
                options.definition.model.japanese,
                signal,
            );
            if (!active) return;
            if (disposed) active.dispose();
            else playback = active;
        } catch {
            live.textContent = COPY.audioError[options.language];
        } finally {
            if (!disposed) {
                button.disabled = false;
                button.textContent = COPY.hearRie[options.language];
            }
        }
    };

    const apply = async (
        action: Parameters<typeof transitionLessonZeroGreetingSession>[2],
    ): Promise<void> => {
        if (busy) return;
        const before = state;
        const transition = transitionLessonZeroGreetingSession(options.definition, state, action, Date.now());
        await persist(before, transition);
    };

    const persist = async (
        before: LessonZeroGreetingSessionState,
        transition: LessonZeroGreetingSessionTransition,
    ): Promise<void> => {
        try {
            busy = true;
            screen.setAttribute('aria-busy', 'true');
            await options.onTransition(before, transition);
            state = transition.state;
            if (transition.evaluation) {
                recording?.dispose();
                recording = null;
                selfCheckOpen = false;
            }
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
        capture?.cancel();
        capture = null;
        if (state.status === 'active') {
            const before = state;
            const transition = transitionLessonZeroGreetingSession(
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
        capture?.cancel();
        capture = null;
        recording?.dispose();
        recording = null;
        arrangementMessage = null;
        selfCheckOpen = false;
        const fresh = startLessonZeroGreetingSession(options.definition);
        await options.onRestart(fresh);
        state = fresh;
        render();
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
            recorder.dispose();
            recording = null;
            capture = null;
        },
    };
}

function progressCopy(state: LessonZeroGreetingSessionState): LocalizedCopy {
    if (state.status === 'ready') return COPY.progressReady;
    if (state.status === 'complete') return COPY.progressComplete;
    return state.stage === 'arrange' ? COPY.progressArrange : COPY.progressRehearse;
}

function livingPaper(className: string): HTMLElement {
    const paper = element('div', `academy-greeting-paper ${className}`);
    paper.append(element('span', 'academy-greeting-paperclip'));
    return paper;
}

function speakerName(language: AcademyLanguage): HTMLElement {
    const name = element('strong', 'academy-greeting-speaker');
    name.textContent = language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    return name;
}

function phraseStrip(
    chunk: LessonZeroGreetingChunk,
    language: AcademyLanguage,
    selected: boolean,
): HTMLButtonElement {
    const button = element('button', 'academy-greeting-phrase');
    button.type = 'button';
    button.dataset.selected = String(selected);
    const japanese = element('span', 'academy-greeting-phrase-japanese');
    japanese.lang = 'ja';
    japanese.dataset.yomuRuntimeSurface = 'lesson-zero-greeting-instruction';
    japanese.dataset.yomuFuriganaMode = 'all';
    japanese.textContent = chunk.japanese;
    const meaning = element('span', 'academy-greeting-phrase-meaning');
    meaning.textContent = chunk.meaning[language];
    button.append(japanese, meaning);
    return button;
}

function checkRow(
    id: string,
    copy: Readonly<{ en: string; ja: string }>,
    language: AcademyLanguage,
): { readonly label: HTMLLabelElement; readonly input: HTMLInputElement } {
    const label = element('label', 'academy-greeting-check-row');
    const input = element('input');
    input.type = 'checkbox';
    input.name = id;
    const box = element('span', 'academy-greeting-check-box');
    box.setAttribute('aria-hidden', 'true');
    label.append(input, box, localized('span', 'academy-greeting-check-copy', copy, language));
    return { label, input };
}

function actionButton(
    copy: Readonly<{ en: string; ja: string }>,
    variant: 'primary' | 'secondary' | 'listen' | 'record' | 'quiet',
    signal: AbortSignal,
    action: () => void | Promise<void>,
    language: AcademyLanguage,
): HTMLButtonElement {
    const button = element('button', `academy-button academy-greeting-action academy-greeting-action-${variant}`);
    button.type = 'button';
    button.textContent = copy[language];
    button.setAttribute('aria-label', copy[language]);
    button.addEventListener('click', () => void action(), { signal });
    return button;
}

function riePortrait(className: string): HTMLImageElement {
    const portrait = element('img', className);
    portrait.src = ACADEMY_ASSETS.rie;
    portrait.alt = '';
    portrait.setAttribute('aria-hidden', 'true');
    return portrait;
}

function localized<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    copy: Readonly<{ en: string; ja: string }>,
    language: AcademyLanguage,
): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    node.lang = language;
    node.textContent = copy[language];
    if (language === 'ja') {
        node.dataset.yomuRuntimeSurface = 'lesson-zero-greeting-copy';
        node.dataset.yomuFuriganaMode = 'all';
    } else {
        node.dataset.jpdbReaderSurfaceIgnore = '';
    }
    return node;
}

async function notify(callback: () => void | Promise<void>): Promise<void> {
    await callback();
}
