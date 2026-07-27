import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS, type AcademyPlateId } from '../assets';
import {
    createPrivatePracticeRecorder,
    type PrivatePracticeCapture,
    type PrivatePracticeRecorder,
    type PrivatePracticeRecording,
} from '../audio/private-practice-recorder';
import {
    evaluateLessonZeroMission,
    type LessonZeroMissionDefinition,
    type LessonZeroMissionResponse,
} from '../content/lesson-zero-mission-activity';
import { createKatakanaNameDraft } from '../content/learner-name';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import { academyBackgroundPicture, backButton, choiceToken, element } from './dom';

type Localized = Readonly<{ en: string; ja: string }>;

export interface LessonZeroMissionScreenOptions {
    readonly language: AcademyLanguage;
    readonly definition: LessonZeroMissionDefinition;
    readonly pronunciation: PronunciationService;
    readonly recorder?: PrivatePracticeRecorder;
    readonly onEvaluation: (
        evaluation: ActivityEvaluation,
        response: LessonZeroMissionResponse,
    ) => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
    readonly onComplete: () => void | Promise<void>;
}

export interface LessonZeroMissionScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

const TITLES: Readonly<Record<LessonZeroMissionDefinition['activity']['id'], Localized>> = {
    'activity:lesson-zero-text-input': { en: 'Fill the two gaps', ja: '二つの空欄' },
    'activity:lesson-zero-speaking-input': { en: 'Your turn in the room', ja: '教室で自分の番' },
    'activity:lesson-zero-read-name-cards': { en: 'Find it on the card', ja: '名札から見つける' },
    'activity:lesson-zero-write-name-card': { en: 'Your class card', ja: 'クラスの名札' },
    'activity:lesson-zero-sound-transfer': { en: 'Catch it, then ask again', ja: '聞いて、もう一度たずねる' },
    'activity:lesson-zero-text-transfer': { en: 'Leave one clear line', ja: '短い一文を残す' },
    'activity:lesson-zero-speaking-transfer': { en: 'Welcome the next person', ja: '次の人を迎える' },
    'activity:lesson-zero-written-transfer': { en: 'A note for later', ja: 'あとで来る人へのメモ' },
    'activity:lesson-zero-close-room': { en: 'Before you leave', ja: '教室を出る前に' },
};

const EYEBROWS: Readonly<Record<LessonZeroMissionDefinition['activity']['id'], Localized>> = {
    'activity:lesson-zero-text-input': { en: 'Sophie & Ruparna · Library', ja: 'ソフィーとルパルナ・図書室' },
    'activity:lesson-zero-speaking-input': { en: 'Aakash & Sam · Classroom', ja: 'アーカッシュとサム・教室' },
    'activity:lesson-zero-read-name-cards': { en: 'Rie · Name-card desk', ja: 'りえ先生・名札の机' },
    'activity:lesson-zero-write-name-card': { en: 'Rie · Name-card desk', ja: 'りえ先生・名札の机' },
    'activity:lesson-zero-sound-transfer': { en: 'Xingyu & Mika · Language lab', ja: 'シンユとミカ・語学室' },
    'activity:lesson-zero-text-transfer': { en: 'Sophie · Library note', ja: 'ソフィー・図書室のメモ' },
    'activity:lesson-zero-speaking-transfer': { en: 'Aakash & Sam · Classroom door', ja: 'アーカッシュとサム・教室の入口' },
    'activity:lesson-zero-written-transfer': { en: 'Rie · Late-arrival note', ja: 'りえ先生・あとで来る人へのメモ' },
    'activity:lesson-zero-close-room': { en: 'Rie · End of class', ja: 'りえ先生・授業のおわり' },
};

const CHECK_LABELS: Readonly<Record<string, Localized>> = {
    'responds-to-question': { en: 'I answered Aakash’s question.', ja: 'アーカッシュの質問に答えました。' },
    'repairs-if-needed': { en: 'I used もう一度お願いします if I needed another listen.', ja: '必要なら「もう一度お願いします」を使いました。' },
    'intelligible-name': { en: 'My name came clearly before です.', ja: '「です」の前に名前をはっきり言いました。' },
    'mora-timing': { en: 'I kept each beat of the model line.', ja: '見本の一拍ずつを保ちました。' },
    'repair-language': { en: 'I said もう一度お願いします.', ja: '「もう一度お願いします」と言いました。' },
    'listen-back-reflection': { en: 'I listened back, or checked the line once after speaking.', ja: '録音を聞くか、話したあとに一度確認しました。' },
    greeting: { en: 'I opened with はじめまして.', ja: '「はじめまして」で始めました。' },
    'true-introduction': { en: 'I gave the name I want classmates to use.', ja: 'クラスで使いたい名前を言いました。' },
    question: { en: 'I asked the next person’s name.', ja: '次の人の名前をたずねました。' },
    repair: { en: 'I knew how to ask for another listen.', ja: 'もう一度聞く言い方を使えました。' },
    closing: { en: 'I closed with よろしくお願いします.', ja: '「よろしくお願いします」で結びました。' },
};

const ACTIONS: readonly Readonly<{ id: string; label: Localized; detail: Localized }>[] = [
    { id: 'finish-or-break', label: { en: 'Take a short break', ja: '少し休む' }, detail: { en: 'Pause here and come back when you’re ready.', ja: 'ここまで保存して、準備ができたら戻ります。' } },
    { id: 'more-class', label: { en: 'Stay with the class', ja: 'クラスに残る' }, detail: { en: 'Practise today’s Japanese a little longer.', ja: '今日の日本語をもう少し練習します。' } },
    { id: 'another-lesson', label: { en: 'Open the next lesson', ja: '次のレッスンを開く' }, detail: { en: 'Keep going while it’s fresh.', ja: '覚えているうちに次へ進みます。' } },
    { id: 'explore', label: { en: 'Walk around campus', ja: '校内を歩く' }, detail: { en: 'See who is still nearby.', ja: '近くにいる人を探します。' } },
    { id: 'study', label: { en: 'Review at a desk', ja: '机で復習する' }, detail: { en: 'Practise the parts that need another go.', ja: 'もう一度やりたいところを練習します。' } },
    { id: 'end-day', label: { en: 'Head home', ja: '帰る' }, detail: { en: 'Finish for today. Your place is saved.', ja: '今日はここまで。続きは保存されます。' } },
];

export function createLessonZeroMissionScreen(
    options: LessonZeroMissionScreenOptions,
): LessonZeroMissionScreen {
    const lifecycle = new AbortController();
    let renderLifecycle = new AbortController();
    const recorder = options.recorder ?? createPrivatePracticeRecorder();
    let playback: Disposable | null = null;
    let authoredAudio: HTMLAudioElement | null = null;
    let capture: PrivatePracticeCapture | null = null;
    let recording: PrivatePracticeRecording | null = null;
    let performed = false;
    let attempted = false;
    let completed = false;
    let busy = false;
    let disposed = false;
    let feedback: ActivityEvaluation['result']['feedback'] | null = null;
    let particleValues: [string, string] = ['', ''];
    const selectedChecks = new Set<string>();
    const nameDraft = createKatakanaNameDraft(options.definition.learnerName);
    const lockedClassName = options.definition.lockedClassName?.trim() || null;
    let selectedCardName = lockedClassName ?? nameDraft.katakana ?? nameDraft.usualName;
    let editedKatakana = nameDraft.katakana ?? '';
    let nameEntryMode: 'ime' | 'katakana-choice' | 'usual-spelling' =
        selectedCardName === nameDraft.katakana ? 'katakana-choice' : 'usual-spelling';

    const screen = element('section', 'academy-screen academy-mission-screen');
    screen.dataset.academyScreen = 'lesson-zero-mission';
    screen.dataset.activityId = options.definition.activity.id;
    screen.dataset.responseMode = options.definition.activity.responseMode;
    screen.append(academyBackgroundPicture(plateFor(options.definition.activity.id)));

    const shell = element('div', 'academy-mission-shell');
    const header = element('header', 'academy-mission-header');
    const back = backButton(options.language);
    back.className = 'academy-mission-back';
    back.textContent = '←';
    back.title = localized({ en: 'Back', ja: '戻る' });
    back.addEventListener('click', () => void options.onBack(), { signal: lifecycle.signal });
    const heading = element('div', 'academy-mission-heading');
    heading.append(
        copyNode('p', 'academy-mission-eyebrow', EYEBROWS[options.definition.activity.id]),
        copyNode('h1', 'academy-mission-title', TITLES[options.definition.activity.id]),
    );
    const step = element('p', 'academy-mission-step');
    step.textContent = localized({ en: 'Day 1', ja: '1日目' });
    header.append(back, heading, step);

    const body = element('main', 'academy-mission-body');
    const live = element('p', 'academy-mission-live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    shell.append(header, body, live);
    screen.append(shell);

    const render = (): void => {
        renderLifecycle.abort();
        renderLifecycle = new AbortController();
        body.replaceChildren();
        screen.dataset.attempted = String(attempted);
        screen.dataset.complete = String(completed);
        const stage = element('section', 'academy-mission-stage');
        const portrait = portraitFor(options.definition.activity.id);
        const paper = element('section', 'academy-mission-paper');
        paper.append(element('span', 'academy-mission-paperclip'));
        if (completed) renderComplete(paper, renderLifecycle.signal);
        else renderActivity(paper, renderLifecycle.signal);
        if (portrait) stage.append(portrait);
        stage.append(paper);
        body.append(stage);
    };

    const renderActivity = (paper: HTMLElement, signal: AbortSignal): void => {
        paper.append(
            copyNode('strong', 'academy-mission-speaker', hostFor(options.definition.activity.id)),
            copyNode('p', 'academy-mission-prompt', options.definition.activity.prompt),
        );
        switch (options.definition.activity.id) {
            case 'activity:lesson-zero-text-input':
                paper.append(renderParticleTask(signal));
                break;
            case 'activity:lesson-zero-read-name-cards':
                paper.append(renderNameCardReading(signal));
                break;
            case 'activity:lesson-zero-write-name-card':
            case 'activity:lesson-zero-text-transfer':
            case 'activity:lesson-zero-written-transfer':
                paper.append(renderWritingTask(signal));
                break;
            case 'activity:lesson-zero-speaking-input':
            case 'activity:lesson-zero-sound-transfer':
            case 'activity:lesson-zero-speaking-transfer':
                paper.append(renderSpeakingTask(signal));
                break;
            case 'activity:lesson-zero-close-room':
                paper.append(renderRoomChoice(signal));
                break;
        }
        if (feedback) paper.append(feedbackBlock(feedback, signal));
    };

    const renderParticleTask = (signal: AbortSignal): HTMLElement => {
        const root = element('section', 'academy-mission-particle-task');
        root.append(copyNode('p', 'academy-mission-help', {
            en: 'Read each side. Pick one word for each gap.',
            ja: '前後のことばを見て、空欄に一つずつ入れましょう。',
        }));
        if (attempted && options.definition.audioUrl) {
            root.append(authoredAudioButton(
                { en: 'Hear Sophie and Ruparna', ja: 'ソフィーとルパルナを聞く' },
                signal,
            ));
        }
        const lines = [
            { before: 'これは', name: ['ソフィー', 'Sophie'], afterName: '', after: '名札です。' },
            { before: '', name: ['ルパルナ', 'Ruparna'], afterName: 'です。わたし', after: '日本語を勉強しています。' },
        ] as const;
        lines.forEach((line, slot) => {
            const row = element('div', 'academy-mission-particle-row');
            if (line.before) row.append(japanese(line.before));
            row.append(nameBridge(line.name[0], line.name[1]));
            if (line.afterName) row.append(japanese(line.afterName));
            row.append(particleSlot(slot), japanese(line.after));
            root.append(row);
        });
        const bank = element('div', 'academy-mission-particle-bank');
        bank.setAttribute('role', 'group');
        bank.setAttribute('aria-label', localized({ en: 'Particle choices', ja: '助詞の選択肢' }));
        ['も', 'を', 'の', 'は'].forEach((value, index) => {
            const button = actionButton({ en: value, ja: value }, 'choice', signal, () => {
                const slot = particleValues[0] ? 1 : 0;
                particleValues[slot] = value;
                feedback = null;
                render();
            });
            button.dataset.choiceToken = choiceToken(index);
            button.disabled = particleValues.every(Boolean);
            bank.append(button);
        });
        const reset = actionButton({ en: 'Clear', ja: 'やり直す' }, 'quiet', signal, () => {
            particleValues = ['', ''];
            feedback = null;
            render();
        });
        const check = actionButton({ en: 'Check', ja: '確認する' }, 'primary', signal, () => submit({
            kind: 'particle-links',
            values: particleValues,
        }));
        check.disabled = !particleValues.every(Boolean);
        const actions = element('div', 'academy-mission-actions');
        actions.append(bank, reset, check);
        root.append(actions);
        return root;
    };

    const particleSlot = (slot: number): HTMLButtonElement => {
        const button = element('button', 'academy-mission-particle-slot');
        button.type = 'button';
        button.textContent = particleValues[slot] || '＿';
        button.setAttribute('aria-label', particleValues[slot]
            ? localized({ en: `Remove ${particleValues[slot]}`, ja: `${particleValues[slot]}を外す` })
            : localized({ en: `Empty gap ${slot + 1}`, ja: `空欄${slot + 1}` }));
        button.addEventListener('click', () => {
            particleValues[slot] = '';
            feedback = null;
            render();
        }, { signal: renderLifecycle.signal });
        return button;
    };

    const renderNameCardReading = (signal: AbortSignal): HTMLElement => {
        const root = element('section', 'academy-mission-card-reading');
        root.append(copyNode('p', 'academy-mission-question', {
            en: 'Rie asks: “Who says they study Japanese too?” Find the line with も.',
            ja: 'りえ先生：「『わたしも』と言っているのはだれですか。」',
        }));
        const cards = element('div', 'academy-mission-name-cards');
        const rows = [
            { personId: 'sophie', name: 'Sophie', lineId: 'line:lesson-zero-text-sophie', line: '日本語を勉強しています。' },
            { personId: 'ruparna', name: 'Ruparna', lineId: 'line:lesson-zero-text-ruparna', line: 'わたしも日本語を勉強しています。' },
        ] as const;
        rows.forEach((row, index) => {
            const card = element('button', 'academy-mission-name-card');
            card.type = 'button';
            card.dataset.choiceToken = choiceToken(index);
            card.append(
                textNode(row.name, 'academy-mission-card-name'),
                japanese(`${row.name}です。`),
                japanese(row.line),
                copyNode('span', 'academy-mission-card-action', { en: 'Use this line →', ja: 'この文を使う →' }),
            );
            card.addEventListener('click', () => void submit({
                kind: 'name-card-evidence',
                personId: row.personId,
                lineId: row.lineId,
            }), { signal });
            cards.append(card);
        });
        root.append(cards);
        return root;
    };

    const renderWritingTask = (signal: AbortSignal): HTMLElement => {
        if (options.definition.activity.id === 'activity:lesson-zero-write-name-card') {
            return renderNameCardWriting(signal);
        }
        const root = element('form', 'academy-mission-writing');
        const id = options.definition.activity.id;
        const label = copyNode('label', 'academy-mission-writing-label', { en: 'Your line', ja: 'あなたの一文' });
        label.htmlFor = 'academy-mission-writing-input';
        const input = element('textarea', 'academy-mission-writing-input');
        input.id = 'academy-mission-writing-input';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.rows = 4;
        input.maxLength = 180;
        input.placeholder = id === 'activity:lesson-zero-written-transfer'
            ? localized({ en: 'はじめまして。…です。…', ja: 'はじめまして。…です。…' })
            : localized({ en: 'A short Japanese sentence', ja: '短い日本語の文' });
        root.append(label, input);
        if (attempted) {
            if (options.definition.audioUrl) {
                root.append(authoredAudioButton(
                    { en: 'Hear the class note', ja: 'クラスのメモを聞く' },
                    signal,
                ));
            }
            root.append(writingPattern(id));
        }
        const send = actionButton({ en: 'Leave the line', ja: '一文を残す' }, 'primary', signal, () => undefined);
        send.type = 'submit';
        root.append(send);
        root.addEventListener('submit', event => {
            event.preventDefault();
            void submit({ kind: 'written', text: input.value.trim() });
        }, { signal });
        return root;
    };

    const renderNameCardWriting = (signal: AbortSignal): HTMLElement => {
        const root = element('form', 'academy-mission-writing academy-mission-name-writing');
        if (lockedClassName) {
            root.append(
                copyNode('p', 'academy-mission-help academy-mission-name-help', {
                    en: 'Rie kept the name from your first card.',
                    ja: 'りえ先生が最初の名札の名前を残してくれました。',
                }),
                japaneseOrText(lockedClassName, 'academy-mission-name-saved'),
            );
            if (nameDraft.katakana === lockedClassName) {
                root.append(actionButton(
                    { en: `Hear ${lockedClassName}`, ja: `${lockedClassName}を聞く` },
                    'listen',
                    signal,
                    () => playPhrase(lockedClassName, lockedClassName),
                ));
            }
            const preview = element('p', 'academy-mission-writing-preview');
            syncNamePreview(preview);
            const send = actionButton(
                { en: 'Put the card on the desk', ja: '名札を机に置く' },
                'primary',
                signal,
                () => undefined,
            );
            send.type = 'submit';
            root.append(preview, send);
            root.addEventListener('submit', event => {
                event.preventDefault();
                void submit({
                    kind: 'written',
                    text: `${selectedCardName}です。`,
                    entryMode: nameEntryMode,
                });
            }, { signal });
            return root;
        }
        root.append(copyNode('p', 'academy-mission-help academy-mission-name-help', nameDraft.katakana
            ? {
                en: 'You do not need to read katakana yet. Start by listening.',
                ja: 'まだカタカナを読めなくても大丈夫です。まず聞いてみましょう。',
            }
            : {
                en: 'You chose the name already. Keep your usual spelling now; you can add katakana when you know the sound you want.',
                ja: '名前はもう決まっています。今はいつものつづりで大丈夫です。カタカナはあとで足せます。',
            }));

        const comparison = element('div', 'academy-mission-name-comparison');
        comparison.append(
            textNode(nameDraft.usualName, 'academy-mission-name-usual'),
            textNode('→', 'academy-mission-name-arrow'),
            nameDraft.katakana
                ? plainJapanese(nameDraft.katakana)
                : copyNode('span', 'academy-mission-name-pending', { en: 'katakana later', ja: 'カタカナはあとで' }),
        );
        root.append(comparison);

        if (nameDraft.katakana) {
            root.append(actionButton(
                { en: `Hear ${nameDraft.katakana}`, ja: `${nameDraft.katakana}を聞く` },
                'listen',
                signal,
                () => playPhrase(nameDraft.katakana!, nameDraft.katakana!),
            ));
        }

        const choices = element('fieldset', 'academy-mission-name-choices');
        choices.append(copyNode('legend', 'academy-mission-writing-label', {
            en: 'Put one version on the card',
            ja: '名札に書くつづり',
        }));
        if (nameDraft.katakana) {
            choices.append(nameChoice(
                nameDraft.katakana,
                { en: 'Use Rie’s katakana draft', ja: 'りえ先生のカタカナ案を使う' },
                signal,
            ));
        }
        if (nameDraft.usualName !== nameDraft.katakana) {
            choices.append(nameChoice(
                nameDraft.usualName,
                { en: 'Keep my usual spelling', ja: 'いつものつづりを使う' },
                signal,
            ));
        }
        root.append(choices);

        const edit = element('details', 'academy-mission-name-edit');
        const summary = copyNode('summary', '', { en: 'Adjust the katakana', ja: 'カタカナを直す' });
        const label = copyNode('label', 'academy-mission-writing-label', {
            en: 'Katakana on the card',
            ja: '名札のカタカナ',
        });
        label.htmlFor = 'academy-mission-writing-input';
        const input = element('input', 'academy-mission-writing-input');
        input.id = 'academy-mission-writing-input';
        input.type = 'text';
        input.inputMode = 'text';
        input.maxLength = 40;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.value = editedKatakana;
        input.placeholder = localized({ en: 'Katakana, if you want to change it', ja: '直したいカタカナ' });
        input.addEventListener('input', () => {
            editedKatakana = input.value.trim();
            if (editedKatakana) {
                selectedCardName = editedKatakana;
                nameEntryMode = 'ime';
            }
            syncNamePreview(preview);
        }, { signal });
        edit.append(summary, label, input);
        root.append(edit);

        const preview = element('p', 'academy-mission-writing-preview');
        syncNamePreview(preview);
        root.append(
            preview,
            copyNode('p', 'academy-mission-name-note', {
                en: 'You can change this later.',
                ja: 'あとで変えられます。',
            }),
        );
        const send = actionButton({ en: 'Put it on the desk', ja: '机に置く' }, 'primary', signal, () => undefined);
        send.type = 'submit';
        root.append(send);
        root.addEventListener('submit', event => {
            event.preventDefault();
            void submit({
                kind: 'written',
                text: `${selectedCardName}です。`,
                entryMode: nameEntryMode,
            });
        }, { signal });
        return root;
    };

    const nameChoice = (
        value: string,
        labelCopy: Localized,
        signal: AbortSignal,
    ): HTMLLabelElement => {
        const label = element('label', 'academy-mission-name-choice');
        const input = element('input');
        input.type = 'radio';
        input.name = 'academy-name-script';
        input.value = value;
        input.checked = selectedCardName === value;
        input.addEventListener('change', () => {
            if (!input.checked) return;
            selectedCardName = value;
            nameEntryMode = value === nameDraft.katakana ? 'katakana-choice' : 'usual-spelling';
            const preview = label.closest('form')?.querySelector<HTMLElement>('.academy-mission-writing-preview');
            if (preview) syncNamePreview(preview);
        }, { signal });
        label.append(
            input,
            copyNode('span', 'academy-mission-name-choice-label', labelCopy),
            value === nameDraft.katakana ? plainJapanese(value) : textNode(value),
        );
        return label;
    };

    const syncNamePreview = (preview: HTMLElement): void => {
        preview.replaceChildren(plainJapanese(`${selectedCardName || nameDraft.usualName}です。`));
    };

    const renderSpeakingTask = (signal: AbortSignal): HTMLElement => {
        const root = element('section', 'academy-mission-speaking');
        root.append(copyNode('p', 'academy-mission-help', speakingSetup(options.definition.activity.id)));
        if (options.definition.audioUrl) {
            root.append(authoredAudioButton(
                { en: 'Hear the exchange', ja: '会話を聞く' },
                signal,
            ));
        } else {
            root.append(actionButton({ en: 'Hear the key line', ja: '大事な文を聞く' }, 'listen', signal, playKeyLine));
        }
        if (attempted) root.append(transcriptReveal());
        if (!performed && !capture && !recording) {
            const modes = element('div', 'academy-mission-speaking-modes');
            if (recorder.supported) {
                modes.append(actionButton({ en: 'Record privately', ja: '端末だけで録音する' }, 'record', signal, startRecording));
            }
            modes.append(actionButton({ en: 'Speak without recording', ja: '録音せずに話す' }, 'primary', signal, () => {
                performed = true;
                render();
            }));
            root.append(modes, copyNode('p', 'academy-mission-privacy', {
                en: 'Private takes stay in memory and disappear when you leave this screen.',
                ja: '録音はこの画面のメモリだけに残り、画面を出ると消えます。',
            }));
        } else if (capture) {
            root.append(
                copyNode('p', 'academy-mission-recording-status', { en: 'Recording…', ja: '録音中…' }),
                actionButton({ en: 'Stop', ja: '止める' }, 'record', signal, () => capture?.stop()),
            );
        } else if (recording) {
            const audio = element('audio', 'academy-mission-take');
            audio.controls = true;
            audio.preload = 'metadata';
            audio.src = recording.url;
            root.append(
                copyNode('p', 'academy-mission-take-label', { en: 'Your take', ja: 'あなたの録音' }),
                audio,
                actionButton({ en: 'Another take', ja: 'もう一度録音する' }, 'quiet', signal, startRecording),
            );
        }
        if (performed || recording) root.append(selfCheck(signal));
        return root;
    };

    const selfCheck = (signal: AbortSignal): HTMLElement => {
        const fieldset = element('fieldset', 'academy-mission-self-check');
        fieldset.append(copyNode('legend', 'academy-mission-self-check-title', { en: 'Check your turn', ja: '自分の番を確認する' }));
        for (const id of options.definition.activity.expectedEvidence.rubricIds ?? []) {
            const label = element('label', 'academy-mission-check');
            const input = element('input');
            input.type = 'checkbox';
            input.checked = selectedChecks.has(id);
            input.addEventListener('change', () => {
                if (input.checked) selectedChecks.add(id);
                else selectedChecks.delete(id);
            }, { signal });
            label.append(input, copyNode('span', '', CHECK_LABELS[id] ?? { en: id, ja: id }));
            fieldset.append(label);
        }
        fieldset.append(actionButton({ en: 'Keep this turn', ja: 'この番を残す' }, 'primary', signal, () => submit({
            kind: 'spoken',
            performed: performed || Boolean(recording),
            checkIds: [...selectedChecks],
            recorded: Boolean(recording),
        })));
        return fieldset;
    };

    const renderRoomChoice = (signal: AbortSignal): HTMLElement => {
        const root = element('section', 'academy-mission-room-choice');
        root.append(
            actionButton({ en: 'Hear Rie', ja: 'りえ先生を聞く' }, 'listen', signal, () => playPhrase('おわりましょう。', 'おわりましょう')),
            copyNode('p', 'academy-mission-question', { en: 'Class is over. What would you like to do?', ja: '授業が終わりました。次に何をしますか。' }),
        );
        const choices = element('div', 'academy-mission-room-actions');
        ACTIONS.forEach((action, index) => {
            const button = element('button', 'academy-mission-room-action');
            button.type = 'button';
            button.dataset.choiceToken = choiceToken(index);
            button.append(copyNode('strong', '', action.label), copyNode('span', '', action.detail));
            button.addEventListener('click', () => void submit({ kind: 'room-action', actionId: action.id }), { signal });
            choices.append(button);
        });
        root.append(choices);
        return root;
    };

    const renderComplete = (paper: HTMLElement, signal: AbortSignal): void => {
        paper.dataset.outcome = 'pass';
        paper.append(
            copyNode('strong', 'academy-mission-speaker', hostFor(options.definition.activity.id)),
            copyNode('h2', 'academy-mission-complete-title', { en: 'Done.', ja: 'できました。' }),
            copyNode('p', 'academy-mission-complete-copy', feedback?.explanation ?? {
                en: 'Ready when you are.',
                ja: '準備ができたら戻りましょう。',
            }),
        );
        if (options.definition.audioUrl) {
            paper.append(authoredAudioButton(
                { en: 'Hear it again', ja: 'もう一度聞く' },
                signal,
            ));
        }
        paper.append(actionButton(
            { en: 'Back to the story', ja: '物語に戻る' },
            'primary',
            signal,
            options.onComplete,
        ));
    };

    const feedbackBlock = (
        value: ActivityEvaluation['result']['feedback'],
        signal: AbortSignal,
    ): HTMLElement => {
        const block = element('section', 'academy-mission-feedback');
        block.dataset.outcome = 'lapse';
        block.setAttribute('role', 'status');
        block.append(copyNode('strong', '', value.explanation));
        if (value.repairPrompt) block.append(copyNode('p', '', value.repairPrompt));
        block.append(actionButton({ en: 'Try again', ja: 'もう一度' }, 'quiet', signal, () => {
            feedback = null;
            render();
        }));
        return block;
    };

    const submit = async (response: LessonZeroMissionResponse): Promise<void> => {
        if (busy || disposed) return;
        busy = true;
        screen.setAttribute('aria-busy', 'true');
        try {
            const evaluation = evaluateLessonZeroMission(options.definition, response);
            await options.onEvaluation(evaluation, response);
            attempted = true;
            feedback = evaluation.result.feedback;
            completed = evaluation.result.outcome === 'pass';
            live.textContent = feedback.explanation[options.language];
            render();
        } catch (error) {
            console.error('Lesson Zero mission evidence did not save.', error);
            live.textContent = localized({ en: 'That did not save. Try once more.', ja: '保存できませんでした。もう一度お試しください。' });
        } finally {
            busy = false;
            screen.removeAttribute('aria-busy');
        }
    };

    const startRecording = async (): Promise<void> => {
        if (busy || disposed) return;
        try {
            recording?.dispose();
            recording = null;
            capture = await recorder.start();
            performed = true;
            render();
            const take = await capture.completion;
            capture = null;
            if (disposed) take?.dispose();
            else {
                recording = take;
                render();
            }
        } catch {
            capture = null;
            live.textContent = localized({ en: 'The microphone is unavailable. You can speak without recording.', ja: 'マイクを使えません。録音せずに話せます。' });
            render();
        }
    };

    const playKeyLine = (): Promise<void> => {
        const id = options.definition.activity.id;
        if (id === 'activity:lesson-zero-sound-transfer') {
            return playPhrase('もう一度お願いします。', 'もういちどおねがいします');
        }
        return playPhrase('お名前は何ですか。', 'おなまえはなんですか');
    };

    const playPhrase = async (term: string, reading: string): Promise<void> => {
        stopAuthoredAudio();
        playback?.dispose();
        playback = await options.pronunciation.play(term, reading);
    };

    const authoredAudioButton = (
        label: Localized,
        signal: AbortSignal,
    ): HTMLButtonElement => actionButton(label, 'listen', signal, async () => {
        playback?.dispose();
        playback = null;
        stopAuthoredAudio();
        authoredAudio = new Audio(options.definition.audioUrl);
        authoredAudio.preload = 'auto';
        authoredAudio.addEventListener('playing', () => {
            live.textContent = localized({ en: 'Listen for the turn.', ja: '会話の流れを聞きましょう。' });
        }, { signal });
        authoredAudio.addEventListener('ended', () => {
            live.textContent = localized({ en: 'Now take your turn.', ja: '次はあなたの番です。' });
        }, { signal });
        await authoredAudio.play();
    });

    const stopAuthoredAudio = (): void => {
        if (!authoredAudio) return;
        authoredAudio.pause();
        authoredAudio.removeAttribute('src');
        authoredAudio.load();
        authoredAudio = null;
    };

    render();
    return {
        element: screen,
        dispose() {
            if (disposed) return;
            disposed = true;
            lifecycle.abort();
            renderLifecycle.abort();
            stopAuthoredAudio();
            playback?.dispose();
            recording?.dispose();
            capture?.cancel();
            recorder.dispose();
        },
    };

    function localized(value: Localized): string {
        return value[options.language];
    }

    function copyNode<K extends keyof HTMLElementTagNameMap>(
        tag: K,
        className: string,
        value: Localized,
    ): HTMLElementTagNameMap[K] {
        const node = element(tag, className);
        node.textContent = localized(value);
        node.lang = options.language;
        if (options.language === 'ja') {
            node.dataset.yomuRuntimeSurface = 'lesson-zero-mission-copy';
            node.dataset.yomuFuriganaMode = 'all';
        } else {
            node.dataset.jpdbReaderSurfaceIgnore = '';
        }
        return node;
    }

    function japanese(value: string): HTMLElement {
        const node = element('span', 'academy-mission-japanese');
        node.lang = 'ja';
        node.dataset.yomuRuntimeSurface = 'lesson-zero-mission-japanese';
        node.dataset.yomuFuriganaMode = 'all';
        node.textContent = value;
        return node;
    }

    function nameBridge(katakana: string, latin: string): HTMLElement {
        const node = element('span', 'academy-mission-name-bridge');
        node.append(japanese(katakana), textNode(latin, 'academy-mission-name-reading'));
        return node;
    }

    function plainJapanese(value: string, className = 'academy-mission-japanese'): HTMLElement {
        const node = element('span', className);
        node.lang = 'ja';
        node.dataset.jpdbReaderSurfaceIgnore = '';
        node.textContent = value;
        return node;
    }

    function japaneseOrText(value: string, className: string): HTMLElement {
        return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value)
            ? plainJapanese(value, className)
            : textNode(value, className);
    }

    function textNode(value: string, className = ''): HTMLElement {
        const node = element('span', className);
        node.textContent = value;
        node.dataset.jpdbReaderSurfaceIgnore = '';
        return node;
    }

    function actionButton(
        copy: Localized,
        variant: 'primary' | 'quiet' | 'choice' | 'listen' | 'record',
        signal: AbortSignal,
        action: () => void | Promise<void>,
    ): HTMLButtonElement {
        const button = element('button', `academy-mission-action academy-mission-action-${variant}`);
        button.type = 'button';
        button.textContent = localized(copy);
        button.setAttribute('aria-label', localized(copy));
        button.dataset.jpdbReaderSurfaceIgnore = '';
        button.addEventListener('click', () => void action(), { signal });
        return button;
    }

    function writingPattern(id: LessonZeroMissionDefinition['activity']['id']): HTMLElement {
        const root = element('section', 'academy-mission-pattern');
        if (id === 'activity:lesson-zero-written-transfer') {
            root.append(japanese('はじめまして。＿＿です。よろしくお願いします。'));
        } else {
            root.append(japanese('＿＿も＿＿です。'), japanese('＿＿の＿＿です。'));
        }
        return root;
    }

    function transcriptReveal(): HTMLElement {
        const root = element('details', 'academy-mission-transcript');
        root.open = true;
        root.append(copyNode('summary', '', { en: 'Exchange', ja: '会話' }));
        options.definition.script?.lines.forEach(line => {
            const row = element('p');
            row.append(textNode(`${line.speakerId}: `), japanese(line.japanese));
            root.append(row);
        });
        return root;
    }
}

function plateFor(id: LessonZeroMissionDefinition['activity']['id']): AcademyPlateId {
    if (id.includes('text') || id.includes('name-card') || id.includes('written')) return 'library';
    if (id.includes('sound')) return 'languageLab';
    return 'classroom';
}

function portraitFor(id: LessonZeroMissionDefinition['activity']['id']): HTMLImageElement | null {
    let source: string | undefined;
    let alt = '';
    if (id.includes('text')) {
        source = ACADEMY_ASSETS.characters.approved.sophie;
        alt = 'Sophie';
    } else if (id.includes('speaking')) {
        source = ACADEMY_ASSETS.characters.approved.aakash;
        alt = 'Aakash';
    } else if (id.includes('sound')) {
        source = ACADEMY_ASSETS.characters.approved.mika;
        alt = 'Mika';
    } else {
        source = ACADEMY_ASSETS.characters.approved.rie;
        alt = 'Rie-sensei';
    }
    const image = element('img', 'academy-mission-portrait');
    image.src = source;
    image.alt = alt;
    return image;
}

function hostFor(id: LessonZeroMissionDefinition['activity']['id']): Localized {
    if (id.includes('text')) return { en: 'Sophie', ja: 'ソフィー' };
    if (id.includes('speaking')) return { en: 'Aakash', ja: 'アーカッシュ' };
    if (id.includes('sound')) return { en: 'Mika', ja: 'ミカ' };
    return { en: 'Rie-sensei', ja: 'りえ先生' };
}

function speakingSetup(id: LessonZeroMissionDefinition['activity']['id']): Localized {
    if (id === 'activity:lesson-zero-sound-transfer') {
        return {
            en: 'Shadow one introduction. Then use もう一度お願いします to ask for the part you missed.',
            ja: '自己紹介を一つまねしてから、「もう一度お願いします」と言いましょう。',
        };
    }
    if (id === 'activity:lesson-zero-speaking-transfer') {
        return {
            en: 'Greet the next person, give your name, ask theirs, and keep もう一度お願いします ready.',
            ja: '次の人にあいさつし、名前を言って、相手の名前をたずねましょう。',
        };
    }
    return {
        en: 'Listen first. When Aakash asks your name, say your name followed by “desu”.',
        ja: 'アーカッシュとサムを聞いて、質問のあとに「名前＋です」で答えましょう。',
    };
}
