import { AccessError, HttpAccessGateway, LocalQaAccessGateway, sessionCanResume } from '../../src/academy/access/gateway';

describe('Academy access gateway', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('calls the browser fetch default without binding it to the gateway instance', async () => {
        const request = vi.fn(function(this: unknown) {
            if (this !== undefined) throw new TypeError('Illegal invocation');
            const now = Date.now();
            return Promise.resolve(new Response(JSON.stringify({
                sessionId: 'session-native-fetch',
                expiresAt: now + 60_000,
                offlineResumeUntil: now + 120_000,
            }), { status: 200, headers: { 'content-type': 'application/json' } }));
        });
        vi.stubGlobal('fetch', request);

        await expect(new HttpAccessGateway('/academy/api/session').exchange('UCL2026'))
            .resolves.toMatchObject({ sessionId: 'session-native-fetch', source: 'cloudflare' });
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('exchanges a normalized code through the secure session endpoint', async () => {
        const expiresAt = Date.now() + 60_000;
        const offlineResumeUntil = expiresAt + 60_000;
        const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
            sessionId: 'session-1',
            expiresAt,
            offlineResumeUntil,
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
        const gateway = new HttpAccessGateway('/academy/api/session', request as typeof fetch);

        const session = await gateway.exchange(' ucl2026 ');
        expect(session).toEqual({ sessionId: 'session-1', expiresAt, offlineResumeUntil, source: 'cloudflare' });
        expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({ code: 'UCL2026' });
        expect(request.mock.calls[0][1]).toMatchObject({ credentials: 'include', cache: 'no-store' });
    });

    it('classifies rejected and unavailable invitations without leaking response text', async () => {
        const rejected = new HttpAccessGateway('/academy/api/session', vi.fn(async () => new Response('secret', { status: 403 })) as typeof fetch);
        await expect(rejected.exchange('NOPE1')).rejects.toMatchObject({ code: 'invalid' });

        const unavailable = new HttpAccessGateway('/academy/api/session', vi.fn(async () => { throw new Error('network'); }) as typeof fetch);
        await expect(unavailable.exchange('UCL2026')).rejects.toEqual(expect.objectContaining<Partial<AccessError>>({ code: 'unavailable' }));
    });

    it('keeps UCL2026 local-only for deterministic QA and allows bounded offline resume', async () => {
        const session = await new LocalQaAccessGateway().exchange('UCL2026');
        expect(session.source).toBe('local-qa');
        await expect(new LocalQaAccessGateway().exchange('WRONG1')).rejects.toMatchObject({ code: 'invalid' });
        expect(sessionCanResume(session, session.expiresAt + 1, false)).toBe(true);
        expect(sessionCanResume(session, session.expiresAt + 1, true)).toBe(false);
    });
});
