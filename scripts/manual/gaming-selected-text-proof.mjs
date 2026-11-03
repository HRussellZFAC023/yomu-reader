// Windows physical selection proof. WPF owns test data; remote dictionary answers
// are fixtures. No keyboard injection, clipboard mutation, user docs, or OCR.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { gamingJitenFixture } from '../lib/gaming-jiten-fixture.mjs';

if (process.platform !== 'win32') throw new Error('This physical native-selection proof requires Windows. Mac/Linux command fixtures run in Vitest.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = path.join(root, 'qa-artifacts');
mkdirSync(evidence, { recursive: true });
const runDir = mkdtempSync(path.join(evidence, 'selected-text-'));
const userData = path.join(runDir, 'profile');
const readyPath = path.join(runDir, 'fixture-ready');
let app;
let nativeFixture;
const watchdog = setTimeout(() => { nativeFixture?.kill(); app?.process()?.kill(); process.exit(124); }, 90_000);
try {
    console.log('[selected-text-smoke] launch isolated Electron profile');
    app = await electron.launch({ args: [path.join(root, 'dist-gaming/electron/main.cjs')], env: {
        ...process.env, YOMU_GAMING_TEST_MODE: '1', YOMU_GAMING_USER_DATA_DIR: userData,
    } });
    const page = await app.firstWindow();
    console.log('[selected-text-smoke] wait for native settings');
    await page.evaluate(() => window.yomuGaming.showApp());
    await page.waitForSelector('[data-native-text-lookup-shortcut]');
    const environment = await page.evaluate(() => window.yomuGaming.getEnvironment());
    assert.equal(environment.hotkey, 'CommandOrControl+Shift+Y');
    assert.equal(environment.textLookupShortcut.shortcut, 'CommandOrControl+Shift+L');
    const fixture = gamingJitenFixture({ knownState: [0], decks: [{ userStudyDeckId: 7, name: 'Selection fixture words', deckType: 2 }] });
    await app.context().route(/^https?:\/\//, fixture.route);
    await page.evaluate(() => {
        const key = 'yomu-gaming-reader-settings-v1';
        const settings = JSON.parse(localStorage.getItem(key) || '{}');
        localStorage.setItem(key, JSON.stringify({ ...settings, ocrEnabled: false, ocrProvider: 'off',
            parserProvider: 'jiten', jitenApiKey: 'selected-text-fixture-key', apiKey: '',
            jitenDefinitionsEnabled: true, jpdbDefinitionsEnabled: false, jitenMiningEnabled: true,
            audioEnabled: false, autoPlayAudio: false, audioSources: [], interfaceLanguage: 'en' }));
    });
    const probes = await app.evaluate(({ clipboard, desktopCapturer, ipcMain }, channels) => {
        const calls = { clipboardRead: 0, clipboardWrite: 0, screenshot: 0, ocr: 0 };
        globalThis.__selectedTextProbe = calls;
        for (const method of ['readText', 'readBuffer', 'readHTML', 'readRTF']) clipboard[method] = () => { calls.clipboardRead++; throw new Error('No clipboard read allowed'); };
        for (const method of ['writeText', 'write', 'clear']) clipboard[method] = () => { calls.clipboardWrite++; throw new Error('No clipboard write allowed'); };
        desktopCapturer.getSources = async () => { calls.screenshot++; throw new Error('No screenshot allowed'); };
        ipcMain.removeHandler(channels.ocr);
        ipcMain.handle(channels.ocr, () => { calls.ocr++; throw new Error('No OCR allowed'); });
        return calls;
    }, { ocr: 'yomu-gaming:request-ocr' });
    assert.deepEqual(probes, { clipboardRead: 0, clipboardWrite: 0, screenshot: 0, ocr: 0 });
    await page.evaluate(() => window.yomuGaming.hideApp());
    console.log('[selected-text-smoke] select controlled native WPF fixture text');
    nativeFixture = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-STA', '-File', path.join(root, 'scripts/fixtures/selected-text-windows.ps1'), '-ReadyPath', readyPath], { windowsHide: true, stdio: 'ignore' });
    await until(() => existsSync(readyPath), 'WPF selection fixture');
    console.log('[selected-text-smoke] invoke real native capture callback');
    await app.evaluate(async () => globalThis.__yomuGamingPressSelectedTextShortcut());
    const lookup = app.windows().find(window => window.url().includes('#selected-text'));
    assert.ok(lookup, 'Native selection did not open a text lookup window');
    await lookup.waitForSelector('[data-selected-text-source]');
    assert.equal(await lookup.locator('[data-selected-text-source]').textContent(), '冒険');
    const popup = lookup.locator('.jpdb-reader-popover').first();
    await popup.locator('[data-yomu-headword]').waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(await popup.evaluate(node => getComputedStyle(node).position), 'fixed', 'Packaged Reader popup CSS is missing');
    assert.ok(await popup.evaluate(node => [...node.querySelectorAll('svg')].every(svg => svg.getBoundingClientRect().width <= 80)), 'Unstyled oversized popup icons');
    const stylesBefore = await lookup.locator('style').count();
    const headword = await popup.locator('[data-yomu-headword]').evaluate(node => {
        const clone = node.cloneNode(true); clone.querySelectorAll('rt, rp').forEach(item => item.remove()); return clone.textContent?.trim();
    });
    assert.equal(headword, '冒険');
    assert.match(await popup.textContent(), /adventure/);
    assert.ok(await popup.locator('.jpdb-reader-deck-select').count(), 'Real Reader deck action missing');
    const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('#selected-text')).getBounds());
    assert.ok(bounds.width <= 640 && bounds.height <= 560, `Lookup covered source with oversized window: ${JSON.stringify(bounds)}`);
    const session = Number(new URL(lookup.url()).searchParams.get('textSession'));
    assert.deepEqual(await page.evaluate(id => window.yomuGaming.getSelectedText(id), session), { kind: 'expired' }, 'Settings renderer can read text session');
    assert.deepEqual(await lookup.evaluate(id => window.yomuGaming.getSelectedText(id), session), { kind: 'expired' }, 'Selection replayed after consumption');
    assert.equal(await lookup.locator('style').count(), stylesBefore, 'Reading the session duplicated runtime styles');
    await lookup.screenshot({ path: path.join(runDir, 'native-windows-selection.png') });
    const calls = await app.evaluate(() => globalThis.__selectedTextProbe);
    assert.deepEqual(calls, { clipboardRead: 0, clipboardWrite: 0, screenshot: 0, ocr: 0 });
    writeFileSync(path.join(runDir, 'proof.json'), JSON.stringify({ source: 'controlled native WPF selection', exactText: '冒険', headword, bounds, calls,
        physicalPlatforms: ['Windows'], platformFixtures: ['macOS', 'Linux X11', 'Wayland'],
        limitation: 'The test calls the same main callback as the shortcut; it does not inject an OS keypress or prove a specific Word/PDF vendor.' }, null, 2));
    console.log(`PASS native Windows UI Automation → one-use IPC → exact Reader headword/definition/deck actions, OCR disabled; zero clipboard/capture/OCR calls. Evidence: ${runDir}`);
} finally {
    nativeFixture?.kill();
    await app?.close();
    clearTimeout(watchdog);
}

async function until(predicate, label) {
    const end = Date.now() + 15_000;
    while (!predicate()) {
        if (Date.now() > end) throw new Error(`Timed out waiting for ${label}`);
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}
