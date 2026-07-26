import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5174';
const artifactDir = path.resolve(
    process.env.SENTENCE_FRAME_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-sentence-frames',
);
const activityId = 'activity:lesson-zero-build-sentence-frames';
const playback = JSON.parse(await readFile(
    path.resolve('public/academy/audio/learning-voice-playback.json'),
    'utf8',
));
const audioPaths = Object.freeze(playback.entries
    .filter(entry => entry.surface === 'lesson-zero-sentence-frames')
    .map(entry => entry.url)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort());
const audioUrlByJapanese = new Map(playback.entries
    .filter(entry => entry.surface === 'lesson-zero-sentence-frames')
    .map(entry => [entry.japanese, entry.url]));
const viewports = [
    { viewport: { width: 320, height: 700 }, name: 'phone-320' },
    { viewport: { width: 390, height: 844 }, name: 'phone-390' },
    { viewport: { width: 1024, height: 1366 }, name: 'tablet-1024' },
    { viewport: { width: 1440, height: 900 }, name: 'desktop-1440' },
];

assert.equal(audioPaths.length, 14, 'Sentence-frame proof expects 14 immutable accepted audio assets.');
await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
});
try {
    for (const scenario of viewports) await verifyRoute(scenario);
    await Promise.all(viewports.flatMap(({ name }) => [
        'welcome',
        'practice-repair',
        'transfer',
        'transfer-repair',
        'complete',
    ].map(stage => access(path.join(artifactDir, `${name}-${stage}.png`)))));
    console.log('Lesson Zero sentence-frame route passed on two phones, portrait tablet, and desktop.');
} finally {
    await browser.close();
}

async function verifyRoute({ viewport, name }) {
    const context = await browser.newContext({
        viewport,
        locale: 'en-GB',
        reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    const playedAudioPaths = [];
    const fallbackRequests = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', response => {
        const url = new URL(response.url());
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

    const runId = `sentence-${name}-${Date.now()}`;
    await reachActivity(page, runId);
    await expectState(page, 'ready', 'teach');
    assert.equal(await page.getByText('You do not need to read kana yet.', { exact: false }).count(), 0);
    await assertImagesLoaded(page);
    await assertLayout(page, viewport.width, `${name} welcome`);
    await assertAccessible(page);
    await screenshot(page, name, 'welcome');

    const definition = await page.evaluate(async () => {
        const { loadLessonZeroContent } = await import('/src/academy/content/lesson-zero.ts');
        const { createLessonZeroSentenceFrameDefinition } =
            await import('/src/academy/content/lesson-zero-sentence-frames.ts');
        const content = await loadLessonZeroContent();
        const activity = content.lesson.activities.find(candidate =>
            candidate.id === 'activity:lesson-zero-build-sentence-frames');
        return createLessonZeroSentenceFrameDefinition(activity);
    });

    await clickButton(page, 'Start with “I am…”');
    for (const [index, frame] of definition.frames.entries()) {
        await expectFrame(page, frame.id, 'teach');
        await playVisibleAudio(page, '.academy-sentence-frame-example');
        await clickButton(page, 'Try this turn');
        await expectFrame(page, frame.id, 'build');

        if (index === 0) {
            await chooseOrder(page, frame.target.bankOrder);
            await clickButton(page, 'Check the sentence');
            await expectFrame(page, frame.id, 'result');
            assert.equal(await page.locator('[data-repair-model]').count(), 0);
            await clickButton(page, 'Show the answer');
            await page.locator('[data-repair-model="identity"]').waitFor();
            await playVisibleAudio(page, '[data-repair-model="identity"]');
            await assertLayout(page, viewport.width, `${name} guided repair`);
            await assertAccessible(page);
            await screenshot(page, name, 'practice-repair');
            await clickButton(page, 'Rebuild the sentence');
            await expectFrame(page, frame.id, 'build');
        }

        await chooseOrder(page, frame.target.correctOrder);
        await clickButton(page, 'Check the sentence');
        await expectFrame(page, frame.id, 'result');
        await playVisibleAudio(page, '.academy-sentence-frame-response');
        if (index < definition.frames.length - 1) {
            await clickButton(page, 'Use the next shape');
        } else {
            await clickButton(page, 'Try all five without the patterns');
        }
    }

    await expectFrame(page, 'identity', 'transfer-build');
    assert.equal(await page.locator('.academy-sentence-frame-pattern').count(), 0);
    await assertLayout(page, viewport.width, `${name} transfer`);
    await assertAccessible(page);
    await screenshot(page, name, 'transfer');

    const first = definition.frames[0];
    await chooseOrder(page, first.target.bankOrder);
    await clickButton(page, 'Check the sentence');
    await expectFrame(page, first.id, 'transfer-result');
    await clickButton(page, 'Show the answer');
    await page.locator('[data-repair-model="identity"]').waitFor();
    await playVisibleAudio(page, '[data-repair-model="identity"]');
    await assertLayout(page, viewport.width, `${name} recall repair`);
    await assertAccessible(page);
    await screenshot(page, name, 'transfer-repair');
    await clickButton(page, 'Rebuild the sentence');
    await chooseOrder(page, first.target.correctOrder);
    await clickButton(page, 'Check the sentence');
    await expectFrame(page, first.id, 'transfer-result');
    await clickButton(page, 'Recall the next sentence');

    const second = definition.frames[1];
    await expectFrame(page, second.id, 'transfer-build');
    await chooseToken(page, second.target.correctOrder[0]);
    await page.locator('.academy-sentence-frame-back').click();
    await page.waitForFunction(() =>
        window.__yomuAcademy?.checkpoint?.lessonZeroSentenceFrameProgress?.status === 'paused');
    await page.waitForFunction(() => window.__yomuAcademy?.checkpoint?.route !== 'source-activity');
    await openActivity(page);
    await expectFrame(page, second.id, 'transfer-build');
    assert.equal(
        await page.locator(`.academy-sentence-frame-selected-rail [data-token-id="${second.target.correctOrder[0]}"]`).count(),
        1,
        `${name}: leaving and reopening must preserve the selected recall token`,
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectFrame(page, second.id, 'transfer-build');
    assert.equal(
        await page.locator(`.academy-sentence-frame-selected-rail [data-token-id="${second.target.correctOrder[0]}"]`).count(),
        1,
        `${name}: reload must preserve the selected recall token`,
    );
    await chooseOrder(page, second.target.correctOrder.slice(1));
    await clickButton(page, 'Check the sentence');
    await expectFrame(page, second.id, 'transfer-result');
    await clickButton(page, 'Recall the next sentence');

    for (const frame of definition.frames.slice(2)) {
        await expectFrame(page, frame.id, 'transfer-build');
        await chooseOrder(page, frame.target.correctOrder);
        await clickButton(page, 'Check the sentence');
        if (frame.id !== 'parallel') {
            await expectFrame(page, frame.id, 'transfer-result');
            await clickButton(page, 'Recall the next sentence');
        }
    }

    await expectState(page, 'complete', 'complete');
    await page.waitForFunction(() =>
        window.__yomuAcademy?.checkpoint?.lessonZeroSentenceFrameProgress?.status === 'complete');
    assert.equal(await page.locator('.academy-sentence-frame-finished-line').count(), 5);
    await assertImagesLoaded(page);
    await assertLayout(page, viewport.width, `${name} completion`);
    await assertAccessible(page);
    await screenshot(page, name, 'complete');

    const evidence = await readLearnerEvidence(page, runId);
    assertSentenceFrameEvidence(evidence, name);
    await assertAllAudioAssets(context, name);
    assert.equal(
        playedAudioPaths.every(response =>
            response.status === 200 || response.status === 206 || response.status === 304),
        true,
        `${name}: every played static line must return 200, 206, or a valid cache revalidation`,
    );
    assert.equal(
        new Set(playedAudioPaths.map(response => response.path)).size >= 10,
        true,
        `${name}: the real route must play its examples, replies, and earned model`,
    );
    assert.deepEqual(fallbackRequests, [], `${name}: accepted audio must not fall through to generated TTS`);

    await clickButton(page, 'Continue your day');
    await expectRoute(page, 'aakash-meet');
    await openActivity(page);
    await expectState(page, 'complete', 'complete');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectState(page, 'complete', 'complete');

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unexpectedConsoleErrors(consoleErrors), []);
    await context.close();
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
    await page.locator('.academy-sentence-frame-screen').waitFor();
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
        `.academy-sentence-frame-screen[data-session-status="${status}"][data-session-stage="${stage}"]`,
    ).waitFor();
}

async function expectFrame(page, frameId, stage) {
    await page.locator(
        `.academy-sentence-frame-screen[data-frame-id="${frameId}"][data-session-stage="${stage}"]`,
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

async function chooseOrder(page, order) {
    for (const tokenId of order) await chooseToken(page, tokenId);
}

async function chooseToken(page, tokenId) {
    const token = page.locator(`.academy-sentence-frame-bank [data-token-id="${tokenId}"]`);
    await token.waitFor();
    await token.click();
    await page.locator(`.academy-sentence-frame-selected-rail [data-token-id="${tokenId}"]`).waitFor();
}

async function playVisibleAudio(page, rootSelector) {
    const root = page.locator(rootSelector);
    const button = root.locator('.academy-sentence-frame-action-listen');
    await button.waitFor();
    const japanese = await button.getAttribute('data-audio-term');
    const expectedPath = audioUrlByJapanese.get(japanese);
    assert.ok(expectedPath, `No accepted sentence-frame audio identity for ${japanese ?? 'missing text'}.`);
    const handle = await button.elementHandle();
    await button.click();
    await page.waitForFunction(element => !element.disabled, handle);
    assert.equal(
        await page.locator('.academy-sentence-frame-live').getByText('That line did not play.', { exact: true }).count(),
        0,
        `Accepted sentence-frame audio failed for ${japanese}.`,
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
    for (const image of await page.locator('.academy-sentence-frame-screen img:visible').all()) {
        assert.equal(await image.evaluate(node =>
            node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0), true);
    }
}

async function assertLayout(page, expectedWidth, label) {
    const geometry = await page.locator('.academy-sentence-frame-screen').evaluate(screen => {
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
            .filter(({ box }) => box.left < -1 || box.right > viewportWidth + 1)
            .map(({ node, box }) => ({
                element: `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`,
                left: box.left,
                right: box.right,
            }));
        const clippedText = visible(
            '.academy-sentence-frame-title, .academy-sentence-frame-progress, '
            + '.academy-sentence-frame-section-title, .academy-sentence-frame-dialogue, '
            + '.academy-sentence-frame-note, .academy-sentence-frame-meaning, '
            + '.academy-sentence-frame-example-meaning, .academy-sentence-frame-response-meaning',
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
            paperWidth: screen.querySelector('.academy-sentence-frame-paper')?.getBoundingClientRect().width ?? 0,
        };
    });
    assert.equal(geometry.documentWidth, expectedWidth, `${label}: document width`);
    assert.ok(geometry.screenLeft >= -1, `${label}: screen starts inside viewport`);
    assert.ok(geometry.screenRight <= expectedWidth + 1, `${label}: screen ends inside viewport`);
    assert.ok(geometry.paperWidth >= Math.min(280, expectedWidth - 16), `${label}: paper uses readable width`);
    assert.deepEqual(geometry.undersized, [], `${label}: controls must be at least 44px`);
    assert.deepEqual(geometry.overflowing, [], `${label}: no element may overflow horizontally`);
    assert.deepEqual(geometry.clippedText, [], `${label}: text must not clip`);
}

async function assertAccessible(page) {
    const result = await new AxeBuilder({ page })
        .include('.academy-sentence-frame-screen')
        .analyze();
    assert.deepEqual(
        result.violations.map(violation => ({
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

function assertSentenceFrameEvidence(events, label) {
    const childAttempts = events.filter(event =>
        event.kind === 'attempt-recorded' && event.activityId.startsWith(`${activityId}:`));
    assert.equal(childAttempts.length, 12, `${label}: five guided and five recall passes plus two lapses`);
    assert.equal(
        childAttempts.filter(event => event.responseKind === 'tapped-token-order').length,
        6,
        `${label}: guided phase records one lapse and five passes`,
    );
    assert.equal(
        childAttempts.filter(event => event.responseKind === 'tapped-token-order-transfer').length,
        6,
        `${label}: recall phase records one lapse and five passes`,
    );
    assert.equal(
        childAttempts.filter(event => event.outcome === 'lapse').length,
        2,
        `${label}: only the two deliberate repairs lapse`,
    );
    assert.equal(
        events.some(event =>
            event.kind === 'attempt-recorded'
            && event.activityId === activityId
            && event.responseKind === 'sentence-constructions'
            && event.outcome === 'pass'),
        true,
        `${label}: parent milestone must complete once`,
    );
    const support = events.filter(event =>
        event.kind === 'support-used' && event.activityId.startsWith(`${activityId}:identity`));
    assert.deepEqual(
        support.map(event => event.supportKind).sort(),
        ['transcript', 'translation', 'model-answer', 'transcript', 'translation', 'model-answer'].sort(),
        `${label}: guided and recall repairs each earn exact support`,
    );
    const scheduled = events.filter(event =>
        event.kind === 'review-scheduled'
        && event.eventId.includes('review:lesson-zero:sentence-frame:'));
    assert.equal(scheduled.length, 5, `${label}: exactly one SRS item per sentence frame`);
    assert.equal(new Set(scheduled.map(event => event.eventId)).size, 5, `${label}: SRS identities must be stable`);
    assert.equal(
        events.some(event =>
            event.kind === 'journal-line-recorded'
            && event.journalLineId === 'journal:lesson-zero:first-sentences'),
        true,
        `${label}: completion must enter the learner journal`,
    );
    assert.equal(
        events.some(event =>
            event.kind === 'scene-completed'
            && event.sceneId === 'scene:lesson-zero-first-sentences'),
        true,
        `${label}: completion scene must persist`,
    );
}

async function screenshot(page, name, stage) {
    await page.screenshot({
        path: path.join(artifactDir, `${name}-${stage}.png`),
        fullPage: true,
    });
}

function unexpectedConsoleErrors(messages) {
    const bunproCorsPattern = /^Access to fetch at 'https:\/\/api\.bunpro\.jp\/api\/frontend\/search\/reviewables_v1_1' .* has been blocked by CORS policy:/u;
    let expectedBunproFailures = messages.filter(message => bunproCorsPattern.test(message)).length;
    return messages.filter(message => {
        if (message.includes('Failed to load resource: the server responded with a status of 401')
            || message.includes('Failed to load resource: the server responded with a status of 404')
            || bunproCorsPattern.test(message)) return false;
        if (expectedBunproFailures > 0 && message === 'Failed to load resource: net::ERR_FAILED') {
            expectedBunproFailures -= 1;
            return false;
        }
        return true;
    });
}
