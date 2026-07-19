#!/usr/bin/env node
/**
 * Live account/payment proof runner for the deployed Yomu Academy Worker.
 *
 * The runner makes one Stripe TEST payment, observes the browser application's
 * own bounded claim loop, proves the account gate and session recovery paths,
 * and records provider-dependent gaps as blocked. It never synthesizes a
 * Google callback or marks an unobserved provider action as passing.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ORIGIN = process.env.ACADEMY_PROOF_ORIGIN ?? 'https://yomureader.com';
const EVIDENCE_DIR = resolve(process.cwd(), 'docs/academy/evidence/account-payment');
const D1_DATABASE = 'yomu-academy';
const CLAIM_PATH = '/academy/api/claim';
const CLAIM_TIMEOUT_MS = boundedInteger(process.env.ACADEMY_PROOF_CLAIM_TIMEOUT_MS, 12 * 60_000, 30_000, 20 * 60_000);
// Four app-owned claim cycles use at most 28 requests; the 29th is reserved for
// the post-success idempotency assertion and remains below the Worker's limit.
const MAX_CLAIM_REQUESTS = 29;
const MIN_CLAIM_INTERVAL_MS = 1_000;

export const PROOF_VIEWPORTS = Object.freeze({
    desktop: Object.freeze({ width: 1440, height: 900 }),
    mobile: Object.freeze({ width: 390, height: 844 }),
});

/** Parse Retry-After seconds or an HTTP date, with a bounded fallback. */
export function parseRetryAfterMs(value, now = Date.now(), fallbackMs = 20_000) {
    const boundedFallback = Math.min(Math.max(fallbackMs, 1_000), 10 * 60_000);
    if (typeof value !== 'string' || !value.trim()) return boundedFallback;
    const seconds = Number(value.trim());
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(Math.max(Math.ceil(seconds * 1_000), 1_000), 10 * 60_000);
    }
    const at = Date.parse(value);
    if (!Number.isFinite(at)) return boundedFallback;
    return Math.min(Math.max(at - now, 1_000), 10 * 60_000);
}

/** Last defense before console or JSON evidence: erase known and shaped IDs. */
export function sanitizeEvidenceDetail(detail, secrets = []) {
    let safe = String(detail ?? '');
    for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
        safe = safe.replaceAll(secret, '<redacted>');
    }
    return safe
        .replace(/cs_(test|live)_[A-Za-z0-9_]+/gu, 'cs_$1_<redacted>')
        .replace(/(__Host-academy_(?:claim|session)=)[^;\s]+/gu, '$1<redacted>')
        .replace(/([?&]session_id=)[^&\s]+/gu, '$1<redacted>')
        .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, '<redacted:id>');
}

export function summarizeProof(results) {
    const count = outcome => results.filter(result => result.outcome === outcome).length;
    const summary = {
        pass: count('pass'),
        fail: count('fail'),
        blocked: count('blocked'),
        info: count('info'),
    };
    return { ...summary, complete: summary.fail === 0 && summary.blocked === 0 };
}

function boundedInteger(raw, fallback, minimum, maximum) {
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function createRecorder() {
    const results = [];
    const secrets = new Set();
    return {
        results,
        secret(value) {
            if (typeof value === 'string' && value) secrets.add(value);
            return value;
        },
        record(step, outcome, detail = '') {
            const safeDetail = sanitizeEvidenceDetail(detail, secrets);
            results.push({ step, outcome, detail: safeDetail, at: new Date().toISOString() });
            const label = outcome === 'pass' ? 'PASS' : outcome === 'blocked' ? 'BLOCKED' : outcome === 'info' ? 'INFO' : 'FAIL';
            console.log(`${label}  ${step}${safeDetail ? ` - ${safeDetail}` : ''}`);
        },
    };
}

async function inPageJson(page, path, init = {}) {
    return page.evaluate(async ({ path: requestPath, requestInit }) => {
        const response = await fetch(requestPath, {
            credentials: 'include',
            cache: 'no-store',
            ...requestInit,
            headers: requestInit.body === undefined
                ? { accept: 'application/json' }
                : { accept: 'application/json', 'content-type': 'application/json' },
        });
        let body = null;
        try { body = await response.json(); } catch { /* Non-JSON response. */ }
        return { status: response.status, body, retryAfter: response.headers.get('retry-after') };
    }, { path, requestInit: init });
}

async function requestJson(context, path, options = {}) {
    const response = await context.request.fetch(`${ORIGIN}${path}`, {
        method: options.method ?? 'GET',
        maxRedirects: options.maxRedirects ?? 20,
        headers: {
            accept: 'application/json',
            origin: ORIGIN,
            'sec-fetch-site': 'same-origin',
            ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(options.headers ?? {}),
        },
        ...(options.body === undefined ? {} : { data: JSON.stringify(options.body) }),
    });
    let body = null;
    try { body = await response.json(); } catch { /* Non-JSON response. */ }
    return { status: response.status(), body, headers: response.headers() };
}

function d1Execute(command) {
    const output = execFileSync('npx', [
        'wrangler', 'd1', 'execute', D1_DATABASE, '--remote', '--json', '--command', command,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const jsonStart = output.indexOf('[');
    if (jsonStart < 0) throw new Error('Wrangler returned no JSON result.');
    return JSON.parse(output.slice(jsonStart));
}

function d1Rows(command) {
    const batches = d1Execute(command);
    return Array.isArray(batches) && Array.isArray(batches[0]?.results) ? batches[0].results : [];
}

function uuidSql(value) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
        throw new Error('Refusing to use a malformed proof identifier in D1.');
    }
    return `'${value.toLowerCase()}'`;
}

function stripeSessionSql(value) {
    if (!/^cs_test_[A-Za-z0-9_]{3,250}$/u.test(value)) throw new Error('Refusing to query a malformed Stripe test id.');
    return `'${value}'`;
}

function slugSql(value) {
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(value)) throw new Error('Refusing to use a malformed proof slug in D1.');
    return `'${value}'`;
}

function sleep(delayMs) {
    return new Promise(resolveWait => setTimeout(resolveWait, Math.max(0, delayMs)));
}

/** The hosted Checkout renders card fields directly or inside Stripe frames. */
async function findCheckoutField(page, selector, timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const frame of page.frames()) {
            const field = frame.locator(selector).first();
            if (await field.count().catch(() => 0) && await field.isVisible().catch(() => false)) return field;
        }
        await page.waitForTimeout(500);
    }
    return null;
}

async function findCancelReturnLink(page, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const frame of page.frames()) {
            const links = frame.locator('a[href]');
            const count = Math.min(await links.count().catch(() => 0), 80);
            for (let index = 0; index < count; index += 1) {
                const link = links.nth(index);
                const href = await link.getAttribute('href').catch(() => null);
                if (!href) continue;
                try {
                    const url = new URL(href, frame.url());
                    if (url.origin === ORIGIN && url.searchParams.get('checkout') === 'cancelled') return link;
                } catch { /* Ignore malformed third-party links. */ }
            }
        }
        await page.waitForTimeout(500);
    }
    return null;
}

async function fillStripeCheckout(page) {
    const accordionCard = await findCheckoutField(
        page,
        '[data-testid="card-accordion-item"], [data-testid="card-accordion-item-button"], button:has-text("Card"), label:has-text("Card")',
        15_000,
    );
    if (accordionCard) await accordionCard.click().catch(() => undefined);
    const cardNumber = await findCheckoutField(page, '#cardNumber, input[name="cardNumber"], input[name="number"]');
    if (!cardNumber) {
        const inputs = [];
        for (const frame of page.frames()) {
            for (const name of await frame.locator('input').evaluateAll(
                elements => elements.map(element => element.name || element.id || element.type),
            ).catch(() => [])) inputs.push(name);
        }
        throw new Error(`Stripe card field not found; visible inputs: ${inputs.join(', ') || 'none'}`);
    }
    const fill = async (selector, value) => {
        const field = await findCheckoutField(page, selector, 3_000);
        if (field) await field.fill(value).catch(() => undefined);
    };
    await fill('#email, input[name="email"]', 'academy-proof@example.com');
    await cardNumber.fill('4242 4242 4242 4242');
    await fill('#cardExpiry, input[name="cardExpiry"], input[name="expiry"]', '12 / 34');
    await fill('#cardCvc, input[name="cardCvc"], input[name="cvc"]', '123');
    await fill('#billingName, input[name="billingName"]', 'Academy Proof');
    await fill('#billingPostalCode, input[name="billingPostalCode"], input[name="postalCode"]', 'SW1A 1AA');
    const optOut = await findCheckoutField(page, 'input[name="enableStripePass"]:checked', 1_000);
    if (optOut) await optOut.uncheck().catch(() => undefined);
    const submit = await findCheckoutField(page, 'button[type="submit"], .SubmitButton', 10_000);
    if (!submit) throw new Error('Stripe submit button not found.');
    await submit.click();
}

/**
 * Observe and pace the application's claimant. The harness never starts a
 * concurrent poller; one explicit retry is used only after a paid result to
 * prove idempotency.
 */
async function installClaimObserver(page, recorder) {
    const state = {
        sessionId: '',
        requests: 0,
        lastDispatchedAt: 0,
        nextAllowedAt: 0,
        exhausted: false,
        paidCode: null,
        lastStatus: null,
    };
    const pattern = `${ORIGIN}${CLAIM_PATH}**`;
    const handler = async route => {
        const request = route.request();
        let url;
        try { url = new URL(request.url()); } catch { await route.continue(); return; }
        const requestedSessionId = url.searchParams.get('session_id') ?? '';
        if (url.pathname !== CLAIM_PATH || !/^cs_test_[A-Za-z0-9_]{3,250}$/u.test(requestedSessionId)) {
            await route.continue();
            return;
        }
        if (state.sessionId && requestedSessionId !== state.sessionId) {
            await route.continue();
            return;
        }
        if (!state.sessionId) state.sessionId = recorder.secret(requestedSessionId);
        if (state.requests >= MAX_CLAIM_REQUESTS) {
            state.exhausted = true;
            await route.abort('blockedbyclient');
            return;
        }
        const dispatchAt = Math.max(state.nextAllowedAt, state.lastDispatchedAt + MIN_CLAIM_INTERVAL_MS);
        await sleep(dispatchAt - Date.now());
        state.requests += 1;
        state.lastDispatchedAt = Date.now();
        try {
            const response = await route.fetch();
            const body = await response.body();
            state.lastStatus = response.status();
            if (response.status() === 429) {
                state.nextAllowedAt = Date.now() + parseRetryAfterMs(response.headers()['retry-after']);
            }
            try {
                const payload = JSON.parse(body.toString('utf8'));
                if (response.status() === 200 && payload?.status === 'paid' && typeof payload.code === 'string') {
                    state.paidCode = recorder.secret(payload.code);
                }
            } catch { /* Preserve and forward the real non-JSON response. */ }
            await route.fulfill({ response, body });
        } catch {
            state.lastStatus = 0;
            await route.abort('failed').catch(() => undefined);
        }
    };
    await page.route(pattern, handler);
    return {
        state,
        expectSessionId(sessionId) {
            if (!/^cs_test_[A-Za-z0-9_]{3,250}$/u.test(sessionId)) throw new Error('Claim observer received a malformed Stripe test id.');
            if (state.sessionId && state.sessionId !== sessionId) throw new Error('The app claimed a different Stripe session than the observed success redirect.');
            state.sessionId = recorder.secret(sessionId);
        },
        async waitUntilAllowed() {
            await sleep(state.nextAllowedAt - Date.now());
        },
        async dispose() {
            await page.unroute(pattern, handler).catch(() => undefined);
        },
    };
}

async function waitForAppClaim(page, observer) {
    const deadline = Date.now() + CLAIM_TIMEOUT_MS;
    let retries = 0;
    while (Date.now() < deadline) {
        if (observer.state.paidCode) return observer.state.paidCode;
        if (observer.state.exhausted) return null;
        const retry = page.locator('.academy-donation-claim-retry');
        if (await retry.isVisible().catch(() => false)) {
            if (retries >= 3) return null;
            await observer.waitUntilAllowed();
            await sleep(retries * 5_000);
            retries += 1;
            await retry.click();
        }
        await page.waitForTimeout(250);
    }
    return null;
}

function isStripeTestCheckout(urlString) {
    try {
        const url = new URL(urlString);
        return url.protocol === 'https:'
            && url.hostname === 'checkout.stripe.com'
            && /\/cs_test_[A-Za-z0-9_]+/u.test(url.pathname);
    } catch {
        return false;
    }
}

function oidcStartIsValid(status, location) {
    try {
        const authorization = new URL(location);
        return status === 302
            && authorization.hostname === 'accounts.google.com'
            && (authorization.searchParams.get('client_id') ?? '').endsWith('.apps.googleusercontent.com')
            && authorization.searchParams.get('code_challenge_method') === 'S256'
            && (authorization.searchParams.get('state') ?? '').length >= 40
            && (authorization.searchParams.get('nonce') ?? '').length >= 40
            && authorization.searchParams.get('redirect_uri') === `${ORIGIN}/academy/api/auth/google/callback`;
    } catch {
        return false;
    }
}

async function requestOidcStart(context) {
    const response = await context.request.get(`${ORIGIN}/academy/api/auth/google/start`, {
        maxRedirects: 0,
        headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin' },
    });
    return { status: response.status(), location: response.headers().location ?? '' };
}

async function captureAccountUi(page, name, viewport, recorder) {
    await page.setViewportSize(viewport);
    const screen = page.locator('.academy-profile-sync-screen');
    await screen.waitFor({ state: 'visible', timeout: 20_000 });
    const state = await page.evaluate(() => {
        const route = document.querySelector('.academy-profile-sync-screen');
        const status = document.querySelector('.academy-profile-sync-status');
        const primary = document.querySelector('.academy-profile-sync-actions .academy-button');
        const panel = document.querySelector('.academy-profile-sync-screen .academy-panel');
        const rect = panel?.getBoundingClientRect();
        return {
            routeVisible: route instanceof HTMLElement && !route.hidden,
            phase: route instanceof HTMLElement ? route.dataset.syncPhase : '',
            statusVisible: status instanceof HTMLElement && !status.hidden,
            primaryVisible: primary instanceof HTMLElement && !primary.hidden && primary.getBoundingClientRect().height > 0,
            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            panelInsideViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1),
        };
    });
    const passed = state.routeVisible
        && state.phase === 'sign-in'
        && state.statusVisible
        && state.primaryVisible
        && !state.horizontalOverflow
        && state.panelInsideViewport;
    recorder.record(`${name} account/recovery UI (${viewport.width}x${viewport.height})`, passed ? 'pass' : 'fail',
        `sign-in phase: ${state.phase === 'sign-in'}, visible controls: ${state.statusVisible && state.primaryVisible}, no horizontal overflow: ${!state.horizontalOverflow}`);
    await page.screenshot({ path: resolve(EVIDENCE_DIR, `${name}-account-recovery.png`) });
}

async function proveOptionalOneUseClass(browser, resources, recorder, cleanup) {
    const adminToken = process.env.ACADEMY_PROOF_ADMIN_TOKEN;
    if (!adminToken) {
        recorder.record('one-use class code is consumed exactly once', 'blocked', 'ACADEMY_PROOF_ADMIN_TOKEN was not supplied; no admin fixture was created');
        return;
    }
    recorder.secret(adminToken);
    const fixtureContext = await browser.newContext({ viewport: PROOF_VIEWPORTS.desktop });
    const rejectedContext = await browser.newContext({ viewport: PROOF_VIEWPORTS.desktop });
    resources.contexts.push(fixtureContext, rejectedContext);
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
    const classId = `proof-${suffix}`;
    const headers = { authorization: `Bearer ${adminToken}` };
    const created = await requestJson(fixtureContext, '/academy/api/admin/invites', {
        method: 'POST',
        headers,
        body: { uses: 1, expiresAt: Date.now() + 30 * 60_000 },
    });
    const code = typeof created.body?.code === 'string' ? recorder.secret(created.body.code) : '';
    const inviteId = typeof created.body?.inviteId === 'string' ? recorder.secret(created.body.inviteId) : '';
    if (created.status !== 201 || !code || !inviteId) {
        recorder.record('one-use class code is consumed exactly once', 'fail', `admin invite status ${created.status}`);
        return;
    }
    cleanup.classFixture = { classId, inviteId };
    const bound = await requestJson(fixtureContext, '/academy/api/admin/classes', {
        method: 'POST',
        headers,
        body: { classId, name: 'Account proof fixture', inviteCode: code },
    });
    const first = await requestJson(fixtureContext, '/academy/api/session', { method: 'POST', body: { code } });
    const second = await requestJson(rejectedContext, '/academy/api/session', { method: 'POST', body: { code } });
    if (typeof first.body?.sessionId === 'string') {
        recorder.secret(first.body.sessionId);
        cleanup.sessionIds.add(first.body.sessionId);
    }
    recorder.record('one-use class code is consumed exactly once',
        bound.status === 200 && first.status === 200 && first.body?.accountRequired === true && second.status === 403 ? 'pass' : 'fail',
        `class binding ${bound.status}, first exchange ${first.status}, second exchange ${second.status}`);
}

async function cleanupRun(browser, resources, cleanup, recorder) {
    let clean = true;
    for (const context of [...resources.contexts].reverse()) {
        try {
            const logout = await requestJson(context, '/academy/api/logout', { method: 'POST' });
            if (logout.status !== 200) clean = false;
            await context.clearCookies();
        } catch {
            clean = false;
        }
    }
    if (cleanup.sessionIds.size > 0) {
        try {
            const ids = [...cleanup.sessionIds].map(uuidSql).join(', ');
            const now = Date.now();
            d1Execute(`UPDATE sessions SET revoked_at = COALESCE(revoked_at, ${now}) WHERE public_id IN (${ids});`);
            d1Execute(`DELETE FROM oauth_flows WHERE session_public_id IN (${ids});`);
        } catch {
            clean = false;
        }
    }
    if (cleanup.classFixture) {
        try {
            const inviteId = uuidSql(cleanup.classFixture.inviteId);
            const classId = slugSql(cleanup.classFixture.classId);
            d1Execute(
                `DELETE FROM sessions WHERE invite_id = ${inviteId}; `
                + `UPDATE invites SET class_id = NULL WHERE id = ${inviteId}; `
                + `DELETE FROM invites WHERE id = ${inviteId}; `
                + `DELETE FROM classes WHERE id = ${classId};`,
            );
        } catch {
            clean = false;
        }
    }
    if (cleanup.checkoutSessionId) {
        try {
            const rows = d1Rows(
                `SELECT status, invite_id IS NOT NULL AS has_invite, redeemed_at IS NOT NULL AS redeemed `
                + `FROM purchases WHERE checkout_session_id = ${stripeSessionSql(cleanup.checkoutSessionId)};`,
            );
            const purchase = rows[0];
            recorder.record('Stripe test purchase/invite disposition', 'info', purchase
                ? `retained as an audit record (status ${purchase.status}, invite minted: ${purchase.has_invite === 1}, redeemed: ${purchase.redeemed === 1}); no supported deletion endpoint exists`
                : 'no retained purchase row was found');
        } catch {
            recorder.record('Stripe test purchase/invite disposition', 'blocked', 'could not inspect the retained audit record through Wrangler');
        }
    }
    for (const context of [...resources.contexts].reverse()) {
        await context.close().catch(() => { clean = false; });
    }
    if (browser) await browser.close().catch(() => { clean = false; });
    recorder.record('proof sessions, browser contexts, and browser process cleaned up', clean ? 'pass' : 'fail');
}

export async function main() {
    if (!process.argv.includes('--live')) {
        console.log('Refusing to run against the deployed service without --live.');
        return 2;
    }
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const recorder = createRecorder();
    const resources = { contexts: [] };
    const cleanup = { sessionIds: new Set(), classFixture: null, checkoutSessionId: '' };
    let browser = null;
    let claimObserver = null;

    try {
        browser = await chromium.launch();
        const context = await browser.newContext({ viewport: PROOF_VIEWPORTS.desktop });
        resources.contexts.push(context);
        const page = await context.newPage();

        const healthResponse = await fetch(`${ORIGIN}/academy/api/health`, { headers: { accept: 'application/json' } });
        const health = await healthResponse.json().catch(() => null);
        recorder.record('worker health', healthResponse.status === 200 && health?.ok === true ? 'pass' : 'fail', `status ${healthResponse.status}`);
        await page.goto(`${ORIGIN}/academy/`, { waitUntil: 'networkidle' });
        await page.screenshot({ path: resolve(EVIDENCE_DIR, '01-access-screen-desktop.png') });

        const checkout = await inPageJson(page, '/academy/api/checkout', {
            method: 'POST', body: JSON.stringify({ amountGbp: 2 }),
        });
        const checkoutUrl = typeof checkout.body?.url === 'string' ? recorder.secret(checkout.body.url) : '';
        const checkoutOk = checkout.status === 200 && isStripeTestCheckout(checkoutUrl);
        recorder.record('checkout session created (Stripe test mode, GBP 2)', checkoutOk ? 'pass' : 'fail',
            `status ${checkout.status}, validated checkout.stripe.com cs_test_: ${checkoutOk}`);
        if (!checkoutOk) throw new Error('Checkout creation was not verifiably Stripe test mode.');
        const claimCookie = (await context.cookies(ORIGIN)).find(cookie => cookie.name === '__Host-academy_claim');
        if (claimCookie?.value) recorder.secret(claimCookie.value);
        recorder.record('HttpOnly claim cookie bound to this browser', claimCookie?.httpOnly ? 'pass' : 'fail',
            claimCookie ? 'cookie present; value fully redacted' : 'cookie missing');

        await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded' });
        await page.screenshot({ path: resolve(EVIDENCE_DIR, '02-stripe-test-checkout.png') });
        const cancelLink = await findCancelReturnLink(page);
        if (cancelLink) {
            const cancelRequest = page.waitForRequest(request => {
                if (!request.isNavigationRequest()) return false;
                try {
                    const url = new URL(request.url());
                    return url.origin === ORIGIN && url.searchParams.get('checkout') === 'cancelled';
                } catch { return false; }
            }, { timeout: 30_000 });
            await cancelLink.click();
            const observedCancel = new URL((await cancelRequest).url());
            recorder.record('Stripe cancel redirect observed', observedCancel.searchParams.get('checkout') === 'cancelled' ? 'pass' : 'fail');
            await page.waitForURL(url => url.origin === ORIGIN, { timeout: 30_000 });
            await page.waitForFunction(() => !window.location.search.includes('checkout'), null, { timeout: 20_000 });
            recorder.record('cancel parameters scrubbed from address bar', page.url().includes('checkout') ? 'fail' : 'pass');
        } else {
            recorder.record('Stripe cancel redirect observed', 'blocked', 'hosted Checkout exposed no cancel return link; no synthetic cancel navigation was counted');
        }

        await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded' });
        claimObserver = await installClaimObserver(page, recorder);
        const successRequest = page.waitForRequest(request => {
            if (!request.isNavigationRequest()) return false;
            try {
                const url = new URL(request.url());
                return url.origin === ORIGIN && url.searchParams.get('checkout') === 'success';
            } catch { return false; }
        }, { timeout: 120_000 });
        await fillStripeCheckout(page);
        const successUrl = new URL((await successRequest).url());
        const checkoutSessionId = successUrl.searchParams.get('session_id') ?? '';
        recorder.secret(checkoutSessionId);
        cleanup.checkoutSessionId = checkoutSessionId;
        claimObserver.expectSessionId(checkoutSessionId);
        const successObserved = successUrl.searchParams.get('checkout') === 'success' && /^cs_test_/u.test(checkoutSessionId);
        recorder.record('Stripe test payment success redirect observed', successObserved ? 'pass' : 'fail',
            `checkout=success and cs_test_ prefix: ${successObserved}`);
        await page.waitForURL(url => url.origin === ORIGIN, { timeout: 120_000 });
        await page.waitForFunction(() => !window.location.search.includes('checkout') && !window.location.search.includes('session_id'), null, { timeout: 20_000 });
        recorder.record('success and Stripe parameters scrubbed from address bar',
            /(?:checkout|session_id)=/u.test(page.url()) ? 'fail' : 'pass');
        await page.screenshot({ path: resolve(EVIDENCE_DIR, '03-success-return-scrubbed.png') });

        let paidCode = await waitForAppClaim(page, claimObserver);
        recorder.record('signed Stripe webhook fulfilled and app claimant received a paid code', paidCode ? 'pass' : 'fail',
            paidCode ? `one claimant used ${claimObserver.state.requests} bounded request(s); code fully redacted` : `claim ended after ${claimObserver.state.requests} request(s), last HTTP status ${claimObserver.state.lastStatus ?? 'none'}`);
        if (!paidCode) throw new Error('The app claimant did not receive a paid code.');

        await claimObserver.waitUntilAllowed();
        const claimAgain = await inPageJson(page, `${CLAIM_PATH}?session_id=${encodeURIComponent(checkoutSessionId)}`);
        const claimIdempotent = claimAgain.status === 200 && claimAgain.body?.status === 'paid' && claimAgain.body?.code === paidCode;
        if (typeof claimAgain.body?.code === 'string') recorder.secret(claimAgain.body.code);
        recorder.record('paid claim retry is idempotent', claimIdempotent ? 'pass' : 'fail', `status ${claimAgain.status}; same redacted code: ${claimIdempotent}`);
        await claimObserver.dispose();
        claimObserver = null;

        const codeInput = page.locator('input[name="code"]');
        await codeInput.fill(paidCode);
        await page.locator('.academy-access-form button[type="submit"]').click();
        paidCode = '';
        await page.locator('.academy-profile-sync-screen').waitFor({ state: 'visible', timeout: 30_000 });
        const session = await inPageJson(page, '/academy/api/session');
        const publicSessionId = typeof session.body?.sessionId === 'string' ? recorder.secret(session.body.sessionId) : '';
        if (publicSessionId) cleanup.sessionIds.add(publicSessionId);
        recorder.record('paid code exchanged for an account-required session',
            session.status === 200 && session.body?.accountRequired === true && Boolean(publicSessionId) ? 'pass' : 'fail',
            `status ${session.status}; public session id fully redacted`);

        await captureAccountUi(page, '04-desktop', PROOF_VIEWPORTS.desktop, recorder);
        await captureAccountUi(page, '05-mobile', PROOF_VIEWPORTS.mobile, recorder);
        await page.setViewportSize(PROOF_VIEWPORTS.desktop);

        const profileGate = await inPageJson(page, '/academy/api/profile');
        const entitlementGate = await inPageJson(page, '/academy/api/entitlement');
        recorder.record('profile and entitlement remain closed before Google',
            profileGate.status === 401 && entitlementGate.status === 401 ? 'pass' : 'fail',
            `profile ${profileGate.status}, entitlement ${entitlementGate.status}`);

        if (publicSessionId) {
            d1Execute(
                `UPDATE sessions SET created_at = ${Date.now() - 9 * 3_600_000}, expires_at = ${Date.now() - 3_600_000} `
                + `WHERE public_id = ${uuidSql(publicSessionId)};`,
            );
            const expired = await inPageJson(page, '/academy/api/session');
            const beforeResume = (await context.cookies(ORIGIN)).find(cookie => cookie.name === '__Host-academy_session')?.value ?? '';
            if (beforeResume) recorder.secret(beforeResume);
            const resumed = await inPageJson(page, '/academy/api/session/resume', { method: 'POST' });
            const afterResume = (await context.cookies(ORIGIN)).find(cookie => cookie.name === '__Host-academy_session')?.value ?? '';
            if (afterResume) recorder.secret(afterResume);
            const afterRotate = await inPageJson(page, '/academy/api/session');
            const resumeOk = expired.status === 401
                && resumed.status === 200
                && resumed.body?.expiresAt > Date.now()
                && beforeResume !== afterResume
                && afterRotate.status === 200;
            recorder.record('expired session resumes with cookie rotation inside the fixed window', resumeOk ? 'pass' : 'fail',
                `expired GET ${expired.status}, resume ${resumed.status}, rotated: ${beforeResume !== afterResume}, final GET ${afterRotate.status}`);
        }

        const oidc = await requestOidcStart(context);
        recorder.record('Google OIDC start uses state, nonce, and S256 PKCE', oidcStartIsValid(oidc.status, oidc.location) ? 'pass' : 'fail', `status ${oidc.status}`);
        recorder.record('Google callback binds the paid session to a real account', 'blocked', 'requires a real Google provider sign-in; the harness does not synthesize identity tokens');
        recorder.record('paid entitlement is active on the linked account', 'blocked', 'depends on the blocked real Google callback');

        const recoveryContext = await browser.newContext({ viewport: PROOF_VIEWPORTS.mobile });
        resources.contexts.push(recoveryContext);
        const recovery = await requestJson(recoveryContext, '/academy/api/auth/google/recovery', { method: 'POST', body: {} });
        const recoverySessionId = typeof recovery.body?.sessionId === 'string' ? recorder.secret(recovery.body.sessionId) : '';
        if (recoverySessionId) cleanup.sessionIds.add(recoverySessionId);
        const recoverySession = await requestJson(recoveryContext, '/academy/api/session');
        const recoveryOidc = recovery.status === 201 ? await requestOidcStart(recoveryContext) : { status: 0, location: '' };
        const recoveryStarted = recovery.status === 201
            && recovery.body?.accountRequired === true
            && recoverySession.status === 200
            && oidcStartIsValid(recoveryOidc.status, recoveryOidc.location);
        recorder.record('account recovery creates an auth-only session and valid OIDC start', recoveryStarted ? 'pass' : 'fail',
            `recovery ${recovery.status}, session ${recoverySession.status}, OIDC ${recoveryOidc.status}`);
        recorder.record('known-account recovery and unknown-subject rejection', 'blocked', 'both require valid Google callbacks from real provider subjects; no callback was forged');

        await proveOptionalOneUseClass(browser, resources, recorder, cleanup);
        recorder.record('duplicate signed Stripe webhook delivery is idempotent', 'blocked', 'Stripe did not redeliver during this run and the signing secret is not consumed by the harness; covered by the local Worker test suite only');
    } catch (error) {
        recorder.record('runner aborted', 'fail', error instanceof Error ? error.message : String(error));
    } finally {
        if (claimObserver) await claimObserver.dispose().catch(() => undefined);
        await cleanupRun(browser, resources, cleanup, recorder);
    }

    const summary = summarizeProof(recorder.results);
    writeFileSync(resolve(EVIDENCE_DIR, 'live-proof-results.json'), `${JSON.stringify({
        origin: ORIGIN,
        ranAt: new Date().toISOString(),
        summary,
        results: recorder.results,
    }, null, 2)}\n`);
    console.log(`\n${summary.complete ? 'LIVE PROOF PASSED' : 'LIVE PROOF INCOMPLETE'} - evidence in ${EVIDENCE_DIR}`);
    return summary.complete ? 0 : 1;
}

const directRun = process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (directRun) process.exitCode = await main();
