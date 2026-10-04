import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const source = readFileSync(resolve(process.env.YOMU_NATIVE_QA_GUARD_SOURCE ?? 'scripts/manual/prepare-firefox-anki-qa.mjs'), 'utf8');
const start = source.indexOf('function installGuard(');
if (start < 0) throw new Error('Native QA guard was not found.');
const config = { endpoint: 'http://127.0.0.1:8765', phaseId: 'qa-phase', cardId: 17, noteId: 19,
    deck: 'QA deck', model: 'QA model', expression: '読む', sentence: '本を読む。', permittedEase: 3 };

interface Faults {
    note?: Record<string, unknown>;
    card?: Record<string, unknown>;
    after?: Record<string, unknown>;
    ack?: unknown;
    noIncrement?: boolean;
    failRead?: boolean;
    failAfterReview?: boolean;
    loseReviewAck?: boolean;
    reservationFailure?: 'read' | 'write' | 'ack';
}

function fixture(allowReview: boolean, overrides: Faults = {}, RequestClass: typeof Request = Request) {
    const values: Record<string, unknown> = {};
    let handler: (message: unknown, sender: unknown, reply: (value: unknown) => void) => unknown;
    let reps = 0;
    const actions: string[] = [];
    const nativeFetch = async (resource: RequestInfo | URL, options?: RequestInit) => {
        const request = await new Request(resource, options).json();
        actions.push(request.action);
        let result: unknown = 6;
        if (request.action === 'notesInfo' && overrides.failRead) throw new Error('ownership read failed');
        if (request.action === 'cardsInfo' && overrides.failAfterReview && actions.includes('answerCards')) throw new Error('readback failed');
        if (request.action === 'notesInfo') result = [{ modelName: config.model, cards: [17], tags: ['yomu_v2_qa'], fields: {
            Expression: { value: config.expression }, Sentence: { value: config.sentence },
        }, ...overrides.note }];
        if (request.action === 'cardsInfo') result = [{ cardId: 17, note: 19, deckName: config.deck, reps,
            ...overrides.card, ...(actions.includes('answerCards') ? overrides.after : {}) }];
        if (request.action === 'answerCards') {
            if (!overrides.noIncrement) reps++;
            if (overrides.loseReviewAck) throw new Error('review acknowledgement lost');
            result = overrides.ack ?? [true];
        }
        return new Response(JSON.stringify({ result, error: null }), { status: 200 });
    };
    const api = {
        runtime: {
            id: 'qa-extension', getURL: (value: string) => `moz-extension://qa/${value}`,
            onMessage: { addListener: (listener: typeof handler) => { handler = listener; } },
            sendMessage: (message: unknown) => new Promise(resolve => {
                handler(message, { id: 'qa-extension', url: 'moz-extension://qa/newtab/index.html', frameId: 0 }, resolve);
            }),
        },
        storage: { local: {
            get: async (key: string) => {
                if (key === '__yomu_native_qa_reservation' && overrides.reservationFailure === 'read') throw new Error('reservation read failed');
                return Object.hasOwn(values, key) ? { [key]: values[key] } : {};
            },
            set: async (next: Record<string, unknown>) => {
                const reservation = Object.hasOwn(next, '__yomu_native_qa_reservation');
                if (reservation && overrides.reservationFailure === 'write') throw new Error('reservation write failed');
                Object.assign(values, structuredClone(next));
                if (reservation && overrides.reservationFailure === 'ack') throw new Error('reservation acknowledgement lost');
            },
        } },
    };
    const create = (surface: string) => {
        const context = { URL, Request: RequestClass, TextDecoder, structuredClone, fetch: nativeFetch, browser: api, location: { href: `moz-extension://qa/${surface}.html` } };
        const install = runInNewContext(`(${source.slice(start)})`, context) as (config: unknown) => void;
        install({ ...config, allowReview, surface });
        const call = (action: string, params: unknown, url = config.endpoint) => context.fetch(url, {
            method: 'POST', body: JSON.stringify({ action, version: 6, params }),
        });
        return Object.assign(call, { fetch: context.fetch });
    };
    const background = create('background');
    return { background, page: create('study'), secondPage: create('study'), actions, values, reps: () => reps,
        grant: (message: unknown, sender: unknown) => new Promise(resolve => { handler(message, sender, resolve); }),
        restart: () => { create('background'); return create('study'); } };
}

it('allows reads but refuses every mutation in the default mode', async () => {
    const { page, background, actions, reps } = fixture(false);
    await page('version', {});
    await expect(page('answerCards', { answers: [{ cardId: 17, ease: 3 }] })).rejects.toThrow('read-only');
    await expect(background('deleteNotes', { notes: [19] })).rejects.toThrow('read-only');
    expect(actions).toEqual(['version']);
    expect(reps()).toBe(0);
});

it('reads request bytes even when the browser does not expose a body stream', async () => {
    class RequestWithoutBodyStream extends Request {
        get body(): null { return null; }
    }
    const { page, actions } = fixture(false, {}, RequestWithoutBodyStream);
    await page('version', {});
    await expect(page('answerCards', { answers: [{ cardId: 17, ease: 3 }] })).rejects.toThrow('read-only');
    expect(actions).toEqual(['version']);
});

it('permits only one scoped native review across page/background contexts', async () => {
    const { page, secondPage, background, actions, reps } = fixture(true);
    const answer = { answers: [{ cardId: 17, ease: 3 }] };
    const results = await Promise.allSettled([page('answerCards', answer), secondPage('answerCards', answer), background('answerCards', answer)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(actions.filter(action => action === 'answerCards')).toHaveLength(1);
    expect(reps()).toBe(1);
});

it.each([1, 2, 4, 0, 5, undefined])('never dispatches an answer outside the approved Good scope: %s', async ease => {
    const { page, actions, reps } = fixture(true);
    await expect(page('answerCards', { answers: [{ cardId: 17, ease }] })).rejects.toThrow('unscoped');
    expect(actions).toEqual([]);
    expect(reps()).toBe(0);
    await expect(page('answerCards', { answers: [{ cardId: 17, ease: 3 }] })).resolves.toBeDefined();
    expect(actions.filter(action => action === 'answerCards')).toHaveLength(1);
});

it('preserves the completed receipt when Study and the background restart', async () => {
    const { page, restart, values } = fixture(true);
    const answer = { answers: [{ cardId: 17, ease: 3 }] };
    await page('answerCards', answer);
    const receipt = structuredClone(values.__yomu_native_qa_review);
    expect(receipt).toMatchObject({ phaseId: config.phaseId, review: { verified: true, beforeReps: 0, afterReps: 1 } });
    await restart()('version', {});
    expect(values.__yomu_native_qa_review).toEqual(receipt);
    await expect(restart()('answerCards', answer)).rejects.toThrow('already consumed');
    expect(values.__yomu_native_qa_review).toEqual(receipt);
});

it('refuses other cards, endpoints, and mutations hidden in multi', async () => {
    const { page, actions, reps } = fixture(true);
    await expect(page('answerCards', { answers: [{ cardId: 42, ease: 3 }] })).rejects.toThrow('unscoped');
    await expect(page('multi', { actions: [{ action: 'answerCards', params: { answers: [{ cardId: 17, ease: 3 }] } }] })).rejects.toThrow('unscoped');
    await expect(page('version', {}, 'http://other.test:8765')).rejects.toThrow('another Anki endpoint');
    expect(actions).toEqual([]);
    expect(reps()).toBe(0);
});

it.each([
    { note: { modelName: 'Personal model' } }, { note: { cards: [] } }, { note: { tags: [] } },
    { note: { fields: {} } }, { card: { note: 42 } }, { card: { deckName: 'Personal deck' } }, { card: { reps: 1 } },
])('refuses changed ownership or history before dispatch: %j', async overrides => {
    const { page, actions } = fixture(true, overrides);
    await expect(page('answerCards', { answers: [{ cardId: 17, ease: 3 }] })).rejects.toThrow('ownership changed');
    expect(actions).not.toContain('answerCards');
});

it('keeps an attempted reservation consumed across background restart', async () => {
    const options = { failRead: true };
    const { page, restart, actions } = fixture(true, options);
    await expect(page('answerCards', { answers: [{ cardId: 17, ease: 3 }] })).rejects.toThrow('ownership read failed');
    options.failRead = false;
    await expect(restart()('answerCards', { answers: [{ cardId: 17, ease: 3 }] })).rejects.toThrow('already consumed');
    expect(actions).not.toContain('answerCards');
});

it.each(['read', 'write', 'ack'] as const)('never dispatches when reservation %s fails', async reservationFailure => {
    const options: Faults = { reservationFailure };
    const { page, restart, actions, values } = fixture(true, options);
    const answer = { answers: [{ cardId: 17, ease: 3 }] };
    await expect(page('answerCards', answer)).rejects.toThrow('unavailable');
    expect(actions).toEqual([]);
    if (reservationFailure === 'ack') {
        expect(values.__yomu_native_qa_reservation).toBe(config.phaseId);
        delete options.reservationFailure;
        await expect(restart()('answerCards', answer)).rejects.toThrow('already consumed');
        expect(actions).toEqual([]);
    } else {
        expect(values).not.toHaveProperty('__yomu_native_qa_reservation');
    }
});

it.each(['failAfterReview', 'loseReviewAck'] as const)('does not replay a native review after %s', async fault => {
    const options: Faults = { [fault]: true };
    const { page, restart, actions, values, reps } = fixture(true, options);
    const answer = { answers: [{ cardId: 17, ease: 3 }] };
    await expect(page('answerCards', answer)).rejects.toThrow(fault === 'failAfterReview' ? 'readback failed' : 'acknowledgement lost');
    options[fault] = false;
    await expect(restart()('answerCards', answer)).rejects.toThrow('already consumed');
    expect(actions.filter(action => action === 'answerCards')).toHaveLength(1);
    expect(reps()).toBe(1);
    expect(values.__yomu_native_qa_study).not.toMatchObject({ review: { verified: true } });
});

it.each([
    { sender: { id: 'other-extension' } },
    { sender: { url: 'https://yomureader.com/study/' } },
    { sender: { url: 'moz-extension://qa/qa-report.html' } },
    { sender: { frameId: 1 } },
    { phaseId: 'stale-phase' },
])('refuses an invalid grant requester without consuming the real grant: %j', async invalid => {
    const { grant, page, actions, values } = fixture(true);
    const result = await grant({ channel: 'yomu.qa-anki-grant', phaseId: invalid.phaseId ?? config.phaseId },
        { id: 'qa-extension', url: 'moz-extension://qa/newtab/index.html', frameId: 0, ...invalid.sender });
    expect(result).toBe(false);
    expect(values).not.toHaveProperty('__yomu_native_qa_reservation');
    expect(actions).toEqual([]);
    await page('answerCards', { answers: [{ cardId: 17, ease: 3 }] });
    expect(actions.filter(action => action === 'answerCards')).toHaveLength(1);
});

it.each([{ ack: [false] }, { noIncrement: true }, { after: { note: 42 } }])('does not mark bad native readback verified: %j', async overrides => {
    const { page, values } = fixture(true, overrides);
    await page('answerCards', { answers: [{ cardId: 17, ease: 3 }] });
    expect(values.__yomu_native_qa_study).toMatchObject({ review: { verified: false } });
});

it('forwards the validated request snapshot rather than later caller mutations', async () => {
    const { page, actions, values } = fixture(true);
    const options = { method: 'POST', body: JSON.stringify({ action: 'answerCards', version: 6, params: { answers: [{ cardId: 17, ease: 3 }] } }) };
    const pending = page.fetch(config.endpoint, options);
    options.body = JSON.stringify({ action: 'deleteNotes', version: 6, params: { notes: [42] } });
    await pending;
    expect(actions).not.toContain('deleteNotes');
    expect(values.__yomu_native_qa_study).toMatchObject({ review: { verified: true, beforeReps: 0, afterReps: 1 } });
});

it.each(['request', 'blob'])('refuses alternate loopback endpoints with a %s body', async kind => {
    const { page, actions } = fixture(false);
    const body = JSON.stringify({ action: 'deleteNotes', version: 6, params: { notes: [42] } });
    const request = kind === 'request' ? new Request('http://localhost:8765', { method: 'POST', body }) : 'http://localhost:8765';
    const options = kind === 'blob' ? { method: 'POST', body: new Blob([body]) } : undefined;
    await expect(page.fetch(request, options)).rejects.toThrow('another Anki endpoint');
    expect(actions).toEqual([]);
});
