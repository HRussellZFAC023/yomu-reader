#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    assert,
    launchSmokeBrowser,
    serveFile,
    startLoopbackServer,
} from '../lib/smoke-harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HOSTED_ROOT = path.join(ROOT, 'docs', 'public');
const DIST_APP_PATH = path.join(ROOT, 'dist', 'academy', 'app.js');
const HOSTED_APP_PATH = path.join(HOSTED_ROOT, 'academy', 'app.js');
const CATALOG_PATH = path.join(ROOT, 'public', 'academy', 'audio', 'learning-voice-playback.json');
const PRODUCTION_PATH = path.join(ROOT, 'docs', 'academy', 'audio', 'learning-voice-production.json');
const EXPECTED_PATH = path.join(ROOT, 'docs', 'academy', 'audio', 'learning-voice-local-expected.json');
const OBSERVED_PATH = path.resolve(process.env.LEARNING_VOICE_LOCAL_OBSERVED
    ?? path.join(ROOT, 'qa-artifacts', 'academy-learning-voice', 'local-browser-observed.json'));
const RUNTIME_SOURCE_PATHS = [
    'src/academy/integration/yomu-bridge.ts',
    'src/academy/audio/browser-speech.ts',
    'src/academy/audio/learning-voice.ts',
    'src/academy/audio/worker-tts.ts',
    'src/academy/content/lesson-zero-follow-instructions.ts',
    'src/academy/content/lesson-zero-greeting.ts',
    'src/academy/content/lesson-zero-desk-language.ts',
    'src/academy/content/lesson-zero-sentence-frames.ts',
    'src/academy/content/lesson-zero-vowel-anchors.ts',
    'src/academy/domain/classroom-instruction-session.ts',
    'src/academy/domain/lesson-zero-desk-language-session.ts',
    'src/academy/domain/lesson-zero-sentence-frame-session.ts',
    'src/academy/domain/world-locations.ts',
    'src/academy/routing/lesson-flow.ts',
    'src/academy/routing/world-flow.ts',
    'src/academy/ui/cafe-world.ts',
    'src/academy/ui/classroom-instruction-screen.ts',
    'src/academy/ui/lesson-zero-desk-language-screen.ts',
    'src/academy/ui/lesson-zero-greeting-screen.ts',
    'src/academy/ui/lesson-zero-sentence-frame-screen.ts',
    'src/academy/ui/lesson-zero-vowel-screen.ts',
    'src/academy/ui/lesson-zero-vowel-writing-screen.ts',
    'src/academy/ui/lesson-screen.ts',
    'src/academy/ui/world-screen.ts',
];
const RUN = `learning-voice-${Date.now()}`;
const scenarios = [
    {
        name: 'cafe price',
        bindingId: 'world-practice:cafe-coffee-price',
        route: 'world',
        context: { lessonId: 'lesson:foundation-00', worldPlace: 'cafe', worldVisits: { cafe: 0 } },
        selector: '.academy-cafe-order-listen',
        ready: '[data-world-practice="cafe-coffee-price"]',
        asset: '/academy/audio/learning-lines/textbook-miller/miller-cafe-price__28b3358c342c6ef9.opus',
        success: '[data-world-practice="cafe-coffee-price"][data-cafe-order-state="choosing"]',
    },
    {
        name: 'classroom repair',
        bindingId: 'world-practice:lab-classroom-repair',
        route: 'world',
        context: { lessonId: 'lesson:foundation-00', worldPlace: 'lab', worldVisits: { lab: 0 } },
        selector: '[data-world-listen="lab-classroom-repair"]',
        ready: '[data-world-practice="lab-classroom-repair"]',
        asset: '/academy/audio/learning-lines/rie/rie-lesson-zero-repeat__39120279d3b659e0.opus',
        success: '[data-world-practice="lab-classroom-repair"] [data-lab-speaking="ready"]',
    },
    {
        name: 'classroom repeat',
        bindingId: 'world-practice:lab-classroom-repeat',
        route: 'world',
        context: { lessonId: 'lesson:foundation-00', worldPlace: 'lab', worldVisits: { lab: 1 } },
        selector: '[data-world-listen="lab-classroom-repeat"]',
        ready: '[data-world-practice="lab-classroom-repeat"]',
        asset: '/academy/audio/learning-lines/rie/rie-lesson-zero-repeat__39120279d3b659e0.opus',
        success: '[data-world-practice="lab-classroom-repeat"] [data-lab-speaking="ready"]',
    },
    {
        name: 'Rie greeting model',
        bindingId: 'lesson-zero:greeting-rie-model',
        route: 'source-activity',
        context: {
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-greet-rie',
            lessonZeroGreetingProgress: undefined,
        },
        selector: '[data-audio-target="rie-model"]',
        ready: '.academy-greeting-screen[data-session-status="ready"]',
        asset: '/academy/audio/learning-lines/rie/rie-lesson-zero-greeting__2f535f136fc8fa96.opus',
        success: '.academy-greeting-screen[data-session-status="ready"]',
    },
    {
        name: 'five vowel sound map',
        kind: 'vowels',
        bindingIds: [
            'lesson-zero:vowel:hira-a',
            'lesson-zero:vowel:hira-i',
            'lesson-zero:vowel:hira-u',
            'lesson-zero:vowel:hira-e',
            'lesson-zero:vowel:hira-o',
        ],
        route: 'source-activity',
        context: {
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-vowel-listen',
            lessonZeroVowelProgress: '__DELETE__',
        },
        ready: '.academy-vowel-screen[data-stage="ready"]',
        success: '.academy-vowel-ready',
    },
    {
        name: 'classroom rhythm',
        kind: 'classroom',
        bindingIds: [
            'lesson-zero:classroom-instruction:begin',
            'lesson-zero:classroom-instruction:finish',
            'lesson-zero:classroom-instruction:break',
            'lesson-zero:classroom-instruction:look',
            'lesson-zero:classroom-instruction:say-together',
            'lesson-zero:classroom-instruction:listen',
            'lesson-zero:classroom-instruction:write',
        ],
        route: 'source-activity',
        context: {
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-follow-instructions',
            classroomInstructionProgress: '__DELETE__',
        },
        ready: '.academy-classroom-instruction-screen[data-session-status="ready"]',
        success: '.academy-classroom-instruction-screen[data-session-status="complete"]',
    },
    {
        name: 'desk language',
        kind: 'desk-language',
        bindingIds: [
            'lesson-zero:desk-language:homework',
            'lesson-zero:desk-language:example',
        ],
        route: 'source-activity',
        context: {
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-desk-language',
            lessonZeroDeskLanguageProgress: '__DELETE__',
        },
        ready: '.academy-desk-language-screen[data-session-status="ready"][data-session-stage="meet-homework"]',
        success: '.academy-desk-language-screen[data-session-status="complete"][data-session-stage="complete"]',
    },
    {
        name: 'first sentence frames',
        kind: 'sentence-frames',
        bindingIds: [
            'lesson-zero:sentence-frame:identity:example',
            'lesson-zero:sentence-frame:identity:target',
            'lesson-zero:sentence-frame:identity:response',
            'lesson-zero:sentence-frame:correction:example',
            'lesson-zero:sentence-frame:correction:target',
            'lesson-zero:sentence-frame:correction:response',
            'lesson-zero:sentence-frame:question:example',
            'lesson-zero:sentence-frame:question:target',
            'lesson-zero:sentence-frame:question:response',
            'lesson-zero:sentence-frame:noun-link:example',
            'lesson-zero:sentence-frame:noun-link:target',
            'lesson-zero:sentence-frame:noun-link:response',
            'lesson-zero:sentence-frame:parallel:example',
            'lesson-zero:sentence-frame:parallel:target',
            'lesson-zero:sentence-frame:parallel:response',
        ],
        route: 'source-activity',
        context: {
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-build-sentence-frames',
            lessonZeroSentenceFrameProgress: '__DELETE__',
        },
        ready: '.academy-sentence-frame-screen[data-session-status="ready"]',
        success: '.academy-sentence-frame-screen[data-session-status="complete"]',
    },
];
const catalogSource = readFileSync(CATALOG_PATH);
const productionSource = readFileSync(PRODUCTION_PATH);
const catalog = JSON.parse(catalogSource);
const catalogByBinding = new Map(catalog.entries.flatMap(entry => (
    entry.bindings.map(binding => [binding.lineId, entry])
)));
for (const scenario of scenarios) {
    for (const bindingId of scenarioBindingIds(scenario)) {
        const entry = catalogByBinding.get(bindingId);
        assert(entry, `Local proof scenario has no accepted binding: ${bindingId}`);
        if (scenario.asset) {
            assert(entry.url === scenario.asset, `Local proof scenario is stale for ${bindingId}`);
        }
    }
}
const coveredBindings = scenarios.flatMap(scenarioBindingIds);
assert(catalogByBinding.size === coveredBindings.length
    && new Set(coveredBindings).size === coveredBindings.length,
    'Local proof does not cover every accepted runtime binding', {
        catalogBindings: [...catalogByBinding.keys()],
        scenarioBindings: coveredBindings,
    });

const expectedSource = readFileSync(EXPECTED_PATH);
const expected = JSON.parse(expectedSource);
assert(expected.schema === 'yomu-academy.learning-voice-local-expected.v1', 'Local expected evidence schema is stale');
assert(expected.batchId === catalog.batchId, 'Local expected evidence batch is stale');
assert(expected.catalogSha256 === sha256(catalogSource), 'Local expected catalog hash is stale');
assert(expected.productionContractSha256 === sha256(productionSource), 'Local expected production hash is stale');
const distApp = readFileSync(DIST_APP_PATH);
const hostedApp = readFileSync(HOSTED_APP_PATH);
assert(distApp.equals(hostedApp), 'Built dist and hosted Academy app bytes differ');
assert(sha256(distApp) === expected.build.appSha256, 'Built Academy app differs from immutable local expectation');
for (const sourcePath of RUNTIME_SOURCE_PATHS) {
    assert(sha256(readFileSync(path.join(ROOT, sourcePath))) === expected.runtimeSources[sourcePath],
        `Runtime source differs from immutable local expectation: ${sourcePath}`);
}

const requests = [];
const server = await startLoopbackServer(serveAcademy, 'Academy learning voice local proof server could not bind');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
let context;
let evidence;
try {
    context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: 'en-GB',
        serviceWorkers: 'block',
    });
    await context.route(/^https:\/\/.*$/u, route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
    }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') {
            const source = message.location().url;
            errors.push(`console: ${message.text()}${source ? ` (${source})` : ''}`);
        }
    });
    page.on('request', request => requests.push(request.url()));
    page.on('response', response => {
        if (response.status() >= 400) errors.push(`response: ${response.status()} ${response.url()}`);
    });
    await page.addInitScript(() => {
        localStorage.setItem('yomu:academy:audio:v1', JSON.stringify({
            muted: false,
            volumes: { music: 0.7, ambience: 0.65, lesson: 1, sfx: 0.8 },
        }));
        localStorage.setItem('yomu:academy:profile-sync:v1', JSON.stringify({
            profile: {
                profileId: '11111111-1111-4111-8111-111111111111',
                deviceId: '22222222-2222-4222-8222-222222222222',
                accountId: '33333333-3333-4333-8333-333333333333',
                keyVersion: 1,
                createdAt: 1,
            },
            key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            cursor: 0,
            envelopes: {},
            eventSyncIds: {},
            lastSyncAt: null,
        }));
    });
    await enroll(page);
    await advanceToDayTwo(page);

    const results = [];
    for (const scenario of scenarios) {
        await setCheckpoint(page, scenario.route, scenario.context);
        await dismissArrival(page);
        try {
            await page.locator(scenario.ready).waitFor({ state: 'visible' });
        } catch (error) {
            const rendered = await page.locator('#academy-screen').innerText().catch(() => '<missing>');
            const checkpoint = await page.evaluate(() => window.__yomuAcademy?.checkpoint ?? null);
            throw new Error(
                `Learning voice scenario "${scenario.name}" did not reach ${scenario.ready}.\n`
                + `Checkpoint: ${JSON.stringify(checkpoint)}\nRendered screen: ${rendered}`,
                { cause: error },
            );
        }
        results.push(...await runScenario(page, scenario, expected));
    }

    const sourceModuleRequests = requests.filter(url => /\/src\//u.test(new URL(url).pathname));
    const workerFallbackRequests = requests.filter(url => url.startsWith('https://audio.yomureader.com/audio/tts'));
    const syncFixtureRequests = requests
        .map(requestUrl => new URL(requestUrl))
        .filter(requestUrl => requestUrl.pathname.startsWith('/academy/api/srs/'))
        .map(requestUrl => `${requestUrl.pathname}${requestUrl.search}`);
    assert(sourceModuleRequests.length === 0, 'Local proof loaded source modules instead of the built Academy route', { sourceModuleRequests });
    assert(workerFallbackRequests.length === 0, 'Local static voice proof fell through to worker TTS', { workerFallbackRequests });
    assert(syncFixtureRequests.some(requestUrl => requestUrl === '/academy/api/srs/push'),
        'Linked-account proof did not exercise its isolated SRS push fixture', { syncFixtureRequests });
    assert(syncFixtureRequests.some(requestUrl => requestUrl.startsWith('/academy/api/srs/pull?')),
        'Linked-account proof did not exercise its isolated SRS pull fixture', { syncFixtureRequests });
    assert(errors.length === 0, 'Academy learning voice local proof saw browser errors', { errors });
    evidence = {
        schema: 'yomu-academy.learning-voice-local-observed.v1',
        observedAt: new Date().toISOString(),
        batchId: catalog.batchId,
        immutableExpectedEvidence: path.relative(ROOT, EXPECTED_PATH),
        immutableExpectedEvidenceSha256: sha256(expectedSource),
        catalogSha256: sha256(catalogSource),
        productionContractSha256: sha256(productionSource),
        route: '/academy/?qa-run=<isolated>',
        proofScope: 'loopback-hosted Academy route; no deployment or production claim',
        authFixture: 'persisted-linked-account-and-valid-worker-session',
        syncFixture: 'isolated-accept-push-empty-pull',
        builtArtifacts: {
            distApp: path.relative(ROOT, DIST_APP_PATH),
            hostedApp: path.relative(ROOT, HOSTED_APP_PATH),
            distAppSha256: sha256(distApp),
            hostedAppSha256: sha256(hostedApp),
            byteParity: true,
        },
        sourceModuleRequests,
        workerFallbackRequests,
        syncFixtureRequests,
        results,
        verdict: 'pass',
    };
    mkdirSync(path.dirname(OBSERVED_PATH), { recursive: true });
    writeFileSync(OBSERVED_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence, null, 2));
} finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await server.close();
}

function scenarioBindingIds(scenario) {
    return scenario.bindingIds ?? [scenario.bindingId];
}

async function runScenario(page, scenario, expected) {
    const bindingIds = scenarioBindingIds(scenario);
    const pendingByBinding = new Map(bindingIds.map(bindingId => {
        const asset = catalogByBinding.get(bindingId).url;
        return [bindingId, {
            bindingId,
            asset,
            response: null,
            body: null,
        }];
    }));
    const captureResponse = response => {
        if (![200, 206].includes(response.status())) return;
        const pathname = new URL(response.url()).pathname;
        const matches = [...pendingByBinding.values()].filter(pending => (
            pending.asset === pathname && pending.response === null
        ));
        if (matches.length === 0) return;
        const body = response.body();
        for (const pending of matches) {
            pending.response = response;
            pending.body = body;
        }
    };
    page.on('response', captureResponse);

    try {
        if (scenario.kind === 'vowels') await playVowelTeachingSequence(page);
        else if (scenario.kind === 'classroom') await completeClassroomRhythm(page);
        else if (scenario.kind === 'desk-language') await completeDeskLanguage(page);
        else if (scenario.kind === 'sentence-frames') await completeSentenceFrames(page);
        else await page.locator(scenario.selector).click();

        await page.locator(scenario.success).waitFor({ state: 'visible' });
        const deadline = Date.now() + 15_000;
        while ([...pendingByBinding.values()].some(pending => pending.response === null) && Date.now() < deadline) {
            await page.waitForTimeout(100);
        }
    } finally {
        page.off('response', captureResponse);
    }
    const missing = [...pendingByBinding.values()]
        .filter(pending => pending.response === null)
        .map(pending => `${pending.bindingId} -> ${pending.asset}`);
    assert(missing.length === 0, `Scenario "${scenario.name}" did not request every accepted asset`, { missing });
    return Promise.all([...pendingByBinding.values()].map(async pending => {
        const response = pending.response;
        const body = await pending.body;
        const contentSha256 = sha256(body);
        assert(contentSha256 === expected.assets[pending.asset]?.sha256,
            `Local response bytes differ from immutable expectation: ${pending.asset}`);
        return {
            name: scenario.name,
            bindingId: pending.bindingId,
            bindingSurface: scenario.ready,
            asset: pending.asset,
            status: response.status(),
            contentType: response.headers()['content-type'],
            bytes: body.length,
            contentSha256,
        };
    }));
}

async function playVowelTeachingSequence(page) {
    await page.getByRole('button', { name: 'Take the headphones' }).click();
    for (let index = 0; index < 5; index += 1) {
        await page.getByRole('button', { name: 'Hear it in a word' }).click();
        if (index < 4) {
            await page.locator('.academy-vowel-rail-cell[data-state="learned"]').nth(index).waitFor();
        } else {
            await page.locator('.academy-vowel-ready').waitFor();
        }
    }
}

async function completeClassroomRhythm(page) {
    const practiceOrder = ['begin', 'finish', 'break', 'look', 'say-together', 'listen', 'write'];
    const recallOrder = ['look', 'begin', 'write', 'break', 'listen', 'finish', 'say-together'];
    await page.getByRole('button', { name: 'Meet the first move' }).click();
    for (const actionId of practiceOrder) {
        await page.locator('.academy-classroom-instruction-teach').waitFor();
        await page.locator('.academy-classroom-instruction-replay').click();
        await page.locator('.academy-classroom-instruction-try').click();
        await page.locator(`[data-action-id="${actionId}"]`).click();
        await page.locator('.academy-classroom-instruction-feedback[data-outcome="pass"]').waitFor();
        await page.locator('.academy-classroom-instruction-continue').click();
    }
    for (const actionId of recallOrder) {
        await page.locator('.academy-classroom-instruction-actions').waitFor();
        await page.locator(`[data-action-id="${actionId}"]`).click();
        await page.locator('.academy-classroom-instruction-feedback[data-outcome="pass"]').waitFor();
        await page.locator('.academy-classroom-instruction-continue').click();
    }
}

async function completeDeskLanguage(page) {
    const replay = page.locator('[data-desk-action="replay"]');
    const nextIntroduction = page.locator('[data-desk-action="next-introduction"]');

    await playDeskWord(page, replay, 'lesson-zero:desk-language:homework');
    await nextIntroduction.click();
    await page.locator('.academy-desk-language-screen[data-session-stage="meet-example"]').waitFor();
    await playDeskWord(page, replay, 'lesson-zero:desk-language:example');
    await nextIntroduction.click();
    await page.locator('.academy-desk-language-screen[data-session-stage="practice"]').waitFor();

    await page.locator('[data-choice="option-0"]').click();
    await page.locator('.academy-desk-language-screen[data-session-stage="practice"]').waitFor();
    await page.locator('[data-choice="option-1"]').click();
    await page.locator('[data-desk-action="begin-transfer"]').click();
    await page.locator('.academy-desk-language-screen[data-session-stage="transfer"]').waitFor();
    await page.locator('[data-choice="option-0"]').click();
    await page.locator('.academy-desk-language-screen[data-session-stage="transfer"]').waitFor();
    await page.locator('[data-choice="option-1"]').click();
}

async function playDeskWord(page, replay, bindingId) {
    const asset = catalogByBinding.get(bindingId).url;
    await Promise.all([
        page.waitForResponse(response => (
            [200, 206].includes(response.status())
            && new URL(response.url()).pathname === asset
        )),
        replay.click(),
    ]);
}

async function completeSentenceFrames(page) {
    const correctOrders = {
        identity: ['self', 'topic', 'student', 'copula', 'stop'],
        correction: ['rie', 'topic', 'student', 'negative', 'stop'],
        question: ['sophie', 'topic', 'student', 'question', 'stop'],
        'noun-link': ['rie', 'link', 'class', 'copula', 'stop'],
        parallel: ['sophie', 'also', 'student', 'copula', 'stop'],
    };
    const firstAttemptOrders = {
        identity: ['student', 'copula', 'self', 'stop', 'topic'],
        correction: ['negative', 'rie', 'student', 'stop', 'topic'],
        question: ['student', 'question', 'sophie', 'topic', 'stop'],
        'noun-link': ['class', 'rie', 'copula', 'link', 'stop'],
        parallel: ['student', 'copula', 'sophie', 'stop', 'also'],
    };
    await page.getByRole('button', { name: 'Make the first sentence' }).click();
    for (const [frameId, correctOrder] of Object.entries(correctOrders)) {
        const screen = page.locator(
            `.academy-sentence-frame-screen[data-frame-id="${frameId}"][data-session-stage="teach"]`,
        );
        await screen.waitFor();
        await screen.locator('.academy-sentence-frame-example .academy-sentence-frame-action-listen').click();
        await page.getByRole('button', { name: 'Try this turn' }).click();

        for (const tokenId of firstAttemptOrders[frameId]) {
            await page.locator(`.academy-sentence-frame-bank [data-token-id="${tokenId}"]`).click();
            await page.locator(`.academy-sentence-frame-selected-rail [data-token-id="${tokenId}"]`).waitFor();
        }
        await page.getByRole('button', { name: 'Check the sentence' }).click();
        await page.locator('.academy-sentence-frame-paper[data-outcome="lapse"]').waitFor();
        await page.getByRole('button', { name: 'Show the answer' }).click();
        await page.locator('.academy-sentence-frame-model .academy-sentence-frame-action-listen').click();
        await page.getByRole('button', { name: 'Rebuild the sentence' }).click();

        for (const tokenId of correctOrder) {
            await page.locator(`.academy-sentence-frame-bank [data-token-id="${tokenId}"]`).click();
            await page.locator(`.academy-sentence-frame-selected-rail [data-token-id="${tokenId}"]`).waitFor();
        }
        await page.getByRole('button', { name: 'Check the sentence' }).click();
        if (frameId === 'parallel') {
            await page.locator('.academy-sentence-frame-screen[data-session-status="complete"]').waitFor();
            await page.locator('.academy-sentence-frame-response .academy-sentence-frame-action-listen').click();
            continue;
        }
        await page.locator('.academy-sentence-frame-paper[data-outcome="pass"]').waitFor();
        await page.locator('.academy-sentence-frame-response .academy-sentence-frame-action-listen').click();
        await page.getByRole('button', { name: 'Use the next shape' }).click();
    }
}

async function enroll(page) {
    await openAcademy(page);
    const now = Date.now();
    await setCheckpoint(page, 'profile', {
        session: {
            sessionId: `learning-voice-${now}`,
            expiresAt: now + 28_800_000,
            offlineResumeUntil: now + 2_592_000_000,
            accountRequired: true,
            source: 'cloudflare',
        },
    });
    await page.locator('input[name="displayName"]').fill('Audio Gate');
    await page.locator('.academy-profile-advance').click();
    await page.locator('textarea[name="learningReason"]').fill('Verify stable Academy audio.');
    await page.locator('.academy-profile-advance').click();
    await page.locator('input[name="portrait"][value="quality-2"]').check();
    await page.locator('.academy-profile-advance').click();
    const introduction = page.locator('.academy-rie-introduction-screen[data-academy-route="rie-unlock"]');
    await introduction.waitFor();
    await introduction.getByRole('button', { name: 'Hear Rie' }).click();
    const enterClass = introduction.getByRole('button', { name: 'Come in' });
    await enterClass.waitFor({ state: 'visible' });
    await enterClass.click();
    await page.locator('[data-start-route="lesson-zero"]').click();
    await page.locator('[data-story-arc-id="arc:bridge:opening-arrival"]').waitFor();
}

async function openAcademy(page) {
    await page.goto(`${server.origin}/academy/?qa-run=${RUN}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#academy-screen > :not(.academy-loading-screen)', { timeout: 20_000 });
}

async function advanceToDayTwo(page) {
    await page.evaluate(async () => {
        const app = window.__yomuAcademy;
        const at = Date.now();
        await app.persistence.events.append([{
            kind: 'academy-day-closed',
            eventId: 'learning-voice-proof:day:1:closed',
            at,
            dayId: 'day:1',
            mainLessonCompleted: true,
            optionalActivityIds: [],
            elapsedMs: 0,
            schemaVersion: 1,
        }]);
        await app.evidence.refresh();
    });
}

async function setCheckpoint(page, route, checkpointContext) {
    await page.evaluate(() => window.__yomuAcademy?.dispose());
    await page.evaluate(async ({ databaseName, route, checkpointContext }) => {
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
        const nextCheckpoint = {
            ...existing,
            ...checkpointContext,
            schemaVersion: 2,
            route,
            routeHistory: [],
            presentationMode: existing?.presentationMode ?? 'story',
            updatedAt: Date.now(),
        };
        for (const [key, value] of Object.entries(nextCheckpoint)) {
            if (value === '__DELETE__') delete nextCheckpoint[key];
        }
        store.put({
            id: 'active-checkpoint',
            value: nextCheckpoint,
        });
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        database.close();
    }, { databaseName: `yomu-academy-qa-${RUN}`, route, checkpointContext });
    await openAcademy(page);
}

async function dismissArrival(page) {
    const continueButton = page.locator('.academy-world-arrival-continue');
    if (await continueButton.isVisible().catch(() => false)) await continueButton.click();
}

async function serveAcademy(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('cache-control', 'no-store');
    if (url.pathname === '/academy/api/session') {
        const now = Date.now();
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
            sessionId: `learning-voice-${now}`,
            expiresAt: now + 28_800_000,
            offlineResumeUntil: now + 2_592_000_000,
            accountRequired: false,
        }));
        return;
    }
    if (url.pathname === '/academy/api/account' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
            accountId: '33333333-3333-4333-8333-333333333333',
            displayName: 'Audio Gate',
            displayTag: 'Audio Gate#000001',
            nameChosen: true,
            avatarKey: null,
            boardVisible: false,
            shareAvatar: false,
            academyAccess: true,
            classes: [],
        }));
        return;
    }
    if (url.pathname === '/academy/api/entitlement' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ entitlement: 'academy', status: 'active', redeemedAt: 1 }));
        return;
    }
    if (url.pathname === '/academy/api/profile' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
            profileId: '11111111-1111-4111-8111-111111111111',
            deviceId: '22222222-2222-4222-8222-222222222222',
            accountId: '33333333-3333-4333-8333-333333333333',
            keyVersion: 1,
            createdAt: 1,
        }));
        return;
    }
    if (url.pathname === '/academy/api/profile/key' && request.method === 'POST') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ initialized: true }));
        return;
    }
    if (url.pathname === '/academy/api/srs/push' && request.method === 'POST') {
        const body = JSON.parse(await readRequestBody(request));
        const events = Array.isArray(body.events) ? body.events : [];
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
            accepted: events.length,
            inserted: events.length,
            duplicates: 0,
            conflicts: [],
        }));
        return;
    }
    if (url.pathname === '/academy/api/srs/pull' && request.method === 'GET') {
        const cursor = Number(url.searchParams.get('cursor') ?? 0);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ events: [], nextCursor: cursor, hasMore: false }));
        return;
    }
    if (url.pathname.startsWith('/academy/media/audio/')) {
        response.writeHead(204);
        response.end();
        return;
    }
    const relative = url.pathname === '/academy/' || url.pathname === '/academy'
        ? 'academy/index.html'
        : url.pathname.replace(/^\/+/, '');
    const hostedFile = path.join(HOSTED_ROOT, relative);
    if (!existsSync(hostedFile)
        || statSync(hostedFile).isDirectory()
        || !hostedFile.startsWith(`${HOSTED_ROOT}${path.sep}`)) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    serveFile(response, hostedFile, contentType(hostedFile), request.method);
}

function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.setEncoding('utf8');
        request.on('data', chunk => {
            body += chunk;
            if (body.length > 1_000_000) {
                reject(new Error('Academy sync fixture request is too large.'));
                request.destroy();
            }
        });
        request.on('end', () => resolve(body));
        request.on('error', reject);
    });
}

function contentType(file) {
    if (file.endsWith('.html')) return 'text/html; charset=utf-8';
    if (file.endsWith('.css')) return 'text/css; charset=utf-8';
    if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (file.endsWith('.json')) return 'application/json; charset=utf-8';
    if (file.endsWith('.opus')) return 'audio/ogg; codecs=opus';
    if (file.endsWith('.svg')) return 'image/svg+xml';
    if (file.endsWith('.png')) return 'image/png';
    if (file.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}
