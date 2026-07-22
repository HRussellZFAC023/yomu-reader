import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.VOWEL_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-vowels');
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
    await verifyVowelRoute({ width: 320, height: 700 }, 'phone-320');
    await verifyVowelRoute({ width: 390, height: 844 }, 'phone-390', true);
    await verifyVowelRoute({ width: 1440, height: 900 }, 'desktop-1440');
} finally {
    await browser.close();
}

async function verifyVowelRoute(viewport, name, complete = false) {
    const context = await browser.newContext({ viewport, locale: 'en-GB' });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await reachVowels(page, `vowels-${name}-${Date.now()}`);
    await page.waitForTimeout(450);

    const intro = await geometry(page);
    assert.equal(intro.scrollWidth, viewport.width, `${name} must not overflow horizontally`);
    assert.equal(intro.paperclipTitleOverlap, false, `${name} paperclip must stay clear of the heading`);
    assert.equal(intro.menuBackOverlap, false, `${name} back control must stay clear of the global menu`);
    assert.equal(intro.menuIdentityOverlap, false, `${name} lesson identity must stay clear of the global menu`);
    assert.ok(intro.controls.every(control => control.width >= 44 && control.height >= 44), `${name} controls must be 44px targets`);
    assert.ok(intro.paper.width >= (viewport.width < 500 ? 270 : 620), `${name} needs a readable paper surface`);
    assert.ok(intro.portrait.width >= (viewport.width < 500 ? 120 : 260), `${name} must keep Xingyu present in the scene`);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-intro.png`), fullPage: true });

    await page.getByRole('button', { name: 'Take the headphones' }).click();
    await page.getByRole('button', { name: 'Visual cue' }).click();
    await page.getByRole('button', { name: 'Hold this shape' }).click();
    await page.locator('.academy-vowel-back').click();
    await page.locator('.academy-vowel-screen').waitFor({ state: 'detached' });
    await openVowelsDirectly(page);
    await page.locator('.academy-vowel-screen').waitFor();
    assert.match(await page.locator('.academy-vowel-progress').innerText(), /1\/5/u, 'paused lesson must resume after Back');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.academy-vowel-screen').waitFor();
    assert.match(await page.locator('.academy-vowel-progress').innerText(), /1\/5/u, 'reload must retain the vowel position');

    if (!complete) {
        await page.screenshot({ path: path.join(artifactDir, `${name}-resume.png`), fullPage: true });
        assert.deepEqual(pageErrors, []);
        await context.close();
        return;
    }

    for (let index = 1; index < 5; index += 1) {
        await page.getByRole('button', { name: 'Hold this shape' }).click();
    }
    await page.getByRole('button', { name: 'Listen without the paper' }).click();
    await completeVisualRound(page);
    await page.waitForTimeout(500);
    if (await page.locator('.academy-vowel-complete').count() === 0) {
        throw new Error(`Five-vowel completion did not render: ${await page.locator('.academy-vowel-screen').innerText()}\n${consoleErrors.join('\n')}`);
    }
    assert.match(await page.locator('.academy-vowel-completed-row').innerText(), /あ・い・う・え・お/u);
    assert.equal(await page.locator('.jpdb-reader-popover').count(), 0, 'kana choices must not open the Reader lookup sheet');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-complete.png`), fullPage: true });

    await page.getByRole('button', { name: 'Play sound bingo' }).click();
    await page.getByRole('button', { name: 'Visual cue' }).click();
    assert.equal(await page.locator('.academy-vowel-bingo-tile').count(), 9, 'bingo must render its complete stable board');
    await completeVisualRound(page);
    await page.getByRole('heading', { name: 'Bingo. The five still held.' }).waitFor();
    assert.equal((await geometry(page)).scrollWidth, viewport.width);
    assert.equal(await page.locator('.jpdb-reader-popover').count(), 0, 'bingo choices must not open the Reader lookup sheet');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-bingo.png`), fullPage: true });
    assert.deepEqual(pageErrors, []);
    await context.close();
}

async function completeVisualRound(page) {
    const kanaForReading = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' };
    for (let index = 0; index < 5; index += 1) {
        const reading = (await page.locator('.academy-vowel-visual-romaji').innerText()).trim();
        const kana = kanaForReading[reading];
        assert.ok(kana, `unknown visual vowel cue: ${reading}`);
        await page.getByRole('button', { name: `Choose ${kana}` }).click();
        if (index < 4) {
            await page.waitForFunction(previous => {
                const cue = document.querySelector('.academy-vowel-visual-romaji');
                return cue instanceof HTMLElement && cue.innerText.trim() !== previous;
            }, reading);
        }
    }
}

async function reachVowels(page, runId) {
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
    await openVowelsDirectly(page);
    await page.locator('.academy-vowel-screen').waitFor();
}

async function openVowelsDirectly(page) {
    await page.evaluate(async () => {
        const app = window.__yomuAcademy;
        if (!app || typeof app.go !== 'function') throw new Error('Academy QA route seam is unavailable.');
        await app.go('source-activity', {
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-vowel-listen',
        });
    });
}

async function geometry(page) {
    return page.locator('.academy-vowel-screen').evaluate(screen => {
        const box = selector => {
            const node = screen.querySelector(selector);
            const rect = node?.getBoundingClientRect();
            return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
        };
        const back = box('.academy-vowel-back');
        const paper = box('.academy-vowel-paper');
        const portrait = box('.academy-vowel-xingyu');
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
    const result = await new AxeBuilder({ page }).include('.academy-vowel-screen').analyze();
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
