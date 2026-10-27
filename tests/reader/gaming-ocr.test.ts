import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { requestGamingOcr } from '../../src/gaming/ocr';
import type { OcrResult } from '../../src/reader/ocr/response';
import { gamingLookupCandidates, gamingOcrRequest, normalizeGamingOcrResponse, yomuStudySearchUrl } from "../../src/gaming/shared";
import { DEFAULT_SETTINGS, normalizeReaderSettings } from "../../src/reader/settings/index";
import { readFormSettings } from "../../src/reader/settings/form-read";
import type { ReaderSettings } from "../../src/reader/app/types";
import { join } from "node:path";
import { afterEach } from "vitest";
import { JitenApiClient } from "../../src/reader/dictionaries/jiten";
import { requestHttp } from "../../src/reader/network/http-request";
import type { JPDBCard } from "../../src/reader/app/types";
import { installGamingHttpTransport } from "../../src/gaming/renderer/http-transport";
import { beforeEach } from "vitest";

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

describe("gaming shared", () => {
    const CAPTURE_IMAGE = { dataUrl: 'data:image/png;base64,AAAA', width: 640, height: 360 };

    function captureSettings(overrides: Record<string, string> = {}) {
        return {
            ocrProvider: DEFAULT_SETTINGS.ocrProvider,
            ocrEndpointUrl: DEFAULT_SETTINGS.ocrEndpointUrl,
            ocrCloudVisionApiKey: DEFAULT_SETTINGS.ocrCloudVisionApiKey,
            ocrEngine: DEFAULT_SETTINGS.ocrEngine,
            ocrLanguage: DEFAULT_SETTINGS.ocrLanguage,
            ...overrides,
        };
    }

    describe('Yomu Gaming shared helpers', () => {
        it('normalizes local OCR responses into Japanese lines', () => {
            const result = normalizeGamingOcrResponse({
                width: 800,
                height: 450,
                lines: [
                    { text: '冒険を始めよう', box: { left: 10, top: 20, width: 180, height: 28 } },
                    { text: 'Press A', box: { left: 10, top: 60, width: 120, height: 28 } },
                ],
            }, 640, 360);

            expect(result?.width).toBe(800);
            expect(result?.lines).toHaveLength(1);
            expect(result?.lines[0].text).toBe('冒険を始めよう');
            expect(result?.lines[0].hasGeometry).toBe(true);
        });

        it('marks plain OCR text fallback as having no geometry', () => {
            const result = normalizeGamingOcrResponse({
                width: 800,
                height: 450,
                text: '冒険を始めよう',
            }, 640, 360);

            expect(result?.lines[0].hasGeometry).toBe(false);
        });

        it('builds lookup candidates from game dialogue', () => {
            expect(gamingLookupCandidates('もう一度、冒険を始めよう。')).toContain('冒険');
        });

        it('links captured terms to the Yomu study search surface', () => {
            const url = new URL(yomuStudySearchUrl('冒険'));
            expect(url.hostname).toBe('yomureader.com');
            expect(url.searchParams.get('mode')).toBe('search');
            expect(url.searchParams.get('q')).toBe('冒険');
        });

        it('asks for OCR in Japanese and names no study target', () => {
            const request = gamingOcrRequest(captureSettings(), CAPTURE_IMAGE);
            expect(request.language).toBe('ja-JP');
            expect(request).not.toHaveProperty('targetLanguage');
        });

        it('still sends an explicitly configured OCR language over the Japanese default', () => {
            expect(gamingOcrRequest(captureSettings({ ocrLanguage: 'de-DE' }), CAPTURE_IMAGE).language).toBe('de-DE');
        });

        it('offers no lookup candidates for a line without Japanese', () => {
            expect(gamingLookupCandidates('Press A')).toEqual([]);
        });

        it('leads its candidates with the whole recognized line', () => {
            expect(gamingLookupCandidates('もう一度、冒険を始めよう。')[0]).toBe('もう一度、冒険を始めよう。');
        });
    });

    /**
     * The capture path must own NO opinion about which characters are worth
     * reading. It used to carry its own kana/kanji regex; the Japanese Adapter's
     * text predicate decides.
     */
    describe('Yomu Gaming line filtering defers to the Japanese predicate', () => {
        it('keeps halfwidth katakana the old local regex threw away', () => {
            const result = normalizeGamingOcrResponse({
                width: 800,
                height: 450,
                lines: [{ text: 'ﾎﾟｰｼｮﾝ', box: { left: 10, top: 20, width: 180, height: 28 } }],
            }, 640, 360);

            expect(result?.lines.map(line => line.text)).toEqual(['ﾎﾟｰｼｮﾝ']);
        });
    });

    /**
     * Saving the form must not resolve the "use the default" sentinel into a
     * literal that nothing can clear. Gaming persists on seven handlers including a
     * theme click, so that would be every install. This walks the real path —
     * render, save, reload — rather than handing `gamingOcrRequest` a settings
     * object directly.
     */
    describe('Yomu Gaming OCR language across a settings save', () => {
        it('keeps the Japanese default unpinned after the settings form is saved', () => {
            const saved = readFormSettings(new FormData(), DEFAULT_SETTINGS);
            const reloaded = normalizeReaderSettings(
                JSON.parse(JSON.stringify(saved)) as ReaderSettings,
            );
            expect(reloaded.ocrLanguage).toBe('');
            expect(gamingOcrRequest(reloaded, CAPTURE_IMAGE).language).toBe('ja-JP');
        });

        it('unpins an OCR language an older build already wrote', () => {
            const pinnedByAnOlderBuild = normalizeReaderSettings({ ...DEFAULT_SETTINGS, ocrLanguage: 'ja-JP' });

            expect(pinnedByAnOlderBuild.ocrLanguage).toBe('');
            expect(gamingOcrRequest(pinnedByAnOlderBuild, CAPTURE_IMAGE).language).toBe('ja-JP');
        });
    });
});

describe('Yomu Gaming overlay content policy', () => {
    // The overlay's request route (renderer/http-transport.ts) is fetch() under this policy.
    // AnkiConnect listens on this machine over plain http, which an https-only policy
    // refused, so adding a word to Anki from a game could never leave the overlay.
    it('lets the overlay reach AnkiConnect on this machine and no other plain-http host', () => {
        const html = readFileSync(join(process.cwd(), 'src/gaming/renderer/index.html'), 'utf8');
        const connectSources = /connect-src ([^;"]+)/.exec(html)?.[1].trim().split(/\s+/) ?? [];
        expect(connectSources.filter(source => source.startsWith('http:'))).toEqual([
            'http://127.0.0.1:8765',
            'http://localhost:8765',
        ]);
    });
});

describe('Yomu Gaming HTTP transport', () => {
    type TransportWindow = Window & { GM_xmlhttpRequest?: unknown };

    const JITEN_CARD = {
        vid: 1234,
        sid: 0,
        source: 'jiten',
        spelling: '冒険',
        reading: 'ぼうけん',
        jitenWordId: 1234,
        jitenReadingIndex: 0,
    } as unknown as JPDBCard;

    function jitenResponse(status: number, body: unknown): Response {
        return new Response(body === undefined ? null : JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        });
    }


    afterEach(() => {
        delete (window as TransportWindow).GM_xmlhttpRequest;
        vi.restoreAllMocks();
    });

    // The baseline the learner hit: the overlay is a plain page with no userscript
    // manager, and the reader keeps a Jiten API key off every proxy it does not own,
    // so an authenticated Jiten write had no route at all and the popup said
    // "Action failed."
    it('has no route for an authenticated Jiten write without the Gaming transport', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const client = new JitenApiClient(() => 'learner-key');
        await expect(client.reviewCard(JITEN_CARD, 'okay')).rejects.toThrow();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sends a Jiten grade from the overlay with the learner key', async () => {
        const fetchImpl = vi.fn(async () => jitenResponse(200, { result: true }));
        installGamingHttpTransport(window, fetchImpl);
        const client = new JitenApiClient(() => 'learner-key');

        await client.reviewCard(JITEN_CARD, 'okay');

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://api.jiten.moe/api/srs/review');
        expect(init.method).toBe('POST');
        expect(new Headers(init.headers).get('Authorization')).toBe('ApiKey learner-key');
        expect(JSON.parse(String(init.body))).toMatchObject({ wordId: 1234, readingIndex: 0 });
        expect(init.credentials).toBe('omit');
    });

    it('adds a word to a Jiten deck from the overlay', async () => {
        const fetchImpl = vi.fn(async () => jitenResponse(204, undefined));
        installGamingHttpTransport(window, fetchImpl);
        const client = new JitenApiClient(() => 'learner-key');

        await client.addToStudyDeck(7, JITEN_CARD, '冒険を始めよう。', 'Yomu Gaming');

        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://api.jiten.moe/api/srs/study-decks/7/words');
        expect(JSON.parse(String(init.body))).toMatchObject({ wordId: 1234, readingIndex: 0, sentence: '冒険を始めよう。' });
    });

    it('reports a rejected key as a Jiten failure instead of a transport gap', async () => {
        const fetchImpl = vi.fn(async () => jitenResponse(401, { title: 'Unauthorized' }));
        installGamingHttpTransport(window, fetchImpl);
        const client = new JitenApiClient(() => 'stale-key');

        await expect(client.reviewCard(JITEN_CARD, 'okay')).rejects.toThrow(/401|key|Jiten/i);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    // jpdb.io drops a connection made straight from the overlay. A public, keyless read
    // still has Yomu's shared proxy to fall back on, as it had before the overlay lent
    // the reader a request route.
    it('falls back to the public proxy when a host refuses the overlay', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        });
        installGamingHttpTransport(window, fetchImpl);
        const proxied = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>jpdb</html>', { status: 200 }));

        const text = await requestHttp('https://jpdb.io/search?q=%E5%86%92%E9%99%BA', { responseType: 'text' });

        expect(text).toBe('<html>jpdb</html>');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(String(proxied.mock.calls[0]?.[0])).toMatch(/^https:\/\/[^/]*yomu[^/]*\//);
    });

    it('never sends a refused keyed Jiten request to a proxy', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        });
        installGamingHttpTransport(window, fetchImpl);
        const proxied = vi.spyOn(globalThis, 'fetch');

        await expect(new JitenApiClient(() => 'learner-key').reviewCard(JITEN_CARD, 'okay')).rejects.toThrow();
        expect(proxied).not.toHaveBeenCalled();
    });

    it('never replaces a request transport the page already has', () => {
        const existing = vi.fn();
        (window as TransportWindow).GM_xmlhttpRequest = existing;
        installGamingHttpTransport(window, vi.fn());
        expect((window as TransportWindow).GM_xmlhttpRequest).toBe(existing);
    });
});

describe("gaming main process target", () => {
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
});
