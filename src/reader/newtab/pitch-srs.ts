import { gmStorageDelete, gmStorageGet, gmStorageSet, gmStorageSetSync } from '../app/storage';
import { managedStateWritesSuppressed } from '../app/managed-state-registry';
import type { JPDBCard, JPDBGrade } from '../app/types';
import {
    contextPitchPattern,
    pitchClassNameForPattern,
    pitchNumberForReading,
    type PitchClassName,
} from '../lookup/pitch-accent';
import { cardPronunciationReading } from '../popup/pitch';

// Local pitch-accent SRS. Pitch has no remote provider (the deliberate inverse of
// kanji, which is remote-only with no local state), so this store both schedules
// AND persists locally to GM storage under the managed `yomu-` prefix (backed up /
// exported with the rest of the user's data). Grades never touch NewTabGradeQueue.

const PITCH_ITEMS_KEY = 'yomu-pitch-items:v1';
const PITCH_HISTORY_KEY = 'yomu-pitch-history:v1';
const PITCH_HISTORY_LIMIT = 200;

const DAY_MS = 86_400_000;
const LAPSE_REDUE_MS = 60_000;
const EASE_MIN = 1.3;
const EASE_MAX = 2.8;
const EASE_DEFAULT = 2.5;

export type PitchSubMode = 'perceive' | 'recall' | 'shadow';

export interface PitchSrsItem {
    key: string; // `${reading}#${pitchNumber}`
    reading: string;
    pitchNumber: number;
    pattern: string; // H/L contour for rendering
    pitchClass: PitchClassName | '';
    displaySpelling: string;
    due: number; // epoch ms
    intervalDays: number;
    ease: number;
    reps: number;
    lapses: number;
    lastGrade?: JPDBGrade;
    lastReviewAt?: number;
    introducedAt: number;
    // True when the pitch contour could not be pinned to the audio (homograph
    // ambiguity) — excluded from strict minimal-pair generation, still drillable.
    unverifiedPitch?: boolean;
    suspended?: boolean;
}

export interface PitchHistoryEntry {
    key: string;
    at: number;
    grade: JPDBGrade;
    subMode: PitchSubMode;
    pitchClass: PitchClassName | '';
    correct: boolean;
}

export interface PitchClassAccuracy {
    pitchClass: PitchClassName;
    total: number;
    correct: number;
}

export interface PitchSessionPoolOptions {
    now: number;
    newItemCap: number;
}

export function pitchItemKey(reading: string, pitchNumber: number): string {
    return `${reading}#${pitchNumber}`;
}

function isFailGrade(grade: JPDBGrade): boolean {
    return grade === 'fail' || grade === 'nothing' || grade === 'something';
}

function clampEase(ease: number): number {
    return Math.min(EASE_MAX, Math.max(EASE_MIN, ease));
}

// SM-2-lite, deterministic. `now` is injected so the schedule is unit-testable.
export function schedulePitchItem(item: PitchSrsItem, grade: JPDBGrade, now: number): PitchSrsItem {
    const next: PitchSrsItem = { ...item, lastGrade: grade, lastReviewAt: now };
    if (isFailGrade(grade)) {
        next.reps = 0;
        next.intervalDays = 0;
        next.ease = clampEase(item.ease - 0.2);
        next.lapses = item.lapses + 1;
        next.due = now + LAPSE_REDUE_MS;
        return next;
    }
    if (grade === 'hard') {
        next.reps = item.reps + 1;
        next.ease = clampEase(item.ease - 0.05);
        next.intervalDays = Math.max(1, Math.round(item.intervalDays * 1.2) || 1);
    } else if (grade === 'easy') {
        next.reps = item.reps + 1;
        next.ease = clampEase(item.ease + 0.15);
        const base = next.reps === 1 ? 1 : Math.round(item.intervalDays * next.ease);
        next.intervalDays = Math.max(1, Math.round(base * 1.3));
    } else {
        // okay | pass
        next.reps = item.reps + 1;
        next.intervalDays = next.reps === 1 ? 1 : next.reps === 2 ? 3 : Math.max(1, Math.round(item.intervalDays * item.ease));
    }
    next.due = now + next.intervalDays * DAY_MS;
    return next;
}

export function createPitchItem(seed: {
    reading: string;
    pitchNumber: number;
    pattern: string;
    pitchClass: PitchClassName | '';
    displaySpelling: string;
    unverifiedPitch?: boolean;
    now: number;
}): PitchSrsItem {
    return {
        key: pitchItemKey(seed.reading, seed.pitchNumber),
        reading: seed.reading,
        pitchNumber: seed.pitchNumber,
        pattern: seed.pattern,
        pitchClass: seed.pitchClass,
        displaySpelling: seed.displaySpelling,
        due: seed.now,
        intervalDays: 0,
        ease: EASE_DEFAULT,
        reps: 0,
        lapses: 0,
        introducedAt: seed.now,
        unverifiedPitch: seed.unverifiedPitch,
    };
}

export function isPitchItemDue(item: PitchSrsItem, now: number): boolean {
    return !item.suspended && item.due <= now;
}

// Session order: due items first (most overdue first), then a capped slice of new
// (never-reviewed) items so a freshly-seeded deck does not flood the session.
export function selectPitchSessionPool(items: PitchSrsItem[], options: PitchSessionPoolOptions): PitchSrsItem[] {
    const active = items.filter(item => !item.suspended);
    const due = active
        .filter(item => item.reps > 0 && item.due <= options.now)
        .sort((a, b) => a.due - b.due);
    const fresh = active
        .filter(item => item.reps === 0)
        .sort((a, b) => a.introducedAt - b.introducedAt)
        .slice(0, Math.max(0, options.newItemCap));
    return [...due, ...fresh];
}

export function pitchAccuracyByClass(history: PitchHistoryEntry[]): PitchClassAccuracy[] {
    const buckets = new Map<PitchClassName, { total: number; correct: number }>();
    for (const entry of history) {
        if (!entry.pitchClass) continue;
        const bucket = buckets.get(entry.pitchClass) ?? { total: 0, correct: 0 };
        bucket.total += 1;
        if (entry.correct) bucket.correct += 1;
        buckets.set(entry.pitchClass, bucket);
    }
    return [...buckets.entries()].map(([pitchClass, value]) => ({ pitchClass, ...value }));
}

// Resolve a studied vocab card to a seedable pitch identity, or null when the card
// carries no usable kana reading + classifiable accent (so it is simply skipped).
export function pitchSeedFromCard(card: JPDBCard, now: number): PitchSrsItem | null {
    const reading = cardPronunciationReading(card);
    if (!reading) return null;
    const pitchNumber = pitchNumberForReading(card.pitchAccent, reading);
    if (pitchNumber == null) return null;
    const pattern = contextPitchPattern(card.pitchAccent, reading);
    return createPitchItem({
        reading,
        pitchNumber,
        pattern,
        pitchClass: pitchClassNameForPattern(pattern, reading),
        displaySpelling: card.spelling || reading,
        now,
    });
}

export class PitchSrsStore {
    private items = new Map<string, PitchSrsItem>();
    private history: PitchHistoryEntry[] = [];
    private loaded = false;
    private persistItemsHandle: ReturnType<typeof setTimeout> | undefined;
    private persistHistoryHandle: ReturnType<typeof setTimeout> | undefined;

    async load(): Promise<void> {
        if (this.loaded) return;
        const storedItems = await gmStorageGet<Record<string, PitchSrsItem> | null>(PITCH_ITEMS_KEY, null).catch(() => null);
        const storedHistory = await gmStorageGet<PitchHistoryEntry[] | null>(PITCH_HISTORY_KEY, null).catch(() => null);
        if (storedItems) for (const [key, item] of Object.entries(storedItems)) if (item && item.key) this.items.set(key, item);
        if (Array.isArray(storedHistory)) this.history = storedHistory.slice(-PITCH_HISTORY_LIMIT);
        this.loaded = true;
    }

    // fallow-ignore-next-line unused-class-member
    size(): number {
        return this.items.size;
    }

    // fallow-ignore-next-line unused-class-member
    item(key: string): PitchSrsItem | undefined {
        return this.items.get(key);
    }

    allItems(): PitchSrsItem[] {
        return [...this.items.values()];
    }

    // fallow-ignore-next-line unused-class-member
    dueCount(now: number): number {
        let count = 0;
        for (const item of this.items.values()) if (isPitchItemDue(item, now)) count += 1;
        return count;
    }

    sessionPool(options: PitchSessionPoolOptions): PitchSrsItem[] {
        return selectPitchSessionPool(this.allItems(), options);
    }

    // Idempotent: only seeds an item that does not exist yet, so re-studying a word
    // never resets its pitch schedule. Returns the (existing or new) item, or null.
    ensureFromCard(card: JPDBCard, now: number): PitchSrsItem | null {
        const seeded = pitchSeedFromCard(card, now);
        if (!seeded) return null;
        const existing = this.items.get(seeded.key);
        if (existing) return existing;
        this.items.set(seeded.key, seeded);
        this.schedulePersistItems();
        return seeded;
    }

    // fallow-ignore-next-line unused-class-member
    grade(key: string, grade: JPDBGrade, subMode: PitchSubMode, options: { correct: boolean; now: number }): PitchSrsItem | null {
        const item = this.items.get(key);
        if (!item) return null;
        const updated = schedulePitchItem(item, grade, options.now);
        this.items.set(key, updated);
        this.appendHistory({
            key,
            at: options.now,
            grade,
            subMode,
            pitchClass: item.pitchClass,
            correct: options.correct,
        });
        this.schedulePersistItems();
        return updated;
    }

    // fallow-ignore-next-line unused-class-member
    accuracyByClass(): PitchClassAccuracy[] {
        return pitchAccuracyByClass(this.history);
    }

    private appendHistory(entry: PitchHistoryEntry): void {
        this.history.push(entry);
        if (this.history.length > PITCH_HISTORY_LIMIT) this.history = this.history.slice(-PITCH_HISTORY_LIMIT);
        this.schedulePersistHistory();
    }

    // Debounced write-behind (mirrors the offline grade-queue discipline): mutate
    // in-memory immediately, flush to GM storage shortly after so rapid grading
    // does not thrash storage.
    private schedulePersistItems(): void {
        if (this.persistItemsHandle) return;
        this.persistItemsHandle = setTimeout(() => {
            this.persistItemsHandle = undefined;
            void this.flushItems();
        }, 400);
    }

    private schedulePersistHistory(): void {
        if (this.persistHistoryHandle) return;
        this.persistHistoryHandle = setTimeout(() => {
            this.persistHistoryHandle = undefined;
            void this.flushHistory();
        }, 400);
    }

    // Synchronous flush for teardown / page-close, where the 400ms debounced async
    // write would be lost. Mirrors the sync GM-storage path used by the UI state.
    flushSync(): void {
        // A factory reset tears down the controller after clearing storage; a
        // teardown flush here would re-create the just-cleared pitch keys.
        if (managedStateWritesSuppressed()) return;
        try {
            if (this.items.size) {
                const record: Record<string, PitchSrsItem> = {};
                for (const [key, item] of this.items) record[key] = item;
                gmStorageSetSync(PITCH_ITEMS_KEY, record);
            }
            if (this.history.length) gmStorageSetSync(PITCH_HISTORY_KEY, this.history.slice(-PITCH_HISTORY_LIMIT));
        } catch {
            // Storage may be blocked in hardened contexts; in-memory state still served the session.
        }
    }

    async flushItems(): Promise<void> {
        if (managedStateWritesSuppressed()) return;
        if (!this.items.size) {
            await gmStorageDelete(PITCH_ITEMS_KEY).catch(() => undefined);
            return;
        }
        const record: Record<string, PitchSrsItem> = {};
        for (const [key, item] of this.items) record[key] = item;
        await gmStorageSet(PITCH_ITEMS_KEY, record).catch(() => undefined);
    }

    async flushHistory(): Promise<void> {
        if (managedStateWritesSuppressed()) return;
        if (!this.history.length) {
            await gmStorageDelete(PITCH_HISTORY_KEY).catch(() => undefined);
            return;
        }
        await gmStorageSet(PITCH_HISTORY_KEY, this.history.slice(-PITCH_HISTORY_LIMIT)).catch(() => undefined);
    }
}
