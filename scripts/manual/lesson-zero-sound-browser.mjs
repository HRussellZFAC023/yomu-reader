import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.SOUND_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-sound');
const cases = [
    { name: 'compact-phone', width: 320, height: 720, proveResume: true },
    { name: 'phone', width: 390, height: 844, proveResume: false },
    { name: 'portrait-tablet', width: 1024, height: 1366, proveResume: false },
    { name: 'desktop', width: 1440, height: 900, proveResume: false },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
});
try {
    for (const testCase of cases) await verifySoundMission(testCase);
    console.log('Lesson Zero sound mission passed at 320px, 390px, portrait tablet, and desktop.');
} finally {
    await browser.close();
}

async function verifySoundMission(testCase) {
    const context = await browser.newContext({
        viewport: { width: testCase.width, height: testCase.height },
        locale: 'en-GB',
        reducedMotion: 'reduce',
    });
    const protectedMediaRequests = [];
    await context.route('**/academy/media/audio/**', async route => {
        protectedMediaRequests.push(route.request().url());
        await route.fulfill({ status: 204, headers: { 'cache-control': 'no-store' } });
    });
    const page = await context.newPage();
    const errors = [];
    const unauthorizedResponses = [];
    const lessonZeroAudioResponses = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') {
            const location = message.location().url;
            errors.push(`console: ${message.text()}${location ? ` @ ${location}` : ''}`);
        }
    });
    page.on('response', response => {
        if (response.status() === 401) unauthorizedResponses.push(response.url());
        if (response.url().includes('/academy/audio/lesson-zero/')) {
            lessonZeroAudioResponses.push({ url: response.url(), status: response.status() });
        }
    });

    const storyCursor = await reachSoundMission(page, `sound-${testCase.name}-${Date.now()}`);
    const screen = page.locator('[data-academy-screen="lesson-zero-sound"]');
    await screen.waitFor();
    assert.equal(await screen.getAttribute('data-session-stage'), 'meet');
    assert.equal(await screen.getByText('Xingyu', { exact: true }).count() > 0, true);
    assert.equal(await screen.getByText('シンユ', { exact: true }).count() > 0, true);
    assert.equal(await screen.getByText('はじめまして。シンユです。', { exact: true }).count(), 0,
        `${testCase.name} must teach Xingyu's name by audio before revealing the line`);
    await assertGeometry(page, testCase, 'meet');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-meet.png`), fullPage: true });

    await hearIntroduction(page, 0);
    assert.equal(await screen.getByText('はじめまして。シンユです。', { exact: true }).count(), 1);
    if (testCase.proveResume) {
        await page.locator('.academy-sound-back').click();
        await screen.waitFor({ state: 'detached' });
        assert.equal(await storyHandoff(page).getAttribute('data-activity-gate'), 'missing',
            'phone resume must return to the unfinished story handoff');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await storyHandoff(page).waitFor();
        assert.equal(await openSoundFromStoryHandoff(page), storyCursor,
            'phone resume must reopen from the same story cursor');
        await screen.waitFor();
        assert.equal(await screen.getAttribute('data-session-stage'), 'meet');
        assert.equal(await screen.getByText('はじめまして。シンユです。', { exact: true }).count(), 1,
            'compact-phone reload must preserve the first introduction');
        assert.equal(await introduction(page, 0).locator('.academy-sound-listen').textContent(), '▶Replay');
        assert.equal(await screen.getByText('ミカです。よろしくお願いします。', { exact: true }).count(), 0,
            'compact-phone reload must preserve the exact introduction cursor');
    }

    await hearIntroduction(page, 1);
    assert.equal(await screen.getByText('ミカです。よろしくお願いします。', { exact: true }).count(), 1);
    await screen.getByRole('button', { name: 'Now listen for their names' }).click();
    await waitForStage(page, 'attempt');
    assert.equal(await screen.getByText('こちらはシンユさんです。', { exact: true }).count(), 0,
        `${testCase.name} must conceal the changed-speaker transcript before commitment`);
    assert.equal(await lineChoices(page, 0).getAttribute('disabled'), '',
        `${testCase.name} must lock the first answer until audio ends`);
    await assertGeometry(page, testCase, 'attempt');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-attempt.png`), fullPage: true });

    await hearLine(page, 0);
    await choose(page, 0, 'Xingyu');
    await hearLine(page, 1);
    await choose(page, 1, 'Xingyu');
    await screen.getByRole('button', { name: 'Check the names' }).click();
    await waitForStage(page, 'repair');
    assert.equal(await screen.locator('.academy-sound-action--listen').count(), 1,
        `${testCase.name} must offer only the missed name`);
    assert.equal(await screen.locator('.academy-sound-action--listen').getAttribute('data-line-id'),
        'line:lesson-zero-sound-xingyu-names-mika');
    assert.equal(await screen.getByRole('button', { name: 'Try that name again' }).isDisabled(), true);
    await assertGeometry(page, testCase, 'repair');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-repair.png`), fullPage: true });

    await screen.getByRole('button', { name: 'Show the line' }).click();
    await screen.getByText('こちらはミカさんです。', { exact: true }).waitFor();
    await screen.locator('.academy-sound-action--listen').click();
    await screen.getByRole('button', { name: 'Try that name again' }).waitFor({ state: 'visible' });
    await assertEventuallyEnabled(screen.getByRole('button', { name: 'Try that name again' }));
    await screen.getByRole('button', { name: 'Try that name again' }).click();
    await waitForStage(page, 'attempt');

    assert.equal(await screen.locator('.academy-sound-turn').count(), 1,
        `${testCase.name} retry must contain only the missed name`);
    assert.equal(await screen.locator('.academy-sound-turn').getAttribute('data-line-id'),
        'line:lesson-zero-sound-xingyu-names-mika');
    await hearLine(page, 0);
    await choose(page, 0, 'Mika');
    await screen.getByRole('button', { name: 'Check the names' }).click();
    await waitForStage(page, 'complete');
    assert.equal(await screen.getByText('はじめまして。シンユです。', { exact: true }).count(), 1);
    assert.equal(await screen.getByText('ミカです。よろしくお願いします。', { exact: true }).count(), 1);
    assert.equal(await screen.getByText('こちらはシンユさんです。', { exact: true }).count(), 1);
    assert.equal(await screen.getByText('こちらはミカさんです。', { exact: true }).count(), 1);
    await assertNoLookupOverlay(page, testCase);
    await assertGeometry(page, testCase, 'complete');
    await assertAccessible(page);
    await assertNoLookupOverlay(page, testCase);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-complete.png`), fullPage: true });
    await screen.getByRole('button', { name: 'Keep going' }).click();
    await screen.waitFor({ state: 'detached' });
    const returnedHandoff = storyHandoff(page);
    await returnedHandoff.waitFor();
    assert.equal(await returnedHandoff.getAttribute('data-activity-gate'), 'passed',
        `${testCase.name} completion must satisfy the exact story gate`);
    assert.equal(await returnedHandoff.locator('.academy-story-open-activity').getAttribute('data-story-cursor'), storyCursor,
        `${testCase.name} completion must restore the exact story cursor`);
    await returnedHandoff.locator('.academy-story-activity-continue').click();
    await page.locator('[data-line="line:blank-atlas:mika-sound-result"]').waitFor();
    await assertStorySpeaker(page, testCase, 'mika');
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-story-return.png`), fullPage: true });
    for (const asset of ['persona/royal-days.flac', 'shinday/result-not-clear.wav', 'shinday/result-clear.wav']) {
        assert.ok(protectedMediaRequests.some(url => url.endsWith(asset)),
            `${testCase.name} must request its ${asset} audio cue`);
    }
    for (const asset of [
        'sound-xingyu.opus',
        'sound-mika.opus',
        'sound-mika-names-xingyu.opus',
        'sound-xingyu-names-mika.opus',
    ]) {
        assert.ok(lessonZeroAudioResponses.some(response =>
            response.url.endsWith(asset) && [200, 206].includes(response.status)),
        `${testCase.name} must play ${asset} successfully`);
    }
    assert.deepEqual({ errors, unauthorizedResponses }, { errors: [], unauthorizedResponses: [] },
        `${testCase.name} browser console and request surface must stay clean`);
    await context.close();
}

async function reachSoundMission(page, runId) {
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
    await seedStorySoundHandoff(page);
    return openSoundFromStoryHandoff(page);
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

async function seedStorySoundHandoff(page) {
    await page.evaluate(async () => {
        const app = window.__yomuAcademy;
        if (!app || typeof app.go !== 'function') throw new Error('Academy QA route seam is unavailable.');
        const { serializeStoryCursor } = await import('/src/academy/content/story-runner.ts');
        await app.go('story', {
            sectionId: serializeStoryCursor({
                version: 1,
                arcId: 'arc:open-doors:first-route',
                sceneId: 'scene:blank-atlas:mission-sound',
                nodeId: 'activity-node:blank-atlas:sound-input',
                choices: {
                    'choice:blank-atlas:mission': 'option:blank-atlas:mission-sound',
                },
            }),
            lessonId: undefined,
            activityId: undefined,
        });
    });
}

async function openSoundFromStoryHandoff(page) {
    const handoff = storyHandoff(page);
    await handoff.waitFor();
    assert.equal(await page.locator('[data-story-arc-id]').getAttribute('data-story-mode'), 'canonical',
        'Lesson Zero sound must launch from the canonical opening story');
    const open = handoff.locator('.academy-story-open-activity');
    const cursor = await open.getAttribute('data-story-cursor');
    assert.ok(cursor?.startsWith('story-run:v1:'), 'Story handoff must carry a resumable cursor');
    await open.click();
    await page.locator('[data-academy-screen="lesson-zero-sound"]').waitFor();
    return cursor;
}

function storyHandoff(page) {
    return page.locator('[data-activity-id="activity:lesson-zero-sound-input"]');
}

async function hearIntroduction(page, index) {
    const turn = introduction(page, index);
    await turn.locator('.academy-sound-listen').click();
    await turn.locator('.academy-sound-meet-heard').waitFor();
}

function introduction(page, index) {
    return page.locator('[data-academy-screen="lesson-zero-sound"] .academy-sound-meet-turn').nth(index);
}

async function hearLine(page, index) {
    const screen = page.locator('[data-academy-screen="lesson-zero-sound"]');
    const turn = screen.locator('.academy-sound-turn').nth(index);
    await turn.locator('.academy-sound-listen').click();
    await assertEventuallyEnabled(turn.locator('fieldset'));
}

async function choose(page, index, name) {
    const target = choice(page, index, name);
    await target.click();
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
        if (await choice(page, index, name).getAttribute('aria-pressed') === 'true') return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out selecting ${name} for voice ${index + 1}.`);
}

function choice(page, index, name) {
    return page.locator('[data-academy-screen="lesson-zero-sound"] .academy-sound-turn')
        .nth(index)
        .getByRole('button', { name: new RegExp(`^${name}`, 'u') });
}

function lineChoices(page, index) {
    return page.locator('[data-academy-screen="lesson-zero-sound"] .academy-sound-turn')
        .nth(index)
        .locator('fieldset');
}

async function assertEventuallyEnabled(locator) {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
        if (await locator.getAttribute('disabled') === null) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for an enabled sound-mission control.');
}

async function waitForStage(page, stage) {
    await page.waitForFunction(next =>
        document.querySelector('[data-academy-screen="lesson-zero-sound"]')?.dataset.sessionStage === next,
    stage);
}

async function assertGeometry(page, testCase, stage) {
    const geometry = await page.locator('[data-academy-screen="lesson-zero-sound"]').evaluate(screen => {
        const bounds = selector => {
            const node = screen.querySelector(selector);
            const rect = node?.getBoundingClientRect();
            return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right } : null;
        };
        return {
            scrollWidth: document.documentElement.scrollWidth,
            shell: bounds('.academy-sound-shell'),
            paper: bounds('.academy-sound-paper'),
            cast: bounds('.academy-sound-cast'),
            controls: [...screen.querySelectorAll('button')]
                .map(node => node.getBoundingClientRect())
                .filter(rect => rect.width > 0 && rect.height > 0)
                .map(rect => ({ x: rect.x, right: rect.right, width: rect.width, height: rect.height })),
        };
    });
    assert.ok(geometry.scrollWidth <= testCase.width,
        `${testCase.name} ${stage} must not overflow horizontally (${geometry.scrollWidth}/${testCase.width})`);
    for (const [label, bounds] of [['shell', geometry.shell], ['paper', geometry.paper], ['cast', geometry.cast]]) {
        assert.ok(bounds, `${testCase.name} ${stage} ${label} needs browser bounds`);
        assert.ok(bounds.x >= -1 && bounds.right <= testCase.width + 1,
            `${testCase.name} ${stage} ${label} must fit: ${JSON.stringify(bounds)}`);
    }
    for (const [index, control] of geometry.controls.entries()) {
        assert.ok(control.x >= -1 && control.right <= testCase.width + 1,
            `${testCase.name} ${stage} control ${index + 1} must fit: ${JSON.stringify(control)}`);
        assert.ok(control.width >= 44 && control.height >= 44,
            `${testCase.name} ${stage} control ${index + 1} must be a 44px target: ${JSON.stringify(control)}`);
    }
}

async function assertAccessible(page) {
    const result = await new AxeBuilder({ page }).include('[data-academy-screen="lesson-zero-sound"]').analyze();
    const blocking = result.violations.filter(violation =>
        violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
    })), [], 'Sound mission must have no serious or critical Axe violations');
}

async function assertNoLookupOverlay(page, testCase) {
    await page.mouse.move(1, 1);
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-popover'));
    await page.waitForTimeout(900);
    assert.equal(await page.locator('.jpdb-reader-popover').count(), 0,
        `${testCase.name} completion must not click through into a lookup`);
}

async function assertStorySpeaker(page, testCase, characterId) {
    const selector = `.academy-story-vn-stage .academy-vn-sprite-slot[data-character="${characterId}"]`;
    await page.waitForFunction(({ selector }) => {
        const slot = document.querySelector(selector);
        const image = slot?.querySelector('img');
        return slot?.dataset.performancePresence === 'active'
            && image?.complete
            && (image.naturalWidth ?? 0) > 0
            && Number.parseFloat(getComputedStyle(slot).opacity) > 0.9;
    }, { selector });
    await page.locator(`${selector} img`).evaluate(async image => {
        await image.decode();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.waitForTimeout(200);
    const geometry = await page.locator(selector).evaluate(slot => {
        const image = slot.querySelector('img');
        const dialogue = document.querySelector('.academy-story-vn-stage .academy-vn-dialogue');
        const bounds = slot.getBoundingClientRect();
        const dialogueBounds = dialogue?.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(bounds.right, window.innerWidth) - Math.max(bounds.left, 0));
        const visibleAboveDialogue = Math.max(0, Math.min(bounds.bottom, dialogueBounds?.top ?? window.innerHeight) - Math.max(bounds.top, 0));
        return {
            imageLoaded: Boolean(image?.complete && image.naturalWidth > 0),
            imageSource: image?.getAttribute('src'),
            opacity: Number.parseFloat(getComputedStyle(slot).opacity),
            visibleWidth,
            visibleAboveDialogue,
            bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
        };
    });
    assert.equal(geometry.imageLoaded, true, `${testCase.name} story speaker image must decode`);
    assert.equal(geometry.imageSource, '/academy/art/characters/mika/mika__sound-listening__halfbody__v001.png',
        `${testCase.name} story speaker must use the approved Mika performance`);
    assert.ok(geometry.opacity > 0.9, `${testCase.name} story speaker must be visibly active: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.visibleWidth >= 96, `${testCase.name} story speaker needs visible width: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.visibleAboveDialogue >= 120,
        `${testCase.name} story speaker needs unobscured stage space: ${JSON.stringify(geometry)}`);
}
