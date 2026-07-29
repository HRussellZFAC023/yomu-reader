import { SLICE1_LEARNER_LANGUAGES } from '../../../src/reader/dictionaries/catalog/types';
import { withWorkerSecurityHeaders } from '../../shared/security-headers';

const READ_METHODS = new Set(['GET', 'HEAD']);
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const MANIFEST_CACHE_CONTROL = 'public, max-age=300, must-revalidate';
const EDGE_CACHE_HEADER = 'x-yomu-edge-cache';
const ALLOWED_RECOMMENDATION_LANGUAGES = new Set<string>(SLICE1_LEARNER_LANGUAGES);
const CONTENT_OBJECT_PATTERN = /^objects\/sha256\/([a-f0-9]{64})\.zip$/;
const RECOMMENDATION_PATTERN = /^v1\/recommendations\/([a-z]{2,3})-ja\.json$/;

export interface DictionaryStoredObject {
  readonly key: string;
  readonly size: number;
  readonly httpEtag: string;
  readonly httpMetadata?: {
    readonly contentType?: string;
    readonly contentDisposition?: string;
    readonly contentEncoding?: string;
    readonly contentLanguage?: string;
    readonly cacheControl?: string;
  };
  writeHttpMetadata(headers: Headers): void;
}

export interface DictionaryStoredObjectBody extends DictionaryStoredObject {
  readonly body: ReadableStream;
}

export interface DictionaryObjectStore {
  head(key: string): Promise<DictionaryStoredObject | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length: number } | { suffix: number } },
  ): Promise<DictionaryStoredObjectBody | null>;
}

interface DictionaryWorkerEnv {
  DICTIONARY_BUCKET: DictionaryObjectStore;
}

// A Worker on a route runs in front of the zone cache, so reads through the R2
// binding never populate it on their own: without this, every request pays a
// Class B operation and a bucket round trip no matter how long the
// Cache-Control we send lives in the browser.
export interface DictionaryEdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

interface DictionaryExecutionContext {
  waitUntil?(promise: Promise<unknown>): void;
}

interface RequestedRange {
  offset: number;
  length: number;
}

export default {
  async fetch(request: Request, env: DictionaryWorkerEnv, ctx?: DictionaryExecutionContext): Promise<Response> {
    try {
      return withWorkerSecurityHeaders(
        await handleDictionaryRequest(
          request,
          {
            head: key => env.DICTIONARY_BUCKET.head(key),
            get: (key, options) => env.DICTIONARY_BUCKET.get(key, options),
          },
          edgeCache(),
          promise => ctx?.waitUntil?.(promise),
        ),
      );
    } catch (error) {
      console.error(JSON.stringify({
        event: 'yomu_dictionary_worker_error',
        path: new URL(request.url).pathname,
        message: error instanceof Error ? error.message : String(error),
      }));
      return withWorkerSecurityHeaders(
        responseWithCors(request, 'Dictionary service error.', {
          status: 500,
          headers: { 'cache-control': 'no-store' },
        }),
      );
    }
  },
} satisfies {
  fetch(request: Request, env: DictionaryWorkerEnv, ctx?: DictionaryExecutionContext): Promise<Response>;
};

export async function handleDictionaryRequest(
  request: Request,
  store: DictionaryObjectStore,
  edge?: DictionaryEdgeCache | null,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<Response> {
  if (request.method === 'OPTIONS') return corsPreflight();
  const method = request.method.toUpperCase();
  if (!READ_METHODS.has(method)) {
    return responseWithCors(request, 'Method not allowed.', {
      status: 405,
      headers: {
        allow: 'GET, HEAD, OPTIONS',
        'cache-control': 'no-store',
      },
    });
  }

  const path = new URL(request.url).pathname;
  if (path === '/' || path === '/healthz') return serviceDescription(request);
  const key = objectKeyForRequestPath(path);
  if (!key) {
    return responseWithCors(request, 'Dictionary object not found.', {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    });
  }

  const cacheKey = edgeCacheKey(request);
  if (edge && cacheKey) {
    const hit = await edge.match(cacheKey).catch(() => undefined);
    if (hit) return edgeCacheHit(request, key, hit);
  }

  const response = await serveDictionaryObject(request, store, key);
  if (!cacheKey) return response;
  if (edge && response.status === 200) {
    // Store the copy before the miss marker goes on, so a later hit does not
    // serve a response that calls itself a miss.
    const write = edge.put(cacheKey, response.clone()).catch(() => undefined);
    if (waitUntil) waitUntil(write);
    else await write;
  }
  response.headers.set(EDGE_CACHE_HEADER, 'miss');
  return response;
}

function edgeCache(): DictionaryEdgeCache | null {
  if (typeof caches === 'undefined') return null;
  return (caches as unknown as { default?: DictionaryEdgeCache }).default ?? null;
}

// One entry per object, keyed by URL alone. Range and conditional headers are
// dropped so every variant shares the stored full response; the Cache API
// rejects a 206 anyway.
function edgeCacheKey(request: Request): Request | null {
  if (request.method.toUpperCase() !== 'GET') return null;
  if (request.headers.has('range')) return null;
  return new Request(new URL(request.url).toString(), { method: 'GET' });
}

function edgeCacheHit(request: Request, key: string, hit: Response): Response {
  const etag = hit.headers.get('etag');
  if (etag && etagMatches(request.headers.get('if-none-match'), etag)) {
    const revalidated = notModified(request, key, etag);
    revalidated.headers.set(EDGE_CACHE_HEADER, 'hit');
    return revalidated;
  }
  const headers = new Headers(hit.headers);
  // The zone rewrites Cache-Control on stored copies (Browser Cache TTL turned
  // a 5-minute manifest into a 4-hour one, measured 2026-07-28). The key, not
  // the cache, decides how long a browser may keep the object.
  headers.set('cache-control', key.startsWith('objects/sha256/') ? IMMUTABLE_CACHE_CONTROL : MANIFEST_CACHE_CONTROL);
  headers.set(EDGE_CACHE_HEADER, 'hit');
  return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
}

export function objectKeyForRequestPath(path: string): string | null {
  if (path === '/v1/catalog.json') return 'v1/catalog.json';
  if (path === '/v1/languages.json') return 'v1/languages.json';
  const recommendation = RECOMMENDATION_PATTERN.exec(path.slice(1));
  if (recommendation && ALLOWED_RECOMMENDATION_LANGUAGES.has(recommendation[1])) return path.slice(1);
  if (CONTENT_OBJECT_PATTERN.test(path.slice(1))) return path.slice(1);
  return null;
}

export function parseSingleByteRange(value: string, size: number): RequestedRange | null {
  if (!Number.isSafeInteger(size) || size < 0 || !value.startsWith('bytes=')) return null;
  const specification = value.slice('bytes='.length).trim();
  if (!specification || specification.includes(',')) return null;
  const match = /^(\d*)-(\d*)$/.exec(specification);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    const length = Math.min(size, suffixLength);
    return { offset: size - length, length };
  }
  const start = Number(match[1]);
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return null;
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return null;
  const end = Math.min(size - 1, requestedEnd);
  return { offset: start, length: end - start + 1 };
}

async function serveDictionaryObject(
  request: Request,
  store: DictionaryObjectStore,
  key: string,
): Promise<Response> {
  if (request.method === 'HEAD') {
    const object = await store.head(key);
    if (!object) return notFound(request);
    if (etagMatches(request.headers.get('if-none-match'), object.httpEtag)) {
      return notModified(request, key, object.httpEtag);
    }
    return objectResponse(request, key, object, null, 200);
  }

  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    const metadata = await store.head(key);
    if (!metadata) return notFound(request);
    if (etagMatches(request.headers.get('if-none-match'), metadata.httpEtag)) {
      return notModified(request, key, metadata.httpEtag);
    }
    const range = parseSingleByteRange(rangeHeader, metadata.size);
    if (!range) return rangeNotSatisfiable(request, key, metadata);
    const object = await store.get(key, { range });
    if (!object) return notFound(request);
    return objectResponse(request, key, object, range, 206, metadata.size);
  }

  const object = await store.get(key);
  if (!object) return notFound(request);
  if (etagMatches(request.headers.get('if-none-match'), object.httpEtag)) {
    return notModified(request, key, object.httpEtag);
  }
  return objectResponse(request, key, object, null, 200);
}

function objectResponse(
  request: Request,
  key: string,
  object: DictionaryStoredObject | DictionaryStoredObjectBody,
  range: RequestedRange | null,
  status: 200 | 206,
  fullSize = object.size,
): Response {
  const headers = objectHeaders(key, object);
  if (range) {
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${fullSize}`);
    headers.set('content-length', String(range.length));
  } else {
    headers.set('content-length', String(object.size));
  }
  const body = request.method === 'HEAD' || !('body' in object) ? null : object.body;
  return responseWithCors(request, body, { status, headers });
}

function objectHeaders(key: string, object: DictionaryStoredObject): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', contentTypeForKey(key, object.httpMetadata?.contentType));
  headers.set('cache-control', key.startsWith('objects/sha256/') ? IMMUTABLE_CACHE_CONTROL : MANIFEST_CACHE_CONTROL);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');
  const digest = CONTENT_OBJECT_PATTERN.exec(key)?.[1];
  if (digest) headers.set('x-content-sha256', digest);
  return headers;
}

function rangeNotSatisfiable(request: Request, key: string, object: DictionaryStoredObject): Response {
  const headers = objectHeaders(key, object);
  headers.set('content-range', `bytes */${object.size}`);
  headers.delete('content-length');
  return responseWithCors(request, 'Requested range is not satisfiable.', { status: 416, headers });
}

function notModified(request: Request, key: string, etag: string): Response {
  return responseWithCors(request, null, {
    status: 304,
    headers: {
      etag,
      'cache-control': key.startsWith('objects/sha256/') ? IMMUTABLE_CACHE_CONTROL : MANIFEST_CACHE_CONTROL,
      'x-content-type-options': 'nosniff',
    },
  });
}

function notFound(request: Request): Response {
  return responseWithCors(request, 'Dictionary object not found.', {
    status: 404,
    headers: { 'cache-control': 'no-store' },
  });
}

function serviceDescription(request: Request): Response {
  const payload = JSON.stringify({
    service: 'yomu-dictionaries',
    status: 'ok',
    schemaVersion: 1,
    targetLanguage: 'ja',
    learnerLanguageCount: SLICE1_LEARNER_LANGUAGES.length,
    endpoints: {
      catalog: '/v1/catalog.json',
      languages: '/v1/languages.json',
      recommendations: '/v1/recommendations/{learnerLanguage}-ja.json',
    },
  });
  return responseWithCors(request, request.method === 'HEAD' ? null : payload, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
      ...(request.method === 'HEAD' ? { 'content-length': String(new TextEncoder().encode(payload).byteLength) } : {}),
    },
  });
}

function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': 'Range, If-None-Match',
      'access-control-max-age': '86400',
      'x-content-type-options': 'nosniff',
    },
  });
}

function responseWithCors(request: Request, body: BodyInit | null, init: ResponseInit): Response {
  const headers = new Headers(init.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-expose-headers', 'ETag, Content-Length, Content-Range, Accept-Ranges, X-Content-SHA256, X-Yomu-Edge-Cache');
  headers.set('x-content-type-options', 'nosniff');
  if (!headers.has('content-type') && body !== null) headers.set('content-type', 'text/plain; charset=utf-8');
  return new Response(request.method === 'HEAD' ? null : body, { ...init, headers });
}

function contentTypeForKey(key: string, storedContentType?: string): string {
  if (key.endsWith('.json')) return 'application/json; charset=utf-8';
  if (key.endsWith('.zip')) return 'application/zip';
  return storedContentType || 'application/octet-stream';
}

function etagMatches(ifNoneMatch: string | null, httpEtag: string): boolean {
  if (!ifNoneMatch) return false;
  const normalizedEtag = httpEtag.replace(/^W\//, '');
  return ifNoneMatch.split(',').some(candidate => {
    const normalized = candidate.trim().replace(/^W\//, '');
    return normalized === '*' || normalized === normalizedEtag;
  });
}
