import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.VOWEL_WRITING_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-vowel-writing');
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
    await verifyWritingRoute({ width: 320, height: 700 }, 'phone-320');
    await verifyWritingRoute({ width: 390, height: 844 }, 'phone-390', true);
    await verifyWritingRoute({ width: 1440, height: 900 }, 'desktop-1440');
} finally {
    await browser.close();
}

async function verifyWritingRoute(viewport, name, complete = false) {
    const context = await browser.newContext({ viewport, locale: 'en-GB' });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await reachWriting(page, `vowel-writing-${name}-${Date.now()}`);
    await page.waitForTimeout(450);

    const intro = await geometry(page);
    assert.equal(intro.scrollWidth, viewport.width, `${name} must not overflow horizontally`);
    assert.equal(intro.paperclipTitleOverlap, false, `${name} paperclip must stay clear of the heading`);
    assert.equal(intro.menuBackOverlap, false, `${name} back control must stay clear of the global menu`);
    assert.equal(intro.menuIdentityOverlap, false, `${name} lesson identity must stay clear of the global menu`);
    assert.ok(intro.controls.every(control => control.width >= 44 && control.height >= 44), `${name} controls must be 44px targets`);
    assert.ok(intro.paper.width >= (viewport.width < 500 ? 270 : 620), `${name} needs a readable writing surface`);
    assert.ok(intro.portrait.width >= (viewport.width < 500 ? 108 : 240), `${name} must keep Rie present in the scene`);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-intro.png`), fullPage: true });

    await page.getByRole('button', { name: 'Open the practice book' }).click();
    await page.getByRole('button', { name: 'Write this kana' }).click();
    await page.locator('.academy-vowel-writing-doodle').waitFor();
    assert.equal(await page.locator('.academy-vowel-writing-source-sheet').count(), 0, 'source guide must be earned');
    assert.equal(await page.locator('.academy-vowel-writing-doodle').getAttribute('data-guided'), 'false');

    if (!complete) {
        await page.locator('.academy-vowel-back').click();
        await page.locator('.academy-vowel-writing-screen').waitFor({ state: 'detached' });
        await openWritingDirectly(page);
        await page.locator('.academy-vowel-writing-screen[data-stage="attempt"]').waitFor();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('.academy-vowel-writing-screen[data-stage="attempt"]').waitFor();
        assert.match(await page.locator('.academy-vowel-progress').innerText(), /0\/5/u, 'reload must retain the first writing attempt');
        await assertAccessible(page);
        await page.screenshot({ path: path.join(artifactDir, `${name}-resume.png`), fullPage: true });
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(unexpectedConsoleErrors(consoleErrors), []);
        await context.close();
        return;
    }

    await drawOneWrongStroke(page);
    await page.getByRole('button', { name: 'Check my mark' }).click();
    await page.locator('.academy-vowel-writing-screen[data-stage="repair"]').waitFor();
    assert.equal(await page.locator('.academy-vowel-writing-source-sheet').count(), 1, 'repair must reveal one source sheet');
    assert.equal(await page.locator('.academy-vowel-writing-stroke-number').count(), 3, 'repair must number every あ stroke');
    assert.equal((await geometry(page)).scrollWidth, viewport.width);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-repair.png`), fullPage: true });

    await page.getByRole('button', { name: 'Try this kana again' }).click();
    await page.locator('.academy-vowel-writing-doodle[data-guided="true"]').waitFor();
    await page.getByRole('button', { name: 'Choose the stroke plan' }).click();
    await completePlanItem(page, '3 strokes · across, down, around', true);

    await page.locator('.academy-vowel-back').click();
    await page.locator('.academy-vowel-writing-screen').waitFor({ state: 'detached' });
    await openWritingDirectly(page);
    await page.locator('.academy-vowel-writing-screen').waitFor();
    assert.match(await page.locator('.academy-vowel-progress').innerText(), /1\/5/u, 'Back must save the completed first kana');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.academy-vowel-writing-screen').waitFor();
    assert.match(await page.locator('.academy-vowel-progress').innerText(), /1\/5/u, 'reload must retain the completed first kana');

    const plans = [
        '2 strokes · left down, right down',
        '2 strokes · small mark, long curve',
        '2 strokes · small mark, turning line',
        '3 strokes · across, down and hook, right mark',
    ];
    for (const plan of plans) await completePlanItem(page, plan);

    await page.getByRole('heading', { name: 'The first line is yours' }).waitFor();
    assert.equal(await page.locator('.academy-vowel-writing-finished-mark').count(), 5);
    assert.equal(await page.locator('.jpdb-reader-popover').count(), 0, 'writing controls must not open Reader lookup UI');
    assert.equal((await geometry(page)).scrollWidth, viewport.width);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-complete.png`), fullPage: true });
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unexpectedConsoleErrors(consoleErrors), []);
    await context.close();
}

async function completePlanItem(page, correctPlan, keyboard = false) {
    if (await page.getByRole('button', { name: 'Choose its stroke plan' }).count()) {
        await page.getByRole('button', { name: 'Choose its stroke plan' }).click();
    }
    const answer = page.getByRole('button', { name: correctPlan });
    await answer.waitFor();
    if (keyboard) {
        await answer.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'Check the plan' }).focus();
        await page.keyboard.press('Enter');
    } else {
        await answer.click();
        await page.getByRole('button', { name: 'Check the plan' }).click();
    }
    await page.waitForFunction(previous => {
        const progress = document.querySelector('.academy-vowel-progress')?.textContent?.trim();
        return progress !== previous;
    }, await page.locator('.academy-vowel-progress').innerText());
}

async function drawOneWrongStroke(page) {
    const box = await page.locator('.jpdb-reader-doodle-canvas').boundingBox();
    assert.ok(box, 'writing canvas must have geometry');
    await page.mouse.move(box.x + box.width * 0.18, box.y + box.height * 0.28);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.25, { steps: 6 });
    await page.mouse.move(box.x + box.width * 0.70, box.y + box.height * 0.24, { steps: 6 });
    await page.mouse.up();
}

async function reachWriting(page, runId) {
    await page.goto(`${baseUrl}/academy/?qa-auth=bypass&qa-run=${runId}`, { waitUntil: 'domcontentloaded' });
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
    await openWritingDirectly(page);
    await page.locator('.academy-vowel-writing-screen').waitFor();
}

async function openWritingDirectly(page) {
    await page.evaluate(async () => {
        const app = window.__yomuAcademy;
        if (!app || typeof app.go !== 'function') throw new Error('Academy QA route seam is unavailable.');
        await app.go('source-activity', {
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-vowel-doodle',
        });
    });
}

async function geometry(page) {
    return page.locator('.academy-vowel-writing-screen').evaluate(screen => {
        const box = selector => {
            const node = screen.querySelector(selector);
            const rect = node?.getBoundingClientRect();
            return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
        };
        const back = box('.academy-vowel-back');
        const paper = box('.academy-vowel-writing-paper');
        const portrait = box('.academy-vowel-writing-rie');
        const clip = box('.academy-vowel-paperclip');
        const title = box('.academy-vowel-title');
        const identity = box('.academy-vowel-identity');
        const menu = [...document.querySelectorAll('button')].find(button => /menu/i.test(`${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`));
        const menuRect = menu?.getBoundingClientRect();
        const overlaps = (left, right) => Boolean(left && right
            && left.left < right.right && left.right > right.left
            && left.top < right.bottom && left.bottom > right.top);
        const controls = [...screen.querySelectorAll('button')].map(node => node.getBoundingClientRect())
            .filter(rect => rect.width > 0 && rect.height > 0)
            .map(rect => ({ width: rect.width, height: rect.height }));
        return {
            scrollWidth: document.documentElement.scrollWidth,
            controls,
            paper: paper ?? { width: 0, height: 0 },
            portrait: portrait ?? { width: 0, height: 0 },
            menuBackOverlap: overlaps(back, menuRect),
            menuIdentityOverlap: overlaps(identity, menuRect),
            paperclipTitleOverlap: overlaps(clip, title),
        };
    });
}

async function assertAccessible(page) {
    const result = await new AxeBuilder({ page }).include('.academy-vowel-writing-screen').analyze();
    const blocking = result.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(
        blocking.map(violation => violation.id),
        [],
        JSON.stringify(blocking.map(violation => ({
            id: violation.id,
            nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
        })), null, 2),
    );
}

function unexpectedConsoleErrors(messages) {
    return messages.filter(message => !/^Failed to load resource: the server responded with a status of 401 \(Unauthorized\)$/u.test(message));
}
