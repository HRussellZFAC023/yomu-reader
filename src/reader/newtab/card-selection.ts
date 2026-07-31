import { firstCardMeaning } from './index';
import { mergeDedupeCardMetadata } from './source-orchestrator';
import {
    newTabCardOptionalReading,
    newTabCardIdentityLanguage,
    newTabCardReading,
    normalizeNewTabCard,
} from './study-queue';
import { isPositiveJpdbCard, isReviewSource } from './review-targets';
import { uniqueTrimmedStrings as uniqueStrings } from '../core/string-utils';
import type { JPDBCard } from '../app/types';
import { HAS_JAPANESE, isJapaneseKanjiCharacter } from '../lookup/japanese-script';
import { codePointSafePrefix } from '../languages/lookup-spans';

const NEW_TAB_PUBLIC_JPDB_MIN_WORD_LENGTH = 2;

export interface NewTabSearchSuggestion {
    query: string;
    reading: string;
    meaning: string;
}

interface SearchWordResultGroups {
    parsedCards: JPDBCard[];
    publicJpdbCards: JPDBCard[];
    loadedCards: JPDBCard[];
    localCards: JPDBCard[];
}

export function normalizeSearchQuery(value: string): string {
    return codePointSafePrefix(value.replace(/\s+/g, ' ').trim(), 80);
}

export function appendSearchHandwritingCandidate(currentQuery: string, candidate: string): string {
    return normalizeSearchQuery(`${currentQuery}${candidate}`);
}

export function queryHasJapanese(value: string): boolean {
    return HAS_JAPANESE.test(value);
}

export function cardMatchesSearchSuggestion(card: JPDBCard, normalizedQuery: string): boolean {
    return [
        card.spelling,
        newTabCardReading(card),
        firstCardMeaning(card),
    ].some(value => value.toLocaleLowerCase().includes(normalizedQuery));
}

export function cardMatchesSearchResult(card: JPDBCard, normalizedQuery: string): boolean {
    return [
        card.spelling,
        newTabCardReading(card),
        firstCardMeaning(card),
        ...card.meanings.flatMap(meaning => meaning.glosses),
    ].some(value => value.toLocaleLowerCase().includes(normalizedQuery));
}

export function searchSuggestionFromCard(card: JPDBCard): NewTabSearchSuggestion {
    return {
        query: card.spelling.trim(),
        reading: newTabCardReading(card).trim(),
        meaning: firstCardMeaning(card),
    };
}

export function dedupeWords(cards: JPDBCard[]): JPDBCard[] {
    const seen = new Map<string, JPDBCard>();
    for (const card of cards) {
        const key = dedupeWordKey(card);
        const existing = seen.get(key);
        if (!existing) {
            seen.set(key, card);
            continue;
        }
        const primary = shouldReplaceDedupeWord(card, existing) ? card : existing;
        const secondary = primary === card ? existing : card;
        seen.set(key, mergeDedupeCardMetadata(primary, secondary));
    }
    return [...seen.values()];
}

export function dedupeSearchWords(cards: JPDBCard[]): JPDBCard[] {
    const results: JPDBCard[] = [];
    for (const card of dedupeWords(cards)) {
        const duplicateIndex = results.findIndex(existing => searchWordsAreSameSurfacePlaceholder(card, existing));
        if (duplicateIndex < 0) {
            results.push(card);
            continue;
        }
        const existing = results[duplicateIndex];
        if (existing && shouldReplaceSearchWord(card, existing)) results[duplicateIndex] = card;
    }
    return results;
}

export function searchWordResultOrder(query: string, groups: SearchWordResultGroups): JPDBCard[] {
    const exactGroups = [groups.loadedCards, groups.publicJpdbCards, groups.parsedCards, groups.localCards];
    const remainingGroups = [groups.parsedCards, groups.publicJpdbCards, groups.loadedCards, groups.localCards];
    return [
        ...exactGroups.flatMap(group => group.filter(card => searchWordMatchesQueryExactly(card, query))),
        ...remainingGroups.flatMap(group => group.filter(card => !searchWordMatchesQueryExactly(card, query))),
    ];
}

export function searchKanjiInlineWordMeta(cards: JPDBCard[]): string {
    return uniqueStrings(cards.map(searchKanjiInlineWordLabel))
        .slice(0, 4)
        .join('、');
}

export interface NewTabDueSummary {
    dueWords: number;
    dueKanji: number;
    newWords: number;
    newKanji: number;
}

// JPDB Learn parity: "You have N due items (X vocabulary and Y kanji) and M
// new items…". Standalone single-kanji cards count as kanji; everything else
// as vocabulary. "New" means unseen scheduled cards; "due" is every other
// scheduled state (learning/due/failed/locked).
export function newTabDueSummary(cards: JPDBCard[]): NewTabDueSummary {
    const summary: NewTabDueSummary = { dueWords: 0, dueKanji: 0, newWords: 0, newKanji: 0 };
    for (const card of cards) {
        if (!isScheduledStudyCard(card)) continue;
        const characters = Array.from(card.spelling.trim());
        const isKanjiCard = characters.length === 1 && isJapaneseKanjiCharacter(characters[0] ?? '');
        const isNew = card.cardState.includes('new') || card.cardState.includes('not-in-deck');
        if (isNew) {
            if (isKanjiCard) summary.newKanji += 1;
            else summary.newWords += 1;
        } else if (isKanjiCard) summary.dueKanji += 1;
        else summary.dueWords += 1;
    }
    return summary;
}

export function shouldReplaceKanjiStudyCard(card: JPDBCard, existing: JPDBCard): boolean {
    const cardPriority = kanjiStudyCardPriority(card);
    const existingPriority = kanjiStudyCardPriority(existing);
    if (cardPriority !== existingPriority) return cardPriority < existingPriority;
    // JPDB locked kanji are scheduled SRS items (JPDB interleaves them into
    // reviews): when two same-priority candidates collide on one kanji, keep
    // the one carrying the real locked state instead of the first-seen
    // duplicate, so the kanji tab reflects JPDB's own selection.
    return hasLockedCardState(card) && !hasLockedCardState(existing);
}

function hasLockedCardState(card: JPDBCard): boolean {
    return card.cardState.includes('locked');
}

export function jpdbReviewCardsForNewTab(cards: JPDBCard[], limit: number): JPDBCard[] {
    return markJpdbApiReviewCards(cards)
        .filter(isScheduledStudyCard)
        .slice(0, Math.max(1, limit));
}

export function preferMultiCharacterVocabulary(cards: JPDBCard[]): JPDBCard[] {
    const multi = cards.filter(card => Array.from(card.spelling).length >= NEW_TAB_PUBLIC_JPDB_MIN_WORD_LENGTH);
    return multi.length ? multi : cards;
}

function searchKanjiInlineWordLabel(card: JPDBCard): string {
    const detail = [
        newTabCardOptionalReading(card),
        firstCardMeaning(card),
    ].filter(Boolean).join(' · ');
    return detail ? `${card.spelling} ${detail}` : card.spelling;
}

function searchWordMatchesQueryExactly(card: JPDBCard, query: string): boolean {
    const normalizedQuery = normalizedSearchWordIdentity(query);
    return Boolean(normalizedQuery)
        && (normalizedSearchWordIdentity(card.spelling) === normalizedQuery
            || normalizedSearchWordIdentity(newTabCardReading(card)) === normalizedQuery);
}

function normalizedSearchWordIdentity(value: string): string {
    return normalizeSearchQuery(value).replace(/\s+/g, '').toLocaleLowerCase();
}

function searchWordsAreSameSurfacePlaceholder(card: JPDBCard, existing: JPDBCard): boolean {
    return card.spelling.trim() === existing.spelling.trim()
        && (isSearchPlaceholderWord(card) || isSearchPlaceholderWord(existing));
}

function isSearchPlaceholderWord(card: JPDBCard): boolean {
    return card.source === 'fallback'
        || (!newTabCardOptionalReading(card) && !firstCardMeaning(card) && !card.frequencyRank);
}

function shouldReplaceSearchWord(card: JPDBCard, existing: JPDBCard): boolean {
    const cardScore = searchWordDetailScore(card);
    const existingScore = searchWordDetailScore(existing);
    if (cardScore !== existingScore) return cardScore > existingScore;
    return shouldReplaceDedupeWord(card, existing);
}

function searchWordDetailScore(card: JPDBCard): number {
    return sourceDetailScore(card)
        + (card.vid > 0 ? 2 : 0)
        + (newTabCardOptionalReading(card) ? 2 : 0)
        + (firstCardMeaning(card) ? 2 : 0)
        + (card.frequencyRank ? 1 : 0)
        + (card.pitchAccent?.length ? 1 : 0);
}

function sourceDetailScore(card: JPDBCard): number {
    if (!card.source || card.source === 'jpdb') return 8;
    if (card.source === 'anki') return 6;
    if (card.source === 'local') return 4;
    return 0;
}

function dedupeWordKey(card: JPDBCard): string {
    // Bunpro reviews are session-scoped obligations with their own rating
    // scale. Never collapse one into an identical JPDB/Jiten/Anki card.
    if (card.reviewSource === 'bunpro-api') {
        return `bunpro\n${card.bunproReviewId ?? card.sourceCardKey ?? card.spelling}`;
    }
    return card.reviewSource === 'jpdb-live'
        ? `jpdb-live\n${card.jpdbReviewId ?? card.spelling}`
        : `${newTabCardIdentityLanguage(card)}\n${card.spelling}\n${newTabCardReading(card)}`;
}

function shouldReplaceDedupeWord(card: JPDBCard, existing: JPDBCard | undefined): boolean {
    return !existing || sourcePriority(card) < sourcePriority(existing);
}

function kanjiStudyCardPriority(card: JPDBCard): number {
    if (card.reviewSource === 'jpdb-live') return 0;
    if (isReviewSource(card.reviewSource)) return 1;
    if (isPositiveJpdbCard(card)) return 2;
    if (card.source === 'jpdb') return 3;
    if (card.source === 'anki') return 4;
    if (card.source === 'local') return 5;
    return 6;
}

function sourcePriority(card: JPDBCard): number {
    if (card.reviewSource === 'jpdb-live') return -1;
    if (!card.source || card.source === 'jpdb') return 0;
    if (card.source === 'anki') return 1;
    return 2;
}

function markJpdbApiReviewCards(cards: JPDBCard[]): JPDBCard[] {
    return cards.map(card => normalizeNewTabCard({
        ...card,
        reviewSource: card.reviewSource ?? 'jpdb-api',
    }));
}

function isScheduledStudyCard(card: JPDBCard): boolean {
    return card.cardState.some(state => state === 'new' || state === 'learning' || state === 'due' || state === 'failed' || state === 'locked');
}
