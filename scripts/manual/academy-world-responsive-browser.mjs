import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5174';
const artifactDir = path.resolve('tmp/academy-world-responsive');
const cases = [
    { name: 'phone', width: 390, height: 844, rail: true },
    { name: 'portrait-tablet', width: 1024, height: 1366, rail: true },
    { name: 'desktop', width: 1440, height: 900, rail: false },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const testCase of cases) {
        const errors = [];
        const context = await browser.newContext({
            viewport: { width: testCase.width, height: testCase.height },
            reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        page.on('console', message => {
            if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`);
        });
        page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

        await preparePage(page);
        await renderCafe(page);
        await assertCafeGeometry(page, testCase);
        await assertAccessible(page);
        await page.screenshot({ path: path.join(artifactDir, `${testCase.name}.png`), fullPage: true });
        assert.deepEqual(errors, [], `${testCase.name} browser console must stay clean`);
        await context.close();
    }
    console.log('Academy world responsiveness passed at phone, portrait-tablet, and desktop viewports.');
} finally {
    await browser.close();
}

async function preparePage(page) {
    const response = await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
    await page.evaluate(async () => {
        document.body.replaceChildren();
        await import('/src/academy/entrypoint.ts');
    });
}

async function renderCafe(page) {
    await page.evaluate(async () => {
        const { renderWorldPlaceScreen } = await import('/src/academy/ui/world-screen.ts');
        window.__worldResponsiveEvents = { travels: [] };
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'cafe',
            route: 'world',
            progress: {
                completedScenes: [],
                completedEncounterIds: [],
                worldVisits: { cafe: 1 },
                metCharacterIds: ['aakash', 'felix'],
                seenIntroductions: ['place:cafe'],
            },
            onTravel(place) { window.__worldResponsiveEvents.travels.push(place); },
            onActivity() {},
            onClaimStamp() {},
            onIntroductionComplete() {},
            onPracticeComplete() {},
            onObjectInteract() {},
            onBack() {},
        });
        document.body.replaceChildren(screen);
    });
    const background = page.locator('[data-current-place="cafe"] .academy-background img');
    await background.waitFor();
    await background.evaluate(element => element.decode());
}

async function assertCafeGeometry(page, testCase) {
    const screen = page.locator('[data-current-place="cafe"]');
    await screen.waitFor();
    await page.waitForTimeout(50);

    await assertInsideViewport(screen, testCase, 'world screen');
    for (const [index, character] of (await screen.locator('.academy-world-character').all()).entries()) {
        await assertInsideViewport(character, testCase, `character ${index + 1}`);
    }
    for (const [index, caption] of (await screen.locator('.academy-world-character-presence, .academy-world-character-name').all()).entries()) {
        if (!await caption.isVisible()) continue;
        await assertInsideViewport(caption, testCase, `character caption ${index + 1}`);
    }

    const purpose = screen.locator('.academy-world-action-dock:not([hidden])');
    const exits = screen.locator('.academy-world-spatial-exits');
    await assertInsideViewport(purpose, testCase, 'learning surface');
    await assertInsideViewport(exits, testCase, 'route surface');

    const purposeBox = await purpose.boundingBox();
    const exitsBox = await exits.boundingBox();
    assert.ok(purposeBox && exitsBox);
    if (testCase.rail) {
        assert.ok(purposeBox.y + purposeBox.height <= exitsBox.y + 1,
            `${testCase.name} learning surface must reserve the route rail: ${JSON.stringify({ purposeBox, exitsBox })}`);
    }

    const railOverflow = await exits.evaluate(element => getComputedStyle(element).overflowX);
    assert.equal(railOverflow === 'auto' || railOverflow === 'scroll', testCase.rail,
        `${testCase.name} route layout should ${testCase.rail ? '' : 'not '}use a horizontal rail`);

    const routeButtons = await screen.locator('.academy-world-exit').all();
    assert.ok(routeButtons.length >= 2, `${testCase.name} needs multiple routes for a meaningful responsive check`);
    for (const [index, route] of routeButtons.entries()) {
        await route.evaluate(element => element.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
        await assertInsideViewport(route, testCase, `route ${index + 1}`);
        if (!testCase.rail) {
            const routeBox = await route.boundingBox();
            assert.ok(routeBox && !boxesOverlap(purposeBox, routeBox),
                `${testCase.name} route ${index + 1} must not overlap the learning surface`);
        }
    }
    if (testCase.rail) await exits.evaluate(element => { element.scrollLeft = 0; });

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
        `${testCase.name} must not create document-level horizontal overflow`);
}

function boxesOverlap(a, b) {
    return a.x < b.x + b.width
        && a.x + a.width > b.x
        && a.y < b.y + b.height
        && a.y + a.height > b.y;
}

async function assertInsideViewport(locator, testCase, label) {
    const box = await locator.boundingBox();
    assert.ok(box, `${testCase.name} ${label} must have browser bounds`);
    assert.ok(box.x >= -1 && box.y >= -1,
        `${testCase.name} ${label} starts inside the viewport: ${JSON.stringify(box)}`);
    assert.ok(box.x + box.width <= testCase.width + 1,
        `${testCase.name} ${label} fits horizontally: ${JSON.stringify(box)}`);
    assert.ok(box.y + box.height <= testCase.height + 1,
        `${testCase.name} ${label} fits vertically: ${JSON.stringify(box)}`);
}

async function assertAccessible(page) {
    const results = await new AxeBuilder({ page }).include('[data-current-place="cafe"]').analyze();
    const blocking = results.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map(node => node.target),
    })), [], 'Cafe must have no serious or critical Axe violations');
}
