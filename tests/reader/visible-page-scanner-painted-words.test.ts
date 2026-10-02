import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockElementBoundingClientRect } from './helpers/dom-fixtures';
import { mirrorToken } from './helpers/japanese-token-fixtures';
import { testEnSettings } from './helpers/settings-fixture';
import type { CardState, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';

// Every word an apply slice paints must reach the app's follow-up (the word
// index and contrast). The slice hands over only the words recorded under the
// parents it watched, so a target that paints into another target's parent
// must still be recorded.
const SETTINGS: ReaderSettings = { ...testEnSettings(), furiganaMode: 'all' };
const WORDS: Array<[string, string, CardState]> = [['日本語', 'にほんご', 'learning'], ['勉強', 'べんきょう', 'new'], ['本', 'ほん', 'known'], ['注意', 'ちゅうい', 'new']];
type Deps = ConstructorParameters<typeof VisiblePageScanner>[0];

beforeEach(() => {
    window.history.pushState({}, '', '/reading/');
    mockElementBoundingClientRect({ width: 100, height: 20 });
});
afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
});

async function handedOver(html: string): Promise<{ painted: HTMLElement[]; handed: Set<HTMLElement> }> {
    document.body.innerHTML = html;
    const handed = new Set<HTMLElement>();
    const deps: Partial<Deps> = {
        notePaintedWords: (words: HTMLElement[]) => words.forEach(word => handed.add(word)),
    };
    const scanner = new VisiblePageScanner({
        getSettings: () => SETTINGS,
        parseJapanese: async texts => texts.map(tokensFor),
        pauseMutationObserver: callback => callback(),
        preloadParsedTokens: vi.fn(),
        enrichPitchWords: vi.fn(),
        enrichAnkiWords: vi.fn(),
        toast: vi.fn(),
        ...deps,
    } as Deps);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    await scanner.scanVisiblePage({ silent: true });
    scanner.destroy();
    return { painted: [...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')], handed };
}

describe('apply slices hand every painted word to the follow-up', () => {
    it('bold lead-in followed by a <br> line in the same paragraph', async () => {
        const { painted, handed } = await handedOver('<p><b>注意</b>：日本語の本を読む。<br>勉強の本と日本語。</p>');
        const missed = painted.filter(word => !handed.has(word)).map(word => word.dataset.expression);
        expect(missed).toEqual([]);
    });
    it('bold lead-in alone', async () => {
        const { painted, handed } = await handedOver('<p><b>注意</b>：日本語の本を読む。</p>');
        const missed = painted.filter(word => !handed.has(word)).map(word => word.dataset.expression);
        expect(missed).toEqual([]);
    });
    it('aozora main_text with native ruby at line starts', async () => {
        const line = (i: number) => `<ruby><rb>注意</rb><rp>（</rp><rt>ちゅうい</rt><rp>）</rp></ruby>して日本語の本を読む${i}。`;
        const { painted, handed } = await handedOver(`<div class="main_text">${[0, 1, 2, 3].map(line).join('<br />\n')}<br />\n勉強の本と日本語。</div>`);
        const missed = painted.filter(word => !handed.has(word)).map(word => word.dataset.expression);
        expect(missed).toEqual([]);
    });
    it('aozora main_text with ruby mid-line', async () => {
        const line = (i: number) => `日本語の<ruby><rb>注意</rb><rp>（</rp><rt>ちゅうい</rt><rp>）</rp></ruby>して本を読む${i}。`;
        const { painted, handed } = await handedOver(`<div class="main_text">${[0, 1, 2, 3].map(line).join('<br />\n')}</div>`);
        const missed = painted.filter(word => !handed.has(word)).map(word => word.dataset.expression);
        expect(missed).toEqual([]);
    });
    it('link card strong + span', async () => {
        const { painted, handed } = await handedOver('<a href="/x" style="display:block"><strong>日本語の勉強</strong><span>本を読む日本語</span></a>');
        const missed = painted.filter(word => !handed.has(word)).map(word => word.dataset.expression);
        expect(missed).toEqual([]);
    });
});

function tokensFor(text: string): JPDBToken[] {
    const tokens: JPDBToken[] = [];
    for (let start = 0; start < text.length;) {
        const word = WORDS.find(([spelling]) => text.startsWith(spelling, start));
        if (!word) { start += 1; continue; }
        const [spelling, reading, state] = word;
        const end = start + spelling.length;
        const token = mirrorToken(spelling, reading);
        tokens.push({ ...token, card: { ...token.card, cardState: [state] }, start, end, rubies: [{ text: reading, start, end, length: end - start }], sentence: text });
        start = end;
    }
    return tokens;
}
