import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Electron MAIN process parses every OCR answer before the renderer sees a
 * word of it, and that parse keeps only the Japanese lines. Main loads no
 * settings and has no DOM, so nothing in it may depend on a study target being
 * adopted first: Yomu is Japanese-only, and main reads Japanese from boot.
 *
 * These tests run in a freshly instantiated module graph, which is exactly
 * main's state at boot. `vi.resetModules()` plus dynamic import keeps another
 * test's module state from answering for main.
 */

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const KOREAN_LINE = '모험을 시작하자';
const JAPANESE_LINE = '冒険を始めよう';

/** A Cloud Vision answer with one Japanese line and one line in another script. */
function cloudVisionBody() {
    return {
        responses: [{
            textAnnotations: [
                { description: `${KOREAN_LINE}\n${JAPANESE_LINE}` },
                { description: KOREAN_LINE, boundingPoly: { vertices: box(20) } },
                { description: JAPANESE_LINE, boundingPoly: { vertices: box(80) } },
            ],
        }],
    };
}

function box(top: number) {
    return [{ x: 10, y: top }, { x: 190, y: top }, { x: 190, y: top + 28 }, { x: 10, y: top + 28 }];
}

/** Main's own module graph, freshly instantiated. */
async function freshMainProcessModules() {
    vi.resetModules();
    const [ocr, active, shared] = await Promise.all([
        import('../../src/gaming/ocr'),
        import('../../src/reader/languages/active'),
        import('../../src/gaming/shared'),
    ]);
    expect(active.activeLearningTargetLanguage()).toBe('ja');
    return { ...ocr, ...active, ...shared };
}

/** Recognized text as main hands it back for one raw IPC request. */
async function mainProcessLines(request: Record<string, unknown> = {}): Promise<string[]> {
    const main = await freshMainProcessModules();
    const response = await main.requestGamingOcr(main.normalizeOcrRequest({
        provider: 'cloud-vision',
        endpointUrl: '',
        cloudVisionApiKey: 'test-key',
        imageDataUrl: TINY_PNG,
        width: 640,
        height: 360,
        engine: 'auto',
        language: '',
        ...request,
    }));
    expect(response.ok).toBe(true);
    const body = response.body as { lines: Array<{ text: string }> };
    return body.lines.map(line => line.text);
}

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => cloudVisionBody(),
    } as unknown as Response)));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('Yomu Gaming OCR in the Electron main process', () => {
    it('keeps only the Japanese lines of an answer from boot', async () => {
        await expect(mainProcessLines()).resolves.toEqual([JAPANESE_LINE]);
    });

    it('ignores a target language an older renderer still sends', async () => {
        // A renderer from before Yomu became Japanese-only may still put a
        // target on the request. Main must neither keep its lines nor adopt it.
        await expect(mainProcessLines({ targetLanguage: 'ko' })).resolves.toEqual([JAPANESE_LINE]);
        const main = await freshMainProcessModules();
        expect(main.normalizeOcrRequest({ imageDataUrl: TINY_PNG, targetLanguage: 'ko' }))
            .not.toHaveProperty('targetLanguage');
        expect(main.activeLearningTargetLanguage()).toBe('ja');
    });

    it('asks Google Lens to read Japanese', async () => {
        // Lens weights its OCR by the caller's accept-language — the same
        // shared builder the reader's own Lens recognizer uses.
        const main = await freshMainProcessModules();
        const headers: Array<Record<string, string>> = [];
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            headers.push({ ...(init?.headers as Record<string, string> | undefined) });
            return {
                ok: true,
                status: 200,
                arrayBuffer: async () => new ArrayBuffer(0),
                text: async () => '',
            } as unknown as Response;
        }));

        await main.requestGamingOcr(main.normalizeOcrRequest({
            provider: 'google-lens',
            imageDataUrl: TINY_PNG,
            width: 640,
            height: 360,
        }));

        expect(headers[0]?.['accept-language']).toBe('ja,en-US;q=0.9,en;q=0.8');
    });

    it('tells a local OCR service to read Japanese when nothing is configured', async () => {
        const main = await freshMainProcessModules();
        const bodies: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            bodies.push(String(init?.body ?? ''));
            return { ok: true, status: 200, text: async () => '' } as unknown as Response;
        }));

        await main.requestGamingOcr(main.normalizeOcrRequest({
            provider: 'local-service',
            endpointUrl: 'http://127.0.0.1:65000/ocr',
            imageDataUrl: TINY_PNG,
            width: 640,
            height: 360,
            language: '',
        }));

        const body = JSON.parse(bodies[0]!) as Record<string, unknown>;
        expect(body.language_code).toBe('ja-JP');
        expect(body.language).toEqual({ bcp47_tag: 'ja-JP', two_letter_code: 'ja' });
    });
});

describe('the OCR request crossing the process boundary', () => {
    it('survives the renderer building the request and IPC serializing it', async () => {
        const main = await freshMainProcessModules();

        // What the preload actually hands ipcRenderer.invoke: a structured
        // clone of the renderer's object, with no class or closure left.
        const overTheWire = JSON.parse(JSON.stringify(main.gamingOcrRequest({
            ocrProvider: 'cloud-vision',
            ocrEndpointUrl: '',
            ocrCloudVisionApiKey: 'test-key',
            ocrEngine: 'auto',
            ocrLanguage: '',
        }, { dataUrl: TINY_PNG, width: 640, height: 360 })));

        expect(overTheWire).not.toHaveProperty('targetLanguage');
        expect(overTheWire.language).toBe('ja-JP');

        const response = await main.requestGamingOcr(main.normalizeOcrRequest(overTheWire));
        expect((response.body as { lines: Array<{ text: string }> }).lines.map(line => line.text))
            .toEqual([JAPANESE_LINE]);
    });
});
