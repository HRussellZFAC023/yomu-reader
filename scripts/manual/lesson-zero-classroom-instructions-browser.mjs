import assert from 'node:assert/strict';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(
    process.env.CLASSROOM_INSTRUCTION_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-classroom-instructions',
);
await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
    await verifyRoute({ width: 320, height: 700 }, 'phone-320');
    await verifyRoute({ width: 390, height: 844 }, 'phone-390', true);
    await verifyRoute({ width: 1440, height: 900 }, 'desktop-1440');
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
} finally {
    await browser.close();
}

async function verifyRoute(viewport, name, complete = false) {
    const context = await browser.newContext({ viewport, locale: 'en-GB' });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await reachInstructions(page, `classroom-instructions-${name}-${Date.now()}`);
    await page.waitForTimeout(400);
    await assertLayout(page, viewport.width, name);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-intro.png`), fullPage: true });

    await page.getByRole('button', { name: 'Start the rehearsal' }).click();
    await page.locator('.academy-classroom-instruction-actions').waitFor();
    assert.equal(
        await page.getByText('みてください', { exact: true }).count(),
        0,
        'the first answer must stay hidden before commitment',
    );
    await page.locator('[data-action-id="write"]').click();
    await page.locator('.academy-classroom-instruction-feedback[data-outcome="lapse"]').waitFor();
    assert.equal(
        await page.getByText('みてください', { exact: true }).count(),
        1,
        'a lapse must earn the exact Japanese instruction',
    );
    assert.equal(
        await page.locator('.academy-classroom-instruction-room').getAttribute('data-room-action'),
        'write',
        'the room must show the learner’s committed action',
    );
    await assertLayout(page, viewport.width, `${name} lapse`);
    await page.screenshot({ path: path.join(artifactDir, `${name}-repair.png`), fullPage: true });

    await page.getByRole('button', { name: 'Hear it and try again' }).click();
    await page.locator('[data-action-id="look"]').click();
    await page.locator('.academy-classroom-instruction-feedback[data-outcome="pass"]').waitFor();
    await page.getByRole('button', { name: 'Listen for the next instruction' }).click();
    await page.locator('.academy-classroom-instruction-actions').waitFor();

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
        /1 of 7/u,
        'Back must retain the first passed instruction',
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.academy-classroom-instruction-screen[data-session-status="active"]').waitFor();
    assert.match(
        await page.locator('.academy-classroom-instruction-progress').innerText(),
        /1 of 7/u,
        'reload must retain the first passed instruction',
    );

    if (!complete) {
        await assertAccessible(page);
        await page.screenshot({ path: path.join(artifactDir, `${name}-resume.png`), fullPage: true });
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(unexpectedConsoleErrors(consoleErrors), []);
        await context.close();
        return;
    }

    for (const actionId of ['begin', 'write', 'break', 'listen', 'finish', 'say-together']) {
        await page.locator(`[data-action-id="${actionId}"]`).click();
        await page.locator('.academy-classroom-instruction-feedback[data-outcome="pass"]').waitFor();
        const label = actionId === 'say-together'
            ? 'See what you can now follow'
            : 'Listen for the next instruction';
        await page.getByRole('button', { name: label }).click();
    }

    await page.locator('.academy-classroom-instruction-screen[data-session-status="complete"]').waitFor();
    assert.equal(await page.locator('.academy-classroom-instruction-complete').count(), 1);
    assert.match(await page.locator('.academy-classroom-instruction-progress').innerText(), /7 of 7/u);
    await assertLayout(page, viewport.width, `${name} complete`);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-complete.png`), fullPage: true });
    await page.getByRole('button', { name: 'Continue your day' }).click();
    await page.locator('.academy-classroom-instruction-screen').waitFor({ state: 'detached' });
    await page.waitForFunction(() => window.__yomuAcademy?.checkpoint?.route === 'campus');
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unexpectedConsoleErrors(consoleErrors), []);
    await context.close();
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
    await page.getByRole('button', { name: 'Tell Rie' }).click();
    await page.getByRole('button', { name: 'Choose where to begin' }).click();
    await page.getByRole('button', { name: /Begin with Lesson 0/ }).click();
    await page.getByRole('button', { name: /Read the board and enter class/ }).waitFor();
    await openInstructions(page);
    await page.locator('.academy-classroom-instruction-screen').waitFor();
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

function unexpectedConsoleErrors(messages) {
    return messages.filter(
        message => !/^Failed to load resource: the server responded with a status of 401 \(Unauthorized\)$/u.test(message),
    );
}
