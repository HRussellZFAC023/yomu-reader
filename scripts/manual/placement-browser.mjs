import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.PLACEMENT_SCREENSHOTS ?? 'qa-artifacts/placement');
const viewports = [
    { name: 'phone', width: 390, height: 844, input: 'touch' },
    { name: 'portrait-tablet', width: 1024, height: 1366, input: 'touch' },
    { name: 'desktop', width: 1440, height: 900, input: 'keyboard' },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of viewports) {
        await verifyAcceptedRoute(viewport);
        await verifyOverrideRoute(viewport);
    }
    console.log('Placement passed durable draft, listening, production, result, Back, Accept and override proof on phone, portrait tablet and desktop.');
} finally {
    await browser.close();
}

async function verifyAcceptedRoute(viewport) {
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: 'en-GB',
        reducedMotion: 'reduce',
        hasTouch: viewport.input === 'touch',
    });
    const page = await context.newPage();
    const consoleProblems = captureConsoleProblems(page);
    const databaseName = `yomu-academy-placement-accept-${viewport.name}`;
    await assertServer(page);
    await mountProof(page, databaseName, 'mock');

    const mock = page.locator('.academy-placement-screen[data-academy-route="placement-mock"]');
    await mock.waitFor();
    await decodeImages(page, '.academy-placement-screen');
    await assertGeometry(page, viewport, '.academy-placement-screen');
    await assertAccessible(page, '.academy-placement-screen');
    assert.equal(await mock.getByText(/source recording|browser speech|provenance|Moodle/i).count(), 0);

    await mock.locator('.academy-target-band select').selectOption('n5');
    await activate(mock.locator('.academy-placement-actions .academy-button-primary:not([type="submit"])'), viewport.input);
    await assertProgress(mock, 'Step 1 of 8');
    assert.ok((await mock.locator('.academy-placement-briefing:not([hidden])').textContent())
        ?.includes('One example, then one small stretch'));
    assert.equal(await mock.locator('.academy-mock-item:not([hidden])').count(), 0,
        `${viewport.name} must teach before the first scored item`);
    await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-briefing.png`), fullPage: true });

    await activate(mock.locator('.academy-placement-actions .academy-button-primary:not([type="submit"])'), viewport.input);
    await assertProgress(mock, 'Step 2 of 8');
    const firstItem = mock.locator('.academy-mock-item:not([hidden])');
    const firstId = await firstItem.getAttribute('data-mock-item');
    const firstCorrect = (await readProof(page)).correctAnswers[firstId];
    await firstItem.locator(`input[value="${firstCorrect}"]`).check();
    await page.waitForTimeout(180);
    const beforeReload = await readProof(page);
    assert.equal(beforeReload.checkpoint.placementProgress.step, 2);
    assert.equal(beforeReload.checkpoint.placementProgress.draft.responses[firstId], firstCorrect);
    assert.equal(beforeReload.placementEvents.length, 0, 'A draft must not become learner evidence.');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await mountProof(page, databaseName, 'resume');
    await mock.waitFor();
    await assertProgress(mock, 'Step 2 of 8');
    assert.equal(await mock.locator(`input[name="${firstId}"][value="${firstCorrect}"]`).isChecked(), true,
        `${viewport.name} must cold-restore the exact answer`);

    for (let question = 0; question < 6; question += 1) {
        const current = mock.locator('.academy-mock-item:not([hidden])');
        const id = await current.getAttribute('data-mock-item');
        const state = await readProof(page);
        if (await current.locator('.academy-placement-listening').count()) {
            const audio = current.locator('audio');
            if (await audio.count()) {
                await verifyAudioAsset(page, await audio.getAttribute('src'));
                await audio.evaluate(player => player.dispatchEvent(new Event('play')));
            } else {
                await activate(current.locator('[data-audio-delivery="browser-speech"]'), viewport.input);
            }
        }
        await current.locator(`input[value="${state.correctAnswers[id]}"]`).check();
        await activate(mock.locator('.academy-placement-actions .academy-button-primary:not([type="submit"])'), viewport.input);
        if (question < 5) await assertProgress(mock, `Step ${question + 3} of 8`);
    }
    await assertProgress(mock, 'Step 8 of 8');
    const production = mock.locator('.academy-placement-production:not([hidden])');
    await production.locator('[name="placement-speaking-complete"]').check();
    await production.locator('[name="placement-speaking-confidence"][value="0.5"]').check();
    await production.locator('[name="placement-writing-response"]').fill('ねこが すきです。');
    await production.locator('[name="placement-writing-confidence"][value="1"]').check();
    await activate(mock.locator('button[type="submit"]'), viewport.input);

    const result = page.locator('.academy-placement-result-screen[data-academy-route="placement-result"]');
    await result.waitFor();
    await decodeImages(page, '.academy-placement-result-screen');
    await assertGeometry(page, viewport, '.academy-placement-result-screen');
    await assertAccessible(page, '.academy-placement-result-screen');
    assert.equal((await readProof(page)).placementEvents.length, 0,
        `${viewport.name} submitted result must stay provisional`);
    assert.equal(await result.getByText(/source recording|browser speech|byte-verified|provenance/i).count(), 0);
    await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-result.png`), fullPage: true });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await mountProof(page, databaseName, 'resume');
    await result.waitFor();
    assert.equal((await readProof(page)).checkpoint.route, 'placement-result');
    assert.equal((await readProof(page)).placementEvents.length, 0);

    await activate(result.getByRole('button', { name: 'Back' }), viewport.input);
    await mock.waitFor();
    await assertProgress(mock, 'Step 8 of 8');
    assert.equal(await mock.locator('[name="placement-writing-response"]').inputValue(), 'ねこが すきです。');
    await activate(mock.locator('button[type="submit"]'), viewport.input);
    await result.waitFor();

    const accept = result.locator('.academy-button-primary');
    await accept.evaluate(button => { button.click(); button.click(); });
    await page.locator('.academy-story-package-screen').waitFor();
    const accepted = await readProof(page);
    assert.equal(accepted.placementEvents.length, 1, `${viewport.name} must record one accepted placement`);
    assert.equal(accepted.curriculumEntries.length, 1, `${viewport.name} must record one curriculum entry`);
    assert.equal(accepted.checkpoint.placementProgress, undefined);
    assert.ok(accepted.themeCalls.includes('classroom.focus'));
    assert.ok(accepted.sfxCalls.includes('menu.confirm'));
    assert.deepEqual(consoleProblems, [], `${viewport.name} accepted placement console must stay clean`);
    await context.close();
}

async function verifyOverrideRoute(viewport) {
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: 'en-GB',
        reducedMotion: 'reduce',
        hasTouch: viewport.input === 'touch',
    });
    const page = await context.newPage();
    const consoleProblems = captureConsoleProblems(page);
    const databaseName = `yomu-academy-placement-override-${viewport.name}`;
    await assertServer(page);
    await mountProof(page, databaseName, 'submitted');
    const result = page.locator('.academy-placement-result-screen');
    await result.waitFor();
    await activate(result.locator('.academy-button-secondary'), viewport.input);
    const manual = page.locator('.academy-band-screen[data-academy-route="manual-band"]');
    await manual.waitFor();
    assert.equal((await readProof(page)).placementEvents.length, 0);
    await activate(manual.locator('[data-band="n4"]'), viewport.input);
    await page.locator('.academy-story-package-screen').waitFor();
    const overridden = await readProof(page);
    assert.equal(overridden.placementEvents.length, 0, `${viewport.name} override must not record placement evidence`);
    assert.deepEqual(overridden.curriculumEntries.map(entry => ({
        route: entry.route,
        band: entry.band,
        recommendationAccepted: entry.recommendationAccepted,
    })), [{ route: 'placement-mock', band: 'n4', recommendationAccepted: false }]);
    assert.equal(overridden.checkpoint.placementProgress, undefined);
    assert.deepEqual(consoleProblems, [], `${viewport.name} override console must stay clean`);
    await context.close();
}

async function assertServer(page) {
    const response = await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
}

async function mountProof(page, databaseName, mode) {
    await page.evaluate(async ({ databaseName: name, mode: mountMode }) => {
        document.body.replaceChildren();
        await import('/src/academy/entrypoint.ts');
        if (mountMode !== 'resume') {
            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error(`Placement proof database is blocked: ${name}`));
            });
        }
        const [
            { openAcademyPersistence },
            { createLearnerEvidence },
            { createEnrollmentFlow },
            { transitionAcademyRoute },
            { themeForRoute },
            { orientationItemsForBand },
        ] = await Promise.all([
            import('/src/academy/persistence/indexeddb.ts'),
            import('/src/academy/evidence/learner-evidence.ts'),
            import('/src/academy/routing/enrollment-flow.ts'),
            import('/src/academy/routing/route-history.ts'),
            import('/src/academy/routing/contract.ts'),
            import('/src/academy/placement/orientation.ts'),
        ]);
        const persistence = await openAcademyPersistence(indexedDB, name);
        const evidence = createLearnerEvidence(persistence.events, {
            async ingest() {}, async due() { return []; }, async rate() {},
        });
        await evidence.initialize();
        const n5Items = orientationItemsForBand('n5');
        const correctAnswers = Object.fromEntries(n5Items.map(item => [
            item.id,
            item.options.find(option => option.correct).id,
        ]));
        if (mountMode !== 'resume') {
            await evidence.saveProfile({ displayName: 'Mina', learningReason: 'Talk with family', portraitId: 'quality-4' });
            await evidence.completeRieIntroduction();
            const submitted = mountMode === 'submitted';
            await persistence.checkpoint.save({
                schemaVersion: 2,
                route: submitted ? 'placement-result' : 'placement-mock',
                routeHistory: submitted ? [{ route: 'placement-mock' }] : [{ route: 'start' }],
                presentationMode: 'story',
                selectedBand: submitted ? 'n5' : undefined,
                placementProgress: submitted ? {
                    schemaVersion: 1,
                    step: 8,
                    submitted: true,
                    draft: {
                        targetBand: 'n5',
                        responses: correctAnswers,
                        listeningModes: Object.fromEntries(n5Items.filter(item => item.skill === 'listening')
                            .map(item => [item.id, 'audio'])),
                        production: {
                            speaking: { mode: 'aloud', completed: true, response: '', confidence: 1, rated: true },
                            writing: { mode: 'typed', completed: true, response: 'ねこが すきです。', confidence: 1, rated: true },
                        },
                    },
                } : undefined,
                updatedAt: 1,
            });
        }
        let checkpoint = await persistence.checkpoint.load();
        if (!checkpoint) throw new Error('Placement proof checkpoint was not saved.');
        localStorage.setItem('yomu:academy:language:v1', 'en');
        const root = document.createElement('main');
        root.id = 'yomu-academy';
        root.className = 'academy-root';
        document.body.replaceChildren(root);
        const themeCalls = [];
        const sfxCalls = [];
        const audio = {
            state: 'ready', theme: 'silence',
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
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        };
        const flow = createEnrollmentFlow({
            access: {}, evidence,
            pronunciation: { async play() { return { dispose() {} }; } },
            audio,
        });
        const render = async () => {
            await audio.setTheme(themeForRoute(checkpoint.route, checkpoint.worldPlace));
            if (await flow.render(checkpoint.route, context())) return;
            const destination = document.createElement('section');
            destination.dataset.proofRoute = checkpoint.route;
            shell.replace(destination);
        };
        const context = () => ({
            language: 'en', checkpoint, projection: evidence.projection, shell,
            async go(route, update = {}) {
                checkpoint = {
                    ...transitionAcademyRoute(checkpoint, { kind: 'push', route, context: update }),
                    ...update, schemaVersion: 2, updatedAt: Date.now(),
                };
                await persistence.checkpoint.save(checkpoint);
                await render();
            },
            async back() {
                checkpoint = {
                    ...transitionAcademyRoute(checkpoint, { kind: 'back' }),
                    schemaVersion: 2, updatedAt: Date.now(),
                };
                await persistence.checkpoint.save(checkpoint);
                await render();
            },
            async save(update) {
                checkpoint = { ...checkpoint, ...update, updatedAt: Date.now() };
                await persistence.checkpoint.save(checkpoint);
            },
        });
        window.__academyPlacementProof = {
            async snapshot() {
                const events = await evidence.history();
                return {
                    checkpoint: structuredClone(checkpoint),
                    correctAnswers,
                    placementEvents: structuredClone(events.filter(event => event.kind === 'placement-assessed')),
                    curriculumEntries: structuredClone(events.filter(event => event.kind === 'curriculum-entry-chosen')),
                    themeCalls: [...themeCalls], sfxCalls: [...sfxCalls],
                };
            },
        };
        await render();
    }, { databaseName, mode });
}

async function readProof(page) {
    return page.evaluate(() => window.__academyPlacementProof.snapshot());
}

async function assertProgress(mock, expected) {
    await assert.doesNotReject(async () => {
        await mock.locator('.academy-placement-progress-label').waitFor();
        await mock.page().waitForFunction(value => (
            document.querySelector('.academy-placement-progress-label')?.textContent === value
        ), expected);
    });
}

async function assertGeometry(page, viewport, selector) {
    const geometry = await page.evaluate(rootSelector => {
        const root = document.querySelector(rootSelector);
        const bounds = node => {
            const rect = node?.getBoundingClientRect();
            return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
        };
        return {
            documentWidth: document.documentElement.scrollWidth,
            root: bounds(root),
            content: bounds(root?.querySelector('.academy-panel-content')),
            visibleControls: [...(root?.querySelectorAll('button:not([hidden]), select, textarea, .academy-mock-option, .academy-placement-mode, .academy-placement-self-check-option, .academy-placement-production-direct') ?? [])]
                .filter(node => !node.closest('[hidden]') && getComputedStyle(node).display !== 'none')
                .map(bounds),
            clippedText: [...(root?.querySelectorAll('.academy-title, .academy-lede, .academy-mock-prompt, .academy-mock-option-copy, .academy-placement-step-title') ?? [])]
                .filter(node => !node.closest('[hidden]'))
                .map(node => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth })),
        };
    }, selector);
    assert.ok(geometry.documentWidth <= viewport.width,
        `${viewport.name} ${selector} must not overflow horizontally (${geometry.documentWidth}/${viewport.width})`);
    assert.ok(geometry.root && geometry.root.left >= -1 && geometry.root.right <= viewport.width + 1);
    assert.ok(geometry.content && geometry.content.width >= Math.min(300, viewport.width - 24));
    assert.ok(geometry.visibleControls.every(control => control && control.left >= -1 && control.right <= viewport.width + 1));
    assert.ok(geometry.visibleControls.filter(control => control.height > 0).every(control => control.height >= 43),
        `${viewport.name} ${selector} must keep 44px-class interaction targets`);
    assert.ok(geometry.clippedText.every(text => text.scrollWidth <= text.clientWidth + 2),
        `${viewport.name} ${selector} must not clip learning text`);
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
            try { await image.decode(); } catch { /* natural dimensions below are the proof */ }
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

async function verifyAudioAsset(page, url) {
    const proof = await page.evaluate(async source => {
        const response = await fetch(source);
        const bytes = await response.arrayBuffer();
        return { ok: response.ok, contentType: response.headers.get('content-type'), bytes: bytes.byteLength };
    }, url);
    assert.equal(proof.ok, true);
    assert.match(proof.contentType ?? '', /audio|mpeg/);
    assert.ok(proof.bytes > 1_000, `Placement listening asset is unexpectedly small: ${proof.bytes}`);
}

function captureConsoleProblems(page) {
    const problems = [];
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
    return problems;
}

async function activate(locator, input) {
    if (input === 'touch') await locator.tap();
    else await locator.click();
}
