import { normalizeCardStates, primaryCardState } from '../cards/state';
import { targetCollationLocale } from '../languages/resolve';
import { cardKey } from '../cards/utils';
import type { CardState, JPDBCard, JPDBToken } from '../app/types';

export interface SubtitleBatchMiningRow {
    cueIndex: number;
    rowIndex: number;
    start: number;
    end: number;
    text: string;
    tokens: JPDBToken[];
}

export interface SubtitleBatchMiningCandidate {
    key: string;
    card: JPDBCard;
    sentence: string;
    rowIndex: number;
    cueIndex: number;
    start: number;
    end: number;
    occurrences: number;
    sentenceCardCount: number;
    unknownCardCount: number;
    iPlusOne: boolean;
    selected: boolean;
    state: CardState;
}

export interface SubtitleBatchMiningSummary {
    rows: number;
    parsedRows: number;
    candidates: number;
    iPlusOne: number;
    selected: number;
}

const BATCH_UNKNOWN_STATES = new Set<CardState>(['new', 'not-in-deck', 'in-deck']);
const BATCH_ALREADY_QUEUED_STATES = new Set<CardState>(['new', 'in-deck']);
const BATCH_BLOCKED_STATES = new Set<CardState>(['blacklisted', 'never-forget', 'redundant', 'suspended']);
const BATCH_PARTICLE_SURFACE_RE = /^[のはをがにでへもとやかねよな]$/u;
const MIN_I_PLUS_ONE_CARD_COUNT = 3;

interface CandidateDraft extends SubtitleBatchMiningCandidate {
    sortKey: BatchMiningSortKey;
}

interface BatchMiningSortKey {
    iPlusOneRank: number;
    unknownCount: number;
    frequency: number;
    occurrenceRank: number;
    rowIndex: number;
}

export function buildSubtitleBatchMiningCandidates(rows: SubtitleBatchMiningRow[]): SubtitleBatchMiningCandidate[] {
    const drafts = new Map<string, CandidateDraft>();
    for (const row of rows) addBatchMiningRowCandidates(drafts, row);
    return Array.from(drafts.values())
        .sort(compareBatchMiningCandidates)
        .map(({ sortKey: _sortKey, ...candidate }) => candidate);
}

export function subtitleBatchMiningSummary(rows: SubtitleBatchMiningRow[], candidates: SubtitleBatchMiningCandidate[]): SubtitleBatchMiningSummary {
    return {
        rows: rows.length,
        parsedRows: rows.filter(row => row.tokens.length > 0).length,
        candidates: candidates.length,
        iPlusOne: candidates.filter(candidate => candidate.iPlusOne).length,
        selected: candidates.filter(candidate => candidate.selected).length,
    };
}

export function subtitleBatchMiningTsv(candidates: SubtitleBatchMiningCandidate[]): string {
    return [
        ['expression', 'reading', 'state', 'occurrences', 'sentence'].join('\t'),
        ...candidates.map(candidate => [
            candidate.card.spelling,
            candidate.card.reading,
            candidate.state,
            String(candidate.occurrences),
            candidate.sentence,
        ].map(tsvCell).join('\t')),
    ].join('\n');
}

function isSubtitleBatchMiningCandidateSelectedByDefault(card: JPDBCard, iPlusOne: boolean): boolean {
    if (!iPlusOne) return false;
    const states = normalizeCardStates(card.cardState);
    return !states.some(state => BATCH_ALREADY_QUEUED_STATES.has(state));
}

function addBatchMiningRowCandidates(drafts: Map<string, CandidateDraft>, row: SubtitleBatchMiningRow): void {
    const entries = batchMiningRowEntries(row);
    const sentenceCardCount = entries.length;
    const unknownEntries = entries.filter(entry => isBatchMiningUnknownCard(entry.card));
    const unknownCardCount = unknownEntries.length;
    const iPlusOne = sentenceCardCount >= MIN_I_PLUS_ONE_CARD_COUNT && unknownCardCount === 1;
    for (const entry of unknownEntries) {
        if (isBatchMiningBlockedCard(entry.card)) continue;
        const candidate = batchMiningCandidate(row, entry.card, sentenceCardCount, unknownCardCount, iPlusOne);
        mergeBatchMiningCandidate(drafts, candidate);
    }
}

function batchMiningRowEntries(row: SubtitleBatchMiningRow): Array<{ key: string; card: JPDBCard }> {
    const entries = new Map<string, JPDBCard>();
    for (const token of row.tokens) {
        const card = token.card;
        if (!card.spelling.trim() || isBatchMiningParticleCard(card)) continue;
        const key = cardKey(card);
        if (!entries.has(key)) entries.set(key, card);
    }
    return Array.from(entries, ([key, card]) => ({ key, card }));
}

function batchMiningCandidate(
    row: SubtitleBatchMiningRow,
    card: JPDBCard,
    sentenceCardCount: number,
    unknownCardCount: number,
    iPlusOne: boolean,
): CandidateDraft {
    const state = primaryCardState(card.cardState);
    return {
        key: subtitleBatchMiningCandidateKey(card),
        card,
        sentence: row.text,
        rowIndex: row.rowIndex,
        cueIndex: row.cueIndex,
        start: row.start,
        end: row.end,
        occurrences: 1,
        sentenceCardCount,
        unknownCardCount,
        iPlusOne,
        selected: isSubtitleBatchMiningCandidateSelectedByDefault(card, iPlusOne),
        state,
        sortKey: batchMiningSortKey(card, row.rowIndex, iPlusOne, unknownCardCount, 1),
    };
}

function mergeBatchMiningCandidate(drafts: Map<string, CandidateDraft>, candidate: CandidateDraft): void {
    const current = drafts.get(candidate.key);
    if (!current) {
        drafts.set(candidate.key, candidate);
        return;
    }
    current.occurrences += 1;
    current.sortKey.occurrenceRank = -current.occurrences;
    if (!shouldReplaceBatchMiningExample(current, candidate)) return;
    drafts.set(candidate.key, {
        ...candidate,
        occurrences: current.occurrences,
        selected: current.selected || candidate.selected,
        sortKey: batchMiningSortKey(candidate.card, candidate.rowIndex, candidate.iPlusOne, candidate.unknownCardCount, current.occurrences),
    });
}

function shouldReplaceBatchMiningExample(current: CandidateDraft, candidate: CandidateDraft): boolean {
    if (candidate.iPlusOne !== current.iPlusOne) return candidate.iPlusOne;
    if (candidate.unknownCardCount !== current.unknownCardCount) return candidate.unknownCardCount < current.unknownCardCount;
    if (frequencyRank(candidate.card) !== frequencyRank(current.card)) return frequencyRank(candidate.card) < frequencyRank(current.card);
    return candidate.rowIndex < current.rowIndex;
}

function compareBatchMiningCandidates(a: CandidateDraft, b: CandidateDraft): number {
    return a.sortKey.iPlusOneRank - b.sortKey.iPlusOneRank
        || a.sortKey.unknownCount - b.sortKey.unknownCount
        || a.sortKey.frequency - b.sortKey.frequency
        || a.sortKey.occurrenceRank - b.sortKey.occurrenceRank
        || a.sortKey.rowIndex - b.sortKey.rowIndex
        || a.card.spelling.localeCompare(b.card.spelling, targetCollationLocale());
}

function batchMiningSortKey(card: JPDBCard, rowIndex: number, iPlusOne: boolean, unknownCount: number, occurrences: number): BatchMiningSortKey {
    return {
        iPlusOneRank: iPlusOne ? 0 : 1,
        unknownCount,
        frequency: frequencyRank(card),
        occurrenceRank: -occurrences,
        rowIndex,
    };
}

function frequencyRank(card: JPDBCard): number {
    return card.frequencyRank ?? Number.MAX_SAFE_INTEGER;
}

function subtitleBatchMiningCandidateKey(card: JPDBCard): string {
    return cardKey(card);
}

function isBatchMiningUnknownCard(card: JPDBCard): boolean {
    return BATCH_UNKNOWN_STATES.has(primaryCardState(card.cardState));
}

function isBatchMiningBlockedCard(card: JPDBCard): boolean {
    return normalizeCardStates(card.cardState).some(state => BATCH_BLOCKED_STATES.has(state));
}

function isBatchMiningParticleCard(card: JPDBCard): boolean {
    return card.partOfSpeech.includes('prt') || BATCH_PARTICLE_SURFACE_RE.test(card.spelling.trim());
}

function tsvCell(value: string): string {
    return value.replace(/\t/gu, ' ').replace(/\r?\n/gu, ' ');
}
