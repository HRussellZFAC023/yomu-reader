import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type DesktopRoute = 'mac-arm64' | 'mac-x64' | 'win-x64' | 'linux-x86_64';

const {
    DEFAULT_INSTALL_ROUTE,
    DESKTOP_DOWNLOAD_URLS,
    INSTALL_ROUTE_URLS,
    hostedInstallRouteSnippet,
    resolveHostedDesktopRoute,
    resolveHostedInstallRoute,
} = createRequire(import.meta.url)('../../scripts/lib/hosted-install-route.cjs') as {
    DEFAULT_INSTALL_ROUTE: string;
    DESKTOP_DOWNLOAD_URLS: Record<DesktopRoute, string>;
    INSTALL_ROUTE_URLS: Record<'chrome' | 'firefox' | 'userscript', string>;
    hostedInstallRouteSnippet(): string;
    resolveHostedDesktopRoute(userAgent: string, maxTouchPoints?: number): DesktopRoute | 'none';
    resolveHostedInstallRoute(userAgent: string): 'chrome' | 'firefox' | 'userscript';
};

const CANONICAL_USERSCRIPT_URL = 'https://yomureader.com/yomu.user.js';
const RELEASE_ATTACHMENT_URL_RE = /https:\/\/github\.com\/[^\s"')]+\/releases\/download\/[^\s"')]+\/yomu\.user\.js/;

describe('hosted userscript install links', () => {
    it('downloads よむ Desktop directly from the desktop page', () => {
        // One click to the right file: the links are the version-less names the
        // desktop release attaches, so no release ever needs a docs edit, and a
        // visitor never lands on a GitHub asset table.
        for (const page of ['docs/desktop.md']) {
            const source = readFileSync(page, 'utf8');
            for (const [route, url] of Object.entries(DESKTOP_DOWNLOAD_URLS)) {
                expect(url).toMatch(/^https:\/\/github\.com\/HRussellZFAC023\/yomu-reader\/releases\/latest\/download\/yomu-desktop-/u);
                expect(source).toContain(`data-yomu-desktop-file="${route}" href="${url}"`);
            }
            expect(source).not.toMatch(/releases\/download\/v\d/u);
        }
        expect(readFileSync('docs/desktop.md', 'utf8')).toContain('Screen Recording');
    });

    it.each([
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 0, 'win-x64'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 0, 'mac-arm64'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 5, 'none'],
        ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 0, 'linux-x86_64'],
        ['Mozilla/5.0 (Android 15; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0', 5, 'none'],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 5, 'none'],
        ['', 0, 'none'],
    ] as const)('offers %s with %i touch points the desktop file %s', (userAgent, touchPoints, route) => {
        expect(resolveHostedDesktopRoute(userAgent, touchPoints)).toBe(route);
    });

    it('keeps every homepage userscript CTA on the canonical install response', () => {
        const homepage = readFileSync('docs/index.md', 'utf8');
        const userscriptUrls = Array.from(homepage.matchAll(/https:\/\/[^\s"')]+\/yomu\.user\.js/g), match => match[0]);

        expect(userscriptUrls.length).toBeGreaterThanOrEqual(2);
        expect(new Set(userscriptUrls)).toEqual(new Set([CANONICAL_USERSCRIPT_URL]));
        expect(homepage).not.toMatch(RELEASE_ATTACHMENT_URL_RE);
    });
});

describe('hosted store install routes', () => {
    // Detection is a convenience. The guarantee that matters is that a visitor
    // whose browser was guessed wrong — or who has no JS at all — can still
    // reach every install, because all three are real links in the shipped
    // markup rather than one link a script rewrites.
    it('keeps all three install routes reachable in the homepage markup', () => {
        const homepage = readFileSync('docs/index.md', 'utf8');
        for (const [route, url] of Object.entries(INSTALL_ROUTE_URLS)) {
            expect(homepage).toContain(`data-yomu-route="${route}"`);
            expect(homepage).toContain(url);
        }
    });

    it('keeps extension metadata Japanese-only and stable update routes on the stores', () => {
        const amoMetadata = JSON.parse(readFileSync('config/amo-metadata.json', 'utf8')) as {
            summary: Record<string, string>;
            description: Record<string, string>;
            version: { approval_notes: string };
        };
        const compiler = JSON.parse(readFileSync('config/userscript-compiler.config.json', 'utf8')) as {
            branding: { tagline: string };
        };
        const reviewNotes = readFileSync('docs/store-review-notes.md', 'utf8');

        expect(amoMetadata.summary['en-US']).toMatch(/^Read Japanese\. Stay with the story\./u);
        expect(amoMetadata.summary.ja).toMatch(/^日本語を読む。物語の続きを楽しむ。/u);
        expect(amoMetadata.summary['en-US'].length).toBeLessThanOrEqual(250);
        expect(amoMetadata.summary.ja.length).toBeLessThanOrEqual(250);
        expect(amoMetadata.description['en-US']).toContain('Read Japanese where you already read.');
        expect(amoMetadata.description.ja).toContain('いつもの場所で、日本語をそのまま読む。');
        expect(amoMetadata.version.approval_notes).toContain('No first-run setup or language choice is required');
        expect(amoMetadata.version.approval_notes).toContain('Kanji 1 by default');
        expect(amoMetadata.version.approval_notes).not.toContain('non-Japanese targets');
        expect(compiler.branding.tagline).toBe('Read Japanese. Stay with the story.');
        const chromeDescription = execFileSync(
            process.execPath,
            ['scripts/print-chrome-store-description.mjs'],
            { encoding: 'utf8' },
        );
        expect(chromeDescription).toContain('Highlights\n- Pop-up Japanese dictionary on any web page');
        expect(chromeDescription).toContain('- No remote executable code and no sale of personal data\n\nSite access is needed');
        expect(chromeDescription).not.toMatch(/<\/?(?:ul|li)>/u);
        expect(reviewNotes).toContain('Japanese reader for learners');
        expect(reviewNotes).toContain('Text in other languages is left untouched.');

        for (const route of ['chrome', 'firefox'] as const) {
            const page = readFileSync(`docs/public/store/${route}/index.html`, 'utf8');
            expect(page).toContain(INSTALL_ROUTE_URLS[route]);
            expect(page).not.toContain('/releases/latest');
        }
        expect(readFileSync('docs/public/store/safari/index.html', 'utf8')).toContain('/releases/latest');
    });

    it('leads the install page with both stores and keeps the userscript as the fallback', () => {
        const weekOne = readFileSync('docs/learn/index.md', 'utf8');
        const chromeAt = weekOne.indexOf(INSTALL_ROUTE_URLS.chrome);
        const firefoxAt = weekOne.indexOf(INSTALL_ROUTE_URLS.firefox);
        const userscriptAt = weekOne.indexOf(CANONICAL_USERSCRIPT_URL);

        expect(chromeAt).toBeGreaterThanOrEqual(0);
        expect(firefoxAt).toBeGreaterThan(chromeAt);
        expect(userscriptAt).toBeGreaterThan(firefoxAt);
        // The developer-mode zip walkthrough was the friction this replaced; it
        // must not creep back in beside a one-click store listing.
        expect(weekOne).not.toContain('Load unpacked');
        expect(weekOne).not.toContain('Load Temporary Add-on');
    });

    it.each([
        // Desktop Chromium family, including the browsers that only differ by brand token.
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'chrome'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', 'chrome'],
        ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0', 'chrome'],
        ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/130.0.0.0 Safari/537.36', 'chrome'],
        // Firefox desktop, and Firefox for Android — the AMO listing declares
        // Android 142+ support, so Android is a real store install there.
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0', 'firefox'],
        ['Mozilla/5.0 (Android 15; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0', 'firefox'],
        // Safari and iPadOS: no store build exists, so the userscript is the
        // honest answer rather than a consolation prize.
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'userscript'],
        ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'userscript'],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'userscript'],
        // Branded iOS browsers are Safari underneath: neither store can serve
        // them however Chrome-shaped or Firefox-shaped the UA looks.
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1', 'userscript'],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15', 'userscript'],
        // Chromium on Android has no extension support at all.
        ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'userscript'],
        // Anything unrecognised, and an absent UA, take the build that runs everywhere.
        ['', 'userscript'],
        ['Mozilla/5.0 (compatible; SomeFutureBrowser/1.0)', 'userscript'],
    ])('resolves %s to the %s route', (userAgent, route) => {
        expect(resolveHostedInstallRoute(userAgent)).toBe(route);
    });

    it('falls back to the build that runs everywhere', () => {
        expect(DEFAULT_INSTALL_ROUTE).toBe('userscript');
        expect(INSTALL_ROUTE_URLS.userscript).toBe(CANONICAL_USERSCRIPT_URL);
    });

    it('builds a head snippet that stamps exactly what the resolver resolves', () => {
        const snippet = hostedInstallRouteSnippet();
        expect(snippet).not.toContain('</script');

        for (const userAgent of [
            'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; rv:142.0) Gecko/20100101 Firefox/142.0',
            'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1',
            '',
        ]) {
            const attributes = new Map<string, string>();
            const documentStub = {
                documentElement: {
                    setAttribute: (name: string, value: string) => {
                        attributes.set(name, value);
                    },
                },
            };
            new Function('navigator', 'document', snippet)({ userAgent }, documentStub);
            expect([...attributes.keys()]).toEqual(['data-yomu-install', 'data-yomu-desktop']);
            expect(attributes.get('data-yomu-install')).toBe(resolveHostedInstallRoute(userAgent));
            expect(attributes.get('data-yomu-desktop')).toBe(resolveHostedDesktopRoute(userAgent));
        }
    });

    it('switches an Intel Mac to the Intel download when Chromium reports the architecture', async () => {
        const attributes = new Map<string, string>();
        const documentStub = { documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } };
        const navigatorStub = {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            maxTouchPoints: 0,
            userAgentData: { getHighEntropyValues: async () => ({ architecture: 'x86' }) },
        };
        new Function('navigator', 'document', hostedInstallRouteSnippet())(navigatorStub, documentStub);
        expect(attributes.get('data-yomu-desktop')).toBe('mac-arm64');
        await Promise.resolve();
        await Promise.resolve();
        expect(attributes.get('data-yomu-desktop')).toBe('mac-x64');
    });
});
