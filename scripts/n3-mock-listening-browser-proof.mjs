#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import {
    assert,
    launchSmokeBrowser,
    serveFile,
    startLoopbackServer,
} from './lib/smoke-harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const HOSTED_ROOT = path.join(ROOT, 'docs', 'public');
const ARTIFACT_ROOT = path.join(ROOT, 'qa-artifacts', 'n3-mock-listening-browser-proof');
const BUILD_ROOT = path.join(ARTIFACT_ROOT, 'build');
const CONFIG = path.join(ROOT, 'config', 'vite', 'academy.config.ts');
const ALL_VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900, isMobile: false },
    { name: 'mobile', width: 390, height: 844, isMobile: true },
];
const VIEWPORTS = process.env.ACADEMY_N3_PROOF_VIEWPORT
    ? ALL_VIEWPORTS.filter(viewport => viewport.name === process.env.ACADEMY_N3_PROOF_VIEWPORT)
    : ALL_VIEWPORTS;
const PACKAGES = [
    {
        id: 'n3-mock-listening-01-action',
        activityId: 'activity:n3-mock-listening-01-action',
        intro: 'Remove completed work and identify the first action after a change.',
    },
    {
        id: 'n3-mock-listening-02-point',
        activityId: 'activity:n3-mock-listening-02-point',
        intro: 'Listen through denial and contrast for the central reason, evaluation, or recommendation.',
    },
    {
        id: 'n3-mock-listening-03-overview',
        activityId: 'activity:n3-mock-listening-03-overview',
        intro: 'Group purpose, current state, and conclusion to identify the speaker\'s intent.',
    },
    {
        id: 'n3-mock-listening-04-expression',
        activityId: 'activity:n3-mock-listening-04-expression',
        intro: 'Choose language that fits the listener and burden, then say it in a new setting.',
    },
    {
        id: 'n3-mock-listening-05-response',
        activityId: 'activity:n3-mock-listening-05-response',
        intro: 'Identify the function and implication of a short turn, then supply a natural response.',
    },
];

if (process.env.ACADEMY_N3_PROOF_SKIP_BUILD !== '1') {
    rmSync(ARTIFACT_ROOT, { recursive: true, force: true });
    mkdirSync(ARTIFACT_ROOT, { recursive: true });
    await build({
        configFile: CONFIG,
        define: { 'import.meta.env.DEV': 'true' },
        build: { outDir: BUILD_ROOT, emptyOutDir: true },
    });
} else {
    mkdirSync(ARTIFACT_ROOT, { recursive: true });
}

const server = await startLoopbackServer(serveAcademy, 'N3 browser proof server could not bind');
const results = [];

try {
    for (const viewport of VIEWPORTS) {
        const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
        let context;
        try {
            context = await browser.newContext({
                viewport: { width: viewport.width, height: viewport.height },
                deviceScaleFactor: viewport.isMobile ? 2 : 1,
                hasTouch: viewport.isMobile,
                isMobile: viewport.isMobile,
                locale: 'en-GB',
                serviceWorkers: 'block',
            });
            const page = await context.newPage();
            const runtimeErrors = watchRuntime(page);
            await page.addInitScript(() => {
                localStorage.setItem('yomu:academy:audio:v1', JSON.stringify({
                    muted: true,
                    volumes: { music: 0.7, ambience: 0.65, lesson: 1, sfx: 0.8 },
                }));
            });
            await enrollAtN3(page, viewport.name);
            const packageResults = await proveLearnerRail(page, viewport);
            const repair = await proveClosedRevealAndFreshPass(page, viewport);
            assert(runtimeErrors.length === 0, `${viewport.name}: browser runtime errors`, { runtimeErrors });
            results.push({ viewport: viewport.name, status: 'pass', packages: packageResults, repair });
            console.log(`PASS N3 mock-listening browser proof (${viewport.name})`);
        } catch (error) {
            results.push({
                viewport: viewport.name,
                status: 'fail',
                error: error instanceof Error ? error.message : String(error),
            });
            console.error(`FAIL N3 mock-listening browser proof (${viewport.name}): ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            await context?.close().catch(() => undefined);
            await browser.close().catch(() => undefined);
        }
    }
} finally {
    await server.close();
}

const report = { gate: 'n3-mock-listening-browser-proof', build: 'vite-production-with-loopback-qa-gateway', results };
writeFileSync(path.join(ARTIFACT_ROOT, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (results.some(result => result.status === 'fail')) process.exitCode = 1;

async function enrollAtN3(page, run) {
    await openAcademy(page, run);
    await page.locator('input[name="code"]').fill('TEST');
    await pressFocused(page, '.academy-access-form button[type="submit"]');
    await page.waitForSelector('.academy-profile-screen');
    await page.locator('input[name="displayName"]').fill('N3 Route Proof');
    await pressFocused(page, '.academy-profile-advance');
    await page.locator('textarea[name="learningReason"]').fill('Verify the learner-visible N3 continuation route.');
    await pressFocused(page, '.academy-profile-advance');
    await page.locator('input[name="portrait"][value="quality-2"]').check();
    await pressFocused(page, '.academy-profile-advance');
    await pressFocused(page, '.academy-rie-unlock-screen button');
    await page.waitForSelector('.academy-start-screen');
    await pressFocused(page, '[data-start-route="manual-band"]');
    await page.waitForSelector('.academy-band-screen');
    await pressFocused(page, '[data-band="n3"]');
    await page.waitForSelector('.academy-advanced-arrival-screen');
}

async function proveLearnerRail(page, viewport) {
    const results = [];
    for (const [index, packageRecord] of PACKAGES.entries()) {
        await openClass(page, viewport.name);
        const classSelector = '[data-academy-screen="class-path"]';
        await auditSurface(page, viewport, classSelector, `class-${index + 1}`);
        const stop = page.locator(`[data-package-id="${packageRecord.id}"]`);
        assert(await stop.count() === 1, `${viewport.name}: ${packageRecord.id} is absent from the Class rail`);
        assert(await stop.getAttribute('data-rail-state') === (index === 0 ? 'recommended' : 'gated'),
            `${viewport.name}: ${packageRecord.id} has a dishonest rail state`, {
                state: await stop.getAttribute('data-rail-state'),
            });
        const button = stop.locator('button');
        const label = await button.getAttribute('aria-label');
        assert(index === 0 ? label?.startsWith('Start:') : label?.startsWith('Open anyway:'),
            `${viewport.name}: ${packageRecord.id} does not expose the expected optional action`, { label });
        await button.scrollIntoViewIfNeeded();
        await button.focus();
        assert(await button.evaluate(element => element.matches(':focus-visible')),
            `${viewport.name}: ${packageRecord.id} lacks keyboard focus visibility`);
        await page.keyboard.press('Enter');

        const introSelector = `[data-academy-screen="advanced-lesson"][data-advanced-package-id="${packageRecord.id}"]`;
        await page.waitForSelector(introSelector);
        assert((await page.locator(introSelector).textContent())?.includes(packageRecord.intro),
            `${viewport.name}: ${packageRecord.id} skipped its advanced intro`);
        const checkpoint = await readCheckpoint(page, viewport.name);
        assert(checkpoint.lessonId === `advanced:${packageRecord.id}`
            && checkpoint.activityId === packageRecord.activityId
            && checkpoint.lessonId !== 'lesson:foundation-00',
        `${viewport.name}: ${packageRecord.id} lost its exact route identity`, checkpoint);
        await auditSurface(page, viewport, introSelector, `intro-${index + 1}`);

        await pressFocused(page, `${introSelector} .academy-activity-chapter-next`);
        await page.waitForSelector(`${introSelector} [data-activity-stage="teaching"]`);
        await pressFocused(page, `${introSelector} .academy-activity-chapter-next`);
        const activitySelector = `${introSelector} [data-activity-id="${packageRecord.activityId}"]`;
        await page.waitForSelector(activitySelector);
        assert(await page.locator(`${activitySelector} [data-answer-key]`).count() === 0,
            `${viewport.name}: ${packageRecord.id} exposes answers before commitment`);
        await auditSurface(page, viewport, activitySelector, `activity-${index + 1}`);
        await page.screenshot({
            path: path.join(ARTIFACT_ROOT, `${viewport.name}-${String(index + 1).padStart(2, '0')}-${packageRecord.id}.png`),
            fullPage: false,
        });
        results.push({
            packageId: packageRecord.id,
            activityId: checkpoint.activityId,
            railState: index === 0 ? 'recommended' : 'gated-with-override',
            axeViolations: 0,
        });
    }
    return results;
}

async function proveClosedRevealAndFreshPass(page, viewport) {
    const packageRecord = PACKAGES[0];
    await openClass(page, viewport.name);
    await pressFocused(page, `[data-package-id="${packageRecord.id}"] button`);
    const introSelector = `[data-academy-screen="advanced-lesson"][data-advanced-package-id="${packageRecord.id}"]`;
    await page.waitForSelector(introSelector);
    await pressFocused(page, `${introSelector} .academy-activity-chapter-next`);
    await pressFocused(page, `${introSelector} .academy-activity-chapter-next`);
    const activitySelector = `${introSelector} [data-activity-id="${packageRecord.activityId}"]`;
    await page.waitForSelector(activitySelector);
    const questions = page.locator(`${activitySelector} [data-question-id]`);
    for (let index = 0; index < await questions.count(); index++) {
        await questions.nth(index).locator('input[type="radio"]').last().check();
    }
    await pressFocused(page, `${activitySelector} button[type="submit"]`);
    await page.waitForSelector(`${activitySelector}[data-attempt-state="repair"]`);
    const revealCount = await page.locator(`${activitySelector} [data-answer-key="after-attempt"]`).count();
    assert(revealCount === 6, `${viewport.name}: lapse did not reveal one bounded answer per question`, { revealCount });
    await page.locator(`${activitySelector} form`).evaluate(form => form.requestSubmit());
    await page.waitForTimeout(50);
    const afterResubmit = await readAttempts(page, viewport.name, packageRecord.activityId);
    assert(afterResubmit.length === 1 && afterResubmit[0].outcome === 'lapse',
        `${viewport.name}: revealed resubmission produced mastery or duplicate evidence`, { afterResubmit });
    assert(await page.locator(`${activitySelector} [data-answer-key="after-attempt"]`).count() === 6,
        `${viewport.name}: revealed resubmission accumulated duplicate answers`);

    await openAcademy(page, viewport.name);
    await page.waitForSelector(introSelector);
    await pressFocused(page, `${introSelector} .academy-activity-chapter-next`);
    await pressFocused(page, `${introSelector} .academy-activity-chapter-next`);
    await page.waitForSelector(activitySelector);
    assert(await page.locator(`${activitySelector} [data-answer-key]`).count() === 0,
        `${viewport.name}: fresh attempt retained revealed answers`);
    const correctOptionNumbers = [1, 3, 3, 3, 3, 2];
    for (const [index, optionNumber] of correctOptionNumbers.entries()) {
        await page.locator(`${activitySelector} [data-question-id]`).nth(index)
            .locator('input[type="radio"]').nth(optionNumber - 1).check();
    }
    await pressFocused(page, `${activitySelector} button[type="submit"]`);
    await page.waitForSelector(`${activitySelector}[data-attempt-state="complete"][data-outcome="pass"]`);
    const afterFreshPass = await readAttempts(page, viewport.name, packageRecord.activityId);
    assert(afterFreshPass.length === 2
        && afterFreshPass[0].outcome === 'lapse'
        && afterFreshPass[1].outcome === 'pass',
    `${viewport.name}: fresh hidden-answer pass did not preserve lapse-to-mastery order`, { afterFreshPass });
    await auditSurface(page, viewport, activitySelector, 'fresh-pass');
    return { revealCount, revealedResubmitAttempts: afterResubmit.length, outcomes: afterFreshPass.map(attempt => attempt.outcome) };
}

async function openClass(page, run) {
    await setCheckpoint(page, run, 'class', {
        selectedBand: 'n3',
        lessonId: undefined,
        sectionId: undefined,
        activityId: undefined,
        placementOverride: undefined,
    });
    await page.waitForSelector('[data-academy-screen="class-path"]');
}

async function auditSurface(page, viewport, selector, name) {
    const layout = await page.locator(selector).evaluate(surface => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        surfaceWidth: surface.scrollWidth,
        surfaceClientWidth: surface.clientWidth,
        unnamedControls: [...surface.querySelectorAll('button, input, textarea, select, a[href]')]
            .filter(element => {
                const rect = element.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            })
            .filter(element => !(element.getAttribute('aria-label') || element.textContent?.trim() || element.getAttribute('name')))
            .length,
    }));
    assert(layout.documentWidth <= layout.viewportWidth + 2, `${viewport.name}/${name}: document overflow`, layout);
    assert(layout.surfaceWidth <= layout.surfaceClientWidth + 2, `${viewport.name}/${name}: surface overflow`, layout);
    assert(layout.unnamedControls === 0, `${viewport.name}/${name}: unnamed controls`, layout);
    const axe = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa']).analyze();
    const violationDetails = await Promise.all(axe.violations.map(async violation => ({
        id: violation.id,
        impact: violation.impact,
        nodes: await Promise.all(violation.nodes.slice(0, 3).map(async node => ({
            target: node.target,
            failureSummary: node.failureSummary,
            style: await page.locator(String(node.target[0])).first().evaluate(element => {
                const style = getComputedStyle(element);
                return { color: style.color, backgroundColor: style.backgroundColor, opacity: style.opacity };
            }),
        }))),
    })));
    assert(axe.violations.length === 0, `${viewport.name}/${name}: Axe violations`, {
        violations: violationDetails,
    });
}

async function pressFocused(page, selector) {
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible' });
    let focused = false;
    for (let attempt = 0; attempt < 3 && !focused; attempt++) {
        await target.focus();
        await page.waitForTimeout(20);
        focused = await target.evaluate(element => element === document.activeElement);
    }
    assert(focused, `Could not focus ${selector}`);
    await page.keyboard.press('Enter');
}

async function openAcademy(page, run) {
    await page.goto(`${server.origin}/academy/?qa-run=${run}&qa-auth=bypass`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#academy-screen > *', { timeout: 20_000 });
}

async function setCheckpoint(page, run, route, context) {
    await page.evaluate(() => window.__yomuAcademy?.dispose());
    await page.evaluate(async ({ databaseName, route, context }) => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction('meta', 'readwrite');
        const store = transaction.objectStore('meta');
        const existing = await new Promise((resolve, reject) => {
            const request = store.get('active-checkpoint');
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
        const checkpoint = {
            ...existing,
            ...context,
            schemaVersion: 2,
            route,
            routeHistory: [],
            presentationMode: existing?.presentationMode ?? 'course',
            updatedAt: Date.now(),
        };
        Object.keys(checkpoint).forEach(key => checkpoint[key] === undefined && delete checkpoint[key]);
        store.put({ id: 'active-checkpoint', value: checkpoint });
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        database.close();
    }, { databaseName: databaseName(run), route, context });
    await openAcademy(page, run);
}

async function readCheckpoint(page, run) {
    return page.evaluate(async databaseName => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const checkpoint = await new Promise((resolve, reject) => {
            const request = database.transaction('meta').objectStore('meta').get('active-checkpoint');
            request.onsuccess = () => resolve(request.result?.value ?? null);
            request.onerror = () => reject(request.error);
        });
        database.close();
        return checkpoint;
    }, databaseName(run));
}

async function readAttempts(page, run, activityId) {
    return page.evaluate(async ({ databaseName, activityId }) => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const events = await new Promise((resolve, reject) => {
            const request = database.transaction('learner-events').objectStore('learner-events').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        database.close();
        return events.filter(event => event.kind === 'attempt-recorded' && event.activityId === activityId)
            .sort((left, right) => left.at - right.at);
    }, { databaseName: databaseName(run), activityId });
}

function watchRuntime(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => message.type() === 'error' && errors.push(`console: ${message.text()}`));
    page.on('response', response => response.status() >= 400 && errors.push(`response ${response.status()}: ${response.url()}`));
    return errors;
}

function databaseName(run) {
    return `yomu-academy-qa-${run}`;
}

function serveAcademy(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('cache-control', 'no-store');
    if (url.pathname === '/academy/api/session') {
        const now = Date.now();
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
            sessionId: `n3-proof-${now}`,
            expiresAt: now + 28_800_000,
            offlineResumeUntil: now + 2_592_000_000,
        }));
        return;
    }
    if (url.pathname.startsWith('/academy/media/audio/')) {
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
    const publicFile = path.join(PUBLIC_ROOT, relative);
    const hostedFile = path.join(HOSTED_ROOT, relative);
    const file = override ?? (existsSync(publicFile) ? publicFile : hostedFile);
    const allowedRoot = override ? BUILD_ROOT : file === publicFile ? PUBLIC_ROOT : HOSTED_ROOT;
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
    if (file.endsWith('.json') || file.endsWith('.webmanifest')) return 'application/json; charset=utf-8';
    if (file.endsWith('.svg')) return 'image/svg+xml';
    if (file.endsWith('.png')) return 'image/png';
    if (file.endsWith('.webp')) return 'image/webp';
    if (file.endsWith('.mp3')) return 'audio/mpeg';
    return 'application/octet-stream';
}
