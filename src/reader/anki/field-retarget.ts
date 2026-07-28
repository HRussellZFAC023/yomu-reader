import type { AnkiFieldMapping, ReaderSettings } from '../app/types';
import {
    ankiFieldMappingForModel,
    fieldNameForRole,
    mappedRoleForField,
    yomuFieldForRole,
} from './field-mapping';
import { ankiAudioFieldTargets, retargetAudioFilesByKind, retargetMediaFiles } from './media-files';
import { yomuFieldAlias } from './model-fields';
import { ANKI_FIELD_ROLES, type AnkiFieldRole, type AnkiNote } from './types';

export function retargetAnkiNoteToExistingModel(note: AnkiNote, fieldNames: string[], settings: ReaderSettings): AnkiNote {
    const mapping = ankiFieldMappingForModel(settings, note.modelName, fieldNames);
    const fields = retargetYomuFieldsToExistingModel(note.fields, fieldNames, mapping);
    const audioTargets = ankiAudioFieldTargets(fieldNames, mapping);
    const imageField = fieldNameForRole(fieldNames, 'image', mapping);
    return {
        deckName: note.deckName,
        modelName: note.modelName,
        fields,
        tags: note.tags,
        options: note.options,
        ...(audioTargets && note.audio?.length ? { audio: retargetAudioFilesByKind(note.audio, audioTargets) } : {}),
        ...(imageField && note.picture?.length ? { picture: retargetMediaFiles(note.picture, imageField) } : {}),
    };
}

export function ankiNoteForDuplicatePreflight(note: AnkiNote): AnkiNote {
    return {
        deckName: note.deckName,
        modelName: note.modelName,
        fields: note.fields,
        tags: note.tags,
        options: note.options,
    };
}

export function retargetAnkiNoteForMobileHandoff(note: AnkiNote, settings: ReaderSettings): AnkiNote {
    const mapping = activeMobileHandoffMapping(note, settings);
    if (!mapping) return note;
    return {
        ...note,
        fields: mobileHandoffFieldsWithMappings(note.fields, mapping),
        ...retargetMobileHandoffMedia(note, mapping),
    };
}

function activeMobileHandoffMapping(note: AnkiNote, settings: ReaderSettings): AnkiFieldMapping | null {
    const mapping = settings.ankiFieldMappings?.[note.modelName];
    return mapping && Object.values(mapping).some(value => value?.trim()) ? mapping : null;
}

function mobileHandoffFieldsWithMappings(yomuFields: Record<string, string>, mapping: AnkiFieldMapping): Record<string, string> {
    const fields = { ...yomuFields };
    for (const role of ANKI_FIELD_ROLES) {
        const fieldName = mobileMappedFieldName(mapping, role);
        const value = yomuFields[yomuFieldForRole(role)];
        if (fieldName && value) fields[fieldName] = value;
    }
    return fields;
}

function retargetMobileHandoffMedia(note: AnkiNote, mapping: AnkiFieldMapping): Partial<Pick<AnkiNote, 'audio' | 'picture'>> {
    const media: Partial<Pick<AnkiNote, 'audio' | 'picture'>> = {};
    const wordAudioField = mobileMappedFieldName(mapping, 'audio');
    const sentenceAudioField = mobileMappedFieldName(mapping, 'sentenceAudio');
    const imageField = mobileMappedFieldName(mapping, 'image');
    if ((wordAudioField || sentenceAudioField) && note.audio?.length) {
        media.audio = retargetAudioFilesByKind(note.audio, {
            word: wordAudioField || sentenceAudioField,
            context: sentenceAudioField || wordAudioField,
        });
    }
    if (imageField && note.picture?.length) media.picture = retargetMediaFiles(note.picture, imageField);
    return media;
}

function mobileMappedFieldName(mapping: AnkiFieldMapping, role: AnkiFieldRole): string {
    return mapping[role]?.trim() ?? '';
}

export function retargetYomuFieldsToExistingModel(yomuFields: Record<string, string>, fieldNames: string[], mapping?: AnkiFieldMapping): Record<string, string> {
    const valuesByRole: Partial<Record<AnkiFieldRole, string>> = {
        expression: yomuFields.Expression,
        reading: yomuFields.Reading,
        meaning: yomuFields.Meaning,
        sentence: yomuFields.Sentence,
    };
    const fields = Object.fromEntries(fieldNames.map(fieldName => [fieldName, '']));
    for (const role of ['expression', 'reading', 'meaning', 'sentence'] as AnkiFieldRole[]) {
        const fieldName = fieldNameForRole(fieldNames, role, mapping);
        const value = valuesByRole[role];
        if (fieldName && value) fields[fieldName] = value;
    }
    return fields;
}

export function mergedYomuFields(fieldNames: string[], existingFields: Record<string, string>, yomuFields: Record<string, string>, canOwnYomuFields: boolean, mapping?: AnkiFieldMapping): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const fieldName of fieldNames) {
        const value = yomuValueForExistingField(fieldName, yomuFields, mapping, canOwnYomuFields);
        if (!value) continue;
        if (!canOwnYomuFields && existingFields[fieldName]) continue;
        fields[fieldName] = value;
    }
    return fields;
}

function yomuValueForExistingField(fieldName: string, yomuFields: Record<string, string>, mapping: AnkiFieldMapping | undefined, canOwnYomuFields: boolean): string {
    const mappedRole = mappedRoleForField(fieldName, mapping);
    if (mappedRole) return yomuFields[yomuFieldForRole(mappedRole)] ?? '';
    const alias = yomuFieldAlias(fieldName);
    if (alias && !canOwnYomuFields) return yomuFields[alias] ?? '';
    return yomuFields[fieldName] ?? (alias ? yomuFields[alias] ?? '' : '');
}
