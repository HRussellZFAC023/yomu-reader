import { getAccountView, requireAccount } from './accounts';
import { hmacSha256Hex, randomToken, timingSafeEqual } from './crypto';
import { entitlementForAccount } from './entitlements';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { profileView, requireProfile, type ProfileContext } from './profiles';
import { authenticatedSessionSubject, enforceRateLimit, EXPORT_RATE } from './rate-limit';

const EXPORT_PAGE_SIZE = 200;
const EXPORT_TTL_MS = 15 * 60_000;
const EXPORT_CURSOR_PATTERN = /^v1\.([A-Za-z0-9_-]{43})\.([0-9a-z]+)\.([0-9a-f]{64})$/u;

type ExportScope = 'profile' | 'account';

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

interface StoredEventRow {
    readonly sequence: number;
    readonly event_id: string;
    readonly occurred_at: number;
    readonly key_version: number;
    readonly nonce: string;
    readonly ciphertext: string;
    readonly source_device_public_id: string | null;
    readonly received_at: number;
}

interface ExportProgressRow {
    readonly snapshot_sequence: number;
    readonly next_cursor: number;
    readonly page_number: number;
    readonly completed_at: number | null;
}

interface ExportCursor {
    readonly secret: string;
    readonly cursor: number;
}

interface ExportPage {
    readonly events: readonly Record<string, unknown>[];
    readonly nextCursor: number;
    readonly hasMore: boolean;
    readonly exportCursor: string | null;
}

export async function handleProfileExport(request: Request, env: Env, clock: Clock): Promise<Response> {
    return handleExport(request, env, clock, 'profile');
}

export async function handleAccountExport(request: Request, env: Env, clock: Clock): Promise<Response> {
    return handleExport(request, env, clock, 'account');
}

async function handleExport(request: Request, env: Env, clock: Clock, scope: ExportScope): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    const context = await requireProfile(request, env, now);
    const body = await readJsonBody(request, 512);
    if (Object.keys(body).some(key => key !== 'cursor')
        || (body.cursor !== undefined && typeof body.cursor !== 'string')) {
        throw new HttpError(400, 'Export accepts only one continuation cursor.');
    }
    const suppliedCursor = body.cursor;
    if (suppliedCursor === undefined) {
        await enforceRateLimit(
            env,
            await authenticatedSessionSubject(env, context.session.public_id),
            EXPORT_RATE,
            now,
        );
        const metadata = scope === 'account'
            ? await accountExportMetadata(request, env, context, now)
            : await profileExportMetadata(env, context, now);
        const secret = randomToken(32);
        const page = await startExportTraversal(env, context, scope, secret, now);
        return jsonResponse({ ...metadata, eventPage: page });
    }
    const cursor = await parseExportCursor(env, suppliedCursor);
    const page = await continueExportTraversal(env, context, scope, cursor, now);
    return jsonResponse({ schemaVersion: 2, eventPage: page });
}

async function startExportTraversal(
    env: Env,
    context: ProfileContext,
    scope: ExportScope,
    secret: string,
    now: number,
): Promise<ExportPage> {
    const idHash = await exportSessionHash(env, secret);
    const statements = [
        env.ACADEMY_DB.prepare(
            'INSERT INTO export_traversals '
            + '(id_hash, session_public_id, profile_id, scope, snapshot_sequence, next_cursor, page_size, page_number, created_at, expires_at) '
            + 'SELECT ?1, ?2, ?3, ?4, COALESCE(MAX(sequence), 0), 0, ?5, 0, ?6, ?7 '
            + 'FROM srs_events WHERE profile_id = ?3',
        ).bind(
            idHash,
            context.session.public_id,
            context.profile.id,
            scope,
            EXPORT_PAGE_SIZE,
            now,
            now + EXPORT_TTL_MS,
        ),
        ...exportAdvanceStatements(env, context, scope, idHash, 0, now),
    ];
    const results = await env.ACADEMY_DB.batch<ExportProgressRow | StoredEventRow>(statements);
    return exportPageFromResults(env, secret, 0, results[1], results[2]);
}

async function continueExportTraversal(
    env: Env,
    context: ProfileContext,
    scope: ExportScope,
    cursor: ExportCursor,
    now: number,
): Promise<ExportPage> {
    const idHash = await exportSessionHash(env, cursor.secret);
    const [progress, events] = await env.ACADEMY_DB.batch<ExportProgressRow | StoredEventRow>(
        exportAdvanceStatements(env, context, scope, idHash, cursor.cursor, now),
    );
    if (!progress?.results[0]) {
        throw new HttpError(409, 'Export cursor was already used, expired, or belongs to another session.');
    }
    return exportPageFromResults(env, cursor.secret, cursor.cursor, progress, events);
}

function exportAdvanceStatements(
    env: Env,
    context: ProfileContext,
    scope: ExportScope,
    idHash: string,
    cursor: number,
    now: number,
) {
    const pageMaximum = 'SELECT MAX(sequence) FROM (SELECT sequence FROM srs_events e '
        + 'WHERE e.profile_id = export_traversals.profile_id AND e.sequence > ?5 '
        + 'AND e.sequence <= export_traversals.snapshot_sequence ORDER BY e.sequence LIMIT 200)';
    return [
        env.ACADEMY_DB.prepare(
            'UPDATE export_traversals SET next_cursor = COALESCE((' + pageMaximum + '), next_cursor), '
            + 'page_number = page_number + 1, completed_at = CASE WHEN NOT EXISTS ('
            + 'SELECT 1 FROM srs_events remaining WHERE remaining.profile_id = export_traversals.profile_id '
            + 'AND remaining.sequence > COALESCE((' + pageMaximum + '), ?5) '
            + 'AND remaining.sequence <= export_traversals.snapshot_sequence) THEN ?6 ELSE NULL END '
            + 'WHERE id_hash = ?1 AND session_public_id = ?2 AND profile_id = ?3 AND scope = ?4 '
            + 'AND next_cursor = ?5 AND completed_at IS NULL AND expires_at > ?6 '
            + 'RETURNING snapshot_sequence, next_cursor, page_number, completed_at',
        ).bind(idHash, context.session.public_id, context.profile.id, scope, cursor, now),
        env.ACADEMY_DB.prepare(
            'SELECT e.sequence, e.event_id, e.occurred_at, e.key_version, e.nonce, e.ciphertext, '
            + 'd.public_id AS source_device_public_id, e.received_at FROM srs_events e '
            + 'LEFT JOIN profile_devices d ON d.id = e.source_device_id '
            + 'WHERE e.profile_id = ?1 AND e.sequence > ?2 AND e.sequence <= COALESCE('
            + '(SELECT snapshot_sequence FROM export_traversals WHERE id_hash = ?3 AND session_public_id = ?4 '
            + 'AND profile_id = ?1 AND scope = ?5 AND expires_at > ?6), -1) '
            + 'ORDER BY e.sequence LIMIT 200',
        ).bind(context.profile.id, cursor, idHash, context.session.public_id, scope, now),
    ];
}

async function exportPageFromResults(
    env: Env,
    secret: string,
    previousCursor: number,
    progressResult: { readonly results: readonly (ExportProgressRow | StoredEventRow)[] } | undefined,
    eventResult: { readonly results: readonly (ExportProgressRow | StoredEventRow)[] } | undefined,
): Promise<ExportPage> {
    const progress = progressResult?.results[0] as ExportProgressRow | undefined;
    if (!progress) throw new HttpError(503, 'Export traversal could not be started.');
    const rows = (eventResult?.results ?? []) as readonly StoredEventRow[];
    const events = rows.map(eventView);
    if (events.length > 0 && progress.next_cursor !== rows.at(-1)?.sequence) {
        throw new HttpError(503, 'Export traversal became inconsistent.');
    }
    if (events.length === 0 && progress.next_cursor !== previousCursor) {
        throw new HttpError(503, 'Export traversal became inconsistent.');
    }
    const hasMore = progress.completed_at === null;
    return {
        events,
        nextCursor: progress.next_cursor,
        hasMore,
        exportCursor: hasMore ? await createExportCursor(env, secret, progress.next_cursor) : null,
    };
}

async function profileExportMetadata(env: Env, context: ProfileContext, now: number): Promise<Record<string, unknown>> {
    return {
        schemaVersion: 2,
        exportedAt: now,
        snapshotSemantics: 'events-at-export-start',
        profile: profileView(context),
        devices: await exportedDevices(env, context.profile.id),
    };
}

async function accountExportMetadata(
    request: Request,
    env: Env,
    context: ProfileContext,
    now: number,
): Promise<Record<string, unknown>> {
    const { account } = await requireAccount(request, env, now);
    if (context.profile.account_id !== account.id) throw new HttpError(409, 'Account profile is inconsistent.');
    const [progress, studyDays, entitlement, accountView, devices] = await Promise.all([
        env.ACADEMY_DB.prepare(
            'SELECT known_word_count, reviews_completed, reviews_due, lessons_completed, lessons_total, updated_at '
            + 'FROM progress_snapshots WHERE account_id = ?1',
        ).bind(account.id).first<AggregateProgressRow>(),
        env.ACADEMY_DB.prepare(
            'SELECT study_date FROM study_days WHERE account_id = ?1 ORDER BY study_date',
        ).bind(account.id).all<{ study_date: string }>(),
        entitlementForAccount(env, account.id, now),
        getAccountView(env, account),
        exportedDevices(env, context.profile.id),
    ]);
    return {
        schemaVersion: 2,
        exportedAt: now,
        snapshotSemantics: 'events-at-export-start',
        account: accountView,
        profile: profileView(context),
        devices,
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
    };
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

function eventView(row: StoredEventRow): Record<string, unknown> {
    return {
        cursor: row.sequence,
        id: row.event_id,
        occurredAt: row.occurred_at,
        keyVersion: row.key_version,
        nonce: row.nonce,
        ciphertext: row.ciphertext,
        sourceDeviceId: row.source_device_public_id,
        receivedAt: row.received_at,
    };
}

async function createExportCursor(env: Env, secret: string, cursor: number): Promise<string> {
    const encodedCursor = cursor.toString(36);
    const signature = await hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `export-cursor:${secret}:${encodedCursor}`);
    return `v1.${secret}.${encodedCursor}.${signature}`;
}

async function parseExportCursor(env: Env, value: string): Promise<ExportCursor> {
    const match = EXPORT_CURSOR_PATTERN.exec(value);
    if (!match) throw new HttpError(400, 'Export cursor is invalid.');
    const cursor = Number.parseInt(match[2], 36);
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new HttpError(400, 'Export cursor is invalid.');
    const expected = await hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `export-cursor:${match[1]}:${match[2]}`);
    if (!(await timingSafeEqual(expected, match[3]))) throw new HttpError(400, 'Export cursor is invalid.');
    return { secret: match[1], cursor };
}

async function exportSessionHash(env: Env, secret: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `export-session:${secret}`);
}
