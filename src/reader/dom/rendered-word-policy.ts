import type { JPDBCard } from '../app/types';
import {
    readRenderedWordPrivateState,
    renderedWordPrivateStateForCard,
    renderedWordPrivateValue,
    updateRenderedWordPrivateState,
} from './rendered-word-private-state';

export interface RenderedWordNumericIdentity {
    vid: number;
    sid: number;
}

export interface RenderedWordSpan {
    start: number;
    end: number;
}

/** Centralizes all reads of opaque rendered-word identity. */
export function renderedWordNumericIdentity(word: HTMLElement): RenderedWordNumericIdentity {
    return {
        vid: Number(renderedWordPrivateValue(word, 'vid')),
        sid: Number(renderedWordPrivateValue(word, 'sid')),
    };
}

export function renderedWordHasCardIdentity(word: HTMLElement, card: Pick<JPDBCard, 'vid' | 'sid'>): boolean {
    const identity = renderedWordNumericIdentity(word);
    return [
        Number.isFinite(identity.vid),
        Number.isFinite(identity.sid),
        identity.vid === card.vid,
        identity.sid === card.sid,
    ].every(Boolean);
}

export function renderedWordSpan(word: HTMLElement, fallbackLength: number): RenderedWordSpan {
    return renderedWordRecordedSpan(word) ?? { start: 0, end: fallbackLength };
}

export function renderedWordRecordedSpan(word: HTMLElement): RenderedWordSpan | null {
    const start = Number(word.dataset.tokenStart);
    const end = Number(word.dataset.tokenEnd);
    const valid = [Number.isInteger(start), Number.isInteger(end), start >= 0, end > start].every(Boolean);
    if (!valid) return null;
    return { start, end };
}

export function isProvisionalRenderedWord(word: HTMLElement): boolean {
    return renderedWordPrivateValue(word, 'stateProvenance') === 'provisional';
}

export function renderedWordTextIdentityMatches(
    spelling: string,
    expectedReading: string,
    expressionCandidates: Array<string | undefined>,
    renderedReading: string | undefined,
): boolean {
    const expression = expressionCandidates.map(normalizeIdentityText).find(Boolean);
    const reading = normalizeIdentityText(renderedReading);
    return [
        expression === spelling,
        [reading === '', reading === expectedReading].some(Boolean),
    ].every(Boolean);
}

export function replaceRenderedWordStateAndPitchClasses(
    word: HTMLElement,
    states: readonly string[],
    nextClasses: readonly string[],
): void {
    const stateClasses = new Set(states.flatMap(state => [`jpdb-${state}`, `anki-${state}`]));
    Array.from(word.classList)
        .filter(className => className.startsWith('jpdb-pitch-') || stateClasses.has(className))
        .forEach(className => word.classList.remove(className));
    word.classList.add(...nextClasses);
}

export function renderedWordSourceVisualClass(card: Pick<JPDBCard, 'source' | 'reviewSource'>): 'anki' | 'jpdb' {
    return [card.source, card.reviewSource].includes('anki') ? 'anki' : 'jpdb';
}

export function bindRenderedWordCardIdentity(word: HTMLElement, card: JPDBCard, state: string): void {
    updateRenderedWordPrivateState(word, renderedWordPrivateStateForCard(card, state));
}

export function preserveRenderedWordSentence(word: HTMLElement, candidates: Array<string | undefined>): void {
    if (word.dataset.sentence) return;
    word.dataset.sentence = candidates.find(Boolean) ?? '';
}

export function renderedWordProviderIdentity(word: HTMLElement): string {
    const state = readRenderedWordPrivateState(word);
    if (!state) return '';
    const provider = completeIdentity([state.cardSource, state.cardId, state.readingIndex], ':', '/');
    const fallback = completeIdentity([state.vid, state.sid], ':');
    return [provider, fallback].find(Boolean) ?? '';
}

export async function resolveRenderedWordAttempts(
    attempts: Array<() => Promise<boolean>>,
    isCurrent: () => boolean,
): Promise<boolean> {
    for (const attempt of attempts) {
        if (!isCurrent()) return true;
        if (await attempt()) return true;
    }
    return !isCurrent();
}

export function selectRenderedWordAttempt(
    useFirst: boolean,
    first: () => Promise<boolean>,
    second: () => Promise<boolean>,
): () => Promise<boolean> {
    return useFirst ? first : second;
}

function normalizeIdentityText(value: string | undefined): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function completeIdentity(parts: Array<string | undefined>, firstSeparator: string, secondSeparator = firstSeparator): string {
    const normalized = parts.map(normalizeIdentityText);
    if (!normalized.every(Boolean)) return '';
    return normalized.length === 3
        ? `${normalized[0]}${firstSeparator}${normalized[1]}${secondSeparator}${normalized[2]}`
        : normalized.join(firstSeparator);
}
