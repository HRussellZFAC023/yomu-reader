import type { JPDBCard, ReaderSettings } from '../app/types';
import { cardPronunciationReading } from '../popup/pitch';
import { pitchNumberForReading } from '../lookup/pitch-accent';
import { cardKey, kanjiCharacters } from './index';
import { normalizeNewTabCard, selectNewTabStudyPool } from './study-queue';
import { shouldReplaceKanjiStudyCard } from './card-selection';
import { isStandaloneKanjiCard, stableNegativeNewTabId } from './kanji-helpers';
import { pitchItemKey, type PitchSrsItem } from './pitch-srs';
import type { NewTabConcreteSource } from './source';
import type { NewTabMode, NewTabUiState } from './state';

// Everything the pool cluster reads off the controller, made explicit. This
// interface IS the documentation of the pool module's real coupling: three
// slices of UI state (mode/filter/source), the loaded word set, one settings
// flag, three per-card classifiers still owned by the controller, and the
// pitch-SRS scheduler used to order the Listen deck.
export interface NewTabStudyPoolDeps {
    // The pool is a POOL SELECTOR keyed off state.mode (kanji synthesizes
    // per-kanji cards; listen pitch-filters; word/recall share the vocab pool).
    getState(): Pick<NewTabUiState, 'mode' | 'filter' | 'source'>;
    getSourceLabel(): string;
    getAllWords(): JPDBCard[];
    getSettings(): ReaderSettings;
    // Whether a given card should render as a kanji card in the current context
    // (state.mode === 'kanji', live jpdb kanji review, or a kanji-unlock card).
    shouldRenderCardAsKanji(card: JPDBCard): boolean;
    cardReviewSource(card: JPDBCard): NewTabConcreteSource;
    isVocabularyStudyMode(mode: NewTabMode): boolean;
    // Due-first pitch schedule for the Listen deck ordering.
    pitchSessionPool(options: { now: number; newItemCap: number }): Iterable<PitchSrsItem>;
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
        const cards = this.cardsForCurrentMode(this.deps.getAllWords());
        // Listen drills need a classifiable pitch contour; words without one (e.g.
        // Anki notes lacking accent data, or kana the classifier can't resolve) are
        // simply not eligible, so the queue never serves an un-gradeable card.
        if (state.mode === 'listen') {
            return this.listenStudyPool(cards.filter(card => pitchNumberForReading(card.pitchAccent, cardPronunciationReading(card)) != null));
        }
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
        if (!this.deps.isVocabularyStudyMode(this.deps.getState().mode) || !this.deps.getSettings().newTabKanjiUnlockEnabled) return pool;
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

    private cardsForCurrentMode(cards: JPDBCard[]): JPDBCard[] {
        return this.deps.getState().mode === 'kanji'
            ? this.kanjiStudyCardsFromSourceCards(cards)
            : cards;
    }

    kanjiStudyCardsFromSourceCards(cards: JPDBCard[]): JPDBCard[] {
        const selected: JPDBCard[] = [];
        const indexes = new Map<string, number>();
        for (const card of cards) {
            for (const kanji of kanjiCharacters(card.spelling)) {
                const candidate = this.kanjiStudyCardFromSourceCard(card, kanji);
                const existingIndex = indexes.get(kanji);
                if (existingIndex === undefined) {
                    indexes.set(kanji, selected.length);
                    selected.push(candidate);
                    continue;
                }
                const existing = selected[existingIndex];
                if (existing && shouldReplaceKanjiStudyCard(candidate, existing)) selected[existingIndex] = candidate;
            }
        }
        return selected;
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

    // Order the eligible listen cards due-first using the pitch SRS schedule (kotu-
    // style "review what's due"), then append any not-yet-scheduled eligible words.
    private listenStudyPool(eligible: JPDBCard[]): JPDBCard[] {
        const now = Date.now();
        const byKey = new Map<string, JPDBCard>();
        for (const card of eligible) {
            const reading = cardPronunciationReading(card);
            const pitchNumber = pitchNumberForReading(card.pitchAccent, reading);
            if (pitchNumber != null) byKey.set(pitchItemKey(reading, pitchNumber), card);
        }
        const ordered: JPDBCard[] = [];
        const seen = new Set<string>();
        for (const item of this.deps.pitchSessionPool({ now, newItemCap: eligible.length })) {
            const card = byKey.get(item.key);
            if (card && !seen.has(item.key)) {
                ordered.push(card);
                seen.add(item.key);
            }
        }
        for (const [key, card] of byKey) if (!seen.has(key)) ordered.push(card);
        return ordered;
    }

    poolSignature(cards: JPDBCard[]): string {
        const state = this.deps.getState();
        return [
            state.source,
            state.mode,
            this.deps.getSourceLabel(),
            ...cards.map(card => cardKey(card)),
        ].join('|');
    }
}
