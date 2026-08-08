import {
    correspondingWebsiteLocaleHref,
    websiteLocaleForPathname,
    websiteMessage,
    type WebsiteLocaleId,
} from '../locales/site-locales';

type RouteHeadEntry = readonly [
    tag: 'link' | 'meta' | 'script',
    attributes: Readonly<Record<string, string>>,
    content?: string,
];

const LOCALE_BY_MENU_LABEL: Readonly<Record<string, WebsiteLocaleId>> = {
    English: 'en',
    日本語: 'ja',
};

/**
 * Reconcile the two VitePress assumptions our reviewed-route ledger makes
 * invalid: locale routes are not universally present, and transformHead does
 * not update custom metadata during client-side navigation.
 */
export function syncWebsiteRouteLocalization(routeHead: unknown): void {
    syncPublishedLocaleLinks();
    syncDefaultThemeAccessibleCopy();
    syncRouteHead(routeHead);
}

function syncPublishedLocaleLinks(): void {
    const containers = document.querySelectorAll(
        '.VPNavBarTranslations, .VPNavBarExtra, .VPNavScreenTranslations',
    );
    const links = new Set<HTMLAnchorElement>();
    containers.forEach(container => {
        container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => links.add(link));
    });
    links.forEach(link => {
        const targetLocale = LOCALE_BY_MENU_LABEL[link.textContent?.trim() ?? ''];
        if (!targetLocale) return;
        link.setAttribute(
            'href',
            correspondingWebsiteLocaleHref(window.location.pathname, targetLocale),
        );
    });
}

function syncDefaultThemeAccessibleCopy(): void {
    const locale = websiteLocaleForPathname(window.location.pathname);
    const mainNavigation = document.getElementById('main-nav-aria-label');
    if (mainNavigation) mainNavigation.textContent = websiteMessage('docs.theme.mainNavigation', locale);
    document.querySelectorAll<HTMLElement>('.VPNavBarHamburger').forEach(element => {
        element.setAttribute('aria-label', websiteMessage('docs.theme.mobileNavigation', locale));
    });
    document.querySelectorAll<HTMLElement>('.VPNavBarExtra > button[aria-label]').forEach(element => {
        element.setAttribute('aria-label', websiteMessage('docs.theme.extraNavigation', locale));
    });
}

function syncRouteHead(value: unknown): void {
    const entries = routeHeadEntries(value);
    if (!entries) return;
    document.head.querySelectorAll('[data-yomu-route-head]').forEach(element => element.remove());
    entries.forEach(([tag, attributes, content]) => {
        const element = document.createElement(tag);
        Object.entries(attributes).forEach(([name, attributeValue]) => {
            element.setAttribute(name, attributeValue);
        });
        if (content !== undefined) element.textContent = content;
        document.head.append(element);
    });
}

function routeHeadEntries(value: unknown): RouteHeadEntry[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const entries: RouteHeadEntry[] = [];
    for (const candidate of value) {
        if (!Array.isArray(candidate) || candidate.length < 2) return undefined;
        const [tag, attributes, content] = candidate;
        if (tag !== 'link' && tag !== 'meta' && tag !== 'script') return undefined;
        if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return undefined;
        if (content !== undefined && typeof content !== 'string') return undefined;
        const attributeEntries = Object.entries(attributes);
        if (!attributeEntries.every((entry): entry is [string, string] => typeof entry[1] === 'string')) {
            return undefined;
        }
        const stringAttributes = Object.fromEntries(attributeEntries);
        entries.push([tag, stringAttributes, content]);
    }
    return entries;
}
