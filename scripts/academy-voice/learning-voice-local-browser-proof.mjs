#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    assert,
    launchSmokeBrowser,
    serveFile,
    startLoopbackServer,
} from '../lib/smoke-harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HOSTED_ROOT = path.join(ROOT, 'docs', 'public');
const DIST_APP_PATH = path.join(ROOT, 'dist', 'academy', 'app.js');
const HOSTED_APP_PATH = path.join(HOSTED_ROOT, 'academy', 'app.js');
const CATALOG_PATH = path.join(ROOT, 'public', 'academy', 'audio', 'learning-voice-playback.json');
const PRODUCTION_PATH = path.join(ROOT, 'docs', 'academy', 'audio', 'learning-voice-production.json');
const EXPECTED_PATH = path.join(ROOT, 'docs', 'academy', 'audio', 'learning-voice-local-expected.json');
const OBSERVED_PATH = path.resolve(process.env.LEARNING_VOICE_LOCAL_OBSERVED
    ?? path.join(ROOT, 'qa-artifacts', 'academy-learning-voice', 'local-browser-observed.json'));
const RUNTIME_SOURCE_PATHS = [
    'src/academy/integration/yomu-bridge.ts',
    'src/academy/audio/browser-speech.ts',
    'src/academy/audio/learning-voice.ts',
    'src/academy/audio/worker-tts.ts',
    'src/academy/routing/world-flow.ts',
    'src/academy/ui/cafe-world.ts',
    'src/academy/ui/lesson-screen.ts',
    'src/academy/ui/world-screen.ts',
];
const RUN = `learning-voice-${Date.now()}`;
const scenarios = [
    {
        name: 'cafe price',
        bindingId: 'world-practice:cafe-coffee-price',
        route: 'world',
        context: { lessonId: 'lesson:foundation-00', worldPlace: 'cafe', worldVisits: { cafe: 0 } },
        selector: '.academy-cafe-order-listen',
        ready: '[data-world-practice="cafe-coffee-price"]',
        asset: '/academy/audio/learning-lines/textbook-miller/miller-cafe-price__28b3358c342c6ef9.opus',
        success: '[data-world-practice="cafe-coffee-price"][data-cafe-order-state="choosing"]',
    },
];
const catalogSource = readFileSync(CATALOG_PATH);
const productionSource = readFileSync(PRODUCTION_PATH);
const catalog = JSON.parse(catalogSource);
const catalogByBinding = new Map(catalog.entries.flatMap(entry => (
    entry.bindings.map(binding => [binding.lineId, entry])
)));
for (const scenario of scenarios) {
    assert(catalogByBinding.get(scenario.bindingId)?.url === scenario.asset,
        `Local proof scenario is stale for ${scenario.bindingId}`);
}
assert(catalogByBinding.size === scenarios.length,
    'Local proof does not cover every accepted runtime binding', {
        catalogBindings: [...catalogByBinding.keys()],
        scenarioBindings: scenarios.map(scenario => scenario.bindingId),
    });

const expectedSource = readFileSync(EXPECTED_PATH);
const expected = JSON.parse(expectedSource);
assert(expected.schema === 'yomu-academy.learning-voice-local-expected.v1', 'Local expected evidence schema is stale');
assert(expected.batchId === catalog.batchId, 'Local expected evidence batch is stale');
assert(expected.catalogSha256 === sha256(catalogSource), 'Local expected catalog hash is stale');
assert(expected.productionContractSha256 === sha256(productionSource), 'Local expected production hash is stale');
const distApp = readFileSync(DIST_APP_PATH);
const hostedApp = readFileSync(HOSTED_APP_PATH);
assert(distApp.equals(hostedApp), 'Built dist and hosted Academy app bytes differ');
assert(sha256(distApp) === expected.build.appSha256, 'Built Academy app differs from immutable local expectation');
for (const sourcePath of RUNTIME_SOURCE_PATHS) {
    assert(sha256(readFileSync(path.join(ROOT, sourcePath))) === expected.runtimeSources[sourcePath],
        `Runtime source differs from immutable local expectation: ${sourcePath}`);
}

const requests = [];
const server = await startLoopbackServer(serveAcademy, 'Academy learning voice local proof server could not bind');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
let context;
let evidence;
try {
    context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: 'en-GB',
        serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') {
            const source = message.location().url;
            errors.push(`console: ${message.text()}${source ? ` (${source})` : ''}`);
        }
    });
    page.on('request', request => requests.push(request.url()));
    page.on('response', response => {
        if (response.status() >= 400) errors.push(`response: ${response.status()} ${response.url()}`);
    });
    await page.addInitScript(() => {
        localStorage.setItem('yomu:academy:audio:v1', JSON.stringify({
            muted: false,
            volumes: { music: 0.7, ambience: 0.65, lesson: 1, sfx: 0.8 },
        }));
        localStorage.setItem('yomu:academy:profile-sync:v1', JSON.stringify({
            profile: {
                profileId: '11111111-1111-4111-8111-111111111111',
                deviceId: '22222222-2222-4222-8222-222222222222',
                accountId: '33333333-3333-4333-8333-333333333333',
                keyVersion: 1,
                createdAt: 1,
            },
            key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            cursor: 0,
            envelopes: {},
            eventSyncIds: {},
            lastSyncAt: null,
        }));
    });
    await enroll(page);

    const results = [];
    for (const scenario of scenarios) {
        await setCheckpoint(page, scenario.route, scenario.context);
        await dismissArrival(page);
        await page.locator(scenario.ready).waitFor({ state: 'visible' });
        const assetResponse = page.waitForResponse(response => (
            new URL(response.url()).pathname === scenario.asset && response.status() === 200
        ), { timeout: 10_000 });
        await page.locator(scenario.selector).click();
        const response = await assetResponse;
        const body = await response.body();
        const contentSha256 = sha256(body);
        assert(contentSha256 === expected.assets[scenario.asset]?.sha256,
            `Local response bytes differ from immutable expectation: ${scenario.asset}`);
        await page.locator(scenario.success).waitFor({ state: 'visible' });
        results.push({
            name: scenario.name,
            bindingId: scenario.bindingId,
            bindingSurface: scenario.ready,
            asset: scenario.asset,
            status: response.status(),
            contentType: response.headers()['content-type'],
            bytes: body.length,
            contentSha256,
        });
    }

    const sourceModuleRequests = requests.filter(url => /\/src\//u.test(new URL(url).pathname));
    const workerFallbackRequests = requests.filter(url => url.startsWith('https://audio.yomureader.com/audio/tts'));
    const syncFixtureRequests = requests
        .map(requestUrl => new URL(requestUrl))
        .filter(requestUrl => requestUrl.pathname.startsWith('/academy/api/srs/'))
        .map(requestUrl => `${requestUrl.pathname}${requestUrl.search}`);
    assert(sourceModuleRequests.length === 0, 'Local proof loaded source modules instead of the built Academy route', { sourceModuleRequests });
    assert(workerFallbackRequests.length === 0, 'Local static voice proof fell through to worker TTS', { workerFallbackRequests });
    assert(syncFixtureRequests.some(requestUrl => requestUrl === '/academy/api/srs/push'),
        'Linked-account proof did not exercise its isolated SRS push fixture', { syncFixtureRequests });
    assert(syncFixtureRequests.some(requestUrl => requestUrl.startsWith('/academy/api/srs/pull?')),
        'Linked-account proof did not exercise its isolated SRS pull fixture', { syncFixtureRequests });
    assert(errors.length === 0, 'Academy learning voice local proof saw browser errors', { errors });
    evidence = {
        schema: 'yomu-academy.learning-voice-local-observed.v1',
        observedAt: new Date().toISOString(),
        batchId: catalog.batchId,
        immutableExpectedEvidence: path.relative(ROOT, EXPECTED_PATH),
        immutableExpectedEvidenceSha256: sha256(expectedSource),
        catalogSha256: sha256(catalogSource),
        productionContractSha256: sha256(productionSource),
        route: '/academy/?qa-run=<isolated>',
        proofScope: 'loopback-hosted Academy route; no deployment or production claim',
        authFixture: 'persisted-linked-account-and-valid-worker-session',
        syncFixture: 'isolated-accept-push-empty-pull',
        builtArtifacts: {
            distApp: path.relative(ROOT, DIST_APP_PATH),
            hostedApp: path.relative(ROOT, HOSTED_APP_PATH),
            distAppSha256: sha256(distApp),
            hostedAppSha256: sha256(hostedApp),
            byteParity: true,
        },
        sourceModuleRequests,
        workerFallbackRequests,
        syncFixtureRequests,
        results,
        verdict: 'pass',
    };
    mkdirSync(path.dirname(OBSERVED_PATH), { recursive: true });
    writeFileSync(OBSERVED_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence, null, 2));
} finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await server.close();
}

async function enroll(page) {
    await openAcademy(page);
    const now = Date.now();
    await setCheckpoint(page, 'profile', {
        session: {
            sessionId: `learning-voice-${now}`,
            expiresAt: now + 28_800_000,
            offlineResumeUntil: now + 2_592_000_000,
            accountRequired: true,
            source: 'cloudflare',
        },
    });
    await page.locator('input[name="displayName"]').fill('Audio Gate');
    await page.locator('.academy-profile-advance').click();
    await page.locator('textarea[name="learningReason"]').fill('Verify stable Academy audio.');
    await page.locator('.academy-profile-advance').click();
    await page.locator('input[name="portrait"][value="quality-2"]').check();
    await page.locator('.academy-profile-advance').click();
    await page.locator('.academy-rie-unlock-screen button').click();
    await page.locator('[data-start-route="lesson-zero"]').click();
    await page.locator('[data-academy-route="campus"]').waitFor();
}

async function openAcademy(page) {
    await page.goto(`${server.origin}/academy/?qa-run=${RUN}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#academy-screen > :not(.academy-loading-screen)', { timeout: 20_000 });
}

async function setCheckpoint(page, route, checkpointContext) {
    await page.evaluate(() => window.__yomuAcademy?.dispose());
    await page.evaluate(async ({ databaseName, route, checkpointContext }) => {
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
        store.put({
            id: 'active-checkpoint',
            value: {
                ...existing,
                ...checkpointContext,
                schemaVersion: 2,
                route,
                routeHistory: [],
                presentationMode: existing?.presentationMode ?? 'story',
                updatedAt: Date.now(),
            },
        });
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        database.close();
    }, { databaseName: `yomu-academy-qa-${RUN}`, route, checkpointContext });
    await openAcademy(page);
}

async function dismissArrival(page) {
    const continueButton = page.locator('.academy-world-arrival-continue');
    if (await continueButton.isVisible().catch(() => false)) await continueButton.click();
}

async function serveAcademy(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('cache-control', 'no-store');
    if (url.pathname === '/academy/api/session') {
        const now = Date.now();
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
            sessionId: `learning-voice-${now}`,
            expiresAt: now + 28_800_000,
            offlineResumeUntil: now + 2_592_000_000,
            accountRequired: false,
        }));
        return;
    }
    if (url.pathname === '/academy/api/account' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
            accountId: '33333333-3333-4333-8333-333333333333',
            displayName: 'Audio Gate',
            displayTag: 'Audio Gate#000001',
            nameChosen: true,
            avatarKey: null,
            boardVisible: false,
            shareAvatar: false,
            academyAccess: true,
            classes: [],
        }));
        return;
    }
    if (url.pathname === '/academy/api/entitlement' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ entitlement: 'academy', status: 'active', redeemedAt: 1 }));
        return;
    }
    if (url.pathname === '/academy/api/profile' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
            profileId: '11111111-1111-4111-8111-111111111111',
            deviceId: '22222222-2222-4222-8222-222222222222',
            accountId: '33333333-3333-4333-8333-333333333333',
            keyVersion: 1,
            createdAt: 1,
        }));
        return;
    }
    if (url.pathname === '/academy/api/profile/key' && request.method === 'POST') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ initialized: true }));
        return;
    }
    if (url.pathname === '/academy/api/srs/push' && request.method === 'POST') {
        const body = JSON.parse(await readRequestBody(request));
        const events = Array.isArray(body.events) ? body.events : [];
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
            accepted: events.length,
            inserted: events.length,
            duplicates: 0,
            conflicts: [],
        }));
        return;
    }
    if (url.pathname === '/academy/api/srs/pull' && request.method === 'GET') {
        const cursor = Number(url.searchParams.get('cursor') ?? 0);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ events: [], nextCursor: cursor, hasMore: false }));
        return;
    }
    if (url.pathname.startsWith('/academy/media/audio/')) {
        response.writeHead(204);
        response.end();
        return;
    }
    const relative = url.pathname === '/academy/' || url.pathname === '/academy'
        ? 'academy/index.html'
        : url.pathname.replace(/^\/+/, '');
    const hostedFile = path.join(HOSTED_ROOT, relative);
    if (!existsSync(hostedFile)
        || statSync(hostedFile).isDirectory()
        || !hostedFile.startsWith(`${HOSTED_ROOT}${path.sep}`)) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    serveFile(response, hostedFile, contentType(hostedFile), request.method);
}

function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.setEncoding('utf8');
        request.on('data', chunk => {
            body += chunk;
            if (body.length > 1_000_000) {
                reject(new Error('Academy sync fixture request is too large.'));
                request.destroy();
            }
        });
        request.on('end', () => resolve(body));
        request.on('error', reject);
    });
}

function contentType(file) {
    if (file.endsWith('.html')) return 'text/html; charset=utf-8';
    if (file.endsWith('.css')) return 'text/css; charset=utf-8';
    if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (file.endsWith('.json')) return 'application/json; charset=utf-8';
    if (file.endsWith('.opus')) return 'audio/ogg; codecs=opus';
    if (file.endsWith('.svg')) return 'image/svg+xml';
    if (file.endsWith('.png')) return 'image/png';
    if (file.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}
