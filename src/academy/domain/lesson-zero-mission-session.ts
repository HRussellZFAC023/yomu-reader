import type { ActivityEvaluation } from './activity-runtime';

export interface LessonZeroMissionReceipt {
    readonly eventId: string;
    readonly at: number;
    readonly outcome: 'pass' | 'lapse';
    readonly feedback: ActivityEvaluation['result']['feedback'];
    readonly reviewEventIds: readonly string[];
    /** Content identity may already have a durable schedule from another activity. */
    readonly reviewKeys?: readonly { canonical: string; legacy: string }[];
    readonly committed: boolean;
}

/** Only textual task state. Media, captures, URLs and playback claims never belong here. */
export interface LessonZeroMissionSession {
    readonly schemaVersion: 1;
    readonly activityId: string;
    readonly revision: string;
    readonly writtenDraft: string;
    readonly particles: readonly [string, string];
    readonly checks: readonly string[];
    readonly spokeWithoutRecording: boolean;
    readonly selectedCardName: string;
    readonly editedKatakana: string;
    readonly nameEntryMode: 'ime' | 'katakana-choice' | 'usual-spelling';
    readonly repairing: boolean;
    readonly closeAction?: string;
    readonly receipt?: LessonZeroMissionReceipt;
    readonly unassessedFeedback?: ActivityEvaluation['result']['feedback'];
}

export type LessonZeroMissionProgress = Readonly<Record<string, LessonZeroMissionSession>>;

export function restoreLessonZeroMissionSession(activityId: string, revision: string, value?: unknown): LessonZeroMissionSession | undefined {
    if (!missionSessionIsValid(value) || value.activityId !== activityId || value.revision !== revision) return undefined;
    return structuredClone(value);
}

export function missionProgressIsValid(value: unknown): value is LessonZeroMissionProgress {
    return isRecord(value) && Object.entries(value).length <= 19
        && Object.entries(value).every(([id, state]) => missionSessionIsValid(state) && state.activityId === id);
}

function missionSessionIsValid(value: unknown): value is LessonZeroMissionSession {
    if (!isRecord(value) || !onlyKeys(value, ['schemaVersion', 'activityId', 'revision', 'writtenDraft', 'particles',
        'checks', 'spokeWithoutRecording', 'selectedCardName', 'editedKatakana', 'nameEntryMode', 'repairing', 'receipt', 'closeAction', 'unassessedFeedback'])) return false;
    return value.schemaVersion === 1 && text(value.activityId, 100) && value.activityId.startsWith('activity:lesson-zero-')
        && text(value.revision, 120) && text(value.writtenDraft, 180)
        && strings(value.particles, 2, 4) && value.particles.length === 2
        && strings(value.checks, 12, 80) && !value.checks.includes('listen-back-reflection')
        && typeof value.spokeWithoutRecording === 'boolean' && typeof value.repairing === 'boolean'
        && text(value.selectedCardName, 64) && text(value.editedKatakana, 64)
        && ['ime', 'katakana-choice', 'usual-spelling'].includes(String(value.nameEntryMode))
        && (value.closeAction === undefined || ['finish-or-break', 'more-class', 'another-lesson', 'explore', 'study', 'end-day'].includes(String(value.closeAction)))
        && (value.receipt === undefined || receiptIsValid(value.receipt))
        && (value.unassessedFeedback === undefined || value.receipt === undefined && feedbackIsValid(value.unassessedFeedback));
}

function receiptIsValid(value: unknown): value is LessonZeroMissionReceipt {
    if (!isRecord(value) || !onlyKeys(value, ['eventId', 'at', 'outcome', 'feedback', 'reviewEventIds', 'reviewKeys', 'committed'])) return false;
    return text(value.eventId, 180) && Number.isFinite(value.at) && (value.outcome === 'pass' || value.outcome === 'lapse')
        && typeof value.committed === 'boolean' && strings(value.reviewEventIds, 12, 180)
        && (value.reviewKeys === undefined || Array.isArray(value.reviewKeys) && value.reviewKeys.length <= 12
            && value.reviewKeys.length === value.reviewEventIds.length
            && value.reviewKeys.every(key => isRecord(key) && onlyKeys(key, ['canonical', 'legacy'])
                && text(key.canonical, 512) && text(key.legacy, 180)))
        && feedbackIsValid(value.feedback);
}

function feedbackIsValid(value: unknown): boolean {
    return isRecord(value) && onlyKeys(value, ['explanation', 'repairPrompt'])
        && localized(value.explanation) && (value.repairPrompt === undefined || localized(value.repairPrompt));
}

/** Heal an evidence-save/checkpoint-save gap without submitting the attempt again. */
export function reconcileMissionReceipt(state: LessonZeroMissionSession,
    events: readonly { eventId: string; kind: string; activityId?: string; outcome?: string; reviewItemId?: string; scheduledEventId?: string }[],
): LessonZeroMissionSession {
    const receipt = state.receipt;
    if (!receipt) return state;
    const attempt = events.find(event => event.eventId === receipt.eventId && event.kind === 'attempt-recorded');
    const neutralized = new Set(events.filter(event => event.kind === 'review-schedule-neutralized').map(event => event.scheduledEventId));
    const schedules = events.filter(event => event.kind === 'review-scheduled' && !neutralized.has(event.eventId));
    const reviewsSaved = receipt.reviewKeys
        ? receipt.reviewKeys.every(key => schedules.some(event => event.reviewItemId === key.canonical || event.reviewItemId === key.legacy))
        : receipt.reviewEventIds.every(id => schedules.some(event => event.eventId === id));
    if (attempt?.activityId === state.activityId && attempt.outcome === receipt.outcome
        && reviewsSaved) {
        return { ...state, receipt: { ...receipt, committed: true }, repairing: receipt.outcome === 'lapse' && state.repairing };
    }
    return { ...state, receipt: undefined, repairing: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
    return Object.keys(value).every(key => keys.includes(key));
}
function text(value: unknown, limit: number): value is string { return typeof value === 'string' && value.length <= limit; }
function strings(value: unknown, count: number, limit: number): value is string[] {
    return Array.isArray(value) && value.length <= count && value.every(item => text(item, limit));
}
function localized(value: unknown): boolean {
    return isRecord(value) && onlyKeys(value, ['en', 'ja']) && text(value.en, 2000) && text(value.ja, 2000);
}
