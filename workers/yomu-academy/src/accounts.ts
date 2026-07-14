import { hmacSha256Hex, randomBytes } from './crypto';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { activeSession, type ActiveSession } from './sessions';

const AVATARS = new Set(['quality-2', 'quality-3', 'quality-4', 'quality-5']);
const DISPLAY_NAME_MAX = 32;

export interface AccountRow {
    readonly id: string;
    readonly public_id: string;
    readonly display_name: string;
    readonly name_chosen: number;
    readonly discriminator: string;
    readonly avatar_key: string | null;
    readonly board_visible: number;
    readonly share_avatar: number;
}

export interface AccountContext {
    readonly session: ActiveSession;
    readonly account: AccountRow;
}

async function googleSubjectHash(env: Env, subject: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `google-sub:${subject}`);
}

/** Create or find an Academy account, then link the current invite session. */
export async function linkGoogleSubject(env: Env, session: ActiveSession, subject: string, now: number): Promise<AccountRow> {
    const subjectHash = await googleSubjectHash(env, subject);
    let account = await accountBySubjectHash(env, subjectHash);

    if (!account) {
        for (let attempt = 0; attempt < 24 && !account; attempt += 1) {
            const id = crypto.randomUUID();
            const publicId = crypto.randomUUID();
            const discriminator = randomDiscriminator();
            try {
                await env.ACADEMY_DB.prepare(
                    'INSERT INTO accounts '
                    + '(id, public_id, google_sub_hash, display_name, name_chosen, discriminator, board_visible, share_avatar, created_at, updated_at) '
                    + "VALUES (?1, ?2, ?3, 'Learner', 0, ?4, 0, 0, ?5, ?5)",
                ).bind(id, publicId, subjectHash, discriminator, now).run();
                account = await accountBySubjectHash(env, subjectHash);
            } catch {
                // A concurrent callback may have inserted the Google subject,
                // or this six-digit discriminator may have collided. Re-read
                // before generating another cryptographically random value.
                account = await accountBySubjectHash(env, subjectHash);
            }
        }
    }
    if (!account) throw new HttpError(503, 'Could not allocate an Academy identity.');

    await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'UPDATE sessions SET account_id = ?1 WHERE public_id = ?2 AND revoked_at IS NULL',
        ).bind(account.id, session.public_id),
        env.ACADEMY_DB.prepare(
            'INSERT OR IGNORE INTO class_memberships (class_id, account_id, role, board_hidden, joined_at) '
            + "SELECT i.class_id, ?1, 'learner', 0, ?3 FROM sessions s JOIN invites i ON i.id = s.invite_id "
            + 'WHERE s.public_id = ?2 AND i.class_id IS NOT NULL',
        ).bind(account.id, session.public_id, now),
    ]);
    return account;
}

export async function requireAccount(request: Request, env: Env, now: number): Promise<AccountContext> {
    const session = await activeSession(request, env, now);
    if (!session) throw new HttpError(401, 'No active session.');
    if (!session.account_id) throw new HttpError(401, 'An Academy account is required.');
    const account = await env.ACADEMY_DB.prepare(
        'SELECT id, public_id, display_name, name_chosen, discriminator, avatar_key, board_visible, share_avatar '
        + 'FROM accounts WHERE id = ?1',
    ).bind(session.account_id).first<AccountRow>();
    if (!account) throw new HttpError(401, 'An Academy account is required.');
    return { session, account };
}

export async function handleGetAccount(request: Request, env: Env, clock: Clock): Promise<Response> {
    const { account } = await requireAccount(request, env, clock());
    return jsonResponse(await accountView(env, account));
}

export async function handlePatchAccount(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    const { account } = await requireAccount(request, env, now);
    const body = await readJsonBody(request);

    let displayName = account.display_name;
    let nameChosen = account.name_chosen;
    let avatarKey = account.avatar_key;
    let boardVisible = account.board_visible === 1;
    let shareAvatar = account.share_avatar === 1;

    if (body.displayName !== undefined) {
        displayName = normalizeDisplayName(body.displayName);
        nameChosen = 1;
    }
    if (body.avatarKey !== undefined) avatarKey = parseAvatar(body.avatarKey);
    if (body.boardVisible !== undefined) boardVisible = parseBoolean(body.boardVisible, 'boardVisible');
    if (body.shareAvatar !== undefined) shareAvatar = parseBoolean(body.shareAvatar, 'shareAvatar');
    if (boardVisible && nameChosen !== 1) throw new HttpError(400, 'Choose an Academy display name before joining the class board.');
    if (shareAvatar && !avatarKey) throw new HttpError(400, 'Choose an Academy avatar before sharing it.');

    await env.ACADEMY_DB.prepare(
        'UPDATE accounts SET display_name = ?1, name_chosen = ?2, avatar_key = ?3, '
        + 'board_visible = ?4, share_avatar = ?5, updated_at = ?6 WHERE id = ?7',
    ).bind(displayName, nameChosen, avatarKey, boardVisible ? 1 : 0, shareAvatar ? 1 : 0, now, account.id).run();
    const updated = await env.ACADEMY_DB.prepare(
        'SELECT id, public_id, display_name, name_chosen, discriminator, avatar_key, board_visible, share_avatar '
        + 'FROM accounts WHERE id = ?1',
    ).bind(account.id).first<AccountRow>();
    if (!updated) throw new HttpError(500, 'Account update failed.');
    return jsonResponse(await accountView(env, updated));
}

export function normalizeDisplayName(value: unknown): string {
    if (typeof value !== 'string') throw new HttpError(400, 'displayName must be text.');
    const normalized = value.normalize('NFKC').trim().replaceAll(/\s+/gu, ' ');
    if (!normalized || [...normalized].length > DISPLAY_NAME_MAX || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(normalized)) {
        throw new HttpError(400, `displayName must be 1–${DISPLAY_NAME_MAX} readable characters.`);
    }
    return normalized;
}

export function displayTag(account: Pick<AccountRow, 'display_name' | 'discriminator'>): string {
    return `${account.display_name}#${account.discriminator}`;
}

function randomDiscriminator(): string {
    const range = 1_000_000;
    const ceiling = Math.floor(0x1_0000_0000 / range) * range;
    while (true) {
        const bytes = randomBytes(4);
        const value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
        if (value < ceiling) return String(value % range).padStart(6, '0');
    }
}

async function accountBySubjectHash(env: Env, subjectHash: string): Promise<AccountRow | null> {
    return env.ACADEMY_DB.prepare(
        'SELECT id, public_id, display_name, name_chosen, discriminator, avatar_key, board_visible, share_avatar '
        + 'FROM accounts WHERE google_sub_hash = ?1',
    ).bind(subjectHash).first<AccountRow>();
}

async function accountView(env: Env, account: AccountRow): Promise<Record<string, unknown>> {
    const memberships = await env.ACADEMY_DB.prepare(
        'SELECT m.class_id, c.name, m.role, m.board_hidden FROM class_memberships m '
        + 'JOIN classes c ON c.id = m.class_id WHERE m.account_id = ?1 AND c.archived_at IS NULL ORDER BY c.name',
    ).bind(account.id).all<{ class_id: string; name: string; role: string; board_hidden: number }>();
    return {
        accountId: account.public_id,
        displayName: account.display_name,
        displayTag: displayTag(account),
        nameChosen: account.name_chosen === 1,
        avatarKey: account.avatar_key,
        boardVisible: account.board_visible === 1,
        shareAvatar: account.share_avatar === 1,
        classes: memberships.results.map(row => ({
            classId: row.class_id,
            name: row.name,
            role: row.role,
            boardHidden: row.board_hidden === 1,
        })),
    };
}

function parseAvatar(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== 'string' || !AVATARS.has(value)) throw new HttpError(400, 'Unknown Academy avatar.');
    return value;
}

function parseBoolean(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') throw new HttpError(400, `${field} must be true or false.`);
    return value;
}
