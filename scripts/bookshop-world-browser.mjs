import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5178';
const artifactDir = path.resolve(process.env.BOOKSHOP_SCREENSHOTS ?? 'qa-artifacts/bookshop-world');
const viewports = [
    { name: 'desktop', width: 1440, height: 900, expectedPlate: 'wide' },
    { name: 'phone', width: 390, height: 844, expectedPlate: 'mobile' },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
    for (const viewport of viewports) {
        const errors = [];
        const context = await browser.newContext({ viewport, locale: 'en-GB' });
        const page = await context.newPage();
        await assertAcademyRoot(page);
        page.on('console', message => {
            if (message.type() === 'error' || message.type() === 'warning') {
                errors.push(`${message.type()}: ${message.text()}`);
            }
        });
        page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

        await prepareModulePage(page);
        await renderBookshop(page);
        await page.waitForTimeout(750);
        const evidence = await assertFirstVisit(page, viewport);
        await page.screenshot({
            path: path.join(artifactDir, `${viewport.name}-arrival.png`),
            fullPage: false,
        });

        await page.locator('.academy-world-arrival-continue').click();
        await page.locator('[data-bookshop-catalogue]:not([hidden])').waitFor();
        assert.equal(await page.locator('.academy-world-action-dock').evaluate(element =>
            getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
        const clippedCharacterLabels = await page.locator(
            '[data-current-place="bookshop"] .academy-world-character-presence, '
            + '[data-current-place="bookshop"] .academy-world-character-name',
        ).evaluateAll(elements => elements.filter(element => {
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const rect = element.getBoundingClientRect();
            return rect.left < -1 || rect.right > innerWidth + 1;
        }).map(element => element.textContent?.trim()));
        assert.deepEqual(clippedCharacterLabels, [], `${viewport.name} character labels must not clip`);
        await page.screenshot({
            path: path.join(artifactDir, `${viewport.name}-catalogue.png`),
            fullPage: false,
        });

        const axe = await new AxeBuilder({ page }).include('[data-current-place="bookshop"]').analyze();
        const blocking = axe.violations.filter(violation =>
            violation.impact === 'critical' || violation.impact === 'serious');
        assert.deepEqual(blocking.map(violation => ({
            id: violation.id,
            targets: violation.nodes.map(node => node.target),
        })), [], `${viewport.name} Bookshop must have no serious or critical Axe violations`);
        assert.deepEqual(errors, [], `${viewport.name} browser console must stay clean`);
        const result = { viewport: viewport.name, ...evidence, axeBlocking: 0 };
        results.push(result);
        console.log(JSON.stringify(result));
        await context.close();
    }
} finally {
    await browser.close();
}
await writeFile(
    path.join(artifactDir, 'report.json'),
    `${JSON.stringify({ check: 'bookshop-world', results }, null, 2)}\n`,
);

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

async function assertAcademyRoot(page) {
    const response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy root is not reachable at ${baseUrl}`);
    assert.equal(new URL(page.url()).pathname, '/academy/');
    assert.equal(await page.title(), 'よむ Academy');
    const firstControl = page.locator('button:visible').first();
    await firstControl.waitFor({ state: 'visible' });
    assert.ok((await firstControl.innerText()).trim(), 'Academy root must expose a named interactive control');
}

async function renderBookshop(page) {
    await page.evaluate(async () => {
        const { renderWorldPlaceScreen } = await import('/src/academy/ui/world-screen.ts');
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'bookshop',
            route: 'world',
            progress: {
                completedScenes: [],
                completedEncounterIds: [],
                metCharacterIds: ['sophie'],
            },
            onTravel() {},
            onActivity() {},
            onClaimStamp() {},
            onIntroductionComplete() {},
            onPracticeComplete() {},
            onListen: async () => false,
            onBack() {},
        });
        document.body.replaceChildren(screen);
    });
}

async function assertFirstVisit(page, viewport) {
    const screen = page.locator('[data-current-place="bookshop"]');
    await screen.waitFor();
    const background = screen.locator('.academy-background img');
    await background.evaluate(image => image.decode());
    assert.match(await background.evaluate(image => image.currentSrc), viewport.expectedPlate === 'mobile'
        ? /\/locations\/mobile\/bookshop__rain-evening-shelves--mobile\.webp$/u
        : /\/locations\/wide\/bookshop__rain-evening-shelves--wide\.webp$/u);

    const geometry = await screen.evaluate(element => {
        const box = selector => {
            const target = element.querySelector(selector);
            if (!(target instanceof HTMLElement)) return null;
            const rect = target.getBoundingClientRect();
            return {
                left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
                width: rect.width, height: rect.height,
            };
        };
        const overlap = (first, second) => Boolean(first && second
            && Math.min(first.right, second.right) - Math.max(first.left, second.left) > 2
            && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 2);
        const back = box('.academy-world-back');
        const reward = box('.academy-world-reward');
        const dialogue = box('.academy-world-arrival-dialogue');
        const sophie = element.querySelector('[data-world-character="sophie"] .academy-world-character-silhouette');
        const dialogueElement = element.querySelector('.academy-world-arrival-dialogue');
        const dialogueStyle = getComputedStyle(dialogueElement);
        const sophieStyle = getComputedStyle(sophie);
        return {
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            back,
            reward,
            dialogue,
            controlsOverlap: overlap(back, reward),
            dialogueBackground: dialogueStyle.backgroundColor,
            dialogueBackdrop: dialogueStyle.backdropFilter || dialogueStyle.webkitBackdropFilter,
            dialogueClip: dialogueStyle.clipPath,
            sophieBackground: sophieStyle.backgroundImage,
            sophieWidth: box('[data-world-character="sophie"]')?.width ?? 0,
        };
    });

    assert.ok(geometry.documentWidth <= geometry.viewport.width + 1, `${viewport.name} must not overflow horizontally`);
    assert.ok(geometry.back && geometry.reward && geometry.dialogue, `${viewport.name} Bookshop chrome must render`);
    assert.equal(geometry.controlsOverlap, false, `${viewport.name} Back and collectible must not overlap`);
    for (const [name, box] of [['Back', geometry.back], ['collectible', geometry.reward]]) {
        assert.ok(box.left >= -1 && box.top >= -1, `${viewport.name} ${name} starts inside the viewport`);
        assert.ok(box.right <= geometry.viewport.width + 1, `${viewport.name} ${name} ends inside the viewport`);
        assert.ok(box.width >= 44 && box.height >= 44, `${viewport.name} ${name} remains a 44px target`);
    }
    assert.match(geometry.dialogueBackground, /^rgba\(251, 244, 218, 0\.78\)$/u);
    assert.notEqual(geometry.dialogueBackdrop, 'none', `${viewport.name} dialogue keeps its living-paper blur`);
    assert.notEqual(geometry.dialogueClip, 'none', `${viewport.name} dialogue keeps its paper edge`);
    assert.match(geometry.sophieBackground, /sophie__bookshop-neutral__halfbody__v003\.png/u);
    assert.ok(geometry.sophieWidth >= 150, `${viewport.name} Sophie remains visibly staged`);
    return geometry;
}
