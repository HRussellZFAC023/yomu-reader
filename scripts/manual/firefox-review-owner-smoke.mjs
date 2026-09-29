#!/usr/bin/env node
// Built-package transport diagnostic. No native provider calls or trusted-UI acceptance.
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packagePath = path.resolve(process.argv[2] ?? path.join(root, 'dist/extension/release/firefox/yomureader.com-firefox.xpi'));
const firefox = '/Applications/Firefox.app/Contents/MacOS/firefox';
const runId = `firefox-review-owner-${Date.now()}`;
const artifacts = path.join(root, 'artifacts/firefox-review-owner');
const scope = await mkdtemp(path.join(tmpdir(), 'yomu-review-owner-'));
const extension = path.join(scope, 'extension');
const profile = path.join(scope, 'profile');
const token = randomUUID();
const uuid = randomUUID();
const events = [];
let child;
let timer;
let server;
let finish;
const completed = new Promise(resolve => { finish = resolve; });
let failure;
const report = { runId, passed: false, status: 'transport-only-diagnostic', checksPassed: false, events };
const fail = error => { failure ??= String(error?.message ?? error); finish(); };
const count = type => events.filter(event => event.type === type).length;

try {
    await mkdir(artifacts, { recursive: true });
    report.browser = { executable: firefox, version: (await promisify(execFile)(firefox, ['--version'], { timeout: 10_000 })).stdout.trim(), runner: 'web-ext@10.5.0', profile: 'disposable' };
    report.scope = 'Injected packaged-Study commands; not trusted Grade/recovery UI or native SRS acceptance.';
    await copyFile(fileURLToPath(import.meta.url), path.join(artifacts, `${runId}-harness.mjs`));
    const bytes = await readFile(packagePath);
    const hash = createHash('sha256').update(bytes).digest('hex');
    report.package = { path: packagePath, sha256: hash };
    await copyFile(packagePath, path.join(artifacts, `${runId}.xpi`));
    const files = unzipSync(bytes);
    if (!new TextDecoder().decode(files['background.js']).includes('yomu.review-queue.v2')) throw new Error('Package has no review owner.');
    for (const [name, contents] of Object.entries(files)) {
        const destination = path.resolve(extension, name);
        if (!destination.startsWith(`${extension}${path.sep}`)) throw new Error('Unsafe archive path.');
        if (name.endsWith('/')) { await mkdir(destination, { recursive: true }); continue; }
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, contents);
    }
    const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
    const addonId = manifest.browser_specific_settings?.gecko?.id ?? manifest.applications?.gecko?.id;
    if (!addonId) throw new Error('Package is missing its Firefox identity.');
    report.package.version = manifest.version;
    server = createServer(async (request, response) => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Headers', 'content-type');
        if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
        const url = new URL(request.url, 'http://127.0.0.1');
        if (url.searchParams.get('token') !== token) { response.writeHead(403); response.end(); return; }
        try {
            if (request.method === 'POST') {
                let body = '';
                for await (const chunk of request) { body += chunk; if (body.length > 4096) throw new Error('Oversized probe event.'); }
                const event = JSON.parse(body);
                if (![0, 1].includes(event.tab) || !['ready', 'claim', 'observed', 'acknowledged', 'ack-observed', 'notification', 'replayed', 'settled', 'done', 'error'].includes(event.type)) throw new Error('Invalid probe event.');
                if (events.some(item => item.tab === event.tab && item.type === event.type)) throw new Error('Duplicate instance event.');
                events.push({ tab: event.tab, type: event.type, claimed: event.claimed === true, error: String(event.error ?? '').slice(0, 200) });
                console.log(`${runId}: tab ${event.tab} ${event.type}`);
                if (event.type === 'error') fail(event.error);
                if (event.type === 'done') finish();
            }
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ready: count('ready'), observed: count('observed'), acknowledged: count('acknowledged'), ackObserved: count('ack-observed'), replayed: count('replayed'), settled: count('settled') }));
        } catch (error) { fail(error); response.writeHead(400); response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const config = { endpoint: `${origin}/?token=${token}`, runId };
    const injected = `(${probe.toString()})(${JSON.stringify(config)});`;
    report.instrumentation = { addedPermissions: [], probeSha256: createHash('sha256').update(injected).digest('hex') };
    await writeFile(path.join(extension, 'newtab/review-owner-probe.js'), injected);
    const indexPath = path.join(extension, 'newtab/index.html');
    const index = await readFile(indexPath, 'utf8');
    if (!index.includes('</head>')) throw new Error('Study shell has no injection point.');
    await writeFile(indexPath, index.replace('</head>', '<script src="review-owner-probe.js"></script></head>'));
    await mkdir(profile);
    await writeFile(path.join(profile, 'user.js'), `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [addonId]: uuid }))});\nuser_pref("browser.shell.checkDefaultBrowser", false);\n`);
    const base = `moz-extension://${uuid}/newtab/index.html`;
    child = spawn('npx', ['--yes', 'web-ext@10.5.0', 'run', '--source-dir', extension, '--firefox', firefox,
        '--firefox-profile', profile, '--profile-create-if-missing', '--keep-profile-changes', '--no-reload', '--no-input',
        '--start-url', `${base}?review-proof=0`, '--start-url', `${base}?review-proof=1`], { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', bytes => process.stdout.write(bytes));
    child.stderr.on('data', bytes => process.stderr.write(bytes));
    child.once('error', fail);
    child.once('exit', code => { if (!count('done')) fail(`web-ext exited early: ${code}`); });
    timer = setTimeout(() => fail('Two-tab review-owner diagnostic timed out.'), 120_000);
    await completed;
    if (failure) throw new Error(failure);
    if (count('ready') !== 2 || count('claim') !== 2 || count('observed') !== 2 || count('ack-observed') !== 2 || count('notification') !== 2 || count('settled') !== 2
        || events.filter(event => event.type === 'claim' && event.claimed).length !== 1) throw new Error('Incomplete two-instance proof.');
    if (createHash('sha256').update(await readFile(packagePath)).digest('hex') !== hash) throw new Error('Source package changed during proof.');
    report.checksPassed = true;
} catch (error) {
    report.error = String(error?.message ?? error);
    process.exitCode = 1;
} finally {
    clearTimeout(timer);
    let stopped = false;
    try {
        await stopProcessGroup(child?.pid);
        stopped = true;
    } catch (error) {
        report.checksPassed = false;
        report.cleanupError = String(error?.message ?? error);
        process.exitCode = 1;
        child?.stdout?.destroy();
        child?.stderr?.destroy();
        child?.unref();
    }
    try {
        if (server?.listening) await new Promise((resolve, reject) => {
            const watchdog = setTimeout(() => reject(new Error('Probe server did not close.')), 3000);
            server.close(error => { clearTimeout(watchdog); error ? reject(error) : resolve(); });
            server.closeAllConnections();
        });
    } catch (error) {
        report.checksPassed = false;
        report.cleanupError = String(error?.message ?? error);
        process.exitCode = 1;
    }
    if (!stopped) report.retainedScope = scope;
    try {
        await writeFile(path.join(artifacts, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`);
    } finally {
        if (stopped) await rm(scope, { recursive: true, force: true });
    }
    console.log(JSON.stringify({ checksPassed: report.checksPassed, report: path.join(artifacts, `${runId}.json`), error: report.error ?? report.cleanupError }));
}

async function stopProcessGroup(pid) {
    if (!Number.isInteger(pid) || pid <= 1) return;
    const members = async () => {
        const { stdout } = await promisify(execFile)('/bin/ps', ['-axo', 'pid=,pgid=,uid=,stat='], { timeout: 3000 });
        return stdout.trim().split('\n').map(line => line.trim().split(/\s+/u))
            .filter(([member, group, uid, state]) => Number(group) === pid && Number(uid) === process.getuid()
                && Number(member) > 1 && !state.startsWith('Z'))
            .map(([member]) => Number(member));
    };
    const signal = (member, value) => {
        try { process.kill(member, value); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    if ((await members()).includes(pid)) signal(pid, 'SIGINT');
    for (let attempt = 0; attempt < 50; attempt++) {
        if (!(await members()).length) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    for (const member of await members()) signal(member, 'SIGKILL');
    for (let attempt = 0; attempt < 20; attempt++) {
        if (!(await members()).length) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Disposable browser process group is still alive.');
}

async function probe({ endpoint, runId }) {
    const instance = new URL(location.href).searchParams.get('review-proof');
    if (instance !== '0' && instance !== '1') return;
    const tab = Number(instance);
    const post = async event => {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab, ...event }) });
        if (!response.ok) throw new Error('Probe event was not accepted.');
    };
    const wait = async (key, expected = 2) => {
        while ((await (await fetch(endpoint)).json())[key] !== expected) await new Promise(resolve => setTimeout(resolve, 30));
    };
    let listener;
    try {
        if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
        if (typeof globalThis.GM_addValueChangeListener !== 'function') throw new Error('Packaged GM change adapter is unavailable.');
        const api = globalThis.browser ?? globalThis.chrome;
        const command = async payload => {
            const response = await api.runtime.sendMessage({ channel: 'yomu.review-queue.v2', epoch: null, ...payload });
            if (!response?.ok) throw new Error(response?.error ?? 'Missing owner response.');
            return response.value;
        };
        const review = { id: runId, at: 1, target: 'anki', grade: 'okay', attempts: 0, providerContext: runId,
            card: { vid: 1, sid: 0, spelling: '読む', reading: 'よむ', ankiCardId: 1 } };
        const scope = `anki:${runId}`;
        let completionNotified = false;
        let notificationError;
        listener = globalThis.GM_addValueChangeListener('yomu:private:review-delivery:v2', () => {
            void command({ kind: 'snapshot', ids: [runId], scopes: [scope] }).then(snapshot => {
                if (snapshot?.statuses?.[runId] === 'completed' && snapshot?.revisions?.[scope] === 1) completionNotified = true;
            }).catch(error => { notificationError = error; });
        });
        const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
            ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
        const expectedClaim = canonical({ ...review, attempts: 1 });
        const assertEmpty = async () => {
            const value = await command({ kind: 'list' });
            if (!Array.isArray(value) || value.length !== 0) throw new Error('Terminal queue is not an empty array.');
        };
        await command({ kind: 'record', reviews: [review] });
        await post({ type: 'ready' });
        await wait('ready');
        const claimed = await command({ kind: 'claim', id: runId, providerContext: runId });
        if (claimed !== null && canonical(claimed) !== expectedClaim) throw new Error('Invalid claim payload.');
        await post({ type: 'claim', claimed: claimed !== null });
        const pending = await command({ kind: 'list' });
        if (!Array.isArray(pending) || pending.length !== 1 || canonical(pending[0]) !== expectedClaim) throw new Error('Missing durable attempt payload.');
        await post({ type: 'observed' });
        await wait('observed');
        if (tab === 0) {
            await command({ kind: 'acknowledge', id: runId, providerContext: runId });
            await post({ type: 'acknowledged' });
        }
        await wait('acknowledged', 1);
        await assertEmpty();
        await post({ type: 'ack-observed' });
        const snapshot = await command({ kind: 'snapshot', ids: [runId], scopes: [scope] });
        if (!Array.isArray(snapshot?.reviews) || snapshot.reviews.length || snapshot.statuses?.[runId] !== 'completed'
            || snapshot.revisions?.[scope] !== 1) throw new Error('Completion snapshot did not advance exactly once.');
        const notificationDeadline = Date.now() + 5000;
        while (!completionNotified) {
            if (notificationError) throw notificationError;
            if (Date.now() > notificationDeadline) throw new Error('Completion change notification was not observed.');
            await new Promise(resolve => setTimeout(resolve, 30));
        }
        await post({ type: 'notification' });
        if (tab === 0) {
            await wait('ackObserved');
            await command({ kind: 'record', reviews: [review] });
            if (await command({ kind: 'claim', id: runId, providerContext: runId }) !== null) throw new Error('Completed operation replayed.');
            await post({ type: 'replayed' });
        }
        await wait('replayed', 1);
        await assertEmpty();
        await post({ type: 'settled' });
        if (tab === 0) {
            await wait('settled');
            await post({ type: 'done' });
        }
    } catch (error) { await post({ type: 'error', error: String(error?.message ?? error) }); }
    finally { if (listener !== undefined) globalThis.GM_removeValueChangeListener?.(listener); }
}
