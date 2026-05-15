import JSZip from 'jszip';
import { deinflectJapaneseTerm, termRulesMatch, type DeinflectedTerm } from './deinflect';
import { Logger } from './logger';
import { normalizeAudioSource, normalizeDictionaryPreferences } from './settings';
import type { DictionaryPreference, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';
import { readBlobText, readDexieTableRowCounts, streamDexieTables } from './yomitan-dexie-stream';
import { glossaryToHtml, glossaryToText, renderDictionaryScopedStyles } from './yomitan-glossary';
import {
    compareMetaEntries,
    dictionaryEnabled,
    dictionaryPriority,
    dictionaryRank,
    extractFrequency,
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
const DB_DELETE_BLOCKED_TIMEOUT_MS = 12000;
const DB_FACTORY_RESET_DELETE_TIMEOUT_MS = 2500;
const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const JAPANESE_CHARACTER_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const log = Logger.scope('Yomitan');

interface TermMatchCandidatePosition {
    start: number;
    end: number;
    surface: string;
    deinflected: DeinflectedTerm;
}

type TermMatchCandidates = Map<string, TermMatchCandidatePosition[]>;

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
export { parseYomitanSettingsExport } from './yomitan-settings-import';

interface ReaderDictionaryExport {
    dictionaries?: YomitanDictionaryInfo[];
    entries?: YomitanTermEntry[];
    terms?: YomitanTermEntry[];
    kanji?: YomitanKanjiEntry[];
    termMeta?: YomitanMetaEntry[];
    kanjiMeta?: YomitanMetaEntry[];
}

type YomitanZipIndex = { title?: string; format?: number; version?: number; revision?: string };

export class YomitanDictionaryStore {
    private dbPromise?: Promise<IDBDatabase>;
    private dictionaryInfoPromise?: Promise<YomitanDictionaryInfo[]>;
    private summaryPromise?: Promise<DictionarySummary>;
    private dictionaryStyleCssCache = new Map<string, string>();

    async warm(preferences: DictionaryPreference[] = []): Promise<void> {
        const done = log.time('Dictionary store warmup', { dictionaries: preferences.length });
        try {
            await this.summary();
            if (preferences.length) await this.dictionaryStyleCss(preferences);
            log.debug('Dictionary store warmed');
        } catch (error) {
            log.warn('Dictionary store warmup failed', { error });
            throw error;
        } finally {
            done();
        }
    }

    async lookup(expression: string, reading: string, limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanTermEntry[]> {
        const done = log.time('Term lookup', { expression, reading, limit, dictionaries: preferences.length });
        try {
            const db = await this.db();
            const entries = await this.getTermLookupEntries(
                db,
                expression,
                reading && reading !== expression ? reading : '',
                Math.max(limit * 40, 500),
                Math.max(limit * 20, 250),
            );

            const rank = dictionaryRank(preferences);
            const seen = new Set<string>();
            const results = entries
                .filter(entry => dictionaryEnabled(entry.dictionary, rank))
                .sort((a, b) =>
                    dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank)
                    || Number(b.expression === expression) - Number(a.expression === expression)
                    || Number(b.reading === reading) - Number(a.reading === reading)
                    || (b.score ?? 0) - (a.score ?? 0),
                )
                .filter(entry => {
                    const key = termLookupDedupKey(entry);
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

        const candidates = this.collectTermMatchCandidates(source);
        if (!candidates.size) {
            log.debug('Inline term match search skipped', { reason: 'no-candidates', length: source.length });
            done();
            return [];
        }

        try {
            const matches = await this.lookupTermMatchCandidates(candidates, preferences);

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

    private collectTermMatchCandidates(source: string): TermMatchCandidates {
        const candidates: TermMatchCandidates = new Map();
        const maxLength = Math.min(18, source.length);
        for (let start = 0; start < source.length; start++) {
            if (!JAPANESE_CHARACTER_RE.test(source[start])) continue;
            this.collectTermMatchCandidatesAt(source, start, maxLength, candidates);
        }
        return candidates;
    }

    private collectTermMatchCandidatesAt(source: string, start: number, maxLength: number, candidates: TermMatchCandidates): void {
        for (let length = Math.min(maxLength, source.length - start); length > 0; length--) {
            const surface = source.slice(start, start + length);
            if (!isSearchableJapaneseSurface(surface)) continue;
            this.addDeinflectedTermCandidates(surface, start, candidates);
        }
    }

    private addDeinflectedTermCandidates(surface: string, start: number, candidates: TermMatchCandidates): void {
        for (const deinflected of deinflectJapaneseTerm(surface)) {
            if (!JAPANESE_RE.test(deinflected.term)) continue;
            const positions = candidates.get(deinflected.term) ?? [];
            positions.push({ start, end: start + surface.length, surface, deinflected });
            candidates.set(deinflected.term, positions);
        }
    }

    private async lookupTermMatchCandidates(candidates: TermMatchCandidates, preferences: DictionaryPreference[]): Promise<YomitanTermMatch[]> {
        const db = await this.db();
        const rank = dictionaryRank(preferences);
        return await new Promise<YomitanTermMatch[]>((resolve, reject) => {
            const tx = db.transaction('terms', 'readonly');
            const store = tx.objectStore('terms');
            const expressionIndex = store.index('expression');
            const readingIndex = store.index('reading');
            const results: YomitanTermMatch[] = [];
            const expressions = sortedTermMatchExpressions(candidates);
            let pending = expressions.length * 2;
            const finish = () => {
                if (--pending <= 0) resolve(results);
            };
            const addMatches = (expression: string, foundEntries: YomitanTermEntry[]) => {
                results.push(...termMatchesForEntries(expression, foundEntries, candidates, rank));
            };
            for (const expression of expressions) {
                requestTermMatchIndex(expressionIndex, expression, addMatches, finish, reject);
                requestTermMatchIndex(readingIndex, expression, addMatches, finish, reject);
            }
            tx.onerror = () => reject(tx.error);
        });
    }

    async summary(): Promise<DictionarySummary> {
        const done = log.time('Dictionary summary');
        try {
            if (this.summaryPromise) {
                const summary = await this.summaryPromise;
                log.debug('Dictionary summary cache hit', {
                    dictionaries: summary.dictionaries.length,
                    terms: summary.terms,
                    kanji: summary.kanji,
                    termMeta: summary.termMeta,
                    kanjiMeta: summary.kanjiMeta,
                });
                return summary;
            }
            const db = await this.db();
            this.summaryPromise = Promise.all([
                this.getAllDictionaryInfo(db),
                this.countStore(db, 'terms'),
                this.countStore(db, 'kanji'),
                this.countStore(db, 'termMeta'),
                this.countStore(db, 'kanjiMeta'),
            ]).then(([dictionaries, terms, kanji, termMeta, kanjiMeta]) => ({ dictionaries, terms, kanji, termMeta, kanjiMeta }))
                .catch(error => {
                    this.summaryPromise = undefined;
                    throw error;
                });
            const summary = await this.summaryPromise;
            log.debug('Dictionary summary loaded', {
                dictionaries: summary.dictionaries.length,
                terms: summary.terms,
                kanji: summary.kanji,
                termMeta: summary.termMeta,
                kanjiMeta: summary.kanjiMeta,
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

    async listRandomTerms(limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanTermEntry[]> {
        const done = log.time('Random term listing', { limit, dictionaries: preferences.length });
        try {
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            const reservoir: YomitanTermEntry[] = [];
            const seen = new Set<string>();
            let count = 0;

            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction('terms', 'readonly');
                const request = tx.objectStore('terms').openCursor();
                request.onerror = () => reject(request.error ?? new Error('Could not list dictionary terms.'));
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) {
                        resolve();
                        return;
                    }
                    const entry = cursor.value as YomitanTermEntry;
                    if (
                        entry.expression
                        && JAPANESE_RE.test(entry.expression)
                        && entry.expression.length <= 6
                        && dictionaryEnabled(entry.dictionary, rank)
                    ) {
                        const key = `${entry.expression}\n${entry.reading}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            count++;
                            if (reservoir.length < limit) {
                                reservoir.push(entry);
                            } else {
                                const index = Math.floor(Math.random() * count);
                                if (index < limit) reservoir[index] = entry;
                            }
                        }
                    }
                    cursor.continue();
                };
            });

            log.debug('Random term listing completed', { limit, scanned: count, results: reservoir.length });
            return reservoir;
        } catch (error) {
            log.warn('Random term listing failed', { limit, error });
            return [];
        } finally {
            done();
        }
    }

    async listRandomTopTerms(limit: number, maxRank: number, preferences: DictionaryPreference[] = []): Promise<YomitanTermEntry[]> {
        const done = log.time('Random top term listing', { limit, maxRank, dictionaries: preferences.length });
        try {
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            const topTerms = await this.collectTopFrequencyTerms(db, maxRank, rank);
            const results = await this.randomTopTermResults(db, topTerms, limit, rank, preferences);
            if (this.shouldFallbackToRandomTerms(topTerms, results)) {
                log.debug('No common dictionary terms found, falling back to fully random terms');
                return await this.listRandomTerms(limit, preferences);
            }
            this.logRandomTopTermsComplete(limit, topTerms, results);
            return results;
        } catch (error) {
            log.warn('Random top term listing failed', { limit, error });
            return [];
        } finally {
            done();
        }
    }

    private async randomTopTermResults(
        db: IDBDatabase,
        topTerms: Map<string, number>,
        limit: number,
        rank: Map<string, DictionaryPreference>,
        preferences: DictionaryPreference[],
    ): Promise<YomitanTermEntry[]> {
        return topTerms.size
            ? await this.entriesForRandomExpressions(topTerms, limit, preferences)
            : await this.listRandomCommonTerms(db, limit, rank);
    }

    private shouldFallbackToRandomTerms(topTerms: Map<string, number>, results: YomitanTermEntry[]): boolean {
        return !topTerms.size && !results.length;
    }

    private logRandomTopTermsComplete(limit: number, topTerms: Map<string, number>, results: YomitanTermEntry[]): void {
        log.debug('Random top term listing completed', {
            limit,
            frequencyCandidates: topTerms.size,
            results: results.length,
            fallback: topTerms.size ? 'frequency' : 'common-tags',
        });
    }

    private async collectTopFrequencyTerms(db: IDBDatabase, maxRank: number, rank: Map<string, DictionaryPreference>): Promise<Map<string, number>> {
        const expressions = new Map<string, number>();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('termMeta', 'readonly');
            const request = tx.objectStore('termMeta').openCursor();
            request.onerror = () => reject(request.error ?? new Error('Could not list dictionary term meta.'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve();
                    return;
                }
                const entry = cursor.value as YomitanMetaEntry;
                if (entry.mode === 'freq' && entry.expression && dictionaryEnabled(entry.dictionary, rank)) {
                    const freq = extractFrequency(entry.data);
                    if (freq !== undefined && freq <= maxRank) {
                        expressions.set(entry.expression, Math.min(freq, expressions.get(entry.expression) ?? Number.POSITIVE_INFINITY));
                    }
                }
                cursor.continue();
            };
        });
        return expressions;
    }

    private async entriesForRandomExpressions(expressions: Map<string, number>, limit: number, preferences: DictionaryPreference[]): Promise<YomitanTermEntry[]> {
        const sampled = reservoirSample([...expressions.keys()], limit);
        const results: YomitanTermEntry[] = [];
        for (const expression of sampled) {
            const entries = await this.lookup(expression, '', 1, preferences);
            if (entries[0]) results.push({ ...entries[0], jpdbFrequency: expressions.get(expression) });
        }
        return results;
    }

    private async listRandomCommonTerms(db: IDBDatabase, limit: number, rank: Map<string, DictionaryPreference>): Promise<YomitanTermEntry[]> {
        const reservoir: YomitanTermEntry[] = [];
        const seen = new Set<string>();
        let count = 0;
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('terms', 'readonly');
            const request = tx.objectStore('terms').openCursor();
            request.onerror = () => reject(request.error ?? new Error('Could not list dictionary terms.'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve();
                    return;
                }
                const entry = cursor.value as YomitanTermEntry;
                if (isCommonDictionaryTerm(entry, rank)) {
                    const key = `${entry.expression}\n${entry.reading}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        count++;
                        if (reservoir.length < limit) {
                            reservoir.push(entry);
                        } else {
                            const index = Math.floor(Math.random() * count);
                            if (index < limit) reservoir[index] = entry;
                        }
                    }
                }
                cursor.continue();
            };
        });
        log.debug('Random common term listing completed', { limit, scanned: count, results: reservoir.length });
        return reservoir;
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
        const index = await readYomitanZipIndex(zip);
        const dictionary = yomitanZipDictionaryName(index, file.name);
        const version = yomitanZipVersion(index);
        await this.deleteDictionary(dictionary);
        const info = await yomitanZipDictionaryInfo(zip, index, dictionary, sourceUrl);

        const summary: ImportSummary = { dictionaries: [dictionary], dictionaryTypes: {}, entries: 0, terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
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
        info.counts = dictionaryCountsFromSummary(summary);
        info.type = dictionaryTypeFromCounts(info.counts);
        summary.dictionaryTypes = { [dictionary]: info.type };
        await this.putDictionaryInfo(info);
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
            return this.importReaderJson(json);
        }

        throw new Error('Unsupported dictionary JSON. Import a Yomitan Dexie export, a Yomitan dictionary ZIP, or this reader export.');
    }

    private async importReaderJson(json: ReaderDictionaryExport): Promise<ImportSummary> {
        await this.clear();
        const terms = readerExportTerms(json);
        const dictionaryTypes = dictionaryTypesFromReaderExport(json);
        const dictionaryNames = readerExportDictionaryNames(json, terms);
        const dictionaries = readerExportDictionaryInfo(json, dictionaryNames, dictionaryTypes);
        await Promise.all([
            this.addToStore('dictionaryInfo', dictionaries, true),
            this.addToStore('terms', terms),
            this.addToStore('kanji', json.kanji ?? []),
            this.addToStore('termMeta', json.termMeta ?? []),
            this.addToStore('kanjiMeta', json.kanjiMeta ?? []),
        ]);
        const summary = readerExportSummary(json, terms, dictionaryNames, dictionaryTypes);
        log.info('JSON dictionary import parsed', summary);
        return summary;
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
        const dictionaryInfo = new Map<string, YomitanDictionaryInfo>();
        const dictionaryCounts = new Map<string, Partial<Record<EntryStoreName, number>>>();
        const summary: ImportSummary = { dictionaries: [], dictionaryTypes: {}, entries: 0, terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
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
            if (typeof dictionary === 'string') {
                dictionaries.add(dictionary);
                const counts = dictionaryCounts.get(dictionary) ?? {};
                counts[store] = (counts[store] ?? 0) + 1;
                dictionaryCounts.set(dictionary, counts);
            }
            if (batches[store].length >= DEXIE_IMPORT_BATCH_SIZE) {
                await flush(store);
            }
        };

        await streamDexieTables(file, {
            dictionaries: async row => {
                const info = normalizeDexieDictionaryRow(row);
                if (!info) return;
                dictionaries.add(info.title);
                dictionaryInfo.set(info.title, info);
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
        summary.dictionaryTypes = {};
        await Promise.all(summary.dictionaries.map(dictionary => {
            const counts = dictionaryCounts.get(dictionary) ?? {};
            const info = dictionaryInfo.get(dictionary) ?? {
                title: dictionary,
                alias: dictionary,
                enabled: true,
                priority: dictionaryInfo.size,
                importDate: Date.now(),
            };
            info.counts = { ...(info.counts ?? {}), ...counts };
            info.type = dictionaryTypeFromCounts(info.counts);
            summary.dictionaryTypes![dictionary] = info.type;
            return this.putDictionaryInfo(info);
        }));
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
            const cacheKey = JSON.stringify(normalizeDictionaryPreferences(preferences));
            const cached = this.dictionaryStyleCssCache.get(cacheKey);
            if (cached !== undefined) {
                log.debug('Dictionary stylesheet cache hit', { bytes: cached.length, preferences: preferences.length });
                return cached;
            }
            const db = await this.db();
            const dictionaries = await this.getAllDictionaryInfo(db);
            const css = renderDictionaryScopedStyles(dictionaries, preferences);
            this.dictionaryStyleCssCache.set(cacheKey, css);
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
            this.invalidateCaches();
            log.info('Dictionary store cleared');
        } catch (error) {
            log.warn('Dictionary store clear failed', { error });
            throw error;
        } finally {
            done();
        }
    }

    async resetDatabase(options: { deleteTimeoutMs?: number } = {}): Promise<{ cleared: boolean; deleted: boolean }> {
        const done = log.time('Dictionary database factory reset');
        let cleared = false;
        try {
            await this.clear();
            cleared = true;
            await this.deleteDatabase({ timeoutMs: options.deleteTimeoutMs ?? DB_FACTORY_RESET_DELETE_TIMEOUT_MS });
            return { cleared, deleted: true };
        } catch (error) {
            if (!cleared) {
                log.warn('Dictionary database factory reset failed before clearing entries', { error });
                throw error;
            }
            log.warn('Dictionary database delete did not complete after clearing entries; continuing reset with empty stores', { error });
            return { cleared, deleted: false };
        } finally {
            done();
        }
    }

    async invalidateForFactoryReset(): Promise<void> {
        const dbPromise = this.dbPromise;
        this.dbPromise = undefined;
        this.invalidateCaches();
        if (!dbPromise) return;
        try {
            const db = await dbPromise;
            db.close();
            log.info('Dictionary database connection closed for factory reset', { name: DB_NAME });
        } catch (error) {
            log.debug('Dictionary database connection was not open during factory reset invalidation', { error });
        }
    }

    async deleteDatabase(options: { timeoutMs?: number } = {}): Promise<void> {
        const done = log.time('Dictionary database delete');
        try {
            const timeoutMs = options.timeoutMs ?? DB_DELETE_BLOCKED_TIMEOUT_MS;
            const db = this.dbPromise ? await this.dbPromise.catch(() => undefined) : undefined;
            db?.close();
            this.dbPromise = undefined;
            this.invalidateCaches();
            await new Promise<void>((resolve, reject) => {
                let blocked = false;
                let settled = false;
                const timeout = globalThis.setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    reject(new Error(blocked
                        ? 'Dictionary database reset is still waiting on another open Yomu tab. Reload the other Yomu tabs, then try again.'
                        : 'Dictionary database reset timed out.'));
                }, timeoutMs);
                const settle = (callback: () => void) => {
                    if (settled) return;
                    settled = true;
                    globalThis.clearTimeout(timeout);
                    callback();
                };
                const request = indexedDB.deleteDatabase(DB_NAME);
                request.onsuccess = () => settle(resolve);
                request.onerror = () => settle(() => reject(request.error ?? new Error('Dictionary database reset failed.')));
                request.onblocked = () => {
                    blocked = true;
                    log.warn('Dictionary database delete is blocked; waiting for other Yomu tabs to close their dictionary connection', { name: DB_NAME });
                };
            });
            log.info('Dictionary database deleted', { name: DB_NAME });
        } catch (error) {
            log.warn('Dictionary database delete failed', { error });
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
            this.invalidateCaches();
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
            tx.oncomplete = () => {
                this.invalidateCaches();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    private async getByIndex<T>(db: IDBDatabase, storeName: StoreName, indexName: string, value: string, limit: number): Promise<T[]> {
        return new Promise((resolve, reject) => {
            const index = db.transaction(storeName, 'readonly').objectStore(storeName).index(indexName);
            const query = IDBKeyRange.only(value);
            if (typeof index.getAll === 'function') {
                const request = index.getAll(query, limit);
                request.onsuccess = () => resolve(request.result as T[]);
                request.onerror = () => reject(request.error);
                return;
            }
            const results: T[] = [];
            const request = index.openCursor(query);
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

    private async getTermLookupEntries(db: IDBDatabase, expression: string, reading: string, expressionLimit: number, readingLimit: number): Promise<YomitanTermEntry[]> {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('terms', 'readonly');
            const store = tx.objectStore('terms');
            const queries = [
                { indexName: 'expression', value: expression, limit: expressionLimit },
                ...(reading ? [{ indexName: 'reading', value: reading, limit: readingLimit }] : []),
            ];
            const entries: YomitanTermEntry[] = [];
            let pending = queries.length;
            const finish = () => {
                if (--pending <= 0) resolve(entries);
            };
            const fail = (error: unknown) => reject(error ?? new Error('Could not search local dictionary terms.'));

            for (const query of queries) {
                const index = store.index(query.indexName);
                const range = IDBKeyRange.only(query.value);
                if (typeof index.getAll === 'function') {
                    const request = index.getAll(range, query.limit);
                    request.onsuccess = () => {
                        entries.push(...request.result as YomitanTermEntry[]);
                        finish();
                    };
                    request.onerror = () => fail(request.error);
                    continue;
                }

                let count = 0;
                const request = index.openCursor(range);
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor || count >= query.limit) {
                        finish();
                        return;
                    }
                    entries.push(cursor.value as YomitanTermEntry);
                    count++;
                    cursor.continue();
                };
                request.onerror = () => fail(request.error);
            }
            tx.onerror = () => fail(tx.error);
        });
    }

    private async getAllDictionaryInfo(db: IDBDatabase): Promise<YomitanDictionaryInfo[]> {
        this.dictionaryInfoPromise ??= this.getAllFromStore<YomitanDictionaryInfo>(db, 'dictionaryInfo')
            .then(items => items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title)))
            .catch(error => {
                this.dictionaryInfoPromise = undefined;
                throw error;
            });
        return this.dictionaryInfoPromise;
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
                const db = request.result;
                this.installVersionChangeHandler(db);
                log.debug('Dictionary database opened', { name: DB_NAME, version: db.version });
                resolve(db);
            };
            request.onerror = () => {
                log.warn('Dictionary database open failed', { error: request.error });
                reject(request.error);
            };
        });
        return this.dbPromise;
    }

    private installVersionChangeHandler(db: IDBDatabase): void {
        db.onversionchange = event => {
            log.info('Dictionary database version change requested; closing open connection', {
                name: DB_NAME,
                oldVersion: event.oldVersion,
                newVersion: event.newVersion,
            });
            db.close();
            this.dbPromise = undefined;
            this.invalidateCaches();
        };
    }

    invalidateCaches(): void {
        this.dictionaryInfoPromise = undefined;
        this.summaryPromise = undefined;
        this.dictionaryStyleCssCache.clear();
    }
}

function isSearchableJapaneseSurface(surface: string): boolean {
    return JAPANESE_RE.test(surface) && !/\s/.test(surface);
}

function sortedTermMatchExpressions(candidates: TermMatchCandidates): string[] {
    return Array.from(candidates.keys()).sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function requestTermMatchIndex(
    index: IDBIndex,
    expression: string,
    addMatches: (expression: string, entries: YomitanTermEntry[]) => void,
    finish: () => void,
    reject: (reason?: unknown) => void,
): void {
    const request = index.getAll(IDBKeyRange.only(expression), 8);
    request.onsuccess = () => {
        addMatches(expression, request.result as YomitanTermEntry[]);
        finish();
    };
    request.onerror = () => reject(request.error);
}

function termMatchesForEntries(
    expression: string,
    foundEntries: YomitanTermEntry[],
    candidates: TermMatchCandidates,
    rank: Map<string, DictionaryPreference>,
): YomitanTermMatch[] {
    const entries = sortTermMatchEntries(deduplicateTermMatchEntries(foundEntries), rank);
    if (!entries.length) return [];
    return (candidates.get(expression) ?? [])
        .map(position => termMatchForPosition(position, entries))
        .filter((match): match is YomitanTermMatch => Boolean(match));
}

function deduplicateTermMatchEntries(entries: YomitanTermEntry[]): YomitanTermEntry[] {
    const seen = new Set<string>();
    return entries.filter(item => {
        const key = `${item.id ?? ''}\n${item.dictionary}\n${item.expression}\n${item.reading}\n${item.sequence ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function sortTermMatchEntries(entries: YomitanTermEntry[], rank: Map<string, DictionaryPreference>): YomitanTermEntry[] {
    return entries
        .filter(item => dictionaryEnabled(item.dictionary, rank))
        .sort((a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank) || (b.score ?? 0) - (a.score ?? 0));
}

function termMatchForPosition(position: TermMatchCandidatePosition, entries: YomitanTermEntry[]): YomitanTermMatch | null {
    const entry = entries.find(item => termRulesMatch(item.rules, position.deinflected.rules));
    return entry
        ? {
            entry,
            ...position,
            deinflected: position.deinflected.depth > 0 ? position.deinflected : undefined,
        }
        : null;
}

function importEntryStores(): EntryStoreName[] {
    return ['terms', 'kanji', 'termMeta', 'kanjiMeta'];
}

function isEntryStoreName(value: string): value is EntryStoreName {
    return value === 'terms' || value === 'kanji' || value === 'termMeta' || value === 'kanjiMeta';
}

function dictionaryCountsFromSummary(summary: Pick<ImportSummary, 'terms' | 'kanji' | 'termMeta' | 'kanjiMeta'>): Record<string, number> {
    return {
        terms: summary.terms,
        kanji: summary.kanji,
        termMeta: summary.termMeta,
        kanjiMeta: summary.kanjiMeta,
    };
}

function dictionaryTypeFromCounts(counts: Record<string, unknown> = {}): YomitanDictionaryInfo['type'] {
    return DICTIONARY_TYPE_COUNT_PRIORITY.find(({ key }) => Number(counts[key] ?? 0) > 0)?.type ?? 'terms';
}

const DICTIONARY_TYPE_COUNT_PRIORITY: Array<{ key: string; type: YomitanDictionaryInfo['type'] }> = [
    { key: 'terms', type: 'terms' },
    { key: 'termMeta', type: 'frequency' },
    { key: 'kanji', type: 'kanji' },
    { key: 'kanjiMeta', type: 'metadata' },
];

function readerExportTerms(json: ReaderDictionaryExport): YomitanTermEntry[] {
    return json.terms ?? json.entries ?? [];
}

function readerExportDictionaryNames(json: ReaderDictionaryExport, terms = readerExportTerms(json)): string[] {
    return json.dictionaries?.map(item => item.title)
        ?? [...new Set(terms.map(entry => entry.dictionary))];
}

function readerExportDictionaryInfo(
    json: ReaderDictionaryExport,
    dictionaryNames: string[],
    dictionaryTypes: Record<string, YomitanDictionaryInfo['type']>,
): YomitanDictionaryInfo[] {
    return json.dictionaries?.length
        ? json.dictionaries.map(info => ({ ...info, type: info.type ?? dictionaryTypes[info.title] }))
        : dictionaryNames.map((title, index) => ({ title, alias: title, enabled: true, priority: index, type: dictionaryTypes[title] }));
}

function readerExportSummary(
    json: ReaderDictionaryExport,
    terms: YomitanTermEntry[],
    dictionaryNames: string[],
    dictionaryTypes: Record<string, YomitanDictionaryInfo['type']>,
): ImportSummary {
    const kanji = json.kanji ?? [];
    const termMeta = json.termMeta ?? [];
    const kanjiMeta = json.kanjiMeta ?? [];
    return {
        dictionaries: dictionaryNames,
        dictionaryTypes,
        entries: terms.length + kanji.length + termMeta.length + kanjiMeta.length,
        terms: terms.length,
        kanji: kanji.length,
        termMeta: termMeta.length,
        kanjiMeta: kanjiMeta.length,
    };
}

function dictionaryTypesFromReaderExport(json: ReaderDictionaryExport): Record<string, YomitanDictionaryInfo['type']> {
    const counts = new Map<string, Record<string, number>>();
    addDictionaryTypeCounts(counts, readerExportTerms(json), 'terms');
    addDictionaryTypeCounts(counts, json.kanji ?? [], 'kanji');
    addDictionaryTypeCounts(counts, json.termMeta ?? [], 'termMeta');
    addDictionaryTypeCounts(counts, json.kanjiMeta ?? [], 'kanjiMeta');
    return Object.fromEntries([
        ...configuredReaderDictionaryTypes(json),
        ...observedReaderDictionaryTypes(counts),
    ]);
}

function addDictionaryTypeCounts(counts: Map<string, Record<string, number>>, entries: Array<{ dictionary: string }>, store: EntryStoreName): void {
    for (const entry of entries) {
        const item = counts.get(entry.dictionary) ?? { terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
        item[store]++;
        counts.set(entry.dictionary, item);
    }
}

function configuredReaderDictionaryTypes(json: ReaderDictionaryExport): Array<readonly [string, YomitanDictionaryInfo['type']]> {
    return (json.dictionaries ?? []).map(info => [info.title, info.type ?? dictionaryTypeFromCounts(info.counts)] as const);
}

function observedReaderDictionaryTypes(counts: Map<string, Record<string, number>>): Array<readonly [string, YomitanDictionaryInfo['type']]> {
    return [...counts].map(([name, value]) => [name, dictionaryTypeFromCounts(value)] as const);
}

async function readYomitanZipIndex(zip: JSZip): Promise<YomitanZipIndex> {
    const indexFile = zip.file('index.json');
    if (!indexFile) throw new Error('Yomitan dictionary ZIP is missing index.json.');
    return JSON.parse(await indexFile.async('string')) as YomitanZipIndex;
}

function yomitanZipDictionaryName(index: YomitanZipIndex, filename: string): string {
    return index.title?.trim() || filename.replace(/\.zip$/i, '');
}

function yomitanZipVersion(index: YomitanZipIndex): number {
    return index.format ?? index.version ?? 3;
}

async function yomitanZipDictionaryInfo(
    zip: JSZip,
    index: YomitanZipIndex,
    dictionary: string,
    sourceUrl: string,
): Promise<YomitanDictionaryInfo> {
    return {
        title: dictionary,
        alias: dictionary,
        enabled: true,
        priority: 0,
        styles: await readOptionalZipText(zip, 'styles.css'),
        revision: typeof index.revision === 'string' ? index.revision : undefined,
        downloadUrl: sourceUrl || undefined,
        importDate: Date.now(),
    };
}

async function readOptionalZipText(zip: JSZip, name: string): Promise<string> {
    return readZipText(zip, name).catch(() => '');
}

async function readZipText(zip: JSZip, name: string): Promise<string> {
    const file = zip.file(name);
    if (!file) throw new Error(`${name} not found.`);
    return file.async('string');
}

function normalizeZipTermRow(row: unknown, dictionary: string): YomitanTermEntry | null {
    if (!Array.isArray(row)) return null;
    const [expression, reading, definitionTags, rules, score, glossary, sequence, termTags] = row;
    if (typeof expression !== 'string') return null;
    return {
        expression,
        reading: zipTermReading(reading, expression),
        definitionTags: zipStringField(definitionTags),
        rules: zipStringField(rules),
        score: zipNumberField(score, 0),
        glossary: zipGlossaryField(glossary),
        sequence: zipOptionalNumberField(sequence),
        termTags: zipStringField(termTags),
        dictionary,
    };
}

function zipTermReading(value: unknown, expression: string): string {
    return typeof value === 'string' && value ? value : expression;
}

function zipStringField(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function zipNumberField(value: unknown, fallback: number): number {
    return typeof value === 'number' ? value : fallback;
}

function zipOptionalNumberField(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function zipGlossaryField(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
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
    const record = dexieRowRecord<YomitanTermEntry>(row);
    if (!record) return null;
    if (typeof record.expression !== 'string' || typeof record.dictionary !== 'string') return null;
    return {
        expression: record.expression,
        reading: dexieStringField(record, 'reading', record.expression),
        definitionTags: dexieStringField(record, 'definitionTags'),
        rules: dexieStringField(record, 'rules'),
        score: dexieNumberField(record, 'score', 0),
        glossary: dexieGlossaryField(record),
        sequence: dexieOptionalNumberField(record, 'sequence'),
        termTags: dexieStringField(record, 'termTags'),
        dictionary: record.dictionary,
    };
}

function dexieStringField(record: Partial<YomitanTermEntry>, key: keyof YomitanTermEntry, fallback = ''): string {
    const value = record[key];
    return typeof value === 'string' && value ? value : fallback;
}

function dexieNumberField(record: Partial<YomitanTermEntry>, key: keyof YomitanTermEntry, fallback: number): number {
    const value = record[key];
    return typeof value === 'number' ? value : fallback;
}

function dexieOptionalNumberField(record: Partial<YomitanTermEntry>, key: keyof YomitanTermEntry): number | undefined {
    const value = record[key];
    return typeof value === 'number' ? value : undefined;
}

function dexieGlossaryField(record: Partial<YomitanTermEntry>): unknown[] {
    return Array.isArray(record.glossary) ? record.glossary : [];
}

function termLookupDedupKey(entry: YomitanTermEntry): string {
    const glossaryKey = JSON.stringify(entry.glossary);
    return entry.sequence !== undefined
        ? `${entry.dictionary}\nsequence:${entry.sequence}\n${glossaryKey}`
        : `${entry.dictionary}\n${entry.expression}\n${entry.reading}\n${glossaryKey}`;
}

function normalizeDexieKanjiRow(row: unknown): YomitanKanjiEntry | null {
    const record = dexieKanjiRecord(row);
    return record ? {
        character: record.character,
        onyomi: dexieStringList(record.onyomi),
        kunyomi: dexieStringList(record.kunyomi),
        tags: dexieStringList(record.tags),
        meanings: Array.isArray(record.meanings) ? record.meanings.map(String) : [],
        stats: record.stats,
        dictionary: record.dictionary,
    } : null;
}

function dexieKanjiRecord(row: unknown): (Partial<YomitanKanjiEntry> & Pick<YomitanKanjiEntry, 'character' | 'dictionary'>) | null {
    const record = dexieRowRecord<YomitanKanjiEntry>(row);
    return record && typeof record.character === 'string' && typeof record.dictionary === 'string'
        ? record as Partial<YomitanKanjiEntry> & Pick<YomitanKanjiEntry, 'character' | 'dictionary'>
        : null;
}

function dexieStringList(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : splitTags(value);
}

function normalizeDexieTermMetaRow(row: unknown): YomitanMetaEntry | null {
    const record = dexieTermMetaRecord(row);
    return record
        ? { expression: record.expression, mode: record.mode, data: record.data, dictionary: record.dictionary }
        : null;
}

function normalizeDexieKanjiMetaRow(row: unknown): YomitanMetaEntry | null {
    const record = dexieKanjiMetaRecord(row);
    return record
        ? { character: record.character, mode: record.mode, data: record.data, dictionary: record.dictionary }
        : null;
}

function dexieTermMetaRecord(row: unknown): (Partial<YomitanMetaEntry> & { expression: string; mode: string; dictionary: string }) | null {
    const record = dexieRowRecord<YomitanMetaEntry>(row);
    return record && typeof record.expression === 'string' && typeof record.mode === 'string' && typeof record.dictionary === 'string'
        ? record as Partial<YomitanMetaEntry> & { expression: string; mode: string; dictionary: string }
        : null;
}

function dexieKanjiMetaRecord(row: unknown): (Partial<YomitanMetaEntry> & { character: string; mode: string; dictionary: string }) | null {
    const record = dexieRowRecord<YomitanMetaEntry>(row);
    return record && typeof record.character === 'string' && typeof record.mode === 'string' && typeof record.dictionary === 'string'
        ? record as Partial<YomitanMetaEntry> & { character: string; mode: string; dictionary: string }
        : null;
}

function normalizeDexieDictionaryRow(row: unknown): YomitanDictionaryInfo | null {
    const record = dexieDictionaryRecord(row);
    if (!record) return null;
    if (typeof record.title !== 'string') return null;
    return {
        title: record.title,
        alias: dictionaryAlias(record, record.title),
        enabled: dictionaryInfoEnabled(record.enabled),
        priority: dictionaryInfoPriority(record.priority),
        counts: record.counts as Record<string, unknown> | undefined,
        type: dictionaryInfoType(record.type),
        styles: stringField(record.styles) ?? '',
        revision: stringField(record.revision),
        downloadUrl: stringField(record.downloadUrl),
        importDate: numberField(record.importDate),
    };
}

function dexieDictionaryRecord(row: unknown): (Partial<YomitanDictionaryInfo> & { title?: unknown; revision?: unknown }) | null {
    return dexieRowRecord<YomitanDictionaryInfo>(row) as (Partial<YomitanDictionaryInfo> & { title?: unknown; revision?: unknown }) | null;
}

function dictionaryInfoEnabled(value: unknown): boolean {
    return typeof value === 'boolean' ? value : true;
}

function dictionaryInfoPriority(value: unknown): number {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function dictionaryAlias(record: Partial<YomitanDictionaryInfo>, fallback: string): string {
    return typeof record.alias === 'string' && record.alias ? record.alias : fallback;
}

function dictionaryInfoType(value: unknown): YomitanDictionaryInfo['type'] | undefined {
    return value === 'terms' || value === 'kanji' || value === 'frequency' || value === 'metadata'
        ? value
        : undefined;
}

function stringField(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function numberField(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function unwrapDexieRow(row: unknown): unknown {
    if (row && typeof row === 'object' && '$' in row) {
        const value = (row as { $?: unknown }).$;
        return Array.isArray(value) ? value.find(item => item && typeof item === 'object' && !Array.isArray(item)) : value;
    }
    return row;
}

function dexieRowRecord<T>(row: unknown): Partial<T> | null {
    const candidate = unwrapDexieRow(row);
    return candidate && typeof candidate === 'object' ? candidate as Partial<T> : null;
}

function isReaderDictionaryExport(value: unknown): value is ReaderDictionaryExport {
    const record = readerDictionaryExportRecord(value);
    return Boolean(record && isReaderDictionaryExportFormat(record) && hasReaderDictionaryExportRows(record));
}

function readerDictionaryExportRecord(value: unknown): (Partial<ReaderDictionaryExport> & { formatName?: unknown }) | null {
    return value && typeof value === 'object' ? value as Partial<ReaderDictionaryExport> & { formatName?: unknown } : null;
}

function isReaderDictionaryExportFormat(record: { formatName?: unknown }): boolean {
    return record.formatName === 'yomu-yomitan-dictionaries' || record.formatName === 'jpdb-reader-yomitan-dictionaries';
}

function hasReaderDictionaryExportRows(record: Partial<ReaderDictionaryExport>): boolean {
    return Array.isArray(record.entries)
        || Array.isArray(record.terms)
        || Array.isArray(record.kanji);
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
    if (userscriptRequest) return requestBlobViaUserscript(url, userscriptRequest, done, onProgress);
    return await requestBlobViaFetch(url, done);
}

function requestBlobViaUserscript(
    url: string,
    userscriptRequest: NonNullable<ReturnType<typeof getUserscriptHttpRequest>>,
    done: () => void,
    onProgress?: (message: string) => void,
): Promise<Blob> {
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

async function requestBlobViaFetch(url: string, done: () => void): Promise<Blob> {
    const downloadUrl = dictionaryDownloadUrl(url);
    if (!downloadUrl) return throwMissingDictionaryDownloadBridge(done);
    try {
        return await fetchDictionaryBlob(url, downloadUrl, done);
    } catch (error) {
        return handleDictionaryFetchError(url, downloadUrl, error, done);
    }
}

function throwMissingDictionaryDownloadBridge(done: () => void): never {
    done();
    throw new Error('Dictionary download needs the userscript request bridge on this page. Open the dictionary URL and import the ZIP from Settings if the automatic download fails.');
}

async function fetchDictionaryBlob(url: string, downloadUrl: string, done: () => void): Promise<Blob> {
    log.debug('Dictionary download using fetch', { host: safeHost(url), proxied: downloadUrl !== url });
    const response = await fetch(downloadUrl, { credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer' });
    if (!response.ok) throwDictionaryHttpError(url, response.status);
    const blob = await response.blob();
    log.info('Dictionary download completed', { host: safeHost(url), status: response.status, size: blob.size });
    done();
    return blob;
}

function throwDictionaryHttpError(url: string, status: number): never {
    log.warn('Dictionary download returned HTTP error', { host: safeHost(url), status });
    throw new Error(`Dictionary download failed (${status}).`);
}

function handleDictionaryFetchError(url: string, downloadUrl: string, error: unknown, done: () => void): never {
    const host = safeHost(url);
    if (isDictionaryCorsError(error)) {
        log.warn('Dictionary download failed due cross-origin restriction', { host, downloadUrl });
        done();
        throw new Error('Dictionary download is blocked in this browser. Open the dictionary URL and import the ZIP from Settings if the automatic download fails.');
    }
    log.warn('Dictionary download fetch failed', { host, error });
    done();
    throw error;
}

function isDictionaryCorsError(error: unknown): boolean {
    return error instanceof Error && error.name === 'TypeError';
}

function dictionaryDownloadUrl(url: string): string | null {
    try {
        const target = new URL(url, location.href);
        const current = new URL(location.href);
        if (target.origin === current.origin) return target.href;
        if (!isLoopbackPage()) return null;
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

function reservoirSample<T>(items: T[], limit: number): T[] {
    const reservoir: T[] = [];
    let count = 0;
    for (const item of items) {
        count++;
        if (reservoir.length < limit) {
            reservoir.push(item);
        } else {
            const index = Math.floor(Math.random() * count);
            if (index < limit) reservoir[index] = item;
        }
    }
    return reservoir;
}

function isCommonDictionaryTerm(entry: YomitanTermEntry, rank: Map<string, DictionaryPreference>): boolean {
    return isCommonDictionaryTermCandidate(entry, rank)
        && (hasCommonDictionaryTags(entry) || hasCommonDictionaryScore(entry));
}

function isCommonDictionaryTermCandidate(entry: YomitanTermEntry, rank: Map<string, DictionaryPreference>): boolean {
    return Boolean(entry.expression
        && JAPANESE_RE.test(entry.expression)
        && entry.expression.length <= 8
        && dictionaryEnabled(entry.dictionary, rank));
}

function hasCommonDictionaryTags(entry: YomitanTermEntry): boolean {
    return /\b(common|ichi1|news1|spec1|gai1|freq|popular)\b/.test(dictionaryTermTags(entry));
}

function dictionaryTermTags(entry: YomitanTermEntry): string {
    return `${entry.definitionTags ?? ''} ${entry.termTags ?? ''} ${entry.rules ?? ''}`.toLowerCase();
}

function hasCommonDictionaryScore(entry: YomitanTermEntry): boolean {
    return typeof entry.score === 'number' && entry.score >= 5;
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
