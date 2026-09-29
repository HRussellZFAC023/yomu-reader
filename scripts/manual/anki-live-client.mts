import { JSDOM } from 'jsdom';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';

// Opt-in native API proof, not browser/GM-manager or media acceptance.
const write = process.argv.includes('--write');
const lostAddAck = process.argv.includes('--lost-add-ack');
if (lostAddAck && !write) throw new Error('Lost-ack testing requires --write.');
const endpoint = 'http://127.0.0.1:8765';
const resumeIndex = process.argv.indexOf('--resume');
const prior = resumeIndex < 0 ? undefined : JSON.parse(await readFile(process.argv[resumeIndex + 1], 'utf8'));
const emptyQaReceipt = prior && !prior.noteId && prior.createdNoteIds?.length === 0 && prior.actions?.includes('createModel');
if (prior && (!/^yomu-v2-qa-\d+-[a-f0-9]{8}$/.test(prior.runId)
    || !(prior.createdNoteIds?.includes(prior.noteId) || (lostAddAck && emptyQaReceipt)))) throw new Error('Resume requires a receipt for owned QA data.');
if (lostAddAck && prior?.noteId) throw new Error('Lost-ack testing requires an empty QA destination.');
const runId = prior?.runId ?? `yomu-v2-qa-${Date.now()}-${randomUUID().slice(0, 8)}`;
const deck = `Yomu v2 QA::${runId}`;
const model = `Yomu v2 QA ${runId}`;
if (prior && (prior.deck !== deck || prior.model !== model)) throw new Error('QA receipt destination mismatch.');
const ownedNotes = new Set<number>();
const ownedCards = new Set<number>();
let ownedModel = false;
let acknowledgementDropped = false;
const actions: string[] = [];
const expectedReviewCount = lostAddAck ? 0 : prior?.expectedReviewCount ?? (prior?.uncertainOutcomeRecovered ? 0 : 1);
if (expectedReviewCount !== 0 && expectedReviewCount !== 1) throw new Error('Invalid QA review expectation.');
const report: Record<string, unknown> = { runId, deck, model, mode: write ? 'isolated-write' : 'read-only', scope: 'production-client/native-api; jsdom and Node HTTP transport, not browser acceptance', expectedReviewCount, passed: false, actions };
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://yomureader.com/study/' });
for (const name of ['window', 'document', 'location', 'navigator', 'localStorage', 'sessionStorage', 'Event', 'CustomEvent', ...Object.getOwnPropertyNames(dom.window).filter(name => /^[A-Z]/.test(name))]) {
    if (name in globalThis && !['window', 'document', 'location', 'navigator', 'localStorage', 'sessionStorage', 'Event', 'CustomEvent'].includes(name)) continue;
    const value = (dom.window as unknown as Record<string, unknown>)[name];
    if (value !== undefined) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

const memory = new Map<string, unknown>([['yomu:enable-logs', false]]);
Object.assign(globalThis, {
    GM_getValue: (key: string, fallback: unknown) => memory.has(key) ? memory.get(key) : fallback,
    GM_setValue: (key: string, value: unknown) => { memory.set(key, value); },
    GM_deleteValue: (key: string) => { memory.delete(key); },
});

const reads = new Set(['version', 'deckNames', 'modelNames', 'modelFieldNames', 'findNotes', 'notesInfo', 'cardsInfo', 'areDue', 'getDeckStats', 'canAddNotes', 'canAddNotesWithErrorDetail']);
function authorize(action: string, params: Record<string, any>): void {
    if (reads.has(action)) return;
    if (action === 'multi') { for (const item of params.actions ?? []) authorize(item.action, item.params ?? {}); return; }
    if (!write) throw new Error(`Read-only run refused ${action}`);
    if (action === 'createDeck' && params.deck === deck) return;
    if (action === 'createModel' && params.modelName === model) return;
    if (ownedModel && (action === 'updateModelTemplates' || action === 'updateModelStyling') && params.model?.name === model) return;
    if (ownedModel && action === 'modelFieldAdd' && params.modelName === model) return;
    if (action === 'addNote' && params.note?.deckName === deck && params.note?.modelName === model) return;
    if (action === 'answerCards' && params.answers?.length && params.answers.every((answer: { cardId: number }) => ownedCards.has(answer.cardId))) return;
    throw new Error(`Refused out-of-scope Anki action: ${action}`);
}

Object.assign(globalThis, {
    GM_xmlhttpRequest: (details: any) => {
        const controller = new AbortController();
        void (async () => {
            if (details.url !== endpoint) throw new Error('Only the local Anki endpoint is allowed.');
            const request = JSON.parse(details.data);
            authorize(request.action, request.params ?? {});
            actions.push(request.action);
            const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: details.data, signal: controller.signal });
            const responseText = await response.text();
            const value = JSON.parse(responseText);
            if (request.action === 'createModel' && !value.error) { ownedModel = true; report.createdModel = model; }
            if (request.action === 'addNote' && !value.error && typeof value.result === 'number') {
                ownedNotes.add(value.result);
                report.noteId = value.result;
                if (lostAddAck && !acknowledgementDropped) {
                    acknowledgementDropped = true;
                    report.lostAcknowledgement = true;
                    details.onerror?.({ error: 'Simulated response loss after native note commit.' });
                    return;
                }
            }
            details.onload?.({ status: response.status, responseText, response: value });
        })().catch(error => {
            report.transportError = error instanceof Error ? error.message : String(error);
            details.onerror?.({ error: report.transportError });
        });
        return { abort: () => controller.abort() };
    },
});

let client: InstanceType<typeof import('../../src/reader/anki/client').AnkiConnectClient> | undefined;
try {
    const { DEFAULT_SETTINGS } = await import('../../src/reader/settings');
    const { AnkiConnectClient } = await import('../../src/reader/anki/client');
    const settings = {
        ...DEFAULT_SETTINGS, ankiEnabled: true, ankiConnectUrl: endpoint, ankiDeck: deck, ankiModel: model,
        ankiCaptureScreenshot: false, ankiFrontImage: false, audioEnabled: false, enableLogging: false, ankiTags: 'yomu_v2_qa',
    } satisfies ReaderSettings;
    client = new AnkiConnectClient(() => settings);
    report.version = await client.invoke('version');
    const [decks, models] = await Promise.all([client.deckNames(), client.modelNames()]);
    report.existingDeckCount = decks.length;
    report.existingModelCount = models.length;
    if (!prior && (decks.includes(deck) || models.includes(model))) throw new Error('QA destination already exists.');
    if (emptyQaReceipt && (!decks.includes(deck) || !models.includes(model))) throw new Error('The recorded QA destination is unavailable.');
    if (write || prior) {
        if (!prior) await client.ensureDeckAndModel();
        const card = {
            vid: 1, sid: 0, rid: 0, spelling: '読む', reading: 'よむ', language: 'ja', frequencyRank: null,
            partOfSpeech: [], meanings: [{ glosses: ['to read'], partOfSpeech: [] }], cardState: ['new'],
            pitchAccent: [], wordWithReading: null, source: 'local',
        } satisfies JPDBCard;
        let noteId = prior?.noteId;
        if (lostAddAck) {
            const query = `note:"${model}"`;
            if ((await client.invoke<number[]>('findNotes', { query })).length) throw new Error('Lost-ack QA destination is not empty.');
            let rejected = false;
            try { await client.addCard(card, '本を読む。'); } catch { rejected = true; }
            if (!rejected || !acknowledgementDropped || ownedNotes.size !== 1) throw new Error('The committed note response was not lost as intended.');
            client.destroy();
            client = new AnkiConnectClient(() => settings);
            let duplicateRejected = false;
            try { await client.addCard(card, '本を読む。'); }
            catch (error) { duplicateRejected = error instanceof Error && error.name === 'AnkiDuplicateNoteError'; }
            const found = await client.invoke<number[]>('findNotes', { query });
            if (!duplicateRejected || found.length !== 1 || !ownedNotes.has(found[0])) throw new Error('Retry duplicated or lost the committed note.');
            noteId = found[0];
            report.uncertainOutcomeRecovered = true;
            report.duplicateRejected = true;
        } else {
            noteId ??= await client.addCard(card, '本を読む。');
        }
        if (prior) ownedNotes.add(noteId);
        if (!noteId || !ownedNotes.has(noteId)) throw new Error('No confirmed QA note was created.');
        report.noteId = noteId;
        const [note] = await client.invoke<any[]>('notesInfo', { notes: [noteId] });
        const fieldText = (name: string) => {
            const document = new DOMParser().parseFromString(note.fields?.[name]?.value ?? '', 'text/html');
            document.querySelectorAll('rt,rp').forEach(node => node.remove());
            return document.body.textContent?.trim();
        };
        if (note?.noteId !== noteId || note?.modelName !== model || fieldText('Expression') !== '読む' || fieldText('Sentence') !== '本を読む。') throw new Error('Saved fields did not read back correctly.');
        const cards = await client.invoke<any[]>('cardsInfo', { cards: note.cards });
        if (!cards.length || cards.some(card => card.note !== noteId || card.deckName !== deck)) throw new Error('QA card ownership could not be verified.');
        cards.forEach(card => ownedCards.add(card.cardId));
        const before = cards[0];
        if (before.reps !== 0 && before.reps !== 1) throw new Error('QA card has unexpected review history; refusing to grade.');
        const expectedReps = expectedReviewCount;
        const submitReview = before.reps === 0 && write && expectedReps === 1;
        if (submitReview) await client.answerCard(before.cardId, 'okay');
        const [after] = await client.invoke<any[]>('cardsInfo', { cards: [before.cardId] });
        if (after.reps !== expectedReps) throw new Error('Native QA review count did not match the requested proof.');
        if (write && process.argv.includes('--check-duplicate')) {
            let duplicateRejected = false;
            try { await client.addCard(card, '本を読む。'); }
            catch (error) { duplicateRejected = error instanceof Error && error.name === 'AnkiDuplicateNoteError'; }
            const notes = await client.invoke<number[]>('findNotes', { query: `note:"${model}"` });
            if (!duplicateRejected || notes.length !== 1 || notes[0] !== noteId) throw new Error('Duplicate save did not preserve exactly one QA note.');
            report.duplicateRejected = true;
        }
        report.cardIds = [...ownedCards];
        report.review = { beforeReps: before.reps, afterReps: after.reps, submittedThisRun: submitReview, queue: after.queue, due: after.due };
        report.retainedQaData = true;
    }
    report.passed = true;
} catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    report.createdNoteIds = [...ownedNotes];
    process.exitCode = 1;
} finally {
    report.createdNoteIds = [...ownedNotes];
    client?.destroy();
    dom.window.close();
    const directory = fileURLToPath(new URL('../../artifacts/anki-live/', import.meta.url));
    await mkdir(directory, { recursive: true });
    const output = `${directory}${runId}${prior ? `-resume-${Date.now()}` : ''}.json`;
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ passed: report.passed, mode: report.mode, report: output, error: report.error }));
}
