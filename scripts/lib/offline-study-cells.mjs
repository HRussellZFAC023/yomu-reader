import * as browsers from 'playwright';
import * as harness from './smoke-harness.mjs';
import * as studyFixture from './study-fixture.mjs';

// Former offline-study-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertOfflineStudy(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    if (_hostEngine !== 'chromium') return;
const _sourceDir = new URL('..', import.meta.url).pathname;

    const { assert } = harness;
    const { bootStudySession, createStudyServer, createStudySettings } = studyFixture;
// Offline-first review smoke: warm the cache online, go offline, then grade every
// due card. Asserts (1) the session keeps advancing offline, (2) every grade is
// queued locally (no lost reviews), and (3) ZERO cross-origin network requests are
// attempted while offline (true offline-first — everything served from cache).
// Also reloads offline through the service worker to prove the PWA opens with no net.

// The fixture reviews Jiten cards, which use Jiten's four grades: Again,
// Hard, Good and Easy (nothing, hard, okay, easy).
const GRADES = ['okay', 'easy', 'hard', 'okay', 'nothing'];

async function gradeVisibleCard(page, grade) {
    const before = await currentWord(page);
    await revealVisibleCard(page);
    await page.waitForSelector('[data-newtab-action="grade"]', { timeout: 8_000 });
    await page.click(`[data-newtab-action="grade"][data-grade="${grade}"]`);
    // The FIRST offline grade raises the connection-lost prompt (WaniKani-
    // style); choosing Continue Offline arms silent queueing for the rest of
    // the outage — later grades must NOT prompt again, which the loop's
    // advance assertion enforces.
    await page.waitForFunction(before => {
        const prompt = document.querySelector('[data-connection-lost-action="continue"]');
        const next = document.querySelector('[data-newtab-prompt] .jpdb-reader-newtab-term')?.textContent?.trim();
        const progress = document.querySelector('[data-newtab-session-progress], .jpdb-reader-newtab-count, .jpdb-reader-newtab-progress')?.textContent ?? '';
        return prompt?.getClientRects().length || (next && next !== before) || /(?:Due|期限)\D*0\b|(?:Left|残り)\D*0\b/.test(progress);
    }, before);
    const continueOffline = page.locator('[data-connection-lost-action="continue"]');
    if (await continueOffline.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await continueOffline.click();
    }
    await page.waitForFunction(before => {
        const next = document.querySelector('[data-newtab-prompt] .jpdb-reader-newtab-term')?.textContent?.trim();
        const progress = document.querySelector('[data-newtab-session-progress], .jpdb-reader-newtab-count, .jpdb-reader-newtab-progress')?.textContent ?? '';
        return (next && next !== before) || /(?:Due|期限)\D*0\b|(?:Left|残り)\D*0\b/.test(progress);
    }, before);
}

async function revealVisibleCard(page) {
    const finalRevealStep = page.locator('[data-study-step-kind="final-reveal"]').first();
    if (await finalRevealStep.count()) {
        await finalRevealStep.click();
        return;
    }
    await page.click('[data-newtab-action="reveal"]').catch(() => {});
}

async function run() {
    const server = await createStudyServer();
    const browser = _hostBrowser;
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
        await revealVisibleCard(page);
        await page.waitForSelector('[data-newtab-action="grade"]', { timeout: 10_000 });
        await page.waitForFunction(() => /Cached\s*[1-9]\d*/.test(document.querySelector('.jpdb-reader-newtab-count')?.textContent ?? '')
            && navigator.serviceWorker?.controller);
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
            const pending = JSON.parse(localStorage.getItem('jpdb-reader-newtab-grade-queue') || '[]');
            return /Synced/.test(t) && pending.length === 0;
        }, null, { timeout: 8_000 });
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

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}
