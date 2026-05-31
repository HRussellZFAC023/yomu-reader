export interface UniqueStringOptions {
    trim?: boolean;
    dropEmpty?: boolean;
}

export function uniqueStrings(values: Iterable<string | null | undefined>, options: UniqueStringOptions = {}): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const normalized = options.trim ? value?.trim() : value;
        if (normalized === undefined || normalized === null) continue;
        if (options.dropEmpty && !normalized) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}

export function uniqueNonEmptyStrings(values: Iterable<string | null | undefined>): string[] {
    return uniqueStrings(values, { dropEmpty: true });
}

export function uniqueTrimmedStrings(values: Iterable<string | null | undefined>): string[] {
    return uniqueStrings(values, { trim: true, dropEmpty: true });
}
