import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.ACCESS_SCREENSHOTS ?? 'qa-artifacts/access');
const cases = [
    { name: 'phone', width: 390, height: 844 },
    { name: 'portrait-tablet', width: 1024, height: 1366 },
    { name: 'desktop', width: 1440, height: 900 },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const testCase of cases) await verifyAccessJourney(testCase);
    console.log('Academy class-code access passed on phone, portrait tablet, and desktop.');
} finally {
    await browser.close();
}

async function verifyAccessJourney(testCase) {
    const context = await browser.newContext({
        viewport: { width: testCase.width, height: testCase.height },
        locale: 'en-GB',
        reducedMotion: 'reduce',
    });
    const sessionBodies = [];
    const expectedErrorResponses = [];
    await context.route('**/academy/media/audio/**', async route => {
        await route.fulfill({ status: 204, headers: { 'cache-control': 'no-store' } });
    });
    await context.route('**/academy/api/**', async route => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/academy/api/session' && request.method() === 'POST') {
            const body = JSON.parse(request.postData() ?? '{}');
            sessionBodies.push(body);
            if (body.code === 'WRONG-CODE') {
                expectedErrorResponses.push(`${pathname}:403`);
                await json(route, 403, { error: 'Invitation was not accepted.' });
                return;
            }
            if (body.code === 'OFFLINE-CODE') {
                expectedErrorResponses.push(`${pathname}:503`);
                await json(route, 503, { error: 'Invitation service unavailable.' });
                return;
            }
            assert.equal(body.code, 'DAY-ONE-ACCESS', `${testCase.name} sent an unexpected class code`);
            const now = Date.now();
            await json(route, 200, {
                sessionId: `session-${testCase.name}`,
                expiresAt: now + 8 * 60 * 60 * 1_000,
                offlineResumeUntil: now + 30 * 24 * 60 * 60 * 1_000,
                accountRequired: true,
            });
            return;
        }
        if (pathname === '/academy/api/session' && request.method() === 'GET') {
            await json(route, 200, { active: true });
            return;
        }
        if (pathname === '/academy/api/profile') {
            expectedErrorResponses.push(`${pathname}:401`);
            await json(route, 401, { error: 'Sign in required.' });
            return;
        }
        await route.abort('blockedbyclient');
    });

    const page = await context.newPage();
    const errors = [];
    const unexpectedResponses = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') {
            const location = message.location().url;
            if (expectedFailureLocation(location)) return;
            errors.push(`console: ${message.text()}${location ? ` @ ${location}` : ''}`);
        }
    });
    page.on('response', response => {
        if (response.status() < 400) return;
        const pathname = new URL(response.url()).pathname;
        const signature = `${pathname}:${response.status()}`;
        if (!['/academy/api/session:403', '/academy/api/session:503', '/academy/api/profile:401'].includes(signature)) {
            unexpectedResponses.push(signature);
        }
    });

    const runId = `access-${testCase.name}-${Date.now()}`;
    const response = await page.goto(`${baseUrl}/academy/?qa-run=${runId}`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
    const access = page.locator('.academy-access-screen');
    await access.waitFor();
    await assertGeometry(page, testCase, '.academy-access-screen', 'entrance');
    await assertAccessible(page, '.academy-access-screen');
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-entrance.png`), fullPage: true });

    const input = access.locator('input[name="code"]');
    const submit = access.getByRole('button', { name: 'Open the doors' });
    await input.fill(' wrong-code ');
    await submit.click();
    await access.getByRole('alert').filter({ hasText: 'Check the code and try again.' }).waitFor();
    assert.equal(await input.inputValue(), ' wrong-code ', `${testCase.name} must retain an invalid code for repair`);
    assert.equal(await input.evaluate(node => node === document.activeElement), true,
        `${testCase.name} must return focus to the code after rejection`);

    await input.fill('offline-code');
    await submit.click();
    await access.getByRole('alert').filter({ hasText: 'Couldn’t check that code. Try again.' }).waitFor();
    assert.equal(await input.inputValue(), 'offline-code', `${testCase.name} must retain a code after an outage`);
    assert.equal(await submit.isEnabled(), true, `${testCase.name} must recover its primary action after an outage`);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-recovery.png`), fullPage: true });

    await input.fill('day-one-access');
    await page.evaluate(() => {
        const form = document.querySelector('.academy-access-screen form');
        if (!(form instanceof HTMLFormElement)) throw new Error('Access form is unavailable.');
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    });
    const accountFork = page.locator('.academy-profile-sync-screen[data-sync-phase="sign-in"]');
    try {
        await accountFork.waitFor({ timeout: 12_000 });
    } catch (error) {
        const state = await page.evaluate(() => ({
            checkpoint: window.__yomuAcademy?.checkpoint ?? null,
            screenClass: document.querySelector('#yomu-academy .academy-screen')?.className ?? null,
            screenText: document.querySelector('#yomu-academy .academy-screen')?.textContent?.trim().slice(0, 500) ?? null,
            bootError: document.querySelector('#yomu-academy')?.getAttribute('data-boot-error'),
        }));
        throw new Error(`${testCase.name} did not reach the account fork: ${JSON.stringify({
            state, sessionBodies, errors, unexpectedResponses,
        })}`, { cause: error });
    }
    await accountFork.getByRole('button', { name: 'Sign in with Google' }).waitFor();
    assert.equal(sessionBodies.filter(body => body.code === 'DAY-ONE-ACCESS').length, 1,
        `${testCase.name} must exchange a corrected code exactly once`);
    assert.deepEqual(sessionBodies.map(body => body.code), ['WRONG-CODE', 'OFFLINE-CODE', 'DAY-ONE-ACCESS'],
        `${testCase.name} must normalize every submitted code at the gateway`);
    await assertGeometry(page, testCase, '.academy-profile-sync-screen', 'account-fork');
    await assertAccessible(page, '.academy-profile-sync-screen');
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-account-fork.png`), fullPage: true });

    const checkpoint = await readCheckpoint(page);
    assert.equal(checkpoint.route, 'profile-sync', `${testCase.name} must persist the account fork`);
    assert.deepEqual(checkpoint.routeHistory, [], `${testCase.name} must reset invite history at the account fork`);
    assert.equal(checkpoint.session?.sessionId, `session-${testCase.name}`,
        `${testCase.name} must persist the accepted invite session`);
    assert.equal(checkpoint.session?.accountRequired, true,
        `${testCase.name} must retain the account requirement`);
    assert.equal(checkpoint.session?.source, 'cloudflare',
        `${testCase.name} must retain the real gateway source`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await accountFork.waitFor();
    assert.equal(sessionBodies.filter(body => body.code === 'DAY-ONE-ACCESS').length, 1,
        `${testCase.name} reload must resume the stored invite without spending it again`);
    const restored = await readCheckpoint(page);
    assert.equal(restored.session?.sessionId, `session-${testCase.name}`,
        `${testCase.name} reload must retain the same invite session`);
    assert.equal(restored.route, 'profile-sync', `${testCase.name} reload must return to the account fork`);

    assert.deepEqual({ errors, unexpectedResponses }, { errors: [], unexpectedResponses: [] },
        `${testCase.name} browser console and request surface must stay clean`);
    assert.ok(expectedErrorResponses.includes('/academy/api/session:403'));
    assert.ok(expectedErrorResponses.includes('/academy/api/session:503'));
    assert.ok(expectedErrorResponses.filter(value => value === '/academy/api/profile:401').length >= 2);
    await context.close();
}

async function json(route, status, body) {
    await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
        headers: { 'cache-control': 'no-store' },
    });
}

function expectedFailureLocation(value) {
    if (!value) return false;
    const pathname = new URL(value).pathname;
    return pathname === '/academy/api/session' || pathname === '/academy/api/profile';
}

async function readCheckpoint(page) {
    return page.evaluate(() => {
        const checkpoint = window.__yomuAcademy?.checkpoint;
        if (!checkpoint) throw new Error('Academy checkpoint is unavailable.');
        return structuredClone(checkpoint);
    });
}

async function assertGeometry(page, testCase, selector, phase) {
    const geometry = await page.locator(selector).evaluate(screen => {
        const bounds = node => {
            const rect = node?.getBoundingClientRect();
            return rect ? { x: rect.x, right: rect.right, width: rect.width, height: rect.height } : null;
        };
        return {
            scrollWidth: document.documentElement.scrollWidth,
            screen: bounds(screen),
            panel: bounds(screen.querySelector('.academy-panel')),
            controls: [...screen.querySelectorAll('button, input')]
                .map(bounds)
                .filter(Boolean),
        };
    });
    assert.ok(geometry.scrollWidth <= testCase.width,
        `${testCase.name} ${phase} must not overflow horizontally (${geometry.scrollWidth}/${testCase.width})`);
    for (const [label, bounds] of [['screen', geometry.screen], ['panel', geometry.panel]]) {
        assert.ok(bounds, `${testCase.name} ${phase} ${label} needs browser bounds`);
        assert.ok(bounds.x >= -1 && bounds.right <= testCase.width + 1,
            `${testCase.name} ${phase} ${label} must fit: ${JSON.stringify(bounds)}`);
    }
    for (const [index, control] of geometry.controls.entries()) {
        assert.ok(control.x >= -1 && control.right <= testCase.width + 1,
            `${testCase.name} ${phase} control ${index + 1} must fit: ${JSON.stringify(control)}`);
        assert.ok(control.width >= 44 && control.height >= 44,
            `${testCase.name} ${phase} control ${index + 1} must be a 44px target: ${JSON.stringify(control)}`);
    }
}

async function assertAccessible(page, selector) {
    const result = await new AxeBuilder({ page }).include(selector).analyze();
    const blocking = result.violations.filter(violation =>
        violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
    })), [], `${selector} must have no serious or critical Axe violations`);
}
