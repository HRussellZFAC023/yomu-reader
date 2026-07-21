import type { CardState, JPDBGrade, JPDBMeaning } from '../app/types';

export type YomuSrsProviderId = 'jpdb' | 'jiten' | 'anki' | 'bunpro' | 'yomu-local' | 'wanikani';
export type YomuSrsReviewableKind = 'vocabulary' | 'grammar' | 'kanji' | 'sentence' | 'unknown';
export type YomuSrsGrade = JPDBGrade | 'again' | 'good';

export interface YomuSrsReviewSession {
    id: string;
    inputMode: 'regular' | 'fsrs';
    endpoint: 'review' | 'ghost-review' | 'self-study-review';
}

export interface YomuSrsReviewable {
    providerId: YomuSrsProviderId;
    providerCardId: string;
    providerReviewId?: string;
    providerReviewableId?: string;
    reviewSession?: YomuSrsReviewSession;
    kind: YomuSrsReviewableKind;
    expression: string;
    reading: string;
    meanings: JPDBMeaning[];
    sentence?: string;
    state: CardState[];
    srsLevel?: string;
    dueAt?: number | null;
    lastReviewAt?: number | null;
    sourceUrl?: string;
    raw?: unknown;
}

export interface YomuSrsQueueSnapshot {
    providerId: YomuSrsProviderId;
    fetchedAt: number;
    cards: YomuSrsReviewable[];
    dueCount: number;
    newCount: number;
    reviewCount: number;
}

export interface YomuSrsStatsSnapshot {
    providerId: YomuSrsProviderId;
    fetchedAt: number;
    reviewsDue?: number;
    reviewsToday?: number;
    newToday?: number;
    streakDays?: number;
    levelCounts?: Record<string, number>;
    raw?: unknown;
}

export interface YomuSrsReviewRequest {
    card: YomuSrsReviewable;
    grade: YomuSrsGrade;
    sentence?: string;
}

export interface YomuSrsReviewResult {
    card?: YomuSrsReviewable;
    raw?: unknown;
}

export interface YomuSrsMiningRequest {
    expression: string;
    reading?: string;
    meaning?: string;
    sentence?: string;
    sourceTitle?: string;
    sourceUrl?: string;
    kind?: YomuSrsReviewableKind;
}

export interface YomuSrsMiningResult {
    card?: YomuSrsReviewable;
    raw?: unknown;
}

export interface YomuSrsImportItem {
    expression: string;
    reading?: string;
    meanings?: string[];
    sentence?: string;
    sourceProviderId?: YomuSrsProviderId;
    sourceCardId?: string;
    sourceUrl?: string;
    tags?: string[];
    dueAt?: number | null;
}

export interface YomuSrsImportBatch {
    source: string;
    importedAt: number;
    items: YomuSrsImportItem[];
}

export interface YomuSrsAdapterCapabilities {
    stats: boolean;
    queue: boolean;
    review: boolean;
    mine: boolean;
    import: boolean;
}

export interface YomuSrsAdapter {
    id: YomuSrsProviderId;
    label: string;
    capabilities: YomuSrsAdapterCapabilities;
    hasCredential(): boolean;
    verify(): Promise<boolean>;
    stats(): Promise<YomuSrsStatsSnapshot>;
    queue(limit?: number): Promise<YomuSrsQueueSnapshot>;
    review(request: YomuSrsReviewRequest): Promise<YomuSrsReviewResult>;
    mine(request: YomuSrsMiningRequest): Promise<YomuSrsMiningResult>;
    importBatch?(batch: YomuSrsImportBatch): Promise<{ imported: number; skipped: number }>;
}
