import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Electron MAIN process parses every OCR answer before the renderer sees a
 * word of it, and that parse keeps only lines in the language being studied.
 * Main loads no settings and has no DOM, so nothing in it ever adopted a study
 * target: it answered for the default one, and a player studying Korean got
 * every recognized line thrown away inside the parse — before the renderer's
 * own target-aware filter could ever run.
 *
 * These tests run in a module graph that has adopted nothing, which is exactly
 * main's state at boot. The only thing that can make a non-Japanese line
 * survive here is the request carrying its own target across the IPC boundary.
 *
 * `vi.resetModules()` plus dynamic import is load-bearing rather than
 * decoration: the active target is module state, so a graph some other test
 * already adopted into would pass whether or not the boundary is crossed.
 */

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const KOREAN_LINE = '모험을 시작하자';
const JAPANESE_LINE = '冒険を始めよう';

/** A Cloud Vision answer with one line of each language and nothing else. */
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

/**
 * Main's own module graph, freshly instantiated. Nothing here has adopted a
 * learning target — the renderer's `adoptLearningTargetFromSettings` lives on
 * the other side of the process boundary and cannot reach this state.
 */
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

/** Recognized text as main hands it back, for whatever the request studies. */
async function mainProcessLines(targetLanguage: string): Promise<string[]> {
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
        targetLanguage,
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
    it('keeps the lines of the language being studied, not the Japanese ones', async () => {
        await expect(mainProcessLines('ko')).resolves.toEqual([KOREAN_LINE]);
    });

    it('still keeps only Japanese for a Japanese request, from the same answer', async () => {
        // The contrast is the proof: one fixture, two requests, two different
        // survivors. If main were still parsing for its own default target,
        // both of these would come back Japanese.
        await expect(mainProcessLines('ja')).resolves.toEqual([JAPANESE_LINE]);
    });

    it('falls back to the default target when a request names none', async () => {
        const main = await freshMainProcessModules();
        // A malformed or older message must land on the behaviour main already
        // had, not on whichever target the previous capture happened to adopt.
        main.setActiveLearningTargetLanguage('ko');
        expect(main.activeLearningTargetLanguage()).toBe('ko');

        const response = await main.requestGamingOcr(main.normalizeOcrRequest({
            provider: 'cloud-vision',
            cloudVisionApiKey: 'test-key',
            imageDataUrl: TINY_PNG,
            width: 640,
            height: 360,
        }));

        expect(main.activeLearningTargetLanguage()).toBe('ja');
        expect((response.body as { lines: Array<{ text: string }> }).lines.map(line => line.text))
            .toEqual([JAPANESE_LINE]);
    });

    it('asks Google Lens to read in the language being studied', async () => {
        // Lens weights its OCR by the caller's accept-language, and main builds
        // that header from the target it has just adopted — the same shared
        // builder the reader's own Lens recognizer uses.
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
            targetLanguage: 'ko',
        }));

        expect(headers[0]?.['accept-language']).toBe('ko,en-US;q=0.9,en;q=0.8');
    });

    it('tells a local OCR service which language to read', async () => {
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
            // Nothing configured, so the tags come from the adopted target.
            language: '',
            targetLanguage: 'ko',
        }));

        const body = JSON.parse(bodies[0]!) as Record<string, unknown>;
        expect(body.language_code).toBe('ko-KR');
        expect(body.language).toEqual({ bcp47_tag: 'ko-KR', two_letter_code: 'ko' });
    });

    it('adopts the target for every provider, before any answer is parsed', async () => {
        // Google Lens is the default provider and returns an already-parsed
        // body from main, so the adoption cannot hang off the Cloud Vision
        // branch. Pinned on the active target rather than on parsed lines so it
        // holds for a provider whose fixture is a protobuf.
        const main = await freshMainProcessModules();
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

        await main.requestGamingOcr(main.normalizeOcrRequest({
            provider: 'google-lens',
            imageDataUrl: TINY_PNG,
            width: 640,
            height: 360,
            targetLanguage: 'ko',
        }));

        expect(main.activeLearningTargetLanguage()).toBe('ko');
    });
});

describe('the study target crossing the process boundary', () => {
    it('survives the renderer building the request and IPC serializing it', async () => {
        const main = await freshMainProcessModules();
        main.setActiveLearningTargetLanguage('ko');

        // What the preload actually hands ipcRenderer.invoke: a structured
        // clone of the renderer's object, with no class or closure left.
        const overTheWire = JSON.parse(JSON.stringify(main.gamingOcrRequest({
            ocrProvider: 'cloud-vision',
            ocrEndpointUrl: '',
            ocrCloudVisionApiKey: 'test-key',
            ocrEngine: 'auto',
            ocrLanguage: '',
        }, { dataUrl: TINY_PNG, width: 640, height: 360 })));

        expect(overTheWire.targetLanguage).toBe('ko');
        expect(main.normalizeOcrRequest(overTheWire).targetLanguage).toBe('ko');

        const response = await main.requestGamingOcr(main.normalizeOcrRequest(overTheWire));
        expect((response.body as { lines: Array<{ text: string }> }).lines.map(line => line.text))
            .toEqual([KOREAN_LINE]);
    });

    it('carries a target the player switches to at runtime', async () => {
        const main = await freshMainProcessModules();
        const settings = {
            ocrProvider: 'cloud-vision',
            ocrEndpointUrl: '',
            ocrEngine: 'auto',
            ocrLanguage: '',
        };
        const image = { dataUrl: TINY_PNG, width: 640, height: 360 };

        // The renderer resolves the target when it builds each request, so the
        // capture after a switch is the one that carries it — no separate
        // "tell main the target changed" message to forget to send.
        expect(main.gamingOcrRequest(settings, image).targetLanguage).toBe('ja');
        main.setActiveLearningTargetLanguage('ko');
        expect(main.gamingOcrRequest(settings, image).targetLanguage).toBe('ko');
    });
});
