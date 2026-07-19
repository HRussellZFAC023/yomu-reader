#!/usr/bin/env node
/**
 * Live account/payment proof runner for the deployed Yomu Academy Worker.
 *
 * Exercises the real production surface in Stripe TEST MODE only:
 *   1. donation checkout creation and safe checkout.stripe.com redirect;
 *   2. cancel return and success return with immediate URL scrubbing;
 *   3. a genuine Stripe test-card payment and the real signed webhook
 *      fulfilment behind /academy/api/claim;
 *   4. paid-code exchange into an auth-only session;
 *   5. deliberate session expiry (scoped D1 UPDATE on this run's session row)
 *      followed by /academy/api/session/resume cookie rotation;
 *   6. Google OIDC start redirect validation (state, nonce, S256 PKCE).
 *
 * Secrets, invite codes, cookies, and Stripe identifiers are never printed in
 * full and never written to the evidence report. The £2 donation is a Stripe
 * TEST payment: no real money moves. Run with --live to execute.
 *
 *   node scripts/academy-account-payment-proof.mjs --live
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ORIGIN = process.env.ACADEMY_PROOF_ORIGIN ?? 'https://yomureader.com';
const EVIDENCE_DIR = resolve(process.cwd(), 'docs/academy/evidence/account-payment');
const D1_DATABASE = 'yomu-academy';
const results = [];

function record(step, outcome, detail = '') {
    results.push({ step, outcome, detail, at: new Date().toISOString() });
    console.log(`${outcome === 'pass' ? 'PASS' : outcome === 'info' ? 'INFO' : 'FAIL'}  ${step}${detail ? ` — ${detail}` : ''}`);
}

function redact(value, keep = 6) {
    if (typeof value !== 'string' || value.length <= keep) return '<redacted>';
    return `${value.slice(0, keep)}…(${value.length} chars, redacted)`;
}

async function inPageJson(page, path, init = {}) {
    return page.evaluate(async ({ path, init }) => {
        const response = await fetch(path, {
            credentials: 'include',
            cache: 'no-store',
            ...init,
            headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
        });
        let body = null;
        try { body = await response.json(); } catch { /* non-JSON */ }
        const retryAfter = Number(response.headers.get('retry-after') ?? '0');
        return {
            status: response.status,
            body,
            retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
        };
    }, { path, init });
}

function d1Execute(command) {
    const output = execFileSync('npx', [
        'wrangler', 'd1', 'execute', D1_DATABASE, '--remote', '--json', '--command', command,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const jsonStart = output.indexOf('[');
    return JSON.parse(output.slice(jsonStart));
}

/** The hosted Checkout renders card fields directly or inside Stripe iframes. */
async function findCheckoutField(page, selector, timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const frame of page.frames()) {
            const field = frame.locator(selector).first();
            if (await field.count().catch(() => 0)) {
                if (await field.isVisible().catch(() => false)) return field;
            }
        }
        await page.waitForTimeout(500);
    }
    return null;
}

async function fillStripeCheckout(page) {
    // Newer hosted Checkout hides card fields behind a payment-method accordion.
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
    // Decline Link's save-my-info upsell if it is offered.
    const optOut = await findCheckoutField(page, 'input[name="enableStripePass"]:checked', 1_000);
    if (optOut) await optOut.uncheck().catch(() => undefined);
    const submit = await findCheckoutField(page, 'button[type="submit"], .SubmitButton', 10_000);
    if (!submit) throw new Error('Stripe submit button not found.');
    await submit.click();
}

async function main() {
    if (!process.argv.includes('--live')) {
        console.log('Refusing to run against production without --live.');
        process.exit(2);
    }
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    let failed = false;

    try {
        // 0. Health and access screen.
        const health = await (await fetch(`${ORIGIN}/academy/api/health`)).json();
        record('worker health', health.ok === true ? 'pass' : 'fail');
        await page.goto(`${ORIGIN}/academy/`, { waitUntil: 'networkidle' });
        await page.screenshot({ path: resolve(EVIDENCE_DIR, '01-access-screen.png') });

        // 1. Checkout creation returns only a validated Stripe test URL.
        const checkout = await inPageJson(page, '/academy/api/checkout', {
            method: 'POST',
            body: JSON.stringify({ amountGbp: 2 }),
        });
        const checkoutUrl = checkout.body?.url ?? '';
        // TEST MODE hard gate: the hosted Checkout path embeds the session id,
        // so refuse to touch the payment form unless it is a cs_test_ session.
        const checkoutOk = checkout.status === 200
            && new URL(checkoutUrl).hostname === 'checkout.stripe.com'
            && /\/cs_test_[A-Za-z0-9_]+/u.test(new URL(checkoutUrl).pathname);
        record('checkout session created (test mode, £2)', checkoutOk ? 'pass' : 'fail', `status ${checkout.status}, host+mode ${checkoutOk ? 'checkout.stripe.com cs_test_' : 'UNEXPECTED — refusing to pay'}`);
        if (!checkoutOk) throw new Error('Checkout creation failed or was not verifiably test mode; aborting live proof.');
        const claimCookie = (await context.cookies(ORIGIN)).find(cookie => cookie.name === '__Host-academy_claim');
        record('HttpOnly claim cookie bound to this browser', claimCookie?.httpOnly ? 'pass' : 'fail', claimCookie ? `value ${redact(claimCookie.value, 0)}` : 'missing');

        // 2. Cancel return: Stripe's back link returns to the cancel URL and
        //    the app scrubs the parameter from the address bar.
        await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded' });
        await page.screenshot({ path: resolve(EVIDENCE_DIR, '02-stripe-test-checkout.png') });
        const cancelLink = page.locator(`a[href^="${ORIGIN}"]`).first();
        if (await cancelLink.count()) {
            await cancelLink.click();
            await page.waitForURL(url => url.origin === ORIGIN, { timeout: 30_000 });
        } else {
            await page.goto(`${ORIGIN}/academy/?checkout=cancelled`, { waitUntil: 'domcontentloaded' });
        }
        const sawCancelParam = page.url().includes('checkout=cancelled');
        await page.waitForFunction(() => !window.location.search.includes('checkout'), null, { timeout: 20_000 })
            .catch(() => undefined);
        record('cancel return scrubbed from address bar', page.url().includes('checkout') ? 'fail' : 'pass', `cancel param seen: ${sawCancelParam}`);

        // 3. The same Checkout session stays payable after a cancel return.
        await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded' });
        // Capture the return document request itself: the app scrubs the
        // query from the address bar as soon as it boots, so page.url() after
        // navigation is already too late to observe Stripe's redirect target.
        const returnRequest = page.waitForRequest(
            request => request.isNavigationRequest() && request.url().startsWith(`${ORIGIN}/academy/`),
            { timeout: 120_000 },
        );
        await fillStripeCheckout(page);
        const successUrl = new URL((await returnRequest).url());
        await page.waitForURL(url => url.origin === ORIGIN, { timeout: 120_000 });
        const sessionId = successUrl.searchParams.get('session_id') ?? '';
        record('Stripe test payment redirected to success URL', successUrl.searchParams.get('checkout') === 'success' && sessionId.startsWith('cs_test_') ? 'pass' : 'fail', `session_id ${redact(sessionId, 8)}`);
        await page.waitForFunction(() => !window.location.search.includes('session_id'), null, { timeout: 20_000 }).catch(() => undefined);
        record('success/session_id scrubbed from address bar', page.url().includes('session_id') ? 'fail' : 'pass');
        await page.screenshot({ path: resolve(EVIDENCE_DIR, '03-success-return-scrubbed.png') });

        // 4. Real webhook fulfilment: poll the claim until Stripe's signed
        //    webhook has minted the paid invite.
        let claim = null;
        for (let attempt = 0; attempt < 15; attempt += 1) {
            const response = await inPageJson(page, `/academy/api/claim?session_id=${encodeURIComponent(sessionId)}`);
            if (response.status === 200 && response.body?.status === 'paid') { claim = response.body; break; }
            if (response.status === 429) {
                const retryAfterMs = Math.min((response.retryAfterSeconds ?? 20) * 1_000, 10 * 60_000);
                await new Promise(resolveWait => setTimeout(resolveWait, retryAfterMs));
                continue;
            }
            if (response.status !== 202 && response.status !== 200) { claim = { status: `http ${response.status}` }; break; }
            await new Promise(resolveWait => setTimeout(resolveWait, 5_000));
        }
        const code = typeof claim?.code === 'string' ? claim.code : null;
        record('signed webhook fulfilled and claim returned the paid code', code ? 'pass' : 'fail', code ? `code ${redact(code, 0)}` : `claim ended as ${JSON.stringify(claim)}`);
        if (!code) throw new Error('No paid code claimed; aborting dependent steps.');
        const claimAgain = await inPageJson(page, `/academy/api/claim?session_id=${encodeURIComponent(sessionId)}`);
        record('claim retry is idempotent', claimAgain.status === 200 && claimAgain.body?.code === code ? 'pass' : 'fail');

        // 5. Exchange the paid code for an auth-only session.
        const session = await inPageJson(page, '/academy/api/session', {
            method: 'POST',
            body: JSON.stringify({ code }),
        });
        const publicSessionId = session.body?.sessionId ?? '';
        record('paid code exchanged for auth-only session', session.status === 200 && session.body?.accountRequired === true ? 'pass' : 'fail', `sessionId ${redact(publicSessionId, 8)}`);
        const liveSession = await inPageJson(page, '/academy/api/session');
        record('session cookie authorizes GET /session', liveSession.status === 200 ? 'pass' : 'fail');
        const profileGate = await inPageJson(page, '/academy/api/profile');
        record('no server profile before Google (401 gate)', profileGate.status === 401 ? 'pass' : 'fail', `status ${profileGate.status}`);

        // 6. Expire only this run's session row, then prove live rotation.
        d1Execute(
            `UPDATE sessions SET created_at = ${Date.now() - 9 * 3_600_000}, expires_at = ${Date.now() - 3_600_000} `
            + `WHERE public_id = '${publicSessionId.replaceAll("'", '')}'`,
        );
        const expired = await inPageJson(page, '/academy/api/session');
        record('expired short session refuses GET /session', expired.status === 401 ? 'pass' : 'fail', `status ${expired.status}`);
        const beforeResume = (await context.cookies(ORIGIN)).find(cookie => cookie.name === '__Host-academy_session')?.value ?? '';
        const resumed = await inPageJson(page, '/academy/api/session/resume', { method: 'POST' });
        const afterResume = (await context.cookies(ORIGIN)).find(cookie => cookie.name === '__Host-academy_session')?.value ?? '';
        record('session/resume rotates the cookie within the 30-day window',
            resumed.status === 200 && resumed.body?.expiresAt > Date.now() && afterResume !== beforeResume ? 'pass' : 'fail',
            `status ${resumed.status}, cookie rotated: ${afterResume !== beforeResume}`);
        const afterRotate = await inPageJson(page, '/academy/api/session');
        record('rotated session authorizes again', afterRotate.status === 200 ? 'pass' : 'fail');

        // 7. Google OIDC start: validated redirect only, no sign-in completed.
        const start = await context.request.get(`${ORIGIN}/academy/api/auth/google/start`, {
            maxRedirects: 0,
            headers: { 'sec-fetch-site': 'same-origin' },
        });
        const location = start.headers()['location'] ?? '';
        let oidcOk = false;
        try {
            const authorization = new URL(location);
            oidcOk = start.status() === 302
                && authorization.hostname === 'accounts.google.com'
                && (authorization.searchParams.get('client_id') ?? '').endsWith('.apps.googleusercontent.com')
                && authorization.searchParams.get('code_challenge_method') === 'S256'
                && (authorization.searchParams.get('state') ?? '').length >= 40
                && (authorization.searchParams.get('nonce') ?? '').length >= 40
                && authorization.searchParams.get('redirect_uri') === `${ORIGIN}/academy/api/auth/google/callback`;
        } catch { /* fail below */ }
        record('Google OIDC start issues state+nonce+S256 PKCE to accounts.google.com', oidcOk ? 'pass' : 'fail', `status ${start.status()}`);

        // 8. Clean up the browser-side session. The unredeemed paid invite
        //    minted by this run is disposable and stays unbound.
        const logout = await inPageJson(page, '/academy/api/logout', { method: 'POST' });
        record('logout revokes the proof session', logout.status === 200 ? 'pass' : 'fail');
        await page.screenshot({ path: resolve(EVIDENCE_DIR, '04-final-state.png') });
    } catch (error) {
        failed = true;
        record('runner aborted', 'fail', String(error?.message ?? error));
    } finally {
        await browser.close();
    }

    failed ||= results.some(result => result.outcome === 'fail');
    writeFileSync(resolve(EVIDENCE_DIR, 'live-proof-results.json'), `${JSON.stringify({ origin: ORIGIN, ranAt: new Date().toISOString(), results }, null, 2)}\n`);
    console.log(`\n${failed ? 'LIVE PROOF FAILED' : 'LIVE PROOF PASSED'} — evidence in ${EVIDENCE_DIR}`);
    process.exit(failed ? 1 : 0);
}

await main();
