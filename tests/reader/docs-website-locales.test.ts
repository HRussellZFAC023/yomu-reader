import { describe, expect, it } from 'vitest';
import {
    WEBSITE_ROUTE_CATALOG,
    publishedWebsiteRouteDefinitions,
    websiteRouteDefinition,
    websiteRoutePublication,
} from '../../docs/.vitepress/locales/route-catalog';
import {
    PUBLISHED_WEBSITE_ROUTES,
    WEBSITE_LOCALE_MANIFEST,
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

describe('reviewed website locale contract', () => {
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
        expect(publishedWebsiteRouteDefinitions('en')).toHaveLength(21);
        expect(publishedWebsiteRouteDefinitions('ja')).toHaveLength(17);

        const japaneseBlockers = WEBSITE_ROUTE_CATALOG
            .filter(definition => !websiteRoutePublication(definition, 'ja'))
            .map(definition => [definition.route, definition.blockers.ja]);
        expect(japaneseBlockers).toEqual([
            ['api/', 'api-reference-native-review-pending'],
            ['local-audio', 'local-audio-native-review-pending'],
            ['privacy/', 'privacy-native-review-pending'],
            ['reference/settings', 'generated-settings-native-review-pending'],
        ]);
    });

    it('localizes only links whose destination body is reviewed', () => {
        expect(localizedWebsiteHref('/learn/reading#lookup', 'ja')).toBe('/ja/learn/reading#lookup');
        expect(localizedWebsiteHref('/privacy/', 'ja')).toBe('/privacy/');
        expect(localizedWebsiteHref('/reference/settings?from=menu', 'ja')).toBe('/reference/settings?from=menu');
        expect(localizedWebsiteHref('/study/', 'ja')).toBe('/study/');
        expect(localizedWebsiteHref('https://example.com/', 'ja')).toBe('https://example.com/');
        expect(() => localizedWebsiteRoute('/privacy/', 'ja')).toThrow(/not reviewed/u);
    });

    it('uses stable semantic messages and route publications', () => {
        expect(websiteMessage('docs.nav.learningPath', 'ja')).toBe('学習の道筋');
        expect(websiteLocaleForPathname('/ja/learn/reading')).toBe('ja');
        expect(websiteLocaleForPathname('/learn/reading')).toBe('en');
        const reading = websiteRouteDefinition('/learn/reading');
        expect(reading && websiteRoutePublication(reading, 'ja')).toMatchObject({
            reviewStatus: 'native-reviewed',
            title: '読む',
        });
        expect(REVIEWED_DOCS_MESSAGES.length).toBeGreaterThan(3_000);
        expect(new Set(REVIEWED_DOCS_MESSAGES.map(message => message.id)).size)
            .toBe(REVIEWED_DOCS_MESSAGES.length);
        expect(hasReviewedDocsText('  Reading  ')).toBe(true);
    });

    it('localizes HTML content and route-aware links before rendering', () => {
        const localized = localizeHtmlFragment(
            '<a href="/learn/reading" aria-label="Reading">Reading</a><a href="/privacy/">Privacy</a>',
            'ja',
        );
        expect(localized).toContain('href="/ja/learn/reading"');
        expect(localized).toContain('aria-label="読む"');
        expect(localized).toContain('>読む</a>');
        expect(localized).toContain('href="/privacy/"');

        const tokens = [{
            type: 'inline',
            content: '',
            children: [{
                type: 'text',
                content: 'Reading',
                attrs: [['title', 'Reading'], ['href', '/learn/reading']] as [string, string][],
            }],
        }];
        localizeMarkdownTokens(tokens, 'ja');
        expect(tokens[0].children[0]).toMatchObject({
            content: '読む',
            attrs: [['title', '読む'], ['href', '/ja/learn/reading']],
        });
    });
});
