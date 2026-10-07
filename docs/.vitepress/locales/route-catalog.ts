import type { WebsiteLocaleId } from './site-locales';

export interface WebsiteRouteDefinition {
    readonly route: string;
    readonly source: string;
    readonly locales: Readonly<Record<WebsiteLocaleId, WebsiteRoutePublication | undefined>>;
    readonly blockers: Readonly<Partial<Record<WebsiteLocaleId, string>>>;
}

export interface WebsiteRoutePublication {
    readonly reviewStatus: 'source-approved' | 'native-reviewed';
    readonly title: string;
    readonly description: string;
}

/**
 * Stable, semantic route metadata for every public VitePress page. The prose
 * body catalogue has a legacy source-hash compatibility layer; route titles and
 * descriptions do not, so a copy edit cannot silently orphan SEO translation.
 */
export const WEBSITE_ROUTE_CATALOG: readonly WebsiteRouteDefinition[] = Object.freeze([
    route('', 'index.md',
        ['よむ | Read Japanese. Stay with the story.', 'よむ | 日本語を読む。物語の続きを楽しむ。'],
        ['Hover any Japanese word on a web page, a YouTube subtitle or a manga page to see its reading and meaning. Free for Chrome, Firefox, Safari and your desktop.', 'ウェブページ、YouTubeの字幕、漫画のページの日本語にカーソルを合わせるだけで、読みと意味が分かります。Chrome、Firefox、Safari、パソコンで無料で使えます。']),
    englishOnlyRoute('api/', 'api/index.md',
        'Yomu API reference',
        'Interactive OpenAPI reference for Yomu Academy, audio, support, and public edge services.',
        'api-reference-native-review-pending'),
    route('changelog', 'changelog.md',
        ['Changelog', '変更履歴'],
        ['Release history for Yomu.', 'よむのリリース履歴です。']),
    route('desktop', 'desktop.md',
        ['よむ Desktop', 'よむ Desktop'],
        ['Read the Japanese in games and apps on Windows, macOS and Linux. Press one shortcut, then hover a word. Free.', 'Windows、macOS、Linuxのゲームやアプリの日本語を読めます。ショートカットを押して、単語にカーソルを合わせるだけ。無料です。']),
    route('faq', 'faq.md',
        ['FAQ', 'よくある質問'],
        ['Short answers to the questions people ask about よむ.', 'よむについてよく聞かれる質問に、短く答えます。']),
    route('install', 'install.md',
        ['Install', 'インストール'],
        ['Add よむ to Chrome, Edge, Firefox or Safari, or download よむ Desktop. Free.', 'よむをChrome、Edge、Firefox、Safariに追加するか、よむ Desktopをダウンロードします。無料です。']),
    route('learn/', 'learn/index.md',
        ['How to learn Japanese with よむ', 'よむで日本語を身につける'],
        ['Read and watch Japanese you enjoy every day, look up what blocks you, keep a few words and review them daily. The whole method on one page.', '好きな日本語を毎日読んで観て、分からない単語だけ調べ、少しだけ保存して毎日復習する。やり方はこの1ページだけです。']),
    englishOnlyRoute('library/', 'library/index.md',
        'Read',
        'Browse free Japanese books by level and interest, or open your own PDF.',
        'library-native-review-pending'),
    route('membership', 'membership.md',
        ['Donate', '寄付'],
        ['Yomu is free. Donations help pay its running costs and do not unlock anything.', 'よむは無料です。寄付は運営費に充てられ、寄付によって使えるようになる機能はありません。']),
    englishOnlyRoute('privacy/', 'privacy/index.md',
        'Privacy',
        'What Yomu keeps on your device, which services it talks to and when, and what the browser extension asks for.',
        'privacy-native-review-pending'),
]);

const ROUTE_BY_ROUTE = new Map(WEBSITE_ROUTE_CATALOG.map(definition => [definition.route, definition]));
const ROUTE_BY_SOURCE = new Map(WEBSITE_ROUTE_CATALOG.map(definition => [definition.source, definition]));
const ROUTE_BY_KEY = new Map(WEBSITE_ROUTE_CATALOG.map(definition => [routeKey(definition.route), definition]));

export function websiteRouteDefinition(route: string): WebsiteRouteDefinition | undefined {
    return ROUTE_BY_ROUTE.get(route) ?? ROUTE_BY_KEY.get(routeKey(route));
}

export function websiteRouteForSource(source: string): WebsiteRouteDefinition | undefined {
    return ROUTE_BY_SOURCE.get(source.replace(/^ja\//, ''));
}

export function websiteRoutePublication(
    definition: WebsiteRouteDefinition,
    locale: WebsiteLocaleId,
): WebsiteRoutePublication | undefined {
    return definition.locales[locale];
}

export function publishedWebsiteRouteDefinitions(
    locale: WebsiteLocaleId,
): readonly WebsiteRouteDefinition[] {
    return WEBSITE_ROUTE_CATALOG.filter(definition => websiteRoutePublication(definition, locale));
}

export function websiteRouteIsPublished(routePath: string, locale: WebsiteLocaleId): boolean {
    const definition = websiteRouteDefinition(routePath);
    return Boolean(definition && websiteRoutePublication(definition, locale));
}

function route(
    routePath: string,
    source: string,
    title: readonly [string, string],
    description: readonly [string, string],
): WebsiteRouteDefinition {
    return Object.freeze({
        route: routePath,
        source,
        locales: Object.freeze({
            en: publication('source-approved', title[0], description[0]),
            ja: publication('native-reviewed', title[1], description[1]),
        }),
        blockers: Object.freeze({}),
    });
}

function englishOnlyRoute(
    routePath: string,
    source: string,
    title: string,
    description: string,
    reviewBlocker: string,
): WebsiteRouteDefinition {
    return Object.freeze({
        route: routePath,
        source,
        locales: Object.freeze({
            en: publication('source-approved', title, description),
            ja: undefined,
        }),
        blockers: Object.freeze({ ja: reviewBlocker }),
    });
}

function publication(
    reviewStatus: WebsiteRoutePublication['reviewStatus'],
    title: string,
    description: string,
): WebsiteRoutePublication {
    return Object.freeze({ reviewStatus, title, description });
}

function routeKey(routePath: string): string {
    return routePath.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, '');
}
