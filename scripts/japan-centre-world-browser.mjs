import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5178';
const artifactDir = process.env.JAPAN_CENTRE_SCREENSHOTS
    ? path.resolve(process.env.JAPAN_CENTRE_SCREENSHOTS)
    : undefined;
const viewports = [
    { name: 'desktop', width: 1365, height: 900, expectedPlate: 'wide', reducedMotion: 'no-preference' },
    { name: 'mobile', width: 390, height: 844, expectedPlate: 'mobile', reducedMotion: 'no-preference' },
    { name: 'mobile-reduced-motion', width: 390, height: 844, expectedPlate: 'mobile', reducedMotion: 'reduce' },
];

if (artifactDir) await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of viewports) {
        const errors = [];
        const context = await browser.newContext({
            viewport,
            reducedMotion: viewport.reducedMotion,
            locale: 'en-GB',
        });
        const page = await context.newPage();
        page.on('console', message => {
            if (message.type() === 'error' || message.type() === 'warning') {
                errors.push(`${message.type()}: ${message.text()}`);
            }
        });
        page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

        await prepareModulePage(page);
        await renderJapanCentre(page, 0);
        await assertFirstVisit(page, viewport);
        if (artifactDir) {
            await page.screenshot({
                path: path.join(artifactDir, `${viewport.name}.png`),
                fullPage: false,
            });
        }
        await assertReplay(page);
        await assertAccessible(page, viewport.name);
        assert.deepEqual(errors, [], `${viewport.name} browser console must stay clean`);
        await context.close();
    }
    console.log('Japan Centre browser checks passed at desktop, mobile, and reduced-motion mobile viewports.');
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

async function renderJapanCentre(page, visits) {
    await page.evaluate(async currentVisits => {
        const { renderWorldPlaceScreen } = await import('/src/academy/ui/world-screen.ts');
        window.__japanCentreBrowserEvents = [];
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'japan-centre',
            route: 'world',
            progress: {
                completedScenes: [],
                completedEncounterIds: [],
                metCharacterIds: ['rie', 'aakash', 'sophie', 'felix'],
                seenIntroductions: currentVisits > 0 ? ['place:japan-centre'] : [],
                worldVisits: { 'japan-centre': currentVisits },
            },
            onTravel: place => window.__japanCentreBrowserEvents.push(`travel:${place}`),
            onActivity: route => window.__japanCentreBrowserEvents.push(`activity:${route}`),
            onClaimStamp: stamp => window.__japanCentreBrowserEvents.push(`stamp:${stamp}`),
            onIntroductionComplete: id => window.__japanCentreBrowserEvents.push(`intro:${id}`),
            onPracticeComplete: id => window.__japanCentreBrowserEvents.push(`complete:${id}`),
            onListen: async line => {
                window.__japanCentreBrowserEvents.push(`listen:${line}`);
                return false;
            },
            onBack: () => window.__japanCentreBrowserEvents.push('back'),
        });
        document.body.replaceChildren(screen);
    }, visits);
}

async function assertFirstVisit(page, viewport) {
    const screen = page.locator('[data-current-place="japan-centre"]');
    await screen.waitFor();
    assert.equal(await screen.getAttribute('data-first-visit'), 'true');
    assert.equal(await screen.locator('[data-purpose-surface="gift-counter"]').isHidden(), true);
    assert.equal(await screen.locator('[data-world-arrival-dialogue="place:japan-centre"]').isVisible(), true);

    const background = screen.locator('.academy-background img');
    await background.evaluate(image => image.decode());
    const currentSource = await background.evaluate(image => image.currentSrc);
    assert.match(currentSource, viewport.expectedPlate === 'mobile'
        ? /\/locations\/mobile\/japan-centre__rain-evening-gifts--mobile\.png$/u
        : /\/locations\/wide\/japan-centre__rain-evening-gifts--wide\.png$/u);
    assert.ok(await background.evaluate(image => image.naturalWidth > 0 && image.naturalHeight > 0));
    assert.equal(await screen.locator('img[src*="/characters/"]').count(), 0, 'uncleared cast portraits stay absent');

    await screen.locator('.academy-world-arrival-continue').click();
    assert.equal(await screen.getAttribute('data-first-visit'), 'false');
    assert.equal(await screen.locator('[data-purpose-surface="gift-counter"]').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-world-listen="japan-centre-bag-request"]')), true);
    assert.deepEqual(await browserEvents(page), ['intro:place:japan-centre']);
    assert.equal(await screen.locator('.academy-world-action-speaker').innerText(), 'Aakash-san');

    await screen.locator('[data-world-listen="japan-centre-bag-request"]').click();
    assert.equal(await screen.locator('.academy-world-transcript').isVisible(), true);
    await screen.locator('[data-counter-tag="shirt"]').click();
    assert.match(await screen.locator('[role="status"]').innerText(), /Check the item/u);
    await screen.locator('[data-counter-tag="bag"]').click();
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-choice-id="correct"]')), true);
    await screen.locator('[data-choice-id="where"]').click();
    assert.match(await screen.locator('[role="status"]').innerText(), /Check the tag/u);
    await screen.locator('[data-choice-id="correct"]').click();
    assert.equal(await screen.locator('[data-japan-centre-practice]').getAttribute('data-practice-complete'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[role="status"]')), true);
    assert.deepEqual(await browserEvents(page), [
        'intro:place:japan-centre',
        'listen:このかばんをください。',
        'complete:japan-centre-bag-request',
    ]);

    const sourceStrip = screen.locator('[data-japan-centre-source-primary]');
    assert.equal(await sourceStrip.getAttribute('data-japan-centre-source-relation'), 'source-sequenced-adaptation');
    assert.equal(await sourceStrip.getAttribute('data-japan-centre-source-support'), 'minna genki');
    assert.match(await sourceStrip.innerText(), /Moodle Level 1 Lesson 7 shopping/u);
    assert.match(await sourceStrip.innerText(), /Minna no Nihongo I Lesson 3 sequence/u);
    assert.match(await sourceStrip.innerText(), /Genki I Lesson 2 shopping frame/u);

    const exit = screen.locator('[data-location="bookshop"]');
    await exit.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-location="ramen"]')), true);
    await exit.click();
    await screen.locator('.academy-world-back').click();
    assert.deepEqual((await browserEvents(page)).slice(-2), ['travel:bookshop', 'back']);

    const layout = await page.evaluate(() => {
        const selectors = [
            '.academy-world-hud',
            '.academy-world-action-dock',
            '.academy-world-spatial-exits',
            '.academy-world-back',
        ];
        return {
            viewport: { width: innerWidth, height: innerHeight },
            scrollWidth: document.documentElement.scrollWidth,
            boxes: selectors.map(selector => {
                const element = document.querySelector(selector);
                if (!element) return { selector, missing: true };
                const box = element.getBoundingClientRect();
                return { selector, left: box.left, top: box.top, right: box.right, bottom: box.bottom };
            }),
            reduced: {
                mark: getComputedStyle(document.querySelector('.academy-world-scene-mark')).animationName,
                character: getComputedStyle(document.querySelector('.academy-world-character')).animationName,
            },
        };
    });
    assert.ok(layout.scrollWidth <= layout.viewport.width + 1, `${viewport.name} must not overflow horizontally`);
    for (const box of layout.boxes) {
        assert.equal(box.missing, undefined, `${box.selector} must render`);
        assert.ok(box.left >= -1 && box.top >= -1, `${box.selector} starts inside ${viewport.name}`);
        assert.ok(box.right <= layout.viewport.width + 1, `${box.selector} ends inside ${viewport.name}`);
        assert.ok(box.bottom <= layout.viewport.height + 1, `${box.selector} ends above the ${viewport.name} fold`);
    }
    if (viewport.reducedMotion === 'reduce') {
        assert.equal(layout.reduced.mark, 'none');
        assert.equal(layout.reduced.character, 'none');
    }
    if (viewport.expectedPlate === 'mobile') {
        assert.equal(await screen.locator('.academy-world-map-current')
            .evaluate(element => getComputedStyle(element).display), 'none');
        assert.equal(await screen.locator('.academy-world-character-presence').first()
            .evaluate(element => getComputedStyle(element).clipPath), 'inset(50%)');
    } else {
        assert.equal(await screen.locator('[data-position="center"] .academy-world-character-name')
            .evaluate(element => getComputedStyle(element).visibility), 'hidden');
    }
}

async function assertReplay(page) {
    await renderJapanCentre(page, 1);
    const screen = page.locator('[data-current-place="japan-centre"]');
    assert.equal(await screen.getAttribute('data-first-visit'), 'false');
    assert.equal(await screen.locator('[data-world-arrival-dialogue]').count(), 0);
    assert.equal(await screen.locator('[data-japan-centre-outcome="japan-centre-bag-price"]').count(), 1);
    assert.equal(await screen.locator('[data-world-character="sophie"]').getAttribute('data-presence'), 'comparing-tags');
    assert.equal(await screen.locator('[data-world-character="aakash"]').getAttribute('data-presence'), 'holding-bag');
    assert.equal(await screen.locator('[data-world-character="felix"]').getAttribute('data-presence'), 'choosing-snack');

    const audio = await page.evaluate(async () => {
        const [{ worldLocationAudioProfile }, { AUTHORIZED_AUDIO_CATALOG }] = await Promise.all([
            import('/src/academy/vn/world-location-audio.ts'),
            import('/src/academy/audio/manifest.ts'),
        ]);
        const profile = worldLocationAudioProfile('japan-centre');
        return {
            slot: profile?.music,
            track: profile ? AUTHORIZED_AUDIO_CATALOG[profile.music].music?.id : undefined,
            object: profile?.object,
        };
    });
    assert.deepEqual(audio, {
        slot: 'world.japan-centre',
        track: 'persona.ideal-and-the-real',
        object: 'object.menu-page',
    });
}

async function assertAccessible(page, label) {
    const results = await new AxeBuilder({ page }).include('[data-current-place="japan-centre"]').analyze();
    const blocking = results.violations.filter(violation =>
        violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map(node => node.target),
    })), [], `${label} must have no serious or critical Axe violations`);
}

async function browserEvents(page) {
    return page.evaluate(() => window.__japanCentreBrowserEvents);
}
