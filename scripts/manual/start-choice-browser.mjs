import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.START_CHOICE_SCREENSHOTS ?? 'qa-artifacts/start-choice');
const viewports = [
    { name: 'phone', width: 390, height: 844, input: 'touch' },
    { name: 'portrait-tablet', width: 1024, height: 1366, input: 'touch' },
    { name: 'desktop', width: 1440, height: 900, input: 'keyboard' },
];
const branches = [
    { route: 'lesson-zero', destination: '.academy-world-screen[data-current-place="courtyard"]' },
    { route: 'manual-band', destination: '.academy-band-screen' },
    { route: 'placement-mock', destination: '.academy-placement-screen' },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of viewports) {
        for (const branch of branches) await verifyBranch(viewport, branch);
    }
    console.log('Starting-path choice passed all three persisted, reloadable, recoverable branches on phone, portrait tablet, and desktop.');
} finally {
    await browser.close();
}

async function verifyBranch(viewport, branch) {
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

    const databaseName = `yomu-academy-start-choice-${viewport.name}-${branch.route}`;
    await assertServer(page);
    await mountProof(page, databaseName, true);

    const start = page.locator('.academy-start-screen[data-academy-route="start"]');
    await start.waitFor();
    await Promise.all([
        start.locator('.academy-background img').evaluate(image => image.decode()),
        start.locator('.academy-guide-character img').evaluate(image => image.decode()),
    ]);
    await assertStartContent(start, viewport);
    await assertStartGeometry(page, viewport);
    await assertAccessible(page, '.academy-start-screen');
    if (branch.route === 'lesson-zero') {
        await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-start.png`), fullPage: true });
    }

    const choice = start.locator(`[data-start-route="${branch.route}"]`);
    await activate(choice, viewport.input);
    await page.locator(branch.destination).waitFor();
    await decodeImages(page, branch.destination);
    const selected = await readProof(page);
    assert.equal(selected.checkpoint.route, branch.route === 'lesson-zero' ? 'campus' : branch.route);
    assert.equal(selected.checkpoint.routeHistory.at(-1)?.route, 'start');
    assert.ok(selected.sfxCalls.includes('menu.confirm'), `${viewport.name} ${branch.route} must use the confirm SFX`);
    assert.equal(selected.themeCalls[0], 'opening.invitation');
    assert.equal(selected.themeCalls.at(-1), destinationTheme(branch.route));
    if (branch.route === 'lesson-zero') {
        assert.deepEqual(selected.curriculumEntries.map(event => ({ route: event.route, band: event.band })), [
            { route: 'lesson-zero', band: undefined },
        ]);
    } else {
        assert.deepEqual(selected.curriculumEntries, [],
            `${branch.route} must not claim a band before the learner chooses or completes placement`);
    }
    await page.screenshot({
        path: path.join(artifactDir, `${viewport.name}-${branch.route}-destination.png`),
        fullPage: true,
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await mountProof(page, databaseName, false);
    await page.locator(branch.destination).waitFor();
    await decodeImages(page, branch.destination);
    const restored = await readProof(page);
    assert.deepEqual(restored.checkpoint, selected.checkpoint,
        `${viewport.name} ${branch.route} must cold-restore the exact route checkpoint`);
    assert.deepEqual(restored.curriculumEntries, selected.curriculumEntries,
        `${viewport.name} ${branch.route} reload must not duplicate curriculum evidence`);

    if (branch.route !== 'lesson-zero') {
        const destination = page.locator(branch.destination);
        await assertAccessible(page, branch.destination);
        await activate(destination.getByRole('button', { name: 'Back' }), viewport.input);
        await start.waitFor();
        const returned = await readProof(page);
        assert.equal(returned.checkpoint.route, 'start');
        assert.deepEqual(returned.curriculumEntries, []);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await mountProof(page, databaseName, false);
        await start.waitFor();
        assert.equal((await readProof(page)).checkpoint.route, 'start');
    }

    assert.deepEqual(consoleProblems, [], `${viewport.name} ${branch.route} browser console must stay clean`);
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
                request.onblocked = () => reject(new Error(`Start-choice proof database is blocked: ${name}`));
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
        if (!checkpoint) throw new Error('Start-choice proof checkpoint was not saved.');
        localStorage.setItem('yomu:academy:language:v1', 'en');
        const root = document.createElement('main');
        root.id = 'yomu-academy';
        root.className = 'academy-root';
        document.body.replaceChildren(root);
        const themeCalls = [];
        const sfxCalls = [];
        const audio = {
            state: 'ready',
            theme: 'silence',
            settings: { muted: false, volumes: { music: 0.7, ambience: 0.65, lesson: 1, sfx: 0.8 } },
            onEvent() { return () => {}; },
            beginExternalLesson() { return () => {}; },
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
            if (!handled) throw new Error(`Start-choice proof flow did not handle ${checkpoint.route}.`);
        };
        window.__academyStartProof = {
            async snapshot() {
                const events = await evidence.history();
                return {
                    checkpoint: structuredClone(checkpoint),
                    curriculumEntries: structuredClone(events.filter(event => event.kind === 'curriculum-entry-chosen')),
                    themeCalls: [...themeCalls],
                    sfxCalls: [...sfxCalls],
                };
            },
        };
        await render();
    }, { databaseName, resetDatabase });
}

async function readProof(page) {
    return page.evaluate(() => window.__academyStartProof.snapshot());
}

async function assertStartContent(start, viewport) {
    assert.equal(await start.locator('.academy-eyebrow').textContent(), 'Rie-sensei');
    assert.equal(await start.locator('.academy-title').textContent(), 'Where should we start?');
    assert.equal(await start.locator('.academy-lede').textContent(),
        'Pick the one that feels closest. You can change it later.');
    assert.deepEqual(await start.locator('.academy-route-title').allTextContents(), [
        "I'm brand new",
        'I know my level',
        'Help me choose',
    ]);
    assert.ok((await start.locator('[data-start-route="lesson-zero"]').getAttribute('aria-label'))
        ?.includes('No Japanese needed'));
    assert.equal(await start.getByText(/placement mock|curriculum entry|starting point/i).count(), 0,
        `${viewport.name} start choice must use learner language rather than implementation language`);
    const images = await start.locator('img').evaluateAll(nodes => nodes.map(image => ({
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
    })));
    assert.ok(images.length >= 2 && images.every(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
        `${viewport.name} must render both the classroom and Rie: ${JSON.stringify(images)}`);
}

async function assertStartGeometry(page, viewport) {
    const geometry = await page.evaluate(() => {
        const bounds = node => {
            const rect = node?.getBoundingClientRect();
            return rect ? {
                left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                width: rect.width, height: rect.height,
            } : null;
        };
        const screen = document.querySelector('.academy-start-screen');
        return {
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            screen: bounds(screen),
            title: bounds(screen?.querySelector('.academy-title')),
            choices: bounds(screen?.querySelector('.academy-route-choices')),
            buttons: [...(screen?.querySelectorAll('.academy-route-choice') ?? [])].map(bounds),
        };
    });
    assert.ok(geometry.documentWidth <= viewport.width,
        `${viewport.name} start must not overflow horizontally (${geometry.documentWidth}/${viewport.width})`);
    assert.ok(geometry.screen && geometry.screen.left >= -1 && geometry.screen.right <= geometry.viewport.width + 1);
    assert.ok(geometry.title && geometry.choices && geometry.title.bottom <= geometry.choices.top + 1,
        `${viewport.name} title and route choices must not overlap`);
    assert.equal(geometry.buttons.length, 3);
    for (const [index, button] of geometry.buttons.entries()) {
        assert.ok(button.left >= -1 && button.right <= geometry.viewport.width + 1
            && button.top >= -1 && button.bottom <= geometry.viewport.height + 1,
        `${viewport.name} choice ${index + 1} must be fully visible: ${JSON.stringify(button)}`);
        assert.ok(button.width >= 44 && button.height >= 44,
            `${viewport.name} choice ${index + 1} must be a 44px target`);
        if (index > 0) assert.ok(geometry.buttons[index - 1].bottom <= button.top + 1,
            `${viewport.name} choices ${index} and ${index + 1} must not overlap`);
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
            try { await image.decode(); } catch { /* natural dimensions below remain the proof */ }
        });
    }
    const dimensions = await images.evaluateAll(nodes => nodes.map(image => ({
        src: image.currentSrc || image.src,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
    })));
    assert.ok(dimensions.every(image => image.naturalWidth > 0 && image.naturalHeight > 0),
        `${selector} must not mount broken destination art: ${JSON.stringify(dimensions)}`);
}

async function activate(locator, input) {
    if (input === 'touch') await locator.tap();
    else await locator.click();
}

function destinationTheme(route) {
    if (route === 'lesson-zero') return 'world.courtyard';
    if (route === 'manual-band') return 'opening.invitation';
    return 'silence';
}
