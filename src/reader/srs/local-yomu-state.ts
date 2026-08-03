import type { JPDBCard, JPDBToken } from '../app/types';
import { applyLocalYomuSrsStateToRenderedWord } from '../dom/rendered-word-state';
import { refreshContrastForChangedWords } from '../dom/word-contrast';
import { canonicalStudyCardIdentity } from './shared';
import type { YomuSrsAdapter, YomuSrsReviewable } from './types';

/** Copies the authoritative local schedule onto a provider/dictionary card. */
export function applyYomuLocalReviewableToCard(card: JPDBCard, reviewable: YomuSrsReviewable): JPDBCard {
    card.cardState = [...reviewable.state];
    card.reviewSource = 'yomu-local';
    card.dueAt = reviewable.dueAt;
    card.lastReviewAt = reviewable.lastReviewAt;
    card.language = reviewable.language;
    delete card.provisionalState;
    return card;
}

/** Hydrates every parsed card from one semantic local-deck lookup. */
export async function hydrateYomuLocalSrsCardStates(
    parsed: JPDBToken[][],
    adapter: Pick<YomuSrsAdapter, 'lookupCards'>,
): Promise<JPDBToken[][]> {
    if (typeof adapter.lookupCards !== 'function') return parsed;
    const cards = parsed.flatMap(tokens => tokens.map(token => token.card));
    const identities = new Map<string, { expression: string; reading: string; language?: string }>();
    for (const card of cards) {
        const identity = localIdentity(card.spelling, card.reading, card.language);
        if (identity) identities.set(identity.key, identity);
    }
    if (!identities.size) return parsed;
    const reviewables = await adapter.lookupCards([...identities.values()]);
    const indexed = new Map(reviewables.map(reviewable => [
        canonicalStudyCardIdentity(reviewable.expression, reviewable.reading, {
            partOfSpeech: reviewable.partOfSpeech,
            language: reviewable.language,
        }).key,
        reviewable,
    ]));
    for (const card of cards) {
        const identity = localIdentity(card.spelling, card.reading, card.language);
        const reviewable = identity ? indexed.get(identity.key) : undefined;
        if (reviewable) applyYomuLocalReviewableToCard(card, reviewable);
    }
    return parsed;
}

/** Repaints all visible semantic matches, even when their dictionary ids differ. */
export function repaintYomuLocalSrsRenderedWords(
    card: JPDBCard,
    roots: readonly ParentNode[] = typeof document === 'undefined' ? [] : [document],
): number {
    const changed = repaintYomuLocalSrsRenderedCards([card], roots);
    refreshContrastForChangedWords(changed);
    return changed.length;
}

/** Repaints one canonical hydration batch with one traversal per root. */
export function repaintYomuLocalSrsRenderedCards(
    cards: readonly JPDBCard[],
    roots: readonly ParentNode[] = typeof document === 'undefined' ? [] : [document],
): HTMLElement[] {
    const byIdentity = new Map<string, JPDBCard>();
    for (const card of cards) {
        if (card.reviewSource !== 'yomu-local' && card.source !== 'yomu-local') continue;
        const identity = localIdentity(card.spelling, card.reading, card.language);
        if (identity) byIdentity.set(identity.key, card);
    }
    if (!byIdentity.size) return [];
    const words = new Set<HTMLElement>();
    for (const root of roots) {
        if (root instanceof HTMLElement && root.matches('.jpdb-reader-word[data-expression]')) words.add(root);
        root.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-expression]').forEach(word => words.add(word));
    }
    const changed: HTMLElement[] = [];
    for (const word of words) {
        const identity = localIdentity(
            word.dataset.expression ?? '',
            word.dataset.reading ?? '',
            word.dataset.language,
        );
        const card = identity ? byIdentity.get(identity.key) : undefined;
        if (!card) continue;
        if (applyLocalYomuSrsStateToRenderedWord(word, card)) changed.push(word);
    }
    return changed;
}

function localIdentity(
    expression: string,
    reading: string,
    language?: string,
): ReturnType<typeof canonicalStudyCardIdentity> | null {
    try {
        return canonicalStudyCardIdentity(expression, reading, { language });
    } catch {
        return null;
    }
}

/** Canonical key shared by local-SRS hydration and late rendered-word follow-up. */
export function yomuLocalSrsCardIdentityKey(
    expression: string,
    reading: string,
    language?: string,
): string | null {
    return localIdentity(expression, reading, language)?.key ?? null;
}
