const ACADEMY_PREFIX = "/academy";
const API_PREFIX = "/academy/api";
const ARCHIVE_PREFIX = "/academy/archive/";
// R2 objects are uploaded under this prefix by scripts/upload-academy-archive.mjs
// (`raw/<relpath>`). The request path exposes only the logical relpath, so the
// worker re-applies the prefix when resolving the storage key.
const ARCHIVE_OBJECT_PREFIX = "raw/";
const LOGIN_PATH = "/academy/login";
const CHECKOUT_SUCCESS_PATH = "/academy/checkout/success";
const SESSION_COOKIE = "__Host-yomu_academy_session";
const CHECKOUT_COOKIE = "__Host-yomu_academy_checkout";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const CLASS_INVITE_DEFAULT_TTL_DAYS = 90;
const CLASS_INVITE_MAX_TTL_DAYS = 3650;
const CHECKOUT_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
const PAID_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STRIPE_WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;
const RATE_LIMIT_RETENTION_MS = 48 * 60 * 60 * 1000;
const CHECKOUT_RECORD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_JSON_BODY_BYTES = 8 * 1024;
const MAX_LOGIN_BODY_BYTES = 2 * 1024;
const MAX_STRIPE_WEBHOOK_BYTES = 128 * 1024;
const MAX_ARCHIVE_KEY_LENGTH = 1024;
const BASE32_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type JsonRecord = Record<string, unknown>;
type HttpLogLevel = "error" | "info" | "warn";

interface RateLimitRule {
    maxRequests: number;
    scope: string;
    windowMs: number;
}

const LOGIN_RATE_LIMIT: RateLimitRule = { maxRequests: 30, scope: "login", windowMs: 5 * 60 * 1000 };
const CHECKOUT_RATE_LIMIT: RateLimitRule = { maxRequests: 5, scope: "checkout", windowMs: 60 * 60 * 1000 };
const CHECKOUT_VERIFY_RATE_LIMIT: RateLimitRule = { maxRequests: 12, scope: "checkout_verify", windowMs: 5 * 60 * 1000 };

/**
 * Keep the handler independent of Wrangler's generated interface name.
 * `worker-configuration.d.ts` supplies the platform binding types; this narrow
 * local shape intentionally mirrors its `WorkersEnv` contract.
 */
interface AcademyEnv {
    ADMIN_TOKEN: string;
    ARCHIVE: AcademyArchiveBucket;
    ASSETS: AcademyAssetFetcher;
    DB: AcademyDatabase;
    INVITE_CODE_SECRET: string;
    STRIPE_PRICE_ID?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
}

interface AcademyAssetFetcher {
    fetch(input: Request): Promise<Response>;
}

interface AcademyArchiveBucket {
    get(key: string, options?: AcademyArchiveGetOptions): Promise<AcademyArchiveObject | AcademyArchiveObjectBody | null>;
    head(key: string): Promise<AcademyArchiveObject | null>;
}

interface AcademyArchiveGetOptions {
    onlyIf?: { etagMatches: string };
    range?: { length: number; offset: number };
}

interface AcademyArchiveObject {
    etag: string;
    httpEtag: string;
    size: number;
    uploaded: Date;
    writeHttpMetadata(headers: Headers): void;
}

interface AcademyArchiveObjectBody extends AcademyArchiveObject {
    body: ReadableStream<Uint8Array>;
}

interface AcademyDatabase {
    batch<T = unknown>(statements: AcademyPreparedStatement[]): Promise<AcademyDatabaseResult<T>[]>;
    prepare(query: string): AcademyPreparedStatement;
}

interface AcademyDatabaseResult<T = unknown> {
    meta: { changes: number };
    results?: T[];
}

interface AcademyPreparedStatement {
    bind(...values: unknown[]): AcademyPreparedStatement;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run<T = Record<string, unknown>>(): Promise<AcademyDatabaseResult<T>>;
}

type Env = AcademyEnv;

interface AuthenticatedSession {
    id: string;
    inviteId: string;
    expiresAt: number;
}

interface NewSession {
    token: string;
    expiresAt: number;
}

interface InviteSettings {
    code: string | null;
    expiresAt: number;
    label: string | null;
    maxUses: number;
}

interface CheckoutRow {
    claim_token_hash: string;
    expires_at: number;
    purchase_id: string;
    stripe_session_id: string;
}

interface StripeConfig {
    priceId: string;
    secretKey: string;
    webhookSecret: string;
}

export type ArchiveRangeResult =
    | { kind: "invalid" }
    | { kind: "none" }
    | { end: number; kind: "valid"; length: number; offset: number };

class HttpError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        readonly publicMessage: string,
        readonly headers: Record<string, string> = {},
    ) {
        super(publicMessage);
    }
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const requestId = crypto.randomUUID();
        try {
            return await handleRequest(request, env, requestId);
        } catch (error) {
            if (error instanceof HttpError) {
                return jsonResponse(request, requestId, error.status, {
                    error: { code: error.code, message: error.publicMessage },
                }, error.headers);
            }

            log("error", "academy_request_failed", {
                method: request.method,
                path: safePath(request),
                reason: error instanceof Error ? error.name : "unknown",
                requestId,
            });
            return jsonResponse(request, requestId, 500, {
                error: { code: "internal_error", message: "The Academy service is temporarily unavailable." },
            });
        }
    },
};

async function handleRequest(request: Request, env: Env, requestId: string): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (!isAcademyPath(pathname)) {
        throw new HttpError(404, "not_found", "Not found.");
    }

    if (pathname === `${API_PREFIX}/stripe/webhook`) {
        return handleStripeWebhook(request, env, requestId);
    }

    if (pathname === `${API_PREFIX}/login`) return handleLogin(request, env, requestId);
    if (pathname === `${API_PREFIX}/logout`) return handleLogout(request, env, requestId);
    if (pathname === `${API_PREFIX}/session`) return handleSession(request, env, requestId);
    if (pathname === `${API_PREFIX}/checkout`) return handleCheckoutCreate(request, env, requestId);
    if (pathname === `${API_PREFIX}/checkout/verify`) return handleCheckoutVerify(request, env, requestId);
    if (pathname === `${API_PREFIX}/admin/invites`) return handleAdminCreateInvite(request, env, requestId);

    const inviteRevokeMatch = pathname.match(/^\/academy\/api\/admin\/invites\/([A-Za-z0-9_-]{8,128})\/revoke$/u);
    if (inviteRevokeMatch) return handleAdminRevokeInvite(request, env, requestId, inviteRevokeMatch[1]);

    const sessionRevokeMatch = pathname.match(/^\/academy\/api\/admin\/sessions\/([A-Za-z0-9_-]{8,128})\/revoke$/u);
    if (sessionRevokeMatch) return handleAdminRevokeSession(request, env, requestId, sessionRevokeMatch[1]);

    if (pathname.startsWith(`${API_PREFIX}/`)) {
        throw new HttpError(404, "not_found", "Not found.");
    }

    if (pathname === LOGIN_PATH) return handleLoginPage(request, env, requestId);
    if (pathname === CHECKOUT_SUCCESS_PATH) return handleCheckoutSuccessPage(request, env, requestId, url);
    if (pathname.startsWith(ARCHIVE_PREFIX)) return handleArchive(request, env, requestId, pathname);
    return handleProtectedAsset(request, env, requestId, url);
}

async function handleLogin(request: Request, env: Env, requestId: string): Promise<Response> {
    requireMethod(request, "POST");
    assertBrowserSameOrigin(request);

    const now = Date.now();
    await enforceRateLimit(request, env, LOGIN_RATE_LIMIT, now, requestId);
    const { inviteCode, formSubmission } = await readLoginPayload(request);
    const normalized = normalizeInviteCode(inviteCode);
    const session = normalized ? await createSessionForInvite(env, normalized, now) : null;

    if (!session) {
        log("warn", "academy_login_rejected", { requestId });
        if (formSubmission) return redirectResponse(request, requestId, `${LOGIN_PATH}?error=invalid-invite`, 303);
        throw new HttpError(401, "invalid_invite", "That invite code is unavailable.");
    }

    log("info", "academy_login_created", { requestId, sessionExpiresAt: session.expiresAt });
    const response = formSubmission
        ? redirectResponse(request, requestId, `${ACADEMY_PREFIX}/`, 303)
        : jsonResponse(request, requestId, 201, {
            authenticated: true,
            expiresAt: new Date(session.expiresAt).toISOString(),
        });
    response.headers.append("set-cookie", sessionCookie(session.token, session.expiresAt));
    return response;
}

async function handleLogout(request: Request, env: Env, requestId: string): Promise<Response> {
    requireMethod(request, "POST");
    assertBrowserSameOrigin(request);

    const token = readCookie(request, SESSION_COOKIE);
    if (isOpaqueToken(token)) {
        const tokenHash = await hashSessionToken(env, token);
        await env.DB.prepare(`
            UPDATE academy_sessions
            SET revoked_at = COALESCE(revoked_at, ?)
            WHERE token_hash = ?
        `).bind(Date.now(), tokenHash).run();
    }

    const response = jsonResponse(request, requestId, 200, { authenticated: false });
    response.headers.append("set-cookie", expiredCookie(SESSION_COOKIE));
    return response;
}

async function handleSession(request: Request, env: Env, requestId: string): Promise<Response> {
    requireMethod(request, "GET");
    const session = await authenticate(request, env, Date.now());
    if (!session) throw new HttpError(401, "authentication_required", "Sign in is required.");

    return jsonResponse(request, requestId, 200, {
        authenticated: true,
        expiresAt: new Date(session.expiresAt).toISOString(),
    });
}

async function handleLoginPage(request: Request, env: Env, requestId: string): Promise<Response> {
    requireReadMethod(request);
    const session = await authenticate(request, env, Date.now());
    if (session) return redirectResponse(request, requestId, `${ACADEMY_PREFIX}/`, 302);

    const url = new URL(request.url);
    const error = url.searchParams.get("error") === "invalid-invite" ? "invalid-invite" : undefined;
    return loginPageResponse(request, requestId, error);
}

async function handleProtectedAsset(request: Request, env: Env, requestId: string, url: URL): Promise<Response> {
    requireReadMethod(request);
    const session = await authenticate(request, env, Date.now());
    if (!session) {
        if (isDocumentNavigation(request)) return loginPageResponse(request, requestId, undefined, 401);
        throw new HttpError(401, "authentication_required", "Sign in is required.");
    }

    const assetRequest = academyAssetRequest(request, url);
    const assetResponse = await env.ASSETS.fetch(assetRequest);
    const headers = new Headers(assetResponse.headers);
    headers.set("cache-control", "private, no-store");
    headers.set("cross-origin-resource-policy", "same-origin");
    headers.set("referrer-policy", "same-origin");
    headers.set("content-security-policy", "frame-ancestors 'none'");
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-frame-options", "DENY");
    appendVary(headers, "Cookie");
    headers.set("x-request-id", requestId);

    return new Response(request.method === "HEAD" ? null : assetResponse.body, {
        headers,
        status: assetResponse.status,
        statusText: assetResponse.statusText,
    });
}

function academyAssetRequest(request: Request, url: URL): Request {
    const assetUrl = new URL(url);
    const suffix = url.pathname.slice(ACADEMY_PREFIX.length);
    // Ask the assets binding for its canonical root instead of /index.html.
    // With html_handling enabled, /index.html redirects to / and would escape
    // the externally protected /academy prefix.
    assetUrl.pathname = suffix === "" || suffix === "/" || suffix === "/index.html" ? "/" : suffix;

    const headers = new Headers(request.headers);
    headers.delete("authorization");
    headers.delete("cookie");
    return new Request(assetUrl.toString(), {
        headers,
        method: request.method,
        redirect: "manual",
    });
}

async function handleArchive(request: Request, env: Env, requestId: string, pathname: string): Promise<Response> {
    requireReadMethod(request);
    const session = await authenticate(request, env, Date.now());
    if (!session) throw new HttpError(401, "authentication_required", "Sign in is required.");

    const key = archiveObjectKeyFromEncodedPath(pathname.slice(ARCHIVE_PREFIX.length));
    if (!key) throw new HttpError(400, "invalid_archive_key", "The archive key is invalid.");

    const object = await env.ARCHIVE.head(key);
    if (!object) throw new HttpError(404, "archive_not_found", "Archive item not found.");

    const headers = archiveHeaders(object, requestId);
    const conditionalStatus = evaluatePreconditions(request, object.httpEtag, object.uploaded);
    if (conditionalStatus) return new Response(null, { headers, status: conditionalStatus });

    let range = parseArchiveRange(request.headers.get("range"), object.size);
    if (range.kind === "invalid") {
        headers.set("content-range", `bytes */${object.size}`);
        return new Response(null, { headers, status: 416 });
    }
    if (range.kind === "valid" && !ifRangeMatches(request.headers.get("if-range"), object.httpEtag, object.uploaded)) {
        range = { kind: "none" };
    }

    if (range.kind === "valid") {
        headers.set("content-length", String(range.length));
        headers.set("content-range", `bytes ${range.offset}-${range.end}/${object.size}`);
    } else {
        headers.set("content-length", String(object.size));
    }

    const status = range.kind === "valid" ? 206 : 200;
    if (request.method === "HEAD") return new Response(null, { headers, status });

    const objectBody = await env.ARCHIVE.get(key, {
        onlyIf: { etagMatches: object.etag },
        ...(range.kind === "valid" ? { range: { length: range.length, offset: range.offset } } : {}),
    });
    if (!objectBody) throw new HttpError(404, "archive_not_found", "Archive item not found.");
    if (!("body" in objectBody)) return new Response(null, { headers, status: 412 });

    return new Response(objectBody.body, { headers, status });
}

function archiveHeaders(object: { httpEtag: string; uploaded: Date; writeHttpMetadata(headers: Headers): void }, requestId: string): Headers {
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", "private, no-store");
    headers.set("etag", object.httpEtag);
    headers.set("last-modified", object.uploaded.toUTCString());
    headers.set("referrer-policy", "same-origin");
    headers.set("content-security-policy", "frame-ancestors 'none'");
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-frame-options", "DENY");
    headers.set("x-request-id", requestId);
    appendVary(headers, "Cookie");
    return headers;
}

async function handleAdminCreateInvite(request: Request, env: Env, requestId: string): Promise<Response> {
    requireMethod(request, "POST");
    assertAdminMutationOrigin(request);
    await requireAdminToken(request, env);

    const input = await readJsonObject(request, MAX_JSON_BODY_BYTES);
    const now = Date.now();
    const settings = parseInviteSettings(input, now);
    const invite = await createClassInvite(env, settings, now);

    log("info", "academy_class_invite_created", {
        inviteId: invite.id,
        maxUses: settings.maxUses,
        requestId,
    });
    return jsonResponse(request, requestId, 201, {
        invite: {
            code: invite.code,
            expiresAt: new Date(settings.expiresAt).toISOString(),
            id: invite.id,
            label: settings.label,
            maxUses: settings.maxUses,
        },
    });
}

async function handleAdminRevokeInvite(request: Request, env: Env, requestId: string, inviteId: string): Promise<Response> {
    requireMethod(request, "POST");
    assertAdminMutationOrigin(request);
    await requireAdminToken(request, env);

    const result = await env.DB.prepare(`
        UPDATE academy_invites
        SET revoked_at = COALESCE(revoked_at, ?)
        WHERE id = ?
    `).bind(Date.now(), inviteId).run();
    if (result.meta.changes !== 1) throw new HttpError(404, "invite_not_found", "Invite not found.");

    log("info", "academy_invite_revoked", { inviteId, requestId });
    return jsonResponse(request, requestId, 200, { revoked: true });
}

async function handleAdminRevokeSession(request: Request, env: Env, requestId: string, sessionId: string): Promise<Response> {
    requireMethod(request, "POST");
    assertAdminMutationOrigin(request);
    await requireAdminToken(request, env);

    const result = await env.DB.prepare(`
        UPDATE academy_sessions
        SET revoked_at = COALESCE(revoked_at, ?)
        WHERE id = ?
    `).bind(Date.now(), sessionId).run();
    if (result.meta.changes !== 1) throw new HttpError(404, "session_not_found", "Session not found.");

    log("info", "academy_session_revoked", { requestId, sessionId });
    return jsonResponse(request, requestId, 200, { revoked: true });
}

async function createSessionForInvite(env: Env, normalizedCode: string, now: number): Promise<NewSession | null> {
    const inviteHash = await hashInviteCode(env, normalizedCode);
    const token = randomToken();
    const tokenHash = await hashSessionToken(env, token);
    const sessionId = crypto.randomUUID();
    const expiresAt = now + SESSION_TTL_MS;
    const results = await env.DB.batch([
        env.DB.prepare(`
            INSERT INTO academy_sessions (id, token_hash, invite_id, created_at, expires_at)
            SELECT ?, ?, id, ?, ?
            FROM academy_invites
            WHERE code_hash = ?
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > ?)
              AND use_count < max_uses
        `).bind(sessionId, tokenHash, now, expiresAt, inviteHash, now),
        env.DB.prepare(`
            UPDATE academy_invites
            SET use_count = use_count + 1
            WHERE id = (
                SELECT invite_id
                FROM academy_sessions
                WHERE id = ? AND token_hash = ? AND created_at = ?
            )
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > ?)
              AND use_count < max_uses
        `).bind(sessionId, tokenHash, now, now),
    ]);
    const [sessionInsert, inviteUse] = results;
    if (sessionInsert?.meta.changes !== 1 || inviteUse?.meta.changes !== 1) return null;
    return { expiresAt, token };
}

async function authenticate(request: Request, env: Env, now: number): Promise<AuthenticatedSession | null> {
    const token = readCookie(request, SESSION_COOKIE);
    if (!isOpaqueToken(token)) return null;

    const tokenHash = await hashSessionToken(env, token);
    const row = await env.DB.prepare(`
        SELECT s.id, s.invite_id, s.expires_at
        FROM academy_sessions AS s
        INNER JOIN academy_invites AS i ON i.id = s.invite_id
        WHERE s.token_hash = ?
          AND s.revoked_at IS NULL
          AND s.expires_at > ?
          AND i.revoked_at IS NULL
          AND (i.expires_at IS NULL OR i.expires_at > ?)
        LIMIT 1
    `).bind(tokenHash, now, now).first<{ expires_at: number; id: string; invite_id: string }>();

    if (!row || !Number.isFinite(row.expires_at)) return null;
    return { expiresAt: row.expires_at, id: row.id, inviteId: row.invite_id };
}

async function createClassInvite(env: Env, settings: InviteSettings, now: number): Promise<{ code: string; id: string }> {
    const attempts = settings.code ? 1 : 5;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const code = settings.code ?? formatInviteCode("YOMU", randomBase32(20));
        const id = crypto.randomUUID();
        const codeHash = await hashInviteCode(env, normalizeInviteCode(code)!);
        const result = await env.DB.prepare(`
            INSERT OR IGNORE INTO academy_invites (
                id, code_hash, kind, label, max_uses, use_count, created_at, expires_at, created_by
            ) VALUES (?, ?, 'class', ?, ?, 0, ?, ?, 'admin')
        `).bind(id, codeHash, settings.label, settings.maxUses, now, settings.expiresAt).run();
        if (result.meta.changes === 1) return { code, id };
        if (settings.code) {
            throw new HttpError(409, "invite_code_conflict", "That invite code is already in use.");
        }
    }
    throw new HttpError(500, "invite_generation_failed", "Could not create an invite. Please try again.");
}

function parseInviteSettings(input: JsonRecord, now: number): InviteSettings {
    const suppliedCode = optionalString(input, "code", 128);
    const code = suppliedCode === undefined ? null : normalizeInviteCode(suppliedCode);
    if (suppliedCode !== undefined && !code) {
        throw new HttpError(400, "invalid_request", "code is invalid.");
    }
    const label = optionalString(input, "label", 120);
    const maxUses = optionalPositiveInteger(input, "maxUses", 30, 1, 100_000);
    const expiresInDays = optionalPositiveInteger(
        input,
        "expiresInDays",
        CLASS_INVITE_DEFAULT_TTL_DAYS,
        1,
        CLASS_INVITE_MAX_TTL_DAYS,
    );
    const explicitExpiry = input.expiresAt;
    let expiresAt = now + expiresInDays * 24 * 60 * 60 * 1000;

    if (explicitExpiry !== undefined) {
        if (typeof explicitExpiry !== "string" || explicitExpiry.length > 64) {
            throw new HttpError(400, "invalid_request", "expiresAt must be an ISO timestamp.");
        }
        const parsed = Date.parse(explicitExpiry);
        if (!Number.isFinite(parsed) || parsed <= now || parsed > now + CLASS_INVITE_MAX_TTL_DAYS * 24 * 60 * 60 * 1000) {
            throw new HttpError(400, "invalid_request", "expiresAt is outside the permitted lifetime.");
        }
        expiresAt = parsed;
    }

    return { code, expiresAt, label: label || null, maxUses };
}

async function readLoginPayload(request: Request): Promise<{ formSubmission: boolean; inviteCode: string }> {
    const contentType = normalizedContentType(request);
    if (contentType === "application/x-www-form-urlencoded") {
        const value = new URLSearchParams(await readBoundedText(request, MAX_LOGIN_BODY_BYTES)).get("invite");
        if (typeof value !== "string") throw new HttpError(400, "invalid_request", "An invite code is required.");
        return { formSubmission: true, inviteCode: value };
    }
    if (contentType === "application/json") {
        const body = await readJsonObject(request, MAX_LOGIN_BODY_BYTES);
        const inviteCode = requiredString(body, "invite", 128);
        return { formSubmission: false, inviteCode };
    }
    throw new HttpError(415, "unsupported_media_type", "Use a form or JSON request body.");
}

async function readJsonObject(request: Request, maxBytes: number): Promise<JsonRecord> {
    if (normalizedContentType(request) !== "application/json") {
        throw new HttpError(415, "unsupported_media_type", "Use an application/json request body.");
    }
    const text = await readBoundedText(request, maxBytes);
    if (!text) throw new HttpError(400, "invalid_request", "A request body is required.");
    try {
        const parsed: unknown = JSON.parse(text);
        if (!isRecord(parsed)) throw new HttpError(400, "invalid_request", "The request body must be an object.");
        return parsed;
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, "invalid_request", "The request body is not valid JSON.");
    }
}

async function readOptionalJsonObject(request: Request, maxBytes: number): Promise<JsonRecord> {
    const length = request.headers.get("content-length");
    if (length === "0") return {};
    return readJsonObject(request, maxBytes);
}

async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
    return decoder.decode(await readBoundedBytes(request, maxBytes));
}

async function readBoundedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
    const declaredLength = request.headers.get("content-length");
    if (declaredLength && /^\d+$/u.test(declaredLength) && Number(declaredLength) > maxBytes) {
        throw new HttpError(413, "body_too_large", "The request body is too large.");
    }
    if (!request.body) return new Uint8Array();

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) throw new HttpError(413, "body_too_large", "The request body is too large.");
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

function requireMethod(request: Request, expected: string): void {
    if (request.method !== expected) {
        throw new HttpError(405, "method_not_allowed", "Method not allowed.", { allow: expected });
    }
}

function requireReadMethod(request: Request): void {
    if (request.method !== "GET" && request.method !== "HEAD") {
        throw new HttpError(405, "method_not_allowed", "Method not allowed.", { allow: "GET, HEAD" });
    }
}

// CONSTRAINT: the 7-character minimum is deliberate and must not be raised.
// Administrator-provisioned class codes (e.g. the tested "ABC1234" / "UCL2026"
// shape) are handed out on paper to a room and are intentionally short and
// human-typable, so their brute-force resistance does NOT come from length.
// It comes entirely from LOGIN_RATE_LIMIT (30 attempts / 5 min / client scope,
// see handleLogin): even a 7-char [A-Z0-9] code is a 36^7 (~78 billion) space,
// which the login rate limiter keeps infeasible to sweep online. Auto-minted
// invites use full Web Crypto entropy regardless. If this rate limit is ever
// weakened or removed, restore an entropy floor here for explicit codes.
export function normalizeInviteCode(value: string): string | null {
    const normalized = value.trim().normalize("NFKC").toUpperCase().replace(/[\s-]+/gu, "");
    return /^[A-Z0-9]{7,64}$/u.test(normalized) ? normalized : null;
}

export function archiveKeyFromEncodedPath(value: string): string | null {
    if (!value || value.length > MAX_ARCHIVE_KEY_LENGTH * 3) return null;
    let decoded: string;
    try {
        decoded = decodeURIComponent(value).normalize("NFC");
    } catch {
        return null;
    }
    if (!decoded || decoded.length > MAX_ARCHIVE_KEY_LENGTH) return null;
    if (decoded.startsWith("/") || decoded.endsWith("/") || /[\\\u0000-\u001f\u007f]/u.test(decoded)) return null;
    const segments = decoded.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
    return decoded;
}

/** Resolve the request-relative archive path to its R2 storage key. Applies the
 *  traversal guards in archiveKeyFromEncodedPath, then re-applies the storage
 *  prefix the uploader writes under so head/get target the object that exists. */
export function archiveObjectKeyFromEncodedPath(value: string): string | null {
    const logicalKey = archiveKeyFromEncodedPath(value);
    return logicalKey === null ? null : `${ARCHIVE_OBJECT_PREFIX}${logicalKey}`;
}

export function parseArchiveRange(rangeHeader: string | null, size: number): ArchiveRangeResult {
    if (!rangeHeader) return { kind: "none" };
    if (!Number.isSafeInteger(size) || size < 0) return { kind: "invalid" };
    const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader.trim());
    if (!match || rangeHeader.includes(",")) return { kind: "invalid" };
    const [, rawStart, rawEnd] = match;
    if ((!rawStart && !rawEnd) || size === 0) return { kind: "invalid" };

    if (!rawStart) {
        const suffix = safeInteger(rawEnd);
        if (suffix === null || suffix <= 0) return { kind: "invalid" };
        const length = Math.min(suffix, size);
        return { end: size - 1, kind: "valid", length, offset: size - length };
    }

    const offset = safeInteger(rawStart);
    if (offset === null || offset >= size) return { kind: "invalid" };
    const requestedEnd = rawEnd ? safeInteger(rawEnd) : size - 1;
    if (requestedEnd === null || requestedEnd < offset) return { kind: "invalid" };
    const end = Math.min(requestedEnd, size - 1);
    return { end, kind: "valid", length: end - offset + 1, offset };
}

function safeInteger(value: string | undefined): number | null {
    if (!value || !/^\d{1,15}$/u.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function evaluatePreconditions(request: Request, etag: string, uploaded: Date): 304 | 412 | null {
    const ifMatch = request.headers.get("if-match");
    if (ifMatch && !matchesIfMatch(ifMatch, etag)) return 412;

    const ifUnmodifiedSince = parseHttpDate(request.headers.get("if-unmodified-since"));
    if (!ifMatch && ifUnmodifiedSince !== null && uploaded.getTime() / 1000 > ifUnmodifiedSince) return 412;

    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch && matchesIfNoneMatch(ifNoneMatch, etag)) {
        return request.method === "GET" || request.method === "HEAD" ? 304 : 412;
    }

    const ifModifiedSince = parseHttpDate(request.headers.get("if-modified-since"));
    if (!ifNoneMatch && ifModifiedSince !== null && Math.floor(uploaded.getTime() / 1000) <= ifModifiedSince) return 304;
    return null;
}

export function matchesIfNoneMatch(value: string, etag: string): boolean {
    return value.trim() === "*" || value.split(",").some((candidate) => weakEtag(candidate) === weakEtag(etag));
}

function matchesIfMatch(value: string, etag: string): boolean {
    return value.trim() === "*" || value.split(",").some((candidate) => candidate.trim() === etag);
}

function weakEtag(value: string): string {
    return value.trim().replace(/^W\//iu, "");
}

function ifRangeMatches(value: string | null, etag: string, uploaded: Date): boolean {
    if (!value) return true;
    const trimmed = value.trim();
    if (trimmed.startsWith("W/")) return false;
    if (trimmed.startsWith("\"")) return trimmed === etag;
    const date = parseHttpDate(trimmed);
    return date !== null && Math.floor(uploaded.getTime() / 1000) <= date;
}

function parseHttpDate(value: string | null): number | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function isAcademyPath(pathname: string): boolean {
    return pathname === ACADEMY_PREFIX || pathname.startsWith(`${ACADEMY_PREFIX}/`);
}

function isDocumentNavigation(request: Request): boolean {
    return request.headers.get("sec-fetch-dest") === "document"
        || request.headers.get("accept")?.includes("text/html") === true;
}

function normalizedContentType(request: Request): string {
    return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string, maxLength: number): string {
    const value = record[key];
    if (typeof value !== "string" || !value || value.length > maxLength) {
        throw new HttpError(400, "invalid_request", `${key} is required.`);
    }
    return value;
}

function optionalString(record: JsonRecord, key: string, maxLength: number): string | undefined {
    const value = record[key];
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value.length > maxLength) {
        throw new HttpError(400, "invalid_request", `${key} is invalid.`);
    }
    return value.trim();
}

function optionalPositiveInteger(record: JsonRecord, key: string, fallback: number, minimum: number, maximum: number): number {
    const value = record[key];
    if (value === undefined) return fallback;
    if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
        throw new HttpError(400, "invalid_request", `${key} is invalid.`);
    }
    return value;
}

function formatInviteCode(prefix: string, value: string): string {
    return `${prefix}-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16)}`;
}

function randomBase32(length: number): string {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let value = "";
    for (const byte of bytes) value += BASE32_ALPHABET[byte & 31]!;
    return value;
}

function randomToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytesToBase64url(bytes);
}

function bytesToBase64url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function isOpaqueToken(value: string | null): value is string {
    return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value);
}

function readCookie(request: Request, name: string): string | null {
    const header = request.headers.get("cookie");
    if (!header) return null;
    for (const part of header.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (key === name) return rest.join("=") || null;
    }
    return null;
}

function sessionCookie(token: string, expiresAt: number): string {
    const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function checkoutCookie(purchaseId: string, claimToken: string, expiresAt: number): string {
    const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
    return `${CHECKOUT_COOKIE}=${purchaseId}.${claimToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function expiredCookie(name: string): string {
    return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

async function hashInviteCode(env: Env, normalizedCode: string): Promise<string> {
    return hmacHex(requiredSecret(env.INVITE_CODE_SECRET, "INVITE_CODE_SECRET"), `academy:invite:v1:${normalizedCode}`);
}

async function hashSessionToken(env: Env, token: string): Promise<string> {
    return hmacHex(requiredSecret(env.INVITE_CODE_SECRET, "INVITE_CODE_SECRET"), `academy:session:v1:${token}`);
}

async function hashCheckoutClaim(env: Env, token: string): Promise<string> {
    return hmacHex(requiredSecret(env.INVITE_CODE_SECRET, "INVITE_CODE_SECRET"), `academy:checkout-claim:v1:${token}`);
}

async function hmacHex(secret: string, value: string): Promise<string> {
    return bytesToHex(await hmacBytes(secret, encoder.encode(value)));
}

async function hmacBytes(secret: string, value: Uint8Array): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
        "raw",
        copiedArrayBuffer(encoder.encode(secret)),
        { hash: "SHA-256", name: "HMAC" },
        false,
        ["sign"],
    );
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, copiedArrayBuffer(value)));
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", copiedArrayBuffer(encoder.encode(value))));
}

function copiedArrayBuffer(value: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return copy.buffer;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array | null {
    if (!/^[0-9a-f]{64}$/iu.test(value)) return null;
    const bytes = new Uint8Array(value.length / 2);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    return bytes;
}

type TimingSafeSubtleCrypto = SubtleCrypto & {
    timingSafeEqual?: (left: ArrayBuffer | ArrayBufferView, right: ArrayBuffer | ArrayBufferView) => boolean;
};

export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.byteLength !== right.byteLength) return false;
    const compare = (crypto.subtle as TimingSafeSubtleCrypto).timingSafeEqual;
    if (typeof compare === "function") return compare.call(crypto.subtle, left, right);

    // Node's local Web Crypto lacks Workers' timingSafeEqual; this preserves test behavior.
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
    return difference === 0;
}

async function verifySecret(provided: string, expected: string): Promise<boolean> {
    const [providedDigest, expectedDigest] = await Promise.all([sha256Bytes(provided), sha256Bytes(expected)]);
    return timingSafeEqual(providedDigest, expectedDigest);
}

function requiredSecret(value: string | undefined, name: string): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new HttpError(503, "configuration_error", `${name} is not configured.`);
    }
    return value;
}

async function requireAdminToken(request: Request, env: Env): Promise<void> {
    const header = request.headers.get("authorization");
    const match = header?.match(/^Bearer ([^\s]{1,1024})$/u);
    const expected = requiredSecret(env.ADMIN_TOKEN, "ADMIN_TOKEN");
    if (!match || !(await verifySecret(match[1]!, expected))) {
        throw new HttpError(401, "admin_unauthorized", "Administrator authentication is required.", {
            "www-authenticate": "Bearer",
        });
    }
}

export function isSameOriginMutation(origin: string | null, requestUrl: string): boolean {
    if (!origin) return false;
    try {
        return origin === new URL(requestUrl).origin;
    } catch {
        return false;
    }
}

function assertBrowserSameOrigin(request: Request): void {
    if (!isSameOriginMutation(request.headers.get("origin"), request.url)) {
        throw new HttpError(403, "origin_required", "This request must come from the Academy site.");
    }
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
        throw new HttpError(403, "origin_required", "This request must come from the Academy site.");
    }
}

function assertAdminMutationOrigin(request: Request): void {
    const origin = request.headers.get("origin");
    if (origin && !isSameOriginMutation(origin, request.url)) {
        throw new HttpError(403, "origin_required", "This request must come from the Academy site.");
    }
    const fetchSite = request.headers.get("sec-fetch-site");
    if (!origin && fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
        throw new HttpError(403, "origin_required", "This request must come from the Academy site.");
    }
}

function jsonResponse(
    request: Request,
    requestId: string,
    status: number,
    body: unknown,
    extraHeaders: Record<string, string> = {},
): Response {
    const headers = new Headers(extraHeaders);
    headers.set("cache-control", "no-store");
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-request-id", requestId);
    return new Response(request.method === "HEAD" ? null : JSON.stringify(body), { headers, status });
}

function redirectResponse(request: Request, requestId: string, location: string, status: 302 | 303): Response {
    const headers = new Headers({
        "cache-control": "no-store",
        location,
        "referrer-policy": "no-referrer",
        "x-request-id": requestId,
    });
    return new Response(request.method === "HEAD" ? null : "", { headers, status });
}

function appendVary(headers: Headers, value: string): void {
    const current = headers.get("vary");
    if (!current) {
        headers.set("vary", value);
        return;
    }
    const values = current.split(",").map((entry) => entry.trim().toLowerCase());
    if (!values.includes(value.toLowerCase())) headers.set("vary", `${current}, ${value}`);
}

function safePath(request: Request): string {
    try {
        return new URL(request.url).pathname;
    } catch {
        return "";
    }
}

function log(level: HttpLogLevel, event: string, fields: Record<string, unknown>): void {
    console[level](JSON.stringify({ event, service: "yomu-academy", ...fields }));
}

async function enforceRateLimit(
    request: Request,
    env: Env,
    rule: RateLimitRule,
    now: number,
    requestId: string,
): Promise<void> {
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    const subject = rateLimitSubject(request);
    const subjectHash = await hmacHex(
        requiredSecret(env.INVITE_CODE_SECRET, "INVITE_CODE_SECRET"),
        `academy:rate-limit:v1:${rule.scope}:${subject}`,
    );

    await env.DB.prepare(`
        DELETE FROM academy_rate_limits
        WHERE window_start < ?
    `).bind(now - RATE_LIMIT_RETENTION_MS).run();

    const row = await env.DB.prepare(`
        INSERT INTO academy_rate_limits (scope, subject_hash, window_start, request_count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(scope, subject_hash, window_start)
        DO UPDATE SET request_count = request_count + 1
        RETURNING request_count
    `).bind(rule.scope, subjectHash, windowStart).first<{ request_count: number }>();
    if (!row || !Number.isInteger(row.request_count)) {
        log("error", "academy_rate_limit_failed", { requestId, scope: rule.scope });
        throw new HttpError(500, "rate_limit_unavailable", "The Academy service is temporarily unavailable.");
    }

    if (row.request_count > rule.maxRequests) {
        const retryAfter = Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000));
        log("warn", "academy_rate_limited", { requestId, scope: rule.scope });
        throw new HttpError(429, "rate_limited", "Too many requests. Please try again later.", {
            "retry-after": String(retryAfter),
        });
    }
}

function rateLimitSubject(request: Request): string {
    const connectingIp = request.headers.get("cf-connecting-ip")?.trim();
    return connectingIp && /^[0-9a-f:.]{1,128}$/iu.test(connectingIp)
        ? connectingIp.toLowerCase()
        : "unavailable";
}

async function purgeExpiredCheckoutRows(env: Env, now: number): Promise<void> {
    const cutoff = now - CHECKOUT_RECORD_RETENTION_MS;
    await env.DB.prepare(`
        DELETE FROM academy_stripe_checkouts
        WHERE (status IN ('created', 'failed') AND updated_at < ?)
           OR (status = 'open' AND expires_at < ?)
    `).bind(cutoff, cutoff).run();
}

async function handleCheckoutCreate(request: Request, env: Env, requestId: string): Promise<Response> {
    requireMethod(request, "POST");
    assertBrowserSameOrigin(request);
    const config = requireStripeConfig(env);
    const now = Date.now();
    await enforceRateLimit(request, env, CHECKOUT_RATE_LIMIT, now, requestId);
    const checkoutOrigin = checkoutReturnOrigin(request);
    if (request.body) await readOptionalJsonObject(request, MAX_JSON_BODY_BYTES);
    await purgeExpiredCheckoutRows(env, now);

    const purchaseId = `checkout_${randomToken()}`;
    const claimToken = randomToken();
    const claimTokenHash = await hashCheckoutClaim(env, claimToken);
    const expiresAt = now + CHECKOUT_CLAIM_TTL_MS;

    await env.DB.prepare(`
        INSERT INTO academy_stripe_checkouts (
            purchase_id, claim_token_hash, stripe_price_id, status, created_at, expires_at, updated_at
        ) VALUES (?, ?, ?, 'created', ?, ?, ?)
    `).bind(purchaseId, claimTokenHash, config.priceId, now, expiresAt, now).run();

    const stripeSession = await createStripeCheckoutSession(config, purchaseId, checkoutOrigin);
    if (!stripeSession) {
        await env.DB.prepare(`
            UPDATE academy_stripe_checkouts
            SET status = 'failed', updated_at = ?
            WHERE purchase_id = ?
        `).bind(Date.now(), purchaseId).run();
        log("warn", "academy_stripe_checkout_create_failed", { requestId });
        throw new HttpError(502, "stripe_checkout_failed", "Could not start checkout. Please try again.");
    }

    const updated = await env.DB.prepare(`
        UPDATE academy_stripe_checkouts
        SET stripe_session_id = ?, status = 'open', updated_at = ?
        WHERE purchase_id = ? AND stripe_session_id IS NULL
    `).bind(stripeSession.id, Date.now(), purchaseId).run();
    if (updated.meta.changes !== 1) {
        log("error", "academy_stripe_checkout_link_failed", { requestId });
        throw new HttpError(500, "checkout_setup_failed", "Could not start checkout. Please try again.");
    }

    log("info", "academy_stripe_checkout_created", { requestId });
    const response = jsonResponse(request, requestId, 201, { checkoutUrl: stripeSession.url });
    response.headers.append("set-cookie", checkoutCookie(purchaseId, claimToken, expiresAt));
    return response;
}

async function createStripeCheckoutSession(
    config: StripeConfig,
    purchaseId: string,
    origin: string,
): Promise<{ id: string; url: string } | null> {
    const form = new URLSearchParams({
        "client_reference_id": purchaseId,
        "line_items[0][price]": config.priceId,
        "line_items[0][quantity]": "1",
        "metadata[academy_purchase_id]": purchaseId,
        "mode": "payment",
        "success_url": `${origin}${CHECKOUT_SUCCESS_PATH}?session_id={CHECKOUT_SESSION_ID}`,
        "cancel_url": `${origin}${LOGIN_PATH}?checkout=cancelled`,
    });

    let response: Response;
    try {
        response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
            body: form,
            headers: {
                authorization: `Bearer ${config.secretKey}`,
                "content-type": "application/x-www-form-urlencoded",
                "idempotency-key": `academy-checkout-${purchaseId}`,
            },
            method: "POST",
        });
    } catch {
        return null;
    }
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    if (!isRecord(payload) || !isStripeSessionId(payload.id) || !isSafeStripeCheckoutUrl(payload.url)) return null;
    return { id: payload.id, url: payload.url };
}

async function handleCheckoutVerify(request: Request, env: Env, requestId: string): Promise<Response> {
    requireMethod(request, "POST");
    assertBrowserSameOrigin(request);
    const config = requireStripeConfig(env);
    const now = Date.now();
    await enforceRateLimit(request, env, CHECKOUT_VERIFY_RATE_LIMIT, now, requestId);
    const input = await readJsonObject(request, MAX_JSON_BODY_BYTES);
    const stripeSessionId = requiredString(input, "sessionId", 255);
    if (!isStripeSessionId(stripeSessionId)) {
        throw new HttpError(400, "invalid_request", "sessionId is invalid.");
    }

    const claim = readCheckoutClaim(request);
    if (!claim) throw new HttpError(403, "checkout_claim_required", "This checkout belongs to a different browser session.");

    const row = await env.DB.prepare(`
        SELECT purchase_id, claim_token_hash, stripe_session_id, expires_at
        FROM academy_stripe_checkouts
        WHERE stripe_session_id = ?
        LIMIT 1
    `).bind(stripeSessionId).first<CheckoutRow>();
    if (!isCheckoutRow(row) || row.expires_at <= now || row.purchase_id !== claim.purchaseId) {
        throw new HttpError(404, "checkout_not_found", "Checkout was not found.");
    }

    const claimHash = await hashCheckoutClaim(env, claim.token);
    if (!timingSafeHexEqual(row.claim_token_hash, claimHash)) {
        throw new HttpError(403, "checkout_claim_required", "This checkout belongs to a different browser session.");
    }

    const stripeSession = await fetchStripeCheckoutSession(config, stripeSessionId);
    if (!stripeSession) throw new HttpError(404, "checkout_not_found", "Checkout was not found.");
    if (!isVerifiedStripeCheckout(stripeSession, row, config.priceId)) {
        throw new HttpError(409, "payment_pending", "Payment is not complete yet.");
    }

    await markStripeCheckoutPaid(env, row.purchase_id, stripeSessionId, now);
    const paidInvite = await mintPaidInvite(env, row.purchase_id, stripeSessionId, now);
    log("info", "academy_paid_invite_minted", { inviteId: paidInvite.id, requestId });
    return jsonResponse(request, requestId, 201, {
        expiresAt: new Date(paidInvite.expiresAt).toISOString(),
        inviteCode: paidInvite.code,
    });
}

function readCheckoutClaim(request: Request): { purchaseId: string; token: string } | null {
    const value = readCookie(request, CHECKOUT_COOKIE);
    if (!value) return null;
    const separator = value.indexOf(".");
    if (separator < 1) return null;
    const purchaseId = value.slice(0, separator);
    const token = value.slice(separator + 1);
    return /^checkout_[A-Za-z0-9_-]{43}$/u.test(purchaseId) && isOpaqueToken(token)
        ? { purchaseId, token }
        : null;
}

async function fetchStripeCheckoutSession(config: StripeConfig, sessionId: string): Promise<JsonRecord | null> {
    let response: Response;
    try {
        // Expand line_items so the verifier can pin the purchased price to config.priceId.
        response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items`, {
            headers: { authorization: `Bearer ${config.secretKey}` },
        });
    } catch {
        throw new HttpError(502, "stripe_unavailable", "Payment verification is temporarily unavailable.");
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new HttpError(502, "stripe_unavailable", "Payment verification is temporarily unavailable.");

    const payload = await response.json().catch(() => null);
    return isRecord(payload) ? payload : null;
}

export function isVerifiedStripeCheckout(checkout: JsonRecord, row: CheckoutRow, expectedPriceId: string): boolean {
    return checkout.id === row.stripe_session_id
        && checkout.client_reference_id === row.purchase_id
        && checkout.mode === "payment"
        && checkout.payment_status === "paid"
        && checkout.status === "complete"
        && isRecord(checkout.metadata)
        && checkout.metadata.academy_purchase_id === row.purchase_id
        // Pin the purchased price: a session for a different (e.g. cheaper) price must not mint an invite.
        && checkoutPriceId(checkout) === expectedPriceId;
}

/** Extract the single line item's price id from an expanded checkout session. */
function checkoutPriceId(checkout: JsonRecord): string | null {
    const lineItems = checkout.line_items;
    if (!isRecord(lineItems) || !Array.isArray(lineItems.data) || lineItems.data.length !== 1) return null;
    const [item] = lineItems.data;
    if (!isRecord(item) || !isRecord(item.price)) return null;
    return typeof item.price.id === "string" ? item.price.id : null;
}

async function markStripeCheckoutPaid(env: Env, purchaseId: string, stripeSessionId: string, now: number): Promise<void> {
    await env.DB.prepare(`
        UPDATE academy_stripe_checkouts
        SET paid_at = COALESCE(paid_at, ?), status = 'paid', updated_at = ?
        WHERE purchase_id = ? AND stripe_session_id = ?
    `).bind(now, now, purchaseId, stripeSessionId).run();
}

async function mintPaidInvite(
    env: Env,
    purchaseId: string,
    stripeSessionId: string,
    now: number,
): Promise<{ code: string; expiresAt: number; id: string }> {
    const code = await derivePaidInviteCode(env, purchaseId, stripeSessionId);
    const normalized = normalizeInviteCode(code);
    if (!normalized) throw new HttpError(500, "invite_generation_failed", "Could not create an invite. Please try again.");

    const [codeHash, id] = await Promise.all([
        hashInviteCode(env, normalized),
        paidInviteId(purchaseId, stripeSessionId),
    ]);
    const expiresAt = now + PAID_INVITE_TTL_MS;
    await env.DB.batch([
        env.DB.prepare(`
            INSERT OR IGNORE INTO academy_invites (
                id, code_hash, kind, label, max_uses, use_count, created_at, expires_at, created_by, stripe_checkout_session_id
            )
            SELECT ?, ?, 'paid', NULL, 1, 0, ?, ?, 'stripe', ?
            WHERE EXISTS (
                SELECT 1
                FROM academy_stripe_checkouts
                WHERE purchase_id = ?
                  AND stripe_session_id = ?
                  AND paid_at IS NOT NULL
            )
        `).bind(id, codeHash, now, expiresAt, stripeSessionId, purchaseId, stripeSessionId),
        env.DB.prepare(`
            UPDATE academy_stripe_checkouts
            SET paid_invite_id = COALESCE(paid_invite_id, ?), updated_at = ?
            WHERE purchase_id = ?
              AND stripe_session_id = ?
              AND paid_at IS NOT NULL
        `).bind(id, now, purchaseId, stripeSessionId),
    ]);

    const row = await env.DB.prepare(`
        SELECT expires_at
        FROM academy_invites
        WHERE id = ?
        LIMIT 1
    `).bind(id).first<{ expires_at: number }>();
    if (!row || !Number.isFinite(row.expires_at)) {
        throw new HttpError(500, "invite_generation_failed", "Could not create an invite. Please try again.");
    }
    return { code, expiresAt: row.expires_at, id };
}

async function derivePaidInviteCode(env: Env, purchaseId: string, stripeSessionId: string): Promise<string> {
    const secret = requiredSecret(env.INVITE_CODE_SECRET, "INVITE_CODE_SECRET");
    const bytes = await hmacBytes(secret, encoder.encode(`academy:paid-invite:v1:${purchaseId}:${stripeSessionId}`));
    let value = "";
    for (let index = 0; index < 20; index += 1) value += BASE32_ALPHABET[bytes[index]! & 31]!;
    return formatInviteCode("PAID", value);
}

async function paidInviteId(purchaseId: string, stripeSessionId: string): Promise<string> {
    const digest = await sha256Bytes(`academy:paid-invite-id:v1:${purchaseId}:${stripeSessionId}`);
    return `paid_${bytesToHex(digest).slice(0, 40)}`;
}

async function handleStripeWebhook(request: Request, env: Env, requestId: string): Promise<Response> {
    requireMethod(request, "POST");
    const config = requireStripeConfig(env);
    const body = await readBoundedBytes(request, MAX_STRIPE_WEBHOOK_BYTES);
    const signature = request.headers.get("stripe-signature");
    if (!signature || !(await verifyStripeWebhookSignature(config.webhookSecret, signature, body, Date.now()))) {
        log("warn", "academy_stripe_webhook_signature_rejected", { requestId });
        throw new HttpError(400, "invalid_stripe_signature", "Invalid Stripe signature.");
    }

    const event = parseStripeEvent(body);
    if (!event) throw new HttpError(400, "invalid_stripe_event", "Invalid Stripe event.");
    if (!isRelevantStripeEvent(event.type)) return jsonResponse(request, requestId, 200, { received: true });

    const checkout = event.checkout;
    const purchaseId = stripePurchaseId(checkout);
    if (!purchaseId || !isStripeSessionId(checkout.id) || checkout.payment_status !== "paid") {
        log("warn", "academy_stripe_event_ignored", { eventType: event.type, requestId });
        return jsonResponse(request, requestId, 200, { received: true });
    }

    const now = Date.now();
    const [, checkoutUpdate] = await env.DB.batch([
        env.DB.prepare(`
            INSERT OR IGNORE INTO academy_stripe_events (
                stripe_event_id, stripe_session_id, event_type, stripe_created_at, received_at
            ) VALUES (?, ?, ?, ?, ?)
        `).bind(event.id, checkout.id, event.type, event.createdAt, now),
        env.DB.prepare(`
            UPDATE academy_stripe_checkouts
            SET paid_at = COALESCE(paid_at, ?),
                paid_stripe_event_id = COALESCE(paid_stripe_event_id, ?),
                status = 'paid',
                updated_at = ?
            WHERE purchase_id = ? AND stripe_session_id = ?
        `).bind(now, event.id, now, purchaseId, checkout.id),
    ]);
    let inviteId: string | undefined;
    if (checkoutUpdate?.meta.changes === 1) {
        const invite = await mintPaidInvite(env, purchaseId, checkout.id, now);
        inviteId = invite.id;
    }
    log("info", "academy_stripe_webhook_recorded", {
        eventType: event.type,
        ...(inviteId ? { inviteId } : {}),
        requestId,
    });
    return jsonResponse(request, requestId, 200, { received: true });
}

function parseStripeEvent(body: Uint8Array): { checkout: JsonRecord; createdAt: number; id: string; type: string } | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(decoder.decode(body)) as unknown;
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    const id = parsed.id;
    const type = parsed.type;
    const data = parsed.data;
    if (typeof id !== "string" || id.length > 255 || typeof type !== "string" || !isRecord(data) || !isRecord(data.object)) {
        return null;
    }
    const created = parsed.created;
    const createdAt = typeof created === "number" && Number.isSafeInteger(created) && created > 0
        ? created * 1000
        : Date.now();
    return { checkout: data.object, createdAt, id, type };
}

function stripePurchaseId(checkout: JsonRecord): string | null {
    if (!isRecord(checkout.metadata)) return null;
    const purchaseId = checkout.metadata.academy_purchase_id;
    return typeof purchaseId === "string" && /^checkout_[A-Za-z0-9_-]{43}$/u.test(purchaseId)
        && checkout.client_reference_id === purchaseId
        ? purchaseId
        : null;
}

function isRelevantStripeEvent(type: string): boolean {
    return type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded";
}

export async function verifyStripeWebhookSignature(
    secret: string,
    header: string,
    body: Uint8Array,
    now: number,
): Promise<boolean> {
    const parsed = parseStripeSignature(header);
    if (!parsed || Math.abs(now - parsed.timestamp * 1000) > STRIPE_WEBHOOK_TOLERANCE_MS) return false;

    const prefix = encoder.encode(`${parsed.timestamp}.`);
    const signed = new Uint8Array(prefix.byteLength + body.byteLength);
    signed.set(prefix, 0);
    signed.set(body, prefix.byteLength);
    const expected = await hmacBytes(secret, signed);
    return parsed.signatures.some((candidate) => {
        const supplied = hexToBytes(candidate);
        return supplied ? timingSafeEqual(expected, supplied) : false;
    });
}

export function parseStripeSignature(header: string): { signatures: string[]; timestamp: number } | null {
    const values = header.split(",");
    let timestamp: number | null = null;
    const signatures: string[] = [];
    for (const value of values) {
        const [key, candidate] = value.split("=", 2);
        if (key === "t" && candidate && /^\d{1,12}$/u.test(candidate)) {
            timestamp = Number(candidate);
        } else if (key === "v1" && candidate && /^[0-9a-f]{64}$/iu.test(candidate) && signatures.length < 5) {
            signatures.push(candidate.toLowerCase());
        }
    }
    return timestamp !== null && Number.isSafeInteger(timestamp) && signatures.length > 0 ? { signatures, timestamp } : null;
}

function timingSafeHexEqual(left: string, right: string): boolean {
    const leftBytes = hexToBytes(left);
    const rightBytes = hexToBytes(right);
    return Boolean(leftBytes && rightBytes && timingSafeEqual(leftBytes, rightBytes));
}

function requireStripeConfig(env: Env): StripeConfig {
    const secretKey = optionalConfiguredSecret(env.STRIPE_SECRET_KEY);
    const webhookSecret = optionalConfiguredSecret(env.STRIPE_WEBHOOK_SECRET);
    const priceId = optionalConfiguredSecret(env.STRIPE_PRICE_ID);
    if (!secretKey || !webhookSecret || !priceId) {
        throw new HttpError(503, "stripe_unavailable", "Stripe payments are not configured. Class invites remain available.");
    }
    return { priceId, secretKey, webhookSecret };
}

function optionalConfiguredSecret(value: string | undefined): string | null {
    return typeof value === "string" && value.trim() ? value : null;
}

function isStripeSessionId(value: unknown): value is string {
    return typeof value === "string" && /^cs_[A-Za-z0-9_]{8,255}$/u.test(value);
}

export function isSafeStripeCheckoutUrl(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 2048) return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
    } catch {
        return false;
    }
}

export function isTrustedCheckoutOrigin(value: string): boolean {
    if (value === "https://yomureader.com") return true;
    try {
        const url = new URL(value);
        if (url.origin !== value) return false;
        const loopbackHost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
        return loopbackHost && (url.protocol === "http:" || url.protocol === "https:");
    } catch {
        return false;
    }
}

function checkoutReturnOrigin(request: Request): string {
    const origin = new URL(request.url).origin;
    if (!isTrustedCheckoutOrigin(origin)) {
        throw new HttpError(400, "invalid_checkout_origin", "Checkout is unavailable on this host.");
    }
    return origin;
}

function isCheckoutRow(value: CheckoutRow | null): value is CheckoutRow {
    return Boolean(
        value
        && typeof value.purchase_id === "string"
        && typeof value.stripe_session_id === "string"
        && typeof value.claim_token_hash === "string"
        && Number.isFinite(value.expires_at),
    );
}

async function handleCheckoutSuccessPage(
    request: Request,
    env: Env,
    requestId: string,
    url: URL,
): Promise<Response> {
    requireReadMethod(request);
    requireStripeConfig(env);
    const sessionId = url.searchParams.get("session_id");
    if (!isStripeSessionId(sessionId)) {
        return checkoutStatusPageResponse(request, requestId, 400, "We could not identify that checkout session.");
    }
    return checkoutSuccessPageResponse(request, requestId, sessionId);
}

function loginPageResponse(
    request: Request,
    requestId: string,
    error: "invalid-invite" | undefined,
    status = 200,
): Response {
    const feedback = error === "invalid-invite"
        ? "That code is unavailable. Check it with your teacher and try again."
        : "";
    const nonce = randomToken();
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yomu Academy</title><meta name="color-scheme" content="light dark">
<style>
:root{color-scheme:light dark;--paper:#f7f8f5;--ink:#15221d;--green:#24724f;--line:#c9d4cc;--soft:#e9f0eb}*{box-sizing:border-box}body{margin:0;min-height:100dvh;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;padding:24px}.login{width:min(100%,420px);border:1px solid var(--line);border-radius:8px;padding:30px;background:color-mix(in srgb,var(--paper) 94%,white)}.brand{display:flex;align-items:baseline;gap:9px;font-weight:800;color:var(--green);font-size:21px}.brand span{color:var(--ink);font-size:14px;font-weight:700}h1{font-size:28px;line-height:1.15;margin:28px 0 8px}p{margin:0 0 22px}.intro{margin-bottom:12px}.notice{min-height:1.45em;margin-bottom:14px;color:#9f2f25;font-weight:650}label{display:grid;gap:7px;font-weight:700}input{min-height:46px;border:1px solid var(--line);border-radius:6px;padding:10px 12px;background:transparent;color:inherit;font:inherit;letter-spacing:.04em;text-transform:uppercase}button{width:100%;min-height:46px;border:0;border-radius:6px;margin-top:16px;background:var(--green);color:white;font:inherit;font-weight:750;cursor:pointer}.buy{margin-top:10px;border:1px solid var(--green);background:transparent;color:var(--green)}.checkout-status{min-height:1.45em;margin:12px 0 0;color:var(--ink)}button:disabled{cursor:wait;opacity:.65}input:focus-visible,button:focus-visible{outline:3px solid #88bca4;outline-offset:3px}@media (prefers-color-scheme:dark){:root{--paper:#132019;--ink:#f2f7f2;--green:#72bf98;--line:#385145;--soft:#1d3025}.login{background:#17251d}.notice{color:#ff9c8d}}</style>
</head><body><main class="login"><div class="brand">よむ <span>Academy</span></div><h1>Enter your invite code</h1><p class="intro">Use a class invite or a purchased invite.</p><p class="notice" role="status" aria-live="polite">${feedback}</p><form method="post" action="${API_PREFIX}/login"><label for="invite">Invite code<input id="invite" name="invite" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required maxlength="96"></label><button type="submit">Continue</button></form><button id="buy-invite" class="buy" type="button">Buy an invite</button><p id="checkout-status" class="checkout-status" role="status" aria-live="polite"></p></main>
<script nonce="${nonce}">(() => { const button=document.getElementById('buy-invite'); const status=document.getElementById('checkout-status'); if (!(button instanceof HTMLButtonElement) || !status) return; button.addEventListener('click', async () => { button.disabled=true; status.textContent='Starting secure checkout...'; try { const response=await fetch('${API_PREFIX}/checkout',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'}); const payload=await response.json().catch(() => null); if (!response.ok) { status.textContent=payload?.error?.message || 'Could not start checkout.'; return; } if (!payload || typeof payload.checkoutUrl !== 'string') { status.textContent='Could not start checkout.'; return; } const destination=new URL(payload.checkoutUrl); if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com') { status.textContent='Checkout could not be validated.'; return; } window.location.assign(destination.href); } catch { status.textContent='Could not reach checkout. Please try again.'; } finally { if (status.textContent !== 'Starting secure checkout...') button.disabled=false; } }); })();</script>
</body></html>`;
    return htmlResponse(
        request,
        requestId,
        status,
        html,
        `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    );
}

function checkoutSuccessPageResponse(request: Request, requestId: string, sessionId: string): Response {
    const nonce = randomToken();
    const sessionLiteral = JSON.stringify(sessionId).replace(/</gu, "\\u003c");
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Yomu Academy</title>
<style>:root{color-scheme:light dark;--paper:#f7f8f5;--ink:#15221d;--green:#24724f;--line:#c9d4cc}*{box-sizing:border-box}body{margin:0;min-height:100dvh;background:var(--paper);color:var(--ink);font:16px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;padding:24px}main{width:min(100%,500px);border:1px solid var(--line);border-radius:8px;padding:30px}.brand{color:var(--green);font-size:21px;font-weight:800}h1{font-size:28px;line-height:1.15;margin:28px 0 8px}.code{display:none;margin:20px 0;padding:14px;border:1px solid var(--line);border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:750;word-break:break-all}a{color:var(--green);font-weight:700}@media (prefers-color-scheme:dark){:root{--paper:#132019;--ink:#f2f7f2;--green:#72bf98;--line:#385145}}</style>
</head><body><main><div class="brand">よむ Academy</div><h1>Preparing your invite</h1><p id="status" role="status">Verifying payment.</p><output id="invite-code" class="code" aria-live="polite"></output><p><a href="${LOGIN_PATH}">Go to sign in</a></p></main>
<script nonce="${nonce}">(() => { const sessionId=${sessionLiteral}; const status=document.getElementById('status'); const code=document.getElementById('invite-code'); fetch('${API_PREFIX}/checkout/verify',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId})}).then(async response => ({ok:response.ok,payload:await response.json().catch(() => null)})).then(({ok,payload}) => { if(!ok || !payload || typeof payload.inviteCode !== 'string'){status.textContent=payload?.error?.message || 'Payment is still being confirmed. Refresh this page in a moment.';return;} code.textContent=payload.inviteCode; code.style.display='block'; status.textContent='Your one-use invite is ready.'; }).catch(() => {status.textContent='Payment is still being confirmed. Refresh this page in a moment.';}); })();</script>
</body></html>`;
    return htmlResponse(
        request,
        requestId,
        200,
        html,
        `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
    );
}

function checkoutStatusPageResponse(request: Request, requestId: string, status: number, message: string): Response {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Yomu Academy</title></head><body><main><h1>Yomu Academy</h1><p>${message}</p><p><a href="${LOGIN_PATH}">Go to sign in</a></p></main></body></html>`;
    return htmlResponse(request, requestId, status, html, "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
}

function htmlResponse(
    request: Request,
    requestId: string,
    status: number,
    html: string,
    contentSecurityPolicy: string,
): Response {
    const headers = new Headers({
        "cache-control": "no-store",
        "content-security-policy": contentSecurityPolicy,
        "content-type": "text/html; charset=utf-8",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "x-request-id": requestId,
    });
    return new Response(request.method === "HEAD" ? null : html, { headers, status });
}
