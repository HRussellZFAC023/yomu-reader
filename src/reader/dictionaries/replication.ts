import { Logger } from '../app/logger';
import { listDictionaryArchives, readDictionaryArchiveFile, type DictionaryArchiveMeta } from './archive-cache';
import { yomitanDictionaryIdentity } from './yomitan/zip-normalize';
import type { DictionaryImportOptions, ImportSummary } from './yomitan';
import type { ReaderSettings } from '../app/types';

const log = Logger.scope('DictionaryReplication');

// Imported dictionaries live in per-origin IndexedDB, so settings can promise
// sources this origin has never seen. Replication compares the enabled
// dictionary preferences against what is actually installed here and rebuilds
// the missing ones from the cross-origin archive cache — the same path also
// heals a store the browser evicted (Safari/Firefox storage pressure).
const REPLICATION_STATE_KEY = 'yomu-dictionary-replication-state';
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 6 * 60 * 60 * 1000;

export interface DictionaryReplicationStore {
    summary(): Promise<{ dictionaries: { title: string }[] }>;
    importFile(file: File, onProgress?: (message: string) => void, sourceUrl?: string, options?: DictionaryImportOptions): Promise<ImportSummary>;
    importFromUrl(url: string, filename?: string, onProgress?: (message: string) => void, options?: DictionaryImportOptions): Promise<ImportSummary>;
}

export interface DictionaryReplicationOptions {
    dictionaries: DictionaryReplicationStore;
    getSettings: () => ReaderSettings;
    onReplicated: (importedTitles: string[]) => void;
    now?: () => number;
}

interface ReplicationAttemptState {
    attempts: number;
    lastAt: number;
}

let replicationInFlight = false;

export async function ensureLocalDictionariesReplicated(options: DictionaryReplicationOptions): Promise<string[]> {
    if (replicationInFlight) return [];
    replicationInFlight = true;
    try {
        return await replicateMissingDictionaries(options);
    } catch (error) {
        log.warn('Dictionary replication pass failed', error);
        return [];
    } finally {
        replicationInFlight = false;
    }
}

async function replicateMissingDictionaries(options: DictionaryReplicationOptions): Promise<string[]> {
    const settings = options.getSettings();
    if (!settings.localDictionariesEnabled) return [];
    const wanted = enabledPreferenceIdentities(settings);
    if (!wanted.size) return [];
    const missing = await missingArchives(options, wanted);
    if (!missing.length) return [];

    const now = options.now ?? Date.now;
    const state = readAttemptState();
    const imported: string[] = [];
    for (const [identity, meta] of missing) {
        if (!shouldAttempt(state[identity], now())) continue;
        try {
            const summary = await importArchive(options.dictionaries, identity, meta);
            if (summary) {
                imported.push(...summary.dictionaries);
                delete state[identity];
            }
        } catch (error) {
            state[identity] = { attempts: (state[identity]?.attempts ?? 0) + 1, lastAt: now() };
            log.warn('Dictionary replication failed', { identity, title: meta.title, attempts: state[identity].attempts }, error);
        }
    }
    writeAttemptState(state);
    if (imported.length) {
        log.info('Dictionaries replicated to this origin', { imported });
        options.onReplicated(imported);
    }
    return imported;
}

function enabledPreferenceIdentities(settings: ReaderSettings): Set<string> {
    return new Set(settings.dictionaryPreferences
        .filter(preference => preference.enabled)
        .map(preference => yomitanDictionaryIdentity(preference.name)));
}

async function missingArchives(
    options: DictionaryReplicationOptions,
    wanted: Set<string>,
): Promise<[string, DictionaryArchiveMeta][]> {
    const archives = await listDictionaryArchives();
    const candidates = Object.entries(archives).filter(([identity]) => wanted.has(identity));
    if (!candidates.length) return [];
    const installed = new Set((await options.dictionaries.summary()).dictionaries
        .map(info => yomitanDictionaryIdentity(info.title)));
    return candidates.filter(([identity]) => !installed.has(identity));
}

async function importArchive(
    store: DictionaryReplicationStore,
    identity: string,
    meta: DictionaryArchiveMeta,
): Promise<ImportSummary | null> {
    const file = await readDictionaryArchiveFile(identity);
    const importOptions = replicationImportOptions(meta);
    if (file) return store.importFile(file, undefined, meta.downloadUrl ?? '', importOptions);
    if (meta.downloadUrl) return store.importFromUrl(meta.downloadUrl, meta.filename || undefined, undefined, importOptions);
    return null;
}

function replicationImportOptions(meta: DictionaryArchiveMeta): DictionaryImportOptions {
    return {
        persistArchive: false,
        ...(meta.sha256 && meta.size > 0
            ? { integrity: { sha256: meta.sha256, bytes: meta.size } }
            : {}),
    };
}

function shouldAttempt(state: ReplicationAttemptState | undefined, now: number): boolean {
    if (!state) return true;
    if (state.attempts >= MAX_ATTEMPTS) return false;
    return now - state.lastAt >= RETRY_BACKOFF_MS;
}

// Attempt state is deliberately per-origin (localStorage): a broken archive
// should stop retrying HERE without suppressing replication on other origins.
function readAttemptState(): Record<string, ReplicationAttemptState> {
    try {
        const raw = localStorage.getItem(REPLICATION_STATE_KEY);
        const parsed = raw ? JSON.parse(raw) as Record<string, ReplicationAttemptState> : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeAttemptState(state: Record<string, ReplicationAttemptState>): void {
    try {
        localStorage.setItem(REPLICATION_STATE_KEY, JSON.stringify(state));
    } catch {
        // Origins without persistent storage simply retry next visit.
    }
}
