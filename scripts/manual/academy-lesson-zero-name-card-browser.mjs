import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5174';
const artifactDir = path.resolve('tmp/academy-lesson-zero-name-card');
const cases = [
    { name: 'phone', width: 390, height: 844 },
    { name: 'portrait-tablet', width: 1024, height: 1366 },
    { name: 'desktop', width: 1440, height: 900 },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const testCase of cases) {
        const errors = [];
        const context = await browser.newContext({
            viewport: { width: testCase.width, height: testCase.height },
            reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        page.on('console', message => {
            if (message.type() === 'error' || message.type() === 'warning') {
                errors.push(`${message.type()}: ${message.text()}`);
            }
        });
        page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

        await preparePage(page);
        await playCompleteSession(page, testCase);
        assert.deepEqual(errors, [], `${testCase.name} browser console must stay clean`);
        await context.close();
    }
    console.log('Lesson Zero name-card journey passed on phone, portrait tablet, and desktop.');
} finally {
    await browser.close();
}

async function preparePage(page) {
    const response = await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
    await page.evaluate(async () => {
        document.body.replaceChildren();
        await import('/src/academy/entrypoint.ts');
        const { loadLessonZeroContent } = await import('/src/academy/content/lesson-zero.ts');
        const { createLessonZeroNameCardDefinition } = await import('/src/academy/content/lesson-zero-name-card.ts');
        const { startLessonZeroNameCardSession, transitionLessonZeroNameCardSession } =
            await import('/src/academy/domain/lesson-zero-name-card-session.ts');
        const { createLessonZeroNameCardScreen } = await import('/src/academy/ui/lesson-zero-name-card-screen.ts');
        const content = await loadLessonZeroContent();
        const activity = content.lesson.activities.find(candidate =>
            candidate.id === 'activity:lesson-zero-name-card-draft');
        if (!activity) throw new Error('Authored name-card activity is missing.');
        const definition = createLessonZeroNameCardDefinition(activity, 'Henry');
        const proof = {
            definition,
            state: startLessonZeroNameCardSession(definition),
            evaluations: [],
            adaptive: [],
            supportEvents: [],
            audio: [],
            disposedAudio: 0,
            backs: 0,
            completes: 0,
            screen: null,
        };
        window.__nameCardProof = proof;

        window.__mountNameCard = state => {
            proof.screen?.dispose();
            proof.state = structuredClone(state);
            proof.screen = createLessonZeroNameCardScreen({
                language: 'en',
                definition,
                initialState: proof.state,
                pronunciation: {
                    async play(term, reading) {
                        proof.audio.push({ term, reading });
                        return { dispose() { proof.disposedAudio += 1; } };
                    },
                },
                async onTransition(_before, transition) {
                    proof.state = structuredClone(transition.state);
                    if (transition.evaluation) proof.evaluations.push(structuredClone(transition.evaluation));
                    if (transition.adaptive) proof.adaptive.push(structuredClone(transition.adaptive));
                    proof.supportEvents.push(...structuredClone(transition.supportEvents));
                },
                async onRestart(next) { proof.state = structuredClone(next); },
                async onBack() { proof.backs += 1; },
                async onComplete() { proof.completes += 1; },
            });
            document.body.replaceChildren(proof.screen.element);
        };
        window.__resumeNameCard = () => {
            const transition = transitionLessonZeroNameCardSession(
                definition,
                proof.state,
                { kind: 'resume' },
                Date.now(),
            );
            window.__mountNameCard(transition.state);
        };
        window.__mountNameCard(proof.state);
    });
}

async function playCompleteSession(page, testCase) {
    const screen = page.locator('[data-academy-screen="lesson-zero-name-card"]');
    await screen.waitFor();
    await waitForState(page, 'active', 'build');
    assert.equal(await screen.locator('input').count(), 0,
        `${testCase.name} must reuse the saved player name instead of asking again`);
    assert.equal(await screen.getByText('Henry', { exact: true }).count(), 1,
        `${testCase.name} must show the saved player name once in the available piece`);
    assert.equal(await screen.getByText(/One true role|language you study|truth|boundary/i).count(), 0,
        `${testCase.name} must not retain the discarded personal-facts form`);
    await assertResponsiveGeometry(page, testCase, 'build');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-build.png`), fullPage: true });

    await click(page, "Hear Rie's example");
    await page.waitForFunction(() => window.__nameCardProof.audio.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__nameCardProof.audio[0]), {
        term: 'りえです。',
        reading: 'りえです',
    });

    await screen.locator('[data-token-id="desu"]').click();
    await screen.locator('[data-token-id="learner-name"]').click();
    await click(page, 'Check');
    await waitForState(page, 'active', 'result');
    assert.equal(await screen.getByText('1. your name', { exact: false }).count(), 0,
        `${testCase.name} pattern must remain earned help`);
    await click(page, 'Show the pattern');
    assert.equal(await screen.getByText('1. your name', { exact: false }).count(), 1,
        `${testCase.name} earned support must reveal the two-piece pattern`);
    assert.deepEqual(
        await page.evaluate(() => window.__nameCardProof.supportEvents.map(event => event.supportKind)),
        ['transcript', 'translation', 'model-answer'],
    );

    await click(page, 'Try again');
    await waitForState(page, 'active', 'build');
    await screen.locator('[data-token-id="learner-name"]').click();
    await screen.locator('.academy-name-card-back').click();
    await page.waitForFunction(() => window.__nameCardProof.state.status === 'paused');
    assert.equal(await page.evaluate(() => window.__nameCardProof.backs), 1,
        `${testCase.name} back must leave through the route callback`);
    await page.evaluate(() => window.__resumeNameCard());
    await waitForState(page, 'active', 'build');
    assert.deepEqual(await page.evaluate(() => window.__nameCardProof.state.selectedTokenIds), ['learner-name']);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__nameCardProof.state).includes('Henry')), false,
        `${testCase.name} checkpoint must not duplicate the saved player name`);

    await screen.locator('[data-token-id="desu"]').click();
    await click(page, 'Check');
    await waitForState(page, 'complete', 'complete');
    const proof = await page.evaluate(() => ({
        state: window.__nameCardProof.state,
        evaluations: window.__nameCardProof.evaluations,
        adaptive: window.__nameCardProof.adaptive,
        supportEvents: window.__nameCardProof.supportEvents,
    }));
    assert.deepEqual(proof.evaluations.map(evaluation => evaluation.result.outcome), ['lapse', 'pass']);
    assert.equal(proof.evaluations[1].reviewSeeds.length, 1,
        `${testCase.name} repaired card must seed only the reusable desu frame`);
    assert.deepEqual(proof.adaptive.map(event => event.action), ['repair', 'repair']);
    assert.equal(JSON.stringify(proof.state).includes('Henry'), false);
    assert.equal(await screen.getByText('Henryです。', { exact: true }).count(), 1);
    await click(page, 'Hear Rie');
    await page.waitForFunction(() => window.__nameCardProof.audio.length === 2);
    assert.equal(await page.evaluate(() => window.__nameCardProof.audio[1].term), 'はい、できました。机に置きましょう。');

    await assertResponsiveGeometry(page, testCase, 'complete');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}.png`), fullPage: true });
    await click(page, 'Put it on the desk');
    assert.equal(await page.evaluate(() => window.__nameCardProof.completes), 1,
        `${testCase.name} completion must return through the lesson-flow callback`);
}

async function click(page, name) {
    const button = page.getByRole('button', { name, exact: true });
    await button.waitFor();
    await button.click();
}

async function waitForState(page, status, stage) {
    await page.waitForFunction(([nextStatus, nextStage]) => {
        const screen = document.querySelector('[data-academy-screen="lesson-zero-name-card"]');
        return screen?.dataset.sessionStatus === nextStatus && screen?.dataset.sessionStage === nextStage;
    }, [status, stage]);
}

async function assertResponsiveGeometry(page, testCase, stage) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
        `${testCase.name} ${stage} must not create document-level horizontal overflow`);
    const selectors = [
        '.academy-name-card-shell',
        '.academy-name-card-header',
        '.academy-name-card-body',
        '.academy-name-card-scene',
    ];
    for (const selector of selectors) {
        const locator = page.locator(selector).first();
        const box = await locator.boundingBox();
        assert.ok(box, `${testCase.name} ${stage} ${selector} must have browser bounds`);
        assert.ok(box.x >= -1 && box.x + box.width <= testCase.width + 1,
            `${testCase.name} ${stage} ${selector} must fit horizontally: ${JSON.stringify(box)}`);
    }
    for (const [index, control] of (await page.locator('button:visible, input:visible').all()).entries()) {
        const box = await control.boundingBox();
        assert.ok(box && box.x >= -1 && box.x + box.width <= testCase.width + 1,
            `${testCase.name} ${stage} control ${index + 1} must fit horizontally: ${JSON.stringify(box)}`);
    }
}

async function assertAccessible(page) {
    const results = await new AxeBuilder({ page }).include('[data-academy-screen="lesson-zero-name-card"]').analyze();
    const blocking = results.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map(node => ({
            target: node.target,
            html: node.html,
            failureSummary: node.failureSummary,
        })),
    })), [], 'Name-card screen must have no serious or critical Axe violations');
}
