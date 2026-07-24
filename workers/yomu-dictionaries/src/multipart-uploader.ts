const OBJECT_KEY_PATTERN = /^objects\/sha256\/([a-f0-9]{64})\.zip$/;
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const ALLOWED_COPY_HOST = 'drive.usercontent.google.com';
const MAX_COPY_PART_BYTES = 200 * 1024 * 1024;

interface MultipartUploadEnv {
  DICTIONARY_BUCKET: MultipartBucket;
  UPLOAD_TOKEN: string;
}

interface MultipartStoredObject {
  size: number;
  httpEtag: string;
  customMetadata?: Record<string, string>;
}

interface MultipartUploadedPart {
  partNumber: number;
  etag: string;
}

interface MultipartUpload {
  key: string;
  uploadId: string;
  uploadPart(partNumber: number, value: ReadableStream): Promise<MultipartUploadedPart>;
  complete(parts: MultipartUploadedPart[]): Promise<MultipartStoredObject & { key: string }>;
  abort(): Promise<void>;
}

interface MultipartBucket {
  head(key: string): Promise<MultipartStoredObject | null>;
  createMultipartUpload(key: string, options: {
    httpMetadata: { contentType: string; cacheControl: string };
    customMetadata: Record<string, string>;
  }): Promise<MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): MultipartUpload;
}

interface CompleteBody {
  parts?: Array<{ partNumber?: number; etag?: string }>;
}

export default {
  async fetch(request: Request, env: MultipartUploadEnv): Promise<Response> {
    if (!isAuthorized(request, env.UPLOAD_TOKEN)) {
      return new Response('Unauthorized.', {
        status: 401,
        headers: { 'www-authenticate': 'Bearer' },
      });
    }
    const url = new URL(request.url);
    const key = url.pathname.slice(1);
    const digest = OBJECT_KEY_PATTERN.exec(key)?.[1];
    if (!digest) return new Response('Invalid object key.', { status: 400 });

    try {
      if (request.method === 'HEAD') {
        const object = await env.DICTIONARY_BUCKET.head(key);
        if (!object) return new Response(null, { status: 404 });
        return new Response(null, {
          status: 200,
          headers: {
            'content-length': String(object.size),
            etag: object.httpEtag,
            'x-content-sha256': object.customMetadata?.sha256 ?? digest,
          },
        });
      }

      const action = url.searchParams.get('action');
      if (request.method === 'POST' && action === 'create') {
        const upload = await env.DICTIONARY_BUCKET.createMultipartUpload(key, {
          httpMetadata: {
            contentType: 'application/zip',
            cacheControl: IMMUTABLE_CACHE_CONTROL,
          },
          customMetadata: { sha256: digest },
        });
        return Response.json({ key: upload.key, uploadId: upload.uploadId });
      }

      const uploadId = url.searchParams.get('uploadId');
      if (!uploadId) return new Response('Missing uploadId.', { status: 400 });
      const upload = env.DICTIONARY_BUCKET.resumeMultipartUpload(key, uploadId);

      if (request.method === 'PUT' && action === 'upload') {
        const partNumber = validatedPartNumber(url);
        if (!partNumber || !request.body) return new Response('Invalid part.', { status: 400 });
        return Response.json(await upload.uploadPart(partNumber, request.body));
      }

      if (request.method === 'PUT' && action === 'copy') {
        const partNumber = validatedPartNumber(url);
        const offset = validatedNonNegativeInteger(url.searchParams.get('offset'));
        const length = validatedPositiveInteger(url.searchParams.get('length'));
        const sourceUrl = validatedCopySource(request.headers.get('x-yomu-source-url'));
        if (!partNumber || offset === null || length === null || length > MAX_COPY_PART_BYTES || !sourceUrl) {
          return new Response('Invalid copy part.', { status: 400 });
        }
        const end = offset + length - 1;
        if (!Number.isSafeInteger(end)) return new Response('Invalid copy range.', { status: 400 });
        const range = `bytes=${offset}-${end}`;
        const source = await fetch(sourceUrl, { headers: { range } });
        if (source.status !== 206 || !source.body) {
          throw new Error(`Copy source returned HTTP ${source.status}.`);
        }
        if (source.headers.get('content-length') !== String(length)
          || !contentRangeMatches(source.headers.get('content-range'), offset, end)) {
          throw new Error('Copy source returned an unexpected byte range.');
        }
        return Response.json(await upload.uploadPart(partNumber, source.body));
      }

      if (request.method === 'POST' && action === 'complete') {
        const parts = validatedParts(await request.json() as CompleteBody);
        const object = await upload.complete(parts);
        return Response.json({
          key: object.key,
          size: object.size,
          etag: object.httpEtag,
        });
      }

      if (request.method === 'DELETE' && action === 'abort') {
        await upload.abort();
        return new Response(null, { status: 204 });
      }
      return new Response('Unsupported multipart operation.', { status: 405 });
    } catch (error) {
      console.error(JSON.stringify({
        event: 'yomu_dictionary_multipart_error',
        key,
        message: error instanceof Error ? error.message : String(error),
      }));
      return new Response('Multipart upload failed.', { status: 500 });
    }
  },
} satisfies {
  fetch(request: Request, env: MultipartUploadEnv): Promise<Response>;
};

function isAuthorized(request: Request, expectedToken: string): boolean {
  return expectedToken.length >= 32
    && request.headers.get('authorization') === `Bearer ${expectedToken}`;
}

function validatedPartNumber(url: URL): number | null {
  return validatedIntegerInRange(url.searchParams.get('partNumber'), 1, 10_000);
}

function validatedNonNegativeInteger(value: string | null): number | null {
  return validatedIntegerInRange(value, 0, Number.MAX_SAFE_INTEGER);
}

function validatedPositiveInteger(value: string | null): number | null {
  return validatedIntegerInRange(value, 1, Number.MAX_SAFE_INTEGER);
}

function validatedIntegerInRange(value: string | null, minimum: number, maximum: number): number | null {
  if (value === null || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function validatedCopySource(value: string | null): string | null {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === ALLOWED_COPY_HOST && url.pathname === '/download'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function contentRangeMatches(value: string | null, expectedStart: number, expectedEnd: number): boolean {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value ?? '');
  if (!match) return false;
  const [, start, end, total] = match.map(Number);
  return start === expectedStart && end === expectedEnd && total > expectedEnd;
}

function validatedParts(body: CompleteBody): MultipartUploadedPart[] {
  if (!Array.isArray(body?.parts) || !body.parts.length || body.parts.length > 10_000) {
    throw new Error('Multipart completion requires uploaded parts.');
  }
  const seen = new Set<number>();
  return body.parts.map((part, index) => {
    if (!Number.isInteger(part.partNumber) || (part.partNumber ?? 0) < 1 || (part.partNumber ?? 0) > 10_000) {
      throw new Error(`Invalid multipart part number at index ${index}.`);
    }
    if (seen.has(part.partNumber!)) throw new Error(`Duplicate multipart part number: ${part.partNumber}.`);
    if (typeof part.etag !== 'string' || !part.etag) throw new Error(`Missing multipart ETag at index ${index}.`);
    seen.add(part.partNumber!);
    return { partNumber: part.partNumber!, etag: part.etag };
  }).sort((left, right) => left.partNumber - right.partNumber);
}
