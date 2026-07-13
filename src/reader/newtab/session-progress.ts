import { primaryCardState } from '../cards/state';
import { isJitenSrsCard, isPositiveJpdbCard, isReviewSource } from './review-targets';
import type { JPDBCard } from '../app/types';
import {
    createStudySessionClock,
    type StudySessionClock,
    type StudySessionClockState,
} from './session-clock';

export type NewTabSessionProgressSource = 'jiten' | 'jpdb' | 'anki';

export interface NewTabSessionProgressSourceSnapshot {
    source: NewTabSessionProgressSource;
    remainingCards: number;
    remainingDueCards: number;
    available: boolean;
}

export interface NewTabSessionProgressSnapshot {
    completedReviews: number;
    elapsedMs: number;
    remainingSessionMs: number;
    remainingSessionLabel: string;
    sessionState: StudySessionClockState;
    sessionComplete: boolean;
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
    clock?: StudySessionClock;
}

const SESSION_PROGRESS_SOURCES: NewTabSessionProgressSource[] = ['jiten', 'jpdb', 'anki'];
const DUE_SESSION_STATES = new Set(['due', 'failed', 'learning']);
const DEFAULT_SESSION_PROGRESS_LABELS: NewTabSessionProgressLabels = {
    completed: 'Done',
    due: 'Due',
    left: 'Left',
};

export class NewTabSessionProgressTracker {
    private completedReviews = 0;
    private readonly clock: StudySessionClock;

    constructor(options: NewTabSessionProgressTrackerOptions = {}) {
        this.clock = options.clock ?? createStudySessionClock({ now: options.now });
    }

    // UT-57: local undo walks one completed review back.
    recordReviewUndone(): void {
        this.completedReviews = Math.max(0, this.completedReviews - 1);
    }

    recordReviewCompleted(): NewTabSessionProgressSnapshot {
        this.completedReviews += 1;
        return this.snapshot();
    }

    snapshot(cards: readonly JPDBCard[] = []): NewTabSessionProgressSnapshot {
        const clock = this.clock.snapshot();
        const sources = SESSION_PROGRESS_SOURCES.map(source => sessionProgressSourceSnapshot(source, cards));
        return {
            completedReviews: this.completedReviews,
            elapsedMs: clock.elapsedMs,
            remainingSessionMs: clock.remainingMs,
            remainingSessionLabel: clock.label,
            sessionState: clock.state,
            sessionComplete: clock.complete,
            remainingCards: countUniqueSessionProgressCards(cards),
            remainingDueCards: countUniqueSessionProgressCards(cards.filter(isDueSessionProgressCard)),
            sources,
        };
    }
}

export function formatNewTabSessionProgressLabel(
    snapshot: NewTabSessionProgressSnapshot,
    labels: NewTabSessionProgressLabels = DEFAULT_SESSION_PROGRESS_LABELS,
): string {
    return [
        `${labels.completed} ${snapshot.completedReviews}`,
        `${labels.left} ${snapshot.remainingCards}`,
        `${labels.due} ${snapshot.remainingDueCards}`,
        snapshot.remainingSessionLabel,
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

// ---------------------------------------------------------------------------
// Daily study time (user-requested daily goal, default 1h, 0 disables).
// Persisted per calendar day in localStorage so the goal survives reloads;
// the controller's 1s clock adds visible-tab time only.

const NEW_TAB_DAILY_STUDY_TIME_KEY = 'jpdb-reader-newtab-daily-study-time';

interface NewTabDailyStudyTime {
    date: string;
    ms: number;
}

export function newTabDailyStudyTimeMs(today: string): number {
    const stored = readNewTabDailyStudyTime();
    return stored && stored.date === today ? stored.ms : 0;
}

export function addNewTabDailyStudyTimeMs(deltaMs: number, today: string): number {
    const ms = Math.max(0, newTabDailyStudyTimeMs(today) + Math.max(0, deltaMs));
    writeNewTabDailyStudyTime({ date: today, ms });
    return ms;
}

export function formatNewTabDailyGoalLabel(
    studiedMs: number,
    goalMinutes: number,
    labels: { unit: string; reached: string },
): string {
    if (!(goalMinutes > 0)) return '';
    const minutes = Math.floor(studiedMs / 60000);
    const base = `${Math.min(minutes, 9999)}/${goalMinutes} ${labels.unit}`;
    return minutes >= goalMinutes ? `${base} ✓ ${labels.reached}` : base;
}

function readNewTabDailyStudyTime(): NewTabDailyStudyTime | null {
    try {
        const raw = localStorage.getItem(NEW_TAB_DAILY_STUDY_TIME_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as NewTabDailyStudyTime;
        return typeof parsed?.date === 'string' && Number.isFinite(parsed?.ms) ? parsed : null;
    } catch {
        return null;
    }
}

function writeNewTabDailyStudyTime(value: NewTabDailyStudyTime): void {
    try {
        localStorage.setItem(NEW_TAB_DAILY_STUDY_TIME_KEY, JSON.stringify(value));
    } catch {
        // Storage full or unavailable: the goal display just stays at 0.
    }
}

export function newTabLocalDateKey(now = new Date()): string {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}
