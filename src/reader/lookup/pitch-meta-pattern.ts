import { normalizePitchPatternsForReading, pitchPatternFromPosition, splitMorae } from './pitch-accent';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';

export type PitchMetaLookup = (expression: string) => Promise<YomitanMetaEntry[]>;

const COMPOUND_MAX_CHARS = 24;
const COMPOUND_MAX_SEGMENTS = 8;
const COMPOUND_MAX_LOOKUPS = 32;
const SMALL_KANA_RE = /^[ゃゅょぁぃぅぇぉゎ゙゚]/u;

interface CompoundSegment {
    pattern: string;
    moraCount: number;
}

interface CompoundLookupState {
    lookups: number;
    cache: Map<string, Promise<YomitanMetaEntry[]>>;
}

export interface LocalPitchPatternLookupOptions {
    initialEntries?: YomitanMetaEntry[];
    includeCompound?: boolean;
}

export async function localPitchPatternsFromMetaLookup(
    spelling: string,
    reading: string,
    lookupMeta: PitchMetaLookup,
    options: LocalPitchPatternLookupOptions = {},
): Promise<string[]> {
    const expression = spelling.trim();
    const pronunciation = reading.trim();
    const initialEntries = options.initialEntries ?? await lookupMeta(expression);
    let patterns = localPitchPatternsFromMeta(pronunciation, initialEntries);
    if (patterns.length) return patterns;

    if (pronunciation && pronunciation !== expression) {
        const readingEntries = await lookupMeta(pronunciation);
        patterns = localPitchPatternsFromMeta(pronunciation, readingEntries);
        if (patterns.length) return patterns;
    }

    if (options.includeCompound === false) return [];
    const compoundPattern = await composeCompoundPitchPatternFromMeta(expression, pronunciation, lookupMeta);
    return compoundPattern ? [compoundPattern] : [];
}

// Compound expressions (登録者数) rarely have a whole-word row in a pitch
// bank, so their underline stays grey even though every constituent
// (登録 / 者 / 数) is listed. Segment the spelling against the pitch bank
// itself — longest match first, constrained to constituents whose stored
// reading is a mora-aligned prefix of the compound's remaining reading — and
// compose a per-mora pattern from the constituents. Non-final constituents
// drop their trailing particle level; the final one keeps it. Any unmatched
// remainder aborts: a partial guess must never colour a word.
export async function composeCompoundPitchPatternFromMeta(
    spelling: string,
    reading: string,
    lookupMeta: PitchMetaLookup,
): Promise<string> {
    const characters = Array.from(spelling.trim());
    const kana = kanaNormalized(reading.trim());
    if (characters.length < 2 || characters.length > COMPOUND_MAX_CHARS || !kana) return '';
    const state: CompoundLookupState = { lookups: 0, cache: new Map() };
    const segments = await composeSegments(characters, 0, kana, lookupMeta, state, COMPOUND_MAX_SEGMENTS);
    if (!segments || segments.length < 2) return '';
    return segments
        .map((segment, index) => index === segments.length - 1 ? segment.pattern : segment.pattern.slice(0, segment.moraCount))
        .join('');
}

async function composeSegments(
    characters: string[],
    cursor: number,
    readingRest: string,
    lookupMeta: PitchMetaLookup,
    state: CompoundLookupState,
    segmentsLeft: number,
): Promise<CompoundSegment[] | null> {
    if (cursor >= characters.length) return readingRest ? null : [];
    if (!segmentsLeft || !readingRest) return null;
    const maxLength = Math.min(8, characters.length - cursor);
    for (let length = maxLength; length >= 1; length--) {
        // The whole compound at cursor 0 is the direct lookup the caller
        // already tried — skipping it keeps this a true constituent fallback.
        if (cursor === 0 && length === characters.length) continue;
        if (state.lookups >= COMPOUND_MAX_LOOKUPS) return null;
        const candidate = characters.slice(cursor, cursor + length).join('');
        const isFinal = cursor + length === characters.length;
        const segment = await constituentSegment(candidate, readingRest, lookupMeta, state, isFinal);
        if (!segment) continue;
        const rest = await composeSegments(characters, cursor + length, readingRest.slice(segment.readingLength), lookupMeta, state, segmentsLeft - 1);
        if (rest) return [{ pattern: segment.pattern, moraCount: segment.moraCount }, ...rest];
    }
    return null;
}

async function constituentSegment(
    candidate: string,
    readingRest: string,
    lookupMeta: PitchMetaLookup,
    state: CompoundLookupState,
    isFinal: boolean,
): Promise<{ pattern: string; moraCount: number; readingLength: number } | null> {
    let entriesPromise = state.cache.get(candidate);
    if (!entriesPromise) {
        state.lookups += 1;
        entriesPromise = Promise.resolve().then(() => lookupMeta(candidate)).catch(() => [] as YomitanMetaEntry[]);
        state.cache.set(candidate, entriesPromise);
    }
    const entries = await entriesPromise;
    // Longest stored reading first: it consumes more of the compound reading
    // and is the stricter (safer) alignment.
    const readings = distinctMetadataReadings(entries).sort((a, b) => b.length - a.length);
    for (const constituentReading of readings) {
        if (!constituentReading || !readingRest.startsWith(constituentReading)) continue;
        if (SMALL_KANA_RE.test(readingRest.slice(constituentReading.length))) continue;
        const pattern = localPitchPatternFromMeta(constituentReading, entries);
        if (!pattern) continue;
        return { pattern, moraCount: splitMorae(constituentReading).length, readingLength: constituentReading.length };
    }
    // Surface fallback missed: a productive FINAL constituent (向け) often has no
    // bank headword while its READING (むけ) does — pitch banks key kana rows and
    // pitch is reading-derived. Restrict this to the FINAL constituent consuming
    // the WHOLE remaining reading in ONE lookup: that keeps surface and reading
    // aligned (a mid-compound reading prefix could otherwise mis-tile) and never
    // drains the shared lookup budget on per-mora probes.
    if (!isFinal) return null;
    return readingKeyFinalSegment(readingRest, lookupMeta, state);
}

async function readingKeyFinalSegment(
    readingRest: string,
    lookupMeta: PitchMetaLookup,
    state: CompoundLookupState,
): Promise<{ pattern: string; moraCount: number; readingLength: number } | null> {
    if (!readingRest || state.lookups >= COMPOUND_MAX_LOOKUPS) return null;
    const cacheKey = `r:${readingRest}`;
    let entriesPromise = state.cache.get(cacheKey);
    if (!entriesPromise) {
        state.lookups += 1;
        entriesPromise = Promise.resolve().then(() => lookupMeta(readingRest)).catch(() => [] as YomitanMetaEntry[]);
        state.cache.set(cacheKey, entriesPromise);
    }
    const entries = await entriesPromise;
    const patterns = localPitchPatternsFromMeta(readingRest, entries);
    // Exactly one distinct pattern for this reading = unambiguous; otherwise a
    // homograph reading could colour the wrong pitch, so leave it grey.
    if (patterns.length !== 1) return null;
    return { pattern: patterns[0], moraCount: splitMorae(readingRest).length, readingLength: readingRest.length };
}

export function localPitchPatternFromMeta(reading: string, entries: YomitanMetaEntry[]): string {
    return localPitchPatternsFromMeta(reading, entries)[0] ?? '';
}

// UT-65: words commonly carry several accepted accents — pitch dictionaries
// list them all, so surface every distinct pattern instead of the first hit.
export function localPitchPatternsFromMeta(reading: string, entries: YomitanMetaEntry[]): string[] {
    const patterns = collectPitchPatterns(reading, entries, false);
    if (patterns.length) return patterns;
    // A stored reading that disagrees usually means the parser derived a
    // different orthography for the same word (katakana surface, inflection
    // base). When the bank lists exactly one reading for this expression there
    // is no homograph to mis-colour, so accept its positions instead of
    // silently dropping a resolvable pitch.
    return distinctMetadataReadings(entries).length === 1
        ? collectPitchPatterns(reading, entries, true)
        : patterns;
}

function collectPitchPatterns(reading: string, entries: YomitanMetaEntry[], ignoreReadingMismatch: boolean): string[] {
    const patterns: string[] = [];
    for (const entry of entries) {
        if (entry.mode !== 'pitch') continue;
        for (const candidate of readPitchCandidates(entry.data, reading, ignoreReadingMismatch)) {
            const pattern = pitchPatternFromCandidate(reading, candidate);
            if (pattern && !patterns.includes(pattern)) patterns.push(pattern);
        }
    }
    return patterns;
}

function distinctMetadataReadings(entries: YomitanMetaEntry[]): string[] {
    const readings = new Set<string>();
    for (const entry of entries) {
        if (entry.mode !== 'pitch') continue;
        const record = objectRecord(entry.data);
        const reading = typeof record?.reading === 'string' ? kanaNormalized(record.reading) : '';
        if (reading) readings.add(reading);
    }
    return [...readings];
}

function readPitchCandidates(value: unknown, reading: string, ignoreReadingMismatch: boolean): Array<number | string> {
    const record = objectRecord(value);
    if (!record) {
        const candidate = pitchCandidateFromValue(value);
        return candidate == null ? [] : [candidate];
    }
    if (!ignoreReadingMismatch && !pitchMetadataReadingMatches(record, reading)) return [];
    const candidates = pitchPositionCandidates(record)
        .map(candidate => pitchCandidateFromValue(candidate))
        .filter((candidate): candidate is number | string => candidate != null);
    if (candidates.length) return candidates;
    const direct = pitchCandidateFromValue(record.position);
    return direct == null ? [] : [direct];
}

function pitchPatternFromCandidate(reading: string, candidate: number | string): string {
    return typeof candidate === 'number'
        ? pitchPatternFromPosition(reading, candidate)
        : normalizePitchPatternsForReading([candidate], reading)[0] ?? '';
}

function pitchMetadataReadingMatches(record: Record<string, unknown>, reading: string): boolean {
    const metadataReading = typeof record.reading === 'string' ? record.reading : '';
    // Kanjium stores hiragana readings while parsed cards often carry the
    // katakana surface — a script difference is not a different reading.
    return !metadataReading || !reading || kanaNormalized(metadataReading) === kanaNormalized(reading);
}

function kanaNormalized(value: string): string {
    return value.replace(/[ァ-ヶ]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

function pitchPositionCandidates(record: Record<string, unknown>): unknown[] {
    if (Array.isArray(record.pitches)) return record.pitches;
    return Array.isArray(record.positions) ? record.positions : [];
}

function pitchCandidateFromValue(value: unknown): number | string | null {
    const direct = directPitchCandidateValue(value);
    if (direct !== null) return direct;
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return pitchCandidateFromValue(record.position);
}

function directPitchCandidateValue(value: unknown): number | string | null {
    if (typeof value === 'number') return validPitchPosition(value);
    if (typeof value === 'string' && value.trim()) {
        const trimmed = value.trim();
        if (/^[HL]+$/i.test(trimmed)) return trimmed.toUpperCase();
        return validPitchPosition(Number(trimmed));
    }
    return null;
}

function validPitchPosition(value: number): number | null {
    return Number.isInteger(value) && value >= 0 ? value : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}
