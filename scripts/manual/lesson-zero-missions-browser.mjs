import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.LESSON_ZERO_MISSION_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-missions');
const cases = [
    { name: 'phone', width: 390, height: 844 },
    { name: 'portrait-tablet', width: 1024, height: 1366 },
    { name: 'desktop', width: 1440, height: 900 },
];
const activityIds = [
    'activity:lesson-zero-text-input',
    'activity:lesson-zero-speaking-input',
    'activity:lesson-zero-read-name-cards',
    'activity:lesson-zero-write-name-card',
    'activity:lesson-zero-sound-transfer',
    'activity:lesson-zero-text-transfer',
    'activity:lesson-zero-speaking-transfer',
    'activity:lesson-zero-written-transfer',
    'activity:lesson-zero-close-room',
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
});
try {
    for (const testCase of cases) await proveEveryMission(testCase);
    console.log('All nine Lesson Zero story missions passed on phone, portrait tablet, and desktop.');
} finally {
    await browser.close();
}

async function proveEveryMission(testCase) {
    const context = await browser.newContext({
        viewport: { width: testCase.width, height: testCase.height },
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
    const errors = [];
    const audioResponses = [];
    const httpFailures = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
            errors.push(`console: ${message.text()}`);
        }
    });
    page.on('response', response => {
        if (response.url().includes('/academy/audio/lesson-zero/')) {
            audioResponses.push({ url: response.url(), status: response.status() });
        }
        if (response.status() >= 400) {
            httpFailures.push({ url: response.url(), status: response.status() });
        }
    });

    await enterAcademy(page, `missions-${testCase.name}-${Date.now()}`);
    for (const activityId of activityIds) {
        await openMission(page, activityId);
        await assertGeometry(page, testCase, activityId);
        await assertAccessible(page, activityId);
        if (screenshotActivity(activityId)) {
            await page.screenshot({
                path: path.join(artifactDir, `${testCase.name}-${activityId.split('lesson-zero-')[1]}.png`),
                fullPage: true,
            });
        }
        await completeMission(page, activityId);
        try {
            await page.waitForFunction(() => (
                document.querySelector('[data-academy-screen="lesson-zero-mission"]')?.getAttribute('data-complete') === 'true'
            ), undefined, { timeout: 10_000 });
        } catch (error) {
            const diagnostic = await page.locator('[data-academy-screen="lesson-zero-mission"]').evaluate(screen => ({
                complete: screen.getAttribute('data-complete'),
                busy: screen.getAttribute('aria-busy'),
                text: screen.textContent,
            }));
            throw new Error(`${testCase.name} ${activityId} did not complete: ${JSON.stringify({ diagnostic, errors })}`, { cause: error });
        }
        await page.getByRole('button', { name: 'Back to the story' }).waitFor();
        await assertGeometry(page, testCase, `${activityId}:complete`);
        if (activityId === 'activity:lesson-zero-text-input') {
            await page.getByRole('button', { name: 'Hear it again' }).click();
            await page.waitForFunction(() => document.querySelector('.academy-mission-live')?.textContent === 'Listen for the turn.');
        }
    }

    const projection = await page.evaluate(ids => {
        const app = window.__yomuAcademy;
        const evidence = app?.evidence;
        return {
            displayName: evidence?.projection?.profile?.displayName,
            outcomes: Object.fromEntries(ids.map(id => [id, evidence?.projection?.activities?.[id]?.lastOutcome])),
        };
    }, activityIds);
    assert.equal(projection.displayName, 'ヘンリー', `${testCase.name} must persist the final class name`);
    assert.deepEqual(
        projection.outcomes,
        Object.fromEntries(activityIds.map(id => [id, 'pass'])),
        `${testCase.name} must persist a pass for every exact mission activity`,
    );
    assert.ok(audioResponses.some(entry => entry.url.endsWith('/text-hosts.opus') && [200, 206].includes(entry.status)),
        `${testCase.name} must fetch the authored Text exchange: ${JSON.stringify(audioResponses)}`);
    for (const asset of ['persona/royal-days.flac', 'shinday/menu-option-select.wav', 'shinday/result-clear.wav']) {
        assert.ok(protectedMediaRequests.some(url => url.endsWith(asset)),
            `${testCase.name} must request ${asset} through the protected media route`);
    }
    assert.equal(protectedMediaRequests.some(url => url.includes('/media/audio/media/audio/')), false,
        `${testCase.name} must not duplicate the protected-media storage prefix`);
    assert.deepEqual(httpFailures, [], `${testCase.name} HTTP requests must resolve`);
    assert.deepEqual(errors, [], `${testCase.name} browser console must stay clean`);
    await context.close();
}

async function enterAcademy(page, runId) {
    const response = await page.goto(`${baseUrl}/academy/?qa-auth=bypass&qa-run=${runId}`, {
        waitUntil: 'domcontentloaded',
    });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
    await page.getByRole('textbox').fill('YOMU-LOCAL');
    await page.getByRole('button', { name: 'Open the doors' }).click();
    await page.locator('input[name="displayName"]').fill('Henry');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('textarea[name="learningReason"]').fill('To understand Japanese as people use it');
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

async function openMission(page, activityId) {
    await page.evaluate(async id => {
        const app = window.__yomuAcademy;
        if (!app || typeof app.go !== 'function') throw new Error('Academy route seam is unavailable.');
        await app.go('source-activity', {
            lessonId: 'lesson:foundation-00',
            activityId: id,
            sectionId: undefined,
        });
    }, activityId);
    const screen = page.locator('[data-academy-screen="lesson-zero-mission"]');
    await screen.waitFor();
    assert.equal(await screen.getAttribute('data-activity-id'), activityId);
}

async function completeMission(page, activityId) {
    const screen = page.locator('[data-academy-screen="lesson-zero-mission"]');
    switch (activityId) {
        case 'activity:lesson-zero-text-input':
            await screen.getByRole('button', { name: 'の', exact: true }).click();
            await screen.getByRole('button', { name: 'も', exact: true }).click();
            await screen.getByRole('button', { name: 'Check the note' }).click();
            break;
        case 'activity:lesson-zero-speaking-input':
        case 'activity:lesson-zero-sound-transfer':
        case 'activity:lesson-zero-speaking-transfer':
            await screen.getByRole('button', { name: 'Hear the exchange' }).click();
            await page.waitForFunction(() => {
                const status = document.querySelector('.academy-mission-live')?.textContent;
                return status === 'Listen for the turn.' || status === 'Now take your turn.';
            });
            await screen.getByRole('button', { name: 'Speak without recording' }).click();
            for (const checkbox of await screen.locator('input[type="checkbox"]').all()) await checkbox.check();
            await screen.getByRole('button', { name: 'Keep this turn' }).click();
            break;
        case 'activity:lesson-zero-read-name-cards':
            await screen.locator('.academy-mission-name-card').filter({ hasText: 'Ruparna' }).click();
            break;
        case 'activity:lesson-zero-write-name-card':
            await screen.getByRole('button', { name: 'Hear ヘンリー' }).click();
            await page.waitForFunction(() =>
                document.querySelector('.academy-mission-writing-preview')?.textContent?.includes('ヘンリーです。'));
            await screen.getByRole('button', { name: 'Put it on the desk' }).click();
            break;
        case 'activity:lesson-zero-text-transfer':
            await screen.locator('.academy-mission-writing-input').fill('これはわたしの名札です。');
            await screen.getByRole('button', { name: 'Leave the line' }).click();
            break;
        case 'activity:lesson-zero-written-transfer':
            await screen.locator('.academy-mission-writing-input')
                .fill('はじめまして。ヘンリーです。よろしくお願いします。');
            await screen.getByRole('button', { name: 'Leave the line' }).click();
            break;
        case 'activity:lesson-zero-close-room':
            await screen.locator('.academy-mission-room-action').filter({ hasText: 'Review at a desk' }).click();
            break;
        default:
            throw new TypeError(`No browser proof for ${activityId}`);
    }
}

async function assertGeometry(page, testCase, stage) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
        `${testCase.name} ${stage} must not create horizontal overflow`);
    for (const selector of ['.academy-mission-shell', '.academy-mission-header', '.academy-mission-stage', '.academy-mission-paper']) {
        const box = await page.locator(selector).first().boundingBox();
        assert.ok(box, `${testCase.name} ${stage} ${selector} must have browser bounds`);
        assert.ok(box.x >= -1 && box.x + box.width <= testCase.width + 1,
            `${testCase.name} ${stage} ${selector} must fit horizontally: ${JSON.stringify(box)}`);
    }
    for (const [index, control] of (await page.locator(
        'button:visible, input:visible, textarea:visible, summary:visible',
    ).all()).entries()) {
        const box = await control.evaluate(element => {
            const input = element instanceof HTMLInputElement ? element : null;
            const hitTarget = input && ['checkbox', 'radio'].includes(input.type)
                ? input.closest('label') ?? input
                : element;
            const rect = hitTarget.getBoundingClientRect();
            return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
            };
        });
        assert.ok(box && box.x >= -1 && box.x + box.width <= testCase.width + 1,
            `${testCase.name} ${stage} control ${index + 1} must fit: ${JSON.stringify(box)}`);
        assert.ok(box.height >= 42, `${testCase.name} ${stage} control ${index + 1} needs a touch-safe height`);
    }
}

async function assertAccessible(page, activityId) {
    const results = await new AxeBuilder({ page }).include('[data-academy-screen="lesson-zero-mission"]').analyze();
    const blocking = results.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map(node => node.target),
    })), [], `${activityId} must have no serious or critical Axe violations`);
}

function screenshotActivity(activityId) {
    return [
        'activity:lesson-zero-text-input',
        'activity:lesson-zero-write-name-card',
        'activity:lesson-zero-speaking-input',
        'activity:lesson-zero-close-room',
    ].includes(activityId);
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
