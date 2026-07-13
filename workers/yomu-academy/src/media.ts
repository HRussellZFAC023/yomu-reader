import type { R2Range } from './cf';
import type { Clock, Env } from './env';
import { HttpError } from './http';
import { activeSession } from './sessions';
import manifest from '../media-manifest.json';

export interface MediaObject {
    readonly key: string;
    readonly contentType: string;
    readonly bytes: number;
    readonly sha256: string;
}

export interface MediaManifest {
    readonly version: number;
    readonly bucket: string;
    readonly objects: readonly MediaObject[];
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{0,199}$/;

/** Strict shape check so a malformed checked-in manifest fails loudly. */
export function parseMediaManifest(value: unknown): MediaManifest {
    if (typeof value !== 'object' || value === null) throw new TypeError('Media manifest must be an object.');
    const record = value as { version?: unknown; bucket?: unknown; objects?: unknown };
    if (record.version !== 1) throw new TypeError('Unsupported media manifest version.');
    if (typeof record.bucket !== 'string' || !record.bucket) throw new TypeError('Media manifest needs a bucket name.');
    if (!Array.isArray(record.objects)) throw new TypeError('Media manifest needs an objects array.');
    const objects = record.objects.map((entry: unknown) => {
        const item = entry as Partial<MediaObject>;
        if (
            typeof item.key !== 'string' || !KEY_PATTERN.test(item.key) || item.key.includes('..')
            || typeof item.contentType !== 'string' || !item.contentType
            || typeof item.bytes !== 'number' || !Number.isSafeInteger(item.bytes) || item.bytes <= 0
            || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)
        ) {
            throw new TypeError(`Media manifest entry is invalid: ${JSON.stringify(entry)}`);
        }
        return { key: item.key, contentType: item.contentType, bytes: item.bytes, sha256: item.sha256 };
    });
    const keys = new Set(objects.map(object => object.key));
    if (keys.size !== objects.length) throw new TypeError('Media manifest has duplicate keys.');
    return { version: 1, bucket: record.bucket, objects };
}

export const MEDIA_MANIFEST: MediaManifest = parseMediaManifest(manifest);

/**
 * GET/HEAD /academy/media/audio/<key> — authenticated, allowlisted delivery
 * from private R2. The URL path is only ever used as an exact map lookup, so
 * there is no object-key traversal surface. Tests inject their own manifest.
 */
export async function handleMedia(request: Request, env: Env, clock: Clock, allowlist: MediaManifest = MEDIA_MANIFEST): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    if (!(await activeSession(request, env, clock()))) throw new HttpError(401, 'Sign in to stream Academy media.');

    const prefix = '/academy/media/audio/';
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith(prefix)) throw new HttpError(404, 'Not found.');
    let key: string;
    try {
        key = decodeURIComponent(pathname.slice(prefix.length));
    } catch {
        throw new HttpError(404, 'Not found.');
    }
    const entry = allowlist.objects.find(object => object.key === key);
    if (!entry) throw new HttpError(404, 'Not found.');

    const headers = new Headers({
        'content-type': entry.contentType,
        'cache-control': 'private, max-age=3600',
        vary: 'Cookie',
        'accept-ranges': 'bytes',
        etag: `"${entry.sha256}"`,
        'cross-origin-resource-policy': 'same-origin',
        'x-content-type-options': 'nosniff',
    });
    if (matchesEtag(request.headers.get('if-none-match'), entry.sha256)) {
        return new Response(null, { status: 304, headers });
    }

    const range = parseSingleRange(request.headers.get('range'), entry.bytes);
    if (range === 'unsatisfiable') {
        headers.set('content-range', `bytes */${entry.bytes}`);
        return new Response(null, { status: 416, headers });
    }

    if (request.method === 'HEAD') {
        headers.set('content-length', String(entry.bytes));
        return new Response(null, { status: 200, headers });
    }

    const object = await env.ACADEMY_MEDIA.get(entry.key, range ? { range } : undefined);
    if (!object) throw new HttpError(404, 'Not found.');
    if (object.size !== entry.bytes) throw new HttpError(502, 'Academy media failed its integrity check.');

    if (range) {
        headers.set('content-length', String(range.length));
        headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${entry.bytes}`);
        return new Response(object.body, { status: 206, headers });
    }
    headers.set('content-length', String(entry.bytes));
    return new Response(object.body, { status: 200, headers });
}

function matchesEtag(header: string | null, sha256: string): boolean {
    if (!header) return false;
    return header.split(',').some(tag => {
        const cleaned = tag.trim().replace(/^W\//, '').replaceAll('"', '');
        return cleaned === sha256 || cleaned === '*';
    });
}

/**
 * Supports exactly one bytes range. Multi-range and malformed headers fall
 * back to a full 200 response; a start beyond the object is unsatisfiable.
 */
function parseSingleRange(header: string | null, size: number): R2Range | 'unsatisfiable' | null {
    if (!header) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match || (match[1] === '' && match[2] === '')) return null;
    if (match[1] === '') {
        const suffix = Math.min(Number(match[2]), size);
        return suffix === 0 ? 'unsatisfiable' : { offset: size - suffix, length: suffix };
    }
    const start = Number(match[1]);
    if (start >= size) return 'unsatisfiable';
    const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
    if (end < start) return null;
    return { offset: start, length: end - start + 1 };
}
