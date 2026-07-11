/**
 * Yomu Academy — kanji mnemonic + component data.
 *
 * Original mnemonics and visual component breakdowns for the course kanji,
 * authored in public/academy/content/kanji-mnemonics.json and bundled here so
 * the Kanji section can teach each character as a small, memorable story.
 */

import data from '../../public/academy/content/kanji-mnemonics.json';

export interface KanjiComponent {
    readonly part: string;
    readonly meaning: string;
}

export interface KanjiMnemonic {
    readonly keyword: string;
    readonly components: readonly KanjiComponent[];
    readonly mnemonic: string;
    readonly onyomi: string;
    readonly kunyomi: string;
}

const KANJI = (data as { kanji: Record<string, KanjiMnemonic> }).kanji;

/** The mnemonic entry for a character, if one is authored. */
export function mnemonicFor(character: string): KanjiMnemonic | undefined {
    return KANJI[character];
}
