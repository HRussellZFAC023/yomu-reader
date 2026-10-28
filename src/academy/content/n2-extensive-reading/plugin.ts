import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    createActivityRuntime,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityPlugin,
    type GradeResult,
    type ReviewSeed,
    type ValidationIssue,
} from '../../domain/activity-runtime';
import {
    assessedJapanese,
    gradeFromScore,
    japanese,
    localized,
    localizedNodes,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    validatePassScore,
} from '../../minigames/activity-kit/shared';
import { N2_EXTENSIVE_READING_PROVENANCE, N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS } from './source';
import {
    N2_EXTENSIVE_READING_ACTIVITY_KIND,
    type N2ExtensiveReadingModel,
    type N2ExtensiveReadingQuestion,
    type N2ExtensiveReadingResponse,
} from './types';

export const n2ExtensiveReadingPlugin: ActivityPlugin<N2ExtensiveReadingModel, N2ExtensiveReadingResponse> = {
    kind: N2_EXTENSIVE_READING_ACTIVITY_KIND,
    validate: validateN2ExtensiveReading,
    render: renderN2ExtensiveReading,
    grade: gradeN2ExtensiveReading,
    toReviewSeeds: n2ExtensiveReadingReviewSeeds,
};

export function createN2ExtensiveReadingRuntime() {
    return createActivityRuntime([n2ExtensiveReadingPlugin]);
}

export function validateN2ExtensiveReading(model: N2ExtensiveReadingModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
    }
    if (!sameObject(model.provenance, N2_EXTENSIVE_READING_PROVENANCE)) {
        issues.push({ path: 'provenance', message: 'The exact permitted Soya file and item locus are required.' });
    }
    if (model.payload?.strategy?.map(item => item.id).join(',') !== 'preview,pivots,flow'
        || model.payload.strategy.some(item => !text(item.title.ja) || !text(item.title.en)
            || !text(item.instruction.ja) || !text(item.instruction.en))) {
        issues.push({ path: 'payload.strategy', message: 'Preview, pivot tracking, and flow-before-lookup must be taught in order.' });
    }
    if (model.payload?.source?.authorship !== 'exact-soya-source-item'
        || model.payload.source.timing !== 'untimed'
        || !sameObject(model.payload.source.paragraphs, N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS)) {
        issues.push({ path: 'payload.source', message: 'The exact untimed three-paragraph Soya source reading is required.' });
    }
    if (model.payload?.transfer?.authorship !== 'original-yomu-n1-transfer'
        || model.payload.transfer.paragraphs.length !== 2
        || model.payload.transfer.paragraphs.some(paragraph => !text(paragraph))) {
        issues.push({ path: 'payload.transfer', message: 'A complete original two-paragraph N1 transfer is required.' });
    }
    if (model.payload?.reflection?.authorship !== 'learner-authored-ungraded'
        || !text(model.payload.reflection.label.ja) || !text(model.payload.reflection.label.en)
        || !text(model.payload.reflection.guidance.ja) || !text(model.payload.reflection.guidance.en)) {
        issues.push({ path: 'payload.reflection', message: 'The optional ungraded reflection contract is required.' });
    }
    validateQuestions(model, issues);
    validatePassScore(model.payload?.passScore, issues);
    validateFeedback(model.payload?.feedback, issues);
    if (model.payload?.reviewTargets?.length !== 5 || model.payload.reviewTargets.some(target =>
        !text(target.id) || !model.conceptIds.includes(target.conceptId) || !text(target.expression)
        || !target.meanings.length || !text(target.sentence) || !target.repairFor.length)) {
        issues.push({ path: 'payload.reviewTargets', message: 'Five complete and related Reader/SRS repair targets are required.' });
    }
    return issues;
}

function gradeN2ExtensiveReading(model: N2ExtensiveReadingModel, response: N2ExtensiveReadingResponse): GradeResult {
    const answers = parseAnswers(model, response);
    const missed = model.payload.questions.filter(question => answers.get(question.id) !== question.correctOptionId);
    return gradeFromScore(
        (model.payload.questions.length - missed.length) / model.payload.questions.length,
        model.payload.passScore,
        missed.map(question => question.errorTag),
        model.payload.feedback,
    );
}

function n2ExtensiveReadingReviewSeeds(model: N2ExtensiveReadingModel, result: GradeResult): readonly ReviewSeed[] {
    const targets = result.outcome === 'pass'
        ? model.payload.reviewTargets
        : model.payload.reviewTargets.filter(target => target.repairFor.some(tag => result.errorTags.includes(tag)));
    return targets.map(target => ({
        id: target.id,
        conceptId: target.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: model.sourceQuestionId,
        content: {
            expression: target.expression,
            ...(target.reading ? { reading: target.reading } : {}),
            meanings: [...target.meanings],
            sentence: target.sentence,
        },
    }));
}

function renderN2ExtensiveReading(
    model: N2ExtensiveReadingModel,
    host: ActivityHost,
    submit: (response: N2ExtensiveReadingResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const readingDisposers: Array<() => void> = [];
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-n2-extensive-reading';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const strategy = renderStrategy(model, host);
    const form = document.createElement('form');
    form.className = 'academy-n2-extensive-reading-form';
    form.setAttribute('aria-labelledby', heading.id);
    form.append(
        renderReadingStage(model, host, 'source', readingDisposers),
        renderReadingStage(model, host, 'transfer', readingDisposers),
        renderReflection(model, host),
    );
    const commit = document.createElement('button');
    commit.type = 'submit';
    commit.className = 'academy-button academy-button-primary';
    commit.textContent = host.language === 'ja' ? '五つの判断を確定する' : 'Commit all five judgments';
    const status = statusRegion('academy-kit-feedback academy-n2-extensive-reading-feedback');
    form.append(commit);
    root.append(heading, strategy, form, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja' ? '五つの質問すべてに答えてください。' : 'Answer all five questions.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(form, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(form, false);
        }).catch(error => {
            setPending(form, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { heading.focus(); },
        dispose() {
            lifecycle.abort();
            readingDisposers.forEach(dispose => dispose());
            root.remove();
        },
    };
}

function renderStrategy(model: N2ExtensiveReadingModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-n2-extensive-reading-strategy';
    section.dataset.lessonPhase = 'instruction';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '読む前の三パス' : 'Three passes before reading';
    const list = document.createElement('ol');
    model.payload.strategy.forEach(item => {
        const row = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = localized(item.title, host);
        const instruction = document.createElement('p');
        instruction.textContent = localized(item.instruction, host);
        row.append(title, instruction);
        list.append(row);
    });
    section.append(heading, list);
    return section;
}

function renderReadingStage(
    model: N2ExtensiveReadingModel,
    host: ActivityHost,
    stage: 'source' | 'transfer',
    readingDisposers: Array<() => void>,
): HTMLElement {
    const content = model.payload[stage];
    const section = document.createElement('section');
    section.className = `academy-n2-extensive-reading-${stage}`;
    section.dataset.lessonPhase = stage === 'source' ? 'assessed-recognition' : 'assessed-production';
    const heading = document.createElement('h3');
    heading.append(...localizedNodes(content.title));
    const article = document.createElement('article');
    article.dataset.readingStage = stage;
    content.paragraphs.forEach((paragraph, index) => {
        const row = document.createElement('p');
        const surface = japanese(paragraph);
        surface.dataset.readerSurfaceId = `reader:n2-extensive-reading-01:${stage}:paragraph-${index + 1}`;
        if (host.registerReadingSurface) readingDisposers.push(host.registerReadingSurface(surface));
        row.append(surface);
        article.append(row);
    });
    section.append(heading, article);
    const questionStage = stage === 'source' ? 'source-comprehension' : 'n1-transfer';
    model.payload.questions.filter(question => question.stage === questionStage)
        .forEach(question => section.append(renderQuestion(question)));
    return section;
}

function renderQuestion(question: N2ExtensiveReadingQuestion): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'academy-n2-extensive-reading-question';
    fieldset.dataset.questionId = question.id;
    const legend = document.createElement('legend');
    legend.append(...localizedNodes(question.prompt));
    fieldset.append(legend);
    question.options.forEach(option => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = question.id;
        input.value = option.id;
        const copy = document.createElement('span');
        copy.append(assessedJapanese(option.label.ja), document.createTextNode(` ${option.label.en}`));
        label.append(input, copy);
        fieldset.append(label);
    });
    return fieldset;
}

function renderReflection(model: N2ExtensiveReadingModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-n2-extensive-reading-reflection';
    section.dataset.graded = 'false';
    const label = document.createElement('label');
    label.htmlFor = `${model.id}-reflection`;
    label.textContent = localized(model.payload.reflection.label, host);
    const guidance = document.createElement('p');
    guidance.textContent = localized(model.payload.reflection.guidance, host);
    const textarea = document.createElement('textarea');
    textarea.id = `${model.id}-reflection`;
    textarea.name = 'reflection';
    textarea.rows = 3;
    section.append(label, guidance, textarea);
    return section;
}

function responseFromForm(model: N2ExtensiveReadingModel, form: HTMLFormElement): N2ExtensiveReadingResponse | null {
    const data = new FormData(form);
    const answers = model.payload.questions.map(question => ({ questionId: question.id, optionId: String(data.get(question.id) ?? '') }));
    if (answers.some(answer => !answer.optionId)) return null;
    const reflection = String(data.get('reflection') ?? '').trim();
    return { answers, ...(reflection ? { reflection } : {}) };
}

function parseAnswers(model: N2ExtensiveReadingModel, response: N2ExtensiveReadingResponse): Map<string, string> {
    if (!response || !Array.isArray(response.answers)) throw new TypeError('Every extensive-reading question needs one answer.');
    const answers = new Map<string, string>();
    for (const answer of response.answers) {
        if (!text(answer?.questionId) || !text(answer?.optionId) || answers.has(answer.questionId)) {
            throw new TypeError('Every extensive-reading question needs one unique answer.');
        }
        const question = model.payload.questions.find(candidate => candidate.id === answer.questionId);
        if (!question || !question.options.some(option => option.id === answer.optionId)) {
            throw new TypeError('Every extensive-reading answer must use a declared option.');
        }
        answers.set(answer.questionId, answer.optionId);
    }
    if (answers.size !== model.payload.questions.length) throw new TypeError('Every extensive-reading question needs one answer.');
    return answers;
}

function validateQuestions(model: N2ExtensiveReadingModel, issues: ValidationIssue[]): void {
    const questions = model.payload?.questions;
    if (!Array.isArray(questions)) {
        issues.push({ path: 'payload.questions', message: 'Three source and two transfer questions with unique valid options are required.' });
        return;
    }
    const typedQuestions = questions as readonly N2ExtensiveReadingQuestion[];
    if (typedQuestions.length !== 5
        || typedQuestions.filter(question => question.stage === 'source-comprehension').length !== 3
        || typedQuestions.filter(question => question.stage === 'n1-transfer').length !== 2
        || new Set(typedQuestions.map(question => question.id)).size !== 5
        || typedQuestions.some(question => !text(question.prompt.ja) || !text(question.prompt.en)
            || question.options.length !== 3 || new Set(question.options.map(option => option.id)).size !== 3
            || !question.options.some(option => option.id === question.correctOptionId) || !text(question.errorTag))) {
        issues.push({ path: 'payload.questions', message: 'Three source and two transfer questions with unique valid options are required.' });
    }
}

function sameObject(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}
