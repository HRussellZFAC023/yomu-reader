import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.MANUAL_BAND_SCREENSHOTS ?? 'qa-artifacts/manual-band');
const viewports = [
    { name: 'phone', width: 390, height: 844, input: 'touch' },
    { name: 'portrait-tablet', width: 1024, height: 1366, input: 'touch' },
    { name: 'desktop', width: 1440, height: 900, input: 'keyboard' },
];
const bands = [
    { id: 'n5', title: 'I know the foundations', destination: '.academy-story-package-screen' },
    { id: 'n4', title: 'I can handle daily routines', destination: '.academy-story-package-screen' },
    { id: 'n3', title: 'I follow everyday Japanese', destination: '.academy-advanced-arrival-screen' },
    { id: 'n2', title: 'I follow detailed Japanese', destination: '.academy-story-package-screen' },
    { id: 'n1', title: 'I handle dense Japanese', destination: '.academy-story-package-screen' },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of viewports) {
        for (let index = 0; index < bands.length; index += 1) {
            await verifyBand(viewport, bands[index], bands[(index + 1) % bands.length]);
        }
    }
    console.log('Manual level choice passed all five persisted and reversible bands on phone, portrait tablet, and desktop.');
} finally {
    await browser.close();
}

async function verifyBand(viewport, band, alternate) {
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

    const databaseName = `yomu-academy-manual-band-${viewport.name}-${band.id}`;
    await assertServer(page);
    await mountProof(page, databaseName, true);

    const manual = page.locator('.academy-band-screen[data-academy-route="manual-band"]');
    await manual.waitFor();
    await decodeImages(page, '.academy-band-screen');
    await assertManualContent(manual, viewport);
    await assertManualGeometry(page, viewport);
    await assertAccessible(page, '.academy-band-screen');
    if (band.id === 'n5') {
        await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-manual-band.png`), fullPage: true });
    }

    const choice = manual.locator(`[data-band="${band.id}"]`);
    await choice.focus();
    assert.ok((await readProof(page)).sfxCalls.includes('menu.move'), `${viewport.name} ${band.id} must preview with menu.move`);
    await choice.evaluate(button => {
        button.click();
        button.click();
    });
    await page.locator(band.destination).waitFor();
    await decodeImages(page, band.destination);
    await assertDestination(page, band, viewport);
    const selected = await readProof(page);
    assert.equal(selected.checkpoint.route, 'arrival-bridge');
    assert.equal(selected.checkpoint.selectedBand, band.id);
    assert.equal(selected.checkpoint.routeHistory.at(-1)?.route, 'manual-band');
    assert.deepEqual(selected.curriculumEntries.map(entry => ({ route: entry.route, band: entry.band })), [
        { route: 'manual-band', band: band.id },
    ]);
    assert.equal(selected.projection.curriculumEntry?.band, band.id);
    assert.equal(selected.sfxCalls.filter(cue => cue === 'menu.confirm').length, 1,
        `${viewport.name} ${band.id} double activation must record one confirmation`);
    assert.deepEqual(selected.themeCalls, ['opening.invitation', 'opening.invitation']);
    await page.screenshot({
        path: path.join(artifactDir, `${viewport.name}-${band.id}-arrival.png`),
        fullPage: true,
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await mountProof(page, databaseName, false);
    await page.locator(band.destination).waitFor();
    await decodeImages(page, band.destination);
    const restored = await readProof(page);
    assert.deepEqual(restored.checkpoint, selected.checkpoint,
        `${viewport.name} ${band.id} must cold-restore the selected arrival`);
    assert.deepEqual(restored.curriculumEntries, selected.curriculumEntries,
        `${viewport.name} ${band.id} reload must not duplicate curriculum evidence`);

    await activate(page.locator(band.destination).getByRole('button', { name: 'Back' }), viewport.input);
    await manual.waitFor();
    const reconsidering = await readProof(page);
    assert.equal(reconsidering.checkpoint.route, 'manual-band');
    assert.ok(reconsidering.sfxCalls.includes('menu.cancel'), `${viewport.name} ${band.id} must sound the reversible Back action`);
    assert.equal(reconsidering.curriculumEntries.length, 1);

    await activate(manual.locator(`[data-band="${alternate.id}"]`), viewport.input);
    await page.locator(alternate.destination).waitFor();
    const changed = await readProof(page);
    assert.equal(changed.checkpoint.selectedBand, alternate.id);
    assert.equal(changed.projection.curriculumEntry?.band, alternate.id);
    assert.deepEqual(changed.curriculumEntries.map(entry => entry.band), [band.id, alternate.id],
        `${viewport.name} must preserve the intentional level change as learner history`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await mountProof(page, databaseName, false);
    await page.locator(alternate.destination).waitFor();
    const changedReload = await readProof(page);
    assert.equal(changedReload.checkpoint.selectedBand, alternate.id);
    assert.deepEqual(changedReload.curriculumEntries, changed.curriculumEntries);
    assert.deepEqual(consoleProblems, [], `${viewport.name} ${band.id} browser console must stay clean`);
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
                request.onblocked = () => reject(new Error(`Manual-band proof database is blocked: ${name}`));
            });
        }
        const [
            { openAcademyPersistence },
            { createLearnerEvidence },
            { createEnrollmentFlow },
            { transitionAcademyRoute },
            { themeForRoute },
        ] = await Promise.all([
            import('/src/academy/persistence/indexeddb.ts'),
            import('/src/academy/evidence/learner-evidence.ts'),
            import('/src/academy/routing/enrollment-flow.ts'),
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
                route: 'manual-band',
                routeHistory: [{ route: 'start' }],
                presentationMode: 'story',
                placementOverride: false,
                updatedAt: 1,
            });
        }
        let checkpoint = await persistence.checkpoint.load();
        if (!checkpoint) throw new Error('Manual-band proof checkpoint was not saved.');
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
        const flow = createEnrollmentFlow({ access: {}, evidence, pronunciation: {}, audio });
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
            const handled = await flow.render(checkpoint.route, context());
            if (!handled) throw new Error(`Manual-band proof flow did not handle ${checkpoint.route}.`);
        };
        window.__academyManualBandProof = {
            async snapshot() {
                const events = await evidence.history();
                return {
                    checkpoint: structuredClone(checkpoint),
                    curriculumEntries: structuredClone(events.filter(event => event.kind === 'curriculum-entry-chosen')),
                    projection: structuredClone(evidence.projection),
                    themeCalls: [...themeCalls],
                    sfxCalls: [...sfxCalls],
                };
            },
        };
        await render();
    }, { databaseName, resetDatabase });
}

async function readProof(page) {
    return page.evaluate(() => window.__academyManualBandProof.snapshot());
}

async function assertManualContent(manual, viewport) {
    assert.equal(await manual.locator('.academy-title').textContent(), 'What have you studied?');
    assert.equal(await manual.locator('.academy-lede').textContent(),
        'Choose the closest level. You can move up or down later.');
    assert.deepEqual(await manual.locator('.academy-band-code').allTextContents(), ['N5', 'N4', 'N3', 'N2', 'N1']);
    assert.deepEqual(await manual.locator('.academy-band-title').allTextContents(), bands.map(band => band.title));
    assert.ok((await manual.locator('[data-band="n5"]').getAttribute('aria-label'))
        ?.includes('Kana, greetings, and short everyday sentences.'));
    assert.equal(await manual.getByText(/Moodle|source package|adaptive route/i).count(), 0,
        `${viewport.name} manual level screen must not expose production language`);
}

async function assertManualGeometry(page, viewport) {
    const geometry = await page.evaluate(() => {
        const bounds = node => {
            const rect = node?.getBoundingClientRect();
            return rect ? {
                left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                width: rect.width, height: rect.height,
            } : null;
        };
        const screen = document.querySelector('.academy-band-screen');
        return {
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            documentHeight: document.documentElement.scrollHeight,
            screen: bounds(screen),
            title: bounds(screen?.querySelector('.academy-title')),
            choices: bounds(screen?.querySelector('.academy-band-choices')),
            buttons: [...(screen?.querySelectorAll('.academy-band-choice') ?? [])].map(bounds),
            back: bounds(screen?.querySelector('.academy-lesson-overview-back')),
        };
    });
    assert.ok(geometry.documentWidth <= viewport.width,
        `${viewport.name} manual level screen must not overflow horizontally (${geometry.documentWidth}/${viewport.width})`);
    assert.ok(geometry.screen && geometry.screen.left >= -1 && geometry.screen.right <= geometry.viewport.width + 1);
    assert.ok(geometry.title && geometry.choices && geometry.title.bottom <= geometry.choices.top + 1,
        `${viewport.name} title and level choices must not overlap`);
    assert.equal(geometry.buttons.length, 5);
    for (const [index, button] of geometry.buttons.entries()) {
        assert.ok(button.left >= -1 && button.right <= geometry.viewport.width + 1,
            `${viewport.name} level ${index + 1} must stay inside the viewport width`);
        assert.ok(button.width >= 44 && button.height >= 44,
            `${viewport.name} level ${index + 1} must be a 44px target`);
        if (index > 0) assert.ok(geometry.buttons[index - 1].bottom <= button.top + 1,
            `${viewport.name} levels ${index} and ${index + 1} must not overlap`);
    }
    assert.ok(geometry.back && geometry.back.width >= 44 && geometry.back.height >= 44,
        `${viewport.name} Back must be a 44px target`);
    assert.ok(geometry.buttons.at(-1).bottom <= geometry.back.top + 1,
        `${viewport.name} final level and Back must not overlap`);
    assert.ok(geometry.back.bottom <= geometry.documentHeight + 1,
        `${viewport.name} Back must remain reachable within the document`);
}

async function assertDestination(page, band, viewport) {
    const destination = page.locator(band.destination);
    await assertAccessible(page, band.destination);
    const text = await destination.textContent();
    assert.doesNotMatch(text ?? '', /Moodle|source package|adaptive route/i,
        `${viewport.name} ${band.id} arrival must not expose production language`);
    assert.equal(await destination.locator('[data-location], [data-activity-route="class"]').count(), 0,
        `${viewport.name} ${band.id} arrival must not expose later Day 1 routes`);
    if (band.id === 'n3') {
        const guide = await destination.locator('.academy-guide-character').evaluate(picture => {
            const rect = picture.getBoundingClientRect();
            const image = picture.querySelector('img');
            return {
                top: rect.top,
                bottom: rect.bottom,
                height: rect.height,
                naturalWidth: image?.naturalWidth ?? 0,
                naturalHeight: image?.naturalHeight ?? 0,
            };
        });
        assert.ok(guide.naturalWidth > 0 && guide.naturalHeight > 0,
            `${viewport.name} N3 arrival must decode Rie's portrait`);
        assert.ok(guide.top < viewport.height && guide.bottom > 0 && guide.height <= viewport.height,
            `${viewport.name} N3 arrival must keep Rie's portrait stage inside the visible viewport: ${JSON.stringify(guide)}`);
        assert.equal(await destination.getAttribute('data-band'), 'n3');
        assert.equal(await destination.getAttribute('data-learning-check'), 'n3-listening');
        assert.equal(await destination.locator('audio').getAttribute('aria-label'), 'Five-dialogue listening check');
    } else {
        assert.equal(await destination.locator('[data-story-arc-id="arc:bridge:opening-arrival"]').count(), 1);
        assert.equal(await destination.locator('[data-story-moment]').getAttribute('data-story-moment'), 'stage');
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
    assert.ok(dimensions.length > 0 && dimensions.every(image => image.naturalWidth > 0 && image.naturalHeight > 0),
        `${selector} must render real, decoded art: ${JSON.stringify(dimensions)}`);
}

async function activate(locator, input) {
    if (input === 'touch') await locator.tap();
    else await locator.click();
}
