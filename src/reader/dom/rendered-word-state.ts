import type { JPDBCard } from '../app/types';
import { cardDeckMembership, cardDeckMembershipClassNames } from '../cards/deck-membership';
import { primaryCardState } from '../cards/state';
import { pitchComponentUnderlineGradient } from '../lookup/pitch-components';
import { RENDERED_WORD_CONTRAST_VARS } from './rendered-word-contrast-vars';

const RENDERED_WORD_CARD_STATES = [
    'new',
    'learning',
    'young',
    'mature',
    'known',
    'mastered',
    'due',
    'failed',
    'locked',
    'never-forget',
    'blacklisted',
    'suspended',
    'in-deck',
    'not-in-deck',
    'redundant',
    'frequent',
    'unparsed',
];
const RENDERED_WORD_CARD_STATE_PREFIXES = ['jpdb', 'jiten', 'local', 'fallback', 'bunpro'];
const RENDERED_WORD_DECK_SOURCE_PREFIXES = ['jpdb', 'jiten', 'local', 'fallback', 'anki'];
const RENDERED_WORD_MINING_INSIGHT_STATES = new Set(['new', 'not-in-deck', 'in-deck']);
// States a Bunpro match may colour over: the parse provider had no opinion.
const BUNPRO_FILLABLE_CARD_STATES = new Set(['', 'not-in-deck']);

export function clearRenderedWordAnkiState(word: HTMLElement): void {
    Array.from(word.classList)
        .filter(className => className.startsWith('anki-'))
        .forEach(className => word.classList.remove(className));
    delete word.dataset.ankiState;
    delete word.dataset.ankiDecks;
    RENDERED_WORD_CONTRAST_VARS.forEach(name => word.style.removeProperty(name));
    if (word.title.startsWith('Anki:')) word.removeAttribute('title');
}

export function renderedWordHasAnkiState(word: HTMLElement): boolean {
    return Boolean(word.dataset.ankiState
        || word.dataset.ankiDecks
        || Array.from(word.classList).some(className => className.startsWith('anki-')));
}

export function renderedWordCardKey(vid: number, sid: number): string {
    return `${vid}:${sid}`;
}

export function renderedWordElementKey(word: HTMLElement): string {
    return renderedWordCardKey(Number(word.dataset.vid), Number(word.dataset.sid));
}

export function isValidRenderedWordKey(key: string): boolean {
    const parts = key.split(':');
    return parts.length === 2
        && parts.every(part => part.trim() !== '' && Number.isFinite(Number(part)));
}

export function renderedWordSelectorForKey(key: string): string | null {
    if (!isValidRenderedWordKey(key)) return null;
    const [vid, sid] = key.split(':');
    return `.jpdb-reader-word[data-vid="${escapeCssAttributeValue(vid ?? '')}"][data-sid="${escapeCssAttributeValue(sid ?? '')}"]`;
}

export function rootContainsRenderedWord(root: ParentNode, word: HTMLElement): boolean {
    return root === document
        || root === word
        || (root instanceof Node && root.contains(word));
}

export function renderedWordsInRoot(root: ParentNode): HTMLElement[] {
    const words = new Set<HTMLElement>();
    if (root instanceof HTMLElement && root.matches('.jpdb-reader-word[data-vid][data-sid]')) words.add(root);
    root.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-vid][data-sid]').forEach(word => words.add(word));
    return [...words];
}

export async function* renderedWordsInRootChunked(root: ParentNode, chunkSize: number): AsyncGenerator<HTMLElement> {
    let yielded = 0;
    const maybeYield = async () => {
        yielded += 1;
        if (yielded % chunkSize === 0) await yieldToNextTask();
    };
    if (root instanceof HTMLElement && root.matches('.jpdb-reader-word[data-vid][data-sid]')) {
        yield root;
        await maybeYield();
    }
    const ownerDocument = root instanceof Document ? root : root.ownerDocument ?? document;
    const walker = ownerDocument.createTreeWalker(root as Node, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
            return node instanceof HTMLElement && node.matches('.jpdb-reader-word[data-vid][data-sid]')
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_SKIP;
        },
    });
    let node = walker.nextNode();
    while (node) {
        yield node as HTMLElement;
        await maybeYield();
        node = walker.nextNode();
    }
}

export function uniqueParentNodes(roots: ParentNode[]): ParentNode[] {
    return [...new Set(roots)];
}

export function renderedFallbackVocabularyCacheKey(word: HTMLElement): string {
    const vid = Number(word.dataset.vid);
    const sid = Number(word.dataset.sid);
    const spelling = word.dataset.expression?.trim() ?? '';
    return Number.isFinite(vid) && Number.isFinite(sid) && spelling ? `${vid}:${sid}:${spelling}:` : '';
}

export function setRenderedWordPitchClass(word: HTMLElement, pitchClass: string): void {
    Array.from(word.classList)
        .filter(className => className.startsWith('jpdb-pitch-'))
        .forEach(className => word.classList.remove(className));
    word.dataset.pitchClass = pitchClass;
    if (pitchClass) word.classList.add(`jpdb-pitch-${pitchClass}`);
}

export function setRenderedWordPitchComponents(word: HTMLElement, card: JPDBCard): void {
    const gradient = pitchComponentUnderlineGradient(card);
    if (!gradient) {
        delete word.dataset.pitchComponents;
        word.style.removeProperty('--jpdb-reader-inline-pitch-gradient');
        return;
    }
    word.dataset.pitchComponents = 'true';
    word.style.setProperty('--jpdb-reader-inline-pitch-gradient', gradient);
}

export function setRenderedWordCardIdentity(word: HTMLElement, card: JPDBCard): void {
    const source = renderedWordCardSource(card);
    const state = primaryCardState(card.cardState);
    clearRenderedWordCardStateClasses(word);
    delete word.dataset.bunproState;
    clearRenderedWordDeckMembershipClasses(word, ['anki']);
    word.dataset.vid = String(card.vid);
    word.dataset.sid = String(card.sid);
    word.dataset.cardSource = source;
    word.dataset.cardId = String(renderedWordCardId(card, source));
    word.dataset.readingIndex = String(renderedWordReadingIndex(card, source));
    word.dataset.cardState = state;
    word.dataset.expression = card.spelling;
    word.dataset.reading = card.reading;
    if (!RENDERED_WORD_MINING_INSIGHT_STATES.has(state)) clearRenderedWordMiningInsight(word);
    const pitchAccent = card.pitchAccent.join('|');
    if (pitchAccent) word.dataset.pitchAccent = pitchAccent;
    else delete word.dataset.pitchAccent;
    setRenderedWordPitchComponents(word, card);
    word.classList.add(`jpdb-${state}`);
    if (source !== 'jpdb') word.classList.add(`${source}-${state}`);
    applyRenderedWordDeckMembership(word, card);
}

/**
 * Colours a rendered word from the user's Bunpro SRS state, reusing the same
 * `jpdb-<state>` visual tiers jpdb/jiten words render with (plus a
 * `bunpro-<state>` marker). Only fills words whose parse provider reported no
 * state, so real jpdb/jiten card states always win. Returns true when the
 * word's classes changed.
 */
export function applyBunproStateToRenderedWord(word: HTMLElement, state: string | null): boolean {
    const previous = word.dataset.bunproState ?? '';
    if (!previous && !BUNPRO_FILLABLE_CARD_STATES.has(word.dataset.cardState ?? '')) return false;
    if (!state) {
        if (!previous) return false;
        clearRenderedWordBunproState(word);
        return true;
    }
    if (previous === state) return false;
    if (previous) word.classList.remove(`jpdb-${previous}`, `bunpro-${previous}`);
    else word.dataset.bunproPrefillState = word.dataset.cardState ?? '';
    const source = word.dataset.cardSource ?? 'jpdb';
    word.classList.remove('jpdb-not-in-deck', `${source}-not-in-deck`);
    word.classList.add(`jpdb-${state}`, `bunpro-${state}`);
    word.dataset.cardState = state;
    word.dataset.bunproState = state;
    return true;
}

function clearRenderedWordBunproState(word: HTMLElement): void {
    const previous = word.dataset.bunproState ?? '';
    if (previous) word.classList.remove(`jpdb-${previous}`, `bunpro-${previous}`);
    delete word.dataset.bunproState;
    // Restore the provider state captured before Bunpro filled the word — a
    // word the provider had no opinion on must go back to blank, not invent
    // a not-in-deck verdict.
    const prefill = word.dataset.bunproPrefillState;
    delete word.dataset.bunproPrefillState;
    const restored = prefill ?? 'not-in-deck';
    if (restored) {
        const source = word.dataset.cardSource ?? 'jpdb';
        word.classList.add(`jpdb-${restored}`);
        if (source !== 'jpdb') word.classList.add(`${source}-${restored}`);
        word.dataset.cardState = restored;
    } else {
        delete word.dataset.cardState;
    }
}

function clearRenderedWordMiningInsight(word: HTMLElement): void {
    word.classList.remove('jpdb-reader-i-plus-one');
    delete word.dataset.miningInsight;
}

function escapeCssAttributeValue(value: string): string {
    return value.replace(/["\\]/g, '\\$&');
}

function clearRenderedWordCardStateClasses(word: HTMLElement): void {
    Array.from(word.classList)
        .filter(isRenderedWordCardStateClass)
        .forEach(className => word.classList.remove(className));
}

function clearRenderedWordDeckMembershipClasses(word: HTMLElement, preserveSources: string[] = []): void {
    Array.from(word.classList)
        .filter(className => isRenderedWordDeckMembershipClass(className, preserveSources))
        .forEach(className => word.classList.remove(className));
    if (preserveSources.length) return;
    delete word.dataset.deckMember;
    delete word.dataset.deckSource;
    delete word.dataset.deckNames;
}

function isRenderedWordCardStateClass(className: string): boolean {
    return RENDERED_WORD_CARD_STATE_PREFIXES.some(prefix => RENDERED_WORD_CARD_STATES.some(state => className === `${prefix}-${state}`));
}

function isRenderedWordDeckMembershipClass(className: string, preserveSources: string[]): boolean {
    if (className === 'yomu-deck-member') return false;
    if (className.startsWith('yomu-deck-')) return true;
    return RENDERED_WORD_DECK_SOURCE_PREFIXES.some(prefix => {
        if (preserveSources.includes(prefix)) return false;
        return className === `${prefix}-deck-member` || className.startsWith(`${prefix}-deck-`);
    });
}

function applyRenderedWordDeckMembership(word: HTMLElement, card: JPDBCard): void {
    const membership = cardDeckMembership(card);
    if (!membership.member) {
        if (!word.classList.contains('anki-deck-member')) {
            word.classList.remove('yomu-deck-member');
            delete word.dataset.deckMember;
            delete word.dataset.deckSource;
            delete word.dataset.deckNames;
        }
        return;
    }
    word.classList.add(...cardDeckMembershipClassNames(card));
    word.dataset.deckMember = 'true';
    word.dataset.deckSource = membership.source;
    if (membership.names.length) word.dataset.deckNames = membership.names.join(', ');
    else delete word.dataset.deckNames;
}

function renderedWordCardSource(card: JPDBCard): string {
    return card.source ?? (card.reviewSource === 'jiten-api' ? 'jiten' : 'jpdb');
}

function renderedWordCardId(card: JPDBCard, source = renderedWordCardSource(card)): number {
    return source === 'jiten' ? card.jitenWordId ?? card.vid : card.vid;
}

function renderedWordReadingIndex(card: JPDBCard, source = renderedWordCardSource(card)): number {
    return source === 'jiten' ? card.jitenReadingIndex ?? card.sid : card.sid;
}

function yieldToNextTask(): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, 0));
}
