import { afterEach, describe, expect, it, vi } from 'vitest';
import uploader from '../../workers/yomu-dictionaries/src/multipart-uploader';

const TOKEN = 'x'.repeat(40);
const DIGEST = 'a'.repeat(64);
const KEY = `objects/sha256/${DIGEST}.zip`;

function request(method: string, query = '', body?: BodyInit) {
    return new Request(`https://uploader.example/${KEY}${query}`, {
        method,
        headers: { authorization: `Bearer ${TOKEN}` },
        body,
    });
}

describe('temporary dictionary multipart uploader', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('rejects unauthenticated and non-content-addressed requests', async () => {
        const env = { DICTIONARY_BUCKET: {}, UPLOAD_TOKEN: TOKEN } as never;
        const unauthorized = await uploader.fetch(new Request(`https://uploader.example/${KEY}`), env);
        expect(unauthorized.status).toBe(401);
        const invalid = await uploader.fetch(new Request('https://uploader.example/not-an-object', {
            headers: { authorization: `Bearer ${TOKEN}` },
        }), env);
        expect(invalid.status).toBe(400);
    });

    it('creates, uploads, and completes a multipart object with immutable metadata', async () => {
        const upload = {
            key: KEY,
            uploadId: 'upload-1',
            uploadPart: vi.fn(async (partNumber: number) => ({ partNumber, etag: `etag-${partNumber}` })),
            complete: vi.fn(async () => ({ key: KEY, size: 6, httpEtag: '"done"' })),
            abort: vi.fn(),
        };
        const bucket = {
            createMultipartUpload: vi.fn(async () => upload),
            resumeMultipartUpload: vi.fn(() => upload),
        };
        const env = { DICTIONARY_BUCKET: bucket, UPLOAD_TOKEN: TOKEN } as never;

        const created = await uploader.fetch(request('POST', '?action=create'), env);
        expect(created.status).toBe(200);
        expect(bucket.createMultipartUpload).toHaveBeenCalledWith(KEY, expect.objectContaining({
            httpMetadata: expect.objectContaining({ contentType: 'application/zip' }),
            customMetadata: { sha256: DIGEST },
        }));

        const part = await uploader.fetch(request(
            'PUT',
            '?action=upload&uploadId=upload-1&partNumber=1',
            new Uint8Array([1, 2, 3]),
        ), env);
        expect(part.status).toBe(200);
        expect(upload.uploadPart).toHaveBeenCalledWith(1, expect.any(ReadableStream));

        const completed = await uploader.fetch(request(
            'POST',
            '?action=complete&uploadId=upload-1',
            JSON.stringify({ parts: [{ partNumber: 1, etag: 'etag-1' }] }),
        ), env);
        expect(completed.status).toBe(200);
        expect(upload.complete).toHaveBeenCalledWith([{ partNumber: 1, etag: 'etag-1' }]);
    });

    it('copies an exact authenticated Drive range directly into an R2 multipart part', async () => {
        const upload = {
            uploadPart: vi.fn(async (partNumber: number) => ({ partNumber, etag: `etag-${partNumber}` })),
        };
        const bucket = {
            resumeMultipartUpload: vi.fn(() => upload),
        };
        const sourceUrl = 'https://drive.usercontent.google.com/download?id=file-1&export=download&confirm=t';
        const sourceFetch = vi.fn(async () => new Response(new Uint8Array([4, 5, 6]), {
            status: 206,
            headers: {
                'content-length': '3',
                'content-range': 'bytes 4-6/10',
            },
        }));
        vi.stubGlobal('fetch', sourceFetch);
        const response = await uploader.fetch(new Request(
            `https://uploader.example/${KEY}?action=copy&uploadId=upload-1&partNumber=2&offset=4&length=3`,
            {
                method: 'PUT',
                headers: {
                    authorization: `Bearer ${TOKEN}`,
                    'x-yomu-source-url': sourceUrl,
                },
            },
        ), { DICTIONARY_BUCKET: bucket, UPLOAD_TOKEN: TOKEN } as never);

        expect(response.status).toBe(200);
        expect(sourceFetch).toHaveBeenCalledWith(sourceUrl, { headers: { range: 'bytes=4-6' } });
        expect(upload.uploadPart).toHaveBeenCalledWith(2, expect.any(ReadableStream));
    });

    it('rejects server-side copy sources outside the reviewed Drive host', async () => {
        const sourceFetch = vi.fn();
        vi.stubGlobal('fetch', sourceFetch);
        const response = await uploader.fetch(new Request(
            `https://uploader.example/${KEY}?action=copy&uploadId=upload-1&partNumber=1&offset=0&length=3`,
            {
                method: 'PUT',
                headers: {
                    authorization: `Bearer ${TOKEN}`,
                    'x-yomu-source-url': 'https://example.com/archive.zip',
                },
            },
        ), {
            DICTIONARY_BUCKET: { resumeMultipartUpload: vi.fn(() => ({})) },
            UPLOAD_TOKEN: TOKEN,
        } as never);

        expect(response.status).toBe(400);
        expect(sourceFetch).not.toHaveBeenCalled();
    });
});
