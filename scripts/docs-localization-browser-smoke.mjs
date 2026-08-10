import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const ORIGIN = process.env.YOMU_DOCS_PREVIEW_URL || 'http://127.0.0.1:4199';
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
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage();
    const hydrationMessages = [];
    const pageErrors = [];
    page.on('console', message => {
        if (/hydration|mismatch/i.test(message.text())) hydrationMessages.push(message.text());
    });
    page.on('pageerror', error => {
        pageErrors.push(error.stack || error.message);
        if (/hydration|mismatch/i.test(error.message)) hydrationMessages.push(error.message);
    });

    await installFirstFrameProbe(page);
    const response = await page.goto(`${ORIGIN}/ja/`, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), 'Japanese route response failed');
    const initialHtml = await response.text();
    assert.ok(initialHtml.includes(JA_STATIC_HEADING), 'Japanese is absent from initial server HTML');
    assert.equal(initialHtml.includes(EN_STATIC_HEADING), false, 'English headline leaked into initial Japanese HTML');
    await assertHomepage(page, '/ja/', 'ja');
    await assertNoWrongLanguageFrame(page);
    await assertFoldPromptChrome(page, 'Japanese homepage');
    const japaneseHeroGeometry = await assertHeroHeadlineReservation(page, 'Japanese homepage');
    await assertHostedRuntimeOrder(page, {
        surface: 'Japanese homepage',
        annotationSelector: HOMEPAGE_TRY_ME_LOOKUP_SELECTOR,
        lookupExpression: '今日',
    });

    await chooseLocale(page, '言語を変更', '/');
    await assertHomepage(page, '/', 'en');
    await assertNoWrongLanguageFrame(page);
    await assertFoldPromptChrome(page, 'English homepage');
    const englishHeroGeometry = await assertHeroHeadlineReservation(page, 'English homepage');

    await chooseLocale(page, 'Change language', '/ja/');
    await assertHomepage(page, '/ja/', 'ja');
    await assertNoWrongLanguageFrame(page);

    await page.goto(`${ORIGIN}/learn/reading`, { waitUntil: 'networkidle' });
    await assertRoute(page, '/learn/reading', 'en');
    await assertLocaleHref(page, '日本語', '/ja/learn/reading');
    await assertRouteMetadata(page, '/learn/reading', 'en');
    await chooseLocale(page, 'Change language', '/ja/learn/reading');
    await assertRoute(page, '/ja/learn/reading', 'ja');
    await assertRouteMetadata(page, '/ja/learn/reading', 'ja');
    await assertJapaneseThemeAccessibility(page);

    await page.goto(`${ORIGIN}/privacy/`, { waitUntil: 'networkidle' });
    await assertRoute(page, '/privacy/', 'en');
    await assertLocaleHref(page, '日本語', '/ja/');
    await chooseLocale(page, 'Change language', '/ja/');
    await assertHomepage(page, '/ja/', 'ja');
    await assertNoWrongLanguageFrame(page);
    const frames = await page.evaluate(() => window.__yomuLocaleFrames?.length ?? 0);
    assert.ok(frames >= 1, 'first-frame probe did not observe the final route rendering');

    await navigateToAcademyShell(page);
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
        `Docs locale browser smoke passed: SSR/hydration, route metadata, accessible copy, and reviewed-route fallback (${frames} painted-frame snapshots; hero geometry ${JSON.stringify({ ja: japaneseHeroGeometry, en: englishHeroGeometry })}).`,
    );
} finally {
    await browser.close();
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

async function navigateToAcademyShell(page) {
    // Academy registers its offline worker as soon as the shell loads. The
    // first install intentionally precaches hundreds of lesson and voice
    // assets, so transport-level network idleness is neither bounded nor a
    // product-readiness signal. The assertions after navigation own readiness:
    // English waits for its visible cold shell; Japanese waits for the hosted
    // runtime health marker, dependency order, and an annotated word.
    const response = await page.goto(`${ORIGIN}/academy/`, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), 'Academy route response failed');
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
