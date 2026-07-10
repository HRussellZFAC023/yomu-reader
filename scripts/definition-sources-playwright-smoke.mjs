#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const { root: ROOT, dist: DIST, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
const ARTIFACT_DIR = path.join(ARTIFACTS, 'definition-source-matrix-playwright');
const TERM = '復習';
const READING = 'ふくしゅう';
const GLOSS = 'review; revision';
const JITEN_API_KEY = 'ak_jiten-definition-source-smoke';
const JPDB_API_KEY = 'jpdb-definition-source-smoke';
const BUNPRO_TOKEN = 'bunpro-definition-source-smoke';
const NEW_TAB_UI_KEY = 'jpdb-reader-newtab-ui';
const JPDB_VID = 1500800;
const JPDB_SID = 3100;
const JITEN_WORD_ID = 2500800;
const JITEN_READING_INDEX = 0;
const REQUEST_BRIDGE_NAME = '__yomuDefinitionSourcesSmokeRequest';
const POPOVER_PATH = '/definition-source-popover.html';

const BUILT_ARTIFACTS = [
    SCRIPT_PATH,
    CSS_PATH,
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
    path.join(NEWTAB_DIR, 'sw.js'),
];

const STATIC_ROUTES = new Map([
    [POPOVER_PATH, [null, 'text/html; charset=utf-8']],
    ['/newtab', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/index.html', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/app.js', [path.join(NEWTAB_DIR, 'app.js'), 'text/javascript; charset=utf-8']],
    ['/newtab/styles.css', [path.join(NEWTAB_DIR, 'styles.css'), 'text/css; charset=utf-8']],
    ['/newtab/sw.js', [path.join(NEWTAB_DIR, 'sw.js'), 'text/javascript; charset=utf-8']],
    ['/newtab/version.json', [path.join(NEWTAB_DIR, 'version.json'), 'application/json; charset=utf-8']],
    ['/yomu-icon.svg', [path.join(DIST, 'yomu-icon.svg'), 'image/svg+xml']],
    ['/favicon-32x32.png', [path.join(DIST, 'favicon-32x32.png'), 'image/png']],
    ['/favicon-16x16.png', [path.join(DIST, 'favicon-16x16.png'), 'image/png']],
    ['/apple-touch-icon.png', [path.join(DIST, 'apple-touch-icon.png'), 'image/png']],
]);

const SCENARIOS = [
    {
        id: 'keyless-both-on',
        label: 'No API keys, Jiten and JPDB enabled',
        settings: {},
        expect: { jpdb: true, jiten: true, bunpro: false },
    },
    {
        id: 'jiten-key-both-on',
        label: 'Jiten key only, Jiten and JPDB enabled',
        settings: { jitenApiKey: JITEN_API_KEY },
        expect: { jpdb: true, jiten: true, bunpro: false },
    },
    {
        id: 'jpdb-key-both-on',
        label: 'JPDB key only, Jiten and JPDB enabled',
        settings: { apiKey: JPDB_API_KEY },
        expect: { jpdb: true, jiten: true, bunpro: false },
    },
    {
        id: 'both-keys-both-on',
        label: 'Jiten and JPDB keys, Jiten and JPDB enabled',
        settings: { apiKey: JPDB_API_KEY, jitenApiKey: JITEN_API_KEY },
        expect: { jpdb: true, jiten: true, bunpro: false },
    },
    {
        id: 'all-three-sources',
        label: 'Jiten, JPDB, and Bunpro definitions enabled',
        settings: { apiKey: JPDB_API_KEY, jitenApiKey: JITEN_API_KEY, bunproFrontendApiToken: BUNPRO_TOKEN },
        expect: { jpdb: true, jiten: true, bunpro: true },
    },
    {
        id: 'both-keys-jiten-off',
        label: 'Both keys, Jiten dictionary source disabled',
        settings: { apiKey: JPDB_API_KEY, jitenApiKey: JITEN_API_KEY, jitenDefinitionsEnabled: false },
        expect: { jpdb: true, jiten: false, bunpro: false },
    },
    {
        id: 'both-keys-jpdb-off',
        label: 'Both keys, JPDB dictionary source disabled',
        settings: { apiKey: JPDB_API_KEY, jitenApiKey: JITEN_API_KEY, jpdbDefinitionsEnabled: false },
        expect: { jpdb: false, jiten: true, bunpro: false },
    },
];

mkdirSync(ARTIFACT_DIR, { recursive: true });
assertBuiltArtifacts(BUILT_ARTIFACTS, ROOT, 'Run npm run build first.');

const server = await startLoopbackServer(serveRequest, 'Could not bind definition source smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });

try {
    const reports = [];
    const requestedScenario = process.env.YOMU_DEFINITION_SOURCE_SCENARIO?.trim() ?? '';
    for (const scenario of SCENARIOS.filter(item => !requestedScenario || item.id === requestedScenario)) {
        reports.push(await runScenario(browser, server, scenario));
    }
    const report = {
        ok: true,
        term: TERM,
        reading: READING,
        scenarios: reports,
        artifactDir: ARTIFACT_DIR,
    };
    writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

async function runScenario(browser, fixture, scenario) {
    const settings = createSettings(scenario.settings);
    const requestedSurface = process.env.YOMU_DEFINITION_SOURCE_SURFACE?.trim() ?? '';
    const popover = requestedSurface === 'search' ? null : await runPopoverSurface(browser, fixture, scenario, settings);
    const search = requestedSurface === 'popover' ? null : await runSearchSurface(browser, fixture, scenario, settings);
    return {
        id: scenario.id,
        label: scenario.label,
        settings: sourceStateSettings(settings),
        expectedSources: scenario.expect,
        popover,
        search,
    };
}

async function runPopoverSurface(browser, fixture, scenario, settings) {
    const { context, page, requests } = await installPage(browser, scenario, settings, 'popover', { width: 1100, height: 900 });
    try {
        await page.goto(`${fixture.origin}${POPOVER_PATH}?scenario=${scenario.id}`, { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ path: CSS_PATH });
        await page.addScriptTag({ path: SCRIPT_PATH });
        await page.waitForFunction(({ term }) => {
            return Array.from(document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word'))
                .some(node => node.textContent?.includes(term));
        }, { term: TERM }, { timeout: 30_000 });
        await page.locator('[data-smoke-sentence] .jpdb-reader-word', { hasText: TERM }).first().click();
        const popover = page.locator('.jpdb-reader-popover').last();
        await popover.waitFor({ state: 'visible', timeout: 15_000 });
        await waitForSources(popover, scenario.expect);
        await openSourceCards(popover);
        const dom = await popover.evaluate(summarizeSourceDom);
        assertSurface(scenario, dom, requests, 'popover');
        const screenshot = artifactPath(scenario.id, 'popover.png');
        await page.screenshot({ path: screenshot, fullPage: true });
        const domPath = artifactPath(scenario.id, 'popover-dom.json');
        writeFileSync(domPath, JSON.stringify(dom, null, 2));
        return {
            dom,
            requests: summarizeRequests(requests),
            screenshot,
            domPath,
        };
    } finally {
        await context.close();
    }
}

async function runSearchSurface(browser, fixture, scenario, settings) {
    const { context, page, requests } = await installPage(browser, scenario, settings, 'search', { width: 1100, height: 940 });
    try {
        await page.goto(`${fixture.origin}/newtab/index.html?scenario=${scenario.id}`, { waitUntil: 'domcontentloaded' });
        const searchInput = page.locator('[data-newtab-search-input]');
        if (!(await searchInput.isVisible())) {
            await page.locator('[data-newtab-action="mode"][data-mode="search"]').first().click({ timeout: 30_000 });
        }
        await searchInput.fill(TERM);
        await page.locator('[data-newtab-search]').evaluate(form => form.requestSubmit());
        await page.waitForSelector('[data-newtab-search-results]', { timeout: 30_000 });
        const wordButton = page.locator('[data-newtab-action="search-result-word"]', { hasText: TERM }).first();
        await wordButton.waitFor({ state: 'visible', timeout: 30_000 });
        await wordButton.click();
        const detail = page.locator('[data-newtab-search-detail]:not([hidden])').first();
        await detail.waitFor({ state: 'visible', timeout: 15_000 });
        try {
            await waitForSources(detail, scenario.expect);
        } catch (error) {
            const dom = await detail.evaluate(summarizeSourceDom).catch(() => null);
            throw new Error(`${scenario.label} search sources did not settle: ${error instanceof Error ? error.message : String(error)}\n${JSON.stringify({ dom, requests: summarizeRequests(requests) }, null, 2)}`);
        }
        await openSourceCards(detail);
        const dom = await detail.evaluate(summarizeSourceDom);
        assertSurface(scenario, dom, requests, 'search');
        const screenshot = artifactPath(scenario.id, 'search.png');
        await page.screenshot({ path: screenshot, fullPage: true });
        const domPath = artifactPath(scenario.id, 'search-dom.json');
        writeFileSync(domPath, JSON.stringify(dom, null, 2));
        return {
            dom,
            requests: summarizeRequests(requests),
            screenshot,
            domPath,
        };
    } finally {
        await context.close();
    }
}

async function installPage(browser, scenario, settings, surface, viewport) {
    const requests = [];
    const context = await browser.newContext({ bypassCSP: true, viewport });
    const page = await context.newPage();
    if (process.env.SMOKE_DEBUG) {
        page.on('console', message => console.error(`[${scenario.id}:${surface}:console]`, message.type(), message.text().slice(0, 300)));
        page.on('pageerror', error => console.error(`[${scenario.id}:${surface}:pageerror]`, error.message.slice(0, 300)));
    }
    await page.exposeFunction(REQUEST_BRIDGE_NAME, request => handleSmokeRequest(request, scenario, requests, 'gm', surface));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        requestBridgeName: REQUEST_BRIDGE_NAME,
    });
    if (surface === 'search') {
        await page.addInitScript(({ key }) => {
            localStorage.setItem(key, JSON.stringify({
                mode: 'search',
                sort: 'frequency',
                filter: 'all',
                source: 'dictionary',
                revealAnswer: false,
            }));
        }, { key: NEW_TAB_UI_KEY });
    }
    await page.route(/https?:\/\/(?:[^/]*api\.jiten\.moe|[^/]*api\.bunpro\.jp|[^/]*jpdb\.io|[^/]*workers\.dev|audio\.example\.test)\//, route => handleSmokeRoute(route, scenario, requests, surface));
    return { context, page, requests };
}

async function waitForSources(root, expected) {
    if (expected.jpdb) await root.locator('[data-source="jpdb"]').waitFor({ state: 'attached', timeout: 20_000 });
    if (expected.jiten) await root.locator('[data-source="jiten"]').waitFor({ state: 'attached', timeout: 20_000 });
    if (expected.bunpro) await root.locator('[data-source="bunpro"]').waitFor({ state: 'attached', timeout: 20_000 });
    await root.locator('[data-card-details-loading]').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
    await root.page().waitForTimeout(350);
}

async function openSourceCards(root) {
    await root.locator('.jpdb-reader-source-card').evaluateAll(nodes => {
        nodes.forEach(node => {
            if (node instanceof HTMLDetailsElement) node.open = true;
        });
    });
}

function summarizeSourceDom(node) {
    const clean = value => (value ?? '').replace(/\s+/g, ' ').trim();
    const sourceNodes = Array.from(node.querySelectorAll('.jpdb-reader-source-card'));
    const sourceIds = sourceNodes.map(source => source.getAttribute('data-source') ?? '').filter(Boolean);
    const sourceTitles = sourceNodes
        .map(source => clean(source.querySelector('summary, .jpdb-reader-local-title')?.textContent ?? ''))
        .filter(Boolean);
    const jpdb = node.querySelector('[data-source="jpdb"]');
    const jiten = node.querySelector('[data-source="jiten"]');
    const bunpro = node.querySelector('[data-source="bunpro"]');
    const jpdbText = clean(jpdb?.textContent ?? '');
    const jitenText = clean(jiten?.textContent ?? '');
    const bunproText = clean(bunpro?.textContent ?? '');
    return {
        detailText: clean(node.textContent ?? ''),
        sourceIds,
        sourceTitles,
        hasJpdb: Boolean(jpdb),
        hasJiten: Boolean(jiten),
        hasBunpro: Boolean(bunpro),
        jpdbText,
        jitenText,
        bunproText,
        bunproMeaning: bunproText.includes('review; revision'),
        bunproReading: clean(node.textContent ?? '').includes('ふくしゅう'),
        bunproNuance: bunproText.includes('Study again to strengthen memory'),
        bunproAcceptedAnswer: bunproText.includes('to review'),
        hasOpenInBunproButton: Boolean(bunpro?.querySelector('a[href*="bunpro.jp/vocabs/"]')),
        jpdbMeaning: jpdbText.includes('review; revision'),
        jpdbUsedIn: jpdbText.includes('復習会'),
        jpdbComposedOf: jpdbText.includes('again; restore') && jpdbText.includes('learn'),
        jpdbExampleSentence: /毎日.*復習.*する/u.test(jpdbText),
        jpdbAudioButtonCount: jpdb?.querySelectorAll('.jpdb-reader-jpdb-example-audio').length ?? 0,
        jitenMeaning: jitenText.includes('review; revision'),
        jitenReading: jitenText.includes('ふくしゅう'),
        jitenUsedIn: jitenText.includes('復習会'),
        jitenComposedOf: jitenText.includes('again; restore') && jitenText.includes('learn'),
        jitenExampleSentence: /毎日.*復習.*する/u.test(jitenText),
        jitenAudioButtonCount: jiten?.querySelectorAll('.jpdb-reader-jiten-audio').length ?? 0,
        hasJitenLocalFallbackCard: Boolean(jiten?.querySelector('.jpdb-reader-jiten-local-definitions, .jpdb-reader-jiten-local-entry')),
        hasOpenInJitenButton: Boolean(jiten?.querySelector('.jpdb-reader-jiten-external-lookup')) || /Jitenで開く|Open in Jiten/.test(jitenText),
    };
}

function assertSurface(scenario, dom, requests, surface) {
    assert(dom.hasJpdb === scenario.expect.jpdb, `${scenario.label} ${surface}: JPDB source state mismatch`, dom);
    assert(dom.hasJiten === scenario.expect.jiten, `${scenario.label} ${surface}: Jiten source state mismatch`, dom);
    assert(dom.hasBunpro === scenario.expect.bunpro, `${scenario.label} ${surface}: Bunpro source state mismatch`, dom);

    if (scenario.expect.jpdb) {
        assert(dom.jpdbMeaning, `${scenario.label} ${surface}: JPDB source did not render meanings`, dom);
        assert(dom.jpdbUsedIn, `${scenario.label} ${surface}: JPDB source did not render used-in words`, dom);
        assert(dom.jpdbComposedOf, `${scenario.label} ${surface}: JPDB source did not render composed-of words`, dom);
        assert(dom.jpdbExampleSentence, `${scenario.label} ${surface}: JPDB source did not render examples`, dom);
        assert(dom.jpdbAudioButtonCount >= 2, `${scenario.label} ${surface}: JPDB source did not render TTS/audio buttons`, dom);
    }

    if (scenario.expect.jiten) {
        assert(dom.jitenMeaning, `${scenario.label} ${surface}: Jiten source did not render meanings`, dom);
        assert(dom.jitenReading, `${scenario.label} ${surface}: Jiten source did not render reading`, dom);
        assert(dom.jitenUsedIn, `${scenario.label} ${surface}: Jiten source did not render used-in words`, dom);
        assert(dom.jitenComposedOf, `${scenario.label} ${surface}: Jiten source did not render composed-of words`, dom);
        assert(dom.jitenExampleSentence, `${scenario.label} ${surface}: Jiten source did not render examples`, dom);
        assert(dom.jitenAudioButtonCount >= 3, `${scenario.label} ${surface}: Jiten source did not render TTS/audio buttons`, dom);
        assert(!dom.hasJitenLocalFallbackCard, `${scenario.label} ${surface}: Jiten source rendered the old inner fallback card`, dom);
        assert(!dom.hasOpenInJitenButton, `${scenario.label} ${surface}: Jiten source rendered the old Open in Jiten button`, dom);
    }
    if (scenario.expect.bunpro) {
        assert(dom.bunproMeaning, `${scenario.label} ${surface}: Bunpro source did not render meaning`, dom);
        assert(dom.bunproReading, `${scenario.label} ${surface}: Bunpro source did not render reading`, dom);
        assert(dom.bunproNuance, `${scenario.label} ${surface}: Bunpro source did not render nuance`, dom);
        assert(dom.bunproAcceptedAnswer, `${scenario.label} ${surface}: Bunpro source did not render accepted answers`, dom);
        assert(dom.hasOpenInBunproButton, `${scenario.label} ${surface}: Bunpro source did not link to Bunpro`, dom);
    }

    const surfaceRequests = requests.filter(request => request.surface === surface);
    assertRequestAuthState(scenario, surface, surfaceRequests);
}

function assertRequestAuthState(scenario, surface, requests) {
    const settings = createSettings(scenario.settings);
    const jpdbApi = requests.filter(request => request.host === 'jpdb.io' && request.path.startsWith('/api/v1/'));
    if (settings.apiKey) {
        assert(jpdbApi.some(request => request.path.startsWith('/api/v1/parse')), `${scenario.label} ${surface}: JPDB key did not produce a JPDB parse request`, requests);
        assert(jpdbApi.every(request => request.hasAuthorization && request.authorizationScheme === 'Bearer'), `${scenario.label} ${surface}: JPDB API auth state was wrong`, jpdbApi);
    } else {
        assert(jpdbApi.length === 0, `${scenario.label} ${surface}: keyless mode unexpectedly called JPDB API`, jpdbApi);
    }

    const publicJpdb = requests.filter(request => request.host === 'jpdb.io' && !request.path.startsWith('/api/v1/'));
    assert(publicJpdb.every(request => !request.hasAuthorization), `${scenario.label} ${surface}: public JPDB requests should be keyless`, publicJpdb);

    const jitenDefinitionRequests = requests.filter(request => request.host === 'api.jiten.moe'
        && (/\/api\/vocabulary\/search/.test(request.path)
            || /\/api\/vocabulary\/\d+\/\d+\/info/.test(request.path)
            || /\/api\/vocabulary\/\d+\/\d+\/random-example-sentences/.test(request.path)
            || /\/api\/reader\/parse/.test(request.path)));
    if (scenario.expect.jiten) {
        assert(jitenDefinitionRequests.some(request => /\/api\/vocabulary\/\d+\/\d+\/info/.test(request.path)), `${scenario.label} ${surface}: no Jiten info request was recorded`, jitenDefinitionRequests);
        assert(jitenDefinitionRequests.some(request => /\/api\/vocabulary\/\d+\/\d+\/random-example-sentences/.test(request.path)), `${scenario.label} ${surface}: no Jiten examples request was recorded`, jitenDefinitionRequests);
    }
    if (!scenario.expect.jiten) {
        assert(!jitenDefinitionRequests.some(request => /\/api\/vocabulary\/\d+\/\d+\/info/.test(request.path)), `${scenario.label} ${surface}: Jiten source was disabled but info still loaded`, jitenDefinitionRequests);
        assert(!jitenDefinitionRequests.some(request => /\/api\/vocabulary\/\d+\/\d+\/random-example-sentences/.test(request.path)), `${scenario.label} ${surface}: Jiten source was disabled but examples still loaded`, jitenDefinitionRequests);
    }
    assert(jitenDefinitionRequests.every(request => request.hasAuthorization === Boolean(settings.jitenApiKey)), `${scenario.label} ${surface}: Jiten auth state was wrong`, jitenDefinitionRequests);
    const bunproRequests = requests.filter(request => request.host === 'api.bunpro.jp');
    if (scenario.expect.bunpro) {
        assert(bunproRequests.some(request => request.path === '/api/frontend/search/reviewables_v1_1'), `${scenario.label} ${surface}: Bunpro search request was not recorded`, bunproRequests);
        assert(bunproRequests.every(request => request.authorizationScheme === 'Bearer'), `${scenario.label} ${surface}: Bunpro auth state was wrong`, bunproRequests);
    } else {
        assert(bunproRequests.length === 0, `${scenario.label} ${surface}: Bunpro definition loaded without a token`, bunproRequests);
    }
}

function summarizeRequests(requests) {
    return requests.map(({ transport, surface, method, host, path, hasAuthorization, authorizationScheme }) => ({
        transport,
        surface,
        method,
        host,
        path,
        hasAuthorization,
        authorizationScheme,
    }));
}

async function handleSmokeRoute(route, scenario, requests, surface) {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS' && isMockedExternalUrl(url)) {
        await route.fulfill({ status: 204, headers: corsHeaders() });
        return;
    }
    const response = handleSmokeRequest({
        method: request.method(),
        url: request.url(),
        headers: request.headers(),
        data: request.postData() ?? '',
        responseType: 'json',
    }, scenario, requests, 'fetch', surface);
    await route.fulfill({
        status: response.status ?? 200,
        headers: { ...corsHeaders(), ...(response.headers ?? {}) },
        contentType: response.contentType ?? 'application/json; charset=utf-8',
        body: response.responseText ?? response.body ?? '',
    });
}

function handleSmokeRequest(request, scenario, requests, transport, surface) {
    const summary = requestSummary(request, transport, surface);
    requests.push(summary);
    if (summary.host === 'api.jiten.moe') return mockJitenResponse(summary, request);
    if (summary.host === 'api.bunpro.jp') return mockBunproResponse(summary, request);
    if (summary.host === 'jpdb.io') return mockJpdbResponse(summary, request);
    if (summary.host === 'audio.example.test') return { status: 204, responseText: '', contentType: 'text/plain; charset=utf-8' };
    return { status: 503, responseText: '', contentType: 'text/plain; charset=utf-8' };
}

function mockBunproResponse(summary) {
    if (summary.method !== 'POST' || summary.path !== '/api/frontend/search/reviewables_v1_1') return textResponse(404, 'unknown Bunpro endpoint');
    return jsonHttpResponse(bunproSearchPayload());
}

function bunproSearchPayload() {
    return {
        grammar_points: { data: [] },
        vocabs: { data: [{
            id: '77',
            type: 'vocab',
            attributes: {
                id: 77,
                title: TERM,
                kana: READING,
                furigana: READING,
                slug: TERM,
                meaning: GLOSS,
                nuance: 'Study again to strengthen memory',
                nuance_translation: '記憶を強くするためにもう一度勉強する',
                accepted_answers: ['to review'],
                jmdict_pos: ['noun', 'suru verb'],
                jlpt_level: 'n3',
            },
        }] },
    };
}

function mockJpdbResponse(summary, request) {
    if (summary.method === 'POST' && summary.path.startsWith('/api/v1/parse')) {
        const body = readJsonBody(request.data);
        return jsonHttpResponse(mockJpdbParseFromVocabulary(body, [
            [TERM, TERM, READING, GLOSS, ['n', 'vs'], 12435, ['not-in-deck'], ['LHH']],
        ], {
            vocabularyIdBase: JPDB_VID,
            spellingIdBase: JPDB_SID,
        }));
    }
    if (summary.method !== 'GET') return textResponse(405, 'method not allowed');
    if (summary.path.startsWith('/search')) {
        const url = new URL(`https://jpdb.io${summary.path}`);
        const query = normalizeKana(url.searchParams.get('q') ?? '');
        return htmlResponse(query === TERM || query === READING ? publicJpdbHtml() : publicJpdbHtml(false));
    }
    if (summary.path.startsWith('/vocabulary/')) return htmlResponse(publicJpdbHtml());
    return textResponse(404, 'unknown JPDB endpoint');
}

function mockJitenResponse(summary) {
    if (summary.method === 'POST' && summary.path === '/api/reader/parse') {
        return jsonHttpResponse({
            tokens: [[{ wordId: JITEN_WORD_ID, readingIndex: JITEN_READING_INDEX, start: 0, end: TERM.length, length: TERM.length }]],
            vocabulary: [jitenSearchVocabulary()],
        });
    }
    if (summary.method === 'GET' && summary.path.startsWith('/api/vocabulary/search')) {
        return jsonHttpResponse({
            results: [{
                wordId: JITEN_WORD_ID,
                readingIndex: JITEN_READING_INDEX,
                text: TERM,
                rubyText: '復[ふく]習[しゅう]',
                frequencyRank: 12435,
                partsOfSpeech: ['noun', 'suru verb'],
                meanings: [GLOSS],
            }],
        });
    }
    if (summary.method === 'GET' && summary.path === `/api/vocabulary/${JITEN_WORD_ID}/${JITEN_READING_INDEX}/info`) {
        return jsonHttpResponse(jitenVocabularyInfoPayload());
    }
    if (summary.method === 'POST' && summary.path === `/api/vocabulary/${JITEN_WORD_ID}/${JITEN_READING_INDEX}/random-example-sentences`) {
        return jsonHttpResponse(jitenExamplePayload());
    }
    if (summary.path === '/api/reader/ping') return jsonHttpResponse({});
    return textResponse(404, 'unknown Jiten endpoint');
}

function jitenSearchVocabulary() {
    return {
        wordId: JITEN_WORD_ID,
        readingIndex: JITEN_READING_INDEX,
        spelling: TERM,
        reading: '復[ふく]習[しゅう]',
        frequencyRank: 12435,
        partsOfSpeech: ['noun', 'suru verb'],
        meaningsChunks: [[GLOSS]],
        meaningsPartOfSpeech: [['noun']],
        knownState: [],
        pitchAccents: [0],
    };
}

function jitenVocabularyInfoPayload() {
    return {
        wordId: JITEN_WORD_ID,
        mainReading: { text: TERM, readingIndex: JITEN_READING_INDEX, frequencyRank: 12435, usedInMediaAmount: 123 },
        alternativeReadings: [],
        partsOfSpeech: ['noun', 'suru verb'],
        definitions: [{
            senseIndex: 0,
            englishMeanings: [GLOSS],
            pos: ['noun'],
        }],
        pitchAccents: [0],
        knownStates: [],
        composedOf: [{
            wordId: 101,
            readingIndex: 0,
            reading: '復',
            readingFurigana: '復[ふく]',
            mainDefinition: 'again; restore',
            frequencyRank: null,
            matchSurface: '復',
            audioUrls: ['https://audio.example.test/jiten-fuku.mp3'],
        }, {
            wordId: 102,
            readingIndex: 0,
            reading: '習',
            readingFurigana: '習[しゅう]',
            mainDefinition: 'learn',
            frequencyRank: null,
            matchSurface: '習',
            audioUrls: ['https://audio.example.test/jiten-shuu.mp3'],
        }],
        usedIn: [{
            wordId: 103,
            readingIndex: 0,
            reading: '復習会',
            readingFurigana: '復習会[ふくしゅうかい]',
            mainDefinition: 'review session',
            frequencyRank: 32000,
            matchSurface: '復習会',
            audioUrls: ['https://audio.example.test/jiten-fukushukai.mp3'],
        }],
        usedInTotal: 1,
    };
}

function jitenExamplePayload() {
    return [{
        sentenceId: 99,
        text: '毎日復習する。',
        wordPosition: 2,
        wordLength: 2,
        difficulty: null,
        sourceTitle: 'Jiten examples',
        audioUrls: ['https://audio.example.test/jiten-review-sentence.mp3'],
    }];
}

function publicJpdbHtml(includeResult = true) {
    const href = `/vocabulary/${JPDB_VID}/${encodeURIComponent(TERM)}/${encodeURIComponent(READING)}`;
    return `<!doctype html>
        <html lang="en">
            <head>
                <meta charset="utf-8">
                <title>JPDB fixture</title>
                <meta name="description" content="${TERM}（${READING}） — ${GLOSS}">
                <link rel="canonical" href="https://jpdb.io${href}">
            </head>
            <body>
                <main class="results search">
                    ${includeResult ? `
                    <article class="result vocabulary">
                        <section class="subsection-headword">
                            <div class="primary-spelling">
                                <div class="spelling"><a href="${href}"><ruby>${TERM}<rt>${READING}</rt></ruby></a></div>
                            </div>
                            <a class="vocabulary-audio" data-audio="m1/fukushu.mp3+f1/fukushu.mp3" href="#audio">audio</a>
                            <a class="view-conjugations-link" href="${href}">More details</a>
                        </section>
                        <section class="subsection-meanings">
                            <div class="part-of-speech"><div>noun</div><div>suru verb</div></div>
                            <div class="description">${GLOSS}</div>
                        </section>
                        <div class="tags"><span class="tag">Top 12,435</span></div>
                        <section class="subsection-composed-of-vocabulary">
                            <h6 class="subsection-label">Composed of</h6>
                            <div class="subsection">
                                <div><a href="/kanji/復" class="spelling">復</a><div class="description">again; restore</div><span data-audio="m1/fuku.mp3"></span></div>
                                <div><a href="/kanji/習" class="spelling">習</a><div class="description">learn</div><span data-audio="m1/shuu.mp3"></span></div>
                            </div>
                        </section>
                        <section class="subsection-used-in-vocabulary">
                            <h6 class="subsection-label">Used in</h6>
                            <div class="subsection">
                                <div class="used-in">
                                    <a href="/vocabulary/1500801/${encodeURIComponent('復習会')}/${encodeURIComponent('ふくしゅうかい')}" class="jp"><ruby>復習会<rt>ふくしゅうかい</rt></ruby></a>
                                    <div class="description">review session</div>
                                    <span data-audio="m1/fukushukai.mp3+f1/fukushukai.mp3"></span>
                                </div>
                            </div>
                        </section>
                        <section class="subsection-examples">
                            <h6 class="subsection-label">Examples</h6>
                            <div class="subsection">
                                <div class="example">
                                    <span data-audio="m1/example-fukushu.mp3+f1/example-fukushu.mp3"></span>
                                    <div class="sentence"><ruby>毎日<rt>まいにち</rt></ruby><ruby><span class="highlight">復習</span><rt>${READING}</rt></ruby>する。</div>
                                    <div class="translation">I review every day.</div>
                                </div>
                            </div>
                        </section>
                    </article>` : ''}
                </main>
            </body>
        </html>`;
}

function serveRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const route = STATIC_ROUTES.get(url.pathname.replace(/\/+$/, '') || '/');
    if (!route) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    if (route[0] === null) {
        response.writeHead(200, { 'content-type': route[1] });
        response.end(popoverHtml());
        return;
    }
    if (!existsSync(route[0])) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Missing built artifact');
        return;
    }
    serveFile(response, route[0], route[1], request.method ?? 'GET');
}

function popoverHtml() {
    return `<!doctype html>
        <html lang="ja">
            <head>
                <meta charset="utf-8">
                <title>Definition source popover smoke</title>
            </head>
            <body>
                <main style="max-width: 720px; margin: 48px auto; font: 20px/1.8 system-ui, sans-serif;">
                    <h1>${TERM}</h1>
                    <p data-smoke-sentence>${TERM}を毎日する。</p>
                </main>
            </body>
        </html>`;
}

function createSettings(overrides = {}) {
    return {
        onboardingSeen: true,
        newTabEnabled: true,
        newTabSource: 'dictionary',
        newTabParsingEnabled: false,
        newTabFrontSentenceEnabled: false,
        interfaceLanguage: 'ja',
        apiKey: '',
        jitenApiKey: '',
        bunproFrontendApiToken: '',
        bunproFrontendApiTokenExpiresAt: '',
        jpdbDefinitionsEnabled: true,
        jitenDefinitionsEnabled: true,
        bunproDefinitionsEnabled: true,
        jpdbMiningEnabled: false,
        localDictionariesEnabled: false,
        showPitchAccent: false,
        ankiEnabled: false,
        ankiSectionEnabled: false,
        newTabAnkiEnabled: false,
        audioEnabled: false,
        autoPlayAudio: false,
        immersionKitEnabled: false,
        studyTranslationEnabled: false,
        studyGrammarEnabled: false,
        lookupOnClick: true,
        lookupOnHover: false,
        popupActivationMode: 'click',
        showFloatingButton: false,
        enableLogging: Boolean(process.env.SMOKE_DEBUG),
        ...overrides,
    };
}

function sourceStateSettings(settings) {
    return {
        apiKey: settings.apiKey,
        jitenApiKey: settings.jitenApiKey,
        bunproFrontendApiToken: settings.bunproFrontendApiToken ? '[set]' : '',
        jpdbDefinitionsEnabled: settings.jpdbDefinitionsEnabled,
        jitenDefinitionsEnabled: settings.jitenDefinitionsEnabled,
        bunproDefinitionsEnabled: settings.bunproDefinitionsEnabled,
        localDictionariesEnabled: settings.localDictionariesEnabled,
        newTabSource: settings.newTabSource,
        interfaceLanguage: settings.interfaceLanguage,
    };
}

function requestSummary(request, transport, surface) {
    const url = new URL(request.url);
    const authorization = authorizationHeader(request.headers);
    return {
        transport,
        surface,
        method: request.method ?? 'GET',
        url: request.url,
        host: url.host,
        path: `${url.pathname}${url.search}`,
        hasAuthorization: Boolean(authorization),
        authorizationScheme: authorization ? authorization.split(/\s+/)[0] : '',
    };
}

function authorizationHeader(headers = {}) {
    const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'authorization');
    return entry ? String(entry[1]) : '';
}

function artifactPath(scenarioId, filename) {
    return path.join(ARTIFACT_DIR, `${scenarioId}-${filename}`);
}

function normalizeKana(value) {
    return value.replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function isMockedExternalUrl(url) {
    return url.host === 'api.jiten.moe'
        || url.host === 'jpdb.io'
        || url.host === 'api.bunpro.jp'
        || url.host.endsWith('workers.dev')
        || url.host === 'audio.example.test';
}

function htmlResponse(responseText) {
    return { status: 200, responseText, contentType: 'text/html; charset=utf-8' };
}

function textResponse(status, responseText) {
    return { status, responseText, contentType: 'text/plain; charset=utf-8' };
}

function corsHeaders() {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
}
