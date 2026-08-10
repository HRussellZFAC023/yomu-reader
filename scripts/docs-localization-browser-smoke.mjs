import assert from 'node:assert/strict';
import { chromium, firefox } from 'playwright';

const PREVIEW_ORIGIN = process.env.YOMU_DOCS_PREVIEW_URL || 'http://127.0.0.1:4199';
const ORIGIN = productionPolicyPreviewOrigin(PREVIEW_ORIGIN);
const JA_STATIC_HEADING = '日本語を学ぶための、すべてがそろう。';
const EN_STATIC_HEADING = 'A complete system for learning 日本語.';
const EXPECTED_ROUTE_FRAMES = Object.freeze({
    '/': { lang: 'en', staticHeading: EN_STATIC_HEADING, prefix: 'Read ', suffix: ' with Yomu.' },
    '/ja/': { lang: 'ja', staticHeading: JA_STATIC_HEADING, prefix: 'よむで', suffix: 'を読む。' },
});
const HOMEPAGE_TRY_ME_LOOKUP_SELECTOR = '.yomu-try-me-text .jpdb-reader-word'
    + '[data-expression="今日"]'
    + '[data-sentence="今日は静かな喫茶店で新しい本を読みました。"]'
    + '[data-token-start="0"][data-token-end="2"]';
const HERO_GEOMETRY_WIDTHS = [320, 375, 720, 721, 1024, 1280];
const BROWSER_NAME = process.env.YOMU_DOCS_BROWSER || 'chromium';
const browserType = { chromium, firefox }[BROWSER_NAME];
assert.ok(browserType, `Unsupported docs browser: ${BROWSER_NAME}`);
const LOCALE_PROOF_BROWSER_OPTIONS = Object.freeze({
    extraHTTPHeaders: {
        'Accept-Encoding': BROWSER_NAME === 'chromium' ? 'gzip' : 'identity',
    },
    locale: 'en-GB',
});
const browser = await browserType.launch({ headless: true });

function productionPolicyPreviewOrigin(value) {
    const url = new URL(value);
    if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        // *.localhost resolves to the same loopback preview in both engines,
        // while staying outside the docs theme's exact development-host list.
        // That exercises the production installed-owner suppression policy.
        url.hostname = 'yomureader.localhost';
    }
    return url.origin;
}

try {
    // VitePress preview dynamically Brotli-compresses eligible large text
    // responses. Its single-process encoder spends tens of seconds on Academy's
    // deliberately readable application bundle. That is a preview-server artifact,
    // not product readiness. Gzip keeps compressed transport coverage while
    // leaving the semantic DOM/runtime assertions below as the readiness gate.
    const page = await browser.newPage(LOCALE_PROOF_BROWSER_OPTIONS);
    // Firefox can prefetch a Brotli response before a later identity navigation;
    // routing disables that cache while preserving the browser's real request.
    await page.route('**/*', route => route.continue());
    const hydrationMessages = [];
    const pageErrors = [];
    page.on('console', message => {
        if (/hydration|mismatch/i.test(message.text())) hydrationMessages.push(message.text());
    });
    page.on('pageerror', error => {
        pageErrors.push(error.stack || error.message);
        if (/hydration|mismatch/i.test(error.message)) hydrationMessages.push(error.message);
    });

    await Promise.all([
        assertServerRenderedLocale('/', EN_STATIC_HEADING, JA_STATIC_HEADING, 'English'),
        assertServerRenderedLocale('/ja/', JA_STATIC_HEADING, EN_STATIC_HEADING, 'Japanese'),
    ]);
    await installFirstFrameProbe(page);
    const response = await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), 'English route response failed');
    await assertHomepage(page, '/', 'en');
    await assertNoWrongLanguageFrame(page);
    await assertFoldPromptChrome(page, 'English homepage');
    const englishHeroGeometry = await assertHeroHeadlineReservation(page, 'English homepage');
    await assertHostedRuntimeOrder(page, {
        surface: 'English homepage',
        annotationSelector: HOMEPAGE_TRY_ME_LOOKUP_SELECTOR,
        lookupExpression: '今日',
    });
    await assertHostedLocaleIsolation(page, '/', 'en', 'English homepage', { fresh: true });

    const japaneseResponse = await chooseLocale(page, 'Change language', '/ja/');
    assert.ok(japaneseResponse.ok(), 'Japanese route response failed');
    await assertHomepage(page, '/ja/', 'ja');
    await assertNoWrongLanguageFrame(page);
    await assertFoldPromptChrome(page, 'Japanese homepage');
    const japaneseHeroGeometry = await assertHeroHeadlineReservation(page, 'Japanese homepage');
    await assertHostedRuntimeOrder(page, {
        surface: 'Japanese homepage',
        annotationSelector: HOMEPAGE_TRY_ME_LOOKUP_SELECTOR,
        lookupExpression: '今日',
    });
    await assertHostedLocaleIsolation(page, '/ja/', 'ja', 'Japanese homepage');

    await navigateLocaleProof(page, '/learn/reading', 'English reading route');
    await assertRoute(page, '/learn/reading', 'en');
    await assertLocaleHref(page, '日本語', '/ja/learn/reading');
    await assertRouteMetadata(page, '/learn/reading', 'en');
    await chooseLocale(page, 'Change language', '/ja/learn/reading');
    await assertRoute(page, '/ja/learn/reading', 'ja');
    await assertRouteMetadata(page, '/ja/learn/reading', 'ja');
    await assertJapaneseThemeAccessibility(page);

    await navigateLocaleProof(page, '/privacy/', 'English privacy route');
    await assertRoute(page, '/privacy/', 'en');
    await assertLocaleHref(page, '日本語', '/ja/');
    await chooseLocale(page, 'Change language', '/ja/');
    await assertHomepage(page, '/ja/', 'ja');
    await assertNoWrongLanguageFrame(page);
    const frames = await page.evaluate(() => window.__yomuLocaleFrames?.length ?? 0);
    assert.ok(frames >= 1, 'first-frame probe did not observe the final route rendering');

    await assertContaminatedHostedContextStaysEnglish(browser);
    await assertInstalledRuntimePreservesStoredState(browser);
    await assertStudyDoesNotContaminateRoot(browser);
    await assertAcademyDoesNotContaminateRoot(browser);

    await navigateToAcademyShell(page, { assertPreviewTransport: BROWSER_NAME === 'chromium' });
    await assertAcademyReaderCold(page);
    await page.evaluate(() => localStorage.setItem('yomu:academy:language:v1', 'ja'));
    await navigateToAcademyShell(page);
    await assertHostedRuntimeOrder(page, {
        surface: 'Academy',
        annotationSelector: '.academy-root .academy-title[data-yomu-runtime-surface] .jpdb-reader-word',
    });
    assert.deepEqual(hydrationMessages, [], `Vue hydration warning: ${hydrationMessages.join('\n')}`);
    assert.deepEqual(pageErrors, [], `Public page error: ${pageErrors.join('\n')}`);

    console.log(
        `Docs locale browser smoke passed in ${BROWSER_NAME}: SSR/hydration, hosted-locale isolation, route metadata, accessible copy, and reviewed-route fallback (${frames} painted-frame snapshots; hero geometry ${JSON.stringify({ ja: japaneseHeroGeometry, en: englishHeroGeometry })}).`,
    );
} finally {
    await browser.close();
}

async function assertServerRenderedLocale(route, expectedHeading, excludedHeading, label) {
    const response = await fetch(`${ORIGIN}${route}`, {
        headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.ok(response.ok, `${label} server response failed`);
    const html = await response.text();
    assert.ok(html.includes(expectedHeading), `${label} is absent from initial server HTML`);
    assert.equal(html.includes(excludedHeading), false, `${label} route contains the other language's headline`);
}

async function installFirstFrameProbe(page) {
    await page.addInitScript(() => {
        window.__yomuLocaleFrames = [];
        let scheduled = false;
        const capture = () => {
            scheduled = false;
            const headingRoot = document.querySelector('#yomu-home-title');
            const heading = (headingRoot?.querySelector('[data-yomu-hero-live]') ?? headingRoot)
                ?.textContent?.trim() ?? '';
            if (!heading) return;
            window.__yomuLocaleFrames.push({
                path: location.pathname,
                lang: document.documentElement.lang,
                heading,
            });
        };
        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => requestAnimationFrame(capture));
        };
        new MutationObserver(schedule).observe(document, {
            attributes: true,
            childList: true,
            characterData: true,
            subtree: true,
        });
        document.addEventListener('DOMContentLoaded', schedule, { once: true });
    });
}

async function chooseLocale(page, label, href) {
    await page.locator(`.VPNavBarTranslations button[aria-label="${label}"]`).click();
    const [navigationResponse] = await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.locator(`.VPNavBarTranslations a[href="${href}"]`).click(),
    ]);
    assert.ok(
        navigationResponse?.ok(),
        `locale choice ${href} did not load its server-rendered document`,
    );
    assert.equal(new URL(navigationResponse.url()).pathname, href);
    return navigationResponse;
}

async function assertHomepage(page, pathname, lang) {
    await page.waitForFunction(
        ({ pathname: expectedPath, lang: expectedLang, expected }) => {
            const headingRoot = document.querySelector('#yomu-home-title[data-yomu-hero-rotator="on"]');
            const heading = headingRoot?.querySelector('[data-yomu-hero-live]')?.textContent?.trim() ?? '';
            return [
                location.pathname === expectedPath,
                document.documentElement.lang === expectedLang,
                heading.startsWith(expected.prefix),
                heading.endsWith(expected.suffix),
                heading.length > expected.prefix.length + expected.suffix.length,
            ].every(Boolean);
        },
        { pathname, lang, expected: EXPECTED_ROUTE_FRAMES[pathname] },
    );
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertHeroHeadlineReservation(page, surface) {
    const originalViewport = page.viewportSize();
    assert.ok(originalViewport, `${surface} has no viewport`);
    const snapshots = [];
    try {
        for (const width of HERO_GEOMETRY_WIDTHS) {
            await page.setViewportSize({ width, height: Math.max(originalViewport.height, 900) });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const geometry = await page.evaluate(() => {
                const heading = document.querySelector('#yomu-home-title[data-yomu-hero-rotator="on"]');
                const reserve = heading.querySelector('[data-yomu-hero-reserve]');
                const live = heading.querySelector('[data-yomu-hero-live]');
                const candidates = Array.from(heading.querySelectorAll('[data-yomu-hero-candidate]'));
                const heights = candidates.map(candidate => candidate.getBoundingClientRect().height);
                const lineHeight = Number.parseFloat(getComputedStyle(heading).lineHeight);
                const maxCandidateHeight = Math.max(...heights);
                return {
                    declaredCount: Number(heading.getAttribute('data-yomu-hero-candidate-count')),
                    candidateCount: candidates.length,
                    uniqueCandidateCount: new Set(candidates.map(candidate => candidate.getAttribute('data-yomu-hero-candidate'))).size,
                    headingHeight: heading.getBoundingClientRect().height,
                    reserveHeight: reserve.getBoundingClientRect().height,
                    liveHeight: live.getBoundingClientRect().height,
                    liveText: live.textContent.trim(),
                    accessibleName: heading.getAttribute('aria-label'),
                    reserveAriaHidden: reserve.getAttribute('aria-hidden'),
                    reserveIgnored: reserve.getAttribute('data-jpdb-reader-surface-ignore'),
                    reservePointerEvents: getComputedStyle(reserve).pointerEvents,
                    maxCandidateHeight,
                    maxLines: Math.round(maxCandidateHeight / lineHeight),
                };
            });
            assert.ok(geometry.declaredCount > 1, `${surface} has no measured language roster`);
            assert.equal(geometry.candidateCount, geometry.declaredCount, `${surface} omitted a sizing candidate at ${width}px`);
            assert.equal(geometry.uniqueCandidateCount, geometry.declaredCount, `${surface} duplicated a sizing candidate at ${width}px`);
            assert.ok(geometry.maxCandidateHeight > 0, `${surface} candidates have no geometry at ${width}px`);
            assert.ok(geometry.liveText, `${surface} has no current live heading at ${width}px`);
            assert.equal(geometry.accessibleName, geometry.liveText, `${surface} accessible heading is not exactly its live sentence at ${width}px`);
            assert.equal(geometry.reserveAriaHidden, 'true', `${surface} sizing candidates are exposed to accessibility at ${width}px`);
            assert.equal(geometry.reserveIgnored, 'true', `${surface} sizing candidates are lookupable at ${width}px`);
            assert.equal(geometry.reservePointerEvents, 'none', `${surface} sizing candidates intercept pointers at ${width}px`);
            assert.ok(
                Math.abs(geometry.reserveHeight - geometry.maxCandidateHeight) <= 0.75,
                `${surface} reserve does not equal its tallest candidate at ${width}px`,
            );
            assert.ok(
                Math.abs(geometry.headingHeight - geometry.reserveHeight) <= 0.75,
                `${surface} heading does not reserve the roster maximum at ${width}px`,
            );
            assert.ok(
                geometry.liveHeight <= geometry.reserveHeight + 0.75,
                `${surface} live headline exceeds its reserve at ${width}px`,
            );
            snapshots.push({
                width,
                candidates: geometry.candidateCount,
                maxLines: geometry.maxLines,
                height: geometry.reserveHeight,
            });
        }
    } finally {
        await page.setViewportSize(originalViewport);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    return snapshots;
}

async function assertFoldPromptChrome(page, surface) {
    const state = await page.evaluate(() => {
        const prompt = document.querySelector('[data-yomu-fold-prompt]');
        const fallback = prompt.querySelector('.yomu-fold-prompt-fallback');
        return {
            ignored: prompt.getAttribute('data-jpdb-reader-surface-ignore'),
            ariaHidden: prompt.getAttribute('aria-hidden'),
            promptPointerEvents: getComputedStyle(prompt).pointerEvents,
            fallbackTag: fallback.tagName,
            fallbackHref: fallback.getAttribute('href'),
            fallbackPointerEvents: getComputedStyle(fallback).pointerEvents,
        };
    });
    assert.equal(state.ignored, 'true', `${surface} prompt is not isolated from Reader annotation`);
    assert.equal(state.ariaHidden, null, `${surface} prompt is hidden from accessibility`);
    assert.notEqual(state.promptPointerEvents, 'none', `${surface} prompt cannot receive pointers`);
    assert.equal(state.fallbackTag, 'A', `${surface} fallback is not a native link`);
    assert.equal(state.fallbackHref, '#read', `${surface} fallback lost its native destination`);
    assert.notEqual(state.fallbackPointerEvents, 'none', `${surface} fallback link cannot receive pointers`);
}

async function assertRoute(page, pathname, lang) {
    await page.waitForFunction(
        ({ pathname: expectedPath, lang: expectedLang }) =>
            location.pathname === expectedPath
            && document.documentElement.lang === expectedLang,
        { pathname, lang },
    );
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertLocaleHref(page, label, href) {
    await page.waitForFunction(
        ({ label: expectedLabel, href: expectedHref }) => {
            const links = [...document.querySelectorAll('.VPNavBarTranslations a[href]')];
            return links.some(link =>
                link.textContent?.trim() === expectedLabel
                && link.getAttribute('href') === expectedHref);
        },
        { label, href },
    );
}

async function assertRouteMetadata(page, pathname, lang) {
    const canonical = new URL(pathname, 'https://yomureader.com').href;
    const openGraphLocale = { en: 'en_US', ja: 'ja_JP' }[lang];
    await page.waitForFunction(
        ({ canonical: expectedCanonical, openGraphLocale: expectedLocale }) => {
            const script = document.querySelector('script[type="application/ld+json"][data-yomu-route-head]');
            if (!script) return false;
            const breadcrumb = JSON.parse(script.textContent ?? '{}');
            return [
                document.querySelector('link[rel="canonical"]')?.getAttribute('href') === expectedCanonical,
                document.querySelector('meta[property="og:url"]')?.getAttribute('content') === expectedCanonical,
                document.querySelector('meta[property="og:locale"]')?.getAttribute('content') === expectedLocale,
                breadcrumb?.itemListElement?.[1]?.item === expectedCanonical,
            ].every(Boolean);
        },
        { canonical, openGraphLocale },
    );
}

async function assertJapaneseThemeAccessibility(page) {
    const labels = await page.evaluate(() => ({
        main: document.getElementById('main-nav-aria-label')?.textContent?.trim(),
        extra: document.querySelector('.VPNavBarExtra > button')?.getAttribute('aria-label'),
        mobile: document.querySelector('.VPNavBarHamburger')?.getAttribute('aria-label'),
    }));
    assert.deepEqual(labels, {
        main: 'メインナビゲーション',
        extra: 'メニュー',
        mobile: 'モバイルナビゲーション',
    });
}

async function assertNoWrongLanguageFrame(page) {
    const pathname = new URL(page.url()).pathname;
    await page.waitForFunction(
        expectedPath => window.__yomuLocaleFrames?.some(frame => frame.path === expectedPath),
        pathname,
    );
    const frames = await page.evaluate(() => window.__yomuLocaleFrames ?? []);
    const mismatches = frames.filter(isWrongLanguageFrame);
    assert.deepEqual(mismatches, [], `wrong-language painted frame: ${JSON.stringify(mismatches)}`);
}

function isWrongLanguageFrame(frame) {
    const expected = EXPECTED_ROUTE_FRAMES[frame.path];
    if (!expected) return false;
    if (frame.lang !== expected.lang) return true;
    if (frame.heading === expected.staticHeading) return false;
    return !dynamicHeadingMatches(frame.heading, expected);
}

function dynamicHeadingMatches(heading, expected) {
    return [
        heading.startsWith(expected.prefix),
        heading.endsWith(expected.suffix),
        heading.length > expected.prefix.length + expected.suffix.length,
    ].every(Boolean);
}

async function assertHostedRuntimeOrder(page, { surface, annotationSelector, lookupExpression }) {
    await page.waitForFunction(() =>
        document.querySelector('#jpdb-reader-runtime-owner[data-yomu-runtime-health="ready"]'),
    null,
    { timeout: 20_000 });
    const scripts = await page.evaluate(() => Array.from(
        document.querySelectorAll('script[data-yomu-hosted-runtime-role]'),
        script => ({
            role: script.getAttribute('data-yomu-hosted-runtime-role'),
            state: script.getAttribute('data-yomu-hosted-runtime-state'),
            src: script.getAttribute('src'),
        }),
    ));
    assert.ok(scripts.length >= 2, `${surface} did not load a dependency plus core`);
    assert.ok(scripts.slice(0, -1).every(script => script.role === 'dependency'), `${surface} runtime dependency order is invalid`);
    assert.equal(scripts.at(-1)?.role, 'core', `${surface} did not append core last`);
    assert.ok(scripts.every(script => script.state === 'loaded'), `${surface} runtime graph did not settle`);
    assert.ok(
        scripts.slice(0, -1).every(script => /\/greasyfork\/[a-z\d.-]+\.[a-f\d]{12}\.user\.js(?:[?#]|$)/u.test(script.src ?? '')),
        `${surface} did not use immutable final-userscript dependencies`,
    );
    if (surface === 'Academy') await assertAcademyRuntimeRevision(page);
    const annotatedWord = page.locator(annotationSelector).first();
    await annotatedWord.waitFor({ state: 'visible', timeout: 20_000 });
    if (!lookupExpression) return;
    await assertOwnedHoverLookup(page, annotatedWord, annotationSelector, lookupExpression);
    await page.keyboard.press('Escape');
}

async function assertOwnedHoverLookup(page, target, selector, expectedExpression) {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0, `${expectedExpression} has no pointer geometry`);
    const center = {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
    };
    const initialHeading = (await page.locator('#yomu-home-title [data-yomu-hero-live]').textContent())?.trim();
    assert.ok(initialHeading, 'homepage hero rotator has no heading');
    const ownsCenter = await page.evaluate(({ selector: targetSelector, x, y }) => {
        const lookupTarget = document.querySelector(targetSelector);
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit && lookupTarget?.contains(hit));
    }, { selector, ...center });
    assert.ok(ownsCenter, `${expectedExpression} does not own its visible center`);

    // Arm before the one real pointer move. Once the exact target first owns the
    // hover, every painted frame must keep it: the probe latches a transient loss
    // instead of letting a later return to the same coordinates hide the reflow.
    await page.mouse.move(0, 0);
    await page.evaluate(({ selector: targetSelector, x, y }) => {
        const probe = {
            running: true,
            started: false,
            lost: false,
            rotated: false,
            samples: 0,
            headingAtStart: '',
            ownsPointer: false,
            startGeometry: null,
            lossGeometry: null,
        };
        window.__yomuTryMeOwnershipProbe = probe;
        const targetOwnsPointer = () => {
            const lookupTarget = document.querySelector(targetSelector);
            const hit = document.elementFromPoint(x, y);
            if (!lookupTarget) return false;
            if (!hit) return false;
            if (!lookupTarget.contains(hit)) return false;
            return lookupTarget.matches(':hover');
        };
        const headingText = () => {
            const heading = document.querySelector('#yomu-home-title [data-yomu-hero-live]');
            if (!heading) return '';
            return (heading.textContent || '').trim();
        };
        const pointGeometry = () => {
            const lookupTarget = document.querySelector(targetSelector);
            const hit = document.elementFromPoint(x, y);
            const heading = document.querySelector('#yomu-home-title');
            const foldLive = document.querySelector('.yomu-fold-live');
            const prompt = document.querySelector('[data-yomu-fold-prompt]');
            const sample = document.querySelector('.yomu-fold-try');
            const targetRect = lookupTarget.getBoundingClientRect();
            const headingRect = heading.getBoundingClientRect();
            const foldLiveRect = foldLive.getBoundingClientRect();
            const promptRect = prompt.getBoundingClientRect();
            const sampleRect = sample.getBoundingClientRect();
            return {
                targetTop: targetRect.top,
                targetBottom: targetRect.bottom,
                headingTop: headingRect.top,
                headingBottom: headingRect.bottom,
                headingHeight: headingRect.height,
                foldLiveTop: foldLiveRect.top,
                promptTop: promptRect.top,
                promptHeight: promptRect.height,
                promptText: prompt.textContent.trim(),
                promptMissing: prompt.hasAttribute('data-yomu-runtime-missing'),
                sampleTop: sampleRect.top,
                scrollY,
                hitTag: hit.tagName,
                hitClass: hit.getAttribute('class'),
                heading: headingText(),
            };
        };
        const startProbe = (ownsPointer, heading) => {
            if (probe.started) return;
            if (!ownsPointer) return;
            if (!heading) return;
            probe.started = true;
            probe.headingAtStart = heading;
            probe.startGeometry = pointGeometry();
        };
        const recordSample = () => {
            if (probe.started) probe.samples += 1;
        };
        const recordLoss = ownsPointer => {
            if (!probe.started) return;
            if (ownsPointer) return;
            if (!probe.lost) probe.lossGeometry = pointGeometry();
            probe.lost = true;
        };
        const recordRotation = heading => {
            if (!probe.started) return;
            if (!heading) return;
            if (heading !== probe.headingAtStart) probe.rotated = true;
        };
        const sample = () => {
            if (!probe.running) return;
            const ownsPointer = targetOwnsPointer();
            const heading = headingText();
            probe.ownsPointer = ownsPointer;
            startProbe(ownsPointer, heading);
            recordSample();
            recordLoss(ownsPointer);
            recordRotation(heading);
            requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    }, { selector, ...center });
    await page.mouse.move(center.x, center.y);
    await page.waitForFunction(
        ({ expectedExpression: expression }) => {
            const popoverMatches = popover => {
                const rect = popover.getBoundingClientRect();
                const style = getComputedStyle(popover);
                const spelling = popover.querySelector('.jpdb-reader-spelling');
                let spellingText = '';
                if (spelling) spellingText = spelling.textContent || '';
                return [
                    rect.width > 0,
                    rect.height > 0,
                    style.display !== 'none',
                    style.visibility !== 'hidden',
                    spellingText.includes(expression),
                ].every(Boolean);
            };
            const probePassed = () => {
                const probe = window.__yomuTryMeOwnershipProbe;
                if (!probe) return false;
                return [
                    probe.started,
                    probe.rotated,
                    probe.samples,
                    probe.ownsPointer,
                    !probe.lost,
                ].every(Boolean);
            };
            const popovers = Array.from(document.querySelectorAll('.jpdb-reader-popover'));
            return [
                probePassed(),
                popovers.some(popoverMatches),
            ].every(Boolean);
        },
        { expectedExpression },
        { timeout: 8_000 },
    ).catch(async error => {
        const probe = await page.evaluate(() => window.__yomuTryMeOwnershipProbe);
        throw new Error(`Try Me ownership did not settle: ${JSON.stringify(probe)}`, { cause: error });
    });
    await page.evaluate(() => {
        const probe = window.__yomuTryMeOwnershipProbe;
        if (probe) probe.running = false;
    });
}

function readLocalePolicySnapshot() {
    const owner = document.getElementById('jpdb-reader-runtime-owner');
    const installedMarker = document.getElementById('jpdb-reader-installed-runtime');
    return {
        pathname: location.pathname,
        lang: document.documentElement.lang,
        navigatorLanguage: navigator.language,
        navigatorLanguages: [...navigator.languages],
        hosted: document.documentElement.dataset.yomuHosted !== undefined,
        ownerHealth: owner?.dataset.yomuRuntimeHealth,
        runtimeOwner: Boolean(owner),
        initialized: window.__yomuReaderAppInitialized === true,
        installedMarker: Boolean(installedMarker),
        installedKind: installedMarker?.dataset.yomuInstalledRuntimeKind,
        runtimeScripts: document.querySelectorAll('script[data-yomu-hosted-runtime-role]').length,
        scalar: localStorage.getItem('yomu:prefer-japanese-site-language:v1'),
        startupCache: localStorage.getItem('yomu:prefer-japanese-site-language'),
        settings: localStorage.getItem('jpdb-popup-reader-settings'),
        redirect: sessionStorage.getItem('yomu:jps'),
        redirectHosts: sessionStorage.getItem('yomu:jps:hosts'),
        intentLedger: localStorage.getItem('yomu:settings-intent:v2'),
        legacyPins: localStorage.getItem('yomu:explicit-user-settings:v1'),
    };
}

function storedSiteLanguagePreference(stored) {
    if (!stored) return null;
    try {
        return siteLanguagePreferenceValue(JSON.parse(stored));
    } catch {
        return 'invalid';
    }
}

function siteLanguagePreferenceValue(settings) {
    const preference = settings?.preferJapaneseSiteLanguage;
    if (typeof preference !== 'boolean') return null;
    return preference;
}

function seedLocaleProofStorage(fixture) {
    if (location.origin !== fixture.origin) return;
    Object.entries(fixture.local).forEach(([key, value]) => localStorage.setItem(key, value));
    Object.entries(fixture.session).forEach(([key, value]) => sessionStorage.setItem(key, value));
}

async function withLocaleProofPage(browser, errorSurface, verify, setupContext = async () => {}) {
    const context = await browser.newContext(LOCALE_PROOF_BROWSER_OPTIONS);
    const pageErrors = [];
    try {
        await setupContext(context);
        const page = await context.newPage();
        page.on('pageerror', error => pageErrors.push(error.stack || error.message));
        await verify(page);
        assert.deepEqual(pageErrors, [], `${errorSurface} page error: ${pageErrors.join('\n')}`);
    } finally {
        await context.close();
    }
}

async function navigateLocaleProof(page, pathname, surface) {
    const response = await page.goto(`${ORIGIN}${pathname}`, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), `${surface} response failed`);
    return response;
}

async function assertHostedLocaleIsolation(page, pathname, lang, surface, options = {}) {
    await page.locator('html[data-yomu-hosted]').waitFor({ state: 'attached' });
    await page.locator('#jpdb-reader-runtime-owner[data-yomu-runtime-health="ready"]')
        .waitFor({ state: 'attached' });
    await page.waitForFunction(() => window.__yomuReaderAppInitialized === true);
    const state = await page.evaluate(readLocalePolicySnapshot);
    const storedPreference = storedSiteLanguagePreference(state.settings);
    assert.equal(state.pathname, pathname, `${surface} changed locale route`);
    assert.equal(state.lang, lang, `${surface} document language changed`);
    assert.equal(state.navigatorLanguage, 'en-GB', `${surface} rewrote navigator.language`);
    assert.equal(state.navigatorLanguages[0], 'en-GB', `${surface} rewrote navigator.languages`);
    assert.equal(state.hosted, true, `${surface} did not claim page-owned hosted policy`);
    assert.equal(state.ownerHealth, 'ready', `${surface} hosted Reader did not become ready`);
    assert.equal(state.initialized, true, `${surface} did not initialize the Reader application`);
    assert.equal(state.installedMarker, false, `${surface} falsely claimed installed ownership`);
    assert.notEqual(storedPreference, 'invalid', `${surface} stored invalid settings JSON`);
    if (options.fresh) {
        assert.equal(state.scalar, null, `${surface} invented shared learner intent`);
        assert.notEqual(storedPreference, true, `${surface} persisted its local default as learner intent`);
    }
    if (options.contaminated) {
        // These legacy records deliberately remain in place: route stability
        // must come from the hosted-policy boundary, not destructive cleanup.
        assert.equal(state.scalar, 'true', `${surface} deleted the contaminated learner scalar`);
        assert.equal(state.startupCache, 'true', `${surface} deleted the contaminated startup cache`);
        assert.notEqual(state.redirect, null, `${surface} deleted the contaminated redirect record`);
        assert.notEqual(state.redirectHosts, null, `${surface} deleted the contaminated redirect provenance`);
        assert.notEqual(state.intentLedger, null, `${surface} deleted the contaminated intent ledger`);
        assert.notEqual(state.legacyPins, null, `${surface} deleted the contaminated legacy pins`);
    }
}

async function assertEnglishHostedHomepage(page, surface, options) {
    await navigateLocaleProof(page, '/', surface);
    await assertHomepage(page, '/', 'en');
    await assertHostedRuntimeOrder(page, {
        surface,
        annotationSelector: HOMEPAGE_TRY_ME_LOOKUP_SELECTOR,
        lookupExpression: '今日',
    });
    await assertHostedLocaleIsolation(page, '/', 'en', surface, options);
}

async function assertContaminatedHostedContextStaysEnglish(browser) {
    const surface = 'Contaminated English homepage';
    const origin = new URL(ORIGIN).origin;
    await withLocaleProofPage(browser, 'Contaminated hosted', async page => {
        await assertEnglishHostedHomepage(page, surface, { contaminated: true });
    }, context => context.addInitScript(seedLocaleProofStorage, {
        origin,
        local: {
            'yomu:prefer-japanese-site-language:v1': 'true',
            'yomu:prefer-japanese-site-language': 'true',
            'jpdb-popup-reader-settings': JSON.stringify({ preferJapaneseSiteLanguage: true, theme: 'dark' }),
            'yomu:settings-intent:v2': JSON.stringify({
                revision: 1,
                records: { preferJapaneseSiteLanguage: { seq: 1, value: true } },
            }),
            'yomu:explicit-user-settings:v1': JSON.stringify({ preferJapaneseSiteLanguage: true }),
        },
        session: {
            'yomu:jps': JSON.stringify([`${origin}/`, `${origin}/ja/`, Date.now()]),
            'yomu:jps:hosts': JSON.stringify([new URL(origin).hostname]),
        },
    }));
}

async function configureInstalledOwnerContext(context, expectedSettings) {
    const origin = new URL(ORIGIN).origin;
    await context.addInitScript(seedLocaleProofStorage, {
        origin,
        local: {
            'yomu:prefer-japanese-site-language:v1': 'true',
            'yomu:prefer-japanese-site-language': 'true',
            'jpdb-popup-reader-settings': expectedSettings,
        },
        session: {
            'yomu:jps': 'installed-pending-redirect',
            'yomu:jps:hosts': '["installed.example"]',
        },
    });
    await context.route(url => url.origin === origin && url.pathname === '/', async route => {
        const response = await route.fetch();
        const html = await response.text();
        assert.ok(html.includes('<head>'), 'English homepage has no head for installed marker fixture');
        const headers = { ...response.headers() };
        delete headers['content-encoding'];
        delete headers['content-length'];
        await route.fulfill({
            status: response.status(),
            headers,
            body: html.replace(
                '<head>',
                '<head><meta id="jpdb-reader-installed-runtime" data-yomu-installed-runtime-kind="userscript">',
            ),
        });
    });
}

async function assertInstalledRuntimePreservesStoredState(browser) {
    const expectedSettings = JSON.stringify({ preferJapaneseSiteLanguage: true, theme: 'dark' });
    await withLocaleProofPage(browser, 'Installed-owner', async page => {
        await navigateLocaleProof(page, '/', 'Installed-owner English homepage');
        await assertHomepage(page, '/', 'en');
        await page.locator(HOMEPAGE_TRY_ME_LOOKUP_SELECTOR).first().hover();
        await page.waitForTimeout(750);
        const state = await page.evaluate(readLocalePolicySnapshot);
        assert.equal(state.pathname, '/', 'Installed owner changed locale route');
        assert.equal(state.lang, 'en', 'Installed owner changed document language');
        assert.equal(state.installedKind, 'userscript', 'Installed owner marker changed kind');
        assert.equal(state.hosted, false, 'Hosted fallback claimed installed-owner policy');
        assert.equal(state.runtimeOwner, false, 'Hosted fallback claimed runtime ownership');
        assert.equal(state.runtimeScripts, 0, 'Hosted fallback injected runtime scripts');
        assert.equal(state.scalar, 'true', 'Hosted fallback changed the learner scalar');
        assert.equal(state.startupCache, 'true', 'Hosted fallback changed the startup cache');
        assert.equal(state.settings, expectedSettings, 'Hosted fallback changed Reader settings');
        assert.equal(state.redirect, 'installed-pending-redirect', 'Hosted fallback changed redirect state');
        assert.equal(state.redirectHosts, '["installed.example"]', 'Hosted fallback changed redirect provenance');
    }, context => configureInstalledOwnerContext(context, expectedSettings));
}

async function assertStudyDoesNotContaminateRoot(browser) {
    await withLocaleProofPage(browser, 'Study-first', async page => {
        await navigateLocaleProof(page, '/study/', 'Study');
        await page.waitForFunction(() => window.__YOMU_READER_RUNTIME__ === 'newtab'
            && document.documentElement.dataset.yomuHosted !== undefined);
        await page.locator('.jpdb-reader-newtab[data-jpdb-reader-root][data-newtab-bound="true"]')
            .waitFor({ state: 'visible', timeout: 20_000 });
        await assertEnglishHostedHomepage(page, 'Study-to-English homepage', { fresh: true });
    });
}

async function assertAcademyDoesNotContaminateRoot(browser) {
    const origin = new URL(ORIGIN).origin;
    await withLocaleProofPage(browser, 'Academy-first', async page => {
        await navigateLocaleProof(page, '/academy/', 'Japanese-first Academy');
        await assertHostedRuntimeOrder(page, {
            surface: 'Academy',
            annotationSelector: '.academy-root .academy-title[data-yomu-runtime-surface] .jpdb-reader-word',
        });
        await assertEnglishHostedHomepage(page, 'Academy-to-English homepage', { fresh: true });
    }, context => context.addInitScript(seedLocaleProofStorage, {
        origin,
        local: { 'yomu:academy:language:v1': 'ja' },
        session: {},
    }));
}

async function navigateToAcademyShell(page, { assertPreviewTransport = false } = {}) {
    // Academy registers its offline worker as soon as the shell loads. The
    // first install intentionally precaches hundreds of lesson and voice
    // assets, so transport-level network idleness is neither bounded nor a
    // product-readiness signal. The assertions after navigation own readiness:
    // English waits for its visible cold shell; Japanese waits for the hosted
    // runtime health marker, dependency order, and an annotated word.
    const applicationResponse = assertPreviewTransport
        ? page.waitForResponse(candidate => new URL(candidate.url()).pathname === '/academy/app.js')
        : null;
    const navigation = page.goto(`${ORIGIN}/academy/`, { waitUntil: 'domcontentloaded' });
    const [response, application] = applicationResponse
        ? await Promise.all([navigation, applicationResponse])
        : [await navigation, null];
    assert.ok(response?.ok(), 'Academy route response failed');
    if (!application) return;
    assert.ok(application.ok(), 'Academy application response failed');
    assert.equal(
        application.headers()['content-encoding'],
        'gzip',
        'Docs preview ignored the smoke transport and may be dynamically Brotli-encoding Academy',
    );
}

async function assertAcademyRuntimeRevision(page) {
    const revisions = await page.evaluate(() => {
        const revision = selector => {
            const src = document.querySelector(selector)?.getAttribute(selector.startsWith('link') ? 'href' : 'src');
            return src ? new URL(src, location.href).searchParams.get('v') : null;
        };
        return {
            core: revision('script[data-yomu-hosted-runtime-role="core"]'),
            css: revision('link[data-yomu-hosted-academy-css]'),
            graph: revision('script[src*="/hosted-runtime-graph.js"]'),
        };
    });
    assert.match(revisions.graph ?? '', /^s1-[a-f\d]{12}$/u, 'Academy graph has no content revision');
    assert.equal(revisions.core, revisions.graph, 'Academy core did not bypass an older controlling service worker');
    assert.equal(revisions.css, revisions.graph, 'Academy Reader CSS did not bypass an older controlling service worker');
}

async function assertAcademyReaderCold(page) {
    await page.locator('.academy-root').waitFor({ state: 'visible' });
    await page.waitForTimeout(750);
    const state = await page.evaluate(() => ({
        graphError: document.documentElement.dataset.yomuHostedRuntimeGraphError,
        marker: Boolean(document.getElementById('jpdb-reader-runtime-owner')),
        runtimeScripts: document.querySelectorAll('script[data-yomu-hosted-runtime-role]').length,
    }));
    assert.deepEqual(state, {
        graphError: undefined,
        marker: false,
        runtimeScripts: 0,
    }, 'English Academy eagerly booted the optional Reader without a reading surface');
}
