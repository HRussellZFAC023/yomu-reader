import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5278';
const artifactDir = path.resolve(process.env.PROFILE_SCREENSHOTS ?? 'qa-artifacts/profile');
const cases = [
    { name: 'phone', width: 390, height: 844, input: 'keyboard' },
    { name: 'portrait-tablet', width: 1024, height: 1366, input: 'touch' },
    { name: 'desktop', width: 1440, height: 900, input: 'keyboard' },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const testCase of cases) await verifyProfileJourney(testCase);
    console.log('Academy learner profile passed through real enrollment, persistence, and reload on phone, portrait tablet, and desktop.');
} finally {
    await browser.close();
}

async function verifyProfileJourney(testCase) {
    const context = await browser.newContext({
        viewport: { width: testCase.width, height: testCase.height },
        locale: 'en-GB',
        reducedMotion: 'reduce',
        hasTouch: testCase.input === 'touch',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

    const databaseName = `yomu-academy-profile-proof-${testCase.name}`;
    await assertServer(page);
    await mountEnrollment(page, databaseName, true);

    const screen = page.locator('.academy-profile-screen[data-profile-step="name"]');
    await screen.waitFor();
    const name = screen.locator('input[name="displayName"]');
    assert.equal(await name.inputValue(), '', `${testCase.name} naming moment must not inherit an email or placeholder identity`);
    assert.equal(await name.getAttribute('maxlength'), '40');
    assert.equal(await name.getAttribute('enterkeyhint'), 'next');
    assert.equal(await name.evaluate(node => node === document.activeElement), true,
        `${testCase.name} must place focus directly in the naming field`);
    assert.equal(await screen.locator('.academy-vn-translation').isVisible(), true,
        `${testCase.name} zero-kana learners must see Rie's English support immediately`);
    assert.match(await screen.locator('.academy-vn-translation').textContent() ?? '', /What should I call you\?/);
    assert.equal(await screen.getByText(/one true role|truth|boundary|language you study/i).count(), 0,
        `${testCase.name} must not retain the discarded profile prose`);
    await assertResponsiveGeometry(page, testCase, 'name');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-name.png`) });

    await name.fill('Mina');
    if (testCase.input === 'keyboard') await name.press('Enter');
    else await screen.locator('.academy-profile-advance').tap();
    await page.locator('.academy-profile-screen[data-profile-step="reason"]').waitFor();
    const reason = page.locator('textarea[name="learningReason"]');
    assert.equal(await reason.getAttribute('maxlength'), '160');
    assert.equal(await reason.getAttribute('rows'), '2');
    assert.equal(await reason.getAttribute('placeholder'), 'Read manga, talk with family, travel…');
    assert.equal(await reason.evaluate(node => node === document.activeElement), true,
        `${testCase.name} must advance focus with the conversation`);
    assert.equal(await page.locator('.academy-vn-translation').isVisible(), true);
    assert.equal(await page.locator('.academy-vn-translation').textContent(),
        'Mina, what would you like to be able to do in Japanese?');
    await assertResponsiveGeometry(page, testCase, 'reason');
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-reason.png`) });

    await reason.fill('Read manga and talk with family');
    if (testCase.input === 'touch') await page.locator('.academy-profile-advance').tap();
    else await page.locator('.academy-profile-advance').click();
    const portrait = page.locator('.academy-profile-screen[data-profile-step="portrait"]');
    await portrait.waitFor();
    await portrait.locator('.academy-portrait-image').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    assert.equal(await portrait.locator('input[name="displayName"]').count(), 0,
        `${testCase.name} portrait choice must not ask for the learner name again`);
    const chosen = portrait.locator('input[value="quality-4"]');
    if (testCase.input === 'touch') await chosen.locator('..').tap();
    else await chosen.check();
    assert.equal(await chosen.isChecked(), true);
    await assertPortraitGeometry(page, testCase);
    await assertResponsiveGeometry(page, testCase, 'portrait');
    await assertAccessible(page);
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-portrait.png`) });

    const submit = portrait.getByRole('button', { name: 'That’s me' });
    if (testCase.input === 'touch') await submit.tap();
    else await submit.click();
    const rie = page.locator('.academy-rie-unlock-screen');
    await rie.waitFor();
    assert.equal(await rie.locator('input, textarea').count(), 0,
        `${testCase.name} first Rie scene must reuse the saved identity without another form`);
    const firstSnapshot = await readProof(page);
    assert.equal(firstSnapshot.checkpoint.route, 'rie-unlock');
    assert.deepEqual(firstSnapshot.checkpoint.routeHistory.map(frame => frame.route), ['profile']);
    assert.equal(firstSnapshot.language, 'en');
    assert.deepEqual(firstSnapshot.profileEvents.map(event => event.profile), [{
        displayName: 'Mina',
        learningReason: 'Read manga and talk with family',
        portraitId: 'quality-4',
    }]);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await mountEnrollment(page, databaseName, false);
    await rie.waitFor();
    const restored = await readProof(page);
    assert.equal(restored.checkpoint.route, 'rie-unlock', `${testCase.name} must restore the first Rie scene`);
    assert.deepEqual(restored.profileEvents, firstSnapshot.profileEvents,
        `${testCase.name} reload must not duplicate or alter the profile event`);
    assert.equal(restored.projection.displayName, 'Mina');
    assert.equal(restored.projection.learningReason, 'Read manga and talk with family');
    assert.equal(restored.projection.portraitId, 'quality-4');
    await assertResponsiveGeometry(page, testCase, 'restored-rie');
    await assertAccessible(page, '.academy-rie-unlock-screen');
    await page.screenshot({ path: path.join(artifactDir, `${testCase.name}-restored-rie.png`) });
    assert.deepEqual(errors, [], `${testCase.name} browser console must stay clean`);
    await context.close();
}

async function assertServer(page) {
    const response = await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
}

async function mountEnrollment(page, databaseName, reset) {
    await page.evaluate(async ({ databaseName: name, resetDatabase }) => {
        document.body.replaceChildren();
        await import('/src/academy/entrypoint.ts');
        if (resetDatabase) {
            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error(`Profile proof database is blocked: ${name}`));
            });
        }
        const [{ openAcademyPersistence }, { createLearnerEvidence }, { createEnrollmentFlow }, { transitionAcademyRoute }] = await Promise.all([
            import('/src/academy/persistence/indexeddb.ts'),
            import('/src/academy/evidence/learner-evidence.ts'),
            import('/src/academy/routing/enrollment-flow.ts'),
            import('/src/academy/routing/route-history.ts'),
        ]);
        const persistence = await openAcademyPersistence(indexedDB, name);
        const evidence = createLearnerEvidence(persistence.events, {
            async ingest() {},
            async due() { return []; },
            async rate() {},
        });
        await evidence.initialize();
        let checkpoint = await persistence.checkpoint.load() ?? {
            schemaVersion: 2,
            route: 'profile',
            routeHistory: [],
            presentationMode: 'story',
            updatedAt: 1,
        };
        localStorage.setItem('yomu:academy:language:v1', 'en');
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
        const flow = createEnrollmentFlow({ access: {}, evidence, pronunciation: {} });
        const render = async () => {
            await flow.render(checkpoint.route, {
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
        };
        await persistence.checkpoint.save(checkpoint);
        window.__academyProfileProof = {
            async snapshot() {
                const events = await evidence.history();
                return {
                    checkpoint: structuredClone(checkpoint),
                    language: localStorage.getItem('yomu:academy:language:v1'),
                    profileEvents: events.filter(event => event.kind === 'profile-changed'),
                    projection: structuredClone(evidence.projection.profile),
                };
            },
        };
        await render();
    }, { databaseName, resetDatabase: reset });
}

async function readProof(page) {
    return page.evaluate(() => window.__academyProfileProof.snapshot());
}

async function assertPortraitGeometry(page, testCase) {
    const geometry = await page.locator('.academy-profile-screen').evaluate(screen => {
        const rect = selector => {
            const element = screen.querySelector(selector);
            const box = element?.getBoundingClientRect();
            return box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height } : null;
        };
        const paper = rect('.academy-vn-object-slot');
        const actions = rect('.academy-vn-dialogue');
        const cards = [...screen.querySelectorAll('.academy-portrait-option')].map(element => {
            const box = element.getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
        });
        const images = [...screen.querySelectorAll('.academy-portrait-image')].map(element => element.getBoundingClientRect().height);
        return { paper, actions, cards, images };
    });
    assert.ok(geometry.paper && geometry.actions);
    assert.ok(geometry.paper.bottom <= geometry.actions.top - 8,
        `${testCase.name} portrait paper must not overlap its action strip: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.cards.every(card => card.left >= geometry.paper.left && card.right <= geometry.paper.right
        && card.top >= geometry.paper.top && card.bottom <= geometry.paper.bottom),
    `${testCase.name} portrait choices must fit inside the paper page`);
    assert.ok(geometry.images.every(height => height >= (testCase.name === 'desktop' ? 100 : 140)),
        `${testCase.name} portrait choices must show meaningful face and pose detail`);
}

async function assertResponsiveGeometry(page, testCase, phase) {
    const geometry = await page.evaluate(() => {
        const bounds = node => {
            const rect = node?.getBoundingClientRect();
            return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
        };
        const screen = document.body.firstElementChild;
        return {
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            screen: bounds(screen),
            dialogue: bounds(screen?.querySelector('.academy-vn-dialogue')),
            controls: [...(screen?.querySelectorAll('button, input:not([type="radio"]), textarea, .academy-portrait-option') ?? [])]
                .filter(node => node.getClientRects().length > 0)
                .map(bounds),
        };
    });
    assert.ok(geometry.documentWidth <= testCase.width,
        `${testCase.name} ${phase} must not overflow horizontally (${geometry.documentWidth}/${testCase.width})`);
    assert.ok(geometry.screen && geometry.screen.left >= -1 && geometry.screen.right <= geometry.viewport.width + 1,
        `${testCase.name} ${phase} screen must fit: ${JSON.stringify(geometry.screen)}`);
    if (geometry.dialogue) {
        assert.ok(geometry.dialogue.left >= -1 && geometry.dialogue.right <= geometry.viewport.width + 1,
            `${testCase.name} ${phase} dialogue must fit: ${JSON.stringify(geometry.dialogue)}`);
    }
    for (const [index, control] of geometry.controls.entries()) {
        assert.ok(control.left >= -1 && control.right <= geometry.viewport.width + 1,
            `${testCase.name} ${phase} control ${index + 1} must fit: ${JSON.stringify(control)}`);
        assert.ok(control.width >= 44 && control.height >= 44,
            `${testCase.name} ${phase} control ${index + 1} must be a 44px target: ${JSON.stringify(control)}`);
    }
}

async function assertAccessible(page, selector = '.academy-profile-screen') {
    const axe = await new AxeBuilder({ page }).include(selector).analyze();
    const blocking = axe.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    assert.deepEqual(blocking.map(violation => ({
        id: violation.id,
        nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
    })), [], `${selector} must have no serious or critical Axe violations`);
}
