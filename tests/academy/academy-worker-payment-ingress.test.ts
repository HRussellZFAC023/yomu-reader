// @vitest-environment node
import { errorResponse } from '../../workers/yomu-academy/src/http';
import { handleAdminPaymentCode, handlePaymentIngress } from '../../workers/yomu-academy/src/payment-ingress';
import { entitlementForAccount, requirePaidSessionEntitlement } from '../../workers/yomu-academy/src/entitlements';
import { handleCreateSession } from '../../workers/yomu-academy/src/sessions';
import type { Env } from '../../workers/yomu-academy/src/env';
import { createSqliteAcademy } from './helpers/sqlite-academy-env';
import paymentEntrypoint from '../../workers/yomu-academy/src/payment-entrypoint';
import type { ExecutionContext } from '../../workers/yomu-academy/src/cf';

const now = 1_770_000_000_000;
const ingressToken = 'private-service-binding-token';

async function call(promise: Promise<Response>): Promise<Response> {
    try { return await promise; } catch (error) { return errorResponse(error); }
}

function ingress(env: Env, body: unknown, token = ingressToken, receivedAt = now + 1): Promise<Response> {
    return call(handlePaymentIngress(new Request('https://academy.test/academy/internal/payment-ingress', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    }), env, receivedAt));
}

function charge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        schemaVersion: 1,
        provider: 'kofi',
        eventId: 'message-001',
        eventType: 'charge.settled',
        occurredAt: now,
        subject: { kind: 'payer', reference: 'opaque-kofi-payer-001' },
        transaction: {
            reference: 'kofi-transaction-001',
            currency: 'gbp',
            amountMinor: 500,
        },
        ...overrides,
    };
}

function membership(eventId: string, eventType: 'membership.active' | 'membership.revoked', occurredAt: number): Record<string, unknown> {
    return {
        schemaVersion: 1,
        provider: 'patreon',
        eventId,
        eventType,
        occurredAt,
        subject: { kind: 'member', reference: 'patreon-member-001' },
        ...(eventType === 'membership.active' ? {
            entitlement: { expiresAt: occurredAt + 40 * 24 * 60 * 60_000, qualifyingAmountMinor: 500 },
        } : {}),
    };
}

function adminCodeRequest(env: Env, provider: 'kofi' | 'patreon', referenceType: 'subject' | 'transaction', reference: string): Request {
    return new Request('https://academy.test/academy/api/admin/payment-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.ACADEMY_ADMIN_TOKEN}` },
        body: JSON.stringify({ provider, referenceType, reference }),
    });
}

function sessionRequest(env: Env, code: string): Request {
    return new Request(`${env.ACADEMY_ORIGIN}/academy/api/session`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json', origin: env.ACADEMY_ORIGIN,
            'sec-fetch-site': 'same-origin', 'cf-connecting-ip': '203.0.113.20',
        },
        body: JSON.stringify({ code }),
    });
}

describe('Academy canonical payment ingress', () => {
    it('routes payment calls through the thin production entrypoint and delegates legacy routes', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
        try {
            const payment = await paymentEntrypoint.fetch(new Request(
                'https://academy.test/academy/internal/payment-ingress',
                { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(charge()) },
            ), env, ctx);
            expect(payment.status).toBe(401);
            const health = await paymentEntrypoint.fetch(new Request(
                'https://academy.test/academy/api/health',
            ), env, ctx);
            expect(health.status).toBe(200);
            expect(await health.json()).toEqual({ ok: true });
        } finally { academy.close(); }
    });

    it('fails closed and distinguishes malformed from unsupported contracts', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            expect((await ingress(env, charge(), '')).status).toBe(401);
            expect((await ingress({ ...env, PAYMENT_INGRESS_TOKEN: undefined }, charge())).status).toBe(401);
            expect((await ingress(env, { ...charge(), surprise: true })).status).toBe(400);
            expect((await ingress(env, { ...charge(), schemaVersion: 2 })).status).toBe(422);
            expect((await ingress(env, {
                ...membership('membership-null-expiry', 'membership.active', now),
                entitlement: { expiresAt: null, qualifyingAmountMinor: 500 },
            })).status).toBe(422);
            expect((await ingress(env, {
                ...membership('membership-001', 'membership.active', now),
                transaction: { reference: 'not-a-charge', currency: 'gbp', amountMinor: 500 },
            })).status).toBe(422);
            expect(academy.db.rows('SELECT * FROM payment_events')).toHaveLength(0);
        } finally { academy.close(); }
    });

    it('atomically separates a Ko-fi event, actual charge, stable subject, and entitlement', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            const accepted = await ingress(env, charge());
            expect(accepted.status).toBe(200);
            expect(await accepted.json()).toEqual({ received: true, applied: true });
            expect(academy.db.rows('SELECT * FROM payment_events')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM payment_transactions')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM payment_subjects')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM payment_entitlements')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM purchases')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM invites')).toHaveLength(1);

            const duplicate = await ingress(env, charge());
            expect(await duplicate.json()).toEqual({ received: true, duplicate: true });
            expect(academy.db.rows('SELECT * FROM payment_events')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM payment_transactions')).toHaveLength(1);

            // A distinct provider event for the same real transaction is
            // audited once without inventing a second charge.
            await ingress(env, charge({ eventId: 'message-002', occurredAt: now + 10 }));
            expect(academy.db.rows('SELECT * FROM payment_events')).toHaveLength(2);
            expect(academy.db.rows('SELECT * FROM payment_transactions')).toHaveLength(1);

            const hashes = academy.db.rows<{ provider_subject_hash: string }>('SELECT provider_subject_hash FROM payment_subjects');
            expect(hashes[0]?.provider_subject_hash).not.toContain('opaque-kofi-payer-001');
            expect(academy.db.rows<{ provider_transaction_hash: string }>('SELECT provider_transaction_hash FROM payment_transactions')[0]
                ?.provider_transaction_hash).not.toContain('kofi-transaction-001');
        } finally { academy.close(); }
    });

    it('rolls back a conflicting session/transaction mapping as an internal error', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            const withSession = charge({
                transaction: { reference: 'charge-a', sessionReference: 'checkout-a', currency: 'gbp', amountMinor: 500 },
            });
            expect((await ingress(env, withSession)).status).toBe(200);
            const conflict = charge({
                eventId: 'message-conflict',
                transaction: { reference: 'charge-b', sessionReference: 'checkout-a', currency: 'gbp', amountMinor: 500 },
            });
            expect((await ingress(env, conflict)).status).toBe(500);
            expect(academy.db.rows('SELECT * FROM payment_transactions')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM payment_events')).toHaveLength(1);
        } finally { academy.close(); }
    });

    it('keeps production Stripe ingress separate from test checkout and requires an existing exact purchase', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        const body = {
            schemaVersion: 1,
            provider: 'stripe',
            eventId: 'evt-live-forwarded-1',
            eventType: 'charge.settled',
            occurredAt: now,
            subject: { kind: 'academy_purchase', reference: 'academy-purchase-1' },
            purchaseId: 'academy-purchase-1',
            transaction: {
                reference: 'pi-live-1', sessionReference: 'cs-live-1', currency: 'gbp', amountMinor: 500,
            },
        };
        try {
            const missing = await ingress(env, body);
            expect(missing.status).toBe(202);
            expect(academy.db.rows('SELECT * FROM purchases')).toHaveLength(0);
            expect(academy.db.rows('SELECT * FROM payment_entitlements')).toHaveLength(0);

            await env.ACADEMY_DB.prepare(
                'INSERT INTO purchases (id, claim_hash, checkout_session_id, amount_pence, status, created_at) '
                + "VALUES (?1, ?2, ?3, 500, 'pending', ?4)",
            ).bind('academy-purchase-1', 'stripe-claim-hash', 'cs-live-1', now - 10).run();
            const accepted = await ingress(env, { ...body, eventId: 'evt-live-forwarded-2' });
            expect(accepted.status).toBe(200);
            expect(academy.db.rows<{ status: string }>('SELECT status FROM purchases')[0]?.status).toBe('paid');
            expect(academy.db.rows('SELECT * FROM payment_entitlements')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM invites')).toHaveLength(1);
        } finally { academy.close(); }
    });

    it('projects Patreon membership state without recording fictional cash transactions and rejects stale resurrection', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            expect((await ingress(env, membership('active-1', 'membership.active', now))).status).toBe(200);
            expect(academy.db.rows('SELECT * FROM payment_transactions')).toHaveLength(0);
            expect(academy.db.rows<{ state: string }>('SELECT state FROM payment_entitlements')[0]?.state).toBe('active');
            const codeResponse = await call(handleAdminPaymentCode(
                adminCodeRequest(env, 'patreon', 'subject', 'patreon-member-001'), env, now + 2,
            ));
            const { code } = await codeResponse.json() as { code: string };
            expect((await call(handleCreateSession(sessionRequest(env, code), env, () => now + 2))).status).toBe(200);

            expect((await ingress(env, membership('revoke-1', 'membership.revoked', now + 3_000))).status).toBe(200);
            expect(academy.db.rows<{ state: string }>('SELECT state FROM payment_entitlements')[0]?.state).toBe('revoked');
            expect((await call(handleCreateSession(sessionRequest(env, code), env, () => now + 3_001))).status).toBe(403);

            // Simulate an account which redeemed while the provider grant was
            // active: an already-issued session must lose authorization too.
            await env.ACADEMY_DB.prepare(
                'INSERT INTO accounts (id, public_id, google_sub_hash, discriminator, created_at, updated_at) '
                + "VALUES ('account-1', 'account-public-1', 'google-hash-1', '100001', ?1, ?1)",
            ).bind(now).run();
            await env.ACADEMY_DB.prepare(
                "UPDATE purchases SET redeemed_by_account_id = 'account-1', redeemed_at = ?1",
            ).bind(now + 1).run();
            expect(await entitlementForAccount(env, 'account-1', now + 3_001)).toBeNull();
            expect((await call(handleAdminPaymentCode(
                adminCodeRequest(env, 'patreon', 'subject', 'patreon-member-001'), env, now + 3_001,
            ))).status).toBe(409);
            const inviteId = academy.db.rows<{ invite_id: string }>('SELECT invite_id FROM purchases')[0]?.invite_id;
            await expect(requirePaidSessionEntitlement(env, {
                public_id: 'existing-session', invite_id: inviteId ?? '', account_id: 'account-1',
                expires_at: now + 10_000, offline_resume_until: now + 20_000,
            }, 'account-1', now + 3_001)).rejects.toMatchObject({ status: 403 });

            const late = await ingress(env, membership('late-active', 'membership.active', now + 2_000));
            expect(late.status).toBe(202);
            expect(await late.json()).toMatchObject({ applied: false, reason: 'stale' });
            expect(academy.db.rows<{ state: string }>('SELECT state FROM payment_entitlements')[0]?.state).toBe('revoked');
            expect(academy.db.rows('SELECT * FROM payment_transactions')).toHaveLength(0);

            expect((await ingress(env, membership('active-2', 'membership.active', now + 4_000))).status).toBe(200);
            expect(academy.db.rows<{ state: string }>('SELECT state FROM payment_entitlements')[0]?.state).toBe('active');
            const expiresAt = now + 4_000 + 40 * 24 * 60 * 60_000;
            expect(await entitlementForAccount(env, 'account-1', now + 4_001)).not.toBeNull();
            await expect(requirePaidSessionEntitlement(env, {
                public_id: 'existing-session', invite_id: inviteId ?? '', account_id: 'account-1',
                expires_at: expiresAt + 10_000, offline_resume_until: expiresAt + 20_000,
            }, 'account-1', now + 4_001)).resolves.toBeUndefined();
            expect(await entitlementForAccount(env, 'account-1', expiresAt + 1)).toBeNull();
            await expect(requirePaidSessionEntitlement(env, {
                public_id: 'existing-session', invite_id: inviteId ?? '', account_id: 'account-1',
                expires_at: expiresAt + 10_000, offline_resume_until: expiresAt + 20_000,
            }, 'account-1', expiresAt + 1)).rejects.toMatchObject({ status: 403 });
        } finally { academy.close(); }
    });

    it('makes revocation win deterministically when membership events share a timestamp', async () => {
        const activeFirst = createSqliteAcademy();
        const activeFirstEnv = { ...activeFirst.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            expect((await ingress(activeFirstEnv, membership('tie-active-first', 'membership.active', now))).status).toBe(200);
            expect((await ingress(activeFirstEnv, membership('tie-revoke-second', 'membership.revoked', now))).status).toBe(200);
            expect(activeFirst.db.rows<{ state: string }>('SELECT state FROM payment_entitlements')[0]?.state).toBe('revoked');
        } finally { activeFirst.close(); }

        const revokeFirst = createSqliteAcademy();
        const revokeFirstEnv = { ...revokeFirst.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            expect((await ingress(revokeFirstEnv, membership('tie-revoke-first', 'membership.revoked', now))).status).toBe(200);
            const active = await ingress(revokeFirstEnv, membership('tie-active-second', 'membership.active', now));
            expect(active.status).toBe(202);
            await expect(active.json()).resolves.toEqual({ received: true, applied: false, reason: 'stale' });
            expect(revokeFirst.db.rows<{ state: string }>('SELECT state FROM payment_entitlements')[0]?.state).toBe('revoked');
            expect(revokeFirst.db.rows('SELECT * FROM purchases')).toHaveLength(0);
            expect(revokeFirst.db.rows('SELECT * FROM invites')).toHaveLength(0);
        } finally { revokeFirst.close(); }
    });

    it('caps paid invites at provider expiry and never extends them on repeated admin lookup', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        const providerExpiry = now + 5 * 24 * 60 * 60_000;
        const active = {
            ...membership('short-membership', 'membership.active', now),
            entitlement: { expiresAt: providerExpiry, qualifyingAmountMinor: 500 },
        };
        try {
            expect((await ingress(env, active)).status).toBe(200);
            const before = academy.db.rows<{ expires_at: number | null }>('SELECT expires_at FROM invites')[0]?.expires_at;
            expect(before).toBe(providerExpiry);

            expect((await call(handleAdminPaymentCode(
                adminCodeRequest(env, 'patreon', 'subject', 'patreon-member-001'), env, now + 1_000,
            ))).status).toBe(200);
            expect((await call(handleAdminPaymentCode(
                adminCodeRequest(env, 'patreon', 'subject', 'patreon-member-001'), env, now + 2_000,
            ))).status).toBe(200);
            const after = academy.db.rows<{ expires_at: number | null }>('SELECT expires_at FROM invites')[0]?.expires_at;
            expect(after).toBe(providerExpiry);

            // An already shorter code remains shorter; lookup never restarts a
            // rolling 30-day window.
            const shorterExpiry = now + 2 * 24 * 60 * 60_000;
            await env.ACADEMY_DB.prepare('UPDATE invites SET expires_at = ?1').bind(shorterExpiry).run();
            expect((await call(handleAdminPaymentCode(
                adminCodeRequest(env, 'patreon', 'subject', 'patreon-member-001'), env, now + 3_000,
            ))).status).toBe(200);
            expect(academy.db.rows<{ expires_at: number | null }>('SELECT expires_at FROM invites')[0]?.expires_at)
                .toBe(shorterExpiry);
        } finally { academy.close(); }
    });

    it('keeps redeem-code retrieval admin-only and never treats provider identity as Academy identity', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        const request = (authorization?: string): Request => new Request('https://academy.test/academy/api/admin/payment-code', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(authorization ? { authorization } : {}),
            },
            body: JSON.stringify({ provider: 'kofi', referenceType: 'transaction', reference: 'kofi-transaction-001' }),
        });
        try {
            await ingress(env, charge());
            expect((await call(handleAdminPaymentCode(request(), env, now + 5))).status).toBe(401);
            const response = await call(handleAdminPaymentCode(
                request(`Bearer ${env.ACADEMY_ADMIN_TOKEN}`), env, now + 5,
            ));
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ provider: 'kofi', code: expect.stringMatching(/^[A-Z0-9-]+$/u) });
            expect(academy.db.rows('SELECT * FROM accounts')).toHaveLength(0);
        } finally { academy.close(); }
    });
});
