import { pageCompartmentValue } from '../platform/window-events';
import { hydratePrivateElementState } from './private-element-state';

type TrustedTypesFactory = {
    createPolicy?: (name: string, options: { createHTML: (value: string) => string }) => { createHTML: (value: string) => unknown };
    getPolicy?: (name: string) => { createHTML: (value: string) => unknown } | null;
};

type TrustedTypesGlobal = typeof globalThis & {
    trustedTypes?: TrustedTypesFactory;
    unsafeWindow?: { trustedTypes?: TrustedTypesFactory };
};

const BLOCKED_HTML_ELEMENTS = new Set(['base', 'embed', 'frame', 'frameset', 'iframe', 'link', 'meta', 'noscript', 'object', 'portal', 'script', 'style', 'foreignobject']);
const BLOCKED_ATTRIBUTES = new Set(['action', 'autofocus', 'formaction', 'is', 'nonce', 'ping', 'srcdoc', 'srcset']);
const URL_ATTRIBUTES = new Set(['href', 'poster', 'src', 'xlink:href']);
const SAFE_URL_PROTOCOLS = new Set(['about:', 'blob:', 'chrome-extension:', 'file:', 'http:', 'https:', 'mailto:', 'moz-extension:', 'safari-web-extension:', 'tel:']);
const DATA_URL_PATTERN = /^data:(?:image\/(?:avif|bmp|gif|jpe?g|png|webp)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+)(?:;[^,]*)?,/i;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
let trustedHtmlPolicy: { createHTML: (value: string) => unknown } | null | undefined;

/*
 * Central HTML sink for Yomu-owned render templates.
 *
 * Callers pass markup assembled by the reader's render functions; dynamic text,
 * attributes, and URLs must still be escaped before they reach this helper.
 * A final sanitizer strips executable elements, handlers, unsafe URLs, and
 * dangerous CSS before the detached fragment enters the live document.
 */
export function setInnerHtml(element: Element, html: string): void {
    if (!replaceWithHtmlFragment(element, html)) {
        element.textContent = html;
    }
}

export function parseHtmlDocument(html: string): Document {
    const parsed = parseHtmlWithDomParser(html);
    if (parsed) return parsed;

    const fallback = document.implementation.createHTMLDocument('');
    fallback.body.textContent = html;
    return fallback;
}

function replaceWithHtmlFragment(element: Element, html: string): boolean {
    try {
        const ownerDocument = element.ownerDocument || document;
        const parsedRoot = parsedReplacementRoot(element, html);
        if (!parsedRoot) return false;
        const fragment = sanitizedReplacementFragment(ownerDocument, parsedRoot);
        // Bind while detached. Connected custom-element callbacks and page
        // MutationObservers never get a live token-bearing control to rewrite.
        hydratePrivateElementState(fragment);
        htmlReplacementTarget(element).replaceChildren(fragment);
        return true;
    } catch {
        return false;
    }
}

function parsedReplacementRoot(element: Element, html: string): Element | null {
    const { source, rootSelector } = contextualSanitizerSource(element, html);
    const parsed = new DOMParser().parseFromString(trustedHtml(source) as string, 'text/html');
    const root = rootSelector ? parsed.querySelector(rootSelector) : parsed.body;
    if (root) sanitizeChildren(root, parsed);
    return root;
}

function sanitizedReplacementFragment(ownerDocument: Document, parsedRoot: Element): DocumentFragment {
    const fragment = ownerDocument.createDocumentFragment();
    fragment.append(...Array.from(parsedRoot.childNodes, node => ownerDocument.importNode(node, true)));
    sanitizeChildren(fragment, ownerDocument);
    return fragment;
}

function htmlReplacementTarget(element: Element): Element | DocumentFragment {
    return element.localName === 'template' && 'content' in element
        ? (element as HTMLTemplateElement).content
        : element;
}

function contextualSanitizerSource(element: Element, html: string): { source: string; rootSelector: string } {
    if (element.namespaceURI === SVG_NAMESPACE) {
        return {
            source: `<svg xmlns="${SVG_NAMESPACE}" data-yomu-sanitize-root>${html}</svg>`,
            rootSelector: '[data-yomu-sanitize-root]',
        };
    }
    switch (element.localName.toLowerCase()) {
        case 'table':
            return {
                source: `<table data-yomu-sanitize-root>${html}</table>`,
                rootSelector: '[data-yomu-sanitize-root]',
            };
        case 'thead':
        case 'tbody':
        case 'tfoot':
            return {
                source: `<table><${element.localName} data-yomu-sanitize-root>${html}</${element.localName}></table>`,
                rootSelector: '[data-yomu-sanitize-root]',
            };
        case 'tr':
            return {
                source: `<table><tbody><tr data-yomu-sanitize-root>${html}</tr></tbody></table>`,
                rootSelector: '[data-yomu-sanitize-root]',
            };
        case 'colgroup':
            return {
                source: `<table><colgroup data-yomu-sanitize-root>${html}</colgroup></table>`,
                rootSelector: '[data-yomu-sanitize-root]',
            };
        case 'select':
            return {
                source: `<select data-yomu-sanitize-root>${html}</select>`,
                rootSelector: '[data-yomu-sanitize-root]',
            };
        case 'optgroup':
            return {
                source: `<select><optgroup data-yomu-sanitize-root>${html}</optgroup></select>`,
                rootSelector: '[data-yomu-sanitize-root]',
            };
        default:
            return { source: html, rootSelector: '' };
    }
}

export function parseXmlDocument(source: string, mimeType: DOMParserSupportedType = 'text/xml'): Document {
    try {
        return new DOMParser().parseFromString(trustedHtml(source) as string, mimeType);
    } catch {
        return document.implementation.createDocument(null, '');
    }
}

function parseHtmlWithDomParser(html: string): Document | null {
    try {
        return new DOMParser().parseFromString(trustedHtml(html) as string, 'text/html');
    } catch {
        return null;
    }
}

export function htmlToFirstElement(html: string): HTMLElement | null {
    const trimmed = html.trim();
    if (!trimmed) return null;
    const template = document.createElement('template');
    setInnerHtml(template, trimmed);
    const first = template.content.firstElementChild;
    if (!(first instanceof HTMLElement)) return null;
    first.remove();
    return first;
}

export function appendToDocumentHead(element: Node): void {
    const target = document.head || document.documentElement || document.body;
    if (target) {
        target.appendChild(element);
        return;
    }
    document.addEventListener(
        'DOMContentLoaded',
        () => {
            if (!element.isConnected) appendToDocumentHead(element);
        },
        { once: true },
    );
}

export function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeChildren(parent: ParentNode, ownerDocument: Document): void {
    for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType !== 1) continue;
        const element = node as Element;
        const localName = element.localName.toLowerCase();
        if (BLOCKED_HTML_ELEMENTS.has(localName) || localName.startsWith('animate') || localName === 'set') {
            element.remove();
            continue;
        }
        if (localName.includes('-')) {
            sanitizeChildren(element, ownerDocument);
            element.replaceWith(...Array.from(element.childNodes));
            continue;
        }
        sanitizeElement(element, ownerDocument);
        const childRoot = localName === 'template' && 'content' in element ? (element as HTMLTemplateElement).content : element;
        sanitizeChildren(childRoot, ownerDocument);
    }
}

function sanitizeElement(element: Element, ownerDocument: Document): void {
    for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (name.startsWith('on') || BLOCKED_ATTRIBUTES.has(name)) {
            element.removeAttribute(attribute.name);
            continue;
        }
        if (URL_ATTRIBUTES.has(name) && !isSafeHtmlUrl(attribute.value)) {
            element.removeAttribute(attribute.name);
            continue;
        }
        if (name === 'style') {
            const style = sanitizedInlineStyle(attribute.value, ownerDocument);
            if (style) element.setAttribute(attribute.name, style);
            else element.removeAttribute(attribute.name);
        }
    }
    if (element.getAttribute('target')?.toLowerCase() === '_blank') {
        const rel = new Set((element.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean));
        rel.add('noopener');
        rel.add('noreferrer');
        element.setAttribute('rel', [...rel].join(' '));
    }
}

function sanitizedInlineStyle(value: string, ownerDocument: Document): string {
    const declaration = ownerDocument.createElement('span').style;
    declaration.cssText = value;
    const containsUnsafeSource =
        /(?:expression\s*\(|javascript\s*:|vbscript\s*:|@import|-moz-binding)/i.test(value) ||
        [...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].some((match) => !isSafeHtmlUrl(match[2]));
    let removedProperty = false;
    for (const property of Array.from(declaration)) {
        const propertyValue = declaration.getPropertyValue(property);
        if (
            property === 'behavior' ||
            property === '-moz-binding' ||
            /(?:expression\s*\(|javascript\s*:|vbscript\s*:|@import|-moz-binding)/i.test(propertyValue) ||
            [...propertyValue.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].some((match) => !isSafeHtmlUrl(match[2]))
        ) {
            declaration.removeProperty(property);
            removedProperty = true;
        }
    }
    return containsUnsafeSource || removedProperty ? declaration.cssText : value;
}

function isSafeHtmlUrl(value: string): boolean {
    const candidate = value.trim().replace(/[\u0000-\u0020\u007f]+/g, '');
    if (!candidate) return true;
    if (candidate.startsWith('#')) return true;
    if (/^data:/i.test(candidate)) return DATA_URL_PATTERN.test(candidate);
    try {
        const parsed = new URL(candidate, 'https://yomureader.invalid/');
        return SAFE_URL_PROTOCOLS.has(parsed.protocol) && (parsed.protocol !== 'about:' || parsed.href === 'about:blank');
    } catch {
        return false;
    }
}

function trustedHtml(value: string): string | unknown {
    try {
        const factory = trustedTypesFactory();
        if (!factory) return value;
        if (trustedHtmlPolicy === undefined) trustedHtmlPolicy = createTrustedHtmlPolicy(factory);
        return trustedHtmlPolicy?.createHTML(value) ?? value;
    } catch {
        trustedHtmlPolicy = null;
        return value;
    }
}

function trustedTypesFactory(): TrustedTypesFactory | undefined {
    const root = globalThis as TrustedTypesGlobal;
    return [root.trustedTypes, typeof window === 'undefined' ? undefined : (window as unknown as TrustedTypesGlobal).trustedTypes, root.unsafeWindow?.trustedTypes].find(
        (factory): factory is TrustedTypesFactory => Boolean(factory),
    );
}

function createTrustedHtmlPolicy(factory: TrustedTypesFactory): { createHTML: (value: string) => unknown } | null {
    const existing = factory.getPolicy?.('yomu-reader');
    if (existing?.createHTML) return existing;
    const options = { createHTML: (html: string) => html };
    return (
        createTrustedHtmlPolicyWithOptions(
            factory,
            pageCompartmentValue(options, {
                cloneFunctions: true,
                wrapReflectors: true,
            }),
        ) ?? createTrustedHtmlPolicyWithOptions(factory, options)
    );
}

function createTrustedHtmlPolicyWithOptions(factory: TrustedTypesFactory, options: { createHTML: (value: string) => string }): { createHTML: (value: string) => unknown } | null {
    try {
        return factory.createPolicy?.('yomu-reader', options) ?? null;
    } catch {
        return null;
    }
}
