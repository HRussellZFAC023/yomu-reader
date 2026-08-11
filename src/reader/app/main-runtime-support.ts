import type { AnkiLookupResult } from '../anki/index';
import { currentFullscreenElement } from '../core/fullscreen';
import type { CardRenderData, CardRenderDataLoad } from '../cards/render-data';
import { yomuKanjiStudyCompanion } from '../companions/registry';
import { readerWordSurfaceText } from '../dom/index';
import type { JitenVocabularyInfo } from '../dictionaries/jiten';
import type { YomitanTermEntry } from '../dictionaries/yomitan';
import type { JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import { isTargetLanguageText } from '../lookup/target-text';
import {
    SUBTITLE_SURFACE_SELECTOR,
    type DismissOptions,
    type MountedCardShell,
    type ReviewShortcutContext,
} from './main-helpers';
import type { UiCopyKey } from './i18n';
import type { LocalPitchResolution } from '../lookup/pitch-meta';
import type { ImageOcrController } from '../ocr/controller';
import type { OcrInteractionMode } from '../ocr/mode';
import type { JPDBCard, JPDBToken, ReaderSettings } from './types';

export type KanjiStudyCompanionSlot = NonNullable<ReturnType<typeof yomuKanjiStudyCompanion>>;
export type ReaderLifecycleSurface = {
    init: () => void;
    refresh: () => void;
    destroy: () => void;
};
export type ActivePopoverDismissOptions = DismissOptions & {
    preserveOcrLookupState?: boolean;
    preserveLookupModalSession?: boolean;
};
// Gesture events a host viewer (e.g. BookWalker/NFBR) uses to turn the page; Yomu
// swallows them when they land on its own overlay/popover so a text tap looks up
// the word instead of flipping the page.
export const READER_ROOT_GESTURE_EVENTS = ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'] as const;
export const READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';
// Sustained mirror-churn (live chat, live counters) may force at most one
// full rescan per this interval; the first stale still refreshes fast.
export const MIRROR_STALE_SCAN_MIN_INTERVAL_MS = 2_500;
// TTL for the cached hasVisibleAutoScanWork verdict (perf: mutation bursts).
export const VISIBLE_AUTO_SCAN_WORK_VERDICT_TTL_MS = 1_500;

export function eventTargetsReaderRoot(event: Event): boolean {
    return Boolean((event.target as Element | null)?.closest?.(READER_ROOT_SELECTOR));
}

export function reviewShortcutTargetKind(value: string): ReviewShortcutContext['reviewTarget'] {
    if (value === 'both' || value === 'anki') return value;
    if (value === 'jpdb' || value === 'jiten' || value === 'bunpro' || value === 'yomu-local') return value;
    return undefined;
}

// True when the gesture's POINT is over Yomu's overlay/popover. On touch, WebKit
// can target the underlying viewer canvas even when the OCR text is painted on top,
// so we resolve the element actually at the coordinates (elementFromPoint skips
// pointer-events:none layers and finds the OCR line/word).
export function pointOverReaderRoot(event: Event): boolean {
    const touch = (event as TouchEvent).changedTouches?.[0] ?? (event as TouchEvent).touches?.[0];
    const x = touch ? touch.clientX : (event as MouseEvent).clientX;
    const y = touch ? touch.clientY : (event as MouseEvent).clientY;
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    return Boolean(document.elementFromPoint?.(x, y)?.closest?.(READER_ROOT_SELECTOR));
}

// A gesture should be kept from the host viewer's page-turn handler ONLY when it is
// "leaking" — its point is over Yomu's overlay but it targets the canvas/page (the
// touch-targets-canvas case). When the event already targets the overlay, Yomu's
// own line/word handlers process it (and stopPropagation themselves), so swallowing
// it here would wrongly cancel the lookup (it would also break the OCR-line click
// handler that stops the event reaching underlying host links).
export function readerRootGestureLeaks(event: Event): boolean {
    return !eventTargetsReaderRoot(event) && pointOverReaderRoot(event);
}

// Scroll-lock hosts (BookWalker/NFBR and other fullscreen readers) register a
// non-passive touch/wheel listener that preventDefault()s every scroll so the page
// can't move under their viewer. That also kills scrolling INSIDE a Yomu overlay
// (settings dialog, popover, onboarding) that opens on top — on mobile the panel
// can't scroll at all. Trying to out-race the host (stop its listener before it runs)
// is fragile: a lock on window-CAPTURE registered before us, or on `touchstart`, or
// living in the page realm while we run in an isolated content world, all defeat a
// capture-phase stopPropagation. So instead of fighting the host's preventDefault we
// IGNORE it and drive the scroll ourselves: a document-level touch-drag / wheel
// handler sets the overlay body's scrollTop directly. Setting scrollTop is not a
// cancellable "default action", so it works even while the host preventDefaults native
// scrolling — independent of listener phase, registration order, and realm (document
// listeners demonstrably fire on these hosts; the OCR tap-swallow relies on the same).
// Scoped by event TARGET to scroll BODIES (a touch's target is fixed at touchstart, so
// a sheet-drag that began on the handle is never matched — the popover sheet-drag,
// the popover-body stabilizer, the newtab swipe and the OCR overlay are all untouched).
// Trade-off: these utility panels lose native fling momentum (1:1 drag), which is fine.
export const READER_ROOT_SCROLL_BODY_SELECTOR = '.jpdb-reader-settings-scroll, .jpdb-reader-popover-body, .jpdb-reader-onboarding';

export function readerScrollBodyForEvent(event: Event): HTMLElement | null {
    return (event.target as Element | null)?.closest?.<HTMLElement>(READER_ROOT_SCROLL_BODY_SELECTOR) ?? null;
}

// A gesture on an editable / form control inside an overlay body must keep its native
// behaviour (text caret + selection, a textarea's own scroll, native option lists) —
// embedded editors can render multi-line <textarea>s into an overlay body — so
// the manual scroll driver leaves those controls alone.
const READER_INTERACTIVE_CONTROL_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

export function eventTargetsInteractiveControl(event: Event): boolean {
    return Boolean((event.target as Element | null)?.closest?.(READER_INTERACTIVE_CONTROL_SELECTOR));
}

// The Japanese surface a known-state backfill (Cluster I1) should re-parse for a
// provisional rendered word. Prefer the stored expression; fall back to the
// rendered glyphs. Non-Japanese surfaces are skipped so the batch never spends a
// parse slot on punctuation or Latin runs.
export function knownStateBackfillSurface(word: HTMLElement): string {
    const surface = (word.dataset.expression || readerWordSurfaceText(word)).trim();
    return surface && isTargetLanguageText(surface) ? surface : '';
}

// Pick the authenticated Jiten card a re-parse produced for `surface`: the token
// whose card spelling is the whole surface, else the token anchored at the start,
// else the first. Only an authoritative, Jiten-referenceable card qualifies —
// anything provisional or unbacked must not repaint (it would just re-loop).
export function knownStateBackfillCardForSurface(surface: string, tokens: JPDBToken[]): JPDBCard | null {
    const card = (tokens.find(token => token.card.spelling === surface)
        ?? tokens.find(token => token.start === 0)
        ?? tokens[0])?.card;
    if (!card || card.provisionalState) return null;
    const wordId = card.jitenWordId ?? card.vid;
    return Number.isInteger(wordId) && wordId > 0 ? card : null;
}

// Move `body` by `deltaY` if it can scroll that way; returns true when it consumed the
// gesture (so the caller claims it and the host/page never act on the leftover).
export function manualScrollReaderBody(body: HTMLElement, deltaY: number): boolean {
    const maxTop = body.scrollHeight - body.clientHeight;
    if (maxTop <= 0 || !deltaY) return false;
    body.scrollTop = Math.max(0, Math.min(maxTop, body.scrollTop + deltaY));
    return true;
}
export const HOST_THEME_ENFORCE_STEPS = 12;
export const HOST_THEME_ENFORCE_STEP_MS = 200;
// How long after a subtitle-mining pause we keep re-asserting it. A competing
// re-play (YouTube player, another extension) lands within a few hundred ms; a
// deliberate user resume seconds later is left alone.
export const MINING_PAUSE_REASSERT_WINDOW_MS = 2500;
export const BUNPRO_WORD_STATE_WARMUP_DELAY_MS = 1_500;
// Authenticated known-state backfill (Cluster I1). Words that fell back to a
// provisional not-in-deck (public/keyless lane, or a parse timeout) are
// upgraded with the user's real Jiten SRS state in one batched lookup. Debounced
// through a single pending timer so repeated scans coalesce and the pipeline
// reaches zero timers when idle; visibility- and backoff-gated.
export const KNOWN_STATE_BACKFILL_DELAY_MS = 2_000;
export const KNOWN_STATE_BACKFILL_IDLE_TIMEOUT_MS = 5_000;
// refreshCardStates resolves the whole batch in ONE request; 60 mirrors the
// "grade 60 visible words in one request" batch its own comment cites.
export const KNOWN_STATE_BACKFILL_BATCH_LIMIT = 60;
export const KNOWN_STATE_BACKFILL_BACKOFF_MS = 60_000;
// Below Android's ~500ms native long-press threshold so the lookup wins the
// gesture before the link context menu (which we also suppress) fires.
export const LINK_PRESS_LOOKUP_MS = 450;
export const SUBTITLE_HOVER_MINING_RESUME_GRACE_MS = 520;
// Collapsing/expanding a <details> section inside a HOVER popover resizes it,
// which can slide the popover edge out from under a STATIONARY pointer. The
// browser then fires a spurious pointerleave (and drops :hover), and the
// hover-close machinery would tear the popover down mid-interaction — the
// "collapsing a section closes the popover" bug. After such a self-resize we
// treat the hover context as still active until the pointer actually MOVES
// (its coordinates change) or this backstop elapses, so an abandoned popover
// still reaps instead of lingering forever.
export const HOVER_POPOVER_RESIZE_STICKY_MS = 4_000;
export const HOVER_WORD_HOST_CONTROL_SELECTOR = 'button,[role="button"],a[href],[aria-controls],[aria-expanded]';
export const HOVER_READER_WORD_GEOMETRY_SCOPE_SELECTOR = [
    '.textBox',
    '.ocr-line',
    '.markdown',
    '.markdown-body',
    '.markdown-content',
    '.message',
    '.message-body',
    '.message-content',
    '.messageContent',
    '.chat-message',
    '.conversation-turn',
    '.model-response',
    '.model-response-text',
    '.response-content',
    '.lesson-canvas-clipper',
    'p',
    'li',
    'blockquote',
    'td',
    'th',
    'article',
    'main',
    '[data-jpdb-reader-root]',
    '[role="article"]',
    '[data-message-author-role]',
    '[data-message-id]',
    '[data-testid*="conversation-turn" i]',
    '[data-testid*="chat-message" i]',
    '[data-testid*="message-content" i]',
    '[data-testid*="message-bubble" i]',
    '[data-test-id*="chat-message" i]',
    '[data-test-id*="message-content" i]',
    'a[href]',
    'button',
    'summary',
    '[role="link"]',
    '[role="button"]',
    '[role="tab"]',
    '[role="menuitem"]',
].join(',');
export const JPDB_REVIEW_EXAMPLES_VISIBLE_STORAGE_KEY = 'yomu:jpdb-review-examples-visible:v1';
export const REVIEW_PAGE_TARGET_SETTLE_MS = 20;
export const READER_POINTER_SURFACE_SELECTOR = [
    '.jpdb-reader-popover',
    '.jpdb-reader-settings',
    '.jpdb-subtitle-player',
    '.jpdb-subtitle-list',
    '.jpdb-ocr-layer',
    '[data-jpdb-reader-root]',
].join(',');

// Interactive controls the selection/token-list popover handles itself. A click
// on any of these must not be re-resolved to a page word by point geometry.
export const TOKEN_LIST_POPOVER_CONTROL_SELECTOR = [
    '.jpdb-reader-popover button[data-token-choice]',
    '.jpdb-reader-popover [data-action]',
    '.jpdb-reader-popover a.jpdb-reader-pill',
    '.jpdb-reader-popover .jpdb-reader-action-pill',
].join(',');
const NATIVE_CAPTION_SELECTION_SURFACE_SELECTOR = [
    '.ytp-caption-segment',
    '.caption-window',
    '.caption-visual-line',
    '.captions-text',
    '[data-purpose="captions-text"]',
].join(', ');
export const VIDEO_LOOKUP_ANCHOR_SELECTOR = [
    SUBTITLE_SURFACE_SELECTOR,
    NATIVE_CAPTION_SELECTION_SURFACE_SELECTOR,
].join(', ');
// Plain caption text has no .jpdb-reader-word descendants while annotations
// are paused, so it needs an explicit hover surface for video pause/resume.
// Keep this glyph-scoped: SUBTITLE_SURFACE_SELECTOR includes the full-screen
// click-through player root, which must never pause just because the pointer is
// somewhere over the video.
export const PLAIN_SUBTITLE_HOVER_PAUSE_SELECTOR = [
    '.jpdb-subtitle-primary',
    '.jpdb-subtitle-secondary',
    '.jpdb-subtitle-row-text',
    '.jpdb-subtitle-row-secondary',
    '.asbplayer-subtitles-container-bottom',
    '.jpdb-reader-subtitle-surface',
    NATIVE_CAPTION_SELECTION_SURFACE_SELECTOR,
].join(', ');

export function createNoopImageOcrController(): ImageOcrController {
    const noop = (): void => undefined;
    return {
        init: noop,
        refresh: noop,
        destroy: noop,
        scanVisible: noop,
        refreshForModeChange: noop,
        pinLineForElement: noop,
        unpinLineForElement: noop,
        retainLineForLookup: () => undefined,
        captureSourceImageForElement: () => undefined,
        reconcileRenderedWordVocabulary: noop,
    } as unknown as ImageOcrController;
}

export function ocrModeToastKey(mode: OcrInteractionMode): UiCopyKey {
    if (mode === 'auto') return 'ocrModeAutoToast';
    if (mode === 'manual') return 'ocrModeManualToast';
    return 'ocrModeOffToast';
}

export function noopKanjiPracticeDoodle(): { reassess: () => void; clear: () => void } {
    const noop = (): void => undefined;
    return { reassess: noop, clear: noop };
}

/**
 * What counts as a control inside a Yomu content overlay, and therefore keeps an
 * open popover alive. Everything else on those surfaces is inert paint over
 * somebody else's content and must dismiss like any other outside tap — see
 * isPointerOnInertReaderSurface.
 *
 * Deliberately does NOT list .jpdb-ocr-line: a line box is where the words are
 * drawn, and a press that actually hit an OCR word never reaches the dismissal
 * chain. `.jpdb-reader-word` IS listed, because a press on a SUBTITLE or page-addon
 * word does reach it, and that press is a lookup gesture whose own handler opens
 * the next entry — dismissing it here would race that handler.
 */
const READER_SURFACE_INTERACTIVE_SELECTOR = [
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    'summary',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="slider"]',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    '[data-action]',
    '[data-immersion-action]',
    '[data-yomu-immersion-action]',
    '.jpdb-reader-word',
    '.jpdb-reader-popover',
].join(',');

/**
 * Yomu surfaces that paint OVER content the learner is trying to read, as opposed
 * to Yomu's own chrome.
 *
 * The OCR overlay is the case that was reported (blurvy, MangaFire): its line boxes
 * tile a manga page's speech bubbles and are pointer-events:auto, so a tap on the
 * empty part of a bubble is "outside the popup" to the reader and "my own surface,
 * keep it open" to the allowlist — and on a phone there is no backdrop
 * (shouldUseSheet), so that allowlist is the ONLY dismissal route. It got a bespoke
 * carve-out; the subtitle overlay, the transcript list, the injected page add-ons
 * and toasts have exactly the same shape and never did, so the popup is still
 * untappable-away over any of them.
 *
 * Yomu's own panels — popover, settings dialog, onboarding, floating button, radial
 * menu, mining drawer — are absent on purpose. A press on a panel's own padding is
 * a press on the panel, and it should keep it open.
 */
const CONTENT_OVERLAY_READER_SURFACE_SELECTOR = [
    '.jpdb-ocr-layer',
    SUBTITLE_SURFACE_SELECTOR,
    '.yomu-jpdb-page-addon',
    '.jpdb-reader-toast',
].join(', ');

/**
 * A press landed on a Yomu content overlay but resolved to nothing operable, so it
 * carried no meaning other than "not the popup" — dismiss.
 */
function isPointerOnInertReaderSurface(element: Element | null | undefined): boolean {
    const surface = element?.closest(CONTENT_OVERLAY_READER_SURFACE_SELECTOR);
    if (!surface) return false;
    const control = element?.closest(READER_SURFACE_INTERACTIVE_SELECTOR);
    return !(control && surface.contains(control));
}

const OWNED_MODAL_OUTSIDE_POINTER_TARGET_SELECTOR = [
    '[data-jpdb-reader-root]:not(.jpdb-reader-backdrop)',
    '.jpdb-ocr-layer',
    '.jpdb-subtitle-player',
    '.jpdb-subtitle-list',
    '.jpdb-reader-toast',
].join(',');
const REVIEW_MODAL_OUTSIDE_POINTER_TARGET_SELECTOR = [
    '.review-reveal',
    '.answer-box',
    '.review-hidden',
    'form[action*="/review"]',
    'button[name="r"]',
    'input[name="r"]',
].join(',');

/**
 * Whether a press outside an open modal popover landed somewhere that should keep
 * it open. Lives beside the selectors it consults, because the answer is entirely
 * a question of which surface was pressed — the caller only adds the one case that
 * needs reader state (a lookup stacked over the settings dialog).
 */
export function keepsModalPopoverForOwnedSurface(element: Element | null | undefined): boolean {
    if (isPointerOnInertReaderSurface(element)) return false;
    return Boolean(element?.closest(OWNED_MODAL_OUTSIDE_POINTER_TARGET_SELECTOR)
        || element?.closest(REVIEW_MODAL_OUTSIDE_POINTER_TARGET_SELECTOR));
}

export interface CardPopoverHydrationContext {
    popover: HTMLElement;
    card: JPDBCard;
    sentence: string | undefined;
    trigger: 'modal' | 'hover';
    state: { data: CardRenderData };
    requestId: number;
    isCurrentHoverCard: () => boolean;
    anchor?: HTMLElement;
}

export interface PageWordDefinitionState {
    entries: YomitanTermEntry[];
    jpdbVocabularyInfo: JpdbVocabularyInfo | null;
    jitenVocabularyInfo: JitenVocabularyInfo | null;
    bunproDefinitionInfo: import('../bunpro/definition').BunproDefinitionInfo | null;
}

export interface PageAddonParseState {
    dirty: boolean;
    running?: Promise<void>;
}

export interface MountedCardCompletionContext extends Omit<CardPopoverHydrationContext, 'state' | 'requestId'> {
    mounted: MountedCardShell;
    fallbackAnkiLookup: AnkiLookupResult;
    loadRenderData: () => CardRenderDataLoad;
}

export function fullscreenPopoverMountParent(anchor?: HTMLElement): HTMLElement | undefined {
    const fullscreenElement = currentFullscreenElement();
    if (!(fullscreenElement instanceof HTMLElement) || fullscreenElement instanceof HTMLVideoElement) return undefined;
    if (anchor && fullscreenElement.contains(anchor)) return fullscreenElement;
    return undefined;
}

export function isJsdomRuntime(): boolean {
    return navigator.userAgent.includes('jsdom');
}

export function firstLocalPitchPattern(resolution: LocalPitchResolution): string {
    return resolution.patterns[0] ?? '';
}

// A Jiten headword can momentarily resolve its reading from the page title
// (reading === spelling) before ruby hydrates. Treat only that unresolved
// expected reading as a wildcard. Once the current DOM exposes a real reading,
// require it to match so consecutive homographs cannot retain reading-specific
// definitions from the preceding card.
// Only an on -> off transition undoes the Japanese URL; re-applying an already-off
// preference (every startup, every unrelated settings write) must leave a Japanese
// page the user navigated to themselves exactly where it is.
export function japaneseSiteLanguageDisabled(previous: ReaderSettings, next: ReaderSettings): boolean {
    return previous.preferJapaneseSiteLanguage && !next.preferJapaneseSiteLanguage;
}

export function pageAddonKeysMatch(expected: string, mounted: string): boolean {
    if (expected === mounted) return true;
    const expectedParts = expected.split(':');
    const mountedParts = mounted.split(':');
    if (expectedParts.length !== mountedParts.length
        || expectedParts[0] !== mountedParts[0]
        || expectedParts[1] !== mountedParts[1]) return false;
    if (expectedParts.length < 3) return true;
    const [, spelling, expectedReading] = expectedParts;
    return expectedReading === spelling;
}
