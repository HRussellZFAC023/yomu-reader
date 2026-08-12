import { cardKey } from '../cards/utils';
import {
    isValidRenderedWordKey,
    renderedWordCardKey,
    renderedWordElementKey,
    renderedWordsInRoot,
    renderedWordSelectorForKey,
    rootContainsRenderedWord,
} from '../dom/rendered-word-state';
import { ANKI_TARGETED_RENDERED_WORD_SELECTOR_THRESHOLD } from './main-helpers';
import type { JPDBCard, JPDBToken } from './types';

const RENDERED_WORD_INDEX_PRUNE_DELAY_MS = 30_000;

interface RenderedWordIndexDependencies {
    isDestroyed(): boolean;
    annotationRoots(roots?: ParentNode[]): ParentNode[];
}

/**
 * Owns the strong rendered-word index and its bounded lifecycle.
 *
 * ReaderApp supplies annotation roots because shadow-root discovery belongs to
 * the application shell; all key lookup, recycler reseeding, and pruning stays
 * here so canonical card hydration never falls back to per-card document walks.
 */
export class RenderedWordIndex {
    readonly entries = new Map<string, Set<HTMLElement>>();

    private fullyScanned = false;
    private pruneTimer?: number;
    private repaintSeeded = false;
    private repaintSeedTimer?: number;

    constructor(private readonly dependencies: RenderedWordIndexDependencies) {}

    markFullyScanned(): void {
        this.fullyScanned = true;
    }

    registerRoot(root: ParentNode): void {
        renderedWordsInRoot(root).forEach(word => this.register(word));
    }

    register(word: HTMLElement): void {
        const key = renderedWordElementKey(word);
        if (!isValidRenderedWordKey(key)) return;
        const words = this.entries.get(key) ?? new Set<HTMLElement>();
        words.add(word);
        this.entries.set(key, words);
        this.schedulePrune();
    }

    prepareForLookups(lookupByWordKey: ReadonlyMap<string, unknown>, roots: ParentNode[]): void {
        const targetRoots = roots.length ? roots : [document];
        // A document selector never crosses into shadow DOM. Seed explicitly
        // expanded roots before the light-DOM fast-path can mask a mirror word.
        targetRoots.filter(root => root instanceof ShadowRoot).forEach(root => this.registerRoot(root));
        const includesDocument = targetRoots.includes(document);
        if (this.shouldSkipPreparation(lookupByWordKey, includesDocument)) return;
        targetRoots.forEach(root => this.registerRoot(root));
        if (includesDocument) this.fullyScanned = true;
    }

    wordsForLookupKey(key: string, roots: ParentNode[]): HTMLElement[] {
        const targetRoots = roots.length ? roots : [document];
        const indexed = this.indexedWordsForKey(key, targetRoots);
        if (indexed.length || this.entries.has(key)) return indexed;
        const queried = this.queryWordsForKey(key, targetRoots);
        queried.forEach(word => this.register(word));
        return queried;
    }

    wordsForCardStateRepaint(card: JPDBCard): HTMLElement[] {
        this.primeRepaintIndex();
        const key = renderedWordCardKey(card.vid, card.sid);
        const indexed = this.indexedWordsForKey(key, [document]);
        if (indexed.length || this.entries.has(key)) return indexed;
        // Framework recyclers can paint outside the page scanner. One
        // key-specific discovery registers those words; later cards stay O(n).
        const queried = this.queryWordsForKey(key, this.dependencies.annotationRoots());
        queried.forEach(word => this.register(word));
        return queried;
    }

    tokensForRecolor(root: ParentNode, tokenForWord: (word: HTMLElement) => JPDBToken | null): JPDBToken[] {
        const seen = new Set<string>();
        const tokens: JPDBToken[] = [];
        for (const [wordKey, words] of this.entries) {
            for (const word of words) {
                if (!word.isConnected || renderedWordElementKey(word) !== wordKey) {
                    words.delete(word);
                    continue;
                }
                if (!rootContainsRenderedWord(root, word)) continue;
                const token = tokenForWord(word);
                if (!token) continue;
                const key = cardKey(token.card);
                if (seen.has(key)) continue;
                seen.add(key);
                tokens.push(token);
            }
            if (!words.size) this.entries.delete(wordKey);
        }
        return tokens;
    }

    resetRepaintCycle(): void {
        window.clearTimeout(this.repaintSeedTimer);
        this.repaintSeedTimer = undefined;
        this.repaintSeeded = false;
    }

    clear(): void {
        window.clearTimeout(this.pruneTimer);
        this.pruneTimer = undefined;
        this.resetRepaintCycle();
        this.entries.clear();
        this.fullyScanned = false;
    }

    private shouldSkipPreparation(lookupByWordKey: ReadonlyMap<string, unknown>, includesDocument: boolean): boolean {
        if (!includesDocument) return false;
        if (this.fullyScanned) return true;
        for (const key of lookupByWordKey.keys()) {
            if (!this.entries.has(key)) return this.entries.size > 0
                || lookupByWordKey.size <= ANKI_TARGETED_RENDERED_WORD_SELECTOR_THRESHOLD;
        }
        return true;
    }

    private indexedWordsForKey(key: string, roots: ParentNode[]): HTMLElement[] {
        const words = this.entries.get(key);
        if (!words) return [];
        const matches: HTMLElement[] = [];
        for (const word of words) {
            if (!word.isConnected || renderedWordElementKey(word) !== key) {
                words.delete(word);
                continue;
            }
            if (roots.some(root => rootContainsRenderedWord(root, word))) matches.push(word);
        }
        if (!words.size) this.entries.delete(key);
        return matches;
    }

    private queryWordsForKey(key: string, roots: ParentNode[]): HTMLElement[] {
        const selector = renderedWordSelectorForKey(key);
        if (!selector) return [];
        const words = new Set<HTMLElement>();
        roots.forEach(root => {
            if (root instanceof HTMLElement && root.matches(selector)) words.add(root);
            root.querySelectorAll<HTMLElement>(selector).forEach(word => words.add(word));
        });
        return [...words].filter(word => renderedWordElementKey(word) === key);
    }

    private primeRepaintIndex(): void {
        if (this.repaintSeeded) return;
        // One discovery per detail task catches new SPA recycler duplicates;
        // every card resolved in that task then uses the occurrence index.
        this.dependencies.annotationRoots().forEach(root => this.registerRoot(root));
        this.repaintSeeded = true;
        if (this.repaintSeedTimer !== undefined) return;
        this.repaintSeedTimer = window.setTimeout(() => {
            this.repaintSeedTimer = undefined;
            this.repaintSeeded = false;
        }, 0);
    }

    private schedulePrune(): void {
        if (this.pruneTimer !== undefined || this.dependencies.isDestroyed()) return;
        this.pruneTimer = window.setTimeout(() => {
            this.pruneTimer = undefined;
            if (this.dependencies.isDestroyed()) return;
            for (const [key, words] of this.entries) {
                for (const word of words) {
                    if (!word.isConnected || renderedWordElementKey(word) !== key) words.delete(word);
                }
                if (!words.size) this.entries.delete(key);
            }
            // Future registrations schedule the next sweep. Connected words
            // alone must not keep a perpetual 30-second wake-up alive on every
            // quiet page where Yomu has annotated anything.
        }, RENDERED_WORD_INDEX_PRUNE_DELAY_MS);
    }
}
