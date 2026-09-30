import { Blob as NodeBlob } from 'node:buffer';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeSessions, type PracticeMaterial, type PracticeSession, type PracticeAction } from '../../src/reader/study/practice-session';
import { PRACTICE_SESSION_DATABASE } from '../../src/reader/study/practice-session-store';

const words = (): PracticeMaterial[] => [
    { id: 'water', language: 'ja', spelling: '水', reading: 'みず', meaning: 'water', meaningLanguage: 'en', sentence: '水を飲む。' },
    { id: 'book', language: 'ja', spelling: '本', reading: 'ほん', meaning: 'book', meaningLanguage: 'en', sentence: '本を読む。' },
];

async function command(session: PracticeSession, action: PracticeAction) {
    return session.dispatch({ ...action, turn: session.view().turn });
}

describe('prepared practice sessions', () => {
    let factory: IDBFactory;
    let sessions: PracticeSessions;
    beforeEach(() => {
        factory = new IDBFactory();
        sessions = new PracticeSessions(factory);
        vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Practice must not fetch during a prepared session.'); }));
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

    it('keeps one purpose and frozen material across items and reload', async () => {
        const material = words();
        const session = await sessions.start({ purpose: 'recognition', material: material, title: 'Saved words' });
        material[0] = { ...material[0]!, spelling: 'changed' };
        expect(session.view().current?.prompt).toBe('水');
        expect(session.view().current?.answer).toBeUndefined();
        await command(session, { kind: 'reveal' });
        await command(session, { kind: 'self-check', outcome: 'recalled' });
        session.close();
        const resumed = await new PracticeSessions(factory).resume(session.view().id);
        expect(resumed.view()).toMatchObject({ purpose: 'recognition', position: 1, total: 2, current: { prompt: '本' } });
        expect(resumed.view().current?.answer).toBeUndefined();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('restores a partially typed answer, reveal and pause state exactly', async () => {
        const session = await sessions.start({ purpose: 'writing', material: words(), title: 'Writing' });
        const turn = session.view().turn;
        await Promise.all([
            session.dispatch({ turn, kind: 'draft', text: 'み' }),
            session.dispatch({ turn, kind: 'draft', text: 'みず' }),
        ]);
        await command(session, { kind: 'reveal' });
        await command(session, { kind: 'pause' });
        session.close();
        const restored = await sessions.resume(session.view().id);
        expect(restored.view()).toMatchObject({ status: 'paused', purpose: 'writing', current: {
            prompt: 'water', language: 'en', response: { draft: 'みず', revealed: true, attempts: 0 }, answer: { spelling: '水' },
        } });
        expect(await command(restored, { kind: 'next' })).toMatchObject({ kind: 'rejected', reason: 'invalid' });
        await command(restored, { kind: 'continue' });
        expect(restored.view().status).toBe('ready');
    });

    it('records exact and assisted attempts separately without grading a provider', async () => {
        const session = await sessions.start({ purpose: 'cloze', material: words(), title: 'Sentences' });
        expect(session.view().current?.prompt).toBe('＿＿を飲む。');
        await session.dispatch({ turn: session.view().turn, kind: 'answer', text: '本' });
        expect(session.view().current?.answer).toBeUndefined();
        await command(session, { kind: 'reveal' });
        await session.dispatch({ turn: session.view().turn, kind: 'answer', text: '水' });
        expect(session.view().current?.response).toMatchObject({
            attempts: 2, first: { text: '本', outcome: 'incorrect', assisted: false }, latest: 'correct',
        });
        await command(session, { kind: 'next' });
        await command(session, { kind: 'reveal' });
        await session.dispatch({ turn: session.view().turn, kind: 'answer', text: '本' });
        expect(session.view().current?.response.first?.assisted).toBe(true);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects a stale control instead of acting on the next item', async () => {
        const session = await sessions.start({ purpose: 'recognition', material: words(), title: 'Words' });
        await command(session, { kind: 'reveal' });
        const turn = session.view().turn;
        await session.dispatch({ turn, kind: 'self-check', outcome: 'recalled' });
        expect(await session.dispatch({ turn, kind: 'self-check', outcome: 'again' }))
            .toMatchObject({ kind: 'rejected', reason: 'stale' });
        expect(await session.dispatch({ turn, kind: 'pause' })).toMatchObject({ kind: 'rejected', reason: 'stale' });
        expect(session.view()).toMatchObject({ position: 1, current: { response: { revealed: false } } });
    });

    it('does not turn a storage failure into successful advancement', async () => {
        const session = await sessions.start({ purpose: 'recognition', material: words(), title: 'Words' });
        await command(session, { kind: 'reveal' });
        vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Quota full', 'QuotaExceededError'); });
        expect(await command(session, { kind: 'self-check', outcome: 'recalled' }))
            .toMatchObject({ kind: 'rejected', reason: 'storage', view: { position: 0, status: 'save-failed' } });
        expect((await sessions.resume(session.view().id)).view().position).toBe(0);
        expect(await command(session, { kind: 'self-check', outcome: 'recalled' }))
            .toMatchObject({ kind: 'applied', view: { position: 1 } });
    });

    it.each(['reveal', 'pause'] as const)('retains a failed draft when a later %s checkpoint succeeds', async kind => {
        const session = await sessions.start({ purpose: 'writing', material: words(), title: 'Words' });
        vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Quota full', 'QuotaExceededError'); });
        const failed = await session.dispatch({ turn: session.view().turn, kind: 'draft', text: 'みず' });
        expect(failed).toMatchObject({ kind: 'rejected', reason: 'storage' });
        expect(session.view().current?.response.draft).toBe('みず');
        expect(await command(session, { kind })).toMatchObject({ kind: 'applied' });
        expect((await sessions.resume(session.view().id)).view().current?.response.draft).toBe('みず');
    });

    it('pauses after queued responses without weakening stale UI-control checks', async () => {
        const session = await sessions.start({ purpose: 'writing', material: words(), title: 'Words' });
        const answer = session.dispatch({ kind: 'answer', text: '水', turn: session.view().turn });
        const pause = session.pause();
        expect(await answer).toMatchObject({ kind: 'applied' });
        expect(await pause).toMatchObject({ kind: 'applied', view: { status: 'paused' } });
        expect((await sessions.resume(session.view().id)).view().current?.response).toMatchObject({ draft: '水', latest: 'correct', revealed: true });
    });

    it('rejects text queued after an answer without leaving a pending or durable draft', async () => {
        const session = await sessions.start({ purpose: 'writing', material: words(), title: 'Words' });
        const turn = session.view().turn;
        const answer = session.dispatch({ kind: 'answer', text: 'wrong', turn });
        const draft = session.dispatch({ kind: 'draft', text: 'rejected text', turn });
        expect(await answer).toMatchObject({ kind: 'applied' });
        expect(await draft).toMatchObject({ kind: 'rejected', reason: 'stale' });
        expect(session.view()).toMatchObject({ status: 'ready', current: { response: { draft: 'wrong' } } });
        await session.pause();
        expect((await sessions.resume(session.view().id)).view()).toMatchObject({ status: 'paused', current: { response: { draft: 'wrong' } } });
    });

    it('accepts a new-turn response from a committed-state subscriber', async () => {
        const session = await sessions.start({ purpose: 'writing', material: words(), title: 'Words' });
        let followup: ReturnType<PracticeSession['dispatch']> | undefined;
        const unsubscribe = session.subscribe(view => {
            if (view.status === 'ready' && view.current?.response.latest === 'incorrect' && !followup) {
                followup = session.dispatch({ kind: 'answer', text: '水', turn: view.turn });
            }
        });
        await command(session, { kind: 'answer', text: 'wrong' });
        expect(followup).toBeDefined();
        expect(await followup).toMatchObject({ kind: 'applied' });
        unsubscribe();
        expect((await sessions.resume(session.view().id)).view().current?.response).toMatchObject({ draft: '水', latest: 'correct', attempts: 2 });
    });

    it('starts a different purpose from durable material without loading a provider again', async () => {
        const first = await sessions.start({ purpose: 'recognition', material: words(), title: 'Words' });
        const second = await new PracticeSessions(factory).start({ purpose: 'cloze', fromSession: first.view().id });
        expect(second.view()).toMatchObject({ purpose: 'cloze', total: 2, current: { prompt: '＿＿を飲む。' } });
        expect(second.view().id).not.toBe(first.view().id);
        expect((await sessions.resume(first.view().id)).view().purpose).toBe('recognition');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('retains source words excluded from one purpose for a later purpose after reload', async () => {
        const material = words().map((word, index) => index ? { ...word, sentence: undefined } : word);
        const cloze = await sessions.start({ purpose: 'cloze', material, title: 'Words' });
        expect(cloze.view()).toMatchObject({ total: 1, ineligible: 1 });
        cloze.close();
        const recognition = await new PracticeSessions(factory).start({ purpose: 'recognition', fromSession: cloze.view().id });
        expect(recognition.view()).toMatchObject({ total: 2, ineligible: 0 });
        await command(recognition, { kind: 'skip' });
        expect(recognition.view().current?.prompt).toBe('本');
    });

    it('retains original audio without exposing it in a text session', async () => {
        vi.stubGlobal('Blob', NodeBlob);
        const audio = new Blob(['prepared audio bytes'], { type: 'audio/wav' });
        const text = await sessions.start({ purpose: 'recognition', material: [{ ...words()[0]!, audio }], title: 'Words' });
        expect(text.view().current?.audio).toBeUndefined();
        text.close();
        const listening = await new PracticeSessions(factory).start({ purpose: 'listening', fromSession: text.view().id });
        expect(await listening.view().current?.audio?.text()).toBe('prepared audio bytes');
    });

    it('writes prepared material only once, not for each answer or draft', async () => {
        const stores: string[] = [];
        const put = IDBObjectStore.prototype.put;
        vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
            stores.push(this.name);
            return put.apply(this, args);
        });
        const session = await sessions.start({ purpose: 'writing', material: words(), title: 'Words' });
        const preparedWrites = () => stores.filter(name => name === 'material').length;
        expect(preparedWrites()).toBe(1);
        await session.dispatch({ kind: 'draft', text: 'み', turn: session.view().turn });
        await session.dispatch({ kind: 'answer', text: '水', turn: session.view().turn });
        await command(session, { kind: 'next' });
        expect(preparedWrites()).toBe(1);
    });

    it('keeps separate sessions independent and detects concurrent writers to one session', async () => {
        const first = await sessions.start({ purpose: 'writing', material: words(), title: 'Write' });
        const independent = await sessions.start({ purpose: 'recognition', material: words(), title: 'Read' });
        const second = await new PracticeSessions(factory).resume(first.view().id);
        const results = await Promise.all([
            first.dispatch({ turn: first.view().turn, kind: 'draft', text: 'みず' }),
            second.dispatch({ turn: second.view().turn, kind: 'draft', text: 'water' }),
        ]);
        expect(results.map(result => result.kind).sort()).toEqual(['applied', 'rejected']);
        expect(results.find(result => result.kind === 'rejected')).toMatchObject({ reason: 'conflict' });
        expect((await sessions.resume(independent.view().id)).view()).toMatchObject({ purpose: 'recognition', position: 0 });
    });

    it('excludes missing required context without silently choosing another exercise', async () => {
        const material = words();
        const session = await sessions.start({ purpose: 'cloze', material: [{ ...material[0]!, sentence: undefined }, material[1]!], title: 'Sentences' });
        expect(session.view()).toMatchObject({ purpose: 'cloze', total: 1, ineligible: 1, current: { prompt: '＿＿を読む。' } });
        await expect(sessions.start({ purpose: 'listening', material: words(), title: 'Listening' })).rejects.toThrow('No selected material');
    });

    it('retains required audio bytes across reload without a network request', async () => {
        vi.stubGlobal('Blob', NodeBlob);
        const audio = new Blob(['prepared audio bytes'], { type: 'audio/wav' });
        const session = await sessions.start({ purpose: 'listening', material: [{ ...words()[0]!, audio }], title: 'Listen' });
        const restored = await new PracticeSessions(factory).resume(session.view().id);
        expect(restored.view().current?.prompt).toBe('');
        expect(await restored.view().current?.audio?.text()).toBe('prepared audio bytes');
        expect(restored.view().current?.answer).toBeUndefined();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not treat prototype-property material IDs as existing responses', async () => {
        const session = await sessions.start({ purpose: 'writing', material: [{ ...words()[0]!, id: '__proto__' }], title: 'Write' });
        expect(session.view().current?.response).toEqual({ draft: '', revealed: false, attempts: 0 });
        await session.dispatch({ turn: session.view().turn, kind: 'answer', text: '水' });
        expect((await sessions.resume(session.view().id)).view().current?.response.attempts).toBe(1);
    });

    it('rejects a corrupt stored checkpoint without replacing it', async () => {
        const session = await sessions.start({ purpose: 'recognition', material: words(), title: 'Words' });
        await corruptSession(factory, record => ({ ...record, version: 99 }));
        await expect(sessions.resume(session.view().id)).rejects.toThrow('could not be restored');
        await expect(sessions.list()).rejects.toThrow('could not be read');
    });

    it.each([
        ['a response for an item the session never prepared', 'sessions', (record: Record<string, unknown>) => ({
            ...record, responses: { ...record.responses as object, stranger: { draft: '', revealed: false, attempts: 0 } },
        })],
        ['responses stored as a list', 'sessions', (record: Record<string, unknown>) => ({ ...record, responses: [] })],
        ['a response with a negative attempt count', 'sessions', (record: Record<string, unknown>) => ({
            ...record, responses: { water: { draft: '水', revealed: true, attempts: -1 } },
        })],
        ['two prepared items sharing one identity', 'material', (record: Record<string, unknown>) => {
            const [first] = record.items as Record<string, unknown>[];
            return { ...record, items: [first, { ...first }] };
        }],
        ['a prepared item without its prompt', 'material', (record: Record<string, unknown>) => {
            const [first, ...rest] = record.items as Record<string, unknown>[];
            return { ...record, items: [{ ...first, prompt: undefined }, ...rest] };
        }],
    ] as const)('refuses to restore a checkpoint with %s', async (_label, storeName, change) => {
        const session = await sessions.start({ purpose: 'writing', material: words(), title: 'Write' });
        await command(session, { kind: 'answer', text: '水' });
        await expect(new PracticeSessions(factory).resume(session.view().id)).resolves.toBeDefined();
        await corruptSession(factory, change, storeName);
        await expect(new PracticeSessions(factory).resume(session.view().id)).rejects.toThrow('could not be restored');
    });

    it('refuses to restore a listening checkpoint whose prepared items lost their audio', async () => {
        vi.stubGlobal('Blob', NodeBlob);
        const audio = new Blob(['prepared audio bytes'], { type: 'audio/wav' });
        const session = await sessions.start({ purpose: 'listening', material: [{ ...words()[0]!, audio }], title: 'Listen' });
        await corruptSession(factory, record => ({
            ...record, items: (record.items as Record<string, unknown>[]).map(({ audio: _audio, ...item }) => item),
        }), 'material');
        await expect(new PracticeSessions(factory).resume(session.view().id)).rejects.toThrow('could not be restored');
    });

    it('does not turn a render failure into a failed durable response', async () => {
        const session = await sessions.start({ purpose: 'writing', material: words(), title: 'Write' });
        let first = true;
        session.subscribe(() => { if (first) { first = false; return; } throw new Error('render failed'); });
        expect(await session.dispatch({ turn: session.view().turn, kind: 'answer', text: '水' })).toMatchObject({ kind: 'applied' });
        expect((await sessions.resume(session.view().id)).view().current?.response.latest).toBe('correct');
    });
});

async function corruptSession(
    factory: IDBFactory,
    change: (record: Record<string, unknown>) => Record<string, unknown>,
    storeName: 'sessions' | 'material' = 'sessions',
): Promise<void> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(PRACTICE_SESSION_DATABASE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => request.result.forEach(record => store.put(change(record)));
            transaction.oncomplete = () => resolve();
            transaction.onabort = () => reject(transaction.error);
        });
    } finally { db.close(); }
}
