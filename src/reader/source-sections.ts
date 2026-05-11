import { IMMERSION_KIT_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID } from './constants';
import type { ReaderSettings } from './types';

export const KANJI_STROKE_SOURCE_ID = '__kanji_stroke__';
export const KANJI_JPDB_SOURCE_ID = '__kanji_jpdb__';
export const KANJI_RTK_SOURCE_ID = '__kanji_rtk__';
export const KANJI_DICTIONARIES_SOURCE_ID = '__kanji_dictionaries__';
export const KANJI_SIMILAR_WORDS_SOURCE_ID = '__kanji_similar_words__';
export const KANJI_ORIGINS_SOURCE_ID = '__kanji_origins__';

export interface SettingsSourceRow {
    id: string;
    name: string;
    alias: string;
    enabled: boolean;
    priority: number;
    prefix: string;
    readonly: boolean;
    help: string;
    removable?: boolean;
}

export function definitionSourceRows(settings: ReaderSettings): SettingsSourceRow[] {
    return [
        {
            id: JPDB_DEFINITION_SOURCE_ID,
            name: 'JPDB',
            alias: 'JPDB',
            enabled: settings.jpdbDefinitionsEnabled,
            priority: settings.jpdbDefinitionsPriority,
            prefix: 'jpdbDefinitions',
            readonly: true,
            help: 'Built-in JPDB meanings from the parsed card.',
        },
        {
            id: STUDY_TRANSLATION_SOURCE_ID,
            name: 'Translation',
            alias: 'Translation',
            enabled: settings.studyTranslationEnabled,
            priority: settings.studyTranslationPriority,
            prefix: 'studyTranslation',
            readonly: true,
            help: 'Automatic sentence translation for the current lookup context.',
        },
        {
            id: STUDY_GRAMMAR_SOURCE_ID,
            name: 'Grammar',
            alias: 'Grammar',
            enabled: settings.studyGrammarEnabled,
            priority: settings.studyGrammarPriority,
            prefix: 'studyGrammar',
            readonly: true,
            help: 'Automatic local grammar hints for the current lookup context.',
        },
        {
            id: IMMERSION_KIT_SOURCE_ID,
            name: 'Immersion Kit',
            alias: 'Immersion Kit',
            enabled: settings.immersionKitEnabled,
            priority: settings.immersionKitPriority,
            prefix: 'immersionKit',
            readonly: true,
            help: 'Example sentences, images, and audio for the looked-up word.',
        },
        ...settings.dictionaryPreferences.map((preference, index) => ({
            id: preference.name,
            name: preference.name,
            alias: preference.alias,
            enabled: preference.enabled,
            priority: preference.priority,
            prefix: `dictionaryPreferences.${index}`,
            readonly: false,
            removable: true,
            help: '',
        })),
    ].sort(compareSourceRows);
}

export function kanjiSourceRows(settings: ReaderSettings): SettingsSourceRow[] {
    return [
        {
            id: KANJI_STROKE_SOURCE_ID,
            name: 'Stroke practice',
            alias: 'Stroke practice',
            enabled: settings.kanjivgEnabled,
            priority: settings.kanjivgPriority,
            prefix: 'kanjivg',
            readonly: true,
            help: 'Stroke order preview and drawing pad.',
        },
        {
            id: KANJI_JPDB_SOURCE_ID,
            name: 'JPDB kanji',
            alias: 'JPDB kanji',
            enabled: settings.jpdbKanjiEnabled,
            priority: settings.jpdbKanjiPriority,
            prefix: 'jpdbKanji',
            readonly: true,
            help: 'JPDB readings, components, and mnemonic when available.',
        },
        {
            id: KANJI_RTK_SOURCE_ID,
            name: 'RTK',
            alias: 'RTK',
            enabled: settings.rtkEnabled,
            priority: settings.rtkPriority,
            prefix: 'rtk',
            readonly: true,
            help: 'Remembering the Kanji keywords, elements, and stories.',
        },
        {
            id: KANJI_DICTIONARIES_SOURCE_ID,
            name: 'Imported kanji dictionaries',
            alias: 'Imported kanji dictionaries',
            enabled: settings.localDictionaryShowKanji,
            priority: settings.kanjiDictionariesPriority,
            prefix: 'kanjiDictionaries',
            readonly: true,
            help: 'Kanji entries from imported Yomitan dictionaries.',
        },
        {
            id: KANJI_SIMILAR_WORDS_SOURCE_ID,
            name: 'Words using this kanji',
            alias: 'Words using this kanji',
            enabled: settings.similarKanjiWords,
            priority: settings.similarKanjiWordsPriority,
            prefix: 'similarKanjiWords',
            readonly: true,
            help: 'Related JPDB and imported-dictionary vocabulary.',
        },
        {
            id: KANJI_ORIGINS_SOURCE_ID,
            name: 'Origin structure',
            alias: 'Origin structure',
            enabled: settings.kanjiOriginsEnabled,
            priority: settings.kanjiOriginsPriority,
            prefix: 'kanjiOrigins',
            readonly: true,
            help: 'Compact facts, component graph, and radical images.',
        },
    ].sort(compareSourceRows);
}

export function orderedDefinitionSourceIds(settings: ReaderSettings, dictionaryNames: string[]): string[] {
    const preferences = new Map(settings.dictionaryPreferences.map(item => [item.name, item]));
    const sources = [
        {
            id: JPDB_DEFINITION_SOURCE_ID,
            enabled: settings.jpdbDefinitionsEnabled,
            priority: settings.jpdbDefinitionsPriority,
            name: 'JPDB',
        },
        {
            id: STUDY_TRANSLATION_SOURCE_ID,
            enabled: settings.studyTranslationEnabled,
            priority: settings.studyTranslationPriority,
            name: 'Translation',
        },
        {
            id: STUDY_GRAMMAR_SOURCE_ID,
            enabled: settings.studyGrammarEnabled,
            priority: settings.studyGrammarPriority,
            name: 'Grammar',
        },
        {
            id: IMMERSION_KIT_SOURCE_ID,
            enabled: settings.immersionKitEnabled,
            priority: settings.immersionKitPriority,
            name: 'Immersion Kit',
        },
        ...dictionaryNames.map((name, index) => {
            const preference = preferences.get(name);
            return {
                id: name,
                enabled: preference?.enabled ?? true,
                priority: preference?.priority ?? 1000 + index,
                name,
            };
        }),
    ];
    return sources
        .filter(source => source.enabled)
        .sort(compareSourceOrder)
        .map(source => source.id);
}

export function orderedKanjiSourceIds(settings: ReaderSettings): string[] {
    return kanjiSourceRows(settings)
        .filter(row => row.enabled)
        .map(row => row.id);
}

function compareSourceRows(a: SettingsSourceRow, b: SettingsSourceRow): number {
    return a.priority - b.priority || a.name.localeCompare(b.name);
}

function compareSourceOrder(a: { priority: number; name: string }, b: { priority: number; name: string }): number {
    return a.priority - b.priority || a.name.localeCompare(b.name);
}
