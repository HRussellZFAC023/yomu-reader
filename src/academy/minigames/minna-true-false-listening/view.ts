import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, setPending, showEvaluation, statusRegion } from '../activity-kit/shared';
import type {
    MinnaTrueFalseListeningModel,
    MinnaTrueFalseListeningResponse,
    MinnaTrueFalseTask,
    MinnaTruthMark,
} from './manifest';

export function renderMinnaTrueFalseListening(
    model: MinnaTrueFalseListeningModel,
    host: ActivityHost,
    submit: (response: MinnaTrueFalseListeningResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-minna-true-false-listening';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const caption = document.createElement('p');
    caption.append(...localizedNodes(model.payload.sourceCaption));
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = model.provenance.moodle.audio.url;
    audio.dataset.sourceSha256 = model.provenance.moodle.audio.payloadSha256;
    audio.setAttribute('aria-label', model.provenance.moodle.audio.label);
    const form = document.createElement('form');
    form.className = 'academy-minna-true-false-listening-form';
    form.setAttribute('aria-labelledby', heading.id);
    model.payload.tasks.forEach(task => form.append(renderTask(model, task, host.language)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-minna-true-false-listening-submit';
    check.textContent = host.language === 'ja'
        ? `${model.payload.tasks.length}つの○・×を確認する`
        : `Check all ${model.payload.tasks.length} marks`;
    const status = statusRegion('academy-kit-feedback academy-minna-true-false-listening-feedback');
    form.append(check);
    root.append(heading, caption, audio, form, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? `${model.payload.tasks.length}つすべてに○か×を付けてください。`
                : `Mark all ${model.payload.tasks.length} statements with a circle or cross.`;
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            appendPostAttemptSupport(root, model, host.language);
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                showMissedTasksOnly(form, evaluation.result.errorTags);
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

function renderTask(
    model: MinnaTrueFalseListeningModel,
    task: MinnaTrueFalseTask,
    language: 'ja' | 'en' | undefined,
): HTMLElement {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.sourceQuestionId = task.sourceQuestionId;
    fieldset.dataset.errorTag = task.errorTag;
    const legend = document.createElement('legend');
    legend.textContent = language === 'ja' ? `${task.sourceOrder}番の文` : `Statement ${task.sourceOrder}`;
    fieldset.append(legend);
    fieldset.append(markOption(model, task, 'circle', '○', language === 'ja' ? '正しい' : 'True'));
    fieldset.append(markOption(model, task, 'cross', '×', language === 'ja' ? '正しくない' : 'False'));
    return fieldset;
}

function showMissedTasksOnly(form: HTMLFormElement, errorTags: readonly string[]): void {
    const missed = new Set(errorTags);
    form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-error-tag]').forEach(fieldset => {
        fieldset.hidden = !missed.has(fieldset.dataset.errorTag ?? '');
    });
}

function markOption(
    model: MinnaTrueFalseListeningModel,
    task: MinnaTrueFalseTask,
    mark: MinnaTruthMark,
    symbol: string,
    labelText: string,
): HTMLLabelElement {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `${model.id}:${task.id}`;
    input.value = mark;
    input.required = true;
    const markNode = document.createElement('span');
    markNode.className = 'academy-minna-true-false-listening-mark';
    markNode.setAttribute('aria-hidden', 'true');
    markNode.textContent = symbol;
    const copy = document.createElement('span');
    copy.textContent = labelText;
    label.append(input, markNode, copy);
    return label;
}

function appendPostAttemptSupport(
    root: HTMLElement,
    model: MinnaTrueFalseListeningModel,
    language: 'ja' | 'en' | undefined,
): void {
    if (root.querySelector('[data-listening-support]')) return;
    const support = document.createElement('section');
    support.className = 'academy-minna-true-false-listening-support';
    support.dataset.listeningSupport = 'after-attempt';
    const title = document.createElement('h3');
    title.textContent = language === 'ja' ? '試行後の音声台本と○・×' : 'Audio transcript and marks after your attempt';
    const transcript = document.createElement('ol');
    for (const task of model.payload.tasks) {
        const item = document.createElement('li');
        const dialogue = document.createElement('ul');
        model.payload.transcript.filter(line => line.item === task.sourceOrder).forEach(line => {
            const lineItem = document.createElement('li');
            lineItem.textContent = `${line.speaker}: ${line.text}`;
            dialogue.append(lineItem);
        });
        item.append(dialogue);
        transcript.append(item);
    }
    const answers = document.createElement('ol');
    answers.className = 'academy-minna-true-false-listening-answers';
    model.payload.tasks.forEach(task => {
        const item = document.createElement('li');
        item.textContent = `${task.correctMark === 'circle' ? '○' : '×'} ${task.statement}`;
        answers.append(item);
    });
    support.append(title, transcript, answers);
    root.append(support);
}

function responseFromForm(
    model: MinnaTrueFalseListeningModel,
    form: HTMLFormElement,
): MinnaTrueFalseListeningResponse | undefined {
    const data = new FormData(form);
    const answers = model.payload.tasks.map(task => {
        const mark = data.get(`${model.id}:${task.id}`);
        return mark === 'circle' || mark === 'cross' ? { taskId: task.id, mark } : undefined;
    });
    return answers.every((answer): answer is MinnaTrueFalseListeningResponse['answers'][number] => answer !== undefined)
        ? { answers }
        : undefined;
}
