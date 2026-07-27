import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5174';
const artifactDir = path.resolve(
    process.env.NAME_CARD_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-name-card',
);
const activityId = 'activity:lesson-zero-name-card-draft';
const requiredBindings = new Set([
    'lesson-zero:greeting-rie-model',
    'lesson-zero:sentence-frame:noun-link:response',
]);
const playback = JSON.parse(await readFile(
    path.resolve('public/academy/audio/learning-voice-playback.json'),
    'utf8',
));
const audioEntries = Object.freeze(playback.entries.filter(entry =>
    entry.bindings?.some(binding => requiredBindings.has(binding.lineId))));
const audioPaths = Object.freeze(audioEntries.map(entry => entry.url).sort());
const audioPathByBinding = new Map(audioEntries.flatMap(entry =>
    entry.bindings
        .filter(binding => requiredBindings.has(binding.lineId))
        .map(binding => [binding.lineId, entry.url])));
const allViewports = [
    { viewport: { width: 320, height: 700 }, name: 'phone-320' },
    { viewport: { width: 390, height: 844 }, name: 'phone-390' },
    { viewport: { width: 1024, height: 1366 }, name: 'tablet-1024' },
    { viewport: { width: 1440, height: 900 }, name: 'desktop-1440' },
];
const requestedViewport = process.env.NAME_CARD_VIEWPORT;
const viewports = requestedViewport
    ? allViewports.filter(scenario => scenario.name === requestedViewport)
    : allViewports;

assert.equal(audioEntries.length, 2, 'Name-card proof expects two immutable accepted Rie lines.');
assert.equal(audioPaths.length, 2, 'Name-card proof expects two distinct accepted audio assets.');
assert.ok(viewports.length, `Unknown name-card viewport: ${requestedViewport ?? 'missing'}`);
await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
});
try {
    for (const scenario of viewports) await verifyRoute(scenario);
    await Promise.all(viewports.flatMap(({ name }) => [
        'build',
        'build-repair',
        'transfer',
        'transfer-repair',
        'complete',
    ].map(stage => access(path.join(artifactDir, `${name}-${stage}.png`)))));
    console.log(`Lesson Zero name-card route passed: ${viewports.map(({ name }) => name).join(', ')}.`);
} finally {
    await browser.close();
}

async function verifyRoute({ viewport, name }) {
    const context = await browser.newContext({
        viewport,
        locale: 'en-GB',
        reducedMotion: 'reduce',
    });
    const protectedMediaRequests = [];
    const playableSilence = silentWave();
    await context.route('**/academy/media/audio/**', async route => {
        protectedMediaRequests.push(route.request().url());
        await route.fulfill({
            status: 200,
            contentType: 'audio/wav',
            headers: { 'cache-control': 'no-store' },
            body: playableSilence,
        });
    });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    const playedAudioPaths = [];
    const fallbackRequests = [];
    const failedResponses = [];
    const failedResponseDetails = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', response => {
        const url = new URL(response.url());
        if (response.status() >= 400 && response.status() !== 401 && response.status() !== 404) {
            const failure = { status: response.status(), url: response.url() };
            failedResponses.push(failure);
            failedResponseDetails.push(response.text()
                .then(body => ({ ...failure, body: body.slice(0, 500) }))
                .catch(error => ({ ...failure, body: `<unreadable: ${error.message}>` })));
        }
        if (audioPaths.includes(url.pathname)) {
            playedAudioPaths.push({ path: url.pathname, status: response.status() });
        }
    });
    page.on('request', request => {
        const url = request.url();
        if (request.resourceType() !== 'script'
            && /audio[_/-]?query|\/synthesis(?:[/?]|$)|\/api\/tts(?:[/?]|$)/iu.test(url)) {
            fallbackRequests.push(url);
        }
    });

    const runId = `name-card-${name}-${Date.now()}`;
    await reachActivity(page, runId);
    await expectState(page, 'active', 'build');
    const screen = page.locator('.academy-name-card-screen');
    assert.equal(await screen.locator('input').count(), 0,
        `${name}: the saved profile name must not be requested again`);
    assert.equal(await screen.getByText('ヘンリー', { exact: true }).count() >= 1, true,
        `${name}: the naming moment must default to the learner's katakana name`);
    assert.equal(
        await screen.locator('[data-name-variant="katakana"]').getAttribute('aria-pressed'),
        'true',
        `${name}: katakana must be the default card spelling`,
    );
    assert.equal(await screen.getByText(/One true role|language you study|truth|boundary/i).count(), 0,
        `${name}: discarded personal-facts copy must stay absent`);
    await assertImagesLoaded(page);
    await screenshot(page, name, 'build');
    await assertLayout(page, viewport.width, `${name} build`);
    await assertAccessible(page);

    await playVisibleAudio(page, 'lesson-zero:greeting-rie-model');

    await chooseToken(page, 'desu');
    await chooseToken(page, 'learner-name');
    await clickButton(page, 'Check');
    await expectState(page, 'active', 'build-result');
    assert.equal(await screen.getByText('1. your name', { exact: false }).count(), 0,
        `${name}: the word-order pattern must remain earned help`);
    await clickButton(page, 'Show the pattern');
    await screen.getByText('1. your name', { exact: false }).waitFor();
    await assertLayout(page, viewport.width, `${name} build repair`);
    await assertAccessible(page);
    await screenshot(page, name, 'build-repair');

    await clickButton(page, 'Try again');
    await expectState(page, 'active', 'build');
    await chooseToken(page, 'learner-name');
    await screen.locator('.academy-name-card-back').click();
    await page.waitForFunction(() =>
        window.__yomuAcademy?.checkpoint?.lessonZeroNameCardProgress?.status === 'paused'
        && window.__yomuAcademy?.checkpoint?.activityId !== 'activity:lesson-zero-name-card-draft');
    assert.equal(
        await page.evaluate(() => window.__yomuAcademy?.checkpoint?.route),
        'campus',
        `${name}: Back must return to the campus scene that launched the name-card exercise`,
    );
    const paused = await page.evaluate(() =>
        window.__yomuAcademy?.checkpoint?.lessonZeroNameCardProgress);
    assert.deepEqual(paused.selectedTokenIds, ['learner-name']);
    assert.equal(paused.nameVariant, 'katakana');
    assert.equal(JSON.stringify(paused).includes('Henry'), false);
    assert.equal(JSON.stringify(paused).includes('ヘンリー'), false);

    await openActivity(page);
    await expectState(page, 'active', 'build');
    assert.deepEqual(
        await page.evaluate(() =>
            window.__yomuAcademy?.checkpoint?.lessonZeroNameCardProgress?.selectedTokenIds),
        ['learner-name'],
        `${name}: reopening must resume the saved token order`,
    );
    await chooseToken(page, 'desu');
    await clickButton(page, 'Check');
    await expectState(page, 'active', 'transfer');
    assert.equal(
        await page.evaluate(() =>
            window.__yomuAcademy?.checkpoint?.lessonZeroNameCardProgress?.attempts.length),
        2,
        `${name}: the build lapse and repaired pass must persist`,
    );
    await assertLayout(page, viewport.width, `${name} transfer`);
    await assertAccessible(page);
    await screenshot(page, name, 'transfer');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectState(page, 'active', 'transfer');
    assert.equal(
        await page.evaluate(() =>
            window.__yomuAcademy?.checkpoint?.lessonZeroNameCardProgress?.stage),
        'transfer',
        `${name}: reload must resume at the changed-person check`,
    );

    await chooseTransfer(page, 'learner');
    await clickButton(page, 'Check the card');
    await expectState(page, 'active', 'transfer-result');
    await clickButton(page, 'Show the pattern');
    await assertLayout(page, viewport.width, `${name} transfer repair`);
    await assertAccessible(page);
    await screenshot(page, name, 'transfer-repair');

    await clickButton(page, 'Try again');
    await expectState(page, 'active', 'transfer');
    await chooseTransfer(page, 'rie');
    await clickButton(page, 'Check the card');
    await expectState(page, 'complete', 'complete');
    await page.waitForFunction(() =>
        window.__yomuAcademy?.checkpoint?.lessonZeroNameCardProgress?.status === 'complete');
    assert.equal(await screen.getByText('ヘンリーです。', { exact: true }).count(), 1);
    await playVisibleAudio(page, 'lesson-zero:sentence-frame:noun-link:response');
    await assertImagesLoaded(page);
    await assertLayout(page, viewport.width, `${name} complete`);
    await assertAccessible(page);
    await screenshot(page, name, 'complete');

    const evidence = await readLearnerEvidence(page, runId);
    assertNameCardEvidence(evidence, name);
    await assertAllAudioAssets(context, name);
    assert.deepEqual(
        new Set(playedAudioPaths.map(response => response.path)),
        new Set(audioPaths),
        `${name}: both accepted Rie lines must play through the real route`,
    );
    assert.equal(
        playedAudioPaths.every(response =>
            response.status === 200 || response.status === 206 || response.status === 304),
        true,
        `${name}: every played static line must return 200, 206, or valid cache revalidation`,
    );
    assert.deepEqual(fallbackRequests, [], `${name}: accepted audio must not fall through to generated TTS`);
    assert.ok(
        protectedMediaRequests.some(url => url.endsWith('/persona/royal-days.flac')),
        `${name}: the story must request its protected Persona soundtrack`,
    );
    assert.equal(
        protectedMediaRequests.some(url => url.includes('/media/audio/media/audio/')),
        false,
        `${name}: protected soundtrack paths must not duplicate the storage prefix`,
    );

    await clickButton(page, 'Put it on the desk');
    await expectRoute(page, 'aakash-meet');
    await openActivity(page);
    await expectState(page, 'complete', 'complete');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectState(page, 'complete', 'complete');

    if (failedResponses.length > 0) {
        console.error(JSON.stringify({
            viewport: name,
            failedResponses: await Promise.all(failedResponseDetails),
        }, null, 2));
    }
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedResponses, []);
    assert.deepEqual(unexpectedConsoleErrors(consoleErrors), []);
    await context.close();
}

function silentWave() {
    const sampleRate = 8_000;
    const samples = 800;
    const dataBytes = samples * 2;
    const buffer = Buffer.alloc(44 + dataBytes);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataBytes, 40);
    return buffer;
}

async function reachActivity(page, runId) {
    await page.goto(`${baseUrl}/academy/?qa-auth=bypass&qa-run=${runId}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.getByRole('textbox').fill('YOMU-LOCAL');
    await page.getByRole('button', { name: 'Open the doors' }).click();
    await page.locator('input[name="displayName"]').fill('Henry');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('textarea[name="learningReason"]').fill(
        'To speak with the people in my Japanese class',
    );
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('input[name="portrait"]').first().check();
    await page.getByRole('button', { name: 'That’s me' }).click();
    const introduction = page.locator('[data-academy-screen="rie-introduction"]');
    await introduction.waitFor();
    const action = introduction.locator('.academy-rie-introduction-primary');
    await action.waitFor();
    if ((await action.textContent())?.trim() !== 'Come in') {
        await action.click();
        await page.waitForFunction(() => {
            const button = document.querySelector('.academy-rie-introduction-primary');
            return button?.textContent?.trim() === 'Come in' && !button.disabled;
        });
    }
    await action.evaluate(button => button.click());
    const start = page.locator('.academy-start-screen[data-academy-route="start"]');
    await start.waitFor();
    await start.locator('[data-start-route="lesson-zero"]').click();
    await page.locator('[data-story-arc-id="arc:bridge:opening-arrival"]').waitFor();
    await advanceOpeningArrival(page);
    await page.locator('.academy-story-next').click();
    await page.getByRole('button', { name: /Read the board and enter class/ }).waitFor();
    await openActivity(page);
    await page.locator('.academy-name-card-screen').waitFor();
}

async function advanceOpeningArrival(page) {
    for (let index = 0; index < 40; index += 1) {
        const moment = await page.locator('[data-story-arc-id="arc:bridge:opening-arrival"]')
            .getAttribute('data-story-moment');
        if (moment === 'complete') return;
        const choice = page.locator('[data-story-option-id]').first();
        const action = page.locator('.academy-vn-action-slot .academy-vn-primary-action').first();
        if (await choice.count()) await choice.click();
        else if (await action.count()) await action.click();
        else throw new Error(`Opening arrival stalled at ${moment ?? 'unknown'}.`);
        await page.waitForTimeout(40);
    }
    throw new Error('Opening arrival did not complete within 40 actions.');
}

async function openActivity(page) {
    await page.evaluate(async selectedActivityId => {
        const app = window.__yomuAcademy;
        if (!app || typeof app.go !== 'function') throw new Error('Academy QA route seam is unavailable.');
        await app.go('source-activity', {
            lessonId: 'lesson:foundation-00',
            activityId: selectedActivityId,
        });
    }, activityId);
}

async function expectState(page, status, stage) {
    await page.locator(
        `.academy-name-card-screen[data-session-status="${status}"][data-session-stage="${stage}"]`,
    ).waitFor();
}

async function expectRoute(page, route) {
    await page.waitForFunction(expected => window.__yomuAcademy?.checkpoint?.route === expected, route);
}

async function clickButton(page, name) {
    const button = page.getByRole('button', { name, exact: true });
    await button.waitFor();
    await button.click();
}

async function chooseToken(page, tokenId) {
    const bank = page.locator(`.academy-name-card-bank [data-token-id="${tokenId}"]`);
    await bank.waitFor({ state: 'attached' });
    await bank.scrollIntoViewIfNeeded();
    await bank.click();
    await page.locator(`.academy-name-card-rail [data-token-id="${tokenId}"]`).waitFor();
}

async function chooseTransfer(page, transferId) {
    const choice = page.locator(`[data-transfer-id="${transferId}"]`);
    await choice.waitFor({ state: 'attached' });
    await choice.scrollIntoViewIfNeeded();
    await choice.click();
    for (let index = 0; index < 40; index += 1) {
        if (await choice.getAttribute('aria-pressed') === 'true') return;
        await page.waitForTimeout(25);
    }
    throw new Error(`Transfer choice ${transferId} did not become selected.`);
}

async function playVisibleAudio(page, bindingId) {
    const expectedPath = audioPathByBinding.get(bindingId);
    assert.ok(expectedPath, `No accepted audio path for ${bindingId}.`);
    const japanese = audioEntries.find(entry =>
        entry.bindings.some(binding => binding.lineId === bindingId))?.japanese;
    const button = page.locator(`.academy-name-card-action-listen[data-audio-term="${japanese}"]`);
    await button.waitFor();
    const handle = await button.elementHandle();
    await button.click();
    await page.waitForFunction(element => !element.disabled, handle);
    assert.equal(
        await page.locator('.academy-name-card-live').getByText('The audio did not play.', { exact: true }).count(),
        0,
        `Accepted static audio failed for ${bindingId}.`,
    );
}

async function assertAllAudioAssets(context, label) {
    for (const assetPath of audioPaths) {
        const response = await context.request.get(`${baseUrl}${assetPath}`, {
            headers: { Range: 'bytes=0-31' },
        });
        assert.ok(
            response.status() === 200 || response.status() === 206,
            `${label}: ${assetPath} returned ${response.status()}`,
        );
        assert.match(
            response.headers()['content-type'] ?? '',
            /^audio\/(?:ogg|opus)/u,
            `${label}: ${assetPath} must be served as audio`,
        );
    }
}

async function assertImagesLoaded(page) {
    for (const image of await page.locator('.academy-name-card-screen img:visible').all()) {
        const source = await image.getAttribute('src');
        await image.scrollIntoViewIfNeeded();
        assert.equal(
            await image.evaluate(node => new Promise(resolve => {
                if (!(node instanceof HTMLImageElement)) {
                    resolve(false);
                    return;
                }
                if (node.complete) {
                    resolve(node.naturalWidth > 0);
                    return;
                }
                node.addEventListener('load', () => resolve(node.naturalWidth > 0), { once: true });
                node.addEventListener('error', () => resolve(false), { once: true });
                window.setTimeout(() => resolve(false), 10_000);
            })),
            true,
            `Visible image failed to load within 10 seconds: ${source ?? 'missing src'}`,
        );
    }
}

async function assertLayout(page, expectedWidth, label) {
    const geometry = await page.locator('.academy-name-card-screen').evaluate(screen => {
        const viewportWidth = document.documentElement.clientWidth;
        const visible = selector => [...screen.querySelectorAll(selector)]
            .map(node => ({ node, box: node.getBoundingClientRect() }))
            .filter(({ box }) => box.width > 0 && box.height > 0);
        const screenBox = screen.getBoundingClientRect();
        const visibleControls = visible('button').map(({ node, box }) => ({
            label: node.textContent?.trim() ?? '',
            width: box.width,
            height: box.height,
        }));
        const overflowing = visible('*')
            .filter(({ node }) => !node.closest('.academy-background'))
            .filter(({ box }) => box.left < -1 || box.right > viewportWidth + 1)
            .map(({ node, box }) => ({
                element: `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`,
                left: box.left,
                right: box.right,
            }));
        const clippedText = visible(
            '.academy-name-card-title, .academy-name-card-progress, .academy-name-card-dialogue, '
            + '.academy-name-card-section-title, .academy-name-card-builder-label, '
            + '.academy-name-card-model-line, .academy-name-card-model-meaning, '
            + '.academy-name-card-name-choice-value, .academy-name-card-transfer-line, '
            + '.academy-name-card-final-line, .academy-name-card-response-japanese',
        ).filter(({ node }) => node.scrollWidth > node.clientWidth + 1
            || node.scrollHeight > node.clientHeight + 1)
            .map(({ node }) => `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`);
        return {
            documentWidth: document.documentElement.scrollWidth,
            screenLeft: screenBox.left,
            screenRight: screenBox.right,
            undersized: visibleControls.filter(control => control.width < 44 || control.height < 44),
            overflowing,
            clippedText,
            paperWidth: screen.querySelector('.academy-name-card-paper')?.getBoundingClientRect().width ?? 0,
            ancestry: [...document.querySelectorAll(
                '#yomu-academy, .academy-root, .academy-screen-host, '
                + '.academy-name-card-screen, .academy-name-card-shell',
            )].map(node => {
                const box = node.getBoundingClientRect();
                const style = getComputedStyle(node);
                return {
                    selector: node.id ? `#${node.id}` : `.${[...node.classList].join('.')}`,
                    left: box.left,
                    right: box.right,
                    width: box.width,
                    scrollLeft: node.scrollLeft,
                    scrollWidth: node.scrollWidth,
                    clientWidth: node.clientWidth,
                    marginLeft: style.marginLeft,
                    marginRight: style.marginRight,
                    transform: style.transform,
                    position: style.position,
                };
            }),
        };
    });
    assert.equal(geometry.documentWidth, expectedWidth, `${label}: document width`);
    assert.ok(geometry.screenLeft >= -1, `${label}: screen starts inside viewport`);
    assert.ok(geometry.screenRight <= expectedWidth + 1, `${label}: screen ends inside viewport`);
    assert.ok(geometry.paperWidth >= Math.min(280, expectedWidth - 16), `${label}: paper uses readable width`);
    assert.deepEqual(geometry.undersized, [], `${label}: controls must be at least 44px`);
    assert.deepEqual(
        geometry.overflowing,
        [],
        `${label}: no element may overflow horizontally; ${JSON.stringify(geometry.ancestry)}`,
    );
    assert.deepEqual(geometry.clippedText, [], `${label}: text must not clip`);
}

async function assertAccessible(page) {
    const result = await new AxeBuilder({ page })
        .include('.academy-name-card-screen')
        .analyze();
    const blocking = result.violations.filter(violation =>
        violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(
        blocking.map(violation => ({
            id: violation.id,
            help: violation.help,
            nodes: violation.nodes.map(node => ({
                target: node.target,
                summary: node.failureSummary,
            })),
        })),
        [],
    );
}

async function readLearnerEvidence(page, databaseName) {
    return page.evaluate(name => new Promise((resolve, reject) => {
        const pending = indexedDB.open(`yomu-academy-qa-${name}`);
        pending.onerror = () => reject(pending.error);
        pending.onsuccess = () => {
            const database = pending.result;
            const request = database.transaction('learner-events').objectStore('learner-events').getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                database.close();
                resolve(request.result);
            };
        };
    }), databaseName);
}

function assertNameCardEvidence(events, label) {
    const attempts = events.filter(event =>
        event.kind === 'attempt-recorded' && event.activityId === activityId);
    assert.equal(attempts.length, 4, `${label}: build and transfer each record one lapse and one pass`);
    assert.deepEqual(
        attempts.map(event => event.responseKind),
        [
            'tapped-name-card-frame',
            'tapped-name-card-frame',
            'selected-changed-person-name-card',
            'selected-changed-person-name-card',
        ],
        `${label}: evidence must preserve the production and changed-person phases`,
    );
    assert.equal(attempts.filter(event => event.outcome === 'lapse').length, 2);
    const scheduled = events.filter(event =>
        event.kind === 'review-scheduled'
        && event.eventId.includes('review:lesson-zero:name-card:desu'));
    assert.equal(scheduled.length, 1, `${label}: exactly one durable SRS item is scheduled`);
    assert.equal(
        events.filter(event =>
            event.kind === 'journal-line-recorded'
            && event.journalLineId === 'journal:lesson-zero:first-name-card').length,
        1,
        `${label}: the learner journal records the completed naming moment once`,
    );
    assert.equal(
        events.filter(event =>
            event.kind === 'scene-completed'
            && event.sceneId === 'scene:lesson-zero-first-name-card').length,
        1,
        `${label}: the naming scene completes once`,
    );
    const support = events.filter(event =>
        event.kind === 'support-used' && event.activityId === activityId);
    assert.equal(support.length, 6, `${label}: both deliberate lapses earn the three supports`);
}

async function screenshot(page, name, stage) {
    await page.screenshot({
        path: path.join(artifactDir, `${name}-${stage}.png`),
        fullPage: true,
    });
}

function unexpectedConsoleErrors(messages) {
    return messages.filter(message =>
        !/Failed to load resource: the server responded with a status of (401|404)/u.test(message)
        && !/QA auth bypass active/u.test(message));
}
