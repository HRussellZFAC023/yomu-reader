import { primaryCardState } from '../cards/state';
import { cardDeckMembership, cardDeckMembershipClassNames } from '../cards/deck-membership';
import { CORE_COLOR_TOKENS } from '../theme/color-tokens';
import { HAS_JAPANESE, READER_ROOT_SELECTOR } from './constants';
import { escapeHtml, setInnerHtml } from './html';
import { readerWordSurfaceText, sentenceAroundRange, sentenceAroundSurface, unwrapReaderWords } from './reader-word';
import { effectiveFuriganaMode } from '../settings/index';
import type { CardState, JPDBCard, JPDBToken, ReaderSettings } from '../app/types';

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

const KANJI_RE = /[\u3400-\u9fff]/u;
const KANA_CHAR_RE = /[\u3040-\u30ffー・]/u;
const KANA_RE = /^[\u3040-\u30ffー・]+$/u;
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
const EASY_FURIGANA_KANJI = new Set(
    '一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒'
        .split(''),
);
// Shared building blocks for the four skip-selector lists below. Each list composes the common
// BASE entries with whichever extra clusters apply; the joined string must stay set-equal to the
// hand-written original for each list (entry order does not affect matching).
// UT-64: jpdb.io structural widgets. The pitch diagram is per-mora
// letter soup, but "Kanji used" spellings are real JPDB links and should
// keep the same ruby/color treatment as other dictionary terms.
const selectorPairs = (names: string, attributes = ['class', 'id']): string => names.split(',').flatMap(name => attributes.map(attribute => `[${attribute}*="${name}" i]`)).join(',');
const roleSelectors = (names: string): string => names.split(',').map(name => `[role="${name}"]`).join(',');
const EDITABLE_FRAGMENT_ROOT_SELECTOR = '[contenteditable="true"],textarea,input,[role="textbox"]';
const EDITABLE_TEXT_SURFACE_SELECTOR = `[contenteditable],[role=textbox],[role=searchbox],[role=combobox],[aria-multiline],[aria-placeholder],[data-placeholder],[data-slate-editor],[data-lexical-editor],[class*="placeholder" i],[class*="ProseMirror" i]`;
const BASE_SKIP_SELECTOR = `script,style,noscript,textarea,input,select,option,svg,use,[aria-hidden=true],${EDITABLE_TEXT_SURFACE_SELECTOR},[role=checkbox],[role=radio],[role=tab],[data-jpdb-reader-surface-ignore],[data-audio],[class*="audio" i],[class*="sound" i],[class*="speaker" i],[class*="voice" i],.jpdb-reader-text-mirror,.jpdb-reader-control-text-mirror,.jpdb-reader-canvas-text-layer,.jpdb-reader-word,.subsection-pitch-accent .subsection`;
const BASE_SKIP_SELECTOR_WITHOUT_TAB = BASE_SKIP_SELECTOR.replace(',[role=tab]', '');
const FORM_BOUNDARY_SKIP_SELECTOR = 'form,label,fieldset,legend';
const GENERIC_CONTROL_TEXT_SKIP_SELECTOR = `${FORM_BOUNDARY_SKIP_SELECTOR},[role=form],[role=search]`;
const PLAYER_CHROME_SKIP_SELECTOR = selectorPairs('control,toggle,player', ['class']);

const SKIP_SELECTOR = `${BASE_SKIP_SELECTOR},${FORM_BOUNDARY_SKIP_SELECTOR},button,summary,rt,rp`;
const PITCH_CLASSES = new Set('heiban,atamadaka,nakadaka,odaka,kifuku'.split(','));
const PARTICLE_SURFACE_RE = /^[のはをがにでへもとやかねよな]$/u;
const MINING_INSIGHT_UNKNOWN_STATES = new Set<CardState>(['new', 'not-in-deck', 'in-deck']);
const MINING_INSIGHT_MIN_CARD_COUNT = 3;
// UT-47: the per-group state families behind "hide furigana for …" —
// configurable through settings.furiganaHiddenStateGroups.
const FURIGANA_GROUP_STATES: Record<ReaderSettings['furiganaHiddenStateGroups'][number], readonly CardState[]> = {
    new: ['new', 'not-in-deck', 'in-deck'],
    learning: ['learning', 'young'],
    known: ['known', 'mature', 'mastered', 'never-forget', 'redundant'],
    due: ['due'],
    failed: ['failed'],
};

function furiganaHiddenStates(settings: ReaderSettings): Set<CardState> {
    const states = new Set<CardState>();
    for (const group of settings.furiganaHiddenStateGroups) {
        for (const state of FURIGANA_GROUP_STATES[group] ?? []) states.add(state);
    }
    return states;
}

export function shouldHideFuriganaForCardState(settings: ReaderSettings, state: CardState): boolean {
    const mode = effectiveFuriganaMode(settings);
    if (mode === 'off') return true;
    return mode === 'known-status' && furiganaHiddenStates(settings).has(state);
}

const FRAGMENT_SKIP_SELECTOR = `${BASE_SKIP_SELECTOR},${FORM_BOUNDARY_SKIP_SELECTOR},button,summary,[data-jpdb-reader-root]`;
const HARD_FRAGMENT_SKIP_SELECTOR = `${BASE_SKIP_SELECTOR},${FORM_BOUNDARY_SKIP_SELECTOR},${PLAYER_CHROME_SKIP_SELECTOR},[data-jpdb-reader-root]`;
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
const TAB_CHROME_FRAGMENT_SKIP_SELECTOR = `${BASE_SKIP_SELECTOR_WITHOUT_TAB},${FORM_BOUNDARY_SKIP_SELECTOR},${PLAYER_CHROME_SKIP_SELECTOR},[data-jpdb-reader-root]`;
const PLAYER_CHROME_FREE_TAB_CHROME_FRAGMENT_SKIP_SELECTOR = `${BASE_SKIP_SELECTOR_WITHOUT_TAB},${FORM_BOUNDARY_SKIP_SELECTOR},[data-jpdb-reader-root]`;
const FORM_CHROME_FRAGMENT_SKIP_SELECTOR = `${BASE_SKIP_SELECTOR},${PLAYER_CHROME_SKIP_SELECTOR},button,summary,a[href],[role="button"]`;
// The reader's own furigana mirror must never be re-ingested by a rescan.
// BASE_SKIP_SELECTOR already skips it, but the passive-interaction path (used
// for every site profile root, incl. YouTube) once did not — so a rescan of a
// mirror host re-collected the mirror's bare gap text nodes alongside hidden
// host text and self-perpetuated into a duplicated, flashing caption strip.
const PASSIVE_AWARE_FRAGMENT_SKIP_SELECTOR = `script,style,noscript,textarea,input,select,option,svg,use,[hidden],[aria-hidden="true"],${EDITABLE_TEXT_SURFACE_SELECTOR},.jpdb-reader-text-mirror,.jpdb-reader-control-text-mirror,.jpdb-reader-canvas-text-layer,.jpdb-reader-word,.subsection-pitch-accent .subsection,[data-jpdb-reader-root]`;
const FORM_CHROME_BOUNDARY_TAGS = ',FORM,LABEL,FIELDSET,LEGEND,';
const UI_CLASS_RE = /(^|[-_\s])(audio|badge|chip|control|icon|label|play|required|sound|speaker|tab|tag)([-_\s]|$)/i;
const PROSE_CLASS_RE = /(^|[-_\s])(body|content|copy|description|lead|paragraph|prose|text|txt)([-_\s]|$)/i;
const CONVERSATION_TEXT_CLASS_RE = /(^|\s)(chat|comment|message|post|reply)(?:[-_\s]*(body|bubble|content|copy|message|text|txt))?(?:_[a-z0-9]+)?(?=$|\s)/i;
const READABLE_PROSE_CONTAINER_SELECTOR = 'article,main,[role=main],[role=article]';
const DISPLAY_HEADING_RE = /^H[1-6]$/;
const DISPLAY_HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6';
const PASSIVE_INTERACTION_SELECTOR = `a[href],button,summary,label,${roleSelectors('button,link,menuitem,option,tab,checkbox,radio,switch')},[aria-controls],[aria-expanded],[slot="more-button"],.more-button,#more,#less`;
const COMPACT_PASSIVE_INTERACTION_SELECTOR = `[onclick],[tabindex]:not([tabindex="-1"]),${selectorPairs('audio,button,control,play,sound,speaker,toggle', ['class'])}`;
const COMPACT_PASSIVE_CHROME_SELECTOR = `time,[datetime],[aria-label*="author" i],[aria-label*="username" i],${selectorPairs('author,byline,display-name,handle,header,meta,nickname,screen-name,user-name,username', ['class'])}`;
const PASSIVE_INTERACTION_BOUNDARY_SELECTOR = `${PASSIVE_INTERACTION_SELECTOR},${COMPACT_PASSIVE_INTERACTION_SELECTOR},${COMPACT_PASSIVE_CHROME_SELECTOR}`;
const RICH_YOUTUBE_RUBY_ALLOWED_SELECTOR = 'ytd-watch-metadata,ytm-watch-metadata,ytm-slim-video-metadata-section-renderer,ytm-expandable-video-description-body-renderer,ytm-structured-description-content-renderer,ytd-comment-view-model,ytd-comments,ytd-transcript-segment-renderer,ytm-transcript-segment-renderer,yt-live-chat-renderer,yt-live-chat-text-message-renderer,yt-live-chat-paid-message-renderer,yt-live-chat-membership-item-renderer';
const YOUTUBE_FEEDBACK_CHROME_SELECTOR = 'yt-touch-feedback-shape[aria-hidden=true],yt-interaction[aria-hidden=true]';
const COMPACT_INTERACTIVE_CHROME_CONTROL_SELECTOR = `button,label,summary,${roleSelectors('button,tab,menuitem,option,checkbox,radio,switch')}`;
const COMPACT_INTERACTIVE_CHROME_LINK_SELECTOR = 'a[href], [role="link"]';
const COMPACT_INTERACTIVE_CHROME_SELECTOR = `${COMPACT_INTERACTIVE_CHROME_CONTROL_SELECTOR}, ${COMPACT_INTERACTIVE_CHROME_LINK_SELECTOR}`;
const COMPACT_INTERACTIVE_CHROME_CONTEXT_SELECTOR = `header,nav,footer,[role="banner"],[role="navigation"],[role="contentinfo"],[role="dialog"],[role="listbox"],[role="menu"],[role="menubar"],[role="tablist"],[role="toolbar"],[aria-modal="true"],${selectorPairs('account,chooser,dialog,dropdown,login,menu,modal,picker,profile,signin,toolbar')}`;
const MEDIA_CAROUSEL_CLASS_RE = /banner|carousel|rail|scroll|shelf|slick|slider|splide|swiper/i;
const EXPLICIT_MEDIA_CAROUSEL_CLASS_RE = /carousel|rail|shelf|slick|slider|splide|swiper/i;
const COMPACT_INTERACTIVE_CHROME_TEXT_LIMIT = 60;
const COMPACT_INTERACTIVE_CHROME_MAX_WIDTH = 320;
const COMPACT_INTERACTIVE_CHROME_MAX_HEIGHT = 96;
const COMPACT_VERTICAL_CHROME_MAX_WIDTH = 96;
const COMPACT_VERTICAL_CHROME_MAX_HEIGHT = 360;
const COMPACT_MEDIA_CONTEXT_ANCESTOR_LIMIT = 10;
const CONSTRAINED_NOTIFICATION_TEXT_LIMIT = 180;
const CONSTRAINED_NOTIFICATION_MAX_HEIGHT = 150;
const CONSTRAINED_NOTIFICATION_SELECTOR = `[role="alert"],[role="status"],[role="region"],[aria-live],${selectorPairs('alert,banner,notice,notification,snackbar,toast', ['class'])},${selectorPairs('assistant,prompt,question', ['class', 'id'])}`;
const COMPACT_PASSIVE_INTERACTION_TEXT_LIMIT = 120;
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

interface KanjiNavigationRenderOptions {
    enabled: boolean;
    label: string;
}

interface RubyKanaAnchor {
    text: string;
    baseStart: number;
    baseEnd: number;
    readingStart: number;
    readingEnd: number;
}

interface RubyBaseKanaRun {
    text: string;
    baseStart: number;
    baseEnd: number;
}

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
    visibility: string;
    visibilityPriority: string;
    overflow: string;
    overflowPriority: string;
    overflowAdjusted: boolean;
    position: string;
    positionPriority: string;
    positioned: boolean;
    display: string;
    displayPriority: string;
    displayAdjusted: boolean;
    /** Styled hosts hide TEXT only (transparent colour) so their own box
     * paint — background, border, pseudo-elements, icons — keeps rendering
     * under the mirror; bare hosts use plain visibility:hidden. */
    concealTextOnly: boolean;
    concealedText: ConcealedTextRecord[];
}

interface ConcealedTextRecord {
    element: HTMLElement;
    values: Array<{ property: string; value: string; priority: string }>;
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

export function documentHasJapaneseText(limit = 200000): boolean {
    if (!document.body) return false;
    return textWalkerHasJapanese(visibleTextWalker(document.body), limit);
}

function visibleTextWalker(root: HTMLElement): TreeWalker {
    return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: visibleTextNodeFilter });
}

function visibleTextNodeFilter(node: Node): number {
    return canInspectTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
}

function canInspectTextNode(node: Node): boolean {
    const parent = node.parentElement;
    if (!parent || parent.closest(READER_ROOT_SELECTOR)) return false;
    const blocked = parent.closest(SKIP_SELECTOR);
    if (!blocked) return true;
    return isAnnotatableChipControl(blocked);
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
    const control = blocked.closest(ANNOTATABLE_CONTROL_SELECTOR) ?? blocked;
    if (isComposerActionControl(control)) return false;
    const text = control.textContent?.replace(/\s+/g, '').trim() ?? '';
    return text.length > 0 && text.length <= CONTROL_LABEL_TEXT_LIMIT && HAS_JAPANESE.test(text);
}

function isComposerActionControl(control: Element): boolean {
    return !!control.parentElement?.closest('[class*=composer i],[id*=composer i]')?.querySelector(EDITABLE_FRAGMENT_ROOT_SELECTOR);
}

function textWalkerHasJapanese(walker: TreeWalker, limit: number): boolean {
    let inspected = 0;
    let node: Node | null;
    while ((node = walker.nextNode())) {
        const text = nodeTextContent(node);
        if (HAS_JAPANESE.test(text)) return true;
        inspected = inspectedTextLength(inspected, text);
        if (inspected >= limit) return false;
    }
    return false;
}

function nodeTextContent(node: Node): string {
    return node.textContent ?? '';
}

function inspectedTextLength(inspected: number, text: string): number {
    return inspected + text.length;
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
    return HAS_JAPANESE.test(text);
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
    if (blocked && !isAnnotatableChipControl(blocked)) return true;
    if (isInsideExcludedReaderRoot(parent, options)) return true;
    if (isShortCenteredDisplayHeading(parent, text)) return true;
    return shouldRejectTextTargetPresentation(parent, text, visibleOnly);
}

function isCompactControlDescendantTextTarget(parent: HTMLElement, text: string): boolean {
    if (!isCompactInteractiveChromeText(text.replace(/\s+/g, ''))) return false;
    return Boolean(compactInteractiveChromeElement(parent) ?? compactPassiveChromeElement(parent));
}

function isInsideExcludedReaderRoot(parent: HTMLElement, options: TextTargetCollectionOptions): boolean {
    if (options.includeReaderRoot) return false;
    return Boolean(parent.closest(READER_ROOT_SELECTOR));
}

function shouldRejectTextTargetPresentation(parent: HTMLElement, text: string, visibleOnly: boolean): boolean {
    if (shouldRejectInvisibleTextTarget(parent, visibleOnly)) return true;
    return isFragileUiText(parent, text);
}

function shouldSkipTextTargetParent(parent: HTMLElement): boolean {
    return parent.childNodes.length > 6;
}

function shouldRejectInvisibleTextTarget(parent: HTMLElement, visibleOnly: boolean): boolean {
    if (!visibleOnly) return false;
    return !isVisible(parent);
}

function textTargetFromAcceptedNode(node: Node): TextTarget | null {
    const parent = node.parentElement;
    if (!parent) return null;
    const suppressRuby = shouldSuppressCompactScanRuby(parent);
    const passiveInteraction = isPassiveInteractionElement(parent) || suppressRuby;
    const text = nodeTextContent(node).trim();
    return {
        node: node as Text,
        text,
        parent,
        hasNativeRuby: Boolean(parent.closest('ruby')),
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
        .filter(text => HAS_JAPANESE.test(text));
    const compactOptionList = compactSelectOptionListText(optionTextList);
    return compactOptionList || selectedText.join(' / ');
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
    if (!normalized || !HAS_JAPANESE.test(normalized) || parts.includes(normalized)) return;
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
    return compact > 0 && compact <= FORM_CONTROL_TEXT_MAX_LENGTH && HAS_JAPANESE.test(text);
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
    const suppressRuby = fragmentTargetSuppressesCompactScanRuby(parent, trimmedFragments);
    const passiveInteraction = suppressRuby || trimmedFragments.every(fragment => fragment.passiveInteraction);
    return {
        text,
        parent,
        fragments: trimmedFragments,
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

function fragmentTargetSuppressesCompactScanRuby(parent: HTMLElement, fragments: TextFragment[]): boolean {
    if (shouldSuppressCompactScanRuby(parent)) return true;
    return fragments.some(fragment => {
        const element = fragment.node.parentElement;
        return Boolean(element && shouldSuppressCompactScanRuby(element));
    });
}

function isCollectableFragmentText(
    text: string,
    fragments: TextFragment[],
    options: FragmentTextTargetCollectionOptions,
): boolean {
    if (!HAS_JAPANESE.test(text)) return false;
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
    if (shouldIgnoreFragmentElement(element, state.options)) return;
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

// Phase 1 caps shadow traversal at ONE boundary: shadow-of-shadow is rare in
// UI-label web components and is left for a later phase. Raising this alone
// enables deeper recursion, but re-audit perf/observer bounds before doing so.
const SHADOW_SCAN_MAX_DEPTH = 1;

function visitFragmentShadowRoot(element: HTMLElement, state: FragmentTextCollectionState): void {
    if (state.shadowDepth >= SHADOW_SCAN_MAX_DEPTH) return;
    // element.shadowRoot is null for a closed root (mode:'closed') — silently
    // skip, it is unreachable and not an error.
    const shadowRoot = element.shadowRoot;
    if (!shadowRoot) return;
    // Fast path: never walk a shadow root with no Japanese. reddit renders ~155
    // shadow hosts per page, most Latin-only; this gate keeps them cheap.
    if (!HAS_JAPANESE.test(shadowRoot.textContent ?? '')) return;
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
    if (fragmentCollectionComplete(state)) return;
    // A <slot> projects light-DOM children into the shadow tree, but those text
    // nodes are ALREADY walked in the light-DOM pass above (their real parent is
    // in light DOM). Walking shadowRoot.childNodes reaches a <slot>'s fallback
    // content only, never projected light-DOM nodes, so slotted content is never
    // annotated twice.
    state.shadowDepth += 1;
    for (const child of Array.from(shadowRoot.childNodes)) {
        visitFragmentNode(child, state, false);
        if (fragmentCollectionComplete(state)) break;
    }
    flushFragmentTextTarget(state);
    state.shadowDepth -= 1;
}

function shouldIgnoreFragmentElement(
    element: HTMLElement,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    return isRubyAnnotationElement(element)
        || isSurfaceIgnoredElement(element)
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
    if (state.excludeSelector && safeElementMatches(element, state.excludeSelector)) return true;
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
    return visibleOnly && !isVisible(element) && !hasVisibleTextMirror(element);
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
    if (options.includePassiveInteractions) return safeElementMatches(element, PASSIVE_AWARE_FRAGMENT_SKIP_SELECTOR);
    if (options.includeFormChrome) return safeElementMatches(element, FORM_CHROME_FRAGMENT_SKIP_SELECTOR);
    if (options.includeTabChrome) {
        // ISS-11: YouTube parses player/control/toggle wrappers — drop only the
        // PLAYER_CHROME_SKIP_ENTRIES globs, keep every other tab-chrome guard.
        return safeElementMatches(element, options.includePlayerChrome
            ? PLAYER_CHROME_FREE_TAB_CHROME_FRAGMENT_SKIP_SELECTOR
            : TAB_CHROME_FRAGMENT_SKIP_SELECTOR);
    }
    if (options.includeUiChrome) {
        return safeElementMatches(element, options.includePlayerChrome
            ? PLAYER_CHROME_FREE_HARD_FRAGMENT_SKIP_SELECTOR
            : HARD_FRAGMENT_SKIP_SELECTOR);
    }
    return safeElementMatches(element, FRAGMENT_SKIP_SELECTOR);
}

function isFragmentParagraphBoundary(
    element: HTMLElement,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    return isPassiveInteractionBoundaryElement(element, options)
        || (options.includeFormChrome && FORM_CHROME_BOUNDARY_TAGS.includes(`,${element.tagName},`))
        || isParagraphBoundary(element);
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
            return HAS_JAPANESE.test(node.textContent ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
    });
    return Boolean(walker.nextNode());
}

export function isPassiveInteractionElement(element: Element): boolean {
    if (element.closest(READER_ROOT_SELECTOR)) return false;
    if (element instanceof HTMLElement && isReadableProseContext(element) && !readableContextPassiveChromeElement(element)) return false;
    if (element.closest(PASSIVE_INTERACTION_SELECTOR)) return true;
    const compactInteraction = element.closest<HTMLElement>(COMPACT_PASSIVE_INTERACTION_SELECTOR);
    if (compactInteraction && isCompactPassiveInteractionElement(compactInteraction)) return true;
    const compactChrome = element.closest<HTMLElement>(COMPACT_PASSIVE_CHROME_SELECTOR);
    return Boolean(compactChrome && isCompactPassiveChromeElement(compactChrome));
}

function isCompactPassiveInteractionElement(element: HTMLElement): boolean {
    const text = element.textContent?.replace(/\s+/g, '').trim() ?? '';
    if (!text || text.length > COMPACT_PASSIVE_INTERACTION_TEXT_LIMIT) return false;
    return element.childElementCount <= 4;
}

function isCompactPassiveChromeElement(element: HTMLElement): boolean {
    if (isLikelyProseElement(element)) return false;
    return isCompactPassiveInteractionElement(element);
}

function readableContextPassiveChromeElement(element: HTMLElement): HTMLElement | null {
    const interaction = element.closest<HTMLElement>(PASSIVE_INTERACTION_SELECTOR);
    if (interaction) {
        if (isConversationTextClass(interaction)) return null;
        if (safeElementMatches(interaction, 'a[href],[role="link"]')) return interaction;
        if (isCompactPassiveInteractionElement(interaction)) return interaction;
    }
    const compactInteraction = element.closest<HTMLElement>(COMPACT_PASSIVE_INTERACTION_SELECTOR);
    if (compactInteraction && !isConversationTextClass(compactInteraction) && isCompactPassiveInteractionElement(compactInteraction)) return compactInteraction;
    const compactChrome = element.closest<HTMLElement>(COMPACT_PASSIVE_CHROME_SELECTOR);
    return compactChrome && isCompactPassiveChromeElement(compactChrome) ? compactChrome : null;
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

// A clipped single-line ellipsis row (m.youtube titles, channel bylines) is
// sized for exactly one plain text line: ruby makes the line taller, the clip
// swallows the base text, and the row shows only furigana. Height is no
// exemption here — the row grows with whatever the line box becomes.
function isEllipsisTextRow(style: CSSStyleDeclaration): boolean {
    if (!clipsOverflow(style) || !style.textOverflow.includes('ellipsis')) return false;
    return style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre' || style.display === '-webkit-box';
}

function hasLineClamp(style: CSSStyleDeclaration): boolean {
    const clamp = style.getPropertyValue('-webkit-line-clamp').trim();
    return Boolean(clamp && clamp !== 'none' && clamp !== '0');
}

function hasClippedTextConstraint(style: CSSStyleDeclaration): boolean {
    if (!clipsOverflow(style)) return false;
    return hasDefiniteCssSize(style.height)
        || hasDefiniteCssSize(style.maxHeight)
        || style.display === '-webkit-box';
}

function isPositionedTextOverlay(style: CSSStyleDeclaration): boolean {
    return (style.position === 'absolute' || style.position === 'fixed')
        && (hasDefiniteCssSize(style.height) || hasDefiniteCssSize(style.maxHeight))
        && (hasDefiniteCssSize(style.width) || hasDefiniteCssSize(style.maxWidth));
}

function clipsOverflow(style: CSSStyleDeclaration): boolean {
    return style.overflow === 'hidden'
        || style.overflow === 'clip'
        || style.overflowY === 'hidden'
        || style.overflowY === 'clip';
}

function hasDefiniteCssSize(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return Boolean(normalized
        && normalized !== 'auto'
        && normalized !== 'none'
        && normalized !== 'normal'
        && normalized !== 'initial'
        && normalized !== 'inherit'
        && normalized !== 'unset');
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
    if (isFragmentTextTarget(target)) return isCurrentFragmentScanTarget(target);
    return target.parent.isConnected
        && target.node.isConnected
        && target.node.parentElement === target.parent
        && (target.node.textContent ?? '').trim() === target.text;
}

function isCurrentFragmentScanTarget(target: FragmentTextTarget): boolean {
    if (!target.parent.isConnected) return false;
    if (target.controlTextMirror) return formControlLookupText(target.parent, { selectTextMode: target.controlSelectTextMode }) === target.text;
    if (!target.fragments.length) return Boolean(target.nonDestructive && HAS_JAPANESE.test(target.text));
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
// never repeats identically. For framework-owned LIVE regions we therefore render
// non-destructively up front: the overlay mirror never mutates the framework's nodes,
// so it keeps full ownership and re-renders freely. Scoped to conversation/message
// surfaces (the streaming category) so static framework article pages keep the
// higher-fidelity inline destructive paint and the reactive guards still cover the rest.
const FRAMEWORK_OWNERSHIP_KEY_RE = /^(?:__reactFiber\$|__reactProps\$|__reactInternalInstance\$|__reactContainer\$|__vue__|__vnode|__vueParentComponent|__ngContext__|__svelte)/;
const FRAMEWORK_OWNERSHIP_ANCESTOR_LIMIT = 6;
const LIVE_FRAMEWORK_CHAT_HOST_SELECTOR = '[data-message-author-role],[data-message-id],[data-testid*="conversation-turn" i],[data-testid*="chat-message" i],[data-testid*="message-content" i],[data-testid*="message-bubble" i],[data-test-id*="chat-message" i],[data-test-id*="message-content" i],.markdown,.markdown-body,.markdown-content,.message,.message-body,.message-content,.messageContent,.chat-message,.conversation-turn,.model-response,.model-response-text,.response-content,.font-claude-message';
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

function hostInConversationContext(host: HTMLElement): boolean {
    if (host.closest(LIVE_FRAMEWORK_CHAT_HOST_SELECTOR)) return true;
    let current: HTMLElement | null = host;
    for (let depth = 0; current && depth < FRAMEWORK_OWNERSHIP_ANCESTOR_LIMIT; depth++, current = current.parentElement) {
        if (isConversationTextClass(current)) return true;
    }
    return false;
}

function scanHostIsLiveFrameworkRegion(host: HTMLElement): boolean {
    // Never overlay a mirror inside a rich-text editor; that would corrupt the
    // composer (already skipped at collection, guarded here for defence in depth).
    if (host.closest('[contenteditable="true"]')) return false;
    if (!elementIsFrameworkManaged(host)) return false;
    return hostInConversationContext(host);
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
        applyTokensToNonDestructiveScanTarget(target, tokens, settings);
        return;
    }
    const nonDestructiveHost = nonDestructiveScanHost(target);
    const liveFrameworkRegion = !target.nonDestructive && scanHostIsLiveFrameworkRegion(nonDestructiveHost);
    const repaintLooping = !target.nonDestructive && !liveFrameworkRegion
        ? scanHostIsRepaintLooping(nonDestructiveHost, target.text)
        : false;
    const canUseRepaintLoopMirror = !(target.forceInlineRender && target.suppressRepaintLoopMirror);
    // Constrained rows (line-clamp, ellipsis, sub-line clips) cannot take
    // in-place ruby on engines where it collapses or grows the clip window —
    // the absolutely-positioned mirror sizes its own line above the host, so
    // those rows keep full furigana instead of a suppressed reading.
    const constrainedRubyHost = !target.nonDestructive && !liveFrameworkRegion
        && rubyDistortsConstrainedRows() && isInsideRubyFragileConstrainedRow(nonDestructiveHost)
        // Only visually-bare hosts may be mirror-hidden: a styled host (pill
        // background, border, chevron SVG, ::before separator) would lose its
        // box paint with visibility:hidden — the bloomee bug class. Styled
        // constrained rows render in place with the reading suppressed.
        && hostIsVisuallyBareForMirror(nonDestructiveHost);
    const canUseRequestedNonDestructiveMirror = target.nonDestructive && !nonDestructiveTargetShouldRenderInline(target, nonDestructiveHost);
    if ((!target.forceInlineRender || (repaintLooping && canUseRepaintLoopMirror))
        && (canUseRequestedNonDestructiveMirror || liveFrameworkRegion || repaintLooping || constrainedRubyHost)) {
        applyTokensToNonDestructiveScanTarget(target, tokens, settings);
        return;
    }
    if (isFragmentTextTarget(target)) applyTokensToFragmentTarget(target, tokens, settings);
    else applyTokensToTextNode(target, tokens, settings);
}

function nonDestructiveTargetShouldRenderInline(target: ScanTextTarget, host: HTMLElement): boolean {
    if (!isFragmentTextTarget(target)) return false;
    if (!target.fragments.length) return false;
    if (scanHostIsLiveFrameworkRegion(host)) return false;
    return targetLeavesVisibleBlockDescendantTextUncovered(target, host);
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
    const safeTokens = nonOverlappingTokens(tokens, text.length);
    if (!safeTokens.length) return;

    const fragment = renderTokenizedTextFragment(target, safeTokens, settings);
    registerDestructivePaintTextNodes(fragment);
    target.node.replaceWith(fragment);
    markRenderedScanTarget(target);
}

function renderTokenizedTextFragment(target: TextTarget, tokens: JPDBToken[], settings: ReaderSettings): DocumentFragment {
    const fragment = renderTokenizedScanText(target.text, tokens, settings, {
        parent: target.parent,
        hasNativeRuby: target.hasNativeRuby,
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
    target: { parent: HTMLElement; hasNativeRuby?: boolean; suppressRuby?: boolean; proseWrap?: boolean; passiveInteraction?: boolean; suppressRubyDoesNotImplyPassive?: boolean; mirrorRender?: boolean },
): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const suppressRuby = scanTargetSuppressesRuby(target.parent, target.suppressRuby, !target.mirrorRender);
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
            allowRuby: !target.hasNativeRuby && !suppressRuby,
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
): { text: string; tokens: JPDBToken[] } {
    const fragments = nonDestructiveTargetFragments(target);
    const { hostText, nodeOffsets } = hostOriginalTextWithNodeOffsets(host);
    if (!fragments.length || !hostText || collapsedTextKey(hostText) === collapsedTextKey(target.text)) {
        return { text: target.text, tokens };
    }
    const indexed = indexTextFragments(fragments);
    const remapped = tokens
        .map(token => remapTokenIntoHostText(token, indexed, nodeOffsets, hostText))
        .filter((token): token is JPDBToken => token !== null);
    return { text: hostText, tokens: nonOverlappingTokens(remapped, hostText.length) };
}

function collapsedTextKey(text: string): string {
    return text.replace(/\s+/gu, '');
}

// Text the host never paints must not reach the mirror either — the mirror
// replaces the host's visible rendering, so mirroring script/[hidden] text
// would paint duplicate labels the page keeps invisible. aria-hidden stays
// included: it hides from the a11y tree only and is often visually rendered.
const MIRROR_PLAN_TEXT_SKIP_SELECTOR = `${READER_OWNED_TEXT_SELECTOR},script,style,noscript,template,[hidden]`;

// The host's source text in document order, skipping any reader-owned subtree (a
// prior mirror / annotated word / reader root) and never-painted nodes so the
// mirror renders — and re-scans compare against — the page's visible text.
function hostOriginalTextWithNodeOffsets(host: HTMLElement): { hostText: string; nodeOffsets: Map<Text, number> } {
    const nodeOffsets = new Map<Text, number>();
    let hostText = '';
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
        acceptNode: node => node.parentElement?.closest(MIRROR_PLAN_TEXT_SKIP_SELECTOR)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        nodeOffsets.set(node as Text, hostText.length);
        hostText += (node as Text).data;
    }
    return { hostText, nodeOffsets };
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

function applyTokensToNonDestructiveScanTarget(target: ScanTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    const host = nonDestructiveScanHost(target);
    if (!host.isConnected) return;

    const plan = nonDestructiveHostRenderPlan(host, target, nonOverlappingTokens(tokens, target.text.length));
    const text = plan.text;
    const safeTokens = plan.tokens;
    const renderPlan = whitespaceCollapsedNonDestructiveRender(text, safeTokens);
    const suppressRuby = scanTargetSuppressesRuby(host, target.suppressRuby, false);
    const renderSettings = furiganaSettingsForTarget(settings, host);
    const signature = nonDestructiveScanSignature(target, safeTokens, renderSettings, suppressRuby);
    const existing = currentTextMirror(host);
    if (existing?.dataset.sourceText === text && existing.dataset.renderSignature === signature) {
        const state = textMirrorHosts.get(host);
        if (state) reassertTextMirrorHostStyles(host, state);
        return;
    }
    removeTextMirror(host);
    if (!safeTokens.length) return;

    const mirror = document.createElement('span');
    mirror.className = 'jpdb-reader-text-mirror';
    mirror.dataset.jpdbReaderTextMirror = 'true';
    mirror.dataset.sourceText = text;
    mirror.dataset.renderSignature = signature;
    // The mirror is a full duplicate of the host text. Hide it from the a11y
    // tree so screen readers (and copy that respects it) skip the duplicate;
    // paired with user-select:none in CSS this keeps Cmd+A/copy grabbing only
    // the clean original host text instead of doubled/garbled clipboard.
    mirror.setAttribute('aria-hidden', 'true');
    const hasRenderedRuby = !suppressRuby && safeTokens.some(token => token.rubies.length > 0);
    const state = styleTextMirrorHost(host, hasRenderedRuby);
    try {
        styleTextMirror(mirror, host, hasRenderedRuby);
        mirror.append(renderTokenizedScanText(renderPlan.text, renderPlan.tokens, renderSettings, {
            parent: host,
            hasNativeRuby: targetHasNativeRuby(target),
            mirrorRender: true,
            suppressRuby,
            passiveInteraction: target.passiveInteraction || suppressRuby,
        }));
        if (!mirror.textContent?.trim()) {
            removeTextMirror(host);
            return;
        }
        hideTextMirrorHost(host, state, mirror);
        host.append(mirror);
        tightenMirrorRubyOverhang(mirror);
        observeTextMirrorHost(host);
    } catch (error) {
        removeTextMirror(host);
        throw error;
    }
}

function whitespaceCollapsedNonDestructiveRender(text: string, tokens: JPDBToken[]): { text: string; tokens: JPDBToken[] } {
    if (!/\s{2,}|\r|\n/u.test(text)) return { text, tokens };
    const { normalized, offsets } = collapseWhitespaceWithOffsets(text);
    if (normalized === text) return { text, tokens };
    return {
        text: normalized,
        tokens: tokens.map(token => remapTokenOffsets(token, offsets, normalized)),
    };
}

function collapseWhitespaceWithOffsets(text: string): { normalized: string; offsets: number[] } {
    const offsets = new Array<number>(text.length + 1);
    let normalized = '';
    let index = 0;
    while (index < text.length) {
        if (/\s/u.test(text[index] ?? '')) {
            const start = index;
            while (index < text.length && /\s/u.test(text[index] ?? '')) index += 1;
            const mapped = normalized.length;
            // A line break between CJK characters carries no space semantics:
            // YouTube's yt-formatted-string wraps 視聴 across a newline, and
            // turning that into "視 聴" splits the word both visually and for
            // the tokenizer. Latin boundaries keep their single space.
            if (normalized.length > 0 && index < text.length
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
// fullwidth forms — the scripts whose soft line breaks carry no space.
function isCjkChar(char: string | undefined): boolean {
    return Boolean(char) && /[　-ヿ㐀-鿿豈-﫿！-｠\u{20000}-\u{3FFFF}]/u.test(char ?? '');
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
function textMirrorBelongsToHost(mirror: HTMLElement, host: HTMLElement): boolean {
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
    const direct = Array.from(host.children)
        .find((child): child is HTMLElement => child instanceof HTMLElement && child.matches(READER_TEXT_MIRROR_SELECTOR));
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
    if (!mirror) return false;
    const source = mirror.dataset.sourceText ?? '';
    return normalizedMirrorHostText(source) === normalizedMirrorHostText(text);
}

function nonDestructiveScanSignature(target: ScanTextTarget, tokens: JPDBToken[], settings: ReaderSettings, suppressRuby = Boolean(target.suppressRuby)): string {
    return JSON.stringify({
        ruby: !suppressRuby,
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
    const safeTokens = nonOverlappingTokens(tokens, text.length);
    const placeholderOverlay = isPlaceholderControlTextMirror(host, text);
    const suppressRuby = placeholderOverlay || scanTargetSuppressesRuby(host, target.suppressRuby, false);
    const renderSettings = furiganaSettingsForTarget(settings, host);
    const signature = nonDestructiveScanSignature(target, safeTokens, renderSettings, suppressRuby);
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
            mirrorRender: true,
            suppressRuby,
            passiveInteraction: target.passiveInteraction,
            suppressRubyDoesNotImplyPassive: placeholderOverlay,
        }));
    if (!mirror.textContent?.trim()) {
        restoreControlTextMirrorHost(host, state);
        return;
    }
    host.insertAdjacentElement('afterend', mirror);
    observeControlTextMirrorHost(host, state);
}

function currentControlTextMirror(host: HTMLElement): HTMLElement | null {
    const sibling = host.nextElementSibling;
    return sibling instanceof HTMLElement && sibling.matches(READER_CONTROL_TEXT_MIRROR_SELECTOR) ? sibling : null;
}

function applyTokensToCanvasFallbackTarget(target: ScanTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    const canvas = target.parent;
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.isConnected) return;
    const host = canvas.parentElement;
    if (!host) return;

    const text = target.text;
    const safeTokens = nonOverlappingTokens(tokens, text.length);
    const n = canvas.parentElement?.classList.contains('lesson-canvas-clipper') ?? false;
    const noRuby = n || Boolean(target.suppressRuby);
    const renderSettings = furiganaSettingsForTarget(settings, canvas);
    const signature = nonDestructiveScanSignature(target, safeTokens, renderSettings, noRuby);
    const existing = currentCanvasFallbackTextLayer(canvas);
    if (existing?.dataset.sourceText === text && existing.dataset.renderSignature === signature) return;
    removeCanvasFallbackTextLayer(canvas);
    if (!safeTokens.length) return;

    const layer = document.createElement('div');
    layer.className = n ? 'jpdb-reader-canvas-text-layer jpdb-reader-native-canvas' : 'jpdb-reader-canvas-text-layer';
    layer.dataset.sourceText = text;
    layer.dataset.renderSignature = signature;
    const hasRuby = safeTokens.some(token => token.rubies.length > 0) && !noRuby;
    styleCanvasFallbackTextLayer(layer, canvas, hasRuby, n);
    layer.append(renderTokenizedScanText(text, safeTokens, renderSettings, {
        parent: canvas,
        hasNativeRuby: targetHasNativeRuby(target),
        mirrorRender: true,
        suppressRuby: noRuby,
        passiveInteraction: n || target.passiveInteraction,
    }));
    if (!layer.textContent?.trim()) return;
    const state = mountCanvasTextLayer(canvas, host, layer, n);
    canvasFallbackTextLayers.set(canvas, state);
    host.append(layer);
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

function scanTargetSuppressesRuby(parent: HTMLElement, suppressRuby?: boolean, inPlace = true): boolean {
    // Yomu-owned surfaces (lookup panel, drawer) may always force readings.
    if (targetForcesAllFurigana(parent) && parent.closest(READER_ROOT_SELECTOR)) return false;
    // Constrained rows only reject IN-PLACE ruby (it collapses or grows the
    // clip window on distorting engines); the absolutely-positioned mirror
    // sizes its own line, so mirrored renders keep the reading. This is an
    // ENGINE-BUG guard: even the page-wide furigana-mode=all attribute must
    // not force in-place ruby into a row the engine will distort.
    if (inPlace && rubyDistortsConstrainedRows() && isInsideRubyFragileConstrainedRow(parent)) return true;
    if (targetForcesAllFurigana(parent)) return false;
    return Boolean(suppressRuby || shouldSuppressCompactScanRuby(parent));
}

function targetForcesAllFurigana(parent: HTMLElement): boolean {
    return Boolean(parent.closest('[data-yomu-furigana-mode="all"]'));
}

// WebKit collapses a -webkit-line-clamp box to a sliver of one line as soon
// as a <ruby> lands inside it (engine bug; Chromium keeps the clamped lines):
// m.youtube community-post bodies showed a half-clipped first line. Probe the
// engine once and keep readings out of clamped boxes where it is broken —
// colour and pitch underlines still render there.
// WebKit also grows the line box when a ruby annotation lands in it (Chromium
// paints the reading without moving the line): in a fixed-height or ellipsis
// row the grown line shifts the base text out of the clip window, so only the
// furigana stays visible (Shorts titles, shelf headings on iPhone). Probe both
// distortions once and keep readings out of constrained rows where either
// bites — colour and pitch underlines still render there.
let rubyDistortsConstrainedRowsCache: boolean | null = null;

/** Test hook: force the constrained-row engine verdict (jsdom cannot measure
 * layout, so the probe always reads healthy there). */
export function setRubyDistortsConstrainedRowsForTest(value: boolean | null): void {
    rubyDistortsConstrainedRowsCache = value;
}
function rubyDistortsConstrainedRows(): boolean {
    if (rubyDistortsConstrainedRowsCache !== null) return rubyDistortsConstrainedRowsCache;
    if (!document.body) return false;
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-9999px;top:0;';
    // The probe ruby carries the real word/furi classes so the measurement
    // reflects Yomu-styled annotations (our rt CSS keeps Chromium's line box
    // from growing; bare native ruby would flag healthy engines too).
    const styledRuby = '<span class="jpdb-reader-word jpdb-reader-scan-word jpdb-reader-has-furi"><ruby><span class="jpdb-reader-ruby-base">漢字</span><rt class="jpdb-reader-furi">かんじ</rt></ruby></span>';
    const clampStyle = 'width:120px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:20px;line-height:1.2;';
    const growStyle = 'font-size:20px;line-height:24px;white-space:nowrap;';
    // Every measurement compares against an identical no-ruby baseline, so
    // environments with mocked or unmeasurable layout (jsdom tests) read as
    // healthy instead of tripping fixed thresholds.
    host.innerHTML = `<div data-yomu-probe="clamp" style="${clampStyle}">${styledRuby}の後に長いテキストが続いて二行目を埋めます</div>`
        + `<div data-yomu-probe="clamp-base" style="${clampStyle}">漢字の後に長いテキストが続いて二行目を埋めます</div>`
        + `<div data-yomu-probe="grow" style="${growStyle}">${styledRuby}</div>`
        + `<div data-yomu-probe="grow-base" style="${growStyle}">漢字</div>`;
    document.body.appendChild(host);
    const measure = (key: string) => host.querySelector(`[data-yomu-probe="${key}"]`)?.getBoundingClientRect().height ?? 0;
    // The verdict is only meaningful once our stylesheet styles the probe rt.
    // Measured before the reader CSS is attached — early boot, iframes,
    // CSP-delayed styles — a HEALTHY engine grows the line under UA-styled
    // ruby and the poisoned verdict would route every clipped row on the page
    // through the mirror forever. Font-size can't discriminate (the UA default
    // rt is already ~50%); .jpdb-reader-furi's user-select:none is a signal no
    // UA stylesheet sets. Without it, skip caching and report only the
    // CSS-independent clamp verdict; the next caller re-probes. jsdom (no
    // real layout) measures 0 everywhere and caches false as before.
    const probeRt = host.querySelector('rt.jpdb-reader-furi');
    const probeRtStyle = probeRt ? safeComputedStyle(probeRt as HTMLElement) : null;
    const rtFontSize = probeRtStyle ? Number.parseFloat(probeRtStyle.fontSize || '0') : 0;
    const readerCssApplied = probeRtStyle?.userSelect === 'none'
        || probeRtStyle?.webkitUserSelect === 'none';
    // A collapsing WebKit clamp measures ~0.66em against 2 baseline lines.
    const collapses = measure('clamp-base') > 0 && measure('clamp') < measure('clamp-base') * 0.6;
    // A line-growing engine renders the fixed 24px line visibly taller.
    const grows = measure('grow-base') > 0 && measure('grow') > measure('grow-base') + 6;
    host.remove();
    if (!readerCssApplied && rtFontSize > 0) return collapses;
    rubyDistortsConstrainedRowsCache = collapses || grows;
    return rubyDistortsConstrainedRowsCache;
}

// Deliberately no display-heading exemption here: on a distorting engine a
// clipped heading loses its base text just like any other constrained row.
// Verdicts are memoized per element for a short window: on the engines where
// the probe fires, this runs for every scan target between DOM writes, and an
// unmemoized ancestor walk (getComputedStyle × 5 + a rect read) forces one
// synchronous reflow per target — seconds of jank per pass on an iPhone.
const constrainedRowVerdicts = new WeakMap<HTMLElement, { at: number; value: boolean }>();
const CONSTRAINED_ROW_VERDICT_TTL_MS = 250;

function isInsideRubyFragileConstrainedRow(element: HTMLElement): boolean {
    const now = Date.now();
    const memo = constrainedRowVerdicts.get(element);
    if (memo && now - memo.at < CONSTRAINED_ROW_VERDICT_TTL_MS) return memo.value;
    let value = false;
    let current: HTMLElement | null = element;
    for (let depth = 0; current && depth < 5; depth += 1) {
        const style = safeComputedStyle(current);
        if (hasLineClamp(style)
            || isEllipsisTextRow(style)
            || (clipsOverflow(style) && (() => {
                const height = current!.getBoundingClientRect().height;
                return height > 0 && height <= 96;
            })())) {
            value = true;
            break;
        }
        current = current.parentElement;
    }
    constrainedRowVerdicts.set(element, { at: now, value });
    return value;
}

// The mirror replaces the HOST's rendering (visibility:hidden), so routing a
// constrained row through it is only safe when the host paints nothing of its
// own: a pill chip's background/border, a nav row's chevron SVG, or a ::before
// separator would all vanish with the host. Styled hosts keep in-place
// rendering (ruby suppression handles the clip) instead of losing their box.
function hostIsVisuallyBareForMirror(host: HTMLElement): boolean {
    if (host.querySelector('svg,img,picture,canvas,video,audio,iframe,input,select,textarea,button,hr')) return false;
    return elementHasNoOwnPaint(host);
}

function elementHasNoOwnPaint(element: HTMLElement): boolean {
    const style = safeComputedStyle(element);
    if (style.backgroundImage !== 'none' && style.backgroundImage !== '') return false;
    const background = style.backgroundColor;
    if (background && background !== 'transparent' && !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(background)) return false;
    if ((style.backgroundClip || '').includes('text') || (style.webkitBackgroundClip || '').includes('text')) return false;
    if (style.boxShadow && style.boxShadow !== 'none') return false;
    if (borderPaints(style)) return false;
    for (const pseudo of ['::before', '::after'] as const) {
        const content = safePseudoContent(element, pseudo);
        if (content && content !== 'none' && content !== 'normal' && content !== '""' && content !== "''") return false;
    }
    return true;
}

function borderPaints(style: CSSStyleDeclaration): boolean {
    return ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
        .some(property => Number.parseFloat(style[property as 'borderTopWidth'] || '0') > 0);
}

function safePseudoContent(element: HTMLElement, pseudo: '::before' | '::after'): string {
    try {
        return getComputedStyle(element, pseudo).content;
    } catch {
        return '';
    }
}

function shouldSuppressCompactScanRuby(parent: HTMLElement): boolean {
    if (parent.closest(READER_ROOT_SELECTOR)) return false;
    if (shouldSuppressCompactMediaRuby(parent)) {
        markCompactMediaPassiveChrome(parent);
        return true;
    }
    const notice = compactConstrainedNotificationElement(parent);
    if (notice) markPassiveChromeElement(notice, true);
    if (isYouTubeHost()) return Boolean(notice);
    const chrome = compactInteractiveChromeElement(parent)
        ?? compactPassiveInteractionRubyElement(parent)
        ?? compactPassiveChromeElement(parent);
    if (chrome) markPassiveChromeElement(chrome, true);
    return Boolean(chrome || notice);
}

function markCompactMediaPassiveChrome(parent: HTMLElement): void {
    const mediaLink = parent.closest<HTMLElement>('a[href],button,[role="link"],[role="button"]');
    const host = mediaLink
        ?? closestCompactMediaContext(parent)
        ?? closestMediaCarousel(parent)?.element
        ?? parent;
    markPassiveChromeElement(host, Boolean(mediaLink && isNavigationChromeContext(mediaLink)));
}

function markPassiveChromeElement(element: HTMLElement, atomic = false): void {
    element.dataset.jpdbReaderPassiveChrome = 'true';
    if (atomic) element.dataset.jpdbReaderPassiveAtomic = 'true';
    if (element.getAttribute('role') === 'button' && !hasExplicitAccessibleName(element)) {
        element.setAttribute('aria-label', passiveChromeAccessibleLabel(element));
    }
}

function hasExplicitAccessibleName(element: HTMLElement): boolean {
    return Boolean(
        element.getAttribute('aria-label')?.trim()
        || element.getAttribute('aria-labelledby')?.trim()
        || element.getAttribute('title')?.trim(),
    );
}

function passiveChromeAccessibleLabel(element: HTMLElement): string {
    return element.textContent?.replace(/\s+/g, ' ').trim() || 'Open item';
}

function compactInteractiveChromeElement(parent: HTMLElement): HTMLElement | null {
    const chrome = parent.closest<HTMLElement>(COMPACT_INTERACTIVE_CHROME_SELECTOR);
    if (!chrome) return null;
    const text = compactInteractiveChromeText(chrome);
    if (!isCompactInteractiveChromeText(text)) return null;
    if (safeElementMatches(chrome, COMPACT_INTERACTIVE_CHROME_LINK_SELECTOR)) {
        return isCompactInteractiveChromeLink(chrome, parent, text) ? chrome : null;
    }
    return isCompactInteractiveChromeControl(chrome, parent) ? chrome : null;
}

function compactInteractiveChromeText(element: HTMLElement): string {
    return element.textContent?.replace(/\s+/g, '').trim() ?? '';
}

function compactPassiveChromeElement(parent: HTMLElement): HTMLElement | null {
    if (isReadableProseContext(parent)) return null;
    if (!isCompactInteractiveChromeContext(parent)) return null;
    const text = compactInteractiveChromeText(parent);
    if (!isCompactInteractiveChromeText(text)) return null;
    return hasCompactInteractiveChromeRubyRisk(parent) ? parent : null;
}

function compactPassiveInteractionRubyElement(parent: HTMLElement): HTMLElement | null {
    if (isReadableProseContext(parent)) return null;
    const interaction = parent.closest<HTMLElement>(COMPACT_PASSIVE_INTERACTION_SELECTOR);
    if (!interaction) return null;
    if (safeElementMatches(interaction, COMPACT_INTERACTIVE_CHROME_SELECTOR)) return null;
    if (isLikelyProseElement(interaction)) return null;
    if (!isCompactPassiveInteractionElement(interaction)) return null;
    const style = safeComputedStyle(interaction);
    if (isVerticalWritingMode(style.writingMode)) return interaction;
    if (isEllipsisTextRow(style) || hasClippedTextConstraint(style)) return interaction;
    if (isCompactInteractiveChromeContext(interaction)) return interaction;
    return hasCompactInteractiveChromeGeometry(interaction) && hasUiBox(style) ? interaction : null;
}

function isCompactInteractiveChromeText(text: string): boolean {
    const length = compactLength(text);
    return length >= 2 && length <= COMPACT_INTERACTIVE_CHROME_TEXT_LIMIT && HAS_JAPANESE.test(text);
}

function isCompactInteractiveChromeLink(link: HTMLElement, parent: HTMLElement, text: string): boolean {
    if (isLikelyProseLink(link, parent)) return false;
    if (isReadableProseContext(parent) && !isCompactInteractiveChromeContext(link)) return false;
    const chromeLike = isCompactInteractiveChromeContext(link)
        || isExplicitControlLink(link)
        || linkHasControlShape(link, text);
    return chromeLike && hasCompactInteractiveChromeRubyRisk(link);
}

function isCompactInteractiveChromeControl(control: HTMLElement, parent: HTMLElement): boolean {
    if (isReadableProseContext(parent) && !isCompactInteractiveChromeContext(control)) return false;
    if (safeElementMatches(control, '[role="button"]') && control.tagName !== 'BUTTON' && !isCompactInteractiveChromeContext(control)) return false;
    const chromeLike = isCompactInteractiveChromeContext(control)
        || hasCompactInteractiveChromeGeometry(control)
        || safeElementMatches(control, '[role="tab"], [role="menuitem"], [role="option"], [role="switch"]');
    return chromeLike && hasCompactInteractiveChromeRubyRisk(control);
}

function isCompactInteractiveChromeContext(element: HTMLElement): boolean {
    return Boolean(element.closest(COMPACT_INTERACTIVE_CHROME_CONTEXT_SELECTOR));
}

function hasCompactInteractiveChromeGeometry(element: HTMLElement): boolean {
    const style = safeComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.width <= COMPACT_INTERACTIVE_CHROME_MAX_WIDTH
        && (rect.height === 0 || rect.height <= COMPACT_INTERACTIVE_CHROME_MAX_HEIGHT)) return true;
    if (isVerticalWritingMode(style.writingMode)
        && rect.width > 0
        && rect.width <= COMPACT_VERTICAL_CHROME_MAX_WIDTH
        && (rect.height === 0 || rect.height <= COMPACT_VERTICAL_CHROME_MAX_HEIGHT)) return true;
    return hasInlineControlShape(style.display) && style.whiteSpace === 'nowrap';
}

function hasCompactInteractiveChromeRubyRisk(element: HTMLElement): boolean {
    const style = safeComputedStyle(element);
    if (isVerticalWritingMode(style.writingMode)) return true;
    if (isEllipsisTextRow(style) || hasClippedTextConstraint(style)) return true;
    if (isCompactInteractiveChromeContext(element)) return true;
    if (safeElementMatches(element, COMPACT_INTERACTIVE_CHROME_CONTROL_SELECTOR)
        && hasCompactInteractiveChromeGeometry(element)) return true;
    if (!hasCompactInteractiveChromeGeometry(element)) return false;
    if (hasDefiniteCssSize(style.height) || hasDefiniteCssSize(style.maxHeight)) return true;
    return clipsOverflow(style) && style.whiteSpace === 'nowrap';
}

function compactConstrainedNotificationElement(parent: HTMLElement): HTMLElement | null {
    if (parent.closest(READER_ROOT_SELECTOR)) return null;
    const textLength = compactLength(parent.textContent ?? '');
    if (textLength < 2 || textLength > CONSTRAINED_NOTIFICATION_TEXT_LIMIT) return null;

    let current: HTMLElement | null = parent;
    for (let depth = 0; current && current !== document.body && current !== document.documentElement && depth < 6; depth++) {
        if (isReadableProseContext(current) && !current.closest(CONSTRAINED_NOTIFICATION_SELECTOR)) return null;
        if (isConstrainedNotificationContainer(current, parent)) return current;
        current = current.parentElement;
    }
    return null;
}

function isConstrainedNotificationContainer(container: HTMLElement, textElement: HTMLElement): boolean {
    if (!isNotificationLikeContainer(container)) return false;
    if (!hasConstrainedNotificationGeometry(container, textElement)) return false;
    return hasNotificationActionPeer(container, textElement);
}

function isNotificationLikeContainer(container: HTMLElement): boolean {
    return safeElementMatches(container, CONSTRAINED_NOTIFICATION_SELECTOR);
}

function hasConstrainedNotificationGeometry(container: HTMLElement, textElement: HTMLElement): boolean {
    const rect = container.getBoundingClientRect();
    const textRect = textElement.getBoundingClientRect();
    return (rect.height === 0 || rect.height <= CONSTRAINED_NOTIFICATION_MAX_HEIGHT)
        && (textRect.height === 0 || textRect.height <= CONSTRAINED_NOTIFICATION_MAX_HEIGHT)
        && !notificationContainerLooksLikePageSection(container);
}

function notificationContainerLooksLikePageSection(container: HTMLElement): boolean {
    const rect = container.getBoundingClientRect();
    if (rect.height > CONSTRAINED_NOTIFICATION_MAX_HEIGHT) return true;
    return Boolean(container.closest('article, main, [role="main"]') && isLikelyProseElement(container));
}

function hasNotificationActionPeer(container: HTMLElement, textElement: HTMLElement): boolean {
    const selector = 'a[href],button,[role="button"],[role="link"],[data-action]';
    if (Array.from(container.querySelectorAll<HTMLElement>(selector)).some(action => !action.contains(textElement))) return true;
    if (container === textElement) return false;
    const row = container.parentElement;
    if (!row) return false;
    return Array.from(row.querySelectorAll<HTMLElement>(selector)).some(action => !container.contains(action));
}

// Media-card/carousel titles are CONTENT, not chrome: they keep furigana and
// pitch decorations at rest (clipped rows grow via makeRoomForRubyInCroppedRows).
// Only YouTube's feedback chrome rows still suppress ruby here — everything
// else routes through the interactive-chrome checks below.
function shouldSuppressCompactMediaRuby(parent: HTMLElement): boolean {
    return isYouTubeFeedbackChromeLinkText(parent);
}

export function isYouTubeHost(): boolean {
    const hostname = location.hostname.toLowerCase();
    return hostname === 'youtube.com'
        || hostname.endsWith('.youtube.com')
        || hostname === 'youtu.be';
}

function isYouTubeFeedbackChromeLinkText(parent: HTMLElement): boolean {
    if (parent.closest(RICH_YOUTUBE_RUBY_ALLOWED_SELECTOR)) return false;
    return Boolean(parent.closest(YOUTUBE_FEEDBACK_CHROME_SELECTOR));
}





function closestMediaCarousel(parent: HTMLElement): { element: HTMLElement; explicit: boolean } | null {
    let current: HTMLElement | null = parent;
    for (let depth = 0; current && current !== document.body && current !== document.documentElement && depth < 8; depth++) {
        const match = mediaCarouselMatch(current);
        if (match && mediaCarouselClipsHorizontally(current) && hasMediaPeer(current, parent)) return { element: current, explicit: match === 'explicit' };
        current = current.parentElement;
    }
    return null;
}

function mediaCarouselMatch(element: HTMLElement): 'explicit' | 'implicit' | null {
    const className = elementClassName(element);
    if (EXPLICIT_MEDIA_CAROUSEL_CLASS_RE.test(className)
        || element.hasAttribute('data-carousel')
        || element.hasAttribute('data-slider')) return 'explicit';
    return MEDIA_CAROUSEL_CLASS_RE.test(className) ? 'implicit' : null;
}

function mediaCarouselClipsHorizontally(element: HTMLElement): boolean {
    const style = safeComputedStyle(element);
    if (style.overflowX === 'hidden' || style.overflowX === 'clip') return true;
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && element.clientWidth > 0) return true;
    return element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1;
}

function isNavigationChromeContext(element: HTMLElement): boolean {
    return Boolean(element.closest('header,nav,footer,[role="banner"],[role="navigation"],[role="contentinfo"]'));
}




function closestCompactMediaContext(parent: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = parent;
    for (let depth = 0; current && current !== document.body && current !== document.documentElement && depth < COMPACT_MEDIA_CONTEXT_ANCESTOR_LIMIT; depth++) {
        if (isReadableProseContext(current)) return null;
        if (hasMediaPeer(current, parent) && isCompactMediaContext(current)) return current;
        current = current.parentElement;
    }
    return null;
}

function isVerticalWritingMode(writingMode: string): boolean {
    return writingMode.startsWith('vertical-') || writingMode.startsWith('sideways-');
}

function hasMediaPeer(container: HTMLElement, textElement: HTMLElement): boolean {
    return Array.from(container.querySelectorAll('img, picture, video, canvas')).some(media => {
        if (!(media instanceof HTMLElement)) return false;
        if (media.closest(READER_ROOT_SELECTOR)) return false;
        return media !== textElement && !textElement.contains(media);
    });
}

function isCompactMediaContext(element: HTMLElement): boolean {
    const style = safeComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (element.matches('a[href], button, [role="link"], [role="button"]')) return true;
    if (safeQuerySelector(element, 'a[href], button, [role="link"], [role="button"]')) return true;
    const display = style.display;
    const structured = display.includes('grid') || display.includes('flex') || display === 'block';
    const compact = rect.width === 0 || rect.width <= 560;
    return structured && compact;
}




function nonDestructiveScanHost(target: ScanTextTarget): HTMLElement {
    if (!isFragmentTextTarget(target)) return target.parent;
    const parents = target.fragments
        .map(fragment => fragment.node.parentElement)
        .filter((parent): parent is HTMLElement => Boolean(parent));
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

function styleTextMirrorHost(host: HTMLElement, allowOverflow = true): TextMirrorHostState {
    const computed = safeComputedStyle(host);
    const state: TextMirrorHostState = {
        observer: new MutationObserver(() => undefined),
        sourceText: '',
        visibility: host.style.getPropertyValue('visibility'),
        visibilityPriority: host.style.getPropertyPriority('visibility'),
        overflow: host.style.getPropertyValue('overflow'),
        overflowPriority: host.style.getPropertyPriority('overflow'),
        overflowAdjusted: allowOverflow,
        position: host.style.getPropertyValue('position'),
        positionPriority: host.style.getPropertyPriority('position'),
        positioned: computed.position === 'static',
        display: host.style.getPropertyValue('display'),
        displayPriority: host.style.getPropertyPriority('display'),
        displayAdjusted: computed.display === 'inline',
        concealTextOnly: !hostIsVisuallyBareForMirror(host),
        concealedText: [],
    };
    textMirrorHosts.set(host, state);
    if (state.overflowAdjusted) host.style.setProperty('overflow', 'visible', 'important');
    if (state.positioned) host.style.setProperty('position', 'relative', 'important');
    if (state.displayAdjusted) host.style.setProperty('display', 'inline-block', 'important');
    return state;
}

function hideTextMirrorHost(host: HTMLElement, state: TextMirrorHostState, mirror?: HTMLElement): void {
    textMirrorHosts.set(host, state);
    if (state.concealTextOnly) {
        // The mirror inherits colour from the host; pin the host's REAL text
        // colour on it before the host's colour goes transparent. (Bare hosts
        // skip this so mirrors keep following late host colour changes.)
        if (mirror) {
            const hostColor = safeComputedStyle(host).color;
            if (hostColor) {
                mirror.style.setProperty('color', hostColor);
                // currentcolor, NOT the fixed colour: fill-color inherits and
                // would override the per-word state colour classes inside.
                mirror.style.setProperty('-webkit-text-fill-color', 'currentcolor');
            }
        }
        concealTextMirrorHostText(host, state);
    } else host.style.setProperty('visibility', 'hidden', 'important');
    if (state.overflowAdjusted) host.style.setProperty('overflow', 'visible', 'important');
    if (state.positioned) host.style.setProperty('position', 'relative', 'important');
    if (state.displayAdjusted) host.style.setProperty('display', 'inline-block', 'important');
}

// Text-transparency set: hides glyphs, decorations, and shadows while the
// element's own box (background, border, pseudo content) keeps painting.
const CONCEALED_TEXT_PROPERTIES = ['color', '-webkit-text-fill-color', 'text-decoration-color', 'text-shadow'] as const;
// Hosts bigger than this are not concealed element-by-element — a mirror over
// a huge subtree falls back to hiding the host outright.
const CONCEALED_TEXT_MAX_ELEMENTS = 60;

function concealTextMirrorHostText(host: HTMLElement, state: TextMirrorHostState): void {
    const descendants = Array.from(host.querySelectorAll<HTMLElement>('*'))
        .filter(element => !element.closest(READER_TEXT_MIRROR_SELECTOR));
    if (descendants.length > CONCEALED_TEXT_MAX_ELEMENTS) {
        state.concealTextOnly = false;
        host.style.setProperty('visibility', 'hidden', 'important');
        return;
    }
    // Icons drawn with fill/stroke: currentColor would inherit the transparent
    // text colour — pin their computed colour inline first, then skip them.
    for (const svg of host.querySelectorAll<SVGElement>('svg')) {
        if (svg.closest(READER_TEXT_MIRROR_SELECTOR) || svg.style.getPropertyValue('color')) continue;
        const computed = safeComputedStyle(svg as unknown as HTMLElement).color;
        if (computed) {
            state.concealedText.push({ element: svg as unknown as HTMLElement, values: [{ property: 'color', value: '', priority: '' }] });
            svg.style.setProperty('color', computed, 'important');
        }
    }
    for (const element of [host, ...descendants]) {
        if (element instanceof SVGElement || element.closest('svg')) continue;
        concealElementText(element, state);
    }
}

function concealElementText(element: HTMLElement, state: TextMirrorHostState): void {
    if (state.concealedText.some(record => record.element === element && record.values.length === CONCEALED_TEXT_PROPERTIES.length)) return;
    const values = CONCEALED_TEXT_PROPERTIES.map(property => ({
        property,
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
    }));
    state.concealedText.push({ element, values });
    for (const property of CONCEALED_TEXT_PROPERTIES) {
        element.style.setProperty(property, property === 'text-shadow' ? 'none' : 'transparent', 'important');
    }
}

function reassertConcealedTextMirrorHostText(host: HTMLElement, state: TextMirrorHostState): void {
    if (host.style.getPropertyValue('color') !== 'transparent') concealElementText(host, state);
    for (const record of state.concealedText) {
        const element = record.element;
        if (!element.isConnected || element instanceof SVGElement) continue;
        if (element.style.getPropertyValue('color') !== 'transparent') {
            for (const property of CONCEALED_TEXT_PROPERTIES) {
                element.style.setProperty(property, property === 'text-shadow' ? 'none' : 'transparent', 'important');
            }
        }
    }
}

function restoreConcealedTextMirrorHostText(state: TextMirrorHostState): void {
    for (const record of state.concealedText) {
        for (const { property, value, priority } of record.values) {
            const injected = property === 'text-shadow' ? 'none' : 'transparent';
            const current = record.element.style.getPropertyValue(property);
            // SVG colour pins recorded a snapshot, not an injected sentinel —
            // restore those unconditionally; text conceals restore only while
            // they still hold our transparent value.
            if (record.values.length === CONCEALED_TEXT_PROPERTIES.length && current && current !== injected) continue;
            if (value) record.element.style.setProperty(property, value, priority);
            else record.element.style.removeProperty(property);
        }
    }
    state.concealedText = [];
}

function styleTextMirror(mirror: HTMLElement, host: HTMLElement, hasRuby = false): void {
    const style = safeComputedStyle(host);
    mirror.style.setProperty('position', 'absolute');
    mirror.style.setProperty('inset', '0 0 auto 0');
    mirror.style.setProperty('height', 'auto');
    mirror.style.setProperty('overflow', 'visible');
    mirror.style.setProperty('visibility', 'visible', 'important');
    mirror.style.setProperty('pointer-events', 'auto');
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

// A reading wider than its base (じゅん over 順) makes ruby layout grow the
// ruby box and center the base inside it. Engines only reclaim that slack via
// ruby overhang over adjacent NON-ruby text — never across an adjacent ruby —
// so compact mirrored labels split into "新 しい 順" (worst on WebKit, which is
// exactly the iPad chip surface). Styling rt is a dead end: WebKit ignores
// display/position overrides on ruby internals. Instead, measure the RENDERED
// gap between each ruby base and its same-line CJK neighbours and pull the
// neighbours back in with negative inline margins on the ruby element — the
// annotation keeps painting centered over the base, overhanging exactly the
// way native overhang would. Measured-then-written in two phases (no
// per-ruby reflow), and a no-op wherever the engine already overhangs.
function tightenMirrorRubyOverhang(mirror: HTMLElement): void {
    interface RubyMeasure {
        ruby: HTMLElement;
        baseRect: DOMRect;
        insetLeft: number;
        insetRight: number;
        marginLeft: number;
        marginRight: number;
    }
    // jsdom has no Range.getBoundingClientRect; there is no layout to fix there.
    if (typeof Range.prototype.getBoundingClientRect !== 'function') return;
    const measures: RubyMeasure[] = [];
    const byRuby = new Map<HTMLElement, RubyMeasure>();
    for (const ruby of mirror.querySelectorAll<HTMLElement>('ruby')) {
        const base = ruby.querySelector<HTMLElement>('.jpdb-reader-ruby-base');
        if (!base || !base.textContent) continue;
        const rubyRect = ruby.getBoundingClientRect();
        const baseRect = glyphRangeRect(base);
        if (!baseRect) continue;
        const measure: RubyMeasure = {
            ruby,
            baseRect,
            insetLeft: Math.max(0, baseRect.left - rubyRect.left),
            insetRight: Math.max(0, rubyRect.right - baseRect.right),
            marginLeft: 0,
            marginRight: 0,
        };
        measures.push(measure);
        byRuby.set(ruby, measure);
    }
    for (const measure of measures) {
        if (measure.insetLeft < 1 && measure.insetRight < 1) continue;
        const previous = adjacentGlyph(mirror, measure.ruby, 'previous');
        if (previous && rectsShareLine(measure.baseRect, previous.rect) && !previous.ruby) {
            const gap = measure.baseRect.left - previous.rect.right;
            measure.marginLeft = Math.max(0, Math.min(gap - RUBY_GAP_KEEP_PX, measure.insetLeft));
        }
        const next = adjacentGlyph(mirror, measure.ruby, 'next');
        if (next && rectsShareLine(measure.baseRect, next.rect)) {
            const gap = next.rect.left - measure.baseRect.right;
            const needed = Math.max(0, gap - RUBY_GAP_KEEP_PX);
            measure.marginRight = Math.min(needed, measure.insetRight);
            // The slack between two ADJACENT rubies belongs to both boxes:
            // this ruby reclaims its own right inset, the neighbour's left
            // inset covers the remainder — assigned here as a pair so the
            // same gap is never compensated twice.
            const neighbour = next.ruby ? byRuby.get(next.ruby) : undefined;
            if (neighbour) neighbour.marginLeft = Math.min(needed - measure.marginRight, neighbour.insetLeft);
        }
    }
    for (const measure of measures) {
        if (measure.marginLeft > 0) measure.ruby.style.setProperty('margin-left', `${-measure.marginLeft}px`, 'important');
        if (measure.marginRight > 0) measure.ruby.style.setProperty('margin-right', `${-measure.marginRight}px`, 'important');
    }
}

// CJK renders with no inter-glyph gap, so anything beyond a hair of rendered
// space next to a ruby base is annotation-induced slack; reclaim it up to the
// ruby box's own inset so a compensated line can never overlap real glyphs.
const RUBY_GAP_KEEP_PX = 0.5;

function rectsShareLine(a: DOMRect, b: DOMRect): boolean {
    return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) / 2;
}

function glyphRangeRect(element: HTMLElement): DOMRect | null {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    return rect.width > 0 ? rect : null;
}

// Nearest rendered CJK glyph before/after the ruby inside the mirror. A
// whitespace or Latin neighbour keeps its natural spacing — only CJK
// adjacency implies the gap should be zero.
function adjacentGlyph(
    mirror: HTMLElement,
    ruby: HTMLElement,
    direction: 'previous' | 'next',
): { rect: DOMRect; ruby: HTMLElement | null } | null {
    const walker = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT, {
        acceptNode: node => (node.parentElement?.closest('rt,rp') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let candidate: Text | null = null;
    const position = direction === 'previous' ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (ruby.contains(node) || !node.data) continue;
        if (!(ruby.compareDocumentPosition(node) & position)) continue;
        if (direction === 'previous') candidate = node;
        else { candidate = node; break; }
    }
    if (!candidate?.data) return null;
    const characters = Array.from(candidate.data);
    const character = direction === 'previous' ? characters[characters.length - 1] : characters[0];
    if (!character || !isCjkChar(character)) return null;
    const range = document.createRange();
    if (direction === 'previous') {
        range.setStart(candidate, candidate.data.length - character.length);
        range.setEnd(candidate, candidate.data.length);
    } else {
        range.setStart(candidate, 0);
        range.setEnd(candidate, character.length);
    }
    const rect = range.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return { rect, ruby: candidate.parentElement?.closest('ruby') as HTMLElement | null };
}

function rubyFriendlyMirrorLineHeight(style: CSSStyleDeclaration): string {
    const fontSize = cssPixels(style.fontSize) || 16;
    const existingLineHeight = cssPixels(style.lineHeight) || fontSize * 1.2;
    // 1.62 fit the ruby glyphs but parked the reading strip against the
    // previous line's baseline on tight hosts (YouTube's ~1.3 titles);
    // 1.78 leaves an actual gap between lines of annotated text.
    return `${Math.ceil(Math.max(existingLineHeight, fontSize * 1.78))}px`;
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
    // The callback must close over NOTHING that strongly reaches `host`.
    // WeakRef(host) alone is not enough: closing over `state` would pin the host
    // too, because a concealTextOnly mirror's state.concealedText holds `host`
    // itself (the [host, ...descendants] capture in concealTextMirrorHostText).
    // So the callback closes over ONLY hostRef, derefs it, and looks the state
    // back up through the host-keyed WeakMap — no strong host retention survives
    // in the observer/callback/global-Set graph, so a framework detach lets the
    // host (and this observer) be collected.
    const hostRef = new WeakRef(host);
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
            if (liveHost.isConnected && HAS_JAPANESE.test(normalizedMirrorHostText(nativeTextMirrorHostText(liveHost)))) {
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
        if (mutations.some(mutation => mutation.type === 'attributes' && mutation.target === liveHost)) {
            reassertTextMirrorHostStyles(liveHost, liveState);
        }
        if (!mutations.some(mutation => mutation.type === 'childList' || mutation.type === 'characterData')) return;
        const currentText = normalizedMirrorHostText(nativeTextMirrorHostText(liveHost));
        if (!liveHost.isConnected || !HAS_JAPANESE.test(currentText)) {
            removeTextMirror(liveHost);
            return;
        }
        if (currentText !== liveState.sourceText) {
            // Keep the stale mirror briefly so a routine title re-render can
            // be rescanned without a bare-text flash — but only briefly: when
            // the element was recycled for DIFFERENT content (the comments
            // header becoming the composer on iPad) and no rescan refreshes
            // the mirror, it would keep painting the OLD text over the new
            // content while hiding it. Restore the host once the grace passes.
            reassertTextMirrorHostStyles(liveHost, liveState);
            dispatchTextMirrorStale(liveHost);
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
        if (mirrorTokenApplyDepth === 0) sweepAndDrainTextMirrorObservers();
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
    }
}

function dispatchTextMirrorStale(host: HTMLElement): void {
    host.dispatchEvent(new CustomEvent(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, {
        bubbles: true,
    }));
}

function mutationInsideTextMirror(mutation: MutationRecord): boolean {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    return Boolean(target?.closest(READER_TEXT_MIRROR_SELECTOR));
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
    if (HAS_JAPANESE.test(text)) return text;
    const labelledText = Array.from(host.querySelectorAll<HTMLElement>('[aria-label]'))
        .filter(element => !element.closest(TEXT_MIRROR_ARIA_LABEL_SKIP_SELECTOR))
        .map(element => element.getAttribute('aria-label') ?? '')
        .join(' • ');
    return HAS_JAPANESE.test(labelledText) ? labelledText : text;
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
    ownedTextMirrors(host).forEach(mirror => mirror.remove());
    if (state) restoreTextMirrorHost(host, state);
    textMirrorHosts.delete(host);
}

// A YouTube re-render of a live host (e.g. the caption/translation strip) can
// strip the inline styles we set in styleTextMirrorHost. Without
// visibility:hidden the original host text re-appears beside the mirror
// (duplication); without position:relative the absolutely-positioned mirror
// anchors to the wrong ancestor (misalignment). Re-assert both when the host
// text changes, before refreshing the mirror. The host-text observer does not
// watch attributes, so re-setting styles here cannot re-trigger it.
function reassertTextMirrorHostStyles(host: HTMLElement, state: TextMirrorHostState): void {
    if (!currentTextMirror(host)) {
        removeTextMirror(host);
        return;
    }
    if (state.concealTextOnly) {
        reassertConcealedTextMirrorHostText(host, state);
    } else if (host.style.getPropertyValue('visibility') !== 'hidden') {
        host.style.setProperty('visibility', 'hidden', 'important');
    }
    if (state.overflowAdjusted && host.style.getPropertyValue('overflow') !== 'visible') {
        host.style.setProperty('overflow', 'visible', 'important');
    }
    if (state.positioned && host.style.getPropertyValue('position') !== 'relative') {
        host.style.setProperty('position', 'relative', 'important');
    }
    if (state.displayAdjusted && host.style.getPropertyValue('display') !== 'inline-block') {
        host.style.setProperty('display', 'inline-block', 'important');
    }
}

function restoreTextMirrorHost(host: HTMLElement, state: TextMirrorHostState): void {
    if (state.concealTextOnly) restoreConcealedTextMirrorHostText(state);
    else restoreStyleProperty(host, 'visibility', 'hidden', state.visibility, state.visibilityPriority);
    if (state.overflowAdjusted) restoreStyleProperty(host, 'overflow', 'visible', state.overflow, state.overflowPriority);
    if (state.positioned) restoreStyleProperty(host, 'position', 'relative', state.position, state.positionPriority);
    if (state.displayAdjusted) restoreStyleProperty(host, 'display', 'inline-block', state.display, state.displayPriority);
}

// Restore the pre-mirror inline value ONLY while the property still carries
// Yomu's injected value — if the framework rewrote the host's style while the
// mirror was up, its newer value wins over our stale capture.
function restoreStyleProperty(host: HTMLElement, property: string, injectedValue: string, value: string, priority: string): void {
    const current = host.style.getPropertyValue(property);
    if (current && current !== injectedValue) return;
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
    let ancestor = mirror.parentElement;
    while (ancestor) {
        if (textMirrorHosts.has(ancestor)) return ancestor;
        ancestor = ancestor.parentElement;
    }
    return null;
}

export function removeNonDestructiveScanMirrors(root: ParentNode = document): number {
    const hosts = new Set<HTMLElement>();
    // Pierce open shadow roots: a shadow-scan mirror is appended INSIDE its
    // shadow root, which root.querySelectorAll does not cross. Missing it here
    // would leave the shadow mirror painted AND its per-host observer connected
    // after clear/destroy — the exact leak class 1.6.109/1.6.112 closed. Bounded
    // and open-only, consistent with the scan-side descent.
    queryAllPiercingShadow(root, READER_TEXT_MIRROR_SELECTOR).forEach(mirror => {
        const host = registeredTextMirrorHostFor(mirror);
        if (host) hosts.add(host);
        else if (mirror.parentElement) hosts.add(mirror.parentElement);
        else mirror.remove();
    });
    const controlHosts = new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>(READER_CONTROL_TEXT_MIRROR_SELECTOR).forEach(mirror => {
        const host = mirror.previousElementSibling;
        if (host instanceof HTMLElement) controlHosts.add(host);
        else mirror.remove();
    });
    const canvasHosts = new Set<HTMLCanvasElement>();
    root.querySelectorAll<HTMLElement>(READER_CANVAS_TEXT_LAYER_SELECTOR).forEach(layer => {
        const canvas = canvasForFallbackTextLayer(layer);
        if (canvas) canvasHosts.add(canvas);
        else layer.remove();
    });
    hosts.forEach(removeTextMirror);
    controlHosts.forEach(removeControlTextMirror);
    canvasHosts.forEach(removeCanvasFallbackTextLayer);
    return hosts.size + controlHosts.size + canvasHosts.size;
}

// querySelectorAll that also reaches into OPEN shadow roots one level deep
// (SHADOW_SCAN_MAX_DEPTH), matching the scan side. Only used by teardown paths
// that must remove shadow-hosted mirrors (and disconnect their observers), so it
// stays a shallow, open-only descent rather than a full recursive pierce.
function queryAllPiercingShadow(root: ParentNode, selector: string, depth = 0): HTMLElement[] {
    const matches = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (depth >= SHADOW_SCAN_MAX_DEPTH) return matches;
    for (const host of root.querySelectorAll<HTMLElement>('*')) {
        const shadowRoot = host.shadowRoot;
        if (shadowRoot) matches.push(...queryAllPiercingShadow(shadowRoot, selector, depth + 1));
    }
    return matches;
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
    if (!text || !HAS_JAPANESE.test(text) || !target.parent.isConnected) return;
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

    const safeTokens = nonOverlappingTokens(tokens, target.text.length);
    if (!safeTokens.length) return;

    const sentence = target.text.replace(/\s+/g, ' ').trim();
    const renderTarget = targetForcesAllFurigana(target.parent)
        ? { ...target, suppressRuby: false }
        : target;
    applyTokensToIndexedFragmentTarget(renderTarget, safeTokens, furiganaSettingsForTarget(settings, target.parent), sentence);
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
    const allowRuby = !target.suppressRuby && scanFragmentAllowsRuby(fragment.hasNativeRuby);
    return renderToken(fragment.node.data.slice(plan.localStart, plan.localEnd), plan.tokenWithSentence, settings, {
        allowRuby,
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

    if (!target.suppressRuby && fragmentRangeHasNativeRuby(indexedFragments, token.start, token.end)) {
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
        allowRuby: !target.suppressRuby,
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
            allowRuby: !target.suppressRuby && scanFragmentAllowsRuby(piece.fragment.hasNativeRuby),
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
    const allowRuby = !target.suppressRuby && scanFragmentAllowsRuby(fragment.hasNativeRuby);
    const surface = fragment.node.data.slice(start, end);
    const rendered = renderToken(surface || target.text.slice(token.start, token.end), tokenWithSentence, settings, {
        allowRuby,
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
    const safeTokens = nonOverlappingTokens(tokens, text.length);
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

export function renderHighlightedTextHtml(text: string, targets: string[], className: string): string {
    const needles = uniqueNonEmptyStrings(targets).sort((a, b) => b.length - a.length);
    if (!text || !needles.length) return escapeHtml(text);
    return renderHighlightChunks(text, needles, className);
}

function renderHighlightChunks(text: string, needles: string[], className: string): string {
    let html = '';
    let offset = 0;
    while (offset < text.length) {
        const match = nextHighlightMatch(text, needles, offset);
        if (!match) break;
        html += renderHighlightChunk(text, className, offset, match);
        offset = match.index + match.needle.length;
    }
    if (offset < text.length) html += escapeHtml(text.slice(offset));
    return html;
}

function renderHighlightChunk(text: string, className: string, offset: number, match: { index: number; needle: string }): string {
    const prefix = match.index > offset ? escapeHtml(text.slice(offset, match.index)) : '';
    const marked = text.slice(match.index, match.index + match.needle.length);
    return `${prefix}<mark class="${escapeHtml(className)}">${escapeHtml(marked)}</mark>`;
}

function nextHighlightMatch(text: string, needles: string[], offset: number): { index: number; needle: string } | null {
    let best: { index: number; needle: string } | null = null;
    for (const needle of needles) {
        best = betterHighlightMatch(best, highlightMatchForNeedle(text, needle, offset));
    }
    return best;
}

function highlightMatchForNeedle(text: string, needle: string, offset: number): { index: number; needle: string } | null {
    const index = text.indexOf(needle, offset);
    return index < 0 ? null : { index, needle };
}

function betterHighlightMatch(
    current: { index: number; needle: string } | null,
    candidate: { index: number; needle: string } | null,
): { index: number; needle: string } | null {
    if (!candidate) return current;
    if (!current) return candidate;
    return isBetterHighlightMatch(candidate, current) ? candidate : current;
}

function isBetterHighlightMatch(candidate: { index: number; needle: string }, current: { index: number; needle: string }): boolean {
    return candidate.index < current.index
        || (candidate.index === current.index && candidate.needle.length > current.needle.length);
}

function uniqueNonEmptyStrings(values: string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function nonOverlappingTokens(tokens: JPDBToken[], textLength: number): JPDBToken[] {
    const safe: JPDBToken[] = [];
    let offset = 0;
    for (const token of tokens) {
        if (!isSafeTokenSpan(token, offset, textLength)) continue;
        safe.push(token);
        offset = token.end;
    }
    return safe;
}

function isSafeTokenSpan(token: JPDBToken, offset: number, textLength: number): boolean {
    return token.start >= offset
        && token.start >= 0
        && token.end > token.start
        && token.end <= textLength;
}

function miningInsightTokenKeys(tokens: JPDBToken[]): ReadonlySet<string> {
    const sentences = new Map<string, Map<string, { unknown: boolean }>>();
    for (const token of tokens) {
        const sentence = miningInsightSentenceKey(token);
        if (!sentence || isParticleCard(token.card)) continue;
        const cardKey = readerCardKey(token.card);
        const sentenceCards = sentences.get(sentence) ?? new Map<string, { unknown: boolean }>();
        if (!sentences.has(sentence)) sentences.set(sentence, sentenceCards);
        if (!sentenceCards.has(cardKey)) {
            sentenceCards.set(cardKey, { unknown: isMiningUnknownCard(token.card) });
        }
    }

    const keys = new Set<string>();
    sentences.forEach((cards, sentence) => {
        if (cards.size < MINING_INSIGHT_MIN_CARD_COUNT) return;
        const unknownCards = [...cards.entries()].filter(([, card]) => card.unknown);
        if (unknownCards.length !== 1) return;
        keys.add(miningInsightKey(sentence, unknownCards[0][0]));
    });
    return keys;
}

function isMiningUnknownCard(card: JPDBCard): boolean {
    return MINING_INSIGHT_UNKNOWN_STATES.has(primaryCardState(card.cardState));
}

function miningInsightTokenKey(token: JPDBToken): string {
    return miningInsightKey(miningInsightSentenceKey(token), readerCardKey(token.card));
}

function miningInsightKey(sentence: string, cardKey: string): string {
    return `${sentence}\u0000${cardKey}`;
}

function miningInsightSentenceKey(token: JPDBToken): string {
    return (token.sentence ?? '').replace(/\s+/g, ' ').trim();
}

function readerCardKey(card: JPDBCard): string {
    return `${readerCardSource(card)}:${readerCardId(card)}/${readerReadingIndex(card)}`;
}

function readerCardSource(card: JPDBCard): string {
    return card.source ?? (card.reviewSource === 'jiten-api' ? 'jiten' : 'jpdb');
}

function readerCardId(card: JPDBCard): number {
    return readerCardSource(card) === 'jiten' ? card.jitenWordId ?? card.vid : card.vid;
}

function readerReadingIndex(card: JPDBCard): number {
    return readerCardSource(card) === 'jiten' ? card.jitenReadingIndex ?? card.sid : card.sid;
}

function renderToken(
    surface: string,
    token: JPDBToken,
    settings: ReaderSettings,
    options: TokenRenderOptions = {},
): HTMLElement {
    const span = createReaderWordSpan(token, { ...options, showPitchAccent: settings.showPitchAccent });
    span.dataset.surface = surface;
    if (!options.kanjiNavigation?.enabled && options.passiveInteraction !== true) span.tabIndex = -1;

    const allowRuby = options.allowRuby !== false && !shouldSuppressLongProseRuby(surface, token, options);
    const hasRuby = shouldRenderRuby(surface, token, settings, allowRuby, options.preserveTokenRubies);
    if (hasRuby) {
        span.classList.add('jpdb-reader-has-furi');
        setInnerHtml(span, renderRuby(surface, token, options.kanjiNavigation, options.preserveTokenRubies));
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

interface TokenRenderOptions {
    allowRuby?: boolean;
    kanjiNavigation?: KanjiNavigationRenderOptions;
    scanWord?: boolean;
    proseWrap?: boolean;
    passiveInteraction?: boolean;
    // Scan-word renders keep the JPDB-provided ruby spans intact (e.g. 読む -> よむ) instead of
    // re-centering furigana onto bare kanji, which is reserved for the popup token renderers.
    preserveTokenRubies?: boolean;
    miningInsightKeys?: ReadonlySet<string>;
    showPitchAccent?: boolean;
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
    if (showPitchAccent) span.dataset.pitchClass = safePitchClass(token.pitchClass);
    span.dataset.tokenStart = String(token.start);
    span.dataset.tokenEnd = String(token.end);
    span.dataset.sentence = token.sentence ?? '';
    if (token.card.spelling) span.dataset.expression = token.card.spelling;
    if (token.card.reading) span.dataset.reading = token.card.reading;
    const pitchAccent = token.card.pitchAccent.join('|');
    if (showPitchAccent && pitchAccent) span.dataset.pitchAccent = pitchAccent;
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
    const pitchClass = settings.showPitchAccent ? safePitchClass(token.pitchClass) : '';
    const classes = [
        readerWordClassName(state, token, settings),
        hasRuby ? 'jpdb-reader-has-furi' : '',
        hasMiningInsight ? 'jpdb-reader-i-plus-one' : '',
    ].filter(Boolean).join(' ');
    const source = ` data-card-source="${escapeHtml(readerCardSource(token.card))}"`;
    const cardId = ` data-card-id="${readerCardId(token.card)}"`;
    const readingIndex = ` data-reading-index="${readerReadingIndex(token.card)}"`;
    const cardState = ` data-card-state="${escapeHtml(state)}"`;
    const tokenRange = ` data-token-start="${token.start}" data-token-end="${token.end}"`;
    const surfaceAttr = ` data-surface="${escapeHtml(surface)}"`;
    const miningInsight = hasMiningInsight ? ' data-mining-insight="i-plus-one"' : '';
    const expression = token.card.spelling ? ` data-expression="${escapeHtml(token.card.spelling)}"` : '';
    const reading = token.card.reading ? ` data-reading="${escapeHtml(token.card.reading)}"` : '';
    const pitchAccent = token.card.pitchAccent.join('|');
    const pitchClassAttr = pitchClass ? ` data-pitch-class="${pitchClass}"` : '';
    const lookupMetadata = settings.showPitchAccent && pitchAccent ? ` data-pitch-accent="${escapeHtml(pitchAccent)}"` : '';
    const deck = renderDeckMembershipAttributes(token.card);
    return `<span class="${classes}" data-vid="${token.card.vid}" data-sid="${token.card.sid}"${source}${cardId}${readingIndex}${cardState}${tokenRange}${surfaceAttr}${pitchClassAttr} data-sentence="${escapeHtml(token.sentence ?? '')}"${miningInsight}${expression}${reading}${lookupMetadata}${deck} tabindex="-1">${content}</span>`;
}

function renderDeckMembershipAttributes(card: JPDBCard): string {
    const membership = cardDeckMembership(card);
    if (!membership.member) return '';
    const deckNames = membership.names.length ? ` data-deck-names="${escapeHtml(membership.names.join(', '))}"` : '';
    return ` data-deck-member="true" data-deck-source="${escapeHtml(membership.source)}"${deckNames}`;
}

export function shouldRenderRuby(surface: string, token: JPDBToken, settings: ReaderSettings, allowRuby = true, preserveTokenRubies = false): boolean {
    if (!allowRuby) return false;
    if (!effectiveTokenRubies(surface, token, preserveTokenRubies).length) return false;
    return furiganaModeAllowsRuby(effectiveFuriganaMode(settings), surface, token, settings);
}

function furiganaModeAllowsRuby(mode: string, surface: string, token: JPDBToken, settings: ReaderSettings): boolean {
    if (mode === 'off') return false;
    // Hover mode renders ruby for every word; visibility is CSS-driven.
    if (mode === 'hover') return true;
    if (mode === 'known-status') return !shouldHideFuriganaForCardState(settings, primaryCardState(token.card.cardState));
    return mode !== 'difficult-kanji' || hasDifficultKanji(surface);
}

function hasDifficultKanji(surface: string): boolean {
    for (const char of surface) {
        if (KANJI_RE.test(char) && !EASY_FURIGANA_KANJI.has(char)) return true;
    }
    return false;
}

export function readerWordClassName(state: string, token: JPDBToken, settings: Pick<ReaderSettings, 'showPitchAccent'>): string {
    const classes = ['jpdb-reader-word'];
    if (isParticleCard(token.card)) {
        classes.push('jpdb-reader-particle');
    }
    if (hasKnownCardState(token.card)) {
        classes.push(`jpdb-${state}`);
        const source = readerCardSource(token.card);
        if (source !== 'jpdb') classes.push(`${source}-${state}`);
    }
    classes.push(...cardDeckMembershipClassNames(token.card));
    if (settings.showPitchAccent) classes.push(`jpdb-pitch-${safePitchClass(token.pitchClass)}`);
    return classes.join(' ');
}

function hasKnownCardState(card: JPDBToken['card']): boolean {
    return Array.isArray(card.cardState) && card.cardState.length > 0;
}

function isParticleCard(card: JPDBCard): boolean {
    return card.partOfSpeech.includes('prt') || PARTICLE_SURFACE_RE.test(card.spelling.trim());
}

function safePitchClass(value: string): string {
    return PITCH_CLASSES.has(value) ? value : 'unknown';
}

export function renderRuby(surface: string, token: JPDBToken, kanjiNavigation?: KanjiNavigationRenderOptions, preserveTokenRubies = false): string {
    let html = '';
    let localOffset = 0;
    for (const ruby of effectiveTokenRubies(surface, token, preserveTokenRubies)) {
        const start = ruby.start - token.start;
        const end = ruby.end - token.start;
        html += renderKanjiNavigationText(surface.slice(localOffset, start), kanjiNavigation);
        html += `<ruby><span class="jpdb-reader-ruby-base">${renderKanjiNavigationText(surface.slice(start, end), kanjiNavigation)}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(ruby.text)}</rt><rp>)</rp></ruby>`;
        localOffset = end;
    }
    html += renderKanjiNavigationText(surface.slice(localOffset), kanjiNavigation);
    return html;
}

export function inferredInflectedSurfaceRubies(surface: string, spelling: string, reading: string): JPDBToken['rubies'] {
    const visibleSurface = surface.trim();
    const baseSpelling = spelling.trim();
    const baseReading = reading.trim();
    if (!visibleSurface || !baseSpelling || visibleSurface === baseSpelling) return [];
    if (!KANJI_RE.test(visibleSurface) || !KANA_RE.test(baseReading) || baseReading === baseSpelling) return [];

    for (const spellingSuffix of trailingKanaSuffixes(baseSpelling)) {
        if (!baseReading.endsWith(spellingSuffix)) continue;
        const spellingStem = baseSpelling.slice(0, -spellingSuffix.length);
        if (!spellingStem || !visibleSurface.startsWith(spellingStem)) continue;
        const surfaceSuffix = visibleSurface.slice(spellingStem.length);
        if (!surfaceSuffix || !KANA_RE.test(surfaceSuffix)) continue;
        const rubies = stemRubiesForInflectedSurface(spellingStem, baseReading.slice(0, -spellingSuffix.length));
        if (rubies.length) return rubies;
    }
    return [];
}

function trailingKanaSuffixes(value: string): string[] {
    const suffixes: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
        const suffix = value.slice(index);
        if (suffix && KANA_RE.test(suffix)) suffixes.push(suffix);
    }
    return suffixes.sort((first, second) => second.length - first.length);
}

function stemRubiesForInflectedSurface(surfaceStem: string, readingStem: string): JPDBToken['rubies'] {
    const trimmed = trimSharedKanaAffixes(surfaceStem, readingStem);
    if (!trimmed.surface || !trimmed.reading) return [];
    if (!KANJI_RE.test(trimmed.surface) || !KANA_RE.test(trimmed.reading)) return [];
    return [{
        text: trimmed.reading,
        start: trimmed.offset,
        end: trimmed.offset + trimmed.surface.length,
        length: trimmed.surface.length,
    }];
}

function trimSharedKanaAffixes(surface: string, reading: string): { surface: string; reading: string; offset: number } {
    let trimmedSurface = surface;
    let trimmedReading = reading;
    let offset = 0;
    while (trimmedSurface && trimmedReading && sameKanaCharacter(trimmedSurface[0], trimmedReading[0])) {
        trimmedSurface = trimmedSurface.slice(1);
        trimmedReading = trimmedReading.slice(1);
        offset += 1;
    }
    while (trimmedSurface && trimmedReading && sameKanaCharacter(
        trimmedSurface[trimmedSurface.length - 1],
        trimmedReading[trimmedReading.length - 1],
    )) {
        trimmedSurface = trimmedSurface.slice(0, -1);
        trimmedReading = trimmedReading.slice(0, -1);
    }
    return { surface: trimmedSurface, reading: trimmedReading, offset };
}

function sameKanaCharacter(first: string | undefined, second: string | undefined): boolean {
    return Boolean(first && second && first === second && KANA_RE.test(first));
}

function effectiveTokenRubies(surface: string, token: JPDBToken, preserveTokenRubies = false): JPDBToken['rubies'] {
    const sources = sourceTokenRubies(surface, token);
    if (preserveTokenRubies) {
        // Preserve explicit rubies over kanji-containing bases; a kana-only
        // base never needs furigana (the ruby would just repeat the visible
        // word). When the base mixes kanji and kana (e.g. 話す/はなす), trim
        // the ruby down to the kanji portion so furigana never covers kana.
        return sources.flatMap(ruby => {
            const range = localRubyRange(surface, token, ruby);
            if (!range) return [];
            const base = surface.slice(range.start, range.end);
            if (!KANJI_RE.test(base)) return [];
            if (!KANA_CHAR_RE.test(base)) return [ruby];
            const parts = kanjiOnlyRubySegments(surface, token, ruby);
            return parts.length ? parts : [ruby];
        });
    }
    return sources.flatMap(ruby => kanjiOnlyRubySegments(surface, token, ruby));
}

function sourceTokenRubies(surface: string, token: JPDBToken): JPDBToken['rubies'] {
    if (token.rubies.length) return token.rubies;

    const reading = token.card.reading.trim();
    if (!surface || !KANJI_RE.test(surface) || !reading || reading === surface || !KANA_RE.test(reading)) return [];
    const inferred = inferredInflectedSurfaceRubies(surface, token.card.spelling, reading);
    if (inferred.length) {
        return inferred.map(ruby => ({
            ...ruby,
            start: token.start + ruby.start,
            end: token.start + ruby.end,
        }));
    }
    return [{ text: reading, start: token.start, end: token.end, length: token.length }];
}

function kanjiOnlyRubySegments(surface: string, token: JPDBToken, ruby: JPDBToken['rubies'][number]): JPDBToken['rubies'] {
    const range = localRubyRange(surface, token, ruby);
    if (!range) return [];

    return kanjiRubyParts(surface.slice(range.start, range.end), ruby.text.trim()).map(part => ({
        text: part.text,
        start: token.start + range.start + part.start,
        end: token.start + range.start + part.end,
        length: part.end - part.start,
    }));
}

function localRubyRange(surface: string, token: JPDBToken, ruby: JPDBToken['rubies'][number]): { start: number; end: number } | null {
    const start = ruby.start - token.start;
    const end = ruby.end - token.start;
    if (start < 0 || end > surface.length || end <= start) return null;
    return { start, end };
}

function kanjiRubyParts(base: string, reading: string): Array<{ text: string; start: number; end: number }> {
    if (!base || !reading || !KANJI_RE.test(base)) return [];
    if (!KANA_RE.test(reading)) return [{ text: reading, start: 0, end: base.length }];

    const anchors = alignRubyKanaAnchors(base, reading);
    if (!anchors) return trimRubyPartToKanji(base, reading);

    const parts: Array<{ text: string; start: number; end: number }> = [];
    let baseOffset = 0;
    let readingOffset = 0;
    for (const anchor of anchors) {
        appendRubyGap(parts, base, baseOffset, anchor.baseStart, reading.slice(readingOffset, anchor.readingStart));
        baseOffset = anchor.baseEnd;
        readingOffset = anchor.readingEnd;
    }
    appendRubyGap(parts, base, baseOffset, base.length, reading.slice(readingOffset));
    return parts.length ? parts : trimRubyPartToKanji(base, reading);
}

function appendRubyGap(parts: Array<{ text: string; start: number; end: number }>, base: string, start: number, end: number, reading: string): void {
    const part = trimRubyPartToKanji(base.slice(start, end), reading)[0];
    if (part) parts.push({ text: part.text, start: start + part.start, end: start + part.end });
}

function trimRubyPartToKanji(base: string, reading: string): Array<{ text: string; start: number; end: number }> {
    const trimmed = trimSharedKanaAffixes(base, reading);
    if (!trimmed.surface || !trimmed.reading || !KANJI_RE.test(trimmed.surface)) return [];
    const kanjiOnly = kanaTrimmedKanjiRange(trimmed.surface, trimmed.reading);
    if (kanjiOnly) {
        return [{
            text: trimmed.reading,
            start: trimmed.offset + kanjiOnly.start,
            end: trimmed.offset + kanjiOnly.end,
        }];
    }
    return [{
        text: trimmed.reading,
        start: trimmed.offset,
        end: trimmed.offset + trimmed.surface.length,
    }];
}

function kanaTrimmedKanjiRange(base: string, reading: string): { start: number; end: number } | null {
    if (!KANA_RE.test(reading) || !KANA_CHAR_RE.test(base)) return null;
    const chars = Array.from(base);
    const first = chars.findIndex(char => KANJI_RE.test(char));
    if (first < 0) return null;
    let last = -1;
    for (let index = chars.length - 1; index >= first; index -= 1) {
        if (KANJI_RE.test(chars[index])) {
            last = index;
            break;
        }
    }
    if (last < first || (first === 0 && last === chars.length - 1)) return null;
    return { start: first, end: last + 1 };
}

function alignRubyKanaAnchors(base: string, reading: string): RubyKanaAnchor[] | null {
    const runs = rubyBaseKanaRuns(base);
    if (!runs.length) return [];
    return findRubyKanaAnchorPlan(base, reading, runs, 0, 0, []);
}

function findRubyKanaAnchorPlan(
    base: string,
    reading: string,
    runs: RubyBaseKanaRun[],
    index: number,
    readingOffset: number,
    anchors: RubyKanaAnchor[],
): RubyKanaAnchor[] | null {
    if (index >= runs.length) return rubyKanaAnchorPlanIsValid(base, reading, anchors) ? anchors : null;

    const run = runs[index];
    for (const readingStart of readingRunOccurrences(reading, run.text, readingOffset)) {
        const nextAnchors = anchors.concat({
            ...run,
            readingStart,
            readingEnd: readingStart + run.text.length,
        });
        const plan = findRubyKanaAnchorPlan(base, reading, runs, index + 1, readingStart + run.text.length, nextAnchors);
        if (plan) return plan;
    }
    return null;
}

function readingRunOccurrences(reading: string, text: string, offset: number): number[] {
    const occurrences: number[] = [];
    let index = reading.indexOf(text, offset);
    while (index >= 0) {
        occurrences.push(index);
        index = reading.indexOf(text, index + 1);
    }
    return occurrences;
}

function rubyKanaAnchorPlanIsValid(base: string, reading: string, anchors: RubyKanaAnchor[]): boolean {
    let baseOffset = 0;
    let readingOffset = 0;
    for (const anchor of anchors) {
        if (!rubyGapCanOwnReading(base.slice(baseOffset, anchor.baseStart), reading.slice(readingOffset, anchor.readingStart))) return false;
        baseOffset = anchor.baseEnd;
        readingOffset = anchor.readingEnd;
    }
    return rubyGapCanOwnReading(base.slice(baseOffset), reading.slice(readingOffset));
}

function rubyGapCanOwnReading(base: string, reading: string): boolean {
    return KANJI_RE.test(base) ? reading.length > 0 : reading.length === 0;
}

function rubyBaseKanaRuns(base: string): RubyBaseKanaRun[] {
    const runs: RubyBaseKanaRun[] = [];
    let start = -1;
    for (let index = 0; index <= base.length; index += 1) {
        const isKana = index < base.length && KANA_CHAR_RE.test(base[index]);
        if (isKana && start < 0) start = index;
        if ((!isKana || index === base.length) && start >= 0) {
            runs.push({ text: base.slice(start, index), baseStart: start, baseEnd: index });
            start = -1;
        }
    }
    return runs;
}

function kanjiNavigationForElement(element: HTMLElement): KanjiNavigationRenderOptions | undefined {
    const host = element.closest<HTMLElement>('[data-jpdb-reader-kanji-nav]');
    if (!host) return undefined;
    return {
        enabled: true,
        label: host.dataset.jpdbReaderKanjiNavLabel || 'Show kanji',
    };
}

export function renderKanjiNavigationText(value: string, options?: KanjiNavigationRenderOptions): string {
    if (!options?.enabled) return escapeHtml(value);
    return Array.from(value).map(character => isKanjiForInlineNavigation(character)
        ? renderKanjiNavigationCharacter(character, options.label)
        : escapeHtml(character),
    ).join('');
}

function renderKanjiNavigationCharacter(character: string, label: string): string {
    const safeCharacter = escapeHtml(character);
    return `<button class="jpdb-reader-kanji-inline" type="button" data-action="kanji" data-kanji="${safeCharacter}" title="${escapeHtml(`${label}: ${character}`)}">${safeCharacter}</button>`;
}

function isKanjiForInlineNavigation(value: string): boolean {
    const code = value.codePointAt(0) ?? 0;
    return code >= 0x3400 && code <= 0x9fff;
}

function isVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    if (!isVisibleRect(rect)) return false;
    const style = safeComputedStyle(element);
    return isVisibleStyle(style);
}

function isVisibleRect(rect: DOMRect): boolean {
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
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

function hasUiBox(style: CSSStyleDeclaration): boolean {
    return hasVisibleControlLinkBox(style) || Number.parseFloat(style.borderRadius) > 0;
}

function hasInlineControlShape(display: string): boolean {
    return display === 'inline-flex' || display === 'inline-grid' || display === 'inline-block' || display === 'flex';
}

function isLikelyProseElement(element: HTMLElement): boolean {
    if (PROSE_TAGS.includes(`,${element.tagName},`)) return true;
    return isLikelyProseClass(element) || isConversationTextClass(element);
}

function isReadableProseContext(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current && current !== document.body && current !== document.documentElement) {
        if (isLikelyProseElement(current) && current.closest(READABLE_PROSE_CONTAINER_SELECTOR)) return true;
        if (isConversationTextClass(current)) return true;
        current = current.parentElement;
    }
    return false;
}

function isLikelyProseClass(element: HTMLElement): boolean {
    return PROSE_CLASS_RE.test(elementClassName(element));
}

function isConversationTextClass(element: HTMLElement): boolean {
    return CONVERSATION_TEXT_CLASS_RE.test(elementClassName(element));
}

function elementClassName(element: HTMLElement): string {
    return String(element.className || '');
}

function cssPixels(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
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

function isLikelyProseLink(link: HTMLElement, element: HTMLElement): boolean {
    return Boolean(link.closest('article, main, [role="main"]') && isLikelyProseElement(element));
}

function isExplicitControlLink(link: HTMLElement): boolean {
    return UI_CLASS_RE.test(link.className || '') || link.hasAttribute('onclick') || link.hasAttribute('data-audio');
}

function linkHasControlMedia(link: HTMLElement): boolean {
    return Boolean(safeQuerySelector(link, 'svg, use, img, [class*="icon" i], [class*="audio" i], [class*="sound" i], [class*="speaker" i], [class*="play" i]'));
}

function linkHasControlShape(link: HTMLElement, text: string): boolean {
    const style = safeComputedStyle(link);
    const rect = link.getBoundingClientRect();
    return hasControlLinkStyle(style) && hasShortControlLinkText(link, text) && hasControlLinkWidth(rect);
}

function safeElementMatches(element: HTMLElement, selector: string): boolean {
    try {
        return element.matches(selector);
    } catch {
        return false;
    }
}

function safeQuerySelector(root: HTMLElement, selector: string): Element | null {
    try {
        return root.querySelector(selector);
    } catch {
        return null;
    }
}

function safeComputedStyle(element: HTMLElement): CSSStyleDeclaration {
    try {
        return getComputedStyle(element);
    } catch {
        return element.style;
    }
}

function hasShortControlLinkText(link: HTMLElement, text: string): boolean {
    return compactLength(text) <= 16 && compactLength(link.textContent ?? '') <= 40;
}

function compactLength(value: string): number {
    return Array.from(value.replace(/\s+/g, '')).length;
}

function hasControlLinkWidth(rect: DOMRect): boolean {
    return rect.width > 0 && rect.width < 360;
}

function hasControlLinkStyle(style: CSSStyleDeclaration): boolean {
    return hasControlLinkDisplay(style.display)
        || Number.parseFloat(style.borderRadius) > 0
        || hasVisibleControlLinkBox(style);
}

function hasControlLinkDisplay(display: string): boolean {
    return display.includes('flex') || display.includes('grid') || display === 'inline-block';
}

function hasVisibleControlLinkBox(style: CSSStyleDeclaration): boolean {
    return Boolean(style.backgroundColor && style.backgroundColor !== CORE_COLOR_TOKENS.transparentBlack)
        || hasVisibleBorderSide(style.borderTopStyle, style.borderTopWidth)
        || hasVisibleBorderSide(style.borderBottomStyle, style.borderBottomWidth);
}

function hasVisibleBorderSide(style: string, width: string): boolean {
    return Boolean(style && style !== 'none' && style !== 'hidden' && cssPixels(width) > 0);
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

export function makeRoomForRubyInCroppedRows(root: ParentNode = document): number {
    const adjustedBoxes = new Set<HTMLElement>();
    for (let pass = 0; pass < RUBY_ROOM_SWEEP_MAX_PASSES; pass += 1) {
        if (!makeRoomForRubyInCroppedRowsOnce(root, adjustedBoxes)) break;
    }
    return adjustedBoxes.size;
}

function makeRoomForRubyInCroppedRowsOnce(root: ParentNode, adjustedBoxes: Set<HTMLElement>): number {
    // Two phases: measure everything first, then write. Interleaving the
    // per-box writes (min-height/height) with the next word's layout reads
    // forces a synchronous reflow per annotated word — on a YouTube feed
    // that is hundreds of reflows per sweep.
    const decisions = new Map<HTMLElement, { roomHeight: number; topDeficit: number }>();
    const words = root.querySelectorAll<HTMLElement>('.jpdb-reader-word');
    for (const word of words) {
        if (!word.querySelector('rt')) continue;
        for (const box of cropCapableBoxes(word.parentElement)) {
            if (box.closest(RUBY_ROOM_HARD_SKIP_SELECTOR) || box.closest('[aria-hidden="true"],[hidden]')) continue;
            // Curated YouTube/Google rows grow on any crop signal (their crop
            // is always ruby-caused). Every OTHER site's clamped/ellipsis/
            // clipped row grows only when the RUBY itself overflows the box —
            // plain scroll overflow there usually means an intentionally
            // collapsed read-more region, which must stay collapsed.
            const curated = isGoogleSearchRubyRoomTextBox(box) || isYouTubeRubyRoomTextBox(box);
            if (curated ? !boxActuallyCrops(box) : !genericRubyNeedsRoom(box)) continue;
            for (const roomBox of rubyRoomBoxesForCroppedBox(box, curated)) {
                const roomHeight = curated ? rubyRoomHeight(roomBox) : genericRubyRoomHeight(roomBox);
                if (roomHeight > RUBY_ROOM_MAX_PX) continue;
                // Repeat passes only correct HEIGHT under-growth (content can
                // rewrap once the box grows); top padding is exact on first
                // application and must not accumulate across passes.
                const topDeficit = adjustedBoxes.has(roomBox) ? 0 : rubyTopClearanceDeficit(roomBox);
                if (previousRubyRoomHeight(roomBox) >= roomHeight + topDeficit && !topDeficit) continue;
                if ((decisions.get(roomBox)?.roomHeight ?? 0) >= roomHeight + topDeficit) continue;
                decisions.set(roomBox, { roomHeight: roomHeight + topDeficit, topDeficit });
            }
        }
    }
    let adjusted = 0;
    for (const [box, { roomHeight, topDeficit }] of decisions) {
        box.dataset.yomuRubyRoom = 'true';
        box.dataset.yomuRubyRoomHeight = String(roomHeight);
        makeRoomForRubyInBox(box, safeComputedStyle(box), roomHeight, topDeficit);
        adjustedBoxes.add(box);
        adjusted += 1;
    }
    return adjusted;
}

// Growing a row reveals a reading cropped at the BOTTOM, but a reading pinned
// against (or above) the row's TOP edge stays shaved no matter how tall the
// row gets: min-height grows downward while the line stays top-anchored (a
// chip whose label line-height equals the chip height puts the annotation
// flush with the overflow-hidden edge). The missing clearance becomes
// padding-top, which pushes the text down into the freshly grown room.
const RUBY_ROOM_TOP_CLEARANCE_PX = 1;
const RUBY_ROOM_TOP_PAD_MAX_PX = 24;

function rubyTopClearanceDeficit(box: HTMLElement): number {
    const raw = rubyTopOverflowRaw(box);
    // A reading genuinely above the box top always needs the push-down; a
    // merely flush reading only counts on single-line rows (rubyTouchesBoxTop)
    // where the flush edge is the clip edge.
    if (raw <= 0 && !rubyTouchesBoxTop(box)) return 0;
    if (raw <= -RUBY_ROOM_TOP_CLEARANCE_PX) return 0;
    const applied = previousRubyRoomTopPad(box);
    const deficit = Math.ceil(raw + RUBY_ROOM_TOP_CLEARANCE_PX);
    return applied + deficit > RUBY_ROOM_TOP_PAD_MAX_PX ? 0 : deficit;
}

function previousRubyRoomTopPad(box: HTMLElement): number {
    const value = Number(box.dataset.yomuRubyRoomPadTop ?? '');
    return Number.isFinite(value) ? value : 0;
}

function rubyCropsBox(box: HTMLElement): boolean {
    return rubyBottomOverflow(box) > 1 || rubyTouchesBoxTop(box) || rubyMirrorBlockOverflow(box) > 1;
}

// A reading pinned within a hair of the box's top edge is already shaved by
// rounding/anti-aliasing even when it does not measurably overflow — treat
// "flush with the top" as cropped so the row gains clearance. Only single-line
// rows (chips, tabs, action labels) qualify: a multi-line clamp box crops at
// its BOTTOM, and its first-line annotation legitimately starts at the top.
function rubyTouchesBoxTop(box: HTMLElement): boolean {
    const style = safeComputedStyle(box);
    const lineHeight = cssPixels(style.lineHeight) || (cssPixels(style.fontSize) || 16) * 1.4;
    if (!box.clientHeight || box.clientHeight > lineHeight * 1.8) return false;
    return rubyTopOverflowRaw(box) > -RUBY_ROOM_TOP_CLEARANCE_PX;
}

function genericRubyNeedsRoom(box: HTMLElement): boolean {
    return rubyCropsBox(box) || rubyLayoutOverflowsShortRow(box) || rubyOverflowsCompactClippedRow(box);
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
function rubyOverflowsCompactClippedRow(box: HTMLElement): boolean {
    const clientHeight = box.clientHeight;
    if (clientHeight <= 0 || clientHeight > RUBY_ROOM_SHORT_ROW_MAX_PX) return false;
    if (isReadableProseContext(box)) return false;
    // A visually-hidden box is a measurement wrapper (e.g. the attributed-string
    // host whose only visible content is an out-of-flow mirror) — its clipping
    // is invisible, so sizing it does nothing but risk double-growth against the
    // real display row that also gets room. The visible display ancestor is
    // caught on its own.
    if (isVisuallyHiddenBox(box)) return false;
    if (!box.querySelector('.jpdb-reader-word rt,.jpdb-reader-text-mirror[data-jpdb-reader-has-ruby="true"]')) return false;
    const overflow = compactClippedRubyOverflow(box) - clientHeight;
    return overflow > 2 && overflow <= RUBY_ROOM_SHORT_ROW_OVERFLOW_MAX_PX;
}

function isVisuallyHiddenBox(box: HTMLElement): boolean {
    const visibility = safeComputedStyle(box).visibility;
    return visibility === 'hidden' || visibility === 'collapse';
}

// Whichever paint path the row uses: destructive in-flow ruby raises the box's
// own scrollHeight; a non-destructive mirror is absolutely positioned (out of
// flow) so the true furigana'd height is the mirror's scrollHeight instead.
function compactClippedRubyOverflow(box: HTMLElement): number {
    const mirror = box.querySelector<HTMLElement>('.jpdb-reader-text-mirror[data-jpdb-reader-has-ruby="true"]');
    return Math.max(box.scrollHeight, mirror ? mirror.scrollHeight : 0);
}

// Generic rows must never inherit scrollHeight (a collapsed region's full
// content height); the room is the visible height plus exactly the ruby
// overflow the box is cropping.
function genericRubyRoomHeight(box: HTMLElement): number {
    const mirror = box.querySelector<HTMLElement>('.jpdb-reader-text-mirror[data-jpdb-reader-has-ruby="true"]');
    const shortRowHeight = rubyLayoutOverflowsShortRow(box) ? box.scrollHeight : 0;
    const compactRowHeight = rubyOverflowsCompactClippedRow(box) ? compactClippedRubyOverflow(box) : 0;
    return Math.ceil(Math.max(
        box.clientHeight + rubyBottomOverflow(box) + rubyTopOverflow(box),
        mirror ? mirror.scrollHeight : 0,
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

function rubyRoomBoxesForCroppedBox(box: HTMLElement, curated: boolean): HTMLElement[] {
    if (!curated) return [box];
    const boxes = [box];
    const googleControl = googleSearchRubyRoomControl(box);
    if (googleControl && googleControl !== box) boxes.push(googleControl);
    return boxes;
}

function googleSearchRubyRoomControl(box: HTMLElement): HTMLElement | null {
    if (!/(^|\.)google\./i.test(location.hostname) || location.pathname !== '/search') return null;
    const control = box.closest<HTMLElement>(RUBY_ROOM_GOOGLE_CONTROL_SELECTOR);
    if (!control || !safeElementMatches(control, RUBY_ROOM_GOOGLE_TEXT_BOX_SELECTOR)) return null;
    if (!control.querySelector('.jpdb-reader-text-mirror[data-jpdb-reader-has-ruby="true"]')) return null;
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

function cropCapableBoxes(element: HTMLElement | null): HTMLElement[] {
    const boxes: HTMLElement[] = [];
    let fallback: HTMLElement | undefined;
    let current: HTMLElement | null = element;
    while (current && current !== document.body && current !== document.documentElement) {
        if (current.dataset.jpdbReaderRoot) break;
        if (boxStyleIsClipCapable(current) || rubyLayoutOverflowsShortRow(current)) {
            boxes.push(current);
        } else if (!fallback && isYouTubeRubyRoomTextBox(current) && current.querySelector('.jpdb-reader-text-mirror')) {
            fallback = current;
        }
        current = current.parentElement;
    }
    return boxes.length || !fallback ? boxes : [fallback];
}

// The style-only half of the crop-capable verdict (clamp/ellipsis/clipped) is a
// getComputedStyle read per ANCESTOR per annotated word — on a YouTube feed the
// same shared ancestors (list container, section, watch-flexy) are re-classified
// hundreds of times per sweep. A short-TTL memo (same pattern as
// shortRowVerdicts) collapses those repeats to one read while still expiring
// fast enough to catch a host that flips its own clamp/overflow styling.
const clipCapableStyleVerdicts = new WeakMap<HTMLElement, { at: number; value: boolean }>();

function boxStyleIsClipCapable(box: HTMLElement): boolean {
    const now = Date.now();
    const memo = clipCapableStyleVerdicts.get(box);
    if (memo && now - memo.at < CONSTRAINED_ROW_VERDICT_TTL_MS) return memo.value;
    const style = safeComputedStyle(box);
    const value = hasLineClamp(style) || isEllipsisTextRow(style) || hasClippedTextConstraint(style);
    clipCapableStyleVerdicts.set(box, { at: now, value });
    return value;
}

const shortRowVerdicts = new WeakMap<HTMLElement, { at: number; value: boolean }>();

function rubyLayoutOverflowsShortRow(box: HTMLElement): boolean {
    const now = Date.now();
    const memo = shortRowVerdicts.get(box);
    if (memo && now - memo.at < CONSTRAINED_ROW_VERDICT_TTL_MS) return memo.value;
    const value = rubyLayoutOverflowsShortRowUncached(box);
    shortRowVerdicts.set(box, { at: now, value });
    return value;
}

function rubyLayoutOverflowsShortRowUncached(box: HTMLElement): boolean {
    if (safeElementMatches(box, '.jpdb-reader-word,ruby,rt,.jpdb-reader-furi,.jpdb-reader-ruby-base')) return false;
    const clientHeight = box.clientHeight;
    if (clientHeight <= 0 || clientHeight > RUBY_ROOM_SHORT_ROW_MAX_PX) return false;
    // Descendant ruby check LAST and only for plausibly-short boxes — a
    // subtree query per ancestor (at high levels: most of the document) was
    // the hot path of the clamp sweep on large pages.
    if (!box.querySelector('.jpdb-reader-word rt,.jpdb-reader-text-mirror[data-jpdb-reader-has-ruby="true"]')) return false;
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

function boxActuallyCrops(box: HTMLElement): boolean {
    return box.scrollHeight > box.clientHeight + 1
        || rubyBottomOverflow(box) > 1
        || rubyTouchesBoxTop(box)
        || rubyMirrorBlockOverflow(box) > 1;
}

function rubyRoomHeight(box: HTMLElement): number {
    // Furigana is painted by the absolutely-positioned text mirror, which is
    // out of flow and so never raises box.scrollHeight. Its scrollHeight is the
    // true rendered height of the furigana'd, wrapped text, so use it as a floor
    // — otherwise a two-line furigana'd title reserves only its base-line height
    // and the top furigana row / wrapped line is cropped.
    const mirror = box.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
    const mirrorHeight = mirror ? mirror.scrollHeight : 0;
    const measuredHeight = Math.max(
        box.scrollHeight,
        box.clientHeight + rubyBottomOverflow(box) + rubyTopOverflow(box),
        mirrorHeight,
    );
    const wrappedMirror = mirrorHeight >= RUBY_ROOM_WRAPPED_MIRROR_MIN_HEIGHT_PX
        && mirrorHeight > box.clientHeight + RUBY_ROOM_WRAPPED_MIRROR_MIN_DELTA_PX;
    return Math.ceil(measuredHeight + (wrappedMirror ? RUBY_ROOM_WRAPPED_MIRROR_SETTLE_BUFFER_PX : 0));
}

function rubyMirrorBlockOverflow(box: HTMLElement): number {
    const mirror = box.querySelector<HTMLElement>('.jpdb-reader-text-mirror[data-jpdb-reader-has-ruby="true"]');
    if (!mirror) return 0;
    return Math.max(0, mirror.scrollHeight - box.clientHeight);
}

// Furigana paints ABOVE the base line without growing the line box, so a
// fixed-height overflow-hidden row (a chip label) clips the reading at the
// box TOP while scrollHeight and bottom overflow both read clean. Measure the
// rt annotations directly.
function rubyTopOverflow(box: HTMLElement): number {
    return Math.max(0, rubyTopOverflowRaw(box));
}

// Raw signed clearance: positive = the reading pokes above the box top,
// negative = how much breathing room it has. -Infinity when the box has no
// visible annotated word at all.
function rubyTopOverflowRaw(box: HTMLElement): number {
    const boxRect = box.getBoundingClientRect();
    let overflow = Number.NEGATIVE_INFINITY;
    for (const ruby of box.querySelectorAll<HTMLElement>('ruby')) {
        const base = ruby.querySelector<HTMLElement>('.jpdb-reader-ruby-base') ?? ruby;
        if (!baseVisibleInBox(base.getBoundingClientRect(), boxRect)) continue;
        const rt = ruby.querySelector<HTMLElement>('rt');
        if (!rt) continue;
        overflow = Math.max(overflow, boxRect.top - rt.getBoundingClientRect().top);
    }
    return overflow;
}

function rubyBottomOverflow(box: HTMLElement): number {
    const boxRect = box.getBoundingClientRect();
    let overflow = 0;
    for (const ruby of box.querySelectorAll<HTMLElement>('ruby')) {
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
