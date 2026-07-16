import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, setPending, showEvaluation, statusRegion } from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';
import type { ClauseRailModel, ClauseRailResponse, ClauseRailRound } from './manifest';

export function renderClauseRail(
    model: ClauseRailModel,
    host: ActivityHost,
    submit: (response: ClauseRailResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-clause-rail';
    root.dataset.activityId = model.id;

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));

    const teaching = renderTeaching(model);
    const source = renderSource(model, host.language);
    const form = document.createElement('form');
    form.className = 'academy-clause-rail-form';
    form.setAttribute('aria-labelledby', heading.id);
    const rounds = document.createElement('ol');
    rounds.className = 'academy-clause-rail-rounds';
    model.payload.rounds.forEach(round => rounds.append(renderRound(model, round, host, lifecycle.signal)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-clause-rail-check';
    check.textContent = host.language === 'ja' ? '四つのレールを確認する' : 'Check the four rails';
    form.append(rounds, check);

    const returnToSource = document.createElement('button');
    returnToSource.type = 'button';
    returnToSource.className = 'academy-button academy-button-secondary academy-clause-rail-return';
    returnToSource.textContent = host.language === 'ja' ? '先生の説明へ戻る' : 'Return to Sensei’s teaching';
    returnToSource.hidden = true;
    const key = renderAnswerKey(model, host.language);
    const status = statusRegion('academy-kit-feedback academy-clause-rail-feedback');
    root.append(heading, teaching, source, form, returnToSource, key, status);
    host.replace(root);

    returnToSource.addEventListener('click', () => {
        const teachingHeading = teaching.querySelector<HTMLElement>('h3');
        teachingHeading?.focus();
        teaching.scrollIntoView?.({ block: 'start' });
        host.announce(host.language === 'ja' ? '先生の説明に戻りました。' : 'Returned to Sensei’s teaching.');
    }, { signal: lifecycle.signal });

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? '四つの問題で節の札を一つずつ選んでください。'
                : 'Choose one clause ticket for each of the four source items.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            key.hidden = false;
            returnToSource.hidden = false;
            setPending(root, false);
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                showRepairRows(model, rounds, evaluation.result.errorTags, host);
            } else {
                form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')
                    .forEach(control => { control.disabled = true; });
            }
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { form.querySelector<HTMLInputElement>('input[type="radio"]')?.focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderTeaching(model: ClauseRailModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-clause-rail-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const block = document.createElement('section');
        const heading = document.createElement('h3');
        heading.tabIndex = -1;
        heading.textContent = step.title;
        const copy = document.createElement('p');
        copy.className = 'academy-japanese academy-clause-rail-source-text';
        copy.lang = step.title === 'Sensei’s task' ? 'en' : 'ja';
        copy.textContent = step.text;
        block.append(heading, copy);
        section.append(block);
    });
    return section;
}

function renderSource(model: ClauseRailModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const visual = model.provenance.moodle.sourceSheet;
    const figure = renderInspectableSourceVisual(visual, language, 'academy-clause-rail-source');
    figure.dataset.lessonPhase = 'source-reference';
    return figure;
}

function renderRound(
    model: ClauseRailModel,
    round: ClauseRailRound,
    host: ActivityHost,
    signal: AbortSignal,
): HTMLElement {
    const item = document.createElement('li');
    item.className = 'academy-clause-rail-round';
    item.dataset.roundId = round.id;
    item.dataset.sourceQuestionId = round.sourceQuestionId;
    item.dataset.attachedOptionId = '';
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = `${host.language === 'ja' ? '先生の問題' : 'Sensei item'} ${round.sourceOrder}: ${round.sourcePrompt}`;
    const options = document.createElement('div');
    options.className = 'academy-clause-rail-options';
    round.options.forEach(option => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `${model.id}:${round.id}:option`;
        input.value = option.id;
        const copy = document.createElement('span');
        copy.className = 'academy-japanese';
        copy.lang = 'ja';
        copy.textContent = option.label;
        input.addEventListener('change', () => resetRail(item, railClause, attach, host), { signal });
        label.append(input, copy);
        options.append(label);
    });

    const rail = document.createElement('div');
    rail.className = 'academy-clause-rail-track';
    rail.setAttribute('aria-label', host.language === 'ja' ? '名詞修飾節のレール' : 'Noun-modifying clause rail');
    const sentenceStart = railPart('これは', 'academy-clause-rail-fixed');
    const railClause = railPart(host.language === 'ja' ? '節の札' : 'clause ticket', 'academy-clause-rail-slot');
    railClause.dataset.empty = '';
    const noun = railPart(round.noun, 'academy-clause-rail-noun academy-japanese');
    noun.lang = 'ja';
    const sentenceEnd = railPart('です。', 'academy-clause-rail-fixed');
    rail.append(sentenceStart, railClause, noun, sentenceEnd);

    const attach = document.createElement('button');
    attach.type = 'button';
    attach.className = 'academy-button academy-button-secondary academy-clause-rail-attach';
    attach.setAttribute('aria-pressed', 'false');
    attach.textContent = host.language === 'ja' ? '節を名詞の前につなぐ' : 'Attach clause before noun';
    attach.addEventListener('click', () => {
        const selected = fieldset.querySelector<HTMLInputElement>('input[type="radio"]:checked');
        const option = round.options.find(candidate => candidate.id === selected?.value);
        if (!option) {
            host.announce(host.language === 'ja' ? '先に節の札を選んでください。' : 'Choose a clause ticket first.');
            return;
        }
        item.dataset.attachedOptionId = option.id;
        railClause.textContent = option.label;
        delete railClause.dataset.empty;
        railClause.lang = 'ja';
        railClause.classList.add('academy-japanese');
        attach.setAttribute('aria-pressed', 'true');
        host.announce(host.language === 'ja'
            ? `${option.label}を${round.noun}の前につなぎました。`
            : `Attached ${option.label} directly before ${round.noun}.`);
    }, { signal });
    fieldset.append(legend, options, rail, attach);
    item.append(fieldset);
    return item;
}

function resetRail(item: HTMLElement, slot: HTMLElement, attach: HTMLButtonElement, host: ActivityHost): void {
    item.dataset.attachedOptionId = '';
    slot.textContent = host.language === 'ja' ? '節の札' : 'clause ticket';
    slot.dataset.empty = '';
    slot.classList.remove('academy-japanese');
    slot.removeAttribute('lang');
    attach.setAttribute('aria-pressed', 'false');
}

function railPart(text: string, className: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
}

function showRepairRows(
    model: ClauseRailModel,
    list: HTMLElement,
    errorTags: readonly string[],
    host: ActivityHost,
): void {
    model.payload.rounds.forEach(round => {
        const item = list.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
        if (!item) return;
        const missed = errorTags.includes(round.errorTag);
        item.hidden = !missed;
        if (!missed || item.querySelector('.academy-clause-rail-hints')) return;
        item.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.checked = false; });
        const slot = item.querySelector<HTMLElement>('.academy-clause-rail-slot');
        const attach = item.querySelector<HTMLButtonElement>('.academy-clause-rail-attach');
        if (slot && attach) resetRail(item, slot, attach, host);
        item.append(renderHints(model.id, round, host));
    });
}

function renderHints(modelId: string, round: ClauseRailRound, host: ActivityHost): HTMLElement {
    const root = document.createElement('section');
    root.className = 'academy-clause-rail-hints';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-button academy-button-secondary academy-clause-rail-hint';
    button.textContent = host.language === 'ja' ? 'ヒントを見る' : 'Show earned hint';
    const output = statusRegion('academy-clause-rail-hint-output');
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

function renderAnswerKey(model: ClauseRailModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-clause-rail-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.textContent = language === 'ja' ? '試したあとの説明文' : 'Derived descriptions after your attempt';
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

function responseFromForm(model: ClauseRailModel, form: HTMLFormElement): ClauseRailResponse | null {
    const data = new FormData(form);
    const placements = model.payload.rounds.map(round => {
        const optionId = data.get(`${model.id}:${round.id}:option`);
        const row = form.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
        if (typeof optionId !== 'string' || !row) return null;
        return { roundId: round.id, optionId, attached: row.dataset.attachedOptionId === optionId };
    });
    return placements.every((placement): placement is ClauseRailResponse['placements'][number] => placement !== null)
        ? { placements }
        : null;
}
