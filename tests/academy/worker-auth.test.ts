// @vitest-environment node
import { describe, expect, it } from 'vitest';

import academyWorker, {
    archiveKeyFromEncodedPath,
    isSameOriginMutation,
    isSafeStripeCheckoutUrl,
    isTrustedCheckoutOrigin,
    matchesIfNoneMatch,
    normalizeInviteCode,
    parseArchiveRange,
    parseStripeSignature,
    timingSafeEqual,
    verifyStripeWebhookSignature,
} from '../../workers/yomu-academy/src/index';

describe('Academy Worker auth helpers', () => {
    it('normalizes human-entered invite codes without accepting arbitrary text', () => {
        expect(normalizeInviteCode(' yomU-abcd-2345-efgh ')).toBe('YOMUABCD2345EFGH');
        expect(normalizeInviteCode('ＰＡＩＤ－ABCD－2345－EFGH')).toBe('PAIDABCD2345EFGH');
        expect(normalizeInviteCode('short')).toBeNull();
        expect(normalizeInviteCode('yomu-code!')).toBeNull();
    });

    it('accepts normalized seven-character administrator-provisioned class codes', () => {
        expect(normalizeInviteCode(' abc-1234 ')).toBe('ABC1234');
        expect(normalizeInviteCode('ABC123')).toBeNull();
    });

    it('creates a normalized explicit class code once and stores only its HMAC', async () => {
        const { env, inviteHashes } = createAdminInviteEnv();

        const created = await academyWorker.fetch(adminInviteRequest(' abc-1234 '), env);
        expect(created.status).toBe(201);
        expect(await created.json()).toMatchObject({ invite: { code: 'ABC1234' } });
        expect(inviteHashes.size).toBe(1);
        expect([...inviteHashes][0]).toMatch(/^[a-f0-9]{64}$/);

        const conflict = await academyWorker.fetch(adminInviteRequest('ABC1234'), env);
        expect(conflict.status).toBe(409);
        await expect(conflict.json()).resolves.toEqual({
            error: { code: 'invite_code_conflict', message: 'That invite code is already in use.' },
        });
    });

    it('accepts only safe, normalized archive keys', () => {
        expect(archiveKeyFromEncodedPath('course-one/week%2001/lesson.pdf')).toBe('course-one/week 01/lesson.pdf');
        expect(archiveKeyFromEncodedPath('course-one/%2e%2e/private.pdf')).toBeNull();
        expect(archiveKeyFromEncodedPath('course-one\\private.pdf')).toBeNull();
        expect(archiveKeyFromEncodedPath('course-one//lesson.pdf')).toBeNull();
        expect(archiveKeyFromEncodedPath('%E0%A4%A')).toBeNull();
    });

    it('parses only satisfiable single byte ranges', () => {
        expect(parseArchiveRange(null, 100)).toEqual({ kind: 'none' });
        expect(parseArchiveRange('bytes=10-19', 100)).toEqual({
            end: 19,
            kind: 'valid',
            length: 10,
            offset: 10,
        });
        expect(parseArchiveRange('bytes=-8', 100)).toEqual({
            end: 99,
            kind: 'valid',
            length: 8,
            offset: 92,
        });
        expect(parseArchiveRange('bytes=99-', 100)).toEqual({
            end: 99,
            kind: 'valid',
            length: 1,
            offset: 99,
        });
        expect(parseArchiveRange('bytes=100-101', 100)).toEqual({ kind: 'invalid' });
        expect(parseArchiveRange('bytes=0-1,5-6', 100)).toEqual({ kind: 'invalid' });
    });

    it('uses weak comparison for If-None-Match while preserving a strict same-origin boundary', () => {
        expect(matchesIfNoneMatch('W/"archive-v1", "another"', '"archive-v1"')).toBe(true);
        expect(matchesIfNoneMatch('"archive-v2"', '"archive-v1"')).toBe(false);
        expect(isSameOriginMutation('https://academy.example.test', 'https://academy.example.test/academy/api/login')).toBe(true);
        expect(isSameOriginMutation('https://other.example.test', 'https://academy.example.test/academy/api/login')).toBe(false);
        expect(isSameOriginMutation(null, 'https://academy.example.test/academy/api/login')).toBe(false);
    });

    it('parses bounded Stripe v1 signatures and verifies raw-body HMACs', async () => {
        const timestamp = 1_740_000_000;
        const body = new TextEncoder().encode('{"id":"evt_test"}');
        const signature = await stripeSignature('whsec_test', timestamp, body);
        const header = `t=${timestamp},v1=${signature},v0=ignored`;

        expect(parseStripeSignature(header)).toEqual({ signatures: [signature], timestamp });
        await expect(verifyStripeWebhookSignature('whsec_test', header, body, timestamp * 1000 + 1_000)).resolves.toBe(true);
        await expect(verifyStripeWebhookSignature('whsec_test', header, body, timestamp * 1000 + 301_000)).resolves.toBe(false);
        await expect(verifyStripeWebhookSignature('whsec_test', `t=${timestamp},v1=${'0'.repeat(64)}`, body, timestamp * 1000)).resolves.toBe(false);
    });

    it('permits redirects only to Stripe Checkout over HTTPS', () => {
        expect(isSafeStripeCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123')).toBe(true);
        expect(isSafeStripeCheckoutUrl('http://checkout.stripe.com/c/pay/cs_test_123')).toBe(false);
        expect(isSafeStripeCheckoutUrl('https://checkout.stripe.com.attacker.example/c/pay/cs_test_123')).toBe(false);
        expect(isSafeStripeCheckoutUrl('https://attacker.example/?next=https://checkout.stripe.com')).toBe(false);
    });

    it('uses only the Academy origin for Stripe return URLs outside local development', () => {
        expect(isTrustedCheckoutOrigin('https://yomureader.com')).toBe(true);
        expect(isTrustedCheckoutOrigin('http://yomureader.com')).toBe(false);
        expect(isTrustedCheckoutOrigin('https://academy.attacker.example')).toBe(false);
        expect(isTrustedCheckoutOrigin('https://yomureader.com/academy')).toBe(false);
        expect(isTrustedCheckoutOrigin('http://127.0.0.1:8787')).toBe(true);
    });

    it('does not equate different fixed-size secrets', () => {
        expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
        expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
        expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
    });
});

async function stripeSignature(secret: string, timestamp: number, body: Uint8Array): Promise<string> {
    const prefix = new TextEncoder().encode(`${timestamp}.`);
    const signed = new Uint8Array(prefix.byteLength + body.byteLength);
    signed.set(prefix);
    signed.set(body, prefix.byteLength);
    const key = await crypto.subtle.importKey(
        'raw',
        copiedArrayBuffer(new TextEncoder().encode(secret)),
        { hash: 'SHA-256', name: 'HMAC' },
        false,
        ['sign'],
    );
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, copiedArrayBuffer(signed)));
    return Array.from(signature, (value) => value.toString(16).padStart(2, '0')).join('');
}

function copiedArrayBuffer(value: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return copy.buffer;
}

function adminInviteRequest(code: string): Request {
    return new Request('https://academy.example.test/academy/api/admin/invites', {
        body: JSON.stringify({ code, maxUses: 2 }),
        headers: {
            authorization: 'Bearer test-admin-token',
            'content-type': 'application/json',
        },
        method: 'POST',
    });
}

function createAdminInviteEnv(): { env: Parameters<typeof academyWorker.fetch>[1]; inviteHashes: Set<string> } {
    const inviteHashes = new Set<string>();
    const db = {
        async batch() {
            return [];
        },
        prepare(query: string) {
            let values: unknown[] = [];
            return {
                bind(...nextValues: unknown[]) {
                    values = nextValues;
                    return this;
                },
                async first<T>() {
                    return null as T | null;
                },
                async run<T>() {
                    if (!query.includes('INSERT OR IGNORE INTO academy_invites')) {
                        throw new Error(`Unexpected D1 query: ${query}`);
                    }
                    const inviteHash = values[1];
                    if (typeof inviteHash !== 'string') throw new Error('Expected an invite HMAC.');
                    const changes = inviteHashes.has(inviteHash) ? 0 : 1;
                    inviteHashes.add(inviteHash);
                    return { meta: { changes } } as { meta: { changes: number }; results?: T[] };
                },
            };
        },
    };

    return {
        env: {
            ADMIN_TOKEN: 'test-admin-token',
            ARCHIVE: {
                get: async () => null,
                head: async () => null,
            },
            ASSETS: { fetch: async () => new Response() },
            DB: db,
            INVITE_CODE_SECRET: 'test-invite-secret',
        },
        inviteHashes,
    };
}
