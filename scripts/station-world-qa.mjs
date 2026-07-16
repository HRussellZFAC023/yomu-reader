#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { build } from 'vite';
import { assert, launchSmokeBrowser, serveFile, startLoopbackServer } from './lib/smoke-harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUILD_ROOT = path.join(ROOT, 'qa-artifacts', 'station-world', 'build');
const EVIDENCE_ROOT = path.join(ROOT, 'docs', 'academy', 'evidence', 'station-world');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const HOSTED_ROOT = path.join(ROOT, 'docs', 'public');
const CONFIG = path.join(ROOT, 'config', 'vite', 'academy.config.ts');
const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'phone', width: 390, height: 844 },
];

rmSync(BUILD_ROOT, { recursive: true, force: true });
rmSync(EVIDENCE_ROOT, { recursive: true, force: true });
mkdirSync(EVIDENCE_ROOT, { recursive: true });
await build({ configFile: CONFIG, build: { outDir: BUILD_ROOT, emptyOutDir: true } });

const server = await startLoopbackServer(serveAcademy, 'Station world QA server could not bind');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const results = [];

try {
    for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            locale: 'en-GB',
            reducedMotion: 'reduce',
            deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('response', response => {
            if (response.status() >= 400 && !response.url().includes('/academy/api/')) {
                errors.push(`HTTP ${response.status()} ${response.url()}`);
            }
        });
        await page.addInitScript(() => {
            localStorage.setItem('yomu:academy:audio:v1', JSON.stringify({
                muted: true,
                volumes: { music: 0.7, ambience: 0.65, lesson: 1, sfx: 0.8 },
            }));
        });

        const run = `station-world-${viewport.name}`;
        await seedStation(page, run);
        const station = page.locator('[data-current-place="station"]');
        await station.waitFor({ state: 'visible', timeout: 20_000 });
        await page.waitForFunction(() => {
            const image = document.querySelector('[data-current-place="station"] > .academy-background img');
            return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
        });
        await page.waitForTimeout(120);

        const initial = await station.evaluate(collectStationGeometry);
        assertGeometry(`${viewport.name}/initial`, initial);
        assert(initial.primaryActions === 1, `${viewport.name}: Station must expose one primary action`, initial);
        assert(initial.motion.every(item => item.animationName === 'none' && item.transitionDuration === '0s'), `${viewport.name}: reduced motion is not complete`, initial.motion);
        const expectedArt = viewport.width <= 700 ? '--mobile.webp' : '--wide.webp';
        assert(initial.imageCurrentSrc.endsWith(expectedArt), `${viewport.name}: wrong responsive Station art`, initial.imageCurrentSrc);

        await page.locator('[data-station-primary-action]').click();
        await page.waitForSelector('.academy-world-station-board[data-listening-state="replay"]');
        await page.waitForTimeout(80);
        const expanded = await station.evaluate(collectStationGeometry);
        assertGeometry(`${viewport.name}/listening`, expanded);
        assert(expanded.primaryActions === 1, `${viewport.name}: replay duplicated the primary action`, expanded);
        assert(expanded.primaryActionLabel === 'Replay announcement', `${viewport.name}: Listen did not become replay`, expanded);
        assert(expanded.answerChoices === 3, `${viewport.name}: listening answers are missing`, expanded);

        const tapTargets = await station.locator([
            '.academy-world-back',
            '[data-station-primary-action]',
            '.academy-world-object',
            '.academy-world-exit:not(:disabled)',
            '.academy-world-practice-option:not(:disabled)',
        ].join(',')).evaluateAll(elements => elements.map(element => {
            const rect = element.getBoundingClientRect();
            return { label: element.getAttribute('aria-label') ?? element.textContent?.trim(), width: rect.width, height: rect.height };
        }));
        assert(tapTargets.every(target => target.width >= 44 && target.height >= 44), `${viewport.name}: a Station control is smaller than 44px`, tapTargets);

        const exits = station.locator('.academy-world-exit:not(:disabled)');
        for (let index = 0; index < await exits.count(); index += 1) {
            const exit = exits.nth(index);
            await exit.focus();
            await exit.evaluate(element => element.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
            const bounds = await exit.boundingBox();
            assert(bounds && bounds.x >= -2 && bounds.x + bounds.width <= viewport.width + 2, `${viewport.name}: focused route is clipped`, { index, bounds });
        }

        const axe = await new AxeBuilder({ page }).include('[data-current-place="station"]').analyze();
        const serious = axe.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical');
        assert(serious.length === 0, `${viewport.name}: serious Station accessibility violations`, serious);

        const screenshot = path.join(EVIDENCE_ROOT, `station-${viewport.name}.png`);
        await page.screenshot({ path: screenshot, fullPage: false });
        assert(existsSync(screenshot) && statSync(screenshot).size > 20_000, `${viewport.name}: screenshot was not captured`, screenshot);

        await page.locator('[data-station-primary-action]').click();
        await page.waitForTimeout(20);
        assert(await page.locator('[data-station-primary-action]').count() === 1, `${viewport.name}: replay changed control count`);
        await page.locator('.academy-world-back').click();
        await page.waitForSelector('[data-current-place="street"]', { state: 'visible', timeout: 20_000 });
        assert(errors.length === 0, `${viewport.name}: browser runtime errors`, errors);

        results.push({
            viewport,
            screenshot: path.relative(ROOT, screenshot),
            initial,
            expanded,
            axeViolations: axe.violations.length,
        });
        await context.close();
    }
} finally {
    await browser.close().catch(() => undefined);
    await server.close();
}

const report = { check: 'station-world-qa', results };
writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
    check: report.check,
    cases: results.map(result => ({ viewport: result.viewport.name, screenshot: result.screenshot, axeViolations: result.axeViolations })),
}, null, 2));

function collectStationGeometry(screen) {
    const box = element => {
        if (!(element instanceof HTMLElement) || element.hidden || getComputedStyle(element).display === 'none') return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const inside = rect => !rect || rect.left >= -2 && rect.top >= -2 && rect.right <= innerWidth + 2 && rect.bottom <= innerHeight + 2;
    const overlaps = (first, second) => Boolean(first && second
        && Math.min(first.right, second.right) - Math.max(first.left, second.left) > 5
        && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 5);
    const surfaces = Object.fromEntries([
        ['back', '.academy-world-back'],
        ['phase', '.academy-world-hud'],
        ['ticket', '.academy-world-reward'],
        ['board', '.academy-world-station-board:not([hidden])'],
        ['audio', '.academy-world-object'],
        ['routes', '.academy-world-spatial-exits'],
        ['characterName', '.academy-world-character-name'],
    ].map(([name, selector]) => [name, box(screen.querySelector(selector))]));
    const image = screen.querySelector('.academy-background img');
    const motion = ['.academy-world-station-board', '.academy-world-character', '.academy-world-spatial-exits'].map(selector => {
        const element = screen.querySelector(selector);
        const style = getComputedStyle(element);
        return { selector, animationName: style.animationName, transitionDuration: style.transitionDuration };
    });
    return {
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        screen: box(screen),
        imageCurrentSrc: image instanceof HTMLImageElement ? image.currentSrc : '',
        surfaces: Object.fromEntries(Object.entries(surfaces).map(([name, rect]) => [name, { rect, inside: inside(rect) }])),
        overlaps: [
            ['board', 'back'], ['board', 'phase'], ['board', 'ticket'], ['board', 'audio'], ['board', 'routes'], ['board', 'characterName'],
            ['phase', 'ticket'], ['audio', 'routes'], ['characterName', 'routes'],
        ].map(([first, second]) => ({ pair: [first, second], overlaps: overlaps(surfaces[first], surfaces[second]) })),
        primaryActions: screen.querySelectorAll('[data-station-primary-action]').length,
        primaryActionLabel: screen.querySelector('[data-station-primary-action]')?.textContent?.trim() ?? '',
        answerChoices: [...screen.querySelectorAll('.academy-world-practice-option')].filter(element => !element.hidden && getComputedStyle(element).display !== 'none').length,
        motion,
    };
}

function assertGeometry(label, geometry) {
    assert(geometry.documentWidth <= geometry.viewport.width + 2, `${label}: document overflows horizontally`, geometry);
    assert(geometry.screen && geometry.screen.width <= geometry.viewport.width + 2 && geometry.screen.height <= geometry.viewport.height + 2, `${label}: Station exceeds the viewport`, geometry);
    assert(Object.values(geometry.surfaces).every(surface => surface.inside), `${label}: a Station surface is clipped`, geometry.surfaces);
    assert(geometry.overlaps.every(pair => !pair.overlaps), `${label}: Station surfaces overlap`, geometry);
}

async function seedStation(page, run) {
    const url = `${server.origin}/academy/?qa-run=${run}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.academy-access-screen', { timeout: 20_000 });
    await page.evaluate(() => window.__yomuAcademy?.dispose());
    await page.evaluate(async databaseName => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const now = Date.now();
        const transaction = database.transaction(['meta', 'learner-events'], 'readwrite');
        const events = transaction.objectStore('learner-events');
        events.clear();
        events.put({ schemaVersion: 1, eventId: 'qa:profile', at: now - 2, kind: 'profile-changed', profile: { displayName: 'Station QA', learningReason: 'Station presentation verification', portraitId: 'quality-2' } });
        events.put({ schemaVersion: 1, eventId: 'qa:station-cast', at: now - 1, kind: 'characters-encountered', encounterId: 'qa-station-cast', sceneId: 'scene:qa-station-cast', attendeeIds: ['aakash'] });
        transaction.objectStore('meta').put({
            id: 'active-checkpoint',
            value: {
                schemaVersion: 2,
                route: 'station',
                routeHistory: [{ route: 'street' }],
                presentationMode: 'story',
                selectedFork: 'speaking',
                session: { sessionId: `qa-station-${now}`, expiresAt: now + 28_800_000, offlineResumeUntil: now + 2_592_000_000, source: 'local-qa' },
                worldVisits: { station: 1 },
                seenIntroductions: ['place:station'],
                updatedAt: now,
            },
        });
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        database.close();
    }, `yomu-academy-qa-${run}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
}

function serveAcademy(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/academy/api/session') {
        const now = Date.now();
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ sessionId: `station-qa-${now}`, expiresAt: now + 28_800_000, offlineResumeUntil: now + 2_592_000_000 }));
        return;
    }
    if (url.pathname.startsWith('/academy/media/')) {
        response.writeHead(204, { 'cache-control': 'no-store' });
        response.end();
        return;
    }
    const override = url.pathname === '/academy/app.js'
        ? path.join(BUILD_ROOT, 'app.js')
        : url.pathname === '/academy/style.css'
            ? path.join(BUILD_ROOT, 'style.css')
            : null;
    const relative = url.pathname === '/academy/' || url.pathname === '/academy'
        ? 'academy/index.html'
        : url.pathname.replace(/^\/+/, '');
    const source = path.join(PUBLIC_ROOT, relative);
    const hosted = path.join(HOSTED_ROOT, relative);
    const file = override ?? (existsSync(source) ? source : hosted);
    const allowedRoot = override ? BUILD_ROOT : file === source ? PUBLIC_ROOT : HOSTED_ROOT;
    if (!existsSync(file) || statSync(file).isDirectory() || !file.startsWith(allowedRoot)) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    serveFile(response, file, contentType(file), request.method);
}

function contentType(file) {
    if (file.endsWith('.html')) return 'text/html; charset=utf-8';
    if (file.endsWith('.css')) return 'text/css; charset=utf-8';
    if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (file.endsWith('.json') || file.endsWith('.webmanifest')) return 'application/json';
    if (file.endsWith('.webp')) return 'image/webp';
    if (file.endsWith('.png')) return 'image/png';
    if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
    if (file.endsWith('.mp3')) return 'audio/mpeg';
    return 'application/octet-stream';
}
