// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import academyPaymentWorker from '../../workers/yomu-academy/src/payment-entrypoint';
import SupportWorker from '../../workers/yomu-support/src/index';
import { createSqliteAcademy, type SqliteAcademy } from './helpers/sqlite-academy-env';

describe('support donation to Academy access', () => {
    let academy: SqliteAcademy | undefined;

    afterEach(() => {
        vi.unstubAllGlobals();
        academy?.close();
    });

    it.each([
        { currency: 'gbp', amount: '5', amountMinor: 500 },
        { currency: 'usd', amount: '7', amountMinor: 700 },
        { currency: 'jpy', amount: '1000', amountMinor: 1000 },
    ] as const)('carries a native $currency checkout through a signed webhook into a refresh-safe claim', async ({
        currency,
        amount,
        amountMinor,
    }) => {
        academy = createSqliteAcademy();
        const academyEnv = { ...academy.env, PAYMENT_INGRESS_TOKEN: 'end-to-end-ingress-token' };
        const sessionId = `cs_live_e2e_${currency}`;
        let claimHash = '';
        vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const checkout = new URLSearchParams(String(init?.body ?? ''));
            claimHash = checkout.get('metadata[yomu_academy_claim_hash]') ?? '';
            expect(checkout.get('line_items[0][price_data][currency]')).toBe(currency);
            expect(checkout.get('line_items[0][price_data][unit_amount]')).toBe(String(amountMinor));
            return Response.json({
                id: sessionId,
                livemode: true,
                url: `https://checkout.stripe.com/c/pay/${sessionId}`,
            });
        }));
        const bridge = {
            fetch: (request: Request) => academyPaymentWorker.fetch(request, academyEnv, executionContext()),
        };
        const supportDb = supportDonationDb();
        const acceptedEmails: Array<{ to: string; subject: string; text: string }> = [];
        const supportEnv = {
            STRIPE_SECRET_KEY: 'sk_live_e2e',
            STRIPE_WEBHOOK_SECRET: 'whsec_e2e',
            SUPPORT_DB: supportDb,
            ACADEMY_PAYMENT_INGRESS: bridge,
            PAYMENT_INGRESS_TOKEN: 'end-to-end-ingress-token',
            ACADEMY_CODE_EMAIL: {
                async send(message: { to: string; subject: string; text: string }) {
                    acceptedEmails.push(message);
                },
            },
        };

        const checkout = await SupportWorker.fetch(
            new Request(`https://support.yomureader.com/donate?currency=${currency}&amount=${amount}`),
            supportEnv,
            executionContext(),
        );
        const claimToken = claimCookieToken(checkout);
        expect(claimHash).toMatch(/^[a-f0-9]{64}$/u);

        const timestamp = Math.floor(Date.now() / 1000);
        const event = JSON.stringify({
            id: `evt_support_e2e_${currency}`,
            type: 'checkout.session.completed',
            livemode: true,
            created: timestamp,
            data: {
                object: {
                    id: sessionId,
                    amount_total: amountMinor,
                    currency,
                    payment_status: 'paid',
                    customer_details: { email: 'donor@example.test' },
                    metadata: { yomu_service: 'support', yomu_academy_claim_hash: claimHash },
                },
            },
        });
        const webhook = await signedStripeWebhook(event, timestamp, 'whsec_e2e');
        expect((await SupportWorker.fetch(webhook.clone(), supportEnv, executionContext())).status).toBe(200);
        expect((await SupportWorker.fetch(webhook.clone(), supportEnv, executionContext())).status).toBe(200);

        expect(academy.db.rows<{ claim_hash: string }>('SELECT claim_hash FROM purchases')).toEqual([
            { claim_hash: claimHash },
        ]);
        expect(academy.db.rows<{ currency: string; amount_minor: number }>(
            'SELECT currency, amount_minor FROM payment_transactions',
        )).toEqual([{ currency, amount_minor: amountMinor }]);
        expect(academy.db.rows<{ state: string; expires_at: number | null }>(
            'SELECT state, expires_at FROM payment_entitlements',
        )).toEqual([{ state: 'active', expires_at: null }]);
        expect(academy.db.rows<{ status: string; attempt_count: number }>(
            'SELECT status, attempt_count FROM payment_code_deliveries',
        )).toEqual([{ status: 'email_accepted', attempt_count: 1 }]);
        expect(acceptedEmails).toHaveLength(1);
        expect(acceptedEmails[0]).toMatchObject({
            to: 'donor@example.test',
            subject: 'Your よむ Academy code / よむ Academy コード',
        });
        expect(acceptedEmails[0]!.text).toMatch(/\b[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}\b/u);

        const claimRequest = new Request(`https://support.yomureader.com/claim?session_id=${sessionId}`, {
            headers: { cookie: `__Host-yomu_support_claim=${claimToken}` },
        });
        const firstClaim = await SupportWorker.fetch(claimRequest.clone(), supportEnv, executionContext());
        const refreshedClaim = await SupportWorker.fetch(claimRequest.clone(), supportEnv, executionContext());
        expect(firstClaim.status).toBe(200);
        const firstCode = await firstClaim.text();
        expect(firstCode).toMatch(/Your よむ Academy code is: [A-Z0-9-]+\nEnter it within 30 days of payment\./u);
        expect(firstClaim.headers.get('set-cookie')).toBeNull();
        expect(await refreshedClaim.text()).toBe(firstCode);
    });
});

/**
 * A donation ledger that actually stores what it is given.
 *
 * This used to answer `null` to every read while reporting every write as a
 * success. `recordDonationEvent` verifies its own INSERT by reading the row back
 * (it refuses to hand a receipt it cannot observe), so against that stub it always
 * concluded `insert_not_observed`, returned false, and the webhook handler
 * returned 200 without ever forwarding the Academy claim -- which is why all three
 * currency cases saw an empty `purchases` table. Production is unaffected: the
 * columns exist via migration 0006.
 *
 * Idempotency mirrors the real schema: migration 0006 puts a UNIQUE index on
 * stripe_session_id, so a replayed webhook inserts nothing and still reads back
 * the original receipt.
 */
function supportDonationDb() {
    const rows: Array<Record<string, unknown>> = [];
    return {
        prepare(sql: string) {
            let values: unknown[] = [];
            const isInsert = /INSERT\s+OR\s+IGNORE\s+INTO\s+donation_events/i.test(sql);
            const isReadback = /FROM\s+donation_events/i.test(sql)
                && /stripe_session_id\s*=\s*\?\s*OR\s+id\s*=\s*\?/i.test(sql);
            return {
                bind(...bound: unknown[]) {
                    values = bound;
                    return this;
                },
                async first<T = unknown>(): Promise<T | null> {
                    if (!isReadback) return null;
                    const [sessionId, id] = values;
                    return (rows.find(row => row.stripe_session_id === sessionId || row.id === id) ?? null) as T | null;
                },
                async all() { return { results: [] }; },
                async run() {
                    if (isInsert) {
                        const [id, day, amountMinor, currency, eventType, stripeSessionId] = values;
                        const duplicate = rows.some(row =>
                            row.id === id || row.stripe_session_id === stripeSessionId);
                        if (!duplicate) {
                            rows.push({
                                id,
                                day,
                                amount_minor: amountMinor,
                                currency,
                                event_type: eventType,
                                stripe_session_id: stripeSessionId,
                            });
                        }
                    }
                    return { success: true, meta: { changes: 1 } };
                },
            };
        },
    };
}

function executionContext() {
    return { waitUntil: (_promise: Promise<unknown>) => undefined };
}

function claimCookieToken(response: Response): string {
    expect(response.status).toBe(303);
    const cookie = response.headers.get('set-cookie') ?? '';
    const token = /__Host-yomu_support_claim=([A-Za-z0-9_-]{43})/u.exec(cookie)?.[1] ?? '';
    expect(token).toHaveLength(43);
    return token;
}

async function signedStripeWebhook(payload: string, timestamp: number, secret: string): Promise<Request> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`));
    const hex = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
    return new Request('https://support.yomureader.com/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': `t=${timestamp},v1=${hex}` },
        body: payload,
    });
}
