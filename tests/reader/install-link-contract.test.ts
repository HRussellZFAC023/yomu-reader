import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { localizeHtmlFragment } from '../../docs/.vitepress/locales/markdown-localization';

type DesktopRoute = 'mac-arm64' | 'mac-x64' | 'win-x64' | 'linux-x86_64';
type InstallRoute = 'chrome' | 'firefox' | 'android' | 'userscript';

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
    resolveHostedDesktopRoute(userAgent: string, maxTouchPoints?: number, architecture?: string): DesktopRoute | 'none';
    resolveHostedInstallRoute(userAgent: string): InstallRoute;
};

const CANONICAL_USERSCRIPT_URL = 'https://yomureader.com/yomu.user.js';
const ANDROID_CHROME_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const SAMSUNG_INTERNET_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
const FIREFOX_ANDROID_UA = 'Mozilla/5.0 (Android 15; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0';
const IPHONE_SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// iPadOS Safari sends exactly this Mac user agent; only touch points tell them apart.
const MAC_SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const WINDOWS_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** Runs the shipped head snippet the way a browser would, against a stub navigator. */
function stampInstallRoute(documentLike: { documentElement: { setAttribute(name: string, value: string): void } }, navigatorStub: object): void {
    new Function('navigator', 'document', hostedInstallRouteSnippet())(navigatorStub, documentLike);
}

/**
 * The first `<head>:is(...)` rule in the site stylesheet, as a matcher. jsdom's
 * selector engine can't parse that multi-line `:is()`, so each listed selector
 * is matched on its own, which is what `:is()` means.
 */
function cssRuleMatcher(css: string, head: string): (element: Element) => boolean {
    const start = css.indexOf(`${head}:is(`);
    const end = css.indexOf('\n) {', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const selectors = css.slice(start + head.length + ':is('.length, end).split(',').map(selector => selector.trim().replace(/\s+/gu, ' '));
    return element => element.matches(head) && selectors.some(selector => element.matches(selector));
}
const RELEASE_ATTACHMENT_URL_RE = /https:\/\/github\.com\/[^\s"')]+\/releases\/download\/[^\s"')]+\/yomu\.user\.js/;

describe('hosted userscript install links', () => {
    it('downloads よむ Desktop directly from the homepage and the desktop page', () => {
        // One click to the right file: the links are the version-less names the
        // desktop release attaches, so no release ever needs a docs edit, and a
        // visitor never lands on a GitHub asset table.
        for (const page of ['docs/index.md', 'docs/desktop.md']) {
            const source = readFileSync(page, 'utf8');
            for (const [route, url] of Object.entries(DESKTOP_DOWNLOAD_URLS)) {
                expect(url).toMatch(/^https:\/\/github\.com\/HRussellZFAC023\/yomu-reader\/releases\/latest\/download\/yomu-desktop-/u);
                expect(source).toContain(`data-yomu-desktop-file="${route}" href="${url}"`);
            }
            expect(source).not.toMatch(/releases\/download\/v\d/u);
        }
        // A phone, or a page without JS, gets the desktop page instead of a file.
        expect(readFileSync('docs/index.md', 'utf8')).toContain('class="yomu-desktop-button yomu-desktop-fallback" href="/desktop"');
        expect(readFileSync('docs/desktop.md', 'utf8')).toContain('Screen Recording');
    });

    it('keeps the release page one click away on /desktop', () => {
        // releases/latest lacks the desktop files for the minutes each release
        // takes to upload them, and for good if that upload fails.
        const desktop = readFileSync('docs/desktop.md', 'utf8').replace(/^---[\s\S]*?---/u, '');
        const link = '<a class="yomu-desktop-other" href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest">';
        expect(desktop).toContain(`${link}All downloads</a>`);
        expect(localizeHtmlFragment(desktop, 'ja')).toContain(`${link}ダウンロード一覧</a>`);
    });

    it.each([
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 0, 'win-x64'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 0, 'none'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 5, 'none'],
        ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 0, 'linux-x86_64'],
        ['Mozilla/5.0 (Android 15; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0', 5, 'none'],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 5, 'none'],
        ['', 0, 'none'],
    ] as const)('offers %s with %i touch points the desktop file %s', (userAgent, touchPoints, route) => {
        expect(resolveHostedDesktopRoute(userAgent, touchPoints)).toBe(route);
    });

    it('keeps every userscript link on the canonical install response', () => {
        // The homepage's userscript route opens the Safari steps on the Install
        // page, because the script itself does nothing until a manager exists.
        for (const page of ['docs/index.md', 'docs/install.md']) {
            const source = readFileSync(page, 'utf8');
            const userscriptUrls = Array.from(source.matchAll(/https:\/\/[^\s"')]+\/yomu\.user\.js/g), match => match[0]);
            expect(new Set(userscriptUrls).size).toBeLessThanOrEqual(1);
            for (const url of userscriptUrls) expect(url).toBe(CANONICAL_USERSCRIPT_URL);
            expect(source).not.toMatch(RELEASE_ATTACHMENT_URL_RE);
        }
        expect(readFileSync('docs/install.md', 'utf8')).toContain(CANONICAL_USERSCRIPT_URL);
    });
});

describe('hosted store install routes', () => {
    // Detection is a convenience. The guarantee that matters is that a visitor
    // whose browser was guessed wrong — or who has no JS at all — can still
    // reach every install, because all three are real links in the shipped
    // markup rather than one link a script rewrites.
    it('keeps all three install routes reachable in the homepage markup', () => {
        const homepage = readFileSync('docs/index.md', 'utf8');
        for (const route of Object.keys(INSTALL_ROUTE_URLS)) {
            expect(homepage).toContain(`data-yomu-route="${route}"`);
        }
        expect(homepage).toContain(INSTALL_ROUTE_URLS.chrome);
        expect(homepage).toContain(INSTALL_ROUTE_URLS.firefox);
        expect(homepage).toContain('data-yomu-route="userscript" href="/install#safari"');
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
        const weekOne = readFileSync('docs/install.md', 'utf8');
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
        // Chromium on Android installs no extensions, and the Safari steps
        // mean nothing there: every other Android browser is pointed at Firefox.
        ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'android'],
        [SAMSUNG_INTERNET_UA, 'android'],
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

        for (const [userAgent, maxTouchPoints] of [
            ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 0],
            ['Mozilla/5.0 (Windows NT 10.0; rv:142.0) Gecko/20100101 Firefox/142.0', 0],
            ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1', 5],
            // iPadOS Safari: a Mac user agent with a touch screen is offered no Mac download.
            [MAC_SAFARI_UA, 5],
            [MAC_SAFARI_UA, 0],
            [ANDROID_CHROME_UA, 5],
            ['', 0],
        ] as const) {
            const attributes = new Map<string, string>();
            const documentStub = {
                documentElement: {
                    setAttribute: (name: string, value: string) => {
                        attributes.set(name, value);
                    },
                },
            };
            stampInstallRoute(documentStub, { userAgent, maxTouchPoints });
            expect([...attributes.keys()]).toEqual(['data-yomu-install', 'data-yomu-desktop']);
            expect(attributes.get('data-yomu-install')).toBe(resolveHostedInstallRoute(userAgent));
            expect(attributes.get('data-yomu-desktop')).toBe(resolveHostedDesktopRoute(userAgent, maxTouchPoints));
        }
    });

    // What a visitor actually sees: the shipped snippet stamps the page, and the
    // shipped stylesheet's selectors pick the one big button and its one line.
    it.each([
        ['Android Chrome', ANDROID_CHROME_UA, 5, 'firefox', 'android'],
        ['Samsung Internet', SAMSUNG_INTERNET_UA, 5, 'firefox', 'android'],
        ['Firefox for Android', FIREFOX_ANDROID_UA, 5, 'firefox', 'firefox'],
        ['iPhone Safari', IPHONE_SAFARI_UA, 5, 'userscript', 'userscript'],
        ['iPad Safari', MAC_SAFARI_UA, 5, 'userscript', 'userscript'],
        ['Windows Chrome', WINDOWS_CHROME_UA, 0, 'chrome', 'chrome'],
    ] as const)('promotes the right install button on %s', (_name, userAgent, maxTouchPoints, button, hint) => {
        const css = readFileSync('docs/.vitepress/theme/custom.css', 'utf8');
        const promoted = cssRuleMatcher(css, '.yomu-install-route');
        const shownHint = cssRuleMatcher(css, '.yomu-install-hint');
        for (const file of ['docs/index.md', 'docs/install.md']) {
            const markdown = readFileSync(file, 'utf8').replace(/^---[\s\S]*?---/u, '');
            for (const locale of ['en', 'ja'] as const) {
                const page = new DOMParser().parseFromString(localizeHtmlFragment(markdown, locale), 'text/html');
                stampInstallRoute(page, { userAgent, maxTouchPoints });
                const routeBlocks = [...page.querySelectorAll('.yomu-install-routes')];
                expect(routeBlocks.length).toBeGreaterThan(0);
                for (const routes of routeBlocks) {
                    const buttons = [...routes.querySelectorAll('a.yomu-install-route')].filter(promoted);
                    const hints = [...routes.querySelectorAll('.yomu-install-hint')].filter(shownHint);
                    expect(buttons.map(link => link.getAttribute('data-yomu-route')), `${file} ${locale}`).toEqual([button]);
                    expect(hints.map(line => line.getAttribute('data-yomu-hint')), `${file} ${locale}`).toEqual([hint]);
                    // A phone that can't run the Safari route is never offered it.
                    if (/Android/u.test(userAgent)) {
                        expect(`${buttons[0].textContent} ${hints[0].textContent}`).not.toMatch(/Safari|iPhone|iPad|Userscripts/u);
                    }
                }
            }
        }
    });

    it.each([['arm', 'mac-arm64'], ['x86', 'mac-x64']] as const)('selects the Mac %s binary only after an explicit architecture hint', async (architecture, route) => {
        const attributes = new Map<string, string>();
        const documentStub = { documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } };
        const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
        const hints = vi.fn(async () => ({ architecture }));
        stampInstallRoute(documentStub, { userAgent, maxTouchPoints: 0, userAgentData: { getHighEntropyValues: hints } });
        expect(attributes.get('data-yomu-desktop')).toBe('none');
        await vi.waitFor(() => expect(attributes.get('data-yomu-desktop')).toBe(route));
        expect(hints).toHaveBeenCalledWith(['architecture']);
        expect(resolveHostedDesktopRoute(userAgent, 0, architecture)).toBe(route);
    });

    it.each([MAC_SAFARI_UA, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0'])('offers a real choice page for a Mac with an unknown architecture: %s', userAgent => {
        const attributes = new Map<string, string>();
        stampInstallRoute({ documentElement: { setAttribute: (name, value) => attributes.set(name, value) } }, { userAgent, maxTouchPoints: 0 });
        expect(attributes.get('data-yomu-desktop')).toBe('none');
        const home = document.createElement('div'); home.innerHTML = readFileSync('docs/index.md', 'utf8');
        expect(home.querySelector('.yomu-desktop-fallback')?.getAttribute('href')).toBe('/desktop');
        const choice = document.createElement('div'); choice.innerHTML = readFileSync('docs/desktop.md', 'utf8');
        for (const [route, name] of [['mac-arm64', 'Mac (Apple silicon)'], ['mac-x64', 'Mac (Intel)']] as const) {
            expect(choice.querySelector(`a.yomu-desktop-other[href="${DESKTOP_DOWNLOAD_URLS[route]}"]`)?.textContent).toBe(name);
        }
    });

    it('does not request a Mac architecture hint for an iPad masquerading as a Mac', () => {
        const hints = vi.fn(async () => ({ architecture: 'arm' }));
        const attributes = new Map<string, string>();
        stampInstallRoute({ documentElement: { setAttribute: (name, value) => attributes.set(name, value) } }, {
            userAgent: MAC_SAFARI_UA, maxTouchPoints: 5, userAgentData: { getHighEntropyValues: hints },
        });
        expect(attributes.get('data-yomu-desktop')).toBe('none');
        expect(hints).not.toHaveBeenCalled();
        expect(resolveHostedDesktopRoute(MAC_SAFARI_UA, 5, 'arm')).toBe('none');
    });

    it.each(['', 'unknown', 'rejected'])('keeps the Mac choice when architecture is %s', async architecture => {
        const attributes = new Map<string, string>();
        stampInstallRoute({ documentElement: { setAttribute: (name, value) => attributes.set(name, value) } }, {
            userAgent: MAC_SAFARI_UA, maxTouchPoints: 0,
            userAgentData: { getHighEntropyValues: async () => { if (architecture === 'rejected') throw new Error('Denied'); return { architecture }; } },
        });
        await Promise.resolve();
        expect(attributes.get('data-yomu-desktop')).toBe('none');
    });

});
