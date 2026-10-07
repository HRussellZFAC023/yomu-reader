import { afterEach, describe, expect, it } from 'vitest';
import {
    WEBSITE_ROUTE_CATALOG,
    publishedWebsiteRouteDefinitions,
    websiteRouteDefinition,
    websiteRoutePublication,
} from '../../docs/.vitepress/locales/route-catalog';
import {
    PUBLISHED_WEBSITE_ROUTES,
    WEBSITE_LOCALE_MANIFEST,
    correspondingWebsiteLocaleHref,
    localizedWebsiteHref,
    localizedWebsiteRoute,
    publishedWebsiteLocales,
    unavailableWebsiteLocales,
    websiteLocale,
    websiteLocaleForPathname,
    websiteMessage,
} from '../../docs/.vitepress/locales/site-locales';
import {
    REVIEWED_DOCS_MESSAGES,
    hasReviewedDocsText,
} from '../../docs/.vitepress/locales/docs-prose-catalog';
import {
    localizeHtmlFragment,
    localizeMarkdownTokens,
} from '../../docs/.vitepress/locales/markdown-localization';
import { syncWebsiteRouteLocalization } from '../../docs/.vitepress/theme/website-route-localization';

describe('reviewed website locale contract', () => {
    afterEach(() => {
        document.head.replaceChildren();
        document.body.replaceChildren();
        document.documentElement.lang = 'en';
        document.documentElement.dir = 'ltr';
        window.history.replaceState({}, '', '/');
    });

    it('publishes only reviewed English and Japanese locale identities', () => {
        expect(WEBSITE_LOCALE_MANIFEST).toHaveLength(33);
        expect(publishedWebsiteLocales().map(locale => locale.id)).toEqual(['en', 'ja']);
        expect(unavailableWebsiteLocales()).toHaveLength(31);
        expect(unavailableWebsiteLocales().every(locale => (
            locale.reviewStatus === 'unavailable'
            && locale.blockers.includes('website-native-review-pending')
        ))).toBe(true);
    });

    it('retains direction and font metadata for unavailable RTL locales', () => {
        expect(websiteLocale('ar')).toMatchObject({ available: false, direction: 'rtl' });
        expect(websiteLocale('fa')).toMatchObject({ available: false, direction: 'rtl' });
        expect(websiteLocale('ar')?.fontStack).toContain('Noto Naskh Arabic');
    });

    it('publishes every English route but only body-reviewed Japanese routes', () => {
        expect(WEBSITE_ROUTE_CATALOG.map(definition => definition.route)).toEqual(PUBLISHED_WEBSITE_ROUTES);
        expect(publishedWebsiteRouteDefinitions('en')).toHaveLength(11);
        expect(publishedWebsiteRouteDefinitions('ja')).toHaveLength(9);

        const japaneseBlockers = WEBSITE_ROUTE_CATALOG
            .filter(definition => !websiteRoutePublication(definition, 'ja'))
            .map(definition => [definition.route, definition.blockers.ja]);
        expect(japaneseBlockers).toEqual([
            ['api/', 'api-reference-native-review-pending'],
            ['library/', 'library-native-review-pending'],
        ]);
    });

    it('localizes only links whose destination body is reviewed', () => {
        expect(localizedWebsiteHref('/faq#manga', 'ja')).toBe('/ja/faq#manga');
        expect(localizedWebsiteHref('/library/', 'ja')).toBe('/library/');
        expect(localizedWebsiteHref('/api/?from=menu', 'ja')).toBe('/api/?from=menu');
        expect(localizedWebsiteHref('/study/', 'ja')).toBe('/study/');
        expect(localizedWebsiteHref('https://example.com/', 'ja')).toBe('https://example.com/');
        expect(() => localizedWebsiteRoute('/library/', 'ja')).toThrow(/not reviewed/u);
        expect(correspondingWebsiteLocaleHref('/faq', 'ja')).toBe('/ja/faq');
        expect(correspondingWebsiteLocaleHref('/library/', 'ja')).toBe('/ja/');
        expect(correspondingWebsiteLocaleHref('/ja/faq', 'en')).toBe('/faq');
    });

    it('reconciles SPA locale links, route metadata, and hardcoded theme labels', () => {
        window.history.replaceState({}, '', '/ja/faq');
        document.head.innerHTML = '<link rel="canonical" href="https://yomureader.com/faq" data-yomu-route-head>';
        document.body.innerHTML = `
            <nav class="VPNavBarMenu" aria-labelledby="main-nav-aria-label">
                <span id="main-nav-aria-label">Main Navigation</span>
            </nav>
            <div class="VPNavBarTranslations"><a href="/">English</a></div>
            <div class="VPNavBarExtra"><button aria-label="extra navigation"></button></div>
            <button class="VPNavBarHamburger" aria-label="mobile navigation"></button>
        `;
        syncWebsiteRouteLocalization([
            ['link', {
                rel: 'canonical',
                href: 'https://yomureader.com/ja/faq',
                'data-yomu-route-head': '',
            }],
            ['meta', {
                property: 'og:locale',
                content: 'ja_JP',
                'data-yomu-route-head': '',
            }],
            ['script', {
                type: 'application/ld+json',
                'data-yomu-route-head': '',
            }, '{"inLanguage":"ja"}'],
        ]);

        expect(document.querySelector('.VPNavBarTranslations a')?.getAttribute('href'))
            .toBe('/faq');
        expect(document.documentElement.lang).toBe('ja');
        expect(document.documentElement.dir).toBe('ltr');
        expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href'))
            .toBe('https://yomureader.com/ja/faq');
        expect(document.querySelector('meta[property="og:locale"]')?.getAttribute('content')).toBe('ja_JP');
        expect(document.querySelector('script[type="application/ld+json"]')?.textContent)
            .toBe('{"inLanguage":"ja"}');
        expect(document.head.querySelectorAll('[data-yomu-route-head]')).toHaveLength(3);
        expect(document.getElementById('main-nav-aria-label')?.textContent).toBe('メインナビゲーション');
        expect(document.querySelector('.VPNavBarExtra > button')?.getAttribute('aria-label'))
            .toBe('メニュー');
        expect(document.querySelector('.VPNavBarHamburger')?.getAttribute('aria-label'))
            .toBe('モバイルナビゲーション');
    });

    it('keeps client locale navigation away from an unpublished corresponding route', () => {
        window.history.replaceState({}, '', '/library/');
        document.body.innerHTML = `
            <div class="VPNavBarTranslations">
                <a href="/ja/library/">日本語</a>
            </div>
        `;

        syncWebsiteRouteLocalization(undefined);

        expect(document.querySelector('.VPNavBarTranslations a')?.getAttribute('href')).toBe('/ja/');
    });

    it('leaves locale choices to browser document navigation instead of the VitePress router', () => {
        window.history.replaceState({}, '', '/faq');
        document.body.innerHTML = `
            <div class="VPNavBarTranslations">
                <a href="/ja/faq"><span>日本語</span></a>
            </div>
        `;
        syncWebsiteRouteLocalization(undefined);
        const link = document.querySelector<HTMLAnchorElement>('.VPNavBarTranslations a');
        expect(link?.getAttribute('href')).toBe('/ja/faq');
        expect(link?.getAttribute('target')).toBe('_self');
    });

    it('uses stable semantic messages and route publications', () => {
        expect(websiteMessage('docs.nav.learningPath', 'ja')).toBe('ガイド');
        expect(websiteLocaleForPathname('/ja/faq')).toBe('ja');
        expect(websiteLocaleForPathname('/faq')).toBe('en');
        const faq = websiteRouteDefinition('/faq');
        expect(faq && websiteRoutePublication(faq, 'ja')).toMatchObject({
            reviewStatus: 'native-reviewed',
            title: 'よくある質問',
        });
        expect(REVIEWED_DOCS_MESSAGES.length).toBeGreaterThan(1_000);
        expect(new Set(REVIEWED_DOCS_MESSAGES.map(message => message.id)).size)
            .toBe(REVIEWED_DOCS_MESSAGES.length);
        expect(hasReviewedDocsText('  Reading  ')).toBe(true);
    });

    it('localizes HTML content and route-aware links before rendering', () => {
        const localized = localizeHtmlFragment(
            '<a href="/faq" aria-label="Reading">Reading</a><a href="/library/">Read</a>',
            'ja',
        );
        expect(localized).toContain('href="/ja/faq"');
        expect(localized).toContain('aria-label="読む"');
        expect(localized).toContain('>読む</a>');
        expect(localized).toContain('href="/library/"');

        const tokens = [{
            type: 'inline',
            content: '',
            children: [{
                type: 'text',
                content: 'Reading',
                attrs: [['title', 'Reading'], ['href', '/faq']] as [string, string][],
            }],
        }];
        localizeMarkdownTokens(tokens, 'ja');
        expect(tokens[0].children[0]).toMatchObject({
            content: '読む',
            attrs: [['title', '読む'], ['href', '/ja/faq']],
        });
    });
});
