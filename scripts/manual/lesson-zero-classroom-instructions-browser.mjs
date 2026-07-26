import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const catalogPath = path.resolve('public/academy/audio/learning-voice-playback.json');
const catalogSource = await readFile(catalogPath);
const catalog = JSON.parse(catalogSource);
const practiceOrder = ['begin', 'finish', 'break', 'look', 'say-together', 'listen', 'write'];
const recallOrder = ['look', 'begin', 'write', 'break', 'listen', 'finish', 'say-together'];
const voiceByAction = new Map(practiceOrder.map(actionId => {
    const bindingId = `lesson-zero:classroom-instruction:${actionId}`;
    const entry = catalog.entries.find(candidate =>
        candidate.bindings.some(binding => binding.lineId === bindingId));
    assert(entry, `Missing accepted voice entry for ${bindingId}`);
    assert.equal(entry.reviewStatus, 'accepted', `${bindingId} must remain accepted`);
    return [actionId, entry];
}));
const artifactDir = path.resolve(
    process.env.CLASSROOM_INSTRUCTION_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-classroom-instructions',
);
await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
    const results = [];
    results.push(await verifyRoute({ width: 320, height: 700 }, 'phone-320'));
    results.push(await verifyRoute({ width: 390, height: 844 }, 'phone-390', true));
    results.push(await verifyRoute({ width: 1440, height: 900 }, 'desktop-1440'));
    await Promise.all([
        'phone-320-intro.png',
        'phone-320-repair.png',
        'phone-320-resume.png',
        'phone-390-intro.png',
        'phone-390-repair.png',
        'phone-390-complete.png',
        'desktop-1440-intro.png',
        'desktop-1440-repair.png',
        'desktop-1440-resume.png',
    ].map(file => access(path.join(artifactDir, file))));
    await writeFile(path.join(artifactDir, 'proof.json'), `${JSON.stringify({
        schema: 'yomu-academy.classroom-instruction-browser-proof.v2',
        verifiedAt: new Date().toISOString(),
        catalogSha256: sha256(catalogSource),
        pacingContract: {
            teachingItems: 7,
            choicesPerDecision: 3,
            repairScope: 1,
            delayedRecallItems: 7,
            orderChanged: true,
        },
        results,
        verdict: 'pass',
    }, null, 2)}\n`);
} finally {
    await browser.close();
}

async function verifyRoute(viewport, name, complete = false) {
    const context = await browser.newContext({ viewport, locale: 'en-GB' });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    const voiceResponses = new Map();
    const actionByUrl = new Map([...voiceByAction.entries()].map(([actionId, entry]) => [entry.url, actionId]));
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', response => {
        const actionId = actionByUrl.get(new URL(response.url()).pathname);
        if (!actionId || ![200, 206].includes(response.status()) || voiceResponses.has(actionId)) return;
        voiceResponses.set(actionId, {
            status: response.status(),
            contentType: response.headers()['content-type'],
            body: response.body(),
        });
    });

    await reachInstructions(page, `classroom-instructions-${name}-${Date.now()}`);
    await page.waitForTimeout(400);
    await assertLayout(page, viewport.width, name);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-intro.png`), fullPage: true });

    await page.getByRole('button', { name: 'Meet the first move' }).click();
    await page.locator('.academy-classroom-instruction-teach').waitFor();
    assert.match(
        await page.locator('.academy-classroom-instruction-progress').innerText(),
        /Learned 0\/7/u,
        'the first screen must state the size of the learning pass',
    );
    await page.locator('.academy-classroom-instruction-replay').click();
    await page.getByRole('button', { name: 'Try this move' }).click();
    await page.locator('.academy-classroom-instruction-actions').waitFor();
    assert.equal(
        await page.locator('.academy-classroom-instruction-action').count(),
        3,
        'each listening decision must stay to three concrete room actions',
    );
    assert.equal(
        await page.getByText('はじめましょう', { exact: true }).count(),
        0,
        'the taught line must leave the action stage before commitment',
    );
    await page.locator('[data-action-id="break"]').click();
    await page.locator('.academy-classroom-instruction-feedback[data-outcome="lapse"]').waitFor();
    assert.equal(
        await page.getByText('はじめましょう', { exact: true }).count(),
        1,
        'a lapse must return only the exact line that slipped',
    );
    assert.equal(
        await page.locator('.academy-classroom-instruction-room').getAttribute('data-room-action'),
        'break',
        'the room must show the learner’s committed action',
    );
    await assertLayout(page, viewport.width, `${name} lapse`);
    await page.screenshot({ path: path.join(artifactDir, `${name}-repair.png`), fullPage: true });

    await page.getByRole('button', { name: 'Hear it and try again' }).click();
    await page.locator('.academy-classroom-instruction-actions').waitFor();
    assert.equal(
        await page.locator('.academy-classroom-instruction-action').count(),
        3,
        'repair must not widen into a full-list retest',
    );
    await page.locator('[data-action-id="begin"]').click();
    await page.locator('.academy-classroom-instruction-feedback[data-outcome="pass"]').waitFor();
    await page.getByRole('button', { name: 'Meet the next move' }).click();
    await page.locator('.academy-classroom-instruction-teach').waitFor();

    await page.getByRole('button', { name: 'Save and leave' }).click();
    await page.locator('.academy-classroom-instruction-screen').waitFor({ state: 'detached' });
    await page.waitForTimeout(500);
    const savedDestination = await page.evaluate(() => {
        const app = window.__yomuAcademy;
        const checkpoint = app?.checkpoint;
        return checkpoint ? {
            route: checkpoint.route,
            lessonId: checkpoint.lessonId,
            activityId: checkpoint.activityId,
            history: checkpoint.routeHistory,
        } : null;
    });
    assert.equal(
        savedDestination?.route,
        'campus',
        `Save and leave must return to its campus origin: ${JSON.stringify(savedDestination)}`,
    );
    await openInstructions(page);
    await page.locator('.academy-classroom-instruction-screen[data-session-status="active"]').waitFor();
    assert.match(
        await page.locator('.academy-classroom-instruction-progress').innerText(),
        /Learned 1\/7/u,
        'Back must retain the first passed instruction',
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.academy-classroom-instruction-screen[data-session-status="active"]').waitFor();
    assert.match(
        await page.locator('.academy-classroom-instruction-progress').innerText(),
        /Learned 1\/7/u,
        'reload must retain the first passed instruction',
    );

    if (!complete) {
        await assertAccessible(page);
        await page.screenshot({ path: path.join(artifactDir, `${name}-resume.png`), fullPage: true });
        const media = await validateVoiceResponses(voiceResponses, ['begin']);
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(unexpectedConsoleErrors(consoleErrors), []);
        await context.close();
        return { viewport, complete: false, media };
    }

    for (const actionId of practiceOrder.slice(1)) {
        await page.locator('.academy-classroom-instruction-teach').waitFor();
        await page.locator('.academy-classroom-instruction-replay').click();
        await page.getByRole('button', { name: 'Try this move' }).click();
        await page.locator('.academy-classroom-instruction-actions').waitFor();
        assert.equal(
            await page.locator('.academy-classroom-instruction-action').count(),
            3,
            `${actionId} must stay a three-way listening decision`,
        );
        await page.locator(`[data-action-id="${actionId}"]`).click();
        await page.locator('.academy-classroom-instruction-feedback[data-outcome="pass"]').waitFor();
        await page.locator('.academy-classroom-instruction-continue').click();
    }

    for (const actionId of recallOrder) {
        await page.locator('.academy-classroom-instruction-actions').waitFor();
        assert.equal(
            await page.locator('.academy-classroom-instruction-action').count(),
            3,
            `${actionId} recall must stay a three-way listening decision`,
        );
        assert.equal(
            await page.locator('.academy-classroom-instruction-teach').count(),
            0,
            'mixed recall must not reteach the line before the learner commits',
        );
        await page.locator(`[data-action-id="${actionId}"]`).click();
        await page.locator('.academy-classroom-instruction-feedback[data-outcome="pass"]').waitFor();
        await page.locator('.academy-classroom-instruction-continue').click();
    }

    await page.locator('.academy-classroom-instruction-screen[data-session-status="complete"]').waitFor();
    assert.equal(await page.locator('.academy-classroom-instruction-complete').count(), 1);
    assert.match(await page.locator('.academy-classroom-instruction-progress').innerText(), /Mixed recall 7\/7/u);
    const persisted = await page.evaluate(() => {
        const state = window.__yomuAcademy?.checkpoint?.classroomInstructionProgress;
        return state ? {
            status: state.status,
            stage: state.stage,
            passed: state.passedCueIds?.length,
            recalled: state.recalledCueIds?.length,
            attempts: state.attempts?.length,
        } : null;
    });
    assert.deepEqual(persisted, {
        status: 'complete',
        stage: 'complete',
        passed: 7,
        recalled: 7,
        attempts: 15,
    });
    await assertLayout(page, viewport.width, `${name} complete`);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-complete.png`), fullPage: true });
    const media = await validateVoiceResponses(voiceResponses, practiceOrder);
    await page.getByRole('button', { name: 'Continue your day' }).click();
    await page.locator('.academy-classroom-instruction-screen').waitFor({ state: 'detached' });
    await page.waitForFunction(() => window.__yomuAcademy?.checkpoint?.route === 'campus');
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unexpectedConsoleErrors(consoleErrors), []);
    await context.close();
    return { viewport, complete: true, persisted, media };
}

async function reachInstructions(page, runId) {
    await page.goto(`${baseUrl}/academy/?qa-auth=bypass&qa-run=${runId}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox').fill('YOMU-LOCAL');
    await page.getByRole('button', { name: 'Open the doors' }).click();
    await page.locator('input[name="displayName"]').fill('Henry');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('textarea[name="learningReason"]').fill('To join conversations without translating first');
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
    await openInstructions(page);
    await page.locator('.academy-classroom-instruction-screen').waitFor();
}

async function advanceOpeningArrival(page) {
    for (let index = 0; index < 40; index += 1) {
        const scene = page.locator('[data-story-arc-id="arc:bridge:opening-arrival"]');
        const moment = await scene.getAttribute('data-story-moment');
        if (moment === 'complete') return;
        const choice = scene.locator('[data-story-option-id]').first();
        const action = scene.locator('.academy-vn-action-slot .academy-vn-primary-action').first();
        if (await choice.count()) await choice.click();
        else if (await action.count()) await action.click();
        else throw new Error(`Opening arrival stalled at moment ${moment ?? '<unknown>'}.`);
    }
    throw new Error('Opening arrival exceeded its 40-step safety limit.');
}

async function openInstructions(page) {
    await page.evaluate(async () => {
        const app = window.__yomuAcademy;
        if (!app || typeof app.go !== 'function') throw new Error('Academy QA route seam is unavailable.');
        await app.go('source-activity', {
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-follow-instructions',
        });
    });
}

async function assertLayout(page, expectedWidth, label) {
    const geometry = await page.locator('.academy-classroom-instruction-screen').evaluate(screen => {
        const rect = selector => {
            const node = screen.querySelector(selector);
            const box = node?.getBoundingClientRect();
            return box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom } : null;
        };
        const overlaps = (a, b) => Boolean(a && b
            && a.left < b.right && a.right > b.left
            && a.top < b.bottom && a.bottom > b.top);
        const menu = [...document.querySelectorAll('button')]
            .find(button => /menu/i.test(`${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`));
        const menuBox = menu?.getBoundingClientRect() ?? null;
        const controls = [...screen.querySelectorAll('button')]
            .map(button => button.getBoundingClientRect())
            .filter(box => box.width > 0 && box.height > 0)
            .map(box => ({ width: box.width, height: box.height }));
        return {
            scrollWidth: document.documentElement.scrollWidth,
            menuBackOverlap: overlaps(menuBox, rect('.academy-classroom-instruction-back')),
            menuTitleOverlap: overlaps(menuBox, rect('.academy-classroom-instruction-heading')),
            controls,
        };
    });
    assert.equal(geometry.scrollWidth, expectedWidth, `${label} must not overflow horizontally`);
    assert.equal(geometry.menuBackOverlap, false, `${label} menu and Back must not overlap`);
    assert.equal(geometry.menuTitleOverlap, false, `${label} menu and title must not overlap`);
    assert.ok(
        geometry.controls.every(control => control.width >= 44 && control.height >= 44),
        `${label} controls must remain 44px touch targets`,
    );
}

async function assertAccessible(page) {
    const result = await new AxeBuilder({ page }).include('.academy-classroom-instruction-screen').analyze();
    const blocking = result.violations.filter(
        violation => violation.impact === 'critical' || violation.impact === 'serious',
    );
    assert.deepEqual(
        blocking.map(violation => violation.id),
        [],
        JSON.stringify(blocking.map(violation => ({
            id: violation.id,
            nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
        })), null, 2),
    );
}

async function validateVoiceResponses(responses, expectedActions) {
    const missing = expectedActions.filter(actionId => !responses.has(actionId));
    assert.deepEqual(missing, [], `the reviewed voice surface did not request: ${missing.join(', ')}`);
    return Promise.all(expectedActions.map(async actionId => {
        const response = responses.get(actionId);
        const entry = voiceByAction.get(actionId);
        const body = await response.body;
        assert.equal(sha256(body), entry.assetSha256, `${actionId} audio bytes must match the accepted catalog`);
        assert.match(
            response.contentType ?? '',
            /^audio\/(?:ogg|opus)/u,
            `${actionId} must be served as Opus audio`,
        );
        return {
            actionId,
            url: entry.url,
            status: response.status,
            bytes: body.length,
            assetSha256: entry.assetSha256,
        };
    }));
}

function unexpectedConsoleErrors(messages) {
    return messages.filter(
        message => !/^Failed to load resource: the server responded with a status of 401 \(Unauthorized\)$/u.test(message),
    );
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}
