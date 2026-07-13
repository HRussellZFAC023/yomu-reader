import { stablePositiveHashId } from '../core/stable-hash';
import { pitchClassNameForPattern } from './pitch-accent';
import type { JPDBCard, JPDBToken } from '../app/types';

export const AUTHORED_VOCABULARY_ATTRIBUTE = 'data-yomu-authored-vocabulary';

export interface AuthoredVocabularyAnnotation {
    readonly surface: string;
    readonly lemma: string;
    readonly reading: string;
    readonly pitch?: {
        readonly pattern: string;
        readonly source: string;
    };
}

export interface AuthoredVocabularyTarget {
    readonly text: string;
    readonly parent: ParentNode;
}

export function encodeAuthoredVocabularyAnnotations(annotations: readonly AuthoredVocabularyAnnotation[]): string {
    return JSON.stringify(annotations);
}

export function applyAuthoredVocabularyOverrides(
    target: AuthoredVocabularyTarget,
    tokens: readonly JPDBToken[],
): JPDBToken[] {
    const annotations = readAuthoredVocabularyAnnotations(target.parent);
    if (!annotations.length) return [...tokens];
    const replacements = authoredVocabularyReplacements(target.text, annotations);
    if (!replacements.length) return [...tokens];
    const kept = tokens.filter(token => !replacements.some(replacement => rangesOverlap(token, replacement)));
    return [...kept, ...replacements].sort((left, right) => left.start - right.start || right.length - left.length);
}

export function readAuthoredVocabularyAnnotations(parent: ParentNode): AuthoredVocabularyAnnotation[] {
    const owner = authoredVocabularyOwner(parent);
    const raw = owner?.getAttribute(AUTHORED_VOCABULARY_ATTRIBUTE);
    if (!raw || raw.length > 8_000) return [];
    try {
        const value = JSON.parse(raw) as unknown;
        return Array.isArray(value)
            ? value.slice(0, 24).map(normalizeAnnotation).filter((item): item is AuthoredVocabularyAnnotation => item !== null)
            : [];
    } catch {
        return [];
    }
}

function authoredVocabularyOwner(parent: ParentNode): HTMLElement | null {
    const element = parent instanceof HTMLElement ? parent : parent.parentElement;
    if (!element) return null;
    if (element.hasAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)) return element;
    return element.closest<HTMLElement>(`[${AUTHORED_VOCABULARY_ATTRIBUTE}]`);
}

function normalizeAnnotation(value: unknown): AuthoredVocabularyAnnotation | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const surface = normalizedJapaneseText(record.surface);
    const lemma = normalizedJapaneseText(record.lemma);
    const reading = normalizedJapaneseText(record.reading);
    if (!surface || !lemma || !reading || !isKanaReading(reading)) return null;
    const pitch = normalizePitch(record.pitch, reading);
    return { surface, lemma, reading, ...(pitch ? { pitch } : {}) };
}

function normalizePitch(value: unknown, reading: string): AuthoredVocabularyAnnotation['pitch'] | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    const pattern = typeof record.pattern === 'string' ? record.pattern.trim() : '';
    const source = typeof record.source === 'string' ? record.source.trim().slice(0, 120) : '';
    if (!pattern || !source || !pitchClassNameForPattern(pattern, reading)) return undefined;
    return { pattern, source };
}

function normalizedJapaneseText(value: unknown): string {
    if (typeof value !== 'string') return '';
    const text = value.normalize('NFKC').trim();
    if (!text || text.length > 80 || /[\u0000-\u001f\u007f]/u.test(text)) return '';
    return text;
}

function isKanaReading(value: string): boolean {
    return /^[\u3040-\u30ffー]+$/u.test(value);
}

function authoredVocabularyReplacements(text: string, annotations: readonly AuthoredVocabularyAnnotation[]): JPDBToken[] {
    const replacements: JPDBToken[] = [];
    for (const annotation of annotations) {
        let start = text.indexOf(annotation.surface);
        while (start >= 0) {
            const end = start + annotation.surface.length;
            if (!replacements.some(token => rangesOverlap(token, { start, end }))) {
                replacements.push(authoredVocabularyToken(annotation, start, end, text));
            }
            start = text.indexOf(annotation.surface, end);
        }
    }
    return replacements;
}

function authoredVocabularyToken(
    annotation: AuthoredVocabularyAnnotation,
    start: number,
    end: number,
    sentence: string,
): JPDBToken {
    const id = -stablePositiveHashId(`authored-vocabulary\n${annotation.surface}\n${annotation.lemma}\n${annotation.reading}`);
    const card: JPDBCard = {
        vid: id,
        sid: id,
        rid: 0,
        spelling: annotation.surface,
        reading: annotation.reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        // Keep the surface pitch on the rendered token, not the fallback card:
        // a pitched fallback card is considered fully enriched and would skip
        // the declared lemma's dictionary/Jiten hydration.
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
        fallbackLookupTerms: [annotation.lemma],
    };
    return {
        card,
        start,
        end,
        length: end - start,
        rubies: annotation.reading === annotation.surface
            ? []
            : [{ text: annotation.reading, start, end, length: end - start }],
        pitchClass: annotation.pitch
            ? pitchClassNameForPattern(annotation.pitch.pattern, annotation.reading)
            : '',
        sentence,
    };
}

function rangesOverlap(
    first: Pick<JPDBToken, 'start' | 'end'>,
    second: Pick<JPDBToken, 'start' | 'end'>,
): boolean {
    return first.start < second.end && second.start < first.end;
}
