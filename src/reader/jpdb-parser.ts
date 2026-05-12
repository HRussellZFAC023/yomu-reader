import { Logger } from './logger';
import { normalizeCardStates } from './card-state';
import type { JPDBCard, JPDBRawToken, JPDBRawVocabulary, JPDBRuby, JPDBToken } from './types';

const COMBINING_KANA = new Set('ゃゅょぁぃぅぇぉャュョァィゥェォ');
const log = Logger.scope('JpdbParser');

export function jpdbVocabularyToCards(vocabulary: JPDBRawVocabulary[]): JPDBCard[] {
    const cards = vocabulary.map(([
        vid,
        sid,
        rid,
        spelling,
        reading,
        frequencyRank,
        partOfSpeech,
        meaningsChunks,
        meaningsPartOfSpeech,
        cardState,
        pitchAccent,
    ]): JPDBCard => ({
        vid,
        sid,
        rid,
        spelling,
        reading,
        frequencyRank,
        partOfSpeech,
        meanings: meaningsChunks.map((glosses, index) => ({
            glosses,
            partOfSpeech: meaningsPartOfSpeech[index] ?? [],
        })),
        cardState: normalizeCardStates(cardState),
        pitchAccent: pitchAccent ?? [],
        wordWithReading: null,
        source: 'jpdb' as const,
    }));
    log.debug('Converted JPDB vocabulary to cards', { vocabulary: vocabulary.length, cards: cards.length });
    return cards;
}

export function jpdbParseResultToTokens(paragraphs: string[], rawTokens: JPDBRawToken[][], cards: JPDBCard[]): JPDBToken[][] {
    const tokens = rawTokens.map(innerTokens => parseParagraphTokens(innerTokens, cards));
    assignSentenceInfo(paragraphs, tokens);
    log.debug('Converted JPDB parse result to tokens', {
        paragraphs: paragraphs.length,
        tokenGroups: rawTokens.length,
        tokens: tokens.reduce((total, group) => total + group.length, 0),
        cards: cards.length,
    });
    return tokens;
}

function parseParagraphTokens(rawTokens: JPDBRawToken[], cards: JPDBCard[]): JPDBToken[] {
    let inheritedPitchClass = '';
    return rawTokens.map(rawToken => {
        const token = parseToken(rawToken, cards, inheritedPitchClass);
        inheritedPitchClass = token.pitchClass;
        return token;
    });
}

function parseToken([vocabularyIndex, position, length, furigana]: JPDBRawToken, cards: JPDBCard[], inheritedPitchClass: string): JPDBToken {
    const card = cards[vocabularyIndex];
    const token: JPDBToken = {
        card,
        start: position,
        end: position + length,
        length,
        rubies: parseRubies(furigana, position),
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
    if (card.partOfSpeech.includes('prt')) return inheritedPitchClass;
    return getPitchClass(card.pitchAccent, card.reading) || inheritedPitchClass;
}

function assignSentenceInfo(paragraphs: string[], tokens: JPDBToken[][]): void {
    paragraphs.forEach((paragraph, index) => {
        const tokenData = tokens[index] ?? [];
        const sentences = splitJapaneseSentences(paragraph);
        if (sentences.length === 1) {
            tokenData.forEach(token => { token.sentence = sentences[0]; });
            return;
        }

        let offset = 0;
        for (const sentence of sentences) {
            const compare = sentence.replace(/(^[「『])|([。！？」』]$)/g, '');
            const relativeStart = paragraph.slice(offset).indexOf(compare);
            if (relativeStart === -1) {
                offset += sentence.length;
                continue;
            }

            const start = offset + relativeStart;
            const end = start + sentence.length;
            for (const token of tokenData) {
                if (token.start >= start && token.end <= end) token.sentence = sentence;
            }
            offset += sentence.length;
        }
    });
}

export function splitJapaneseSentences(text: string): string[] {
    const sentences: string[] = [];
    let start = 0;
    let quote: '」' | '』' | null = null;

    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (char === '「') quote = '」';
        if (char === '『') quote = '』';

        if (quote) {
            if (char === quote) {
                const next = text[index + 1];
                quote = null;
                if (!next || /\s/.test(next) || !/[、，]/.test(next)) {
                    sentences.push(text.slice(start, index + 1).trim());
                    start = index + 1;
                }
            }
            continue;
        }

        if ('。！？'.includes(char)) {
            const next = text[index + 1];
            const end = next === '」' || next === '』' ? index + 2 : index + 1;
            sentences.push(text.slice(start, end).trim());
            start = end;
            if (next === '」' || next === '』') index++;
        }
    }

    const tail = text.slice(start).trim();
    if (tail) sentences.push(tail);

    const nonEmptySentences = sentences.filter(Boolean);
    const result = nonEmptySentences.length ? nonEmptySentences : [text];
    log.debugThrottled('split-sentences', 1000, 'Split Japanese sentences', { textLength: text.length, sentences: result.length });
    return result;
}

export function getPitchClass(pitchAccent: string[], reading: string): string {
    if (!pitchAccent.length) return '';

    const [pitch] = pitchAccent;
    const levels = Array.from(pitch).filter(level => level === 'H' || level === 'L');
    if (levels.length < 2) return '';

    const rises = countPitchTransitions(levels, 'L', 'H');
    const drops = countPitchTransitions(levels, 'H', 'L');
    const dropAt = levels.findIndex((level, index) => index > 0 && levels[index - 1] === 'H' && level === 'L');
    const startsLow = levels[0] === 'L';
    const startsHigh = levels[0] === 'H';
    const endsLow = levels[levels.length - 1] === 'L';
    const moraCount = countMorae(reading);

    if (startsHigh && drops === 1) return 'atamadaka';
    if (moraCount && startsLow && dropAt === moraCount) return 'odaka';
    if (startsLow && rises === 1 && !endsLow) return 'heiban';
    if (startsLow && rises === 1 && endsLow) return 'nakadaka';
    if (rises > 1 || drops > 1) return 'kifuku';
    return '';
}

function countPitchTransitions(levels: string[], from: string, to: string): number {
    let count = 0;
    for (let index = 1; index < levels.length; index++) {
        if (levels[index - 1] === from && levels[index] === to) count++;
    }
    return count;
}

function countMorae(reading: string): number {
    let count = 0;
    for (const char of Array.from(reading)) {
        if (count > 0 && COMBINING_KANA.has(char)) continue;
        count++;
    }
    return count;
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
