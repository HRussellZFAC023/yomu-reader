import { el } from '../dom/builder';
import { targetCanLookupCharacter, usesJapaneseCharacterStudy } from '../languages/character-lookup';
import type { JPDBCard } from '../app/types';

/**
 * The "Composed of" line on a study card's back.
 *
 * SH-4 fidelity with jpdb.io: the word's component kanji, each with its keyword.
 * Chips reuse the existing kanji popover action for drilldown, and keywords
 * hydrate from RTK/JPDB lazily so the line paints immediately.
 *
 * Lifted out of newtab/controller.ts, which every change ripples through: this is
 * a self-contained Japanese feature with three collaborating functions and one
 * cache, and it needed nothing from the controller but a label lookup and two
 * clients. Extracted while correcting its gate — see usesJapaneseCharacterStudy;
 * the chips are Japanese machinery, not a consequence of a target having
 * per-character dictionary entries, and those stopped being the same question when
 * Chinese gained Hanzi dictionaries.
 */
export interface ComposedOfContext {
    /** Shared across cards so a keyword is fetched once per character per session. */
    readonly keywordCache: Map<string, string>;
    readonly rtk?: KanjiKeywordClient;
    readonly jpdbKanji?: KanjiKeywordClient;
    readonly text: (key: 'composedOf' | 'showKanji') => string;
}

interface KanjiKeywordClient {
    lookup?: (kanji: string) => Promise<{ keyword?: string } | null>;
}

export function appendComposedOfLine(meaning: HTMLElement, card: JPDBCard, context: ComposedOfContext): void {
    if (!usesJapaneseCharacterStudy()) return;
    const kanjiCharacters = [...new Set(Array.from(card.spelling).filter(targetCanLookupCharacter))];
    if (kanjiCharacters.length === 0) return;
    const row = el('div', { class: 'jpdb-reader-newtab-composed-of', dataset: { newtabComposedOf: true } },
        el('span', { class: 'jpdb-reader-newtab-composed-of-label' }, context.text('composedOf')),
        ...kanjiCharacters.map(character => el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-composed-of-kanji',
            dataset: { action: 'kanji', kanji: character },
            title: `${context.text('showKanji')}: ${character}`,
        },
        el('span', { lang: 'ja' }, character),
        el('small', {}, context.keywordCache.get(character) ?? ''))),
    );
    meaning.append(row);
    void hydrateComposedOfKeywords(row, kanjiCharacters, context);
}

async function hydrateComposedOfKeywords(
    row: HTMLElement,
    kanjiCharacters: readonly string[],
    context: ComposedOfContext,
): Promise<void> {
    await Promise.all(kanjiCharacters.map(async character => {
        if (!targetCanLookupCharacter(character) || context.keywordCache.has(character)) return;
        const keyword = await composedOfKeyword(context.rtk, character)
            || await composedOfKeyword(context.jpdbKanji, character);
        if (keyword && targetCanLookupCharacter(character)) context.keywordCache.set(character, keyword);
    }));
    // Re-checked after the awaits: the learner can change target mid-flight, and a
    // detached row must not be written into.
    if (!usesJapaneseCharacterStudy() || !row.isConnected) return;
    row.querySelectorAll<HTMLElement>('[data-kanji]').forEach(chip => {
        const small = chip.querySelector('small');
        const keyword = context.keywordCache.get(chip.dataset.kanji ?? '');
        if (small && keyword) small.textContent = keyword;
    });
}

async function composedOfKeyword(client: KanjiKeywordClient | undefined, character: string): Promise<string> {
    if (!usesJapaneseCharacterStudy() || typeof client?.lookup !== 'function') return '';
    const result = await client.lookup(character).catch(() => null);
    return usesJapaneseCharacterStudy() ? result?.keyword ?? '' : '';
}
