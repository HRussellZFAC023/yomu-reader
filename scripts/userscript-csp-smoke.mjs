#!/usr/bin/env node
// Yomu boots and answers local dictionary lookups on pages whose Content
// Security Policy forbids evaluating code: `script-src 'self'`, a nonce-only
// policy shaped like Reddit's, and, as the control, no policy at all.
//
// A userscript manager injects Yomu into the page's own world, where the page's
// policy still governs whatever that code does next: eval, new Function,
// compiling WebAssembly, inline <script> elements, blob: workers. Measured on 4
// October 2026 (ADR-0022): Wasm cannot even be instantiated there under either
// policy, in Chromium, Firefox or WebKit. So the Dictionary Engine stays
// readable TypeScript, and this guard proves the shipped graph still works
// there. No context is created with bypassCSP, and the addScriptTag path other
// smokes use is avoided, since its fallback is a CDP evaluation the policy does
// not govern. The userscript graph runs from an init script at document start,
// in the page world, as a manager runs it.
//
// Per browser and policy it asserts that:
//   - the policy is live in the world Yomu runs in (eval is refused there) and
//     on the page (an inline script without the nonce never runs);
//   - Yomu reaches runtime health "ready" with every companion service;
//   - the local parser annotates the sentence, and a click opens a popup whose
//     local-dictionary card shows the seeded dictionary's gloss;
//   - Yomu itself caused no script-src or worker-src violation.
//
// The dictionary is seeded as a page-local store first, on the same origin
// without a policy, exactly as the lookup-perf gate seeds it.
//
// These are deterministic fixtures for boot and lookup behaviour, not visual QA.
// Nightly, not check:release: it needs all three Playwright browsers and a build.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import {
    assert,
    assertBuiltArtifacts,
    closeServer,
    createSmokePaths,
    gmStorageBridgeInitProgram,
    launchSmokeBrowser,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addUserscriptGraphInitScripts, userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';
import { MINI_LOOKUP_DICTIONARY_TITLE, miniLookupDictionarySettings, seedMiniLookupDictionary } from './lib/lookup-perf-fixture.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const SENTENCE = '図書館で漢字を調べています。';
const LOOKUP_WORD = '漢字';
const LOOKUP_GLOSS = 'kanji';
const NONCE = 'csp-fixture-nonce';
const REQUEST_BRIDGE_NAME = '__yomuCspSmokeRequest';
const BROWSERS = [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]];
const POLICIES = {
    strict: "script-src 'self'",
    // Reddit's shape: nothing by default, scripts only by nonce, inline styles.
    nonce: `default-src 'none'; script-src 'nonce-${NONCE}'; style-src 'unsafe-inline'`,
    none: null,
};

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    showFloatingButton: false,
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    ...miniLookupDictionarySettings(),
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

// First in the init program, so it sees every violation Yomu could cause.
// Tampermonkey runs Yomu in the page's own realm and hands it that window as
// unsafeWindow; without one, Yomu falls back to page-world inline scripts that
// a policy refuses. Under a policy, the eval canary is the one eval violation a
// run may contain. It waits for the parsed document because Chromium applies
// the page's policy to this world only after document start; from then on,
// which is when Yomu annotates and looks words up, eval is refused there.
const PREAMBLE = `(() => {
    const state = { violations: [], evalInYomuWorld: 'unchecked' };
    globalThis.__yomuCspSmoke = state;
    globalThis.unsafeWindow = window;
    document.addEventListener('securitypolicyviolation', event => {
        state.violations.push({
            directive: event.effectiveDirective || event.violatedDirective,
            blocked: String(event.blockedURI || '').slice(0, 80),
            source: String(event.sourceFile || '').slice(0, 80),
            line: event.lineNumber,
        });
    });
    document.addEventListener('DOMContentLoaded', () => {
        try {
            (0, eval)('0');
            state.evalInYomuWorld = 'allowed';
        } catch {
            state.evalInYomuWorld = 'blocked';
        }
    }, { once: true });
})();`;

const PAGE_SCRIPT = "document.documentElement.dataset.pageScript = 'ran';";
const FORBIDDEN_INLINE_SCRIPT = "document.documentElement.dataset.forbiddenInlineScript = 'ran';";

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, ...userscriptCompanionPaths(SCRIPT_PATH)], ROOT, 'Run npm run build first.');
const CSS = readFileSync(CSS_PATH, 'utf8');

const server = await startLoopbackServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/page-script.js') {
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
        return response.end(PAGE_SCRIPT);
    }
    if (pathname === '/seed.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return response.end('<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body></body></html>');
    }
    const policyName = /^\/(strict|nonce|none)\.html$/.exec(pathname)?.[1];
    if (!policyName) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        return response.end('Not found');
    }
    const policy = POLICIES[policyName];
    response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        ...(policy ? { 'content-security-policy': policy } : {}),
    });
    response.end(fixturePage(policyName));
}, 'Could not bind userscript CSP smoke server');

const reports = [];
try {
    for (const [browserName, browserType] of BROWSERS) {
        const browser = await launchSmokeBrowser(browserType, browserName, { headless: true });
        try {
            for (const policyName of Object.keys(POLICIES)) {
                reports.push(await runScenario(browser, browserName, policyName));
                console.log(`[csp-smoke] ${browserName} ${policyName}: PASS`);
            }
        } finally {
            await browser.close().catch(() => undefined);
        }
    }
    writeFileSync(path.join(ARTIFACTS, 'userscript-csp-smoke.json'), `${JSON.stringify({ fixture: true, reports }, null, 2)}\n`);
    console.log(JSON.stringify({ fixture: true, reports }, null, 2));
    console.log('userscript CSP smoke passed');
} finally {
    await closeServer(server);
}

function fixturePage(policyName) {
    // The page's own permitted script proves the page still runs under its
    // policy; the inline one without a nonce proves the policy is enforced.
    const pageScript = policyName === 'nonce'
        ? `<script nonce="${NONCE}">${PAGE_SCRIPT}</script>`
        : '<script src="/page-script.js"></script>';
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>userscript CSP smoke: ${policyName}</title>
${pageScript}
<script>${FORBIDDEN_INLINE_SCRIPT}</script>
</head><body><main style="max-width:720px;margin:48px auto;font:20px/2.4 system-ui,sans-serif"><p data-csp-sentence>${SENTENCE}</p></main></body></html>`;
}

async function runScenario(browser, browserName, policyName) {
    const label = `${browserName} ${policyName}`;
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    try {
        const seeder = await context.newPage();
        await seeder.goto(`${server.origin}/seed.html`, { waitUntil: 'domcontentloaded' });
        await seedMiniLookupDictionary(seeder);
        await seeder.close();

        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(String(error).slice(0, 300)));
        page.on('console', message => {
            if (process.env.SMOKE_DEBUG) console.error(`[${label}] ${message.type()}: ${message.text().slice(0, 300)}`);
            if (message.type() === 'error' && /\bYomu\b/i.test(message.text())) errors.push(message.text().slice(0, 300));
        });
        await page.exposeFunction(REQUEST_BRIDGE_NAME, () => ({ status: 503, responseText: '' }));
        // One program, in order: violation recorder and canary, the GM bridge a
        // manager provides, then the @require graph and core.
        await addUserscriptGraphInitScripts(page, SCRIPT_PATH, {
            prefixContent: `${PREAMBLE}\n;\n${gmStorageBridgeInitProgram({
                key: YOMU_SETTINGS_KEY,
                value: settings,
                css: CSS,
                requestBridgeName: REQUEST_BRIDGE_NAME,
            })}`,
        });
        await page.goto(`${server.origin}/${policyName}.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#jpdb-reader-runtime-owner[data-yomu-runtime-health="ready"]', { state: 'attached', timeout: 20_000 })
            .catch(async error => {
                throw new Error(`${label}: Yomu never reported a ready runtime: ${error.message}\n${JSON.stringify(await bootState(page, errors), null, 2)}`);
            });
        await page.waitForFunction(() => document.querySelectorAll('[data-csp-sentence] .jpdb-reader-word').length >= 3, null, { timeout: 30_000 })
            .catch(async error => {
                throw new Error(`${label}: the sentence was never annotated: ${error.message}\n${JSON.stringify(await bootState(page, errors), null, 2)}`);
            });

        const word = page.locator('[data-csp-sentence] .jpdb-reader-word', { hasText: LOOKUP_WORD }).first();
        await word.click();
        const card = page.locator(`.jpdb-reader-popover [data-source="local-dictionary"][data-dictionary="${MINI_LOOKUP_DICTIONARY_TITLE}"]`).first();
        const gloss = card.locator('[data-definition-translation-text]', { hasText: LOOKUP_GLOSS });
        await gloss.waitFor({ state: 'attached', timeout: 15_000 }).catch(async error => {
            throw new Error(`${label}: the popup showed no local-dictionary gloss for ${LOOKUP_WORD}: ${error.message}\n${JSON.stringify({
                popover: await page.locator('.jpdb-reader-popover').last().textContent().catch(() => null),
                ...await bootState(page, errors),
            }, null, 2)}`);
        });
        // Idle work after the lookup still runs under the policy; give it a
        // moment so a late violation is counted rather than missed.
        await page.waitForTimeout(500);

        const state = await bootState(page, errors);
        const report = {
            browser: browserName,
            policy: policyName,
            csp: POLICIES[policyName],
            ...state,
            gloss: (await gloss.textContent())?.replace(/\s+/g, ' ').trim() ?? '',
        };
        assertScenario(label, policyName, report);
        return report;
    } finally {
        await context.close();
    }
}

async function bootState(page, errors) {
    const state = await page.evaluate(() => {
        const marker = document.getElementById('jpdb-reader-runtime-owner');
        const smoke = globalThis.__yomuCspSmoke ?? { violations: [], evalInYomuWorld: 'missing' };
        return {
            runtimeKind: marker?.getAttribute('data-yomu-runtime-kind') ?? '',
            runtimeHealth: marker?.getAttribute('data-yomu-runtime-health') ?? '',
            missingServices: marker?.getAttribute('data-yomu-runtime-missing-services') ?? '',
            annotatedWords: document.querySelectorAll('[data-csp-sentence] .jpdb-reader-word').length,
            pageScript: document.documentElement.dataset.pageScript ?? '',
            forbiddenInlineScript: document.documentElement.dataset.forbiddenInlineScript ?? '',
            evalInYomuWorld: smoke.evalInYomuWorld,
            violations: smoke.violations,
        };
    });
    return { ...state, errors: [...errors] };
}

function assertScenario(label, policyName, report) {
    const enforced = policyName !== 'none';
    assert(report.pageScript === 'ran', `${label}: the page's own permitted script did not run`, report);
    assert(report.forbiddenInlineScript === (enforced ? '' : 'ran'), `${label}: the fixture policy is not what this smoke claims`, report);
    assert(report.evalInYomuWorld === (enforced ? 'blocked' : 'allowed'), `${label}: the policy does not reach the world Yomu runs in`, report);
    assert(report.runtimeKind === 'userscript', `${label}: the built artifact did not claim the userscript runtime`, report);
    assert(report.runtimeHealth === 'ready' && report.missingServices === '', `${label}: the runtime is missing companion services`, report);
    assert(report.gloss.includes(LOOKUP_GLOSS), `${label}: the local-dictionary card did not show the seeded gloss`, report);
    assert(report.errors.length === 0, `${label}: Yomu reported errors`, report);
    // Only the fixture's own two refusals are expected: the canary's eval and
    // the inline script without a nonce. Anything else under script-src or
    // worker-src was Yomu asking the page for code it may not run.
    const scriptViolations = report.violations.filter(violation => /^(script-src|worker-src)/.test(violation.directive));
    const expected = enforced ? ['eval', 'inline'] : [];
    const unexpected = [...scriptViolations];
    for (const blocked of expected) {
        const index = unexpected.findIndex(violation => violation.blocked === blocked);
        if (index >= 0) unexpected.splice(index, 1);
    }
    assert(unexpected.length === 0, `${label}: Yomu caused a script-src or worker-src violation`, { unexpected, report });
}
