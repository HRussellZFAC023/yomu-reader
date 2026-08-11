// Technical SEO for the four hosted app shells.
//
// A6 closed technical SEO on the evidence that every sitemap URL returns 200,
// which only ever examined what was already in the sitemap. The four app shells
// are copied out of docs/public instead of routed by VitePress, so none of them
// was in it — and each one had drifted on its own: the site linked
// /pdf-reader/index.html while the shell canonicalised /pdf-reader/, the Academy
// shell (the URL paying supporters are sent) carried no canonical and no og:*,
// the PDF reader's <title> disagreed with its og:title, and /favicon.ico served
// the HTML 404 page.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    hostedAppSitemapRoutes,
    sitemapRouteKey,
    withHostedAppSitemapItems,
} from '../../config/docs/published-pages';
import { siteNavRoutes } from '../../src/reader/app/site-nav';

// The ICO builder is the build script's, not the browser bundle's, so it stays a
// CommonJS script module and is required with its shape declared here.
const { FAVICON_ICO_SOURCES, faviconIcoBytes, pngDimensions } = createRequire(import.meta.url)(
    '../../scripts/lib/favicon-ico.cjs',
) as {
    FAVICON_ICO_SOURCES: string[];
    faviconIcoBytes(images: Buffer[]): Buffer;
    pngDimensions(png: Buffer): { width: number; height: number };
};

const ROOT = process.cwd();
const ORIGIN = 'https://yomureader.com';
const SOCIAL_IMAGE = `${ORIGIN}/og-image.png`;

// Every hosted app shell, with the route it must be linked, canonicalised and
// listed as. `public/academy/index.html` is the template the Academy sync stamps
// into docs/public/academy/index.html, so the template is the file to assert on.
// `indexable` is whether the shell belongs in sitemap.xml, which is a claim that
// the URL is worth landing on from a search result — not whether it returns 200.
// See the Academy note further down for the one that is false.
const APP_SHELLS = [
    { route: '/academy/', file: 'public/academy/index.html', indexable: false },
    { route: '/pdf-reader/', file: 'docs/public/pdf-reader/index.html', indexable: true },
    { route: '/study/', file: 'docs/public/study/index.html', indexable: true },
    { route: '/video-player/', file: 'docs/public/video-player/index.html', indexable: true },
] as const;

function read(file: string): string {
    return readFileSync(path.join(ROOT, file), 'utf8');
}

/** The `content` of a `<meta>` carrying `property="name"` or `name="name"`. */
function metaContent(html: string, name: string): string | undefined {
    const pattern = new RegExp(
        `<meta\\s+(?:property|name)=["']${name.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}["']\\s+content=["']([^"']*)["']`,
        'iu',
    );
    return pattern.exec(html)?.[1];
}

function canonicalHref(html: string): string | undefined {
    return /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/iu.exec(html)?.[1];
}

function documentTitle(html: string): string | undefined {
    return /<title>([^<]*)<\/title>/iu.exec(html)?.[1];
}

describe('app shell social metadata', () => {
    it('gives every app shell the same social-metadata set', () => {
        for (const { route, file } of APP_SHELLS) {
            const html = read(file);
            const title = documentTitle(html);
            expect(title, `${file} has no <title>`).toBeTruthy();
            expect(canonicalHref(html), `${file} must canonicalise ${route}`).toBe(`${ORIGIN}${route}`);
            expect(metaContent(html, 'og:url'), `${file} og:url`).toBe(`${ORIGIN}${route}`);
            expect(metaContent(html, 'og:type'), `${file} og:type`).toBe('website');
            expect(metaContent(html, 'og:site_name'), `${file} og:site_name`).toBe('よむ');
            expect(metaContent(html, 'og:image'), `${file} og:image`).toBe(SOCIAL_IMAGE);
            expect(metaContent(html, 'twitter:card'), `${file} twitter:card`).toBe('summary_large_image');
            expect(metaContent(html, 'twitter:image'), `${file} twitter:image`).toBe(SOCIAL_IMAGE);
            // A shell that unfurls as a bare URL is the failure this catches, so
            // the title and description have to be present on both protocols.
            for (const key of ['og:title', 'twitter:title'] as const) {
                expect(metaContent(html, key), `${file} ${key}`).toBe(title);
            }
            const description = metaContent(html, 'description');
            expect(description, `${file} has no meta description`).toBeTruthy();
            for (const key of ['og:description', 'twitter:description'] as const) {
                expect(metaContent(html, key), `${file} ${key}`).toBeTruthy();
            }
        }
    });

    it('ships the og:image every shell points at', () => {
        expect(existsSync(path.join(ROOT, 'docs/public/og-image.png'))).toBe(true);
    });

    it('keeps the served OG raster generated from the language-neutral SVG', () => {
        const source = read('docs/public/og-image.svg');
        expect(source).toContain('Language-learning');
        expect(source).not.toContain('Free Japanese');
        expect(() => execFileSync(
            process.execPath,
            ['scripts/generate-og-image.mjs', '--check'],
            { cwd: ROOT, stdio: 'pipe' },
        )).not.toThrow();
        const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
        expect(scripts['docs:build']).toContain('npm run docs:og-image');
    });

    it('describes general-purpose reader shells without a Japanese-only identity', () => {
        const sources = [
            'public/newtab/index.html',
            'public/newtab/manifest.webmanifest',
            'docs/public/manifest.webmanifest',
            'docs/public/pdf-reader/index.html',
            'docs/public/pdf-reader/manifest.webmanifest',
            'docs/public/video-player/index.html',
            'docs/public/video-player/manifest.webmanifest',
        ];
        for (const file of sources) {
            expect(read(file), `${file} still presents よむ as Japanese-only`)
                .not.toMatch(/Japanese Reader|Japanese study|Japanese cards|Japanese PDFs|Japanese subtitles/iu);
        }
        for (const file of ['docs/public/pdf-reader/index.html', 'docs/public/video-player/index.html']) {
            expect(read(file).match(/<meta name="description"/gu), `${file} must have one description`)
                .toHaveLength(1);
        }
    });
});

describe('language-neutral public product identity', () => {
    it('keeps root metadata, H1, machine copy, FAQ, README, and reviewer flow aligned', () => {
        const homepage = read('docs/index.md');
        const config = read('docs/.vitepress/config.mts');
        const llms = read('docs/public/llms.txt');
        const faq = read('docs/faq.md');
        const readme = read('README.md');
        const reviewNotes = read('docs/store-review-notes.md');
        const privacy = read('docs/privacy/index.md');
        const storeMetadata = JSON.parse(read('config/amo-metadata.json')) as {
            version: { approval_notes: string };
        };

        expect(homepage).toContain("Read the language you're learning with Yomu.</h1>");
        expect(homepage).not.toContain('A complete system for learning 日本語.</h1>');
        expect(config).toContain("alternateName: 'Yomu Language Reader'");
        expect(config).toContain('Target-aware popup lookup for 33 learning languages');
        expect(llms).toContain('reader for 33 learning languages');
        expect(llms).not.toContain('Japanese immersion reader');
        expect(faq).toContain('First-run setup requires you to choose one rather than assuming Japanese.');
        expect(faq).not.toContain('turns what you already read into Japanese study');
        expect(readme).toContain('first-run setup requires an explicit target, with no Japanese preselection');
        expect(readme).not.toContain('other 32 targets are labelled for reading and lookup');
        expect(privacy).toContain('tools for your selected learning language');
        expect(privacy).not.toContain('core purpose is to add Japanese reading');
        expect(reviewNotes).toContain('Japanese is not preselected');
        expect(reviewNotes).toContain('**Kanji 1** for Japanese and **Word** for non-Japanese targets');
        expect(reviewNotes).not.toContain('**Kanji 1** by default');
        expect(storeMetadata.version.approval_notes).toContain('Japanese is not preselected');
        expect(storeMetadata.version.approval_notes).toContain('Kanji 1 for Japanese and Word for non-Japanese targets');
    });
});

describe('one URL shape per app', () => {
    it('lists the working app shells in the sitemap under their canonical route', () => {
        // Appended rather than filtered in: the shells are static files in
        // docs/public, so VitePress never routes them and `transformItems` never
        // receives them at all.
        expect(withHostedAppSitemapItems([], url => ({ url })).map(item => item.url))
            .toEqual([...hostedAppSitemapRoutes]);
        const listed = hostedAppSitemapRoutes.map(sitemapRouteKey);
        for (const { route } of APP_SHELLS.filter(shell => shell.indexable)) {
            expect(listed, `${route} returns 200 and is indexable, so it belongs in sitemap.xml`)
                .toContain(sitemapRouteKey(route));
        }
    });

    // The Academy is the one shell held out of the sitemap on purpose. It is just
    // as indexable and just as linked, but nobody can currently play it — the
    // Google wall kills the class code — and scripts/submit-indexnow.mjs pushes
    // every sitemap URL straight to search engines, so listing it would advertise
    // a dead end. It still carries full canonical and social metadata above, so a
    // shared link unfurls correctly; it is only search submission being withheld.
    // Reversing this is one entry in `hostedAppSitemapRoutes` once it is playable.
    it('holds the Academy out of the sitemap while it cannot be played', () => {
        expect(hostedAppSitemapRoutes.map(sitemapRouteKey)).not.toContain(sitemapRouteKey('/academy/'));
        expect(APP_SHELLS.find(shell => shell.route === '/academy/')?.indexable).toBe(false);
    });

    it('links the canonical route, never the index.html duplicate', () => {
        // Both URL shapes serve the same bytes, so an index.html link is not a
        // broken link — it is an internal link to a page that declares itself a
        // duplicate of the one being advertised to crawlers.
        const linkSources = [
            'README.md',
            'docs/faq.md',
            'docs/index.md',
            'docs/support.md',
            'docs/learn/index.md',
            'docs/learn/reading.md',
            'docs/learn/reference.md',
            'docs/learn/watching.md',
            'docs/public/manifest.webmanifest',
            'src/reader/app/constants.ts',
        ];
        for (const file of linkSources) {
            for (const app of ['pdf-reader', 'video-player', 'study', 'academy']) {
                // Anchored on the character that makes it a link target rather
                // than prose about the repo path (README describes the Vite
                // entry file as `academy/index.html`).
                const linked = new RegExp(`["'(/]${app}/index\\.html`, 'u').exec(read(file))?.[0];
                expect(linked, `${file} links ${app}/index.html instead of ${app}/`).toBeUndefined();
            }
        }
        // The nav is one definition rendered by the docs theme, the Study shell
        // and the two static shells, so this is the same assertion for all four.
        for (const entry of siteNavRoutes()) {
            expect(entry.link, `the ${entry.text} nav entry links an index.html duplicate`)
                .not.toContain('index.html');
        }
        for (const route of ['/pdf-reader/', '/video-player/', '/study/', '/academy/']) {
            expect(siteNavRoutes().some(entry => entry.link === route), `nothing in the site nav links ${route}`)
                .toBe(true);
        }
    });
});

describe('root favicon', () => {
    it('serves /favicon.ico as an icon rather than the 404 page', () => {
        // Requested unconditionally by browsers and unfurlers, whatever the head
        // declares. It was absent, so they all got an HTML error page.
        for (const dir of ['public', 'docs/public']) {
            const ico = readFileSync(path.join(ROOT, dir, 'favicon.ico'));
            const sources = FAVICON_ICO_SOURCES.map(name => readFileSync(path.join(ROOT, dir, name)));
            expect(
                ico.equals(faviconIcoBytes(sources)),
                `${dir}/favicon.ico is stale — run node scripts/generate-favicons.mjs`,
            ).toBe(true);
            expect(ico.readUInt16LE(0)).toBe(0);
            expect(ico.readUInt16LE(2)).toBe(1);
            expect(ico.readUInt16LE(4)).toBe(sources.length);
            expect(sources.map(png => pngDimensions(png).width)).toEqual([16, 32]);
        }
    });
});
