import type { AcademyLanguage } from '../../reader/app/academy-copy';
import {
    startLessonZeroSoundSession,
    transitionLessonZeroSoundSession,
    type LessonZeroSoundDefinition,
    type LessonZeroSoundLine,
    type LessonZeroSoundSelection,
    type LessonZeroSoundSessionAction,
    type LessonZeroSoundSessionState,
    type LessonZeroSoundSessionTransition,
    type LessonZeroSoundSpeaker,
} from '../domain/lesson-zero-sound-session';
import { bindLessonZeroSoundPreCommitSurface } from '../domain/lesson-zero-sound-grounding';
import { academyBackgroundPicture, backButton, element } from './dom';

type LocalizedCopy = Readonly<{ en: string; ja: string }>;

export interface LessonZeroSoundScreenOptions {
    readonly language: AcademyLanguage;
    readonly definition: LessonZeroSoundDefinition;
    readonly initialState: LessonZeroSoundSessionState;
    readonly audioFactory?: (url: string) => HTMLAudioElement;
    readonly onTransition: (
        before: LessonZeroSoundSessionState,
        transition: LessonZeroSoundSessionTransition,
    ) => void | Promise<void>;
    readonly onRestart: (state: LessonZeroSoundSessionState) => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
    readonly onComplete: () => void | Promise<void>;
}

export interface LessonZeroSoundScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

const COPY = {
    eyebrow: { en: 'Introductions', ja: '自己紹介' },
    title: { en: 'Meet Xingyu and Mika', ja: 'シンユとミカ' },
    meetDirection: {
        en: 'Listen once. These are the two names you will need.',
        ja: '一度ずつ聞きましょう。この二人の名前を使います。',
    },
    meetCheck: { en: 'Now listen for their names', ja: '次は名前を聞き取る' },
    direction: {
        en: 'They will introduce each other. Play each line and choose the name you hear.',
        ja: '今度は二人がお互いを紹介します。一つずつ聞いて、聞こえた名前を選びましょう。',
    },
    noReading: { en: 'You only need the name.', ja: '名前だけ聞けば大丈夫です。' },
    voice: { en: 'Line', ja: '会話' },
    listen: { en: 'Listen', ja: '聞く' },
    replay: { en: 'Replay', ja: 'もう一度' },
    playing: { en: 'Playing…', ja: '再生中…' },
    choose: { en: 'Which name?', ja: 'どの名前？' },
    heard: { en: 'Heard', ja: '聞きました' },
    check: { en: 'Check the names', ja: '名前を確かめる' },
    repairEyebrow: { en: 'One more listen', ja: 'もう一度だけ' },
    repairTitle: { en: 'Listen to that name once more', ja: 'その名前をもう一度' },
    repairBody: {
        en: 'Replay the missed line, then choose that name again.',
        ja: '間違えた会話だけ聞いて、その名前をもう一度選びましょう。',
    },
    showLine: { en: 'Show the line', ja: '文を見る' },
    hideLine: { en: 'The line is now visible below.', ja: '下に文を表示しました。' },
    repaired: { en: 'Ready to try again', ja: 'もう一度できます' },
    retry: { en: 'Try that name again', ja: 'その名前をもう一度' },
    completeEyebrow: { en: 'Both names found', ja: '二人の名前を発見' },
    completeTitle: { en: 'You know their names', ja: '二人の名前が分かりました' },
    completeBody: {
        en: 'You recognized Xingyu and Mika in a new exchange.',
        ja: '別の会話でも、シンユとミカの名前を聞き取れました。',
    },
    assistedTitle: { en: 'We will hear them again', ja: 'あとでもう一度' },
    assistedBody: {
        en: 'Xingyu and Mika are in your review queue. You can keep moving.',
        ja: 'シンユとミカは復習に入りました。このまま先へ進めます。',
    },
    transcript: { en: 'What they said', ja: '二人が言ったこと' },
    continue: { en: 'Keep going', ja: '次へ' },
    again: { en: 'Listen again', ja: 'もう一度聞く' },
    audioError: {
        en: 'That voice did not play. Try the button once more.',
        ja: '音声を再生できませんでした。もう一度押してください。',
    },
    leave: { en: 'Save and return', ja: '保存して戻る' },
} as const;

export function createLessonZeroSoundScreen(
    options: LessonZeroSoundScreenOptions,
): LessonZeroSoundScreen {
    const lifecycle = new AbortController();
    let renderLifecycle = new AbortController();
    let state = options.initialState;
    let playback: HTMLAudioElement | null = null;
    let playingLineId = '';
    let message = '';
    let busy = false;
    let disposed = false;
    let lookupSettleTimer: number | undefined;

    const screen = element('section', 'academy-screen academy-sound-screen');
    screen.dataset.academyScreen = 'lesson-zero-sound';
    screen.dataset.activityId = options.definition.activityId;
    screen.append(academyBackgroundPicture('languageLab'));

    const shell = element('div', 'academy-sound-shell');
    const header = element('header', 'academy-sound-header');
    const back = backButton(options.language);
    back.classList.add('academy-sound-back');
    back.textContent = '←';
    back.title = back.getAttribute('aria-label') ?? '';
    back.addEventListener('click', () => void pauseAndLeave(), { signal: lifecycle.signal });
    const heading = element('div', 'academy-sound-heading');
    heading.append(
        localized('p', 'academy-sound-eyebrow', COPY.eyebrow, options.language),
        localized('h1', 'academy-sound-title', COPY.title, options.language),
    );
    header.append(back, heading);

    const stage = element('main', 'academy-sound-stage');
    const live = element('p', 'academy-sound-live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    shell.append(header, stage, live);
    screen.append(shell);

    const render = (): void => {
        renderLifecycle.abort();
        renderLifecycle = new AbortController();
        stage.replaceChildren();
        screen.dataset.sessionStage = state.stage;
        screen.dataset.sessionStatus = state.status;
        live.textContent = message;
        if (state.stage === 'complete') renderComplete(renderLifecycle.signal);
        else if (state.stage === 'repair') renderRepair(renderLifecycle.signal);
        else if (state.stage === 'meet') renderMeet(renderLifecycle.signal);
        else renderAttempt(renderLifecycle.signal);
    };

    const renderMeet = (signal: AbortSignal): void => {
        const paper = livingPaper('academy-sound-meet');
        paper.append(localized('p', 'academy-sound-direction', COPY.meetDirection, options.language));
        const roster = element('div', 'academy-sound-meet-roster');
        introductionLines().forEach((line, index) => {
            const speaker = speakerFor(line.targetSpeakerId);
            const row = element('section', 'academy-sound-meet-turn');
            row.dataset.lineId = line.id;
            const identity = element('div', 'academy-sound-meet-name');
            identity.append(
                textElement('strong', '', speaker.displayName),
                textElement('span', '', speaker.katakanaName),
            );
            row.append(
                textElement('span', 'academy-sound-turn-number', String(index + 1).padStart(2, '0')),
                identity,
                listenButton(line, index, signal),
            );
            if (state.heardLineIds.includes(line.id)) {
                const heard = element('div', 'academy-sound-meet-heard');
                heard.append(
                    japanesePhraseLine('academy-sound-transcript-ja', line.japanese),
                    textElement('p', 'academy-sound-transcript-en', line.meaning.en),
                );
                row.append(heard);
            }
            roster.append(row);
        });
        paper.append(roster);
        const begin = actionButton(COPY.meetCheck, 'primary', signal, () => apply({ kind: 'begin-check' }));
        begin.disabled = introductionLines().some(line => !state.heardLineIds.includes(line.id));
        paper.append(begin);
        stage.append(paper, speakerStage());
    };

    const renderAttempt = (signal: AbortSignal): void => {
        const paper = livingPaper('academy-sound-mission');
        bindLessonZeroSoundPreCommitSurface(paper, options.definition.contentRevision);
        const intro = element('div', 'academy-sound-intro');
        intro.append(
            localized('p', 'academy-sound-direction', COPY.direction, options.language),
            localized('p', 'academy-sound-no-reading', COPY.noReading, options.language),
        );
        paper.append(intro);
        const voices = element('div', 'academy-sound-voices');
        activeAttemptLines().forEach((line, index) => voices.append(voiceTurn(line, index, signal)));
        paper.append(voices);
        const check = actionButton(COPY.check, 'primary', signal, () => apply({ kind: 'check' }));
        check.disabled = busy || !attemptReady();
        paper.append(check);
        stage.append(paper, speakerStage());
    };

    const voiceTurn = (line: LessonZeroSoundLine, index: number, signal: AbortSignal): HTMLElement => {
        const turn = element('section', 'academy-sound-turn');
        turn.dataset.lineId = line.id;
        const rail = element('div', 'academy-sound-turn-rail');
        const number = textElement('span', 'academy-sound-turn-number', String(index + 1).padStart(2, '0'));
        const label = localized('h2', 'academy-sound-turn-title', COPY.voice, options.language);
        label.append(` ${index + 1}`);
        const listen = listenButton(line, index, signal);
        rail.append(number, label, listen);

        const choices = element('fieldset', 'academy-sound-choices');
        choices.disabled = busy || !state.heardLineIds.includes(line.id);
        choices.append(localized('legend', 'academy-sound-choice-legend', COPY.choose, options.language));
        for (const speaker of options.definition.speakers) {
            choices.append(speakerChoice(line, speaker, signal));
        }
        turn.append(rail, choices);
        return turn;
    };

    const speakerChoice = (
        line: LessonZeroSoundLine,
        speaker: LessonZeroSoundSpeaker,
        signal: AbortSignal,
    ): HTMLButtonElement => {
        const selected = selectedSpeaker(line.id) === speaker.id;
        const button = element('button', 'academy-sound-choice');
        button.type = 'button';
        button.dataset.speakerId = speaker.id;
        button.dataset.selected = String(selected);
        button.setAttribute('aria-pressed', String(selected));
        if (speaker.portraitUrl) {
            const portrait = document.createElement('img');
            portrait.className = 'academy-sound-choice-portrait';
            portrait.src = speaker.portraitUrl;
            portrait.alt = '';
            portrait.decoding = 'async';
            button.append(portrait);
        }
        const label = element('span', 'academy-sound-choice-label');
        label.append(
            textElement('strong', 'academy-sound-choice-name', speaker.displayName),
            textElement('span', 'academy-sound-choice-kana', speaker.katakanaName),
        );
        button.append(label);
        button.addEventListener('click', () => void apply({
            kind: 'select-speaker',
            lineId: line.id,
            speakerId: speaker.id,
        }), { signal });
        return button;
    };

    const renderRepair = (signal: AbortSignal): void => {
        const paper = livingPaper('academy-sound-repair');
        paper.append(
            localized('p', 'academy-sound-paper-eyebrow', COPY.repairEyebrow, options.language),
            localized('h2', 'academy-sound-paper-title', COPY.repairTitle, options.language),
            localized('p', 'academy-sound-paper-copy', COPY.repairBody, options.language),
        );
        const missed = state.attempts.at(-1)?.missedLineIds ?? [];
        const replayRail = element('div', 'academy-sound-repair-rail');
        for (const lineId of missed) {
            const line = options.definition.lines.find(candidate => candidate.id === lineId)!;
            const button = actionButton(COPY.replay, 'listen', signal, () => playLine(line, true));
            button.dataset.lineId = line.id;
            button.prepend(textElement('span', 'academy-sound-action-icon', '▶'));
            if (state.repairedLineIds.includes(line.id)) button.dataset.repaired = 'true';
            replayRail.append(button);
        }
        paper.append(replayRail);
        if (!state.modelRevealed) {
            paper.append(actionButton(COPY.showLine, 'quiet', signal, () => apply({ kind: 'reveal-model' })));
        } else {
            const transcript = element('section', 'academy-sound-model');
            transcript.append(localized('p', 'academy-sound-model-label', COPY.hideLine, options.language));
            for (const lineId of missed) transcript.append(transcriptLine(lineId));
            paper.append(transcript);
        }
        const retry = actionButton(COPY.retry, 'primary', signal, () => apply({ kind: 'retry' }));
        retry.disabled = missed.some(lineId => !state.repairedLineIds.includes(lineId));
        paper.append(retry);
        stage.append(paper, speakerStage());
    };

    const renderComplete = (signal: AbortSignal): void => {
        const paper = livingPaper('academy-sound-complete');
        const assisted = state.attempts.at(-1)?.outcome === 'lapse';
        paper.append(
            localized('p', 'academy-sound-paper-eyebrow', COPY.completeEyebrow, options.language),
            localized(
                'h2',
                'academy-sound-paper-title',
                assisted ? COPY.assistedTitle : COPY.completeTitle,
                options.language,
            ),
            localized(
                'p',
                'academy-sound-paper-copy',
                assisted ? COPY.assistedBody : COPY.completeBody,
                options.language,
            ),
            localized('h3', 'academy-sound-transcript-title', COPY.transcript, options.language),
        );
        const transcript = element('div', 'academy-sound-transcript');
        options.definition.lines.forEach(line => transcript.append(transcriptLine(line.id)));
        paper.append(transcript);
        const actions = element('div', 'academy-sound-complete-actions');
        actions.append(
            actionButton(COPY.continue, 'primary', signal, () => options.onComplete()),
            actionButton(COPY.again, 'quiet', signal, restart),
        );
        paper.append(actions);
        stage.append(paper, speakerStage());
    };

    const transcriptLine = (lineId: LessonZeroSoundLine['id']): HTMLElement => {
        const line = options.definition.lines.find(candidate => candidate.id === lineId)!;
        const speaker = speakerFor(line.speakerId);
        const row = element('article', 'academy-sound-transcript-line');
        row.append(
            textElement('strong', 'academy-sound-transcript-speaker', speaker.displayName),
            japanesePhraseLine('academy-sound-transcript-ja', line.japanese),
            textElement('p', 'academy-sound-transcript-en', line.meaning.en),
        );
        return row;
    };

    const speakerStage = (): HTMLElement => {
        const cast = element('aside', 'academy-sound-cast');
        cast.setAttribute('aria-label', options.language === 'ja' ? '今日の二人' : 'Today’s two voices');
        options.definition.speakers.forEach(speaker => {
            const figure = element('figure', 'academy-sound-speaker');
            figure.dataset.speakerId = speaker.id;
            figure.dataset.active = String(
                options.definition.lines.find(line => line.id === playingLineId)?.speakerId === speaker.id,
            );
            if (speaker.portraitUrl) {
                const image = document.createElement('img');
                image.src = speaker.portraitUrl;
                image.alt = '';
                image.decoding = 'async';
                figure.append(image);
            }
            const caption = document.createElement('figcaption');
            caption.append(
                textElement('strong', '', speaker.displayName),
                textElement('span', '', speaker.katakanaName),
            );
            figure.append(caption);
            cast.append(figure);
        });
        return cast;
    };

    const playLine = async (line: LessonZeroSoundLine, repair: boolean): Promise<void> => {
        stopPlayback();
        message = '';
        playingLineId = line.id;
        render();
        const audio = options.audioFactory?.(line.audioUrl) ?? new Audio(line.audioUrl);
        playback = audio;
        audio.preload = 'auto';
        const ended = (): void => {
            if (playback !== audio || disposed) return;
            playback = null;
            playingLineId = '';
            void apply(repair
                ? { kind: 'mark-repair-heard', lineId: line.id }
                : { kind: 'mark-heard', lineId: line.id });
        };
        audio.addEventListener('ended', ended, { once: true });
        try {
            await audio.play();
        } catch {
            if (playback === audio) playback = null;
            playingLineId = '';
            message = COPY.audioError[options.language];
            render();
        }
    };

    const apply = async (action: LessonZeroSoundSessionAction): Promise<void> => {
        if (busy || disposed) return;
        busy = true;
        const before = state;
        const transition = transitionLessonZeroSoundSession(options.definition, state, action, Date.now());
        state = transition.state;
        try {
            await options.onTransition(before, transition);
        } finally {
            busy = false;
            suppressLookupWhileLayoutSettles();
            render();
        }
    };

    const restart = async (): Promise<void> => {
        stopPlayback();
        state = startLessonZeroSoundSession(options.definition);
        message = '';
        await options.onRestart(state);
        suppressLookupWhileLayoutSettles();
        render();
    };

    const pauseAndLeave = async (): Promise<void> => {
        stopPlayback();
        if (state.status === 'active') await apply({ kind: 'pause' });
        await options.onBack();
    };

    const attemptReady = (): boolean => activeAttemptLines().every(line =>
        state.heardLineIds.includes(line.id)
        && state.selections.some(selection => selection.lineId === line.id));

    const selectedSpeaker = (lineId: LessonZeroSoundLine['id']): LessonZeroSoundSelection['speakerId'] | undefined =>
        state.selections.find(selection => selection.lineId === lineId)?.speakerId;

    const introductionLines = (): readonly LessonZeroSoundLine[] =>
        options.definition.lines.filter(line => line.phase === 'introduction');

    const checkLines = (): readonly LessonZeroSoundLine[] =>
        options.definition.lines.filter(line => line.phase === 'check');

    const activeAttemptLines = (): readonly LessonZeroSoundLine[] => {
        const missed = state.attempts.at(-1)?.outcome === 'lapse' && state.repairedLineIds.length > 0
            ? new Set(state.repairedLineIds)
            : null;
        return missed ? checkLines().filter(line => missed.has(line.id)) : checkLines();
    };

    const speakerFor = (speakerId: LessonZeroSoundSpeaker['id']): LessonZeroSoundSpeaker => {
        const speaker = options.definition.speakers.find(candidate => candidate.id === speakerId);
        if (!speaker) throw new TypeError(`Missing sound speaker ${speakerId}.`);
        return speaker;
    };

    const listenButton = (
        line: LessonZeroSoundLine,
        index: number,
        signal: AbortSignal,
    ): HTMLButtonElement => {
        const listen = element('button', 'academy-sound-listen');
        listen.type = 'button';
        const isPlaying = playingLineId === line.id;
        listen.dataset.playing = String(isPlaying);
        listen.setAttribute(
            'aria-label',
            `${COPY.listen[options.language]}: ${COPY.voice[options.language]} ${index + 1}`,
        );
        listen.innerHTML = `<span aria-hidden="true">${isPlaying ? '■' : '▶'}</span><span>${
            isPlaying
                ? COPY.playing[options.language]
                : state.heardLineIds.includes(line.id)
                    ? COPY.replay[options.language]
                    : COPY.listen[options.language]
        }</span>`;
        listen.addEventListener('click', () => void playLine(line, false), { signal });
        return listen;
    };

    const stopPlayback = (): void => {
        if (!playback) return;
        playback.pause();
        playback.currentTime = 0;
        playback = null;
        playingLineId = '';
    };

    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        if (lookupSettleTimer !== undefined) window.clearTimeout(lookupSettleTimer);
        stopPlayback();
        renderLifecycle.abort();
        lifecycle.abort();
    };

    const suppressLookupWhileLayoutSettles = (): void => {
        screen.dataset.jpdbReaderInteractionIgnore = 'true';
        if (lookupSettleTimer !== undefined) window.clearTimeout(lookupSettleTimer);
        lookupSettleTimer = window.setTimeout(() => {
            delete screen.dataset.jpdbReaderInteractionIgnore;
            lookupSettleTimer = undefined;
        }, 750);
    };

    render();
    return { element: screen, dispose };

    function livingPaper(className: string): HTMLElement {
        return element('section', `academy-sound-paper ${className}`);
    }

    function actionButton(
        copy: LocalizedCopy,
        kind: 'primary' | 'quiet' | 'listen',
        signal: AbortSignal,
        action: () => void | Promise<void>,
    ): HTMLButtonElement {
        const button = element('button', `academy-sound-action academy-sound-action--${kind}`);
        button.type = 'button';
        button.textContent = copy[options.language];
        button.addEventListener('click', () => void action(), { signal });
        return button;
    }
}

function localized<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    copy: LocalizedCopy,
    language: AcademyLanguage,
): HTMLElementTagNameMap[K] {
    const node = textElement(tag, className, copy[language]);
    node.lang = language;
    return node;
}

function japanesePhraseLine(className: string, text: string): HTMLParagraphElement {
    const node = element('p', className);
    const phrases = text.match(/[^。！？]+[。！？]+|[^。！？]+$/gu) ?? [text];
    for (const phrase of phrases) node.append(textElement('span', 'academy-sound-ja-phrase', phrase));
    return node;
}

function textElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text: string,
): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    node.textContent = text;
    return node;
}
