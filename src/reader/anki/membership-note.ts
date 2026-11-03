import type { JPDBCard, ReaderSettings } from '../app/types';
import {
    ANKI_EXPRESSION_FIELD_NAMES, ANKI_READING_FIELD_NAMES, ankiFieldMappingForModel,
    normalizeAnkiFieldName, normalizeFieldValue, stripHtml,
} from './field-mapping';
import type { AnkiNoteInfo } from './types';
import { normalizeJapaneseStudyAnswer } from '../newtab/japanese-input';

export type AnkiMembershipIdentity = 'saved' | 'different' | 'unknown';
const GENERIC_EXPRESSION_NAMES = new Set(['front', 'japanese', 'kanji', 'katakana', 'expressionreading']);
const KANJI_READING_NAMES = new Set(['on', 'onreading', 'onyomi', 'kun', 'kunreading', 'kunyomi']);
const EXPRESSION_NAMES = ANKI_EXPRESSION_FIELD_NAMES.filter(name => !GENERIC_EXPRESSION_NAMES.has(normalizeAnkiFieldName(name)));
const READING_NAMES = ANKI_READING_FIELD_NAMES.filter(name => !KANJI_READING_NAMES.has(normalizeAnkiFieldName(name)));
const COMPARABLE_KANA = /^[ぁ-ゖァ-ヶ][ぁ-ゖァ-ヶー]*$/u;

/** Candidate search includes context; membership requires identified lexical fields. */
export function ankiMembershipIdentity(note: AnkiNoteInfo, card: JPDBCard, settings: ReaderSettings): AnkiMembershipIdentity {
    const fields = membershipFields(note, settings);
    if (!fields) return 'unknown';
    const word = identityText(fields.expression);
    if (!word) return 'unknown';
    const spelling = identityText(card.spelling);
    if (word !== spelling) return word.includes(spelling) || card.fallbackLookupTerms?.some(term => identityText(term) === word) ? 'unknown' : 'different';
    return readingIdentity(fields.reading, card);
}

function membershipFields(note: AnkiNoteInfo, settings: ReaderSettings): { expression: string; reading: string | undefined } | undefined {
    const fieldNames = Object.keys(note.fields);
    const mapping = ankiFieldMappingForModel(settings, note.modelName, fieldNames) ?? {};
    const configured = settings.ankiFieldMappings[note.modelName] ?? {};
    if (configured.expression && !mapping.expression) return undefined;
    const expression = mapping.expression ?? singleNamedField(fieldNames, EXPRESSION_NAMES);
    const nonLexical = [mapping.sentence, mapping.meaning, mapping.audio, mapping.sentenceAudio, mapping.image];
    if (!expression || nonLexical.includes(expression)) return undefined;
    if (configured.reading && !mapping.reading) return undefined;
    const reading = mapping.reading ?? singleNamedField(fieldNames, READING_NAMES);
    if (reading === expression) return undefined;
    return { expression: note.fields[expression].value, reading: reading ? note.fields[reading].value : undefined };
}

function singleNamedField(fields: readonly string[], names: readonly string[]): string | undefined {
    const aliases = new Set(names.map(normalizeAnkiFieldName));
    const matches = fields.filter(name => aliases.has(normalizeAnkiFieldName(name)));
    return matches.length === 1 ? matches[0] : undefined;
}

function identityText(value: string): string {
    return normalizeFieldValue(stripHtml(value
        .replace(/<r[tp]\b[^>]*>[\s\S]*?<\/r[tp]>/giu, '')
        .replace(/\[[\u3040-\u30ffー]+\]/gu, ''))).normalize('NFKC');
}

function readingIdentity(value: string | undefined, card: JPDBCard): AnkiMembershipIdentity {
    const spelling = identityText(card.spelling);
    const target = identityText(card.reading);
    // A parser's provisional kanji reading cannot prove a lexical identity.
    if (!target || (target === spelling && /[\u3400-\u9fff]/u.test(spelling))) return 'unknown';
    if (value === undefined) return target === spelling ? comparableReadingIdentity(target, target, card.language) : 'unknown';
    if (/<ruby\b/iu.test(value)) return 'unknown';
    const reading = normalizeFieldValue(stripHtml(value).replace(/([^\[\]\s]+)\[([\u3040-\u30ffー]+)\]/gu, '$2')).normalize('NFKC');
    if (!reading || /[\[\]<>]/u.test(reading)) return 'unknown';
    return comparableReadingIdentity(target, reading, card.language);
}

function comparableReadingIdentity(target: string, reading: string, language: JPDBCard['language']): AnkiMembershipIdentity {
    if (language && language.split('-')[0] !== 'ja') return reading === target ? 'saved' : 'unknown';
    // Validate before the study normalizer: romaji transliteration and punctuation
    // removal are answer-entry conveniences, not authoritative reading evidence.
    if (!COMPARABLE_KANA.test(target) || !COMPARABLE_KANA.test(reading)) return 'unknown';
    const expected = normalizeJapaneseStudyAnswer(target);
    const actual = normalizeJapaneseStudyAnswer(reading);
    if (actual !== expected && actual.includes(expected)) return 'unknown';
    return actual === expected ? 'saved' : 'different';
}
