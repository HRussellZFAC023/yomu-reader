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
    'nav',
    'header',
    'footer',
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
    '[role="button"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[onclick]',
    '[data-audio]',
    '[class*="audio" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class*="listen" i]',
    '[class*="button" i]',
    '[class*="btn" i]',
    '[class*="voice" i]',
    '[aria-hidden="true"]',
    '.jpdb-reader-word',
].join(',');
const READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';

const FRAGMENT_SKIP_SELECTOR = [
    'script',
    'style',
    'noscript',
    'form',
    'label',
    'fieldset',
    'legend',
    'nav',
    'header',
    'footer',
    'textarea',
    'input',
    'select',
    'button',
    'option',
    'summary',
    'svg',
    'use',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[onclick]',
    '[data-audio]',
    '[class*="audio" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class*="listen" i]',
    '[class*="button" i]',
    '[class*="btn" i]',
    '[class*="voice" i]',
    '[aria-hidden="true"]',
    '[data-jpdb-reader-root]',
    '.jpdb-reader-word',
].join(',');

const UI_CLASS_RE = /(^|[-_\s])(audio|badge|btn|button|chip|control|icon|label|menu|nav|pill|play|required|sound|speaker|tab|tag)([-_\s]|$)/i;
const DISPLAY_HEADING_RE = /^H[1-6]$/;
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

export function getSelectionText(): string {
    const selection = window.getSelection();
    return selection?.toString().replace(/\s+/g, ' ').trim() ?? '';
}

export function getSelectionSentence(): string {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return getSelectionText();

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const host = (container.nodeType === Node.TEXT_NODE ? container.parentElement : container as Element)
        ?.closest('p, li, blockquote, td, th, div, article, section');
    const fullText = host?.textContent?.replace(/\s+/g, ' ').trim();
    const selected = getSelectionText();
    if (!fullText || !selected) return selected;

    const index = fullText.indexOf(selected);
    if (index === -1) return selected;

    const before = fullText.slice(0, index);
    const after = fullText.slice(index + selected.length);
    const start = Math.max(
        before.lastIndexOf('。'),
        before.lastIndexOf('！'),
        before.lastIndexOf('？'),
        before.lastIndexOf('\n'),
    ) + 1;
    const endCandidates = ['。', '！', '？', '\n']
        .map(mark => after.indexOf(mark))
        .filter(pos => pos >= 0);
    const end = endCandidates.length ? index + selected.length + Math.min(...endCandidates) + 1 : fullText.length;
    return fullText.slice(start, end).trim() || selected;
}

export function collectVisibleTextTargets(limit = 40): TextTarget[] {
    return collectTextTargetsIn(document.body, limit, true);
}

export function documentHasJapaneseText(limit = 200000): boolean {
    if (!document.body) return false;
    let inspected = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent || parent.closest(SKIP_SELECTOR) || parent.closest(READER_ROOT_SELECTOR)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });

    let node: Node | null;
    while ((node = walker.nextNode())) {
        const text = node.textContent ?? '';
        if (HAS_JAPANESE.test(text)) return true;
        inspected += text.length;
        if (inspected >= limit) return false;
    }
    return false;
}

export function collectTextTargetsIn(root: Node, limit = 40, visibleOnly = true, options: { includeReaderRoot?: boolean } = {}): TextTarget[] {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const text = node.textContent?.trim() ?? '';
            if (text.length < 2 || !HAS_JAPANESE.test(text)) return NodeFilter.FILTER_REJECT;

            const parent = node.parentElement;
            if (!parent || parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
            if (!options.includeReaderRoot && parent.closest(READER_ROOT_SELECTOR)) return NodeFilter.FILTER_REJECT;
            if (visibleOnly && !isVisible(parent)) return NodeFilter.FILTER_REJECT;
            if (isFragileUiText(parent, text)) return NodeFilter.FILTER_REJECT;
            if (parent.childNodes.length > 6) return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
        },
    });

    const targets: TextTarget[] = [];
    let node: Node | null;
    while ((node = walker.nextNode()) && targets.length < limit) {
        const text = node.textContent?.trim() ?? '';
        const parent = node.parentElement;
        if (parent) targets.push({
            node: node as Text,
            text,
            parent,
            hasNativeRuby: Boolean(parent.closest('ruby')),
            suppressRuby: shouldSuppressInjectedRuby(parent),
        });
    }
    return targets;
}

export function collectFragmentTextTargetsIn(
    root: Node,
    limit = 40,
    visibleOnly = true,
    excludeSelector = '',
    options: { allowUiText?: boolean; minLength?: number; includeReaderRoot?: boolean } = {},
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
        if (element.matches(FRAGMENT_SKIP_SELECTOR) || (excludeSelector && element.matches(excludeSelector))) {
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
    while (trimmed.length) {
        const first = trimmed[0];
        while (first.start < first.end && /\s/u.test(first.node.data[first.start] ?? '')) first.start += 1;
        if (first.start < first.end) break;
        trimmed.shift();
    }
    while (trimmed.length) {
        const last = trimmed[trimmed.length - 1];
        while (last.end > last.start && /\s/u.test(last.node.data[last.end - 1] ?? '')) last.end -= 1;
        if (last.start < last.end) break;
        trimmed.pop();
    }
    return trimmed;
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

export function applyTokensToTextNode(target: TextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (!tokens.length || !target.node.parentElement) return;

    const text = target.text;
    const safeTokens = nonOverlappingTokens(tokens, text.length);
    if (!safeTokens.length) return;

    const fragment = document.createDocumentFragment();
    let offset = 0;

    for (const token of safeTokens) {
        if (token.start > offset) {
            fragment.append(document.createTextNode(text.slice(offset, token.start)));
        }
        fragment.append(renderToken(text.slice(token.start, token.end), token, settings, {
            allowRuby: !target.hasNativeRuby && !target.suppressRuby,
        }));
        offset = token.end;
    }

    if (offset < text.length) {
        fragment.append(document.createTextNode(text.slice(offset)));
    }

    target.node.replaceWith(fragment);
    log.debugThrottled('apply-text-node', 1000, 'Applied tokens to text node', { tokens: safeTokens.length, textLength: text.length, parent: nodeLabel(target.parent) });
}

export function applyTokensToFragmentTarget(target: FragmentTextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (!tokens.length || !target.fragments.length) return;

    const safeTokens = nonOverlappingTokens(tokens, target.text.length);
    if (!safeTokens.length) return;

    const sentence = target.text.replace(/\s+/g, ' ').trim();
    let globalOffset = 0;

    for (const fragmentInfo of target.fragments) {
        if (!fragmentInfo.node.parentElement) {
            globalOffset += fragmentInfo.end - fragmentInfo.start;
            continue;
        }

        const fragmentLength = fragmentInfo.end - fragmentInfo.start;
        const fragmentStart = globalOffset;
        const fragmentEnd = fragmentStart + fragmentLength;
        const overlappingTokens = safeTokens.filter(token => token.start < fragmentEnd && token.end > fragmentStart);
        globalOffset = fragmentEnd;
        if (!overlappingTokens.length) continue;

        const nodeText = fragmentInfo.node.data;
        const replacement = document.createDocumentFragment();
        let localOffset = fragmentInfo.start;

        for (const token of overlappingTokens) {
            const overlapStart = Math.max(token.start, fragmentStart);
            const overlapEnd = Math.min(token.end, fragmentEnd);
            const localStart = fragmentInfo.start + overlapStart - fragmentStart;
            const localEnd = fragmentInfo.start + overlapEnd - fragmentStart;
            if (localStart > localOffset) replacement.append(document.createTextNode(nodeText.slice(localOffset, localStart)));

            const surface = nodeText.slice(localStart, localEnd);
            const fullTokenInFragment = overlapStart === token.start && overlapEnd === token.end;
            replacement.append(renderToken(surface, { ...token, sentence: token.sentence ?? sentence }, settings, {
                allowRuby: fullTokenInFragment && !fragmentInfo.hasNativeRuby && !fragmentInfo.suppressRuby && !target.suppressRuby,
            }));
            localOffset = localEnd;
        }

        if (localOffset < fragmentInfo.end) replacement.append(document.createTextNode(nodeText.slice(localOffset, fragmentInfo.end)));
        fragmentInfo.node.replaceWith(replacement);
    }
    log.debugThrottled('apply-fragment', 1000, 'Applied tokens to fragment target', {
        tokens: safeTokens.length,
        fragments: target.fragments.length,
        textLength: target.text.length,
        parserId: target.parserId,
    });
}

export function renderTokensToHtml(text: string, tokens: JPDBToken[], settings: ReaderSettings): string {
    if (!tokens.length) return escapeHtml(text);

    let html = '';
    let offset = 0;
    const safeTokens = nonOverlappingTokens(tokens, text.length);
    for (const token of safeTokens) {
        if (token.start > offset) html += escapeHtml(text.slice(offset, token.start));
        html += renderTokenHtml(text.slice(token.start, token.end), token, settings);
        offset = token.end;
    }
    if (offset < text.length) html += escapeHtml(text.slice(offset));
    log.debugThrottled('render-token-html', 1000, 'Rendered token HTML', { tokens: safeTokens.length, textLength: text.length, htmlLength: html.length });
    return html;
}

export function renderHighlightedTextHtml(text: string, targets: string[], className: string): string {
    const needles = uniqueNonEmptyStrings(targets).sort((a, b) => b.length - a.length);
    if (!text || !needles.length) return escapeHtml(text);

    let html = '';
    let offset = 0;
    while (offset < text.length) {
        let matchIndex = -1;
        let matchNeedle = '';
        for (const needle of needles) {
            const index = text.indexOf(needle, offset);
            if (index < 0) continue;
            if (matchIndex < 0 || index < matchIndex || (index === matchIndex && needle.length > matchNeedle.length)) {
                matchIndex = index;
                matchNeedle = needle;
            }
        }
        if (matchIndex < 0 || !matchNeedle) break;
        if (matchIndex > offset) html += escapeHtml(text.slice(offset, matchIndex));
        html += `<mark class="${escapeHtml(className)}">${escapeHtml(text.slice(matchIndex, matchIndex + matchNeedle.length))}</mark>`;
        offset = matchIndex + matchNeedle.length;
    }
    if (offset < text.length) html += escapeHtml(text.slice(offset));
    return html;
}

function uniqueNonEmptyStrings(values: string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function nonOverlappingTokens(tokens: JPDBToken[], textLength: number): JPDBToken[] {
    const safe: JPDBToken[] = [];
    let offset = 0;
    for (const token of tokens) {
        if (token.start < offset || token.start < 0 || token.end <= token.start || token.end > textLength) continue;
        safe.push(token);
        offset = token.end;
    }
    return safe;
}

function renderToken(
    surface: string,
    token: JPDBToken,
    settings: ReaderSettings,
    options: { allowRuby?: boolean } = {},
): HTMLElement {
    const span = document.createElement('span');
    const state = primaryCardState(token.card.cardState);
    span.className = readerWordClassName(state, token, settings);
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

function renderTokenHtml(surface: string, token: JPDBToken, settings: ReaderSettings): string {
    const state = primaryCardState(token.card.cardState);
    const hasRuby = shouldRenderRuby(surface, token, settings);
    const content = hasRuby ? renderRuby(surface, token) : escapeHtml(surface);
    const classes = [readerWordClassName(state, token, settings), hasRuby ? 'jpdb-reader-has-furi' : ''].filter(Boolean).join(' ');
    return `<span class="${classes}" data-vid="${token.card.vid}" data-sid="${token.card.sid}" data-pitch-class="${safePitchClass(token.pitchClass)}" data-sentence="${escapeHtml(token.sentence ?? '')}" tabindex="0">${content}</span>`;
}

function shouldRenderRuby(surface: string, token: JPDBToken, settings: ReaderSettings, allowRuby = true): boolean {
    if (!allowRuby || !token.rubies.length) return false;
    const mode = effectiveFuriganaMode(settings);
    if (mode === 'off') return false;
    if (mode === 'difficult-kanji') return hasDifficultKanji(surface);
    return true;
}

function hasDifficultKanji(surface: string): boolean {
    for (const char of surface) {
        if (KANJI_RE.test(char) && !EASY_FURIGANA_KANJI.has(char)) return true;
    }
    return false;
}

function readerWordClassName(state: string, token: JPDBToken, settings: ReaderSettings): string {
    const classes = ['jpdb-reader-word', `jpdb-${state}`, `jpdb-pitch-${safePitchClass(token.pitchClass)}`];
    return classes.join(' ');
}

function safePitchClass(value: string): string {
    return value === 'heiban' || value === 'atamadaka' || value === 'nakadaka' || value === 'odaka' || value === 'kifuku'
        ? value
        : 'unknown';
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
    if (trustedHtmlPolicy === undefined) {
        trustedHtmlPolicy = factory.getPolicy?.('yomu-reader') ?? null;
        if (!trustedHtmlPolicy) {
            try {
                trustedHtmlPolicy = factory.createPolicy?.('yomu-reader', { createHTML: html => html }) ?? null;
            } catch {
                trustedHtmlPolicy = null;
            }
        }
    }
    return trustedHtmlPolicy ? trustedHtmlPolicy.createHTML(value) : value;
}

function nodeLabel(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return '#text';
    if (node.nodeType !== Node.ELEMENT_NODE) return node.nodeName.toLowerCase();
    const element = node as Element;
    const id = element.id ? `#${element.id}` : '';
    const classes = element.classList.length ? `.${[...element.classList].slice(0, 3).join('.')}` : '';
    return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function isVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || '1') > 0;
}

function isParagraphBoundary(element: HTMLElement): boolean {
    const display = getComputedStyle(element).display;
    if (element.tagName === 'BR') return true;
    if (display === 'inline' || display === 'contents' || display === 'inline-block' || display === 'inline-flex' || display === 'inline-grid') return false;
    if (BLOCK_TAGS.has(element.tagName)) return true;
    return display === 'block'
        || display === 'flow-root'
        || display === 'grid'
        || display === 'list-item'
        || display === 'table'
        || display === 'table-row'
        || display === 'table-cell';
}

function isFragileUiText(element: HTMLElement, text: string): boolean {
    if (UI_CLASS_RE.test(element.className || '')) return true;
    if (text.length <= 4 && ancestorClassLooksLikeUi(element)) return true;
    if (isInsideControlLikeLink(element, text)) return true;

    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const compactLength = Array.from(text.replace(/\s+/g, '')).length;
    const fontSize = cssPixels(style.fontSize);
    const lineHeight = cssPixels(style.lineHeight) || fontSize * 1.25;
    const prose = isLikelyProseElement(element);
    if (fragileByTypography(element, style, compactLength, fontSize, lineHeight, prose)) return true;
    if (rect.width > 0 && text.length <= 12 && rect.width < 180 && (style.textAlign === 'center' || style.whiteSpace !== 'normal')) return true;
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
    if (heading && isReadableArticleHeading(element, compactLength)) return false;
    if (heading && compactLength <= 40 && (centered || fontSize >= 18 || lineHeight <= fontSize * 1.35)) return true;
    return !prose && centered && compactLength <= 30 && (fontSize >= 17 || Number(style.fontWeight) >= 600);
}

function isReadableArticleHeading(element: HTMLElement, compactLength: number): boolean {
    return compactLength >= 4 && Boolean(element.closest('article, main, [role="main"]'));
}

function shouldSuppressInjectedRuby(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current && current !== document.body) {
        if (DISPLAY_HEADING_RE.test(current.tagName) || isClippedLineBox(current)) return true;
        current = current.parentElement;
    }
    return false;
}

function isClippedLineBox(element: HTMLElement): boolean {
    const style = getComputedStyle(element);
    const webkitLineClamp = style.getPropertyValue('-webkit-line-clamp') || (style as CSSStyleDeclaration & { webkitLineClamp?: string }).webkitLineClamp;
    if (webkitLineClamp && webkitLineClamp !== 'none' && webkitLineClamp !== '0') return true;

    const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
    if (!/(hidden|clip)/.test(overflow)) return false;

    const maxHeight = cssPixels(style.maxHeight);
    const explicitHeight = cssPixels(style.height);
    const lineHeight = cssPixels(style.lineHeight) || cssPixels(style.fontSize) * 1.25;
    return lineHeight > 0 && ((maxHeight > 0 && maxHeight <= lineHeight * 4) || (explicitHeight > 0 && explicitHeight <= lineHeight * 4));
}

function hasUiBox(style: CSSStyleDeclaration): boolean {
    return style.backgroundColor !== 'rgba(0, 0, 0, 0)'
        || style.borderTopStyle !== 'none'
        || Number(style.borderTopWidth.replace('px', '')) > 0
        || Number(style.borderBottomWidth.replace('px', '')) > 0
        || Number.parseFloat(style.borderRadius) > 0;
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
    while (current && current !== document.body) {
        if (UI_CLASS_RE.test(current.className || '')) return true;
        current = current.parentElement;
    }
    return false;
}

function isInsideControlLikeLink(element: HTMLElement, text: string): boolean {
    const link = element.closest('a[href]') as HTMLElement | null;
    if (!link) return false;
    if (link.closest('article, main, [role="main"]') && isLikelyProseElement(element)) return false;
    if (UI_CLASS_RE.test(link.className || '') || link.hasAttribute('onclick') || link.hasAttribute('data-audio')) return true;
    if (link.querySelector('svg, use, img, [class*="icon" i], [class*="audio" i], [class*="sound" i], [class*="speaker" i], [class*="play" i]')) return true;

    const style = getComputedStyle(link);
    const rect = link.getBoundingClientRect();
    const textLength = Array.from(text.replace(/\s+/g, '')).length;
    const linkTextLength = Array.from((link.textContent ?? '').replace(/\s+/g, '')).length;
    const controlShape = style.display.includes('flex')
        || style.display.includes('grid')
        || style.display === 'inline-block'
        || Number.parseFloat(style.borderRadius) > 0
        || style.backgroundColor !== 'rgba(0, 0, 0, 0)'
        || style.borderTopStyle !== 'none'
        || style.borderBottomStyle !== 'none';

    return controlShape && textLength <= 16 && linkTextLength <= 40 && rect.width > 0 && rect.width < 360;
}
