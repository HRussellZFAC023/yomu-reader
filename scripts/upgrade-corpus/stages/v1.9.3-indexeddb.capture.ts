// v1.9.3 IndexedDB, per channel.
//   g  the database names v1.9.3 opens for dictionaries, practice sessions and
//      the Anki status index in each realm, plus a tiny Yomitan dictionary
//      imported by v1.9.3's own store and dumped record-for-record.
// Dictionaries live "on the site where you import them" in v1.9.3, so each
// channel imports into its own origin's database.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, vi } from 'vitest';
import { YomitanDictionaryStore } from '@yomu-ref/src/reader/dictionaries/yomitan';
import { openAnkiStatusIndexDb } from '@yomu-ref/src/reader/anki/status-index';
import { installDeterministicClock, writeScenario } from '../lib/corpus-output';
import {
    createRecordingStore,
    EXTENSION_STUDY_URL,
    OriginWebStorage,
} from '../lib/realm-stubs';
import { dumpIndexedDb, recordDatabaseOpens, type DumpedDatabase } from '../lib/indexeddb-dump';
import { CORPUS_DICTIONARY_TITLE, HOSTED_STUDY_URL, SITE_URL } from '../lib/learner-story';
import {
    corpusDictionaryFile,
    enterHostedStudyWithUserscript,
    enterHostedWithoutInstall,
    enterPackagedStudy,
    enterUserscriptSite,
} from '../lib/v193-reader';

interface Channel {
    readonly id: string;
    readonly href: string;
    readonly enter: (origins: OriginWebStorage) => void;
}

const CHANNELS: readonly Channel[] = [
    {
        id: 'userscript-site',
        href: SITE_URL,
        enter: origins => enterUserscriptSite(createRecordingStore('gm'), origins, SITE_URL),
    },
    {
        id: 'userscript-hosted-study',
        href: HOSTED_STUDY_URL,
        enter: origins => enterHostedStudyWithUserscript(createRecordingStore('gm'), origins),
    },
    {
        id: 'hosted-standalone-study',
        href: HOSTED_STUDY_URL,
        enter: origins => enterHostedWithoutInstall(origins, HOSTED_STUDY_URL),
    },
    {
        id: 'extension-origin',
        href: EXTENSION_STUDY_URL,
        enter: origins => enterPackagedStudy(createRecordingStore('extension'), origins),
    },
];

async function observeChannel(channel: Channel): Promise<Record<string, unknown>> {
    installDeterministicClock();
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    const opened = recordDatabaseOpens(factory);
    channel.enter(new OriginWebStorage());
    const store = new YomitanDictionaryStore();
    const imported = await store.importFile(corpusDictionaryFile());
    const summary = await store.summary();
    const lookup = await store.lookup('読む', 'よむ', 5);
    (await openAnkiStatusIndexDb()).close();
    const dictionaryDatabase = opened[0];
    const dump: DumpedDatabase = await dumpIndexedDb(factory, dictionaryDatabase);
    await store.deleteDatabase({ timeoutMs: 2000 }).catch(() => undefined);
    return {
        location: channel.href,
        databasesOpened: opened,
        dictionaries: dictionaryDatabase,
        ankiStatusIndex: opened.find(name => name !== dictionaryDatabase) ?? null,
        practiceSessions: null,
        imported,
        summary,
        lookupGlossary: lookup.map(entry => entry.glossary),
        dictionaryDatabase: dump,
    };
}

describe('v1.9.3 IndexedDB per channel', () => {
    it('g: dictionary, practice-session and Anki status databases, with a tiny imported dictionary', async () => {
        const channels: Record<string, unknown> = {};
        for (const channel of CHANNELS) channels[channel.id] = await observeChannel(channel);
        writeScenario('g-indexeddb-per-channel', {
            channel: 'indexeddb',
            story: 'v1.9.3 imports a three-term Yomitan dictionary in each realm; practice sessions had no database in v1.9.3.',
            dictionaryTitle: CORPUS_DICTIONARY_TITLE,
            channels,
        });
    });
});
