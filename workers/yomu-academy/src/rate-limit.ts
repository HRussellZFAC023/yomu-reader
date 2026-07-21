import { hmacSha256Hex } from './crypto';
import type { Clock, Env } from './env';
import { HttpError } from './http';

export interface RateRule {
    readonly bucket: string;
    readonly limit: number;
    readonly windowMs: number;
}

export const SESSION_RATE: RateRule = { bucket: 'session', limit: 10, windowMs: 10 * 60_000 };
/**
 * Cookie rotation is client-automated (startup refresh and 401 recovery), so
 * it must never spend the human invite-exchange budget above: a learner whose
 * background resumes were refused still deserves their ten code attempts.
 */
export const RESUME_RATE: RateRule = { bucket: 'session-resume', limit: 30, windowMs: 10 * 60_000 };
/** Invalid resume traffic is bounded by IP without charging any valid session family. */
export const RESUME_ABUSE_RATE: RateRule = { bucket: 'session-resume-invalid', limit: 30, windowMs: 10 * 60_000 };
export const OAUTH_RATE: RateRule = { bucket: 'google-oauth', limit: 20, windowMs: 10 * 60_000 };
export const ENTITLEMENT_RATE: RateRule = { bucket: 'entitlement', limit: 10, windowMs: 10 * 60_000 };
export const PAIR_CREATE_RATE: RateRule = { bucket: 'pair-create', limit: 5, windowMs: 10 * 60_000 };
export const PAIR_CLAIM_RATE: RateRule = { bucket: 'pair-claim', limit: 10, windowMs: 10 * 60_000 };
export const SYNC_PUSH_RATE: RateRule = { bucket: 'sync-push', limit: 120, windowMs: 10 * 60_000 };
export const SYNC_PULL_RATE: RateRule = { bucket: 'sync-pull', limit: 300, windowMs: 10 * 60_000 };
export const EXPORT_RATE: RateRule = { bucket: 'privacy-export', limit: 120, windowMs: 60 * 60_000 };
export const LIFECYCLE_RATE: RateRule = { bucket: 'privacy-delete', limit: 5, windowMs: 60 * 60_000 };

/**
 * Derive a pseudonymous client subject. The raw IP is HMACed with a secret
 * key immediately and never stored or logged.
 */
export async function clientSubject(request: Request, env: Env): Promise<string> {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    return hmacSha256Hex(env.ACADEMY_RATE_HMAC_KEY, `subject:${ip}`);
}

/** Isolate authenticated budgets without storing the public session id. */
export async function authenticatedSessionSubject(env: Env, sessionPublicId: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_RATE_HMAC_KEY, `authenticated-session:${sessionPublicId}`);
}

/**
 * Fixed-window counter in D1. The upsert is a single atomic statement, so
 * concurrent requests cannot lose increments. Throws 429 when over budget.
 */
export async function enforceRateLimit(env: Env, subject: string, rule: RateRule, now: number): Promise<void> {
    const windowStart = now - (now % rule.windowMs);
    const row = await env.ACADEMY_DB
        .prepare(
            'INSERT INTO rate_limits (subject, bucket, window_start, count) VALUES (?1, ?2, ?3, 1) '
            + 'ON CONFLICT (subject, bucket, window_start) DO UPDATE SET count = count + 1 '
            + 'RETURNING count',
        )
        .bind(subject, rule.bucket, windowStart)
        .first<{ count: number }>();
    if (!row || row.count > rule.limit) {
        const retryAfter = Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000));
        throw new HttpError(429, 'Too many attempts. Try again later.', { 'retry-after': String(retryAfter) });
    }
}

/** Opportunistic cleanup of expired windows; callers run it via waitUntil. */
export async function pruneRateWindows(env: Env, clock: Clock): Promise<void> {
    const cutoff = clock() - 24 * 60 * 60_000;
    await env.ACADEMY_DB.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(cutoff).run();
}
