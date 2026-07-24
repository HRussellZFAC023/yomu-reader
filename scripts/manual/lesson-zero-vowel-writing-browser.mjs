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
        window.__academyVowelWritingPlayedUrls = [];
        HTMLMediaElement.prototype.play = function (...args) {
            window.__academyVowelWritingPlayedUrls.push(this.currentSrc || this.src);
            return originalPlay.apply(this, args);
        };
    });
    const runId = `vowel-writing-${name}-${Date.now()}`;
    await reachWriting(page, runId);
    await page.waitForTimeout(450);

    const intro = await geometry(page);
    assert.equal(intro.scrollWidth, viewport.width, `${name} must not overflow horizontally`);
    assert.equal(intro.paperclipTitleOverlap, false, `${name} paperclip must stay clear of the heading`);
    assert.equal(intro.globalMenuVisible, false, `${name} focused writing route must not float global chrome over the paper`);
    assert.equal(intro.menuBackOverlap, false, `${name} back control must stay clear of the global menu`);
    assert.equal(intro.menuIdentityOverlap, false, `${name} lesson identity must stay clear of the global menu`);
    assert.ok(intro.controls.every(control => control.width >= 44 && control.height >= 44), `${name} controls must be 44px targets`);
    assert.ok(intro.paper.width >= (viewport.width < 500 ? 270 : 620), `${name} needs a readable writing surface`);
    assert.ok(intro.portrait.width >= (viewport.width < 500 ? 108 : 240), `${name} must keep Rie present in the scene`);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-intro.png`), fullPage: true });

    await page.getByRole('button', { name: 'Start with あ' }).click();
    if (complete) {
        const before = await playedAudioCount(page);
        await page.getByRole('button', { name: 'Hear the sound' }).click();
        await page.waitForFunction(count => window.__academyVowelWritingPlayedUrls.length > count, before);
    }
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
    const repairGeometry = await geometry(page);
    assert.equal(repairGeometry.scrollWidth, viewport.width);
    assert.equal(repairGeometry.globalMenuVisible, false, 'repair paper must remain free of floating global chrome');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-repair.png`), fullPage: true });

    await page.getByRole('button', { name: 'Try this kana again' }).click();
    await page.locator('.academy-vowel-writing-doodle[data-guided="true"]').waitFor();
    await drawKanaA(page);
    await page.getByRole('button', { name: 'Check my mark' }).click();
    await page.waitForFunction(() => {
        const screen = document.querySelector('.academy-vowel-writing-screen');
        const progress = document.querySelector('.academy-vowel-progress')?.textContent?.trim();
        return progress === '1/5' || screen?.getAttribute('data-stage') === 'repair';
    });
    const drawProgress = (await page.locator('.academy-vowel-progress').innerText()).trim();
    if (drawProgress !== '1/5') {
        const checkpoint = await readCheckpoint(page, runId);
        const attempt = checkpoint?.lessonZeroVowelWritingProgress?.attempts?.at(-1);
        const pointerTrace = await page.evaluate(() => window.__academyVowelWritingPointerTrace);
        throw new Error(`Canonical browser trace did not pass: ${JSON.stringify({
            stage: await page.locator('.academy-vowel-writing-screen').getAttribute('data-stage'),
            progress: drawProgress,
            attempt,
            pointerTrace,
        })}`);
    }
    await page.getByRole('button', { name: 'Choose the stroke plan' }).click();

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

    await page.getByRole('heading', { name: 'Can you find them out of order?' }).waitFor();
    assert.equal((await geometry(page)).scrollWidth, viewport.width);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-recall.png`), fullPage: true });
    await page.getByRole('button', { name: 'Choose あ' }).click();
    await page.getByRole('button', { name: 'Check my choice' }).click();
    await page.getByRole('heading', { name: 'Listen once more' }).waitFor();
    assert.equal(await page.locator('.academy-vowel-writing-source-sheet').count(), 0,
        'delayed-recall repair must reveal only one sound-shape link');
    assert.equal(await page.locator('.academy-vowel-writing-guide').count(), 0,
        'delayed-recall repair must not reveal the writing guide');
    assert.equal((await geometry(page)).scrollWidth, viewport.width);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-recall-repair.png`), fullPage: true });
    await page.getByRole('button', { name: 'Try the sound again' }).click();
    await completeRecallRound(page);

    await page.getByRole('heading', { name: 'Five sounds. Five shapes.' }).waitFor();
    assert.equal(await page.locator('.academy-vowel-writing-finished-mark').count(), 5);
    assert.equal(await page.locator('.jpdb-reader-popover').count(), 0, 'writing controls must not open Reader lookup UI');
    const playedUrls = await page.evaluate(() => window.__academyVowelWritingPlayedUrls);
    assert.deepEqual(
        [...new Set(playedUrls.map(url => /vowel-([aiueo])__/u.exec(url)?.[1]).filter(Boolean))].sort(),
        ['a', 'e', 'i', 'o', 'u'],
        'the writing route must retrieve all five shapes from exact reviewed carrier-word audio',
    );
    assert.ok(audioResponses.length >= 5, 'the completing route must request the reviewed vowel assets');
    assert.ok(audioResponses.every(entry => [200, 206].includes(entry.status)),
        `exact vowel assets must resolve: ${JSON.stringify(audioResponses)}`);
    const completeGeometry = await geometry(page);
    assert.equal(completeGeometry.scrollWidth, viewport.width);
    assert.equal(completeGeometry.globalMenuVisible, false, 'completion paper must remain free of floating global chrome');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-complete.png`), fullPage: true });
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unexpectedConsoleErrors(consoleErrors), []);
    await context.close();
}

async function readCheckpoint(page, runId) {
    return page.evaluate(async databaseName => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            const transaction = database.transaction('meta');
            const record = await new Promise((resolve, reject) => {
                const request = transaction.objectStore('meta').get('active-checkpoint');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            return record?.value ?? null;
        } finally {
            database.close();
        }
    }, `yomu-academy-qa-${runId}`);
}

async function completeRecallRound(page) {
    const kanaForSound = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' };
    for (let index = 0; index < 5; index += 1) {
        const before = await playedAudioCount(page);
        await page.getByRole('button', { name: 'Hear the sound' }).click();
        await page.waitForFunction(count => window.__academyVowelWritingPlayedUrls.length > count, before);
        const url = await page.evaluate(() => window.__academyVowelWritingPlayedUrls.at(-1));
        const sound = /\/xingyu-lesson-zero-vowel-([aiueo])__/u.exec(url)?.[1];
        const kana = kanaForSound[sound];
        assert.ok(kana, `unknown vowel-writing recall binding: ${url}`);
        await page.getByRole('button', { name: `Choose ${kana}` }).click();
        await page.getByRole('button', { name: 'Check my choice' }).click();
        if (index < 4) {
            await page.waitForFunction(previous => {
                const progress = document.querySelector('.academy-vowel-progress')?.textContent?.trim();
                return progress !== previous;
            }, `Recall ${index}/5`);
        }
    }
}

async function playedAudioCount(page) {
    return page.evaluate(() => window.__academyVowelWritingPlayedUrls.length);
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

async function drawKanaA(page) {
    const canvas = page.locator('.jpdb-reader-doodle-canvas');
    const box = await canvas.boundingBox();
    assert.ok(box, 'guided writing canvas must have geometry');
    await canvas.evaluate(node => {
        window.__academyVowelWritingPointerTrace = {
            rect: rectRecord(node.getBoundingClientRect()),
            offset: { width: node.offsetWidth, height: node.offsetHeight },
            strokes: [],
        };
        let stroke = null;
        node.addEventListener('pointerdown', event => {
            stroke = [];
            window.__academyVowelWritingPointerTrace.strokes.push(stroke);
            capture(event);
        }, { capture: true });
        node.addEventListener('pointermove', event => {
            if (stroke) capture(event);
        }, { capture: true });
        node.addEventListener('pointerup', event => {
            if (stroke) capture(event);
            stroke = null;
        }, { capture: true });
        function capture(event) {
            const rect = node.getBoundingClientRect();
            stroke.push({
                x: Number(((event.clientX - rect.left) / rect.width).toFixed(4)),
                y: Number(((event.clientY - rect.top) / rect.height).toFixed(4)),
            });
        }
        function rectRecord(rect) {
            return {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
            };
        }
    });
    const strokes = [
        [[0.18, 0.28], [0.42, 0.25], [0.70, 0.24]],
        [[0.49, 0.10], [0.48, 0.35], [0.46, 0.61], [0.35, 0.82]],
        [[0.69, 0.36], [0.82, 0.52], [0.76, 0.72], [0.56, 0.87], [0.31, 0.84],
            [0.20, 0.66], [0.28, 0.48], [0.53, 0.38], [0.68, 0.53]],
    ];
    for (const stroke of strokes) {
        const [first, ...rest] = stroke;
        await page.mouse.move(box.x + box.width * first[0], box.y + box.height * first[1]);
        await page.mouse.down();
        for (const [x, y] of rest) {
            await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 8 });
        }
        await page.mouse.up();
    }
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
    await openWritingDirectly(page);
    await page.locator('.academy-vowel-writing-screen').waitFor();
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
            globalMenuVisible: Boolean(menuRect && menuRect.width > 0 && menuRect.height > 0),
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
