import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5176';
const viewports = [
    { name: 'desktop', width: 1280, height: 900, expectedPlate: 'wide' },
    { name: 'mobile', width: 390, height: 844, expectedPlate: 'mobile' },
];

const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of viewports) {
        const errors = [];
        const page = await browser.newPage({ viewport });
        page.on('console', message => {
            if (message.type() === 'error' || message.type() === 'warning') {
                errors.push(`${message.type()}: ${message.text()}`);
            }
        });
        page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

        await prepareModulePage(page);
        await renderPresentation(page);
        await assertPresentation(page, viewport);
        await renderActivity(page);
        await assertActivity(page, viewport);
        assert.deepEqual(errors, [], `${viewport.name} browser console must stay clean`);
        await page.close();
    }
    console.log('Lesson 35 browser presentation checks passed at 1280x900 and 390x844.');
} finally {
    await browser.close();
}

async function prepareModulePage(page) {
    const response = await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, {
        waitUntil: 'domcontentloaded',
    });
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
        const entry = story.createLessonStoryRuntime(plan).continuity('l2-l10');
        if (!entry) throw new Error('Lesson 35 continuity is unavailable.');
        const presentation = story.lessonStoryPresentation(entry);
        if (!presentation) throw new Error('Lesson 35 presentation is unavailable.');
        const registration = getAuthoredWeekRegistration('l2-l10');
        const week = registration.validate(await fetch(
            `/academy/content/lessons/${registration.filename}`,
        ).then(response => response.json()));
        const screen = ui.createAuthoredWeekScreen({
            language: 'en',
            week,
            storyContext: {
                hostId: entry.hostId,
                hostName: 'Christian',
                originPlaceId: presentation.originPlaceId,
                plate: presentation.plate,
                location: presentation.location,
                setup: entry.setup,
                callback: entry.callback.meaningNow,
                dialogue: entry.dialogue?.map(turn => ({
                    ...turn,
                    speakerName: turn.speakerId === 'christian' ? 'Christian' : 'Aakash',
                })),
            },
        });
        document.body.replaceChildren(screen.element);
    });
}

async function assertPresentation(page, viewport) {
    const screen = page.locator('[data-academy-screen="authored-week"]');
    await screen.waitFor();
    assert.equal(await screen.getAttribute('data-plate'), 'station');
    const background = screen.locator('.academy-background img');
    await background.evaluate(image => image.decode());
    const currentSource = await background.evaluate(image => image.currentSrc);
    assert.match(currentSource, viewport.expectedPlate === 'mobile'
        ? /\/locations\/mobile\/railway-station__day-commute--mobile\.webp$/u
        : /\/locations\/wide\/railway-station__day-commute--wide\.webp$/u);
    assert.ok(await background.evaluate(image => image.naturalWidth > 0 && image.naturalHeight > 0));
    const context = screen.locator('.academy-authored-week-story-context');
    assert.match(await context.innerText(), /Christian/u);
    assert.match(await context.innerText(), /Aakash/u);
    assert.equal(await screen.locator('img[src*="/characters/"], img[src*="/items/"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
}

async function renderActivity(page) {
    await page.evaluate(async () => {
        const [{ createLessonThirtyFiveTokiThresholdBeat }, { createAcademyActivityRuntime }] = await Promise.all([
            import('/src/academy/content/lesson-thirty-five-toki-threshold.ts'),
            import('/src/academy/minigames/index.ts'),
        ]);
        const host = document.createElement('main');
        host.id = 'lesson-35-browser-host';
        document.body.replaceChildren(host);
        createAcademyActivityRuntime().mount(
            createLessonThirtyFiveTokiThresholdBeat().activity,
            {
                language: 'en',
                replace(view) { host.replaceChildren(view); },
                announce() {},
            },
            () => undefined,
        );
    });
}

async function assertActivity(page, viewport) {
    const visuals = page.locator('[data-source-visual]');
    assert.equal(await visuals.count(), 2);
    const thumbnails = visuals.locator('.academy-source-visual-trigger img');
    for (let index = 0; index < await thumbnails.count(); index += 1) {
        await thumbnails.nth(index).evaluate(image => image.decode());
        assert.ok(await thumbnails.nth(index).evaluate(image => image.naturalWidth > 0 && image.naturalHeight > 0));
    }

    const firstTrigger = visuals.nth(0).locator('.academy-source-visual-trigger');
    const firstDialog = visuals.nth(0).locator('[data-source-inspector]');
    const secondDialog = visuals.nth(1).locator('[data-source-inspector]');
    assert.equal(await firstDialog.locator('img').count(), 0);
    assert.equal(await secondDialog.locator('img').count(), 0);
    await firstTrigger.focus();
    assert.equal(await firstTrigger.evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await firstDialog.evaluate(dialog => dialog.open), true);
    assert.equal(await firstDialog.locator('img').count(), 1);
    assert.equal(await secondDialog.locator('img').count(), 0);
    const bounds = await firstDialog.boundingBox();
    assert.ok(bounds, `${viewport.name} inspector must have browser bounds`);
    assert.ok(bounds.x >= 0 && bounds.y >= 0);
    assert.ok(bounds.x + bounds.width <= viewport.width + 1);
    assert.ok(bounds.y + bounds.height <= viewport.height + 1);
    await page.keyboard.press('Escape');
    assert.equal(await firstDialog.evaluate(dialog => dialog.open), false);

    const answerKey = page.locator('[data-answer-visibility="after-attempt"]');
    assert.equal(await answerKey.evaluate(element => element.hidden), true);
    assert.equal(await answerKey.evaluate(element => getComputedStyle(element).display), 'none');
    assert.equal(await page.locator('img[src*="/characters/"], img[src*="/items/"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
}
