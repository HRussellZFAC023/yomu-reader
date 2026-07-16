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
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export interface MoodleListeningGridField {
    readonly id: string;
    readonly label: string;
    readonly answer: string;
}

export interface MoodleListeningGridTask {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly prompt: string;
    readonly fields: readonly MoodleListeningGridField[];
    readonly conceptId: string;
    readonly errorTag: string;
    readonly reviewExpression: string;
}

export interface MoodleListeningGridTrack {
    readonly id: string;
    readonly title: LocalizedText;
    readonly audio: {
        readonly sourceId: string;
        readonly payloadSha256: string;
        readonly url: string;
        readonly durationSeconds: number;
    };
    readonly transcript: readonly Readonly<{ speaker: string; text: string }>[];
    readonly tasks: readonly MoodleListeningGridTask[];
}

export interface MoodleListeningGridResponse {
    readonly values: readonly Readonly<{ taskId: string; fieldId: string; value: string }>[];
}

export interface MoodleListeningGridModel extends ActivityModel {
    readonly kind: 'academy-moodle-listening-grid';
    readonly responseKind: 'moodle-audio-grid';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l19';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6223185;
            readonly handout: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly title: 'Chapter 11 listening';
                readonly locus: { readonly page: 1; readonly sections: readonly [1, 2] };
            };
            readonly answerKeyBasis: 'source-audio-reviewed-grid-values';
        };
    };
    readonly payload: {
        readonly sourceCaption: LocalizedText;
        readonly tracks: readonly MoodleListeningGridTrack[];
        readonly feedback: ActivityFeedbackSet;
    };
}

export const moodleListeningGridPlugin: ActivityPlugin<MoodleListeningGridModel, MoodleListeningGridResponse> = {
    kind: 'academy-moodle-listening-grid',
    validate,
    render,
    grade(model, response) {
        const values = parseResponse(model, response);
        const errors = tasks(model).flatMap(task => task.fields.every(field =>
            values.get(fieldKey(task, field)) === normalizeValue(field.answer),
        ) ? [] : [task.errorTag]);
        return gradeFromScore(errors.length === 0 ? 1 : 0, 1, errors, model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        return tasks(model).flatMap(task => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(task.errorTag)) return [];
            return [{
                id: `review:l1-l19:moodle-listening:${task.id}`,
                conceptId: task.conceptId,
                reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
                sourceQuestionId: task.sourceQuestionId,
                content: { expression: task.reviewExpression, meanings: [task.prompt] },
            } satisfies ReviewSeed];
        });
    },
};

function validate(model: MoodleListeningGridModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The Moodle listening grid requires assessed answer support.' });
    }
    const provenance = model.provenance;
    if (provenance?.packageId !== 'l1-l19' || provenance.answerVisibility !== 'after-attempt'
        || provenance.moodle?.moduleId !== 6223185
        || provenance.moodle.handout?.title !== 'Chapter 11 listening'
        || provenance.moodle.handout?.locus?.page !== 1
        || provenance.moodle.handout.locus.sections?.join(',') !== '1,2'
        || !hash(provenance.moodle.handout?.payloadSha256)
        || !text(provenance.moodle.handout?.sourceId)
        || provenance.moodle.answerKeyBasis !== 'source-audio-reviewed-grid-values') {
        issues.push({ path: 'provenance.moodle', message: 'The exact Moodle listening handout and reviewed source-audio basis are required.' });
    }
    if (!text(model.payload?.sourceCaption?.ja) || !text(model.payload?.sourceCaption?.en)) {
        issues.push({ path: 'payload.sourceCaption', message: 'A bilingual source caption is required.' });
    }
    const tracks = model.payload?.tracks;
    if (!Array.isArray(tracks) || tracks.length !== 2 || tracks.map(track => track.id).join(',') !== 'a43,a44') {
        issues.push({ path: 'payload.tracks', message: 'A-43 and A-44 are required in source order.' });
        return issues;
    }
    const taskIds = new Set<string>();
    const sourceQuestionIds = new Set<string>();
    tracks.forEach((track, trackIndex) => {
        if (!text(track.id) || !text(track.title?.ja) || !text(track.title?.en)) {
            issues.push({ path: `payload.tracks.${trackIndex}.title`, message: 'Each source track needs a bilingual title.' });
        }
        const audioSource = text(track.audio?.sourceId);
        const audioHash = hash(track.audio?.payloadSha256);
        const audioUrl = /^\/academy\/content\/listening\/media\/academy-listening-[a-f0-9]{16}\.mp3$/u.test(track.audio?.url ?? '');
        const audioDuration = Number.isFinite(track.audio?.durationSeconds) && track.audio.durationSeconds > 0;
        if (!audioSource || !audioHash || !audioUrl || !audioDuration) {
            issues.push({ path: `payload.tracks.${trackIndex}.audio`, message: 'Each source track needs byte-verified packaged audio.' });
        }
        if (!Array.isArray(track.transcript) || track.transcript.length === 0
            || track.transcript.some((line: Readonly<{ speaker: string; text: string }>) => !text(line.speaker) || !text(line.text))) {
            issues.push({ path: `payload.tracks.${trackIndex}.transcript`, message: 'Each source track needs a reviewed transcript.' });
        }
        if (!Array.isArray(track.tasks) || track.tasks.length === 0) {
            issues.push({ path: `payload.tracks.${trackIndex}.tasks`, message: 'Each source track needs exact grid tasks.' });
            return;
        }
        track.tasks.forEach((task: MoodleListeningGridTask, taskIndex: number) => {
            if (!text(task.id) || taskIds.has(task.id) || !text(task.sourceQuestionId) || sourceQuestionIds.has(task.sourceQuestionId)
                || !text(task.prompt) || !text(task.conceptId) || !text(task.errorTag) || !text(task.reviewExpression)
                || !Array.isArray(task.fields) || task.fields.length === 0
                || task.fields.some((field: MoodleListeningGridField) => !text(field.id) || !text(field.label) || typeof field.answer !== 'string')
                || !model.conceptIds.includes(task.conceptId)) {
                issues.push({ path: `payload.tracks.${trackIndex}.tasks.${taskIndex}`, message: 'Every source grid task needs unique exact fields and deterministic evidence.' });
            }
            taskIds.add(task.id);
            sourceQuestionIds.add(task.sourceQuestionId);
        });
    });
    if (taskIds.size !== 5) issues.push({ path: 'payload.tracks', message: 'The five exact A-43/A-44 source tasks are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function render(
    model: MoodleListeningGridModel,
    host: ActivityHost,
    submit: (response: MoodleListeningGridResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-moodle-listening-grid';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const caption = document.createElement('p');
    caption.className = 'academy-moodle-listening-grid-caption';
    caption.append(...localizedNodes(model.payload.sourceCaption));
    const form = document.createElement('form');
    form.className = 'academy-moodle-listening-grid-form';
    form.setAttribute('aria-labelledby', heading.id);
    model.payload.tracks.forEach(track => form.append(renderTrack(model, track)));
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'academy-button academy-button-primary academy-moodle-listening-grid-submit';
    submitButton.textContent = host.language === 'ja' ? '聞き取りを確認する' : 'Check the listening grid';
    const status = statusRegion('academy-kit-feedback academy-moodle-listening-grid-feedback');
    form.append(submitButton);
    root.append(heading, caption, form, status);
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

    return {
        focus() { form.querySelector<HTMLInputElement>('input')?.focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderTrack(model: MoodleListeningGridModel, track: MoodleListeningGridTrack): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-moodle-listening-grid-track';
    section.dataset.trackId = track.id;
    const title = document.createElement('h3');
    title.append(...localizedNodes(track.title));
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = track.audio.url;
    audio.dataset.sourceSha256 = track.audio.payloadSha256;
    audio.setAttribute('aria-label', track.title.en);
    section.append(title, audio);
    track.tasks.forEach(task => section.append(renderTask(model, track, task)));
    return section;
}

function renderTask(
    model: MoodleListeningGridModel,
    track: MoodleListeningGridTrack,
    task: MoodleListeningGridTask,
): HTMLElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'academy-moodle-listening-grid-task';
    fieldset.dataset.sourceQuestionId = task.sourceQuestionId;
    const legend = document.createElement('legend');
    legend.textContent = task.prompt;
    fieldset.append(legend);
    const grid = document.createElement('div');
    grid.className = 'academy-moodle-listening-grid-fields';
    task.fields.forEach(field => {
        const label = document.createElement('label');
        label.textContent = field.label;
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.dataset.jpdbReaderSurfaceIgnore = '';
        input.name = fieldInputName(model, track, task, field);
        input.setAttribute('aria-label', `${task.prompt}: ${field.label}`);
        label.append(input);
        grid.append(label);
    });
    fieldset.append(grid);
    return fieldset;
}

function appendPostAttemptSupport(root: HTMLElement, model: MoodleListeningGridModel, language: 'ja' | 'en' | undefined): void {
    if (root.querySelector('[data-listening-support]')) return;
    const support = document.createElement('section');
    support.className = 'academy-moodle-listening-grid-support';
    support.dataset.listeningSupport = 'after-attempt';
    const title = document.createElement('h3');
    title.textContent = language === 'ja' ? '試行後の音声メモと答え' : 'Audio notes and answers after your attempt';
    support.append(title);
    model.payload.tracks.forEach(track => {
        const trackTitle = document.createElement('h4');
        trackTitle.append(...localizedNodes(track.title));
        const transcript = document.createElement('ol');
        transcript.className = 'academy-moodle-listening-grid-transcript';
        track.transcript.forEach(line => {
            const item = document.createElement('li');
            item.textContent = `${line.speaker}: ${line.text}`;
            transcript.append(item);
        });
        const answers = document.createElement('dl');
        answers.className = 'academy-moodle-listening-grid-answers';
        track.tasks.forEach(task => task.fields.forEach(field => {
            const term = document.createElement('dt');
            term.textContent = `${task.prompt} - ${field.label}`;
            const definition = document.createElement('dd');
            definition.textContent = field.answer || (language === 'ja' ? '空欄' : 'blank');
            answers.append(term, definition);
        }));
        support.append(trackTitle, transcript, answers);
    });
    root.append(support);
}

function responseFromForm(model: MoodleListeningGridModel, form: HTMLFormElement): MoodleListeningGridResponse {
    return {
        values: model.payload.tracks.flatMap(track => track.tasks.flatMap(task => task.fields.map(field => ({
            taskId: task.id,
            fieldId: field.id,
            value: String(new FormData(form).get(fieldInputName(model, track, task, field)) ?? ''),
        })))),
    };
}

function parseResponse(model: MoodleListeningGridModel, response: MoodleListeningGridResponse): ReadonlyMap<string, string> {
    const fields = tasks(model).flatMap(task => task.fields.map(field => ({ task, field })));
    if (!response || !Array.isArray(response.values) || response.values.length !== fields.length) {
        throw new TypeError('Every exact Moodle listening grid field needs one response.');
    }
    const values = new Map<string, string>();
    response.values.forEach(value => {
        const task = tasks(model).find(candidate => candidate.id === value.taskId);
        const field = task?.fields.find(candidate => candidate.id === value.fieldId);
        const key = task && field ? fieldKey(task, field) : undefined;
        if (!key || values.has(key) || typeof value.value !== 'string') {
            throw new TypeError('Listening grid responses must address each exact source field once.');
        }
        values.set(key, normalizeValue(value.value));
    });
    return values;
}

function tasks(model: MoodleListeningGridModel): readonly MoodleListeningGridTask[] {
    return model.payload.tracks.flatMap(track => track.tasks);
}

function fieldInputName(
    model: MoodleListeningGridModel,
    track: MoodleListeningGridTrack,
    task: MoodleListeningGridTask,
    field: MoodleListeningGridField,
): string {
    return `${model.id}:${track.id}:${task.id}:${field.id}`;
}

function fieldKey(task: MoodleListeningGridTask, field: MoodleListeningGridField): string {
    return `${task.id}/${field.id}`;
}

function normalizeValue(value: string): string {
    return value.trim().replace(/[０-９]/gu, digit => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0));
}

function hash(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
