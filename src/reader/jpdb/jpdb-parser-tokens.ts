import { getPitchClass } from './jpdb-parser-pitch';
import { assignSentenceInfo } from './jpdb-parser-sentences';
import type { JPDBCard, JPDBRawToken, JPDBRuby, JPDBToken } from '../types';

const KANJI_RE = /[\u3400-\u9fff]/u;
const KANA_RE = /^[\u3040-\u30ffー・]+$/u;

export function jpdbParseResultToTokens(paragraphs: string[], rawTokens: JPDBRawToken[][], cards: JPDBCard[]): JPDBToken[][] {
    const tokens = rawTokens.map((innerTokens, index) => parseParagraphTokens(paragraphs[index] ?? '', innerTokens, cards));
    assignSentenceInfo(paragraphs, tokens);
    return tokens;
}

function parseParagraphTokens(paragraph: string, rawTokens: JPDBRawToken[], cards: JPDBCard[]): JPDBToken[] {
    let inheritedPitchClass = '';
    return rawTokens.map(rawToken => {
        const token = parseToken(rawToken, paragraph, cards, inheritedPitchClass);
        inheritedPitchClass = token.pitchClass;
        return token;
    });
}

function parseToken([vocabularyIndex, position, length, furigana]: JPDBRawToken, paragraph: string, cards: JPDBCard[], inheritedPitchClass: string): JPDBToken {
    const card = cards[vocabularyIndex];
    const rubies = parseRubies(furigana, position);
    repairCardReadingFromRubies(card, paragraph.slice(position, position + length), rubies, position);
    const token: JPDBToken = {
        card,
        start: position,
        end: position + length,
        length,
        rubies,
        pitchClass: inheritedOrCurrentPitchClass(card, inheritedPitchClass),
    };
    assignWordWithReading(token);
    return token;
}

function parseRubies(furigana: JPDBRawToken[3], startOffset: number): JPDBRuby[] {
    if (furigana === null) return [];

    let offset = startOffset;
    return furigana.flatMap(part => {
        if (typeof part === 'string') {
            offset += part.length;
            return [];
        }

        const [base, ruby] = part;
        const start = offset;
        const end = (offset = start + base.length);
        return [{ text: ruby, start, end, length: base.length }];
    });
}

function inheritedOrCurrentPitchClass(card: JPDBCard, inheritedPitchClass: string): string {
    if (card.partOfSpeech.includes('prt')) return '';
    return getPitchClass(card.pitchAccent, card.reading) || inheritedPitchClass;
}

function assignWordWithReading(token: JPDBToken): void {
    const { card, rubies, start: offset } = token;
    if (!rubies.length) return;

    const word = Array.from(card.spelling);
    for (let i = rubies.length - 1; i >= 0; i--) {
        const { text, start, length } = rubies[i];
        word.splice(start - offset + length, 0, `[${text}]`);
    }
    card.wordWithReading = word.join('');
}

function repairCardReadingFromRubies(card: JPDBCard, surface: string, rubies: JPDBRuby[], offset: number): void {
    if (!shouldRepairCardReading(card, surface, rubies)) return;
    const reading = surfaceReadingFromRubies(surface, rubies, offset);
    if (!reading || !KANA_RE.test(reading)) return;
    const previousReading = card.reading.trim();
    if (previousReading && previousReading !== card.spelling && previousReading !== reading) {
        card.sourceCardKey ??= `${card.vid}:${card.sid}:${card.spelling}:${card.reading}`;
        card.pitchAccent = [];
    }
    card.reading = reading;
}

function shouldRepairCardReading(card: JPDBCard, surface: string, rubies: JPDBRuby[]): boolean {
    if (!rubies.length || !surface || card.spelling !== surface) return false;
    if (!KANJI_RE.test(card.spelling)) return false;
    const reading = card.reading.trim();
    return !reading || reading === card.spelling || KANA_RE.test(reading);
}

function surfaceReadingFromRubies(surface: string, rubies: JPDBRuby[], offset: number): string {
    let reading = '';
    let cursor = 0;
    for (const ruby of rubies) {
        const start = ruby.start - offset;
        const end = ruby.end - offset;
        if (start < cursor || start < 0 || end > surface.length || end <= start) return '';
        reading += surface.slice(cursor, start);
        reading += ruby.text;
        cursor = end;
    }
    reading += surface.slice(cursor);
    return reading;
}
