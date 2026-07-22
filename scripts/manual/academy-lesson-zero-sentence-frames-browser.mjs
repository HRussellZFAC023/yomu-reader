import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5174';
const artifactDir = path.resolve('tmp/academy-lesson-zero-sentence-frames');
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
            if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`);
        });
        page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

        await preparePage(page);
        await playCompleteSession(page, testCase);
        await assertAccessible(page);
        await page.screenshot({ path: path.join(artifactDir, `${testCase.name}.png`), fullPage: true });
        assert.deepEqual(errors, [], `${testCase.name} browser console must stay clean`);
        await context.close();
    }
    console.log('Lesson Zero sentence-frame browser journey passed on phone, portrait tablet, and desktop.');
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
        const { createLessonZeroSentenceFrameDefinition } = await import('/src/academy/content/lesson-zero-sentence-frames.ts');
        const { startLessonZeroSentenceFrameSession, transitionLessonZeroSentenceFrameSession } =
            await import('/src/academy/domain/lesson-zero-sentence-frame-session.ts');
        const { createLessonZeroSentenceFrameScreen } =
            await import('/src/academy/ui/lesson-zero-sentence-frame-screen.ts');
        const content = await loadLessonZeroContent();
        const activity = content.lesson.activities.find(candidate =>
            candidate.id === 'activity:lesson-zero-build-sentence-frames');
        if (!activity) throw new Error('Authored sentence-frame activity is missing.');
        const definition = createLessonZeroSentenceFrameDefinition(activity, 'Henry');
        const proof = {
            definition,
            state: startLessonZeroSentenceFrameSession(definition),
            evaluations: [],
            completionEvaluations: [],
            supportEvents: [],
            audio: [],
            disposedAudio: 0,
            backs: 0,
            completes: 0,
            screen: null,
        };
        window.__sentenceFrameProof = proof;

        window.__mountSentenceFrames = state => {
            proof.screen?.dispose();
            proof.state = structuredClone(state);
            proof.screen = createLessonZeroSentenceFrameScreen({
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
                    if (transition.completionEvaluation) {
                        proof.completionEvaluations.push(structuredClone(transition.completionEvaluation));
                    }
                    proof.supportEvents.push(...structuredClone(transition.supportEvents));
                },
                async onRestart(stateAfterRestart) { proof.state = structuredClone(stateAfterRestart); },
                async onBack() { proof.backs += 1; },
                async onComplete() { proof.completes += 1; },
            });
            document.body.replaceChildren(proof.screen.element);
        };
        window.__resumeSentenceFrames = () => {
            const transition = transitionLessonZeroSentenceFrameSession(
                definition,
                proof.state,
                { kind: 'resume' },
                Date.now(),
            );
            window.__mountSentenceFrames(transition.state);
        };
        window.__mountSentenceFrames(proof.state);
    });
}

async function playCompleteSession(page, testCase) {
    const screen = page.locator('[data-academy-screen="lesson-zero-sentence-frames"]');
    await screen.waitFor();
    await click(page, 'Make the first sentence');
    await waitForState(page, 'active', 'teach');
    await click(page, 'Try this turn');
    await waitForState(page, 'active', 'build');

    const definition = await page.evaluate(() => window.__sentenceFrameProof.definition);
    const first = definition.frames[0];
    for (const tokenId of first.target.bankOrder) await chooseToken(page, tokenId);
    await click(page, 'Let Rie read it');
    await waitForState(page, 'active', 'result');
    assert.equal(await screen.locator('.academy-sentence-frame-paper[data-outcome="lapse"]').count(), 1,
        `${testCase.name} first committed attempt must be a lapse`);
    assert.equal(await screen.locator('[data-repair-model]').count(), 0,
        `${testCase.name} model answer must remain hidden before earned support`);

    await click(page, 'Show Rie’s sentence');
    assert.equal(await screen.locator('[data-repair-model="identity"]').count(), 1,
        `${testCase.name} lapse must unlock the model sentence`);
    assert.equal(await page.evaluate(() => window.__sentenceFrameProof.supportEvents.length), 3,
        `${testCase.name} earned model must record transcript, translation, and model-answer support`);

    await click(page, 'Rebuild the sentence');
    await waitForState(page, 'active', 'build');
    await chooseToken(page, first.target.correctOrder[0]);
    await page.locator('.academy-sentence-frame-back').click();
    await page.waitForFunction(() => window.__sentenceFrameProof.state.status === 'paused');
    assert.equal(await page.evaluate(() => window.__sentenceFrameProof.backs), 1,
        `${testCase.name} back must leave through the route callback`);
    await page.evaluate(() => window.__resumeSentenceFrames());
    await waitForState(page, 'active', 'build');
    assert.equal(await screen.locator(`.academy-sentence-frame-selected-rail [data-token-id="${first.target.correctOrder[0]}"]`).count(), 1,
        `${testCase.name} paused sentence must resume with its selected word`);

    for (const tokenId of first.target.correctOrder.slice(1)) await chooseToken(page, tokenId);
    await click(page, 'Let Rie read it');
    await waitForState(page, 'active', 'result');
    assert.equal(await screen.locator('.academy-sentence-frame-paper[data-outcome="pass"]').count(), 1);
    await click(page, 'Hear Rie-sensei');
    await page.waitForFunction(() => window.__sentenceFrameProof.audio.length === 1);
    await click(page, 'Use the next shape');

    for (const frame of definition.frames.slice(1)) {
        await page.waitForFunction(frameId => document.querySelector('[data-academy-screen="lesson-zero-sentence-frames"]')?.dataset.frameId === frameId, frame.id);
        await click(page, 'Try this turn');
        await waitForState(page, 'active', 'build');
        for (const tokenId of frame.target.correctOrder) await chooseToken(page, tokenId);
        await click(page, 'Let Rie read it');
        if (frame.id !== 'parallel') {
            await waitForState(page, 'active', 'result');
            await click(page, 'Use the next shape');
        }
    }

    await waitForState(page, 'complete', 'complete');
    const proof = await page.evaluate(() => ({
        state: window.__sentenceFrameProof.state,
        evaluations: window.__sentenceFrameProof.evaluations,
        completionEvaluations: window.__sentenceFrameProof.completionEvaluations,
        supportEvents: window.__sentenceFrameProof.supportEvents,
        audio: window.__sentenceFrameProof.audio,
    }));
    assert.deepEqual(proof.state.passedFrameIds, ['identity', 'correction', 'question', 'noun-link', 'parallel']);
    assert.equal(proof.evaluations.length, 6, `${testCase.name} must record one lapse plus five child passes`);
    assert.equal(proof.completionEvaluations.length, 1, `${testCase.name} must record one parent completion`);
    assert.equal(proof.evaluations.flatMap(evaluation => evaluation.reviewSeeds).length, 5,
        `${testCase.name} must seed one review item for each repaired/passed shape`);
    assert.deepEqual(proof.supportEvents.map(event => event.supportKind), ['transcript', 'translation', 'model-answer']);
    assert.match(proof.audio[0]?.term ?? '', /届きました/u);
    assert.equal(await screen.locator('.academy-sentence-frame-finished-line').count(), 5);

    await assertResponsiveGeometry(page, testCase);
    await click(page, 'Continue your day');
    assert.equal(await page.evaluate(() => window.__sentenceFrameProof.completes), 1,
        `${testCase.name} completion must return through the lesson-flow callback`);
}

async function chooseToken(page, tokenId) {
    const token = page.locator(`.academy-sentence-frame-bank [data-token-id="${tokenId}"]`);
    await token.waitFor();
    await token.click();
    await page.locator(`.academy-sentence-frame-selected-rail [data-token-id="${tokenId}"]`).waitFor();
}

async function click(page, name) {
    const button = page.getByRole('button', { name, exact: true });
    await button.waitFor();
    await button.click();
}

async function waitForState(page, status, stage) {
    await page.waitForFunction(([nextStatus, nextStage]) => {
        const screen = document.querySelector('[data-academy-screen="lesson-zero-sentence-frames"]');
        return screen?.dataset.sessionStatus === nextStatus && screen?.dataset.sessionStage === nextStage;
    }, [status, stage]);
}

async function assertResponsiveGeometry(page, testCase) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
        `${testCase.name} must not create document-level horizontal overflow`);
    const selectors = [
        '.academy-sentence-frame-shell',
        '.academy-sentence-frame-header',
        '.academy-sentence-frame-paper',
        '.academy-sentence-frame-finished-lines',
        '.academy-sentence-frame-actions',
    ];
    for (const selector of selectors) {
        const locator = page.locator(selector).first();
        const box = await locator.boundingBox();
        assert.ok(box, `${testCase.name} ${selector} must have browser bounds`);
        assert.ok(box.x >= -1 && box.x + box.width <= testCase.width + 1,
            `${testCase.name} ${selector} must fit horizontally: ${JSON.stringify(box)}`);
    }
    for (const [index, button] of (await page.locator('button:visible').all()).entries()) {
        const box = await button.boundingBox();
        assert.ok(box && box.x >= -1 && box.x + box.width <= testCase.width + 1,
            `${testCase.name} button ${index + 1} must fit horizontally: ${JSON.stringify(box)}`);
    }
}

async function assertAccessible(page) {
    const results = await new AxeBuilder({ page }).include('[data-academy-screen="lesson-zero-sentence-frames"]').analyze();
    const blocking = results.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map(node => node.target),
    })), [], 'Sentence-frame screen must have no serious or critical Axe violations');
}
