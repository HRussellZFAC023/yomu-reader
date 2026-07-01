#!/usr/bin/env node
// Listen-mode smoke: boots the built /newtab study PWA, opens the merged Listen
// pitch-accent step, and drives the audio-first drill inside the single Study
// flow. This guards against the old separate Listen/Perceive/Recall/Shadow tabs
// creeping back into the learner-facing UI.
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
        await page.waitForSelector('[data-newtab-action="mode"][data-mode="word"]', { timeout: 10_000 });
        const legacyListenTabCount = await page.locator('[data-newtab-action="mode"][data-mode="listen"]').count();
        assert(legacyListenTabCount === 0, 'Legacy Listen mode tab should not be rendered in merged Study');

        // --- Enter the merged Listen step ---
        await page.click('[data-study-step-kind="listen-pitch"]');
        await page.waitForSelector('.jpdb-reader-newtab-listen-picker', { timeout: 10_000 });

        const switcherVisible = await page.locator('[data-newtab-listen-submodes]:visible').count();
        assert(switcherVisible === 0, 'Old Listen sub-mode switcher should stay hidden in merged Study');

        // --- Listen: picker renders N+1 options; auto-play fires ---
        const reading = await page.evaluate(() => document.querySelector('.jpdb-reader-newtab-listen-card')?.querySelectorAll('[data-listen-pos]').length || 0);
        assert(reading >= 2, 'Position picker did not render multiple downstep options', { options: reading });
        const hasSpeakerIcon = await page.evaluate(() => Boolean(document.querySelector('[data-newtab-action="listen-play"].jpdb-reader-newtab-listen-icon-btn svg')));
        assert(hasSpeakerIcon, 'Listen step should use the shared speaker icon button');

        // Pick downstep 0 (the fixture cards are heiban) -> saved choice, no per-step reveal.
        await page.click('[data-listen-pos="0"]');
        await page.waitForSelector('.jpdb-reader-newtab-listen-verdict', { timeout: 5_000 });
        const verdictText = await page.locator('.jpdb-reader-newtab-listen-verdict').textContent();
        assert(/choice saved/i.test(verdictText || ''), 'Listen pick should save the choice without revealing a separate answer', { verdictText });

        // Continue into speaking without showing the final answer yet.
        await page.click('[data-newtab-controls] [data-newtab-action="next"]');
        await page.waitForSelector('[data-study-step-kind="speaking"][data-active="true"]', { timeout: 5_000 });
        await page.waitForSelector('[data-listen-submode="shadow"]', { timeout: 5_000 });
        const revealedBeforeFinal = await page.evaluate(() => document.querySelector('[data-jpdb-reader-root]')?.classList.contains('jpdb-reader-newtab-revealed'));
        assert(!revealedBeforeFinal, 'Continuing from Listen should not reveal the card before final reveal');

        // --- Speak step: recording + global Continue control ---
        const hasRecord = await page.evaluate(() => Boolean(document.querySelector('[data-newtab-action="listen-record"]')));
        const hasContinue = await page.evaluate(() => Boolean(document.querySelector('[data-newtab-action="next"]')));
        const hasShadowGrade = await page.evaluate(() => Boolean(document.querySelector('[data-newtab-action="listen-grade"]')));
        assert(hasRecord, 'Speak step missing the self-recording control');
        assert(hasContinue, 'Speak step missing the global Continue control');
        assert(!hasShadowGrade, 'Speak step should not show old self-grade buttons');

        await page.waitForTimeout(650);
        await page.click('[data-newtab-controls] [data-newtab-action="next"]');
        await page.waitForFunction(() => document.querySelector('[data-jpdb-reader-root]')?.classList.contains('jpdb-reader-newtab-revealed'), null, { timeout: 5_000 });

        const result = { options: reading, switcherVisible, hasSpeakerIcon, hasRecord, hasContinue };
        console.log(JSON.stringify(result, null, 2));
        console.log('listen-mode smoke passed');
        await context.close();
    } finally {
        await browser.close();
        await server.close();
    }
}

await run();
