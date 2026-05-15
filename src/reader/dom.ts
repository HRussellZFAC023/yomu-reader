import { Logger } from './logger';
import { primaryCardState } from './card-state';
import { effectiveFuriganaMode } from './settings';
import type { JPDBToken, ReaderSettings } from './types';

export const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
const KANJI_RE = /[\u3400-\u9fff]/u;
const EASY_FURIGANA_KANJI = new Set(
    '一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒'
        .split(''),
);
const log = Logger.scope('Dom');
type TrustedTypesFactory = {
    createPolicy?: (name: string, options: { createHTML: (value: string) => string }) => { createHTML: (value: string) => unknown };
    getPolicy?: (name: string) => { createHTML: (value: string) => unknown } | null;
};

let trustedHtmlPolicy: { createHTML: (value: string) => unknown } | null | undefined;

const SKIP_SELECTOR = [
    'script',
    'style',
    'noscript',
    'form',
    'label',
    'fieldset',
    'legend',
    'textarea',
    'input',
    'select',
    'button',
    'option',
    'summary',
    'svg',
    'use',
    'rt',
    'rp',
    '[contenteditable="true"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[data-audio]',
    '[class*="audio" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class*="voice" i]',
    '[aria-hidden="true"]',
    '.jpdb-reader-word',
].join(',');
const READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';
const READABLE_IGNORED_TAGS = new Set(['RT', 'RP', 'SCRIPT', 'STYLE']);
const PITCH_CLASSES = new Set(['heiban', 'atamadaka', 'nakadaka', 'odaka', 'kifuku']);

const FRAGMENT_SKIP_SELECTOR = [
    'script',
    'style',
    'noscript',
    'form',
    'label',
    'fieldset',
    'legend',
    'textarea',
    'input',
    'select',
    'button',
    'option',
    'summary',
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
    '[aria-hidden="true"]',
    '[data-jpdb-reader-root]',
    '.jpdb-reader-word',
].join(',');
const HARD_FRAGMENT_SKIP_SELECTOR = [
    'script',
    'style',
    'noscript',
    'form',
    'label',
    'fieldset',
    'legend',
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
    '[data-jpdb-reader-root]',
    '[class*="audio" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class*="control" i]',
    '[class*="toggle" i]',
    '[class*="player" i]',
    '[class*="voice" i]',
    '.jpdb-reader-word',
].join(',');
const UI_CLASS_RE = /(^|[-_\s])(audio|badge|chip|control|icon|label|play|required|sound|speaker|tab|tag)([-_\s]|$)/i;
const DISPLAY_HEADING_RE = /^H[1-6]$/;
const MAX_CONTEXT_SENTENCE_LENGTH = 180;
const PROSE_TAGS = new Set(['P', 'LI', 'DD', 'DT', 'TD', 'TH', 'BLOCKQUOTE', 'FIGCAPTION']);
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

export function setInnerHtml(element: Element, html: string): void {
    element.innerHTML = trustedHtml(html) as string;
}

export function appendToDocumentHead(element: Node): void {
    const target = document.head || document.documentElement || document.body;
    target.appendChild(element);
}

export interface TextTarget {
    node: Text;
    text: string;
    parent: HTMLElement;
    hasNativeRuby?: boolean;
    suppressRuby?: boolean;
}

export interface TextFragment {
    node: Text;
    start: number;
    end: number;
    hasNativeRuby: boolean;
    suppressRuby: boolean;
}

export interface FragmentTextTarget {
    text: string;
    parent: HTMLElement;
    fragments: TextFragment[];
    parserId?: string;
    suppressRuby?: boolean;
}

export type ScanTextTarget = TextTarget | FragmentTextTarget;

interface TextTargetCollectionOptions {
    includeReaderRoot?: boolean;
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
    return {
        node: node as Text,
        text: nodeTextContent(node).trim(),
        parent,
        hasNativeRuby: Boolean(parent.closest('ruby')),
        suppressRuby: shouldSuppressInjectedRuby(parent),
    };
}

export function collectFragmentTextTargetsIn(
    root: Node,
    limit = 40,
    visibleOnly = true,
    excludeSelector = '',
    options: { allowUiText?: boolean; minLength?: number; includeReaderRoot?: boolean; includeUiChrome?: boolean } = {},
): FragmentTextTarget[] {
    const targets: FragmentTextTarget[] = [];
    const fragments: TextFragment[] = [];

    function fragmentText(items: TextFragment[]): string {
        return items.map(fragment => fragment.node.data.slice(fragment.start, fragment.end)).join('');
    }

    function flush(): void {
        if (!fragments.length || targets.length >= limit) {
            fragments.length = 0;
            return;
        }

        const trimmedFragments = trimTextFragments(fragments);
        const text = fragmentText(trimmedFragments);
        const compactText = text.replace(/\s+/g, '');
        const hasNativeRuby = trimmedFragments.some(fragment => fragment.hasNativeRuby);
        const suppressRuby = trimmedFragments.some(fragment => fragment.suppressRuby);
        if (HAS_JAPANESE.test(text) && (compactText.length >= (options.minLength ?? 2) || hasNativeRuby)) {
            const parent = trimmedFragments[0]?.node.parentElement;
            if (parent) {
                targets.push({ text, parent, fragments: trimmedFragments, suppressRuby });
            }
        }
        fragments.length = 0;
    }

    function visit(node: Node, hasNativeRuby = false): void {
        if (targets.length >= limit) return;

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? '';
            const parent = node.parentElement;
            if (text) fragments.push({
                node: node as Text,
                start: 0,
                end: text.length,
                hasNativeRuby,
                suppressRuby: parent ? shouldSuppressInjectedRuby(parent) : false,
            });
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node as HTMLElement;
        const tagName = element.tagName;
        if (tagName === 'RT' || tagName === 'RP') return;
        if (!options.includeReaderRoot && element.closest('[data-jpdb-reader-root]')) return;
        const skipSelector = options.includeUiChrome ? HARD_FRAGMENT_SKIP_SELECTOR : FRAGMENT_SKIP_SELECTOR;
        if (element.matches(skipSelector) || (excludeSelector && element.matches(excludeSelector))) {
            flush();
            return;
        }
        if (visibleOnly && !isVisible(element)) {
            flush();
            return;
        }
        const text = element.textContent?.trim() ?? '';
        if (!options.allowUiText && text && isFragileUiText(element, text)) {
            flush();
            return;
        }

        const isBlock = isParagraphBoundary(element) && !isInlineSentenceListItem(element);
        if (isBlock) flush();

        const nextHasNativeRuby = hasNativeRuby || tagName === 'RUBY' || tagName === 'RB';
        for (const child of Array.from(element.childNodes)) {
            visit(child, nextHasNativeRuby);
            if (targets.length >= limit) break;
        }

        if (isBlock) flush();
    }

    visit(root);
    flush();
    return targets;
}

function isInlineSentenceListItem(element: HTMLElement): boolean {
    return element.tagName === 'LI' && Boolean(element.closest('.japanese_sentence'));
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

export function isFragmentTextTarget(target: ScanTextTarget): target is FragmentTextTarget {
    return 'fragments' in target;
}

export function applyTokensToScanTarget(target: ScanTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (isFragmentTextTarget(target)) applyTokensToFragmentTarget(target, tokens, settings);
    else applyTokensToTextNode(target, tokens, settings);
}

export function unwrapReaderWords(root: ParentNode = document): number {
    const words = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-word'))
        .filter(word => !word.closest(READER_ROOT_SELECTOR));
    const parents = new Set<Node>();

    for (const word of words) {
        const parent = word.parentNode;
        if (!parent) continue;
        parents.add(parent);
        word.replaceWith(document.createTextNode(readerWordSurfaceText(word)));
    }

    parents.forEach(parent => parent.normalize());
    log.debug('Unwrapped reader words', { count: words.length });
    return words.length;
}

export function readerWordSurfaceText(element: Element): string {
    let text = '';
    element.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent ?? '';
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const child = node as Element;
        if (child.tagName === 'RT' || child.tagName === 'RP') return;
        text += readerWordSurfaceText(child);
    });
    return text;
}

export function nearestReadableSentenceForElement(element: HTMLElement, fallback = ''): string {
    const surface = readerWordSurfaceText(element).trim() || element.textContent?.trim() || '';
    const cleanFallback = cleanReadableSentence(fallback);
    const nearest = nearestReadableAncestorSentence(element, surface, cleanFallback);
    return nearest || fallbackReadableSentence(cleanFallback, surface);
}

function nearestReadableAncestorSentence(element: HTMLElement, surface: string, cleanFallback: string): string {
    let current: HTMLElement | null = element.parentElement;

    while (isReadableAncestorCandidate(current)) {
        const sentence = readableAncestorSentence(current, surface, cleanFallback);
        if (sentence) return sentence;
        current = current.parentElement;
    }
    return '';
}

function isReadableAncestorCandidate(element: HTMLElement | null): element is HTMLElement {
    if (!element) return false;
    return element !== document.body && element !== document.documentElement;
}

function readableAncestorSentence(element: HTMLElement, surface: string, cleanFallback: string): string {
    if (!canReadSentenceContextFrom(element)) return '';
    const sentence = sentenceAroundSurface(readableSurfaceText(element), surface, cleanFallback);
    return isUsefulContextSentence(sentence, cleanFallback, surface) ? sentence : '';
}

function fallbackReadableSentence(cleanFallback: string, surface: string): string {
    return sentenceAroundSurface(cleanFallback, surface) || cleanFallback;
}

function canReadSentenceContextFrom(element: HTMLElement): boolean {
    return !element.closest(READER_ROOT_SELECTOR)
        || Boolean(element.closest('.jpdb-reader-popover, .jpdb-subtitle-player, .jpdb-ocr-layer'));
}

export function sentenceAroundSurface(value: string, surface = '', fallback = ''): string {
    const text = cleanReadableSentence(value);
    if (!isJapaneseSentenceContext(text)) return '';

    const search = sentenceSearchText(text, surface, fallback);
    const index = sentenceSearchIndex(text, search);
    if (index < 0) return clampContextText(text);

    const hardBounded = hardBoundedSentence(text, index, search.length);
    const hardClean = trimSoftSentenceBoundary(hardBounded, search);
    if (hardClean.length <= MAX_CONTEXT_SENTENCE_LENGTH) return hardClean;

    return clampLongSentence(hardClean, search);
}

function sentenceSearchIndex(text: string, search: string): number {
    if (!search) return 0;
    return text.indexOf(search);
}

function isJapaneseSentenceContext(text: string): boolean {
    return Boolean(text && HAS_JAPANESE.test(text));
}

function sentenceSearchText(text: string, surface: string, fallback: string): string {
    const cleanSurface = cleanReadableSentence(surface);
    const cleanFallback = cleanReadableSentence(fallback);
    if (textIncludesSearch(text, cleanSurface)) return cleanSurface;
    if (textIncludesSearch(text, cleanFallback)) return cleanFallback;
    return '';
}

function textIncludesSearch(text: string, search: string): boolean {
    if (!search) return false;
    return text.includes(search);
}

function clampContextText(text: string): string {
    return text.length <= MAX_CONTEXT_SENTENCE_LENGTH ? text : text.slice(0, MAX_CONTEXT_SENTENCE_LENGTH).trim();
}

function isUsefulContextSentence(sentence: string, fallback: string, surface: string): boolean {
    if (!isJapaneseContextSentence(sentence)) return false;
    if (!containsSurfaceContext(sentence, surface)) return false;
    return fallback ? isRicherThanFallback(sentence, fallback) : true;
}

function isJapaneseContextSentence(sentence: string): boolean {
    return Boolean(sentence && HAS_JAPANESE.test(sentence));
}

function containsSurfaceContext(sentence: string, surface: string): boolean {
    return !surface || sentence.includes(surface);
}

function isRicherThanFallback(sentence: string, fallback: string): boolean {
    if (sentence === fallback) return false;
    if (sentence.length <= fallback.length + 2) return false;
    return sentence.length >= 8 || /[。！？]/u.test(sentence);
}

function readableSurfaceText(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return nodeTextContent(node);
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    return readableElementSurfaceText(node as Element);
}

function readableElementSurfaceText(element: Element): string {
    if (isIgnoredReadableElement(element)) return '';

    let text = '';
    element.childNodes.forEach(child => { text += readableSurfaceText(child); });
    return text;
}

function isIgnoredReadableElement(element: Element): boolean {
    return READABLE_IGNORED_TAGS.has(element.tagName)
        || element.matches('button,svg,use,[aria-hidden="true"],[role="button"]');
}

function cleanReadableSentence(value: string): string {
    return value
        .replace(/\s+/g, ' ')
        .replace(/([\u3040-\u30ff\u3400-\u9fff々〆ヵヶ])\s+([、。！？・])/gu, '$1$2')
        .replace(/([、。！？・])\s+([\u3040-\u30ff\u3400-\u9fff々〆ヵヶ])/gu, '$1$2')
        .trim();
}

function hardBoundedSentence(text: string, index: number, length: number): string {
    const start = sentenceStartIndex(text, index);
    const end = sentenceEndIndex(text, index + length);
    return text.slice(start, end).trim();
}

function sentenceStartIndex(text: string, index: number): number {
    for (let i = index - 1; i >= 0; i--) {
        if (/[。！？!?]/u.test(text[i] ?? '')) return i + 1;
    }
    return 0;
}

function sentenceEndIndex(text: string, index: number): number {
    for (let i = index; i < text.length; i++) {
        if (/[。！？!?]/u.test(text[i] ?? '')) return i + 1;
    }
    return text.length;
}

function trimSoftSentenceBoundary(sentence: string, surface: string): string {
    const clean = sentence.trim();
    if (!surface) return clean;
    const index = clean.indexOf(surface);
    if (index < 0) return clean;
    const start = softBoundaryStart(clean, index);
    const end = softBoundaryEnd(clean, index + surface.length);
    const trimmed = clean.slice(start, end).trim();
    const omitted = `${clean.slice(0, start)}${clean.slice(end)}`;
    return shouldUseSoftSentenceTrim(clean, trimmed, omitted) ? trimmed : clean;
}

function shouldUseSoftSentenceTrim(clean: string, trimmed: string, omitted: string): boolean {
    if (!trimmed || trimmed === clean) return false;
    return clean.length > 48 || /[。！？!?]/u.test(omitted);
}

function softBoundaryStart(text: string, index: number): number {
    for (let i = index - 1; i >= 0; i--) {
        if (isStrongWhitespaceBoundary(text, i)) return i + 1;
    }
    return 0;
}

function softBoundaryEnd(text: string, index: number): number {
    for (let i = index; i < text.length; i++) {
        if (isStrongWhitespaceBoundary(text, i)) return i;
    }
    return text.length;
}

function isStrongWhitespaceBoundary(text: string, index: number): boolean {
    const char = text[index] ?? '';
    if (!/\s/u.test(char)) return false;
    const before = text.slice(Math.max(0, index - 24), index);
    const after = text.slice(index + 1, Math.min(text.length, index + 25));
    return HAS_JAPANESE.test(before) && HAS_JAPANESE.test(after);
}

function clampLongSentence(sentence: string, surface: string): string {
    if (sentence.length <= MAX_CONTEXT_SENTENCE_LENGTH) return sentence;
    const index = surface ? sentence.indexOf(surface) : -1;
    if (index < 0) return sentence.slice(0, MAX_CONTEXT_SENTENCE_LENGTH).trim();
    const halfWindow = Math.floor((MAX_CONTEXT_SENTENCE_LENGTH - surface.length) / 2);
    const start = Math.max(0, index - Math.max(0, halfWindow));
    const end = Math.min(sentence.length, start + MAX_CONTEXT_SENTENCE_LENGTH);
    return sentence.slice(start, end).trim();
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
    for (const token of tokens) {
        appendPlainTextBeforeToken(fragment, target.text, offset, token.start);
        fragment.append(renderToken(target.text.slice(token.start, token.end), token, settings, {
            allowRuby: !target.hasNativeRuby && !target.suppressRuby,
        }));
        offset = token.end;
    }
    appendPlainTextBeforeToken(fragment, target.text, offset, target.text.length);
    return fragment;
}

function appendPlainTextBeforeToken(fragment: DocumentFragment, text: string, start: number, end: number): void {
    if (end > start) fragment.append(document.createTextNode(text.slice(start, end)));
}

export function applyTokensToFragmentTarget(target: FragmentTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (!hasFragmentTokenWork(target, tokens)) return;

    const safeTokens = nonOverlappingTokens(tokens, target.text.length);
    if (!safeTokens.length) return;

    const sentence = target.text.replace(/\s+/g, ' ').trim();
    if (fragmentTargetHasNativeRuby(target)) {
        applyTokensToFragmentPieces(target, safeTokens, settings, sentence);
        return;
    }

    applyTokensToIndexedFragmentTarget(target, safeTokens, settings, sentence);
    log.debugThrottled('apply-fragment', 1000, 'Applied tokens to fragment target', {
        tokens: safeTokens.length,
        fragments: target.fragments.length,
        textLength: target.text.length,
        parserId: target.parserId,
    });
}

function hasFragmentTokenWork(target: FragmentTextTarget, tokens: JPDBToken[]): boolean {
    return Boolean(tokens.length && target.fragments.length);
}

function fragmentTargetHasNativeRuby(target: FragmentTextTarget): boolean {
    return target.fragments.some(fragment => fragment.hasNativeRuby);
}

function applyTokensToIndexedFragmentTarget(target: FragmentTextTarget, tokens: JPDBToken[], settings: ReaderSettings, sentence: string): void {
    const indexedFragments = indexTextFragments(target.fragments);
    for (let index = tokens.length - 1; index >= 0; index--) {
        applyTokenToIndexedFragments(target, indexedFragments, tokens[index], settings, sentence);
    }
}

function applyTokenToIndexedFragments(
    target: FragmentTextTarget,
    indexedFragments: IndexedTextFragment[],
    token: JPDBToken,
    settings: ReaderSettings,
    sentence: string,
): void {
    const start = findFragmentBoundary(indexedFragments, token.start, 'start');
    const end = findFragmentBoundary(indexedFragments, token.end, 'end');
    const bounds = attachableFragmentRange(start, end);
    if (!bounds) return;

    const tokenWithSentence = { ...token, sentence: token.sentence ?? sentence };
    const isSingleFragment = bounds.start.fragment === bounds.end.fragment;
    const range = document.createRange();
    range.setStart(bounds.start.fragment.node, bounds.start.localOffset);
    range.setEnd(bounds.end.fragment.node, bounds.end.localOffset);

    if (isSingleFragment) insertSingleFragmentToken(range, target, bounds.start.fragment, token, tokenWithSentence, settings);
    else insertMultiFragmentToken(range, tokenWithSentence);
    range.detach();
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
    range: Range,
    target: FragmentTextTarget,
    fragment: TextFragment,
    token: JPDBToken,
    tokenWithSentence: JPDBToken,
    settings: ReaderSettings,
): void {
    const allowRuby = !fragment.hasNativeRuby && !fragment.suppressRuby && !target.suppressRuby;
    range.deleteContents();
    range.insertNode(renderToken(target.text.slice(token.start, token.end), tokenWithSentence, settings, { allowRuby }));
}

function insertMultiFragmentToken(range: Range, token: JPDBToken): void {
    const shell = renderTokenShell(token);
    shell.append(range.extractContents());
    range.insertNode(shell);
}

function applyTokensToFragmentPieces(
    target: FragmentTextTarget,
    safeTokens: JPDBToken[],
    settings: ReaderSettings,
    sentence: string,
): void {
    let globalOffset = 0;
    for (const fragmentInfo of target.fragments) {
        globalOffset = applyTokensToFragmentPiece(target, fragmentInfo, safeTokens, settings, sentence, globalOffset);
    }
    log.debugThrottled('apply-fragment-pieces', 1000, 'Applied tokens to native ruby fragment target', {
        tokens: safeTokens.length,
        fragments: target.fragments.length,
        textLength: target.text.length,
        parserId: target.parserId,
    });
}

function applyTokensToFragmentPiece(
    target: FragmentTextTarget,
    fragment: TextFragment,
    safeTokens: JPDBToken[],
    settings: ReaderSettings,
    sentence: string,
    fragmentStart: number,
): number {
    const fragmentEnd = fragmentStart + fragment.end - fragment.start;
    if (!fragment.node.parentElement) return fragmentEnd;
    const overlappingTokens = safeTokens.filter(token => tokenOverlapsRange(token, fragmentStart, fragmentEnd));
    if (overlappingTokens.length) replaceFragmentWithTokens(target, fragment, overlappingTokens, settings, sentence, fragmentStart, fragmentEnd);
    return fragmentEnd;
}

function tokenOverlapsRange(token: JPDBToken, start: number, end: number): boolean {
    return token.start < end && token.end > start;
}

function replaceFragmentWithTokens(
    target: FragmentTextTarget,
    fragment: TextFragment,
    tokens: JPDBToken[],
    settings: ReaderSettings,
    sentence: string,
    fragmentStart: number,
    fragmentEnd: number,
): void {
    const nodeText = fragment.node.data;
    const replacement = document.createDocumentFragment();
    let localOffset = fragment.start;
    for (const token of tokens) {
        const nextOffset = appendFragmentToken(replacement, target, fragment, nodeText, token, settings, sentence, fragmentStart, fragmentEnd, localOffset);
        localOffset = nextOffset;
    }
    if (localOffset < fragment.end) replacement.append(document.createTextNode(nodeText.slice(localOffset, fragment.end)));
    fragment.node.replaceWith(replacement);
}

function appendFragmentToken(
    replacement: DocumentFragment,
    target: FragmentTextTarget,
    fragment: TextFragment,
    nodeText: string,
    token: JPDBToken,
    settings: ReaderSettings,
    sentence: string,
    fragmentStart: number,
    fragmentEnd: number,
    localOffset: number,
): number {
    const overlapStart = Math.max(token.start, fragmentStart);
    const overlapEnd = Math.min(token.end, fragmentEnd);
    const localStart = fragment.start + overlapStart - fragmentStart;
    const localEnd = fragment.start + overlapEnd - fragmentStart;
    if (localStart > localOffset) replacement.append(document.createTextNode(nodeText.slice(localOffset, localStart)));
    replacement.append(renderToken(nodeText.slice(localStart, localEnd), { ...token, sentence: token.sentence ?? sentence }, settings, {
        allowRuby: fragmentTokenAllowsRuby(target, fragment, token, overlapStart, overlapEnd),
    }));
    return localEnd;
}

function fragmentTokenAllowsRuby(target: FragmentTextTarget, fragment: TextFragment, token: JPDBToken, overlapStart: number, overlapEnd: number): boolean {
    if (!tokenCoversFragmentOverlap(token, overlapStart, overlapEnd)) return false;
    return fragmentAllowsInjectedRuby(target, fragment);
}

function tokenCoversFragmentOverlap(token: JPDBToken, overlapStart: number, overlapEnd: number): boolean {
    if (overlapStart !== token.start) return false;
    return overlapEnd === token.end;
}

function fragmentAllowsInjectedRuby(target: FragmentTextTarget, fragment: TextFragment): boolean {
    if (fragment.hasNativeRuby) return false;
    if (fragment.suppressRuby) return false;
    return !target.suppressRuby;
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
    for (const token of safeTokens) {
        if (token.start > offset) html += escapeHtml(text.slice(offset, token.start));
        html += renderTokenHtml(text.slice(token.start, token.end), token, settings);
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

function renderToken(
    surface: string,
    token: JPDBToken,
    settings: ReaderSettings,
    options: { allowRuby?: boolean } = {},
): HTMLElement {
    const span = document.createElement('span');
    const state = primaryCardState(token.card.cardState);
    span.className = readerWordClassName(state, token);
    span.dataset.vid = String(token.card.vid);
    span.dataset.sid = String(token.card.sid);
    span.dataset.pitchClass = safePitchClass(token.pitchClass);
    span.dataset.sentence = token.sentence ?? '';
    span.tabIndex = 0;

    const hasRuby = shouldRenderRuby(surface, token, settings, options.allowRuby);
    if (hasRuby) {
        span.classList.add('jpdb-reader-has-furi');
        setInnerHtml(span, renderRuby(surface, token));
    } else {
        span.textContent = surface;
    }
    return span;
}

function renderTokenShell(token: JPDBToken): HTMLElement {
    const span = document.createElement('span');
    const state = primaryCardState(token.card.cardState);
    span.className = readerWordClassName(state, token);
    span.dataset.vid = String(token.card.vid);
    span.dataset.sid = String(token.card.sid);
    span.dataset.pitchClass = safePitchClass(token.pitchClass);
    span.dataset.sentence = token.sentence ?? '';
    span.tabIndex = 0;
    return span;
}

function renderTokenHtml(surface: string, token: JPDBToken, settings: ReaderSettings): string {
    const state = primaryCardState(token.card.cardState);
    const hasRuby = shouldRenderRuby(surface, token, settings);
    const content = hasRuby ? renderRuby(surface, token) : escapeHtml(surface);
    const classes = [readerWordClassName(state, token), hasRuby ? 'jpdb-reader-has-furi' : ''].filter(Boolean).join(' ');
    return `<span class="${classes}" data-vid="${token.card.vid}" data-sid="${token.card.sid}" data-pitch-class="${safePitchClass(token.pitchClass)}" data-sentence="${escapeHtml(token.sentence ?? '')}" tabindex="0">${content}</span>`;
}

function shouldRenderRuby(surface: string, token: JPDBToken, settings: ReaderSettings, allowRuby = true): boolean {
    if (!allowRuby) return false;
    if (!token.rubies.length) return false;
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
    const classes = ['jpdb-reader-word', `jpdb-${state}`, `jpdb-pitch-${safePitchClass(token.pitchClass)}`];
    return classes.join(' ');
}

function safePitchClass(value: string): string {
    return PITCH_CLASSES.has(value) ? value : 'unknown';
}

export function renderRuby(surface: string, token: JPDBToken): string {
    let html = '';
    let localOffset = 0;
    for (const ruby of token.rubies) {
        const start = ruby.start - token.start;
        const end = ruby.end - token.start;
        html += escapeHtml(surface.slice(localOffset, start));
        html += `<ruby>${escapeHtml(surface.slice(start, end))}<rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(ruby.text)}</rt><rp>)</rp></ruby>`;
        localOffset = end;
    }
    html += escapeHtml(surface.slice(localOffset));
    return html;
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function trustedHtml(value: string): string | unknown {
    const factory = (globalThis as unknown as { trustedTypes?: TrustedTypesFactory }).trustedTypes;
    if (!factory) return value;
    if (trustedHtmlPolicy === undefined) trustedHtmlPolicy = createTrustedHtmlPolicy(factory);
    return trustedHtmlPolicy ? trustedHtmlPolicy.createHTML(value) : value;
}

function createTrustedHtmlPolicy(factory: TrustedTypesFactory): { createHTML: (value: string) => unknown } | null {
    const existing = factory.getPolicy?.('yomu-reader');
    if (existing) return existing;
    try {
        return factory.createPolicy?.('yomu-reader', { createHTML: html => html }) ?? null;
    } catch {
        return null;
    }
}

function isVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    if (!isVisibleRect(rect)) return false;
    const style = getComputedStyle(element);
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
    const display = getComputedStyle(element).display;
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
    if (isFragileUiContext(element, text)) return true;

    const metrics = fragileTextMetrics(element, text);
    if (fragileByTypography(element, metrics.style, metrics.compactLength, metrics.fontSize, metrics.lineHeight, metrics.prose)) return true;
    if (fragileByCompactLayout(text, metrics.style, metrics.rect)) return true;
    return fragileByInlineControl(text, metrics.style, metrics.rect);
}

function isFragileUiContext(element: HTMLElement, text: string): boolean {
    if (UI_CLASS_RE.test(String(element.className))) return true;
    if (text.length <= 4 && ancestorClassLooksLikeUi(element)) return true;
    return isInsideControlLikeLink(element, text);
}

function fragileTextMetrics(element: HTMLElement, text: string): {
    style: CSSStyleDeclaration;
    rect: DOMRect;
    compactLength: number;
    fontSize: number;
    lineHeight: number;
    prose: boolean;
} {
    const style = getComputedStyle(element);
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

function shouldSuppressInjectedRuby(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current) {
        if (current === document.body) break;
        if (shouldSuppressRubyAtAncestor(current)) return true;
        current = current.parentElement;
    }
    return false;
}

function shouldSuppressRubyAtAncestor(element: HTMLElement): boolean {
    return DISPLAY_HEADING_RE.test(element.tagName) || isClippedLineBox(element);
}

function isClippedLineBox(element: HTMLElement): boolean {
    const style = getComputedStyle(element);
    if (hasWebkitLineClamp(style)) return true;
    if (!hasClippedOverflow(style)) return false;
    return hasFourLineHeightLimit(style);
}

function hasWebkitLineClamp(style: CSSStyleDeclaration): boolean {
    const webkitLineClamp = style.getPropertyValue('-webkit-line-clamp') || (style as CSSStyleDeclaration & { webkitLineClamp?: string }).webkitLineClamp;
    return Boolean(webkitLineClamp && webkitLineClamp !== 'none' && webkitLineClamp !== '0');
}

function hasClippedOverflow(style: CSSStyleDeclaration): boolean {
    return /(hidden|clip)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`);
}

function hasFourLineHeightLimit(style: CSSStyleDeclaration): boolean {
    const maxHeight = cssPixels(style.maxHeight);
    const explicitHeight = cssPixels(style.height);
    const lineHeight = cssPixels(style.lineHeight) || cssPixels(style.fontSize) * 1.25;
    if (lineHeight <= 0) return false;
    return isWithinFourLines(maxHeight, lineHeight) || isWithinFourLines(explicitHeight, lineHeight);
}

function isWithinFourLines(size: number, lineHeight: number): boolean {
    return size > 0 && size <= lineHeight * 4;
}

function hasUiBox(style: CSSStyleDeclaration): boolean {
    return [
        style.backgroundColor !== 'rgba(0, 0, 0, 0)',
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
    return Boolean(link.querySelector('svg, use, img, [class*="icon" i], [class*="audio" i], [class*="sound" i], [class*="speaker" i], [class*="play" i]'));
}

function linkHasControlShape(link: HTMLElement, text: string): boolean {
    const style = getComputedStyle(link);
    const rect = link.getBoundingClientRect();
    return hasControlLinkStyle(style) && hasShortControlLinkText(link, text) && hasControlLinkWidth(rect);
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
    return style.backgroundColor !== 'rgba(0, 0, 0, 0)'
        || style.borderTopStyle !== 'none'
        || style.borderBottomStyle !== 'none';
}
