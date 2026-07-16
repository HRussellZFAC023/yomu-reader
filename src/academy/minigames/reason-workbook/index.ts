import './style.css';

import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
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

export interface ReasonTeachingStep {
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly pattern: string;
    readonly explanation: LocalizedText;
    readonly example: string;
}

export interface ReasonWorkbookOption {
    readonly id: string;
    readonly label: string;
}

interface ReasonRoundBase {
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

export interface ReasonChoiceRound extends ReasonRoundBase {
    readonly mode: 'result-choice' | 'why-choice' | 'availability-choice';
    readonly options: readonly ReasonWorkbookOption[];
    readonly correctOptionId: string;
}

export interface ReasonTypedRound extends ReasonRoundBase {
    readonly mode: 'typed';
    readonly acceptedAnswers: readonly string[];
}

export type ReasonWorkbookRound = ReasonChoiceRound | ReasonTypedRound;

export type ReasonWorkbookAnswer =
    | Readonly<{ mode: ReasonChoiceRound['mode']; roundId: string; optionId: string }>
    | Readonly<{ mode: 'typed'; roundId: string; value: string }>;

export interface ReasonWorkbookResponse {
    readonly answers: readonly ReasonWorkbookAnswer[];
}

export interface ReasonWorkbookModel extends ActivityModel {
    readonly kind: 'academy-reason-workbook';
    readonly responseKind: 'mixed-source-reason-workbook';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l14';
        readonly answerVisibility: 'after-attempt';
        readonly sourceOrder: readonly ['moodle', 'minna-mapping', 'genki'];
        readonly moodle: {
            readonly moduleId: 6097314;
            readonly archiveSha256: string;
            readonly documents: readonly { readonly payloadSha256: string; readonly member: string; readonly pages: string }[];
        };
        readonly minna: {
            readonly sourceId: string;
            readonly reference: 'Minna no Nihongo I, Lesson 9';
            readonly payloadSha256: string;
            readonly pdfPage: 97;
            readonly printedPage: 77;
            readonly relation: 'chronology-map-only';
            readonly reason: string;
        };
        readonly genki: {
            readonly taskId: 'genki-2e:l1-l14:lesson-6-workbook-7';
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 133 };
            readonly engine: 'Genki.generateQuiz';
            readonly sourceSlice: readonly [1, 2, 3];
        };
    };
    readonly payload: {
        readonly teaching: readonly ReasonTeachingStep[];
        readonly rounds: readonly ReasonWorkbookRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const MOODLE_REASON_SHA256 = 'a31989128cc698fc13a5722326c0d23b41087168c7de7a40ad261475ae53deef';
const MOODLE_WHY_SHA256 = '30428f5f3168b44f3f2cc5901c952dd0ceca2e8cc557995e99520d334441320e';
const MOODLE_EXISTENCE_SHA256 = 'f7854a77f500534ed5a91e69354ccf76fb863c2f63caf7e67f45d17672c0ef2f';
const MINNA_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
const GENKI_SHA256 = '9d14d05b28a80886dfdad068b30a979a6df917b2696df09fdedd6b820a9cbbc2';
const GENKI_SCRIPT_SHA256 = '93d56a81d9f5e3f233c3771259c38b98bb3070e8500d9a985104d2eeeb7aff32';
const EXACT_MODES = [
    'result-choice', 'result-choice', 'why-choice', 'why-choice', 'why-choice',
    'availability-choice', 'availability-choice', 'availability-choice', 'typed', 'typed', 'typed',
] as const;
const EXACT_SOURCE_IDS = [
    'moodle:6097314:a3198912:p1:q1:1', 'moodle:6097314:a3198912:p1:q1:3',
    'moodle:6097314:30428f5f:p1:q7:1', 'moodle:6097314:30428f5f:p1:q7:3', 'moodle:6097314:30428f5f:p1:q7:4',
    'moodle:6097314:f7854a77:p2:q2:1', 'moodle:6097314:f7854a77:p2:q2:4', 'moodle:6097314:f7854a77:p2:q2:5',
    'genki-2e:l1-l14:lesson-6-workbook-7:slot-1', 'genki-2e:l1-l14:lesson-6-workbook-7:slot-2',
    'genki-2e:l1-l14:lesson-6-workbook-7:slot-3',
] as const;

export const reasonWorkbookPlugin: ActivityPlugin<ReasonWorkbookModel, ReasonWorkbookResponse> = {
    kind: 'academy-reason-workbook',
    validate(model) {
        const issues: ValidationIssue[] = [];
        if (model.kind !== this.kind || model.responseKind !== 'mixed-source-reason-workbook') {
            issues.push({ path: 'kind', message: 'Unexpected reason-workbook contract.' });
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
        const teaching = document.createElement('section');
        teaching.className = 'academy-reason-workbook academy-reason-teaching';
        teaching.dataset.lessonPhase = 'teaching';
        const title = document.createElement('h3');
        title.append(...localizedNodes({ ja: '先に理由の型を学ぶ', en: 'Learn the reason pattern first' }));
        const grid = document.createElement('div');
        grid.className = 'academy-reason-teaching-grid';
        model.payload.teaching.forEach(step => grid.append(teachingCard(step)));
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'academy-button academy-button-primary academy-reason-start';
        start.textContent = host.language === 'ja' ? '元の問題へ' : 'Start source workbook';
        start.addEventListener('click', showAssessment, { once: true });
        teaching.append(title, grid, start);
        host.replace(teaching);
        return { focus: () => (assessment?.form ?? start).focus(), dispose: () => { disposed = true; } };
    },
    grade(model, response) {
        const answers = parseResponse(model, response);
        const missed = model.payload.rounds.filter(round => !isCorrect(round, answers.get(round.id)!));
        return gradeFromScore((model.payload.rounds.length - missed.length) / model.payload.rounds.length,
            model.payload.passScore, missed.map(round => round.errorTag), model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        const rounds = result.outcome === 'pass' ? model.payload.rounds : model.payload.rounds.filter(round => result.errorTags.includes(round.errorTag));
        return rounds.map(round => ({
            id: `review:l1-l14:reason:${round.id}`,
            conceptId: round.conceptId,
            sourceQuestionId: round.sourceQuestionId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            content: { expression: round.answerExpression, meanings: [round.sourcePrompt], sentence: round.answerExpression },
        } satisfies ReviewSeed));
    },
};

function validateProvenance(model: ReasonWorkbookModel, issues: ValidationIssue[]): void {
    const source = model.provenance;
    const hashes = source?.moodle?.documents?.map(document => document.payloadSha256) ?? [];
    if (source?.packageId !== 'l1-l14' || source.answerVisibility !== 'after-attempt'
        || source.sourceOrder?.join(',') !== 'moodle,minna-mapping,genki' || source.moodle?.moduleId !== 6097314
        || !hashes.includes(MOODLE_REASON_SHA256) || !hashes.includes(MOODLE_WHY_SHA256) || !hashes.includes(MOODLE_EXISTENCE_SHA256)) {
        issues.push({ path: 'provenance.moodle', message: 'Exact Lesson 14 Moodle worksheets must precede all mapped material.' });
    }
    if (source?.minna?.payloadSha256 !== MINNA_SHA256 || source.minna.pdfPage !== 97 || source.minna.printedPage !== 77
        || source.minna.relation !== 'chronology-map-only' || !nonEmpty(source.minna.reason)) {
        issues.push({ path: 'provenance.minna', message: 'The Minna Lesson 9 chronology map must remain explicit and honest.' });
    }
    if (source?.genki?.taskId !== 'genki-2e:l1-l14:lesson-6-workbook-7' || source.genki.payloadSha256 !== GENKI_SHA256
        || source.genki.scriptSha256 !== GENKI_SCRIPT_SHA256 || source.genki.lineLocus.start !== 76 || source.genki.lineLocus.end !== 133
        || source.genki.sourceSlice.join(',') !== '1,2,3') {
        issues.push({ path: 'provenance.genki', message: 'Exact Genki Lesson 6 workbook 7 source slice is required.' });
    }
}

function validateTeaching(value: readonly ReasonTeachingStep[] | undefined, issues: ValidationIssue[]): void {
    if (!Array.isArray(value) || value.length !== 3 || !value.every(step => nonEmpty(step.sourceQuestionId) && nonEmpty(step.sourceLabel)
        && nonEmpty(step.pattern) && nonEmpty(step.example) && nonEmpty(step.explanation.en) && nonEmpty(step.explanation.ja))) {
        issues.push({ path: 'payload.teaching', message: 'Three bilingual, source-bound teaching steps are required before assessment.' });
    }
}

function validateRounds(model: ReasonWorkbookModel, issues: ValidationIssue[]): void {
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== EXACT_SOURCE_IDS.length) {
        issues.push({ path: 'payload.rounds', message: 'Every deterministic Lesson 14 Moodle and Genki source item is required.' });
        return;
    }
    const ids = new Set<string>();
    rounds.forEach((round, index) => {
        const valid = round.sourceOrder === index + 1 && round.mode === EXACT_MODES[index] && round.sourceQuestionId === EXACT_SOURCE_IDS[index]
            && nonEmpty(round.id) && !ids.has(round.id) && nonEmpty(round.sourcePrompt) && nonEmpty(round.answerExpression)
            && model.conceptIds.includes(round.conceptId) && round.hint.length === 3 && round.hint.every((hint: LocalizedText) => nonEmpty(hint.en) && nonEmpty(hint.ja));
        if (!valid) issues.push({ path: `payload.rounds.${index}`, message: 'Every ordered source item needs a unique identity and repair target.' });
        ids.add(round.id);
        if (round.mode === 'typed' && (!round.acceptedAnswers.length || !round.acceptedAnswers.every(nonEmpty))) {
            issues.push({ path: `payload.rounds.${index}`, message: 'Typed source rounds need accepted answers.' });
        }
        if (round.mode !== 'typed' && !round.options.some((option: ReasonWorkbookOption) => option.id === round.correctOptionId)) {
            issues.push({ path: `payload.rounds.${index}`, message: 'Choice source rounds need an offered correct answer.' });
        }
    });
}

function teachingCard(step: ReasonTeachingStep): HTMLElement {
    const card = document.createElement('article');
    card.className = 'academy-reason-teaching-step';
    card.dataset.sourceQuestionId = step.sourceQuestionId;
    const source = document.createElement('p'); source.className = 'academy-reason-source'; source.textContent = step.sourceLabel;
    const pattern = document.createElement('h4'); pattern.append(assessedJapanese(step.pattern));
    const explanation = document.createElement('p'); explanation.append(...localizedNodes(step.explanation));
    const example = document.createElement('p'); example.className = 'academy-reason-example'; example.append(assessedJapanese(step.example));
    card.append(source, pattern, explanation, example);
    return card;
}

function assessmentView(model: ReasonWorkbookModel, host: ActivityHost, submit: (response: ReasonWorkbookResponse) => Promise<void>) {
    const root = document.createElement('section');
    root.className = 'academy-reason-workbook academy-reason-assessment';
    root.dataset.lessonPhase = 'assessment';
    const title = document.createElement('h3'); title.append(...localizedNodes({ ja: 'どうして・から', en: 'Why? Because...' }));
    const form = document.createElement('form'); form.className = 'academy-reason-form';
    const grid = document.createElement('div'); grid.className = 'academy-reason-round-grid';
    model.payload.rounds.forEach(round => grid.append(renderRound(model, round)));
    const check = document.createElement('button'); check.type = 'submit'; check.className = 'academy-button academy-button-primary academy-reason-check'; check.textContent = host.language === 'ja' ? '答えを確認' : 'Check source workbook';
    const feedback = statusRegion('academy-reason-feedback');
    form.append(grid, check, feedback);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) { host.announce(host.language === 'ja' ? 'すべての問題に答えてください。' : 'Answer every source item first.'); return; }
        void submit(response);
    });
    root.append(title, form);
    return { root, form, feedback };
}

function renderRound(model: ReasonWorkbookModel, round: ReasonWorkbookRound): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = `academy-reason-round academy-reason-round-${round.mode}`;
    fieldset.dataset.roundId = round.id; fieldset.dataset.errorTag = round.errorTag;
    const legend = document.createElement('legend'); legend.textContent = `${round.sourceOrder}. ${round.sourcePrompt}`;
    const source = document.createElement('p'); source.className = 'academy-reason-source'; source.textContent = round.sourceLabel;
    fieldset.append(legend, source);
    const label = document.createElement('label');
    if (round.mode === 'typed') {
        label.textContent = '日本語の文 / Japanese sentence';
        const input = document.createElement('input'); input.type = 'text'; input.name = `${model.id}-${round.id}-value`; input.required = true; input.lang = 'ja'; input.autocomplete = 'off'; input.spellcheck = false; input.dataset.jpdbReaderSurfaceIgnore = '';
        label.append(input);
    } else {
        label.textContent = 'Answer / 答え';
        const select = document.createElement('select'); select.name = `${model.id}-${round.id}-option`; select.required = true; select.append(new Option('—', ''));
        round.options.forEach(option => select.append(new Option(option.label, option.id)));
        label.append(select);
    }
    fieldset.append(label);
    return fieldset;
}

function responseFromForm(model: ReasonWorkbookModel, form: HTMLFormElement): ReasonWorkbookResponse | null {
    const data = new FormData(form); const answers: ReasonWorkbookAnswer[] = [];
    for (const round of model.payload.rounds) {
        const value = data.get(`${model.id}-${round.id}-${round.mode === 'typed' ? 'value' : 'option'}`);
        if (!nonEmpty(value)) return null;
        answers.push(round.mode === 'typed' ? { mode: 'typed', roundId: round.id, value } : { mode: round.mode, roundId: round.id, optionId: value });
    }
    return { answers };
}

function parseResponse(model: ReasonWorkbookModel, response: ReasonWorkbookResponse): ReadonlyMap<string, ReasonWorkbookAnswer> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) throw new TypeError('Every deterministic Lesson 14 source item needs one response.');
    const answers = new Map<string, ReasonWorkbookAnswer>();
    for (const answer of response.answers) {
        const round = model.payload.rounds.find(candidate => candidate.id === answer.roundId);
        if (!round || answers.has(answer.roundId) || round.mode !== answer.mode) throw new TypeError('Responses must map once to their source item and interaction mode.');
        if (answer.mode === 'typed' && !nonEmpty(answer.value)) throw new TypeError('Typed source response cannot be blank.');
        if (round.mode !== 'typed' && answer.mode !== 'typed' && !round.options.some(option => option.id === answer.optionId)) throw new TypeError('Choice response is not an offered source answer.');
        answers.set(answer.roundId, answer);
    }
    return answers;
}

function isCorrect(round: ReasonWorkbookRound, answer: ReasonWorkbookAnswer): boolean {
    return round.mode === 'typed'
        ? answer.mode === 'typed' && round.acceptedAnswers.some(value => normalizeJapanese(value) === normalizeJapanese(answer.value))
        : answer.mode === round.mode && answer.optionId === round.correctOptionId;
}

function updateRepair(model: ReasonWorkbookModel, form: HTMLFormElement, errorTags: readonly string[], host: ActivityHost): void {
    const missed = new Set(errorTags);
    model.payload.rounds.forEach(round => {
        const fieldset = form.querySelector<HTMLFieldSetElement>(`[data-round-id="${round.id}"]`)!;
        const isMissed = missed.has(round.errorTag); fieldset.hidden = !isMissed && missed.size > 0;
        if (isMissed && !fieldset.querySelector('.academy-reason-hint-button')) appendHintButton(model, round, fieldset, host);
    });
}

function appendHintButton(model: ReasonWorkbookModel, round: ReasonWorkbookRound, root: HTMLElement, host: ActivityHost): void {
    let hintIndex = 0;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-reason-hint-button'; button.textContent = host.language === 'ja' ? 'ヒント' : 'Hint';
    const panel = document.createElement('p'); panel.className = 'academy-reason-hint-panel'; panel.hidden = true;
    button.addEventListener('click', () => {
        const hint = round.hint[hintIndex]; if (!hint) return;
        panel.hidden = false; panel.dataset.hintIndex = String(hintIndex + 1); panel.textContent = host.language === 'ja' ? hint.ja : hint.en;
        host.recordSupportUse?.({ activityId: model.id, supportKind: 'hint', choiceId: round.id });
        hintIndex += 1; button.disabled = hintIndex >= round.hint.length;
    });
    root.append(button, panel);
}

function nonEmpty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
