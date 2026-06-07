import type { JPDBToken } from '../app/types';

export function pickTokenForSelection(tokens: JPDBToken[] = [], selected: string): JPDBToken | undefined {
    const exact = tokens.find(token => token.card.spelling === selected || token.card.reading === selected);
    if (exact) {
        return exact;
    }

    const fuzzy = tokens.find(token => selected.includes(token.card.spelling) || token.card.spelling.includes(selected));
    return fuzzy;
}

export function tokensOverlappingSelection(tokens: JPDBToken[] = [], selected: string, parsedText = selected): JPDBToken[] {
    if (!tokens.length) return [];
    const start = parsedText.indexOf(selected);
    if (start < 0) return parsedText === selected ? tokens : [];
    const end = start + selected.length;
    return tokens.filter(token => token.start < end && token.end > start);
}
