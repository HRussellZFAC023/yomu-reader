import { pitchPatternFromPosition } from './pitch-accent';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';

export function localPitchPatternFromMeta(reading: string, entries: YomitanMetaEntry[]): string {
    for (const entry of entries) {
        if (entry.mode !== 'pitch') continue;
        const position = readPitchPosition(entry.data, reading);
        const pattern = position == null ? '' : pitchPatternFromPosition(reading, position);
        if (pattern) return pattern;
    }
    return '';
}

function readPitchPosition(value: unknown, reading: string): number | null {
    const record = objectRecord(value);
    if (!record) return pitchPositionFromValue(value);
    if (!pitchMetadataReadingMatches(record, reading)) return null;
    return pitchPositionFromMetadataRecord(record);
}

function pitchPositionFromMetadataRecord(record: Record<string, unknown>): number | null {
    const direct = pitchPositionFromValue(record.position);
    if (direct != null) return direct;
    return firstPitchPositionCandidate(record);
}

function firstPitchPositionCandidate(record: Record<string, unknown>): number | null {
    return pitchPositionCandidates(record)
        .map(candidate => pitchPositionFromValue(candidate))
        .find((position): position is number => position != null) ?? null;
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
