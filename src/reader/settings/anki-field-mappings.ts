import { isSentenceAudioFieldName } from '../anki/field-mapping';
import type { AnkiFieldMapping, AnkiFieldMappingRole, AnkiFieldMappings } from '../app/types';

const ANKI_FIELD_MAPPING_ROLES: readonly AnkiFieldMappingRole[] = ['expression', 'reading', 'meaning', 'sentence', 'audio', 'sentenceAudio', 'image'];

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

export interface AnkiSentenceAudioMappingMigration {
    mappings: AnkiFieldMappings;
    movedModels: string[];
}

// Until the sentenceAudio role existed, the mapping editor only offered one
// audio row, so users whose note type had a single sentence-audio field pointed
// the word-audio role at it. Move those to the role they actually meant, once.
// Never re-point a model that already has a sentenceAudio mapping: that is a
// deliberate choice and must win.
export function migrateAnkiSentenceAudioMappings(mappings: AnkiFieldMappings): AnkiSentenceAudioMappingMigration {
    const out: AnkiFieldMappings = {};
    const movedModels: string[] = [];
    for (const [modelName, mapping] of Object.entries(mappings)) {
        const audioField = mapping.audio?.trim() ?? '';
        if (!audioField || mapping.sentenceAudio?.trim() || !isSentenceAudioFieldName(audioField)) {
            out[modelName] = mapping;
            continue;
        }
        const { audio: _audio, ...rest } = mapping;
        out[modelName] = { ...rest, sentenceAudio: audioField };
        movedModels.push(modelName);
    }
    return { mappings: out, movedModels };
}
