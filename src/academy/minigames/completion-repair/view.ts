import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, setPending, showEvaluation, statusRegion } from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';
import type { CompletionRepairModel, CompletionRepairResponse, CompletionRepairRound } from './manifest';

export function renderCompletionRepair(
    model: CompletionRepairModel,
    host: ActivityHost,
    submit: (response: CompletionRepairResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-state-inspection academy-completion-repair';
    root.dataset.activityId = model.id;

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const sources = renderSources(model, host.language);
    const form = document.createElement('form');
    form.className = 'academy-state-inspection-form';
    form.setAttribute('aria-labelledby', heading.id);
    const rounds = document.createElement('div');
    rounds.className = 'academy-state-inspection-round-groups';
    model.payload.taskHeadings.forEach(group => {
        const section = document.createElement('section');
        const groupHeading = document.createElement('h3');
        groupHeading.textContent = group.text;
        const list = document.createElement('ol');
        list.className = 'academy-state-inspection-rounds';
        model.payload.rounds.filter(round => round.sourceTask === group.sourceTask)
            .forEach(round => list.append(renderRound(model, round, host)));
        section.append(groupHeading, list);
        rounds.append(section);
    });
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-state-inspection-check';
    check.textContent = host.language === 'ja' ? '八つの文を確認する' : 'Check the eight source responses';
    form.append(rounds, check);

    const actions = document.createElement('div');
    actions.className = 'academy-state-inspection-actions';
    const returnToTeaching = action(host.language === 'ja' ? '先生の説明へ戻る' : 'Return to Sensei’s teaching', 'return');
    const replay = action(host.language === 'ja' ? '八つをもう一度' : 'Replay all eight responses', 'replay');
    returnToTeaching.hidden = true;
    replay.hidden = true;
    actions.append(returnToTeaching, replay);
    const key = renderAnswerKey(model, host.language);
    const status = statusRegion('academy-kit-feedback academy-state-inspection-feedback');
    root.append(heading, teaching, sources, form, actions, key, status);
    host.replace(root);

    returnToTeaching.addEventListener('click', () => {
        teaching.querySelector<HTMLElement>('h3')?.focus();
        teaching.scrollIntoView?.({ block: 'start' });
        host.announce(host.language === 'ja' ? '先生の説明に戻りました。' : 'Returned to Sensei’s teaching.');
    }, { signal: lifecycle.signal });

    replay.addEventListener('click', () => {
        resetForReplay(rounds, form, key, returnToTeaching, replay);
        firstControl(form)?.focus();
        host.announce(host.language === 'ja' ? '八つの文を最初から試せます。' : 'All eight source responses are ready for a fresh replay.');
    }, { signal: lifecycle.signal });

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? '八つの問題に一つずつ答えてください。'
                : 'Complete one response for each of the eight source prompts.';
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
            if (evaluation.result.outcome === 'lapse') showRepairRows(model, rounds, evaluation.result.errorTags, host);
            else form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')
                .forEach(control => { control.disabled = true; });
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

function renderTeaching(model: CompletionRepairModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-teaching academy-completion-repair-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const block = document.createElement('section');
        const heading = document.createElement('h3');
        heading.tabIndex = -1;
        heading.textContent = step.title;
        const copy = document.createElement('p');
        copy.className = 'academy-japanese academy-state-inspection-source-text';
        copy.textContent = step.text;
        block.append(heading, copy);
        section.append(block);
    });
    return section;
}

function renderSources(model: CompletionRepairModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-sources academy-completion-repair-sources';
    section.dataset.lessonPhase = 'source-reference';
    model.provenance.moodle.sourceSheets.forEach(visual => {
        section.append(renderInspectableSourceVisual(
            visual,
            language,
            'academy-completion-repair-source-visual',
            'lazy',
        ));
    });
    return section;
}

function renderRound(model: CompletionRepairModel, round: CompletionRepairRound, host: ActivityHost): HTMLElement {
    const item = document.createElement('li');
    item.className = 'academy-state-inspection-round academy-completion-repair-round';
    item.dataset.roundId = round.id;
    item.dataset.interaction = round.interaction;
    item.dataset.sourceQuestionId = round.sourceQuestionId;
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = round.sourcePrompt;
    fieldset.append(legend);
    if (round.interaction === 'completion-select') fieldset.append(renderSelect(model, round, host));
    else if (round.interaction === 'finish-first-choice') fieldset.append(renderChoices(model, round, host));
    else fieldset.append(renderTyped(model, round, host));
    item.append(fieldset);
    return item;
}

function renderSelect(model: CompletionRepairModel, round: CompletionRepairRound, host: ActivityHost): HTMLElement {
    const label = document.createElement('label');
    label.className = 'academy-state-inspection-select-label';
    const copy = document.createElement('span');
    copy.textContent = host.language === 'ja' ? '完成したことを聞く文' : 'Choose the completed-action question';
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

function renderChoices(model: CompletionRepairModel, round: CompletionRepairRound, host: ActivityHost): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'academy-state-inspection-choices';
    round.options.forEach(option => {
        const label = document.createElement('label');
        label.className = 'academy-state-inspection-choice';
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

function renderTyped(model: CompletionRepairModel, round: CompletionRepairRound, host: ActivityHost): HTMLElement {
    const label = document.createElement('label');
    label.className = 'academy-state-inspection-typed-label';
    const copy = document.createElement('span');
    copy.textContent = host.language === 'ja'
        ? (round.interaction === 'typed-transform' ? '完成したことを聞く文' : '残念だったことをつなぐ文')
        : (round.interaction === 'typed-transform' ? 'Type the completed-action question' : 'Type the linked regret sentence');
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
    model: CompletionRepairModel,
    list: HTMLElement,
    errorTags: readonly string[],
    host: ActivityHost,
): void {
    model.payload.rounds.forEach(round => {
        const item = list.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
        if (!item) return;
        const missed = errorTags.includes(round.errorTag);
        item.hidden = !missed;
        if (!missed || item.querySelector('.academy-state-inspection-hints')) return;
        item.append(renderHints(model.id, round, host));
    });
}

function renderHints(modelId: string, round: CompletionRepairRound, host: ActivityHost): HTMLElement {
    const root = document.createElement('section');
    root.className = 'academy-state-inspection-hints';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-button academy-button-secondary academy-state-inspection-hint';
    button.textContent = host.language === 'ja' ? 'ヒントを見る' : 'Show earned hint';
    const output = statusRegion('academy-state-inspection-hint-output');
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

function renderAnswerKey(model: CompletionRepairModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-key academy-completion-repair-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.textContent = language === 'ja' ? '試したあとの、よむ派生文' : 'Yomu-derived completions after your attempt';
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

function responseFromForm(model: CompletionRepairModel, form: HTMLFormElement): CompletionRepairResponse | null {
    const data = new FormData(form);
    const answers = model.payload.rounds.map(round => {
        const value = data.get(fieldName(model, round));
        return typeof value === 'string' && value.trim() ? { roundId: round.id, value } : null;
    });
    return answers.every((answer): answer is CompletionRepairResponse['answers'][number] => answer !== null)
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
    rounds.querySelectorAll<HTMLElement>('.academy-completion-repair-round').forEach(item => {
        item.hidden = false;
        item.querySelector('.academy-state-inspection-hints')?.remove();
    });
    key.hidden = true;
    returnButton.hidden = true;
    replayButton.hidden = true;
}

function fieldName(model: CompletionRepairModel, round: CompletionRepairRound): string {
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
    button.className = `academy-button academy-button-secondary academy-state-inspection-${actionName}`;
    button.textContent = label;
    return button;
}

function firstControl(form: HTMLFormElement): HTMLElement | null {
    return form.querySelector<HTMLElement>('[data-round-control]');
}
