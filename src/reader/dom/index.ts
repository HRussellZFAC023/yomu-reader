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
const BASE_SKIP_SELECTOR = 'script,style,noscript,textarea,input,select,option,svg,use,[aria-hidden=true],[contenteditable=true],[role=checkbox],[role=radio],[role=tab],[data-jpdb-reader-surface-ignore],[data-audio],[class*="audio" i],[class*="sound" i],[class*="speaker" i],[class*="voice" i],.jpdb-reader-text-mirror,.jpdb-reader-control-text-mirror,.jpdb-reader-word,.subsection-pitch-accent .subsection';
const BASE_SKIP_SELECTOR_WITHOUT_TAB = BASE_SKIP_SELECTOR.replace(',[role=tab]', '');
const FORM_BOUNDARY_SKIP_SELECTOR = 'form,label,fieldset,legend';
const PLAYER_CHROME_SKIP_SELECTOR = '[class*="control" i],[class*="toggle" i],[class*="player" i]';

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
const PASSIVE_AWARE_FRAGMENT_SKIP_SELECTOR = 'script,style,noscript,textarea,input,select,option,svg,use,[hidden],[aria-hidden="true"],[contenteditable="true"],.jpdb-reader-text-mirror,.jpdb-reader-control-text-mirror,.jpdb-reader-word,.subsection-pitch-accent .subsection,[data-jpdb-reader-root]';
const FORM_CHROME_BOUNDARY_TAGS = ',FORM,LABEL,FIELDSET,LEGEND,';
const UI_CLASS_RE = /(^|[-_\s])(audio|badge|chip|control|icon|label|play|required|sound|speaker|tab|tag)([-_\s]|$)/i;
const PROSE_CLASS_RE = /(^|[-_\s])(body|content|copy|description|lead|paragraph|prose|text|txt)([-_\s]|$)/i;
const CONVERSATION_TEXT_CLASS_RE = /(^|[-_\s])(chat|comment|message|post|reply)(?:[-_\s]*(body|content|copy|text|txt))?([-_\s_]|$)/i;
const READABLE_PROSE_CONTAINER_SELECTOR = 'article,main,[role=main],[role=article]';
const DISPLAY_HEADING_RE = /^H[1-6]$/;
const DISPLAY_HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6';
const PASSIVE_INTERACTION_SELECTOR = 'a[href],button,summary,label,[role="button"],[role="link"],[role="menuitem"],[role="option"],[role="tab"],[role="checkbox"],[role="radio"],[role="switch"],[aria-controls],[aria-expanded],[slot="more-button"],.more-button,#more,#less';
const COMPACT_PASSIVE_INTERACTION_SELECTOR = '[onclick],[tabindex]:not([tabindex="-1"]),[class*="audio" i],[class*="button" i],[class*="control" i],[class*="play" i],[class*="sound" i],[class*="speaker" i],[class*="toggle" i]';
const PASSIVE_INTERACTION_BOUNDARY_SELECTOR = `${PASSIVE_INTERACTION_SELECTOR},${COMPACT_PASSIVE_INTERACTION_SELECTOR}`;
const RICH_YOUTUBE_RUBY_ALLOWED_SELECTOR = 'ytd-watch-metadata,ytm-watch-metadata,ytm-slim-video-metadata-section-renderer,ytm-expandable-video-description-body-renderer,ytm-structured-description-content-renderer,ytd-comment-view-model,ytd-comments,ytd-transcript-segment-renderer,ytm-transcript-segment-renderer,yt-live-chat-renderer,yt-live-chat-text-message-renderer,yt-live-chat-paid-message-renderer,yt-live-chat-membership-item-renderer';
const YOUTUBE_FEEDBACK_CHROME_SELECTOR = 'yt-touch-feedback-shape[aria-hidden=true],yt-interaction[aria-hidden=true]';
const COMPACT_YOUTUBE_FEEDBACK_LINK_CONTEXT_SELECTOR = 'ytd-rich-grid-renderer,ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,ytd-watch-next-secondary-results-renderer,ytm-rich-grid-renderer,ytm-video-with-context-renderer';
const COMPACT_MEDIA_CARD_CONTEXT_SELECTOR = '[class*="card" i],[class*="grid" i],[class*="item" i],[class*="lockup" i],[class*="movie" i],[class*="poster" i],[class*="thumb" i],[class*="tile" i],[class*="video" i]';
const MEDIA_CAROUSEL_CLASS_RE = /banner|carousel|rail|scroll|shelf|slick|slider|splide|swiper/i;
const EXPLICIT_MEDIA_CAROUSEL_CLASS_RE = /carousel|rail|shelf|slick|slider|splide|swiper/i;
const COMPACT_MEDIA_CARD_MEDIA_SELECTOR = 'canvas,img,picture,svg,video,[class*="cover" i],[class*="image" i],[class*="poster" i],[class*="thumb" i]';
const COMPACT_MEDIA_CARD_TEXT_LIMIT = 120;
const COMPACT_MEDIA_CARD_LINK_TEXT_LIMIT = 180;
const COMPACT_MEDIA_CHROME_TEXT_LIMIT = 40;
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
    layoutSensitive?: boolean;
    passiveInteraction?: boolean;
    singlePassScan?: boolean;
    nonDestructive?: boolean;
    forceInlineRender?: boolean;
    controlTextMirror?: boolean;
    controlSelectTextMode?: 'options' | 'selected';
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
    layoutSensitive?: boolean;
    passiveInteraction?: boolean;
    singlePassScan?: boolean;
    nonDestructive?: boolean;
    forceInlineRender?: boolean;
    controlTextMirror?: boolean;
    controlSelectTextMode?: 'options' | 'selected';
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
}

interface FragmentTextTargetCollectionOptions {
    allowUiText?: boolean;
    minLength?: number;
    includeReaderRoot?: boolean;
    includeUiChrome?: boolean;
    includeFormChrome?: boolean;
    includeTabChrome?: boolean;
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
    visibility: string;
    visibilityPriority: string;
    overflow: string;
    overflowPriority: string;
    position: string;
    positionPriority: string;
    positioned: boolean;
    display: string;
    displayPriority: string;
    displayAdjusted: boolean;
}

interface ControlTextMirrorHostState {
    onChange: () => void;
    placeholderHidden: boolean;
    placeholderHiddenAttribute: string | null;
    parent?: HTMLElement;
    parentPosition: string;
    parentPositionPriority: string;
    parentPositionAdjusted: boolean;
}

const READER_WORD_SELECTOR = '.jpdb-reader-word';
const READER_TEXT_MIRROR_SELECTOR = '.jpdb-reader-text-mirror';
const READER_CONTROL_TEXT_MIRROR_SELECTOR = '.jpdb-reader-control-text-mirror';
const READER_CONTROL_PLACEHOLDER_HIDDEN_ATTRIBUTE = 'data-jpdb-reader-control-placeholder-hidden';
const NON_DESTRUCTIVE_TEXT_HOST_SELECTOR = 'yt-formatted-string,yt-attributed-string,.ytAttributedStringHost,.yt-core-attributed-string,.yt-core-attributed-string--white-space-pre-wrap';
const TEXT_MIRROR_NATIVE_TEXT_SKIP_SELECTOR = `${READER_TEXT_MIRROR_SELECTOR},script,style,noscript,template,[hidden],[aria-hidden="true"]`;
const TEXT_MIRROR_ARIA_LABEL_SKIP_SELECTOR = `${READER_TEXT_MIRROR_SELECTOR},[hidden],[aria-hidden="true"]`;
const RENDERED_SCAN_HOST_MAX_TEXT = 1000;
const RENDERED_SCAN_HOST_REJECTION_WINDOW_MS = 15000;
const RENDERED_SCAN_HOST_REJECTION_RESET_MS = 60000;
const RENDERED_SCAN_HOST_RESCAN_DELAYS_MS = [700, 1600, 4000, 10000];
export const NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT = 'jpdb-reader-text-mirror-stale';
const renderedScanHosts = new WeakMap<HTMLElement, RenderedScanHost>();
const textMirrorHosts = new WeakMap<HTMLElement, TextMirrorHostState>();

export function getSelectionText(): string {
    const selection = window.getSelection();
    return selection?.toString().replace(/\s+/g, ' ').trim() ?? '';
}

export function getSelectionSentence(): string {
    const selected = getSelectionText();
    const fullText = selectionHostText(window.getSelection());
    if (!fullText || !selected) return selected;

    return sentenceAroundSurface(fullText, selected) || selected;
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
const ANNOTATABLE_CONTROL_SELECTOR = 'button, summary, [role="button"], [role="tab"], [role="menuitem"]';

function isAnnotatableChipControl(blocked: Element): boolean {
    if (!blocked.matches(ANNOTATABLE_CONTROL_SELECTOR)) return false;
    const control = blocked.closest(ANNOTATABLE_CONTROL_SELECTOR) ?? blocked;
    const text = control.textContent?.replace(/\s+/g, '').trim() ?? '';
    return text.length > 0 && text.length <= CONTROL_LABEL_TEXT_LIMIT && HAS_JAPANESE.test(text);
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
    const blocked = parent.closest(SKIP_SELECTOR);
    if (blocked && !isAnnotatableChipControl(blocked)) return true;
    if (isInsideExcludedReaderRoot(parent, options)) return true;
    if (isShortCenteredDisplayHeading(parent, text)) return true;
    return shouldRejectTextTargetPresentation(parent, text, visibleOnly);
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
    const suppressRuby = shouldSuppressCompactMediaRuby(parent);
    const passiveInteraction = isPassiveInteractionElement(parent) || suppressRuby;
    const text = nodeTextContent(node).trim();
    return {
        node: node as Text,
        text,
        parent,
        hasNativeRuby: Boolean(parent.closest('ruby')),
        suppressRuby,
        layoutSensitive: isLayoutSensitiveScanElement(parent) || isGeometryFragileText(parent, text),
        passiveInteraction,
    };
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
    };
}

function isCollectableFormControlTextElement(
    control: HTMLElement,
    visibleOnly: boolean,
    options: FormControlTextTargetCollectionOptions,
): boolean {
    if (control.closest(READER_CONTROL_TEXT_MIRROR_SELECTOR)) return false;
    if (!options.includeReaderRoot && control.closest(READER_ROOT_SELECTOR)) return false;
    if (options.excludeSelector && (safeElementMatches(control, options.excludeSelector) || control.closest(options.excludeSelector))) return false;
    if (isDisabledFormControl(control) || isUnlookupableFormControl(control)) return false;
    return !visibleOnly || isVisible(control);
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
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        pushUniqueControlText(parts, formFieldPlaceholderText(control));
        if (control.value.trim()) return parts.join(' / ');
    }
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

function formFieldPlaceholderText(control: HTMLInputElement | HTMLTextAreaElement): string {
    if (control.value.trim()) return '';
    return normalizedControlText(control.getAttribute('placeholder') ?? '');
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
    const suppressRuby = fragmentTargetSuppressesCompactMediaRuby(parent, trimmedFragments);
    return {
        text,
        parent,
        fragments: trimmedFragments,
        suppressRuby,
        layoutSensitive: trimmedFragments.some(fragment => fragment.layoutSensitive),
        passiveInteraction: suppressRuby || trimmedFragments.every(fragment => fragment.passiveInteraction),
    };
}

function fragmentTargetSuppressesCompactMediaRuby(parent: HTMLElement, fragments: TextFragment[]): boolean {
    if (shouldSuppressCompactMediaRuby(parent)) return true;
    return fragments.some(fragment => {
        const element = fragment.node.parentElement;
        return Boolean(element && shouldSuppressCompactMediaRuby(element));
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
    return !isRoot && shouldSkipFragmentElement(element, state.options);
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
    if (!explicitInteraction
        && safeElementMatches(element, COMPACT_PASSIVE_INTERACTION_SELECTOR)
        && !isCompactPassiveInteractionElement(element)) {
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
    if (element.closest(PASSIVE_INTERACTION_SELECTOR)) return true;
    const compactInteraction = element.closest<HTMLElement>(COMPACT_PASSIVE_INTERACTION_SELECTOR);
    if (!compactInteraction) return false;
    if (!isCompactPassiveInteractionElement(compactInteraction)) return false;
    return true;
}

function isCompactPassiveInteractionElement(element: HTMLElement): boolean {
    const text = element.textContent?.replace(/\s+/g, '').trim() ?? '';
    if (!text || text.length > COMPACT_PASSIVE_INTERACTION_TEXT_LIMIT) return false;
    return element.childElementCount <= 4;
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

export function applyTokensToScanTarget(target: ScanTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (target.controlTextMirror) {
        applyTokensToControlTextMirrorTarget(target, tokens, settings);
        return;
    }
    if (!target.forceInlineRender && (target.nonDestructive || scanHostIsRepaintLooping(nonDestructiveScanHost(target), target.text))) {
        applyTokensToNonDestructiveScanTarget(target, tokens, settings);
        return;
    }
    if (isFragmentTextTarget(target)) applyTokensToFragmentTarget(target, tokens, settings);
    else applyTokensToTextNode(target, tokens, settings);
}

export function applyTokensToTextNode(target: TextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (!tokens.length || !target.node.parentElement) return;

    const text = target.text;
    const safeTokens = nonOverlappingTokens(tokens, text.length);
    if (!safeTokens.length) return;

    target.node.replaceWith(renderTokenizedTextFragment(target, safeTokens, settings));
    markRenderedScanTarget(target);
}

function renderTokenizedTextFragment(target: TextTarget, tokens: JPDBToken[], settings: ReaderSettings): DocumentFragment {
    const fragment = renderTokenizedScanText(target.text, tokens, settings, {
        parent: target.parent,
        hasNativeRuby: target.hasNativeRuby,
        suppressRuby: target.suppressRuby,
        passiveInteraction: target.passiveInteraction,
    });
    return wrapDirectFlexGridTextRun(fragment, target.parent);
}

function renderTokenizedScanText(
    text: string,
    tokens: JPDBToken[],
    settings: ReaderSettings,
    target: { parent: HTMLElement; hasNativeRuby?: boolean; suppressRuby?: boolean; passiveInteraction?: boolean; suppressRubyDoesNotImplyPassive?: boolean },
): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const suppressRuby = scanTargetSuppressesRuby(target.parent, target.suppressRuby);
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
        appendPlainTextBeforeToken(fragment, text, offset, token.start);
        fragment.append(renderToken(text.slice(token.start, token.end), tokenWithSentence, renderSettings, {
            allowRuby: !target.hasNativeRuby && !suppressRuby,
            kanjiNavigation: kanjiNavigationForElement(target.parent),
            scanWord: true,
            passiveInteraction,
            preserveTokenRubies: true,
            miningInsightKeys,
        }));
        offset = token.end;
    }
    appendPlainTextBeforeToken(fragment, text, offset, text.length);
    return fragment;
}

function applyTokensToNonDestructiveScanTarget(target: ScanTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    const host = nonDestructiveScanHost(target);
    if (!host.isConnected) return;

    const text = target.text;
    const safeTokens = nonOverlappingTokens(tokens, text.length);
    const suppressRuby = scanTargetSuppressesRuby(host, target.suppressRuby);
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
    const hasRenderedRuby = !suppressRuby && safeTokens.some(token => token.rubies.length > 0);
    const state = styleTextMirrorHost(host);
    try {
        styleTextMirror(mirror, host, hasRenderedRuby);
        mirror.append(renderTokenizedScanText(text, safeTokens, renderSettings, {
            parent: host,
            hasNativeRuby: targetHasNativeRuby(target),
            suppressRuby,
            passiveInteraction: target.passiveInteraction || suppressRuby,
        }));
        if (!mirror.textContent?.trim()) {
            removeTextMirror(host);
            return;
        }
        hideTextMirrorHost(host, state);
        host.append(mirror);
        observeTextMirrorHost(host, text);
    } catch (error) {
        removeTextMirror(host);
        throw error;
    }
}

function currentTextMirror(host: HTMLElement): HTMLElement | null {
    return Array.from(host.children)
        .find((child): child is HTMLElement => child instanceof HTMLElement && child.matches(READER_TEXT_MIRROR_SELECTOR))
        ?? null;
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
    const suppressRuby = placeholderOverlay || scanTargetSuppressesRuby(host, target.suppressRuby);
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
        suppressRuby,
        passiveInteraction: false,
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
    host.addEventListener('change', state.onChange);
    host.addEventListener('input', state.onChange);
    controlTextMirrorHosts.set(host, state);
}

function removeControlTextMirror(host: HTMLElement): void {
    const state = controlTextMirrorHosts.get(host);
    if (state) {
        host.removeEventListener('change', state.onChange);
        host.removeEventListener('input', state.onChange);
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
        restoreStyleProperty(state.parent, 'position', state.parentPosition, state.parentPositionPriority);
    }
}

function furiganaSettingsForTarget(settings: ReaderSettings, parent: HTMLElement): ReaderSettings {
    if (!targetForcesAllFurigana(parent)) return settings;
    if (settings.showFurigana && settings.furiganaMode === 'all') return settings;
    return { ...settings, showFurigana: true, furiganaMode: 'all' };
}

function scanTargetSuppressesRuby(parent: HTMLElement, suppressRuby?: boolean): boolean {
    if (targetForcesAllFurigana(parent)) return false;
    return Boolean(suppressRuby || shouldSuppressCompactMediaRuby(parent));
}

function targetForcesAllFurigana(parent: HTMLElement): boolean {
    return Boolean(parent.closest('[data-yomu-furigana-mode="all"]'));
}

function shouldSuppressCompactMediaRuby(parent: HTMLElement): boolean {
    if (isYouTubeFeedbackChromeLinkText(parent)) return true;
    if (isYouTubeHost()) return false;
    return isCompactMediaCardLinkText(parent)
        || isCompactPeerMediaCardLinkText(parent)
        || isCompactMediaChromeLinkText(parent)
        || isMediaCarouselText(parent)
        || isLayoutFragileMediaTileText(parent);
}

export function isYouTubeHost(): boolean {
    const hostname = location.hostname.toLowerCase();
    return hostname === 'youtube.com'
        || hostname.endsWith('.youtube.com')
        || hostname === 'youtu.be';
}

function isYouTubeFeedbackChromeLinkText(parent: HTMLElement): boolean {
    if (parent.closest(RICH_YOUTUBE_RUBY_ALLOWED_SELECTOR)) return false;
    const link = parent.closest<HTMLElement>('a[href]');
    if (!link || !link.closest(COMPACT_YOUTUBE_FEEDBACK_LINK_CONTEXT_SELECTOR)) return false;
    return Boolean(safeQuerySelector(link, YOUTUBE_FEEDBACK_CHROME_SELECTOR));
}

function isCompactMediaCardLinkText(parent: HTMLElement): boolean {
    const link = parent.closest<HTMLElement>('a[href]');
    if (!link || parent.closest(RICH_YOUTUBE_RUBY_ALLOWED_SELECTOR)) return false;
    if (!safeQuerySelector(link, COMPACT_MEDIA_CARD_MEDIA_SELECTOR)) return false;
    if (!link.closest(COMPACT_MEDIA_CARD_CONTEXT_SELECTOR)) return false;

    const textLength = compactLength(parent.textContent ?? '');
    if (textLength < 2 || textLength > COMPACT_MEDIA_CARD_TEXT_LIMIT) return false;
    return compactLength(link.textContent ?? '') <= COMPACT_MEDIA_CARD_LINK_TEXT_LIMIT;
}

function isCompactPeerMediaCardLinkText(parent: HTMLElement): boolean {
    const link = parent.closest<HTMLElement>('a[href]');
    if (!link || isLikelyProseLink(link, parent)) return false;
    if (safeQuerySelector(link, COMPACT_MEDIA_CARD_MEDIA_SELECTOR)) return false;

    const textLength = compactLength(parent.textContent ?? '');
    if (textLength < 2 || textLength > COMPACT_MEDIA_CARD_TEXT_LIMIT) return false;
    if (compactLength(link.textContent ?? '') > COMPACT_MEDIA_CARD_LINK_TEXT_LIMIT) return false;

    const context = closestCompactMediaContext(parent);
    if (!context || !context.matches(COMPACT_MEDIA_CARD_CONTEXT_SELECTOR)) return false;
    const linkWidth = link.getBoundingClientRect().width;
    return linkWidth === 0 || linkWidth <= 260;
}

function isCompactMediaChromeLinkText(parent: HTMLElement): boolean {
    const link = parent.closest<HTMLElement>('a[href],button,[role="link"],[role="button"]');
    if (!link || isLikelyProseLink(link, parent)) return false;
    if (!safeQuerySelector(link, COMPACT_MEDIA_CARD_MEDIA_SELECTOR)) return false;

    const textLength = compactLength(parent.textContent ?? '');
    if (textLength < 2 || textLength > COMPACT_MEDIA_CHROME_TEXT_LIMIT) return false;
    if (compactLength(link.textContent ?? '') > COMPACT_MEDIA_CHROME_TEXT_LIMIT) return false;
    return isNavigationChromeContext(link) || hasCompactCenteredMediaChrome(parent, link);
}

function isMediaCarouselText(parent: HTMLElement): boolean {
    const textLength = compactLength(parent.textContent ?? '');
    if (textLength < 2 || textLength > COMPACT_MEDIA_CARD_LINK_TEXT_LIMIT) return false;
    const carousel = closestMediaCarousel(parent);
    if (!carousel) return false;
    if (isReadableProseContext(parent) && !carousel.explicit) return false;
    return true;
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

function hasCompactCenteredMediaChrome(parent: HTMLElement, link: HTMLElement): boolean {
    const parentStyle = safeComputedStyle(parent);
    const linkStyle = safeComputedStyle(link);
    if (parentStyle.textAlign !== 'center' && linkStyle.textAlign !== 'center') return false;
    const rect = link.getBoundingClientRect();
    return rect.width === 0 || rect.width <= 240;
}

function isLayoutFragileMediaTileText(parent: HTMLElement): boolean {
    if (isReadableProseContext(parent)) return false;
    if (!hasCompactMediaRubyRisk(parent)) return false;
    return Boolean(closestCompactMediaContext(parent));
}

function hasCompactMediaRubyRisk(parent: HTMLElement): boolean {
    if (isLayoutSensitiveScanElement(parent)) return true;
    let current: HTMLElement | null = parent;
    for (let depth = 0; current && current !== document.body && current !== document.documentElement && depth < 4; depth++) {
        const style = safeComputedStyle(current);
        if (hasLineClamp(style) || isEllipsisTextRow(style) || hasClippedTextConstraint(style)) return true;
        current = current.parentElement;
    }
    return false;
}

function closestCompactMediaContext(parent: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = parent;
    for (let depth = 0; current && current !== document.body && current !== document.documentElement && depth < 6; depth++) {
        if (isReadableProseContext(current)) return null;
        if (hasMediaPeer(current, parent) && isCompactMediaContext(current)) return current;
        current = current.parentElement;
    }
    return null;
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

function styleTextMirrorHost(host: HTMLElement): TextMirrorHostState {
    const computed = safeComputedStyle(host);
    const state: TextMirrorHostState = {
        observer: new MutationObserver(() => undefined),
        sourceText: '',
        visibility: host.style.getPropertyValue('visibility'),
        visibilityPriority: host.style.getPropertyPriority('visibility'),
        overflow: host.style.getPropertyValue('overflow'),
        overflowPriority: host.style.getPropertyPriority('overflow'),
        position: host.style.getPropertyValue('position'),
        positionPriority: host.style.getPropertyPriority('position'),
        positioned: computed.position === 'static',
        display: host.style.getPropertyValue('display'),
        displayPriority: host.style.getPropertyPriority('display'),
        displayAdjusted: computed.display === 'inline',
    };
    textMirrorHosts.set(host, state);
    host.style.setProperty('overflow', 'visible', 'important');
    if (state.positioned) host.style.setProperty('position', 'relative', 'important');
    if (state.displayAdjusted) host.style.setProperty('display', 'inline-block', 'important');
    return state;
}

function hideTextMirrorHost(host: HTMLElement, state: TextMirrorHostState): void {
    textMirrorHosts.set(host, state);
    host.style.setProperty('visibility', 'hidden', 'important');
    host.style.setProperty('overflow', 'visible', 'important');
    if (state.positioned) host.style.setProperty('position', 'relative', 'important');
    if (state.displayAdjusted) host.style.setProperty('display', 'inline-block', 'important');
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
    mirror.style.setProperty('color', style.color);
    mirror.style.setProperty('z-index', '1');
    if (hasRuby) mirror.dataset.jpdbReaderHasRuby = 'true';
}

function rubyFriendlyMirrorLineHeight(style: CSSStyleDeclaration): string {
    const fontSize = cssPixels(style.fontSize) || 16;
    const existingLineHeight = cssPixels(style.lineHeight) || fontSize * 1.2;
    return `${Math.ceil(Math.max(existingLineHeight, fontSize * 1.62))}px`;
}

function observeTextMirrorHost(host: HTMLElement, sourceText: string): void {
    const state = textMirrorHosts.get(host);
    if (!state) return;
    state.sourceText = normalizedMirrorHostText(sourceText);
    state.observer = new MutationObserver(mutations => {
        if (mutations.every(mutationInsideTextMirror)) return;
        if (!currentTextMirror(host)) {
            removeTextMirror(host);
            return;
        }
        // A YouTube re-render can rewrite the host's own style/class attribute
        // without touching its text, stripping the inline visibility:hidden /
        // position:relative we set. That made the native title re-appear
        // (duplication) or the absolute mirror anchor to the wrong ancestor (the
        // title looking missing/misaligned). Re-assert on host attribute changes;
        // reassertTextMirrorHostStyles only writes a property that was actually
        // stripped, so it cannot loop on the style mutation it makes.
        if (mutations.some(mutation => mutation.type === 'attributes' && mutation.target === host)) {
            reassertTextMirrorHostStyles(host, state);
        }
        if (!mutations.some(mutation => mutation.type === 'childList' || mutation.type === 'characterData')) return;
        const currentText = normalizedMirrorHostText(nativeTextMirrorHostText(host));
        if (!host.isConnected || !HAS_JAPANESE.test(currentText)) {
            removeTextMirror(host);
            return;
        }
        if (currentText !== state.sourceText) {
            reassertTextMirrorHostStyles(host, state);
            dispatchTextMirrorStale(host);
        }
    });
    state.observer.observe(host, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
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
    Array.from(host.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement && child.matches(READER_TEXT_MIRROR_SELECTOR))
        .forEach(mirror => mirror.remove());
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
    if (host.style.getPropertyValue('visibility') !== 'hidden') {
        host.style.setProperty('visibility', 'hidden', 'important');
    }
    if (host.style.getPropertyValue('overflow') !== 'visible') {
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
    restoreStyleProperty(host, 'visibility', state.visibility, state.visibilityPriority);
    restoreStyleProperty(host, 'overflow', state.overflow, state.overflowPriority);
    if (state.positioned) restoreStyleProperty(host, 'position', state.position, state.positionPriority);
    if (state.displayAdjusted) restoreStyleProperty(host, 'display', state.display, state.displayPriority);
}

function restoreStyleProperty(host: HTMLElement, property: string, value: string, priority: string): void {
    if (value) host.style.setProperty(property, value, priority);
    else host.style.removeProperty(property);
}

export function removeNonDestructiveScanMirrors(root: ParentNode = document): number {
    const hosts = new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>(READER_TEXT_MIRROR_SELECTOR).forEach(mirror => {
        if (mirror.parentElement) hosts.add(mirror.parentElement);
    });
    const controlHosts = new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>(READER_CONTROL_TEXT_MIRROR_SELECTOR).forEach(mirror => {
        const host = mirror.previousElementSibling;
        if (host instanceof HTMLElement) controlHosts.add(host);
        else mirror.remove();
    });
    hosts.forEach(removeTextMirror);
    controlHosts.forEach(removeControlTextMirror);
    return hosts.size + controlHosts.size;
}

function appendPlainTextBeforeToken(fragment: DocumentFragment, text: string, start: number, end: number): void {
    if (end > start) fragment.append(document.createTextNode(text.slice(start, end)));
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
    if (rejection.repair) unwrapReaderWords(rejection.match.element);
    return nextRenderedScanHostRescanDelay(rejection.match.host);
}

function classifyReaderRenderRejection(mutation: MutationRecord): { match: { element: HTMLElement; host: RenderedScanHost }; repair: boolean } | null {
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
    return null;
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
        appendPlainTextBeforeToken(replacement, text, offset, plan.localStart);
        replacement.append(renderSingleFragmentToken(target, fragment, plan, settings, miningInsightKeys));
        offset = plan.localEnd;
    }
    appendPlainTextBeforeToken(replacement, text, offset, fragment.end);
    replaceTextNodeRange(fragment.node, fragment.start, fragment.end, wrapDirectFlexGridTextRun(replacement, fragment.node.parentElement));
}

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
        if (token.start > offset) html += escapeHtml(text.slice(offset, token.start));
        html += renderTokenHtml(text.slice(token.start, token.end), token, settings, miningInsightKeys);
        offset = token.end;
    }
    if (offset < text.length) html += escapeHtml(text.slice(offset));
    return html;
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
    const span = createReaderWordSpan(token, options);
    span.dataset.surface = surface;
    if (!options.kanjiNavigation?.enabled && options.passiveInteraction !== true) span.tabIndex = -1;

    const hasRuby = shouldRenderRuby(surface, token, settings, options.allowRuby, options.preserveTokenRubies);
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

interface TokenRenderOptions {
    allowRuby?: boolean;
    kanjiNavigation?: KanjiNavigationRenderOptions;
    scanWord?: boolean;
    passiveInteraction?: boolean;
    // Scan-word renders keep the JPDB-provided ruby spans intact (e.g. 読む -> よむ) instead of
    // re-centering furigana onto bare kanji, which is reserved for the popup token renderers.
    preserveTokenRubies?: boolean;
    miningInsightKeys?: ReadonlySet<string>;
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
    span.className = readerWordClassName(state, token);
    span.dataset.vid = String(token.card.vid);
    span.dataset.sid = String(token.card.sid);
    span.dataset.cardSource = readerCardSource(token.card);
    span.dataset.cardId = String(readerCardId(token.card));
    span.dataset.readingIndex = String(readerReadingIndex(token.card));
    span.dataset.cardState = state;
    span.dataset.pitchClass = safePitchClass(token.pitchClass);
    span.dataset.tokenStart = String(token.start);
    span.dataset.tokenEnd = String(token.end);
    span.dataset.sentence = token.sentence ?? '';
    if (token.card.spelling) span.dataset.expression = token.card.spelling;
    if (token.card.reading) span.dataset.reading = token.card.reading;
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
        span.style.setProperty('display', 'inline', 'important');
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
    const classes = [
        readerWordClassName(state, token),
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
    const deck = renderDeckMembershipAttributes(token.card);
    return `<span class="${classes}" data-vid="${token.card.vid}" data-sid="${token.card.sid}"${source}${cardId}${readingIndex}${cardState}${tokenRange}${surfaceAttr} data-pitch-class="${safePitchClass(token.pitchClass)}" data-sentence="${escapeHtml(token.sentence ?? '')}"${miningInsight}${expression}${reading}${deck} tabindex="-1">${content}</span>`;
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
    if (mode === 'known-status') return !furiganaHiddenStates(settings).has(primaryCardState(token.card.cardState));
    return mode !== 'difficult-kanji' || hasDifficultKanji(surface);
}

function hasDifficultKanji(surface: string): boolean {
    for (const char of surface) {
        if (KANJI_RE.test(char) && !EASY_FURIGANA_KANJI.has(char)) return true;
    }
    return false;
}

function readerWordClassName(state: string, token: JPDBToken): string {
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
    classes.push(`jpdb-pitch-${safePitchClass(token.pitchClass)}`);
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
    return [{
        text: trimmed.reading,
        start: trimmed.offset,
        end: trimmed.offset + trimmed.surface.length,
    }];
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
    return [
        style.backgroundColor !== CORE_COLOR_TOKENS.transparentBlack,
        style.borderTopStyle !== 'none',
        Number(style.borderTopWidth.replace('px', '')) > 0,
        Number(style.borderBottomWidth.replace('px', '')) > 0,
        Number.parseFloat(style.borderRadius) > 0,
    ].some(Boolean);
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
    return style.backgroundColor !== CORE_COLOR_TOKENS.transparentBlack
        || style.borderTopStyle !== 'none'
        || style.borderBottomStyle !== 'none';
}

// UT-70: late-clamp reconciliation. Hosts that hydrate progressively
// (YouTube custom elements on iPad Safari) can apply -webkit-line-clamp /
// ellipsis styles AFTER we annotated, so scan-time layout sensitivity missed
// them and the grown ruby line gets cropped — base text vanishes while the
// furigana sliver stays. Sweep rendered words and strip ruby (keep color +
// lookup) wherever an ancestor is, by now, a layout-sensitive text box.
// UT-70/79 (user direction): when ruby makes a clamped/fixed-height row
// overflow, do NOT strip the furigana — give the box room instead. Crop
// detection stays measurement-based (computed styles + actual overflow, no
// per-site lists); the room is the smallest honest fix per box kind:
// line-clamp boxes keep their line count but lose the plain-text max-height,
// other clipped boxes get their active height cap raised to the real content
// height.
// Containers we must never reserve ruby room on: cards the YouTube filter has
// collapsed/hidden (sizing them un-collapses the filter into giant gaps) and
// any aria-hidden subtree. Scanned words can live inside a collapsed card; room
// must skip them.
const RUBY_ROOM_HARD_SKIP_SELECTOR = '[data-yomu-youtube-filtered],[data-yomu-youtube-pending],[data-yomu-youtube-aria-hidden],.jpdb-youtube-filter-collapsed,.jpdb-youtube-pending';
// YouTube's Polymer/view-model hosts own their measured height. Reserving
// ruby room on them writes inline height/max-height that YouTube treats as
// authoritative, causing watch descriptions to balloon and compact metadata
// rows/action chips to stack or flicker.
const RUBY_ROOM_LAYOUT_HOST_SKIP_SELECTOR = 'ytd-text-inline-expander,yt-attributed-string,yt-formatted-string,.ytAttributedStringHost,.yt-core-attributed-string,.ytContentMetadataViewModelMetadataRow,yt-content-metadata-view-model,yt-button-shape,yt-button-view-model,button,[role="button"],ytd-app,ytm-app,ytd-rich-grid-renderer,ytd-rich-item-renderer,ytd-video-renderer,yt-lockup-view-model,ytm-rich-grid-renderer,ytm-video-with-context-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2,ytm-item-section-renderer';
const RUBY_ROOM_YOUTUBE_TEXT_BOX_SELECTOR = 'ytd-comment-view-model #content-text,ytm-comment-renderer #content-text,ytd-watch-info-text,ytd-watch-metadata :is(h1,#title,#owner,#info,#info-strings,#info-container,#info-text,#metadata,#metadata-line,.ytContentMetadataViewModelMetadataRow,yt-video-metadata-carousel-view-model),.ytContentMetadataViewModelMetadataRow,ytd-transcript-segment-renderer :is(.segment-text,yt-formatted-string),ytm-transcript-segment-renderer,ytm-slim-video-metadata-section-renderer :is(h1,#title,.slim-video-metadata-info),ytm-expandable-video-description-body-renderer p,ytm-structured-description-content-renderer,ytd-rich-item-renderer :is(#video-title-link,#video-title,#metadata-line,ytd-channel-name),ytd-video-renderer :is(#video-title,#metadata-line),:is(ytd-compact-video-renderer,ytd-watch-next-secondary-results-renderer) #video-title,yt-lockup-view-model :is(.ytLockupMetadataViewModelHeadingReset,.ytLockupMetadataViewModelTitle,.ytAttributedStringHost),ytm-video-with-context-renderer .media-item-headline,:is(ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2) h3';
const RUBY_ROOM_GOOGLE_TEXT_BOX_SELECTOR = ':is(#botstuff,#bres,[data-attrid]) :is(a,button,[role="button"])';
// A clamped/ellipsis text row's furigana never needs more than a few lines of
// extra height. A room far larger than this means we measured a container (a
// collapsed card, a virtualized list) rather than a text row — refuse it so a
// mis-measure can never blow the layout up to hundreds of px.
const RUBY_ROOM_MAX_PX = 400;

export function makeRoomForRubyInCroppedRows(root: ParentNode = document): number {
    let adjusted = 0;
    const words = root.querySelectorAll<HTMLElement>('.jpdb-reader-word');
    for (const word of words) {
        if (!word.querySelector('rt')) continue;
        if (word.closest(RUBY_ROOM_HARD_SKIP_SELECTOR)) continue;
        for (const box of cropCapableBoxes(word.parentElement)) {
            if (rubyRoomBoxIsSkipped(box)) continue;
            if (!boxActuallyCrops(box)) continue;
            const roomHeight = rubyRoomHeight(box);
            if (roomHeight > RUBY_ROOM_MAX_PX) continue;
            if (previousRubyRoomHeight(box) >= roomHeight) continue;
            box.dataset.yomuRubyRoom = 'true';
            box.dataset.yomuRubyRoomHeight = String(roomHeight);
            const style = safeComputedStyle(box);
            makeRoomForRubyInBox(box, style, roomHeight);
            adjusted += 1;
        }
    }
    return adjusted;
}

function rubyRoomBoxIsSkipped(box: HTMLElement): boolean {
    if (box.closest(RUBY_ROOM_HARD_SKIP_SELECTOR)) return true;
    if (!safeElementMatches(box, RUBY_ROOM_LAYOUT_HOST_SKIP_SELECTOR)) return false;
    if (isGoogleSearchRubyRoomTextBox(box)) return false;
    return !isYouTubeRubyRoomTextBox(box);
}

function isYouTubeRubyRoomTextBox(box: HTMLElement): boolean {
    if (safeElementMatches(box, 'yt-attributed-string,yt-formatted-string,.ytAttributedStringHost,.yt-core-attributed-string')) {
        return safeElementMatches(box, 'ytd-comment-view-model #content-text,ytm-comment-renderer #content-text');
    }
    return safeElementMatches(box, RUBY_ROOM_YOUTUBE_TEXT_BOX_SELECTOR)
        || Boolean(box.closest(RUBY_ROOM_YOUTUBE_TEXT_BOX_SELECTOR));
}

function isGoogleSearchRubyRoomTextBox(box: HTMLElement): boolean {
    return isGoogleSearchHost()
        && (safeElementMatches(box, RUBY_ROOM_GOOGLE_TEXT_BOX_SELECTOR)
            || Boolean(box.closest(RUBY_ROOM_GOOGLE_TEXT_BOX_SELECTOR)));
}

function isGoogleSearchHost(): boolean {
    const hostname = location.hostname.toLowerCase();
    return /(^|\.)google\./i.test(hostname) && location.pathname === '/search';
}

function makeRoomForRubyInBox(box: HTMLElement, style: CSSStyleDeclaration, roomHeight: number): void {
    if (hasLineClamp(style)) {
        // -webkit-line-clamp itself limits LINES; the crop comes from a height
        // cap sized for plain lines. Lifting it keeps the host's "N lines"
        // semantics with taller ruby lines.
        box.style.setProperty('max-height', 'none', 'important');
        if (hasDefiniteCssSize(style.height)) box.style.setProperty('height', 'auto', 'important');
        // The furigana lives in the out-of-flow absolute mirror, so height:auto
        // collapses to the furigana-less in-flow text and an ancestor with
        // overflow:hidden still crops the ruby. Reserve the real furigana'd
        // height so the box (and content below it) actually accommodates it.
        if (box.querySelector('.jpdb-reader-text-mirror')) {
            box.style.setProperty('min-height', `${roomHeight}px`, 'important');
        }
        return;
    }

    const contentHeight = `${roomHeight}px`;
    if (hasDefiniteCssSize(style.height)) {
        box.style.setProperty('height', contentHeight, 'important');
    }
    if (hasDefiniteCssSize(style.maxHeight) || !hasDefiniteCssSize(style.height)) {
        box.style.setProperty('max-height', contentHeight, 'important');
    }
}

function cropCapableBoxes(element: HTMLElement | null): HTMLElement[] {
    const boxes: HTMLElement[] = [];
    let current: HTMLElement | null = element;
    while (current && current !== document.body && current !== document.documentElement) {
        if (current.dataset.jpdbReaderRoot) break;
        const style = safeComputedStyle(current);
        if (hasLineClamp(style) || isEllipsisTextRow(style) || hasClippedTextConstraint(style)) boxes.push(current);
        current = current.parentElement;
    }
    return boxes;
}

function boxActuallyCrops(box: HTMLElement): boolean {
    return box.scrollHeight > box.clientHeight + 1 || rubyBottomOverflow(box) > 1 || rubyMirrorBlockOverflow(box) > 1;
}

function rubyRoomHeight(box: HTMLElement): number {
    // Furigana is painted by the absolutely-positioned text mirror, which is
    // out of flow and so never raises box.scrollHeight. Its scrollHeight is the
    // true rendered height of the furigana'd, wrapped text, so use it as a floor
    // — otherwise a two-line furigana'd title reserves only its base-line height
    // and the top furigana row / wrapped line is cropped.
    const mirror = box.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
    const mirrorHeight = mirror ? mirror.scrollHeight : 0;
    return Math.ceil(Math.max(box.scrollHeight, box.clientHeight + rubyBottomOverflow(box), mirrorHeight));
}

function rubyMirrorBlockOverflow(box: HTMLElement): number {
    const mirror = box.querySelector<HTMLElement>('.jpdb-reader-text-mirror[data-jpdb-reader-has-ruby="true"]');
    if (!mirror) return 0;
    return Math.max(0, mirror.scrollHeight - box.clientHeight);
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
