import {
    collectFragmentTextTargetsIn,
    collectVisibleTextTargets,
    type FragmentTextTarget,
    type ScanTextTarget,
} from './dom';
import { Logger } from './logger';

export interface SiteParserProfile {
    id: string;
    name: string;
    description: string;
    roots: string[];
    exclude?: string;
    allowUiText?: boolean;
    minLength?: number;
    includeUiChrome?: boolean;
    includeGenericPageText?: boolean;
    scanLimit?: number;
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
const DEFAULT_SCAN_TARGET_LIMIT = 2000;
const GENERIC_PROSE_ROOTS = [
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
const log = Logger.scope('SiteParsers');

export const SITE_PARSER_PROFILES: SiteParserProfile[] = [
    {
        id: 'jpdb-parser',
        name: 'JPDB',
        description: 'JPDB dictionary, review, and search result Japanese text.',
        roots: [
            '.result.vocabulary',
            '.result.kanji',
            '.results .result',
            '.subsection-meanings',
            '.subsection-usages',
            '.subsection-examples',
            '.subsection-pitch-accent',
            '.subsection-spelling',
            '.primary-spelling',
            '.review-card',
            '.answer',
            '.sentence',
        ],
        exclude: [
            COMMON_EXCLUDE,
            '.nav',
            '.subsection-label',
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
        id: 'youtube-comments-parser',
        name: 'YouTube watch text',
        description: 'Japanese video metadata and comments in YouTube watch views.',
        roots: [
            'ytd-watch-metadata h1',
            'ytd-watch-metadata #title',
            'ytd-watch-metadata #description',
            'ytd-watch-metadata #description-inline-expander',
            'ytd-watch-metadata ytd-text-inline-expander',
            'ytd-watch-metadata #attributed-snippet-text',
            'ytd-comment-view-model',
            '#content-text',
        ],
        allowUiText: true,
        includeGenericPageText: true,
        scanLimit: 80,
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
        matches: url => url.hostname === 'reader.mokuro.app',
    },
    {
        id: 'mokuro-legacy-parser',
        name: 'Mokuro legacy',
        description: 'Local Mokuro HTML exports.',
        roots: ['.textBox', '#manga-panel .textBox', '#pagesContainer .textBox'],
        matches: url => url.protocol === 'file:' && /mokuro/i.test(decodeURIComponent(url.pathname)),
    },
    {
        id: 'wikipedia-parser',
        name: 'Japanese Wikipedia',
        description: 'Japanese Wikipedia article text and previews.',
        roots: ['#firstHeading', '#mw-content-text .mw-parser-output > *', '.mwe-popups-extract > *'],
        exclude: [
            COMMON_EXCLUDE,
            '.p-lang-btn',
            '.vector-menu-heading-label',
            '.vector-toc-toggle',
            '.vector-page-toolbar',
            '.mw-editsection',
            'sup.reference',
        ].join(','),
        matches: url => url.hostname === 'ja.wikipedia.org' || url.hostname === 'ja.m.wikipedia.org',
    },
    {
        id: 'satori-reader-parser',
        name: 'Satori Reader',
        description: 'Satori Reader article text.',
        roots: ['#article-content'],
        exclude: [COMMON_EXCLUDE, '.play-button-container', '.notes-button-container', '.fg', '.wpr'].join(','),
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
    const collected = collectFragmentTextTargetsIn(root, siteScanRemaining(context), true, profile.exclude ?? COMMON_EXCLUDE, {
        allowUiText: profile.allowUiText,
        minLength: profile.minLength,
        includeUiChrome: profile.includeUiChrome,
    });
    for (const target of collected) {
        if (!addUniqueSiteScanTarget(profile, target, context)) continue;
        if (!siteScanHasRoom(context)) break;
    }
}

function addUniqueSiteScanTarget(profile: SiteParserProfile, target: FragmentTextTarget, context: SiteScanContext): boolean {
    const firstNode = target.fragments[0]?.node;
    if (!firstNode || context.seen.has(firstNode)) return false;
    context.seen.add(firstNode);
    context.targets.push({ ...target, parserId: profile.id });
    return true;
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
    if (siteTargets) return siteTargets;
    const genericTargets = collectGenericProseTargets(effectiveLimit);
    if (genericTargets.length) return genericTargets;

    const broadTargets = collectWholePageScanTargets(effectiveLimit);
    return broadTargets.length ? broadTargets : collectVisibleTextTargets(effectiveLimit);
}

function completeSiteScanTargets(profiles: SiteParserProfile[], limit: number, href: string): ScanTextTarget[] | null {
    if (!profiles.length) return null;
    const siteTargets = collectSiteScanTargets(limit, href) ?? [];
    return siteTargets.length || !hasGenericPageTextFallback(profiles) ? siteTargets : null;
}

function hasGenericPageTextFallback(profiles: SiteParserProfile[]): boolean {
    return profiles.some(profile => profile.includeGenericPageText);
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
    log.debugThrottled('whole-page-targets', 2500, 'Collected whole-page scan targets', { targets: targets.length });
    return targets.map(target => ({ ...target, parserId: target.parserId ?? 'whole-page-parser' }));
}

function collectGenericProseTargets(limit: number): FragmentTextTarget[] {
    const roots = genericProseRoots();
    const collection: GenericProseCollection = { targets: [], seen: new Set(), limit };

    for (const root of roots) {
        collectGenericProseTargetsFromRoot(root, collection);
        if (genericProseCollectionFull(collection)) break;
    }

    log.debugThrottled('generic-prose-targets', 2500, 'Collected generic prose targets', { roots: roots.length, targets: collection.targets.length });
    return collection.targets;
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
    const firstNode = target.fragments[0]?.node;
    if (!firstNode) return false;
    if (seen.has(firstNode)) return false;
    seen.add(firstNode);
    targets.push({ ...target, parserId: 'generic-prose-parser' });
    return true;
}

function isUsefulGenericProseRoot(root: HTMLElement): boolean {
    if (root.closest(GENERIC_PROSE_EXCLUDE)) return false;
    const text = root.textContent?.replace(/\s+/g, '').trim() ?? '';
    if (text.length < 12) return false;
    return /[\u3040-\u30ff\u3400-\u9fff]/u.test(text);
}

function queryParserRoots(profile: SiteParserProfile): HTMLElement[] {
    const roots: HTMLElement[] = [];
    for (const selector of profile.roots) {
        roots.push(...Array.from(document.querySelectorAll<HTMLElement>(selector)));
    }
    const result = uniqueVisibleRoots(roots);
    log.debugThrottled(`parser-roots:${profile.id}`, 2000, 'Queried parser roots', { parserId: profile.id, roots: result.length });
    return result;
}

function uniqueVisibleRoots(roots: HTMLElement[]): HTMLElement[] {
    const unique: HTMLElement[] = [];
    for (const root of roots) {
        if (unique.some(existing => existing === root || existing.contains(root))) continue;
        unique.push(root);
    }
    return unique;
}
