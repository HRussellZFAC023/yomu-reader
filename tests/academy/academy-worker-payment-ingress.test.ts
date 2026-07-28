// @vitest-environment node
import { errorResponse } from '../../workers/yomu-academy/src/http';
import { handleAdminPaymentCode, handlePaymentClaim, handlePaymentIngress } from '../../workers/yomu-academy/src/payment-ingress';
import { derivePaidInviteCode, sha256Hex } from '../../workers/yomu-academy/src/crypto';
import {
    handlePaymentDeliveryClaim,
    handlePaymentDeliveryComplete,
    handlePendingPaymentDeliveries,
} from '../../workers/yomu-academy/src/payment-delivery';
import { entitlementForAccount, requirePaidSessionEntitlement } from '../../workers/yomu-academy/src/entitlements';
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

function deliveryRequest(path: string, body: unknown, token = ingressToken): Request {
    return new Request(`https://academy.test/academy/internal/${path}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });
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
            expect(await health.json()).toEqual({
                ok: true,
                apiBase: 'https://yomureader.com/academy/api',
                artifactProof: 'cloudflare-version-modules-v1',
                workerVersionId: null,
            });
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
            const missingEntitlement = membership('membership-without-entitlement', 'membership.active', now);
            delete missingEntitlement.entitlement;
            expect((await ingress(env, missingEntitlement)).status).toBe(422);
            expect((await ingress(env, {
                ...membership('membership-001', 'membership.active', now),
                transaction: { reference: 'not-a-charge', currency: 'gbp', amountMinor: 500 },
            })).status).toBe(422);
            for (const transaction of [
                { reference: 'unsupported-currency', currency: 'chf', amountMinor: 500 },
                { reference: 'zero-amount', currency: 'usd', amountMinor: 0 },
                { reference: 'fractional-amount', currency: 'eur', amountMinor: 1.5 },
                { reference: 'unsafe-amount', currency: 'jpy', amountMinor: Number.MAX_SAFE_INTEGER + 1 },
            ]) {
                expect((await ingress(env, charge({ transaction }))).status).toBe(422);
            }
            expect(academy.db.rows('SELECT * FROM payment_events')).toHaveLength(0);
        } finally { academy.close(); }
    });

    it.each(['gbp', 'usd', 'eur', 'cad', 'aud', 'jpy'] as const)(
        'accepts a positive %s minor-unit grant without reapplying support checkout floors',
        async currency => {
            const academy = createSqliteAcademy();
            const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
            try {
                const accepted = await ingress(env, charge({
                    eventId: `event-${currency}`,
                    subject: { kind: 'payer', reference: `payer-${currency}` },
                    transaction: { reference: `transaction-${currency}`, currency, amountMinor: 1 },
                }));

                expect(accepted.status).toBe(200);
                expect(academy.db.rows<{ currency: string; amount_minor: number }>(
                    'SELECT currency, amount_minor FROM payment_transactions',
                )).toEqual([{ currency, amount_minor: 1 }]);
                expect(academy.db.rows<{ expires_at: number | null }>(
                    'SELECT expires_at FROM payment_entitlements',
                )).toEqual([{ expires_at: null }]);
                expect(academy.db.rows<{ amount_pence: number }>(
                    'SELECT amount_pence FROM purchases',
                )).toEqual([{ amount_pence: 1 }]);
            } finally { academy.close(); }
        },
    );

    it('atomically separates a Ko-fi event, actual charge, stable subject, and entitlement', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            const onePoundCharge = charge({
                transaction: {
                    reference: 'kofi-transaction-001',
                    currency: 'gbp',
                    amountMinor: 100,
                },
            });
            const accepted = await ingress(env, onePoundCharge);
            expect(accepted.status).toBe(200);
            const acceptedBody = await accepted.json() as {
                received: boolean;
                applied: boolean;
                deliveryStatus: string;
                deliveryId: string;
            };
            expect(acceptedBody).toMatchObject({
                received: true,
                applied: true,
                deliveryStatus: 'pending',
                deliveryId: expect.stringMatching(/^paydel_[a-f0-9]{40}$/u),
            });
            expect(acceptedBody).not.toHaveProperty('code');
            expect(academy.db.rows('SELECT * FROM payment_events')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM payment_transactions')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM payment_subjects')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM payment_entitlements')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM purchases')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM invites')).toHaveLength(1);
            expect(academy.db.rows<{ amount_pence: number }>('SELECT amount_pence FROM purchases')[0]?.amount_pence).toBe(100);
            expect(academy.db.rows<{ expires_at: number | null }>('SELECT expires_at FROM payment_entitlements')[0]?.expires_at).toBeNull();

            const duplicate = await ingress(env, onePoundCharge);
            expect(await duplicate.json()).toEqual({
                received: true,
                duplicate: true,
                deliveryStatus: 'pending',
                deliveryId: acceptedBody.deliveryId,
            });
            expect(academy.db.rows('SELECT * FROM payment_events')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM payment_transactions')).toHaveLength(1);

            // A distinct provider event for the same real transaction is
            // audited once without inventing a second charge.
            await ingress(env, { ...onePoundCharge, eventId: 'message-002', occurredAt: now + 10 });
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

    it('keeps verified Stripe ingress compatible with an exact historical purchase', async () => {
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

            const claimToken = 'a'.repeat(43);
            const supportDonation = {
                schemaVersion: 1,
                provider: 'stripe',
                eventId: 'evt-live-support-1',
                eventType: 'charge.settled',
                occurredAt: now + 1,
                subject: { kind: 'transaction', reference: 'cs-live-support-1' },
                transaction: {
                    reference: 'cs-live-support-1', sessionReference: 'cs-live-support-1',
                    claimHash: await sha256Hex(claimToken), currency: 'gbp', amountMinor: 100,
                },
            };
            expect((await ingress(env, supportDonation)).status).toBe(200);
            await expect((await ingress(env, supportDonation)).json()).resolves.toMatchObject({
                received: true,
                duplicate: true,
                deliveryStatus: 'pending',
                deliveryId: expect.stringMatching(/^paydel_[a-f0-9]{40}$/u),
            });
            expect(academy.db.rows('SELECT * FROM purchases')).toHaveLength(2);
            expect(academy.db.rows('SELECT * FROM payment_entitlements')).toHaveLength(2);
            expect(academy.db.rows<{ amount_pence: number }>(
                'SELECT amount_pence FROM purchases WHERE amount_pence = 100',
            )).toHaveLength(1);

            const claimRequest = (token: string) => new Request(
                'https://academy.test/academy/internal/payment-claim',
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', authorization: `Bearer ${ingressToken}` },
                    body: JSON.stringify({
                        provider: 'stripe', transactionReference: 'cs-live-support-1', claimToken: token,
                    }),
                },
            );
            expect((await call(handlePaymentClaim(claimRequest('b'.repeat(43)), env, now + 2))).status).toBe(401);
            const claimed = await call(handlePaymentClaim(claimRequest(claimToken), env, now + 2));
            expect(claimed.status).toBe(200);
            await expect(claimed.json()).resolves.toMatchObject({
                status: 'ready', code: expect.stringMatching(/^[A-Z0-9-]+$/u),
            });
        } finally { academy.close(); }
    });

    it('turns one verified Patreon paid-membership event into permanent access', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            expect((await ingress(env, membership('active-1', 'membership.active', now))).status).toBe(200);
            expect(academy.db.rows('SELECT * FROM payment_transactions')).toHaveLength(0);
            expect(academy.db.rows<{ state: string; expires_at: number | null }>(
                'SELECT state, expires_at FROM payment_entitlements',
            )[0]).toMatchObject({ state: 'active', expires_at: null });

            expect((await ingress(env, membership('revoke-1', 'membership.revoked', now + 3_000))).status).toBe(200);
            expect(academy.db.rows<{ state: string }>('SELECT state FROM payment_entitlements')[0]?.state).toBe('active');
            expect(academy.db.rows<{ disposition: string }>(
                "SELECT disposition FROM payment_events WHERE event_type = 'membership.revoked'",
            )[0]?.disposition).toBe('irrelevant');

            await env.ACADEMY_DB.prepare(
                'INSERT INTO accounts (id, public_id, google_sub_hash, discriminator, created_at, updated_at) '
                + "VALUES ('account-1', 'account-public-1', 'google-hash-1', '100001', ?1, ?1)",
            ).bind(now).run();
            await env.ACADEMY_DB.prepare(
                "UPDATE purchases SET redeemed_by_account_id = 'account-1', redeemed_at = ?1",
            ).bind(now + 1).run();
            const spent = await ingress(env, membership('active-1', 'membership.active', now), ingressToken, now + 2);
            expect(await spent.json()).toEqual({
                received: true,
                duplicate: true,
                deliveryStatus: 'redeemed',
            });
            const laterUpdate = await ingress(
                env,
                membership('active-2', 'membership.active', now + 5_000),
                ingressToken,
                now + 5_001,
            );
            expect(laterUpdate.status).toBe(200);
            expect(await laterUpdate.json()).toEqual({
                received: true,
                applied: true,
                deliveryStatus: 'redeemed',
            });
            const inviteId = academy.db.rows<{ invite_id: string }>('SELECT invite_id FROM purchases')[0]?.invite_id;
            const providerExpiry = now + 40 * 24 * 60 * 60_000;
            expect(await entitlementForAccount(env, 'account-1', providerExpiry + 1)).not.toBeNull();
            await expect(requirePaidSessionEntitlement(env, {
                public_id: 'existing-session', invite_id: inviteId ?? '', account_id: 'account-1',
                expires_at: providerExpiry + 10_000, offline_resume_until: providerExpiry + 20_000,
            }, 'account-1', providerExpiry + 1)).resolves.toBeUndefined();
        } finally { academy.close(); }
    });

    it('rejects an active Patreon envelope without a future entitlement boundary', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        const active = {
            ...membership('active-without-next-charge', 'membership.active', now),
            entitlement: { expiresAt: null, qualifyingAmountMinor: 500 },
        };
        try {
            const response = await ingress(env, active);
            expect(response.status).toBe(422);
            expect(academy.db.rows('SELECT * FROM payment_entitlements')).toHaveLength(0);
            expect(academy.db.rows('SELECT * FROM payment_code_deliveries')).toHaveLength(0);
        } finally { academy.close(); }
    });

    it('audits a revocation-only Patreon event without creating access', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            const revoked = membership('revoke-only', 'membership.revoked', now);
            expect((await ingress(env, revoked)).status).toBe(200);
            await expect((await ingress(env, revoked)).json())
                .resolves.toEqual({ received: true, duplicate: true, deliveryStatus: 'not_applicable' });
            expect(academy.db.rows<{ disposition: string }>('SELECT disposition FROM payment_events')[0]?.disposition)
                .toBe('irrelevant');
            expect(academy.db.rows('SELECT * FROM payment_entitlements')).toHaveLength(0);
            expect(academy.db.rows('SELECT * FROM purchases')).toHaveLength(0);
            expect(academy.db.rows('SELECT * FROM invites')).toHaveLength(0);
        } finally { academy.close(); }
    });

    it('keeps a delivered-code window bounded without expiring permanent Patreon access', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        const active = membership('bounded-code-membership', 'membership.active', now);
        try {
            const accepted = await ingress(env, active);
            expect(accepted.status).toBe(200);
            const acceptedBody = await accepted.json() as { deliveryId: string };
            const firstExpiry = academy.db.rows<{ expires_at: number | null }>(
                'SELECT expires_at FROM invites',
            )[0]?.expires_at;
            expect(firstExpiry).toBe(now + 30 * 24 * 60 * 60_000 + 1);
            expect(academy.db.rows<{ expires_at: number | null }>('SELECT expires_at FROM payment_entitlements')[0]?.expires_at)
                .toBeNull();

            const duplicate = await ingress(env, active, ingressToken, now + 2_000);
            expect(await duplicate.json()).toEqual({
                received: true,
                duplicate: true,
                deliveryStatus: 'pending',
                deliveryId: acceptedBody.deliveryId,
            });
            expect(academy.db.rows<{ expires_at: number | null }>('SELECT expires_at FROM invites')[0]?.expires_at)
                .toBe(firstExpiry);

            const shorterExpiry = now + 2 * 24 * 60 * 60_000;
            await env.ACADEMY_DB.prepare('UPDATE invites SET expires_at = ?1').bind(shorterExpiry).run();
            const shorter = await ingress(env, active, ingressToken, now + 3_000);
            expect(await shorter.json()).toEqual({
                received: true,
                duplicate: true,
                deliveryStatus: 'pending',
                deliveryId: acceptedBody.deliveryId,
            });
            expect(academy.db.rows<{ expires_at: number | null }>('SELECT expires_at FROM invites')[0]?.expires_at)
                .toBe(shorterExpiry);

            const expired = await ingress(env, active, ingressToken, shorterExpiry + 1);
            expect(await expired.json()).toEqual({
                received: true,
                duplicate: true,
                deliveryStatus: 'expired',
            });
        } finally { academy.close(); }
    });

    it('leases a deterministic code to one caller and records an idempotent accepted receipt', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            const accepted = await ingress(env, charge({ eventId: 'lease-race-event' }));
            const delivery = await accepted.json() as { deliveryId: string; code?: string };
            expect(delivery.code).toBeUndefined();
            expect((await call(handlePaymentDeliveryClaim(
                deliveryRequest('payment-delivery-claim', { deliveryId: delivery.deliveryId }, ''),
                env,
                now + 2,
            ))).status).toBe(401);

            const claim = () => call(handlePaymentDeliveryClaim(
                deliveryRequest('payment-delivery-claim', { deliveryId: delivery.deliveryId }),
                env,
                now + 2,
            ));
            const attempts = await Promise.all([claim(), claim()]);
            const results = await Promise.all(attempts.map(async response => ({
                httpStatus: response.status,
                body: await response.json() as Record<string, unknown>,
            })));
            expect(results.map(result => result.httpStatus).sort()).toEqual([200, 202]);
            const winner = results.find(result => result.httpStatus === 200)?.body as {
                status: string;
                code: string;
                leaseToken: string;
                deliveryId: string;
                attempt: number;
            };
            const loser = results.find(result => result.httpStatus === 202)?.body;
            expect(winner).toMatchObject({
                status: 'claimed',
                deliveryId: delivery.deliveryId,
                code: expect.stringMatching(/^[A-Z0-9-]{7,64}$/u),
                leaseToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
                attempt: 1,
            });
            expect(loser).toMatchObject({ status: 'leased', deliveryId: delivery.deliveryId });
            expect(loser).not.toHaveProperty('code');
            const purchaseId = academy.db.rows<{ id: string }>('SELECT id FROM purchases')[0]?.id ?? '';
            expect(winner.code).toBe(await derivePaidInviteCode(env.ACADEMY_INVITE_HMAC_KEY, purchaseId));

            const whileLeased = await ingress(env, charge({ eventId: 'lease-race-event' }), ingressToken, now + 3);
            expect(await whileLeased.json()).toMatchObject({
                received: true,
                duplicate: true,
                deliveryStatus: 'leased',
                deliveryId: delivery.deliveryId,
            });

            const completeRequest = deliveryRequest('payment-delivery-complete', {
                deliveryId: delivery.deliveryId,
                leaseToken: winner.leaseToken,
                outcome: 'email_accepted',
            });
            const completed = await call(handlePaymentDeliveryComplete(completeRequest, env, now + 4));
            expect(await completed.json()).toEqual({
                status: 'email_accepted',
                deliveryId: delivery.deliveryId,
            });
            const repeated = await call(handlePaymentDeliveryComplete(deliveryRequest('payment-delivery-complete', {
                deliveryId: delivery.deliveryId,
                leaseToken: winner.leaseToken,
                outcome: 'email_accepted',
            }), env, now + 5));
            expect(await repeated.json()).toEqual({
                status: 'email_accepted',
                deliveryId: delivery.deliveryId,
                duplicate: true,
            });
            const afterReceipt = await ingress(env, charge({ eventId: 'lease-race-event' }), ingressToken, now + 6);
            const afterReceiptBody = await afterReceipt.json() as Record<string, unknown>;
            expect(afterReceiptBody).toMatchObject({
                received: true,
                duplicate: true,
                deliveryStatus: 'email_accepted',
                deliveryId: delivery.deliveryId,
            });
            expect(afterReceiptBody).not.toHaveProperty('code');
            const acceptedClaim = await call(handlePaymentDeliveryClaim(
                deliveryRequest('payment-delivery-claim', { deliveryId: delivery.deliveryId }),
                env,
                now + 7,
            ));
            const acceptedClaimBody = await acceptedClaim.json() as Record<string, unknown>;
            expect(acceptedClaim.status).toBe(200);
            expect(acceptedClaimBody).toEqual({
                status: 'email_accepted',
                deliveryId: delivery.deliveryId,
            });
            expect(acceptedClaimBody).not.toHaveProperty('code');

            const stored = JSON.stringify(academy.db.rows('SELECT * FROM payment_code_deliveries'));
            expect(stored).not.toContain(winner.code);
            expect(stored).not.toContain('opaque-kofi-payer-001');
        } finally { academy.close(); }
    });

    it('retries a failed lease and keeps accepted manual handoff terminal', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            const accepted = await ingress(env, membership('manual-recovery-event', 'membership.active', now));
            const delivery = await accepted.json() as { deliveryId: string };
            const firstClaim = await call(handlePaymentDeliveryClaim(
                deliveryRequest('payment-delivery-claim', { deliveryId: delivery.deliveryId }),
                env,
                now + 2,
            ));
            const first = await firstClaim.json() as { leaseToken: string; code: string };

            const wrongReceipt = await call(handlePaymentDeliveryComplete(deliveryRequest('payment-delivery-complete', {
                deliveryId: delivery.deliveryId,
                leaseToken: 'x'.repeat(43),
                outcome: 'retry',
            }), env, now + 3));
            expect(wrongReceipt.status).toBe(409);

            const retryAt = now + 1_000;
            const retry = await call(handlePaymentDeliveryComplete(deliveryRequest('payment-delivery-complete', {
                deliveryId: delivery.deliveryId,
                leaseToken: first.leaseToken,
                outcome: 'retry',
                retryAt,
            }), env, now + 4));
            expect(await retry.json()).toEqual({ status: 'retry', deliveryId: delivery.deliveryId });
            expect((await call(handlePaymentDeliveryClaim(
                deliveryRequest('payment-delivery-claim', { deliveryId: delivery.deliveryId }),
                env,
                retryAt - 1,
            ))).status).toBe(202);

            const secondClaim = await call(handlePaymentDeliveryClaim(
                deliveryRequest('payment-delivery-claim', { deliveryId: delivery.deliveryId }),
                env,
                retryAt,
            ));
            const second = await secondClaim.json() as { leaseToken: string; code: string; attempt: number };
            expect(second).toMatchObject({ code: first.code, attempt: 2 });
            const manual = await call(handlePaymentDeliveryComplete(deliveryRequest('payment-delivery-complete', {
                deliveryId: delivery.deliveryId,
                leaseToken: second.leaseToken,
                outcome: 'manual_required',
            }), env, retryAt + 1));
            expect(await manual.json()).toEqual({
                status: 'manual_required',
                deliveryId: delivery.deliveryId,
            });

            const pending = await call(handlePendingPaymentDeliveries(
                deliveryRequest('payment-delivery-pending', {
                    staleBefore: retryAt + 2,
                    limit: 10,
                }),
                env,
                retryAt + 2,
            ));
            const pendingBody = await pending.json() as {
                count: number;
                deliveries: Array<Record<string, unknown>>;
            };
            expect(pendingBody).toMatchObject({
                count: 1,
                deliveries: [{
                    deliveryId: delivery.deliveryId,
                    provider: 'patreon',
                    status: 'manual_required',
                    attemptCount: 2,
                }],
            });
            expect(JSON.stringify(pendingBody)).not.toContain(first.code);
            expect(JSON.stringify(pendingBody)).not.toContain('patreon-member-001');

            const recoveredClaim = await call(handlePaymentDeliveryClaim(
                deliveryRequest('payment-delivery-claim', { staleBefore: retryAt + 2 }),
                env,
                retryAt + 3,
            ));
            expect(recoveredClaim.status).toBe(200);
            expect(await recoveredClaim.json()).toEqual({
                status: 'empty',
            });
            const namedManualClaim = await call(handlePaymentDeliveryClaim(
                deliveryRequest('payment-delivery-claim', { deliveryId: delivery.deliveryId }),
                env,
                retryAt + 4,
            ));
            expect(namedManualClaim.status).toBe(200);
            expect(await namedManualClaim.json()).toEqual({
                status: 'manual_required',
                deliveryId: delivery.deliveryId,
            });
            expect(academy.db.rows<{ attempt_count: number }>(
                'SELECT attempt_count FROM payment_code_deliveries',
            )).toEqual([{ attempt_count: 2 }]);
        } finally { academy.close(); }
    });

    it('lists an actionable row ahead of a full page of manual handoffs', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            for (let index = 0; index < 50; index += 1) {
                const accepted = await ingress(env, charge({
                    eventId: `manual-backlog-event-${index}`,
                    occurredAt: now + index,
                    subject: { kind: 'payer', reference: `manual-backlog-payer-${index}` },
                    transaction: {
                        reference: `manual-backlog-transaction-${index}`,
                        currency: 'gbp',
                        amountMinor: 500,
                    },
                }), ingressToken, now + 1_000 + index);
                const delivery = await accepted.json() as { deliveryId: string };
                const claim = await call(handlePaymentDeliveryClaim(
                    deliveryRequest('payment-delivery-claim', { deliveryId: delivery.deliveryId }),
                    env,
                    now + 2_000 + index,
                ));
                const lease = await claim.json() as { leaseToken: string };
                const completed = await call(handlePaymentDeliveryComplete(
                    deliveryRequest('payment-delivery-complete', {
                        deliveryId: delivery.deliveryId,
                        leaseToken: lease.leaseToken,
                        outcome: 'manual_required',
                    }),
                    env,
                    now + 3_000 + index,
                ));
                expect(completed.status).toBe(200);
            }

            const actionable = await ingress(env, charge({
                eventId: 'actionable-after-manual-backlog',
                occurredAt: now + 10_000,
                subject: { kind: 'payer', reference: 'actionable-after-manual-payer' },
                transaction: {
                    reference: 'actionable-after-manual-transaction',
                    currency: 'gbp',
                    amountMinor: 500,
                },
            }), ingressToken, now + 10_001);
            const actionableDelivery = await actionable.json() as { deliveryId: string };
            const pending = await call(handlePendingPaymentDeliveries(
                deliveryRequest('payment-delivery-pending', {
                    staleBefore: now + 20_000,
                    limit: 50,
                }),
                env,
                now + 20_000,
            ));
            const body = await pending.json() as {
                count: number;
                deliveries: Array<{ deliveryId: string; status: string }>;
            };

            expect(body.count).toBe(50);
            expect(body.deliveries[0]).toEqual({
                deliveryId: actionableDelivery.deliveryId,
                provider: 'kofi',
                status: 'pending',
                attemptCount: 0,
                availableAt: now + 10_001,
                updatedAt: now + 10_001,
            });
            expect(body.deliveries.filter(row => row.status === 'pending')).toHaveLength(1);
        } finally { academy.close(); }
    });

    it('never leases a delivery after its purchase was redeemed', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            const accepted = await ingress(env, charge({ eventId: 'redeemed-before-delivery' }));
            const delivery = await accepted.json() as { deliveryId: string };
            await env.ACADEMY_DB.prepare(
                'INSERT INTO accounts (id, public_id, google_sub_hash, discriminator, created_at, updated_at) '
                + "VALUES ('delivery-account', 'delivery-public', 'delivery-google-hash', '100002', ?1, ?1)",
            ).bind(now).run();
            await env.ACADEMY_DB.prepare(
                "UPDATE purchases SET redeemed_by_account_id = 'delivery-account', redeemed_at = ?1",
            ).bind(now + 2).run();

            const claim = await call(handlePaymentDeliveryClaim(
                deliveryRequest('payment-delivery-claim', { deliveryId: delivery.deliveryId }),
                env,
                now + 3,
            ));
            expect(claim.status).toBe(409);
            expect(await claim.json()).toEqual({ status: 'unavailable', deliveryId: delivery.deliveryId });
            expect(academy.db.rows<{ attempt_count: number }>(
                'SELECT attempt_count FROM payment_code_deliveries',
            )).toEqual([{ attempt_count: 0 }]);
        } finally { academy.close(); }
    });

    it('never returns delivery credentials for stale grant events', async () => {
        const academy = createSqliteAcademy();
        const env = { ...academy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        const current = charge({ eventId: 'current-event', occurredAt: now + 10_000 });
        const stale = charge({ eventId: 'stale-event', occurredAt: now });
        try {
            expect((await ingress(env, current)).status).toBe(200);
            const rejected = await ingress(env, stale);
            expect(rejected.status).toBe(202);
            expect(await rejected.json()).toEqual({ received: true, applied: false, reason: 'stale' });

            const duplicate = await ingress(env, stale);
            expect(await duplicate.json()).toEqual({
                received: true,
                duplicate: true,
                deliveryStatus: 'stale',
            });
        } finally { academy.close(); }
    });

    it('keeps revoked or structurally spent invites out of private delivery responses', async () => {
        const revokedAcademy = createSqliteAcademy();
        const revokedEnv = { ...revokedAcademy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        const active = charge({ eventId: 'revoked-invite-event' });
        try {
            expect((await ingress(revokedEnv, active)).status).toBe(200);
            await revokedEnv.ACADEMY_DB.prepare('UPDATE invites SET revoked_at = ?1').bind(now + 1).run();
            expect(await (await ingress(revokedEnv, active, ingressToken, now + 2)).json()).toEqual({
                received: true,
                duplicate: true,
                deliveryStatus: 'revoked',
            });
        } finally { revokedAcademy.close(); }

        const spentAcademy = createSqliteAcademy();
        const spentEnv = { ...spentAcademy.env, PAYMENT_INGRESS_TOKEN: ingressToken };
        try {
            expect((await ingress(spentEnv, active)).status).toBe(200);
            await spentEnv.ACADEMY_DB.prepare('UPDATE invites SET uses_remaining = 0').run();
            expect((await ingress(spentEnv, active, ingressToken, now + 2)).status).toBe(500);
        } finally { spentAcademy.close(); }
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
            await env.ACADEMY_DB.prepare('UPDATE invites SET expires_at = ?1').bind(now + 2).run();
            expect((await call(handleAdminPaymentCode(request(), env, now + 5))).status).toBe(401);
            const response = await call(handleAdminPaymentCode(
                request(`Bearer ${env.ACADEMY_ADMIN_TOKEN}`), env, now + 5,
            ));
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ provider: 'kofi', code: expect.stringMatching(/^[A-Z0-9-]+$/u) });
            expect(academy.db.rows<{ expires_at: number }>('SELECT expires_at FROM invites')).toEqual([
                { expires_at: now + 5 + 30 * 24 * 60 * 60_000 },
            ]);
            expect(academy.db.rows('SELECT * FROM accounts')).toHaveLength(0);
        } finally { academy.close(); }
    });
});
