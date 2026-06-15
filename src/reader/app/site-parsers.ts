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
    includePassiveInteractionRoots?: boolean;
    matches(url: URL): boolean;
}

interface GenericProseCollection {
    targets: FragmentTextTarget[];
    seen: Set<Text>;
    limit: number;
}

const STRUCTURAL_EXCLUDE_ENTRIES = [
    '[data-jpdb-reader-root]',
    '.jpdb-reader-word',
    'script',
    'style',
    'noscript',
    'input',
    'select',
    'textarea',
    'option',
    'svg',
    'use',
    'canvas',
    'rt',
    'rp',
    '[hidden]',
    '[aria-hidden="true"]',
    '[contenteditable="true"]',
];
const COMMON_EXCLUDE = STRUCTURAL_EXCLUDE_ENTRIES.join(',');
const ASBPLAYER_ROOT_SELECTOR = '.asbplayer-offscreen, .asbplayer-subtitles-container-bottom';
const YOUTUBE_TEXT_EXCLUDE = [
    COMMON_EXCLUDE,
    '#movie_player',
    '.html5-video-player',
    '.ytp-tooltip',
    'ytd-feed-filter-chip-bar-renderer',
    'ytd-guide-renderer',
    'ytd-masthead',
    'ytd-mini-guide-renderer',
    'yt-chip-cloud-renderer',
    'ytm-feed-filter-chip-bar-renderer',
    'ytm-mobile-topbar-renderer',
    'ytm-pivot-bar-renderer',
    'ytd-watch-metadata button',
    'ytd-watch-metadata [role="button"]',
    'ytm-slim-video-metadata-section-renderer button',
    'ytm-slim-video-metadata-section-renderer [role="button"]',
    'yt-live-chat-text-message-renderer button',
    'yt-live-chat-text-message-renderer [role="button"]',
    'yt-live-chat-paid-message-renderer button',
    'yt-live-chat-paid-message-renderer [role="button"]',
    'yt-live-chat-membership-item-renderer button',
    'yt-live-chat-membership-item-renderer [role="button"]',
    'yt-live-chat-viewer-engagement-message-renderer button',
    'yt-live-chat-viewer-engagement-message-renderer [role="button"]',
    '[slot="more-button"]',
    '.more-button',
    'tp-yt-paper-tooltip',
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
const SAFE_UI_CHROME_SCOPE_SELECTORS = [
    'nav',
    '[role="navigation"]',
    'header',
    'aside',
    '[role="complementary"]',
    '[role="tablist"]',
    '[class*="appearance" i]',
    '[id*="appearance" i]',
    '[class*="menu" i]',
    '[id*="menu" i]',
    '[class*="pinnable" i]',
    '[id*="pinnable" i]',
    '[class*="prefs" i]',
    '[id*="prefs" i]',
    '[class*="sidebar" i]',
    '[id*="sidebar" i]',
    '[class*="tabs" i]',
    '[id*="tabs" i]',
    '[class*="toc" i]',
    '[id*="toc" i]',
    '[class*="toolbar" i]',
    '[id*="toolbar" i]',
];
const SAFE_UI_CHROME_CONTROL_SELECTORS = [
    'a[href]',
    'button',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[role="option"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="tab"]',
];
const PASSIVE_INTERACTION_ROOTS = [
    ...SAFE_UI_CHROME_CONTROL_SELECTORS,
    '[aria-controls]',
    '[aria-expanded]',
    '[slot="more-button"]',
    '.more-button',
    '#more',
    '#less',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
    '[class*="audio" i]',
    '[class*="button" i]',
    '[class*="control" i]',
    '[class*="play" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class*="toggle" i]',
].join(',');
const SCOPED_SAFE_UI_CHROME_ROOTS = [
    ...SAFE_UI_CHROME_SCOPE_SELECTORS,
    ...SAFE_UI_CHROME_SCOPE_SELECTORS.flatMap(scope => (
        SAFE_UI_CHROME_CONTROL_SELECTORS.map(control => `${scope} ${control}`)
    )),
];
const SAFE_UI_CHROME_ROOTS = [
    ...SCOPED_SAFE_UI_CHROME_ROOTS,
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
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
].join(',');
const PROFILE_SAFE_UI_CHROME_ROOTS = SAFE_UI_CHROME_ROOTS;
const SAFE_UI_CHROME_ARIA_MENU_ROOTS = [
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
].join(',');
const SAFE_UI_CHROME_EXCLUDE_ENTRIES = [
    ...STRUCTURAL_EXCLUDE_ENTRIES,
    '[disabled]',
    '[aria-disabled="true"]',
];
const SAFE_UI_CHROME_EXCLUDE = SAFE_UI_CHROME_EXCLUDE_ENTRIES.join(',');
const SAFE_UI_CHROME_ARIA_MENU_EXCLUDE = SAFE_UI_CHROME_EXCLUDE_ENTRIES
    .filter(entry => entry !== '[class*="control" i]')
    .join(',');
const SAFE_FORM_CHROME_ROOTS = SAFE_UI_CHROME_SCOPE_SELECTORS.flatMap(scope => [
    `${scope} form`,
    `${scope} label`,
]).join(',');
const SAFE_FORM_CHROME_EXCLUDE = [
    ...STRUCTURAL_EXCLUDE_ENTRIES,
    '[disabled]',
    '[aria-disabled="true"]',
].join(',');
const DICTIONARY_SITE_EXCLUDE = [
    COMMON_EXCLUDE,
    '.pi',
    '.p-button-icon',
].join(',');
const SAFE_UI_CHROME_MAX_COMPACT_LENGTH = 160;
const SAFE_FORM_CHROME_MAX_COMPACT_LENGTH = 80;
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
const YOMU_VIDEO_PLAYER_ROOTS = [
    '.brand strong',
    '[data-yomu-video-frame] .empty strong',
    '[data-yomu-video-frame] .empty [data-status]',
    '.file-button',
    '[data-subtitle-open]',
    '[data-settings-trigger]',
    '[data-overflow-menu]',
];
const YOUTUBE_CHROME_ROOTS = [
    'ytd-feed-filter-chip-bar-renderer chip-shape button',
    'ytd-feed-filter-chip-bar-renderer [role="tab"]',
    'yt-chip-cloud-renderer chip-shape button',
    'yt-chip-cloud-renderer [role="tab"]',
    'ytm-feed-filter-chip-bar-renderer button',
    'ytm-feed-filter-chip-bar-renderer [role="tab"]',
    'ytd-mini-guide-renderer ytd-mini-guide-entry-renderer a#endpoint',
    'ytd-guide-renderer ytd-guide-entry-renderer a#endpoint',
    'ytm-pivot-bar-renderer a',
    'ytm-pivot-bar-item-renderer a',
    'ytd-masthead yt-button-shape button',
    'ytd-masthead button[aria-label]',
    'ytd-masthead .ytAttributedStringHost',
    'ytd-masthead yt-attributed-string',
];
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
    'g-img',
    'img',
].join(',');
export const SITE_PARSER_PROFILES: SiteParserProfile[] = [
    {
        id: YOMU_HOSTED_DOCS_PARSER_ID,
        name: 'Yomu hosted docs',
        description: 'Hosted Yomu docs Japanese text.',
        roots: YOMU_HOSTED_DOCS_ROOTS,
        exclude: COMMON_EXCLUDE,
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
            '.subsection-spelling',
            '.primary-spelling',
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
            '.concept_light-readings .furigana',
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
            '.bd-desc-en',
        ].join(','),
        allowUiText: true,
        minLength: 1,
        heading: true,
        fallbackToWholePage: true,
        matches: url => url.hostname === 'tadoku.org' || url.hostname.endsWith('.tadoku.org'),
    },
    {
        id: 'youtube-chrome-parser',
        name: 'YouTube chrome',
        description: 'Stable Japanese YouTube chips, navigation, and topbar controls.',
        roots: YOUTUBE_CHROME_ROOTS,
        exclude: COMMON_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        includeUiChrome: true,
        singlePassScan: true,
        includePassiveInteractionRoots: false,
        matches: url => url.hostname === 'youtube.com'
            || url.hostname.endsWith('.youtube.com')
            || url.hostname === 'youtu.be',
    },
    {
        id: 'youtube-comments-parser',
        name: 'YouTube text',
        description: 'Japanese descriptions, comments, live chat, and watch UI in YouTube views.',
        roots: [
            // Watch metadata, descriptions, comments, live-chat, feed cards,
            // and transcript rows. Player/topbar/navigation/chip chrome is
            // handled by the dedicated passive YouTube chrome parser above.
            'ytd-rich-grid-renderer',
            'ytd-rich-item-renderer',
            'ytd-video-renderer',
            'yt-lockup-view-model',
            'ytm-rich-grid-renderer',
            'ytm-video-with-context-renderer',
            'ytm-shorts-lockup-view-model',
            'ytm-item-section-renderer',
            'ytd-watch-next-secondary-results-renderer',
            'ytd-compact-video-renderer',
            'ytd-transcript-segment-renderer',
            'ytd-watch-metadata h1',
            'ytd-watch-metadata #description-inline-expander',
            'ytd-watch-metadata ytd-text-inline-expander',
            'ytd-watch-metadata #attributed-snippet-text',
            'ytm-slim-video-metadata-section-renderer h1',
            'ytm-expandable-video-description-body-renderer',
            'ytm-structured-description-content-renderer',
            '#content-text',
            'yt-live-chat-text-message-renderer #author-name',
            'yt-live-chat-text-message-renderer #message',
            'yt-live-chat-paid-message-renderer #author-name',
            'yt-live-chat-paid-message-renderer #message',
            'yt-live-chat-membership-item-renderer #author-name',
            'yt-live-chat-membership-item-renderer #message',
            'yt-live-chat-viewer-engagement-message-renderer',
            'yt-live-chat-ticker-renderer',
        ],
        exclude: YOUTUBE_TEXT_EXCLUDE,
        allowUiText: true,
        includeUiChrome: true,
        singlePassScan: true,
        includePassiveInteractionRoots: false,
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
        exclude: [COMMON_EXCLUDE, '.fg', '.wpr'].join(','),
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
            COMMON_EXCLUDE,
            '#loading',
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
    if (profile.includePassiveInteractionRoots !== false) {
        collectProfilePassiveInteractionTargets(profile, context);
    }
}

function collectRootScanTargets(profile: SiteParserProfile, root: Element, context: SiteScanContext, excludeSelector = siteScanExcludeSelector(profile)): void {
    const collected = collectFragmentTextTargetsIn(root, siteScanRemaining(context), profile.visibleOnly ?? true, excludeSelector, {
        allowUiText: true,
        minLength: profile.minLength,
        includeUiChrome: true,
        includeFormChrome: true,
        includeTabChrome: true,
        includePassiveInteractions: true,
        mergeBlockFragments: profile.mergeBlockFragments,
        heading: profile.heading,
    });
    for (const target of collected) {
        if (!addUniqueSiteScanTarget(profile, target, context)) continue;
        if (!siteScanHasRoom(context)) break;
    }
}

function collectProfilePassiveInteractionTargets(profile: SiteParserProfile, context: SiteScanContext): void {
    if (!siteScanHasRoom(context)) return;
    for (const root of queryProfilePassiveInteractionRoots(profile)) {
        if (!siteScanHasRoom(context)) break;
        collectRootScanTargets(profile, root, context, siteScanPassiveInteractionExcludeSelector(profile));
    }
}

function queryProfilePassiveInteractionRoots(profile: SiteParserProfile): HTMLElement[] {
    return uniqueSpecificVisibleRoots(Array.from(document.querySelectorAll<HTMLElement>(PASSIVE_INTERACTION_ROOTS))
        .filter(root => isUsefulProfilePassiveInteractionRoot(profile, root)));
}

function isUsefulProfilePassiveInteractionRoot(profile: SiteParserProfile, root: HTMLElement): boolean {
    const exclude = siteScanPassiveInteractionExcludeSelector(profile);
    return isUsefulCompactJapaneseRoot(root, exclude, 1, SAFE_UI_CHROME_MAX_COMPACT_LENGTH);
}

function siteScanExcludeSelector(profile: SiteParserProfile): string {
    return profile.exclude ?? COMMON_EXCLUDE;
}

function siteScanPassiveInteractionExcludeSelector(profile: SiteParserProfile): string {
    return siteScanExcludeSelector(profile);
}

function addUniqueSiteScanTarget(
    profile: SiteParserProfile,
    target: FragmentTextTarget,
    context: SiteScanContext,
): boolean {
    const nodes = textNodesForFragmentTarget(target);
    if (!nodes.length || nodes.some(node => context.seen.has(node))) return false;
    if (isResidualReaderParticleTarget(target)) return false;
    nodes.forEach(node => context.seen.add(node));
    context.targets.push(siteScanTargetWithProfileOptions(profile, target));
    return true;
}

function siteScanTargetWithProfileOptions(profile: SiteParserProfile, target: FragmentTextTarget): FragmentTextTarget {
    const baseTarget = {
        ...target,
        parserId: profile.id,
        singlePassScan: profile.singlePassScan || undefined,
    };
    return profile.plainScan ? plainScanTarget(baseTarget) : baseTarget;
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
    const baseTargets = siteTargets ?? [];
    const profileUiChromeTargets = collectProfileSafeUiChromeTargets(effectiveLimit - baseTargets.length, baseTargets, matchingProfiles.length > 0, matchingProfiles);
    if (siteTargets && !hasGenericPageTextFallback(matchingProfiles)) return [...baseTargets, ...profileUiChromeTargets];
    const genericTargets = collectGenericProseTargets(effectiveLimit - baseTargets.length - profileUiChromeTargets.length, [...baseTargets, ...profileUiChromeTargets]);
    const uiChromeTargets = collectSafeUiChromeTargets(
        effectiveLimit - baseTargets.length - profileUiChromeTargets.length - genericTargets.length,
        [...baseTargets, ...profileUiChromeTargets, ...genericTargets],
    );
    if (baseTargets.length || profileUiChromeTargets.length || genericTargets.length || uiChromeTargets.length) {
        return [...baseTargets, ...profileUiChromeTargets, ...genericTargets, ...uiChromeTargets];
    }

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
        includeFormChrome: true,
        includeTabChrome: true,
        includePassiveInteractions: true,
        heading: true,
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

function collectProfileSafeUiChromeTargets(
    limit: number,
    existingTargets: ScanTextTarget[] = [],
    enabled = true,
    profiles: SiteParserProfile[] = [],
): FragmentTextTarget[] {
    if (!enabled || limit <= 0) return [];
    const collection: GenericProseCollection = {
        targets: [],
        seen: seenTextNodes(existingTargets),
        limit,
    };

    const extraExclude = profiles.map(p => p.exclude).filter(Boolean).join(',');

    const parserId = profiles.length === 1 ? profiles[0].id : 'safe-ui-chrome-parser';
    collectSafeUiChromeRootTargets(profileSafeUiChromeRoots(extraExclude), collection, extraExclude, parserId);
    collectSafeFormChromeRootTargets(safeFormChromeRoots(), collection, parserId);

    return collection.targets;
}

function collectSafeUiChromeTargets(limit: number, existingTargets: ScanTextTarget[] = []): FragmentTextTarget[] {
    if (limit <= 0) return [];
    const collection: GenericProseCollection = {
        targets: [],
        seen: seenTextNodes(existingTargets),
        limit,
    };

    collectSafeUiChromeRootTargets(safeUiChromeRoots(), collection);
    collectSafeFormChromeRootTargets(safeFormChromeRoots(), collection);

    return collection.targets;
}

function collectSafeUiChromeRootTargets(
    roots: HTMLElement[],
    collection: GenericProseCollection,
    extraExclude = '',
    parserId = 'safe-ui-chrome-parser',
): void {
    for (const root of roots) {
        collectSafeUiChromeTargetsFromRoot(root, collection, extraExclude, parserId);
        if (genericProseCollectionFull(collection)) break;
    }
}

function safeUiChromeRoots(): HTMLElement[] {
    return uniqueSpecificVisibleRoots(Array.from(document.querySelectorAll<HTMLElement>(SAFE_UI_CHROME_ROOTS))
        .filter(root => isUsefulSafeUiChromeRoot(root)));
}

function profileSafeUiChromeRoots(extraExclude = ''): HTMLElement[] {
    const roots = Array.from(document.querySelectorAll<HTMLElement>(PROFILE_SAFE_UI_CHROME_ROOTS))
        .filter(root => isUsefulSafeUiChromeRoot(root));
    if (!extraExclude) return uniqueSpecificVisibleRoots(roots);
    return uniqueSpecificVisibleRoots(roots.filter(root => !root.closest(extraExclude)));
}

function collectSafeUiChromeTargetsFromRoot(
    root: HTMLElement,
    collection: GenericProseCollection,
    extraExclude = '',
    parserId = 'safe-ui-chrome-parser',
): void {
    const baseExclude = safeUiChromeExcludeForRoot(root);
    const exclude = extraExclude ? `${baseExclude},${extraExclude}` : baseExclude;
    collectPassiveChromeTargetsFromRoot(root, collection, exclude, parserId, {
        allowUiText: true,
        includeUiChrome: true,
        includeTabChrome: true,
        includePassiveInteractions: true,
        heading: true,
        minLength: 1,
    });
}

function safeUiChromeExcludeForRoot(root: HTMLElement): string {
    return root.matches(SAFE_UI_CHROME_ARIA_MENU_ROOTS) || root.matches('[role="menubar"],[class*="menubar" i],[id*="menubar" i]')
        ? SAFE_UI_CHROME_ARIA_MENU_EXCLUDE
        : SAFE_UI_CHROME_EXCLUDE;
}

function collectSafeFormChromeRootTargets(
    roots: HTMLElement[],
    collection: GenericProseCollection,
    parserId = 'safe-ui-chrome-parser',
): void {
    for (const root of roots) {
        collectSafeFormChromeTargetsFromRoot(root, collection, parserId);
        if (genericProseCollectionFull(collection)) break;
    }
}

function safeFormChromeRoots(): HTMLElement[] {
    return uniqueVisibleRoots(Array.from(document.querySelectorAll<HTMLElement>(SAFE_FORM_CHROME_ROOTS))
        .filter(root => isUsefulSafeFormChromeRoot(root)));
}

function collectSafeFormChromeTargetsFromRoot(
    root: HTMLElement,
    collection: GenericProseCollection,
    parserId = 'safe-ui-chrome-parser',
): void {
    collectPassiveChromeTargetsFromRoot(root, collection, SAFE_FORM_CHROME_EXCLUDE, parserId, {
        allowUiText: true,
        includeFormChrome: true,
        includePassiveInteractions: true,
        heading: true,
        minLength: 1,
    });
}

function collectPassiveChromeTargetsFromRoot(
    root: HTMLElement,
    collection: GenericProseCollection,
    exclude: string,
    parserId: string,
    options: Parameters<typeof collectFragmentTextTargetsIn>[4],
): void {
    const collected = collectFragmentTextTargetsIn(root, genericProseRemaining(collection), true, exclude, options);
    for (const target of collected) {
        appendGenericProseTarget(collection.targets, collection.seen, {
            ...target,
            parserId,
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
    if (isResidualReaderParticleTarget(target)) return false;
    if (nodes.some(node => seen.has(node))) return false;
    nodes.forEach(node => seen.add(node));
    targets.push({ ...target, parserId: target.parserId ?? 'generic-prose-parser' });
    return true;
}

function isResidualReaderParticleTarget(target: FragmentTextTarget): boolean {
    const text = target.text.replace(/\s+/g, '');
    return /^[のはをがにでへもとやかねよな]$/u.test(text)
        && Boolean(target.parent.querySelector('.jpdb-reader-word'));
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
    const text = compactRootText(root);
    if (text.length < 12) return false;
    return hasJapaneseText(text);
}

function isUsefulSafeUiChromeRoot(root: HTMLElement): boolean {
    return isUsefulCompactJapaneseRoot(root, safeUiChromeExcludeForRoot(root), 2, SAFE_UI_CHROME_MAX_COMPACT_LENGTH);
}

function isUsefulSafeFormChromeRoot(root: HTMLElement): boolean {
    return isUsefulCompactJapaneseRoot(root, SAFE_FORM_CHROME_EXCLUDE, 1, SAFE_FORM_CHROME_MAX_COMPACT_LENGTH);
}

function isUsefulCompactJapaneseRoot(root: HTMLElement, exclude: string, minLength: number, maxLength: number): boolean {
    if (exclude && (safeElementMatches(root, exclude) || root.closest(exclude))) return false;
    if (!isVisibleSafeUiChromeRoot(root)) return false;
    const text = compactRootText(root);
    return hasJapaneseText(text) && text.length >= minLength && text.length <= maxLength;
}

function compactRootText(root: HTMLElement): string {
    return root.textContent?.replace(/\s+/g, '').trim() ?? '';
}

function hasJapaneseText(text: string): boolean {
    return /[\u3040-\u30ff\u3400-\u9fff]/u.test(text);
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

function uniqueSpecificVisibleRoots(roots: HTMLElement[]): HTMLElement[] {
    const unique: HTMLElement[] = [];
    for (const root of [...roots].sort((a, b) => elementDepth(b) - elementDepth(a))) {
        if (unique.some(existing => existing === root || existing.contains(root) || root.contains(existing))) continue;
        unique.push(root);
    }
    return unique.sort((a, b) => documentPositionOrder(a, b));
}

function elementDepth(element: Element): number {
    let depth = 0;
    for (let current = element.parentElement; current; current = current.parentElement) depth += 1;
    return depth;
}

function documentPositionOrder(a: Node, b: Node): number {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
}

function safeElementMatches(element: HTMLElement, selector: string): boolean {
    try {
        return element.matches(selector);
    } catch {
        return false;
    }
}
