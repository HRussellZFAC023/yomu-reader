import { vi } from 'vitest';

import type { ReaderSettings } from '../../../src/reader/app/types';
import {
    DEFAULT_SETTINGS,
    saveSettings,
    SETTINGS_STORAGE_KEY,
} from '../../../src/reader/settings';
import { serializeSettingsPersistencePair } from '../../../src/reader/settings/settings-persistence-transaction';

export const HOSTED_STUDY_LOCATION = {
    href: 'https://yomureader.com/study/',
    hostname: 'yomureader.com',
    pathname: '/study/',
    origin: 'https://yomureader.com',
};

type ValueClone = <T>(value: T) => T;
type StorageHook = (key: string, value: unknown) => void | Promise<void>;

export interface GmStorageFixtureOptions {
    readonly clone?: ValueClone;
    readonly beforeSet?: StorageHook;
    readonly beforeDelete?: (key: string) => void | Promise<void>;
}

export function installGmStorageFixture(
    values: Map<string, unknown> = new Map(),
    options: GmStorageFixtureOptions = {},
) {
    const clone = options.clone ?? structuredCloneValue;
    const beforeSet = options.beforeSet ?? noStorageHook;
    const beforeDelete = options.beforeDelete ?? noDeleteHook;
    const writes: unknown[] = [];
    const getValue = vi.fn((key: string, fallback: unknown) => (
        Promise.resolve(readStoredValue(values, key, fallback, clone))
    ));
    const setValue = vi.fn(async (key: string, value: unknown) => {
        await beforeSet(key, value);
        const stored = clone(value);
        writes.push(stored);
        values.set(key, stored);
    });
    const deleteValue = vi.fn(async (key: string) => {
        await beforeDelete(key);
        values.delete(key);
    });
    vi.stubGlobal('GM_getValue', getValue);
    vi.stubGlobal('GM_setValue', setValue);
    vi.stubGlobal('GM_deleteValue', deleteValue);
    return { values, writes, getValue, setValue, deleteValue };
}

export type GmStorageFixture = ReturnType<typeof installGmStorageFixture>;

export function jsonClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

export function installSizeLimitedGmStorage(
    values: Map<string, unknown>,
    maxSerializedBytes: number,
): GmStorageFixture {
    return installGmStorageFixture(values, {
        clone: jsonClone,
        beforeSet: (_key, value) => rejectOversizedValue(value, maxSerializedBytes),
    });
}

export function installRejectedOptionsCommit(
    clone: ValueClone = structuredCloneValue,
): {
    previousSettings: ReaderSettings;
    previousPair: Record<string, unknown>;
    store: Map<string, unknown>;
    storage: GmStorageFixture;
} {
    const previousSettings = {
        ...DEFAULT_SETTINGS,
        enableLogging: false,
        autoMineOnReview: false,
    };
    const previousPair = serializeSettingsPersistencePair(previousSettings, { revision: 0, records: {} });
    const values = new Map<string, unknown>(Object.entries(previousPair));
    const storage = installGmStorageFixture(values, {
        clone,
        beforeSet: rejectChosenSettingsCommit,
    });
    return { previousSettings, previousPair, store: values, storage };
}

export function saveExplicitOptions(previousSettings: ReaderSettings): Promise<void> {
    return saveSettings({
        ...previousSettings,
        enableLogging: true,
        autoMineOnReview: true,
    }, {
        explicitUserChoiceKeys: ['enableLogging', 'autoMineOnReview'],
    });
}

function readStoredValue(
    values: Map<string, unknown>,
    key: string,
    fallback: unknown,
    clone: ValueClone,
): unknown {
    const stored = values.has(key) ? values.get(key) : fallback;
    return clone(stored);
}

function rejectOversizedValue(value: unknown, maxSerializedBytes: number): void {
    if (JSON.stringify(value).length > maxSerializedBytes) throw new Error('quota exceeded');
}

function rejectChosenSettingsCommit(key: string, value: unknown): void {
    if (!isChosenSettingsCommit(key, value)) return;
    throw new Error('settings blob rejected');
}

function isChosenSettingsCommit(key: string, value: unknown): boolean {
    if (key !== SETTINGS_STORAGE_KEY) return false;
    return (value as { enableLogging?: unknown }).enableLogging === true;
}

function structuredCloneValue<T>(value: T): T {
    return structuredClone(value);
}

function noStorageHook(_key: string, _value: unknown): void {}

function noDeleteHook(_key: string): void {}
