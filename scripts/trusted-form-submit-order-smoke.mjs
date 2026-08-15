#!/usr/bin/env node
// Real-engine contract for Reader form authorization. requestSubmit() produces
// a browser-trusted submit even when hostile page code calls it, so jsdom's
// trust model cannot prove this boundary. Keep Chromium, Firefox, and WebKit
// mandatory; Firefox's native submit runs after the click microtask checkpoint,
// which is the ordering that originally exposed the grant-stealing regression.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const [{ text: browserBundle }] = (await build({
    bundle: true,
    format: 'iife',
    logLevel: 'silent',
    platform: 'browser',
    target: ['chrome120', 'firefox120'],
    stdin: {
        contents: `
            import {
                bindAuthorizedReaderFormSubmit,
                dispatchAuthorizedReaderControlEvent,
                installTrustedReaderRootBoundary,
            } from './src/reader/ui/trusted-interaction.ts';

            type ProbeState = {
                attackPhase: string | null;
                attempts: string[];
                baseline: string[];
                callbackActiveElements: string[];
                callbackPhases: string[];
                clickDetails: number[];
                clickTrust: boolean[];
                documentCaptureSubmits: number;
                keydowns: string[];
                submitPhases: string[];
                submitTrust: boolean[];
                timeline: string[];
            };

            let hostileLifecycle: AbortController | undefined;
            let state: ProbeState;

            function freshState(): ProbeState {
                return {
                    attackPhase: null,
                    attempts: [],
                    baseline: [],
                    callbackActiveElements: [],
                    callbackPhases: [],
                    clickDetails: [],
                    clickTrust: [],
                    documentCaptureSubmits: 0,
                    keydowns: [],
                    submitPhases: [],
                    submitTrust: [],
                    timeline: [],
                };
            }

            function resetFixture(markup: string): void {
                hostileLifecycle?.abort();
                hostileLifecycle = new AbortController();
                state = freshState();
                document.body.innerHTML = markup;
            }

            function readerForm(): { button: HTMLButtonElement; form: HTMLFormElement } {
                const form = document.querySelector<HTMLFormElement>('#reader-form');
                const button = document.querySelector<HTMLButtonElement>('#reader-save');
                if (!form || !button) throw new Error('Reader form fixture did not mount.');
                return { form, button };
            }

            function mountReaderForm(): { button: HTMLButtonElement; form: HTMLFormElement } {
                resetFixture([
                    '<div data-jpdb-reader-root="true">',
                    '<form id="reader-form">',
                    '<input id="reader-name" name="name" value="learner">',
                    '<input id="reader-url" name="endpoint" type="url" value="https://yomureader.com/">',
                    '<input id="reader-checkbox" name="checkbox" type="checkbox">',
                    '<input id="reader-radio" name="radio" type="radio">',
                    '<select id="reader-select" name="mode"><option value="one">One</option></select>',
                    '<button id="reader-save" type="submit">Save</button>',
                    '</form>',
                    '</div>',
                ].join(''));
                const controls = readerForm();
                bindAuthorizedReaderFormSubmit(controls.form, () => {
                    const phase = state.attackPhase ?? 'native';
                    const active = document.activeElement instanceof HTMLElement
                        ? document.activeElement.id || document.activeElement.localName
                        : 'none';
                    state.callbackActiveElements.push(active);
                    state.callbackPhases.push(phase);
                    state.timeline.push('callback:' + phase);
                });
                controls.form.addEventListener('click', event => {
                    if (event.target !== controls.button) return;
                    state.clickTrust.push(event.isTrusted);
                    state.clickDetails.push(event.detail);
                });
                controls.form.addEventListener('keydown', event => {
                    state.keydowns.push(event.key + ':' + event.isComposing + ':' + event.isTrusted);
                });
                controls.form.addEventListener('submit', event => {
                    state.submitTrust.push(event.isTrusted);
                    state.submitPhases.push(state.attackPhase ?? 'native');
                });
                return controls;
            }

            function runAttack(label: string, action: () => void): void {
                state.attempts.push(label);
                state.timeline.push('attack:' + label);
                state.attackPhase = label;
                try {
                    action();
                } finally {
                    state.attackPhase = null;
                }
            }

            const probe = {
                installBoundary(): void {
                    installTrustedReaderRootBoundary(document);
                },

                setupBaseline(): void {
                    resetFixture('<form id="baseline-form"><button id="baseline-save" type="submit">Save</button></form>');
                    const form = document.querySelector<HTMLFormElement>('#baseline-form');
                    const button = document.querySelector<HTMLButtonElement>('#baseline-save');
                    if (!form || !button) throw new Error('Baseline form fixture did not mount.');
                    button.addEventListener('click', event => {
                        state.baseline.push('click:' + event.isTrusted);
                        queueMicrotask(() => state.baseline.push('microtask'));
                    });
                    form.addEventListener('submit', event => {
                        event.preventDefault();
                        state.baseline.push('submit:' + event.isTrusted);
                    });
                },

                setupCleanReaderClick(): void {
                    mountReaderForm();
                },

                setupExternalRequestSubmit(): void {
                    mountReaderForm();
                },

                setupImplicitEnter(): void {
                    mountReaderForm();
                },

                setupImplicitUrlEnter(): void {
                    mountReaderForm();
                },

                setupDisallowedInputEnter(): void {
                    mountReaderForm();
                },

                setupSelectEnter(): void {
                    mountReaderForm();
                },

                setupFocusedSaveKey(): void {
                    mountReaderForm();
                },

                setupComposingEnter(): void {
                    mountReaderForm();
                },

                invokeComposingEnterThenRequestSubmit(): void {
                    const { form, button } = readerForm();
                    const input = document.querySelector<HTMLInputElement>('#reader-name');
                    if (!input) throw new Error('IME input fixture did not mount.');
                    dispatchAuthorizedReaderControlEvent(input, new KeyboardEvent('keydown', {
                        bubbles: true,
                        cancelable: true,
                        isComposing: true,
                        key: 'Enter',
                    }));
                    runAttack('ime-composing-request-submit', () => form.requestSubmit(button));
                },

                invokeExternalRequestSubmit(): void {
                    const { form, button } = readerForm();
                    form.requestSubmit(button);
                },

                setupHostileClickReentry(): void {
                    const { form, button } = mountReaderForm();
                    button.addEventListener('click', () => {
                        runAttack('target-sync', () => form.requestSubmit(button));
                        queueMicrotask(() => runAttack('target-microtask', () => form.requestSubmit(button)));
                    });
                    form.addEventListener('click', event => {
                        if (event.target !== button) return;
                        runAttack('bubble-sync', () => form.requestSubmit(button));
                        queueMicrotask(() => runAttack('bubble-microtask', () => form.requestSubmit(button)));
                    });
                },

                setupDocumentCaptureReentry(): void {
                    const { form, button } = mountReaderForm();
                    let reentering = false;
                    document.addEventListener('submit', event => {
                        if (event.target !== form) return;
                        state.documentCaptureSubmits += 1;
                        if (reentering) return;
                        reentering = true;
                        try {
                            runAttack('document-capture-reentry', () => form.requestSubmit(button));
                        } finally {
                            reentering = false;
                        }
                    }, { capture: true, signal: hostileLifecycle!.signal });
                },

                setupLaterTaskReentry(): void {
                    const { form, button } = mountReaderForm();
                    button.addEventListener('click', event => {
                        event.preventDefault();
                        setTimeout(() => runAttack('later-task', () => form.requestSubmit(button)), 0);
                    });
                },

                snapshot(): ProbeState {
                    return structuredClone(state);
                },
            };

            (window as any).__yomuTrustedFormSubmitOrderProbe = probe;
        `,
        loader: 'ts',
        resolveDir: ROOT,
        sourcefile: 'trusted-form-submit-order-smoke-entry.ts',
    },
    write: false,
})).outputFiles;

const fixture = '<!doctype html><html><head><meta charset="utf-8"><title>Yomu trusted form submit order</title></head><body></body></html>';
const expectedHostileAttempts = [
    'target-sync',
    'bubble-sync',
    'target-microtask',
    'bubble-microtask',
];

const results = [];
for (const [engineName, browserType] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
    results.push(await runEngine(engineName, browserType));
}

console.log(JSON.stringify({ ok: true, engines: results }, null, 2));

async function runEngine(engineName, browserType) {
    const browser = await launchRequiredBrowser(browserType);
    try {
        const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
        await page.setContent(fixture);
        await page.addScriptTag({ content: browserBundle });

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupBaseline());
        await page.locator('#baseline-save').click();
        const baseline = await snapshot(page);
        assert.deepEqual(baseline.baseline, ['click:true', 'microtask', 'submit:true'],
            `${engineName}: native click/default-submit ordering changed`);

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.installBoundary());

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupCleanReaderClick());
        await page.locator('#reader-save').click();
        const clean = await snapshot(page);
        assert.deepEqual(clean.clickTrust, [true], `${engineName}: Playwright click was not browser-trusted`);
        assert.deepEqual(clean.submitTrust, [],
            `${engineName}: Reader Save leaked through the browser submit path`);
        assert.deepEqual(clean.callbackPhases, ['native'],
            `${engineName}: one real click did not produce exactly one legitimate callback`);

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupImplicitEnter());
        await page.locator('#reader-name').press('Enter');
        const implicitEnter = await snapshot(page);
        assert.deepEqual(implicitEnter.keydowns, ['Enter:false:true'],
            `${engineName}: implicit Enter was not delivered as one trusted, non-composing keydown`);
        assert.deepEqual(implicitEnter.callbackPhases, ['native'],
            `${engineName}: implicit Enter did not produce exactly one legitimate callback`);
        assert.deepEqual(implicitEnter.callbackActiveElements, ['reader-name'],
            `${engineName}: implicit Enter did not retain the text input as its activation source`);
        assert.deepEqual(implicitEnter.clickDetails, [0],
            `${engineName}: implicit Enter did not use the default button's keyboard click`);

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupImplicitUrlEnter());
        await page.locator('#reader-url').press('Enter');
        const implicitUrlEnter = await snapshot(page);
        assert.deepEqual(implicitUrlEnter.keydowns, ['Enter:false:true'],
            `${engineName}: URL Enter was not delivered as one trusted, non-composing keydown`);
        assert.deepEqual(implicitUrlEnter.callbackPhases, ['native'],
            `${engineName}: valid URL Enter did not produce exactly one legitimate callback`);
        assert.deepEqual(implicitUrlEnter.callbackActiveElements, ['reader-url'],
            `${engineName}: URL Enter did not retain the URL input as its activation source`);
        assert.deepEqual(implicitUrlEnter.clickDetails, [0],
            `${engineName}: URL Enter did not use the default button's keyboard click`);

        const disallowedInputEnter = {};
        for (const inputType of ['checkbox', 'radio']) {
            await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupDisallowedInputEnter());
            await page.locator(`#reader-${inputType}`).press('Enter');
            const disallowed = await snapshot(page);
            assert.deepEqual(disallowed.keydowns, ['Enter:false:true'],
                `${engineName}: ${inputType} Enter was not delivered as one trusted keydown`);
            assert.deepEqual(disallowed.clickDetails, [0],
                `${engineName}: ${inputType} did not exercise the trusted default-button click boundary`);
            assert.deepEqual(disallowed.callbackPhases, [],
                `${engineName}: Enter on ${inputType} incorrectly reached the Reader callback`);
            disallowedInputEnter[inputType] = disallowed.callbackPhases.length === 0;
        }

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupFocusedSaveKey());
        await page.locator('#reader-save').press('Enter');
        const focusedSaveEnter = await snapshot(page);
        assert.deepEqual(focusedSaveEnter.callbackPhases, ['native'],
            `${engineName}: Enter on focused Save did not produce exactly one callback`);
        assert.deepEqual(focusedSaveEnter.callbackActiveElements, ['reader-save'],
            `${engineName}: focused Save Enter lost the exact control identity`);

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupFocusedSaveKey());
        await page.locator('#reader-save').press('Space');
        const focusedSaveSpace = await snapshot(page);
        assert.deepEqual(focusedSaveSpace.callbackPhases, ['native'],
            `${engineName}: Space on focused Save did not produce exactly one callback`);
        assert.deepEqual(focusedSaveSpace.callbackActiveElements, ['reader-save'],
            `${engineName}: focused Save Space lost the exact control identity`);

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupSelectEnter());
        await page.locator('#reader-select').press('Enter');
        const selectEnter = await snapshot(page);
        assert.deepEqual(selectEnter.keydowns, ['Enter:false:true'],
            `${engineName}: select Enter was not delivered as one trusted keydown`);
        assert.deepEqual(selectEnter.callbackPhases, [],
            `${engineName}: Enter on a select incorrectly submitted the Reader form`);

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupComposingEnter());
        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.invokeComposingEnterThenRequestSubmit());
        const composingEnter = await snapshot(page);
        assert.deepEqual(composingEnter.keydowns, ['Enter:true:false'],
            `${engineName}: the authorized IME-composition fixture did not reach the form`);
        assert.deepEqual(composingEnter.attempts, ['ime-composing-request-submit'],
            `${engineName}: the IME follow-up requestSubmit probe did not execute`);
        assert.deepEqual(composingEnter.callbackPhases, [],
            `${engineName}: composing Enter armed a submit authorization`);

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupExternalRequestSubmit());
        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.invokeExternalRequestSubmit());
        const external = await snapshot(page);
        assert.deepEqual(external.submitTrust, [true],
            `${engineName}: requestSubmit no longer demonstrates its misleading trusted event`);
        assert.deepEqual(external.callbackPhases, [],
            `${engineName}: external requestSubmit(exactButton) reached the Reader callback`);

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupHostileClickReentry());
        await page.locator('#reader-save').click();
        const hostileClick = await snapshot(page);
        assert.deepEqual([...hostileClick.attempts].sort(), [...expectedHostileAttempts].sort(),
            `${engineName}: hostile target/bubble/microtask probes did not all execute`);
        assert.deepEqual(hostileClick.callbackPhases, ['native'],
            `${engineName}: hostile click reentry stole or duplicated the legitimate callback`);
        assert.deepEqual(hostileClick.timeline, [
            'callback:native',
            ...hostileClick.attempts.map(attempt => `attack:${attempt}`),
        ], `${engineName}: legitimate Save did not run before hostile click reentry`);

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupDocumentCaptureReentry());
        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.invokeExternalRequestSubmit());
        const documentCapture = await snapshot(page);
        assert.deepEqual(documentCapture.attempts, ['document-capture-reentry'],
            `${engineName}: hostile document-capture reentry did not execute`);
        assert.ok(documentCapture.documentCaptureSubmits >= 1,
            `${engineName}: document capture did not observe the requestSubmit stimulus`);
        assert.deepEqual(documentCapture.callbackPhases, [],
            `${engineName}: document-capture submit reentry reached the Reader callback`);

        await page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.setupLaterTaskReentry());
        await page.locator('#reader-save').click();
        await page.waitForTimeout(50);
        const laterTask = await snapshot(page);
        assert.deepEqual(laterTask.attempts, ['later-task'],
            `${engineName}: later-task requestSubmit probe did not execute`);
        assert.deepEqual(laterTask.callbackPhases, ['native'],
            `${engineName}: a later-task submit either suppressed or duplicated the legitimate click callback`);
        assert.deepEqual(laterTask.timeline, ['callback:native', 'attack:later-task'],
            `${engineName}: later-task requestSubmit ran before the legitimate click callback`);

        return {
            engine: engineName,
            baseline: baseline.baseline,
            cleanCallbacks: clean.callbackPhases,
            implicitEnterCallbacks: implicitEnter.callbackPhases,
            implicitUrlEnterCallbacks: implicitUrlEnter.callbackPhases,
            disallowedInputEnterBlocked: disallowedInputEnter,
            focusedSaveEnterCallbacks: focusedSaveEnter.callbackPhases,
            focusedSaveSpaceCallbacks: focusedSaveSpace.callbackPhases,
            selectEnterBlocked: selectEnter.callbackPhases.length === 0,
            composingEnterBlocked: composingEnter.callbackPhases.length === 0,
            externalRequestSubmitBlocked: external.callbackPhases.length === 0,
            hostileClickAttempts: hostileClick.attempts,
            hostileClickCallbacks: hostileClick.callbackPhases,
            documentCaptureReentryBlocked: documentCapture.callbackPhases.length === 0,
            laterTaskDidNotDuplicate: laterTask.callbackPhases.join(',') === 'native',
        };
    } finally {
        await browser.close();
    }
}

function launchRequiredBrowser(browserType) {
    // A missing engine is a release-gate failure; there is deliberately no
    // executable fallback or skip path in this mandatory matrix.
    return browserType.launch({ headless: true });
}

function snapshot(page) {
    return page.evaluate(() => window.__yomuTrustedFormSubmitOrderProbe.snapshot());
}
