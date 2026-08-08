import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    internalDocsExcludeGlobs,
    isInternalDocPath,
    navigationRoutes,
    sitemapItemsForRoutes,
    sitemapRouteKey,
    withHostedAppSitemapItems,
} from '../../config/docs/published-pages';
import {
    assertStudyTargetClaimReadiness,
    HOMEPAGE_STUDY_TARGET_CLAIM_READINESS,
    heroStudyLanguages,
    measuredDefinitionLanguageCount,
} from '../../config/docs/product-claims';
import {
    LEGACY_DOC_HASH_REDIRECTS,
    LEGACY_DOC_REDIRECTS,
} from '../../config/docs/legacy-redirects';
import {
    MEMBERSHIP_NAV,
    docsNav,
    hostedShellNavMarkup,
    hostedShellNavRoutes,
    siteNavRoutes,
} from '../../src/reader/app/site-nav';
import { LEARNING_TARGET_ROSTER } from '../../src/reader/languages/roster';
import { learningTargetModuleFor } from '../../src/reader/languages/registry';
import {
    PUBLISHED_WEBSITE_ROUTES,
    websiteNavigationLabel,
} from '../../docs/.vitepress/locales/site-locales';
import { publishedWebsiteRouteDefinitions } from '../../docs/.vitepress/locales/route-catalog';

const ROOT = process.cwd();
const DOCS = path.join(ROOT, 'docs');

// Every page yomureader.com is meant to publish, as VitePress sitemap urls
// (docs-relative, cleanUrls applied). Anything else under docs/ is a working
// note that must stay in the repo and off the site.
const ACTIVE_PUBLIC_ROUTES = [...PUBLISHED_WEBSITE_ROUTES];
const JAPANESE_PUBLIC_ROUTES = publishedWebsiteRouteDefinitions('ja')
    .map(definition => `ja/${definition.route}`);

const LEGACY_REDIRECT_ROUTES = Object.keys(LEGACY_DOC_REDIRECTS)
    .map(routeFor)
    .sort();

// Static app routes are copied from docs/public rather than routed by
// VitePress. Keep both PDF URL shapes explicit: a reported bare-route 404 must
// not return while the index.html link continues to look healthy.
const PUBLIC_STATIC_ROUTES = [
    { route: '/pdf-reader/', file: 'docs/public/pdf-reader/index.html' },
    { route: '/pdf-reader/index.html', file: 'docs/public/pdf-reader/index.html' },
] as const;

function readProjectFile(file: string): string {
    return readFileSync(path.join(ROOT, file), 'utf8');
}

function docsMarkdownFiles(directory = DOCS): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return entry.name === '.vitepress' ? [] : docsMarkdownFiles(entryPath);
        }
        if (!entry.isFile() || path.extname(entry.name) !== '.md') return [];
        return [path.relative(DOCS, entryPath).split(path.sep).join('/')];
    });
}

function routeFor(relativePath: string): string {
    return relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
}

describe('published docs pages', () => {
    it('publishes both PDF reader URL shapes', () => {
        expect(PUBLIC_STATIC_ROUTES.map(entry => entry.route)).toEqual([
            '/pdf-reader/',
            '/pdf-reader/index.html',
        ]);
        for (const entry of PUBLIC_STATIC_ROUTES) {
            expect(existsSync(path.join(ROOT, entry.file)), `${entry.route} is missing ${entry.file}`).toBe(true);
        }
    });

    it('routes only the user-facing pages', () => {
        const published = docsMarkdownFiles()
            .filter(file => !isInternalDocPath(file))
            .map(routeFor)
            .sort();

        expect(published).toEqual([
            ...ACTIVE_PUBLIC_ROUTES,
            ...JAPANESE_PUBLIC_ROUTES,
            ...LEGACY_REDIRECT_ROUTES,
        ].sort());
    });

    it('keeps engineering notes, QA probes, and reviewer notes off the site', () => {
        const internal = [
            'academy/STATUS.md',
            'academy/shared-study-srs.md',
            'academy/story/dossiers/rie.md',
            'carryover-workstream-2026-07-18.md',
            'dev/browser-store-automation.md',
            'dev/check-exit-code-incident-2026-07-18.md',
            'dev/check-performance.md',
            'multilingual/README.md',
            'multilingual/roster-source.md',
            'nuclear-backlog-2026-07-16.md',
            'operations/cloudflare-data-recovery.md',
            'operations/cloudflare-data-recovery-drill-2026-07-29.md',
            'public/academy/vendor/kanjivg/ATTRIBUTION.md',
            'qa/ANNOTATION-FIX-PROBE-20260715.md',
            'store-review-notes.md',
        ];

        for (const file of internal) {
            expect(isInternalDocPath(file), file).toBe(true);
        }
        for (const file of ['index.md', 'features.md', 'guides/study-setup.md', 'tools/japanese-ocr.md']) {
            expect(isInternalDocPath(file), file).toBe(false);
        }
    });

    it('links every published page from the site navigation', () => {
        // The nav lives in src/reader/app/site-nav.ts so the docs pages and all
        // three hosted shells render one list instead of four that drift.
        // Search both: config.mts still holds the sidebar, and a page reachable
        // from either counts as linked.
        const sources = [
            readProjectFile('docs/.vitepress/config.mts'),
            readProjectFile('src/reader/app/site-nav.ts'),
        ].join('\n');

        for (const route of ACTIVE_PUBLIC_ROUTES) {
            const bare = sitemapRouteKey(route);
            const linked = sources.includes(`link: '/${bare}'`) || sources.includes(`link: '/${bare}/'`);
            expect(linked, `/${bare} is published but nothing links to it`).toBe(true);
        }
    });

    it('keeps every old feature and guide URL as a redirect into the learning path', () => {
        const config = readProjectFile('docs/.vitepress/config.mts');
        expect(config).toContain('legacyDocsRedirect(pageData.relativePath)');
        expect(config).toContain('legacyDocsHashRedirects(relativePath)');
        expect(config).toContain("'http-equiv': 'refresh'");
        expect(config).toContain('location.replace(target)');

        for (const [file, target] of Object.entries(LEGACY_DOC_REDIRECTS)) {
            expect(existsSync(path.join(DOCS, file)), file).toBe(true);
            expect(sitemapRouteKey(target)).toMatch(/^learn(?:\/|$)/);
            expect(ACTIVE_PUBLIC_ROUTES.map(sitemapRouteKey)).toContain(sitemapRouteKey(target));
        }

        expect(LEGACY_DOC_HASH_REDIRECTS['getting-started.md'])
            .toHaveProperty(
                '#use-desktop-anki-from-a-phone-ipad-or-android',
                '/learn/your-own-setup#use-desktop-anki-from-a-phone-ipad-or-android',
            );
    });

    it('wires the exclusion list and the sitemap filter into the VitePress config', () => {
        const config = readProjectFile('docs/.vitepress/config.mts');

        expect(config).toContain('srcExclude: internalDocsExcludeGlobs');
        expect(config).toContain('sitemapItemsForRoutes(items, linkedRoutes)');
        expect(internalDocsExcludeGlobs).toContain('academy/**/*.md');
    });
});

describe('published product claims', () => {
    it('scopes the homepage hero to reading and lookup readiness', () => {
        const homepage = readProjectFile('docs/index.md');
        const config = readProjectFile('docs/.vitepress/config.mts');
        const catalogue = readProjectFile('docs/.vitepress/locales/docs-prose-catalog.ts');
        const theme = readProjectFile('docs/.vitepress/theme/index.ts');
        const heroLanguages = heroStudyLanguages();

        // OWNER DECISION 2026-07-31, still standing: Yomu becomes a complete system
        // for every language — "it will become a complete system for all languages,
        // that's your task". That is an ENGINEERING goal, and a rotator cycling all
        // 33 targets through the h1 was the wrong way to state it: on any given tick
        // the product's first line read "A complete system for learning Shqip.", and
        // screenshots and social unfurls froze whichever word was showing. Owner
        // 2026-08-02: "I am not happy with how the homepage has turned out", against
        // an earlier verbatim instruction for this exact sentence.
        //
        // So the two claims are separated by strength, and BOTH stay measured:
        //   - the headline names Japanese, the one target that measures `full`;
        //   - the reading-and-lookup claim for the other 32 keeps its own line,
        //     counted from the same asserted roster the rotator read.
        expect(homepage).toContain('>A complete system for learning 日本語.</h1>');
        expect(catalogue).toContain("'A complete system for learning 日本語.': '日本語を学ぶための、すべてがそろう。'");
        expect(config).toContain('const hostedHeroStudyLanguages = heroStudyLanguages();');
        expect(config).toContain('__YOMU_HERO_LANGUAGES__: JSON.stringify(hostedHeroStudyLanguages)');
        expect(heroLanguages.length).toBeGreaterThan(1);
        for (const language of heroLanguages) {
            const target = LEARNING_TARGET_ROSTER.find(candidate => candidate.id === language.id);
            expect(target, `homepage names unknown target ${language.id}`).toBeDefined();
            expect(target?.studyTargetReadiness).not.toBe('planned');
        }
        // COUNTED MEMBERSHIP: every language behind the count must genuinely reach
        // reading and lookup. This is the assertion that stops a `planned` language
        // being counted, and it is unchanged by the headline demotion.
        expect(() => assertStudyTargetClaimReadiness(
            heroLanguages.map(language => language.id),
            HOMEPAGE_STUDY_TARGET_CLAIM_READINESS,
            'Homepage hero',
        )).not.toThrow();

        // HEADLINE CLAIM: what the h1 asserts as a complete system. Japanese only,
        // until a wave lifts another target's readiness to full — at which point this
        // list grows and the headline becomes true for it without a copy change.
        const claimedFull = LEARNING_TARGET_ROSTER
            .filter(target => target.studyTargetReadiness === 'full')
            .map(target => target.id);
        expect(claimedFull, 'the headline claims a complete system, so something must be full').toContain('ja');
        expect(() => assertStudyTargetClaimReadiness(claimedFull, 'full', 'Homepage headline')).not.toThrow();
    });

    it('fails if an unknown target is claimed as full', () => {
        expect(() => assertStudyTargetClaimReadiness(
            ['not-a-target'],
            'full',
            'Mutation proof',
        )).toThrow('Mutation proof claims an unknown study target: not-a-target.');
        expect(() => heroStudyLanguages('full')).toThrow(
            'Homepage hero claims Albanian (sq) as full, but its study-target readiness is reading-only.',
        );
    });

    it('keeps every lookup-capable picker target backed by published dictionary supply', () => {
        const catalogue = JSON.parse(
            readProjectFile('config/dictionaries/published/v1/catalog.json'),
        ) as {
            entries?: Array<{
                headwordLanguages?: string[];
                distribution?: { state?: string };
            }>;
        };
        const suppliedHeadwordLanguages = new Set(
            (catalogue.entries ?? [])
                .filter(entry => entry.distribution?.state === 'published' || entry.distribution?.state === 'upstream')
                .flatMap(entry => entry.headwordLanguages ?? [])
                .map(language => language.toLowerCase().replace(/_/gu, '-').split('-')[0]),
        );
        const lookupCapableTargets = LEARNING_TARGET_ROSTER
            .filter(language => learningTargetModuleFor(language.runtimeLocale)?.capabilities['term-lookup']);

        expect(lookupCapableTargets.map(language => language.id)).not.toContain('my');
        for (const target of lookupCapableTargets) {
            expect(
                suppliedHeadwordLanguages.has(target.id),
                `${target.id} has term lookup in the picker but zero published dictionary entries`,
            ).toBe(true);
        }
    });

    it('keeps every published "N languages" claim at the measured definition-language count', () => {
        const measuredCount = measuredDefinitionLanguageCount();
        const claims = docsMarkdownFiles()
            .filter(file => !isInternalDocPath(file))
            .flatMap(file => {
                const source = readProjectFile(`docs/${file}`);
                return [...source.matchAll(/\b(\d+)\s+languages?\b/gi)].map(match => ({
                    file,
                    count: Number(match[1]),
                    text: match[0],
                }));
            });

        expect(claims.length).toBeGreaterThan(0);
        for (const claim of claims) {
            expect(
                claim.count,
                `${claim.file} claims "${claim.text}", but ${measuredCount} distinct learner languages have published matching definitions`,
            ).toBe(measuredCount);
        }
    });
});

describe('one navbar everywhere', () => {
    const SHELLS = ['docs/public/pdf-reader/index.html', 'docs/public/video-player/index.html'];

    it('stamps the same site nav into every standalone hosted shell', () => {
        // The two static shells are served outside the VitePress theme, so their
        // menus are stamped from the canonical list at build time. A list edit
        // without a rebuild leaves them behind, which is how they ended up
        // pointing Study and Stats at the retired /newtab/ route.
        const expected = hostedShellNavMarkup('../', ' '.repeat(12));

        for (const shell of SHELLS) {
            const source = readProjectFile(shell);
            const start = source.indexOf('<!-- yomu:site-nav:start -->');
            const end = source.indexOf('<!-- yomu:site-nav:end -->');
            expect(start, `${shell} has no site-nav markers`).toBeGreaterThan(0);
            expect(end).toBeGreaterThan(start);
            const stamped = source.slice(start + '<!-- yomu:site-nav:start -->'.length, end).trim();
            expect(stamped, `${shell} is stamped from a stale nav — run scripts/sync-docs-userscript.cjs`)
                .toBe(expected.trim());
        }
    });

    it('keeps Membership carrying target="_self" on every surface', () => {
        // VitePress's router claims in-site link clicks on window and skips any
        // anchor with a target, which is the only reason the membership popover
        // gets to open instead of the router navigating away.
        expect(MEMBERSHIP_NAV.target).toBe('_self');
        expect(docsNav()).toContainEqual({ text: 'Membership', link: '/membership', target: '_self' });

        const membership = hostedShellNavRoutes('/').find(link => link.text === 'Membership');
        expect(membership?.target).toBe('_self');
        for (const shell of SHELLS) {
            expect(readProjectFile(shell)).toContain('<a href="../membership" target="_self" data-site-nav-item');
        }
    });

    it('keeps every nav label\'s Japanese in step with the website locale catalogue', () => {
        // The static shells read data-nav-ja in applyInterfaceLanguage; Study's
        // renderSiteNavLink chooses route.ja while rendering. VitePress reads
        // the semantic website catalogue, so assert both consumers agree.

        for (const route of siteNavRoutes()) {
            expect(websiteNavigationLabel(route.text, 'ja')).toBe(route.ja);
        }
    });
});

describe('sitemap filtering', () => {
    it('collects same-site routes from nested navigation and ignores externals', () => {
        const routes = navigationRoutes([
            { text: 'Install', link: '/getting-started' },
            { text: 'Stats', link: '/study/?mode=stats' },
            { text: 'Source', link: 'https://github.com/example/repo' },
            { text: 'More', items: [{ text: 'Privacy', link: '/privacy' }] },
        ]);

        expect([...routes].sort()).toEqual(['getting-started', 'privacy', 'study']);
    });

    it('keeps linked pages and drops unlinked ones, index and directory urls alike', () => {
        const routes = navigationRoutes([
            { text: 'Overview', link: '/' },
            { text: 'Privacy', link: '/privacy' },
            { text: 'Apps', link: '/tools/' },
        ]);
        const items = [
            { url: '' },
            { url: 'privacy/' },
            { url: 'tools/' },
            { url: 'nuclear-backlog-2026-07-16' },
        ];

        expect(sitemapItemsForRoutes(items, routes)).toEqual([
            { url: '' },
            { url: 'privacy/' },
            { url: 'tools/' },
        ]);
    });

    // The hosted apps are static files in docs/public, so VitePress never routes
    // them and `transformItems` never sees them: all three were missing from the
    // live sitemap (20 <loc> entries, measured 2026-07-30) while being indexable
    // 200 pages the home page leads with.
    it('adds the hosted app surfaces the sitemap can never discover', () => {
        expect(withHostedAppSitemapItems([{ url: 'faq' }], url => ({ url }))).toEqual([
            { url: 'faq' },
            { url: 'study/' },
            { url: 'video-player/' },
            { url: 'pdf-reader/' },
        ]);
    });

    it('does not duplicate a hosted route that VitePress already published', () => {
        const items = [{ url: 'study' }];
        expect(withHostedAppSitemapItems(items, url => ({ url }))).toEqual([
            { url: 'study' },
            { url: 'video-player/' },
            { url: 'pdf-reader/' },
        ]);
    });

    // One URL shape per app, the Academy's deliberate sitemap exclusion, and the
    // shells' social metadata all live in tests/reader/technical-seo.test.ts,
    // which sweeps README.md, src/reader/app/constants.ts and the nav definition
    // as well as the docs pages. Only the helper's own contract is asserted here.
});
