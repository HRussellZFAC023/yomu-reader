import { vi } from 'vitest';
import { VisiblePageScanner, type VisiblePageScannerDependencies } from '../../../src/reader/app/visible-page-scanner';
import type { CardState, JPDBToken, ReaderSettings } from '../../../src/reader/app/types';
import { mirrorToken } from './japanese-token-fixtures';

export function createVisiblePageScannerFixture(settings: ReaderSettings, tokenize: (text: string) => JPDBToken[], overrides: Partial<VisiblePageScannerDependencies> = {}): VisiblePageScanner {
    return new VisiblePageScanner({
        getSettings: () => settings,
        parseJapanese: async texts => texts.map(tokenize),
        pauseMutationObserver: callback => callback(),
        preloadParsedTokens: vi.fn(), enrichPitchWords: vi.fn(), enrichAnkiWords: vi.fn(), toast: vi.fn(),
        ...overrides,
    });
}

export function tokensForJapaneseFixture(text: string, words: ReadonlyArray<readonly [string, string, CardState?]>): JPDBToken[] {
    const tokens: JPDBToken[] = [];
    for (let start = 0; start < text.length;) {
        const word = words.find(([spelling]) => text.startsWith(spelling, start));
        if (!word) { start++; continue; }
        const [spelling, reading, state = 'not-in-deck'] = word;
        const token = mirrorToken(spelling, reading);
        const end = start + spelling.length;
        tokens.push({ ...token, card: { ...token.card, cardState: [state] }, start, end,
            rubies: [{ text: reading, start, end, length: end - start }], sentence: text });
        start = end;
    }
    return tokens;
}
