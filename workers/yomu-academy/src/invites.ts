import { derivePaidInviteCode, hmacSha256Hex, randomToken, timingSafeEqual } from './crypto';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody } from './http';

const INVITE_CODE_PATTERN = /^[A-Z0-9-]{7,64}$/;
const PAID_INVITE_TTL_MS = 30 * 24 * 60 * 60_000;

export function normalizeInviteCode(raw: unknown): string {
    if (typeof raw !== 'string') throw new HttpError(400, 'Invitation code is required.');
    const normalized = raw.normalize('NFKC').trim().toUpperCase().replaceAll(/\s+/g, '');
    if (!INVITE_CODE_PATTERN.test(normalized)) throw new HttpError(400, 'Invitation code is malformed.');
    return normalized;
}

export async function inviteCodeHash(env: Env, code: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `invite:${code}`);
}

interface CreateInviteRow {
    readonly id: string;
    readonly codeHash: string;
    readonly usesRemaining: number;
    readonly kind: 'seed' | 'paid';
    readonly createdAt: number;
    readonly expiresAt: number | null;
    readonly purchaseId: string | null;
    readonly accountRequired: boolean;
}

interface ExistingInviteRow {
    readonly id: string;
    readonly uses_remaining: number;
    readonly expires_at: number | null;
}

async function insertInvite(env: Env, row: CreateInviteRow): Promise<void> {
    await env.ACADEMY_DB
        .prepare(
            'INSERT INTO invites (id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id, account_required) '
            + 'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
        )
        .bind(
            row.id, row.codeHash, row.usesRemaining, row.kind, row.createdAt,
            row.expiresAt, row.purchaseId, row.accountRequired ? 1 : 0,
        )
        .run();
}

/** Mint the deterministic single-use invite for a paid purchase. */
export async function mintPaidInvite(env: Env, purchaseId: string, now: number): Promise<string> {
    const code = await derivePaidInviteCode(env.ACADEMY_INVITE_HMAC_KEY, purchaseId);
    const inviteId = `paid_${(await hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `paid-invite-id:${purchaseId}`)).slice(0, 40)}`;
    await env.ACADEMY_DB.prepare(
        'INSERT OR IGNORE INTO invites '
        + '(id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id, account_required) '
        + "VALUES (?1, ?2, 1, 'paid', ?3, ?4, ?5, 1)",
    ).bind(inviteId, await inviteCodeHash(env, code), now, now + PAID_INVITE_TTL_MS, purchaseId).run();
    return inviteId;
}

/**
 * POST /academy/api/admin/invites — bearer-authenticated invite creation.
 * A known code is sent in the request body and only its HMAC persists; with no
 * code supplied, a random one is generated and returned exactly once. The
 * administrator may designate the database's single account-free invite.
 */
export async function handleAdminCreateInvite(request: Request, env: Env, clock: Clock): Promise<Response> {
    await requireAdmin(request, env);
    const body = await readJsonBody(request);
    if (Object.keys(body).some(key => !['code', 'uses', 'expiresAt', 'accountRequired'].includes(key))) {
        throw new HttpError(400, 'Invite request contains unknown fields.');
    }

    const generated = body.code === undefined ? randomInviteCode() : null;
    const code = generated ?? normalizeInviteCode(body.code);
    const uses = readUses(body.uses);
    const expiresAt = readExpiry(body.expiresAt, clock());
    const accountRequired = readAccountRequired(body.accountRequired);

    const inviteId = crypto.randomUUID();
    try {
        await insertInvite(env, {
            id: inviteId,
            codeHash: await inviteCodeHash(env, code),
            usesRemaining: uses,
            kind: 'seed',
            createdAt: clock(),
            expiresAt,
            purchaseId: null,
            accountRequired,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/UNIQUE constraint failed|idx_invites_single_anonymous/iu.test(message)) throw error;
        if (!accountRequired && body.code !== undefined) {
            try {
                const existing = await designateExistingAnonymousInvite(env, code);
                if (existing) {
                    return jsonResponse({
                        inviteId: existing.id,
                        uses: existing.uses_remaining,
                        expiresAt: existing.expires_at,
                    }, 200);
                }
            } catch (designationError) {
                const designationMessage = designationError instanceof Error
                    ? designationError.message
                    : String(designationError);
                if (!/UNIQUE constraint failed|idx_invites_single_anonymous/iu.test(designationMessage)) {
                    throw designationError;
                }
            }
        }
        throw new HttpError(409, 'Invitation conflicts with an existing invite.');
    }
    return jsonResponse({ inviteId, uses, expiresAt, ...(generated ? { code: generated } : {}) }, 201);
}

async function designateExistingAnonymousInvite(env: Env, code: string): Promise<ExistingInviteRow | null> {
    return env.ACADEMY_DB.prepare(
        'UPDATE invites SET account_required = 0 '
        + "WHERE code_hash = ?1 AND kind = 'seed' AND revoked_at IS NULL "
        + 'RETURNING id, uses_remaining, expires_at',
    ).bind(await inviteCodeHash(env, code)).first<ExistingInviteRow>();
}

export async function requireAdmin(request: Request, env: Env): Promise<void> {
    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!env.ACADEMY_ADMIN_TOKEN || !token || !(await timingSafeEqual(token, env.ACADEMY_ADMIN_TOKEN))) {
        throw new HttpError(401, 'Admin authorization required.');
    }
}

function randomInviteCode(): string {
    return `YOMU-${randomToken(12).toUpperCase().replaceAll(/[^A-Z0-9]/g, 'X').slice(0, 12)}`;
}

function readUses(value: unknown): number {
    if (value === undefined) return 1;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 100_000) {
        throw new HttpError(400, 'uses must be an integer between 1 and 100000.');
    }
    return value;
}

function readExpiry(value: unknown, now: number): number | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= now) {
        throw new HttpError(400, 'expiresAt must be a future epoch-milliseconds timestamp.');
    }
    return value;
}

function readAccountRequired(value: unknown): boolean {
    if (value === undefined) return true;
    if (typeof value !== 'boolean') throw new HttpError(400, 'accountRequired must be true or false.');
    return value;
}
