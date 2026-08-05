#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    corsHeaders,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';
import { assertPopoverHeadwordMatchesLookup } from './lib/smoke-wait-helpers.mjs';

const { root: ROOT, dist: DIST, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
const ARTIFACT_DIR = path.join(ARTIFACTS, 'definition-source-matrix-playwright');
const TERM = '復習';
const READING = 'ふくしゅう';
const GLOSS = 'review; revision';
const JITEN_API_KEY = 'ak_jiten-definition-source-smoke';
const JPDB_API_KEY = 'jpdb-definition-source-smoke';
const BUNPRO_TOKEN = 'bunpro-definition-source-smoke';
const WANIKANI_TOKEN = 'wanikani-definition-source-smoke';
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
        settings: { bunproDefinitionsEnabled: false },
        expect: { jpdb: true, jiten: true, bunpro: false },
    },
    {
        id: 'jiten-key-both-on',
        label: 'Jiten key only, Jiten and JPDB enabled',
        settings: { jitenApiKey: JITEN_API_KEY, bunproDefinitionsEnabled: false },
        expect: { jpdb: true, jiten: true, bunpro: false },
    },
    {
        id: 'jpdb-key-both-on',
        label: 'JPDB key only, Jiten and JPDB enabled',
        settings: { apiKey: JPDB_API_KEY, bunproDefinitionsEnabled: false },
        expect: { jpdb: true, jiten: true, bunpro: false },
    },
    {
        id: 'both-keys-both-on',
        label: 'Jiten and JPDB keys, Jiten and JPDB enabled',
        settings: { apiKey: JPDB_API_KEY, jitenApiKey: JITEN_API_KEY, bunproDefinitionsEnabled: false },
        expect: { jpdb: true, jiten: true, bunpro: false },
    },
    {
        id: 'all-three-sources',
        label: 'Jiten, JPDB, and Bunpro definitions enabled',
        settings: { apiKey: JPDB_API_KEY, jitenApiKey: JITEN_API_KEY, bunproFrontendApiToken: BUNPRO_TOKEN, bunproMiningEnabled: true, showPitchAccent: true },
        expect: { jpdb: true, jiten: true, bunpro: true },
    },
    {
        id: 'all-four-sources',
        label: 'Jiten, JPDB, Bunpro, and WaniKani definitions enabled',
        settings: {
            apiKey: JPDB_API_KEY,
            jitenApiKey: JITEN_API_KEY,
            bunproFrontendApiToken: BUNPRO_TOKEN,
            bunproMiningEnabled: true,
            wanikaniApiToken: WANIKANI_TOKEN,
            wanikaniDefinitionsEnabled: true,
            showPitchAccent: true,
        },
        expect: { jpdb: true, jiten: true, bunpro: true, wanikani: true },
        // The new-tab Study runtime starts its own queue/stats probes; those
        // are covered by the dedicated integration tests. Keep this visual
        // matrix scenario focused on the stable popup definition surface.
        skipSearch: true,
    },
    {
        id: 'anonymous-bunpro',
        label: 'Anonymous Bunpro definitions enabled',
        settings: { bunproDefinitionsEnabled: true, bunproFrontendApiToken: '', showPitchAccent: true },
        expect: { jpdb: true, jiten: true, bunpro: true },
    },
    {
        id: 'both-keys-jiten-off',
        label: 'Both keys, Jiten dictionary source disabled',
        settings: { apiKey: JPDB_API_KEY, jitenApiKey: JITEN_API_KEY, jitenDefinitionsEnabled: false, bunproDefinitionsEnabled: false },
        expect: { jpdb: true, jiten: false, bunpro: false },
    },
    {
        id: 'both-keys-jpdb-off',
        label: 'Both keys, JPDB dictionary source disabled',
        settings: { apiKey: JPDB_API_KEY, jitenApiKey: JITEN_API_KEY, jpdbDefinitionsEnabled: false, bunproDefinitionsEnabled: false },
        expect: { jpdb: false, jiten: true, bunpro: false },
    },
];

mkdirSync(ARTIFACT_DIR, { recursive: true });
assertBuiltArtifacts(BUILT_ARTIFACTS, ROOT, 'Run npm run build first.');
assertBuiltArtifacts(userscriptCompanionPaths(SCRIPT_PATH), ROOT, 'Run npm run build first.');

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
        // fallow-ignore-next-line code-duplication
        artifactDir: ARTIFACT_DIR,
    };
    writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

// fallow-ignore-next-line complexity
async function runScenario(browser, fixture, scenario) {
    const settings = createSettings(scenario.settings);
    const requestedSurface = process.env.YOMU_DEFINITION_SOURCE_SURFACE?.trim() ?? '';
    const popover = requestedSurface === 'search' ? null : await runPopoverSurface(browser, fixture, scenario, settings);
    const search = requestedSurface === 'popover' || scenario.skipSearch ? null : await runSearchSurface(browser, fixture, scenario, settings);
    return {
        id: scenario.id,
        label: scenario.label,
        settings: sourceStateSettings(settings),
        expectedSources: {
            popover: sourceExpectation(scenario, 'popover'),
            search: sourceExpectation(scenario, 'search'),
        },
        popover,
        search,
    };
}

async function runPopoverSurface(browser, fixture, scenario, settings) {
    const { context, page, requests } = await installPage(browser, scenario, settings, 'popover', { width: 1100, height: 900 });
    try {
        await page.goto(`${fixture.origin}${POPOVER_PATH}?scenario=${scenario.id}`, { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ path: CSS_PATH });
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        try {
            await page.waitForFunction(({ term }) => {
                return Array.from(document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word'))
                    .some(node => node.getAttribute('data-expression') === term);
            }, { term: TERM }, { timeout: 30_000 });
        } catch (error) {
            const body = await page.locator('body').evaluate(node => node.innerHTML).catch(() => '');
            throw new Error(`${scenario.label} popover page annotation did not settle: ${error instanceof Error ? error.message : String(error)}\n${JSON.stringify({ body, requests: summarizeRequests(requests) }, null, 2)}`);
        }
        const lookupWord = page.locator(`[data-smoke-sentence] .jpdb-reader-word[data-expression="${TERM}"]`).first();
        await lookupWord.click();
        const popover = page.locator('.jpdb-reader-popover').last();
        await popover.waitFor({ state: 'visible', timeout: 15_000 });
        await assertPopoverHeadwordMatchesLookup(page, lookupWord, { label: `${scenario.label} popover` });
        try {
            await waitForSources(popover, sourceExpectation(scenario, 'popover'));
        } catch (error) {
            const dom = await popover.evaluate(summarizeSourceDom).catch(() => null);
            throw new Error(`${scenario.label} popover sources did not settle: ${error instanceof Error ? error.message : String(error)}\n${JSON.stringify({ dom, requests: summarizeRequests(requests) }, null, 2)}`);
        }
        await openSourceCards(popover);
        await waitForExampleTranslations(popover, sourceExpectation(scenario, 'popover'));
        const dom = await popover.evaluate(summarizeSourceDom);
        assertSurface(scenario, dom, requests, 'popover');
        const bunproMining = scenario.id === 'all-three-sources'
            ? await minePopoverToBunpro(popover, requests)
            : null;
        const wanikaniSource = popover.locator('.yomu-wanikani-source');
        if (await wanikaniSource.count()) await wanikaniSource.scrollIntoViewIfNeeded();
        const screenshot = artifactPath(scenario.id, 'popover.png');
        await page.screenshot({ path: screenshot, fullPage: true });
        const domPath = artifactPath(scenario.id, 'popover-dom.json');
        writeFileSync(domPath, JSON.stringify(dom, null, 2));
        return {
            dom,
            bunproMining,
            requests: summarizeRequests(requests),
            screenshot,
            domPath,
        };
    } finally {
        await context.close();
    }
}

async function minePopoverToBunpro(popover, requests) {
    // The full card-data promise has a four-second fallback and can replace
    // the initial shell. Wait it out so the fixture exercises the stable UI,
    // then expand the same mining drawer a learner would use.
    await popover.page().waitForTimeout(4_500);
    await popover.locator('[data-action="mining-collapse"]').first().click({ force: true });
    const add = popover.locator('.jpdb-reader-mining-title[data-action="deck-picker"]').first();
    await add.waitFor({ state: 'visible', timeout: 10_000 });
    await add.click();
    const picker = popover.locator('[data-add-deck-select]').first();
    await picker.waitFor({ state: 'visible', timeout: 10_000 });
    await picker.selectOption('bunpro:bunpro');
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && !requests.some(request => request.path === '/api/frontend/reviews/update_via_action_type')) {
        await popover.page().waitForTimeout(50);
    }
    const update = requests.find(request => request.path === '/api/frontend/reviews/update_via_action_type');
    assert(update, 'Generic popup did not submit Bunpro mining action', summarizeRequests(requests));
    assert(update.body?.action_type === 'add' && JSON.stringify(update.body?.reviewables) === JSON.stringify([['Vocab', 77]]),
        'Generic popup Bunpro mining payload was incorrect', update.body);
    return { body: update.body };
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
            await waitForSources(detail, sourceExpectation(scenario, 'search'));
        } catch (error) {
            const dom = await detail.evaluate(summarizeSourceDom).catch(() => null);
            throw new Error(`${scenario.label} search sources did not settle: ${error instanceof Error ? error.message : String(error)}\n${JSON.stringify({ dom, requests: summarizeRequests(requests) }, null, 2)}`);
        }
        await openSourceCards(detail);
        await waitForExampleTranslations(detail, sourceExpectation(scenario, 'search'));
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
    await page.route(/https?:\/\/(?:[^/]*api\.jiten\.moe|[^/]*api\.bunpro\.jp|api\.wanikani\.com|[^/]*jpdb\.io|[^/]*workers\.dev|translate\.googleapis\.com|audio\.example\.test)\//, route => handleSmokeRoute(route, scenario, requests, surface));
    return { context, page, requests };
}

// fallow-ignore-next-line complexity
async function waitForSources(root, expected) {
    if (expected.jpdb) await root.locator('[data-source="jpdb"]').waitFor({ state: 'attached', timeout: 20_000 });
    if (expected.jiten) await root.locator('[data-source="jiten"]').waitFor({ state: 'attached', timeout: 20_000 });
    if (expected.bunpro) await root.locator('[data-source="bunpro"]').waitFor({ state: 'attached', timeout: 20_000 });
    if (expected.wanikani) await root.locator('[data-wanikani-definition-mount][data-wanikani-loaded="true"] .yomu-wanikani-source').waitFor({ state: 'attached', timeout: 30_000 });
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

async function waitForExampleTranslations(root, expected) {
    if (!expected.jiten) return;
    await root.locator('[data-example-provider="jiten"] [data-provider-example-translation]:not([hidden])')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });
}

function summarizeSourceDom(node) {
    function clean(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }
    function sourceText(source) {
        return source ? clean(source.textContent) : '';
    }
    function queryCount(source, selector) {
        return source ? source.querySelectorAll(selector).length : 0;
    }
    function hasDescendant(source, selector) {
        return Boolean(source && source.querySelector(selector));
    }
    function sourceId(source) {
        return source.getAttribute('data-source') ?? '';
    }
    function sourceTitle(source) {
        const title = source.querySelector('summary, .jpdb-reader-local-title');
        return title ? clean(title.textContent) : '';
    }
    function exampleFrame(source) {
        if (!source) return null;
        const group = source.querySelector('.jpdb-reader-jpdb-examples-group');
        if (!group) return null;
        const style = getComputedStyle(group);
        return {
            parentClassName: group.parentElement ? group.parentElement.className : '',
            borderTopWidth: Number.parseFloat(style.borderTopWidth),
            borderRadius: Number.parseFloat(style.borderTopLeftRadius),
            backgroundColor: style.backgroundColor,
        };
    }
    function exampleSummary(source) {
        const translations = source
            ? Array.from(source.querySelectorAll('[data-provider-example-translation]'))
            : [];
        const sentenceText = source
            ? Array.from(source.querySelectorAll('[data-provider-example-sentence]')).map(sentence => {
                const clone = sentence.cloneNode(true);
                clone.querySelectorAll('rt, rp').forEach(node => node.remove());
                return clean(clone.textContent);
            }).join(' | ')
            : '';
        return {
            sentenceText,
            rubyCount: queryCount(source, '[data-provider-example-sentence] rt.jpdb-reader-furi'),
            translationText: translations.map(item => clean(item.textContent)).join(' | '),
            translationCount: translations.length,
            translationsBlurred: translations.length > 0
                && translations.every(item => item.getAttribute('data-provider-translation-blurred') === 'true'),
            pendingTranslationCount: translations.filter(item => item.getAttribute('data-provider-translation-pending') === 'true').length,
        };
    }
    function bunproFrequencySummary(root) {
        const pill = root.querySelector('.jpdb-reader-word-pills a[href*="bunpro.jp/search"]');
        if (!pill) return { bunproFrequencyPillText: '', bunproFrequencyPillTitle: '' };
        let title = pill.getAttribute('title');
        if (title === null) title = pill.getAttribute('data-jpdb-reader-native-title');
        return {
            bunproFrequencyPillText: clean(pill.textContent),
            bunproFrequencyPillTitle: clean(title),
        };
    }
    function summarizeBunpro(root, source, examples) {
        const bunproText = sourceText(source);
        const common = {
            bunproText,
            bunproMeaning: bunproText.includes('review; revision'),
            bunproReading: bunproText.includes('ふくしゅう'),
            bunproNuance: bunproText.includes('Study again to strengthen memory'),
            bunproAcceptedAnswer: bunproText.includes('to review'),
            bunproLearnerPos: bunproText.includes('noun'),
            bunproExampleSentence: /毎日.*復習.*する/u.test(examples.sentenceText),
            bunproHasInlineKanaBrackets: /（[ぁ-ゖァ-ヺー・]+）/u.test(bunproText),
            ...bunproFrequencySummary(root),
        };
        if (!source) {
            return {
                ...common,
                bunproRawTags: false,
                bunproExampleReading: false,
                bunproExampleAvailability: '',
                bunproSharedExampleRowCount: 0,
                bunproExampleFrame: null,
                bunproImmersionCardCount: 0,
                bunproParseableRubyCount: 0,
                bunproExampleAudioButtonCount: 0,
                hasOpenInBunproButton: false,
            };
        }
        const exampleGroup = source.querySelector('.jpdb-reader-jpdb-examples-group');
        return {
            ...common,
            bunproRawTags: Array.from(source.querySelectorAll('.jpdb-reader-dict-tag'))
                .some(tag => /^(?:unclassified|n|unc)$/iu.test(clean(tag.textContent))),
            bunproExampleReading: hasDescendant(source, '.jpdb-reader-jpdb-examples-group rt.jpdb-reader-furi'),
            bunproExampleAvailability: exampleGroup ? exampleGroup.getAttribute('data-examples-availability') ?? '' : '',
            bunproSharedExampleRowCount: queryCount(source, '.jpdb-reader-jpdb-examples > .jpdb-reader-jpdb-example'),
            bunproExampleFrame: exampleFrame(source),
            bunproImmersionCardCount: queryCount(source, '.jpdb-reader-example-card'),
            bunproParseableRubyCount: queryCount(source, '.jpdb-reader-local-glossary .jpdb-reader-parseable rt.jpdb-reader-furi'),
            bunproExampleAudioButtonCount: queryCount(source, '.jpdb-reader-jpdb-example-audio'),
            hasOpenInBunproButton: hasDescendant(source, 'a[href*="bunpro.jp/vocabs/"]'),
        };
    }
    const sourceNodes = Array.from(node.querySelectorAll('.jpdb-reader-source-card'));
    const sourceIds = sourceNodes.map(sourceId).filter(Boolean);
    const sourceTitles = sourceNodes.map(sourceTitle).filter(Boolean);
    const jpdb = node.querySelector('[data-source="jpdb"]');
    const jiten = node.querySelector('[data-source="jiten"]');
    const bunpro = node.querySelector('[data-source="bunpro"]');
    const wanikani = node.querySelector('.yomu-wanikani-source');
    const jpdbText = sourceText(jpdb);
    const jitenText = sourceText(jiten);
    const jpdbExamples = exampleSummary(jpdb);
    const jitenExamples = exampleSummary(jiten);
    const bunproExamples = exampleSummary(bunpro);
    return {
        detailText: clean(node.textContent),
        sourceIds,
        sourceTitles,
        hasJpdb: Boolean(jpdb),
        hasJiten: Boolean(jiten),
        hasBunpro: Boolean(bunpro),
        hasWanikani: Boolean(wanikani),
        wanikaniText: sourceText(wanikani),
        wanikaniAudioButtonCount: queryCount(wanikani, '[data-action="wanikani-audio"]'),
        jpdbText,
        jitenText,
        ...summarizeBunpro(node, bunpro, bunproExamples),
        jpdbMeaning: jpdbText.includes('review; revision'),
        jpdbUsedIn: jpdbText.includes('復習会'),
        jpdbComposedOf: jpdbText.includes('again; restore') && jpdbText.includes('learn'),
        jpdbExampleSentence: /毎日.*復習.*する/u.test(jpdbExamples.sentenceText),
        jpdbExampleRubyCount: jpdbExamples.rubyCount,
        jpdbTranslationCount: jpdbExamples.translationCount,
        jpdbTranslationsBlurred: jpdbExamples.translationsBlurred,
        jpdbExampleFrame: exampleFrame(jpdb),
        jpdbAudioButtonCount: queryCount(jpdb, '.jpdb-reader-jpdb-example-audio'),
        jitenMeaning: jitenText.includes('review; revision'),
        jitenReading: jitenText.includes('ふくしゅう'),
        jitenUsedIn: jitenText.includes('復習会'),
        jitenComposedOf: jitenText.includes('again; restore') && jitenText.includes('learn'),
        jitenExampleSentence: /毎日.*復習.*する/u.test(jitenExamples.sentenceText),
        jitenExampleRubyCount: jitenExamples.rubyCount,
        jitenTranslationText: jitenExamples.translationText,
        jitenTranslationCount: jitenExamples.translationCount,
        jitenTranslationsBlurred: jitenExamples.translationsBlurred,
        jitenPendingTranslationCount: jitenExamples.pendingTranslationCount,
        jitenExampleFrame: exampleFrame(jiten),
        jitenAudioButtonCount: queryCount(jiten, '.jpdb-reader-jiten-audio'),
        hasJitenLocalFallbackCard: hasDescendant(jiten, '.jpdb-reader-jiten-local-definitions, .jpdb-reader-jiten-local-entry'),
        hasOpenInJitenButton: hasDescendant(jiten, '.jpdb-reader-jiten-external-lookup') || /Jitenで開く|Open in Jiten/.test(jitenText),
        bunproExampleRubyCount: bunproExamples.rubyCount,
        bunproTranslationCount: bunproExamples.translationCount,
        bunproTranslationsBlurred: bunproExamples.translationsBlurred,
    };
}

function assertSurface(scenario, dom, requests, surface) {
    const expected = sourceExpectation(scenario, surface);
    const settings = createSettings(scenario.settings);
    assertSourcePresence(scenario, dom, surface, expected);
    assertJpdbSurface(scenario, dom, surface, expected, settings);
    assertJitenSurface(scenario, dom, surface, expected);
    assertBunproSurface(scenario, dom, surface, expected, settings);
    assertWanikaniSurface(scenario, dom, surface, expected);

    const surfaceRequests = requests.filter(request => request.surface === surface);
    assertRequestAuthState(scenario, surface, surfaceRequests);
}

function assertSourcePresence(scenario, dom, surface, expected) {
    assert(dom.hasJpdb === expected.jpdb, `${scenario.label} ${surface}: JPDB source state mismatch`, dom);
    assert(dom.hasJiten === expected.jiten, `${scenario.label} ${surface}: Jiten source state mismatch`, dom);
    assert(dom.hasBunpro === expected.bunpro, `${scenario.label} ${surface}: Bunpro source state mismatch`, dom);
    assert(dom.hasWanikani === Boolean(expected.wanikani), `${scenario.label} ${surface}: WaniKani source state mismatch`, dom);
}

function assertWanikaniSurface(scenario, dom, surface, expected) {
    if (!expected.wanikani) return;
    for (const text of ['Level 10', 'Guru 1', '100% correct', 'review', 'ふくしゅう', 'Also accepted', 'revision', 'Not accepted', 'Your synonyms', 'Meaning mnemonic', 'Reading mnemonic', 'Context sentences']) {
        assert(dom.wanikaniText.toLowerCase().includes(text.toLowerCase()), `${scenario.label} ${surface}: WaniKani source omitted ${text}`, dom);
    }
    assert(dom.wanikaniAudioButtonCount === 1, `${scenario.label} ${surface}: WaniKani source did not collapse alternate formats for the same pronunciation`, dom);
}

function assertJpdbSurface(scenario, dom, surface, expected, settings) {
    if (!expected.jpdb) return;
    assert(dom.jpdbMeaning, `${scenario.label} ${surface}: JPDB source did not render meanings`, dom);
    if (!settings.apiKey) return;
    assert(dom.jpdbUsedIn, `${scenario.label} ${surface}: credentialed JPDB source did not render used-in words`, dom);
    assert(dom.jpdbComposedOf, `${scenario.label} ${surface}: credentialed JPDB source did not render composed-of words`, dom);
    assert(dom.jpdbExampleSentence, `${scenario.label} ${surface}: credentialed JPDB source did not render examples`, dom);
    assert(dom.jpdbExampleRubyCount >= 2, `${scenario.label} ${surface}: JPDB example did not retain full-sentence furigana`, dom);
    assert(dom.jpdbTranslationCount >= 1 && dom.jpdbTranslationsBlurred, `${scenario.label} ${surface}: JPDB translations were not blurred by default`, dom);
    assert(dom.jpdbAudioButtonCount >= 2, `${scenario.label} ${surface}: credentialed JPDB source did not render TTS/audio buttons`, dom);
}

function assertJitenSurface(scenario, dom, surface, expected) {
    if (!expected.jiten) return;
    assert(dom.jitenMeaning, `${scenario.label} ${surface}: Jiten source did not render meanings`, dom);
    assert(dom.jitenReading, `${scenario.label} ${surface}: Jiten source did not render reading`, dom);
    assert(dom.jitenUsedIn, `${scenario.label} ${surface}: Jiten source did not render used-in words`, dom);
    assert(dom.jitenComposedOf, `${scenario.label} ${surface}: Jiten source did not render composed-of words`, dom);
    assert(dom.jitenExampleSentence, `${scenario.label} ${surface}: Jiten source did not render examples`, dom);
    assert(dom.jitenExampleRubyCount >= 2, `${scenario.label} ${surface}: Jiten example did not receive full-sentence furigana`, dom);
    assert(dom.jitenTranslationCount >= 1 && dom.jitenTranslationsBlurred, `${scenario.label} ${surface}: Jiten translations were not blurred by default`, dom);
    assert(dom.jitenTranslationText.includes('I review every day.'), `${scenario.label} ${surface}: Jiten missing translation was not filled`, dom);
    assert(dom.jitenPendingTranslationCount === 0, `${scenario.label} ${surface}: Jiten translation was still pending`, dom);
    assert(dom.jitenAudioButtonCount >= 3, `${scenario.label} ${surface}: Jiten source did not render TTS/audio buttons`, dom);
    assert(!dom.hasJitenLocalFallbackCard, `${scenario.label} ${surface}: Jiten source rendered the old inner fallback card`, dom);
    assert(!dom.hasOpenInJitenButton, `${scenario.label} ${surface}: Jiten source rendered the old Open in Jiten button`, dom);
}

function assertBunproSurface(scenario, dom, surface, expected, settings) {
    if (!expected.bunpro) return;
    assert(dom.bunproMeaning, `${scenario.label} ${surface}: Bunpro source did not render meaning`, dom);
    assert(dom.bunproNuance, `${scenario.label} ${surface}: Bunpro source did not render nuance`, dom);
    assert(!dom.bunproAcceptedAnswer, `${scenario.label} ${surface}: Bunpro vocabulary repeated review answers`, dom);
    assert(dom.bunproLearnerPos, `${scenario.label} ${surface}: Bunpro source did not render learner-friendly part of speech`, dom);
    assert(!dom.bunproRawTags, `${scenario.label} ${surface}: Bunpro source leaked raw tags`, dom);
    assert(dom.bunproExampleSentence, `${scenario.label} ${surface}: Bunpro source did not render detail examples`, dom);
    assert(dom.bunproExampleAvailability === 'loaded', `${scenario.label} ${surface}: Bunpro example availability was not loaded`, dom);
    assert(dom.bunproSharedExampleRowCount >= 1, `${scenario.label} ${surface}: Bunpro examples did not use the shared Jiten/JPDB row layout`, dom);
    assert(dom.bunproImmersionCardCount === 0, `${scenario.label} ${surface}: Bunpro examples retained immersion-card markup`, dom);
    assertBunproExampleFrame(scenario, dom, surface);
    assert(!dom.bunproHasInlineKanaBrackets, `${scenario.label} ${surface}: Bunpro Japanese text retained inline kana brackets`, dom);
    assertBunproFrequencyEvidence(scenario, dom, surface);
    assert(dom.bunproExampleAudioButtonCount >= 1, `${scenario.label} ${surface}: Bunpro source did not render example audio`, dom);
    assert(dom.bunproExampleRubyCount >= 2, `${scenario.label} ${surface}: Bunpro example did not receive full-sentence furigana`, dom);
    assert(dom.bunproTranslationCount >= 1 && dom.bunproTranslationsBlurred, `${scenario.label} ${surface}: Bunpro translations were not blurred by default`, dom);
    assert(!dom.hasOpenInBunproButton, `${scenario.label} ${surface}: Bunpro source rendered a redundant internal action`, dom);
    if (!settings.bunproFrontendApiToken) return;
    assert(dom.bunproReading, `${scenario.label} ${surface}: credentialed Bunpro source did not render reading`, dom);
    assert(dom.bunproExampleReading, `${scenario.label} ${surface}: credentialed Bunpro example lost its exact upstream reading`, dom);
    assert(dom.bunproParseableRubyCount >= 1, `${scenario.label} ${surface}: credentialed Bunpro Japanese text did not receive Yomu furigana`, dom);
}

function assertBunproExampleFrame(scenario, dom, surface) {
    const frame = dom.bunproExampleFrame;
    assert(frame, `${scenario.label} ${surface}: Bunpro example frame was missing`, dom);
    assert(frame.parentClassName.includes('jpdb-reader-jpdb-extras'), `${scenario.label} ${surface}: Bunpro examples did not use the shared extras container`, dom);
    assert(frame.borderTopWidth === 0, `${scenario.label} ${surface}: Bunpro examples retained a top border`, dom);
    assert(frame.borderRadius === 0, `${scenario.label} ${surface}: Bunpro examples retained rounded corners`, dom);
    assert(dom.jitenExampleFrame, `${scenario.label} ${surface}: Jiten comparison frame was missing`, dom);
    assert(dom.jpdbExampleFrame, `${scenario.label} ${surface}: JPDB comparison frame was missing`, dom);
    assert(frame.backgroundColor === dom.jitenExampleFrame.backgroundColor, `${scenario.label} ${surface}: Bunpro examples did not match Jiten background treatment`, dom);
    assert(frame.backgroundColor === dom.jpdbExampleFrame.backgroundColor, `${scenario.label} ${surface}: Bunpro examples did not match JPDB background treatment`, dom);
}

function assertBunproFrequencyEvidence(scenario, dom, surface) {
    assert(dom.bunproFrequencyPillText.includes('Bunpro #178'), `${scenario.label} ${surface}: Bunpro primary rank was missing`, dom);
    for (const label of ['一般 #178', 'アニメ #793', '小説 #6,182', 'Netflix #778', '辞書 #40,271']) {
        assert(dom.bunproFrequencyPillTitle.includes(label), `${scenario.label} ${surface}: Bunpro tooltip omitted ${label}`, dom);
    }
}

function sourceExpectation(scenario, surface) {
    return surface === 'popover' && scenario.popoverExpect ? scenario.popoverExpect : scenario.expect;
}

function assertRequestAuthState(scenario, surface, requests) {
    const settings = createSettings(scenario.settings);
    assertJpdbRequestAuthState(scenario, surface, requests, settings);
    assertJitenRequestAuthState(scenario, surface, requests, settings);
    assertBunproRequestAuthState(scenario, surface, requests, settings);
    assertWanikaniRequestAuthState(scenario, surface, requests, settings);
}

function assertWanikaniRequestAuthState(scenario, surface, requests, settings) {
    const wanikaniRequests = requests.filter(request => request.host === 'api.wanikani.com');
    if (scenario.expect.wanikani) {
        for (const path of ['/v2/user', '/v2/subjects', '/v2/assignments', '/v2/study_materials', '/v2/review_statistics']) {
            assert(wanikaniRequests.some(request => request.path.startsWith(path)), `${scenario.label} ${surface}: missing WaniKani ${path} request`, wanikaniRequests);
        }
    } else {
        assert(wanikaniRequests.length === 0, `${scenario.label} ${surface}: disabled WaniKani source made a request`, wanikaniRequests);
    }
    assert(wanikaniRequests.every(request => request.hasAuthorization === Boolean(settings.wanikaniApiToken)
        && request.authorizationScheme === 'Bearer'
        && request.wanikaniRevision === '20170710'
        && !request.url.includes(settings.wanikaniApiToken)), `${scenario.label} ${surface}: WaniKani request security headers were wrong`, wanikaniRequests);
}

function assertJpdbRequestAuthState(scenario, surface, requests, settings) {
    const jpdbApi = requests.filter(request => request.host === 'jpdb.io' && request.path.startsWith('/api/v1/'));
    if (settings.apiKey) {
        assert(jpdbApi.some(request => request.path.startsWith('/api/v1/parse')), `${scenario.label} ${surface}: JPDB key did not produce a JPDB parse request`, requests);
        assert(jpdbApi.every(request => request.hasAuthorization && request.authorizationScheme === 'Bearer'), `${scenario.label} ${surface}: JPDB API auth state was wrong`, jpdbApi);
    } else {
        assert(jpdbApi.length === 0, `${scenario.label} ${surface}: keyless mode unexpectedly called JPDB API`, jpdbApi);
    }

    const publicJpdb = requests.filter(request => request.host === 'jpdb.io' && !request.path.startsWith('/api/v1/'));
    assert(publicJpdb.every(request => !request.hasAuthorization), `${scenario.label} ${surface}: public JPDB requests should be keyless`, publicJpdb);
}

function assertJitenRequestAuthState(scenario, surface, requests, settings) {
    const jitenDefinitionRequests = requests.filter(request => request.host === 'api.jiten.moe'
        && (/\/api\/vocabulary\/search/.test(request.path)
            || /\/api\/vocabulary\/\d+\/\d+\/info/.test(request.path)
            || /\/api\/vocabulary\/\d+\/\d+\/random-example-sentences/.test(request.path)
            || /\/api\/reader\/parse/.test(request.path)));
    // The definition card is the traffic for the word the learner LOOKED UP.
    // Annotation hydration reads the same public /info lane for the other words
    // in the sentence and is gated by the parser, not by a definitions toggle,
    // so match on this term's vocabulary id in both directions. Keying on
    // "any id" let the enabled case pass on a neighbour's hydration request and
    // made the disabled case fail on it.
    const lookedUpInfo = jitenDefinitionRequests.filter(request => jitenLookedUpPath(request, 'info'));
    const lookedUpExamples = jitenDefinitionRequests.filter(request => jitenLookedUpPath(request, 'random-example-sentences'));
    if (scenario.expect.jiten) {
        assert(lookedUpInfo.length >= 1, `${scenario.label} ${surface}: no Jiten info request was recorded`, jitenDefinitionRequests);
        assert(lookedUpExamples.length >= 1, `${scenario.label} ${surface}: no Jiten examples request was recorded`, jitenDefinitionRequests);
    } else {
        assert(lookedUpInfo.length === 0, `${scenario.label} ${surface}: Jiten source was disabled but info still loaded`, jitenDefinitionRequests);
        assert(lookedUpExamples.length === 0, `${scenario.label} ${surface}: Jiten source was disabled but examples still loaded`, jitenDefinitionRequests);
    }
    assert(jitenDefinitionRequests.every(request => {
        if (!settings.jitenApiKey) return !request.hasAuthorization;
        // Full-sentence enrichment may hydrate a provisional parsed card via
        // Jiten's public GET /info lane even when the signed-in parser is also
        // active. That public request must remain anonymous; authenticated
        // definition/parser traffic must still carry the ApiKey scheme.
        if (request.method === 'GET'
            && /\/api\/vocabulary\/\d+\/\d+\/info/.test(request.path)
            && !request.hasAuthorization) return true;
        return request.hasAuthorization && request.authorizationScheme === 'ApiKey';
    }), `${scenario.label} ${surface}: Jiten auth state was wrong`, jitenDefinitionRequests);
}

function jitenLookedUpPath(request, endpoint) {
    return request.path === `/api/vocabulary/${JITEN_WORD_ID}/${JITEN_READING_INDEX}/${endpoint}`;
}

function assertBunproRequestAuthState(scenario, surface, requests, settings) {
    const bunproRequests = requests.filter(request => request.host === 'api.bunpro.jp');
    const detailRequests = bunproRequests.filter(request => request.path.startsWith('/api/frontend/reviewables/vocab/'));
    if (scenario.expect.bunpro) {
        assert(bunproRequests.some(request => request.path === '/api/frontend/search/reviewables_v1_1'), `${scenario.label} ${surface}: Bunpro search request was not recorded`, bunproRequests);
        assert(detailRequests.length >= 1, `${scenario.label} ${surface}: Bunpro detail request was not recorded`, bunproRequests);
    } else {
        // Frequency ranks use the same anonymous search + detail endpoints as
        // definition cards. Source absence is asserted from the DOM above;
        // constrain disabled-mode traffic to those public lookup endpoints.
        assert(bunproRequests.every(requestIsPublicBunproFrequencyLookup),
        `${scenario.label} ${surface}: disabled Bunpro definitions made an unexpected request`, bunproRequests);
    }
    const authenticated = Boolean(settings.bunproFrontendApiToken);
    assert(bunproRequests.every(request => hasExpectedBunproAuth(request, authenticated)),
    `${scenario.label} ${surface}: Bunpro auth state was wrong`, bunproRequests);
    const searches = bunproRequests.filter(request => request.path === '/api/frontend/search/reviewables_v1_1');
    assert(searches.every(bunproSearchOmitsPrivateData),
    `${scenario.label} ${surface}: Bunpro search requested private review/bookmark/note data`, searches);
}

function requestIsPublicBunproFrequencyLookup(request) {
    return request.path === '/api/frontend/search/reviewables_v1_1'
        || request.path.startsWith('/api/frontend/reviewables/vocab/');
}

function hasExpectedBunproAuth(request, authenticated) {
    if (request.hasAuthorization !== authenticated) return false;
    if (!authenticated) return true;
    return request.authorizationScheme === 'Bearer';
}

function bunproSearchOmitsPrivateData(request) {
    const options = Object(request.body).options ?? {};
    return [options.include_reviews, options.include_bookmarks, options.include_notes]
        .every(value => value === false);
}

function summarizeRequests(requests) {
    return requests.map(({ transport, surface, method, host, path, hasAuthorization, authorizationScheme, wanikaniRevision }) => ({
        transport,
        surface,
        method,
        host,
        path,
        hasAuthorization,
        authorizationScheme,
        wanikaniRevision,
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

// fallow-ignore-next-line complexity
function handleSmokeRequest(request, scenario, requests, transport, surface) {
    const summary = requestSummary(request, transport, surface);
    requests.push(summary);
    if (summary.host === 'api.jiten.moe') return mockJitenResponse(summary, request);
    if (summary.host === 'api.bunpro.jp') return mockBunproResponse(summary, request);
    if (summary.host === 'api.wanikani.com') return mockWanikaniResponse(summary, request);
    if (summary.host === 'jpdb.io') return mockJpdbResponse(summary, request);
    if (summary.host === 'translate.googleapis.com') return jsonHttpResponse({ sentences: [{ trans: 'I review every day.' }] });
    if (summary.host === 'audio.example.test') return { status: 204, responseText: '', contentType: 'text/plain; charset=utf-8' };
    return { status: 503, responseText: '', contentType: 'text/plain; charset=utf-8' };
}

// fallow-ignore-next-line complexity
function mockWanikaniResponse(summary) {
    if (summary.method !== 'GET') return textResponse(405, 'method not allowed');
    if (summary.path === '/v2/user') {
        return jsonHttpResponse({ object: 'user', data: { id: 'smoke-user', level: 10, subscription: { active: true, type: 'lifetime', max_level_granted: 60, period_ends_at: null } } });
    }
    if (summary.path === '/v2/summary') {
        return jsonHttpResponse({ object: 'report', data: { lessons: [], reviews: [] } });
    }
    if (summary.path.startsWith('/v2/subjects')) {
        const url = new URL(`https://api.wanikani.com${summary.path}`);
        const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).map(Number);
        const data = ids.length ? wanikaniRelatedSubjects().filter(subject => ids.includes(subject.id)) : [wanikaniVocabularySubject()];
        return wanikaniCollection(data);
    }
    if (summary.path.startsWith('/v2/assignments')) return wanikaniCollection([{ id: 700, object: 'assignment', data: { subject_id: 500, srs_stage: 5, available_at: '2026-07-21T18:00:00.000000Z', burned_at: null, unlocked_at: '2026-07-01T12:00:00.000000Z' } }]);
    if (summary.path.startsWith('/v2/study_materials')) return wanikaniCollection([{ id: 701, object: 'study_material', data: { subject_id: 500, meaning_note: 'Remember the review ritual.', reading_note: 'Long vowels stay clear.', meaning_synonyms: ['revision'] } }]);
    if (summary.path.startsWith('/v2/review_statistics')) return wanikaniCollection([{ id: 702, object: 'review_statistic', data: { subject_id: 500, meaning_correct: 8, meaning_incorrect: 0, reading_correct: 8, reading_incorrect: 0, percentage_correct: 100 } }]);
    return textResponse(404, 'unknown WaniKani endpoint');
}

function wanikaniCollection(data) {
    return jsonHttpResponse({ object: 'collection', total_count: data.length, pages: { next_url: null }, data });
}

function wanikaniVocabularySubject() {
    return {
        id: 500,
        object: 'vocabulary',
        data: {
            level: 10,
            slug: TERM,
            characters: TERM,
            document_url: 'https://www.wanikani.com/vocabulary/%E5%BE%A9%E7%BF%92',
            meanings: [{ meaning: 'Review', primary: true, accepted_answer: true }],
            auxiliary_meanings: [
                { meaning: 'revision', type: 'whitelist' },
                { meaning: 'revise', type: 'blacklist' },
            ],
            readings: [{ reading: READING, primary: true, accepted_answer: true }],
            meaning_mnemonic: 'A <radical>review</radical> helps memory.',
            meaning_hint: 'Repeat it tomorrow.',
            reading_mnemonic: 'Say <reading>ふくしゅう</reading> clearly.',
            reading_hint: 'Keep the long vowel.',
            component_subject_ids: [501],
            amalgamation_subject_ids: [502],
            visually_similar_subject_ids: [],
            context_sentences: [{ ja: '毎日復習する。', en: 'Review every day.' }],
            pronunciation_audios: [
                { url: 'https://audio.example.test/wanikani-review.ogg', content_type: 'audio/ogg', metadata: { gender: 'female', source_id: 77, pronunciation: READING, voice_actor_name: 'Kyoko' } },
                { url: 'https://audio.example.test/wanikani-review.mp3', content_type: 'audio/mpeg', metadata: { gender: 'female', source_id: 77, pronunciation: READING, voice_actor_name: 'Kyoko' } },
            ],
            hidden_at: null,
        },
    };
}

function wanikaniRelatedSubjects() {
    const subject = (id, object, characters, meaning) => ({
        id,
        object,
        data: {
            level: 5,
            slug: characters,
            characters,
            document_url: `https://www.wanikani.com/${object}/${encodeURIComponent(characters)}`,
            meanings: [{ meaning, primary: true, accepted_answer: true }],
            auxiliary_meanings: [],
            readings: object === 'radical' ? [] : [{ reading: 'ふく', primary: true, accepted_answer: true, type: 'onyomi' }],
            meaning_mnemonic: '',
            component_subject_ids: [],
            amalgamation_subject_ids: [],
            visually_similar_subject_ids: [],
            context_sentences: [],
            pronunciation_audios: [],
            hidden_at: null,
        },
    });
    return [subject(501, 'kanji', '復', 'Restore'), subject(502, 'vocabulary', '復習会', 'Review meeting')];
}

function mockBunproResponse(summary, request) {
    return mockBunproSearchResponse(summary, request)
        ?? mockBunproDetailResponse(summary)
        ?? mockBunproReviewResponse(summary, request)
        ?? textResponse(404, 'unknown Bunpro endpoint');
}

function mockBunproSearchResponse(summary, request) {
    if (summary.method === 'POST' && summary.path === '/api/frontend/search/reviewables_v1_1') {
        summary.body = readJsonBody(request.data);
        return jsonHttpResponse(bunproSearchPayload());
    }
    return null;
}

function mockBunproDetailResponse(summary) {
    if (summary.method === 'GET' && summary.path.startsWith('/api/frontend/reviewables/vocab/')) {
        return jsonHttpResponse(bunproDetailPayload());
    }
    return null;
}

function mockBunproReviewResponse(summary, request) {
    if (summary.method === 'PATCH' && summary.path === '/api/frontend/reviews/update_via_action_type') {
        summary.body = readJsonBody(request.data);
        return jsonHttpResponse({ ok: true });
    }
    return null;
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
                nuance_translation: '復習（ふくしゅう）は記憶を強くする。',
                accepted_answers: ['to review'],
                jmdict_pos: ['n', 'suru verb'],
                jlpt_level: 'unclassified',
            },
        }] },
    };
}

function bunproDetailPayload() {
    return {
        data: {
            id: '77',
            type: 'vocab',
            attributes: {
                pitch_accent_stress: 'LHHH',
                frequency_general: 178,
                frequency_anime: 793,
                frequency_novels: 6182,
                frequency_netflix: 778,
                frequency_dictionary: 40271,
                female_audio_url: 'https://audio.example.test/bunpro-word-female.mp3',
                male_audio_url: 'https://audio.example.test/bunpro-word-male.mp3',
            },
        },
        included: [{
            id: '7701',
            type: 'study_question',
            attributes: {
                id: 7701,
                content: '毎日<strong>復習（ふくしゅう）</strong>する。',
                translation: 'Review every day.',
                sentence_order: 1,
                female_audio_url: 'https://audio.example.test/bunpro-review.mp3',
            },
        }],
    };
}

function mockJpdbResponse(summary, request) {
    if (summary.method === 'POST' && summary.path.startsWith('/api/v1/parse')) {
        const body = readJsonBody(request.data);
        return jsonHttpResponse(mockJpdbParseFromVocabulary(body, [
            [TERM, TERM, READING, GLOSS, ['n', 'vs'], 12435, ['not-in-deck'], ['LHH']],
            ['毎日', '毎日', 'まいにち', 'every day', ['n'], 100, ['not-in-deck'], ['LHHH']],
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

function mockJitenResponse(summary, request) {
    if (summary.method === 'POST' && summary.path === '/api/reader/parse') {
        const body = readJsonBody(request.data);
        summary.body = body;
        const paragraphs = Array.isArray(body?.text) ? body.text.map(String) : [];
        return jsonHttpResponse({
            tokens: paragraphs.map(jitenParseTokens),
            vocabulary: [jitenSearchVocabulary(), jitenEverydayVocabulary()],
        });
    }
    if (summary.method === 'GET' && summary.path.startsWith('/api/vocabulary/parse')) {
        const url = new URL(`https://api.jiten.moe${summary.path}`);
        const text = url.searchParams.get('text') ?? '';
        return jsonHttpResponse(jitenPublicParseWords(text));
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
    if (summary.method === 'GET' && summary.path === `/api/vocabulary/${JITEN_WORD_ID + 1}/0/info`) {
        return jsonHttpResponse(jitenEverydayVocabularyInfoPayload());
    }
    if (summary.method === 'POST' && summary.path === `/api/vocabulary/${JITEN_WORD_ID}/${JITEN_READING_INDEX}/random-example-sentences`) {
        return jsonHttpResponse(jitenExamplePayload());
    }
    if (summary.path === '/api/reader/ping') return jsonHttpResponse({});
    return textResponse(404, 'unknown Jiten endpoint');
}

function jitenParseTokens(text) {
    return [
        jitenParseToken(text, '毎日', JITEN_WORD_ID + 1),
        jitenParseToken(text, TERM, JITEN_WORD_ID),
    ].filter(Boolean).sort((left, right) => left.start - right.start);
}

function jitenPublicParseWords(text) {
    return [
        text.includes('毎日') ? { wordId: JITEN_WORD_ID + 1, readingIndex: 0, originalText: '毎日' } : null,
        text.includes(TERM) ? { wordId: JITEN_WORD_ID, readingIndex: JITEN_READING_INDEX, originalText: TERM } : null,
    ].filter(Boolean);
}

function jitenParseToken(text, surface, wordId) {
    const start = text.indexOf(surface);
    return start < 0 ? null : {
        wordId,
        readingIndex: 0,
        start,
        end: start + surface.length,
        length: surface.length,
    };
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

function jitenEverydayVocabulary() {
    return {
        wordId: JITEN_WORD_ID + 1,
        readingIndex: 0,
        spelling: '毎日',
        reading: '毎[まい]日[にち]',
        frequencyRank: 100,
        partsOfSpeech: ['noun'],
        meaningsChunks: [['every day']],
        meaningsPartOfSpeech: [['noun']],
        knownState: [],
        pitchAccents: [0],
    };
}

function jitenEverydayVocabularyInfoPayload() {
    return {
        wordId: JITEN_WORD_ID + 1,
        mainReading: { text: '毎[まい]日[にち]', readingIndex: 0, frequencyRank: 100 },
        alternativeReadings: [],
        partsOfSpeech: ['noun'],
        definitions: [{ senseIndex: 0, englishMeanings: ['every day'], pos: ['noun'] }],
        pitchAccents: [0],
        knownStates: [],
        composedOf: [],
        usedIn: [],
    };
}

function jitenVocabularyInfoPayload() {
    return {
        wordId: JITEN_WORD_ID,
        mainReading: { text: '復[ふく]習[しゅう]', readingIndex: JITEN_READING_INDEX, frequencyRank: 12435, usedInMediaAmount: 123 },
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
        wanikaniApiToken: '',
        jpdbDefinitionsEnabled: true,
        jitenDefinitionsEnabled: true,
        bunproDefinitionsEnabled: true,
        bunproMiningEnabled: false,
        wanikaniDefinitionsEnabled: false,
        jpdbMiningEnabled: false,
        localDictionariesEnabled: false,
        showPitchAccent: false,
        ankiEnabled: false,
        yomuLocalSrsEnabled: false,
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
        wanikaniApiToken: settings.wanikaniApiToken ? '[set]' : '',
        jpdbDefinitionsEnabled: settings.jpdbDefinitionsEnabled,
        jitenDefinitionsEnabled: settings.jitenDefinitionsEnabled,
        bunproDefinitionsEnabled: settings.bunproDefinitionsEnabled,
        wanikaniDefinitionsEnabled: settings.wanikaniDefinitionsEnabled,
        localDictionariesEnabled: settings.localDictionariesEnabled,
        newTabSource: settings.newTabSource,
        interfaceLanguage: settings.interfaceLanguage,
    };
}

function requestSummary(request, transport, surface) {
    const url = new URL(request.url);
    const authorization = authorizationHeader(request.headers);
    // fallow-ignore-next-line code-duplication
    return {
        transport,
        surface,
        method: request.method ?? 'GET',
        url: request.url,
        host: url.host,
        path: `${url.pathname}${url.search}`,
        hasAuthorization: Boolean(authorization),
        authorizationScheme: authorization ? authorization.split(/\s+/)[0] : '',
        wanikaniRevision: headerValue(request.headers, 'wanikani-revision'),
    };
}

function authorizationHeader(headers = {}) {
    const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'authorization');
    return entry ? String(entry[1]) : '';
}

function headerValue(headers = {}, name) {
    const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
    return entry ? String(entry[1]) : '';
}

function artifactPath(scenarioId, filename) {
    return path.join(ARTIFACT_DIR, `${scenarioId}-${filename}`);
}

function normalizeKana(value) {
    return value.replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

// fallow-ignore-next-line complexity
function isMockedExternalUrl(url) {
    return url.host === 'api.jiten.moe'
        || url.host === 'jpdb.io'
        || url.host === 'api.bunpro.jp'
        || url.host === 'api.wanikani.com'
        || url.host === 'translate.googleapis.com'
        || url.host.endsWith('workers.dev')
        || url.host === 'audio.example.test';
}

function htmlResponse(responseText) {
    return { status: 200, responseText, contentType: 'text/html; charset=utf-8' };
}

function textResponse(status, responseText) {
    return { status, responseText, contentType: 'text/plain; charset=utf-8' };
}
