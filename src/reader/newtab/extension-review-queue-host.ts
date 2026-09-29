import { ReviewQueueOwner, REVIEW_QUEUE_OWNER_KEY, NEW_TAB_GRADE_QUEUE_LIMIT, type ReviewQueueState } from './review-queue-owner';
import { isReviewQueueRecord as validReview, REVIEW_QUEUE_CHANNEL } from './review-queue-protocol';
import { MANAGED_STATE_SLOT_KEY_PREFIX } from '../app/managed-storage-keys';
import {
    managedStateEpochToken, managedStateLogicalValue, managedStateStoredValue,
    parseManagedStateEpoch, sameManagedStateEpoch, type ManagedStateEpoch,
} from '../app/managed-state-epoch';

export { REVIEW_QUEUE_CHANNEL } from './review-queue-protocol';

interface QueueSender { id?: string; url?: string; frameId?: number }
interface QueueRuntime {
    id: string;
    getURL(path: string): string;
    onMessage: { addListener(listener: (message: unknown, sender: QueueSender, reply: (value: unknown) => void) => true | undefined): void };
}
interface QueueStorage {
    get(key: string): Promise<Record<string, unknown>>;
    set(values: Record<string, unknown>): Promise<void>;
}
interface QueueExtensionApi { runtime: QueueRuntime; storage: { local: QueueStorage } }
export interface ReviewQueueExtensionRoot { browser?: QueueExtensionApi; chrome?: QueueExtensionApi }

export function installExtensionReviewQueueHost(root: ReviewQueueExtensionRoot, prefix: string): void {
    const api = root.browser ?? root.chrome;
    if (!api?.runtime?.onMessage || !api.storage?.local || !prefix) return;
    const expectedUrl = api.runtime.getURL('newtab/index.html');
    const owners = new Map<string, ReviewQueueOwner>();

    api.runtime.onMessage.addListener((message, sender, reply) => {
        if (!record(message) || message.channel !== REVIEW_QUEUE_CHANNEL) return undefined;
        if (sender.id !== api.runtime.id || sender.url?.split(/[?#]/u)[0] !== expectedUrl
            || (sender.frameId !== undefined && sender.frameId !== 0)) {
            reply({ ok: false, error: 'Review queue is restricted to packaged Study.' });
            return true;
        }
        void handle(message).then(value => reply({ ok: true, value }), error => reply({
            ok: false, error: error instanceof Error ? error.message : 'Review queue operation failed.',
        }));
        return true;
    });

    async function handle(request: Record<string, unknown>): Promise<unknown> {
        if (!Object.hasOwn(request, 'epoch') || request.epoch === undefined) throw new Error('Review queue requires a reset generation.');
        const epoch = parseManagedStateEpoch(request.epoch);
        await assertEpoch(api!.storage.local, prefix, epoch);
        const token = managedStateEpochToken(epoch);
        let owner = owners.get(token);
        if (!owner) {
            owner = new ReviewQueueOwner(epochStorage(api!.storage.local, prefix, epoch), NEW_TAB_GRADE_QUEUE_LIMIT);
            owners.set(token, owner);
        }
        if (request.kind === 'list') return owner.list();
        if (request.kind === 'snapshot') {
            if (!Array.isArray(request.ids) || request.ids.length > NEW_TAB_GRADE_QUEUE_LIMIT || !request.ids.every(shortString)
                || !Array.isArray(request.scopes) || request.scopes.length > 4 || !request.scopes.every(shortString)) {
                throw new Error('Invalid review snapshot request.');
            }
            return owner.snapshot(request.ids, request.scopes);
        }
        if (request.kind === 'record') {
            if (!Array.isArray(request.reviews) || !request.reviews.length || request.reviews.length > 4
                || !request.reviews.every(item => validReview(item) && item.attempts === 0)) throw new Error('Invalid review record.');
            return owner.record(request.reviews);
        }
        if (!shortString(request.id) || typeof request.providerContext !== 'string' || request.providerContext.length > 256) throw new Error('Invalid review identity.');
        if (request.kind === 'claim') return owner.claim(request.id, request.providerContext);
        if (request.kind === 'acknowledge') return owner.acknowledge(request.id, request.providerContext);
        throw new Error('Unsupported review queue operation.');
    }
}

function epochStorage(area: QueueStorage, prefix: string, epoch: ManagedStateEpoch) {
    const logicalKey = epoch.generation === 0 ? REVIEW_QUEUE_OWNER_KEY
        : `${MANAGED_STATE_SLOT_KEY_PREFIX}${encodeURIComponent(managedStateEpochToken(epoch))}:${encodeURIComponent(REVIEW_QUEUE_OWNER_KEY)}`;
    const key = `${prefix}${logicalKey}`;
    return {
        read: async (): Promise<ReviewQueueState> => {
            await assertEpoch(area, prefix, epoch);
            const values = await area.get(key);
            await assertEpoch(area, prefix, epoch);
            if (!Object.hasOwn(values, key)) return { reviews: [], completed: {} };
            const state = managedStateLogicalValue<unknown>(values[key], epoch, null);
            if (!record(state) || !Array.isArray(state.reviews) || !state.reviews.every(validReview)
                || new Set(state.reviews.map(item => item.id)).size !== state.reviews.length
                || !record(state.completed) || !Object.entries(state.completed).every(([id, identity]) => shortString(id) && shortString(identity))
                || state.reviews.some(item => Object.hasOwn(state.completed as object, item.id))
                || (state.completionVersions !== undefined && (!record(state.completionVersions)
                    || !Object.values(state.completionVersions).every(value => Number.isSafeInteger(value) && Number(value) >= 0)))) {
                throw new Error('Stored review queue is invalid; no reviews were changed.');
            }
            return state as unknown as ReviewQueueState;
        },
        write: async (state: ReviewQueueState): Promise<void> => {
            await assertEpoch(area, prefix, epoch);
            await area.set({ [key]: managedStateStoredValue(state, epoch) });
            await assertEpoch(area, prefix, epoch);
        },
    };
}

async function assertEpoch(area: QueueStorage, prefix: string, expected: ManagedStateEpoch): Promise<void> {
    const key = `${prefix}yomu:state-epoch`;
    const first = parseManagedStateEpoch((await area.get(key))[key]);
    if (!sameManagedStateEpoch(first, expected)) throw new Error('Review queue reset generation changed.');
    const signalKey = `${prefix}yomu:factory-reset-signal`;
    const signal = (await area.get(signalKey))[signalKey];
    if (record(signal) && signal.phase === 'prepare') throw new Error('Review queue is paused for factory reset.');
    const last = parseManagedStateEpoch((await area.get(key))[key]);
    if (!sameManagedStateEpoch(last, expected)) throw new Error('Review queue reset generation changed.');
}

function record(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function shortString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
