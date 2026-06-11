// Anki search-syntax escaping shared by every query builder. Inside Anki's
// double quotes, `*` and `_` still act as wildcards and `\` still escapes, so
// quoting alone is not literal: deck names like Core_2k single-char-wildcard
// match, and terms containing `*` over-match (asbplayer/yomitan escape the
// same way). Colons are deliberately NOT escaped: `deck:"Parent::Child"`
// relies on `::` keeping its hierarchy meaning so subdecks stay included.
const ANKI_SEARCH_SPECIALS_RE = /([\\"*_])/g;

export function escapeAnkiSearchText(term: string): string {
    return term.replace(ANKI_SEARCH_SPECIALS_RE, '\\$1');
}

export function quoteAnkiSearch(term: string): string {
    return `"${escapeAnkiSearchText(term)}"`;
}
