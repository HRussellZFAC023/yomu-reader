import { assertYomitanDatabaseOwner, runYomitanManagedStateWrite } from './managed-state';
import type { ManagedStateIdbWriteOptions } from '../../app/managed-indexeddb';
import { readBlobText, readDexieTableRowCounts, streamDexieTables } from './dexie-stream';
import { DexieSyntaxPreflight, failInvalidDexieJson } from './dexie-syntax';
import type { ZipArchive } from './zip';
import { normalizeZipTermRow, normalizeZipKanjiRow, normalizeZipTermMetaRow, normalizeZipKanjiMetaRow } from './zip-normalize';

import type { DictionaryImportMutation } from './import-ownership';
export { beginDictionaryImport, requestPersistentDictionaryStorage, type DictionaryImportMutation } from './import-ownership';

export function runDictionaryImportWrite(
    db: IDBDatabase, stores: string | string[], mutate: (tx: IDBTransaction) => void,
    options?: ManagedStateIdbWriteOptions, importing?: DictionaryImportMutation,
): Promise<void> {
    return runYomitanManagedStateWrite(db, stores, tx => {
        const apply = () => { assertYomitanDatabaseOwner(db); mutate(tx); };
        if (importing) importing(tx, apply);
        else apply();
    }, options);
}

/** Validate every bank before replacing an existing dictionary. */
export async function validateZipDictionaryBanks(zip: ZipArchive, dictionary: string, version: number): Promise<boolean> {
    const normalizers = {
        term: (row: unknown) => normalizeZipTermRow(row, dictionary),
        kanji: (row: unknown) => normalizeZipKanjiRow(row, dictionary, version),
        term_meta: (row: unknown) => normalizeZipTermMetaRow(row, dictionary),
        kanji_meta: (row: unknown) => normalizeZipKanjiMetaRow(row, dictionary),
    };
    let supported = false;
    for (const bank of zip.entries().filter(entry => /^(?:term|kanji)(?:_meta)?_bank_\d+\.json$/i.test(entry.name))) {
        const rows: unknown = JSON.parse(await zip.text(bank.name));
        if (!Array.isArray(rows)) throw new TypeError(`Invalid dictionary bank: ${bank.name}`);
        const kind = bank.name.toLowerCase().split('_bank_')[0] as keyof typeof normalizers;
        if (!supported) supported = rows.some(row => normalizers[kind](row) !== null);
    }
    return supported;
}

const DEXIE_PREFLIGHT_CHUNK_BYTES = 262144;
const DEXIE_TABLES: ReadonlySet<string> = new Set(['dictionaries', 'terms', 'kanji', 'termMeta', 'kanjiMeta']);

/** Chunked syntax preflight with bounded scalar tokens and container depth. */
export async function validateDexieJson(file: File): Promise<Partial<Record<string, number>>> {
    const syntax = new DexieSyntaxPreflight();
    for (let offset = 0; offset < file.size; offset += DEXIE_PREFLIGHT_CHUNK_BYTES) {
        syntax.feed(await readBlobText(file.slice(offset, offset + DEXIE_PREFLIGHT_CHUNK_BYTES)));
    }
    syntax.finish();
    let recognized = false;
    await streamDexieTables(file, {}, table => { if (DEXIE_TABLES.has(table)) recognized = true; });
    const counts = await readDexieTableRowCounts(file);
    if (!recognized && !Object.keys(counts).some(table => DEXIE_TABLES.has(table))) failInvalidDexieJson();
    return counts;
}
