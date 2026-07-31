import { sentenceAroundRange } from '../dom/index';
import { activeLearningTarget } from '../languages/target-runtime';
import type { pointerTextRunAt } from './pointer-text-lookup';
import type { JPDBCard, JPDBToken } from '../app/types';
import { HAS_JAPANESE, HIRAGANA_WITH_PROLONGED, KANJI_LIKE_WITH_COUNTERS, KATAKANA } from './japanese-script';

const SINGLE_HIRAGANA_MORA_RE = new RegExp(`^[${HIRAGANA_WITH_PROLONGED}]$`, 'u');
const SUBSTANTIVE_LOCAL_EXPANSION_RE = new RegExp(`[${KANJI_LIKE_WITH_COUNTERS}${KATAKANA}]`, 'u');

export function normalizedLookupText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Detection capability, resolved through the active learning target rather
 * than against a Japanese script regex.
 */
export function isLookupableTargetLanguageText(text: string): boolean {
    return activeLearningTarget().isLookupableText(text);
}

export { isLookupableTargetLanguageText as isLookupableJapaneseText };

// A whole-paragraph drag that crosses an embedded Japanese word should stay a
// plain selection the user can copy. Once enough Latin prose surrounds a sliver
// of Japanese, the auto popup is hijacking a copy gesture — and opening it
// collapses the live selection back to the Japanese word (Chromium re-anchors
// the range when the popover renders). 24 letters is ~4-5 English words, well
// past any short mixed lookup like "iPhoneを買う".
export function isProseDominantSelection(text: string): boolean {
    const latin = text.match(/[A-Za-z]/gu)?.length ?? 0;
    const japanese = Array.from(text).filter(character => HAS_JAPANESE.test(character)).length;
    return latin >= 24 && latin > japanese;
}

export function lookupCandidateSentence(text: string, start = 0, end = text.length): string {
    const sentence = sentenceAroundRange(text, start, end) || normalizedLookupText(text);
    return isLookupableTargetLanguageText(sentence) ? sentence : '';
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
    run: NonNullable<ReturnType<typeof pointerTextRunAt>>,
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

function compactLookupText(text: string): string {
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
