import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.BLANK_ATLAS_SCREENSHOTS ?? 'qa-artifacts/blank-atlas');
const chapterId = 's1e01-the-blank-atlas';
const arcId = `arc:${chapterId}`;
const firstActivityId = 'activity:lesson-zero-greet-rie';
const viewports = [
    { name: 'phone', width: 390, height: 844, input: 'touch' },
    { name: 'portrait-tablet', width: 1024, height: 1366, input: 'touch' },
    { name: 'desktop', width: 1440, height: 900, input: 'keyboard' },
];
const signatures = [
    ['scene:blank-atlas:arrival-greetings', 'U001'],
    ['scene:blank-atlas:sound-script-map', 'U002'],
    ['scene:blank-atlas:classroom-survival', 'U003'],
    ['scene:blank-atlas:sentence-frames', 'U004'],
    ['scene:blank-atlas:useful-vocabulary', 'U005'],
    ['scene:blank-atlas:mission-sound', 'U006'],
    ['scene:blank-atlas:mission-text', 'U007'],
    ['scene:blank-atlas:mission-speaking', 'U008'],
    ['scene:blank-atlas:reading-writing', 'U009'],
    ['scene:blank-atlas:transfer', 'U010'],
    ['scene:blank-atlas:close', 'U011'],
];
const missionOptions = {
    'scene:blank-atlas:mission-sound': 'option:blank-atlas:mission-sound',
    'scene:blank-atlas:mission-text': 'option:blank-atlas:mission-text',
    'scene:blank-atlas:mission-speaking': 'option:blank-atlas:mission-speaking',
};
const forbiddenCopy = /Moodle|source package|registered practice|activity:lesson-zero|Blank Route|route note|fiction boundary|provenance/iu;

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of viewports) await verifyJourney(browser, viewport);
    console.log('The Blank Atlas passed its real Chapter 1 handoff, persistence, completion, replay, scene-prop, responsive, and Axe proof.');
} finally {
    await browser.close();
}

async function verifyJourney(browser, viewport) {
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: 'en-GB',
        reducedMotion: 'reduce',
        hasTouch: viewport.input === 'touch',
    });
    const page = await context.newPage();
    const consoleProblems = [];
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') {
            consoleProblems.push(`${message.type()}: ${message.text()}`);
        }
    });
    page.on('pageerror', error => consoleProblems.push(`pageerror: ${error.message}`));

    const databaseName = `yomu-academy-blank-atlas-${viewport.name}`;
    await assertServer(page);
    await mountProof(page, databaseName, true);

    const arc = page.locator(`[data-story-arc-id="${arcId}"]`);
    await arc.waitFor();
    assert.equal(await arc.getAttribute('data-story-scene'), 'scene:blank-atlas:arrival-greetings');
    assert.equal(await page.locator('[data-story-arc-id="arc:bridge:opening-arrival"]').count(), 0,
        `${viewport.name} Chapter 1 must not replay the one-time arrival`);
    await advanceTo(page, '.academy-vn-translation', viewport.input);
    assert.equal(await page.locator('.academy-vn-translation').isVisible(), true,
        `${viewport.name} foundation dialogue must show meaning immediately`);
    await assertSurface(page, viewport, 'opening');
    await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-01-opening.png`), fullPage: true });

    const beforeReload = await readProof(page);
    assert.match(beforeReload.checkpoint.sectionId ?? '', /^story-run:v1:/u);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await mountProof(page, databaseName, false);
    await page.locator(`[data-story-arc-id="${arcId}"]`).waitFor();
    const afterReload = await readProof(page);
    assert.equal(afterReload.checkpoint.sectionId, beforeReload.checkpoint.sectionId,
        `${viewport.name} must cold-restore the exact Chapter 1 beat`);

    await advanceTo(page, `[data-activity-id="${firstActivityId}"]`, viewport.input);
    const handoff = page.locator(`[data-activity-id="${firstActivityId}"]`);
    assert.equal(await handoff.getAttribute('data-activity-gate'), 'missing');
    assert.doesNotMatch(await handoff.innerText(), /activity:|registered/iu,
        `${viewport.name} handoff must use learner-facing language`);
    await assertSurface(page, viewport, 'first activity handoff');
    await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-02-handoff.png`), fullPage: true });
    await activate(handoff.locator('.academy-story-open-activity'), viewport.input);
    const sourceRoute = await waitForSnapshot(page, state => state.checkpoint.route === 'source-activity');
    assert.equal(sourceRoute.checkpoint.lessonId, 'lesson:foundation-00');
    assert.equal(sourceRoute.checkpoint.activityId, firstActivityId);
    await page.locator('[data-academy-route="source-activity"]').waitFor();

    await page.evaluate(() => window.__blankAtlasProof.passAndReturn());
    await page.locator(`[data-activity-id="${firstActivityId}"][data-activity-gate="passed"]`).waitFor();
    assert.equal(await page.locator(`[data-activity-id="${firstActivityId}"] .academy-story-activity-continue`).count(), 1);
    await finishChapter(page, viewport.input);
    await assertSurface(page, viewport, 'chapter completion');
    await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-03-complete.png`), fullPage: true });
    await activate(page.locator('.academy-story-next'), viewport.input);
    const completed = await waitForSnapshot(page, state => chapterEncounters(state.events).length === 1);
    assert.equal(chapterEncounters(completed.events).length, 1,
        `${viewport.name} Chapter 1 completion must be written exactly once`);

    await page.evaluate(id => window.__blankAtlasProof.reopen(id), chapterId);
    await page.locator(`[data-story-arc-id="${arcId}"][data-story-mode="chronological-replay"]`).waitFor();
    const replayStart = await readProof(page);
    assert.deepEqual(replayStart.events, completed.events, `${viewport.name} opening replay must be read-only`);

    for (const [sceneId, signature] of signatures) {
        await page.evaluate(({ sceneId: id, optionId }) => window.__blankAtlasProof.openScene(id, optionId), {
            sceneId,
            optionId: missionOptions[sceneId],
        });
        const prop = page.locator(`[data-scene-signature="${signature}"]`);
        await prop.waitFor();
        assert.equal(await prop.getAttribute('data-scene-id'), sceneId);
        await exerciseProp(page, sceneId, viewport.input);
        await assertSurface(page, viewport, signature);
        if (viewport.name === 'phone' || ['U001', 'U007', 'U009', 'U011'].includes(signature)) {
            await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-${signature}.png`), fullPage: true });
        }
    }

    const afterScenes = await readProof(page);
    assert.deepEqual(afterScenes.events, completed.events,
        `${viewport.name} chronological scene inspection must not mutate canonical evidence`);
    for (const theme of [
        'opening.invitation',
        'classroom.focus',
        'world.lab',
        'library.quiet',
        'unlock.world',
        'ending.reflective',
    ]) {
        assert.ok(afterScenes.audio.themes.includes(theme), `${viewport.name} must play ${theme}`);
    }
    for (const cue of ['scene.advance', 'page.turn', 'menu.confirm', 'chapter.complete']) {
        assert.ok(afterScenes.audio.sfx.includes(cue), `${viewport.name} must play ${cue}`);
    }
    if (viewport.name === 'desktop') await verifyChapterVoiceMatrix(page);
    assert.deepEqual(consoleProblems, [], `${viewport.name} browser console must stay clean`);
    await context.close();
}

async function verifyChapterVoiceMatrix(page) {
    const catalogResponse = await page.request.get(`${baseUrl}/academy/audio/story-voice-playback.json`);
    assert.equal(catalogResponse.ok(), true, 'Chapter 1 voice catalog must be reachable in the browser proof');
    const catalog = await catalogResponse.json();
    const entries = catalog.entries.filter(entry => entry.lineId.startsWith('line:blank-atlas:'));
    assert.equal(entries.length, 38, 'Chapter 1 must publish all 19 lines at foundation and N5');
    assert.equal(new Set(entries.map(entry => `${entry.lineId}::${entry.band}`)).size, 38,
        'Chapter 1 voice identities must be unique');

    for (const entry of entries) {
        const mediaResponse = await page.request.get(`${baseUrl}${entry.url}`);
        assert.equal(mediaResponse.ok(), true, `${entry.lineId} ${entry.band} media must return successfully`);
        assert.match(mediaResponse.headers()['content-type'] ?? '', /^audio\//u,
            `${entry.lineId} ${entry.band} must have an audio content type`);
        assert.equal((await mediaResponse.body()).byteLength, entry.bytes,
            `${entry.lineId} ${entry.band} media bytes must match the locked catalog`);

        await page.evaluate(({ lineId, band }) => window.__blankAtlasProof.openLine(lineId, band), entry);
        const stage = page.locator(`.academy-story-vn-stage [data-line="${entry.lineId}"]`);
        await stage.waitFor();
        await page.waitForFunction(() => (
            document.querySelector('.academy-story-vn-stage')?.getAttribute('data-voice-available') === 'true'
        ));
        assert.equal(await page.locator('.academy-vn-japanese').textContent(), entry.japanese,
            `${entry.lineId} ${entry.band} must bind the catalog's exact Japanese`);
        await page.locator('.academy-vn-voice-replay').click();
        await page.waitForTimeout(250);
        const playbackStatus = await page.locator('.academy-story-vn-stage').getAttribute('data-voice-status');
        assert.ok(playbackStatus === 'playing' || playbackStatus === 'ended',
            `${entry.lineId} ${entry.band} replay entered ${playbackStatus}`);
    }
}

async function assertServer(page) {
    const response = await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
}

async function mountProof(page, databaseName, resetDatabase) {
    await page.evaluate(async ({ databaseName: name, resetDatabase: reset, chapterId: episodeId }) => {
        document.body.replaceChildren();
        await import('/src/academy/entrypoint.ts');
        if (reset) {
            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error(`Blank Atlas proof database is blocked: ${name}`));
            });
        }
        const [
            { openAcademyPersistence },
            { createLearnerEvidence },
            { createWorldFlow },
            { createLessonFlow },
            { transitionAcademyRoute },
            { loadStoryRuntime },
            { serializeStoryCursor },
        ] = await Promise.all([
            import('/src/academy/persistence/indexeddb.ts'),
            import('/src/academy/evidence/learner-evidence.ts'),
            import('/src/academy/routing/world-flow.ts'),
            import('/src/academy/routing/lesson-flow.ts'),
            import('/src/academy/routing/route-history.ts'),
            import('/src/academy/content/story-runtime.ts'),
            import('/src/academy/content/story-runner.ts'),
        ]);
        const persistence = await openAcademyPersistence(indexedDB, name);
        const evidence = createLearnerEvidence(persistence.events, {
            async ingest() {},
            async due() { return []; },
            async rate() {},
        });
        await evidence.initialize();
        if (reset) {
            await evidence.saveProfile({
                displayName: 'Mina',
                learningReason: 'Speak with friends',
                portraitId: 'quality-4',
            });
            await evidence.completeRieIntroduction();
            await evidence.chooseCurriculumEntry({ route: 'lesson-zero' });
            await evidence.recordEncounter({
                encounterId: 'story:bridge:opening-arrival:scene:scene:opening-arrival:fiction-notice',
                sceneId: 'scene:opening-arrival:fiction-notice',
                attendeeIds: ['rie'],
            });
            await persistence.checkpoint.save({
                schemaVersion: 2,
                route: 'story',
                routeHistory: [{ route: 'campus', worldPlace: 'courtyard', lessonId: 'lesson:foundation-00' }],
                presentationMode: 'story',
                lessonId: 'lesson:foundation-00',
                sectionId: episodeId,
                updatedAt: 1,
            });
        }
        let checkpoint = await persistence.checkpoint.load();
        if (!checkpoint) throw new Error('Blank Atlas proof checkpoint was not saved.');
        localStorage.setItem('yomu:academy:language:v1', 'en');
        const root = document.createElement('main');
        root.id = 'yomu-academy';
        root.className = 'academy-root';
        document.body.replaceChildren(root);
        const audio = {
            state: 'ready',
            theme: 'silence',
            themes: [],
            sfx: [],
            settings: { muted: false, volumes: { music: 0.7, ambience: 0.65, lesson: 1, sfx: 0.8 } },
            async setTheme(theme) { this.theme = theme; this.themes.push(theme); },
            beginExternalLesson() { return () => {}; },
            onEvent() { return () => {}; },
            playSfx(cue) { this.sfx.push(cue); },
        };
        const pronunciation = { async play() { return { dispose() {} }; } };
        const shell = {
            screen: root,
            replace(view) {
                root.firstElementChild?.dispatchEvent(new CustomEvent('academy:dispose'));
                root.replaceChildren(view);
            },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        };
        const worldFlow = createWorldFlow({ evidence, pronunciation, audio });
        const lessonFlow = createLessonFlow({ evidence, pronunciation, kanjiWriting: {}, audio });
        const context = () => ({
            language: 'en',
            checkpoint,
            projection: evidence.projection,
            shell,
            async go(route, update = {}) {
                checkpoint = {
                    ...transitionAcademyRoute(checkpoint, { kind: 'push', route, context: update }),
                    schemaVersion: 2,
                    updatedAt: Date.now(),
                };
                await persistence.checkpoint.save(checkpoint);
                await render();
            },
            async back() {
                checkpoint = {
                    ...transitionAcademyRoute(checkpoint, { kind: 'back' }),
                    schemaVersion: 2,
                    updatedAt: Date.now(),
                };
                await persistence.checkpoint.save(checkpoint);
                await render();
            },
            async save(update) {
                checkpoint = { ...checkpoint, ...update, updatedAt: Date.now() };
                await persistence.checkpoint.save(checkpoint);
            },
        });
        const render = async () => {
            const flow = checkpoint.route === 'source-activity' || checkpoint.route === 'lesson-overview'
                ? lessonFlow
                : worldFlow;
            const handled = await flow.render(checkpoint.route, context());
            if (!handled) throw new Error(`Blank Atlas proof flow did not handle ${checkpoint.route}.`);
        };
        const arc = loadStoryRuntime().playableArc(episodeId);
        if (!arc) throw new Error('The Blank Atlas playable arc is unavailable.');
        const passActivities = async () => {
            const existing = new Set((await evidence.history()).flatMap(event => (
                event.kind === 'learning-evidence-recorded' && event.outcome === 'pass'
                    ? [event.activityId]
                    : []
            )));
            for (const activity of arc.curriculum.activities) {
                if (existing.has(activity.exerciseId)) continue;
                const conceptId = `concept:proof:${activity.exerciseId}`;
                await evidence.recordAuthoredStoryPractice({
                    activityId: activity.exerciseId,
                    chapterId: episodeId,
                    interaction: 'choice',
                    skill: 'reading',
                    action: 'recall',
                    conceptIds: [conceptId],
                    reviewSeed: {
                        id: `review:proof:${activity.exerciseId}`,
                        conceptId,
                        reason: 'new-learning',
                        content: { expression: activity.exerciseId, meanings: ['Chapter 1 browser proof'] },
                    },
                }, 'pass');
            }
        };
        window.__blankAtlasProof = {
            async snapshot() {
                return {
                    checkpoint: structuredClone(checkpoint),
                    events: structuredClone(await evidence.history()),
                    audio: structuredClone({ theme: audio.theme, themes: audio.themes, sfx: audio.sfx }),
                };
            },
            async passAndReturn() {
                await passActivities();
                checkpoint = {
                    ...checkpoint,
                    route: 'story',
                    lessonId: 'lesson:foundation-00',
                    activityId: undefined,
                    selectedFork: undefined,
                    presentationMode: 'story',
                    selectedBand: undefined,
                    updatedAt: Date.now(),
                };
                await persistence.checkpoint.save(checkpoint);
                await render();
            },
            async reopen(id) {
                checkpoint = {
                    ...checkpoint,
                    route: 'story',
                    sectionId: id,
                    lessonId: 'lesson:foundation-00',
                    activityId: undefined,
                    presentationMode: 'story',
                    selectedBand: undefined,
                    updatedAt: Date.now(),
                };
                await persistence.checkpoint.save(checkpoint);
                await render();
            },
            async openScene(sceneId, optionId) {
                const scene = arc.scene(sceneId);
                const node = sceneId === 'scene:blank-atlas:reading-writing'
                    ? scene?.nodes.find(candidate => candidate.id === 'node:blank-atlas:card-turns-over')
                    : scene?.nodes[0];
                if (!scene || !node) throw new Error(`Missing Blank Atlas scene ${sceneId}.`);
                checkpoint = {
                    ...checkpoint,
                    route: 'story',
                    sectionId: serializeStoryCursor({
                        version: 1,
                        arcId: arc.id,
                        sceneId,
                        nodeId: node.id,
                        choices: optionId ? { 'choice:blank-atlas:mission': optionId } : {},
                    }),
                    lessonId: 'lesson:foundation-00',
                    activityId: undefined,
                    presentationMode: 'story',
                    selectedBand: undefined,
                    updatedAt: Date.now(),
                };
                await persistence.checkpoint.save(checkpoint);
                await render();
            },
            async openLine(lineId, band) {
                const scene = arc.scenes.find(candidate => candidate.nodes.some(node => node.id === lineId));
                if (!scene) throw new Error(`Missing Blank Atlas line ${lineId}.`);
                checkpoint = {
                    ...checkpoint,
                    route: 'story',
                    sectionId: serializeStoryCursor({
                        version: 1,
                        arcId: arc.id,
                        sceneId: scene.id,
                        nodeId: lineId,
                        choices: { 'choice:blank-atlas:mission': 'option:blank-atlas:mission-sound' },
                    }),
                    lessonId: 'lesson:foundation-00',
                    activityId: undefined,
                    presentationMode: 'story',
                    selectedBand: band === 'foundation' ? undefined : band,
                    updatedAt: Date.now(),
                };
                await persistence.checkpoint.save(checkpoint);
                await render();
            },
        };
        await render();
    }, { databaseName, resetDatabase, chapterId });
}

async function finishChapter(page, input) {
    for (let guard = 0; guard < 180; guard += 1) {
        if (await page.locator('.academy-story-next').count()) return;
        const missionChoice = page.locator('[data-story-option-id="option:blank-atlas:mission-sound"]');
        const choice = page.locator('.academy-story-vn-choice').first();
        const next = page.locator('.academy-story-activity-continue, .academy-vn-primary-action').first();
        if (await missionChoice.count()) await activate(missionChoice, input);
        else if (await choice.count()) await activate(choice, input);
        else if (await next.count()) await activate(next, input);
        else throw new Error(`The Blank Atlas stalled: ${JSON.stringify(await currentMoment(page))}`);
    }
    throw new Error('The Blank Atlas did not reach completion within 180 actions.');
}

async function advanceTo(page, selector, input) {
    for (let guard = 0; guard < 120; guard += 1) {
        if (await page.locator(selector).count()) return;
        const choice = page.locator('.academy-story-vn-choice').first();
        const next = page.locator('.academy-story-activity-continue, .academy-vn-primary-action').first();
        if (await choice.count()) await activate(choice, input);
        else if (await next.count()) await activate(next, input);
        else throw new Error(`The Blank Atlas stalled before ${selector}: ${JSON.stringify(await currentMoment(page))}`);
    }
    throw new Error(`The Blank Atlas did not reach ${selector} within 120 actions.`);
}

async function currentMoment(page) {
    return page.evaluate(() => ({
        scene: document.querySelector('[data-story-arc-id]')?.getAttribute('data-story-scene'),
        moment: document.querySelector('[data-story-arc-id]')?.getAttribute('data-story-moment'),
        line: document.querySelector('[data-line]')?.getAttribute('data-line'),
        text: document.body.innerText.slice(0, 400),
    }));
}

async function exerciseProp(page, sceneId, input) {
    const interaction = sceneId === 'scene:blank-atlas:mission-text'
        ? ['.academy-note-inspect', '.academy-text-mission-prop', 'inspected']
        : sceneId === 'scene:blank-atlas:mission-speaking'
            ? ['.academy-door-open', '.academy-speaking-door-prop', 'open']
            : sceneId === 'scene:blank-atlas:reading-writing'
                ? ['.academy-card-flip', '.academy-public-card-prop', 'face']
                : undefined;
    if (!interaction) return;
    const [buttonSelector, rootSelector, attribute] = interaction;
    const control = page.locator(buttonSelector);
    if (!await control.count()) return;
    await activate(control, input);
    const value = await page.locator(rootSelector).getAttribute(`data-${attribute}`);
    assert.ok(value === 'true' || value === 'public', `${sceneId} interaction must visibly change its prop`);
}

async function assertSurface(page, viewport, phase) {
    const surface = page.locator('.academy-story-screen');
    assert.doesNotMatch(await surface.innerText(), forbiddenCopy,
        `${viewport.name} ${phase} must not expose production language`);
    await decodeImages(page, '.academy-story-screen');
    await assertResponsiveGeometry(page, viewport, phase);
    const axe = await new AxeBuilder({ page }).include('.academy-story-screen').analyze();
    const blocking = axe.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
    })), [], `${viewport.name} ${phase} must have no serious or critical Axe violations`);
}

async function assertResponsiveGeometry(page, viewport, phase) {
    const geometry = await page.evaluate(() => {
        const bounds = node => {
            const rect = node?.getBoundingClientRect();
            return rect ? {
                left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                width: rect.width, height: rect.height,
            } : null;
        };
        const stage = document.querySelector('.academy-story-vn-stage');
        const object = stage?.querySelector('.academy-vn-object-slot:not([data-empty="true"])');
        const dialogue = stage?.querySelector('.academy-vn-dialogue:not([hidden])');
        return {
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            stage: bounds(stage),
            object: bounds(object),
            dialogue: bounds(dialogue),
            controls: [...(stage?.querySelectorAll('button:not([hidden]):not(:disabled)') ?? [])]
                .filter(node => node.getClientRects().length > 0)
                .map(bounds),
        };
    });
    assert.ok(geometry.documentWidth <= viewport.width,
        `${viewport.name} ${phase} must not overflow horizontally (${geometry.documentWidth}/${viewport.width})`);
    for (const [name, rect] of [['stage', geometry.stage], ['object', geometry.object], ['dialogue', geometry.dialogue]]) {
        if (!rect) continue;
        assert.ok(rect.left >= -1 && rect.right <= geometry.viewport.width + 1,
            `${viewport.name} ${phase} ${name} must fit: ${JSON.stringify(rect)}`);
    }
    if (geometry.object && geometry.dialogue) {
        assert.ok(geometry.object.bottom <= geometry.dialogue.top + 2,
            `${viewport.name} ${phase} prop must clear dialogue: ${JSON.stringify({ object: geometry.object, dialogue: geometry.dialogue })}`);
    }
    for (const [index, control] of geometry.controls.entries()) {
        assert.ok(control.left >= -1 && control.right <= geometry.viewport.width + 1,
            `${viewport.name} ${phase} control ${index + 1} must fit: ${JSON.stringify(control)}`);
        if (viewport.input === 'touch') {
            assert.ok(control.width >= 44 && control.height >= 44,
                `${viewport.name} ${phase} control ${index + 1} must be a 44px target: ${JSON.stringify(control)}`);
        }
    }
}

async function decodeImages(page, selector) {
    const images = page.locator(`${selector} img`);
    const count = await images.count();
    for (let index = 0; index < count; index += 1) {
        await images.nth(index).evaluate(async image => {
            try { await image.decode(); } catch { /* dimensions below remain the proof */ }
        });
    }
    const dimensions = await images.evaluateAll(nodes => nodes.map(image => ({
        src: image.currentSrc || image.src,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
    })));
    assert.equal(dimensions.every(image => image.naturalWidth > 0 && image.naturalHeight > 0), true,
        `${selector} must not contain broken art: ${JSON.stringify(dimensions)}`);
}

async function readProof(page) {
    return page.evaluate(() => window.__blankAtlasProof.snapshot());
}

async function waitForSnapshot(page, predicate) {
    for (let guard = 0; guard < 120; guard += 1) {
        const state = await readProof(page);
        if (predicate(state)) return state;
        await page.waitForTimeout(25);
    }
    throw new Error('Timed out waiting for Blank Atlas evidence.');
}

function chapterEncounters(events) {
    return events.filter(event => event.kind === 'characters-encountered' && event.encounterId === `story:${chapterId}`);
}

async function activate(locator, input) {
    await locator.waitFor();
    await locator.scrollIntoViewIfNeeded();
    if (input === 'touch') await locator.tap();
    else await locator.click();
    await locator.page().waitForTimeout(45);
}
