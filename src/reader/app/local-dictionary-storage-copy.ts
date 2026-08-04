export const LOCAL_DICTIONARY_STORAGE_COPY = {
    enSettings: {
        localDictionariesEnabled: 'Show imported dictionary definitions',
        localDictionarySiteStorageHelp: 'Imported dictionaries are stored by the site where you import them. Other sites answer from Jiten and your online sources.',
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
        localDictionariesEnabled: 'インポート済み辞書の定義を表示',
        localDictionarySiteStorageHelp: 'インポート済み辞書は、インポートしたサイトに保存されます。他のサイトではJitenなどのオンラインソースが使われます。',
        clearLocalDictionarySiteStorage: '無効にして保存済み辞書を削除',
        clearLocalDictionarySiteStorageConfirm: 'インポート済み辞書を無効にし、このサイトの保存コピーを削除しますか？\n\n以前のバージョンのコピーが残っているサイトは、次回訪問時に自動的に削除されます。辞書はいつでも再インポートできます。',
        clearLocalDictionarySiteStorageClearing: 'インポート済み辞書を無効にし、このサイトのコピーを削除中...',
        clearLocalDictionarySiteStorageDone: 'インポート済み辞書を無効にしました。このサイトのコピーは削除され、他のサイトも訪問時に順次削除されます。',
    },
} as const;
