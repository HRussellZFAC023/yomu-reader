import './style.css';

import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type ReviewSeed,
    type ValidationIssue,
} from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import {
    gradeFromScore,
    localizedNodes,
    normalizeJapanese,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';

export interface DiaryListeningClozeField {
    readonly id: string;
    readonly before: string;
    readonly after: string;
    readonly answer: string;
}

export interface DiaryListeningClozeTask {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3;
    readonly prompt: string;
    readonly fields: readonly DiaryListeningClozeField[];
    readonly conceptId: string;
    readonly errorTag: string;
    readonly reviewExpression: string;
}

export interface DiaryListeningClozeModel extends ActivityModel {
    readonly kind: 'academy-diary-listening-cloze';
    readonly responseKind: 'moodle-b25-diary-cloze';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l2-l05';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6974651;
            readonly worksheet: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly title: 'Handouts/Chapter 20 listening .pdf';
                readonly page: 1;
                readonly url: string;
                readonly sha256: string;
            };
            readonly audio: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly locator: string;
                readonly url: string;
                readonly durationSeconds: 89.453333;
            };
            readonly answerKeyBasis: 'source-worksheet-blanks-and-audio-reviewed-b25-forms';
        };
    };
    readonly payload: {
        readonly sourceCaption: LocalizedText;
        readonly tasks: readonly DiaryListeningClozeTask[];
        readonly transcript: readonly Readonly<{ speaker: string; text: string }>[];
        readonly feedback: ActivityFeedbackSet;
    };
}

export interface DiaryListeningClozeResponse {
    readonly values: readonly Readonly<{ taskId: string; fieldId: string; value: string }>[];
}

export const diaryListeningClozePlugin: ActivityPlugin<DiaryListeningClozeModel, DiaryListeningClozeResponse> = {
    kind: 'academy-diary-listening-cloze',
    validate,
    render,
    grade(model, response) {
        const values = parseResponse(model, response);
        const errors = model.payload.tasks.flatMap(task => task.fields.every(field =>
            values.get(key(task.id, field.id)) === normalizeJapanese(field.answer),
        ) ? [] : [task.errorTag]);
        return gradeFromScore(errors.length === 0 ? 1 : (model.payload.tasks.length - errors.length) / model.payload.tasks.length, 1, errors, model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        return model.payload.tasks.flatMap(task => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(task.errorTag)) return [];
            return [{
                id: `review:l2-l05:b25:${task.id}`,
                conceptId: task.conceptId,
                reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
                sourceQuestionId: task.sourceQuestionId,
                content: { expression: task.reviewExpression, meanings: [task.prompt] },
            } satisfies ReviewSeed];
        });
    },
};

function validate(model: DiaryListeningClozeModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const moodle = model.provenance?.moodle;
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) issues.push({ path: 'answerSupport', message: 'Assessed answer support is required.' });
    if (model.provenance?.packageId !== 'l2-l05' || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== 6974651 || moodle.worksheet?.payloadSha256 !== 'a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd'
        || moodle.worksheet.title !== 'Handouts/Chapter 20 listening .pdf' || moodle.worksheet.page !== 1
        || moodle.worksheet.sha256 !== 'f14322b70639277f686d7ebffec147e04fa99687e21b61795d2a3d4fb9cce975'
        || moodle.audio?.payloadSha256 !== '2e5d1ee1e18a31b72e826670a3f6aec1c0f513a6e2f05b654e04b199ad4939f3'
        || moodle.audio.durationSeconds !== 89.453333
        || moodle.answerKeyBasis !== 'source-worksheet-blanks-and-audio-reviewed-b25-forms') {
        issues.push({ path: 'provenance.moodle', message: 'The exact B-25 worksheet, audio, and reviewed-answer basis are required.' });
    }
    if (!/^\/academy\/content\/listening\/media\/academy-listening-[a-f0-9]{16}\.mp3$/u.test(moodle?.audio?.url ?? '')) {
        issues.push({ path: 'provenance.moodle.audio.url', message: 'B-25 must use the exact packaged listening binding.' });
    }
    if (!text(model.payload?.sourceCaption?.ja) || !text(model.payload?.sourceCaption?.en)) issues.push({ path: 'payload.sourceCaption', message: 'A bilingual source caption is required.' });
    const tasks = model.payload?.tasks;
    if (!Array.isArray(tasks) || tasks.length !== 3 || tasks.map(task => task.sourceOrder).join(',') !== '1,2,3'
        || tasks.reduce((count, task) => count + task.fields.length, 0) !== 5) {
        issues.push({ path: 'payload.tasks', message: 'The three source-order B-25 diary items and five blanks are required.' });
    } else {
        const ids = new Set<string>();
        tasks.forEach((task, taskIndex) => {
            if (!text(task.id) || ids.has(task.id) || !text(task.sourceQuestionId) || !text(task.prompt)
                || !model.conceptIds.includes(task.conceptId) || !text(task.errorTag) || !text(task.reviewExpression)
                || !task.fields.length || task.fields.some((field: DiaryListeningClozeField) => !text(field.id) || !text(field.before) || !text(field.after) || !text(field.answer))) {
                issues.push({ path: `payload.tasks.${taskIndex}`, message: 'Every B-25 item needs exact prompt fragments, answers, and review identity.' });
            }
            ids.add(task.id);
        });
    }
    if (!Array.isArray(model.payload?.transcript) || model.payload.transcript.length === 0
        || model.payload.transcript.some(line => !text(line.speaker) || !text(line.text))) {
        issues.push({ path: 'payload.transcript', message: 'A reviewed post-attempt B-25 transcript is required.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function render(
    model: DiaryListeningClozeModel,
    host: ActivityHost,
    submit: (response: DiaryListeningClozeResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-diary-listening-cloze';
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
            ja: 'Moodle の Chapter 20 listening 1ページ目',
            en: 'Moodle Chapter 20 listening, page 1',
        },
    }, host.language, 'academy-diary-listening-cloze-source');
    source.dataset.lessonPhase = 'source-reference';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = model.provenance.moodle.audio.url;
    audio.dataset.sourceSha256 = model.provenance.moodle.audio.payloadSha256;
    audio.setAttribute('aria-label', 'CD B-25');
    const form = document.createElement('form');
    form.className = 'academy-diary-listening-cloze-form';
    form.setAttribute('aria-labelledby', heading.id);
    model.payload.tasks.forEach(task => form.append(renderTask(model, task)));
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'academy-button academy-button-primary academy-diary-listening-cloze-check';
    submitButton.textContent = host.language === 'ja' ? '絵日記を確認する' : 'Check the diary';
    const status = statusRegion('academy-kit-feedback academy-diary-listening-cloze-feedback');
    form.append(submitButton);
    root.append(heading, caption, source, audio, form, status);
    host.replace(root);
    form.addEventListener('submit', event => {
        event.preventDefault();
        setPending(root, true);
        void submit(responseFromForm(model, form)).then(evaluation => {
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

function renderTask(model: DiaryListeningClozeModel, task: DiaryListeningClozeTask): HTMLElement {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.sourceQuestionId = task.sourceQuestionId;
    const legend = document.createElement('legend');
    legend.textContent = `${task.sourceOrder}) ${task.prompt}`;
    fieldset.append(legend);
    task.fields.forEach(field => {
        const row = document.createElement('label');
        const before = document.createElement('span');
        before.lang = 'ja';
        before.textContent = field.before;
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.lang = 'ja';
        input.dataset.jpdbReaderSurfaceIgnore = '';
        input.name = inputName(model, task.id, field.id);
        input.setAttribute('aria-label', `${task.sourceOrder}: ${field.before} blank ${field.after}`);
        const after = document.createElement('span');
        after.lang = 'ja';
        after.textContent = field.after;
        row.append(before, input, after);
        fieldset.append(row);
    });
    return fieldset;
}

function appendPostAttemptSupport(root: HTMLElement, model: DiaryListeningClozeModel, language: 'ja' | 'en' | undefined): void {
    if (root.querySelector('[data-listening-support]')) return;
    const support = document.createElement('section');
    support.className = 'academy-diary-listening-cloze-support';
    support.dataset.listeningSupport = 'after-attempt';
    const title = document.createElement('h3');
    title.textContent = language === 'ja' ? '試行後の台本と答え' : 'Transcript and answers after your attempt';
    const transcript = document.createElement('ol');
    model.payload.transcript.forEach(line => {
        const item = document.createElement('li');
        item.textContent = `${line.speaker}: ${line.text}`;
        transcript.append(item);
    });
    const answers = document.createElement('dl');
    model.payload.tasks.forEach(task => task.fields.forEach(field => {
        const term = document.createElement('dt');
        term.textContent = `${task.sourceOrder}) ${field.before}＿${field.after}`;
        const definition = document.createElement('dd');
        definition.textContent = field.answer;
        answers.append(term, definition);
    }));
    support.append(title, transcript, answers);
    root.append(support);
}

function responseFromForm(model: DiaryListeningClozeModel, form: HTMLFormElement): DiaryListeningClozeResponse {
    const data = new FormData(form);
    return { values: model.payload.tasks.flatMap(task => task.fields.map(field => ({ taskId: task.id, fieldId: field.id, value: String(data.get(inputName(model, task.id, field.id)) ?? '') }))) };
}

function parseResponse(model: DiaryListeningClozeModel, response: DiaryListeningClozeResponse): ReadonlyMap<string, string> {
    const fields = model.payload.tasks.flatMap(task => task.fields.map(field => ({ task, field })));
    if (!response || !Array.isArray(response.values) || response.values.length !== fields.length) throw new TypeError('Every exact B-25 blank needs one response.');
    const values = new Map<string, string>();
    response.values.forEach(value => {
        const task = model.payload.tasks.find(candidate => candidate.id === value.taskId);
        const field = task?.fields.find(candidate => candidate.id === value.fieldId);
        const responseKey = task && field ? key(task.id, field.id) : undefined;
        if (!responseKey || values.has(responseKey) || typeof value.value !== 'string') throw new TypeError('B-25 responses must address each exact source blank once.');
        values.set(responseKey, normalizeJapanese(value.value));
    });
    return values;
}

function inputName(model: DiaryListeningClozeModel, taskId: string, fieldId: string): string { return `${model.id}:${taskId}:${fieldId}`; }
function key(taskId: string, fieldId: string): string { return `${taskId}/${fieldId}`; }
