import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5174';
const artifactDir = path.resolve(
    process.env.HIRAGANA_SCREENSHOTS ?? 'qa-artifacts/lesson-zero-hiragana',
);
const activityId = 'activity:lesson-zero-hiragana-bootcamp';
const answers = new Map([
    ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
    ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
    ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
    ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
    ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
    ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
    ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
    ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
    ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
    ['わ', 'wa'], ['を', 'o'], ['ん', 'n'],
]);
const viewports = [
    { name: 'phone-320', width: 320, height: 700 },
    { name: 'phone-390', width: 390, height: 844, complete: true },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'desktop-1440', width: 1440, height: 900 },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of viewports) await verify(browser, viewport);
    console.log('Lesson 0 hiragana passed story handoff, 46-kana recall, reload, pictograph, responsive, and Axe proof.');
} finally {
    await browser.close();
}

async function verify(browser, viewport) {
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: 'en-GB',
        reducedMotion: 'reduce',
        hasTouch: viewport.width < 1024,
    });
    await context.route('**/academy/media/audio/**', route =>
        route.fulfill({ status: 204, headers: { 'cache-control': 'no-store' } }));
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
            problems.push(`console: ${message.text()}`);
        }
    });
    page.on('response', response => {
        if (response.status() >= 400 && response.status() !== 401) {
            problems.push(`response: ${response.status()} ${response.url()}`);
        }
    });

    await reachStoryHandoff(page, `hiragana-${viewport.name}-${Date.now()}`);
    const handoff = page.locator(`[data-activity-id="${activityId}"]`);
    await handoff.waitFor();
    assert.ok(
        ['missing', 'placement-equivalent'].includes(await handoff.getAttribute('data-activity-gate')),
        'the fresh or placement-equivalent route must leave kana practice reachable',
    );
    assert.doesNotMatch(await handoff.innerText(), /bootcamp|activity:|route|source/iu);
    await handoff.locator('.academy-story-open-activity').click();

    const screen = page.locator('[data-academy-screen="lesson-zero-hiragana-bootcamp"]');
    await screen.waitFor();
    assert.match(await screen.innerText(), /Kana practice/iu);
    assert.match(await screen.innerText(), /The full hiragana chart/u);
    assert.doesNotMatch(await screen.innerText(), /sprint|lab|unlock/iu);
    assert.equal(await screen.locator('.academy-hiragana-chart-kana').count(), 46);
    await assertSurface(page, viewport, 'intro');
    await page.screenshot({
        path: path.join(artifactDir, `${viewport.name}-intro.png`),
        fullPage: true,
    });

    if (!viewport.complete) {
        await page.getByRole('button', { name: 'Start あ-row' }).click();
        await screen.locator('[data-session-stage="row-preview"], .academy-hiragana-row').first().waitFor();
        await assertPictographs(page, 5);
        await assertSurface(page, viewport, 'row preview');
        await page.screenshot({
            path: path.join(artifactDir, `${viewport.name}-row.png`),
            fullPage: true,
        });
        assert.deepEqual(problems, []);
        await context.close();
        return;
    }

    await page.getByRole('button', { name: 'I know hiragana — test me' }).click();
    await page.getByRole('button', { name: 'Turn over the chart' }).click();
    let didLapse = false;
    for (let attempt = 0; attempt < 47; attempt += 1) {
        const kana = (await screen.locator('.academy-hiragana-kana-mastery').innerText()).trim();
        const answer = answers.get(kana);
        assert.ok(answer, `Unknown hiragana prompt ${kana}`);
        await screen.locator('input[name="romaji"]').fill(!didLapse ? 'wrong' : answer);
        didLapse = true;
        await page.getByRole('button', { name: 'Check' }).click();
        await page.waitForFunction(expected => {
            const count = document.querySelector('.academy-hiragana-screen')
                ?.getAttribute('data-attempt-count');
            return Number(count) >= expected;
        }, attempt + 1);

        if (attempt === 11) {
            const progressBefore = await screen.getAttribute('data-mastery-progress');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.locator('[data-academy-screen="lesson-zero-hiragana-bootcamp"]').waitFor();
            assert.equal(
                await page.locator('[data-academy-screen="lesson-zero-hiragana-bootcamp"]')
                    .getAttribute('data-mastery-progress'),
                progressBefore,
                'mixed recall must survive a cold reload',
            );
        }
    }

    const completed = page.locator('[data-academy-screen="lesson-zero-hiragana-bootcamp"]');
    await completed.locator('[data-session-status="complete"], .academy-hiragana-stamp').first().waitFor();
    assert.equal(await completed.getAttribute('data-mastery-progress'), '46/46');
    assert.match(await completed.innerText(), /All 46 saved/u);
    assert.equal(await page.locator('.jpdb-reader-popover').count(), 0);
    await assertSurface(page, viewport, 'complete');
    await page.screenshot({
        path: path.join(artifactDir, `${viewport.name}-complete.png`),
        fullPage: true,
    });

    await page.getByRole('button', { name: 'Write the first five' }).click();
    const returned = page.locator(`[data-activity-id="${activityId}"][data-activity-gate="passed"]`);
    await returned.waitFor();
    assert.equal(await returned.locator('.academy-story-activity-continue').count(), 1);
    assert.deepEqual(problems, []);
    await context.close();
}

async function assertPictographs(page, expected) {
    const pictures = page.locator('[data-hiragana-anchor-image]');
    assert.equal(await pictures.count(), expected, 'each introduced anchor word needs one pictograph');
    for (let index = 0; index < expected; index += 1) {
        const picture = pictures.nth(index);
        const source = await picture.getAttribute('src');
        assert.match(source ?? '', /^\/academy\/art\/lesson-zero\/hiragana-anchors\//u);
        assert.ok((await picture.getAttribute('alt'))?.trim(), 'each pictograph needs useful alt text');
        assert.equal(await picture.evaluate(image => new Promise(resolve => {
            if (!(image instanceof HTMLImageElement)) {
                resolve(false);
                return;
            }
            if (image.complete) {
                resolve(image.naturalWidth > 0);
                return;
            }
            image.addEventListener('load', () => resolve(image.naturalWidth > 0), { once: true });
            image.addEventListener('error', () => resolve(false), { once: true });
        })), true);
    }
}

async function assertSurface(page, viewport, label) {
    const screen = page.locator('.academy-hiragana-screen');
    const geometry = await screen.evaluate(root => {
        const rect = selector => {
            const node = root.querySelector(selector);
            const value = node?.getBoundingClientRect();
            return value ? {
                left: value.left,
                top: value.top,
                right: value.right,
                bottom: value.bottom,
                width: value.width,
                height: value.height,
            } : null;
        };
        const overlap = (left, right) => Boolean(left && right
            && left.left < right.right && left.right > right.left
            && left.top < right.bottom && left.bottom > right.top);
        const paper = rect('.academy-hiragana-paper');
        const portrait = rect('.academy-hiragana-portrait');
        const header = rect('.academy-hiragana-header');
        return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            paper,
            portrait,
            headerPaperOverlap: overlap(header, paper),
            controls: [...root.querySelectorAll('button')]
                .map(node => node.getBoundingClientRect())
                .filter(value => value.width > 0 && value.height > 0)
                .map(value => ({ width: value.width, height: value.height })),
        };
    });
    assert.equal(geometry.scrollWidth, geometry.clientWidth, `${viewport.name} ${label} must not overflow`);
    assert.equal(geometry.headerPaperOverlap, false, `${viewport.name} ${label} header must not cover the paper`);
    assert.ok(geometry.paper?.width >= (viewport.width <= 390 ? viewport.width - 20 : 500));
    assert.ok(geometry.controls.every(control => control.width >= 44 && control.height >= 44));

    const axe = await new AxeBuilder({ page }).include('.academy-hiragana-screen').analyze();
    const blocking = axe.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
    assert.deepEqual(
        blocking.map(item => item.id),
        [],
        JSON.stringify(blocking.map(item => ({
            id: item.id,
            nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
        })), null, 2),
    );
}

async function reachStoryHandoff(page, runId) {
    const response = await page.goto(`${baseUrl}/academy/?qa-auth=bypass&qa-run=${runId}`, {
        waitUntil: 'domcontentloaded',
    });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
    await page.getByRole('textbox').fill('YOMU-LOCAL');
    await page.getByRole('button', { name: 'Open the doors' }).click();
    await page.locator('input[name="displayName"]').fill('Henry');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('textarea[name="learningReason"]').fill('To understand Japanese as people use it');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('input[name="portrait"]').first().check();
    await page.getByRole('button', { name: 'That’s me' }).click();
    const introduction = page.locator('[data-academy-screen="rie-introduction"]');
    await introduction.waitFor();
    const action = introduction.locator('.academy-rie-introduction-primary');
    if ((await action.textContent())?.trim() !== 'Come in') {
        await action.click();
        await page.waitForFunction(() => {
            const button = document.querySelector('.academy-rie-introduction-primary');
            return button?.textContent?.trim() === 'Come in' && !button.disabled;
        });
    }
    await action.evaluate(button => button.click());
    const start = page.locator('.academy-start-screen[data-academy-route="start"]');
    await start.waitFor();
    await start.locator('[data-start-route="lesson-zero"]').click();
    await page.locator('[data-academy-screen="story-package"]').waitFor();

    await page.evaluate(async ({ targetActivityId }) => {
        const app = window.__yomuAcademy;
        if (!app || typeof app.go !== 'function') throw new Error('Academy QA route seam is unavailable.');
        const { serializeStoryCursor } = await import('/src/academy/content/story-runner.ts');
        await app.go('story', {
            sectionId: serializeStoryCursor({
                version: 1,
                arcId: 'arc:open-doors:first-route',
                sceneId: 'scene:blank-atlas:sound-script-map',
                nodeId: 'activity-node:blank-atlas:hiragana-bootcamp',
                choices: {},
            }),
            lessonId: undefined,
            activityId: undefined,
        });
        const handoff = document.querySelector(`[data-activity-id="${targetActivityId}"]`);
        if (!handoff) throw new Error('Hiragana story handoff did not render.');
    }, { targetActivityId: activityId });
}
