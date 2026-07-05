import { normalizePitchPatternsForReading, pitchPatternFromPosition } from './pitch-accent';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';

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
