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
    'textarea',
    'input',
    'select',
    'button',
    '[contenteditable="true"]',
    '[data-jpdb-reader-root]',
    '.jpdb-reader-word',
].join(',');

export function setInnerHtml(element: Element, html: string): void {
    element.innerHTML = trustedHtml(html) as string;
}

export interface TextTarget {
    node: Text;
    text: string;
    parent: HTMLElement;
}

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

export function applyTokensToTextNode(target: TextTarget, tokens: JPDBToken[], settings: ReaderSettings): void {
    if (!tokens.length || !target.node.parentElement) return;

    const text = target.text;
    const fragment = document.createDocumentFragment();
    let offset = 0;

    for (const token of tokens) {
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

export function renderTokensToHtml(text: string, tokens: JPDBToken[], settings: ReaderSettings): string {
    if (!tokens.length) return escapeHtml(text);

    let html = '';
    let offset = 0;
    for (const token of tokens) {
        if (token.start > offset) html += escapeHtml(text.slice(offset, token.start));
        html += renderTokenHtml(text.slice(token.start, token.end), token, settings);
        offset = token.end;
    }
    if (offset < text.length) html += escapeHtml(text.slice(offset));
    return html;
}

function renderToken(surface: string, token: JPDBToken, settings: ReaderSettings): HTMLElement {
    const span = document.createElement('span');
    const state = token.card.cardState[0] ?? 'not-in-deck';
    span.className = `jpdb-reader-word jpdb-${state}`;
    span.dataset.vid = String(token.card.vid);
    span.dataset.sid = String(token.card.sid);
    span.dataset.sentence = token.sentence ?? '';
    span.tabIndex = 0;

    if (settings.showFurigana && token.rubies.length) {
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
