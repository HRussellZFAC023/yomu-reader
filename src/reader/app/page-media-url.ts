import { readBlobAsDataUrl } from '../core/blob-data-url';

const JPDB_HOST_RE = /(^|\.)jpdb\.io$/i;

// GM-fetched audio frequently arrives as application/octet-stream; media
// elements refuse to decode that ("No decoders for requested formats"), so
// re-wrap with a usable audio type inferred from the source URL.
const AUDIO_EXTENSION_TYPES: Record<string, string> = {
    aac: 'audio/aac',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    oga: 'audio/ogg',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    wav: 'audio/wav',
    weba: 'audio/webm',
    webm: 'audio/webm',
};

const IMAGE_EXTENSION_TYPES: Record<string, string> = {
    apng: 'image/apng',
    avif: 'image/avif',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
};

// Keeps the original bytes behind every audio media URL. Strict page CSPs
// (chatgpt.com, claude.ai, jpdb.io) block re-fetching a blob:/data: URL through
// connect-src, so the Web Audio fallback cannot recover the bytes with fetch();
// reading them straight from the retained Blob is not a network request and is
// exempt from CSP. Only audio is registered — keeping image media (such as
// Immersion Kit thumbnails) out stops it from evicting an audio blob before its
// fallback runs. Bounded as a backstop — entries normally drop when revoked.
const PAGE_MEDIA_BLOB_LIMIT = 64;
const pageMediaBlobs = new Map<string, Blob>();

export async function createPageMediaUrl(blob: Blob, sourceUrl = ''): Promise<string> {
    const typed = withUsableMediaType(blob, sourceUrl);
    const url = shouldUseDataUrlForPageMedia() ? await readBlobAsDataUrl(typed) : URL.createObjectURL(typed);
    if (typed.type.startsWith('audio/')) registerPageMediaBlob(url, typed);
    return url;
}

export function getPageMediaBlob(url: string): Blob | undefined {
    return pageMediaBlobs.get(url);
}

function registerPageMediaBlob(url: string, blob: Blob): void {
    pageMediaBlobs.delete(url);
    pageMediaBlobs.set(url, blob);
    while (pageMediaBlobs.size > PAGE_MEDIA_BLOB_LIMIT) {
        const oldest = pageMediaBlobs.keys().next().value;
        if (oldest === undefined) break;
        pageMediaBlobs.delete(oldest);
    }
}

function withUsableMediaType(blob: Blob, sourceUrl: string): Blob {
    const type = (blob.type || '').toLowerCase();
    if (type && type !== 'application/octet-stream' && type !== 'binary/octet-stream') return blob;
    const extension = sourceUrl.split(/[?#]/)[0]?.split('.').pop()?.toLowerCase() ?? '';
    return new Blob([blob], { type: IMAGE_EXTENSION_TYPES[extension] ?? AUDIO_EXTENSION_TYPES[extension] ?? 'audio/mpeg' });
}

export function revokePageMediaUrl(url: string): void {
    pageMediaBlobs.delete(url);
    if (url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}

function shouldUseDataUrlForPageMedia(): boolean {
    if (typeof location === 'undefined') return false;
    return JPDB_HOST_RE.test(location.hostname);
}
