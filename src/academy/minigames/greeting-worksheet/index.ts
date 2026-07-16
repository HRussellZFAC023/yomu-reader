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
    type ReviewableTarget,
} from '../activity-kit/shared';

export interface GreetingWorksheetResponse {
    readonly answers: readonly Readonly<{ promptId: string; optionId: string }>[];
}

export interface GreetingWorksheetTeachingStep {
    readonly sourceOrder: number;
    readonly title: LocalizedText;
    readonly pattern: string;
    readonly example: string;
    readonly explanation: LocalizedText;
}

export interface GreetingWorksheetOption {
    readonly id: string;
    readonly label: string;
}

export interface GreetingWorksheetPrompt {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly sourceOrder: number;
    readonly imageDescription: LocalizedText;
    readonly acceptedOptionIds: readonly string[];
    readonly conceptId: string;
    readonly errorTag: string;
    readonly reviewTarget: ReviewableTarget;
}

export interface GreetingWorksheetModel extends ActivityModel {
    readonly kind: 'academy-greeting-worksheet';
    readonly responseKind: 'source-image-context-choice';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l01';
        readonly moodleModuleId: 5777762;
        readonly handout: Readonly<{ sourceId: string; payloadSha256: string; title: string; locus: { page: 1 } }>;
        readonly greetingsReference: Readonly<{ sourceId: string; payloadSha256: string; title: string; locus: { page: 2 } }>;
        readonly vocabulary: Readonly<{ sourceId: string; payloadSha256: string; title: string; loci: readonly { page: number; row: number }[] }>;
        readonly homework: Readonly<{
            sourceId: string;
            payloadSha256: string;
            title: string;
            locus: { page: 1; prompts: readonly [1, 2, 3, 4, 5, 6] };
            imageUrl: string;
            imageSha256: string;
            sourceAnswerKeyStatus: 'not-present-in-digitized-corpus';
            gradingKey: 'yomu-contextual-key-derived-from-taught-source-expressions';
        }>;
        readonly answerVisibility: 'after-attempt';
    };
    readonly payload: {
        readonly sourceInstruction: string;
        readonly teaching: readonly GreetingWorksheetTeachingStep[];
        readonly sourceExpressions: readonly Readonly<{ optionId: string; sourceOrder: number; expression: string; meaning: string }>[];
        readonly options: readonly GreetingWorksheetOption[];
        readonly prompts: readonly GreetingWorksheetPrompt[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

export const greetingWorksheetPlugin: ActivityPlugin<GreetingWorksheetModel, GreetingWorksheetResponse> = {
    kind: 'academy-greeting-worksheet',
    validate,
    render,
    grade(model, response) {
        const answers = responseMap(model, response);
        const misses = model.payload.prompts.filter(prompt => !prompt.acceptedOptionIds.includes(answers.get(prompt.id) ?? ''));
        return gradeFromScore(
            (model.payload.prompts.length - misses.length) / model.payload.prompts.length,
            model.payload.passScore,
            misses.map(prompt => prompt.errorTag),
            model.payload.feedback,
        );
    },
    toReviewSeeds(model, result): readonly ReviewSeed[] {
        return model.payload.prompts.flatMap(prompt => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(prompt.errorTag)) return [];
            return [{
                id: prompt.reviewTarget.id,
                conceptId: prompt.reviewTarget.conceptId,
                reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
                sourceQuestionId: prompt.sourceQuestionId,
                content: {
                    expression: prompt.reviewTarget.expression,
                    meanings: [...prompt.reviewTarget.meanings],
                },
            }];
        });
    },
};

function validate(model: GreetingWorksheetModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'Worksheet choices require assessed answer support.' });
    }
    if (!text(model.provenance?.handout?.sourceId) || !sha(model.provenance?.handout?.payloadSha256)
        || !text(model.provenance?.greetingsReference?.sourceId) || !sha(model.provenance?.greetingsReference?.payloadSha256)
        || !text(model.provenance?.vocabulary?.sourceId) || !sha(model.provenance?.vocabulary?.payloadSha256)
        || !text(model.provenance?.homework?.sourceId) || !sha(model.provenance?.homework?.payloadSha256)
        || !safeImageUrl(model.provenance?.homework?.imageUrl) || !sha(model.provenance?.homework?.imageSha256)
        || model.provenance?.homework?.sourceAnswerKeyStatus !== 'not-present-in-digitized-corpus'
        || model.provenance?.homework?.gradingKey !== 'yomu-contextual-key-derived-from-taught-source-expressions'
        || model.provenance?.answerVisibility !== 'after-attempt') {
        issues.push({ path: 'provenance', message: 'Exact source records, a safe worksheet image, and answer-key attribution are required.' });
    }
    if (!text(model.payload?.sourceInstruction) || !Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 2
        || model.payload.teaching.some((step, index) => step.sourceOrder !== index + 1 || !text(step.title?.ja)
            || !text(step.title?.en) || !text(step.pattern) || !text(step.example) || !text(step.explanation?.ja) || !text(step.explanation?.en))) {
        issues.push({ path: 'payload.teaching', message: 'The two source handout teaching moves must precede practice.' });
    }
    const options = model.payload?.options;
    if (!Array.isArray(options) || options.length < 4 || new Set(options.map(option => option.id)).size !== options.length
        || options.some(option => !text(option.id) || !text(option.label))) {
        issues.push({ path: 'payload.options', message: 'Stable source-expression choices are required.' });
    }
    const optionIds = new Set<string>((options ?? []).map(option => option.id));
    const sourceExpressions = model.payload?.sourceExpressions;
    if (!Array.isArray(sourceExpressions) || sourceExpressions.length !== options?.length
        || sourceExpressions.some((expression, index) => expression.sourceOrder !== index + 1
            || !optionIds.has(expression.optionId) || !text(expression.expression) || !text(expression.meaning))) {
        issues.push({ path: 'payload.sourceExpressions', message: 'Every selectable expression needs its exact source reference before practice.' });
    }
    const prompts = model.payload?.prompts;
    if (!Array.isArray(prompts) || prompts.length !== 6) {
        issues.push({ path: 'payload.prompts', message: 'All six numbered source image prompts are required.' });
    } else {
        const ids = new Set<string>();
        const sourceIds = new Set<string>();
        const errorTags = new Set<string>();
        prompts.forEach((prompt, index) => {
            if (!text(prompt.id) || ids.has(prompt.id) || prompt.sourceOrder !== index + 1 || !text(prompt.sourceQuestionId)
                || sourceIds.has(prompt.sourceQuestionId) || !text(prompt.imageDescription?.ja) || !text(prompt.imageDescription?.en)
                || !prompt.acceptedOptionIds.length || prompt.acceptedOptionIds.some((id: string) => !optionIds.has(id))
                || !model.conceptIds.includes(prompt.conceptId) || !text(prompt.errorTag) || errorTags.has(prompt.errorTag)
                || !text(prompt.reviewTarget?.id) || prompt.reviewTarget.conceptId !== prompt.conceptId
                || !text(prompt.reviewTarget.expression) || !prompt.reviewTarget.meanings?.length) {
                issues.push({ path: `payload.prompts.${index}`, message: 'Every source image prompt needs a unique deterministic response contract.' });
            }
            ids.add(prompt.id);
            sourceIds.add(prompt.sourceQuestionId);
            errorTags.add(prompt.errorTag);
        });
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'Every source prompt must be correct.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function responseMap(model: GreetingWorksheetModel, response: GreetingWorksheetResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.prompts.length) {
        throw new TypeError('Every source image prompt needs one selected response.');
    }
    const answers = new Map<string, string>();
    for (const answer of response.answers) {
        if (!text(answer?.promptId) || !text(answer?.optionId) || answers.has(answer.promptId)) {
            throw new TypeError('Each source image prompt must be answered exactly once.');
        }
        answers.set(answer.promptId, answer.optionId);
    }
    if (model.payload.prompts.some(prompt => !answers.has(prompt.id))) {
        throw new TypeError('Every source image prompt needs one selected response.');
    }
    return answers;
}

function render(
    model: GreetingWorksheetModel,
    host: ActivityHost,
    submit: (response: GreetingWorksheetResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-greeting-worksheet';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const sourceInstruction = document.createElement('p');
    sourceInstruction.className = 'academy-greeting-worksheet-source-instruction';
    sourceInstruction.lang = 'en';
    sourceInstruction.textContent = model.payload.sourceInstruction;
    const teaching = document.createElement('section');
    teaching.className = 'academy-greeting-worksheet-teaching';
    teaching.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const article = document.createElement('article');
        article.dataset.sourceOrder = String(step.sourceOrder);
        const title = document.createElement('h3');
        title.append(...localizedNodes(step.title));
        const pattern = document.createElement('p');
        pattern.className = 'academy-japanese';
        pattern.lang = 'ja';
        pattern.textContent = step.pattern;
        const example = document.createElement('p');
        example.className = 'academy-greeting-worksheet-example academy-japanese';
        example.lang = 'ja';
        example.textContent = step.example;
        const explanation = document.createElement('p');
        explanation.append(...localizedNodes(step.explanation));
        article.append(title, pattern, example, explanation);
        teaching.append(article);
    });
    const reference = document.createElement('section');
    reference.className = 'academy-greeting-worksheet-reference';
    reference.dataset.lessonPhase = 'reference';
    const referenceTitle = document.createElement('h3');
    referenceTitle.textContent = host.language === 'ja' ? '先生のあいさつ' : 'Teacher greeting reference';
    const referenceList = document.createElement('dl');
    model.payload.sourceExpressions.forEach(item => {
        const expression = document.createElement('dt');
        expression.className = 'academy-japanese';
        expression.lang = 'ja';
        expression.textContent = item.expression;
        const meaning = document.createElement('dd');
        meaning.lang = 'en';
        meaning.textContent = item.meaning;
        referenceList.append(expression, meaning);
    });
    reference.append(referenceTitle, referenceList);
    const sourceImage = document.createElement('img');
    sourceImage.className = 'academy-greeting-worksheet-image';
    sourceImage.src = model.provenance.homework.imageUrl;
    sourceImage.alt = host.language === 'ja'
        ? '先生のワークシートの六つのあいさつ場面。番号 1 から 6。'
        : 'Teacher worksheet page with the six numbered greeting scenes, one through six.';
    const form = document.createElement('form');
    form.className = 'academy-greeting-worksheet-form';
    form.setAttribute('aria-labelledby', heading.id);
    model.payload.prompts.forEach(prompt => form.append(renderPrompt(prompt, model.payload.options)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary';
    check.textContent = host.language === 'ja' ? '答えを確認する' : 'Check the worksheet';
    form.append(check);
    const status = statusRegion('academy-kit-feedback academy-greeting-worksheet-feedback');
    root.append(heading, sourceInstruction, teaching, reference, sourceImage, form, status);
    host.replace(root);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = formResponse(model, form);
        if (!response) {
            const message = host.language === 'ja' ? '六つの場面をすべて選んでください。' : 'Choose an expression for all six scenes.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(root, false);
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });
    return {
        focus() { form.querySelector<HTMLSelectElement>('select')?.focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderPrompt(prompt: GreetingWorksheetPrompt, options: readonly GreetingWorksheetOption[]): HTMLElement {
    const row = document.createElement('label');
    row.className = 'academy-greeting-worksheet-row';
    row.dataset.sourceOrder = String(prompt.sourceOrder);
    const description = document.createElement('span');
    description.className = 'academy-greeting-worksheet-description';
    description.append(...localizedNodes(prompt.imageDescription));
    const select = document.createElement('select');
    select.name = prompt.id;
    select.append(new Option('Choose an expression', ''), ...options.map(option => new Option(option.label, option.id)));
    row.append(description, select);
    return row;
}

function formResponse(model: GreetingWorksheetModel, form: HTMLFormElement): GreetingWorksheetResponse | undefined {
    const answers = model.payload.prompts.map(prompt => ({
        promptId: prompt.id,
        optionId: (form.elements.namedItem(prompt.id) as HTMLSelectElement | null)?.value ?? '',
    }));
    return answers.every(answer => answer.optionId) ? { answers } : undefined;
}

function sha(value: unknown): boolean { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value); }
function safeImageUrl(value: unknown): boolean { return typeof value === 'string' && /^\/academy\/content\/lessons\/l1-l01\/[a-z0-9-]+\.png$/u.test(value); }
