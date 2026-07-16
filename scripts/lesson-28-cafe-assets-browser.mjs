import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5179';
const viewports = [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of viewports) {
        const context = await browser.newContext({ viewport, locale: 'en-GB' });
        const page = await context.newPage();
        const errors = [];
        page.on('console', message => {
            if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`);
        });
        page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

        await prepareModulePage(page);
        await renderLesson28(page);
        await assertLesson28(page, viewport);
        await renderClaimedCafe(page);
        await assertCafeInspector(page, viewport);
        assert.deepEqual(errors, [], `${viewport.name} browser console must stay clean`);
        await context.close();
    }
    console.log('Lesson 28 mobile art direction and cafe order inspector browser checks passed.');
} finally {
    await browser.close();
}

async function prepareModulePage(page) {
    const response = await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
    await page.evaluate(async () => {
        document.body.replaceChildren();
        await import('/src/academy/entrypoint.ts');
    });
}

async function renderLesson28(page) {
    await page.evaluate(async () => {
        const [{ validateClassWeekCastPlan }, { getAuthoredWeekRegistration }, story, ui] = await Promise.all([
            import('/src/academy/content/class-week-cast-plan.ts'),
            import('/src/academy/content/lesson-content-registry.ts'),
            import('/src/academy/content/lesson-story-runtime.ts'),
            import('/src/academy/ui/authored-week-screen.ts'),
        ]);
        const plan = validateClassWeekCastPlan(await fetch('/academy/content/curriculum/class-week-cast.v1.json').then(response => response.json()));
        const entry = story.createLessonStoryRuntime(plan).continuity('l2-l03');
        if (!entry) throw new Error('Lesson 28 continuity is unavailable.');
        const presentation = story.lessonStoryPresentation(entry);
        if (!presentation) throw new Error('Lesson 28 presentation is unavailable.');
        const registration = getAuthoredWeekRegistration('l2-l03');
        const week = registration.validate(await fetch(`/academy/content/lessons/${registration.filename}`).then(response => response.json()));
        const screen = ui.createAuthoredWeekScreen({
            language: 'en',
            week,
            storyContext: {
                hostId: entry.hostId,
                hostName: entry.hostId,
                originPlaceId: presentation.originPlaceId,
                plate: presentation.plate,
                location: presentation.location,
                setup: entry.setup,
                callback: entry.callback.meaningNow,
            },
        });
        document.body.replaceChildren(screen.element);
    });
}

async function assertLesson28(page, viewport) {
    const screen = page.locator('[data-academy-screen="authored-week"][data-plate="home"]');
    await screen.waitFor();
    const picture = screen.locator('.academy-background');
    assert.equal(await picture.getAttribute('data-mobile-presentation'), 'art-directed-crop');
    assert.equal(await picture.getAttribute('data-mobile-source-variant'), 'wide');
    const image = picture.locator('img');
    await image.evaluate(element => element.decode());
    assert.match(await image.evaluate(element => element.currentSrc), /\/locations\/wide\/home-morning-desk__routine--wide\.jpg$/u);
    assert.ok(await image.evaluate(element => element.naturalWidth === 1600 && element.naturalHeight === 900));
    const position = await image.evaluate(element => getComputedStyle(element).objectPosition);
    assert.equal(position, viewport.name === 'mobile' ? '62% 50%' : '50% 50%');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
}

async function renderClaimedCafe(page) {
    await page.evaluate(async () => {
        const { renderWorldPlaceScreen } = await import('/src/academy/ui/world-screen.ts');
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'cafe',
            route: 'cafe',
            progress: {
                completedScenes: [],
                completedEncounterIds: [],
                metCharacterIds: ['aakash', 'felix'],
                seenIntroductions: ['place:cafe', 'action:world-stamp:cafe'],
                worldVisits: { cafe: 1 },
            },
            onTravel() {},
            onActivity() {},
            onClaimStamp() {},
            onBack() {},
        });
        document.body.replaceChildren(screen);
    });
}

async function assertCafeInspector(page, viewport) {
    const prop = page.locator('[data-item-presentation="cafe-order-inspector"]');
    await prop.waitFor();
    assert.equal(await prop.getAttribute('data-item-asset-id'), 'item.cafe-order-scene');
    assert.equal(await prop.getAttribute('data-item-state'), 'claimed');
    const trigger = prop.locator('.academy-cafe-order-prop-trigger');
    assert.equal(await trigger.isEnabled(), true);
    const thumbnail = trigger.locator('img');
    await thumbnail.evaluate(element => element.decode());
    assert.match(await thumbnail.getAttribute('src'), /\/academy\/art\/items\/cafe-order-scene__v001\.jpg$/u);
    await assertAccessible(page, '[data-item-presentation="cafe-order-inspector"]', `${viewport.name} cafe prop`);

    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = prop.locator('[data-cafe-order-inspector]');
    assert.equal(await dialog.evaluate(element => element.open), true);
    const fullImage = dialog.locator('img');
    await fullImage.evaluate(element => element.decode());
    assert.equal(await fullImage.getAttribute('loading'), 'lazy');
    assert.match(await fullImage.getAttribute('alt'), /rainy cafe table/u);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds, `${viewport.name} cafe inspector must have bounds`);
    assert.ok(bounds.x >= -1 && bounds.y >= -1);
    assert.ok(bounds.x + bounds.width <= viewport.width + 1);
    assert.ok(bounds.y + bounds.height <= viewport.height + 1);
    await assertAccessible(page, '[data-cafe-order-inspector]', `${viewport.name} cafe inspector`);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.evaluate(element => element.open), false);
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
}

async function assertAccessible(page, selector, label) {
    const results = await new AxeBuilder({ page }).include(selector).analyze();
    const blocking = results.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map(node => node.target),
    })), [], `${label} must have no serious or critical Axe violations`);
}
