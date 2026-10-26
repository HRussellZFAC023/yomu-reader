import { managedLocalStorage } from '../app/storage';
import type { JPDBCard } from '../app/types';

// Reading Memory: the reading Jiten gave each word id, kept across pages of a
// site so a word read once is painted from the parse on every later page,
// without another /info request. A bridge until hosted reading shards answer
// every id at once (W1-51); the shard lane can fill the same store.
//
// One localStorage key per site, read once per page and written back a moment
// after the last new reading. Another tab's readings are merged on write.

const STORAGE_KEY = 'yomu:jiten-readings:v1';
const LIMIT = 1500;
const TTL_DAYS = 30;
const FLUSH_DELAY_MS = 2000;
const DAY_MS = 86_400_000;

// [spelling, reading, wordWithReading, pitch patterns, parts of speech, frequency rank, day]
type Entry = [string, string, string, string, string, number, number];

let entries: Map<string, Entry> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

const today = (): number => Math.floor(Date.now() / DAY_MS);
const wordKey = (wordId: number, readingIndex: number): string => `${wordId}:${readingIndex}`;

function isEntry(value: unknown): value is Entry {
    return Array.isArray(value) && value.length === 7
        && value.slice(0, 5).every(item => typeof item === 'string')
        && typeof value[5] === 'number' && typeof value[6] === 'number';
}

function readStored(): Array<[string, Entry]> {
    try {
        const parsed: unknown = JSON.parse(managedLocalStorage.getItem(STORAGE_KEY) ?? '{}');
        if (!parsed || typeof parsed !== 'object') return [];
        const oldest = today() - TTL_DAYS;
        return Object.entries(parsed as Record<string, unknown>)
            .filter((pair): pair is [string, Entry] => isEntry(pair[1]) && pair[1][6] > oldest);
    } catch {
        return [];
    }
}

function memory(): Map<string, Entry> {
    entries ??= new Map(readStored().sort((left, right) => left[1][6] - right[1][6]));
    return entries;
}

function flush(): void {
    flushTimer = undefined;
    const current = memory();
    for (const [key, entry] of readStored()) if (!current.has(key)) current.set(key, entry);
    while (current.size > LIMIT) current.delete(current.keys().next().value as string);
    try {
        managedLocalStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(current)));
    } catch {
        // Storage full or blocked: this page still has its memory.
    }
}

/** The sparse parsed card with the reading Jiten gave its word id, or null. */
export function cardWithRememberedReading(card: JPDBCard): JPDBCard | null {
    const wordId = card.jitenWordId ?? card.vid;
    const readingIndex = card.jitenReadingIndex ?? card.sid;
    const entry = memory().get(wordKey(wordId, readingIndex));
    if (!entry) return null;
    const [spelling, reading, wordWithReading, pitch, partOfSpeech, frequencyRank] = entry;
    return {
        ...card,
        spelling: spelling || card.spelling,
        reading,
        wordWithReading: wordWithReading || null,
        pitchAccent: pitch ? pitch.split('|') : [],
        partOfSpeech: partOfSpeech ? partOfSpeech.split('|') : card.partOfSpeech,
        frequencyRank: frequencyRank > 0 ? frequencyRank : card.frequencyRank,
    };
}

export function rememberReading(card: JPDBCard): void {
    const wordId = card.jitenWordId ?? card.vid;
    const readingIndex = card.jitenReadingIndex ?? card.sid;
    if (!card.reading.trim() || !(wordId > 0) || !(readingIndex >= 0)) return;
    const key = wordKey(wordId, readingIndex);
    const current = memory();
    current.delete(key);
    current.set(key, [
        card.spelling,
        card.reading,
        card.wordWithReading ?? '',
        card.pitchAccent.join('|'),
        card.partOfSpeech.join('|'),
        card.frequencyRank ?? 0,
        today(),
    ]);
    if (current.size > LIMIT) current.delete(current.keys().next().value as string);
    flushTimer ??= setTimeout(flush, FLUSH_DELAY_MS);
}

/** keepStored: drop only this page's copy, as a new page would start. */
export function forgetRememberedReadingsForTests({ keepStored = false }: { keepStored?: boolean } = {}): void {
    if (flushTimer !== undefined) clearTimeout(flushTimer);
    flushTimer = undefined;
    entries = null;
    if (keepStored) return;
    try {
        managedLocalStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing stored.
    }
}
