import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5178';
const artifactDir = path.resolve(process.env.PROFILE_SCREENSHOTS ?? 'qa-artifacts/adversarial-page-audit-fixes');
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

    const response = await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
    await page.evaluate(async () => {
        document.body.replaceChildren();
        await import('/src/academy/entrypoint.ts');
        const { renderProfileScreen } = await import('/src/academy/ui/profile-screen.ts');
        document.body.replaceChildren(renderProfileScreen({ language: 'en', onSubmit() {} }));
    });

    await page.locator('input[name="displayName"]').fill('Mina');
    await page.locator('.academy-profile-advance').click();
    await page.locator('textarea[name="learningReason"]').fill('Read Japanese novels');
    await page.locator('.academy-profile-advance').click();
    await page.locator('[data-profile-step="portrait"] img').evaluateAll(images => Promise.all(images.map(image => image.decode())));

    const geometry = await page.locator('.academy-profile-screen').evaluate(screen => {
        const rect = selector => {
            const element = screen.querySelector(selector);
            const box = element.getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
        };
        const paper = rect('.academy-vn-object-slot');
        const actions = rect('.academy-vn-dialogue');
        const cards = [...screen.querySelectorAll('.academy-portrait-option')].map(element => {
            const box = element.getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
        });
        const images = [...screen.querySelectorAll('.academy-portrait-image')].map(element => element.getBoundingClientRect().height);
        const controls = [...screen.querySelectorAll('.academy-vn-dialogue button:not([hidden])')].map(element => {
            const box = element.getBoundingClientRect();
            return { width: box.width, height: box.height };
        }).filter(control => control.width > 0 && control.height > 0);
        return { paper, actions, cards, images, controls, viewport: { width: innerWidth, height: innerHeight } };
    });
    assert.ok(geometry.paper.bottom <= geometry.actions.top - 8, 'portrait paper must not overlap its action strip');
    assert.ok(geometry.cards.every(card => card.left >= geometry.paper.left && card.right <= geometry.paper.right
        && card.top >= geometry.paper.top && card.bottom <= geometry.paper.bottom), 'all portrait cards must fit inside the paper page');
    assert.ok(Math.max(...geometry.cards.map(card => card.bottom)) <= geometry.paper.bottom - 20,
        'the living-paper cut must leave the bottom portrait captions intact');
    assert.ok(geometry.images.every(height => height >= 140), 'portrait choices must show meaningful face and pose detail');
    assert.ok(geometry.controls.every(control => control.width >= 44 && control.height >= 44), 'portrait actions must remain 44px targets');

    const axe = await new AxeBuilder({ page }).include('.academy-profile-screen').analyze();
    const blocking = axe.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => violation.id), []);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(artifactDir, 'phone-profile-portrait.png'), fullPage: false });
    console.log(JSON.stringify({ check: 'phone-profile-portrait', geometry, axeBlocking: 0 }));
    await context.close();
} finally {
    await browser.close();
}
