import type { QueuedNewTabGrade } from './grade-queue';

export const REVIEW_QUEUE_CHANNEL = 'yomu.review-queue.v2';

export function isReviewQueueRecord(value: unknown): value is QueuedNewTabGrade {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const shortString = (item: unknown): item is string => typeof item === 'string' && item.length > 0 && item.length <= 256;
    if (!shortString(record.id)
        || !(shortString(record.providerContext) || (record.target === 'yomu-local' && record.providerContext === ''))
        || typeof record.at !== 'number' || !Number.isFinite(record.at)
        || typeof record.attempts !== 'number' || !Number.isSafeInteger(record.attempts) || record.attempts < 0
        || (record.heldSince !== undefined && !Number.isFinite(record.heldSince))
        || typeof record.target !== 'string' || !['anki', 'jpdb-api', 'jiten-api', 'yomu-local'].includes(record.target)
        || typeof record.grade !== 'string' || !['nothing', 'something', 'hard', 'okay', 'easy', 'fail', 'pass'].includes(record.grade)
        || !record.card || typeof record.card !== 'object' || Array.isArray(record.card)) return false;
    const card = record.card as Record<string, unknown>;
    return typeof card.spelling === 'string' && typeof card.reading === 'string' && JSON.stringify(value).length <= 256_000;
}
