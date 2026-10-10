export interface LibraryFilters { query: string; level: string; genre: string }

/** Learners often type the same kana in a different script or width. */
export function normalizeLibraryQuery(value: string): string {
    return value.normalize('NFKC').toLowerCase().trim()
        .replace(/[ァ-ヶ]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

export function readLibraryFilters(search: string, levels: readonly string[], genres: readonly string[]): LibraryFilters {
    const params = new URLSearchParams(search);
    const level = params.get('level') ?? '';
    const genre = params.get('genre') ?? '';
    return {
        query: params.get('q') ?? '',
        level: levels.includes(level) ? level : '',
        genre: genres.includes(genre) ? genre : '',
    };
}

export function libraryFilterUrl(href: string, filters: LibraryFilters): string {
    const url = new URL(href);
    for (const [key, value] of [['q', filters.query], ['level', filters.level], ['genre', filters.genre]]) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
    }
    return url.href;
}
