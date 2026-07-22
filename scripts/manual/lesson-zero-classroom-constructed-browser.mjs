import assert from 'node:assert/strict';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const scenarios = {
    repair: {
        id: 'repair',
        activityId: 'activity:lesson-zero-reconstruct-repair',
        learningReason: 'To keep a conversation going when I miss something',
        firstModelAnswer: 'わかりますか',
        wrongAnswer: 'わかりました',
        remainingAnswers: [
            'はい、わかります',
            'いいえ、わかりません',
            'もう一度お願いします',
            'いいです',
            'そうです',
            'あってます',
            'ちがいます',
        ],
        total: 8,
        replayLabel: 'Run these moments again',
    },
    desk: {
        id: 'desk',
        activityId: 'activity:lesson-zero-desk-language',
        learningReason: 'To understand the words Rie writes on class handouts',
        firstModelAnswer: 'しゅくだい',
        wrongAnswer: 'れい',
        remainingAnswers: ['れい'],
        total: 2,
        replayLabel: 'Label the desk again',
    },
};
const scenarioId = process.argv[2] ?? 'repair';
const scenario = scenarios[scenarioId];
if (!scenario) throw new TypeError(`Unknown classroom scenario: ${scenarioId}.`);
const artifactDir = path.resolve(
    process.env.CLASSROOM_SCREENSHOTS ?? `qa-artifacts/lesson-zero-classroom-${scenario.id}`,
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
        'phone-320-model.png',
        'phone-320-resume.png',
        'phone-390-intro.png',
        'phone-390-repair.png',
        'phone-390-model.png',
        'phone-390-complete.png',
        'desktop-1440-intro.png',
        'desktop-1440-repair.png',
        'desktop-1440-model.png',
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

    await reachActivity(page, `classroom-${scenario.id}-${name}-${Date.now()}`);
    await page.waitForTimeout(350);
    await assertLayout(page, viewport.width, name);
    await assertAccessible(page);
    await assertScenarioState(page, 'intro');
    assert.equal(
        await page.getByText(scenario.firstModelAnswer, { exact: true }).count(),
        0,
        'the assessed answer must stay hidden before commitment',
    );
    await page.screenshot({ path: path.join(artifactDir, `${name}-intro.png`), fullPage: true });

    await answer(page, scenario.wrongAnswer);
    await page.locator('[data-repair-earned="true"]').waitFor();
    await assertScenarioState(page, 'repair');
    assert.equal(
        await page.getByText(scenario.firstModelAnswer, { exact: true }).count(),
        0,
        'a lapse must earn repair without revealing the model automatically',
    );
    await assertLayout(page, viewport.width, `${name} repair`);
    await page.screenshot({ path: path.join(artifactDir, `${name}-repair.png`), fullPage: true });

    await page.getByRole('button', { name: 'Show Rie’s answer' }).click();
    await page.getByText(scenario.firstModelAnswer, { exact: true }).waitFor();
    await assertScenarioState(page, 'model');
    await page.screenshot({ path: path.join(artifactDir, `${name}-model.png`), fullPage: true });
    await answer(page, scenario.firstModelAnswer);
    await page.locator('.academy-classroom-expression-result[data-outcome="pass"]').waitFor();
    await assertScenarioState(page, 'first-pass');
    await page.getByRole('button', { name: 'Try the next moment' }).click();
    await expectProgress(page, `1 of ${scenario.total} moments answered`);

    await page.getByRole('button', { name: 'Save and leave' }).click();
    await page.locator('.academy-classroom-expression-screen').waitFor({ state: 'detached' });
    await expectRoute(page, 'campus');
    await openActivity(page);
    await page.locator('.academy-classroom-expression-screen').waitFor();
    await expectProgress(page, `1 of ${scenario.total} moments answered`);
    await assertScenarioState(page, 'resume');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.academy-classroom-expression-screen').waitFor();
    await expectProgress(page, `1 of ${scenario.total} moments answered`);
    await assertScenarioState(page, 'resume');

    if (!complete) {
        await assertAccessible(page);
        await page.screenshot({ path: path.join(artifactDir, `${name}-resume.png`), fullPage: true });
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(unexpectedConsoleErrors(consoleErrors), []);
        await context.close();
        return;
    }

    for (const [index, response] of scenario.remainingAnswers.entries()) {
        await answer(page, response);
        if (index === scenario.remainingAnswers.length - 1) break;
        await page.locator('.academy-classroom-expression-result[data-outcome="pass"]').waitFor();
        await page.getByRole('button', { name: 'Try the next moment' }).click();
    }

    await page.locator('.academy-classroom-expression-complete').waitFor();
    await expectProgress(page, `${scenario.total} of ${scenario.total} moments answered`);
    await assertScenarioState(page, 'complete');
    await assertLayout(page, viewport.width, `${name} complete`);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}-complete.png`), fullPage: true });

    await page.getByRole('button', { name: 'Continue your day' }).click();
    await page.locator('.academy-classroom-expression-screen').waitFor({ state: 'detached' });
    await expectRoute(page, 'campus');
    await openActivity(page);
    await page.locator('.academy-classroom-expression-complete').waitFor();
    await assertScenarioState(page, 'complete');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.academy-classroom-expression-complete').waitFor();
    await assertScenarioState(page, 'complete');
    await page.getByRole('button', { name: scenario.replayLabel }).click();
    await page.locator('.academy-classroom-expression-form').waitFor();
    await expectProgress(page, `0 of ${scenario.total} moments answered`);
    await assertScenarioState(page, 'replay');
    await page.getByRole('button', { name: 'Save and leave' }).click();
    await expectRoute(page, 'campus');
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unexpectedConsoleErrors(consoleErrors), []);
    await context.close();
}

async function answer(page, response) {
    const input = page.locator('.academy-classroom-expression-input');
    await input.fill(response);
    await input.press('Enter');
}

async function expectProgress(page, text) {
    await page.locator('.academy-classroom-expression-overall').waitFor();
    assert.equal(await page.locator('.academy-classroom-expression-overall').innerText(), text);
}

async function expectRoute(page, route) {
    await page.waitForFunction(expected => window.__yomuAcademy?.checkpoint?.route === expected, route);
}

async function reachActivity(page, runId) {
    await page.goto(`${baseUrl}/academy/?qa-auth=bypass&qa-run=${runId}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox').fill('YOMU-LOCAL');
    await page.getByRole('button', { name: 'Open the doors' }).click();
    await page.locator('input[name="displayName"]').fill('Henry');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('textarea[name="learningReason"]').fill(scenario.learningReason);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('input[name="portrait"]').first().check();
    await page.getByRole('button', { name: 'Tell Rie' }).click();
    await page.getByRole('button', { name: 'Choose where to begin' }).click();
    await page.getByRole('button', { name: /Begin with Lesson 0/ }).click();
    await page.getByRole('button', { name: /Read the board and enter class/ }).waitFor();
    await openActivity(page);
    await page.locator('.academy-classroom-expression-screen').waitFor();
}

async function openActivity(page) {
    await page.evaluate(async activityId => {
        const app = window.__yomuAcademy;
        if (!app || typeof app.go !== 'function') throw new Error('Academy QA route seam is unavailable.');
        await app.go('source-activity', {
            lessonId: 'lesson:foundation-00',
            activityId,
        });
    }, scenario.activityId);
}

async function assertScenarioState(page, state) {
    if (scenario.id !== 'desk') return;
    const labels = await page.locator('.academy-classroom-expression-desk-label').evaluateAll(nodes =>
        Object.fromEntries(nodes.map(node => [node.dataset.deskSlot, {
            earned: node.dataset.earned,
            text: node.textContent,
        }])));
    const homeworkEarned = ['first-pass', 'resume', 'complete'].includes(state);
    const exampleEarned = state === 'complete';
    assert.equal(labels.homework?.earned, String(homeworkEarned), `${state}: homework label state`);
    assert.equal(labels.example?.earned, String(exampleEarned), `${state}: example label state`);
    assert.equal(labels.homework?.text.includes('しゅくだい'), homeworkEarned, `${state}: homework answer visibility`);
    assert.equal(labels.example?.text.includes('れい'), exampleEarned, `${state}: example answer visibility`);
}

async function assertLayout(page, expectedWidth, label) {
    const geometry = await page.locator('.academy-classroom-expression-screen').evaluate(screen => {
        const rect = selector => {
            const node = screen.querySelector(selector);
            const box = node?.getBoundingClientRect();
            return box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom } : null;
        };
        const overlaps = (a, b) => Boolean(a && b
            && a.left < b.right && a.right > b.left
            && a.top < b.bottom && a.bottom > b.top);
        const menu = document.querySelector('.academy-utility-toggle');
        const menuBox = menu?.getBoundingClientRect() ?? null;
        const controls = [...screen.querySelectorAll('button, input')]
            .map(control => ({ control, box: control.getBoundingClientRect() }))
            .filter(({ box }) => box.width > 0 && box.height > 0)
            .map(({ control, box }) => ({
                element: `${control.tagName.toLowerCase()}.${[...control.classList].join('.')}`,
                label: control.getAttribute('aria-label') ?? control.textContent?.trim() ?? '',
                width: box.width,
                height: box.height,
            }));
        return {
            scrollWidth: document.documentElement.scrollWidth,
            utilityVisible: Boolean(menuBox && menuBox.width > 0 && menuBox.height > 0),
            menuBackOverlap: overlaps(menuBox, rect('.academy-classroom-expression-back')),
            menuTitleOverlap: overlaps(menuBox, rect('.academy-classroom-expression-title')),
            propBodyOverlap: overlaps(
                rect('.academy-classroom-expression-activity-prop'),
                rect('.academy-classroom-expression-body'),
            ),
            controls,
        };
    });
    assert.equal(geometry.scrollWidth, expectedWidth, `${label} must not overflow horizontally`);
    assert.equal(geometry.utilityVisible, false, `${label} must keep global utility chrome out of the focused rehearsal`);
    assert.equal(geometry.menuBackOverlap, false, `${label} menu and Back must not overlap`);
    assert.equal(geometry.menuTitleOverlap, false, `${label} menu and title must not overlap`);
    assert.equal(geometry.propBodyOverlap, false, `${label} activity prop and learning body must not overlap`);
    const undersized = geometry.controls.filter(control => control.width < 44 || control.height < 44);
    assert.deepEqual(undersized, [], `${label} controls must remain 44px touch targets`);
}

async function assertAccessible(page) {
    const result = await new AxeBuilder({ page }).include('.academy-classroom-expression-screen').analyze();
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
    const bunproCorsPattern = /^Access to fetch at 'https:\/\/api\.bunpro\.jp\/api\/frontend\/search\/reviewables_v1_1' .* has been blocked by CORS policy:/u;
    const hasExpectedBunproCors = messages.some(message => bunproCorsPattern.test(message));
    let ignoredBunproNetworkFailure = false;
    return messages.filter(message => {
        if (/^Failed to load resource: the server responded with a status of 401 \(Unauthorized\)$/u.test(message)) {
            return false;
        }
        if (bunproCorsPattern.test(message)) return false;
        if (hasExpectedBunproCors
            && !ignoredBunproNetworkFailure
            && message === 'Failed to load resource: net::ERR_FAILED') {
            ignoredBunproNetworkFailure = true;
            return false;
        }
        return true;
    });
}
