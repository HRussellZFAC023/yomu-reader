import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, setPending, showEvaluation, statusRegion } from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';
import type { ConversationListeningCheckModel, ConversationListeningCheckResponse, ConversationListeningTask } from './manifest';

export function renderConversationListeningCheck(
    model: ConversationListeningCheckModel,
    host: ActivityHost,
    submit: (response: ConversationListeningCheckResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-conversation-listening-check';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const caption = document.createElement('p');
    caption.append(...localizedNodes(model.payload.sourceCaption));
    const source = renderInspectableSourceVisual({
        title: model.provenance.moodle.worksheet.title,
        page: model.provenance.moodle.worksheet.page,
        url: model.provenance.moodle.worksheet.url,
        sha256: model.provenance.moodle.worksheet.sha256,
        alt: {
            ja: `先生の ${model.provenance.moodle.worksheet.title}、1ページ目`,
            en: `Sensei's ${model.provenance.moodle.worksheet.title}, page 1`,
        },
    }, host.language, 'academy-conversation-listening-check-source');
    source.dataset.lessonPhase = 'source-reference';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = model.provenance.moodle.audio.url;
    audio.dataset.sourceSha256 = model.provenance.moodle.audio.payloadSha256;
    audio.setAttribute('aria-label', model.provenance.moodle.audio.label);
    const form = document.createElement('form');
    form.className = 'academy-conversation-listening-check-form';
    form.setAttribute('aria-labelledby', heading.id);
    model.payload.tasks.forEach(task => form.append(renderTask(model, task)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-conversation-listening-check-submit';
    check.textContent = host.language === 'ja'
        ? `${model.payload.tasks.length}つの答えを確認する`
        : `Check all ${model.payload.tasks.length} answers`;
    const status = statusRegion('academy-kit-feedback academy-conversation-listening-check-feedback');
    form.append(check);
    root.append(heading, caption, source, audio, form, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? `${model.payload.tasks.length}つの質問にすべて答えてください。`
                : `Answer all ${model.payload.tasks.length} source questions.`;
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            appendPostAttemptSupport(root, model, host.language);
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(root, false);
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return { focus() { form.querySelector<HTMLInputElement>('input')?.focus(); }, dispose() { lifecycle.abort(); root.remove(); } };
}

function renderTask(model: ConversationListeningCheckModel, task: ConversationListeningTask): HTMLElement {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.sourceQuestionId = task.sourceQuestionId;
    const legend = document.createElement('legend');
    legend.textContent = `${task.sourceOrder}) ${task.prompt}`;
    fieldset.append(legend);
    const label = document.createElement('label');
    const copy = document.createElement('span');
    copy.textContent = '答え';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.lang = 'ja';
    input.dataset.jpdbReaderSurfaceIgnore = '';
    input.name = `${model.id}:${task.id}`;
    input.setAttribute('aria-label', `${task.sourceOrder}: ${task.prompt}`);
    label.append(copy, input);
    fieldset.append(label);
    return fieldset;
}

function appendPostAttemptSupport(root: HTMLElement, model: ConversationListeningCheckModel, language: 'ja' | 'en' | undefined): void {
    if (root.querySelector('[data-listening-support]')) return;
    const support = document.createElement('section');
    support.className = 'academy-conversation-listening-check-support';
    support.dataset.listeningSupport = 'after-attempt';
    const title = document.createElement('h3');
    title.textContent = language === 'ja' ? '試行後の先生の台本と答え' : 'Sensei’s transcript and answers after your attempt';
    const transcript = document.createElement('ol');
    model.payload.transcript.forEach(line => {
        const item = document.createElement('li');
        item.textContent = `${line.speaker}: ${line.text}`;
        transcript.append(item);
    });
    const answers = document.createElement('ol');
    answers.className = 'academy-conversation-listening-check-answers';
    model.payload.tasks.forEach(task => {
        const item = document.createElement('li');
        item.textContent = task.answer;
        answers.append(item);
    });
    support.append(title, transcript, answers);
    root.append(support);
}

function responseFromForm(model: ConversationListeningCheckModel, form: HTMLFormElement): ConversationListeningCheckResponse | undefined {
    const data = new FormData(form);
    const answers = model.payload.tasks.map(task => ({ taskId: task.id, value: String(data.get(`${model.id}:${task.id}`) ?? '') }));
    if (answers.some(answer => !answer.value.trim())) return undefined;
    return { answers };
}
