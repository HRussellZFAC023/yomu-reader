import { readerWordSurfaceText } from '../dom/index';
import { normalizedLookupText } from '../lookup/text-helpers';
import { japaneseRunAt, JPDB_POINTER_BOUNDARY_SEGMENTS, jpdbPointerLookupCandidates } from '../lookup/pointer-text-lookup';
import { KANA_ONLY_LOOKUP_RUN_RE } from '../app/main-helpers';
import type { JPDBCard } from '../app/types';

const KANA_FRAGMENT_LOOKUP_START_WINDOW = 6;
const KANA_FRAGMENT_LOOKUP_MAX_LENGTH = 12;

type RenderedWordLookupContext = {
    sentence?: string;
};

export type RenderedWordExpansionLookup = {
    sentence: string;
    offset: number;
    surfaceLength: number;
};

export type RenderedWordKanaFragmentExpansionLookup = RenderedWordExpansionLookup & {
    terms: string[];
};

export function renderedWordLookupText(word: HTMLElement): string {
    return normalizedLookupText(word.dataset.expression || readerWordSurfaceText(word));
}

export function publicJpdbRenderedWordLookup(
    word: HTMLElement,
    card: JPDBCard,
    context: RenderedWordLookupContext,
    canUsePublicJpdb: boolean,
): RenderedWordKanaFragmentExpansionLookup | undefined {
    return canUsePublicJpdb ? renderedKanaFragmentExpansionLookup(word, card, context) : undefined;
}

export function renderedKanaFragmentExpansionLookup(
    word: HTMLElement,
    card: JPDBCard,
    context: RenderedWordLookupContext,
): RenderedWordKanaFragmentExpansionLookup | undefined {
    const sentence = normalizedLookupText(word.dataset.sentence || context.sentence || '');
    const offset = renderedWordOffsetInSentence(word, card, sentence);
    if (!canCorrectKanaOnlyRenderedWord(sentence, offset)) return undefined;
    const surfaceLength = renderedWordSurfaceLength(word, card);
    const terms = renderedKanaFragmentExpansionTerms(sentence, offset, surfaceLength);
    return terms.length ? { sentence, offset, surfaceLength, terms } : undefined;
}

export function renderedWordExpansionLookup(
    word: HTMLElement,
    expression: string,
    sentenceValue: string | undefined,
): RenderedWordExpansionLookup | undefined {
    const sentence = sentenceValue ?? expression;
    const offset = renderedWordValueOffsetInSentence(sentence, [
        readerWordSurfaceText(word),
        word.dataset.reading ?? '',
        word.dataset.expression ?? '',
        expression,
    ], renderedWordTokenStartInSentence(word, sentence));
    if (!canCorrectKanaOnlyRenderedWord(sentence, offset)) return undefined;
    const surfaceLength = normalizedLookupText(readerWordSurfaceText(word) || word.dataset.reading || word.dataset.expression || expression).length;
    return { sentence, offset, surfaceLength };
}

export function renderedWordCacheMatches(word: HTMLElement, card: JPDBCard): boolean {
    const expression = normalizedLookupText(word.dataset.expression ?? '');
    const reading = normalizedLookupText(word.dataset.reading ?? '');
    if (expression && !cardMatchesRenderedLookupValue(card, expression)) return false;
    if (reading && !cardMatchesRenderedLookupValue(card, reading)) return false;
    return true;
}

export function cardMatchesRenderedLookupValue(card: JPDBCard, value: string): boolean {
    return normalizedLookupText(card.spelling) === value || normalizedLookupText(card.reading) === value;
}

function renderedWordSurfaceLength(word: HTMLElement, card: JPDBCard): number {
    return normalizedLookupText(readerWordSurfaceText(word) || card.reading || card.spelling).length;
}

function renderedWordOffsetInSentence(word: HTMLElement, card: JPDBCard, sentence: string): number {
    return renderedWordValueOffsetInSentence(sentence, [
        readerWordSurfaceText(word),
        word.dataset.reading ?? '',
        word.dataset.expression ?? '',
        card.reading,
        card.spelling,
    ], renderedWordTokenStartInSentence(word, sentence));
}

function renderedWordValueOffsetInSentence(sentence: string, values: string[], preferredOffset?: number): number {
    if (!sentence) return -1;
    const candidates = [...new Set(values.map(normalizedLookupText).filter(Boolean))];
    if (preferredOffset !== undefined && renderedWordOffsetMatchesAnyValue(sentence, preferredOffset, candidates)) {
        return preferredOffset;
    }
    for (const candidate of candidates) {
        const offset = sentence.indexOf(candidate);
        if (offset >= 0) return offset;
    }
    return -1;
}

function renderedWordTokenStartInSentence(word: HTMLElement, sentence: string): number | undefined {
    const tokenStart = Number(word.dataset.tokenStart);
    if (!Number.isInteger(tokenStart) || tokenStart < 0 || tokenStart >= sentence.length) return undefined;
    return tokenStart;
}

function renderedWordOffsetMatchesAnyValue(sentence: string, offset: number, values: string[]): boolean {
    return values.some(value => value && sentence.startsWith(value, offset));
}

function renderedKanaFragmentExpansionTerms(sentence: string, offset: number, surfaceLength: number): string[] {
    const anchored = renderedKanaFragmentAnchoredTerms(sentence, offset, surfaceLength);
    const pointer = jpdbPointerLookupCandidates(sentence, offset)
            .filter((span) => span.end - span.start > surfaceLength)
            .map((span) => span.term)
            .filter(isKanaOnlyLookupTerm);
    return uniqueStrings(shouldPreferAnchoredKanaFragmentTerms(sentence, offset, surfaceLength)
        ? [...anchored, ...pointer]
        : [...pointer, ...anchored]);
}

function shouldPreferAnchoredKanaFragmentTerms(sentence: string, offset: number, surfaceLength: number): boolean {
    return surfaceLength === 1 && Boolean(kanaFragmentBoundaryAt(sentence, offset));
}

function renderedKanaFragmentAnchoredTerms(sentence: string, offset: number, surfaceLength: number): string[] {
    const run = japaneseRunAt(sentence, offset);
    if (!run) return [];
    const terms: string[] = [];
    const minStart = Math.max(run.start, offset - KANA_FRAGMENT_LOOKUP_START_WINDOW);
    for (let start = offset; start >= minStart; start -= 1) {
        const end = kanaFragmentCandidateEnd(sentence, run.end, start, offset);
        const term = normalizedLookupText(sentence.slice(start, end));
        if (term.length > surfaceLength && isKanaOnlyLookupTerm(term)) terms.push(term);
    }
    return terms;
}

function kanaFragmentCandidateEnd(sentence: string, runEnd: number, start: number, offset: number): number {
    const minEnd = Math.max(offset + 1, start + 2);
    const boundary = nextKanaFragmentBoundary(sentence, minEnd, runEnd);
    return Math.min(boundary ?? runEnd, start + KANA_FRAGMENT_LOOKUP_MAX_LENGTH);
}

function nextKanaFragmentBoundary(sentence: string, start: number, end: number): number | undefined {
    for (let index = start; index < end; index += 1) {
        const boundary = kanaFragmentBoundaryAt(sentence, index);
        if (boundary) return index;
    }
    return undefined;
}

function kanaFragmentBoundaryAt(sentence: string, index: number): string {
    return JPDB_POINTER_BOUNDARY_SEGMENTS.find(segment => sentence.startsWith(segment, index)) ?? '';
}

function uniqueStrings(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

function canCorrectKanaOnlyRenderedWord(sentence: string, offset: number): boolean {
    return offset >= 0 && isKanaOnlyRenderedWordCorrection(sentence, offset);
}

function isKanaOnlyRenderedWordCorrection(sentence: string, offset: number): boolean {
    return isKanaOnlyLookupTerm(sentence[offset] ?? '');
}

function isKanaOnlyLookupTerm(term: string): boolean {
    return KANA_ONLY_LOOKUP_RUN_RE.test(term);
}

// P0 kana-run identity: after a fragment tap resolves the full word, the
// contiguous rendered-word run covering the resolved surface (に+ほん+ご for
// にほんご) is re-stamped with the resolved identity, so card-state updates
// recolor the whole word — Jiten Reader's wordId/readingIndex registration.
export function kanaRunRenderedWordsForSurface(anchor: HTMLElement, surface: string): HTMLElement[] {
    if (!surface) return [];
    const run: HTMLElement[] = [anchor];
    for (let prev = anchor.previousElementSibling; isRenderedWordElement(prev); prev = prev.previousElementSibling) run.unshift(prev);
    for (let next = anchor.nextElementSibling; isRenderedWordElement(next); next = next.nextElementSibling) run.push(next);
    for (let start = 0; start < run.length; start += 1) {
        let text = '';
        for (let end = start; end < run.length; end += 1) {
            text += renderedWordSurfaceText(run[end]);
            if (text.length > surface.length) break;
            if (text === surface) {
                const window = run.slice(start, end + 1);
                if (window.includes(anchor)) return window;
                break;
            }
        }
    }
    return [];
}

function isRenderedWordElement(node: Element | null): node is HTMLElement {
    return node instanceof HTMLElement && node.classList.contains('jpdb-reader-word');
}

function renderedWordSurfaceText(word: HTMLElement | undefined): string {
    if (!word) return '';
    // Ruby annotations would pollute textContent; kana fragments rarely have
    // them, but strip rt/rp defensively so a mismatch fails closed.
    if (!word.querySelector('rt, rp')) return word.textContent ?? '';
    const clone = word.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('rt, rp').forEach(node => node.remove());
    return clone.textContent ?? '';
}
