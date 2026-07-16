// @vitest-environment node
import { toBase64Url } from '../../workers/yomu-academy/src/crypto';
import { HttpError } from '../../workers/yomu-academy/src/http';
import { verifyGoogleIdToken } from '../../workers/yomu-academy/src/oauth';
import { normalizeDisplayName } from '../../workers/yomu-academy/src/accounts';
import { calculateStreaks, parseSnapshot, parseStudyDays } from '../../workers/yomu-academy/src/progress';

const now = Date.UTC(2026, 6, 12, 12);
const clientId = 'academy.apps.googleusercontent.com';
const nonce = 'n'.repeat(43);

async function signedGoogleToken(overrides: Record<string, unknown> = {}) {
    const pair = await crypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    Object.assign(jwk, { kid: 'google-test-key', alg: 'RS256', use: 'sig' });
    const encode = (value: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
    const header = encode({ alg: 'RS256', typ: 'JWT', kid: 'google-test-key' });
    const payload = encode({
        iss: 'https://accounts.google.com',
        aud: clientId,
        exp: Math.floor(now / 1000) + 3600,
        iat: Math.floor(now / 1000),
        nonce,
        sub: 'google-subject-never-stored-raw',
        email: 'private@example.invalid',
        name: 'Private Google Name',
        picture: 'https://example.invalid/private.jpg',
        ...overrides,
    });
    const signature = await crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5' }, pair.privateKey, new TextEncoder().encode(`${header}.${payload}`),
    );
    const token = `${header}.${payload}.${toBase64Url(new Uint8Array(signature))}`;
    const fetcher = async () => new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
    });
    return { token, fetcher };
}

describe('Google OIDC token verification', () => {
    it('verifies RS256 and discards all Google profile claims except the stable subject', async () => {
        const { token, fetcher } = await signedGoogleToken();
        const claims = await verifyGoogleIdToken(token, clientId, nonce, now, fetcher);
        expect(claims.sub).toBe('google-subject-never-stored-raw');
        expect(claims).not.toHaveProperty('email');
        expect(claims).not.toHaveProperty('name');
        expect(claims).not.toHaveProperty('picture');
    });

    it('fails closed on nonce, audience, expiry, and signature changes', async () => {
        const valid = await signedGoogleToken();
        await expect(verifyGoogleIdToken(valid.token, clientId, 'x'.repeat(43), now, valid.fetcher)).rejects.toMatchObject({ status: 401 });

        const wrongAudience = await signedGoogleToken({ aud: 'other.apps.googleusercontent.com' });
        await expect(verifyGoogleIdToken(wrongAudience.token, clientId, nonce, now, wrongAudience.fetcher)).rejects.toMatchObject({ status: 401 });

        const wrongAuthorizedParty = await signedGoogleToken({ azp: 'other.apps.googleusercontent.com' });
        await expect(verifyGoogleIdToken(wrongAuthorizedParty.token, clientId, nonce, now, wrongAuthorizedParty.fetcher)).rejects.toMatchObject({ status: 401 });

        const missingAuthorizedParty = await signedGoogleToken({ aud: [clientId, 'other.apps.googleusercontent.com'] });
        await expect(verifyGoogleIdToken(missingAuthorizedParty.token, clientId, nonce, now, missingAuthorizedParty.fetcher)).rejects.toMatchObject({ status: 401 });

        const expired = await signedGoogleToken({ exp: Math.floor(now / 1000) - 1 });
        await expect(verifyGoogleIdToken(expired.token, clientId, nonce, now, expired.fetcher)).rejects.toMatchObject({ status: 401 });

        const [head, body, signature] = valid.token.split('.');
        const tampered = `${head}.${body}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
        await expect(verifyGoogleIdToken(tampered, clientId, nonce, now, valid.fetcher)).rejects.toBeInstanceOf(HttpError);
    });
});

describe('privacy-safe account progress contracts', () => {
    it('normalizes concise Academy names without accepting control characters', () => {
        expect(normalizeDisplayName('  Aakash   Patel  ')).toBe('Aakash Patel');
        expect(() => normalizeDisplayName('Bad\u0000Name')).toThrow(/readable/);
        expect(() => normalizeDisplayName('x'.repeat(33))).toThrow(/readable/);
    });

    it('accepts only aggregate progress and rejects raw learning material', () => {
        const aggregate = {
            knownWordCount: 420,
            reviewsCompleted: 31,
            reviewsDue: 6,
            lessonsCompleted: 8,
            lessonsTotal: 12,
        };
        expect(parseSnapshot(aggregate)).toEqual(aggregate);
        expect(() => parseSnapshot({ ...aggregate, failedAnswers: ['秘密'] })).toThrow(/Only aggregate/);
        expect(() => parseSnapshot({ ...aggregate, lessonsCompleted: 13 })).toThrow(/cannot exceed/);
    });

    it('validates UTC study dates and calculates current/longest streaks', () => {
        const dates = parseStudyDays(['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-12'], now);
        expect(dates).toEqual(['2026-07-10', '2026-07-11', '2026-07-12']);
        expect(calculateStreaks(dates, now)).toEqual({ current: 3, longest: 3 });
        expect(calculateStreaks(['2026-07-01', '2026-07-02'], now)).toEqual({ current: 0, longest: 2 });
        expect(() => parseStudyDays(['2026-02-30'], now)).toThrow(/invalid/);
        expect(() => parseStudyDays(['2026-07-13'], now)).toThrow(/out-of-range/);
    });
});
