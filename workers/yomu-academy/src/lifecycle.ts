import { getAccountView, requireAccount } from './accounts';
import { entitlementForAccount } from './entitlements';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { EXPORT_RATE, LIFECYCLE_RATE, clientSubject, enforceRateLimit } from './rate-limit';
import { profileView, requireProfile } from './profiles';
import { clearSessionCookie } from './sessions';
import { readPageRequest, readSyncPage } from './sync';

interface DeviceExportRow {
    readonly public_id: string;
    readonly created_at: number;
    readonly last_seen_at: number;
    readonly revoked_at: number | null;
}

interface AggregateProgressRow {
    readonly known_word_count: number;
    readonly reviews_completed: number;
    readonly reviews_due: number;
    readonly lessons_completed: number;
    readonly lessons_total: number;
    readonly updated_at: number;
}

export async function handleProfileExport(request: Request, env: Env, clock: Clock): Promise<Response> {
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), EXPORT_RATE, now);
    const context = await requireProfile(request, env, now);
    const { cursor, limit } = readPageRequest(new URL(request.url));
    return jsonResponse({
        schemaVersion: 1,
        exportedAt: now,
        profile: profileView(context),
        devices: await exportedDevices(env, context.profile.id),
        eventPage: await readSyncPage(env, context.profile.id, cursor, limit),
    });
}

export async function handleAccountExport(request: Request, env: Env, clock: Clock): Promise<Response> {
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), EXPORT_RATE, now);
    const context = await requireProfile(request, env, now);
    const { account } = await requireAccount(request, env, now);
    if (context.profile.account_id !== account.id) throw new HttpError(409, 'Account profile is inconsistent.');
    const { cursor, limit } = readPageRequest(new URL(request.url));
    const [progress, studyDays, entitlement] = await Promise.all([
        env.ACADEMY_DB.prepare(
            'SELECT known_word_count, reviews_completed, reviews_due, lessons_completed, lessons_total, updated_at '
            + 'FROM progress_snapshots WHERE account_id = ?1',
        ).bind(account.id).first<AggregateProgressRow>(),
        env.ACADEMY_DB.prepare(
            'SELECT study_date FROM study_days WHERE account_id = ?1 ORDER BY study_date',
        ).bind(account.id).all<{ study_date: string }>(),
        entitlementForAccount(env, account.id, now),
    ]);
    return jsonResponse({
        schemaVersion: 1,
        exportedAt: now,
        account: await getAccountView(env, account),
        profile: profileView(context),
        devices: await exportedDevices(env, context.profile.id),
        aggregateProgress: progress ? {
            knownWordCount: progress.known_word_count,
            reviewsCompleted: progress.reviews_completed,
            reviewsDue: progress.reviews_due,
            lessonsCompleted: progress.lessons_completed,
            lessonsTotal: progress.lessons_total,
            updatedAt: progress.updated_at,
        } : null,
        studyDays: studyDays.results.map(row => row.study_date),
        paidEntitlement: entitlement ? {
            status: entitlement.status,
            amountPence: entitlement.amount_pence,
            fulfilledAt: entitlement.fulfilled_at,
            redeemedAt: entitlement.redeemed_at,
        } : null,
        eventPage: await readSyncPage(env, context.profile.id, cursor, limit),
    });
}

/** Delete learning data and paired devices while retaining optional identity. */
export async function handleDeleteProfile(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), LIFECYCLE_RATE, now);
    const context = await requireProfile(request, env, now);
    await requireConfirmation(request, 'delete-profile');
    const statements = [];
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
    const results = await env.ACADEMY_DB.batch(statements);
    if ((results.at(-1)?.meta.changes ?? 0) !== 1) throw new HttpError(500, 'Academy profile deletion failed.');
    return jsonResponse({ deleted: true, scope: 'profile' }, 200, { 'set-cookie': clearSessionCookie() });
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
    const results = await env.ACADEMY_DB.batch([
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
    if ((results[3]?.meta.changes ?? 0) !== 1) throw new HttpError(500, 'Academy account deletion failed.');
    return jsonResponse({ deleted: true, scope: 'account' }, 200, { 'set-cookie': clearSessionCookie() });
}

async function exportedDevices(env: Env, profileId: string): Promise<Array<Record<string, unknown>>> {
    const devices = await env.ACADEMY_DB.prepare(
        'SELECT public_id, created_at, last_seen_at, revoked_at FROM profile_devices '
        + 'WHERE profile_id = ?1 ORDER BY created_at, public_id',
    ).bind(profileId).all<DeviceExportRow>();
    return devices.results.map(device => ({
        deviceId: device.public_id,
        createdAt: device.created_at,
        lastSeenAt: device.last_seen_at,
        revokedAt: device.revoked_at,
    }));
}

async function requireConfirmation(request: Request, expected: string): Promise<void> {
    const body = await readJsonBody(request, 256);
    if (Object.keys(body).length !== 1 || body.confirmation !== expected) {
        throw new HttpError(400, `confirmation must be ${expected}.`);
    }
}
