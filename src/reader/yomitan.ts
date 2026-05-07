import JSZip from 'jszip';
import { normalizeAudioSource, normalizeDictionaryPreferences } from './settings';
import type { DictionaryPreference, ReaderSettings } from './types';

const DB_NAME = 'jpdb-popup-reader-yomitan';
const DB_VERSION = 2;

type StoreName = 'terms' | 'kanji' | 'termMeta' | 'kanjiMeta' | 'dictionaryInfo';

export interface YomitanTermEntry {
    id?: number;
    expression: string;
    reading: string;
    definitionTags?: string;
    rules?: string;
    score?: number;
    glossary: unknown[];
    sequence?: number;
    termTags?: string;
    dictionary: string;
}

export interface YomitanKanjiEntry {
    id?: number;
    character: string;
    onyomi: string[];
    kunyomi: string[];
    tags: string[];
    meanings: string[];
    stats?: unknown;
    dictionary: string;
}

export interface YomitanMetaEntry {
    id?: number;
    expression?: string;
    character?: string;
    mode: string;
    data: unknown;
    dictionary: string;
}

export interface YomitanDictionaryInfo {
    title: string;
    alias: string;
    enabled: boolean;
    priority: number;
    counts?: Record<string, unknown>;
    styles?: string;
    importDate?: number;
}

export interface DictionarySummary {
    dictionaries: YomitanDictionaryInfo[];
    terms: number;
    kanji: number;
    termMeta: number;
    kanjiMeta: number;
}

export interface ImportSummary {
    dictionaries: string[];
    entries: number;
    terms: number;
    kanji: number;
    termMeta: number;
    kanjiMeta: number;
}

export interface YomitanSettingsImport {
    settings: Partial<Omit<ReaderSettings, 'shortcuts'>> & { shortcuts?: Partial<ReaderSettings['shortcuts']> };
    dictionaryNames: string[];
}

export class YomitanDictionaryStore {
    private dbPromise?: Promise<IDBDatabase>;

    async lookup(expression: string, reading: string, limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanTermEntry[]> {
        const db = await this.db();
        const entries = await this.getByIndex<YomitanTermEntry>(db, 'terms', 'expression', expression, Math.max(limit * 40, 500));
        if (reading && reading !== expression) {
            const byReading = await this.getByIndex<YomitanTermEntry>(db, 'terms', 'reading', reading, Math.max(limit * 20, 250));
            entries.push(...byReading);
        }

        const rank = dictionaryRank(preferences);
        const seen = new Set<string>();
        return entries
            .filter(entry => dictionaryEnabled(entry.dictionary, rank))
            .sort((a, b) =>
                dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank)
                || Number(b.reading === reading) - Number(a.reading === reading)
                || (b.score ?? 0) - (a.score ?? 0),
            )
            .filter(entry => {
                const key = `${entry.dictionary}\n${entry.expression}\n${entry.reading}\n${JSON.stringify(entry.glossary).slice(0, 120)}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, limit);
    }

    async lookupKanji(text: string, limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanKanjiEntry[]> {
        const db = await this.db();
        const rank = dictionaryRank(preferences);
        const characters = [...new Set(Array.from(text).filter(isKanji))];
        const entries: YomitanKanjiEntry[] = [];
        for (const character of characters) {
            entries.push(...await this.getByIndex<YomitanKanjiEntry>(db, 'kanji', 'character', character, limit));
        }
        return entries
            .filter(entry => dictionaryEnabled(entry.dictionary, rank))
            .sort((a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank))
            .slice(0, limit);
    }

    async lookupTermMeta(expression: string, limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanMetaEntry[]> {
        const db = await this.db();
        const rank = dictionaryRank(preferences);
        return (await this.getByIndex<YomitanMetaEntry>(db, 'termMeta', 'expression', expression, limit * 2))
            .filter(entry => dictionaryEnabled(entry.dictionary, rank))
            .sort((a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank))
            .slice(0, limit);
    }

    async summary(): Promise<DictionarySummary> {
        const db = await this.db();
        const [dictionaries, terms, kanji, termMeta, kanjiMeta] = await Promise.all([
            this.getAllDictionaryInfo(db),
            this.countStore(db, 'terms'),
            this.countStore(db, 'kanji'),
            this.countStore(db, 'termMeta'),
            this.countStore(db, 'kanjiMeta'),
        ]);
        return { dictionaries, terms, kanji, termMeta, kanjiMeta };
    }

    async countEntries(): Promise<number> {
        const summary = await this.summary();
        return summary.terms + summary.kanji + summary.termMeta + summary.kanjiMeta;
    }

    async importFile(file: File, onProgress?: (message: string) => void): Promise<ImportSummary> {
        if (/\.zip$/i.test(file.name)) return this.importZip(file, onProgress);
        return this.importJson(file, onProgress);
    }

    async importZip(file: File, onProgress?: (message: string) => void): Promise<ImportSummary> {
        onProgress?.('Reading dictionary ZIP...');
        const zip = await JSZip.loadAsync(file);
        const indexFile = zip.file('index.json');
        if (!indexFile) throw new Error('Yomitan dictionary ZIP is missing index.json.');

        const index = JSON.parse(await indexFile.async('string')) as { title?: string; format?: number; version?: number; revision?: string };
        const dictionary = index.title?.trim() || file.name.replace(/\.zip$/i, '');
        const version = index.format ?? index.version ?? 3;
        await this.deleteDictionary(dictionary);
        await this.putDictionaryInfo({
            title: dictionary,
            alias: dictionary,
            enabled: true,
            priority: 0,
            importDate: Date.now(),
        });

        const summary: ImportSummary = { dictionaries: [dictionary], entries: 0, terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
        const importBank = async <T>(pattern: RegExp, label: keyof Pick<ImportSummary, 'terms' | 'kanji' | 'termMeta' | 'kanjiMeta'>, store: StoreName, normalize: (row: unknown) => T | null) => {
            const files = Object.values(zip.files).filter(entry => pattern.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            for (const bankFile of files) {
                onProgress?.(`Importing ${dictionary}: ${bankFile.name}`);
                const rows = JSON.parse(await bankFile.async('string')) as unknown[];
                const entries = rows.map(normalize).filter(Boolean) as T[];
                await this.addToStore(store, entries);
                summary[label] += entries.length;
                summary.entries += entries.length;
            }
        };

        await importBank(/^term_bank_\d+\.json$/i, 'terms', 'terms', row => normalizeZipTermRow(row, dictionary));
        await importBank(/^kanji_bank_\d+\.json$/i, 'kanji', 'kanji', row => normalizeZipKanjiRow(row, dictionary, version));
        await importBank(/^term_meta_bank_\d+\.json$/i, 'termMeta', 'termMeta', row => normalizeZipTermMetaRow(row, dictionary));
        await importBank(/^kanji_meta_bank_\d+\.json$/i, 'kanjiMeta', 'kanjiMeta', row => normalizeZipKanjiMetaRow(row, dictionary));

        if (summary.entries === 0) throw new Error('No supported Yomitan dictionary banks found.');
        return summary;
    }

    async importJson(file: File, onProgress?: (message: string) => void): Promise<ImportSummary> {
        const head = await readBlobText(file.slice(0, 4096));
        if (head.includes('"formatName":"dexie"') || head.includes('"formatName": "dexie"')) {
            return this.importDexieJson(file, onProgress);
        }

        const json = JSON.parse(await readBlobText(file)) as unknown;
        if (isReaderDictionaryExport(json)) {
            await this.clear();
            await Promise.all([
                this.addToStore('dictionaryInfo', json.dictionaries ?? [], true),
                this.addToStore('terms', json.terms ?? json.entries ?? []),
                this.addToStore('kanji', json.kanji ?? []),
                this.addToStore('termMeta', json.termMeta ?? []),
                this.addToStore('kanjiMeta', json.kanjiMeta ?? []),
            ]);
            const dictionaryNames = json.dictionaries?.map(item => item.title)
                ?? [...new Set((json.terms ?? json.entries ?? []).map(entry => entry.dictionary))];
            return {
                dictionaries: dictionaryNames,
                entries: (json.terms ?? json.entries ?? []).length + (json.kanji ?? []).length + (json.termMeta ?? []).length + (json.kanjiMeta ?? []).length,
                terms: (json.terms ?? json.entries ?? []).length,
                kanji: (json.kanji ?? []).length,
                termMeta: (json.termMeta ?? []).length,
                kanjiMeta: (json.kanjiMeta ?? []).length,
            };
        }

        throw new Error('Unsupported dictionary JSON. Import a Yomitan Dexie export, a Yomitan dictionary ZIP, or this reader export.');
    }

    async importDexieJson(file: File, onProgress?: (message: string) => void): Promise<ImportSummary> {
        onProgress?.('Streaming Yomitan dictionary export...');
        await this.clear();
        const dictionaries = new Set<string>();
        const summary: ImportSummary = { dictionaries: [], entries: 0, terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
        const batches: Record<'terms' | 'kanji' | 'termMeta' | 'kanjiMeta', unknown[]> = { terms: [], kanji: [], termMeta: [], kanjiMeta: [] };

        const flush = async (store: keyof typeof batches) => {
            const batch = batches[store];
            if (!batch.length) return;
            await this.addToStore(store, batch);
            batches[store] = [];
        };
        const addBatch = async (store: keyof typeof batches, entry: unknown, label: keyof Pick<ImportSummary, 'terms' | 'kanji' | 'termMeta' | 'kanjiMeta'>) => {
            batches[store].push(entry);
            summary[label]++;
            summary.entries++;
            const dictionary = (entry as { dictionary?: unknown }).dictionary;
            if (typeof dictionary === 'string') dictionaries.add(dictionary);
            if (batches[store].length >= 1000) {
                await flush(store);
                if (summary.entries % 25000 === 0) onProgress?.(`Imported ${summary.entries.toLocaleString()} dictionary records...`);
            }
        };

        await streamDexieTables(file, {
            dictionaries: async row => {
                const info = normalizeDexieDictionaryRow(row);
                if (!info) return;
                dictionaries.add(info.title);
                await this.putDictionaryInfo(info);
            },
            terms: async row => {
                const entry = normalizeDexieTermRow(row);
                if (entry) await addBatch('terms', entry, 'terms');
            },
            kanji: async row => {
                const entry = normalizeDexieKanjiRow(row);
                if (entry) await addBatch('kanji', entry, 'kanji');
            },
            termMeta: async row => {
                const entry = normalizeDexieTermMetaRow(row);
                if (entry) await addBatch('termMeta', entry, 'termMeta');
            },
            kanjiMeta: async row => {
                const entry = normalizeDexieKanjiMetaRow(row);
                if (entry) await addBatch('kanjiMeta', entry, 'kanjiMeta');
            },
        }, table => onProgress?.(`Importing Yomitan ${table}...`));

        await Promise.all([flush('terms'), flush('kanji'), flush('termMeta'), flush('kanjiMeta')]);
        summary.dictionaries = [...dictionaries];
        return summary;
    }

    async exportJson(): Promise<Blob> {
        const db = await this.db();
        const [dictionaries, terms, kanji, termMeta, kanjiMeta] = await Promise.all([
            this.getAllFromStore<YomitanDictionaryInfo>(db, 'dictionaryInfo'),
            this.getAllFromStore<YomitanTermEntry>(db, 'terms'),
            this.getAllFromStore<YomitanKanjiEntry>(db, 'kanji'),
            this.getAllFromStore<YomitanMetaEntry>(db, 'termMeta'),
            this.getAllFromStore<YomitanMetaEntry>(db, 'kanjiMeta'),
        ]);
        return new Blob([JSON.stringify({
            formatName: 'kotoba-yomitan-dictionaries',
            formatVersion: 2,
            exportedAt: new Date().toISOString(),
            dictionaries,
            terms,
            kanji,
            termMeta,
            kanjiMeta,
        })], { type: 'application/json' });
    }

    async clear(): Promise<void> {
        const db = await this.db();
        await new Promise<void>((resolve, reject) => {
            const stores = existingStores(db, ['terms', 'kanji', 'termMeta', 'kanjiMeta', 'dictionaryInfo']);
            const tx = db.transaction(stores, 'readwrite');
            for (const store of stores) tx.objectStore(store).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    private async deleteDictionary(dictionary: string): Promise<void> {
        const db = await this.db();
        const stores = existingStores(db, ['terms', 'kanji', 'termMeta', 'kanjiMeta']);
        await Promise.all(stores.map(store => deleteByDictionary(db, store, dictionary)));
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('dictionaryInfo', 'readwrite');
            tx.objectStore('dictionaryInfo').delete(dictionary);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    private async putDictionaryInfo(info: YomitanDictionaryInfo): Promise<void> {
        await this.addToStore('dictionaryInfo', [info], true);
    }

    private async addToStore<T>(storeName: StoreName, entries: T[], put = false): Promise<void> {
        if (!entries.length) return;
        const db = await this.db();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            for (const entry of entries) put ? store.put(entry) : store.add(entry);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    private async getByIndex<T>(db: IDBDatabase, storeName: StoreName, indexName: string, value: string, limit: number): Promise<T[]> {
        return new Promise((resolve, reject) => {
            const results: T[] = [];
            const request = db.transaction(storeName, 'readonly').objectStore(storeName).index(indexName).openCursor(IDBKeyRange.only(value));
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || results.length >= limit) {
                    resolve(results);
                    return;
                }
                results.push(cursor.value as T);
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        });
    }

    private async getAllDictionaryInfo(db: IDBDatabase): Promise<YomitanDictionaryInfo[]> {
        return (await this.getAllFromStore<YomitanDictionaryInfo>(db, 'dictionaryInfo')).sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
    }

    private async getAllFromStore<T>(db: IDBDatabase, storeName: StoreName): Promise<T[]> {
        return new Promise((resolve, reject) => {
            const results: T[] = [];
            const request = db.transaction(storeName, 'readonly').objectStore(storeName).openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve(results);
                    return;
                }
                results.push(cursor.value as T);
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        });
    }

    private countStore(db: IDBDatabase, storeName: StoreName): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!db.objectStoreNames.contains(storeName)) {
                resolve(0);
                return;
            }
            const request = db.transaction(storeName, 'readonly').objectStore(storeName).count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    private db(): Promise<IDBDatabase> {
        this.dbPromise ??= new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                const tx = request.transaction!;
                const terms = ensureStore(db, tx, 'terms');
                ensureIndex(terms, 'expression', 'expression');
                ensureIndex(terms, 'reading', 'reading');
                ensureIndex(terms, 'dictionary', 'dictionary');

                const kanji = ensureStore(db, tx, 'kanji');
                ensureIndex(kanji, 'character', 'character');
                ensureIndex(kanji, 'dictionary', 'dictionary');

                const termMeta = ensureStore(db, tx, 'termMeta');
                ensureIndex(termMeta, 'expression', 'expression');
                ensureIndex(termMeta, 'dictionary', 'dictionary');

                const kanjiMeta = ensureStore(db, tx, 'kanjiMeta');
                ensureIndex(kanjiMeta, 'character', 'character');
                ensureIndex(kanjiMeta, 'dictionary', 'dictionary');

                if (!db.objectStoreNames.contains('dictionaryInfo')) {
                    db.createObjectStore('dictionaryInfo', { keyPath: 'title' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return this.dbPromise;
    }
}

export function parseYomitanSettingsExport(value: unknown): YomitanSettingsImport {
    const profileOptions = getYomitanProfileOptions(value);
    if (!profileOptions) throw new Error('This does not look like a Yomitan settings export.');

    const settings: YomitanSettingsImport['settings'] = {};
    const audio = profileOptions.audio as Record<string, unknown> | undefined;
    const general = profileOptions.general as Record<string, unknown> | undefined;
    const scanning = profileOptions.scanning as Record<string, unknown> | undefined;
    const inputs = profileOptions.inputs as { hotkeys?: Array<Record<string, unknown>> } | undefined;

    if (typeof audio?.enabled === 'boolean') settings.audioEnabled = audio.enabled;
    if (typeof audio?.autoPlay === 'boolean') settings.autoPlayAudio = audio.autoPlay;
    if (typeof audio?.enableDefaultAudioSources === 'boolean') settings.audioEnableDefaultSources = audio.enableDefaultAudioSources;
    if (Array.isArray(audio?.sources)) {
        settings.audioSources = audio.sources
            .map(normalizeAudioSource)
            .filter((source): source is NonNullable<ReturnType<typeof normalizeAudioSource>> => source !== null);
        settings.audioSourceUrl = settings.audioSources.find(source => source.url)?.url;
    }
    if (general?.popupTheme === 'dark' || general?.popupTheme === 'light') settings.theme = general.popupTheme;
    if (typeof general?.popupHeight === 'number' && general.popupHeight > 0) {
        settings.subtitleBottomOffset = Math.max(6, Math.min(24, Math.round(general.popupVerticalOffset as number || 12)));
    }
    if (typeof scanning?.selectText === 'boolean') settings.parseSelection = scanning.selectText;
    if (typeof scanning?.scanWithoutMousemove === 'boolean') settings.autoScanJapanese = scanning.scanWithoutMousemove;
    const scanInput = Array.isArray(scanning?.inputs)
        ? (scanning.inputs as Array<Record<string, unknown>>).find(input => input && typeof input === 'object')
        : null;
    if (scanInput) {
        const include = String(scanInput.include ?? '').toLowerCase();
        const modifier = ['shift', 'alt', 'ctrl', 'meta'].find(key => include.includes(key));
        if (modifier) {
            settings.popupActivationMode = 'modifier';
            settings.scanModifierKey = modifier as ReaderSettings['scanModifierKey'];
        } else {
            const options = scanInput.options as Record<string, unknown> | undefined;
            if (options?.scanOnPenHover === true || options?.scanOnTouchTap === true || include === '') {
                settings.popupActivationMode = 'hover';
            }
        }
    }
    if (typeof general?.maxResults === 'number') settings.localDictionaryMaxResults = Math.max(1, Math.min(64, general.maxResults));
    settings.yomitanSettingsBackup = value;

    const playAudio = inputs?.hotkeys?.find(hotkey => hotkey.action === 'playAudio' && hotkey.enabled !== false);
    if (playAudio) {
        const key = String(playAudio.key || '').replace(/^Key/, '');
        const modifiers = Array.isArray(playAudio.modifiers) ? playAudio.modifiers.map(v => String(v)) : [];
        settings.shortcuts = { ...settings.shortcuts, playAudio: [...modifiers.map(capitalize), key].filter(Boolean).join('+') };
    }

    const dictionaryPreferences = Array.isArray(profileOptions.dictionaries)
        ? profileOptions.dictionaries
            .map((item, index): DictionaryPreference | null => {
                const record = item as Record<string, unknown>;
                if (typeof record?.name !== 'string') return null;
                return {
                    name: record.name,
                    alias: typeof record.alias === 'string' && record.alias ? record.alias : record.name,
                    enabled: record.enabled !== false,
                    priority: index,
                    allowSecondarySearches: record.allowSecondarySearches === true,
                };
            })
            .filter((item): item is DictionaryPreference => item !== null)
        : [];
    settings.dictionaryPreferences = normalizeDictionaryPreferences(dictionaryPreferences);

    return {
        settings,
        dictionaryNames: settings.dictionaryPreferences.filter(item => item.enabled).map(item => item.name),
    };
}

export function glossaryToText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(glossaryToText).filter(Boolean).join(' ');
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.text === 'string') return record.text;
        if ('content' in record) return glossaryToText(record.content);
        if ('path' in record) return String(record.description || record.alt || '[media]');
        return Object.values(record).map(glossaryToText).filter(Boolean).join(' ');
    }
    return '';
}

export function glossaryToHtml(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return escapeHtml(String(value));
    if (Array.isArray(value)) return value.map(glossaryToHtml).filter(Boolean).join(' ');
    if (typeof value !== 'object') return '';

    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') return escapeHtml(record.text);
    if ('path' in record) return `<span class="jpdb-reader-media-note">${escapeHtml(String(record.description || record.alt || '[media]'))}</span>`;

    const tag = typeof record.tag === 'string' ? record.tag.toLowerCase() : 'span';
    const content = glossaryToHtml(record.content);
    const attrs = renderStructuredAttributes(record);
    if (['div', 'span', 'ol', 'ul', 'li', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'ruby', 'rt', 'rp', 'br'].includes(tag)) {
        return tag === 'br' ? '<br>' : `<${tag}${attrs}>${content}</${tag}>`;
    }
    return content || escapeHtml(glossaryToText(value));
}

async function streamDexieTables(
    file: File,
    handlers: Partial<Record<string, (row: unknown) => Promise<void>>>,
    onTable?: (table: string) => void,
): Promise<void> {
    if (typeof file.stream !== 'function' || typeof TextDecoderStream === 'undefined') {
        await streamDexieTablesFromText(await readBlobText(file), handlers, onTable);
        return;
    }

    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    let state: 'seek-table' | 'seek-rows' | 'rows' = 'seek-table';
    let tableName = '';
    let rowStart = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;

        let progress = true;
        while (progress) {
            progress = false;
            if (state === 'seek-table') {
                const tableIndex = buffer.indexOf('"tableName"');
                if (tableIndex < 0) {
                    buffer = buffer.slice(-32);
                    break;
                }
                const colon = buffer.indexOf(':', tableIndex);
                const quote = colon >= 0 ? buffer.indexOf('"', colon) : -1;
                const end = quote >= 0 ? findJsonStringEnd(buffer, quote) : -1;
                if (end < 0) break;
                tableName = JSON.parse(buffer.slice(quote, end + 1)) as string;
                buffer = buffer.slice(end + 1);
                state = 'seek-rows';
                progress = true;
            }

            if (state === 'seek-rows') {
                const rowsIndex = buffer.indexOf('"rows"');
                if (rowsIndex < 0) {
                    buffer = buffer.slice(-32);
                    break;
                }
                const arrayIndex = buffer.indexOf('[', rowsIndex);
                if (arrayIndex < 0) break;
                buffer = buffer.slice(arrayIndex + 1);
                state = 'rows';
                rowStart = -1;
                depth = 0;
                inString = false;
                escaped = false;
                onTable?.(tableName);
                progress = true;
            }

            if (state === 'rows') {
                const handler = handlers[tableName];
                for (let index = 0; index < buffer.length; index++) {
                    const char = buffer[index];
                    if (inString) {
                        if (escaped) escaped = false;
                        else if (char === '\\') escaped = true;
                        else if (char === '"') inString = false;
                        continue;
                    }
                    if (char === '"') {
                        inString = true;
                        continue;
                    }
                    if (char === '{') {
                        if (depth === 0) rowStart = index;
                        depth++;
                        continue;
                    }
                    if (char === '}') {
                        depth--;
                        if (depth === 0 && rowStart >= 0) {
                            if (handler) await handler(JSON.parse(buffer.slice(rowStart, index + 1)));
                            buffer = buffer.slice(index + 1);
                            index = -1;
                            rowStart = -1;
                            progress = true;
                        }
                        continue;
                    }
                    if (depth === 0 && char === ']') {
                        buffer = buffer.slice(index + 1);
                        state = 'seek-table';
                        tableName = '';
                        progress = true;
                        break;
                    }
                }

                if (!progress) {
                    if (rowStart > 0) {
                        buffer = buffer.slice(rowStart);
                        rowStart = 0;
                    } else if (depth === 0 && buffer.length > 4096) {
                        buffer = buffer.slice(-4096);
                    }
                }
            }
        }
    }
}

async function streamDexieTablesFromText(
    text: string,
    handlers: Partial<Record<string, (row: unknown) => Promise<void>>>,
    onTable?: (table: string) => void,
): Promise<void> {
    let offset = 0;
    while (true) {
        const tableIndex = text.indexOf('"tableName"', offset);
        if (tableIndex < 0) return;
        const colon = text.indexOf(':', tableIndex);
        const quote = colon >= 0 ? text.indexOf('"', colon) : -1;
        const end = quote >= 0 ? findJsonStringEnd(text, quote) : -1;
        if (end < 0) return;

        const tableName = JSON.parse(text.slice(quote, end + 1)) as string;
        const rowsIndex = text.indexOf('"rows"', end);
        const arrayStart = rowsIndex >= 0 ? text.indexOf('[', rowsIndex) : -1;
        if (arrayStart < 0) return;
        onTable?.(tableName);

        const handler = handlers[tableName];
        let depth = 0;
        let rowStart = -1;
        let inString = false;
        let escaped = false;
        for (let index = arrayStart + 1; index < text.length; index++) {
            const char = text[index];
            if (inString) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') inString = false;
                continue;
            }
            if (char === '"') {
                inString = true;
                continue;
            }
            if (char === '{') {
                if (depth === 0) rowStart = index;
                depth++;
                continue;
            }
            if (char === '}') {
                depth--;
                if (depth === 0 && rowStart >= 0 && handler) {
                    await handler(JSON.parse(text.slice(rowStart, index + 1)));
                }
                continue;
            }
            if (depth === 0 && char === ']') {
                offset = index + 1;
                break;
            }
        }
    }
}

function normalizeZipTermRow(row: unknown, dictionary: string): YomitanTermEntry | null {
    if (!Array.isArray(row)) return null;
    const [expression, reading, definitionTags, rules, score, glossary, sequence, termTags] = row;
    if (typeof expression !== 'string') return null;
    return {
        expression,
        reading: typeof reading === 'string' && reading ? reading : expression,
        definitionTags: typeof definitionTags === 'string' ? definitionTags : '',
        rules: typeof rules === 'string' ? rules : '',
        score: typeof score === 'number' ? score : 0,
        glossary: Array.isArray(glossary) ? glossary : [],
        sequence: typeof sequence === 'number' ? sequence : undefined,
        termTags: typeof termTags === 'string' ? termTags : '',
        dictionary,
    };
}

function normalizeZipKanjiRow(row: unknown, dictionary: string, version: number): YomitanKanjiEntry | null {
    if (!Array.isArray(row)) return null;
    const [character, onyomi, kunyomi, tags, meaningsOrFirst, stats] = row;
    if (typeof character !== 'string') return null;
    const meanings = version === 1 ? row.slice(4) : meaningsOrFirst;
    return {
        character,
        onyomi: splitTags(onyomi),
        kunyomi: splitTags(kunyomi),
        tags: splitTags(tags),
        meanings: Array.isArray(meanings) ? meanings.map(String) : [],
        stats,
        dictionary,
    };
}

function normalizeZipTermMetaRow(row: unknown, dictionary: string): YomitanMetaEntry | null {
    if (!Array.isArray(row)) return null;
    const [expression, mode, data] = row;
    return typeof expression === 'string' && typeof mode === 'string' ? { expression, mode, data, dictionary } : null;
}

function normalizeZipKanjiMetaRow(row: unknown, dictionary: string): YomitanMetaEntry | null {
    if (!Array.isArray(row)) return null;
    const [character, mode, data] = row;
    return typeof character === 'string' && typeof mode === 'string' ? { character, mode, data, dictionary } : null;
}

function normalizeDexieTermRow(row: unknown): YomitanTermEntry | null {
    const candidate = unwrapDexieRow(row);
    if (!candidate || typeof candidate !== 'object') return null;
    const record = candidate as Partial<YomitanTermEntry>;
    if (typeof record.expression !== 'string' || typeof record.dictionary !== 'string') return null;
    return {
        expression: record.expression,
        reading: typeof record.reading === 'string' && record.reading ? record.reading : record.expression,
        definitionTags: typeof record.definitionTags === 'string' ? record.definitionTags : '',
        rules: typeof record.rules === 'string' ? record.rules : '',
        score: typeof record.score === 'number' ? record.score : 0,
        glossary: Array.isArray(record.glossary) ? record.glossary : [],
        sequence: typeof record.sequence === 'number' ? record.sequence : undefined,
        termTags: typeof record.termTags === 'string' ? record.termTags : '',
        dictionary: record.dictionary,
    };
}

function normalizeDexieKanjiRow(row: unknown): YomitanKanjiEntry | null {
    const candidate = unwrapDexieRow(row);
    if (!candidate || typeof candidate !== 'object') return null;
    const record = candidate as Partial<YomitanKanjiEntry>;
    if (typeof record.character !== 'string' || typeof record.dictionary !== 'string') return null;
    return {
        character: record.character,
        onyomi: Array.isArray(record.onyomi) ? record.onyomi.map(String) : splitTags(record.onyomi),
        kunyomi: Array.isArray(record.kunyomi) ? record.kunyomi.map(String) : splitTags(record.kunyomi),
        tags: Array.isArray(record.tags) ? record.tags.map(String) : splitTags(record.tags),
        meanings: Array.isArray(record.meanings) ? record.meanings.map(String) : [],
        stats: record.stats,
        dictionary: record.dictionary,
    };
}

function normalizeDexieTermMetaRow(row: unknown): YomitanMetaEntry | null {
    const candidate = unwrapDexieRow(row);
    if (!candidate || typeof candidate !== 'object') return null;
    const record = candidate as Partial<YomitanMetaEntry>;
    return typeof record.expression === 'string' && typeof record.mode === 'string' && typeof record.dictionary === 'string'
        ? { expression: record.expression, mode: record.mode, data: record.data, dictionary: record.dictionary }
        : null;
}

function normalizeDexieKanjiMetaRow(row: unknown): YomitanMetaEntry | null {
    const candidate = unwrapDexieRow(row);
    if (!candidate || typeof candidate !== 'object') return null;
    const record = candidate as Partial<YomitanMetaEntry>;
    return typeof record.character === 'string' && typeof record.mode === 'string' && typeof record.dictionary === 'string'
        ? { character: record.character, mode: record.mode, data: record.data, dictionary: record.dictionary }
        : null;
}

function normalizeDexieDictionaryRow(row: unknown): YomitanDictionaryInfo | null {
    const candidate = unwrapDexieRow(row);
    if (!candidate || typeof candidate !== 'object') return null;
    const record = candidate as Partial<YomitanDictionaryInfo> & { title?: unknown; revision?: unknown };
    if (typeof record.title !== 'string') return null;
    return {
        title: record.title,
        alias: typeof record.alias === 'string' && record.alias ? record.alias : record.title,
        enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
        priority: Number.isFinite(Number(record.priority)) ? Number(record.priority) : 0,
        counts: record.counts as Record<string, unknown> | undefined,
        styles: typeof record.styles === 'string' ? record.styles : '',
        importDate: typeof record.importDate === 'number' ? record.importDate : undefined,
    };
}

function unwrapDexieRow(row: unknown): unknown {
    if (row && typeof row === 'object' && '$' in row) {
        const value = (row as { $?: unknown }).$;
        return Array.isArray(value) ? value.find(item => item && typeof item === 'object' && !Array.isArray(item)) : value;
    }
    return row;
}

function isReaderDictionaryExport(value: unknown): value is {
    dictionaries?: YomitanDictionaryInfo[];
    entries?: YomitanTermEntry[];
    terms?: YomitanTermEntry[];
    kanji?: YomitanKanjiEntry[];
    termMeta?: YomitanMetaEntry[];
    kanjiMeta?: YomitanMetaEntry[];
} {
    return !!value
        && typeof value === 'object'
        && ['kotoba-yomitan-dictionaries', 'jpdb-reader-yomitan-dictionaries'].includes((value as { formatName?: string }).formatName ?? '')
        && (
            Array.isArray((value as { entries?: unknown }).entries)
            || Array.isArray((value as { terms?: unknown }).terms)
            || Array.isArray((value as { kanji?: unknown }).kanji)
        );
}

function getYomitanProfileOptions(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    const options = (value as { options?: { profiles?: Array<{ options?: Record<string, unknown> }> } }).options;
    return options?.profiles?.[0]?.options ?? null;
}

function renderStructuredAttributes(record: Record<string, unknown>): string {
    const attrs: string[] = [];
    for (const key of ['data', 'class', 'title', 'lang']) {
        const value = record[key];
        if (typeof value === 'string') attrs.push(` ${key === 'class' ? 'class' : key}="${escapeHtml(value)}"`);
    }
    for (const [key, value] of Object.entries(record)) {
        if (key.startsWith('data-') && typeof value === 'string') attrs.push(` ${key}="${escapeHtml(value)}"`);
    }
    return attrs.join('');
}

function dictionaryRank(preferences: DictionaryPreference[]): Map<string, DictionaryPreference> {
    return new Map(normalizeDictionaryPreferences(preferences).map(item => [item.name, item]));
}

function dictionaryEnabled(dictionary: string, rank: Map<string, DictionaryPreference>): boolean {
    return rank.get(dictionary)?.enabled ?? true;
}

function dictionaryPriority(dictionary: string, rank: Map<string, DictionaryPreference>): number {
    return rank.get(dictionary)?.priority ?? 9999;
}

function splitTags(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}

function isKanji(value: string): boolean {
    const code = value.codePointAt(0) ?? 0;
    return code >= 0x3400 && code <= 0x9fff;
}

function ensureStore(db: IDBDatabase, tx: IDBTransaction, name: StoreName): IDBObjectStore {
    return db.objectStoreNames.contains(name)
        ? tx.objectStore(name)
        : db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
}

function ensureIndex(store: IDBObjectStore, name: string, keyPath: string): void {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath);
}

function existingStores(db: IDBDatabase, names: StoreName[]): StoreName[] {
    return names.filter(name => db.objectStoreNames.contains(name));
}

function deleteByDictionary(db: IDBDatabase, storeName: StoreName, dictionary: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const index = tx.objectStore(storeName).index('dictionary');
        const request = index.openCursor(IDBKeyRange.only(dictionary));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            cursor.delete();
            cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function findJsonStringEnd(value: string, quoteIndex: number): number {
    let escaped = false;
    for (let index = quoteIndex + 1; index < value.length; index++) {
        const char = value[index];
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') return index;
    }
    return -1;
}

function readBlobText(blob: Blob): Promise<string> {
    if (typeof blob.text === 'function') return blob.text();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
