import { requireAccount } from './accounts';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
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
 * Remove expired operational proof state. Paid-redemption rows are excluded:
 * their permanent non-identifying tombstone prevents one-time codes from
 * becoming transferable after account deletion.
 */
export async function pruneLifecycleRecords(env: Env, clock: Clock): Promise<void> {
    const now = clock();
    await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'DELETE FROM export_traversals WHERE expires_at <= ?1 OR (completed_at IS NOT NULL AND completed_at <= ?2)',
        ).bind(now, now - 24 * 60 * 60_000),
        env.ACADEMY_DB.prepare(
            'DELETE FROM deletion_receipts WHERE prune_after IS NOT NULL AND prune_after <= ?1',
        ).bind(now),
    ]);
}

async function requireConfirmation(request: Request, expected: string): Promise<void> {
    const body = await readJsonBody(request, 256);
    if (Object.keys(body).length !== 1 || body.confirmation !== expected) {
        throw new HttpError(400, `confirmation must be ${expected}.`);
    }
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
