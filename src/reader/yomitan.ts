import JSZip from 'jszip';
import { deinflectJapaneseTerm, termRulesMatch, type DeinflectedTerm } from './deinflect';
import { Logger } from './logger';
import { normalizeAudioSource, normalizeDictionaryPreferences } from './settings';
import type { DictionaryPreference, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';
import { glossaryToHtml, glossaryToText, renderDictionaryScopedStyles } from './yomitan-glossary';
import {
    compareMetaEntries,
    dictionaryEnabled,
    dictionaryPriority,
    dictionaryRank,
    nonOverlappingMatches,
} from './yomitan-ranking';
import type {
    DictionarySummary,
    EntryStoreName,
    ImportSummary,
    StoreName,
    YomitanDictionaryInfo,
    YomitanKanjiEntry,
    YomitanMetaEntry,
    YomitanSettingsImport,
    YomitanTermEntry,
    YomitanTermMatch,
} from './yomitan-types';

const DB_NAME = 'jpdb-popup-reader-yomitan';
const DB_VERSION = 2;
const DEXIE_IMPORT_BATCH_SIZE = 5000;
const DEXIE_PROGRESS_INTERVAL = DEXIE_IMPORT_BATCH_SIZE;
const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const JAPANESE_CHARACTER_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const log = Logger.scope('Yomitan');

export type {
    DictionarySummary,
    ImportSummary,
    YomitanDictionaryInfo,
    YomitanKanjiEntry,
    YomitanMetaEntry,
    YomitanSettingsImport,
    YomitanTermEntry,
    YomitanTermMatch,
} from './yomitan-types';
export { glossaryToHtml, glossaryToText, renderDictionaryScopedStyles } from './yomitan-glossary';

export class YomitanDictionaryStore {
    private dbPromise?: Promise<IDBDatabase>;

    async lookup(expression: string, reading: string, limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanTermEntry[]> {
        const done = log.time('Term lookup', { expression, reading, limit, dictionaries: preferences.length });
        try {
            const db = await this.db();
            const entries = await this.getByIndex<YomitanTermEntry>(db, 'terms', 'expression', expression, Math.max(limit * 40, 500));
            if (reading && reading !== expression) {
                const byReading = await this.getByIndex<YomitanTermEntry>(db, 'terms', 'reading', reading, Math.max(limit * 20, 250));
                entries.push(...byReading);
            }

            const rank = dictionaryRank(preferences);
            const seen = new Set<string>();
            const results = entries
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
            log.debug('Term lookup completed', { expression, reading, candidates: entries.length, results: results.length });
            return results;
        } catch (error) {
            log.warn('Term lookup failed', { expression, reading, error });
            throw error;
        } finally {
            done();
        }
    }

    async lookupKanji(text: string, limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanKanjiEntry[]> {
        const done = log.time('Kanji lookup', { length: text.length, limit, dictionaries: preferences.length });
        try {
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            const characters = [...new Set(Array.from(text).filter(isKanji))];
            const entries: YomitanKanjiEntry[] = [];
            for (const character of characters) {
                entries.push(...await this.getByIndex<YomitanKanjiEntry>(db, 'kanji', 'character', character, limit));
            }
            const results = entries
                .filter(entry => dictionaryEnabled(entry.dictionary, rank))
                .sort((a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank))
                .slice(0, limit);
            log.debug('Kanji lookup completed', { characters, candidates: entries.length, results: results.length });
            return results;
        } catch (error) {
            log.warn('Kanji lookup failed', { length: text.length, error });
            throw error;
        } finally {
            done();
        }
    }

    async lookupTermMeta(expression: string, limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanMetaEntry[]> {
        const done = log.time('Term metadata lookup', { expression, limit, dictionaries: preferences.length });
        try {
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            const entries = await this.getByIndex<YomitanMetaEntry>(db, 'termMeta', 'expression', expression, Math.max(limit * 8, 80));
            const results = entries
                .filter(entry => dictionaryEnabled(entry.dictionary, rank))
                .sort((a, b) => compareMetaEntries(a, b, rank))
                .slice(0, limit);
            log.debug('Term metadata lookup completed', { expression, candidates: entries.length, results: results.length });
            return results;
        } catch (error) {
            log.warn('Term metadata lookup failed', { expression, error });
            throw error;
        } finally {
            done();
        }
    }

    async lookupSimilarTermsByKanji(character: string, limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanTermEntry[]> {
        const done = log.time('Similar terms by kanji lookup', { character, limit, dictionaries: preferences.length });
        try {
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            const entries: YomitanTermEntry[] = [];
            const seen = new Set<string>();
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction('terms', 'readonly');
                const request = tx.objectStore('terms').openCursor();
                request.onerror = () => reject(request.error ?? new Error('Could not search local dictionaries.'));
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor || entries.length >= Math.max(limit * 8, 80)) {
                        resolve();
                        return;
                    }
                    const entry = cursor.value as YomitanTermEntry;
                    if (entry.expression?.includes(character) && dictionaryEnabled(entry.dictionary, rank)) {
                        const key = `${entry.expression}\n${entry.reading}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            entries.push(entry);
                        }
                    }
                    cursor.continue();
                };
            });

            const results = entries
                .sort((a, b) =>
                    dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank)
                    || (b.score ?? 0) - (a.score ?? 0)
                    || a.expression.length - b.expression.length,
                )
                .slice(0, limit);
            log.debug('Similar terms by kanji lookup completed', { character, candidates: entries.length, results: results.length });
            return results;
        } catch (error) {
            log.warn('Similar terms by kanji lookup failed', { character, error });
            throw error;
        } finally {
            done();
        }
    }

    async findTermMatches(text: string, limit = 32, preferences: DictionaryPreference[] = []): Promise<YomitanTermMatch[]> {
        const done = log.time('Inline term match search', { length: text.length, limit, dictionaries: preferences.length });
        const source = text.slice(0, 240);
        if (!source.trim()) {
            done();
            return [];
        }

        const candidates = new Map<string, Array<{ start: number; end: number; surface: string; deinflected: DeinflectedTerm }>>();
        const maxLength = Math.min(18, source.length);
        for (let start = 0; start < source.length; start++) {
            if (!JAPANESE_CHARACTER_RE.test(source[start])) continue;
            for (let length = Math.min(maxLength, source.length - start); length > 0; length--) {
                const surface = source.slice(start, start + length);
                if (!JAPANESE_RE.test(surface) || /\s/.test(surface)) continue;
                for (const deinflected of deinflectJapaneseTerm(surface)) {
                    if (!JAPANESE_RE.test(deinflected.term)) continue;
                    const positions = candidates.get(deinflected.term) ?? [];
                    positions.push({ start, end: start + length, surface, deinflected });
                    candidates.set(deinflected.term, positions);
                }
            }
        }
        if (!candidates.size) {
            log.debug('Inline term match search skipped', { reason: 'no-candidates', length: source.length });
            done();
            return [];
        }

        try {
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            const matches = await new Promise<YomitanTermMatch[]>((resolve, reject) => {
                const tx = db.transaction('terms', 'readonly');
                const store = tx.objectStore('terms');
                const expressionIndex = store.index('expression');
                const readingIndex = store.index('reading');
                const results: YomitanTermMatch[] = [];
                const expressions = Array.from(candidates.keys())
                    .sort((a, b) => b.length - a.length || a.localeCompare(b));
                let pending = expressions.length * 2;

                const finish = () => {
                    if (--pending <= 0) resolve(results);
                };

                const addMatches = (expression: string, foundEntries: YomitanTermEntry[]) => {
                    const seen = new Set<string>();
                    const entries = foundEntries
                        .filter(item => {
                            const key = `${item.id ?? ''}\n${item.dictionary}\n${item.expression}\n${item.reading}\n${item.sequence ?? ''}`;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return dictionaryEnabled(item.dictionary, rank);
                        })
                        .sort((a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank) || (b.score ?? 0) - (a.score ?? 0));
                    if (!entries.length) return;
                    for (const position of candidates.get(expression) ?? []) {
                        const entry = entries.find(item => termRulesMatch(item.rules, position.deinflected.rules));
                        if (entry) results.push({
                            entry,
                            ...position,
                            deinflected: position.deinflected.depth > 0 ? position.deinflected : undefined,
                        });
                    }
                };

                for (const expression of expressions) {
                    const expressionRequest = expressionIndex.getAll(IDBKeyRange.only(expression), 8);
                    expressionRequest.onsuccess = () => {
                        addMatches(expression, expressionRequest.result as YomitanTermEntry[]);
                        finish();
                    };
                    expressionRequest.onerror = () => reject(expressionRequest.error);

                    const readingRequest = readingIndex.getAll(IDBKeyRange.only(expression), 8);
                    readingRequest.onsuccess = () => {
                        addMatches(expression, readingRequest.result as YomitanTermEntry[]);
                        finish();
                    };
                    readingRequest.onerror = () => reject(readingRequest.error);
                }

                tx.onerror = () => reject(tx.error);
            });

            const results = nonOverlappingMatches(matches, limit);
            log.debug('Inline term match search completed', {
                length: source.length,
                candidates: candidates.size,
                overlappingMatches: matches.length,
                results: results.length,
            });
            return results;
        } catch (error) {
            log.warn('Inline term match search failed', { length: source.length, candidates: candidates.size, error });
            throw error;
        } finally {
            done();
        }
    }

    async summary(): Promise<DictionarySummary> {
        const done = log.time('Dictionary summary');
        try {
            const db = await this.db();
            const [dictionaries, terms, kanji, termMeta, kanjiMeta] = await Promise.all([
                this.getAllDictionaryInfo(db),
                this.countStore(db, 'terms'),
                this.countStore(db, 'kanji'),
                this.countStore(db, 'termMeta'),
                this.countStore(db, 'kanjiMeta'),
            ]);
            const summary = { dictionaries, terms, kanji, termMeta, kanjiMeta };
            log.debug('Dictionary summary loaded', {
                dictionaries: dictionaries.length,
                terms,
                kanji,
                termMeta,
                kanjiMeta,
            });
            return summary;
        } catch (error) {
            log.warn('Dictionary summary failed', { error });
            throw error;
        } finally {
            done();
        }
    }

    async countEntries(): Promise<number> {
        const summary = await this.summary();
        return summary.terms + summary.kanji + summary.termMeta + summary.kanjiMeta;
    }

    async importFile(file: File, onProgress?: (message: string) => void, sourceUrl = ''): Promise<ImportSummary> {
        const done = log.time('Dictionary file import', fileSummary(file, sourceUrl));
        try {
            log.info('Dictionary file import started', fileSummary(file, sourceUrl));
            const summary = /\.zip$/i.test(file.name)
                ? await this.importZip(file, onProgress, sourceUrl)
                : await this.importJson(file, onProgress);
            log.info('Dictionary file import completed', summary);
            return summary;
        } catch (error) {
            log.warn('Dictionary file import failed', { ...fileSummary(file, sourceUrl), error });
            throw error;
        } finally {
            done();
        }
    }

    async importFromUrl(url: string, filename = filenameFromUrl(url), onProgress?: (message: string) => void): Promise<ImportSummary> {
        log.info('Dictionary URL import started', { filename, host: safeHost(url) });
        onProgress?.(`Downloading ${filename}...`);
        const blob = await requestBlob(url, onProgress);
        const file = new File([blob], filename, { type: blob.type || 'application/zip' });
        const summary = await this.importFile(file, onProgress, url);
        log.info('Dictionary URL import completed', { filename, host: safeHost(url), ...summary });
        return summary;
    }

    async importZip(file: File, onProgress?: (message: string) => void, sourceUrl = ''): Promise<ImportSummary> {
        log.debug('ZIP dictionary import started', fileSummary(file, sourceUrl));
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
            styles: await readZipText(zip, 'styles.css').catch(() => ''),
            revision: typeof index.revision === 'string' ? index.revision : undefined,
            downloadUrl: sourceUrl || undefined,
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
        log.info('ZIP dictionary import parsed', summary);
        return summary;
    }

    async importJson(file: File, onProgress?: (message: string) => void): Promise<ImportSummary> {
        log.debug('JSON dictionary import started', fileSummary(file));
        const head = await readBlobText(file.slice(0, 4096));
        if (head.includes('"formatName":"dexie"') || head.includes('"formatName": "dexie"')) {
            log.debug('Detected Yomitan Dexie dictionary export', { name: file.name, size: file.size });
            return this.importDexieJson(file, onProgress);
        }

        const json = JSON.parse(await readBlobText(file)) as unknown;
        if (isReaderDictionaryExport(json)) {
            log.debug('Detected Yomu dictionary export', { name: file.name, size: file.size });
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
            const summary = {
                dictionaries: dictionaryNames,
                entries: (json.terms ?? json.entries ?? []).length + (json.kanji ?? []).length + (json.termMeta ?? []).length + (json.kanjiMeta ?? []).length,
                terms: (json.terms ?? json.entries ?? []).length,
                kanji: (json.kanji ?? []).length,
                termMeta: (json.termMeta ?? []).length,
                kanjiMeta: (json.kanjiMeta ?? []).length,
            };
            log.info('JSON dictionary import parsed', summary);
            return summary;
        }

        throw new Error('Unsupported dictionary JSON. Import a Yomitan Dexie export, a Yomitan dictionary ZIP, or this reader export.');
    }

    async importDexieJson(file: File, onProgress?: (message: string) => void): Promise<ImportSummary> {
        log.debug('Dexie dictionary import started', fileSummary(file));
        onProgress?.('Streaming Yomitan dictionary export...');
        await this.clear();
        const rowCounts: Partial<Record<string, number>> = await readDexieTableRowCounts(file).catch(() => ({}));
        const totalRows = importEntryStores().reduce((total, store) => total + (rowCounts[store] ?? 0), 0);
        log.debug('Dexie dictionary row counts read', { totalRows, rowCounts });
        if (totalRows > 0) onProgress?.(`Preparing to import ${totalRows.toLocaleString()} dictionary records...`);
        const dictionaries = new Set<string>();
        const summary: ImportSummary = { dictionaries: [], entries: 0, terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
        const batches: Record<EntryStoreName, unknown[]> = { terms: [], kanji: [], termMeta: [], kanjiMeta: [] };
        const progressAt: Record<EntryStoreName, number> = { terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };

        const reportProgress = (store?: EntryStoreName, force = false) => {
            if (!store) {
                if (totalRows > 0) onProgress?.(`Imported ${summary.entries.toLocaleString()} / ${totalRows.toLocaleString()} dictionary records...`);
                else onProgress?.(`Imported ${summary.entries.toLocaleString()} dictionary records...`);
                return;
            }

            const imported = summary[store];
            const tableTotal = rowCounts[store] ?? 0;
            if (!force && imported < progressAt[store]) return;
            progressAt[store] = imported + DEXIE_PROGRESS_INTERVAL;
            if (tableTotal > 0 && totalRows > 0) {
                onProgress?.(`Importing ${store}: ${imported.toLocaleString()} / ${tableTotal.toLocaleString()} entries (${summary.entries.toLocaleString()} / ${totalRows.toLocaleString()} total)...`);
                return;
            }
            onProgress?.(`Importing ${store}: ${imported.toLocaleString()} entries...`);
        };

        const flush = async (store: EntryStoreName, forceProgress = false) => {
            const batch = batches[store];
            if (!batch.length) return;
            await this.addToStore(store, batch);
            batches[store] = [];
            reportProgress(store, forceProgress);
        };
        const addBatch = async (store: EntryStoreName, entry: unknown) => {
            batches[store].push(entry);
            summary[store]++;
            summary.entries++;
            const dictionary = (entry as { dictionary?: unknown }).dictionary;
            if (typeof dictionary === 'string') dictionaries.add(dictionary);
            if (batches[store].length >= DEXIE_IMPORT_BATCH_SIZE) {
                await flush(store);
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
                if (entry) await addBatch('terms', entry);
            },
            kanji: async row => {
                const entry = normalizeDexieKanjiRow(row);
                if (entry) await addBatch('kanji', entry);
            },
            termMeta: async row => {
                const entry = normalizeDexieTermMetaRow(row);
                if (entry) await addBatch('termMeta', entry);
            },
            kanjiMeta: async row => {
                const entry = normalizeDexieKanjiMetaRow(row);
                if (entry) await addBatch('kanjiMeta', entry);
            },
        }, table => {
            if (isEntryStoreName(table)) {
                reportProgress(table, true);
                return;
            }
            onProgress?.(`Importing Yomitan ${table}...`);
        });

        await Promise.all(importEntryStores().map(store => flush(store, true)));
        reportProgress(undefined, true);
        summary.dictionaries = [...dictionaries];
        log.info('Dexie dictionary import parsed', summary);
        return summary;
    }

    async exportJson(): Promise<Blob> {
        const done = log.time('Dictionary export');
        try {
            const db = await this.db();
            const [dictionaries, terms, kanji, termMeta, kanjiMeta] = await Promise.all([
                this.getAllFromStore<YomitanDictionaryInfo>(db, 'dictionaryInfo'),
                this.getAllFromStore<YomitanTermEntry>(db, 'terms'),
                this.getAllFromStore<YomitanKanjiEntry>(db, 'kanji'),
                this.getAllFromStore<YomitanMetaEntry>(db, 'termMeta'),
                this.getAllFromStore<YomitanMetaEntry>(db, 'kanjiMeta'),
            ]);
            log.info('Dictionary export prepared', {
                dictionaries: dictionaries.length,
                terms: terms.length,
                kanji: kanji.length,
                termMeta: termMeta.length,
                kanjiMeta: kanjiMeta.length,
            });
            return new Blob([JSON.stringify({
                formatName: 'yomu-yomitan-dictionaries',
                formatVersion: 2,
                exportedAt: new Date().toISOString(),
                dictionaries,
                terms,
                kanji,
                termMeta,
                kanjiMeta,
            })], { type: 'application/json' });
        } catch (error) {
            log.warn('Dictionary export failed', { error });
            throw error;
        } finally {
            done();
        }
    }

    async dictionaryStyleCss(preferences: DictionaryPreference[] = []): Promise<string> {
        try {
            const db = await this.db();
            const dictionaries = await this.getAllDictionaryInfo(db);
            const css = renderDictionaryScopedStyles(dictionaries, preferences);
            log.debug('Dictionary stylesheet rendered', { bytes: css.length, dictionaries: dictionaries.length, preferences: preferences.length });
            return css;
        } catch (error) {
            log.warn('Dictionary stylesheet render failed', { error });
            throw error;
        }
    }

    async clear(): Promise<void> {
        const done = log.time('Dictionary store clear');
        try {
            const db = await this.db();
            await new Promise<void>((resolve, reject) => {
                const stores = existingStores(db, ['terms', 'kanji', 'termMeta', 'kanjiMeta', 'dictionaryInfo']);
                const tx = db.transaction(stores, 'readwrite');
                for (const store of stores) tx.objectStore(store).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            log.info('Dictionary store cleared');
        } catch (error) {
            log.warn('Dictionary store clear failed', { error });
            throw error;
        } finally {
            done();
        }
    }

    async deleteDictionary(dictionary: string): Promise<void> {
        const done = log.time('Dictionary delete', { dictionary });
        try {
            const db = await this.db();
            const stores = existingStores(db, ['terms', 'kanji', 'termMeta', 'kanjiMeta']);
            await Promise.all(stores.map(store => deleteByDictionary(db, store, dictionary)));
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction('dictionaryInfo', 'readwrite');
                tx.objectStore('dictionaryInfo').delete(dictionary);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            log.info('Dictionary deleted', { dictionary });
        } catch (error) {
            log.warn('Dictionary delete failed', { dictionary, error });
            throw error;
        } finally {
            done();
        }
    }

    private async putDictionaryInfo(info: YomitanDictionaryInfo): Promise<void> {
        await this.addToStore('dictionaryInfo', [info], true);
    }

    private async addToStore<T>(storeName: StoreName, entries: T[], put = false): Promise<void> {
        if (!entries.length) return;
        const db = await this.db();
        for (let start = 0; start < entries.length; start += DEXIE_IMPORT_BATCH_SIZE) {
            await this.addStoreChunk(db, storeName, entries.slice(start, start + DEXIE_IMPORT_BATCH_SIZE), put);
        }
    }

    private addStoreChunk<T>(db: IDBDatabase, storeName: StoreName, entries: T[], put: boolean): Promise<void> {
        return new Promise<void>((resolve, reject) => {
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
            log.debug('Opening dictionary database', { name: DB_NAME, version: DB_VERSION });
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = event => {
                const db = request.result;
                const tx = request.transaction!;
                log.info('Upgrading dictionary database', { oldVersion: event.oldVersion, newVersion: DB_VERSION });
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
            request.onsuccess = () => {
                log.debug('Dictionary database opened', { name: DB_NAME, version: request.result.version });
                resolve(request.result);
            };
            request.onerror = () => {
                log.warn('Dictionary database open failed', { error: request.error });
                reject(request.error);
            };
        });
        return this.dbPromise;
    }
}

export function parseYomitanSettingsExport(value: unknown): YomitanSettingsImport {
    const done = log.time('Yomitan settings export parse');
    const profileOptions = getYomitanProfileOptions(value);
    if (!profileOptions) {
        done();
        log.warn('Yomitan settings export rejected', { reason: 'missing-profile-options' });
        throw new Error('This does not look like a Yomitan settings export.');
    }

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
            settings.lookupOnHover = true;
            settings.shortcuts = { ...settings.shortcuts, hoverLookup: capitalize(modifier) };
        } else {
            const options = scanInput.options as Record<string, unknown> | undefined;
            if (options?.scanOnPenHover === true || options?.scanOnTouchTap === true || include === '') {
                settings.lookupOnHover = true;
                settings.shortcuts = { ...settings.shortcuts, hoverLookup: '' };
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

    const result = {
        settings,
        dictionaryNames: settings.dictionaryPreferences.filter(item => item.enabled).map(item => item.name),
    };
    log.info('Yomitan settings export parsed', {
        dictionaryPreferences: settings.dictionaryPreferences.length,
        enabledDictionaries: result.dictionaryNames.length,
        importedAudioSources: settings.audioSources?.length ?? 0,
    });
    done();
    return result;
}

function importEntryStores(): EntryStoreName[] {
    return ['terms', 'kanji', 'termMeta', 'kanjiMeta'];
}

function isEntryStoreName(value: string): value is EntryStoreName {
    return value === 'terms' || value === 'kanji' || value === 'termMeta' || value === 'kanjiMeta';
}

async function readDexieTableRowCounts(file: File): Promise<Partial<Record<string, number>>> {
    const head = await readBlobText(file.slice(0, Math.min(file.size, 1024 * 1024)));
    const tablesIndex = head.indexOf('"tables"');
    if (tablesIndex < 0) return {};
    const arrayStart = head.indexOf('[', tablesIndex);
    if (arrayStart < 0) return {};
    const arrayEnd = findJsonArrayEnd(head, arrayStart);
    if (arrayEnd < 0) return {};

    const tables = JSON.parse(head.slice(arrayStart, arrayEnd + 1)) as unknown[];
    const counts: Partial<Record<string, number>> = {};
    for (const table of tables) {
        if (!table || typeof table !== 'object') continue;
        const record = table as Record<string, unknown>;
        if (typeof record.name === 'string' && typeof record.rowCount === 'number') {
            counts[record.name] = record.rowCount;
        }
    }
    return counts;
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

function findJsonArrayEnd(text: string, start: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index++) {
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
        if (char === '[') {
            depth++;
            continue;
        }
        if (char === ']') {
            depth--;
            if (depth === 0) return index;
        }
    }
    return -1;
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
        revision: typeof record.revision === 'string' ? record.revision : undefined,
        downloadUrl: typeof record.downloadUrl === 'string' ? record.downloadUrl : undefined,
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
        && ['yomu-yomitan-dictionaries', 'kotoba-yomitan-dictionaries', 'jpdb-reader-yomitan-dictionaries'].includes((value as { formatName?: string }).formatName ?? '')
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

function filenameFromUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const pathName = parsed.pathname.split('/').filter(Boolean).pop();
        return pathName && /\.zip$/i.test(pathName) ? decodeURIComponent(pathName) : 'dictionary.zip';
    } catch {
        return 'dictionary.zip';
    }
}

function fileSummary(file: File, sourceUrl = ''): Record<string, unknown> {
    return {
        name: file.name,
        size: file.size,
        type: file.type,
        sourceHost: sourceUrl ? safeHost(sourceUrl) : '',
    };
}

function safeHost(url: string): string {
    try {
        return new URL(url, location.href).host;
    } catch {
        return '';
    }
}

async function requestBlob(url: string, onProgress?: (message: string) => void): Promise<Blob> {
    const done = log.time('Dictionary download', { host: safeHost(url) });
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        log.debug('Dictionary download using userscript request', { host: safeHost(url) });
        return new Promise((resolve, reject) => {
            const handleLoad = (response: UserscriptHttpResponse) => {
                if (response.response instanceof Blob && (response.status === 0 || (response.status >= 200 && response.status < 300))) {
                    log.info('Dictionary download completed', { host: safeHost(url), status: response.status, size: response.response.size });
                    done();
                    resolve(response.response);
                    return;
                }
                if (response.status < 200 || response.status >= 300) {
                    log.warn('Dictionary download returned HTTP error', { host: safeHost(url), status: response.status });
                    done();
                    reject(new Error(`Dictionary download failed (${response.status}).`));
                    return;
                }
                log.warn('Dictionary download returned unexpected payload', { host: safeHost(url), status: response.status });
                done();
                reject(new Error('Dictionary download did not return a ZIP file.'));
            };
            const result = userscriptRequest({
                method: 'GET',
                url,
                headers: { accept: 'application/zip,application/octet-stream,*/*' },
                responseType: 'blob',
                timeout: 120000,
                onprogress: event => {
                    if (event.lengthComputable && event.total > 0) {
                        onProgress?.(`Downloading dictionary ${Math.round((event.loaded / event.total) * 100)}%...`);
                    }
                },
                onload: handleLoad,
                onerror: () => {
                    log.warn('Dictionary download failed', { host: safeHost(url) });
                    done();
                    reject(new Error('Dictionary download failed.'));
                },
                ontimeout: () => {
                    log.warn('Dictionary download timed out', { host: safeHost(url) });
                    done();
                    reject(new Error('Dictionary download timed out.'));
                },
            });
            if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
                (result as Promise<UserscriptHttpResponse>).then(handleLoad, () => {
                    log.warn('Dictionary download failed', { host: safeHost(url) });
                    done();
                    reject(new Error('Dictionary download failed.'));
                });
            }
        });
    }

    let response: Response;
    try {
        const downloadUrl = dictionaryDownloadUrl(url);
        log.debug('Dictionary download using fetch', { host: safeHost(url), proxied: downloadUrl !== url });
        response = await fetch(downloadUrl, { credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer' });
    } catch (error) {
        log.warn('Dictionary download fetch failed', { host: safeHost(url), error });
        done();
        throw new Error('Dictionary download failed. Reinstall or update the userscript so its userscript request grant is active, then try again.');
    }
    if (!response.ok) {
        log.warn('Dictionary download returned HTTP error', { host: safeHost(url), status: response.status });
        done();
        throw new Error(`Dictionary download failed (${response.status}).`);
    }
    const blob = await response.blob();
    log.info('Dictionary download completed', { host: safeHost(url), status: response.status, size: blob.size });
    done();
    return blob;
}

function dictionaryDownloadUrl(url: string): string {
    if (!isLoopbackPage()) return url;
    try {
        const target = new URL(url, location.href);
        const current = new URL(location.href);
        if (target.origin === current.origin) return target.href;
        return `/__jpdb-reader-dictionary-proxy?url=${encodeURIComponent(target.href)}`;
    } catch {
        return url;
    }
}

function isLoopbackPage(): boolean {
    return typeof location !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
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

async function readZipText(zip: JSZip, filename: string): Promise<string> {
    const file = zip.file(filename);
    return file ? await file.async('string') : '';
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
