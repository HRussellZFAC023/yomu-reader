import { derivePaidInviteCode, hmacSha256Hex, randomToken, timingSafeEqual } from './crypto';
import type { Env } from './env';
import { HttpError, jsonResponse, readJsonBody } from './http';
import { inviteCodeHash, normalizeInviteCode } from './invites';

type Provider = 'stripe' | 'kofi' | 'patreon';
type DeliveryStatus = 'pending' | 'leased' | 'email_accepted' | 'manual_required' | 'retry';
type DeliveryOutcome = 'email_accepted' | 'manual_required' | 'retry';

const DELIVERY_ID_PATTERN = /^paydel_[a-f0-9]{40}$/u;
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const LEASE_MS = 5 * 60_000;
const MAX_RETRY_DELAY_MS = 7 * 24 * 60 * 60_000;

interface RedeemableProjectionRow {
    readonly provider: Provider;
    readonly entitlement_state: string;
    readonly effective_at: number;
    readonly entitlement_expires_at: number | null;
    readonly purchase_status: string;
    readonly redeemed_at: number | null;
    readonly invite_kind: string | null;
    readonly code_hash: string | null;
    readonly uses_remaining: number | null;
    readonly invite_expires_at: number | null;
    readonly revoked_at: number | null;
}

interface DeliveryRow {
    readonly id: string;
    readonly purchase_id: string;
    readonly provider: Provider;
    readonly status: DeliveryStatus;
    readonly attempt_count: number;
    readonly available_at: number;
    readonly lease_token_hash: string | null;
    readonly lease_expires_at: number | null;
    readonly updated_at: number;
}

export type ProjectedPaymentDelivery =
    | { readonly deliveryStatus: DeliveryStatus; readonly deliveryId: string }
    | { readonly deliveryStatus: 'expired' | 'redeemed' | 'revoked' | 'stale' };

/**
 * Create or resume the one delivery projection for a canonical paid purchase.
 * This validates the deterministic invite without returning or storing its code.
 */
export async function projectPaymentDelivery(
    env: Env,
    purchaseId: string,
    occurredAt: number,
    now: number,
): Promise<ProjectedPaymentDelivery> {
    const projection = await redeemableProjection(env, purchaseId);
    if (
        !projection
        || projection.purchase_status !== 'paid'
        || projection.invite_kind !== 'paid'
        || !projection.code_hash
    ) {
        throw new HttpError(500, 'Paid invite projection is unavailable.');
    }
    if (projection.effective_at > occurredAt) return { deliveryStatus: 'stale' };
    if (
        projection.entitlement_state !== 'active'
        || (projection.entitlement_expires_at !== null && projection.entitlement_expires_at <= now)
        || (projection.invite_expires_at !== null && projection.invite_expires_at <= now)
    ) return { deliveryStatus: 'expired' };
    if (projection.redeemed_at !== null) return { deliveryStatus: 'redeemed' };
    if (projection.revoked_at !== null) return { deliveryStatus: 'revoked' };
    if (projection.uses_remaining === null || projection.uses_remaining < 1) {
        throw new HttpError(500, 'Paid invite projection has no redeemable use.');
    }
    await assertDeterministicCode(env, purchaseId, projection.code_hash);

    const derivedId = `paydel_${(
        await hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `payment-delivery:${purchaseId}`)
    ).slice(0, 40)}`;
    await env.ACADEMY_DB.prepare(
        'INSERT OR IGNORE INTO payment_code_deliveries '
        + '(purchase_id, id, provider, status, attempt_count, available_at, created_at, updated_at) '
        + "VALUES (?1, ?2, ?3, 'pending', 0, ?4, ?4, ?4)",
    ).bind(purchaseId, derivedId, projection.provider, now).run();
    const delivery = await deliveryByPurchase(env, purchaseId);
    if (!delivery) throw new HttpError(500, 'Paid-code delivery projection is unavailable.');
    return {
        deliveryStatus: effectiveStatus(delivery, now),
        deliveryId: delivery.id,
    };
}

/**
 * Atomically leases either one named delivery or the oldest actionable row.
 * Only the statement winner receives the deterministic redeem code.
 */
export async function handlePaymentDeliveryClaim(request: Request, env: Env, now: number): Promise<Response> {
    await requirePaymentService(request, env);
    const body = await readJsonBody(request, 2048);
    if (Object.keys(body).some(key => !['deliveryId', 'staleBefore'].includes(key))) {
        throw new HttpError(400, 'Payment delivery claim contains unknown fields.');
    }
    const deliveryId = body.deliveryId === undefined ? null : readDeliveryId(body.deliveryId);
    const staleBefore = body.staleBefore === undefined ? now : readTimestamp(body.staleBefore, 'staleBefore');
    if (staleBefore > now) throw new HttpError(422, 'staleBefore cannot be in the future.');

    const leaseToken = randomToken(32);
    const leaseTokenHash = await leaseHash(env, leaseToken);
    const leaseExpiresAt = now + LEASE_MS;
    const claimed = await env.ACADEMY_DB.prepare(
        'UPDATE payment_code_deliveries SET '
        + "status = 'leased', attempt_count = attempt_count + 1, available_at = ?1, "
        + 'lease_token_hash = ?2, lease_expires_at = ?3, last_attempt_at = ?1, completed_at = NULL, updated_at = ?1 '
        + 'WHERE purchase_id = ('
        + 'SELECT pd.purchase_id FROM payment_code_deliveries pd '
        + 'JOIN payment_entitlements pe ON pe.purchase_id = pd.purchase_id '
        + 'JOIN purchases p ON p.id = pd.purchase_id '
        + 'JOIN invites i ON i.id = p.invite_id '
        + 'WHERE (?4 IS NULL OR pd.id = ?4) AND pd.updated_at <= ?5 '
        + "AND ((pd.status IN ('pending', 'retry') AND pd.available_at <= ?1) "
        + "OR (pd.status = 'leased' AND pd.lease_expires_at <= ?1)) "
        + "AND pe.state = 'active' AND (pe.expires_at IS NULL OR pe.expires_at > ?1) "
        + "AND p.status = 'paid' AND p.redeemed_at IS NULL "
        + "AND i.kind = 'paid' AND i.revoked_at IS NULL AND i.uses_remaining > 0 "
        + 'AND (i.expires_at IS NULL OR i.expires_at > ?1) '
        + 'ORDER BY pd.available_at, pd.created_at, pd.id LIMIT 1'
        + ') '
        + "AND ((status IN ('pending', 'retry') AND available_at <= ?1) "
        + "OR (status = 'leased' AND lease_expires_at <= ?1)) "
        + 'RETURNING id, purchase_id, provider, status, attempt_count, available_at, '
        + 'lease_token_hash, lease_expires_at, updated_at',
    ).bind(now, leaseTokenHash, leaseExpiresAt, deliveryId, staleBefore).first<DeliveryRow>();

    if (!claimed) return unclaimedResponse(env, deliveryId, now);
    const projection = await redeemableProjection(env, claimed.purchase_id);
    if (!projection?.code_hash) throw new HttpError(500, 'Paid invite projection is unavailable.');
    const code = normalizeInviteCode(await derivePaidInviteCode(env.ACADEMY_INVITE_HMAC_KEY, claimed.purchase_id));
    if (!(await timingSafeEqual(await inviteCodeHash(env, code), projection.code_hash))) {
        throw new HttpError(500, 'Paid invite projection does not match its deterministic code.');
    }
    return jsonResponse({
        status: 'claimed',
        deliveryId: claimed.id,
        leaseToken,
        leaseExpiresAt,
        attempt: claimed.attempt_count,
        code,
    });
}

/** Record the provider-channel outcome for the current lease. */
export async function handlePaymentDeliveryComplete(request: Request, env: Env, now: number): Promise<Response> {
    await requirePaymentService(request, env);
    const body = await readJsonBody(request, 2048);
    if (Object.keys(body).some(key => !['deliveryId', 'leaseToken', 'outcome', 'retryAt'].includes(key))) {
        throw new HttpError(400, 'Payment delivery completion contains unknown fields.');
    }
    const deliveryId = readDeliveryId(body.deliveryId);
    const leaseToken = readLeaseToken(body.leaseToken);
    const outcome = readOutcome(body.outcome);
    const retryAt = readRetryAt(body.retryAt, outcome, now);
    const tokenHash = await leaseHash(env, leaseToken);
    const completedAt = outcome === 'retry' ? null : now;
    const retainedTokenHash = outcome === 'retry' ? null : tokenHash;
    const updated = await env.ACADEMY_DB.prepare(
        'UPDATE payment_code_deliveries SET status = ?1, available_at = ?2, '
        + 'lease_token_hash = ?3, lease_expires_at = NULL, completed_at = ?4, updated_at = ?5 '
        + "WHERE id = ?6 AND status = 'leased' AND lease_token_hash = ?7 "
        + 'RETURNING id, purchase_id, provider, status, attempt_count, available_at, '
        + 'lease_token_hash, lease_expires_at, updated_at',
    ).bind(
        outcome,
        retryAt,
        retainedTokenHash,
        completedAt,
        now,
        deliveryId,
        tokenHash,
    ).first<DeliveryRow>();
    if (updated) return jsonResponse({ status: updated.status, deliveryId: updated.id });

    const existing = await deliveryById(env, deliveryId);
    if (
        existing
        && existing.status === outcome
        && existing.lease_token_hash
        && await timingSafeEqual(existing.lease_token_hash, tokenHash)
    ) {
        return jsonResponse({ status: existing.status, deliveryId: existing.id, duplicate: true });
    }
    throw new HttpError(409, 'Payment delivery lease is no longer current.');
}

/** Return only stale, PII-free delivery metadata for reconciliation alerts. */
export async function handlePendingPaymentDeliveries(request: Request, env: Env, now: number): Promise<Response> {
    await requirePaymentService(request, env);
    const body = await readJsonBody(request, 2048);
    if (Object.keys(body).some(key => !['staleBefore', 'limit'].includes(key))) {
        throw new HttpError(400, 'Pending delivery query contains unknown fields.');
    }
    const staleBefore = readTimestamp(body.staleBefore, 'staleBefore');
    if (staleBefore > now) throw new HttpError(422, 'staleBefore cannot be in the future.');
    const limit = body.limit === undefined ? 50 : readLimit(body.limit);
    const result = await env.ACADEMY_DB.prepare(
        'SELECT pd.id, pd.provider, pd.status, pd.attempt_count, pd.available_at, '
        + 'pd.lease_expires_at, pd.updated_at '
        + 'FROM payment_code_deliveries pd '
        + 'JOIN purchases p ON p.id = pd.purchase_id '
        + 'JOIN payment_entitlements pe ON pe.purchase_id = pd.purchase_id '
        + 'JOIN invites i ON i.id = p.invite_id '
        + "WHERE (pd.status IN ('pending', 'retry', 'manual_required') "
        + "OR (pd.status = 'leased' AND pd.lease_expires_at <= ?1)) "
        + "AND pe.state = 'active' AND (pe.expires_at IS NULL OR pe.expires_at > ?1) "
        + "AND p.status = 'paid' AND p.redeemed_at IS NULL "
        + "AND i.kind = 'paid' AND i.revoked_at IS NULL AND i.uses_remaining > 0 "
        + 'AND (i.expires_at IS NULL OR i.expires_at > ?1) '
        + 'AND pd.updated_at <= ?2 '
        + "ORDER BY CASE WHEN pd.status = 'manual_required' THEN 1 ELSE 0 END, "
        + 'pd.updated_at, pd.id LIMIT ?3',
    ).bind(now, staleBefore, limit).all<{
        id: string;
        provider: Provider;
        status: DeliveryStatus;
        attempt_count: number;
        available_at: number;
        lease_expires_at: number | null;
        updated_at: number;
    }>();
    return jsonResponse({
        staleBefore,
        count: result.results.length,
        deliveries: result.results.map(row => ({
            deliveryId: row.id,
            provider: row.provider,
            status: row.status === 'leased' ? 'retry' : row.status,
            attemptCount: row.attempt_count,
            availableAt: row.available_at,
            updatedAt: row.updated_at,
            ...(row.lease_expires_at === null ? {} : { leaseExpiresAt: row.lease_expires_at }),
        })),
    });
}

export async function requirePaymentService(request: Request, env: Env): Promise<void> {
    const configured = env.PAYMENT_INGRESS_TOKEN ?? '';
    const header = request.headers.get('authorization') ?? '';
    const supplied = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!configured || !supplied || !(await timingSafeEqual(supplied, configured))) {
        throw new HttpError(401, 'Payment ingress authorization required.');
    }
}

async function assertDeterministicCode(env: Env, purchaseId: string, codeHash: string): Promise<void> {
    const code = normalizeInviteCode(await derivePaidInviteCode(env.ACADEMY_INVITE_HMAC_KEY, purchaseId));
    if (!(await timingSafeEqual(await inviteCodeHash(env, code), codeHash))) {
        throw new HttpError(500, 'Paid invite projection does not match its deterministic code.');
    }
}

function redeemableProjection(env: Env, purchaseId: string): Promise<RedeemableProjectionRow | null> {
    return env.ACADEMY_DB.prepare(
        'SELECT pe.provider, pe.state AS entitlement_state, pe.effective_at, '
        + 'pe.expires_at AS entitlement_expires_at, p.status AS purchase_status, p.redeemed_at, '
        + 'i.kind AS invite_kind, i.code_hash, i.uses_remaining, i.expires_at AS invite_expires_at, i.revoked_at '
        + 'FROM payment_entitlements pe JOIN purchases p ON p.id = pe.purchase_id '
        + 'LEFT JOIN invites i ON i.id = p.invite_id WHERE pe.purchase_id = ?1',
    ).bind(purchaseId).first<RedeemableProjectionRow>();
}

function deliveryByPurchase(env: Env, purchaseId: string): Promise<DeliveryRow | null> {
    return env.ACADEMY_DB.prepare(
        'SELECT id, purchase_id, provider, status, attempt_count, available_at, '
        + 'lease_token_hash, lease_expires_at, updated_at '
        + 'FROM payment_code_deliveries WHERE purchase_id = ?1',
    ).bind(purchaseId).first<DeliveryRow>();
}

function deliveryById(env: Env, deliveryId: string): Promise<DeliveryRow | null> {
    return env.ACADEMY_DB.prepare(
        'SELECT id, purchase_id, provider, status, attempt_count, available_at, '
        + 'lease_token_hash, lease_expires_at, updated_at '
        + 'FROM payment_code_deliveries WHERE id = ?1',
    ).bind(deliveryId).first<DeliveryRow>();
}

function effectiveStatus(row: DeliveryRow, now: number): DeliveryStatus {
    return row.status === 'leased' && row.lease_expires_at !== null && row.lease_expires_at <= now
        ? 'retry'
        : row.status;
}

async function unclaimedResponse(env: Env, deliveryId: string | null, now: number): Promise<Response> {
    if (deliveryId === null) return jsonResponse({ status: 'empty' });
    const delivery = await deliveryById(env, deliveryId);
    if (!delivery) throw new HttpError(404, 'Payment delivery was not found.');
    const projection = await redeemableProjection(env, delivery.purchase_id);
    const unavailable = !projection
        || projection.entitlement_state !== 'active'
        || (projection.entitlement_expires_at !== null && projection.entitlement_expires_at <= now)
        || projection.purchase_status !== 'paid'
        || projection.redeemed_at !== null
        || projection.invite_kind !== 'paid'
        || projection.revoked_at !== null
        || !projection.uses_remaining
        || (projection.invite_expires_at !== null && projection.invite_expires_at <= now);
    if (unavailable) return jsonResponse({ status: 'unavailable', deliveryId }, 409);
    return jsonResponse({
        status: effectiveStatus(delivery, now),
        deliveryId,
        ...(delivery.lease_expires_at === null ? {} : { leaseExpiresAt: delivery.lease_expires_at }),
    }, delivery.status === 'email_accepted' || delivery.status === 'manual_required' ? 200 : 202);
}

function readDeliveryId(value: unknown): string {
    if (typeof value !== 'string' || !DELIVERY_ID_PATTERN.test(value)) {
        throw new HttpError(400, 'Payment delivery id is malformed.');
    }
    return value;
}

function readLeaseToken(value: unknown): string {
    if (typeof value !== 'string' || !LEASE_TOKEN_PATTERN.test(value)) {
        throw new HttpError(400, 'Payment delivery lease token is malformed.');
    }
    return value;
}

function readOutcome(value: unknown): DeliveryOutcome {
    if (value !== 'email_accepted' && value !== 'manual_required' && value !== 'retry') {
        throw new HttpError(422, 'Unsupported payment delivery outcome.');
    }
    return value;
}

function readRetryAt(value: unknown, outcome: DeliveryOutcome, now: number): number {
    if (outcome !== 'retry') {
        if (value !== undefined) throw new HttpError(400, 'retryAt is only valid for retry outcomes.');
        return now;
    }
    if (value === undefined) return now;
    const retryAt = readTimestamp(value, 'retryAt');
    if (retryAt < now || retryAt > now + MAX_RETRY_DELAY_MS) {
        throw new HttpError(422, 'retryAt is outside the allowed retry window.');
    }
    return retryAt;
}

function readTimestamp(value: unknown, field: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1_500_000_000_000 || (value as number) > 4_102_444_800_000) {
        throw new HttpError(422, `${field} must be an epoch-milliseconds timestamp.`);
    }
    return value as number;
}

function readLimit(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) {
        throw new HttpError(422, 'limit must be an integer from 1 to 100.');
    }
    return value as number;
}

function leaseHash(env: Env, token: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `payment-delivery-lease:${token}`);
}
