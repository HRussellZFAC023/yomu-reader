import { HAS_JAPANESE, sentenceAroundRange } from './dom';
import type { japaneseRunAt } from './pointer-text-lookup';
import type { JPDBCard, JPDBToken } from './types';

const SINGLE_HIRAGANA_MORA_RE = /^[\u3040-\u309fー]$/u;
const SUBSTANTIVE_LOCAL_EXPANSION_RE = /[\u3400-\u9fff々〆ヵヶ\u30a0-\u30ff]/u;

export function normalizedLookupText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

export function isLookupableJapaneseText(text: string): boolean {
    return Boolean(text && HAS_JAPANESE.test(text));
}

export function lookupCandidateSentence(text: string, start = 0, end = text.length): string {
    const sentence = sentenceAroundRange(text, start, end) || normalizedLookupText(text);
    return isLookupableJapaneseText(sentence) ? sentence : '';
}

export function pointerTokenAtOffset(tokens: JPDBToken[], offset: number): JPDBToken | undefined {
    return tokens.find(token => tokenContainsPointerOffset(token, offset));
}

function tokenContainsPointerOffset(token: JPDBToken, offset: number): boolean {
    return token.start <= offset && offset < token.end;
}

export function isLowValuePitchEnrichmentToken(token: JPDBToken): boolean {
    return isLowValuePointerTextToken(token);
}

export function isLowValuePointerTextToken(token: JPDBToken): boolean {
    const spelling = token.card.spelling.trim();
    return SINGLE_HIRAGANA_MORA_RE.test(spelling);
}

export function canExpandLocalPointerRange(surface: string): boolean {
    return surface.length > 1 || SUBSTANTIVE_LOCAL_EXPANSION_RE.test(surface);
}

export function isOverbroadLocalPointerRange(
    run: NonNullable<ReturnType<typeof japaneseRunAt>>,
    range: { start: number; end: number },
): boolean {
    const rangeLength = range.end - range.start;
    const runLength = run.end - run.start;
    return rangeLength > 8 && range.start <= run.start && range.end >= run.end && runLength > 8;
}

export function preferredRenderedWordSentence(nearest: string, tokenSentence: string): string | undefined {
    const cleanNearest = normalizedLookupText(nearest);
    const cleanTokenSentence = normalizedLookupText(tokenSentence);
    if (cleanTokenSentence && shouldPreferTokenSentence(cleanNearest, cleanTokenSentence)) return cleanTokenSentence;
    if (cleanTokenSentence && cleanTokenSentence.length > cleanNearest.length + 2) return cleanTokenSentence;
    return cleanNearest || cleanTokenSentence || undefined;
}

function shouldPreferTokenSentence(nearest: string, tokenSentence: string): boolean {
    if (!nearest) return true;
    if (!compactLookupText(nearest).includes(compactLookupText(tokenSentence))) return true;
    return looksLikeNoisyRenderedContext(nearest);
}

export function compactLookupText(text: string): string {
    return normalizedLookupText(text).replace(/\s+/g, '');
}

function looksLikeNoisyRenderedContext(text: string): boolean {
    const timecodes = text.match(/\d{1,2}:\d{2}/g)?.length ?? 0;
    if (timecodes >= 2) return true;
    const digitish = text.match(/[0-9０-９:：]/g)?.length ?? 0;
    if (digitish >= 12 && digitish / Math.max(1, Array.from(text).length) > 0.12) return true;
    return /動画全編を視聴|watch full video|view full video/i.test(text);
}

export function pitchEnrichmentPriority(token: JPDBToken): number {
    return token.card.source === 'fallback' ? 0 : 1;
}

export function pitchEnrichmentTokenForCard(card: JPDBCard): JPDBToken {
    return {
        card,
        start: 0,
        end: card.spelling.length,
        length: card.spelling.length,
        rubies: [],
        pitchClass: '',
    };
}
