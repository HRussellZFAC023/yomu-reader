import { describe, expect, it, vi } from 'vitest';
import PublicProxyWorker from '../../workers/jpdb-public-proxy/src/index';

describe('Yomu public proxy Worker', () => {
    it('retries transient upstream failures with minimal headers', async () => {
        const fetchMock = vi.fn((_request: Request) => Promise.resolve(new Response('ok', { status: 200 })));
        fetchMock.mockResolvedValueOnce(new Response('ssl failed', { status: 525 }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            const response = await PublicProxyWorker.fetch(new Request(
                'https://yomu-jpdb-public-proxy.example/?url=https%3A%2F%2Fjisho.org%2Fsearch%2F%E6%97%A5%E6%9C%AC',
                { headers: { accept: 'text/html', origin: 'https://hrussellzfac023.github.io' } },
            ), {}, { waitUntil: vi.fn() });

            expect(response.status).toBe(200);
            expect(await response.text()).toBe('ok');
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect((fetchMock.mock.calls[0][0] as Request).headers.get('accept')).toBe('text/html');
            expect((fetchMock.mock.calls[1][0] as Request).headers.has('accept')).toBe(false);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('returns CORS-safe bad gateway responses when upstream fetch throws', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('TLS handshake failed'))));

        try {
            const response = await PublicProxyWorker.fetch(new Request(
                'https://yomu-jpdb-public-proxy.example/?url=https%3A%2F%2Fjpdb.io%2Fsearch%3Fq%3D%E8%A6%8B%E3%81%9F',
                { headers: { origin: 'https://hrussellzfac023.github.io' } },
            ), {}, { waitUntil: vi.fn() });

            expect(response.status).toBe(502);
            expect(response.headers.get('access-control-allow-origin')).toBe('https://hrussellzfac023.github.io');
            expect(response.headers.get('x-yomu-proxy-error')).toBe('upstream');
            await expect(response.text()).resolves.toContain('TLS handshake failed');
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
