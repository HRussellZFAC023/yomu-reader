import { requireAccount } from './accounts';
import { hmacSha256Hex, randomToken } from './crypto';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { requireAdmin } from './invites';
import { LIFECYCLE_RATE, clientSubject, enforceRateLimit } from './rate-limit';
import { requireProfile } from './profiles';
import { clearSessionCookie } from './sessions';

interface DeletionReceiptRow {
    readonly id: string;
    readonly scope: 'profile' | 'account';
    readonly deleted_at: number;
    readonly profile_count: number;
    readonly device_count: number;
    readonly synced_record_count: number;
    readonly prune_after: number;
}

export const DELETION_RECEIPT_RETENTION_MS = 90 * 24 * 60 * 60_000;
export const LIFECYCLE_PROOF_GRANT_TTL_MS = 60 * 60_000;

const PRODUCTION_PROOF_SCOPE = 'account-lifecycle-production-test';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PROOF_SECRET = /^[A-Za-z0-9_-]{43}$/u;

interface LifecycleProofGrantRow {
    readonly id: string;
    readonly expires_at: number;
}

interface LifecycleProofAuthorization {
    readonly tokenHash: string;
    readonly runNonceHash: string;
}

export interface LifecyclePruneMetrics {
    readonly exportTraversals: number;
    readonly deletionReceipts: number;
    readonly proofGrants: number;
}

interface LifecycleMaintenanceOptions {
    readonly attempts?: number;
    readonly logger?: Pick<Console, 'info' | 'warn' | 'error'>;
    readonly sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * A supervisor creates this grant only after identifying the exact disposable
 * Academy account. The live-proof runner receives only the single-use bearer
 * token and cannot mark a different authenticated account itself.
 */
export async function handleCreateLifecycleProofGrant(request: Request, env: Env, clock: Clock): Promise<Response> {
    await requireAdmin(request, env);
    requireProductionProofEnvironment(env);
    const now = clock();
    const body = await readJsonBody(request, 512);
    if (Object.keys(body).length !== 2 || typeof body.accountId !== 'string' || !UUID_V4.test(body.accountId)
        || typeof body.runNonce !== 'string' || !PROOF_SECRET.test(body.runNonce)) {
        throw new HttpError(400, 'Proof grant requires one accountId and one 32-byte runNonce.');
    }
    const token = randomToken(32);
    const tokenHash = await lifecycleProofHash(env, 'token', token);
    const runNonceHash = await lifecycleProofHash(env, 'run', body.runNonce);
    const grantId = crypto.randomUUID();
    const expiresAt = now + LIFECYCLE_PROOF_GRANT_TTL_MS;
    const created = await env.ACADEMY_DB.prepare(
        'INSERT INTO account_lifecycle_proof_grants '
        + '(id, token_hash, run_nonce_hash, account_id, environment, scope, created_at, expires_at) '
        + 'SELECT ?1, ?2, ?3, id, ?4, ?5, ?6, ?7 FROM accounts WHERE public_id = ?8 '
        + 'RETURNING id, expires_at',
    ).bind(
        grantId,
        tokenHash,
        runNonceHash,
        env.ACADEMY_ENVIRONMENT,
        PRODUCTION_PROOF_SCOPE,
        now,
        expiresAt,
        body.accountId,
    ).run<LifecycleProofGrantRow>();
    if (!created.results[0]) throw new HttpError(404, 'The proof account was not found.');
    return jsonResponse({
        proofToken: token,
        runNonce: body.runNonce,
        accountId: body.accountId,
        environment: env.ACADEMY_ENVIRONMENT,
        scope: PRODUCTION_PROOF_SCOPE,
        expiresAt,
    }, 201);
}

/** Verify the grant after real login without consuming its one destructive use. */
export async function handleVerifyLifecycleProofGrant(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    requireProductionProofEnvironment(env);
    const now = clock();
    const { account } = await requireAccount(request, env, now);
    const authorization = await readLifecycleProofAuthorization(request, env, false);
    const grant = await env.ACADEMY_DB.prepare(
        'SELECT id, expires_at FROM account_lifecycle_proof_grants '
        + 'WHERE token_hash = ?1 AND run_nonce_hash = ?2 AND account_id = ?3 '
        + 'AND environment = ?4 AND scope = ?5 AND consumed_at IS NULL AND expires_at > ?6',
    ).bind(
        authorization.tokenHash,
        authorization.runNonceHash,
        account.id,
        env.ACADEMY_ENVIRONMENT,
        PRODUCTION_PROOF_SCOPE,
        now,
    ).first<LifecycleProofGrantRow>();
    if (!grant) throw invalidLifecycleProofGrant();
    return jsonResponse({
        verified: true,
        accountId: account.public_id,
        environment: env.ACADEMY_ENVIRONMENT,
        scope: PRODUCTION_PROOF_SCOPE,
        expiresAt: grant.expires_at,
    });
}

/** Delete learning data and paired devices while retaining optional identity. */
export async function handleDeleteProfile(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), LIFECYCLE_RATE, now);
    const context = await requireProfile(request, env, now);
    await requireConfirmation(request, 'delete-profile');
    const deletionId = crypto.randomUUID();
    const statements = [env.ACADEMY_DB.prepare(
        'INSERT INTO deletion_receipts '
        + '(id, scope, deleted_at, profile_count, device_count, synced_record_count, prune_after) '
        + "SELECT ?1, 'profile', ?2, 1, "
        + '(SELECT COUNT(*) FROM profile_devices d WHERE d.profile_id = p.id), '
        + '(SELECT COUNT(*) FROM srs_events e WHERE e.profile_id = p.id), ?4 '
        + 'FROM profiles p WHERE p.id = ?3 '
        + 'RETURNING id, scope, deleted_at, profile_count, device_count, synced_record_count, prune_after',
    ).bind(deletionId, now, context.profile.id, now + DELETION_RECEIPT_RETENTION_MS)];
    if (context.profile.account_id) {
        statements.push(
            env.ACADEMY_DB.prepare('DELETE FROM progress_imports WHERE account_id = ?1').bind(context.profile.account_id),
            env.ACADEMY_DB.prepare('DELETE FROM progress_snapshots WHERE account_id = ?1').bind(context.profile.account_id),
            env.ACADEMY_DB.prepare('DELETE FROM study_days WHERE account_id = ?1').bind(context.profile.account_id),
        );
    }
    statements.push(
        env.ACADEMY_DB.prepare('DELETE FROM sessions WHERE profile_id = ?1').bind(context.profile.id),
        env.ACADEMY_DB.prepare('DELETE FROM profiles WHERE id = ?1').bind(context.profile.id),
    );
    const results = await env.ACADEMY_DB.batch<DeletionReceiptRow>(statements);
    const receipt = results[0]?.results[0];
    if (!receipt || (results.at(-1)?.meta.changes ?? 0) !== 1) throw new HttpError(500, 'Academy profile deletion failed.');
    return jsonResponse({ deleted: true, scope: 'profile', deletionReceipt: deletionReceiptView(receipt) }, 200, {
        'set-cookie': clearSessionCookie(),
    });
}

/** Delete the durable identity and all profiles, aggregates, and memberships. */
export async function handleDeleteAccount(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), LIFECYCLE_RATE, now);
    const context = await requireProfile(request, env, now);
    const { account } = await requireAccount(request, env, now);
    if (context.profile.account_id !== account.id) throw new HttpError(409, 'Account profile is inconsistent.');
    await requireConfirmation(request, 'delete-account');
    const deletionId = crypto.randomUUID();
    const results = await env.ACADEMY_DB.batch<DeletionReceiptRow>([
        env.ACADEMY_DB.prepare(
            'INSERT INTO deletion_receipts '
            + '(id, scope, deleted_at, profile_count, device_count, synced_record_count, prune_after) '
            + "SELECT ?1, 'account', ?2, "
            + '(SELECT COUNT(*) FROM profiles p WHERE p.account_id = a.id), '
            + '(SELECT COUNT(*) FROM profile_devices d JOIN profiles p ON p.id = d.profile_id WHERE p.account_id = a.id), '
            + '(SELECT COUNT(*) FROM srs_events e JOIN profiles p ON p.id = e.profile_id WHERE p.account_id = a.id), ?4 '
            + 'FROM accounts a WHERE a.id = ?3 '
            + 'RETURNING id, scope, deleted_at, profile_count, device_count, synced_record_count, prune_after',
        ).bind(deletionId, now, account.id, now + DELETION_RECEIPT_RETENTION_MS),
        env.ACADEMY_DB.prepare(
            'UPDATE invites SET revoked_at = COALESCE(revoked_at, ?2) WHERE purchase_id IN '
            + '(SELECT id FROM purchases WHERE redeemed_by_account_id = ?1)',
        ).bind(account.id, now),
        env.ACADEMY_DB.prepare(
            'UPDATE purchases SET checkout_session_id = NULL WHERE redeemed_by_account_id = ?1',
        ).bind(account.id),
        env.ACADEMY_DB.prepare(
            'DELETE FROM sessions WHERE account_id = ?1 OR profile_id = ?2',
        ).bind(account.id, context.profile.id),
        env.ACADEMY_DB.prepare('DELETE FROM accounts WHERE id = ?1').bind(account.id),
    ]);
    const receipt = results[0]?.results[0];
    if (!receipt || (results[4]?.meta.changes ?? 0) !== 1) throw new HttpError(500, 'Academy account deletion failed.');
    return jsonResponse({ deleted: true, scope: 'account', deletionReceipt: deletionReceiptView(receipt) }, 200, {
        'set-cookie': clearSessionCookie(),
    });
}

/**
 * Destructive production proof route. Every mutation is gated by the grant row
 * consumed at the start of the same D1 batch, so expiry, replay, account races,
 * and competing proof runs all fail without deleting the authenticated account.
 */
export async function handleDeleteLifecycleProofAccount(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    requireProductionProofEnvironment(env);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), LIFECYCLE_RATE, now);
    const context = await requireProfile(request, env, now);
    const { account } = await requireAccount(request, env, now);
    if (context.profile.account_id !== account.id) throw new HttpError(409, 'Account profile is inconsistent.');
    const authorization = await readLifecycleProofAuthorization(request, env, true);
    const deletionId = crypto.randomUUID();
    const consumeNonce = crypto.randomUUID();
    const results = await env.ACADEMY_DB.batch<DeletionReceiptRow | LifecycleProofGrantRow>([
        env.ACADEMY_DB.prepare(
            'UPDATE account_lifecycle_proof_grants SET consumed_at = ?1, consume_nonce = ?2 '
            + 'WHERE token_hash = ?3 AND run_nonce_hash = ?4 AND account_id = ?5 '
            + 'AND environment = ?6 AND scope = ?7 AND consumed_at IS NULL AND expires_at > ?1 '
            + 'RETURNING id, expires_at',
        ).bind(
            now,
            consumeNonce,
            authorization.tokenHash,
            authorization.runNonceHash,
            account.id,
            env.ACADEMY_ENVIRONMENT,
            PRODUCTION_PROOF_SCOPE,
        ),
        env.ACADEMY_DB.prepare(
            'INSERT INTO deletion_receipts '
            + '(id, scope, deleted_at, profile_count, device_count, synced_record_count, prune_after) '
            + "SELECT ?1, 'account', ?2, "
            + '(SELECT COUNT(*) FROM profiles p WHERE p.account_id = a.id), '
            + '(SELECT COUNT(*) FROM profile_devices d JOIN profiles p ON p.id = d.profile_id WHERE p.account_id = a.id), '
            + '(SELECT COUNT(*) FROM srs_events e JOIN profiles p ON p.id = e.profile_id WHERE p.account_id = a.id), ?4 '
            + 'FROM accounts a WHERE a.id = ?3 AND EXISTS ('
            + 'SELECT 1 FROM account_lifecycle_proof_grants g WHERE g.token_hash = ?5 AND g.run_nonce_hash = ?6 '
            + 'AND g.account_id = a.id AND g.consume_nonce = ?7 AND g.consumed_at = ?2 '
            + 'AND g.environment = ?8 AND g.scope = ?9) '
            + 'RETURNING id, scope, deleted_at, profile_count, device_count, synced_record_count, prune_after',
        ).bind(
            deletionId,
            now,
            account.id,
            now + DELETION_RECEIPT_RETENTION_MS,
            authorization.tokenHash,
            authorization.runNonceHash,
            consumeNonce,
            env.ACADEMY_ENVIRONMENT,
            PRODUCTION_PROOF_SCOPE,
        ),
        env.ACADEMY_DB.prepare(
            'UPDATE invites SET revoked_at = COALESCE(revoked_at, ?2) WHERE purchase_id IN '
            + '(SELECT id FROM purchases WHERE redeemed_by_account_id = ?1) AND EXISTS ('
            + 'SELECT 1 FROM account_lifecycle_proof_grants g WHERE g.token_hash = ?3 AND g.run_nonce_hash = ?4 '
            + 'AND g.account_id = ?1 AND g.consume_nonce = ?5 AND g.consumed_at = ?2 '
            + 'AND g.environment = ?6 AND g.scope = ?7)',
        ).bind(
            account.id,
            now,
            authorization.tokenHash,
            authorization.runNonceHash,
            consumeNonce,
            env.ACADEMY_ENVIRONMENT,
            PRODUCTION_PROOF_SCOPE,
        ),
        env.ACADEMY_DB.prepare(
            'UPDATE purchases SET checkout_session_id = NULL WHERE redeemed_by_account_id = ?1 AND EXISTS ('
            + 'SELECT 1 FROM account_lifecycle_proof_grants g WHERE g.token_hash = ?2 AND g.run_nonce_hash = ?3 '
            + 'AND g.account_id = ?1 AND g.consume_nonce = ?4 AND g.consumed_at = ?5 '
            + 'AND g.environment = ?6 AND g.scope = ?7)',
        ).bind(
            account.id,
            authorization.tokenHash,
            authorization.runNonceHash,
            consumeNonce,
            now,
            env.ACADEMY_ENVIRONMENT,
            PRODUCTION_PROOF_SCOPE,
        ),
        env.ACADEMY_DB.prepare(
            'DELETE FROM sessions WHERE (account_id = ?1 OR profile_id = ?2) AND EXISTS ('
            + 'SELECT 1 FROM account_lifecycle_proof_grants g WHERE g.token_hash = ?3 AND g.run_nonce_hash = ?4 '
            + 'AND g.account_id = ?1 AND g.consume_nonce = ?5 AND g.consumed_at = ?6 '
            + 'AND g.environment = ?7 AND g.scope = ?8)',
        ).bind(
            account.id,
            context.profile.id,
            authorization.tokenHash,
            authorization.runNonceHash,
            consumeNonce,
            now,
            env.ACADEMY_ENVIRONMENT,
            PRODUCTION_PROOF_SCOPE,
        ),
        env.ACADEMY_DB.prepare(
            'DELETE FROM accounts WHERE id = ?1 AND EXISTS ('
            + 'SELECT 1 FROM account_lifecycle_proof_grants g WHERE g.token_hash = ?2 AND g.run_nonce_hash = ?3 '
            + 'AND g.account_id = ?1 AND g.consume_nonce = ?4 AND g.consumed_at = ?5 '
            + 'AND g.environment = ?6 AND g.scope = ?7)',
        ).bind(
            account.id,
            authorization.tokenHash,
            authorization.runNonceHash,
            consumeNonce,
            now,
            env.ACADEMY_ENVIRONMENT,
            PRODUCTION_PROOF_SCOPE,
        ),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1) throw invalidLifecycleProofGrant();
    const receipt = results[1]?.results[0] as DeletionReceiptRow | undefined;
    if (!receipt || (results[5]?.meta.changes ?? 0) !== 1) {
        throw new HttpError(500, 'Academy proof account deletion failed.');
    }
    return jsonResponse({ deleted: true, scope: 'account', deletionReceipt: deletionReceiptView(receipt) }, 200, {
        'set-cookie': clearSessionCookie(),
    });
}

/**
 * Remove expired operational proof state. Paid-redemption rows are excluded:
 * their permanent non-identifying tombstone prevents one-time codes from
 * becoming transferable after account deletion.
 */
export async function pruneLifecycleRecords(env: Env, clock: Clock): Promise<LifecyclePruneMetrics> {
    const now = clock();
    const results = await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'DELETE FROM export_traversals WHERE expires_at <= ?1 OR (completed_at IS NOT NULL AND completed_at <= ?2)',
        ).bind(now, now - 24 * 60 * 60_000),
        env.ACADEMY_DB.prepare(
            'DELETE FROM deletion_receipts WHERE prune_after IS NOT NULL AND prune_after <= ?1',
        ).bind(now),
        env.ACADEMY_DB.prepare(
            'DELETE FROM account_lifecycle_proof_grants WHERE expires_at <= ?1',
        ).bind(now),
    ]);
    return {
        exportTraversals: results[0]?.meta.changes ?? 0,
        deletionReceipts: results[1]?.meta.changes ?? 0,
        proofGrants: results[2]?.meta.changes ?? 0,
    };
}

/** Cron entrypoint with explicit retry and structured observability metrics. */
export async function runScheduledLifecycleMaintenance(
    env: Env,
    clock: Clock,
    options: LifecycleMaintenanceOptions = {},
): Promise<LifecyclePruneMetrics> {
    const attempts = options.attempts ?? 3;
    const logger = options.logger ?? console;
    const sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const startedAt = clock();
        try {
            const metrics = await pruneLifecycleRecords(env, clock);
            logger.info(JSON.stringify({
                event: 'academy_lifecycle_prune',
                outcome: 'success',
                attempt,
                durationMs: Math.max(0, clock() - startedAt),
                ...metrics,
            }));
            return metrics;
        } catch (error) {
            lastError = error;
            const terminal = attempt === attempts;
            logger[terminal ? 'error' : 'warn'](JSON.stringify({
                event: 'academy_lifecycle_prune',
                outcome: terminal ? 'failed' : 'retry',
                attempt,
                durationMs: Math.max(0, clock() - startedAt),
                error: error instanceof Error ? error.message : String(error),
            }));
            if (!terminal) await sleep(attempt * 250);
        }
    }
    throw lastError;
}

async function requireConfirmation(request: Request, expected: string): Promise<void> {
    const body = await readJsonBody(request, 256);
    if (Object.keys(body).length !== 1 || body.confirmation !== expected) {
        throw new HttpError(400, `confirmation must be ${expected}.`);
    }
}

async function readLifecycleProofAuthorization(
    request: Request,
    env: Env,
    deletion: boolean,
): Promise<LifecycleProofAuthorization> {
    const body = await readJsonBody(request, 512);
    const expectedFields = deletion ? 3 : 2;
    if (Object.keys(body).length !== expectedFields
        || (deletion && body.confirmation !== 'delete-account')
        || typeof body.proofToken !== 'string' || !PROOF_SECRET.test(body.proofToken)
        || typeof body.runNonce !== 'string' || !PROOF_SECRET.test(body.runNonce)) {
        throw invalidLifecycleProofGrant();
    }
    return {
        tokenHash: await lifecycleProofHash(env, 'token', body.proofToken),
        runNonceHash: await lifecycleProofHash(env, 'run', body.runNonce),
    };
}

async function lifecycleProofHash(env: Env, kind: 'token' | 'run', value: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `account-lifecycle-proof:${kind}:${value}`);
}

function requireProductionProofEnvironment(env: Env): void {
    if (env.ACADEMY_ENVIRONMENT !== 'production') throw invalidLifecycleProofGrant();
}

function invalidLifecycleProofGrant(): HttpError {
    return new HttpError(403, 'Production lifecycle proof authorization was invalid.');
}

function deletionReceiptView(receipt: DeletionReceiptRow): Record<string, unknown> {
    return {
        deletionId: receipt.id,
        scope: receipt.scope,
        deletedAt: receipt.deleted_at,
        profileCount: receipt.profile_count,
        deviceCount: receipt.device_count,
        syncedRecordCount: receipt.synced_record_count,
        retainedUntil: receipt.prune_after,
    };
}
