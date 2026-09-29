/** Copy owned by settings import and packaged-Study authority recovery. */
export const SETTINGS_RECOVERY_COPY = {
    en: {
        settingsImportUnsupportedFormat: 'This settings backup format is not supported.',
        settingsImportIncomplete: 'The settings data in this backup is incomplete.',
        extensionSettingsRecoveryTitle: 'Could not load settings',
        extensionSettingsRecoveryBody: 'Your saved settings have not been changed.',
        extensionSettingsRecoveryRetry: 'Try again',
        extensionSettingsRecoveryReload: 'Reload Study',
        extensionSettingsRecoveryRetrying: 'Loading settings…',
        extensionSettingsRecoveryStillBlocked: 'Settings are still unavailable.',
        saveAfterImport: 'Save after import',
        settingsImportSaveBlocked: 'Settings import is running. Save unlocks when it finishes.',
        settingsImportStaleSaveDiscarded: 'Settings import replaced the earlier pending Save.',
    },
    ja: {
        settingsImportUnsupportedFormat: 'このバックアップの設定形式には対応していません。',
        settingsImportIncomplete: 'このバックアップの設定データが不完全です。',
        extensionSettingsRecoveryTitle: '設定を読み込めませんでした',
        extensionSettingsRecoveryBody: '保存済みの設定は変更されていません。',
        extensionSettingsRecoveryRetry: '再試行',
        extensionSettingsRecoveryReload: 'Studyを再読み込み',
        extensionSettingsRecoveryRetrying: '設定を読み込み中…',
        extensionSettingsRecoveryStillBlocked: 'まだ設定を読み込めません。',
        saveAfterImport: 'インポート後に保存',
        settingsImportSaveBlocked: '設定をインポート中です。完了後に保存できます。',
        settingsImportStaleSaveDiscarded: '設定のインポートを優先し、先に待機していた保存は破棄しました。',
    },
} as const;
