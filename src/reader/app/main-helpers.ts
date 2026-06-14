import type { AnkiLookupResult } from '../anki/index';
import { normalizeCardStates } from '../cards/state';
import { collectVisibleTextTargets, readerWordSurfaceText } from '../dom/index';
import type { JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import type { JitenKanjiInfo } from '../dictionaries/jiten';
import type { KanjiVGInfo } from '../kanji/vg';
import { normalizedLookupText } from '../lookup/text-helpers';
import type { ActivePointerTextLookup, PointerTextLookup } from '../lookup/pointer-text-lookup';
import type { CardNavigationMode, PopupNavigationEntry } from '../popup/navigation';
import type { RtkInfo } from '../kanji/rtk';
import { matchesShortcut } from '../settings/index';
import { collectSiteScanTargets } from './site-parsers';
import type { JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import type { YomitanKanjiEntry, YomitanTermEntry } from '../dictionaries/yomitan';

export const TERM_AUDIO_PRELOAD_LIMIT = 4;
export const NEARBY_TERM_AUDIO_PRELOAD_LIMIT = 3;
export const NEARBY_TERM_AUDIO_PRELOAD_DELAY_MS = 350;
export const PRELOADED_TERM_AUDIO_KEY_LIMIT = 500;
export const FALLBACK_LOOKUP_INITIAL_WAIT_MS = 180;
export const TEXT_LOOKUP_JPDB_TIMEOUT_MS = 650;
export const POINTER_TEXT_JPDB_TIMEOUT_MS = 450;
export const RENDERED_KANA_EXPANSION_EXACT_MATCH_WAIT_MS = 450;
export const HOVER_ANKI_HYDRATION_DELAY_MS = 180;
export const PITCH_ENRICHMENT_LIMIT = 12;
export const PITCH_ENRICHMENT_QUEUE_LIMIT = 240;
export const BACKGROUND_PUBLIC_PITCH_ENRICHMENT_LIMIT = 24;
export const NESTED_PUBLIC_PITCH_ENRICHMENT_LIMIT = 3;
export const NESTED_PARSE_CONTENT_CACHE_TTL_MS = 30_000;
export const NESTED_PARSE_CONTENT_CACHE_LIMIT = 160;
export const PITCH_LOCAL_META_LIMIT = 12;
export const PITCH_ENRICHMENT_LOCAL_CACHE_LIMIT = 800;
export const RESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT = 800;
// DOM strategy threshold only: small updates use exact selectors, larger updates may build a rendered-word index.
// This is not an Anki cache/card cap.
export const ANKI_TARGETED_RENDERED_WORD_SELECTOR_THRESHOLD = 24;
// Public jpdb pitch lookups are independent per-term HTTP fetches; four in
// flight keeps keyless subtitle batches from trickling in pair-by-pair while
// staying below jpdb.io's burst-throttling threshold (it TLS-resets hammers).
export const BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY = 4;
// Local-only pitch lookups are IndexedDB-bound (no network): a wider lane
// clears the cold-start backlog quickly instead of trickling 2 at a time.
export const LOCAL_PITCH_ENRICHMENT_CONCURRENCY = 8;
export const SUBTITLE_SURFACE_SELECTOR = '.jpdb-subtitle-player, .jpdb-subtitle-list';
export const KANA_ONLY_LOOKUP_RUN_RE = /^[\u3040-\u30ffー]+$/u;
export const ANKI_RECOLOR_SCAN_CHUNK_SIZE = 600;

type ReviewShortcutKey = keyof ReaderSettings['shortcuts'];

export const TWO_BUTTON_REVIEW_SHORTCUTS: Array<[ReviewShortcutKey, JPDBGrade]> = [
    ['gradeFail', 'fail'],
    ['gradePass', 'pass'],
];

export const FIVE_BUTTON_REVIEW_SHORTCUTS: Array<[ReviewShortcutKey, JPDBGrade]> = [
    ['gradeNothing', 'nothing'],
    ['gradeSomething', 'something'],
    ['gradeHard', 'hard'],
    ['gradeOkay', 'okay'],
    ['gradeEasy', 'easy'],
];

const JPDB_REVIEW_BLOCKING_STATES = new Set(['blacklisted', 'never-forget', 'locked']);

export function matchedReviewShortcutGrade(
    event: KeyboardEvent,
    shortcuts: ReaderSettings['shortcuts'],
    candidates: Array<[ReviewShortcutKey, JPDBGrade]>,
): JPDBGrade | null {
    return candidates.find(([key]) => matchesShortcut(event, shortcuts[key]))?.[1] ?? null;
}

export function hasBlockedJpdbReviewState(states: ReturnType<typeof normalizeCardStates>): boolean {
    return states.some(state => JPDB_REVIEW_BLOCKING_STATES.has(state));
}

export function pickExactTokenForSelection(tokens: JPDBToken[] = [], selected: string): JPDBToken | undefined {
    return tokens.find(token => token.card.spelling === selected || token.card.reading === selected);
}

export function dictionaryLookupLink(target: EventTarget | null): HTMLAnchorElement | null {
    return (target as HTMLElement | null)?.closest?.<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]') ?? null;
}

export function dictionaryLookupQuery(link: HTMLAnchorElement): string {
    return normalizedLookupText(link.dataset.dictionaryLookup ?? '');
}

export function dictionaryLookupNestedWord(target: EventTarget | null, link: HTMLAnchorElement): HTMLElement | null {
    const word = (target as HTMLElement | null)?.closest?.<HTMLElement>('.jpdb-reader-word[data-vid][data-sid]') ?? null;
    return word && link.contains(word) ? word : null;
}

export function dictionaryLookupWordMatchesLink(word: HTMLElement, query: string): boolean {
    return Boolean(query && normalizedLookupText(word.dataset.expression || readerWordSurfaceText(word)) === query);
}

export function connectedElement<T extends HTMLElement>(element: T | undefined): T | undefined {
    return element?.isConnected ? element : undefined;
}

export function hasVisibleAutoScanTargets(): boolean {
    return hasVisibleSiteScanTargets() || (allowsGenericVisibleAutoScan() && collectVisibleTextTargets(1).length > 0);
}

export function hasVisibleSiteScanTargets(): boolean {
    return (collectSiteScanTargets(1)?.length ?? 0) > 0;
}

export function allowsGenericVisibleAutoScan(): boolean {
    return !isYouTubeHostForAutoScan();
}

export function allowsFrequentVisibleAutoScan(): boolean {
    // YouTube still opts out of the generic visible-text fallback above, but
    // its site parser is narrow enough to rescan on mutations/scroll. Keeping
    // frequent scans enabled is what makes homepage/feed titles annotate as
    // cards stream in instead of waiting for a manual scan or one capped pass.
    return true;
}

export function visibleAutoScanMutationDelay(defaultDelay = 450): number {
    return isYouTubeHostForAutoScan() ? 120 : defaultDelay;
}

export function visibleAutoScanInitialDelay(defaultDelay = 600): number {
    return isYouTubeHostForAutoScan() ? 160 : defaultDelay;
}

export function isYouTubeHostForAutoScan(hostname = location.hostname): boolean {
    return hostname === 'youtu.be' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
}

export function hasPressLookupEnabled(settings: ReaderSettings): boolean {
    return settings.lookupOnClick || settings.lookupOnHover;
}

export function isMousePointerEvent(event: MouseEvent | PointerEvent): boolean {
    return !('pointerType' in event) || event.pointerType === 'mouse';
}

export function eventElement(event: Event): Element | null {
    return event.target instanceof Element ? event.target : null;
}

export interface ReaderAudioPreloadOptions {
    sourceLimit?: number;
    candidateLimit?: number;
    prepareAudio?: boolean;
}

export function audioPreloadLimits(options: ReaderAudioPreloadOptions): ReaderAudioPreloadOptions {
    return {
        sourceLimit: options.sourceLimit ?? 1,
        candidateLimit: options.candidateLimit ?? 1,
        prepareAudio: options.prepareAudio,
    };
}

// Bounded insertion-ordered cache eviction shared by the Map- and Set-backed reader caches.
// Both Map.keys() and Set.keys() yield entries in insertion order, so the oldest survivor is always first.
export function evictOldestStringKeysWhileOverLimit(cache: { size: number; keys(): IterableIterator<string>; delete(key: string): unknown }, limit: number): void {
    while (cache.size > limit) {
        const oldest = cache.keys().next().value;
        if (typeof oldest !== 'string') break;
        cache.delete(oldest);
    }
}

export function ankiLookupHasDisplayableNotes(lookup: AnkiLookupResult): boolean {
    return Boolean(lookup.primary || lookup.notes.length);
}

export function shouldPauseVideoForSubtitleHover(word: HTMLElement, settings: ReaderSettings): boolean {
    return settings.subtitleMiningPause && Boolean(word.closest(SUBTITLE_SURFACE_SELECTOR));
}

export function cardDisplayTrigger(options: CardDisplayOptions): 'modal' | 'hover' {
    return options.trigger === 'hover' ? 'hover' : 'modal';
}

export function cardSourceLabel(card: JPDBCard): string {
    return card.source ?? 'jpdb';
}

export function renderedWordNavigationMode(insideReaderPopup: boolean, trigger: 'modal' | 'hover'): CardNavigationMode {
    return insideReaderPopup && trigger === 'modal' ? 'push-current' : 'reset';
}

export function renderedWordAnchor(
    word: HTMLElement,
    insideReaderPopup: boolean,
    activePopoverAnchor: HTMLElement | undefined,
): HTMLElement | undefined {
    return insideReaderPopup ? activePopoverAnchor ?? undefined : word;
}

export function selectionIntersectsElement(selection: Selection, element: HTMLElement): boolean {
    for (let index = 0; index < selection.rangeCount; index += 1) {
        try {
            if (selection.getRangeAt(index).intersectsNode(element)) return true;
        } catch {
            // Detached selection ranges can appear briefly while a page mutates.
        }
    }
    return false;
}

export function popoverAnchorRect(anchor: HTMLElement | undefined, fallback: DOMRect | undefined): DOMRect | undefined {
    const rect = anchor?.getBoundingClientRect();
    return rect && (rect.width > 0 || rect.height > 0) ? rect : fallback;
}

export function shouldLockMountedPopoverPosition(popover: HTMLElement, state: PopoverMountState): boolean {
    return state.mode !== 'hover'
        && !popover.classList.contains('jpdb-reader-sheet')
        && Boolean(state.previousPopoverRect);
}

export function mountedHoverPointerPosition(
    state: PopoverMountState,
    lastPointerPosition: { x: number; y: number } | undefined,
): { x: number; y: number } | undefined {
    const hoverPointerPosition = state.previousHoverPointerPosition ?? lastPointerPosition;
    return state.mode === 'hover' && hoverPointerPosition ? { ...hoverPointerPosition } : undefined;
}

export interface KanjiDetailPromises {
    jpdbInfo: Promise<JpdbKanjiInfo | null>;
    jitenInfo: Promise<JitenKanjiInfo | null>;
    kanjiEntries: Promise<YomitanKanjiEntry[]>;
    rtkInfo: Promise<RtkInfo | null>;
    kanjiVGInfo: Promise<KanjiVGInfo | null>;
}

export interface CardDisplayOptions {
    autoPlay?: boolean;
    trigger?: 'modal' | 'hover';
    navigation?: CardNavigationMode;
    preservePosition?: boolean;
    previousNavigationEntry?: PopupNavigationEntry;
    hoverLookupKey?: string;
    hoverLookupGeneration?: number;
    pointerTextLookup?: ActivePointerTextLookup;
    insideReaderPopup?: boolean;
    userGesture?: boolean;
    stackOverSettings?: boolean;
    skipInitialCardResolution?: boolean;
}

export type PointerTextDisplayOptions = Pick<CardDisplayOptions, 'navigation' | 'preservePosition' | 'hoverLookupGeneration' | 'userGesture'>;
export type PointerTextLookupOptions = { allowPassiveInteractionText?: boolean };
export type LocalPointerTextEntryMatch = { entry: YomitanTermEntry; start: number; end: number };
export const HOVER_POINTER_TEXT_LOOKUP_OPTIONS: PointerTextLookupOptions = { allowPassiveInteractionText: true };

export function canSchedulePointerTextHoverLookup(hoverEnabled: boolean, candidate: PointerTextLookup | null): candidate is PointerTextLookup {
    return hoverEnabled && Boolean(candidate);
}

export function samePointerTextLookupTarget(active: ActivePointerTextLookup, candidate: PointerTextLookup): boolean {
    return active.anchor === candidate.anchor && active.text === candidate.text;
}

export function pointerOffsetInsideLiveLookup(active: ActivePointerTextLookup, offset: number): boolean {
    return active.start <= offset && offset < active.end;
}

export interface RenderedWordDisplayContext {
    sentence?: string;
    anchor?: HTMLElement;
    trigger: 'modal' | 'hover';
    navigation: CardNavigationMode;
    hoverLookupKey?: string;
    previousNavigationEntry?: PopupNavigationEntry;
    insideReaderPopup: boolean;
}

export interface RenderedWordLookupOptions {
    trigger?: 'click' | 'hover';
    navigation?: CardNavigationMode;
    previousNavigationEntry?: PopupNavigationEntry;
    userGesture?: boolean;
    hoverLookupGeneration?: number;
    stackOverSettings?: boolean;
}

export interface TextLookupOptions {
    navigation?: CardNavigationMode;
    preservePosition?: boolean;
    previousNavigationEntry?: PopupNavigationEntry;
    anchor?: HTMLElement;
    insideReaderPopup?: boolean;
    userGesture?: boolean;
    trigger?: 'modal' | 'hover';
    hoverLookupGeneration?: number;
    stackOverSettings?: boolean;
    source?: TokenListSource;
}

export interface TextLookupDisplayContext {
    selected: string;
    anchor?: HTMLElement;
    trigger: 'modal' | 'hover';
    navigation: CardNavigationMode;
    preservePosition: boolean;
    previousNavigationEntry?: PopupNavigationEntry;
    insideReaderPopup?: boolean;
    userGesture?: boolean;
    hoverLookupGeneration?: number;
    stackOverSettings?: boolean;
    source?: TokenListSource;
}

export type TokenListSource = 'lookup' | 'selection';
export type TokenListOptions = Pick<CardDisplayOptions, 'trigger' | 'navigation' | 'preservePosition' | 'previousNavigationEntry' | 'stackOverSettings'> & {
    source?: TokenListSource;
};

export interface ReviewShortcutContext {
    grade: JPDBGrade;
    card: JPDBCard;
    sentence?: string;
    anchor?: HTMLElement;
    trigger: 'modal' | 'hover';
    ankiCardId: number | null;
}

export interface ReviewShortcutTarget {
    grade: JPDBGrade;
    card: JPDBCard;
}

export interface PressLookupState {
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
    source: 'primary' | 'middle';
    captureTarget?: Element;
    lastWord?: HTMLElement;
}

export interface MountedCardShell {
    instantLocalEntries: YomitanTermEntry[] | null;
    requestId: number;
}

export interface MountPopoverOptions {
    mode?: 'modal' | 'hover';
    preservePosition?: boolean;
    hoverLookupKey?: string;
    pointerTextLookup?: ActivePointerTextLookup;
    stackOverSettings?: boolean;
}

export interface SettingsDialogStack {
    form: HTMLElement;
    backdrop?: HTMLElement;
}

export interface DismissOptions {
    suppressHoverTarget?: boolean;
    preserveNavigation?: boolean;
    preserveHoverGeneration?: boolean;
    preserveKeyboardActive?: boolean;
    forceAll?: boolean;
}

export interface PopoverMountState {
    mode: 'modal' | 'hover';
    backdrop?: HTMLElement;
    mountParent?: HTMLElement;
    resolvedAnchor?: HTMLElement;
    anchorRect?: DOMRect;
    previousPopoverRect?: DOMRect;
    previousHoverPointerPosition?: { x: number; y: number };
}

export interface ReaderAppDestroyOptions {
    preservePageWords?: boolean;
}

export interface PitchEnrichmentOptions {
    urgent?: boolean;
    publicLookup?: boolean;
    publicLookupLimit?: number;
}

export interface NestedParseContentCacheEntry {
    expiresAt: number;
    promise: Promise<JPDBToken[][]>;
}
