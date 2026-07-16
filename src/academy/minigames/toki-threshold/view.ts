import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, setPending, showEvaluation, statusRegion } from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';
import type { TokiThresholdModel, TokiThresholdResponse, TokiThresholdRound, TokiTiming } from './manifest';

export function renderTokiThreshold(
    model: TokiThresholdModel,
    host: ActivityHost,
    submit: (response: TokiThresholdResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-toki-threshold';
    root.dataset.activityId = model.id;

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const sources = renderSources(model, host.language);
    const form = document.createElement('form');
    form.className = 'academy-toki-threshold-form';
    form.setAttribute('aria-labelledby', heading.id);
    const taskHeading = document.createElement('h3');
    taskHeading.textContent = model.payload.taskHeading;
    const rounds = document.createElement('ol');
    rounds.className = 'academy-toki-threshold-rounds';
    model.payload.rounds.forEach(round => rounds.append(renderRound(model, round, host)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-toki-threshold-check';
    check.textContent = host.language === 'ja' ? '四つの境目を確認する' : 'Check the four thresholds';
    form.append(taskHeading, rounds, check);

    const actions = document.createElement('div');
    actions.className = 'academy-toki-threshold-actions';
    const returnToTeaching = document.createElement('button');
    returnToTeaching.type = 'button';
    returnToTeaching.className = 'academy-button academy-button-secondary academy-toki-threshold-return';
    returnToTeaching.textContent = host.language === 'ja' ? '先生の説明へ戻る' : 'Return to Sensei’s teaching';
    returnToTeaching.hidden = true;
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'academy-button academy-button-secondary academy-toki-threshold-replay';
    replay.textContent = host.language === 'ja' ? '四つの境目をもう一度' : 'Replay all four thresholds';
    replay.hidden = true;
    actions.append(returnToTeaching, replay);
    const key = renderAnswerKey(model, host.language);
    const status = statusRegion('academy-kit-feedback academy-toki-threshold-feedback');
    root.append(heading, teaching, sources, form, actions, key, status);
    host.replace(root);

    returnToTeaching.addEventListener('click', () => {
        const teachingHeading = teaching.querySelector<HTMLElement>('h3');
        teachingHeading?.focus();
        teaching.scrollIntoView?.({ block: 'start' });
        host.announce(host.language === 'ja' ? '先生の説明に戻りました。' : 'Returned to Sensei’s teaching.');
    }, { signal: lifecycle.signal });

    replay.addEventListener('click', () => {
        resetForReplay(rounds, form, key, returnToTeaching, replay, host.language);
        form.querySelector<HTMLInputElement>('input')?.focus();
        host.announce(host.language === 'ja' ? '四つの境目をもう一度選べます。' : 'All four thresholds are ready for a fresh replay.');
    }, { signal: lifecycle.signal });

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? '四つの問題で「前」か「後」を一つずつ選んでください。'
                : 'Choose before or after for each of the four source bubbles.';
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
                form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')
                    .forEach(control => { control.disabled = true; });
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

function renderTeaching(model: TokiThresholdModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-toki-threshold-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const block = document.createElement('section');
        const heading = document.createElement('h3');
        heading.tabIndex = -1;
        heading.textContent = step.title;
        const copy = document.createElement('p');
        copy.className = 'academy-japanese academy-toki-threshold-source-text';
        copy.textContent = step.text;
        block.append(heading, copy);
        section.append(block);
    });
    return section;
}

function renderSources(model: TokiThresholdModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-toki-threshold-sources';
    section.dataset.lessonPhase = 'source-reference';
    model.provenance.moodle.sourceSheets.forEach(visual => {
        section.append(renderInspectableSourceVisual(visual, language, 'academy-toki-threshold-source'));
    });
    return section;
}

function renderRound(model: TokiThresholdModel, round: TokiThresholdRound, host: ActivityHost): HTMLElement {
    const item = document.createElement('li');
    item.className = 'academy-toki-threshold-round';
    item.dataset.roundId = round.id;
    item.dataset.sourceQuestionId = round.sourceQuestionId;
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = round.sourcePrompt;
    const controls = document.createElement('div');
    controls.className = 'academy-toki-threshold-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', host.language === 'ja' ? '行動の境目' : 'Action threshold');
    controls.append(
        timingChoice(model.id, round, 'before', host),
        timingChoice(model.id, round, 'after', host),
    );
    const output = document.createElement('div');
    output.className = 'academy-toki-threshold-monitor academy-japanese';
    output.lang = 'ja';
    output.setAttribute('aria-live', 'polite');
    controls.addEventListener('change', () => updateMonitor(round, fieldset, output, host));
    fieldset.append(legend, controls, output);
    item.append(fieldset);
    updateMonitor(round, fieldset, output, host);
    return item;
}

function timingChoice(
    modelId: string,
    round: TokiThresholdRound,
    timing: TokiTiming,
    host: ActivityHost,
): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = `academy-toki-threshold-choice academy-toki-threshold-${timing}`;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `${modelId}:${round.id}:timing`;
    input.value = timing;
    const title = document.createElement('strong');
    title.textContent = timing === 'before'
        ? (host.language === 'ja' ? '完了する前' : 'Before completion')
        : (host.language === 'ja' ? '完了した後' : 'After completion');
    const form = document.createElement('span');
    form.className = 'academy-japanese';
    form.lang = 'ja';
    form.textContent = timing === 'before' ? round.beforeForm : round.afterForm;
    label.append(input, title, form);
    return label;
}

function updateMonitor(
    round: TokiThresholdRound,
    fieldset: HTMLElement,
    output: HTMLElement,
    host: ActivityHost,
): void {
    const timing = fieldset.querySelector<HTMLInputElement>('input:checked')?.value;
    if (timing === 'before') {
        output.textContent = `${host.language === 'ja' ? '完了する前' : 'Before completion'}: ${round.beforeForm}`;
    } else if (timing === 'after') {
        output.textContent = `${host.language === 'ja' ? '完了した後' : 'After completion'}: ${round.afterForm}`;
    } else {
        output.textContent = host.language === 'ja' ? '境目の前／後を選びます。' : 'Choose a side of the threshold.';
    }
}

function showRepairRows(
    model: TokiThresholdModel,
    list: HTMLElement,
    errorTags: readonly string[],
    host: ActivityHost,
): void {
    model.payload.rounds.forEach(round => {
        const item = list.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
        if (!item) return;
        const missed = errorTags.includes(round.errorTag);
        item.hidden = !missed;
        if (!missed || item.querySelector('.academy-toki-threshold-hints')) return;
        item.append(renderHints(model.id, round, host));
    });
}

function renderHints(modelId: string, round: TokiThresholdRound, host: ActivityHost): HTMLElement {
    const root = document.createElement('section');
    root.className = 'academy-toki-threshold-hints';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-button academy-button-secondary academy-toki-threshold-hint';
    button.textContent = host.language === 'ja' ? 'ヒントを見る' : 'Show earned hint';
    const output = statusRegion('academy-toki-threshold-hint-output');
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

function renderAnswerKey(model: TokiThresholdModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-toki-threshold-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.textContent = language === 'ja' ? '試したあとの派生文' : 'Derived sentences after your attempt';
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

function responseFromForm(model: TokiThresholdModel, form: HTMLFormElement): TokiThresholdResponse | null {
    const data = new FormData(form);
    const thresholds = model.payload.rounds.map(round => {
        const timing = data.get(`${model.id}:${round.id}:timing`);
        return timing === 'before' || timing === 'after' ? { roundId: round.id, timing } : null;
    });
    return thresholds.every((threshold): threshold is TokiThresholdResponse['thresholds'][number] => threshold !== null)
        ? { thresholds }
        : null;
}

function resetForReplay(
    rounds: HTMLElement,
    form: HTMLFormElement,
    key: HTMLElement,
    returnButton: HTMLButtonElement,
    replayButton: HTMLButtonElement,
    language: 'ja' | 'en' | undefined,
): void {
    form.reset();
    form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(control => { control.disabled = false; });
    rounds.querySelectorAll<HTMLElement>('.academy-toki-threshold-round').forEach(item => {
        item.hidden = false;
        item.querySelector('.academy-toki-threshold-hints')?.remove();
        const monitor = item.querySelector<HTMLElement>('.academy-toki-threshold-monitor');
        if (monitor) monitor.textContent = language === 'ja'
            ? '境目の前／後を選びます。'
            : 'Choose a side of the threshold.';
    });
    key.hidden = true;
    returnButton.hidden = true;
    replayButton.hidden = true;
}
