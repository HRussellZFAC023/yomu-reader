export type InviteSessionSource = 'cloudflare' | 'local-qa';

export interface InviteSession {
    readonly sessionId: string;
    readonly expiresAt: number;
    readonly offlineResumeUntil: number;
    readonly source: InviteSessionSource;
}

export interface AccessGateway {
    exchange(code: string, signal?: AbortSignal): Promise<InviteSession>;
}

/** UCL2026 is the single Academy invitation that may remain account-free. */
export function isAnonymousAcademyCode(code: string): boolean {
    return normalizeCode(code) === 'UCL2026';
}

export class AccessError extends Error {
    constructor(readonly code: 'invalid' | 'unavailable' | 'malformed', message: string) {
        super(message);
        this.name = 'AccessError';
    }
}

export function createAccessGateway(location: Pick<Location, 'hostname'> = window.location): AccessGateway {
    const remote = new HttpAccessGateway('/academy/api/session');
    return localQaHost(location.hostname)
        ? new LocalQaFallbackGateway(remote, new LocalQaAccessGateway())
        : remote;
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

export class LocalQaAccessGateway implements AccessGateway {
    async exchange(code: string): Promise<InviteSession> {
        if (normalizeCode(code) !== 'UCL2026') throw new AccessError('invalid', 'Invitation was not accepted.');
        const now = Date.now();
        return {
            sessionId: `local-qa-${crypto.randomUUID()}`,
            expiresAt: now + 8 * 60 * 60_000,
            offlineResumeUntil: now + 30 * 24 * 60 * 60_000,
            source: 'local-qa',
        };
    }
}

export function sessionCanResume(session: InviteSession, now: number, online: boolean): boolean {
    return online ? session.expiresAt > now : session.offlineResumeUntil > now;
}

class LocalQaFallbackGateway implements AccessGateway {
    constructor(private readonly remote: AccessGateway, private readonly local: AccessGateway) {}

    async exchange(code: string, signal?: AbortSignal): Promise<InviteSession> {
        try {
            return await this.remote.exchange(code, signal);
        } catch (error) {
            if (error instanceof AccessError && error.code === 'unavailable') return this.local.exchange(code, signal);
            throw error;
        }
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
    if (!sessionId || expiresAt <= Date.now() || offlineResumeUntil < expiresAt) {
        throw new AccessError('malformed', 'Invitation response is incomplete.');
    }
    return { sessionId, expiresAt, offlineResumeUntil, source };
}

function readTimestamp(value: unknown): number {
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (Number.isSafeInteger(parsed)) return parsed;
    }
    return 0;
}

function localQaHost(hostname: string): boolean {
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
