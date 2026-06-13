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

export async function createPageMediaUrl(blob: Blob, sourceUrl = ''): Promise<string> {
    const typed = withUsableMediaType(blob, sourceUrl);
    if (shouldUseDataUrlForPageMedia()) return readBlobAsDataUrl(typed);
    return URL.createObjectURL(typed);
}

function withUsableMediaType(blob: Blob, sourceUrl: string): Blob {
    const type = (blob.type || '').toLowerCase();
    if (type && type !== 'application/octet-stream' && type !== 'binary/octet-stream') return blob;
    const extension = sourceUrl.split(/[?#]/)[0]?.split('.').pop()?.toLowerCase() ?? '';
    return new Blob([blob], { type: IMAGE_EXTENSION_TYPES[extension] ?? AUDIO_EXTENSION_TYPES[extension] ?? 'audio/mpeg' });
}

export function revokePageMediaUrl(url: string): void {
    if (url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}

function shouldUseDataUrlForPageMedia(): boolean {
    if (typeof location === 'undefined') return false;
    return JPDB_HOST_RE.test(location.hostname);
}
