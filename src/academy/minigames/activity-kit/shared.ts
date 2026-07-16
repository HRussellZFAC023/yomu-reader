import type {
    ActivityEvaluation,
    ActivityHost,
    FeedbackBlock,
    GradeResult,
    ReviewSeed,
    ValidationIssue,
} from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import { appendProgressiveFeedback } from '../../ui/lesson-activity-support';

export interface ActivityFeedbackSet {
    readonly pass: FeedbackBlock;
    readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
}

export interface ReviewableTarget {
    readonly id: string;
    readonly conceptId: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sentence?: string;
}

export function gradeFromScore(
    score: number,
    passScore: number,
    errorTags: readonly string[],
    feedback: ActivityFeedbackSet,
): GradeResult {
    const passed = score >= passScore;
    return {
        outcome: passed ? 'pass' : 'lapse',
        score,
        errorTags: passed ? [] : errorTags,
        feedback: structuredClone(passed ? feedback.pass : feedback.lapse),
    };
}

export function reviewSeeds(
    targets: readonly ReviewableTarget[],
    result: GradeResult,
    sourceQuestionId?: string,
): readonly ReviewSeed[] {
    return targets.map(target => ({
        id: target.id,
        conceptId: target.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        ...(sourceQuestionId ? { sourceQuestionId } : {}),
        content: {
            expression: target.expression,
            ...(target.reading ? { reading: target.reading } : {}),
            meanings: [...target.meanings],
            ...(target.sentence ? { sentence: target.sentence } : {}),
        },
    }));
}

export function validateFeedback(value: ActivityFeedbackSet | undefined, issues: ValidationIssue[]): void {
    requireLocalized(value?.pass?.explanation, 'payload.feedback.pass.explanation', issues);
    requireLocalized(value?.lapse?.explanation, 'payload.feedback.lapse.explanation', issues);
    requireLocalized(value?.lapse?.repairPrompt, 'payload.feedback.lapse.repairPrompt', issues);
    requireLocalized(value?.lapse?.nearbyExample, 'payload.feedback.lapse.nearbyExample', issues);
}

export function validateReviewTargets(
    targets: readonly ReviewableTarget[] | undefined,
    conceptIds: readonly string[],
    issues: ValidationIssue[],
): void {
    if (!Array.isArray(targets) || targets.length === 0) {
        issues.push({ path: 'payload.reviewTargets', message: 'At least one review target is required.' });
        return;
    }
    const ids = new Set<string>();
    targets.forEach((target, index) => {
        const path = `payload.reviewTargets.${index}`;
        if (!text(target.id) || ids.has(target.id)) issues.push({ path: `${path}.id`, message: 'Review ids must be stable and unique.' });
        ids.add(target.id);
        if (!conceptIds.includes(target.conceptId)) issues.push({ path: `${path}.conceptId`, message: 'Review targets must use an activity Concept.' });
        if (!text(target.expression) || !target.meanings?.every(text) || !target.meanings.length) {
            issues.push({ path, message: 'A reviewable expression and meanings are required.' });
        }
    });
}

export function validatePassScore(value: number, issues: ValidationIssue[]): void {
    if (!Number.isFinite(value) || value <= 0 || value > 1) {
        issues.push({ path: 'payload.passScore', message: 'Pass score must be greater than zero and at most one.' });
    }
}

export function localized(value: LocalizedText, host: Pick<ActivityHost, 'language'>): string {
    return host.language === 'ja' ? value.ja : value.en;
}

export function localizedNodes(value: LocalizedText): readonly HTMLElement[] {
    return [japanese(value.ja), support(value.en)];
}

export function japanese(value: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'academy-japanese';
    span.lang = 'ja';
    span.dataset.yomuRuntimeSurface = 'academy-activity';
    span.dataset.yomuFuriganaMode = 'all';
    span.textContent = value;
    return span;
}

export function assessedJapanese(value: string): HTMLSpanElement {
    const span = japanese(value);
    span.dataset.jpdbReaderSurfaceIgnore = '';
    delete span.dataset.yomuRuntimeSurface;
    delete span.dataset.yomuFuriganaMode;
    return span;
}

export function support(value: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'academy-support';
    span.lang = 'en';
    span.dataset.jpdbReaderSurfaceIgnore = '';
    span.textContent = value;
    return span;
}

export function statusRegion(className: string): HTMLDivElement {
    const status = document.createElement('div');
    status.className = className;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    return status;
}

export function showEvaluation(
    root: HTMLElement,
    evaluation: ActivityEvaluation,
    host: ActivityHost,
): void {
    root.replaceChildren(localizedParagraph(evaluation.result.feedback.explanation));
    if (evaluation.result.outcome === 'lapse') {
        appendProgressiveFeedback(root, evaluation.result.feedback, {
            language: host.language ?? 'en',
            activityId: evaluation.attempt.activityId,
            host,
        });
    }
    host.announce(localized(evaluation.result.feedback.explanation, host));
}

export function localizedParagraph(value: LocalizedText): HTMLParagraphElement {
    const paragraph = document.createElement('p');
    paragraph.append(...localizedNodes(value));
    return paragraph;
}

export function setPending(root: HTMLElement, pending: boolean): void {
    root.setAttribute('aria-busy', String(pending));
    root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input, button, select, textarea',
    ).forEach(control => { control.disabled = pending; });
}

export function normalizeJapanese(value: string): string {
    return value.normalize('NFKC').replace(/[\s\u3000。、,.!?！？「」『』（）()]/gu, '').toLocaleLowerCase('ja');
}

export function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function requireLocalized(
    value: LocalizedText | undefined,
    path: string,
    issues: ValidationIssue[],
): void {
    if (!text(value?.en) || !text(value?.ja)) issues.push({ path, message: 'Bilingual authored copy is required.' });
}
