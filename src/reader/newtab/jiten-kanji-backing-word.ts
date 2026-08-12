import type { CardState, JPDBCard, ReaderSettings } from '../app/types';
import { isPlainReadingRedundantForHeadword } from '../cards/reading-display';
import { el } from '../dom/builder';
import { isStandaloneKanjiCard } from './kanji-helpers';
import { isJitenSrsCard } from './review-targets';
import { newTabCardOptionalReading } from './study-queue';

export interface JitenKanjiBackingWordContext {
    sourceCardFor(card: JPDBCard): JPDBCard | undefined;
    settings: ReaderSettings;
    meaningFor(card: JPDBCard): string;
    stateFor(card: JPDBCard): CardState;
    lookupButton(card: JPDBCard, state: CardState): HTMLButtonElement;
    audioButton(card: JPDBCard): HTMLElement | null;
}

export function renderJitenKanjiBackingWord(card: JPDBCard, kanji: string, context: JitenKanjiBackingWordContext): HTMLElement | null {
    const sourceCard = jitenKanjiBackingCard(card, kanji, context);
    if (!sourceCard) return null;
    const reading = visibleJitenKanjiBackingReading(sourceCard, context.settings);
    const meaning = context.meaningFor(sourceCard);
    return el('div', { class: 'jpdb-reader-newtab-kanji-backing-word', dataset: { newtabKanjiBackingWord: true } },
        el('span', { class: 'jpdb-reader-newtab-kanji-backing-term-row' },
            context.lookupButton(sourceCard, context.stateFor(sourceCard)),
            context.audioButton(sourceCard),
        ),
        optionalBackingWordText('jpdb-reader-newtab-kanji-backing-reading', reading, 'ja'),
        optionalBackingWordText('jpdb-reader-newtab-kanji-backing-meaning', meaning),
    );
}

function jitenKanjiBackingCard(card: JPDBCard, kanji: string, context: JitenKanjiBackingWordContext): JPDBCard | null {
    const sourceCard = context.sourceCardFor(card) ?? card;
    return isJitenKanjiBackingWord(sourceCard, kanji) ? sourceCard : null;
}

function isJitenKanjiBackingWord(card: JPDBCard, kanji: string): boolean {
    return isJitenSrsCard(card)
        && !isStandaloneKanjiCard(card, kanji)
        && card.spelling !== kanji;
}

function visibleJitenKanjiBackingReading(card: JPDBCard, settings: ReaderSettings): string {
    const reading = newTabCardOptionalReading(card);
    if (!reading) return '';
    const displaySettings = { ...settings, furiganaMode: 'all' as const, showFurigana: true };
    return isPlainReadingRedundantForHeadword(card, displaySettings, reading) ? '' : reading;
}

function optionalBackingWordText(className: string, text: string, lang?: string): HTMLElement | null {
    return text ? el('span', { class: className, lang }, text) : null;
}
