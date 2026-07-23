import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.RIE_INTRO_SCREENSHOTS ?? 'qa-artifacts/rie-introduction');
const voicePath = '/academy/audio/story-pilot/s1e01-the-blank-atlas__rie-konbanwa__rie.opus';
const cases = [
    { name: 'phone', width: 390, height: 844, input: 'touch' },
    { name: 'portrait-tablet', width: 1024, height: 1366, input: 'touch' },
    { name: 'desktop', width: 1440, height: 900, input: 'keyboard' },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const testCase of cases) await verifyRieIntroduction(testCase);
    console.log('Rie introduction passed exact voice, one-time persistence, reload, and journal replay on phone, portrait tablet, and desktop.');
} finally {
    await browser.close();
}

async function verifyRieIntroduction(testCase) {
    const context = await browser.newContext({
        viewport: { width: testCase.width, height: testCase.height },
        locale: 'en-GB',
        reducedMotion: 'reduce',
        hasTouch: testCase.input === 'touch',
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
        const NativeAudio = window.Audio;
        window.__academyCreatedAudio = [];
        function TrackedAudio(source) {
            window.__academyCreatedAudio.push(source === undefined ? '' : String(source));
            return source === undefined ? new NativeAudio() : new NativeAudio(source);
        }
        TrackedAudio.prototype = NativeAudio.prototype;
        Object.setPrototypeOf(TrackedAudio, NativeAudio);
        window.Audio = TrackedAudio;
    });
    const consoleProblems = [];
    const voiceRequests = [];
    const voiceResponses = [];
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') {
            consoleProblems.push(`${message.type()}: ${message.text()}`);
        }
    });
    page.on('pageerror', error => consoleProblems.push(`pageerror: ${error.message}`));
    page.on('request', request => {
        if (new URL(request.url()).pathname === voicePath) voiceRequests.push(request.url());
    });
    page.on('response', response => {
        if (new URL(response.url()).pathname === voicePath) {
            voiceResponses.push({ status: response.status(), contentType: response.headers()['content-type'] ?? '' });
        }
    });

    const databaseName = `yomu-academy-rie-introduction-proof-${testCase.name}`;
    await assertServer(page);
    await mountProof(page, databaseName, true);

    const intro = page.locator('.academy-rie-introduction-screen[data-academy-route="rie-unlock"]');
    await intro.waitFor();
    await intro.locator('.academy-vn-sprite img').waitFor();
    await intro.locator('.academy-vn-sprite img').evaluate(image => image.decode());
    await assertIntroductionContent(intro, testCase);
    await assertResponsiveGeometry(page, testCase, 'first-introduction');
    await assertAccessible(page, '.academy-rie-introduction-screen');

    const before = await readProof(page);
    assert.equal(before.checkpoint.route, 'rie-unlock');
    assert.equal(before.profileEvents.length, 1, `${testCase.name} must have one saved profile event`);
    assert.deepEqual(before.introductionEvents, [],
        `${testCase.name} profile save must not pre-record Rie's introduction`);
    assert.equal(before.projection.completedEncounterIds.includes('opening-rie-introduction'), false);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-before.png`), fullPage: true });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await mountProof(page, databaseName, false);
    await intro.waitFor();
    const restoredBefore = await readProof(page);
    assert.deepEqual(restoredBefore.events, before.events,
        `${testCase.name} incomplete introduction must resume without writing evidence`);

    const hear = intro.getByRole('button', { name: 'Hear Rie' });
    await hear.waitFor();
    await activate(hear, testCase.input);
    await page.waitForFunction(() => (
        document.querySelector('.academy-rie-introduction-screen')?.getAttribute('data-voice-heard') === 'true'
    ));
    assert.equal(await intro.locator('.academy-rie-introduction-status').textContent(),
        'Rie is waiting by the open chair.');
    assert.equal(await intro.getByRole('button', { name: 'Come in' }).isEnabled(), true);
    assert.ok(voiceRequests.length >= 1, `${testCase.name} must request the locked Rie Opus asset`);
    assert.ok((await createdAudio(page)).includes(voicePath),
        `${testCase.name} introduction must construct playback for the exact locked asset`);
    assert.ok(voiceResponses.some(response => response.status >= 200 && response.status < 300),
        `${testCase.name} must fetch the real locked Rie Opus asset`);
    assert.ok(voiceResponses.every(response => /audio|ogg|opus/u.test(response.contentType)),
        `${testCase.name} Rie asset must have an audio response type: ${JSON.stringify(voiceResponses)}`);

    await activate(intro.getByRole('button', { name: 'Come in' }), testCase.input);
    await page.locator('.academy-start-screen').waitFor();
    const completed = await readProof(page);
    assert.equal(completed.checkpoint.route, 'start');
    assert.deepEqual(completed.introductionEvents.map(event => event.kind), [
        'characters-encountered',
        'asset-unlocked',
        'bond-changed',
        'relationship-chapter-unlocked',
        'scene-completed',
    ]);
    assert.equal(completed.projection.completedEncounterIds.includes('opening-rie-introduction'), true);
    assert.equal(completed.projection.unlockedAssets.includes('character:rie'), true);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await mountProof(page, databaseName, false);
    await page.locator('.academy-start-screen').waitFor();
    assert.equal(await page.locator('.academy-rie-introduction-screen').count(), 0,
        `${testCase.name} completed introduction must not replay on resume`);
    const restoredAfter = await readProof(page);
    assert.deepEqual(restoredAfter.introductionEvents, completed.introductionEvents,
        `${testCase.name} reload must not duplicate Rie evidence`);

    await page.evaluate(() => window.__academyRieProof.openJournal());
    const journal = page.locator('.academy-journal-screen');
    await journal.waitFor();
    await journal.locator('[data-character="rie"] button').click();
    await journal.locator('.academy-character-revisit').click();
    const replay = page.locator('.academy-rie-introduction-screen[data-introduction-replay="true"]');
    await replay.waitFor();
    await assertIntroductionContent(replay, testCase);
    await assertResponsiveGeometry(page, testCase, 'journal-replay');
    await assertAccessible(page, '.academy-rie-introduction-screen');
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-journal-replay.png`), fullPage: true });

    const audioCountBeforeReplay = (await createdAudio(page)).length;
    await activate(replay.getByRole('button', { name: 'Hear Rie' }), testCase.input);
    await page.waitForFunction(() => (
        document.querySelector('.academy-rie-introduction-screen')?.getAttribute('data-voice-heard') === 'true'
    ));
    const replayAudio = await createdAudio(page);
    assert.ok(replayAudio.length > audioCountBeforeReplay && replayAudio.at(-1) === voicePath,
        `${testCase.name} journal replay must construct playback for the same locked voice asset`);
    await activate(replay.getByRole('button', { name: 'Return to the journal' }), testCase.input);
    await journal.waitFor();
    const afterReplay = await readProof(page);
    assert.deepEqual(afterReplay.introductionEvents, completed.introductionEvents,
        `${testCase.name} journal replay must remain read-only evidence`);
    assert.deepEqual(consoleProblems, [], `${testCase.name} browser console must stay clean`);
    await context.close();
}

async function assertServer(page) {
    const response = await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
}

async function mountProof(page, databaseName, reset) {
    await page.evaluate(async ({ databaseName: name, resetDatabase }) => {
        document.body.replaceChildren();
        await import('/src/academy/entrypoint.ts');
        if (resetDatabase) {
            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error(`Rie proof database is blocked: ${name}`));
            });
        }
        const [
            { openAcademyPersistence },
            { createLearnerEvidence },
            { createEnrollmentFlow },
            { createWorldFlow },
            { transitionAcademyRoute },
        ] = await Promise.all([
            import('/src/academy/persistence/indexeddb.ts'),
            import('/src/academy/evidence/learner-evidence.ts'),
            import('/src/academy/routing/enrollment-flow.ts'),
            import('/src/academy/routing/world-flow.ts'),
            import('/src/academy/routing/route-history.ts'),
        ]);
        const persistence = await openAcademyPersistence(indexedDB, name);
        const evidence = createLearnerEvidence(persistence.events, {
            async ingest() {},
            async due() { return []; },
            async rate() {},
        });
        await evidence.initialize();
        if (resetDatabase) {
            await evidence.saveProfile({
                displayName: 'Mina',
                learningReason: 'Read manga and talk with family',
                portraitId: 'quality-4',
            });
            await persistence.checkpoint.save({
                schemaVersion: 2,
                route: 'rie-unlock',
                routeHistory: [{ route: 'profile' }],
                presentationMode: 'story',
                updatedAt: 1,
            });
        }
        let checkpoint = await persistence.checkpoint.load();
        if (!checkpoint) throw new Error('Rie proof checkpoint was not saved.');
        localStorage.setItem('yomu:academy:language:v1', 'en');
        const listeners = new Set();
        const settings = {
            muted: false,
            volumes: { music: 0.7, ambience: 0.7, lesson: 1, sfx: 0.8 },
        };
        const audio = {
            state: 'ready',
            theme: 'silence',
            settings,
            onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
            beginExternalLesson() { return () => {}; },
            async setTheme() {},
            playSfx() {},
        };
        const shell = {
            replace(view) {
                const previous = document.body.firstElementChild;
                previous?.dispatchEvent(new CustomEvent('academy:dispose'));
                document.body.replaceChildren(view);
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
        let activeFlow = enrollmentFlow;
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
            const handled = await activeFlow.render(checkpoint.route, context());
            if (!handled) throw new Error(`Rie proof flow did not handle ${checkpoint.route}.`);
        };
        const introductionEventIds = new Set([
            'encounter:opening-rie-introduction',
            'milestone:rie-introduction:asset',
            'milestone:rie-introduction:bond',
            'milestone:rie-introduction:journal',
            'milestone:rie-introduction:scene',
        ]);
        window.__academyRieProof = {
            async snapshot() {
                const events = await evidence.history();
                return {
                    checkpoint: structuredClone(checkpoint),
                    events: structuredClone(events),
                    profileEvents: structuredClone(events.filter(event => event.kind === 'profile-changed')),
                    introductionEvents: structuredClone(events.filter(event => (
                        'eventId' in event && introductionEventIds.has(event.eventId)
                    ))),
                    projection: structuredClone(evidence.projection),
                };
            },
            async openJournal() {
                activeFlow = worldFlow;
                checkpoint = {
                    ...checkpoint,
                    route: 'journal',
                    routeHistory: [{ route: 'start' }],
                    updatedAt: Date.now(),
                };
                await persistence.checkpoint.save(checkpoint);
                await render();
            },
        };
        await render();
    }, { databaseName, resetDatabase: reset });
}

async function readProof(page) {
    return page.evaluate(() => window.__academyRieProof.snapshot());
}

async function createdAudio(page) {
    return page.evaluate(() => [...window.__academyCreatedAudio]);
}

async function assertIntroductionContent(stage, testCase) {
    assert.equal(await stage.locator('.academy-vn-japanese').textContent(),
        'こんばんは。はじめまして。Rieです。');
    assert.equal(await stage.locator('.academy-vn-translation').textContent(),
        "Good evening. Nice to meet you. I'm Rie.");
    assert.equal(await stage.locator('.academy-vn-translation').isVisible(), true,
        `${testCase.name} zero-kana learner must receive immediate meaning support`);
    const sprite = await stage.locator('.academy-vn-sprite img').evaluate(image => {
        const rect = image.getBoundingClientRect();
        return {
            complete: image.complete,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
        };
    });
    assert.equal(sprite.complete, true);
    assert.ok(sprite.naturalWidth > 0 && sprite.naturalHeight > 0,
        `${testCase.name} must render Rie's approved sprite`);
    assert.ok(sprite.width >= (testCase.name === 'phone' ? 150 : 240) && sprite.height >= 300,
        `${testCase.name} must give Rie meaningful foreground presence: ${JSON.stringify(sprite)}`);
}

async function assertResponsiveGeometry(page, testCase, phase) {
    const geometry = await page.evaluate(() => {
        const bounds = node => {
            const rect = node?.getBoundingClientRect();
            return rect ? {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
            } : null;
        };
        const stage = document.querySelector('.academy-rie-introduction-screen');
        return {
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            stage: bounds(stage),
            dialogue: bounds(stage?.querySelector('.academy-vn-dialogue')),
            action: bounds(stage?.querySelector('.academy-rie-introduction-action')),
            controls: [...(stage?.querySelectorAll('button:not([hidden])') ?? [])]
                .filter(node => node.getClientRects().length > 0)
                .map(bounds),
        };
    });
    assert.ok(geometry.documentWidth <= testCase.width,
        `${testCase.name} ${phase} must not overflow horizontally (${geometry.documentWidth}/${testCase.width})`);
    assert.ok(geometry.stage && geometry.stage.left >= -1 && geometry.stage.right <= geometry.viewport.width + 1,
        `${testCase.name} ${phase} stage must fit: ${JSON.stringify(geometry.stage)}`);
    assert.ok(geometry.dialogue && geometry.dialogue.left >= -1 && geometry.dialogue.right <= geometry.viewport.width + 1,
        `${testCase.name} ${phase} dialogue must fit: ${JSON.stringify(geometry.dialogue)}`);
    assert.ok(geometry.action && geometry.action.left >= geometry.dialogue.left - 1
        && geometry.action.right <= geometry.dialogue.right + 1,
    `${testCase.name} ${phase} action must remain inside dialogue`);
    for (const [index, control] of geometry.controls.entries()) {
        assert.ok(control.left >= -1 && control.right <= geometry.viewport.width + 1,
            `${testCase.name} ${phase} control ${index + 1} must fit: ${JSON.stringify(control)}`);
        assert.ok(control.width >= 44 && control.height >= 44,
            `${testCase.name} ${phase} control ${index + 1} must be a 44px target: ${JSON.stringify(control)}`);
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

async function activate(locator, input) {
    if (input === 'touch') await locator.tap();
    else await locator.click();
}
