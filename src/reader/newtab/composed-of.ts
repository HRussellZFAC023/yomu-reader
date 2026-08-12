import { el } from '../dom/builder';
import { targetCanLookupCharacter, usesJapaneseCharacterStudy } from '../languages/character-lookup';
import type { JPDBCard } from '../app/types';
import { bindPrivateCommandCapability, readKanjiCommandCapability } from '../dom/private-command-capabilities';

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
        ...kanjiCharacters.map(character => composedOfKanjiButton(character, context)),
    );
    meaning.append(row);
    void hydrateComposedOfKeywords(row, kanjiCharacters, context);
}

function composedOfKanjiButton(character: string, context: ComposedOfContext): HTMLButtonElement {
    const button = el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-composed-of-kanji',
            dataset: { action: 'kanji', kanji: character },
            title: `${context.text('showKanji')}: ${character}`,
        },
        el('span', { lang: 'ja' }, character),
        el('small', {}, context.keywordCache.get(character) ?? '')) as HTMLButtonElement;
    bindPrivateCommandCapability(button, { kind: 'kanji-lookup', kanji: character });
    return button;
}

async function hydrateComposedOfKeywords(
    row: HTMLElement,
    kanjiCharacters: readonly string[],
    context: ComposedOfContext,
): Promise<void> {
    await Promise.all(kanjiCharacters.map(character => hydrateComposedOfKeyword(character, context)));
    // Re-checked after the awaits: the learner can change target mid-flight, and a
    // detached row must not be written into.
    if (!usesJapaneseCharacterStudy() || !row.isConnected) return;
    row.querySelectorAll<HTMLElement>('[data-kanji]')
        .forEach(chip => hydrateComposedOfChip(chip, context));
}

function hydrateComposedOfChip(chip: HTMLElement, context: ComposedOfContext): void {
    const small = chip.querySelector('small');
    const command = readKanjiCommandCapability(chip);
    if (!small || !command) return;
    const keyword = context.keywordCache.get(command.kanji);
    if (keyword) small.textContent = keyword;
}

async function hydrateComposedOfKeyword(character: string, context: ComposedOfContext): Promise<void> {
    if (!shouldHydrateComposedOfKeyword(character, context)) return;
    const keyword = await lookupComposedOfKeyword(character, context);
    if (!keyword) return;
    if (targetCanLookupCharacter(character)) context.keywordCache.set(character, keyword);
}

function shouldHydrateComposedOfKeyword(character: string, context: ComposedOfContext): boolean {
    return targetCanLookupCharacter(character) && !context.keywordCache.has(character);
}

async function lookupComposedOfKeyword(character: string, context: ComposedOfContext): Promise<string> {
    const rtkKeyword = await composedOfKeyword(context.rtk, character);
    if (rtkKeyword) return rtkKeyword;
    return composedOfKeyword(context.jpdbKanji, character);
}

async function composedOfKeyword(client: KanjiKeywordClient | undefined, character: string): Promise<string> {
    if (!usesJapaneseCharacterStudy() || typeof client?.lookup !== 'function') return '';
    const result = await client.lookup(character).catch(() => null);
    return usesJapaneseCharacterStudy() ? result?.keyword ?? '' : '';
}
