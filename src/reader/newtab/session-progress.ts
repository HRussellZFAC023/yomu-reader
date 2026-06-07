import { primaryCardState } from '../cards/state';
import { isJitenSrsCard, isPositiveJpdbCard, isReviewSource } from './review-targets';
import type { JPDBCard } from '../app/types';

export type NewTabSessionProgressSource = 'jpdb' | 'jiten' | 'anki';

export interface NewTabSessionProgressSourceSnapshot {
    source: NewTabSessionProgressSource;
    remainingCards: number;
    remainingDueCards: number;
    available: boolean;
}

export interface NewTabSessionProgressSnapshot {
    completedReviews: number;
    elapsedMs: number;
    elapsedLabel: string;
    remainingCards: number;
    remainingDueCards: number;
    sources: NewTabSessionProgressSourceSnapshot[];
}

export interface NewTabSessionProgressLabels {
    completed: string;
    due: string;
    left: string;
}

export interface NewTabSessionProgressTrackerOptions {
    now?: () => number;
}

const SESSION_PROGRESS_SOURCES: NewTabSessionProgressSource[] = ['jpdb', 'jiten', 'anki'];
const DUE_SESSION_STATES = new Set(['due', 'failed', 'learning']);
const DEFAULT_SESSION_PROGRESS_LABELS: NewTabSessionProgressLabels = {
    completed: 'Done',
    due: 'Due',
    left: 'Left',
};

export class NewTabSessionProgressTracker {
    private completedReviews = 0;
    private readonly startedAt: number;
    private readonly now: () => number;

    constructor(options: NewTabSessionProgressTrackerOptions = {}) {
        this.now = options.now ?? (() => Date.now());
        this.startedAt = this.now();
    }

    recordReviewCompleted(): NewTabSessionProgressSnapshot {
        this.completedReviews += 1;
        return this.snapshot();
    }

    snapshot(cards: readonly JPDBCard[] = []): NewTabSessionProgressSnapshot {
        const elapsedMs = Math.max(0, this.now() - this.startedAt);
        const sources = SESSION_PROGRESS_SOURCES.map(source => sessionProgressSourceSnapshot(source, cards));
        return {
            completedReviews: this.completedReviews,
            elapsedMs,
            elapsedLabel: formatNewTabSessionElapsed(elapsedMs),
            remainingCards: countUniqueSessionProgressCards(cards),
            remainingDueCards: countUniqueSessionProgressCards(cards.filter(isDueSessionProgressCard)),
            sources,
        };
    }
}

export function formatNewTabSessionElapsed(elapsedMs: number): string {
    const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const wholeMinutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    const hours = Math.floor(wholeMinutes / 60);
    const displayMinutes = wholeMinutes % 60;
    return hours > 0
        ? `${hours}:${padStopwatchPart(displayMinutes)}:${padStopwatchPart(displaySeconds)}`
        : `${padStopwatchPart(displayMinutes)}:${padStopwatchPart(displaySeconds)}`;
}

export function formatNewTabSessionProgressLabel(
    snapshot: NewTabSessionProgressSnapshot,
    labels: NewTabSessionProgressLabels = DEFAULT_SESSION_PROGRESS_LABELS,
): string {
    return [
        `${labels.completed} ${snapshot.completedReviews}`,
        `${labels.left} ${snapshot.remainingCards}`,
        `${labels.due} ${snapshot.remainingDueCards}`,
        snapshot.elapsedLabel,
    ].join(' · ');
}

export function newTabSessionProgressRatio(progress: NewTabSessionProgressSnapshot): number {
    const total = progress.completedReviews + progress.remainingCards;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(1, progress.completedReviews / total));
}

function sessionProgressSourceSnapshot(
    source: NewTabSessionProgressSource,
    cards: readonly JPDBCard[],
): NewTabSessionProgressSourceSnapshot {
    const sourceCards = cards.filter(card => sessionProgressSourcesForCard(card).includes(source));
    return {
        source,
        remainingCards: countUniqueSessionProgressCards(sourceCards),
        remainingDueCards: countUniqueSessionProgressCards(sourceCards.filter(isDueSessionProgressCard)),
        available: sourceCards.length > 0,
    };
}

export function sessionProgressSourcesForCard(card: JPDBCard): NewTabSessionProgressSource[] {
    const sources: NewTabSessionProgressSource[] = [];
    if (card.source === 'jpdb' || card.reviewSource === 'jpdb-api' || card.reviewSource === 'jpdb-live' || isPositiveJpdbCard(card)) {
        sources.push('jpdb');
    }
    if (card.source === 'jiten' || card.reviewSource === 'jiten-api' || isJitenSrsCard(card)) {
        sources.push('jiten');
    }
    if (card.source === 'anki' || card.reviewSource === 'anki' || Number(card.ankiCardId) > 0) {
        sources.push('anki');
    }
    return sources;
}

function isNewTabSessionProgressCard(card: JPDBCard): boolean {
    return isReviewSource(card.reviewSource)
        || card.source === 'anki'
        || isJitenSrsCard(card)
        || isPositiveJpdbCard(card)
        || Number(card.ankiCardId) > 0;
}

function isDueSessionProgressCard(card: JPDBCard): boolean {
    return DUE_SESSION_STATES.has(primaryCardState(card.cardState));
}

function countUniqueSessionProgressCards(cards: readonly JPDBCard[]): number {
    return new Set(cards.filter(isNewTabSessionProgressCard).map(sessionProgressCardKey)).size;
}

function sessionProgressCardKey(card: JPDBCard): string {
    return sessionProgressExplicitKey(card)
        ?? sessionProgressAnkiKey(card)
        ?? sessionProgressJitenKey(card)
        ?? sessionProgressJpdbKey(card)
        ?? sessionProgressFallbackKey(card);
}

function sessionProgressExplicitKey(card: JPDBCard): string | null {
    if (card.sourceCardKey) return card.sourceCardKey;
    return card.reviewSource === 'jpdb-live' && card.jpdbReviewId ? `jpdb-live:${card.jpdbReviewId}` : null;
}

function sessionProgressAnkiKey(card: JPDBCard): string | null {
    const cardId = Number(card.ankiCardId ?? card.rid);
    if ((card.source === 'anki' || card.reviewSource === 'anki') && cardId > 0) return `anki:${cardId}`;
    return Number(card.ankiCardId) > 0 ? `anki:${card.ankiCardId}` : null;
}

function sessionProgressJitenKey(card: JPDBCard): string | null {
    return isJitenSrsCard(card) && Number(card.jitenWordId) > 0
        ? `jiten:${card.jitenWordId}:${card.jitenReadingIndex ?? 0}`
        : null;
}

function sessionProgressJpdbKey(card: JPDBCard): string | null {
    return Number(card.vid) > 0 && Number(card.sid) > 0 ? `jpdb:${card.vid}:${card.sid}` : null;
}

function sessionProgressFallbackKey(card: JPDBCard): string {
    return `${card.source ?? ''}:${card.reviewSource ?? ''}:${card.spelling}:${card.reading}`;
}

function padStopwatchPart(value: number): string {
    return String(value).padStart(2, '0');
}
