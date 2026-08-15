/** Copy owned by settings import and packaged-Study authority recovery. */
export const SETTINGS_RECOVERY_COPY = {
    en: {
        extensionSettingsRecoveryTitle: 'Study paused to protect your settings',
        extensionSettingsRecoveryBody: 'Yomu could not reconnect your saved settings. The existing data was retained unchanged, and Study will not replace it with setup defaults.',
        extensionSettingsRecoveryGuidance: 'Retry recovery or reload Study. If this continues, import your latest settings backup once after recovery succeeds. Do not use Factory Reset or downgrade Yomu.',
        extensionSettingsRecoveryRetry: 'Retry recovery',
        extensionSettingsRecoveryReload: 'Reload Study',
        extensionSettingsRecoveryRetrying: 'Retrying settings recovery…',
        extensionSettingsRecoveryStillBlocked: 'Recovery is still unavailable. Your existing data remains unchanged.',
        saveAfterImport: 'Save after import',
        settingsImportSaveBlocked: 'Settings import is running. Save unlocks when it finishes.',
        settingsImportStaleSaveDiscarded: 'Settings import replaced the earlier pending Save.',
    },
    ja: {
        extensionSettingsRecoveryTitle: '設定を保護するためStudyを一時停止しました',
        extensionSettingsRecoveryBody: '保存済み設定に再接続できませんでした。既存データは変更せず保持され、Studyが初期設定で上書きすることはありません。',
        extensionSettingsRecoveryGuidance: '復旧を再試行するかStudyを再読み込みしてください。解決しない場合は、復旧成功後に最新の設定バックアップを一度だけインポートしてください。初期状態へのリセットやYomuのダウングレードは行わないでください。',
        extensionSettingsRecoveryRetry: '復旧を再試行',
        extensionSettingsRecoveryReload: 'Studyを再読み込み',
        extensionSettingsRecoveryRetrying: '設定の復旧を再試行中…',
        extensionSettingsRecoveryStillBlocked: 'まだ復旧できません。既存データは変更されていません。',
        saveAfterImport: 'インポート後に保存',
        settingsImportSaveBlocked: '設定をインポート中です。完了後に保存できます。',
        settingsImportStaleSaveDiscarded: '設定のインポートを優先し、先に待機していた保存は破棄しました。',
    },
} as const;
