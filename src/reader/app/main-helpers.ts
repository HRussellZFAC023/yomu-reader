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
import { openUrlInNewTab } from '../ui/browser';
import { rememberOverlaySourceRect } from '../ui/page-scale';
import { documentLooksLikeImageReadingPage } from './dom-helpers';
import { collectSiteScanTargets, isBookWalkerReaderPage } from './site-parsers';
import type { JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import type { YomitanKanjiEntry, YomitanTermEntry } from '../dictionaries/yomitan';
import { isYouTubeAppHostname } from './youtube-host';

export const TERM_AUDIO_PRELOAD_LIMIT = 4;
export const NEARBY_TERM_AUDIO_PRELOAD_LIMIT = 3;
export const NEARBY_TERM_AUDIO_PRELOAD_DELAY_MS = 350;
export const PRELOADED_TERM_AUDIO_KEY_LIMIT = 500;
export const FALLBACK_LOOKUP_INITIAL_WAIT_MS = 180;
export const TEXT_LOOKUP_JPDB_TIMEOUT_MS = 650;
export const POINTER_TEXT_JPDB_TIMEOUT_MS = 450;
export const HOVER_ANKI_HYDRATION_DELAY_MS = 180;
export const PITCH_ENRICHMENT_LIMIT = 12;
export const PITCH_ENRICHMENT_QUEUE_LIMIT = 240;
export const PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT = 6;
export const YOUTUBE_PUBLIC_PITCH_ENRICHMENT_LIMIT = 10;
export const YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_LIMIT = 6;
export const YOUTUBE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT = 10;
export const YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT = 6;
// Per-URL total public-lookup budget for keyless YouTube page words. Raised
// from 32/12 so low-priority chrome (masthead buttons, action bar, leaderboard,
// recommendation metadata) is not starved of furigana/pitch after the
// transcript/comments spend the budget first. Still finite + paced by
// BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY (4) and the deferred idle scheduler so
// it stays under jpdb.io's burst threshold. Full coverage of a dense page still
// wants local dictionaries or an API key (no public throttle).
export const YOUTUBE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET = 64;
export const YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET = 24;
export const DEFERRED_PUBLIC_PITCH_ENRICHMENT_CHUNK_SIZE = 4;
export const DEFERRED_PUBLIC_PITCH_ENRICHMENT_IDLE_TIMEOUT_MS = 350;
export const DEFERRED_PUBLIC_PITCH_HOVER_PAUSE_MS = 180;
// Per-URL ceiling on tokens routed into the paced deferred public-pitch lane
// (notably budget-denied YouTube comment words re-queued for a public retry).
// Bounds total public-pitch lookups per page so the deferred retry can never
// trickle unbounded requests to the public endpoints; the lane is additionally
// idle-gated + chunked, so it stays a gentle paced drain rather than a burst.
// 128 left the tail of dense feeds on the grey unknown-pitch underline.
export const DEFERRED_PUBLIC_PITCH_PER_URL_CAP = 256;
const NESTED_PUBLIC_PITCH_ENRICHMENT_LIMIT = 3;
export const NESTED_PARSE_CONTENT_CACHE_TTL_MS = 30_000;
export const NESTED_PARSE_CONTENT_CACHE_LIMIT = 160;
export const PITCH_LOCAL_META_LIMIT = 12;
export const LOCAL_PITCH_DICTIONARY_PRESENCE_TIMEOUT_MS = 500;
export const PITCH_ENRICHMENT_LOCAL_CACHE_LIMIT = 800;
export const RESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT = 800;
export const UNRESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT = 1_200;
// An unresolved public-vocabulary miss is only trusted for this long: misses
// caused by timeouts/backoff heal on the next scan instead of leaving page
// words permanently reading-less. Long enough that a genuinely unknown term
// is not re-fetched on every mutation-driven rescan.
export const UNRESOLVED_FALLBACK_VOCABULARY_RETRY_TTL_MS = 120_000;
// A missed card is re-fed to the paced deferred lane at most this many times
// before it is negative-cached (TTL above) — bounds the retry traffic on
// pages whose terms genuinely have no public entry.
export const PUBLIC_VOCABULARY_MISS_RETRY_LIMIT = 2;
// While the shared public-jiten backoff is active the deferred lane sleeps in
// these slices instead of consuming its queue into guaranteed misses.
export const DEFERRED_PUBLIC_PITCH_BACKOFF_WAIT_MS = 3_000;
// Per-page cap on surface re-resolution lookups for spans whose hydrated card
// cannot align with their own surface (chunk-context mis-tokenization).
export const MISALIGNED_PUBLIC_FURIGANA_RECOVERY_LIMIT = 24;
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
export const SUBTITLE_SURFACE_SELECTOR = [
    '.jpdb-subtitle-player',
    '.jpdb-subtitle-list',
    '.asbplayer-subtitles-container-bottom',
    '.asbplayer-offscreen',
    '.jpdb-reader-subtitle-surface',
].join(', ');
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

// Bunpro FSRS is a four-outcome surface. Reuse the learner's first four
// positional grade shortcuts so the default keys remain 1/2/3/4.
export const BUNPRO_FSRS_REVIEW_SHORTCUTS: Array<[ReviewShortcutKey, JPDBGrade]> = [
    ['gradeNothing', 'nothing'],
    ['gradeSomething', 'hard'],
    ['gradeHard', 'okay'],
    ['gradeOkay', 'easy'],
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

function actionPillLink(target: EventTarget | null): HTMLAnchorElement | null {
    return (target as HTMLElement | null)?.closest?.<HTMLAnchorElement>('a.jpdb-reader-action-pill[href]') ?? null;
}

function actionPillUrl(link: HTMLAnchorElement): string | null {
    try {
        const url = new URL(link.getAttribute('href') ?? '', location.href);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
}

export function handleReaderActionPillLink(
    event: MouseEvent,
    open: (url: string) => boolean = openUrlInNewTab,
): boolean {
    const link = actionPillLink(event.target);
    if (!link) return false;
    event.preventDefault();
    event.stopPropagation();
    const url = actionPillUrl(link);
    if (!url) return true;
    if (!open(url)) location.href = url;
    return true;
}

export function dictionaryLookupQuery(link: HTMLAnchorElement): string {
    return normalizedLookupText(link.dataset.dictionaryLookup ?? '');
}

export function dictionaryLookupNestedWord(target: EventTarget | null, link: HTMLAnchorElement): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const word = target.closest<HTMLElement>('.jpdb-reader-word');
    return word !== null && link.contains(word) ? word : null;
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
    // Canvas reader viewers have no page text worth scanning; storefront and
    // every other host — including YouTube — uses the generic visible-text
    // work detector. YouTube's parser still supplies priority roots, but it no
    // longer owns discovery of late/lazy page text.
    return !isBookWalkerReaderPage();
}

export function shouldAutoScanImageOcr(pageHasJapaneseText: boolean): boolean {
    // A native text layer describes the page's TEXT, not its images — sites
    // full of cover/banner art still deserve automatic image OCR. The
    // per-image gates (size, viewport proximity, per-page cap) bound the cost.
    return pageHasJapaneseText
        || documentLooksLikeImageReadingPage()
        || (isBookWalkerReaderPage() && Boolean(document.querySelector('canvas')));
}

/**
 * The shipped policy: every host gets frequent mutation/scroll scans, so dynamic
 * feeds annotate as content streams in instead of waiting for a manual scan.
 *
 * This is a POLICY CONSTANT, not a gate. It used to be called as a condition in
 * the observer callback, the scroll and resize listeners, the reveal-click
 * handler and the custom-element upgrade hook, where it read as a host check
 * that could fail and never could. Those call sites are gone; what remains is
 * the injectable default of throttledAutoScanDelay, whose non-frequent branch is
 * exercised as a pure-function contract.
 */
export function allowsFrequentVisibleAutoScan(): boolean {
    return true;
}

export function isYouTubeHostname(hostname = location.hostname): boolean {
    return isYouTubeAppHostname(hostname);
}

// Every host gets the budget tier that was proven on YouTube: a paced batch
// window, a finite per-URL budget, and the idle-gated deferred lane retrying
// the budget-denied tail. A tiny generic budget (previously 3 lookups/page
// with the deferred lane off) abandoned everything else at grey
// jpdb-pitch-unknown until the user clicked each word.
export function backgroundPitchEnrichmentOptionsForHost(_hostname: string, compactViewport = false): PitchEnrichmentOptions {
    return {
        publicLookupLimit: compactViewport ? YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_LIMIT : YOUTUBE_PUBLIC_PITCH_ENRICHMENT_LIMIT,
        publicLookupTotalLimit: compactViewport ? YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT : YOUTUBE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT,
        publicLookupPageBudget: compactViewport ? YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET : YOUTUBE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
        // 3 (not 2): dictionaryFirstFallbackLookupTerms places the surface form
        // last, so a 2-term window can drop an inflected word's resolvable
        // dictionary form. The loop stops at the first hit, so this only adds a
        // lookup when the first candidates miss. Matches the subtitle path.
        publicLookupTermLimit: 3,
        substantivePublicLookupOnly: true,
    };
}

export function nestedPitchEnrichmentOptionsForHost(_hostname: string): PitchEnrichmentOptions {
    return { publicLookupLimit: NESTED_PUBLIC_PITCH_ENRICHMENT_LIMIT };
}

export function visibleAutoScanMutationDelay(defaultDelay = 450): number {
    return isYouTubeHostForAutoScan() ? 320 : defaultDelay;
}

export function visibleAutoScanInitialDelay(defaultDelay = 600): number {
    return isYouTubeHostForAutoScan() ? 220 : defaultDelay;
}

// Floor on how often a mutation/scroll-driven (debounced) visible-page scan may
// begin on frequent-auto-scan hosts. YouTube's comment/sidebar re-renders fire
// continuously (5-10 childList mutations/sec); without this the debounced scan
// restarted every ~320ms of quiet and re-collected the whole page. Only the
// leading edge is stretched — the trailing settle scan still fires — so no
// legitimate new-content scan is dropped.
export const AUTO_SCAN_MIN_INTERVAL_MS = 900;

// Max-wait for the trailing debounce (class E): a debounced deadline pushed
// forward on every mutation postpones the scan indefinitely on busy pages
// (live-chat replay, rotating teasers — any surface mutating at <320ms
// intervals). Cap every push-out relative to the FIRST debounced request so a
// busy page still scans about once a second; the AUTO_SCAN_MIN_INTERVAL_MS
// leading-edge floor keeps the steady-state cadence bounded below that.
export const AUTO_SCAN_DEBOUNCE_MAX_WAIT_MS = 1_000;

export function debouncedAutoScanDeadline(requestedDeadline: number, debounceStartedAt: number): number {
    return Math.min(requestedDeadline, debounceStartedAt + AUTO_SCAN_DEBOUNCE_MAX_WAIT_MS);
}

// Clamp a debounced scan's delay so it cannot begin sooner than
// AUTO_SCAN_MIN_INTERVAL_MS after the previous scan started. Non-debounced
// (forced puck/render-rejection) scans and non-frequent hosts pass through
// unthrottled. `frequentHost` is injected so the math is testable without a DOM.
export function throttledAutoScanDelay(
    delay: number,
    options: { debounce?: boolean },
    lastScanStartedAt: number,
    now: number,
    frequentHost = allowsFrequentVisibleAutoScan(),
): number {
    if (!options.debounce || !frequentHost) return delay;
    const floorDelay = AUTO_SCAN_MIN_INTERVAL_MS - (now - lastScanStartedAt);
    return Math.max(delay, Math.min(floorDelay, AUTO_SCAN_MIN_INTERVAL_MS));
}

function isYouTubeHostForAutoScan(hostname = location.hostname): boolean {
    return isYouTubeAppHostname(hostname);
}

export function hasPressLookupEnabled(settings: ReaderSettings): boolean {
    return settings.popupActivationMode !== 'off' && (settings.lookupOnClick || settings.lookupOnHover);
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
    return rect && (rect.width > 0 || rect.height > 0)
        ? rememberOverlaySourceRect(rect, anchor)
        : fallback;
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
    focusOnMount?: boolean;
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
    focusOnMount?: boolean;
    previousNavigationEntry?: PopupNavigationEntry;
    anchor?: HTMLElement;
    insideReaderPopup?: boolean;
    userGesture?: boolean;
    trigger?: 'modal' | 'hover';
    hoverLookupGeneration?: number;
    stackOverSettings?: boolean;
    displaySelected?: string;
}

export interface TextLookupDisplayContext {
    selected: string;
    displaySelected: string;
    anchor?: HTMLElement;
    trigger: 'modal' | 'hover';
    navigation: CardNavigationMode;
    preservePosition: boolean;
    focusOnMount: boolean;
    previousNavigationEntry?: PopupNavigationEntry;
    insideReaderPopup?: boolean;
    userGesture?: boolean;
    hoverLookupGeneration?: number;
    stackOverSettings?: boolean;
}

export type TokenListOptions = Pick<CardDisplayOptions, 'trigger' | 'navigation' | 'preservePosition' | 'focusOnMount' | 'previousNavigationEntry' | 'stackOverSettings'>;

export interface ReviewShortcutContext {
    grade: JPDBGrade;
    card: JPDBCard;
    sentence?: string;
    anchor?: HTMLElement;
    trigger: 'modal' | 'hover';
    ankiCardId: number | null;
    reviewTarget?: 'both' | 'jpdb' | 'jiten' | 'bunpro' | 'yomu-local' | 'anki';
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
    focusOnMount?: boolean;
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
    deferSubtitleMiningResume?: boolean;
    forceAll?: boolean;
}

export interface PopoverMountState {
    mode: 'modal' | 'hover';
    assistiveModal: boolean;
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
    jpdbPublicLookup?: boolean;
    publicLookupLimit?: number;
    publicLookupTotalLimit?: number;
    publicLookupPageBudget?: number;
    publicLookupTermLimit?: number;
    substantivePublicLookupOnly?: boolean;
    deferPublicLookup?: boolean;
}

export interface NestedParseContentCacheEntry {
    expiresAt: number;
    promise: Promise<JPDBToken[][]>;
}
