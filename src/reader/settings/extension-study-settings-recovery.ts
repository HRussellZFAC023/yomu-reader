import type { ReaderSettings } from '../app/types';
import {
    gmStorageGetSharedStrict,
    gmStorageSet,
    rawExtensionStorageGetValue,
    withGmStorageLease,
} from '../app/storage';
import {
    authoritativeManagedStateEpoch,
    managedGmValue,
    type GmGetValue,
} from '../app/managed-read-path';
import {
    managedStateEpochToken,
    sameManagedStateEpoch,
    type ManagedStateEpoch,
} from '../app/managed-state-epoch';
import {
    applySettingsIntent,
    type SettingsIntentLedger,
    type SettingsIntentRecord,
} from './intent-ledger';
import { normalizeLearningTargetChosen } from './learning-target-choice';
import {
    persistSettingsStorageTransaction,
    readSettingsPersistenceView,
    readSettingsPersistenceViewFrom,
    SETTINGS_PERSISTENCE_STORAGE_LEASE,
    SETTINGS_STORAGE_KEY,
    type SettingsPersistenceView,
} from './settings-persistence-transaction';

export type ExtensionStudySettingsRecovery =
    | 'not-packaged-study'
    | 'no-legacy-settings'
    | 'canonical-preserved'
    | 'legacy-promoted';

const EXTENSION_STUDY_LEGACY_PROMOTION_STORAGE_KEY =
    'yomu:extension-study-legacy-promotion:v1';

interface ExtensionStudyLegacyPromotionMarker {
    readonly version: 1;
    readonly rawEpoch: string;
}

const LEGACY_PROMOTION_ACTIVATION_KEYS = [
    'learningTargetChosen',
    'onboardingSeen',
] as const satisfies readonly (keyof ReaderSettings)[];

/**
 * Secret-free startup boundary. Callers only need to know whether continuing
 * toward fresh-install defaults could hide an already chosen raw record.
 */
export class ExtensionStudySettingsRecoveryFailure extends Error {
    readonly rawChosenSettingsDetected: boolean;

    constructor(rawChosenSettingsDetected: boolean) {
        super('Packaged Study settings recovery could not complete.');
        this.name = 'ExtensionStudySettingsRecoveryFailure';
        this.rawChosenSettingsDetected = rawChosenSettingsDetected;
    }
}

export function isExtensionStudySettingsRecoveryFailure(
    error: unknown,
): error is ExtensionStudySettingsRecoveryFailure {
    return error instanceof ExtensionStudySettingsRecoveryFailure;
}

/**
 * Affected packaged Study builds wrote unprefixed browser.storage.local while
 * ordinary pages used the compiler-prefixed GM authority. Prefer an existing
 * chosen canonical record; otherwise merge declared choices by sequence before
 * promoting the stranded record. The losing bytes are retained for recovery.
 */
export async function recoverExtensionStudySettingsAuthority(): Promise<ExtensionStudySettingsRecovery> {
    if (!isPackagedExtensionStudy()) return 'not-packaged-study';
    let rawGetValue: GmGetValue;
    try {
        rawGetValue = packagedStudyRawGetValue();
    } catch {
        throw new ExtensionStudySettingsRecoveryFailure(false);
    }
    return recoverRawSettingsAuthority(rawGetValue);
}

async function recoverRawSettingsAuthority(rawGetValue: GmGetValue): Promise<ExtensionStudySettingsRecovery> {
    const evidence = { rawChosenSettingsDetected: false };
    try {
        const rawEpoch = await authoritativeManagedStateEpoch(rawGetValue);
        const raw = await rawSettingsPersistenceView(rawGetValue, rawEpoch, value => {
            evidence.rawChosenSettingsDetected ||= normalizeLearningTargetChosen(settingsRecord(value));
        });
        const rawSettings = settingsRecord(raw.settings);
        if (!rawSettings) {
            if (evidence.rawChosenSettingsDetected) {
                throw new ExtensionStudySettingsRecoveryFailure(true);
            }
            return 'no-legacy-settings';
        }
        return promoteRawSettingsUnderLease(rawSettings, rawEpoch, raw);
    } catch {
        // Never attach the storage error as `cause`: extension adapters and
        // browser failures are not a trusted, secret-free logging surface.
        throw new ExtensionStudySettingsRecoveryFailure(evidence.rawChosenSettingsDetected);
    }
}

async function promoteRawSettingsUnderLease(
    rawSettings: Partial<ReaderSettings>,
    rawEpoch: ManagedStateEpoch,
    raw: SettingsPersistenceView,
): Promise<ExtensionStudySettingsRecovery> {
    return withGmStorageLease(
        SETTINGS_PERSISTENCE_STORAGE_LEASE,
        () => reconcileRawSettingsAuthority(rawSettings, rawEpoch, raw),
    );
}

async function reconcileRawSettingsAuthority(
    rawSettings: Partial<ReaderSettings>,
    rawEpoch: ManagedStateEpoch,
    raw: SettingsPersistenceView,
): Promise<ExtensionStudySettingsRecovery> {
    // Re-read the canonical pair only after acquiring the same lease used by
    // normal saves/imports. A website may have completed setup while Study was
    // inspecting the stranded namespace; that newer authority must win.
    const canonicalEpoch = await authoritativeManagedStateEpoch(GM_getValue as GmGetValue);
    const canonical = await readSettingsPersistenceView();
    const canonicalSettings = settingsRecord(canonical.settings);
    if (canonicalEpochRejectsRaw(rawEpoch, canonicalEpoch)) {
        return 'canonical-preserved';
    }
    if (await legacyPromotionAlreadyRecorded(rawEpoch)) {
        return 'canonical-preserved';
    }
    if (!shouldPromoteRawSettings(rawSettings, rawEpoch, canonicalSettings, canonicalEpoch)) {
        return 'canonical-preserved';
    }
    const merged = mergedLegacySettingsAuthority(rawSettings, raw.intentLedger, canonicalSettings, canonical.intentLedger);
    await persistSettingsStorageTransaction(merged.intentLedger, merged.settings);
    await recordLegacyPromotion(rawEpoch);
    return 'legacy-promoted';
}

async function legacyPromotionAlreadyRecorded(rawEpoch: ManagedStateEpoch): Promise<boolean> {
    const marker = await gmStorageGetSharedStrict<unknown>(EXTENSION_STUDY_LEGACY_PROMOTION_STORAGE_KEY, null);
    return isLegacyPromotionMarker(marker) && marker.rawEpoch === managedStateEpochToken(rawEpoch);
}

async function recordLegacyPromotion(rawEpoch: ManagedStateEpoch): Promise<void> {
    const marker: ExtensionStudyLegacyPromotionMarker = {
        version: 1,
        rawEpoch: managedStateEpochToken(rawEpoch),
    };
    await gmStorageSet(EXTENSION_STUDY_LEGACY_PROMOTION_STORAGE_KEY, marker, {
        localFallbackOnAuthoritativeFailure: 'preserve',
    });
}

function isLegacyPromotionMarker(value: unknown): value is ExtensionStudyLegacyPromotionMarker {
    const marker = settingsRecord(value) as Record<string, unknown> | null;
    if (!marker) return false;
    return marker.version === 1 && typeof marker.rawEpoch === 'string';
}

function mergedLegacySettingsAuthority(
    rawSettings: Partial<ReaderSettings>,
    rawIntent: SettingsIntentLedger,
    canonicalSettings: Partial<ReaderSettings> | null,
    canonicalIntent: SettingsIntentLedger,
): { settings: Partial<ReaderSettings>; intentLedger: SettingsIntentLedger } {
    if (!canonicalSettings) {
        return { settings: rawSettings, intentLedger: rawIntent };
    }
    const intentLedger = mergedIntentLedger(rawIntent, canonicalIntent);
    const settings = { ...rawSettings } as Record<string, unknown>;
    for (const [key, value] of Object.entries(canonicalSettings)) {
        if (canonicalSettingsValueWins(key, rawIntent, canonicalIntent)) settings[key] = value;
    }
    preserveRawPromotionActivation(settings, rawSettings, rawIntent, canonicalIntent);
    return {
        settings: applySettingsIntent(settings as Partial<ReaderSettings>, intentLedger),
        intentLedger,
    };
}

function mergedIntentLedger(
    raw: SettingsIntentLedger,
    canonical: SettingsIntentLedger,
): SettingsIntentLedger {
    const records: Record<string, SettingsIntentRecord> = {};
    const keys = new Set([...Object.keys(raw.records), ...Object.keys(canonical.records)]);
    for (const key of keys) {
        const rawRecord = raw.records[key];
        const canonicalRecord = canonical.records[key];
        const selected = newerIntentRecord(rawRecord, canonicalRecord);
        if (selected) records[key] = selected;
    }
    return {
        revision: Math.max(raw.revision, canonical.revision),
        records,
    };
}

function canonicalSettingsValueWins(
    key: string,
    raw: SettingsIntentLedger,
    canonical: SettingsIntentLedger,
): boolean {
    const rawRecord = raw.records[key];
    const canonicalRecord = canonical.records[key];
    return !rawRecord || Boolean(canonicalRecord && canonicalRecord.seq >= rawRecord.seq);
}

function preserveRawPromotionActivation(
    settings: Record<string, unknown>,
    rawSettings: Partial<ReaderSettings>,
    rawIntent: SettingsIntentLedger,
    canonicalIntent: SettingsIntentLedger,
): void {
    const intentKeys = new Set([
        ...Object.keys(rawIntent.records),
        ...Object.keys(canonicalIntent.records),
    ]);
    for (const key of LEGACY_PROMOTION_ACTIVATION_KEYS) {
        if (intentKeys.has(key)) continue;
        if (Object.hasOwn(rawSettings, key)) settings[key] = rawSettings[key];
        else delete settings[key];
    }
}

function newerIntentRecord(
    raw: SettingsIntentRecord | undefined,
    canonical: SettingsIntentRecord | undefined,
): SettingsIntentRecord | undefined {
    if (!canonical) return raw;
    if (!raw || canonical.seq >= raw.seq) return canonical;
    return raw;
}

/** Read-only proof used after a recovery failure; it never loads or migrates defaults. */
export async function canonicalExtensionStudySettingsAreChosen(): Promise<boolean> {
    const canonical = await readSettingsPersistenceView();
    return normalizeLearningTargetChosen(settingsRecord(canonical.settings));
}

async function rawSettingsPersistenceView(
    rawGetValue: GmGetValue,
    epoch: ManagedStateEpoch,
    observeSettings: (value: unknown) => void,
): Promise<SettingsPersistenceView> {
    return readSettingsPersistenceViewFrom(async <T>(key: string, fallback: T) => {
        const value = await managedGmValue(rawGetValue, key, fallback, epoch);
        if (key === SETTINGS_STORAGE_KEY) observeSettings(value);
        return value;
    });
}

function shouldPromoteRawSettings(
    raw: Partial<ReaderSettings>,
    rawEpoch: ManagedStateEpoch,
    canonical: Partial<ReaderSettings> | null,
    canonicalEpoch: ManagedStateEpoch,
): boolean {
    // Epoch compatibility is checked before the one-shot marker so a reset can
    // never revive a stranded copy from an older or unrelated namespace.
    if (canonicalEpochRejectsRaw(rawEpoch, canonicalEpoch)) return false;
    return canonicalChoiceAllowsPromotion(raw, canonical);
}

function canonicalEpochRejectsRaw(
    rawEpoch: ManagedStateEpoch,
    canonicalEpoch: ManagedStateEpoch,
): boolean {
    if (canonicalEpoch.generation === 0) return false;
    return !sameManagedStateEpoch(rawEpoch, canonicalEpoch);
}

function canonicalChoiceAllowsPromotion(
    raw: Partial<ReaderSettings>,
    canonical: Partial<ReaderSettings> | null,
): boolean {
    if (!canonical) return true;
    return normalizeLearningTargetChosen(raw) && !normalizeLearningTargetChosen(canonical);
}

function settingsRecord(value: unknown): Partial<ReaderSettings> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Partial<ReaderSettings>
        : null;
}

function isPackagedExtensionStudy(): boolean {
    return /^(?:chrome|moz|safari-web)-extension:$/.test(location.protocol);
}

function packagedExtensionStudyHasCompilerStorage(): boolean {
    if (typeof GM_getValue !== 'function' || typeof GM_setValue !== 'function') return false;
    return (globalThis as { __YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__?: unknown })
        .__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__ === true;
}

function packagedStudyRawGetValue(): GmGetValue {
    if (!packagedExtensionStudyHasCompilerStorage()) {
        throw new Error('Packaged Study storage adapter is unavailable.');
    }
    const rawGetValue = rawExtensionStorageGetValue();
    if (!rawGetValue) throw new Error('Packaged Study legacy storage inspection is unavailable.');
    return rawGetValue;
}
