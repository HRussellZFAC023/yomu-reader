import { assertYomitanDatabaseOwner, runYomitanManagedStateWrite } from './managed-state';
import type { ManagedStateIdbWriteOptions } from '../../app/managed-indexeddb';
import { readBlobText, readDexieTableRowCounts, streamDexieTables } from './dexie-stream';
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

// Import safety limits, not JSON grammar limits. The downstream row reader and
// compatibility fallback still do not have an all-input bounded-memory contract.
const MAX_DEXIE_SCALAR_LENGTH = 128;
const MAX_DEXIE_NESTING = 128;

/** Chunked syntax preflight with bounded scalar tokens and container depth. */
export async function validateDexieJson(file: File): Promise<Partial<Record<string, number>>> {
    const stack: Array<{ kind: 'object' | 'array'; next: string }> = [];
    let root = 'value';
    let string = false, escaped = false, unicode = 0, atom = '', text = '';
    let rootKey = '', format: string | undefined;
    const fail = (): never => { throw new SyntaxError('Invalid Dexie JSON dictionary.'); };
    const value = () => {
        const frame = stack.at(-1);
        if (stack.length === 1 && rootKey === 'formatName') format = undefined;
        if (!frame) { if (root !== 'value') fail(); root = 'done'; }
        else { if (!['value', 'value-or-end'].includes(frame.next)) fail(); frame.next = 'comma-or-end'; }
    };
    const stringToken = () => {
        const frame = stack.at(-1);
        const decoded = text.length < 256 ? JSON.parse(`"${text}"`) as string : '';
        if (frame?.kind === 'object' && ['key', 'key-or-end'].includes(frame.next)) {
            frame.next = 'colon';
            if (stack.length === 1) rootKey = decoded;
        } else {
            value();
            if (stack.length === 1 && rootKey === 'formatName') format = decoded;
        }
    };
    const finishAtom = () => {
        if (!atom) return;
        if (!/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(atom)) fail();
        value(); atom = '';
    };
    for (let offset = 0; offset < file.size; offset += 262144) {
        const chunk = await readBlobText(file.slice(offset, offset + 262144));
        for (const char of chunk) {
            if (string) {
                if (char !== '"' || escaped || unicode) { if (text.length < 256) text += char; }
                if (unicode) { if (!/[0-9a-f]/i.test(char)) fail(); unicode--; continue; }
                if (escaped) { if (char === 'u') unicode = 4; else if (!'"\\/bfnrt'.includes(char)) fail(); escaped = false; continue; }
                if (char === '\\') { escaped = true; continue; }
                if (char === '"') { string = false; stringToken(); continue; }
                if (char.charCodeAt(0) < 32) fail();
                continue;
            }
            if (/[ \t\r\n]/.test(char) || '{}[],:"'.includes(char)) finishAtom();
            else {
                if (atom.length >= MAX_DEXIE_SCALAR_LENGTH) throw new RangeError('Dexie import scalar exceeds 128 characters.');
                atom += char; continue;
            }
            if (/[ \t\r\n]/.test(char)) continue;
            const frame = stack.at(-1);
            if (char === '"') { string = true; text = ''; }
            else if (char === '{' || char === '[') {
                if (stack.length >= MAX_DEXIE_NESTING) throw new RangeError('Dexie import nesting exceeds 128 levels.');
                value(); stack.push({ kind: char === '{' ? 'object' : 'array', next: char === '{' ? 'key-or-end' : 'value-or-end' });
            }
            else if (char === '}' || char === ']') {
                if (!frame || frame.kind !== (char === '}' ? 'object' : 'array') || !['key-or-end', 'value-or-end', 'comma-or-end'].includes(frame.next)) fail();
                stack.pop();
            } else if (char === ':') { if (!frame || frame.next !== 'colon') return fail(); frame.next = 'value'; }
            else if (char === ',') { if (!frame || frame.next !== 'comma-or-end') return fail(); frame.next = frame.kind === 'object' ? 'key' : 'value'; }
        }
    }
    finishAtom();
    if (string || escaped || unicode || stack.length || root !== 'done' || format !== 'dexie') fail();
    const known = new Set(['dictionaries', 'terms', 'kanji', 'termMeta', 'kanjiMeta']);
    let recognized = false;
    await streamDexieTables(file, {}, table => { if (known.has(table)) recognized = true; });
    const counts = await readDexieTableRowCounts(file);
    if (!recognized && !Object.keys(counts).some(table => known.has(table))) fail();
    return counts;
}
