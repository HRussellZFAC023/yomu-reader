import assert from 'node:assert/strict';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5174';
const artifactDir = path.resolve(
    process.env.DESK_LANGUAGE_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-desk-language',
);
const activityId = 'activity:lesson-zero-desk-language';
const audioPaths = Object.freeze([
    '/academy/audio/learning-lines/rie/rie-lesson-zero-homework__870ba7f1bb64aa13.opus',
    '/academy/audio/learning-lines/rie/rie-lesson-zero-example__10f47eefee150c44.opus',
]);
const viewports = [
    { viewport: { width: 320, height: 700 }, name: 'phone-320' },
    { viewport: { width: 390, height: 844 }, name: 'phone-390' },
    { viewport: { width: 1024, height: 1366 }, name: 'tablet-1024' },
    { viewport: { width: 1440, height: 900 }, name: 'desktop-1440' },
];

await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
    for (const scenario of viewports) await verifyRoute(scenario);
    await Promise.all(viewports.flatMap(({ name }) => [
        'intro-homework',
        'practice',
        'repair',
        'transfer',
        'complete',
    ].map(stage => access(path.join(artifactDir, `${name}-${stage}.png`)))));
    console.log('Lesson Zero desk-language route passed on two phones, portrait tablet, and desktop.');
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
    const audioResponses = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', response => {
        const url = new URL(response.url());
        if (audioPaths.includes(url.pathname)) {
            audioResponses.push({ path: url.pathname, status: response.status() });
        }
    });

    const runId = `desk-${name}-${Date.now()}`;
    await reachActivity(page, runId);
    await expectStage(page, 'meet-homework');
    assert.equal(await page.getByText('しゅくだい', { exact: true }).count(), 1);
    assert.equal(await page.getByText('You do not need to read the kana yet.', { exact: false }).count(), 1);
    await assertImagesLoaded(page);
    await assertLayout(page, viewport.width, `${name} homework introduction`);
    await assertAccessible(page);
    await screenshot(page, name, 'intro-homework');

    await clickAction(page, 'replay');
    await waitForAudio(page, audioPaths[0]);
    await clickAction(page, 'next-introduction');
    await expectStage(page, 'meet-example');
    assert.equal(await page.getByText('れい', { exact: true }).count(), 1);
    await clickAction(page, 'replay');
    await waitForAudio(page, audioPaths[1]);
    await clickAction(page, 'next-introduction');
    await expectStage(page, 'practice');

    await assertLayout(page, viewport.width, `${name} practice`);
    await screenshot(page, name, 'practice');
    await page.locator('[data-choice="option-1"]').click();
    await expectStage(page, 'practice-repair');
    assert.equal(await page.getByText('Shukudai is the work you take away.', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Rei is the worked model you can follow.', { exact: true }).count(), 0);
    await assertLayout(page, viewport.width, `${name} targeted repair`);
    await assertAccessible(page);
    await screenshot(page, name, 'repair');

    await clickAction(page, 'retry');
    await expectStage(page, 'practice');
    await page.locator('[data-choice="option-0"]').click();
    await expectStage(page, 'practice');
    await page.locator('[data-choice="option-1"]').click();
    await expectStage(page, 'transfer-ready');

    await page.getByRole('button', { name: 'Save and leave', exact: true }).click();
    await expectRoute(page, 'campus');
    await openActivity(page);
    await expectStage(page, 'transfer-ready');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectStage(page, 'transfer-ready');

    await clickAction(page, 'begin-transfer');
    await expectStage(page, 'transfer');
    assert.equal(await page.getByText('Work for later', { exact: true }).count(), 0);
    assert.equal(await page.getByText('A model to follow', { exact: true }).count(), 0);
    assert.match(
        await page.locator('[data-choice="option-0"]').getAttribute('aria-label') ?? '',
        /worked answer/u,
    );
    await assertLayout(page, viewport.width, `${name} changed-layout transfer`);
    await assertAccessible(page);
    await screenshot(page, name, 'transfer');

    await page.locator('[data-choice="option-0"]').click();
    await expectStage(page, 'transfer');
    await page.locator('[data-choice="option-1"]').click();
    await expectStage(page, 'complete');
    await page.waitForFunction(() =>
        window.__yomuAcademy?.checkpoint?.lessonZeroDeskLanguageProgress?.status === 'complete');
    await assertImagesLoaded(page);
    await assertLayout(page, viewport.width, `${name} completion`);
    await assertAccessible(page);
    await screenshot(page, name, 'complete');

    const evidence = await readLearnerEvidence(page, runId);
    assertDeskLanguageEvidence(evidence, name);
    assert.deepEqual(
        [...new Set(audioResponses.map(response => response.path))].sort(),
        [...audioPaths].sort(),
        `${name}: both accepted static lines must play`,
    );
    assert.equal(
        audioResponses.every(response => response.status === 200 || response.status === 206),
        true,
        `${name}: static audio must return 200 or 206`,
    );
    assert.equal(
        audioResponses.some(response => /worker|synthesis|tts/iu.test(response.path)),
        false,
        `${name}: the accepted route must not fall through to generated TTS`,
    );

    await clickAction(page, 'complete');
    await expectRoute(page, 'aakash-meet');
    await openActivity(page);
    await expectStage(page, 'complete');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectStage(page, 'complete');

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
        'To understand the words Rie uses with our class papers',
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
    await page.locator('.academy-desk-language-screen').waitFor();
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
        if (!app || typeof app.go !== 'function') {
            throw new Error('Academy QA route seam is unavailable.');
        }
        await app.go('source-activity', {
            lessonId: 'lesson:foundation-00',
            activityId: selectedActivityId,
        });
    }, activityId);
}

async function expectStage(page, stage) {
    await page.locator(`.academy-desk-language-screen[data-session-stage="${stage}"]`).waitFor();
}

async function expectRoute(page, route) {
    await page.waitForFunction(expected => window.__yomuAcademy?.checkpoint?.route === expected, route);
}

async function clickAction(page, action) {
    const button = page.locator(`[data-desk-action="${action}"]`);
    await button.waitFor();
    await button.click();
}

async function waitForAudio(page, expectedPath) {
    await page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === expectedPath && (response.status() === 200 || response.status() === 206);
    });
}

async function assertImagesLoaded(page) {
    for (const image of await page.locator('.academy-desk-language-screen img:visible').all()) {
        assert.equal(await image.evaluate(node =>
            node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0), true);
    }
}

async function assertLayout(page, expectedWidth, label) {
    const geometry = await page.locator('.academy-desk-language-screen').evaluate(screen => {
        const viewportWidth = document.documentElement.clientWidth;
        const screenBox = screen.getBoundingClientRect();
        const visible = selector => [...screen.querySelectorAll(selector)]
            .map(node => ({ node, box: node.getBoundingClientRect() }))
            .filter(({ box }) => box.width > 0 && box.height > 0);
        const overlaps = (first, second) => Boolean(first && second
            && first.left < second.right - 1 && first.right > second.left + 1
            && first.top < second.bottom - 1 && first.bottom > second.top + 1);
        const lineCount = selector => {
            const node = screen.querySelector(selector);
            if (!node) return 0;
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            const declaredLineHeight = Number.parseFloat(style.lineHeight);
            const fontSize = Number.parseFloat(style.fontSize);
            const lineHeight = Number.isFinite(declaredLineHeight)
                ? declaredLineHeight
                : fontSize * 1.25;
            return lineHeight > 0 ? Math.round(box.height / lineHeight) : 0;
        };
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
        const choiceBoxes = visible('.academy-desk-language-prop-choice').map(({ box }) => box);
        const utility = document.querySelector('.academy-utility-toggle')?.getBoundingClientRect();
        const header = screen.querySelector('.academy-desk-language-header')?.getBoundingClientRect();
        const body = screen.querySelector('.academy-desk-language-body')?.getBoundingClientRect();
        return {
            documentWidth: document.documentElement.scrollWidth,
            screenLeft: screenBox.left,
            screenRight: screenBox.right,
            utilityVisible: Boolean(utility && utility.width > 0 && utility.height > 0),
            titleLines: lineCount('.academy-desk-language-title'),
            japaneseLines: lineCount('.academy-desk-language-japanese'),
            headerBodyOverlap: overlaps(header, body),
            choicesOverlap: choiceBoxes.length === 2 && overlaps(choiceBoxes[0], choiceBoxes[1]),
            undersized: visibleControls.filter(control => control.width < 44 || control.height < 44),
            overflowing,
            clippedText: visible(
                '.academy-desk-language-title, .academy-desk-language-dialogue, '
                + '.academy-desk-language-choice-prompt, .academy-desk-language-repair-copy, '
                + '.academy-desk-language-pass-copy, .academy-desk-language-complete-copy',
            ).filter(({ node }) => node.scrollWidth > node.clientWidth + 1)
                .map(({ node }) => `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`),
        };
    });
    assert.equal(geometry.documentWidth, expectedWidth, `${label}: document width`);
    assert.ok(geometry.screenLeft >= -1, `${label}: screen starts inside viewport`);
    assert.ok(geometry.screenRight <= expectedWidth + 1, `${label}: screen ends inside viewport`);
    assert.equal(geometry.utilityVisible, false, `${label}: focused route hides utility chrome`);
    assert.ok(
        geometry.titleLines <= (expectedWidth <= 390 ? 2 : 1),
        `${label}: title uses ${geometry.titleLines} lines`,
    );
    assert.ok(geometry.japaneseLines <= 1, `${label}: Japanese label stays on one line`);
    assert.equal(geometry.headerBodyOverlap, false, `${label}: header must not cover activity`);
    assert.equal(geometry.choicesOverlap, false, `${label}: paper choices must not overlap`);
    assert.deepEqual(geometry.undersized, [], `${label}: controls must be at least 44px`);
    assert.deepEqual(geometry.overflowing, [], `${label}: no element may overflow horizontally`);
    assert.deepEqual(geometry.clippedText, [], `${label}: activity text must not clip`);
}

async function assertAccessible(page) {
    const result = await new AxeBuilder({ page })
        .include('.academy-desk-language-screen')
        .analyze();
    assert.deepEqual(
        result.violations.map(violation => `${violation.id}: ${violation.help}`),
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

function assertDeskLanguageEvidence(events, label) {
    const attempts = events.filter(event =>
        event.kind === 'attempt-recorded' && event.activityId.includes('lesson-zero-desk-language'));
    assert.deepEqual(
        attempts.map(event => `${event.activityId}|${event.outcome}`).sort(),
        [
            'activity:lesson-zero-desk-language:practice:homework|lapse',
            'activity:lesson-zero-desk-language:practice:homework|pass',
            'activity:lesson-zero-desk-language:practice:example|pass',
            'activity:lesson-zero-desk-language:transfer:example|pass',
            'activity:lesson-zero-desk-language:transfer:homework|pass',
            'activity:lesson-zero-desk-language|pass',
        ].sort(),
        `${label}: route must record the repair, changed-layout transfer, and completion`,
    );
    const support = events.filter(event =>
        event.kind === 'support-used' && event.activityId.includes('lesson-zero-desk-language'));
    assert.deepEqual(
        support.map(event => [event.supportKind, event.choiceId]),
        [['hint', 'homework']],
        `${label}: only the confused label receives support`,
    );
    const scheduled = events.filter(event =>
        event.kind === 'review-scheduled'
        && event.eventId.startsWith('review-scheduled:academy:review:lesson-zero:classroom-'));
    assert.deepEqual(
        scheduled.map(event => event.eventId).sort(),
        [
            'review-scheduled:academy:review:lesson-zero:classroom-13-homework',
            'review-scheduled:academy:review:lesson-zero:classroom-14-example',
        ],
        `${label}: exactly two stable SRS reviews must be scheduled`,
    );
    assert.equal(
        events.some(event =>
            event.kind === 'journal-line-recorded'
            && event.journalLineId === 'journal:lesson-zero:desk-language'),
        true,
        `${label}: completion must enter the learner's journal`,
    );
    assert.equal(
        events.some(event =>
            event.kind === 'scene-completed'
            && event.sceneId === 'scene:lesson-zero-desk-language-transfer'),
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
    return messages.filter(message =>
        !message.includes('Failed to load resource: the server responded with a status of 401')
        && !message.includes('Failed to load resource: the server responded with a status of 404'));
}
