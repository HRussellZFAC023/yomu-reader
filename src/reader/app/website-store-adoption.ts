import { isRecord } from '../core/object-utils';
import { isSettingsAuthorityStorageKey, RETIRED_SETTINGS_STORAGE_KEYS } from '../settings/settings-authority-storage-keys';
import { HOSTED_LOCAL_SETTINGS_KEYS } from './hosted-demo-settings';
import { isHostedYomuOrigin } from './hosted-storage-fallback';
import { localMirrorBelongsToEpoch } from './local-mirror-provenance';
import { isManagedStorageBackupKey } from './managed-storage-backup-policy';
import { managedStateEntries } from './managed-state-registry';
import { managedStateEpochToken, type ManagedStateEpoch } from './managed-state-epoch';
import { isMissingSentinel, MISSING, readManagedGmValue, type GmGetValue } from './managed-read-path';
import { localStorageGet } from './storage-local-values';

// Website-only Store: what a visitor saved on a Yomu website before installing
// the Reader (settings, local cards, progress). As in v1.9.3, a freshly
// installed Reader adopts it: only while the installed store holds no
// learner choice (no settings, no recorded settings intent, or the explicit
// `learningTargetChosen: false` builds before 2.1 wrote), only keys the
// installed store lacks, and only records this epoch wrote. Settings and their
// intent ledger are one unit: they are adopted only into a store holding
// neither. Nothing is merged back into the website.

const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const INTENT_LEDGER_KEY = 'yomu:settings-intent:v2';
const LOCAL_SRS_V2_INDEX_KEY = 'yomu:srs-local:v2:index';
// Settings publish last, so an interrupted adoption keeps the store fresh and resumes.
const LAST_KEYS = [LOCAL_SRS_V2_INDEX_KEY, 'yomu:prefer-japanese-site-language:v1', INTENT_LEDGER_KEY, SETTINGS_KEY];
const COORDINATION_FIELDS = ['__yomuSettingsPersistenceTransactionV1', '__yomuSettingsPersistenceCommitV1'];
const HOSTED_PATCH_FIELD = '__yomuHostedPendingGmPatch';
const OWNER_NAMESPACE_PREFIX = 'yomu:web-owner:v2:';

type Write = (key: string, value: unknown) => Promise<void>;

// Concurrent misses share one run; a later miss runs again and finds its key or an early stop.
let adoption: { readonly token: string; readonly done: Promise<void> } | undefined;

/** A website record an installed Reader may still adopt for this key. */
export function websiteOnlyValuePresent(key: string, epoch: ManagedStateEpoch): boolean {
    return isHostedYomuOrigin() && isWebsiteStoreKey(key) && localMirrorBelongsToEpoch(key, epoch);
}

/** Adopt the Website-only Store into a fresh installed store. */
export function adoptWebsiteOnlyStore(getValue: GmGetValue, epoch: ManagedStateEpoch, write: Write): Promise<void> {
    const token = managedStateEpochToken(epoch);
    if (adoption?.token === token) return adoption.done;
    const done = runAdoption(getValue, epoch, write).finally(() => {
        if (adoption?.done === done) adoption = undefined;
    });
    adoption = { token, done };
    return done;
}

async function runAdoption(getValue: GmGetValue, epoch: ManagedStateEpoch, write: Write): Promise<void> {
    if (!isHostedYomuOrigin()) return;
    const installed = await readManagedGmValue<unknown>(getValue, SETTINGS_KEY, epoch);
    const ledger = await readManagedGmValue<unknown>(getValue, INTENT_LEDGER_KEY, epoch);
    if (installed.kind === 'found' && !saysNoTargetChosen(installed.value) && recordsChoices(ledger)) return;
    const settingsUnitAbsent = installed.kind === 'missing' && ledger.kind === 'missing';
    for (const key of websiteOnlyKeys(epoch)) {
        if (isSettingsAuthorityStorageKey(key) && !settingsUnitAbsent) continue;
        if ((await readManagedGmValue<unknown>(getValue, key, epoch)).kind !== 'missing') continue;
        const value = localStorageGet<unknown>(key, MISSING);
        if (!isMissingSentinel(value)) await write(key, adoptedValue(key, value));
    }
}

function websiteOnlyKeys(epoch: ManagedStateEpoch): string[] {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key && websiteOnlyValuePresent(key, epoch)) keys.push(key);
    }
    const rank = (key: string) => LAST_KEYS.indexOf(key);
    return keys.sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
}

function isWebsiteStoreKey(key: string): boolean {
    return isManagedStorageBackupKey(key)
        && !key.startsWith(OWNER_NAMESPACE_PREFIX)
        && !(RETIRED_SETTINGS_STORAGE_KEYS as readonly string[]).includes(key)
        && managedStateEntries().some(entry => entry.kind === 'gm'
            && (entry.key === key || (entry.prefix !== undefined && key.startsWith(entry.prefix))));
}

/** v1.9.3's promotion value: the website's own demo policy and write coordination stay behind. */
function adoptedValue(key: string, value: unknown): unknown {
    if (!isRecord(value)) return value;
    const record = withoutFields(value, COORDINATION_FIELDS);
    if (key === SETTINGS_KEY) return withoutFields(record, [HOSTED_PATCH_FIELD, ...HOSTED_LOCAL_SETTINGS_KEYS]);
    if (key === INTENT_LEDGER_KEY && isRecord(record.records)) {
        return { ...record, records: withoutFields(record.records, HOSTED_LOCAL_SETTINGS_KEYS) };
    }
    return record;
}

function withoutFields(record: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
    const copy = { ...record };
    for (const field of fields) delete copy[field];
    return copy;
}

// Builds before 2.1 stamped an untouched install `learningTargetChosen: false`.
function saysNoTargetChosen(settings: unknown): boolean {
    return isRecord(settings) && settings.learningTargetChosen === false;
}

// A learner who changed any setting has an intent record; a fresh install has none.
function recordsChoices(ledger: { kind: string; value?: unknown }): boolean {
    if (ledger.kind !== 'found' || !isRecord(ledger.value)) return false;
    const records = ledger.value.records;
    return isRecord(records) && Object.keys(records).length > 0;
}
