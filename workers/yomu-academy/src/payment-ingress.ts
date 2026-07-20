import { derivePaidInviteCode, hmacSha256Hex, timingSafeEqual } from './crypto';
import type { Env } from './env';
import { HttpError, jsonResponse, readJsonBody } from './http';
import { mintPaidInvite, requireAdmin } from './invites';

type Provider = 'stripe' | 'kofi' | 'patreon';
type SubjectKind = 'academy_purchase' | 'payer' | 'member' | 'transaction';
type EventType = 'charge.settled' | 'membership.active' | 'membership.revoked';

interface IngressEnvelope {
    readonly schemaVersion: 1;
    readonly provider: Provider;
    readonly eventId: string;
    readonly eventType: EventType;
    readonly occurredAt: number;
    readonly subject: { readonly kind: SubjectKind; readonly reference: string };
    readonly transaction?: {
        readonly reference: string;
        readonly sessionReference?: string;
        readonly currency: 'gbp';
        readonly amountMinor: number;
    };
    readonly purchaseId?: string;
    readonly entitlement?: { readonly expiresAt: number | null; readonly qualifyingAmountMinor?: number };
}

interface CanonicalIds {
    readonly eventHash: string;
    readonly eventId: string;
    readonly subjectHash: string;
    readonly subjectId: string;
    readonly transactionHash: string | null;
    readonly transactionId: string | null;
    readonly sessionHash: string | null;
    readonly entitlementId: string;
    readonly purchaseId: string;
}

const CODE_TTL_MS = 30 * 24 * 60 * 60_000;
const MAX_REFERENCE_LENGTH = 255;

/**
 * Private service-binding-compatible ingress. The caller must authenticate
 * with a dedicated bearer token even when transport is a Service binding: a
 * public route accidentally attached to this Worker must still fail closed.
 */
export async function handlePaymentIngress(request: Request, env: Env, now: number): Promise<Response> {
    await requireIngress(request, env);
    const body = await readJsonBody(request, 16 * 1024);
    const envelope = parseEnvelope(body);
    const ids = await canonicalIds(env, envelope);
    const eventAlreadyExists = await env.ACADEMY_DB.prepare(
        'SELECT id FROM payment_events WHERE provider = ?1 AND provider_event_hash = ?2',
    ).bind(envelope.provider, ids.eventHash).first<{ id: string }>();
    if (eventAlreadyExists) {
        await repairInviteProjection(env, ids.purchaseId, now);
        return jsonResponse({ received: true, duplicate: true });
    }

    const result = envelope.eventType === 'membership.revoked'
        ? await applyMembershipRevocation(env, envelope, ids, now)
        : await applyGrant(env, envelope, ids, now);
    if (result === 'duplicate') return jsonResponse({ received: true, duplicate: true });
    if (result === 'stale') return jsonResponse({ received: true, applied: false, reason: 'stale' }, 202);
    await repairInviteProjection(env, ids.purchaseId, now);
    return jsonResponse({ received: true, applied: true });
}

/**
 * Admin-only code retrieval. Provider references never become public bearer
 * credentials and are never compared with Google/email identity.
 */
export async function handleAdminPaymentCode(request: Request, env: Env, now: number): Promise<Response> {
    await requireAdmin(request, env);
    const body = await readJsonBody(request, 2048);
    if (Object.keys(body).some(key => !['provider', 'referenceType', 'reference'].includes(key))) {
        throw new HttpError(400, 'Payment-code request contains unknown fields.');
    }
    const provider = readProvider(body.provider);
    const referenceType = body.referenceType;
    if (referenceType !== 'subject' && referenceType !== 'transaction') {
        throw new HttpError(400, 'referenceType must be subject or transaction.');
    }
    if (provider === 'patreon' && referenceType === 'transaction') {
        throw new HttpError(400, 'Patreon membership events are not charge transactions.');
    }
    const reference = readReference(body.reference);
    const referenceHash = await sourceHash(env, provider, referenceType, reference);
    const row = referenceType === 'subject'
        ? await entitlementBySubject(env, provider, referenceHash)
        : await entitlementByTransaction(env, provider, referenceHash);
    if (!row?.purchase_id || !row.invite_id) throw new HttpError(404, 'No fulfilled provider entitlement found.');
    if (row.state !== 'active' || (row.expires_at !== null && row.expires_at <= now)) {
        throw new HttpError(409, 'Provider entitlement is not active.');
    }
    if (row.redeemed_at !== null) throw new HttpError(409, 'Provider entitlement code was already redeemed.');
    const expiryCap = paidInviteExpiryCap(now, row.expires_at);
    const redeemable = await env.ACADEMY_DB.prepare(
        'UPDATE invites SET expires_at = CASE WHEN expires_at IS NULL OR expires_at > ?1 THEN ?1 ELSE expires_at END '
        + 'WHERE id = ?2 AND revoked_at IS NULL '
        + 'AND uses_remaining > 0 AND (expires_at IS NULL OR expires_at > ?3) RETURNING id',
    ).bind(expiryCap, row.invite_id, now).first<{ id: string }>();
    if (!redeemable) throw new HttpError(409, 'Provider entitlement code is no longer redeemable.');
    return jsonResponse({
        provider,
        code: await derivePaidInviteCode(env.ACADEMY_INVITE_HMAC_KEY, row.purchase_id),
    });
}

async function applyGrant(
    env: Env,
    envelope: IngressEnvelope,
    ids: CanonicalIds,
    receivedAt: number,
): Promise<'applied' | 'duplicate' | 'stale'> {
    const amount = entitlementAmount(envelope);
    const expiresAt = envelope.eventType === 'membership.active'
        ? envelope.entitlement?.expiresAt ?? null
        : null;
    const transaction = envelope.transaction;
    const statements = [
        env.ACADEMY_DB.prepare(
            'INSERT INTO payment_subjects (id, provider, provider_subject_hash, subject_kind, created_at, updated_at) '
            + 'VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(provider, provider_subject_hash) '
            + 'DO UPDATE SET updated_at = MAX(payment_subjects.updated_at, excluded.updated_at)',
        ).bind(ids.subjectId, envelope.provider, ids.subjectHash, envelope.subject.kind, envelope.occurredAt, receivedAt),
    ];
    if (transaction && ids.transactionHash && ids.transactionId) {
        statements.push(env.ACADEMY_DB.prepare(
            'INSERT INTO payment_transactions '
            + '(id, provider, provider_transaction_hash, provider_session_hash, subject_id, currency, amount_minor, status, occurred_at, received_at) '
            + "SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'settled', ?8, ?9 "
            + 'WHERE NOT EXISTS (SELECT 1 FROM payment_events WHERE provider = ?2 AND provider_event_hash = ?10) '
            + 'ON CONFLICT(provider, provider_transaction_hash) DO UPDATE SET '
            + 'provider_session_hash = COALESCE(payment_transactions.provider_session_hash, excluded.provider_session_hash), '
            + 'amount_minor = excluded.amount_minor, status = excluded.status, occurred_at = excluded.occurred_at, received_at = excluded.received_at '
            + 'WHERE excluded.subject_id = payment_transactions.subject_id '
            + 'AND excluded.occurred_at >= payment_transactions.occurred_at',
        ).bind(
            ids.transactionId, envelope.provider, ids.transactionHash, ids.sessionHash,
            ids.subjectId, transaction.currency, transaction.amountMinor,
            envelope.occurredAt, receivedAt, ids.eventHash,
        ));
    }
    statements.push(env.ACADEMY_DB.prepare(
        'INSERT OR IGNORE INTO purchases (id, claim_hash, amount_pence, status, created_at, fulfilled_at) '
        + "SELECT ?1, ?2, ?3, 'paid', ?4, ?4 "
        + 'WHERE NOT EXISTS (SELECT 1 FROM payment_events WHERE provider = ?5 AND provider_event_hash = ?6) '
        + 'AND NOT EXISTS (SELECT 1 FROM payment_entitlements WHERE subject_id = ?7 '
        + "AND (effective_at > ?4 OR (effective_at = ?4 AND state = 'revoked'))) "
        + "AND ?8 <> 'stripe'",
    ).bind(
        ids.purchaseId,
        await hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `payment-claim:${ids.purchaseId}`),
        amount,
        envelope.occurredAt,
        envelope.provider,
        ids.eventHash,
        ids.subjectId,
        envelope.provider,
    ));
    statements.push(env.ACADEMY_DB.prepare(
        "UPDATE purchases SET status = 'paid', fulfilled_at = COALESCE(fulfilled_at, ?1) "
        + 'WHERE id = ?2 AND amount_pence = ?3 '
        + "AND (?4 <> 'stripe' OR checkout_session_id = ?5) "
        + "AND (?4 <> 'stripe' OR status = 'pending') "
        + 'AND NOT EXISTS (SELECT 1 FROM payment_events WHERE provider = ?4 AND provider_event_hash = ?6)',
    ).bind(
        envelope.occurredAt,
        ids.purchaseId,
        amount,
        envelope.provider,
        envelope.transaction?.sessionReference ?? null,
        ids.eventHash,
    ));
    statements.push(env.ACADEMY_DB.prepare(
        'INSERT INTO payment_entitlements '
        + '(id, provider, subject_id, purchase_id, state, effective_at, expires_at, updated_at) '
        + "SELECT ?1, ?2, ?3, ?4, 'active', ?5, ?6, ?7 "
        + 'WHERE NOT EXISTS (SELECT 1 FROM payment_events WHERE provider = ?2 AND provider_event_hash = ?8) '
        + 'AND (?10 IS NULL OR EXISTS (SELECT 1 FROM payment_transactions WHERE id = ?10 AND subject_id = ?3)) '
        + "AND EXISTS (SELECT 1 FROM purchases WHERE id = ?4 AND status = 'paid') "
        + 'ON CONFLICT(subject_id) DO UPDATE SET purchase_id = COALESCE(payment_entitlements.purchase_id, excluded.purchase_id), '
        + "state = 'active', effective_at = excluded.effective_at, expires_at = excluded.expires_at, updated_at = excluded.updated_at "
        + 'WHERE excluded.effective_at > payment_entitlements.effective_at '
        + "OR (excluded.effective_at = payment_entitlements.effective_at AND payment_entitlements.state = 'active')",
    ).bind(
        ids.entitlementId, envelope.provider, ids.subjectId, ids.purchaseId,
        envelope.occurredAt, expiresAt, receivedAt, ids.eventHash, ids.transactionId, ids.transactionId,
    ));
    statements.push(eventInsert(env, envelope, ids, receivedAt));
    const results = await env.ACADEMY_DB.batch(statements);
    const eventResult = results.at(-1);
    if ((eventResult?.meta.changes ?? 0) === 0) return 'duplicate';
    const entitlementResult = results.at(-2);
    return (entitlementResult?.meta.changes ?? 0) > 0 ? 'applied' : 'stale';
}

async function applyMembershipRevocation(
    env: Env,
    envelope: IngressEnvelope,
    ids: CanonicalIds,
    receivedAt: number,
): Promise<'applied' | 'duplicate' | 'stale'> {
    const results = await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'INSERT INTO payment_subjects (id, provider, provider_subject_hash, subject_kind, created_at, updated_at) '
            + 'VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(provider, provider_subject_hash) '
            + 'DO UPDATE SET updated_at = MAX(payment_subjects.updated_at, excluded.updated_at)',
        ).bind(ids.subjectId, envelope.provider, ids.subjectHash, envelope.subject.kind, envelope.occurredAt, receivedAt),
        env.ACADEMY_DB.prepare(
            'INSERT INTO payment_entitlements '
            + '(id, provider, subject_id, purchase_id, state, effective_at, expires_at, updated_at) '
            + "SELECT ?1, ?2, ?3, NULL, 'revoked', ?4, NULL, ?5 "
            + 'WHERE NOT EXISTS (SELECT 1 FROM payment_events WHERE provider = ?2 AND provider_event_hash = ?6) '
            + 'ON CONFLICT(subject_id) DO UPDATE SET state = \'revoked\', effective_at = excluded.effective_at, '
            + 'expires_at = NULL, updated_at = excluded.updated_at '
            + 'WHERE excluded.effective_at >= payment_entitlements.effective_at',
        ).bind(ids.entitlementId, envelope.provider, ids.subjectId, envelope.occurredAt, receivedAt, ids.eventHash),
        eventInsert(env, envelope, ids, receivedAt),
    ]);
    if ((results[2]?.meta.changes ?? 0) === 0) return 'duplicate';
    return (results[1]?.meta.changes ?? 0) > 0 ? 'applied' : 'stale';
}

function eventInsert(env: Env, envelope: IngressEnvelope, ids: CanonicalIds, receivedAt: number) {
    return env.ACADEMY_DB.prepare(
        'INSERT OR IGNORE INTO payment_events '
        + '(id, provider, provider_event_hash, event_type, subject_id, transaction_id, occurred_at, received_at, disposition) '
        + "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'accepted')",
    ).bind(
        ids.eventId, envelope.provider, ids.eventHash, envelope.eventType,
        ids.subjectId, ids.transactionId, envelope.occurredAt, receivedAt,
    );
}

async function repairInviteProjection(env: Env, purchaseId: string, now: number): Promise<void> {
    const entitlement = await env.ACADEMY_DB.prepare(
        'SELECT pe.state, pe.expires_at, p.invite_id FROM payment_entitlements pe '
        + 'JOIN purchases p ON p.id = pe.purchase_id WHERE pe.purchase_id = ?1',
    ).bind(purchaseId).first<{ state: string; expires_at: number | null; invite_id: string | null }>();
    if (!entitlement || entitlement.state !== 'active' || (entitlement.expires_at !== null && entitlement.expires_at <= now)) return;
    const inviteId = entitlement.invite_id ?? await mintPaidInvite(env, purchaseId, now);
    await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'UPDATE invites SET expires_at = CASE WHEN expires_at IS NULL OR expires_at > ?1 THEN ?1 ELSE expires_at END '
            + "WHERE id = ?2 AND kind = 'paid' AND revoked_at IS NULL",
        ).bind(paidInviteExpiryCap(now, entitlement.expires_at), inviteId),
        env.ACADEMY_DB.prepare(
            "UPDATE purchases SET invite_id = COALESCE(invite_id, ?1) WHERE id = ?2 AND status = 'paid'",
        ).bind(inviteId, purchaseId),
    ]);
}

function paidInviteExpiryCap(now: number, entitlementExpiresAt: number | null): number {
    return Math.min(now + CODE_TTL_MS, entitlementExpiresAt ?? Number.MAX_SAFE_INTEGER);
}

async function canonicalIds(env: Env, envelope: IngressEnvelope): Promise<CanonicalIds> {
    const eventHash = await sourceHash(env, envelope.provider, 'event', envelope.eventId);
    const subjectHash = await sourceHash(env, envelope.provider, 'subject', envelope.subject.reference);
    const transactionHash = envelope.transaction
        ? await sourceHash(env, envelope.provider, 'transaction', envelope.transaction.reference)
        : null;
    const sessionHash = envelope.transaction?.sessionReference
        ? await sourceHash(env, envelope.provider, 'session', envelope.transaction.sessionReference)
        : null;
    const suffix = (value: string): string => value.slice(0, 40);
    const purchaseId = envelope.provider === 'stripe' && envelope.purchaseId
        ? envelope.purchaseId
        : `provider_${suffix(subjectHash)}`;
    return {
        eventHash,
        eventId: `payevt_${suffix(eventHash)}`,
        subjectHash,
        subjectId: `paysub_${suffix(subjectHash)}`,
        transactionHash,
        transactionId: transactionHash ? `paytxn_${suffix(transactionHash)}` : null,
        sessionHash,
        entitlementId: `payent_${suffix(subjectHash)}`,
        purchaseId,
    };
}

function parseEnvelope(body: Record<string, unknown>): IngressEnvelope {
    const allowed = new Set(['schemaVersion', 'provider', 'eventId', 'eventType', 'occurredAt', 'subject', 'transaction', 'purchaseId', 'entitlement']);
    if (Object.keys(body).some(key => !allowed.has(key))) throw new HttpError(400, 'Payment event contains unknown fields.');
    if (body.schemaVersion !== 1) throw new HttpError(422, 'Unsupported payment ingress schema.');
    const provider = readProvider(body.provider);
    const eventId = readReference(body.eventId);
    const eventType = body.eventType;
    if (eventType !== 'charge.settled' && eventType !== 'membership.active' && eventType !== 'membership.revoked') {
        throw new HttpError(422, 'Unsupported payment event type.');
    }
    const occurredAt = readTimestamp(body.occurredAt, 'occurredAt');
    const subject = readSubject(body.subject);
    const transaction = body.transaction === undefined ? undefined : readTransaction(body.transaction);
    const purchaseId = body.purchaseId === undefined ? undefined : readReference(body.purchaseId);
    const entitlement = body.entitlement === undefined ? undefined : readEntitlement(body.entitlement, occurredAt);
    if (eventType === 'charge.settled' && (!transaction || provider === 'patreon')) {
        throw new HttpError(422, 'Settled charges require a Stripe or Ko-fi transaction.');
    }
    if (eventType !== 'charge.settled' && (provider !== 'patreon' || transaction)) {
        throw new HttpError(422, 'Membership events are Patreon state, not charge transactions.');
    }
    if (eventType === 'membership.active' && (!entitlement || entitlement.expiresAt === null)) {
        throw new HttpError(422, 'Active membership expiry is required.');
    }
    if (provider === 'stripe' && (
        eventType !== 'charge.settled'
        || !purchaseId
        || subject.kind !== 'academy_purchase'
        || subject.reference !== purchaseId
        || !transaction?.sessionReference
    )) {
        throw new HttpError(422, 'Stripe ingress must reference an Academy-created purchase.');
    }
    if (provider === 'kofi' && eventType !== 'charge.settled') throw new HttpError(422, 'Ko-fi ingress accepts charge events only.');
    return { schemaVersion: 1, provider, eventId, eventType, occurredAt, subject, transaction, purchaseId, entitlement };
}

function readProvider(value: unknown): Provider {
    if (value !== 'stripe' && value !== 'kofi' && value !== 'patreon') throw new HttpError(422, 'Unsupported payment provider.');
    return value;
}

function readSubject(value: unknown): IngressEnvelope['subject'] {
    if (!isRecord(value) || Object.keys(value).some(key => !['kind', 'reference'].includes(key))) {
        throw new HttpError(400, 'Payment subject is malformed.');
    }
    const kind = value.kind;
    if (kind !== 'academy_purchase' && kind !== 'payer' && kind !== 'member' && kind !== 'transaction') {
        throw new HttpError(422, 'Unsupported payment subject kind.');
    }
    return { kind, reference: readReference(value.reference) };
}

function readTransaction(value: unknown): NonNullable<IngressEnvelope['transaction']> {
    if (!isRecord(value) || Object.keys(value).some(key => !['reference', 'sessionReference', 'currency', 'amountMinor'].includes(key))) {
        throw new HttpError(400, 'Payment transaction is malformed.');
    }
    if (value.currency !== 'gbp') throw new HttpError(422, 'Only GBP Academy payments are accepted.');
    const amountMinor = value.amountMinor;
    if (!Number.isSafeInteger(amountMinor) || (amountMinor as number) < 200 || (amountMinor as number) > 50_000) {
        throw new HttpError(422, 'Payment is outside the Academy entitlement range.');
    }
    return {
        reference: readReference(value.reference),
        ...(value.sessionReference === undefined ? {} : { sessionReference: readReference(value.sessionReference) }),
        currency: 'gbp',
        amountMinor: amountMinor as number,
    };
}

function readEntitlement(value: unknown, occurredAt: number): NonNullable<IngressEnvelope['entitlement']> {
    if (!isRecord(value) || Object.keys(value).some(key => !['expiresAt', 'qualifyingAmountMinor'].includes(key))) {
        throw new HttpError(400, 'Payment entitlement is malformed.');
    }
    const expiresAt = value.expiresAt === null ? null : readTimestamp(value.expiresAt, 'expiresAt');
    if (expiresAt !== null && expiresAt <= occurredAt) throw new HttpError(422, 'Entitlement expiry must follow the event.');
    const qualifyingAmountMinor = value.qualifyingAmountMinor;
    if (!Number.isSafeInteger(qualifyingAmountMinor) || (qualifyingAmountMinor as number) < 200 || (qualifyingAmountMinor as number) > 50_000) {
        throw new HttpError(422, 'Membership is outside the Academy entitlement range.');
    }
    return { expiresAt, qualifyingAmountMinor: qualifyingAmountMinor as number };
}

function entitlementAmount(envelope: IngressEnvelope): number {
    return envelope.transaction?.amountMinor ?? envelope.entitlement?.qualifyingAmountMinor ?? 200;
}

function readTimestamp(value: unknown, field: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1_500_000_000_000 || (value as number) > 4_102_444_800_000) {
        throw new HttpError(422, `${field} must be an epoch-milliseconds timestamp.`);
    }
    return value as number;
}

function readReference(value: unknown): string {
    if (typeof value !== 'string' || value.length < 3 || value.length > MAX_REFERENCE_LENGTH || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new HttpError(400, 'Provider reference is malformed.');
    }
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function sourceHash(env: Env, provider: Provider, kind: string, reference: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `payment:${provider}:${kind}:${reference}`);
}

async function requireIngress(request: Request, env: Env): Promise<void> {
    const configured = env.PAYMENT_INGRESS_TOKEN ?? '';
    const header = request.headers.get('authorization') ?? '';
    const supplied = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!configured || !supplied || !(await timingSafeEqual(supplied, configured))) {
        throw new HttpError(401, 'Payment ingress authorization required.');
    }
}

interface EntitlementLookup {
    readonly purchase_id: string | null;
    readonly state: string;
    readonly expires_at: number | null;
    readonly invite_id: string | null;
    readonly redeemed_at: number | null;
}

function entitlementBySubject(env: Env, provider: Provider, hash: string): Promise<EntitlementLookup | null> {
    return env.ACADEMY_DB.prepare(
        'SELECT pe.purchase_id, pe.state, pe.expires_at, p.invite_id, p.redeemed_at FROM payment_subjects ps '
        + 'JOIN payment_entitlements pe ON pe.subject_id = ps.id '
        + 'LEFT JOIN purchases p ON p.id = pe.purchase_id '
        + 'WHERE ps.provider = ?1 AND ps.provider_subject_hash = ?2',
    ).bind(provider, hash).first<EntitlementLookup>();
}

function entitlementByTransaction(env: Env, provider: Provider, hash: string): Promise<EntitlementLookup | null> {
    return env.ACADEMY_DB.prepare(
        'SELECT pe.purchase_id, pe.state, pe.expires_at, p.invite_id, p.redeemed_at FROM payment_transactions pt '
        + 'JOIN payment_entitlements pe ON pe.subject_id = pt.subject_id '
        + 'LEFT JOIN purchases p ON p.id = pe.purchase_id '
        + 'WHERE pt.provider = ?1 AND pt.provider_transaction_hash = ?2',
    ).bind(provider, hash).first<EntitlementLookup>();
}
