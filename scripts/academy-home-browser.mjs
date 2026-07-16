import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5174';
const artifactDir = path.resolve('tmp/academy-home-browser');
const cases = [
    { name: 'desktop', width: 1440, height: 900, reducedMotion: 'no-preference' },
    { name: 'mobile', width: 390, height: 844, reducedMotion: 'no-preference' },
    { name: 'reduced-motion', width: 1280, height: 800, reducedMotion: 'reduce' },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const testCase of cases) {
        const errors = [];
        const context = await browser.newContext({
            viewport: { width: testCase.width, height: testCase.height },
            reducedMotion: testCase.reducedMotion,
        });
        const page = await context.newPage();
        page.on('console', message => {
            if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`);
        });
        page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

        await preparePage(page);
        await renderHome(page);
        await assertHome(page, testCase);
        await assertAccessible(page);
        await page.screenshot({ path: path.join(artifactDir, `${testCase.name}.png`), fullPage: true });
        assert.deepEqual(errors, [], `${testCase.name} browser console must stay clean`);
        await context.close();
    }
    console.log('Academy Home browser checks passed at desktop, mobile, and reduced-motion viewports.');
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

async function renderHome(page) {
    await page.evaluate(async () => {
        const { renderWorldPlaceScreen } = await import('/src/academy/ui/world-screen.ts');
        window.__homeEvents = { introductions: [], completions: [], paperTurns: 0, travels: [], backs: 0, journal: 0, listens: 0 };
        const events = window.__homeEvents;
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'home',
            route: 'home',
            progress: {
                completedScenes: [], completedEncounterIds: [], worldVisits: { home: 0 }, metCharacterIds: ['aakash'],
            },
            random: () => 0,
            onTravel(place) { events.travels.push(place); },
            onActivity(route) { if (route === 'journal') events.journal += 1; },
            onClaimStamp() {},
            onIntroductionComplete(id) { events.introductions.push(id); },
            onListen() { events.listens += 1; return Promise.resolve(true); },
            onPracticeComplete(id) { events.completions.push(id); },
            onPaperTurn() { events.paperTurns += 1; },
            onBack() { events.backs += 1; },
        });
        document.body.replaceChildren(screen);
    });
}

async function assertHome(page, testCase) {
    const screen = page.locator('[data-current-place="home"]');
    await screen.waitFor();
    const image = screen.locator('.academy-background img');
    await image.evaluate(element => element.decode());
    assert.match(await image.evaluate(element => element.currentSrc), /\/locations\/wide\/home-morning-desk__routine--wide\.jpg$/u);
    assert.ok(await image.evaluate(element => element.naturalWidth === 1600 && element.naturalHeight === 900));
    assert.equal(await screen.locator('.academy-background').getAttribute('data-mobile-presentation'), 'art-directed-crop');

    const dialogue = screen.locator('[data-world-arrival-dialogue="place:home"]');
    assert.equal(await dialogue.getAttribute('data-home-dialogue-step'), 'reflection');
    assert.equal(await dialogue.locator('[data-home-reflection]').count(), 3);
    await dialogue.locator('[data-home-reflection="quiet"]').click();
    assert.equal(await dialogue.getAttribute('data-home-dialogue-step'), 'welcome');
    assert.match(await dialogue.innerText(), /routine is allowed to be small/u);
    await dialogue.locator('.academy-home-arrival-continue').click();
    assert.deepEqual(await page.evaluate(() => window.__homeEvents.introductions), ['place:home']);

    const purpose = screen.locator('[data-purpose-surface="journal-desk"]');
    assert.equal(await purpose.evaluate(element => element.hidden), false);
    assert.equal(await purpose.locator('.academy-card, .academy-panel, details, input, textarea, [contenteditable="true"]').count(), 0);
    assert.equal(await purpose.locator('[data-home-practice="living-paper-routine"]').count(), 1);
    assert.match(await purpose.getAttribute('aria-label'), /Home desk/u);
    assert.match(await purpose.locator('[data-home-source]').getAttribute('data-home-source'), /workbook-5:item-4$/u);

    await purpose.locator('[data-world-listen]').click();
    assert.equal(await page.evaluate(() => window.__homeEvents.listens), 1);
    for (const token of ['mary', 'usually', 'six', 'home', 'return']) {
        await purpose.locator(`[data-world-token="${token}"]`).click();
    }
    assert.deepEqual(await page.evaluate(() => window.__homeEvents.completions), ['home-usually-return']);
    await purpose.locator('.academy-home-lift-strips').click();
    assert.equal(await purpose.locator('[data-home-practice]').getAttribute('data-home-replay-count'), '1');
    assert.equal(await page.evaluate(() => window.__homeEvents.paperTurns), 1);
    await purpose.locator('[data-activity-route="journal"]').click();
    assert.equal(await page.evaluate(() => window.__homeEvents.journal), 1);

    assert.equal(await screen.locator('[data-exit-slot]').count(), 2);
    await screen.locator('[data-exit-slot="0"]').click();
    await screen.locator('.academy-world-back').click();
    assert.deepEqual(await page.evaluate(() => window.__homeEvents.travels), ['street']);
    assert.equal(await page.evaluate(() => window.__homeEvents.backs), 1);

    const boxes = await Promise.all([
        ['screen', screen],
        ['purpose', purpose],
        ['exits', screen.locator('.academy-world-spatial-exits')],
        ['call', screen.locator('[data-world-character="aakash"]')],
    ].map(async ([label, locator]) => [label, await locator.boundingBox()]));
    for (const [label, box] of boxes) {
        assert.ok(box, `${testCase.name} ${label} must have browser bounds`);
        assert.ok(box.x >= -1 && box.y >= -1, `${testCase.name} ${label} begins inside the viewport`);
        assert.ok(box.x + box.width <= testCase.width + 1, `${testCase.name} ${label} fits horizontally: ${JSON.stringify(box)}`);
        assert.ok(box.y + box.height <= testCase.height + 1, `${testCase.name} ${label} fits vertically: ${JSON.stringify(box)}`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

    const purposeBox = boxes.find(([label]) => label === 'purpose')[1];
    const exitBoxes = await screen.locator('[data-exit-slot]').evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
    }));
    for (const exitBox of exitBoxes) {
        assert.equal(overlaps(purposeBox, exitBox), false,
            `${testCase.name} notebook stays clear of exits: ${JSON.stringify({ purposeBox, exitBox })}`);
    }
    if (testCase.width > 760) {
        const callBox = boxes.find(([label]) => label === 'call')[1];
        assert.equal(overlaps(purposeBox, callBox), false,
            `${testCase.name} notebook stays clear of the call: ${JSON.stringify({ purposeBox, callBox })}`);
    }

    if (testCase.reducedMotion === 'reduce') {
        for (const selector of ['.academy-background img', '[data-world-character="aakash"]', '.academy-world-action-dock']) {
            assert.equal(await screen.locator(selector).evaluate(element => getComputedStyle(element).animationName), 'none');
        }
    }
}

function overlaps(left, right) {
    return left.x < right.x + right.width && left.x + left.width > right.x
        && left.y < right.y + right.height && left.y + left.height > right.y;
}

async function assertAccessible(page) {
    const results = await new AxeBuilder({ page }).include('[data-current-place="home"]').analyze();
    const blocking = results.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map(node => node.target),
    })), [], 'Home must have no serious or critical Axe violations');
}
