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
            this.executeClassQuery,
            this.executeProgressWriteQuery,
            this.executeProgressReadQuery,
        ];
        for (const handler of handlers) {
            const result = handler.call(this);
            if (result !== undefined) return result;
        }

        throw new Error(`FakeAcademyDb has no handler for SQL: ${this.sql}`);
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
                && (row.expires_at === null || row.expires_at > now));
            if (!invite) return [];
            invite.uses_remaining -= 1;
            this.lastChanges = 1;
            return [{ id: invite.id }];
        }
        if (sql.startsWith('INSERT INTO invites')) {
            const codeHash = v[1] as string;
            if (db.invites.some(row => row.code_hash === codeHash)) throw new Error('UNIQUE constraint failed: invites.code_hash');
            db.invites.push({
                id: v[0] as string,
                code_hash: codeHash,
                uses_remaining: v[2] as number,
                kind: v[3] as string,
                created_at: v[4] as number,
                expires_at: v[5] as number | null,
                revoked_at: null,
                purchase_id: v[6] as string | null,
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
        const db = this.db;
        const sql = this.sql;
        const v = this.values;

        if (sql.startsWith('INSERT INTO sessions') && sql.includes('SELECT')) {
            const now = v[2] as number;
            const invite = db.invites.find(row =>
                row.code_hash === v[5] && row.uses_remaining > 0 && row.revoked_at === null
                && (row.expires_at === null || row.expires_at > now));
            if (!invite) return [];
            db.sessions.push({
                token_hash: v[0] as string,
                public_id: v[1] as string,
                invite_id: invite.id,
                created_at: now,
                expires_at: v[3] as number,
                offline_resume_until: v[4] as number,
                revoked_at: null,
                account_id: null,
            });
            this.lastChanges = 1;
            return [{ public_id: v[1] }];
        }
        if (sql.startsWith('INSERT INTO sessions')) {
            db.sessions.push({
                token_hash: v[0] as string,
                public_id: v[1] as string,
                invite_id: v[2] as string,
                created_at: v[3] as number,
                expires_at: v[4] as number,
                offline_resume_until: v[5] as number,
                revoked_at: null,
                account_id: null,
            });
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('SELECT public_id, invite_id, account_id, expires_at, offline_resume_until FROM sessions')) {
            const now = v[1] as number;
            const session = db.sessions.find(row => row.token_hash === v[0] && row.revoked_at === null && row.expires_at > now);
            return session
                ? [{ public_id: session.public_id, invite_id: session.invite_id, account_id: session.account_id, expires_at: session.expires_at, offline_resume_until: session.offline_resume_until }]
                : [];
        }
        if (sql.startsWith('UPDATE sessions SET revoked_at')) {
            const session = db.sessions.find(row => row.token_hash === v[1] && row.revoked_at === null);
            if (session) {
                session.revoked_at = v[0] as number;
                this.lastChanges = 1;
            }
            return [];
        }
        if (sql.startsWith('UPDATE sessions SET account_id')) {
            const session = db.sessions.find(row => row.public_id === v[1] && row.revoked_at === null);
            if (session) {
                session.account_id = v[0] as string;
                this.lastChanges = 1;
            }
            return [];
        }
        return undefined;
    }

    private executePurchaseQuery(): unknown[] | undefined {
        const db = this.db;
        const sql = this.sql;
        const v = this.values;

        if (sql.startsWith('INSERT INTO purchases')) {
            db.purchases.push({
                id: v[0] as string,
                claim_hash: v[1] as string,
                checkout_session_id: null,
                amount_pence: v[2] as number,
                status: 'pending',
                created_at: v[3] as number,
                fulfilled_at: null,
                invite_id: null,
            });
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('UPDATE purchases SET checkout_session_id')) {
            const purchase = db.purchases.find(row => row.id === v[1] && row.checkout_session_id === null);
            if (purchase) {
                purchase.checkout_session_id = v[0] as string;
                this.lastChanges = 1;
            }
            return [];
        }
        if (sql.startsWith('INSERT OR IGNORE INTO webhook_events')) {
            const eventId = v[0] as string;
            if (db.webhookEvents.has(eventId)) return [];
            db.webhookEvents.add(eventId);
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith("UPDATE purchases SET status = 'paid'")) {
            const purchase = db.purchases.find(row =>
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
        if (sql.startsWith('UPDATE purchases SET invite_id')) {
            const purchase = db.purchases.find(row => row.id === v[1]);
            if (purchase) {
                purchase.invite_id ??= v[0] as string;
                this.lastChanges = 1;
            }
            return [];
        }
        if (sql.startsWith('SELECT id, status, invite_id FROM purchases')) {
            const cutoff = v[2] as number;
            const purchase = db.purchases.find(row =>
                row.claim_hash === v[0] && row.checkout_session_id === v[1] && row.created_at > cutoff);
            return purchase ? [{ id: purchase.id, status: purchase.status, invite_id: purchase.invite_id }] : [];
        }
        return undefined;
    }

    private executeOauthQuery(): unknown[] | undefined {
        const db = this.db;
        const sql = this.sql;
        const v = this.values;

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
        return undefined;
    }

    private executeClassQuery(): unknown[] | undefined {
        const db = this.db;
        const sql = this.sql;
        const v = this.values;

        if (sql.startsWith('INSERT OR IGNORE INTO class_memberships') && sql.includes('SELECT i.class_id')) {
            const session = db.sessions.find(row => row.public_id === v[1]);
            const invite = session ? db.invites.find(row => row.id === session.invite_id) : undefined;
            if (!invite?.class_id || db.memberships.some(row => row.class_id === invite.class_id && row.account_id === v[0])) return [];
            db.memberships.push({ class_id: invite.class_id, account_id: v[0] as string, role: 'learner', board_hidden: 0, joined_at: v[2] as number });
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('SELECT m.class_id, c.name, m.role, m.board_hidden FROM class_memberships')) {
            return db.memberships.filter(row => row.account_id === v[0]).flatMap(row => {
                const klass = db.classes.find(item => item.id === row.class_id && item.archived_at === null);
                return klass ? [{ class_id: row.class_id, name: klass.name, role: row.role, board_hidden: row.board_hidden }] : [];
            });
        }
        if (sql.startsWith('INSERT INTO classes')) {
            const existing = db.classes.find(row => row.id === v[0]);
            if (existing) {
                existing.name = v[1] as string;
                existing.archived_at = null;
            } else {
                db.classes.push({ id: v[0] as string, name: v[1] as string, created_at: v[2] as number, archived_at: null });
            }
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('UPDATE class_memberships SET role')) {
            const account = db.accounts.find(row => row.public_id === v[2]);
            const membership = account ? db.memberships.find(row => row.class_id === v[1] && row.account_id === account.id) : undefined;
            if (!membership) return [];
            membership.role = v[0] as 'learner' | 'sensei';
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('SELECT m.role, m.board_hidden FROM class_memberships')) {
            const membership = db.memberships.find(row => row.class_id === v[0] && row.account_id === v[1]);
            const klass = membership ? db.classes.find(row => row.id === membership.class_id && row.archived_at === null) : undefined;
            return membership && klass ? [{ role: membership.role, board_hidden: membership.board_hidden }] : [];
        }
        if (sql.startsWith('UPDATE class_memberships SET board_hidden')) {
            const account = db.accounts.find(row => row.public_id === v[3]);
            const membership = account ? db.memberships.find(row => row.class_id === v[1] && row.account_id === account.id && row.role === v[2]) : undefined;
            if (!membership) return [];
            membership.board_hidden = v[0] as number;
            this.lastChanges = 1;
            return [];
        }
        return undefined;
    }

    private executeProgressWriteQuery(): unknown[] | undefined {
        const db = this.db;
        const sql = this.sql;
        const v = this.values;

        if (sql.startsWith('INSERT OR IGNORE INTO progress_imports')) {
            const key = `${v[0]}|${v[1]}`;
            if (db.progressImports.has(key)) return [];
            db.progressImports.set(key, { guard: v[2] as string, received_at: v[3] as number });
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('INSERT OR IGNORE INTO study_days')) {
            const imported = db.progressImports.get(`${v[0]}|${v[2]}`);
            if (!imported || imported.guard !== v[3]) return [];
            const key = `${v[0]}|${v[1]}`;
            if (db.studyDays.has(key)) return [];
            db.studyDays.add(key);
            this.lastChanges = 1;
            return [];
        }
        if (sql.startsWith('INSERT INTO progress_snapshots')) {
            const imported = db.progressImports.get(`${v[0]}|${v[7]}`);
            if (!imported || imported.guard !== v[8]) return [];
            const current = db.progress.get(v[0] as string);
            db.progress.set(v[0] as string, {
                known_word_count: Math.max(current?.known_word_count ?? 0, v[1] as number),
                reviews_completed: Math.max(current?.reviews_completed ?? 0, v[2] as number),
                reviews_due: v[3] as number,
                lessons_completed: Math.max(current?.lessons_completed ?? 0, v[4] as number),
                lessons_total: Math.max(current?.lessons_total ?? 0, v[5] as number),
                updated_at: v[6] as number,
            });
            this.lastChanges = 1;
            return [];
        }
        return undefined;
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
        STRIPE_SECRET_KEY: 'sk_live_fake',
        STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
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
