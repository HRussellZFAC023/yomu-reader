import { STORAGE_WORK_LEASE_MS } from '../app/gm-storage-lease';
import { gmStorageDelete, gmStorageGetStrict, gmStorageSet, withGmStorageLease } from '../app/storage';
import { userFacingCopyKeyOf } from '../app/user-facing-errors';
import type { JPDBCard } from '../app/types';
import type { CollectionDestinationId } from './srs-providers';

const KEY = 'yomu:collection-save-failure:v1';

// Store copy IDs only: API errors can contain request URLs, credentials or payloads.
const REASONS = ['collectNoDestination', 'collectWordNotFound', 'jpdbAddApiKeyRequired', 'jitenAddApiKeyRequired',
    'jitenNeedsWordList', 'bunproAddApiKeyRequired', 'bunproNoMatchingWord', 'yomuLocalSrsDisabled',
    'yomuLocalSrsStorageFailed', 'yomuLocalSrsSaveInterrupted', 'apiSrsActionsDisabled', 'collectServiceUnavailable'] as const;
type FailureReason = typeof REASONS[number];
type Destination = CollectionDestinationId;
const DESTINATIONS: readonly Destination[] = ['jpdb', 'jiten', 'bunpro', 'wanikani', 'yomu-local', 'anki'];

export interface CollectionSaveFailure {
    readonly id: string;
    readonly word: string;
    readonly reading: string;
    readonly destination: Destination;
    readonly reason: FailureReason;
}

type SaveTarget = Pick<JPDBCard, 'spelling' | 'reading'> & { readonly destination: Destination };

export async function recordCollectionSaveFailure(target: SaveTarget, error: unknown): Promise<void> {
    const copyKey = userFacingCopyKeyOf(error);
    const failure: CollectionSaveFailure = { id: crypto.randomUUID(), word: target.spelling.slice(0, 200),
        reading: target.reading.slice(0, 200), destination: target.destination,
        reason: REASONS.find(reason => reason === copyKey) ?? 'collectServiceUnavailable' };
    await mutateFailure(() => gmStorageSet(KEY, failure));
}

export async function readCollectionSaveFailure(): Promise<CollectionSaveFailure | null> {
    const stored: unknown = await gmStorageGetStrict(KEY, null);
    if (!stored || typeof stored !== 'object' || !('id' in stored) || !('word' in stored)
        || !('reading' in stored) || !('destination' in stored) || !('reason' in stored)) return null;
    const { id, word, reading, destination, reason } = stored;
    const parsedDestination = DESTINATIONS.find(candidate => candidate === destination);
    const parsedReason = REASONS.find(candidate => candidate === reason);
    return typeof id === 'string' && typeof word === 'string' && word.length <= 200
        && typeof reading === 'string' && reading.length <= 200 && parsedDestination && parsedReason
        ? { id, word, reading, destination: parsedDestination, reason: parsedReason } : null;
}

export async function clearCollectionSaveFailure(target: SaveTarget | string): Promise<void> {
    await mutateFailure(async () => {
        const failure = await readCollectionSaveFailure();
        if (!failure) return;
        const matches = typeof target === 'string' ? failure.id === target
            : failure.word === target.spelling.slice(0, 200) && failure.reading === target.reading.slice(0, 200)
                && failure.destination === target.destination;
        if (matches) await gmStorageDelete(KEY);
    });
}

function mutateFailure(operation: () => Promise<void>): Promise<void> {
    return withGmStorageLease('collection-save-failure', operation,
        { leaseMs: STORAGE_WORK_LEASE_MS, guards: key => key === KEY });
}
