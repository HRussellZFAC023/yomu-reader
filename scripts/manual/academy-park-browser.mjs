import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5174';
const artifactDir = path.resolve('tmp/academy-park-browser');
const cases = [
    { name: 'desktop', width: 1440, height: 900, plate: 'wide', reducedMotion: 'no-preference' },
    { name: 'mobile', width: 390, height: 844, plate: 'mobile', reducedMotion: 'no-preference' },
    { name: 'reduced-motion', width: 1280, height: 800, plate: 'wide', reducedMotion: 'reduce' },
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
        await renderPark(page);
        await assertPark(page, testCase);
        await assertAccessible(page);
        await page.screenshot({ path: path.join(artifactDir, `${testCase.name}.png`), fullPage: true });
        assert.deepEqual(errors, [], `${testCase.name} browser console must stay clean`);
        await context.close();
    }
    console.log('Academy Park browser checks passed at desktop, mobile, and reduced-motion viewports.');
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

async function renderPark(page) {
    await page.evaluate(async () => {
        const { renderWorldPlaceScreen } = await import('/src/academy/ui/world-screen.ts');
        window.__parkEvents = { introductions: [], completions: [], sketches: 0, travels: [], backs: 0 };
        const events = window.__parkEvents;
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'park',
            route: 'world',
            progress: {
                completedScenes: [], completedEncounterIds: [], worldVisits: { park: 0 },
                metCharacterIds: ['felix', 'peter'],
            },
            onTravel(place) { events.travels.push(place); },
            onActivity() {},
            onClaimStamp() {},
            onIntroductionComplete(id) { events.introductions.push(id); },
            onPracticeComplete(id) { events.completions.push(id); },
            onObjectInteract() { events.sketches += 1; },
            onBack() { events.backs += 1; },
        });
        document.body.replaceChildren(screen);
    });
}

async function assertPark(page, testCase) {
    const screen = page.locator('[data-current-place="park"]');
    await screen.waitFor();
    const image = screen.locator('.academy-background img');
    await image.evaluate(element => element.decode());
    const currentSource = await image.evaluate(element => element.currentSrc);
    assert.match(currentSource, testCase.plate === 'mobile'
        ? /\/locations\/mobile\/park__day-overcast--mobile\.webp$/u
        : /\/locations\/wide\/park__day-overcast--wide\.webp$/u);
    assert.ok(await image.evaluate(element => element.naturalWidth > 0 && element.naturalHeight > 0));

    assert.equal(await screen.locator('[data-world-character]').count(), 2);
    assert.equal(await screen.locator('[data-world-character] img').count(), 0);
    assert.equal(await screen.locator('.academy-world-character-silhouette').count(), 2);
    assert.equal(await screen.locator('[data-world-arrival-dialogue="place:park"]').count(), 1);
    assert.match(await screen.locator('[data-world-arrival-dialogue]').innerText(), /colour from the sky on paper/u);

    await screen.locator('.academy-world-arrival-continue').click();
    assert.deepEqual(await page.evaluate(() => window.__parkEvents.introductions), ['place:park']);
    const purpose = screen.locator('[data-purpose-surface="weather-sketchbook"]');
    assert.equal(await purpose.evaluate(element => element.hidden), false);
    assert.equal(await purpose.locator('.academy-world-curriculum, input, textarea, [contenteditable="true"], [data-choice-id]').count(), 0);
    assert.equal(await purpose.locator('.academy-panel, .academy-card, details').count(), 0);
    assert.equal(await purpose.locator('[data-park-source="genki-2e:l1-l11:lesson-5-workbook-2:slot-9"]').count(), 1);

    const sketch = purpose.locator('[data-park-practice="weather-sketchbook"]');
    const markBefore = await sketch.getAttribute('data-weather-mark');
    const seal = purpose.locator('[data-park-weather-seal]');
    await seal.focus();
    assert.equal(await seal.evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    const markAfter = await sketch.getAttribute('data-weather-mark');
    assert.notEqual(markAfter, markBefore);
    assert.equal(await sketch.getAttribute('data-sketch-pressed'), 'true');
    assert.deepEqual(await page.evaluate(() => window.__parkEvents.completions), ['park-overcast-weather']);
    assert.equal(await page.evaluate(() => window.__parkEvents.sketches), 1);

    assert.equal(await screen.locator('[data-exit-slot]').count(), 3);
    await screen.locator('[data-exit-slot="0"]').click();
    assert.deepEqual(await page.evaluate(() => window.__parkEvents.travels), ['street']);
    await screen.locator('.academy-world-back').click();
    assert.equal(await page.evaluate(() => window.__parkEvents.backs), 1);

    const screenBox = await screen.boundingBox();
    const purposeBox = await purpose.boundingBox();
    const exitsBox = await screen.locator('.academy-world-spatial-exits').boundingBox();
    for (const [label, box] of [['screen', screenBox], ['purpose', purposeBox], ['exits', exitsBox]]) {
        assert.ok(box, `${testCase.name} ${label} must have browser bounds`);
        assert.ok(box.x >= -1 && box.y >= -1, `${testCase.name} ${label} begins inside the viewport`);
        assert.ok(box.x + box.width <= testCase.width + 1,
            `${testCase.name} ${label} fits horizontally: ${JSON.stringify(box)}`);
        assert.ok(box.y + box.height <= testCase.height + 1,
            `${testCase.name} ${label} fits vertically: ${JSON.stringify(box)}`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

    if (testCase.reducedMotion === 'reduce') {
        for (const selector of ['.academy-background img', '.academy-world-scene-mark', '.academy-park-weather-ink']) {
            assert.equal(await screen.locator(selector).first().evaluate(element => getComputedStyle(element).animationName), 'none');
        }
        assert.equal(await screen.locator('.academy-park-weather-ink').evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    }
}

async function assertAccessible(page) {
    const results = await new AxeBuilder({ page }).include('[data-current-place="park"]').analyze();
    const blocking = results.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map(node => node.target),
    })), [], 'Park must have no serious or critical Axe violations');
}
