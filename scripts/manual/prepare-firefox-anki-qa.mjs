#!/usr/bin/env node
// Prepare an isolated package; does not launch Firefox or submit a review.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enabling = process.argv[2] === '--enable-review';
let scope;
let config;
if (enabling) {
    scope = path.resolve(process.argv[3] ?? '');
    if (!scope.startsWith(`${root}/artifacts/native-firefox-qa-`)) throw new Error('Expected an owned QA artifact directory.');
    config = JSON.parse(await readFile(path.join(scope, 'qa-config.json'), 'utf8'));
    if (config.allowReview) throw new Error('A write-enabled QA scope cannot be rearmed.');
    await (await open(path.join(scope, 'review-enable.lock'), 'wx', 0o600)).close();
} else {
    const receipt = JSON.parse(await readFile(path.resolve(process.argv[2] ?? ''), 'utf8'));
    if (!/^yomu-v2-qa-\d+-[a-f0-9]{8}$/u.test(receipt.runId) || !receipt.createdNoteIds?.includes(receipt.noteId)) throw new Error('Expected an owned QA receipt.');
    config = { runId: receipt.runId, noteId: receipt.noteId, cardId: receipt.cardIds?.[0],
        deck: `Yomu v2 QA::${receipt.runId}`, model: `Yomu v2 QA ${receipt.runId}`, uuid: randomUUID() };
}
const endpoint = 'http://127.0.0.1:8765';
const readNative = async (action, params) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, version: 6, params }) });
    const value = await response.json();
    if (value.error) throw new Error('Native QA preflight failed.');
    return value.result;
};
const [note] = await readNative('notesInfo', { notes: [config.noteId] });
const [card] = await readNative('cardsInfo', { cards: [config.cardId] });
const dom = new JSDOM();
const text = html => {
    const document = new dom.window.DOMParser().parseFromString(html ?? '', 'text/html');
    document.querySelectorAll('rt,rp').forEach(node => node.remove());
    return document.body.textContent?.trim();
};
if (note?.modelName !== config.model || card?.deckName !== config.deck || card.note !== config.noteId || card.cardId !== config.cardId
    || card.reps !== 0 || !note.cards.includes(config.cardId) || !note.tags.includes('yomu_v2_qa')
    || text(note.fields?.Expression?.value) !== '読む' || text(note.fields?.Sentence?.value) !== '本を読む。') throw new Error('QA ownership/content or zero-review state did not match.');
dom.window.close();
config = { ...config, endpoint, allowReview: enabling, permittedEase: 3, phaseId: randomUUID(),
    expression: note.fields.Expression.value, sentence: note.fields.Sentence.value };

if (!enabling) {
    scope = await mkdtemp(path.join(root, 'artifacts/native-firefox-qa-'));
    const bytes = await readFile(path.join(root, 'dist/extension/release/firefox/yomureader.com-firefox.xpi'));
    config.packageSha256 = createHash('sha256').update(bytes).digest('hex');
    for (const [name, value] of Object.entries(unzipSync(bytes))) {
        const destination = path.resolve(scope, 'extension', name);
        if (!destination.startsWith(`${scope}/extension/`)) throw new Error('Unsafe XPI member.');
        if (name.endsWith('/')) { await mkdir(destination, { recursive: true }); continue; }
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, value);
    }
    await writeFile(path.join(scope, 'background.original.js'), await readFile(path.join(scope, 'extension/background.js')));
    const manifest = JSON.parse(await readFile(path.join(scope, 'extension/manifest.json'), 'utf8'));
    const id = manifest.browser_specific_settings?.gecko?.id ?? manifest.applications?.gecko?.id;
    if (!id) throw new Error('Firefox package identity is missing.');
    await mkdir(path.join(scope, 'profile'), { mode: 0o700 });
    await writeFile(path.join(scope, 'profile/user.js'), `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [id]: config.uuid }))});\nuser_pref("browser.shell.checkDefaultBrowser", false);\n`);
}
await writeFile(path.join(scope, 'qa-config.json'), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
await writeFile(path.join(scope, 'extension/background.js'), `(${installGuard.toString()})(${JSON.stringify({ ...config, surface: 'background' })});\n${await readFile(path.join(scope, 'background.original.js'), 'utf8')}`);
await writeFile(path.join(scope, 'extension/newtab/native-qa-guard.js'), `(${installGuard.toString()})(${JSON.stringify({ ...config, surface: 'study' })});`);
const indexPath = path.join(scope, 'extension/newtab/index.html');
const index = await readFile(indexPath, 'utf8');
if (!index.includes('native-qa-guard.js')) await writeFile(indexPath, index.replace('</head>', '<script src="native-qa-guard.js"></script></head>'));
await writeFile(path.join(scope, 'extension/qa-report.html'), '<!doctype html><meta charset="utf-8"><title>Yomu native QA evidence</title><h1>Native QA evidence</h1><pre>Loading</pre><script src="qa-report.js"></script>');
await writeFile(path.join(scope, 'extension/qa-report.js'), `const api=globalThis.browser||globalThis.chrome; api.storage.local.get(['__yomu_native_qa_background','__yomu_native_qa_study','__yomu_native_qa_review']).then(value=>{document.querySelector('pre').textContent=JSON.stringify(value,null,2)});`);
console.log(JSON.stringify({ scope, mode: enabling ? 'one-scoped-review' : 'read-only', phaseId: config.phaseId, cardId: config.cardId, packageSha256: config.packageSha256,
    studyUrl: `moz-extension://${config.uuid}/newtab/index.html`, reportUrl: `moz-extension://${config.uuid}/qa-report.html` }));

function installGuard(config) {
    const api = globalThis.browser ?? globalThis.chrome;
    const original = globalThis.fetch.bind(globalThis);
    const state = { phaseId: config.phaseId, surface: config.surface, mode: config.allowReview ? 'one-scoped-review' : 'read-only', reads: 0, refused: [], review: null };
    let publication = Promise.resolve();
    const publish = () => publication = publication.then(() => api.storage.local.set({
        [`__yomu_native_qa_${config.surface}`]: structuredClone(state),
        ...(state.review ? { __yomu_native_qa_review: { phaseId: config.phaseId, review: structuredClone(state.review) } } : {}),
    }))
        .catch(() => { state.loggingFailed = true; });
    void publish();
    const reads = new Set(['version', 'deckNames', 'deckNamesAndIds', 'modelNames', 'modelFieldNames', 'modelTemplates', 'modelStyling',
        'findCards', 'findNotes', 'notesInfo', 'cardsInfo', 'cardsToNotes', 'getDecks', 'getDeckStats', 'getDeckConfig', 'areDue',
        'getSchedulingStates', 'retrieveMediaFile', 'canAddNotes', 'canAddNotesWithErrorDetail']);
    const readOnly = request => request && (reads.has(request.action) || request.action === 'multi'
        && Array.isArray(request.params?.actions) && request.params.actions.every(readOnly));
    let reservation = Promise.resolve();
    const reserve = () => {
        const result = reservation.then(async () => {
            if (!config.allowReview) return false;
            const existing = await api.storage.local.get('__yomu_native_qa_reservation');
            if (existing.__yomu_native_qa_reservation === config.phaseId) return false;
            await api.storage.local.set({ __yomu_native_qa_reservation: config.phaseId });
            return true;
        });
        reservation = result.then(() => undefined, () => undefined);
        return result;
    };
    if (config.surface === 'background') api.runtime.onMessage.addListener((message, sender, reply) => {
        if (message?.channel !== 'yomu.qa-anki-grant') return undefined;
        if (message.phaseId !== config.phaseId || sender.id !== api.runtime.id
            || sender.url?.split(/[?#]/u)[0] !== api.runtime.getURL('newtab/index.html')
            || (sender.frameId !== undefined && sender.frameId !== 0)) { reply(false); return true; }
        void reserve().then(reply, () => reply(false));
        return true;
    });
    const refuse = async reason => { state.refused.push(reason); await publish(); throw new Error(reason); };
    globalThis.fetch = async (resource, options) => {
        const normalized = new Request(resource, options);
        const url = new URL(normalized.url);
        const bytes = ['GET', 'HEAD'].includes(normalized.method) ? null : await normalized.clone().arrayBuffer();
        const captured = bytes === null ? normalized : new Request(normalized, { body: bytes });
        let request;
        try { request = bytes === null ? null : JSON.parse(new TextDecoder().decode(bytes)); } catch { request = null; }
        if (url.origin !== config.endpoint) {
            if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || typeof request?.action === 'string') return refuse('QA refused another Anki endpoint.');
            return original(captured);
        }
        if (captured.method === 'GET' && bytes === null && url.pathname === '/' && !url.search) return original(captured);
        if (!request || request.version !== 6 || captured.method !== 'POST') {
            state.invalidRequest = { method: captured.method, bodyBytes: bytes?.byteLength ?? 0, version: typeof request?.version === 'number' ? request.version : null };
            return refuse('QA refused an unexpected Anki request.');
        }
        if (readOnly(request)) {
            const readNumber = ++state.reads;
            const response = await original(captured);
            if (readNumber === 1) await publish();
            return response;
        }
        if (!config.allowReview) return refuse('Native QA is read-only.');
        const answers = request.params?.answers;
        if (request.action !== 'answerCards' || !Array.isArray(answers) || answers.length !== 1
            || answers[0].cardId !== config.cardId || answers[0].ease !== config.permittedEase) return refuse('QA refused an unscoped or repeated mutation.');
        const permitted = config.surface === 'background' ? await reserve()
            : await api.runtime.sendMessage({ channel: 'yomu.qa-anki-grant', phaseId: config.phaseId });
        if (permitted !== true) return refuse('QA review permission was already consumed or unavailable.');
        const read = async (action, params) => {
            const response = await original(new Request(captured, { body: JSON.stringify({ ...request, action, params }) }));
            const value = await response.json();
            if (value.error) throw new Error('Native QA ownership read failed.');
            return value.result;
        };
        const [note] = await read('notesInfo', { notes: [config.noteId] });
        const [before] = await read('cardsInfo', { cards: [config.cardId] });
        if (note?.modelName !== config.model || !note.cards.includes(config.cardId) || !note.tags.includes('yomu_v2_qa')
            || note.fields?.Expression?.value !== config.expression || note.fields?.Sentence?.value !== config.sentence
            || before?.note !== config.noteId || before.deckName !== config.deck || before.reps !== 0) return refuse('Native QA ownership changed.');
        const response = await original(captured);
        const acknowledgement = await response.clone().json();
        const [after] = await read('cardsInfo', { cards: [config.cardId] });
        state.review = { cardId: config.cardId, ease: answers[0].ease, beforeReps: before.reps, afterReps: after?.reps,
            verified: !acknowledgement.error && Array.isArray(acknowledgement.result) && acknowledgement.result.length === 1 && acknowledgement.result[0] === true
                && after?.cardId === config.cardId && after.note === config.noteId && after.deckName === config.deck && after.reps === 1 };
        await publish();
        return response;
    };
}
