import { ANKI_SOURCE_ID, BUNPRO_DEFINITION_SOURCE_ID, IMMERSION_KIT_SOURCE_ID, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID, WANIKANI_DEFINITION_SOURCE_ID } from '../app/constants';
import { uiText, type UiCopyKey } from '../app/i18n';
import { hasJitenApiCredential } from '../settings/api-credential';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';

export const KANJI_STROKE_SOURCE_ID = '__kanji_stroke__';
export const KANJI_JPDB_SOURCE_ID = '__kanji_jpdb__';
export const KANJI_RTK_SOURCE_ID = '__kanji_rtk__';
export const KANJI_WANIKANI_SOURCE_ID = '__kanji_wanikani__';
export const KANJI_DICTIONARIES_SOURCE_ID = '__kanji_dictionaries__';
export const KANJI_SIMILAR_WORDS_SOURCE_ID = '__kanji_similar_words__';
export const KANJI_ORIGINS_SOURCE_ID = '__kanji_origins__';
const KANJI_DICTIONARY_SOURCE_PREFIX = '__kanji_dictionary__:';
const BUILT_IN_SOURCE_NAME_KEYS: Record<string, UiCopyKey> = {
    [ANKI_SOURCE_ID]: 'sourceNameAnki',
    [STUDY_TRANSLATION_SOURCE_ID]: 'sourceNameTranslation',
    [STUDY_GRAMMAR_SOURCE_ID]: 'sourceNameGrammar',
    [IMMERSION_KIT_SOURCE_ID]: 'sourceNameImmersionKit',
    [KANJI_STROKE_SOURCE_ID]: 'sourceNameStrokePractice',
    [KANJI_JPDB_SOURCE_ID]: 'readingsComponents',
    [KANJI_DICTIONARIES_SOURCE_ID]: 'sourceNameImportedKanjiDictionaries',
    [KANJI_ORIGINS_SOURCE_ID]: 'originStructure',
};

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
    dictionaryType?: 'terms' | 'kanji' | 'frequency';
}

export function definitionSourceRows(settings: ReaderSettings): SettingsSourceRow[] {
    const language = settings.interfaceLanguage;
    const builtInRows: SettingsSourceRow[] = [
        {
            id: JITEN_DEFINITION_SOURCE_ID,
            name: 'Jiten',
            alias: settings.jitenDefinitionsAlias,
            enabled: settings.jitenDefinitionsEnabled,
            priority: settings.jitenDefinitionsPriority,
            prefix: 'jitenDefinitions',
            readonly: true,
            help: uiText(language, 'sourceHelpJiten'),
        },
        {
            id: JPDB_DEFINITION_SOURCE_ID,
            name: 'JPDB',
            alias: settings.jpdbDefinitionsAlias,
            enabled: settings.jpdbDefinitionsEnabled,
            priority: settings.jpdbDefinitionsPriority,
            prefix: 'jpdbDefinitions',
            readonly: true,
            help: uiText(language, 'sourceHelpJpdb'),
        },
        {
            id: BUNPRO_DEFINITION_SOURCE_ID,
            name: 'Bunpro',
            alias: settings.bunproDefinitionsAlias,
            enabled: settings.bunproDefinitionsEnabled,
            priority: settings.bunproDefinitionsPriority,
            prefix: 'bunproDefinitions',
            readonly: true,
            help: uiText(language, 'sourceHelpBunpro'),
        },
        {
            id: WANIKANI_DEFINITION_SOURCE_ID,
            name: 'WaniKani',
            alias: settings.wanikaniDefinitionsAlias,
            enabled: settings.wanikaniDefinitionsEnabled,
            priority: settings.wanikaniDefinitionsPriority,
            prefix: 'wanikaniDefinitions',
            readonly: true,
            help: uiText(language, 'sourceHelpWanikani'),
        },
        {
            id: STUDY_TRANSLATION_SOURCE_ID,
            name: uiText(language, 'sourceNameTranslation'),
            alias: settings.studyTranslationAlias,
            enabled: settings.studyTranslationEnabled,
            priority: settings.studyTranslationPriority,
            prefix: 'studyTranslation',
            readonly: true,
            help: uiText(language, 'sourceHelpTranslation'),
        },
        {
            id: ANKI_SOURCE_ID,
            name: 'Anki',
            alias: settings.ankiSectionAlias,
            enabled: settings.ankiSectionEnabled,
            priority: settings.ankiSectionPriority,
            prefix: 'ankiSection',
            readonly: true,
            help: uiText(language, 'sourceHelpAnki'),
        },
        {
            id: STUDY_GRAMMAR_SOURCE_ID,
            name: uiText(language, 'sourceNameGrammar'),
            alias: settings.studyGrammarAlias,
            enabled: settings.studyGrammarEnabled,
            priority: settings.studyGrammarPriority,
            prefix: 'studyGrammar',
            readonly: true,
            help: uiText(language, 'sourceHelpGrammar'),
        },
        {
            id: IMMERSION_KIT_SOURCE_ID,
            name: uiText(language, 'sourceNameImmersionKit'),
            alias: settings.immersionKitAlias,
            enabled: settings.immersionKitEnabled,
            priority: settings.immersionKitPriority,
            prefix: 'immersionKit',
            readonly: true,
            help: uiText(language, 'sourceHelpImmersionKit'),
        },
    ];

    return [
        ...builtInRows,
        ...settings.dictionaryPreferences.filter(preference => {
            const type = preference.type ?? 'terms';
            return type === 'terms' || type === 'kanji';
        }).map(preference => ({
            id: preference.name,
            name: preference.name,
            alias: preference.alias,
            enabled: preference.enabled,
            priority: preference.priority,
            prefix: `dictionaryPreferences.${settings.dictionaryPreferences.indexOf(preference)}`,
            readonly: false,
            removable: true,
            dictionaryType: preference.type === 'kanji' ? 'kanji' as const : 'terms' as const,
            help: '',
        })),
    ].filter(row => row.id !== IMMERSION_KIT_SOURCE_ID || settings.immersionKitEnabled)
        .sort(compareSourceRows);
}

export function kanjiSourceRows(settings: ReaderSettings): SettingsSourceRow[] {
    const language = settings.interfaceLanguage;
    const apiSource = activeKanjiFactSource(settings);
    const readingsComponentsName = apiSource.name === 'Jiten' ? uiText(language, 'sourceNameJitenKanjiFacts') : uiText(language, 'readingsComponents');
    const kanjiDictionaryRows = settings.dictionaryPreferences.filter(preference => preference.type === 'kanji').map(preference => ({
        id: kanjiDictionarySourceId(preference.name),
        name: preference.name,
        alias: preference.alias,
        enabled: settings.localDictionaryShowKanji && preference.enabled,
        priority: preference.priority,
        prefix: `dictionaryPreferences.${settings.dictionaryPreferences.indexOf(preference)}`,
        readonly: false,
        removable: true,
        dictionaryType: 'kanji' as const,
        help: uiText(language, 'sourceHelpImportedKanjiDictionary'),
    }));
    return [
        {
            id: KANJI_STROKE_SOURCE_ID,
            name: uiText(language, 'sourceNameStrokePractice'),
            alias: settings.kanjivgAlias,
            enabled: settings.kanjivgEnabled,
            priority: settings.kanjivgPriority,
            prefix: 'kanjivg',
            readonly: true,
            help: uiText(language, 'sourceHelpStrokePractice'),
        },
        {
            id: KANJI_JPDB_SOURCE_ID,
            name: readingsComponentsName,
            alias: settings.jpdbKanjiAlias,
            enabled: settings.jpdbKanjiEnabled,
            priority: settings.jpdbKanjiPriority,
            prefix: 'jpdbKanji',
            readonly: true,
            help: apiSource.name === 'Jiten' ? uiText(language, 'sourceHelpJitenKanjiFacts') : uiText(language, 'sourceHelpReadingsComponents'),
        },
        {
            id: KANJI_RTK_SOURCE_ID,
            name: 'RTK',
            alias: settings.rtkAlias,
            enabled: settings.rtkEnabled,
            priority: settings.rtkPriority,
            prefix: 'rtk',
            readonly: true,
            help: uiText(language, 'sourceHelpRtk'),
        },
        {
            id: IMMERSION_KIT_SOURCE_ID,
            name: uiText(language, 'sourceNameImmersionKit'),
            alias: settings.kanjiImmersionKitAlias,
            enabled: settings.kanjiImmersionKitEnabled,
            priority: settings.kanjiImmersionKitPriority,
            prefix: 'kanjiImmersionKit',
            readonly: true,
            help: uiText(language, 'sourceHelpImmersionKit'),
        },
        {
            id: KANJI_WANIKANI_SOURCE_ID,
            name: 'WaniKani',
            alias: settings.wanikaniKanjiAlias,
            enabled: settings.wanikaniKanjiEnabled,
            priority: settings.wanikaniKanjiPriority,
            prefix: 'wanikaniKanji',
            readonly: true,
            help: uiText(language, 'sourceHelpWanikaniKanji'),
        },
        ...(kanjiDictionaryRows.length ? [] : [{
            id: KANJI_DICTIONARIES_SOURCE_ID,
            name: uiText(language, 'sourceNameImportedKanjiDictionaries'),
            alias: settings.kanjiDictionariesAlias,
            enabled: settings.localDictionaryShowKanji,
            priority: settings.kanjiDictionariesPriority,
            prefix: 'kanjiDictionaries',
            readonly: true,
            help: uiText(language, 'sourceHelpImportedKanjiDictionaries'),
        }]),
        ...kanjiDictionaryRows,
        {
            id: KANJI_ORIGINS_SOURCE_ID,
            name: uiText(language, 'originStructure'),
            alias: settings.kanjiOriginsAlias,
            enabled: settings.kanjiOriginsEnabled,
            priority: settings.kanjiOriginsPriority,
            prefix: 'kanjiOrigins',
            readonly: true,
            help: uiText(language, 'sourceHelpComponentGraph'),
        },
    ].sort(compareSourceRows);
}

function activeKanjiFactSource(settings: ReaderSettings): { name: 'JPDB' | 'Jiten' } {
    return hasJitenApiCredential(settings)
        ? { name: 'Jiten' }
        : { name: 'JPDB' };
}

export function orderedDefinitionSourceIds(settings: ReaderSettings, dictionaryNames: string[]): string[] {
    const preferences = new Map(settings.dictionaryPreferences.map(item => [item.name, item]));
    const sources = [
        {
            id: JITEN_DEFINITION_SOURCE_ID,
            enabled: settings.jitenDefinitionsEnabled,
            priority: settings.jitenDefinitionsPriority,
            name: 'Jiten',
        },
        {
            id: JPDB_DEFINITION_SOURCE_ID,
            enabled: settings.jpdbDefinitionsEnabled,
            priority: settings.jpdbDefinitionsPriority,
            name: 'JPDB',
        },
        {
            id: BUNPRO_DEFINITION_SOURCE_ID,
            enabled: settings.bunproDefinitionsEnabled,
            priority: settings.bunproDefinitionsPriority,
            name: 'Bunpro',
        },
        {
            id: WANIKANI_DEFINITION_SOURCE_ID,
            enabled: settings.wanikaniDefinitionsEnabled,
            priority: settings.wanikaniDefinitionsPriority,
            name: 'WaniKani',
        },
        {
            id: ANKI_SOURCE_ID,
            enabled: settings.ankiSectionEnabled,
            priority: settings.ankiSectionPriority,
            name: 'Anki',
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
        ...dictionaryNames
        .filter(name => (preferences.get(name)?.type ?? 'terms') === 'terms')
        .map((name, index) => {
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

export function definitionSourceLabel(settings: ReaderSettings, sourceId: string, fallback = '', language: InterfaceLanguage = settings.interfaceLanguage): string {
    const row = definitionSourceRows(settings).find(candidate => candidate.id === sourceId);
    return localizedSourceRowLabel(row, language) || fallback;
}

export function orderedKanjiSourceIds(settings: ReaderSettings): string[] {
    return kanjiSourceRows(settings)
        .filter(row => row.enabled)
        .filter(row => row.id !== KANJI_SIMILAR_WORDS_SOURCE_ID)
        .filter(row => row.id !== IMMERSION_KIT_SOURCE_ID || settings.immersionKitEnabled)
        .filter(row => row.id !== KANJI_DICTIONARIES_SOURCE_ID || !settings.dictionaryPreferences.some(preference => preference.type === 'kanji'))
        .map(row => row.id);
}

export function kanjiSourceLabel(settings: ReaderSettings, sourceId: string, fallback = '', language: InterfaceLanguage = settings.interfaceLanguage): string {
    const row = kanjiSourceRows(settings).find(candidate => candidate.id === sourceId);
    return localizedSourceRowLabel(row, language) || fallback;
}

function kanjiDictionarySourceId(name: string): string {
    return `${KANJI_DICTIONARY_SOURCE_PREFIX}${name}`;
}

export function kanjiDictionaryNameFromSourceId(sourceId: string): string | null {
    return sourceId.startsWith(KANJI_DICTIONARY_SOURCE_PREFIX)
        ? sourceId.slice(KANJI_DICTIONARY_SOURCE_PREFIX.length)
        : null;
}

function compareSourceRows(a: SettingsSourceRow, b: SettingsSourceRow): number {
    return a.priority - b.priority || a.name.localeCompare(b.name);
}

function compareSourceOrder(a: { priority: number; name: string }, b: { priority: number; name: string }): number {
    return a.priority - b.priority || a.name.localeCompare(b.name);
}

function localizedSourceRowLabel(row: SettingsSourceRow | undefined, language: InterfaceLanguage): string {
    if (!row) return '';
    if (row.alias) return row.alias;
    if (row.id === KANJI_JPDB_SOURCE_ID && row.name !== uiText(language, 'readingsComponents')) return row.name;
    const key = builtInSourceNameKey(row.id);
    return key ? uiText(language, key) : row.name;
}

function builtInSourceNameKey(sourceId: string): UiCopyKey | undefined {
    return BUILT_IN_SOURCE_NAME_KEYS[sourceId];
}
