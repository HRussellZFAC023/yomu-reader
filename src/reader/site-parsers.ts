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
    matches(url: URL): boolean;
}

const COMMON_EXCLUDE = [
    'nav',
    'header',
    'footer',
    'aside',
    'button',
    'a[role="button"]',
    '[role="dialog"]',
    '[aria-modal="true"]',
    '[data-jpdb-reader-root]',
    '.jpdb-reader-word',
    '[class*="audio" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class*="listen" i]',
    '[class*="button" i]',
    '[class*="btn" i]',
    '[class*="voice" i]',
    '[aria-label*="聞"]',
    '[aria-label*="音声"]',
].join(',');
const ASBPLAYER_ROOT_SELECTOR = '.asbplayer-offscreen, .asbplayer-subtitles-container-bottom';
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
        name: 'YouTube comments',
        description: 'Japanese comments in YouTube comment views.',
        roots: ['ytd-comment-view-model', '#content-text'],
        matches: url => url.hostname === 'youtube.com'
            || url.hostname.endsWith('.youtube.com')
            || url.hostname === 'youtu.be',
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
        name: 'NHK',
        description: 'NHK and NHK Easy article text with native ruby.',
        roots: [
            'main',
            'article',
            '#main',
            '#js-article-body',
            '#js-article-date',
            '.article-title',
            '[data-testid*="article"]',
        ],
        exclude: [
            COMMON_EXCLUDE,
            '.soundButton',
            '.js-sound',
            '.js-play',
            '.player',
            '[onclick]',
            '[data-audio]',
        ].join(','),
        matches: url => (
            (url.hostname === 'news.web.nhk' || url.hostname.endsWith('.nhk.or.jp'))
            && (/\/news\/(?:html|easy)\//.test(url.pathname) || /\/news\/easy\//.test(url.pathname))
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
    if (!profiles.length) {
        return null;
    }

    const targets: FragmentTextTarget[] = [];
    const seen = new Set<Text>();

    for (const profile of profiles) {
        const roots = queryParserRoots(profile);
        if (!roots.length) continue;

        for (const root of roots) {
            const remaining = limit - targets.length;
            if (remaining <= 0) break;
            const collected = collectFragmentTextTargetsIn(root, remaining, true, profile.exclude ?? COMMON_EXCLUDE, { allowUiText: profile.allowUiText, minLength: profile.minLength });
            for (const target of collected) {
                const firstNode = target.fragments[0]?.node;
                if (!firstNode || seen.has(firstNode)) continue;
                seen.add(firstNode);
                targets.push({ ...target, parserId: profile.id });
                if (targets.length >= limit) break;
            }
        }
    }

    if (targets.length) {
        return targets;
    }
    return profiles.some(profile => profile.id !== 'asbplayer-parser') ? [] : null;
}

export function collectScanTargets(limit = 40, href = window.location.href): ScanTextTarget[] {
    const siteTargets = collectSiteScanTargets(limit, href);
    if (siteTargets !== null) return siteTargets;
    return collectVisibleTextTargets(limit);
}

function queryParserRoots(profile: SiteParserProfile): HTMLElement[] {
    const roots: HTMLElement[] = [];
    for (const selector of profile.roots) {
        roots.push(...Array.from(document.querySelectorAll<HTMLElement>(selector)));
    }
    if (!roots.length && profile.id === 'nhk-parser') roots.push(document.body);
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
