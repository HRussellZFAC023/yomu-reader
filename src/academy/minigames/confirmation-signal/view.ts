import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, setPending, showEvaluation, statusRegion } from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';
import type { ConfirmationSignalModel, ConfirmationSignalResponse, ConfirmationSignalRound } from './manifest';

export function renderConfirmationSignal(
    model: ConfirmationSignalModel,
    host: ActivityHost,
    submit: (response: ConfirmationSignalResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-confirmation-signal';
    root.dataset.activityId = model.id;

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));

    const teaching = renderTeaching(model);
    const source = renderSource(model, host.language);
    const form = document.createElement('form');
    form.className = 'academy-confirmation-signal-form';
    form.setAttribute('aria-labelledby', heading.id);
    const rounds = document.createElement('ol');
    rounds.className = 'academy-confirmation-signal-rounds';
    model.payload.rounds.forEach(round => rounds.append(renderRound(model, round, host.language)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-confirmation-signal-check';
    check.textContent = host.language === 'ja' ? '四つの信号を確認する' : 'Check the four signals';
    form.append(rounds, check);

    const returnToSource = document.createElement('button');
    returnToSource.type = 'button';
    returnToSource.className = 'academy-button academy-button-secondary academy-confirmation-signal-return';
    returnToSource.textContent = host.language === 'ja' ? '先生の説明へ戻る' : 'Return to Sensei’s teaching';
    returnToSource.hidden = true;
    const key = renderAnswerKey(model, host.language);
    const status = statusRegion('academy-kit-feedback academy-confirmation-signal-feedback');
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
                ? '四つの文で形を一つずつ選んでください。'
                : 'Choose one completion for each of the four sentences.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            key.hidden = false;
            returnToSource.hidden = false;
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
        focus() { form.querySelector<HTMLInputElement>('input[type="radio"]')?.focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderTeaching(model: ConfirmationSignalModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-confirmation-signal-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const block = document.createElement('section');
        const heading = document.createElement('h3');
        heading.tabIndex = -1;
        heading.textContent = step.title;
        const text = document.createElement('p');
        text.className = 'academy-japanese academy-confirmation-signal-source-text';
        text.lang = step.title === 'Basic sentence:' ? 'ja' : 'en';
        text.textContent = step.text;
        block.append(heading, text);
        section.append(block);
    });
    return section;
}

function renderSource(model: ConfirmationSignalModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const visual = model.provenance.moodle.sourceSheet;
    const figure = renderInspectableSourceVisual(visual, language, 'academy-confirmation-signal-source');
    figure.dataset.lessonPhase = 'source-reference';
    return figure;
}

function renderRound(
    model: ConfirmationSignalModel,
    round: ConfirmationSignalRound,
    language: 'ja' | 'en' | undefined,
): HTMLElement {
    const item = document.createElement('li');
    item.className = 'academy-confirmation-signal-round';
    item.dataset.roundId = round.id;
    item.dataset.sourceQuestionId = round.sourceQuestionId;
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = `${language === 'ja' ? '先生の問題' : 'Sensei item'} ${round.sourceOrder}: ${round.sourcePrompt}`;
    const options = document.createElement('div');
    options.className = 'academy-confirmation-signal-options';
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
        label.append(input, copy);
        options.append(label);
    });
    const intonation = document.createElement('label');
    intonation.className = 'academy-confirmation-signal-intonation';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.name = `${model.id}:${round.id}:rising`;
    const toggleCopy = document.createElement('span');
    toggleCopy.textContent = language === 'ja' ? '上がるイントネーション ↗' : 'Rising intonation ↗';
    intonation.append(toggle, toggleCopy);
    fieldset.append(legend, options, intonation);
    item.append(fieldset);
    return item;
}

function showRepairRows(
    model: ConfirmationSignalModel,
    list: HTMLElement,
    errorTags: readonly string[],
    host: ActivityHost,
): void {
    model.payload.rounds.forEach(round => {
        const item = list.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
        if (!item) return;
        const missed = errorTags.includes(round.errorTag);
        item.hidden = !missed;
        if (!missed || item.querySelector('.academy-confirmation-signal-hints')) return;
        item.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.checked = false; });
        item.append(renderHints(model.id, round, host));
    });
}

function renderHints(modelId: string, round: ConfirmationSignalRound, host: ActivityHost): HTMLElement {
    const root = document.createElement('section');
    root.className = 'academy-confirmation-signal-hints';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-button academy-button-secondary academy-confirmation-signal-hint';
    button.textContent = host.language === 'ja' ? 'ヒントを見る' : 'Show earned hint';
    const output = statusRegion('academy-confirmation-signal-hint-output');
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

function renderAnswerKey(model: ConfirmationSignalModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-confirmation-signal-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.textContent = language === 'ja' ? '試したあとの確認文' : 'Derived confirmations after your attempt';
    const answers = document.createElement('ol');
    model.payload.rounds.forEach(round => {
        const item = document.createElement('li');
        item.textContent = `${round.answerExpression} ↗`;
        answers.append(item);
    });
    section.append(heading, answers);
    return section;
}

function responseFromForm(
    model: ConfirmationSignalModel,
    form: HTMLFormElement,
): ConfirmationSignalResponse | null {
    const data = new FormData(form);
    const signals = model.payload.rounds.map(round => {
        const optionId = data.get(`${model.id}:${round.id}:option`);
        if (typeof optionId !== 'string') return null;
        return {
            roundId: round.id,
            optionId,
            rising: data.has(`${model.id}:${round.id}:rising`),
        };
    });
    return signals.every((signal): signal is ConfirmationSignalResponse['signals'][number] => signal !== null)
        ? { signals }
        : null;
}
