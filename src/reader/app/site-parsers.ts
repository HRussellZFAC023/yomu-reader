import {
    HAS_JAPANESE,
    classifyDecoration,
    collectFormControlTextTargetsIn,
    collectFragmentTextTargetsIn,
    drainDepthCappedShadowHosts,
    collectVisibleTextTargets,
    isYouTubeHost,
    textMirrorAlreadyRenders,
    type FragmentTextTarget,
    type ScanTextTarget,
} from '../dom/index';
import { isYomuHostedPassivePage, isYomuHostedVideoPlayerPage, isYomuHostedPdfReaderPage } from './pages';
import { annotationScopeActive, queryWithinAnnotationScope, scanScopeRoots } from './annotation-scope';
import { isJitenStudyFrontPrompt } from '../jiten/jiten-page-targets';
import { isJpdbReviewFrontPrompt } from '../jpdb/jpdb-page-targets';
import { isYouTubeAppHostname } from './youtube-host';
import { isBunproReviewFrontPrompt } from '../bunpro/page-targets';

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
    suppressResidualVisibleScan?: boolean;
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
    skipMirroredHosts?: boolean;
    candidateHeadroom?: number;
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
const PROFILE_PHASE_GENERIC_RESERVE_THRESHOLD = 40;
const PROFILE_PHASE_GENERIC_RESERVE_RATIO = 0.3;
const PROFILE_PHASE_GENERIC_RESERVE_MAX = 64;
const GENERIC_UI_CHROME_TARGET_MAX = 48;
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
// Text peers that component libraries place beside their actual control.
// They are roots only inside an already-bounded UI scope; DecorationPolicy
// still decides whether each target is passive chrome or real content.
const SAFE_UI_CHROME_PEER_TEXT_SELECTORS = [
    '[role="heading"]',
    '[class*="label" i]',
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
        [...SAFE_UI_CHROME_CONTROL_SELECTORS, ...SAFE_UI_CHROME_PEER_TEXT_SELECTORS]
            .map(control => `${scope} ${control}`)
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
    // Timestamps are compact interactive metadata on feed cards. Keep them in
    // the reserved chrome slice so long Reddit/YouTube feeds cannot exhaust
    // the prose budget before relative Japanese times are reached.
    'time',
    '[datetime]',
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
// Hosted docs annotate only declared Reader Surfaces. In English mode those
// are just the demo surfaces; in Japanese mode the theme also declares the
// whole #VPContent column plus the nav/sidebar chrome, whose translated menu
// labels are ordinary Japanese vocabulary. Chrome only annotates when the
// theme declares it a surface, so the old blanket-scan long tasks (~14s cold
// first hover before the page-owned annotation scope existed) cannot return.
const YOMU_HOSTED_DOCS_ROOTS = [
    '[data-yomu-runtime-surface]',
    '.yomu-try-me-text',
];
const YOMU_HOSTED_DOCS_EXCLUDE = [
    COMMON_EXCLUDE,
    '.yomu-hosted-overflow-group',
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
const YOMU_PDF_READER_MIN_TEXT_LENGTH = 8;
const YOUTUBE_TEXT_EXCLUDE = [
    COMMON_EXCLUDE,
    ...YT_PLAYER_CHROME_EXCLUDE_ENTRIES,
].join(',');
const YOUTUBE_STABLE_TEXT_HOST_SELECTOR = [
    'yt-formatted-string',
    'yt-attributed-string',
    '.ytAttributedStringHost',
    '.yt-core-attributed-string',
    '.yt-core-attributed-string--white-space-pre-wrap',
].join(',');
const YOUTUBE_VOLATILE_WATCH_METADATA_SELECTOR = [
    'ytd-watch-metadata #owner-sub-count',
    'ytd-watch-metadata #owner #subscribe-button',
    'ytd-watch-metadata #owner button',
    'ytd-watch-metadata ytd-video-description-transcript-section-renderer',
    'ytd-watch-metadata ytd-video-description-infocards-section-renderer',
    'ytd-watch-metadata ytd-video-description-music-section-renderer',
    'ytd-watch-metadata ytd-video-description-course-section-renderer',
    'ytd-watch-metadata #description ytd-channel-name',
    'ytd-watch-metadata #description #owner-sub-count',
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
    // Current m.youtube comment sheets no longer expose #content-text: root
    // the whole thread/renderer so bodies, author handles, and timestamps are
    // all collected regardless of YouTube's inner markup of the week.
    'ytm-comment-thread-renderer',
    'ytm-comment-renderer',
    'ytm-comment-replies-renderer',
    ...YOUTUBE_COMMENT_CONTROL_SELECTORS.map(selector => `ytd-comment-view-model ${selector}`),
    ...YOUTUBE_COMMENT_CONTROL_SELECTORS.map(selector => `ytm-comment-renderer ${selector}`),
].join(',');
const YOUTUBE_COMMENT_HEADER_ROOTS = [
    'ytd-comments-header-renderer #title',
    'ytd-comments-header-renderer #count',
    'ytd-comments-header-renderer .count-text',
    'ytm-comments-header-renderer',
    'ytm-comment-section-header-renderer',
    'ytm-comments-entry-point-header-renderer',
].join(',');
const YOUTUBE_SYNTHETIC_TEXT_ROOTS = [
    'ytd-watch-info-text',
].join(',');
const YOUTUBE_WATCH_INFO_ARIA_PARTS = [
    '#view-count[aria-label]',
    '#date-text[aria-label]',
].join(',');
const YOUTUBE_LIVE_CHAT_TEXT_ROOTS = [
    'yt-live-chat-text-message-renderer #author-name',
    'yt-live-chat-text-message-renderer #message',
    'yt-live-chat-paid-message-renderer #author-name',
    'yt-live-chat-paid-message-renderer #message',
    'yt-live-chat-membership-item-renderer #author-name',
    'yt-live-chat-membership-item-renderer #message',
    'yt-live-chat-header-renderer #title',
    'yt-live-chat-header-renderer #primary-content',
    'yt-live-chat-viewer-engagement-message-renderer #content',
    'yt-live-chat-viewer-engagement-message-renderer #message',
    'yt-live-chat-viewer-engagement-message-renderer yt-formatted-string',
    'yt-live-chat-viewer-engagement-message-renderer a[href]',
    'yt-live-chat-viewer-engagement-message-renderer button',
    'yt-live-chat-viewer-engagement-message-renderer [role="button"]',
    'yt-live-chat-banner-renderer #message',
    'yt-live-chat-banner-renderer #header',
    'yt-live-chat-banner-renderer yt-formatted-string',
    'yt-live-chat-banner-renderer a[href]',
    'yt-live-chat-banner-renderer button',
    'yt-live-chat-banner-renderer [role="button"]',
    'yt-live-chat-restricted-participation-renderer #message',
    'yt-live-chat-restricted-participation-renderer #subtext',
    'yt-live-chat-restricted-participation-renderer yt-formatted-string',
    'yt-live-chat-restricted-participation-renderer a[href]',
    'yt-live-chat-restricted-participation-renderer button',
    'yt-live-chat-restricted-participation-renderer [role="button"]',
    'yt-live-chat-ticker-renderer #text',
    'yt-live-chat-ticker-renderer #content',
    'yt-live-chat-ticker-renderer yt-formatted-string',
    'yt-live-chat-ticker-renderer a[href]',
    'yt-live-chat-ticker-renderer button',
    'yt-live-chat-ticker-renderer [role="button"]',
];
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
const BOOKWALKER_READER_PARSER_ID = 'bookwalker-reader';
const BOOKWALKER_STOREFRONT_PARSER_ID = 'bookwalker-storefront';
const BOOKWALKER_TEXT_METADATA_ROOTS = [
    '#bookTitle',
    '#book-title',
    '#book_title',
    '#bookDescription',
    '[data-book-title]',
    '[data-book-description]',
    '[id*="bookTitle"]',
    '[id*="book-title"]',
    '[class*="bookTitle"]',
    '[class*="book-title"]',
    '.book-title',
    '.book-description',
    '.t-o-heading-book-title',
    '.t-o-heading-book-title__link',
    '.t-c-tile-card__title',
    '.t-c-tile-card__catch',
    '.m-bookDetailTitle',
    '.m-bookDetailLead',
    '.m-bookDetailDescription',
];
const BOOKWALKER_READER_SETTINGS_SELECTOR = '.settings-popover,[class*="setting" i],[id*="setting" i],[aria-label*="設定"],[role="dialog"],[role="menu"]';
const MIGAKU_MARKETING_HOSTS = new Set(['migaku.com', 'www.migaku.com']);
const MIGAKU_MARKETING_EXCLUDE = [
    COMMON_EXCLUDE,
    // The homepage replaces these Vue transition spans every few seconds and
    // briefly stacks the entering/leaving copies. Annotating either copy gives
    // the host transition a third paint layer and leaves stale text behind.
    '.WelcomeText__title',
    // Migaku's learning demos already own these token/ruby surfaces. Nesting a
    // second reader inside them makes both extensions compete for the same text.
    '.migaku-surface',
].join(',');
const YOMUYOMU_HOSTS = new Set(['yomuyomu.app', 'www.yomuyomu.app']);
const YOMUYOMU_READER_ROOTS = [
    '#du-reading-screen canvas[lang*="ja" i]',
    '#du-lesson-container .lesson-canvas-container canvas[lang*="ja" i]',
    '.lesson-content canvas[lang*="ja" i]',
].join(',');
export const SITE_PARSER_PROFILES: SiteParserProfile[] = [
    {
        id: YOMU_HOSTED_DOCS_PARSER_ID,
        roots: YOMU_HOSTED_DOCS_ROOTS,
        exclude: YOMU_HOSTED_DOCS_EXCLUDE,
        allowUiText: true,
        heading: true,
        minLength: 1,
        // The page translates its own chrome and prose. Only explicit demo or
        // reading surfaces are study material, so neither the generic scan nor
        // the residual whole-body pass may escape this profile boundary.
        disableGenericDomScan: true,
        suppressResidualVisibleScan: true,
        includePassiveInteractionRoots: false,
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
        id: BOOKWALKER_READER_PARSER_ID,
        roots: [...BOOKWALKER_TEXT_METADATA_ROOTS, BOOKWALKER_READER_SETTINGS_SELECTOR],
        exclude: COMMON_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        disableGenericDomScan: true,
        suppressResidualVisibleScan: true,
        includePassiveInteractionRoots: true,
        matches: url => isBookWalkerReaderUrl(url),
    },
    {
        id: BOOKWALKER_STOREFRONT_PARSER_ID,
        roots: BOOKWALKER_TEXT_METADATA_ROOTS,
        exclude: COMMON_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        disableGenericDomScan: true,
        includePassiveInteractionRoots: false,
        providesTextLayer: true,
        matches: url => isBookWalkerStorefrontUrl(url),
    },
    {
        id: 'migaku-marketing-parser',
        roots: ['main'],
        exclude: MIGAKU_MARKETING_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        heading: true,
        suppressResidualVisibleScan: true,
        matches: url => MIGAKU_MARKETING_HOSTS.has(url.hostname.toLowerCase()),
    },
    {
        id: 'yomuyomu-reader-parser',
        roots: [YOMUYOMU_READER_ROOTS],
        exclude: COMMON_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        nonDestructive: true,
        includeGenericPageText: true,
        matches: url => YOMUYOMU_HOSTS.has(url.hostname.toLowerCase()),
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
            ...YOUTUBE_LIVE_CHAT_TEXT_ROOTS,
            'main',
            '[role="main"]',
        ],
        exclude: COMMON_EXCLUDE,
        allowUiText: true,
        minLength: 1,
        includeUiChrome: true,
        singlePassScan: true,
        nonDestructive: true,
        disableGenericDomScan: true,
        suppressResidualVisibleScan: true,
        includePassiveInteractionRoots: false,
        scanLimit: 80,
        matches: url => isYouTubeAppHostname(url.hostname)
            && (url.pathname === '/live_chat' || url.pathname === '/live_chat_replay'),
    },
    {
        id: 'youtube-comments-parser',
        roots: [
            // High-value watch text comes first so huge virtualized grids or
            // recommendation rails cannot starve the visible title,
            // description, transcript panel, or watch sidebar inside one
            // capped scan pass.
            'ytd-watch-metadata h1',
            'ytd-watch-metadata #title',
            'ytd-watch-metadata #owner ytd-channel-name yt-formatted-string',
            'ytd-watch-metadata #owner ytd-channel-name .ytAttributedStringHost',
            'ytd-watch-metadata #owner ytd-channel-name',
            // Sub-count and subscribe rows are volatile (constant re-render),
            // so they had no root at all; the volatile transform below routes
            // them through the passive mirror, which rides the re-renders.
            'ytd-watch-metadata #owner-sub-count',
            'ytd-watch-metadata #owner #subscribe-button',
            'ytd-watch-info-text',
            'ytd-watch-metadata #info-strings',
            'ytd-watch-metadata #metadata-line',
            'ytd-watch-metadata #teaser-carousel',
            'ytd-watch-metadata yt-video-metadata-carousel-view-model',
            'ytd-watch-metadata yt-carousel-title-view-model',
            'ytd-watch-metadata yt-text-carousel-item-view-model',
            'ytd-watch-metadata .ytAttributedStringHost',
            'ytd-watch-metadata #description-inline-expander',
            'ytd-watch-metadata #description yt-attributed-string#attributed-snippet-text',
            'ytd-watch-metadata #description yt-attributed-string#attributed-description-text',
            'ytd-watch-metadata #description .yt-core-attributed-string:not(#owner-sub-count)',
            'ytd-watch-metadata #description-text',
            'ytd-watch-metadata ytd-text-inline-expander',
            'ytd-watch-metadata #attributed-snippet-text',
            'ytd-watch-metadata #attributed-description-text',
            'ytd-watch-metadata yt-attributed-string#attributed-description-text',
            // Search/browse chrome starves behind the video grid at collection
            // time on desktop layouts (iPad): channel cards, the search filter
            // row, shelf show-more expanders, and the mini-guide rail are
            // small user-facing surfaces, so they ride with the high-value
            // watch text instead of trailing the grids.
            'ytd-channel-renderer',
            'ytd-search-sub-menu-renderer',
            'ytd-shelf-renderer #show-more-button',
            'ytd-shelf-renderer #expand',
            'ytd-shelf-renderer yt-button-renderer',
            'ytd-mini-guide-entry-renderer',
            // The whole slim metadata section, not just the title: the
            // view-count/date line, hashtag row, and もっと見る expander live in
            // sibling rows that stayed bare when only h1/#title were rooted.
            'ytm-slim-video-metadata-section-renderer',
            'ytm-slim-owner-renderer',
            'ytm-expandable-video-description-body-renderer',
            'ytm-structured-description-content-renderer',
            YOUTUBE_COMMENT_HEADER_ROOTS,
            'ytd-transcript-segment-renderer',
            'ytm-transcript-segment-renderer',
            // ISS-11: end-screen and pause-overlay titles had zero coverage. These
            // live inside .ytp-* player chrome, so Edit A's player-chrome narrowing
            // lets them through. Kept at high watch-text priority (before comments).
            '.ytp-ce-element .ytp-ce-video-title',
            '.ytp-ce-element .ytp-ce-playlist-title',
            '.ytp-pause-overlay .ytp-videowall-still-info-title',
            '.ytp-cards-teaser-text',
            YOUTUBE_COMMENT_TEXT_AND_ACTION_ROOTS,
            'ytd-watch-next-secondary-results-renderer #video-title',
            '#secondary ytd-compact-video-renderer #video-title',
            '#secondary ytd-compact-video-renderer',
            'ytd-compact-video-renderer #video-title',
            'ytd-compact-video-renderer',
            ...YOUTUBE_LIVE_CHAT_TEXT_ROOTS,
            'ytd-live-chat-frame #show-hide-button',
            'ytd-live-chat-frame #header',
            'ytd-live-chat-frame #content',
            'ytd-live-chat-frame #message',
            'ytd-live-chat-frame #subtext',
            'ytd-live-chat-frame .yt-core-attributed-string',
            'ytd-live-chat-frame .yt-core-attributed-string--white-space-pre-wrap',
            'ytd-live-chat-frame yt-formatted-string',
            'ytd-live-chat-frame button',
            'ytd-live-chat-frame [role="button"]',
            'ytd-watch-next-secondary-results-renderer',
            // General feed/search grids are useful, but lower priority because
            // YouTube can hydrate hundreds of them.
            'ytd-rich-grid-renderer',
            'ytd-rich-item-renderer',
            'ytd-video-renderer',
            'yt-lockup-view-model',
            // Channel pages: lockup ITEMS were scanned via yt-lockup-view-model
            // but their shelf headings (人気の動画/動画), the channel header
            // (name/handle/metadata/description preview さらに表示), and the
            // legacy grid cards had no root at all, so they stayed bare.
            'yt-page-header-view-model',
            'ytd-c4-tabbed-header-renderer',
            'grid-shelf-view-model',
            'ytd-shelf-renderer',
            'ytd-reel-shelf-renderer',
            'ytd-grid-video-renderer',
            // Playlist surfaces (watch-page queue + /playlist rows + legacy
            // header) and search/browse channel cards: 1.6.40 underlined the
            // 再生リスト tab while every row behind the click stayed bare.
            'ytd-playlist-panel-video-renderer',
            'ytd-playlist-video-renderer',
            'ytd-playlist-header-renderer',
            'ytd-channel-renderer',
            'ytd-grid-channel-renderer',
            'ytm-playlist-panel-video-renderer',
            'ytm-playlist-video-renderer',
            'ytm-channel-list-item-renderer',
            'ytm-compact-channel-renderer',
            'ytm-rich-grid-renderer',
            'ytm-video-with-context-renderer',
            'ytm-shorts-lockup-view-model',
            'ytm-shorts-lockup-view-model-v2',
            'ytm-item-section-renderer',
        ],
        exclude: YOUTUBE_TEXT_EXCLUDE,
        allowUiText: true,
        // Let the generic viewport collector drive YouTube like every other
        // dynamic page. Scanning the whole virtualized DOM spent the target
        // budget on offscreen/recycled cards and left late comments bare.
        visibleOnly: true,
        includeUiChrome: true,
        nonDestructive: true,
        includePassiveInteractionRoots: true,
        matches: url => isYouTubeAppHostname(url.hostname),
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

export function isBookWalkerReaderPage(href = location.href): boolean {
    return isBookWalkerReaderUrl(new URL(href, window.location.href));
}

function isBloomeeLandingUrl(url: URL): boolean {
    return BLOOMEE_LANDING_HOSTS.has(url.hostname.toLowerCase())
        && (url.pathname === '/' || url.pathname === '')
        && Boolean(document.querySelector('.life-top-page-wrap,.home-index,.point__itembox-headline,.cv-step,.ctaarea'));
}

function isBookWalkerStorefrontUrl(url: URL): boolean {
    return BOOKWALKER_STOREFRONT_HOSTS.has(url.hostname.toLowerCase()) && !isBookWalkerReaderUrl(url);
}

function isBookWalkerReaderUrl(url: URL): boolean {
    const hostname = url.hostname.toLowerCase();
    if (!/^(?:[^.]+\.)*bookwalker\.jp$/iu.test(hostname)) return false;
    if (hostname !== 'bookwalker.jp' && hostname !== 'www.bookwalker.jp') return true;
    return Boolean(document.querySelector('canvas, #pageSliderCounter, #viewer, #renderer, #bookContainer, [id^="viewport"]'));
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
        if (profile.id === 'yomu-pdf-reader-parser') return yomuPdfReaderProvidesNativeTextLayer();
        return true;
    });
}

function yomuPdfReaderProvidesNativeTextLayer(): boolean {
    const pages = Array.from(document.querySelectorAll<HTMLElement>('.pdf-page'));
    if (!pages.length) return true;
    const visiblePages = pages.filter(isVisiblePdfReaderPage);
    if (!visiblePages.length) return true;
    if (visiblePages.some(isScannedPdfReaderPage)) return false;
    return visiblePages.some(page => isTextPdfReaderPage(page) || isPendingPdfReaderPage(page));
}

function isScannedPdfReaderPage(page: HTMLElement): boolean {
    return page.dataset.pdfText === 'scanned'
        || page.dataset.yomuCanvasOcr === 'on'
        || page.classList.contains('scanned');
}

function isTextPdfReaderPage(page: HTMLElement): boolean {
    if (page.dataset.pdfText === 'text') return true;
    const textLayer = page.querySelector<HTMLElement>('.textLayer');
    if (!textLayer || textLayer.hidden || textLayer.getAttribute('aria-hidden') === 'true') return false;
    return compactText(textLayer.textContent ?? '').length >= YOMU_PDF_READER_MIN_TEXT_LENGTH;
}

function isPendingPdfReaderPage(page: HTMLElement): boolean {
    return !page.dataset.pdfText || page.dataset.pdfText === 'pending';
}

function isVisiblePdfReaderPage(page: HTMLElement): boolean {
    const rect = page.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    return rect.width > 0
        && rect.height > 0
        && rect.bottom >= 0
        && rect.right >= 0
        && rect.top <= viewportHeight
        && rect.left <= viewportWidth;
}

function compactText(value: string): string {
    return value.replace(/\s+/g, '');
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

export interface SiteScanOptions {
    // Silent auto-scans set this so hosts whose text mirror already renders
    // the same text are skipped at collection time instead of re-parsed.
    skipMirroredHosts?: boolean;
    // Each capped continuation can have another budget-width of already
    // mirrored text ahead of its tail. Candidate headroom grows with the
    // bounded continuation depth so a single broad root still advances.
    mirroredHeadTargetCount?: number;
    // Continuation scans can exclude exact already-attempted, still-unmirrored
    // targets without letting them consume the collection cap again. The count
    // supplies bounded admission headroom; the predicate preserves correctness
    // when the DOM reorders or long source targets split into parse chunks.
    skipTarget?: (target: ScanTextTarget) => boolean;
    skipTargetCount?: number;
}

// The scanner's continuation gate must compare against the limit collection
// actually enforces: profiles can cap it below the requested budget
// (scanLimit), and comparing against the raw budget made capped profiles
// (live-chat frame, scanLimit 80) unable to ever continue (sol review P1).
export function effectiveSiteScanCollectionLimit(limit: number, href = window.location.href): number {
    const profiles = getMatchingSiteParsers(href);
    return profiles.length ? effectiveScanTargetLimit(profiles, limit) : limit;
}

export function collectSiteScanTargets(limit = 40, href = window.location.href, options: SiteScanOptions = {}): ScanTextTarget[] | null {
    return drainCollectionSteps(siteScanTargetSteps(limit, href, options));
}

// One monolithic collection pass produced ~300ms long tasks on dense pages
// (heat profile, perf item 4). The collection is a generator that yields at
// per-root boundaries; the sync entry points drain it in one go (identical
// semantics — ordering and dedupe are byte-for-byte the same walk), while the
// scanner drives it cooperatively with a frame deadline between chunks.
function* siteScanTargetSteps(limit: number, href: string, options: SiteScanOptions): Generator<void, ScanTextTarget[] | null> {
    const profiles = getMatchingSiteParsers(href);
    if (!profiles.length) return null;

    const context = createSiteScanContext(profiles, limit, options);
    for (const profile of profiles) yield* profileScanTargetSteps(profile, context);
    return siteScanResult(profiles, context.targets);
}

function drainCollectionSteps<T>(steps: Generator<void, T>): T {
    for (;;) {
        const next = steps.next();
        if (next.done) return next.value;
    }
}

interface SiteScanContext {
    effectiveLimit: number;
    targets: FragmentTextTarget[];
    seen: Set<Text>;
    skipMirroredHosts: boolean;
    mirroredHeadTargetCount: number;
    // Per-pass selector→elements cache: profiles share many root selectors
    // (the YouTube chrome roots ride in two profiles), so each distinct
    // selector hits the DOM once per collection pass.
    rootQueryCache: Map<string, HTMLElement[]>;
}

function createSiteScanContext(profiles: SiteParserProfile[], limit: number, options: SiteScanOptions = {}): SiteScanContext {
    return {
        effectiveLimit: effectiveScanTargetLimit(profiles, limit, options.skipTargetCount ?? 0),
        targets: [],
        seen: new Set(),
        skipMirroredHosts: Boolean(options.skipMirroredHosts),
        mirroredHeadTargetCount: Math.max(0, options.mirroredHeadTargetCount ?? 0),
        rootQueryCache: new Map(),
    };
}

function* profileScanTargetSteps(profile: SiteParserProfile, context: SiteScanContext): Generator<void> {
    if (profile.id === 'youtube-comments-parser') collectYouTubeSyntheticTextTargets(profile, context);
    for (const root of queryParserRoots(profile, context.rootQueryCache)) {
        if (!siteScanHasRoom(context)) break;
        collectRootScanTargets(profile, root, context);
        yield;
    }
    if (profile.includePassiveInteractionRoots !== false) {
        yield* profilePassiveInteractionTargetSteps(profile, context);
    }
}

function collectYouTubeSyntheticTextTargets(profile: SiteParserProfile, context: SiteScanContext): void {
    const roots = uniqueVisibleRoots(Array.from(document.querySelectorAll<HTMLElement>(YOUTUBE_SYNTHETIC_TEXT_ROOTS)));
    for (const root of roots) {
        if (!siteScanHasRoom(context)) break;
        if (context.targets.some(target => target.parent === root)) continue;
        const text = syntheticYouTubeElementText(root);
        if (!text || !HAS_JAPANESE.test(text)) continue;
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
        if (normalized && HAS_JAPANESE.test(normalized)) return normalized;
    }
    return '';
}

function syntheticYouTubeWatchInfoText(root: HTMLElement): string {
    const parts = Array.from(root.querySelectorAll<HTMLElement>(YOUTUBE_WATCH_INFO_ARIA_PARTS))
        .map(element => normalizedAttributeText(element, 'aria-label'))
        .filter((text): text is string => Boolean(text));
    const text = parts.join(' • ');
    if (HAS_JAPANESE.test(text)) return text;
    for (const attribute of ['aria-label', 'title']) {
        const fallback = normalizedAttributeText(root, attribute);
        if (fallback && HAS_JAPANESE.test(fallback)) return fallback;
    }
    return '';
}

function normalizedAttributeText(element: HTMLElement, attribute: string): string {
    return element.getAttribute(attribute)?.replace(/\s+/g, ' ').trim() ?? '';
}

function collectRootScanTargets(profile: SiteParserProfile, root: Element, context: SiteScanContext, excludeSelector = siteScanExcludeSelector(profile)): void {
    if (root instanceof HTMLCanvasElement && collectCanvasFallbackTextTarget(profile, root, context)) return;
    const collected = collectFragmentTextTargetsIn(root, siteScanRemaining(context)
        + (context.skipMirroredHosts ? context.mirroredHeadTargetCount + 24 : 0), profile.visibleOnly ?? true, excludeSelector, {
        allowUiText: true,
        minLength: profile.minLength,
        includeUiChrome: true,
        includeFormChrome: true,
        includeTabChrome: true,
        // ISS-11: YouTube profiles parse every player/control/toggle wrapper
        // (Shorts overlay text, tooltips, end-screen titles). The native caption
        // window stays excluded via the profile's `exclude`
        // (YT_PLAYER_CHROME_EXCLUDE_ENTRIES), so this does not re-render captions.
        includePlayerChrome: isYouTubeSiteParserProfile(profile),
        includePassiveInteractions: true,
        mergeBlockFragments: profile.mergeBlockFragments,
        heading: profile.heading,
        allowShortCenteredHeadings: profile.allowShortCenteredHeadings,
    });
    for (const target of collected) {
        // Silent auto-scans skip hosts whose mirror already renders this exact
        // text — the non-destructive feed otherwise re-parses every annotated
        // title on every scroll settle (the dominant YouTube scroll cost).
        if (context.skipMirroredHosts
            && profile.nonDestructive
            && target.parent instanceof HTMLElement
            && textMirrorAlreadyRenders(target.parent, target.text)) continue;
        if (!addUniqueSiteScanTarget(profile, target, context)) continue;
        if (!siteScanHasRoom(context)) break;
    }
}

function collectCanvasFallbackTextTarget(profile: SiteParserProfile, canvas: HTMLCanvasElement, context: SiteScanContext): boolean {
    const text = canvasFallbackText(canvas);
    if (!text || !HAS_JAPANESE.test(text)) return false;
    context.targets.push(siteScanTargetWithProfileOptions(profile, {
        text,
        parent: canvas,
        fragments: [],
        layoutSensitive: true,
        nonDestructive: true,
    }));
    return true;
}

function canvasFallbackText(canvas: HTMLCanvasElement): string {
    return (canvas.textContent ?? '')
        .replace(/\r\n?/gu, '\n')
        .trim();
}

function* profilePassiveInteractionTargetSteps(profile: SiteParserProfile, context: SiteScanContext): Generator<void> {
    if (!siteScanHasRoom(context)) return;
    for (const root of queryProfilePassiveInteractionRoots(profile)) {
        if (!siteScanHasRoom(context)) break;
        collectRootScanTargets(profile, root, context, siteScanPassiveInteractionExcludeSelector(profile));
        yield;
    }
}

function queryProfilePassiveInteractionRoots(profile: SiteParserProfile): HTMLElement[] {
    return uniqueSpecificVisibleRoots(queryWithinAnnotationScope<HTMLElement>(PASSIVE_INTERACTION_ROOTS)
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
        reject: candidate => shouldRejectProfileScanTarget(profile, candidate),
        transform: candidate => siteScanTargetWithProfileOptions(profile, volatileYouTubeTargetAsPassiveMirror(profile, candidate)),
    });
}

function shouldRejectProfileScanTarget(profile: SiteParserProfile, target: FragmentTextTarget): boolean {
    if (!isYouTubeSiteParserProfile(profile)) return false;
    return targetSpansMultipleYouTubeWatchMetadataTextHosts(target);
}

// A review-card FRONT (question side) must stay a plain prompt: furigana or a
// pitch/status underline there spoils the reading the learner must recall. This
// predicate is registered with the decoration policy (setReviewCardFrontPredicate)
// so classifyDecoration returns 'skip' for it — the one choke point every scan
// pass honours (profile scan, residual-visible pass, and shadow rounds all drop
// a 'skip' node). Rejecting only the profile target was not enough: the residual
// pass re-collected the "uncovered" headword and annotated it anyway. It stays
// plain on the front and re-annotates on reveal, matching the hosted study page.
export function isReviewCardFrontPromptElement(element: Element): boolean {
    if (!(element instanceof HTMLElement)) return false;
    return isBunproReviewFrontPrompt(element)
        || isJitenStudyFrontPrompt(element)
        || isJpdbReviewFrontPrompt(element);
}

// Sub-count and subscribe rows re-render constantly — the flicker that once
// justified dropping them outright. The passive non-destructive mirror rides
// those re-renders (it watches the host text and refreshes itself), so they
// get decoration instead of an exclusion.
function volatileYouTubeTargetAsPassiveMirror(profile: SiteParserProfile, target: FragmentTextTarget): FragmentTextTarget {
    if (!isYouTubeSiteParserProfile(profile)) return target;
    if (!target.parent.closest(YOUTUBE_VOLATILE_WATCH_METADATA_SELECTOR)) return target;
    return {
        ...target,
        passiveInteraction: true,
        nonDestructive: true,
        fragments: target.fragments.map(fragment => ({ ...fragment, passiveInteraction: true })),
    };
}

function targetSpansMultipleYouTubeWatchMetadataTextHosts(target: FragmentTextTarget): boolean {
    if (!target.parent.closest('ytd-watch-metadata')) return false;
    const hosts = new Set<HTMLElement>();
    for (const fragment of target.fragments) {
        const parent = fragment.node.parentElement;
        const host = parent?.closest<HTMLElement>(YOUTUBE_STABLE_TEXT_HOST_SELECTOR);
        if (host?.closest('ytd-watch-metadata')) hosts.add(host);
    }
    return hosts.size > 1;
}

function siteScanTargetWithProfileOptions(profile: SiteParserProfile, target: FragmentTextTarget): FragmentTextTarget {
    const suppressRuby = shouldSuppressSiteScanRuby(profile, target);
    const baseTarget = {
        ...target,
        parserId: profile.id,
        // Sealed DecorationPolicy decision: profile targets built without the
        // generic collectors (synthetic aria-label rows, canvas fallbacks)
        // classify here so every target carries exactly one verdict. Yomu's
        // OWN hosted pages are reading material end to end — their controls
        // keep inline readings (owner-surface naming; behavior is the policy's).
        ...profileDecoration(profile, target),
        suppressRuby: target.suppressRuby || suppressRuby || undefined,
        passiveInteraction: target.passiveInteraction || target.suppressRuby || suppressRuby || undefined,
        singlePassScan: profile.singlePassScan || undefined,
        nonDestructive: profile.nonDestructive || undefined,
    };
    return profile.plainScan ? plainScanTarget(baseTarget) : baseTarget;
}

function isYouTubeSiteParserProfile(profile: SiteParserProfile): boolean {
    return profile.id.startsWith('youtube-');
}

function profileDecoration(
    profile: SiteParserProfile,
    target: FragmentTextTarget,
): Pick<FragmentTextTarget, 'decoration' | 'decorationProfileOverride'> {
    const sealed = target.decoration ?? classifyDecoration(target.parent);
    if (sealed === 'interactive-passive' && profile.id === YOMU_HOSTED_DOCS_PARSER_ID) {
        return { decoration: 'content-ruby', decorationProfileOverride: true };
    }
    return { decoration: sealed, decorationProfileOverride: target.decorationProfileOverride };
}

function shouldSuppressSiteScanRuby(profile: SiteParserProfile, target: FragmentTextTarget): boolean {
    if (profile.id === BOOKWALKER_READER_PARSER_ID) return isBookWalkerReaderPassiveChromeTarget(target.parent);
    if (profile.id === JPDB_PARSER_ID) return isJpdbReviewPromptTarget(target.parent, target.text);
    if (profile.id === 'jiten-parser') return isJitenStudyPromptTarget(target.parent, target.text);
    return false;
}

function isBookWalkerReaderPassiveChromeTarget(parent: HTMLElement): boolean {
    return Boolean(parent.closest(PASSIVE_INTERACTION_ROOTS) || parent.closest(BOOKWALKER_READER_SETTINGS_SELECTOR));
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

export function collectScanTargets(limit = DEFAULT_SCAN_TARGET_LIMIT, href = window.location.href, options: SiteScanOptions = {}): ScanTextTarget[] {
    return drainCollectionSteps(scanTargetCollectionSteps(limit, href, options));
}

// Chunked collection entry for the visible-page scan (perf item 4): the
// scanner drives this generator and yields the main thread between chunks
// once its frame budget is spent, so a dense page's collection never runs as
// one ~300ms long task. The walk (and therefore ordering/dedupe) is exactly
// the sync collectScanTargets walk — a fast collection completes without ever
// touching the scheduler.
export function collectScanTargetsInSteps(
    limit = DEFAULT_SCAN_TARGET_LIMIT,
    href = window.location.href,
    options: SiteScanOptions = {},
): Generator<void, ScanTextTarget[]> {
    return scanTargetCollectionSteps(limit, href, options);
}

const DEFERRED_SHADOW_SCAN_MAX_ROUNDS = 8;

function* scanTargetCollectionSteps(limit: number, href: string, options: SiteScanOptions): Generator<void, ScanTextTarget[]> {
    const skipTargetCount = Math.max(0, Math.floor(options.skipTargetCount ?? 0));
    const collectionLimit = limit + skipTargetCount;
    const matchingProfiles = getMatchingSiteParsers(href);
    const targets = yield* scanTargetPhaseSteps(collectionLimit, href, options);
    const withDeferred = yield* withDeferredShadowScanTargets(
        targets,
        effectiveScanTargetLimit(matchingProfiles, collectionLimit, skipTargetCount),
        matchingProfiles,
    );
    const eligible = options.skipTarget ? withDeferred.filter(target => !options.skipTarget!(target)) : withDeferred;
    return eligible.slice(0, limit);
}

// Depth-capped shadow hosts queued during any phase above get a bounded
// continuation: each round re-roots the fragment walk at the queued hosts
// (their own walk restarts at shadow depth 0, covering four more levels), and
// hosts capped again re-queue for the next round. Arbitrarily deep component
// trees are fully covered in O(depth/4) yielded rounds while any single round
// stays finite — silent truncation is not an acceptable coverage outcome.
function* withDeferredShadowScanTargets(
    baseTargets: ScanTextTarget[],
    effectiveLimit: number,
    profiles: SiteParserProfile[],
): Generator<void, ScanTextTarget[]> {
    let targets = baseTargets;
    const nonDestructive = profiles.some(profile => profile.nonDestructive);
    for (let round = 0; round < DEFERRED_SHADOW_SCAN_MAX_ROUNDS; round += 1) {
        const remaining = effectiveLimit - targets.length;
        const hosts = drainDepthCappedShadowHosts();
        if (!hosts.length || remaining <= 0) break;
        yield;
        const seen = seenTextNodes(targets);
        const collected: FragmentTextTarget[] = [];
        for (const host of hosts) {
            if (collected.length >= remaining) break;
            const hostTargets = collectFragmentTextTargetsIn(host, remaining - collected.length, true, residualVisibleJapaneseExcludeSelector(profiles), {
                allowUiText: true,
                includeUiChrome: true,
                includeFormChrome: true,
                includeTabChrome: true,
                includePassiveInteractions: true,
                heading: true,
                minLength: 1,
            }).filter(target => target.fragments.every(fragment => !seen.has(fragment.node)));
            collected.push(...hostTargets);
        }
        if (!collected.length) continue;
        targets = [...targets, ...markTargetsPassive(collected, { nonDestructive })];
    }
    return targets;
}

function* scanTargetPhaseSteps(limit: number, href: string, options: SiteScanOptions): Generator<void, ScanTextTarget[]> {
    const matchingProfiles = getMatchingSiteParsers(href);
    const effectiveLimit = matchingProfiles.length
        ? effectiveScanTargetLimit(matchingProfiles, limit, options.skipTargetCount ?? 0)
        : limit;
    const profilePhaseLimit = profilePhaseTargetLimit(matchingProfiles, effectiveLimit);
    const siteTargets = yield* completeSiteScanTargetSteps(matchingProfiles, profilePhaseLimit, href, options);
    const baseTargets = siteTargets ?? [];
    if (matchingProfiles.some(profile => profile.disableGenericDomScan)) {
        if (matchingProfiles.some(profile => profile.suppressResidualVisibleScan)) {
            return baseTargets;
        }
        yield;
        const residualTargets = collectResidualVisibleJapaneseTargets(
            effectiveLimit - baseTargets.length,
            baseTargets,
            matchingProfiles,
            options,
        );
        return residualTargets.length
            ? [...baseTargets, ...markTargetsPassive(residualTargets, { nonDestructive: matchingProfiles.some(profile => profile.nonDestructive) })]
            : baseTargets;
    }
    yield;
    const profileUiChromeTargets = collectProfileSafeUiChromeTargets(profilePhaseLimit - baseTargets.length, baseTargets, matchingProfiles.length > 0, matchingProfiles, options);
    if (siteTargets && !hasGenericPageTextFallback(matchingProfiles)) {
        // Profile roots are curated, not exhaustive: any visible Japanese they
        // miss (e.g. a metadata row the selectors never named) still gets a
        // passive, mirror-friendly pass so no site leaves text bare.
        const profileTargets = [...baseTargets, ...profileUiChromeTargets];
        if (matchingProfiles.some(profile => profile.suppressResidualVisibleScan)) return profileTargets;
        yield;
        const residualTargets = collectResidualVisibleJapaneseTargets(
            effectiveLimit - profileTargets.length,
            profileTargets,
            matchingProfiles,
            options,
        );
        return residualTargets.length
            ? [...profileTargets, ...markTargetsPassive(residualTargets, { nonDestructive: matchingProfiles.some(profile => profile.nonDestructive) })]
            : profileTargets;
    }
    yield;
    const genericPhaseRemaining = effectiveLimit - baseTargets.length - profileUiChromeTargets.length;
    const uiChromeReserve = genericUiChromeTargetLimit(genericPhaseRemaining);
    const genericTargets = collectGenericProseTargets(
        genericPhaseRemaining - uiChromeReserve,
        [...baseTargets, ...profileUiChromeTargets],
        options,
    );
    yield;
    const uiChromeTargets = collectSafeUiChromeTargets(
        genericPhaseRemaining - genericTargets.length,
        [...baseTargets, ...profileUiChromeTargets, ...genericTargets],
        options,
    );
    yield;
    // A page with little or no chrome should not leave the reserved slice
    // idle. Resume prose collection after the chrome pass while keeping the
    // original prose-before-controls ordering and shared-node admission.
    const supplementalGenericTargets = collectGenericProseTargets(
        genericPhaseRemaining - genericTargets.length - uiChromeTargets.length,
        [...baseTargets, ...profileUiChromeTargets, ...genericTargets, ...uiChromeTargets],
        options,
    );
    const collectedTargets = [
        ...baseTargets,
        ...profileUiChromeTargets,
        ...genericTargets,
        ...uiChromeTargets,
        ...supplementalGenericTargets,
    ];
    yield;
    const targetsWithResidual = withResidualVisibleJapaneseTargets(collectedTargets, effectiveLimit, matchingProfiles, options);
    if (targetsWithResidual.length) return targetsWithResidual;

    yield;
    const broadTargets = collectWholePageScanTargets(effectiveLimit);
    const broadWithResidual = withResidualVisibleJapaneseTargets(broadTargets, effectiveLimit, matchingProfiles, options);
    if (broadWithResidual.length) return broadWithResidual;
    // An active page-owned scope with no remaining target means "scan
    // nothing", not "escape to the legacy global visible-text fallback".
    if (annotationScopeActive()) return [];
    return collectVisibleTextTargets(effectiveLimit);
}

// Passive keeps click-through navigation; ruby/pitch still render — the
// per-element layout guards (compact chrome, ruby-room growth) decide
// decoration, not a blanket suppressRuby.
function markTargetsPassive(targets: ScanTextTarget[], options: { nonDestructive?: boolean } = {}): ScanTextTarget[] {
    return targets.map(target => ({
        ...target,
        passiveInteraction: true,
        nonDestructive: options.nonDestructive || undefined,
        ...('fragments' in target
            ? {
                fragments: target.fragments.map(fragment => ({
                    ...fragment,
                    passiveInteraction: true,
                })),
            }
            : {}),
    }));
}

function profilePhaseTargetLimit(profiles: SiteParserProfile[], effectiveLimit: number): number {
    if (!profiles.length
        || !Number.isFinite(effectiveLimit)
        || effectiveLimit < PROFILE_PHASE_GENERIC_RESERVE_THRESHOLD
        || profiles.some(profile => profile.disableGenericDomScan || profile.suppressResidualVisibleScan)) return effectiveLimit;
    const reserve = Math.min(
        PROFILE_PHASE_GENERIC_RESERVE_MAX,
        Math.max(1, Math.floor(effectiveLimit * PROFILE_PHASE_GENERIC_RESERVE_RATIO)),
    );
    return Math.max(1, effectiveLimit - reserve);
}

function genericUiChromeTargetLimit(remaining: number): number {
    if (remaining <= 0) return 0;
    if (!Number.isFinite(remaining)) return GENERIC_UI_CHROME_TARGET_MAX;
    return Math.min(GENERIC_UI_CHROME_TARGET_MAX, Math.max(1, Math.ceil(remaining * 0.25)));
}

function withResidualVisibleJapaneseTargets(
    targets: ScanTextTarget[],
    effectiveLimit: number,
    profiles: SiteParserProfile[],
    options: SiteScanOptions = {},
): ScanTextTarget[] {
    const remaining = effectiveLimit - targets.length;
    if (remaining <= 0) return targets;
    const residual = collectResidualVisibleJapaneseTargets(remaining, targets, profiles, options);
    return residual.length ? [...targets, ...residual] : targets;
}

function collectResidualVisibleJapaneseTargets(
    limit: number,
    existingTargets: ScanTextTarget[],
    profiles: SiteParserProfile[],
    options: SiteScanOptions = {},
): FragmentTextTarget[] {
    if (limit <= 0 || !document.body) return [];
    const collection: GenericProseCollection = {
        targets: [],
        seen: seenTextNodes(existingTargets),
        limit,
    };
    const candidateLimit = Number.isFinite(limit)
        ? Math.max(limit, existingTargets.length + (options.skipMirroredHosts ? options.mirroredHeadTargetCount ?? 0 : 0) + limit + 24)
        : limit;
    const nonDestructiveProfile = profiles.some(profile => profile.nonDestructive);
    const collected = scanScopeRoots().flatMap(root => collectFragmentTextTargetsIn(root, candidateLimit, true, residualVisibleJapaneseExcludeSelector(profiles), {
        allowUiText: true,
        includeUiChrome: true,
        includeFormChrome: true,
        includeTabChrome: true,
        // ISS-11: this residual pass scans the whole document.body, so only relax
        // player chrome on YouTube hosts — other sites keep the original guards.
        // The caption window is still excluded here via
        // residualVisibleJapaneseExcludeSelector (YT_PLAYER_CHROME_EXCLUDE_ENTRIES).
        includePlayerChrome: isYouTubeHost(),
        includePassiveInteractions: true,
        heading: true,
        // The generic centered-heading guard protects destructive inline
        // rewrites from changing decorative site layouts. Explicitly
        // non-destructive profiles render through mirrors, so their functional
        // panel/dialog headings are safe to admit. Generic framework ownership
        // is a per-target render decision and must not alter document-wide
        // collection policy.
        allowShortCenteredHeadings: nonDestructiveProfile,
        minLength: 1,
    }));
    for (const target of collected) {
        // Class E coverage bookkeeping: silent scans skip residual hosts whose
        // mirror already renders this exact text (same rule as the profile
        // pass) — otherwise capped continuations re-spend budget on the same
        // already-decorated head and never reach the residual tail.
        if (options.skipMirroredHosts
            && target.parent instanceof HTMLElement
            && textMirrorAlreadyRenders(target.parent, target.text)) continue;
        appendResidualVisibleTarget(collection.targets, collection.seen, {
            ...target,
            parserId: RESIDUAL_VISIBLE_JAPANESE_PARSER_ID,
        });
        if (genericProseCollectionFull(collection)) break;
    }
    return collection.targets;
}

function residualVisibleJapaneseExcludeSelector(profiles: SiteParserProfile[]): string {
    // Native ruby already carries its reading (jpdb.io headwords, NHK prose);
    // this last-resort pass must not re-annotate it. Ruby-aware enrichment
    // stays with the profile and prose scans.
    const entries = [COMMON_EXCLUDE, 'ruby'];
    if (profiles.some(isYouTubeSiteParserProfile)) {
        entries.push(...YT_PLAYER_CHROME_EXCLUDE_ENTRIES);
    }
    if (profiles.some(profile => profile.id === JPDB_PARSER_ID)) {
        entries.push('.subsection-spelling.with-furigana > :not(.primary-spelling)');
    }
    return entries.join(',');
}

function* completeSiteScanTargetSteps(profiles: SiteParserProfile[], limit: number, href: string, options: SiteScanOptions = {}): Generator<void, ScanTextTarget[] | null> {
    if (!profiles.length) return null;
    const siteTargets = (yield* siteScanTargetSteps(limit, href, options)) ?? [];
    if (siteTargets.length) return siteTargets;
    if (hasWholePageFallback(profiles)) {
        yield;
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

function effectiveScanTargetLimit(profiles: SiteParserProfile[], requestedLimit: number, profileLimitOffset = 0): number {
    const profileLimit = profiles.reduce(
        (limit, profile) => Math.min(limit, profile.scanLimit === undefined ? limit : profile.scanLimit + profileLimitOffset),
        requestedLimit,
    );
    return Math.max(1, profileLimit);
}

function collectWholePageScanTargets(limit: number): FragmentTextTarget[] {
    const targets = scanScopeRoots().flatMap(root => collectFragmentTextTargetsIn(root, limit, true, '', {
        allowUiText: true,
        includeUiChrome: true,
        includeFormChrome: true,
        includeTabChrome: true,
        includePassiveInteractions: true,
        heading: true,
        minLength: 1,
    })).slice(0, limit);
    return targets.map(target => ({ ...target, parserId: target.parserId ?? 'whole-page-parser' }));
}

function collectGenericProseTargets(
    limit: number,
    existingTargets: ScanTextTarget[] = [],
    options: SiteScanOptions = {},
): FragmentTextTarget[] {
    const roots = genericProseRoots();
    const collection = createGenericProseCollection(limit, existingTargets, options);

    for (const root of roots) {
        collectFragmentTargetsFromRoot(root, collection, GENERIC_PROSE_EXCLUDE, { minLength: 2 });
        if (genericProseCollectionFull(collection)) break;
    }

    return collection.targets;
}

function createGenericProseCollection(
    limit: number,
    existingTargets: ScanTextTarget[],
    options: SiteScanOptions,
): GenericProseCollection {
    return {
        targets: [],
        seen: seenTextNodes(existingTargets),
        limit,
        skipMirroredHosts: options.skipMirroredHosts,
        candidateHeadroom: existingTargets.length + (options.skipMirroredHosts ? options.mirroredHeadTargetCount ?? 0 : 0),
    };
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
    options: SiteScanOptions = {},
): FragmentTextTarget[] {
    if (!enabled || limit <= 0) return [];
    const collection = createGenericProseCollection(limit, existingTargets, options);

    const extraExclude = profiles.map(p => p.exclude).filter(Boolean).join(',');

    const parserId = profiles.length === 1 ? profiles[0].id : 'safe-ui-chrome-parser';
    const nonDestructive = profiles.some(profile => profile.nonDestructive);
    collectSafeChromeRootTargets(profileSafeUiChromeRoots(extraExclude), collection, 'ui', extraExclude, parserId, nonDestructive);
    collectSafeChromeRootTargets(safeFormChromeRoots(), collection, 'form', '', parserId, nonDestructive);
    collectSafeFormControlTextTargets(collection, extraExclude);

    return collection.targets;
}

function collectSafeUiChromeTargets(
    limit: number,
    existingTargets: ScanTextTarget[] = [],
    options: SiteScanOptions = {},
): FragmentTextTarget[] {
    if (limit <= 0) return [];
    const collection = createGenericProseCollection(limit, existingTargets, options);

    collectSafeChromeRootTargets(safeUiChromeRoots(), collection, 'ui');
    collectSafeChromeRootTargets(safeFormChromeRoots(), collection, 'form');
    collectSafeFormControlTextTargets(collection);

    return collection.targets;
}

function collectSafeFormControlTextTargets(
    collection: GenericProseCollection,
    extraExclude = '',
): void {
    const targets = scanScopeRoots().flatMap(root => collectFormControlTextTargetsIn(root, genericProseRemaining(collection), true, {
        excludeSelector: extraExclude,
    }));
    for (const target of targets) {
        collection.targets.push(target);
        if (genericProseCollectionFull(collection)) break;
    }
}

function collectSafeChromeRootTargets(
    roots: HTMLElement[],
    collection: GenericProseCollection,
    kind: 'ui' | 'form',
    extraExclude = '',
    parserId = 'safe-ui-chrome-parser',
    nonDestructive = false,
): void {
    for (const root of roots) {
        if (kind === 'ui') {
            const baseExclude = safeUiChromeExcludeForRoot(root);
            collectFragmentTargetsFromRoot(root, collection, extraExclude ? `${baseExclude},${extraExclude}` : baseExclude, {
                allowUiText: true,
                includeUiChrome: true,
                includeTabChrome: true,
                includePassiveInteractions: true,
                heading: true,
                allowShortCenteredHeadings: true,
                minLength: 1,
            }, parserId, nonDestructive);
        } else {
            collectFragmentTargetsFromRoot(root, collection, SAFE_FORM_CHROME_EXCLUDE, {
                allowUiText: true,
                includeFormChrome: true,
                includePassiveInteractions: true,
                heading: true,
                minLength: 1,
            }, parserId, nonDestructive);
        }
        if (genericProseCollectionFull(collection)) break;
    }
}

function safeUiChromeRoots(): HTMLElement[] {
    return uniqueSpecificVisibleRoots(queryWithinAnnotationScope<HTMLElement>(SAFE_UI_CHROME_ROOTS)
        .filter(root => isUsefulSafeUiChromeRoot(root)));
}

function profileSafeUiChromeRoots(extraExclude = ''): HTMLElement[] {
    const roots = queryWithinAnnotationScope<HTMLElement>(PROFILE_SAFE_UI_CHROME_ROOTS)
        .filter(root => isUsefulSafeUiChromeRoot(root));
    if (!extraExclude) return uniqueSpecificVisibleRoots(roots);
    return uniqueSpecificVisibleRoots(roots.filter(root => !root.closest(extraExclude)));
}

function safeUiChromeExcludeForRoot(root: HTMLElement): string {
    return root.matches(SAFE_UI_CHROME_ARIA_MENU_ROOTS) || root.matches('[role="menubar"],[class*="menubar" i],[id*="menubar" i]')
        ? SAFE_UI_CHROME_ARIA_MENU_EXCLUDE
        : SAFE_UI_CHROME_EXCLUDE;
}

function safeFormChromeRoots(): HTMLElement[] {
    return uniqueVisibleRoots(queryWithinAnnotationScope<HTMLElement>(SAFE_FORM_CHROME_ROOTS)
        .filter(root => isUsefulSafeFormChromeRoot(root)));
}

function collectFragmentTargetsFromRoot(
    root: HTMLElement,
    collection: GenericProseCollection,
    exclude: string,
    options: Parameters<typeof collectFragmentTextTargetsIn>[4],
    passiveParserId?: string,
    nonDestructive = false,
): void {
    const remaining = genericProseRemaining(collection);
    const collected = collectFragmentTextTargetsIn(root, collection.skipMirroredHosts
        ? remaining + (collection.candidateHeadroom ?? 0) + 24
        : remaining, true, exclude, options);
    for (const target of collected) {
        if (collection.skipMirroredHosts && textMirrorAlreadyRenders(target.parent, target.text)) continue;
        appendGenericProseTarget(collection.targets, collection.seen, passiveParserId ? {
            ...target,
            parserId: passiveParserId,
            passiveInteraction: true,
            nonDestructive: nonDestructive || undefined,
        } : target);
        if (genericProseCollectionFull(collection)) break;
    }
}

function genericProseRoots(): HTMLElement[] {
    return queryWithinAnnotationScope<HTMLElement>(GENERIC_PROSE_ROOTS)
        .filter(root => isUsefulGenericProseRoot(root));
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

function appendResidualVisibleTarget(
    targets: FragmentTextTarget[],
    seen: Set<Text>,
    target: FragmentTextTarget,
): void {
    const nodes = textNodesForFragmentTarget(target);
    if (!nodes.some(node => seen.has(node))) {
        appendGenericProseTarget(targets, seen, target);
        return;
    }
    // A curated profile can own one inline node while the residual walk groups
    // it with uncovered siblings. Rejecting the whole group makes the siblings
    // permanently invisible to later scans. Admit each unseen run as its own
    // passive target instead, preserving shared-node dedupe without starvation.
    for (const fragments of unseenFragmentRuns(target, seen)) {
        const parent = fragments[0]?.node.parentElement;
        if (!parent) continue;
        const text = fragments.map(fragment => fragment.node.data.slice(fragment.start, fragment.end)).join('');
        if (!HAS_JAPANESE.test(text)) continue;
        const decoration = classifyDecoration(parent);
        if (decoration === 'skip') continue;
        appendAdmittedFragmentTarget(targets, seen, {
            ...target,
            text,
            parent,
            fragments,
            decoration,
            suppressRuby: decoration === 'interactive-passive' || undefined,
            passiveInteraction: true,
            proseWrap: false,
        }, { defaultParserId: RESIDUAL_VISIBLE_JAPANESE_PARSER_ID });
    }
}

function unseenFragmentRuns(
    target: FragmentTextTarget,
    seen: Set<Text>,
): FragmentTextTarget['fragments'][] {
    const runs: FragmentTextTarget['fragments'][] = [];
    let current: FragmentTextTarget['fragments'] = [];
    const flush = (): void => {
        const trimmed = trimFragmentRun(current);
        if (trimmed.length) runs.push(trimmed);
        current = [];
    };
    for (const fragment of target.fragments) {
        if (seen.has(fragment.node)) flush();
        else current.push({ ...fragment });
    }
    flush();
    return runs;
}

function trimFragmentRun(fragments: FragmentTextTarget['fragments']): FragmentTextTarget['fragments'] {
    while (fragments.length) {
        const first = fragments[0];
        const value = first.node.data.slice(first.start, first.end);
        first.start += value.match(/^\s*/u)?.[0].length ?? 0;
        if (first.start < first.end) break;
        fragments.shift();
    }
    while (fragments.length) {
        const last = fragments[fragments.length - 1];
        const value = last.node.data.slice(last.start, last.end);
        last.end -= value.match(/\s*$/u)?.[0].length ?? 0;
        if (last.start < last.end) break;
        fragments.pop();
    }
    return fragments;
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
    return HAS_JAPANESE.test(text);
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
    return HAS_JAPANESE.test(text) && text.length >= minLength && text.length <= maxLength;
}

function compactRootText(root: HTMLElement): string {
    return root.textContent?.replace(/\s+/g, '').trim() ?? '';
}

function isVisibleSafeUiChromeRoot(root: HTMLElement): boolean {
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const style = getComputedStyle(root);
    return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0;
}

function queryParserRoots(profile: SiteParserProfile, rootQueryCache?: Map<string, HTMLElement[]>): HTMLElement[] {
    const roots: HTMLElement[] = [];
    for (const selector of profile.roots) {
        roots.push(...queryRootsBySelector(selector, rootQueryCache));
    }
    const unique = uniqueVisibleRoots(roots);
    return profile.id === 'mokuro-parser' ? nearestMokuroRoots(unique) : unique;
}

function queryRootsBySelector(selector: string, rootQueryCache?: Map<string, HTMLElement[]>): HTMLElement[] {
    const cached = rootQueryCache?.get(selector);
    if (cached) return cached;
    const elements = queryWithinAnnotationScope<HTMLElement>(selector);
    rootQueryCache?.set(selector, elements);
    return elements;
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
