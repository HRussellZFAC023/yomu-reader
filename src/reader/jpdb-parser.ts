import { normalizeCardStates } from './card-state';
import type { JPDBCard, JPDBRawToken, JPDBRawVocabulary, JPDBRuby, JPDBToken } from './types';

const COMBINING_KANA = new Set('ゃゅょぁぃぅぇぉャュョァィゥェォ');
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
    return cards;
}

export function jpdbParseResultToTokens(paragraphs: string[], rawTokens: JPDBRawToken[][], cards: JPDBCard[]): JPDBToken[][] {
    const tokens = rawTokens.map(innerTokens => parseParagraphTokens(innerTokens, cards));
    assignSentenceInfo(paragraphs, tokens);
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
    const state: SentenceSplitState = { start: 0, quote: null };

    for (let index = 0; index < text.length; index++) {
        index = advanceSentenceSplitter(sentences, text, state, index);
    }

    const tail = text.slice(state.start).trim();
    if (tail) sentences.push(tail);

    const nonEmptySentences = sentences.filter(Boolean);
    const result = nonEmptySentences.length ? nonEmptySentences : [text];
    return result;
}

interface SentenceSplitState {
    start: number;
    quote: '」' | '』' | null;
}

function advanceSentenceSplitter(sentences: string[], text: string, state: SentenceSplitState, index: number): number {
    state.quote = closingQuoteFor(text[index]) ?? state.quote;
    if (state.quote) return advanceQuotedSentenceSplitter(sentences, text, state, index);
    return advancePunctuationSentenceSplitter(sentences, text, state, index);
}

function advanceQuotedSentenceSplitter(sentences: string[], text: string, state: SentenceSplitState, index: number): number {
    if (!state.quote) return index;
    const boundary = quotedSentenceBoundary(text, index, state.quote);
    if (boundary) Object.assign(state, pushSentenceBoundary(sentences, text, state.start, boundary.end));
    return index;
}

function advancePunctuationSentenceSplitter(sentences: string[], text: string, state: SentenceSplitState, index: number): number {
    const boundary = punctuationSentenceBoundary(text, index);
    if (!boundary) return index;
    Object.assign(state, pushSentenceBoundary(sentences, text, state.start, boundary.end));
    return boundary.nextIndex;
}

function pushSentenceBoundary(
    sentences: string[],
    text: string,
    start: number,
    end: number,
): { start: number; quote: null } {
    sentences.push(text.slice(start, end).trim());
    return { start: end, quote: null };
}

function closingQuoteFor(char: string): '」' | '』' | null {
    if (char === '「') return '」';
    if (char === '『') return '』';
    return null;
}

function quotedSentenceBoundary(text: string, index: number, quote: '」' | '』'): { end: number } | null {
    if (text[index] !== quote) return null;
    const next = text[index + 1];
    return !next || /\s/.test(next) || !/[、，]/.test(next)
        ? { end: index + 1 }
        : null;
}

function punctuationSentenceBoundary(text: string, index: number): { end: number; nextIndex: number } | null {
    if (!'。！？'.includes(text[index])) return null;
    const next = text[index + 1];
    const includesClosingQuote = next === '」' || next === '』';
    return {
        end: includesClosingQuote ? index + 2 : index + 1,
        nextIndex: includesClosingQuote ? index + 1 : index,
    };
}

export function getPitchClass(pitchAccent: string[], reading: string): string {
    const levels = pitchLevels(pitchAccent);
    if (levels.length < 2) return '';
    return classifyPitchProfile({
        rises: countPitchTransitions(levels, 'L', 'H'),
        drops: countPitchTransitions(levels, 'H', 'L'),
        dropAt: levels.findIndex((level, index) => index > 0 && levels[index - 1] === 'H' && level === 'L'),
        startsLow: levels[0] === 'L',
        startsHigh: levels[0] === 'H',
        endsLow: levels[levels.length - 1] === 'L',
        moraCount: countMorae(reading),
    });
}

interface PitchProfile {
    rises: number;
    drops: number;
    dropAt: number;
    startsLow: boolean;
    startsHigh: boolean;
    endsLow: boolean;
    moraCount: number;
}

const PITCH_PROFILE_CLASSIFIERS: Array<[string, (profile: PitchProfile) => boolean]> = [
    ['atamadaka', isAtamadaka],
    ['odaka', isOdaka],
    ['heiban', isHeiban],
    ['nakadaka', isNakadaka],
    ['kifuku', isKifuku],
];

function pitchLevels(pitchAccent: string[]): string[] {
    return pitchAccent.length
        ? Array.from(pitchAccent[0]).filter(level => level === 'H' || level === 'L')
        : [];
}

function classifyPitchProfile(profile: PitchProfile): string {
    return PITCH_PROFILE_CLASSIFIERS.find(([, matches]) => matches(profile))?.[0] ?? '';
}

function isAtamadaka(profile: PitchProfile): boolean {
    return profile.startsHigh && profile.drops === 1;
}

function isOdaka(profile: PitchProfile): boolean {
    return Boolean(profile.moraCount && profile.startsLow && profile.dropAt === profile.moraCount);
}

function isHeiban(profile: PitchProfile): boolean {
    return profile.startsLow && profile.rises === 1 && !profile.endsLow;
}

function isNakadaka(profile: PitchProfile): boolean {
    return profile.startsLow && profile.rises === 1 && profile.endsLow;
}

function isKifuku(profile: PitchProfile): boolean {
    return profile.rises > 1 || profile.drops > 1;
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
