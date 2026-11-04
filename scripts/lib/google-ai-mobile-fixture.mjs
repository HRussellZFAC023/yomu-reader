// Deterministic response fixture, not a recording or live Google AI Mode proof.
// A page-owned touch handler can cancel the compatibility click while streamed
// response text is still unannotated. Lookup must complete on the trusted tap.
import { readFileSync } from 'node:fs';
import { devices } from 'playwright';
import { addGmStorageBridgeInitScript, assert, routeMockedHttpRequests, YOMU_SETTINGS_KEY } from './smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './smoke-test-helpers.mjs';

const URL = 'https://www.google.com/search?udm=50&q=fixture&hl=ja';
const HTML = `<!doctype html><html lang="ja"><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:20px;font:24px/1.8 sans-serif}main{min-height:1600px}a{display:block;margin:30px 0}</style>
</head><body><main><section id="response" aria-live="polite"></section>
<a id="source" href="#source-opened">辞書を使用します。</a>
<button id="control">辞書</button></main><script>
window.fixtureEvents=[];window.fixturePopupMounts=0;
for(const type of ['pointerdown','pointerup','touchstart','touchend','click']){
 document.addEventListener(type,e=>window.fixtureEvents.push({type,trusted:e.isTrusted,target:e.target.id}),true);
}
document.addEventListener('touchstart',e=>{if(e.target.closest('#response'))e.preventDefault()},{passive:false});
new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes){
 if(n.nodeType===1)window.fixturePopupMounts+=Number(n.matches('.jpdb-reader-popover'))+n.querySelectorAll('.jpdb-reader-popover').length;
}}).observe(document.body,{childList:true,subtree:true});
</script></body></html>`;

export async function runGoogleAiMobileFixture(browser, { settings, scriptPath, cssPath, mockRequest }) {
    const context = await browser.newContext({ ...devices['iPhone 13'], bypassCSP: true, locale: 'ja-JP' });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    if (process.env.SMOKE_DEBUG) page.on('console', message => console.error(`[mobile-fixture:${message.type()}] ${message.text()}`));
    try {
        await routeMockedHttpRequests(page, { requests, mockHttpRequest: mockRequest, isMockedApiOrigin: () => true });
        await page.route(URL, route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
        await page.exposeFunction('__googleAiMobileFixtureRequest', request => mockRequest(request, requests));
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: {
                ...settings, manualScanEnabled: true, preferJapaneseSiteLanguage: false,
                jpdbDefinitionsEnabled: false, jitenDefinitionsEnabled: false,
                bunproDefinitionsEnabled: false, wanikaniDefinitionsEnabled: false,
                immersionKitEnabled: false,
                enableLogging: Boolean(process.env.SMOKE_DEBUG),
            },
            css: readFileSync(cssPath, 'utf8'),
            requestBridgeName: '__googleAiMobileFixtureRequest',
        });
        await page.goto(URL, { waitUntil: 'domcontentloaded' });
        await installUserscriptCssResource(page, cssPath);
        await addScriptTagWithCspFallback(page, scriptPath);
        await page.waitForFunction(() => document.getElementById('jpdb-reader-runtime-owner'));
        // Streamed content arrives after boot, before any annotation exists.
        await page.locator('#response').evaluate(element => { element.innerHTML = '<p id="answer">辞書を使用します。</p>'; });
        assert(await page.locator('#response .jpdb-reader-word').count() === 0, 'Fixture response must be unannotated');
        const point = await glyphCenter(page, '#answer');
        await page.touchscreen.tap(point.x, point.y);
        await waitForResponsePopup(page, requests, errors);
        await page.waitForTimeout(400);
        const snapshot = await page.evaluate(() => ({
            events: window.fixtureEvents,
            mounts: window.fixturePopupMounts,
            popupText: document.querySelector('.jpdb-reader-popover')?.textContent,
        }));
        assert(snapshot.events.some(event => event.type === 'pointerup' && event.trusted), 'Fixture did not receive a trusted touch release', snapshot);
        assert(!snapshot.events.some(event => event.type === 'click' && event.target === 'answer'), 'Host should have canceled the compatibility click', snapshot);
        assert(snapshot.mounts === 1, 'One touch opened more than one popup', snapshot);
        assert(snapshot.popupText.includes('辞書'), 'Tap looked up the wrong response word', snapshot);
        await page.keyboard.press('Escape');
        await page.locator('#response').evaluate(element => {
            const ordinary = document.createElement('p');
            ordinary.id = 'ordinary';
            ordinary.textContent = '辞書を使用します。';
            element.after(ordinary);
        });
        const ordinaryPoint = await glyphCenter(page, '#ordinary');
        await page.touchscreen.tap(ordinaryPoint.x, ordinaryPoint.y);
        await page.locator('.jpdb-reader-popover').waitFor({ state: 'visible' });
        await page.waitForTimeout(400);
        const ordinary = await page.evaluate(() => ({
            mounts: window.fixturePopupMounts,
            clicks: window.fixtureEvents.filter(event => event.type === 'click' && event.target === 'ordinary'),
            releases: window.fixtureEvents.filter(event => event.type === 'pointerup' && event.target === 'ordinary'),
        }));
        assert(ordinary.releases.length === 1 && ordinary.releases[0].trusted, 'Ordinary tap did not deliver one trusted release', ordinary);
        assert(ordinary.clicks.length <= 1 && ordinary.clicks.every(event => event.trusted), 'Ordinary tap delivered extra clicks', ordinary);
        assert(ordinary.mounts === 2, 'Ordinary tap opened a duplicate lookup', ordinary);
        await page.keyboard.press('Escape');
        await page.locator('#source').tap();
        assert(new globalThis.URL(page.url()).hash === '#source-opened', 'Source link lost its normal tap');
        assert(await page.locator('.jpdb-reader-popover').count() === 0, 'Source link opened a lookup');
        await page.locator('#control').tap();
        assert(await page.locator('.jpdb-reader-popover').count() === 0, 'Page button opened a lookup');
        assert(errors.length === 0, 'Mobile fixture had page errors', { errors });
        return { fixture: true, device: 'iPhone 13 emulation', trustedTouch: true, canceledClickPopupMounts: snapshot.mounts, ordinaryClickPopupMounts: ordinary.mounts - snapshot.mounts, compatibilityClicks: ordinary.clicks.length, nativeLink: true, nativeButton: true };
    } finally {
        await context.close();
    }
}

async function waitForResponsePopup(page, requests, errors) {
    try {
        await page.locator('.jpdb-reader-popover').waitFor({ state: 'visible', timeout: 15000 });
    } catch (error) {
        const state = await page.evaluate(() => ({ events: window.fixtureEvents, popup: document.querySelector('.jpdb-reader-popover')?.outerHTML }));
        throw new Error(`Unannotated response tap did not open lookup: ${JSON.stringify({ ...state, requests, errors })}`, { cause: error });
    }
}

async function glyphCenter(page, selector) {
    return page.locator(selector).evaluate(element => {
        const range = document.createRange();
        range.setStart(element.firstChild, 0);
        range.setEnd(element.firstChild, 1);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
}
