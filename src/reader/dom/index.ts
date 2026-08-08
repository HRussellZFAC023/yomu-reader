import { primaryCardState } from '../cards/state';
import { cardStateProvenance, setRenderedWordCardStatus } from './rendered-word-state';
import { cardDeckMembership } from '../cards/deck-membership';
import { HAS_JAPANESE_LETTER, READER_ROOT_SELECTOR } from './constants';
import { isTargetLanguageText, segmentTargetLanguageText } from '../lookup/target-text';
import {
    COMPACT_INTERACTIVE_CHROME_CONTROL_SELECTOR,
    PASSIVE_INTERACTION_BOUNDARY_SELECTOR,
    PASSIVE_INTERACTION_SELECTOR,
    COMPACT_PASSIVE_INTERACTION_SELECTOR,
    COMPACT_PASSIVE_CHROME_SELECTOR,
    UI_CLASS_RE,
    applyPassiveChromeMarks,
    boxStyleIsClipCapable,
    clampRowAllowsInFlowRestRuby,
    classifyDecoration,
    closestRubyFragileConstrainedRow,
    contentClipRowShowsRestReadings,
    isClipConstrainedRow,
    decorationStateForWord,
    decorationSuppressesRuby,
    interactivePassiveControl,
    stampDecorationState,
    CONSTRAINED_ROW_VERDICT_TTL_MS,
    isCompactPassiveChromeElement,
    compactInteractiveChromeElement,
    compactPassiveChromeElement,
    compactLength,
    compactScanRubySuppression,
    cssPixels,
    hasClippedTextConstraint,
    hasDefiniteCssSize,
    hasInlineControlShape,
    hasLineClamp,
    hasUiBox,
    isCompactInteractiveChromeText,
    isCompactPassiveInteractionElement,
    isEllipsisTextRow,
    isLikelyProseElement,
    isLikelyProseLink,
    isNavigationChromeContext,
    noteConstrainedRowLayoutSettled,
    isNonEditableListboxTrigger,
    isPassiveInteractionElement,
    isPositionedTextOverlay,
    isReadableProseContext,
    isExplicitControlLink,
    linkHasControlMedia,
    linkHasControlShape,
    safeComputedStyle,
    safeElementMatches,
    selectorPairs,
    composedAncestorElement as composedParentElement,
} from './decoration-policy';
import { detachedReadingLaneLineHeight, rubyFriendlyMirrorLineHeight } from './text-mirror-line-height';
import {
    DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS,
    type DocumentAnnotationPortalClipBounds,
    documentAnnotationPortalMirrorsWithin,
    documentAnnotationPortalPaint,
    invalidateDocumentAnnotationPortalClipTopology,
    prepareDocumentAnnotationPortalMirrors,
    preparedDocumentAnnotationPortalClipBounds,
    registerDocumentAnnotationPortalMirror,
    settleDocumentAnnotationPortalMirrors,
    styleDocumentAnnotationPortalMirror,
    unregisterDocumentAnnotationPortalMirror,
} from './youtube-chrome-annotation-portal';
import { sourcePreservingProseNeedsDocumentPortal } from './document-portal-prose-policy';
export { isPassiveInteractionElement, isYouTubeHost } from './decoration-policy';
export type { DecorationState } from './decoration-policy';
import type { DecorationState } from './decoration-policy';
export { classifyDecoration, noteConstrainedRowLayoutSettled, resetDecorationPolicyCachesForTest, setReviewCardFrontPredicate } from './decoration-policy';
import { escapeHtml, setInnerHtml } from './html';
import {
    clearProjectedReadings,
    pruneProjectedReadings,
    syncProjectedReadings,
    type DetachedReadingProjection,
} from './detached-reading-overlay';
export { clearProjectedReadingsWithin, projectedReadingWordAtPoint } from './detached-reading-overlay';
import { createPostPaintPass, viewForNode } from './post-paint-pass';
import { stableCssPixels } from './inline-style';
import { ensureReaderStylesForHost } from './shadow-styles';
import { forEachScannedShadowRoot, watchPotentialOpenShadowRootHost } from './shadow-scan-registry';
import { readerWordSurfaceText, sentenceAroundRange, sentenceAroundSurface, unwrapReaderWords } from './reader-word';
import { pitchComponentUnderlineGradient } from '../lookup/pitch-components';
import { bareFallbackCardFromText } from '../lookup/japanese-segments';
import { activeLearningTargetLanguage } from '../languages/target-runtime';
import { uncoveredJapaneseRanges } from '../lookup/uncovered-japanese-ranges';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../app/types';
import {
    PITCH_CLASSES,
    effectiveTokenRubies,
    isParticleCard,
    kanjiNavigationForElement,
    localRubyRange,
    miningInsightTokenKey,
    miningInsightTokenKeys,
    nonOverlappingTokens,
    readerCardId,
    readerCardSource,
    readerReadingIndex,
    readerWordClassName,
    renderDetachedReadings,
    renderKanjiNavigationText,
    renderRuby,
    shouldRenderRuby,
    tokenPitchClass,
    type TokenRenderOptions,
} from './token-text-rendering';

export {
    inferredInflectedSurfaceRubies,
    isParticleCard,
    nonOverlappingTokens,
    readerWordClassName,
    renderHighlightedTextHtml,
    renderKanjiNavigationText,
    renderRuby,
    shouldHideFuriganaForCardState,
    shouldRenderRuby,
} from './token-text-rendering';

export {
    HAS_JAPANESE,
} from './constants';

export {
    nearestReadableSentenceForElement,
    readerWordAtPointInScope,
    readerWordSurfaceText,
    sentenceAroundRange,
    unwrapReaderWords,
} from './reader-word';

export {
    appendToDocumentHead,
    escapeHtml,
    htmlToFirstElement,
    parseHtmlDocument,
    parseXmlDocument,
    setInnerHtml,
} from './html';

// A bare number must not wrap away from the counter/unit that follows it
// ("7件" -> "7" / "件..."): the digits arrive as untokenized gap text right before
// a reader-word span, so the kinsoku break opportunity sits at that text/span
// boundary where word-break on the span cannot reach. Wrapping the trailing digits
// in this element lets a CSS ::after WORD JOINER (see .jpdb-reader-number-bind in
// reader-words-ocr.css) weld them to the next token. The joiner lives in generated
// content, so textContent stays clean for copy, mining, and re-scan comparisons.
const TRAILING_DIGITS_RE = /[0-9０-９]+$/u;
const NUMBER_BIND_CLASS = 'jpdb-reader-number-bind';
const BLOCK_FLOW_TAG_NAMES = new Set('ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,DD,DETAILS,DIALOG,DIV,DL,DT,FIELDSET,FIGCAPTION,FIGURE,FOOTER,FORM,H1,H2,H3,H4,H5,H6,HEADER,HR,LI,MAIN,NAV,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL'.split(','));
// Shared building blocks for the four skip-selector lists below. Each list composes the common
// BASE entries with whichever extra clusters apply; the joined string must stay set-equal to the
// hand-written original for each list (entry order does not affect matching).
// UT-64: jpdb.io structural widgets. The pitch diagram is per-mora
// letter soup, but "Kanji used" spellings are real JPDB links and should
// keep the same ruby/color treatment as other dictionary terms.
const EDITABLE_FRAGMENT_ROOT_SELECTOR = '[contenteditable="true"],textarea,input,[role="textbox"]';
// role=combobox is only an editable surface when it declares an autocomplete
// contract; a bare combobox is a select-like listbox trigger whose label rides
// the passive chip channel (see isNonEditableListboxTrigger in the policy).
const EDITABLE_TEXT_SURFACE_SELECTOR = `[contenteditable],[role=textbox],[role=searchbox],[role=combobox][aria-autocomplete="list"],[role=combobox][aria-autocomplete="inline"],[role=combobox][aria-autocomplete="both"],[aria-multiline],[aria-placeholder],[data-placeholder],[data-slate-editor],[data-lexical-editor],[class*="placeholder" i],[class*="ProseMirror" i]`;
const BASE_SKIP_SELECTOR = `script,style,noscript,textarea,input,select,option,svg,use,[aria-hidden=true],${EDITABLE_TEXT_SURFACE_SELECTOR},[role=checkbox],[role=radio],[role=tab],[data-jpdb-reader-surface-ignore],[data-audio],[class*="audio" i],[class*="sound" i],[class*="speaker" i],[class*="voice" i],.jpdb-reader-text-mirror,.jpdb-reader-control-text-mirror,.jpdb-reader-canvas-text-layer,.jpdb-reader-word,.subsection-pitch-accent .subsection`;
const BASE_SKIP_SELECTOR_WITHOUT_TAB = BASE_SKIP_SELECTOR.replace(',[role=tab]', '');
const BASE_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN = BASE_SKIP_SELECTOR.replace(',[aria-hidden=true]', '');
const FORM_BOUNDARY_SKIP_SELECTOR = 'form,label,fieldset,legend';
const GENERIC_CONTROL_TEXT_SKIP_SELECTOR = `${FORM_BOUNDARY_SKIP_SELECTOR},[role=form],[role=search]`;
const PLAYER_CHROME_SKIP_SELECTOR = selectorPairs('control,toggle,player', ['class']);

const SKIP_SELECTOR = `${BASE_SKIP_SELECTOR},${FORM_BOUNDARY_SKIP_SELECTOR},button,summary,rt,rp`;
const SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN = `${BASE_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN},${FORM_BOUNDARY_SKIP_SELECTOR},button,summary,rt,rp`;

const FRAGMENT_SKIP_SELECTOR = `${BASE_SKIP_SELECTOR},${FORM_BOUNDARY_SKIP_SELECTOR},button,summary,[data-jpdb-reader-root]`;
const FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN = FRAGMENT_SKIP_SELECTOR.replace(',[aria-hidden=true]', '');
const HARD_FRAGMENT_SKIP_SELECTOR = `${BASE_SKIP_SELECTOR},${FORM_BOUNDARY_SKIP_SELECTOR},${PLAYER_CHROME_SKIP_SELECTOR},[data-jpdb-reader-root]`;
const HARD_FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN = HARD_FRAGMENT_SKIP_SELECTOR.replace(',[aria-hidden=true]', '');
// ISS-11: YouTube wants ALL on-page Japanese parsed, including text inside the
// ytp-*/player/control/toggle wrappers (Shorts overlay text, tooltips,
// end-screen titles). These variants drop ONLY the PLAYER_CHROME_SKIP_ENTRIES
// class globs ([class*="control"|"toggle"|"player"]) and keep every other
// guard (reader-own-DOM mirrors, [aria-hidden], script/style, rt/rp, etc.).
// They are selected solely via includePlayerChrome, so non-YouTube sites keep
// the original HARD_/TAB_CHROME_ behaviour. The native caption window is NOT
// re-ingested here: it stays out via each YouTube profile's `exclude`
// (YT_PLAYER_CHROME_EXCLUDE_ENTRIES), not via these element-skip selectors.
const PLAYER_CHROME_FREE_HARD_FRAGMENT_SKIP_SELECTOR = `${BASE_SKIP_SELECTOR},${FORM_BOUNDARY_SKIP_SELECTOR},[data-jpdb-reader-root]`;
const PLAYER_CHROME_FREE_HARD_FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN = PLAYER_CHROME_FREE_HARD_FRAGMENT_SKIP_SELECTOR.replace(',[aria-hidden=true]', '');
const TAB_CHROME_FRAGMENT_SKIP_SELECTOR = `${BASE_SKIP_SELECTOR_WITHOUT_TAB},${FORM_BOUNDARY_SKIP_SELECTOR},${PLAYER_CHROME_SKIP_SELECTOR},[data-jpdb-reader-root]`;
const TAB_CHROME_FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN = TAB_CHROME_FRAGMENT_SKIP_SELECTOR.replace(',[aria-hidden=true]', '');
const PLAYER_CHROME_FREE_TAB_CHROME_FRAGMENT_SKIP_SELECTOR = `${BASE_SKIP_SELECTOR_WITHOUT_TAB},${FORM_BOUNDARY_SKIP_SELECTOR},[data-jpdb-reader-root]`;
const PLAYER_CHROME_FREE_TAB_CHROME_FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN = PLAYER_CHROME_FREE_TAB_CHROME_FRAGMENT_SKIP_SELECTOR.replace(',[aria-hidden=true]', '');
const FORM_CHROME_FRAGMENT_SKIP_SELECTOR = `${BASE_SKIP_SELECTOR},${PLAYER_CHROME_SKIP_SELECTOR},button,summary,a[href],[role="button"]`;
const FORM_CHROME_FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN = FORM_CHROME_FRAGMENT_SKIP_SELECTOR.replace(',[aria-hidden=true]', '');
// The reader's own furigana mirror must never be re-ingested by a rescan.
// BASE_SKIP_SELECTOR already skips it, but the passive-interaction path (used
// for every site profile root, incl. YouTube) once did not — so a rescan of a
// mirror host re-collected the mirror's bare gap text nodes alongside hidden
// host text and self-perpetuated into a duplicated, flashing caption strip.
const PASSIVE_AWARE_FRAGMENT_SKIP_SELECTOR = `script,style,noscript,textarea,input,select,option,svg,use,[hidden],[aria-hidden="true"],${EDITABLE_TEXT_SURFACE_SELECTOR},.jpdb-reader-text-mirror,.jpdb-reader-control-text-mirror,.jpdb-reader-canvas-text-layer,.jpdb-reader-word,.subsection-pitch-accent .subsection,[data-jpdb-reader-root]`;
const PASSIVE_AWARE_FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN = PASSIVE_AWARE_FRAGMENT_SKIP_SELECTOR.replace(',[aria-hidden="true"]', '');
const FORM_CHROME_BOUNDARY_TAGS = ',FORM,LABEL,FIELDSET,LEGEND,';
const DISPLAY_HEADING_RE = /^H[1-6]$/;
const DISPLAY_HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6';
const FORM_CONTROL_TEXT_MAX_LENGTH = 120;
const FORM_CONTROL_SELECT_OPTION_LIMIT = 8;
const FORM_CONTROL_TEXT_TARGET_SELECTOR = 'select,input,textarea';
const PROSE_TAGS = ',P,LI,DD,DT,TD,TH,BLOCKQUOTE,FIGCAPTION,';
const READER_RENDERED_TEXT_BLOCK_TAGS = `${PROSE_TAGS}H1,H2,H3,H4,H5,H6,`;
const BLOCK_TAGS = new Set('ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL'.split(','));

export interface TextTarget {
    node: Text;
    text: string;
    parent: HTMLElement;
    hasNativeRuby?: boolean;
    // Sealed DecorationPolicy verdict, classified ONCE at collect; every
    // downstream consumer (render allowRuby, CSS stamping, ruby-room) reads
    // this instead of re-classifying.
    decoration?: DecorationState;
    suppressRuby?: boolean;
    proseWrap?: boolean;
    layoutSensitive?: boolean;
    passiveInteraction?: boolean;
    singlePassScan?: boolean;
    nonDestructive?: boolean;
    forceInlineRender?: boolean;
    suppressRepaintLoopMirror?: boolean;
    controlTextMirror?: boolean;
    controlSelectTextMode?: 'options' | 'selected';
    // See FragmentTextTarget.insideShadowDOM. The light-DOM TextTarget walk
    // never enters shadow roots, so this is always unset here today; kept on the
    // union so the render-plan guard resolves on both members.
    insideShadowDOM?: boolean;
    shadowHost?: HTMLElement;
    shadowRoot?: ShadowRoot;
}

export interface TextFragment {
    node: Text;
    start: number;
    end: number;
    hasNativeRuby: boolean;
    layoutSensitive?: boolean;
    passiveInteraction?: boolean;
}

export interface FragmentTextTarget {
    text: string;
    parent: HTMLElement;
    fragments: TextFragment[];
    parserId?: string;
    decoration?: DecorationState;
    // Set when a site profile deliberately overrode the classifier's verdict
    // (owner-surface naming, e.g. hosted docs controls upgraded to content).
    // The staleness re-check cannot reproduce the override, so it only guards
    // the skip transition for such targets.
    decorationProfileOverride?: boolean;
    suppressRuby?: boolean;
    proseWrap?: boolean;
    layoutSensitive?: boolean;
    passiveInteraction?: boolean;
    singlePassScan?: boolean;
    nonDestructive?: boolean;
    forceInlineRender?: boolean;
    suppressRepaintLoopMirror?: boolean;
    controlTextMirror?: boolean;
    controlSelectTextMode?: 'options' | 'selected';
    // Set when this target's text lives inside an OPEN shadow root (Phase 1
    // shadow-DOM scan). Forces the non-destructive mirror render path — a
    // destructive paint into a framework-owned shadow tree (Shoelace, Spectrum,
    // shreddit) corrupts its bindings — see applyTokensToScanTarget.
    insideShadowDOM?: boolean;
    shadowHost?: HTMLElement;
    shadowRoot?: ShadowRoot;
}

export type ScanTextTarget = TextTarget | FragmentTextTarget;

interface TextTargetCollectionOptions {
    includeReaderRoot?: boolean;
    includeFormChrome?: boolean;
}

interface FragmentTextTargetCollectionOptions {
    allowUiText?: boolean;
    minLength?: number;
    includeReaderRoot?: boolean;
    includeUiChrome?: boolean;
    includeFormChrome?: boolean;
    includeTabChrome?: boolean;
    forceInlineRender?: boolean;
    suppressRepaintLoopMirror?: boolean;
    // ISS-11: when set, the resolved skip selector omits PLAYER_CHROME_SKIP_ENTRIES
    // so YouTube player/control/toggle wrappers are parsed. All other guards stay.
    includePlayerChrome?: boolean;
    includePassiveInteractions?: boolean;
    heading?: boolean;
    allowShortCenteredHeadings?: boolean;
    mergeBlockFragments?: boolean;
    readerRootPassiveInteractions?: boolean;
    // Popover source-card titles carry data-jpdb-reader-surface-ignore so page
    // scans and card sentence extraction never absorb them; the popover's own
    // nested parse still selects them as explicit roots, so the root itself
    // may bypass the surface-ignore veto (descendants stay vetoed).
    parseSurfaceIgnoredRoot?: boolean;
}

interface FormControlTextTargetCollectionOptions {
    includeReaderRoot?: boolean;
    excludeSelector?: string;
    parserId?: string;
    selectTextMode?: 'options' | 'selected';
}

interface FragmentTextCollectionState {
    targets: FragmentTextTarget[];
    fragments: TextFragment[];
    limit: number;
    visibleOnly: boolean;
    excludeSelector: string;
    options: FragmentTextTargetCollectionOptions;
    // How many OPEN shadow-root boundaries the current walk has crossed. Phase 1
    // descends at most one level (SHADOW_SCAN_MAX_DEPTH): shadow-of-shadow is not
    // scanned. Zero for the light-DOM walk.
    shadowDepth: number;
}

interface RenderedScanHost {
    text: string;
    markedAt: number;
    lastRejectedAt?: number;
    rejectionCount?: number;
}

interface TextMirrorHostState {
    observer: MutationObserver;
    sourceText: string;
    staleRemovalTimer?: ReturnType<typeof setTimeout>;
    // Aborted on teardown so a pending stale-removal timer scheduled by the
    // per-host observer can never fire against a removed/recycled host.
    lifecycle?: AbortController;
    position: string;
    positionPriority: string;
    positioned: boolean;
    lineHeight: string;
    lineHeightPriority: string;
    reservedLineHeight: string;
    /** The annotation layer is mounted outside the native host so WebKit never
     * includes it in the control's overflow or recycler-owned child tree. */
    documentPortal?: boolean;
    /** The mirror this state's apply created, held weakly: teardown removes
     * it through this ref even after a framework relocates it anywhere in
     * (or across) roots, without any document-wide query. */
    mirror?: WeakRef<HTMLElement>;
}

interface ControlTextMirrorHostState {
    onChange: () => void;
    // Aborted on teardown / before re-observing so the change+input listeners
    // are always removed — a stored closure can outlive a detached host and
    // re-adding without tearing down the old pair leaks listeners.
    listeners?: AbortController;
    placeholderHidden: boolean;
    placeholderHiddenAttribute: string | null;
    parent?: HTMLElement;
    parentPosition: string;
    parentPositionPriority: string;
    parentPositionAdjusted: boolean;
}

interface CanvasFallbackTextLayerState {
    layer: HTMLElement;
    canvasVisibility: string;
    canvasVisibilityPriority: string;
    hostPosition: string;
    hostPositionPriority: string;
    hostPositionAdjusted: boolean;
}

const READER_WORD_SELECTOR = '.jpdb-reader-word';
const READER_TEXT_MIRROR_SELECTOR = '.jpdb-reader-text-mirror';
const READER_OWNED_TEXT_SELECTOR = '.jpdb-reader-word,.jpdb-reader-text-mirror,[data-jpdb-reader-root]';
const READER_CONTROL_TEXT_MIRROR_SELECTOR = '.jpdb-reader-control-text-mirror';
const READER_CANVAS_TEXT_LAYER_SELECTOR = '.jpdb-reader-canvas-text-layer';
const READER_CONTROL_PLACEHOLDER_HIDDEN_ATTRIBUTE = 'data-jpdb-reader-control-placeholder-hidden';
const NON_DESTRUCTIVE_TEXT_HOST_SELECTOR = 'yt-formatted-string,yt-attributed-string,.ytAttributedStringHost,.yt-core-attributed-string,.yt-core-attributed-string--white-space-pre-wrap';
const TEXT_MIRROR_NATIVE_TEXT_SKIP_SELECTOR = `${READER_TEXT_MIRROR_SELECTOR},script,style,noscript,template,[hidden],[aria-hidden="true"]`;
const TEXT_MIRROR_ARIA_LABEL_SKIP_SELECTOR = `${READER_TEXT_MIRROR_SELECTOR},[hidden],[aria-hidden="true"]`;
const RENDERED_SCAN_HOST_MAX_TEXT = 1000;
const RENDERED_SCAN_HOST_REJECTION_WINDOW_MS = 15000;
const RENDERED_SCAN_HOST_REJECTION_RESET_MS = 60000;
const RENDERED_SCAN_HOST_RESCAN_DELAYS_MS = [700, 1600, 4000, 10000];
export const NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT = 'jpdb-reader-text-mirror-stale';
// Grace before a stale mirror (host text changed under it) is torn down when
// no rescan refreshed it — long enough for the stale-event rescan, short
// enough that a recycled element never keeps painting outdated text.
export const STALE_MIRROR_REMOVAL_GRACE_MS = 600;
const renderedScanHosts = new WeakMap<HTMLElement, RenderedScanHost>();
const textMirrorHosts = new WeakMap<HTMLElement, TextMirrorHostState>();
const canvasFallbackTextLayers = new WeakMap<HTMLCanvasElement, CanvasFallbackTextLayerState>();

export function getSelectionText(): string {
    return normalizedSelectedText(activeControlSelectionText(activeSelectableControl())) || documentSelectionText();
}

export function getSelectionSentence(): string {
    const selected = getSelectionText();
    const fullText = activeControlSelectionHostText() || selectionHostText(window.getSelection());
    if (!fullText || !selected) return selected;

    return sentenceAroundSurface(fullText, selected) || selected;
}

export function getSelectionControlElement(): HTMLInputElement | HTMLTextAreaElement | null {
    const control = activeSelectableControl();
    return activeControlSelectionText(control) ? control : null;
}

function documentSelectionText(): string {
    return normalizedSelectedText(window.getSelection()?.toString() ?? '');
}

function activeControlSelectionHostText(): string {
    const control = activeSelectableControl();
    if (!control || !activeControlSelectionText(control)) return '';
    return normalizedSelectedText(control.value);
}

function activeControlSelectionText(control: HTMLInputElement | HTMLTextAreaElement | null): string {
    if (!control) return '';
    const range = controlSelectionRange(control);
    return range ? control.value.slice(range.start, range.end) : '';
}

function activeSelectableControl(): HTMLInputElement | HTMLTextAreaElement | null {
    const element = deepActiveElement();
    if (element instanceof HTMLTextAreaElement) return element;
    if (!(element instanceof HTMLInputElement)) return null;
    if (element.type.toLowerCase() === 'password') return null;
    return controlSelectionRange(element) ? element : null;
}

function deepActiveElement(root: Document | ShadowRoot = document): Element | null {
    const active = root.activeElement;
    if (active?.shadowRoot?.activeElement) return deepActiveElement(active.shadowRoot);
    return active;
}

function controlSelectionRange(control: HTMLInputElement | HTMLTextAreaElement): { start: number; end: number } | null {
    try {
        const start = control.selectionStart;
        const end = control.selectionEnd;
        if (typeof start !== 'number' || typeof end !== 'number' || start === end) return null;
        return start < end ? { start, end } : { start: end, end: start };
    } catch {
        return null;
    }
}

function normalizedSelectedText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function selectionHostText(selection: Selection | null): string {
    return selectionSentenceHost(selection)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function selectionSentenceHost(selection: Selection | null): Element | null {
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) return null;
    return rangeContainerElement(range.commonAncestorContainer)?.closest('p, li, blockquote, td, th, div, article, section') ?? null;
}

function rangeContainerElement(container: Node): Element | null {
    if (container.nodeType === Node.TEXT_NODE) return container.parentElement;
    return container instanceof Element ? container : null;
}

export function collectVisibleTextTargets(limit = 40): TextTarget[] {
    return collectTextTargetsIn(document.body, limit, true);
}

export interface DocumentJapaneseTextProbe {
    hasJapanese: boolean;
    shadowDiscoveryExhausted: boolean;
}

export function documentHasJapaneseText(
    limit = 200000,
    roots: readonly ParentNode[] = document.body ? [document.body] : [],
): boolean {
    return documentJapaneseTextProbe(limit, roots).hasJapanese;
}

export function documentJapaneseTextProbe(
    limit = 200000,
    roots: readonly ParentNode[] = document.body ? [document.body] : [],
): DocumentJapaneseTextProbe {
    if (!roots.length) return { hasJapanese: false, shadowDiscoveryExhausted: false };
    // Preserve the common light-DOM fast path. A positive result starts the
    // normal page scan, which performs the full composed-root registration;
    // avoiding a second synchronous element walk matters on component-heavy
    // iPad pages.
    const lightTextBudget: ShadowTextLookaheadBudget = { inspectedCharacters: 0, limit };
    for (const root of roots) {
        if (textWalkerHasJapaneseWithinBudget(visibleTextWalker(root as Node), lightTextBudget)) {
            return { hasJapanese: true, shadowDiscoveryExhausted: false };
        }
    }
    // document-start pages can contain all visible Japanese behind open
    // component boundaries. After the cheap light-DOM-negative verdict,
    // discover those roots so startup does not depend on a later scroll/click
    // mutation. One shared
    // lookahead budget keeps component-heavy mobile pages bounded; exhaustion
    // conservatively means "maybe", which merely enables the normal scan.
    const shadowBudget: ShadowLookaheadBudget = {
        inspectedElements: 0,
        exhausted: false,
    };
    const shadowTextBudget: ShadowTextLookaheadBudget = { inspectedCharacters: 0, limit };
    let foundShadowJapanese = false;
    let inspectedLightElements = 0;
    for (const root of roots) {
        const rootNode = root as Node;
        const elements = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT);
        // A declared Reader Surface may itself be the custom-element host.
        // TreeWalker.nextNode() visits descendants only, so include that root
        // explicitly before walking its light subtree.
        let node: Node | null = rootNode instanceof HTMLElement ? rootNode : elements.nextNode();
        while (node) {
            // Walking the light tree is bounded independently from the
            // expensive composed-tree lookahead. Ordinary div/span markup
            // must not spend the nested-shadow budget before a real host.
            if (inspectedLightElements >= STARTUP_LIGHT_DOM_DISCOVERY_ELEMENT_LIMIT) {
                shadowBudget.exhausted = true;
                break;
            }
            inspectedLightElements += 1;
            const element = node as HTMLElement;
            if (element.shadowRoot || isCustomElementHost(element)) {
                if (!consumeShadowLookaheadElement(shadowBudget)) break;
                // One lifecycle API covers already-open roots, undefined
                // custom-element upgrades, and defined hosts that attach an
                // open root later. It also registers the root before any
                // Japanese-content gate below.
                const shadowRoot = watchPotentialOpenShadowRootHost(element);
                if (shadowRoot) {
                    if (startupShadowBranchHasVisibleJapanese(
                        shadowRoot,
                        SHADOW_SCAN_MAX_DEPTH,
                        shadowBudget,
                        shadowTextBudget,
                    )) foundShadowJapanese = true;
                }
            }
            if (shadowBudget.exhausted) break;
            node = elements.nextNode();
        }
        if (shadowBudget.exhausted) break;
    }
    return {
        hasJapanese: foundShadowJapanese,
        shadowDiscoveryExhausted: shadowBudget.exhausted,
    };
}

function visibleTextWalker(root: Node): TreeWalker {
    const visibilityCache = new WeakMap<HTMLElement, boolean>();
    return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => visibleTextNodeFilter(node, visibilityCache),
    });
}

function visibleTextNodeFilter(node: Node, visibilityCache: WeakMap<HTMLElement, boolean>): number {
    return canInspectTextNode(node, visibilityCache) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
}

function canInspectTextNode(node: Node, visibilityCache: WeakMap<HTMLElement, boolean>): boolean {
    const parent = node.parentElement;
    if (!parent || parent.closest(READER_ROOT_SELECTOR)) return false;
    if (!hasVisibleComposedTextAncestors(parent, visibilityCache)) return false;
    const blocked = parent.closest(SKIP_SELECTOR);
    if (!blocked) return true;
    return isAnnotatableChipControl(blocked);
}

// Startup visibility is a paint fact, not a textContent fact. In particular,
// Japanese inside a collapsed/hidden panel must not turn a Latin loading shell
// into a positive startup verdict. Walk through the composed ancestry so a
// hidden custom-element host also hides text in its open shadow root.
function hasVisibleComposedTextAncestors(
    element: HTMLElement,
    cache: WeakMap<HTMLElement, boolean>,
): boolean {
    const cached = cache.get(element);
    if (cached !== undefined) return cached;
    const parent = composedParentElement(element);
    const visible = !element.hidden
        && isVisibleStyle(safeComputedStyle(element))
        && (!parent || hasVisibleComposedTextAncestors(parent, cache));
    cache.set(element, visible);
    return visible;
}

// UT-76/79: interactive controls are excluded from collection by default
// (annotating them risked click conflicts), but a short Japanese control
// label (filter chip, tab, menu row) annotates safely on ANY site: the
// passivity classifier renders it as a click-transparent lookup word without
// requiring per-site element lists.
const CONTROL_LABEL_TEXT_LIMIT = 60;
const ANNOTATABLE_CONTROL_SELECTOR = COMPACT_INTERACTIVE_CHROME_CONTROL_SELECTOR;

function isAnnotatableChipControl(blocked: Element): boolean {
    if (!blocked.matches(ANNOTATABLE_CONTROL_SELECTOR)) return false;
    if (blocked.matches('[role="combobox"]') && !isNonEditableListboxTrigger(blocked)) return false;
    const control = blocked.closest(ANNOTATABLE_CONTROL_SELECTOR) ?? blocked;
    if (isComposerActionControl(control)) return false;
    const text = control.textContent?.replace(/\s+/g, '').trim() ?? '';
    return text.length > 0 && text.length <= CONTROL_LABEL_TEXT_LIMIT && isTargetLanguageText(text);
}

function isComposerActionControl(control: Element): boolean {
    return !!control.parentElement?.closest('[class*=composer i],[id*=composer i]')?.querySelector(EDITABLE_FRAGMENT_ROOT_SELECTOR);
}

function nodeTextContent(node: Node): string {
    return node.textContent ?? '';
}

export function collectTextTargetsIn(root: Node, limit = 40, visibleOnly = true, options: TextTargetCollectionOptions = {}): TextTarget[] {
    const walker = textTargetWalker(root, visibleOnly, options);
    const targets: TextTarget[] = [];
    let node: Node | null;
    while (targets.length < limit) {
        node = walker.nextNode();
        if (!node) break;
        const target = textTargetFromAcceptedNode(node);
        if (target) targets.push(target);
    }
    return targets;
}

function textTargetWalker(root: Node, visibleOnly: boolean, options: TextTargetCollectionOptions): TreeWalker {
    return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => textTargetFilterResult(node, visibleOnly, options),
    });
}

function textTargetFilterResult(node: Node, visibleOnly: boolean, options: TextTargetCollectionOptions): number {
    const text = nodeTextContent(node).trim();
    if (!isCandidateScanText(text)) return NodeFilter.FILTER_REJECT;

    const parent = node.parentElement;
    if (!parent) return NodeFilter.FILTER_REJECT;
    return textTargetParentFilterResult(parent, text, visibleOnly, options);
}

function isCandidateScanText(text: string): boolean {
    if (text.length < 2) return false;
    return isTargetLanguageText(text);
}

function textTargetParentFilterResult(parent: HTMLElement, text: string, visibleOnly: boolean, options: TextTargetCollectionOptions): number {
    if (shouldRejectTextTargetParent(parent, text, visibleOnly, options)) return NodeFilter.FILTER_REJECT;
    if (shouldSkipTextTargetParent(parent)) return NodeFilter.FILTER_SKIP;
    return NodeFilter.FILTER_ACCEPT;
}

function shouldRejectTextTargetParent(parent: HTMLElement, text: string, visibleOnly: boolean, options: TextTargetCollectionOptions): boolean {
    const genericControl = parent.closest(GENERIC_CONTROL_TEXT_SKIP_SELECTOR);
    if (!options.includeFormChrome && genericControl && !isCompactControlDescendantTextTarget(parent, text)) return true;
    const blocked = parent.closest(SKIP_SELECTOR);
    if (blocked
        && !isAnnotatableChipControl(blocked)
        && !isVisibleAriaHiddenJapanese(parent, blocked)) return true;
    if (isInsideExcludedReaderRoot(parent, options)) return true;
    // Fragile UI text and short centered headings are no longer REJECTED:
    // rejection also removed them from word lookup, leaving display-language
    // pages (Twitch chrome, metadata rows) entirely unannotated. They are
    // collected and downgraded to the passive channel instead — colour/pitch
    // underline and lookup, no ruby geometry (see textTargetFromAcceptedNode).
    return shouldRejectTextTargetPresentation(parent, visibleOnly);
}

function isCompactControlDescendantTextTarget(parent: HTMLElement, text: string): boolean {
    if (!isCompactInteractiveChromeText(text.replace(/\s+/g, ''))) return false;
    return Boolean(compactInteractiveChromeElement(parent) ?? compactPassiveChromeElement(parent));
}

function isInsideExcludedReaderRoot(parent: HTMLElement, options: TextTargetCollectionOptions): boolean {
    if (options.includeReaderRoot) return false;
    return Boolean(parent.closest(READER_ROOT_SELECTOR));
}

function shouldRejectTextTargetPresentation(parent: HTMLElement, visibleOnly: boolean): boolean {
    return shouldRejectInvisibleTextTarget(parent, visibleOnly);
}

function shouldSkipTextTargetParent(parent: HTMLElement): boolean {
    // Raw childNodes counted whitespace-only text nodes and inline markup
    // (links, emphasised query terms), silently dropping legitimate prose
    // paragraphs. Count only meaningful children, with a higher ceiling.
    let meaningful = 0;
    for (const node of parent.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) continue;
        meaningful += 1;
        if (meaningful > 12) return true;
    }
    return false;
}

function shouldRejectInvisibleTextTarget(parent: HTMLElement, visibleOnly: boolean): boolean {
    if (!visibleOnly) return false;
    return !isVisible(parent);
}

function textTargetFromAcceptedNode(node: Node): TextTarget | null {
    const parent = node.parentElement;
    if (!parent) return null;
    let decoration = classifyDecoration(parent);
    if (decoration === 'skip') return null;
    const text = nodeTextContent(node).trim();
    // Fragile UI text and short centered display headings ride the passive
    // channel: annotated and lookupable, but never ruby geometry that could
    // wrap, clip, or grow their fixed chrome boxes.
    if (decoration !== 'interactive-passive'
        && (isFragileUiText(parent, text) || isShortCenteredDisplayHeading(parent, text))) {
        decoration = 'interactive-passive';
    }
    const suppressRuby = decorationSuppressesRuby(decoration);
    const passiveInteraction = isPassiveInteractionElement(parent) || suppressRuby;
    return {
        node: node as Text,
        text,
        parent,
        hasNativeRuby: Boolean(parent.closest('ruby')),
        decoration,
        suppressRuby,
        proseWrap: shouldWrapScanTargetAsProse(parent, suppressRuby, passiveInteraction),
        layoutSensitive: isLayoutSensitiveScanElement(parent) || isGeometryFragileText(parent, text),
        passiveInteraction,
    };
}

function shouldWrapScanTargetAsProse(parent: HTMLElement, suppressRuby?: boolean, passiveInteraction?: boolean): boolean {
    if (suppressRuby || passiveInteraction) return false;
    return isReadableProseContext(parent);
}

export function collectFragmentTextTargetsIn(
    root: Node,
    limit = 40,
    visibleOnly = true,
    excludeSelector = '',
    options: FragmentTextTargetCollectionOptions = {},
): FragmentTextTarget[] {
    const state: FragmentTextCollectionState = {
        targets: [],
        fragments: [],
        limit,
        visibleOnly,
        excludeSelector,
        options,
        shadowDepth: 0,
    };

    visitFragmentNode(root, state, false, true);
    flushFragmentTextTarget(state);
    return state.targets;
}

export function collectFormControlTextTargetsIn(
    root: ParentNode,
    limit = 40,
    visibleOnly = true,
    options: FormControlTextTargetCollectionOptions = {},
): FragmentTextTarget[] {
    const targets: FragmentTextTarget[] = [];
    const controls = root instanceof HTMLElement && root.matches(FORM_CONTROL_TEXT_TARGET_SELECTOR) ? [root] : [];
    controls.push(...Array.from(root.querySelectorAll<HTMLElement>(FORM_CONTROL_TEXT_TARGET_SELECTOR)));
    for (const control of controls) {
        if (targets.length >= limit) break;
        const target = formControlTextTarget(control, visibleOnly, options);
        if (target) targets.push(target);
    }
    return targets;
}

function formControlTextTarget(
    control: HTMLElement,
    visibleOnly: boolean,
    options: FormControlTextTargetCollectionOptions,
): FragmentTextTarget | null {
    if (!isCollectableFormControlTextElement(control, visibleOnly, options)) return null;
    const text = collectableFormControlLookupText(control, options);
    if (!text) return null;
    return {
        text,
        parent: control,
        fragments: [],
        parserId: options.parserId,
        layoutSensitive: true,
        nonDestructive: true,
        controlTextMirror: true,
        controlSelectTextMode: options.selectTextMode,
        passiveInteraction: !options.includeReaderRoot,
    };
}

function isCollectableFormControlTextElement(
    control: HTMLElement,
    visibleOnly: boolean,
    options: FormControlTextTargetCollectionOptions,
): boolean {
    if (control.closest(READER_CONTROL_TEXT_MIRROR_SELECTOR)) return false;
    if (!options.includeReaderRoot && control.closest(READER_ROOT_SELECTOR)) return false;
    if (visibleOnly && !options.includeReaderRoot && isTextEntryFormControl(control)) return false;
    if (options.excludeSelector && (safeElementMatches(control, options.excludeSelector) || control.closest(options.excludeSelector))) return false;
    if (isDisabledFormControl(control) || isUnlookupableFormControl(control)) return false;
    return !visibleOnly || isVisible(control);
}

function isTextEntryFormControl(control: HTMLElement): boolean {
    return control instanceof HTMLTextAreaElement
        || (control instanceof HTMLInputElement && isTextEntryInput(control));
}

function isTextEntryInput(input: HTMLInputElement): boolean {
    const type = input.type.toLowerCase();
    return type === ''
        || ['email', 'number', 'search', 'tel', 'text', 'url'].includes(type);
}

function isDisabledFormControl(control: HTMLElement): boolean {
    return (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)
        && (control.disabled || control.getAttribute('aria-disabled')?.toLowerCase() === 'true');
}

function isUnlookupableFormControl(control: HTMLElement): boolean {
    if (!(control instanceof HTMLInputElement)) return false;
    return ['hidden', 'password', 'file', 'image'].includes(control.type.toLowerCase());
}

function collectableFormControlLookupText(control: HTMLElement, options: Pick<FormControlTextTargetCollectionOptions, 'selectTextMode'> = {}): string {
    const text = formControlLookupText(control, options);
    return isCollectableControlText(text) ? text : '';
}

function formControlLookupText(control: HTMLElement, options: Pick<FormControlTextTargetCollectionOptions, 'selectTextMode'> = {}): string {
    const parts: string[] = [];
    if (control instanceof HTMLSelectElement) {
        pushUniqueControlText(parts, selectLookupText(control, options.selectTextMode ?? 'options'));
        if (options.selectTextMode === 'selected') return parts.join(' / ');
    }
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) return '';
    pushUniqueControlText(parts, control.getAttribute('aria-label') ?? '');
    pushUniqueControlText(parts, control.getAttribute('title') ?? '');
    return parts.join(' / ');
}

function selectLookupText(select: HTMLSelectElement, mode: 'options' | 'selected'): string {
    const selectedText = uniqueControlTexts(Array.from(select.selectedOptions).map(optionText));
    if (mode === 'selected') return selectedText.join(' / ');
    const optionTextList = uniqueControlTexts(Array.from(select.options).map(optionText))
        .filter(text => isTargetLanguageText(text));
    const compactOptionList = compactSelectOptionListText(optionTextList);
    // A picker whose lone Japanese option is not the selected one (language
    // pickers on Latin-selected pages) must still surface that option instead
    // of dropping the control entirely.
    return compactOptionList
        || selectedText.join(' / ')
        || optionTextList.slice(0, FORM_CONTROL_SELECT_OPTION_LIMIT).join(' / ');
}

function compactSelectOptionListText(options: string[]): string {
    if (options.length < 2 || options.length > FORM_CONTROL_SELECT_OPTION_LIMIT) return '';
    const text = options.join(' / ');
    return compactLength(text) <= FORM_CONTROL_TEXT_MAX_LENGTH ? text : '';
}

function optionText(option: HTMLOptionElement): string {
    return normalizedControlText(option.label || option.textContent || '');
}

function pushUniqueControlText(parts: string[], text: string): void {
    const normalized = normalizedControlText(text);
    if (!normalized || !isTargetLanguageText(normalized) || parts.includes(normalized)) return;
    parts.push(normalized);
}

function uniqueControlTexts(texts: string[]): string[] {
    const result: string[] = [];
    texts.forEach(text => pushUniqueControlText(result, text));
    return result;
}

function normalizedControlText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function isCollectableControlText(text: string): boolean {
    const compact = compactLength(text);
    return compact > 0 && compact <= FORM_CONTROL_TEXT_MAX_LENGTH && isTargetLanguageText(text);
}

function fragmentText(items: TextFragment[]): string {
    return items.map(fragment => fragment.node.data.slice(fragment.start, fragment.end)).join('');
}

function flushFragmentTextTarget(state: FragmentTextCollectionState): void {
    if (!state.fragments.length || fragmentCollectionComplete(state)) {
        state.fragments.length = 0;
        return;
    }

    const target = fragmentTextTargetFrom(state.fragments, state.options);
    if (target) state.targets.push(target);
    state.fragments.length = 0;
}

function fragmentTextTargetFrom(
    fragments: TextFragment[],
    options: FragmentTextTargetCollectionOptions,
): FragmentTextTarget | null {
    const trimmedFragments = trimTextFragments(fragments);
    const text = fragmentText(trimmedFragments);
    if (!isCollectableFragmentText(text, trimmedFragments, options)) return null;

    const parent = trimmedFragments[0]?.node.parentElement;
    if (!parent) return null;
    if (!options.includeReaderRoot && !options.allowShortCenteredHeadings && isShortCenteredDisplayHeading(parent, text)) return null;
    const decoration = fragmentTargetDecoration(parent, trimmedFragments);
    if (decoration === 'skip') return null;
    const suppressRuby = decorationSuppressesRuby(decoration);
    const passiveInteraction = suppressRuby || trimmedFragments.every(fragment => fragment.passiveInteraction);
    return {
        text,
        parent,
        fragments: trimmedFragments,
        decoration,
        suppressRuby,
        proseWrap: shouldWrapScanTargetAsProse(parent, suppressRuby, passiveInteraction),
        layoutSensitive: trimmedFragments.some(fragment => fragment.layoutSensitive),
        passiveInteraction,
        forceInlineRender: options.forceInlineRender,
        suppressRepaintLoopMirror: options.suppressRepaintLoopMirror,
        ...shadowDomTargetMetadata(parent),
    };
}

// A target whose text lives in an OPEN shadow root is force-routed to the
// non-destructive mirror (framework-owned shadow trees must never be
// destructively painted). getRootNode() surfaces the owning ShadowRoot even
// when the fragment's parent is deep inside the shadow tree.
function shadowDomTargetMetadata(parent: HTMLElement): Partial<FragmentTextTarget> {
    const root = parent.getRootNode();
    if (!(root instanceof ShadowRoot)) return {};
    return {
        insideShadowDOM: true,
        nonDestructive: true,
        shadowHost: root.host instanceof HTMLElement ? root.host : undefined,
        shadowRoot: root,
    };
}

// The target-level decision is the parent's classification, upgraded to
// interactive-passive when ANY fragment sits inside an interactive control
// (a mixed run spanning a chip and its label must not ruby half of itself).
function fragmentTargetDecoration(parent: HTMLElement, fragments: TextFragment[]): DecorationState {
    const parentDecoration = classifyDecoration(parent);
    if (parentDecoration === 'skip' || parentDecoration === 'interactive-passive') return parentDecoration;
    const seen = new Set<HTMLElement>([parent]);
    for (const fragment of fragments) {
        const element = fragment.node.parentElement;
        if (!element || seen.has(element)) continue;
        seen.add(element);
        if (classifyDecoration(element) === 'interactive-passive') return 'interactive-passive';
    }
    return parentDecoration;
}

function isCollectableFragmentText(
    text: string,
    fragments: TextFragment[],
    options: FragmentTextTargetCollectionOptions,
): boolean {
    if (!isTargetLanguageText(text)) return false;
    if (compactFragmentTextLength(text) >= (options.minLength ?? 2)) return true;
    return fragments.some(fragment => fragment.hasNativeRuby);
}

function compactFragmentTextLength(text: string): number {
    return text.replace(/\s+/g, '').length;
}

function visitFragmentNode(
    node: Node,
    state: FragmentTextCollectionState,
    hasNativeRuby = false,
    isRoot = false,
): void {
    if (fragmentCollectionComplete(state)) return;
    if (node.nodeType === Node.TEXT_NODE) {
        collectFragmentTextNode(node as Text, state, hasNativeRuby);
        return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    visitFragmentElement(node as HTMLElement, state, hasNativeRuby, isRoot);
}

function collectFragmentTextNode(
    node: Text,
    state: FragmentTextCollectionState,
    hasNativeRuby: boolean,
): void {
    const text = node.textContent ?? '';
    if (shouldIgnoreFragmentTextNode(text, state.options)) return;
    const parent = node.parentElement;
    if (text) state.fragments.push({
        node,
        start: 0,
        end: text.length,
        hasNativeRuby,
        layoutSensitive: parent ? isLayoutSensitiveScanElement(parent) : false,
        passiveInteraction: parent ? isFragmentPassiveInteractionElement(parent, state.options) : false,
    });
}

function shouldIgnoreFragmentTextNode(
    text: string,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    return Boolean(options.mergeBlockFragments && !text.trim());
}

function visitFragmentElement(
    element: HTMLElement,
    state: FragmentTextCollectionState,
    hasNativeRuby: boolean,
    isRoot: boolean,
): void {
    if (shouldIgnoreFragmentElement(element, state.options, isRoot)) return;
    if (shouldFlushAndSkipFragmentElement(element, state, isRoot)) {
        flushFragmentTextTarget(state);
        return;
    }

    const isBlock = isBlockFragmentElement(element, state.options);
    flushFragmentBlockBoundary(isBlock, state);
    visitFragmentElementChildren(element, state, nextFragmentRubyState(element, hasNativeRuby));
    flushFragmentBlockBoundary(isBlock, state);
    // Phase 1 shadow-DOM scan: after this element's own (light-DOM / slotted)
    // children, descend into an OPEN shadow root it hosts so Japanese rendered
    // inside a web component (reddit shreddit, Shoelace, Spectrum, …) is
    // annotated too. Bounded to one level and gated on Japanese content below.
    visitFragmentShadowRoot(element, state);
}

// Framework shells increasingly nest content through several open component
// boundaries (current shreddit comment/menu surfaces use three). Four reaches
// those visible labels while the Japanese lookahead and target cap still keep
// traversal finite on arbitrary component trees.
const SHADOW_SCAN_MAX_DEPTH = 4;
const SHADOW_JAPANESE_LOOKAHEAD_ELEMENT_LIMIT = 160;
// The light tree can be much larger than the number of actual component
// boundaries. Keep discovery finite without letting ordinary div/span markup
// consume the much tighter nested-shadow lookahead budget.
const STARTUP_LIGHT_DOM_DISCOVERY_ELEMENT_LIMIT = 4096;
interface ShadowLookaheadBudget {
    inspectedElements: number;
    exhausted: boolean;
}
interface ShadowTextLookaheadBudget {
    inspectedCharacters: number;
    limit: number;
}

function visitFragmentShadowRoot(element: HTMLElement, state: FragmentTextCollectionState): void {
    const shadowRoot = watchPotentialOpenShadowRootHost(element);
    // element.shadowRoot is null for a closed root (mode:'closed') — silently
    // skip, it is unreachable and not an error.
    if (!shadowRoot) return;
    // Register BEFORE the Japanese gate below: an empty or Latin-only open
    // root today may hydrate Japanese later (framework lazy-render/hydration),
    // and a subtree MutationObserver can only see that hydration if this root
    // already has an observer attached. Registering only roots we commit to
    // walking left every empty/Latin host permanently unobservable.
    if (state.shadowDepth >= SHADOW_SCAN_MAX_DEPTH) {
        // Depth-capped: never silently drop the branch. The host is queued for
        // a deferred continuation walk that re-roots HERE (its own walk starts
        // at shadowDepth 0), so arbitrarily deep component trees are covered
        // a bounded slice at a time instead of truncated at depth 4 (the
        // Reddit sort-dropdown/pinned-label drop).
        deferDepthCappedShadowHost(element);
        return;
    }
    // Fast path: never walk a shadow branch with no Japanese. textContent does
    // not cross a nested shadow boundary, so use a bounded one-level lookahead
    // when another descent is available (the shreddit shell -> Join button
    // shape). Latin-only roots still stop before their childNodes are walked.
    if (!shadowBranchHasJapanese(shadowRoot, SHADOW_SCAN_MAX_DEPTH - state.shadowDepth)) return;
    // COMMIT any pending inline light-DOM run BEFORE descending: an inline host
    // (e.g. <span> that also hosts a shadow root) leaves its light run in
    // state.fragments here. Flushing it now — the same block-boundary primitive
    // the walk uses when it crosses a block — records the light target in
    // document order and empties state.fragments, so the shadow walk starts
    // clean. A save/clear/RESTORE dance instead held those light fragments across
    // the descent; if the shadow flush then reached state.limit, the restored
    // light run was silently dropped by fragmentCollectionComplete and the shadow
    // target could land ahead of an earlier-in-document light run.
    flushFragmentTextTarget(state);
    if (fragmentCollectionComplete(state)) {
        // Budget spent before the descent: the host is registered above, but
        // its content was never walked — resume here on the deferred lane.
        deferDepthCappedShadowHost(element);
        return;
    }
    // A <slot> projects light-DOM children into the shadow tree, but those text
    // nodes are ALREADY walked in the light-DOM pass above (their real parent is
    // in light DOM). Walking shadowRoot.childNodes reaches a <slot>'s fallback
    // content only, never projected light-DOM nodes, so slotted content is never
    // annotated twice.
    state.shadowDepth += 1;
    const shadowChildren = Array.from(shadowRoot.childNodes);
    for (const child of shadowChildren) {
        visitFragmentNode(child, state, false);
        if (fragmentCollectionComplete(state)) break;
    }
    flushFragmentTextTarget(state);
    state.shadowDepth -= 1;
}

function shadowBranchHasJapanese(
    root: ShadowRoot,
    remainingDepth: number,
    budget: ShadowLookaheadBudget = { inspectedElements: 0, exhausted: false },
): boolean {
    let foundJapanese = isTargetLanguageText(root.textContent ?? '');
    if (remainingDepth <= 1) {
        // No shallow Japanese and no depth budget left to look inside nested
        // roots. If a nested root EXISTS, descend anyway ("maybe"): the walk
        // will hit the depth cap at that nested host and queue it for the
        // deferred continuation instead of dropping the branch.
        const foundNested = shadowRootHasNestedShadowRoot(root, budget);
        return foundJapanese || foundNested;
    }
    // TreeWalker enforces the element budget while traversing. querySelectorAll
    // would first allocate every descendant in a large component root and only
    // then let us stop at 160, defeating the mobile performance bound.
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
        if (!consumeShadowLookaheadElement(budget)) return true;
        const element = node as HTMLElement;
        const nested = watchPotentialOpenShadowRootHost(element);
        if (nested) {
            // Register even when this lookahead ultimately finds no Japanese:
            // the nested root may hydrate Japanese later, and it would
            // otherwise never surface to the registry (only Latin-only
            // top-level roots get the top-of-function registration).
            if (shadowBranchHasJapanese(nested, remainingDepth - 1, budget)) foundJapanese = true;
        }
        node = walker.nextNode();
    }
    return foundJapanese;
}

// Startup needs a stricter verdict than the collection fast path above. The
// latter may use raw textContent as a cheap reason to enter a branch because
// the full collector subsequently applies visibility policy. Startup has no
// such second stage, so only visibly painted text can set hasJapanese=true.
// Discovery and text inspection have separate bounds: we continue registering
// empty/Latin roots even after the text budget is spent, while any unvisited
// component branch is reported as conservative discovery uncertainty.
function startupShadowBranchHasVisibleJapanese(
    root: ShadowRoot,
    remainingDepth: number,
    elementBudget: ShadowLookaheadBudget,
    textBudget: ShadowTextLookaheadBudget,
): boolean {
    let foundJapanese = textWalkerHasJapaneseWithinBudget(visibleTextWalker(root), textBudget);
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
        if (!consumeShadowLookaheadElement(elementBudget)) return foundJapanese;
        const element = node as HTMLElement;
        const nested = watchPotentialOpenShadowRootHost(element);
        if (nested) {
            if (remainingDepth <= 1) {
                // A deeper root exists but this bounded startup slice cannot
                // inspect it. Preserve hasJapanese=false while exposing the
                // uncertainty separately to the caller.
                elementBudget.exhausted = true;
            } else if (startupShadowBranchHasVisibleJapanese(
                nested,
                remainingDepth - 1,
                elementBudget,
                textBudget,
            )) {
                foundJapanese = true;
            }
        }
        if (elementBudget.exhausted) return foundJapanese;
        node = walker.nextNode();
    }
    return foundJapanese;
}

function textWalkerHasJapaneseWithinBudget(walker: TreeWalker, budget: ShadowTextLookaheadBudget): boolean {
    if (budget.inspectedCharacters >= budget.limit) return false;
    let node: Node | null;
    while ((node = walker.nextNode())) {
        const text = nodeTextContent(node);
        const remaining = budget.limit - budget.inspectedCharacters;
        const sampled = text.slice(0, remaining);
        budget.inspectedCharacters += sampled.length;
        if (isTargetLanguageText(sampled)) return true;
        if (budget.inspectedCharacters >= budget.limit) return false;
    }
    return false;
}

function shadowRootHasNestedShadowRoot(
    root: ShadowRoot,
    budget: ShadowLookaheadBudget,
): boolean {
    let foundNested = false;
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
        if (!consumeShadowLookaheadElement(budget)) return true;
        const element = node as HTMLElement;
        const nested = watchPotentialOpenShadowRootHost(element);
        if (nested) {
            foundNested = true;
        }
        node = walker.nextNode();
    }
    return foundNested;
}

function consumeShadowLookaheadElement(budget: ShadowLookaheadBudget): boolean {
    if (budget.inspectedElements >= SHADOW_JAPANESE_LOOKAHEAD_ELEMENT_LIMIT) {
        budget.exhausted = true;
        return false;
    }
    budget.inspectedElements += 1;
    return true;
}

function isCustomElementHost(element: HTMLElement): boolean {
    return element.tagName.includes('-');
}

// Hosts whose open shadow root the walk could not enter because the depth cap
// was reached. Drained by the scan-target collection driver, which re-roots a
// bounded continuation walk at each host. Per-collection, not persistent:
// every scan rediscovers live deep hosts, so stale entries cannot accrete.
const depthCappedShadowHosts = new Set<WeakRef<HTMLElement>>();
const depthCappedShadowHostSeen = new WeakSet<HTMLElement>();

function deferDepthCappedShadowHost(element: HTMLElement): void {
    if (depthCappedShadowHostSeen.has(element)) return;
    depthCappedShadowHostSeen.add(element);
    depthCappedShadowHosts.add(new WeakRef(element));
}

export function drainDepthCappedShadowHosts(): HTMLElement[] {
    const hosts: HTMLElement[] = [];
    for (const ref of depthCappedShadowHosts) {
        const host = ref.deref();
        // Every drained entry becomes queueable again — including currently
        // detached hosts, which recyclers may reconnect before the next scan.
        if (host) depthCappedShadowHostSeen.delete(host);
        if (host?.isConnected) hosts.push(host);
    }
    depthCappedShadowHosts.clear();
    return hosts;
}

function shouldIgnoreFragmentElement(
    element: HTMLElement,
    options: FragmentTextTargetCollectionOptions,
    isRoot = false,
): boolean {
    return isRubyAnnotationElement(element)
        || (isSurfaceIgnoredElement(element) && !(isRoot && options.parseSurfaceIgnoredRoot))
        || isExcludedReaderRootElement(element, options);
}

function isRubyAnnotationElement(element: HTMLElement): boolean {
    return element.tagName === 'RT' || element.tagName === 'RP';
}

function isSurfaceIgnoredElement(element: HTMLElement): boolean {
    return element.matches('[data-jpdb-reader-surface-ignore]');
}

function isExcludedReaderRootElement(
    element: HTMLElement,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    return !options.includeReaderRoot && Boolean(element.closest(READER_ROOT_SELECTOR));
}

function shouldFlushAndSkipFragmentElement(
    element: HTMLElement,
    state: FragmentTextCollectionState,
    isRoot: boolean,
): boolean {
    if (matchesSkippedFragmentElement(element, state, isRoot)) return true;
    if (shouldSkipInvisibleFragmentElement(element, state.visibleOnly)) return true;
    return shouldSkipFragmentTextPresentation(element, state.options);
}

function matchesSkippedFragmentElement(
    element: HTMLElement,
    state: FragmentTextCollectionState,
    isRoot: boolean,
): boolean {
    if (state.excludeSelector && fragmentSelectorSkipsElement(
        element,
        state.excludeSelector,
        selectorWithoutAriaHiddenToken(state.excludeSelector),
    )) return true;
    if (isComposerActionControl(element)) return true;
    if (isRoot && element.closest(EDITABLE_FRAGMENT_ROOT_SELECTOR) && !isSafeEditableSurfaceFragmentRoot(element, state.options)) return true;
    return !isRoot && shouldSkipFragmentElement(element, state.options);
}

function isSafeEditableSurfaceFragmentRoot(element: HTMLElement, options: FragmentTextTargetCollectionOptions): boolean {
    return Boolean(options.includePassiveInteractions
        && safeElementMatches(element, PASSIVE_INTERACTION_SELECTOR)
        && isNavigationChromeContext(element));
}

function shouldSkipInvisibleFragmentElement(element: HTMLElement, visibleOnly: boolean): boolean {
    if (!hasVisibleTextStyle(element) && !hasVisibleTextMirror(element)) return true;
    if (!visibleOnly || hasVisibleTextMirror(element)) return false;
    const rect = element.getBoundingClientRect();
    if (isVisibleRect(rect)) return false;
    // Only boxless component wrappers can have a visible descendant while the
    // wrapper itself is not visible. A normal non-zero box that misses the
    // viewport takes every in-flow descendant with it; walking those hidden
    // feed cards would add bounded-but-repeated layout work on every scan.
    return !isBoxlessFragmentWrapper(rect)
        || !hasVisibleJapaneseFragmentDescendant(element);
}

// A `display: contents` (or otherwise boxless) wrapper can nest a whole card's
// worth of chrome — action bars, avatars, metadata rows — ahead of the visible
// title, so a tight cap pruned wrappers whose first painted Japanese simply sat
// past the ceiling. The bound only exists to keep an offscreen virtualized tree
// cheap, and each element visited is an O(1) style/text check, so a generous
// ceiling still finishes in bounded work while reaching realistic deep titles.
const VISIBLE_FRAGMENT_DESCENDANT_LOOKAHEAD_LIMIT = 512;

function isBoxlessFragmentWrapper(rect: DOMRect): boolean {
    return rect.width <= 0 || rect.height <= 0;
}

// Component wrappers may have no painted box of their own (`display: contents`
// or absolutely-positioned children) while descendants remain visibly painted.
// Rejecting the wrapper prunes that whole subtree. A bounded lookahead keeps
// offscreen virtualized trees cheap while allowing the walk to reach a real
// visible Japanese child, where the normal visibility checks apply again.
function hasVisibleJapaneseFragmentDescendant(element: HTMLElement): boolean {
    // textContent never crosses a shadow boundary, so a wrapper whose only
    // Japanese lives inside a descendant component's open shadow root (a
    // visible control whose label is shadow content — e.g. a feed action bar
    // slot whose fallback is a share button component) must not be pruned on
    // the light-tree test alone. Peek through open boundaries with the same
    // bounded lookahead the shadow walk uses; it also registers nested roots
    // so later hydration stays observable.
    const shadowBudget: ShadowLookaheadBudget = { inspectedElements: 0, exhausted: false };
    const lightJapanese = isTargetLanguageText(element.textContent ?? '');
    if (element.shadowRoot
        && isVisible(element)
        && shadowBranchHasJapanese(element.shadowRoot, 2, shadowBudget)) return true;
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_ELEMENT);
    for (let inspected = 0, node = walker.nextNode();
        node && inspected < VISIBLE_FRAGMENT_DESCENDANT_LOOKAHEAD_LIMIT;
        inspected += 1, node = walker.nextNode()) {
        const descendant = node as HTMLElement;
        if (lightJapanese && isTargetLanguageText(descendant.textContent ?? '') && isVisible(descendant)) return true;
        const shadow = descendant.shadowRoot;
        if (shadow && isVisible(descendant) && shadowBranchHasJapanese(shadow, 2, shadowBudget)) return true;
    }
    return false;
}

function hasVisibleTextStyle(element: HTMLElement): boolean {
    return isVisibleStyle(safeComputedStyle(element));
}

function hasVisibleTextMirror(element: HTMLElement): boolean {
    return Array.from(element.children)
        .some((child): child is HTMLElement => child instanceof HTMLElement
            && child.matches(READER_TEXT_MIRROR_SELECTOR)
            && isVisible(child));
}

function shouldSkipFragmentTextPresentation(
    element: HTMLElement,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    const text = element.textContent?.trim() ?? '';
    if (shouldSkipFragmentHeading(element, text, options)) return true;
    if (shouldSkipFragmentUiText(element, text, options)) return true;
    return isReaderRenderedTextBlock(element);
}

function shouldSkipFragmentHeading(
    element: HTMLElement,
    text: string,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    return Boolean(!options.heading && !options.allowShortCenteredHeadings && text && isShortCenteredDisplayHeading(element, text));
}

function shouldSkipFragmentUiText(
    element: HTMLElement,
    text: string,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    return Boolean(!options.allowUiText && text && isFragileUiText(element, text));
}

function isBlockFragmentElement(
    element: HTMLElement,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    return !options.mergeBlockFragments
        && isFragmentParagraphBoundary(element, options)
        && !isInlineSentenceListItem(element);
}

function flushFragmentBlockBoundary(isBlock: boolean, state: FragmentTextCollectionState): void {
    if (isBlock) flushFragmentTextTarget(state);
}

function visitFragmentElementChildren(
    element: HTMLElement,
    state: FragmentTextCollectionState,
    hasNativeRuby: boolean,
): void {
    for (const child of Array.from(element.childNodes)) {
        visitFragmentNode(child, state, hasNativeRuby);
        if (fragmentCollectionComplete(state)) break;
    }
}

function nextFragmentRubyState(element: HTMLElement, hasNativeRuby: boolean): boolean {
    return hasNativeRuby || element.tagName === 'RUBY' || element.tagName === 'RB';
}

function fragmentCollectionComplete(state: FragmentTextCollectionState): boolean {
    return state.targets.length >= state.limit;
}

function shouldSkipFragmentElement(
    element: HTMLElement,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    // PASSIVE_AWARE_FRAGMENT_SKIP_SELECTOR never carried PLAYER_CHROME_SKIP_ENTRIES,
    // so the passive path already lets player chrome through; includePlayerChrome
    // only needs to relax the hard/tab-chrome branches below.
    if (options.includePassiveInteractions) return fragmentSelectorSkipsElement(
        element,
        PASSIVE_AWARE_FRAGMENT_SKIP_SELECTOR,
        PASSIVE_AWARE_FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN,
    );
    if (options.includeFormChrome) return fragmentSelectorSkipsElement(
        element,
        FORM_CHROME_FRAGMENT_SKIP_SELECTOR,
        FORM_CHROME_FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN,
    );
    if (options.includeTabChrome) {
        // ISS-11: YouTube parses player/control/toggle wrappers — drop only the
        // PLAYER_CHROME_SKIP_ENTRIES globs, keep every other tab-chrome guard.
        return options.includePlayerChrome
            ? fragmentSelectorSkipsElement(element, PLAYER_CHROME_FREE_TAB_CHROME_FRAGMENT_SKIP_SELECTOR, PLAYER_CHROME_FREE_TAB_CHROME_FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN)
            : fragmentSelectorSkipsElement(element, TAB_CHROME_FRAGMENT_SKIP_SELECTOR, TAB_CHROME_FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN);
    }
    if (options.includeUiChrome) {
        return options.includePlayerChrome
            ? fragmentSelectorSkipsElement(element, PLAYER_CHROME_FREE_HARD_FRAGMENT_SKIP_SELECTOR, PLAYER_CHROME_FREE_HARD_FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN)
            : fragmentSelectorSkipsElement(element, HARD_FRAGMENT_SKIP_SELECTOR, HARD_FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN);
    }
    return fragmentSelectorSkipsElement(element, FRAGMENT_SKIP_SELECTOR, FRAGMENT_SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN);
}

function fragmentSelectorSkipsElement(element: HTMLElement, selector: string, selectorWithoutAriaHidden: string): boolean {
    if (!safeElementMatches(element, selector)) return false;
    if (!safeElementMatches(element, '[aria-hidden="true"]')) return true;
    if (safeElementMatches(element, selectorWithoutAriaHidden)) return true;
    return !ariaHiddenSubtreeHasVisibleJapanese(element);
}

function selectorWithoutAriaHiddenToken(selector: string): string {
    return selector
        .split(',')
        .map(entry => entry.trim())
        .filter(entry => entry !== '[aria-hidden=true]' && entry !== '[aria-hidden="true"]')
        .join(',');
}

// aria-hidden hides a subtree from assistive tech, but sites routinely apply it
// to on-screen content whose accessible name is *duplicated* elsewhere: YouTube
// and Google wrap a painted video/result title, badge, or metadata row in
// aria-hidden while a separate label supplies the name. A blanket aria-hidden
// skip then strands that visible Japanese permanently bare. Rescue it on paint
// facts alone — a genuinely visible element that itself owns the Japanese text —
// rather than on the aria contract. Two structural exclusions keep true
// accessible-name duplicates out (see isAriaHiddenAccessibleNameDuplicate), and
// an offscreen or display:none duplicate fails isVisible() so it stays skipped.
function isVisibleAriaHiddenJapanese(parent: HTMLElement, blocked: Element): boolean {
    if (!(blocked instanceof HTMLElement) || !safeElementMatches(blocked, '[aria-hidden="true"]')) return false;
    // Only aria-hidden may be the reason this subtree is blocked; any other
    // structural skip (control, mirror, editable surface) still wins — the
    // text node's own element carries the Japanese, so test it, not an ancestor.
    if (safeElementMatches(blocked, SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN)) return false;
    if (parent.closest(SKIP_SELECTOR_WITHOUT_ARIA_HIDDEN)) return false;
    return elementOwnsVisibleJapanese(parent);
}

function ariaHiddenSubtreeHasVisibleJapanese(root: HTMLElement): boolean {
    if (!isTargetLanguageText(root.textContent ?? '')) return false;
    if (elementOwnsVisibleJapanese(root)) return true;
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let inspected = 0, node = walker.nextNode();
        node && inspected < VISIBLE_FRAGMENT_DESCENDANT_LOOKAHEAD_LIMIT;
        inspected += 1, node = walker.nextNode()) {
        if (elementOwnsVisibleJapanese(node as HTMLElement)) return true;
    }
    return false;
}

// A rescue candidate must PAINT its Japanese: the element carrying the direct
// Japanese text node is the one that has to be visible, so a visible wrapper
// around a display:none copy never qualifies on its own.
function elementOwnsVisibleJapanese(element: HTMLElement): boolean {
    if (!elementHasOwnJapaneseText(element)) return false;
    if (isAriaHiddenAccessibleNameDuplicate(element)) return false;
    return isVisible(element);
}

function elementHasOwnJapaneseText(element: HTMLElement): boolean {
    for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && isTargetLanguageText(node.textContent ?? '')) return true;
    }
    return false;
}

// Keep painted hidden copies out when an aria-label supplies a DIFFERENT,
// broader name, or when the nearest control paints another Japanese label
// outside the hidden root. An exact aria-label match is the common component
// pattern where the aria-hidden node is still the control's sole PAINTED label
// (the accessible name has no visual annotation surface of its own).
function isAriaHiddenAccessibleNameDuplicate(element: HTMLElement): boolean {
    const hiddenRoot = element.closest<HTMLElement>('[aria-hidden="true"]');
    if (!hiddenRoot) return false;
    const labelled = element.closest<HTMLElement>('[aria-label]');
    const accessibleName = normalizedControlText(labelled?.getAttribute('aria-label') ?? '');
    const paintedLabel = normalizedControlText(hiddenRoot.textContent ?? '');
    if (accessibleName && accessibleName !== paintedLabel) return true;
    const control = hiddenRoot.closest<HTMLElement>(
        `${PASSIVE_INTERACTION_SELECTOR},${COMPACT_PASSIVE_INTERACTION_SELECTOR}`,
    );
    return Boolean(control && controlHasVisibleJapaneseOutside(control, hiddenRoot));
}

function controlHasVisibleJapaneseOutside(control: HTMLElement, hiddenRoot: HTMLElement): boolean {
    const walker = control.ownerDocument.createTreeWalker(control, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (hiddenRoot.contains(node) || !isTargetLanguageText(node.textContent ?? '')) continue;
        const parent = node.parentElement;
        if (!parent || parent.closest('rt,rp,.jpdb-reader-detached-furi,[hidden],script,style,noscript,template')) continue;
        if (isVisible(parent)) return true;
    }
    return false;
}

function isFragmentParagraphBoundary(
    element: HTMLElement,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    return isPassiveInteractionBoundaryElement(element, options)
        || (options.includeFormChrome && FORM_CHROME_BOUNDARY_TAGS.includes(`,${element.tagName},`))
        || isCustomElementTextBoundary(element)
        || isParagraphBoundary(element);
}

// Unstyled custom elements default to inline, even when the component is a
// card, menu row or comment. Treating adjacent component roots as one sentence
// lets an already-covered child make the combined residual target fail the
// shared-node dedupe check, which is how late YouTube/Reddit labels went bare.
// Preserve genuinely inline prose components, but otherwise let every web
// component own its text boundary without naming any framework or site.
function isCustomElementTextBoundary(element: HTMLElement): boolean {
    if (!element.localName.includes('-') || !isTargetLanguageText(element.textContent ?? '')) return false;
    const parent = element.parentElement;
    return !parent || !isLikelyProseElement(parent);
}

function isPassiveInteractionBoundaryElement(
    element: HTMLElement,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    if (!options.includePassiveInteractions) return false;
    const explicitInteraction = safeElementMatches(element, PASSIVE_INTERACTION_SELECTOR);
    const compactInteraction = safeElementMatches(element, COMPACT_PASSIVE_INTERACTION_SELECTOR);
    const compactChrome = safeElementMatches(element, COMPACT_PASSIVE_CHROME_SELECTOR);
    if (!explicitInteraction && compactInteraction && !isCompactPassiveInteractionElement(element)) {
        return false;
    }
    if (!explicitInteraction && !compactInteraction && compactChrome && !isCompactPassiveChromeElement(element)) {
        return false;
    }
    if (!safeElementMatches(element, PASSIVE_INTERACTION_BOUNDARY_SELECTOR)) return false;
    return !isInlineProsePassiveLink(element);
}

function isInlineProsePassiveLink(element: HTMLElement): boolean {
    if (!element.matches('a[href],[role="link"]')) return false;
    const parent = element.parentElement;
    return Boolean(parent
        && isLikelyProseElement(parent)
        && element.closest('article, main, [role="main"]'));
}

function isInlineSentenceListItem(element: HTMLElement): boolean {
    return element.tagName === 'LI' && Boolean(element.closest('.japanese_sentence'));
}

function isReaderRenderedTextBlock(element: HTMLElement): boolean {
    return READER_RENDERED_TEXT_BLOCK_TAGS.includes(`,${element.tagName},`)
        && Boolean(element.querySelector('.jpdb-reader-word'))
        && !hasRawJapaneseOutsideReaderWords(element);
}

function hasRawJapaneseOutsideReaderWords(element: HTMLElement): boolean {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent || parent.closest('.jpdb-reader-word,.jpdb-reader-text-mirror,.jpdb-reader-control-text-mirror,[data-jpdb-reader-root],script,style,noscript,rt,rp')) {
                return NodeFilter.FILTER_REJECT;
            }
            return isTargetLanguageText(node.textContent ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
    });
    return Boolean(walker.nextNode());
}

function isFragmentPassiveInteractionElement(element: Element, options: FragmentTextTargetCollectionOptions): boolean {
    if (isPassiveInteractionElement(element)) return true;
    return Boolean(options.readerRootPassiveInteractions
        && element.closest(READER_ROOT_SELECTOR)
        && element.closest(PASSIVE_INTERACTION_SELECTOR));
}

function isLayoutSensitiveScanElement(element: HTMLElement | null): boolean {
    if (element && isInsideOwnedReaderRoot(element)) return false;
    let current: HTMLElement | null = element;
    while (current && current !== document.body && current !== document.documentElement) {
        if (isLayoutSensitiveTextBox(current)) return true;
        current = current.parentElement;
    }
    return false;
}

// Roughly three text lines: a clipped box taller than this is a page shell or
// scroll region where ruby can grow freely, not a fixed chrome row that would
// cut the base text. Keeping the test height-based keeps ruby behavior uniform
// across sites instead of needing per-site rules.
const LAYOUT_SENSITIVE_MAX_BOX_HEIGHT = 96;

function isLayoutSensitiveTextBox(element: HTMLElement): boolean {
    const style = safeComputedStyle(element);
    if (isReadablePrimaryDisplayHeadingElement(element)) return false;
    if (hasLineClamp(style)) return true;
    if (isEllipsisTextRow(style)) return true;
    if (!hasClippedTextConstraint(style) && !isPositionedTextOverlay(style)) return false;
    // Unmeasured (0) stays constrained; only a measured tall box is exempt.
    return element.getBoundingClientRect().height <= LAYOUT_SENSITIVE_MAX_BOX_HEIGHT;
}

function trimTextFragments(fragments: TextFragment[]): TextFragment[] {
    const trimmed = fragments.map(fragment => ({ ...fragment }));
    trimFragmentStart(trimmed);
    trimFragmentEnd(trimmed);
    return trimmed;
}

function trimFragmentStart(fragments: TextFragment[]): void {
    while (fragments.length) {
        const first = fragments[0];
        trimFragmentLeadingWhitespace(first);
        if (hasFragmentText(first)) break;
        fragments.shift();
    }
}

function trimFragmentEnd(fragments: TextFragment[]): void {
    while (fragments.length) {
        const last = fragments[fragments.length - 1];
        trimFragmentTrailingWhitespace(last);
        if (hasFragmentText(last)) break;
        fragments.pop();
    }
}

function trimFragmentLeadingWhitespace(fragment: TextFragment): void {
    while (fragmentHasLeadingWhitespace(fragment)) fragment.start += 1;
}

function trimFragmentTrailingWhitespace(fragment: TextFragment): void {
    while (fragmentHasTrailingWhitespace(fragment)) fragment.end -= 1;
}

function fragmentHasLeadingWhitespace(fragment: TextFragment): boolean {
    return hasFragmentText(fragment) && isWhitespaceAt(fragment.node.data, fragment.start);
}

function fragmentHasTrailingWhitespace(fragment: TextFragment): boolean {
    return hasFragmentText(fragment) && isWhitespaceAt(fragment.node.data, fragment.end - 1);
}

function hasFragmentText(fragment: TextFragment): boolean {
    return fragment.start < fragment.end;
}

function isWhitespaceAt(value: string, index: number): boolean {
    return /\s/u.test(value[index] ?? '');
}

function isFragmentTextTarget(target: ScanTextTarget): target is FragmentTextTarget {
    return 'fragments' in target;
}

export function isCurrentScanTarget(target: ScanTextTarget): boolean {
    if (scanTargetDecorationIsStale(target)) return false;
    if (isFragmentTextTarget(target)) return isCurrentFragmentScanTarget(target);
    return target.parent.isConnected
        && target.node.isConnected
        && target.node.parentElement === target.parent
        && (target.node.textContent ?? '').trim() === target.text;
}

// A sealed verdict can go stale between collection and the asynchronous
// apply: a framework may keep the text node but turn its container into a
// textbox/contenteditable (or vice versa). Re-run the deterministic
// classification and drop the target for rescan when the facts changed —
// applying a stale content verdict inside an editor is never acceptable.
function scanTargetDecorationIsStale(target: ScanTextTarget): boolean {
    if (!target.decoration || !target.parent.isConnected) return false;
    const current = isFragmentTextTarget(target)
        ? fragmentTargetDecoration(target.parent, target.fragments)
        : classifyDecoration(target.parent);
    if (isFragmentTextTarget(target) && target.decorationProfileOverride) {
        return current === 'skip' && target.decoration !== 'skip';
    }
    return current !== target.decoration;
}

function isCurrentFragmentScanTarget(target: FragmentTextTarget): boolean {
    if (!target.parent.isConnected) return false;
    if (target.controlTextMirror) return formControlLookupText(target.parent, { selectTextMode: target.controlSelectTextMode }) === target.text;
    if (!target.fragments.length) return Boolean(target.nonDestructive && isTargetLanguageText(target.text));
    const text = target.fragments.map(fragment => {
        if (!fragment.node.isConnected || !fragment.node.parentElement) return null;
        return fragment.node.data.slice(fragment.start, fragment.end);
    });
    return text.every((value): value is string => value !== null)
        && text.join('') === target.text;
}

// Some single-page apps (e.g. the mokuro.moe catalog) reconcile their own DOM
// and strip the word/ruby spans the reader paints into a text node — so the
// reader re-paints, the app strips again, and the title visibly flips between
// plain and annotated ("no space above the text it glitches": adding furigana
// grows the line, the app's resize/reconcile reaction wipes it, repeat).
// Detect a host whose SAME source text we have re-painted several times in a
// short window and permanently switch it to the non-destructive text mirror,
// which overlays an absolutely-positioned copy and never mutates the app's node
// (no text-diff, no height change) — breaking the loop for any such site.
const REPAINT_LOOP_THRESHOLD = 4;
const REPAINT_LOOP_WINDOW_MS = 3000;
const loopingScanHosts = new WeakSet<HTMLElement>();
const scanHostRepaintLog = new WeakMap<HTMLElement, { text: string; times: number[] }>();

function scanHostIsRepaintLooping(host: HTMLElement, text: string): boolean {
    if (loopingScanHosts.has(host)) return true;
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
    const previous = scanHostRepaintLog.get(host);
    const times = (previous && previous.text === text ? previous.times : []).filter(time => now - time < REPAINT_LOOP_WINDOW_MS);
    times.push(now);
    scanHostRepaintLog.set(host, { text, times });
    if (times.length < REPAINT_LOOP_THRESHOLD) return false;
    loopingScanHosts.add(host);
    return true;
}

// Long destructive sources are normally chunked for provider and paint
// budgets. Keep the source whole when the renderer must use one mirror:
// independently mirroring slices would replace the host overlay with only the
// latest slice. Stable sources record one repaint attempt here, while their
// deliberate slices suppress duplicate counting during apply.
export function scanTargetRequiresWholeSourceMirror(target: ScanTextTarget): boolean {
    if (target.nonDestructive || target.insideShadowDOM) return true;
    const host = nonDestructiveScanHost(target);
    if (scanHostRequiresSourcePreservingMirror(host)) return true;
    return !target.suppressRepaintLoopMirror && scanHostIsRepaintLooping(host, target.text);
}

// React/Vue/Angular/Svelte tag every DOM node they render with a private expando
// (e.g. __reactFiber$<hash>, __reactProps$<hash>, __vnode, __ngContext__) and keep
// a live reference to the original Text node in their fiber/vnode/render tree. Our
// destructive paint REPLACES that Text node with word/ruby spans (node.replaceWith),
// so the framework's next re-render calls removeChild/insertBefore on a node that is
// no longer where it expects and throws synchronously — which is exactly the ChatGPT
// failure: a streaming assistant message hits the React error boundary ("このメッセージ
// を表示できません"), and the shared layout collapses (fat composer, displaced send
// button). The repaint-loop/rejection guards below are reactive and fire only AFTER a
// re-render, so they cannot prevent that first synchronous crash, and streaming text
// never repeats identically. Framework-owned targets therefore render
// non-destructively up front: the additive overlay never mutates or hides the
// framework's nodes, so it keeps full ownership and re-renders freely. The
// decision comes from a concrete per-target ownership marker, never a
// document-wide app-shell guess.
const FRAMEWORK_OWNERSHIP_KEY_RE = /^(?:__reactFiber\$|__reactProps\$|__reactInternalInstance\$|__reactContainer\$|__vue__|__vnode|__vueParentComponent|__ngContext__|__svelte)/;
const FRAMEWORK_OWNERSHIP_ANCESTOR_LIMIT = 6;
const frameworkManagedElements = new WeakSet<Element>();

function elementHasFrameworkOwnershipMarker(element: Element): boolean {
    for (const key of Object.getOwnPropertyNames(element)) {
        if (FRAMEWORK_OWNERSHIP_KEY_RE.test(key)) return true;
    }
    return false;
}

// Walk a bounded set of ancestors: frameworks tag most but not every node, and the
// host of a text run is usually a component-rendered element that carries the marker.
function elementIsFrameworkManaged(element: Element | null): boolean {
    let current = element;
    for (let depth = 0; current && depth < FRAMEWORK_OWNERSHIP_ANCESTOR_LIMIT; depth++, current = current.parentElement) {
        if (frameworkManagedElements.has(current)) return true;
        if (elementHasFrameworkOwnershipMarker(current)) {
            frameworkManagedElements.add(current);
            return true;
        }
    }
    return false;
}

function scanHostRequiresSourcePreservingMirror(host: HTMLElement): boolean {
    // Never overlay a mirror inside a rich-text editor; that would corrupt the
    // composer (already skipped at collection, guarded here for defence in depth).
    if (host.closest('[contenteditable="true"]')) return false;
    // Replacing even a quiet article Text node can invalidate a later hydration
    // or navigation commit; waiting for a repaint loop is already one
    // destructive write too late.
    return elementIsFrameworkManaged(host);
}

// The sealed decision is stamped ONCE, at apply time, on the render host (and
// on the classified control ancestor so CSS scoping covers the whole chip).
// The legacy passive-chrome marks (dataset + aria-label side effects that used
// to fire inside the collect-time predicate) are applied here too — apply is
// the only writer; classification itself stays side-effect free.
function stampTargetDecoration(target: ScanTextTarget, host: HTMLElement): void {
    const decoration = target.decoration;
    if (!decoration) return;
    stampDecorationState(host, decoration);
    if (decoration !== 'interactive-passive') return;
    const control = interactivePassiveControl(target.parent);
    if (control) stampDecorationState(control, decoration);
    applyPassiveChromeMarks(compactScanRubySuppression(target.parent).marks);
}

export function applyTokensToScanTarget(target: ScanTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (target.controlTextMirror) {
        applyTokensToControlTextMirrorTarget(target, tokens, settings);
        return;
    }
    if (target.parent instanceof HTMLCanvasElement) {
        applyTokensToCanvasFallbackTarget(target, tokens, settings);
        return;
    }
    // CRITICAL invariant (Phase 1 shadow-DOM scan): a target inside an open
    // shadow root is ALWAYS rendered with the non-destructive mirror and can
    // never fall through to a destructive paint. Destructive paint replaces the
    // component's own Text nodes (node.replaceWith), which corrupts a
    // framework-owned shadow tree's bindings (Shoelace/Spectrum/shreddit) exactly
    // as it crashed the chat apps. The mirror overlays a copy and mutates nothing
    // the component owns. This dominates every other render heuristic below.
    if (target.insideShadowDOM) {
        stampTargetDecoration(target, nonDestructiveScanHost(target));
        applyTokensToNonDestructiveScanTarget(target, tokens, settings);
        return;
    }
    // A fragment target may span several independently laid-out component
    // leaves. Flattening their common ancestor into one absolute text line moves
    // the lookup hit areas away from the native glyphs (and was the root cause
    // of a tap on one word opening a neighbour). Split exact framework-owned
    // targets before choosing a mirror host so every overlay inherits one leaf's
    // real typography and geometry.
    if (isFragmentTextTarget(target) && targetRequiresReactiveLeafMirrors(target)) {
        applyTokensToReactiveLeafMirrors(target, tokens, settings);
        return;
    }
    const nonDestructiveHost = nonDestructiveScanHost(target);
    stampTargetDecoration(target, nonDestructiveHost);
    const sourcePreservingFrameworkHost = !target.nonDestructive && scanHostRequiresSourcePreservingMirror(nonDestructiveHost);
    const repaintLooping = !target.nonDestructive
        && !target.suppressRepaintLoopMirror
        && !sourcePreservingFrameworkHost
        ? scanHostIsRepaintLooping(nonDestructiveHost, target.text)
        : false;
    // Clip-constrained rows are not mirror-rerouted merely because they clip:
    // replacing page-owned layout with a clamped mirror can collapse titles.
    // Framework/shadow/non-destructive hosts still use a source-projected
    // mirror, while ordinary DOM keeps the simpler in-place render path.
    const canUseRequestedNonDestructiveMirror = target.nonDestructive && !nonDestructiveTargetShouldRenderInline(target, nonDestructiveHost);
    if ((!target.forceInlineRender || repaintLooping)
        && (canUseRequestedNonDestructiveMirror || sourcePreservingFrameworkHost || repaintLooping)) {
        applyTokensToNonDestructiveScanTarget(target, tokens, settings);
        return;
    }
    if (isFragmentTextTarget(target)) applyTokensToFragmentTarget(target, tokens, settings);
    else applyTokensToTextNode(target, tokens, settings);
}

function nonDestructiveTargetShouldRenderInline(target: ScanTextTarget, host: HTMLElement): boolean {
    if (!isFragmentTextTarget(target)) return false;
    if (!target.fragments.length) return false;
    if (scanHostRequiresSourcePreservingMirror(host)) return false;
    return targetLeavesVisibleBlockDescendantTextUncovered(target, host);
}

function targetRequiresReactiveLeafMirrors(target: FragmentTextTarget): boolean {
    const parents = target.fragments
        .map(fragment => fragment.node.parentElement)
        .filter((parent): parent is HTMLElement => Boolean(parent));
    const uniqueParents = [...new Set(parents)];
    if (uniqueParents.length < 2) return false;
    // Inline markup often splits one visual line into an outer Text node and a
    // nested span (登<span>録者</span>). Its outer parent still owns one coherent
    // layout surface, so a single mirror preserves the cross-node word. Only
    // split genuinely independent leaves; otherwise later discontiguous runs on
    // the same outer parent would replace the earlier mirror and lose a glyph.
    if (uniqueParents.some(parent => uniqueParents.every(candidate => parent.contains(candidate)))) return false;
    // Explicit non-destructive profiles (including generic dynamic-page
    // adapters) carry the same source-preservation promise even when a
    // framework exposes no private ownership marker. Never flatten their
    // independently laid-out leaves into one common-ancestor overlay.
    return Boolean(target.nonDestructive)
        || uniqueParents.some(parent => scanHostRequiresSourcePreservingMirror(parent));
}

interface ReactiveLeafRun {
    parent: HTMLElement;
    fragments: IndexedTextFragment[];
    globalStart: number;
    globalEnd: number;
}

function applyTokensToReactiveLeafMirrors(target: FragmentTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    const indexed = indexTextFragments(target.fragments);
    for (const run of reactiveLeafRuns(indexed)) {
        const text = target.text.slice(run.globalStart, run.globalEnd);
        const runTokens = tokens
            .map(token => tokenPieceForReactiveLeaf(token, run.globalStart, run.globalEnd))
            .filter((token): token is JPDBToken => token !== null);
        if (!runTokens.length || !isTargetLanguageText(text)) continue;
        const crossesLeafBoundary = tokens.some(token => token.start < run.globalStart && token.end > run.globalStart
            || token.start < run.globalEnd && token.end > run.globalEnd);
        const leafTarget: FragmentTextTarget = {
            ...target,
            text,
            parent: run.parent,
            fragments: run.fragments.map(fragment => ({
                node: fragment.node,
                start: fragment.start,
                end: fragment.end,
                hasNativeRuby: fragment.hasNativeRuby,
                layoutSensitive: fragment.layoutSensitive,
                passiveInteraction: fragment.passiveInteraction,
            })),
            nonDestructive: true,
            suppressRuby: target.suppressRuby || crossesLeafBoundary,
        };
        const host = nonDestructiveScanHost(leafTarget);
        stampTargetDecoration(leafTarget, host);
        applyTokensToNonDestructiveScanTarget(leafTarget, runTokens, settings);
    }
}

function reactiveLeafRuns(fragments: IndexedTextFragment[]): ReactiveLeafRun[] {
    const runs: ReactiveLeafRun[] = [];
    for (const fragment of fragments) {
        const parent = fragment.node.parentElement;
        if (!parent) continue;
        const previous = runs[runs.length - 1];
        if (previous?.parent === parent && previous.globalEnd === fragment.globalStart) {
            previous.fragments.push(fragment);
            previous.globalEnd = fragment.globalEnd;
        } else {
            runs.push({
                parent,
                fragments: [fragment],
                globalStart: fragment.globalStart,
                globalEnd: fragment.globalEnd,
            });
        }
    }
    return runs;
}

function tokenPieceForReactiveLeaf(token: JPDBToken, runStart: number, runEnd: number): JPDBToken | null {
    const start = Math.max(token.start, runStart);
    const end = Math.min(token.end, runEnd);
    if (end <= start) return null;
    const delta = -runStart;
    return {
        ...token,
        start: start + delta,
        end: end + delta,
        length: end - start,
        // A reading that crosses a component boundary has no safe single lane.
        // Keep the word identity/pitch on each source piece and omit only that
        // furigana rather than letting it overlap a neighbouring UI row.
        rubies: token.rubies
            .filter(ruby => ruby.start >= start && ruby.end <= end)
            .map(ruby => ({ ...ruby, start: ruby.start + delta, end: ruby.end + delta })),
    };
}

function targetLeavesVisibleBlockDescendantTextUncovered(target: FragmentTextTarget, host: HTMLElement): boolean {
    if (!host.querySelector(':scope p,:scope div,:scope li,:scope dl,:scope dt,:scope dd,:scope section,:scope article,:scope blockquote')) return false;
    const covered = new Set(target.fragments.map(fragment => fragment.node));
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
            const parent = node.parentElement;
            if (!parent || covered.has(node as Text)) return NodeFilter.FILTER_REJECT;
            if (parent.closest(MIRROR_PLAN_TEXT_SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
            const block = parent.closest<HTMLElement>('p,div,li,dl,dt,dd,section,article,blockquote');
            if (!block || block === host || !host.contains(block)) return NodeFilter.FILTER_REJECT;
            return (node.textContent ?? '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
    });
    return Boolean(walker.nextNode());
}

// Plain text nodes WE interspersed between word-spans during destructive paint.
// Tracked so a duplicate-insert repair can drop exactly our paint remnants and
// never a page-owned sibling (adjacency alone is not a reliable ownership signal).
const destructivePaintTextNodes = new WeakSet<Text>();

function registerDestructivePaintTextNodes(root: Node): void {
    // A bare replacement text node (a plain fragment gap) has no subtree to walk.
    if (root.nodeType === Node.TEXT_NODE) {
        destructivePaintTextNodes.add(root as Text);
        return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        // Text inside our word-spans is removed by selector; only the plain text
        // we placed between them needs explicit ownership tracking.
        if (!(node.parentElement && node.parentElement.closest(READER_WORD_SELECTOR))) {
            destructivePaintTextNodes.add(node as Text);
        }
    }
}

export function applyTokensToTextNode(target: TextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (!tokens.length || !target.node.parentElement) return;
    // Defence-in-depth: never destructively replace a node that lives inside a
    // shadow root — that corrupts a framework-owned shadow tree. applyTokensTo-
    // ScanTarget already routes shadow targets to the mirror, but this exported
    // primitive enforces the invariant at the point of the replaceWith too, so a
    // future caller cannot reach destructive paint on a shadow node.
    if (target.insideShadowDOM || target.node.getRootNode() instanceof ShadowRoot) {
        applyTokensToNonDestructiveScanTarget({ ...target, insideShadowDOM: true }, tokens, settings);
        return;
    }

    const text = target.text;
    const safeTokens = nonOverlappingTokens(tokens, text);
    if (!safeTokens.length) return;

    const fragment = renderTokenizedTextFragment(target, safeTokens, settings);
    registerDestructivePaintTextNodes(fragment);
    target.node.replaceWith(fragment);
    styleDetachedReadingElements(target.parent, target.parent);
    stabilizeDetachedReadings(target.parent, closestRubyFragileConstrainedRow(target.parent));
    markRenderedScanTarget(target);
}

function renderTokenizedTextFragment(target: TextTarget, tokens: JPDBToken[], settings: ReaderSettings): DocumentFragment {
    const fragment = renderTokenizedScanText(target.text, tokens, settings, {
        parent: target.parent,
        hasNativeRuby: target.hasNativeRuby,
        decoration: target.decoration,
        suppressRuby: target.suppressRuby,
        proseWrap: target.proseWrap,
        passiveInteraction: target.passiveInteraction,
    });
    return wrapDirectFlexGridTextRun(fragment, target.parent);
}

function renderTokenizedScanText(
    text: string,
    tokens: JPDBToken[],
    settings: ReaderSettings,
    target: { parent: HTMLElement; hasNativeRuby?: boolean; decoration?: DecorationState; suppressRuby?: boolean; detachedReadings?: boolean; proseWrap?: boolean; passiveInteraction?: boolean; suppressRubyDoesNotImplyPassive?: boolean; mirrorRender?: boolean },
): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const suppressRuby = scanTargetSuppressesRuby(target.parent, target.suppressRuby, !target.mirrorRender, target.decoration);
    const passiveInteraction = target.passiveInteraction || (suppressRuby && !target.suppressRubyDoesNotImplyPassive);
    const renderSettings = furiganaSettingsForTarget(settings, target.parent);
    let offset = 0;
    const tokenPlans = tokens.map(token => ({
        token,
        tokenWithSentence: tokenWithReadableSentence(token, text, token.sentence),
    }));
    const miningInsightKeys = miningInsightTokenKeys(tokenPlans.map(plan => plan.tokenWithSentence));
    for (const plan of tokenPlans) {
        const { token, tokenWithSentence } = plan;
        appendPlainTextBeforeToken(fragment, text, offset, token.start, true);
        fragment.append(renderToken(text.slice(token.start, token.end), tokenWithSentence, renderSettings, {
            // Content in clipped rows and interactive controls use detached
            // readings so the native centred line box remains invariant on
            // WebKit while the reading stays visible above the text.
            allowRuby: !target.hasNativeRuby && (!suppressRuby || (target.detachedReadings ?? true)),
            detachedReadings: target.detachedReadings ?? suppressRuby,
            kanjiNavigation: kanjiNavigationForElement(target.parent),
            scanWord: true,
            proseWrap: target.proseWrap === true,
            passiveInteraction,
            preserveTokenRubies: true,
            miningInsightKeys,
        }));
        offset = token.end;
    }
    appendPlainTextBeforeToken(fragment, text, offset, text.length);
    return fragment;
}

// A non-destructive mirror HIDES the entire host element and paints the rendered
// text over it, so the mirror must reproduce the host's COMPLETE text — not just
// the scanned fragment(s). Framework-managed shells (React/Vue/Angular/Svelte and
// custom-element apps such as Reddit's shreddit) force every target to render
// non-destructively, and the residual/generic scan emits targets that cover only
// the CJK-bearing text node of a mixed-script block (e.g. an English sentence with
// one inline 中文 run, or inline <a> links splitting the prose). Rendering only
// target.text would then hide every surrounding non-Japanese word with the host —
// the "text randomly vanishing" bug. So expand the plan to the host's full text and
// remap the scanned tokens into its coordinate space; the untokenized remainder is
// re-emitted verbatim as plain text by renderTokenizedScanText.
function nonDestructiveHostRenderPlan(
    host: HTMLElement,
    target: ScanTextTarget,
    tokens: JPDBToken[],
): { text: string; tokens: JPDBToken[]; whitespaceJoints?: number[]; hostText: string } {
    const fragments = nonDestructiveTargetFragments(target);
    const { hostText, nodeOffsets, whitespaceJoints } = hostOriginalTextWithNodeOffsets(host);
    // Identical text needs no token remap, but it MUST keep the joints: a
    // multi-node fragment target covering the whole host (the common Discord
    // shape) — and a replayed cached render (class Y/BB, fragments already
    // detached) — would otherwise lose the layout model and re-invent spaces.
    if (hostText && hostText === target.text) return { text: hostText, tokens, whitespaceJoints, hostText };
    if (!fragments.length || !hostText) return { text: target.text, tokens, hostText };
    const indexed = indexTextFragments(fragments);
    const dropped: JPDBToken[] = [];
    const remapped = tokens
        .map(token => {
            const remappedToken = remapTokenIntoHostText(token, indexed, nodeOffsets, hostText);
            if (!remappedToken) dropped.push(token);
            return remappedToken;
        })
        .filter((token): token is JPDBToken => token !== null);
    const pruned = nonOverlappingTokens(remapped, hostText);
    const prunedSet = new Set(pruned);
    dropped.push(...remapped.filter(token => !prunedSet.has(token)));
    const rendered = withHostRemapGapFallbackTokens(pruned, dropped, indexed, nodeOffsets, hostText);
    return {
        text: hostText,
        tokens: withRetainedNeighbourTokens(host, hostText, targetHostRanges(fragments, nodeOffsets), rendered),
        whitespaceJoints,
        hostText,
    };
}

// The parser's segmented gap-fill guarantees every Japanese range of
// target.text carries a token — but that guarantee is issued in TARGET
// coordinates. The host remap above can still drop a provider token (fragment
// boundaries that no longer align, host-text drift), and the segmented
// fallback for that exact range was suppressed by the very token that just
// got dropped, so the range rendered as a fully-bare hole while its
// neighbours annotated (エージェント型 class, 2026-07-19). Refill ONLY the
// dropped tokens' own character ranges — mapped char-by-char into host
// coordinates — with bare fallback tokens, so a remap loss degrades to an
// annotated-but-unenriched word instead of un-annotated raw text. Ranges the
// parser deliberately left bare have no dropped token and stay untouched.
function withHostRemapGapFallbackTokens(
    tokens: JPDBToken[],
    dropped: JPDBToken[],
    indexed: IndexedTextFragment[],
    nodeOffsets: Map<Text, number>,
    hostText: string,
): JPDBToken[] {
    if (!dropped.length) return tokens;
    const additions: JPDBToken[] = [];
    for (const token of dropped) {
        for (const range of hostRangesForTargetRange(token.start, token.end, indexed, nodeOffsets, hostText)) {
            collectHostGapFallbackTokens(tokens, hostText, range.start, range.end, additions);
        }
    }
    if (!additions.length) return tokens;
    return nonOverlappingTokens(
        [...tokens, ...additions].sort((first, second) => first.start - second.start
            || (second.end - second.start) - (first.end - first.start)),
        hostText,
    );
}

// Maps a target-coordinate range into contiguous host-coordinate runs via the
// scanned fragments. Each mapped character is verified against the host text;
// drifted characters end the current run (the mirror renders hostText, so a
// stale mapping must never mint tokens over different bytes).
function hostRangesForTargetRange(
    start: number,
    end: number,
    indexed: IndexedTextFragment[],
    nodeOffsets: Map<Text, number>,
    hostText: string,
): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    let runStart = -1;
    let expectedNext = -1;
    for (let offset = Math.max(0, start); offset < end; offset += 1) {
        const hostIndex = hostIndexForTargetOffset(offset, indexed, nodeOffsets);
        const sourceChar = sourceCharForTargetOffset(offset, indexed);
        const aligned = hostIndex !== null
            && hostIndex >= 0
            && hostIndex < hostText.length
            && sourceChar !== null
            && hostText[hostIndex] === sourceChar;
        if (aligned && hostIndex === expectedNext && runStart >= 0) {
            expectedNext = hostIndex + 1;
            continue;
        }
        if (runStart >= 0) ranges.push({ start: runStart, end: expectedNext });
        runStart = aligned ? hostIndex : -1;
        expectedNext = aligned ? hostIndex + 1 : -1;
    }
    if (runStart >= 0) ranges.push({ start: runStart, end: expectedNext });
    return ranges;
}

function hostIndexForTargetOffset(
    offset: number,
    indexed: IndexedTextFragment[],
    nodeOffsets: Map<Text, number>,
): number | null {
    for (const fragment of indexed) {
        if (offset < fragment.globalStart || offset >= fragment.globalEnd) continue;
        const base = nodeOffsets.get(fragment.node);
        if (base === undefined) return null;
        return base + fragment.start + (offset - fragment.globalStart);
    }
    return null;
}

function sourceCharForTargetOffset(offset: number, indexed: IndexedTextFragment[]): string | null {
    for (const fragment of indexed) {
        if (offset < fragment.globalStart || offset >= fragment.globalEnd) continue;
        return fragment.node.data[fragment.start + (offset - fragment.globalStart)] ?? null;
    }
    return null;
}

function collectHostGapFallbackTokens(
    tokens: JPDBToken[],
    hostText: string,
    rangeStart: number,
    rangeEnd: number,
    additions: JPDBToken[],
): void {
    const isCovered = (start: number, end: number): boolean => (
        tokens.some(token => token.start < end && start < token.end)
        || additions.some(token => token.start < end && start < token.end)
    );
    for (const gap of uncoveredJapaneseRanges(hostText, rangeStart, rangeEnd, isCovered)) {
        appendSegmentedHostFallbackTokens(hostText, gap.start, gap.end, additions);
    }
}

function appendSegmentedHostFallbackTokens(
    hostText: string,
    gapStart: number,
    gapEnd: number,
    additions: JPDBToken[],
): void {
    for (const segment of segmentTargetLanguageText(hostText.slice(gapStart, gapEnd))) {
        additions.push({
            card: bareFallbackCardFromText(segment.text, activeLearningTargetLanguage()),
            start: gapStart + segment.start,
            end: gapStart + segment.end,
            length: segment.end - segment.start,
            rubies: [],
            pitchClass: '',
            sentence: hostText,
        });
    }
}

interface HostTextRange {
    start: number;
    end: number;
}

// Where a target's own text sits in its host's projected text. Null when any
// fragment is not part of that projection (a hidden or reader-owned node the
// plan walk rejected) — callers then have no trustworthy claim to any range.
function targetHostRanges(fragments: TextFragment[], nodeOffsets: Map<Text, number>): HostTextRange[] | null {
    const ranges: HostTextRange[] = [];
    for (const fragment of fragments) {
        const base = nodeOffsets.get(fragment.node);
        if (base === undefined) return null;
        const start = base + Math.max(0, fragment.start);
        const end = base + Math.min(fragment.node.data.length, fragment.end);
        if (end > start) ranges.push({ start, end });
    }
    return ranges;
}

function hostRangesOverlap(first: HostTextRange, second: HostTextRange): boolean {
    return first.start < second.end && second.start < first.end;
}

// A mirror is HOST-scoped — it reproduces the host's whole text — but one apply
// renders exactly ONE target. Two independently collected lines under the same
// framework-owned host therefore used to take turns: mounting the second line's
// mirror tore the first line's words down with the mirror they lived in, so the
// row could never be more than half annotated, and a settle scan that correctly
// re-offered the bare half made the two halves alternate on every scroll.
//
// Carry the standing render's tokens for the ranges this target does NOT own
// into the new render, so a neighbour's paint augments the host instead of
// erasing it. Everything inside this target's own ranges is re-derived from the
// incoming tokens, so a re-parse can still drop, move or restate its own words.
function withRetainedNeighbourTokens(
    host: HTMLElement,
    hostText: string,
    ownRanges: HostTextRange[] | null,
    tokens: JPDBToken[],
): JPDBToken[] {
    if (!ownRanges?.length) return tokens;
    const mirror = currentTextMirror(host);
    if (!mirror || !textMirrorRenderIsIntact(mirror) || mirror.dataset.sourceText !== hostText) return tokens;
    // The cache holds the exact token set the standing mirror was mounted from,
    // and the render is a pure function of (text, tokens, settings) — so for
    // the same host, epoch and text those tokens ARE the words on screen.
    const entry = nonDestructiveRenderCache.get(host);
    if (!entry || entry.epoch !== nonDestructiveRenderCacheEpoch || entry.planText !== hostText) return tokens;
    const retained = entry.tokens.filter(token => token.start >= 0
        && token.end > token.start
        && token.end <= hostText.length
        && !ownRanges.some(range => hostRangesOverlap(token, range)));
    if (!retained.length) return tokens;
    return nonOverlappingTokens(
        [...tokens, ...retained].sort((first, second) => first.start - second.start
            || (second.end - second.start) - (first.end - first.start)),
        hostText,
    );
}

// Text the host never paints must not reach the mirror either — the mirror
// replaces the host's visible rendering, so mirroring script/[hidden] text
// would paint duplicate labels the page keeps invisible. aria-hidden stays
// included: it hides from the a11y tree only and is often visually rendered.
// Native rt/rp are ruby ANNOTATION boxes, not base-line content: flattening
// them into the plan text would render 東京とうきょう as ordinary prose.
const MIRROR_PLAN_TEXT_SKIP_SELECTOR = `${READER_OWNED_TEXT_SELECTOR},script,style,noscript,template,[hidden],rt,rp`;

// The host's source text in document order, skipping any reader-owned subtree (a
// prior mirror / annotated word / reader root) and never-painted nodes so the
// mirror renders — and re-scans compare against — the page's visible text.
// Never-painted covers computed-hidden text (a display:none / visibility:hidden
// ANCESTOR, not just the direct parent) and collapsible whitespace-only nodes
// directly inside flex/grid/table containers, which browsers drop at layout:
// mirroring either paints text the page never shows (duplicate/garbled rows,
// class R).
//
// whitespaceJoints marks hostText offsets between two adjacent text nodes whose
// intervening whitespace the page cannot render (separate flex/grid/table items
// or block boxes). The collapse pass must not synthesize a space there.
function hostOriginalTextWithNodeOffsets(host: HTMLElement): {
    hostText: string;
    nodeOffsets: Map<Text, number>;
    whitespaceJoints: number[];
} {
    const nodeOffsets = new Map<Text, number>();
    const whitespaceJoints: number[] = [];
    const styles = new MirrorPlanStyleProbe(host);
    let hostText = '';
    let previousNode: Text | null = null;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
            const parent = node.parentElement;
            if (!parent || parent.closest(MIRROR_PLAN_TEXT_SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
            if (styles.isComputedHidden(parent)) return NodeFilter.FILTER_REJECT;
            if (!(node as Text).data.trim() && styles.dropsWhitespaceOnlyChild(parent)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (previousNode && !styles.rendersInterNodeWhitespace(previousNode, node as Text)) {
            whitespaceJoints.push(hostText.length);
        }
        previousNode = node as Text;
        nodeOffsets.set(node as Text, hostText.length);
        hostText += (node as Text).data;
    }
    return { hostText, nodeOffsets, whitespaceJoints };
}

// Containers whose child boxes are laid out as items/cells: collapsible
// whitespace-only text directly inside them is dropped by layout.
function isItemizedContainerDisplay(display: string): boolean {
    return display === 'flex' || display === 'grid' || display === 'inline-flex' || display === 'inline-grid'
        || display === 'table' || display === 'inline-table' || display === 'table-row'
        || display === 'table-row-group' || display === 'table-header-group' || display === 'table-footer-group';
}

function preservesWhitespace(whiteSpace: string): boolean {
    return whiteSpace === 'pre' || whiteSpace === 'pre-wrap' || whiteSpace === 'pre-line' || whiteSpace === 'break-spaces';
}

// Per-plan computed-style probe: memoizes getComputedStyle per element and
// answers the layout questions the mirror-plan text walk needs.
class MirrorPlanStyleProbe {
    private readonly styleCache = new Map<HTMLElement, CSSStyleDeclaration>();
    private readonly hiddenCache = new Map<HTMLElement, boolean>();
    private readonly flattenedCache = new Map<HTMLElement, Node[]>();

    constructor(private readonly host: HTMLElement) {}

    private styleOf(element: HTMLElement): CSSStyleDeclaration {
        let style = this.styleCache.get(element);
        if (!style) {
            style = safeComputedStyle(element);
            this.styleCache.set(element, style);
        }
        return style;
    }

    // Computed display with a tag-based fallback: jsdom computes '' for
    // un-styled elements (browsers never do), so tests exercise the same
    // block/inline decisions a real engine makes.
    private displayOf(element: HTMLElement): string {
        const display = this.styleOf(element).display;
        if (display) return display;
        return BLOCK_TAGS.has(element.tagName) ? 'block' : 'inline';
    }

    // display:none anywhere on the ancestor chain (up to the host) removes the
    // whole subtree from rendering; getComputedStyle does NOT resolve that for
    // descendants (an <em> inside a display:none <span> still computes
    // display:inline), so this walks. Visibility uses the element's OWN
    // computed value: browsers resolve inheritance in the computed value, and
    // CSS 2.2 lets an explicitly visibility:visible descendant render under a
    // hidden ancestor — an ancestor walk would wrongly drop it. The one
    // exception: while a previous mirror hides the host (Yomu's own
    // visibility:hidden !important), descendants inherit that value, so all
    // visibility verdicts are suspended for the re-plan (display:none still
    // counts). The HOST itself is never "hidden" here for the same reason.
    isComputedHidden(element: HTMLElement): boolean {
        if (element === this.host) return false;
        if (this.isDisplayNoneHidden(element)) return true;
        if (this.hostVisibilityInjected) return false;
        const visibility = this.styleOf(element).visibility;
        return visibility === 'hidden' || visibility === 'collapse';
    }

    private get hostVisibilityInjected(): boolean {
        return this.host.style.getPropertyValue('visibility') === 'hidden';
    }

    private isDisplayNoneHidden(element: HTMLElement): boolean {
        if (element === this.host) return false;
        const cached = this.hiddenCache.get(element);
        if (cached !== undefined) return cached;
        const hidden = this.styleOf(element).display === 'none'
            || (element.parentElement ? this.isDisplayNoneHidden(element.parentElement) : false);
        this.hiddenCache.set(element, hidden);
        return hidden;
    }

    // A whitespace-only child sequence of an itemized container (resolved
    // THROUGH display:contents wrappers) never becomes a box — per
    // css-flexbox-1 §4 this holds regardless of the white-space property.
    dropsWhitespaceOnlyChild(parent: HTMLElement): boolean {
        const container = this.throughContents(parent);
        return container !== null && isItemizedContainerDisplay(this.displayOf(container));
    }

    private throughContents(element: HTMLElement): HTMLElement | null {
        let current: HTMLElement | null = element;
        while (current && this.displayOf(current) === 'contents') current = current.parentElement;
        return current;
    }

    // Whether the page can render whitespace between two consecutive text
    // nodes. The whitespace lives inside their closest common ancestor,
    // resolved through display:contents to the box that actually lays it out
    // (css-display-4: contents elements are elided from box construction, so
    // items are resolved against the FLATTENED child list, not the DOM). An
    // itemized container drops inter-item whitespace — except between nodes
    // of one contiguous flattened text run, which form a single anonymous
    // item; a block-level box on either side collapses boundary whitespace.
    // Only when both sides participate inline-level in the shared context
    // does the space render. Atomic inline-level boxes (inline-flex/
    // inline-grid/inline-block) participate IN the surrounding context, so
    // whitespace beside them is real.
    rendersInterNodeWhitespace(previous: Text, current: Text): boolean {
        const lca = this.commonAncestorElement(previous, current);
        if (!lca) return true;
        const container = this.throughContents(lca);
        if (!container) return true;
        const previousItem = this.flattenedItemChild(container, previous);
        const currentItem = this.flattenedItemChild(container, current);
        if (isItemizedContainerDisplay(this.displayOf(container))) {
            if (!(previousItem instanceof Text && currentItem instanceof Text)) return false;
            return this.flattenedContiguousText(container, previousItem, currentItem);
        }
        if (preservesWhitespace(this.styleOf(container).whiteSpace)) return true;
        return this.participatesInline(previousItem) && this.participatesInline(currentItem);
    }

    private participatesInline(node: Node): boolean {
        if (!(node instanceof HTMLElement)) return true;
        const display = this.displayOf(node);
        return display === 'inline' || display.startsWith('inline-') || display.startsWith('ruby');
    }

    // The box-tree child of `container` a text node belongs to: the OUTERMOST
    // non-contents element on the DOM path, or the text node itself when the
    // whole path is display:contents (a flattened direct text run).
    private flattenedItemChild(container: HTMLElement, node: Text): Node {
        let item: Node = node;
        for (let element = node.parentElement; element && element !== container; element = element.parentElement) {
            if (this.displayOf(element) !== 'contents') item = element;
        }
        return item;
    }

    // Whether two flattened direct text nodes sit in one contiguous text run
    // (nothing but text nodes between them in the container's FLATTENED child
    // list) — such a run becomes a single anonymous item whose internal
    // whitespace renders normally.
    private flattenedContiguousText(container: HTMLElement, first: Text, second: Text): boolean {
        const flattened = this.flattenedChildren(container);
        const start = flattened.indexOf(first);
        const end = flattened.indexOf(second);
        if (start < 0 || end <= start) return false;
        return flattened.slice(start + 1, end).every(node => node.nodeType === Node.TEXT_NODE);
    }

    private flattenedChildren(container: HTMLElement): Node[] {
        const cached = this.flattenedCache.get(container);
        if (cached) return cached;
        const flattened: Node[] = [];
        const visit = (element: HTMLElement): void => {
            for (const child of Array.from(element.childNodes)) {
                if (child instanceof HTMLElement && this.displayOf(child) === 'contents') visit(child);
                else flattened.push(child);
            }
        };
        visit(container);
        this.flattenedCache.set(container, flattened);
        return flattened;
    }

    private commonAncestorElement(a: Text, b: Text): HTMLElement | null {
        const ancestors = new Set<HTMLElement>();
        for (let element = a.parentElement; element; element = element.parentElement) ancestors.add(element);
        for (let element = b.parentElement; element; element = element.parentElement) {
            if (ancestors.has(element)) return element;
        }
        return null;
    }
}

function nonDestructiveTargetFragments(target: ScanTextTarget): TextFragment[] {
    if (isFragmentTextTarget(target)) return target.fragments;
    const data = target.node.data;
    const lead = data.length - data.trimStart().length;
    return [{
        node: target.node,
        start: lead,
        end: lead + target.text.length,
        hasNativeRuby: Boolean(target.hasNativeRuby),
        layoutSensitive: target.layoutSensitive,
        passiveInteraction: target.passiveInteraction,
    }];
}

// Shift a token from target.text coordinates into the host's full-text coordinates.
// Cross-fragment tokens are safe when the host's visible text contains the same
// contiguous surface; the non-destructive mirror renders over host text, not DOM
// nodes, so one reader word can span sibling text nodes without mutating them.
function remapTokenIntoHostText(
    token: JPDBToken,
    indexed: IndexedTextFragment[],
    nodeOffsets: Map<Text, number>,
    hostText: string,
): JPDBToken | null {
    const start = findFragmentBoundary(indexed, token.start, 'start');
    const end = findFragmentBoundary(indexed, token.end, 'end');
    if (!start || !end) return null;
    const hostStart = hostTextOffsetForBoundary(start, nodeOffsets);
    const hostEnd = hostTextOffsetForBoundary(end, nodeOffsets);
    if (hostStart === null || hostEnd === null) return null;
    if (hostStart < 0 || hostEnd <= hostStart || hostEnd > hostText.length) return null;
    const surface = textFragmentSurface(indexed, token.start, token.end);
    if (!surface || hostText.slice(hostStart, hostEnd) !== surface) return null;
    return shiftTokenOffsets(token, hostStart - token.start);
}

function hostTextOffsetForBoundary(boundary: FragmentBoundaryMatch, nodeOffsets: Map<Text, number>): number | null {
    const base = nodeOffsets.get(boundary.fragment.node);
    return base === undefined ? null : base + boundary.localOffset;
}

function textFragmentSurface(indexed: IndexedTextFragment[], start: number, end: number): string {
    if (end <= start) return '';
    return indexed
        .filter(fragment => fragment.globalEnd > start && fragment.globalStart < end)
        .map(fragment => {
            const localStart = fragment.start + Math.max(start, fragment.globalStart) - fragment.globalStart;
            const localEnd = fragment.start + Math.min(end, fragment.globalEnd) - fragment.globalStart;
            return fragment.node.data.slice(localStart, localEnd);
        })
        .join('');
}

function shiftTokenOffsets(token: JPDBToken, delta: number): JPDBToken {
    if (delta === 0) return token;
    return {
        ...token,
        start: token.start + delta,
        end: token.end + delta,
        rubies: token.rubies.map(ruby => ({ ...ruby, start: ruby.start + delta, end: ruby.end + delta })),
    };
}

interface NonDestructiveMirrorRenderContext {
    text: string;
    safeTokens: JPDBToken[];
    renderPlan: { text: string; tokens: JPDBToken[] };
    renderSettings: ReaderSettings;
    signature: string;
    whitespaceJointsKey: string;
    clipRow: HTMLElement | null;
    detachedReadings: boolean;
    suppressRuby: boolean;
    hostText: string;
}

function nonDestructiveMirrorRenderContext(
    host: HTMLElement,
    target: ScanTextTarget,
    tokens: JPDBToken[],
    settings: ReaderSettings,
): NonDestructiveMirrorRenderContext {
    // Do not restore ancestor clips while merely deriving a render plan.
    // Mirror hosts can nest: a sibling/outer scan that ultimately has no work
    // must not close a clip already opened for a descendant. Reclassification
    // belongs to the mount/reuse/late-heal paths, immediately beside the
    // measured lane settle that commits the next visibility verdict.
    const plan = nonDestructiveHostRenderPlan(host, target, nonOverlappingTokens(tokens, target.text));
    const text = plan.text;
    const safeTokens = plan.tokens;
    // A preserving host (pre/pre-wrap/pre-line/break-spaces) renders its
    // whitespace runs verbatim, and the mirror copies the host's white-space
    // style — collapsing would turn real indentation/newlines into one space.
    const renderPlan = preservesWhitespace(safeComputedStyle(host).whiteSpace)
        ? { text, tokens: safeTokens }
        : whitespaceCollapsedNonDestructiveRender(text, safeTokens, plan.whitespaceJoints);
    const suppressRuby = scanTargetSuppressesRuby(host, target.suppressRuby, false, target.decoration);
    const renderSettings = furiganaSettingsForTarget(settings, host);
    const { clipRow, detachedReadings } = textMirrorClipMode(
        host,
        renderPlan,
        renderSettings,
        targetHasNativeRuby(target),
    );
    const signature = nonDestructiveScanSignature(target, safeTokens, renderSettings, suppressRuby, detachedReadings);
    // The rendered text depends on the host's LAYOUT (whitespace joints from
    // computed display contexts), not just its source text: a framework can
    // flip a host block→flex with identical text, changing which whitespace
    // the page renders. Fingerprint the joints so that flip re-renders instead
    // of keeping a stale mirror the observers cannot repair.
    const whitespaceJointsKey = (plan.whitespaceJoints ?? []).join(',');
    return {
        text,
        safeTokens,
        renderPlan,
        renderSettings,
        signature,
        whitespaceJointsKey,
        clipRow,
        detachedReadings,
        suppressRuby,
        hostText: plan.hostText,
    };
}

function applyTokensToNonDestructiveScanTarget(target: ScanTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    const host = nonDestructiveScanHost(target);
    if (!host.isConnected) return;
    const context = nonDestructiveMirrorRenderContext(host, target, tokens, settings);
    if (reuseCurrentTextMirror(host, context)) return;
    removeTextMirror(host);
    if (!context.safeTokens.length) return;
    mountNonDestructiveTextMirror(host, target, settings, context);
}

function reuseCurrentTextMirror(host: HTMLElement, context: NonDestructiveMirrorRenderContext): boolean {
    const existing = currentTextMirror(host);
    const structureMatches = [
        existing && textMirrorRenderIsIntact(existing),
        existing?.dataset.sourceText === context.text,
        (existing?.dataset.whitespaceJoints ?? '') === context.whitespaceJointsKey,
        existing?.classList.contains('jpdb-reader-additive-text-mirror'),
    ].every(Boolean);
    if (!structureMatches || !existing) return false;
    const exactMatch = existing.dataset.renderSignature === context.signature;
    // Dynamic component trees can schedule the same source twice. Annotation
    // facts are monotonic regardless of provider provenance: a sparse repaint
    // cannot remove a reading or pitch fact already attached to the same source
    // range, while richer or conflicting data takes the ordinary replacement
    // path.
    if (!exactMatch && !existingMirrorHasMoreCompleteAnnotations(existing, context)) return false;
    if (!exactMatch) refreshRetainedMirrorCardStatus(existing, context);
    const state = textMirrorHosts.get(host);
    if (state) reassertTextMirrorHostStyles(host, state);
    if (context.detachedReadings || existing.dataset.yomuDetachedReadings === 'true') {
        stabilizeDetachedReadings(existing, context.clipRow, true);
    }
    return true;
}

function existingMirrorHasMoreCompleteAnnotations(
    existing: HTMLElement,
    context: NonDestructiveMirrorRenderContext,
): boolean {
    const existingSettings = tokenIndependentMirrorSignature(existing.dataset.renderSignature ?? '');
    const incomingSettings = tokenIndependentMirrorSignature(context.signature);
    if (!existingSettings || existingSettings !== incomingSettings) return false;

    const wordsByRange = indexMirrorWordsByRange(existing);
    if (!wordsByRange) return false;
    const matches = context.renderPlan.tokens
        .map(token => matchMirrorWordRange(wordsByRange, token, context.renderPlan.text));
    if (matches.some(match => match === null)) return false;

    const rangeMatches = matches.filter(isMirrorWordRangeMatch);
    const facts = rangeMatches.map(({ word, token }) => compareMirrorAnnotationFacts(word, token));
    if (facts.some(comparison => !comparison.compatible)) return false;
    return facts.some(comparison => comparison.existingIsRicher)
        || mirrorHasAnnotatedOmittedRange(wordsByRange, rangeMatches);
}

interface MirrorWordRangeMatch {
    key: string;
    word: HTMLElement;
    token: JPDBToken;
}

function indexMirrorWordsByRange(existing: HTMLElement): Map<string, HTMLElement> | null {
    const words = Array.from(existing.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
    if (!words.length) return null;
    const indexed = new Map(words.map(word => [
        mirrorRangeKey(word.dataset.tokenStart, word.dataset.tokenEnd),
        word,
    ]));
    return indexed.size === words.length ? indexed : null;
}

function matchMirrorWordRange(
    wordsByRange: ReadonlyMap<string, HTMLElement>,
    token: JPDBToken,
    text: string,
): MirrorWordRangeMatch | null {
    const key = mirrorRangeKey(token.start, token.end);
    const word = wordsByRange.get(key);
    const sameRange = word
        && Number(word.dataset.tokenStart) === token.start
        && Number(word.dataset.tokenEnd) === token.end;
    const sameSurface = word?.dataset.surface === text.slice(token.start, token.end);
    return word && sameRange && sameSurface ? { key, word, token } : null;
}

function mirrorRangeKey(start: string | number | undefined, end: string | number | undefined): string {
    return `${start}:${end}`;
}

function isMirrorWordRangeMatch(match: MirrorWordRangeMatch | null): match is MirrorWordRangeMatch {
    return match !== null;
}

type AnnotationFactComparison = 'same' | 'existing-richer' | 'incoming-richer' | 'conflict';

interface MirrorAnnotationComparison {
    compatible: boolean;
    existingIsRicher: boolean;
}

function compareMirrorAnnotationFacts(word: HTMLElement, token: JPDBToken): MirrorAnnotationComparison {
    const existingPitch = PITCH_CLASSES.has(word.dataset.pitchClass ?? '') ? word.dataset.pitchClass ?? '' : '';
    const incomingPitch = PITCH_CLASSES.has(tokenPitchClass(token)) ? tokenPitchClass(token) : '';
    const comparisons = [
        compareAnnotationFact(renderedWordReading(word), renderedTokenReading(token)),
        compareAnnotationFact(existingPitch, incomingPitch),
        compareAnnotationFact(word.dataset.pitchAccent ?? '', token.card.pitchAccent.join('|')),
    ];
    return {
        compatible: comparisons.every(annotationFactCanRetainExisting),
        existingIsRicher: comparisons.includes('existing-richer'),
    };
}

function compareAnnotationFact(existing: string, incoming: string): AnnotationFactComparison {
    if (existing && incoming) return existing === incoming ? 'same' : 'conflict';
    if (existing) return 'existing-richer';
    if (incoming) return 'incoming-richer';
    return 'same';
}

function annotationFactCanRetainExisting(comparison: AnnotationFactComparison): boolean {
    return comparison === 'same' || comparison === 'existing-richer';
}

function mirrorHasAnnotatedOmittedRange(
    wordsByRange: ReadonlyMap<string, HTMLElement>,
    matches: MirrorWordRangeMatch[],
): boolean {
    const incomingRanges = new Set(matches.map(match => match.key));
    return Array.from(wordsByRange).some(([key, word]) =>
        !incomingRanges.has(key) && mirrorWordHasAnnotationFacts(word));
}

function mirrorWordHasAnnotationFacts(word: HTMLElement): boolean {
    return Boolean(renderedWordReading(word)
        || PITCH_CLASSES.has(word.dataset.pitchClass ?? '')
        || word.dataset.pitchAccent);
}

function refreshRetainedMirrorCardStatus(
    existing: HTMLElement,
    context: NonDestructiveMirrorRenderContext,
): void {
    const wordsByRange = new Map<string, HTMLElement>(
        Array.from(existing.querySelectorAll<HTMLElement>('.jpdb-reader-word'))
            .map(word => [`${word.dataset.tokenStart}:${word.dataset.tokenEnd}`, word]),
    );
    for (const token of context.renderPlan.tokens) {
        const word = wordsByRange.get(`${token.start}:${token.end}`);
        if (word) setRenderedWordCardStatus(word, token.card);
    }
}

function tokenIndependentMirrorSignature(signature: string): string | null {
    try {
        const parsed = JSON.parse(signature) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const settings = { ...parsed };
        delete settings.tokens;
        delete settings.readings;
        return JSON.stringify(settings);
    } catch {
        return null;
    }
}

function renderedWordReading(word: HTMLElement): string {
    return (word.dataset.reading
        || Array.from(word.querySelectorAll<HTMLElement>('rt,.jpdb-reader-detached-furi'))
            .map(reading => reading.textContent?.trim() ?? '')
            .join('')).trim();
}

function renderedTokenReading(token: JPDBToken): string {
    return (token.card.reading || token.rubies.map(ruby => ruby.text).join('')).trim();
}

function createNonDestructiveTextMirror(context: NonDestructiveMirrorRenderContext): HTMLElement {
    const mirror = document.createElement('span');
    mirror.className = 'jpdb-reader-text-mirror';
    mirror.dataset.jpdbReaderTextMirror = 'true';
    mirror.dataset.sourceText = context.text;
    mirror.dataset.renderSignature = context.signature;
    mirror.dataset.whitespaceJoints = context.whitespaceJointsKey;
    // The mirror is a full duplicate of the host text. Hide it from the a11y
    // tree so screen readers (and copy that respects it) skip the duplicate;
    // paired with user-select:none in CSS this keeps Cmd+A/copy grabbing only
    // the clean original host text instead of doubled/garbled clipboard.
    mirror.setAttribute('aria-hidden', 'true');
    // Source-preserving is the only mirror contract. The page's glyphs remain
    // authoritative; this layer contributes hit areas, pitch/status decoration,
    // and always-visible detached readings. Losing the layer therefore degrades to
    // plain readable text rather than a blank host.
    mirror.classList.add('jpdb-reader-additive-text-mirror');
    if (context.detachedReadings) mirror.dataset.yomuDetachedReadings = 'true';
    return mirror;
}

interface TextMirrorMount {
    configure(mirror: HTMLElement): TextMirrorHostState;
    append(mirror: HTMLElement): void;
    projectionRoot: ParentNode;
}

function textMirrorMount(
    host: HTMLElement,
    clipRow: HTMLElement | null,
    target: ScanTextTarget,
): TextMirrorMount {
    if (sourcePreservingProseNeedsDocumentPortal(host, {
        decoration: target.decoration,
        insideShadowDOM: Boolean(target.insideShadowDOM),
        interactivePassive: Boolean(interactivePassiveControl(host)),
        preservesSource: Boolean(target.nonDestructive || scanHostRequiresSourcePreservingMirror(host)),
    })) {
        return {
            configure(mirror) {
                mirror.classList.add(DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS);
                mirror.dataset.yomuDocumentPortal = 'volatile-prose';
                // Detached readings are already projected outside page layout;
                // a document portal must never reserve a taller native line box.
                delete mirror.dataset.yomuReadingLaneCandidate;
                const state = styleDocumentPortalTextMirrorHost(host);
                styleDocumentAnnotationPortalMirror(mirror, host);
                return state;
            },
            append(mirror) {
                (host.ownerDocument.body ?? host.ownerDocument.documentElement).append(mirror);
            },
            projectionRoot: host.ownerDocument,
        };
    }
    return {
        configure(mirror) {
            const state = styleTextMirrorHost(host);
            styleTextMirror(mirror, host, false);
            styleConstrainedTextMirror(mirror, clipRow);
            return state;
        },
        append: mirror => host.append(mirror),
        projectionRoot: host.getRootNode() as ParentNode,
    };
}

function mountNonDestructiveTextMirror(
    host: HTMLElement,
    target: ScanTextTarget,
    settings: ReaderSettings,
    context: NonDestructiveMirrorRenderContext,
): void {
    const mirror = createNonDestructiveTextMirror(context);
    const mount = textMirrorMount(host, context.clipRow, target);
    // A mirrored CONTROL (chip, pill, compact button) must lay out exactly
    // like its host at rest: the ruby-friendly line height pushed the base
    // glyphs out of fixed-height pills on WebKit (iPad 2026-07-11 — chip text
    // "gone", readings wrapping into neighbours). Detached readings never
    // enter the line box, but the mirror must still use the host's exact
    // control metrics rather than the additive prose channel.
    const controlMirror = target.decoration === 'interactive-passive';
    if (controlMirror) mirror.dataset.yomuControlMirror = 'true';
    // A clip-constrained mirror must lay out EXACTLY like its host: the
    // ruby-friendly line-height (~1.78em) under the clamp-box height cap left
    // room for only one tall line — hiding base glyphs (invisible subscriber
    // count) and over-clamping 2-line titles to one. Detached readings remain
    // out of flow, so the mirror keeps the host's own line metrics.
    // Any non-control text can become flowing multiline content. The live
    // projection pass decides whether it is currently multiline and
    // unconstrained, so expand/collapse transitions need no remount.
    if (context.detachedReadings && !controlMirror) {
        mirror.dataset.yomuReadingLaneCandidate = 'true';
    }
    const state = mount.configure(mirror);
    try {
        if (controlMirror && !context.detachedReadings) stabilizeReadingFreeControlMirror(mirror, host);
        const paintRoot = state.documentPortal ? documentAnnotationPortalPaint(mirror) : mirror;
        paintRoot.append(renderTokenizedScanText(context.renderPlan.text, context.renderPlan.tokens, context.renderSettings, {
            parent: host,
            hasNativeRuby: targetHasNativeRuby(target),
            mirrorRender: true,
            // Carry the SEALED decision into the inner render: without it the
            // re-derivation's furigana-mode=all branch would discard the
            // computed suppression and paint ruby into a control's mirror.
            decoration: target.decoration,
            suppressRuby: context.suppressRuby,
            detachedReadings: context.detachedReadings,
            passiveInteraction: target.passiveInteraction || context.suppressRuby,
        }));
        if (!mirror.textContent?.trim()) {
            removeTextMirror(host);
            return;
        }
        stampMirrorWordSourceRanges(mirror, context.safeTokens, context.hostText);
        // Commit atomically: a framework host must never be concealed before
        // its replacement is connected and known to contain paintable text.
        ensureReaderStylesForHost(host);
        mount.append(mirror);
        registerTextMirrorOwner(mirror, host);
        state.mirror = new WeakRef(mirror);
        if (state.documentPortal) {
            registerDocumentAnnotationPortalMirror(
                host,
                mirror,
                () => scheduleDocumentPortalMirrorProjection(mirror, host),
                () => projectOneDocumentPortalTextMirror(mirror, host),
                () => removeTextMirror(host),
            );
        }
        // Additive source/annotation paint is required even when the token has
        // no reading overlay (kana whose reading equals its surface is the
        // common case). Keep it independent from detached-reading geometry.
        styleAdditiveMirrorPaint(mirror);
        if (context.detachedReadings) {
            styleDetachedReadingElements(mirror, host);
            stabilizeDetachedReadings(mirror, context.clipRow, true);
        }
        // Source projection needs live client rects. Batch it after paint rather
        // than forcing layout once per mirror during the synchronous boot scan.
        scheduleAdditiveMirrorProjection(mount.projectionRoot);
        syncTextMirrorVisibilityToPage(host, mirror);
        observeTextMirrorHost(host);
        rememberNonDestructiveRenderForReplay(host, target, context.text, context.safeTokens, context.hostText, settings);
    } catch (error) {
        removeTextMirror(host);
        throw error;
    }
}

// Inline framework labels are often vertically centred inside a taller
// button by the button's inherited line-height. An absolute mirror anchored
// to the already-centred 16px label must not inherit that 40px line box again
// or its glyphs move down by half the difference. Match the mirror lane to the
// actual host label box when controls intentionally render without readings.
function stabilizeReadingFreeControlMirror(mirror: HTMLElement, host: HTMLElement): void {
    const height = host.getBoundingClientRect().height;
    if (height > 0) mirror.style.setProperty('line-height', `${height}px`, 'important');
}

function stampMirrorWordSourceRanges(mirror: HTMLElement, tokens: JPDBToken[], hostText = ''): void {
    const words = Array.from(mirror.querySelectorAll<HTMLElement>('.jpdb-reader-word.jpdb-reader-scan-word'));
    const renderText = mirror.dataset.sourceText ?? '';
    const hostStarts = mirrorHostSourceStarts(renderText, tokens, hostText);
    if (hostStarts) mirror.dataset.yomuHostSourceText = hostText;
    else delete mirror.dataset.yomuHostSourceText;
    for (const [index, word] of words.entries()) {
        const token = tokens[index];
        if (!token) continue;
        // A remapped mirror must not keep any render-coordinate stamp: the
        // consumers below read every stamp as a host offset, so a leftover would
        // project a reading onto unrelated glyphs.
        if (hostStarts) clearMirrorWordSourceRange(word);
        const start = hostStarts ? hostStarts.get(token) : token.start;
        if (start === undefined) continue;
        const surface = renderText.slice(token.start, token.end);
        word.dataset.yomuSourceStart = String(start);
        word.dataset.yomuSourceEnd = String(start + surface.length);
        stampProjectedRubySourceRanges(word, surface, token, start);
    }
}

function clearMirrorWordSourceRange(word: HTMLElement): void {
    delete word.dataset.yomuSourceStart;
    delete word.dataset.yomuSourceEnd;
    for (const wrapper of word.querySelectorAll<HTMLElement>('.jpdb-reader-detached-ruby')) {
        delete wrapper.dataset.yomuSourceStart;
        delete wrapper.dataset.yomuSourceEnd;
    }
}

/**
 * Source ranges are stamped in the coordinate system of the mirror's RENDERED
 * text, and every consumer resolves them against the host's OWN text. Those are
 * the same string whenever the render plan came from the host's text nodes — but
 * a synthetic target is not: YouTube's watch-info line is assembled out of the
 * `#view-count`/`#date-text` aria-labels joined with " • ", and a canvas
 * fallback out of textContent. The stamps then index a string that exists
 * nowhere in the DOM, so the live-geometry guard can never pass and BOTH source
 * projection (no furigana at all) and source hit-testing (the word cannot be
 * clicked) silently switch themselves off — the reported 回視聴.
 *
 * Re-express the stamps in host coordinates instead. The search is monotone:
 * a surface is only accepted at or after the previous token's host end, so an
 * invented separator or a reordered aria string can cost a token its projection
 * but can never move one onto another word.
 */
function mirrorHostSourceStarts(
    renderText: string,
    tokens: readonly JPDBToken[],
    hostText: string,
): Map<JPDBToken, number> | null {
    if (!hostText || !renderText || hostText === renderText) return null;
    const starts = new Map<JPDBToken, number>();
    let cursor = 0;
    for (const token of tokens) {
        const surface = renderText.slice(token.start, token.end);
        if (!surface) continue;
        const start = hostText.indexOf(surface, cursor);
        if (start < 0) continue;
        starts.set(token, start);
        cursor = start + surface.length;
    }
    return starts.size ? starts : null;
}

/** The host text a mirror's stamped source ranges are expressed in. */
function mirrorSourceHostText(mirror: HTMLElement): string {
    return mirror.dataset.yomuHostSourceText ?? mirror.dataset.sourceText ?? '';
}

function stampProjectedRubySourceRanges(
    word: HTMLElement,
    surface: string,
    token: JPDBToken,
    sourceStart: number,
): void {
    const rubies = effectiveTokenRubies(surface, token, true);
    word.querySelectorAll<HTMLElement>('.jpdb-reader-detached-ruby').forEach((wrapper, rubyIndex) => {
        const ruby = rubies[rubyIndex];
        const local = ruby ? localRubyRange(surface, token, ruby) : null;
        if (!local) return;
        wrapper.dataset.yomuSourceStart = String(sourceStart + local.start);
        wrapper.dataset.yomuSourceEnd = String(sourceStart + local.end);
    });
}

const SOURCE_FRAGMENT_CLASS = 'jpdb-reader-source-fragment';

interface AdditiveMirrorProjectionContext {
    host: HTMLElement;
    source: ReturnType<typeof hostOriginalTextWithNodeOffsets>;
    mirrorRect: DOMRect;
    scaleX: number;
    scaleY: number;
    clipRow: HTMLElement | null;
    clipRect: DocumentAnnotationPortalClipBounds | null;
    /** The authored row clip used by detached readings. Unlike clipRect this
     * never includes the portal's escaped-overflow clip. */
    readingClipRect: DocumentAnnotationPortalClipBounds | null;
    documentPortal?: boolean;
    topLayerConcealed?: boolean;
    /** Set once this pass's source text stops existing on the host. */
    sourceLost?: boolean;
}

/** Project decorations and readings onto the page-owned text fragments. The
 * mirror never tries to reproduce another renderer's CJK wrapping; Range is
 * the source of truth for every line fragment. */
export function projectAdditiveTextMirror(mirror: HTMLElement, host: HTMLElement): void {
    const documentPortal = mirror.classList.contains(DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS);
    if (documentPortal) {
        prepareDocumentAnnotationPortalMirrors([mirror]);
    }
    projectPreparedAdditiveTextMirror(mirror, host, documentPortal
        ? documentTopLayerConcealsPortal(host.ownerDocument)
        : false);
    if (documentPortal) settleDocumentAnnotationPortalMirrors([mirror]);
}

function projectPreparedAdditiveTextMirror(
    mirror: HTMLElement,
    host: HTMLElement,
    topLayerConcealed = false,
): void {
    const documentPortal = mirror.classList.contains(DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS);
    if (documentPortal) documentPortalMirrorProjectionCount += 1;
    const context = additiveMirrorProjectionContext(mirror, host);
    if (typeof context === 'string') {
        clearProjectedReadings(mirror);
        // Everything a pass projected is an absolute rect measured against the
        // host text the mirror was rendered from. Once that text is gone the
        // boxes describe nothing, so keeping them paints this word's status
        // tint and pitch/status underline over whatever the recycler put at the
        // old coordinates. A merely unmeasurable frame is different: the source
        // still exists, so the paint stays and the next pass re-measures it.
        if (context === 'source-changed') clearAdditiveMirrorSourceProjection(mirror);
        return;
    }
    if (documentPortal) context.topLayerConcealed = topLayerConcealed;
    const words = mirror.querySelectorAll<HTMLElement>(
        '.jpdb-reader-word[data-yomu-source-start][data-yomu-source-end]',
    );
    // One source range can back both a word fragment and its full-word ruby.
    // Resolve it once, and finish EVERY Range/style/clip read for this mirror
    // before removing a stale fragment or writing replacement geometry. The
    // old per-word loop alternated writes and Range reads hundreds of times on
    // long comments, forcing WebKit to lay out the page again for each token.
    const sourceRects = cachedMirrorSourceRectReader(context);
    const hasReadings = mirror.querySelector(
        '.jpdb-reader-detached-ruby[data-yomu-source-start][data-yomu-source-end] .jpdb-reader-detached-furi',
    ) !== null;
    const readingsConcealed = !hasReadings
        || !context.host.isConnected
        || pageConcealsTextMirrorHost(context.host)
        || Boolean(context.documentPortal && context.topLayerConcealed);
    const projections = Array.from(words).map(word => readAdditiveMirrorWordProjection(
        word,
        context,
        sourceRects,
        readingsConcealed,
    ));

    // Write phase. No source geometry is consulted below; detached-reading
    // refreshes keep their own live measure closures for later scroll frames.
    const readingProjections: DetachedReadingProjection[] = [];
    const projected = projections
        .map(projection => writeAdditiveMirrorWordProjection(projection, context, readingProjections))
        .some(Boolean);
    syncProjectedReadings(mirror, readingProjections);
    if (projected) setDataAttributeIfChanged(mirror, 'data-yomu-source-projected', 'true');
    else removeAttributeIfPresent(mirror, 'data-yomu-source-projected');
    // A pass got a context, so this mirror's host text matches what it was
    // rendered from again: it is no longer stale and may paint its own lane.
    removeAttributeIfPresent(mirror, 'data-yomu-source-stale');
    styleAdditiveMirrorPaint(mirror, true);
}

/**
 * Why a pass could not project.
 *
 * `unmeasurable` is transient — the engine has no Range geometry, the host is
 * momentarily off-DOM, or its box has collapsed — and the source text the
 * mirror was rendered from still exists, so whatever is painted stays put and
 * the next pass re-measures it.
 *
 * `source-changed` is not transient: a recycler rewrote the host's own text
 * under a surviving mirror (YouTube reuses `#owner-sub-count` and the watch-info
 * line for different content), so every stamped offset now indexes a string
 * that is gone. Nothing here can be re-measured, only discarded.
 */
type AdditiveMirrorProjectionGap = 'unmeasurable' | 'source-changed';

function additiveMirrorProjectionContext(
    mirror: HTMLElement,
    host: HTMLElement,
): AdditiveMirrorProjectionContext | AdditiveMirrorProjectionGap {
    if (typeof Range !== 'function' || typeof Range.prototype.getClientRects !== 'function') return 'unmeasurable';
    const source = hostOriginalTextWithNodeOffsets(host);
    if (!host.isConnected) return 'unmeasurable';
    if (mirrorSourceHostText(mirror) !== source.hostText) return 'source-changed';

    const clipRow = closestRubyFragileConstrainedRow(host);
    const readingClipRect = clipRow?.getBoundingClientRect() ?? null;
    if (mirror.classList.contains(DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS)) {
        // Range rects and fixed-position descendants share client coordinates.
        // Read the portal's real fixed origin instead of assuming (0, 0), so
        // visual-viewport panning/zoom implementations that offset fixed
        // containing blocks still project into the same coordinate space.
        const origin = documentAnnotationPortalPaint(mirror).getBoundingClientRect();
        const view = host.ownerDocument.defaultView;
        const width = view?.innerWidth ?? host.ownerDocument.documentElement.clientWidth;
        const height = view?.innerHeight ?? host.ownerDocument.documentElement.clientHeight;
        const mirrorRect = clientRect(origin.left, origin.top, width, height);
        return {
            host,
            source,
            mirrorRect,
            scaleX: 1,
            scaleY: 1,
            clipRow,
            clipRect: combinedProjectionClipBounds(
                preparedDocumentAnnotationPortalClipBounds(mirror),
                readingClipRect,
            ),
            readingClipRect,
            documentPortal: true,
        };
    }

    const hostRect = host.getBoundingClientRect();
    // An absolute child is laid out from the host's padding box. Match that
    // containing block instead of the border box so a bordered control does
    // not gain synthetic scroll overflow from the projection shell itself.
    setInlineStyleIfChanged(mirror, 'inset', '0px auto auto 0px');
    setInlineStyleIfChanged(mirror, 'width', stableCssPixels(host.clientWidth || hostRect.width));
    setInlineStyleIfChanged(mirror, 'height', stableCssPixels(host.clientHeight || hostRect.height));
    setInlineStyleIfChanged(mirror, 'padding', '0px');
    setInlineStyleIfChanged(mirror, 'transform', 'none');
    const mirrorRect = mirror.getBoundingClientRect();
    if (mirrorRect.width <= 0 || mirrorRect.height <= 0) return 'unmeasurable';

    return {
        host,
        source,
        mirrorRect,
        scaleX: mirror.offsetWidth > 0 ? mirrorRect.width / mirror.offsetWidth : 1,
        scaleY: mirror.offsetHeight > 0 ? mirrorRect.height / mirror.offsetHeight : 1,
        clipRow,
        clipRect: readingClipRect,
        readingClipRect,
    };
}

type MirrorSourceRectReader = (start: number, end: number) => DOMRect[];

interface AdditiveMirrorRubyProjection {
    ruby: HTMLElement;
    projection: DetachedReadingProjection;
}

interface AdditiveMirrorWordProjection {
    word: HTMLElement;
    sourceRects: DOMRect[];
    fragments: Array<{ rect: DOMRect; gradientOffset: number }>;
    readings: AdditiveMirrorRubyProjection[];
}

function cachedMirrorSourceRectReader(context: AdditiveMirrorProjectionContext): MirrorSourceRectReader {
    const cache = new Map<string, DOMRect[]>();
    const nodeOffsets = liveMirrorSourceOffsets(context);
    return (start, end) => {
        const key = `${start}:${end}`;
        const cached = cache.get(key);
        if (cached) return cached;
        const rects = sourceClientRects(context.host, nodeOffsets, start, end);
        cache.set(key, rects);
        return rects;
    };
}

/** Pure read phase for one word. */
function readAdditiveMirrorWordProjection(
    word: HTMLElement,
    context: AdditiveMirrorProjectionContext,
    sourceRectsFor: MirrorSourceRectReader,
    readingsConcealed: boolean,
): AdditiveMirrorWordProjection {
    const start = Number.parseInt(word.dataset.yomuSourceStart ?? '', 10);
    const end = Number.parseInt(word.dataset.yomuSourceEnd ?? '', 10);
    const sourceRects = sourceRectsFor(start, end);
    const fragments = sourceFragmentProjections(sourceRects, context);
    const readings = fragments.length
        ? readProjectedWordReadings(word, context, sourceRectsFor, readingsConcealed)
        : [];
    return { word, sourceRects, fragments, readings };
}

/** Pure write phase for one word. */
function writeAdditiveMirrorWordProjection(
    projection: AdditiveMirrorWordProjection,
    context: AdditiveMirrorProjectionContext,
    readings: DetachedReadingProjection[],
): boolean {
    const { word, sourceRects, fragments } = projection;
    if (!fragments.length) {
        clearProjectedSourceWord(word);
        return false;
    }

    styleProjectedSourceWord(word);
    syncSourceFragments(word, fragments, sourceRects, context);
    for (const { ruby, projection: readingProjection } of projection.readings) {
        positionProjectedElement(ruby, readingProjection.rect, context.mirrorRect, context.scaleX, context.scaleY);
        readings.push(readingProjection);
    }
    return true;
}

function sourceFragmentProjections(
    sourceRects: DOMRect[],
    context: AdditiveMirrorProjectionContext,
): Array<{ rect: DOMRect; gradientOffset: number }> {
    let gradientOffset = 0;
    return sourceRects.flatMap(rect => {
        const sourceGradientOffset = gradientOffset;
        gradientOffset += rect.width / context.scaleX;
        // Body-mounted portals have escaped the native overflow chain and must
        // be geometrically clipped back into it. In-host mirrors still live in
        // the authored clip, so preserve their historical whole-fragment
        // filtering rather than changing chip/tab underline geometry globally.
        const clipped = context.documentPortal && context.clipRect
            ? intersectClientRect(rect, context.clipRect)
            : rect;
        if (!context.documentPortal && context.clipRect && !rectsIntersect(rect, context.clipRect)) return [];
        if (!clipped) return [];
        return [{
            rect: clipped,
            // If the authored row clips the left edge, preserve the continuous
            // pitch gradient's offset instead of restarting it at the clip.
            gradientOffset: sourceGradientOffset + (clipped.left - rect.left) / context.scaleX,
        }];
    });
}

function combinedProjectionClipBounds(
    first: DocumentAnnotationPortalClipBounds | null,
    second: DocumentAnnotationPortalClipBounds | null,
): DocumentAnnotationPortalClipBounds | null {
    if (!first) return second;
    if (!second) return first;
    return {
        left: Math.max(first.left, second.left),
        top: Math.max(first.top, second.top),
        right: Math.min(first.right, second.right),
        bottom: Math.min(first.bottom, second.bottom),
    };
}

function clientRect(left: number, top: number, width: number, height: number): DOMRect {
    const right = left + width;
    const bottom = top + height;
    return {
        x: left,
        y: top,
        left,
        top,
        right,
        bottom,
        width,
        height,
        toJSON: () => ({}),
    } as DOMRect;
}

function intersectClientRect(rect: DOMRect, clip: DocumentAnnotationPortalClipBounds): DOMRect | null {
    const left = Math.max(rect.left, clip.left);
    const top = Math.max(rect.top, clip.top);
    const right = Math.min(rect.right, clip.right);
    const bottom = Math.min(rect.bottom, clip.bottom);
    return right > left && bottom > top ? clientRect(left, top, right - left, bottom - top) : null;
}

// The exact geometry each projection writer owns. Every writer below is typed
// against its list, so a property added to one is a compile error until the
// teardown that undoes it knows about it too — the drift that would otherwise
// strand a box on the page after the projection is withdrawn.
const PROJECTED_SOURCE_WORD_STYLE_PROPERTIES = ['position', 'inset', 'width', 'height', 'margin'] as const;
const PROJECTED_SOURCE_ELEMENT_STYLE_PROPERTIES = ['position', 'left', 'top', 'width', 'height', 'margin'] as const;
const PROJECTED_SOURCE_ELEMENT_OFFSET_STYLE_PROPERTIES = ['left', 'top', 'width', 'height', 'margin'] as const;

function writeProjectedGeometry<Property extends string>(
    element: HTMLElement,
    properties: readonly Property[],
    values: Record<Property, string>,
): void {
    for (const property of properties) {
        setInlineStyleIfChanged(element, property, values[property], 'important');
    }
}

function styleProjectedSourceWord(word: HTMLElement): void {
    setDataAttributeIfChanged(word, 'data-yomu-source-projected', 'true');
    writeProjectedGeometry(word, PROJECTED_SOURCE_WORD_STYLE_PROPERTIES, {
        position: 'absolute',
        inset: '0px',
        width: 'auto',
        height: 'auto',
        margin: '0px',
    });
}

/**
 * Hand a mirror back to the un-projected state it was mounted in.
 *
 * Only ever called once the host's own text no longer matches what the mirror
 * was rendered from. Every box a pass left behind — the exact source fragments
 * that carry the status tint and the pitch/status underline, the full-host word
 * shell, the absolute detached-ruby wrappers — is pinned to coordinates the
 * page has since reused, and the CSS that neutralises a projected word keys off
 * the flags cleared here, so the flags and the geometry must go together or the
 * word would repaint its own highlight across the whole host box. The stale
 * mirror is already queued for re-scan; until that lands the surface simply
 * carries no decoration rather than the wrong word's.
 */
function clearAdditiveMirrorSourceProjection(mirror: HTMLElement): void {
    removeAttributeIfPresent(mirror, 'data-yomu-source-projected');
    // Removing the projection is not enough to stop this mirror painting. An
    // additive mirror word carries its OWN pitch/status underline:
    // styleAdditiveMirrorPaint writes --jpdb-reader-word-decoration-source
    // inline and .jpdb-reader-word::after draws it, and that lane is suppressed
    // only WHILE the word is projected. Tearing the projection down therefore
    // un-suppresses it, and because the word falls back into the mirror's own
    // flow at the host's metrics it lands on very nearly the same pixels the
    // stale fragment occupied — the same wrong glyphs underlined, 4% shorter.
    // The mirror is stale, not resting, so the lane stays off until a pass can
    // measure the host again.
    setDataAttributeIfChanged(mirror, 'data-yomu-source-stale', 'true');
    for (const word of mirror.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-yomu-source-projected]')) {
        setInlineStyleIfChanged(word, '--jpdb-reader-word-decoration-source', 'transparent');
        clearProjectedSourceWord(word);
    }
}

/** Return one word to its resting mirror geometry after its source Range stops
 * producing paintable fragments. Keeping the full-host absolute word or a
 * lifted ruby wrapper after the last fragment disappears leaves an invisible
 * projection box in the next layout pass. */
function clearProjectedSourceWord(word: HTMLElement): void {
    word.querySelectorAll(`.${SOURCE_FRAGMENT_CLASS}`).forEach(fragment => fragment.remove());
    for (const wrapper of word.querySelectorAll<HTMLElement>('.jpdb-reader-detached-ruby')) {
        PROJECTED_SOURCE_ELEMENT_OFFSET_STYLE_PROPERTIES
            .forEach(property => removeInlineStyleIfPresent(wrapper, property));
        // styleDetachedReadingElements' resting value for a wrapper the
        // projection had lifted out of flow.
        setInlineStyleIfChanged(wrapper, 'position', 'relative', 'important');
    }
    PROJECTED_SOURCE_WORD_STYLE_PROPERTIES.forEach(property => removeInlineStyleIfPresent(word, property));
    removeAttributeIfPresent(word, 'data-yomu-source-projected');
}

function syncSourceFragments(
    word: HTMLElement,
    fragments: Array<{ rect: DOMRect; gradientOffset: number }>,
    sourceRects: DOMRect[],
    context: AdditiveMirrorProjectionContext,
): void {
    const gradientWidth = sourceRects.reduce((width, rect) => width + rect.width / context.scaleX, 0);
    const existing = Array.from(word.querySelectorAll<HTMLElement>(`:scope > .${SOURCE_FRAGMENT_CLASS}`));
    fragments.forEach(({ rect, gradientOffset }, index) => {
        const existingFragment = existing[index];
        const fragment = existingFragment ?? createSourceFragment(word.ownerDocument);
        // Component pitch belongs to the complete word. Fragment-local
        // coordinates keep one continuous gradient across source wraps.
        setInlineStyleIfChanged(fragment, '--jpdb-reader-source-gradient-width', stableCssPixels(gradientWidth));
        setInlineStyleIfChanged(fragment, '--jpdb-reader-source-gradient-offset', stableCssPixels(-gradientOffset));
        positionProjectedElement(fragment, rect, context.mirrorRect, context.scaleX, context.scaleY);
        if (!existingFragment) word.append(fragment);
    });
    existing.slice(fragments.length).forEach(fragment => fragment.remove());
}

function createSourceFragment(document: Document): HTMLElement {
    const fragment = document.createElement('span');
    fragment.className = SOURCE_FRAGMENT_CLASS;
    fragment.setAttribute('aria-hidden', 'true');
    return fragment;
}

function readProjectedWordReadings(
    word: HTMLElement,
    context: AdditiveMirrorProjectionContext,
    sourceRectsFor: MirrorSourceRectReader,
    readingsConcealed: boolean,
): AdditiveMirrorRubyProjection[] {
    const readings: AdditiveMirrorRubyProjection[] = [];
    const rubies = word.querySelectorAll<HTMLElement>(
        '.jpdb-reader-detached-ruby[data-yomu-source-start][data-yomu-source-end]',
    );
    for (const ruby of rubies) {
        const projection = projectedRubyReading(ruby, context, sourceRectsFor, readingsConcealed);
        if (projection) readings.push({ ruby, projection });
    }
    return readings;
}

/**
 * The host's text-node offsets, resolved against the LIVE tree.
 *
 * A projection pass captures the host's own `Text` nodes by identity, and every
 * later re-measure builds its Range out of that map. A framework re-render that
 * replaces a node with an equivalent one — `replaceWith(cloneNode(true))`, the
 * shape of the live watch-info cycle and of a recycler rehydrating a tile —
 * keeps the host, the mirror, the text and the record, but swaps those `Text`
 * nodes for fresh copies and drops the captured ones out of the tree. A Range
 * over detached nodes reports NO client rects, so from that moment every
 * projected reading measures null and the overlay hides it. Nothing recovers on
 * its own: the refresh passes that do run (scroll, resize, the topology refresh
 * this very mutation schedules) keep re-measuring the same dead nodes, so the
 * readings stay blank until an unrelated full re-projection happens by.
 *
 * Re-derive from the live host as soon as the captured nodes have left it.
 */
function liveMirrorSourceOffsets(context: AdditiveMirrorProjectionContext): Map<Text, number> {
    if (context.sourceLost) return NO_SOURCE_OFFSETS;
    if (mirrorSourceNodesConnected(context.source.nodeOffsets)) return context.source.nodeOffsets;
    const refreshed = hostOriginalTextWithNodeOffsets(context.host);
    // Adopt a replacement only while it spells the SAME text. Different text is
    // the `source-changed` case, which a pass discards rather than re-measures;
    // silently re-pointing the stamped offsets at it would paint this word's
    // reading over whatever the recycler put in its place. Latch it: the walk
    // above probes computed styles, and re-running it per reading per frame
    // until the queued re-scan lands is exactly the kind of repeated forced
    // layout the projection pass exists to avoid.
    if (refreshed.hostText !== context.source.hostText) {
        context.sourceLost = true;
        return NO_SOURCE_OFFSETS;
    }
    context.source = refreshed;
    return refreshed.nodeOffsets;
}

/** Measures nothing: no boundary resolves, so no rect is produced. */
const NO_SOURCE_OFFSETS: Map<Text, number> = new Map();

function mirrorSourceNodesConnected(nodeOffsets: Map<Text, number>): boolean {
    for (const node of nodeOffsets.keys()) {
        if (!node.isConnected) return false;
    }
    return true;
}

function projectedRubyReading(
    ruby: HTMLElement,
    context: AdditiveMirrorProjectionContext,
    sourceRectsFor: MirrorSourceRectReader,
    initiallyConcealed: boolean,
): DetachedReadingProjection | null {
    const reading = ruby.querySelector<HTMLElement>('.jpdb-reader-detached-furi');
    if (!reading) return null;
    const start = Number.parseInt(ruby.dataset.yomuSourceStart ?? '', 10);
    const end = Number.parseInt(ruby.dataset.yomuSourceEnd ?? '', 10);
    const measure = (): DOMRect | null => {
        if (!context.host.isConnected
            || pageConcealsTextMirrorHost(context.host)
            || (context.documentPortal && context.topLayerConcealed)) return null;
        const clipRect = context.clipRow?.getBoundingClientRect() ?? null;
        return sourceClientRects(context.host, liveMirrorSourceOffsets(context), start, end)
            .find(rect => !clipRect || rectsIntersect(rect, clipRect)) ?? null;
    };
    const rect = initiallyConcealed
        ? null
        : sourceRectsFor(start, end)
            .find(candidate => !context.readingClipRect || rectsIntersect(candidate, context.readingClipRect)) ?? null;
    if (!rect) return null;
    return { source: reading, anchor: context.host, rect, measure };
}

function sourceClientRects(
    host: HTMLElement,
    nodeOffsets: Map<Text, number>,
    start: number,
    end: number,
): DOMRect[] {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    const startBoundary = sourceRangeBoundary(nodeOffsets, start, 'start');
    const endBoundary = sourceRangeBoundary(nodeOffsets, end, 'end');
    if (!startBoundary || !endBoundary) return [];
    const range = host.ownerDocument.createRange();
    range.setStart(startBoundary.node, startBoundary.offset);
    range.setEnd(endBoundary.node, endBoundary.offset);
    return mergeSourceLineRects(Array.from(range.getClientRects())
        .filter(rect => rect.width > 0 && rect.height > 0));
}

/** Browsers may report nested/duplicate rects for one range (notably native
 * ruby and attributed-string wrappers). One painted source line needs one
 * continuous annotation fragment. */
function mergeSourceLineRects(rects: DOMRect[]): DOMRect[] {
    const sorted = [...rects].sort((left, right) => left.top - right.top || left.left - right.left);
    const merged: DOMRect[] = [];
    for (const rect of sorted) {
        const previous = merged.at(-1);
        const sameLine = previous
            && Math.abs(previous.top - rect.top) <= 1
            && Math.abs(previous.bottom - rect.bottom) <= 1;
        if (!sameLine || rect.left > previous.right + 1) {
            merged.push(rect);
            continue;
        }
        const left = Math.min(previous.left, rect.left);
        const top = Math.min(previous.top, rect.top);
        const right = Math.max(previous.right, rect.right);
        const bottom = Math.max(previous.bottom, rect.bottom);
        merged[merged.length - 1] = {
            left, top, right, bottom,
            x: left, y: top,
            width: right - left, height: bottom - top,
            toJSON: () => ({}),
        } as DOMRect;
    }
    return merged;
}

function positionProjectedElement(
    element: HTMLElement,
    rect: DOMRect,
    mirrorRect: DOMRect,
    scaleX: number,
    scaleY: number,
): void {
    writeProjectedGeometry(element, PROJECTED_SOURCE_ELEMENT_STYLE_PROPERTIES, {
        position: 'absolute',
        left: stableCssPixels((rect.left - mirrorRect.left) / scaleX),
        top: stableCssPixels((rect.top - mirrorRect.top) / scaleY),
        width: stableCssPixels(rect.width / scaleX),
        height: stableCssPixels(rect.height / scaleY),
        margin: '0px',
    });
}

function rectsIntersect(left: DocumentAnnotationPortalClipBounds, right: DocumentAnnotationPortalClipBounds): boolean {
    return left.right > right.left + 0.5
        && left.left < right.right - 0.5
        && left.bottom > right.top + 0.5
        && left.top < right.bottom - 0.5;
}

// Re-project every additive mirror after a settle signal (fonts, resize,
// virtualized reflow). Reads always come from the live source ranges.
// fallow-ignore-next-line complexity
export function projectAdditiveTextMirrors(root: ParentNode = document): void {
    const entries: Array<{ mirror: HTMLElement; host: HTMLElement }> = [];
    const mirrors = new Set(queryAllInAnnotationRoots(root, '.jpdb-reader-additive-text-mirror'));
    // A scoped source-root projection cannot query its body-mounted portals.
    // Resolve them through the source-indexed registry instead.
    documentAnnotationPortalMirrorsWithin(root).forEach(mirror => mirrors.add(mirror));
    for (const mirror of mirrors) {
        const host = registeredTextMirrorHostFor(mirror);
        if (!host) continue;
        if (!host.isConnected) {
            if (mirror.classList.contains(DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS)) removeTextMirror(host);
            continue;
        }
        // A deterministic decoration verdict may change after mount (a
        // control hydrates its clipping/editability attributes). Retire the
        // old paint at the shared projection boundary instead of maintaining
        // a site-specific mirror migration path for every late transition.
        if (classifyDecoration(host) === 'skip') {
            removeTextMirror(host);
            continue;
        }
        entries.push({ mirror, host });
    }
    const portals = entries.filter(({ mirror }) => mirror.classList.contains(DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS));
    const document = root instanceof Document ? root : root.ownerDocument;
    // Top-layer discovery is O(document). Resolve it once for the complete
    // projection pass, never once per portal and again per reading.
    const topLayerConcealed = portals.length > 0 && document
        ? documentTopLayerConcealsPortal(document)
        : false;
    for (const { mirror, host } of entries) {
        if (mirror.classList.contains(DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS)) {
            syncTextMirrorVisibilityToPage(host, mirror, topLayerConcealed);
        }
    }
    // Read every prose range before writing any line-height. A changed line
    // rhythm invalidates source rects, so projection continues next frame.
    if (settleTextMirrorReadingLanes(entries)) {
        entries.forEach(({ mirror }) => clearProjectedReadings(mirror));
        scheduleAdditiveMirrorProjection(root);
        return;
    }
    prepareDocumentAnnotationPortalMirrors(portals.map(({ mirror }) => mirror));
    if (typeof Range === 'function' && typeof Range.prototype.getClientRects === 'function') {
        for (const { mirror, host } of entries) {
            projectPreparedAdditiveTextMirror(mirror, host, topLayerConcealed);
        }
    }
    settleDocumentAnnotationPortalMirrors(portals.map(({ mirror }) => mirror));
    projectInPlaceDetachedReadings(root);
    if (document) pruneProjectedReadings(document);
}

function projectInPlaceDetachedReadings(root: ParentNode): void {
    const owners = new Map<HTMLElement, DetachedReadingProjection[]>();
    for (const wrapper of queryAllInAnnotationRoots(root, '.jpdb-reader-detached-ruby')) {
        if (wrapper.closest('.jpdb-reader-additive-text-mirror')) continue;
        const reading = wrapper.querySelector<HTMLElement>('.jpdb-reader-detached-furi');
        const owner = wrapper.closest<HTMLElement>('.jpdb-reader-word');
        if (!reading || !owner) continue;
        const projections = owners.get(owner) ?? [];
        owners.set(owner, projections);
        const measure = (): DOMRect | null => {
            if (!owner.isConnected || pageConcealsTextMirrorHost(owner)) return null;
            const rect = wrapper.getBoundingClientRect();
            const clip = closestRubyFragileConstrainedRow(owner)?.getBoundingClientRect();
            return rect.width > 0
                && rect.height > 0
                && (!clip || rectsIntersect(rect, clip))
                ? rect
                : null;
        };
        const rect = measure();
        if (!rect) continue;
        projections.push({ source: reading, anchor: owner, rect, measure });
    }
    for (const [owner, projections] of owners) syncProjectedReadings(owner, projections);
}

function settleTextMirrorReadingLanes(entries: Array<{ mirror: HTMLElement; host: HTMLElement }>): boolean {
    const updates: Array<{
        mirror: HTMLElement;
        host: HTMLElement;
        state: TextMirrorHostState;
        lineHeight: string;
    }> = [];
    for (const { mirror, host } of entries) {
        if (mirror.dataset.yomuReadingLaneCandidate !== 'true') continue;
        const state = textMirrorHosts.get(host);
        if (!state) continue;
        if (state.documentPortal) {
            // Portal paint is wholly out of tree. Reserving a reading lane on
            // its native source would violate the zero host-style/layout contract.
            if (state.reservedLineHeight) releaseTextMirrorReadingLane(host, state, mirror);
            continue;
        }

        // A framework inline write supersedes Yomu's earlier reservation and
        // becomes the new teardown baseline. Re-measure against that value.
        const inlineLineHeight = host.style.getPropertyValue('line-height');
        const inlineLineHeightPriority = host.style.getPropertyPriority('line-height');
        let baselineChanged = false;
        const ownsReservation = Boolean(state.reservedLineHeight)
            && inlineLineHeight === state.reservedLineHeight
            && inlineLineHeightPriority === 'important';
        if (!ownsReservation && (
            state.reservedLineHeight
            || inlineLineHeight !== state.lineHeight
            || inlineLineHeightPriority !== state.lineHeightPriority
        )) {
            state.lineHeight = inlineLineHeight;
            state.lineHeightPriority = inlineLineHeightPriority;
            state.reservedLineHeight = '';
            baselineChanged = true;
        }

        const multiline = !closestRubyFragileConstrainedRow(host) && sourceTextSpansMultipleLines(host);
        const lineHeight = multiline
            ? detachedReadingLaneLineHeight(safeComputedStyle(host), Boolean(state.reservedLineHeight))
            : '';
        if (baselineChanged || lineHeight !== state.reservedLineHeight) {
            updates.push({ mirror, host, state, lineHeight });
        }
    }

    for (const { mirror, host, state, lineHeight } of updates) {
        if (!host.isConnected || textMirrorHosts.get(host) !== state || currentTextMirror(host) !== mirror) continue;
        if (lineHeight) {
            state.reservedLineHeight = lineHeight;
            host.style.setProperty('line-height', lineHeight, 'important');
            mirror.style.setProperty('line-height', lineHeight);
        } else {
            releaseTextMirrorReadingLane(host, state, mirror);
        }
    }
    return updates.length > 0;
}

function releaseTextMirrorReadingLane(
    host: HTMLElement,
    state: TextMirrorHostState,
    mirror: HTMLElement,
): void {
    const injected = state.reservedLineHeight;
    if (injected) {
        const current = host.style.getPropertyValue('line-height');
        const priority = host.style.getPropertyPriority('line-height');
        if (current === injected && priority === 'important') {
            restoreStyleProperty(host, 'line-height', injected, state.lineHeight, state.lineHeightPriority);
        } else {
            // A framework write (including removing the property) owns the new
            // baseline and must survive both re-reservation and teardown.
            state.lineHeight = current;
            state.lineHeightPriority = priority;
        }
        state.reservedLineHeight = '';
    }
    // The mirror inherits the restored/current page metric without another
    // computed-style read in this write phase.
    mirror.style.removeProperty('line-height');
}

// Coalesce freshly-mounted mirrors into one post-paint projection pass. A hidden
// mount is picked up by the next settle once its source rects become measurable.
//
// Every same-text re-render on a live surface routes its re-stamp through here
// (the watch-info cycle, a scroll recycler rehydrating a tile), so a pass that
// stops being scheduled leaves the status tint and the pitch/status underline
// pinned to where the glyphs USED to be until something else forces a re-scan.
// createPostPaintPass is what keeps a frame that can never arrive — a dead
// realm's, or one a Gecko sandbox refused to arm — from latching that off for
// the rest of the page's life.
const pendingAdditiveMirrorProjectionRoots = new Set<ParentNode>();
const additiveMirrorProjectionPass = createPostPaintPass(() => {
    const roots = [...pendingAdditiveMirrorProjectionRoots];
    pendingAdditiveMirrorProjectionRoots.clear();
    for (const pendingRoot of roots) projectAdditiveTextMirrors(pendingRoot);
});
function scheduleAdditiveMirrorProjection(root: ParentNode = document): void {
    pendingAdditiveMirrorProjectionRoots.add(root);
    additiveMirrorProjectionPass.schedule(viewForNode(root));
}

/** Coalesce a known page-layout change into the existing annotation projection pass. */
export function scheduleProjectedAnnotationLayoutRefresh(root: ParentNode = document): void {
    scheduleAdditiveMirrorProjection(root);
}

/** Coalesce exact projection by affected portal. A framework replacing one
 * comment's Text node must not Range-project an unrelated long description. */
function scheduleDocumentPortalMirrorProjection(mirror: HTMLElement, host: HTMLElement): void {
    if (!mirror.isConnected || !host.isConnected || currentDocumentPortalTextMirror(host) !== mirror) return;
    pendingDocumentPortalProjections.set(mirror, host);
    documentPortalProjectionPass.schedule(viewForNode(mirror));
}

const pendingDocumentPortalProjections = new Map<HTMLElement, HTMLElement>();
let documentPortalProjectionPassCount = 0;
let documentPortalMirrorProjectionCount = 0;

/** Focused browser-proof counters; callers compare deltas around one probe. */
export function documentPortalProjectionCountsForTest(): { passes: number; mirrors: number } {
    return {
        passes: documentPortalProjectionPassCount,
        mirrors: documentPortalMirrorProjectionCount,
    };
}

const documentPortalProjectionPass = createPostPaintPass(() => {
    const entries = [...pendingDocumentPortalProjections]
        .filter(([mirror, host]) => mirror.isConnected
            && host.isConnected
            && currentDocumentPortalTextMirror(host) === mirror);
    pendingDocumentPortalProjections.clear();
    if (!entries.length) return;
    documentPortalProjectionPassCount += 1;
    const byDocument = new Map<Document, Array<{ mirror: HTMLElement; host: HTMLElement }>>();
    for (const [mirror, host] of entries) {
        const documentEntries = byDocument.get(host.ownerDocument) ?? [];
        documentEntries.push({ mirror, host });
        byDocument.set(host.ownerDocument, documentEntries);
    }
    for (const [document, documentEntries] of byDocument) {
        const mirrors = documentEntries.map(({ mirror }) => mirror);
        prepareDocumentAnnotationPortalMirrors(mirrors);
        const topLayerConcealed = documentTopLayerConcealsPortal(document);
        for (const { mirror, host } of documentEntries) {
            syncTextMirrorVisibilityToPage(host, mirror, topLayerConcealed);
            projectPreparedAdditiveTextMirror(mirror, host, topLayerConcealed);
        }
        settleDocumentAnnotationPortalMirrors(mirrors);
        pruneProjectedReadings(document);
    }
});

/** Low-frequency delegated transition settle for one affected portal only. */
function projectOneDocumentPortalTextMirror(mirror: HTMLElement, host: HTMLElement): void {
    if (!mirror.isConnected || !host.isConnected || currentDocumentPortalTextMirror(host) !== mirror) {
        if (textMirrorHosts.has(host)) removeTextMirror(host);
        return;
    }
    prepareDocumentAnnotationPortalMirrors([mirror]);
    const topLayerConcealed = documentTopLayerConcealsPortal(host.ownerDocument);
    syncTextMirrorVisibilityToPage(host, mirror, topLayerConcealed);
    projectPreparedAdditiveTextMirror(mirror, host, topLayerConcealed);
    settleDocumentAnnotationPortalMirrors([mirror]);
    pruneProjectedReadings(host.ownerDocument);
}

/** Live page geometry of the text one mirror host owns, measured once per resolve. */
interface MirrorHostSourceGeometry {
    hostText: string;
    nodeOffsets: Map<Text, number>;
    /** Client rects of the host's OWN glyphs — the run the mirror annotates. */
    runRects: DOMRect[];
}

/** Live page geometry of one mirrored word plus the run it belongs to. */
interface MirroredWordSourceGeometry {
    rects: DOMRect[];
    runRects: DOMRect[];
}

function mirrorHostSourceGeometry(
    host: HTMLElement,
    cache: Map<HTMLElement, MirrorHostSourceGeometry>,
): MirrorHostSourceGeometry {
    const cached = cache.get(host);
    if (cached) return cached;
    const source = hostOriginalTextWithNodeOffsets(host);
    const geometry: MirrorHostSourceGeometry = {
        hostText: source.hostText,
        nodeOffsets: source.nodeOffsets,
        runRects: source.hostText ? sourceRangeRects(host, source.nodeOffsets, 0, source.hostText.length) : [],
    };
    cache.set(host, geometry);
    return geometry;
}

function sourceRangeRects(host: HTMLElement, nodeOffsets: Map<Text, number>, start: number, end: number): DOMRect[] {
    const startBoundary = sourceRangeBoundary(nodeOffsets, start, 'start');
    const endBoundary = sourceRangeBoundary(nodeOffsets, end, 'end');
    if (!startBoundary || !endBoundary) return [];
    const range = host.ownerDocument.createRange();
    range.setStart(startBoundary.node, startBoundary.offset);
    range.setEnd(endBoundary.node, endBoundary.offset);
    return Array.from(range.getClientRects());
}

/**
 * Where a mirrored word's page-owned source text actually sits right now.
 * Additive mirrors can be displaced by framework layout/recycling; their own
 * boxes are never authoritative for hit testing.
 */
function mirroredWordSourceGeometry(
    word: HTMLElement,
    hosts: Map<HTMLElement, MirrorHostSourceGeometry> = new Map(),
): MirroredWordSourceGeometry | null {
    const mirror = word.closest<HTMLElement>('.jpdb-reader-text-mirror.jpdb-reader-additive-text-mirror');
    if (!mirror || typeof Range.prototype.getClientRects !== 'function') return null;
    const host = registeredTextMirrorHostFor(mirror);
    if (!host?.isConnected) return null;
    const start = Number.parseInt(word.dataset.yomuSourceStart ?? '', 10);
    const end = Number.parseInt(word.dataset.yomuSourceEnd ?? '', 10);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const geometry = mirrorHostSourceGeometry(host, hosts);
    if (mirrorSourceHostText(mirror) !== geometry.hostText || end > geometry.hostText.length) return null;
    return { rects: sourceRangeRects(host, geometry.nodeOffsets, start, end), runRects: geometry.runRects };
}

/**
 * Score a mirrored word against the geometry of the page-owned source range.
 */
export function readerWordSourcePointScore(word: HTMLElement, x: number, y: number): number | null {
    const geometry = mirroredWordSourceGeometry(word);
    return geometry ? sourceRectsPointScore(geometry.rects, x, y) : null;
}

export function readerWordAtSourcePointInScope(
    scope: ParentNode,
    x: number,
    y: number,
    accepts: (word: HTMLElement) => boolean = () => true,
): HTMLElement | null {
    const hosts = new Map<HTMLElement, MirrorHostSourceGeometry>();
    let best: { word: HTMLElement; score: number } | null = null;
    // A point inside an annotated run that no token covers — the digits of
    // "4億回視聴", a "•" separator, the space in "21 年前" — used to resolve to
    // NOTHING, and the click then fell through to the page. On YouTube's
    // watch-info line that hands the host its own click: the description
    // expands and the abbreviated view count is rewritten as the exact one, so
    // the line the reader was aiming at moves out from under the pointer. The
    // symptom is a metadata line that "cannot be clicked" however often it is
    // tried. A run Yomu mirrored belongs to Yomu: inside it, the nearest word
    // claims the point. Outside it nothing changes, so page links, buttons and
    // the gaps BETWEEN runs keep their native click.
    let nearest: { word: HTMLElement; distance: number } | null = null;
    const selector = '.jpdb-reader-additive-text-mirror .jpdb-reader-word[data-yomu-source-start][data-yomu-source-end]';
    for (const word of scope.querySelectorAll<HTMLElement>(selector)) {
        if (!accepts(word)) continue;
        const geometry = mirroredWordSourceGeometry(word, hosts);
        if (!geometry) continue;
        const score = sourceRectsPointScore(geometry.rects, x, y);
        if (score !== null) {
            if (!best || score < best.score) best = { word, score };
            continue;
        }
        if (best || !pointInsideSourceRects(geometry.runRects, x, y)) continue;
        const distance = sourceRectsPointDistance(geometry.rects, x, y);
        if (distance !== null && (!nearest || distance < nearest.distance)) nearest = { word, distance };
    }
    return best?.word ?? nearest?.word ?? null;
}

function sourceRangeBoundary(
    nodeOffsets: Map<Text, number>,
    sourceOffset: number,
    side: 'start' | 'end',
): { node: Text; offset: number } | null {
    let boundary: { node: Text; offset: number } | null = null;
    for (const [node, nodeStart] of nodeOffsets) {
        const nodeEnd = nodeStart + node.data.length;
        if (sourceOffset < nodeStart || sourceOffset > nodeEnd) continue;
        const candidate = { node, offset: sourceOffset - nodeStart };
        if (side === 'start' && sourceOffset < nodeEnd) return candidate;
        boundary = candidate;
        if (side === 'end' && sourceOffset > nodeStart) return candidate;
    }
    return boundary;
}

const SOURCE_RECT_HIT_SLACK = 0.75;

function sourceRectPointDistance(rect: DOMRect, x: number, y: number): number | null {
    if (rect.width <= 0 || rect.height <= 0) return null;
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    return dx * dx + dy * dy;
}

function sourceRectPointScore(rect: DOMRect, x: number, y: number): number | null {
    const distance = sourceRectPointDistance(rect, x, y);
    if (distance === null) return null;
    if (x < rect.left - SOURCE_RECT_HIT_SLACK || x > rect.right + SOURCE_RECT_HIT_SLACK
        || y < rect.top - SOURCE_RECT_HIT_SLACK || y > rect.bottom + SOURCE_RECT_HIT_SLACK) return null;
    return distance;
}

function sourceRectsPointScore(rects: readonly DOMRect[], x: number, y: number): number | null {
    let best: number | null = null;
    for (const rect of rects) {
        const score = sourceRectPointScore(rect, x, y);
        if (score !== null && (best === null || score < best)) best = score;
    }
    return best;
}

function sourceRectsPointDistance(rects: readonly DOMRect[], x: number, y: number): number | null {
    let best: number | null = null;
    for (const rect of rects) {
        const distance = sourceRectPointDistance(rect, x, y);
        if (distance !== null && (best === null || distance < best)) best = distance;
    }
    return best;
}

function pointInsideSourceRects(rects: readonly DOMRect[], x: number, y: number): boolean {
    return rects.some(rect => sourceRectPointScore(rect, x, y) !== null);
}

// A document stylesheet does not cross an open shadow boundary. Keep the
// invisible base wrapper's layout contract inline, and retain the reading's
// typography as source data for the document-owned projection overlay.
function styleDetachedReadingElements(root: HTMLElement, host: HTMLElement): void {
    const detachedRubies = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-detached-ruby'));
    if (!detachedRubies.length) return;

    const hostStyle = safeComputedStyle(host);
    const hostFontSize = Number.parseFloat(hostStyle.fontSize) || 16;
    const readingFontSize = Math.min(10, Math.max(6, hostFontSize * 0.46));

    for (const wrapper of detachedRubies) {
        setInlineStyleIfChanged(wrapper, 'position', 'relative', 'important');
        setInlineStyleIfChanged(wrapper, 'display', 'inline-block', 'important');
        setInlineStyleIfChanged(wrapper, 'line-height', '1', 'important');
        setInlineStyleIfChanged(wrapper, 'vertical-align', 'baseline', 'important');
        setInlineStyleIfChanged(wrapper, 'white-space', 'nowrap', 'important');
    }

    for (const reading of root.querySelectorAll<HTMLElement>('.jpdb-reader-detached-furi')) {
        setInlineStyleIfChanged(reading, 'display', 'none', 'important');
        setInlineStyleIfChanged(reading, 'font-size', `${readingFontSize}px`);
        setInlineStyleIfChanged(reading, 'font-weight', '700');
        setInlineStyleIfChanged(reading, 'line-height', '1', 'important');
        setInlineStyleIfChanged(reading, 'text-decoration', 'none', 'important');
        setInlineStyleIfChanged(reading, 'user-select', 'none');
        setInlineStyleIfChanged(reading, '-webkit-user-select', 'none');
        // Keep the semantic colour channel inherited from the live page. The
        // additive base glyphs are hidden with text-fill (not color), so a
        // late theme/class change flows through without a JS repaint or a
        // stale mount-time colour snapshot.
        if (reading.style.getPropertyValue('color')) reading.style.removeProperty('color');
        setInlineStyleIfChanged(reading, '-webkit-text-fill-color', 'currentColor', 'important');
    }
}

function setInlineStyleIfChanged(element: HTMLElement, property: string, value: string, priority = ''): void {
    if (element.style.getPropertyValue(property) === value
        && element.style.getPropertyPriority(property) === priority) return;
    element.style.setProperty(property, value, priority);
}

function removeInlineStyleIfPresent(element: HTMLElement, property: string): void {
    if (!element.style.getPropertyValue(property) && !element.style.getPropertyPriority(property)) return;
    element.style.removeProperty(property);
}

function setDataAttributeIfChanged(element: HTMLElement, name: `data-${string}`, value: string): void {
    if (element.getAttribute(name) === value) return;
    element.setAttribute(name, value);
}

function removeAttributeIfPresent(element: HTMLElement, name: string): void {
    if (!element.hasAttribute(name)) return;
    element.removeAttribute(name);
}

type AdditiveDecorationSource = 'status' | 'jpdb' | 'anki' | 'pitch';
const ADDITIVE_DECORATION_SOURCES: readonly AdditiveDecorationSource[] = ['status', 'jpdb', 'anki', 'pitch'];
const ADDITIVE_HIGHLIGHT_SOURCES = ADDITIVE_DECORATION_SOURCES.filter(source => source !== 'pitch');

// A document-root mode selector cannot cross into an open shadow root. The
// shadow stylesheet supplies the word/state variables, while this small inline
// contract supplies the active channel to the shared synthetic underline.
// Source order deliberately matches the stylesheet cascade (pitch is last).
function styleAdditiveMirrorPaint(root: HTMLElement, projectedWordsOnly = false): void {
    if (!root.classList.contains('jpdb-reader-additive-text-mirror')) return;
    setInlineStyleIfChanged(root, '-webkit-text-fill-color', 'transparent', 'important');
    const source = activeAdditiveDecorationSource(root.ownerDocument.documentElement);
    const words = root.querySelectorAll<HTMLElement>('.jpdb-reader-word');
    // The injected shadow stylesheet owns glyph suppression and word
    // decoration geometry. Document-level mode selectors cannot cross a shadow
    // boundary, so bridge the selected semantic source onto the word. Painting
    // a native text-decoration here would create a second engine-dependent
    // baseline beside the exact source-fragment underline.
    const paint = source
        ? `var(--jpdb-reader-source-${source}-decoration, transparent)`
        : 'transparent';
    const highlightSource = activeAdditiveHighlightSource(root.ownerDocument.documentElement);
    const softPaint = highlightSource
        ? `var(--jpdb-reader-source-${highlightSource}-soft, transparent)`
        : '';
    for (const word of words) {
        const visible = !projectedWordsOnly || word.dataset.yomuSourceProjected === 'true';
        styleAdditiveMirrorWordPaint(word, paint, softPaint, visible);
    }
}

function styleAdditiveMirrorWordPaint(
    word: HTMLElement,
    paint: string,
    softPaint: string,
    visible: boolean,
): void {
    removeInlineStyleIfPresent(word, 'text-decoration-color');
    removeInlineStyleIfPresent(word, '--jpdb-reader-additive-decoration');
    setInlineStyleIfChanged(word, '--jpdb-reader-word-decoration-source', visible ? paint : 'transparent');
    const visibleSoftPaint = visible ? softPaint : '';
    if (visibleSoftPaint) setInlineStyleIfChanged(word, '--jpdb-reader-mirror-status-soft', visibleSoftPaint);
    else removeInlineStyleIfPresent(word, '--jpdb-reader-mirror-status-soft');
}

function activeAdditiveHighlightSource(documentElement: HTMLElement): AdditiveDecorationSource | null {
    let active: AdditiveDecorationSource | null = null;
    for (const source of ADDITIVE_HIGHLIGHT_SOURCES) {
        if (documentElement.classList.contains(`jpdb-reader-word-highlight-${source}`)) active = source;
    }
    return active;
}

function activeAdditiveDecorationSource(documentElement: HTMLElement): AdditiveDecorationSource | null {
    let active: AdditiveDecorationSource | null = null;
    for (const source of ADDITIVE_DECORATION_SOURCES) {
        if (['highlight', 'underline', 'text'].some(channel => documentElement.classList
            .contains(`jpdb-reader-word-${channel}-${source}`))) active = source;
    }
    return active;
}

// Detached readings are projected from exact source rectangles after layout.
// This pass only filters bases outside an authored clamp and schedules that
// projection; the hidden source readings never affect page geometry.
function stabilizeDetachedReadings(root: HTMLElement, clipRow: HTMLElement | null, filterWordsToClip = false): void {
    if (filterWordsToClip && root.dataset.yomuSourceProjected !== 'true') filterDetachedWordsToClip(root, clipRow);
    scheduleAdditiveMirrorProjection(root.getRootNode() as ParentNode);
}

// Clip filtering is a reversible Yomu-owned verdict. A line-clamped surface
// can resize in either direction; without restoring our prior visibility
// write first, words that re-enter the authored box remain hidden forever.
function filterDetachedWordsToClip(root: HTMLElement, clipRow: HTMLElement | null): void {
    const words = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
    for (const word of words) {
        if (word.dataset.yomuDetachedWordHidden !== 'outside-clip') continue;
        delete word.dataset.yomuDetachedWordHidden;
        word.style.removeProperty('visibility');
    }
    // The portal is intentionally a zero-sized shell. Its pre-projection bases
    // have no useful geometry; authoritative source Range fragments are clipped
    // later against the native row.
    if (root.classList.contains(DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS)) return;
    const clipRect = clipRow?.getBoundingClientRect();
    if (!clipRect || clipRect.width <= 0 || clipRect.height <= 0) return;
    for (const word of words) {
        const bases = Array.from(word.querySelectorAll<HTMLElement>('.jpdb-reader-detached-ruby .jpdb-reader-ruby-base'));
        const rects = (bases.length ? bases : [word]).map(base => base.getBoundingClientRect());
        const visible = rects.some(rect => rect.bottom > clipRect.top + 0.5
            && rect.top < clipRect.bottom - 0.5
            && rect.right > clipRect.left + 0.5
            && rect.left < clipRect.right - 0.5);
        if (visible) continue;
        word.dataset.yomuDetachedWordHidden = 'outside-clip';
        word.style.setProperty('visibility', 'hidden', 'important');
    }
}

const settledMirrorProjectionGeometry = new WeakMap<HTMLElement, string>();

function mirrorProjectionGeometrySignature(root: HTMLElement): string {
    const rect = root.getBoundingClientRect();
    return `${rect.left}:${rect.top}:${rect.width}:${rect.height}:${root.textContent ?? ''}`;
}


function styleConstrainedTextMirror(mirror: HTMLElement, clipRow: HTMLElement | null): void {
    if (!clipRow) return;
    constrainMirrorToClampBox(mirror, clipRow);
}

function textMirrorClipMode(
    host: HTMLElement,
    renderPlan: { text: string; tokens: JPDBToken[] },
    settings: ReaderSettings,
    hasNativeRuby: boolean,
): {
    clipRow: HTMLElement | null;
    detachedReadings: boolean;
} {
    const clipRow = closestRubyFragileConstrainedRow(host);
    const hasReadings = renderPlan.tokens.some(token => shouldRenderRuby(
        renderPlan.text.slice(token.start, token.end), token, settings, !hasNativeRuby, true,
    ));
    // Every mirror is additive, so readings are always detached from the line
    // box and source projection can keep them visible without changing layout.
    const detachedReadings = hasReadings;
    return {
        clipRow,
        detachedReadings,
    };
}

// Reproduce the clip row's truncation inside the mirror: same line count for
// line-clamped rows, and never taller than the row box. Without this the
// absolutely-positioned mirror escapes the host clip and paints the full
// unclamped text.
function constrainMirrorToClampBox(mirror: HTMLElement, clipRow: HTMLElement): void {
    // Engine-stable mechanism ONLY: a pixel max-height from the clip row's
    // box. Inline `display:-webkit-box; -webkit-line-clamp` computes as
    // -webkit-box (clamp active) on WebKit but flow-root (clamp INERT) on
    // Chromium, so line-count copying diverges across engines.
    const height = clipRow.clientHeight;
    if (height > 0) mirror.style.setProperty('max-height', `${height}px`);
    mirror.style.setProperty('overflow', 'hidden');
}

function whitespaceCollapsedNonDestructiveRender(text: string, tokens: JPDBToken[], whitespaceJoints?: number[]): { text: string; tokens: JPDBToken[] } {
    if (!whitespaceJoints?.length && !/\s{2,}|\r|\n/u.test(text)) return { text, tokens };
    const { normalized, offsets } = collapseWhitespaceWithOffsets(text, whitespaceJoints);
    if (normalized === text) return { text, tokens };
    return {
        text: normalized,
        tokens: tokens.map(token => remapTokenOffsets(token, offsets, normalized)),
    };
}

function collapseWhitespaceWithOffsets(text: string, whitespaceJoints: number[] = []): { normalized: string; offsets: number[] } {
    const offsets = new Array<number>(text.length + 1);
    const joints = new Set(whitespaceJoints);
    let normalized = '';
    let index = 0;
    while (index < text.length) {
        if (/\s/u.test(text[index] ?? '')) {
            const start = index;
            let touchesJoint = joints.has(start);
            while (index < text.length && /\s/u.test(text[index] ?? '')) {
                index += 1;
                if (joints.has(index)) touchesJoint = true;
            }
            const mapped = normalized.length;
            // A line break between CJK characters carries no space semantics:
            // YouTube's yt-formatted-string wraps 視聴 across a newline, and
            // turning that into "視 聴" splits the word both visually and for
            // the tokenizer. Latin boundaries keep their single space. A run
            // that touches an inline-formatting-context joint never renders on
            // the page at all (separate flex/grid/table items), so it must not
            // become a literal space either.
            if (normalized.length > 0 && index < text.length && !touchesJoint
                && !(isCjkChar(lastFullChar(normalized)) && isCjkChar(String.fromCodePoint(text.codePointAt(index) ?? 0)))) {
                normalized += ' ';
            }
            for (let offset = start; offset < index; offset += 1) offsets[offset] = mapped;
            continue;
        }
        offsets[index] = normalized.length;
        normalized += text[index];
        index += 1;
    }
    offsets[text.length] = normalized.length;
    return { normalized, offsets };
}

// Ideographic space through katakana, CJK ideographs, compat ideographs, and
// fullwidth forms, and halfwidth katakana/punctuation (U+FF61–FF9F) — the
// scripts whose soft line breaks carry no space.
function isCjkChar(char: string | undefined): boolean {
    return Boolean(char) && /[　-ヿ㐀-鿿豈-﫿！-ﾟ\u{20000}-\u{3FFFF}]/u.test(char ?? '');
}

// The last full character (code point, not UTF-16 unit) of a string, so
// supplementary-plane kanji are not misread as lone surrogates.
function lastFullChar(text: string): string | undefined {
    if (!text) return undefined;
    const chars = Array.from(text.slice(-2));
    return chars[chars.length - 1];
}

function remapTokenOffsets(token: JPDBToken, offsets: number[], sentence: string): JPDBToken {
    const start = offsets[token.start] ?? token.start;
    const end = offsets[token.end] ?? token.end;
    return {
        ...token,
        start,
        end,
        length: Math.max(0, end - start),
        sentence,
        rubies: token.rubies.map(ruby => {
            const rubyStart = offsets[ruby.start] ?? ruby.start;
            const rubyEnd = offsets[ruby.end] ?? ruby.end;
            return {
                ...ruby,
                start: rubyStart,
                end: rubyEnd,
                length: Math.max(0, rubyEnd - rubyStart),
            };
        }),
    };
}

// A mirror is normally appended as a DIRECT child of its host, but frameworks
// (Discord/ChatGPT React) reconcile the host's subtree and relocate the mirror
// one level deeper (into a wrapper) while leaving the host's own text in place.
// Scanning host.children alone then misses the relocated mirror, so the
// idempotency check appends a SECOND mirror — over repeated re-renders mirrors
// stack and each renders furigana, growing the row unbounded. Search the whole
// subtree instead, but only claim a mirror that this host OWNS: a mirror
// belongs to `host` when `host` is the CLOSEST registered mirror-host ancestor
// of it, so a nested scan host's own mirror is never stolen or torn down here.
// Creation-time mirror→host registration. Subtree queries (ownedTextMirrors)
// cannot see a mirror a framework relocated OUTSIDE its host's subtree (e.g.
// to a host sibling); such an orphan would survive every host-scoped sweep and
// keep painting duplicated text. The WeakMap pins nothing (mirror keys are
// removed with their DOM nodes) and lets teardown match orphans to their host.
const textMirrorOwners = new WeakMap<HTMLElement, HTMLElement>();

function registerTextMirrorOwner(mirror: HTMLElement, host: HTMLElement): void {
    textMirrorOwners.set(mirror, host);
}

function textMirrorBelongsToHost(mirror: HTMLElement, host: HTMLElement): boolean {
    // Creation-time registration wins while the registered owner is still a
    // live mirror host: a mirror a framework relocated INTO another registered
    // host's subtree must not be claimed by that host — its sweep would remove
    // another host's annotation layer and leave the true owner's observer and
    // replay state orphaned.
    const owner = textMirrorOwners.get(mirror);
    if (owner && textMirrorHosts.has(owner)) return owner === host;
    let ancestor = mirror.parentElement;
    while (ancestor && ancestor !== host) {
        if (textMirrorHosts.has(ancestor)) return false;
        ancestor = ancestor.parentElement;
    }
    return ancestor === host;
}

function ownedTextMirrors(host: HTMLElement): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>(READER_TEXT_MIRROR_SELECTOR))
        .filter(mirror => textMirrorBelongsToHost(mirror, host));
}

function currentTextMirror(host: HTMLElement): HTMLElement | null {
    return currentDocumentPortalTextMirror(host) ?? currentInHostTextMirror(host);
}

function currentDocumentPortalTextMirror(host: HTMLElement): HTMLElement | null {
    const state = textMirrorHosts.get(host);
    const tracked = state?.documentPortal ? state.mirror?.deref() : undefined;
    return tracked?.isConnected && textMirrorBelongsToHost(tracked, host) ? tracked : null;
}

/**
 * Resolve a native source target to its nearest mirror word scope. Checking
 * both lanes in composed-ancestor order prevents an outer prose portal from
 * shadowing a separately annotated in-host descendant.
 */
export function documentPortalReaderWordScopeForSource(target: Element): HTMLElement | null {
    let current: HTMLElement | null = target instanceof HTMLElement ? target : target.parentElement;
    for (let depth = 0; current && depth < 16; depth += 1, current = composedParentElement(current)) {
        // Stop at a nearer in-host mirror so the caller can take its ordinary
        // nearest-mirror path. Only an out-of-tree portal is returned here.
        const inHost = currentInHostTextMirror(current);
        if (inHost?.querySelector(READER_WORD_SELECTOR)) return null;
        const portal = currentDocumentPortalTextMirror(current);
        if (portal?.querySelector(READER_WORD_SELECTOR)) return portal;
    }
    return null;
}

/** Map a portal word back to the page-owned host that supplies its interaction. */
export function documentPortalSourceHostForReaderWord(word: Element): HTMLElement | null {
    const mirror = word.closest<HTMLElement>(READER_TEXT_MIRROR_SELECTOR);
    if (!mirror?.classList.contains(DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS)) return null;
    const host = textMirrorOwners.get(mirror);
    return host && currentDocumentPortalTextMirror(host) === mirror ? host : null;
}

function currentInHostTextMirror(host: HTMLElement): HTMLElement | null {
    const direct = Array.from(host.children)
        .find((child): child is HTMLElement => child instanceof HTMLElement && child.matches(READER_TEXT_MIRROR_SELECTOR)
            && textMirrorBelongsToHost(child, host));
    if (direct) return direct;
    return ownedTextMirrors(host)[0] ?? null;
}

// A host whose mirror already renders exactly this text needs no re-collect or
// re-parse. Non-destructive surfaces keep their raw text nodes, so every
// silent auto-scan otherwise re-sends every already-annotated title to parse
// (the dominant cost of scrolling the YouTube feed). Token/settings changes
// that require a re-render arrive through explicit repaint paths, which remove
// the mirror first.
export function textMirrorAlreadyRenders(host: HTMLElement, text: string): boolean {
    const mirror = currentTextMirror(host);
    if (!mirror || !textMirrorRenderIsIntact(mirror)) return false;
    const source = mirror.dataset.sourceText ?? '';
    const renders = normalizedMirrorHostText(source) === normalizedMirrorHostText(text);
    // A transient ancestor hide (an SPA page swap that re-renders cards while
    // the old page is display:none) leaves the mirror force-hidden with no
    // host mutation left to re-sync it — and this skip would then park the
    // host blank forever (concealed text under a hidden mirror). Heal it
    // here; gating on the injected 'hidden' keeps the common visible path
    // free of the ancestor style walk.
    if (renders && mirror.style.getPropertyValue('visibility') === 'hidden') {
        syncTextMirrorVisibilityToPage(host, mirror);
    }
    return renders;
}

// The source ranges the standing mirror actually put a word over. Every word
// carries its range in the coordinates of mirrorSourceHostText(), which is the
// host text the render was derived from — the same space targetHostRanges()
// works in.
function mirrorAnnotatedSourceRanges(mirror: HTMLElement): HostTextRange[] {
    const ranges: HostTextRange[] = [];
    for (const word of mirror.querySelectorAll<HTMLElement>(READER_WORD_SELECTOR)) {
        const start = Number.parseInt(word.dataset.yomuSourceStart ?? '', 10);
        const end = Number.parseInt(word.dataset.yomuSourceEnd ?? '', 10);
        if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
        ranges.push({ start, end });
    }
    return ranges;
}

// What a silent settle scan actually needs to know: was THIS target annotated?
//
// Neither host-level question can answer it. "Does the mirror's source text
// EQUAL the target text" (the historic test) can only ever match a target that
// spans its host alone, so every multi-node row — most of a mobile video list —
// reported "not rendered" forever: each settle re-collected and re-parsed rows
// it had already decorated, each capped continuation re-walked that same head
// instead of advancing, and on a phone's small parse budget the freshly
// recycled rows queued behind that waste and stayed bare. Loosening it to "does
// the host text CONTAIN the target text" is worse: a target is then declared
// done because a NEIGHBOUR on the same host was rendered, and nothing can ever
// heal it — a permanently half-bare row.
//
// So ask the mirror the question it can answer honestly: does a word actually
// stand over each of this target's own source ranges? Nothing is recorded and
// nothing is trusted — the verdict is re-derived from the live host text and
// the words currently on screen every time, so it decays the safe way by
// construction. A recycler that rewrites the host makes the mirror's source
// text stale; a re-render that replaced the mirror took its words with it; a
// render that only covered part of the line leaves the rest of it uncovered.
// Each of those re-offers the target, which costs one re-parse — never a
// permanently bare row.
export function scanTargetAlreadyAnnotated(target: ScanTextTarget): boolean {
    if (!(target.parent instanceof HTMLElement)) return false;
    // A target that spans its host alone is fully answered by the host's own
    // mirror, including renders replayed from cache onto fresh text nodes.
    if (textMirrorAlreadyRenders(target.parent, target.text)) return true;
    const host = nonDestructiveScanHost(target);
    const mirror = currentTextMirror(host);
    // Only hosts that already carry an intact render pay for the text walk
    // below, and for those it is the cost this skip exists to avoid many times
    // over — collecting them means re-deriving that same plan plus a parse.
    if (!mirror || !textMirrorRenderIsIntact(mirror)) return false;
    const fragments = nonDestructiveTargetFragments(target);
    if (!fragments.length) return false;
    const { hostText, nodeOffsets } = hostOriginalTextWithNodeOffsets(host);
    if (!hostText || mirrorSourceHostText(mirror) !== hostText) return false;
    const ranges = targetHostRanges(fragments, nodeOffsets);
    if (!ranges?.length) return false;
    const words = mirrorAnnotatedSourceRanges(mirror);
    let annotated = false;
    for (const range of ranges) {
        // A range with no target-language letter can never carry a word (the
        // render boundary discards such tokens), so requiring one would make
        // the verdict permanently unsatisfiable for every mixed-script line.
        if (!HAS_JAPANESE_LETTER.test(hostText.slice(range.start, range.end))) continue;
        if (!words.some(word => hostRangesOverlap(word, range))) return false;
        annotated = true;
    }
    if (!annotated) return false;
    // Same transient-hide heal as the whole-host path above: skipping a
    // force-hidden mirror with no host mutation left to re-sync it would park
    // the row under a concealing layer.
    if (mirror.style.getPropertyValue('visibility') === 'hidden') syncTextMirrorVisibilityToPage(host, mirror);
    return true;
}

// Every mounted text mirror is created from at least one safe token and must
// therefore contain a reader-word span. Framework reconciliation and browser
// translation can replace only the mirror's children while leaving its source
// and signature data intact; treating that damaged shell as reusable parks the
// page on plain text forever. Keep this structural check shared by collection
// and apply idempotency so the next scan rebuilds the mirror immediately.
function textMirrorRenderIsIntact(mirror: HTMLElement): boolean {
    return Boolean(mirror.querySelector(READER_WORD_SELECTOR));
}

function nonDestructiveScanSignature(
    target: ScanTextTarget,
    tokens: JPDBToken[],
    settings: ReaderSettings,
    suppressRuby = Boolean(target.suppressRuby),
    detachedReadings = suppressRuby,
): string {
    return JSON.stringify({
        readings: detachedReadings ? 'detached' : suppressRuby ? 'none' : 'ruby',
        mode: settings.furiganaMode,
        hidden: settings.furiganaHiddenStateGroups,
        colors: settings.wordColorStates,
        tokens: tokens.map(token => ({
            s: token.start,
            e: token.end,
            v: token.card.vid,
            r: token.card.rid,
            source: token.card.source,
            state: token.card.cardState,
            pitch: token.pitchClass,
            ruby: token.rubies,
        })),
    });
}

const controlTextMirrorHosts = new WeakMap<HTMLElement, ControlTextMirrorHostState>();

function applyTokensToControlTextMirrorTarget(target: ScanTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    const host = target.parent;
    if (!host.isConnected) return;

    const text = target.text;
    const safeTokens = nonOverlappingTokens(tokens, text);
    const placeholderOverlay = isPlaceholderControlTextMirror(host, text);
    const suppressRuby = placeholderOverlay || scanTargetSuppressesRuby(host, target.suppressRuby, false);
    const detachedReadings = suppressRuby && !placeholderOverlay;
    const renderSettings = furiganaSettingsForTarget(settings, host);
    const signature = nonDestructiveScanSignature(target, safeTokens, renderSettings, suppressRuby, detachedReadings);
    const existing = currentControlTextMirror(host);
    if (existing?.dataset.sourceText === text && existing.dataset.renderSignature === signature) return;
    removeControlTextMirror(host);
    if (!safeTokens.length) return;

    const mirror = document.createElement('span');
    mirror.className = 'jpdb-reader-control-text-mirror';
    mirror.dataset.jpdbReaderControlTextMirror = 'true';
    mirror.dataset.jpdbReaderControlMirrorKind = placeholderOverlay ? 'placeholder' : 'inline';
    mirror.dataset.sourceText = text;
    mirror.dataset.renderSignature = signature;
    const state = styleControlTextMirror(mirror, host, placeholderOverlay);
    mirror.append(renderTokenizedScanText(text, safeTokens, renderSettings, {
        parent: host,
            hasNativeRuby: false,
            decoration: target.decoration,
            mirrorRender: true,
            suppressRuby,
            detachedReadings,
            passiveInteraction: target.passiveInteraction,
            suppressRubyDoesNotImplyPassive: placeholderOverlay,
        }));
    if (!mirror.textContent?.trim()) {
        restoreControlTextMirrorHost(host, state);
        return;
    }
    ensureReaderStylesForHost(host);
    host.insertAdjacentElement('afterend', mirror);
    observeControlTextMirrorHost(host, state);
}

function currentControlTextMirror(host: HTMLElement): HTMLElement | null {
    const sibling = host.nextElementSibling;
    return sibling instanceof HTMLElement && sibling.matches(READER_CONTROL_TEXT_MIRROR_SELECTOR) ? sibling : null;
}

interface CanvasFallbackRenderContext {
    canvas: HTMLCanvasElement;
    host: HTMLElement;
    text: string;
    safeTokens: JPDBToken[];
    nativeCanvas: boolean;
    suppressRuby: boolean;
    renderSettings: ReaderSettings;
    signature: string;
}

function canvasFallbackRenderContext(
    target: ScanTextTarget,
    tokens: JPDBToken[],
    settings: ReaderSettings,
): CanvasFallbackRenderContext | null {
    const canvas = target.parent;
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.isConnected) return null;
    const host = canvas.parentElement;
    if (!host) return null;

    const text = target.text;
    const safeTokens = nonOverlappingTokens(tokens, text);
    const nativeCanvas = canvas.parentElement?.classList.contains('lesson-canvas-clipper') ?? false;
    const suppressRuby = [nativeCanvas, Boolean(target.suppressRuby)].includes(true);
    const renderSettings = furiganaSettingsForTarget(settings, canvas);
    const signature = nonDestructiveScanSignature(target, safeTokens, renderSettings, suppressRuby);
    return { canvas, host, text, safeTokens, nativeCanvas, suppressRuby, renderSettings, signature };
}

function applyTokensToCanvasFallbackTarget(target: ScanTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    const context = canvasFallbackRenderContext(target, tokens, settings);
    if (!context) return;
    if (canvasFallbackTextLayerMatches(context)) return;
    removeCanvasFallbackTextLayer(context.canvas);
    if (!context.safeTokens.length) return;
    mountCanvasFallbackTextLayer(target, context);
}

function canvasFallbackTextLayerMatches(context: CanvasFallbackRenderContext): boolean {
    const existing = currentCanvasFallbackTextLayer(context.canvas);
    return [
        existing?.dataset.sourceText === context.text,
        existing?.dataset.renderSignature === context.signature,
    ].every(Boolean);
}

function mountCanvasFallbackTextLayer(target: ScanTextTarget, context: CanvasFallbackRenderContext): void {
    const layer = document.createElement('div');
    layer.className = context.nativeCanvas
        ? 'jpdb-reader-canvas-text-layer jpdb-reader-native-canvas'
        : 'jpdb-reader-canvas-text-layer';
    layer.dataset.sourceText = context.text;
    layer.dataset.renderSignature = context.signature;
    const hasRuby = context.safeTokens.some(token => token.rubies.length > 0) && !context.suppressRuby;
    styleCanvasFallbackTextLayer(layer, context.canvas, hasRuby, context.nativeCanvas);
    layer.append(renderTokenizedScanText(context.text, context.safeTokens, context.renderSettings, {
        parent: context.canvas,
        hasNativeRuby: targetHasNativeRuby(target),
        mirrorRender: true,
        decoration: target.decoration,
        suppressRuby: context.suppressRuby,
        passiveInteraction: context.nativeCanvas || target.passiveInteraction,
    }));
    if (!layer.textContent?.trim()) return;
    const state = mountCanvasTextLayer(context.canvas, context.host, layer, context.nativeCanvas);
    canvasFallbackTextLayers.set(context.canvas, state);
    ensureReaderStylesForHost(context.host);
    context.host.append(layer);
}

function currentCanvasFallbackTextLayer(canvas: HTMLCanvasElement): HTMLElement | null {
    const state = canvasFallbackTextLayers.get(canvas);
    return state?.layer.isConnected ? state.layer : null;
}

function styleCanvasFallbackTextLayer(layer: HTMLElement, canvas: HTMLCanvasElement, hasRuby: boolean, n: boolean): void {
    const style = safeComputedStyle(canvas);
    layer.style.setProperty('position', 'absolute');
    layer.style.setProperty('left', `${canvas.offsetLeft}px`);
    layer.style.setProperty('top', `${canvas.offsetTop}px`);
    layer.style.setProperty('width', `${canvas.offsetWidth || canvas.width}px`);
    layer.style.setProperty('min-height', `${canvas.offsetHeight || canvas.height}px`);
    layer.style.setProperty('box-sizing', 'border-box');
    layer.style.setProperty('overflow', 'visible');
    layer.style.setProperty('visibility', 'visible', 'important');
    layer.style.setProperty('pointer-events', n ? 'none' : 'auto');
    layer.style.setProperty('white-space', 'pre-wrap');
    layer.style.setProperty('font', style.font);
    layer.style.setProperty('font-size', style.fontSize);
    layer.style.setProperty('font-weight', style.fontWeight);
    layer.style.setProperty('line-height', hasRuby ? rubyFriendlyMirrorLineHeight(style) : style.lineHeight);
    layer.style.setProperty('letter-spacing', style.letterSpacing);
    layer.style.setProperty('text-align', style.textAlign);
    layer.style.setProperty('color', style.color);
    layer.style.setProperty('z-index', '1');
    if (n) layer.style.setProperty('opacity', '0');
}

function mountCanvasTextLayer(
    canvas: HTMLCanvasElement,
    host: HTMLElement,
    layer: HTMLElement,
    n: boolean,
): CanvasFallbackTextLayerState {
    const hostStyle = safeComputedStyle(host);
    const state: CanvasFallbackTextLayerState = {
        layer,
        canvasVisibility: canvas.style.getPropertyValue('visibility'),
        canvasVisibilityPriority: canvas.style.getPropertyPriority('visibility'),
        hostPosition: host.style.getPropertyValue('position'),
        hostPositionPriority: host.style.getPropertyPriority('position'),
        hostPositionAdjusted: hostStyle.position === 'static',
    };
    if (state.hostPositionAdjusted) host.style.setProperty('position', 'relative', 'important');
    if (!n) canvas.style.setProperty('visibility', 'hidden', 'important');
    return state;
}

function removeCanvasFallbackTextLayer(canvas: HTMLCanvasElement): void {
    const state = canvasFallbackTextLayers.get(canvas);
    state?.layer.remove();
    if (state) {
        restoreStyleProperty(canvas, 'visibility', 'hidden', state.canvasVisibility, state.canvasVisibilityPriority);
        const host = canvas.parentElement;
        if (host && state.hostPositionAdjusted) restoreStyleProperty(host, 'position', 'relative', state.hostPosition, state.hostPositionPriority);
    }
    canvasFallbackTextLayers.delete(canvas);
}

function isPlaceholderControlTextMirror(host: HTMLElement, text: string): host is HTMLInputElement | HTMLTextAreaElement {
    if (!(host instanceof HTMLInputElement || host instanceof HTMLTextAreaElement)) return false;
    if (host.value.trim()) return false;
    return normalizedControlText(host.getAttribute('placeholder') ?? '') === normalizedControlText(text);
}

function styleControlTextMirror(mirror: HTMLElement, host: HTMLElement, placeholderOverlay: boolean): ControlTextMirrorHostState {
    const style = safeComputedStyle(host);
    mirror.style.setProperty('font', style.font);
    mirror.style.setProperty('color', style.color);
    const state: ControlTextMirrorHostState = {
        onChange: () => removeControlTextMirror(host),
        placeholderHidden: false,
        placeholderHiddenAttribute: host.getAttribute(READER_CONTROL_PLACEHOLDER_HIDDEN_ATTRIBUTE),
        parent: undefined,
        parentPosition: '',
        parentPositionPriority: '',
        parentPositionAdjusted: false,
    };
    if (!placeholderOverlay || !(host instanceof HTMLInputElement || host instanceof HTMLTextAreaElement)) return state;

    host.setAttribute(READER_CONTROL_PLACEHOLDER_HIDDEN_ATTRIBUTE, 'true');
    state.placeholderHidden = true;

    const parent = host.parentElement;
    if (parent) {
        const parentStyle = safeComputedStyle(parent);
        state.parent = parent;
        state.parentPosition = parent.style.getPropertyValue('position');
        state.parentPositionPriority = parent.style.getPropertyPriority('position');
        state.parentPositionAdjusted = parentStyle.position === 'static';
        if (state.parentPositionAdjusted) parent.style.setProperty('position', 'relative', 'important');
    }

    const borderLeft = cssPixels(style.borderLeftWidth);
    const borderTop = cssPixels(style.borderTopWidth);
    const paddingLeft = cssPixels(style.paddingLeft);
    const paddingRight = cssPixels(style.paddingRight);
    const paddingTop = cssPixels(style.paddingTop);
    const contentWidth = host.clientWidth
        ? Math.max(0, host.clientWidth - paddingLeft - paddingRight)
        : Math.max(0, host.getBoundingClientRect().width - borderLeft - cssPixels(style.borderRightWidth) - paddingLeft - paddingRight);
    mirror.style.setProperty('left', `${Math.max(0, host.offsetLeft + borderLeft + paddingLeft)}px`);
    mirror.style.setProperty('top', `${Math.max(0, host.offsetTop + borderTop + paddingTop)}px`);
    if (contentWidth) mirror.style.setProperty('width', `${contentWidth}px`);
    mirror.style.setProperty('line-height', style.lineHeight);
    mirror.style.setProperty('text-align', style.textAlign);
    mirror.style.setProperty('white-space', host instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre');
    return state;
}

function observeControlTextMirrorHost(host: HTMLElement, state: ControlTextMirrorHostState): void {
    // Tear down any listeners from a prior observe cycle on the SAME host before
    // wiring new ones — re-applying tokens to a control re-runs this path.
    const previous = controlTextMirrorHosts.get(host);
    previous?.listeners?.abort();
    const listeners = new AbortController();
    state.listeners = listeners;
    host.addEventListener('change', state.onChange, { signal: listeners.signal });
    host.addEventListener('input', state.onChange, { signal: listeners.signal });
    controlTextMirrorHosts.set(host, state);
}

function removeControlTextMirror(host: HTMLElement): void {
    const state = controlTextMirrorHosts.get(host);
    if (state) {
        // abort() removes both listeners at once; even a detached host (whose
        // removeEventListener would be a no-op against a fresh node) is covered.
        state.listeners?.abort();
        restoreControlTextMirrorHost(host, state);
    }
    currentControlTextMirror(host)?.remove();
    controlTextMirrorHosts.delete(host);
}

function restoreControlTextMirrorHost(host: HTMLElement, state: ControlTextMirrorHostState): void {
    if (state.placeholderHidden) {
        if (state.placeholderHiddenAttribute === null) host.removeAttribute(READER_CONTROL_PLACEHOLDER_HIDDEN_ATTRIBUTE);
        else host.setAttribute(READER_CONTROL_PLACEHOLDER_HIDDEN_ATTRIBUTE, state.placeholderHiddenAttribute);
    }
    if (state.parent && state.parentPositionAdjusted) {
        restoreStyleProperty(state.parent, 'position', 'relative', state.parentPosition, state.parentPositionPriority);
    }
}

function furiganaSettingsForTarget(settings: ReaderSettings, parent: HTMLElement): ReaderSettings {
    if (!targetForcesAllFurigana(parent)) return settings;
    if (settings.showFurigana && settings.furiganaMode === 'all') return settings;
    return { ...settings, showFurigana: true, furiganaMode: 'all' };
}

function scanTargetSuppressesRuby(
    parent: HTMLElement,
    suppressRuby?: boolean,
    inPlace = true,
    decoration?: DecorationState,
): boolean {
    // Yomu-owned surfaces (lookup panel, drawer) may always force readings.
    if (targetForcesAllFurigana(parent) && parent.closest(READER_ROOT_SELECTOR)) return false;
    // The SEALED interactive-passive decision always dominates the page-wide
    // furigana-mode=all attribute. Controls, compact metadata, badges and
    // chrome-shaped links all keep their readings through the DETACHED channel;
    // re-enabling in-flow ruby here is what grew 20px metadata rows to 31–50px
    // and clipped player labels. Owner-curated reading chips classify as
    // content-ruby before this point, so they retain their content behavior.
    if (decoration === 'interactive-passive') return true;
    // Constrained rows reject IN-PLACE ruby on every engine (class Q): the rt
    // paints into the half-leading and the ancestor clip shaves it. The
    // absolutely-positioned mirror sizes its own line, so mirrored renders
    // keep the reading. Even furigana-mode=all must not force in-flow ruby
    // into a clipped row. Exception (owner rule 2026-07-19): a growable
    // multi-line clamp CONTENT row absorbs in-flow ruby by growing its line
    // boxes, so it keeps real rt instead of the rest-hidden detached lane.
    if (inPlace) {
        const clipRow = closestRubyFragileConstrainedRow(parent);
        if (clipRow && !clampRowKeepsInFlowRestRuby(decoration ?? decorationStateForWord(parent) ?? undefined, clipRow)) return true;
    }
    if (targetForcesAllFurigana(parent)) return false;
    return Boolean(suppressRuby);
}

function targetForcesAllFurigana(parent: HTMLElement): boolean {
    return Boolean(parent.closest('[data-yomu-furigana-mode="all"]'));
}

// Class Q (2026-07-10): constrained-row protection is engine-UNCONDITIONAL —
// rt paints into the half-leading and ancestor overflow clips shave it
// mid-glyph on every engine, so the clip-constrained-row fact (see
// decoration-policy) decides protection directly. The old
// rubyDistortsConstrainedRows() engine probe is gone; this hook is retained as
// a no-op so guard tests can prove protection no longer depends on any engine
// verdict.
export function setRubyDistortsConstrainedRowsForTest(value: boolean | null): void {
    void value;
}

function nonDestructiveScanHost(target: ScanTextTarget): HTMLElement {
    if (!isFragmentTextTarget(target)) return target.parent;
    const parents = target.fragments
        .map(fragment => fragment.node.parentElement)
        .filter((parent): parent is HTMLElement => Boolean(parent));
    // Reactive multi-leaf targets are split into one source-preserving target
    // per actual layout leaf. Keep that exact leaf as the mirror host: promoting
    // every piece back to the same preferred component ancestor makes each
    // successive mirror replace the previous one, dropping annotations for
    // tokens that cross an inline framework boundary (e.g. 登<span>録者</span>).
    if (parents.length && parents.every(parent => parent === target.parent)) return target.parent;
    return preferredNonDestructiveTextHost(parents) ?? commonFragmentTextHost(parents) ?? target.parent;
}

function preferredNonDestructiveTextHost(elements: HTMLElement[]): HTMLElement | null {
    if (!elements.length) return null;
    const preferred = elements[0]?.closest<HTMLElement>(NON_DESTRUCTIVE_TEXT_HOST_SELECTOR);
    if (!preferred || !elements.every(element => preferred.contains(element))) return null;
    return preferred;
}

function commonFragmentTextHost(elements: HTMLElement[]): HTMLElement | null {
    if (!elements.length) return null;
    let candidate: HTMLElement | null = elements[0];
    while (candidate) {
        const host = candidate;
        if (elements.every(element => host.contains(element))) return host;
        candidate = candidate.parentElement;
    }
    return null;
}

function targetHasNativeRuby(target: ScanTextTarget): boolean {
    return isFragmentTextTarget(target)
        ? target.fragments.some(fragment => fragment.hasNativeRuby)
        : Boolean(target.hasNativeRuby);
}

function sourceTextSpansMultipleLines(host: HTMLElement): boolean {
    const source = hostOriginalTextWithNodeOffsets(host);
    const style = safeComputedStyle(host);
    if (preservesWhitespace(style.whiteSpace) && /\r|\n/u.test(source.hostText)) return true;
    if (typeof Range !== 'function' || typeof Range.prototype.getClientRects !== 'function') return false;
    const rects = sourceClientRects(host, source.nodeOffsets, 0, source.hostText.length);
    const vertical = /^(?:vertical|sideways)/u.test(style.writingMode);
    const intervals = rects
        .map(rect => vertical ? [rect.left, rect.right] : [rect.top, rect.bottom])
        .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end - start > 0.5);
    return intervals.some(([start, end], index) => intervals.slice(index + 1).some(([otherStart, otherEnd]) => (
        end < otherStart - 0.5 || otherEnd < start - 0.5
    )));
}

function styleTextMirrorHost(host: HTMLElement): TextMirrorHostState {
    const computed = safeComputedStyle(host);
    const state: TextMirrorHostState = {
        observer: new MutationObserver(() => undefined),
        sourceText: '',
        position: host.style.getPropertyValue('position'),
        positionPriority: host.style.getPropertyPriority('position'),
        positioned: computed.position === 'static',
        lineHeight: host.style.getPropertyValue('line-height'),
        lineHeightPriority: host.style.getPropertyPriority('line-height'),
        reservedLineHeight: '',
    };
    textMirrorHosts.set(host, state);
    if (state.positioned) host.style.setProperty('position', 'relative', 'important');
    return state;
}

function styleDocumentPortalTextMirrorHost(host: HTMLElement): TextMirrorHostState {
    const state: TextMirrorHostState = {
        observer: new MutationObserver(() => undefined),
        sourceText: '',
        position: host.style.getPropertyValue('position'),
        positionPriority: host.style.getPropertyPriority('position'),
        positioned: false,
        lineHeight: host.style.getPropertyValue('line-height'),
        lineHeightPriority: host.style.getPropertyPriority('line-height'),
        reservedLineHeight: '',
        documentPortal: true,
    };
    textMirrorHosts.set(host, state);
    return state;
}

function scheduleCurrentTextMirrorProjection(host: HTMLElement): void {
    const mirror = currentTextMirror(host);
    if (mirror?.classList.contains(DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS)) {
        scheduleDocumentPortalMirrorProjection(mirror, host);
        return;
    }
    scheduleAdditiveMirrorProjection(host.getRootNode() as ParentNode);
}

function styleTextMirror(mirror: HTMLElement, host: HTMLElement, hasRuby = false): void {
    const style = safeComputedStyle(host);
    mirror.style.setProperty('position', 'absolute');
    mirror.style.setProperty('inset', '0 0 auto 0');
    // Absolute children start at the host padding box, while the page's native
    // text starts at the content box. Reproduce that inset on the mirror: fixed
    // controls commonly centre a short label with block padding (Reddit's Join
    // button and video-player menus are representative), and dropping the
    // padding pins the mirrored label to the top/edge of the control. Copy the
    // computed physical sides rather than a shorthand so asymmetric and RTL
    // controls retain their authored alignment without site selectors.
    mirror.style.setProperty('box-sizing', 'border-box');
    mirror.style.setProperty('padding-top', style.paddingTop);
    mirror.style.setProperty('padding-right', style.paddingRight);
    mirror.style.setProperty('padding-bottom', style.paddingBottom);
    mirror.style.setProperty('padding-left', style.paddingLeft);
    if (hostCentersTextVertically(host, style)) {
        // Native buttons and centred flex/grid controls align their anonymous
        // text item in the cross axis. An absolute mirror is no longer that
        // item, so reproduce the same centring explicitly; copying padding
        // above keeps its content box faithful while the transform centres the
        // complete padded line box. This is structural (tag/role/layout), not a
        // site profile, and covers transient player menus as well as web
        // components.
        mirror.style.setProperty('inset', '50% 0 auto 0');
        mirror.style.setProperty('transform', 'translateY(-50%)');
    }
    mirror.style.setProperty('height', 'auto');
    mirror.style.setProperty('overflow', 'visible');
    // Visibility is deliberately NOT forced: the mirror inherits the host's
    // effective visibility, so ancestor hides (player-control autohide, SPA
    // page swaps) conceal the overlay with zero JS reconciliation. A forced
    // 'visible !important' here once left underline/furigana floating over
    // the video after YouTube faded its control bar out.
    // The source DOM owns interaction. A transparent absolute layer must not
    // block player controls or framework handlers; lookup resolves through
    // the stamped source ranges instead of the overlay's potentially stale box.
    mirror.style.setProperty('pointer-events', 'none');
    mirror.style.setProperty('white-space', style.whiteSpace);
    mirror.style.setProperty('font', style.font);
    mirror.style.setProperty('font-size', style.fontSize);
    mirror.style.setProperty('font-weight', style.fontWeight);
    mirror.style.setProperty('line-height', hasRuby ? rubyFriendlyMirrorLineHeight(style) : style.lineHeight);
    mirror.style.setProperty('letter-spacing', style.letterSpacing);
    mirror.style.setProperty('text-align', style.textAlign);
    mirror.style.setProperty('z-index', '1');
    if (hasRuby) mirror.dataset.jpdbReaderHasRuby = 'true';
}

function hostCentersTextVertically(host: HTMLElement, style: CSSStyleDeclaration): boolean {
    const itemized = style.display.includes('flex') || style.display.includes('grid');
    if (itemized) return style.alignItems === 'center' || style.alignContent === 'center';
    // Native buttons centre their anonymous text by default. ARIA roles do
    // not: a role=menuitem/div can be top-aligned or use authored padding, so
    // centring every such host moves its mirror away from the original label.
    return host.matches('button,input[type="button"],input[type="submit"],input[type="reset"]');
}

function observeTextMirrorHost(host: HTMLElement): void {
    const state = textMirrorHosts.get(host);
    if (!state) return;
    // Capture the baseline through the SAME extractor the staleness check
    // uses. The render plan's text walk has different skip rules (it keeps
    // hidden/aria-hidden text), so seeding sourceText from the plan left
    // hosts with any aria-hidden node permanently "stale" — every re-render
    // then tore the mirror down after the grace instead of keeping it.
    state.sourceText = normalizedMirrorHostText(nativeTextMirrorHostText(host));
    // Tear down any observer/timer from a prior observe cycle before wiring a
    // fresh one: styleTextMirrorHost seeds state.observer with a no-op
    // placeholder, and a re-observe on a surviving host would otherwise orphan
    // the previous real observer (its callback closure keeps the host alive).
    state.observer.disconnect();
    clearTimeout(state.staleRemovalTimer);
    state.staleRemovalTimer = undefined;
    state.lifecycle?.abort();
    const lifecycle = new AbortController();
    state.lifecycle = lifecycle;
    // The callback closes over only a WeakRef and looks state back up through
    // the host-keyed WeakMap, so a framework detach can collect the host.
    const hostRef = new WeakRef(host);
    // fallow-ignore-next-line complexity
    const observer: MutationObserver = new MutationObserver(mutations => {
        const liveHost = hostRef.deref();
        const liveState = liveHost ? textMirrorHosts.get(liveHost) : undefined;
        if (!liveHost || !liveState || liveState.observer !== observer) {
            // Host collected, teardown already ran, or a re-observe replaced us:
            // drop and disconnect THIS observer so it (and its records) collect.
            liveTextMirrorObservers.delete(observer);
            observer.disconnect();
            return;
        }
        if (mutations.every(mutationInsideTextMirror)) return;
        if (!currentTextMirror(liveHost)) {
            // A recycler that rewrites host.textContent wipes the mirror AND
            // swaps in a fresh title in one batch (YouTube feed/Shorts grid).
            // removeTextMirror un-hides the host, but without queuing a rescan
            // the NEW title would sit as bare, unannotated text until some
            // unrelated scroll scan happened by. Signal staleness first so the
            // app re-scans this surface immediately (the host-text-changed path
            // below already does this for the mirror-survived case).
            const wipedHostText = normalizedMirrorHostText(nativeTextMirrorHostText(liveHost));
            if (liveHost.isConnected && isTargetLanguageText(wipedHostText)) {
                // Class Y/BB: an identical-text re-render (live watch-info
                // cycle, scroll-recycle rehydration) re-applies the cached
                // render synchronously in this microtask — the host stays
                // paint-invariant for the whole cycle (no bare frame, no
                // height oscillation) and no scan/parse is scheduled at all.
                // Gated on the page having REWRITTEN content (added nodes /
                // text writes): a bare mirror.remove() with no rewrite is the
                // host actively deleting our node, and re-adding it would
                // start a fight — that case restores native text instead
                // (pinned by repaint-loop-mirror restore contract).
                if (wipedHostText === liveState.sourceText
                    && mutationsRewroteHostContent(mutations)
                    && replayNonDestructiveRenderFromCache(liveHost)) return;
                dispatchTextMirrorStale(liveHost);
            }
            removeTextMirror(liveHost);
            return;
        }
        // A YouTube re-render can rewrite the host's own style/class attribute
        // without touching its text, stripping the inline visibility:hidden /
        // position:relative we set. That made the native title re-appear
        // (duplication) or the absolute mirror anchor to the wrong ancestor (the
        // title looking missing/misaligned). Re-assert on host attribute changes;
        // reassertTextMirrorHostStyles only writes a property that was actually
        // stripped, so it cannot loop on the style mutation it makes.
        const hostAttributeMutations = mutations.filter(
            mutation => mutation.type === 'attributes' && mutation.target === liveHost,
        );
        if (hostAttributeMutations.length) {
            noteConstrainedRowLayoutSettled();
            // A class change may replace the page's authored line-height while
            // our important inline reservation masks it. Release first, then
            // let the batched projection pass assess the new computed style.
            if (liveState.reservedLineHeight
                && hostAttributeMutations.some(mutation => mutation.attributeName === 'class')) {
                const mirror = currentTextMirror(liveHost);
                if (mirror) releaseTextMirrorReadingLane(liveHost, liveState, mirror);
            }
            reassertTextMirrorHostStyles(liveHost, liveState);
            const liveMirror = currentTextMirror(liveHost);
            if (liveState.documentPortal && liveMirror) {
                // A burst of framework class/style writes can touch many hosts
                // in one checkpoint. Invalidate now, but let the exact portal
                // lane batch their prepare/project/settle work by document so
                // stacking, clip and top-layer reads are shared.
                invalidateDocumentAnnotationPortalClipTopology(liveMirror);
                scheduleDocumentPortalMirrorProjection(liveMirror, liveHost);
            } else {
                scheduleCurrentTextMirrorProjection(liveHost);
            }
        }
        if (!mutations.some(mutation => mutation.type === 'childList' || mutation.type === 'characterData')) return;
        const currentText = normalizedMirrorHostText(nativeTextMirrorHostText(liveHost));
        if (!liveHost.isConnected || !isTargetLanguageText(currentText)) {
            removeTextMirror(liveHost);
            return;
        }
        // Same text, surviving mirror — but the page still REWROTE the nodes the
        // projection is expressed against. Everything a projection pass stamped
        // (the source fragments carrying the status tint and the pitch/status
        // underline, the lifted ruby wrappers, the overlay reading clones) is
        // absolute geometry measured off the host's own text nodes, and this
        // branch is the one live re-render shape that never re-ran that pass.
        // The projection is coalesced into one post-paint frame, so a cadence of
        // re-renders costs one geometry pass each, no scan and no re-parse.
        if (currentText === liveState.sourceText && mutationsRewroteHostContent(mutations)) {
            scheduleCurrentTextMirrorProjection(liveHost);
        }
        if (currentText !== liveState.sourceText) {
            // Keep the stale mirror briefly so a routine title re-render can
            // be rescanned without a bare-text flash — but only briefly: when
            // the element was recycled for DIFFERENT content (the comments
            // header becoming the composer on iPad) and no rescan refreshes
            // the mirror, it would keep painting the OLD text over the new
            // content while hiding it. Restore the host once the grace passes.
            dispatchTextMirrorStale(liveHost);
            // Discord and other framework chats can grow one message in place
            // (for example, `スター` -> `スタープラチナ`). Keeping the old
            // mirror during the rescan grace used to hide the newly appended
            // suffix behind a stale partial mirror. Repaint immediately from
            // the cached tokens when every decorated surface is still at the
            // same offset; the unparsed remainder is emitted as plain text and
            // the stale event still schedules the authoritative fresh parse.
            if (replayNonDestructiveRenderFromCache(liveHost, true)) return;
            reassertTextMirrorHostStyles(liveHost, liveState);
            clearTimeout(liveState.staleRemovalTimer);
            const staleSource = liveState.sourceText;
            const staleLifecycle = liveState.lifecycle;
            liveState.staleRemovalTimer = setTimeout(() => {
                // aborted -> teardown already ran; do not touch a stale host.
                if (staleLifecycle?.signal.aborted) return;
                // Resolve state through the WeakRef only, and identify the
                // scheduling cycle by its lifecycle (an AbortController, which
                // holds no host ref) rather than by closing over liveState —
                // closing over liveState would strong-ref the host (via
                // state.concealedText) for the whole grace window.
                const timerHost = hostRef.deref();
                const timerState = timerHost ? textMirrorHosts.get(timerHost) : undefined;
                if (!timerHost || !timerState || timerState.lifecycle !== staleLifecycle || timerState.sourceText !== staleSource) return;
                if (normalizedMirrorHostText(nativeTextMirrorHostText(timerHost)) !== timerState.sourceText) removeTextMirror(timerHost);
            }, STALE_MIRROR_REMOVAL_GRACE_MS);
        }
    });
    state.observer = observer;
    observer.observe(host, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    // Track the live observer (keyed to a WeakRef of its host, never the host
    // itself) so a guarded token-apply can drain its self-inflicted records AND
    // sweep observers whose host has detached without Yomu teardown. Dropped
    // when this observe cycle is torn down (abort fires on removeTextMirror and
    // on the next re-observe).
    liveTextMirrorObservers.set(observer, hostRef);
    lifecycle.signal.addEventListener('abort', () => liveTextMirrorObservers.delete(observer), { once: true });
}

// Live per-host mirror observers, keyed to a WeakRef of their host (never the
// host itself, so this map cannot pin a detached host). The visible-page
// scanner's batched token-apply tears down and rebuilds mirrors on hosts it
// re-scans; those mutations fire these PER-HOST observers (pauseMutationObserver
// pauses only the app-level auto-scan observer, not these). Each fired observer
// would dispatch a stale event, the app schedules another scan, and long/
// dynamic pages spin a self-sustaining allocation loop that OOM-crashes the tab.
//
// MutationObserver callbacks run as microtasks AFTER the synchronous apply
// block returns, so a bare depth flag checked at dispatch time is already 0 by
// then. Instead, at the END of each guarded apply we synchronously DRAIN each
// live observer's queued records (takeRecords), discarding the self-inflicted
// mutations before their microtask runs — the callback then fires with an
// empty record set and early-returns. (takeRecords drains ALL live observers,
// so an unrelated external mutation queued in the same delivery turn could be
// dropped; the app-level auto-scan observer re-covers that surface on its next
// settle, so no annotation is lost.) A REAL external re-render that queues in a
// LATER task (the common recycler case, e.g. the 1.6.108 YouTube title-recycler)
// is never drained, so its legitimate stale-rescan still fires.
const liveTextMirrorObservers = new Map<MutationObserver, WeakRef<HTMLElement>>();
let mirrorTokenApplyDepth = 0;

export function withMirrorTokenApply<T>(callback: () => T): T {
    mirrorTokenApplyDepth += 1;
    try {
        return callback();
    } finally {
        mirrorTokenApplyDepth -= 1;
        // Only drain once the outermost apply block completes, so a nested
        // apply does not clear records the outer block still needs to ignore.
        if (mirrorTokenApplyDepth === 0) {
            sweepAndDrainTextMirrorObservers();
        }
    }
}

// Runs every guarded apply (once per scan cadence during reading). For each
// tracked observer: if its host WeakRef is dead OR the host has left the DOM
// without Yomu teardown (a framework replaced its subtree — the exact OOM
// scenario, where the observer would otherwise sit in this map forever and its
// callback never fire again to self-clean), disconnect it, abort its lifecycle,
// and drop it — releasing the detached host. Live hosts just get their records
// drained. Sweeping !isConnected is safe: the observer callback already tears a
// mirror down the moment it fires on an off-DOM host (the !liveHost.isConnected
// branch), so a detached host never legitimately keeps its mirror to reattach.
function sweepAndDrainTextMirrorObservers(): void {
    for (const [observer, hostRef] of liveTextMirrorObservers) {
        const host = hostRef.deref();
        if (!host || !host.isConnected) {
            liveTextMirrorObservers.delete(observer);
            observer.disconnect();
            if (host) removeTextMirror(host);
            continue;
        }
        observer.takeRecords();
        healStuckHiddenTextMirror(host);
    }
}

// A transient ancestor hide (SPA page swap) can leave a mirror force-hidden
// with no host mutation left to re-sync it — blank text under a concealed
// host. Scans may never re-collect the host (budget, channel bylines), so
// heal wherever mirrors are visited in bulk; the force-hidden gate keeps the
// common visible path to one style read.
function healStuckHiddenTextMirror(host: HTMLElement): void {
    const mirror = currentTextMirror(host);
    if (!mirror || mirror.style.getPropertyValue('visibility') !== 'hidden') return;
    // Bulk path: consult the memoized verdict first — only a mirror whose
    // page context has actually un-concealed pays the exact sync below.
    if (pageConcealsTextMirrorHostMemoized(host)) return;
    syncTextMirrorVisibilityToPage(host, mirror);
}

// Called from every visible-page scan settle (including empty/skipped scans,
// where no guarded token apply runs and the sweep above never fires).
export function healTextMirrorPageVisibility(): void {
    for (const [observer, hostRef] of liveTextMirrorObservers) {
        const host = hostRef.deref();
        if (!host || !host.isConnected) {
            liveTextMirrorObservers.delete(observer);
            observer.disconnect();
            if (host) removeTextMirror(host);
            continue;
        }
        healStuckHiddenTextMirror(host);
        refreshConstrainedMirrorProjection(host);
    }
}

// Frameworks can apply their clamp after the first scan. Refresh the generic
// clamp verdict and exact source projection when that geometry settles.
function refreshConstrainedMirrorProjection(host: HTMLElement): void {
    const mirror = currentTextMirror(host);
    if (!mirror || mirror.dataset.yomuDetachedReadings !== 'true') return;
    const geometry = mirrorProjectionGeometrySignature(mirror);
    if (settledMirrorProjectionGeometry.get(host) === geometry) return;
    const clipRow = closestRubyFragileConstrainedRow(host);
    if (clipRow && !clipRow.dataset.yomuClipConstrained) {
        const decoration = host.closest('[data-yomu-decoration]')?.getAttribute('data-yomu-decoration') as DecorationState | null;
        clipRow.dataset.yomuClipConstrained = contentClipRowShowsRestReadings(decoration ?? undefined, clipRow)
            ? 'content'
            : 'true';
    }
    if (mirror.dataset.yomuSourceProjected !== 'true') filterDetachedWordsToClip(mirror, clipRow);
    projectAdditiveTextMirror(mirror, host);
    settledMirrorProjectionGeometry.set(host, mirrorProjectionGeometrySignature(mirror));
}

function dispatchTextMirrorStale(host: HTMLElement): void {
    host.dispatchEvent(new CustomEvent(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, {
        bubbles: true,
    }));
}

// Class Y/BB — same-input render replay. Live surfaces re-render on a fixed
// cadence with UNCHANGED text (ytd-watch-info-text every ~6s on live streams),
// and mobile scroll recyclers rehydrate tiles with identical content; each
// cycle used to strip the mirror, dispatch stale, and pay a full debounced
// re-scan + re-parse + re-render — visible flicker, row-height oscillation
// under the finger, and CPU churn. The last successful render per host is
// cached (plan text + remapped tokens + the raw host text it was derived
// from); when a framework wipe leaves the SAME host text behind, the cached
// render is re-applied synchronously in the observer microtask — no bare
// frame, no scan, no parse, no ruby-room geometry. Deterministic: replay only
// runs when the re-derived host text is byte-identical to the cached input,
// and the render itself is a pure function of (text, tokens, settings).
interface NonDestructiveRenderCacheEntry {
    planText: string;
    hostTextAtRender: string;
    tokens: JPDBToken[];
    settings: ReaderSettings;
    decoration?: DecorationState;
    decorationProfileOverride?: boolean;
    suppressRuby?: boolean;
    passiveInteraction?: boolean;
    layoutSensitive?: boolean;
    insideShadowDOM?: boolean;
    parserId?: string;
    hadNativeRuby: boolean;
    epoch: number;
}

const nonDestructiveRenderCache = new WeakMap<HTMLElement, NonDestructiveRenderCacheEntry>();
// Bulk teardown (annotations off, destroy, settings-driven clears) must
// invalidate every cached render; a WeakMap cannot be iterated, so entries
// carry the epoch they were written under.
let nonDestructiveRenderCacheEpoch = 0;
let nonDestructiveRenderReplayCount = 0;

/** Test hook: replays are otherwise indistinguishable from a fresh scan render. */
export function nonDestructiveRenderReplayCountForTest(): number {
    return nonDestructiveRenderReplayCount;
}

function rememberNonDestructiveRenderForReplay(
    host: HTMLElement,
    target: ScanTextTarget,
    planText: string,
    tokens: JPDBToken[],
    hostTextAtRender: string,
    settings: ReaderSettings,
): void {
    nonDestructiveRenderCache.set(host, {
        planText,
        hostTextAtRender,
        tokens,
        settings,
        decoration: target.decoration,
        decorationProfileOverride: isFragmentTextTarget(target) ? target.decorationProfileOverride : undefined,
        suppressRuby: target.suppressRuby,
        passiveInteraction: target.passiveInteraction,
        layoutSensitive: target.layoutSensitive,
        insideShadowDOM: target.insideShadowDOM,
        parserId: isFragmentTextTarget(target) ? target.parserId : undefined,
        hadNativeRuby: targetHasNativeRuby(target),
        epoch: nonDestructiveRenderCacheEpoch,
    });
}

function replayNonDestructiveRenderFromCache(host: HTMLElement, allowCompatibleTextChange = false): boolean {
    const entry = nonDestructiveRenderCache.get(host);
    if (!entry || entry.epoch !== nonDestructiveRenderCacheEpoch) return false;
    // Native-ruby fragment metadata cannot be reconstructed for detached
    // fragments — fall back to the stale-rescan path for those rare hosts.
    if (entry.hadNativeRuby || !host.isConnected) return false;
    // Normally this is a strict same-input gate. The one deliberate exception
    // is compatible progressive growth: all cached decorated surfaces still
    // occupy the same spans, so they can be retained while new remainder text
    // is painted plainly until the fresh parse arrives.
    const currentHostText = hostOriginalTextWithNodeOffsets(host).hostText;
    const compatibleTextChange = currentHostText !== entry.hostTextAtRender
        && allowCompatibleTextChange
        && cachedTokenSurfacesRemainStable(entry, currentHostText);
    if (currentHostText !== entry.hostTextAtRender
        && !compatibleTextChange) return false;
    // Same-FACTS gate (sol review P1): a recycler can keep the text but change
    // the host's role/ancestry (content row becoming a button). Re-run the
    // deterministic classifier; any drift falls back to the stale-rescan path
    // so the fresh scan re-seals the verdict instead of replaying a stale one.
    // Profile-overridden verdicts (owner-curated upgrades the classifier
    // cannot reproduce) only guard the skip transition, like the scanner does.
    if (entry.decoration) {
        const current = classifyDecoration(host);
        if (entry.decorationProfileOverride ? current === 'skip' : current !== entry.decoration) return false;
    }
    const target: FragmentTextTarget = {
        text: compatibleTextChange ? currentHostText : entry.planText,
        parent: host,
        fragments: [],
        decoration: entry.decoration,
        decorationProfileOverride: entry.decorationProfileOverride,
        suppressRuby: entry.suppressRuby,
        passiveInteraction: entry.passiveInteraction,
        layoutSensitive: entry.layoutSensitive,
        insideShadowDOM: entry.insideShadowDOM,
        parserId: entry.parserId,
        nonDestructive: true,
    };
    try {
        withMirrorTokenApply(() => {
            removeTextMirror(host);
            // Re-stamp the sealed decoration: a framework re-render may have
            // rewritten the host's attributes along with its children.
            stampTargetDecoration(target, host);
            applyTokensToNonDestructiveScanTarget(target, entry.tokens, entry.settings);
        });
    } catch {
        return false;
    }
    if (!currentTextMirror(host)) return false;
    nonDestructiveRenderReplayCount += 1;
    return true;
}

function cachedTokenSurfacesRemainStable(entry: NonDestructiveRenderCacheEntry, currentHostText: string): boolean {
    if (!currentHostText || currentHostText === entry.hostTextAtRender) return false;
    return entry.tokens.length > 0 && entry.tokens.every(token => {
        if (token.start < 0 || token.end <= token.start || token.end > currentHostText.length) return false;
        return entry.planText.slice(token.start, token.end) === currentHostText.slice(token.start, token.end);
    });
}

function mutationInsideTextMirror(mutation: MutationRecord): boolean {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    return Boolean(target?.closest(READER_TEXT_MIRROR_SELECTOR));
}

// True when the batch shows the PAGE writing content (fresh nodes or text
// writes outside our mirror) — the recycler/re-render shape — as opposed to
// merely deleting our mirror node.
function mutationsRewroteHostContent(mutations: MutationRecord[]): boolean {
    return mutations.some(mutation => {
        if (mutationInsideTextMirror(mutation)) return false;
        if (mutation.type === 'characterData') return true;
        return mutation.type === 'childList'
            && Array.from(mutation.addedNodes).some(node => !nodeIsReaderMirrorNode(node));
    });
}

function nodeIsReaderMirrorNode(node: Node): boolean {
    return node instanceof Element && Boolean(node.closest?.(READER_TEXT_MIRROR_SELECTOR));
}

function nativeTextMirrorHostText(host: HTMLElement): string {
    let text = '';
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent || parent.closest(TEXT_MIRROR_NATIVE_TEXT_SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) text += node.textContent ?? '';
    if (isTargetLanguageText(text)) return text;
    const labelledText = Array.from(host.querySelectorAll<HTMLElement>('[aria-label]'))
        .filter(element => !element.closest(TEXT_MIRROR_ARIA_LABEL_SKIP_SELECTOR))
        .map(element => element.getAttribute('aria-label') ?? '')
        .join(' • ');
    return isTargetLanguageText(labelledText) ? labelledText : text;
}

function normalizedMirrorHostText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function removeTextMirror(host: HTMLElement): void {
    const state = textMirrorHosts.get(host);
    state?.observer.disconnect();
    // Abort BEFORE clearing so a stale-removal timer that already queued a
    // microtask/callback sees signal.aborted and no-ops against the removed host.
    state?.lifecycle?.abort();
    clearTimeout(state?.staleRemovalTimer);
    if (state) state.staleRemovalTimer = undefined;
    // Remove EVERY mirror this host owns, not just its direct children: a
    // framework re-render can relocate the mirror into a wrapper below the host
    // (Discord), and a direct-child-only sweep would orphan it — the next paint
    // then stacks a fresh mirror on top. Ownership scoping (host is the closest
    // registered mirror-host ancestor) leaves a nested scan host's own mirror
    // untouched.
    const owned = ownedTextMirrors(host);
    owned.forEach(mirror => {
        unregisterDocumentAnnotationPortalMirror(mirror);
        clearProjectedReadings(mirror);
        mirror.remove();
    });
    // A framework may have relocated the registered mirror OUTSIDE the host's
    // subtree (host sibling, another host's subtree, into or out of a shadow
    // root). The state carries a WeakRef to the exact mirror this host's apply
    // created, so teardown removes it wherever it landed — O(1), no document
    // or root-wide queries, and direction-agnostic across root boundaries.
    const tracked = state?.mirror?.deref();
    if (tracked && !owned.includes(tracked)) {
        unregisterDocumentAnnotationPortalMirror(tracked);
        clearProjectedReadings(tracked);
    }
    if (tracked?.isConnected) tracked.remove();
    if (state) restoreTextMirrorHost(host, state);
    textMirrorHosts.delete(host);
}

// The mirror inherits host visibility by default (styleTextMirror never
// forces it), so ancestor hides conceal it natively. This sync only stamps an
// explicit hidden for conceal mechanisms inheritance cannot follow, and
// otherwise REMOVES the inline property so inheritance stays in charge —
// never force 'visible': that defeats player-control autohide and is the
// mechanism behind stray floating underlines. Native host visibility is
// untouched.
function syncTextMirrorVisibilityToPage(
    host: HTMLElement,
    mirror: HTMLElement,
    knownTopLayerConcealsPortal?: boolean,
): void {
    const topLayerConcealsPortal = mirror.classList.contains(DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS)
        && (knownTopLayerConcealsPortal ?? documentTopLayerConcealsPortal(host.ownerDocument));
    if (topLayerConcealsPortal || pageConcealsTextMirrorHost(host)) {
        mirror.style.setProperty('visibility', 'hidden', 'important');
    }
    else mirror.style.removeProperty('visibility');
}

function documentTopLayerConcealsPortal(document: Document): boolean {
    // A body-mounted portal cannot participate in the browser top layer. Hide
    // it rather than painting stale high-z-index fragments around fullscreen,
    // modal-dialog, or popover UI. The native label remains untouched/readable.
    if (document.fullscreenElement) return true;
    try {
        return Array.from(document.querySelectorAll<HTMLElement>(
            ':modal, :popover-open, [aria-modal="true"]',
        )).some(element => {
            const style = safeComputedStyle(element);
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && style.visibility !== 'collapse'
                && (style.opacity === '' || Number.parseFloat(style.opacity) !== 0);
        });
    } catch {
        // Engines without one of these selectors still handle fullscreen and
        // ordinary authored visibility.
        return false;
    }
}

function pageConcealsTextMirrorHost(host: HTMLElement): boolean {
    for (let element: HTMLElement | null = host; element; element = composedParentElement(element)) {
        const style = safeComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return true;
        // Fade-style concealment does not propagate through the visibility
        // channel: a faded-out ancestor (opacity transition finished at 0) or
        // a content-visibility:hidden container hides the native text while a
        // descendant could still paint. Treat both as concealment.
        if (style.opacity !== '' && Number.parseFloat(style.opacity) === 0) return true;
        if (style.contentVisibility === 'hidden') return true;
    }
    return false;
}

// HEAL-PATH memo only. The heal pass consults the conceal verdict for every
// force-hidden mirror on every scan settle; an unmemoized ancestor walk
// (getComputedStyle per level) across the dozens of legitimately-hidden
// mirrors on an SPA's cached previous page forces repeated style recalcs and
// janks the page (iPad 2026-07-11 "LAG"). Direct syncs (creation, reassert)
// keep the exact walk — only the bulk heal amortizes.
const PAGE_CONCEAL_VERDICT_TTL_MS = 1000;
const pageConcealVerdictMemo = new WeakMap<HTMLElement, { at: number; concealed: boolean }>();

function pageConcealsTextMirrorHostMemoized(host: HTMLElement): boolean {
    const now = Date.now();
    const memo = pageConcealVerdictMemo.get(host);
    if (memo && now - memo.at < PAGE_CONCEAL_VERDICT_TTL_MS) return memo.concealed;
    const concealed = pageConcealsTextMirrorHost(host);
    pageConcealVerdictMemo.set(host, { at: now, concealed });
    return concealed;
}

// A framework re-render can strip the one layout-neutral host style the
// additive layer needs. Reassert only the positioning context: native paint,
// overflow and display always remain page-owned.
function reassertTextMirrorHostStyles(host: HTMLElement, state: TextMirrorHostState): void {
    const mirror = currentTextMirror(host);
    if (!mirror) {
        removeTextMirror(host);
        return;
    }
    if (state.documentPortal) {
        // Responsive/theme mutations may replace native typography while the
        // portal survives; refresh the copied paint metrics without touching
        // any native child or inline style.
        styleDocumentAnnotationPortalMirror(mirror, host);
        // Keep source glyphs authoritative across the complete mutation
        // microtask. This is intentionally before geometry: even a transiently
        // unmeasurable Range must never expose the portal's bare text runs.
        styleAdditiveMirrorPaint(mirror);
        syncTextMirrorVisibilityToPage(host, mirror);
        return;
    }
    syncTextMirrorVisibilityToPage(host, mirror);
    if (state.positioned && host.style.getPropertyValue('position') !== 'relative') {
        host.style.setProperty('position', 'relative', 'important');
    }
}

function restoreTextMirrorHost(host: HTMLElement, state: TextMirrorHostState): void {
    if (state.positioned) restoreStyleProperty(host, 'position', 'relative', state.position, state.positionPriority);
    if (state.reservedLineHeight) {
        restoreStyleProperty(host, 'line-height', state.reservedLineHeight, state.lineHeight, state.lineHeightPriority);
    }
}

// Restore the pre-mirror inline value ONLY while the property still carries
// Yomu's injected value — if the framework rewrote the host's style while the
// mirror was up, its newer value wins over our stale capture.
function restoreStyleProperty(host: HTMLElement, property: string, injectedValue: string, value: string, priority: string): void {
    const current = host.style.getPropertyValue(property);
    if (current !== injectedValue || host.style.getPropertyPriority(property) !== 'important') return;
    if (value) host.style.setProperty(property, value, priority);
    else host.style.removeProperty(property);
}

// Resolve a mirror node to the host CURRENTLY registered in textMirrorHosts —
// the closest such ancestor, matching the ownership model removeTextMirror uses.
// A framework can relocate the mirror into a wrapper BELOW its host (Discord in
// light DOM, shreddit inside a shadow root): keying teardown off
// mirror.parentElement would call removeTextMirror(wrapper), find no registered
// state, remove the node but leave the ORIGINAL host's observer connected and
// its styles unrestored (a leak). Fall back to the parent only for true orphan
// nodes whose host is already gone.
function registeredTextMirrorHostFor(mirror: HTMLElement): HTMLElement | null {
    // Creation-time registration wins: it stays correct even after a framework
    // relocates the mirror outside its host's subtree, where the ancestor walk
    // below would misattribute teardown to an unrelated wrapper.
    const owner = textMirrorOwners.get(mirror);
    if (owner && textMirrorHosts.has(owner)) return owner;
    let ancestor = mirror.parentElement;
    while (ancestor) {
        if (textMirrorHosts.has(ancestor)) return ancestor;
        ancestor = ancestor.parentElement;
    }
    return null;
}

export function removeNonDestructiveScanMirrors(root: ParentNode = document): number {
    // A bulk clear is a statement that NOTHING may re-decorate on its own:
    // invalidate every cached replay render (class Y/BB) so a framework
    // re-render after "annotations off" cannot resurrect a mirror.
    nonDestructiveRenderCacheEpoch += 1;
    const hosts = new Set<HTMLElement>();
    // Pierce open shadow roots: a shadow-scan mirror is appended INSIDE its
    // shadow root, which root.querySelectorAll does not cross. Missing it here
    // would leave the shadow mirror painted AND its per-host observer connected
    // after clear/destroy — the exact leak class 1.6.109/1.6.112 closed. Bounded
    // and open-only, consistent with the scan-side descent.
    const controlHosts = new Set<HTMLElement>();
    const canvasHosts = new Set<HTMLCanvasElement>();
    // Body-mounted portals are outside a scoped source root by design. Resolve
    // them through the registry so clearing a comment panel, route subtree, or
    // recycled shelf also retires its out-of-tree mirror and observer state.
    documentAnnotationPortalMirrorsWithin(root).forEach(mirror => {
        const host = registeredTextMirrorHostFor(mirror);
        if (host) hosts.add(host);
        else {
            unregisterDocumentAnnotationPortalMirror(mirror);
            clearProjectedReadings(mirror);
            mirror.remove();
        }
    });
    queryAllInAnnotationRoots(root, `${READER_TEXT_MIRROR_SELECTOR},${READER_CONTROL_TEXT_MIRROR_SELECTOR},${READER_CANVAS_TEXT_LAYER_SELECTOR}`).forEach(surface => {
        if (surface.matches(READER_TEXT_MIRROR_SELECTOR)) {
            const host = registeredTextMirrorHostFor(surface) ?? surface.parentElement;
            if (host) hosts.add(host);
            else surface.remove();
        } else if (surface.matches(READER_CONTROL_TEXT_MIRROR_SELECTOR)) {
            const host = surface.previousElementSibling;
            if (host instanceof HTMLElement) controlHosts.add(host);
            else surface.remove();
        } else {
            const canvas = canvasForFallbackTextLayer(surface);
            if (canvas) canvasHosts.add(canvas);
            else surface.remove();
        }
    });
    hosts.forEach(removeTextMirror);
    controlHosts.forEach(removeControlTextMirror);
    canvasHosts.forEach(removeCanvasFallbackTextLayer);
    // Bulk mirror teardown is a real clear (destroy, language refresh,
    // annotations off): boxes grown for those mirrors must shrink back too.
    // Per-refresh removeTextMirror deliberately does NOT release — a mirror is
    // removed and immediately re-appended on every re-apply, and releasing
    // there would oscillate row heights (the CI rewrap-convergence contract).
    releaseRubyRoomGrowth(root);
    return hosts.size + controlHosts.size + canvasHosts.size;
}

function queryAllInAnnotationRoots(root: ParentNode, selector: string): HTMLElement[] {
    const matches = new Set<HTMLElement>();
    const collect = (annotationRoot: ParentNode): void => {
        if (annotationRoot instanceof HTMLElement && annotationRoot.matches(selector)) matches.add(annotationRoot);
        annotationRoot.querySelectorAll<HTMLElement>(selector).forEach(match => matches.add(match));
    };
    collect(root);
    // Annotation passes register every open root they enter, including deferred
    // depth continuations, so this reaches mirrors at any depth and while a
    // framework temporarily caches their hosts off-DOM.
    forEachScannedShadowRoot(shadowRoot => {
        if (root === document || composedTreeContains(root, shadowRoot.host)) collect(shadowRoot);
    }, true);
    return [...matches];
}

function composedTreeContains(root: ParentNode, node: Node): boolean {
    const rootNode = root as Node;
    let current: Node | null = node;
    while (current) {
        if (current === rootNode || rootNode.contains(current)) return true;
        const tree = current.getRootNode();
        current = tree instanceof ShadowRoot ? tree.host : null;
    }
    return false;
}

export function removeStaleControlTextMirrors(root: ParentNode = document): number {
    let removed = 0;
    root.querySelectorAll<HTMLElement>(READER_CONTROL_TEXT_MIRROR_SELECTOR).forEach(mirror => {
        const host = mirror.previousElementSibling;
        if (!(host instanceof HTMLElement)) {
            mirror.remove();
            removed += 1;
            return;
        }
        if (isVisible(host)) return;
        removeControlTextMirror(host);
        removed += 1;
    });
    return removed;
}

function canvasForFallbackTextLayer(layer: HTMLElement): HTMLCanvasElement | null {
    const host = layer.parentElement;
    if (!host) return null;
    return Array.from(host.querySelectorAll<HTMLCanvasElement>('canvas'))
        .find(canvas => canvasFallbackTextLayers.get(canvas)?.layer === layer)
        ?? null;
}

function appendPlainTextBeforeToken(fragment: DocumentFragment, text: string, start: number, end: number, followedByToken = false): void {
    if (end <= start) return;
    const slice = text.slice(start, end);
    const digits = followedByToken ? TRAILING_DIGITS_RE.exec(slice)?.[0] : undefined;
    if (!digits) {
        fragment.append(document.createTextNode(slice));
        return;
    }
    const prefix = slice.slice(0, slice.length - digits.length);
    if (prefix) fragment.append(document.createTextNode(prefix));
    const bind = document.createElement('span');
    bind.className = NUMBER_BIND_CLASS;
    bind.textContent = digits;
    fragment.append(bind);
}

function markRenderedScanTarget(target: ScanTextTarget): void {
    const text = normalizedRenderedHostText(target.text);
    if (!text || !isTargetLanguageText(text) || !target.parent.isConnected) return;
    const previous = renderedScanHosts.get(target.parent);
    const now = Date.now();
    const keepBackoff = previous
        && previous.text === text
        && previous.lastRejectedAt !== undefined
        && now - previous.lastRejectedAt < RENDERED_SCAN_HOST_REJECTION_RESET_MS;
    renderedScanHosts.set(target.parent, {
        text,
        markedAt: now,
        lastRejectedAt: keepBackoff ? previous.lastRejectedAt : undefined,
        rejectionCount: keepBackoff ? previous.rejectionCount : undefined,
    });
}

export function mutationLooksLikeReaderRenderRejection(mutation: MutationRecord): boolean {
    return classifyReaderRenderRejection(mutation) !== null;
}

export function readerRenderRejectionRescanDelay(mutation: MutationRecord): number | null {
    const rejection = classifyReaderRenderRejection(mutation);
    if (!rejection) return null;
    if (rejection.duplicateInsert) {
        // A re-rendering framework re-inserted its OWN copy of the host text
        // alongside our still-intact word-spans (it lost the node our destructive
        // paint replaced), producing the unreadable double image. Drop only our
        // tracked destructive paint (never page-owned nodes) and promote the host
        // to the non-destructive mirror so every later re-render overlays cleanly
        // instead of re-fragmenting the framework's text.
        replaceStaleReaderPaintWithAddedNodes(rejection.match.element);
        loopingScanHosts.add(rejection.match.element);
    } else if (rejection.repair) {
        unwrapReaderWords(rejection.match.element);
    }
    return nextRenderedScanHostRescanDelay(rejection.match.host);
}

function classifyReaderRenderRejection(mutation: MutationRecord): { match: { element: HTMLElement; host: RenderedScanHost }; repair: boolean; duplicateInsert?: boolean } | null {
    if (mutation.type !== 'childList') return null;
    const element = mutationTargetElement(mutation.target);
    if (!element) return null;
    const match = closestRenderedScanHost(element);
    if (!match || Date.now() - match.host.markedAt > RENDERED_SCAN_HOST_REJECTION_WINDOW_MS) return null;
    if (nodesContainReaderWord(mutation.removedNodes) && restoredHostTextMatches(match.element, match.host.text, mutation.addedNodes)) {
        return { match, repair: false };
    }
    if (mutationTouchesReaderWordContent(mutation) && renderedHostContainsDamagedReaderWord(match.element)) {
        return { match, repair: true };
    }
    // A framework re-render re-inserted a plain copy of the host surface ALONGSIDE
    // our intact word-spans (nothing removed, nothing damaged) — the NHK double
    // image. Only framework-managed hosts, and only when the added text really
    // duplicates the stored surface (not new distinct content such as a live
    // ticker appending a fresh line).
    if (elementIsFrameworkManaged(match.element)
        && addedNodesDuplicateHostSurface(mutation.addedNodes, match.host.text)
        && Boolean(match.element.querySelector(READER_WORD_SELECTOR))) {
        return { match, repair: false, duplicateInsert: true };
    }
    return null;
}

function addedNodesDuplicateHostSurface(addedNodes: NodeList | Node[], previousText: string): boolean {
    if (!previousText || nodesContainReaderWord(addedNodes)) return false;
    // The stored surface is capped to RENDERED_SCAN_HOST_MAX_TEXT. When it sits
    // exactly at the cap it may be TRUNCATED, so `includes` could match a partial
    // re-insert of the FIRST 1000 chars of a longer surface. Only trust the check
    // for surfaces that fit within the cap (the overwhelmingly common single
    // paragraph); truncated giants fall through to the safe debounced rescan.
    if (previousText.length >= RENDERED_SCAN_HOST_MAX_TEXT) return false;
    const addedText = normalizedRenderedHostText(Array.from(addedNodes, node => node.textContent ?? '').join(''));
    // A genuine duplicate re-insert reproduces the WHOLE painted surface; a tiny
    // split fragment (の, する) that merely appears within it must NOT qualify, or
    // a legitimate framework reconciliation would trip the cleanup.
    return addedText.length >= previousText.length && addedText.includes(previousText);
}

// Drop only what our destructive paint added — the word-spans and the plain text
// nodes WE created and tracked in destructivePaintTextNodes. Page-owned siblings
// (which we never created, so are not tracked) and the framework's just-added
// nodes are left untouched, so the host keeps a single clean copy for the
// promoted mirror to overlay. The framework's re-render then reconciles freely.
function replaceStaleReaderPaintWithAddedNodes(host: HTMLElement): void {
    host.querySelectorAll<HTMLElement>(READER_WORD_SELECTOR).forEach(word => word.remove());
    // Registration walks the whole rendered fragment, so our tracked plain-text
    // nodes can sit inside wrappers (.jpdb-reader-number-bind, the flex/grid run
    // span) — not only as direct children. Walk the whole subtree so none are left
    // behind as a stale duplicate remnant.
    const staleTextNodes: Text[] = [];
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (destructivePaintTextNodes.has(node as Text)) staleTextNodes.push(node as Text);
    }
    staleTextNodes.forEach(node => node.remove());
    // Deliberately NO host.normalize(): merging adjacent text nodes would fuse the
    // framework's OWN just-inserted node with a page-owned neighbour, changing node
    // identity and breaking React/Vue reconciliation. The promoted mirror reads the
    // host surface directly, so the nodes never need to be coalesced here.
}

function nextRenderedScanHostRescanDelay(host: RenderedScanHost): number {
    const now = Date.now();
    const previousCount = host.lastRejectedAt !== undefined && now - host.lastRejectedAt < RENDERED_SCAN_HOST_REJECTION_RESET_MS
        ? host.rejectionCount ?? 0
        : 0;
    host.lastRejectedAt = now;
    host.rejectionCount = previousCount + 1;
    return RENDERED_SCAN_HOST_RESCAN_DELAYS_MS[Math.min(previousCount, RENDERED_SCAN_HOST_RESCAN_DELAYS_MS.length - 1)];
}

function closestRenderedScanHost(element: Element): { element: HTMLElement; host: RenderedScanHost } | null {
    let current: HTMLElement | null = null;
    if (element instanceof HTMLElement) current = element;
    else if (element.parentElement instanceof HTMLElement) current = element.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
        const host = renderedScanHosts.get(current);
        if (host) return { element: current, host };
        current = current.parentElement;
    }
    return null;
}

function restoredHostTextMatches(element: Element, previousText: string, addedNodes: NodeList | Node[]): boolean {
    const currentText = normalizedRenderedHostSurfaceText(element);
    if (textMatchesRenderedHost(currentText, previousText)) return true;
    const addedText = normalizedRenderedHostText(Array.from(addedNodes, node => node.textContent ?? '').join(''));
    return textMatchesRenderedHost(addedText, previousText);
}

function textMatchesRenderedHost(candidate: string, previousText: string): boolean {
    return Boolean(candidate && previousText && (candidate.includes(previousText) || previousText.includes(candidate)));
}

function normalizedRenderedHostText(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, RENDERED_SCAN_HOST_MAX_TEXT);
}

function normalizedRenderedHostSurfaceText(element: Element): string {
    return normalizedRenderedHostText(readerWordSurfaceText(element) || element.textContent || '');
}

function nodesContainReaderWord(nodes: NodeList | Node[]): boolean {
    return Array.from(nodes).some(nodeContainsReaderWord);
}

function nodeContainsReaderWord(node: Node): boolean {
    if (node instanceof Element) {
        return node.matches(READER_WORD_SELECTOR) || Boolean(node.querySelector(READER_WORD_SELECTOR));
    }
    if (node instanceof DocumentFragment) return Boolean(node.querySelector(READER_WORD_SELECTOR));
    return false;
}

function mutationTouchesReaderWordContent(mutation: MutationRecord): boolean {
    const target = mutationTargetElement(mutation.target);
    return Boolean(target?.closest(READER_WORD_SELECTOR))
        || nodesContainReaderWordMarkup(mutation.removedNodes)
        || nodesContainReaderWordMarkup(mutation.addedNodes);
}

function nodesContainReaderWordMarkup(nodes: NodeList | Node[]): boolean {
    return Array.from(nodes).some(nodeContainsReaderWordMarkup);
}

function nodeContainsReaderWordMarkup(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) return true;
    if (!(node instanceof Element || node instanceof DocumentFragment)) return false;
    const root = node as Element | DocumentFragment;
    return Boolean(root instanceof Element && root.matches('.jpdb-reader-ruby-base,.jpdb-reader-furi,ruby,rt,rp'))
        || Boolean(root.querySelector?.('.jpdb-reader-ruby-base,.jpdb-reader-furi,ruby,rt,rp'));
}

function renderedHostContainsDamagedReaderWord(host: HTMLElement): boolean {
    return Array.from(host.querySelectorAll<HTMLElement>(READER_WORD_SELECTOR)).some(renderedWordLooksDamaged);
}

function renderedWordLooksDamaged(word: HTMLElement): boolean {
    if (!word.classList.contains('jpdb-reader-has-furi')) return false;
    const expected = normalizedRenderedHostText(word.dataset.surface ?? '');
    const surface = normalizedRenderedHostText(readerWordDomSurfaceText(word));
    if (expected && !textMatchesRenderedHost(surface, expected)) return true;
    const hasFuri = Boolean(word.querySelector('.jpdb-reader-furi,rt'));
    const hasBase = Boolean(word.querySelector('.jpdb-reader-ruby-base,rb'));
    return hasFuri && (!hasBase || !surface);
}

function readerWordDomSurfaceText(element: Element): string {
    let text = '';
    element.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent ?? '';
            return;
        }
        if (!(node instanceof Element) || node.matches('rt,rp')) return;
        text += readerWordDomSurfaceText(node);
    });
    return text;
}

function mutationTargetElement(target: Node): Element | null {
    if (target.nodeType === Node.ELEMENT_NODE) return target as Element;
    return target.parentElement;
}

function applyTokensToFragmentTarget(target: FragmentTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (!hasFragmentTokenWork(target, tokens)) return;

    const safeTokens = nonOverlappingTokens(tokens, target.text);
    if (!safeTokens.length) return;

    const sentence = target.text.replace(/\s+/g, ' ').trim();
    // furigana-mode=all may force readings back onto CONTENT whose collector
    // suppressed them, but never onto a sealed explicit-control target.
    // NOTE (deferred): unlike the single-node path, fragment renders do not
    // yet consult the clip-constrained-row fact in place — closing that here
    // flips several owner-pinned compact-content behaviors (breadcrumbs,
    // footer links, media-card titles keep in-flow furigana today) and needs
    // an owner call on mirror-vs-suppress for non-bare fragile content.
    const renderTarget = target.decoration === 'interactive-passive' && interactivePassiveControl(target.parent)
        ? { ...target, suppressRuby: true }
        : (targetForcesAllFurigana(target.parent) ? { ...target, suppressRuby: false } : target);
    // Class Q for the in-place fragment channel: readings stay in the DOM
    // (owner-pinned compact-content behaviors keep their annotations) but the
    // clip row is stamped so CSS hides rt at rest — in-place ruby in a
    // clipped/clamped row otherwise paints outside the row bounds on live
    // pages (tenki/bookwalker/amazon sweep regressions).
    // Semantic prose rows that can grow in flow stamp "content" instead —
    // their readings stay visible at rest by default, re-hidden only under the
    // opt-in hover-only root mode. Search cards/headings remain "true" and CSS
    // removes their rt from in-place layout while retaining word lookup.
    // The stamp applies to BOTH channels: detached (suppressRuby) readings are
    // absolutely positioned with width:max-content and SPILL a closed clip box
    // horizontally — the spill raises the row's scrollWidth and iOS applies
    // the row's own text-overflow to the native base (共有 → 共… on the m.youtube
    // Shorts action rail). Stamping lets the rest-hide rule keep readings out
    // of any clip the safe-open pass cannot verify, so the two channels never
    // disagree on a row.
    {
        const clipRow = closestRubyFragileConstrainedRow(target.parent);
        if (clipRow) {
            // "content" covers both rest-visible channels: the single-line
            // prose detached lane, and growable multi-line clamp rows that
            // keep in-flow rt (owner rule 2026-07-19).
            clipRow.dataset.yomuClipConstrained = contentClipRowShowsRestReadings(renderTarget.decoration, clipRow)
                    || clampRowKeepsInFlowRestRuby(renderTarget.decoration, clipRow)
                ? 'content'
                : 'true';
        }
    }
    applyTokensToIndexedFragmentTarget(renderTarget, safeTokens, furiganaSettingsForTarget(settings, target.parent), sentence);
    styleDetachedReadingElements(target.parent, target.parent);
    stabilizeDetachedReadings(target.parent, closestRubyFragileConstrainedRow(target.parent));
    markRenderedScanTarget(target);
}

function hasFragmentTokenWork(target: FragmentTextTarget, tokens: JPDBToken[]): boolean {
    return Boolean(tokens.length && target.fragments.length);
}

function applyTokensToIndexedFragmentTarget(target: FragmentTextTarget, tokens: JPDBToken[], settings: ReaderSettings, sentence: string): void {
    const indexedFragments = indexTextFragments(target.fragments);
    const tokensWithSentence = tokens.map(token => tokenWithReadableSentence(token, target.text, token.sentence ?? sentence));
    const miningInsightKeys = miningInsightTokenKeys(tokensWithSentence);
    const singleFragmentPlans = singleFragmentTokenPlans(target, indexedFragments, tokens, tokensWithSentence);
    if (singleFragmentPlans.length === tokens.length) {
        const grouped = groupSingleFragmentTokenPlans(singleFragmentPlans);
        for (const group of grouped) replaceSingleFragmentTokenNode(target, group.fragment, group.plans, settings, miningInsightKeys);
        return;
    }
    for (let index = tokens.length - 1; index >= 0; index--) {
        applyTokenToIndexedFragments(target, indexedFragments, tokens[index], tokensWithSentence[index] ?? tokens[index], settings, miningInsightKeys);
    }
}

interface SingleFragmentTokenPlan {
    fragment: IndexedTextFragment;
    localStart: number;
    localEnd: number;
    token: JPDBToken;
    tokenWithSentence: JPDBToken;
    passiveInteraction: boolean;
}

function singleFragmentTokenPlans(
    target: FragmentTextTarget,
    indexedFragments: IndexedTextFragment[],
    tokens: JPDBToken[],
    tokensWithSentence: JPDBToken[],
): SingleFragmentTokenPlan[] {
    const plans: SingleFragmentTokenPlan[] = [];
    for (const [index, token] of tokens.entries()) {
        const start = findFragmentBoundary(indexedFragments, token.start, 'start');
        const end = findFragmentBoundary(indexedFragments, token.end, 'end');
        const bounds = attachableFragmentRange(start, end);
        if (!bounds || bounds.start.fragment !== bounds.end.fragment) continue;
        plans.push({
            fragment: bounds.start.fragment,
            localStart: bounds.start.localOffset,
            localEnd: bounds.end.localOffset,
            token,
            tokenWithSentence: tokensWithSentence[index] ?? token,
            passiveInteraction: target.passiveInteraction === true
                || fragmentRangeHasPassiveInteraction(indexedFragments, token.start, token.end),
        });
    }
    return plans;
}

function groupSingleFragmentTokenPlans(plans: SingleFragmentTokenPlan[]): { fragment: IndexedTextFragment; plans: SingleFragmentTokenPlan[] }[] {
    const groups: { fragment: IndexedTextFragment; plans: SingleFragmentTokenPlan[] }[] = [];
    for (const plan of plans) {
        let group = groups.find(candidate => candidate.fragment === plan.fragment);
        if (!group) {
            group = { fragment: plan.fragment, plans: [] };
            groups.push(group);
        }
        group.plans.push(plan);
    }
    groups.forEach(group => group.plans.sort((a, b) => a.localStart - b.localStart));
    return groups.sort((a, b) => b.fragment.globalStart - a.fragment.globalStart);
}

function replaceSingleFragmentTokenNode(
    target: FragmentTextTarget,
    fragment: IndexedTextFragment,
    plans: SingleFragmentTokenPlan[],
    settings: ReaderSettings,
    miningInsightKeys: ReadonlySet<string>,
): void {
    if (!fragment.node.parentNode || !plans.length) return;
    const replacement = document.createDocumentFragment();
    const text = fragment.node.data;
    let offset = fragment.start;
    for (const plan of plans) {
        appendPlainTextBeforeToken(replacement, text, offset, plan.localStart, true);
        replacement.append(renderSingleFragmentToken(target, fragment, plan, settings, miningInsightKeys));
        offset = plan.localEnd;
    }
    appendPlainTextBeforeToken(replacement, text, offset, fragment.end);
    replaceTextNodeRange(fragment.node, fragment.start, fragment.end, wrapDirectFlexGridTextRun(replacement, fragment.node.parentElement));
}

// A raw text child of a flex/grid host is ONE anonymous item; tokenizing it into N spans
// would create N items and reflow the track. The bare wrapper collapses them back to one
// item for every render path (incl. passive/suppressed chrome) — do not gate or remove it.
function wrapDirectFlexGridTextRun(replacement: DocumentFragment, parent: HTMLElement | null): DocumentFragment {
    const display = parent ? safeComputedStyle(parent).display : '';
    if (!display.includes('flex') && !display.includes('grid')) return replacement;
    const fragment = document.createDocumentFragment();
    const run = document.createElement('span');
    run.append(replacement);
    fragment.append(run);
    return fragment;
}

function renderSingleFragmentToken(
    target: FragmentTextTarget,
    fragment: TextFragment,
    plan: SingleFragmentTokenPlan,
    settings: ReaderSettings,
    miningInsightKeys: ReadonlySet<string>,
): HTMLElement {
    const allowRuby = scanFragmentAllowsRuby(fragment.hasNativeRuby);
    return renderToken(fragment.node.data.slice(plan.localStart, plan.localEnd), plan.tokenWithSentence, settings, {
        allowRuby,
        detachedReadings: targetUsesDetachedReadings(target),
        kanjiNavigation: kanjiNavigationForElement(target.parent),
        scanWord: true,
        proseWrap: target.proseWrap === true,
        passiveInteraction: plan.passiveInteraction,
        preserveTokenRubies: true,
        miningInsightKeys,
    });
}

function applyTokenToIndexedFragments(
    target: FragmentTextTarget,
    indexedFragments: IndexedTextFragment[],
    token: JPDBToken,
    tokenWithSentence: JPDBToken,
    settings: ReaderSettings,
    miningInsightKeys: ReadonlySet<string>,
): void {
    const start = findFragmentBoundary(indexedFragments, token.start, 'start');
    const end = findFragmentBoundary(indexedFragments, token.end, 'end');
    const bounds = attachableFragmentRange(start, end);
    if (!bounds) return;

    const isSingleFragment = bounds.start.fragment === bounds.end.fragment;
    const passiveInteraction = target.passiveInteraction === true
        || fragmentRangeHasPassiveInteraction(indexedFragments, token.start, token.end);
    if (isSingleFragment) {
        insertSingleFragmentToken(
            target,
            bounds.start.fragment,
            bounds.start.localOffset,
            bounds.end.localOffset,
            token,
            tokenWithSentence,
            settings,
            miningInsightKeys,
            passiveInteraction,
        );
        return;
    }

    if (fragmentRangeHasNativeRuby(indexedFragments, token.start, token.end)) {
        const nativeRubyRange = nativeRubyPreservingTokenRange(indexedFragments, bounds, token.start, token.end);
        if (nativeRubyRange) {
            insertMultiFragmentToken(nativeRubyRange, target.text.slice(token.start, token.end), tokenWithSentence, settings, {
                scanWord: true,
                proseWrap: target.proseWrap === true,
                passiveInteraction,
                allowRuby: false,
                preserveTokenRubies: true,
                miningInsightKeys,
            });
            nativeRubyRange.detach();
            return;
        }
        insertSplitFragmentTokenPieces(
            target,
            splitFragmentTokenPieces(indexedFragments, token.start, token.end),
            token,
            tokenWithSentence,
            settings,
            passiveInteraction,
            miningInsightKeys,
        );
        return;
    }

    const pieces = splitFragmentTokenPieces(indexedFragments, token.start, token.end);
    if (shouldSplitFragmentTokenPieces(pieces)) {
        insertSplitFragmentTokenPieces(target, pieces, token, tokenWithSentence, settings, passiveInteraction, miningInsightKeys);
        return;
    }

    const range = document.createRange();
    range.setStart(bounds.start.fragment.node, bounds.start.localOffset);
    range.setEnd(bounds.end.fragment.node, bounds.end.localOffset);
    insertMultiFragmentToken(range, target.text.slice(token.start, token.end), tokenWithSentence, settings, {
        scanWord: true,
        proseWrap: target.proseWrap === true,
        passiveInteraction,
        allowRuby: true,
        detachedReadings: targetUsesDetachedReadings(target),
        preserveTokenRubies: true,
        miningInsightKeys,
    });
    range.detach();
}

function insertSplitFragmentTokenPieces(
    target: FragmentTextTarget,
    pieces: SplitFragmentTokenPiece[],
    token: JPDBToken,
    tokenWithSentence: JPDBToken,
    settings: ReaderSettings,
    passiveInteraction: boolean,
    miningInsightKeys: ReadonlySet<string>,
): void {
    for (const piece of [...pieces].reverse()) {
        const surface = piece.fragment.node.data.slice(piece.start, piece.end);
        if (!surface) continue;
        const pieceToken = splitFragmentPieceToken(piece, token, tokenWithSentence);
        const rendered = renderToken(surface, pieceToken, settings, {
            allowRuby: scanFragmentAllowsRuby(piece.fragment.hasNativeRuby),
            detachedReadings: targetUsesDetachedReadings(target),
            kanjiNavigation: kanjiNavigationForElement(target.parent),
            scanWord: true,
            proseWrap: target.proseWrap === true,
            passiveInteraction,
            preserveTokenRubies: true,
            miningInsightKeys,
        });
        replaceTextNodeRange(piece.fragment.node, piece.start, piece.end, rendered);
    }
}

type SplitFragmentTokenPiece = { fragment: IndexedTextFragment; start: number; end: number };

function splitFragmentTokenPieces(
    indexedFragments: IndexedTextFragment[],
    tokenStart: number,
    tokenEnd: number,
): SplitFragmentTokenPiece[] {
    return indexedFragments
        .map(fragment => splitFragmentTokenPiece(fragment, tokenStart, tokenEnd))
        .filter((piece): piece is SplitFragmentTokenPiece => piece !== null);
}

function shouldSplitFragmentTokenPieces(pieces: SplitFragmentTokenPiece[]): boolean {
    for (let index = 1; index < pieces.length; index++) {
        if (!fragmentsShareInlineFlow(pieces[index - 1].fragment, pieces[index].fragment)) return true;
    }
    return false;
}

function fragmentsShareInlineFlow(previous: IndexedTextFragment, next: IndexedTextFragment): boolean {
    const common = commonElementAncestor(previous.node, next.node);
    if (!common) return false;
    const previousBoundary = childUnderAncestor(previous.node, common);
    const nextBoundary = childUnderAncestor(next.node, common);
    if (!previousBoundary || !nextBoundary || previousBoundary === nextBoundary) return true;
    if (flowBoundaryNodeBreaksInline(previousBoundary) || flowBoundaryNodeBreaksInline(nextBoundary)) return false;
    return !hasInlineFlowBreakBetween(common, previousBoundary, nextBoundary);
}

function commonElementAncestor(first: Node, second: Node): Element | null {
    const firstAncestors = new Set<Element>();
    for (let current = parentElementOf(first); current; current = current.parentElement) firstAncestors.add(current);
    for (let current = parentElementOf(second); current; current = current.parentElement) {
        if (firstAncestors.has(current)) return current;
    }
    return null;
}

function parentElementOf(node: Node): Element | null {
    return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
}

function childUnderAncestor(node: Node, ancestor: Element): Node | null {
    let current: Node | null = node;
    while (current && current.parentNode !== ancestor) current = current.parentNode;
    return current;
}

function flowBoundaryNodeBreaksInline(node: Node): boolean {
    if (!(node instanceof HTMLElement)) return false;
    if (node.tagName === 'BR') return true;
    return BLOCK_FLOW_TAG_NAMES.has(node.tagName);
}

function hasInlineFlowBreakBetween(parent: Element, first: Node, second: Node): boolean {
    let seenFirst = false;
    for (let current: Node | null = parent.firstChild; current; current = current.nextSibling) {
        if (current === first) {
            seenFirst = true;
            continue;
        }
        if (current === second) return false;
        if (seenFirst && flowBoundaryNodeBreaksInline(current)) return true;
    }
    return false;
}

function splitFragmentPieceToken(
    piece: SplitFragmentTokenPiece,
    token: JPDBToken,
    tokenWithSentence: JPDBToken,
): JPDBToken {
    const globalStart = piece.fragment.globalStart + piece.start - piece.fragment.start;
    const globalEnd = piece.fragment.globalStart + piece.end - piece.fragment.start;
    const rubies = tokenWithSentence.rubies.filter(ruby => ruby.start >= globalStart && ruby.end <= globalEnd);
    return {
        ...tokenWithSentence,
        start: globalStart,
        end: globalEnd,
        length: globalEnd - globalStart,
        rubies,
        sentence: tokenWithSentence.sentence ?? token.sentence,
    };
}

function splitFragmentTokenPiece(
    fragment: IndexedTextFragment,
    tokenStart: number,
    tokenEnd: number,
): { fragment: IndexedTextFragment; start: number; end: number } | null {
    const start = Math.max(tokenStart, fragment.globalStart);
    const end = Math.min(tokenEnd, fragment.globalEnd);
    if (end <= start) return null;
    return {
        fragment,
        start: fragment.start + start - fragment.globalStart,
        end: fragment.start + end - fragment.globalStart,
    };
}

function fragmentRangeHasPassiveInteraction(fragments: IndexedTextFragment[], start: number, end: number): boolean {
    return fragments.some(fragment => fragment.passiveInteraction === true
        && fragment.globalStart < end
        && fragment.globalEnd > start);
}

function fragmentRangeHasNativeRuby(fragments: IndexedTextFragment[], start: number, end: number): boolean {
    return fragments.some(fragment => fragment.hasNativeRuby
        && fragment.globalStart < end
        && fragment.globalEnd > start);
}

function nativeRubyPreservingTokenRange(
    fragments: IndexedTextFragment[],
    bounds: { start: FragmentBoundaryMatch; end: FragmentBoundaryMatch },
    tokenStart: number,
    tokenEnd: number,
): Range | null {
    const rubies = fullyCoveredNativeRubies(fragments, tokenStart, tokenEnd);
    if (!rubies.size) return null;

    const range = document.createRange();
    setNativeRubyPreservingRangeStart(range, bounds.start, rubies);
    setNativeRubyPreservingRangeEnd(range, bounds.end, rubies);
    return range;
}

function fullyCoveredNativeRubies(fragments: IndexedTextFragment[], start: number, end: number): Set<HTMLElement> {
    const rubies = new Set<HTMLElement>();
    for (const fragment of fragments) {
        if (!fragment.hasNativeRuby || fragment.globalStart >= end || fragment.globalEnd <= start) continue;
        const ruby = closestFragmentRuby(fragment);
        if (!ruby) return new Set();
        const span = nativeRubyBaseSpan(fragments, ruby);
        if (!span || start > span.start || end < span.end) return new Set();
        rubies.add(ruby);
    }
    return rubies;
}

function nativeRubyBaseSpan(fragments: IndexedTextFragment[], ruby: HTMLElement): { start: number; end: number } | null {
    const rubyFragments = fragments.filter(fragment => closestFragmentRuby(fragment) === ruby);
    if (!rubyFragments.length) return null;
    return {
        start: Math.min(...rubyFragments.map(fragment => fragment.globalStart)),
        end: Math.max(...rubyFragments.map(fragment => fragment.globalEnd)),
    };
}

function setNativeRubyPreservingRangeStart(
    range: Range,
    boundary: FragmentBoundaryMatch,
    rubies: ReadonlySet<HTMLElement>,
): void {
    const ruby = closestFragmentRuby(boundary.fragment);
    if (ruby && rubies.has(ruby)) {
        range.setStartBefore(ruby);
        return;
    }
    range.setStart(boundary.fragment.node, boundary.localOffset);
}

function setNativeRubyPreservingRangeEnd(
    range: Range,
    boundary: FragmentBoundaryMatch,
    rubies: ReadonlySet<HTMLElement>,
): void {
    const ruby = closestFragmentRuby(boundary.fragment);
    if (ruby && rubies.has(ruby)) {
        range.setEndAfter(ruby);
        return;
    }
    range.setEnd(boundary.fragment.node, boundary.localOffset);
}

function closestFragmentRuby(fragment: TextFragment): HTMLElement | null {
    return fragment.node.parentElement?.closest<HTMLElement>('ruby') ?? null;
}

interface FragmentBoundaryMatch {
    fragment: IndexedTextFragment;
    localOffset: number;
}

function attachableFragmentRange(
    start: { fragment: IndexedTextFragment; localOffset: number } | null,
    end: { fragment: IndexedTextFragment; localOffset: number } | null,
): { start: FragmentBoundaryMatch; end: FragmentBoundaryMatch } | null {
    const attachedStart = attachedFragmentBoundary(start);
    const attachedEnd = attachedFragmentBoundary(end);
    if (!attachedStart || !attachedEnd) return null;
    return { start: attachedStart, end: attachedEnd };
}

function attachedFragmentBoundary(boundary: FragmentBoundaryMatch | null): FragmentBoundaryMatch | null {
    if (!boundary) return null;
    if (!boundary.fragment.node.parentElement) return null;
    return boundary;
}

function insertSingleFragmentToken(
    target: FragmentTextTarget,
    fragment: TextFragment,
    start: number,
    end: number,
    token: JPDBToken,
    tokenWithSentence: JPDBToken,
    settings: ReaderSettings,
    miningInsightKeys: ReadonlySet<string>,
    passiveInteraction: boolean,
): void {
    const allowRuby = scanFragmentAllowsRuby(fragment.hasNativeRuby);
    const surface = fragment.node.data.slice(start, end);
    const rendered = renderToken(surface || target.text.slice(token.start, token.end), tokenWithSentence, settings, {
        allowRuby,
        detachedReadings: targetUsesDetachedReadings(target),
        kanjiNavigation: kanjiNavigationForElement(target.parent),
        scanWord: true,
        proseWrap: target.proseWrap === true,
        passiveInteraction,
        preserveTokenRubies: true,
        miningInsightKeys,
    });
    replaceTextNodeRange(fragment.node, start, end, rendered);
}

function scanFragmentAllowsRuby(hasNativeRuby: boolean): boolean {
    return !hasNativeRuby;
}

function targetUsesDetachedReadings(target: FragmentTextTarget): boolean {
    // Provider example rows are owned, expandable prose. They are initially
    // rendered inside a closed <details> with overflow:hidden; treating that
    // temporary collapsed container as a permanently clipped host turns the
    // target reading into a hidden detached overlay. Keep normal in-flow ruby
    // here so Bunpro, Jiten, and JPDB examples all reveal Yomu annotations
    // when the shared example group opens.
    if (isInsideOwnedReaderRoot(target.parent)
        && target.parent.closest('[data-provider-example-sentence]')) return Boolean(target.suppressRuby);
    if (target.suppressRuby) return true;
    const clipRow = closestRubyFragileConstrainedRow(target.parent);
    if (!clipRow) return false;
    // Growable multi-line clamp content rows keep IN-FLOW ruby (owner rule
    // 2026-07-19): their line boxes absorb the readings, so the detached
    // rest-hidden lane would needlessly blank furigana at rest.
    return !clampRowKeepsInFlowRestRuby(target.decoration ?? decorationStateForWord(target.parent) ?? undefined, clipRow);
}

// The policy predicate plus the measured engine verdict: a row the heal has
// marked growth-failed never re-enters the in-flow channel, no matter how
// often re-applies recompute the stamp.
function clampRowKeepsInFlowRestRuby(decoration: DecorationState | undefined, clipRow: HTMLElement): boolean {
    return !clampRowGrowthFailed(clipRow) && clampRowAllowsInFlowRestRuby(decoration, clipRow);
}

function isInsideOwnedReaderRoot(element: Element): boolean {
    const readerRoot = element.closest(READER_ROOT_SELECTOR);
    return Boolean(readerRoot && readerRoot !== document.body && readerRoot !== document.documentElement);
}

function replaceTextNodeRange(node: Text, start: number, end: number, replacement: Node): void {
    if (!node.parentNode || end <= start || start < 0 || end > node.data.length) return;
    // Track the plain gap text nodes this fragment paint inserts (word-span text is
    // skipped by the closest-word check), so the framework-duplicate cleanup can drop
    // them by ownership. Registration happens BEFORE insertion, while a replacement
    // DocumentFragment still holds its children.
    registerDestructivePaintTextNodes(replacement);
    const after = node.splitText(end);
    const selected = node.splitText(start);
    selected.replaceWith(replacement);
    if (!node.data) node.remove();
    if (!after.data) after.remove();
}

function insertMultiFragmentToken(range: Range, surface: string, token: JPDBToken, settings: ReaderSettings, options: TokenRenderOptions = {}): void {
    if (shouldRenderRuby(surface, token, settings, options.allowRuby, options.preserveTokenRubies)) {
        range.deleteContents();
        range.insertNode(renderToken(surface, token, settings, options));
        return;
    }
    const shell = renderTokenShell(token, options);
    shell.append(range.extractContents());
    range.insertNode(shell);
}

function tokenWithReadableSentence(token: JPDBToken, text: string, fallback?: string): JPDBToken {
    const sentence = sentenceAroundRange(text, token.start, token.end, fallback) || fallback || token.sentence;
    return sentence === token.sentence ? token : { ...token, sentence };
}

type IndexedTextFragment = TextFragment & {
    globalStart: number;
    globalEnd: number;
};

function indexTextFragments(fragments: TextFragment[]): IndexedTextFragment[] {
    let globalOffset = 0;
    return fragments.map(fragment => {
        const length = fragment.end - fragment.start;
        const indexed = {
            ...fragment,
            globalStart: globalOffset,
            globalEnd: globalOffset + length,
        };
        globalOffset += length;
        return indexed;
    });
}

function findFragmentBoundary(
    fragments: IndexedTextFragment[],
    offset: number,
    side: 'start' | 'end',
): { fragment: IndexedTextFragment; localOffset: number } | null {
    for (const fragment of fragments) {
        if (fragmentContainsBoundary(fragment, offset, side)) return fragmentBoundary(fragment, offset);
    }
    return edgeFragmentBoundary(fragments, offset, side);
}

function fragmentContainsBoundary(fragment: IndexedTextFragment, offset: number, side: 'start' | 'end'): boolean {
    return side === 'start'
        ? offset >= fragment.globalStart && offset < fragment.globalEnd
        : offset > fragment.globalStart && offset <= fragment.globalEnd;
}

function fragmentBoundary(fragment: IndexedTextFragment, offset: number): { fragment: IndexedTextFragment; localOffset: number } {
    return {
        fragment,
        localOffset: fragment.start + offset - fragment.globalStart,
    };
}

function edgeFragmentBoundary(
    fragments: IndexedTextFragment[],
    offset: number,
    side: 'start' | 'end',
): { fragment: IndexedTextFragment; localOffset: number } | null {
    return side === 'start'
        ? trailingEdgeFragmentBoundary(fragments, offset)
        : leadingEdgeFragmentBoundary(fragments, offset);
}

function trailingEdgeFragmentBoundary(fragments: IndexedTextFragment[], offset: number): { fragment: IndexedTextFragment; localOffset: number } | null {
    const fragment = fragments[fragments.length - 1];
    return fragment && offset === fragment.globalEnd ? { fragment, localOffset: fragment.end } : null;
}

function leadingEdgeFragmentBoundary(fragments: IndexedTextFragment[], offset: number): { fragment: IndexedTextFragment; localOffset: number } | null {
    const fragment = fragments[0];
    return fragment && offset === fragment.globalStart ? { fragment, localOffset: fragment.start } : null;
}

export function renderTokensToHtml(text: string, tokens: JPDBToken[], settings: ReaderSettings): string {
    let html = '';
    let offset = 0;
    const safeTokens = nonOverlappingTokens(tokens, text);
    const miningInsightKeys = miningInsightTokenKeys(safeTokens);
    for (const token of safeTokens) {
        if (token.start > offset) html += plainTextBeforeTokenHtml(text.slice(offset, token.start));
        html += renderTokenHtml(text.slice(token.start, token.end), token, settings, miningInsightKeys);
        offset = token.end;
    }
    if (offset < text.length) html += escapeHtml(text.slice(offset));
    return html;
}

// Mirror appendPlainTextBeforeToken for the HTML render path: wrap a trailing
// number so the CSS ::after WORD JOINER keeps it from wrapping off its counter.
function plainTextBeforeTokenHtml(gap: string): string {
    const digits = TRAILING_DIGITS_RE.exec(gap)?.[0];
    if (!digits) return escapeHtml(gap);
    const prefix = gap.slice(0, gap.length - digits.length);
    return `${escapeHtml(prefix)}<span class="${NUMBER_BIND_CLASS}">${escapeHtml(digits)}</span>`;
}

function renderToken(
    surface: string,
    token: JPDBToken,
    settings: ReaderSettings,
    options: TokenRenderOptions = {},
): HTMLElement {
    const span = createReaderWordSpan(token, { ...options, showPitchAccent: settings.showPitchAccent });
    span.dataset.surface = surface;
    // Detached is a render-channel decision, not proof that a reading was
    // available synchronously. Preserve it on fallback words so a later
    // public-vocabulary reading cannot silently switch the word to native
    // ruby and perturb a compact authored line box.
    if (options.detachedReadings) span.classList.add('jpdb-reader-detached-reading-word');
    if (!options.kanjiNavigation?.enabled && options.passiveInteraction !== true) span.tabIndex = -1;

    const allowRuby = options.allowRuby !== false && !shouldSuppressLongProseRuby(surface, token, options);
    const hasRuby = shouldRenderRuby(surface, token, settings, allowRuby, options.preserveTokenRubies);
    if (hasRuby) {
        span.classList.add('jpdb-reader-has-furi');
        if (options.detachedReadings) {
            setInnerHtml(span, renderDetachedReadings(surface, token, options.kanjiNavigation, options.preserveTokenRubies));
        } else {
            setInnerHtml(span, renderRuby(surface, token, options.kanjiNavigation, options.preserveTokenRubies));
        }
    } else if (options.kanjiNavigation?.enabled) {
        setInnerHtml(span, renderKanjiNavigationText(surface, options.kanjiNavigation));
    } else {
        span.textContent = surface;
    }
    return span;
}

function shouldSuppressLongProseRuby(surface: string, token: JPDBToken, options: TokenRenderOptions): boolean {
    if (!options.scanWord || !options.proseWrap || options.passiveInteraction) return false;
    if (surface.length <= 16) return false;
    const rubyLength = effectiveTokenRubies(surface, token, options.preserveTokenRubies)
        .reduce((total, ruby) => total + ruby.text.length, 0);
    return rubyLength > 20 || /[A-Za-z0-9]/.test(surface);
}

function renderTokenShell(token: JPDBToken, options: TokenRenderOptions = {}): HTMLElement {
    const span = createReaderWordSpan(token, options);
    if (options.passiveInteraction !== true) span.tabIndex = -1;
    return span;
}

// Builds the bare reader-word <span> (class + identity/pitch/sentence dataset) shared by every token renderer.
// Callers add the tabindex and content afterward, since those vary by render mode.
function createReaderWordSpan(token: JPDBToken, options: TokenRenderOptions): HTMLElement {
    const span = document.createElement('span');
    const state = primaryCardState(token.card.cardState);
    const showPitchAccent = options.showPitchAccent !== false;
    span.className = readerWordClassName(state, token, { showPitchAccent });
    span.dataset.vid = String(token.card.vid);
    span.dataset.sid = String(token.card.sid);
    span.dataset.cardSource = readerCardSource(token.card);
    span.dataset.cardId = String(readerCardId(token.card));
    span.dataset.readingIndex = String(readerReadingIndex(token.card));
    span.dataset.cardState = state;
    span.dataset.stateProvenance = cardStateProvenance(token.card);
    if (showPitchAccent) span.dataset.pitchClass = tokenPitchClass(token);
    span.dataset.tokenStart = String(token.start);
    span.dataset.tokenEnd = String(token.end);
    span.dataset.sentence = token.sentence ?? '';
    if (token.card.spelling) span.dataset.expression = token.card.spelling;
    if (token.card.reading) span.dataset.reading = token.card.reading;
    const pitchAccent = token.card.pitchAccent.join('|');
    if (showPitchAccent && pitchAccent && !isParticleCard(token.card)) span.dataset.pitchAccent = pitchAccent;
    if (showPitchAccent) applyPitchComponentGradient(span, token.card);
    applyDeckMembershipDataset(span, token.card);
    applyTokenRenderOptions(span, token, options);
    return span;
}

function applyDeckMembershipDataset(span: HTMLElement, card: JPDBCard): void {
    const membership = cardDeckMembership(card);
    if (!membership.member) return;
    span.dataset.deckMember = 'true';
    span.dataset.deckSource = membership.source;
    if (membership.names.length) span.dataset.deckNames = membership.names.join(', ');
}

function applyTokenRenderOptions(span: HTMLElement, token: JPDBToken, options: TokenRenderOptions): void {
    if (options.scanWord) {
        span.classList.add('jpdb-reader-scan-word');
        if (!options.proseWrap) span.style.setProperty('display', 'inline', 'important');
    }
    if (options.proseWrap && !options.passiveInteraction) {
        span.classList.add('jpdb-reader-prose-word');
        span.dataset.jpdbReaderProse = 'true';
    }
    if (options.miningInsightKeys?.has(miningInsightTokenKey(token))) {
        span.classList.add('jpdb-reader-i-plus-one');
        span.dataset.miningInsight = 'i-plus-one';
    }
    if (options.passiveInteraction) {
        span.classList.add('jpdb-reader-passive-word');
        span.dataset.jpdbReaderPassive = 'true';
    }
}

function renderTokenHtml(surface: string, token: JPDBToken, settings: ReaderSettings, miningInsightKeys: ReadonlySet<string>): string {
    const state = primaryCardState(token.card.cardState);
    const hasRuby = shouldRenderRuby(surface, token, settings);
    const content = hasRuby ? renderRuby(surface, token) : escapeHtml(surface);
    const hasMiningInsight = miningInsightKeys.has(miningInsightTokenKey(token));
    const pitchClass = settings.showPitchAccent ? tokenPitchClass(token) : '';
    const classes = [
        readerWordClassName(state, token, settings),
        hasRuby ? 'jpdb-reader-has-furi' : '',
        hasMiningInsight ? 'jpdb-reader-i-plus-one' : '',
    ].filter(Boolean).join(' ');
    const source = ` data-card-source="${escapeHtml(readerCardSource(token.card))}"`;
    const cardId = ` data-card-id="${readerCardId(token.card)}"`;
    const readingIndex = ` data-reading-index="${readerReadingIndex(token.card)}"`;
    const cardState = ` data-card-state="${escapeHtml(state)}" data-state-provenance="${cardStateProvenance(token.card)}"`;
    const tokenRange = ` data-token-start="${token.start}" data-token-end="${token.end}"`;
    const surfaceAttr = ` data-surface="${escapeHtml(surface)}"`;
    const miningInsight = hasMiningInsight ? ' data-mining-insight="i-plus-one"' : '';
    const expression = token.card.spelling ? ` data-expression="${escapeHtml(token.card.spelling)}"` : '';
    const reading = token.card.reading ? ` data-reading="${escapeHtml(token.card.reading)}"` : '';
    const pitchAccent = token.card.pitchAccent.join('|');
    const pitchClassAttr = pitchClass ? ` data-pitch-class="${pitchClass}"` : '';
    const lookupMetadata = settings.showPitchAccent && pitchAccent && pitchClass !== 'particle' ? ` data-pitch-accent="${escapeHtml(pitchAccent)}"` : '';
    const pitchComponentGradient = settings.showPitchAccent ? pitchComponentUnderlineGradient(token.card) : '';
    const pitchComponentMetadata = pitchComponentGradient
        ? ` data-pitch-components="true" style="--jpdb-reader-inline-pitch-gradient:${escapeHtml(pitchComponentGradient)}"`
        : '';
    const deck = renderDeckMembershipAttributes(token.card);
    return `<span class="${classes}" data-vid="${token.card.vid}" data-sid="${token.card.sid}"${source}${cardId}${readingIndex}${cardState}${tokenRange}${surfaceAttr}${pitchClassAttr}${pitchComponentMetadata} data-sentence="${escapeHtml(token.sentence ?? '')}"${miningInsight}${expression}${reading}${lookupMetadata}${deck} tabindex="-1">${content}</span>`;
}

function applyPitchComponentGradient(word: HTMLElement, card: JPDBCard): void {
    const gradient = pitchComponentUnderlineGradient(card);
    if (!gradient) return;
    word.dataset.pitchComponents = 'true';
    word.style.setProperty('--jpdb-reader-inline-pitch-gradient', gradient);
}

function renderDeckMembershipAttributes(card: JPDBCard): string {
    const membership = cardDeckMembership(card);
    if (!membership.member) return '';
    const deckNames = membership.names.length ? ` data-deck-names="${escapeHtml(membership.names.join(', '))}"` : '';
    return ` data-deck-member="true" data-deck-source="${escapeHtml(membership.source)}"${deckNames}`;
}

/**
 * Replace a rendered word's reading without changing the layout channel that
 * owns it. Async public-vocabulary enrichment is deliberately routed through
 * this DOM operation so native/detached policy, open-shadow inline geometry,
 * clip handling and source projection stay encapsulated in the renderer.
 */
export function replaceRenderedWordFurigana(word: HTMLElement, surface: string, token: JPDBToken): boolean {
    const mirror = word.closest<HTMLElement>(READER_TEXT_MIRROR_SELECTOR);
    const detached = Boolean(mirror) || word.classList.contains('jpdb-reader-detached-reading-word');
    const html = detached ? renderDetachedReadings(surface, token) : renderRuby(surface, token);
    if (detached ? !html.includes('jpdb-reader-detached-furi') : !html.includes('<rt')) return false;

    setInnerHtml(word, html);
    word.classList.add('jpdb-reader-has-furi');
    if (!detached) return true;

    word.classList.add('jpdb-reader-detached-reading-word');
    const renderSurface = mirror ?? word.parentElement ?? word;
    const host = mirror
        ? registeredTextMirrorHostFor(mirror) ?? mirror.parentElement ?? word
        : word.parentElement ?? word;
    const clipRow = closestRubyFragileConstrainedRow(host);
    if (mirror) {
        // Reading-free additive mirrors remain contained until this exact
        // point. Once a real late reading exists, transition to the same
        // detached state used by an initially-known reading.
        mirror.dataset.yomuDetachedReadings = 'true';
        styleConstrainedTextMirror(mirror, clipRow);
        const sourceStart = Number.parseInt(word.dataset.yomuSourceStart ?? '', 10);
        if (Number.isFinite(sourceStart)) stampProjectedRubySourceRanges(word, surface, token, sourceStart);
    }
    // Only this word received new detached nodes; the rest of a long mirror is
    // already styled. Avoid turning a batch of N late readings into N scans and
    // style-write walks over every previously hydrated word.
    styleDetachedReadingElements(word, host);
    if (mirror) {
        // Async hydration often resolves many words in one response. Projecting
        // the complete source mirror synchronously for every word turns that
        // response into N whole-mirror Range/layout passes. Keep the initial
        // render's post-paint semantics and coalesce late readings into the
        // existing projection lane; document portals use their exact-mirror
        // queue instead of waking every portal in the document.
        scheduleCurrentTextMirrorProjection(host);
    } else {
        stabilizeDetachedReadings(renderSurface, clipRow);
    }
    return true;
}

/** Remove a reading while restoring any mirror/clip state it alone required. */
export function clearRenderedWordFurigana(word: HTMLElement, surface: string): void {
    word.textContent = surface;
    word.classList.remove('jpdb-reader-has-furi');
    clearProjectedReadings(word);
    const mirror = word.closest<HTMLElement>(READER_TEXT_MIRROR_SELECTOR);
    if (!mirror) return;
    const host = registeredTextMirrorHostFor(mirror) ?? mirror.parentElement ?? word;
    const clipRow = closestRubyFragileConstrainedRow(host);
    if (mirror.querySelector('.jpdb-reader-detached-furi')) {
        stabilizeDetachedReadings(mirror, clipRow, true);
        return;
    }
    delete mirror.dataset.yomuDetachedReadings;
    clearProjectedReadings(mirror);
    styleConstrainedTextMirror(mirror, clipRow);
}

function isVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    if (!isVisibleRect(rect)) return false;
    const style = safeComputedStyle(element);
    return isVisibleStyle(style);
}

function isVisibleRect(rect: DOMRect): boolean {
    return rect.width > 0
        && rect.height > 0
        && rect.bottom >= 0
        && rect.top <= window.innerHeight
        && rect.right >= 0
        && rect.left <= window.innerWidth;
}

function isVisibleStyle(style: CSSStyleDeclaration): boolean {
    return style.visibility !== 'hidden'
        && style.display !== 'none'
        && Number(style.opacity || '1') > 0;
}

function isParagraphBoundary(element: HTMLElement): boolean {
    const display = safeComputedStyle(element).display;
    if (element.tagName === 'BR') return true;
    if (isInlineDisplay(display)) return false;
    if (BLOCK_TAGS.has(element.tagName)) return true;
    return isBlockLikeDisplay(display);
}

export { renderedWordSentenceScope } from './rendered-word-sentence-scope';

function isInlineDisplay(display: string): boolean {
    return INLINE_DISPLAY_VALUES.has(display);
}

function isBlockLikeDisplay(display: string): boolean {
    return BLOCK_LIKE_DISPLAY_VALUES.has(display);
}

const INLINE_DISPLAY_VALUES = new Set(['inline', 'contents', 'inline-block', 'inline-flex', 'inline-grid']);
const BLOCK_LIKE_DISPLAY_VALUES = new Set(['block', 'flow-root', 'grid', 'list-item', 'table', 'table-row', 'table-cell']);

function isFragileUiText(element: HTMLElement, text: string): boolean {
    if (isReadablePrimaryDisplayHeadingText(element, text)) return false;
    return isFragileUiContext(element, text);
}

// UT-52: geometry-fragile text (compact rows, tight headings, inline controls)
// is no longer skipped; it is still collected so UI chrome can receive the
// same ruby/color treatment as prose.
function isGeometryFragileText(element: HTMLElement, text: string): boolean {
    if (isReadablePrimaryDisplayHeadingText(element, text)) return false;
    const metrics = fragileTextMetrics(element, text);
    if (fragileByTypography(element, metrics.style, metrics.compactLength, metrics.fontSize, metrics.lineHeight, metrics.prose)) return true;
    if (fragileByCompactLayout(text, metrics.style, metrics.rect)) return true;
    if (isInsideMediaTextLink(element, text)) return true;
    return fragileByInlineControl(text, metrics.style, metrics.rect);
}

function isShortCenteredDisplayHeading(element: HTMLElement, text: string): boolean {
    const heading = closestDisplayHeading(element);
    if (!heading) return false;
    const style = safeComputedStyle(heading);
    const headingText = heading.textContent?.trim() || text;
    if (isReadablePrimaryDisplayHeadingText(element, text)) return false;
    return style.textAlign === 'center' && compactLength(headingText) <= 40;
}

function closestDisplayHeading(element: HTMLElement): HTMLElement | null {
    return DISPLAY_HEADING_RE.test(element.tagName)
        ? element
        : element.closest<HTMLElement>(DISPLAY_HEADING_SELECTOR);
}

function isReadablePrimaryDisplayHeadingText(element: HTMLElement, text: string): boolean {
    const heading = closestDisplayHeading(element);
    if (!heading || heading.tagName !== 'H1') return false;
    if (compactLength(text) < 4) return false;
    return isReadablePrimaryDisplayHeadingElement(heading);
}

function isReadablePrimaryDisplayHeadingElement(element: HTMLElement): boolean {
    const heading = closestDisplayHeading(element);
    if (!heading || heading.tagName !== 'H1') return false;
    if (heading.closest('header, nav, footer, aside, [role="banner"], [role="navigation"], [role="contentinfo"], [role="complementary"]')) return false;
    return Boolean(heading.closest('main, [role="main"]'));
}

function isFragileUiContext(element: HTMLElement, text: string): boolean {
    if (UI_CLASS_RE.test(String(element.className)) && !isReadableProseUiClassText(element, text)) return true;
    if (text.length <= 4 && ancestorClassLooksLikeUi(element)) return true;
    return isInsideControlLikeLink(element, text);
}

function isReadableProseUiClassText(element: HTMLElement, text: string): boolean {
    if (compactLength(text) < 8) return false;
    return isLikelyProseElement(element) && Boolean(element.closest('article, main, [role="main"]'));
}

function fragileTextMetrics(element: HTMLElement, text: string): {
    style: CSSStyleDeclaration;
    rect: DOMRect;
    compactLength: number;
    fontSize: number;
    lineHeight: number;
    prose: boolean;
} {
    const style = safeComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const compactLength = Array.from(text.replace(/\s+/g, '')).length;
    const fontSize = cssPixels(style.fontSize);
    const lineHeight = cssPixels(style.lineHeight) || fontSize * 1.25;
    return { style, rect, compactLength, fontSize, lineHeight, prose: isLikelyProseElement(element) };
}

function fragileByCompactLayout(text: string, style: CSSStyleDeclaration, rect: DOMRect): boolean {
    if (!hasCompactLayoutShape(text, rect)) return false;
    return hasCompactLayoutAlignment(style);
}

function hasCompactLayoutShape(text: string, rect: DOMRect): boolean {
    return rect.width > 0 && text.length <= 12 && rect.width < 180;
}

function hasCompactLayoutAlignment(style: CSSStyleDeclaration): boolean {
    return style.textAlign === 'center' || style.whiteSpace !== 'normal';
}

function fragileByInlineControl(text: string, style: CSSStyleDeclaration, rect: DOMRect): boolean {
    return text.length <= 6 && hasUiBox(style) && hasInlineControlShape(style.display) && rect.width < 180;
}

function fragileByTypography(
    element: HTMLElement,
    style: CSSStyleDeclaration,
    compactLength: number,
    fontSize: number,
    lineHeight: number,
    prose: boolean,
): boolean {
    const centered = style.textAlign === 'center';
    const heading = DISPLAY_HEADING_RE.test(element.tagName);
    if (!heading) return fragileCenteredNonProseTypography(style, centered, compactLength, fontSize, prose);
    if (isReadableArticleHeading(element, compactLength)) return false;
    if (fragileHeadingTypography(centered, compactLength, fontSize, lineHeight)) return true;
    return fragileCenteredNonProseTypography(style, centered, compactLength, fontSize, prose);
}

function fragileHeadingTypography(centered: boolean, compactLength: number, fontSize: number, lineHeight: number): boolean {
    return compactLength <= 40 && (centered || fontSize >= 18 || lineHeight <= fontSize * 1.35);
}

function fragileCenteredNonProseTypography(
    style: CSSStyleDeclaration,
    centered: boolean,
    compactLength: number,
    fontSize: number,
    prose: boolean,
): boolean {
    if (!isCompactCenteredNonProse(prose, centered, compactLength)) return false;
    return hasProminentCenteredTypography(style, fontSize);
}

function isCompactCenteredNonProse(prose: boolean, centered: boolean, compactLength: number): boolean {
    return !prose && centered && compactLength <= 30;
}

function hasProminentCenteredTypography(style: CSSStyleDeclaration, fontSize: number): boolean {
    return fontSize >= 17 || Number(style.fontWeight) >= 600;
}

function isReadableArticleHeading(element: HTMLElement, compactLength: number): boolean {
    return compactLength >= 4 && Boolean(element.closest('article, main, [role="main"]'));
}

function ancestorClassLooksLikeUi(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current) {
        if (current === document.body) break;
        if (UI_CLASS_RE.test(String(current.className))) return true;
        current = current.parentElement;
    }
    return false;
}

function isInsideControlLikeLink(element: HTMLElement, text: string): boolean {
    const link = element.closest('a[href]') as HTMLElement | null;
    if (!link) return false;
    if (isLikelyProseLink(link, element)) return false;
    // UT-52: a link that carries media AND real text (channel avatar + name)
    // is content, not an icon button, so it is scanned instead of skipped.
    const iconOnlyMediaLink = linkHasControlMedia(link) && compactLength(text) <= 2;
    return [isExplicitControlLink(link), iconOnlyMediaLink, linkHasControlShape(link, text)].some(Boolean);
}

// UT-52 soft tier: media-bearing text links annotate without being interactive.
function isInsideMediaTextLink(element: HTMLElement, text: string): boolean {
    const link = element.closest('a[href]') as HTMLElement | null;
    if (!link || isLikelyProseLink(link, element)) return false;
    return linkHasControlMedia(link) && compactLength(text) > 2;
}

// Late-clamp reconciliation: any site's clamped/ellipsis/clipped text row that
// actually crops its furigana gets its height cap lifted (bounded by
// RUBY_ROOM_MAX_PX). Containers we must never reserve ruby room on: cards the YouTube filter has
// collapsed/hidden (sizing them un-collapses the filter into giant gaps) and
// any aria-hidden subtree. Scanned words can live inside a collapsed card; room
// must skip them.
const RUBY_ROOM_HARD_SKIP_SELECTOR = '[data-yomu-youtube-filtered],[data-yomu-youtube-pending],[data-yomu-youtube-aria-hidden],.jpdb-youtube-filter-collapsed,.jpdb-youtube-pending';
const RUBY_ROOM_YOUTUBE_TEXT_BOX_SELECTOR = [
    'ytd-comment-view-model #content-text',
    'ytm-comment-renderer #content-text',
    'ytd-watch-info-text',
    'ytd-watch-metadata :is(h1,#title,#owner,#info,#info-strings,#info-container,#info-text,#metadata,#metadata-line,.ytContentMetadataViewModelMetadataRow,yt-video-metadata-carousel-view-model)',
    '.ytContentMetadataViewModelMetadataRow',
    'ytd-transcript-segment-renderer :is(.segment-text,yt-formatted-string)',
    'ytm-transcript-segment-renderer',
    'ytm-slim-video-metadata-section-renderer :is(h1,#title,.slim-video-metadata-info)',
    'ytm-expandable-video-description-body-renderer p',
    'ytm-structured-description-content-renderer',
    'ytd-rich-section-renderer :is(#title,h2)',
    'ytd-rich-shelf-renderer :is(#title,h2)',
    'ytd-rich-item-renderer :is(#video-title-link,#video-title,#metadata-line,ytd-channel-name)',
    'ytd-video-renderer :is(#video-title,#metadata-line)',
    ':is(ytd-compact-video-renderer,ytd-watch-next-secondary-results-renderer) #video-title',
    'yt-lockup-view-model :is(.ytLockupMetadataViewModelHeadingReset,.ytLockupMetadataViewModelTitle,.ytAttributedStringHost)',
    'ytm-video-with-context-renderer .media-item-headline',
    ':is(ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2) h3',
    'grid-shelf-view-model h2',
    'ytd-shelf-renderer :is(#title,h2)',
    'ytd-grid-video-renderer :is(#video-title,#metadata-line)',
    'yt-description-preview-view-model',
    'yt-tab-shape',
    'ytd-playlist-panel-video-renderer #video-title',
    'ytd-playlist-video-renderer #video-title',
    'ytd-playlist-header-renderer :is(#title,.metadata-wrapper)',
    'ytd-video-renderer .metadata-snippet-text',
    ':is(ytd-channel-renderer,ytd-grid-channel-renderer) :is(#info,#description)',
    'yt-live-chat-viewer-engagement-message-renderer :is(#content,#message,yt-formatted-string,a,button,[role="button"])',
    'yt-live-chat-restricted-participation-renderer :is(#message,#subtext,yt-formatted-string,a,button,[role="button"])',
    'yt-live-chat-banner-renderer :is(#message,#header,yt-formatted-string,a,button,[role="button"])',
    'yt-live-chat-ticker-renderer :is(#text,#content,yt-formatted-string,a,button,[role="button"])',
].join(',');
// A clamped/ellipsis text row's furigana never needs more than a few lines of
// extra height. A room far larger than this means we measured a container (a
// collapsed card, a virtualized list) rather than a text row — refuse it so a
// mis-measure can never blow the layout up to hundreds of px.
const RUBY_ROOM_MAX_PX = 400;
const RUBY_ROOM_SHORT_ROW_MAX_PX = 96;
const RUBY_ROOM_SHORT_ROW_OVERFLOW_MAX_PX = 120;
const RUBY_ROOM_WRAPPED_MIRROR_MIN_DELTA_PX = 32;
const RUBY_ROOM_WRAPPED_MIRROR_MIN_HEIGHT_PX = 80;
const RUBY_ROOM_WRAPPED_MIRROR_SETTLE_BUFFER_PX = 8;

// Growing a box can rewrap its content (inline-block ruby words wrap
// differently at the new height's line breaks — font metrics decide, so CI
// Linux fonts hit this where local fonts don't), leaving the freshly grown
// box still cropping. Repeat the sweep until a pass adjusts nothing; each
// pass only ever grows (previousRubyRoomHeight guard), so it terminates.
const RUBY_ROOM_SWEEP_MAX_PASSES = 3;

// Engine guard for the in-flow clamp reading channel. The apply path stamps a
// growable clamp row "content" OPTIMISTICALLY (owner rule: readings visible at
// rest wherever layout can absorb them), then this measured post-paint verdict
// is the AUTHORITY: some engine/font combinations (CI's Linux Chrome, iPad
// Safari on height-pinned rows) do NOT grow a -webkit-box line-clamp row when
// rt joins the line box — the base glyphs fall below the clip, the rt paints
// OVER the base, or the widened word truncates the row. A row that fails the
// measured checks flips back to the rest-hidden "true" stamp (removing rt from
// layout, restoring the plain line; the next re-apply then routes it through
// the width-neutral detached lane).
//
// The verdict is RECOVERABLE, not a permanent sentence, and demotion demands
// POSITIVE failure evidence. The earlier design demoted on any base drift and
// then wrote data-yomu-clamp-growth=failed forever, so a single transient
// mis-measure (a row caught mid-hydration, zero-height, or before its shell
// settled) retracted genuine at-rest furigana with no path back (A-cluster
// "furigana appears then disappears" iPad report, 2026-07-20). Two guards fix
// that: (a) "broken" now requires a clear failure — the base pushed essentially
// OUT of the row box, rt measurably painting DOWN over the base, or the line
// overflowing the row width — never a sub-pixel poke; (b) recovery is
// bidirectional and idempotent — a failed row whose in-flow rt is measurable
// and clearing the base again is promoted back to "content".
//
// Recovery is SOUND, not oscillating: promotion demands a measurable rt that
// clears the base. A demoted row's rt is removed from layout by CSS
// (display:none on the "true" stamp), so it reports no box and stays
// "unmeasurable" — a stably-ungrowable row is therefore never re-promoted only
// to re-fail. Reads complete before the attribute writes.
const CLAMP_GROWTH_ATTRIBUTE = 'data-yomu-clamp-growth';
const CONTENT_CLIP_ROW_SELECTOR = '[data-yomu-clip-constrained="content"]';
const FAILED_CLAMP_ROW_SELECTOR = `[${CLAMP_GROWTH_ATTRIBUTE}="failed"]`;
// A base has genuinely left the clip (the readings-only row) once its top sits
// at or below the row's bottom edge — a small poke over the edge keeps the base
// mostly visible and stays in-flow (owner rule).
const CLAMP_ROW_BASE_ESCAPE_PX = 2;
// rt sub-pixel overlap tolerance: a healthy reading clears above the base cap,
// so any measurable descent past this into the base is the non-growing engine.
const CLAMP_ROW_RT_OVERLAP_SLOP_PX = 2;
// Generous horizontal slop: a wrapping multi-line clamp keeps scrollWidth at
// clientWidth, so real overflow (an ellipsis label whose widened word cannot
// wrap) is the only thing that clears this — never narrow-column rounding.
const CLAMP_ROW_WIDTH_SLOP_PX = 4;

// The veto consulted at every in-flow decision site (apply-time clip stamp and
// detached-lane routing): only a measured "failed" keeps a row out of the
// in-flow channel. A confirmed ("ok") or not-yet-measured row stays eligible.
function clampRowGrowthFailed(clipRow: HTMLElement): boolean {
    return clipRow.getAttribute(CLAMP_GROWTH_ATTRIBUTE) === 'failed';
}

type ClampRowVerdict = 'healthy' | 'broken' | 'unmeasurable';

// Measured post-paint verdict for one in-flow clamp row. "unmeasurable" (no
// annotated word yet, zero-height row/base, or rt without a box) leaves the
// row's current stamp untouched, so a row caught before its surface settles is
// never demoted on no evidence — only re-checked on a later pass.
function measuredClampRowVerdict(row: HTMLElement): ClampRowVerdict {
    const word = row.querySelector<HTMLElement>('.jpdb-reader-word.jpdb-reader-scan-word');
    const rt = word?.querySelector<HTMLElement>('rt.jpdb-reader-furi');
    if (!word || !rt) return 'unmeasurable';
    const rowRect = row.getBoundingClientRect();
    if (!rowRect.height) return 'unmeasurable';
    const base = word.querySelector<HTMLElement>('.jpdb-reader-ruby-base') ?? word;
    const baseRect = base.getBoundingClientRect();
    if (!baseRect.height) return 'unmeasurable';
    const rtRect = rt.getBoundingClientRect();
    // FAILURE evidence (any one demotes — none of these needs rt metrics except
    // the overlap check, which self-guards on rt having a box):
    // (i) the base has dropped essentially out of the row box: a non-growing
    //     engine leaves a readings-only row with the base below the clip.
    const baseEscaped = baseRect.top >= rowRect.bottom - CLAMP_ROW_BASE_ESCAPE_PX
        || baseRect.bottom <= rowRect.top + CLAMP_ROW_BASE_ESCAPE_PX;
    // (ii) rt paints DOWN over the base because the line never grew its leading.
    const rtOverlapsBase = rtRect.height > 0
        && rtRect.bottom - baseRect.top > CLAMP_ROW_RT_OVERLAP_SLOP_PX;
    // (iii) the ruby-widened line overflows the row width and the clip truncates
    //     it (an ellipsis label whose base cannot rewrap: 共有 → 共…).
    const widthOverflows = row.clientWidth > 0
        && row.scrollWidth > row.clientWidth + CLAMP_ROW_WIDTH_SLOP_PX;
    if (baseEscaped || rtOverlapsBase || widthOverflows) return 'broken';
    // HEALTH is only CONFIRMED with a measurable rt clearing the base — the sole
    // positive proof the engine grew the line. Without it the row is
    // "unmeasurable": a demoted row (rt display:none) can never be re-promoted
    // just because hiding its reading left the base sitting in a plain line.
    if (rtRect.height > 0 && rtRect.bottom <= baseRect.top + CLAMP_ROW_RT_OVERLAP_SLOP_PX) return 'healthy';
    return 'unmeasurable';
}

export function healUngrowableInFlowClampRows(root: ParentNode = document): number {
    // Candidates: every optimistic/confirmed in-flow row ("content"), plus rows
    // a prior pass demoted ("failed") so a genuinely recovered surface can be
    // promoted back. querySelectorAll never matches the root itself, and per-root
    // apply passes the annotated row AS the root — include it (and a stamped
    // ancestor) or the one row that matters is the one that is never checked.
    const rows = new Set<HTMLElement>();
    if (root instanceof HTMLElement) {
        const selfOrAncestor = root.closest<HTMLElement>(`${CONTENT_CLIP_ROW_SELECTOR},${FAILED_CLAMP_ROW_SELECTOR}`);
        if (selfOrAncestor) rows.add(selfOrAncestor);
    }
    for (const row of root.querySelectorAll<HTMLElement>(CONTENT_CLIP_ROW_SELECTOR)) rows.add(row);
    for (const row of root.querySelectorAll<HTMLElement>(FAILED_CLAMP_ROW_SELECTOR)) rows.add(row);
    if (!rows.size) return 0;
    // Read all geometry first, then write — the sweep must never interleave a
    // layout read with its own attribute write (forced synchronous reflow).
    const demote: HTMLElement[] = [];
    const promote: HTMLElement[] = [];
    for (const row of rows) {
        if (row.classList.contains('jpdb-reader-text-mirror')) continue;
        const verdict = measuredClampRowVerdict(row);
        if (verdict === 'broken') {
            if (!clampRowGrowthFailed(row)) demote.push(row);
        } else if (verdict === 'healthy' && clampRowGrowthFailed(row)) {
            promote.push(row);
        }
    }
    for (const row of demote) {
        row.setAttribute(CLAMP_GROWTH_ATTRIBUTE, 'failed');
        row.dataset.yomuClipConstrained = 'true';
    }
    for (const row of promote) {
        row.setAttribute(CLAMP_GROWTH_ATTRIBUTE, 'ok');
        row.dataset.yomuClipConstrained = 'content';
    }
    return demote.length;
}

// A token that wraps across line boxes cannot be underlined by the single
// absolutely-positioned ::after overlay — it anchors to the word's border box,
// so continuation lines lose their pitch/status underline entirely (iPad
// Google-results report, 2026-07-19). Wrapped words are stamped so CSS
// switches them to the native text-decoration, which paints on every line
// fragment. Two-phase (all reads, then all writes) so the sweep never
// interleaves layout reads with its own attribute writes.
const WRAPPED_SCAN_WORD_ATTRIBUTE = 'data-yomu-wrapped';

export function refreshWrappedScanWordUnderlines(root: ParentNode = document): void {
    const words = root.querySelectorAll<HTMLElement>('.jpdb-reader-word.jpdb-reader-scan-word');
    if (!words.length) return;
    const wrapped: HTMLElement[] = [];
    const unwrapped: HTMLElement[] = [];
    for (const word of words) {
        (scanWordSpansMultipleLines(word) ? wrapped : unwrapped).push(word);
    }
    for (const word of wrapped) word.setAttribute(WRAPPED_SCAN_WORD_ATTRIBUTE, 'true');
    for (const word of unwrapped) {
        if (word.hasAttribute(WRAPPED_SCAN_WORD_ATTRIBUTE)) word.removeAttribute(WRAPPED_SCAN_WORD_ATTRIBUTE);
    }
}

// Fragment rects on ONE line share a top edge; engines may still report
// several rects per line for a word with inline ruby children. A word is
// wrapped only when its fragments' top edges spread further apart than half
// the tallest fragment — a same-line split can never reach that.
function scanWordSpansMultipleLines(word: HTMLElement): boolean {
    const rects = Array.from(word.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
    if (rects.length < 2) return false;
    let minTop = Number.POSITIVE_INFINITY;
    let maxTop = Number.NEGATIVE_INFINITY;
    let maxHeight = 0;
    for (const rect of rects) {
        minTop = Math.min(minTop, rect.top);
        maxTop = Math.max(maxTop, rect.top);
        maxHeight = Math.max(maxHeight, rect.height);
    }
    return maxTop - minTop > maxHeight / 2;
}

export function makeRoomForRubyInCroppedRows(root: ParentNode = document): number {
    const adjustedBoxes = new Set<HTMLElement>();
    for (let pass = 0; pass < RUBY_ROOM_SWEEP_MAX_PASSES; pass += 1) {
        if (!makeRoomForRubyInCroppedRowsOnce(root, adjustedBoxes)) break;
    }
    return adjustedBoxes.size;
}

interface RubyRoomDecision {
    roomHeight: number;
    topDeficit: number;
}

type RubyRoomDecisionMap = Map<HTMLElement, RubyRoomDecision>;

function makeRoomForRubyInCroppedRowsOnce(root: ParentNode, adjustedBoxes: Set<HTMLElement>): number {
    // Two phases: measure everything first, then write. Interleaving the
    // per-box writes (min-height/height) with the next word's layout reads
    // forces a synchronous reflow per annotated word — on a YouTube feed
    // that is hundreds of reflows per sweep.
    const decisions: RubyRoomDecisionMap = new Map();
    const words = root.querySelectorAll<HTMLElement>('.jpdb-reader-word');
    for (const word of words) collectRubyRoomDecisions(word, adjustedBoxes, decisions);
    return applyRubyRoomDecisions(decisions, adjustedBoxes);
}

function collectRubyRoomDecisions(
    word: HTMLElement,
    adjustedBoxes: Set<HTMLElement>,
    decisions: RubyRoomDecisionMap,
): void {
    const candidate = rubyRoomWordCandidate(word);
    if (!candidate) return;
    for (const box of candidate.cropBoxes) {
        const crop = rubyRoomCropPlan(box, candidate.mirror);
        if (!crop) continue;
        collectRubyRoomBoxDecisions(box, crop.curated, candidate.mirror, adjustedBoxes, decisions);
    }
}

function rubyRoomWordCandidate(word: HTMLElement): {
    mirror: HTMLElement | null;
    cropBoxes: HTMLElement[];
} | null {
    if (!word.querySelector('rt')) return null;
    // Ruby-room growth only serves prose/content decorations. Compact chrome
    // and hidden-at-rest readings never grow an ancestor box.
    if (['interactive-passive', 'skip'].includes(decorationStateForWord(word) ?? '')) return null;
    if (word.closest('[data-yomu-clip-constrained]')) return null;
    // A box may only grow for the mirror that renders this word, never for an
    // unrelated taller descendant mirror elsewhere in document order.
    const mirror = word.closest<HTMLElement>('.jpdb-reader-text-mirror');
    return { mirror, cropBoxes: rubyRoomEligibleCropBoxes(word, mirror) };
}

function rubyRoomCropPlan(box: HTMLElement, mirror: HTMLElement | null): { curated: boolean } | null {
    const excluded = [
        box.closest(RUBY_ROOM_HARD_SKIP_SELECTOR),
        box.closest('[aria-hidden="true"],[hidden]'),
    ].some(Boolean);
    if (excluded) return null;
    // Curated YouTube/Google rows grow on any crop signal. Generic collapsed
    // regions grow only when ruby itself overflows, so read-more UI stays shut.
    const curated = [isGoogleSearchRubyRoomTextBox(box), isYouTubeRubyRoomTextBox(box)].some(Boolean);
    const cropsRuby = curated ? boxActuallyCrops(box, mirror) : genericRubyNeedsRoom(box, mirror);
    return cropsRuby ? { curated } : null;
}

function collectRubyRoomBoxDecisions(
    box: HTMLElement,
    curated: boolean,
    mirror: HTMLElement | null,
    adjustedBoxes: Set<HTMLElement>,
    decisions: RubyRoomDecisionMap,
): void {
    for (const roomBox of rubyRoomBoxesForCroppedBox(box, curated, mirror)) {
        const decision = rubyRoomDecisionForBox(roomBox, curated, mirror, adjustedBoxes);
        if (!decision) continue;
        recordBestRubyRoomDecision(decisions, roomBox, decision);
    }
}

function rubyRoomDecisionForBox(
    roomBox: HTMLElement,
    curated: boolean,
    mirror: HTMLElement | null,
    adjustedBoxes: Set<HTMLElement>,
): RubyRoomDecision | null {
    // Clip constraints dominate curated selectors and prose classification:
    // their at-rest readings are hidden, so growth can only inflate the card.
    if (isClipConstrainedRow(roomBox)) return null;
    // Grid and table tracks own their items' block size. Writing a hard height
    // to an item (or to a table box itself) feeds back into track sizing and can
    // stretch sibling rows into blank cards. Keep the ruby painted while leaving
    // host track geometry host-owned.
    if (participatesInTrackSizing(roomBox)) return null;
    const measuredHeight = curated ? rubyRoomHeight(roomBox, mirror) : genericRubyRoomHeight(roomBox, mirror);
    if (measuredHeight > RUBY_ROOM_MAX_PX) return null;
    // Repeat passes correct height under-growth only. Top padding is exact on
    // the first application and must never accumulate across passes.
    const topDeficit = adjustedBoxes.has(roomBox) ? 0 : rubyTopClearanceDeficit(roomBox, mirror);
    const roomHeight = measuredHeight + topDeficit;
    const previousHeightIsEnough = previousRubyRoomHeight(roomBox) >= roomHeight && topDeficit === 0;
    return previousHeightIsEnough ? null : { roomHeight, topDeficit };
}

const TRACK_SIZED_DISPLAY_VALUES = new Set([
    'grid',
    'inline-grid',
    'table',
    'inline-table',
    'table-row',
    'table-row-group',
    'table-header-group',
    'table-footer-group',
    'table-cell',
]);

function participatesInTrackSizing(box: HTMLElement): boolean {
    if (TRACK_SIZED_DISPLAY_VALUES.has(safeComputedStyle(box).display)) return true;
    const parent = box.parentElement;
    return Boolean(parent && TRACK_SIZED_DISPLAY_VALUES.has(safeComputedStyle(parent).display));
}

function recordBestRubyRoomDecision(
    decisions: RubyRoomDecisionMap,
    roomBox: HTMLElement,
    decision: RubyRoomDecision,
): void {
    if ((decisions.get(roomBox)?.roomHeight ?? 0) >= decision.roomHeight) return;
    decisions.set(roomBox, decision);
}

function applyRubyRoomDecisions(decisions: RubyRoomDecisionMap, adjustedBoxes: Set<HTMLElement>): number {
    let adjusted = 0;
    for (const [box, { roomHeight, topDeficit }] of decisions) {
        recordRubyRoomGrowth(box);
        box.dataset.yomuRubyRoom = 'true';
        box.dataset.yomuRubyRoomHeight = String(roomHeight);
        makeRoomForRubyInBox(box, safeComputedStyle(box), roomHeight, topDeficit);
        recordRubyRoomGrowthWrite(box);
        adjustedBoxes.add(box);
        adjusted += 1;
    }
    return adjusted;
}

function rubyRoomEligibleCropBoxes(word: HTMLElement, mirror: HTMLElement | null): HTMLElement[] {
    const cropBoxes = cropCapableBoxes(word.parentElement, mirror);
    // If ANY box in the ancestor chain is a clamp/fixed-short row, the whole
    // word is paint-invariant. Growing a different ancestor still creates the
    // same giant blank card even when the clamp box itself is skipped.
    return cropBoxes.some(isClipConstrainedRow) ? [] : cropBoxes;
}

// Growth writes are OWNED and revertible: the box's pre-growth inline values
// are recorded once (first growth wins — later passes only re-ratchet the
// same box) and restored by releaseRubyRoomGrowth. Growth stays monotonic
// within a page session (the CI rewrap-convergence contract); release happens
// only on the explicit clear path (annotations off / teardown).
interface RubyRoomStyleSnapshot {
    minHeight: string;
    minHeightPriority: string;
    height: string;
    heightPriority: string;
    maxHeight: string;
    maxHeightPriority: string;
    paddingTop: string;
    paddingTopPriority: string;
}

interface RubyRoomGrowthRecord {
    // The box's inline values before the FIRST growth write.
    before: RubyRoomStyleSnapshot;
    // The inline values as of OUR last write. Release restores a property only
    // while its current inline value still equals what we wrote — a framework
    // that re-styled the box since then keeps its own value.
    written?: RubyRoomStyleSnapshot;
}

const rubyRoomGrowthRecords = new WeakMap<HTMLElement, RubyRoomGrowthRecord>();

function rubyRoomStyleSnapshot(box: HTMLElement): RubyRoomStyleSnapshot {
    return {
        minHeight: box.style.getPropertyValue('min-height'),
        minHeightPriority: box.style.getPropertyPriority('min-height'),
        height: box.style.getPropertyValue('height'),
        heightPriority: box.style.getPropertyPriority('height'),
        maxHeight: box.style.getPropertyValue('max-height'),
        maxHeightPriority: box.style.getPropertyPriority('max-height'),
        paddingTop: box.style.getPropertyValue('padding-top'),
        paddingTopPriority: box.style.getPropertyPriority('padding-top'),
    };
}

function recordRubyRoomGrowth(box: HTMLElement): void {
    if (rubyRoomGrowthRecords.has(box)) return;
    rubyRoomGrowthRecords.set(box, { before: rubyRoomStyleSnapshot(box) });
}

function recordRubyRoomGrowthWrite(box: HTMLElement): void {
    const record = rubyRoomGrowthRecords.get(box);
    if (record) record.written = rubyRoomStyleSnapshot(box);
}

export function releaseRubyRoomGrowth(root: ParentNode = document): number {
    const boxes = queryAllInAnnotationRoots(root, '[data-yomu-ruby-room]');
    for (const box of boxes) {
        const record = rubyRoomGrowthRecords.get(box);
        restoreRubyRoomProperty(box, 'min-height', record, r => [r.minHeight, r.minHeightPriority]);
        restoreRubyRoomProperty(box, 'height', record, r => [r.height, r.heightPriority]);
        restoreRubyRoomProperty(box, 'max-height', record, r => [r.maxHeight, r.maxHeightPriority]);
        restoreRubyRoomProperty(box, 'padding-top', record, r => [r.paddingTop, r.paddingTopPriority]);
        delete box.dataset.yomuRubyRoom;
        delete box.dataset.yomuRubyRoomHeight;
        delete box.dataset.yomuRubyRoomPadTop;
        rubyRoomGrowthRecords.delete(box);
    }
    return boxes.length;
}

function restoreRubyRoomProperty(
    box: HTMLElement,
    property: string,
    record: RubyRoomGrowthRecord | undefined,
    pick: (snapshot: RubyRoomStyleSnapshot) => [string, string],
): void {
    if (record?.written) {
        const [writtenValue, writtenPriority] = pick(record.written);
        const currentValue = box.style.getPropertyValue(property);
        const currentPriority = box.style.getPropertyPriority(property);
        // The framework re-styled this property since our write: its value is
        // newer than both our write and our pre-write snapshot — keep it.
        if (currentValue !== writtenValue || currentPriority !== writtenPriority) return;
    }
    const [value, priority] = record ? pick(record.before) : ['', ''];
    if (value) box.style.setProperty(property, value, priority);
    else box.style.removeProperty(property);
}

// Growing a row reveals a reading cropped at the BOTTOM, but a reading pinned
// against (or above) the row's TOP edge stays shaved no matter how tall the
// row gets: min-height grows downward while the line stays top-anchored (a
// chip whose label line-height equals the chip height puts the annotation
// flush with the overflow-hidden edge). The missing clearance becomes
// padding-top, which pushes the text down into the freshly grown room.
const RUBY_ROOM_TOP_CLEARANCE_PX = 1;
const RUBY_ROOM_TOP_PAD_MAX_PX = 24;

function rubyTopClearanceDeficit(box: HTMLElement, mirror: HTMLElement | null): number {
    const raw = rubyTopOverflowRaw(box, mirror);
    // A reading genuinely above the box top always needs the push-down; a
    // merely flush reading only counts on single-line rows (rubyTouchesBoxTop)
    // where the flush edge is the clip edge.
    if (raw <= 0 && !rubyTouchesBoxTop(box, mirror)) return 0;
    if (raw <= -RUBY_ROOM_TOP_CLEARANCE_PX) return 0;
    const applied = previousRubyRoomTopPad(box);
    const deficit = Math.ceil(raw + RUBY_ROOM_TOP_CLEARANCE_PX);
    return applied + deficit > RUBY_ROOM_TOP_PAD_MAX_PX ? 0 : deficit;
}

function previousRubyRoomTopPad(box: HTMLElement): number {
    const value = Number(box.dataset.yomuRubyRoomPadTop ?? '');
    return Number.isFinite(value) ? value : 0;
}

function rubyCropsBox(box: HTMLElement, mirror: HTMLElement | null): boolean {
    return rubyBottomOverflow(box, mirror) > 1 || rubyTouchesBoxTop(box, mirror) || rubyMirrorBlockOverflow(box, mirror) > 1;
}

// A reading pinned within a hair of the box's top edge is already shaved by
// rounding/anti-aliasing even when it does not measurably overflow — treat
// "flush with the top" as cropped so the row gains clearance. Only single-line
// rows (chips, tabs, action labels) qualify: a multi-line clamp box crops at
// its BOTTOM, and its first-line annotation legitimately starts at the top.
function rubyTouchesBoxTop(box: HTMLElement, mirror: HTMLElement | null): boolean {
    const style = safeComputedStyle(box);
    const lineHeight = cssPixels(style.lineHeight) || (cssPixels(style.fontSize) || 16) * 1.4;
    if (!box.clientHeight || box.clientHeight > lineHeight * 1.8) return false;
    return rubyTopOverflowRaw(box, mirror) > -RUBY_ROOM_TOP_CLEARANCE_PX;
}

function genericRubyNeedsRoom(box: HTMLElement, mirror: HTMLElement | null): boolean {
    return rubyCropsBox(box, mirror) || rubyLayoutOverflowsShortRow(box, mirror) || rubyOverflowsCompactClippedRow(box, mirror);
}

// GENERIC compact-row detector (replaces per-site YouTube/Google selector lists
// for the metadata/comment/sidebar case). A row that (a) the AUTHOR explicitly
// clipped to a fixed/max height or line-clamp — already true, it is only reached
// from cropCapableBoxes — and (b) is COMPACT (a metadata/byline/comment/tab row,
// not a tall block) and (c) crops its annotated ruby by a BOUNDED amount grows
// to fit the reading. Any scanned site's tight non-prose row is caught the same
// way, so the YouTube watch channel/view-count/comment/sidebar rows no longer
// need enumeration.
//
// The two caps are exactly what separates a compact row from a collapsed
// "read more" region (which must stay collapsed): a read-more block is TALL
// (clientHeight well past the short-row cap) and hides MANY lines (overflow far
// past the bounded cap — e.g. a 104px→400px description expander). A prose
// context (article/main) is excluded outright so body paragraphs never grow.
function rubyOverflowsCompactClippedRow(box: HTMLElement, mirror: HTMLElement | null): boolean {
    const clientHeight = box.clientHeight;
    if (clientHeight <= 0 || clientHeight > RUBY_ROOM_SHORT_ROW_MAX_PX) return false;
    if (isReadableProseContext(box)) return false;
    // A visually-hidden box is a measurement wrapper (e.g. the attributed-string
    // host whose only visible content is an out-of-flow mirror) — its clipping
    // is invisible, so sizing it does nothing but risk double-growth against the
    // real display row that also gets room. The visible display ancestor is
    // caught on its own.
    if (isVisuallyHiddenBox(box)) return false;
    if (!boxHasRubySignal(box, mirror)) return false;
    const overflow = compactClippedRubyOverflow(box, mirror) - clientHeight;
    return overflow > 2 && overflow <= RUBY_ROOM_SHORT_ROW_OVERFLOW_MAX_PX;
}

// The ruby that justifies growing THIS box: an in-flow annotated word, or the
// triggering word's OWN mirror (never an unrelated descendant mirror).
function ownedRubyMirrorFor(box: HTMLElement, mirror: HTMLElement | null): HTMLElement | null {
    return mirror && box.contains(mirror) ? mirror : null;
}

function ownedRubyMirrorWithRuby(box: HTMLElement, mirror: HTMLElement | null): HTMLElement | null {
    const owned = ownedRubyMirrorFor(box, mirror);
    return owned?.dataset.jpdbReaderHasRuby === 'true' ? owned : null;
}

function boxHasRubySignal(box: HTMLElement, mirror: HTMLElement | null): boolean {
    if (ownedRubyMirrorWithRuby(box, mirror)) return true;
    const word = box.querySelector('.jpdb-reader-word rt');
    // In-flow ruby only: a word inside SOME mirror counts solely via the owned
    // mirror above, so an unrelated mirror's rt cannot qualify this box.
    return Boolean(word && !word.closest('.jpdb-reader-text-mirror'));
}

function isVisuallyHiddenBox(box: HTMLElement): boolean {
    const visibility = safeComputedStyle(box).visibility;
    return visibility === 'hidden' || visibility === 'collapse';
}

// Whichever paint path the row uses: destructive in-flow ruby raises the box's
// own scrollHeight; a non-destructive mirror is absolutely positioned (out of
// flow) so the true furigana'd height is the mirror's scrollHeight instead.
function compactClippedRubyOverflow(box: HTMLElement, mirror: HTMLElement | null): number {
    const owned = ownedRubyMirrorWithRuby(box, mirror);
    return Math.max(box.scrollHeight, owned ? owned.scrollHeight : 0);
}

// Generic rows must never inherit scrollHeight (a collapsed region's full
// content height); the room is the visible height plus exactly the ruby
// overflow the box is cropping.
function genericRubyRoomHeight(box: HTMLElement, mirror: HTMLElement | null): number {
    const owned = ownedRubyMirrorWithRuby(box, mirror);
    const shortRowHeight = rubyLayoutOverflowsShortRow(box, mirror) ? box.scrollHeight : 0;
    const compactRowHeight = rubyOverflowsCompactClippedRow(box, mirror) ? compactClippedRubyOverflow(box, mirror) : 0;
    return Math.ceil(Math.max(
        box.clientHeight + rubyBottomOverflow(box, mirror) + rubyTopOverflow(box, mirror),
        owned ? owned.scrollHeight : 0,
        shortRowHeight,
        compactRowHeight,
    ));
}

const RUBY_ROOM_GOOGLE_CONTROL_SELECTOR = ':is(a,button,[role=button])';
const RUBY_ROOM_GOOGLE_TEXT_BOX_SELECTOR = `:is(#botstuff,#bres,.MjjYud,[data-attrid]) ${RUBY_ROOM_GOOGLE_CONTROL_SELECTOR}`;

function isGoogleSearchRubyRoomTextBox(box: HTMLElement): boolean {
    return /(^|\.)google\./i.test(location.hostname)
        && location.pathname === '/search'
        && (safeElementMatches(box, RUBY_ROOM_GOOGLE_TEXT_BOX_SELECTOR)
            || !!box.closest(RUBY_ROOM_GOOGLE_TEXT_BOX_SELECTOR));
}

function rubyRoomBoxesForCroppedBox(box: HTMLElement, curated: boolean, mirror: HTMLElement | null): HTMLElement[] {
    if (!curated) return [box];
    const boxes = [box];
    const googleControl = googleSearchRubyRoomControl(box, mirror);
    if (googleControl && googleControl !== box) boxes.push(googleControl);
    return boxes;
}

function googleSearchRubyRoomControl(box: HTMLElement, mirror: HTMLElement | null): HTMLElement | null {
    if (!/(^|\.)google\./i.test(location.hostname) || location.pathname !== '/search') return null;
    const control = box.closest<HTMLElement>(RUBY_ROOM_GOOGLE_CONTROL_SELECTOR);
    if (!control || !safeElementMatches(control, RUBY_ROOM_GOOGLE_TEXT_BOX_SELECTOR)) return null;
    if (!ownedRubyMirrorWithRuby(control, mirror)) return null;
    return control;
}

function isYouTubeRubyRoomTextBox(box: HTMLElement): boolean {
    if (safeElementMatches(box, 'yt-attributed-string,yt-formatted-string,.ytAttributedStringHost,.yt-core-attributed-string')) {
        return safeElementMatches(box, 'ytd-comment-view-model #content-text,ytm-comment-renderer #content-text');
    }
    return safeElementMatches(box, RUBY_ROOM_YOUTUBE_TEXT_BOX_SELECTOR)
        || !!box.closest(RUBY_ROOM_YOUTUBE_TEXT_BOX_SELECTOR);
}


function makeRoomForRubyInBox(box: HTMLElement, style: CSSStyleDeclaration, roomHeight: number, topDeficit = 0): void {
    const contentHeight = `${roomHeight}px`;
    if (topDeficit > 0) {
        const applied = previousRubyRoomTopPad(box) + topDeficit;
        box.dataset.yomuRubyRoomPadTop = String(applied);
        box.style.setProperty('padding-top', `${(cssPixels(style.paddingTop) || 0) + topDeficit}px`, 'important');
    }
    box.style.setProperty('min-height', contentHeight, 'important');
    if (hasLineClamp(style)) {
        // -webkit-line-clamp itself limits LINES; the crop comes from a height
        // cap sized for plain lines. Lifting it keeps the host's "N lines"
        // semantics with taller ruby lines.
        box.style.setProperty('max-height', 'none', 'important');
        if (hasDefiniteCssSize(style.height)) box.style.setProperty('height', 'auto', 'important');
        return;
    }

    if (hasDefiniteCssSize(style.height)) {
        box.style.setProperty('height', contentHeight, 'important');
    }
    if (hasDefiniteCssSize(style.maxHeight) || !hasDefiniteCssSize(style.height)) {
        box.style.setProperty('max-height', contentHeight, 'important');
    }
}

function cropCapableBoxes(element: HTMLElement | null, mirror: HTMLElement | null): HTMLElement[] {
    const boxes: HTMLElement[] = [];
    let fallback: HTMLElement | undefined;
    let current: HTMLElement | null = element;
    while (current && current !== document.body && current !== document.documentElement) {
        if (current.dataset.jpdbReaderRoot) break;
        if (boxStyleIsClipCapable(current) || rubyLayoutOverflowsShortRow(current, mirror)) {
            boxes.push(current);
        } else if (!fallback && isYouTubeRubyRoomTextBox(current) && ownedRubyMirrorFor(current, mirror)) {
            fallback = current;
        }
        current = current.parentElement;
    }
    return boxes.length || !fallback ? boxes : [fallback];
}

const shortRowVerdicts = new WeakMap<HTMLElement, { at: number; value: boolean }>();

function rubyLayoutOverflowsShortRow(box: HTMLElement, mirror: HTMLElement | null): boolean {
    const now = Date.now();
    const memo = shortRowVerdicts.get(box);
    if (memo && now - memo.at < CONSTRAINED_ROW_VERDICT_TTL_MS) return memo.value;
    const value = rubyLayoutOverflowsShortRowUncached(box, mirror);
    shortRowVerdicts.set(box, { at: now, value });
    return value;
}

function rubyLayoutOverflowsShortRowUncached(box: HTMLElement, mirror: HTMLElement | null): boolean {
    if (safeElementMatches(box, '.jpdb-reader-word,ruby,rt,.jpdb-reader-furi,.jpdb-reader-ruby-base')) return false;
    const clientHeight = box.clientHeight;
    if (clientHeight <= 0 || clientHeight > RUBY_ROOM_SHORT_ROW_MAX_PX) return false;
    // Ruby-signal check LAST and only for plausibly-short boxes — a subtree
    // query per ancestor (at high levels: most of the document) was the hot
    // path of the clamp sweep on large pages.
    if (!boxHasRubySignal(box, mirror)) return false;
    const overflow = box.scrollHeight - clientHeight;
    if (overflow <= 2 || overflow > RUBY_ROOM_SHORT_ROW_OVERFLOW_MAX_PX) return false;
    const style = safeComputedStyle(box);
    if (hasClippedTextConstraint(style) || hasLineClamp(style) || isEllipsisTextRow(style)) return false;
    return isShortRubyRowDisplay(style);
}

function isShortRubyRowDisplay(style: CSSStyleDeclaration): boolean {
    return style.display.includes('flex')
        || style.display.includes('grid')
        || style.display === 'block'
        || style.display === 'flow-root'
        || style.display === 'list-item'
        || style.display === 'table'
        || style.display === 'table-row'
        || style.display === 'table-cell'
        || style.display === 'inline-block';
}

function boxActuallyCrops(box: HTMLElement, mirror: HTMLElement | null): boolean {
    return box.scrollHeight > box.clientHeight + 1
        || rubyBottomOverflow(box, mirror) > 1
        || rubyTouchesBoxTop(box, mirror)
        || rubyMirrorBlockOverflow(box, mirror) > 1;
}

function rubyRoomHeight(box: HTMLElement, mirror: HTMLElement | null): number {
    // Furigana is painted by the absolutely-positioned text mirror, which is
    // out of flow and so never raises box.scrollHeight. Its scrollHeight is the
    // true rendered height of the furigana'd, wrapped text, so use it as a floor
    // — otherwise a two-line furigana'd title reserves only its base-line height
    // and the top furigana row / wrapped line is cropped. Only the triggering
    // word's OWN mirror may set that floor.
    const owned = ownedRubyMirrorFor(box, mirror);
    const mirrorHeight = owned ? owned.scrollHeight : 0;
    const measuredHeight = Math.max(
        box.scrollHeight,
        box.clientHeight + rubyBottomOverflow(box, mirror) + rubyTopOverflow(box, mirror),
        mirrorHeight,
    );
    const wrappedMirror = mirrorHeight >= RUBY_ROOM_WRAPPED_MIRROR_MIN_HEIGHT_PX
        && mirrorHeight > box.clientHeight + RUBY_ROOM_WRAPPED_MIRROR_MIN_DELTA_PX;
    return Math.ceil(measuredHeight + (wrappedMirror ? RUBY_ROOM_WRAPPED_MIRROR_SETTLE_BUFFER_PX : 0));
}

function rubyMirrorBlockOverflow(box: HTMLElement, mirror: HTMLElement | null): number {
    const owned = ownedRubyMirrorWithRuby(box, mirror);
    if (!owned) return 0;
    return Math.max(0, owned.scrollHeight - box.clientHeight);
}

// Furigana paints ABOVE the base line without growing the line box, so a
// fixed-height overflow-hidden row (a chip label) clips the reading at the
// box TOP while scrollHeight and bottom overflow both read clean. Measure the
// rt annotations directly.
function rubyTopOverflow(box: HTMLElement, mirror: HTMLElement | null): number {
    return Math.max(0, rubyTopOverflowRaw(box, mirror));
}

// Raw signed clearance: positive = the reading pokes above the box top,
// negative = how much breathing room it has. -Infinity when the box has no
// visible annotated word at all.
function rubyTopOverflowRaw(box: HTMLElement, mirror: HTMLElement | null): number {
    const boxRect = box.getBoundingClientRect();
    let overflow = Number.NEGATIVE_INFINITY;
    for (const ruby of box.querySelectorAll<HTMLElement>('ruby')) {
        if (!rubyBelongsToBoxMeasurement(ruby, mirror)) continue;
        const base = ruby.querySelector<HTMLElement>('.jpdb-reader-ruby-base') ?? ruby;
        if (!baseVisibleInBox(base.getBoundingClientRect(), boxRect)) continue;
        const rt = ruby.querySelector<HTMLElement>('rt');
        if (!rt) continue;
        overflow = Math.max(overflow, boxRect.top - rt.getBoundingClientRect().top);
    }
    return overflow;
}

// Geometry measurements may only consult in-flow rubies or rubies inside the
// triggering word's OWN mirror — another host's mirror inside a shared clipped
// ancestor must never supply the growth deficit (RC3 cross-attribution).
function rubyBelongsToBoxMeasurement(ruby: HTMLElement, mirror: HTMLElement | null): boolean {
    const owner = ruby.closest<HTMLElement>('.jpdb-reader-text-mirror');
    return !owner || owner === mirror;
}

function rubyBottomOverflow(box: HTMLElement, mirror: HTMLElement | null): number {
    const boxRect = box.getBoundingClientRect();
    let overflow = 0;
    for (const ruby of box.querySelectorAll<HTMLElement>('ruby')) {
        if (!rubyBelongsToBoxMeasurement(ruby, mirror)) continue;
        const base = ruby.querySelector<HTMLElement>('.jpdb-reader-ruby-base') ?? ruby;
        const baseRect = base.getBoundingClientRect();
        if (!baseVisibleInBox(baseRect, boxRect)) continue;
        overflow = Math.max(overflow, baseRect.bottom - boxRect.bottom);
    }
    return Math.max(0, overflow);
}

function previousRubyRoomHeight(box: HTMLElement): number {
    const value = Number(box.dataset.yomuRubyRoomHeight ?? '');
    return Number.isFinite(value) ? value : 0;
}

function baseVisibleInBox(baseRect: DOMRect, boxRect: DOMRect): boolean {
    return baseRect.bottom > boxRect.top + 1 && baseRect.top < boxRect.bottom - 1;
}
