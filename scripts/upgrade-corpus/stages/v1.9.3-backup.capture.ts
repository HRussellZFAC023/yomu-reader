// v1.9.3 backups: the recovery path the 1.9.3 CHANGELOG tells learners to use.
//   f   Settings > Export settings file (formatVersion 3, with bundled
//       dictionaries) from the long-time learner of c1, whose store still has
//       the retired 'yomu:explicit-user-settings:v1' pins and seq-0 ledger records
//   f2  the Google Drive snapshot the extension's cloud sync uploads for them
// Each file is written byte-for-byte as v1.9.3 produced it, and the expected
// outcome is what v1.9.3's own import showed on a fresh install.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, vi } from 'vitest';
import { YomitanDictionaryStore } from '@yomu-ref/src/reader/dictionaries/yomitan';
import { exportSettingsBackupSnapshot } from '@yomu-ref/src/reader/settings/settings-persistence-transaction';
import { dateStamp, readerDictionaryExportHasData } from '@yomu-ref/src/reader/settings/file-io';
import { restoreReaderSettingsBackup } from '@yomu-ref/src/reader/settings/reader-settings-restore-adapter';
import {
    runSettingsRestoreTransaction,
    settingsRestoreSaveOptions,
    witnessedSettingsRestoreCandidate,
} from '@yomu-ref/src/reader/settings/settings-restore-transaction';
import { loadSettings, normalizeReaderSettings, saveSettings } from '@yomu-ref/src/reader/settings/index';
import type { ReaderSettings } from '@yomu-ref/src/reader/app/types';
import {
    installDeterministicClock,
    readCorpusFile,
    writeCorpusText,
    writeScenario,
} from '../lib/corpus-output';
import {
    createRecordingStore,
    installBlobReaders,
    OriginWebStorage,
    prefixedPhysicalStore,
} from '../lib/realm-stubs';
import { SITE_URL } from '../lib/learner-story';
import {
    corpusDictionaryFile,
    enterPackagedStudy,
    enterUserscriptSite,
    visibleAfterReload,
} from '../lib/v193-reader';

const INPUT = 'c1-userscript-folded-pins-explicit.json';

function freshDictionaries(): YomitanDictionaryStore {
    vi.stubGlobal('indexedDB', new IDBFactory());
    return new YomitanDictionaryStore();
}

/** dialog-controller.ts 'export-reader-settings', v1.9.3. */
async function exportSettingsFile(store: YomitanDictionaryStore): Promise<string> {
    const summary = await store.summary();
    const exported = summary.dictionaries.length ? JSON.parse(await (await store.exportJson()).text()) as unknown : undefined;
    const dictionaries = readerDictionaryExportHasData(exported) ? exported : undefined;
    const backup = await exportSettingsBackupSnapshot(await loadSettings());
    return JSON.stringify({
        formatName: 'yomu-reader-settings',
        formatVersion: 3,
        exportedAt: new Date().toISOString(),
        settings: backup.settings,
        storage: backup.storage,
        ...(dictionaries ? { dictionaries } : {}),
    }, null, 2);
}

function restorePort(store: YomitanDictionaryStore) {
    return {
        dictionaries: store,
        setStatus: () => undefined,
        persistSettings: saveSettings,
        adoptSettings: () => undefined,
        dictionaryStateChanged: () => undefined,
    };
}

/** settings-cloud-sync-coordinator.ts restoreSnapshot, v1.9.3. */
async function restoreCloudSnapshot(snapshot: { settings: Partial<ReaderSettings>; storage?: unknown }): Promise<void> {
    const before = await loadSettings();
    let imported = normalizeReaderSettings({ ...before, ...snapshot.settings, shortcuts: { ...before.shortcuts, ...snapshot.settings.shortcuts } });
    await runSettingsRestoreTransaction({
        storage: snapshot.storage,
        prepareSettings: view => { imported = witnessedSettingsRestoreCandidate(before, imported, view); },
        publishSettings: view => saveSettings(imported, settingsRestoreSaveOptions(before, imported, view)),
    });
}

async function captureCloudUpload(logical: Record<string, unknown>): Promise<string> {
    installDeterministicClock();
    enterPackagedStudy(createRecordingStore('extension', prefixedPhysicalStore(logical)), new OriginWebStorage());
    vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);
    vi.stubGlobal('__YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__', true);
    let uploaded: unknown;
    (globalThis as unknown as { browser: { runtime: { sendMessage: unknown } } }).browser.runtime.sendMessage = async (message: { snapshot?: { syncedAt: string } }) => {
        uploaded = message.snapshot;
        return { ok: true, metadata: { syncedAt: message.snapshot?.syncedAt } };
    };
    // The build flags are read once at module evaluation; evaluate cloud-sync
    // (and the storage modules it reads through) afresh with them set.
    vi.resetModules();
    const cloud = await import('@yomu-ref/src/reader/settings/cloud-sync');
    if (!cloud.CLOUD_SETTINGS_SYNC_ENABLED) throw new Error('v1.9.3 cloud sync stayed disabled; the snapshot would not be real.');
    await cloud.uploadCloudSettingsToCloud(await loadSettings());
    return JSON.stringify(uploaded);
}

describe('v1.9.3 backups for the long-time learner', () => {
    installBlobReaders();
    it('f: the Settings export file, and what importing it in v1.9.3 showed', async () => {
        const input = readCorpusFile<{ gm: Record<string, unknown> }>(INPUT);
        installDeterministicClock();
        enterUserscriptSite(createRecordingStore('gm', input.gm), new OriginWebStorage(), SITE_URL);
        const source = freshDictionaries();
        await source.importFile(corpusDictionaryFile());
        const fileText = await exportSettingsFile(source);
        const fileName = `yomu-settings-${dateStamp()}.json`;
        writeCorpusText(`files/${fileName}`, fileText);

        installDeterministicClock();
        enterUserscriptSite(createRecordingStore('gm'), new OriginWebStorage(), SITE_URL);
        const target = freshDictionaries();
        await restoreReaderSettingsBackup(new File([fileText], fileName, { type: 'application/json' }), await loadSettings(), restorePort(target));
        const expected = { ...await visibleAfterReload(), dictionaries: (await target.summary()).dictionaries.map(entry => entry.title) };
        writeScenario('f-backup-file-v1.9.3', {
            channel: 'backup',
            story: 'The c1 learner exports a settings file in v1.9.3 (it carries the retired pin key, seq-0 ledger records and one dictionary), then imports it on a fresh v1.9.3 install.',
            file: `files/${fileName}`,
            storageKeys: Object.keys((JSON.parse(fileText) as { storage: object }).storage).sort(),
            expected,
        }, [INPUT]);
    });

    it('f2: the Google Drive snapshot, and what restoring it in v1.9.3 showed', async () => {
        const input = readCorpusFile<{ gm: Record<string, unknown> }>(INPUT);
        const snapshotText = await captureCloudUpload(input.gm);
        writeCorpusText('files/google-drive-settings-sync.json', snapshotText);

        installDeterministicClock();
        enterPackagedStudy(createRecordingStore('extension'), new OriginWebStorage());
        await restoreCloudSnapshot(JSON.parse(snapshotText) as { settings: Partial<ReaderSettings> });
        writeScenario('f2-cloud-snapshot-v1.9.3', {
            channel: 'backup',
            story: 'The same learner on the extension uploads to Google Drive in v1.9.3, then restores it into a fresh packaged Study.',
            file: 'files/google-drive-settings-sync.json',
            storageKeys: Object.keys((JSON.parse(snapshotText) as { storage: object }).storage).sort(),
            expected: await visibleAfterReload(),
        }, [INPUT]);
    });
});
