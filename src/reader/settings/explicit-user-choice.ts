import type { ReaderSettings } from '../app/types';
import { settingsValueEquals } from './store-reconciliation';

export const AUTOMATION_PROTECTED_SETTINGS_KEYS = [
    'annotationsPaused',
    'manualScanEnabled',
    'showFurigana',
    'furiganaMode',
    'puckFuriganaModeBeforeHide',
    'ocrEnabled',
    'ocrAutoScanImages',
    'youtubeImmersionEnabled',
    'youtubeImmersionEnabledChosen',
    'youtubeShowChannelRecommendations',
    'youtubeShowChannelRecommendationsChosen',
    'subtitleOverlayVisible',
    'subtitleSecondaryVisible',
    'subtitleOverlayVisibleChosen',
    'subtitleSecondaryVisibleChosen',
] as const satisfies readonly (keyof ReaderSettings)[];

export type AutomationProtectedSettingsKey = typeof AUTOMATION_PROTECTED_SETTINGS_KEYS[number];

const COUPLED_EXPLICIT_USER_CHOICE_KEYS = [
    ['youtubeImmersionEnabled', 'youtubeImmersionEnabledChosen'],
    ['youtubeShowChannelRecommendations', 'youtubeShowChannelRecommendationsChosen'],
    ['subtitleOverlayVisible', 'subtitleOverlayVisibleChosen'],
    ['subtitleSecondaryVisible', 'subtitleSecondaryVisibleChosen'],
] as const satisfies readonly (readonly AutomationProtectedSettingsKey[])[];

/**
 * A `*Chosen` flag and the value it protects form one durable preference.
 * Persist both when either changes; otherwise a stale whole-settings writer
 * can keep the explicit flag while replacing the value underneath it.
 */
export function coupledExplicitUserChoiceKeys(
    keys: readonly (keyof ReaderSettings)[],
): Array<keyof ReaderSettings> {
    const expanded = new Set<keyof ReaderSettings>(keys);
    for (const pair of COUPLED_EXPLICIT_USER_CHOICE_KEYS) {
        if (!pair.some(key => expanded.has(key))) continue;
        pair.forEach(key => expanded.add(key));
    }
    return [...expanded];
}

export function changedAutomationProtectedSettingsKeys(
    previous: ReaderSettings,
    next: ReaderSettings,
): AutomationProtectedSettingsKey[] {
    return coupledExplicitUserChoiceKeys(
        AUTOMATION_PROTECTED_SETTINGS_KEYS.filter(key => !settingsValueEquals(previous[key], next[key])),
    ) as AutomationProtectedSettingsKey[];
}
