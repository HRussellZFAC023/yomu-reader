import type { ReaderSettings } from '../app/types';
import { hasOwn } from './values';

/**
 * Which settings value is authoritative when two writers disagree.
 *
 * Yomu persists the WHOLE settings object from every surface, so a save carries
 * 265 fields whether or not the learner touched them. The three shipped attempts
 * at telling a choice from a carried-along default all inferred intent from
 * VALUES -- "differs from the default", "differs from the stored record" -- and
 * all three reverted a real choice (1.8.22, 1.8.59, 1.8.77). The reverts looked
 * like a save failure but were not: the write reached storage with the stale
 * value already substituted in, while the dialog kept rendering from memory, so
 * the learner saw their choice "saved" until the next reload.
 *
 * A value can never carry that information. Only the surface that owns the
 * control knows a human moved it, so intent is DECLARED, per key, at write time,
 * and recorded here with a monotonically increasing sequence number:
 *
 *   - a DECLARED write always supersedes an older recorded value;
 *   - an UNDECLARED write of a recorded key is a carried-along default and is
 *     replaced by the recorded value before the blob is stored;
 *   - a key nobody ever declared is not in the ledger at all, so ordinary
 *     writes stay ordinary. This is why the ledger cannot be replaced by
 *     "protect every key": that would freeze all 265 fields against the very
 *     save carrying the learner's next edit.
 *
 * `seq` is what makes the two rules composable: it orders records across keys
 * and contexts, so "newest declared write wins" is a fact about the ledger
 * rather than about which storage write happened to land last.
 *
 * Pure and dependency-free on purpose: it must be usable from the storage lease
 * in settings/index.ts without closing an import cycle.
 */

export const SETTINGS_INTENT_LEDGER_STORAGE_KEY = 'yomu:settings-intent:v2';

/**
 * `value` is present only for a scalar preference.
 *
 * A record with no value still says "the learner decided about this key", which
 * is what legacy recovery needs to stop treating the field as a gap (GitHub
 * #36: a cleared hover-lookup hotkey came back from an older storage key). What
 * it deliberately does NOT do is substitute the value back on a later write:
 * `dictionaryPreferences`, `shortcuts` and `languageProfiles` are containers
 * that legitimate machine writes ADD to -- a newly imported dictionary, a
 * discovered profile -- and replacing the whole container would silently drop
 * those additions. Containers get their integrity from having ONE writer (their
 * editor) instead.
 */
export interface SettingsIntentRecord {
    readonly seq: number;
    readonly value?: unknown;
}

export interface SettingsIntentLedger {
    readonly revision: number;
    readonly records: Readonly<Record<string, SettingsIntentRecord>>;
}

export const EMPTY_SETTINGS_INTENT_LEDGER: SettingsIntentLedger = { revision: 0, records: {} };

/**
 * The declaration a write with no human behind it makes: normalization,
 * legacy recovery, auto-discovery, theme following the host page. Named rather
 * than an empty literal so `explicitUserChoiceKeys` being REQUIRED forces every
 * caller to state which kind of write it is, and so the machine writers are
 * greppable.
 */
export const NO_EXPLICIT_USER_CHOICE: readonly (keyof ReaderSettings)[] = [];

const CHOSEN_SUFFIX = 'Chosen';

/**
 * A `*Chosen` flag and the value it qualifies are one preference.
 *
 * Derived from the key name rather than listed, because a hand-maintained pair
 * list is one more place to forget: `subtitleSecondaryVisibleChosen` says
 * "the learner decided about `subtitleSecondaryVisible`", and recording the
 * flag while leaving the value unrecorded lets a stale writer keep the flag and
 * replace the value underneath it.
 */
export function coupledIntentKeys(
    keys: readonly (keyof ReaderSettings)[],
    known: (key: string) => boolean,
): Array<keyof ReaderSettings> {
    const expanded = new Set<keyof ReaderSettings>(keys);
    for (const key of keys) {
        const sibling = key.endsWith(CHOSEN_SUFFIX) ? key.slice(0, -CHOSEN_SUFFIX.length) : `${key}${CHOSEN_SUFFIX}`;
        if (known(sibling)) expanded.add(sibling as keyof ReaderSettings);
    }
    return [...expanded];
}

/**
 * The stored ledger, plus any 1.8.22-era flat pin store folded in.
 *
 * The old store was a bare `key -> value` map with no ordering, so its entries
 * enter at sequence 0: every later declaration outranks them, and an install
 * upgrading mid-session keeps the choices it had already made.
 */
export function settingsIntentLedgerFromStorage(stored: unknown, legacyPins: unknown): SettingsIntentLedger {
    const fromLegacy = ledgerFromLegacyPins(legacyPins);
    const fromStored = parseSettingsIntentLedger(stored);
    if (!fromStored) return fromLegacy;
    return {
        revision: Math.max(fromStored.revision, fromLegacy.revision),
        records: { ...fromLegacy.records, ...fromStored.records },
    };
}

function parseSettingsIntentLedger(value: unknown): SettingsIntentLedger | null {
    const record = objectRecord(value);
    if (!record) return null;
    const records = objectRecord(record.records);
    if (!records) return null;
    const parsed: Record<string, SettingsIntentRecord> = {};
    let highest = 0;
    for (const [key, entry] of Object.entries(records)) {
        const item = objectRecord(entry);
        if (!item) continue;
        const seq = typeof item.seq === 'number' && Number.isFinite(item.seq) ? item.seq : 0;
        parsed[key] = hasOwn(item, 'value') ? { seq, value: item.value } : { seq };
        highest = Math.max(highest, seq);
    }
    const revision = typeof record.revision === 'number' && Number.isFinite(record.revision) ? record.revision : 0;
    return { revision: Math.max(revision, highest), records: parsed };
}

function ledgerFromLegacyPins(value: unknown): SettingsIntentLedger {
    const record = objectRecord(value);
    if (!record) return EMPTY_SETTINGS_INTENT_LEDGER;
    const records: Record<string, SettingsIntentRecord> = {};
    for (const [key, pinned] of Object.entries(record)) records[key] = { seq: 0, value: pinned };
    return { revision: 0, records };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Records a declared choice per key. The newest declaration wins by sequence. */
export function recordSettingsIntent(
    ledger: SettingsIntentLedger,
    keys: readonly (keyof ReaderSettings)[],
    settings: Partial<ReaderSettings>,
): SettingsIntentLedger {
    if (!keys.length) return ledger;
    const records = { ...ledger.records };
    let revision = ledger.revision;
    for (const key of keys) {
        if (!hasOwn(settings, key)) continue;
        const value = settings[key];
        records[key] = isSubstitutableSettingValue(value)
            ? { seq: ++revision, value }
            : { seq: ++revision };
    }
    return revision === ledger.revision ? ledger : { revision, records };
}

/**
 * Forgets a declared choice.
 *
 * A Reset control is not a choice about each field it touches, it is the
 * withdrawal of the choices made so far -- so it must clear the records rather
 * than record the defaults it just wrote, which would pin those defaults as
 * intent. The revision still advances, so a context holding an older ledger
 * cannot resurrect what was cleared.
 */
export function clearSettingsIntent(
    ledger: SettingsIntentLedger,
    keys: readonly (keyof ReaderSettings)[],
): SettingsIntentLedger {
    const cleared = keys.filter(key => hasOwn(ledger.records, key));
    if (!cleared.length) return ledger;
    const records = { ...ledger.records };
    for (const key of cleared) delete records[key];
    return { revision: ledger.revision + 1, records };
}

/**
 * Substitutes every recorded value into a settings object about to be stored.
 *
 * Declared keys were recorded first, so they carry the fresh value and this is a
 * no-op for them; undeclared keys are the carried-along defaults this exists to
 * replace.
 */
export function applySettingsIntent<T extends Partial<ReaderSettings>>(settings: T, ledger: SettingsIntentLedger): T {
    const keys = Object.keys(ledger.records);
    if (!keys.length) return settings;
    const next = { ...settings } as Record<string, unknown>;
    let changed = false;
    for (const key of keys) {
        const record = ledger.records[key]!;
        if (!hasOwn(record, 'value') || !hasOwn(next, key)) continue;
        if (sameSettingsValue(next[key], record.value)) continue;
        next[key] = record.value;
        changed = true;
    }
    return changed ? next as T : settings;
}

function isSubstitutableSettingValue(value: unknown): boolean {
    return value === null
        || value === undefined
        || typeof value === 'boolean'
        || typeof value === 'number'
        || typeof value === 'string';
}

/** Keys the learner has decided about, for the legacy-recovery gap test. */
export function settingsIntentKeys(ledger: SettingsIntentLedger): string[] {
    return Object.keys(ledger.records);
}

function sameSettingsValue(left: unknown, right: unknown): boolean {
    return left === right || JSON.stringify(left) === JSON.stringify(right);
}
