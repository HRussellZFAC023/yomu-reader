import { getAccountView, requireAccount } from './accounts';
import { hmacSha256Hex, randomToken, timingSafeEqual } from './crypto';
import { entitlementForAccount } from './entitlements';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { profileView, requireProfile, type ProfileContext } from './profiles';
import { authenticatedSessionSubject, enforceRateLimit, EXPORT_RATE } from './rate-limit';

const EXPORT_PAGE_SIZE = 200;
const EXPORT_TTL_MS = 15 * 60_000;
const EXPORT_CURSOR_PATTERN = /^v2\.([A-Za-z0-9_-]{43})\.([0-9a-z]+)\.([0-9a-f]{64})$/u;

type ExportScope = 'profile' | 'account';

interface DeviceExportRow {
    readonly public_id: string;
    readonly created_at: number;
    readonly last_seen_at: number;
    readonly revoked_at: number | null;
    readonly credential_created_at: number | null;
    readonly credential_last_seen_at: number | null;
    readonly credential_revoked_at: number | null;
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
    readonly academy_snapshot_sequence: number;
    readonly academy_page_start_cursor: number;
    readonly academy_next_cursor: number;
    readonly reader_snapshot_sequence: number;
    readonly reader_page_start_cursor: number;
    readonly reader_next_cursor: number;
    readonly page_number: number;
    readonly completed_at: number | null;
}

interface ExportCursor {
    readonly secret: string;
    readonly pageNumber: number;
}

interface ExportPage {
    readonly events: readonly Record<string, unknown>[];
    readonly nextCursor: number;
    readonly hasMore: boolean;
    readonly exportCursor: string | null;
}

interface ExportPageBundle {
    readonly eventPage: ExportPage;
    readonly readerSrsEventPage: Omit<ExportPage, 'exportCursor'>;
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
        return jsonResponse({ ...metadata, ...page });
    }
    const cursor = await parseExportCursor(env, suppliedCursor);
    const page = await continueExportTraversal(env, context, scope, cursor, now);
    return jsonResponse({ schemaVersion: 2, ...page });
}

async function startExportTraversal(
    env: Env,
    context: ProfileContext,
    scope: ExportScope,
    secret: string,
    now: number,
): Promise<ExportPageBundle> {
    const idHash = await exportSessionHash(env, secret);
    const statements = [
        env.ACADEMY_DB.prepare(
            'INSERT INTO export_traversals '
            + '(id_hash, session_public_id, profile_id, scope, academy_snapshot_sequence, academy_next_cursor, '
            + 'reader_snapshot_sequence, reader_next_cursor, page_size, page_number, created_at, expires_at) '
            + 'VALUES (?1, ?2, ?3, ?4, '
            + 'COALESCE((SELECT MAX(sequence) FROM srs_events WHERE profile_id = ?3), 0), 0, '
            + 'COALESCE((SELECT MAX(sequence) FROM reader_srs_events WHERE profile_id = ?3), 0), 0, ?5, 0, ?6, ?7)',
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
    return exportPageFromResults(env, secret, results[1], results[2], results[3]);
}

async function continueExportTraversal(
    env: Env,
    context: ProfileContext,
    scope: ExportScope,
    cursor: ExportCursor,
    now: number,
): Promise<ExportPageBundle> {
    const idHash = await exportSessionHash(env, cursor.secret);
    const [progress, events, readerEvents] = await env.ACADEMY_DB.batch<ExportProgressRow | StoredEventRow>(
        exportAdvanceStatements(env, context, scope, idHash, cursor.pageNumber, now),
    );
    if (!progress?.results[0]) {
        throw new HttpError(409, 'Export cursor was already used, expired, or belongs to another session.');
    }
    return exportPageFromResults(env, cursor.secret, progress, events, readerEvents);
}

function exportAdvanceStatements(
    env: Env,
    context: ProfileContext,
    scope: ExportScope,
    idHash: string,
    pageNumber: number,
    now: number,
) {
    const academyPageMaximum = 'SELECT MAX(sequence) FROM (SELECT sequence FROM srs_events e '
        + 'WHERE e.profile_id = export_traversals.profile_id AND e.sequence > export_traversals.academy_next_cursor '
        + 'AND e.sequence <= export_traversals.academy_snapshot_sequence ORDER BY e.sequence LIMIT 200)';
    const readerPageMaximum = 'SELECT MAX(sequence) FROM (SELECT sequence FROM reader_srs_events e '
        + 'WHERE e.profile_id = export_traversals.profile_id AND e.sequence > export_traversals.reader_next_cursor '
        + 'AND e.sequence <= export_traversals.reader_snapshot_sequence ORDER BY e.sequence LIMIT 200)';
    const academyAdvances = 'academy_next_cursor < academy_snapshot_sequence';
    const nextAcademyCursor = `CASE WHEN ${academyAdvances} THEN COALESCE((${academyPageMaximum}), academy_next_cursor) ELSE academy_next_cursor END`;
    const nextReaderCursor = `CASE WHEN NOT (${academyAdvances}) THEN COALESCE((${readerPageMaximum}), reader_next_cursor) ELSE reader_next_cursor END`;
    return [
        env.ACADEMY_DB.prepare(
            `UPDATE export_traversals SET academy_page_start_cursor = academy_next_cursor, `
            + `reader_page_start_cursor = reader_next_cursor, academy_next_cursor = ${nextAcademyCursor}, `
            + `reader_next_cursor = ${nextReaderCursor}, page_number = page_number + 1, `
            + `completed_at = CASE WHEN (${nextAcademyCursor}) >= academy_snapshot_sequence `
            + `AND (${nextReaderCursor}) >= reader_snapshot_sequence THEN ?6 ELSE NULL END `
            + 'WHERE id_hash = ?1 AND session_public_id = ?2 AND profile_id = ?3 AND scope = ?4 '
            + 'AND page_number = ?5 AND completed_at IS NULL AND expires_at > ?6 '
            + 'RETURNING academy_snapshot_sequence, academy_page_start_cursor, academy_next_cursor, '
            + 'reader_snapshot_sequence, reader_page_start_cursor, reader_next_cursor, page_number, completed_at',
        ).bind(idHash, context.session.public_id, context.profile.id, scope, pageNumber, now),
        env.ACADEMY_DB.prepare(
            'SELECT e.sequence, e.event_id, e.occurred_at, e.key_version, e.nonce, e.ciphertext, '
            + 'd.public_id AS source_device_public_id, e.received_at FROM srs_events e '
            + 'LEFT JOIN profile_devices d ON d.id = e.source_device_id WHERE e.profile_id = ?1 '
            + 'AND e.sequence > COALESCE((SELECT academy_page_start_cursor FROM export_traversals '
            + 'WHERE id_hash = ?2 AND session_public_id = ?3 AND profile_id = ?1 AND scope = ?4 AND expires_at > ?5), -1) '
            + 'AND e.sequence <= COALESCE((SELECT academy_next_cursor FROM export_traversals '
            + 'WHERE id_hash = ?2 AND session_public_id = ?3 AND profile_id = ?1 AND scope = ?4 AND expires_at > ?5), -1) '
            + 'ORDER BY e.sequence LIMIT 200',
        ).bind(context.profile.id, idHash, context.session.public_id, scope, now),
        env.ACADEMY_DB.prepare(
            'SELECT e.sequence, e.event_id, e.occurred_at, e.key_version, e.nonce, e.ciphertext, '
            + 'd.public_id AS source_device_public_id, e.received_at FROM reader_srs_events e '
            + 'JOIN profile_devices d ON d.id = e.source_device_id WHERE e.profile_id = ?1 '
            + 'AND e.sequence > COALESCE((SELECT reader_page_start_cursor FROM export_traversals '
            + 'WHERE id_hash = ?2 AND session_public_id = ?3 AND profile_id = ?1 AND scope = ?4 AND expires_at > ?5), -1) '
            + 'AND e.sequence <= COALESCE((SELECT reader_next_cursor FROM export_traversals '
            + 'WHERE id_hash = ?2 AND session_public_id = ?3 AND profile_id = ?1 AND scope = ?4 AND expires_at > ?5), -1) '
            + 'ORDER BY e.sequence LIMIT 200',
        ).bind(context.profile.id, idHash, context.session.public_id, scope, now),
    ];
}

async function exportPageFromResults(
    env: Env,
    secret: string,
    progressResult: { readonly results: readonly (ExportProgressRow | StoredEventRow)[] } | undefined,
    eventResult: { readonly results: readonly (ExportProgressRow | StoredEventRow)[] } | undefined,
    readerEventResult: { readonly results: readonly (ExportProgressRow | StoredEventRow)[] } | undefined,
): Promise<ExportPageBundle> {
    const progress = progressResult?.results[0] as ExportProgressRow | undefined;
    if (!progress) throw new HttpError(503, 'Export traversal could not be started.');
    const academyRows = (eventResult?.results ?? []) as readonly StoredEventRow[];
    const readerRows = (readerEventResult?.results ?? []) as readonly StoredEventRow[];
    assertPageConsistent(academyRows, progress.academy_page_start_cursor, progress.academy_next_cursor);
    assertPageConsistent(readerRows, progress.reader_page_start_cursor, progress.reader_next_cursor);
    const academyHasMore = progress.academy_next_cursor < progress.academy_snapshot_sequence;
    const readerHasMore = progress.reader_next_cursor < progress.reader_snapshot_sequence;
    const traversalHasMore = progress.completed_at === null;
    const exportCursor = traversalHasMore ? await createExportCursor(env, secret, progress.page_number) : null;
    return {
        eventPage: {
            events: academyRows.map(eventView),
            nextCursor: progress.academy_next_cursor,
            hasMore: academyHasMore,
            exportCursor,
        },
        readerSrsEventPage: {
            events: readerRows.map(eventView),
            nextCursor: progress.reader_next_cursor,
            hasMore: readerHasMore,
        },
    };
}

function assertPageConsistent(rows: readonly StoredEventRow[], startCursor: number, nextCursor: number): void {
    if (rows.length > 0 && (rows[0]?.sequence ?? 0) <= startCursor) {
        throw new HttpError(503, 'Export traversal became inconsistent.');
    }
    if (rows.length > 0 && rows.at(-1)?.sequence !== nextCursor) {
        throw new HttpError(503, 'Export traversal became inconsistent.');
    }
    if (rows.length === 0 && nextCursor !== startCursor) {
        throw new HttpError(503, 'Export traversal became inconsistent.');
    }
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
        'SELECT d.public_id, d.created_at, d.last_seen_at, d.revoked_at, '
        + 'c.created_at AS credential_created_at, c.last_seen_at AS credential_last_seen_at, '
        + 'c.revoked_at AS credential_revoked_at FROM profile_devices d '
        + 'LEFT JOIN profile_device_credentials c ON c.profile_device_id = d.id '
        + 'WHERE d.profile_id = ?1 ORDER BY d.created_at, d.public_id',
    ).bind(profileId).all<DeviceExportRow>();
    return devices.results.map(device => ({
        deviceId: device.public_id,
        createdAt: device.created_at,
        lastSeenAt: device.last_seen_at,
        revokedAt: device.revoked_at,
        readerCredential: device.credential_created_at === null ? null : {
            createdAt: device.credential_created_at,
            lastSeenAt: device.credential_last_seen_at,
            revokedAt: device.credential_revoked_at,
        },
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

async function createExportCursor(env: Env, secret: string, pageNumber: number): Promise<string> {
    const encodedPage = pageNumber.toString(36);
    const signature = await hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `export-cursor:${secret}:${encodedPage}`);
    return `v2.${secret}.${encodedPage}.${signature}`;
}

async function parseExportCursor(env: Env, value: string): Promise<ExportCursor> {
    const match = EXPORT_CURSOR_PATTERN.exec(value);
    if (!match) throw new HttpError(400, 'Export cursor is invalid.');
    const pageNumber = Number.parseInt(match[2], 36);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw new HttpError(400, 'Export cursor is invalid.');
    const expected = await hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `export-cursor:${match[1]}:${match[2]}`);
    if (!(await timingSafeEqual(expected, match[3]))) throw new HttpError(400, 'Export cursor is invalid.');
    return { secret: match[1], pageNumber };
}

async function exportSessionHash(env: Env, secret: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `export-session:${secret}`);
}
