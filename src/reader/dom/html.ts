type TrustedTypesFactory = {
    createPolicy?: (name: string, options: { createHTML: (value: string) => string }) => { createHTML: (value: string) => unknown };
    getPolicy?: (name: string) => { createHTML: (value: string) => unknown } | null;
};

type TrustedTypesGlobal = typeof globalThis & {
    trustedTypes?: TrustedTypesFactory;
    unsafeWindow?: { trustedTypes?: TrustedTypesFactory };
};

let trustedHtmlPolicy: { createHTML: (value: string) => unknown } | null | undefined;

/*
 * Central HTML sink for Yomu-owned render templates.
 *
 * Callers pass markup assembled by the reader's render functions; dynamic text,
 * attributes, and URLs must be escaped before they reach this helper. Keeping
 * the assignment centralized makes AMO/CWS review notes and Trusted Types
 * behavior auditable instead of scattering raw HTML sinks through feature code.
 */
export function setInnerHtml(element: Element, html: string): void {
    if (!assignInnerHtml(element, html)) element.textContent = html;
}

export function parseHtmlDocument(html: string): Document {
    const parsed = parseHtmlWithDomParser(html);
    if (parsed) return parsed;

    const fallback = document.implementation.createHTMLDocument('');
    if (assignInnerHtml(fallback.documentElement, html)) return fallback;
    if (assignInnerHtml(fallback.body, html)) return fallback;
    fallback.body.textContent = html;
    return fallback;
}

function assignInnerHtml(element: Element, html: string): boolean {
    try {
        element.innerHTML = trustedHtml(html) as string;
        return true;
    } catch {
        return false;
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

export function appendTrustedHtml(element: Element, html: string): void {
    const template = document.createElement('template');
    setInnerHtml(template, html);
    element.append(template.content);
}

export function htmlToFirstElement(html: string): HTMLElement | null {
    const trimmed = html.trim();
    if (!trimmed) return null;
    const template = document.createElement('template');
    setInnerHtml(template, trimmed);
    const first = template.content.firstElementChild;
    return first instanceof HTMLElement ? document.importNode(first, true) as HTMLElement : null;
}

export function appendToDocumentHead(element: Node): void {
    const target = document.head || document.documentElement || document.body;
    target.appendChild(element);
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function trustedHtml(value: string): string | unknown {
    try {
        const factory = trustedTypesFactory();
        if (!factory) return value;
        if (trustedHtmlPolicy === undefined) trustedHtmlPolicy = createTrustedHtmlPolicy(factory);
        return trustedHtmlPolicy && typeof trustedHtmlPolicy.createHTML === 'function' ? trustedHtmlPolicy.createHTML(value) : value;
    } catch {
        trustedHtmlPolicy = null;
        return value;
    }
}

function trustedTypesFactory(): TrustedTypesFactory | undefined {
    const root = globalThis as TrustedTypesGlobal;
    return [
        root.trustedTypes,
        typeof window === 'undefined' ? undefined : (window as unknown as TrustedTypesGlobal).trustedTypes,
        root.unsafeWindow?.trustedTypes,
    ].find((factory): factory is TrustedTypesFactory => Boolean(factory));
}

function createTrustedHtmlPolicy(factory: TrustedTypesFactory): { createHTML: (value: string) => unknown } | null {
    try {
        const existing = factory.getPolicy?.('yomu-reader');
        if (existing && typeof existing.createHTML === 'function') return existing;
        return factory.createPolicy?.('yomu-reader', { createHTML: html => html }) ?? null;
    } catch {
        return null;
    }
}
