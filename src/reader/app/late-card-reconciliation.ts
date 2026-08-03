import { untrustedAnkiLookupResult, type AnkiLookupResult } from '../anki/index';
import { cardKey } from '../cards/utils';
import { uniqueParentNodes } from '../dom/rendered-word-state';
import { isParticleCard } from '../dom/token-text-rendering';
import { getPitchClass } from '../jpdb/jpdb-parser';
import {
    hydrateYomuLocalSrsCardStates,
    repaintYomuLocalSrsRenderedCards,
} from '../srs/local-yomu-state';
import type { YomuSrsAdapter } from '../srs/types';
import { applyPublicVocabularyFurigana } from './dom-helpers';
import { Logger } from './logger';
import type { JPDBCard, JPDBToken, ReaderSettings } from './types';

const log = Logger.scope('LateCardReconciliation');
const RESOLVED_WORD_EFFECTS_BATCH_DELAY_MS = 0;

export function currentAnkiLookupBatch(
    tokens: JPDBToken[],
    lookupKeys: string[],
    lookups: AnkiLookupResult[],
): { tokens: JPDBToken[]; lookups: AnkiLookupResult[] } {
    const currentTokens: JPDBToken[] = [];
    const currentLookups: AnkiLookupResult[] = [];
    tokens.forEach((token, index) => {
        if (cardKey(token.card) !== lookupKeys[index]) return;
        currentTokens.push(token);
        currentLookups.push(lookups[index] ?? untrustedAnkiLookupResult());
    });
    return { tokens: currentTokens, lookups: currentLookups };
}

interface LateCardReconciliationDependencies {
    isDestroyed(): boolean;
    getSettings(): ReaderSettings;
    getLocalSrs(): Pick<YomuSrsAdapter, 'lookupCards'>;
    renderedWordsForCardStateRepaint(card: JPDBCard): HTMLElement[];
    resetRenderedWordRepaintCycle(): void;
    pauseMutationObserver(callback: () => void): void;
    applyVocabulary(word: HTMLElement, card: JPDBCard, pitchClass: string): boolean;
    reconcileInteractiveVocabulary(word: HTMLElement, card: JPDBCard, pitchClass: string): void;
    annotationRoot(word: HTMLElement): ParentNode;
    scheduleAnnotationRefresh(roots: Iterable<ParentNode>, geometryRoots?: Iterable<ParentNode>): void;
    registerRenderedRoot(root: ParentNode): void;
    preloadAudio(tokens: JPDBToken[]): void;
    queueAnki(tokens: JPDBToken[], roots: ParentNode[]): void;
}

/** Coalesces every consumer that must follow a sparse-to-canonical card upgrade. */
export class LateCardReconciliation {
    private readonly tokens = new Map<string, JPDBToken>();
    private readonly roots = new Set<ParentNode>();
    private timer?: number;

    constructor(private readonly dependencies: LateCardReconciliationDependencies) {}

    queue(tokens: JPDBToken[], roots: ParentNode[]): void {
        if (this.dependencies.isDestroyed() || !tokens.length) return;
        tokens.forEach(token => this.tokens.set(cardKey(token.card), token));
        roots.filter((root): root is ParentNode & Node => root instanceof Node && root.isConnected)
            .forEach(root => this.roots.add(root));
        // Leading fixed window: a continuous detail feed cannot postpone work.
        if (this.timer !== undefined) return;
        this.timer = window.setTimeout(() => {
            this.timer = undefined;
            this.flush();
        }, RESOLVED_WORD_EFFECTS_BATCH_DELAY_MS);
    }

    token(card: JPDBCard, pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown'): JPDBToken {
        return {
            card,
            start: 0,
            end: card.spelling.length,
            length: card.spelling.length,
            rubies: [],
            pitchClass: isParticleCard(card) ? 'particle' : pitchClass,
        };
    }

    repaint(fallback: JPDBCard, card: JPDBCard, pitchClass: string): ParentNode[] {
        const changedRoots = new Set<ParentNode>();
        const geometryRoots = new Set<ParentNode>();
        // Resolve every sentence scope before mutating identity or ruby geometry.
        const targets = this.dependencies.renderedWordsForCardStateRepaint(fallback)
            .map(word => ({ word, root: this.dependencies.annotationRoot(word) }));
        this.dependencies.pauseMutationObserver(() => {
            targets.forEach(({ word, root }) => {
                if (this.dependencies.applyVocabulary(word, card, pitchClass)) geometryRoots.add(root);
                changedRoots.add(root);
            });
        });
        const roots = [...changedRoots];
        this.dependencies.scheduleAnnotationRefresh(roots, geometryRoots);
        return roots;
    }

    resetPending(): void {
        window.clearTimeout(this.timer);
        this.timer = undefined;
        this.tokens.clear();
        this.roots.clear();
        this.dependencies.resetRenderedWordRepaintCycle();
    }

    private flush(): void {
        const tokens = [...this.tokens.values()];
        const roots = [...this.roots]
            .filter((root): root is ParentNode & Node => root instanceof Node && root.isConnected);
        this.tokens.clear();
        this.roots.clear();
        if (this.dependencies.isDestroyed() || !tokens.length) return;
        // Register once per coalesced batch, not once per resolved card.
        roots.forEach(root => this.dependencies.registerRenderedRoot(root));
        this.dependencies.preloadAudio(tokens);
        if (roots.length) this.dependencies.queueAnki(tokens, roots);
        void this.hydrateLocalSrs(tokens, roots);
    }

    private async hydrateLocalSrs(tokens: JPDBToken[], roots: ParentNode[]): Promise<void> {
        const adapter = this.dependencies.getLocalSrs();
        if (!this.dependencies.getSettings().yomuLocalSrsEnabled || typeof adapter.lookupCards !== 'function') return;
        try {
            await hydrateYomuLocalSrsCardStates([tokens], adapter);
            const settings = this.dependencies.getSettings();
            if (this.dependencies.isDestroyed() || !settings.yomuLocalSrsEnabled || !roots.length) return;
            const connectedRoots = roots.filter(root => root instanceof Node && root.isConnected);
            if (!connectedRoots.length) return;
            const cards = tokens.map(token => token.card);
            let changedWords: HTMLElement[] = [];
            const geometryRoots = new Set<ParentNode>();
            this.dependencies.pauseMutationObserver(() => {
                changedWords = repaintYomuLocalSrsRenderedCards(cards, connectedRoots);
                for (const word of changedWords) {
                    const card = cards.find(candidate => candidate.spelling === word.dataset.expression
                        && candidate.reading === word.dataset.reading);
                    if (!card) continue;
                    const root = this.dependencies.annotationRoot(word);
                    if (applyPublicVocabularyFurigana(word, card, settings)) geometryRoots.add(root);
                    // OCR activation retains its own token object. A semantic
                    // local-SRS match can hydrate a separate card instance, so
                    // keep that interaction state in lockstep with the DOM
                    // without restamping (and losing) yomu-local provenance.
                    this.dependencies.reconcileInteractiveVocabulary(word, card, word.dataset.pitchClass ?? '');
                }
            });
            if (!changedWords.length) return;
            const changedRoots = uniqueParentNodes(changedWords.map(word => this.dependencies.annotationRoot(word)));
            this.dependencies.scheduleAnnotationRefresh(changedRoots, geometryRoots);
        } catch (error) {
            log.warnOnce('local-srs-hydration-failed', 'Academy SRS late-card hydration failed', error);
        }
    }
}
