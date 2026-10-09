export const LOCAL_DICTIONARY_STORAGE_COPY = {
    enSettings: {
        extensionDictionaryUnavailable: 'The extension dictionary service is unavailable. Retry, or reload the Yomu extension.',
        extensionDictionaryConnectionLost: 'The extension dictionary connection was lost. Check whether the operation completed before retrying.',
        localDictionariesEnabled: 'Show imported dictionary definitions',
        localDictionarySiteStorageHelp: 'Imported dictionaries stay on your device.',
        clearLocalDictionarySiteStorage: 'Disable and remove stored dictionaries',
        clearLocalDictionarySiteStorageConfirm: 'Disable imported dictionaries and delete this site\'s stored copy?\n\nSites that still hold a copy from earlier versions remove it the next time you visit them. You can re-import dictionaries at any time.',
        clearLocalDictionarySiteStorageClearing: 'Disabling imported dictionaries and clearing this site\'s copy...',
        clearLocalDictionarySiteStorageDone: 'Imported dictionaries are disabled. This site\'s copy was deleted; other sites clean up as you visit them.',
    },
    enImport: {
        dictionaryImportComplete: 'Imported {records} from {sources} source{plural}.',
        dictionaryImportResultWithFailures: 'Imported {records} from {sources} source{plural}. {failed} file{failedPlural} failed: {files}.',
    },
    jaImport: {
        dictionaryImportComplete: '{sources}から{records}件インポートしました。',
        dictionaryImportResultWithFailures: '{sources}から{records}件インポートしました。{failed}ファイルのインポートに失敗しました: {files}。',
    },
    jaSettings: {
        extensionDictionaryUnavailable: '拡張機能の辞書サービスを利用できません。再試行するか、よむ拡張機能を再読み込みしてください。',
        extensionDictionaryConnectionLost: '拡張機能の辞書サービスとの接続が切れました。再試行する前に、操作が完了していないか確認してください。',
        localDictionariesEnabled: 'インポート済み辞書の定義を表示',
        localDictionarySiteStorageHelp: 'インポートした辞書は端末内に保存されます。',
        clearLocalDictionarySiteStorage: '無効にして保存済み辞書を削除',
        clearLocalDictionarySiteStorageConfirm: 'インポート済み辞書を無効にし、このサイトの保存コピーを削除しますか？\n\n以前のバージョンのコピーが残っているサイトは、次回訪問時に自動的に削除されます。辞書はいつでも再インポートできます。',
        clearLocalDictionarySiteStorageClearing: 'インポート済み辞書を無効にし、このサイトのコピーを削除中...',
        clearLocalDictionarySiteStorageDone: 'インポート済み辞書を無効にしました。このサイトのコピーは削除され、他のサイトも訪問時に順次削除されます。',
    },
} as const;
