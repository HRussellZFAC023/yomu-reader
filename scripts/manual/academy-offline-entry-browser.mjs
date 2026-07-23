import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const publicRoot = path.resolve('docs/public');
const artifactDir = path.resolve(process.env.OFFLINE_ENTRY_SCREENSHOTS ?? 'qa-artifacts/offline-entry');
const viewports = [
    { name: 'phone', width: 390, height: 844 },
    { name: 'portrait-tablet', width: 1024, height: 1366 },
    { name: 'desktop', width: 1440, height: 900 },
];
const PROFILE_ID = '80f9898f-665b-4e22-854e-5fb4ea78c726';
const DEVICE_ID = 'f43a4a71-f12a-4d1f-9ed0-7abc42722fd3';
const ACCOUNT_ID = '7da48557-cb99-4e72-aa31-fe0724f6f22d';
const READER_DEVICE_ID = 'afad9fe0-94f5-4e66-8eb9-b0ed2ea8f113';

await assertProductionBuild();
await mkdir(artifactDir, { recursive: true });
const server = await startStaticServer();
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'en-GB', reducedMotion: 'reduce' });
let activeCase = null;

await context.addInitScript(() => {
    localStorage.setItem('yomu:academy:audio:v1', JSON.stringify({
        muted: true,
        volumes: { music: 0, ambience: 0, lesson: 0, sfx: 0 },
    }));
});
await context.route('**/academy/media/**', route => route.fulfill({ status: 503 }));
await context.route('**/academy/api/**', route => {
    if (!activeCase) return route.abort('blockedbyclient');
    return handleApi(route, activeCase, baseUrl);
});

try {
    for (const viewport of viewports) {
        activeCase = stateFor(viewport.name);
        await verifyOfflineJourney(context, viewport, activeCase, baseUrl);
    }
    console.log('Academy offline entry passed through the production service worker on phone, portrait tablet, and desktop.');
} finally {
    await context.setOffline(false).catch(() => undefined);
    await context.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}

async function verifyOfflineJourney(context, viewport, state, baseUrl) {
    const page = await context.newPage();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const errors = [];
    const unexpectedResponses = [];
    page.on('dialog', dialog => void dialog.accept());
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const location = message.location().url;
        const pathname = location ? new URL(location).pathname : '';
        if (pathname.startsWith('/academy/media/')) return;
        if (pathname === '/academy/api/profile' && message.text().includes('401')) return;
        errors.push(`console: ${message.text()}${location ? ` @ ${location}` : ''}`);
    });
    page.on('response', response => {
        if (response.status() < 400) return;
        const pathname = new URL(response.url()).pathname;
        if (pathname === '/academy/api/profile' && response.status() === 401) return;
        if (pathname.startsWith('/academy/media/') && response.status() === 503) return;
        unexpectedResponses.push(`${response.request().method()} ${pathname}:${response.status()}`);
    });

    const runId = `offline-${viewport.name}-${Date.now()}`;
    state.runId = runId;
    const entryUrl = `${baseUrl}/academy/?qa-run=${runId}`;
    const response = await page.goto(entryUrl, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `${viewport.name} production shell did not load`);
    await page.locator('.academy-access-screen').waitFor();
    await ensureServiceWorkerControl(page);

    await page.locator('input[name="code"]').fill('offline-day-one');
    await page.getByRole('button', { name: 'Open the doors' }).click();
    const signIn = page.locator('.academy-profile-sync-screen[data-sync-phase="sign-in"]');
    await signIn.waitFor();
    await signIn.getByRole('button', { name: 'Sign in with Google' }).click();
    await page.locator('.academy-profile-screen').waitFor();

    await page.goto(`${entryUrl}&view=profile-sync`, { waitUntil: 'domcontentloaded' });
    const pair = page.locator('.academy-profile-sync-screen[data-sync-phase="pair"]');
    await pair.waitFor();
    await pair.getByRole('button', { name: 'Start as first device' }).click();
    const ready = page.locator('.academy-profile-sync-screen[data-sync-phase="ready"]');
    try {
        await ready.waitFor();
    } catch (error) {
        const rendered = await page.evaluate(() => ({
            phase: document.querySelector('.academy-profile-sync-screen')?.getAttribute('data-sync-phase'),
            text: document.querySelector('.academy-profile-sync-screen')?.textContent?.trim().slice(0, 900),
            checkpoint: window.__yomuAcademy?.checkpoint ?? null,
            sync: localStorage.getItem('yomu:academy:profile-sync:v1'),
        }));
        throw new Error(`${viewport.name} did not finish first-device setup: ${JSON.stringify({
            rendered,
            apiCalls: state.apiCalls,
            unexpectedApi: state.unexpectedApi,
            errors,
            unexpectedResponses,
        })}`, { cause: error });
    }
    await ready.getByRole('button', { name: 'Continue to Academy' }).click();
    const profile = page.locator('.academy-profile-screen');
    await profile.waitFor();

    const apiCallsBeforeOffline = state.apiCalls.length;
    await context.setOffline(true);
    const notice = page.locator('.academy-offline-notice');
    await notice.waitFor({ state: 'visible' });
    await notice.getByText('Offline', { exact: true }).waitFor();
    await notice.getByText('Keep learning here. Your progress will sync when you reconnect.', { exact: true }).waitFor();

    await profile.locator('input[name="displayName"]').fill('Mina');
    await profile.locator('.academy-profile-advance').click();
    await profile.locator('textarea[name="learningReason"]').fill('To read manga without a translation');
    await profile.locator('.academy-profile-advance').click();
    await profile.locator('.academy-profile-advance').click();
    const rie = page.locator('.academy-rie-unlock-screen');
    await rie.waitFor();
    await page.waitForFunction(() => {
        const value = localStorage.getItem('yomu:academy:profile-sync:v1');
        if (!value) return false;
        return Object.keys(JSON.parse(value).envelopes ?? {}).length > 0;
    });

    const queuedBeforeReload = await readQueuedSyncState(page);
    const eventCountBeforeReload = await academyEventCount(page, `yomu-academy-qa-${runId}`);
    assert.ok(queuedBeforeReload.pending > 0, `${viewport.name} must encrypt offline learner evidence`);
    assert.ok(eventCountBeforeReload > 0, `${viewport.name} must commit learner evidence locally first`);
    assert.equal(queuedBeforeReload.raw.includes('To read manga without a translation'), false,
        `${viewport.name} sync storage must not expose the learner note`);
    await assertResponsiveSurface(page, viewport, 'offline-before-reload');
    await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-offline-before-reload.png`) });

    const offlineResponse = await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(offlineResponse?.ok(), true, `${viewport.name} offline reload must return the cached shell`);
    assert.equal(offlineResponse?.fromServiceWorker(), true,
        `${viewport.name} offline reload must be served by the Academy service worker`);
    await rie.waitFor();
    await notice.waitFor({ state: 'visible' });
    const restored = await page.evaluate(() => ({
        route: window.__yomuAcademy?.checkpoint?.route,
        profile: window.__yomuAcademy?.checkpoint?.route === 'rie-unlock',
        controlled: Boolean(navigator.serviceWorker.controller),
        online: navigator.onLine,
    }));
    assert.deepEqual(restored, { route: 'rie-unlock', profile: true, controlled: true, online: false },
        `${viewport.name} must restore the downloaded welcome at its exact checkpoint`);
    const queuedAfterReload = await readQueuedSyncState(page);
    const eventCountAfterReload = await academyEventCount(page, `yomu-academy-qa-${runId}`);
    assert.equal(queuedAfterReload.pending, queuedBeforeReload.pending,
        `${viewport.name} encrypted queue must survive a cold offline restart`);
    assert.equal(eventCountAfterReload, eventCountBeforeReload,
        `${viewport.name} local evidence must survive a cold offline restart`);
    assert.equal(state.apiCalls.length, apiCallsBeforeOffline,
        `${viewport.name} offline boot must not attempt a network-only account action`);
    await assertResponsiveSurface(page, viewport, 'offline-restored');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-offline-restored.png`) });

    await context.setOffline(false);
    await notice.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => {
        const value = localStorage.getItem('yomu:academy:profile-sync:v1');
        return value && Object.keys(JSON.parse(value).envelopes ?? {}).length === 0;
    });
    assert.equal(state.pushes.length, 1, `${viewport.name} reconnect must flush one encrypted batch`);
    assert.equal(state.pushes[0], queuedBeforeReload.pending,
        `${viewport.name} reconnect must flush every queued envelope exactly once`);
    assert.equal(state.sessionExchanges, 1, `${viewport.name} offline resume must not spend another invitation`);
    assert.deepEqual(state.unexpectedApi, [], `${viewport.name} made unmodelled API requests`);
    assert.deepEqual({ errors, unexpectedResponses }, { errors: [], unexpectedResponses: [] },
        `${viewport.name} browser console and response surface must stay clean`);

    await page.evaluate(() => {
        localStorage.removeItem('yomu:academy:profile-sync:v1');
    });
    await page.close();
}

async function ensureServiceWorkerControl(page) {
    await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        if (registration.active && !navigator.serviceWorker.controller) {
            await new Promise(resolve => {
                const timeout = setTimeout(resolve, 5_000);
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    clearTimeout(timeout);
                    resolve();
                }, { once: true });
            });
        }
    });
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
        await page.reload({ waitUntil: 'domcontentloaded' });
    }
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

async function readQueuedSyncState(page) {
    return page.evaluate(() => {
        const raw = localStorage.getItem('yomu:academy:profile-sync:v1') ?? '';
        const parsed = JSON.parse(raw);
        return { raw, pending: Object.keys(parsed.envelopes ?? {}).length };
    });
}

async function academyEventCount(page, databaseName) {
    return page.evaluate(async name => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise((resolve, reject) => {
                const request = database.transaction('learner-events').objectStore('learner-events').count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } finally {
            database.close();
        }
    }, databaseName);
}

async function assertResponsiveSurface(page, viewport, phase) {
    const geometry = await page.evaluate(() => {
        const rect = node => {
            const bounds = node?.getBoundingClientRect();
            return bounds ? {
                left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
                width: bounds.width, height: bounds.height,
            } : null;
        };
        const controls = [...document.querySelectorAll('button, a[href], input, textarea')]
            .filter(node => node.getClientRects().length > 0)
            .map(rect);
        return {
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth,
            notice: rect(document.querySelector('.academy-offline-notice')),
            utility: rect(document.querySelector('.academy-utility-toggle')),
            controls,
        };
    });
    assert.ok(geometry.documentWidth <= viewport.width,
        `${viewport.name} ${phase} must not overflow horizontally (${geometry.documentWidth}/${viewport.width})`);
    assert.ok(geometry.notice && geometry.notice.left >= -1 && geometry.notice.right <= geometry.viewportWidth + 1,
        `${viewport.name} ${phase} offline ribbon must fit: ${JSON.stringify(geometry.notice)}`);
    if (geometry.utility) assert.equal(overlaps(geometry.notice, geometry.utility), false,
        `${viewport.name} ${phase} offline ribbon must not cover Menu`);
    for (const [index, control] of geometry.controls.entries()) {
        assert.ok(control.left >= -1 && control.right <= geometry.viewportWidth + 1,
            `${viewport.name} ${phase} control ${index + 1} must fit: ${JSON.stringify(control)}`);
        assert.ok(control.width >= 44 && control.height >= 44,
            `${viewport.name} ${phase} control ${index + 1} must be a 44px target: ${JSON.stringify(control)}`);
    }
}

async function assertAccessible(page) {
    const axe = await new AxeBuilder({ page }).include('#yomu-academy').analyze();
    const blocking = axe.violations.filter(violation =>
        violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
    })), [], 'Offline restored Academy must have no serious or critical Axe violations');
}

function overlaps(left, right) {
    return Math.min(left.right, right.right) - Math.max(left.left, right.left) > 1
        && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 1;
}

function stateFor(name) {
    return {
        name,
        runId: '',
        linked: false,
        sessionExchanges: 0,
        keyCommitment: '',
        pushes: [],
        apiCalls: [],
        unexpectedApi: [],
    };
}

async function handleApi(route, state, baseUrl) {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    state.apiCalls.push(`${method} ${pathname}`);
    if (pathname === '/academy/api/session' && method === 'POST') {
        const body = JSON.parse(request.postData() ?? '{}');
        assert.equal(body.code, 'OFFLINE-DAY-ONE');
        state.sessionExchanges += 1;
        const now = Date.now();
        return json(route, 200, {
            sessionId: `offline-session-${state.name}`,
            expiresAt: now + 8 * 60 * 60 * 1_000,
            offlineResumeUntil: now + 30 * 24 * 60 * 60 * 1_000,
            accountRequired: true,
        });
    }
    if (pathname === '/academy/api/session' && method === 'GET') return json(route, 200, { active: true });
    if (pathname === '/academy/api/profile' && method === 'GET') {
        return state.linked ? json(route, 200, profile()) : json(route, 401, { error: 'Sign in required.' });
    }
    if (pathname === '/academy/api/auth/google/start' && method === 'GET') {
        state.linked = true;
        return route.fulfill({
            status: 302,
            headers: { location: `${baseUrl}/academy/?qa-run=${state.runId}&account=linked`, 'cache-control': 'no-store' },
        });
    }
    if (pathname === '/academy/api/account' && method === 'GET') return json(route, 200, account());
    if (pathname === '/academy/api/entitlement' && method === 'GET') {
        return json(route, 200, { entitlement: 'academy', status: 'active', redeemedAt: 1_784_700_000_000 });
    }
    if (pathname === '/academy/api/profile/key' && method === 'POST') {
        const body = JSON.parse(request.postData() ?? '{}');
        state.keyCommitment ||= body.keyCommitment;
        assert.equal(body.keyCommitment, state.keyCommitment);
        return json(route, 200, { initialized: true });
    }
    if (pathname === '/academy/api/srs/pull' && method === 'GET') {
        return json(route, 200, { events: [], nextCursor: 0, hasMore: false });
    }
    if (pathname === '/academy/api/srs/push' && method === 'POST') {
        const events = JSON.parse(request.postData() ?? '{}').events ?? [];
        state.pushes.push(events.length);
        return json(route, 200, { accepted: events.length, inserted: events.length, duplicates: 0, conflicts: [] });
    }
    if (pathname === '/academy/api/account/devices' && method === 'GET') {
        return json(route, 200, {
            devices: [{
                deviceId: READER_DEVICE_ID,
                createdAt: 1_784_700_000_000,
                lastSeenAt: 1_784_700_060_000,
                revokedAt: null,
            }],
        });
    }
    state.unexpectedApi.push(`${method} ${pathname}${url.search}`);
    return json(route, 404, { error: `Unhandled ${method} ${pathname}` });
}

function profile() {
    return { profileId: PROFILE_ID, deviceId: DEVICE_ID, accountId: ACCOUNT_ID, keyVersion: 1, createdAt: 1_784_700_000_000 };
}

function account() {
    return {
        accountId: ACCOUNT_ID,
        displayName: 'Henry',
        displayTag: 'Henry#419213',
        nameChosen: true,
        avatarKey: null,
        boardVisible: false,
        shareAvatar: false,
        academyAccess: true,
        classes: [],
    };
}

async function json(route, status, body) {
    await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
        headers: { 'cache-control': 'no-store' },
    });
}

async function assertProductionBuild() {
    const index = await readFile(path.join(publicRoot, 'academy/index.html'), 'utf8');
    assert.equal(index.includes('__ACADEMY_REVISION__'), false,
        'Build the Academy production shell before running the offline browser proof.');
}

async function startStaticServer() {
    const server = createServer(async (request, response) => {
        try {
            const url = new URL(request.url ?? '/', 'http://127.0.0.1');
            let pathname = decodeURIComponent(url.pathname);
            if (request.method === 'GET' && pathname === '/academy/api/session') {
                const body = JSON.stringify({ active: true });
                response.writeHead(200, {
                    'content-type': 'application/json',
                    'content-length': String(Buffer.byteLength(body)),
                    'cache-control': 'no-store',
                });
                response.end(body);
                return;
            }
            if (pathname.startsWith('/academy/media/')) {
                response.writeHead(503, { 'cache-control': 'no-store' });
                response.end();
                return;
            }
            if (pathname.endsWith('/')) pathname += 'index.html';
            const file = path.resolve(publicRoot, `.${pathname}`);
            if (file !== publicRoot && !file.startsWith(`${publicRoot}${path.sep}`)) {
                response.writeHead(403).end('Forbidden');
                return;
            }
            const info = await stat(file);
            if (!info.isFile()) throw new Error('Not a file');
            const body = await readFile(file);
            response.writeHead(200, {
                'content-type': contentType(file),
                'content-length': String(body.byteLength),
                'cache-control': 'no-cache',
                ...(pathname === '/academy/sw.js' ? { 'service-worker-allowed': '/academy/' } : {}),
            });
            response.end(body);
        } catch {
            response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            response.end('Not found');
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return server;
}

function contentType(file) {
    const extension = path.extname(file).toLowerCase();
    return ({
        '.css': 'text/css; charset=utf-8',
        '.flac': 'audio/flac',
        '.html': 'text/html; charset=utf-8',
        '.ico': 'image/x-icon',
        '.jpeg': 'image/jpeg',
        '.jpg': 'image/jpeg',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.m4a': 'audio/mp4',
        '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg',
        '.opus': 'audio/ogg; codecs=opus',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.webm': 'video/webm',
        '.webmanifest': 'application/manifest+json',
        '.webp': 'image/webp',
    })[extension] ?? 'application/octet-stream';
}
