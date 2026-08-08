import { parseFragment, serialize, type DefaultTreeAdapterTypes } from 'parse5';
import { translateReviewedDocsText } from './docs-prose-catalog';
import {
    localizedWebsiteHref,
    websiteLocaleForRelativePath,
    type WebsiteLocaleId,
} from './site-locales';

interface MarkdownAttribute extends Array<string> {
    0: string;
    1: string;
}

interface MarkdownToken {
    type: string;
    content: string;
    attrs?: MarkdownAttribute[] | null;
    children?: MarkdownToken[] | null;
}

interface MarkdownEnvironment {
    relativePath?: string;
}

interface MarkdownItLike {
    core: {
        ruler: {
            after(afterName: string, ruleName: string, rule: (state: MarkdownCoreState) => void): void;
        };
    };
}

interface MarkdownCoreState {
    env: MarkdownEnvironment;
    tokens: MarkdownToken[];
}

const TRANSLATED_ATTRIBUTES = new Set(['aria-label', 'title', 'alt', 'placeholder']);
const SKIPPED_ELEMENTS = new Set(['code', 'input', 'kbd', 'pre', 'samp', 'script', 'style', 'textarea']);

/**
 * Localise reviewed route content before VitePress renders SSR HTML or serialises
 * page-data chunks. This is intentionally a Markdown pipeline rule rather than a
 * browser DOM pass: SSR, hydration, and SPA navigation consume the same tokens.
 */
export function installReviewedDocsMarkdownLocales(md: MarkdownItLike): void {
    md.core.ruler.after('inline', 'yomu-reviewed-docs-locales', state => {
        const locale = websiteLocaleForRelativePath(state.env.relativePath ?? '');
        if (locale === 'en') return;
        localizeMarkdownTokens(state.tokens, locale);
    });
}

export function localizeMarkdownTokens(tokens: MarkdownToken[], locale: WebsiteLocaleId): void {
    for (const token of tokens) localizeMarkdownToken(token, locale);
}

export function localizeHtmlFragment(html: string, locale: WebsiteLocaleId): string {
    if (locale === 'en') return html;
    const fragment = parseFragment(html);
    const changed = localizeHtmlChildren(fragment.childNodes, locale, false);
    return changed ? serialize(fragment) : html;
}

function localizeMarkdownToken(token: MarkdownToken, locale: WebsiteLocaleId): void {
    localizeMarkdownTokenContent(token, locale);
    localizeMarkdownLink(token, locale);
    if (token.children) localizeMarkdownTokens(token.children, locale);
}

function localizeMarkdownLink(token: MarkdownToken, locale: WebsiteLocaleId): void {
    if (!token.attrs) return;
    for (const attribute of token.attrs) localizeMarkdownAttribute(attribute, locale);
}

function localizeMarkdownTokenContent(token: MarkdownToken, locale: WebsiteLocaleId): void {
    if (token.type === 'text') token.content = translateReviewedDocsText(token.content, locale);
    if (token.type === 'html_block') token.content = localizeHtmlFragment(token.content, locale);
    if (token.type === 'html_inline') token.content = localizeHtmlFragment(token.content, locale);
}

function localizeMarkdownAttribute(attribute: MarkdownAttribute, locale: WebsiteLocaleId): void {
    if (attribute[0] === 'href') {
        attribute[1] = localizedWebsiteHref(attribute[1], locale);
        return;
    }
    if (!TRANSLATED_ATTRIBUTES.has(attribute[0])) return;
    attribute[1] = translateReviewedDocsText(attribute[1], locale);
}

function localizeHtmlChildren(
    nodes: DefaultTreeAdapterTypes.ChildNode[],
    locale: WebsiteLocaleId,
    skipped: boolean,
): boolean {
    let changed = false;
    for (const node of nodes) changed = localizeHtmlNode(node, locale, skipped) || changed;
    return changed;
}

function localizeHtmlNode(
    node: DefaultTreeAdapterTypes.ChildNode,
    locale: WebsiteLocaleId,
    skipped: boolean,
): boolean {
    if (isHtmlTextNode(node)) return localizeHtmlText(node, locale, skipped);
    if (!isHtmlElement(node)) return false;
    const nodeSkipped = htmlNodeIsSkipped(node, skipped);
    let changed = localizeHtmlAttributes(node, locale, nodeSkipped);
    changed = localizeHtmlChildren(node.childNodes, locale, nodeSkipped) || changed;
    return changed;
}

function isHtmlTextNode(node: DefaultTreeAdapterTypes.ChildNode): node is DefaultTreeAdapterTypes.TextNode {
    return node.nodeName === '#text' && !('tagName' in node);
}

function isHtmlElement(node: DefaultTreeAdapterTypes.ChildNode): node is DefaultTreeAdapterTypes.Element {
    return 'tagName' in node;
}

function htmlNodeIsSkipped(node: DefaultTreeAdapterTypes.Element, parentSkipped: boolean): boolean {
    return parentSkipped || shouldSkipHtmlElement(node);
}

function localizeHtmlText(
    node: DefaultTreeAdapterTypes.TextNode,
    locale: WebsiteLocaleId,
    skipped: boolean,
): boolean {
    if (skipped) return false;
    const translated = translateReviewedDocsText(node.value, locale);
    if (translated === node.value) return false;
    node.value = translated;
    return true;
}

function localizeHtmlAttributes(
    node: DefaultTreeAdapterTypes.Element,
    locale: WebsiteLocaleId,
    skipped: boolean,
): boolean {
    if (skipped) return false;
    let changed = false;
    for (const attribute of node.attrs) {
        const translated = translatedHtmlAttribute(node, attribute.name, attribute.value, locale);
        if (translated === attribute.value) continue;
        attribute.value = translated;
        changed = true;
    }
    return changed;
}

function translatedHtmlAttribute(
    node: DefaultTreeAdapterTypes.Element,
    name: string,
    value: string,
    locale: WebsiteLocaleId,
): string {
    if (name === 'href' && node.tagName === 'a') return localizedWebsiteHref(value, locale);
    return TRANSLATED_ATTRIBUTES.has(name) ? translateReviewedDocsText(value, locale) : value;
}

function shouldSkipHtmlElement(node: DefaultTreeAdapterTypes.Element): boolean {
    if (SKIPPED_ELEMENTS.has(node.tagName)) return true;
    return node.attrs.some(attribute =>
        (attribute.name === 'data-yomu-localize' && attribute.value === 'off')
        || attribute.name === 'data-yomu-reader-owned',
    );
}
