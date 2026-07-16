import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5185';
const outputDir = path.resolve(process.env.PLACEMENT_QA_DIR ?? 'qa-artifacts/placement-responsive');
const viewports = [
    { name: 'desktop', width: 1440, height: 900, reducedMotion: 'no-preference' },
    { name: 'phone-390', width: 390, height: 844, reducedMotion: 'no-preference' },
    { name: 'phone-320', width: 320, height: 720, reducedMotion: 'no-preference' },
    { name: 'phone-320-reduced', width: 320, height: 720, reducedMotion: 'reduce' },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

try {
    for (const viewport of viewports) {
        const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            reducedMotion: viewport.reducedMotion,
            locale: 'en-GB',
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
            if (message.type() === 'error') errors.push(message.text());
        });
        await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(async () => {
            document.body.replaceChildren();
            await import('/src/academy/entrypoint.ts');
            const { createAcademyShell } = await import('/src/academy/ui/shell.ts');
            const { renderPlacementMockScreen } = await import('/src/academy/ui/placement-screen.ts');
            window.__placementBackCount = 0;
            const host = document.createElement('div');
            host.id = 'yomu-academy';
            document.body.append(host);
            const shell = createAcademyShell(host, {
                language: 'en',
                onLanguage() {},
                onMute() {},
                onNavigate() {},
                onPresentationMode() {},
            });
            const screen = renderPlacementMockScreen({
                language: 'en',
                pronunciation: { play: async () => ({ dispose() {} }) },
                onResult() {},
                onBack: () => { window.__placementBackCount += 1; },
            });
            shell.replace(screen);
        });

        const screen = page.locator('.academy-placement-screen');
        const select = screen.locator('.academy-target-band select');
        await select.selectOption('n1');
        await screen.locator('.academy-placement-actions .academy-button-primary:not([type="submit"])').click();

        const stepResults = [];
        for (let step = 1; step <= 7; step += 1) {
            const activeStep = screen.locator('.academy-mock-item:not([hidden]), .academy-placement-confidence:not([hidden])');
            await activeStep.waitFor({ state: 'visible' });
            const stepStart = await page.evaluate(() => {
                const prompt = document.querySelector('.academy-mock-item:not([hidden]) .academy-mock-prompt');
                const actions = document.querySelector('.academy-placement-actions');
                const promptBox = prompt instanceof HTMLElement ? prompt.getBoundingClientRect() : null;
                const actionsBox = actions instanceof HTMLElement ? actions.getBoundingClientRect() : null;
                const scrollHost = document.querySelector('.academy-screen-host');
                return {
                    prompt: promptBox ? { top: promptBox.top, bottom: promptBox.bottom } : null,
                    actionsBottom: actionsBox?.bottom ?? null,
                    scrollTop: scrollHost instanceof HTMLElement ? scrollHost.scrollTop : null,
                };
            });
            if (stepStart.prompt) {
                assert.ok(stepStart.prompt.top >= -1, `${viewport.name}/step-${step}: prompt above viewport after navigation`);
                assert.ok(stepStart.prompt.bottom <= viewport.height + 1, `${viewport.name}/step-${step}: prompt below viewport after navigation`);
            }
            if (step === 1 || step === 3) {
                await page.screenshot({ path: path.join(outputDir, `${viewport.name}-step-${step}-prompt.png`) });
            }
            const actions = screen.locator('.academy-placement-actions');
            await actions.scrollIntoViewIfNeeded();
            const geometry = await page.evaluate(() => {
                const rect = selector => {
                    const element = document.querySelector(selector);
                    if (!(element instanceof HTMLElement)) return null;
                    const box = element.getBoundingClientRect();
                    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
                };
                const buttons = [...document.querySelectorAll('.academy-placement-actions button:not([hidden])')]
                    .map(element => {
                        const box = element.getBoundingClientRect();
                        return { text: element.textContent?.trim(), left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
                    });
                const paper = rect('.academy-mock-item:not([hidden])');
                const prompt = rect('.academy-mock-item:not([hidden]) .academy-mock-prompt');
                const root = document.querySelector('.academy-placement-screen');
                const scrollHost = document.querySelector('.academy-screen-host');
                return {
                    viewport: { width: innerWidth, height: innerHeight },
                    document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
                    root: root instanceof HTMLElement ? {
                        clientHeight: root.clientHeight,
                        scrollHeight: root.scrollHeight,
                        scrollTop: root.scrollTop,
                        overflowY: getComputedStyle(root).overflowY,
                    } : null,
                    scrollHost: scrollHost instanceof HTMLElement ? {
                        clientHeight: scrollHost.clientHeight,
                        scrollHeight: scrollHost.scrollHeight,
                        scrollTop: scrollHost.scrollTop,
                    } : null,
                    paper,
                    prompt,
                    buttons,
                };
            });
            assert.ok(geometry.document.width <= viewport.width + 1, `${viewport.name}/step-${step}: horizontal overflow`);
            assert.ok(geometry.buttons.every(button => button.left >= 0 && button.right <= viewport.width + 1), `${viewport.name}/step-${step}: action clipped horizontally`);
            assert.ok(geometry.buttons.every(button => button.width >= 44 && button.height >= 44), `${viewport.name}/step-${step}: action below 44px`);
            assert.ok(geometry.buttons.every(button => button.top >= -1 && button.bottom <= viewport.height + 1), `${viewport.name}/step-${step}: action not reachable after scroll`);
            assert.ok(geometry.scrollHost && geometry.scrollHost.scrollHeight >= geometry.scrollHost.clientHeight, `${viewport.name}/step-${step}: missing shell scroll owner`);
            assert.equal(geometry.root?.overflowY, viewport.width <= 760 ? 'visible' : 'hidden', `${viewport.name}/step-${step}: placement screen owns mobile scrolling`);
            assert.equal(geometry.root?.scrollTop, 0, `${viewport.name}/step-${step}: placement screen scrolled instead of shell`);
            if (stepStart.actionsBottom !== null && stepStart.actionsBottom > viewport.height + 1) {
                assert.ok((geometry.scrollHost?.scrollTop ?? 0) > (stepStart.scrollTop ?? 0), `${viewport.name}/step-${step}: shell did not reveal actions`);
            }
            if (geometry.paper && geometry.prompt) {
                assert.ok(geometry.prompt.top >= geometry.paper.top + 8, `${viewport.name}/step-${step}: prompt straddles paper edge`);
                assert.ok(geometry.prompt.bottom <= geometry.paper.bottom - 8, `${viewport.name}/step-${step}: prompt escapes paper`);
            }
            stepResults.push(geometry);
            if (step === 1 || step === 3) {
                await page.screenshot({ path: path.join(outputDir, `${viewport.name}-step-${step}-actions.png`) });
            }

            if (step === 1) {
                const answers = activeStep.locator('input[type="radio"]');
                await answers.nth(1).check();
                await screen.locator('.academy-placement-actions .academy-button-primary:not([type="submit"])').click();
                await screen.locator('.academy-placement-actions .academy-lesson-overview-back').click();
                assert.equal(await answers.nth(1).isChecked(), true, `${viewport.name}: answer not preserved`);
                assert.equal(await answers.nth(1).evaluate(element => document.activeElement === element), true, `${viewport.name}: saved answer focus not restored`);
            }
            if (step <= 6) {
                const radio = activeStep.locator('input[type="radio"]');
                if (await radio.count() > 0 && !(await radio.first().isChecked()) && !(await radio.nth(1).isChecked())) await radio.first().check();
                await screen.locator('.academy-placement-actions .academy-button-primary:not([type="submit"])').click();
            }
        }

        await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: true });
        const axe = await new AxeBuilder({ page }).include('.academy-placement-screen').analyze();
        const serious = axe.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
        assert.equal(serious.length, 0, `${viewport.name}: serious Axe violations`);
        if (viewport.reducedMotion === 'reduce') {
            const transitions = await screen.locator('.academy-button, .academy-lesson-overview-back').evaluateAll(elements => elements.map(element => getComputedStyle(element).transitionDuration));
            assert.ok(transitions.every(duration => duration === '0s'), `${viewport.name}: reduced-motion transition remains`);
        }

        for (let step = 7; step >= 0; step -= 1) {
            await screen.locator('.academy-placement-actions .academy-lesson-overview-back').click();
        }
        assert.equal(await page.evaluate(() => window.__placementBackCount), 1, `${viewport.name}: route Back history callback changed`);
        assert.deepEqual(errors, [], `${viewport.name}: browser errors`);
        results.push({ viewport: viewport.name, steps: stepResults.length, axeViolations: axe.violations.length });
        await context.close();
    }
} finally {
    await browser.close();
}

await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
