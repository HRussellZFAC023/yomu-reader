export const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;

export function splitTags(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}
