import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import type { WorldPractice } from '../domain/world-locations';
import { completedWorldPracticeEvaluation } from '../domain/world-practice-evidence';
import { choiceToken, element } from './dom';

interface TubePlatformOptions {
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

/** Owns the Tube platform's one listening-first route decision. */
export function populateTubePlatform(options: TubePlatformOptions): void {
    const { host, language, practice } = options;
    const source = practice.source;
    if (!source) throw new TypeError(`Tube practice ${practice.id} requires permitted-source grounding.`);

    host.classList.add('academy-tube-route-board');
    host.dataset.tubeReplay = String(options.visitCount > 0);
    host.dataset.tubeMusicTheme = 'challenge.major';
    host.dataset.tubeSignalCue = 'radio.tune';
    host.dataset.sourceCorpus = source.primary.corpus;
    host.dataset.sourceId = source.primary.sourceId;
    host.setAttribute('aria-label', language === 'ja' ? '地下鉄のルート放送' : 'Tube route announcement');

    const masthead = element('div', 'academy-tube-masthead');
    const roundel = element('span', 'academy-tube-roundel');
    roundel.lang = 'ja';
    roundel.textContent = '地下鉄';
    const sourceCode = element('span', 'academy-tube-source-code');
    sourceCode.textContent = practice.sceneLabel?.[language] ?? 'A-46';
    masthead.append(roundel, sourceCode);

    const speaker = element('p', 'academy-world-action-speaker academy-tube-speaker');
    speaker.textContent = options.speaker;
    const title = element('h2', 'academy-world-section-title');
    title.textContent = options.activityLabel;
    const detail = element('p', 'academy-world-activity-detail');
    detail.textContent = options.activityDetail;

    const provenance = element('p', 'academy-tube-provenance');
    provenance.textContent = [source.primary, ...source.supports].map(reference => reference.label[language]).join(' / ');
    provenance.dataset.sourceRelation = source.primary.relation;

    host.append(masthead, speaker, title, detail, tubeListeningTask(options), provenance);
}

function tubeListeningTask(options: TubePlatformOptions): HTMLElement {
    const { language, practice } = options;
    const root = element('div', 'academy-world-practice academy-tube-listening-task');
    root.dataset.worldPractice = practice.id;
    root.dataset.tubeTask = 'usual-route';
    root.dataset.listeningState = 'ready';

    const instructionId = `academy-tube-instruction-${practice.id}`;
    const prompt = element('p', 'academy-world-practice-prompt academy-tube-prompt');
    prompt.id = instructionId;
    prompt.lang = language;
    prompt.textContent = practice.prompt[language];
    prompt.hidden = true;

    const listen = element('button', 'academy-world-listen academy-tube-listen');
    listen.type = 'button';
    listen.dataset.worldListen = practice.id;
    listen.dataset.tubePrimaryAction = 'listen';
    listen.setAttribute('aria-describedby', instructionId);
    setListenLabel(listen, language, false);

    const transcript = element('p', 'academy-world-transcript academy-tube-transcript');
    transcript.lang = 'ja';
    transcript.hidden = true;
    transcript.textContent = practice.audioLine;

    const status = element('p', 'academy-world-practice-status academy-tube-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const choices = element('div', 'academy-world-practice-options academy-tube-route-options');
    choices.hidden = true;
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', language === 'ja' ? '聞こえたルートを選ぶ' : 'Choose the route you heard');

    let completed = false;
    practice.choices.forEach((choice, index) => {
        const answer = element('button', 'academy-world-practice-option academy-tube-route-option');
        answer.type = 'button';
        answer.dataset.choiceId = choiceToken(index);
        const marker = element('span', 'academy-tube-route-marker');
        marker.setAttribute('aria-hidden', 'true');
        marker.textContent = String(index + 1).padStart(2, '0');
        const japanese = element('span', 'academy-world-practice-choice-ja');
        japanese.lang = 'ja';
        japanese.textContent = choice.label.ja;
        answer.append(marker, japanese);
        if (language === 'en') {
            const meaning = element('span', 'academy-world-practice-choice-support');
            meaning.textContent = choice.label.en;
            answer.append(meaning);
        }
        answer.addEventListener('click', () => {
            if (completed) return;
            if (choice.id !== practice.correctChoiceId) {
                root.dataset.routeStatus = 'retry';
                status.textContent = language === 'ja'
                    ? 'ストの日ではなく、「いつも」のルートをもう一度聞く。'
                    : 'Listen again for the usual route, not the strike-day journey.';
                listen.focus({ preventScroll: true });
                return;
            }
            completed = true;
            root.dataset.routeStatus = 'confirmed';
            root.dataset.practiceComplete = 'true';
            status.textContent = practice.success[language];
            choices.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
            options.onPracticeComplete?.(practice.id, options.stampId, completedWorldPracticeEvaluation(practice));
        });
        choices.append(answer);
    });

    listen.addEventListener('click', () => {
        root.dataset.listeningState = 'replay';
        prompt.hidden = false;
        transcript.hidden = false;
        choices.hidden = false;
        listen.dataset.tubePrimaryAction = 'replay';
        setListenLabel(listen, language, true);
        void (options.onListen?.(practice.audioLine) ?? Promise.resolve(false))
            .then(played => {
                if (completed) return;
                status.textContent = played
                    ? language === 'ja' ? 'ホームの放送を再生しています。' : 'Playing the platform announcement.'
                    : language === 'ja'
                        ? '音声を再生できません。表示を読んで続けてください。'
                        : 'Audio is unavailable. Read the display and continue.';
            })
            .catch(() => {
                if (!completed) status.textContent = language === 'ja'
                    ? '音声を再生できません。表示を読んで続けてください。'
                    : 'Audio is unavailable. Read the display and continue.';
            });
    });

    root.append(prompt, listen, transcript, status, choices);
    return root;
}

function setListenLabel(button: HTMLButtonElement, language: AcademyLanguage, replay: boolean): void {
    const label = replay
        ? language === 'ja' ? 'ルートをもう一度聞く' : 'Replay route'
        : language === 'ja' ? 'ルート放送を聞く' : 'Listen for the route';
    button.textContent = label;
    button.setAttribute('aria-label', label);
}
