import type { JPDBCard, JPDBToken } from '../app/types';
import { cardDeckMembership, cardDeckMembershipClassNames } from '../cards/deck-membership';
import { primaryCardState } from '../cards/state';
import { pitchComponentUnderlineGradient } from '../lookup/pitch-components';
import { RENDERED_WORD_CONTRAST_VARS } from './rendered-word-contrast-vars';
import { isParticleCard } from './token-text-rendering';

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
const RENDERED_WORD_CARD_STATE_PREFIXES = ['jpdb', 'jiten', 'local', 'fallback', 'bunpro', 'yomu-local'];
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
    const start = Number(word.dataset.tokenStart);
    const end = Number(word.dataset.tokenEnd);
    return Number.isFinite(vid) && Number.isFinite(sid) && spelling
        && Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start
        ? fallbackVocabularySpanCacheKeyParts(vid, sid, spelling, '', start, end)
        : '';
}

export function fallbackVocabularySpanCacheKey(
    card: Pick<JPDBCard, 'vid' | 'sid' | 'spelling' | 'reading'>,
    span: Pick<JPDBToken, 'start' | 'end'>,
): string {
    return fallbackVocabularySpanCacheKeyParts(card.vid, card.sid, card.spelling, card.reading, span.start, span.end);
}

function fallbackVocabularySpanCacheKeyParts(
    vid: number,
    sid: number,
    spelling: string,
    reading: string,
    start: number,
    end: number,
): string {
    return `${vid}:${sid}:${spelling}:${reading}:${start}:${end}`;
}

export function setRenderedWordPitchClass(word: HTMLElement, pitchClass: string): void {
    Array.from(word.classList)
        .filter(className => className.startsWith('jpdb-pitch-'))
        .forEach(className => word.classList.remove(className));
    word.dataset.pitchClass = pitchClass;
    if (pitchClass) word.classList.add(`jpdb-pitch-${pitchClass}`);
}

// A pitch class must never be painted without the pattern that produced it:
// popups and tests read data-pitch-accent, and the in-place enrichment repaint
// used to update only the class, leaving the two permanently disagreeing.
export function setRenderedWordPitchAccentPattern(word: HTMLElement, card: JPDBCard): void {
    const pitchAccent = card.pitchAccent.join('|');
    if (pitchAccent) word.dataset.pitchAccent = pitchAccent;
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

// Does a rendered word's SRS state come from an authenticated known-state
// source? Stamped alongside dataset.cardState so a repaint can decide whether
// the incoming card is allowed to change the status channel.
export type RenderedWordStateProvenance = 'authoritative' | 'provisional';

export interface RenderedWordCardIdentityOptions {
    // Merge policy for the SRS-status channel (state classes +
    // dataset.cardState + deck membership). Identity
    // (vid/sid/reading/expression/pitch) always updates so late
    // pitch/furigana lands regardless.
    //   'auto' (default): derive from the card. A PROVISIONAL card (public/
    //     keyless jiten, local, segmented — always a default not-in-deck) must
    //     NOT overwrite a word that already carries an AUTHORITATIVE state:
    //     the public/pitch hydration cascade repaints with a card that never
    //     carries authenticated SRS state, and the old unconditional clear+stamp
    //     silently downgraded a jpdb-known/jiten-learning word to not-in-deck
    //     the instant pitch enrichment landed ("pitch appears, status vanishes").
    //   'replace': force the incoming state to win in both directions — used by
    //     authenticated refreshes (refreshCardStates, review updates, the
    //     known-state backfill) that legitimately move a word up OR down.
    statePolicy?: 'auto' | 'replace';
    // Canonical identity is also needed by nonvisual consumers (Anki,
    // Academy SRS, Bunpro and guarded audio). Those paths must not leak pitch
    // metadata/classes into the page when pitch display is disabled.
    pitchPolicy?: 'replace' | 'clear';
}

export function cardStateProvenance(card: JPDBCard): RenderedWordStateProvenance {
    return card.provisionalState === true ? 'provisional' : 'authoritative';
}

export function setRenderedWordCardIdentity(
    word: HTMLElement,
    card: JPDBCard,
    options: RenderedWordCardIdentityOptions = {},
): void {
    // Identity/pitch always refresh: preserving the status channel must not
    // block the late reading + pitch the repaint was scheduled to deliver.
    word.dataset.vid = String(card.vid);
    word.dataset.sid = String(card.sid);
    word.dataset.expression = card.spelling;
    word.dataset.reading = card.reading;
    const particle = isParticleCard(card);
    word.classList.toggle('jpdb-reader-particle', particle);
    if (options.pitchPolicy === 'clear') {
        setRenderedWordPitchClass(word, '');
        delete word.dataset.pitchAccent;
        delete word.dataset.pitchComponents;
        word.style.removeProperty('--jpdb-reader-inline-pitch-gradient');
        if (particle) clearRenderedWordMiningInsight(word);
    } else if (particle) {
        // Public Jiten parse cards arrive without POS. A multi-character
        // particle can therefore paint as an ordinary content word first; its
        // later detail repaint must repair every derived particle invariant,
        // not retain a lexical pitch/i+1 state from the sparse card.
        setRenderedWordPitchClass(word, 'particle');
        delete word.dataset.pitchAccent;
        delete word.dataset.pitchComponents;
        word.style.removeProperty('--jpdb-reader-inline-pitch-gradient');
        clearRenderedWordMiningInsight(word);
    } else {
        if (!card.pitchAccent.length) delete word.dataset.pitchAccent;
        setRenderedWordPitchAccentPattern(word, card);
        setRenderedWordPitchComponents(word, card);
    }
    applyRenderedWordCardStatus(word, card, options, true);
}

/**
 * Repaint only the provider state/deck channel. This lets a sparse parse update
 * current SRS facts without replacing the dictionary identity, reading, or
 * pitch annotation retained by the rendered word.
 */
export function setRenderedWordCardStatus(
    word: HTMLElement,
    card: JPDBCard,
    options: RenderedWordCardIdentityOptions = {},
): void {
    applyRenderedWordCardStatus(word, card, options, false);
}

function applyRenderedWordCardStatus(
    word: HTMLElement,
    card: JPDBCard,
    options: RenderedWordCardIdentityOptions,
    replaceCardIdentity: boolean,
): void {
    const source = renderedWordCardSource(card);
    const state = primaryCardState(card.cardState);
    // These fields belong to dictionary identity, not to the SRS-status
    // channel. Even when a provisional public card is prevented from
    // downgrading an authoritative state, its canonical provider identity must
    // replace the sparse/fallback identity alongside vid/sid/reading above.
    if (replaceCardIdentity) {
        word.dataset.cardSource = source;
        word.dataset.cardId = String(renderedWordCardId(card, source));
        word.dataset.readingIndex = String(renderedWordReadingIndex(card, source));
    }
    if (shouldPreserveAuthoritativeState(word, card, state, options)) return;
    clearRenderedWordCardStateClasses(word);
    delete word.dataset.bunproState;
    delete word.dataset.srsProvider;
    clearRenderedWordDeckMembershipClasses(word, ['anki']);
    word.dataset.cardState = state;
    word.dataset.stateProvenance = cardStateProvenance(card);
    if (!RENDERED_WORD_MINING_INSIGHT_STATES.has(state)) clearRenderedWordMiningInsight(word);
    word.classList.add(`jpdb-${state}`);
    if (source !== 'jpdb') word.classList.add(`${source}-${state}`);
    applyRenderedWordDeckMembership(word, card);
}

/**
 * Rebuilds sentence-level i+1 markers from the state Yomu actually painted.
 *
 * Late public-detail hydration can change provider identity, POS (especially
 * multi-character particles), and state after the parser's original token
 * batch is gone. The rendered metadata is therefore the authoritative input
 * for this repaint; consulting parser caches here both misses fallback-to-
 * canonical transitions and turns a small DOM repair into repeated cache
 * reconstruction for every resolved card.
 */
export function refreshRenderedMiningInsights(root: ParentNode): HTMLElement[] {
    const words = renderedWordsInRoot(root);
    const sentenceCards = new Map<string, Map<string, { unknown: boolean }>>();
    for (const word of words) {
        const sentence = renderedMiningSentence(word);
        const identity = renderedMiningCardIdentity(word);
        if (!sentence || !identity || word.classList.contains('jpdb-reader-particle')) continue;
        const cards = sentenceCards.get(sentence) ?? new Map<string, { unknown: boolean }>();
        if (!sentenceCards.has(sentence)) sentenceCards.set(sentence, cards);
        if (!cards.has(identity)) {
            cards.set(identity, { unknown: RENDERED_WORD_MINING_INSIGHT_STATES.has(word.dataset.cardState ?? '') });
        }
    }

    const insightKeys = new Set<string>();
    sentenceCards.forEach((cards, sentence) => {
        if (cards.size < 3) return;
        const unknown = [...cards.entries()].filter(([, state]) => state.unknown);
        if (unknown.length === 1) insightKeys.add(`${sentence}\u0000${unknown[0]?.[0] ?? ''}`);
    });

    const changed: HTMLElement[] = [];
    for (const word of words) {
        const sentence = renderedMiningSentence(word);
        const identity = renderedMiningCardIdentity(word);
        const insight = Boolean(
            sentence
            && identity
            && !word.classList.contains('jpdb-reader-particle')
            && insightKeys.has(`${sentence}\u0000${identity}`),
        );
        const hasClass = word.classList.contains('jpdb-reader-i-plus-one');
        const hasDataset = word.dataset.miningInsight === 'i-plus-one';
        if (hasClass === insight && hasDataset === insight) continue;
        word.classList.toggle('jpdb-reader-i-plus-one', insight);
        if (insight) word.dataset.miningInsight = 'i-plus-one';
        else delete word.dataset.miningInsight;
        changed.push(word);
    }
    return changed;
}

function renderedMiningSentence(word: HTMLElement): string {
    return (word.dataset.sentence ?? '').replace(/\s+/g, ' ').trim();
}

function renderedMiningCardIdentity(word: HTMLElement): string {
    const source = word.dataset.cardSource?.trim();
    const cardId = word.dataset.cardId?.trim();
    const readingIndex = word.dataset.readingIndex?.trim();
    if (source && cardId && readingIndex) return `${source}:${cardId}/${readingIndex}`;
    const vid = word.dataset.vid?.trim();
    const sid = word.dataset.sid?.trim();
    return vid && sid ? `${vid}:${sid}` : '';
}

/** Repaints only the SRS status channel, preserving the dictionary card identity. */
export function applyLocalYomuSrsStateToRenderedWord(word: HTMLElement, card: JPDBCard): boolean {
    const state = primaryCardState(card.cardState);
    const expectedStateClasses = new Set([`jpdb-${state}`, `yomu-local-${state}`]);
    const changed = word.dataset.cardState !== state
        || word.dataset.srsProvider !== 'yomu-local'
        || word.dataset.stateProvenance !== 'authoritative'
        || word.dataset.bunproState !== undefined
        || word.dataset.bunproPrefillState !== undefined
        || word.dataset.bunproPrefillProvenance !== undefined
        || [...expectedStateClasses].some(className => !word.classList.contains(className))
        || Array.from(word.classList).some(className => (
            isRenderedWordCardStateClass(className) && !expectedStateClasses.has(className)
        ))
        || (!RENDERED_WORD_MINING_INSIGHT_STATES.has(state) && (
            word.classList.contains('jpdb-reader-i-plus-one')
            || word.dataset.miningInsight !== undefined
        ));
    if (!changed) return false;
    clearRenderedWordCardStateClasses(word);
    delete word.dataset.bunproState;
    delete word.dataset.bunproPrefillState;
    delete word.dataset.bunproPrefillProvenance;
    word.dataset.cardState = state;
    word.dataset.srsProvider = 'yomu-local';
    word.dataset.stateProvenance = 'authoritative';
    word.classList.add(`jpdb-${state}`, `yomu-local-${state}`);
    if (!RENDERED_WORD_MINING_INSIGHT_STATES.has(state)) clearRenderedWordMiningInsight(word);
    return true;
}

// The preserve guard fires only for the exact downgrade the public/pitch lane
// causes: an unforced repaint whose incoming card is a provisional default
// not-in-deck landing on a word that already carries an authoritative state.
// Authenticated cards (provenance authoritative), non-default incoming states,
// words with no prior authoritative state, and explicit 'replace' callers all
// take the normal full-replace path so real state changes still apply.
function shouldPreserveAuthoritativeState(
    word: HTMLElement,
    card: JPDBCard,
    incomingState: string,
    options: RenderedWordCardIdentityOptions,
): boolean {
    return options.statePolicy !== 'replace'
        && cardStateProvenance(card) === 'provisional'
        && incomingState === 'not-in-deck'
        && word.dataset.stateProvenance === 'authoritative'
        && Boolean(word.dataset.cardState);
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
    else {
        word.dataset.bunproPrefillState = word.dataset.cardState ?? '';
        word.dataset.bunproPrefillProvenance = word.dataset.stateProvenance ?? '';
    }
    const source = word.dataset.cardSource ?? 'jpdb';
    word.classList.remove('jpdb-not-in-deck', `${source}-not-in-deck`);
    word.classList.add(`jpdb-${state}`, `bunpro-${state}`);
    word.dataset.cardState = state;
    word.dataset.bunproState = state;
    // A Bunpro fill is the user's authenticated SRS state: mark it authoritative
    // so a later provisional public repaint cannot downgrade it, and so the
    // known-state backfill never re-requests it.
    word.dataset.stateProvenance = 'authoritative';
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
    // The pre-fill state was only ever '' or not-in-deck (BUNPRO_FILLABLE), i.e.
    // provisional; restore that provenance so the word rejoins the backfill pool
    // and cannot masquerade as an authenticated verdict.
    const prefillProvenance = word.dataset.bunproPrefillProvenance;
    delete word.dataset.bunproPrefillProvenance;
    if (prefillProvenance) word.dataset.stateProvenance = prefillProvenance;
    else delete word.dataset.stateProvenance;
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
