import { pitchPatternFromPosition } from './pitch-accent';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';

export function localPitchPatternFromMeta(reading: string, entries: YomitanMetaEntry[]): string {
    return localPitchPatternsFromMeta(reading, entries)[0] ?? '';
}

// UT-65: words commonly carry several accepted accents — pitch dictionaries
// list them all, so surface every distinct pattern instead of the first hit.
export function localPitchPatternsFromMeta(reading: string, entries: YomitanMetaEntry[]): string[] {
    const patterns: string[] = [];
    for (const entry of entries) {
        if (entry.mode !== 'pitch') continue;
        for (const position of readPitchPositions(entry.data, reading)) {
            const pattern = pitchPatternFromPosition(reading, position);
            if (pattern && !patterns.includes(pattern)) patterns.push(pattern);
        }
    }
    return patterns;
}

function readPitchPositions(value: unknown, reading: string): number[] {
    const record = objectRecord(value);
    if (!record) {
        const position = pitchPositionFromValue(value);
        return position == null ? [] : [position];
    }
    if (!pitchMetadataReadingMatches(record, reading)) return [];
    const candidates = pitchPositionCandidates(record)
        .map(candidate => pitchPositionFromValue(candidate))
        .filter((position): position is number => position != null);
    if (candidates.length) return candidates;
    const direct = pitchPositionFromValue(record.position);
    return direct == null ? [] : [direct];
}



function pitchMetadataReadingMatches(record: Record<string, unknown>, reading: string): boolean {
    const metadataReading = typeof record.reading === 'string' ? record.reading : '';
    return !metadataReading || !reading || metadataReading === reading;
}

function pitchPositionCandidates(record: Record<string, unknown>): unknown[] {
    if (Array.isArray(record.pitches)) return record.pitches;
    return Array.isArray(record.positions) ? record.positions : [];
}

function pitchPositionFromValue(value: unknown): number | null {
    const direct = directPitchPositionValue(value);
    if (direct !== null) return direct;
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return pitchPositionFromValue(record.position);
}

function directPitchPositionValue(value: unknown): number | null {
    if (typeof value === 'number') return validPitchPosition(value);
    if (typeof value === 'string' && value.trim()) return validPitchPosition(Number(value));
    return null;
}

function validPitchPosition(value: number): number | null {
    return Number.isInteger(value) && value >= 0 ? value : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}
