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
        ['Read Japanese web pages, subtitles, manga and PDFs with a pop-up dictionary, save the words you meet, and review them with the sentences where you found them.', 'ポップアップ辞書で日本語のウェブページ、字幕、漫画、PDFを読み、出会った単語を見つけた文と一緒に保存して復習できます。']),
    englishOnlyRoute('api/', 'api/index.md',
        'Yomu API reference',
        'Interactive OpenAPI reference for Yomu Academy, audio, support, and public edge services.',
        'api-reference-native-review-pending'),
    route('changelog', 'changelog.md',
        ['Changelog', '変更履歴'],
        ['Release history for Yomu.', 'よむのリリース履歴です。']),
    route('desktop', 'desktop.md',
        ['Desktop app', 'デスクトップアプリ'],
        ['Read Japanese anywhere on your computer, in games, apps and videos, with the free よむ desktop app for Windows, macOS and Linux.', '無料のよむデスクトップアプリで、ゲーム、アプリ、動画など、パソコンの画面上のどこでも日本語を読めます。Windows、macOS、Linuxに対応しています。']),
    route('faq', 'faq.md',
        ['FAQ', 'よくある質問'],
        ['What Yomu is, what it costs, how reviews work, which apps it supports, and where your data lives, in plain answers.', 'よむとは何か、費用、復習の仕組み、対応するアプリ、データの保存場所を分かりやすく答えます。']),
    route('learn/', 'learn/index.md',
        ['Start here', 'ここから始める'],
        ['Install よむ, press your first Japanese word, and learn the small daily routine the rest of this guide builds on.', 'よむをインストールして最初の日本語の単語を押し、このガイド全体の土台になる小さな毎日の習慣を覚えます。']),
    route('learn/keeping-words', 'learn/keeping-words.md',
        ['Save and review', '保存と復習'],
        ['Save words with the sentence where you found them, review them in Study, and keep going when reviews pile up.', '見つけた文と一緒に単語を保存し、Studyで復習し、復習がたまっても続けられるようにします。']),
    route('learn/manga-and-games', 'learn/manga-and-games.md',
        ['Manga and games', '漫画とゲーム'],
        ['Read Japanese trapped inside manga panels, screenshots and game frames with OCR, and choose which service sees your page images.', 'OCRで漫画のコマ、スクリーンショット、ゲーム画面の中にある日本語を読み、ページ画像を見せるサービスを自分で選べます。']),
    route('learn/reading', 'learn/reading.md',
        ['Reading', '読む'],
        ['Use tadoku, popup lookup, furigana, PDFs and kanji drilldown to read Japanese for the story instead of stopping at every word.', '多読、ポップアップ検索、ふりがな、PDF、漢字の掘り下げを使い、すべての単語で止まらず物語のために日本語を読みます。']),
    route('learn/watching', 'learn/watching.md',
        ['Watching', '観る'],
        ['Learn from Japanese video with lookup-ready subtitles, a transcript, shadowing, batch mining and a YouTube feed tuned toward useful input.', '検索できる字幕、文字起こし、シャドーイング、一括採集、役立つインプットへ調整したYouTubeフィードで、日本語動画から学びます。']),
    route('learn/your-own-setup', 'learn/your-own-setup.md',
        ['Optional setup', '追加の設定'],
        ['Add dictionaries and audio, connect Anki, Jiten, Bunpro, JPDB or WaniKani, and sync devices, only if you want to.', '必要なときだけ、辞書や音声を追加し、Anki、Jiten、Bunpro、JPDB、WaniKaniを接続し、端末を同期します。']),
    englishOnlyRoute('local-audio', 'local-audio.md',
        'Local Audio',
        'Hear Japanese words read aloud in Yomu. Hosted audio is on by default; add your own source or play pronunciation files from your own computer if you want more.',
        'local-audio-native-review-pending'),
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
    englishOnlyRoute('reference/settings', 'reference/settings.md',
        'Settings reference',
        'Every Yomu setting, its default, and the part of the settings dialog that holds it.',
        'generated-settings-native-review-pending'),
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
