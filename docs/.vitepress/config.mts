import { defineConfig, type HeadConfig } from 'vitepress';
import { jpdbAudioDevProxyPlugin } from '../../config/vite/jpdb-audio-proxy';

const repositoryName = 'yomu-reader';
const base = `/${repositoryName}/`;
const origin = 'https://hrussellzfac023.github.io';
const siteUrl = `${origin}${base}`;
const socialImage = `${siteUrl}og-image.png`;
const newTabLink = '/newtab/index.html';
const statsLink = '/newtab/index.html?mode=stats';
const videoPlayerLink = '/video-player/index.html';
const pdfReaderLink = '/pdf-reader/index.html';

const siteTitle = 'よむ - Free Japanese popup reader';
const siteDescription =
    'よむ is a free Japanese immersion reader. Tap a word on any web page, manga, or subtitle to see readings, meanings, kanji, audio, and example sentences, then mine it to JPDB, Yomitan, or Anki.';

// Turn a VitePress relativePath (e.g. "features.md", "tools/japanese-ocr.md",
// "index.md") into the canonical absolute URL with cleanUrls applied.
function canonicalUrl(relativePath: string): string {
    const clean = relativePath
        .replace(/(^|\/)index\.md$/, '$1')
        .replace(/\.md$/, '');
    return `${siteUrl}${clean}`;
}

// Internal planning/research docs that should not be indexed or sitemapped —
// they are build artifacts of the dev process, not pages for learners. Marked
// noindex (transformHead) and dropped from the sitemap (transformItems).
const INTERNAL_PAGE_RE = /^(adr\/|research\/|.*-backlog\.md$|community-intel|refactor-backlog|study-hub-parity|kanji-source-research)/;
function isInternalPage(relativePath: string): boolean {
    return INTERNAL_PAGE_RE.test(relativePath);
}

interface PageDataLike {
    relativePath: string;
    title?: string;
    description?: string;
    frontmatter: Record<string, unknown>;
}

function withBrand(title: string): string {
    return /よむ|yomu/i.test(title) ? title : `${title} · よむ`;
}

function ogTitleFor(pageData: PageDataLike): string {
    const fmTitle = typeof pageData.frontmatter.title === 'string' ? pageData.frontmatter.title : '';
    if (fmTitle) return withBrand(fmTitle);
    const title = pageData.title?.trim();
    if (!title || title === 'よむ' || title === 'Home') return siteTitle;
    return withBrand(title);
}

function ogDescriptionFor(pageData: PageDataLike): string {
    const desc = (pageData.description || (typeof pageData.frontmatter.description === 'string' ? pageData.frontmatter.description : '')).trim();
    return desc || siteDescription;
}

// Structured data. SoftwareApplication + WebSite on the home page so search
// engines understand what よむ is (a free educational app); BreadcrumbList on
// every interior page for richer SERP breadcrumbs.
function jsonLdFor(pageData: PageDataLike, pageUrl: string): HeadConfig[] {
    const isHome = pageData.relativePath === 'index.md';
    const blocks: object[] = [];

    if (isHome) {
        blocks.push({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'よむ (Yomu)',
            alternateName: 'Yomu Japanese Reader',
            applicationCategory: 'EducationalApplication',
            applicationSubCategory: 'Language Learning',
            operatingSystem: 'Chrome, Firefox, Safari, iOS, Android (userscript)',
            url: siteUrl,
            downloadUrl: `${siteUrl}yomu.user.js`,
            description: siteDescription,
            image: socialImage,
            screenshot: `${siteUrl}screenshots/real-popup-lookup.png`,
            inLanguage: ['en', 'ja'],
            license: 'https://opensource.org/licenses/MIT',
            isAccessibleForFree: true,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            featureList: [
                'Japanese popup dictionary lookup',
                'Manga and image OCR',
                'Video subtitle mining',
                'JPDB review and mining',
                'Yomitan dictionary import',
                'Anki card creation',
                'Kanji stroke order and drilldown',
                'Pitch accent and audio',
            ],
            author: {
                '@type': 'Person',
                name: 'Henry Russell',
                url: 'https://github.com/HRussellZFAC023',
            },
        });
        blocks.push({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'よむ',
            alternateName: 'Yomu Japanese Reader',
            url: siteUrl,
            description: siteDescription,
            inLanguage: 'en',
        });
    } else {
        const crumbName = ogTitleFor(pageData).replace(' · よむ', '');
        blocks.push({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'よむ', item: siteUrl },
                { '@type': 'ListItem', position: 2, name: crumbName, item: pageUrl },
            ],
        });
    }

    return blocks.map(block => [
        'script',
        { type: 'application/ld+json' },
        JSON.stringify(block),
    ]);
}

export default defineConfig({
    title: 'よむ',
    description: siteDescription,
    base,
    cleanUrls: true,
    lastUpdated: true,
    sitemap: {
        hostname: siteUrl,
        transformItems(items) {
            // siteUrl ends in "/", so strip it to recover the relativePath-ish tail.
            return items.filter(item => {
                const tail = item.url.replace(/\/$/, '');
                return !isInternalPage(tail);
            });
        },
    },
    vite: {
        plugins: [jpdbAudioDevProxyPlugin()],
    },
    // Static, page-independent head entries. Per-page canonical, og:url,
    // og/twitter titles + descriptions, and JSON-LD are added in transformHead
    // so every URL gets accurate metadata instead of the home page's values.
    head: [
        ['link', { rel: 'preload', href: `${base}yomu-icon.svg`, as: 'image', type: 'image/svg+xml', fetchpriority: 'high' }],
        ['link', { rel: 'preload', href: `${base}yomu.user.js`, as: 'script' }],
        ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}yomu-icon.svg` }],
        ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${base}favicon-32x32.png` }],
        ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: `${base}favicon-16x16.png` }],
        ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: `${base}apple-touch-icon.png` }],
        ['link', { rel: 'stylesheet', href: `${base}yomu.css` }],
        ['meta', { name: 'apple-mobile-web-app-title', content: 'よむ' }],
        ['meta', { name: 'theme-color', content: '#5ea780' }],
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:site_name', content: 'よむ' }],
        ['meta', { property: 'og:locale', content: 'en_US' }],
        ['meta', { property: 'og:image', content: socialImage }],
        ['meta', { property: 'og:image:secure_url', content: socialImage }],
        ['meta', { property: 'og:image:type', content: 'image/png' }],
        ['meta', { property: 'og:image:width', content: '1200' }],
        ['meta', { property: 'og:image:height', content: '630' }],
        ['meta', { property: 'og:image:alt', content: 'よむ app icon and Japanese reader preview card' }],
        ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
        ['meta', { name: 'twitter:image', content: socialImage }],
        ['meta', { name: 'twitter:image:alt', content: 'よむ app icon and Japanese reader preview card' }],
    ],
    transformHead({ pageData }) {
        const pageUrl = canonicalUrl(pageData.relativePath);
        // Keep internal planning/research docs out of the index, but follow
        // their links so any useful outbound links still pass equity.
        if (isInternalPage(pageData.relativePath)) {
            return [
                ['meta', { name: 'robots', content: 'noindex, follow' }],
                ['link', { rel: 'canonical', href: pageUrl }],
            ];
        }
        const ogTitle = ogTitleFor(pageData);
        const ogDescription = ogDescriptionFor(pageData);
        const head: HeadConfig[] = [
            ['link', { rel: 'canonical', href: pageUrl }],
            ['meta', { property: 'og:url', content: pageUrl }],
            ['meta', { property: 'og:title', content: ogTitle }],
            ['meta', { property: 'og:description', content: ogDescription }],
            ['meta', { name: 'twitter:title', content: ogTitle }],
            ['meta', { name: 'twitter:description', content: ogDescription }],
        ];
        head.push(...jsonLdFor(pageData, pageUrl));
        return head;
    },
    themeConfig: {
        logo: '/yomu-icon.svg',
        siteTitle: 'yomu',
        nav: [
            { text: 'Start', link: '/getting-started' },
            { text: 'Features', link: '/features' },
            { text: 'Tools', link: '/tools/' },
            { text: 'Guides', link: '/guides/' },
            { text: 'Study', link: newTabLink, target: '_self' },
            { text: 'Support', link: '/support' },
            {
                text: 'More',
                items: [
                    { text: 'Video Player', link: videoPlayerLink, target: '_self' },
                    { text: 'PDF Reader', link: pdfReaderLink, target: '_self' },
                    { text: 'Local Audio', link: '/local-audio' },
                    { text: 'Stats', link: statsLink, target: '_self' },
                    { text: 'Changelog', link: '/changelog' },
                ],
            },
        ],
        sidebar: [
            {
                text: 'Start',
                items: [
                    { text: 'Overview', link: '/' },
                    { text: 'Getting Started', link: '/getting-started' },
                    { text: 'Features', link: '/features' },
                    { text: 'Local Audio', link: '/local-audio' },
                    { text: 'Video Player', link: videoPlayerLink, target: '_self' },
                    { text: 'PDF Reader', link: pdfReaderLink, target: '_self' },
                ],
            },
            {
                text: 'Free Tools',
                items: [
                    { text: 'All tools', link: '/tools/' },
                    { text: 'Japanese OCR & manga reader', link: '/tools/japanese-ocr' },
                    { text: 'Furigana reader', link: '/tools/furigana-reader' },
                    { text: 'Kanji stroke order', link: '/tools/kanji-stroke-order' },
                    { text: 'Subtitle miner', link: '/tools/japanese-subtitle-reader' },
                    { text: 'JPDB study & review', link: '/tools/jpdb-study' },
                    { text: 'YouTube for Japanese', link: '/tools/youtube-japanese' },
                ],
            },
            {
                text: 'Guides',
                items: [
                    { text: 'All guides', link: '/guides/' },
                    { text: 'Read manga in Japanese', link: '/guides/read-manga-in-japanese' },
                    { text: 'Mine sentences to Anki', link: '/guides/mine-sentences-to-anki' },
                    { text: 'Comprehensible-input YouTube', link: '/guides/comprehensible-input-youtube' },
                    { text: 'Yomitan vs JPDB vs Anki', link: '/guides/yomitan-jpdb-anki' },
                    { text: 'Free Migaku alternative', link: '/compare/migaku-alternative' },
                ],
            },
            {
                text: 'Project',
                items: [
                    { text: 'Support', link: '/support' },
                    { text: 'Changelog', link: '/changelog' },
                ],
            },
        ],
        search: {
            provider: 'local',
        },
        socialLinks: [
            { icon: 'github', link: `https://github.com/HRussellZFAC023/${repositoryName}` },
        ],
        footer: {
            message: 'Free userscript now. Chrome, Firefox, and Safari packages are being prepared for store submission.',
            copyright: 'Released under the MIT license.',
        },
    },
});
