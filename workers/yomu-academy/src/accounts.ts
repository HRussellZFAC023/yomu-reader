import { hmacSha256Hex, randomBytes } from './crypto';
import { assertSessionEntitlementCanLink } from './entitlements';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { ACCOUNT_RECOVERY_INVITE_ID, activeSession, type ActiveSession } from './sessions';

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

export type AccountLinkFailureCategory =
    | 'entitlement_conflict'
    | 'profile_conflict'
    | 'recovery_not_found'
    | 'session_conflict'
    | 'transaction_failed';

export class AccountLinkFailure extends HttpError {
    constructor(
        status: number,
        message: string,
        readonly category: AccountLinkFailureCategory,
    ) {
        super(status, message);
        this.name = 'AccountLinkFailure';
    }
}

interface AccountLinkPlanRow {
    readonly account_id: string | null;
    readonly profile_id: string | null;
    readonly device_id: string | null;
    readonly invite_id: string;
}

interface LinkedAccountRow extends AccountRow {
    readonly link_ok: number;
}

async function googleSubjectHash(env: Env, subject: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `google-sub:${subject}`);
}

/**
 * Create or find an Academy account and attach every owned resource in one D1
 * transaction. The final assertion deliberately raises a SQLite error unless
 * every invariant holds, which makes D1 roll back entitlement redemption and
 * every preceding account/profile write together.
 */
export async function linkGoogleSubject(env: Env, session: ActiveSession, subject: string, now: number): Promise<AccountRow> {
    const subjectHash = await googleSubjectHash(env, subject);
    const plan = await accountLinkPlan(env, session.public_id);
    if (!plan) throw new AccountLinkFailure(401, 'Your Academy session expired.', 'session_conflict');
    const existingAccount = await accountBySubjectHash(env, subjectHash);
    if (plan.account_id && plan.account_id !== existingAccount?.id) {
        throw new AccountLinkFailure(409, 'Log out before linking a different Academy account.', 'session_conflict');
    }
    const recoveryAllowed = plan.invite_id !== ACCOUNT_RECOVERY_INVITE_ID
        || Boolean(existingAccount && await accountHasDurableBinding(env, existingAccount.id));
    if (!recoveryAllowed) {
        throw new AccountLinkFailure(403, 'No recoverable Academy account was found.', 'recovery_not_found');
    }
    try {
        await assertSessionEntitlementCanLink(env, session, existingAccount?.id ?? null, now);
    } catch (error) {
        throw accountLinkEntitlementFailure(error);
    }

    const sourceProfileId = plan.profile_id ?? crypto.randomUUID();
    const sourceDeviceId = plan.device_id ?? crypto.randomUUID();
    for (let attempt = 0; attempt < 24; attempt += 1) {
        const accountId = crypto.randomUUID();
        const accountPublicId = crypto.randomUUID();
        const profilePublicId = crypto.randomUUID();
        const devicePublicId = crypto.randomUUID();
        const discriminator = randomDiscriminator();
        try {
            const results = await env.ACADEMY_DB.batch<LinkedAccountRow>([
                env.ACADEMY_DB.prepare(
                    'INSERT INTO accounts '
                    + '(id, public_id, google_sub_hash, display_name, name_chosen, discriminator, board_visible, share_avatar, created_at, updated_at) '
                    + "SELECT ?1, ?2, ?3, 'Learner', 0, ?4, 0, 0, ?5, ?5 FROM sessions s "
                    + 'WHERE s.public_id = ?6 AND s.revoked_at IS NULL AND s.account_id IS NULL AND s.invite_id <> ?7 '
                    + 'ON CONFLICT(google_sub_hash) DO NOTHING',
                ).bind(accountId, accountPublicId, subjectHash, discriminator, now, session.public_id, ACCOUNT_RECOVERY_INVITE_ID),
                env.ACADEMY_DB.prepare(
                    'INSERT INTO profiles (id, public_id, account_id, sync_key_version, created_at, updated_at) '
                    + 'SELECT ?1, ?2, NULL, 1, ?3, ?3 FROM sessions s JOIN accounts a ON a.google_sub_hash = ?4 '
                    + 'WHERE s.public_id = ?5 AND s.revoked_at IS NULL AND s.profile_id IS NULL AND s.device_id IS NULL '
                    + 'AND (s.account_id IS NULL OR s.account_id = a.id)',
                ).bind(sourceProfileId, profilePublicId, now, subjectHash, session.public_id),
                env.ACADEMY_DB.prepare(
                    'INSERT INTO profile_devices (id, public_id, profile_id, created_at, last_seen_at, revoked_at) '
                    + 'SELECT ?1, ?2, ?3, ?4, ?4, NULL FROM sessions s JOIN accounts a ON a.google_sub_hash = ?5 '
                    + 'WHERE s.public_id = ?6 AND s.revoked_at IS NULL AND s.profile_id IS NULL AND s.device_id IS NULL '
                    + 'AND (s.account_id IS NULL OR s.account_id = a.id) '
                    + 'AND EXISTS (SELECT 1 FROM profiles WHERE id = ?3)',
                ).bind(sourceDeviceId, devicePublicId, sourceProfileId, now, subjectHash, session.public_id),
                env.ACADEMY_DB.prepare(
                    'UPDATE sessions SET profile_id = ?1, device_id = ?2 WHERE public_id = ?3 AND revoked_at IS NULL '
                    + 'AND profile_id IS NULL AND device_id IS NULL '
                    + 'AND EXISTS (SELECT 1 FROM profile_devices WHERE id = ?2 AND profile_id = ?1) '
                    + 'AND EXISTS (SELECT 1 FROM accounts a WHERE a.google_sub_hash = ?4 '
                    + 'AND (sessions.account_id IS NULL OR sessions.account_id = a.id))',
                ).bind(sourceProfileId, sourceDeviceId, session.public_id, subjectHash),
                env.ACADEMY_DB.prepare(
                    'UPDATE purchases SET '
                    + 'redeemed_by_account_id = (SELECT id FROM accounts WHERE google_sub_hash = ?1), '
                    + 'redeemed_at = COALESCE(redeemed_at, ?2) '
                    + 'WHERE id = (SELECT i.purchase_id FROM sessions s JOIN invites i ON i.id = s.invite_id '
                    + "WHERE s.public_id = ?3 AND i.kind = 'paid') "
                    + "AND status = 'paid' AND ((redeemed_at IS NULL AND redeemed_by_account_id IS NULL) "
                    + 'OR (redeemed_at IS NOT NULL AND redeemed_by_account_id = '
                    + '(SELECT id FROM accounts WHERE google_sub_hash = ?1))) '
                    + 'AND NOT EXISTS (SELECT 1 FROM payment_entitlements pe WHERE pe.purchase_id = purchases.id '
                    + "AND (pe.state <> 'active' OR (pe.expires_at IS NOT NULL AND pe.expires_at <= ?2))) "
                    + 'AND NOT EXISTS (SELECT 1 FROM purchases other WHERE other.redeemed_by_account_id = '
                    + '(SELECT id FROM accounts WHERE google_sub_hash = ?1) AND other.id <> purchases.id) '
                    + 'AND EXISTS (SELECT 1 FROM sessions s JOIN accounts a ON a.google_sub_hash = ?1 '
                    + 'WHERE s.public_id = ?3 AND s.revoked_at IS NULL AND (s.account_id IS NULL OR s.account_id = a.id))',
                ).bind(subjectHash, now, session.public_id),
                env.ACADEMY_DB.prepare(
                    'UPDATE OR IGNORE profiles SET account_id = '
                    + '(SELECT id FROM accounts WHERE google_sub_hash = ?1), updated_at = ?2 '
                    + 'WHERE id = ?3 AND (account_id IS NULL OR account_id = '
                    + '(SELECT id FROM accounts WHERE google_sub_hash = ?1)) '
                    + 'AND NOT EXISTS (SELECT 1 FROM profiles p JOIN accounts a ON p.account_id = a.id '
                    + 'WHERE a.google_sub_hash = ?1 AND p.id <> ?3) '
                    + 'AND EXISTS (SELECT 1 FROM sessions s JOIN accounts a ON a.google_sub_hash = ?1 '
                    + 'WHERE s.public_id = ?4 AND s.profile_id = ?3 AND s.revoked_at IS NULL '
                    + 'AND (s.account_id IS NULL OR s.account_id = a.id))',
                ).bind(subjectHash, now, sourceProfileId, session.public_id),
                env.ACADEMY_DB.prepare(
                    'UPDATE profile_devices SET profile_id = '
                    + '(SELECT p.id FROM profiles p JOIN accounts a ON p.account_id = a.id WHERE a.google_sub_hash = ?1), '
                    + 'last_seen_at = ?2 WHERE id = ?3 AND profile_id = ?4 AND revoked_at IS NULL '
                    + 'AND EXISTS (SELECT 1 FROM profiles source WHERE source.id = ?4 AND source.account_id IS NULL) '
                    + 'AND NOT EXISTS (SELECT 1 FROM srs_events e WHERE e.profile_id = ?4) '
                    + 'AND 1 = (SELECT COUNT(*) FROM profile_devices d WHERE d.profile_id = ?4 AND d.revoked_at IS NULL) '
                    + 'AND 1 = (SELECT COUNT(*) FROM sessions s WHERE s.profile_id = ?4 AND s.revoked_at IS NULL) '
                    + 'AND EXISTS (SELECT 1 FROM sessions s JOIN accounts a ON a.google_sub_hash = ?1 '
                    + 'WHERE s.public_id = ?5 AND s.profile_id = ?4 AND s.device_id = ?3 AND s.revoked_at IS NULL '
                    + 'AND (s.account_id IS NULL OR s.account_id = a.id)) '
                    + 'AND EXISTS (SELECT 1 FROM profiles p JOIN accounts a ON p.account_id = a.id '
                    + 'WHERE a.google_sub_hash = ?1 AND p.id <> ?4)',
                ).bind(subjectHash, now, sourceDeviceId, sourceProfileId, session.public_id),
                env.ACADEMY_DB.prepare(
                    'UPDATE sessions SET account_id = (SELECT id FROM accounts WHERE google_sub_hash = ?1), '
                    + 'profile_id = (SELECT profile_id FROM profile_devices WHERE id = sessions.device_id) '
                    + 'WHERE public_id = ?2 AND revoked_at IS NULL '
                    + 'AND EXISTS (SELECT 1 FROM accounts a WHERE a.google_sub_hash = ?1 '
                    + 'AND (sessions.account_id IS NULL OR sessions.account_id = a.id)) '
                    + 'AND EXISTS (SELECT 1 FROM profile_devices d JOIN profiles p ON p.id = d.profile_id '
                    + 'JOIN accounts a ON a.id = p.account_id WHERE d.id = sessions.device_id '
                    + 'AND d.revoked_at IS NULL AND a.google_sub_hash = ?1)',
                ).bind(subjectHash, session.public_id),
                env.ACADEMY_DB.prepare(
                    'DELETE FROM profiles WHERE id = ?1 AND account_id IS NULL '
                    + 'AND NOT EXISTS (SELECT 1 FROM srs_events WHERE profile_id = ?1) '
                    + 'AND NOT EXISTS (SELECT 1 FROM profile_devices WHERE profile_id = ?1 AND revoked_at IS NULL) '
                    + 'AND NOT EXISTS (SELECT 1 FROM sessions WHERE profile_id = ?1 AND revoked_at IS NULL)',
                ).bind(sourceProfileId),
                env.ACADEMY_DB.prepare(
                    'INSERT OR IGNORE INTO class_memberships (class_id, account_id, role, board_hidden, joined_at) '
                    + "SELECT i.class_id, a.id, 'learner', 0, ?3 FROM sessions s JOIN invites i ON i.id = s.invite_id "
                    + 'JOIN accounts a ON a.id = s.account_id WHERE s.public_id = ?1 AND a.google_sub_hash = ?2 '
                    + 'AND s.revoked_at IS NULL AND i.class_id IS NOT NULL',
                ).bind(session.public_id, subjectHash, now),
                env.ACADEMY_DB.prepare(
                    'UPDATE accounts SET recovery_bound_at = COALESCE(recovery_bound_at, ?3), updated_at = ?3 '
                    + 'WHERE google_sub_hash = ?1 AND EXISTS ('
                    + 'SELECT 1 FROM sessions s JOIN profiles p ON p.id = s.profile_id '
                    + 'WHERE s.public_id = ?2 AND s.account_id = accounts.id AND s.revoked_at IS NULL '
                    + 'AND p.account_id = accounts.id)',
                ).bind(subjectHash, session.public_id, now),
                env.ACADEMY_DB.prepare(
                    'SELECT a.id, a.public_id, a.display_name, a.name_chosen, a.discriminator, a.avatar_key, '
                    + 'a.board_visible, a.share_avatar, CASE WHEN ('
                    + 'EXISTS (SELECT 1 FROM sessions s JOIN profiles p ON p.id = s.profile_id '
                    + 'JOIN profile_devices d ON d.id = s.device_id AND d.profile_id = p.id '
                    + 'WHERE s.public_id = ?2 AND s.revoked_at IS NULL AND d.revoked_at IS NULL '
                    + 'AND s.account_id = a.id AND p.account_id = a.id) '
                    + 'AND a.recovery_bound_at IS NOT NULL '
                    + 'AND EXISTS (SELECT 1 FROM sessions s JOIN invites i ON i.id = s.invite_id '
                    + 'WHERE s.public_id = ?2 AND (i.kind <> \'paid\' OR EXISTS ('
                    + 'SELECT 1 FROM purchases purchase LEFT JOIN payment_entitlements pe ON pe.purchase_id = purchase.id '
                    + 'WHERE purchase.id = i.purchase_id AND purchase.status = \'paid\' '
                    + 'AND purchase.redeemed_by_account_id = a.id AND purchase.redeemed_at IS NOT NULL '
                    + "AND (pe.id IS NULL OR (pe.state = 'active' AND (pe.expires_at IS NULL OR pe.expires_at > ?3))))))"
                    + ") THEN 1 ELSE json_extract('account-link-rollback', '$.invalid') END AS link_ok "
                    + 'FROM accounts a WHERE a.google_sub_hash = ?1',
                ).bind(subjectHash, session.public_id, now),
            ]);
            const linked = results.at(-1)?.results[0];
            if (linked?.link_ok === 1) return linked;
            throw await resolveAccountLinkFailure(env, session, subjectHash, plan);
        } catch (error) {
            if (isDiscriminatorCollision(error)) continue;
            if (isTransactionAssertion(error)) {
                throw await resolveAccountLinkFailure(env, session, subjectHash, plan);
            }
            if (error instanceof AccountLinkFailure) throw error;
            throw new AccountLinkFailure(503, 'Academy account link could not be completed.', 'transaction_failed');
        }
    }
    throw new AccountLinkFailure(503, 'Could not allocate an Academy identity.', 'transaction_failed');
}

async function accountLinkPlan(env: Env, sessionPublicId: string): Promise<AccountLinkPlanRow | null> {
    return env.ACADEMY_DB.prepare(
        'SELECT account_id, profile_id, device_id, invite_id FROM sessions '
        + 'WHERE public_id = ?1 AND revoked_at IS NULL',
    ).bind(sessionPublicId).first<AccountLinkPlanRow>();
}

async function resolveAccountLinkFailure(
    env: Env,
    session: ActiveSession,
    subjectHash: string,
    plan: AccountLinkPlanRow,
): Promise<AccountLinkFailure> {
    const account = await accountBySubjectHash(env, subjectHash);
    if (plan.account_id && plan.account_id !== account?.id) {
        return new AccountLinkFailure(409, 'Log out before linking a different Academy account.', 'session_conflict');
    }
    if (plan.invite_id === ACCOUNT_RECOVERY_INVITE_ID
        && (!account || !(await accountHasDurableBinding(env, account.id)))) {
        return new AccountLinkFailure(403, 'No recoverable Academy account was found.', 'recovery_not_found');
    }
    try {
        await assertSessionEntitlementCanLink(env, session, account?.id ?? null);
    } catch (error) {
        return accountLinkEntitlementFailure(error);
    }
    if (account && plan.profile_id) {
        const conflict = await env.ACADEMY_DB.prepare(
            'SELECT EXISTS (SELECT 1 FROM profiles target WHERE target.account_id = ?1 AND target.id <> ?2) '
            + 'AND NOT EXISTS (SELECT 1 FROM profiles source WHERE source.id = ?2 AND source.account_id IS NULL '
            + 'AND NOT EXISTS (SELECT 1 FROM srs_events e WHERE e.profile_id = source.id) '
            + 'AND 1 = (SELECT COUNT(*) FROM profile_devices d WHERE d.profile_id = source.id AND d.revoked_at IS NULL) '
            + 'AND 1 = (SELECT COUNT(*) FROM sessions s WHERE s.profile_id = source.id AND s.revoked_at IS NULL)) '
            + 'AS blocked',
        ).bind(account.id, plan.profile_id).first<{ blocked: number }>();
        if (conflict?.blocked === 1) {
            return new AccountLinkFailure(
                409,
                'Pair or export this profile before linking the existing account.',
                'profile_conflict',
            );
        }
    }
    return new AccountLinkFailure(503, 'Academy account link could not be completed.', 'transaction_failed');
}

function accountLinkEntitlementFailure(error: unknown): AccountLinkFailure {
    if (error instanceof HttpError) {
        return new AccountLinkFailure(error.status, error.message, 'entitlement_conflict');
    }
    return new AccountLinkFailure(503, 'Academy account link could not be completed.', 'transaction_failed');
}

function isDiscriminatorCollision(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /UNIQUE constraint failed: accounts\.discriminator|accounts_discriminator/iu.test(message);
}

function isTransactionAssertion(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /malformed JSON|account-link-rollback/iu.test(message);
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
    return jsonResponse(await getAccountView(env, account));
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
    return jsonResponse(await getAccountView(env, updated));
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

/** Recovery must not adopt an account row left behind by an interrupted link. */
async function accountHasDurableBinding(env: Env, accountId: string): Promise<boolean> {
    const row = await env.ACADEMY_DB.prepare(
        'SELECT ('
        + 'EXISTS (SELECT 1 FROM accounts WHERE id = ?1 AND recovery_bound_at IS NOT NULL) '
        + 'OR EXISTS (SELECT 1 FROM profiles WHERE account_id = ?1) '
        + 'OR EXISTS (SELECT 1 FROM purchases WHERE redeemed_by_account_id = ?1 '
        + "AND status = 'paid' AND redeemed_at IS NOT NULL) "
        + ') AS recoverable',
    ).bind(accountId).first<{ recoverable: number }>();
    return row?.recoverable === 1;
}

export async function getAccountView(env: Env, account: AccountRow): Promise<Record<string, unknown>> {
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
