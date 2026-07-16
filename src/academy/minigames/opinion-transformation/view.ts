import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, setPending, showEvaluation, statusRegion } from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';
import type {
    OpinionTransformationModel,
    OpinionTransformationResponse,
    OpinionTransformationRound,
    OpinionTransformationSourceVisual,
} from './manifest';

export function renderOpinionTransformation(
    model: OpinionTransformationModel,
    host: ActivityHost,
    submit: (response: OpinionTransformationResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-opinion-transformation';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));

    const teaching = document.createElement('section');
    teaching.className = 'academy-opinion-transformation-teaching';
    teaching.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const card = document.createElement('article');
        const title = document.createElement('h3');
        title.append(...localizedNodes(step.title));
        const pattern = document.createElement('p');
        pattern.className = 'academy-opinion-transformation-pattern academy-japanese';
        pattern.lang = 'ja';
        pattern.textContent = step.pattern;
        const instruction = document.createElement('p');
        instruction.append(...localizedNodes(step.instruction));
        card.append(title, pattern, instruction);
        teaching.append(card);
    });

    const sources = document.createElement('section');
    sources.className = 'academy-opinion-transformation-sources';
    sources.dataset.lessonPhase = 'source-reference';
    sources.append(
        renderVisual(model.provenance.moodle.vocabularySheet, host.language),
        renderVisual(model.provenance.moodle.teachingSheet, host.language),
        renderVisual(model.provenance.moodle.taskSheet, host.language),
    );

    const form = document.createElement('form');
    form.className = 'academy-opinion-transformation-form';
    form.setAttribute('aria-labelledby', heading.id);
    const rounds = document.createElement('ol');
    rounds.className = 'academy-opinion-transformation-rounds';
    model.payload.rounds.forEach(round => rounds.append(renderRound(model, round, host.language)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-opinion-transformation-check';
    check.textContent = host.language === 'ja' ? '五つの文を確認する' : 'Check the five transformations';
    form.append(rounds, check);

    const key = renderAnswerKey(model, host.language);
    const status = statusRegion('academy-kit-feedback academy-opinion-transformation-feedback');
    root.append(heading, teaching, sources, form, key, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? '五つの文をすべて書いてください。'
                : 'Complete all five transformations.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            key.hidden = false;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                showRepairRows(model, rounds, evaluation.result.errorTags, host);
                setPending(root, false);
            }
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { form.querySelector<HTMLInputElement>('input')?.focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderVisual(
    visual: OpinionTransformationSourceVisual,
    language: 'ja' | 'en' | undefined,
): HTMLElement {
    return renderInspectableSourceVisual(visual, language, 'academy-opinion-transformation-source');
}

function renderRound(
    model: OpinionTransformationModel,
    round: OpinionTransformationRound,
    language: 'ja' | 'en' | undefined,
): HTMLElement {
    const item = document.createElement('li');
    item.className = 'academy-opinion-transformation-round';
    item.dataset.roundId = round.id;
    item.dataset.sourceQuestionId = round.sourceQuestionId;
    const label = document.createElement('label');
    label.htmlFor = `${model.id}-${round.id}`;
    const order = document.createElement('span');
    order.className = 'academy-opinion-transformation-order';
    order.textContent = language === 'ja' ? `先生の問題 ${round.sourceOrder}` : `Sensei item ${round.sourceOrder}`;
    const prompt = document.createElement('span');
    prompt.className = 'academy-opinion-transformation-source-prompt academy-japanese';
    prompt.lang = 'ja';
    prompt.textContent = round.sourcePrompt;
    const input = document.createElement('input');
    input.id = `${model.id}-${round.id}`;
    input.name = `${model.id}:${round.id}`;
    input.type = 'text';
    input.required = true;
    input.autocomplete = 'off';
    input.lang = 'ja';
    input.spellcheck = false;
    input.setAttribute('aria-label', language === 'ja' ? `問題 ${round.sourceOrder} の答え` : `Answer for source item ${round.sourceOrder}`);
    label.append(order, prompt, input);
    item.append(label);
    return item;
}

function showRepairRows(
    model: OpinionTransformationModel,
    list: HTMLElement,
    errorTags: readonly string[],
    host: ActivityHost,
): void {
    model.payload.rounds.forEach(round => {
        const item = list.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
        if (!item) return;
        const missed = errorTags.includes(round.errorTag);
        item.hidden = !missed;
        if (!missed || item.querySelector('.academy-opinion-transformation-hints')) return;
        item.querySelector<HTMLInputElement>('input')!.value = '';
        item.append(renderHints(model.id, round, host));
    });
}

function renderHints(modelId: string, round: OpinionTransformationRound, host: ActivityHost): HTMLElement {
    const root = document.createElement('section');
    root.className = 'academy-opinion-transformation-hints';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-button academy-button-secondary academy-opinion-transformation-hint';
    button.textContent = host.language === 'ja' ? 'ヒントを見る' : 'Show earned hint';
    const output = statusRegion('academy-opinion-transformation-hint-output');
    let index = 0;
    button.addEventListener('click', () => {
        const hint = round.hints[index];
        if (!hint) return;
        index += 1;
        output.textContent = hint[host.language === 'ja' ? 'ja' : 'en'];
        output.dataset.hintIndex = String(index);
        button.textContent = host.language === 'ja' ? '次のヒント' : 'Next hint';
        button.disabled = index >= round.hints.length;
        void host.recordSupportUse?.({ activityId: modelId, supportKind: 'hint', choiceId: `${round.id}:hint-${index}` });
        host.announce(output.textContent);
    });
    root.append(button, output);
    return root;
}

function renderAnswerKey(model: OpinionTransformationModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-opinion-transformation-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.textContent = language === 'ja' ? '試したあとの変換' : 'Derived transformations after your attempt';
    const answers = document.createElement('ol');
    model.payload.rounds.forEach(round => {
        const item = document.createElement('li');
        item.textContent = round.answerExpression;
        answers.append(item);
    });
    section.append(heading, answers);
    return section;
}

function responseFromForm(
    model: OpinionTransformationModel,
    form: HTMLFormElement,
): OpinionTransformationResponse | null {
    const data = new FormData(form);
    const answers = model.payload.rounds.map(round => {
        const value = data.get(`${model.id}:${round.id}`);
        return typeof value === 'string' && value.trim() ? { roundId: round.id, value } : null;
    });
    return answers.every((answer): answer is OpinionTransformationResponse['answers'][number] => answer !== null)
        ? { answers }
        : null;
}
