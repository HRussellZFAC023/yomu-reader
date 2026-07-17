import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { inviteCodeHash, normalizeInviteCode } from './invites';
import { clientSubject, enforceRateLimit, ENTITLEMENT_RATE } from './rate-limit';
import { activeSession, type ActiveSession } from './sessions';

export interface PaidEntitlementRow {
    readonly id: string;
    readonly status: string;
    readonly amount_pence: number;
    readonly fulfilled_at: number | null;
    readonly redeemed_by_account_id: string | null;
    readonly redeemed_at: number | null;
}

interface SessionEntitlementRow extends PaidEntitlementRow {
    readonly invite_kind: 'seed' | 'paid';
}

interface AccountIdRow {
    readonly id: string;
}

/** Return the purchase behind a paid invite, while preserving seed sessions. */
async function sessionEntitlement(env: Env, session: ActiveSession): Promise<SessionEntitlementRow | null> {
    const row = await env.ACADEMY_DB.prepare(
        'SELECT i.kind AS invite_kind, p.id, p.status, p.amount_pence, p.fulfilled_at, '
        + 'p.redeemed_by_account_id, p.redeemed_at FROM invites i '
        + 'LEFT JOIN purchases p ON p.id = i.purchase_id WHERE i.id = ?1',
    ).bind(session.invite_id).first<SessionEntitlementRow>();
    if (!row) throw new HttpError(401, 'Academy session is no longer valid.');
    if (row.invite_kind === 'paid' && !row.id) throw new HttpError(409, 'Paid entitlement is inconsistent.');
    return row.invite_kind === 'paid' ? row : null;
}

/**
 * Reject an already-owned paid code before allocating or linking an account.
 * Unredeemed codes proceed to the atomic write below.
 */
export async function assertSessionEntitlementCanLink(
    env: Env,
    session: ActiveSession,
    accountId: string | null,
): Promise<void> {
    const entitlement = await sessionEntitlement(env, session);
    if (!entitlement) return;
    if (entitlement.status !== 'paid') throw new HttpError(409, 'Payment is still pending.');
    if (entitlement.redeemed_at === null) return;
    if (accountId && entitlement.redeemed_by_account_id === accountId) return;
    throw new HttpError(409, 'This paid code is already bound to another account.');
}

/** Bind a paid session's purchase to the verified account, idempotently. */
export async function bindSessionEntitlement(
    env: Env,
    session: ActiveSession,
    accountId: string,
    now: number,
): Promise<PaidEntitlementRow | null> {
    const entitlement = await sessionEntitlement(env, session);
    if (!entitlement) return null;
    return bindPaidEntitlement(env, entitlement.id, accountId, now);
}

/**
 * One conditional UPDATE is the redemption point. The partial unique index in
 * migration 0004 is the race-safe backstop for one paid code per account.
 */
export async function bindPaidEntitlement(
    env: Env,
    purchaseId: string,
    accountId: string,
    now: number,
): Promise<PaidEntitlementRow> {
    try {
        const bound = await env.ACADEMY_DB.prepare(
            'UPDATE purchases SET redeemed_by_account_id = ?1, redeemed_at = ?2 '
            + "WHERE id = ?3 AND status = 'paid' AND redeemed_at IS NULL AND redeemed_by_account_id IS NULL "
            + 'AND NOT EXISTS (SELECT 1 FROM purchases WHERE redeemed_by_account_id = ?1 AND id <> ?3) '
            + 'RETURNING id, status, amount_pence, fulfilled_at, redeemed_by_account_id, redeemed_at',
        ).bind(accountId, now, purchaseId).first<PaidEntitlementRow>();
        if (bound) return bound;
    } catch (error) {
        // A simultaneous redemption may have won the unique-index race. Read
        // the durable state below and return only if this exact claim won.
        const message = error instanceof Error ? error.message : String(error);
        if (!/UNIQUE constraint failed|idx_purchases_redeemed_account/iu.test(message)) throw error;
    }
    return resolveRedemption(env, purchaseId, accountId);
}

/** Paid sessions may use profile/sync only after redemption to this account. */
export async function requirePaidSessionEntitlement(
    env: Env,
    session: ActiveSession,
    accountId: string,
): Promise<void> {
    const entitlement = await sessionEntitlement(env, session);
    if (!entitlement) return;
    if (
        entitlement.status !== 'paid'
        || entitlement.redeemed_at === null
        || entitlement.redeemed_by_account_id !== accountId
    ) throw new HttpError(403, 'A paid entitlement must be redeemed by this account.');
}

export async function handleGetEntitlement(request: Request, env: Env, clock: Clock): Promise<Response> {
    const accountId = await verifiedSessionAccountId(request, env, clock());
    const entitlement = await entitlementForAccount(env, accountId);
    return jsonResponse(entitlement ? entitlementView(entitlement) : { entitlement: 'none' });
}

export async function handleRedeemEntitlement(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), ENTITLEMENT_RATE, now);
    const accountId = await verifiedSessionAccountId(request, env, now);
    const body = await readJsonBody(request, 512);
    if (Object.keys(body).some(key => key !== 'code')) throw new HttpError(400, 'Only code may be supplied.');
    const code = normalizeInviteCode(body.code);
    const purchase = await env.ACADEMY_DB.prepare(
        'SELECT p.id, p.status, p.amount_pence, p.fulfilled_at, p.redeemed_by_account_id, p.redeemed_at '
        + 'FROM invites i JOIN purchases p ON p.id = i.purchase_id '
        + "WHERE i.code_hash = ?1 AND i.kind = 'paid' AND i.revoked_at IS NULL "
        + 'AND (i.expires_at IS NULL OR i.expires_at > ?2)',
    ).bind(await inviteCodeHash(env, code), now).first<PaidEntitlementRow>();
    if (!purchase || purchase.status !== 'paid') throw new HttpError(403, 'Paid code was not accepted.');
    return jsonResponse(entitlementView(await bindPaidEntitlement(env, purchase.id, accountId, now)));
}

export async function entitlementForAccount(env: Env, accountId: string): Promise<PaidEntitlementRow | null> {
    return env.ACADEMY_DB.prepare(
        'SELECT id, status, amount_pence, fulfilled_at, redeemed_by_account_id, redeemed_at '
        + 'FROM purchases WHERE redeemed_by_account_id = ?1',
    ).bind(accountId).first<PaidEntitlementRow>();
}

function entitlementView(entitlement: PaidEntitlementRow): Record<string, unknown> {
    return {
        entitlement: 'academy',
        status: 'active',
        redeemedAt: entitlement.redeemed_at,
    };
}

async function verifiedSessionAccountId(request: Request, env: Env, now: number): Promise<string> {
    const session = await activeSession(request, env, now);
    if (!session?.account_id) throw new HttpError(401, 'A Google account is required.');
    const account = await env.ACADEMY_DB.prepare('SELECT id FROM accounts WHERE id = ?1')
        .bind(session.account_id).first<AccountIdRow>();
    if (!account) throw new HttpError(401, 'A Google account is required.');
    return account.id;
}

async function resolveRedemption(env: Env, purchaseId: string, accountId: string): Promise<PaidEntitlementRow> {
    const [purchase, accountEntitlement] = await Promise.all([
        env.ACADEMY_DB.prepare(
            'SELECT id, status, amount_pence, fulfilled_at, redeemed_by_account_id, redeemed_at '
            + 'FROM purchases WHERE id = ?1',
        ).bind(purchaseId).first<PaidEntitlementRow>(),
        entitlementForAccount(env, accountId),
    ]);
    if (purchase && purchase.redeemed_at !== null && purchase.redeemed_by_account_id === accountId) return purchase;
    if (purchase && purchase.redeemed_at !== null) throw new HttpError(409, 'This paid code is already bound to another account.');
    if (accountEntitlement) throw new HttpError(409, 'This account already has a paid code.');
    if (!purchase || purchase.status !== 'paid') throw new HttpError(409, 'Payment is still pending.');
    throw new HttpError(409, 'Paid entitlement could not be bound.');
}
