import type { AnkiFieldMapping, AnkiFieldMappingRole, AnkiFieldMappings } from '../types';

const ANKI_FIELD_MAPPING_ROLES: readonly AnkiFieldMappingRole[] = ['expression', 'reading', 'meaning', 'sentence', 'audio', 'image'];

export function normalizeAnkiFieldMappings(value: unknown): AnkiFieldMappings {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: AnkiFieldMappings = {};
    Object.entries(value as Record<string, unknown>).forEach(([modelName, mapping]) => {
        const normalizedModelName = modelName.trim();
        if (!normalizedModelName || !mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return;
        const normalizedMapping: AnkiFieldMapping = {};
        for (const role of ANKI_FIELD_MAPPING_ROLES) {
            const fieldName = (mapping as Record<string, unknown>)[role];
            if (typeof fieldName !== 'string') continue;
            const normalizedFieldName = fieldName.trim();
            if (normalizedFieldName) normalizedMapping[role] = normalizedFieldName;
        }
        if (Object.keys(normalizedMapping).length) out[normalizedModelName] = normalizedMapping;
    });
    return out;
}
