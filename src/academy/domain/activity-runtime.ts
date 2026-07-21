import type { LearnerEventInput } from './learner-record';
import type { LearnerSupportUse } from './learner-support';
import type { LocalizedText } from './source-library';

export interface ActivityModel {
    readonly id: string;
    readonly kind: string;
    readonly sourceQuestionId?: string;
    readonly conceptIds: readonly string[];
    readonly responseKind: string;
    readonly curriculumPhase?: 'context' | 'instruction' | 'guided-practice' | 'assessed-recognition' | 'assessed-production';
    readonly prompt: LocalizedText;
    readonly payload: unknown;
    readonly answerSupport?: AnswerSupportContract;
    readonly teachingSupport?: ActivityTeachingSupport;
}

export interface ActivityTeachingSupportEntry {
    readonly japanese: string;
    readonly reading?: string;
    readonly translation?: string;
}

export interface ActivityTeachingSupport {
    readonly kind: 'example' | 'vocabulary' | 'pattern' | 'context';
    readonly title: LocalizedText;
    readonly entries: readonly ActivityTeachingSupportEntry[];
}

export interface AnswerSupportContract {
    readonly id: 'academy-assessed-v1';
    readonly englishUiPreCommit: {
        readonly assessedJapanese: 'hidden';
        readonly transcripts: 'hidden';
        readonly translations: 'hidden';
        readonly definitions: 'hidden';
        readonly exampleGlosses: 'hidden';
        readonly modelAnswers: 'hidden';
    };
    readonly earnedHintPolicy: 'explicit-after-attempt';
    readonly preCommitChoiceStyle: 'neutral';
    readonly evidenceRequires: 'learner-commitment';
    readonly animatedReactions: 'presentation-only';
}

export const ACADEMY_ASSESSED_ANSWER_SUPPORT: AnswerSupportContract = {
    id: 'academy-assessed-v1',
    englishUiPreCommit: {
        assessedJapanese: 'hidden',
        transcripts: 'hidden',
        translations: 'hidden',
        definitions: 'hidden',
        exampleGlosses: 'hidden',
        modelAnswers: 'hidden',
    },
    earnedHintPolicy: 'explicit-after-attempt',
    preCommitChoiceStyle: 'neutral',
    evidenceRequires: 'learner-commitment',
    animatedReactions: 'presentation-only',
};

export interface ValidationIssue {
    readonly path: string;
    readonly message: string;
}

export interface FeedbackBlock {
    readonly explanation: LocalizedText;
    readonly repairPrompt?: LocalizedText;
    readonly nearbyExample?: LocalizedText;
}

export interface GradeResult {
    readonly outcome: 'pass' | 'lapse';
    readonly score: number;
    readonly errorTags: readonly string[];
    readonly feedback: FeedbackBlock;
}

export interface ReviewSeed {
    readonly id: string;
    readonly conceptId: string;
    readonly reason: 'new-learning' | 'repair' | 'delayed-review';
    readonly sourceQuestionId?: string;
    readonly schedule?: Readonly<{
        readonly dueAfterMs: number;
    }>;
    readonly content: {
        readonly expression: string;
        readonly reading?: string;
        readonly meanings: readonly string[];
        readonly sentence?: string;
    };
}

export interface ActivityEvaluation {
    readonly result: GradeResult;
    readonly attempt: Extract<LearnerEventInput, { kind: 'attempt-recorded' }>;
    readonly reviewSeeds: readonly ReviewSeed[];
}

export interface ActivityHost {
    replace(view: HTMLElement): void;
    announce(message: string): void;
    readonly language?: 'en' | 'ja';
    recordSupportUse?(support: Readonly<{
        activityId: string;
        supportKind: 'hint';
        choiceId: string;
    }>): void | Promise<void>;
    /** Persisted support evidence, supplied when a host can resume an activity. */
    readonly learnerSupportUses?: readonly LearnerSupportUse[];
    react?(reaction: Readonly<{ speakerId: 'rie'; expression: 'neutral' | 'encouraging' | 'happy' | 'repair' }>): void;
    /** Lets a containing VN own the single readings control for embedded work. */
    registerReadingSurface?(surface: HTMLElement): () => void;
    /** Plays one injected Japanese target through the canonical Yomu bridge. */
    playPronunciation?(term: string, reading?: string): Promise<{ dispose(): void }>;
}

export interface ActivityController {
    focus(): void;
    dispose(): void;
}

export interface ActivityPlugin<Model extends ActivityModel = ActivityModel, Response = unknown> {
    readonly kind: Model['kind'];
    validate(model: Model): readonly ValidationIssue[];
    render(
        model: Model,
        host: ActivityHost,
        submit: (response: Response) => Promise<ActivityEvaluation>,
    ): ActivityController;
    grade(model: Model, response: Response): GradeResult;
    toReviewSeeds(model: Model, result: GradeResult): readonly ReviewSeed[];
}

export interface ActivityRuntime {
    validate(model: ActivityModel): readonly ValidationIssue[];
    evaluate(model: ActivityModel, response: unknown): ActivityEvaluation;
    mount(
        model: ActivityModel,
        host: ActivityHost,
        onEvaluation: (evaluation: ActivityEvaluation) => void | Promise<void>,
    ): ActivityController;
}

export function createActivityRuntime(plugins: readonly ActivityPlugin[]): ActivityRuntime {
    const registry = new Map<string, ActivityPlugin>();
    for (const plugin of plugins) {
        const kind = requireText(plugin.kind, 'plugin.kind');
        if (registry.has(kind)) throw new Error(`Duplicate activity plugin: ${kind}`);
        registry.set(kind, plugin);
    }

    const pluginFor = (model: ActivityModel): ActivityPlugin => {
        const issues = validateBaseModel(model);
        if (issues.length) throw new ActivityValidationError(model?.id ?? '(unknown)', issues);
        const plugin = registry.get(model.kind);
        if (!plugin) throw new Error(`No activity plugin registered for ${model.kind}.`);
        return plugin;
    };

    const evaluate = (model: ActivityModel, response: unknown): ActivityEvaluation => {
        const plugin = pluginFor(model);
        const issues = plugin.validate(model);
        if (issues.length) throw new ActivityValidationError(model.id, issues);
        const result = normalizeGrade(plugin.grade(model, response));
        const reviewSeeds = plugin.toReviewSeeds(model, result).map(seed => normalizeReviewSeed(seed, model));
        return {
            result,
            attempt: {
                kind: 'attempt-recorded',
                activityId: model.id,
                ...(model.sourceQuestionId ? { sourceQuestionId: model.sourceQuestionId } : {}),
                conceptIds: unique(model.conceptIds),
                responseKind: model.responseKind,
                outcome: result.outcome,
                score: result.score,
                errorTags: result.errorTags,
            },
            reviewSeeds,
        };
    };

    return {
        validate(model) {
            const issues = validateBaseModel(model);
            if (issues.length) return issues;
            const plugin = registry.get(model.kind);
            return plugin
                ? plugin.validate(model)
                : [{ path: 'kind', message: `No activity plugin registered for ${model.kind}.` }];
        },
        evaluate,
        mount(model, host, onEvaluation) {
            const plugin = pluginFor(model);
            const issues = plugin.validate(model);
            if (issues.length) throw new ActivityValidationError(model.id, issues);
            return plugin.render(model, host, async response => {
                const evaluation = evaluate(model, response);
                await onEvaluation(evaluation);
                return evaluation;
            });
        },
    };
}

class ActivityValidationError extends Error {
    constructor(readonly activityId: string, readonly issues: readonly ValidationIssue[]) {
        super(`Activity ${activityId} is invalid: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
        this.name = 'ActivityValidationError';
    }
}

function validateBaseModel(model: ActivityModel): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model || typeof model !== 'object') return [{ path: '', message: 'Activity model is required.' }];
    if (!text(model.id)) issues.push({ path: 'id', message: 'A stable id is required.' });
    if (!text(model.kind)) issues.push({ path: 'kind', message: 'A plugin kind is required.' });
    if (!text(model.responseKind)) issues.push({ path: 'responseKind', message: 'A response kind is required.' });
    if (!Array.isArray(model.conceptIds) || !model.conceptIds.length) {
        issues.push({ path: 'conceptIds', message: 'At least one Concept is required.' });
    }
    if (!text(model.prompt?.en) || !text(model.prompt?.ja)) {
        issues.push({ path: 'prompt', message: 'English and Japanese prompt text are required.' });
    }
    if (model.answerSupport) issues.push(...validateAnswerSupportContract(model.answerSupport).map(issue => ({
        path: `answerSupport${issue.path ? `.${issue.path}` : ''}`,
        message: issue.message,
    })));
    return issues;
}

export function validateAnswerSupportContract(value: unknown): readonly ValidationIssue[] {
    if (!value || typeof value !== 'object') return [{ path: '', message: 'An answer-support contract is required.' }];
    const contract = value as Partial<AnswerSupportContract>;
    const issues: ValidationIssue[] = [];
    if (contract.id !== 'academy-assessed-v1') issues.push({ path: 'id', message: 'Unknown answer-support contract.' });
    const hidden = contract.englishUiPreCommit;
    for (const field of ['assessedJapanese', 'transcripts', 'translations', 'definitions', 'exampleGlosses', 'modelAnswers'] as const) {
        if (hidden?.[field] !== 'hidden') issues.push({ path: `englishUiPreCommit.${field}`, message: `${field} must stay hidden before commitment.` });
    }
    if (contract.earnedHintPolicy !== 'explicit-after-attempt') issues.push({ path: 'earnedHintPolicy', message: 'Hints must be explicitly earned after an attempt.' });
    if (contract.preCommitChoiceStyle !== 'neutral') issues.push({ path: 'preCommitChoiceStyle', message: 'Pre-commit choices must use neutral styling.' });
    if (contract.evidenceRequires !== 'learner-commitment') issues.push({ path: 'evidenceRequires', message: 'Progress evidence requires learner commitment.' });
    if (contract.animatedReactions !== 'presentation-only') issues.push({ path: 'animatedReactions', message: 'Animated reactions are presentation only.' });
    return issues;
}

function normalizeGrade(result: GradeResult): GradeResult {
    if (result.outcome !== 'pass' && result.outcome !== 'lapse') throw new TypeError('Invalid grade outcome.');
    if (!Number.isFinite(result.score) || result.score < 0 || result.score > 1) {
        throw new TypeError('Grade score must be between 0 and 1.');
    }
    const feedback = result.feedback;
    if (!text(feedback?.explanation?.en) || !text(feedback?.explanation?.ja)) {
        throw new TypeError('Grade feedback needs an English and Japanese explanation.');
    }
    if (result.outcome === 'lapse'
        && (!text(feedback.repairPrompt?.en) || !text(feedback.repairPrompt?.ja)
            || !text(feedback.nearbyExample?.en) || !text(feedback.nearbyExample?.ja))) {
        throw new TypeError('A lapse must include a bilingual repair prompt and nearby example.');
    }
    return {
        ...result,
        errorTags: unique(result.errorTags),
        feedback: structuredClone(feedback),
    };
}

function normalizeReviewSeed(seed: ReviewSeed, model: ActivityModel): ReviewSeed {
    const conceptId = requireText(seed.conceptId, 'reviewSeed.conceptId');
    if (!model.conceptIds.includes(conceptId)) throw new TypeError(`Review seed uses unrelated Concept ${conceptId}.`);
    if (seed.reason !== 'new-learning' && seed.reason !== 'repair' && seed.reason !== 'delayed-review') {
        throw new TypeError('Invalid review seed reason.');
    }
    const dueAfterMs = seed.schedule?.dueAfterMs;
    if (dueAfterMs !== undefined && (!Number.isFinite(dueAfterMs) || dueAfterMs <= 0)) {
        throw new TypeError('Review seed dueAfterMs must be a positive duration.');
    }
    return {
        id: requireText(seed.id, 'reviewSeed.id'),
        conceptId,
        reason: seed.reason,
        ...(seed.sourceQuestionId ? { sourceQuestionId: requireText(seed.sourceQuestionId, 'sourceQuestionId') } : {}),
        ...(dueAfterMs !== undefined ? { schedule: { dueAfterMs } } : {}),
        content: {
            expression: requireText(seed.content.expression, 'reviewSeed.content.expression'),
            ...(seed.content.reading ? { reading: requireText(seed.content.reading, 'reviewSeed.content.reading') } : {}),
            meanings: unique(seed.content.meanings),
            ...(seed.content.sentence ? { sentence: requireText(seed.content.sentence, 'reviewSeed.content.sentence') } : {}),
        },
    };
}

function requireText(value: string, label: string): string {
    const normalized = text(value);
    if (!normalized) throw new TypeError(`${label} must be non-empty.`);
    return normalized;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values.map(value => requireText(value, 'id')))].sort();
}
