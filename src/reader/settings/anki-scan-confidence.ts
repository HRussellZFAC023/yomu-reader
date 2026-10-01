import type { AnkiFieldMappingRole } from '../app/types';

type AnkiScanConfidence = 'high' | 'medium' | 'low';

const ANKI_FIELD_MAPPING_ROLES = new Set<AnkiFieldMappingRole>(['expression', 'reading', 'meaning', 'sentence', 'audio', 'sentenceAudio', 'image']);
const ANKI_SCAN_CONFIDENCE_VALUES = new Set<AnkiScanConfidence>(['high', 'medium', 'low']);

export function isAnkiFieldMappingRole(role: string): role is AnkiFieldMappingRole {
    return ANKI_FIELD_MAPPING_ROLES.has(role as AnkiFieldMappingRole);
}

/**
 * How sure an Anki library scan was of each field role of one note type, read
 * from the scan record the Settings form keeps (JSON keyed by note type). A
 * missing or malformed record, or an unknown role or value, reads as no confidence.
 */
export function ankiScanConfidenceForModel(record: string, modelName: string): Partial<Record<AnkiFieldMappingRole, AnkiScanConfidence>> {
    if (!record.trim()) return {};
    try {
        const parsed = JSON.parse(record) as Record<string, Partial<Record<AnkiFieldMappingRole, unknown>>>;
        return Object.fromEntries(ankiScanConfidenceEntries(parsed[modelName] ?? {}));
    } catch {
        return {};
    }
}

function isAnkiScanConfidence(value: unknown): value is AnkiScanConfidence {
    return typeof value === 'string' && ANKI_SCAN_CONFIDENCE_VALUES.has(value as AnkiScanConfidence);
}

function ankiScanConfidenceEntries(confidence: Partial<Record<AnkiFieldMappingRole, unknown>>): Array<[AnkiFieldMappingRole, AnkiScanConfidence]> {
    const entries: Array<[AnkiFieldMappingRole, AnkiScanConfidence]> = [];
    for (const [role, value] of Object.entries(confidence)) {
        if (isAnkiFieldMappingRole(role) && isAnkiScanConfidence(value)) entries.push([role, value]);
    }
    return entries;
}
