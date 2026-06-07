import type { UiCopyKey } from '../app/i18n';
import { newTabText, type NewTabCopyKey } from './i18n';
import { newTabCardReading } from './study-queue';
import { uniqueTrimmedStrings as uniqueStrings } from '../core/string-utils';
import type { JPDBCard, ReaderSettings } from '../app/types';

type NewTabTextKey = UiCopyKey | NewTabCopyKey;

export interface NewTabLoadResult {
    cards: JPDBCard[];
    sourceLabel: string;
    reviewCountMode?: boolean;
    emptyMessageKey?: NewTabTextKey;
}

export interface NewTabLoadAccumulator {
    cards: JPDBCard[];
    labels: string[];
    reviewCountMode: boolean;
    emptyMessageKey?: NewTabTextKey;
}

function appendLoadedWords(result: NewTabLoadResult, cards: JPDBCard[], labels: string[]): void {
    if (!result.cards.length) return;
    cards.push(...result.cards);
    if (result.sourceLabel && !labels.includes(result.sourceLabel)) labels.push(result.sourceLabel);
}

export function emptyNewTabLoadAccumulator(): NewTabLoadAccumulator {
    return { cards: [], labels: [], reviewCountMode: false };
}

export function newTabLoadAccumulatorFromResult(result: NewTabLoadResult): NewTabLoadAccumulator {
    const accumulator = emptyNewTabLoadAccumulator();
    appendNewTabLoadResult(accumulator, result);
    return accumulator;
}

export function emptyNewTabLoadResult(sourceLabel = ''): NewTabLoadResult {
    return { cards: [], sourceLabel, reviewCountMode: false };
}

export function mergeEmptyNewTabLoadResults(previous: NewTabLoadResult, next: NewTabLoadResult): NewTabLoadResult {
    return {
        cards: [],
        sourceLabel: next.sourceLabel || previous.sourceLabel,
        reviewCountMode: previous.reviewCountMode === true || next.reviewCountMode === true,
        emptyMessageKey: next.emptyMessageKey ?? previous.emptyMessageKey,
    };
}

export function appendNewTabLoadResult(accumulator: NewTabLoadAccumulator, result: NewTabLoadResult): void {
    accumulator.reviewCountMode ||= result.reviewCountMode === true;
    accumulator.emptyMessageKey = result.emptyMessageKey ?? accumulator.emptyMessageKey;
    appendLoadedWords(result, accumulator.cards, accumulator.labels);
    if (!result.cards.length && result.reviewCountMode === true && result.sourceLabel && !accumulator.labels.includes(result.sourceLabel)) {
        accumulator.labels.push(result.sourceLabel);
    }
}

export function autoReviewSourceResults(jpdbResult: NewTabLoadResult, ankiResult: NewTabLoadResult): NewTabLoadResult[] {
    if (!jpdbResult.cards.length || !ankiResult.cards.length) return [jpdbResult, ankiResult];
    const ankiByKey = new Map<string, JPDBCard>();
    for (const card of ankiResult.cards) {
        const key = autoReviewMergeKey(card);
        if (key && !ankiByKey.has(key)) ankiByKey.set(key, card);
    }
    if (!ankiByKey.size) return [jpdbResult, ankiResult];

    const matchedAnkiKeys = new Set<string>();
    const cards = jpdbResult.cards.map(card => {
        const key = autoReviewMergeKey(card);
        const ankiCard = key ? ankiByKey.get(key) : undefined;
        if (!ankiCard) return card;
        matchedAnkiKeys.add(key);
        return mergeDedupeCardMetadata(card, ankiCard);
    });
    if (!matchedAnkiKeys.size) return [jpdbResult, ankiResult];

    return [
        { ...jpdbResult, cards },
        { ...ankiResult, cards: ankiResult.cards.filter(card => !matchedAnkiKeys.has(autoReviewMergeKey(card))) },
    ];
}

export function interleavedNewTabLoadAccumulator(results: NewTabLoadResult[]): NewTabLoadAccumulator {
    const accumulator = emptyNewTabLoadAccumulator();
    accumulator.reviewCountMode = results.some(result => result.reviewCountMode === true);
    accumulator.emptyMessageKey = results.find(result => result.emptyMessageKey)?.emptyMessageKey;
    const activeResults = results.filter(result => result.cards.length > 0);
    accumulator.cards.push(...interleaveNewTabCards(activeResults.map(result => result.cards)));
    accumulator.labels.push(...activeResults.map(result => result.sourceLabel));
    return accumulator;
}

export function newTabLoadResult(accumulator: NewTabLoadAccumulator, language: ReaderSettings['interfaceLanguage']): NewTabLoadResult {
    return {
        cards: accumulator.cards,
        sourceLabel: accumulator.labels.length ? accumulator.labels.join(' + ') : newTabText(language, 'noSource'),
        reviewCountMode: accumulator.reviewCountMode,
        emptyMessageKey: accumulator.emptyMessageKey,
    };
}

export function mergeDedupeCardMetadata(primary: JPDBCard, secondary: JPDBCard): JPDBCard {
    return {
        ...primary,
        ankiCardId: primary.ankiCardId ?? secondary.ankiCardId,
        ankiNoteId: primary.ankiNoteId ?? secondary.ankiNoteId,
        ankiDeckNames: mergeOptionalStrings(primary.ankiDeckNames, secondary.ankiDeckNames),
        ankiModelName: primary.ankiModelName ?? secondary.ankiModelName,
        ankiCardKind: primary.ankiCardKind ?? secondary.ankiCardKind,
        ankiReps: primary.ankiReps ?? secondary.ankiReps,
        ankiLapses: primary.ankiLapses ?? secondary.ankiLapses,
        ankiRenderedCards: mergeAnkiRenderedCards(primary.ankiRenderedCards, secondary.ankiRenderedCards),
        ankiAudioFilenames: mergeOptionalStrings(primary.ankiAudioFilenames, secondary.ankiAudioFilenames),
        fallbackLookupTerms: mergeOptionalStrings(primary.fallbackLookupTerms, [
            secondary.spelling,
            secondary.reading,
            ...(secondary.fallbackLookupTerms ?? []),
        ]),
    };
}

function autoReviewMergeKey(card: JPDBCard): string {
    const spelling = card.spelling.trim();
    if (!spelling) return '';
    return `${spelling}\n${newTabCardReading(card)}`;
}

function interleaveNewTabCards(groups: JPDBCard[][]): JPDBCard[] {
    const maxLength = Math.max(0, ...groups.map(group => group.length));
    const cards: JPDBCard[] = [];
    for (let index = 0; index < maxLength; index++) {
        for (const group of groups) {
            const card = group[index];
            if (card) cards.push(card);
        }
    }
    return cards;
}

function mergeOptionalStrings(first: string[] | undefined, second: string[] | undefined): string[] | undefined {
    const merged = uniqueStrings([...(first ?? []), ...(second ?? [])].filter(Boolean));
    return merged.length ? merged : undefined;
}

function mergeAnkiRenderedCards(
    first: JPDBCard['ankiRenderedCards'],
    second: JPDBCard['ankiRenderedCards'],
): JPDBCard['ankiRenderedCards'] {
    const merged = new Map<number, NonNullable<JPDBCard['ankiRenderedCards']>[number]>();
    for (const card of [...(first ?? []), ...(second ?? [])]) merged.set(card.cardId, card);
    return merged.size ? [...merged.values()] : undefined;
}
