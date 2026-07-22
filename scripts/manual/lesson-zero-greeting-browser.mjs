import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.GREETING_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-greeting');
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
    await verifyMobileGreeting({ width: 320, height: 700 });
    await verifyMobileGreeting({ width: 390, height: 844 }, true);
    await verifyDesktopGreeting();
} finally {
    await browser.close();
}

async function verifyMobileGreeting(viewport, completeFlow = false) {
    const context = await browser.newContext({ viewport, locale: 'en-GB' });
    await context.addInitScript(() => {
        if (!navigator.mediaDevices) return;
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
            configurable: true,
            value: () => Promise.reject(new DOMException('Microphone denied for fallback QA.', 'NotAllowedError')),
        });
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await reachGreeting(page, `greeting-${viewport.width}-${Date.now()}`);
    await page.waitForTimeout(500);

    const introGeometry = await greetingGeometry(page);
    assert.equal(introGeometry.scrollWidth, viewport.width, 'greeting must not overflow horizontally');
    assert.ok(introGeometry.heading.width >= (viewport.width === 320 ? 175 : 240), 'mobile title needs usable width');
    assert.ok(introGeometry.back.left >= viewport.width - 66, 'back control must stay clear of the reader menu');
    assert.equal(introGeometry.menuBackOverlap, false, 'reader menu and greeting back control must not overlap');
    assert.equal(introGeometry.paperclipTitleOverlap, false, 'paperclip must not cover the learning heading');
    assert.ok(introGeometry.controls.every(control => control.width >= 44 && control.height >= 44), 'visible greeting controls must be 44px targets');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `phone-${viewport.width}-intro.png`), fullPage: true });

    await page.getByRole('button', { name: 'Build my greeting' }).click();
    await page.locator('.academy-greeting-phrase-bank button').first().click();
    await page.locator('.academy-greeting-back').click();
    await page.locator('.academy-lesson-overview-screen').waitFor();
    await page.locator('.academy-lesson-overview-section-action').first().click();
    await page.locator('.academy-greeting-screen').waitFor();
    assert.equal(await page.locator('.academy-greeting-selected-rail button').count(), 1, 'paused greeting must resume at the chosen strip');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.academy-greeting-screen').waitFor();
    assert.equal(await page.locator('.academy-greeting-selected-rail button').count(), 1, 'reload must retain the paused greeting');
    await page.locator('.academy-greeting-selected-rail button').click();

    if (!completeFlow) {
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(artifactDir, `phone-${viewport.width}-arrange.png`), fullPage: true });
        const arrangeGeometry = await greetingGeometry(page);
        assert.equal(arrangeGeometry.scrollWidth, viewport.width);
        assert.equal(arrangeGeometry.paperclipTitleOverlap, false, 'paperclip must stay clear of the arrangement heading');
        assert.deepEqual(pageErrors, []);
        await context.close();
        return;
    }

    for (let index = 0; index < 4; index += 1) {
        await page.locator('.academy-greeting-phrase-bank button').first().click();
    }
    await page.getByRole('button', { name: 'Check the order' }).click();
    await assertVisibleText(page, '.academy-greeting-arrangement-feedback', 'Evening first');
    for (let index = 0; index < 4; index += 1) {
        await page.locator('.academy-greeting-selected-rail button').first().click();
    }
    for (const phrase of ['こんばんは。', 'はじめまして。', 'Henryです。', 'よろしくお願いします。']) {
        await page.locator('.academy-greeting-phrase-bank button').filter({ hasText: phrase }).click();
    }
    await page.getByRole('button', { name: 'Check the order' }).click();
    await page.locator('.academy-greeting-mode-chooser').waitFor();
    assert.equal(await page.locator('.academy-greeting-repair').count(), 0, 'model answer must stay hidden before a lapse');

    await page.getByRole('button', { name: 'Record privately' }).click();
    await page.getByRole('button', { name: 'Start recording' }).click();
    await assertVisibleText(page, '.academy-greeting-live', 'recording is unavailable');
    await page.getByRole('button', { name: 'Choose another way' }).click();
    await page.getByRole('button', { name: 'Use the keyboard' }).click();
    await page.locator('textarea[name="greeting"]').fill('こんばんは。');
    await page.getByRole('button', { name: 'Send it to Rie' }).click();
    await page.locator('.academy-greeting-repair').waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.academy-greeting-review-phrase').count(), 0, 'a lapse must not seed completed review items');
    await page.screenshot({ path: path.join(artifactDir, 'phone-390-repair.png'), fullPage: true });

    await page.locator('textarea[name="greeting"]').fill('こんばんは。はじめまして。Henryです。よろしくお願いします。');
    await page.getByRole('button', { name: 'Send it to Rie' }).click();
    await page.locator('.academy-greeting-complete').waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.academy-greeting-review-phrase').count(), 4, 'a completed greeting must create four review memories');
    assert.equal((await greetingGeometry(page)).scrollWidth, viewport.width);
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, 'phone-390-complete.png'), fullPage: true });
    assert.deepEqual(pageErrors, []);
    await context.close();
}

async function verifyDesktopGreeting() {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await reachGreeting(page, `greeting-desktop-${Date.now()}`);
    await page.waitForTimeout(500);
    const geometry = await greetingGeometry(page);
    assert.equal(geometry.scrollWidth, 1440);
    assert.ok(geometry.paper.width >= 620, 'desktop greeting must use the available learning space');
    assert.ok(geometry.portrait.width >= 260, 'desktop Rie portrait must remain a first-class scene element');
    assert.ok(geometry.controls.every(control => control.width >= 44 && control.height >= 44));
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, 'desktop-1440-intro.png'), fullPage: true });
    assert.deepEqual(pageErrors, []);
    await context.close();
}

async function reachGreeting(page, runId) {
    await page.goto(`${baseUrl}/academy/?qa-auth=bypass&qa-run=${runId}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox').fill('YOMU-LOCAL');
    await page.getByRole('button', { name: 'Open the doors' }).click();
    await page.locator('input[name="displayName"]').fill('Henry');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('textarea[name="learningReason"]').fill('To talk with friends');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('input[name="portrait"]').first().check();
    await page.getByRole('button', { name: 'Tell Rie' }).click();
    await page.getByRole('button', { name: 'Choose where to begin' }).click();
    await page.getByRole('button', { name: /Begin with Lesson 0/ }).click();
    await page.getByRole('button', { name: /Read the board and enter class/ }).click();
    await page.locator('[data-current-place="classroom"]').waitFor();
    await page.waitForTimeout(900);
    const readBoard = page.getByRole('button', { name: 'Read the board' });
    for (let attempt = 0; attempt < 2 && await readBoard.isVisible().catch(() => false); attempt += 1) {
        await readBoard.click();
        await page.waitForTimeout(300);
    }
    await page.locator('[data-classroom-practice="board-listen-check"]').waitFor();
    await page.locator('.academy-world-practice-option').first().click();
    await page.locator('[data-classroom-practice="board-listen-check"][data-practice-complete="true"]').waitFor();
    await page.locator('[data-activity-route="class"]').click();
    await page.locator('.academy-lesson-overview-screen').waitFor();
    await page.locator('.academy-lesson-overview-section-action').first().click();
    await page.locator('.academy-greeting-screen').waitFor();
}

async function greetingGeometry(page) {
    return page.locator('.academy-greeting-screen').evaluate(screen => {
        const box = selector => {
            const element = screen.querySelector(selector);
            const rect = element.getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const back = box('.academy-greeting-back');
        const menu = [...document.querySelectorAll('button')].find(button => /menu/i.test(`${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`));
        const menuRect = menu?.getBoundingClientRect();
        const menuBackOverlap = Boolean(menuRect
            && back.left < menuRect.right && back.right > menuRect.left
            && back.top < menuRect.bottom && back.bottom > menuRect.top);
        const controls = [...screen.querySelectorAll('button')].map(element => element.getBoundingClientRect())
            .filter(rect => rect.width > 0 && rect.height > 0)
            .map(rect => ({ width: rect.width, height: rect.height }));
        const paperElement = screen.querySelector('.academy-greeting-paper');
        const portraitElement = screen.querySelector('[class*="academy-greeting-"][class*="-portrait"]');
        const paperclipElement = screen.querySelector('.academy-greeting-paperclip');
        const learningTitleElement = screen.querySelector('.academy-greeting-dialogue, .academy-greeting-section-title, .academy-greeting-complete-title');
        const paperRect = paperElement?.getBoundingClientRect();
        const portraitRect = portraitElement?.getBoundingClientRect();
        const paperclipRect = paperclipElement?.getBoundingClientRect();
        const learningTitleRect = learningTitleElement?.getBoundingClientRect();
        const paperclipTitleOverlap = Boolean(paperclipRect && learningTitleRect
            && paperclipRect.left < learningTitleRect.right && paperclipRect.right > learningTitleRect.left
            && paperclipRect.top < learningTitleRect.bottom && paperclipRect.bottom > learningTitleRect.top);
        return {
            scrollWidth: document.documentElement.scrollWidth,
            heading: box('.academy-greeting-heading'),
            back,
            menuBackOverlap,
            paperclipTitleOverlap,
            controls,
            paper: { width: paperRect?.width ?? 0, height: paperRect?.height ?? 0 },
            portrait: { width: portraitRect?.width ?? 0, height: portraitRect?.height ?? 0 },
        };
    });
}

async function assertAccessible(page) {
    const result = await new AxeBuilder({ page }).include('.academy-greeting-screen').analyze();
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

async function assertVisibleText(page, selector, text) {
    const element = page.locator(selector);
    await element.waitFor();
    assert.match(await element.innerText(), new RegExp(text, 'i'));
}
