export interface JpdbVocabularyUrlIdentity {
    reading: string;
    spelling: string;
    vid: number;
}

export function jpdbVocabularyIdentityFromUrl(value: string): JpdbVocabularyUrlIdentity | null {
    if (!value) return null;
    try {
        const url = new URL(value, 'https://jpdb.io');
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0] !== 'vocabulary') return null;
        const vid = Number.parseInt(parts[1] ?? '', 10);
        return {
            vid: Number.isFinite(vid) ? vid : 0,
            spelling: decodeUrlPathPart(parts[2] ?? ''),
            reading: decodeUrlPathPart(parts[3] ?? ''),
        };
    } catch {
        return null;
    }
}

function decodeUrlPathPart(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}
