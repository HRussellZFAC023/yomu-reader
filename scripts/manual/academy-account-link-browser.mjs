import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.ACCOUNT_LINK_SCREENSHOTS ?? 'qa-artifacts/account-link');
const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const READER_DEVICE_ID = '44444444-4444-4444-8444-444444444444';
const PAIRING_ID = '55555555-5555-4555-8555-555555555555';
const PAIRING_CODE = '2345-6789-ABCD-EFGH-JKMN';
const cases = [
    { name: 'phone', width: 390, height: 844 },
    { name: 'portrait-tablet', width: 1024, height: 1366 },
    { name: 'desktop', width: 1440, height: 900 },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const testCase of cases) await verifyAccountLifecycle(testCase);
    console.log('Academy account link/resume lifecycle passed on phone, portrait tablet, and desktop.');
} finally {
    await browser.close();
}

async function verifyAccountLifecycle(testCase) {
    const context = await browser.newContext({
        viewport: { width: testCase.width, height: testCase.height },
        locale: 'en-GB',
        reducedMotion: 'reduce',
        acceptDownloads: true,
    });
    await context.addInitScript(() => {
        Object.defineProperty(window, 'showSaveFilePicker', {
            value: undefined,
            configurable: true,
        });
    });
    const runId = `account-${testCase.name}-${Date.now()}`;
    const returnUrl = `${baseUrl}/academy/?qa-run=${runId}&account=linked`;
    const state = {
        sessionActive: false,
        linked: false,
        recoveryStarted: false,
        deleted: false,
        keyCommitment: null,
        authStarts: 0,
        sessionExchanges: 0,
        exports: 0,
        logouts: 0,
        pairingCreates: 0,
        pairingUploads: 0,
        accountDeletes: [],
        unexpectedApi: [],
    };

    await context.route('**/academy/media/audio/**', async route => {
        await route.fulfill({ status: 204, headers: { 'cache-control': 'no-store' } });
    });
    await context.route('**/academy/api/**', route => handleApi(route, state, returnUrl));

    const page = await context.newPage();
    const errors = [];
    const unexpectedResponses = [];
    page.on('dialog', dialog => void dialog.accept());
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const location = message.location().url;
        if (expectedAccountFailure(location)) return;
        errors.push(`console: ${message.text()}${location ? ` @ ${location}` : ''}`);
    });
    page.on('response', response => {
        if (response.status() < 400) return;
        const pathname = new URL(response.url()).pathname;
        if (pathname === '/academy/api/profile' && response.status() === 401) return;
        unexpectedResponses.push(`${response.request().method()} ${pathname}:${response.status()}`);
    });

    const response = await page.goto(`${baseUrl}/academy/?qa-run=${runId}`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
    await page.locator('.academy-access-screen').waitFor();
    await page.locator('input[name="code"]').fill('account-day-one');
    await page.getByRole('button', { name: 'Open the doors' }).click();

    const signIn = page.locator('.academy-profile-sync-screen[data-sync-phase="sign-in"]');
    await signIn.waitFor();
    await assertScreen(page, testCase, 'sign-in');
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-sign-in.png`) });

    await signIn.getByRole('button', { name: 'Sign in with Google' }).click();
    await page.locator('.academy-profile-screen').waitFor();
    await page.goto(`${baseUrl}/academy/?qa-run=${runId}&view=profile-sync`, { waitUntil: 'domcontentloaded' });
    const pair = page.locator('.academy-profile-sync-screen[data-sync-phase="pair"]');
    try {
        await pair.waitFor({ timeout: 12_000 });
    } catch (error) {
        const rendered = await page.evaluate(() => ({
            href: location.href,
            phase: document.querySelector('.academy-profile-sync-screen')?.getAttribute('data-sync-phase'),
            text: document.querySelector('.academy-profile-sync-screen')?.textContent?.trim().slice(0, 700),
            checkpoint: window.__yomuAcademy?.checkpoint ?? null,
            sync: localStorage.getItem('yomu:academy:profile-sync:v1'),
        }));
        throw new Error(`${testCase.name} did not reach first-device setup: ${JSON.stringify({
            rendered, state, errors, unexpectedResponses,
        })}`, { cause: error });
    }
    assert.equal(state.authStarts, 1, `${testCase.name} must begin Google linking once`);
    await assertScreen(page, testCase, 'first-device');
    await pair.getByRole('button', { name: 'Start as first device' }).click();

    let ready = page.locator('.academy-profile-sync-screen[data-sync-phase="ready"]');
    await ready.waitFor();
    await ready.getByText('1 connected Reader device(s).', { exact: true }).waitFor();
    await ready.getByRole('button', { name: 'Continue to Academy' }).waitFor();
    await assertScreen(page, testCase, 'linked');
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-linked.png`) });

    const storedBeforeRefresh = await page.evaluate(() => localStorage.getItem('yomu:academy:profile-sync:v1'));
    assert.ok(storedBeforeRefresh?.includes(PROFILE_ID), `${testCase.name} must persist its encrypted profile`);
    assert.ok(storedBeforeRefresh?.includes(ACCOUNT_ID), `${testCase.name} must persist its linked account projection`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    ready = page.locator('.academy-profile-sync-screen[data-sync-phase="ready"]');
    await ready.waitFor();
    await ready.getByText('1 connected Reader device(s).', { exact: true }).waitFor();
    assert.equal(state.sessionExchanges, 1, `${testCase.name} refresh must not spend another invitation`);
    await assertScreen(page, testCase, 'refresh');

    await ready.getByRole('button', { name: 'Pair another device' }).click();
    await ready.getByText(PAIRING_CODE, { exact: true }).waitFor();
    assert.deepEqual([state.pairingCreates, state.pairingUploads], [1, 1],
        `${testCase.name} must create and encrypt one pairing handoff`);
    await scrollPanelToEnd(ready);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-devices-and-pairing.png`) });

    const downloadPromise = page.waitForEvent('download', { timeout: 12_000 });
    await ready.getByRole('button', { name: 'Export encrypted data' }).click();
    let download;
    try {
        download = await downloadPromise;
    } catch (error) {
        const rendered = await page.evaluate(() => ({
            phase: document.querySelector('.academy-profile-sync-screen')?.getAttribute('data-sync-phase'),
            text: document.querySelector('.academy-profile-sync-screen')?.textContent?.trim().slice(0, 900),
        }));
        throw new Error(`${testCase.name} did not produce an encrypted export download: ${JSON.stringify({
            rendered, state, errors, unexpectedResponses,
        })}`, { cause: error });
    }
    const exportPath = path.join(artifactDir, `${testCase.name}-encrypted-export.json`);
    await download.saveAs(exportPath);
    const exported = JSON.parse(await readFile(exportPath, 'utf8'));
    assert.equal(exported.schemaVersion, 2, `${testCase.name} export must retain its schema`);
    assert.deepEqual(exported.eventPage.events, [], `${testCase.name} export must include the Academy event stream`);
    assert.deepEqual(exported.readerSrsEventPage.events, [], `${testCase.name} export must include the Reader SRS stream`);
    assert.equal(state.exports, 1, `${testCase.name} must request one complete export`);

    await ready.getByRole('button', { name: 'Sign out' }).click();
    const signedOut = page.locator('.academy-profile-sync-screen[data-sync-phase="signed-out"]');
    await signedOut.waitFor();
    assert.equal(state.logouts, 1, `${testCase.name} must revoke one session family`);
    await assertScreen(page, testCase, 'signed-out');
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-signed-out.png`) });

    await signedOut.getByRole('button', { name: 'Recover account' }).click();
    await page.locator('.academy-profile-screen').waitFor();
    await page.goto(`${baseUrl}/academy/?qa-run=${runId}&view=profile-sync`, { waitUntil: 'domcontentloaded' });
    ready = page.locator('.academy-profile-sync-screen[data-sync-phase="ready"]');
    await ready.waitFor();
    assert.equal(state.authStarts, 2, `${testCase.name} recovery must make one fresh Google handoff`);
    assert.equal(state.sessionExchanges, 1, `${testCase.name} recovery must not spend another class code`);
    await ready.getByText('1 connected Reader device(s).', { exact: true }).waitFor();
    await assertScreen(page, testCase, 'recovered');

    await ready.getByRole('button', { name: 'Delete account' }).click();
    const local = page.locator('.academy-profile-sync-screen[data-sync-phase="local"]');
    await local.waitFor();
    assert.deepEqual(state.accountDeletes, [{ confirmation: 'delete-account' }],
        `${testCase.name} must send the explicit account-deletion confirmation`);
    assert.equal(await page.evaluate(() => localStorage.getItem('yomu:academy:profile-sync:v1')), null,
        `${testCase.name} account deletion must clear the local encrypted profile`);
    await assertScreen(page, testCase, 'deleted');
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-deleted.png`) });

    assert.deepEqual(state.unexpectedApi, [], `${testCase.name} made unmodeled account API requests`);
    assert.deepEqual({ errors, unexpectedResponses }, { errors: [], unexpectedResponses: [] },
        `${testCase.name} browser console and request surface must stay clean`);
    await context.close();
}

async function handleApi(route, state, returnUrl) {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const method = request.method();
    if (pathname === '/academy/api/session' && method === 'POST') {
        const body = JSON.parse(request.postData() ?? '{}');
        assert.equal(body.code, 'ACCOUNT-DAY-ONE');
        state.sessionActive = true;
        state.sessionExchanges += 1;
        const now = Date.now();
        return json(route, 200, {
            sessionId: 'account-browser-session',
            expiresAt: now + 8 * 60 * 60 * 1_000,
            offlineResumeUntil: now + 30 * 24 * 60 * 60 * 1_000,
            accountRequired: true,
        });
    }
    if (pathname === '/academy/api/session' && method === 'GET') {
        return json(route, state.sessionActive ? 200 : 401, state.sessionActive ? { active: true } : { error: 'Session ended.' });
    }
    if (pathname === '/academy/api/session/resume' && method === 'POST') {
        return json(route, 401, { error: 'Session family was revoked.' });
    }
    if (pathname === '/academy/api/profile' && method === 'GET') {
        if (!state.sessionActive || !state.linked || state.deleted) return json(route, 401, { error: 'Sign in required.' });
        return json(route, 200, profile());
    }
    if (pathname === '/academy/api/auth/google/start' && method === 'GET') {
        state.authStarts += 1;
        state.sessionActive = true;
        state.linked = true;
        state.recoveryStarted = false;
        return route.fulfill({ status: 302, headers: { location: returnUrl, 'cache-control': 'no-store' } });
    }
    if (pathname === '/academy/api/auth/google/recovery' && method === 'POST') {
        state.recoveryStarted = true;
        return json(route, 201, { recovery: true });
    }
    if (pathname === '/academy/api/account' && method === 'GET') return json(route, 200, account());
    if (pathname === '/academy/api/entitlement' && method === 'GET') {
        return json(route, 200, { entitlement: 'academy', status: 'active', redeemedAt: 1_784_700_000_000 });
    }
    if (pathname === '/academy/api/profile/key' && method === 'POST') {
        const body = JSON.parse(request.postData() ?? '{}');
        if (state.keyCommitment && state.keyCommitment !== body.keyCommitment) {
            return json(route, 409, { error: 'This profile uses another key.' });
        }
        state.keyCommitment = body.keyCommitment;
        return json(route, 200, { initialized: true });
    }
    if (pathname === '/academy/api/srs/pull' && method === 'GET') {
        return json(route, 200, { events: [], nextCursor: 0, hasMore: false });
    }
    if (pathname === '/academy/api/srs/push' && method === 'POST') {
        const events = JSON.parse(request.postData() ?? '{}').events ?? [];
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
    if (pathname === '/academy/api/pairings' && method === 'POST') {
        state.pairingCreates += 1;
        return json(route, 201, { pairingId: PAIRING_ID, code: PAIRING_CODE, expiresAt: Date.now() + 600_000 });
    }
    if (pathname === `/academy/api/pairings/${PAIRING_ID}` && method === 'PUT') {
        const envelope = JSON.parse(request.postData() ?? '{}');
        assert.equal(envelope.keyVersion, 1);
        assert.ok(envelope.salt && envelope.nonce && envelope.ciphertext);
        state.pairingUploads += 1;
        return json(route, 200, { pairingId: PAIRING_ID, ready: true });
    }
    if (pathname === '/academy/api/account/export' && method === 'POST') {
        state.exports += 1;
        return json(route, 200, {
            schemaVersion: 2,
            profile: profile(),
            account: account(),
            eventPage: { events: [], nextCursor: 0, hasMore: false, exportCursor: null },
            readerSrsEventPage: { events: [], nextCursor: 0, hasMore: false },
        });
    }
    if (pathname === '/academy/api/logout' && method === 'POST') {
        state.logouts += 1;
        state.sessionActive = false;
        state.linked = false;
        return json(route, 200, { signedOut: true });
    }
    if (pathname === '/academy/api/account' && method === 'DELETE') {
        state.accountDeletes.push(JSON.parse(request.postData() ?? '{}'));
        state.deleted = true;
        state.linked = false;
        return json(route, 200, { deleted: true });
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

function expectedAccountFailure(value) {
    return value ? new URL(value).pathname === '/academy/api/profile' : false;
}

async function scrollPanelToEnd(screen) {
    await screen.locator('.academy-panel').evaluate(panel => {
        panel.scrollTop = panel.scrollHeight;
    });
}

async function assertScreen(page, testCase, phase) {
    const selector = '.academy-profile-sync-screen';
    const geometry = await page.locator(selector).evaluate(screen => {
        const bounds = node => {
            const rect = node?.getBoundingClientRect();
            return rect ? {
                left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                width: rect.width, height: rect.height,
                textFits: node instanceof HTMLElement
                    ? node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1
                    : true,
            } : null;
        };
        const controls = [
            ...screen.querySelectorAll('button, input'),
            ...document.querySelectorAll('.academy-utility-toggle'),
        ].map(bounds).filter(item => item && item.width > 0 && item.height > 0);
        const overlaps = [];
        for (let left = 0; left < controls.length; left += 1) {
            for (let right = left + 1; right < controls.length; right += 1) {
                const a = controls[left];
                const b = controls[right];
                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
                    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) {
                    overlaps.push([left, right]);
                }
            }
        }
        return {
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            windowScrollY: scrollY,
            hostScrollTop: document.querySelector('.academy-screen-host')?.scrollTop ?? -1,
            scrollWidth: document.documentElement.scrollWidth,
            panel: bounds(screen.querySelector('.academy-panel')),
            back: bounds(screen.querySelector('.academy-lesson-overview-back')),
            utilityHidden: document.querySelector('.academy-utility')?.hidden ?? false,
            controls,
            overlaps,
        };
    });
    assert.equal(geometry.windowScrollY, 0,
        `${testCase.name} ${phase} document must start at the top`);
    assert.equal(geometry.hostScrollTop, 0,
        `${testCase.name} ${phase} screen host must start at the top`);
    assert.equal(geometry.utilityHidden, true,
        `${testCase.name} ${phase} must keep global chrome out of the focused account surface`);
    assert.ok(geometry.scrollWidth <= testCase.width,
        `${testCase.name} ${phase} must not overflow horizontally (${geometry.scrollWidth}/${testCase.width})`);
    assert.ok(geometry.panel && geometry.panel.left >= -1 && geometry.panel.right <= testCase.width + 1,
        `${testCase.name} ${phase} paper must fit: ${JSON.stringify(geometry.panel)}`);
    assert.ok(geometry.back && geometry.back.top >= 0 && geometry.back.bottom <= geometry.viewportHeight,
        `${testCase.name} ${phase} Back control must be visible: ${JSON.stringify(geometry.back)}`);
    assert.deepEqual(geometry.overlaps, [], `${testCase.name} ${phase} controls must not overlap`);
    for (const [index, control] of geometry.controls.entries()) {
        assert.ok(control.left >= -1 && control.right <= geometry.viewportWidth + 1,
            `${testCase.name} ${phase} control ${index + 1} must fit: ${JSON.stringify(control)}`);
        assert.ok(control.width >= 44 && control.height >= 44,
            `${testCase.name} ${phase} control ${index + 1} must be a 44px target: ${JSON.stringify(control)}`);
        assert.equal(control.textFits, true,
            `${testCase.name} ${phase} control ${index + 1} text must fit: ${JSON.stringify(control)}`);
    }
    const axe = await new AxeBuilder({ page }).include(selector).analyze();
    const blocking = axe.violations.filter(violation =>
        violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
    })), [], `${testCase.name} ${phase} must have no serious or critical Axe violations`);
}
