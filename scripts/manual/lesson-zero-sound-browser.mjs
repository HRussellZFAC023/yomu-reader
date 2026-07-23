import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.SOUND_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-sound');
const cases = [
    { name: 'phone', width: 390, height: 844, proveResume: true },
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
    console.log('Lesson Zero sound mission passed on phone, portrait tablet, and desktop.');
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
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') {
            const location = message.location().url;
            errors.push(`console: ${message.text()}${location ? ` @ ${location}` : ''}`);
        }
    });
    page.on('response', response => {
        if (response.status() === 401) unauthorizedResponses.push(response.url());
    });

    const storyCursor = await reachSoundMission(page, `sound-${testCase.name}-${Date.now()}`);
    const screen = page.locator('[data-academy-screen="lesson-zero-sound"]');
    await screen.waitFor();
    assert.equal(await screen.getByText('はじめまして。シンユです。', { exact: true }).count(), 0,
        `${testCase.name} must delay transcript text until commitment`);
    assert.equal(await lineChoices(page, 0).getAttribute('disabled'), '',
        `${testCase.name} must lock the first answer until audio ends`);
    await assertGeometry(page, testCase, 'attempt');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-attempt.png`), fullPage: true });

    await hearLine(page, 0);
    await choose(page, 0, 'Xingyu');
    if (testCase.proveResume) {
        await page.locator('.academy-sound-back').click();
        await screen.waitFor({ state: 'detached' });
        assert.equal(await storyHandoff(page).getAttribute('data-activity-gate'), 'missing',
            'phone resume must return to the unfinished story handoff');
        assert.equal(await openSoundFromStoryHandoff(page), storyCursor,
            'phone resume must reopen from the same story cursor');
        await screen.waitFor();
        assert.equal(await lineChoices(page, 0).getAttribute('disabled'), null,
            'phone resume must preserve the completed first listen');
        assert.equal(await choice(page, 0, 'Xingyu').getAttribute('aria-pressed'), 'true',
            'phone resume must preserve the first match');
    }

    await hearLine(page, 1);
    await choose(page, 1, 'Xingyu');
    await screen.getByRole('button', { name: 'Check both voices' }).click();
    await waitForStage(page, 'repair');
    assert.equal(await screen.locator('.academy-sound-action--listen').count(), 1,
        `${testCase.name} must offer only the missed voice`);
    assert.equal(await screen.locator('.academy-sound-action--listen').getAttribute('data-line-id'),
        'line:lesson-zero-sound-mika');
    assert.equal(await screen.getByRole('button', { name: 'Match both again' }).isDisabled(), true);
    await assertGeometry(page, testCase, 'repair');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-repair.png`), fullPage: true });

    await screen.getByRole('button', { name: 'Show the line' }).click();
    await screen.getByText('ミカです。よろしくお願いします。', { exact: true }).waitFor();
    await screen.locator('.academy-sound-action--listen').click();
    await screen.getByRole('button', { name: 'Match both again' }).waitFor({ state: 'visible' });
    await assertEventuallyEnabled(screen.getByRole('button', { name: 'Match both again' }));
    await screen.getByRole('button', { name: 'Match both again' }).click();
    await waitForStage(page, 'attempt');

    await hearLine(page, 0);
    await choose(page, 0, 'Xingyu');
    await hearLine(page, 1);
    await choose(page, 1, 'Mika');
    await screen.getByRole('button', { name: 'Check both voices' }).click();
    await waitForStage(page, 'complete');
    assert.equal(await screen.getByText('はじめまして。シンユです。', { exact: true }).count(), 1);
    assert.equal(await screen.getByText('ミカです。よろしくお願いします。', { exact: true }).count(), 1);
    await assertGeometry(page, testCase, 'complete');
    await assertAccessible(page);
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
    await page.getByRole('button', { name: 'Tell Rie' }).click();
    await page.getByRole('button', { name: 'Choose where to begin' }).click();
    await page.getByRole('button', { name: /Begin with Lesson 0/ }).click();
    await page.getByRole('button', { name: /Read the board and enter class/ }).waitFor();
    await seedStorySoundHandoff(page);
    return openSoundFromStoryHandoff(page);
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
