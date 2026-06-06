#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    ankiActions,
    arrayParam,
    assert,
    createAnkiSmokeSettings,
    createSmokePaths,
    DEFAULT_ANKI_CONNECT_URL,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockAnkiConnectResponse,
    mockJpdbParseFromVocabulary,
    newAutoClosingPage,
    readAnkiStatusStorage,
    readJsonBody,
    resolveAnkiAction,
    routeMockedHttpRequests,
    YOMU_SETTINGS_KEY,
} from './smoke-harness.mjs';

const {
    artifacts: ARTIFACTS,
    scriptPath: SCRIPT_PATH,
    cssPath: CSS_PATH,
} = createSmokePaths(import.meta.dirname);
const SETTINGS_KEY = YOMU_SETTINGS_KEY;
const ANKI_URL = DEFAULT_ANKI_CONNECT_URL;
const JPDB_API_ORIGIN = 'https://jpdb.io';
const JPDB_API_PREFIX = '/api/v1/';
const TARGET_URL = process.env.YOMU_WIKIPEDIA_URL || 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E';
const EXISTING_ANKI_SELECTOR = '.jpdb-reader-popover .jpdb-reader-anki-existing';
const EXISTING_WIKIPEDIA_TERMS = ['Japanese language', 'Mining', '14'];
const WHOLE_COLLECTION_QUERY = 'deck:*';
const WHOLE_COLLECTION_SEARCH_ACTIONS = new Set(['findCards', 'findNotes']);

const settings = createAnkiSmokeSettings();

const vocabulary = [
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 250],
    ['日本', '日本', 'にほん', 'Japan', ['n'], 120],
    ['言語', '言語', 'げんご', 'language', ['n'], 620],
    ['漢字', '漢字', 'かんじ', 'kanji', ['n'], 900],
    ['文字', '文字', 'もじ', 'character', ['n'], 780],
    ['文法', '文法', 'ぶんぽう', 'grammar', ['n'], 1800],
];

const WIKIPEDIA_ANKI_HANDLERS = {
    version: () => 6,
    deckNames: () => ['Mining'],
    getDeckStats: () => ({ 1: { name: 'Mining', total_in_deck: 1 } }),
    findCards: findWikipediaCards,
    findNotes: findWikipediaNotes,
    notesInfo: params => arrayParam(params.notes).map(() => mockWikipediaNoteInfo()),
    cardsInfo: params => arrayParam(params.cards).map(() => mockWikipediaCardInfo()),
    areDue: params => arrayParam(params.cards).map(() => true),
    modelNames: () => ['Imported Japanese'],
    modelFieldNames: () => ['Word', 'Reading', 'Meaning', 'Sentence'],
    updateNoteFields: () => null,
    guiBrowse: () => null,
    answerCards: () => null,
};

mkdirSync(ARTIFACTS, { recursive: true });

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const { context, page } = await newAutoClosingPage(browser, {
    bypassCSP: true,
    viewport: { width: 1360, height: 900 },
    deviceScaleFactor: 1,
});
const requests = [];

await routeMockedHttpRequests(page, {
    requests,
    mockHttpRequest,
    isMockedApiOrigin,
});

await page.exposeFunction('__yomuAnkiWikipediaRequest', async request => {
    const mocked = mockHttpRequest(request, requests);
    if (!mocked) throw new Error(`Unexpected smoke request: ${request.method ?? 'GET'} ${request.url}`);
    return mocked;
});

await addGmStorageBridgeInitScript(page, {
    key: SETTINGS_KEY,
    value: settings,
    css: readFileSync(CSS_PATH, 'utf8'),
    requestBridgeName: '__yomuAnkiWikipediaRequest',
});

await page.addInitScript(initWikipediaSmokeSampler);

const startedAt = Date.now();
await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
await page.addStyleTag({ path: CSS_PATH });
const coloringStartedAt = Date.now();
await page.addScriptTag({ path: SCRIPT_PATH });

await page.waitForSelector('.jpdb-reader-word', { timeout: 45_000 });
await page.waitForFunction(() => {
    const words = [...document.querySelectorAll('.jpdb-reader-word')]
        .filter(element => element.textContent?.includes('日本語'));
    return words.some(element => element instanceof HTMLElement && element.dataset.ankiState === 'due');
}, null, { timeout: 45_000 });
const firstAnkiColorMs = Date.now() - coloringStartedAt;
await page.waitForFunction(() => {
    return unwrappedVisibleKnownWikipediaSamples().length === 0;
}, null, { timeout: 45_000 }).catch(() => undefined);
const initialAnkiActions = ankiActions(requests);
const initialAnkiActionCount = initialAnkiActions.length;
const initialAnkiRequests = requests.filter(item => item.kind === 'anki').slice(0, initialAnkiActionCount);
const statusStorage = await readAnkiStatusStorage(page);

const firstKnownWord = page.locator('.jpdb-reader-word.anki-due').filter({ hasText: '日本語' }).first();
const beforeClick = await firstKnownWord.evaluate(element => ({
    state: element.dataset.ankiState,
    classes: [...element.classList],
    color: getComputedStyle(element).color,
    title: element.title,
}));
const renderedStyle = await firstKnownWord.evaluate(wikipediaWordStyleSnapshot);
await firstKnownWord.click();
await page.waitForSelector(EXISTING_ANKI_SELECTOR, { timeout: 12_000 });
await waitForSelectorTextIncludesAny(page, EXISTING_ANKI_SELECTOR, EXISTING_WIKIPEDIA_TERMS);
const afterClick = await firstKnownWord.evaluate(element => ({
    state: element.dataset.ankiState,
    classes: [...element.classList],
    color: getComputedStyle(element).color,
    title: element.title,
}));
const popover = await page.evaluate(() => ({
    hasExisting: Boolean(document.querySelector('.jpdb-reader-popover .jpdb-reader-anki-existing')),
    hasAdd: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki"]')),
    hasMerge: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki-merge"]')),
    text: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1000) ?? '',
}));
const pageState = await page.evaluate(() => {
    return {
        url: location.href,
        title: document.title,
        renderedWords: document.querySelectorAll('.jpdb-reader-word').length,
        ankiColoredWords: document.querySelectorAll('.jpdb-reader-word[class*="anki-"]').length,
        japaneseAnkiWords: [...document.querySelectorAll('.jpdb-reader-word')]
            .filter(element => element.textContent?.includes('日本語') && element instanceof HTMLElement && element.dataset.ankiState).length,
        unwrappedVisibleKnownSamples: unwrappedVisibleKnownWikipediaSamples(),
    };
});
const elapsedMs = Date.now() - startedAt;
const clickAnkiActions = ankiActions(requests).slice(initialAnkiActionCount);

const viewportSamples = [];
for (const scrollY of [0, 650, 1200, 1800, 2600]) {
    await page.evaluate(y => window.scrollTo({ top: y, left: 0, behavior: 'instant' }), scrollY);
    await page.waitForTimeout(120);
    await page.waitForFunction(() => unwrappedVisibleKnownWikipediaSamples().length === 0, null, { timeout: 12_000 }).catch(() => undefined);
    viewportSamples.push({
        scrollY,
        samples: await page.evaluate(() => unwrappedVisibleKnownWikipediaSamples()),
    });
}

assert(beforeClick.state === 'due' && afterClick.state === 'due', 'Click cleared rendered Anki state', { beforeClick, afterClick });
assert(afterClick.classes.includes('anki-due'), 'Click removed rendered Anki due class', { beforeClick, afterClick });
assert(afterClick.color === beforeClick.color, 'Click changed Anki word color', { beforeClick, afterClick });
assert(renderedStyle.hasRuby, 'Wikipedia rendered word did not keep ruby/furigana markup', renderedStyle);
assert(renderedStyle.pitchClass, 'Wikipedia rendered word did not keep pitch styling class', renderedStyle);
assert(renderedStyle.statusClass || renderedStyle.ankiState, 'Wikipedia rendered word did not keep status identity', renderedStyle);
assert(renderedStyle.isColored || renderedStyle.sourceClass, 'Wikipedia rendered word did not keep color/source styling', renderedStyle);
assert(popover.hasExisting, 'Existing Anki section was missing from Wikipedia popover', popover);
assert(popover.hasMerge, 'Existing Anki popover did not expose merge', popover);
assert(!popover.hasAdd, 'Known Anki word showed Add to Anki on Wikipedia', popover);
assert(pageState.renderedWords > 0 && pageState.ankiColoredWords > 0, 'Wikipedia page did not render Anki-colored words', pageState);
assert(pageState.unwrappedVisibleKnownSamples.length === 0, 'Wikipedia left visible mocked vocabulary unwrapped on initial scan', pageState);
assert(viewportSamples.every(item => item.samples.length === 0), 'Wikipedia left mocked vocabulary unwrapped after scrolling into view', { viewportSamples });
assert(firstAnkiColorMs < 15_000, 'Wikipedia Anki coloring was not prompt after userscript injection', { firstAnkiColorMs, initialAnkiActions });
assert(
    initialAnkiActions.includes('multi') && initialAnkiActions.includes('notesInfo') && initialAnkiActions.includes('cardsInfo'),
    'Wikipedia initial coloring did not perform exact Anki status lookup',
    { initialAnkiActions },
);
assert(
    !initialAnkiRequests.some(isWholeCollectionSearch),
    'Wikipedia initial coloring scanned the whole Anki collection before interaction',
    { initialAnkiRequests },
);
assert(clickAnkiActions.includes('multi') && clickAnkiActions.includes('areDue'), 'Wikipedia click did not lazily hydrate detailed Anki status', { initialAnkiActions, clickAnkiActions });
assert(statusStorage.cardCount >= 1 && statusStorage.entryCount >= 1, 'Wikipedia Anki status index did not store mocked cards', statusStorage);

await page.screenshot({ path: path.join(ARTIFACTS, 'anki-wikipedia-smoke.png'), fullPage: false });
const report = {
    target: TARGET_URL,
    elapsedMs,
    firstAnkiColorMs,
    pageState,
    viewportSamples,
    popover,
    renderedStyle,
    statusStorage,
    initialAnkiActions,
    clickAnkiActions,
    ankiActions: ankiActions(requests),
    jpdbEndpoints: requests.filter(item => item.kind === 'jpdb').map(item => item.endpoint),
};
writeFileSync(path.join(ARTIFACTS, 'anki-wikipedia-smoke.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await context.close();
await browser.close();

function initWikipediaSmokeSampler() {
    const knownTerms = ['日本語', '日本', '言語', '漢字', '文字', '文法'];
    const ignoredSelector = '.jpdb-reader-word,[data-jpdb-reader-root],script,style,noscript,a[href],button,input,textarea,select,sup.reference,.mw-editsection,.vector-page-toolbar,.vector-toc,.toc,.navbox,.metadata,.legend,.noprint';

    window.unwrappedVisibleKnownWikipediaSamples = () => {
        const root = document.querySelector('#mw-content-text');
        return root ? collectVisibleKnownSamples(root) : [];
    };

    function collectVisibleKnownSamples(root) {
        const samples = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode });
        for (let node = walker.nextNode(); node && samples.length < 8; node = walker.nextNode()) {
            const sample = sampleTextNode(node);
            if (sample) samples.push(sample);
        }
        return samples;
    }

    function acceptNode(node) {
        const parent = node.parentElement;
        return isAcceptedTextNode(node, parent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }

    function isAcceptedTextNode(node, parent) {
        const checks = [
            hasSamplerParent,
            isNotIgnoredSamplerElement,
            isVisibleSamplerElement,
            textNodeHasKnownTerm,
        ];
        return checks.every(check => check(node, parent));
    }

    function hasSamplerParent(_node, parent) {
        return Boolean(parent);
    }

    function isNotIgnoredSamplerElement(_node, parent) {
        return !parent.closest(ignoredSelector);
    }

    function isVisibleSamplerElement(_node, parent) {
        return isVisibleForSmoke(parent);
    }

    function textNodeHasKnownTerm(node) {
        const text = node.nodeValue ?? '';
        return knownTerms.some(term => text.includes(term));
    }

    function sampleTextNode(node) {
        const text = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
        const term = knownTerms.find(value => text.includes(value));
        if (!term) return null;
        const parent = node.parentElement;
        const ancestor = parent ? parent.closest('p,li,td,th,figcaption,section,div') : null;
        return {
            term,
            text: text.slice(0, 160),
            parentTag: elementTag(parent),
            parentClass: elementClass(parent),
            ancestor: elementTag(ancestor),
            ancestorClass: elementClass(ancestor),
        };
    }

    function elementTag(element) {
        return element ? element.tagName : '';
    }

    function elementClass(element) {
        return element ? String(element.className) : '';
    }

    function isVisibleForSmoke(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return hasVisibleBox(rect) && hasVisibleStyle(style);
    }

    function hasVisibleBox(rect) {
        return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
    }

    function hasVisibleStyle(style) {
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
    }
}

function wikipediaWordStyleSnapshot(element) {
    const classes = [...element.classList];
    const style = getComputedStyle(element);
    const host = element.closest('p,li,td,th,section,article,main,body') ?? element.parentElement;
    const hostColor = host ? getComputedStyle(host).color : '';
    return {
        text: element.textContent?.replace(/\s+/g, '').trim() ?? '',
        ankiState: element.dataset.ankiState ?? '',
        statusClass: classes.find(className => /^(?:anki-|jpdb-(?:known|learning|due|new|never-forget|failed|locked|not-in-deck))/.test(className)) ?? '',
        pitchClass: classes.find(className => /^jpdb-pitch-/.test(className)) ?? '',
        sourceClass: classes.find(className => /^jpdb-reader-word-(?:text|highlight|underline)-/.test(className)) ?? '',
        hasRuby: Boolean(element.querySelector('ruby,rt,.jpdb-reader-furi,.jpdb-reader-ruby')),
        color: style.color,
        hostColor,
        textDecorationColor: style.textDecorationColor,
        backgroundColor: style.backgroundColor,
        isColored: style.color !== hostColor || style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.textDecorationColor !== 'rgba(0, 0, 0, 0)',
        classes,
    };
}

function isMockedApiOrigin(url) {
    return url.origin === ANKI_URL || isJpdbApiUrl(url);
}

function mockHttpRequest(request, requests) {
    const url = new URL(request.url);
    return mockWikipediaJpdbRequest(url, request, requests) ?? mockWikipediaAnkiRequest(url, request, requests);
}

function mockWikipediaJpdbRequest(url, request, requests) {
    if (!isJpdbApiUrl(url)) return null;
    const endpoint = url.pathname.slice(JPDB_API_PREFIX.length);
    const body = readJsonBody(request.data);
    requests.push({ kind: 'jpdb', endpoint, body });
    return jsonHttpResponse(mockWikipediaJpdbResponse(endpoint, body));
}

function mockWikipediaJpdbResponse(endpoint, body) {
    return endpoint === 'parse' ? mockJpdbParseFromVocabulary(body, vocabulary) : {};
}

function mockWikipediaAnkiRequest(url, request, requests) {
    if (url.origin !== ANKI_URL) return null;
    const body = readJsonBody(request.data);
    requests.push({ kind: 'anki', action: body.action, params: body.params ?? {} });
    return jsonHttpResponse(mockAnkiConnect(body));
}

function isJpdbApiUrl(url) {
    const { origin, pathname } = url;
    return origin === JPDB_API_ORIGIN && pathname.startsWith(JPDB_API_PREFIX);
}

function mockAnkiConnect(body) {
    return mockAnkiConnectResponse(body, resolveWikipediaAnkiAction);
}

function resolveWikipediaAnkiAction(action, params) {
    return resolveAnkiAction(action, params, WIKIPEDIA_ANKI_HANDLERS);
}

async function waitForSelectorTextIncludesAny(page, selector, terms, timeout = 12_000) {
    await page.waitForFunction(selectorTextIncludesAny, { selector, terms }, { timeout });
}

function selectorTextIncludesAny({ selector, terms }) {
    const text = document.querySelector(selector)?.textContent ?? '';
    return terms.some(term => text.includes(term));
}

function isWholeCollectionSearch(item) {
    return WHOLE_COLLECTION_SEARCH_ACTIONS.has(item.action) && ankiQueryParam(item) === WHOLE_COLLECTION_QUERY;
}

function ankiQueryParam(item) {
    return String(item.params?.query ?? '');
}

function findWikipediaCards(params) {
    const query = String(params.query ?? '');
    if (query === 'deck:*' || query.includes('is:due')) return [8001];
    return [];
}

function findWikipediaNotes(params) {
    const query = String(params.query ?? '');
    if (query === 'deck:*' || /日本語|にほんご/.test(query)) return [9001];
    return [];
}

function mockWikipediaNoteInfo() {
    return {
        noteId: 9001,
        modelName: 'Imported Japanese',
        tags: ['existing'],
        fields: {
            Word: { value: '日本語' },
            Reading: { value: 'にほんご' },
            Meaning: { value: 'Japanese language' },
            Sentence: { value: '日本語の記事を読む。' },
        },
        cards: [8001],
    };
}

function mockWikipediaCardInfo() {
    return {
        cardId: 8001,
        note: 9001,
        deckName: 'Mining',
        queue: 2,
        type: 2,
        reps: 14,
        lapses: 1,
        question: '<div>日本語</div>',
        answer: '<div>Japanese language</div>',
    };
}
