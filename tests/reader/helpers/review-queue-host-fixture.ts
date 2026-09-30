import { vi } from 'vitest';
import { installExtensionReviewQueueHost, REVIEW_QUEUE_CHANNEL, type ReviewQueueExtensionRoot } from '../../../src/reader/newtab/extension-review-queue-host';
import { parseManagedStateEpoch } from '../../../src/reader/app/managed-state-epoch';
import { ExtensionReviewQueueClient, type ReviewActionDraft, type ReviewActionDraftStorage } from '../../../src/reader/newtab/extension-review-queue-client';
import type { NewTabGradeQueueStorage } from '../../../src/reader/newtab/grade-queue';

type Listener = Parameters<NonNullable<ReviewQueueExtensionRoot['browser']>['runtime']['onMessage']['addListener']>[0];
type ReviewQueueReply = { ok: boolean; value?: unknown; error?: string };

export const reviewQueueHostPrefix = 'compiler.test.';
export const packagedStudySender = { id: 'owned-extension', url: 'moz-extension://owned/newtab/index.html#review', frameId: 0 };

export function draftStorage(): ReviewActionDraftStorage {
    let value: ReviewActionDraft | null = null;
    return { read: () => structuredClone(value), write: draft => { value = structuredClone(draft); }, clear: () => { value = null; } };
}

/** A real background review-queue host over an in-memory storage.local, plus typed Study clients. */
export function reviewQueueHostFixture() {
    let listener!: Listener;
    const data = new Map<string, unknown>();
    const get = vi.fn(async (key: string) => data.has(key) ? { [key]: structuredClone(data.get(key)) } : {});
    const set = vi.fn(async (values: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(values)) data.set(key, structuredClone(value));
    });
    installExtensionReviewQueueHost({ browser: {
        runtime: { id: packagedStudySender.id, getURL: path => `moz-extension://owned/${path}`, onMessage: { addListener: fn => { listener = fn; } } },
        storage: { local: { get, set } },
    } }, reviewQueueHostPrefix);
    const send = (request: Record<string, unknown>, from = packagedStudySender) => new Promise<ReviewQueueReply>(resolve => {
        listener({ channel: REVIEW_QUEUE_CHANNEL, epoch: null, ...request }, from, value => resolve(value as never));
    });
    const client = (transport: (request: Record<string, unknown>) => Promise<unknown> = send, drafts = draftStorage()) => new ExtensionReviewQueueClient(transport,
        async () => parseManagedStateEpoch(data.get(`${reviewQueueHostPrefix}yomu:state-epoch`)), drafts);
    return { data, get, set, send, client };
}

/** The GM key 1.9.3 wrote its offline queue to, as an in-memory store. */
export function memoryLegacyStorage(initial?: unknown): NewTabGradeQueueStorage & { values: Map<string, unknown> } {
    const values = new Map<string, unknown>();
    if (initial !== undefined) values.set('jpdb-reader-newtab-grade-queue', structuredClone(initial));
    return {
        values,
        get: async <T>(key: string, fallback: T) => values.has(key) ? structuredClone(values.get(key)) as T : fallback,
        set: async (key, value) => { values.set(key, structuredClone(value)); },
        delete: async key => { values.delete(key); },
    };
}
