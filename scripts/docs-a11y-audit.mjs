#!/usr/bin/env node
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { summarizeAxeViolations, WCAG_AUDIT_TAGS } from './lib/a11y-audit-helpers.mjs';
import { createYomuPaths } from './lib/paths.mjs';

const { appRoot: ROOT, qaArtifactsRoot: ARTIFACTS } = createYomuPaths(import.meta.dirname);
const DOCS_DIST = path.join(ROOT, 'docs/.vitepress/dist');

const pages = [
    { name: 'home', path: '/' },
    { name: 'getting-started', path: '/getting-started' },
    { name: 'features', path: '/features' },
    { name: 'local-audio', path: '/local-audio' },
    { name: 'support', path: '/support' },
    { name: 'changelog', path: '/changelog' },
    { name: 'tools', path: '/tools/' },
    { name: 'tool-furigana-reader', path: '/tools/furigana-reader' },
    { name: 'tool-japanese-ocr', path: '/tools/japanese-ocr' },
    { name: 'tool-japanese-subtitle-reader', path: '/tools/japanese-subtitle-reader' },
    { name: 'tool-kanji-stroke-order', path: '/tools/kanji-stroke-order' },
    { name: 'tool-study-page', path: '/tools/study-page' },
    { name: 'tool-yomu-gaming', path: '/tools/yomu-gaming' },
    { name: 'tool-youtube-japanese', path: '/tools/youtube-japanese' },
    { name: 'guides', path: '/guides/' },
    { name: 'guide-comprehensible-input-youtube', path: '/guides/comprehensible-input-youtube' },
    { name: 'guide-mine-sentences-to-anki', path: '/guides/mine-sentences-to-anki' },
    { name: 'guide-read-manga-in-japanese', path: '/guides/read-manga-in-japanese' },
    { name: 'guide-study-setup', path: '/guides/study-setup' },
    { name: 'newtab-fallback', path: '/newtab/' },
    { name: 'video-player', path: '/video-player/' },
    { name: 'pdf-reader', path: '/pdf-reader/' },
];

const viewports = [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'ipad', width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    { name: 'iphone', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

function assertAudit(condition, message) {
    if (!condition) throw new Error(message);
}

async function startDocsServer(root) {
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', 'http://127.0.0.1');
            const pathname = decodeURIComponent(url.pathname).replace(/^\/yomu-reader/, '') || '/';
            const filePath = await resolveDocsFile(root, pathname);
            const body = await readFile(filePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType(filePath));
            res.end(body);
        } catch {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Not found');
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return {
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(resolve => server.close(resolve)),
    };
}

async function resolveDocsFile(root, pathname) {
    const clean = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const candidates = docsFileCandidates(root, clean);
    for (const candidate of candidates) {
        const info = await stat(candidate).catch(() => null);
        if (info?.isFile()) return candidate;
    }
    throw new Error(`No docs file for ${pathname}`);
}

function docsFileCandidates(root, clean) {
    if (clean === '/' || clean === '') return [path.join(root, 'index.html')];
    if (clean.endsWith('/')) return [path.join(root, clean, 'index.html')];
    return [
        path.join(root, clean),
        path.join(root, `${clean}.html`),
        path.join(root, clean, 'index.html'),
    ];
}

function contentType(filePath) {
    return DOCS_CONTENT_TYPES.find(({ extension }) => filePath.endsWith(extension))?.type ?? 'application/octet-stream';
}

const DOCS_CONTENT_TYPES = [
    { extension: '.html', type: 'text/html; charset=utf-8' },
    { extension: '.css', type: 'text/css; charset=utf-8' },
    { extension: '.mjs', type: 'text/javascript; charset=utf-8' },
    { extension: '.js', type: 'text/javascript; charset=utf-8' },
    { extension: '.svg', type: 'image/svg+xml; charset=utf-8' },
    { extension: '.png', type: 'image/png' },
    { extension: '.jpg', type: 'image/jpeg' },
    { extension: '.jpeg', type: 'image/jpeg' },
    { extension: '.webp', type: 'image/webp' },
    { extension: '.avif', type: 'image/avif' },
    { extension: '.ico', type: 'image/x-icon' },
    { extension: '.mp4', type: 'video/mp4' },
    { extension: '.webm', type: 'video/webm' },
    { extension: '.vtt', type: 'text/vtt; charset=utf-8' },
    { extension: '.json', type: 'application/json; charset=utf-8' },
    { extension: '.wasm', type: 'application/wasm' },
    { extension: '.woff2', type: 'font/woff2' },
];

async function waitForStablePage(page) {
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
    // Walk the page the way a reader does before judging images: loading="lazy"
    // stills below the fold are not "broken", they simply have not been asked
    // for yet, and a taller page pushed one of them out of range.
    await page.evaluate(async () => {
        const step = Math.round(window.innerHeight * 0.6);
        for (let y = 0; y < document.body.scrollHeight + window.innerHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise(resolve => setTimeout(resolve, 90));
        }
        window.scrollTo(0, 0);
        await new Promise(resolve => setTimeout(resolve, 200));
    }).catch(() => undefined);
    await page.waitForFunction(() => [...document.images].every(image => image.complete), null, { timeout: 8000 }).catch(() => undefined);
}

async function assertDocsAccessibility(page, label) {
    const axe = await new AxeBuilder({ page })
        .withTags(WCAG_AUDIT_TAGS)
        .analyze();
    const violations = summarizeAxeViolations(axe.violations, {
        nodeLimit: 5,
        summarizeNode: node => node.target.join(' '),
    });
    assertAudit(!violations.length, `${label} axe violations: ${JSON.stringify(violations)}`);

    const wcag = await page.evaluate(() => {
        const hasVisibleBox = rect => rect.width > 0 && rect.height > 0;
        const hasVisibleStyle = style => style.visibility !== 'hidden' && style.display !== 'none';
        const hasVisibleOpacity = style => Number(style.opacity || 1) > 0.02;
        const visible = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return hasVisibleStyle(style) && hasVisibleOpacity(style) && hasVisibleBox(rect);
        };
        const accessibleNameValues = element => [
            element.getAttribute('aria-label'),
            element.getAttribute('title'),
            element.getAttribute('alt'),
            element.textContent,
        ];
        const normalizedAccessibleName = value => String(value ?? '').replace(/\s+/g, ' ').trim();
        const accessibleName = element => normalizedAccessibleName(accessibleNameValues(element).find(Boolean));
        const inlineReaderWord = element => element.matches('.jpdb-reader-word')
            && element.closest('.yomu-try-me, .yomu-demo .yomu-try-me-text, .yomu-try-manga');
        const interactive = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])')]
            .filter(element => visible(element));
        const unnamedControls = interactive
            .filter(element => !accessibleName(element))
            .map(element => element.outerHTML.slice(0, 140));
        const smallTargets = interactive
            .filter(element => {
                const style = getComputedStyle(element);
                return !(element.tagName.toLowerCase() === 'a' && style.display === 'inline')
                    && !inlineReaderWord(element);
            })
            .map(element => {
                const rect = element.getBoundingClientRect();
                return { name: accessibleName(element), tag: element.tagName.toLowerCase(), width: rect.width, height: rect.height };
            })
            .filter(item => item.width < 24 || item.height < 24);
        const brokenImages = [...document.images]
            .filter(image => visible(image) && (!image.complete || image.naturalWidth <= 0))
            .map(image => image.getAttribute('src') || image.currentSrc);
        const brokenVideos = [...document.querySelectorAll('video')]
            .filter(video => visible(video) && !video.querySelector('source[src]') && !video.currentSrc)
            .map(video => video.outerHTML.slice(0, 140));
        const missingAlt = [...document.images]
            .filter(image => visible(image) && !image.hasAttribute('alt'))
            .map(image => image.getAttribute('src') || image.currentSrc);
        return {
            unnamedControls,
            smallTargets,
            brokenImages,
            brokenVideos,
            missingAlt,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
        };
    });
    assertAudit(!wcag.unnamedControls.length, `${label} has unnamed controls: ${JSON.stringify(wcag.unnamedControls)}`);
    assertAudit(!wcag.smallTargets.length, `${label} has controls below 24px target size: ${JSON.stringify(wcag.smallTargets)}`);
    assertAudit(!wcag.brokenImages.length, `${label} has broken images: ${JSON.stringify(wcag.brokenImages)}`);
    assertAudit(!wcag.brokenVideos.length, `${label} has video elements without sources: ${JSON.stringify(wcag.brokenVideos)}`);
    assertAudit(!wcag.missingAlt.length, `${label} has images without alt text: ${JSON.stringify(wcag.missingAlt)}`);
    assertAudit(!wcag.horizontalOverflow, `${label} has horizontal overflow`);
}

async function main() {
    await mkdir(ARTIFACTS, { recursive: true });
    const server = await startDocsServer(DOCS_DIST);
    const browser = await chromium.launch({ headless: true });
    const results = [];
    try {
        for (const viewport of viewports) {
            await auditDocsViewport(browser, server.origin, viewport, results);
        }
    } finally {
        await browser.close();
        await server.close();
    }

    const failed = results.filter(result => result.status === 'FAIL');
    console.log(`Docs a11y summary: ${results.length - failed.length}/${results.length} passed`);
    if (failed.length) process.exitCode = 1;
}

async function auditDocsViewport(browser, origin, viewport, results) {
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
        isMobile: viewport.isMobile ?? false,
        hasTouch: viewport.hasTouch ?? false,
    });
    try {
        await installDocsAuditNetworkMocks(context);
        for (const pageDef of pages) {
            await auditDocsPage(context, origin, viewport, pageDef, results);
        }
    } finally {
        await context.close();
    }
}

async function auditDocsPage(context, origin, viewport, pageDef, results) {
    const page = await context.newPage();
    const consoleMessages = [];
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') {
            consoleMessages.push({ type: message.type(), text: message.text() });
        }
    });
    page.on('pageerror', error => consoleMessages.push({ type: 'pageerror', text: error.message }));
    const label = `${pageDef.name} ${viewport.name}`;
    try {
        const response = await page.goto(`${origin}${pageDef.path}`, { waitUntil: 'domcontentloaded' });
        assertAudit(response?.ok(), `${label} failed to load: HTTP ${response?.status() ?? 'unknown'}`);
        await waitForStablePage(page);
        const errors = blockingConsoleMessages(consoleMessages);
        assertAudit(!errors.length, `${label} console/page errors: ${JSON.stringify(errors)}`);
        await assertDocsAccessibility(page, label);
        if (pageDef.name === 'home') await assertHomepageDemo(page, label);
        if (pageDef.name === 'tool-japanese-ocr') await assertOcrToolPage(page, label);
        await page.screenshot({ path: path.join(ARTIFACTS, `docs-${pageDef.name}-${viewport.name}.png`), fullPage: false });
        results.push({ label, status: 'PASS' });
        console.log(`PASS ${label}`);
    } catch (error) {
        results.push({ label, status: 'FAIL', error: errorMessage(error) });
        console.log(`FAIL ${label} - ${errorMessage(error)}`);
    } finally {
        await page.close();
    }
}

// The homepage is a live surface, not a screenshot: the fold runs the real
// reader on a real sentence and the video band hands a real <video> to the real
// subtitle runtime. Both look completely correct when they are dead, so this
// audit presses them rather than inspecting their markup.
async function assertHomepageDemo(page, label) {
    await page.evaluate(() => document.querySelector('.yomu-fold-try')?.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.waitForFunction(() => window.__yomuReaderAppInitialized === true, null, { timeout: 15000 });

    const fold = await page.evaluate(() => {
        const attr = (selector, name) => document.querySelector(selector)?.getAttribute(name) ?? '';
        const sample = document.querySelector('.yomu-try-me-sample');
        return {
            hasRuntimeSurface: Boolean(document.querySelector('.yomu-try-me-text')),
            plainText: attr('.yomu-try-me-sample', 'aria-label'),
            words: document.querySelectorAll('.yomu-try-me-sample .jpdb-reader-word').length,
            pitchWords: document.querySelectorAll('.yomu-try-me-sample [class*="jpdb-pitch-"]').length,
            ruby: document.querySelectorAll('.yomu-try-me-sample ruby, .yomu-try-me-sample rt').length,
            rubyBasesWithKana: [...document.querySelectorAll('.yomu-try-me-sample .jpdb-reader-ruby-base')]
                .map(element => element.textContent?.trim() ?? '')
                .filter(value => /[ぁ-ゟ゠-ヿ]/u.test(value)),
            // A sample the reader is told to skip stays pre-annotated and inert:
            // it looks live and answers nothing. Never ship the fold that way.
            lookupBlocked: Boolean(sample?.closest('[data-jpdb-reader-surface-ignore]')),
            localizeOff: attr('.yomu-try-me-sample', 'data-yomu-localize') === 'off',
            promptFallbackShown: Boolean(document.querySelector('[data-yomu-fold-prompt][data-yomu-runtime-missing]')),
            // The fold now carries all three install routes at once and promotes
            // the installable one with CSS, so .yomu-install-route is where the
            // action lives; .yomu-fold-cta stays matched for the other bands and
            // for any page still on the single-button shape.
            installCta: [...document.querySelectorAll('.yomu-fold .yomu-install-route, .yomu-fold-cta')]
                .map(link => link.getAttribute('href')),
            legendSwatches: document.querySelectorAll('.yomu-fold-legend .yomu-dot').length,
            // Every pitch class the fold paints must appear in the legend that
            // claims to explain the colours.
            samplePitchClasses: [...new Set([...document.querySelectorAll('.yomu-try-me-sample .jpdb-reader-word')]
                .flatMap(word => [...word.classList])
                .filter(name => name.startsWith('jpdb-pitch-')))].sort(),
            legendPitchClasses: [...new Set([...document.querySelectorAll('.yomu-fold-legend .yomu-dot')]
                .flatMap(dot => [...dot.classList])
                .filter(name => name.startsWith('yomu-dot-'))
                .map(name => name.replace('yomu-dot-', 'jpdb-pitch-')))].sort(),
        };
    });

    assertAudit(fold.hasRuntimeSurface, `${label} fold lost the .yomu-try-me-text runtime surface`);
    assertAudit(fold.localizeOff, `${label} fold sample must opt out of docs localisation`);
    assertAudit(!fold.lookupBlocked, `${label} fold sample is inside [data-jpdb-reader-surface-ignore]; every press would do nothing`);
    assertAudit(fold.plainText.includes('喫茶店'), `${label} fold fixture is incomplete: ${fold.plainText}`);
    assertAudit(fold.words >= 5 && fold.pitchWords >= 5 && fold.ruby >= 5, `${label} fold pitch/furigana fixture missing: ${JSON.stringify(fold)}`);
    assertAudit(!fold.rubyBasesWithKana.length, `${label} fold ruby should only sit over kanji bases: ${JSON.stringify(fold.rubyBasesWithKana)}`);
    assertAudit(!fold.promptFallbackShown, `${label} fold prompt fell back to the static link while the runtime was live`);
    assertAudit(fold.installCta.some(href => href?.endsWith('.user.js')), `${label} fold install action missing: ${JSON.stringify(fold.installCta)}`);
    // Detection promotes one route with CSS, so a visitor whose detection never
    // ran or guessed wrong reaches the others only if they are all really here.
    // Losing a store route silently sends every store-capable visitor down the
    // path that needs a manager installed first, which is the friction the
    // store CTAs exist to remove.
    for (const store of ['chromewebstore.google.com', 'addons.mozilla.org']) {
        assertAudit(
            fold.installCta.some(href => href?.includes(store)),
            `${label} fold lost its ${store} install route: ${JSON.stringify(fold.installCta)}`,
        );
    }
    assertAudit(
        fold.samplePitchClasses.every(name => fold.legendPitchClasses.includes(name)),
        `${label} fold paints pitch colours the legend does not explain: ${JSON.stringify(fold)}`,
    );

    // The claim under the arrow is "press a word". Prove a press answers.
    const foldWord = page.locator('.yomu-try-me-sample .jpdb-reader-word').nth(2);
    await foldWord.scrollIntoViewIfNeeded();
    const box = await foldWord.boundingBox();
    assertAudit(Boolean(box), `${label} fold sample word is not hittable`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2 + 1);
    await page.waitForFunction(
        () => Boolean(document.querySelector('.jpdb-reader-popover')),
        null,
        { timeout: 15000 },
    ).catch(() => undefined);
    const popoverText = await page.evaluate(
        () => document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
    assertAudit(popoverText.length > 0, `${label} pressing a fold word opened no lookup popover`);
    await page.keyboard.press('Escape').catch(() => undefined);

    await page.evaluate(() => {
        document.querySelector('.yomu-band-video')?.scrollIntoView({ block: 'center', inline: 'nearest' });
        const video = document.querySelector('.yomu-band-video');
        if (video instanceof HTMLVideoElement) {
            video.currentTime = 0.25;
            void video.play().catch(() => undefined);
        }
    });
    await page.waitForFunction(() => (
        document.querySelector('.jpdb-subtitle-player.jpdb-subtitle-has-lines .jpdb-subtitle-primary .jpdb-reader-word')
    ), null, { timeout: 15000 });

    const band = await page.evaluate(() => {
        const sampleVideo = document.querySelector('.yomu-band-video');
        const subtitlePlayer = document.querySelector('.jpdb-subtitle-player');
        const subtitleRailStyle = subtitlePlayer
            ? getComputedStyle(subtitlePlayer.querySelector('.jpdb-subtitle-rail') ?? subtitlePlayer)
            : null;
        const subtitleTextRect = subtitlePlayer?.querySelector('.jpdb-subtitle-text')?.getBoundingClientRect();
        return {
            sampleVideo: sampleVideo ? {
                controls: sampleVideo.hasAttribute('controls'),
                autoplay: sampleVideo.hasAttribute('autoplay'),
                sourceCount: sampleVideo.querySelectorAll('source[src]').length,
                trackCount: sampleVideo.querySelectorAll('track[kind="subtitles"][src]').length,
            } : null,
            hasVideoFrame: Boolean(document.querySelector('[data-yomu-video-frame]')),
            hasSubtitlePlayer: Boolean(subtitlePlayer),
            subtitleInsideVideoFrame: Boolean(subtitlePlayer?.closest('[data-yomu-video-frame]')),
            subtitleWords: document.querySelectorAll('.jpdb-subtitle-player .jpdb-subtitle-primary .jpdb-reader-word').length,
            subtitleVisible: Boolean(subtitlePlayer && !subtitlePlayer.classList.contains('jpdb-subtitle-hidden')),
            subtitleControlsAlways: Boolean(subtitlePlayer?.classList.contains('jpdb-subtitle-controls-always')),
            subtitleRailVisible: Boolean(subtitleRailStyle && Number(subtitleRailStyle.opacity || '1') > 0.5 && subtitleRailStyle.visibility !== 'hidden'),
            subtitleTextVisible: Boolean(subtitleTextRect && subtitleTextRect.width > 0 && subtitleTextRect.height > 0),
            // The rebuilt page must keep drawing no chrome of its own: no fake
            // OCR boxes, no hand-rolled caption buttons, no YouTube embed.
            mangaTextLayerCount: document.querySelectorAll('.yomu-manga-text-layer').length,
            ocrRegionCount: document.querySelectorAll('.yomu-ocr-region').length,
            ocrCardCount: document.querySelectorAll('[data-yomu-ocr-card], .yomu-ocr-card').length,
            transcriptButtonCount: document.querySelectorAll('.yomu-caption-word').length,
            captionCardCount: document.querySelectorAll('[data-yomu-caption-card], .yomu-video-lookup-card').length,
            hasYoutubeFrame: Boolean(document.querySelector('.yomu-youtube-embed')),
            hasLiteButton: Boolean(document.querySelector('.yomu-youtube-lite')),
            hasYoutubeFallback: Boolean(document.querySelector('.yomu-youtube-fallback')),
        };
    });
    await page.evaluate(() => {
        const video = document.querySelector('.yomu-band-video');
        if (video instanceof HTMLVideoElement) video.pause();
    });

    assertAudit(band.sampleVideo?.controls && !band.sampleVideo?.autoplay, `${label} video sample should be a controlled non-autoplay player: ${JSON.stringify(band.sampleVideo)}`);
    assertAudit(band.sampleVideo?.sourceCount >= 2 && band.sampleVideo?.trackCount >= 1, `${label} video sample is missing sources or subtitles: ${JSON.stringify(band.sampleVideo)}`);
    assertAudit(band.hasVideoFrame && band.hasSubtitlePlayer, `${label} video sample should be owned by the real subtitle runtime: ${JSON.stringify(band)}`);
    assertAudit(band.subtitleWords >= 1, `${label} video sample captions were not parsed into reader words: ${JSON.stringify(band)}`);
    assertAudit(band.subtitleVisible && band.subtitleControlsAlways && band.subtitleRailVisible, `${label} video sample subtitles/controls should be visibly on for the demo: ${JSON.stringify(band)}`);
    assertAudit(band.mangaTextLayerCount === 0 && band.ocrRegionCount === 0 && band.ocrCardCount === 0, `${label} should not render fake OCR chrome: ${JSON.stringify(band)}`);
    assertAudit(band.transcriptButtonCount === 0 && band.captionCardCount === 0, `${label} should not render custom caption buttons/cards: ${JSON.stringify(band)}`);
    assertAudit(!band.hasYoutubeFrame && !band.hasLiteButton && !band.hasYoutubeFallback, `${label} homepage should not render YouTube chrome: ${JSON.stringify(band)}`);

    const captionClickProfile = await profileHomepageSubtitleClick(page);
    assertAudit(captionClickProfile.pauseMs <= 150, `${label} caption click did not pause the sample video instantly: ${JSON.stringify(captionClickProfile)}`);
    assertAudit(captionClickProfile.popoverShellMs <= 350, `${label} caption lookup popover shell was too slow: ${JSON.stringify(captionClickProfile)}`);
}

async function profileHomepageSubtitleClick(page) {
    await page.evaluate(() => {
        const video = document.querySelector('.yomu-band-video');
        if (!(video instanceof HTMLVideoElement)) throw new Error('Sample video missing');
        let paused = false;
        window.__yomuDemoCaptionProfile = {
            startedAt: 0,
            pauseAt: null,
            shellAt: null,
            textAt: null,
            text: '',
        };
        Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
        Object.defineProperty(video, 'ended', { configurable: true, value: false });
        Object.defineProperty(video, 'pause', {
            configurable: true,
            value: () => {
                paused = true;
                const profile = window.__yomuDemoCaptionProfile;
                if (profile && profile.startedAt && profile.pauseAt === null) profile.pauseAt = performance.now();
                video.dispatchEvent(new Event('pause'));
            },
        });
        Object.defineProperty(video, 'play', {
            configurable: true,
            value: () => {
                paused = false;
                video.dispatchEvent(new Event('play'));
                return Promise.resolve();
            },
        });
        const observer = new MutationObserver(() => {
            const profile = window.__yomuDemoCaptionProfile;
            if (!profile?.startedAt) return;
            const popover = document.querySelector('.jpdb-reader-popover');
            if (popover && profile.shellAt === null) profile.shellAt = performance.now();
            const text = popover?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            if (text && profile.textAt === null) {
                profile.textAt = performance.now();
                profile.text = text.slice(0, 180);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        window.__yomuDemoCaptionProfileObserver = observer;
        void video.play();
    });

    const word = page.locator('.jpdb-subtitle-player .jpdb-subtitle-primary .jpdb-reader-word').first();
    await word.waitFor({ state: 'visible', timeout: 6000 });
    await page.evaluate(() => { window.__yomuDemoCaptionProfile.startedAt = performance.now(); });
    await word.evaluate(element => {
        const rect = element.getBoundingClientRect();
        element.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            button: 0,
        }));
    });
    await page.waitForFunction(() => {
        const profile = window.__yomuDemoCaptionProfile;
        return Boolean(profile?.pauseAt && profile?.shellAt);
    }, null, { timeout: 2000 });
    const profile = await page.evaluate(() => {
        window.__yomuDemoCaptionProfileObserver?.disconnect?.();
        const profile = window.__yomuDemoCaptionProfile;
        const delta = value => value === null ? null : Math.round((value - profile.startedAt) * 10) / 10;
        return {
            pauseMs: delta(profile.pauseAt),
            popoverShellMs: delta(profile.shellAt),
            popoverTextMs: delta(profile.textAt),
            text: profile.text,
        };
    });
    await page.keyboard.press('Escape').catch(() => undefined);
    return profile;
}

async function assertOcrToolPage(page, label) {
    const snapshot = await page.evaluate(() => ({
        text: document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        images: [...document.images].map(image => image.getAttribute('src') || image.currentSrc),
    }));
    assertAudit(snapshot.text.includes('MangaOCR') && snapshot.text.includes('PaddleOCR'), `${label} OCR engines copy missing`);
    assertAudit(snapshot.text.includes('local OCR endpoint') || snapshot.text.includes('local OCR app'), `${label} OCR local endpoint limitation missing`);
    // No image assertion: the only manga still we hold is a licensed page with
    // no product on it, and it was captioned as if it showed OCR working. The
    // claim was cut rather than illustrated with a picture that does not show
    // it. Restore this check when there is a real capture of Yomu reading a
    // panel to point at.
    assertAudit(!/coming soon|placeholder/i.test(snapshot.text), `${label} OCR page contains placeholder copy`);
}

async function installDocsAuditNetworkMocks(context) {
    for (const proxy of [
        /^https:\/\/edge\.yomureader\.com\//,
        /^https:\/\/yomu-jpdb-public-proxy\.henry-robert-christopher-russell\.workers\.dev\//,
    ]) {
        await context.route(proxy, route => fulfillDocsAuditProxyRequest(route));
    }
    await context.route(/^https:\/\/jpdb\.io\//, route => {
        const url = new URL(route.request().url());
        const isApiRequest = url.pathname.startsWith('/api/');
        return route.fulfill({
            status: 200,
            contentType: isApiRequest ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: isApiRequest ? '{}' : '<!doctype html><html><body></body></html>',
        });
    });
    await context.route(/^https:\/\/api\.jiten\.moe\//, route => route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: '{"tokens":[],"vocabulary":[]}',
    }));
    await context.route(/^https:\/\/assets\.languagepod101\.com\//, route => route.fulfill({
        status: 204,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: '',
    }));
}

function fulfillDocsAuditProxyRequest(route) {
    const proxyUrl = new URL(route.request().url());
    const targetUrl = new URL(proxyUrl.searchParams.get('url') ?? 'https://jpdb.io/');
    const isApiRequest = targetUrl.hostname === 'api.jiten.moe' || targetUrl.pathname.startsWith('/api/');
    return route.fulfill({
        status: 200,
        contentType: isApiRequest ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: isApiRequest ? '{"tokens":[],"vocabulary":[]}' : '<!doctype html><html><body></body></html>',
    });
}

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function blockingConsoleMessages(messages) {
    const hasKnownOffsetMismatch = messages.some(message => isKnownVitePressOffsetMismatch(message.text));
    return messages
        .filter(message => message.type === 'error' || message.type === 'pageerror')
        .filter(message => !(hasKnownOffsetMismatch && isKnownVitePressHydrationSummary(message.text)))
        .map(message => message.text);
}

function isKnownVitePressHydrationSummary(text) {
    return text === 'Hydration completed but contains mismatches.';
}

function isKnownVitePressOffsetMismatch(text) {
    return text.includes('Hydration style mismatch')
        && text.includes('--vp-offset')
        && text.includes('check-only');
}

await main();
