// @vitest-environment node
import { hmacSha256Hex } from '../../workers/yomu-academy/src/crypto';
import { errorResponse } from '../../workers/yomu-academy/src/http';
import { handleClaim, handleCreateCheckout, handleStripeWebhook, verifyStripeSignature, STRIPE_API_VERSION } from '../../workers/yomu-academy/src/stripe';
import { handleCreateSession } from '../../workers/yomu-academy/src/sessions';
import type { Env } from '../../workers/yomu-academy/src/env';
import { createFakeAcademy, jsonRequest } from './helpers/fake-academy-env';

const now = 1_770_000_000_000;
const clock = (): number => now;

/** Handlers throw HttpError; the Worker router converts it. Mirror that here. */
async function call(promise: Promise<Response>): Promise<Response> {
    try {
        return await promise;
    } catch (error) {
        return errorResponse(error);
    }
}

function checkout(env: Env, body: unknown, fetcher: typeof fetch): Promise<Response> {
    return call(handleCreateCheckout(new Request(`${env.ACADEMY_ORIGIN}/academy/api/checkout`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            origin: env.ACADEMY_ORIGIN,
            'sec-fetch-site': 'same-origin',
            'cf-connecting-ip': '203.0.113.7',
        },
        body: JSON.stringify(body),
    }), env, clock, fetcher));
}

function webhook(env: Env, request: Request): Promise<Response> {
    return call(handleStripeWebhook(request, env, clock));
}

function claim(env: Env, cookie?: string, sessionId: string | null = 'cs_test_123'): Promise<Response> {
    const query = sessionId === null ? '' : `?session_id=${sessionId}`;
    return call(handleClaim(new Request(`https://yomureader.com/academy/api/claim${query}`, cookie ? { headers: { cookie } } : undefined), env, clock));
}

function stripeOk(options: { id?: string; livemode?: boolean; url?: string } = {}): typeof fetch {
    const id = options.id ?? 'cs_test_123';
    const url = options.url ?? `https://checkout.stripe.com/c/pay/${id}`;
    return vi.fn(async () => new Response(JSON.stringify({ id, livemode: options.livemode ?? false, url }), { status: 200 })) as unknown as typeof fetch;
}

async function signedWebhook(env: { STRIPE_WEBHOOK_SECRET: string }, event: unknown, atMs = now): Promise<Request> {
    const rawBody = JSON.stringify(event);
    const timestamp = Math.floor(atMs / 1000);
    const signature = await hmacSha256Hex(env.STRIPE_WEBHOOK_SECRET, `${timestamp}.${rawBody}`);
    return new Request('https://yomureader.com/academy/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
        body: rawBody,
    });
}

function paidEvent(purchaseId: string, overrides: Record<string, unknown> = {}, eventId = 'evt_test_1', livemode = false): { id: string; type: string; livemode: boolean; data: { object: Record<string, unknown> } } {
    return {
        id: eventId,
        type: 'checkout.session.completed',
        livemode,
        data: {
            object: {
                id: livemode ? 'cs_live_123' : 'cs_test_123',
                payment_status: 'paid',
                currency: 'gbp',
                amount_total: 500,
                metadata: { yomu_academy_purchase: purchaseId },
                ...overrides,
            },
        },
    };
}

describe('Academy Worker donation checkout', () => {
    it('creates hosted Checkout with donate semantics, pinned version, and idempotency', async () => {
        const academy = createFakeAcademy();
        const fetcher = stripeOk();
        const response = await checkout(academy.env, { amountGbp: 5 }, fetcher);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' });
        expect(response.headers.get('set-cookie')).toMatch(/^__Host-academy_claim=[A-Za-z0-9_-]+; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=\d+$/);

        const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit & { headers: Record<string, string>; body: string }];
        expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
        expect(init.headers['stripe-version']).toBe(STRIPE_API_VERSION);
        expect(init.headers['idempotency-key']).toMatch(/^academy-checkout-/);
        const form = new URLSearchParams(init.body);
        expect(form.get('submit_type')).toBe('donate');
        expect(form.get('mode')).toBe('payment');
        expect(form.get('line_items[0][price_data][currency]')).toBe('gbp');
        expect(form.get('line_items[0][price_data][unit_amount]')).toBe('500');
        expect(form.get('success_url')).toBe('https://yomureader.com/academy/?checkout=success&session_id={CHECKOUT_SESSION_ID}');
        expect(form.get('cancel_url')).toBe('https://yomureader.com/academy/?checkout=cancelled');
        expect(academy.db.purchases).toEqual([expect.objectContaining({ amount_pence: 500, status: 'pending', checkout_session_id: 'cs_test_123' })]);
    });

    it('rejects out-of-bounds or malformed amounts and non-Stripe URLs', async () => {
        const legacyPreset = createFakeAcademy();
        expect((await checkout(legacyPreset.env, { preset: 5 }, stripeOk())).status).toBe(400);
        expect(legacyPreset.db.purchases).toHaveLength(0);

        for (const amountGbp of [4.99, 501, -5, 5.001, 'five', null]) {
            const academy = createFakeAcademy();
            const response = await checkout(academy.env, { amountGbp }, stripeOk());
            expect(response.status, `amount ${String(amountGbp)}`).toBe(400);
            expect(academy.db.purchases).toHaveLength(0);
        }

        const academy = createFakeAcademy();
        const hijacked = await checkout(academy.env, { amountGbp: 5 }, stripeOk({ url: 'https://evil.example/checkout' }));
        expect(hijacked.status).toBe(502);
        expect(JSON.stringify(await hijacked.json())).not.toContain('evil.example');
    });

    it('accepts Stripe test mode at any configured origin and refuses live mode', async () => {
        const academy = createFakeAcademy({ STRIPE_WEBHOOK_SECRET: 'whsec_test_mode' });
        const response = await checkout(academy.env, { amountGbp: 5 }, stripeOk({
            id: 'cs_test_123', livemode: false,
        }));
        expect(response.status).toBe(200);
        const purchaseId = academy.db.purchases[0].id;
        const event = paidEvent(purchaseId, {}, 'evt_test_mode', false);
        expect((await webhook(academy.env, await signedWebhook(academy.env, event))).status).toBe(200);
        expect(academy.db.purchases[0].status).toBe('paid');

        const wrongWebhookMode = createFakeAcademy({ STRIPE_WEBHOOK_SECRET: 'whsec_test_mode' });
        await checkout(wrongWebhookMode.env, { amountGbp: 5 }, stripeOk({
            id: 'cs_test_123', livemode: false,
        }));
        const wrongModePurchase = wrongWebhookMode.db.purchases[0];
        const liveEvent = paidEvent(wrongModePurchase.id, { id: 'cs_test_123' }, 'evt_live_into_test', true);
        expect((await webhook(wrongWebhookMode.env, await signedWebhook(wrongWebhookMode.env, liveEvent))).status).toBe(200);
        expect(wrongModePurchase.status).toBe('pending');

        const liveKey = createFakeAcademy({ STRIPE_SECRET_KEY: 'sk_live_fake' });
        expect((await checkout(liveKey.env, { amountGbp: 5 }, stripeOk())).status).toBe(503);
        expect((await webhook(liveKey.env, await signedWebhook(liveKey.env, paidEvent('not-a-real-purchase')))).status).toBe(503);

        const liveSession = createFakeAcademy();
        expect((await checkout(liveSession.env, { amountGbp: 5 }, stripeOk({
            id: 'cs_live_123', livemode: true,
        }))).status).toBe(502);
    });
});

describe('Academy Worker Stripe webhook', () => {
    it('rejects missing, stale, and forged signatures', async () => {
        const academy = createFakeAcademy();
        const event = paidEvent('purchase-1');

        const unsigned = new Request('https://x.test/webhook', { method: 'POST', body: JSON.stringify(event) });
        expect((await webhook(academy.env, unsigned)).status).toBe(400);

        const stale = await signedWebhook(academy.env, event, now - 6 * 60_000);
        expect((await webhook(academy.env, stale)).status).toBe(400);

        const forged = await signedWebhook({ STRIPE_WEBHOOK_SECRET: 'whsec_wrong' }, event);
        expect((await webhook(academy.env, forged)).status).toBe(400);

        expect(await verifyStripeSignature('body', 't=abc,v1=zzz', 'whsec_test_fake', now)).toBe(false);
        expect(academy.db.invites).toHaveLength(0);
    });

    it('fulfils exactly once across duplicate deliveries and validates amount and status', async () => {
        const academy = createFakeAcademy();
        await checkout(academy.env, { amountGbp: 5 }, stripeOk());
        const purchaseId = academy.db.purchases[0].id;

        const first = await webhook(academy.env, await signedWebhook(academy.env, paidEvent(purchaseId)));
        expect(first.status).toBe(200);
        expect(academy.db.purchases[0].status).toBe('paid');
        expect(academy.db.invites).toHaveLength(1);
        expect(academy.db.invites[0]).toMatchObject({ kind: 'paid', uses_remaining: 1, purchase_id: purchaseId });

        // Same event id redelivered, then the async_payment variant with a new id:
        await webhook(academy.env, await signedWebhook(academy.env, paidEvent(purchaseId)));
        const asyncVariant = paidEvent(purchaseId, {}, 'evt_test_2');
        asyncVariant.type = 'checkout.session.async_payment_succeeded';
        await webhook(academy.env, await signedWebhook(academy.env, asyncVariant));
        expect(academy.db.invites).toHaveLength(1);

        // Wrong amount or unpaid status never fulfils.
        const academy2 = createFakeAcademy();
        await checkout(academy2.env, { amountGbp: 5 }, stripeOk());
        const purchase2 = academy2.db.purchases[0].id;
        await webhook(academy2.env, await signedWebhook(academy2.env, paidEvent(purchase2, { amount_total: 100 })));
        await webhook(academy2.env, await signedWebhook(academy2.env, paidEvent(purchase2, { payment_status: 'unpaid' }, 'evt_test_3')));
        expect(academy2.db.purchases[0].status).toBe('pending');
        expect(academy2.db.invites).toHaveLength(0);
    });

    it('recovers safely when a delivery crashed after the event was recorded', async () => {
        const academy = createFakeAcademy();
        await checkout(academy.env, { amountGbp: 5 }, stripeOk());
        const purchaseId = academy.db.purchases[0].id;

        // Simulate a first delivery that recorded the event id and died before
        // fulfilment: Stripe retries with the SAME event id and must still mint.
        academy.db.webhookEvents.add('evt_test_1');
        const retry = await webhook(academy.env, await signedWebhook(academy.env, paidEvent(purchaseId)));
        expect(retry.status).toBe(200);
        expect(academy.db.purchases[0].status).toBe('paid');
        expect(academy.db.invites).toHaveLength(1);
        const inviteId = academy.db.invites[0].id;
        const fulfilledAt = academy.db.purchases[0].fulfilled_at;

        // A further retry after full fulfilment changes nothing.
        await webhook(academy.env, await signedWebhook(academy.env, paidEvent(purchaseId)));
        expect(academy.db.invites).toHaveLength(1);
        expect(academy.db.invites[0].id).toBe(inviteId);
        expect(academy.db.purchases[0]).toMatchObject({ status: 'paid', fulfilled_at: fulfilledAt, invite_id: inviteId });
    });

    it('binds the claim to the initiating browser and never stores the plaintext paid code', async () => {
        const academy = createFakeAcademy();
        const checkoutResponse = await checkout(academy.env, { amountGbp: 10 }, stripeOk());
        const claimCookie = (checkoutResponse.headers.get('set-cookie') ?? '').split(';')[0];
        const purchaseId = academy.db.purchases[0].id;

        // Before payment: pending. Without the cookie: unauthorized. Foreign cookie: not found.
        expect((await claim(academy.env, claimCookie)).status).toBe(202);
        expect((await claim(academy.env)).status).toBe(401);
        expect((await claim(academy.env, '__Host-academy_claim=stolen-token')).status).toBe(404);
        // Both proofs are required: a missing or foreign Checkout session id fails.
        expect((await claim(academy.env, claimCookie, null)).status).toBe(400);
        expect((await claim(academy.env, claimCookie, 'not-a-session')).status).toBe(400);
        expect((await claim(academy.env, claimCookie, 'cs_live_other999')).status).toBe(400);
        expect((await claim(academy.env, claimCookie, 'cs_test_other999')).status).toBe(404);

        await webhook(academy.env, await signedWebhook(academy.env, paidEvent(purchaseId, { amount_total: 1000 })));
        const claimed = await claim(academy.env, claimCookie);
        expect(claimed.status).toBe(200);
        const { status, code } = await claimed.json();
        expect(status).toBe('paid');
        expect(code).toMatch(/^[A-Z0-9-]{4,64}$/);
        // Deterministic mint, nothing plaintext at rest.
        expect(JSON.stringify({ invites: academy.db.invites, purchases: academy.db.purchases })).not.toContain(code);

        // Claim and auth-session creation are retryable until Google redemption.
        const claimedAgain = await claim(academy.env, claimCookie);
        expect(await claimedAgain.json()).toEqual({ status: 'paid', code });
        const session = await call(handleCreateSession(jsonRequest('/academy/api/session', { code }), academy.env, clock));
        expect(session.status).toBe(200);
        const again = await call(handleCreateSession(jsonRequest('/academy/api/session', { code }), academy.env, clock));
        expect(again.status).toBe(200);
        expect(academy.db.invites[0].uses_remaining).toBe(1);
    });
});
