import type { JPDBToken, ReaderSettings } from './types';

export const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
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
    'ruby',
    'rt',
    'rp',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[aria-hidden="true"]',
    '[data-jpdb-reader-root]',
    '.jpdb-reader-word',
].join(',');

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
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[aria-hidden="true"]',
    '[data-jpdb-reader-root]',
    '.jpdb-reader-word',
].join(',');

const UI_CLASS_RE = /(^|[-_\s])(btn|button|badge|chip|tag|label|required|pill|tab|nav|menu)([-_\s]|$)/i;
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

export interface TextTarget {
    node: Text;
    text: string;
    parent: HTMLElement;
}

export interface TextFragment {
    node: Text;
    start: number;
    end: number;
    hasNativeRuby: boolean;
}

export interface FragmentTextTarget {
    text: string;
    parent: HTMLElement;
    fragments: TextFragment[];
    parserId?: string;
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

export function collectTextTargetsIn(root: Node, limit = 40, visibleOnly = true): TextTarget[] {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const text = node.textContent?.trim() ?? '';
            if (text.length < 2 || !HAS_JAPANESE.test(text)) return NodeFilter.FILTER_REJECT;

            const parent = node.parentElement;
            if (!parent || parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
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
        if (parent) targets.push({ node: node as Text, text, parent });
    }
    return targets;
}

export function collectFragmentTextTargetsIn(
    root: Node,
    limit = 40,
    visibleOnly = true,
    excludeSelector = '',
): FragmentTextTarget[] {
    const targets: FragmentTextTarget[] = [];
    const fragments: TextFragment[] = [];

    function currentText(): string {
        return fragments.map(fragment => fragment.node.data.slice(fragment.start, fragment.end)).join('');
    }

    function flush(): void {
        if (!fragments.length || targets.length >= limit) {
            fragments.length = 0;
            return;
        }

        const text = currentText();
        if (HAS_JAPANESE.test(text) && text.replace(/\s+/g, '').length >= 2) {
            const parent = fragments[0]?.node.parentElement;
            if (parent) {
                targets.push({ text, parent, fragments: fragments.map(fragment => ({ ...fragment })) });
            }
        }
        fragments.length = 0;
    }

    function visit(node: Node, hasNativeRuby = false): void {
        if (targets.length >= limit) return;

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? '';
            if (text) fragments.push({ node: node as Text, start: 0, end: text.length, hasNativeRuby });
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node as HTMLElement;
        const tagName = element.tagName;
        if (tagName === 'RT' || tagName === 'RP') return;
        if (element.closest('[data-jpdb-reader-root]')) return;
        if (element.matches(FRAGMENT_SKIP_SELECTOR) || (excludeSelector && element.matches(excludeSelector))) {
            flush();
            return;
        }
        if (visibleOnly && !isVisible(element)) {
            flush();
            return;
        }

        const isBlock = isParagraphBoundary(element);
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

export function isFragmentTextTarget(target: ScanTextTarget): target is FragmentTextTarget {
    return 'fragments' in target;
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

    const fragment = document.createDocumentFragment();
    let offset = 0;

    for (const token of safeTokens) {
        if (token.start > offset) {
            fragment.append(document.createTextNode(text.slice(offset, token.start)));
        }
        fragment.append(renderToken(text.slice(token.start, token.end), token, settings));
        offset = token.end;
    }

    if (offset < text.length) {
        fragment.append(document.createTextNode(text.slice(offset)));
    }

    target.node.replaceWith(fragment);
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
                allowRuby: fullTokenInFragment && !fragmentInfo.hasNativeRuby,
            }));
            localOffset = localEnd;
        }

        if (localOffset < fragmentInfo.end) replacement.append(document.createTextNode(nodeText.slice(localOffset, fragmentInfo.end)));
        fragmentInfo.node.replaceWith(replacement);
    }
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
    return html;
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
    const state = token.card.cardState[0] ?? 'not-in-deck';
    span.className = `jpdb-reader-word jpdb-${state}`;
    span.dataset.vid = String(token.card.vid);
    span.dataset.sid = String(token.card.sid);
    span.dataset.sentence = token.sentence ?? '';
    span.tabIndex = 0;

    if (settings.showFurigana && token.rubies.length && options.allowRuby !== false) {
        setInnerHtml(span, renderRuby(surface, token));
    } else {
        span.textContent = surface;
    }
    return span;
}

function renderTokenHtml(surface: string, token: JPDBToken, settings: ReaderSettings): string {
    const state = token.card.cardState[0] ?? 'not-in-deck';
    const content = settings.showFurigana && token.rubies.length ? renderRuby(surface, token) : escapeHtml(surface);
    return `<span class="jpdb-reader-word jpdb-${state}" data-vid="${token.card.vid}" data-sid="${token.card.sid}" data-sentence="${escapeHtml(token.sentence ?? '')}" tabindex="0">${content}</span>`;
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

function isVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || '1') > 0;
}

function isParagraphBoundary(element: HTMLElement): boolean {
    if (BLOCK_TAGS.has(element.tagName)) return true;
    const display = getComputedStyle(element).display;
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

    const style = getComputedStyle(element);
    const display = style.display;
    const rect = element.getBoundingClientRect();
    const compactLength = Array.from(text.replace(/\s+/g, '')).length;
    const fontSize = cssPixels(style.fontSize);
    const lineHeight = cssPixels(style.lineHeight) || fontSize * 1.25;
    const centered = style.textAlign === 'center';
    const heading = DISPLAY_HEADING_RE.test(element.tagName);
    const prose = isLikelyProseElement(element);

    if (heading && compactLength <= 40 && (centered || fontSize >= 18 || lineHeight <= fontSize * 1.35)) return true;
    if (!prose && centered && compactLength <= 30 && (fontSize >= 17 || Number(style.fontWeight) >= 600)) return true;

    if (rect.width > 0 && text.length <= 12 && rect.width < 180 && (style.textAlign === 'center' || style.whiteSpace !== 'normal')) return true;
    const hasUiBox = style.backgroundColor !== 'rgba(0, 0, 0, 0)'
        || style.borderTopStyle !== 'none'
        || Number(style.borderTopWidth.replace('px', '')) > 0
        || Number(style.borderBottomWidth.replace('px', '')) > 0
        || Number.parseFloat(style.borderRadius) > 0;
    const inlineControlShape = display === 'inline-flex' || display === 'inline-grid' || display === 'inline-block' || display === 'flex';
    return text.length <= 6 && hasUiBox && inlineControlShape && rect.width < 180;
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
