export function stableHash32(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function stablePositiveHashId(value: string): number {
    return stableHash32(value) || 1;
}

export function stableHashBase36(value: string): string {
    return stableHash32(value).toString(36);
}
