import type { ReaderSettings } from '../app/types';
import { readFormSettings } from './form';
import { isCloudSettingsAction, type CloudSettingsAction } from './cloud-settings-resume';

export function cloudSettingsActionEnabled(enabled: boolean, action: string): action is CloudSettingsAction {
    return enabled && isCloudSettingsAction(action);
}

export function settingsForCloudAction(
    action: CloudSettingsAction,
    form: HTMLFormElement,
    settings: ReaderSettings,
): ReaderSettings {
    if (action === 'sync-cloud-settings') return readFormSettings(new FormData(form), settings);
    return settings;
}

export function setCloudSettingsActionButtonDisabled(
    button: HTMLButtonElement | null,
    disabled: boolean,
): void {
    if (disabled) button?.setAttribute('disabled', 'true');
    else button?.removeAttribute('disabled');
}

export function notifyCloudSettingsPersistenceFailed(
    callback: ((previousSettings: ReaderSettings) => void) | undefined,
    previousSettings: ReaderSettings,
): void {
    callback?.(previousSettings);
}

export function reportCloudSettingsStatus(
    setStatus: ((message: string) => void) | undefined,
    message: string,
): void {
    setStatus?.(message);
}
