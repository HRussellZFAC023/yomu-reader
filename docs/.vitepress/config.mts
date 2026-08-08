import { createRequire } from 'node:module';
import { defineConfig, type DefaultTheme, type HeadConfig } from 'vitepress';
import {
    internalDocsExcludeGlobs,
    navigationRoutes,
    sitemapItemsForRoutes,
    withHostedAppSitemapItems,
} from '../../config/docs/published-pages';
import { heroStudyLanguages } from '../../config/docs/product-claims';
import {
    legacyDocsHashRedirects,
    legacyDocsRedirect,
} from '../../config/docs/legacy-redirects';
import { jpdbAudioDevProxyPlugin } from '../../config/vite/jpdb-audio-proxy';
import { APPS_NAV_LABEL, docsNav } from './shared/nav';
import { installReviewedDocsMarkdownLocales } from './locales/markdown-localization';
import {
    websiteRouteForSource,
    websiteRoutePublication,
    type WebsiteRouteDefinition,
} from './locales/route-catalog';
import {
    localizedWebsiteRoute,
    localizeWebsiteNavigation,
    rootWebsiteRoute,
    websiteLocale,
    websiteLocaleForRelativePath,
    websiteMessage,
    type WebsiteLocaleId,
    type WebsiteNavigationItem,
} from './locales/site-locales';
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
const videoPlayerLink = '/video-player/';
const pdfReaderLink = '/pdf-reader/';
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

const siteDescription = websiteMessage('docs.site.description', 'en');
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

function canonicalUrl(relativePath: string, locale = websiteLocaleForRelativePath(relativePath)): string {
    const route = localizedWebsiteRoute(rootWebsiteRoute(relativePath), locale);
    return new URL(route.replace(/^\//, ''), siteUrl).href;
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

function ogTitleFor(pageData: PageDataLike, locale: WebsiteLocaleId): string {
    const fmTitle = typeof pageData.frontmatter.title === 'string' ? pageData.frontmatter.title : '';
    if (fmTitle) return withBrand(fmTitle);
    const title = pageData.title?.trim();
    if (!title || title === 'よむ' || title === 'Home') return websiteMessage('docs.site.title', locale);
    return withBrand(title);
}

function ogDescriptionFor(pageData: PageDataLike, locale: WebsiteLocaleId): string {
    const desc = (pageData.description || (typeof pageData.frontmatter.description === 'string' ? pageData.frontmatter.description : '')).trim();
    return desc || websiteMessage('docs.site.description', locale);
}

// Structured data. SoftwareApplication + WebSite on the home page so search
// engines understand what よむ is (a free educational app); BreadcrumbList on
// every interior page for richer SERP breadcrumbs.
function jsonLdFor(pageData: PageDataLike, pageUrl: string, locale: WebsiteLocaleId): HeadConfig[] {
    const isHome = rootWebsiteRoute(pageData.relativePath) === '/';
    const localeDescription = websiteMessage('docs.site.description', locale);
    const localeHome = canonicalUrl('index.md', locale);
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
            url: localeHome,
            downloadUrl: `${siteUrl}yomu.user.js`,
            description: localeDescription,
            image: socialImage,
            screenshot: `${siteUrl}screenshots/real-popup-lookup.png`,
            inLanguage: locale,
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
            url: localeHome,
            description: localeDescription,
            inLanguage: locale,
        });
    } else {
        const crumbName = ogTitleFor(pageData, locale).replace(' · よむ', '');
        blocks.push({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'よむ', item: localeHome },
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

// Defined in docs/.vitepress/shared/nav.ts so the hosted app shells (Study, PDF
// Reader, Video Player) render the same menu from the same list — they used to
// keep a second copy in theme/index.ts, and it drifted. 'Support' also appeared
// twice here, once in the bar and once in More, which is how a nav entry stops
// meaning anything.
const siteNav = docsNav() as WebsiteNavigationItem[];

const siteSidebar: WebsiteNavigationItem[] = [
    {
        text: 'Learn Japanese',
        items: [
            { text: '0. Start here', link: '/learn/' },
            { text: '1. The approach', link: '/learn/approach' },
            { text: '2. Week one', link: '/learn/week-one' },
            { text: '3. Building a core', link: '/learn/building-a-core' },
            { text: '4. Reading', link: '/learn/reading' },
            { text: '5. Watching', link: '/learn/watching' },
            { text: '6. Manga and games', link: '/learn/manga-and-games' },
            { text: '7. Keeping words', link: '/learn/keeping-words' },
            { text: '8. Staying with it', link: '/learn/staying-with-it' },
            { text: '9. Your own setup', link: '/learn/your-own-setup' },
            { text: '10. Reference', link: '/learn/reference' },
        ],
    },
    {
        text: APPS_NAV_LABEL,
        items: [
            { text: 'Apps overview', link: '/learn/reference#apps' },
            { text: 'Video Player', link: videoPlayerLink, target: '_self' },
            { text: 'PDF Reader', link: pdfReaderLink, target: '_self' },
            { text: 'Yomu Gaming', link: '/learn/manga-and-games#read-a-game-frame' },
            { text: 'Academy', link: '/academy/', target: '_self' },
        ],
    },
    {
        text: 'Reference and help',
        items: [
            { text: 'Homepage', link: '/' },
            { text: 'Grammar coverage', link: '/reference/grammar' },
            { text: 'Settings reference', link: '/reference/settings' },
            { text: 'FAQ', link: '/faq' },
            { text: 'Privacy', link: '/privacy/' },
            { text: 'Local Audio', link: '/local-audio' },
            { text: 'Support', link: '/support' },
            { text: 'Membership', link: '/membership' },
            { text: 'API', link: '/api/', target: '_self' },
            { text: 'Changelog', link: '/changelog' },
        ],
    },
];

// Every page the site itself links to. Derived from the nav and sidebar above
// so a new public page reaches search engines as soon as it is linked, and a
// file that lands in docs/ without a navigation entry never does.
const localizedSiteNavigation = Object.freeze({
    en: {
        nav: localizeWebsiteNavigation(siteNav, 'en'),
        sidebar: localizeWebsiteNavigation(siteSidebar, 'en'),
    },
    ja: {
        nav: localizeWebsiteNavigation(siteNav, 'ja'),
        sidebar: localizeWebsiteNavigation(siteSidebar, 'ja'),
    },
});
const linkedRoutes = navigationRoutes([
    ...localizedSiteNavigation.en.nav,
    ...localizedSiteNavigation.en.sidebar,
    ...localizedSiteNavigation.ja.nav,
    ...localizedSiteNavigation.ja.sidebar,
]);
const hostedHeroStudyLanguages = heroStudyLanguages();

function docsThemeConfig(locale: WebsiteLocaleId): DefaultTheme.Config {
    const navigation = localizedSiteNavigation[locale];
    return {
        logo: { src: '/yomu-icon.svg', alt: websiteMessage('docs.site.logoAlt', locale) },
        logoLink: localizedWebsiteRoute('/', locale),
        siteTitle: 'yomu',
        nav: navigation.nav as DefaultTheme.NavItem[],
        sidebar: navigation.sidebar as DefaultTheme.SidebarItem[],
        search: {
            provider: 'local',
            options: {
                locales: {
                    [locale === 'en' ? 'root' : locale]: {
                        translations: searchTranslations(locale),
                    },
                },
            },
        },
        socialLinks: [
            { icon: 'github', link: `https://github.com/HRussellZFAC023/${repositoryName}` },
            { icon: 'discord', link: 'https://discord.gg/jD6NPURewD' },
        ],
        footer: {
            message: websiteMessage('docs.footer.message', locale),
            copyright: websiteMessage('docs.footer.copyright', locale),
        },
        darkModeSwitchLabel: websiteMessage('docs.theme.darkMode', locale),
        lightModeSwitchTitle: websiteMessage('docs.theme.lightMode', locale),
        darkModeSwitchTitle: websiteMessage('docs.theme.darkTheme', locale),
        sidebarMenuLabel: websiteMessage('docs.theme.sidebarMenu', locale),
        returnToTopLabel: websiteMessage('docs.theme.returnTop', locale),
        langMenuLabel: websiteMessage('docs.theme.languageMenu', locale),
        skipToContentLabel: websiteMessage('docs.theme.skip', locale),
        outline: { label: websiteMessage('docs.theme.outline', locale) },
        lastUpdated: { text: websiteMessage('docs.theme.lastUpdated', locale) },
        docFooter: {
            prev: websiteMessage('docs.theme.previous', locale),
            next: websiteMessage('docs.theme.next', locale),
        },
    };
}

function searchTranslations(locale: WebsiteLocaleId) {
    return {
        button: {
            buttonText: websiteMessage('docs.search.open', locale),
            buttonAriaLabel: websiteMessage('docs.search.openLabel', locale),
        },
        modal: {
            displayDetails: websiteMessage('docs.search.displayDetails', locale),
            resetButtonTitle: websiteMessage('docs.search.reset', locale),
            backButtonTitle: websiteMessage('docs.search.back', locale),
            noResultsText: websiteMessage('docs.search.noResults', locale),
            footer: {
                selectText: websiteMessage('docs.search.select', locale),
                navigateText: websiteMessage('docs.search.navigate', locale),
                closeText: websiteMessage('docs.search.close', locale),
            },
        },
    };
}

function socialMetadataHead(
    locale: WebsiteLocaleId,
    canonicalPageUrl: string,
    title: string,
    description: string,
): HeadConfig[] {
    return [
        ['link', { rel: 'canonical', href: canonicalPageUrl }],
        ['meta', { property: 'og:url', content: canonicalPageUrl }],
        ['meta', { property: 'og:locale', content: locale === 'ja' ? 'ja_JP' : 'en_US' }],
        ['meta', { property: 'og:title', content: title }],
        ['meta', { property: 'og:description', content: description }],
        ['meta', { property: 'og:image:alt', content: websiteMessage('docs.site.imageAlt', locale) }],
        ['meta', { name: 'twitter:title', content: title }],
        ['meta', { name: 'twitter:description', content: description }],
        ['meta', { name: 'twitter:image:alt', content: websiteMessage('docs.site.imageAlt', locale) }],
    ];
}

function openGraphLocaleAlternateHead(
    definition: WebsiteRouteDefinition | undefined,
    locale: WebsiteLocaleId,
): HeadConfig[] {
    if (locale === 'ja') return [['meta', { property: 'og:locale:alternate', content: 'en_US' }]];
    if (definition && websiteRoutePublication(definition, 'ja')) {
        return [['meta', { property: 'og:locale:alternate', content: 'ja_JP' }]];
    }
    return [];
}

function routeAlternateHead(
    definition: WebsiteRouteDefinition | undefined,
    relativePath: string,
): HeadConfig[] {
    if (!definition) return [];
    const sourceAlternates: HeadConfig[] = [
        ['link', { rel: 'alternate', hreflang: 'en', href: canonicalUrl(relativePath, 'en') }],
        ['link', { rel: 'alternate', hreflang: 'x-default', href: canonicalUrl(relativePath, 'en') }],
    ];
    if (!websiteRoutePublication(definition, 'ja')) return sourceAlternates;
    return [
        ...sourceAlternates,
        ['link', { rel: 'alternate', hreflang: 'ja', href: canonicalUrl(relativePath, 'ja') }],
    ];
}

function legacyRedirectHead(relativePath: string, redirect: string | undefined): HeadConfig[] {
    if (!redirect) return [];
    const hashRedirects = legacyDocsHashRedirects(relativePath);
    return [
        ['meta', { 'http-equiv': 'refresh', content: `0; url=${redirect}` }],
        ['script', {}, `(() => { const fallback = ${JSON.stringify(redirect)}; const byHash = ${JSON.stringify(hashRedirects)}; const target = byHash[location.hash] || fallback; location.replace(target); })();`],
    ];
}

export default defineConfig({
    title: 'よむ',
    description: siteDescription,
    base,
    locales: {
        root: {
            label: 'English',
            link: '/',
            lang: 'en',
            dir: websiteLocale('en')?.direction ?? 'ltr',
            title: 'よむ',
            description: websiteMessage('docs.site.description', 'en'),
            themeConfig: docsThemeConfig('en'),
        },
        ja: {
            label: '日本語',
            link: '/ja/',
            lang: 'ja',
            dir: websiteLocale('ja')?.direction ?? 'ltr',
            title: 'よむ',
            description: websiteMessage('docs.site.description', 'ja'),
            themeConfig: docsThemeConfig('ja'),
        },
    },
    // Internal engineering notes: kept in the repo, never routed as pages. See
    // config/docs/published-pages.ts for why each pattern is here.
    srcExclude: internalDocsExcludeGlobs,
    cleanUrls: true,
    lastUpdated: true,
    markdown: {
        config: installReviewedDocsMarkdownLocales,
    },
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
            // Hosted apps live in docs/public, so they are never in `items` at all.
            return withHostedAppSitemapItems(published, url => ({ url }));
        },
    },
    vite: {
        plugins: [jpdbAudioDevProxyPlugin()],
        define: {
            __YOMU_HERO_LANGUAGES__: JSON.stringify(hostedHeroStudyLanguages),
        },
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
        // Marks the theme as RESOLVED by script. The homepage palette is driven
        // by tokens declared twice: under `.dark` (authoritative whenever the
        // boot above has run) and under `prefers-color-scheme: dark` gated on
        // the absence of this marker, so a visitor with no JavaScript still gets
        // the night palette from the OS while an explicit "light" choice on a
        // dark machine can never be overridden by the media query. VitePress
        // only ever adds `dark`, so this is the only signal CSS has that a
        // preference was actually decided rather than merely inherited.
        ['script', {}, "(()=>{try{document.documentElement.classList.add('yomu-theme-resolved');}catch{}})();"],
        // Stamps the install route on <html> while the head is still parsing, so
        // the fold's one button is already the right store for this browser when
        // it first paints. Without it the page still works: the markup carries
        // every route, and the CSS default promotes the userscript, which is the
        // build that runs everywhere.
        ['script', {}, hostedInstallRouteSnippet()],
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:site_name', content: 'よむ' }],
        ['meta', { property: 'og:image', content: socialImage }],
        ['meta', { property: 'og:image:secure_url', content: socialImage }],
        ['meta', { property: 'og:image:type', content: 'image/png' }],
        ['meta', { property: 'og:image:width', content: '1200' }],
        ['meta', { property: 'og:image:height', content: '630' }],
        ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
        ['meta', { name: 'twitter:image', content: socialImage }],
        ...siteVerificationHead,
    ],
    transformPageData(pageData) {
        const definition = websiteRouteForSource(pageData.relativePath);
        if (!definition) return;
        const locale = websiteLocaleForRelativePath(pageData.relativePath);
        const publication = websiteRoutePublication(definition, locale);
        if (!publication) throw new Error(`Unreviewed ${locale} route reached VitePress: ${pageData.relativePath}`);
        pageData.title = publication.title;
        pageData.description = publication.description;
        pageData.frontmatter.title = publication.title;
        pageData.frontmatter.description = publication.description;
    },
    transformHead({ pageData }) {
        const locale = websiteLocaleForRelativePath(pageData.relativePath);
        const definition = websiteRouteForSource(pageData.relativePath);
        const pageUrl = canonicalUrl(pageData.relativePath, locale);
        const ogTitle = ogTitleFor(pageData, locale);
        const ogDescription = ogDescriptionFor(pageData, locale);
        const legacyRedirect = locale === 'en' ? legacyDocsRedirect(pageData.relativePath) : undefined;
        const canonicalPageUrl = legacyRedirect ? new URL(legacyRedirect, siteUrl).href : pageUrl;
        return [
            ...socialMetadataHead(locale, canonicalPageUrl, ogTitle, ogDescription),
            ...openGraphLocaleAlternateHead(definition, locale),
            ...routeAlternateHead(definition, pageData.relativePath),
            ...legacyRedirectHead(pageData.relativePath, legacyRedirect),
            ...jsonLdFor(pageData, canonicalPageUrl, locale),
        ];
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
    themeConfig: docsThemeConfig('en'),
});
