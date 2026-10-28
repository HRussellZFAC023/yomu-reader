import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { requestGamingOcr } from '../../src/gaming/ocr';
import type { OcrResult } from '../../src/reader/ocr/response';

// Real Google Lens answers (scripts/fixtures/recorded/ATTRIBUTION.md): a plain
// grey frame Lens found no text in, and a street sign it read.
const lensAnswer = (name: string) => readFileSync(`scripts/fixtures/ocr/${name}.lens-crupload.pb`);

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
        targetLanguage: 'ja',
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

    it('reports a Google Lens refusal as an error, not as an empty read', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }));
        const response = await requestGamingOcr({ ...localRequest(''), provider: 'google-lens' });
        expect(response.ok).toBe(false);
        expect(response.error).toContain('429');
        // One protobuf call: nothing is uploaded to lens.google.com to hide the error.
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(String(fetchSpy.mock.calls[0][0])).toContain('lensfrontend-pa.googleapis.com');
        fetchSpy.mockRestore();
    });

    it.each([
        ['a cut-off protobuf', new Uint8Array([0x12, 0xff])],
        ['an HTML error page', new TextEncoder().encode('<!doctype html><title>Service unavailable</title>')],
        ['an empty body', new Uint8Array()],
    ])('reports %s from Google Lens as an error, not as an empty read', async (_name, body) => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status: 200 }));
        const response = await requestGamingOcr({ ...localRequest(''), provider: 'google-lens' });
        expect(response.ok).toBe(false);
        expect(response.body).toBeNull();
        fetchSpy.mockRestore();
    });

    it('reads Lens answers: no text in a grey frame, the lines of a sign', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(lensAnswer('grey-frame'), { status: 200 }))
            .mockResolvedValueOnce(new Response(lensAnswer('commons-sign-photo'), { status: 200 }));
        const grey = await requestGamingOcr({ ...localRequest(''), provider: 'google-lens', width: 640, height: 480 });
        expect(grey.ok).toBe(true);
        expect((grey.body as OcrResult).lines).toEqual([]);
        const sign = await requestGamingOcr({ ...localRequest(''), provider: 'google-lens', width: 960, height: 720 });
        expect(sign.ok).toBe(true);
        expect((sign.body as OcrResult).lines.length).toBeGreaterThan(0);
        fetchSpy.mockRestore();
    });

    it('reports a Cloud Vision error for the image as an error, not as an empty read', async () => {
        const answer = { responses: [{ error: { code: 3, message: 'Bad image data.' } }] };
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(answer), { status: 200 }));
        const response = await requestGamingOcr({ ...localRequest(''), provider: 'cloud-vision', cloudVisionApiKey: 'test-key' });
        expect(response.ok).toBe(false);
        expect(response.error).toContain('Bad image data.');
        fetchSpy.mockRestore();
    });
});
