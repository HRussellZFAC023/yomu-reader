import assert from 'node:assert/strict';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(
    process.env.REPEAT_REQUEST_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-repeat-request',
);
const activityId = 'activity:lesson-zero-reconstruct-repair';
const target = 'もう一度お願いします。';
const viewports = [
    { viewport: { width: 320, height: 700 }, name: 'phone-320' },
    { viewport: { width: 390, height: 844 }, name: 'phone-390' },
    { viewport: { width: 1440, height: 900 }, name: 'desktop-1440' },
];

await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
    for (const scenario of viewports) await verifyRoute(scenario);
    await Promise.all(viewports.flatMap(({ name }) => [
        'intro',
        'practice',
        'transfer',
        'complete',
    ].map(stage => access(path.join(artifactDir, `${name}-${stage}.png`)))));
} finally {
    await browser.close();
}

async function verifyRoute({ viewport, name }) {
    const context = await browser.newContext({ viewport, locale: 'en-GB' });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await reachActivity(page, `repeat-request-${name}-${Date.now()}`);
    await expectStage(page, 'meet');
    assert.equal(await page.getByText(target, { exact: true }).count(), 1);
    await assertLayout(page, viewport.width, `${name} intro`);
    await assertAccessible(page);
    await screenshot(page, name, 'intro');

    await page.locator('[data-repeat-action="begin"]').click();
    await expectStage(page, 'practice');
    assert.equal(await page.getByText(target, { exact: true }).count(), 0);
    await page.locator('[data-chunk-id="once-more"]').click();
    await page.locator('[data-chunk-id="please"]').click();
    await page.waitForFunction(() =>
        document.querySelectorAll('.academy-repeat-request-slot-japanese').length === 2);
    await assertLayout(page, viewport.width, `${name} practice`);
    await screenshot(page, name, 'practice');
    await page.locator('[data-repeat-action="submit"]').click();
    await expectStage(page, 'transfer-ready');

    await page.getByRole('button', { name: 'Save and leave' }).click();
    await expectRoute(page, 'campus');
    await openActivity(page);
    await expectStage(page, 'transfer-ready');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectStage(page, 'transfer-ready');

    await page.locator('[data-repeat-action="begin-transfer"]').click();
    await expectStage(page, 'transfer');
    assert.equal(await page.getByText(target, { exact: true }).count(), 0);
    await assertImageLoaded(page, '.academy-repeat-request-aakash');
    await assertLayout(page, viewport.width, `${name} transfer`);
    await assertAccessible(page);
    await screenshot(page, name, 'transfer');

    await page.locator('[data-chunk-id="once-more"]').click();
    await page.locator('[data-chunk-id="please"]').click();
    await page.locator('[data-repeat-action="submit"]').click();
    await expectStage(page, 'complete');
    await page.waitForFunction(() =>
        window.__yomuAcademy?.checkpoint?.lessonZeroRepeatRequestProgress?.status === 'complete');
    assert.equal(await page.getByText(target, { exact: true }).count(), 1);
    await assertLayout(page, viewport.width, `${name} complete`);
    await assertAccessible(page);
    await screenshot(page, name, 'complete');

    await page.locator('[data-repeat-action="complete"]').click();
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
        'To keep a conversation going when I miss something',
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
    await page.locator('.academy-repeat-request-screen').waitFor();
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
    await page.locator(`.academy-repeat-request-screen[data-session-stage="${stage}"]`).waitFor();
}

async function expectRoute(page, route) {
    await page.waitForFunction(expected => window.__yomuAcademy?.checkpoint?.route === expected, route);
}

async function assertImageLoaded(page, selector) {
    const image = page.locator(selector);
    await image.waitFor();
    assert.equal(await image.evaluate(node =>
        node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0), true);
}

async function assertLayout(page, expectedWidth, label) {
    const geometry = await page.locator('.academy-repeat-request-screen').evaluate(screen => {
        const viewportWidth = document.documentElement.clientWidth;
        const screenBox = screen.getBoundingClientRect();
        const rect = selector => screen.querySelector(selector)?.getBoundingClientRect() ?? null;
        const overlaps = (first, second) => Boolean(first && second
            && first.left < second.right && first.right > second.left
            && first.top < second.bottom && first.bottom > second.top);
        const lineCount = selector => {
            const node = screen.querySelector(selector);
            if (!node) return 0;
            const box = node.getBoundingClientRect();
            const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);
            return lineHeight > 0 ? Math.round(box.height / lineHeight) : 0;
        };
        const visibleControls = [...screen.querySelectorAll('button')]
            .map(control => ({ label: control.textContent?.trim() ?? '', box: control.getBoundingClientRect() }))
            .filter(({ box }) => box.width > 0 && box.height > 0)
            .map(({ label, box }) => ({ label, width: box.width, height: box.height }));
        const overflowing = [...screen.querySelectorAll('*')]
            .map(node => ({ node, box: node.getBoundingClientRect() }))
            .filter(({ box }) => box.width > 0 && (box.left < -1 || box.right > viewportWidth + 1))
            .map(({ node, box }) => ({
                element: `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`,
                left: box.left,
                right: box.right,
            }));
        const utility = document.querySelector('.academy-utility-toggle')?.getBoundingClientRect();
        return {
            documentWidth: document.documentElement.scrollWidth,
            screenLeft: screenBox.left,
            screenRight: screenBox.right,
            utilityVisible: Boolean(utility && utility.width > 0 && utility.height > 0),
            titleLines: lineCount('.academy-repeat-request-title'),
            targetLines: lineCount('.academy-repeat-request-target'),
            promptSpeechOverlap: overlaps(
                rect('.academy-repeat-request-prompt-line'),
                rect('.academy-repeat-request-prompt-rie'),
            ),
            undersized: visibleControls.filter(control => control.width < 44 || control.height < 44),
            overflowing,
        };
    });
    assert.equal(geometry.documentWidth, expectedWidth, `${label}: document width`);
    assert.ok(geometry.screenLeft >= -1, `${label}: screen starts inside viewport`);
    assert.ok(geometry.screenRight <= expectedWidth + 1, `${label}: screen ends inside viewport`);
    assert.equal(geometry.utilityVisible, false, `${label}: focused route hides utility chrome`);
    assert.ok(
        geometry.titleLines <= (expectedWidth <= 390 ? 3 : 2),
        `${label}: title uses ${geometry.titleLines} lines`,
    );
    assert.ok(geometry.targetLines <= 1, `${label}: Japanese model stays on one line`);
    assert.equal(geometry.promptSpeechOverlap, false, `${label}: Rie's prompt must not cover her portrait`);
    assert.deepEqual(geometry.undersized, [], `${label}: controls must be at least 44px`);
    assert.deepEqual(geometry.overflowing, [], `${label}: no element may overflow horizontally`);
}

async function assertAccessible(page) {
    const result = await new AxeBuilder({ page })
        .include('.academy-repeat-request-screen')
        .analyze();
    assert.deepEqual(
        result.violations.map(violation => `${violation.id}: ${violation.help}`),
        [],
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
