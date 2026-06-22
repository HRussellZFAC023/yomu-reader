import {
    collectFormControlTextTargetsIn,
    collectFragmentTextTargetsIn,
    collectVisibleTextTargets,
    type FragmentTextTarget,
    type ScanTextTarget,
} from '../dom/index';
import { isYomuHostedPassivePage, isYomuHostedVideoPlayerPage, isYomuHostedPdfReaderPage } from './pages';

export interface SiteParserProfile {
    id: string;

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
    allowShortCenteredHeadings?: boolean;
    singlePassScan?: boolean;
    nonDestructive?: boolean;
    disableGenericDomScan?: boolean;
    includePassiveInteractionRoots?: boolean;
    /**
     * The site renders its own accurate, selectable Japanese text layer over the
     * page imagery (e.g. mokuro's pre-OCR'd `.textBox` overlays). When set, the
     * reader scans that native text instead of re-running image OCR on the same
     * artwork — re-OCR (Google Lens) both misses characters the native layer
     * already has and double-paints a competing overlay over the image.
     */
    providesTextLayer?: boolean;
    matches(url: URL): boolean;
}

interface GenericProseCollection {
    targets: FragmentTextTarget[];
    seen: Set<Text>;
    limit: number;
}

interface FragmentTargetAdmissionOptions {
    defaultParserId?: string;
    reject?: (target: FragmentTextTarget) => boolean;
    transform?: (target: FragmentTextTarget) => FragmentTextTarget;
}

const STRUCTURAL_EXCLUDE_ENTRIES = [
    '[data-jpdb-reader-root]',
    '.jpdb-reader-text-mirror',
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
    'details:not([open]) > :not(summary)',
    'details:not([open]) > :not(summary) *',
];
const COMMON_EXCLUDE = STRUCTURAL_EXCLUDE_ENTRIES.join(',');
const ASBPLAYER_ROOT_SELECTOR = '.asbplayer-offscreen, .asbplayer-subtitles-container-bottom';
const DEFAULT_SCAN_TARGET_LIMIT = Number.POSITIVE_INFINITY;
const RESIDUAL_VISIBLE_JAPANESE_PARSER_ID = 'residual-visible-japanese-parser';
const MOKURO_SCAN_ROOT_LIMIT = 160;
const MOKURO_SCAN_MARGIN_VIEWPORTS = 0.75;
const GENERIC_PROSE_ROOTS = [
    'main h1',
    '[role="main"] h1',
    'article',
    'main article',
    '[role="main"] article',
    '[role="article"]',
    // LLM/chat UIs often render assistant responses as markdown/message blocks
    // without article/prose tags. Keep these generic so new chat surfaces still
    // get normal reader rendering instead of requiring one-off site profiles.
    '.markdown',
    '.markdown-body',
    '.markdown-content',
    '.message',
    '.message-body',
    '.message-content',
    '.messageContent',
    '.chat-message',
    '.conversation-turn',
    '.model-response',
    '.model-response-text',
    '.response-content',
    '[data-message-author-role]',
    '[data-message-id]',
    '[data-testid*="conversation-turn" i]',
    '[data-testid*="chat-message" i]',
    '[data-testid*="message-content" i]',
    '[data-testid*="message-bubble" i]',
    '[data-test-id*="chat-message" i]',
    '[data-test-id*="message-content" i]',
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
    'label',
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
// The YouTube player's own caption/translation overlay is native chrome;
// annotating it double-renders the caption text (the "原文を見る（Googleによる翻訳）…"
// strip rendered twice) and fights the dedicated subtitle pipeline. Scoped to
// the caption window only — the player settings menu (画質/再生速度/字幕 …) is a
// sibling subtree and must still be scanned.
const YT_PLAYER_CHROME_EXCLUDE_ENTRIES = [
    '.ytp-caption-window-container',
    '.caption-window',
    '.captions-text',
];
const SAFE_UI_CHROME_EXCLUDE_ENTRIES = [
    ...STRUCTURAL_EXCLUDE_ENTRIES,
    ...YT_PLAYER_CHROME_EXCLUDE_ENTRIES,
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
    '.VPHero .text',
    '.VPHero .tagline',
    '.VPHero .main',
    '.VPHomeHero .heading',
    '.VPHomeHero .text',
    '.VPHomeHero .tagline',
    '.VPHomeHero .main',
    '.VPFeatures .item',
    '.yomu-install-panel',
    '.yomu-hosted-overflow-group',
    '.yomu-link-grid',
    '.vp-doc',
];
const YOMU_HOSTED_DOCS_EXCLUDE = [
    COMMON_EXCLUDE,
    '.VPHero .name',
    '.VPHomeHero .name',
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
const YOMU_PDF_READER_ROOTS = [
    // PDF.js paints each page to <canvas> for full fidelity and emits a
    // transparent, absolutely-positioned text layer aligned over it. That text
    // layer is the real selectable document text, so it is the reading surface
    // the runtime scans for popups, mining and furigana.
    '.textLayer',
    // App chrome so the Japanese UI gets the same lookup treatment.
    '.brand strong',
    '[data-yomu-pdf-empty] strong',
    '[data-yomu-pdf-empty] [data-status]',
    '.file-button',
    '[data-settings-trigger]',
    '[data-overflow-menu]',
];
const YOMU_PDF_READER_EXCLUDE = [
    COMMON_EXCLUDE,
    '.textLayer .endOfContent',
    '.textLayer span[role="img"]',
].join(',');
const YOUTUBE_CHROME_ROOTS = [
    'yt-chip-cloud-chip-renderer button',
    'yt-chip-cloud-chip-renderer [role="tab"]',
    'yt-chip-cloud-chip-view-model button',
    'yt-chip-cloud-chip-view-model [role="tab"]',
    'yt-chip-cloud-chip-view-model',
    'yt-tab-shape button',
    'yt-tab-shape [role="tab"]',
    'ytd-feed-filter-chip-bar-renderer chip-shape button',
    'ytd-feed-filter-chip-bar-renderer [role="tab"]',
    'yt-chip-cloud-renderer chip-shape button',
    'yt-chip-cloud-renderer [role="tab"]',
    'ytm-feed-filter-chip-bar-renderer button',
    'ytm-feed-filter-chip-bar-renderer [role="tab"]',
    'ytd-masthead yt-button-shape button',
    'ytd-masthead yt-button-view-model button',
    'ytd-masthead button-view-model button',
    'ytd-masthead button[aria-label]',
    'ytd-masthead ytd-searchbox',
    'ytd-masthead yt-searchbox',
    'ytd-masthead .ytSearchboxComponentInputBox',
    'ytd-masthead .ytSearchboxComponentSearchButton',
    'ytd-masthead .ytAttributedStringHost',
    'ytd-masthead yt-attributed-string',
    'ytd-masthead ~ ytd-mini-guide-renderer ytd-mini-guide-entry-renderer',
    'ytd-masthead ~ ytd-mini-guide-renderer yt-mini-guide-entry-renderer',
];
const YOUTUBE_TEXT_EXCLUDE = [
    COMMON_EXCLUDE,
    ...YT_PLAYER_CHROME_EXCLUDE_ENTRIES,
].join(',');
const YOUTUBE_WATCH_GUIDE_ROOTS = [
    'ytd-mini-guide-renderer',
    'ytd-guide-renderer',
];
const YOUTUBE_WATCH_GUIDE_EXCLUDE = [
    COMMON_EXCLUDE,
    ...YT_PLAYER_CHROME_EXCLUDE_ENTRIES,
].join(',');
const YOUTUBE_MOBILE_CHROME_ROOTS = [
    'ytm-pivot-bar-renderer',
    'ytm-pivot-bar-item-renderer',
    'ytm-mobile-topbar-renderer',
    'ytm-app-header',
    'ytm-searchbox',
    'ytm-shorts-player-controls',
    'ytm-slim-video-action-bar-renderer',
    'ytm-actions-renderer',
    'ytm-menu-renderer',
    'ytm-button-renderer',
    'ytm-toggle-button-renderer',
    'ytm-bottom-sheet-renderer',
    'ytm-engagement-panel-section-list-renderer',
    'ytm-reel-player-overlay-renderer',
    'ytm-shorts-video-title-view-model',
].join(',');
const YOUTUBE_PASSIVE_CHROME_SELECTOR = [
    YOUTUBE_MOBILE_CHROME_ROOTS,
    YOUTUBE_CHROME_ROOTS.join(','),
].join(',');
const YOUTUBE_COMMENT_CONTROL_SELECTORS = [
    'button',
    '[role="button"]',
    '[aria-controls]',
    '[aria-expanded]',
    '[slot*="button" i]',
    '[class*="button" i]',
];
const YOUTUBE_COMMENT_TEXT_AND_ACTION_ROOTS = [
    'ytd-comment-view-model #content-text',
    'ytm-comment-renderer #content-text',
    ...YOUTUBE_COMMENT_CONTROL_SELECTORS.map(selector => `ytd-comment-view-model ${selector}`),
    ...YOUTUBE_COMMENT_CONTROL_SELECTORS.map(selector => `ytm-comment-renderer ${selector}`),
].join(',');
const YOUTUBE_SYNTHETIC_TEXT_ROOTS = [
    'ytd-watch-info-text',
].join(',');
const YOUTUBE_WATCH_INFO_ARIA_PARTS = [
    '#view-count[aria-label]',
    '#date-text[aria-label]',
].join(',');
const GOOGLE_SEARCH_ROOTS = [
    '#botstuff',
    '#bres',
    '[data-attrid]',
    '[data-sokoban-container]',
    '.MjjYud',
    '.g',
    '.VwiC3b',
    '.LC20lb',
    '#search',
    '#rso',
    '#main',
    '#rcnt',
    '[role="main"]',
];
const GOOGLE_SEARCH_EXCLUDE = [
    COMMON_EXCLUDE,
    'g-img',
    'img',
].join(',');
const BLOOMEE_LANDING_HOSTS = new Set(['bloomeelife.com', 'www.bloomeelife.com']);
const BLOOMEE_LANDING_PARSER_ID = 'bloomee-landing-parser';
const BLOOMEE_LANDING_ROOTS = [
    '.point__itembox-headline',
    '.point__itembox-txt',
    '.cv-step__ttlbox-title',
    '.cv-step__catch',
    '.cv-step__itembox-title',
    '.life-lp-faq h2',
    '.life-lp-faq dt h3',
    '.lp-gift__headline',
    '.lp-gift__txt',
    '.ctaarea p',
].join(',');
const BOOKWALKER_STOREFRONT_HOSTS = new Set(['bookwalker.jp', 'www.bookwalker.jp']);
const BOOKWALKER_STOREFRONT_PARSER_ID = 'bookwalker-storefront-no-dom-parser';
export const SITE_PARSER_PROFILES: SiteParserProfile[] = [
    {
        id: YOMU_HOSTED_DOCS_PARSER_ID,
        roots: YOMU_HOSTED_DOCS_ROOTS,
        exclude: YOMU_HOSTED_DOCS_EXCLUDE,
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
        id: 'yomu-pdf-reader-parser',
        roots: YOMU_PDF_READER_ROOTS,
        exclude: YOMU_PDF_READER_EXCLUDE,
        allowUiText: true,
        heading: true,
        minLength: 1,
        includeUiChrome: true,
        includeFormChrome: true,
        // PDF.js paints an accurate selectable text layer over each page, so the
        // runtime reads that natively (popups/furigana/mining) and must NOT also
        // run Google Lens image-OCR over the same canvas — re-OCRing double-paints
        // a competing overlay over text that is already covered. Manual FAB OCR
        // still works for genuinely scanned pages with no text layer.
        providesTextLayer: true,
        matches: url => isYomuHostedPdfReaderPage(url.href),
    },
    {
        id: 'google-search-parser',
        roots: GOOGLE_SEARCH_ROOTS,
        exclude: GOOGLE_SEARCH_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        includeUiChrome: true,
        includeGenericPageText: true,
        plainScan: true,
        matches: url => /(^|\.)google\./i.test(url.hostname) && url.pathname === '/search',
    },
    {
        id: BLOOMEE_LANDING_PARSER_ID,
        roots: [BLOOMEE_LANDING_ROOTS],
        exclude: COMMON_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        heading: true,
        allowShortCenteredHeadings: true,
        matches: url => isBloomeeLandingUrl(url),
    },
    {
        id: BOOKWALKER_STOREFRONT_PARSER_ID,
        roots: [],
        disableGenericDomScan: true,
        includePassiveInteractionRoots: false,
        matches: url => isBookWalkerStorefrontUrl(url),
    },
    {
        id: JPDB_PARSER_ID,
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
            '.subsection-headword .subsection-spelling ruby.v',
            '.subsection-spelling',
            '.primary-spelling',
        ].join(','),
        allowUiText: true,
        minLength: 1,
        matches: url => url.hostname === 'jpdb.io' || url.hostname.endsWith('.jpdb.io'),
    },
    {
        id: 'jisho-parser',
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
        roots: ['#main', '#mainContents', '.mainBlock', '.NetDicBody', '.kiji', 'main', 'article'],
        exclude: DICTIONARY_SITE_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        matches: url => url.hostname === 'weblio.jp' || url.hostname.endsWith('.weblio.jp'),
    },
    {
        id: 'kotobank-parser',
        roots: ['main', 'article', '.description', '.ex.cf', '.dictype', '.articleBody'],
        exclude: DICTIONARY_SITE_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        matches: url => url.hostname === 'kotobank.jp' || url.hostname.endsWith('.kotobank.jp'),
    },
    {
        id: 'takoboto-parser',
        roots: ['#SearchResultList', '#results', '#main', '.result', '.entry', 'main', 'article'],
        exclude: DICTIONARY_SITE_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        fallbackToWholePage: true,
        matches: url => url.hostname === 'takoboto.jp' || url.hostname.endsWith('.takoboto.jp'),
    },
    {
        id: 'wiktionary-ja-parser',
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
        roots: ['.lunatranslator_clickword', '.lunatranslator_text_all', '.origin'],
        matches: url => url.protocol === 'file:' && /LunaTranslator.*(?:mainui|transhist)\.html/i.test(decodeURIComponent(url.pathname)),
    },
    {
        id: 'texthooker-parser',
        roots: ['#textlog', 'main', '.textline', '.line_box', '.my-2.cursor-pointer', 'p'],
        matches: url => /^(anacreondjt\.gitlab\.io|learnjapanese\.moe)$/.test(url.hostname)
            || url.hostname === 'renji-xd.github.io'
            || /\/texthooker\/?$/.test(url.pathname),
    },
    {
        id: 'exstatic-parser',
        roots: ['.sentence-entry', '#entry_holder'],
        matches: url => url.hostname === 'kamwithk.github.io' && url.pathname.endsWith('/exSTATic/tracker.html'),
    },
    {
        id: 'readwok-parser',
        roots: ['div[class*="styles_paragraph_"]', 'div[class*="styles_reader_"]'],
        matches: url => url.hostname === 'app.readwok.com',
    },
    {
        id: 'ttsu-parser',
        roots: ['div.book-content', 'div.book-content-container', '#book-content'],
        matches: url => url.hostname === 'reader.ttsu.app',
    },
    {
        id: 'tadoku-parser',
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
        id: 'youtube-live-chat-frame-parser',
        roots: [
            'yt-live-chat-text-message-renderer #author-name',
            'yt-live-chat-text-message-renderer #message',
            'yt-live-chat-paid-message-renderer #author-name',
            'yt-live-chat-paid-message-renderer #message',
            'yt-live-chat-membership-item-renderer #author-name',
            'yt-live-chat-membership-item-renderer #message',
            'yt-live-chat-header-renderer #title',
            'yt-live-chat-header-renderer #primary-content',
            'yt-live-chat-renderer #chat-messages',
            'yt-live-chat-viewer-engagement-message-renderer #content',
            'yt-live-chat-viewer-engagement-message-renderer #message',
            'yt-live-chat-viewer-engagement-message-renderer yt-formatted-string',
            'yt-live-chat-viewer-engagement-message-renderer',
            'yt-live-chat-banner-renderer',
            'yt-live-chat-restricted-participation-renderer',
            'yt-live-chat-ticker-renderer',
            'body',
        ],
        exclude: COMMON_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        includeUiChrome: true,
        singlePassScan: true,
        nonDestructive: true,
        includePassiveInteractionRoots: false,
        scanLimit: 80,
        matches: url => (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com'))
            && url.pathname === '/live_chat',
    },
    {
        id: 'youtube-comments-parser',
        roots: [
            // High-value watch text comes first so huge virtualized grids or
            // recommendation rails cannot starve the visible title,
            // description, transcript panel, or watch sidebar inside one
            // capped scan pass.
            'ytd-transcript-segment-renderer',
            'ytm-transcript-segment-renderer',
            'ytd-watch-metadata h1',
            'ytd-watch-metadata #title',
            'ytd-watch-metadata #owner',
            'ytd-watch-metadata #info',
            'ytd-watch-metadata #info-strings',
            'ytd-watch-metadata #info-container',
            'ytd-watch-metadata #info-text',
            'ytd-watch-info-text',
            'ytd-watch-metadata #metadata',
            'ytd-watch-metadata #metadata-line',
            'ytd-watch-metadata #teaser-carousel',
            'ytd-watch-metadata yt-video-metadata-carousel-view-model',
            'ytd-watch-metadata yt-carousel-title-view-model',
            'ytd-watch-metadata yt-text-carousel-item-view-model',
            'ytd-watch-metadata .ytAttributedStringHost',
            'ytd-watch-metadata #description-inline-expander',
            'ytd-watch-metadata #description yt-attributed-string',
            'ytd-watch-metadata #description .yt-core-attributed-string',
            'ytd-watch-metadata #description-text',
            'ytd-watch-metadata ytd-text-inline-expander',
            'ytd-watch-metadata #attributed-snippet-text',
            'ytd-watch-metadata #attributed-description-text',
            'ytd-watch-metadata yt-attributed-string#attributed-description-text',
            'ytm-slim-video-metadata-section-renderer h1',
            'ytm-slim-video-metadata-section-renderer #title',
            'ytm-expandable-video-description-body-renderer',
            'ytm-structured-description-content-renderer',
            YOUTUBE_COMMENT_TEXT_AND_ACTION_ROOTS,
            'ytd-watch-next-secondary-results-renderer #video-title',
            '#secondary ytd-compact-video-renderer #video-title',
            '#secondary ytd-compact-video-renderer',
            'ytd-compact-video-renderer #video-title',
            'ytd-compact-video-renderer',
            'yt-live-chat-text-message-renderer #author-name',
            'yt-live-chat-text-message-renderer #message',
            'yt-live-chat-paid-message-renderer #author-name',
            'yt-live-chat-paid-message-renderer #message',
            'yt-live-chat-membership-item-renderer #author-name',
            'yt-live-chat-membership-item-renderer #message',
            'yt-live-chat-header-renderer #title',
            'yt-live-chat-header-renderer #primary-content',
            'yt-live-chat-renderer #chat-messages',
            'yt-live-chat-viewer-engagement-message-renderer #content',
            'yt-live-chat-viewer-engagement-message-renderer #message',
            'yt-live-chat-viewer-engagement-message-renderer yt-formatted-string',
            'yt-live-chat-viewer-engagement-message-renderer',
            'yt-live-chat-banner-renderer',
            'yt-live-chat-restricted-participation-renderer',
            'yt-live-chat-ticker-renderer',
            'ytd-live-chat-frame #show-hide-button',
            'ytd-live-chat-frame #header',
            'ytd-live-chat-frame #panel-pages',
            'ytd-live-chat-frame yt-formatted-string',
            YOUTUBE_MOBILE_CHROME_ROOTS,
            ...YOUTUBE_CHROME_ROOTS,
            'ytd-watch-next-secondary-results-renderer',
            // General feed/search grids are useful, but lower priority because
            // YouTube can hydrate hundreds of them.
            'ytd-rich-grid-renderer',
            'ytd-rich-item-renderer',
            'ytd-video-renderer',
            'yt-lockup-view-model',
            'ytm-rich-grid-renderer',
            'ytm-video-with-context-renderer',
            'ytm-shorts-lockup-view-model',
            'ytm-shorts-lockup-view-model-v2',
            'ytm-item-section-renderer',
        ],
        exclude: YOUTUBE_TEXT_EXCLUDE,
        allowUiText: true,
        visibleOnly: false,
        includeUiChrome: true,
        singlePassScan: true,
        nonDestructive: true,
        includePassiveInteractionRoots: true,
        matches: url => url.hostname === 'youtube.com'
            || url.hostname.endsWith('.youtube.com')
            || url.hostname === 'youtu.be',
    },
    {
        id: 'youtube-watch-guide-parser',
        roots: YOUTUBE_WATCH_GUIDE_ROOTS,
        exclude: YOUTUBE_WATCH_GUIDE_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        includeUiChrome: true,
        singlePassScan: true,
        nonDestructive: true,
        includePassiveInteractionRoots: false,
        matches: url => (url.hostname === 'youtube.com'
            || url.hostname.endsWith('.youtube.com')
            || url.hostname === 'youtu.be')
            && url.pathname === '/watch',
    },
    {
        id: 'youtube-chrome-parser',
        roots: YOUTUBE_CHROME_ROOTS,
        exclude: YOUTUBE_TEXT_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        includeUiChrome: true,
        singlePassScan: true,
        nonDestructive: true,
        includePassiveInteractionRoots: true,
        matches: url => url.hostname === 'youtube.com'
            || url.hostname.endsWith('.youtube.com')
            || url.hostname === 'youtu.be',
    },
    {
        id: 'cijapanese-transcript-parser',
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
        roots: ['.textBox', '#manga-panel .textBox', '#pagesContainer .textBox', '.volume-card__title'],
        allowUiText: true,
        minLength: 1,
        mergeBlockFragments: true,
        visibleOnly: false,
        scanLimit: 80,
        disableGenericDomScan: true,
        includePassiveInteractionRoots: false,
        providesTextLayer: true,
        matches: url => url.hostname === 'reader.mokuro.app'
            || url.hostname === 'mokuro.moe' || url.hostname.endsWith('.mokuro.moe')
            || (url.protocol === 'file:' && /mokuro/i.test(decodeURIComponent(url.pathname))),
    },
    {
        id: 'wikipedia-parser',
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
        roots: ['#article-content'],
        exclude: [COMMON_EXCLUDE, '.fg', '.wpr'].join(','),
        allowUiText: true,
        minLength: 1,
        matches: url => url.hostname.endsWith('.satorireader.com') && url.pathname.includes('/articles/'),
    },
    {
        id: 'nhk-parser',
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
        roots: ['article', 'div.mx-auto', '[id^="study-question-"]'],
        matches: url => url.hostname === 'bunpro.jp' || url.hostname.endsWith('.bunpro.jp'),
    },
    {
        id: 'asbplayer-parser',
        roots: ['.asbplayer-offscreen', '.asbplayer-subtitles-container-bottom'],
        matches: () => Boolean(document.querySelector(ASBPLAYER_ROOT_SELECTOR)),
    },
];

export function getMatchingSiteParsers(href = window.location.href): SiteParserProfile[] {
    const url = new URL(href, window.location.href);
    return SITE_PARSER_PROFILES.filter(profile => profile.matches(url));
}

export function isBookWalkerStorefrontPage(href = location.href): boolean {
    return isBookWalkerStorefrontUrl(new URL(href, window.location.href));
}

function isBloomeeLandingUrl(url: URL): boolean {
    return BLOOMEE_LANDING_HOSTS.has(url.hostname.toLowerCase())
        && (url.pathname === '/' || url.pathname === '')
        && Boolean(document.querySelector('.life-top-page-wrap,.home-index,.point__itembox-headline,.cv-step,.ctaarea'));
}

function isBookWalkerStorefrontUrl(url: URL): boolean {
    return BOOKWALKER_STOREFRONT_HOSTS.has(url.hostname.toLowerCase());
}

/**
 * True when a matching site parser already supplies an accurate native Japanese
 * text layer that the reader should use instead of running image OCR. For most
 * such sites this is static, but for mokuro it follows mokuro's own "OCR
 * enabled" setting: when the user turns mokuro OCR off (or it is off by
 * default), mokuro stops rendering its text boxes, so the reader runs its own
 * image OCR — which is sharper and more touch-friendly than mokuro's built-in
 * engine — instead.
 */
export function siteProvidesNativeTextLayer(href = window.location.href): boolean {
    return getMatchingSiteParsers(href).some(profile => {
        if (!profile.providesTextLayer) return false;
        if (profile.id === 'mokuro-parser') return mokuroDisplayOcrEnabled();
        return true;
    });
}

/**
 * Read mokuro's own "OCR enabled" (displayOCR) toggle from the page. mokuro
 * stores per-profile settings in localStorage `profiles`, keyed by the active
 * `currentProfile`. Defaults to enabled when the state cannot be read so we
 * never hide an established mokuro setup unexpectedly.
 */
export function mokuroDisplayOcrEnabled(): boolean {
    try {
        if (typeof localStorage === 'undefined') return true;
        const raw = localStorage.getItem('profiles');
        if (!raw) return true;
        const profiles = JSON.parse(raw) as Record<string, { displayOCR?: boolean } | undefined>;
        const currentRaw = localStorage.getItem('currentProfile') ?? '';
        let current = currentRaw;
        try { current = JSON.parse(currentRaw); } catch { /* plain string profile name */ }
        const profile = profiles[current] ?? profiles[currentRaw] ?? Object.values(profiles)[0];
        return profile?.displayOCR !== false;
    } catch {
        return true;
    }
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
    if (profile.id === 'youtube-comments-parser') collectYouTubeSyntheticTextTargets(profile, context);
    for (const root of queryParserRoots(profile)) {
        if (!siteScanHasRoom(context)) break;
        collectRootScanTargets(profile, root, context);
    }
    if (profile.includePassiveInteractionRoots !== false) {
        collectProfilePassiveInteractionTargets(profile, context);
    }
}

function collectYouTubeSyntheticTextTargets(profile: SiteParserProfile, context: SiteScanContext): void {
    const roots = uniqueVisibleRoots(Array.from(document.querySelectorAll<HTMLElement>(YOUTUBE_SYNTHETIC_TEXT_ROOTS)));
    for (const root of roots) {
        if (!siteScanHasRoom(context)) break;
        if (context.targets.some(target => target.parent === root)) continue;
        const text = syntheticYouTubeElementText(root);
        if (!text || !hasJapaneseText(text)) continue;
        context.targets.push(siteScanTargetWithProfileOptions(profile, {
            text,
            parent: root,
            fragments: [],
            layoutSensitive: true,
        }));
    }
}

function syntheticYouTubeElementText(root: HTMLElement): string {
    if (root.matches('ytd-watch-info-text')) return syntheticYouTubeWatchInfoText(root);
    for (const text of [
        root.getAttribute('aria-label'),
        root.getAttribute('title'),
        root.innerText,
        root.textContent,
    ]) {
        const normalized = text?.replace(/\s+/g, ' ').trim();
        if (normalized && hasJapaneseText(normalized)) return normalized;
    }
    return '';
}

function syntheticYouTubeWatchInfoText(root: HTMLElement): string {
    const parts = Array.from(root.querySelectorAll<HTMLElement>(YOUTUBE_WATCH_INFO_ARIA_PARTS))
        .map(element => normalizedAttributeText(element, 'aria-label'))
        .filter((text): text is string => Boolean(text));
    const text = parts.join(' • ');
    if (hasJapaneseText(text)) return text;
    for (const attribute of ['aria-label', 'title']) {
        const fallback = normalizedAttributeText(root, attribute);
        if (fallback && hasJapaneseText(fallback)) return fallback;
    }
    return '';
}

function normalizedAttributeText(element: HTMLElement, attribute: string): string {
    return element.getAttribute(attribute)?.replace(/\s+/g, ' ').trim() ?? '';
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
        allowShortCenteredHeadings: profile.allowShortCenteredHeadings,
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
    return appendAdmittedFragmentTarget(context.targets, context.seen, target, {
        transform: candidate => siteScanTargetWithProfileOptions(profile, candidate),
    });
}

function siteScanTargetWithProfileOptions(profile: SiteParserProfile, target: FragmentTextTarget): FragmentTextTarget {
    const suppressRuby = shouldSuppressSiteScanRuby(profile, target);
    const targetSuppressRuby = isYouTubeSiteParserProfile(profile) ? false : target.suppressRuby;
    const youtubePassiveChrome = isYouTubeSiteParserProfile(profile)
        && Boolean(target.parent.closest(YOUTUBE_PASSIVE_CHROME_SELECTOR));
    const youtubeCommentBody = isYouTubeCommentBodyTarget(profile, target.parent);
    const baseTarget = {
        ...target,
        parserId: profile.id,
        suppressRuby: targetSuppressRuby || suppressRuby || undefined,
        passiveInteraction: target.passiveInteraction || target.suppressRuby || suppressRuby || youtubePassiveChrome || undefined,
        singlePassScan: profile.singlePassScan || undefined,
        nonDestructive: siteScanTargetUsesNonDestructive(profile, youtubeCommentBody) || undefined,
        forceInlineRender: youtubeCommentBody || undefined,
    };
    return profile.plainScan ? plainScanTarget(baseTarget) : baseTarget;
}

function siteScanTargetUsesNonDestructive(profile: SiteParserProfile, youtubeCommentBody = false): boolean {
    if (!profile.nonDestructive) return false;
    return !youtubeCommentBody;
}

function isYouTubeCommentBodyTarget(profile: SiteParserProfile, parent: HTMLElement): boolean {
    if (profile.id !== 'youtube-comments-parser') return false;
    const content = parent.closest<HTMLElement>('#content-text');
    if (content?.closest('ytd-comment-view-model, ytm-comment-renderer')) return true;
    return parent.matches('ytd-comment-view-model, ytm-comment-renderer')
        && Boolean(parent.querySelector('#content-text'));
}

function isYouTubeSiteParserProfile(profile: SiteParserProfile): boolean {
    return profile.id === 'youtube-comments-parser'
        || profile.id === 'youtube-chrome-parser'
        || profile.id === 'youtube-watch-guide-parser'
        || profile.id === 'youtube-live-chat-parser';
}

function shouldSuppressSiteScanRuby(profile: SiteParserProfile, target: FragmentTextTarget): boolean {
    if (profile.id === JPDB_PARSER_ID) return isJpdbReviewPromptTarget(target.parent, target.text);
    if (profile.id === 'jiten-parser') return isJitenStudyPromptTarget(target.parent, target.text);
    return false;
}

function isJpdbReviewPromptTarget(parent: HTMLElement, text: string): boolean {
    if (location.hostname !== 'jpdb.io' || !location.pathname.startsWith('/review')) return false;
    if (compactTextLength(text) > 18) return false;
    const prompt = parent.closest<HTMLElement>('.review-card, .answer-box, .prompt, .spelling, .kanji, .vocabulary-spelling');
    if (!prompt) return false;
    return !parent.closest('.subsection-examples, .subsection-meanings, .subsection-usages, .subsection-immersion-kit');
}

function isJitenStudyPromptTarget(parent: HTMLElement, text: string): boolean {
    if (!isJitenStudyPath() || compactTextLength(text) > 18) return false;
    const prompt = parent.closest<HTMLElement>('[lang="ja"]');
    if (!prompt || !prompt.classList.contains('font-noto-sans')) return false;
    if (!hasPromptTextSizeClass(prompt)) return false;
    return Boolean(prompt.closest('.flex.items-center.justify-center'));
}

function isJitenStudyPath(): boolean {
    return (location.hostname === 'jiten.moe' || location.hostname.endsWith('.jiten.moe'))
        && location.pathname.startsWith('/srs/study');
}

function hasPromptTextSizeClass(element: HTMLElement): boolean {
    return Array.from(element.classList).some(className =>
        className === 'text-4xl'
        || className === 'text-5xl'
        || className === 'text-6xl'
        || className.endsWith(':text-4xl')
        || className.endsWith(':text-5xl')
        || className.endsWith(':text-6xl'),
    );
}

function compactTextLength(text: string): number {
    return text.replace(/\s+/g, '').length;
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
    if (matchingProfiles.some(profile => profile.disableGenericDomScan)) {
        return withResidualVisibleJapaneseTargets(baseTargets, effectiveLimit, matchingProfiles);
    }
    const profileUiChromeTargets = collectProfileSafeUiChromeTargets(effectiveLimit - baseTargets.length, baseTargets, matchingProfiles.length > 0, matchingProfiles);
    if (siteTargets && !hasGenericPageTextFallback(matchingProfiles)) {
        return [...baseTargets, ...profileUiChromeTargets];
    }
    const genericTargets = collectGenericProseTargets(effectiveLimit - baseTargets.length - profileUiChromeTargets.length, [...baseTargets, ...profileUiChromeTargets]);
    const uiChromeTargets = collectSafeUiChromeTargets(
        effectiveLimit - baseTargets.length - profileUiChromeTargets.length - genericTargets.length,
        [...baseTargets, ...profileUiChromeTargets, ...genericTargets],
    );
    const collectedTargets = [...baseTargets, ...profileUiChromeTargets, ...genericTargets, ...uiChromeTargets];
    const targetsWithResidual = withResidualVisibleJapaneseTargets(collectedTargets, effectiveLimit, matchingProfiles);
    if (targetsWithResidual.length) return targetsWithResidual;

    const broadTargets = collectWholePageScanTargets(effectiveLimit);
    const broadWithResidual = withResidualVisibleJapaneseTargets(broadTargets, effectiveLimit, matchingProfiles);
    if (broadWithResidual.length) return broadWithResidual;
    return collectVisibleTextTargets(effectiveLimit);
}

function withResidualVisibleJapaneseTargets(
    targets: ScanTextTarget[],
    effectiveLimit: number,
    profiles: SiteParserProfile[],
): ScanTextTarget[] {
    const remaining = effectiveLimit - targets.length;
    if (remaining <= 0) return targets;
    const residual = collectResidualVisibleJapaneseTargets(remaining, targets, profiles);
    return residual.length ? [...targets, ...residual] : targets;
}

function collectResidualVisibleJapaneseTargets(
    limit: number,
    existingTargets: ScanTextTarget[],
    profiles: SiteParserProfile[],
    _href = window.location.href,
): FragmentTextTarget[] {
    if (limit <= 0 || !document.body) return [];
    const collection: GenericProseCollection = {
        targets: [],
        seen: seenTextNodes(existingTargets),
        limit,
    };
    const candidateLimit = residualVisibleJapaneseCandidateLimit(limit, existingTargets.length);
    const collected = collectFragmentTextTargetsIn(document.body, candidateLimit, true, residualVisibleJapaneseExcludeSelector(profiles), {
        allowUiText: true,
        includeUiChrome: true,
        includeFormChrome: true,
        includeTabChrome: true,
        includePassiveInteractions: true,
        heading: true,
        minLength: 1,
    });
    for (const target of collected) {
        appendGenericProseTarget(collection.targets, collection.seen, {
            ...target,
            parserId: RESIDUAL_VISIBLE_JAPANESE_PARSER_ID,
        });
        if (genericProseCollectionFull(collection)) break;
    }
    return collection.targets;
}

function residualVisibleJapaneseCandidateLimit(limit: number, existingTargetCount: number): number {
    if (!Number.isFinite(limit)) return limit;
    return Math.max(limit, existingTargetCount + limit + 24);
}

function residualVisibleJapaneseExcludeSelector(profiles: SiteParserProfile[]): string {
    const entries = [COMMON_EXCLUDE];
    if (profiles.some(isYouTubeSiteParserProfile)) {
        entries.push(...YT_PLAYER_CHROME_EXCLUDE_ENTRIES);
    }
    if (profiles.some(profile => profile.id === JPDB_PARSER_ID)) {
        entries.push('.subsection-spelling.with-furigana > :not(.primary-spelling)');
    }
    return entries.join(',');
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
    const nonDestructive = profiles.some(profile => profile.nonDestructive);
    collectSafeUiChromeRootTargets(profileSafeUiChromeRoots(extraExclude), collection, extraExclude, parserId, nonDestructive);
    collectSafeFormChromeRootTargets(safeFormChromeRoots(), collection, parserId, nonDestructive);
    collectSafeFormControlTextTargets(collection, extraExclude);

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
    collectSafeFormControlTextTargets(collection);

    return collection.targets;
}

function collectSafeFormControlTextTargets(
    collection: GenericProseCollection,
    extraExclude = '',
): void {
    const targets = collectFormControlTextTargetsIn(document.body, genericProseRemaining(collection), true, {
        excludeSelector: extraExclude,
    });
    for (const target of targets) {
        collection.targets.push(target);
        if (genericProseCollectionFull(collection)) break;
    }
}

function collectSafeUiChromeRootTargets(
    roots: HTMLElement[],
    collection: GenericProseCollection,
    extraExclude = '',
    parserId = 'safe-ui-chrome-parser',
    nonDestructive = false,
): void {
    for (const root of roots) {
        collectSafeUiChromeTargetsFromRoot(root, collection, extraExclude, parserId, nonDestructive);
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
    nonDestructive = false,
): void {
    const baseExclude = safeUiChromeExcludeForRoot(root);
    const exclude = extraExclude ? `${baseExclude},${extraExclude}` : baseExclude;
    collectPassiveChromeTargetsFromRoot(root, collection, exclude, parserId, nonDestructive, {
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
    nonDestructive = false,
): void {
    for (const root of roots) {
        collectSafeFormChromeTargetsFromRoot(root, collection, parserId, nonDestructive);
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
    nonDestructive = false,
): void {
    collectPassiveChromeTargetsFromRoot(root, collection, SAFE_FORM_CHROME_EXCLUDE, parserId, nonDestructive, {
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
    nonDestructive: boolean,
    options: Parameters<typeof collectFragmentTextTargetsIn>[4],
): void {
    const collected = collectFragmentTextTargetsIn(root, genericProseRemaining(collection), true, exclude, options);
    for (const target of collected) {
        appendGenericProseTarget(collection.targets, collection.seen, {
            ...target,
            parserId,
            passiveInteraction: true,
            nonDestructive: nonDestructive || undefined,
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

function appendGenericProseTarget(
    targets: FragmentTextTarget[],
    seen: Set<Text>,
    target: FragmentTextTarget,
    options?: Pick<FragmentTargetAdmissionOptions, 'reject'>,
): boolean {
    const admissionOptions: FragmentTargetAdmissionOptions = { defaultParserId: 'generic-prose-parser' };
    if (options?.reject) admissionOptions.reject = options.reject;
    return appendAdmittedFragmentTarget(targets, seen, target, admissionOptions);
}

function appendAdmittedFragmentTarget(
    targets: FragmentTextTarget[],
    seen: Set<Text>,
    target: FragmentTextTarget,
    options: FragmentTargetAdmissionOptions = {},
): boolean {
    const nodes = textNodesForFragmentTarget(target);
    if (!nodes.length || nodes.some(node => seen.has(node))) return false;
    if (options.reject?.(target)) return false;
    if (isResidualReaderParticleTarget(target)) return false;
    if (isResidualJpdbAlternateSpellingTarget(target)) return false;
    nodes.forEach(node => seen.add(node));
    const admittedTarget = options.transform
        ? options.transform(target)
        : { ...target, parserId: target.parserId ?? options.defaultParserId };
    targets.push(admittedTarget);
    return true;
}

function isResidualReaderParticleTarget(target: FragmentTextTarget): boolean {
    const text = target.text.replace(/\s+/g, '');
    return /^[のはをがにでへもとやかねよな]$/u.test(text)
        && Boolean(target.parent.querySelector('.jpdb-reader-word'));
}

function isResidualJpdbAlternateSpellingTarget(target: FragmentTextTarget): boolean {
    const spelling = target.parent.closest('.subsection-spelling.with-furigana');
    return Boolean(spelling && !target.parent.closest('.primary-spelling'));
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
    const unique = uniqueVisibleRoots(roots);
    return profile.id === 'mokuro-parser' ? nearestMokuroRoots(unique) : unique;
}

function nearestMokuroRoots(roots: HTMLElement[]): HTMLElement[] {
    const margin = mokuroScanViewportMargin();
    return roots
        .filter(root => isElementNearViewport(root, margin))
        .sort((a, b) => elementViewportDistance(a) - elementViewportDistance(b) || documentPositionOrder(a, b))
        .slice(0, MOKURO_SCAN_ROOT_LIMIT);
}

function mokuroScanViewportMargin(): number {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const height = window.innerHeight || document.documentElement.clientHeight || 0;
    return Math.max(width, height) * MOKURO_SCAN_MARGIN_VIEWPORTS;
}

function isElementNearViewport(element: Element, margin: number): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return rect.bottom >= -margin
        && rect.top <= window.innerHeight + margin
        && rect.right >= -margin
        && rect.left <= window.innerWidth + margin;
}

function elementViewportDistance(element: Element): number {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return Number.POSITIVE_INFINITY;
    const dx = rect.right < 0 ? -rect.right : rect.left > window.innerWidth ? rect.left - window.innerWidth : 0;
    const dy = rect.bottom < 0 ? -rect.bottom : rect.top > window.innerHeight ? rect.top - window.innerHeight : 0;
    return Math.hypot(dx, dy);
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
