#!/usr/bin/env node
// Capture the actual built Study UI. Only local static assets are routed;
// provider responses, dictionary data and application markup are never mocked.
import { chromium, webkit } from 'playwright';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const buildDir = process.env.YOMU_VISUAL_BUILD_DIR || path.join(root, 'dist');
const output = process.env.YOMU_VISUAL_OUTPUT;
if (!output) throw new Error('Set YOMU_VISUAL_OUTPUT to the untracked screenshot directory.');
const phase = process.env.YOMU_VISUAL_PHASE || 'before';
const engines = (process.env.YOMU_VISUAL_ENGINES || 'chromium,webkit').split(',');
const sizes = (process.env.YOMU_VISUAL_SIZES || 'desktop,iphone').split(',');
const themes = (process.env.YOMU_VISUAL_THEMES || 'light,dark').split(',');
const languages = (process.env.YOMU_VISUAL_LANGUAGES || 'en,ja').split(',');
const manifestPath = path.join(output, `${phase}-manifest.json`);
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
let failed = false;
mkdirSync(path.join(output, phase), { recursive: true });
const persist = () => writeFileSync(path.join(output, `${phase}-manifest.json`), JSON.stringify(manifest, null, 2));
async function localBuild(route) {
    let pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const candidates = [path.join(buildDir, pathname.replace(/^\/study\//, 'newtab/')), path.join(root, 'docs/public', pathname), path.join(root, 'public', pathname)];
    const file = candidates.find(candidate => candidate.startsWith(`${root}/`) && existsSync(candidate) && statSync(candidate).isFile());
    if (file) await route.fulfill({ path: file });
    else await route.continue();
}
for (const engine of engines) {
    const browser = await ({ chromium, webkit }[engine]).launch(engine === 'chromium' ? { channel: 'chrome' } : {});
    try {
        for (const size of sizes) for (const theme of themes) for (const language of languages) {
            const id = `${engine}-${size}-${theme}-${language}`;
            const viewport = size === 'iphone' ? { width: 390, height: 844 } : { width: 1280, height: 800 };
            const context = await browser.newContext({ viewport, isMobile: size === 'iphone', hasTouch: size === 'iphone', colorScheme: theme, locale: language === 'ja' ? 'ja-JP' : 'en-GB', serviceWorkers: 'block' });
            const page = await context.newPage();
            page.setDefaultTimeout(15000);
            await page.route('https://yomureader.com/**', localBuild);
            await page.addInitScript(({ theme, language }) => {
                if (!localStorage.getItem('jpdb-popup-reader-settings')) localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ theme, interfaceLanguage: language, onboardingSeen: true, learningTargetChosen: true }));
            }, { theme, language });
            const record = { id, viewport, screenshots: [], errors: [], unavailable: [] };
            const existing = manifest.findIndex(record => record.id === id);
            if (existing >= 0) manifest.splice(existing, 1);
            manifest.push(record);
            page.on('pageerror', error => record.errors.push(error.message));
            const capture = async state => {
                await page.evaluate(() => document.fonts.ready);
                const file = path.join(output, phase, `${id}-${state}.png`);
                await page.screenshot({ path: file, timeout: 30000 });
                const text = await page.locator('body').innerText();
                record.screenshots.push({ state, path: file, untranslated: text.includes('未翻訳') });
                persist();
            };
            const click = async selector => {
                const control = page.locator(selector).filter({ visible: true }).first();
                if (!await control.count()) return false;
                await control.click();
                await page.waitForTimeout(200);
                return true;
            };
            try {
                await page.goto('https://yomureader.com/study/', { waitUntil: 'domcontentloaded' });
                await page.locator('.jpdb-reader-newtab').waitFor();
                await page.waitForTimeout(1200);
                await capture('study-front');
                if (await click('[data-newtab-action="reveal"]')) await capture('study-answer');
                for (const mode of ['search', 'stats']) {
                    if (await click(`[data-newtab-action="mode"][data-mode="${mode}"]`)) {
                        await capture(mode);
                        const height = await page.evaluate(() => document.scrollingElement.scrollHeight);
                        if (height > viewport.height + 10) { await page.evaluate(() => window.scrollTo(0,document.scrollingElement.scrollHeight)); await capture(`${mode}-bottom`); }
                    }
                }
                await page.evaluate(() => window.scrollTo(0,0));
                if (await click('.jpdb-reader-newtab-more summary')) {
                    await capture('study-menu');
                    await click('.jpdb-reader-newtab-more summary');
                }
                if (!await click('[data-newtab-action="settings"]')) {
                    await click('.jpdb-reader-newtab-more summary');
                    await click('[data-newtab-action="settings"]');
                }
                await page.locator('.jpdb-reader-settings').waitFor();
                const panels = await page.locator('[data-action="settings-panel"]').evaluateAll(elements => elements.map(element => element.dataset.panel));
                for (const panel of panels) {
                    await page.locator(`[data-action="settings-panel"][data-panel="${panel}"]`).click();
                    await page.locator('.jpdb-reader-settings-scroll').evaluate(element => { element.scrollTop = 0; });
                    await capture(`settings-${panel}-closed`);
                    // Open each real disclosure with its summary control. No DOM changes to
                    // force hidden content visible: the product owns the resulting state.
                    for (let i = 0; i < 40; i++) {
                        const summary = page.locator('.jpdb-reader-settings-scroll details:not([open]) > summary').filter({ visible: true }).first();
                        if (!await summary.count()) break;
                        await summary.click();
                    }
                    const scroller = page.locator('.jpdb-reader-settings-scroll');
                    const geometry = await scroller.evaluate(element => ({ height: element.clientHeight, total: element.scrollHeight }));
                    let index = 0;
                    for (let top = 0; top < geometry.total; top += Math.max(180, geometry.height - 70)) {
                        await scroller.evaluate((element, y) => { element.scrollTop = y; }, top);
                        await capture(`settings-${panel}-${String(index++).padStart(2,'0')}`);
                        if (top + geometry.height >= geometry.total) break;
                    }
                }
                // A fresh, isolated context exposes the actual first-run flow.
                const fresh = await context.newPage();
                await fresh.route('https://yomureader.com/**', localBuild);
                await fresh.goto('https://yomureader.com/study/', { waitUntil: 'domcontentloaded' });
                await fresh.evaluate(({ theme, language }) => {localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({theme,interfaceLanguage:language,onboardingSeen:false,learningTargetChosen:false}));}, {theme,language});
                await fresh.reload({ waitUntil: 'domcontentloaded' });
                await fresh.waitForTimeout(600);
                const file = path.join(output,phase,`${id}-onboarding.png`);
                await fresh.screenshot({path:file});
                record.screenshots.push({state:'onboarding',path:file,untranslated:(await fresh.locator('body').innerText()).includes('未翻訳')});
                await fresh.close();
                console.log(`${id}: ${record.screenshots.length} screenshots`);
            } catch (error) { failed = true; record.unavailable.push(error.stack); console.error(id,error.message); }
            finally { persist(); await context.close(); }
        }
    } finally { await browser.close(); }
}

if (failed) process.exitCode = 1;
