/**
 * The canonical spelling stored by dictionary importers and queried by generic
 * learning targets.
 *
 * Compatibility normalization stays useful for fullwidth Latin and Hangul
 * forms, but NFKC decomposes Thai and Lao SARA AM into spellings the published
 * dictionaries do not contain. Preserve those two written characters while
 * normalizing everything around them.
 */
export function normalizeGenericLookupText(text: string): string {
    return text
        .split(/([\u0e33\u0eb3])/u)
        .map(part => part === '\u0e33' || part === '\u0eb3' ? part : part.normalize('NFKC'))
        .join('')
        .replace(/\s+/gu, ' ')
        .trim();
}

/** Normalized spelling first, then a verbatim-form fallback for pre-fix rows. */
export function genericLookupTextVariants(text: string): readonly string[] {
    const source = text.replace(/\s+/gu, ' ').trim();
    return [...new Set([normalizeGenericLookupText(source), source].filter(Boolean))];
}

/** Every dictionary import door crosses the same normalization boundary. */
export function normalizeImportedLookupTerm<T extends { expression: string; reading: string }>(entry: T): T {
    const expression = normalizeGenericLookupText(entry.expression);
    const reading = normalizeGenericLookupText(entry.reading);
    return expression === entry.expression && reading === entry.reading
        ? entry
        : { ...entry, expression, reading };
}

export function normalizeImportedLookupMeta<T extends { expression?: string }>(entry: T): T {
    if (typeof entry.expression !== 'string') return entry;
    const expression = normalizeGenericLookupText(entry.expression);
    return expression === entry.expression ? entry : { ...entry, expression };
}
