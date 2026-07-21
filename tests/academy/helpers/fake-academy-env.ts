import type { D1Database, D1PreparedStatement, D1Result, R2Bucket, R2ObjectBody, R2Range } from '../../../workers/yomu-academy/src/cf';
import type { Env } from '../../../workers/yomu-academy/src/env';

/**
 * In-memory doubles for the yomu-academy Worker's D1 schema and R2 bucket.
 * The fake D1 dispatches on the exact SQL text the Worker issues, so a query
 * the fake does not recognize fails the test loudly instead of passing vacuously.
 */

interface InviteRow {
    id: string;
    code_hash: string;
    uses_remaining: number;
    kind: string;
    created_at: number;
    expires_at: number | null;
    revoked_at: number | null;
    purchase_id: string | null;
    account_required: number;
    class_id?: string | null;
}

interface SessionRow {
    token_hash: string;
    public_id: string;
    invite_id: string;
    created_at: number;
    expires_at: number;
    offline_resume_until: number;
    revoked_at: number | null;
    account_id: string | null;
    profile_id: string | null;
    device_id: string | null;
}

interface PurchaseRow {
    id: string;
    claim_hash: string;
    checkout_session_id: string | null;
    amount_pence: number;
    status: string;
    created_at: number;
    fulfilled_at: number | null;
    invite_id: string | null;
    redeemed_by_account_id: string | null;
    redeemed_at: number | null;
}

interface AccountDbRow {
    id: string;
    public_id: string;
    google_sub_hash: string;
    display_name: string;
    name_chosen: number;
    discriminator: string;
    avatar_key: string | null;
    board_visible: number;
    share_avatar: number;
    created_at: number;
    updated_at: number;
    recovery_bound_at: number | null;
}

interface ClassDbRow { id: string; name: string; created_at: number; archived_at: number | null }
interface MembershipDbRow { class_id: string; account_id: string; role: 'learner' | 'sensei'; board_hidden: number; joined_at: number }
interface ProgressDbRow {
    known_word_count: number;
    reviews_completed: number;
    reviews_due: number;
    lessons_completed: number;
    lessons_total: number;
    updated_at: number;
}

interface ProfileDbRow {
    id: string;
    public_id: string;
    account_id: string | null;
    sync_key_version: number;
    created_at: number;
    updated_at: number;
}

interface ProfileDeviceDbRow {
    id: string;
    public_id: string;
    profile_id: string;
    created_at: number;
    last_seen_at: number;
    revoked_at: number | null;
}

function retainedProgressValue(current: number | undefined, incoming: unknown): number {
    return Math.max(current ?? 0, incoming as number);
}

class FakeAcademyDb implements D1Database {
    readonly invites: InviteRow[] = [];
    readonly sessions: SessionRow[] = [];
    readonly purchases: PurchaseRow[] = [];
    readonly webhookEvents = new Set<string>();
    readonly rateCounters = new Map<string, number>();
    readonly accounts: AccountDbRow[] = [];
    readonly classes: ClassDbRow[] = [];
    readonly memberships: MembershipDbRow[] = [];
    readonly oauthFlows: Array<{ state_hash: string; session_public_id: string; created_at: number; expires_at: number; consumed_at: number | null }> = [];
    readonly progressImports = new Map<string, { guard: string; received_at: number }>();
    readonly progress = new Map<string, ProgressDbRow>();
    readonly studyDays = new Set<string>();
    readonly profiles: ProfileDbRow[] = [];
    readonly profileDevices: ProfileDeviceDbRow[] = [];

    prepare(query: string): D1PreparedStatement {
        return new FakeStatement(this, query.replace(/\s+/g, ' ').trim());
    }

    async batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
        const results: D1Result<T>[] = [];
        for (const statement of statements) results.push(await statement.run<T>());
        return results;
    }
}

class FakeStatement implements D1PreparedStatement {
    private values: unknown[] = [];

    constructor(private readonly db: FakeAcademyDb, private readonly sql: string) {}

    bind(...values: unknown[]): D1PreparedStatement {
        this.values = values;
        return this;
    }

    async first<T>(): Promise<T | null> {
        const { results } = await this.run<T>();
        return results[0] ?? null;
    }

    async all<T>(): Promise<D1Result<T>> {
        return this.run<T>();
    }

    async run<T>(): Promise<D1Result<T>> {
        const rows = this.execute() as T[];
        return { results: rows, success: true, meta: { changes: this.lastChanges } };
    }

    private lastChanges = 0;

    private execute(): unknown[] {
        this.lastChanges = 0;

        const handlers = [
            this.executeRateLimitQuery,
            this.executeInviteQuery,
            this.executeSessionQuery,
            this.executePurchaseQuery,
            this.executeOauthQuery,
            this.executeAccountQuery,
            this.executeProfileQuery,
            this.executeClassQuery,
            this.executeProgressWriteQuery,
            this.executeProgressReadQuery,
        ];
        const result = this.executeFirstMatching(handlers);
        if (result !== undefined) return result;

        throw new Error(`FakeAcademyDb has no handler for SQL: ${this.sql}`);
    }

    private executeFirstMatching(
        handlers: ReadonlyArray<(this: FakeStatement) => unknown[] | undefined>,
    ): unknown[] | undefined {
        for (const handler of handlers) {
            const result = handler.call(this);
            if (result !== undefined) return result;
        }
        return undefined;
    }

    private executeRateLimitQuery(): unknown[] | undefined {
        const db = this.db;
        const sql = this.sql;
        const v = this.values;

        if (sql.startsWith('INSERT INTO rate_limits')) {
            const key = `${v[0]}|${v[1]}|${v[2]}`;
            const count = (db.rateCounters.get(key) ?? 0) + 1;
            db.rateCounters.set(key, count);
            this.lastChanges = 1;
            return [{ count }];
        }
        if (sql.startsWith('DELETE FROM rate_limits')) return [];
        return undefined;
    }

    private executeInviteQuery(): unknown[] | undefined {
        const db = this.db;
        const sql = this.sql;
        const v = this.values;

        if (sql.startsWith('UPDATE invites SET uses_remaining = uses_remaining - 1')) {
            const now = v[1] as number;
            const invite = db.invites.find(row =>
                row.code_hash === v[0] && row.uses_remaining > 0 && row.revoked_at === null
                && row.kind === 'seed'
                && (row.expires_at === null || row.expires_at > now));
            if (!invite) return [];
            invite.uses_remaining -= 1;
            this.lastChanges = 1;
            return [{ id: invite.id }];
        }
        if (sql.startsWith('INSERT INTO invites') && sql.includes('ON CONFLICT(id) DO NOTHING')) {
            if (db.invites.some(row => row.id === v[0])) return [];
            db.invites.push({
                id: v[0] as string,
                code_hash: v[1] as string,
                uses_remaining: 100_000,
                kind: 'seed',
                created_at: v[2] as number,
                expires_at: null,
                revoked_at: null,
                purchase_id: null,
                account_required: 1,
                class_id: null,
            });
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('INSERT INTO invites')) {
            const codeHash = v[1] as string;
            if (db.invites.some(row => row.code_hash === codeHash)) throw new Error('UNIQUE constraint failed: invites.code_hash');
            const accountRequired = v[7] === undefined ? 1 : v[7] as number;
            if (accountRequired === 0 && db.invites.some(row => row.account_required === 0)) {
                throw new Error('UNIQUE constraint failed: invites.account_required');
            }
            db.invites.push({
                id: v[0] as string,
                code_hash: codeHash,
                uses_remaining: v[2] as number,
                kind: v[3] as string,
                created_at: v[4] as number,
                expires_at: v[5] as number | null,
                revoked_at: null,
                purchase_id: v[6] as string | null,
                account_required: accountRequired,
                class_id: null,
            });
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('INSERT OR IGNORE INTO invites')) {
            const purchaseId = v[4] as string;
            const existing = db.invites.find(row => row.purchase_id === purchaseId || row.id === v[0] || row.code_hash === v[1]);
            if (existing) return [];
            db.invites.push({
                id: v[0] as string,
                code_hash: v[1] as string,
                uses_remaining: 1,
                kind: 'paid',
                created_at: v[2] as number,
                expires_at: v[3] as number,
                revoked_at: null,
                purchase_id: purchaseId,
                account_required: 1,
                class_id: null,
            });
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('UPDATE invites SET class_id')) {
            const invite = db.invites.find(row => row.code_hash === v[1] && row.revoked_at === null);
            if (!invite) return [];
            invite.class_id = v[0] as string;
            this.lastChanges = 1;
            return [];
        }
        return undefined;
    }

    private executeSessionQuery(): unknown[] | undefined {
        return this.executeFirstMatching([
            this.insertSessionFromInvite,
            this.insertSession,
            this.selectSession,
            this.revokeSession,
            this.linkSessionAccount,
        ]);
    }

    private insertSessionFromInvite(): unknown[] | undefined {
        if (!this.sql.startsWith('INSERT INTO sessions') || !this.sql.includes('SELECT')) return undefined;
        const v = this.values;
        const now = v[2] as number;
        const invite = this.db.invites.find(row => this.inviteAllowsSession(row, v[5], now));
        if (!invite) return [];
        this.db.sessions.push({
            token_hash: v[0] as string,
            public_id: v[1] as string,
            invite_id: invite.id,
            created_at: now,
            expires_at: v[3] as number,
            offline_resume_until: v[4] as number,
            revoked_at: null,
            account_id: null,
            profile_id: null,
            device_id: null,
        });
        this.lastChanges = 1;
        return [{ public_id: v[1] }];
    }

    private inviteAllowsSession(invite: InviteRow, codeHash: unknown, now: number): boolean {
        if (invite.code_hash !== codeHash) return false;
        if (invite.revoked_at !== null) return false;
        if (invite.kind === 'seed' && invite.uses_remaining <= 0) return false;
        if (invite.kind === 'paid') {
            const purchase = this.db.purchases.find(row => row.id === invite.purchase_id);
            if (purchase?.status !== 'paid') return false;
        }
        return this.inviteHasNotExpired(invite, now);
    }

    private inviteHasNotExpired(invite: InviteRow, now: number): boolean {
        return invite.expires_at === null || invite.expires_at > now;
    }

    private insertSession(): unknown[] | undefined {
        if (!this.sql.startsWith('INSERT INTO sessions')) return undefined;
        const v = this.values;
        this.db.sessions.push({
            token_hash: v[0] as string,
            public_id: v[1] as string,
            invite_id: v[2] as string,
            created_at: v[3] as number,
            expires_at: v[4] as number,
            offline_resume_until: v[5] as number,
            revoked_at: null,
            account_id: null,
            profile_id: null,
            device_id: null,
        });
        this.lastChanges = 1;
        return [];
    }

    private selectSession(): unknown[] | undefined {
        if (!this.sql.startsWith('SELECT s.public_id, s.invite_id, s.account_id, ')) return undefined;
        const v = this.values;
        const now = v[1] as number;
        const session = this.db.sessions.find(row => row.token_hash === v[0] && row.revoked_at === null && row.expires_at > now);
        return session
            ? [{
                public_id: session.public_id,
                invite_id: session.invite_id,
                account_id: session.account_id,
                expires_at: session.expires_at,
                offline_resume_until: session.offline_resume_until,
            }]
            : [];
    }

    private revokeSession(): unknown[] | undefined {
        if (!this.sql.startsWith('UPDATE sessions SET revoked_at')) return undefined;
        const session = this.db.sessions.find(row => row.token_hash === this.values[1] && row.revoked_at === null);
        if (session) {
            session.revoked_at = this.values[0] as number;
            this.lastChanges = 1;
        }
        return [];
    }

    private linkSessionAccount(): unknown[] | undefined {
        if (!this.sql.startsWith('UPDATE sessions SET account_id')) return undefined;
        const session = this.db.sessions.find(row => row.public_id === this.values[1] && row.revoked_at === null);
        if (session) {
            session.account_id = this.values[0] as string;
            this.lastChanges = 1;
        }
        return [];
    }

    private executePurchaseQuery(): unknown[] | undefined {
        return this.executeFirstMatching([
            this.insertPurchase,
            this.updatePurchaseCheckoutSession,
            this.insertWebhookEvent,
            this.markPurchasePaid,
            this.updatePurchaseInvite,
            this.selectPurchaseForClaim,
            this.selectSessionEntitlement,
            this.bindEntitlement,
            this.selectEntitlement,
        ]);
    }

    private insertPurchase(): unknown[] | undefined {
        const db = this.db;
        const sql = this.sql;
        const v = this.values;
        if (!sql.startsWith('INSERT INTO purchases')) return undefined;
        db.purchases.push({
            id: v[0] as string,
            claim_hash: v[1] as string,
            checkout_session_id: null,
            amount_pence: v[2] as number,
            status: 'pending',
            created_at: v[3] as number,
            fulfilled_at: null,
            invite_id: null,
            redeemed_by_account_id: null,
            redeemed_at: null,
        });
        this.lastChanges = 1;
        return [];
    }

    private updatePurchaseCheckoutSession(): unknown[] | undefined {
        if (!this.sql.startsWith('UPDATE purchases SET checkout_session_id')) return undefined;
        const purchase = this.db.purchases.find(row => row.id === this.values[1] && row.checkout_session_id === null);
        if (purchase) {
            purchase.checkout_session_id = this.values[0] as string;
            this.lastChanges = 1;
        }
        return [];
    }

    private insertWebhookEvent(): unknown[] | undefined {
        if (!this.sql.startsWith('INSERT OR IGNORE INTO webhook_events')) return undefined;
        const eventId = this.values[0] as string;
        if (this.db.webhookEvents.has(eventId)) return [];
        this.db.webhookEvents.add(eventId);
        this.lastChanges = 1;
        return [];
    }

    private markPurchasePaid(): unknown[] | undefined {
        if (!this.sql.startsWith("UPDATE purchases SET status = 'paid'")) return undefined;
        const v = this.values;
        const purchase = this.db.purchases.find(row =>
            row.id === v[1]
            && row.checkout_session_id === v[2]
            && row.amount_pence === v[3]
            && (row.status === 'pending' || row.status === 'paid'));
        if (!purchase) return [];
        purchase.status = 'paid';
        purchase.fulfilled_at ??= v[0] as number;
        this.lastChanges = 1;
        return [{ id: purchase.id }];
    }

    private updatePurchaseInvite(): unknown[] | undefined {
        if (!this.sql.startsWith('UPDATE purchases SET invite_id')) return undefined;
        const purchase = this.db.purchases.find(row => row.id === this.values[1]);
        if (purchase) {
            purchase.invite_id ??= this.values[0] as string;
            this.lastChanges = 1;
        }
        return [];
    }

    private selectPurchaseForClaim(): unknown[] | undefined {
        if (!this.sql.startsWith('SELECT id, status, invite_id FROM purchases')) return undefined;
        const v = this.values;
        const cutoff = v[2] as number;
        const purchase = this.db.purchases.find(row =>
            row.claim_hash === v[0] && row.checkout_session_id === v[1] && row.created_at > cutoff);
        return purchase ? [{ id: purchase.id, status: purchase.status, invite_id: purchase.invite_id }] : [];
    }

    private selectSessionEntitlement(): unknown[] | undefined {
        if (!this.sql.startsWith('SELECT i.kind AS invite_kind')) return undefined;
        const invite = this.db.invites.find(row => row.id === this.values[0]);
        if (!invite) return [];
        const purchase = this.db.purchases.find(row => row.id === invite.purchase_id);
        return [{
            invite_kind: invite.kind,
            id: purchase?.id ?? null,
            status: purchase?.status ?? null,
            amount_pence: purchase?.amount_pence ?? null,
            fulfilled_at: purchase?.fulfilled_at ?? null,
            redeemed_by_account_id: purchase?.redeemed_by_account_id ?? null,
            redeemed_at: purchase?.redeemed_at ?? null,
        }];
    }

    private bindEntitlement(): unknown[] | undefined {
        if (!this.sql.startsWith('UPDATE purchases SET redeemed_by_account_id')) return undefined;
        const accountId = this.values[0] as string;
        const purchaseId = this.values[2] as string;
        const purchase = this.db.purchases.find(row => row.id === purchaseId && row.status === 'paid');
        const accountAlreadyBound = this.db.purchases.some(row => row.id !== purchaseId && row.redeemed_by_account_id === accountId);
        if (!purchase || purchase.redeemed_at !== null || purchase.redeemed_by_account_id !== null || accountAlreadyBound) return [];
        purchase.redeemed_by_account_id = accountId;
        purchase.redeemed_at = this.values[1] as number;
        this.lastChanges = 1;
        return [{ ...purchase }];
    }

    private selectEntitlement(): unknown[] | undefined {
        const prefix = 'SELECT id, status, amount_pence, fulfilled_at, redeemed_by_account_id, redeemed_at FROM purchases WHERE';
        if (!this.sql.startsWith(prefix)) return undefined;
        const purchase = this.sql.endsWith('WHERE id = ?1')
            ? this.db.purchases.find(row => row.id === this.values[0])
            : this.db.purchases.find(row => row.redeemed_by_account_id === this.values[0]);
        return purchase ? [{ ...purchase }] : [];
    }

    private executeOauthQuery(): unknown[] | undefined {
        const db = this.db;
        const sql = this.sql;
        const v = this.values;

        if (sql.startsWith('DELETE FROM oauth_flows')) {
            const before = db.oauthFlows.length;
            db.oauthFlows.splice(0, db.oauthFlows.length, ...db.oauthFlows.filter(row =>
                row.expires_at > (v[0] as number)
                && (row.consumed_at === null || row.consumed_at > (v[1] as number))));
            this.lastChanges = before - db.oauthFlows.length;
            return [];
        }
        if (sql.startsWith('INSERT INTO oauth_flows')) {
            db.oauthFlows.push({
                state_hash: v[0] as string,
                session_public_id: v[1] as string,
                created_at: v[2] as number,
                expires_at: v[3] as number,
                consumed_at: null,
            });
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('UPDATE oauth_flows SET consumed_at')) {
            const flow = db.oauthFlows.find(row =>
                row.state_hash === v[1] && row.session_public_id === v[2]
                && row.consumed_at === null && row.expires_at > (v[0] as number));
            if (!flow) return [];
            flow.consumed_at = v[0] as number;
            this.lastChanges = 1;
            return [{ state_hash: flow.state_hash }];
        }
        return undefined;
    }

    private executeAccountQuery(): unknown[] | undefined {
        const db = this.db;
        const sql = this.sql;
        const v = this.values;

        if (sql.startsWith('SELECT id, public_id, display_name, name_chosen, discriminator, avatar_key, board_visible, share_avatar FROM accounts WHERE google_sub_hash')) {
            const account = db.accounts.find(row => row.google_sub_hash === v[0]);
            return account ? [{ ...account }] : [];
        }
        if (sql.startsWith('SELECT id, public_id, display_name, name_chosen, discriminator, avatar_key, board_visible, share_avatar FROM accounts WHERE id')) {
            const account = db.accounts.find(row => row.id === v[0]);
            return account ? [{ ...account }] : [];
        }
        if (sql.startsWith('SELECT id FROM accounts WHERE id')) {
            const account = db.accounts.find(row => row.id === v[0]);
            return account ? [{ id: account.id }] : [];
        }
        if (sql.startsWith('SELECT (EXISTS (SELECT 1 FROM accounts WHERE id')) {
            const accountId = v[0] as string;
            const account = db.accounts.find(row => row.id === accountId);
            const recoverable = Boolean(account && (
                account.recovery_bound_at !== null
                || db.profiles.some(row => row.account_id === accountId)
                || db.purchases.some(row => row.redeemed_by_account_id === accountId
                    && row.status === 'paid' && row.redeemed_at !== null)
            ));
            return [{ recoverable: recoverable ? 1 : 0 }];
        }
        if (sql.startsWith('INSERT INTO accounts')) {
            if (db.accounts.some(row => row.google_sub_hash === v[2] || row.discriminator === v[3])) {
                throw new Error('UNIQUE constraint failed: accounts');
            }
            db.accounts.push({
                id: v[0] as string,
                public_id: v[1] as string,
                google_sub_hash: v[2] as string,
                display_name: 'Learner',
                name_chosen: 0,
                discriminator: v[3] as string,
                avatar_key: null,
                board_visible: 0,
                share_avatar: 0,
                created_at: v[4] as number,
                updated_at: v[4] as number,
                recovery_bound_at: null,
            });
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('UPDATE accounts SET display_name')) {
            const account = db.accounts.find(row => row.id === v[6]);
            if (!account) return [];
            account.display_name = v[0] as string;
            account.name_chosen = v[1] as number;
            account.avatar_key = v[2] as string | null;
            account.board_visible = v[3] as number;
            account.share_avatar = v[4] as number;
            account.updated_at = v[5] as number;
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('UPDATE accounts SET recovery_bound_at')) {
            const account = db.accounts.find(row => row.id === v[0]);
            const session = db.sessions.find(row =>
                row.public_id === v[1] && row.account_id === v[0] && row.revoked_at === null);
            const profile = session?.profile_id
                ? db.profiles.find(row => row.id === session.profile_id && row.account_id === v[0])
                : undefined;
            if (!account || !profile) return [];
            account.recovery_bound_at ??= v[2] as number;
            this.lastChanges = 1;
            return [];
        }
        return undefined;
    }

    private executeProfileQuery(): unknown[] | undefined {
        const db = this.db;
        const sql = this.sql;
        const v = this.values;

        if (sql.startsWith('SELECT p.id AS profile_id, p.public_id AS profile_public_id')) {
            const session = db.sessions.find(row => row.public_id === v[0] && row.revoked_at === null);
            const profile = session?.profile_id ? db.profiles.find(row => row.id === session.profile_id) : undefined;
            const device = session?.device_id ? db.profileDevices.find(row =>
                row.id === session.device_id && row.profile_id === profile?.id && row.revoked_at === null) : undefined;
            if (!profile || !device) return [];
            const account = profile.account_id ? db.accounts.find(row => row.id === profile.account_id) : undefined;
            return [{
                profile_id: profile.id,
                profile_public_id: profile.public_id,
                account_id: profile.account_id,
                account_public_id: account?.public_id ?? null,
                sync_key_version: profile.sync_key_version,
                profile_created_at: profile.created_at,
                profile_updated_at: profile.updated_at,
                device_id: device.id,
                device_public_id: device.public_id,
                device_created_at: device.created_at,
                device_last_seen_at: device.last_seen_at,
                device_revoked_at: device.revoked_at,
            }];
        }
        if (sql.startsWith('INSERT INTO profiles (id, public_id, account_id, sync_key_version')) {
            const session = db.sessions.find(row => row.public_id === v[3] && row.revoked_at === null && row.profile_id === null && row.device_id === null);
            if (!session) return [];
            db.profiles.push({
                id: v[0] as string,
                public_id: v[1] as string,
                account_id: null,
                sync_key_version: 1,
                created_at: v[2] as number,
                updated_at: v[2] as number,
            });
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('INSERT INTO profile_devices')) {
            if (!db.profiles.some(row => row.id === v[2])) return [];
            db.profileDevices.push({
                id: v[0] as string,
                public_id: v[1] as string,
                profile_id: v[2] as string,
                created_at: v[3] as number,
                last_seen_at: v[3] as number,
                revoked_at: null,
            });
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('UPDATE sessions SET profile_id = ?1, device_id = ?2')) {
            const session = db.sessions.find(row => row.public_id === v[2] && row.revoked_at === null && row.profile_id === null && row.device_id === null);
            if (!session) return [];
            session.profile_id = v[0] as string;
            session.device_id = v[1] as string;
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('SELECT id, public_id, account_id, sync_key_version, created_at, updated_at FROM profiles WHERE account_id')) {
            const profile = db.profiles.find(row => row.account_id === v[0]);
            return profile ? [{ ...profile }] : [];
        }
        if (sql.startsWith('UPDATE profiles SET account_id') || sql.startsWith('UPDATE OR IGNORE profiles SET account_id')) {
            const profile = db.profiles.find(row => row.id === v[2] && (row.account_id === null || row.account_id === v[0]));
            if (!profile) return [];
            profile.account_id = v[0] as string;
            profile.updated_at = v[1] as number;
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('SELECT p.account_id, (SELECT COUNT(*) FROM srs_events')) {
            const profile = db.profiles.find(row => row.id === v[0]);
            return profile ? [{ account_id: profile.account_id, event_count: 0, device_count: 1, session_count: 1 }] : [];
        }
        return undefined;
    }

    private executeClassQuery(): unknown[] | undefined {
        return this.executeFirstMatching([
            this.insertInvitedClassMembership,
            this.selectAccountClasses,
            this.upsertClass,
            this.updateClassMembershipRole,
            this.selectClassMembership,
            this.updateClassBoardVisibility,
        ]);
    }

    private insertInvitedClassMembership(): unknown[] | undefined {
        const sql = this.sql;
        if (!sql.startsWith('INSERT OR IGNORE INTO class_memberships') || !sql.includes('SELECT i.class_id')) return undefined;
        const v = this.values;
        const session = this.db.sessions.find(row => row.public_id === v[1]);
        const invite = session ? this.db.invites.find(row => row.id === session.invite_id) : undefined;
        if (!invite?.class_id || this.db.memberships.some(row => row.class_id === invite.class_id && row.account_id === v[0])) return [];
        this.db.memberships.push({ class_id: invite.class_id, account_id: v[0] as string, role: 'learner', board_hidden: 0, joined_at: v[2] as number });
        this.lastChanges = 1;
        return [];
    }

    private selectAccountClasses(): unknown[] | undefined {
        if (!this.sql.startsWith('SELECT m.class_id, c.name, m.role, m.board_hidden FROM class_memberships')) return undefined;
        return this.db.memberships.filter(row => row.account_id === this.values[0]).flatMap(row => {
            const klass = this.db.classes.find(item => item.id === row.class_id && item.archived_at === null);
            return klass ? [{ class_id: row.class_id, name: klass.name, role: row.role, board_hidden: row.board_hidden }] : [];
        });
    }

    private upsertClass(): unknown[] | undefined {
        if (!this.sql.startsWith('INSERT INTO classes')) return undefined;
        const v = this.values;
        const existing = this.db.classes.find(row => row.id === v[0]);
        if (existing) {
            existing.name = v[1] as string;
            existing.archived_at = null;
        } else {
            this.db.classes.push({ id: v[0] as string, name: v[1] as string, created_at: v[2] as number, archived_at: null });
        }
        this.lastChanges = 1;
        return [];
    }

    private updateClassMembershipRole(): unknown[] | undefined {
        if (!this.sql.startsWith('UPDATE class_memberships SET role')) return undefined;
        const v = this.values;
        const account = this.db.accounts.find(row => row.public_id === v[2]);
        const membership = account ? this.db.memberships.find(row => row.class_id === v[1] && row.account_id === account.id) : undefined;
        if (!membership) return [];
        membership.role = v[0] as 'learner' | 'sensei';
        this.lastChanges = 1;
        return [];
    }

    private selectClassMembership(): unknown[] | undefined {
        if (!this.sql.startsWith('SELECT m.role, m.board_hidden FROM class_memberships')) return undefined;
        const v = this.values;
        const membership = this.db.memberships.find(row => row.class_id === v[0] && row.account_id === v[1]);
        const klass = membership ? this.db.classes.find(row => row.id === membership.class_id && row.archived_at === null) : undefined;
        return membership && klass ? [{ role: membership.role, board_hidden: membership.board_hidden }] : [];
    }

    private updateClassBoardVisibility(): unknown[] | undefined {
        if (!this.sql.startsWith('UPDATE class_memberships SET board_hidden')) return undefined;
        const v = this.values;
        const account = this.db.accounts.find(row => row.public_id === v[3]);
        const membership = account ? this.db.memberships.find(row => row.class_id === v[1] && row.account_id === account.id && row.role === v[2]) : undefined;
        if (!membership) return [];
        membership.board_hidden = v[0] as number;
        this.lastChanges = 1;
        return [];
    }

    private executeProgressWriteQuery(): unknown[] | undefined {
        return this.executeFirstMatching([
            this.insertProgressImport,
            this.insertStudyDay,
            this.upsertProgressSnapshot,
        ]);
    }

    private insertProgressImport(): unknown[] | undefined {
        if (!this.sql.startsWith('INSERT OR IGNORE INTO progress_imports')) return undefined;
        const v = this.values;
        const key = `${v[0]}|${v[1]}`;
        if (this.db.progressImports.has(key)) return [];
        this.db.progressImports.set(key, { guard: v[2] as string, received_at: v[3] as number });
        this.lastChanges = 1;
        return [];
    }

    private insertStudyDay(): unknown[] | undefined {
        if (!this.sql.startsWith('INSERT OR IGNORE INTO study_days')) return undefined;
        const v = this.values;
        const imported = this.db.progressImports.get(`${v[0]}|${v[2]}`);
        if (!imported || imported.guard !== v[3]) return [];
        const key = `${v[0]}|${v[1]}`;
        if (this.db.studyDays.has(key)) return [];
        this.db.studyDays.add(key);
        this.lastChanges = 1;
        return [];
    }

    private upsertProgressSnapshot(): unknown[] | undefined {
        if (!this.sql.startsWith('INSERT INTO progress_snapshots')) return undefined;
        const v = this.values;
        const imported = this.db.progressImports.get(`${v[0]}|${v[7]}`);
        if (!imported || imported.guard !== v[8]) return [];
        const current = this.db.progress.get(v[0] as string);
        this.db.progress.set(v[0] as string, {
            known_word_count: retainedProgressValue(current?.known_word_count, v[1]),
            reviews_completed: retainedProgressValue(current?.reviews_completed, v[2]),
            reviews_due: v[3] as number,
            lessons_completed: retainedProgressValue(current?.lessons_completed, v[4]),
            lessons_total: retainedProgressValue(current?.lessons_total, v[5]),
            updated_at: v[6] as number,
        });
        this.lastChanges = 1;
        return [];
    }

    private executeProgressReadQuery(): unknown[] | undefined {
        const db = this.db;
        const sql = this.sql;
        const v = this.values;

        if (sql.startsWith('SELECT a.id, a.public_id, a.display_name, a.discriminator')) {
            return db.memberships.filter(row => row.class_id === v[0] && row.board_hidden === 0).flatMap(membership => {
                const account = db.accounts.find(row => row.id === membership.account_id && row.board_visible === 1);
                if (!account) return [];
                const progress = db.progress.get(account.id);
                return [{
                    id: account.id,
                    public_id: account.public_id,
                    display_name: account.display_name,
                    discriminator: account.discriminator,
                    avatar_key: account.avatar_key,
                    share_avatar: account.share_avatar,
                    role: membership.role,
                    known_word_count: progress?.known_word_count ?? 0,
                    reviews_completed: progress?.reviews_completed ?? 0,
                    reviews_due: progress?.reviews_due ?? 0,
                    lessons_completed: progress?.lessons_completed ?? 0,
                    lessons_total: progress?.lessons_total ?? 0,
                }];
            });
        }
        if (sql.startsWith('SELECT study_date FROM study_days')) {
            return [...db.studyDays]
                .filter(key => key.startsWith(`${v[0]}|`))
                .map(key => ({ study_date: key.slice(String(v[0]).length + 1) }))
                .sort((a, b) => a.study_date.localeCompare(b.study_date));
        }
        return undefined;
    }
}

class FakeR2Bucket implements R2Bucket {
    private readonly objects = new Map<string, Uint8Array>();

    put(key: string, bytes: Uint8Array): void {
        this.objects.set(key, bytes);
    }

    async get(key: string, options?: { range?: R2Range }): Promise<R2ObjectBody | null> {
        const bytes = this.objects.get(key);
        if (!bytes) return null;
        const slice = options?.range
            ? bytes.slice(options.range.offset, options.range.offset + options.range.length)
            : bytes;
        return {
            key,
            size: bytes.length,
            httpEtag: `"fake-${key}"`,
            body: new Blob([slice as BlobPart]).stream(),
        };
    }

    async head(key: string): Promise<Omit<R2ObjectBody, 'body'> | null> {
        const bytes = this.objects.get(key);
        return bytes ? { key, size: bytes.length, httpEtag: `"fake-${key}"` } : null;
    }
}

export interface FakeAcademy {
    readonly env: Env;
    readonly db: FakeAcademyDb;
    readonly bucket: FakeR2Bucket;
}

export function createFakeAcademy(overrides: Partial<Env> = {}): FakeAcademy {
    const db = new FakeAcademyDb();
    const bucket = new FakeR2Bucket();
    const env: Env = {
        ACADEMY_DB: db,
        ACADEMY_MEDIA: bucket,
        ACADEMY_ORIGIN: 'https://yomureader.com',
        ACADEMY_INVITE_HMAC_KEY: 'test-invite-hmac-key',
        ACADEMY_RATE_HMAC_KEY: 'test-rate-hmac-key',
        ACADEMY_ADMIN_TOKEN: 'test-admin-token',
        GOOGLE_OIDC_CLIENT_ID: 'test.apps.googleusercontent.com',
        GOOGLE_OIDC_CLIENT_SECRET: 'test-google-client-secret',
        ...overrides,
    };
    return { env, db, bucket };
}

/** Build a same-origin browser JSON request against the Worker. */
export function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
    return new Request(`https://yomureader.com${path}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            origin: 'https://yomureader.com',
            'sec-fetch-site': 'same-origin',
            'cf-connecting-ip': '203.0.113.7',
            ...headers,
        },
        body: JSON.stringify(body),
    });
}
