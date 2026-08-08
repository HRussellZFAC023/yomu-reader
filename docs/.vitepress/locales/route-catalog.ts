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
        ['よむ — A complete system for learning 日本語', 'よむ — 日本語学習のための一式'],
        ['Read Japanese web pages, subtitles, manga and PDFs, save the words you meet, and review them with their original context. Free on computers, phones and tablets.', '日本語のウェブページ、字幕、漫画、PDFを読み、出会った単語を元の文脈と一緒に保存して復習できます。パソコン、スマートフォン、タブレットで無料で使えます。']),
    englishOnlyRoute('api/', 'api/index.md',
        'Yomu API reference',
        'Interactive OpenAPI reference for Yomu Academy, audio, support, and public edge services.',
        'api-reference-native-review-pending'),
    route('changelog', 'changelog.md',
        ['Changelog', '変更履歴'],
        ['Release history for Yomu.', 'よむのリリース履歴です。']),
    route('faq', 'faq.md',
        ['FAQ', 'よくある質問'],
        ['What Yomu is, what it costs, how reviews work, which languages and apps it supports, and where your data lives, in plain answers.', 'よむとは何か、費用、復習の仕組み、対応する言語とアプリ、データの保存場所を分かりやすく答えます。']),
    route('learn/', 'learn/index.md',
        ['Start here', 'ここから始める'],
        ['An honest starting point for learning Japanese with Yomu, covering how long it takes, what to do each day, what runs without an install, and what Yomu leaves up to you.', 'よむで日本語を学び始めるための率直な案内です。必要な時間、毎日すること、インストールなしで使えるもの、そして自分で決めることを説明します。']),
    route('learn/approach', 'learn/approach.md',
        ['The approach', '学び方'],
        ['Why comprehensible input, frequent reading and a small amount of review work together when you are learning Japanese.', '理解できるインプット、頻繁な読書、少量の復習が、日本語学習でどう一緒に働くかを説明します。']),
    route('learn/building-a-core', 'learn/building-a-core.md',
        ['Building a core', '基礎語彙を作る'],
        ['Build a useful base of frequent Japanese words without mistaking a vocabulary count for reading ability.', '語彙数を読解力と取り違えず、頻出する日本語の役立つ土台を作ります。']),
    route('learn/keeping-words', 'learn/keeping-words.md',
        ['Keeping words', '単語を残す'],
        ['Save words with their original context, review them through active recall, and use Yomu Study with local or connected sources.', '単語を元の文脈と一緒に保存し、能動的に思い出して復習し、端末内または接続した出典とよむStudyを使います。']),
    route('learn/manga-and-games', 'learn/manga-and-games.md',
        ['Manga and games', '漫画とゲーム'],
        ['Read Japanese trapped inside manga panels, screenshots and game frames with OCR, while keeping image requests explicit.', '画像の読み取りを明示的な操作に保ちながら、OCRで漫画のコマ、スクリーンショット、ゲーム画面の中にある日本語を読みます。']),
    route('learn/reading', 'learn/reading.md',
        ['Reading', '読む'],
        ['Use tadoku, popup lookup, furigana, PDFs and kanji drilldown to read Japanese for the story instead of stopping at every word.', '多読、ポップアップ検索、ふりがな、PDF、漢字の掘り下げを使い、すべての単語で止まらず物語のために日本語を読みます。']),
    route('learn/reference', 'learn/reference.md',
        ['Reference', 'リファレンス'],
        ['Find every Yomu setting, feature, app, policy and troubleshooting page after you have learned the main reading and study loop.', '読むことと復習の基本的な流れを覚えた後に、よむの全設定、機能、アプリ、方針、問題解決ページを探せます。']),
    route('learn/staying-with-it', 'learn/staying-with-it.md',
        ['Staying with it', '続ける'],
        ['Return after a break, handle a large review backlog, and use streaks as a record of effort instead of a punishment.', '中断後に戻り、多い復習残を扱い、連続記録を罰ではなく努力の記録として使います。']),
    route('learn/watching', 'learn/watching.md',
        ['Watching', '観る'],
        ['Learn from Japanese video with lookup-ready subtitles, a transcript, shadowing, batch mining and a YouTube feed tuned toward useful input.', '検索できる字幕、文字起こし、シャドーイング、一括採集、役立つインプットへ調整したYouTubeフィードで、日本語動画から学びます。']),
    route('learn/week-one', 'learn/week-one.md',
        ['Week one', '最初の一週間'],
        ['Learn kana, install Yomu, look up a first word, leave furigana on, and begin with Japanese you can nearly follow.', '仮名を覚え、よむを入れ、最初の単語を調べ、ふりがなを表示したまま、ほとんど分かる日本語から始めます。']),
    route('learn/your-own-setup', 'learn/your-own-setup.md',
        ['Your own setup', '自分の環境'],
        ['Connect dictionaries, audio, Anki, Jiten, Bunpro, JPDB and WaniKani, sync devices, and see which planned integrations are still in development.', '辞書、音声、Anki、Jiten、Bunpro、JPDB、WaniKaniを接続し、端末を同期し、予定されている連携のうち開発中のものを確認します。']),
    englishOnlyRoute('local-audio', 'local-audio.md',
        'Local Audio',
        'Hear Japanese words read aloud in Yomu. Hosted audio is on by default; add your own source or play pronunciation files from your own computer if you want more.',
        'local-audio-native-review-pending'),
    route('membership', 'membership.md',
        ['Membership', 'メンバーシップ'],
        ['Yomu is free and stays free. Chip in toward its small monthly bill through a verified support provider.', 'よむは無料で、これからも無料です。確認済みの支援サービスから、少額の月間運営費を支援できます。']),
    englishOnlyRoute('privacy/', 'privacy/index.md',
        'Privacy',
        'What Yomu keeps on your device, which services it talks to and when, and what the browser extension asks for.',
        'privacy-native-review-pending'),
    route('reference/grammar', 'reference/grammar.md',
        ['Grammar coverage', '文法対応状況'],
        ['See which learning targets have local grammar detection and which open a checked grammar reference.', '学習対象ごとの端末内文法検出の有無と、確認済み文法リファレンスへのリンクを確認できます。']),
    englishOnlyRoute('reference/settings', 'reference/settings.md',
        'Settings reference',
        'Every Yomu setting, its default, and the part of the settings dialog that holds it.',
        'generated-settings-native-review-pending'),
    route('support', 'support.md',
        ['Support', 'サポート'],
        ['Get help with Yomu, ask on Discord, report a bug, or open the apps used for reading and study.', 'よむのヘルプを探し、Discordで質問し、バグを報告し、読書と復習に使うアプリを開けます。']),
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
