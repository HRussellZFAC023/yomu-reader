import { derivePaidInviteCode, hmacSha256Hex, randomToken, timingSafeEqual } from './crypto';
import type { Clock, Env } from './env';
import { clearHostCookie, hostCookie, HttpError, jsonResponse, readBoundedText, readCookie, readJsonBody, requireSameOriginMutation } from './http';
import { mintPaidInvite } from './invites';
import { CHECKOUT_RATE, clientSubject, enforceRateLimit } from './rate-limit';

export const STRIPE_API_VERSION = '2026-02-25.clover';
const CLAIM_COOKIE = '__Host-academy_claim';
const CHECKOUT_SESSIONS_URL = 'https://api.stripe.com/v1/checkout/sessions';
/** Suggested one-click donation amounts, in whole GBP. */
export const DONATION_PRESETS_GBP: readonly number[] = [5, 10, 20];
const MIN_DONATION_PENCE = 200;
const MAX_DONATION_PENCE = 50_000;
const CLAIM_TTL_MS = 24 * 60 * 60_000;
const MAX_WEBHOOK_BYTES = 128 * 1024;
const SIGNATURE_TOLERANCE_MS = 5 * 60_000;
const HANDLED_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
const PURCHASE_METADATA_KEY = 'yomu_academy_purchase';

type FetchLike = typeof fetch;

async function claimHash(env: Env, token: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `claim:${token}`);
}

/**
 * POST /academy/api/checkout — customer-initiated donation Checkout.
 * Validates a bounded GBP amount, creates a pending purchase bound to this
 * browser via an HttpOnly claim cookie, and returns only a validated hosted
 * Checkout URL. No publishable key is involved anywhere.
 */
export async function handleCreateCheckout(request: Request, env: Env, clock: Clock, fetcher: FetchLike = fetch): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), CHECKOUT_RATE, now);
    if (!env.STRIPE_SECRET_KEY) throw new HttpError(503, 'Donations are not configured.');
    if (env.ACADEMY_ORIGIN === 'https://yomureader.com' && /^(?:sk|rk)_test_/u.test(env.STRIPE_SECRET_KEY)) {
        throw new HttpError(503, 'Live donations are not configured.');
    }

    const body = await readJsonBody(request);
    const amountPence = readDonationPence(body);

    const purchaseId = crypto.randomUUID();
    const claimToken = randomToken(32);
    await env.ACADEMY_DB
        .prepare(
            'INSERT INTO purchases (id, claim_hash, amount_pence, status, created_at) '
            + "VALUES (?1, ?2, ?3, 'pending', ?4)",
        )
        .bind(purchaseId, await claimHash(env, claimToken), amountPence, now)
        .run();

    const form = new URLSearchParams({
        mode: 'payment',
        submit_type: 'donate',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'gbp',
        'line_items[0][price_data][unit_amount]': String(amountPence),
        'line_items[0][price_data][product_data][name]': 'Yomu Academy supporter donation',
        success_url: `${env.ACADEMY_ORIGIN}/academy/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.ACADEMY_ORIGIN}/academy/?checkout=cancelled`,
        [`metadata[${PURCHASE_METADATA_KEY}]`]: purchaseId,
        [`payment_intent_data[metadata][${PURCHASE_METADATA_KEY}]`]: purchaseId,
    });
    let response: Response;
    try {
        response = await fetcher(CHECKOUT_SESSIONS_URL, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
                'content-type': 'application/x-www-form-urlencoded',
                'stripe-version': STRIPE_API_VERSION,
                'idempotency-key': `academy-checkout-${purchaseId}`,
            },
            body: form.toString(),
        });
    } catch {
        throw new HttpError(502, 'Donation checkout could not be started.');
    }
    if (!response.ok) throw new HttpError(502, 'Donation checkout could not be started.');
    const payload = (await response.json()) as { id?: unknown; url?: unknown };
    const url = typeof payload.url === 'string' ? payload.url : '';
    if (!isSafeCheckoutUrl(url) || !isStripeSessionId(payload.id)) {
        throw new HttpError(502, 'Donation checkout returned an unexpected URL.');
    }
    const linked = await env.ACADEMY_DB
        .prepare('UPDATE purchases SET checkout_session_id = ?1 WHERE id = ?2 AND checkout_session_id IS NULL')
        .bind(payload.id, purchaseId)
        .run();
    if ((linked.meta.changes ?? 0) !== 1) {
        throw new HttpError(500, 'Donation checkout could not be linked.');
    }
    return jsonResponse({ url }, 200, {
        'set-cookie': hostCookie(CLAIM_COOKIE, claimToken, CLAIM_TTL_MS / 1000),
    });
}

/** Verify a raw-body Stripe-Signature header (t=…,v1=…) with timestamp tolerance. */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now: number): Promise<boolean> {
    if (!header || !secret) return false;
    const parts = header.split(',').map(part => part.trim());
    const timestamp = Number(parts.find(part => part.startsWith('t='))?.slice(2));
    const candidates = parts.filter(part => part.startsWith('v1=')).map(part => part.slice(3));
    if (!Number.isFinite(timestamp) || candidates.length === 0) return false;
    if (Math.abs(now - timestamp * 1000) > SIGNATURE_TOLERANCE_MS) return false;
    const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
    for (const candidate of candidates) {
        if (await timingSafeEqual(candidate, expected)) return true;
    }
    return false;
}

/**
 * POST /academy/api/stripe/webhook — fulfillment. Event-level idempotency via
 * INSERT OR IGNORE plus a conditional pending→paid UPDATE make concurrent
 * deliveries safe: exactly one delivery mints the invite.
 */
export async function handleStripeWebhook(request: Request, env: Env, clock: Clock): Promise<Response> {
    const rawBody = await readBoundedText(request, MAX_WEBHOOK_BYTES);
    const now = clock();
    if (!(await verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET, now))) {
        throw new HttpError(400, 'Invalid webhook signature.');
    }

    const event = parseEvent(rawBody);
    if (!event || !HANDLED_EVENTS.has(event.type)) return jsonResponse({ received: true });

    await env.ACADEMY_DB
        .prepare('INSERT OR IGNORE INTO webhook_events (event_id, received_at) VALUES (?1, ?2)')
        .bind(event.id, now)
        .run();

    const session = event.session;
    const purchaseId = session.metadata?.[PURCHASE_METADATA_KEY];
    if (
        typeof purchaseId !== 'string'
        || !isStripeSessionId(session.id)
        || session.payment_status !== 'paid'
        || session.currency !== 'gbp'
        || typeof session.amount_total !== 'number'
        || !Number.isSafeInteger(session.amount_total)
    ) {
        return jsonResponse({ received: true, ignored: true });
    }

    // Claim the purchase: only the first fulfilment flips pending→paid, and the
    // recorded amount must match what Stripe actually charged.
    const purchase = await env.ACADEMY_DB
        .prepare(
            "UPDATE purchases SET status = 'paid', fulfilled_at = COALESCE(fulfilled_at, ?1) "
            + "WHERE id = ?2 AND checkout_session_id = ?3 AND amount_pence = ?4 "
            + "AND status IN ('pending', 'paid') RETURNING id",
        )
        .bind(now, purchaseId, session.id, session.amount_total)
        .first<{ id: string }>();
    if (!purchase) return jsonResponse({ received: true, ignored: true });

    const inviteId = await mintPaidInvite(env, purchaseId, now);
    await env.ACADEMY_DB
        .prepare('UPDATE purchases SET invite_id = COALESCE(invite_id, ?1) WHERE id = ?2 AND status = \'paid\'')
        .bind(inviteId, purchaseId)
        .run();
    return jsonResponse({ received: true });
}

/**
 * GET /academy/api/claim?session_id=cs_… — the browser that started checkout
 * retrieves its paid invite code. Two independent proofs are required: the
 * HttpOnly claim cookie set at checkout AND the Checkout session id Stripe
 * appended to the success URL; both must point at the same purchase row.
 * The code is re-derived from the purchase id, never stored.
 */
export async function handleClaim(request: Request, env: Env, clock: Clock): Promise<Response> {
    const token = readCookie(request, CLAIM_COOKIE);
    if (!token) throw new HttpError(401, 'No pending donation claim.');
    const sessionId = new URL(request.url).searchParams.get('session_id');
    if (!isStripeSessionId(sessionId)) throw new HttpError(400, 'A Checkout session_id is required.');
    const purchase = await env.ACADEMY_DB
        .prepare('SELECT id, status, invite_id FROM purchases WHERE claim_hash = ?1 AND checkout_session_id = ?2 AND created_at > ?3')
        .bind(await claimHash(env, token), sessionId, clock() - CLAIM_TTL_MS)
        .first<{ id: string; status: string; invite_id: string | null }>();
    if (!purchase) throw new HttpError(404, 'No matching donation found.');
    if (purchase.status !== 'paid' || !purchase.invite_id) return jsonResponse({ status: 'pending' }, 202);

    const code = await derivePaidInviteCode(env.ACADEMY_INVITE_HMAC_KEY, purchase.id);
    return jsonResponse({ status: 'paid', code }, 200, { 'set-cookie': clearHostCookie(CLAIM_COOKIE) });
}

interface CheckoutSessionObject {
    readonly id?: unknown;
    readonly payment_status?: unknown;
    readonly currency?: unknown;
    readonly amount_total?: unknown;
    readonly metadata?: Record<string, unknown>;
}

function parseEvent(rawBody: string): { id: string; type: string; session: CheckoutSessionObject } | null {
    try {
        const parsed = JSON.parse(rawBody) as {
            id?: unknown;
            type?: unknown;
            data?: { object?: CheckoutSessionObject };
        };
        if (
            typeof parsed.id !== 'string' || !/^evt_[A-Za-z0-9_]{3,255}$/u.test(parsed.id)
            || typeof parsed.type !== 'string' || parsed.type.length > 255
            || !parsed.data?.object
        ) return null;
        return { id: parsed.id, type: parsed.type, session: parsed.data.object };
    } catch {
        return null;
    }
}

function isStripeSessionId(value: unknown): value is string {
    return typeof value === 'string' && /^cs_[A-Za-z0-9_]{8,255}$/u.test(value);
}

function isSafeCheckoutUrl(value: string): boolean {
    if (!value || value.length > 2048) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com';
    } catch {
        return false;
    }
}

/** Accept either a known preset or a bounded whole-pence custom GBP amount. */
function readDonationPence(body: Record<string, unknown>): number {
    if (body.preset !== undefined) {
        if (typeof body.preset !== 'number' || !DONATION_PRESETS_GBP.includes(body.preset)) {
            throw new HttpError(400, `preset must be one of: ${DONATION_PRESETS_GBP.join(', ')}.`);
        }
        return body.preset * 100;
    }
    const value = body.amountGbp;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new HttpError(400, 'amountGbp must be a number.');
    }
    const pence = Math.round(value * 100);
    if (Math.abs(pence - value * 100) > 1e-6 || pence < MIN_DONATION_PENCE || pence > MAX_DONATION_PENCE) {
        throw new HttpError(400, 'Donation must be between £2 and £500 in whole pence.');
    }
    return pence;
}
