#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
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
const BUILD_ROOT = path.join(ROOT, 'qa-artifacts', 'academy-release-gate', 'build');
const EVIDENCE_ROOT = path.join(ROOT, 'qa-artifacts', 'academy-release-gate', 'evidence');
const CONFIG = path.join(ROOT, 'config', 'vite', 'academy.config.ts');
const AUDIO_SETTINGS = {
    muted: true,
    volumes: { music: 0.7, ambience: 0.65, lesson: 1, sfx: 0.8 },
};
const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900, reducedMotion: 'no-preference' },
    { name: 'mobile', width: 390, height: 844, reducedMotion: 'reduce' },
];
const requestedViewport = process.env.ACADEMY_GATE_VIEWPORT;
const GATE_VIEWPORTS = requestedViewport
    ? VIEWPORTS.filter(viewport => viewport.name === requestedViewport)
    : VIEWPORTS;
const skipBuild = process.env.ACADEMY_GATE_SKIP_BUILD === '1';
if (requestedViewport && GATE_VIEWPORTS.length === 0) {
    throw new Error(`Unknown Academy gate viewport: ${requestedViewport}`);
}
const EVIDENCE_MILESTONES = new Set([
    'campus',
    'world-classroom',
    'lesson-zero-overview',
    'lesson-return',
    'world-library',
    'library',
    'study',
    'jlpt-placement',
    'journal',
]);

rmSync(EVIDENCE_ROOT, { recursive: true, force: true });
mkdirSync(EVIDENCE_ROOT, { recursive: true });
if (skipBuild) {
    assert(existsSync(path.join(BUILD_ROOT, 'app.js')) && existsSync(path.join(BUILD_ROOT, 'style.css')),
        'Academy release gate cannot skip a missing build');
} else {
    rmSync(BUILD_ROOT, { recursive: true, force: true });
    await build({
        configFile: CONFIG,
        build: { outDir: BUILD_ROOT, emptyOutDir: true },
    });
}

const server = await startLoopbackServer(serveAcademy, 'Academy release gate server could not bind');
const results = [];

try {
    for (const viewport of GATE_VIEWPORTS) {
        // A production build registers a service worker. A distinct browser per
        // viewport keeps that browser-global state from making mobile depend on
        // the desktop run; this gate exercises the static app, not SW caching.
        const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
        let context;
        try {
            context = await browser.newContext({
                viewport: { width: viewport.width, height: viewport.height },
                deviceScaleFactor: viewport.name === 'mobile' ? 2 : 1,
                hasTouch: viewport.name === 'mobile',
                isMobile: viewport.name === 'mobile',
                reducedMotion: viewport.reducedMotion,
                locale: 'en-GB',
                serviceWorkers: 'block',
            });
            const page = await context.newPage();
            const runtime = watchRuntime(page, viewport.name);
            await page.addInitScript(settings => {
                localStorage.setItem('yomu:academy:audio:v1', JSON.stringify(settings));
            }, AUDIO_SETTINGS);
            await runEnrollment(page, viewport, runtime);
            await runCoreJourney(page, viewport, runtime);
            runtime.assertClean();
            results.push({ viewport: viewport.name, status: 'pass' });
            console.log(`PASS academy release gate (${viewport.name})`);
        } catch (error) {
            results.push({ viewport: viewport.name, status: 'fail', error: error instanceof Error ? error.message : String(error) });
            console.error(`FAIL academy release gate (${viewport.name}): ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            await context?.close().catch(() => undefined);
            await browser.close().catch(() => undefined);
        }
    }
} finally {
    await server.close();
}

console.log(JSON.stringify({ gate: 'academy-release', results }, null, 2));
if (results.some(result => result.status === 'fail')) process.exitCode = 1;

async function runEnrollment(page, viewport, runtime) {
    await openAcademy(page, viewport.name);
    await auditMilestone(page, viewport, runtime, 'access', '.academy-access-screen');
    await page.locator('input[name="code"]').fill('UCL2026');
    await pressFocused(page, '.academy-access-form button[type="submit"]');
    await auditMilestone(page, viewport, runtime, 'profile', '.academy-profile-screen');
    await assertInputThemeResilience(page, viewport, 'profile');

    await page.locator('input[name="displayName"]').fill('Release Gate');
    await pressFocused(page, '.academy-profile-advance');
    await auditMilestone(page, viewport, runtime, 'profile-reason', '.academy-profile-screen[data-profile-step="reason"]');
    await page.locator('textarea[name="learningReason"]').fill('Stable learning across devices.');
    await pressFocused(page, '.academy-profile-advance');
    await page.locator('input[name="portrait"][value="quality-2"]').check();
    await assertDialogueLogAccessibility(page, viewport, 'profile-portrait');
    await pressFocused(page, '.academy-profile-advance');
    await auditMilestone(page, viewport, runtime, 'profile-complete', '.academy-rie-unlock-screen');

    await pressFocused(page, '.academy-rie-unlock-screen button');
    await auditMilestone(page, viewport, runtime, 'start', '.academy-start-screen');
    await pressFocused(page, '[data-start-route="lesson-zero"]');
    await auditMilestone(page, viewport, runtime, 'campus', '[data-academy-route="campus"]');
}

async function runCoreJourney(page, viewport, runtime) {
    const run = viewport.name;
    await setCheckpoint(page, run, 'campus', { lessonId: 'lesson:foundation-00' });
    await auditMilestone(page, viewport, runtime, 'campus', '[data-academy-route="campus"]');
    await pressFocused(page, '.academy-world-arrival-continue');

    const firstExit = page.locator('.academy-world-exit:not(:disabled)').first();
    await firstExit.focus();
    const worldExitCount = await page.locator('.academy-world-exit:not(:disabled)').count();
    for (let index = 1; index < worldExitCount; index += 1) {
        await page.keyboard.press('ArrowRight');
        const focusedExit = page.locator('.academy-world-exit:focus');
        assert(await focusedExit.count() === 1, `${run}: world exits do not support arrow-key focus`);
        const focusedRect = await focusedExit.evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, viewportWidth: innerWidth };
        });
        assert(
            focusedRect.left >= -2 && focusedRect.right <= focusedRect.viewportWidth + 2,
            `${run}: focused world exit remains clipped`,
            focusedRect,
        );
    }
    await pressFocused(page, '.academy-world-exit[data-location="classroom"]');
    await auditMilestone(page, viewport, runtime, 'world-classroom', '[data-current-place="classroom"]');
    await pressFocused(page, '.academy-world-arrival-continue');

    await setCheckpoint(page, run, 'lesson-overview', { lessonId: 'lesson:foundation-00' }, [{ route: 'classroom' }]);
    await auditMilestone(page, viewport, runtime, 'lesson-zero-overview', '[data-academy-screen="lesson-overview"]');
    await pressFocused(page, '.academy-lesson-overview-header .academy-lesson-overview-back');
    await auditMilestone(page, viewport, runtime, 'lesson-return', '[data-current-place="classroom"]');

    await setCheckpoint(page, run, 'lesson-overview', { lessonId: 'lesson:foundation-00' });
    await page.waitForSelector('[data-academy-screen="lesson-overview"]');
    const lessonAction = page.locator('.academy-lesson-overview-section-action:not(:disabled)').first();
    assert(await lessonAction.count() === 1, `${run}: Lesson 0 has no playable activity`);
    await lessonAction.focus();
    await page.keyboard.press('Enter');
    await advanceLessonZeroToKana(page, run);
    await auditMilestone(page, viewport, runtime, 'lesson-zero-kana', '.academy-lesson-zero-kana-game');
    await pressFocused(page, '.academy-lesson-zero-kana-game .academy-vn-primary-action');
    await pressFocused(page, '.academy-lesson-zero-kana-game .academy-vn-primary-action');
    await auditMilestone(page, viewport, runtime, 'kana-recognition', '[data-kana-mode="recognition"]');

    await setCheckpoint(page, run, 'world', { lessonId: 'lesson:foundation-00', worldPlace: 'library' });
    await auditMilestone(page, viewport, runtime, 'world-library', '[data-current-place="library"][data-academy-route="world"]');
    await pressFocused(page, '[data-activity-route="review"]');
    await auditMilestone(page, viewport, runtime, 'library-entry', '.academy-library-introduction');
    await pressFocused(page, '.academy-library-dialogue-continue');
    await auditMilestone(page, viewport, runtime, 'library', '.academy-library-screen');
    await pressFocused(page, '.academy-library-sheet-button');
    await auditMilestone(page, viewport, runtime, 'vocabulary-sheet', '.academy-vocabulary-sheet');
    await pressFocused(page, '.academy-vocabulary-sheet-start');
    await auditMilestone(page, viewport, runtime, 'study', '[data-academy-screen="study"]');

    await setCheckpoint(page, run, 'start', { lessonId: undefined });
    await pressFocused(page, '[data-start-route="placement-mock"]');
    await auditMilestone(page, viewport, runtime, 'jlpt-placement', '.academy-placement-screen');
    await completePlacement(page, run);
    await auditMilestone(page, viewport, runtime, 'jlpt-placement-result', '.academy-placement-result-screen');

    await setCheckpoint(page, run, 'campus', { lessonId: 'lesson:foundation-00' });
    await pressFocused(page, '[data-activity-route="journal"]');
    await auditMilestone(page, viewport, runtime, 'journal', '.academy-journal-screen');
    await pressFocused(page, '.academy-journal-profile-sync');
    await auditMilestone(page, viewport, runtime, 'account-entry', '[data-academy-route="profile-sync"]');

    await setCheckpoint(page, run, 'campus', { lessonId: 'lesson:foundation-00' });
    await pressFocused(page, '.academy-world-exit[data-location="classroom"]');
    await page.waitForSelector('[data-current-place="classroom"]');
    await pressFocused(page, '[data-activity-route="class"]');
    await auditMilestone(page, viewport, runtime, 'current-lesson', '[data-academy-screen="lesson-overview"]');

    await setCheckpoint(page, run, 'class', { lessonId: undefined }, [{ route: 'classroom' }]);
    await auditMilestone(page, viewport, runtime, 'class-path', '[data-academy-screen="class-path"]');
}

async function completePlacement(page, run) {
    await page.locator('.academy-target-band select').selectOption('n5');
    await pressFocused(page, '.academy-placement-actions .academy-button-primary:not([hidden])');
    for (let guard = 0; guard < 20; guard += 1) {
        const submit = page.locator('.academy-placement-actions button[type="submit"]:visible');
        if (await submit.count()) {
            await submit.focus();
            await page.keyboard.press('Enter');
            await page.waitForSelector('.academy-placement-result-screen');
            return;
        }
        const visibleRadio = page.locator('.academy-mock-item:visible input[type="radio"]').first();
        if (await visibleRadio.count()) {
            await visibleRadio.focus();
            await page.keyboard.press('Space');
        }
        await pressFocused(page, '.academy-placement-actions .academy-button-primary:not([hidden])');
    }
    throw new Error(`${run}: JLPT placement did not reach its result route`);
}

async function auditMilestone(page, viewport, runtime, name, selector) {
    try {
        await page.waitForSelector(selector, { state: 'visible', timeout: 20_000 });
    } catch (error) {
        const state = await page.evaluate(() => ({
            bootError: document.querySelector('#yomu-academy')?.getAttribute('data-boot-error'),
            route: document.querySelector('[data-academy-route]')?.getAttribute('data-academy-route'),
            screen: document.querySelector('[data-academy-screen]')?.getAttribute('data-academy-screen'),
            text: document.querySelector('#academy-screen')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 240),
        })).catch(() => ({ unavailable: true }));
        throw new Error(`${viewport.name}/${name}: milestone ${selector} did not render: ${JSON.stringify({ state, runtime: runtime.snapshot() })}`, { cause: error });
    }
    await page.waitForTimeout(viewport.reducedMotion === 'reduce' ? 30 : 650);
    assert(await page.locator('#yomu-academy[data-boot-error="true"]').count() === 0, `${viewport.name}/${name}: Academy boot failed`);
    const layout = await page.evaluate(surfaceSelector => {
        const surface = document.querySelector(surfaceSelector);
        if (!(surface instanceof HTMLElement)) return { missing: true };
        const visible = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const controls = [...surface.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
            .filter(visible);
        const unnamed = controls.filter(element => !(element.getAttribute('aria-label') || element.textContent?.trim() || element.closest('label')?.textContent?.trim()));
        const controlName = element => {
            const labelledBy = element.getAttribute('aria-labelledby')
                ?.split(/\s+/)
                .map(id => document.getElementById(id)?.textContent?.trim())
                .filter(Boolean)
                .join(' ');
            return element.getAttribute('aria-label') || labelledBy || element.closest('label')?.textContent?.trim() || element.textContent?.trim() || element.getAttribute('value')?.trim() || '';
        };
        const namedCommands = controls.filter(element => element.matches('button, a[href], [role="button"]'));
        const duplicateControlNames = [...new Set(namedCommands
            .map(controlName)
            .filter((label, index, labels) => label && labels.indexOf(label) !== index))];
        const ids = [...surface.querySelectorAll('[id]')].map(element => element.id);
        const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
        const zoomSensitiveSelector = [
            'input:not([type="button"]):not([type="checkbox"]):not([type="color"]):not([type="file"]):not([type="hidden"]):not([type="image"]):not([type="radio"]):not([type="range"]):not([type="reset"]):not([type="submit"])',
            'select',
            'textarea',
            '[contenteditable]',
        ].join(', ');
        const mobileZoomRiskControls = [...surface.querySelectorAll(zoomSensitiveSelector)]
            .filter(element => visible(element)
                && !element.matches(':disabled')
                && (!element.hasAttribute('contenteditable') || element.isContentEditable))
            .flatMap(element => {
                const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
                return !Number.isFinite(fontSize) || fontSize < 16
                    ? [{
                        tag: element.tagName.toLowerCase(),
                        type: element.getAttribute('type'),
                        name: element.getAttribute('name'),
                        fontSize,
                    }]
                    : [];
            });
        const clippedControls = controls.flatMap(element => {
            const rect = element.getBoundingClientRect();
            let ancestor = element.parentElement;
            let insideHorizontalScroller = false;
            while (ancestor && ancestor !== surface.parentElement) {
                const style = getComputedStyle(ancestor);
                if (/(auto|scroll)/.test(style.overflowX) && ancestor.scrollWidth > ancestor.clientWidth + 2) {
                    insideHorizontalScroller = true;
                    break;
                }
                ancestor = ancestor.parentElement;
            }
            const outsideViewport = rect.left < -2 || rect.right > innerWidth + 2;
            const clipsOwnContent = element.scrollWidth > element.clientWidth + 2;
            return outsideViewport && !insideHorizontalScroller || clipsOwnContent
                ? [{
                    label: element.getAttribute('aria-label') || element.textContent?.trim(),
                    left: rect.left,
                    right: rect.right,
                    clientWidth: element.clientWidth,
                    scrollWidth: element.scrollWidth,
                }]
                : [];
        });
        const clippedText = [...surface.querySelectorAll('h1, h2, h3, p, button, a[href], label, legend, figcaption, li, summary')]
            .filter(visible)
            .flatMap(element => {
                const style = getComputedStyle(element);
                const clipsX = /(?:hidden|clip)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 2;
                const clipsY = /(?:hidden|clip)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
                return clipsX || clipsY
                    ? [{
                        text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100),
                        overflowX: style.overflowX,
                        overflowY: style.overflowY,
                        clientWidth: element.clientWidth,
                        scrollWidth: element.scrollWidth,
                        clientHeight: element.clientHeight,
                        scrollHeight: element.scrollHeight,
                    }]
                    : [];
            });
        const brokenImages = [...surface.querySelectorAll('img')].filter(visible).filter(image => !image.complete || image.naturalWidth <= 0 || !image.hasAttribute('alt'));
        return {
            missing: false,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth,
            surfaceWidth: surface.scrollWidth,
            surfaceClientWidth: surface.clientWidth,
            unnamed: unnamed.map(element => element.outerHTML.slice(0, 180)),
            duplicateControlNames,
            duplicateIds,
            mobileZoomRiskControls,
            clippedControls,
            clippedText,
            brokenImages: brokenImages.map(image => image.getAttribute('src')),
        };
    }, selector);
    assert(!layout.missing, `${viewport.name}/${name}: milestone surface is missing`);
    assert(layout.documentWidth <= layout.viewportWidth + 2, `${viewport.name}/${name}: document overflows horizontally`, layout);
    assert(layout.surfaceWidth <= layout.surfaceClientWidth + 2, `${viewport.name}/${name}: milestone surface overflows horizontally`, layout);
    assert(layout.unnamed.length === 0, `${viewport.name}/${name}: unnamed controls`, layout);
    assert(layout.duplicateControlNames.length === 0, `${viewport.name}/${name}: duplicate command labels`, layout);
    assert(layout.duplicateIds.length === 0, `${viewport.name}/${name}: duplicate ids`, layout);
    if (viewport.name === 'mobile') {
        assert(layout.mobileZoomRiskControls.length === 0,
            `${viewport.name}/${name}: text-entry controls below 16px can trigger mobile input zoom`, layout);
    }
    assert(layout.clippedControls.length === 0, `${viewport.name}/${name}: controls are clipped or outside the viewport`, layout);
    assert(layout.clippedText.length === 0, `${viewport.name}/${name}: text is clipped`, layout);
    assert(layout.brokenImages.length === 0, `${viewport.name}/${name}: broken or unlabelled images`, layout);

    const axe = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa']).analyze();
    const violations = axe.violations.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.slice(0, 3).map(node => node.target.join(' ')),
    }));
    assert(violations.length === 0, `${viewport.name}/${name}: axe violations`, { violations });
    await assertVisibleKeyboardFocus(page, viewport, name, selector);

    if (viewport.reducedMotion === 'reduce') {
        const motion = await page.evaluate(surfaceSelector => {
            const surface = document.querySelector(surfaceSelector);
            if (!surface) return { media: false, offenders: ['missing surface'] };
            const durations = value => value.split(',').map(part => Number.parseFloat(part) * (part.includes('ms') ? 1 : 1000));
            const iterationCount = value => value === 'infinite' ? Number.POSITIVE_INFINITY : Number(value);
            const offenders = [surface, ...surface.querySelectorAll('*')].flatMap(element => {
                const style = getComputedStyle(element);
                const animations = durations(style.animationDuration);
                const transitions = durations(style.transitionDuration);
                const iterations = style.animationIterationCount.split(',').map(iterationCount);
                return animations.some(value => value > 1.1) || transitions.some(value => value > 1.1) || iterations.some(value => value > 1)
                    ? [`${element.tagName.toLowerCase()}.${String(element.className).split(/\s+/).slice(0, 2).join('.')}`]
                    : [];
            });
            return { media: matchMedia('(prefers-reduced-motion: reduce)').matches, offenders: offenders.slice(0, 12) };
        }, selector);
        assert(motion.media, `${viewport.name}/${name}: reduced-motion media query is not active`);
        assert(motion.offenders.length === 0, `${viewport.name}/${name}: reduced motion leaves active animation`, motion);
    }
    runtime.assertClean();
    if (EVIDENCE_MILESTONES.has(name)) {
        await page.screenshot({
            path: path.join(EVIDENCE_ROOT, `${viewport.name}-${name}.png`),
            fullPage: false,
        });
    }
}

async function assertVisibleKeyboardFocus(page, viewport, name, selector) {
    const focus = await page.evaluate(async surfaceSelector => {
        const surface = document.querySelector(surfaceSelector);
        if (!(surface instanceof HTMLElement)) return { missing: true };
        const visible = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const target = [...surface.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
            .find(element => visible(element) && !element.matches('input[type="radio"], input[type="checkbox"]'));
        if (!(target instanceof HTMLElement)) return { missingTarget: true };
        target.focus();
        await new Promise(resolve => setTimeout(resolve, 50));
        const ancestors = [];
        let current = target;
        while (current && current !== surface.parentElement) {
            ancestors.push(current);
            current = current.parentElement;
        }
        const ring = ancestors.find(element => {
            const style = getComputedStyle(element);
            return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2;
        });
        const rect = target.getBoundingClientRect();
        return {
            tag: target.tagName.toLowerCase(),
            label: target.getAttribute('aria-label') || target.textContent?.trim(),
            active: document.activeElement === target,
            focusVisible: target.matches(':focus-visible'),
            outline: ring ? getComputedStyle(ring).outline : 'none',
            left: rect.left,
            right: rect.right,
            viewportWidth: innerWidth,
        };
    }, selector);
    assert(!focus.missing && !focus.missingTarget, `${viewport.name}/${name}: no keyboard-focusable control`, focus);
    assert(focus.active, `${viewport.name}/${name}: keyboard target did not receive focus`, focus);
    assert(focus.focusVisible, `${viewport.name}/${name}: focused control lacks :focus-visible`, focus);
    assert(focus.outline !== 'none', `${viewport.name}/${name}: focused control has no visible focus ring`, focus);
    assert(focus.left >= -2 && focus.right <= focus.viewportWidth + 2, `${viewport.name}/${name}: focused control is clipped`, focus);
}

async function assertInputThemeResilience(page, viewport, name) {
    const themes = ['dark', 'light'];
    const styles = [];
    for (const theme of themes) {
        const themeStyles = await page.evaluate(activeTheme => {
            const root = document.documentElement;
            root.classList.remove('jpdb-reader-theme-dark', 'jpdb-reader-theme-light');
            root.classList.add(`jpdb-reader-theme-${activeTheme}`);
            root.style.setProperty('--jpdb-reader-text', activeTheme === 'dark' ? '#f2f4f8' : '#17202a');
            root.style.setProperty('--jpdb-reader-bg', activeTheme === 'dark' ? '#181b20' : '#fbfcfe');
            root.style.setProperty('--jpdb-reader-surface', activeTheme === 'dark' ? '#20242b' : '#f4f7fa');
            return [...document.querySelectorAll('.academy-profile-screen :is(input.academy-input, textarea.academy-input)')]
                .filter(element => {
                    const rect = element.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                })
                .map(element => {
                    const style = getComputedStyle(element);
                    return {
                        name: element.getAttribute('name'),
                        color: style.color,
                        background: style.backgroundColor,
                        textFill: style.webkitTextFillColor,
                        caret: style.caretColor,
                        colorScheme: style.colorScheme,
                        fontSize: Number.parseFloat(style.fontSize),
                    };
                });
        }, theme);
        styles.push({ theme, inputs: themeStyles });
    }
    await page.evaluate(() => {
        const root = document.documentElement;
        root.classList.remove('jpdb-reader-theme-dark', 'jpdb-reader-theme-light');
        root.style.removeProperty('--jpdb-reader-text');
        root.style.removeProperty('--jpdb-reader-bg');
        root.style.removeProperty('--jpdb-reader-surface');
    });
    assert(styles.every(entry => entry.inputs.length === 1), `${viewport.name}/${name}: expected one visible profile input per injected theme`, { styles });
    const [dark, light] = styles.map(entry => entry.inputs[0]);
    assert(dark.color === light.color && dark.background === light.background && dark.textFill === light.textFill && dark.caret === light.caret,
        `${viewport.name}/${name}: Reader theme injection changes Academy input colours`, { styles });
    assert(dark.colorScheme === 'light' && light.colorScheme === 'light', `${viewport.name}/${name}: Academy input does not retain a light colour scheme`, { styles });
    if (viewport.name === 'mobile') {
        assert(dark.fontSize >= 16 && light.fontSize >= 16,
            `${viewport.name}/${name}: Academy input can trigger mobile viewport zoom`, { styles });
    }
    const contrast = inputContrast(dark.color, dark.background);
    assert(contrast >= 4.5, `${viewport.name}/${name}: Academy input text contrast falls below AA`, { contrast, input: dark });
}

async function assertDialogueLogAccessibility(page, viewport, name) {
    const readingToggle = page.locator('.academy-profile-screen .academy-vn-reading-toggle');
    assert(await readingToggle.count() === 1, `${viewport.name}/${name}: duplicate readings buttons`);
    assert(await page.locator('.academy-profile-screen .academy-vn-line-tools .academy-vn-reading-toggle').count() === 1,
        `${viewport.name}/${name}: readings button is repeated in dialogue support`);

    const logButton = page.locator('.academy-profile-screen .academy-vn-log-button');
    await pressFocused(page, '.academy-profile-screen .academy-vn-log-button');
    const log = page.locator('.academy-profile-screen .academy-vn-log-panel');
    await log.waitFor({ state: 'visible' });
    assert(await page.locator('.academy-profile-screen .academy-vn-dialogue[inert]').count() === 1,
        `${viewport.name}/${name}: dialogue remains interactive while its log is open`);

    const translationToggle = page.locator('.academy-profile-screen .academy-vn-translation-toggle');
    await translationToggle.focus();
    await page.keyboard.press('Tab');
    assert(await logButton.evaluate(element => element === document.activeElement), `${viewport.name}/${name}: dialogue log does not wrap Tab focus`);
    await page.keyboard.press('Shift+Tab');
    assert(await translationToggle.evaluate(element => element === document.activeElement), `${viewport.name}/${name}: dialogue log does not wrap reverse Tab focus`);
    assert(await log.evaluate(element => element.contains(document.activeElement)), `${viewport.name}/${name}: dialogue log lets focus escape`);
    await page.keyboard.press('Escape');
    assert(await log.isHidden(), `${viewport.name}/${name}: dialogue log does not close with Escape`);
    assert(await logButton.evaluate(element => element === document.activeElement), `${viewport.name}/${name}: dialogue log does not restore trigger focus`);
}

async function advanceLessonZeroToKana(page, run) {
    const sourceAudio = page.locator('.academy-lesson-zero-source-audio audio');
    await sourceAudio.waitFor({ state: 'visible' });
    await sourceAudio.evaluate(audio => audio.dispatchEvent(new Event('play')));
    const audioContinue = page.locator('.academy-lesson-zero-source-audio .academy-vn-primary-action');
    await audioContinue.waitFor({ state: 'visible' });
    assert(!await audioContinue.isDisabled(), `${run}: Lesson 0 greeting audio did not unlock its continuation`);
    await pressFocused(page, '.academy-lesson-zero-source-audio .academy-vn-primary-action');
    await page.locator('[data-class-present-ceremony="complete"]').waitFor({ state: 'attached' });
    await pressFocused(page, '.academy-vn-action-slot > .academy-vn-primary-action');
}

function inputContrast(foreground, background) {
    const foregroundColor = parseCssColor(foreground);
    const backgroundColor = parseCssColor(background);
    if (!foregroundColor || !backgroundColor) return 0;
    const composite = backdrop => backgroundColor.slice(0, 3).map((channel, index) => channel * backgroundColor[3] + backdrop[index] * (1 - backgroundColor[3]));
    return Math.min(...[[0, 0, 0], [255, 255, 255]].map(backdrop => contrastRatio(foregroundColor.slice(0, 3), composite(backdrop))));
}

function parseCssColor(value) {
    const channels = value.match(/[\d.]+/g)?.map(Number);
    if (!channels || channels.length < 3) return null;
    return [channels[0], channels[1], channels[2], channels[3] ?? 1];
}

function contrastRatio(first, second) {
    const luminance = color => {
        const linear = color.map(channel => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const [lighter, darker] = [luminance(first), luminance(second)].sort((left, right) => right - left);
    return (lighter + 0.05) / (darker + 0.05);
}

async function pressFocused(page, selector) {
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible' });
    await target.focus();
    await page.waitForTimeout(20);
    if (!await target.evaluate(element => element === document.activeElement)) await target.focus();
    assert(await target.evaluate(element => element === document.activeElement), `Keyboard target could not receive focus: ${selector}`);
    await page.keyboard.press('Enter');
}

async function openAcademy(page, run) {
    await page.goto(`${server.origin}/academy/?qa-run=${run}`, { waitUntil: 'domcontentloaded' });
    try {
        await page.waitForSelector('#academy-screen > *', { timeout: 20_000 });
    } catch (error) {
        const state = await page.evaluate(() => ({
            bootError: document.querySelector('#yomu-academy')?.getAttribute('data-boot-error'),
            hasAcademyRoot: Boolean(document.querySelector('.academy-root')),
            screenChildren: document.querySelector('#academy-screen')?.childElementCount ?? 0,
            body: document.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 240),
        })).catch(() => ({ unavailable: true }));
        throw new Error(`${run}: Academy did not boot: ${JSON.stringify(state)}`, { cause: error });
    }
}

async function setCheckpoint(page, run, route, context = {}, routeHistory = []) {
    await page.evaluate(() => window.__yomuAcademy?.dispose());
    await page.evaluate(async ({ databaseName, route, context, routeHistory }) => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction('meta', 'readwrite');
        const store = transaction.objectStore('meta');
        const existing = await new Promise((resolve, reject) => {
            const request = store.get('active-checkpoint');
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
        const checkpoint = {
            ...existing,
            ...context,
            schemaVersion: 2,
            route,
            routeHistory,
            presentationMode: existing?.presentationMode ?? 'story',
            updatedAt: Date.now(),
        };
        Object.keys(checkpoint).forEach(key => checkpoint[key] === undefined && delete checkpoint[key]);
        store.put({ id: 'active-checkpoint', value: checkpoint });
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        database.close();
    }, { databaseName: databaseName(run), route, context, routeHistory });
    await openAcademy(page, run);
}

function watchRuntime(page, label) {
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('response', response => {
        if (response.status() >= 400) {
            errors.push(`response ${response.status()}: ${response.url()}`);
        }
    });
    return {
        snapshot() { return [...errors]; },
        assertClean() {
            assert(errors.length === 0, `${label}: browser runtime errors`, { errors });
        },
    };
}

function databaseName(run) {
    return `yomu-academy-qa-${run}`;
}

function serveAcademy(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('cache-control', 'no-store');
    if (url.pathname === '/academy/api/session') {
        const now = Date.now();
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
            sessionId: `release-gate-${now}`,
            expiresAt: now + 28_800_000,
            offlineResumeUntil: now + 2_592_000_000,
        }));
        return;
    }
    if (url.pathname.startsWith('/academy/media/audio/')) {
        response.writeHead(204, { 'cache-control': 'no-store' });
        response.end();
        return;
    }
    const override = url.pathname === '/academy/app.js'
        ? path.join(BUILD_ROOT, 'app.js')
        : url.pathname === '/academy/style.css'
            ? path.join(BUILD_ROOT, 'style.css')
            : null;
    const relative = url.pathname === '/academy/' || url.pathname === '/academy'
        ? 'academy/index.html'
        : url.pathname.replace(/^\/+/, '');
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
    if (file.endsWith('.json') || file.endsWith('.webmanifest')) return 'application/json; charset=utf-8';
    if (file.endsWith('.svg')) return 'image/svg+xml';
    if (file.endsWith('.png')) return 'image/png';
    if (file.endsWith('.webp')) return 'image/webp';
    if (file.endsWith('.mp3')) return 'audio/mpeg';
    return 'application/octet-stream';
}
