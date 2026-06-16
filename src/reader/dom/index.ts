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
const BLOCK_FLOW_TAG_NAMES = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIALOG', 'DIV', 'DL', 'DT',
    'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD',
    'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);
const EASY_FURIGANA_KANJI = new Set(
    '一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒'
        .split(''),
);
// Shared building blocks for the four skip-selector lists below. Each list composes the common
// BASE entries with whichever extra clusters apply; the joined string must stay set-equal to the
// hand-written original for each list (entry order does not affect matching).
const BASE_SKIP_SELECTOR_ENTRIES = [
    'script',
    'style',
    'noscript',
    'textarea',
    'input',
    'select',
    'option',
    'svg',
    'use',
    '[aria-hidden="true"]',
    '[contenteditable="true"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[data-audio]',
    '[class*="audio" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class*="voice" i]',
    '.jpdb-reader-text-mirror',
    '.jpdb-reader-word',
    // UT-64: jpdb.io structural widgets. The pitch diagram is per-mora
    // letter soup, but "Kanji used" spellings are real JPDB links and should
    // keep the same ruby/color treatment as other dictionary terms.
    '.subsection-pitch-accent .subsection',
];
const FORM_BOUNDARY_SKIP_ENTRIES = ['form', 'label', 'fieldset', 'legend'];
const PLAYER_CHROME_SKIP_ENTRIES = ['[class*="control" i]', '[class*="toggle" i]', '[class*="player" i]'];

const SKIP_SELECTOR = [
    ...BASE_SKIP_SELECTOR_ENTRIES,
    ...FORM_BOUNDARY_SKIP_ENTRIES,
    'button',
    'summary',
    'rt',
    'rp',
].join(',');
const PITCH_CLASSES = new Set(['heiban', 'atamadaka', 'nakadaka', 'odaka', 'kifuku']);
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

const FRAGMENT_SKIP_SELECTOR = [
    ...BASE_SKIP_SELECTOR_ENTRIES,
    ...FORM_BOUNDARY_SKIP_ENTRIES,
    'button',
    'summary',
    '[data-jpdb-reader-root]',
].join(',');
const HARD_FRAGMENT_SKIP_SELECTOR = [
    ...BASE_SKIP_SELECTOR_ENTRIES,
    ...FORM_BOUNDARY_SKIP_ENTRIES,
    ...PLAYER_CHROME_SKIP_ENTRIES,
    '[data-jpdb-reader-root]',
].join(',');
const TAB_CHROME_FRAGMENT_SKIP_SELECTOR = [
    ...BASE_SKIP_SELECTOR_ENTRIES.filter(entry => entry !== '[role="tab"]'),
    ...FORM_BOUNDARY_SKIP_ENTRIES,
    ...PLAYER_CHROME_SKIP_ENTRIES,
    '[data-jpdb-reader-root]',
].join(',');
const FORM_CHROME_FRAGMENT_SKIP_SELECTOR = [
    ...BASE_SKIP_SELECTOR_ENTRIES,
    ...PLAYER_CHROME_SKIP_ENTRIES,
    'button',
    'summary',
    'a[href]',
    '[role="button"]',
].join(',');
const PASSIVE_AWARE_FRAGMENT_SKIP_SELECTOR = [
    'script',
    'style',
    'noscript',
    'textarea',
    'input',
    'select',
    'option',
    'svg',
    'use',
    '[hidden]',
    '[aria-hidden="true"]',
    '[contenteditable="true"]',
    '.jpdb-reader-word',
    '.subsection-pitch-accent .subsection',
    '[data-jpdb-reader-root]',
].join(',');
const FORM_CHROME_BOUNDARY_TAGS = new Set(['FORM', 'LABEL', 'FIELDSET', 'LEGEND']);
const UI_CLASS_RE = /(^|[-_\s])(audio|badge|chip|control|icon|label|play|required|sound|speaker|tab|tag)([-_\s]|$)/i;
const DISPLAY_HEADING_RE = /^H[1-6]$/;
const DISPLAY_HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6';
const PASSIVE_INTERACTION_SELECTOR = [
    'a[href]',
    'button',
    'summary',
    'label',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[aria-controls]',
    '[aria-expanded]',
    '[slot="more-button"]',
    '.more-button',
    '#more',
    '#less',
].join(',');
const COMPACT_PASSIVE_INTERACTION_SELECTOR = [
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
    '[class*="audio" i]',
    '[class*="button" i]',
    '[class*="control" i]',
    '[class*="play" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class*="toggle" i]',
].join(',');
const PASSIVE_INTERACTION_BOUNDARY_SELECTOR = [
    PASSIVE_INTERACTION_SELECTOR,
    COMPACT_PASSIVE_INTERACTION_SELECTOR,
].join(',');
const COMPACT_PASSIVE_INTERACTION_TEXT_LIMIT = 120;
const PROSE_TAGS = new Set(['P', 'LI', 'DD', 'DT', 'TD', 'TH', 'BLOCKQUOTE', 'FIGCAPTION']);
const READER_RENDERED_TEXT_BLOCK_TAGS = new Set([
    ...PROSE_TAGS,
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
]);
const BLOCK_TAGS = new Set([
    'ADDRESS',
    'ARTICLE',
    'ASIDE',
    'BLOCKQUOTE',
    'BR',
    'DD',
    'DETAILS',
    'DIALOG',
    'DIV',
    'DL',
    'DT',
    'FIGCAPTION',
    'FIGURE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HR',
    'LI',
    'MAIN',
    'OL',
    'P',
    'PRE',
    'SECTION',
    'TABLE',
    'TBODY',
    'TD',
    'TFOOT',
    'TH',
    'THEAD',
    'TR',
    'UL',
]);

export interface TextTarget {
    node: Text;
    text: string;
    parent: HTMLElement;
    hasNativeRuby?: boolean;
    layoutSensitive?: boolean;
    passiveInteraction?: boolean;
    singlePassScan?: boolean;
    nonDestructive?: boolean;
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
    layoutSensitive?: boolean;
    passiveInteraction?: boolean;
    singlePassScan?: boolean;
    nonDestructive?: boolean;
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
    includePassiveInteractions?: boolean;
    heading?: boolean;
    mergeBlockFragments?: boolean;
    readerRootPassiveInteractions?: boolean;
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
    position: string;
    positionPriority: string;
    positioned: boolean;
}

const READER_WORD_SELECTOR = '.jpdb-reader-word';
const READER_TEXT_MIRROR_SELECTOR = '.jpdb-reader-text-mirror';
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
    const passiveInteraction = isPassiveInteractionElement(parent);
    const text = nodeTextContent(node).trim();
    return {
        node: node as Text,
        text,
        parent,
        hasNativeRuby: Boolean(parent.closest('ruby')),
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
    if (!options.includeReaderRoot && isShortCenteredDisplayHeading(parent, text)) return null;
    return {
        text,
        parent,
        fragments: trimmedFragments,
        layoutSensitive: trimmedFragments.some(fragment => fragment.layoutSensitive),
        passiveInteraction: trimmedFragments.every(fragment => fragment.passiveInteraction),
    };
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
        || isExcludedReaderRootElement(element, options);
}

function isRubyAnnotationElement(element: HTMLElement): boolean {
    return element.tagName === 'RT' || element.tagName === 'RP';
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
    return visibleOnly && !isVisible(element) && !hasVisibleTextMirror(element);
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
    return Boolean(!options.heading && text && isShortCenteredDisplayHeading(element, text));
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
    if (options.includePassiveInteractions) return safeElementMatches(element, PASSIVE_AWARE_FRAGMENT_SKIP_SELECTOR);
    if (options.includeFormChrome) return safeElementMatches(element, FORM_CHROME_FRAGMENT_SKIP_SELECTOR);
    if (options.includeTabChrome) return safeElementMatches(element, TAB_CHROME_FRAGMENT_SKIP_SELECTOR);
    return safeElementMatches(element, options.includeUiChrome ? HARD_FRAGMENT_SKIP_SELECTOR : FRAGMENT_SKIP_SELECTOR);
}

function isFragmentParagraphBoundary(
    element: HTMLElement,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    return isPassiveInteractionBoundaryElement(element, options)
        || (options.includeFormChrome && FORM_CHROME_BOUNDARY_TAGS.has(element.tagName))
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
    return READER_RENDERED_TEXT_BLOCK_TAGS.has(element.tagName)
        && Boolean(element.querySelector('.jpdb-reader-word'))
        && !hasRawJapaneseOutsideReaderWords(element);
}

function hasRawJapaneseOutsideReaderWords(element: HTMLElement): boolean {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent || parent.closest('.jpdb-reader-word,.jpdb-reader-text-mirror,[data-jpdb-reader-root],script,style,noscript,rt,rp')) {
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
    if (options.readerRootPassiveInteractions
        && element.closest(READER_ROOT_SELECTOR)
        && element.closest('.jpdb-reader-popover')) return true;
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
    if (!target.fragments.length) return Boolean(target.nonDestructive && HAS_JAPANESE.test(target.text));
    const text = target.fragments.map(fragment => {
        if (!fragment.node.isConnected || !fragment.node.parentElement) return null;
        return fragment.node.data.slice(fragment.start, fragment.end);
    });
    return text.every((value): value is string => value !== null)
        && text.join('') === target.text;
}

export function applyTokensToScanTarget(target: ScanTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (target.nonDestructive) {
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
    return renderTokenizedScanText(target.text, tokens, settings, {
        parent: target.parent,
        hasNativeRuby: target.hasNativeRuby,
        passiveInteraction: target.passiveInteraction,
    });
}

function renderTokenizedScanText(
    text: string,
    tokens: JPDBToken[],
    settings: ReaderSettings,
    target: { parent: HTMLElement; hasNativeRuby?: boolean; passiveInteraction?: boolean },
): DocumentFragment {
    const fragment = document.createDocumentFragment();
    let offset = 0;
    const tokenPlans = tokens.map(token => ({
        token,
        tokenWithSentence: tokenWithReadableSentence(token, text, token.sentence),
    }));
    const miningInsightKeys = miningInsightTokenKeys(tokenPlans.map(plan => plan.tokenWithSentence));
    for (const plan of tokenPlans) {
        const { token, tokenWithSentence } = plan;
        appendPlainTextBeforeToken(fragment, text, offset, token.start);
        fragment.append(renderToken(text.slice(token.start, token.end), tokenWithSentence, settings, {
            allowRuby: !target.hasNativeRuby,
            kanjiNavigation: kanjiNavigationForElement(target.parent),
            scanWord: true,
            passiveInteraction: target.passiveInteraction,
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
    removeTextMirror(host);
    if (!safeTokens.length) return;

    const mirror = document.createElement('span');
    mirror.className = 'jpdb-reader-text-mirror';
    mirror.dataset.jpdbReaderTextMirror = 'true';
    mirror.dataset.sourceText = text;
    styleTextMirrorHost(host);
    styleTextMirror(mirror, host);
    mirror.append(renderTokenizedScanText(text, safeTokens, settings, {
        parent: host,
        hasNativeRuby: targetHasNativeRuby(target),
        passiveInteraction: target.passiveInteraction,
    }));
    host.append(mirror);
    observeTextMirrorHost(host, text);
}

function nonDestructiveScanHost(target: ScanTextTarget): HTMLElement {
    if (!isFragmentTextTarget(target)) return target.parent;
    const parents = target.fragments
        .map(fragment => fragment.node.parentElement)
        .filter((parent): parent is HTMLElement => Boolean(parent));
    return commonFragmentTextHost(parents) ?? target.parent;
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

function styleTextMirrorHost(host: HTMLElement): void {
    const computed = safeComputedStyle(host);
    const state: TextMirrorHostState = {
        observer: new MutationObserver(() => undefined),
        sourceText: '',
        visibility: host.style.getPropertyValue('visibility'),
        visibilityPriority: host.style.getPropertyPriority('visibility'),
        position: host.style.getPropertyValue('position'),
        positionPriority: host.style.getPropertyPriority('position'),
        positioned: computed.position === 'static',
    };
    textMirrorHosts.set(host, state);
    host.style.setProperty('visibility', 'hidden', 'important');
    if (state.positioned) host.style.setProperty('position', 'relative', 'important');
}

function styleTextMirror(mirror: HTMLElement, host: HTMLElement): void {
    const style = safeComputedStyle(host);
    mirror.style.setProperty('position', 'absolute');
    mirror.style.setProperty('inset', '0 auto auto 0');
    mirror.style.setProperty('width', '100%');
    mirror.style.setProperty('min-width', '100%');
    mirror.style.setProperty('height', 'auto');
    mirror.style.setProperty('overflow', 'visible');
    mirror.style.setProperty('visibility', 'visible', 'important');
    mirror.style.setProperty('pointer-events', 'auto');
    mirror.style.setProperty('white-space', style.whiteSpace);
    mirror.style.setProperty('font', style.font);
    mirror.style.setProperty('font-size', style.fontSize);
    mirror.style.setProperty('font-weight', style.fontWeight);
    mirror.style.setProperty('line-height', style.lineHeight);
    mirror.style.setProperty('letter-spacing', style.letterSpacing);
    mirror.style.setProperty('text-align', style.textAlign);
    mirror.style.setProperty('color', style.color);
    mirror.style.setProperty('z-index', '1');
}

function observeTextMirrorHost(host: HTMLElement, sourceText: string): void {
    const state = textMirrorHosts.get(host);
    if (!state) return;
    state.sourceText = normalizedMirrorHostText(sourceText);
    state.observer = new MutationObserver(mutations => {
        if (mutations.every(mutationInsideTextMirror)) return;
        const currentText = normalizedMirrorHostText(nativeTextMirrorHostText(host));
        if (!host.isConnected || !HAS_JAPANESE.test(currentText)) {
            removeTextMirror(host);
            return;
        }
        if (currentText !== state.sourceText) dispatchTextMirrorStale(host);
    });
    state.observer.observe(host, { childList: true, characterData: true, subtree: true });
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
            if (!parent || parent.closest(READER_TEXT_MIRROR_SELECTOR)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) text += node.textContent ?? '';
    return text;
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

function restoreTextMirrorHost(host: HTMLElement, state: TextMirrorHostState): void {
    restoreStyleProperty(host, 'visibility', state.visibility, state.visibilityPriority);
    if (state.positioned) restoreStyleProperty(host, 'position', state.position, state.positionPriority);
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
    hosts.forEach(removeTextMirror);
    return hosts.size;
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
    applyTokensToIndexedFragmentTarget(target, safeTokens, settings, sentence);
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
    replaceTextNodeRange(fragment.node, fragment.start, fragment.end, replacement);
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

    if (fragmentRangeHasNativeRuby(indexedFragments, token.start, token.end)) {
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
        allowRuby: true,
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
    const allowRuby = scanFragmentAllowsRuby(fragment.hasNativeRuby);
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
    if (options.scanWord) span.classList.add('jpdb-reader-scan-word');
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
        return classes.join(' ');
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
    if (PROSE_TAGS.has(element.tagName)) return true;
    return /(^|[-_\s])(body|content|copy|description|lead|paragraph|prose|text|txt)([-_\s]|$)/i.test(element.className || '');
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
export function makeRoomForRubyInCroppedRows(root: ParentNode = document): number {
    let adjusted = 0;
    const words = root.querySelectorAll<HTMLElement>('.jpdb-reader-word');
    for (const word of words) {
        if (!word.querySelector('rt')) continue;
        for (const box of cropCapableBoxes(word.parentElement)) {
            if (!boxActuallyCrops(box)) continue;
            const roomHeight = rubyRoomHeight(box);
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

function makeRoomForRubyInBox(box: HTMLElement, style: CSSStyleDeclaration, roomHeight: number): void {
    if (hasLineClamp(style)) {
        // -webkit-line-clamp itself limits LINES; the crop comes from a height
        // cap sized for plain lines. Lifting it keeps the host's "N lines"
        // semantics with taller ruby lines.
        box.style.setProperty('max-height', 'none', 'important');
        if (hasDefiniteCssSize(style.height)) box.style.setProperty('height', 'auto', 'important');
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
    return box.scrollHeight > box.clientHeight + 1 || rubyBottomOverflow(box) > 1;
}

function rubyRoomHeight(box: HTMLElement): number {
    return Math.ceil(Math.max(box.scrollHeight, box.clientHeight + rubyBottomOverflow(box)));
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
