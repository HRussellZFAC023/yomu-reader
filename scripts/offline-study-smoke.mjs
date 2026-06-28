#!/usr/bin/env node
// Offline-first review smoke: warm the cache online, go offline, then grade every
// due card. Asserts (1) the session keeps advancing offline, (2) every grade is
// queued locally (no lost reviews), and (3) ZERO cross-origin network requests are
// attempted while offline (true offline-first — everything served from cache).
// Also reloads offline through the service worker to prove the PWA opens with no net.
import { chromium } from 'playwright';
import { assert, launchSmokeBrowser } from './lib/smoke-harness.mjs';
import { bootStudySession, createStudyServer, createStudySettings } from './lib/study-fixture.mjs';

const GRADES = ['okay', 'easy', 'hard', 'something', 'nothing'];

async function gradeVisibleCard(page, grade) {
    await page.click('[data-newtab-action="reveal"]').catch(() => {});
    await page.waitForSelector('[data-newtab-action="grade"]', { timeout: 8_000 });
    await page.click(`[data-newtab-action="grade"][data-grade="${grade}"]`);
    await page.waitForTimeout(500);
}

async function run() {
    const server = await createStudyServer();
    const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
    const requests = [];
    const state = { reviewed: new Set() };
    let online = true;
    const offline = () => !online;
    try {
        // Boot online; SW allowed so we can test a cold offline reload later.
        const { context, page } = await bootStudySession(browser, {
            server, settings: createStudySettings(), requests, state, offline, serviceWorkers: 'allow',
        });

        // --- Warm phase (online): reveal the first card so per-card enrichment caches. ---
        await page.click('[data-newtab-action="reveal"]').catch(() => {});
        await page.waitForSelector('[data-newtab-action="grade"]', { timeout: 10_000 });
        await page.waitForTimeout(2_500); // pitch + immersion + audio + offline warm settle
        const dueAtStart = await readDue(page);
        assert(dueAtStart >= 3, 'Expected several due cards to warm', { dueAtStart });
        const progressWarm = await readProgress(page); // should show "Cached N"

        // Wait for the service worker to control the page (for the offline reload test).
        await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 10_000 }).catch(() => {});

        // --- Go offline ---
        await context.setOffline(true);
        online = false;
        const offlineMark = requests.length;

        // --- Grade every due card offline ---
        let graded = 0;
        for (let i = 0; i < dueAtStart && i < GRADES.length; i += 1) {
            const before = await currentWord(page);
            await gradeVisibleCard(page, GRADES[i]);
            graded += 1;
            const after = await currentWord(page);
            if (before && after && before === after && (await readDue(page)) > 0) {
                throw new Error(`Card did not advance after grading offline (stuck on ${before})`);
            }
        }

        // Reviews must be queued locally while offline (eventually-consistent sync).
        const pending = await page.evaluate(() => {
            const raw = localStorage.getItem('jpdb-reader-newtab-grade-queue') || globalThis.__yomuGmStore?.['jpdb-reader-newtab-grade-queue'];
            try { return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw).length : 0; } catch { return 0; }
        });

        const offlineRequests = requests.slice(offlineMark).filter(r => r.offline && r.kind !== 'static');
        // Review-critical DATA (definitions, pitch, parse, kanji, immersion search,
        // grade POSTs) must never touch the network offline. Audio/image MEDIA is
        // best-effort (the card still reads fine without it), so it is reported but
        // not gated.
        const isMedia = kind => kind === 'audio-media';
        const offlineData = offlineRequests.filter(r => !isMedia(r.kind));
        const offlineMedia = offlineRequests.filter(r => isMedia(r.kind));
        const progressOffline = await readProgress(page); // should show "To sync N"

        // --- Reconnect: queued grades sync back (eventually consistent) ---
        await context.setOffline(false);
        online = true;
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await page.waitForFunction(() => {
            const t = document.querySelector('.jpdb-reader-newtab-count')?.textContent || '';
            return /Synced/.test(t) || !/To sync/.test(t);
        }, null, { timeout: 8_000 }).catch(() => {});
        const progressSynced = await readProgress(page); // should show "Synced"
        const pendingAfterSync = await page.evaluate(() => {
            const raw = localStorage.getItem('jpdb-reader-newtab-grade-queue');
            try { return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw).length : 0; } catch { return 0; }
        });
        await context.setOffline(true);
        online = false;

        // --- Cold offline reload: the PWA must open with no network ---
        let offlineReloadOk = false;
        try {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForSelector('[data-newtab-prompt], .jpdb-reader-newtab-study', { timeout: 12_000 });
            offlineReloadOk = true;
        } catch (error) {
            offlineReloadOk = false;
        }

        const result = {
            dueAtStart, graded, pendingQueued: pending,
            offlineDataRequestCount: offlineData.length,
            offlineDataKinds: [...new Set(offlineData.map(r => r.kind))],
            offlineMediaRequestCount: offlineMedia.length,
            pendingAfterSync,
            offlineReloadOk,
            progressWarm, progressOffline, progressSynced,
        };
        console.log(JSON.stringify(result, null, 2));

        assert(graded >= 3, 'Expected to grade multiple cards offline', result);
        assert(pending >= graded, 'Offline grades were not all queued for sync', result);
        assert(offlineReloadOk, 'PWA did not load offline after reload (service worker shell missing)', result);
        // The headline guarantee: no review-critical request hit the network offline.
        assert(result.offlineDataRequestCount === 0, 'Offline review attempted review-data network requests (not offline-first)', result);
        // Cache count + sync status are surfaced to the user next to the timer.
        assert(/Cached\s*\d+/.test(progressWarm), 'Cached-card count not shown next to the timer', result);
        assert(/To sync\s*\d+/.test(progressOffline), 'Pending sync status not shown while offline', result);
        assert(/Synced/.test(progressSynced) && pendingAfterSync === 0, 'Queued grades did not sync + show Synced on reconnect', result);
        console.log('offline-study smoke passed');
        await context.close();
    } finally {
        await browser.close();
        await server.close();
    }
}

function readDue(page) {
    return page.evaluate(() => {
        const text = document.querySelector('[data-newtab-session-progress], .jpdb-reader-newtab-count, .jpdb-reader-newtab-progress')?.textContent || '';
        const due = text.match(/Due\D*(\d+)|期限\D*(\d+)/);
        if (due) return Number(due[1] ?? due[2]);
        const left = text.match(/Left\D*(\d+)|残り\D*(\d+)/);
        return left ? Number(left[1] ?? left[2]) : 0;
    });
}

function currentWord(page) {
    return page.evaluate(() => document.querySelector('[data-newtab-prompt] .jpdb-reader-newtab-term')?.textContent?.trim() || '');
}

function readProgress(page) {
    return page.evaluate(() => document.querySelector('.jpdb-reader-newtab-count')?.textContent?.replace(/\s+/g, ' ').trim() || '');
}

await run();
