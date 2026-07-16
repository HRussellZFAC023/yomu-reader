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

export interface SkillUnderstandingTeachingStep {
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly pattern: string;
    readonly explanation: LocalizedText;
    readonly example: string;
}

export interface SkillUnderstandingOption {
    readonly id: string;
    readonly label: string;
}

interface RoundBase {
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

export interface ChoiceRound extends RoundBase {
    readonly mode: 'skill-choice' | 'question-choice' | 'reply-choice';
    readonly options: readonly SkillUnderstandingOption[];
    readonly correctOptionId: string;
}

export interface TypedRound extends RoundBase {
    readonly mode: 'typed';
    readonly acceptedAnswers: readonly string[];
}

export type SkillUnderstandingRound = ChoiceRound | TypedRound;

export type SkillUnderstandingAnswer =
    | Readonly<{ mode: 'skill-choice' | 'question-choice' | 'reply-choice'; roundId: string; optionId: string }>
    | Readonly<{ mode: 'typed'; roundId: string; value: string }>;

export interface SkillUnderstandingResponse {
    readonly answers: readonly SkillUnderstandingAnswer[];
}

export interface SkillUnderstandingWorkbookModel extends ActivityModel {
    readonly kind: 'academy-skill-understanding-workbook';
    readonly responseKind: 'mixed-source-skill-understanding-workbook';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l13';
        readonly answerVisibility: 'after-attempt';
        readonly sourceOrder: readonly ['moodle', 'minna', 'genki'];
        readonly moodle: {
            readonly moduleId: 5489595;
            readonly archiveSha256: string;
            readonly documents: readonly { readonly payloadSha256: string; readonly member: string; readonly pages: string }[];
        };
        readonly minna: {
            readonly sourceId: string;
            readonly reference: 'Minna no Nihongo I, Lesson 9';
            readonly payloadSha256: string;
            readonly pdfPage: 97;
            readonly printedPage: 77;
            readonly exercise: 'Practice B, exercise 4';
        };
        readonly genki: {
            readonly taskId: 'genki-2e:l1-l13:lesson-5-workbook-8';
            readonly sourceId: string;
            readonly relativePath: 'lessons/lesson-5/workbook-8/index.html';
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 139 };
            readonly engine: 'Genki.generateQuiz';
            readonly sourceSlice: readonly [7, 8, 9];
        };
    };
    readonly payload: {
        readonly teaching: readonly SkillUnderstandingTeachingStep[];
        readonly rounds: readonly SkillUnderstandingRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const MOODLE_SKILL_SHA256 = '189a165207404014343ed19be7bdba76e59212586273f68d9e27c5f0651d3fde';
const MOODLE_UNDERSTANDING_SHA256 = '5703647975dcf519399c5a911254a9a418ace4af7f8403242f1255e9e1dcfd1e';
const MINNA_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
const GENKI_SHA256 = '3ccb538a2f9708ae43fcfd56640f7ee040a784eb790f61df0e401adb2506bff7';
const GENKI_SCRIPT_SHA256 = '02d771397a001cb17900fce9f63abc17221db0fb14f01839ddf34a102febcd21';
const EXACT_MODES = [
    'skill-choice', 'skill-choice', 'skill-choice', 'skill-choice', 'question-choice',
    'reply-choice', 'reply-choice', 'reply-choice',
    'reply-choice', 'reply-choice', 'reply-choice', 'reply-choice',
    'typed', 'typed', 'typed',
] as const;
const EXACT_SOURCE_IDS = [
    'moodle:5489595:189a1652:p2:q1:1',
    'moodle:5489595:189a1652:p2:q1:2',
    'moodle:5489595:189a1652:p2:q1:3',
    'moodle:5489595:189a1652:p2:q1:4',
    'moodle:5489595:57036479:p1:q1:1',
    'moodle:5489595:57036479:p4:q2:1',
    'moodle:5489595:57036479:p4:q2:2',
    'moodle:5489595:57036479:p4:q2:4',
    `minna-i:${MINNA_SHA256}:lesson-9:pdf-p97:practice-b:4:1`,
    `minna-i:${MINNA_SHA256}:lesson-9:pdf-p97:practice-b:4:2`,
    `minna-i:${MINNA_SHA256}:lesson-9:pdf-p97:practice-b:4:3`,
    `minna-i:${MINNA_SHA256}:lesson-9:pdf-p97:practice-b:4:4`,
    'genki-2e:l1-l13:lesson-5-workbook-8:slot-7',
    'genki-2e:l1-l13:lesson-5-workbook-8:slot-8',
    'genki-2e:l1-l13:lesson-5-workbook-8:slot-9',
] as const;

export const skillUnderstandingWorkbookPlugin: ActivityPlugin<SkillUnderstandingWorkbookModel, SkillUnderstandingResponse> = {
    kind: 'academy-skill-understanding-workbook',
    validate(model) {
        const issues: ValidationIssue[] = [];
        if (model.kind !== this.kind || model.responseKind !== 'mixed-source-skill-understanding-workbook') {
            issues.push({ path: 'kind', message: 'Unexpected skill-and-understanding workbook contract.' });
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
        teaching.className = 'academy-skill-understanding-workbook academy-skill-understanding-teaching';
        teaching.dataset.lessonPhase = 'teaching';
        const title = document.createElement('h3');
        title.append(...localizedNodes({ ja: '型を先に学ぶ', en: 'Learn the pattern first' }));
        const grid = document.createElement('div');
        grid.className = 'academy-skill-understanding-teaching-grid';
        model.payload.teaching.forEach(step => grid.append(teachingCard(step)));
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'academy-button academy-button-primary academy-skill-understanding-start';
        start.textContent = host.language === 'ja' ? '元の問題へ' : 'Start source workbook';
        start.addEventListener('click', showAssessment, { once: true });
        teaching.append(title, grid, start);
        host.replace(teaching);
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

function validateProvenance(model: SkillUnderstandingWorkbookModel, issues: ValidationIssue[]): void {
    const source = model.provenance;
    const moodleHashes = source?.moodle?.documents?.map(document => document.payloadSha256) ?? [];
    if (source?.packageId !== 'l1-l13' || source.answerVisibility !== 'after-attempt'
        || source.sourceOrder?.join(',') !== 'moodle,minna,genki'
        || source.moodle?.moduleId !== 5489595 || !moodleHashes.includes(MOODLE_SKILL_SHA256)
        || !moodleHashes.includes(MOODLE_UNDERSTANDING_SHA256)) {
        issues.push({ path: 'provenance.moodle', message: 'Exact Lesson 13 Moodle worksheets and source order are required.' });
    }
    if (source?.minna?.payloadSha256 !== MINNA_SHA256 || source.minna.pdfPage !== 97
        || source.minna.printedPage !== 77 || source.minna.exercise !== 'Practice B, exercise 4') {
        issues.push({ path: 'provenance.minna', message: 'Exact Minna Lesson 9 Practice B 4 is required.' });
    }
    if (source?.genki?.payloadSha256 !== GENKI_SHA256 || source.genki.scriptSha256 !== GENKI_SCRIPT_SHA256
        || source.genki.lineLocus.start !== 76 || source.genki.lineLocus.end !== 139
        || source.genki.sourceSlice.join(',') !== '7,8,9') {
        issues.push({ path: 'provenance.genki', message: 'Exact Genki Lesson 5 workbook 8 preference slice is required.' });
    }
}

function validateTeaching(value: readonly SkillUnderstandingTeachingStep[] | undefined, issues: ValidationIssue[]): void {
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

function validateRounds(model: SkillUnderstandingWorkbookModel, issues: ValidationIssue[]): void {
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 15) {
        issues.push({ path: 'payload.rounds', message: 'All fifteen ordered source items are required.' });
        return;
    }
    const ids = new Set<string>();
    rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        if (round.sourceOrder !== index + 1 || round.mode !== EXACT_MODES[index] || round.sourceQuestionId !== EXACT_SOURCE_IDS[index]
            || !nonEmpty(round.id) || ids.has(round.id)
            || !nonEmpty(round.sourceQuestionId) || !nonEmpty(round.sourceLabel) || !nonEmpty(round.sourcePrompt)
            || !nonEmpty(round.answerExpression) || !nonEmpty(round.errorTag) || !model.conceptIds.includes(round.conceptId)) {
            issues.push({ path, message: 'Every ordered source item needs a unique identity and repair target.' });
        }
        ids.add(round.id);
        if (round.hint.length !== 3 || !round.hint.every((hint: LocalizedText) => nonEmpty(hint.en) && nonEmpty(hint.ja))) {
            issues.push({ path, message: 'Every source item needs three bilingual repair hints.' });
        }
        if (round.mode === 'typed' && (!round.acceptedAnswers.length || !round.acceptedAnswers.every(nonEmpty))) {
            issues.push({ path, message: 'Typed source rounds need accepted answers.' });
        }
        if (round.mode !== 'typed' && !round.options.some((option: SkillUnderstandingOption) => option.id === round.correctOptionId)) {
            issues.push({ path, message: 'Choice source rounds need an offered correct answer.' });
        }
    });
}

function teachingCard(step: SkillUnderstandingTeachingStep): HTMLElement {
    const card = document.createElement('article');
    card.className = 'academy-skill-understanding-teaching-step';
    card.dataset.sourceQuestionId = step.sourceQuestionId;
    const source = document.createElement('p');
    source.className = 'academy-skill-understanding-source';
    source.textContent = step.sourceLabel;
    const pattern = document.createElement('h4');
    pattern.append(assessedJapanese(step.pattern));
    const explanation = document.createElement('p');
    explanation.append(...localizedNodes(step.explanation));
    const example = document.createElement('p');
    example.className = 'academy-skill-understanding-example';
    example.append(assessedJapanese(step.example));
    card.append(source, pattern, explanation, example);
    return card;
}

function assessmentView(
    model: SkillUnderstandingWorkbookModel,
    host: ActivityHost,
    submit: (response: SkillUnderstandingResponse) => Promise<void>,
): Readonly<{ root: HTMLElement; form: HTMLFormElement; feedback: HTMLElement }> {
    const root = document.createElement('section');
    root.className = 'academy-skill-understanding-workbook academy-skill-understanding-assessment';
    root.dataset.lessonPhase = 'assessment';
    const title = document.createElement('h3');
    title.append(...localizedNodes({ ja: 'じょうずです・わかります', en: 'Skills and understanding' }));
    const form = document.createElement('form');
    form.className = 'academy-skill-understanding-form';
    const grid = document.createElement('div');
    grid.className = 'academy-skill-understanding-round-grid';
    model.payload.rounds.forEach(round => grid.append(renderRound(model, round)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-skill-understanding-check';
    check.textContent = host.language === 'ja' ? '答えを確認' : 'Check source workbook';
    const feedback = statusRegion('academy-skill-understanding-feedback');
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

function renderRound(model: SkillUnderstandingWorkbookModel, round: SkillUnderstandingRound): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = `academy-skill-understanding-round academy-skill-understanding-round-${round.mode}`;
    fieldset.dataset.roundId = round.id;
    fieldset.dataset.errorTag = round.errorTag;
    const legend = document.createElement('legend');
    legend.textContent = `${round.sourceOrder}. ${round.sourcePrompt}`;
    const source = document.createElement('p');
    source.className = 'academy-skill-understanding-source';
    source.textContent = round.sourceLabel;
    fieldset.append(legend, source);
    if (round.mode === 'typed') {
        const label = document.createElement('label');
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
        label.textContent = 'Answer / 答え';
        const select = document.createElement('select');
        select.name = `${model.id}-${round.id}-option`;
        select.required = true;
        select.append(new Option('—', ''));
        round.options.forEach(option => select.append(new Option(option.label, option.id)));
        label.append(select);
        fieldset.append(label);
    }
    return fieldset;
}

function responseFromForm(model: SkillUnderstandingWorkbookModel, form: HTMLFormElement): SkillUnderstandingResponse | null {
    const data = new FormData(form);
    const answers: SkillUnderstandingAnswer[] = [];
    for (const round of model.payload.rounds) {
        if (round.mode === 'typed') {
            const value = data.get(`${model.id}-${round.id}-value`);
            if (!nonEmpty(value)) return null;
            answers.push({ mode: 'typed', roundId: round.id, value });
        } else {
            const optionId = data.get(`${model.id}-${round.id}-option`);
            if (!nonEmpty(optionId)) return null;
            answers.push({ mode: round.mode, roundId: round.id, optionId });
        }
    }
    return { answers };
}

function parseResponse(model: SkillUnderstandingWorkbookModel, response: SkillUnderstandingResponse): ReadonlyMap<string, SkillUnderstandingAnswer> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every exact Lesson 13 source item needs one response.');
    }
    const answers = new Map<string, SkillUnderstandingAnswer>();
    for (const answer of response.answers) {
        const round = model.payload.rounds.find(candidate => candidate.id === answer.roundId);
        if (!round || answers.has(answer.roundId) || round.mode !== answer.mode) {
            throw new TypeError('Responses must map once to their source item and interaction mode.');
        }
        if (answer.mode === 'typed' && !nonEmpty(answer.value)) throw new TypeError('Typed source response cannot be blank.');
        if (round.mode !== 'typed' && answer.mode !== 'typed' && !round.options.some(option => option.id === answer.optionId)) {
            throw new TypeError('Choice response is not an offered source answer.');
        }
        answers.set(answer.roundId, answer);
    }
    return answers;
}

function isCorrect(round: SkillUnderstandingRound, answer: SkillUnderstandingAnswer): boolean {
    if (round.mode === 'typed') {
        return answer.mode === 'typed' && round.acceptedAnswers.some(value => normalizeJapanese(value) === normalizeJapanese(answer.value));
    }
    return answer.mode === round.mode && answer.optionId === round.correctOptionId;
}

function updateRepair(model: SkillUnderstandingWorkbookModel, form: HTMLFormElement, errorTags: readonly string[], host: ActivityHost): void {
    const missed = new Set(errorTags);
    model.payload.rounds.forEach(round => {
        const fieldset = form.querySelector<HTMLFieldSetElement>(`[data-round-id="${round.id}"]`)!;
        const isMissed = missed.has(round.errorTag);
        fieldset.hidden = !isMissed && missed.size > 0;
        if (isMissed && !fieldset.querySelector('.academy-skill-understanding-hint-button')) appendHintButton(model, round, fieldset, host);
    });
}

function appendHintButton(model: SkillUnderstandingWorkbookModel, round: SkillUnderstandingRound, root: HTMLElement, host: ActivityHost): void {
    let hintIndex = 0;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-skill-understanding-hint-button';
    button.textContent = host.language === 'ja' ? 'ヒント' : 'Hint';
    const panel = document.createElement('p');
    panel.className = 'academy-skill-understanding-hint-panel';
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

function reviewSeed(round: SkillUnderstandingRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l1-l13:skill-understanding:${round.id}`,
        conceptId: round.conceptId,
        sourceQuestionId: round.sourceQuestionId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        content: { expression: round.answerExpression, meanings: [round.sourcePrompt], sentence: round.answerExpression },
    };
}

function nonEmpty(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}
