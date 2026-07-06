#!/usr/bin/env node
// Live-site smoke: inject the built userscript into real ecommerce pages and
// assert all-furigana scans keep compact product/menu/review layouts readable.
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    jsonHttpResponse,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT, artifacts: ARTIFACTS } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT);
mkdirSync(ARTIFACTS, { recursive: true });

const REQUEST_BRIDGE = '__yomuLiveFuriganaLayoutRequest';
const JPDB_API_ORIGIN = 'https://jpdb.io';
const JPDB_API_PREFIX = '/api/v1/';
const JITEN_API_ORIGIN = 'https://api.jiten.moe';
const JITEN_API_PREFIX = '/api/';

const SETTINGS = {
    onboardingSeen: true,
    apiKey: 'mock-jpdb-token',
    interfaceLanguage: 'en',
    showFurigana: true,
    furiganaMode: 'all',
    furiganaHiddenStateGroups: [],
    annotationsPaused: false,
    manualScanEnabled: false,
    showFloatingButton: false,
    ankiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    jpdbDefinitionsEnabled: false,
    jitenDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    immersionKitEnabled: false,
    enableLogging: false,
};

const VOCABULARY = [
    ['花瓶', '花瓶', 'かびん', 'vase', 'noun', 10000],
    ['不要', '不要', 'ふよう', 'unneeded', 'noun', 10001],
    ['バラ', 'バラ', 'バラ', 'rose', 'noun', 10002],
    ['季節', '季節', 'きせつ', 'season', 'noun', 10003],
    ['お花', 'お花', 'はな', 'flower', 'noun', 10004],
    ['アレンジメント', 'アレンジメント', 'アレンジメント', 'arrangement', 'noun', 10005],
    ['一般価格', '一般価格', 'いっぱんかかく', 'regular price', 'noun', 10006],
    ['会員価格', '会員価格', 'かいいんかかく', 'member price', 'noun', 10007],
    ['価格', '価格', 'かかく', 'price', 'noun', 10008],
    ['税込', '税込', 'ぜいこみ', 'tax included', 'noun', 10009],
    ['お届け日', 'お届け日', 'とどけび', 'delivery date', 'noun', 10010],
    ['送料', '送料', 'そうりょう', 'shipping', 'noun', 10011],
    ['無料', '無料', 'むりょう', 'free', 'noun', 10012],
    ['種類', '種類', 'しゅるい', 'type', 'noun', 10013],
    ['商品説明', '商品説明', 'しょうひんせつめい', 'product description', 'noun', 10014],
    ['商品詳細', '商品詳細', 'しょうひんしょうさい', 'product details', 'noun', 10035],
    ['レビュー', 'レビュー', 'レビュー', 'review', 'noun', 10015],
    ['母', '母', 'はは', 'mother', 'noun', 10016],
    ['誕生日', '誕生日', 'たんじょうび', 'birthday', 'noun', 10017],
    ['用途', '用途', 'ようと', 'use', 'noun', 10018],
    ['購入履歴', '購入履歴', 'こうにゅうりれき', 'purchase history', 'noun', 10019],
    ['定期便', '定期便', 'ていきびん', 'subscription delivery', 'noun', 10020],
    ['商品', '商品', 'しょうひん', 'product', 'noun', 10021],
    ['説明', '説明', 'せつめい', 'description', 'noun', 10022],
    ['消費税込み', '消費税込み', 'しょうひぜいこみ', 'tax included', 'noun', 10023],
    ['検索結果', '検索結果', 'けんさくけっか', 'search results', 'noun', 10024],
    ['検索', '検索', 'けんさく', 'search', 'noun', 10025],
    ['結果', '結果', 'けっか', 'result', 'noun', 10026],
    ['在庫', '在庫', 'ざいこ', 'stock', 'noun', 10027],
    ['店舗', '店舗', 'てんぽ', 'store', 'noun', 10028],
    ['安い順', '安い順', 'やすいじゅん', 'cheapest first', 'noun', 10029],
    ['高い順', '高い順', 'たかいじゅん', 'highest first', 'noun', 10030],
    ['カラフェ', 'カラフェ', 'カラフェ', 'carafe', 'noun', 10031],
    ['大', '大', 'だい', 'large', 'noun', 10032],
    ['円', '円', 'えん', 'yen', 'noun', 10033],
    ['ポイント', 'ポイント', 'ポイント', 'points', 'noun', 10034],
    ['無印良品', '無印良品', 'むじるしりょうひん', 'MUJI', 'noun', 10036],
    ['良品計画', '良品計画', 'りょうひんけいかく', 'Ryohin Keikaku', 'noun', 10037],
    ['倉庫', '倉庫', 'そうこ', 'warehouse', 'noun', 10038],
    ['数量', '数量', 'すうりょう', 'quantity', 'noun', 10039],
    ['確認', '確認', 'かくにん', 'confirm', 'noun', 10040],
    ['ガラス', 'ガラス', 'ガラス', 'glass', 'noun', 10041],
    ['花器', '花器', 'かき', 'vase', 'noun', 10042],
    ['特徴', '特徴', 'とくちょう', 'feature', 'noun', 10043],
    ['選び方', '選び方', 'えらびかた', 'how to choose', 'noun', 10044],
    ['人気順', '人気順', 'にんきじゅん', 'popularity order', 'noun', 10045],
    ['おすすめ', 'おすすめ', 'おすすめ', 'recommendation', 'noun', 10046],
];

const SITES = [
    {
        name: 'bloomee-product',
        url: 'https://bloomeelife.com/presents/step1.13?plan_id=832',
        readySelector: 'section.product, .product__itembox, h1',
        requiredExpressions: ['花瓶', '不要', '季節', 'お花', '価格', 'お届け日', '送料'],
        requiredWordExpressions: ['バラ', 'アレンジメント'],
        textAssertions: [
            { selector: 'h1', text: '【花瓶不要】' },
            { selector: '.present-breadcrumb, nav', text: 'お花' },
            { selector: '.listbox__price, .product__itembox-txt, .product', text: '価格' },
        ],
        layoutSelectors: [
            'h1',
            '.present-breadcrumb',
            '.listbox__price',
            '.listbox__date',
            '.listbox__postage',
            '.product-variation-item.is-selected',
            '#reviews .present-review-card',
            '.ec-product-list__name_with_limit',
            '.list-price',
        ],
    },
    {
        name: 'bloomee-listing',
        url: 'https://bloomeelife.com/presents/s/NDMsMjIw',
        readySelector: '.present-search-form, .present-search__col__search-form, main',
        requiredExpressions: ['価格', '無料'],
        requiredWordExpressions: ['バラ'],
        textAssertions: [
            { selector: '.present-search-form, main', text: 'バラ' },
            { selector: 'main', text: '送料無料' },
        ],
        layoutSelectors: [
            '.present-search-form',
            '.present-search-form__list-item',
            '.present-search-form__list-item.is-selected',
            '.present-search-form__list-item__link',
            '.present-search-form__list-item__link__deselect',
            '.ec-product-list__name_with_limit',
            '.list-price',
        ],
    },
    {
        name: 'foyer-vase-category',
        url: 'https://www.foyer-shop.com/view/category/ct440',
        readySelector: 'main, h1, .main, body',
        requiredExpressions: ['花瓶', '花器', '特徴', '選び方'],
        requiredWordExpressions: ['ガラス'],
        textAssertions: [
            { selector: 'body', text: '花瓶' },
            { selector: 'body', text: '花器' },
        ],
        layoutSelectors: [
            'h1',
            '.breadcrumb',
            '.item',
            '.product',
            '[class*="price"]',
            '[class*="sort"]',
        ],
    },
];

const browser = await chromium.launch({ headless: true });
const failures = [];
const summaries = [];

try {
    for (const site of SITES) {
        try {
            summaries.push(await runSite(site));
        } catch (error) {
            failures.push(`${site.name}: ${String(error).slice(0, 5000)}`);
        }
    }
} finally {
    await browser.close().catch(() => undefined);
}

console.log(JSON.stringify({ summaries }, null, 2));
if (failures.length) {
    console.error(`FAILURES:\n${failures.join('\n')}`);
    process.exit(1);
}
console.log('live furigana layout smoke passed');

async function runSite(site) {
    const requests = [];
    const consoleErrors = [];
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'ja-JP',
        colorScheme: 'light',
        viewport: { width: 1365, height: 900 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    page.on('pageerror', error => consoleErrors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error' && /yomu|jpdb|userscript/i.test(message.text())) consoleErrors.push(message.text());
    });
    await page.exposeFunction(REQUEST_BRIDGE, request => handleYomuRequest(request, requests));
    await page.route('https://jpdb.io/**', route => route.fulfill(mockedJpdbRoute(route.request(), requests)));
    await page.route('https://api.jiten.moe/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: '[]',
    }));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: SETTINGS,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: REQUEST_BRIDGE,
    });

    try {
        await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForSelector(site.readySelector, { timeout: 35_000 });
        await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await waitForFurigana(page, site.requiredExpressions);
        await waitForWords(page, site.requiredWordExpressions ?? []);
        const snapshot = await page.evaluate(snapshotLayout, site);
        assert(snapshot.wordCount >= site.requiredExpressions.length, 'Not enough reader words rendered', snapshot);
        for (const expression of site.requiredExpressions) {
            assert(snapshot.expressions[expression]?.rubyCount > 0, `Missing furigana for ${expression}`, snapshot);
        }
        for (const expression of site.requiredWordExpressions ?? []) {
            assert(snapshot.words[expression]?.wordCount > 0, `Missing reader word for ${expression}`, snapshot);
        }
        assert(snapshot.textFailures.length === 0, 'Visible text changed or disappeared after furigana render', snapshot);
        assert(snapshot.clipIssues.length === 0, 'Ruby or annotated text is clipped by a compact container', snapshot);
        assert(snapshot.overlapIssues.length === 0, 'Annotated rows visibly overlap after furigana render', snapshot);
        assert(consoleErrors.length === 0, 'Console/page errors during live furigana smoke', { consoleErrors, snapshot });
        const screenshot = path.join(ARTIFACTS, `live-furigana-layout-${site.name}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        return { site: site.name, url: page.url(), screenshot, requests: requests.length, ...snapshot };
    } finally {
        await context.close().catch(() => undefined);
    }
}

async function waitForFurigana(page, expressions) {
    await page.waitForFunction(required => {
        return required.every(expression => {
            const words = [...document.querySelectorAll(`.jpdb-reader-word[data-expression="${CSS.escape(expression)}"]`)];
            return words.some(word => word.querySelector('rt,.jpdb-reader-furi')?.textContent?.trim());
        });
    }, expressions, { timeout: 35_000 });
}

async function waitForWords(page, expressions) {
    if (!expressions.length) return;
    await page.waitForFunction(required => {
        return required.every(expression => document.querySelector(`.jpdb-reader-word[data-expression="${CSS.escape(expression)}"]`));
    }, expressions, { timeout: 10_000 });
}

function snapshotLayout(site) {
    function textWithoutFurigana(node) {
        if (!node) return '';
        const clone = node.cloneNode(true);
        clone.querySelectorAll('rt,rp,.jpdb-reader-furi').forEach(child => child.remove());
        return clone.textContent ?? '';
    }

    function rectObject(rect) {
        return {
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
        };
    }

    function rectSnapshot(element) {
        return rectObject(element.getBoundingClientRect());
    }

    function visibleElements(selector) {
        return [...document.querySelectorAll(selector)]
            .filter(element => element instanceof HTMLElement)
            .filter(element => element.querySelector('.jpdb-reader-word, rt,.jpdb-reader-furi'))
            .filter(element => {
                const rect = element.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
            });
    }

    function rubyOutsideContainer(element) {
        const container = element.getBoundingClientRect();
        if (!container.width || !container.height) return [];
        return [...element.querySelectorAll('rt,.jpdb-reader-furi')]
            .filter(ruby => ruby.getClientRects().length > 0)
            .map(ruby => ({ text: ruby.textContent?.trim() ?? '', rect: ruby.getBoundingClientRect() }))
            .filter(({ rect }) => rect.top < container.top - 3 || rect.bottom > container.bottom + 3 || rect.left < container.left - 3 || rect.right > container.right + 3)
            .map(({ text, rect }) => ({ text, rect: rectObject(rect), container: rectObject(container) }));
    }

    function textAssertionFailures(assertions) {
        return assertions.flatMap(assertion => {
            const element = document.querySelector(assertion.selector);
            const text = textWithoutFurigana(element).replace(/\s+/g, '');
            return text.includes(assertion.text) ? [] : [{ selector: assertion.selector, expected: assertion.text, text: text.slice(0, 180) }];
        });
    }

    function clippedFuriganaIssues(selectors) {
        const issues = [];
        for (const selector of selectors) {
            for (const element of visibleElements(selector)) {
                const style = getComputedStyle(element);
                const clipsY = /(hidden|clip|auto|scroll)/u.test(`${style.overflowY} ${style.overflow}`);
                const clipsX = /(hidden|clip|auto|scroll)/u.test(`${style.overflowX} ${style.overflow}`);
                const clippedY = clipsY && element.scrollHeight > element.clientHeight + 5;
                const clippedX = clipsX && element.scrollWidth > element.clientWidth + 5;
                const rubyOutside = rubyOutsideContainer(element);
                if (clippedY || clippedX || rubyOutside.length) {
                    issues.push({
                        selector,
                        text: textWithoutFurigana(element).replace(/\s+/g, ' ').trim().slice(0, 120),
                        clippedY,
                        clippedX,
                        rubyOutside: rubyOutside.slice(0, 4),
                        rect: rectSnapshot(element),
                        scrollHeight: element.scrollHeight,
                        clientHeight: element.clientHeight,
                        scrollWidth: element.scrollWidth,
                        clientWidth: element.clientWidth,
                        overflow: `${style.overflowX}/${style.overflowY}/${style.overflow}`,
                    });
                }
            }
        }
        return issues;
    }

    function horizontalOverlap(a, b) {
        return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    }

    function unionRect(a, b) {
        const left = Math.min(a.left, b.left);
        const right = Math.max(a.right, b.right);
        const top = Math.min(a.top, b.top);
        const bottom = Math.max(a.bottom, b.bottom);
        return { left, right, top, bottom, width: right - left, height: bottom - top };
    }

    function visibleReaderRows(element) {
        const rows = [...element.querySelectorAll('.jpdb-reader-word')]
            .filter(word => word.getClientRects().length > 0)
            .map(word => ({ text: textWithoutFurigana(word), rect: word.getBoundingClientRect() }))
            .filter(row => row.text.trim() && row.rect.width > 0 && row.rect.height > 0)
            .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left);
        const merged = [];
        for (const row of rows) {
            const last = merged[merged.length - 1];
            if (last && Math.abs(last.rect.top - row.rect.top) < 3) {
                last.text += row.text;
                last.rect = unionRect(last.rect, row.rect);
            } else {
                merged.push({ ...row });
            }
        }
        return merged;
    }

    function rowOverlapIssues(selectors) {
        const issues = [];
        for (const selector of selectors) {
            for (const element of visibleElements(selector)) {
                const rows = visibleReaderRows(element);
                for (let index = 1; index < rows.length; index += 1) {
                    const previous = rows[index - 1];
                    const current = rows[index];
                    if (previous.rect.bottom <= current.rect.top + 2) continue;
                    if (horizontalOverlap(previous.rect, current.rect) < 8) continue;
                    issues.push({
                        selector,
                        previous: previous.text,
                        current: current.text,
                        previousRect: rectObject(previous.rect),
                        currentRect: rectObject(current.rect),
                    });
                }
            }
        }
        return issues.slice(0, 12);
    }

    const requiredWords = [...site.requiredExpressions, ...(site.requiredWordExpressions ?? [])];
    const expressions = Object.fromEntries(site.requiredExpressions.map(expression => {
        const words = [...document.querySelectorAll(`.jpdb-reader-word[data-expression="${CSS.escape(expression)}"]`)];
        return [expression, {
            wordCount: words.length,
            rubyCount: words.filter(word => word.querySelector('rt,.jpdb-reader-furi')).length,
            samples: words.slice(0, 3).map(word => textWithoutFurigana(word)),
        }];
    }));
    const words = Object.fromEntries(requiredWords.map(expression => {
        const matches = [...document.querySelectorAll(`.jpdb-reader-word[data-expression="${CSS.escape(expression)}"]`)];
        return [expression, {
            wordCount: matches.length,
            rubyCount: matches.filter(word => word.querySelector('rt,.jpdb-reader-furi')).length,
            samples: matches.slice(0, 3).map(word => textWithoutFurigana(word)),
        }];
    }));
    return {
        wordCount: document.querySelectorAll('.jpdb-reader-word').length,
        rubyCount: document.querySelectorAll('rt,.jpdb-reader-furi').length,
        expressions,
        words,
        textFailures: textAssertionFailures(site.textAssertions),
        clipIssues: clippedFuriganaIssues(site.layoutSelectors),
        overlapIssues: rowOverlapIssues(site.layoutSelectors),
    };
}

function textAssertionFailures(assertions) {
    return assertions.flatMap(assertion => {
        const element = document.querySelector(assertion.selector);
        const text = textWithoutFurigana(element).replace(/\s+/g, '');
        return text.includes(assertion.text) ? [] : [{ selector: assertion.selector, expected: assertion.text, text: text.slice(0, 180) }];
    });
}

function clippedFuriganaIssues(selectors) {
    const issues = [];
    for (const selector of selectors) {
        for (const element of visibleElements(selector)) {
            const style = getComputedStyle(element);
            const clipsY = /(hidden|clip|auto|scroll)/u.test(`${style.overflowY} ${style.overflow}`);
            const clipsX = /(hidden|clip|auto|scroll)/u.test(`${style.overflowX} ${style.overflow}`);
            const clippedY = clipsY && element.scrollHeight > element.clientHeight + 5;
            const clippedX = clipsX && element.scrollWidth > element.clientWidth + 5;
            const rubyOutside = rubyOutsideContainer(element);
            if (clippedY || clippedX || rubyOutside.length) {
                issues.push({
                    selector,
                    text: textWithoutFurigana(element).replace(/\s+/g, ' ').trim().slice(0, 120),
                    clippedY,
                    clippedX,
                    rubyOutside: rubyOutside.slice(0, 4),
                    rect: rectSnapshot(element),
                    scrollHeight: element.scrollHeight,
                    clientHeight: element.clientHeight,
                    scrollWidth: element.scrollWidth,
                    clientWidth: element.clientWidth,
                    overflow: `${style.overflowX}/${style.overflowY}/${style.overflow}`,
                });
            }
        }
    }
    return issues;
}

function rubyOutsideContainer(element) {
    const container = element.getBoundingClientRect();
    if (!container.width || !container.height) return [];
    return [...element.querySelectorAll('rt,.jpdb-reader-furi')]
        .filter(ruby => ruby.getClientRects().length > 0)
        .map(ruby => ({ text: ruby.textContent?.trim() ?? '', rect: ruby.getBoundingClientRect() }))
        .filter(({ rect }) => rect.top < container.top - 3 || rect.bottom > container.bottom + 3 || rect.left < container.left - 3 || rect.right > container.right + 3)
        .map(({ text, rect }) => ({ text, rect: rectObject(rect), container: rectObject(container) }));
}

function rowOverlapIssues(selectors) {
    const issues = [];
    for (const selector of selectors) {
        for (const element of visibleElements(selector)) {
            const rows = visibleReaderRows(element);
            for (let index = 1; index < rows.length; index += 1) {
                const previous = rows[index - 1];
                const current = rows[index];
                if (previous.rect.bottom <= current.rect.top + 2) continue;
                if (horizontalOverlap(previous.rect, current.rect) < 8) continue;
                issues.push({
                    selector,
                    previous: previous.text,
                    current: current.text,
                    previousRect: rectObject(previous.rect),
                    currentRect: rectObject(current.rect),
                });
            }
        }
    }
    return issues.slice(0, 12);
}

function visibleReaderRows(element) {
    const rows = [...element.querySelectorAll('.jpdb-reader-word')]
        .filter(word => word.getClientRects().length > 0)
        .map(word => ({ text: textWithoutFurigana(word), rect: word.getBoundingClientRect() }))
        .filter(row => row.text.trim() && row.rect.width > 0 && row.rect.height > 0)
        .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left);
    const merged = [];
    for (const row of rows) {
        const last = merged[merged.length - 1];
        if (last && Math.abs(last.rect.top - row.rect.top) < 3) {
            last.text += row.text;
            last.rect = unionRect(last.rect, row.rect);
        } else {
            merged.push({ ...row });
        }
    }
    return merged;
}

function visibleElements(selector) {
    return [...document.querySelectorAll(selector)]
        .filter(element => element instanceof HTMLElement)
        .filter(element => element.querySelector('.jpdb-reader-word, rt,.jpdb-reader-furi'))
        .filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
        });
}

function textWithoutFurigana(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('rt,rp,.jpdb-reader-furi').forEach(child => child.remove());
    return clone.textContent ?? '';
}

function horizontalOverlap(a, b) {
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
}

function unionRect(a, b) {
    const left = Math.min(a.left, b.left);
    const right = Math.max(a.right, b.right);
    const top = Math.min(a.top, b.top);
    const bottom = Math.max(a.bottom, b.bottom);
    return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function rectSnapshot(element) {
    return rectObject(element.getBoundingClientRect());
}

function rectObject(rect) {
    return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
    };
}

function handleYomuRequest(request, requests) {
    const url = new URL(request.url);
    if (url.origin === JPDB_API_ORIGIN && url.pathname.startsWith(JPDB_API_PREFIX)) {
        return mockedJpdbResponse(url, request, requests);
    }
    if (url.origin === JITEN_API_ORIGIN && url.pathname.startsWith(JITEN_API_PREFIX)) {
        requests.push({ kind: 'jiten', path: url.pathname });
        return jsonHttpResponse([]);
    }
    requests.push({ kind: 'unexpected', url: request.url });
    return { status: 404, responseText: '' };
}

function mockedJpdbRoute(request, requests) {
    const url = new URL(request.url());
    const response = mockedJpdbResponse(url, {
        url: request.url(),
        data: request.postData() ?? '',
    }, requests);
    return {
        status: response.status ?? 200,
        contentType: response.contentType ?? 'application/json; charset=utf-8',
        body: response.responseText ?? '',
    };
}

function mockedJpdbResponse(url, request, requests) {
    const endpoint = url.pathname.slice(JPDB_API_PREFIX.length);
    const body = request.data ? readJsonBody(request.data) : {};
    requests.push({ kind: 'jpdb', endpoint, text: body.text });
    if (endpoint === 'parse') return jsonHttpResponse(mockJpdbParseFromVocabulary(body, VOCABULARY));
    if (endpoint === 'deck/list-vocabulary') return jsonHttpResponse({ vocabulary: [] });
    if (endpoint === 'list-user-decks') return jsonHttpResponse({ decks: [] });
    return jsonHttpResponse({});
}
