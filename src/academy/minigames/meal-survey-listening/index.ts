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

export type MealSurveyListeningTask = Readonly<{
    id: string;
    sourceOrder: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    sourceQuestionId: string;
    prompt: string;
    kind: 'choice' | 'text';
    options?: readonly string[];
    answer: string;
    acceptedAnswers: readonly string[];
    conceptId: string;
    errorTag: string;
}>;

export interface MealSurveyListeningModel extends ActivityModel {
    readonly kind: 'academy-meal-survey-listening';
    readonly responseKind: 'moodle-a11-meal-survey';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l2-l13';
        readonly packageOrder: 40;
        readonly answerVisibility: 'after-attempt';
        readonly repairScope: 'missed-source-items-only';
        readonly moodle: {
            readonly moduleId: 8121266;
            readonly archiveId: 'archive-000092';
            readonly archiveSha256: string;
            readonly worksheet: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly title: string;
                readonly page: 1;
                readonly url: string;
                readonly sha256: string;
            };
            readonly audio: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly locator: string;
                readonly url: string;
                readonly durationSeconds: 83.12;
            };
            readonly answerKeyBasis: 'worksheet-a11-loci-and-original-audio-reviewed';
            readonly excludedWorksheetSection: 'a12-lower-section-not-paired-with-a11';
        };
    };
    readonly payload: {
        readonly sourceCaption: LocalizedText;
        readonly prerequisiteContext: readonly Readonly<{ pattern: string; explanation: LocalizedText }>[];
        readonly instruction: string;
        readonly tasks: readonly MealSurveyListeningTask[];
        readonly transcript: readonly Readonly<{ speaker: string; text: string }>[];
        readonly feedback: ActivityFeedbackSet;
    };
}

export interface MealSurveyListeningResponse {
    readonly answers: readonly Readonly<{ taskId: string; value: string }>[];
}

export const mealSurveyListeningPlugin: ActivityPlugin<MealSurveyListeningModel, MealSurveyListeningResponse> = {
    kind: 'academy-meal-survey-listening',
    validate,
    render,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const errors = model.payload.tasks.flatMap(task => task.acceptedAnswers.some(candidate => (
            normalizeJapanese(candidate) === answers.get(task.id)
        )) ? [] : [task.errorTag]);
        return gradeFromScore((model.payload.tasks.length - errors.length) / model.payload.tasks.length, 1, errors, model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        return model.payload.tasks.flatMap(task => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(task.errorTag)) return [];
            return [{
                id: `review:l2-l13:a11:${task.id}`,
                conceptId: task.conceptId,
                reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
                sourceQuestionId: task.sourceQuestionId,
                content: { expression: task.answer, meanings: [task.prompt] },
            } satisfies ReviewSeed];
        });
    },
};

function validate(model: MealSurveyListeningModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const moodle = model.provenance?.moodle;
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) issues.push({ path: 'answerSupport', message: 'Assessed answer support is required.' });
    if (model.provenance?.packageId !== 'l2-l13' || model.provenance.packageOrder !== 40
        || model.provenance.answerVisibility !== 'after-attempt' || model.provenance.repairScope !== 'missed-source-items-only'
        || moodle?.moduleId !== 8121266 || moodle.archiveId !== 'archive-000092'
        || moodle.archiveSha256 !== 'f1ce9163abbe23a99c1e0fbe29973c8f3f68630cc6cbcd872a6e91ea75fe4217'
        || moodle.worksheet?.payloadSha256 !== '3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9'
        || moodle.worksheet.page !== 1 || moodle.worksheet.sha256 !== '18b086df7e2a30592a4a07d60f5fcb575cc2415e02f1b18c6dcfce415f7bb868'
        || moodle.audio?.payloadSha256 !== '596a4499996bd9599a169a8ae9171a0e78fe22a7f9d92bce7045203b794baf25'
        || moodle.audio.durationSeconds !== 83.12
        || moodle.answerKeyBasis !== 'worksheet-a11-loci-and-original-audio-reviewed'
        || moodle.excludedWorksheetSection !== 'a12-lower-section-not-paired-with-a11') {
        issues.push({ path: 'provenance.moodle', message: 'The exact A-11 worksheet section, audio bytes, and reviewed answer basis are required.' });
    }
    if (!/^\/academy\/content\/listening\/media\/academy-listening-[a-f0-9]{16}\.mp3$/u.test(moodle?.audio?.url ?? '')) {
        issues.push({ path: 'provenance.moodle.audio.url', message: 'A-11 must use its packaged listening binding.' });
    }
    if (!text(model.payload?.sourceCaption?.ja) || !text(model.payload?.sourceCaption?.en)
        || !Array.isArray(model.payload?.prerequisiteContext) || model.payload.prerequisiteContext.length !== 4
        || model.payload.prerequisiteContext.some(item => !text(item.pattern) || !text(item.explanation?.ja) || !text(item.explanation?.en))) {
        issues.push({ path: 'payload.prerequisiteContext', message: 'Four bilingual meal-survey prerequisites are required before assessment.' });
    }
    const tasks = model.payload?.tasks;
    if (!Array.isArray(tasks) || tasks.length !== 7 || tasks.map(task => task.sourceOrder).join(',') !== '1,2,3,4,5,6,7') {
        issues.push({ path: 'payload.tasks', message: 'All seven A-11 worksheet responses are required in source order.' });
    } else {
        const ids = new Set<string>();
        tasks.forEach((task, index) => {
            const optionsValid = task.kind === 'choice' ? Array.isArray(task.options) && task.options.includes(task.answer) : task.options === undefined;
            if (!text(task.id) || ids.has(task.id) || !text(task.sourceQuestionId) || !text(task.prompt) || !optionsValid
                || !text(task.answer) || !task.acceptedAnswers.some((answer: string) => normalizeJapanese(answer) === normalizeJapanese(task.answer))
                || !model.conceptIds.includes(task.conceptId) || !text(task.errorTag)) {
                issues.push({ path: `payload.tasks.${index}`, message: 'Every A-11 item needs exact identity, source order, response mode, and deterministic answer.' });
            }
            ids.add(task.id);
        });
    }
    if (!Array.isArray(model.payload?.transcript) || model.payload.transcript.length !== 25
        || model.payload.transcript.some(line => !text(line.speaker) || !text(line.text))) {
        issues.push({ path: 'payload.transcript', message: 'The complete reviewed A-11 transcript is required after an attempt.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function render(
    model: MealSurveyListeningModel,
    host: ActivityHost,
    submit: (response: MealSurveyListeningResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-meal-survey-listening';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const context = renderPrerequisiteContext(model, host.language);
    const caption = document.createElement('p');
    caption.append(...localizedNodes(model.payload.sourceCaption));
    const source = renderInspectableSourceVisual({
        title: model.provenance.moodle.worksheet.title,
        page: 1,
        url: model.provenance.moodle.worksheet.url,
        sha256: model.provenance.moodle.worksheet.sha256,
        alt: { ja: 'Moodle の A-11 学生の食事アンケート、1ページ目', en: 'Moodle A-11 student meal survey, page 1' },
    }, host.language, 'academy-meal-survey-listening-source');
    source.dataset.lessonPhase = 'source-reference';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = model.provenance.moodle.audio.url;
    audio.dataset.sourceSha256 = model.provenance.moodle.audio.payloadSha256;
    audio.setAttribute('aria-label', 'A-11');
    const form = document.createElement('form');
    form.className = 'academy-meal-survey-listening-form';
    form.setAttribute('aria-labelledby', heading.id);
    const instruction = document.createElement('p');
    instruction.lang = 'ja';
    instruction.textContent = model.payload.instruction;
    form.append(instruction);
    model.payload.tasks.forEach(task => form.append(renderTask(model, task)));
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'academy-button academy-button-primary academy-meal-survey-listening-check';
    submitButton.textContent = host.language === 'ja' ? 'A-11 を確認する' : 'Check A-11';
    const status = statusRegion('academy-kit-feedback academy-meal-survey-listening-feedback');
    form.append(submitButton);
    root.append(heading, context, caption, source, audio, form, status);
    host.replace(root);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            appendPostAttemptSupport(root, model, host.language);
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                applyMissedOnlyRepair(form, evaluation.result.errorTags);
                submitButton.textContent = host.language === 'ja' ? '間違えた項目だけ再確認' : 'Recheck missed items';
                setPending(root, false);
            }
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });
    return { focus() { form.querySelector<HTMLInputElement>('input:not([hidden])')?.focus(); }, dispose() { lifecycle.abort(); root.remove(); } };
}

function renderPrerequisiteContext(model: MealSurveyListeningModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-meal-survey-listening-context';
    section.dataset.lessonPhase = 'teach-before-assess';
    const title = document.createElement('h3');
    title.textContent = language === 'ja' ? '聞く前の食事アンケート表現' : 'Meal-survey language before listening';
    const list = document.createElement('dl');
    model.payload.prerequisiteContext.forEach(item => {
        const term = document.createElement('dt');
        term.lang = 'ja';
        term.textContent = item.pattern;
        const definition = document.createElement('dd');
        definition.append(...localizedNodes(item.explanation));
        list.append(term, definition);
    });
    section.append(title, list);
    return section;
}

function renderTask(model: MealSurveyListeningModel, task: MealSurveyListeningTask): HTMLElement {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.errorTag = task.errorTag;
    fieldset.dataset.sourceQuestionId = task.sourceQuestionId;
    const legend = document.createElement('legend');
    legend.lang = 'ja';
    legend.textContent = `${task.sourceOrder}. ${task.prompt}`;
    fieldset.append(legend);
    if (task.kind === 'choice') {
        task.options?.forEach(option => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = inputName(model, task.id);
            input.value = option;
            const value = document.createElement('span');
            value.lang = 'ja';
            value.textContent = option;
            label.append(input, value);
            fieldset.append(label);
        });
    } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.lang = 'ja';
        input.dataset.jpdbReaderSurfaceIgnore = '';
        input.name = inputName(model, task.id);
        input.setAttribute('aria-label', `A-11 response ${task.sourceOrder}`);
        fieldset.append(input);
    }
    return fieldset;
}

function appendPostAttemptSupport(root: HTMLElement, model: MealSurveyListeningModel, language: 'ja' | 'en' | undefined): void {
    if (root.querySelector('[data-listening-support]')) return;
    const support = document.createElement('section');
    support.className = 'academy-meal-survey-listening-support';
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
    model.payload.tasks.forEach(task => {
        const term = document.createElement('dt');
        term.textContent = `${task.sourceOrder}. ${task.prompt}`;
        const definition = document.createElement('dd');
        definition.textContent = task.answer;
        answers.append(term, definition);
    });
    support.append(title, transcript, answers);
    root.append(support);
}

function applyMissedOnlyRepair(form: HTMLFormElement, errorTags: readonly string[]): void {
    const missed = new Set(errorTags);
    form.dataset.repairScope = 'missed-source-items-only';
    form.querySelectorAll<HTMLElement>('[data-error-tag]').forEach(row => row.toggleAttribute('hidden', !missed.has(row.dataset.errorTag ?? '')));
}

function responseFromForm(model: MealSurveyListeningModel, form: HTMLFormElement): MealSurveyListeningResponse {
    const data = new FormData(form);
    return { answers: model.payload.tasks.map(task => ({ taskId: task.id, value: String(data.get(inputName(model, task.id)) ?? '') })) };
}

function parseResponse(model: MealSurveyListeningModel, response: MealSurveyListeningResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.tasks.length) {
        throw new TypeError('All seven A-11 worksheet responses need one answer.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        if (!model.payload.tasks.some(task => task.id === answer.taskId) || answers.has(answer.taskId) || typeof answer.value !== 'string'
            || !normalizeJapanese(answer.value)) {
            throw new TypeError(`A-11 responses must address each exact source item once (${answer.taskId || 'missing task'}).`);
        }
        answers.set(answer.taskId, normalizeJapanese(answer.value));
    });
    return answers;
}

function inputName(model: MealSurveyListeningModel, taskId: string): string { return `${model.id}:task:${taskId}`; }
