import { primaryCardState } from './card-state';
import { CORE_COLOR_TOKENS } from './theme/color-tokens';
import { HAS_JAPANESE, READER_ROOT_SELECTOR } from './dom/constants';
import { escapeHtml, setInnerHtml } from './dom/html';
import { sentenceAroundRange, sentenceAroundSurface } from './dom/reader-word';
import { effectiveFuriganaMode } from './settings';
import type { CardState, JPDBCard, JPDBToken, ReaderSettings } from './types';

export { HAS_JAPANESE } from './dom/constants';
export {
    nearestReadableSentenceForElement,
    readerWordAtPointInScope,
    readerWordSurfaceText,
    sentenceAroundRange,
    unwrapReaderWords,
} from './dom/reader-word';

export {
    appendToDocumentHead,
    appendTrustedHtml,
    escapeHtml,
    htmlToFirstElement,
    parseHtmlDocument,
    parseXmlDocument,
    setInnerHtml,
} from './dom/html';

const KANJI_RE = /[\u3400-\u9fff]/u;
const KANA_CHAR_RE = /[\u3040-\u30ffー・]/u;
const KANA_RE = /^[\u3040-\u30ffー・]+$/u;
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
    '[contenteditable="true"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[data-audio]',
    '[class*="audio" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class*="voice" i]',
    '.jpdb-reader-word',
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
    '[aria-hidden="true"]',
].join(',');
const PITCH_CLASSES = new Set(['heiban', 'atamadaka', 'nakadaka', 'odaka', 'kifuku']);
const PARTICLE_SURFACE_RE = /^[のはをがにでへもとやかねよな]$/u;
const MINING_INSIGHT_UNKNOWN_STATES = new Set<CardState>(['new', 'not-in-deck', 'in-deck']);
const MINING_INSIGHT_MIN_CARD_COUNT = 3;

const FRAGMENT_SKIP_SELECTOR = [
    ...BASE_SKIP_SELECTOR_ENTRIES,
    ...FORM_BOUNDARY_SKIP_ENTRIES,
    'button',
    'summary',
    '[aria-hidden="true"]',
    '[data-jpdb-reader-root]',
].join(',');
const HARD_FRAGMENT_SKIP_SELECTOR = [
    ...BASE_SKIP_SELECTOR_ENTRIES,
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
    return Boolean(parent && !parent.closest(SKIP_SELECTOR) && !parent.closest(READER_ROOT_SELECTOR));
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
    if (parent.closest(SKIP_SELECTOR)) return true;
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
    return {
        node: node as Text,
        text: nodeTextContent(node).trim(),
        parent,
        hasNativeRuby: Boolean(parent.closest('ruby')),
        layoutSensitive: isLayoutSensitiveScanElement(parent),
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
    return isRubyAnnotationElement(element) || isExcludedReaderRootElement(element, options);
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
    return visibleOnly && !isVisible(element);
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
    if (options.includeFormChrome) return safeElementMatches(element, FORM_CHROME_FRAGMENT_SKIP_SELECTOR);
    return safeElementMatches(element, options.includeUiChrome ? HARD_FRAGMENT_SKIP_SELECTOR : FRAGMENT_SKIP_SELECTOR);
}

function isFragmentParagraphBoundary(
    element: HTMLElement,
    options: FragmentTextTargetCollectionOptions,
): boolean {
    return (options.includeFormChrome && FORM_CHROME_BOUNDARY_TAGS.has(element.tagName))
        || isParagraphBoundary(element);
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
            if (!parent || parent.closest('.jpdb-reader-word,[data-jpdb-reader-root],script,style,noscript,rt,rp')) {
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
    const text = compactInteraction.textContent?.replace(/\s+/g, '').trim() ?? '';
    return text.length > 0 && text.length <= COMPACT_PASSIVE_INTERACTION_TEXT_LIMIT;
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

function isLayoutSensitiveTextBox(element: HTMLElement): boolean {
    const style = safeComputedStyle(element);
    return hasLineClamp(style)
        || hasClippedTextConstraint(style)
        || isPositionedTextOverlay(style);
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
    if (!target.parent.isConnected || !target.fragments.length) return false;
    const text = target.fragments.map(fragment => {
        if (!fragment.node.isConnected || !fragment.node.parentElement) return null;
        return fragment.node.data.slice(fragment.start, fragment.end);
    });
    return text.every((value): value is string => value !== null)
        && text.join('') === target.text;
}

export function applyTokensToScanTarget(target: ScanTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (isFragmentTextTarget(target)) applyTokensToFragmentTarget(target, tokens, settings);
    else applyTokensToTextNode(target, tokens, settings);
}

export function applyTokensToTextNode(target: TextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (!tokens.length || !target.node.parentElement) return;

    const text = target.text;
    const safeTokens = nonOverlappingTokens(tokens, text.length);
    if (!safeTokens.length) return;

    target.node.replaceWith(renderTokenizedTextFragment(target, safeTokens, settings));
}

function renderTokenizedTextFragment(target: TextTarget, tokens: JPDBToken[], settings: ReaderSettings): DocumentFragment {
    const fragment = document.createDocumentFragment();
    let offset = 0;
    const tokenPlans = tokens.map(token => ({
        token,
        tokenWithSentence: tokenWithReadableSentence(token, target.text, token.sentence),
    }));
    const miningInsightKeys = miningInsightTokenKeys(tokenPlans.map(plan => plan.tokenWithSentence));
    for (const plan of tokenPlans) {
        const { token, tokenWithSentence } = plan;
        appendPlainTextBeforeToken(fragment, target.text, offset, token.start);
        fragment.append(renderToken(target.text.slice(token.start, token.end), tokenWithSentence, settings, {
            allowRuby: scanTargetAllowsRuby(target) && !target.hasNativeRuby,
            kanjiNavigation: kanjiNavigationForElement(target.parent),
            scanWord: true,
            passiveInteraction: target.passiveInteraction,
            preserveTokenRubies: true,
            miningInsightKeys,
        }));
        offset = token.end;
    }
    appendPlainTextBeforeToken(fragment, target.text, offset, target.text.length);
    return fragment;
}

function appendPlainTextBeforeToken(fragment: DocumentFragment, text: string, start: number, end: number): void {
    if (end > start) fragment.append(document.createTextNode(text.slice(start, end)));
}

function applyTokensToFragmentTarget(target: FragmentTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (!hasFragmentTokenWork(target, tokens)) return;

    const safeTokens = nonOverlappingTokens(tokens, target.text.length);
    if (!safeTokens.length) return;

    const sentence = target.text.replace(/\s+/g, ' ').trim();
    applyTokensToIndexedFragmentTarget(target, safeTokens, settings, sentence);
}

function hasFragmentTokenWork(target: FragmentTextTarget, tokens: JPDBToken[]): boolean {
    return Boolean(tokens.length && target.fragments.length);
}

function applyTokensToIndexedFragmentTarget(target: FragmentTextTarget, tokens: JPDBToken[], settings: ReaderSettings, sentence: string): void {
    const indexedFragments = indexTextFragments(target.fragments);
    const tokensWithSentence = tokens.map(token => tokenWithReadableSentence(token, target.text, token.sentence ?? sentence));
    const miningInsightKeys = miningInsightTokenKeys(tokensWithSentence);
    const singleFragmentPlans = singleFragmentTokenPlans(target, indexedFragments, tokens, tokensWithSentence);
    if (singleFragmentPlans.length && !tokens.some(token => shouldSplitLayoutSensitiveFragmentToken(indexedFragments, token))) {
        const grouped = groupSingleFragmentTokenPlans(singleFragmentPlans);
        for (const group of grouped) replaceSingleFragmentTokenNode(target, group.fragment, group.plans, settings, miningInsightKeys);
        if (singleFragmentPlans.length === tokens.length) return;
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
    layoutSensitive: boolean;
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
            layoutSensitive: fragmentTargetLayoutSensitive(target)
                || fragmentRangeHasLayoutSensitive(indexedFragments, token.start, token.end),
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
    let offset = 0;
    for (const plan of plans) {
        appendPlainTextBeforeToken(replacement, text, offset, plan.localStart);
        replacement.append(renderSingleFragmentToken(target, fragment, plan, settings, miningInsightKeys));
        offset = plan.localEnd;
    }
    appendPlainTextBeforeToken(replacement, text, offset, text.length);
    fragment.node.replaceWith(replacement);
}

function renderSingleFragmentToken(
    target: FragmentTextTarget,
    fragment: TextFragment,
    plan: SingleFragmentTokenPlan,
    settings: ReaderSettings,
    miningInsightKeys: ReadonlySet<string>,
): HTMLElement {
    const allowRuby = scanFragmentAllowsRuby(
        fragment.hasNativeRuby,
        plan.layoutSensitive,
        plan.passiveInteraction && isInsideOwnedReaderRoot(target.parent),
    );
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
    const layoutSensitive = fragmentTargetLayoutSensitive(target)
        || fragmentRangeHasLayoutSensitive(indexedFragments, token.start, token.end);
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
            layoutSensitive,
        );
        return;
    }
    if (layoutSensitive) {
        insertSplitFragmentTokenPieces(target, indexedFragments, token, tokenWithSentence, settings, passiveInteraction, miningInsightKeys);
        return;
    }

    const range = document.createRange();
    range.setStart(bounds.start.fragment.node, bounds.start.localOffset);
    range.setEnd(bounds.end.fragment.node, bounds.end.localOffset);
    insertMultiFragmentToken(range, target.text.slice(token.start, token.end), tokenWithSentence, settings, {
        scanWord: true,
        passiveInteraction,
        allowRuby: !layoutSensitive && !fragmentRangeHasNativeRuby(indexedFragments, token.start, token.end),
        preserveTokenRubies: true,
        miningInsightKeys,
    });
    range.detach();
}

function shouldSplitLayoutSensitiveFragmentToken(indexedFragments: IndexedTextFragment[], token: JPDBToken): boolean {
    const start = findFragmentBoundary(indexedFragments, token.start, 'start');
    const end = findFragmentBoundary(indexedFragments, token.end, 'end');
    const bounds = attachableFragmentRange(start, end);
    return Boolean(bounds
        && bounds.start.fragment !== bounds.end.fragment
        && fragmentRangeHasLayoutSensitive(indexedFragments, token.start, token.end));
}

function insertSplitFragmentTokenPieces(
    target: FragmentTextTarget,
    indexedFragments: IndexedTextFragment[],
    token: JPDBToken,
    tokenWithSentence: JPDBToken,
    settings: ReaderSettings,
    passiveInteraction: boolean,
    miningInsightKeys: ReadonlySet<string>,
): void {
    const pieces = indexedFragments
        .map(fragment => splitFragmentTokenPiece(fragment, token.start, token.end))
        .filter((piece): piece is { fragment: IndexedTextFragment; start: number; end: number } => piece !== null)
        .reverse();
    for (const piece of pieces) {
        const surface = piece.fragment.node.data.slice(piece.start, piece.end);
        if (!surface) continue;
        const rendered = renderToken(surface, tokenWithSentence, settings, {
            allowRuby: false,
            kanjiNavigation: kanjiNavigationForElement(target.parent),
            scanWord: true,
            passiveInteraction,
            preserveTokenRubies: true,
            miningInsightKeys,
        });
        replaceTextNodeRange(piece.fragment.node, piece.start, piece.end, rendered);
    }
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

function fragmentRangeHasLayoutSensitive(fragments: IndexedTextFragment[], start: number, end: number): boolean {
    return fragments.some(fragment => fragment.layoutSensitive === true
        && fragment.globalStart < end
        && fragment.globalEnd > start);
}

function fragmentTargetLayoutSensitive(target: FragmentTextTarget): boolean {
    if (isInsideOwnedReaderRoot(target.parent)) return false;
    return target.layoutSensitive === true
        && (!target.fragments.length || target.fragments.every(fragment => fragment.layoutSensitive !== false));
}

function fragmentRangeHasNativeRuby(fragments: IndexedTextFragment[], start: number, end: number): boolean {
    return fragments.some(fragment => fragment.hasNativeRuby
        && fragment.globalStart < end
        && fragment.globalEnd > start);
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
    layoutSensitive: boolean,
): void {
    const allowRuby = scanFragmentAllowsRuby(
        fragment.hasNativeRuby,
        layoutSensitive,
        passiveInteraction && isInsideOwnedReaderRoot(target.parent),
    );
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

function scanTargetAllowsRuby(target: ScanTextTarget): boolean {
    return target.layoutSensitive !== true;
}

function scanFragmentAllowsRuby(hasNativeRuby: boolean, layoutSensitive: boolean, passiveInteraction: boolean): boolean {
    return !hasNativeRuby && (!layoutSensitive || passiveInteraction);
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
    span.dataset.pitchClass = safePitchClass(token.pitchClass);
    span.dataset.tokenStart = String(token.start);
    span.dataset.tokenEnd = String(token.end);
    span.dataset.sentence = token.sentence ?? '';
    if (token.card.spelling) span.dataset.expression = token.card.spelling;
    if (token.card.reading) span.dataset.reading = token.card.reading;
    applyTokenRenderOptions(span, token, options);
    return span;
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
    const tokenRange = ` data-token-start="${token.start}" data-token-end="${token.end}"`;
    const miningInsight = hasMiningInsight ? ' data-mining-insight="i-plus-one"' : '';
    const expression = token.card.spelling ? ` data-expression="${escapeHtml(token.card.spelling)}"` : '';
    const reading = token.card.reading ? ` data-reading="${escapeHtml(token.card.reading)}"` : '';
    return `<span class="${classes}" data-vid="${token.card.vid}" data-sid="${token.card.sid}"${source}${cardId}${readingIndex}${tokenRange} data-pitch-class="${safePitchClass(token.pitchClass)}" data-sentence="${escapeHtml(token.sentence ?? '')}"${miningInsight}${expression}${reading} tabindex="-1">${content}</span>`;
}

export function shouldRenderRuby(surface: string, token: JPDBToken, settings: ReaderSettings, allowRuby = true, preserveTokenRubies = false): boolean {
    if (!allowRuby) return false;
    if (!effectiveTokenRubies(surface, token, preserveTokenRubies).length) return false;
    return furiganaModeAllowsRuby(effectiveFuriganaMode(settings), surface);
}

function furiganaModeAllowsRuby(mode: string, surface: string): boolean {
    if (mode === 'off') return false;
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
    if (hasKnownCardState(token.card)) classes.push(`jpdb-${state}`);
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
        // Preserve explicit rubies verbatim over kanji-containing bases; a
        // kana-only base never needs furigana (the ruby would just repeat
        // the visible word).
        return sources.filter(ruby => {
            const range = localRubyRange(surface, token, ruby);
            return range !== null && KANJI_RE.test(surface.slice(range.start, range.end));
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
    if (isFragileUiContext(element, text)) return true;

    const metrics = fragileTextMetrics(element, text);
    if (fragileByTypography(element, metrics.style, metrics.compactLength, metrics.fontSize, metrics.lineHeight, metrics.prose)) return true;
    if (fragileByCompactLayout(text, metrics.style, metrics.rect)) return true;
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
    return [isExplicitControlLink(link), linkHasControlMedia(link), linkHasControlShape(link, text)].some(Boolean);
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
