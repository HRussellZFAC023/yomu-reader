import type {
    ActivityController,
    ActivityEvaluation,
    ActivityHost,
    ActivityModel,
    ActivityPlugin,
    ValidationIssue,
} from '../../domain/activity-runtime';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import {
    assessedJapanese,
    gradeFromScore,
    japanese,
    localizedNodes,
    reviewSeeds,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    validatePassScore,
    validateReviewTargets,
    type ActivityFeedbackSet,
    type ReviewableTarget,
} from './shared';

export interface StoryReaderSection {
    readonly id: string;
    readonly heading?: LocalizedText;
    readonly paragraphs: readonly string[];
}

export interface StoryReaderQuestion {
    readonly id: string;
    readonly prompt: LocalizedText;
    readonly options: readonly Readonly<{ id: string; label: string }>[];
    readonly correctOptionId: string;
    readonly errorTag: string;
}

export interface StoryReaderResponse {
    readonly answers: readonly Readonly<{ questionId: string; optionId: string }>[];
}

export interface StoryReaderModel extends ActivityModel {
    readonly kind: 'academy-story-reader';
    readonly responseKind: 'extended-reading-checkpoint';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly payload: {
        readonly title: LocalizedText;
        readonly sections: readonly StoryReaderSection[];
        readonly questions: readonly StoryReaderQuestion[];
        readonly passScore: number;
        readonly feedback: ActivityFeedbackSet;
        readonly reviewTargets: readonly ReviewableTarget[];
    };
}

export const storyReaderPlugin: ActivityPlugin<StoryReaderModel, StoryReaderResponse> = {
    kind: 'academy-story-reader',
    validate,
    render,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const correct = model.payload.questions.filter(question => answers.get(question.id) === question.correctOptionId);
        const missed = model.payload.questions.filter(question => !correct.includes(question));
        return gradeFromScore(
            correct.length / model.payload.questions.length,
            model.payload.passScore,
            missed.map(question => question.errorTag),
            model.payload.feedback,
        );
    },
    toReviewSeeds(model, result) {
        return reviewSeeds(model.payload.reviewTargets, result, model.sourceQuestionId);
    },
};

function validate(model: StoryReaderModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model.answerSupport) issues.push({ path: 'answerSupport', message: 'Assessed reading requires the answer-support contract.' });
    if (!text(model.payload?.title?.en) || !text(model.payload?.title?.ja)) {
        issues.push({ path: 'payload.title', message: 'A bilingual story title is required.' });
    }
    const sections = model.payload?.sections;
    if (!Array.isArray(sections) || sections.length < 2
        || sections.some(section => !text(section.id) || !section.paragraphs?.length
            || section.paragraphs.some((paragraph: string) => !text(paragraph)))) {
        issues.push({ path: 'payload.sections', message: 'Extended reading needs at least two non-empty sections.' });
    }
    const questions = model.payload?.questions;
    if (!Array.isArray(questions) || questions.length < 2) {
        issues.push({ path: 'payload.questions', message: 'At least two reading checkpoints are required.' });
    } else questions.forEach((question, index) => {
        const optionIds = new Set(question.options.map((option: Readonly<{ id: string }>) => option.id));
        if (!text(question.id) || !text(question.prompt.en) || !text(question.prompt.ja)
            || question.options.length < 2 || optionIds.size !== question.options.length
            || !optionIds.has(question.correctOptionId) || !text(question.errorTag)) {
            issues.push({ path: `payload.questions.${index}`, message: 'Reading questions need a prompt, unique choices, answer, and error tag.' });
        }
    });
    validatePassScore(model.payload.passScore, issues);
    validateFeedback(model.payload.feedback, issues);
    validateReviewTargets(model.payload.reviewTargets, model.conceptIds, issues);
    return issues;
}

function render(
    model: StoryReaderModel,
    host: ActivityHost,
    submit: (response: StoryReaderResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-story-reader';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const article = document.createElement('article');
    article.className = 'academy-story-reader-passage';
    article.tabIndex = -1;
    article.setAttribute('aria-labelledby', `${model.id}-story-title`);
    const storyTitle = document.createElement('h3');
    storyTitle.id = `${model.id}-story-title`;
    storyTitle.append(...localizedNodes(model.payload.title));
    article.append(storyTitle);
    const readingDisposers: Array<() => void> = [];
    model.payload.sections.forEach(section => {
        const block = document.createElement('section');
        block.className = 'academy-story-reader-section';
        if (section.heading) {
            const title = document.createElement('h4');
            title.append(...localizedNodes(section.heading));
            block.append(title);
        }
        section.paragraphs.forEach(value => {
            const paragraph = document.createElement('p');
            const span = japanese(value);
            paragraph.append(span);
            block.append(paragraph);
            if (host.registerReadingSurface) readingDisposers.push(host.registerReadingSurface(span));
        });
        article.append(block);
    });
    const form = document.createElement('form');
    form.className = 'academy-story-reader-questions';
    model.payload.questions.forEach((question, index) => form.append(questionFieldset(question, index)));
    const commit = document.createElement('button');
    commit.type = 'submit';
    commit.className = 'academy-button academy-button-primary';
    commit.textContent = host.language === 'ja' ? '読解を確認' : 'Check reading';
    const status = statusRegion('academy-kit-feedback');
    form.append(commit);
    root.append(heading, article, form, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const data = new FormData(form);
        const answers = model.payload.questions.map(question => ({
            questionId: question.id,
            optionId: String(data.get(question.id) ?? ''),
        }));
        const missing = answers.find(answer => !answer.optionId);
        if (missing) {
            status.textContent = host.language === 'ja' ? 'すべての質問に答えてください。' : 'Answer every checkpoint.';
            form.querySelector<HTMLInputElement>(`input[name="${missing.questionId}"]`)?.focus();
            return;
        }
        setPending(form, true);
        void submit({ answers }).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(form, false);
        }).catch(error => {
            setPending(form, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { article.focus(); },
        dispose() {
            lifecycle.abort();
            readingDisposers.forEach(dispose => dispose());
            root.remove();
        },
    };
}

function questionFieldset(question: StoryReaderQuestion, index: number): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'academy-story-reader-question';
    const legend = document.createElement('legend');
    legend.append(...localizedNodes(question.prompt));
    fieldset.append(legend);
    question.options.forEach(option => {
        const label = document.createElement('label');
        label.className = 'academy-story-reader-option';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = question.id;
        radio.value = option.id;
        if (index === 0 && fieldset.childElementCount === 1) radio.autofocus = false;
        label.append(radio, assessedJapanese(option.label));
        fieldset.append(label);
    });
    return fieldset;
}

function parseResponse(model: StoryReaderModel, response: StoryReaderResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.questions.length) {
        throw new TypeError('Every reading checkpoint needs one answer.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        const question = model.payload.questions.find(candidate => candidate.id === answer.questionId);
        if (!question || answers.has(answer.questionId) || !question.options.some(option => option.id === answer.optionId)) {
            throw new TypeError('Reading answers must use each authored checkpoint once.');
        }
        answers.set(answer.questionId, answer.optionId);
    });
    return answers;
}
