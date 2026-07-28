import { createRequire } from 'node:module';
import { defineConfig, type HeadConfig } from 'vitepress';
import {
    internalDocsExcludeGlobs,
    navigationRoutes,
    sitemapItemsForRoutes,
} from '../../config/docs/published-pages';
import { jpdbAudioDevProxyPlugin } from '../../config/vite/jpdb-audio-proxy';
import pkg from '../../package.json' with { type: 'json' };

const { hostedAppearanceBootSnippet } = createRequire(import.meta.url)('../../scripts/lib/hosted-appearance-boot.cjs') as {
    hostedAppearanceBootSnippet(mode: 'docs' | 'surface'): string;
};
const { hostedInstallRouteSnippet } = createRequire(import.meta.url)('../../scripts/lib/hosted-install-route.cjs') as {
    hostedInstallRouteSnippet(): string;
};

const repositoryName = 'yomu-reader';
const base = '/';
const origin = 'https://yomureader.com';
const siteUrl = `${origin}${base}`;
const socialImage = `${siteUrl}og-image.png`;
const newTabLink = '/study/';
const statsLink = '/study/?mode=stats';
const videoPlayerLink = '/video-player/index.html';
const pdfReaderLink = '/pdf-reader/index.html';
const stripeDonationLink = 'https://support.yomureader.com/donate';
const stripeDonationIcon = {
    svg: '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Stripe</title><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"/></svg>',
};
const patreonDonationIcon = {
    svg: '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Patreon</title><path d="M22.957 7.21c-.004-3.064-2.391-5.576-5.191-6.482-3.478-1.125-8.064-.962-11.384.604C2.357 3.231 1.093 7.391 1.046 11.54c-.039 3.411.302 12.396 5.369 12.46 3.765.047 4.326-4.804 6.068-7.141 1.24-1.662 2.836-2.132 4.801-2.618 3.376-.836 5.678-3.501 5.673-7.031Z"/></svg>',
};
const kofiDonationIcon = {
    svg: '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Ko-fi</title><path d="M11.351 2.715c-2.7 0-4.986.025-6.83.26C2.078 3.285 0 5.154 0 8.61c0 3.506.182 6.13 1.585 8.493 1.584 2.701 4.233 4.182 7.662 4.182h.83c4.209 0 6.494-2.234 7.637-4a9.5 9.5 0 0 0 1.091-2.338C21.792 14.688 24 12.22 24 9.208v-.415c0-3.247-2.13-5.507-5.792-5.87-1.558-.156-2.65-.208-6.857-.208m0 1.947c4.208 0 5.09.052 6.571.182 2.624.311 4.13 1.584 4.13 4v.39c0 2.156-1.792 3.844-3.87 3.844h-.935l-.156.649c-.208 1.013-.597 1.818-1.039 2.546-.909 1.428-2.545 3.064-5.922 3.064h-.805c-2.571 0-4.831-.883-6.078-3.195-1.09-2-1.298-4.155-1.298-7.506 0-2.181.857-3.402 3.012-3.714 1.533-.233 3.559-.26 6.39-.26m6.547 2.287c-.416 0-.65.234-.65.546v2.935c0 .311.234.545.65.545 1.324 0 2.051-.754 2.051-2s-.727-2.026-2.052-2.026m-10.39.182c-1.818 0-3.013 1.48-3.013 3.142 0 1.533.858 2.857 1.949 3.897.727.701 1.87 1.429 2.649 1.896a1.47 1.47 0 0 0 1.507 0c.78-.467 1.922-1.195 2.623-1.896 1.117-1.039 1.974-2.364 1.974-3.897 0-1.662-1.247-3.142-3.039-3.142-1.065 0-1.792.545-2.338 1.298-.493-.753-1.246-1.298-2.312-1.298"/></svg>',
};

function configuredDonationProviderUrl(value: string | undefined, providerHost: string): string | undefined {
    const url = donationProviderUrlCandidate(value);
    return url && donationProviderUrlIsAllowed(url, providerHost) ? url.href : undefined;
}

function donationProviderUrlCandidate(value: string | undefined): URL | undefined {
    const candidate = value?.trim();
    return candidate ? parseDonationProviderUrl(candidate) : undefined;
}

function parseDonationProviderUrl(candidate: string): URL | undefined {
    try {
        return new URL(candidate);
    } catch {
        return undefined;
    }
}

function donationProviderHostMatches(url: URL, providerHost: string): boolean {
    return url.hostname === providerHost || url.hostname === `www.${providerHost}`;
}

function donationProviderUrlIsAllowed(url: URL, providerHost: string): boolean {
    return url.protocol === 'https:' && donationProviderHostMatches(url, providerHost);
}

// Public creator-page URLs stay hidden until they have been verified. Patreon
// also needs an explicit readiness flag because the draft creator page exists
// before the owner completes Patreon's publish flow. Release automation passes
// these values from GitHub repository variables.
const patreonDonationLink = process.env.YOMU_PATREON_ENABLED === '1'
    ? configuredDonationProviderUrl(
        process.env.YOMU_PATREON_URL || 'https://www.patreon.com/yomureader',
        'patreon.com',
    )
    : undefined;
const kofiDonationLink = configuredDonationProviderUrl(process.env.YOMU_KOFI_URL, 'ko-fi.com');
const donationSocialLinks = [
    { icon: stripeDonationIcon, link: stripeDonationLink, ariaLabel: 'Donate to Yomu with Stripe' },
    ...(patreonDonationLink
        ? [{ icon: patreonDonationIcon, link: patreonDonationLink, ariaLabel: 'Support Yomu on Patreon' }]
        : []),
    ...(kofiDonationLink
        ? [{ icon: kofiDonationIcon, link: kofiDonationLink, ariaLabel: 'Support Yomu on Ko-fi' }]
        : []),
];

const siteTitle = 'よむ - Japanese popup reader';
const siteDescription =
    'Yomu helps you read real Japanese in the browser. Look up words on web pages, manga, game text, PDFs, and subtitles, save useful sentences, connect your SRS, prefer Japanese site versions, and filter YouTube for Japanese content.';
const siteVerificationHead = siteVerificationMetaHead([
    { name: 'google-site-verification', value: process.env.YOMU_GOOGLE_SITE_VERIFICATION },
    { name: 'msvalidate.01', value: process.env.YOMU_BING_SITE_VERIFICATION },
    { name: 'yandex-verification', value: process.env.YOMU_YANDEX_SITE_VERIFICATION },
    { name: 'baidu-site-verification', value: process.env.YOMU_BAIDU_SITE_VERIFICATION },
]);

function siteVerificationMetaHead(items: { name: string; value: string | undefined }[]): HeadConfig[] {
    return items.flatMap(({ name, value }) => {
        const content = siteVerificationContent(value);
        return content ? [[
            'meta',
            { name, content },
        ] as HeadConfig] : [];
    });
}

function siteVerificationContent(value: string | undefined): string {
    const trimmed = value?.trim() ?? '';
    const content = trimmed.match(/content=["']([^"']+)["']/i)?.[1]?.trim();
    return content || trimmed;
}

// Turn a VitePress relativePath (e.g. "features.md", "tools/japanese-ocr.md",
// "index.md") into the canonical absolute URL with cleanUrls applied.
function canonicalUrl(relativePath: string): string {
    const clean = relativePath
        .replace(/(^|\/)index\.md$/, '$1')
        .replace(/\.md$/, '');
    return `${siteUrl}${clean}`;
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
                'Yomu Gaming desktop capture',
                'Video subtitle mining',
                'Yomitan dictionary import',
                'Anki card creation',
                'Study card review',
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

const siteNav = [
    // 'Get started' over 'Install': a visitor who has not decided yet is looking
    // for what this is and how to begin, not for a package. 'Guides' over
    // 'Learn': the pages behind it are task guides, and 'Learn' collided with
    // Academy in meaning while describing neither.
    { text: 'Get started', link: '/getting-started' },
    { text: 'Guides', link: '/guides/' },
    { text: 'Tools', link: '/tools/' },
    { text: 'Study', link: newTabLink, target: '_self' },
    { text: 'Academy', link: '/academy/', target: '_self' },
    { text: 'Support', link: '/support' },
    {
        text: 'More',
        items: [
            { text: 'Video Player', link: videoPlayerLink, target: '_self' },
            { text: 'PDF Reader', link: pdfReaderLink, target: '_self' },
            { text: 'Stats', link: statsLink, target: '_self' },
            { text: 'API', link: '/api/', target: '_self' },
            { text: 'Local Audio', link: '/local-audio' },
            { text: 'Changelog', link: '/changelog' },
            { text: 'Privacy', link: '/privacy' },
            { text: 'Support', link: '/support' },
        ],
    },
];

const siteSidebar = [
    {
        text: 'Use よむ',
        items: [
            { text: 'Overview', link: '/' },
            { text: 'Install', link: '/getting-started' },
            { text: 'What it does', link: '/features' },
        ],
    },
    {
        text: 'Tools',
        items: [
            { text: 'All tools', link: '/tools/' },
            { text: 'OCR & manga', link: '/tools/japanese-ocr' },
            { text: 'Subtitles & video', link: '/tools/japanese-subtitle-reader' },
            { text: 'Video Player', link: videoPlayerLink, target: '_self' },
            { text: 'PDF Reader', link: pdfReaderLink, target: '_self' },
            { text: 'Yomu Gaming', link: '/tools/yomu-gaming' },
            { text: 'Furigana reader', link: '/tools/furigana-reader' },
            { text: 'Kanji stroke order', link: '/tools/kanji-stroke-order' },
            { text: 'Study page', link: '/tools/study-page' },
            { text: 'YouTube for Japanese', link: '/tools/youtube-japanese' },
        ],
    },
    {
        text: 'Learn',
        items: [
            { text: 'All guides', link: '/guides/' },
            { text: 'Read manga in Japanese', link: '/guides/read-manga-in-japanese' },
            { text: 'Comprehensible-input YouTube', link: '/guides/comprehensible-input-youtube' },
            { text: 'Mine sentences to Anki', link: '/guides/mine-sentences-to-anki' },
            { text: 'Study setup', link: '/guides/study-setup' },
        ],
    },
    {
        text: 'Project',
        items: [
            { text: 'Support', link: '/support' },
            { text: 'API', link: '/api/', target: '_self' },
            { text: 'Local Audio', link: '/local-audio' },
            { text: 'Changelog', link: '/changelog' },
        ],
    },
];

// Every page the site itself links to. Derived from the nav and sidebar above
// so a new public page reaches search engines as soon as it is linked, and a
// file that lands in docs/ without a navigation entry never does.
const linkedRoutes = navigationRoutes([...siteNav, ...siteSidebar]);

export default defineConfig({
    title: 'よむ',
    description: siteDescription,
    base,
    // Internal engineering notes: kept in the repo, never routed as pages. See
    // config/docs/published-pages.ts for why each pattern is here.
    srcExclude: internalDocsExcludeGlobs,
    cleanUrls: true,
    lastUpdated: true,
    sitemap: {
        hostname: siteUrl,
        // Second gate behind srcExclude. scripts/submit-indexnow.mjs pushes
        // every sitemap URL to search engines, so the sitemap is what actually
        // gets pages indexed: keep it to pages the site navigates to.
        transformItems(items) {
            const published = sitemapItemsForRoutes(items, linkedRoutes);
            const omitted = items.filter(item => !published.includes(item));
            if (omitted.length) {
                const routes = omitted.map(item => `${base}${item.url}`).join(', ');
                console.warn(`[sitemap] omitted ${omitted.length} page(s) with no navigation entry: ${routes}`);
            }
            return published;
        },
    },
    vite: {
        plugins: [jpdbAudioDevProxyPlugin()],
        resolve: {
            // Import the renderer package directly instead of Vue's one-line
            // re-export facade. In linked worktrees that facade can resolve
            // through the primary checkout and load a second Vue runtime,
            // which loses VitePress's injected page data during SSR.
            alias: { 'vue/server-renderer': '@vue/server-renderer' },
        },
    },
    // Static, page-independent head entries. Per-page canonical, og:url,
    // og/twitter titles + descriptions, and JSON-LD are added in transformHead
    // so every URL gets accurate metadata instead of the home page's values.
    head: [
        ['link', { rel: 'preload', href: `${base}yomu-icon.svg`, as: 'image', type: 'image/svg+xml', fetchpriority: 'high' }],
        ['link', { rel: 'preload', href: `${base}yomu.user.js?v=${encodeURIComponent(pkg.version)}`, as: 'script' }],
        ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}yomu-icon.svg` }],
        ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${base}favicon-32x32.png` }],
        ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: `${base}favicon-16x16.png` }],
        ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: `${base}apple-touch-icon.png` }],
        ['link', { rel: 'manifest', href: `${base}manifest.webmanifest` }],
        ['link', { rel: 'stylesheet', href: `${base}yomu.css` }],
        ['meta', { name: 'apple-mobile-web-app-title', content: 'よむ' }],
        ['meta', { name: 'mobile-web-app-capable', content: 'yes' }],
        ['meta', { name: 'theme-color', content: '#5ea780' }],
        // Runs while the head is still parsing, so the reader's accent and
        // theme are on <html> before the first paint. Without it the static
        // brand green paints first and every page flashes green before the
        // hydrated bundle re-applies the chosen accent. Placed after the
        // theme-color meta so the snippet can repoint it too.
        ['script', {}, hostedAppearanceBootSnippet('docs')],
        // Stamps the install route on <html> while the head is still parsing, so
        // the fold's one button is already the right store for this browser when
        // it first paints. Without it the page still works: the markup carries
        // every route, and the CSS default promotes the userscript, which is the
        // build that runs everywhere.
        ['script', {}, hostedInstallRouteSnippet()],
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
        ...siteVerificationHead,
    ],
    transformHead({ pageData }) {
        const pageUrl = canonicalUrl(pageData.relativePath);
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
    transformHtml(code, id) {
        // VitePress emits `rel="preload stylesheet"` for its main CSS chunks.
        // Chromium treats those as preload-only in the built preview, leaving the
        // homepage unstyled except for yomu.css. Emit normal stylesheet links so
        // every static page applies the theme CSS without relying on rel-token
        // interpretation.
        const styled = code.replace(
            /<link rel="preload stylesheet" href="([^"]+)" as="style">/g,
            '<link rel="stylesheet" href="$1">',
        );
        // The homepage's screenshots opt out of image OCR per-figure in
        // docs/index.md (`data-yomu-ocr="ignore"`, the reader's own page-side
        // opt-out) rather than via a <body> stamp here: the #manga panel is the
        // one deliberate live OCR surface, and a body-wide stamp would silence it
        // too, since the reader matches the attribute with closest(). The docs
        // a11y audit asserts the panel is the ONLY readable image, so a new
        // screenshot added without the attribute fails the gate instead of
        // silently re-enabling recognition.
        return styled;
    },
    themeConfig: {
        logo: { src: '/yomu-icon.svg', alt: 'よむ app icon' },
        siteTitle: 'yomu',
        nav: siteNav,
        sidebar: siteSidebar,
        search: {
            provider: 'local',
        },
        socialLinks: [
            { icon: 'github', link: `https://github.com/HRussellZFAC023/${repositoryName}` },
            { icon: 'discord', link: 'https://discord.gg/jD6NPURewD' },
            ...donationSocialLinks,
        ],
        footer: {
            message: 'Free and open source. Install as a userscript, or as a Chrome or Firefox extension.',
            copyright: 'Released under the MIT license.',
        },
    },
});
