import { HOSTED_LOCAL_SETTINGS_KEYS } from '../app/hosted-demo-settings';
import type { ReaderSettings } from '../app/types';

/**
 * How settings from more than one store are reconciled, and how a deliberate
 * choice is told apart from an untouched default.
 *
 * That distinction is the whole difficulty. Yomu persists the WHOLE settings
 * object, so the presence of a key proves nothing — every stored blob has all of
 * them. The only available signal for "this field is a gap" is that it equals its
 * default, and a field the learner deliberately CLEARED also equals its default.
 * Treating the two as the same let a donor store replay the old value and
 * re-persist it, so a cleared hover-lookup hotkey came back seconds after saving
 * and again after an update (GitHub #36).
 *
 * The fix is `settledKeys`: keys the learner has expressed a choice about, taken
 * from what the settings dialog declares it changed. A key in that set is never a
 * gap, however much it looks like one.
 *
 * Pure and dependency-free on purpose — `DEFAULT_SETTINGS` is passed in rather
 * than imported, because it lives in settings/index.ts and importing it here
 * would close an import cycle.
 */

function settingsValueEquals(left: unknown, right: unknown): boolean {
    return left === right || JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Every key a settings edit changed, as measured by the surface that made the edit.
 * Both arguments are normalized settings, so either one carries the full key set.
 */
export function changedSettingsKeys(previous: ReaderSettings, next: ReaderSettings): Array<keyof ReaderSettings> {
    return (Object.keys(previous) as Array<keyof ReaderSettings>)
        .filter(key => !settingsValueEquals(previous[key], next[key]));
}

/**
 * Fills gaps from an older storage key. `settledKeys` grows as fields are
 * recovered, so the first donor wins.
 */
export function recoverLegacySettings(
    current: ReaderSettings,
    legacy: ReaderSettings,
    settledKeys: Set<string>,
    defaults: ReaderSettings,
): { settings: ReaderSettings; changed: boolean } {
    return recoverInto(current, legacy, settledKeys, defaults, () => false);
}

/** The same fold for the hosted-origin localStorage mirror. */
export function recoverStrandedHostedSettings(
    current: ReaderSettings,
    stranded: ReaderSettings,
    settledKeys: Set<string>,
    defaults: ReaderSettings,
): { settings: ReaderSettings; changed: boolean } {
    // The docs site force-enables demo-player settings in its localStorage copy;
    // those writes are not user intent and must never replicate.
    return recoverInto(
        current,
        stranded,
        settledKeys,
        defaults,
        key => HOSTED_LOCAL_SETTINGS_KEYS.includes(key as typeof HOSTED_LOCAL_SETTINGS_KEYS[number]),
    );
}

function recoverInto(
    current: ReaderSettings,
    donor: ReaderSettings,
    settledKeys: Set<string>,
    defaults: ReaderSettings,
    excluded: (key: string) => boolean,
): { settings: ReaderSettings; changed: boolean } {
    let settings = current;
    let changed = false;

    for (const key of Object.keys(defaults) as Array<keyof ReaderSettings>) {
        if (excluded(key)) continue;
        if (settledKeys.has(key)) continue;
        if (!settingsValueEquals(settings[key], defaults[key])) continue;
        if (settingsValueEquals(donor[key], defaults[key])) continue;

        settings = { ...settings, [key]: donor[key] };
        settledKeys.add(key);
        changed = true;
    }

    return { settings, changed };
}
