import { describe, expect, it, vi } from 'vitest';
import { requestGamingOcr } from '../../src/gaming/ocr';

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function localRequest(endpointUrl: string) {
    return {
        provider: 'local-service' as const,
        endpointUrl,
        imageDataUrl: TINY_PNG,
        width: 1,
        height: 1,
        engine: 'auto',
        language: 'ja-JP',
    };
}

describe('Yomu Gaming OCR provider routing', () => {
    it('refuses to send screenshots to a non-loopback local OCR endpoint (SSRF guard)', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const response = await requestGamingOcr(localRequest('http://evil.example.com/ocr'));
        expect(response.ok).toBe(false);
        expect(response.error).toMatch(/on this machine|localhost|127\.0\.0\.1/i);
        // The guard must reject BEFORE any network egress with the captured frame.
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    it('rejects a private-range local OCR endpoint without leaking the capture', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const response = await requestGamingOcr(localRequest('http://169.254.169.254/latest/meta-data'));
        expect(response.ok).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    it('reports image OCR being off without attempting a request', async () => {
        const response = await requestGamingOcr({ ...localRequest('http://127.0.0.1:1/ocr'), provider: 'off' });
        expect(response.ok).toBe(false);
        expect(response.error).toMatch(/off/i);
    });

    it('treats a loopback endpoint as allowed and attempts the request', async () => {
        // localhost passes the guard, so it proceeds to fetch (which fails fast here);
        // the point is that the guard does NOT short-circuit loopback the way it does remote hosts.
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));
        const response = await requestGamingOcr(localRequest('http://127.0.0.1:65000/ocr'));
        expect(response.ok).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        fetchSpy.mockRestore();
    });
});
