import type { ReaderSettings } from '../app/types';
import { normalizeAnkiFieldName } from './field-mapping';
import { resolvedAnkiModelName } from './anki-settings';

export function yomuFieldAlias(fieldName: string): string {
    return YOMU_FIELD_ALIASES[normalizeAnkiFieldName(fieldName)] ?? '';
}

const YOMU_FIELD_ALIASES: Record<string, string> = Object.fromEntries([
    ...yomuAliasEntries('Expression', 'baseform|character|characters|dictionaryform|expressiontext|headword|headwordkanji|jlabkanji|japaneseword|japaneseexpression|kanji|lemma|searchterm|targetkanji|targetword|termtext|termkanji|word|wordexpression|wordkanji|vocab|vocabkanji|vocabulary|vocabularycharacter|vocabularyexpression|vocabularykanji|term|front'),
    ...yomuAliasEntries('Reading', 'expressionreading|furigana|furiganareading|hiragana|jlabhiragana|japanesereading|kanareading|readings|kana|ruby|termkana|termreading|vocabfurigana|vocabkana|vocabreading|vocabularyfurigana|wordkana|vocabularyreading|wordreading|yomi'),
    ...yomuAliasEntries('Meaning', 'def|definition1|definition|definitionenglish|definitions|defs|english|englishdefinition|englishmeaning|gloss|glosses|glossary|heisigkeyword|jlabdictionarylookup|jlabremarks|jlabtranslation|keyword|meaningenglish|meanings|otherback|remarksback|sense|termmeaning|translation|translation1|vocabdef|vocabdefinition|vocabularyenglish|vocabularymeaning|wordmeaning|back'),
    ...yomuAliasEntries('Sentence', 'example|examplesentence|examplesentencetext|contextsentence|contexttext|sentenceexpression|sentencefurigana|sentencekanji|sentencetext|sentkanji|japanesesentence|miningsentence|sourcesentence|sourcetext'),
    ...yomuAliasEntries('Url', 'sourceurl|url'),
    ...yomuAliasEntries('PartOfSpeech', 'pos|partofspeech'),
    ...yomuAliasEntries('Pitch', 'pitchaccent'),
    ...yomuAliasEntries('DictionaryDefinitions', 'dictionary|dictionaries|dictionarydefinition|dictionarydefinitions'),
]);

function yomuAliasEntries(field: string, aliases: string): Array<[string, string]> {
    return aliases.split('|').map(alias => [alias, field]);
}

export function noteLooksLikeYomuModel(modelName: string, settings: ReaderSettings, fieldNames: string[]): boolean {
    const configuredModel = resolvedAnkiModelName(settings);
    if (modelName === configuredModel) return true;
    return yomuModelFieldSet(fieldNames);
}

export function shouldTreatExistingModelAsYomuManaged(modelName: string, settings: ReaderSettings, fieldNames: string[]): boolean {
    const configuredModel = resolvedAnkiModelName(settings);
    if (modelName === configuredModel && isDefaultYomuModelName(configuredModel)) return true;
    return yomuModelFieldSet(fieldNames);
}

function isDefaultYomuModelName(modelName: string): boolean {
    return modelName === 'よむ Japanese' || modelName === 'Yomu Japanese';
}

function yomuModelFieldSet(fieldNames: string[]): boolean {
    const fieldSet = new Set(fieldNames);
    return ['Expression', 'Meaning', 'Sentence', 'DictionaryDefinitions'].every(field => fieldSet.has(field));
}
