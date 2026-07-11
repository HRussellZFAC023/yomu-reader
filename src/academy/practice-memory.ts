import type {
    AttemptOutcome,
    AttemptRecord,
    JsonValue,
    LearnerProgress,
    TaskProgress,
} from './progress';
import type { YomuSrsImportBatch, YomuSrsImportItem } from '../reader/srs/types';

export const ACADEMY_PRACTICE_MEMORY_SOURCE = 'academy-practice-memory:v1';
export const ACADEMY_PRACTICE_CONTEXT_KEY = 'academyPractice';

export type PracticeConfidence = 'low' | 'medium' | 'high';
export type PracticeQueueBucket = 'mistake' | 'due' | 'new';

export interface PracticeContentRef {
    readonly lessonId: string;
    readonly taskId: string;
    /** Convenience for content with one projection. */
    readonly srsItem?: YomuSrsImportItem;
    /** Allows one practice concept, such as a kanji, to project several cards. */
    readonly srsItems?: readonly YomuSrsImportItem[];
}

export interface PracticeQueueItem {
    readonly lessonId: string;
    readonly taskId: string;
    readonly bucket: PracticeQueueBucket;
    readonly dueAt: number | null;
    readonly lapseCount: number;
    readonly lastAttemptAt: number | null;
    readonly content: PracticeContentRef;
}

export interface PracticeQueues {
    readonly mistakes: readonly PracticeQueueItem[];
    readonly due: readonly PracticeQueueItem[];
    readonly new: readonly PracticeQueueItem[];
}

export interface PracticeQueueOptions {
    readonly mistakeLimit?: number;
    readonly dueLimit?: number;
    readonly newLimit?: number;
}

export interface PracticeOutcomeInput {
    readonly lessonId: string;
    readonly taskId: string;
    readonly outcome: AttemptOutcome;
    readonly confidence: PracticeConfidence;
    readonly response?: JsonValue;
    readonly context?: JsonValue;
}

/** Existing progress records are returned directly so scheduling has one canonical shape. */
export interface PracticeOutcomeResult {
    readonly confidence: PracticeConfidence;
    readonly attempt: AttemptRecord;
    readonly task: TaskProgress;
}

export interface AcademyPracticeMemory {
    queues(content: readonly PracticeContentRef[], options?: PracticeQueueOptions): Promise<PracticeQueues>;
    recordOutcome(input: PracticeOutcomeInput): Promise<PracticeOutcomeResult>;
    exportSrsImport(content: readonly PracticeContentRef[], importedAt: number): Promise<YomuSrsImportBatch>;
}

export interface AcademyPracticeMemoryOptions {
    readonly progress: LearnerProgress;
    readonly source?: string;
}

const CONFIDENCES: readonly PracticeConfidence[] = ['low', 'medium', 'high'];
const DEFAULT_MISTAKE_LIMIT = 20;
const DEFAULT_DUE_LIMIT = 20;
const DEFAULT_NEW_LIMIT = 10;
const ALL_REVIEWS_LIMIT = Number.MAX_SAFE_INTEGER;

export function createAcademyPracticeMemory(options: AcademyPracticeMemoryOptions): AcademyPracticeMemory {
    if (!options?.progress) throw new TypeError('progress is required.');
    const { progress } = options;
    const source = options.source ? requireText(options.source, 'source') : ACADEMY_PRACTICE_MEMORY_SOURCE;

    return {
        async queues(content, queueOptions = {}) {
            const catalog = normalizeContent(content);
            const limits = {
                mistake: requireLimit(queueOptions.mistakeLimit, 'mistakeLimit', DEFAULT_MISTAKE_LIMIT),
                due: requireLimit(queueOptions.dueLimit, 'dueLimit', DEFAULT_DUE_LIMIT),
                new: requireLimit(queueOptions.newLimit, 'newLimit', DEFAULT_NEW_LIMIT),
            };
            const snapshot = await progress.snapshot();
            // LearnerProgress owns the clock and scheduling policy; its queue is the authoritative due set.
            const scheduledDue = await progress.reviewQueue(ALL_REVIEWS_LIMIT);
            const dueKeys = new Set(scheduledDue.map(item => contentKey(item.lessonId, item.taskId)));
            const tasks = new Map(snapshot.tasks.map(task => [contentKey(task.lessonId, task.taskId), task]));
            const latestAttempts = latestAttemptsByTask(snapshot.attempts);
            const queues: Record<PracticeQueueBucket, PracticeQueueItem[]> = { mistake: [], due: [], new: [] };

            for (const contentRef of catalog) {
                const key = contentKey(contentRef.lessonId, contentRef.taskId);
                const task = tasks.get(key);
                if (!task) {
                    queues.new.push(queueItem(contentRef, 'new'));
                    continue;
                }
                if (latestAttempts.get(key)?.outcome === 'lapse') {
                    queues.mistake.push(queueItem(contentRef, 'mistake', task));
                    continue;
                }
                if (dueKeys.has(key)) queues.due.push(queueItem(contentRef, 'due', task));
            }

            queues.mistake.sort(compareQueueItems);
            queues.due.sort(compareQueueItems);
            queues.new.sort(compareQueueItems);
            return {
                mistakes: queues.mistake.slice(0, limits.mistake),
                due: queues.due.slice(0, limits.due),
                new: queues.new.slice(0, limits.new),
            };
        },

        async recordOutcome(input) {
            const lessonId = requireText(input.lessonId, 'lessonId');
            const taskId = requireText(input.taskId, 'taskId');
            const outcome = requireOutcome(input.outcome);
            const confidence = requireConfidence(input.confidence);
            const attempt = await progress.recordAttempt({
                lessonId,
                taskId,
                outcome,
                ...(input.response === undefined ? {} : { response: input.response }),
                context: practiceContext(input.context, confidence),
            });
            const task = (await progress.snapshot()).tasks.find(candidate =>
                candidate.lessonId === lessonId && candidate.taskId === taskId);
            if (!task) throw new Error('LearnerProgress did not persist the recorded attempt.');
            return { confidence, attempt, task };
        },

        async exportSrsImport(content, importedAt) {
            if (!Number.isFinite(importedAt)) throw new TypeError('importedAt must be a finite timestamp.');
            const catalog = normalizeContent(content);
            const snapshot = await progress.snapshot();
            const tasks = new Map(snapshot.tasks.map(task => [contentKey(task.lessonId, task.taskId), task]));
            const cards = new Map<string, YomuSrsImportItem>();

            for (const contentRef of catalog) {
                const task = tasks.get(contentKey(contentRef.lessonId, contentRef.taskId));
                const projections = [
                    ...(contentRef.srsItem ? [contentRef.srsItem] : []),
                    ...(contentRef.srsItems ?? []),
                ];
                for (const projection of projections) {
                    const candidate = academyLocalSrsItem(projection, contentRef, task);
                    const key = `${candidate.expression}\u0000${candidate.reading ?? ''}`;
                    const previous = cards.get(key);
                    cards.set(key, previous ? mergeSrsItems(previous, candidate) : candidate);
                }
            }
            return {
                source,
                importedAt: Math.trunc(importedAt),
                items: [...cards.values()].sort(compareSrsItems),
            };
        },
    };
}

function latestAttemptsByTask(attempts: readonly AttemptRecord[]): Map<string, AttemptRecord> {
    const latest = new Map<string, AttemptRecord>();
    for (const attempt of attempts) {
        const key = contentKey(attempt.lessonId, attempt.taskId);
        const previous = latest.get(key);
        if (!previous || attempt.at >= previous.at) latest.set(key, attempt);
    }
    return latest;
}

function queueItem(content: PracticeContentRef, bucket: PracticeQueueBucket, task?: TaskProgress): PracticeQueueItem {
    return {
        lessonId: content.lessonId,
        taskId: content.taskId,
        bucket,
        dueAt: task?.review.dueAt ?? null,
        lapseCount: task?.review.lapses ?? 0,
        lastAttemptAt: task?.lastAttemptAt ?? null,
        content,
    };
}

function compareQueueItems(left: PracticeQueueItem, right: PracticeQueueItem): number {
    return (left.dueAt ?? Number.POSITIVE_INFINITY) - (right.dueAt ?? Number.POSITIVE_INFINITY)
        || (left.lastAttemptAt ?? 0) - (right.lastAttemptAt ?? 0)
        || compareText(left.lessonId, right.lessonId)
        || compareText(left.taskId, right.taskId);
}

function practiceContext(context: JsonValue | undefined, confidence: PracticeConfidence): JsonValue {
    const metadata: JsonValue = { confidence };
    if (isJsonRecord(context)) return { ...context, [ACADEMY_PRACTICE_CONTEXT_KEY]: metadata };
    return {
        [ACADEMY_PRACTICE_CONTEXT_KEY]: metadata,
        ...(context === undefined ? {} : { context }),
    };
}

function academyLocalSrsItem(
    item: YomuSrsImportItem,
    content: PracticeContentRef,
    task: TaskProgress | undefined,
): YomuSrsImportItem {
    const sourceUrl = academyLocalUrl(item.sourceUrl);
    return {
        ...item,
        ...(item.meanings ? { meanings: uniqueStrings(item.meanings) } : {}),
        tags: uniqueStrings([
            ...(item.tags ?? []),
            'academy',
            `academy:lesson:${content.lessonId}`,
            `academy:task:${content.taskId}`,
        ]),
        ...(sourceUrl ? { sourceUrl } : { sourceUrl: undefined }),
        ...(task ? { dueAt: task.review.dueAt } : {}),
    };
}

function mergeSrsItems(left: YomuSrsImportItem, right: YomuSrsImportItem): YomuSrsImportItem {
    const dueDates = [left.dueAt, right.dueAt].filter((dueAt): dueAt is number => typeof dueAt === 'number');
    return {
        ...left,
        meanings: uniqueStrings([...(left.meanings ?? []), ...(right.meanings ?? [])]),
        tags: uniqueStrings([...(left.tags ?? []), ...(right.tags ?? [])]),
        ...(left.sentence || right.sentence ? { sentence: left.sentence ?? right.sentence } : {}),
        ...(left.sourceUrl || right.sourceUrl ? { sourceUrl: left.sourceUrl ?? right.sourceUrl } : {}),
        ...(dueDates.length ? { dueAt: Math.min(...dueDates) } : {}),
    };
}

function academyLocalUrl(sourceUrl: string | undefined): string | undefined {
    if (!sourceUrl) return undefined;
    return sourceUrl === '/academy' || sourceUrl.startsWith('/academy/') || sourceUrl.startsWith('/academy?')
        ? sourceUrl
        : undefined;
}

function normalizeContent(content: readonly PracticeContentRef[]): PracticeContentRef[] {
    if (!Array.isArray(content)) throw new TypeError('content must be an array of practice content references.');
    const byKey = new Map<string, PracticeContentRef>();
    for (const raw of content) {
        if (!raw || typeof raw !== 'object') throw new TypeError('content entries must be objects.');
        if (raw.srsItems !== undefined && !Array.isArray(raw.srsItems)) {
            throw new TypeError('content[].srsItems must be an array.');
        }
        const normalized: PracticeContentRef = {
            lessonId: requireText(raw.lessonId, 'content[].lessonId'),
            taskId: requireText(raw.taskId, 'content[].taskId'),
            ...(raw.srsItem ? { srsItem: cloneSrsItem(raw.srsItem) } : {}),
            ...(raw.srsItems ? { srsItems: raw.srsItems.map(cloneSrsItem) } : {}),
        };
        const key = contentKey(normalized.lessonId, normalized.taskId);
        const previous = byKey.get(key);
        byKey.set(key, previous ? mergeContent(previous, normalized) : normalized);
    }
    return [...byKey.values()].sort((left, right) =>
        compareText(left.lessonId, right.lessonId) || compareText(left.taskId, right.taskId));
}

function mergeContent(left: PracticeContentRef, right: PracticeContentRef): PracticeContentRef {
    return {
        lessonId: left.lessonId,
        taskId: left.taskId,
        ...(left.srsItem ?? right.srsItem ? { srsItem: left.srsItem ?? right.srsItem } : {}),
        srsItems: [
            ...(left.srsItems ?? []),
            ...(left.srsItem && right.srsItem ? [right.srsItem] : []),
            ...(right.srsItems ?? []),
        ],
    };
}

function cloneSrsItem(item: YomuSrsImportItem): YomuSrsImportItem {
    if (!item || typeof item !== 'object') throw new TypeError('SRS projections must be objects.');
    return {
        ...item,
        expression: requireText(item.expression, 'srsItem.expression'),
        ...(item.reading === undefined ? {} : { reading: requireText(item.reading, 'srsItem.reading') }),
        ...(item.meanings ? { meanings: uniqueStrings(item.meanings.map(meaning => requireText(meaning, 'srsItem.meanings[]'))) } : {}),
        ...(item.tags ? { tags: uniqueStrings(item.tags.map(tag => requireText(tag, 'srsItem.tags[]'))) } : {}),
    };
}

function compareSrsItems(left: YomuSrsImportItem, right: YomuSrsImportItem): number {
    return compareText(left.expression, right.expression) || compareText(left.reading ?? '', right.reading ?? '');
}

function contentKey(lessonId: string, taskId: string): string {
    return `${lessonId}\u0000${taskId}`;
}

function isJsonRecord(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireLimit(value: number | undefined, label: string, fallback: number): number {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
    return value;
}

function requireOutcome(value: AttemptOutcome): AttemptOutcome {
    if (value !== 'pass' && value !== 'lapse') throw new TypeError('outcome must be "pass" or "lapse".');
    return value;
}

function requireConfidence(value: PracticeConfidence): PracticeConfidence {
    if (!CONFIDENCES.includes(value)) throw new TypeError('confidence must be "low", "medium", or "high".');
    return value;
}

function requireText(value: unknown, label: string): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new TypeError(`${label} must be a non-empty string.`);
    return text;
}

function uniqueStrings(values: readonly string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
