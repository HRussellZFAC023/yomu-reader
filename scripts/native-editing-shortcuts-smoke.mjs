#!/usr/bin/env node
// Fixture: real Reader code and native copy/paste in disposable HEADLESS
// browsers. Keep Chromium's explicit headless-shell channel: its in-memory
// ClipboardNonBacked never touches the operator's OS clipboard. Firefox also
// selects HeadlessClipboard. Do not add a headed/browser-channel override.
// Chromium 141.0.7390.37: headless/lib/browser/headless_browser_main_parts.cc
// and components/headless/clipboard/headless_clipboard.cc.
// Firefox: widget/windows/nsWidgetFactory.cpp and widget/headless/HeadlessClipboard.cpp.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEXT = '日本語の文章です。';
const PASTED_TEXT = '貼り付け';
const NATIVE_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';
const OTHER_MODIFIER = NATIVE_MODIFIER === 'Control' ? 'Meta' : 'Control';
const [{ text: browserBundle }] = (await build({
    absWorkingDir: ROOT,
    bundle: true,
    define: { __YOMU_VERSION__: '"native-editing-fixture"' },
    format: 'iife',
    logLevel: 'silent',
    platform: 'browser',
    write: false,
    stdin: {
        loader: 'ts',
        resolveDir: ROOT,
        contents: `
            import './src/reader/companions/register-build-companions.ts';
            import { ReaderApp } from './src/reader/app/main.ts';
            import type { JPDBCard, ReaderSettings } from './src/reader/app/types.ts';
            import { applyTokensToScanTarget, collectTextTargetsIn, projectAdditiveTextMirrors } from './src/reader/dom/index.ts';
            import { bindPrivateCommandCapability } from './src/reader/dom/private-command-capabilities.ts';
            import { installLookupGradeShortcuts } from './src/reader/dom/review-shortcuts.ts';
            import { DEFAULT_SETTINGS } from './src/reader/settings/index.ts';

            const TEXT = ${JSON.stringify(TEXT)};
            const PASTED_TEXT = ${JSON.stringify(PASTED_TEXT)};
            const actions: string[] = [];
            const keydowns: { key: string; ctrl: boolean; meta: boolean; prevented: boolean; trusted: boolean }[] = [];
            const clipboard: { type: string; prevented: boolean; trusted: boolean; plain?: string; htmlText?: string; readingText?: string }[] = [];
            const app = new ReaderApp(async () => { actions.push('settings-save'); }, false);
            interface ReaderFixture {
                settings: ReaderSettings;
                activePopover: HTMLElement;
                activePopoverMode: 'modal';
                lastCard: JPDBCard;
                bindEvents(): void;
                scanPageNow(): void;
                showSettings(): void;
                navigateLookupWord(): Promise<void>;
                scheduleHoverLookupAtPointer(): void;
                submitReviewShortcut(): Promise<void>;
            }
            const reader = app as unknown as ReaderFixture;
            reader.settings = {
                ...DEFAULT_SETTINGS,
                // Bare letters deliberately overlap clipboard keys. Exact
                // modifier matching must keep Ctrl/Cmd+C/V/X native.
                shortcuts: { ...DEFAULT_SETTINGS.shortcuts, gradeNothing: 'C', gradeSomething: 'V', gradeHard: 'X', hoverLookup: 'Shift' },
            };
            reader.scanPageNow = () => { actions.push('scan'); };
            reader.showSettings = () => { actions.push('settings'); };
            reader.navigateLookupWord = async () => { actions.push('navigation'); };
            reader.scheduleHoverLookupAtPointer = () => { actions.push('lookup'); };
            reader.submitReviewShortcut = async () => { actions.push('review'); };
            reader.bindEvents();

            const card: JPDBCard = {
                vid: 1, sid: 1, rid: 0, spelling: '日本語', reading: 'にほんご', frequencyRank: null,
                partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
            };
            reader.lastCard = card;
            const popup = document.querySelector<HTMLElement>('#popup')!;
            reader.activePopover = popup;
            reader.activePopoverMode = 'modal';
            for (const [gradeShortcut, grade] of [['gradeNothing', 'nothing'], ['gradeSomething', 'something'], ['gradeHard', 'hard']] as const) {
                const button = document.createElement('button');
                button.textContent = grade;
                bindPrivateCommandCapability(button, { kind: 'card-action', action: 'grade', grade, gradeShortcut });
                popup.append(button);
            }
            const lifecycle = new AbortController();
            installLookupGradeShortcuts(popup, lifecycle.signal, () => true, () => reader.settings, () => { actions.push('lookup-grade'); });

            const shadow = document.querySelector('#shadow-host')!.attachShadow({ mode: 'open' });
            shadow.innerHTML = '<input id="shadow-input">';

            function editable(selector: string): HTMLInputElement | HTMLTextAreaElement | HTMLElement {
                const element = selector === '#shadow-input' ? shadow.querySelector(selector) : document.querySelector(selector);
                if (!(element instanceof HTMLElement)) throw new Error('Missing editing fixture: ' + selector);
                return element;
            }
            function selectedText(): string {
                const control = shadow.activeElement ?? document.activeElement;
                if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
                    return control.value.slice(control.selectionStart ?? 0, control.selectionEnd ?? 0);
                }
                return getSelection()?.toString() ?? '';
            }
            // Observe after Reader's document handlers, without cancelling or
            // supplying clipboard data. A native paste reads what the browser
            // actually serialized, unlike Selection.toString(): Chromium can
            // include an unselectable middle rt there but omit it when copying.
            for (const type of ['copy', 'cut', 'paste'] as const) window.addEventListener(type, event => {
                const record = { type, prevented: event.defaultPrevented, trusted: event.isTrusted };
                if (type !== 'paste') { clipboard.push(record); return; }
                const html = new DOMParser().parseFromString(event.clipboardData?.getData('text/html') ?? '', 'text/html');
                const readingText = [...html.querySelectorAll('rt')].map(reading => reading.textContent).join('');
                html.querySelectorAll('rp').forEach(fallback => fallback.remove());
                clipboard.push({ ...record, plain: event.clipboardData?.getData('text/plain') ?? '', htmlText: html.body.textContent ?? '', readingText });
            });
            window.addEventListener('keydown', event => {
                if (!['c', 'v', 'x'].includes(event.key.toLowerCase()) || (!event.ctrlKey && !event.metaKey)) return;
                keydowns.push({ key: event.key.toLowerCase(), ctrl: event.ctrlKey, meta: event.metaKey, prevented: event.defaultPrevented, trusted: event.isTrusted });
            });

            Object.assign(window, { nativeEditingProbe: {
                reset() { actions.length = 0; keydowns.length = 0; clipboard.length = 0; },
                state() { return { actions: [...actions], keydowns: [...keydowns], clipboard: [...clipboard], selected: selectedText() }; },
                focusBody() { (document.activeElement instanceof HTMLElement ? document.activeElement : null)?.blur(); getSelection()?.removeAllRanges(); },
                prepareClipboardSeed() {
                    const seed = document.querySelector<HTMLTextAreaElement>('#clipboard-seed')!;
                    seed.value = PASTED_TEXT; seed.focus(); seed.select();
                },
                prepareClipboardSink() {
                    const sink = document.querySelector<HTMLTextAreaElement>('#clipboard-sink')!;
                    sink.value = ''; sink.focus(); sink.setSelectionRange(0, 0);
                },
                prepareEditor(selector: string) {
                    const control = editable(selector);
                    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
                        control.value = TEXT; control.focus(); control.setSelectionRange(0, 3);
                    } else {
                        control.innerHTML = '<span>' + TEXT + '</span>'; control.focus();
                        const node = control.firstElementChild?.firstChild;
                        if (!node) throw new Error('Missing editable text');
                        const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 3);
                        getSelection()?.removeAllRanges(); getSelection()?.addRange(range);
                    }
                },
                value(selector: string) {
                    const control = editable(selector);
                    return control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement ? control.value : control.textContent;
                },
                paint(kind: 'plain' | 'inline' | 'portal' | 'mirror') {
                    const host = document.querySelector<HTMLElement>('#prose')!;
                    if (kind === 'plain') return;
                    if (kind === 'mirror') host.style.transform = 'scale(1.01)';
                    const target = collectTextTargetsIn(host, 40, false).find(candidate => candidate.text === TEXT);
                    if (!target) throw new Error('Missing Japanese annotation target');
                    applyTokensToScanTarget({ ...target, nonDestructive: kind !== 'inline', forceInlineRender: kind === 'inline' }, [{
                        card, start: 0, end: 3, length: 3, rubies: [{ text: card.reading, start: 0, end: 3, length: 3 }], pitchClass: '', sentence: TEXT,
                    }], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
                    projectAdditiveTextMirrors(document);
                },
                selectProse(all: boolean) {
                    (document.activeElement instanceof HTMLElement ? document.activeElement : null)?.blur();
                    const host = document.querySelector('#prose')!;
                    if (!(host instanceof HTMLElement)) throw new Error('Missing prose fixture');
                    host.tabIndex = -1; host.focus();
                    const range = document.createRange();
                    if (all) range.selectNodeContents(host);
                    else {
                        const node = host.firstChild instanceof Text ? host.firstChild : host.querySelector('.jpdb-reader-ruby-base')?.firstChild;
                        if (!(node instanceof Text)) throw new Error('Missing prose base text');
                        range.setStart(node, 1); range.setEnd(node, 3);
                    }
                    getSelection()?.removeAllRanges(); getSelection()?.addRange(range);
                    return getSelection()?.toString();
                },
            } });
        `,
    },
})).outputFiles;

const fixture = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>Native editing fixture</title><body>
<p id="prose" style="font-size:24px">${TEXT}</p>
<input id="input"><textarea id="textarea"></textarea><div id="editable" contenteditable="true"></div><div id="shadow-host"></div>
<textarea id="clipboard-seed"></textarea><textarea id="clipboard-sink"></textarea>
<div id="popup" class="jpdb-reader-popover" data-jpdb-reader-root="true">
<input id="popup-input"><textarea id="popup-textarea"></textarea><div id="popup-editable" contenteditable="plaintext-only"></div>
</div></body></html>`;

async function state(page) {
    return page.evaluate(() => window.nativeEditingProbe.state());
}

async function verifyCopiedPayload(page, expected, hasHtml) {
    await page.evaluate(() => { window.nativeEditingProbe.prepareClipboardSink(); window.nativeEditingProbe.reset(); });
    await page.keyboard.press(NATIVE_MODIFIER + '+v');
    const result = await state(page);
    verifyKeys(result, NATIVE_MODIFIER, 'v');
    assert.equal(result.clipboard.length, 1);
    assert.deepEqual(result.clipboard[0], { type: 'paste', prevented: false, trusted: true, plain: expected, htmlText: hasHtml ? expected : '', readingText: '' });
    assert.equal(await page.locator('#clipboard-sink').inputValue(), expected);
}

function verifyKeys(result, modifier, key) {
    assert.deepEqual(result.actions, [], 'Clipboard shortcut triggered a Reader action');
    assert.deepEqual(result.keydowns, [{ key, ctrl: modifier === 'Control', meta: modifier === 'Meta', prevented: false, trusted: true }]);
}

const EDITORS = ['#input', '#textarea', '#editable', '#shadow-input', '#popup-input', '#popup-textarea', '#popup-editable'];
const ANNOTATION_ROOTS = {
    plain: '#prose', inline: '#prose rt', portal: '.jpdb-reader-document-annotation-portal', mirror: '#prose .jpdb-reader-text-mirror',
};

async function verifyAnnotationCopy(page, name, kind) {
    await page.goto('https://native-editing.example/', { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: readFileSync(path.join(ROOT, 'dist/yomu.css'), 'utf8') });
    await page.addScriptTag({ content: browserBundle });
    await page.evaluate(kind => window.nativeEditingProbe.paint(kind), kind);
    assert.equal(await page.locator(ANNOTATION_ROOTS[kind]).count(), 1);
    for (const all of [true, false]) {
        const selected = all ? TEXT : '本語';
        await page.evaluate(all => window.nativeEditingProbe.selectProse(all), all);
        await page.evaluate(() => window.nativeEditingProbe.reset());
        await page.keyboard.press(NATIVE_MODIFIER + '+c');
        const result = await state(page);
        verifyKeys(result, NATIVE_MODIFIER, 'c');
        assert.deepEqual(result.clipboard, [{ type: 'copy', prevented: false, trusted: true }]);
        if (!all) assert.equal(result.selected, selected, name + '/' + kind + ': partial source selection');
        await verifyCopiedPayload(page, selected, true);
    }
}

async function verifyEditorShortcut(page, name, selector, key) {
    if (key === 'v') {
        await page.evaluate(() => window.nativeEditingProbe.prepareClipboardSeed());
        await page.keyboard.press(NATIVE_MODIFIER + '+c');
    }
    await page.evaluate(selector => { window.nativeEditingProbe.prepareEditor(selector); window.nativeEditingProbe.reset(); }, selector);
    await page.keyboard.press(NATIVE_MODIFIER + '+' + key);
    const result = await state(page);
    verifyKeys(result, NATIVE_MODIFIER, key);
    const pasteFields = { c: {}, v: { plain: PASTED_TEXT, htmlText: '', readingText: '' }, x: {} };
    const record = { type: { c: 'copy', v: 'paste', x: 'cut' }[key], prevented: false, trusted: true, ...pasteFields[key] };
    assert.deepEqual(result.clipboard, [record], name + '/' + selector + '/' + key);
    const expectedValues = { c: TEXT, v: PASTED_TEXT + TEXT.slice(3), x: TEXT.slice(3) };
    assert.equal(await page.evaluate(selector => window.nativeEditingProbe.value(selector), selector), expectedValues[key]);
    if (key !== 'v') await verifyCopiedPayload(page, '日本語', selector.includes('editable'));
}

// Only this OS's native modifier proves clipboard defaults. Both modifiers
// must pass through Reader without triggering actions.
async function verifyOtherModifier(page) {
    for (const selector of ['#prose', ...EDITORS]) {
        for (const key of ['c', 'v', 'x']) {
            await page.evaluate(selector => {
                if (selector === '#prose') window.nativeEditingProbe.selectProse(true);
                else window.nativeEditingProbe.prepareEditor(selector);
                window.nativeEditingProbe.reset();
            }, selector);
            await page.keyboard.press(OTHER_MODIFIER + '+' + key);
            verifyKeys(await state(page), OTHER_MODIFIER, key);
        }
    }
}

async function runEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true, ...{ chromium: { channel: 'chromium-headless-shell' } }[name] });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://native-editing.example/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture }));
        for (const kind of ['plain', 'inline', 'portal', 'mirror']) await verifyAnnotationCopy(page, name, kind);
        for (const selector of EDITORS) {
            for (const key of ['c', 'v', 'x']) await verifyEditorShortcut(page, name, selector, key);
        }
        await verifyOtherModifier(page);

        // Prove the grade listener was actually live, not bypassed by this
        // fixture. Only the intentional bare letter should submit a grade.
        await page.evaluate(() => { window.nativeEditingProbe.focusBody(); window.nativeEditingProbe.reset(); });
        await page.keyboard.press('c');
        assert.deepEqual((await state(page)).actions, ['lookup-grade']);
        assert.deepEqual(errors, []);
        console.log(name + ' ' + browser.version() + ': clean native plain/HTML copy payloads in four annotation modes; ' + NATIVE_MODIFIER + '+C/V/X edited seven targets without grading; ' + OTHER_MODIFIER + '+C/V/X passed unchanged');
    } finally {
        await browser.close();
    }
}

await runEngine('chromium', chromium);
await runEngine('firefox', firefox);
console.log('Native editing shortcut fixture passed using headless in-memory clipboards.');
