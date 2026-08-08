import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import {
    WEBSITE_ROUTE_CATALOG,
    publishedWebsiteRouteDefinitions,
    websiteRoutePublication,
    type WebsiteRouteDefinition,
} from '../docs/.vitepress/locales/route-catalog.ts';
import { unavailableWebsiteLocales } from '../docs/.vitepress/locales/site-locales.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'docs', '.vitepress', 'dist');
const ORIGIN = 'https://yomureader.com';
const LOCALIZED_CHROME_EXPECTATIONS = {
    en: { navigation: 'Learning path', footer: 'Free and open source.', localeLabel: '日本語', localeHref: '/ja/' },
    ja: { navigation: '学習の道筋', footer: '無料のオープンソースです。', localeLabel: 'English', localeHref: '/' },
} as const;

assert.ok(existsSync(DIST), 'docs build output is missing');
const reviewedJapaneseRoutes = publishedWebsiteRouteDefinitions('ja');
assert.equal(htmlFiles(path.join(DIST, 'ja')).length, reviewedJapaneseRoutes.length, 'Japanese rendered-route count');

for (const definition of WEBSITE_ROUTE_CATALOG) checkRenderedRoute(definition, 'en');
for (const definition of reviewedJapaneseRoutes) checkRenderedRoute(definition, 'ja');
for (const definition of WEBSITE_ROUTE_CATALOG.filter(route => !websiteRoutePublication(route, 'ja'))) {
    assert.equal(existsSync(renderedFile(definition.route, 'ja')), false, `unreviewed Japanese route published: ${definition.route}`);
}
for (const locale of unavailableWebsiteLocales()) {
    assert.equal(existsSync(path.join(DIST, locale.id)), false, `unreviewed locale directory published: ${locale.id}`);
    assert.equal(existsSync(path.join(DIST, locale.tag)), false, `unreviewed locale tag published: ${locale.tag}`);
}

console.log(`Rendered locale gate passed: ${WEBSITE_ROUTE_CATALOG.length} EN + ${reviewedJapaneseRoutes.length} reviewed JA routes; ${WEBSITE_ROUTE_CATALOG.length - reviewedJapaneseRoutes.length} JA routes and ${unavailableWebsiteLocales().length} locales fail closed.`);

function checkRenderedRoute(definition: WebsiteRouteDefinition, locale: 'en' | 'ja'): void {
    const file = renderedFile(definition.route, locale);
    assert.ok(existsSync(file), `missing ${locale} route: ${definition.route || '/'}`);
    const source = readFileSync(file, 'utf8');
    const document = parse(source);
    const publication = websiteRoutePublication(definition, locale);
    assert.ok(publication, `${locale} route lacks reviewed publication metadata: ${definition.route}`);
    checkDocumentIdentity(document, file, definition, locale, publication.title, publication.description);
    checkRouteAlternates(document, file, definition, locale);
    checkLocalizedChrome(document, source, file, locale);
}

function checkDocumentIdentity(
    document: DefaultTreeAdapterTypes.Document,
    file: string,
    definition: WebsiteRouteDefinition,
    locale: 'en' | 'ja',
    title: string,
    description: string,
): void {
    const html = element(document, 'html');
    assert.equal(attribute(html, 'lang'), locale, `${file}: html lang`);
    assert.equal(attribute(html, 'dir'), 'ltr', `${file}: html dir seam`);
    const documentTitle = definition.route ? `${title} | よむ` : title;
    assert.equal(text(element(document, 'title')), documentTitle, `${file}: title`);
    assert.equal(meta(document, 'name', 'description'), description, `${file}: description`);
    assert.equal(meta(document, 'property', 'og:locale'), locale === 'ja' ? 'ja_JP' : 'en_US', `${file}: Open Graph locale`);
}

function checkRouteAlternates(
    document: DefaultTreeAdapterTypes.Document,
    file: string,
    definition: WebsiteRouteDefinition,
    locale: 'en' | 'ja',
): void {
    const expected = routeUrl(definition.route, locale);
    assert.equal(link(document, 'canonical'), expected, `${file}: canonical`);
    assert.equal(attribute(linkElement(document, 'canonical'), 'data-yomu-route-head'), '', `${file}: SPA head marker`);
    assert.equal(alternate(document, 'en'), routeUrl(definition.route, 'en'), `${file}: English alternate`);
    const japanesePublication = websiteRoutePublication(definition, 'ja');
    assert.equal(alternate(document, 'ja'), japanesePublication ? routeUrl(definition.route, 'ja') : undefined, `${file}: Japanese alternate`);
    assert.equal(alternate(document, 'x-default'), routeUrl(definition.route, 'en'), `${file}: x-default alternate`);
}

function checkLocalizedChrome(
    document: DefaultTreeAdapterTypes.Document,
    source: string,
    file: string,
    locale: 'en' | 'ja',
): void {
    const pageText = text(document);
    const expectation = LOCALIZED_CHROME_EXPECTATIONS[locale];
    assert.ok(pageText.includes(expectation.navigation), `${file}: localized navigation`);
    assert.ok(pageText.includes(expectation.footer), `${file}: localized footer`);
    assert.equal(source.includes('yomu-hud-language-toggle'), false, `${file}: retired client copy toggle`);
    assert.equal(localeMenuHref(document, expectation.localeLabel), expectation.localeHref, `${file}: safe locale switch`);
    if (locale === 'ja') checkJapaneseChrome(document, source, file);
}

function checkJapaneseChrome(
    document: DefaultTreeAdapterTypes.Document,
    source: string,
    file: string,
): void {
    checkJapaneseRouteLinks(source, file);
    assert.equal(text(elementById(document, 'main-nav-aria-label')).trim(), 'メインナビゲーション', `${file}: main navigation label`);
    assert.equal(attribute(elementByClass(document, 'VPNavBarHamburger'), 'aria-label'), 'モバイルナビゲーション', `${file}: mobile navigation label`);
    assert.equal(
        attribute(descendantElementByAttribute(elementByClass(document, 'VPNavBarExtra'), 'aria-label'), 'aria-label'),
        'メニュー',
        `${file}: extra navigation label`,
    );
}

function checkJapaneseRouteLinks(source: string, file: string): void {
    assert.ok(source.includes('href="/ja/learn/"'), `${file}: localized reviewed internal links`);
    assert.ok(source.includes('href="/privacy"'), `${file}: unreviewed Japanese links fall back to English`);
    assert.equal(source.includes('href="/ja/privacy/"'), false, `${file}: unreviewed Japanese link leaked`);
}

function renderedFile(route: string, locale: 'en' | 'ja'): string {
    const prefix = locale === 'ja' ? path.join(DIST, 'ja') : DIST;
    if (!route || route.endsWith('/')) return path.join(prefix, route, 'index.html');
    return path.join(prefix, `${route}.html`);
}

function routeUrl(route: string, locale: 'en' | 'ja'): string {
    const root = route ? `/${route}` : '/';
    const localized = locale === 'ja' ? (root === '/' ? '/ja/' : `/ja${root}`) : root;
    return new URL(localized, ORIGIN).href;
}

function htmlFiles(directory: string): string[] {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(directory, entry.name);
        return entry.isDirectory() ? htmlFiles(full) : (entry.name.endsWith('.html') ? [full] : []);
    });
}

function element(root: DefaultTreeAdapterTypes.Node, tagName: string): DefaultTreeAdapterTypes.Element {
    const found = descendants(root).find(node => 'tagName' in node && node.tagName === tagName);
    assert.ok(found && 'tagName' in found, `missing <${tagName}>`);
    return found;
}

function descendants(root: DefaultTreeAdapterTypes.Node): DefaultTreeAdapterTypes.Node[] {
    if (!('childNodes' in root)) return [];
    return root.childNodes.flatMap(child => [child, ...descendants(child)]);
}

function attribute(node: DefaultTreeAdapterTypes.Element, name: string): string | undefined {
    return node.attrs.find(item => item.name === name)?.value;
}

function meta(root: DefaultTreeAdapterTypes.Node, attributeName: string, attributeValue: string): string | undefined {
    const node = descendants(root).find(candidate =>
        'tagName' in candidate
        && candidate.tagName === 'meta'
        && attribute(candidate, attributeName) === attributeValue,
    );
    return node && 'tagName' in node ? attribute(node, 'content') : undefined;
}

function link(root: DefaultTreeAdapterTypes.Node, rel: string): string | undefined {
    const node = linkElement(root, rel);
    return attribute(node, 'href');
}

function linkElement(root: DefaultTreeAdapterTypes.Node, rel: string): DefaultTreeAdapterTypes.Element {
    const node = descendants(root).find(candidate =>
        'tagName' in candidate
        && candidate.tagName === 'link'
        && attribute(candidate, 'rel') === rel,
    );
    assert.ok(node && 'tagName' in node, `missing link[rel="${rel}"]`);
    return node;
}

function localeMenuHref(root: DefaultTreeAdapterTypes.Node, label: string): string | undefined {
    const menu = elementByClass(root, 'VPNavBarTranslations');
    const link = descendants(menu).find(candidate =>
        'tagName' in candidate
        && candidate.tagName === 'a'
        && text(candidate).trim() === label,
    );
    return link && 'tagName' in link ? attribute(link, 'href') : undefined;
}

function elementById(root: DefaultTreeAdapterTypes.Node, id: string): DefaultTreeAdapterTypes.Element {
    return descendantElementByAttribute(root, 'id', id);
}

function elementByClass(root: DefaultTreeAdapterTypes.Node, className: string): DefaultTreeAdapterTypes.Element {
    const found = descendants(root).find(candidate =>
        'tagName' in candidate
        && (attribute(candidate, 'class') ?? '').split(/\s+/u).includes(className),
    );
    assert.ok(found && 'tagName' in found, `missing .${className}`);
    return found;
}

function descendantElementByAttribute(
    root: DefaultTreeAdapterTypes.Node,
    name: string,
    value?: string,
): DefaultTreeAdapterTypes.Element {
    const found = descendants(root).find(candidate =>
        'tagName' in candidate
        && attribute(candidate, name) !== undefined
        && (value === undefined || attribute(candidate, name) === value),
    );
    assert.ok(found && 'tagName' in found, `missing [${name}${value === undefined ? '' : `="${value}"`}]`);
    return found;
}

function alternate(root: DefaultTreeAdapterTypes.Node, language: string): string | undefined {
    const node = descendants(root).find(candidate =>
        'tagName' in candidate
        && candidate.tagName === 'link'
        && attribute(candidate, 'rel') === 'alternate'
        && attribute(candidate, 'hreflang') === language,
    );
    return node && 'tagName' in node ? attribute(node, 'href') : undefined;
}

function text(node: DefaultTreeAdapterTypes.Node): string {
    if (node.nodeName === '#text') return node.value;
    if (!('childNodes' in node)) return '';
    return node.childNodes.map(text).join('');
}
