import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5176';
const artifactDir = path.resolve('tmp/academy-story-recovery-browser');
const scenarios = [
    { name: 'desktop', width: 1440, height: 900, hasTouch: false, input: 'keyboard' },
    { name: 'mobile', width: 390, height: 844, hasTouch: true, input: 'touch' },
];
const mapActivityId = 'activity:s4e02-map-of-claims-evidence-map';
const journeyEpisodeId = 's4e07-journey-not-everyone-takes';
const journeyActivityId = 'activity:s4e07-journey-not-everyone-takes-non-comparative-futures';
const miraEncounterId = `story:${journeyEpisodeId}:scene:scene:journey:non-comparative-futures`;

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const scenario of scenarios) {
        const context = await browser.newContext({
            viewport: { width: scenario.width, height: scenario.height },
            hasTouch: scenario.hasTouch,
            reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        const errors = [];
        page.on('console', message => {
            if (message.type() === 'error' || message.type() === 'warning') {
                errors.push(`${message.type()}: ${message.text()}`);
            }
        });
        page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

        await assertServer(page);
        await checkEvidenceMap(page, scenario);
        await checkMiraReloads(page, scenario);
        assert.deepEqual(errors, [], `${scenario.name} browser console must stay clean`);
        await context.close();
    }
    console.log('Academy story recovery browser proof passed: real WorldFlow, persisted evidence, reload, replay, keyboard/touch, layout, and Axe.');
} finally {
    await browser.close();
}

async function assertServer(page) {
    const response = await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
}

async function checkEvidenceMap(page, scenario) {
    const profileKey = `academy-story-recovery:test:${scenario.name}:map`;
    await bootProfile(page, profileKey, true);
    await page.evaluate(async () => {
        await window.__academyStoryRecovery.seedEncounter({
            encounterId: 'story:s4e01-return-address',
            sceneId: 'scene:return-address:bounded-reply',
            attendeeIds: ['peter'],
        });
        await window.__academyStoryRecovery.openActivity(
            's4e02-map-of-claims',
            'activity:s4e02-map-of-claims-evidence-map',
        );
    });

    const activity = page.locator(`[data-activity-id="${mapActivityId}"]`);
    await activity.waitFor();
    assert.equal(await activity.locator('[data-story-practice-interaction="evidence-map"]').count(), 1);
    await activate(page, activity.locator('.academy-story-practice-submit'), scenario.input);
    await waitForSnapshot(page, snapshot => practiceOutcomes(snapshot.events, mapActivityId).join(',') === 'lapse');
    assert.equal(await activity.locator('[aria-invalid="true"]').count(), 9);
    assert.equal(await activity.locator('[aria-invalid="true"]').first().evaluate(
        element => element === document.activeElement,
    ), true);

    const answers = {
        'route-added': ['letter', 'stated', 'according-letter'],
        'older-ink': ['paper', 'observed', 'paper-shows'],
        'first-contributor': ['none', 'unknown', 'still-unknown'],
    };
    for (const [rowId, values] of Object.entries(answers)) {
        const selects = activity.locator(`[data-evidence-row="${rowId}"] select`);
        for (let index = 0; index < values.length; index += 1) {
            await selects.nth(index).selectOption(values[index]);
        }
    }
    await assertLayoutAndAccessibility(page, activity, scenario);
    await page.screenshot({ path: path.join(artifactDir, `${scenario.name}-evidence-map.png`), fullPage: true });
    await activate(page, activity.locator('.academy-story-practice-submit'), scenario.input);
    const beforeReload = await waitForSnapshot(page, snapshot =>
        practiceOutcomes(snapshot.events, mapActivityId).join(',') === 'lapse,pass');
    assert.equal(await page.locator(`[data-activity-id="${mapActivityId}"]`).count(), 0,
        `${scenario.name} map result must advance the story route`);
    assert.equal(beforeReload.events.filter(event => event.kind === 'review-scheduled'
        && event.provenance?.activity === mapActivityId).length, 1);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await bootProfile(page, profileKey, false);
    const afterReload = await snapshot(page);
    assert.deepEqual(afterReload.events, beforeReload.events, `${scenario.name} map reload must not duplicate evidence`);
    assert.equal(await page.locator('[data-story-practice-interaction="evidence-map"]').count(), 0);
    await page.evaluate(key => localStorage.removeItem(key), profileKey);
}

async function checkMiraReloads(page, scenario) {
    const profileKey = `academy-story-recovery:test:${scenario.name}:mira`;
    await bootProfile(page, profileKey, true);
    await page.evaluate(async episodeId => {
        await window.__academyStoryRecovery.seedEncounter({
            encounterId: 'story:s4e06-open-question',
            sceneId: 'scene:open-question:rehearsal',
            attendeeIds: ['alex'],
        });
        await window.__academyStoryRecovery.setSection(episodeId);
    }, journeyEpisodeId);

    assert.equal(await page.locator('[data-story-arc-id]').getAttribute('data-story-mode'), 'canonical');
    await advanceTo(page, '[data-line="message:journey:mira-returns"]', scenario.input);
    const beforeMiraReload = await snapshot(page);
    assert.deepEqual(practiceOutcomes(beforeMiraReload.events, journeyActivityId), []);
    assert.equal(encounterEvents(beforeMiraReload.events, miraEncounterId).length, 0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await bootProfile(page, profileKey, false);
    assert.equal(await page.locator('[data-story-arc-id]').getAttribute('data-story-mode'), 'canonical');
    await page.locator('[data-line="message:journey:mira-returns"]').waitFor();
    await advanceTo(page, `[data-activity-id="${journeyActivityId}"]`, scenario.input);
    const beforeWriting = await snapshot(page);
    assert.deepEqual(practiceOutcomes(beforeWriting.events, journeyActivityId), [], 'Mira dialogue must not create mastery');

    const activity = page.locator(`[data-activity-id="${journeyActivityId}"]`);
    await activity.locator('[data-story-written-field="alex"]').fill('来月から日本で働く。');
    await activity.locator('[data-story-written-field="aakash"]').fill('いつか撮り旅に行くかもしれない。');
    await activity.locator('[data-story-written-field="mira"]').fill('ここに残って、来週火曜からまた始める。');
    await assertLayoutAndAccessibility(page, activity, scenario);
    await page.screenshot({ path: path.join(artifactDir, `${scenario.name}-written-response.png`), fullPage: true });
    await activate(page, activity.locator('.academy-story-practice-submit'), scenario.input);
    await waitForSnapshot(page, snapshot => practiceOutcomes(snapshot.events, journeyActivityId).join(',') === 'pass');
    await finishEpisode(page, scenario.input);

    const afterMira = await waitForSnapshot(page, snapshot => encounterEvents(snapshot.events, miraEncounterId).length === 1);
    assert.deepEqual(encounterEvents(afterMira.events, miraEncounterId)[0].attendeeIds.toSorted(), ['aakash', 'alex', 'mira']);
    assert.equal(afterMira.events.filter(event => event.kind === 'scene-completed'
        && event.sceneId === 'scene:journey:non-comparative-futures').length, 1);
    assert.deepEqual(practiceOutcomes(afterMira.events, journeyActivityId), ['pass']);
    assert.equal(encounterEvents(afterMira.events, `story:${journeyEpisodeId}`).length, 0,
        `${scenario.name} dialogue and practice must not complete the episode`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await bootProfile(page, profileKey, false);
    await finishEpisode(page, scenario.input);
    const afterEventReload = await snapshot(page);
    assert.deepEqual(afterEventReload.events, afterMira.events, `${scenario.name} post-introduction reload must be read-only`);

    await activate(page, page.locator('.academy-story-next'), scenario.input);
    const completed = await waitForSnapshot(page, state => encounterEvents(state.events, `story:${journeyEpisodeId}`).length === 1);
    await page.evaluate(async episodeId => window.__academyStoryRecovery.setSection(episodeId), journeyEpisodeId);
    assert.equal(await page.locator('[data-story-arc-id]').getAttribute('data-story-mode'), 'chronological-replay');
    await finishEpisode(page, scenario.input);
    const afterReplay = await snapshot(page);
    assert.deepEqual(afterReplay.events, completed.events, `${scenario.name} chronological replay must not mutate canonical evidence`);
    await page.evaluate(key => localStorage.removeItem(key), profileKey);
}

async function bootProfile(page, profileKey, reset) {
    await page.evaluate(async ({ profileKey: key, resetProfile }) => {
        if (resetProfile) localStorage.removeItem(key);
        const stored = JSON.parse(localStorage.getItem(key) ?? '{}');
        await Promise.all([
            import('/src/reader/styles.css'),
            import('/src/academy/styles/tokens.css'),
            import('/src/academy/styles/shell.css'),
            import('/src/academy/styles/tooltip.css'),
            import('/src/academy/styles/screens.css'),
            import('/src/academy/styles/activity.css'),
            import('/src/academy/styles/world.css'),
            import('/src/academy/styles/home-world.css'),
            import('/src/academy/styles/park-world.css'),
            import('/src/academy/styles/konbini-world.css'),
            import('/src/academy/styles/station-world.css'),
            import('/src/academy/styles/tube-platform-world.css'),
            import('/src/academy/styles/bookshop-world.css'),
            import('/src/academy/styles/japan-centre-world.css'),
            import('/src/academy/styles/profile-sync.css'),
            import('/src/academy/styles/class-board.css'),
            import('/src/academy/styles/vn-performance.css'),
            import('/src/academy/styles/vn-stage.css'),
            import('/src/academy/styles/story-vn.css'),
            import('/src/academy/styles/replay-stream.css'),
            import('/src/academy/styles/lesson-zero-proof.css'),
            import('/src/academy/styles/aakash-directions.css'),
            import('/src/academy/styles/class-path.css'),
            import('/src/academy/styles/lesson-overview.css'),
            import('/src/academy/styles/primary-purpose.css'),
            import('/src/academy/styles/speaker-staging.css'),
        ]);
        const [recordModule, evidenceModule, flowModule, runtimeModule, runnerModule] = await Promise.all([
            import('/src/academy/domain/learner-record.ts'),
            import('/src/academy/evidence/learner-evidence.ts'),
            import('/src/academy/routing/world-flow.ts'),
            import('/src/academy/content/story-runtime.ts'),
            import('/src/academy/content/story-runner.ts'),
        ]);
        const repository = recordModule.createMemoryLearnerEventRepository(stored.events ?? []);
        const evidence = evidenceModule.createLearnerEvidence(repository, {
            async ingest() {},
            async due() { return []; },
            async rate() {},
        });
        await evidence.initialize();
        let checkpoint = stored.checkpoint ?? {
            schemaVersion: 2,
            route: 'story',
            routeHistory: [{ route: 'campus' }],
            presentationMode: 'story',
            selectedBand: 'n1',
            updatedAt: 1,
        };
        const persist = async () => {
            localStorage.setItem(key, JSON.stringify({ events: await evidence.history(), checkpoint }));
        };
        const writeMethods = new Set(['recordEncounter', 'recordAuthoredStoryPractice']);
        const routeEvidence = new Proxy(evidence, {
            get(target, property) {
                const value = Reflect.get(target, property, target);
                if (typeof value !== 'function') return value;
                return async (...args) => {
                    const result = await value.apply(target, args);
                    if (writeMethods.has(property)) await persist();
                    return result;
                };
            },
        });
        const shell = {
            screen: document.createElement('main'),
            replace(view) { document.body.replaceChildren(view); },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        };
        const flow = flowModule.createWorldFlow({
            evidence: routeEvidence,
            pronunciation: {},
            audio: { playSfx() {} },
        });
        const render = async () => {
            await flow.render('story', {
                language: 'en',
                checkpoint,
                projection: evidence.projection,
                shell,
                async go(route, update = {}) {
                    checkpoint = { ...checkpoint, ...update, route, updatedAt: checkpoint.updatedAt + 1 };
                    await persist();
                },
                async back() {},
                async save(update) {
                    checkpoint = { ...checkpoint, ...update, updatedAt: checkpoint.updatedAt + 1 };
                    await persist();
                },
            });
        };
        window.__academyStoryRecovery = {
            async seedEncounter(encounter) {
                await routeEvidence.recordEncounter(encounter);
            },
            async openActivity(chapterId, activityId) {
                const arc = runtimeModule.loadStoryRuntime().playableArc(chapterId);
                const binding = arc?.curriculum.activities.find(candidate => candidate.exerciseId === activityId);
                if (!arc || !binding) throw new Error(`Missing story activity ${activityId}.`);
                checkpoint = {
                    ...checkpoint,
                    sectionId: runnerModule.serializeStoryCursor({
                        version: 1,
                        arcId: arc.id,
                        sceneId: binding.sceneId,
                        nodeId: binding.nodeId,
                        choices: {},
                    }),
                    updatedAt: checkpoint.updatedAt + 1,
                };
                await persist();
                await render();
            },
            async setSection(sectionId) {
                checkpoint = { ...checkpoint, sectionId, updatedAt: checkpoint.updatedAt + 1 };
                await persist();
                await render();
            },
            async snapshot() {
                return { checkpoint, events: await evidence.history() };
            },
        };
        document.body.replaceChildren();
        await render();
    }, { profileKey, resetProfile: reset });
}

async function activate(page, locator, input) {
    await locator.waitFor();
    await locator.scrollIntoViewIfNeeded();
    if (input === 'touch') {
        const box = await locator.boundingBox();
        assert.ok(box, 'Touch target must have a bounding box.');
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    } else {
        await locator.focus();
        await locator.press('Enter');
    }
    await page.waitForTimeout(60);
}

async function advanceTo(page, selector, input) {
    for (let guard = 0; guard < 120; guard += 1) {
        if (await page.locator(selector).count()) return;
        const choice = page.locator('.academy-story-vn-choice').first();
        const next = page.locator('.academy-vn-primary-action, .academy-story-activity-continue').first();
        if (await choice.count()) await activate(page, choice, input);
        else if (await next.count()) await activate(page, next, input);
        else throw new Error(`Story stalled before ${selector}`);
    }
    const state = await page.evaluate(() => ({
        line: document.querySelector('[data-line]')?.getAttribute('data-line'),
        scene: document.querySelector('[data-story-arc-id]')?.getAttribute('data-story-scene'),
        moment: document.querySelector('[data-story-arc-id]')?.getAttribute('data-story-moment'),
        buttons: [...document.querySelectorAll('button')].map(button => ({
            className: button.className,
            disabled: button.disabled,
            text: button.textContent,
            data: { ...button.dataset },
        })),
        text: document.body.textContent?.slice(0, 500),
    }));
    throw new Error(`Story did not reach ${selector}: ${JSON.stringify(state)}`);
}

async function finishEpisode(page, input) {
    for (let guard = 0; guard < 160; guard += 1) {
        if (await page.locator('.academy-story-next').count()) return;
        const choice = page.locator('.academy-story-vn-choice').first();
        const next = page.locator('.academy-vn-primary-action, .academy-story-activity-continue').first();
        if (await choice.count()) await activate(page, choice, input);
        else if (await next.count()) await activate(page, next, input);
        else throw new Error('Story stalled before episode completion.');
    }
    throw new Error('Story did not reach episode completion.');
}

async function snapshot(page) {
    return page.evaluate(() => window.__academyStoryRecovery.snapshot());
}

async function waitForSnapshot(page, predicate) {
    for (let guard = 0; guard < 100; guard += 1) {
        const state = await snapshot(page);
        if (predicate(state)) return state;
        await page.waitForTimeout(20);
    }
    throw new Error('Timed out waiting for Academy story evidence.');
}

function practiceOutcomes(events, activityId) {
    return events.flatMap(event => event.kind === 'learning-evidence-recorded' && event.activityId === activityId
        ? [event.outcome]
        : []);
}

function encounterEvents(events, encounterId) {
    return events.filter(event => event.kind === 'characters-encountered' && event.encounterId === encounterId);
}

async function assertLayoutAndAccessibility(page, activity, scenario) {
    const pageOverflow = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll('body *')].flatMap(element => {
            const rect = element.getBoundingClientRect();
            return rect.right > window.innerWidth + 1 || rect.left < -1
                ? [{ tag: element.tagName, className: element.className, left: rect.left, right: rect.right, width: rect.width }]
                : [];
        }).slice(0, 12),
    }));
    assert.ok(pageOverflow.scrollWidth <= pageOverflow.innerWidth,
        `${scenario.name} page must not overflow: ${JSON.stringify(pageOverflow)}`);
    const box = await activity.boundingBox();
    assert.ok(box && box.x >= -1 && box.x + box.width <= scenario.width + 1,
        `${scenario.name} interaction fits horizontally: ${JSON.stringify(box)}`);
    const geometry = await activity.locator('select, textarea, button').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    }));
    geometry.forEach(rect => {
        assert.ok(rect.width >= 1 && rect.height >= 1 && rect.left >= -1 && rect.right <= scenario.width + 1,
            `${scenario.name} control must be visible and unclipped: ${JSON.stringify(rect)}`);
    });
    for (let left = 0; left < geometry.length; left += 1) {
        for (let right = left + 1; right < geometry.length; right += 1) {
            const a = geometry[left];
            const b = geometry[right];
            const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            assert.ok(overlapWidth <= 1 || overlapHeight <= 1,
                `${scenario.name} controls must not overlap: ${JSON.stringify({ a, b })}`);
        }
    }
    if (scenario.name === 'mobile') {
        const fontSizes = await activity.locator('select, textarea').evaluateAll(elements => elements.map(
            element => Number.parseFloat(getComputedStyle(element).fontSize),
        ));
        assert.equal(fontSizes.every(size => size >= 16), true);
    }
    const results = await new AxeBuilder({ page }).include('[data-story-practice-interaction]').analyze();
    const blocking = results.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => violation.id), []);
}
