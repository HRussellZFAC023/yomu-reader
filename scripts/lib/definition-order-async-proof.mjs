// Discord 2026-08-03: Jiten appeared first despite the learner's chosen order.
// Drive the built popup with generated local dictionaries and gated public
// Jiten/JPDB fixture responses. Observe every asynchronous render, not just
// the final sort, using priorities saved and reloaded through Study Settings.
import path from 'node:path';
import {
    assert,
    createSmokePaths,
    installGmStorageBridgeOnCurrentPage,
    YOMU_SETTINGS_KEY,
} from './smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './smoke-test-helpers.mjs';
import { seedPageLocalDictionaries } from './lookup-perf-fixture.mjs';
import { writePrefixedGmValues } from './hosted-study-harness.mjs';

const { artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(path.join(import.meta.dirname, '..'));
const JPDB_GLOSS = 'library (JPDB asynchronous fixture)';
const SOURCE_SELECTOR = '[data-source="jiten"], [data-source="jpdb"], [data-source="local-dictionary"]';

export async function proveAsynchronousDefinitionOrder(browser, fixture) {
    const [alpha, beta, gamma] = fixture.dictionaries.map(dictionary => dictionary.title);
    const chosen = [beta, '__jpdb__', '__jiten__', alpha, gamma];
    const scenarios = [
        { id: 'jiten-arrives-first', releases: ['jiten', 'jpdb'], expected: chosen },
        { id: 'jpdb-arrives-first', releases: ['jpdb', 'jiten'], expected: chosen },
        { id: 'jiten-disabled', releases: ['jiten', 'jpdb'], expected: chosen.filter(id => id !== '__jiten__'), disabled: true },
        { id: 'local-source-missing', releases: ['jiten', 'jpdb'], expected: chosen.filter(id => id !== gamma), missing: gamma },
    ];
    const reports = [];
    for (const scenario of scenarios) reports.push(await proveScenario(browser, fixture, scenario));
    return reports;
}

async function proveScenario(browser, fixture, scenario) {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1100, height: 900 } });
    const gates = { jiten: gate(), jpdb: gate() };
    const requested = [];
    const respond = async rawUrl => {
        const url = new URL(rawUrl);
        const source = { 'api.jiten.moe': 'jiten', 'jpdb.io': 'jpdb' }[url.host];
        if (source) {
            requested.push(source);
            await gates[source].promise;
        }
        return source === 'jpdb' ? jpdbResponse(url, fixture.term) : fixture.externalResponse(rawUrl);
    };
    try {
        await context.route(url => url.origin !== fixture.origin, async route => {
            const response = await respond(route.request().url());
            await route.fulfill({ status: response.status, contentType: response.contentType, body: response.responseText, headers: { 'access-control-allow-origin': '*' } });
        });
        const page = await context.newPage();
        await page.exposeFunction(fixture.requestBridgeName, request => respond(request.url));
        await page.goto(`${fixture.origin}${fixture.pagePath}`, { waitUntil: 'domcontentloaded' });
        await seedPageLocalDictionaries(page, fixture.dictionaries.filter(dictionary => dictionary.title !== scenario.missing));
        await writePrefixedGmValues(page, fixture.gmStoragePrefix, scenario.disabled ? fixture.disabledGmValues : fixture.gmValues);
        const popup = await openFixturePopup(page, fixture);
        await popup.locator('[data-source="local-dictionary"]').first().waitFor({ state: 'attached', timeout: 15_000 });
        const localOnly = await popupSources(popup);
        assert(!localOnly.includes('__jiten__'), 'Jiten fixture rendered before its response was released', { scenario: scenario.id, localOnly });
        assert(!localOnly.includes('__jpdb__'), 'JPDB fixture rendered before its response was released', { scenario: scenario.id, localOnly });

        const stages = [{ stage: 'local-before-remote', sources: localOnly }];
        await releaseSources(popup, gates, scenario, stages);
        await popup.locator('[data-source="jpdb"]', { hasText: JPDB_GLOSS }).waitFor({ state: 'attached', timeout: 20_000 });
        await waitForSourceCount(page, scenario.expected.length);
        const sources = await popupSources(popup);
        assert(sameList(sources, scenario.expected), 'Asynchronous popup ignored the saved source order', { scenario: scenario.id, sources, expected: scenario.expected });
        const observed = await assertObservedOrder(page, scenario);
        const screenshot = path.join(ARTIFACTS, `dictionary-order-async-${scenario.id}-${browser.browserType().name()}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });

        // Origin-local dictionaries and the real saved GM settings must agree
        // again when the document/runtime is recreated.
        await page.reload({ waitUntil: 'domcontentloaded' });
        const reloadedPopup = await openFixturePopup(page, fixture);
        await reloadedPopup.locator('[data-source="jpdb"]', { hasText: JPDB_GLOSS }).waitFor({ state: 'attached', timeout: 20_000 });
        if (!scenario.disabled) await reloadedPopup.locator('[data-source="jiten"]').waitFor({ state: 'attached', timeout: 20_000 });
        await waitForSourceCount(page, scenario.expected.length);
        const reloaded = await popupSources(reloadedPopup);
        assert(sameList(reloaded, scenario.expected), 'Popup source order changed after reloading the document', { scenario: scenario.id, reloaded, expected: scenario.expected });
        const reloadedObserved = await assertObservedOrder(page, scenario);
        assert(requested.includes('jpdb'), 'Async fixture did not exercise JPDB transport', requested);
        if (!scenario.disabled) assert(requested.includes('jiten'), 'Async fixture did not exercise Jiten transport', requested);
        return { id: scenario.id, expected: scenario.expected, stages, sources, observed, reloaded, reloadedObserved, requested, screenshot };
    } finally {
        gates.jiten.release();
        gates.jpdb.release();
        await context.close();
    }
}

async function releaseSources(popup, gates, scenario, stages) {
    for (const source of scenario.releases) {
        gates[source].release();
        if (source === 'jiten' && scenario.disabled) continue;
        await popup.locator(`[data-source="${source}"]`).first().waitFor({ state: 'attached', timeout: 20_000 });
        stages.push({ stage: `${source}-released`, sources: await popupSources(popup) });
    }
}

async function openFixturePopup(page, fixture) {
    await installGmStorageBridgeOnCurrentPage(page, {
        key: YOMU_SETTINGS_KEY,
        value: {},
        requestBridgeName: fixture.requestBridgeName,
        storagePrefix: fixture.gmStoragePrefix,
        initialize: 'ifMissing',
    });
    await page.evaluate(selector => {
        window.__yomuDefinitionOrderSnapshots = [];
        new MutationObserver(() => {
            const popup = [...document.querySelectorAll('.jpdb-reader-popover')].at(-1);
            if (!popup) return;
            const sources = [...popup.querySelectorAll(selector)].map(node => node.dataset.source === 'local-dictionary' ? node.dataset.dictionary : `__${node.dataset.source}__`);
            const snapshots = window.__yomuDefinitionOrderSnapshots;
            if (sources.length && JSON.stringify(sources) !== JSON.stringify(snapshots.at(-1))) snapshots.push(sources);
        }).observe(document.body, { subtree: true, childList: true });
    }, SOURCE_SELECTOR);
    await installUserscriptCssResource(page, CSS_PATH);
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    const word = page.locator(`[data-order-sentence] .jpdb-reader-word[data-expression="${fixture.term}"]`).first();
    await word.waitFor({ state: 'visible', timeout: 30_000 });
    await word.click();
    const popup = page.locator('.jpdb-reader-popover').last();
    await popup.waitFor({ state: 'visible', timeout: 15_000 });
    return popup;
}

function popupSources(popup) {
    return popup.locator(SOURCE_SELECTOR).evaluateAll(nodes => nodes.map(node => node.dataset.source === 'local-dictionary' ? node.dataset.dictionary : `__${node.dataset.source}__`));
}

function waitForSourceCount(page, count) {
    return page.waitForFunction(({ selector, expected }) => {
        const popup = [...document.querySelectorAll('.jpdb-reader-popover')].at(-1);
        return popup?.querySelectorAll(selector).length === expected;
    }, { selector: SOURCE_SELECTOR, expected: count }, { timeout: 20_000 });
}

async function assertObservedOrder(page, scenario) {
    const observed = await page.evaluate(() => window.__yomuDefinitionOrderSnapshots);
    for (const snapshot of observed) {
        const expected = scenario.expected.filter(id => snapshot.includes(id));
        assert(sameList(snapshot, expected), 'A transient popup render ignored the saved source order', { scenario: scenario.id, snapshot, expected });
    }
    return observed;
}

function gate() {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    return { promise, release };
}

function sameList(actual, expected) {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

function jpdbResponse(url, term) {
    if (!url.pathname.startsWith('/search') && !url.pathname.startsWith('/vocabulary/')) return { status: 404, contentType: 'text/plain', responseText: '' };
    const href = `/vocabulary/4304301/${encodeURIComponent(term)}/${encodeURIComponent('としょかん')}`;
    return {
        status: 200,
        contentType: 'text/html',
        responseText: `<!doctype html><html lang="en"><head><link rel="canonical" href="https://jpdb.io${href}"></head><body>
<main class="results search"><article class="result vocabulary"><section class="subsection-headword"><div class="primary-spelling"><div class="spelling"><a href="${href}"><ruby>${term}<rt>としょかん</rt></ruby></a></div></div><a class="view-conjugations-link" href="${href}">More details</a></section><section class="subsection-meanings"><div class="part-of-speech"><div>noun</div></div><div class="description">${JPDB_GLOSS}</div></section></article></main></body></html>`,
    };
}
