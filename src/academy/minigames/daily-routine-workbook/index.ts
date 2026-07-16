import './style.css';

import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityEvaluation,
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
    localized,
    localizedNodes,
    normalizeJapanese,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export interface DailyRoutineTeachingStep {
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly pattern: string;
    readonly explanation: LocalizedText;
    readonly example: string;
}

export interface DailyRoutineOption {
    readonly id: string;
    readonly label: string;
}

interface DailyRoutineRoundBase {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly sourcePrompt: string;
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hint: LocalizedText;
    readonly nearbyExample: LocalizedText;
}

export interface DailyRoutineTenseRound extends DailyRoutineRoundBase {
    readonly mode: 'tense-choice';
    readonly options: readonly DailyRoutineOption[];
    readonly correctOptionId: string;
}

export interface DailyRoutineShortAnswerRound extends DailyRoutineRoundBase {
    readonly mode: 'short-answer';
    readonly acceptedAnswers: readonly string[];
}

export interface DailyRoutineTimeRound extends DailyRoutineRoundBase {
    readonly mode: 'routine-time';
    readonly question: string;
    readonly answerSuffix: string;
    readonly options: readonly DailyRoutineOption[];
    readonly correctOptionId: string;
}

export interface DailyRoutineSentenceRound extends DailyRoutineRoundBase {
    readonly mode: 'sentence';
    readonly acceptedAnswers: readonly string[];
}

export type DailyRoutineRound =
    | DailyRoutineTenseRound
    | DailyRoutineShortAnswerRound
    | DailyRoutineTimeRound
    | DailyRoutineSentenceRound;

export type DailyRoutineAnswer =
    | Readonly<{ mode: 'tense-choice'; roundId: string; optionId: string }>
    | Readonly<{ mode: 'short-answer'; roundId: string; value: string }>
    | Readonly<{ mode: 'routine-time'; roundId: string; optionId: string }>
    | Readonly<{ mode: 'sentence'; roundId: string; value: string }>;

export interface DailyRoutineWorkbookResponse {
    readonly answers: readonly DailyRoutineAnswer[];
}

interface MoodleDocumentSource {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly sourceTitle: string;
    readonly member: string;
    readonly author: 'Rie Tsuruta-Barratt';
    readonly pages: readonly number[];
}

export interface DailyRoutineWorkbookModel extends ActivityModel {
    readonly kind: 'academy-daily-routine-workbook';
    readonly responseKind: 'mixed-source-daily-routine-workbook';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l10';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 5907552;
            readonly verbSummary: MoodleDocumentSource;
            readonly grammarCheck: MoodleDocumentSource;
        };
        readonly minna: {
            readonly sourceId: string;
            readonly reference: 'Minna no Nihongo I, Lesson 4';
            readonly title: 'Minna no Nihongo 2nd Edition Shokyu I';
            readonly author: '3A Network';
            readonly payloadSha256: string;
            readonly pageCount: 326;
            readonly pdfPage: 55;
            readonly printedPage: 35;
            readonly exercise: 'Practice B, exercise 5';
        };
        readonly genki: {
            readonly taskId: 'genki-2e:l1-l10:lesson-3-workbook-5';
            readonly sourceId: string;
            readonly relativePath: 'lessons/lesson-3/workbook-5/index.html';
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 125 };
            readonly engine: 'Genki.generateQuiz';
            readonly sourceType: 'fill';
        };
    };
    readonly payload: {
        readonly teaching: readonly DailyRoutineTeachingStep[];
        readonly rounds: readonly DailyRoutineRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const MOODLE_SUMMARY_SHA256 = 'fd4826082b3e5ec89453bce677937f10240ca5e76325b4ca7fc3806f0914dfad';
const MOODLE_GRAMMAR_CHECK_SHA256 = 'e1a72f416713d5ba430b8e3e97aecd39d03a2da53f0c8baf136d34c16fd3f20a';
const MINNA_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
const GENKI_SHA256 = 'cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f';
const GENKI_SCRIPT_SHA256 = 'de7d3beedd2565ba6db123561567c56661c3fed66b859ac6772c3edca457ac85';
const EXACT_MODES = [
    'tense-choice', 'tense-choice', 'tense-choice', 'tense-choice', 'tense-choice',
    'short-answer', 'short-answer', 'short-answer', 'short-answer',
    'routine-time', 'routine-time', 'routine-time', 'routine-time',
    'sentence', 'sentence', 'sentence', 'sentence', 'sentence', 'sentence', 'sentence', 'sentence',
] as const;

export const dailyRoutineWorkbookPlugin: ActivityPlugin<DailyRoutineWorkbookModel, DailyRoutineWorkbookResponse> = {
    kind: 'academy-daily-routine-workbook',
    validate(model) {
        const issues: ValidationIssue[] = [];
        if (model.kind !== this.kind) issues.push({ path: 'kind', message: 'Unexpected daily-routine plugin kind.' });
        if (model.responseKind !== 'mixed-source-daily-routine-workbook') {
            issues.push({ path: 'responseKind', message: 'Unexpected daily-routine response kind.' });
        }
        if (model.answerSupport !== ACADEMY_ASSESSED_ANSWER_SUPPORT) {
            issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
        }
        validateProvenance(model, issues);
        validateTeaching(model.payload?.teaching, issues);
        validateRounds(model, issues);
        if (model.payload?.passScore !== 1) {
            issues.push({ path: 'payload.passScore', message: 'Every source item must be repaired before passing.' });
        }
        validateFeedback(model.payload?.feedback, issues);
        return issues;
    },
    render(model, host, submit) {
        let disposed = false;
        let assessment: ReturnType<typeof assessmentView> | undefined;

        const showTeaching = (): void => {
            const root = document.createElement('section');
            root.className = 'academy-routine-workbook academy-routine-teaching';
            root.dataset.lessonPhase = 'teaching';
            const title = document.createElement('h3');
            title.append(...localizedNodes({ ja: '先に型を学ぶ', en: 'Learn the pattern first' }));
            const grid = document.createElement('div');
            grid.className = 'academy-routine-teaching-grid';
            for (const step of model.payload.teaching) grid.append(teachingCard(step));
            const continueButton = document.createElement('button');
            continueButton.type = 'button';
            continueButton.className = 'academy-button academy-button-primary academy-routine-continue';
            continueButton.textContent = host.language === 'ja' ? '練習へ' : 'Continue to workbook';
            continueButton.addEventListener('click', showAssessment, { once: true });
            root.append(title, grid, continueButton);
            host.replace(root);
        };

        const showAssessment = (): void => {
            assessment = assessmentView(model, host, async response => {
                if (disposed || !assessment) return;
                setPending(assessment.root, true);
                try {
                    const evaluation = await submit(response);
                    showEvaluation(assessment.feedback, evaluation, host);
                    updateRepairHints(model, assessment.form, evaluation, host);
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
            dispose() {
                disposed = true;
                host.replace(document.createElement('div'));
            },
        };
    },
    grade(model, response) {
        const answers = parseResponse(model, response);
        const missed = model.payload.rounds.filter(round => !isCorrect(round, answers.get(round.id)!));
        return gradeFromScore(
            (model.payload.rounds.length - missed.length) / model.payload.rounds.length,
            model.payload.passScore,
            missed.map(round => round.errorTag),
            model.payload.feedback,
        );
    },
    toReviewSeeds(model, result) {
        const rounds = result.outcome === 'pass'
            ? model.payload.rounds
            : model.payload.rounds.filter(round => result.errorTags.includes(round.errorTag));
        return rounds.map(round => reviewSeed(round, result));
    },
};

function validateProvenance(model: DailyRoutineWorkbookModel, issues: ValidationIssue[]): void {
    const provenance = model.provenance;
    if (provenance?.packageId !== 'l1-l10' || provenance.answerVisibility !== 'after-attempt') {
        issues.push({ path: 'provenance', message: 'Lesson 10 source identity and answer gate are required.' });
    }
    if (provenance?.moodle?.moduleId !== 5907552
        || provenance.moodle.verbSummary?.payloadSha256 !== MOODLE_SUMMARY_SHA256
        || provenance.moodle.grammarCheck?.payloadSha256 !== MOODLE_GRAMMAR_CHECK_SHA256) {
        issues.push({ path: 'provenance.moodle', message: 'Exact Moodle Lesson 10 documents are required.' });
    }
    if (provenance?.minna?.payloadSha256 !== MINNA_SHA256
        || provenance.minna.pdfPage !== 55 || provenance.minna.printedPage !== 35) {
        issues.push({ path: 'provenance.minna', message: 'Exact Minna Lesson 4 routine exercise is required.' });
    }
    if (provenance?.genki?.payloadSha256 !== GENKI_SHA256
        || provenance.genki.scriptSha256 !== GENKI_SCRIPT_SHA256
        || provenance.genki.lineLocus.start !== 76 || provenance.genki.lineLocus.end !== 125) {
        issues.push({ path: 'provenance.genki', message: 'Exact Genki workbook 5 task is required.' });
    }
}

function validateTeaching(value: readonly DailyRoutineTeachingStep[] | undefined, issues: ValidationIssue[]): void {
    if (!Array.isArray(value) || value.length !== 4) {
        issues.push({ path: 'payload.teaching', message: 'Four source-bound teaching steps are required.' });
        return;
    }
    value.forEach((step, index) => {
        if (!text(step.sourceQuestionId) || !text(step.sourceLabel) || !text(step.pattern)
            || !text(step.example) || !text(step.explanation?.en) || !text(step.explanation?.ja)) {
            issues.push({ path: `payload.teaching.${index}`, message: 'Teaching must be bilingual and source-bound.' });
        }
    });
}

function validateRounds(model: DailyRoutineWorkbookModel, issues: ValidationIssue[]): void {
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== EXACT_MODES.length) {
        issues.push({ path: 'payload.rounds', message: 'All 21 ordered source items are required.' });
        return;
    }
    const ids = new Set<string>();
    rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        if (round.sourceOrder !== index + 1 || round.mode !== EXACT_MODES[index]) {
            issues.push({ path, message: 'Source order and interaction mode must remain exact.' });
        }
        if (!text(round.id) || ids.has(round.id)) issues.push({ path: `${path}.id`, message: 'Round ids must be unique.' });
        ids.add(round.id);
        if (!text(round.sourceQuestionId) || !text(round.sourceLabel) || !text(round.sourcePrompt)
            || !text(round.answerExpression) || !text(round.errorTag)) {
            issues.push({ path, message: 'Every round needs exact source identity and a repair target.' });
        }
        if (!model.conceptIds.includes(round.conceptId)) {
            issues.push({ path: `${path}.conceptId`, message: 'Round Concept must belong to the model.' });
        }
        if (!text(round.hint?.en) || !text(round.hint?.ja)
            || !text(round.nearbyExample?.en) || !text(round.nearbyExample?.ja)) {
            issues.push({ path, message: 'Every round needs a bilingual earned hint and nearby repair example.' });
        }
        if (round.mode === 'tense-choice' || round.mode === 'routine-time') {
            if (!round.options.length
                || !round.options.some((option: DailyRoutineOption) => option.id === round.correctOptionId)) {
                issues.push({ path, message: 'Choice rounds need an offered correct option.' });
            }
        } else if (!round.acceptedAnswers.length || !round.acceptedAnswers.every(text)) {
            issues.push({ path, message: 'Typed rounds need accepted source answers.' });
        }
    });
}

function teachingCard(step: DailyRoutineTeachingStep): HTMLElement {
    const article = document.createElement('article');
    article.className = 'academy-routine-teaching-step';
    article.dataset.sourceQuestionId = step.sourceQuestionId;
    const source = document.createElement('p');
    source.className = 'academy-routine-source-label';
    source.textContent = step.sourceLabel;
    const pattern = document.createElement('h4');
    pattern.append(assessedJapanese(step.pattern));
    const explanation = document.createElement('p');
    explanation.append(...localizedNodes(step.explanation));
    const example = document.createElement('p');
    example.className = 'academy-routine-model';
    example.append(assessedJapanese(step.example));
    article.append(source, pattern, explanation, example);
    return article;
}

function assessmentView(
    model: DailyRoutineWorkbookModel,
    host: ActivityHost,
    submit: (response: DailyRoutineWorkbookResponse) => Promise<void>,
): Readonly<{ root: HTMLElement; form: HTMLFormElement; feedback: HTMLElement }> {
    const root = document.createElement('section');
    root.className = 'academy-routine-workbook academy-routine-assessment';
    root.dataset.lessonPhase = 'assessment';
    const title = document.createElement('h3');
    title.append(...localizedNodes({ ja: '朝から夜まで', en: 'From morning till night' }));
    const form = document.createElement('form');
    form.className = 'academy-routine-form';
    const grid = document.createElement('div');
    grid.className = 'academy-routine-round-grid';
    for (const round of model.payload.rounds) grid.append(renderRound(model, round));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-routine-check';
    check.textContent = host.language === 'ja' ? '答えを確認' : 'Check source workbook';
    const feedback = statusRegion('academy-routine-feedback');
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

function renderRound(model: DailyRoutineWorkbookModel, round: DailyRoutineRound): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = `academy-routine-round academy-routine-round-${round.mode}`;
    fieldset.dataset.roundId = round.id;
    fieldset.dataset.sourceQuestionId = round.sourceQuestionId;
    fieldset.dataset.errorTag = round.errorTag;
    const legend = document.createElement('legend');
    legend.textContent = round.sourcePrompt;
    const source = document.createElement('p');
    source.className = 'academy-routine-source-label';
    source.textContent = round.sourceLabel;
    fieldset.append(legend, source);
    if (round.mode === 'tense-choice') appendChoiceSelect(model, round, fieldset);
    else if (round.mode === 'routine-time') appendRoutineTimeSelect(model, round, fieldset);
    else appendTypedInput(model, round, fieldset);
    return fieldset;
}

function appendChoiceSelect(
    model: DailyRoutineWorkbookModel,
    round: DailyRoutineTenseRound,
    root: HTMLElement,
): void {
    root.append(selectControl(`${model.id}-${round.id}-option`, { ja: 'どうしの形', en: 'Verb form' }, round.options));
}

function appendRoutineTimeSelect(
    model: DailyRoutineWorkbookModel,
    round: DailyRoutineTimeRound,
    root: HTMLElement,
): void {
    const question = document.createElement('p');
    question.className = 'academy-routine-question';
    question.append(assessedJapanese(round.question));
    const answer = document.createElement('div');
    answer.className = 'academy-routine-time-answer';
    answer.append(
        selectControl(`${model.id}-${round.id}-option`, { ja: '時刻', en: 'Time' }, round.options),
        assessedJapanese(round.answerSuffix),
    );
    root.append(question, answer);
}

function appendTypedInput(
    model: DailyRoutineWorkbookModel,
    round: DailyRoutineShortAnswerRound | DailyRoutineSentenceRound,
    root: HTMLElement,
): void {
    const label = document.createElement('label');
    label.className = 'academy-routine-typed';
    const caption = document.createElement('span');
    caption.textContent = round.mode === 'short-answer'
        ? '答えのどうし / Answer verb form'
        : '日本語の文 / Japanese sentence';
    const input = document.createElement('input');
    input.type = 'text';
    input.name = `${model.id}-${round.id}-value`;
    input.required = true;
    input.lang = 'ja';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.jpdbReaderSurfaceIgnore = '';
    label.append(caption, input);
    root.append(label);
}

function selectControl(name: string, labelText: LocalizedText, options: readonly DailyRoutineOption[]): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'academy-routine-select';
    const caption = document.createElement('span');
    caption.className = 'academy-visually-hidden';
    caption.textContent = `${labelText.ja} / ${labelText.en}`;
    const select = document.createElement('select');
    select.name = name;
    select.required = true;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '—';
    select.append(placeholder);
    for (const option of options) {
        const item = document.createElement('option');
        item.value = option.id;
        item.textContent = option.label;
        select.append(item);
    }
    label.append(caption, select);
    return label;
}

function responseFromForm(model: DailyRoutineWorkbookModel, form: HTMLFormElement): DailyRoutineWorkbookResponse | null {
    const data = new FormData(form);
    const answers: DailyRoutineAnswer[] = [];
    for (const round of model.payload.rounds) {
        if (round.mode === 'tense-choice' || round.mode === 'routine-time') {
            const optionId = data.get(`${model.id}-${round.id}-option`);
            if (typeof optionId !== 'string' || !optionId) return null;
            answers.push({ mode: round.mode, roundId: round.id, optionId });
        } else {
            const value = data.get(`${model.id}-${round.id}-value`);
            if (typeof value !== 'string' || !value.trim()) return null;
            answers.push({ mode: round.mode, roundId: round.id, value });
        }
    }
    return { answers };
}

function parseResponse(
    model: DailyRoutineWorkbookModel,
    response: DailyRoutineWorkbookResponse,
): ReadonlyMap<string, DailyRoutineAnswer> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every exact Lesson 10 source item needs one answer.');
    }
    const answers = new Map<string, DailyRoutineAnswer>();
    for (const answer of response.answers) {
        const round = model.payload.rounds.find(candidate => candidate.id === answer.roundId);
        if (!round || answers.has(answer.roundId) || answer.mode !== round.mode) {
            throw new TypeError('Answers must use every source item once and keep its interaction mode.');
        }
        if (round.mode === 'tense-choice' || round.mode === 'routine-time') {
            if ((answer.mode !== 'tense-choice' && answer.mode !== 'routine-time')
                || !round.options.some(option => option.id === answer.optionId)) {
                throw new TypeError('Choice items require one offered option.');
            }
        } else if ((answer.mode !== 'short-answer' && answer.mode !== 'sentence') || !text(answer.value)) {
            throw new TypeError('Typed source items require a non-empty answer.');
        }
        answers.set(answer.roundId, answer);
    }
    return answers;
}

function isCorrect(round: DailyRoutineRound, answer: DailyRoutineAnswer): boolean {
    if (round.mode === 'tense-choice' || round.mode === 'routine-time') {
        return (answer.mode === 'tense-choice' || answer.mode === 'routine-time')
            && answer.optionId === round.correctOptionId;
    }
    return (answer.mode === 'short-answer' || answer.mode === 'sentence')
        && round.acceptedAnswers.some(candidate => normalizeJapanese(candidate) === normalizeJapanese(answer.value));
}

function updateRepairHints(
    model: DailyRoutineWorkbookModel,
    form: HTMLFormElement,
    evaluation: ActivityEvaluation,
    host: ActivityHost,
): void {
    form.querySelectorAll('.academy-routine-round').forEach(node => {
        node.classList.remove('academy-routine-round-missed');
        node.querySelector('.academy-routine-earned-hint')?.remove();
    });
    if (evaluation.result.outcome !== 'lapse') return;
    for (const round of model.payload.rounds.filter(item => evaluation.result.errorTags.includes(item.errorTag))) {
        const fieldset = form.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
        if (!fieldset) continue;
        fieldset.classList.add('academy-routine-round-missed');
        const wrapper = document.createElement('div');
        wrapper.className = 'academy-routine-earned-hint';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'academy-button academy-button-secondary academy-routine-hint-button';
        button.textContent = host.language === 'ja' ? 'ヒントを見る' : 'Show earned hint';
        const panel = document.createElement('div');
        panel.className = 'academy-routine-hint-panel';
        panel.hidden = true;
        button.addEventListener('click', () => {
            panel.hidden = false;
            button.remove();
            void host.recordSupportUse?.({ activityId: model.id, supportKind: 'hint', choiceId: round.id });
            host.announce(localized(round.hint, host));
        }, { once: true });
        const hint = document.createElement('p');
        hint.append(...localizedNodes(round.hint));
        const example = document.createElement('p');
        example.className = 'academy-routine-nearby-example';
        example.append(...localizedNodes(round.nearbyExample));
        panel.append(hint, example);
        wrapper.append(button, panel);
        fieldset.append(wrapper);
    }
}

function reviewSeed(round: DailyRoutineRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l1-l10:daily-routine:${round.id}`,
        conceptId: round.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: round.sourceQuestionId,
        content: {
            expression: round.answerExpression,
            meanings: [round.sourcePrompt],
            sentence: round.answerExpression,
        },
    };
}
