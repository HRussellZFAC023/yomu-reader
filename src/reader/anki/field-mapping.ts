import type { AnkiFieldMapping, AnkiFieldMappings, JPDBCard, ReaderSettings } from '../app/types';
import { unique } from '../core/array-utils';
import {
    ANKI_FIELD_ROLES,
    type AnkiFieldContentSample,
    type AnkiFieldContentSamples,
    type AnkiFieldRole,
    type AnkiFieldSuggestion,
    type AnkiModelScanResult,
    type AnkiNoteInfo,
} from './types';

const ankiFieldNames = (names: string): string[] => names.split('|');

const ANKI_HEADWORD_FIELD_NAME_PREFIX = ankiFieldNames(
    'Vocabulary-Kanji|Vocabulary Kanji|Vocab Kanji|Jlab-Kanji|Japanese_Word|Word|Word Kanji|Japanese Word|Headword|Headword Kanji|Term Kanji|Term Text|Expression Text|Base Form|Dictionary Form',
);

const ANKI_HEADWORD_FIELD_NAME_TAIL = ankiFieldNames(
    'Learnable|Lemma|Primary|Search Term|Target Word|Term|Vocab|Vocabulary|Vocabulary Expression|Word Expression',
);

const ANKI_GENERIC_EXPRESSION_FIELD_NAMES = ankiFieldNames('Expression|Front|Japanese|Kanji|Katakana');

const ANKI_HEADWORD_FIELD_NAMES = [
    ...ANKI_HEADWORD_FIELD_NAME_PREFIX,
    'Expression Reading',
    'Japanese Expression',
    ...ANKI_HEADWORD_FIELD_NAME_TAIL,
];

export const ANKI_EXPRESSION_FIELD_NAMES = [
    ...ANKI_HEADWORD_FIELD_NAME_PREFIX,
    ...ankiFieldNames('Expression|Expression Reading|Front|Japanese|Japanese Expression|Kanji|Katakana'),
    ...ANKI_HEADWORD_FIELD_NAME_TAIL,
];

export const ANKI_READING_FIELD_NAMES = ankiFieldNames(
    'Vocabulary-Kana|Vocabulary Kana|Vocabulary-Furigana|Vocabulary Furigana|Vocab Kana|Vocab Furigana|Jlab-Hiragana|Readings|Expression Reading|Furigana|Furigana Reading|Hiragana|Japanese Reading|Kana|Kana Reading|On|On Reading|Onyomi|Kun|Kun Reading|Kunyomi|Pronunciation|Reading|Ruby|Term Kana|Term Reading|Vocab Reading|Vocabulary Reading|Word Kana|Word Reading|Yomi',
);

export const ANKI_MEANING_FIELD_NAMES = ankiFieldNames(
    'Vocabulary-English|Vocabulary English|Vocabulary-Meaning|Vocabulary Meaning|Translation_1|Jlab-Translation|RemarksBack|Jlab-Remarks|Other-Back|Jlab-DictionaryLookup|Meaning|Def|Defs|Definition|Definition 1|Definition English|Definitions|English|English Definition|English Meaning|Gloss|Glosses|Glossary|Keyword|MainDefinition|Meanings|Mnemonic|Back|DictionaryDefinitions|Sense|Term Meaning|Translation|Translation 1|Vocab Def|Vocab Definition|Word Meaning',
);

export const ANKI_SENTENCE_FIELD_NAMES = ankiFieldNames(
    'Sentence|Example|Example Sentence|Example Sentence Text|Context|Context Sentence|Context Text|ExpressionSentence|Japanese Sentence|Mining Sentence|SentKanji|Sentence Furigana|Sentence Kanji|Sentence-Kanji|Sentence Text|Source Sentence|Source Text',
);

// Word-audio names only. The sentence/context names moved to
// ANKI_SENTENCE_AUDIO_FIELD_NAMES: while both lived here, a note type exposing
// WordAudio *and* SentenceAudio got whichever matched first for both kinds, so
// word audio could be written into the sentence-audio field.
const ANKI_AUDIO_FIELD_NAMES = ankiFieldNames(
    'Audio|Expression Audio|Term Audio|Vocab Audio|Vocabulary Audio|Word Audio|PronunciationAudio|Sound|Voice',
);

const ANKI_SENTENCE_AUDIO_FIELD_NAMES = ankiFieldNames(
    'SentenceAudio|Sentence Audio|SentAudio|Sentence Sound|Context Audio|Example Audio',
);

const ANKI_IMAGE_FIELD_NAMES = ankiFieldNames(
    'Context Image|Example Image|Frame|Image|Image File|Photo|Picture|Snapshot|Screenshot|Sentence Image|Sentence Screenshot|SentencePicture|Still|Source Image|Term Image|Vocab Image|Vocabulary Image|Word Image',
);

const ANKI_FIELD_ROLE_CANDIDATES: Record<AnkiFieldRole, string[]> = {
    expression: ANKI_EXPRESSION_FIELD_NAMES,
    reading: ANKI_READING_FIELD_NAMES,
    meaning: ANKI_MEANING_FIELD_NAMES,
    sentence: ANKI_SENTENCE_FIELD_NAMES,
    audio: ANKI_AUDIO_FIELD_NAMES,
    sentenceAudio: ANKI_SENTENCE_AUDIO_FIELD_NAMES,
    image: ANKI_IMAGE_FIELD_NAMES,
};

const ANKI_AUDIO_ROLES = new Set<AnkiFieldRole>(['audio', 'sentenceAudio']);

function isAnkiAudioRole(role: AnkiFieldRole): boolean {
    return ANKI_AUDIO_ROLES.has(role);
}

export function scanAnkiModelFields(modelName: string, fields: string[], sampleNotes: AnkiNoteInfo[] = []): AnkiModelScanResult {
    const usedFields = new Set<string>();
    const samples = ankiFieldContentSamples(fields, sampleNotes);
    const suggestions = (Object.keys(ANKI_FIELD_ROLE_CANDIDATES) as AnkiFieldRole[])
        .map(role => {
            const suggestion = suggestAnkiField(role, fields, usedFields, samples);
            if (suggestion.fieldName) usedFields.add(suggestion.fieldName);
            return suggestion;
        });
    return {
        modelName,
        fields,
        suggestions,
        score: ankiModelScanScore(suggestions),
    };
}

function suggestAnkiField(
    role: AnkiFieldRole,
    fields: string[],
    usedFields: Set<string>,
    samples: AnkiFieldContentSamples = {},
): AnkiFieldSuggestion {
    const candidates = ANKI_FIELD_ROLE_CANDIDATES[role];
    const availableFields = fields.filter(field => isAvailableAnkiFieldForRole(field, role, usedFields, samples));
    const exact = firstMatchingAnkiField(availableFields, candidates);
    const content = suggestAnkiFieldFromContent(role, availableFields, samples);
    const exactContentScore = exact ? ankiFieldContentRoleScore(role, samples[exact] ?? []) : 0;
    const fuzzy = firstFuzzyAnkiField(availableFields, candidates);
    return bestAnkiFieldSuggestion(role, exact, fuzzy, content, exactContentScore);
}

function bestAnkiFieldSuggestion(
    role: AnkiFieldRole,
    exact: string,
    fuzzy: string,
    content: AnkiFieldSuggestion,
    exactContentScore: number,
): AnkiFieldSuggestion {
    if (shouldPreferContentSuggestion(content, exact, exactContentScore)) return content;
    const suggestions = [
        exact ? { role, fieldName: exact, confidence: 'high' } : null,
        contentBeforeFuzzyAnkiFieldSuggestion(content, fuzzy),
        fuzzy ? { role, fieldName: fuzzy, confidence: 'medium' } : null,
        content.fieldName ? content : null,
        { role, fieldName: null, confidence: 'low' },
    ];
    return suggestions.find(Boolean) as AnkiFieldSuggestion;
}

function contentBeforeFuzzyAnkiFieldSuggestion(content: AnkiFieldSuggestion, fuzzy: string): AnkiFieldSuggestion | null {
    if (!content.fieldName) return null;
    return (!fuzzy || content.confidence === 'high') ? content : null;
}

function isAvailableAnkiFieldForRole(
    field: string,
    role: AnkiFieldRole,
    usedFields: Set<string>,
    samples: AnkiFieldContentSamples,
): boolean {
    if (usedFields.has(field)) return false;
    if (ankiFieldDisallowedForRole(field, role)) return false;
    return ankiFieldAllowedForRole(field, role)
        || ankiFieldContentRoleScore(role, samples[field] ?? []) >= 50;
}

function shouldPreferContentSuggestion(
    content: AnkiFieldSuggestion,
    exact: string,
    exactContentScore: number,
): boolean {
    if (!content.fieldName) return false;
    if (!exact || isGenericAnkiFieldName(exact)) return true;
    return content.fieldName !== exact && exactContentScore === 0 && content.confidence === 'high';
}

export function ankiFieldMappingForModel(settings: ReaderSettings, modelName: string, fieldNames: string[]): AnkiFieldMapping | undefined {
    const mapping = settings.ankiFieldMappings?.[modelName];
    if (!mapping) return undefined;
    const normalized: AnkiFieldMapping = {};
    for (const role of ANKI_FIELD_ROLES) {
        const fieldName = mappedFieldName(fieldNames, mapping, role);
        if (fieldName) normalized[role] = fieldName;
    }
    return Object.keys(normalized).length ? normalized : undefined;
}

function mappedFieldName(fieldNames: string[], mapping: AnkiFieldMapping | undefined, role: AnkiFieldRole): string {
    const fieldName = mapping?.[role]?.trim();
    if (!fieldName) return '';
    const exact = fieldNames.find(candidate => candidate === fieldName);
    if (exact) return exact;
    const normalizedFieldName = normalizeAnkiFieldName(fieldName);
    return fieldNames.find(candidate => normalizeAnkiFieldName(candidate) === normalizedFieldName) ?? '';
}

export function ankiFieldMappingsSettingsKey(mappings: AnkiFieldMappings | undefined): Record<string, AnkiFieldMapping> {
    const normalized: Record<string, AnkiFieldMapping> = {};
    for (const modelName of Object.keys(mappings ?? {}).sort()) {
        const mapping = mappings?.[modelName];
        if (!mapping) continue;
        const modelMapping: AnkiFieldMapping = {};
        for (const role of ANKI_FIELD_ROLES) {
            const fieldName = mapping[role]?.trim();
            if (fieldName) modelMapping[role] = fieldName;
        }
        if (Object.keys(modelMapping).length) normalized[modelName] = modelMapping;
    }
    return normalized;
}

export function fieldNameForRole(fieldNames: string[], role: AnkiFieldRole, mapping?: AnkiFieldMapping): string {
    const mapped = mappedFieldName(fieldNames, mapping, role);
    if (mapped) return mapped;
    return suggestAnkiField(role, fieldNames, new Set()).fieldName ?? '';
}

export function mappedRoleForField(fieldName: string, mapping?: AnkiFieldMapping): AnkiFieldRole | null {
    if (!mapping) return null;
    const normalized = normalizeAnkiFieldName(fieldName);
    for (const role of ANKI_FIELD_ROLES) {
        const mapped = mapping[role];
        if (mapped && normalizeAnkiFieldName(mapped) === normalized) return role;
    }
    return null;
}

export function yomuFieldForRole(role: AnkiFieldRole): string {
    return {
        expression: 'Expression',
        reading: 'Reading',
        meaning: 'Meaning',
        sentence: 'Sentence',
        audio: 'Audio',
        // Yomu's own note type has a single Audio field, so the sentence-audio
        // role maps onto it: buildYomuAnkiFields never emits a SentenceAudio
        // value, and media routing collapses through mergeAudioFilesForNote.
        sentenceAudio: 'Audio',
        image: 'Image',
    }[role];
}

export function flattenNoteFields(fields: AnkiNoteInfo['fields']): Record<string, string> {
    const out: Record<string, string> = {};
    Object.entries(fields ?? {}).forEach(([name, value]) => {
        out[name] = stripHtml(String(value?.value ?? ''));
    });
    return out;
}

export function noteLooksLikeCard(note: AnkiNoteInfo, card: JPDBCard, settings?: ReaderSettings): boolean {
    const fields = flattenNoteFields(note.fields);
    const mapping = settings ? ankiFieldMappingForModel(settings, note.modelName, Object.keys(fields)) : undefined;
    const expressionTargets = noteCardExpressionTargets(card);
    return noteHasExactTarget(fields, expressionTargets)
        || noteExpressionContainsTarget(fields, expressionTargets, mapping)
        || noteReadingContainsTarget(fields, card, mapping, expressionTargets);
}

export function noteCardExpressionTargets(card: JPDBCard): string[] {
    return unique([card.spelling, ...(card.fallbackLookupTerms ?? [])]
        .map(value => normalizeFieldValue(value ?? ''))
        .filter(Boolean));
}

export function noteFieldValues(fields: Record<string, string>): string[] {
    return Object.values(fields).map(normalizeFieldValue).filter(Boolean);
}

export function firstNoteReading(fields: Record<string, string>): string {
    return firstNoteField(fields, ANKI_READING_FIELD_NAMES);
}

export function firstNoteExpressionValue(fields: Record<string, string>, mapping?: AnkiFieldMapping): string {
    return noteExpressionCandidates(fields, mapping)[0]?.value ?? '';
}

export function mappedNoteField(fields: Record<string, string>, mapping: AnkiFieldMapping | undefined, role: AnkiFieldRole): string {
    const fieldName = mappedFieldName(Object.keys(fields), mapping, role);
    return fieldName ? fields[fieldName] ?? '' : '';
}

export function lookupKeyTermsForCard(card: JPDBCard): string[] {
    return unique([card.spelling, card.reading, ...(card.fallbackLookupTerms ?? [])]
        .map(value => normalizeFieldValue(value ?? ''))
        .filter(Boolean));
}

export function isKanaStatusLookupSurface(value: string): boolean {
    return /[\u3040-\u30ff]/u.test(value) && !/[\u3400-\u9fff]/u.test(value);
}

function japaneseFieldContainsStandaloneTarget(value: string, target: string): boolean {
    const normalizedValue = normalizeFieldValue(value);
    if (normalizedValue === target) return true;
    return normalizedValue
        .split(/[\s,;；、。・/／|｜()[\]（）「」『』【】<>＜＞]+/u)
        .some(part => part === target);
}

function japaneseCharacterCount(value: string): number {
    return (value.match(/[\u3040-\u30ff\u3400-\u9fff]/gu) ?? []).length;
}

export function normalizeAnkiFieldName(value: string): string {
    return value.replace(/[_\s-]+/g, '').toLowerCase();
}

export function stripHtml(value: string): string {
    return value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

function suggestAnkiFieldFromContent(
    role: AnkiFieldRole,
    fields: string[],
    samples: AnkiFieldContentSamples,
): AnkiFieldSuggestion {
    const ranked = fields
        .map(fieldName => ({
            fieldName,
            score: ankiFieldContentRoleScore(role, samples[fieldName] ?? []),
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || fields.indexOf(a.fieldName) - fields.indexOf(b.fieldName));
    const best = ranked[0];
    if (!best) return { role, fieldName: null, confidence: 'low' };
    return {
        role,
        fieldName: best.fieldName,
        confidence: best.score >= 50 ? 'high' : 'medium',
    };
}

function ankiFieldContentRoleScore(role: AnkiFieldRole, samples: AnkiFieldContentSample[]): number {
    if (!samples.length) return 0;
    const scores = samples
        .map(sample => ankiFieldContentSampleRoleScore(role, sample))
        .filter(score => score > 0)
        .sort((a, b) => b - a);
    if (!scores.length) return 0;
    const strongest = scores[0] ?? 0;
    const second = scores[1] ?? 0;
    return Math.min(100, strongest + Math.min(15, second / 3) + Math.min(10, scores.length * 2));
}

interface AnkiTextRoleMetrics {
    length: number;
    japaneseLength: number;
    hasJapanese: boolean;
    hasKanji: boolean;
    kanaLength: number;
    hasLatin: boolean;
    sentenceLike: boolean;
}

type AnkiTextRole = Extract<AnkiFieldRole, 'expression' | 'reading' | 'meaning' | 'sentence'>;

const ANKI_TEXT_ROLE_SCORERS: Record<AnkiTextRole, (metrics: AnkiTextRoleMetrics) => number> = {
    expression({ length, hasJapanese, hasKanji, kanaLength, sentenceLike }) {
        if (!hasJapanese || sentenceLike || length > 40) return 0;
        return 28 + (hasKanji ? 24 : 0) + (kanaLength && hasKanji ? 8 : 0) + Math.max(0, 12 - Math.floor(length / 2));
    },
    reading({ length, japaneseLength, hasJapanese, hasKanji, kanaLength }) {
        if (!hasJapanese || hasKanji || length > 40) return 0;
        const mostlyKana = kanaLength >= Math.max(1, japaneseLength - 1);
        return mostlyKana ? 54 + Math.max(0, 10 - Math.floor(length / 4)) : 20;
    },
    meaning({ length, hasJapanese, hasLatin }) {
        if (hasJapanese) return 0;
        if (hasLatin) return 54 + (length > 8 ? 6 : 0);
        return length >= 2 ? 24 : 0;
    },
    sentence({ length, hasJapanese, sentenceLike }) {
        if (!hasJapanese) return 0;
        if (sentenceLike) return 65 + (length > 20 ? 8 : 0);
        return length >= 14 ? 42 : 0;
    },
};

function ankiFieldContentSampleRoleScore(role: AnkiFieldRole, sample: AnkiFieldContentSample): number {
    const raw = sample.raw.trim();
    const text = normalizeFieldValue(sample.text);
    if (isAnkiAudioRole(role)) return ankiAudioFieldContentScore(raw, text);
    if (role === 'image') return ankiImageFieldContentScore(raw, text);
    if (ankiAudioFieldContentScore(raw, text) || ankiImageFieldContentScore(raw, text)) return 0;
    if (!text) return 0;
    const scorer = ANKI_TEXT_ROLE_SCORERS[role as AnkiTextRole];
    if (!scorer) return 0;
    const japaneseLength = japaneseCharacterCount(text);
    return scorer({
        length: text.length,
        japaneseLength,
        hasJapanese: japaneseLength > 0,
        hasKanji: /[\u3400-\u9fff]/u.test(text),
        kanaLength: kanaCharacterCount(text),
        hasLatin: /[A-Za-z]/.test(text),
        sentenceLike: japaneseSentenceLike(text),
    });
}

function ankiAudioFieldContentScore(raw: string, text: string): number {
    const value = `${raw} ${text}`.toLowerCase();
    if (/\[sound:[^\]]+\]/.test(value)) return 90;
    if (/<audio\b/.test(value)) return 85;
    if (/\.(?:mp3|m4a|ogg|oga|wav|flac)(?:[?#"'\s>]|$)/.test(value)) return 75;
    return 0;
}

function ankiImageFieldContentScore(raw: string, text: string): number {
    const value = `${raw} ${text}`.toLowerCase();
    if (/<img\b/.test(value)) return 90;
    if (/\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#"'\s>]|$)/.test(value)) return 75;
    return 0;
}

function ankiFieldContentSamples(fields: string[], notes: AnkiNoteInfo[]): AnkiFieldContentSamples {
    const out: AnkiFieldContentSamples = Object.fromEntries(fields.map(field => [field, []]));
    for (const note of notes) {
        for (const fieldName of fields) {
            const raw = String(note.fields?.[fieldName]?.value ?? '');
            if (!raw.trim()) continue;
            out[fieldName]?.push({ raw, text: stripHtml(raw) });
        }
    }
    return out;
}

function isGenericAnkiFieldName(fieldName: string): boolean {
    const normalized = normalizeAnkiFieldName(fieldName);
    return /^(?:front|back|primary|secondary|text|field\d+|f\d+)$/.test(normalized);
}

function kanaCharacterCount(value: string): number {
    return (value.match(/[\u3040-\u30ff]/gu) ?? []).length;
}

function japaneseSentenceLike(value: string): boolean {
    const japaneseLength = japaneseCharacterCount(value);
    return /[。！？!?]/u.test(value)
        || japaneseLength >= 12
        || (japaneseLength >= 8 && /(?:^|[\s　]).{2,}[\s　].{2,}/u.test(value));
}

function ankiFieldAllowedForRole(fieldName: string, role: AnkiFieldRole): boolean {
    const normalized = normalizeAnkiFieldName(fieldName);
    const audioLike = /(?:audio|sound|voice)/.test(normalized);
    const imageLike = /(?:image|picture|screenshot|snapshot|photo|frame|still)/.test(normalized);
    if (isAnkiAudioRole(role)) return audioLike && !imageLike;
    if (role === 'image') return imageLike && !audioLike && !/^frame(?:id|no|num|number|v?\d)/.test(normalized);
    return !audioLike && !imageLike;
}

function ankiFieldDisallowedForRole(fieldName: string, role: AnkiFieldRole): boolean {
    // The word-audio role must never claim a sentence-audio field: every
    // sentence-audio name contains "audio"/"sound", so the fuzzy pass would
    // otherwise match them and swallow the field sentenceAudio needs. When a
    // note type exposes only one of the two, mergeAudioFilesForNote collapses
    // onto whichever field exists, so nothing is dropped by being strict here.
    if (role === 'audio') return isSentenceAudioFieldName(fieldName);
    if (role === 'sentenceAudio' || role === 'image') return false;
    const normalized = normalizeAnkiFieldName(fieldName);
    return /^(?:source|sourceurl|url|origin|originurl|link|deck|deckname|model|modelname|tags?|remarksfront|frontremarks)$/.test(normalized);
}

const NORMALIZED_SENTENCE_AUDIO_FIELD_NAMES = new Set(ANKI_SENTENCE_AUDIO_FIELD_NAMES.map(normalizeAnkiFieldName));

export function isSentenceAudioFieldName(fieldName: string): boolean {
    return NORMALIZED_SENTENCE_AUDIO_FIELD_NAMES.has(normalizeAnkiFieldName(fieldName));
}

function firstMatchingAnkiField(fields: string[], names: readonly string[]): string {
    const fieldByName = new Map<string, string>();
    fields.forEach(field => {
        const normalized = normalizeAnkiFieldName(field);
        if (!fieldByName.has(normalized)) fieldByName.set(normalized, field);
    });
    for (const name of names) {
        const match = fieldByName.get(normalizeAnkiFieldName(name));
        if (match) return match;
    }
    return '';
}

function firstFuzzyAnkiField(fields: string[], names: readonly string[]): string {
    const normalizedNames = names
        .map(normalizeAnkiFieldName)
        .filter(name => name.length >= 4);
    return fields.find(field => {
        const normalized = normalizeAnkiFieldName(field);
        return normalizedNames.some(name => normalized.includes(name));
    }) ?? '';
}

function ankiModelScanScore(suggestions: AnkiFieldSuggestion[]): number {
    return suggestions.reduce((score, suggestion) => {
        if (!suggestion.fieldName) return score;
        const roleWeight = suggestion.role === 'expression' ? 6
            : suggestion.role === 'meaning' ? 4
                : suggestion.role === 'reading' || suggestion.role === 'sentence' ? 3
                    : 1;
        const confidenceWeight = suggestion.confidence === 'high' ? 2 : 1;
        return score + roleWeight * confidenceWeight;
    }, 0);
}

function noteHasExactTarget(fields: Record<string, string>, exactTargets: string[]): boolean {
    const values = noteFieldValues(fields);
    return exactTargets.some(target => values.some(value => value === target));
}

function noteExpressionContainsTarget(fields: Record<string, string>, exactTargets: string[], mapping?: AnkiFieldMapping): boolean {
    const expressions = noteExpressionCandidates(fields, mapping);
    return expressions.some(expression => exactTargets.some(target =>
        target.length >= 2
        && japaneseFieldContainsStandaloneTarget(expression.value, target)
        && (!expression.generic || genericExpressionLooksLikeHeadword(expression.value, target)),
    ));
}

function firstNoteField(fields: Record<string, string>, names: string[]): string {
    const exact = names.map(name => fields[name]).find(Boolean);
    if (exact) return exact;
    const normalizedNames = new Set(names.map(normalizeAnkiFieldName));
    return Object.entries(fields).find(([name, value]) => normalizedNames.has(normalizeAnkiFieldName(name)) && Boolean(value))?.[1] ?? '';
}

function noteReadingContainsTarget(fields: Record<string, string>, card: JPDBCard, mapping: AnkiFieldMapping | undefined, expressionTargets: string[]): boolean {
    const spelling = normalizeFieldValue(card.spelling);
    const readingTarget = normalizeFieldValue(card.reading || (isKanaStatusLookupSurface(spelling) ? spelling : ''));
    const expressionValues = noteExpressionValues(fields, mapping);
    if (expressionValues.length && !expressionValues.some(expression =>
        expressionTargets.some(target => target.length >= 2 && japaneseFieldContainsStandaloneTarget(expression, target)),
    ) && !isKanaStatusLookupSurface(spelling)) {
        return false;
    }
    const readings = unique([
        mappedNoteField(fields, mapping, 'reading'),
        firstNoteReading(fields),
    ].filter(Boolean));
    return Boolean(readingTarget && readingTarget.length >= 2 && readings.some(reading => japaneseFieldContainsStandaloneTarget(reading, readingTarget)));
}

function noteExpressionValues(fields: Record<string, string>, mapping?: AnkiFieldMapping): string[] {
    return unique(noteExpressionCandidates(fields, mapping).map(candidate => candidate.value).filter(Boolean));
}

function noteExpressionCandidates(fields: Record<string, string>, mapping?: AnkiFieldMapping): Array<{ value: string; generic: boolean }> {
    const candidates: Array<{ value: string; generic: boolean }> = [];
    const mapped = mappedNoteField(fields, mapping, 'expression');
    if (mapped) candidates.push({ value: mapped, generic: false });
    const headword = firstNoteField(fields, ANKI_HEADWORD_FIELD_NAMES);
    if (headword) candidates.push({ value: headword, generic: false });
    const generic = firstNoteField(fields, ANKI_GENERIC_EXPRESSION_FIELD_NAMES);
    if (generic) candidates.push({ value: generic, generic: true });
    const seen = new Set<string>();
    return candidates.filter(candidate => {
        const key = normalizeFieldValue(candidate.value);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function genericExpressionLooksLikeHeadword(value: string, target: string): boolean {
    const normalizedValue = normalizeFieldValue(value);
    if (normalizedValue === target) return true;
    if (/[。！？!?]/u.test(normalizedValue)) return false;
    return japaneseCharacterCount(normalizedValue) <= japaneseCharacterCount(target) + 4;
}

export function normalizeFieldValue(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}
