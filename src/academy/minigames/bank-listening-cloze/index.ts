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

export interface BankListeningField {
    readonly id: string;
    readonly sourceOrder: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    readonly sourceQuestionId: string;
    readonly before: string;
    readonly after: string;
    readonly answer: string;
    readonly acceptedAnswers: readonly string[];
    readonly conceptId: string;
    readonly errorTag: string;
}

export interface BankListeningClozeModel extends ActivityModel {
    readonly kind: 'academy-bank-listening-cloze';
    readonly responseKind: 'moodle-track-78-bank-cloze';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l2-l12';
        readonly packageOrder: 39;
        readonly answerVisibility: 'after-attempt';
        readonly repairScope: 'missed-source-items-only';
        readonly moodle: {
            readonly moduleId: 8121261;
            readonly archiveId: 'archive-000032';
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
                readonly durationSeconds: 76.032313;
            };
            readonly answerKeyBasis: 'worksheet-track-identity-and-original-audio-reviewed';
        };
    };
    readonly payload: {
        readonly sourceCaption: LocalizedText;
        readonly prerequisiteContext: readonly Readonly<{ pattern: string; explanation: LocalizedText }>[];
        readonly instruction: string;
        readonly fields: readonly BankListeningField[];
        readonly choice: {
            readonly sourceQuestionId: string;
            readonly prompt: string;
            readonly options: readonly Readonly<{ id: '1' | '2' | '3' | '4'; label: string }>[];
            readonly answer: '4';
            readonly conceptId: string;
            readonly errorTag: string;
        };
        readonly transcript: readonly Readonly<{ speaker: string; text: string }>[];
        readonly feedback: ActivityFeedbackSet;
    };
}

export interface BankListeningClozeResponse {
    readonly values: readonly Readonly<{ fieldId: string; value: string }>[];
    readonly choice: string;
}

export const bankListeningClozePlugin: ActivityPlugin<BankListeningClozeModel, BankListeningClozeResponse> = {
    kind: 'academy-bank-listening-cloze',
    validate,
    render,
    grade(model, response) {
        const parsed = parseResponse(model, response);
        const errors = model.payload.fields.flatMap(field => (
            field.acceptedAnswers.some(answer => normalizeJapanese(answer) === parsed.values.get(field.id))
                ? []
                : [field.errorTag]
        ));
        if (parsed.choice !== model.payload.choice.answer) errors.push(model.payload.choice.errorTag);
        return gradeFromScore(
            (model.payload.fields.length + 1 - errors.length) / (model.payload.fields.length + 1),
            1,
            errors,
            model.payload.feedback,
        );
    },
    toReviewSeeds(model, result) {
        const fields = model.payload.fields.flatMap(field => (
            result.outcome === 'lapse' && !result.errorTags.includes(field.errorTag)
                ? []
                : [reviewSeed(field, result.outcome === 'pass' ? 'new-learning' : 'repair')]
        ));
        if (result.outcome === 'lapse' && !result.errorTags.includes(model.payload.choice.errorTag)) return fields;
        return [...fields, {
            id: 'review:l2-l12:track78:choice',
            conceptId: model.payload.choice.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: model.payload.choice.sourceQuestionId,
            content: { expression: '後で キャッシュカードを 送ってもらいます。', meanings: [model.payload.choice.prompt] },
        } satisfies ReviewSeed];
    },
};

function validate(model: BankListeningClozeModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const moodle = model.provenance?.moodle;
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) issues.push({ path: 'answerSupport', message: 'Assessed answer support is required.' });
    if (model.provenance?.packageId !== 'l2-l12' || model.provenance.packageOrder !== 39
        || model.provenance.answerVisibility !== 'after-attempt' || model.provenance.repairScope !== 'missed-source-items-only'
        || moodle?.moduleId !== 8121261 || moodle.archiveId !== 'archive-000032'
        || moodle.archiveSha256 !== '62c3a814d3590157a8498d34e5ca172c5afa6608d9f9be1ad149a4ca4b99d4fe'
        || moodle.worksheet?.payloadSha256 !== '3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617'
        || moodle.worksheet.page !== 1 || moodle.worksheet.sha256 !== '07ae4ae9fa5441f99bf5542d4199215433cc56ddddc4f1ab968d7533c4bd3ef4'
        || moodle.audio?.payloadSha256 !== '1039d11bef7a0575c6f104f780d1b65c79e63eb50dc292ea8c39f05d241123d2'
        || moodle.audio.durationSeconds !== 76.032313
        || moodle.answerKeyBasis !== 'worksheet-track-identity-and-original-audio-reviewed') {
        issues.push({ path: 'provenance.moodle', message: 'The exact Track 78 worksheet, audio bytes, and reviewed-answer basis are required.' });
    }
    if (!/^\/academy\/content\/listening\/media\/academy-listening-[a-f0-9]{16}\.mp3$/u.test(moodle?.audio?.url ?? '')) {
        issues.push({ path: 'provenance.moodle.audio.url', message: 'Track 78 must use its packaged listening binding.' });
    }
    if (!text(model.payload?.sourceCaption?.ja) || !text(model.payload?.sourceCaption?.en)
        || !Array.isArray(model.payload?.prerequisiteContext) || model.payload.prerequisiteContext.length !== 5
        || model.payload.prerequisiteContext.some(item => !text(item.pattern) || !text(item.explanation?.ja) || !text(item.explanation?.en))) {
        issues.push({ path: 'payload.prerequisiteContext', message: 'Five bilingual bank-service prerequisites are required before assessment.' });
    }
    const fields = model.payload?.fields;
    if (!Array.isArray(fields) || fields.length !== 8 || fields.map(field => field.sourceOrder).join(',') !== '1,2,3,4,5,6,7,8') {
        issues.push({ path: 'payload.fields', message: 'All eight Track 78 worksheet blanks are required in source order.' });
    } else {
        const ids = new Set<string>();
        fields.forEach((field, index) => {
            if (!text(field.id) || ids.has(field.id) || !text(field.sourceQuestionId) || (!text(field.before) && !text(field.after))
                || !text(field.answer) || !field.acceptedAnswers.some((answer: string) => normalizeJapanese(answer) === normalizeJapanese(field.answer))
                || !model.conceptIds.includes(field.conceptId) || !text(field.errorTag)) {
                issues.push({ path: `payload.fields.${index}`, message: 'Every Track 78 blank needs exact source identity, context, and a deterministic answer.' });
            }
            ids.add(field.id);
        });
    }
    const choice = model.payload?.choice;
    if (!choice || choice.answer !== '4' || choice.options?.map(option => `${option.id}:${option.label}`).join('|') !== '1:④|2:③|3:⑧|4:⑤'
        || !text(choice.sourceQuestionId) || !model.conceptIds.includes(choice.conceptId) || !text(choice.errorTag)) {
        issues.push({ path: 'payload.choice', message: 'The exact Track 78 four-option comprehension check is required.' });
    }
    if (!Array.isArray(model.payload?.transcript) || model.payload.transcript.length !== 17
        || model.payload.transcript.some(line => !text(line.speaker) || !text(line.text))) {
        issues.push({ path: 'payload.transcript', message: 'The complete reviewed Track 78 post-attempt transcript is required.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function render(
    model: BankListeningClozeModel,
    host: ActivityHost,
    submit: (response: BankListeningClozeResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-bank-listening-cloze';
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
        alt: {
            ja: 'Moodle の Track 78 口座開設リスニング課題、1ページ目',
            en: 'Moodle Track 78 bank-account listening worksheet, page 1',
        },
    }, host.language, 'academy-bank-listening-cloze-source');
    source.dataset.lessonPhase = 'source-reference';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = model.provenance.moodle.audio.url;
    audio.dataset.sourceSha256 = model.provenance.moodle.audio.payloadSha256;
    audio.setAttribute('aria-label', 'Track 78');
    const form = document.createElement('form');
    form.className = 'academy-bank-listening-cloze-form';
    form.setAttribute('aria-labelledby', heading.id);
    const instruction = document.createElement('p');
    instruction.lang = 'ja';
    instruction.textContent = model.payload.instruction;
    form.append(instruction);
    model.payload.fields.forEach(field => form.append(renderField(model, field)));
    form.append(renderChoice(model));
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'academy-button academy-button-primary academy-bank-listening-cloze-check';
    submitButton.textContent = host.language === 'ja' ? 'Track 78 を確認する' : 'Check Track 78';
    const status = statusRegion('academy-kit-feedback academy-bank-listening-cloze-feedback');
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

function renderPrerequisiteContext(model: BankListeningClozeModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-bank-listening-cloze-context';
    section.dataset.lessonPhase = 'teach-before-assess';
    const title = document.createElement('h3');
    title.textContent = language === 'ja' ? '聞く前の窓口表現' : 'Service-desk language before listening';
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

function renderField(model: BankListeningClozeModel, field: BankListeningField): HTMLElement {
    const row = document.createElement('label');
    row.dataset.errorTag = field.errorTag;
    row.dataset.sourceQuestionId = field.sourceQuestionId;
    const number = document.createElement('strong');
    number.textContent = `${field.sourceOrder}`;
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
    input.name = inputName(model, field.id);
    input.setAttribute('aria-label', `Track 78 blank ${field.sourceOrder}`);
    const after = document.createElement('span');
    after.lang = 'ja';
    after.textContent = field.after;
    row.append(number, before, input, after);
    return row;
}

function renderChoice(model: BankListeningClozeModel): HTMLElement {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.errorTag = model.payload.choice.errorTag;
    fieldset.dataset.sourceQuestionId = model.payload.choice.sourceQuestionId;
    const legend = document.createElement('legend');
    legend.lang = 'ja';
    legend.textContent = model.payload.choice.prompt;
    fieldset.append(legend);
    model.payload.choice.options.forEach(option => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = choiceName(model);
        input.value = option.id;
        const text = document.createElement('span');
        text.textContent = `${option.id}. ${option.label}`;
        label.append(input, text);
        fieldset.append(label);
    });
    return fieldset;
}

function appendPostAttemptSupport(root: HTMLElement, model: BankListeningClozeModel, language: 'ja' | 'en' | undefined): void {
    if (root.querySelector('[data-listening-support]')) return;
    const support = document.createElement('section');
    support.className = 'academy-bank-listening-cloze-support';
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
    model.payload.fields.forEach(field => {
        const term = document.createElement('dt');
        term.textContent = `${field.sourceOrder}`;
        const definition = document.createElement('dd');
        definition.textContent = field.answer;
        answers.append(term, definition);
    });
    const choiceTerm = document.createElement('dt');
    choiceTerm.textContent = language === 'ja' ? '最後の答え' : 'Final choice';
    const choiceAnswer = document.createElement('dd');
    choiceAnswer.textContent = model.payload.choice.answer;
    answers.append(choiceTerm, choiceAnswer);
    support.append(title, transcript, answers);
    root.append(support);
}

function applyMissedOnlyRepair(form: HTMLFormElement, errorTags: readonly string[]): void {
    const missed = new Set(errorTags);
    form.dataset.repairScope = 'missed-source-items-only';
    form.querySelectorAll<HTMLElement>('[data-error-tag]').forEach(row => {
        const isMissed = missed.has(row.dataset.errorTag ?? '');
        row.toggleAttribute('hidden', !isMissed);
    });
}

function responseFromForm(model: BankListeningClozeModel, form: HTMLFormElement): BankListeningClozeResponse {
    const data = new FormData(form);
    return {
        values: model.payload.fields.map(field => ({ fieldId: field.id, value: String(data.get(inputName(model, field.id)) ?? '') })),
        choice: String(data.get(choiceName(model)) ?? ''),
    };
}

function parseResponse(model: BankListeningClozeModel, response: BankListeningClozeResponse): Readonly<{ values: ReadonlyMap<string, string>; choice: string }> {
    if (!response || !Array.isArray(response.values) || response.values.length !== model.payload.fields.length || typeof response.choice !== 'string') {
        throw new TypeError('All eight Track 78 blanks and the final choice need one response.');
    }
    const values = new Map<string, string>();
    response.values.forEach(value => {
        if (!model.payload.fields.some(field => field.id === value.fieldId) || values.has(value.fieldId) || typeof value.value !== 'string') {
            throw new TypeError('Track 78 responses must address each exact source item once.');
        }
        values.set(value.fieldId, normalizeJapanese(value.value));
    });
    return { values, choice: response.choice.trim() };
}

function reviewSeed(field: BankListeningField, reason: ReviewSeed['reason']): ReviewSeed {
    return {
        id: `review:l2-l12:track78:${field.id}`,
        conceptId: field.conceptId,
        reason,
        sourceQuestionId: field.sourceQuestionId,
        content: { expression: field.answer, meanings: [`Track 78 blank ${field.sourceOrder}`] },
    };
}

function inputName(model: BankListeningClozeModel, fieldId: string): string { return `${model.id}:field:${fieldId}`; }
function choiceName(model: BankListeningClozeModel): string { return `${model.id}:choice`; }
