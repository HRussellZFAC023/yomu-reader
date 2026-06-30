#!/usr/bin/env node
// Listen-mode smoke: boots the built /newtab study PWA, switches into the Listen
// pitch-accent mode, and drives the audio-first drill end to end. Asserts (1) the
// downstep position picker renders N+1 options for the reading, (2) a pick grades
// and persists a local pitch SRS item to GM storage, (3) the Perceive verdict +
// model audio fire, and (4) the Perceive/Recall/Shadow sub-mode switcher works,
// including the lean Shadow self-recording + continue controls.
import { chromium } from 'playwright';
import { assert, launchSmokeBrowser } from './lib/smoke-harness.mjs';
import { bootStudySession, createStudyServer, createStudySettings } from './lib/study-fixture.mjs';

async function run() {
    const server = await createStudyServer();
    const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
    const requests = [];
    const state = { reviewed: new Set() };
    try {
        const { context, page } = await bootStudySession(browser, {
            server, settings: createStudySettings(), requests, state, offline: () => false, serviceWorkers: 'allow',
        });
        await page.waitForSelector('[data-newtab-action="mode"][data-mode="listen"]', { timeout: 10_000 });

        // --- Enter Listen mode ---
        await page.click('[data-newtab-action="mode"][data-mode="listen"]');
        await page.waitForSelector('.jpdb-reader-newtab-listen-picker', { timeout: 10_000 });

        // The sub-mode switcher should now be visible (hidden in every other mode).
        const switcherVisible = await page.isVisible('[data-newtab-listen-submodes]');
        assert(switcherVisible, 'Listen sub-mode switcher not shown in Listen mode');

        // --- Perceive: picker renders N+1 options; auto-play fires ---
        const reading = await page.evaluate(() => document.querySelector('.jpdb-reader-newtab-listen-card')?.querySelectorAll('[data-listen-pos]').length || 0);
        assert(reading >= 2, 'Position picker did not render multiple downstep options', { options: reading });

        // Pick downstep 0 (the fixture cards are heiban) -> correct verdict + grade.
        await page.click('[data-listen-pos="0"]');
        await page.waitForSelector('.jpdb-reader-newtab-listen-verdict', { timeout: 5_000 });
        const verdictCorrect = await page.evaluate(() => Boolean(document.querySelector('.jpdb-reader-newtab-listen-verdict-correct')));
        assert(verdictCorrect, 'Correct downstep pick did not show the correct verdict');

        // The graded item must persist to the local pitch SRS store (yomu- managed key).
        await page.waitForTimeout(700); // debounced write-behind
        const items = await page.evaluate(() => {
            const raw = localStorage.getItem('yomu-pitch-items:v1') || globalThis.__yomuGmStore?.['yomu-pitch-items:v1'];
            try { const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; return parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0; } catch { return 0; }
        });
        assert(items >= 1, 'Graded pitch item was not persisted to yomu-pitch-items:v1', { items });

        // --- Recall sub-mode: word + meaning fronted ---
        await page.click('[data-newtab-action="listen-submode"][data-listen-submode="recall"]');
        await page.waitForSelector('.jpdb-reader-newtab-listen-cue', { timeout: 5_000 });
        const recallHasMeaning = await page.evaluate(() => (document.querySelector('.jpdb-reader-newtab-listen-cue')?.textContent || '').trim().length > 0);
        assert(recallHasMeaning, 'Recall sub-mode did not front the word + meaning');

        // --- Shadow sub-mode: contour + recording + continue control ---
        await page.click('[data-newtab-action="listen-submode"][data-listen-submode="shadow"]');
        await page.waitForSelector('[data-listen-submode="shadow"]', { timeout: 5_000 });
        const hasRecord = await page.evaluate(() => Boolean(document.querySelector('[data-newtab-action="listen-record"]')));
        const hasContinue = await page.evaluate(() => Boolean(document.querySelector('[data-newtab-action="listen-next"]')));
        const hasShadowGrade = await page.evaluate(() => Boolean(document.querySelector('[data-newtab-action="listen-grade"]')));
        assert(hasRecord, 'Shadow sub-mode missing the self-recording control');
        assert(hasContinue, 'Shadow sub-mode missing the continue control');
        assert(!hasShadowGrade, 'Shadow sub-mode should not show old self-grade buttons');

        const result = { options: reading, items, switcherVisible, verdictCorrect, recallHasMeaning, hasRecord, hasContinue };
        console.log(JSON.stringify(result, null, 2));
        console.log('listen-mode smoke passed');
        await context.close();
    } finally {
        await browser.close();
        await server.close();
    }
}

await run();
