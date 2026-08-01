export const LOCAL_DICTIONARY_STORAGE_COPY = {
    enSettings: {
        localDictionariesEnabled: 'Show imported dictionary definitions',
        localDictionarySiteStorageHelp: 'Imported dictionaries are copied into each site\'s storage when needed. This switch applies everywhere; existing site copies remain until you clear them.',
        clearLocalDictionarySiteStorage: 'Disable everywhere and clear this site',
        clearLocalDictionarySiteStorageConfirm: 'Disable imported dictionaries everywhere and delete only this site\'s dictionary copy?\n\nThe shared archive is kept so you can re-enable and restore dictionaries later.',
        clearLocalDictionarySiteStorageClearing: 'Disabling imported dictionaries and clearing this site\'s copy...',
        clearLocalDictionarySiteStorageDone: 'Imported dictionaries are disabled everywhere. This site\'s copy was deleted; the shared archive was kept.',
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
        localDictionariesEnabled: 'インポート済み辞書の定義を表示',
        localDictionarySiteStorageHelp: 'インポート済み辞書は、必要に応じて各サイトのストレージにコピーされます。この切り替えはすべてのサイトに適用されます。既存のサイト別コピーは削除するまで残ります。',
        clearLocalDictionarySiteStorage: 'すべてで無効にし、このサイトのコピーを削除',
        clearLocalDictionarySiteStorageConfirm: 'インポート済み辞書をすべてのサイトで無効にし、このサイトだけの辞書コピーを削除しますか？\n\n共有アーカイブは保持されるため、後で再び有効にして辞書を復元できます。',
        clearLocalDictionarySiteStorageClearing: 'インポート済み辞書を無効にし、このサイトのコピーを削除中...',
        clearLocalDictionarySiteStorageDone: 'インポート済み辞書をすべてのサイトで無効にしました。このサイトのコピーは削除され、共有アーカイブは保持されています。',
    },
} as const;
