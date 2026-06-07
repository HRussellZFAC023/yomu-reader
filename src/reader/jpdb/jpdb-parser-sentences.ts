import type { JPDBToken } from '../app/types';

export function assignSentenceInfo(paragraphs: string[], tokens: JPDBToken[][]): void {
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
