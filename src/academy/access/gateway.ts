export type InviteSessionSource = 'cloudflare' | 'local-qa';

export interface InviteSession {
    readonly sessionId: string;
    readonly expiresAt: number;
    readonly offlineResumeUntil: number;
    readonly accountRequired: boolean;
    readonly source: InviteSessionSource;
}

export interface AccessGateway {
    exchange(code: string, signal?: AbortSignal): Promise<InviteSession>;
}

export class AccessError extends Error {
    constructor(readonly code: 'invalid' | 'unavailable' | 'malformed', message: string) {
        super(message);
        this.name = 'AccessError';
    }
}

export function createAccessGateway(location: Pick<Location, 'hostname'> = window.location): AccessGateway {
    void location;
    return new HttpAccessGateway('/academy/api/session');
}

export class HttpAccessGateway implements AccessGateway {
    constructor(
        private readonly endpoint: string,
        // Native Window.fetch rejects when stored and later invoked as an
        // instance method because the gateway becomes its `this` value.
        // Keep the default as a lexical call while preserving test injection.
        private readonly request: typeof fetch = (...args) => fetch(...args),
    ) {}

    async exchange(code: string, signal?: AbortSignal): Promise<InviteSession> {
        const normalized = normalizeCode(code);
        let response: Response;
        try {
            response = await this.request(this.endpoint, {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ code: normalized }),
                signal,
            });
        } catch (error) {
            if (signal?.aborted) throw error;
            throw new AccessError('unavailable', 'Invitation service unavailable.');
        }
        if (response.status === 401 || response.status === 403 || response.status === 404) {
            throw new AccessError('invalid', 'Invitation was not accepted.');
        }
        if (!response.ok) throw new AccessError('unavailable', `Invitation service returned ${response.status}.`);
        return normalizeSession(await response.json(), 'cloudflare');
    }
}

export function sessionCanResume(session: InviteSession, now: number, online: boolean): boolean {
    return online ? session.expiresAt > now : session.offlineResumeUntil > now;
}

/**
 * Rotate the HttpOnly session cookie through the Worker while the fixed
 * 30-day offline-resume window is still valid. Returns the refreshed session
 * contract, or null when the Worker refuses (revoked, unknown, or beyond the
 * resume window) or cannot be reached — callers fall back to the invite
 * screen either way, so failures stay deterministic and silent.
 */
export async function resumeInviteSession(
    request: typeof fetch = (...args) => fetch(...args),
): Promise<InviteSession | null> {
    let response: Response;
    try {
        response = await request('/academy/api/session/resume', {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
        });
    } catch {
        return null;
    }
    if (!response.ok) return null;
    try {
        return normalizeSession(await response.json(), 'cloudflare');
    } catch {
        return null;
    }
}

function normalizeCode(code: string): string {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,64}$/.test(normalized)) throw new AccessError('invalid', 'Invitation code is malformed.');
    return normalized;
}

function normalizeSession(value: unknown, source: InviteSessionSource): InviteSession {
    if (!isRecord(value)) throw new AccessError('malformed', 'Invitation response is malformed.');
    const sessionId = typeof value.sessionId === 'string' ? value.sessionId.trim() : '';
    const expiresAt = readTimestamp(value.expiresAt);
    const offlineResumeUntil = readTimestamp(value.offlineResumeUntil);
    const accountRequired = value.accountRequired;
    if (!sessionId || expiresAt <= Date.now() || offlineResumeUntil < expiresAt || typeof accountRequired !== 'boolean') {
        throw new AccessError('malformed', 'Invitation response is incomplete.');
    }
    return { sessionId, expiresAt, offlineResumeUntil, accountRequired, source };
}

function readTimestamp(value: unknown): number {
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (Number.isSafeInteger(parsed)) return parsed;
    }
    return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
