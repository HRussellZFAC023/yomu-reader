import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5176';
const viewports = [
    { name: 'desktop', width: 1280, height: 900, plate: /\/locations\/wide\/language-lab__evening-listening--wide\.webp$/u },
    { name: 'mobile', width: 390, height: 844, plate: /\/locations\/mobile\/language-lab__evening-listening--mobile\.webp$/u },
];

const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of viewports) {
        const errors = [];
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        page.on('console', message => {
            if (message.type() === 'error' || message.type() === 'warning') {
                errors.push(`${message.type()}: ${message.text()}`);
            }
        });
        page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

        await prepareModulePage(page);
        await renderPresentation(page);
        await assertPresentation(page, viewport);
        await assertAccessible(page, '.academy-authored-week-story-context', `${viewport.name} story`);
        await renderActivity(page);
        await assertActivity(page, viewport);
        await assertAccessible(page, '#lesson-39-browser-host', `${viewport.name} activity`);
        assert.deepEqual(errors, [], `${viewport.name} browser console must stay clean`);
        await context.close();
    }
    console.log('Lesson 39 browser and accessibility checks passed at 1280x900 and 390x844.');
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

async function renderPresentation(page) {
    await page.evaluate(async () => {
        const [{ validateClassWeekCastPlan }, { getAuthoredWeekRegistration }, story, ui] = await Promise.all([
            import('/src/academy/content/class-week-cast-plan.ts'),
            import('/src/academy/content/lesson-content-registry.ts'),
            import('/src/academy/content/lesson-story-runtime.ts'),
            import('/src/academy/ui/authored-week-screen.ts'),
        ]);
        const plan = validateClassWeekCastPlan(await fetch(
            '/academy/content/curriculum/class-week-cast.v1.json',
        ).then(response => response.json()));
        const entry = story.createLessonStoryRuntime(plan).continuity('l2-l14');
        if (!entry) throw new Error('l2-l14 continuity is unavailable.');
        const presentation = story.lessonStoryPresentation(entry);
        if (!presentation) throw new Error('l2-l14 presentation is unavailable.');
        const registration = getAuthoredWeekRegistration('l2-l14');
        const week = registration.validate(await fetch(
            `/academy/content/lessons/${registration.filename}`,
        ).then(response => response.json()));
        const names = { jenny: 'Jenny', angel: 'Angel' };
        const screen = ui.createAuthoredWeekScreen({
            language: 'en',
            week,
            storyContext: {
                hostId: entry.hostId,
                hostName: names[entry.hostId],
                originPlaceId: presentation.originPlaceId,
                plate: presentation.plate,
                location: presentation.location,
                setup: entry.setup,
                callback: entry.callback.meaningNow,
                dialogue: entry.dialogue?.map(turn => ({ ...turn, speakerName: names[turn.speakerId] })),
            },
        });
        document.body.replaceChildren(screen.element);
    });
}

async function assertPresentation(page, viewport) {
    const screen = page.locator('[data-academy-screen="authored-week"]');
    await screen.waitFor();
    assert.equal(await screen.getAttribute('data-plate'), 'languageLab');
    const background = screen.locator('.academy-background img');
    await background.evaluate(image => image.decode());
    assert.match(await background.evaluate(image => image.currentSrc), viewport.plate);
    assert.ok(await background.evaluate(image => image.naturalWidth > 0 && image.naturalHeight > 0));
    const story = await screen.locator('.academy-authored-week-story-context').innerText();
    assert.match(story, /Jenny/u);
    assert.match(story, /Angel/u);
    assert.equal(await screen.locator('img[src*="/characters/"], img[src*="/items/"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
}

async function renderActivity(page) {
    await page.evaluate(async () => {
        const [{ createLessonThirtyNineStateInspectionBeat }, minigames] = await Promise.all([
            import('/src/academy/content/lesson-thirty-nine-state-inspection.ts'),
            import('/src/academy/minigames/index.ts'),
        ]);
        const host = document.createElement('main');
        host.id = 'lesson-39-browser-host';
        document.body.replaceChildren(host);
        minigames.createAcademyActivityRuntime().mount(createLessonThirtyNineStateInspectionBeat().activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => undefined);
    });
}

async function assertActivity(page, viewport) {
    const visuals = page.locator('[data-source-visual]');
    assert.equal(await visuals.count(), 4);
    for (let index = 0; index < 4; index += 1) {
        const visual = visuals.nth(index);
        assert.match(await visual.getAttribute('data-source-visual'), new RegExp(`/l2-l14/.+page-${index + 1}\\.png$`, 'u'));
        const thumbnail = visual.locator('.academy-source-visual-trigger img');
        assert.equal(await thumbnail.getAttribute('loading'), 'lazy');
        await thumbnail.evaluate(image => image.decode());
        assert.ok(await thumbnail.evaluate(image => image.naturalWidth > 0 && image.naturalHeight > 0));
        assert.equal(await visual.locator('[data-source-inspector] img').count(), 0);
    }

    const trigger = visuals.first().locator('.academy-source-visual-trigger');
    const dialog = visuals.first().locator('[data-source-inspector]');
    await trigger.focus();
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await dialog.evaluate(element => element.open), true);
    assert.equal(await dialog.locator('img').count(), 1);
    assert.equal(await dialog.locator('img').getAttribute('loading'), 'lazy');
    const bounds = await dialog.boundingBox();
    assert.ok(bounds, `${viewport.name} inspector must have browser bounds`);
    assert.ok(bounds.x >= 0 && bounds.y >= 0);
    assert.ok(bounds.x + bounds.width <= viewport.width + 1);
    assert.ok(bounds.y + bounds.height <= viewport.height + 1);
    await assertAccessible(page, '[data-source-inspector]', `${viewport.name} inspector`);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.evaluate(element => element.open), false);
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true);

    const answerKey = page.locator('[data-answer-visibility="after-attempt"]');
    assert.equal(await answerKey.evaluate(element => element.hidden), true);
    assert.equal(await answerKey.evaluate(element => getComputedStyle(element).display), 'none');
    assert.equal(await page.locator('audio').count(), 0);
    assert.equal(await page.locator('img[src*="/characters/"], img[src*="/items/"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
}

async function assertAccessible(page, selector, label) {
    const results = await new AxeBuilder({ page }).include(selector).analyze();
    const blocking = results.violations.filter(violation =>
        violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map(node => node.target),
    })), [], `${label} must have no serious or critical Axe violations`);
}
