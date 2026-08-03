import type { JPDBCard, ReaderSettings } from '../app/types';
import { usesJapaneseCharacterStudy } from '../languages/character-lookup';
import { cardKey, kanjiCharacters } from './index';
import { normalizeNewTabCard, selectNewTabStudyPool } from './study-queue';
import { isStandaloneKanjiCard, stableNegativeNewTabId } from './kanji-helpers';
import type { NewTabConcreteSource } from './source';
import type { NewTabUiState } from './state';

// Everything the pool cluster reads off the controller, made explicit. This
// interface IS the documentation of the pool module's real coupling: three
// slices of UI state (mode/filter/source), the loaded word set, one settings
// flag, three per-card classifiers still owned by the controller, and the
// pitch-SRS scheduler used to order the Listen deck.
export interface NewTabStudyPoolDeps {
    getState(): Pick<NewTabUiState, 'filter' | 'source'>;
    getSourceLabel(): string;
    getAllWords(): JPDBCard[];
    getSettings(): ReaderSettings;
    // Whether a given card should render as a kanji card in the current context.
    shouldRenderCardAsKanji(card: JPDBCard): boolean;
    cardReviewSource(card: JPDBCard): NewTabConcreteSource;
}

// Pool selection extracted from the controller (Ousterhout-style module around
// the existing state model): given the loaded word set and the current UI mode/
// filter, produce the ordered card pool the study surface renders, plus the
// signature used to detect when that pool changed. Does NOT own state — every
// input flows through NewTabStudyPoolDeps.
export class NewTabStudyPool {
    constructor(private readonly deps: NewTabStudyPoolDeps) {}

    studyPoolForCurrentMode(): JPDBCard[] {
        const state = this.deps.getState();
        const cards = this.deps.getAllWords();
        const filter = state.filter;
        // JPDB deck-browse "Show only" parity: a state filter narrows the
        // pool by card state; 'all' bypasses the study-queue selection so
        // known/blacklisted cards become browsable; 'study' is the default
        // scheduled queue.
        if (filter === 'all') return cards;
        if (filter === 'local') return cards.filter(card => card.source === 'local' || card.source === 'fallback');
        if (filter !== 'study') return cards.filter(card => card.cardState.includes(filter));
        return this.applyKanjiUnlockQueue(selectNewTabStudyPool(cards));
    }

    // jpdb Learn parity: locked words sit behind their kanji, so the combined
    // queue serves the KANJI card first; the word unlocks once the provider
    // marks the kanji learned. "Study kanji before unlocking words" (default
    // on) can be turned off for learners who skip kanji — locked words then
    // study directly as words. Progression is unaffected either way: card
    // states live at the provider, the toggle only changes queue composition.
    private applyKanjiUnlockQueue(pool: JPDBCard[]): JPDBCard[] {
        if (!usesJapaneseCharacterStudy() || !this.deps.getSettings().newTabKanjiUnlockEnabled) return pool;
        const out: JPDBCard[] = [];
        const seenKanji = new Set<string>();
        for (const card of pool) {
            if (!card.cardState.includes('locked') || this.deps.shouldRenderCardAsKanji(card)) {
                out.push(card);
                continue;
            }
            const kanjiCards = kanjiCharacters(card.spelling)
                .filter(kanji => !seenKanji.has(kanji))
                .map(kanji => {
                    seenKanji.add(kanji);
                    return this.kanjiStudyCardFromSourceCard(card, kanji);
                });
            // Kana-only locked cards (no kanji to unlock) study as words.
            if (kanjiCards.length) out.push(...kanjiCards);
            else out.push(card);
        }
        return out;
    }

    kanjiStudyCardFromSourceCard(card: JPDBCard, kanji: string): JPDBCard {
        if (isStandaloneKanjiCard(card, kanji)) return normalizeNewTabCard({ ...card, spelling: kanji, reading: card.reading || kanji });
        const sourceKanji = kanjiCharacters(card.spelling);
        const sourceKeyword = sourceKanji.length === 1 && sourceKanji[0] === kanji ? card.kanjiKeyword : undefined;
        return normalizeNewTabCard({
            ...card,
            vid: stableNegativeNewTabId(`kanji-study:${this.deps.cardReviewSource(card)}:${kanji}`),
            sid: 0,
            rid: 0,
            spelling: kanji,
            reading: kanji,
            frequencyRank: null,
            meanings: [],
            pitchAccent: [],
            wordWithReading: null,
            sentence: card.sentence || card.spelling,
            reviewSource: undefined,
            ankiCardId: card.ankiCardId,
            jpdbReviewId: undefined,
            kanjiKeyword: sourceKeyword,
            sourceCardKey: card.sourceCardKey ?? cardKey(card),
            fallbackLookupTerms: [card.spelling, card.reading, ...(card.fallbackLookupTerms ?? [])].filter(Boolean),
        });
    }

    poolSignature(cards: JPDBCard[]): string {
        const state = this.deps.getState();
        return [
            state.source,
            this.deps.getSourceLabel(),
            ...cards.map(card => cardKey(card)),
        ].join('|');
    }
}
