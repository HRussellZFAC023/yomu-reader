import { withSmokeContexts } from './smoke-harness.mjs';
import * as smokeDependencyFiles from 'node:fs';
import * as smokeDependencyPaths from 'node:path';
import * as smokeDependencyBrowsers from 'playwright';
import * as smokeDependencyHarness from './smoke-harness.mjs';
import * as smokeDependencyStudyFixture from './study-fixture.mjs';

// Former study-headword-furigana-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertStudyHeadwordFurigana(_hostBrowser, _hostEngine) {
    return withSmokeContexts(_hostBrowser, async () => {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { mkdirSync, writeFileSync } = smokeDependencyFiles;
    const { default: path } = smokeDependencyPaths;

    const { assert } = smokeDependencyHarness;
    const { bootStudySession, createStudyServer, createStudySettings } = smokeDependencyStudyFixture;
// Built Study PWA with mocked study data, not a hand-made HTML fixture or
// live-provider/visual acceptance. Real browser cascade and ruby geometry.

const out = path.resolve('artifacts/study-headword-furigana');
mkdirSync(out, { recursive: true });
for (const engine of [_hostEngine]) {
    assert(['chromium', 'webkit'].includes(engine), `Unknown engine ${engine}`);
    const server = await createStudyServer();
    let browser;
    const report = { engine, product: 'dist/newtab', providerData: 'mock', checks: [] };
    try {
        browser = _hostBrowser;
        const { page } = await bootStudySession(browser, {
            server, state: { reviewed: new Set([9001]) },
            settings: createStudySettings({
                immersionKitEnabled: false, audioEnabled: false, autoPlayAudio: false,
            }),
            viewport: engine === 'webkit' ? { width: 820, height: 1180 } : { width: 1280, height: 900 },
            hasTouch: engine === 'webkit', isMobile: engine === 'webkit',
        });
        await page.locator('[data-newtab-action="reveal"]').click();
        const headword = page.locator('[data-newtab-prompt] [data-yomu-headword]');
        await headword.locator('rt.jpdb-reader-furi').first().waitFor({ state: 'attached' });
        const snapshot = () => headword.evaluate(node => ({
            text: node.textContent,
            readings: [...node.querySelectorAll('rt.jpdb-reader-furi')].map(rt => {
                const rect = rt.getBoundingClientRect();
                const css = getComputedStyle(rt);
                return { text: rt.textContent, display: css.display, visibility: css.visibility, width: rect.width, height: rect.height };
            }),
        }));
        const check = async label => {
            const detail = await snapshot();
            const passed = detail.readings.length > 0 && detail.readings.map(rt => rt.text).join('') === 'ずかん'
                && detail.readings.every(rt => rt.display !== 'none' && rt.visibility === 'visible' && rt.width > 0 && rt.height > 0);
            report.checks.push({ label, passed, detail });
            assert(passed, `${engine}: ${label}`, detail);
        };
        // Reproduce the actual reveal flow under the shipping Known/Due filters.
        await check('revealing Due 図鑑 displays ずかん with default filters');
        // Probe every existing group on the product-rendered headword. This
        // deliberately uses the browser cascade rather than a CSS test helper.
        for (const state of ['known', 'due', 'failed', 'learning', 'new']) {
            await headword.evaluate((node, state) => {
                node.className = `jpdb-reader-spelling yomu-furi-hide-${state}`;
                for (const word of node.querySelectorAll('.jpdb-reader-word')) {
                    word.className = `jpdb-reader-word jpdb-reader-has-furi jpdb-not-in-deck yomu-review-${state}`;
                }
            }, state);
            await check(`Hide ${state} preserves headword readings`);
        }
        // The JPDB-absence branch of Hide New is separate from explicit New.
        await headword.evaluate(node => {
            for (const word of node.querySelectorAll('.jpdb-reader-word')) word.classList.remove('yomu-review-new');
        });
        await check('Hide New preserves untracked headword readings');
        assert(!(await page.locator('body').innerText()).includes('未翻訳'), 'Study contains untranslated copy');
        report.success = true;
        console.log(`PASS ${engine}: ${report.checks.length} built Study headword checks`);
    } catch (error) {
        report.error = String(error);
        throw error;
    } finally {
        writeFileSync(path.join(out, `${engine}.json`), `${JSON.stringify(report, null, 2)}\n`);

        await new Promise((resolve, reject) => server.server.close(error => error ? reject(error) : resolve()));
    }
}


    });
}
