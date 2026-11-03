// Component mechanism fixture: the real private picker, deterministic membership
// evidence, and native keyboard input. Public geometry must reveal no deck count.
// Run directly: node scripts/private-deck-status-smoke.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'artifacts', 'private-deck-status-geometry');
mkdirSync(OUT, { recursive: true });
const fixture = await build({
    stdin: {
        resolveDir: ROOT,
        loader: 'ts',
        contents: `
            import { mountDeckSelects } from './src/reader/study/mining-controls-impl';
            import { bindPrivateCommandCapability } from './src/reader/dom/private-command-capabilities';
            window.installPickerFixture = (language, count) => {
                document.body.replaceChildren();
                const frame = document.createElement('main');
                frame.style.cssText = 'width:min(490px,calc(100vw - 34px));margin:auto';
                const host = document.createElement('div');
                host.className = 'jpdb-reader-deck-select';
                host.textContent = 'Add to deck…';
                frame.append(host); document.body.append(frame);
                const choices = Array.from({length:count}, (_,index) => ({
                    source:index ? 'anki' : 'yomu-local', id:String(index),
                    label:index ? 'Private Destination '.repeat(12) + index : 'よむ deck',
                }));
                bindPrivateCommandCapability(host, {kind:'card-ui', action:'deck-picker', choices});
                let state = 'saved';
                window.setFixtureMembership = value => { state = value; };
                mountDeckSelects(frame, {spelling:'猫',reading:'ねこ'}, undefined, async()=>{}, {
                    language, load:(_card,decks)=>decks.map(()=>Promise.resolve(
                        state==='unknown' ? {kind:'unknown',reason:'unavailable'} : {kind:state}
                    )),
                });
                const samples = [];
                new ResizeObserver(entries=>entries.forEach(entry=>{
                    const box=entry.target.getBoundingClientRect();
                    samples.push({width:box.width,height:box.height});
                })).observe(host);
                window.readFixtureGeometry = () => {
                    const box = host.getBoundingClientRect();
                    return {width:box.width,height:box.height,samples:[...samples],
                        focused:document.activeElement===host,closed:host.shadowRoot===null,
                        leaked:/Private Destination|Saved in this deck|Status unknown|保存済み|保存状況不明/.test(host.outerHTML)};
                };
            };
        `,
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    define: { __YOMU_EXTENSION_BUILD__: 'false', __YOMU_NEWTAB_BUILD__: 'false', 'import.meta.env.MODE': '"production"' },
});
const browser = await chromium.launch({ headless: true });
const results = [];
try {
    for (const width of [1280, 390]) {
        for (const language of ['en', 'ja']) {
            for (const count of [1, 13]) results.push(await measure({ width, language, count }));
        }
        const rows = results.filter(row => row.width === width);
        assert.equal(new Set(rows.map(row => row.before.height)).size, 1, 'initial height reveals count/language');
        assert.equal(new Set(rows.flatMap(row => row.states.map(state => state.height))).size, 1, 'opened height reveals count/status/language');
        assert.equal(new Set(rows.flatMap(row => row.states.map(state => state.width))).size, 1, 'opened width reveals count/status/language');
    }
} finally {
    writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ fixture: 'actual picker component, deterministic membership', results }, null, 2));
    await browser.close();
}
console.log(`PASS private picker geometry: ${results.length} cases, page-side rectangles and ResizeObserver`);

async function measure({ width, language, count }) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    try {
        const page = await context.newPage();
        await page.route('https://private-deck-fixture.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
        await page.goto('https://private-deck-fixture.test/');
        await page.addScriptTag({ content: fixture.outputFiles[0].text });
        await page.evaluate(({ language, count }) => window.installPickerFixture(language, count), { language, count });
        await page.waitForTimeout(30);
        const before = await page.evaluate(() => window.readFixtureGeometry());
        const states = [];
        for (const status of ['saved', 'unknown', 'not-saved']) {
            await page.evaluate(status => window.setFixtureMembership(status), status);
            await page.locator('.jpdb-reader-deck-select').focus();
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Escape');
            await page.waitForTimeout(30);
            const current = await page.evaluate(() => window.readFixtureGeometry());
            assert.equal(current.height, 228, 'private status must remain visible within a fixed box');
            assert.equal(current.closed, true);
            assert.equal(current.leaked, false);
            assert.equal(current.focused, true);
            assert(current.samples.every(sample => sample.height === 36 || sample.height === 228), 'ResizeObserver reveals private content changes');
            states.push({ status, ...current });
        }
        return { width, language, count, before, states };
    } finally { await context.close(); }
}
