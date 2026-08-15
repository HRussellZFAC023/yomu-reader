import type { ReaderSettings } from '../app/types';
import { SETTINGS_CHANGE_EVENT } from '../app/constants';
import { createWindowCustomEvent, dispatchWindowEvent } from '../platform/window-events';
import { isHostedYomuOrigin } from '../app/storage';
import { Logger } from '../app/logger';

export interface SettingsChangeDetail {
    readonly settings: Partial<ReaderSettings>;
    readonly preview?: boolean;
    readonly remote?: boolean;
}

type SettingsChangeListener = (detail: SettingsChangeDetail) => void;

interface SettingsChangeBus {
    readonly listeners: Set<SettingsChangeListener>;
}

const SETTINGS_CHANGE_BUS_SLOT = Symbol.for('yomu.private-settings-change-bus.v1');
const log = Logger.scope('SettingsChangeBus');
const HOSTED_PUBLIC_SETTINGS_KEYS = [
    'theme',
    'accentColor',
    'interfaceLanguage',
    'furiganaMode',
    'showFurigana',
    'hideKnownFurigana',
    'showPitchAccent',
    'parserProvider',
    'dictionaryPreferences',
] as const satisfies readonly (keyof ReaderSettings)[];

type SettingsBusRealm = typeof globalThis & { [key: symbol]: unknown };

/** Publish full settings only inside the extension/userscript sandbox. */
export function publishSettingsChange(detail: SettingsChangeDetail): void {
    for (const listener of privateSettingsChangeBus().listeners) {
        try {
            listener(detail);
        } catch (error) {
            // Persistence already committed before this notification is sent.
            // One faulty consumer must not turn that durable success into a
            // rejected save or prevent the remaining realms from reconciling.
            log.warn('Private settings change listener failed', error);
        }
    }
    publishPublicSettingsProjection(detail);
}

export function subscribeToSettingsChanges(
    listener: SettingsChangeListener,
    signal?: AbortSignal,
): () => void {
    if (signal?.aborted) return () => undefined;
    const listeners = privateSettingsChangeBus().listeners;
    listeners.add(listener);
    const unsubscribe = (): void => { listeners.delete(listener); };
    signal?.addEventListener('abort', unsubscribe, { once: true });
    return unsubscribe;
}

function privateSettingsChangeBus(): SettingsChangeBus {
    const realm = globalThis as SettingsBusRealm;
    const existing = realm[SETTINGS_CHANGE_BUS_SLOT];
    if (isSettingsChangeBus(existing)) return existing;
    const bus: SettingsChangeBus = { listeners: new Set() };
    Object.defineProperty(realm, SETTINGS_CHANGE_BUS_SLOT, {
        configurable: true,
        enumerable: false,
        value: bus,
        writable: false,
    });
    return bus;
}

function isSettingsChangeBus(value: unknown): value is SettingsChangeBus {
    return Boolean(value && typeof value === 'object' && (value as SettingsChangeBus).listeners instanceof Set);
}

function publishPublicSettingsProjection(detail: SettingsChangeDetail): void {
    const settings = publicSettingsProjection(detail.settings);
    try {
        dispatchWindowEvent(createWindowCustomEvent(SETTINGS_CHANGE_EVENT, {
            preview: detail.preview === true,
            remote: detail.remote === true,
            settings,
        }));
    } catch {
        // Some test shims do not expose CustomEvent; the private delivery is authoritative.
    }
}

function publicSettingsProjection(settings: Partial<ReaderSettings>): Partial<ReaderSettings> {
    const projection: Partial<ReaderSettings> = {};
    if (!isHostedYomuOrigin()) return projection;
    for (const key of HOSTED_PUBLIC_SETTINGS_KEYS) {
        if (Object.hasOwn(settings, key)) Object.assign(projection, { [key]: settings[key] });
    }
    return projection;
}
