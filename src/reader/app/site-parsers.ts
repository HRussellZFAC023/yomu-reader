import {
    collectFragmentTextTargetsIn,
    collectVisibleTextTargets,
    type FragmentTextTarget,
    type ScanTextTarget,
} from '../dom/index';
import { isYomuHostedPassivePage, isYomuHostedVideoPlayerPage } from './pages';

export interface SiteParserProfile {
    id: string;
    name: string;
    description: string;
    roots: string[];
    exclude?: string;
    passiveInteraction?: string;
    allowUiText?: boolean;
    minLength?: number;
    includeUiChrome?: boolean;
    includeFormChrome?: boolean;
    includeGenericPageText?: boolean;
    fallbackToWholePage?: boolean;
    visibleOnly?: boolean;
    mergeBlockFragments?: boolean;
    plainScan?: boolean;
    scanLimit?: number;
    heading?: boolean;
    singlePassScan?: boolean;
    matches(url: URL): boolean;
}

interface GenericProseCollection {
    targets: FragmentTextTarget[];
    seen: Set<Text>;
    limit: number;
}

const COMMON_EXCLUDE = [
    '[role="dialog"]',
    '[aria-modal="true"]',
    '[data-jpdb-reader-root]',
    '.jpdb-reader-word',
].join(',');
const ASBPLAYER_ROOT_SELECTOR = '.asbplayer-offscreen, .asbplayer-subtitles-container-bottom';
const YOUTUBE_PASSIVE_INTERACTION_SELECTOR = [
    'a[href]',
    'button',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[role="tab"]',
    '[slot="more-button"]',
    '.more-button',
    '#more',
    '#less',
    // YouTube wraps its controls in custom elements; treat them as passive so
    // their labels (subscribe, like, chips, video titles) open the dictionary
    // on hover without swallowing the native click.
    'yt-button-shape',
    'tp-yt-paper-button',
    'ytd-subscribe-button-renderer',
    'ytd-toggle-button-renderer',
    'ytd-button-renderer',
    'yt-chip-cloud-chip-renderer',
    'ytm-button-renderer',
    'ytm-toggle-button-renderer',
    'ytm-subscribe-button-renderer',
    'ytm-chip-cloud-chip-renderer',
    'ytm-compact-link-renderer',
    '.yt-spec-button-shape-next',
].join(',');
const YOUTUBE_TEXT_EXCLUDE = [
    COMMON_EXCLUDE,
    // The video player owns captions and most chrome; the settings popover is
    // re-added below as passive UI so its Japanese menu labels can be hovered
    // without stealing native clicks.
    '#movie_player',
    '.html5-video-player',
    '.ytp-chrome-top',
    '.ytp-chrome-bottom',
    '.ytp-tooltip',
    'tp-yt-paper-tooltip',
    '[role="slider"]',
].join(',');
const DEFAULT_SCAN_TARGET_LIMIT = Number.POSITIVE_INFINITY;
const GENERIC_PROSE_ROOTS = [
    'main h1',
    '[role="main"] h1',
    'article',
    'main article',
    '[role="main"] article',
    '.article',
    '.post',
    '.entry',
    '.story',
    '.prose',
    '.content',
    '.article-body',
    '.article-content',
    '.entry-content',
    '.post-content',
    '.story-body',
    '[itemprop="articleBody"]',
].join(',');
const GENERIC_PROSE_EXCLUDE = [
    COMMON_EXCLUDE,
    'nav',
    'header',
    'footer',
    'aside',
    'button',
    'a[role="button"]',
    '[role="complementary"]',
    '[title]',
    '[class*="audio" i]',
    '[class*="aside" i]',
    '[class*="banner" i]',
    '[class*="breadcrumb" i]',
    '[class*="btn" i]',
    '[class*="button" i]',
    '[class*="card" i]',
    '[class*="comment" i]',
    '[class*="footer" i]',
    '[class*="header" i]',
    '[class*="menu" i]',
    '[class*="meta" i]',
    '[class*="nav" i]',
    '[class*="new-article" i]',
    '[class*="pager" i]',
    '[class*="popular" i]',
    '[class*="promo" i]',
    '[class*="rank" i]',
    '[class*="recommend" i]',
    '[class*="related" i]',
    '[class*="share" i]',
    '[class*="sidebar" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class*="teaser" i]',
    '[class*="voice" i]',
    '[aria-label*="聞"]',
    '[aria-label*="音声"]',
    'time',
].join(',');
const SAFE_UI_CHROME_ROOTS = [
    'nav a[href]',
    '[role="navigation"] a[href]',
    '[class*="breadcrumb" i] a[href]',
    'header a[href]',
    'aside a[href]',
    'main a[href]',
    '[role="main"] a[href]',
    'article a[href]',
    'button',
    'summary',
].join(',');
const SAFE_UI_CHROME_EXCLUDE = [
    COMMON_EXCLUDE,
    'form',
    'label',
    'fieldset',
    'legend',
    'input',
    'select',
    'textarea',
    'option',
    'svg',
    'use',
    'rt',
    'rp',
    '[disabled]',
    '[aria-disabled="true"]',
    '[title]',
    '[contenteditable="true"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[data-audio]',
    '[class*="audio" i]',
    '[class*="control" i]',
    '[class*="player" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class*="toggle" i]',
    '[class*="voice" i]',
].join(',');
const DICTIONARY_SITE_EXCLUDE = [
    COMMON_EXCLUDE,
    'nav',
    'header',
    'footer',
    'aside',
    'form',
    'fieldset',
    'legend',
    'label',
    'button',
    'summary',
    'a[role="button"]',
    'input',
    'select',
    'textarea',
    'option',
    'script',
    'style',
    'svg',
    'canvas',
    'rt',
    'rp',
    '[hidden]',
    '[aria-hidden="true"]',
    '[aria-controls]',
    '[aria-expanded]',
    '[data-audio]',
    '[onclick]',
    '[role="button"]',
    '[role="tab"]',
    '[aria-label*="audio" i]',
    '[aria-label*="tts" i]',
    '[aria-label*="音声" i]',
    '[class*="audio" i]',
    '[class*="control" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class*="tts" i]',
    '[class*="voice" i]',
    '.pi',
    '.p-button-icon',
].join(',');
const SAFE_UI_CHROME_MAX_COMPACT_LENGTH = 80;
const YOMU_HOSTED_DOCS_PARSER_ID = 'yomu-hosted-docs-parser';
const JPDB_PARSER_ID = 'jpdb-parser';
const YOMU_HOSTED_DOCS_ROOTS = [
    '.VPHero .heading',
    '.VPHero .name',
    '.VPHero .text',
    '.VPHero .tagline',
    '.VPHero .main',
    '.VPHomeHero .heading',
    '.VPHomeHero .name',
    '.VPHomeHero .text',
    '.VPHomeHero .tagline',
    '.VPHomeHero .main',
    '.VPFeatures .item',
    '.yomu-install-panel',
    '.yomu-hosted-overflow-group',
    '.yomu-link-grid',
    '.vp-doc',
];
const YOMU_HOSTED_DOCS_PASSIVE_INTERACTION = [
    'a[href]',
    'button',
    'summary',
    '[role="button"]',
    '[role="link"]',
].join(',');
const YOMU_VIDEO_PLAYER_ROOTS = [
    '.brand strong',
    '[data-yomu-video-frame] .empty strong',
    '[data-yomu-video-frame] .empty [data-status]',
    '.file-button',
    '[data-subtitle-open]',
    '[data-settings-trigger]',
    '[data-overflow-menu]',
];
const YOMU_VIDEO_PLAYER_PASSIVE_INTERACTION = [
    'a[href]',
    'button',
    'label',
    'summary',
    '[role="button"]',
].join(',');
const GOOGLE_SEARCH_ROOTS = [
    '#search',
    '#rso',
    '.MjjYud',
    '.g',
    '.VwiC3b',
    '.LC20lb',
    '[data-sokoban-container]',
].join(',');
const GOOGLE_SEARCH_EXCLUDE = [
    COMMON_EXCLUDE,
    'script',
    'style',
    'svg',
    'canvas',
    'g-img',
    'img',
    'form',
    'input',
    'textarea',
    'select',
    'button',
    '[role="button"]',
    '[aria-hidden="true"]',
].join(',');
export const SITE_PARSER_PROFILES: SiteParserProfile[] = [
    {
        id: YOMU_HOSTED_DOCS_PARSER_ID,
        name: 'Yomu hosted docs',
        description: 'Hosted Yomu docs Japanese text.',
        roots: YOMU_HOSTED_DOCS_ROOTS,
        exclude: COMMON_EXCLUDE,
        passiveInteraction: YOMU_HOSTED_DOCS_PASSIVE_INTERACTION,
        allowUiText: true,
        heading: true,
        minLength: 1,
        includeUiChrome: true,
        includeGenericPageText: true,
        visibleOnly: false,
        matches: url => isYomuHostedPassivePage(url.href),
    },
    {
        id: 'yomu-video-player-parser',
        name: 'Yomu video player',
        description: 'Hosted Yomu video-player Japanese controls and empty-state text.',
        roots: YOMU_VIDEO_PLAYER_ROOTS,
        exclude: COMMON_EXCLUDE,
        passiveInteraction: YOMU_VIDEO_PLAYER_PASSIVE_INTERACTION,
        allowUiText: true,
        heading: true,
        minLength: 1,
        includeUiChrome: true,
        includeFormChrome: true,
        matches: url => isYomuHostedVideoPlayerPage(url.href),
    },
    {
        id: 'google-search-parser',
        name: 'Google Search',
        description: 'Google result titles and snippets without inline ruby.',
        roots: [GOOGLE_SEARCH_ROOTS],
        exclude: GOOGLE_SEARCH_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        includeUiChrome: true,
        plainScan: true,
        matches: url => /(^|\.)google\./i.test(url.hostname) && url.pathname === '/search',
    },
    {
        id: JPDB_PARSER_ID,
        name: 'JPDB',
        description: 'JPDB dictionary, review, and search result Japanese text.',
        roots: [
            '.subsection-spelling ruby.v',
            '.result.vocabulary',
            '.result.kanji',
            '.results .result',
            '.subsection-composed-of-kanji',
            '.subsection-meanings',
            '.subsection-usages',
            '.subsection-examples',
            '.subsection-pitch-accent',
            '.review-card',
            '.answer',
            '.sentence',
        ],
        exclude: [
            COMMON_EXCLUDE,
            '.nav',
            '.subsection-spelling',
            '.primary-spelling',
            '.subsection-label',
            '.subsection-immersion-kit',
            '[class*="immersion" i]',
            '.vocabulary-audio',
            '.icon-link',
            '[data-audio]',
        ].join(','),
        allowUiText: true,
        minLength: 1,
        matches: url => url.hostname === 'jpdb.io' || url.hostname.endsWith('.jpdb.io'),
    },
    {
        id: 'jisho-parser',
        name: 'Jisho',
        description: 'Jisho word, kanji, and example sentence result text.',
        roots: [
            '.concept_light-representation .text',
            '.concept_light-readings .text',
            '.japanese_sentence',
            '.sentence_content',
            '.kanji_light_content',
            '.kanji-details__main-readings',
            '.kanji-details__main-meanings',
        ],
        exclude: [
            COMMON_EXCLUDE,
            '.furigana',
            '.english',
            '.debug',
            '.concept_light-status',
            '.concept_light-tag',
            '.concept_light-tags',
            '.concept_light-common',
            '.concept_light-readings .furigana',
            '.meaning-tags',
            '.meaning-wrapper',
            '.links',
            '.result_count',
        ].join(','),
        allowUiText: true,
        minLength: 1,
        matches: url => url.hostname === 'jisho.org' || url.hostname.endsWith('.jisho.org'),
    },
    {
        id: 'jiten-parser',
        name: 'Jiten',
        description: 'Jiten dictionary, parse, vocabulary, and example sentence text.',
        roots: [
            '[lang="ja"]',
            'blockquote',
            '.p-card',
            '.rounded-lg.overflow-hidden',
            'main',
            'article',
        ],
        exclude: DICTIONARY_SITE_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        matches: url => url.hostname === 'jiten.moe' || url.hostname.endsWith('.jiten.moe'),
    },
    {
        id: 'weblio-parser',
        name: 'Weblio',
        description: 'Weblio dictionary result text.',
        roots: ['#main', '#mainContents', '.mainBlock', '.NetDicBody', '.kiji', 'main', 'article'],
        exclude: DICTIONARY_SITE_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        matches: url => url.hostname === 'weblio.jp' || url.hostname.endsWith('.weblio.jp'),
    },
    {
        id: 'goo-dictionary-parser',
        name: 'goo dictionary',
        description: 'goo dictionary result text.',
        roots: ['#NR-main-in', '#main', '.content-box', '.contents', 'main', 'article'],
        exclude: DICTIONARY_SITE_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        matches: url => url.hostname === 'dictionary.goo.ne.jp',
    },
    {
        id: 'kotobank-parser',
        name: 'Kotobank',
        description: 'Kotobank dictionary and encyclopedia result text.',
        roots: ['main', 'article', '.description', '.ex.cf', '.dictype', '.articleBody'],
        exclude: DICTIONARY_SITE_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        matches: url => url.hostname === 'kotobank.jp' || url.hostname.endsWith('.kotobank.jp'),
    },
    {
        id: 'takoboto-parser',
        name: 'Takoboto',
        description: 'Takoboto dictionary result and example sentence text.',
        roots: ['#SearchResultList', '#results', '#main', '.result', '.entry', 'main', 'article'],
        exclude: DICTIONARY_SITE_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        fallbackToWholePage: true,
        matches: url => url.hostname === 'takoboto.jp' || url.hostname.endsWith('.takoboto.jp'),
    },
    {
        id: 'wiktionary-ja-parser',
        name: 'Japanese Wiktionary',
        description: 'Japanese Wiktionary entry text.',
        roots: ['#firstHeading', '#mw-content-text .mw-parser-output'],
        exclude: [
            DICTIONARY_SITE_EXCLUDE,
            '.mw-editsection',
            'sup.reference',
            '.reference',
            '.references',
            '.toc',
            '.navbox',
            '.metadata',
            '.noprint',
            '.catlinks',
            '.thumb',
        ].join(','),
        allowUiText: true,
        minLength: 1,
        heading: true,
        matches: url => url.hostname === 'ja.wiktionary.org' || url.hostname === 'ja.m.wiktionary.org',
    },
    {
        id: 'luna-translator-parser',
        name: 'Luna Translator',
        description: 'Local LunaTranslator transcript windows.',
        roots: ['.lunatranslator_clickword', '.lunatranslator_text_all', '.origin'],
        matches: url => url.protocol === 'file:' && /LunaTranslator.*(?:mainui|transhist)\.html/i.test(decodeURIComponent(url.pathname)),
    },
    {
        id: 'texthooker-parser',
        name: 'Texthooker',
        description: 'Hooked game text from common texthooker pages.',
        roots: ['#textlog', 'main', '.textline', '.line_box', '.my-2.cursor-pointer', 'p'],
        matches: url => /^(anacreondjt\.gitlab\.io|learnjapanese\.moe)$/.test(url.hostname)
            || url.hostname === 'renji-xd.github.io'
            || /\/texthooker\/?$/.test(url.pathname),
    },
    {
        id: 'exstatic-parser',
        name: 'ExStatic',
        description: 'ExStatic sentence tracker entries.',
        roots: ['.sentence-entry', '#entry_holder'],
        matches: url => url.hostname === 'kamwithk.github.io' && url.pathname.endsWith('/exSTATic/tracker.html'),
    },
    {
        id: 'readwok-parser',
        name: 'Readwok',
        description: 'Readwok reader paragraphs.',
        roots: ['div[class*="styles_paragraph_"]', 'div[class*="styles_reader_"]'],
        matches: url => url.hostname === 'app.readwok.com',
    },
    {
        id: 'ttsu-parser',
        name: 'Ttsu',
        description: 'Ttsu book reader content.',
        roots: ['div.book-content', 'div.book-content-container', '#book-content'],
        matches: url => url.hostname === 'reader.ttsu.app',
    },
    {
        id: 'tadoku-parser',
        name: 'Tadoku',
        description: 'Tadoku book titles, descriptions, metadata, and readable book pages.',
        roots: [
            '.bd-title h1',
            '.bd-desc-jp',
            '.bd-author',
            '.book-viewer',
            '.book-reader',
            '.tadoku-book',
            'main article',
        ],
        exclude: [
            COMMON_EXCLUDE,
            '.bd-icons',
            '.bd-detail-wrap',
            '.bd-desc-en',
            '.review',
            '.reviews',
            '.comment',
            '.comments',
        ].join(','),
        allowUiText: true,
        minLength: 1,
        heading: true,
        fallbackToWholePage: true,
        matches: url => url.hostname === 'tadoku.org' || url.hostname.endsWith('.tadoku.org'),
    },
    {
        id: 'youtube-comments-parser',
        name: 'YouTube text',
        description: 'Japanese descriptions, comments, live chat, and watch UI in YouTube views.',
        roots: [
            // Watch, feed, sidebar, live-chat, and player settings text. UI
            // and card roots are collected as passive hover targets so native
            // YouTube clicks keep working.
            'ytd-masthead',
            'ytd-mini-guide-renderer',
            'ytd-guide-renderer',
            'ytd-watch-metadata h1',
            'ytd-watch-metadata #description-inline-expander',
            'ytd-watch-metadata ytd-text-inline-expander',
            'ytd-watch-metadata #attributed-snippet-text',
            'ytd-watch-metadata a[href]',
            'ytd-watch-metadata button',
            'ytd-watch-metadata [role="button"]',
            'ytd-watch-metadata yt-button-shape',
            'ytd-watch-metadata ytd-button-renderer',
            'ytd-watch-metadata ytd-subscribe-button-renderer',
            'ytd-watch-metadata ytd-toggle-button-renderer',
            'ytd-search',
            'ytd-two-column-search-results-renderer',
            'ytd-section-list-renderer',
            'ytd-item-section-renderer',
            'ytd-rich-item-renderer',
            'ytd-video-renderer',
            'ytd-compact-video-renderer',
            'ytd-grid-video-renderer',
            '#related',
            'ytd-watch-next-secondary-results-renderer',
            'ytd-rich-grid-renderer',
            'ytd-rich-section-renderer',
            'ytd-reel-shelf-renderer',
            'ytd-reel-item-renderer',
            'ytd-reel-video-renderer',
            'yt-lockup-view-model',
            'yt-lockup-metadata-view-model',
            'ytm-mobile-topbar-renderer',
            'ytm-pivot-bar-renderer',
            'ytm-rich-grid-renderer',
            'ytm-rich-item-renderer',
            'ytm-video-with-context-renderer',
            'ytm-compact-video-renderer',
            'ytm-video-card-renderer',
            'ytm-shorts-lockup-view-model',
            'ytm-shorts-lockup-view-model-v2',
            'ytm-single-column-watch-next-results-renderer',
            'ytm-item-section-renderer',
            '.ytp-popup',
            '.ytp-settings-menu',
            '.ytp-panel',
            '.ytp-panel-menu',
            'ytm-slim-video-metadata-section-renderer',
            'ytm-slim-owner-renderer',
            'ytm-expandable-video-description-body-renderer',
            'ytm-video-description-header-renderer',
            'ytm-video-description-transcript-section-renderer',
            'ytm-structured-description-content-renderer',
            'ytm-metadata-row-container-renderer',
            'ytm-comment-section-renderer',
            'ytm-comment-thread-renderer',
            'ytm-comment-renderer',
            'ytd-comments',
            'ytd-comment-view-model',
            'ytd-comment-thread-renderer',
            'ytd-comment-replies-renderer',
            '#content-text',
            'yt-live-chat-text-message-renderer #author-name',
            'yt-live-chat-text-message-renderer #message',
            'yt-live-chat-paid-message-renderer #author-name',
            'yt-live-chat-paid-message-renderer #message',
            'yt-live-chat-membership-item-renderer #author-name',
            'yt-live-chat-membership-item-renderer #message',
            'yt-live-chat-text-message-renderer',
            'yt-live-chat-paid-message-renderer',
            'yt-live-chat-membership-item-renderer',
            'yt-live-chat-viewer-engagement-message-renderer',
            'yt-live-chat-ticker-renderer',
            'ytd-live-chat-frame',
            'yt-live-chat-item-list-renderer',
            'yt-live-chat-renderer',
            'yt-live-chat-app',
        ],
        exclude: YOUTUBE_TEXT_EXCLUDE,
        allowUiText: true,
        includeUiChrome: true,
        passiveInteraction: YOUTUBE_PASSIVE_INTERACTION_SELECTOR,
        singlePassScan: true,
        matches: url => url.hostname === 'youtube.com'
            || url.hostname.endsWith('.youtube.com')
            || url.hostname === 'youtu.be',
    },
    {
        id: 'cijapanese-transcript-parser',
        name: 'Comprehensible Japanese',
        description: 'Comprehensible Japanese video transcripts with native furigana.',
        roots: [
            '.transcript',
            '[data-tab-type="transcript"]',
        ],
        exclude: [
            COMMON_EXCLUDE,
            '.cue-button',
            '.btn',
            'svg',
        ].join(','),
        allowUiText: true,
        minLength: 1,
        matches: url => url.hostname === 'cijapanese.com' || url.hostname.endsWith('.cijapanese.com'),
    },
    {
        id: 'mokuro-parser',
        name: 'Mokuro',
        description: 'Mokuro manga text boxes.',
        roots: ['.textBox', '#manga-panel .textBox', '#pagesContainer .textBox'],
        allowUiText: true,
        minLength: 1,
        mergeBlockFragments: true,
        visibleOnly: false,
        matches: url => url.hostname === 'reader.mokuro.app'
            || (url.protocol === 'file:' && /mokuro/i.test(decodeURIComponent(url.pathname))),
    },
    {
        id: 'wikipedia-parser',
        name: 'Japanese Wikipedia',
        description: 'Japanese Wikipedia article text and previews.',
        roots: ['#firstHeading', '#mw-content-text', '.mwe-popups-extract'],
        exclude: [
            COMMON_EXCLUDE,
            '.p-lang-btn',
            '.vector-menu-heading-label',
            '.vector-toc-toggle',
            '.vector-page-toolbar',
            '.mw-editsection',
            'sup.reference',
            '.legend',
        ].join(','),
        allowUiText: true,
        minLength: 1,
        heading: true,
        matches: url => url.hostname === 'ja.wikipedia.org' || url.hostname === 'ja.m.wikipedia.org',
    },
    {
        id: 'satori-reader-parser',
        name: 'Satori Reader',
        description: 'Satori Reader article text.',
        roots: ['#article-content'],
        exclude: [COMMON_EXCLUDE, '.play-button-container', '.notes-button-container', '.fg', '.wpr'].join(','),
        allowUiText: true,
        minLength: 1,
        matches: url => url.hostname.endsWith('.satorireader.com') && url.pathname.includes('/articles/'),
    },
    {
        id: 'nhk-parser',
        name: 'NHK Easy',
        description: 'NHK Easy visible page text with native ruby.',
        roots: [
            'body',
        ],
        exclude: [
            '#loading',
            '.article-top-tool',
            '.article-share',
        ].join(','),
        allowUiText: true,
        minLength: 1,
        includeUiChrome: true,
        fallbackToWholePage: true,
        matches: url => (
            (url.hostname === 'news.web.nhk' && /\/news\/easy\//.test(url.pathname))
            || (url.protocol === 'file:' && /NHK.*(?:やさしいことば|NEWS WEB EASY)|(?:やさしいことば|NEWS WEB EASY).*NHK/i.test(decodeURIComponent(url.pathname)))
            || /NHKやさしいことばニュース|NEWS WEB EASY/i.test(document.title)
        ),
    },
    {
        id: 'nhk-news-parser',
        name: 'NHK',
        description: 'NHK article text with native ruby.',
        roots: [
            '#main article',
            '#main',
            '[data-testid*="article"]',
        ],
        exclude: [
            COMMON_EXCLUDE,
            '[class*="related" i]',
            '[class*="recommend" i]',
            '[class*="ranking" i]',
            '.soundButton',
            '.js-sound',
            '.js-play',
            '.player',
            '[onclick]',
            '[data-audio]',
        ].join(','),
        fallbackToWholePage: true,
        matches: url => (
            (url.hostname === 'news.web.nhk' || url.hostname.endsWith('.nhk.or.jp'))
            && /\/news\/html\//.test(url.pathname)
        ),
    },
    {
        id: 'bunpro-parser',
        name: 'Bunpro',
        description: 'Bunpro graded reader and study sections.',
        roots: ['article', 'div.mx-auto', '[id^="study-question-"]'],
        matches: url => url.hostname === 'bunpro.jp' || url.hostname.endsWith('.bunpro.jp'),
    },
    {
        id: 'asbplayer-parser',
        name: 'asbplayer',
        description: 'asbplayer subtitle overlays.',
        roots: ['.asbplayer-offscreen', '.asbplayer-subtitles-container-bottom'],
        matches: () => Boolean(document.querySelector(ASBPLAYER_ROOT_SELECTOR)),
    },
];

export function getMatchingSiteParsers(href = window.location.href): SiteParserProfile[] {
    const url = new URL(href, window.location.href);
    return SITE_PARSER_PROFILES.filter(profile => profile.matches(url));
}

export function collectSiteScanTargets(limit = 40, href = window.location.href): ScanTextTarget[] | null {
    const profiles = getMatchingSiteParsers(href);
    if (!profiles.length) return null;

    const context = createSiteScanContext(profiles, limit);
    for (const profile of profiles) collectProfileScanTargets(profile, context);
    return siteScanResult(profiles, context.targets);
}

interface SiteScanContext {
    effectiveLimit: number;
    targets: FragmentTextTarget[];
    seen: Set<Text>;
}

function createSiteScanContext(profiles: SiteParserProfile[], limit: number): SiteScanContext {
    return {
        effectiveLimit: effectiveScanTargetLimit(profiles, limit),
        targets: [],
        seen: new Set(),
    };
}

function collectProfileScanTargets(profile: SiteParserProfile, context: SiteScanContext): void {
    for (const root of queryParserRoots(profile)) {
        if (!siteScanHasRoom(context)) break;
        collectRootScanTargets(profile, root, context);
    }
}

function collectRootScanTargets(profile: SiteParserProfile, root: Element, context: SiteScanContext): void {
    const collected = collectFragmentTextTargetsIn(root, siteScanRemaining(context), profile.visibleOnly ?? true, siteScanExcludeSelector(profile), {
        allowUiText: profile.allowUiText,
        minLength: profile.minLength,
        includeUiChrome: profile.includeUiChrome,
        includeFormChrome: profile.includeFormChrome,
        mergeBlockFragments: profile.mergeBlockFragments,
        heading: profile.heading,
    });
    for (const target of collected) {
        if (!addUniqueSiteScanTarget(profile, target, context)) continue;
        if (!siteScanHasRoom(context)) break;
    }
    collectPassiveInteractionScanTargets(profile, root, context);
}

function siteScanExcludeSelector(profile: SiteParserProfile): string {
    const base = profile.exclude ?? COMMON_EXCLUDE;
    return profile.passiveInteraction ? `${base},${profile.passiveInteraction}` : base;
}

function collectPassiveInteractionScanTargets(profile: SiteParserProfile, root: Element, context: SiteScanContext): void {
    const selector = profile.passiveInteraction;
    if (!selector || !siteScanHasRoom(context)) return;
    collectPassiveInteractionRoots(profile, passiveInteractionRoots(root, selector), context);
}

function collectPassiveInteractionRoots(profile: SiteParserProfile, roots: Element[], context: SiteScanContext): void {
    for (const passiveRoot of roots) {
        if (!siteScanHasRoom(context)) break;
        collectPassiveInteractionRootTargets(profile, passiveRoot, context);
    }
}

function collectPassiveInteractionRootTargets(profile: SiteParserProfile, passiveRoot: Element, context: SiteScanContext): void {
    const collected = collectFragmentTextTargetsIn(passiveRoot, siteScanRemaining(context), profile.visibleOnly ?? true, profile.exclude ?? COMMON_EXCLUDE, {
        allowUiText: true,
        minLength: profile.minLength,
        includeUiChrome: true,
        includeFormChrome: profile.includeFormChrome,
        mergeBlockFragments: profile.mergeBlockFragments,
        heading: profile.heading,
    });
    for (const target of collected) {
        if (!addUniqueSiteScanTarget(profile, target, context, { passiveInteraction: true })) continue;
        if (!siteScanHasRoom(context)) break;
    }
}

function passiveInteractionRoots(root: Element, selector: string): Element[] {
    const candidates = [
        ...(root.matches(selector) ? [root] : []),
        ...Array.from(root.querySelectorAll(selector)),
    ];
    if (candidates.length <= 1) return candidates;
    // Keep only the outermost matches (drop any candidate contained by another).
    // querySelectorAll already returns unique, document-ordered descendants, so
    // this is an ancestor-membership walk — O(n·depth) — instead of the old
    // O(n²) nested native `contains`, which dominated the page auto-scan on
    // YouTube's churning DOM during playback (live-profiled).
    const candidateSet = new Set<Element>(candidates);
    const result: Element[] = [];
    for (const candidate of candidates) {
        let containedByCandidate = false;
        for (let ancestor = candidate.parentElement; ancestor; ancestor = ancestor.parentElement) {
            if (candidateSet.has(ancestor)) { containedByCandidate = true; break; }
            if (ancestor === root) break;
        }
        if (!containedByCandidate) result.push(candidate);
    }
    return result;
}

function addUniqueSiteScanTarget(
    profile: SiteParserProfile,
    target: FragmentTextTarget,
    context: SiteScanContext,
    options: { passiveInteraction?: boolean } = {},
): boolean {
    const nodes = textNodesForFragmentTarget(target);
    if (!nodes.length || nodes.some(node => context.seen.has(node))) return false;
    nodes.forEach(node => context.seen.add(node));
    context.targets.push(siteScanTargetWithProfileOptions(profile, target, options));
    return true;
}

function siteScanTargetWithProfileOptions(profile: SiteParserProfile, target: FragmentTextTarget, options: { passiveInteraction?: boolean }): FragmentTextTarget {
    const baseTarget = {
        ...target,
        parserId: profile.id,
        singlePassScan: profile.singlePassScan || undefined,
    };
    const profiledTarget = !options.passiveInteraction ? baseTarget : {
        ...baseTarget,
        passiveInteraction: true,
    };
    const normalizedTarget = profile.plainScan ? plainScanTarget(profiledTarget) : profiledTarget;
    return shouldActivateJpdbPageTarget(profile, options)
        ? activeJpdbPageTarget(profiledTarget)
        : normalizedTarget;
}

function shouldActivateJpdbPageTarget(profile: SiteParserProfile, options: { passiveInteraction?: boolean }): boolean {
    return profile.id === JPDB_PARSER_ID && !options.passiveInteraction;
}

function activeJpdbPageTarget(target: FragmentTextTarget): FragmentTextTarget {
    return {
        ...target,
        passiveInteraction: false,
        fragments: target.fragments.map(fragment => ({
            ...fragment,
            passiveInteraction: false,
        })),
    };
}

function plainScanTarget(target: FragmentTextTarget): FragmentTextTarget {
    return {
        ...target,
        layoutSensitive: true,
        fragments: target.fragments.map(fragment => ({
            ...fragment,
            layoutSensitive: true,
        })),
    };
}

function siteScanRemaining(context: SiteScanContext): number {
    return context.effectiveLimit - context.targets.length;
}

function siteScanHasRoom(context: SiteScanContext): boolean {
    return siteScanRemaining(context) > 0;
}

function siteScanResult(profiles: SiteParserProfile[], targets: FragmentTextTarget[]): ScanTextTarget[] | null {
    if (targets.length) return targets;
    return profiles.some(profile => profile.id !== 'asbplayer-parser') ? [] : null;
}

export function collectScanTargets(limit = DEFAULT_SCAN_TARGET_LIMIT, href = window.location.href): ScanTextTarget[] {
    const matchingProfiles = getMatchingSiteParsers(href);
    const effectiveLimit = matchingProfiles.length ? effectiveScanTargetLimit(matchingProfiles, limit) : limit;
    const siteTargets = completeSiteScanTargets(matchingProfiles, effectiveLimit, href);
    if (siteTargets && !hasGenericPageTextFallback(matchingProfiles)) return siteTargets;
    const baseTargets = siteTargets ?? [];
    const genericTargets = collectGenericProseTargets(effectiveLimit - baseTargets.length, baseTargets);
    const uiChromeTargets = collectSafeUiChromeTargets(effectiveLimit - baseTargets.length - genericTargets.length, [...baseTargets, ...genericTargets]);
    if (baseTargets.length || genericTargets.length || uiChromeTargets.length) return [...baseTargets, ...genericTargets, ...uiChromeTargets];

    const broadTargets = collectWholePageScanTargets(effectiveLimit);
    return broadTargets.length ? broadTargets : collectVisibleTextTargets(effectiveLimit);
}

function completeSiteScanTargets(profiles: SiteParserProfile[], limit: number, href: string): ScanTextTarget[] | null {
    if (!profiles.length) return null;
    const siteTargets = collectSiteScanTargets(limit, href) ?? [];
    if (siteTargets.length) return siteTargets;
    if (hasWholePageFallback(profiles)) {
        const broadTargets = collectWholePageScanTargets(limit);
        if (broadTargets.length) return broadTargets;
    }
    return hasGenericPageTextFallback(profiles) ? null : siteTargets;
}

function hasGenericPageTextFallback(profiles: SiteParserProfile[]): boolean {
    return profiles.some(profile => profile.includeGenericPageText);
}

function hasWholePageFallback(profiles: SiteParserProfile[]): boolean {
    return profiles.some(profile => profile.fallbackToWholePage);
}

function effectiveScanTargetLimit(profiles: SiteParserProfile[], requestedLimit: number): number {
    const profileLimit = profiles.reduce((limit, profile) => Math.min(limit, profile.scanLimit ?? limit), requestedLimit);
    return Math.max(1, profileLimit);
}

function collectWholePageScanTargets(limit: number): FragmentTextTarget[] {
    const targets = collectFragmentTextTargetsIn(document.body, limit, true, '', {
        allowUiText: true,
        includeUiChrome: true,
        minLength: 1,
    });
    return targets.map(target => ({ ...target, parserId: target.parserId ?? 'whole-page-parser' }));
}

function collectGenericProseTargets(limit: number, existingTargets: ScanTextTarget[] = []): FragmentTextTarget[] {
    const roots = genericProseRoots();
    const collection: GenericProseCollection = { targets: [], seen: seenTextNodes(existingTargets), limit };

    for (const root of roots) {
        collectGenericProseTargetsFromRoot(root, collection);
        if (genericProseCollectionFull(collection)) break;
    }

    return collection.targets;
}

function seenTextNodes(targets: ScanTextTarget[]): Set<Text> {
    return new Set(targets.flatMap(target => {
        if ('fragments' in target) return textNodesForFragmentTarget(target);
        return [target.node];
    }));
}

function collectSafeUiChromeTargets(limit: number, existingTargets: ScanTextTarget[] = []): FragmentTextTarget[] {
    if (limit <= 0) return [];
    const collection: GenericProseCollection = {
        targets: [],
        seen: seenTextNodes(existingTargets),
        limit,
    };

    for (const root of safeUiChromeRoots()) {
        collectSafeUiChromeTargetsFromRoot(root, collection);
        if (genericProseCollectionFull(collection)) break;
    }

    return collection.targets;
}

function safeUiChromeRoots(): HTMLElement[] {
    return uniqueVisibleRoots(Array.from(document.querySelectorAll<HTMLElement>(SAFE_UI_CHROME_ROOTS))
        .filter(root => isUsefulSafeUiChromeRoot(root)));
}

function collectSafeUiChromeTargetsFromRoot(root: HTMLElement, collection: GenericProseCollection): void {
    const collected = collectFragmentTextTargetsIn(root, genericProseRemaining(collection), true, SAFE_UI_CHROME_EXCLUDE, {
        allowUiText: true,
        includeUiChrome: true,
        heading: true,
        minLength: 1,
    });
    for (const target of collected) {
        appendGenericProseTarget(collection.targets, collection.seen, {
            ...target,
            parserId: 'safe-ui-chrome-parser',
            passiveInteraction: true,
        });
        if (genericProseCollectionFull(collection)) break;
    }
}

function genericProseRoots(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(GENERIC_PROSE_ROOTS))
        .filter(root => isUsefulGenericProseRoot(root));
}

function collectGenericProseTargetsFromRoot(root: HTMLElement, collection: GenericProseCollection): void {
    const collected = collectFragmentTextTargetsIn(root, genericProseRemaining(collection), true, GENERIC_PROSE_EXCLUDE, { minLength: 2 });
    for (const target of collected) {
        appendGenericProseTarget(collection.targets, collection.seen, target);
        if (genericProseCollectionFull(collection)) break;
    }
}

function genericProseRemaining(collection: GenericProseCollection): number {
    return Math.max(0, collection.limit - collection.targets.length);
}

function genericProseCollectionFull(collection: GenericProseCollection): boolean {
    return genericProseRemaining(collection) <= 0;
}

function appendGenericProseTarget(targets: FragmentTextTarget[], seen: Set<Text>, target: FragmentTextTarget): boolean {
    const nodes = textNodesForFragmentTarget(target);
    if (!nodes.length) return false;
    if (nodes.some(node => seen.has(node))) return false;
    nodes.forEach(node => seen.add(node));
    targets.push({ ...target, parserId: 'generic-prose-parser' });
    return true;
}

function textNodesForFragmentTarget(target: FragmentTextTarget): Text[] {
    const nodes: Text[] = [];
    for (const fragment of target.fragments) {
        if (!nodes.includes(fragment.node)) nodes.push(fragment.node);
    }
    return nodes;
}

function isUsefulGenericProseRoot(root: HTMLElement): boolean {
    if (root.closest(GENERIC_PROSE_EXCLUDE)) return false;
    const text = root.textContent?.replace(/\s+/g, '').trim() ?? '';
    if (text.length < 12) return false;
    return /[\u3040-\u30ff\u3400-\u9fff]/u.test(text);
}

function isUsefulSafeUiChromeRoot(root: HTMLElement): boolean {
    if (root.closest(SAFE_UI_CHROME_EXCLUDE)) return false;
    if (!isVisibleSafeUiChromeRoot(root)) return false;
    const text = root.textContent?.replace(/\s+/g, '').trim() ?? '';
    if (!/[\u3040-\u30ff\u3400-\u9fff]/u.test(text)) return false;
    return text.length >= 2 && text.length <= SAFE_UI_CHROME_MAX_COMPACT_LENGTH;
}

function isVisibleSafeUiChromeRoot(root: HTMLElement): boolean {
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const style = getComputedStyle(root);
    return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0;
}

function queryParserRoots(profile: SiteParserProfile): HTMLElement[] {
    const roots: HTMLElement[] = [];
    for (const selector of profile.roots) {
        roots.push(...Array.from(document.querySelectorAll<HTMLElement>(selector)));
    }
    return uniqueVisibleRoots(roots);
}

function uniqueVisibleRoots(roots: HTMLElement[]): HTMLElement[] {
    const unique: HTMLElement[] = [];
    for (const root of roots) {
        if (unique.some(existing => existing === root || existing.contains(root))) continue;
        unique.push(root);
    }
    return unique;
}
