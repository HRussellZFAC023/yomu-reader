#!/usr/bin/env node
// Captures the Study PWA install-prompt screenshots referenced by the
// `screenshots` member of public/newtab/manifest.webmanifest. Android and
// desktop Chrome show a bare, unpersuasive install sheet when a manifest has no
// screenshots, and each form factor needs its own aspect ratio: narrow for
// phones, wide for desktop.
//
// The shots come from the real built Study app booted through the offline-study
// fixture (real card, real pitch and audio surfaces, mocked network), so they
// stay honest about what a learner gets. Requires `npm run build:userscript`
// first, then: node scripts/manual/study-pwa-screenshots.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchSmokeBrowser } from '../lib/smoke-harness.mjs';
import { bootStudySession, createStudyServer, createStudySettings } from '../lib/study-fixture.mjs';

const root = join(import.meta.dirname, '..', '..');
const OUT_DIR = join(root, 'docs', 'public', 'screenshots');
const SHOTS = [
    { name: 'study-pwa-narrow.png', viewport: { width: 412, height: 824 }, isMobile: true, hasTouch: true },
    { name: 'study-pwa-wide.png', viewport: { width: 1280, height: 800 } },
];

// Mirrors the reveal path in scripts/offline-study-smoke.mjs: a card whose step
// rail ends in a final-reveal step has no separate reveal button.
async function revealVisibleCard(page) {
    const finalRevealStep = page.locator('[data-study-step-kind="final-reveal"]').first();
    if (await finalRevealStep.count()) {
        await finalRevealStep.click();
        return;
    }
    await page.click('[data-newtab-action="reveal"]').catch(() => undefined);
}

const server = await createStudyServer();
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
try {
    for (const { name, viewport, isMobile = false, hasTouch = false } of SHOTS) {
        const { context, page } = await bootStudySession(browser, {
            server,
            settings: createStudySettings(),
            viewport,
            isMobile,
            hasTouch,
        });
        // Wait for the mocked due batch, or the shot shows the practice-word
        // fallback the app falls back to when no review has arrived yet.
        await page.waitForFunction(
            () => /Due|Left/.test(document.querySelector('.jpdb-reader-newtab-count')?.textContent || ''),
            null,
            { timeout: 15_000 },
        ).catch(() => undefined);
        // Dismiss the step-plan intro so the shot shows an actual review card
        // rather than the panel explaining what a review looks like.
        const start = page.getByRole('button', { name: 'Start', exact: true }).first();
        if (await start.isVisible({ timeout: 2_000 }).catch(() => false)) await start.click();
        await revealVisibleCard(page);
        await page.waitForSelector('[data-newtab-action="grade"]', { timeout: 15_000 });
        await page.waitForTimeout(2_500); // pitch + audio + example enrichment settle
        const buffer = await page.screenshot();
        writeFileSync(join(OUT_DIR, name), buffer);
        console.log(`✓ ${name} ${viewport.width}x${viewport.height} (${buffer.length}B)`);
        await context.close();
    }
} finally {
    await browser.close();
    await server.close?.();
}
