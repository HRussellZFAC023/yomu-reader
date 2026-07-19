export type AuthoredWeekProgress =
    | Readonly<{ phase: 'teaching'; exposureId: string }>
    | Readonly<{ phase: 'support' | 'question'; activityId: string }>
    | Readonly<{ phase: 'extension' | 'complete' }>;

export interface PersistedAuthoredWeekProgress {
    readonly sourceSha256: string;
    readonly position: AuthoredWeekProgress;
    readonly savedAt?: number;
}

export type AuthoredWeekProgressRecord = Readonly<Record<string, PersistedAuthoredWeekProgress>>;

export interface AuthoredWeekProgressScope {
    readonly exposureIds: readonly string[];
    readonly activityIds: readonly string[];
    readonly supportActivityIds: readonly string[];
    readonly hasExtension: boolean;
}

export function setAuthoredWeekProgress(
    current: AuthoredWeekProgressRecord | undefined,
    packageId: string,
    sourceSha256: string,
    position: AuthoredWeekProgress,
    savedAt = Date.now(),
): AuthoredWeekProgressRecord {
    return { ...current, [packageId]: { sourceSha256, position, savedAt } };
}

export function clearAuthoredWeekProgress(
    current: AuthoredWeekProgressRecord | undefined,
    packageId: string,
): AuthoredWeekProgressRecord | undefined {
    if (!current || !(packageId in current)) return current;
    const next = { ...current };
    delete next[packageId];
    return Object.keys(next).length ? next : undefined;
}

export function authoredWeekProgressRecordIsValid(value: unknown): value is AuthoredWeekProgressRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.entries(value).every(([packageId, cursor]) => Boolean(packageId.trim())
        && persistedAuthoredWeekProgressIsValid(cursor));
}

export function authoredWeekProgressFits(
    progress: AuthoredWeekProgress,
    scope: AuthoredWeekProgressScope,
): boolean {
    if (progress.phase === 'teaching') return scope.exposureIds.includes(progress.exposureId);
    if (progress.phase === 'support' || progress.phase === 'question') {
        return scope.activityIds.includes(progress.activityId);
    }
    return progress.phase !== 'extension' || scope.hasExtension;
}

export function authoredWeekProgressAfterActivity(
    activityId: string,
    scope: AuthoredWeekProgressScope,
): AuthoredWeekProgress {
    const index = scope.activityIds.indexOf(activityId);
    const nextActivityId = index >= 0 ? scope.activityIds[index + 1] : undefined;
    if (nextActivityId) {
        return scope.supportActivityIds.includes(nextActivityId)
            ? { phase: 'support', activityId: nextActivityId }
            : { phase: 'question', activityId: nextActivityId };
    }
    return scope.hasExtension ? { phase: 'extension' } : { phase: 'complete' };
}

function persistedAuthoredWeekProgressIsValid(value: unknown): value is PersistedAuthoredWeekProgress {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const cursor = value as Record<string, unknown>;
    return Object.keys(cursor).every(key => key === 'sourceSha256' || key === 'position' || key === 'savedAt')
        && typeof cursor.sourceSha256 === 'string'
        && /^[a-f0-9]{64}$/u.test(cursor.sourceSha256)
        && (cursor.savedAt === undefined
            || (typeof cursor.savedAt === 'number' && Number.isSafeInteger(cursor.savedAt) && cursor.savedAt >= 0))
        && authoredWeekProgressIsValid(cursor.position);
}

function authoredWeekProgressIsValid(value: unknown): value is AuthoredWeekProgress {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const progress = value as Record<string, unknown>;
    if (progress.phase === 'teaching') {
        return Object.keys(progress).every(key => key === 'phase' || key === 'exposureId')
            && typeof progress.exposureId === 'string'
            && Boolean(progress.exposureId);
    }
    if (progress.phase === 'support' || progress.phase === 'question') {
        return Object.keys(progress).every(key => key === 'phase' || key === 'activityId')
            && typeof progress.activityId === 'string'
            && Boolean(progress.activityId);
    }
    return (progress.phase === 'extension' || progress.phase === 'complete')
        && Object.keys(progress).length === 1;
}
