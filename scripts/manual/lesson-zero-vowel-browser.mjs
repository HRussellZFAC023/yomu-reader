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
    const audioResponses = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', response => {
        if (response.url().includes('/academy/audio/learning-lines/xingyu/')) {
            audioResponses.push({ url: response.url(), status: response.status() });
        }
    });
    await page.addInitScript(() => {
        const originalPlay = HTMLMediaElement.prototype.play;
        window.__academyVowelPlayedUrls = [];
        HTMLMediaElement.prototype.play = function (...args) {
            window.__academyVowelPlayedUrls.push(this.currentSrc || this.src);
            return originalPlay.apply(this, args);
        };
    });
    await reachVowels(page, `vowels-${name}-${Date.now()}`);
    await page.waitForTimeout(450);
    const augmentation = await page.locator('.academy-vowel-screen').evaluate(screen => ({
        provider: screen.dataset.curriculumAugmentation,
        courseId: screen.dataset.curriculumCourseId,
        topicId: screen.dataset.curriculumTopicId,
        activityId: screen.dataset.curriculumActivityId,
        renderOwner: screen.dataset.curriculumRenderOwner,
        iframeCount: screen.querySelectorAll('iframe').length,
    }));
    assert.deepEqual(augmentation, {
        provider: 'honen',
        courseId: '6a6538d092ef865026522aa5',
        topicId: '6a653ad6ba9069fd1d52ec37',
        activityId: '6a65476ec6b17a86e3547383',
        renderOwner: 'yomu',
        iframeCount: 0,
    }, `${name} must render the mapped curriculum through Yomu`);

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

    await page.getByRole('button', { name: 'Sound' }).click();
    for (let index = 1; index < 5; index += 1) {
        const before = await playedAudioCount(page);
        await page.getByRole('button', { name: 'Hear it in a word' }).click();
        await page.waitForFunction(count => window.__academyVowelPlayedUrls.length > count, before);
    }
    await page.getByRole('button', { name: 'Listen without the paper' }).click();
    await completeAudioRound(page);
    await page.waitForTimeout(500);
    if (await page.locator('.academy-vowel-complete').count() === 0) {
        throw new Error(`Five-vowel completion did not render: ${await page.locator('.academy-vowel-screen').innerText()}\n${consoleErrors.join('\n')}`);
    }
    assert.match(await page.locator('.academy-vowel-completed-row').innerText(), /あ・い・う・え・お/u);
    const playedUrls = await page.evaluate(() => window.__academyVowelPlayedUrls);
    assert.deepEqual(
        [...new Set(playedUrls.map(url => /vowel-([aiueo])__/u.exec(url)?.[1]).filter(Boolean))].sort(),
        ['a', 'e', 'i', 'o', 'u'],
        'the completing route must play all five exact reviewed vowel assets',
    );
    assert.ok(audioResponses.every(entry => [200, 206].includes(entry.status)),
        `exact vowel assets must resolve: ${JSON.stringify(audioResponses)}`);
    assert.equal(await page.locator('.jpdb-reader-popover').count(), 0, 'kana choices must not open the Reader lookup sheet');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-complete.png`), fullPage: true });

    await page.getByRole('button', { name: 'Play sound bingo' }).click();
    await page.getByRole('button', { name: 'Visual cue' }).click();
    assert.equal(await page.locator('.academy-vowel-bingo-tile').count(), 9, 'bingo must render its complete stable board');
    await completeVisualRound(page, true);
    await page.getByRole('heading', { name: 'Stay with the sound that slipped' }).waitFor();
    const contrast = page.locator('.academy-vowel-contrast-repair');
    await contrast.waitFor();
    assert.match(await contrast.innerText(), /Compare the neighbours/u);
    assert.match(
        await contrast.getAttribute('data-curriculum-question-id'),
        /^6a653ad6ba9069fd1d52ec37-g-[123]$/u,
        'the repair must retain the exact Honen question identity',
    );
    await page.screenshot({ path: path.join(artifactDir, `${name}-honen-repair.png`), fullPage: true });
    await page.getByRole('button', { name: 'Keep this sound' }).click();
    await page.getByRole('button', { name: 'Try the five again' }).click();
    await completeVisualRound(page);
    await page.getByRole('heading', { name: 'Bingo. The five still held.' }).waitFor();
    assert.equal((await geometry(page)).scrollWidth, viewport.width);
    assert.equal(await page.locator('.jpdb-reader-popover').count(), 0, 'bingo choices must not open the Reader lookup sheet');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-bingo.png`), fullPage: true });
    assert.deepEqual(pageErrors, []);
    await context.close();
}

async function completeVisualRound(page, missFirst = false) {
    const kanaForReading = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' };
    const alternatives = { a: 'い', i: 'あ', u: 'お', e: 'い', o: 'う' };
    for (let index = 0; index < 5; index += 1) {
        const reading = (await page.locator('.academy-vowel-visual-romaji').innerText()).trim();
        const kana = missFirst && index === 0 ? alternatives[reading] : kanaForReading[reading];
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

async function completeAudioRound(page) {
    const kanaForSound = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' };
    for (let index = 0; index < 5; index += 1) {
        const before = await playedAudioCount(page);
        await page.getByRole('button', { name: 'Play the sound' }).click();
        await page.waitForFunction(count => window.__academyVowelPlayedUrls.length > count, before);
        const url = await page.evaluate(() => window.__academyVowelPlayedUrls.at(-1));
        const sound = /\/xingyu-lesson-zero-vowel-([aiueo])__/u.exec(url)?.[1];
        const kana = kanaForSound[sound];
        assert.ok(kana, `unknown vowel audio binding: ${url}`);
        await page.getByRole('button', { name: `Choose ${kana}` }).click();
    }
}

async function playedAudioCount(page) {
    return page.evaluate(() => window.__academyVowelPlayedUrls.length);
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
    await openVowelsDirectly(page);
    await page.locator('.academy-vowel-screen').waitFor();
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
