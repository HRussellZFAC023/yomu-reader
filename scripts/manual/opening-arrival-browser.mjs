import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.ARRIVAL_SCREENSHOTS ?? 'qa-artifacts/opening-arrival');
const viewports = [
    { name: 'phone', width: 390, height: 844, input: 'touch' },
    { name: 'portrait-tablet', width: 1024, height: 1366, input: 'touch' },
    { name: 'desktop', width: 1440, height: 900, input: 'keyboard' },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of viewports) await verifyJourney(viewport);
    console.log('Opening arrival passed its persisted start-to-courtyard journey on phone, portrait tablet, and desktop.');
} finally {
    await browser.close();
}

async function verifyJourney(viewport) {
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: 'en-GB',
        reducedMotion: 'reduce',
        hasTouch: viewport.input === 'touch',
    });
    const page = await context.newPage();
    const consoleProblems = [];
    const voiceResponses = [];
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') {
            consoleProblems.push(`${message.type()}: ${message.text()}`);
        }
    });
    page.on('pageerror', error => consoleProblems.push(`pageerror: ${error.message}`));
    page.on('response', response => {
        if (/\/academy\/audio\/story-lines\/.*\.opus(?:\?|$)/u.test(response.url())) {
            voiceResponses.push({ url: response.url(), status: response.status() });
        }
    });

    const databaseName = `yomu-academy-opening-arrival-${viewport.name}`;
    await assertServer(page);
    await mountProof(page, databaseName, true);

    const start = page.locator('.academy-start-screen[data-academy-route="start"]');
    await start.waitFor();
    await activate(start.locator('[data-start-route="lesson-zero"]'), viewport.input);
    await page.locator('.academy-story-package-screen').waitFor();
    await decodeImages(page, '.academy-story-package-screen');

    const arc = page.locator('[data-story-arc-id="arc:bridge:opening-arrival"]');
    assert.equal(await arc.getAttribute('data-story-scene'), 'scene:opening-arrival:gate');
    assert.equal(await arc.getAttribute('data-story-moment'), 'stage');
    await assertArrivalCopy(page, viewport, 'first image');
    await assertResponsiveGeometry(page, viewport, 'first image');
    await assertAccessible(page, '.academy-story-package-screen');
    await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-01-gate.png`), fullPage: true });

    await advanceUntil(page, viewport.input, moment => moment.lineId === 'line:opening-arrival:rie-evening');
    try {
        await page.waitForFunction(() => document.querySelector('.academy-story-vn-stage')?.getAttribute('data-voice-available') === 'true');
    } catch (error) {
        const diagnostic = await page.evaluate(async () => ({
            line: document.querySelector('.academy-vn-dialogue')?.getAttribute('data-line'),
            japanese: document.querySelector('.academy-vn-japanese')?.textContent,
            voiceAvailable: document.querySelector('.academy-story-vn-stage')?.getAttribute('data-voice-available'),
            voiceStatus: document.querySelector('.academy-story-vn-stage')?.getAttribute('data-voice-status'),
            catalog: await fetch('/academy/audio/story-voice-playback.json').then(response => response.json()),
        }));
        throw new Error(`${viewport.name} welcome voice did not resolve: ${JSON.stringify({ diagnostic, consoleProblems })}`, { cause: error });
    }
    assert.equal(await page.locator('.academy-vn-speaker').textContent(), 'Rie-sensei');
    assert.equal(await page.locator('.academy-vn-japanese').textContent(), 'こんばんは。よむアカデミーへようこそ。');
    assert.equal(await page.locator('.academy-vn-translation').textContent(), 'Good evening. Welcome to Yomu Academy.');
    assert.equal(await page.locator('.academy-vn-translation').isVisible(), true,
        `${viewport.name} zero-kana arrival must show immediate meaning`);
    await decodeImages(page, '.academy-story-package-screen');
    await assertResponsiveGeometry(page, viewport, 'Rie welcome');
    await assertAccessible(page, '.academy-story-package-screen');
    await page.locator('.academy-vn-voice-replay').click();
    await page.waitForFunction(() => document.querySelector('.academy-story-vn-stage')?.getAttribute('data-voice-status') !== 'loading');
    await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-02-rie-welcome.png`), fullPage: true });

    const warmCheckpoint = await readProof(page);
    assert.match(warmCheckpoint.checkpoint.sectionId ?? '', /^story-run:v1:/u);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await mountProof(page, databaseName, false);
    await page.locator('[data-line="line:opening-arrival:rie-evening"]').waitFor();
    const coldCheckpoint = await readProof(page);
    assert.deepEqual(coldCheckpoint.checkpoint, warmCheckpoint.checkpoint,
        `${viewport.name} must cold-restore the exact authored beat`);

    await advanceUntil(page, viewport.input, moment => moment.kind === 'complete');
    assert.equal(await page.locator('.academy-vn-speaker').isHidden(), true,
        `${viewport.name} completion status must not masquerade as another Rie line`);
    assert.equal(await page.locator('.academy-vn-japanese').textContent(), '中庭へ');
    assert.equal(await page.locator('.academy-vn-translation').textContent(), 'The courtyard is just through the door.');
    await assertResponsiveGeometry(page, viewport, 'completion');
    await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-03-complete.png`), fullPage: true });
    await activate(page.locator('.academy-story-next'), viewport.input);
    await page.locator('.academy-world-screen[data-current-place="courtyard"]').waitFor();
    await decodeImages(page, '.academy-world-screen');
    await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-04-courtyard.png`), fullPage: true });

    const completed = await readProof(page);
    assert.equal(completed.checkpoint.route, 'campus');
    assert.equal(completed.checkpoint.lessonId, 'lesson:foundation-00');
    assert.equal(completed.curriculumEntries.length, 1,
        `${viewport.name} must record the starting choice once`);
    const arrivalEncounters = completed.encounters.filter(event => event.encounterId.startsWith('story:bridge:opening-arrival:'));
    assert.deepEqual(arrivalEncounters.map(event => event.encounterId).sort(), [
        'story:bridge:opening-arrival:complete',
        'story:bridge:opening-arrival:scene:scene:opening-arrival:fiction-notice',
        'story:bridge:opening-arrival:scene:scene:opening-arrival:open-chair',
    ]);
    assert.equal(new Set(arrivalEncounters.map(event => event.encounterId)).size, arrivalEncounters.length);
    assert.ok(completed.ducks.started > 0, `${viewport.name} must route story voice through the shared audio mix`);
    assert.ok(warmCheckpoint.sfxCalls.includes('menu.confirm'), `${viewport.name} start choice must use confirm SFX`);
    assert.ok(voiceResponses.length > 0, `${viewport.name} must request a locked production voice asset`);
    assert.ok(voiceResponses.every(response => response.status === 200 || response.status === 206),
        `${viewport.name} voice media must resolve: ${JSON.stringify(voiceResponses)}`);

    await page.evaluate(() => window.__academyArrivalProof.revisit());
    await page.locator('.academy-story-package-screen').waitFor();
    await advanceUntil(page, viewport.input, moment => moment.kind === 'complete');
    await activate(page.locator('.academy-story-next'), viewport.input);
    await page.locator('.academy-world-screen[data-current-place="courtyard"]').waitFor();
    const replayed = await readProof(page);
    assert.deepEqual(replayed.encounters, completed.encounters,
        `${viewport.name} replay must not duplicate grounded encounter evidence`);
    assert.deepEqual(consoleProblems, [], `${viewport.name} browser console must stay clean`);
    await context.close();
}

async function assertServer(page) {
    const response = await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
}

async function mountProof(page, databaseName, resetDatabase) {
    await page.evaluate(async ({ databaseName: name, resetDatabase: reset }) => {
        document.body.replaceChildren();
        await import('/src/academy/entrypoint.ts');
        if (reset) {
            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error(`Arrival proof database is blocked: ${name}`));
            });
        }
        const [
            { openAcademyPersistence },
            { createLearnerEvidence },
            { createEnrollmentFlow },
            { createWorldFlow },
            { transitionAcademyRoute },
            { themeForRoute },
        ] = await Promise.all([
            import('/src/academy/persistence/indexeddb.ts'),
            import('/src/academy/evidence/learner-evidence.ts'),
            import('/src/academy/routing/enrollment-flow.ts'),
            import('/src/academy/routing/world-flow.ts'),
            import('/src/academy/routing/route-history.ts'),
            import('/src/academy/routing/contract.ts'),
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
                learningReason: 'Talk with family',
                portraitId: 'quality-4',
            });
            await evidence.completeRieIntroduction();
            await persistence.checkpoint.save({
                schemaVersion: 2,
                route: 'start',
                routeHistory: [],
                presentationMode: 'story',
                updatedAt: 1,
            });
        }
        let checkpoint = await persistence.checkpoint.load();
        if (!checkpoint) throw new Error('Arrival proof checkpoint was not saved.');
        localStorage.setItem('yomu:academy:language:v1', 'en');
        const root = document.createElement('main');
        root.id = 'yomu-academy';
        root.className = 'academy-root';
        document.body.replaceChildren(root);
        const themeCalls = [];
        const sfxCalls = [];
        const directorListeners = new Set();
        const ducks = { started: 0, released: 0 };
        const audio = {
            state: 'ready',
            theme: 'silence',
            settings: { muted: false, volumes: { music: 0.7, ambience: 0.65, lesson: 1, sfx: 0.8 } },
            onEvent(listener) { directorListeners.add(listener); return () => directorListeners.delete(listener); },
            beginExternalLesson() {
                ducks.started += 1;
                let released = false;
                return () => {
                    if (released) return;
                    released = true;
                    ducks.released += 1;
                };
            },
            async setTheme(theme) { this.theme = theme; themeCalls.push(theme); },
            playSfx(cue) { sfxCalls.push(cue); },
        };
        const shell = {
            replace(view) {
                root.firstElementChild?.dispatchEvent(new CustomEvent('academy:dispose'));
                root.replaceChildren(view);
            },
            setLanguage() {},
            setNavigation() {},
            setLearnerActionsVisible() {},
            setClassBoardAccess() {},
            setPresentationMode() {},
            setMuted() {},
            announce() {},
            dispose() {},
        };
        const enrollmentFlow = createEnrollmentFlow({ access: {}, evidence, pronunciation: {}, audio });
        const worldFlow = createWorldFlow({ evidence, pronunciation: {}, audio });
        const enrollmentRoutes = new Set([
            'start', 'manual-band', 'placement-mock', 'placement-result', 'arrival-bridge',
        ]);
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
            await audio.setTheme(themeForRoute(checkpoint.route, checkpoint.worldPlace));
            const flow = enrollmentRoutes.has(checkpoint.route) ? enrollmentFlow : worldFlow;
            const handled = await flow.render(checkpoint.route, context());
            if (!handled) throw new Error(`Arrival proof flow did not handle ${checkpoint.route}.`);
        };
        window.__academyArrivalProof = {
            async snapshot() {
                const events = await evidence.history();
                return {
                    checkpoint: structuredClone(checkpoint),
                    curriculumEntries: structuredClone(events.filter(event => event.kind === 'curriculum-entry-chosen')),
                    encounters: structuredClone(events.filter(event => (
                        event.kind === 'characters-encountered'
                        && event.encounterId.startsWith('story:bridge:opening-arrival:')
                    ))),
                    themeCalls: [...themeCalls],
                    sfxCalls: [...sfxCalls],
                    ducks: { ...ducks },
                };
            },
            async revisit() {
                checkpoint = {
                    schemaVersion: 2,
                    route: 'arrival-bridge',
                    routeHistory: [{ route: 'campus', worldPlace: 'courtyard', lessonId: 'lesson:foundation-00' }],
                    presentationMode: 'story',
                    lessonId: 'lesson:foundation-00',
                    updatedAt: Date.now(),
                };
                await persistence.checkpoint.save(checkpoint);
                await render();
            },
        };
        await render();
    }, { databaseName, resetDatabase });
}

async function readProof(page) {
    return page.evaluate(() => window.__academyArrivalProof.snapshot());
}

async function advanceUntil(page, input, predicate) {
    for (let index = 0; index < 40; index += 1) {
        const moment = await page.evaluate(() => {
            const arc = document.querySelector('[data-story-arc-id="arc:bridge:opening-arrival"]');
            const dialogue = document.querySelector('.academy-vn-dialogue');
            return {
                kind: arc?.getAttribute('data-story-moment') ?? '',
                scene: arc?.getAttribute('data-story-scene') ?? '',
                lineId: dialogue?.getAttribute('data-line') ?? '',
            };
        });
        if (predicate(moment)) return moment;
        const choice = page.locator('[data-story-option-id]').first();
        const action = page.locator('.academy-vn-action-slot .academy-vn-primary-action').first();
        if (await choice.count()) await activate(choice, input);
        else if (await action.count()) await activate(action, input);
        else throw new Error(`Arrival stalled at ${JSON.stringify(moment)}.`);
        await page.waitForTimeout(40);
    }
    throw new Error('Arrival did not reach the requested moment within 40 actions.');
}

async function assertArrivalCopy(page, viewport, phase) {
    const text = await page.locator('.academy-story-package-screen').innerText();
    assert.doesNotMatch(text, /Moodle|fiction boundary|consent|source package|Blank Route|route note/iu,
        `${viewport.name} ${phase} must not expose production language`);
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
        return {
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            stage: bounds(stage),
            dialogue: bounds(stage?.querySelector('.academy-vn-dialogue')),
            controls: [...(stage?.querySelectorAll('button:not([hidden])') ?? [])]
                .filter(node => node.getClientRects().length > 0)
                .map(bounds),
        };
    });
    assert.ok(geometry.documentWidth <= viewport.width,
        `${viewport.name} ${phase} must not overflow horizontally (${geometry.documentWidth}/${viewport.width})`);
    assert.ok(geometry.stage && geometry.stage.left >= -1 && geometry.stage.right <= geometry.viewport.width + 1,
        `${viewport.name} ${phase} stage must fit: ${JSON.stringify(geometry.stage)}`);
    assert.ok(geometry.dialogue && geometry.dialogue.left >= -1 && geometry.dialogue.right <= geometry.viewport.width + 1,
        `${viewport.name} ${phase} dialogue must fit: ${JSON.stringify(geometry.dialogue)}`);
    for (const [index, control] of geometry.controls.entries()) {
        assert.ok(control.left >= -1 && control.right <= geometry.viewport.width + 1,
            `${viewport.name} ${phase} control ${index + 1} must fit: ${JSON.stringify(control)}`);
        if (viewport.input === 'touch') {
            assert.ok(control.width >= 44 && control.height >= 44,
                `${viewport.name} ${phase} control ${index + 1} must be a 44px target: ${JSON.stringify(control)}`);
        }
    }
}

async function assertAccessible(page, selector) {
    const axe = await new AxeBuilder({ page }).include(selector).analyze();
    const blocking = axe.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
    })), [], `${selector} must have no serious or critical Axe violations`);
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
    assert.ok(dimensions.length > 0 && dimensions.every(image => image.naturalWidth > 0 && image.naturalHeight > 0),
        `${selector} must render decoded art: ${JSON.stringify(dimensions)}`);
}

async function activate(locator, input) {
    if (input === 'touch') await locator.tap();
    else await locator.click();
}
