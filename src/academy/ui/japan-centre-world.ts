import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import type { WorldPractice } from '../domain/world-locations';
import { completedWorldPracticeEvaluation } from '../domain/world-practice-evidence';
import { element } from './dom';

interface JapanCentreWorldOptions {
    readonly language: AcademyLanguage;
    readonly practice: WorldPractice;
    readonly stampId: string;
    readonly onListen?: (line: string) => Promise<boolean>;
    readonly onPracticeComplete?: (practiceId: string, stampId: string, evaluation?: ActivityEvaluation) => void;
}

/** A tag has to be identified before the learner can make a counter request or price response. */
export function renderJapanCentreGiftCounter(options: JapanCentreWorldOptions): HTMLElement {
    const plan = options.practice.manipulation;
    if (plan?.kind !== 'counter-tag') {
        throw new TypeError(`Japan Centre practice ${options.practice.id} requires a counter-tag plan.`);
    }

    const root = element('section', 'academy-world-practice academy-japan-centre-counter');
    root.dataset.worldPractice = options.practice.id;
    root.dataset.japanCentrePractice = 'read-tag-then-respond';
    root.dataset.japanCentreOutcome = options.practice.id;
    root.dataset.japanCentrePhase = 'read-tag';
    root.dataset.jpdbReaderSurfaceIgnore = '';
    const promptId = `academy-japan-centre-prompt-${options.practice.id}`;
    const statusId = `academy-japan-centre-status-${options.practice.id}`;
    root.setAttribute('aria-labelledby', promptId);
    root.setAttribute('aria-describedby', statusId);
    const prompt = element('p', 'academy-world-practice-prompt');
    prompt.id = promptId;
    prompt.lang = 'ja';
    prompt.textContent = options.practice.prompt.ja;
    const support = element('p', 'academy-world-practice-support');
    support.hidden = options.language === 'ja';
    support.textContent = options.practice.prompt.en;
    const listen = element('button', 'academy-world-listen');
    listen.type = 'button';
    listen.dataset.worldListen = options.practice.id;
    listen.textContent = options.language === 'ja' ? '聞く' : 'Listen';
    const transcript = element('p', 'academy-world-transcript');
    transcript.lang = 'ja';
    transcript.hidden = true;
    transcript.textContent = options.practice.audioLine;
    const status = element('p', 'academy-world-practice-status');
    status.id = statusId;
    status.tabIndex = -1;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const tags = element('div', 'academy-world-practice-options');
    tags.dataset.japanCentreTags = options.practice.id;
    tags.setAttribute('role', 'group');
    tags.setAttribute('aria-label', options.language === 'ja' ? 'お土産の札' : 'Gift tags');
    const responses = element('div', 'academy-world-practice-options');
    responses.dataset.japanCentreResponses = options.practice.id;
    responses.hidden = true;
    responses.setAttribute('role', 'group');
    responses.setAttribute('aria-label', options.language === 'ja' ? 'レジでの返事' : 'Counter response');
    let complete = false;

    const finish = () => {
        complete = true;
        root.dataset.japanCentrePhase = 'complete';
        root.dataset.practiceComplete = 'true';
        tags.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
        responses.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
        status.textContent = options.practice.success[options.language];
        status.focus();
        const evaluation = completedWorldPracticeEvaluation(options.practice);
        if (evaluation) options.onPracticeComplete?.(options.practice.id, options.stampId, evaluation);
        else options.onPracticeComplete?.(options.practice.id, options.stampId);
    };

    plan.tags.forEach(tag => {
        const button = element('button', 'academy-world-practice-option');
        button.type = 'button';
        button.dataset.counterTag = tag.id;
        const japanese = element('span', 'academy-world-practice-choice-ja');
        japanese.lang = 'ja';
        japanese.textContent = tag.label.ja;
        button.append(japanese);
        if (options.language === 'en') {
            const tagSupport = element('span', 'academy-world-practice-choice-support');
            tagSupport.textContent = tag.label.en;
            button.append(tagSupport);
        }
        button.addEventListener('click', () => {
            if (complete) return;
            if (tag.id !== plan.correctTagId) {
                status.textContent = options.language === 'ja'
                    ? 'もう一度、札の品物を見てください。'
                    : 'Check the item on the tag once more.';
                return;
            }
            root.dataset.japanCentrePhase = 'respond';
            tags.querySelectorAll<HTMLButtonElement>('button').forEach(candidate => { candidate.disabled = true; });
            responses.hidden = false;
            status.textContent = options.language === 'ja'
                ? 'かばんの札を見つけた。レジでの返事を選びましょう。'
                : 'You found the bag tag. Choose the counter response.';
            responses.querySelector<HTMLButtonElement>('button')?.focus();
        });
        tags.append(button);
    });

    options.practice.choices.forEach(choice => {
        const button = element('button', 'academy-world-practice-option');
        button.type = 'button';
        button.dataset.choiceId = choice.id;
        const japanese = element('span', 'academy-world-practice-choice-ja');
        japanese.lang = 'ja';
        japanese.textContent = choice.label.ja;
        button.append(japanese);
        if (options.language === 'en') {
            const choiceSupport = element('span', 'academy-world-practice-choice-support');
            choiceSupport.textContent = choice.label.en;
            button.append(choiceSupport);
        }
        button.addEventListener('click', () => {
            transcript.hidden = false;
            if (complete) return;
            if (choice.id !== options.practice.correctChoiceId) {
                status.textContent = options.language === 'ja'
                    ? '札とレジのことばをもう一度確かめてください。'
                    : 'Check the tag and counter language once more.';
                return;
            }
            finish();
        });
        responses.append(button);
    });

    listen.addEventListener('click', () => {
        transcript.hidden = false;
        void (options.onListen?.(options.practice.audioLine) ?? Promise.resolve(false)).then(played => {
            if (complete) return;
            status.textContent = played
                ? options.language === 'ja' ? '音声を再生しました。まず札の品物を見つけましょう。' : 'Playing the counter exchange. Find the tagged item first.'
                : options.language === 'ja' ? '文字を読んで、まず札の品物を見つけましょう。' : 'Use the transcript and find the tagged item first.';
        });
    });

    const sourceStrip = renderSourceStrip(options);
    root.append(prompt, support, listen, transcript, tags, responses, status, ...(sourceStrip ? [sourceStrip] : []));
    return root;
}

/** A paper-edge trace keeps source roles visible without turning the counter into a lesson card. */
function renderSourceStrip(options: JapanCentreWorldOptions): HTMLElement | undefined {
    const grounding = options.practice.source;
    if (!grounding) return undefined;
    const strip = element('p', 'academy-japan-centre-source-strip');
    strip.dataset.japanCentreSourcePrimary = grounding.primary.sourceId;
    strip.dataset.japanCentreSourceRelation = grounding.primary.relation;
    strip.dataset.japanCentreSourceSupport = grounding.supports.map(source => source.corpus).join(' ');
    strip.textContent = [grounding.primary, ...grounding.supports]
        .map(source => source.label[options.language])
        .join(' · ');
    return strip;
}
