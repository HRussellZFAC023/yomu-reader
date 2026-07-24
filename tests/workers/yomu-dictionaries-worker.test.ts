import { describe, expect, it, vi } from 'vitest';

interface DictionaryStoredObject {
    readonly key: string;
    readonly size: number;
    readonly httpEtag: string;
    readonly httpMetadata?: { readonly contentType?: string };
    writeHttpMetadata(headers: Headers): void;
}

interface DictionaryStoredObjectBody extends DictionaryStoredObject {
    readonly body: ReadableStream;
}

interface DictionaryObjectStore {
    head(key: string): Promise<DictionaryStoredObject | null>;
    get(
        key: string,
        options?: { range?: { offset: number; length: number } | { suffix: number } },
    ): Promise<DictionaryStoredObjectBody | null>;
}

interface DictionaryWorkerModule {
    handleDictionaryRequest(request: Request, store: DictionaryObjectStore): Promise<Response>;
    objectKeyForRequestPath(path: string): string | null;
    parseSingleByteRange(value: string, size: number): { offset: number; length: number } | null;
}

// Keep the Worker runtime declarations out of the browser-oriented root
// tsconfig. Vitest still compiles and executes the real Worker module.
const workerModulePath = '../../workers/yomu-dictionaries/src/index';
const {
    handleDictionaryRequest,
    objectKeyForRequestPath,
    parseSingleByteRange,
} = await import(workerModulePath) as DictionaryWorkerModule;

function dictionaryStore(objects: Record<string, string>) {
    const bytes = new Map(Object.entries(objects).map(([key, value]) => [key, new TextEncoder().encode(value)]));
    const object = (key: string, body = bytes.get(key)): DictionaryStoredObjectBody | null => {
        if (!body) return null;
        return {
            key,
            size: bytes.get(key)?.byteLength ?? body.byteLength,
            httpEtag: `"etag-${key}"`,
            httpMetadata: {
                contentType: key.endsWith('.json') ? 'application/json' : 'application/zip',
            },
            writeHttpMetadata(headers: Headers) {
                headers.set('content-type', this.httpMetadata?.contentType ?? 'application/octet-stream');
            },
            body: new ReadableStream({
                start(controller) {
                    controller.enqueue(body);
                    controller.close();
                },
            }),
        };
    };
    const head = vi.fn(async (key: string): Promise<DictionaryStoredObject | null> => {
        const found = object(key);
        if (!found) return null;
        const { body: _body, ...metadata } = found;
        return metadata;
    });
    const get = vi.fn(async (
        key: string,
        options?: { range?: { offset: number; length: number } | { suffix: number } },
    ): Promise<DictionaryStoredObjectBody | null> => {
        const found = bytes.get(key);
        if (!found) return null;
        if (!options?.range) return object(key, found);
        const range = options.range;
        const ranged = 'suffix' in range
            ? found.slice(Math.max(0, found.length - range.suffix))
            : found.slice(range.offset, range.offset + range.length);
        return object(key, ranged);
    });
    return { store: { head, get } satisfies DictionaryObjectStore, head, get };
}

describe('Yomu dictionary distribution Worker', () => {
    it('reports the fixed Japanese target and 32 learner languages without touching R2', async () => {
        const harness = dictionaryStore({});
        const response = await handleDictionaryRequest(
            new Request('https://dictionaries.yomureader.com/healthz'),
            harness.store,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
        await expect(response.json()).resolves.toMatchObject({
            service: 'yomu-dictionaries',
            status: 'ok',
            targetLanguage: 'ja',
            learnerLanguageCount: 32,
        });
        expect(harness.head).not.toHaveBeenCalled();
        expect(harness.get).not.toHaveBeenCalled();
    });

    it('only maps versioned manifests, the frozen recommendation roster, and SHA-256 objects', () => {
        expect(objectKeyForRequestPath('/v1/catalog.json')).toBe('v1/catalog.json');
        expect(objectKeyForRequestPath('/v1/recommendations/ko-ja.json')).toBe('v1/recommendations/ko-ja.json');
        expect(objectKeyForRequestPath(`/objects/sha256/${'a'.repeat(64)}.zip`)).toBe(`objects/sha256/${'a'.repeat(64)}.zip`);
        expect(objectKeyForRequestPath('/v1/recommendations/ja-ja.json')).toBeNull();
        expect(objectKeyForRequestPath('/objects/sha256/not-a-hash.zip')).toBeNull();
        expect(objectKeyForRequestPath('/../catalog.json')).toBeNull();
    });

    it('streams manifests with CORS, ETag, revalidation, and HEAD support', async () => {
        const harness = dictionaryStore({ 'v1/catalog.json': '{"schemaVersion":1}' });

        const getResponse = await handleDictionaryRequest(
            new Request('https://dictionaries.yomureader.com/v1/catalog.json'),
            harness.store,
        );
        const headResponse = await handleDictionaryRequest(
            new Request('https://dictionaries.yomureader.com/v1/catalog.json', { method: 'HEAD' }),
            harness.store,
        );

        expect(getResponse.status).toBe(200);
        expect(getResponse.headers.get('cache-control')).toBe('public, max-age=300, must-revalidate');
        expect(getResponse.headers.get('etag')).toBe('"etag-v1/catalog.json"');
        expect(getResponse.headers.get('access-control-expose-headers')).toContain('Content-Range');
        await expect(getResponse.text()).resolves.toBe('{"schemaVersion":1}');
        expect(headResponse.status).toBe(200);
        expect(headResponse.headers.get('content-length')).toBe(String(new TextEncoder().encode('{"schemaVersion":1}').length));
        await expect(headResponse.text()).resolves.toBe('');
        expect(harness.head).toHaveBeenCalledWith('v1/catalog.json');
    });

    it('returns 304 when If-None-Match matches the R2 HTTP ETag', async () => {
        const harness = dictionaryStore({ 'v1/languages.json': '{}' });
        const response = await handleDictionaryRequest(
            new Request('https://dictionaries.yomureader.com/v1/languages.json', {
                headers: { 'if-none-match': '"etag-v1/languages.json"' },
            }),
            harness.store,
        );

        expect(response.status).toBe(304);
        expect(response.headers.get('etag')).toBe('"etag-v1/languages.json"');
        await expect(response.text()).resolves.toBe('');
    });

    it('serves one byte range and rejects malformed or unsatisfiable ranges', async () => {
        const digest = 'b'.repeat(64);
        const key = `objects/sha256/${digest}.zip`;
        const harness = dictionaryStore({ [key]: '0123456789' });

        const ranged = await handleDictionaryRequest(
            new Request(`https://dictionaries.yomureader.com/${key}`, { headers: { range: 'bytes=2-5' } }),
            harness.store,
        );
        const invalid = await handleDictionaryRequest(
            new Request(`https://dictionaries.yomureader.com/${key}`, { headers: { range: 'bytes=20-30' } }),
            harness.store,
        );

        expect(ranged.status).toBe(206);
        expect(ranged.headers.get('content-range')).toBe('bytes 2-5/10');
        expect(ranged.headers.get('content-length')).toBe('4');
        expect(ranged.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
        expect(ranged.headers.get('x-content-sha256')).toBe(digest);
        await expect(ranged.text()).resolves.toBe('2345');
        expect(invalid.status).toBe(416);
        expect(invalid.headers.get('content-range')).toBe('bytes */10');
    });

    it('parses bounded, open-ended, and suffix ranges but rejects multiple ranges', () => {
        expect(parseSingleByteRange('bytes=2-5', 10)).toEqual({ offset: 2, length: 4 });
        expect(parseSingleByteRange('bytes=7-', 10)).toEqual({ offset: 7, length: 3 });
        expect(parseSingleByteRange('bytes=-4', 10)).toEqual({ offset: 6, length: 4 });
        expect(parseSingleByteRange('bytes=0-1,4-5', 10)).toBeNull();
    });

    it('answers preflight and rejects write methods without calling R2', async () => {
        const harness = dictionaryStore({});
        const preflight = await handleDictionaryRequest(
            new Request('https://dictionaries.yomureader.com/v1/catalog.json', { method: 'OPTIONS' }),
            harness.store,
        );
        const post = await handleDictionaryRequest(
            new Request('https://dictionaries.yomureader.com/v1/catalog.json', { method: 'POST' }),
            harness.store,
        );

        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, HEAD, OPTIONS');
        expect(post.status).toBe(405);
        expect(post.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
        expect(harness.head).not.toHaveBeenCalled();
        expect(harness.get).not.toHaveBeenCalled();
    });
});
