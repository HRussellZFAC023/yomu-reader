#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { build } from 'vite';
import {
    assert,
    launchSmokeBrowser,
    serveFile,
    startLoopbackServer,
} from './lib/smoke-harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const HOSTED_ROOT = path.join(ROOT, 'docs', 'public');
const BUILD_ROOT = path.join(ROOT, 'qa-artifacts', 'current-place-world-geometry', 'build');
const SCREENSHOT_ROOT = path.join(ROOT, 'qa-artifacts', 'current-place-world-geometry', 'screenshots');
const CONFIG = path.join(ROOT, 'config', 'vite', 'academy.config.ts');
const PLACES = ['courtyard', 'classroom', 'library', 'cafe', 'lab', 'street', 'station', 'konbini', 'ramen', 'japan-centre', 'home', 'park', 'station-platform']
    .filter(place => !process.env.ACADEMY_QA_PLACE || process.env.ACADEMY_QA_PLACE === place);
const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'phone', width: 390, height: 844 },
    { name: 'phone-320', width: 320, height: 800 },
].filter(viewport => !process.env.ACADEMY_QA_VIEWPORT || process.env.ACADEMY_QA_VIEWPORT === viewport.name);

rmSync(BUILD_ROOT, { recursive: true, force: true });
rmSync(SCREENSHOT_ROOT, { recursive: true, force: true });
mkdirSync(SCREENSHOT_ROOT, { recursive: true });
await build({ configFile: CONFIG, build: { outDir: BUILD_ROOT, emptyOutDir: true } });

const server = await startLoopbackServer(serveAcademy, 'Current-place world geometry server could not bind');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const results = [];
const lessonResults = [];
const courseResults = [];

try {
    for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            locale: 'en-GB',
            reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        await page.route('https://edge.yomureader.com/**', route => route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: '<main></main>',
        }));
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
            if (message.type() === 'error') errors.push(message.text());
        });
        page.on('response', response => {
            if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
        });
        await page.addInitScript(() => {
            localStorage.setItem('yomu:academy:audio:v1', JSON.stringify({
                muted: true,
                volumes: { music: 0.7, ambience: 0.65, lesson: 1, sfx: 0.8 },
            }));
        });

        for (const [placeIndex, place] of PLACES.entries()) {
            const run = `world-geometry-${viewport.name}-${placeIndex}`;
            await seedWorld(page, run, place);
            const selector = `[data-current-place="${place}"]`;
            await page.waitForSelector(selector, { state: 'visible', timeout: 20_000 });
            await page.waitForTimeout(760);
            const geometry = await page.locator(selector).evaluate(collectGeometry, place);
            assert(geometry.documentWidth <= geometry.viewport.width + 2, `${viewport.name}/${place}: document overflowed horizontally`, geometry);
            assert(geometry.screen.width <= geometry.viewport.width + 2, `${viewport.name}/${place}: scene exceeds viewport width`, geometry);
            assert(geometry.screen.height <= geometry.viewport.height + 2, `${viewport.name}/${place}: scene exceeds viewport height`, geometry);
            assert(geometry.controls.every(control => control.inside), `${viewport.name}/${place}: a primary control is clipped`, geometry);
            assert(geometry.exitContents.every(exit => exit.fits), `${viewport.name}/${place}: route text is cropped`, geometry);
            assert(geometry.routePurposes.every(purpose => purpose.visible), `${viewport.name}/${place}: route purpose is hidden`, geometry);
            assert(geometry.routePurposes.every(purpose => purpose.fits), `${viewport.name}/${place}: route purpose is clipped`, geometry);
            assert(geometry.routePurposes.every(purpose => purpose.lines <= 2), `${viewport.name}/${place}: route purpose exceeds two lines`, geometry);
            assert(geometry.characterLabels.every(label => label.inside), `${viewport.name}/${place}: a character label is clipped`, geometry);
            assert(geometry.speakerStaging.active.length === 1, `${viewport.name}/${place}: active speaker is missing or duplicated`, geometry.speakerStaging);
            assert(geometry.speakerStaging.active.every(person => person.opacity === 1 && person.visualOpacity === 1), `${viewport.name}/${place}: active speaker is translucent`, geometry.speakerStaging);
            assert(geometry.speakerStaging.listeners.every(person => person.visualOpacity < 1), `${viewport.name}/${place}: an inactive listener competes with the speaker`, geometry.speakerStaging);
            assert(geometry.speakerStaging.listeners.every(person => person.zIndex < geometry.speakerStaging.active[0].zIndex), `${viewport.name}/${place}: an inactive listener sits above the speaker`, geometry.speakerStaging);
            if (viewport.width > 760) {
                assert(geometry.speakerStaging.paperAlpha === 1, `${viewport.name}/${place}: speaker paper remains translucent`, geometry.speakerStaging);
                assert(geometry.speakerStaging.paperBackdrop === 'none', `${viewport.name}/${place}: speaker paper still blurs a ghost layer`, geometry.speakerStaging);
            }
            assert(geometry.avoidance.every(pair => !pair.overlaps), `${viewport.name}/${place}: primary surfaces overlap`, geometry);
            assert(geometry.artCoverage >= 0.5, `${viewport.name}/${place}: scene art does not fill the viewport`, geometry);
            assert(geometry.utility.open === false, `${viewport.name}/${place}: utility menu starts open`, geometry.utility);
            assert(geometry.utility.actionsDisplay === 'none', `${viewport.name}/${place}: closed utility actions duplicate scene controls`, geometry.utility);

            if (place === 'courtyard') {
                const theme = await academyThemeParity(page, selector);
                assert(JSON.stringify(theme.dark) === JSON.stringify(theme.light), `${viewport.name}: Reader theme classes recolour Academy`, theme);
                const screenshot = path.join(SCREENSHOT_ROOT, `${viewport.name}-courtyard-first-visit.png`);
                await page.screenshot({ path: screenshot, fullPage: false });
                geometry.screenshot = path.relative(ROOT, screenshot);
            }

            if (place === 'cafe') {
                const screenshot = path.join(SCREENSHOT_ROOT, `${viewport.name}-cafe-speaker-staging.png`);
                await page.screenshot({ path: screenshot, fullPage: false });
                geometry.screenshot = path.relative(ROOT, screenshot);
            }

            if (place === 'konbini') {
                const arrival = page.locator(`${selector} .academy-world-arrival-continue`);
                if (await arrival.isVisible()) await arrival.click();
                await page.waitForSelector(`${selector} [data-konbini-transaction]`, { state: 'visible', timeout: 20_000 });
                const registerGeometry = await page.locator(selector).evaluate(collectGeometry, place);
                assert(registerGeometry.controls.every(control => control.inside), `${viewport.name}/${place}: register controls are clipped`, registerGeometry);
                assert(registerGeometry.avoidance.every(pair => !pair.overlaps), `${viewport.name}/${place}: register surfaces overlap`, registerGeometry);
                const axe = await new AxeBuilder({ page }).include(selector).analyze();
                assert(axe.violations.length === 0, `${viewport.name}/${place}: axe violations`, axe.violations);
                await page.locator(`${selector} .academy-konbini-primary-action`).click();
                await page.locator(`${selector} .academy-konbini-counter-button`).last().click();
                const screenshot = path.join(SCREENSHOT_ROOT, `${viewport.name}-konbini-register.png`);
                await page.screenshot({ path: screenshot, fullPage: false });
                geometry.register = registerGeometry;
                geometry.screenshot = path.relative(ROOT, screenshot);
            }

            if (place === 'ramen') {
                const arrival = page.locator(`${selector} .academy-world-arrival-continue`);
                if (await arrival.isVisible()) await arrival.click();
                await page.waitForSelector(`${selector} [data-ramen-practice="tally-source-order"]`, { state: 'visible', timeout: 20_000 });
                const orderGeometry = await page.locator(selector).evaluate(collectGeometry, place);
                assert(orderGeometry.controls.every(control => control.inside), `${viewport.name}/${place}: order controls are clipped`, orderGeometry);
                assert(orderGeometry.avoidance.every(pair => !pair.overlaps), `${viewport.name}/${place}: order surfaces overlap`, orderGeometry);
                const axe = await new AxeBuilder({ page }).include(selector).analyze();
                assert(axe.violations.length === 0, `${viewport.name}/${place}: axe violations`, axe.violations);
                assert(await page.locator(`${selector} [data-world-character="shin"] img`).count() === 0, `${viewport.name}/${place}: Shin used an unapproved portrait`);
                assert(await page.locator(`${selector} [data-world-character="peter"]`).count() === 0, `${viewport.name}/${place}: Peter appeared without a ramen story job`);
                await page.locator(`${selector} [data-ramen-order-row="curry-rice"] [data-choice-id="two"]`).click();
                await page.locator(`${selector} [data-ramen-order-row="sandwich"] [data-choice-id="one"]`).click();
                await page.locator(`${selector} [data-ramen-order-row="juice"] [data-choice-id="two"]`).click();
                await page.locator(`${selector} .academy-world-action-dock`).evaluate(element => { element.scrollTop = 0; });
                const screenshot = path.join(SCREENSHOT_ROOT, `${viewport.name}-ramen-order-ticket.png`);
                await page.screenshot({ path: screenshot, fullPage: false });
                geometry.ramen = orderGeometry;
                geometry.screenshot = path.relative(ROOT, screenshot);
            }

            if (place === 'station-platform') {
                const arrival = page.locator(`${selector} .academy-world-arrival-continue`);
                if (await arrival.isVisible()) await arrival.click();
                await page.waitForSelector(`${selector} .academy-tube-route-board:not([hidden])`, { state: 'visible', timeout: 20_000 });
                assert(await page.locator(`${selector} [data-tube-primary-action]`).count() === 1, `${viewport.name}/${place}: Tube must expose one auditory route action`);
                assert(await page.locator(`${selector} [data-world-character="aakash"] img`).count() === 0, `${viewport.name}/${place}: Aakash used an unapproved likeness`);
                assert(await page.locator(`${selector} .academy-tube-route-board`).getAttribute('data-tube-music-theme') === 'challenge.major', `${viewport.name}/${place}: authorized Tube score is missing`);
                assert(await page.locator(`${selector} .academy-tube-route-board`).getAttribute('data-tube-signal-cue') === 'radio.tune', `${viewport.name}/${place}: authorized Tube signal is missing`);

                await page.locator(`${selector} [data-tube-primary-action]`).click();
                await page.waitForSelector(`${selector} .academy-tube-route-options:not([hidden])`, { state: 'visible', timeout: 20_000 });
                const routeGeometry = await page.locator(selector).evaluate(collectGeometry, place);
                assert(routeGeometry.controls.every(control => control.inside), `${viewport.name}/${place}: expanded Tube controls are clipped`, routeGeometry);
                assert(routeGeometry.avoidance.every(pair => !pair.overlaps), `${viewport.name}/${place}: expanded Tube surfaces overlap`, routeGeometry);
                assert(await page.locator(`${selector} [data-tube-primary-action]`).count() === 1, `${viewport.name}/${place}: replay duplicated the auditory route action`);
                assert(await page.locator(`${selector} .academy-tube-route-option`).count() === 3, `${viewport.name}/${place}: Tube route options are missing`);

                const tapTargets = await page.locator(`${selector} button:not([hidden])`).evaluateAll(elements => elements
                    .filter(element => {
                        const rect = element.getBoundingClientRect();
                        return getComputedStyle(element).display !== 'none' && rect.width > 0 && rect.height > 0;
                    })
                    .map(element => {
                        const rect = element.getBoundingClientRect();
                        return { label: element.getAttribute('aria-label') ?? element.textContent?.trim(), width: rect.width, height: rect.height };
                    }));
                assert(tapTargets.every(target => target.width >= 44 && target.height >= 44), `${viewport.name}/${place}: a Tube control is smaller than 44px`, tapTargets);

                const motion = await page.locator(selector).evaluate(screen => [
                    '.academy-background img', '.academy-world-character', '.academy-tube-route-board', '.academy-tube-route-option',
                ].map(css => {
                    const style = getComputedStyle(screen.querySelector(css));
                    return { css, animationName: style.animationName, transitionDuration: style.transitionDuration };
                }));
                assert(motion.every(item => item.animationName === 'none' && item.transitionDuration === '0s'), `${viewport.name}/${place}: reduced motion is incomplete`, motion);

                const axe = await new AxeBuilder({ page }).include(selector).analyze();
                const serious = axe.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical');
                assert(serious.length === 0, `${viewport.name}/${place}: serious accessibility violations`, serious);
                const screenshot = path.join(SCREENSHOT_ROOT, `${viewport.name}-tube-platform-route.png`);
                await page.screenshot({ path: screenshot, fullPage: false });
                assert(existsSync(screenshot) && statSync(screenshot).size > 20_000, `${viewport.name}/${place}: Tube screenshot was not captured`, screenshot);
                geometry.tube = { routeGeometry, axeViolations: axe.violations.length, motion };
                geometry.screenshot = path.relative(ROOT, screenshot);
            }

            const exits = page.locator(`${selector} .academy-world-exit:not(:disabled)`);
            assert(await exits.count() > 0, `${viewport.name}/${place}: no usable exits`);
            for (let index = 0; index < await exits.count(); index += 1) {
                const exit = exits.nth(index);
                await exit.focus();
                await exit.evaluate(element => element.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
                await page.waitForTimeout(20);
                const visible = await exit.evaluate(element => {
                    const rect = element.getBoundingClientRect();
                    const rail = element.closest('.academy-world-spatial-exits');
                    return {
                        visible: rect.left >= -2 && rect.right <= innerWidth + 2 && rect.top >= -2 && rect.bottom <= innerHeight + 2,
                        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
                        rail: rail ? { clientWidth: rail.clientWidth, scrollWidth: rail.scrollWidth, scrollLeft: rail.scrollLeft, overflowX: getComputedStyle(rail).overflowX } : null,
                    };
                });
                assert(visible.visible, `${viewport.name}/${place}: focused exit is clipped`, { index, ...visible });
            }
            if (place === 'konbini' || place === 'ramen') {
                await page.locator(`${selector} [data-exit-to="return"]`).click();
                await page.waitForSelector('[data-current-place="street"]', { state: 'visible', timeout: 20_000 });
                geometry.backReturn = 'street';
            }
            results.push({ viewport: viewport.name, place, geometry });
        }
        courseResults.push(await verifyCourseEvents(page, viewport));
        if (!process.env.ACADEMY_QA_PLACE && process.env.ACADEMY_QA_SKIP_LESSON !== '1') {
            lessonResults.push(await verifyLessonChrome(page, viewport));
        }
        assert(errors.length === 0, `${viewport.name}: browser runtime errors`, { errors });
        await context.close();
    }
} finally {
    await browser.close().catch(() => undefined);
    await server.close();
}

const report = {
    check: 'current-place-world-geometry',
    cases: results.map(({ viewport, place, geometry }) => ({
        viewport,
        place,
        ...(geometry.screenshot ? { screenshot: geometry.screenshot } : {}),
        ...(geometry.backReturn ? { backReturn: geometry.backReturn } : {}),
        speakerStaging: {
            active: geometry.speakerStaging.active.map(person => person.id),
            listeners: geometry.speakerStaging.listeners.map(person => person.id),
            paperAlpha: geometry.speakerStaging.paperAlpha,
            paperBackdrop: geometry.speakerStaging.paperBackdrop,
        },
        ...(geometry.tube ? {
            tube: {
                axeViolations: geometry.tube.axeViolations,
                reducedMotionChecks: geometry.tube.motion.length,
            },
        } : {}),
    })),
    courses: courseResults,
    lessons: lessonResults,
};
writeFileSync(
    path.join(ROOT, 'qa-artifacts', 'current-place-world-geometry', 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));

function collectGeometry(screen, place) {
    const box = element => {
        if (!(element instanceof HTMLElement) || element.hidden || getComputedStyle(element).display === 'none') return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const inside = rect => Boolean(rect
        && rect.left >= -2
        && rect.top >= -2
        && rect.right <= innerWidth + 2
        && rect.bottom <= innerHeight + 2);
    const image = screen.querySelector('.academy-background img');
    const art = box(image);
    const controls = [
        ['hud', screen.querySelector('.academy-world-hud')],
        ['back', screen.querySelector('.academy-world-back')],
        ['reward', screen.querySelector('.academy-world-reward')],
        ['action', screen.querySelector('.academy-world-action-dock:not([hidden]), .academy-world-arrival-dialogue:not([hidden])')],
        ['exits', screen.querySelector('.academy-world-spatial-exits')],
    ].map(([name, element]) => {
        const rect = box(element);
        const style = element instanceof HTMLElement ? getComputedStyle(element) : null;
        return { name, rect, inside: !rect || inside(rect), right: style?.right ?? null };
    });
    const control = name => controls.find(candidate => candidate.name === name)?.rect;
    const exits = [...screen.querySelectorAll('.academy-world-exit:not(:disabled)')].map(box).filter(Boolean);
    const exitContents = [...screen.querySelectorAll('.academy-world-exit:not(:disabled)')].map(element => ({
        fits: element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
    }));
    const routePurposes = [...screen.querySelectorAll('.academy-world-exit:not(:disabled) .academy-primary-purpose')].map(element => {
        const style = getComputedStyle(element);
        const lineHeight = Number.parseFloat(style.lineHeight);
        return {
            text: element.textContent?.trim(),
            visible: style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().height > 0,
            fits: element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1,
            lines: Number.isFinite(lineHeight) && lineHeight > 0 ? Math.round(element.getBoundingClientRect().height / lineHeight) : 0,
        };
    });
    const overlap = (first, second) => Boolean(first && second
        && Math.min(first.right, second.right) - Math.max(first.left, second.left) > 4
        && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 4);
    const screenRect = box(screen);
    const characterLabels = [...screen.querySelectorAll('.academy-world-character-presence, .academy-world-character-name')]
        .map(element => ({ className: element.className, rect: box(element) }))
        .filter(label => label.rect)
        .map(label => ({ ...label, inside: inside(label.rect) }));
    const characterStage = element => {
        const style = getComputedStyle(element);
        const visual = element.querySelector(':scope > .academy-world-sprite, :scope > .academy-world-character-silhouette');
        return {
            id: element.dataset.worldCharacter,
            opacity: Number.parseFloat(style.opacity),
            visualOpacity: visual instanceof HTMLElement ? Number.parseFloat(getComputedStyle(visual).opacity) : 1,
            zIndex: Number.parseInt(style.zIndex, 10) || 0,
        };
    };
    const activePeople = [...screen.querySelectorAll(".academy-world-character[data-purpose-person='true']")].map(characterStage);
    const listenerPeople = [...screen.querySelectorAll(".academy-world-character:not([data-purpose-person='true'])")].map(characterStage);
    const speakerPaper = screen.querySelector('.academy-world-action-dock:not([hidden]), .academy-world-arrival-dialogue:not([hidden])');
    const paperStyle = speakerPaper instanceof HTMLElement ? getComputedStyle(speakerPaper) : null;
    const paperColour = paperStyle?.backgroundColor ?? '';
    const alphaMatch = paperColour.match(/rgba?\([^/]+(?:\/|,)\s*([\d.]+)\s*\)$/);
    return {
        place,
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        screen: screenRect,
        controls,
        exits,
        exitContents,
        routePurposes,
        characterLabels,
        speakerStaging: {
            active: activePeople,
            listeners: listenerPeople,
            paperColour,
            paperAlpha: paperColour.startsWith('rgb(') ? 1 : Number.parseFloat(alphaMatch?.[1] ?? '0'),
            paperBackdrop: paperStyle?.backdropFilter ?? 'none',
        },
        utility: {
            open: document.querySelector('.academy-utility')?.hasAttribute('open') ?? false,
            actionsDisplay: getComputedStyle(document.querySelector('.academy-header-actions')).display,
        },
        avoidance: [
            { names: ['hud', 'reward'], overlaps: overlap(control('hud'), control('reward')) },
            { names: ['hud', 'action'], overlaps: overlap(control('hud'), control('action')) },
            { names: ['reward', 'action'], overlaps: overlap(control('reward'), control('action')) },
            { names: ['action', 'exits'], overlaps: exits.some(exit => overlap(control('action'), exit)) },
            { names: ['character-labels', 'action'], overlaps: characterLabels.some(label => overlap(label.rect, control('action'))) },
            {
                names: ['character-labels', 'route-rail'],
                overlaps: innerWidth <= 760 && characterLabels.some(label => overlap(label.rect, control('exits'))),
            },
        ],
        artCoverage: art && screenRect ? (Math.min(art.width, screenRect.width) * Math.min(art.height, screenRect.height)) / (screenRect.width * screenRect.height) : 0,
    };
}

async function academyThemeParity(page, selector) {
    return page.evaluate(worldSelector => {
        const snapshot = () => {
            const root = document.querySelector('.academy-root');
            const dialogue = document.querySelector(`${worldSelector} .academy-world-arrival-dialogue:not([hidden]), ${worldSelector} .academy-world-action-dock:not([hidden])`);
            const rootStyle = getComputedStyle(root);
            const dialogueStyle = getComputedStyle(dialogue);
            return {
                rootScheme: rootStyle.colorScheme,
                readerBackground: rootStyle.getPropertyValue('--jpdb-reader-bg').trim(),
                readerText: rootStyle.getPropertyValue('--jpdb-reader-text').trim(),
                readerAccentText: rootStyle.getPropertyValue('--jpdb-reader-accent-text').trim(),
                dialogueColor: dialogueStyle.color,
                dialogueBackground: dialogueStyle.backgroundColor,
            };
        };
        document.documentElement.classList.remove('jpdb-reader-theme-light', 'yomu-page-theme-light');
        document.documentElement.classList.add('jpdb-reader-theme-dark', 'yomu-page-theme-dark');
        const dark = snapshot();
        document.documentElement.classList.remove('jpdb-reader-theme-dark', 'yomu-page-theme-dark');
        document.documentElement.classList.add('jpdb-reader-theme-light', 'yomu-page-theme-light');
        const light = snapshot();
        return { dark, light };
    }, selector);
}

async function verifyLessonChrome(page, viewport) {
    const run = `lesson-chrome-${viewport.name}`;
    await seedLesson(page, run);
    await page.waitForSelector('.academy-vocabulary-sheet', { state: 'visible', timeout: 20_000 });
    const start = page.locator('.academy-vocabulary-sheet-layer .academy-vocabulary-sheet-start');
    await start.click();
    const selector = '[data-academy-screen="authored-week"]';
    await page.waitForSelector(selector, { state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(80);

    const geometry = await page.locator(selector).evaluate(screen => {
        const box = element => {
            if (!(element instanceof HTMLElement) || element.hidden || getComputedStyle(element).display === 'none') return null;
            const rect = element.getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const controls = [...screen.querySelectorAll('button:not([hidden]), input:not([hidden]), select:not([hidden]), textarea:not([hidden])')]
            .filter(element => getComputedStyle(element).display !== 'none')
            .map(element => ({
                selector: element.className,
                label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '',
                rect: box(element),
            }));
        const visible = element => {
            const rect = box(element);
            return Boolean(rect && rect.width > 0 && rect.height > 0);
        };
        const panel = box(screen.querySelector('.academy-authored-week-panel'));
        return {
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            screenWidth: screen.getBoundingClientRect().width,
            panel,
            controls,
            backControls: [...screen.querySelectorAll('.academy-authored-week-back, .academy-lesson-activity-back')].filter(visible).length,
            continueControls: [...screen.querySelectorAll('.academy-authored-week-next, .academy-lesson-activity-continue')].filter(visible).length,
            utilityOpen: document.querySelector('.academy-utility')?.hasAttribute('open') ?? false,
            utilityActionsDisplay: getComputedStyle(document.querySelector('.academy-header-actions')).display,
        };
    });
    assert(geometry.documentWidth <= geometry.viewport.width + 2, `${viewport.name}/lesson: document overflowed horizontally`, geometry);
    assert(geometry.screenWidth <= geometry.viewport.width + 2, `${viewport.name}/lesson: screen exceeds viewport width`, geometry);
    assert(geometry.panel && geometry.panel.left >= -2 && geometry.panel.right <= geometry.viewport.width + 2, `${viewport.name}/lesson: paper panel is clipped`, geometry);
    assert(geometry.backControls === 1, `${viewport.name}/lesson: duplicate or missing Back controls`, geometry);
    assert(geometry.continueControls <= 1, `${viewport.name}/lesson: duplicate Continue controls`, geometry);
    assert(!geometry.utilityOpen && geometry.utilityActionsDisplay === 'none', `${viewport.name}/lesson: closed utility actions duplicate lesson chrome`, geometry);

    const controls = page.locator(`${selector} button:not([hidden]), ${selector} input:not([hidden]), ${selector} select:not([hidden]), ${selector} textarea:not([hidden])`);
    for (let index = 0; index < await controls.count(); index += 1) {
        const control = controls.nth(index);
        if (!await control.isVisible()) continue;
        await control.focus();
        await control.evaluate(element => element.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
        await page.waitForTimeout(20);
        const bounds = await control.boundingBox();
        assert(bounds
            && bounds.x >= -2
            && bounds.y >= -2
            && bounds.x + bounds.width <= viewport.width + 2
            && bounds.y + bounds.height <= viewport.height + 2, `${viewport.name}/lesson: focused control is clipped`, { index, bounds });
    }

    const theme = await lessonThemeParity(page, selector);
    assert(JSON.stringify(theme.dark) === JSON.stringify(theme.light), `${viewport.name}/lesson: Reader theme classes recolour lesson paper`, theme);
    const axe = await new AxeBuilder({ page }).include(selector).withRules(['color-contrast']).analyze();
    assert(axe.violations.length === 0, `${viewport.name}/lesson: color contrast violations`, axe.violations);

    await page.locator(`${selector} .academy-authored-week-back`).focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(40);
    const screenshot = path.join(SCREENSHOT_ROOT, `${viewport.name}-lesson-l1-l01.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    await page.locator(`${selector} .academy-authored-week-back`).click();
    await page.waitForSelector('[data-current-place="station"]', { state: 'visible', timeout: 20_000 });
    return {
        viewport: viewport.name,
        lesson: 'l1-l01',
        returnPlace: 'station',
        screenshot: path.relative(ROOT, screenshot),
    };
}

async function verifyCourseEvents(page, viewport) {
    const run = `course-events-${viewport.name}`;
    await seedCourse(page, run);
    await page.waitForSelector('[data-academy-screen="class-path"]', { state: 'visible', timeout: 20_000 });
    await page.locator('[data-class-section="events"]').click();
    const selector = '#academy-class-path-events';
    await page.waitForSelector(selector, { state: 'visible', timeout: 20_000 });
    const geometry = await page.locator(selector).evaluate(surface => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        cards: [...surface.querySelectorAll('.academy-class-event')].map(card => ({
            text: card.textContent?.replace(/\s+/g, ' ').trim(),
            fits: card.scrollHeight <= card.clientHeight + 1 && card.scrollWidth <= card.clientWidth + 1,
            title: (() => {
                const title = card.querySelector('.academy-primary-purpose');
                if (!(title instanceof HTMLElement)) return { present: false };
                const style = getComputedStyle(title);
                const lineHeight = Number.parseFloat(style.lineHeight);
                return {
                    present: true,
                    visible: style.display !== 'none' && style.visibility !== 'hidden' && title.getBoundingClientRect().height > 0,
                    fits: title.scrollHeight <= title.clientHeight + 1 && title.scrollWidth <= title.clientWidth + 1,
                    lines: Number.isFinite(lineHeight) && lineHeight > 0 ? Math.round(title.getBoundingClientRect().height / lineHeight) : 0,
                    textOverflow: style.textOverflow,
                    whiteSpace: style.whiteSpace,
                };
            })(),
        })),
    }));
    assert(geometry.documentWidth <= geometry.viewportWidth + 2, `${viewport.name}/course-events: document overflowed horizontally`, geometry);
    assert(geometry.cards.length > 0, `${viewport.name}/course-events: no event cards`, geometry);
    assert(geometry.cards.every(card => card.fits), `${viewport.name}/course-events: event card clipped`, geometry);
    assert(geometry.cards.every(card => card.title.present && card.title.visible && card.title.fits), `${viewport.name}/course-events: event title clipped`, geometry);
    assert(geometry.cards.every(card => card.title.lines <= 2), `${viewport.name}/course-events: event title exceeds two lines`, geometry);
    assert(geometry.cards.every(card => card.title.textOverflow === 'clip' && card.title.whiteSpace === 'normal'), `${viewport.name}/course-events: truncation styles returned`, geometry);
    const axe = await new AxeBuilder({ page }).include(selector).analyze();
    const serious = axe.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical');
    assert(serious.length === 0, `${viewport.name}/course-events: serious accessibility violations`, serious);
    const screenshot = path.join(SCREENSHOT_ROOT, `${viewport.name}-course-events.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    return { viewport: viewport.name, cards: geometry.cards.length, screenshot: path.relative(ROOT, screenshot) };
}

async function lessonThemeParity(page, selector) {
    return page.evaluate(lessonSelector => {
        const snapshot = () => {
            const rootStyle = getComputedStyle(document.querySelector('.academy-root'));
            const panelStyle = getComputedStyle(document.querySelector(`${lessonSelector} .academy-authored-week-panel`));
            const backStyle = getComputedStyle(document.querySelector(`${lessonSelector} .academy-authored-week-back`));
            return {
                rootScheme: rootStyle.colorScheme,
                readerBackground: rootStyle.getPropertyValue('--jpdb-reader-bg').trim(),
                readerText: rootStyle.getPropertyValue('--jpdb-reader-text').trim(),
                readerAccentText: rootStyle.getPropertyValue('--jpdb-reader-accent-text').trim(),
                panelColor: panelStyle.color,
                panelBackground: panelStyle.backgroundColor,
                backColor: backStyle.color,
                backBackground: backStyle.backgroundColor,
            };
        };
        document.documentElement.classList.remove('jpdb-reader-theme-light', 'yomu-page-theme-light');
        document.documentElement.classList.add('jpdb-reader-theme-dark', 'yomu-page-theme-dark');
        const dark = snapshot();
        document.documentElement.classList.remove('jpdb-reader-theme-dark', 'yomu-page-theme-dark');
        document.documentElement.classList.add('jpdb-reader-theme-light', 'yomu-page-theme-light');
        const light = snapshot();
        return { dark, light };
    }, selector);
}

async function seedLesson(page, run) {
    const url = `${server.origin}/academy/?qa-run=${run}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.academy-access-screen', { timeout: 20_000 });
    await page.evaluate(() => window.__yomuAcademy?.dispose());
    await page.evaluate(async databaseName => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const now = Date.now();
        const transaction = database.transaction(['meta', 'learner-events'], 'readwrite');
        const events = transaction.objectStore('learner-events');
        events.clear();
        events.put({ schemaVersion: 1, eventId: 'qa:profile', at: now - 1, kind: 'profile-changed', profile: { displayName: 'Lesson QA', learningReason: 'Responsive lesson verification', portraitId: 'quality-2' } });
        transaction.objectStore('meta').put({
            id: 'active-checkpoint',
            value: {
                schemaVersion: 2,
                route: 'lesson-overview',
                routeHistory: [{ route: 'station' }],
                presentationMode: 'course',
                lessonId: 'authored-week:l1-l01',
                selectedFork: 'speaking',
                session: { sessionId: `qa-lesson-${now}`, expiresAt: now + 28_800_000, offlineResumeUntil: now + 2_592_000_000, source: 'local-qa' },
                updatedAt: now,
            },
        });
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        database.close();
    }, `yomu-academy-qa-${run}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
}

async function seedCourse(page, run) {
    const url = `${server.origin}/academy/?qa-run=${run}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.academy-access-screen', { timeout: 20_000 });
    await page.evaluate(() => window.__yomuAcademy?.dispose());
    await page.evaluate(async databaseName => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const now = Date.now();
        const transaction = database.transaction(['meta', 'learner-events'], 'readwrite');
        const events = transaction.objectStore('learner-events');
        events.clear();
        events.put({ schemaVersion: 1, eventId: 'qa:profile', at: now - 1, kind: 'profile-changed', profile: { displayName: 'Course QA', learningReason: 'Course event label verification', portraitId: 'quality-2' } });
        transaction.objectStore('meta').put({
            id: 'active-checkpoint',
            value: {
                schemaVersion: 2,
                route: 'class',
                routeHistory: [{ route: 'classroom' }],
                presentationMode: 'course',
                selectedFork: 'speaking',
                session: { sessionId: `qa-course-${now}`, expiresAt: now + 28_800_000, offlineResumeUntil: now + 2_592_000_000, source: 'local-qa' },
                updatedAt: now,
            },
        });
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        database.close();
    }, `yomu-academy-qa-${run}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
}

async function seedWorld(page, run, place) {
    const url = `${server.origin}/academy/?qa-run=${run}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.academy-access-screen', { timeout: 20_000 });
    await page.evaluate(() => window.__yomuAcademy?.dispose());
    const checkpoint = place === 'courtyard'
        ? { route: 'campus' }
        : ['classroom', 'cafe', 'lab', 'street', 'station', 'konbini', 'ramen', 'home'].includes(place)
            ? { route: place }
            : { route: 'world', worldPlace: place };
    await page.evaluate(async ({ databaseName, place, route, worldPlace }) => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const now = Date.now();
        const transaction = database.transaction(['meta', 'learner-events'], 'readwrite');
        const events = transaction.objectStore('learner-events');
        events.clear();
        events.put({ schemaVersion: 1, eventId: 'qa:profile', at: now - 2, kind: 'profile-changed', profile: { displayName: 'World QA', learningReason: 'Responsive scene verification', portraitId: 'quality-2' } });
        events.put({ schemaVersion: 1, eventId: 'qa:world-cast', at: now - 1, kind: 'characters-encountered', encounterId: 'qa-world-cast', sceneId: 'scene:qa-world-cast', attendeeIds: place === 'ramen' ? ['rie', 'shin'] : ['rie', 'aakash', 'felix', 'peter', 'sophie', 'nanako'] });
        transaction.objectStore('meta').put({
            id: 'active-checkpoint',
            value: {
                schemaVersion: 2,
                route,
                routeHistory: [{ route: 'street' }],
                presentationMode: 'story',
                selectedFork: 'speaking',
                session: { sessionId: `qa-${place}-${now}`, expiresAt: now + 28_800_000, offlineResumeUntil: now + 2_592_000_000, source: 'local-qa' },
                worldVisits: { [place]: 1 },
                ...(worldPlace ? { worldPlace } : {}),
                updatedAt: now,
            },
        });
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        database.close();
    }, { databaseName: `yomu-academy-qa-${run}`, place, ...checkpoint });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
}

function serveAcademy(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/academy/api/session') {
        const now = Date.now();
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ sessionId: `geometry-${now}`, expiresAt: now + 28_800_000, offlineResumeUntil: now + 2_592_000_000 }));
        return;
    }
    if (url.pathname.startsWith('/academy/media/')) {
        response.writeHead(204, { 'cache-control': 'no-store' });
        response.end();
        return;
    }
    const override = url.pathname === '/academy/app.js'
        ? path.join(BUILD_ROOT, 'app.js')
        : url.pathname === '/academy/style.css'
            ? path.join(BUILD_ROOT, 'style.css')
            : null;
    const relative = url.pathname === '/academy/' || url.pathname === '/academy' ? 'academy/index.html' : url.pathname.replace(/^\/+/, '');
    const sourceFile = path.join(PUBLIC_ROOT, relative);
    const hostedFile = path.join(HOSTED_ROOT, relative);
    const file = override ?? (existsSync(sourceFile) ? sourceFile : hostedFile);
    const allowedRoot = override ? BUILD_ROOT : file === sourceFile ? PUBLIC_ROOT : HOSTED_ROOT;
    if (!existsSync(file) || statSync(file).isDirectory() || !file.startsWith(allowedRoot)) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    serveFile(response, file, contentType(file), request.method);
}

function contentType(file) {
    if (file.endsWith('.html')) return 'text/html; charset=utf-8';
    if (file.endsWith('.css')) return 'text/css; charset=utf-8';
    if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (file.endsWith('.json') || file.endsWith('.webmanifest')) return 'application/json';
    if (file.endsWith('.svg')) return 'image/svg+xml';
    if (file.endsWith('.png')) return 'image/png';
    if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
    if (file.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
}
