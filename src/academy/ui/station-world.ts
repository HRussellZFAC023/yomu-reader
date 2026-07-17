import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import type { WorldPractice } from '../domain/world-locations';
import { completedWorldPracticeEvaluation } from '../domain/world-practice-evidence';
import { choiceToken, element } from './dom';

interface StationAnnouncementOptions {
    readonly host: HTMLElement;
    readonly language: AcademyLanguage;
    readonly practice: WorldPractice;
    readonly visitCount: number;
    readonly speaker: string;
    readonly activityLabel: string;
    readonly activityDetail: string;
    readonly stampId: string;
    readonly onListen?: (line: string) => Promise<boolean>;
    readonly onPracticeComplete?: (practiceId: string, stampId: string, evaluation?: ActivityEvaluation) => void;
}

/** Owns the Station's single listen/replay loop inside the departure board. */
export function populateStationAnnouncement(options: StationAnnouncementOptions): void {
    const { host, language, practice } = options;
    host.classList.add('academy-world-station-board');
    host.dataset.stationEvent = practice.id;
    host.dataset.listeningState = 'ready';
    host.setAttribute('aria-label', language === 'ja' ? '駅のアナウンス' : 'Station announcement');

    const boardTopline = element('div', 'academy-world-station-task-header');
    const kicker = element('p', 'academy-world-station-task-kicker');
    kicker.textContent = language === 'ja' ? '今日の用事' : 'Today\'s mission';
    kicker.dataset.stationBoardMode = 'departures';
    const taskNumber = element('span', 'academy-world-station-task-number');
    taskNumber.textContent = String(options.visitCount % 3 + 1).padStart(2, '0');
    taskNumber.setAttribute('aria-hidden', 'true');
    boardTopline.append(kicker, taskNumber);

    const boardLabel = element('p', 'academy-world-station-board-label');
    boardLabel.textContent = practice.sceneLabel?.[language]
        ?? (language === 'ja' ? '駅のアナウンス' : 'Station announcement');
    boardLabel.lang = language;

    const speaker = element('p', 'academy-world-action-speaker');
    speaker.textContent = options.speaker;
    speaker.lang = language;
    const title = element('h2', 'academy-world-section-title');
    title.textContent = options.activityLabel;
    title.lang = language;
    const detail = element('p', 'academy-world-activity-detail');
    detail.textContent = options.activityDetail;
    detail.lang = language;

    host.append(boardTopline, boardLabel, speaker, title, detail, stationListeningTask(options));
}

function stationListeningTask(options: StationAnnouncementOptions): HTMLElement {
    const { language, practice } = options;
    const root = element('div', 'academy-world-practice academy-world-station-practice');
    root.dataset.worldPractice = practice.id;

    const instructionId = `academy-station-instruction-${practice.id}`;
    const prompt = element('p', 'academy-world-practice-prompt');
    prompt.id = instructionId;
    prompt.lang = 'ja';
    prompt.textContent = practice.prompt.ja;
    prompt.hidden = true;

    const support = element('p', 'academy-world-practice-support');
    support.textContent = practice.prompt[language];
    support.lang = language;
    support.hidden = true;

    const listen = element('button', 'academy-world-listen academy-station-primary-action');
    listen.type = 'button';
    listen.dataset.worldListen = practice.id;
    listen.dataset.stationPrimaryAction = 'listen';
    listen.setAttribute('aria-describedby', instructionId);
    setListenLabel(listen, language, false);

    const transcript = element('p', 'academy-world-transcript');
    transcript.lang = 'ja';
    transcript.hidden = true;
    transcript.textContent = practice.audioLine;

    const status = element('p', 'academy-world-practice-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const choices = element('div', 'academy-world-practice-options');
    choices.hidden = true;
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', language === 'ja' ? '答えを選ぶ' : 'Choose an answer');

    let completed = false;
    practice.choices.forEach((choice, index) => {
        const answer = element('button', 'academy-world-practice-option');
        answer.type = 'button';
        answer.dataset.choiceId = choiceToken(index);
        const japanese = element('span', 'academy-world-practice-choice-ja');
        japanese.lang = 'ja';
        japanese.textContent = choice.label.ja;
        answer.append(japanese);
        if (language === 'en') {
            const meaning = element('span', 'academy-world-practice-choice-support');
            meaning.textContent = choice.label.en;
            answer.append(meaning);
        }
        answer.addEventListener('click', () => {
            if (completed) return;
            if (choice.id !== practice.correctChoiceId) {
                status.textContent = language === 'ja'
                    ? 'もう一度聞いて、答えを選んでください。'
                    : 'Listen again, then choose another answer.';
                return;
            }
            completed = true;
            root.dataset.practiceComplete = 'true';
            status.textContent = practice.success[language];
            choices.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
            const evaluation = completedWorldPracticeEvaluation(practice);
            options.onPracticeComplete?.(practice.id, options.stampId, evaluation);
        });
        choices.append(answer);
    });

    listen.addEventListener('click', () => {
        const firstListen = hostListeningState(root) === 'ready';
        const board = root.closest<HTMLElement>('.academy-world-station-board');
        board?.setAttribute('data-listening-started', 'true');
        board?.setAttribute('data-listening-state', 'replay');
        prompt.hidden = false;
        support.hidden = language !== 'en';
        transcript.hidden = false;
        choices.hidden = false;
        listen.dataset.stationPrimaryAction = 'replay';
        setListenLabel(listen, language, true);
        if (firstListen) choices.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
        void (options.onListen?.(practice.audioLine) ?? Promise.resolve(false)).then(played => {
            if (completed) return;
            status.textContent = played
                ? language === 'ja' ? 'アナウンスを再生しています。' : 'Playing the announcement.'
                : language === 'ja'
                    ? '音声を再生できません。文字を読んで続けてください。'
                    : 'Speech is unavailable here. Use the transcript and continue.';
        });
    });

    root.append(prompt, support, listen, transcript, status, choices);
    return root;
}

function hostListeningState(root: HTMLElement): string | undefined {
    return root.closest<HTMLElement>('.academy-world-station-board')?.dataset.listeningState;
}

function setListenLabel(button: HTMLButtonElement, language: AcademyLanguage, replay: boolean): void {
    const label = replay
        ? language === 'ja' ? 'もう一度聞く' : 'Replay announcement'
        : language === 'ja' ? 'アナウンスを聞く' : 'Listen to announcement';
    button.textContent = label;
    button.setAttribute('aria-label', label);
}
