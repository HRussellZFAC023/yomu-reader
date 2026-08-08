import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const ORIGIN = process.env.YOMU_DOCS_PREVIEW_URL || 'http://127.0.0.1:4199';
const JA_HEADING = '日本語を学ぶための、すべてがそろう。';
const EN_HEADING = 'A complete system for learning 日本語.';
const EXPECTED_ROUTE_FRAMES = Object.freeze({
    '/': { lang: 'en', heading: EN_HEADING },
    '/ja/': { lang: 'ja', heading: JA_HEADING },
});
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage();
    const hydrationMessages = [];
    page.on('console', message => {
        if (/hydration|mismatch/i.test(message.text())) hydrationMessages.push(message.text());
    });
    page.on('pageerror', error => {
        if (/hydration|mismatch/i.test(error.message)) hydrationMessages.push(error.message);
    });

    await installFirstFrameProbe(page);
    const response = await page.goto(`${ORIGIN}/ja/`, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), 'Japanese route response failed');
    const initialHtml = await response.text();
    assert.ok(initialHtml.includes(JA_HEADING), 'Japanese is absent from initial server HTML');
    assert.equal(initialHtml.includes(EN_HEADING), false, 'English headline leaked into initial Japanese HTML');
    await assertHomepage(page, '/ja/', 'ja', JA_HEADING);
    await assertNoWrongLanguageFrame(page);

    await chooseLocale(page, '言語を変更', '/');
    await assertHomepage(page, '/', 'en', EN_HEADING);
    await assertNoWrongLanguageFrame(page);

    await chooseLocale(page, 'Change language', '/ja/');
    await assertHomepage(page, '/ja/', 'ja', JA_HEADING);
    await assertNoWrongLanguageFrame(page);
    assert.deepEqual(hydrationMessages, [], `Vue hydration warning: ${hydrationMessages.join('\n')}`);

    const frames = await page.evaluate(() => window.__yomuLocaleFrames?.length ?? 0);
    assert.ok(frames >= 3, 'first-frame probe did not observe route rendering');
    console.log(`Docs locale browser smoke passed: Japanese SSR/hydration and EN↔JA SPA navigation (${frames} painted-frame snapshots).`);
} finally {
    await browser.close();
}

async function installFirstFrameProbe(page) {
    await page.addInitScript(() => {
        window.__yomuLocaleFrames = [];
        let scheduled = false;
        const capture = () => {
            scheduled = false;
            const heading = document.querySelector('#yomu-home-title')?.textContent?.trim() ?? '';
            if (!heading) return;
            window.__yomuLocaleFrames.push({
                path: location.pathname,
                lang: document.documentElement.lang,
                heading,
            });
        };
        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(capture);
        };
        new MutationObserver(schedule).observe(document, {
            attributes: true,
            childList: true,
            characterData: true,
            subtree: true,
        });
        document.addEventListener('DOMContentLoaded', schedule, { once: true });
    });
}

async function chooseLocale(page, label, href) {
    await page.locator(`.VPNavBarTranslations button[aria-label="${label}"]`).click();
    await Promise.all([
        page.waitForURL(url => url.pathname === href),
        page.locator(`.VPNavBarTranslations a[href="${href}"]`).click(),
    ]);
}

async function assertHomepage(page, pathname, lang, heading) {
    await page.waitForFunction(
        ({ pathname: expectedPath, lang: expectedLang, heading: expectedHeading }) =>
            location.pathname === expectedPath
            && document.documentElement.lang === expectedLang
            && document.querySelector('#yomu-home-title')?.textContent?.trim() === expectedHeading,
        { pathname, lang, heading },
    );
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertNoWrongLanguageFrame(page) {
    const frames = await page.evaluate(() => window.__yomuLocaleFrames ?? []);
    const mismatches = frames.filter(isWrongLanguageFrame);
    assert.deepEqual(mismatches, [], `wrong-language painted frame: ${JSON.stringify(mismatches)}`);
}

function isWrongLanguageFrame(frame) {
    const expected = EXPECTED_ROUTE_FRAMES[frame.path];
    if (!expected) return false;
    return frame.lang !== expected.lang || frame.heading !== expected.heading;
}
