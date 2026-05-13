const JPDB_HOST_RE = /(^|\.)jpdb\.io$/i;

export async function createPageMediaUrl(blob: Blob): Promise<string> {
    if (shouldUseDataUrlForPageMedia()) return blobToDataUrl(blob);
    return URL.createObjectURL(blob);
}

export function revokePageMediaUrl(url: string): void {
    if (url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}

function shouldUseDataUrlForPageMedia(): boolean {
    if (typeof location === 'undefined') return false;
    return JPDB_HOST_RE.test(location.hostname);
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error ?? new Error('Could not read media.'));
        reader.readAsDataURL(blob);
    });
}
