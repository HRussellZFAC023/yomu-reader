import { readBlobAsDataUrl } from '../core/blob-data-url';

const JPDB_HOST_RE = /(^|\.)jpdb\.io$/i;

export async function createPageMediaUrl(blob: Blob): Promise<string> {
    if (shouldUseDataUrlForPageMedia()) return readBlobAsDataUrl(blob);
    return URL.createObjectURL(blob);
}

export function revokePageMediaUrl(url: string): void {
    if (url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}

function shouldUseDataUrlForPageMedia(): boolean {
    if (typeof location === 'undefined') return false;
    return JPDB_HOST_RE.test(location.hostname);
}
