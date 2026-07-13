export interface AcademyStudyAccess {
    readonly accountId: string | null;
    readonly enrolled: boolean;
    readonly entitlement: 'none' | 'academy';
    readonly expiresAt: number | null;
    readonly refreshedAt: number;
}

export function academyStudyAccessMessage(access: AcademyStudyAccess, language: 'en' | 'ja' = 'en'): string | null {
    if (access.accountId && access.enrolled && access.entitlement === 'academy') return null;
    return language === 'ja'
        ? 'Academyの同期には登録済みアカウントが必要です。Studyはこのまま使えます。'
        : 'Sign in to sync Academy. Study still works on this device.';
}

export function canonicalStudyCardKey(expression: string, reading = ''): string {
    return canonicalStudyCardIdentity(expression, reading).key;
}

/** One semantic identity shared by local Study imports, Academy evidence, and reviews. */
export function canonicalStudyCardIdentity(expression: string, reading = ''): Readonly<{
    key: string;
    expression: string;
    reading: string;
}> {
    const normalizedExpression = expression.normalize('NFKC').trim();
    if (!normalizedExpression) throw new TypeError('Vocabulary expression is required.');
    const normalizedReading = (reading || normalizedExpression).normalize('NFKC').trim() || normalizedExpression;
    return {
        key: `${normalizedExpression}\u0000${normalizedReading}`,
        expression: normalizedExpression,
        reading: normalizedReading,
    };
}

export function safeStudyReturnUrl(origin: string, cardKey: string, context?: string): string {
    if (!cardKey || cardKey.length > 256) throw new TypeError('Study card key is invalid.');
    const url = new URL('/study/', origin);
    url.searchParams.set('return', 'academy');
    url.searchParams.set('card', cardKey);
    if (context && /^[a-z0-9:_-]{1,80}$/iu.test(context)) url.searchParams.set('context', context);
    return url.toString();
}

export const DEFAULT_STUDY_DURATION_MS = 15 * 60 * 1_000;

export interface CountdownSession {
    readonly durationSeconds: number;
    readonly startedAt: number;
}

export function createStudyCountdown(now: number, durationSeconds = DEFAULT_STUDY_DURATION_MS / 1_000): CountdownSession {
    if (!Number.isFinite(now)) throw new TypeError('Study start time is invalid.');
    const duration = Math.floor(durationSeconds);
    if (!Number.isSafeInteger(duration) || duration < 60 || duration > 3 * 60 * 60) {
        throw new TypeError('Study duration must be from 1 minute to 3 hours.');
    }
    return { durationSeconds: duration, startedAt: now };
}

export function countdownRemaining(session: CountdownSession, now: number): number {
    return Math.max(0, session.durationSeconds - Math.floor((now - session.startedAt) / 1_000));
}
