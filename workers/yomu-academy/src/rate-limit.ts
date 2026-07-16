import { hmacSha256Hex } from './crypto';
import type { Clock, Env } from './env';
import { HttpError } from './http';

export interface RateRule {
    readonly bucket: string;
    readonly limit: number;
    readonly windowMs: number;
}

export const SESSION_RATE: RateRule = { bucket: 'session', limit: 10, windowMs: 10 * 60_000 };
export const CHECKOUT_RATE: RateRule = { bucket: 'checkout', limit: 5, windowMs: 10 * 60_000 };

/**
 * Derive a pseudonymous client subject. The raw IP is HMACed with a secret
 * key immediately and never stored or logged.
 */
export async function clientSubject(request: Request, env: Env): Promise<string> {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    return hmacSha256Hex(env.ACADEMY_RATE_HMAC_KEY, `subject:${ip}`);
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
