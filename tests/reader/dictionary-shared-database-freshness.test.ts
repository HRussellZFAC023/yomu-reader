import { afterEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import { yomitanZipBlob } from './zip-fixture';

// In the extension, packaged Study imports into the extension-origin database
// with its own store while the background's Shared Dictionary Host keeps
// another store open on the same database. A host that had already answered
// "no term dictionaries" kept that answer after Study installed JMdict, so
// every page loaded afterwards parsed without its local dictionary: online the
// network covered for it, offline a click on は opened nothing at all.
const activeStores: YomitanDictionaryStore[] = [];

function store(): YomitanDictionaryStore {
    const created = new YomitanDictionaryStore();
    activeStores.push(created);
    return created;
}

function jmdictLike(): File {
    return new File([yomitanZipBlob({
        'index.json': { title: 'JMdict', format: 3, revision: 'test' },
        'term_bank_1.json': [['は', 'は', 'prt', '', 1, ['topic marker'], 1, '']],
    })], 'jmdict.zip');
}

describe('a store sharing its database with another realm', () => {
    afterEach(async () => {
        for (const created of activeStores.splice(0).reverse()) {
            await created.deleteDatabase({ timeoutMs: 2000 }).catch(() => undefined);
        }
    });

    it('sees a dictionary the other realm installed after it first answered', async () => {
        const host = store();
        const study = store();
        expect(await host.hasTermDictionaries()).toBe(false);

        await study.importZip(jmdictLike());

        expect(await host.hasTermDictionaries()).toBe(true);
        expect(await host.hasDictionaries()).toBe(true);
    });

    it('stops reporting a dictionary the other realm deleted', async () => {
        const host = store();
        const study = store();
        await study.importZip(jmdictLike());
        expect(await host.hasTermDictionaries()).toBe(true);

        await study.deleteDictionary('JMdict');

        expect(await host.hasTermDictionaries()).toBe(false);
    });
});
