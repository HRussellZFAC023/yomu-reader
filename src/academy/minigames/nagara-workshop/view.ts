import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, setPending, showEvaluation, statusRegion } from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';
import type { NagaraWorkshopModel, NagaraWorkshopResponse, NagaraWorkshopRound } from './manifest';

export function renderNagaraWorkshop(
    model: NagaraWorkshopModel,
    host: ActivityHost,
    submit: (response: NagaraWorkshopResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-nagara-workshop';
    root.dataset.activityId = model.id;

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const sources = renderSources(model, host.language);
    const form = document.createElement('form');
    form.className = 'academy-nagara-workshop-form';
    form.setAttribute('aria-labelledby', heading.id);
    const taskHeading = document.createElement('h3');
    taskHeading.textContent = model.payload.taskHeading;
    const rounds = document.createElement('ol');
    rounds.className = 'academy-nagara-workshop-rounds';
    model.payload.rounds.forEach(round => rounds.append(renderRound(model, round, host)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-nagara-workshop-check';
    check.textContent = host.language === 'ja' ? '六つの文を確認する' : 'Check the six joins';
    form.append(taskHeading, rounds, check);

    const actions = document.createElement('div');
    actions.className = 'academy-nagara-workshop-actions';
    const returnToTeaching = action(host.language === 'ja' ? '先生の説明へ戻る' : 'Return to Sensei’s teaching', 'return');
    const replay = action(host.language === 'ja' ? '六つをもう一度' : 'Replay all six joins', 'replay');
    returnToTeaching.hidden = true;
    replay.hidden = true;
    actions.append(returnToTeaching, replay);
    const key = renderAnswerKey(model, host.language);
    const status = statusRegion('academy-kit-feedback academy-nagara-workshop-feedback');
    root.append(heading, teaching, sources, form, actions, key, status);
    host.replace(root);

    returnToTeaching.addEventListener('click', () => {
        const teachingHeading = teaching.querySelector<HTMLElement>('h3');
        teachingHeading?.focus();
        teaching.scrollIntoView?.({ block: 'start' });
        host.announce(host.language === 'ja' ? '先生の説明に戻りました。' : 'Returned to Sensei’s teaching.');
    }, { signal: lifecycle.signal });

    replay.addEventListener('click', () => {
        resetForReplay(rounds, form, key, returnToTeaching, replay);
        firstControl(form)?.focus();
        host.announce(host.language === 'ja' ? '六つの文を最初から作れます。' : 'All six nagara joins are ready for a fresh replay.');
    }, { signal: lifecycle.signal });

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? '六つの問題に一つずつ答えてください。'
                : 'Complete one response for each of the six source pairs.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            key.hidden = false;
            returnToTeaching.hidden = false;
            replay.hidden = false;
            setPending(root, false);
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                showRepairRows(model, rounds, evaluation.result.errorTags, host);
            } else {
                form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')
                    .forEach(control => { control.disabled = true; });
            }
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { firstControl(form)?.focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderTeaching(model: NagaraWorkshopModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-nagara-workshop-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const block = document.createElement('section');
        const heading = document.createElement('h3');
        heading.tabIndex = -1;
        heading.textContent = step.title;
        const copy = document.createElement('p');
        copy.className = 'academy-japanese academy-nagara-workshop-source-text';
        copy.textContent = step.text;
        block.append(heading, copy);
        section.append(block);
    });
    return section;
}

function renderSources(model: NagaraWorkshopModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-nagara-workshop-sources';
    section.dataset.lessonPhase = 'source-reference';
    model.provenance.moodle.sourceSheets.forEach(visual => {
        section.append(renderInspectableSourceVisual(visual, language, 'academy-nagara-workshop-source'));
    });
    return section;
}

function renderRound(model: NagaraWorkshopModel, round: NagaraWorkshopRound, host: ActivityHost): HTMLElement {
    const item = document.createElement('li');
    item.className = 'academy-nagara-workshop-round';
    item.dataset.roundId = round.id;
    item.dataset.interaction = round.interaction;
    item.dataset.sourceQuestionId = round.sourceQuestionId;
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = round.sourcePrompt;
    fieldset.append(legend);
    if (round.interaction === 'stem-select') fieldset.append(renderSelect(model, round, host));
    else if (round.interaction === 'main-clause-choice') fieldset.append(renderChoices(model, round, host));
    else fieldset.append(renderTyped(model, round, host));
    item.append(fieldset);
    return item;
}

function renderSelect(model: NagaraWorkshopModel, round: NagaraWorkshopRound, host: ActivityHost): HTMLElement {
    const label = document.createElement('label');
    label.className = 'academy-nagara-workshop-select-label';
    const copy = document.createElement('span');
    copy.textContent = host.language === 'ja' ? 'ながらの形' : 'Choose the nagara form';
    const select = document.createElement('select');
    select.name = fieldName(model, round);
    select.dataset.roundControl = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '—';
    select.append(placeholder, ...round.options.map(option => optionNode(option.value, option.label[host.language === 'ja' ? 'ja' : 'en'])));
    label.append(copy, select);
    return label;
}

function renderChoices(model: NagaraWorkshopModel, round: NagaraWorkshopRound, host: ActivityHost): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'academy-nagara-workshop-choices';
    round.options.forEach(option => {
        const label = document.createElement('label');
        label.className = 'academy-nagara-workshop-choice';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = fieldName(model, round);
        input.value = option.value;
        input.dataset.roundControl = '';
        const copy = document.createElement('span');
        copy.className = 'academy-japanese';
        copy.lang = 'ja';
        copy.textContent = option.label[host.language === 'ja' ? 'ja' : 'en'];
        label.append(input, copy);
        controls.append(label);
    });
    return controls;
}

function renderTyped(model: NagaraWorkshopModel, round: NagaraWorkshopRound, host: ActivityHost): HTMLElement {
    const label = document.createElement('label');
    label.className = 'academy-nagara-workshop-typed-label';
    const copy = document.createElement('span');
    copy.textContent = host.language === 'ja' ? '一つの長い文' : 'Type one long sentence';
    const input = document.createElement('input');
    input.type = 'text';
    input.name = fieldName(model, round);
    input.autocomplete = 'off';
    input.lang = 'ja';
    input.dataset.roundControl = '';
    label.append(copy, input);
    return label;
}

function showRepairRows(
    model: NagaraWorkshopModel,
    list: HTMLElement,
    errorTags: readonly string[],
    host: ActivityHost,
): void {
    model.payload.rounds.forEach(round => {
        const item = list.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
        if (!item) return;
        const missed = errorTags.includes(round.errorTag);
        item.hidden = !missed;
        if (!missed || item.querySelector('.academy-nagara-workshop-hints')) return;
        item.append(renderHints(model.id, round, host));
    });
}

function renderHints(modelId: string, round: NagaraWorkshopRound, host: ActivityHost): HTMLElement {
    const root = document.createElement('section');
    root.className = 'academy-nagara-workshop-hints';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-button academy-button-secondary academy-nagara-workshop-hint';
    button.textContent = host.language === 'ja' ? 'ヒントを見る' : 'Show earned hint';
    const output = statusRegion('academy-nagara-workshop-hint-output');
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

function renderAnswerKey(model: NagaraWorkshopModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-nagara-workshop-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.textContent = language === 'ja' ? '試したあとの、よむ派生文' : 'Yomu-derived joins after your attempt';
    const answers = document.createElement('ol');
    model.payload.rounds.forEach(round => {
        const item = document.createElement('li');
        item.className = 'academy-japanese';
        item.lang = 'ja';
        item.textContent = round.answerExpression;
        answers.append(item);
    });
    section.append(heading, answers);
    return section;
}

function responseFromForm(model: NagaraWorkshopModel, form: HTMLFormElement): NagaraWorkshopResponse | null {
    const data = new FormData(form);
    const answers = model.payload.rounds.map(round => {
        const value = data.get(fieldName(model, round));
        return typeof value === 'string' && value.trim() ? { roundId: round.id, value } : null;
    });
    return answers.every((answer): answer is NagaraWorkshopResponse['answers'][number] => answer !== null)
        ? { answers }
        : null;
}

function resetForReplay(
    rounds: HTMLElement,
    form: HTMLFormElement,
    key: HTMLElement,
    returnButton: HTMLButtonElement,
    replayButton: HTMLButtonElement,
): void {
    form.reset();
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')
        .forEach(control => { control.disabled = false; });
    rounds.querySelectorAll<HTMLElement>('.academy-nagara-workshop-round').forEach(item => {
        item.hidden = false;
        item.querySelector('.academy-nagara-workshop-hints')?.remove();
    });
    key.hidden = true;
    returnButton.hidden = true;
    replayButton.hidden = true;
}

function fieldName(model: NagaraWorkshopModel, round: NagaraWorkshopRound): string {
    return `${model.id}:${round.id}:answer`;
}

function optionNode(value: string, label: string): HTMLOptionElement {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
}

function action(label: string, actionName: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `academy-button academy-button-secondary academy-nagara-workshop-${actionName}`;
    button.textContent = label;
    return button;
}

function firstControl(form: HTMLFormElement): HTMLElement | null {
    return form.querySelector<HTMLElement>('[data-round-control]');
}
