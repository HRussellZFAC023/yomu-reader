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
    'l1-l01-prerequisite',
    'l1-l01-authored-week',
    'l1-l01-lapse-resume',
    'l1-l01-repair',
    'l1-l01-next-resume',
    'l1-l01-world-return',
    'l1-l01-repair-journal',
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
        // The browser journey proves the product path independently of the
        // production Google-account proof. Compile the localhost-only QA
        // gateway into this isolated build; production builds keep DEV=false.
        define: { 'import.meta.env.DEV': 'true' },
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
    const smokeCode = process.env.ACADEMY_SMOKE_CODE?.trim() || 'TEST';
    await openAcademy(page, viewport.name);
    await auditMilestone(page, viewport, runtime, 'access', '.academy-access-screen');
    await page.locator('input[name="code"]').fill(smokeCode);
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
    await auditMilestone(page, viewport, runtime, 'profile-complete', '.academy-rie-introduction-screen');

    await pressFocused(page, '.academy-rie-introduction-primary');
    if (await page.locator('.academy-rie-introduction-screen').count() === 1) {
        await page.waitForFunction(() =>
            document.querySelector('.academy-rie-introduction-screen')?.dataset.voiceHeard === 'true');
        await pressFocused(page, '.academy-rie-introduction-primary');
    }
    await auditMilestone(page, viewport, runtime, 'start', '.academy-start-screen');
    await pressFocused(page, '[data-start-route="lesson-zero"]');
    await page.locator('[data-story-arc-id="arc:bridge:opening-arrival"]').waitFor();
    await advanceOpeningArrival(page);
    await pressFocused(page, '.academy-story-next');
    await auditMilestone(page, viewport, runtime, 'campus', '[data-academy-route="campus"]');
}

async function advanceOpeningArrival(page) {
    for (let index = 0; index < 40; index += 1) {
        const bridge = page.locator('[data-story-arc-id="arc:bridge:opening-arrival"]');
        const moment = await bridge.getAttribute('data-story-moment');
        if (moment === 'complete') return;
        const choice = bridge.locator('[data-story-option-id]').first();
        const action = bridge.locator('.academy-vn-action-slot .academy-vn-primary-action').first();
        if (await choice.count()) await choice.click();
        else if (await action.count()) await action.click();
        else throw new Error(`Opening arrival stalled at ${moment ?? 'unknown'}.`);
        await page.waitForTimeout(40);
    }
    throw new Error('Opening arrival did not complete within 40 actions.');
}

async function runCoreJourney(page, viewport, runtime) {
    const run = viewport.name;
    await setCheckpoint(page, run, 'campus', { lessonId: 'lesson:foundation-00' });
    await auditMilestone(page, viewport, runtime, 'campus', '[data-academy-route="campus"]');
    await pressFocused(page, '.academy-world-arrival-continue');
    await assertCourtyardPurposeLayout(page, viewport);

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
    await page.evaluate(async () => {
        const academy = window.__yomuAcademy;
        if (!academy || typeof academy.go !== 'function') throw new Error('Academy QA route seam is unavailable.');
        await academy.go('source-activity', {
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-vowel-listen',
        });
    });
    await auditMilestone(page, viewport, runtime, 'lesson-zero-kana', '.academy-vowel-screen[data-stage="ready"]');
    await pressFocused(page, '.academy-vowel-screen .academy-vowel-action-primary');
    await auditMilestone(page, viewport, runtime, 'kana-recognition', '.academy-vowel-screen[data-stage="learn"]');

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

    await setCheckpoint(page, run, 'class', { lessonId: undefined, selectedBand: 'n5' }, [{ route: 'classroom' }]);
    await auditMilestone(page, viewport, runtime, 'class-path', '[data-academy-screen="class-path"]');

    const lessonOneNode = page.locator('.academy-class-week-node[data-week-id="l1-l01"]');
    assert(await lessonOneNode.count() === 1, `${run}: Class path does not expose l1-l01 exactly once`);
    assert(await lessonOneNode.getAttribute('data-week-runtime') === 'playable', `${run}: l1-l01 is not playable on the Class path`);
    const lessonOneEntry = lessonOneNode.locator('button.academy-class-week-entry');
    assert(await lessonOneEntry.count() === 1, `${run}: l1-l01 is not an actionable Class path stop`);
    assert(await lessonOneEntry.isVisible(), `${run}: l1-l01 entry is not visible`);
    assert(await lessonOneEntry.isEnabled(), `${run}: l1-l01 entry is disabled`);
    await lessonOneEntry.focus();
    await page.keyboard.press('Enter');

    const lessonOneClassroom = '[data-current-place="classroom"][data-world-lesson-id="authored-week:l1-l01"]';
    await page.waitForSelector(lessonOneClassroom);
    const arrivalContinue = page.locator(`${lessonOneClassroom} .academy-world-arrival-continue`);
    if (await arrivalContinue.isVisible()) await pressFocused(page, `${lessonOneClassroom} .academy-world-arrival-continue`);
    await pressFocused(page, `${lessonOneClassroom} [data-activity-route="class"]`);

    const prerequisiteSelector = '[data-academy-screen="lesson-vocabulary-prerequisite"][data-lesson-id="authored-week:l1-l01"]';
    await page.waitForSelector(prerequisiteSelector);
    const prerequisite = page.locator(prerequisiteSelector);
    assert(await prerequisite.getAttribute('data-source-status') === 'exact-source', `${run}: l1-l01 prerequisite lost its exact teacher source`);
    assert(await prerequisite.getAttribute('data-parity-status') === 'gap-declared', `${run}: l1-l01 prerequisite conceals its declared source gap`);
    await page.waitForSelector('.academy-vocabulary-sheet');
    const vocabularySheet = page.locator('.academy-vocabulary-sheet');
    assert(await vocabularySheet.isVisible(), `${run}: l1-l01 exact vocabulary sheet did not open`);
    assert(await vocabularySheet.locator('.academy-vocabulary-sheet-list > li').count() === 27, `${run}: l1-l01 vocabulary sheet does not expose all 27 source rows`);
    await auditMilestone(page, viewport, runtime, 'l1-l01-prerequisite', '.academy-vocabulary-sheet');
    await pressFocused(page, '.academy-vocabulary-sheet-start');

    const authoredWeekSelector = '[data-academy-screen="authored-week"][data-week-id="l1-l01"]';
    await auditMilestone(page, viewport, runtime, 'l1-l01-authored-week', authoredWeekSelector);
    const authoredWeek = page.locator(authoredWeekSelector);
    assert(await authoredWeek.getAttribute('data-lesson-phase') === 'teaching', `${run}: l1-l01 skips its teaching-first seam`);
    assert(await authoredWeek.locator('[data-exposure-kind]').count() === 1, `${run}: l1-l01 has no current teaching exposure`);
    assert(await authoredWeek.locator('.academy-lesson-activity-continue').isVisible(), `${run}: l1-l01 teaching cannot continue`);
    assert(await authoredWeek.locator('.academy-authored-week-progress-value').isVisible(), `${run}: l1-l01 progress is not visible`);

    const expectedTeaching = ['explanation', 'passage', 'prompt', 'prompt', 'mission'];
    for (const expectedKind of expectedTeaching) {
        assert(await authoredWeek.getAttribute('data-lesson-phase') === 'teaching', `${run}: l1-l01 left teaching before ${expectedKind}`);
        assert(await authoredWeek.locator(`[data-exposure-kind="${expectedKind}"]`).count() === 1, `${run}: l1-l01 teaching order lost ${expectedKind}`);
        await pressFocused(page, `${authoredWeekSelector} .academy-lesson-activity-continue`);
    }
    assert(await authoredWeek.getAttribute('data-lesson-phase') === 'support', `${run}: l1-l01 omitted first-question support`);
    await pressFocused(page, `${authoredWeekSelector} .academy-lesson-activity-continue`);

    const firstActivitySelector = '[data-activity-id="authored:l1-l01/ex-input-job"]';
    await page.waitForSelector(firstActivitySelector);
    await pressFocused(page, `${firstActivitySelector} [data-choice-id="b"]`);
    await page.waitForSelector(`${firstActivitySelector}[data-outcome="lapse"]`);
    assert(await authoredWeek.locator('.academy-feedback-repair').count() === 0, `${run}: l1-l01 exposed repair before the learner asked for it`);
    await pressFocused(page, `${firstActivitySelector} .academy-progressive-hint-button`);
    assert(await authoredWeek.locator('.academy-feedback-repair').isVisible(), `${run}: l1-l01 repair hint did not appear after the lapse`);

    const lapsedState = await readLearningState(page, run);
    const firstAttempts = lapsedState.events.filter(event => event.kind === 'attempt-recorded'
        && event.activityId === 'authored:l1-l01/ex-input-job');
    assert(firstAttempts.length === 1 && firstAttempts[0].outcome === 'lapse', `${run}: l1-l01 lapse was not durably recorded`, firstAttempts);
    assert(firstAttempts[0].errorTags?.includes('concept:self-introduction-job:repair'), `${run}: l1-l01 lapse lost its precise repair tag`, firstAttempts[0]);
    const repairSchedule = lapsedState.events.find(event => event.eventId === 'review-scheduled:academy:review:ex-input-job:concept:self-introduction-job');
    assert(repairSchedule?.kind === 'review-scheduled' && repairSchedule.dueAt <= Date.now(), `${run}: l1-l01 repair was not scheduled immediately`, repairSchedule);
    const repairCard = lapsedState.srs?.cards?.['エンジニアです\u0000エンジニアです'];
    const repairProvenance = repairCard?.academyProvenance?.['academy:review-seed:review:ex-input-job:concept:self-introduction-job'];
    assert(repairCard && repairCard.dueAt <= Date.now(), `${run}: l1-l01 repair is absent from Yomu SRS`, repairCard);
    assert(repairProvenance?.reason === 'repair', `${run}: l1-l01 SRS card lost its repair provenance`, repairProvenance);
    const lapsedCursor = lapsedState.checkpoint?.authoredWeekProgress?.['l1-l01'];
    assert(lapsedCursor?.position?.phase === 'question'
        && lapsedCursor.position.activityId === 'authored:l1-l01/ex-input-job', `${run}: l1-l01 lapse cursor was not saved`, lapsedCursor);

    await openAcademy(page, run);
    await page.waitForSelector(`${authoredWeekSelector}[data-authored-week-resumed="true"][data-lesson-phase="question"]`);
    assert(await authoredWeek.getAttribute('data-current-activity-id') === 'authored:l1-l01/ex-input-job', `${run}: l1-l01 reload lost the lapsed activity`);
    assert(await page.locator('[data-academy-screen="lesson-vocabulary-prerequisite"]').count() === 0, `${run}: l1-l01 reload replayed the prerequisite`);
    assert(await authoredWeek.locator('[data-exposure-kind]').count() === 0, `${run}: l1-l01 reload replayed teaching notes`);
    await auditMilestone(page, viewport, runtime, 'l1-l01-lapse-resume', authoredWeekSelector);

    await page.waitForSelector(`${firstActivitySelector} [data-choice-id="a"]:not(:disabled)`);
    await pressFocused(page, `${firstActivitySelector} [data-choice-id="a"]`);
    await page.waitForSelector(`${firstActivitySelector}[data-outcome="pass"][data-repaired="true"]`);
    assert(await authoredWeek.locator('.academy-authored-week-repair-win').isVisible(), `${run}: l1-l01 repaired answer received no competence feedback`);
    await auditMilestone(page, viewport, runtime, 'l1-l01-repair', authoredWeekSelector);

    const repairedState = await readLearningState(page, run);
    const repairedAttempts = repairedState.events.filter(event => event.kind === 'attempt-recorded'
        && event.activityId === 'authored:l1-l01/ex-input-job');
    assert(repairedAttempts.length === 2, `${run}: l1-l01 repair does not retain both attempts`, repairedAttempts);
    assert(repairedAttempts[0].outcome === 'lapse' && repairedAttempts[1].outcome === 'pass', `${run}: l1-l01 repair attempt order is wrong`, repairedAttempts);
    assert(repairedState.events.some(event => event.kind === 'journal-line-recorded'
        && event.journalLineId === 'journal:l1-l01:first-name-card-repair'), `${run}: l1-l01 repair did not become a story memory`);
    const nextCursor = repairedState.checkpoint?.authoredWeekProgress?.['l1-l01'];
    assert(nextCursor?.position?.phase === 'support'
        && nextCursor.position.activityId === 'authored:l1-l01/ex-vocab-match', `${run}: repaired l1-l01 answer did not save the next activity`, nextCursor);

    await pressFocused(page, `${authoredWeekSelector} .academy-authored-week-back`);
    const lessonBoundClassroom = '[data-current-place="classroom"][data-world-lesson-id="authored-week:l1-l01"]';
    await auditMilestone(page, viewport, runtime, 'l1-l01-world-return', lessonBoundClassroom);
    await pressFocused(page, `${lessonBoundClassroom} .academy-world-activity-button[data-activity-route="class"]`);
    await page.waitForSelector(`${authoredWeekSelector}[data-authored-week-resumed="true"][data-lesson-phase="support"]`);
    assert(await authoredWeek.getAttribute('data-current-activity-id') === 'authored:l1-l01/ex-vocab-match', `${run}: revisiting l1-l01 did not open the next activity`);
    assert((await authoredWeek.locator('.academy-authored-week-progress-value').textContent())?.trim() === '1 / 19', `${run}: revisiting l1-l01 lost completed progress`);
    await auditMilestone(page, viewport, runtime, 'l1-l01-next-resume', authoredWeekSelector);
    await pressFocused(page, `${authoredWeekSelector} .academy-authored-week-back`);
    await page.waitForSelector(lessonBoundClassroom);
    await pressFocused(page, `${lessonBoundClassroom} .academy-world-exit[data-location="courtyard"]`);
    const courtyard = '[data-current-place="courtyard"]';
    await page.waitForSelector(courtyard);
    const courtyardArrival = page.locator(`${courtyard} .academy-world-arrival-continue`);
    if (await courtyardArrival.isVisible()) await pressFocused(page, `${courtyard} .academy-world-arrival-continue`);
    await pressFocused(page, `${courtyard} [data-activity-route="journal"]`);
    await page.waitForSelector('.academy-journal-screen');
    await pressFocused(page, '.academy-journal-book-tab:nth-child(2)');
    const repairJournalLine = '[data-journal-line-id="journal:l1-l01:first-name-card-repair"]';
    await page.waitForSelector(repairJournalLine, { state: 'visible' });
    assert((await page.locator(repairJournalLine).textContent())?.includes("Stasi waited while I read Aakash's name card again."), `${run}: l1-l01 journal memory lost its story text`);
    await auditMilestone(page, viewport, runtime, 'l1-l01-repair-journal', '.academy-journal-screen');
}

async function assertCourtyardPurposeLayout(page, viewport) {
    const screen = page.locator('[data-current-place="courtyard"]');
    const purpose = screen.locator('.academy-world-action-dock');
    const practiceToggle = purpose.locator('.academy-courtyard-practice-toggle');
    const journalAction = purpose.locator('[data-activity-route="journal"]');
    assert(await purpose.getAttribute('data-courtyard-mode') === 'journal', `${viewport.name}: courtyard does not open in journal mode`);
    assert(await practiceToggle.isVisible(), `${viewport.name}: courtyard notice practice switch is not visible`);
    assert(await journalAction.isVisible(), `${viewport.name}: courtyard journal action is not visible`);
    await assertCourtyardPurposeGeometry(screen, viewport, 'journal');

    await pressFocused(page, '.academy-courtyard-practice-toggle');
    assert(await purpose.getAttribute('data-courtyard-mode') === 'practice', `${viewport.name}: courtyard notice practice did not open`);
    assert(await purpose.locator('[data-courtyard-practice="noticeboard-order"]').isVisible(), `${viewport.name}: courtyard notice exercise is not visible`);
    assert(await purpose.locator('.academy-courtyard-practice-back').isVisible(), `${viewport.name}: courtyard practice has no return action`);
    await assertCourtyardPurposeGeometry(screen, viewport, 'practice');

    await pressFocused(page, '.academy-courtyard-practice-back');
    assert(await purpose.getAttribute('data-courtyard-mode') === 'journal', `${viewport.name}: courtyard practice did not return to the journal`);
}

async function assertCourtyardPurposeGeometry(screen, viewport, mode) {
    const geometry = await screen.evaluate(root => {
        const box = selector => {
            const element = root.querySelector(selector);
            if (!(element instanceof HTMLElement) || getComputedStyle(element).display === 'none') return null;
            const rect = element.getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        };
        const overlaps = (first, second) => Boolean(first && second
            && Math.min(first.right, second.right) - Math.max(first.left, second.left) > 1
            && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 1);
        const purpose = root.querySelector('.academy-world-action-dock');
        const purposeBox = box('.academy-world-action-dock');
        const exits = box('.academy-world-spatial-exits');
        const characters = [...root.querySelectorAll('[data-world-character]')]
            .map(character => {
                if (!(character instanceof HTMLElement) || getComputedStyle(character).display === 'none') return null;
                const rect = character.getBoundingClientRect();
                return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
            })
            .filter(Boolean);
        const internalScrollers = purpose instanceof HTMLElement
            ? [purpose, ...purpose.querySelectorAll('*')]
                .filter(element => element instanceof HTMLElement)
                .filter(element => {
                    const overflowY = getComputedStyle(element).overflowY;
                    return (overflowY === 'auto' || overflowY === 'scroll')
                        && element.scrollHeight > element.clientHeight + 1;
                })
                .map(element => ({
                    className: element.className,
                    clientHeight: element.clientHeight,
                    scrollHeight: element.scrollHeight,
                }))
            : [];
        return {
            viewport: { width: innerWidth, height: innerHeight },
            purposeExists: Boolean(purposeBox),
            exitsExists: Boolean(exits),
            characterCount: characters.length,
            purposeBox,
            exits,
            internalScrollers,
            clipsViewport: Boolean(purposeBox && (
                purposeBox.left < -1 || purposeBox.right > innerWidth + 1
                || purposeBox.top < -1 || purposeBox.bottom > innerHeight + 1
            )),
            overlapsExits: overlaps(purposeBox, exits),
            overlapsCharacters: characters.some(character => overlaps(purposeBox, character)),
        };
    });
    assert(geometry.purposeExists, `${viewport.name}: courtyard ${mode} paper is missing`, geometry);
    assert(geometry.exitsExists, `${viewport.name}: courtyard ${mode} route rail is missing`, geometry);
    assert(geometry.characterCount > 0, `${viewport.name}: courtyard ${mode} visible cast is missing`, geometry);
    assert(geometry.internalScrollers.length === 0, `${viewport.name}: courtyard ${mode} paper scrolls internally`, geometry);
    assert(!geometry.clipsViewport, `${viewport.name}: courtyard ${mode} paper clips outside the viewport`, geometry);
    if (viewport.name !== 'mobile') return;
    assert(!geometry.overlapsExits, `${viewport.name}: courtyard ${mode} paper overlaps the route rail`, geometry);
    assert(!geometry.overlapsCharacters, `${viewport.name}: courtyard ${mode} paper overlaps visible cast`, geometry);
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
        const surfaceRect = surface.getBoundingClientRect();
        const overflowingDescendants = [...surface.querySelectorAll('*')]
            .filter(element => element instanceof HTMLElement && visible(element))
            .map(element => {
                const rect = element.getBoundingClientRect();
                return {
                    element: element.id ? `#${element.id}` : element.classList.length
                        ? `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`
                        : element.tagName.toLowerCase(),
                    overflow: Math.max(0, element.scrollWidth - element.clientWidth, rect.right - surfaceRect.right),
                    clientWidth: element.clientWidth,
                    scrollWidth: element.scrollWidth,
                };
            })
            .filter(entry => entry.overflow > 2)
            .sort((left, right) => right.overflow - left.overflow)
            .slice(0, 12);
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
            overflowingDescendants,
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

    const logButtonSelector = '.academy-profile-screen .academy-vn-log-button[aria-controls]';
    const logButton = page.locator(logButtonSelector);
    assert(await logButton.count() === 1, `${viewport.name}/${name}: duplicate dialogue log controls`);
    await pressFocused(page, logButtonSelector);
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
    await page.goto(`${server.origin}/academy/?qa-run=${run}&qa-auth=bypass`, { waitUntil: 'domcontentloaded' });
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

async function readLearningState(page, run) {
    return page.evaluate(async databaseName => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const events = await new Promise((resolve, reject) => {
            const request = database.transaction('learner-events').objectStore('learner-events').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const checkpoint = await new Promise((resolve, reject) => {
            const request = database.transaction('meta').objectStore('meta').get('active-checkpoint');
            request.onsuccess = () => resolve(request.result?.value ?? null);
            request.onerror = () => reject(request.error);
        });
        database.close();
        const storedSrs = localStorage.getItem('yomu:srs-local:v1');
        return {
            events: events.sort((left, right) => left.at - right.at || left.eventId.localeCompare(right.eventId)),
            srs: storedSrs ? JSON.parse(storedSrs) : null,
            checkpoint,
        };
    }, databaseName(run));
}

function watchRuntime(page, label) {
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        // Chromium omits the request URL from this network console line. The
        // response listener below still rejects every non-profile 401.
        if (message.type() === 'error'
            && message.text() === 'Failed to load resource: the server responded with a status of 401 (Unauthorized)') {
            return;
        }
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('response', response => {
        const url = new URL(response.url());
        if (response.status() === 401 && url.pathname === '/academy/api/profile') return;
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
    if (url.pathname === '/academy/api/profile') {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'Sign in with Google to use an Academy profile.' }));
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
