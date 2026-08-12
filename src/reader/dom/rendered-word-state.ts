import type { JPDBCard, JPDBToken } from '../app/types';
import { cardDeckMembership, cardDeckMembershipClassNames } from '../cards/deck-membership';
import { primaryCardState } from '../cards/state';
import { pitchComponentUnderlineGradient } from '../lookup/pitch-components';
import { RENDERED_WORD_CONTRAST_VARS } from './rendered-word-contrast-vars';
import { isParticleCard } from './token-text-rendering';
import { currentAccountDataSurfaceIsTrusted } from '../app/account-data-surface';
import {
    renderedWordPrivateStateForCard,
    renderedWordPrivateValue,
    updateRenderedWordPrivateState,
} from './rendered-word-private-state';
import {
    renderedWordNumericIdentity,
    renderedWordProviderIdentity,
    renderedWordRecordedSpan,
} from './rendered-word-policy';

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
    const ankiState = renderedWordPrivateValue(word, 'ankiState');
    const cardState = renderedWordPrivateValue(word, 'cardState');
    clearOffhostProjectedAnkiState(word, ankiState, cardState);
    updateRenderedWordPrivateState(word, { ankiState: undefined, ankiDecks: undefined });
    RENDERED_WORD_CONTRAST_VARS.forEach(name => word.style.removeProperty(name));
    if (word.title.startsWith('Anki:')) word.removeAttribute('title');
}

function clearOffhostProjectedAnkiState(word: HTMLElement, ankiState: string | undefined, cardState: string | undefined): void {
    if (currentAccountDataSurfaceIsTrusted()) return;
    if (!ankiState || ankiState === cardState) return;
    word.classList.remove(`jpdb-${ankiState}`);
}

export function renderedWordHasAnkiState(word: HTMLElement): boolean {
    return Boolean(renderedWordPrivateValue(word, 'ankiState')
        || renderedWordPrivateValue(word, 'ankiDecks')
        || Array.from(word.classList).some(className => className.startsWith('anki-')));
}

export function renderedWordCardKey(vid: number, sid: number): string {
    return `${vid}:${sid}`;
}

export function renderedWordElementKey(word: HTMLElement): string {
    return renderedWordCardKey(
        Number(renderedWordPrivateValue(word, 'vid')),
        Number(renderedWordPrivateValue(word, 'sid')),
    );
}

export function isValidRenderedWordKey(key: string): boolean {
    const parts = key.split(':');
    return parts.length === 2
        && parts.every(part => part.trim() !== '' && Number.isFinite(Number(part)));
}

export function renderedWordSelectorForKey(key: string): string | null {
    if (!isValidRenderedWordKey(key)) return null;
    if (!currentAccountDataSurfaceIsTrusted()) return '.jpdb-reader-word[data-yomu-word="true"]';
    const parts = key.split(':').map(escapeCssAttributeValue);
    return `.jpdb-reader-word[data-vid="${parts[0]}"][data-sid="${parts[1]}"]`;
}

export function rootContainsRenderedWord(root: ParentNode, word: HTMLElement): boolean {
    return root === document
        || root === word
        || (root instanceof Node && root.contains(word));
}

export function renderedWordsInRoot(root: ParentNode): HTMLElement[] {
    const words = new Set<HTMLElement>();
    if (root instanceof HTMLElement && isRegisteredRenderedWord(root)) words.add(root);
    root.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-yomu-word="true"], .jpdb-reader-word[data-vid][data-sid]')
        .forEach(word => words.add(word));
    return [...words];
}

export async function* renderedWordsInRootChunked(root: ParentNode, chunkSize: number): AsyncGenerator<HTMLElement> {
    let yielded = 0;
    for (const word of registeredRenderedWordsInRoot(root)) {
        yield word;
        yielded += 1;
        if (yielded % chunkSize === 0) await yieldToNextTask();
    }
}

function* registeredRenderedWordsInRoot(root: ParentNode): Generator<HTMLElement> {
    if (root instanceof HTMLElement && isRegisteredRenderedWord(root)) yield root;
    const ownerDocument = renderedWordOwnerDocument(root);
    const walker = ownerDocument.createTreeWalker(root as Node, NodeFilter.SHOW_ELEMENT, {
        acceptNode: registeredRenderedWordNodeFilter,
    });
    let node = walker.nextNode();
    while (node) {
        yield node as HTMLElement;
        node = walker.nextNode();
    }
}

function renderedWordOwnerDocument(root: ParentNode): Document {
    return root instanceof Document ? root : root.ownerDocument ?? document;
}

function registeredRenderedWordNodeFilter(node: Node): number {
    return [node instanceof HTMLElement, node instanceof HTMLElement && isRegisteredRenderedWord(node)].every(Boolean)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
}

export function uniqueParentNodes(roots: ParentNode[]): ParentNode[] {
    return [...new Set(roots)];
}

export function renderedFallbackVocabularyCacheKey(word: HTMLElement): string {
    const { vid, sid } = renderedWordNumericIdentity(word);
    const spelling = word.dataset.expression?.trim() ?? '';
    const span = renderedWordRecordedSpan(word);
    if (![Number.isFinite(vid), Number.isFinite(sid), Boolean(spelling), Boolean(span)].every(Boolean)) return '';
    return fallbackVocabularySpanCacheKeyParts(vid, sid, spelling, '', span!.start, span!.end);
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
    const identity = renderedWordPrivateStateForCard(card, primaryCardState(card.cardState));
    updateRenderedWordPrivateState(word, {
        vid: identity.vid,
        sid: identity.sid,
        cardSource: identity.cardSource,
        cardId: identity.cardId,
        readingIndex: identity.readingIndex,
    });
    word.dataset.expression = card.spelling;
    word.dataset.reading = card.reading;
    applyRenderedWordPitchIdentity(word, card, options);
    applyRenderedWordCardStatus(word, card, options, true);
}

type RenderedWordPitchIdentityMode = 'clear' | 'particle' | 'card';

function applyRenderedWordPitchIdentity(
    word: HTMLElement,
    card: JPDBCard,
    options: RenderedWordCardIdentityOptions,
): void {
    const particle = isParticleCard(card);
    word.classList.toggle('jpdb-reader-particle', particle);
    const handlers: Record<RenderedWordPitchIdentityMode, () => void> = {
        clear: () => clearRenderedWordPitchIdentity(word, particle),
        particle: () => applyRenderedParticlePitchIdentity(word),
        card: () => applyRenderedCardPitchIdentity(word, card),
    };
    handlers[renderedWordPitchIdentityMode(options, particle)]();
}

function renderedWordPitchIdentityMode(
    options: RenderedWordCardIdentityOptions,
    particle: boolean,
): RenderedWordPitchIdentityMode {
    if (options.pitchPolicy === 'clear') return 'clear';
    return particle ? 'particle' : 'card';
}

function clearRenderedWordPitchIdentity(word: HTMLElement, particle: boolean): void {
    clearRenderedWordPitchMetadata(word, '');
    if (particle) clearRenderedWordMiningInsight(word);
}

// Public Jiten parse cards arrive without POS. A multi-character particle can
// therefore paint as an ordinary content word first; its later detail repaint
// must repair every derived invariant, not retain lexical pitch/i+1 state.
function applyRenderedParticlePitchIdentity(word: HTMLElement): void {
    clearRenderedWordPitchMetadata(word, 'particle');
    clearRenderedWordMiningInsight(word);
}

function clearRenderedWordPitchMetadata(word: HTMLElement, pitchClass: string): void {
    setRenderedWordPitchClass(word, pitchClass);
    delete word.dataset.pitchAccent;
    delete word.dataset.pitchComponents;
    word.style.removeProperty('--jpdb-reader-inline-pitch-gradient');
}

function applyRenderedCardPitchIdentity(word: HTMLElement, card: JPDBCard): void {
    if (!card.pitchAccent.length) delete word.dataset.pitchAccent;
    setRenderedWordPitchAccentPattern(word, card);
    setRenderedWordPitchComponents(word, card);
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
    projectRenderedWordCardIdentity(word, card, source, replaceCardIdentity);
    if (shouldPreserveAuthoritativeState(word, card, state, options)) return;
    clearRenderedWordCardStateClasses(word);
    updateRenderedWordPrivateState(word, { bunproState: undefined, srsProvider: undefined });
    clearRenderedWordDeckMembershipClasses(word, ['anki']);
    updateRenderedWordPrivateState(word, {
        cardState: state,
        stateProvenance: cardStateProvenance(card),
    });
    if (!RENDERED_WORD_MINING_INSIGHT_STATES.has(state)) clearRenderedWordMiningInsight(word);
    word.classList.add(`jpdb-${state}`);
    projectRenderedWordSourceStateClass(word, source, state);
    applyRenderedWordDeckMembership(word, card);
}

function projectRenderedWordCardIdentity(word: HTMLElement, card: JPDBCard, source: string, replace: boolean): void {
    if (!replace) return;
    updateRenderedWordPrivateState(word, {
        cardSource: source,
        cardId: String(renderedWordCardId(card, source)),
        readingIndex: String(renderedWordReadingIndex(card, source)),
    });
}

function projectRenderedWordSourceStateClass(word: HTMLElement, source: string, state: string): void {
    if (source === 'jpdb') return;
    if (!currentAccountDataSurfaceIsTrusted()) return;
    word.classList.add(`${source}-${state}`);
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
    const insightKeys = renderedMiningInsightKeys(renderedMiningSentenceCards(words));
    return words.filter(word => updateRenderedMiningInsight(word, insightKeys));
}

type RenderedMiningSentenceCards = Map<string, Map<string, { unknown: boolean }>>;

function renderedMiningSentenceCards(words: HTMLElement[]): RenderedMiningSentenceCards {
    const sentenceCards: RenderedMiningSentenceCards = new Map();
    words.forEach(word => recordRenderedMiningCard(sentenceCards, word));
    return sentenceCards;
}

function recordRenderedMiningCard(sentenceCards: RenderedMiningSentenceCards, word: HTMLElement): void {
    const sentence = renderedMiningSentence(word);
    const identity = renderedMiningCardIdentity(word);
    if (![sentence, identity, !word.classList.contains('jpdb-reader-particle')].every(Boolean)) return;
    const cards = sentenceCards.get(sentence) ?? new Map<string, { unknown: boolean }>();
    sentenceCards.set(sentence, cards);
    if (!cards.has(identity)) cards.set(identity, { unknown: renderedMiningStateIsUnknown(word) });
}

function renderedMiningStateIsUnknown(word: HTMLElement): boolean {
    return RENDERED_WORD_MINING_INSIGHT_STATES.has(renderedWordPrivateValue(word, 'cardState') ?? '');
}

function renderedMiningInsightKeys(sentenceCards: RenderedMiningSentenceCards): Set<string> {
    const insightKeys = new Set<string>();
    sentenceCards.forEach((cards, sentence) => {
        const unknown = [...cards.entries()].filter(([, state]) => state.unknown);
        if ([cards.size >= 3, unknown.length === 1].every(Boolean)) {
            insightKeys.add(`${sentence}\u0000${unknown[0]?.[0] ?? ''}`);
        }
    });
    return insightKeys;
}

function updateRenderedMiningInsight(word: HTMLElement, insightKeys: Set<string>): boolean {
    const sentence = renderedMiningSentence(word);
    const identity = renderedMiningCardIdentity(word);
    const insight = [
        Boolean(sentence),
        Boolean(identity),
        !word.classList.contains('jpdb-reader-particle'),
        insightKeys.has(`${sentence}\u0000${identity}`),
    ].every(Boolean);
    const unchanged = [
        word.classList.contains('jpdb-reader-i-plus-one') === insight,
        (word.dataset.miningInsight === 'i-plus-one') === insight,
    ].every(Boolean);
    if (unchanged) return false;
    word.classList.toggle('jpdb-reader-i-plus-one', insight);
    if (insight) word.dataset.miningInsight = 'i-plus-one';
    else delete word.dataset.miningInsight;
    return true;
}

function renderedMiningSentence(word: HTMLElement): string {
    return (word.dataset.sentence ?? '').replace(/\s+/g, ' ').trim();
}

function renderedMiningCardIdentity(word: HTMLElement): string {
    return renderedWordProviderIdentity(word);
}

/** Repaints only the SRS status channel, preserving the dictionary card identity. */
export function applyLocalYomuSrsStateToRenderedWord(word: HTMLElement, card: JPDBCard): boolean {
    const state = primaryCardState(card.cardState);
    const expectedStateClasses = new Set([
        `jpdb-${state}`,
        currentAccountDataSurfaceIsTrusted() ? `yomu-local-${state}` : '',
    ].filter(Boolean));
    if (!localYomuSrsWordNeedsUpdate(word, state, expectedStateClasses)) return false;
    clearRenderedWordCardStateClasses(word);
    updateRenderedWordPrivateState(word, {
        bunproState: undefined,
        bunproPrefillState: undefined,
        bunproPrefillProvenance: undefined,
        cardState: state,
        srsProvider: 'yomu-local',
        stateProvenance: 'authoritative',
    });
    word.classList.add(`jpdb-${state}`);
    addTrustedLocalYomuStateClass(word, state);
    clearRenderedMiningInsightForKnownState(word, state);
    return true;
}

function localYomuSrsWordNeedsUpdate(word: HTMLElement, state: string, expectedClasses: Set<string>): boolean {
    return [
        renderedWordPrivateValue(word, 'cardState') !== state,
        renderedWordPrivateValue(word, 'srsProvider') !== 'yomu-local',
        renderedWordPrivateValue(word, 'stateProvenance') !== 'authoritative',
        renderedWordPrivateValue(word, 'bunproState') !== undefined,
        renderedWordPrivateValue(word, 'bunproPrefillState') !== undefined,
        renderedWordPrivateValue(word, 'bunproPrefillProvenance') !== undefined,
        [...expectedClasses].some(className => !word.classList.contains(className)),
        Array.from(word.classList).some(className => (
            isRenderedWordCardStateClass(className) && !expectedClasses.has(className)
        )),
        renderedMiningInsightIsStale(word, state),
    ].some(Boolean);
}

function renderedMiningInsightIsStale(word: HTMLElement, state: string): boolean {
    return [
        !RENDERED_WORD_MINING_INSIGHT_STATES.has(state),
        [word.classList.contains('jpdb-reader-i-plus-one'), word.dataset.miningInsight !== undefined].some(Boolean),
    ].every(Boolean);
}

function addTrustedLocalYomuStateClass(word: HTMLElement, state: string): void {
    if (currentAccountDataSurfaceIsTrusted()) word.classList.add(`yomu-local-${state}`);
}

function clearRenderedMiningInsightForKnownState(word: HTMLElement, state: string): void {
    if (!RENDERED_WORD_MINING_INSIGHT_STATES.has(state)) clearRenderedWordMiningInsight(word);
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
    return [
        options.statePolicy !== 'replace',
        cardStateProvenance(card) === 'provisional',
        incomingState === 'not-in-deck',
        renderedWordPrivateValue(word, 'stateProvenance') === 'authoritative',
        Boolean(renderedWordPrivateValue(word, 'cardState')),
    ].every(Boolean);
}

/**
 * Colours a rendered word from the user's Bunpro SRS state, reusing the same
 * `jpdb-<state>` visual tiers jpdb/jiten words render with (plus a
 * `bunpro-<state>` marker). Only fills words whose parse provider reported no
 * state, so real jpdb/jiten card states always win. Returns true when the
 * word's classes changed.
 */
export function applyBunproStateToRenderedWord(word: HTMLElement, state: string | null): boolean {
    const previous = renderedWordPrivateValue(word, 'bunproState') ?? '';
    const mode = bunproStateTransitionMode(word, previous, state);
    const handlers: Record<BunproStateTransitionMode, () => boolean> = {
        ignore: () => false,
        clear: () => {
            clearRenderedWordBunproState(word);
            return true;
        },
        apply: () => applyNewBunproState(word, previous, String(state)),
    };
    return handlers[mode]();
}

type BunproStateTransitionMode = 'ignore' | 'clear' | 'apply';

function bunproStateTransitionMode(
    word: HTMLElement,
    previous: string,
    state: string | null,
): BunproStateTransitionMode {
    const fillable = BUNPRO_FILLABLE_CARD_STATES.has(renderedWordPrivateText(word, 'cardState'));
    const transitions: Array<[boolean, BunproStateTransitionMode]> = [
        [[!previous, !fillable].every(Boolean), 'ignore'],
        [[!state, !previous].every(Boolean), 'ignore'],
        [!state, 'clear'],
        [previous === state, 'ignore'],
        [true, 'apply'],
    ];
    return transitions.find(([matches]) => matches)![1];
}

function applyNewBunproState(word: HTMLElement, previous: string, state: string): true {
    if (previous) word.classList.remove(`jpdb-${previous}`, `bunpro-${previous}`);
    else captureBunproPrefillState(word);
    const source = renderedWordPrivateValue(word, 'cardSource') ?? 'jpdb';
    word.classList.remove('jpdb-not-in-deck', `${source}-not-in-deck`);
    word.classList.add(`jpdb-${state}`);
    if (currentAccountDataSurfaceIsTrusted()) word.classList.add(`bunpro-${state}`);
    // A Bunpro fill is the user's authenticated SRS state: mark it authoritative
    // so a later provisional public repaint cannot downgrade it, and so the
    // known-state backfill never re-requests it.
    updateRenderedWordPrivateState(word, {
        cardState: state,
        bunproState: state,
        stateProvenance: 'authoritative',
    });
    return true;
}

function captureBunproPrefillState(word: HTMLElement): void {
    updateRenderedWordPrivateState(word, {
        bunproPrefillState: renderedWordPrivateValue(word, 'cardState') ?? '',
        bunproPrefillProvenance: renderedWordPrivateValue(word, 'stateProvenance') ?? '',
    });
}

function clearRenderedWordBunproState(word: HTMLElement): void {
    const previous = renderedWordPrivateText(word, 'bunproState');
    removeRenderedBunproStateClasses(word, previous);
    // Restore the provider state captured before Bunpro filled the word — a
    // word the provider had no opinion on must go back to blank, not invent
    // a not-in-deck verdict.
    const prefill = renderedWordPrivateText(word, 'bunproPrefillState', 'not-in-deck');
    // The pre-fill state was only ever '' or not-in-deck (BUNPRO_FILLABLE), i.e.
    // provisional; restore that provenance so the word rejoins the backfill pool
    // and cannot masquerade as an authenticated verdict.
    const prefillProvenance = renderedWordPrivateText(word, 'bunproPrefillProvenance');
    const restored = prefill;
    updateRenderedWordPrivateState(word, {
        bunproState: undefined,
        bunproPrefillState: undefined,
        bunproPrefillProvenance: undefined,
        stateProvenance: undefinedIfEmpty(prefillProvenance),
        cardState: undefinedIfEmpty(restored),
    });
    restoreRenderedProviderStateClasses(word, restored);
}

function renderedWordPrivateText(
    word: HTMLElement,
    key: Parameters<typeof renderedWordPrivateValue>[1],
    fallback = '',
): string {
    return renderedWordPrivateValue(word, key) ?? fallback;
}

function undefinedIfEmpty(value: string): string | undefined {
    return value ? value : undefined;
}

function removeRenderedBunproStateClasses(word: HTMLElement, previous: string): void {
    if (previous) word.classList.remove(`jpdb-${previous}`, `bunpro-${previous}`);
}

function restoreRenderedProviderStateClasses(word: HTMLElement, restored: string): void {
    if (!restored) return;
    const source = renderedWordPrivateValue(word, 'cardSource') ?? 'jpdb';
    word.classList.add(`jpdb-${restored}`);
    addTrustedProviderStateClass(word, source, restored);
}

function addTrustedProviderStateClass(word: HTMLElement, source: string, state: string): void {
    if ([currentAccountDataSurfaceIsTrusted(), source !== 'jpdb'].every(Boolean)) {
        word.classList.add(`${source}-${state}`);
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
        clearRenderedWordDeckMembership(word);
        return;
    }
    word.classList.add(...cardDeckMembershipClassNames(card));
    projectRenderedWordDeckMembership(word, membership);
}

function clearRenderedWordDeckMembership(word: HTMLElement): void {
    if (word.classList.contains('anki-deck-member')) return;
    word.classList.remove('yomu-deck-member');
    clearRenderedWordDeckDataset(word);
}

function projectRenderedWordDeckMembership(word: HTMLElement, membership: ReturnType<typeof cardDeckMembership>): void {
    if (!currentAccountDataSurfaceIsTrusted()) {
        clearRenderedWordDeckDataset(word);
        return;
    }
    word.dataset.deckMember = 'true';
    word.dataset.deckSource = membership.source;
    if (membership.names.length) word.dataset.deckNames = membership.names.join(', ');
    else delete word.dataset.deckNames;
}

function clearRenderedWordDeckDataset(word: HTMLElement): void {
    delete word.dataset.deckMember;
    delete word.dataset.deckSource;
    delete word.dataset.deckNames;
}

function isRegisteredRenderedWord(element: HTMLElement): boolean {
    return element.matches('.jpdb-reader-word[data-yomu-word="true"], .jpdb-reader-word[data-vid][data-sid]');
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
