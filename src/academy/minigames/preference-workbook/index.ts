import './style.css';

import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityController,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type GradeResult,
    type ReviewSeed,
    type ValidationIssue,
} from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import {
    assessedJapanese,
    gradeFromScore,
    localizedNodes,
    normalizeJapanese,
    setPending,
    showEvaluation,
    statusRegion,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export interface PreferenceTeachingStep {
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly pattern: string;
    readonly explanation: LocalizedText;
    readonly example: string;
}

export interface PreferenceOption {
    readonly id: string;
    readonly label: string;
}

interface PreferenceRoundBase {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly sourcePrompt: string;
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hint: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface PreferenceChoiceRound extends PreferenceRoundBase {
    readonly mode: 'sentence-choice' | 'reply-choice' | 'question-choice';
    readonly options: readonly PreferenceOption[];
    readonly correctOptionId: string;
}

export interface PreferenceTypedRound extends PreferenceRoundBase {
    readonly mode: 'typed';
    readonly acceptedAnswers: readonly string[];
}

export type PreferenceWorkbookRound = PreferenceChoiceRound | PreferenceTypedRound;

export type PreferenceWorkbookAnswer =
    | Readonly<{ mode: 'sentence-choice' | 'reply-choice' | 'question-choice'; roundId: string; optionId: string }>
    | Readonly<{ mode: 'typed'; roundId: string; value: string }>;

export interface PreferenceWorkbookResponse {
    readonly answers: readonly PreferenceWorkbookAnswer[];
}

export interface PreferenceWorkbookModel extends ActivityModel {
    readonly kind: 'academy-preference-workbook';
    readonly responseKind: 'mixed-source-preference-workbook';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l12';
        readonly answerVisibility: 'after-attempt';
        readonly sourceOrder: readonly ['moodle', 'minna', 'genki'];
        readonly moodle: {
            readonly moduleId: 5489594;
            readonly archiveSha256: string;
            readonly documents: readonly { readonly payloadSha256: string; readonly member: string; readonly pages: string }[];
        };
        readonly minna: {
            readonly sourceId: string;
            readonly reference: 'Minna no Nihongo I, Lesson 9';
            readonly title: 'Minna no Nihongo 2nd Edition Shokyu I';
            readonly author: '3A Network';
            readonly payloadSha256: string;
            readonly pageCount: 326;
            readonly pdfPage: 97;
            readonly printedPage: 77;
            readonly exercise: 'Practice B, exercise 1';
        };
        readonly genki: {
            readonly taskId: 'genki-2e:l1-l12:lesson-5-workbook-6';
            readonly sourceId: string;
            readonly relativePath: 'lessons/lesson-5/workbook-6/index.html';
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 138 };
            readonly engine: 'Genki.generateQuiz';
            readonly sourceType: 'fill';
        };
    };
    readonly payload: {
        readonly teaching: readonly PreferenceTeachingStep[];
        readonly rounds: readonly PreferenceWorkbookRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const MOODLE_PREFERENCE_SHA256 = '6e0a3e02c061f7203d7c8f65db7555993f463e5fee9adf241c36255b959186e4';
const MOODLE_DONNA_SHA256 = 'f1757ed9b43c4fb969deb55aa81351e5c2a873d3af902ed5f5fba05df36240ed';
const MINNA_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
const GENKI_SHA256 = '500b8acfd6c6e821a7c3399a34849741975ef6f423198ca0565174335689b71d';
const GENKI_SCRIPT_SHA256 = '938ef1d732db679ae76b6ce604f670456412ba84fa531ef1b867ace3ca5e0264';
const EXACT_MODES = [
    'sentence-choice', 'sentence-choice', 'sentence-choice', 'reply-choice', 'reply-choice',
    'question-choice', 'question-choice', 'question-choice',
    'reply-choice', 'reply-choice', 'reply-choice', 'reply-choice',
    'typed', 'typed', 'typed', 'typed', 'typed', 'typed', 'typed', 'typed', 'typed', 'typed',
] as const;

export const preferenceWorkbookPlugin: ActivityPlugin<PreferenceWorkbookModel, PreferenceWorkbookResponse> = {
    kind: 'academy-preference-workbook',
    validate(model) {
        const issues: ValidationIssue[] = [];
        if (model.kind !== this.kind || model.responseKind !== 'mixed-source-preference-workbook') {
            issues.push({ path: 'kind', message: 'Unexpected preference workbook contract.' });
        }
        if (model.answerSupport !== ACADEMY_ASSESSED_ANSWER_SUPPORT) {
            issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
        }
        validateProvenance(model, issues);
        validateTeaching(model.payload?.teaching, issues);
        validateRounds(model, issues);
        if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'Every source item must be repaired before passing.' });
        validateFeedback(model.payload?.feedback, issues);
        return issues;
    },
    render(model, host, submit) {
        let disposed = false;
        let assessment: ReturnType<typeof assessmentView> | undefined;
        const showTeaching = (): void => {
            const root = document.createElement('section');
            root.className = 'academy-preference-workbook academy-preference-teaching';
            root.dataset.lessonPhase = 'teaching';
            const title = document.createElement('h3');
            title.append(...localizedNodes({ ja: '型を先に学ぶ', en: 'Learn the pattern first' }));
            const grid = document.createElement('div');
            grid.className = 'academy-preference-teaching-grid';
            model.payload.teaching.forEach(step => grid.append(teachingCard(step)));
            const start = document.createElement('button');
            start.type = 'button';
            start.className = 'academy-button academy-button-primary academy-preference-start';
            start.textContent = host.language === 'ja' ? '元の問題へ' : 'Start source workbook';
            start.addEventListener('click', showAssessment, { once: true });
            root.append(title, grid, start);
            host.replace(root);
        };
        const showAssessment = (): void => {
            assessment = assessmentView(model, host, async response => {
                if (disposed || !assessment) return;
                setPending(assessment.root, true);
                try {
                    const evaluation = await submit(response);
                    showEvaluation(assessment.feedback, evaluation, host);
                    updateRepair(model, assessment.form, evaluation.result.errorTags, host);
                } finally {
                    if (!disposed && assessment) setPending(assessment.root, false);
                }
            });
            host.replace(assessment.root);
            assessment.form.querySelector<HTMLElement>('select, input')?.focus();
        };
        showTeaching();
        return {
            focus() { assessment?.form.querySelector<HTMLElement>('select, input')?.focus(); },
            dispose() { disposed = true; host.replace(document.createElement('div')); },
        } satisfies ActivityController;
    },
    grade(model, response) {
        const answers = parseResponse(model, response);
        const missed = model.payload.rounds.filter(round => !isCorrect(round, answers.get(round.id)!));
        return gradeFromScore((model.payload.rounds.length - missed.length) / model.payload.rounds.length,
            model.payload.passScore, missed.map(round => round.errorTag), model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        const rounds = result.outcome === 'pass'
            ? model.payload.rounds
            : model.payload.rounds.filter(round => result.errorTags.includes(round.errorTag));
        return rounds.map(round => reviewSeed(round, result));
    },
};

function validateProvenance(model: PreferenceWorkbookModel, issues: ValidationIssue[]): void {
    const source = model.provenance;
    if (source?.packageId !== 'l1-l12' || source.answerVisibility !== 'after-attempt'
        || source.sourceOrder?.join(',') !== 'moodle,minna,genki') {
        issues.push({ path: 'provenance', message: 'Lesson 12 source order and answer gate are required.' });
    }
    const moodleHashes = source?.moodle?.documents?.map(document => document.payloadSha256) ?? [];
    if (source?.moodle?.moduleId !== 5489594 || !moodleHashes.includes(MOODLE_PREFERENCE_SHA256)
        || !moodleHashes.includes(MOODLE_DONNA_SHA256)) {
        issues.push({ path: 'provenance.moodle', message: 'Exact Moodle preference and どんな handouts are required.' });
    }
    if (source?.minna?.payloadSha256 !== MINNA_SHA256 || source.minna.pdfPage !== 97 || source.minna.printedPage !== 77) {
        issues.push({ path: 'provenance.minna', message: 'Exact Minna Lesson 9 Practice B is required.' });
    }
    if (source?.genki?.payloadSha256 !== GENKI_SHA256 || source.genki.scriptSha256 !== GENKI_SCRIPT_SHA256
        || source.genki.lineLocus.start !== 76 || source.genki.lineLocus.end !== 138) {
        issues.push({ path: 'provenance.genki', message: 'Exact Genki Lesson 5 workbook 6 task is required.' });
    }
}

function validateTeaching(value: readonly PreferenceTeachingStep[] | undefined, issues: ValidationIssue[]): void {
    if (!Array.isArray(value) || value.length !== 3) {
        issues.push({ path: 'payload.teaching', message: 'Three source-bound teaching steps are required.' });
        return;
    }
    value.forEach((step, index) => {
        if (!nonEmpty(step.sourceQuestionId) || !nonEmpty(step.sourceLabel) || !nonEmpty(step.pattern)
            || !nonEmpty(step.example) || !nonEmpty(step.explanation?.en) || !nonEmpty(step.explanation?.ja)) {
            issues.push({ path: `payload.teaching.${index}`, message: 'Teaching must be bilingual and source-bound.' });
        }
    });
}

function validateRounds(model: PreferenceWorkbookModel, issues: ValidationIssue[]): void {
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== EXACT_MODES.length) {
        issues.push({ path: 'payload.rounds', message: 'All 22 ordered source items are required.' });
        return;
    }
    const ids = new Set<string>();
    rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        if (round.sourceOrder !== index + 1 || round.mode !== EXACT_MODES[index]) {
            issues.push({ path, message: 'Source order and interaction mode must remain exact.' });
        }
        if (!nonEmpty(round.id) || ids.has(round.id)) issues.push({ path: `${path}.id`, message: 'Round ids must be unique.' });
        ids.add(round.id);
        if (!nonEmpty(round.sourceQuestionId) || !nonEmpty(round.sourceLabel) || !nonEmpty(round.sourcePrompt)
            || !nonEmpty(round.answerExpression) || !nonEmpty(round.errorTag) || !model.conceptIds.includes(round.conceptId)) {
            issues.push({ path, message: 'Every round needs a source identity, answer, and repair target.' });
        }
        if (round.hint.length !== 3 || !round.hint.every((hint: LocalizedText) => nonEmpty(hint.en) && nonEmpty(hint.ja))) {
            issues.push({ path, message: 'Every source item needs three bilingual repair hints.' });
        }
        if (round.mode === 'typed') {
            if (!round.acceptedAnswers.length || !round.acceptedAnswers.every(nonEmpty)) {
                issues.push({ path, message: 'Typed rounds need accepted source answers.' });
            }
        } else if (!round.options.some((option: PreferenceOption) => option.id === round.correctOptionId)) {
            issues.push({ path, message: 'Choice rounds need an offered correct answer.' });
        }
    });
}

function teachingCard(step: PreferenceTeachingStep): HTMLElement {
    const card = document.createElement('article');
    card.className = 'academy-preference-teaching-step';
    card.dataset.sourceQuestionId = step.sourceQuestionId;
    const source = document.createElement('p');
    source.className = 'academy-preference-source';
    source.textContent = step.sourceLabel;
    const pattern = document.createElement('h4');
    pattern.append(assessedJapanese(step.pattern));
    const explanation = document.createElement('p');
    explanation.append(...localizedNodes(step.explanation));
    const example = document.createElement('p');
    example.className = 'academy-preference-example';
    example.append(assessedJapanese(step.example));
    card.append(source, pattern, explanation, example);
    return card;
}

function assessmentView(
    model: PreferenceWorkbookModel,
    host: ActivityHost,
    submit: (response: PreferenceWorkbookResponse) => Promise<void>,
): Readonly<{ root: HTMLElement; form: HTMLFormElement; feedback: HTMLElement }> {
    const root = document.createElement('section');
    root.className = 'academy-preference-workbook academy-preference-assessment';
    root.dataset.lessonPhase = 'assessment';
    const title = document.createElement('h3');
    title.append(...localizedNodes({ ja: 'なにがすきですか', en: 'What do you like?' }));
    const form = document.createElement('form');
    form.className = 'academy-preference-form';
    const grid = document.createElement('div');
    grid.className = 'academy-preference-round-grid';
    model.payload.rounds.forEach(round => grid.append(renderRound(model, round)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-preference-check';
    check.textContent = host.language === 'ja' ? '答えを確認' : 'Check source workbook';
    const feedback = statusRegion('academy-preference-feedback');
    form.append(grid, check, feedback);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            host.announce(host.language === 'ja' ? 'すべての問題に答えてください。' : 'Answer every source item first.');
            return;
        }
        void submit(response);
    });
    root.append(title, form);
    return { root, form, feedback };
}

function renderRound(model: PreferenceWorkbookModel, round: PreferenceWorkbookRound): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = `academy-preference-round academy-preference-round-${round.mode}`;
    fieldset.dataset.roundId = round.id;
    fieldset.dataset.errorTag = round.errorTag;
    const legend = document.createElement('legend');
    legend.textContent = `${round.sourceOrder}. ${round.sourcePrompt}`;
    const source = document.createElement('p');
    source.className = 'academy-preference-source';
    source.textContent = round.sourceLabel;
    fieldset.append(legend, source);
    if (round.mode === 'typed') {
        const label = document.createElement('label');
        label.className = 'academy-preference-typed';
        label.textContent = '日本語の文 / Japanese sentence';
        const input = document.createElement('input');
        input.type = 'text';
        input.name = `${model.id}-${round.id}-value`;
        input.required = true;
        input.lang = 'ja';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.dataset.jpdbReaderSurfaceIgnore = '';
        label.append(input);
        fieldset.append(label);
    } else {
        const label = document.createElement('label');
        label.className = 'academy-preference-choice';
        label.textContent = round.mode === 'question-choice' ? 'Question / 質問' : 'Answer / 答え';
        const select = document.createElement('select');
        select.name = `${model.id}-${round.id}-option`;
        select.required = true;
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '—';
        select.append(placeholder);
        round.options.forEach(option => {
            const item = document.createElement('option');
            item.value = option.id;
            item.textContent = option.label;
            select.append(item);
        });
        label.append(select);
        fieldset.append(label);
    }
    return fieldset;
}

function responseFromForm(model: PreferenceWorkbookModel, form: HTMLFormElement): PreferenceWorkbookResponse | null {
    const data = new FormData(form);
    const answers: PreferenceWorkbookAnswer[] = [];
    for (const round of model.payload.rounds) {
        if (round.mode === 'typed') {
            const value = data.get(`${model.id}-${round.id}-value`);
            if (typeof value !== 'string' || !value.trim()) return null;
            answers.push({ mode: 'typed', roundId: round.id, value });
        } else {
            const optionId = data.get(`${model.id}-${round.id}-option`);
            if (typeof optionId !== 'string' || !optionId) return null;
            answers.push({ mode: round.mode, roundId: round.id, optionId });
        }
    }
    return { answers };
}

function parseResponse(model: PreferenceWorkbookModel, response: PreferenceWorkbookResponse): ReadonlyMap<string, PreferenceWorkbookAnswer> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every exact Lesson 12 source item needs one response.');
    }
    const answers = new Map<string, PreferenceWorkbookAnswer>();
    response.answers.forEach(answer => {
        const round = model.payload.rounds.find(candidate => candidate.id === answer.roundId);
        if (!round) throw new TypeError('Response references an unknown source item.');
        if (answers.has(answer.roundId)) throw new TypeError('Response must include every source item once.');
        if (round.mode !== answer.mode) throw new TypeError('Response interaction mode does not match its source item.');
        if (answer.mode === 'typed' && !nonEmpty(answer.value)) throw new TypeError('Typed source response cannot be blank.');
        if (round.mode !== 'typed' && answer.mode !== 'typed'
            && !round.options.some((option: PreferenceOption) => option.id === answer.optionId)) {
            throw new TypeError('Choice response is not an offered source answer.');
        }
        answers.set(answer.roundId, answer);
    });
    return answers;
}

function isCorrect(round: PreferenceWorkbookRound, answer: PreferenceWorkbookAnswer): boolean {
    if (round.mode === 'typed') {
        return answer.mode === 'typed' && round.acceptedAnswers.some(value => normalizeJapanese(value) === normalizeJapanese(answer.value));
    }
    return answer.mode === round.mode && answer.optionId === round.correctOptionId;
}

function updateRepair(model: PreferenceWorkbookModel, form: HTMLFormElement, errorTags: readonly string[], host: ActivityHost): void {
    const missed = new Set(errorTags);
    model.payload.rounds.forEach(round => {
        const fieldset = form.querySelector<HTMLFieldSetElement>(`[data-round-id="${round.id}"]`)!;
        const isMissed = missed.has(round.errorTag);
        fieldset.hidden = !isMissed && missed.size > 0;
        fieldset.classList.toggle('academy-preference-round-missed', isMissed);
        if (isMissed && !fieldset.querySelector('.academy-preference-hint-button')) appendHintButton(model, round, fieldset, host);
    });
}

function appendHintButton(model: PreferenceWorkbookModel, round: PreferenceWorkbookRound, root: HTMLElement, host: ActivityHost): void {
    let hintIndex = 0;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-preference-hint-button';
    button.textContent = host.language === 'ja' ? 'ヒント' : 'Hint';
    const panel = document.createElement('p');
    panel.className = 'academy-preference-hint-panel';
    panel.hidden = true;
    button.addEventListener('click', () => {
        const hint = round.hint[hintIndex];
        if (!hint) return;
        panel.hidden = false;
        panel.dataset.hintIndex = String(hintIndex + 1);
        panel.textContent = host.language === 'ja' ? hint.ja : hint.en;
        host.recordSupportUse?.({ activityId: model.id, supportKind: 'hint', choiceId: round.id });
        hintIndex += 1;
        button.disabled = hintIndex >= round.hint.length;
    });
    root.append(button, panel);
}

function reviewSeed(round: PreferenceWorkbookRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l1-l12:preference:${round.id}`,
        conceptId: round.conceptId,
        sourceQuestionId: round.sourceQuestionId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        content: {
            expression: round.answerExpression,
            meanings: [round.sourcePrompt],
            sentence: round.answerExpression,
        },
    };
}

function nonEmpty(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}
