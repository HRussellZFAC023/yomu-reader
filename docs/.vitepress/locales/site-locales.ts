import { INTERFACE_LOCALES, type InterfaceLocale } from '../../../src/reader/locales';
import { websiteRouteIsPublished } from './route-catalog';

export type WebsiteLocaleId = 'en' | 'ja';
export type WebsiteMessageId = keyof typeof WEBSITE_MESSAGES;
export type WebsiteLocaleReviewStatus = 'source-approved' | 'native-reviewed' | 'unavailable';

export interface WebsiteLocalePublication {
    readonly id: string;
    readonly tag: string;
    readonly label: string;
    readonly englishName: string;
    readonly direction: InterfaceLocale['direction'];
    readonly fontStack: string;
    readonly routePrefix: string;
    readonly reviewStatus: WebsiteLocaleReviewStatus;
    readonly available: boolean;
    readonly blockers: readonly string[];
}

export interface WebsiteNavigationItem {
    readonly text?: string;
    readonly link?: string;
    readonly items?: readonly WebsiteNavigationItem[];
    readonly [key: string]: unknown;
}

export const PUBLISHED_WEBSITE_ROUTES = Object.freeze([
    '',
    'api/',
    'changelog',
    'faq',
    'learn/',
    'learn/approach',
    'learn/building-a-core',
    'learn/keeping-words',
    'learn/manga-and-games',
    'learn/reading',
    'learn/reference',
    'learn/staying-with-it',
    'learn/watching',
    'learn/week-one',
    'learn/your-own-setup',
    'local-audio',
    'membership',
    'privacy/',
    'reference/grammar',
    'reference/settings',
    'support',
] as const);

/**
 * Human review is a publication gate, not a fallback preference.
 *
 * The shared interface manifest supplies all 33 locale identities, scripts,
 * directions, fonts, and interface-review blockers. This website-specific
 * ledger is deliberately smaller: only source-approved English and the
 * existing owner-reviewed Japanese prose may create public routes. A machine
 * draft cannot publish by adding a VitePress locale or a directory alone.
 */
const REVIEWED_WEBSITE_LOCALES: Readonly<Record<WebsiteLocaleId, {
    readonly reviewStatus: Exclude<WebsiteLocaleReviewStatus, 'unavailable'>;
    readonly routePrefix: string;
}>> = Object.freeze({
    en: { reviewStatus: 'source-approved', routePrefix: '' },
    ja: { reviewStatus: 'native-reviewed', routePrefix: '/ja' },
});

export const WEBSITE_LOCALE_MANIFEST: readonly WebsiteLocalePublication[] = Object.freeze(
    INTERFACE_LOCALES.map(interfaceLocale => websiteLocalePublication(interfaceLocale)),
);

const WEBSITE_LOCALE_BY_ID = new Map(
    WEBSITE_LOCALE_MANIFEST.flatMap(locale => [[locale.id, locale], [locale.tag, locale]] as const),
);

export function publishedWebsiteLocales(): readonly WebsiteLocalePublication[] {
    return WEBSITE_LOCALE_MANIFEST.filter(locale => locale.available);
}

export function unavailableWebsiteLocales(): readonly WebsiteLocalePublication[] {
    return WEBSITE_LOCALE_MANIFEST.filter(locale => !locale.available);
}

export function websiteLocale(id: string): WebsiteLocalePublication | undefined {
    return WEBSITE_LOCALE_BY_ID.get(id);
}

export function websiteLocaleForRelativePath(relativePath: string): WebsiteLocaleId {
    return relativePath === 'ja' || relativePath.startsWith('ja/') ? 'ja' : 'en';
}

export function websiteLocaleForPathname(pathname: string): WebsiteLocaleId {
    return pathname === '/ja' || pathname.startsWith('/ja/') ? 'ja' : 'en';
}

export function websiteMessage(id: WebsiteMessageId, locale: WebsiteLocaleId): string {
    return WEBSITE_MESSAGES[id][locale];
}

export function websiteNavigationLabel(text: string, locale: WebsiteLocaleId): string {
    return websiteNavigationText(text, locale);
}

export function localizeWebsiteNavigation<T extends WebsiteNavigationItem>(
    items: readonly T[],
    locale: WebsiteLocaleId,
): T[] {
    return items.map(item => localizeWebsiteNavigationItem(item, locale));
}

export function localizedWebsiteHref(href: string, locale: WebsiteLocaleId): string {
    if (locale === 'en') return href;
    if (!isRootRelativeWebsiteHref(href)) return href;
    return localizedRootRelativeHref(href, locale);
}

export function localizedWebsiteRoute(route: string, locale: WebsiteLocaleId): string {
    if (locale === 'en') return rootRoute(route);
    if (!websiteRouteIsPublished(route, locale)) {
        throw new Error(`Website route ${rootRoute(route)} is not reviewed for ${locale}`);
    }
    const rooted = rootRoute(route);
    return rooted === '/' ? '/ja/' : `/ja${rooted}`;
}

export function rootWebsiteRoute(relativePath: string): string {
    const withoutLocale = relativePath.replace(/^ja\//, '');
    return rootRoute(withoutLocale
        .replace(/(^|\/)index\.md$/, '$1')
        .replace(/\.md$/, ''));
}

function websiteLocalePublication(interfaceLocale: InterfaceLocale): WebsiteLocalePublication {
    const reviewed = reviewedWebsiteLocale(interfaceLocale);
    if (!reviewed) return unavailableWebsiteLocalePublication(interfaceLocale, 'website-native-review-pending');
    if (!interfaceLocale.available) return unavailableWebsiteLocalePublication(interfaceLocale, 'interface-locale-unavailable');
    return Object.freeze({
        id: interfaceLocale.id,
        tag: interfaceLocale.tag,
        label: interfaceLocale.nativeName,
        englishName: interfaceLocale.englishName,
        direction: interfaceLocale.direction,
        fontStack: interfaceLocale.fontStack,
        routePrefix: reviewed.routePrefix,
        reviewStatus: reviewed.reviewStatus,
        available: true,
        blockers: Object.freeze([]),
    });
}

function reviewedWebsiteLocale(interfaceLocale: InterfaceLocale) {
    if (interfaceLocale.id !== 'en' && interfaceLocale.id !== 'ja') return undefined;
    return REVIEWED_WEBSITE_LOCALES[interfaceLocale.id];
}

function unavailableWebsiteLocalePublication(
    interfaceLocale: InterfaceLocale,
    blocker: string,
): WebsiteLocalePublication {
    return Object.freeze({
        id: interfaceLocale.id,
        tag: interfaceLocale.tag,
        label: interfaceLocale.nativeName,
        englishName: interfaceLocale.englishName,
        direction: interfaceLocale.direction,
        fontStack: interfaceLocale.fontStack,
        routePrefix: '',
        reviewStatus: 'unavailable',
        available: false,
        blockers: Object.freeze([blocker, ...interfaceLocale.blockers]),
    });
}

function localizeWebsiteNavigationItem<T extends WebsiteNavigationItem>(
    item: T,
    locale: WebsiteLocaleId,
): T {
    const localized: Record<string, unknown> = { ...item };
    if (item.text) localized.text = websiteNavigationText(item.text, locale);
    if (item.link) localized.link = localizedWebsiteHref(item.link, locale);
    if (item.items) localized.items = localizeWebsiteNavigation(item.items, locale);
    return localized as T;
}

function websiteNavigationText(text: string, locale: WebsiteLocaleId): string {
    const id = NAVIGATION_MESSAGE_ID_BY_ENGLISH[text];
    return id ? websiteMessage(id, locale) : text;
}

function rootRoute(route: string): string {
    if (!route || route === '/') return '/';
    return `/${route.replace(/^\/+/, '')}`;
}

function isRootRelativeWebsiteHref(href: string): boolean {
    if (!href.startsWith('/')) return false;
    return !href.startsWith('//');
}

function localizedRootRelativeHref(href: string, locale: WebsiteLocaleId): string {
    const url = new URL(href, 'https://yomu.invalid');
    if (url.pathname === '/ja' || url.pathname.startsWith('/ja/')) return href;
    if (!websiteRouteIsPublished(url.pathname, locale)) return href;
    url.pathname = localizedWebsitePath(url.pathname);
    return `${url.pathname}${url.search}${url.hash}`;
}

function localizedWebsitePath(pathname: string): string {
    if (pathname === '/') return '/ja/';
    return `/ja${pathname}`;
}

const WEBSITE_MESSAGES = Object.freeze({
    'docs.site.title': { en: 'よむ - Japanese popup reader', ja: 'よむ - 日本語ポップアップリーダー' },
    'docs.site.description': {
        en: 'Yomu helps you read real Japanese in the browser. Look up words on web pages, manga, game text, PDFs, and subtitles, save useful sentences, connect your SRS, prefer Japanese site versions, and filter YouTube for Japanese content.',
        ja: 'よむは、ブラウザーで本物の日本語を読むためのツールです。ウェブページ、漫画、ゲーム、PDF、字幕の単語を調べ、役立つ文を保存し、SRSにつなげ、日本語版サイトや日本語のYouTube動画を見つけられます。',
    },
    'docs.site.logoAlt': { en: 'よむ app icon', ja: 'よむのアプリアイコン' },
    'docs.site.imageAlt': {
        en: 'よむ app icon and Japanese reader preview card',
        ja: 'よむのアプリアイコンと日本語リーダーのプレビューカード',
    },
    'docs.nav.learningPath': { en: 'Learning path', ja: '学習の道筋' },
    'docs.nav.apps': { en: 'Apps', ja: 'アプリ' },
    'docs.nav.study': { en: 'Study', ja: '学習' },
    'docs.nav.academy': { en: 'Academy', ja: 'アカデミー' },
    'docs.nav.help': { en: 'Help', ja: 'ヘルプ' },
    'docs.nav.membership': { en: 'Membership', ja: 'メンバーシップ' },
    'docs.nav.more': { en: 'More', ja: 'その他' },
    'docs.nav.videoPlayer': { en: 'Video Player', ja: '動画プレイヤー' },
    'docs.nav.pdfReader': { en: 'PDF Reader', ja: 'PDFリーダー' },
    'docs.nav.stats': { en: 'Stats', ja: '統計' },
    'docs.nav.api': { en: 'API', ja: 'API' },
    'docs.nav.localAudio': { en: 'Local Audio', ja: 'ローカル音声' },
    'docs.nav.settingsReference': { en: 'Settings reference', ja: '設定リファレンス' },
    'docs.nav.faq': { en: 'FAQ', ja: 'よくある質問' },
    'docs.nav.changelog': { en: 'Changelog', ja: '変更履歴' },
    'docs.nav.privacy': { en: 'Privacy', ja: 'プライバシー' },
    'docs.sidebar.learnJapanese': { en: 'Learn Japanese', ja: '日本語を学ぶ' },
    'docs.sidebar.start': { en: '0. Start here', ja: '0. ここから始める' },
    'docs.sidebar.approach': { en: '1. The approach', ja: '1. 学び方' },
    'docs.sidebar.weekOne': { en: '2. Week one', ja: '2. 最初の一週間' },
    'docs.sidebar.core': { en: '3. Building a core', ja: '3. 基礎語彙を作る' },
    'docs.sidebar.reading': { en: '4. Reading', ja: '4. 読む' },
    'docs.sidebar.watching': { en: '5. Watching', ja: '5. 観る' },
    'docs.sidebar.mangaGames': { en: '6. Manga and games', ja: '6. 漫画とゲーム' },
    'docs.sidebar.keepingWords': { en: '7. Keeping words', ja: '7. 単語を残す' },
    'docs.sidebar.staying': { en: '8. Staying with it', ja: '8. 続ける' },
    'docs.sidebar.setup': { en: '9. Your own setup', ja: '9. 自分の環境' },
    'docs.sidebar.reference': { en: '10. Reference', ja: '10. 参考資料' },
    'docs.sidebar.appsOverview': { en: 'Apps overview', ja: 'アプリ一覧' },
    'docs.sidebar.yomuGaming': { en: 'Yomu Gaming', ja: 'Yomu Gaming' },
    'docs.sidebar.referenceHelp': { en: 'Reference and help', ja: '参考資料とヘルプ' },
    'docs.sidebar.homepage': { en: 'Homepage', ja: 'ホームページ' },
    'docs.sidebar.grammar': { en: 'Grammar coverage', ja: '文法対応状況' },
    'docs.nav.support': { en: 'Support', ja: 'サポート' },
    'docs.footer.message': {
        en: 'Free and open source. Install as a userscript, or as a Chrome or Firefox extension.',
        ja: '無料のオープンソースです。ユーザースクリプト、Chrome拡張機能、Firefox拡張機能としてインストールできます。',
    },
    'docs.footer.copyright': { en: 'Released under the MIT license.', ja: 'MITライセンスで公開しています。' },
    'docs.theme.menu': { en: 'Menu', ja: 'メニュー' },
    'docs.theme.languageMenu': { en: 'Change language', ja: '言語を変更' },
    'docs.theme.sidebarMenu': { en: 'Menu', ja: 'メニュー' },
    'docs.theme.returnTop': { en: 'Return to top', ja: 'ページ上部へ戻る' },
    'docs.theme.outline': { en: 'On this page', ja: 'このページの内容' },
    'docs.theme.lastUpdated': { en: 'Last updated', ja: '最終更新' },
    'docs.theme.darkMode': { en: 'Appearance', ja: '外観' },
    'docs.theme.lightMode': { en: 'Switch to light theme', ja: 'ライトテーマに切り替え' },
    'docs.theme.darkTheme': { en: 'Switch to dark theme', ja: 'ダークテーマに切り替え' },
    'docs.theme.previous': { en: 'Previous page', ja: '前のページ' },
    'docs.theme.next': { en: 'Next page', ja: '次のページ' },
    'docs.theme.skip': { en: 'Skip to content', ja: '本文へスキップ' },
    'docs.search.open': { en: 'Search', ja: '検索' },
    'docs.search.openLabel': { en: 'Search documentation', ja: 'ドキュメントを検索' },
    'docs.search.displayDetails': { en: 'Display detailed list', ja: '詳細な一覧を表示' },
    'docs.search.reset': { en: 'Reset search', ja: '検索をリセット' },
    'docs.search.back': { en: 'Close search', ja: '検索を閉じる' },
    'docs.search.noResults': { en: 'No results found', ja: '検索結果がありません' },
    'docs.search.select': { en: 'to select', ja: 'で選択' },
    'docs.search.navigate': { en: 'to navigate', ja: 'で移動' },
    'docs.search.close': { en: 'to close', ja: 'で閉じる' },
    'docs.media.youtubeVideo': { en: 'YouTube video', ja: 'YouTube動画' },
} satisfies Record<`docs.${string}`, Readonly<Record<WebsiteLocaleId, string>>>);

const NAVIGATION_MESSAGE_ID_BY_ENGLISH: Readonly<Record<string, WebsiteMessageId>> = Object.freeze(
    Object.fromEntries(
        Object.entries(WEBSITE_MESSAGES)
            .filter(([id]) => id.startsWith('docs.nav.') || id.startsWith('docs.sidebar.'))
            .map(([id, copy]) => [copy.en, id]),
    ) as Record<string, WebsiteMessageId>,
);
