import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const source = readFileSync(resolve('scripts/manual/firefox-review-owner-smoke.mjs'), 'utf8');
const start = source.indexOf('async function probe(');
if (start < 0) throw new Error('The injected Firefox probe was not found.');

async function runProbe(options: { terminal?: unknown; corruptClaim?: boolean; unstampedClaim?: boolean; brokenAck?: boolean; revision?: unknown; noNotifications?: boolean } = {}) {
    let pending: Record<string, unknown> | null = null;
    let completed = false;
    let records = 0;
    const events: Array<{ type: string; error?: string }> = [];
    let listener: (() => void) | undefined;
    let time = 0;
    const probe = runInNewContext(`(${source.slice(start)})`, {
        URL, setTimeout, document: { readyState: 'complete' },
        Date: options.noNotifications ? { now: () => { time += 10_000; return time; } } : Date,
        GM_addValueChangeListener: (_key: string, callback: () => void) => { listener = callback; return 1; },
        GM_removeValueChangeListener: () => { listener = undefined; },
        location: { href: 'moz-extension://test/newtab/index.html?review-proof=0' },
        browser: { runtime: { sendMessage: async (request: Record<string, unknown>) => {
            let value: unknown;
            if (request.kind === 'record') {
                records++;
                if (options.brokenAck && records > 1) { pending = null; completed = true; }
                else if (!completed) pending = structuredClone((request.reviews as Record<string, unknown>[])[0]);
            } else if (request.kind === 'claim') {
                if (completed) value = null;
                else {
                    // Like ReviewQueueOwner.claim: the attempt is stamped heldSince.
                    pending = options.unstampedClaim ? { ...pending, attempts: 1 } : { ...pending, attempts: 1, heldSince: 1_000 };
                    value = options.corruptClaim ? { ...pending, grade: 'easy' } : structuredClone(pending);
                }
            } else if (request.kind === 'list') {
                value = completed && Object.hasOwn(options, 'terminal') ? options.terminal : pending ? [structuredClone(pending)] : [];
            } else if (request.kind === 'acknowledge' && !options.brokenAck) {
                pending = null;
                completed = true;
                if (!options.noNotifications) listener?.();
            } else if (request.kind === 'snapshot') {
                value = { reviews: pending ? [structuredClone(pending)] : [],
                    statuses: { 'qa-operation': completed ? 'completed' : 'pending' },
                    revisions: { 'anki:qa-operation': Object.hasOwn(options, 'revision') ? options.revision : completed ? 1 : 0 } };
            }
            return { ok: true, value };
        } } },
        fetch: async (_url: string, init?: { method?: string; body?: string }) => {
            if (init?.method === 'POST') events.push(JSON.parse(init.body!));
            return { ok: true, json: async () => ({ ready: 2, observed: 2, acknowledged: 1, ackObserved: 2, replayed: 1, settled: 2 }) };
        },
    }) as (options: { endpoint: string; runId: string }) => Promise<void>;
    await probe({ endpoint: 'http://probe.invalid', runId: 'qa-operation' });
    return { events, records, listening: Boolean(listener) };
}

it('requires independent acknowledgement and replay checks before finishing', async () => {
    const { events, listening } = await runProbe();
    expect(events.map(event => event.type)).toEqual(['ready', 'claim', 'observed', 'acknowledged', 'ack-observed', 'notification', 'replayed', 'settled', 'done']);
    expect(listening).toBe(false);
});

it.each([{}, false, 0, ''])('rejects a malformed empty-looking terminal list: %j', async terminal => {
    const { events } = await runProbe({ terminal });
    expect(events.at(-1)).toMatchObject({ type: 'error', error: 'Terminal queue is not an empty array.' });
    expect(events.some(event => event.type === 'done')).toBe(false);
});

it('rejects grade corruption in a successful claim response', async () => {
    const { events } = await runProbe({ corruptClaim: true });
    expect(events.at(-1)).toMatchObject({ type: 'error', error: 'Invalid claim payload.' });
});

it('rejects a claim without the owner\'s heldSince stamp', async () => {
    const { events } = await runProbe({ unstampedClaim: true });
    expect(events.at(-1)).toMatchObject({ type: 'error', error: 'Invalid claim payload.' });
});

it('does not let a replay hide broken acknowledgement removal', async () => {
    const { events, records } = await runProbe({ brokenAck: true });
    expect(records).toBe(1);
    expect(events.at(-1)?.type).toBe('error');
});

it.each([0, '1', 2])('rejects a wrong or malformed completion revision: %j', async revision => {
    const { events, listening } = await runProbe({ revision });
    expect(events.at(-1)).toMatchObject({ type: 'error', error: 'Completion snapshot did not advance exactly once.' });
    expect(listening).toBe(false);
});

it('does not substitute direct snapshot polling for an actual change notification', async () => {
    const { events, listening } = await runProbe({ noNotifications: true });
    expect(events.at(-1)).toMatchObject({ type: 'error', error: 'Completion change notification was not observed.' });
    expect(events.some(event => event.type === 'done')).toBe(false);
    expect(listening).toBe(false);
});
