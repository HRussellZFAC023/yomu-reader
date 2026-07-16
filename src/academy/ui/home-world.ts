import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import type { WorldArrivalDialogue, WorldPractice } from '../domain/world-locations';
import { completedWorldPracticeEvaluation } from '../domain/world-practice-evidence';
import { displayWorldPersonName } from '../domain/world-locations';
import { element } from './dom';

interface HomeRoutineNotebookOptions {
    readonly language: AcademyLanguage;
    readonly practice: WorldPractice;
    readonly stampId: string;
    readonly visitCount: number;
    readonly random?: () => number;
    readonly onListen?: (line: string) => Promise<boolean>;
    readonly onPaperTurn?: () => void;
    readonly onOpenJournal: () => void;
    readonly onPracticeComplete?: (practiceId: string, stampId: string, evaluation?: ActivityEvaluation) => void;
}

interface HomeArrivalOptions {
    readonly language: AcademyLanguage;
    readonly dialogue: WorldArrivalDialogue;
    readonly introductionId: string;
    readonly onContinue: (reflection: HomeReflection) => void;
}

type HomeReflection = 'quiet' | 'full' | 'still-arriving';

const REFLECTIONS = [
    { id: 'quiet', ja: '静かな時間', en: 'A quiet one' },
    { id: 'full', ja: 'いろいろあった', en: 'A full one' },
    { id: 'still-arriving', ja: 'まだ帰る途中みたい', en: 'I am still arriving' },
] as const satisfies readonly { readonly id: HomeReflection; readonly ja: string; readonly en: string }[];

/** A private, ungraded opening beat. The answer is deliberately not persisted. */
export function renderHomeFirstVisitDialogue(options: HomeArrivalOptions): HTMLElement {
    const root = element('aside', 'academy-world-arrival-dialogue academy-home-arrival-dialogue');
    root.dataset.worldArrivalDialogue = options.introductionId;
    root.dataset.homeDialogueStep = 'reflection';
    root.setAttribute('aria-label', options.language === 'ja' ? '家での最初の会話' : 'First conversation at home');

    const speaker = element('p', 'academy-world-arrival-speaker');
    speaker.textContent = displayWorldPersonName(options.dialogue.speakerId, options.language);
    const line = element('p', 'academy-world-arrival-line academy-home-arrival-line');
    line.lang = 'ja';
    line.textContent = options.dialogue.line.ja;
    const support = element('p', 'academy-world-arrival-support academy-home-arrival-support');
    support.hidden = options.language === 'ja';
    support.textContent = options.dialogue.line.en;
    const choices = element('div', 'academy-home-reflection-choices');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', options.language === 'ja' ? '今の気持ち' : 'How the return home felt');
    const continueButton = element('button', 'academy-world-arrival-continue academy-home-arrival-continue');
    continueButton.type = 'button';
    continueButton.hidden = true;
    continueButton.textContent = options.dialogue.action[options.language];

    let reflection: HomeReflection = 'quiet';
    for (const choice of REFLECTIONS) {
        const button = element('button', 'academy-home-reflection-choice');
        button.type = 'button';
        button.dataset.homeReflection = choice.id;
        button.textContent = choice[options.language];
        button.addEventListener('click', () => {
            reflection = choice.id;
            root.dataset.homeReflection = choice.id;
            root.dataset.homeDialogueStep = 'welcome';
            line.textContent = 'それで十分です。習慣は、小さくてもいいです。今夜の一行を見てみましょう。';
            support.textContent = 'That is enough. A routine is allowed to be small. Let us look at tonight\'s line.';
            choices.hidden = true;
            continueButton.hidden = false;
            continueButton.focus();
        });
        choices.append(button);
    }
    continueButton.addEventListener('click', () => options.onContinue(reflection));
    root.append(speaker, line, support, choices, continueButton);
    return root;
}

/** A single low-pressure gesture: place source-owned word strips onto the open notebook. */
export function renderHomeRoutineNotebook(options: HomeRoutineNotebookOptions): HTMLElement {
    const manipulation = options.practice.manipulation;
    if (manipulation?.kind !== 'token-order') {
        throw new TypeError(`Home routine ${options.practice.id} needs a token-order interaction.`);
    }

    const root = element('section', 'academy-world-practice academy-home-notebook');
    root.dataset.worldPractice = options.practice.id;
    root.dataset.homePractice = 'living-paper-routine';
    root.dataset.worldInteraction = manipulation.kind;
    root.dataset.homeVisit = String(options.visitCount);
    root.dataset.homeSource = options.practice.source?.primary.sourceId
        ?? options.practice.review?.sourceQuestionId
        ?? '';

    const tape = element('p', 'academy-home-source-tape');
    tape.textContent = options.practice.source?.primary.label[options.language]
        ?? (options.language === 'ja' ? 'Genki I・3課・Workbook 5' : 'Genki I · Lesson 3 · Workbook 5');
    const heading = element('h2', 'academy-home-notebook-heading');
    heading.id = `academy-home-routine-${options.practice.id}`;
    heading.lang = 'ja';
    heading.textContent = options.practice.sceneLabel?.ja ?? '今夜の一行';
    root.setAttribute('aria-labelledby', heading.id);
    const headingSupport = element('p', 'academy-home-notebook-heading-support');
    headingSupport.hidden = options.language === 'ja';
    headingSupport.textContent = options.practice.sceneLabel?.en ?? 'Tonight\'s line';
    const phrase = element('p', 'academy-home-routine-phrase');
    phrase.lang = 'ja';
    phrase.textContent = options.practice.audioLine;
    const meaning = element('p', 'academy-home-routine-meaning');
    meaning.hidden = options.language === 'ja';
    meaning.textContent = options.practice.review?.meanings[0] ?? options.practice.prompt.en;

    const response = element('p', 'academy-home-strip-response');
    response.lang = 'ja';
    response.dataset.homeStripResponse = '';
    response.setAttribute('aria-live', 'polite');
    response.textContent = options.language === 'ja' ? 'ことばをここに置く' : 'Place the strips here';
    const strips = element('div', 'academy-home-word-strips');
    strips.setAttribute('role', 'group');
    strips.setAttribute('aria-label', options.language === 'ja' ? '習慣のことば' : 'Routine word strips');
    const status = element('p', 'academy-world-practice-status academy-home-routine-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const controls = element('div', 'academy-home-notebook-controls');
    const listen = element('button', 'academy-world-listen academy-home-listen');
    listen.type = 'button';
    listen.dataset.worldListen = options.practice.id;
    listen.textContent = options.language === 'ja' ? '聞く' : 'Listen';
    const lift = element('button', 'academy-home-lift-strips');
    lift.type = 'button';
    lift.disabled = true;
    lift.textContent = options.language === 'ja' ? '札を戻す' : 'Lift the strips';
    const journal = element('button', 'academy-home-open-journal');
    journal.type = 'button';
    journal.dataset.activityRoute = 'journal';
    journal.textContent = options.language === 'ja' ? '日誌を開く' : 'Open journal';

    let completed = false;
    let replayCount = 0;
    let placed: string[] = [];
    let tokenButtons: HTMLButtonElement[] = [];
    const random = options.random ?? Math.random;

    const updateResponse = () => {
        response.textContent = placed.length
            ? placed.map(id => manipulation.tokens.find(token => token.id === id)?.label.ja ?? '').join('')
            : options.language === 'ja' ? 'ことばをここに置く' : 'Place the strips here';
        lift.disabled = placed.length === 0;
    };
    const finish = () => {
        root.dataset.practiceComplete = 'true';
        status.textContent = completed
            ? options.language === 'ja' ? 'もう一度、一行を作りました。' : 'You made the line again.'
            : options.practice.success[options.language];
        tokenButtons.forEach(button => { button.disabled = true; });
        lift.disabled = false;
        lift.textContent = options.language === 'ja' ? 'もう一度' : 'Replay the strips';
        if (completed) return;
        completed = true;
        const evaluation = completedWorldPracticeEvaluation(options.practice);
        if (evaluation) options.onPracticeComplete?.(options.practice.id, options.stampId, evaluation);
        else options.onPracticeComplete?.(options.practice.id, options.stampId);
    };
    const mountStrips = () => {
        strips.replaceChildren();
        placed = [];
        tokenButtons = [];
        for (const token of shuffled(manipulation.tokens, random)) {
            const button = element('button', 'academy-home-word-strip');
            button.type = 'button';
            button.dataset.worldToken = token.id;
            const japanese = element('span', 'academy-home-word-strip-ja');
            japanese.lang = 'ja';
            japanese.textContent = token.label.ja;
            button.append(japanese);
            if (options.language === 'en') {
                const support = element('span', 'academy-home-word-strip-support');
                support.textContent = token.label.en;
                button.append(support);
            }
            button.addEventListener('click', () => {
                placed.push(token.id);
                button.disabled = true;
                updateResponse();
                if (placed.length !== manipulation.correctTokenIds.length) return;
                if (placed.every((id, index) => id === manipulation.correctTokenIds[index])) {
                    finish();
                    return;
                }
                status.textContent = options.language === 'ja'
                    ? '急がなくて大丈夫です。札を戻して、別の順番を試しましょう。'
                    : 'No rush. Lift the strips and try another order.';
            });
            tokenButtons.push(button);
            strips.append(button);
        }
        updateResponse();
    };

    listen.addEventListener('click', () => {
        void (options.onListen?.(options.practice.audioLine) ?? Promise.resolve(false)).then(played => {
            status.textContent = played
                ? options.language === 'ja' ? '今夜の一行を再生しています。' : 'Tonight\'s line is playing.'
                : options.language === 'ja' ? '紙の一行を読んで続けられます。' : 'You can continue by reading the line on the paper.';
        });
    });
    lift.addEventListener('click', () => {
        replayCount += 1;
        root.dataset.homeReplayCount = String(replayCount);
        options.onPaperTurn?.();
        status.textContent = options.language === 'ja' ? '札を混ぜました。' : 'The strips have been shuffled.';
        lift.textContent = options.language === 'ja' ? '札を戻す' : 'Lift the strips';
        mountStrips();
        strips.querySelector<HTMLButtonElement>('button')?.focus();
    });
    journal.addEventListener('click', options.onOpenJournal);

    mountStrips();
    controls.append(listen, lift, journal);
    root.append(tape, heading, headingSupport, phrase, meaning, response, strips, controls, status);
    return root;
}

function shuffled<T>(values: readonly T[], random: () => number): readonly T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const value = random();
        const unit = Number.isFinite(value) ? Math.min(0.999_999, Math.max(0, value)) : 0;
        const swapIndex = Math.floor(unit * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
    }
    return result;
}
