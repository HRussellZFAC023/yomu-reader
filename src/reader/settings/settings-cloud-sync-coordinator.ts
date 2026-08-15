import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import type { SaveSettingsOptions } from './index';
import {
    CLOUD_SETTINGS_SYNC_ENABLED,
    cloudSettingsSyncAvailable,
    downloadCloudSettingsFromCloud,
    uploadCloudSettingsToCloud,
} from './cloud-sync';
import type { CloudSettingsAction } from './cloud-settings-resume';
import {
    cloudSettingsRedirectHandoffRequired,
    createCloudSettingsAuthorization,
    type CloudSettingsAuthorization,
} from './cloud-settings-auth-state';
import {
    clearCloudSettingsRedirectHandoff,
    rememberCloudSettingsRedirectHandoff,
} from './cloud-settings-pending-action';
import {
    cloudSettingsActionEnabled,
    notifyCloudSettingsPersistenceFailed,
    reportCloudSettingsStatus,
    setCloudSettingsActionButtonDisabled,
    settingsForCloudAction,
} from './cloud-settings-dialog-action';
import { normalizeReaderSettings } from './index';
import {
    runSettingsRestoreTransaction,
    settingsRestoreSaveOptions,
    witnessedSettingsRestoreCandidate,
} from './settings-restore-transaction';
import type { SettingsRestoreCoordinator } from './settings-restore-coordinator';

type SettingsStatusSetter = (message: string) => void;
type SettingsEffect = () => void | Promise<void>;

interface SettingsCloudSyncPort {
    readonly settings: () => ReaderSettings;
    readonly stableSettings: () => ReaderSettings;
    readonly setSettings: (settings: ReaderSettings) => void;
    readonly saveCurrentSettings: (previous: ReaderSettings) => Promise<void>;
    readonly persistSettings: (settings: ReaderSettings, options: SaveSettingsOptions) => Promise<void>;
    readonly adoptSettings: (settings: ReaderSettings) => void;
    readonly onSettingsPersistenceFailed?: (settings: ReaderSettings) => void;
    readonly toast: (message: string) => void;
    readonly currentForm: () => HTMLFormElement | undefined;
    readonly restore: SettingsRestoreCoordinator;
    readonly runPostCommitEffect: (label: string, effect: SettingsEffect) => void;
    readonly applyRestoreEffects: () => void;
}

export class SettingsCloudSyncCoordinator {
    constructor(private readonly port: SettingsCloudSyncPort) {}

    async handle(
        form: HTMLFormElement,
        action: string,
        button: HTMLButtonElement | null,
        setStatus: SettingsStatusSetter,
        language: InterfaceLanguage,
    ): Promise<boolean> {
        if (!cloudSettingsActionEnabled(CLOUD_SETTINGS_SYNC_ENABLED, action)) return false;
        if (this.port.restore.importBlocked(form)) return true;
        if (!cloudSettingsSyncAvailable()) return reportUnavailable(setStatus, language);
        return this.runAuthorizedAction(form, action, button, setStatus, language);
    }

    async perform(
        action: CloudSettingsAction,
        language: InterfaceLanguage,
        setStatus?: SettingsStatusSetter,
        previousSettings = this.port.settings(),
        authorization?: CloudSettingsAuthorization,
        restoreForm?: HTMLFormElement,
    ): Promise<void> {
        if (action === 'sync-cloud-settings') {
            await this.upload(previousSettings, authorization, setStatus, language);
            return;
        }
        await this.restore(authorization, setStatus, language, restoreForm);
    }

    private async runAuthorizedAction(
        form: HTMLFormElement,
        action: CloudSettingsAction,
        button: HTMLButtonElement | null,
        setStatus: SettingsStatusSetter,
        language: InterfaceLanguage,
    ): Promise<true> {
        setCloudSettingsActionButtonDisabled(button, true);
        const authorization = createCloudSettingsAuthorization();
        const redirectHandoff = cloudSettingsRedirectHandoffRequired();
        const restoreRevision = this.port.restore.importRevision;
        await rememberCloudSettingsRedirectHandoff(redirectHandoff, action, authorization);
        const previousSettings = this.port.stableSettings();
        try {
            if (!this.restoreRevisionIsCurrent(form, restoreRevision)) return true;
            this.port.setSettings(settingsForCloudAction(action, form, previousSettings));
            await this.perform(action, language, setStatus, previousSettings, authorization, form);
            return true;
        } catch (error) {
            this.restoreAfterFailedUpload(action, previousSettings);
            throw error;
        } finally {
            await clearCloudSettingsRedirectHandoff(redirectHandoff);
            this.finishButton(form, button);
        }
    }

    private restoreRevisionIsCurrent(form: HTMLFormElement, revision: number): boolean {
        if (!this.port.restore.importPending && this.port.restore.saveRevisionIsCurrent(revision)) return true;
        this.port.restore.showRestoreBlocked(form);
        return false;
    }

    private restoreAfterFailedUpload(action: CloudSettingsAction, previousSettings: ReaderSettings): void {
        if (action === 'restore-cloud-settings') return;
        this.port.setSettings(previousSettings);
        notifyCloudSettingsPersistenceFailed(this.port.onSettingsPersistenceFailed, previousSettings);
    }

    private finishButton(form: HTMLFormElement, button: HTMLButtonElement | null): void {
        if (this.port.restore.importPending) this.port.restore.sync(form);
        else setCloudSettingsActionButtonDisabled(button, false);
    }

    private async upload(
        previousSettings: ReaderSettings,
        authorization: CloudSettingsAuthorization | undefined,
        setStatus: SettingsStatusSetter | undefined,
        language: InterfaceLanguage,
    ): Promise<void> {
        if (this.port.restore.importPending) throw new Error('A settings restore is already running.');
        await this.port.saveCurrentSettings(previousSettings);
        const metadata = await uploadCloudSettingsToCloud(this.port.settings(), authorization);
        this.reportStatus(setStatus, cloudSettingsSyncedStatus(metadata.syncedAt, language));
    }

    private async restore(
        authorization: CloudSettingsAuthorization | undefined,
        setStatus: SettingsStatusSetter | undefined,
        language: InterfaceLanguage,
        restoreForm: HTMLFormElement | undefined,
    ): Promise<void> {
        const currentForm = this.port.currentForm();
        const interlockForm = restoreForm ?? (currentForm?.isConnected ? currentForm : undefined);
        await this.port.restore.runRestore(interlockForm, async () => {
            await this.restoreSnapshot(authorization, setStatus, language);
        });
    }

    private async restoreSnapshot(
        authorization: CloudSettingsAuthorization | undefined,
        setStatus: SettingsStatusSetter | undefined,
        language: InterfaceLanguage,
    ): Promise<void> {
        const settingsBeforeRestore = this.port.stableSettings();
        const snapshot = await downloadCloudSettingsFromCloud(authorization);
        if (!snapshot) {
            reportCloudSettingsStatus(setStatus, cloudSettingsNotFoundStatus(language));
            return;
        }
        let importedSettings = normalizeCloudSettings(snapshot.settings, settingsBeforeRestore);
        try {
            await runSettingsRestoreTransaction({
                storage: snapshot.storage,
                prepareSettings: importedView => {
                    importedSettings = witnessedSettingsRestoreCandidate(
                        settingsBeforeRestore,
                        importedSettings,
                        importedView,
                    );
                },
                publishSettings: importedView => this.port.persistSettings(
                    importedSettings,
                    settingsRestoreSaveOptions(settingsBeforeRestore, importedSettings, importedView),
                ),
            });
        } catch (error) {
            this.notifyRestorePersistenceFailure(settingsBeforeRestore);
            throw error;
        }
        this.port.adoptSettings(importedSettings);
        this.reportStatusAfterCommit(setStatus, cloudSettingsRestoredStatus(snapshot.syncedAt, language));
        this.port.applyRestoreEffects();
    }

    private notifyRestorePersistenceFailure(settingsBeforeRestore: ReaderSettings): void {
        if (this.port.stableSettings() !== settingsBeforeRestore) return;
        notifyCloudSettingsPersistenceFailed(this.port.onSettingsPersistenceFailed, settingsBeforeRestore);
    }

    private reportStatus(setStatus: SettingsStatusSetter | undefined, message: string): void {
        reportCloudSettingsStatus(setStatus, message);
        this.port.toast(message);
    }

    private reportStatusAfterCommit(setStatus: SettingsStatusSetter | undefined, message: string): void {
        this.port.runPostCommitEffect('cloud restore status reporting', () => this.reportStatus(setStatus, message));
    }

}

function normalizeCloudSettings(imported: Partial<ReaderSettings>, current: ReaderSettings): ReaderSettings {
    return normalizeReaderSettings({
        ...current,
        ...imported,
        shortcuts: { ...current.shortcuts, ...imported.shortcuts },
    });
}

function reportUnavailable(setStatus: SettingsStatusSetter, language: InterfaceLanguage): true {
    setStatus(cloudSettingsSyncUnavailableStatus(language));
    return true;
}

function cloudSettingsSyncUnavailableStatus(language: InterfaceLanguage): string {
    return language === 'ja'
        ? 'このブラウザーではGoogle Drive設定同期を利用できません。'
        : 'Google Drive settings sync is unavailable in this browser.';
}

function cloudSettingsNotFoundStatus(language: InterfaceLanguage): string {
    return language === 'ja'
        ? 'Google Driveに保存されたYomu設定が見つかりません。'
        : 'No Yomu settings were found in Google Drive.';
}

function cloudSettingsSyncedStatus(syncedAt: string, language: InterfaceLanguage): string {
    const time = cloudSettingsSyncTime(syncedAt, language);
    return language === 'ja'
        ? `設定をGoogle Driveに同期しました（${time}）。`
        : `Settings synced to Google Drive (${time}).`;
}

function cloudSettingsRestoredStatus(syncedAt: string, language: InterfaceLanguage): string {
    const time = cloudSettingsSyncTime(syncedAt, language);
    return language === 'ja'
        ? `Google Drive設定を復元しました（${time}）。`
        : `Google Drive settings restored (${time}).`;
}

function cloudSettingsSyncTime(value: string, language: InterfaceLanguage): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(language === 'ja' ? 'ja-JP' : undefined);
}
