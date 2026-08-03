import 'fake-indexeddb/auto';

import { File } from 'node:buffer';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, promisify } from 'node:util';

import { parityDictionaryId } from '../lib/multilingual-parity-dictionary';
import publishedCatalogJson from '../../config/dictionaries/published/v1/catalog.json';
import { YomitanDictionaryStore, type YomitanTermEntry } from '../../src/reader/dictionaries/yomitan';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import {
    MULTILINGUAL_PARITY_CORPUS_RULE,
    multilingualParityCorpus,
    multilingualParityCorpusSha256,
    type MultilingualParityTargetCorpus,
} from '../lib/multilingual-parity-corpus';
import {
    MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION,
    MULTILINGUAL_PARITY_MEASUREMENT_MODE,
    MULTILINGUAL_PARITY_SCHEMA_VERSION,
    measureMultilingualParityTarget,
    multilingualParityCheckpointIdentityFailures,
    multilingualParityLookupContractSha256,
    type MultilingualParityCheckpointIdentity,
    type MultilingualParitySpan,
} from '../lib/multilingual-parity-contract';
import {
    candidateFilteredTermsFromPublishedArchive,
    multilingualParityArchiveScanMode,
    type MultilingualParityArchiveScan,
} from '../lib/multilingual-parity-archive';

interface PublishedCatalogEntry {
    id: string;
    title: string;
    version: string;
    categories: string[];
    license: {
        spdx: string | null;
        attribution: string;
        sourceUrl: string;
    };
    distribution: {
        state: string;
        object: {
            key: string;
            sha256: string;
            bytes: number;
        };
    };
}

interface PublishedCatalog {
    revision: string;
    objectsBaseUrl: string;
    entries: PublishedCatalogEntry[];
}

interface DictionaryEvidence {
    id: string;
    title: string;
    version: string;
    catalogRevision: string;
    sha256: string;
    bytes: number;
    url: string;
    license: PublishedCatalogEntry['license'];
}

interface TargetMeasurement {
    language: string;
    lookupContractSha256: string;
    dictionary: DictionaryEvidence;
    archiveScan: MultilingualParityArchiveScan;
    sentences: number;
    annotated: number;
    contentWords: number;
    percent: number;
    suggestedBar: 'MEETS' | 'BELOW';
    misses: MultilingualParitySpan[];
    evidenceTerms: YomitanTermEntry[];
}

interface MultilingualParityCheckpoint extends MultilingualParityCheckpointIdentity {
    results: TargetMeasurement[];
}

const catalog = publishedCatalogJson as PublishedCatalog;
const DEFAULT_CACHE_DIR = '/private/tmp/yomu-multilingual-parity-cache';
const CHILD_RESULT_PREFIX = 'YOMU_PARITY_RESULT:';
const SUGGESTED_BENCHMARK_PERCENT = 60;
const execFile = promisify(execFileCallback);

function cliValue(flag: string): string | undefined {
    const index = process.argv.indexOf(flag);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * The dictionary a learner would actually be given for this target.
 *
 * This used to be `wty-${language}-en` by naming convention, which measured
 * something no learner installs. For Cantonese the two had diverged completely:
 * the convention pinned `wty-yue-en` at 28,109 bytes — a Wiktionary extraction
 * with almost nothing in it — so yue recorded 0 words out of 47 while the roster
 * averaged 84.2%, and the number described the pin rather than the language. The
 * shelf offers Words.hk at 13.6 MB.
 *
 * Reading the recommendation instead means the ratchet measures the product. Of
 * the 33 targets exactly one pin moves, because the convention already agreed
 * with the shelf everywhere else — including Japanese, whose curated shelf leads
 * with jmdict-en.
 */
function publishedDictionary(language: string): DictionaryEvidence {
    const id = parityDictionaryId(language);
    const entry = catalog.entries.find(candidate => candidate.id === id);
    if (!entry) throw new Error(`${language}: published dictionary ${id} is absent from the catalog.`);
    if (entry.distribution.state !== 'published' || !entry.categories.includes('terms')) {
        throw new Error(`${language}: ${id} is not a published terms dictionary.`);
    }
    const object = entry.distribution.object;
    return {
        id,
        title: entry.title,
        version: entry.version,
        catalogRevision: catalog.revision,
        sha256: object.sha256,
        bytes: object.bytes,
        url: new URL(object.key, catalog.objectsBaseUrl).href,
        license: entry.license,
    };
}


async function downloadArchive(dictionary: DictionaryEvidence): Promise<Uint8Array> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const response = await fetch(dictionary.url, {
                signal: AbortSignal.timeout(180_000),
            });
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }
            return new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            lastError = error;
            if (attempt === 5) break;
            const delayMs = attempt * 1_000;
            process.stderr.write(`${dictionary.id}: download attempt ${attempt} failed; retrying in ${delayMs} ms.\n`);
            await new Promise(resolveDelay => setTimeout(resolveDelay, delayMs));
        }
    }
    throw new Error(`${dictionary.id}: download failed after 5 attempts.`, { cause: lastError });
}

function verifyArchiveBytes(bytes: Uint8Array, dictionary: DictionaryEvidence): void {
    if (bytes.byteLength !== dictionary.bytes) {
        throw new Error(`${dictionary.id}: expected ${dictionary.bytes} bytes, found ${bytes.byteLength}.`);
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== dictionary.sha256) {
        throw new Error(`${dictionary.id}: expected SHA-256 ${dictionary.sha256}, found ${digest}.`);
    }
}

async function verifiedArchive(cacheDir: string, dictionary: DictionaryEvidence): Promise<Uint8Array> {
    const archivePath = resolve(cacheDir, `${dictionary.id}-${dictionary.sha256.slice(0, 12)}.zip`);
    let cached: Uint8Array | undefined;
    try {
        cached = await readFile(archivePath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (cached) {
        try {
            verifyArchiveBytes(cached, dictionary);
            return cached;
        } catch {
            process.stderr.write(`${dictionary.id}: discarding an invalid cached archive.\n`);
            await rm(archivePath, { force: true });
        }
    }

    process.stderr.write(`Downloading ${dictionary.id} (${dictionary.bytes.toLocaleString()} bytes)...\n`);
    const downloaded = await downloadArchive(dictionary);
    verifyArchiveBytes(downloaded, dictionary);
    await mkdir(dirname(archivePath), { recursive: true });
    const temporaryPath = `${archivePath}.${process.pid}.${Date.now()}.tmp`;
    try {
        await writeFile(temporaryPath, downloaded);
        await rename(temporaryPath, archivePath);
    } finally {
        await rm(temporaryPath, { force: true });
    }
    return downloaded;
}

function evidenceTermKey(entry: YomitanTermEntry): string {
    return JSON.stringify([
        entry.expression,
        entry.reading,
        entry.definitionTags ?? '',
        entry.rules ?? '',
        entry.score ?? 0,
        entry.glossary,
        entry.sequence ?? 0,
        entry.termTags ?? '',
        entry.dictionary,
    ]);
}

function serializableEvidenceTerm(entry: YomitanTermEntry): YomitanTermEntry {
    // The fast gate needs the indexed expression/reading, ranking fields, and
    // morphology tags. It does not need to redistribute a published
    // dictionary's full structured glossary, so replace that payload with a
    // generated marker before the row ever enters the checkpoint or fixture.
    const copy = {
        ...entry,
        glossary: ['Published dictionary match (compact parity evidence).'],
    };
    delete copy.id;
    return copy;
}

async function measureTarget(
    targetCorpus: MultilingualParityTargetCorpus,
    cacheDir: string,
): Promise<TargetMeasurement> {
    const { language } = targetCorpus;
    const target = setActiveLearningTargetLanguage(language);
    if (!target) {
        throw new Error(`${language}: no learning-target module is registered.`);
    }
    const lookupContractSha256 = await multilingualParityLookupContractSha256(language);
    const dictionary = publishedDictionary(language);
    const archive = await verifiedArchive(cacheDir, dictionary);
    const store = new YomitanDictionaryStore();
    await store.clear();
    const archiveFile = new File(
        [archive as Uint8Array<ArrayBuffer>],
        `${dictionary.id}.zip`,
        { type: 'application/zip' },
    ) as unknown as globalThis.File;
    let archiveScan: MultilingualParityArchiveScan;
    if (multilingualParityArchiveScanMode(language) === 'candidate-filtered-full-archive') {
        const filtered = await candidateFilteredTermsFromPublishedArchive(
            archive,
            archiveFile.name,
            targetCorpus,
            target,
            dictionary,
        );
        await store.importFile(
            new File([JSON.stringify({
                formatName: 'yomu-yomitan-dictionaries',
                formatVersion: 2,
                terms: filtered.terms,
            })], `${dictionary.id}-parity-evidence.json`, { type: 'application/json' }),
            undefined,
            dictionary.url,
            { persistArchive: false },
        );
        archiveScan = filtered.scan;
    } else {
        await store.importFile(
            archiveFile,
            undefined,
            dictionary.url,
            {
                persistArchive: false,
                integrity: dictionary,
            },
        );
        archiveScan = { mode: 'full-production-import' };
    }

    const evidenceTerms = new Map<string, YomitanTermEntry>();
    const measurement = await measureMultilingualParityTarget(targetCorpus, store, (_sentence, matches) => {
        for (const match of matches) {
            const entry = serializableEvidenceTerm(match.entry);
            evidenceTerms.set(evidenceTermKey(entry), entry);
        }
    });
    await store.clear();
    const percent = Number(((measurement.annotated / measurement.contentWords) * 100).toFixed(1));
    return {
        language,
        lookupContractSha256,
        dictionary,
        archiveScan,
        sentences: targetCorpus.sentences.length,
        ...measurement,
        percent,
        suggestedBar: percent >= SUGGESTED_BENCHMARK_PERCENT ? 'MEETS' : 'BELOW',
        evidenceTerms: [...evidenceTerms.values()],
    };
}

function installWindowAlias(): void {
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: globalThis,
        writable: true,
    });
}

function suppressRuntimeLogs(): () => void {
    const original = {
        debug: console.debug,
        info: console.info,
        log: console.log,
        warn: console.warn,
    };
    console.debug = () => undefined;
    console.info = () => undefined;
    console.log = () => undefined;
    console.warn = () => undefined;
    return () => {
        console.debug = original.debug;
        console.info = original.info;
        console.log = original.log;
        console.warn = original.warn;
    };
}

async function runTargetChild(
    targetCorpus: MultilingualParityTargetCorpus,
    cacheDir: string,
): Promise<TargetMeasurement> {
    const scriptPath = fileURLToPath(import.meta.url);
    const viteNodePath = resolve('node_modules/vite-node/vite-node.mjs');
    // Finnish's published WTY archive is 118 MiB compressed and expands to a
    // fake-indexeddb store large enough to exhaust the ordinary 12 GiB worker.
    // Keep the larger heap isolated to that one authoritative regeneration;
    // the checked-in evidence replay stays on the normal release-gate budget.
    const heapMb = targetCorpus.language === 'fi' ? 24_576 : 12_288;
    return new Promise<TargetMeasurement>((resolveResult, reject) => {
        const child = spawn(process.execPath, [
            `--max-old-space-size=${heapMb}`,
            viteNodePath,
            '--mode',
            'production',
            scriptPath,
            '--target',
            targetCorpus.language,
            '--cache-dir',
            cacheDir,
        ], {
            env: process.env,
            stdio: ['ignore', 'pipe', 'inherit'],
        });
        let pending = '';
        let result: TargetMeasurement | undefined;
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            pending += chunk;
            const lines = pending.split('\n');
            pending = lines.pop() ?? '';
            for (const line of lines) {
                if (line.startsWith(CHILD_RESULT_PREFIX)) {
                    result = JSON.parse(line.slice(CHILD_RESULT_PREFIX.length)) as TargetMeasurement;
                } else if (line) {
                    process.stderr.write(`${line}\n`);
                }
            }
        });
        child.on('error', reject);
        child.on('close', code => {
            if (code !== 0) {
                reject(new Error(`Measurement child for ${targetCorpus.language} exited ${String(code)}.`));
            } else if (!result) {
                reject(new Error(`Measurement child for ${targetCorpus.language} returned no result.`));
            } else {
                resolveResult(result);
            }
        });
    });
}

async function runMetadata(): Promise<MultilingualParityCheckpointIdentity> {
    const [commit, status] = await Promise.all([
        execFile('git', ['rev-parse', 'HEAD']).then(result => result.stdout.trim()),
        execFile('git', ['status', '--porcelain=v1', '--untracked-files=all']).then(result => result.stdout.trim()),
    ]);
    return {
        schemaVersion: MULTILINGUAL_PARITY_SCHEMA_VERSION,
        measurementMode: MULTILINGUAL_PARITY_MEASUREMENT_MODE,
        measurementAlgorithmVersion: MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION,
        gitCommit: commit,
        gitDirty: Boolean(status),
        gitStatusSha256: createHash('sha256').update(status).digest('hex'),
        node: process.version,
        icu: process.versions.icu ?? 'unknown',
        corpusSha256: multilingualParityCorpusSha256(),
    };
}

function baselineResult(result: TargetMeasurement): Omit<TargetMeasurement, 'evidenceTerms'> {
    const { evidenceTerms: _evidenceTerms, ...baseline } = result;
    return baseline;
}

async function writeJson(path: string | undefined, value: unknown): Promise<void> {
    if (!path) return;
    const outputPath = resolve(path);
    await mkdir(dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
    try {
        await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        await rename(temporaryPath, outputPath);
    } finally {
        await rm(temporaryPath, { force: true });
    }
}

async function checkpointResults(
    path: string | undefined,
    expectedIdentity: MultilingualParityCheckpointIdentity,
    corpus: readonly MultilingualParityTargetCorpus[],
): Promise<TargetMeasurement[]> {
    if (!path) return [];
    try {
        const checkpoint = JSON.parse(await readFile(resolve(path), 'utf8')) as Partial<MultilingualParityCheckpoint>;
        const identityFailures = multilingualParityCheckpointIdentityFailures(checkpoint, expectedIdentity);
        if (identityFailures.length || !Array.isArray(checkpoint.results)) {
            const reasons = [
                ...identityFailures,
                ...(!Array.isArray(checkpoint.results) ? ['checkpoint results are absent'] : []),
            ];
            process.stderr.write(`Discarding checkpoint: ${reasons.join('; ')}.\n`);
            return [];
        }
        const supportedLanguages = new Set(corpus.map(target => target.language));
        const seenLanguages = new Set<string>();
        const valid: TargetMeasurement[] = [];
        for (const result of checkpoint.results) {
            if (!supportedLanguages.has(result.language) || seenLanguages.has(result.language)) {
                process.stderr.write(`Discarding invalid checkpoint row for ${result.language}.\n`);
                continue;
            }
            seenLanguages.add(result.language);
            const expectedContract = await multilingualParityLookupContractSha256(result.language);
            if (result.lookupContractSha256 === expectedContract) {
                valid.push(result);
            } else {
                process.stderr.write(`Discarding stale checkpoint for ${result.language}; lookup contract changed.\n`);
            }
        }
        return valid;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        if (error instanceof SyntaxError) {
            process.stderr.write('Discarding malformed checkpoint JSON.\n');
            return [];
        }
        throw error;
    }
}

async function main(): Promise<void> {
    const corpus = multilingualParityCorpus();
    const cacheDir = resolve(cliValue('--cache-dir') ?? DEFAULT_CACHE_DIR);
    const selectedLanguage = cliValue('--target');
    if (selectedLanguage) {
        const targetCorpus = corpus.find(target => target.language === selectedLanguage);
        if (!targetCorpus) throw new Error(`Unsupported --target ${selectedLanguage}.`);
        installWindowAlias();
        const restoreLogs = suppressRuntimeLogs();
        try {
            const result = await measureTarget(targetCorpus, cacheDir);
            process.stdout.write(`${CHILD_RESULT_PREFIX}${JSON.stringify(result)}\n`);
        } finally {
            restoreLogs();
            resetActiveLearningTargetLanguage();
        }
        return;
    }

    const checkpointPath = cliValue('--checkpoint');
    const startMetadata = await runMetadata();
    const results = await checkpointResults(checkpointPath, startMetadata, corpus);
    for (const targetCorpus of corpus) {
        if (results.some(result => result.language === targetCorpus.language)) {
            process.stderr.write(`Reusing checkpoint for ${targetCorpus.language}.\n`);
            continue;
        }
        process.stderr.write(`Measuring ${targetCorpus.language} with ${publishedDictionary(targetCorpus.language).id}...\n`);
        results.push(await runTargetChild(targetCorpus, cacheDir));
        await writeJson(checkpointPath, {
            ...startMetadata,
            results,
        } satisfies MultilingualParityCheckpoint);
    }
    results.sort((left, right) => corpus.findIndex(target => target.language === left.language) - corpus.findIndex(target => target.language === right.language));
    const endMetadata = await runMetadata();
    if (!isDeepStrictEqual(endMetadata, startMetadata)) {
        throw new Error('Measurement source, runtime, or worktree state changed while the parity run was in progress.');
    }
    const baseline = {
        measuredAt: new Date().toISOString(),
        ...startMetadata,
        suggestedBenchmarkPercent: SUGGESTED_BENCHMARK_PERCENT,
        corpusRule: MULTILINGUAL_PARITY_CORPUS_RULE,
        results: results.map(baselineResult),
    };
    const evidence = {
        schemaVersion: MULTILINGUAL_PARITY_SCHEMA_VERSION,
        measurementMode: MULTILINGUAL_PARITY_MEASUREMENT_MODE,
        measurementAlgorithmVersion: MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION,
        generatedAt: baseline.measuredAt,
        corpusSha256: startMetadata.corpusSha256,
        targets: results.map(result => ({
            language: result.language,
            lookupContractSha256: result.lookupContractSha256,
            dictionary: result.dictionary,
            archiveScan: result.archiveScan,
            terms: result.evidenceTerms.map(serializableEvidenceTerm),
        })),
    };
    console.table(results.map(result => ({
        language: result.language,
        annotated: result.annotated,
        contentWords: result.contentWords,
        percent: `${result.percent.toFixed(1)}%`,
        suggestedBar: result.suggestedBar,
    })));
    await writeJson(cliValue('--json'), { baseline, evidence });
    await writeJson(cliValue('--write-baseline'), baseline);
    await writeJson(cliValue('--write-evidence'), evidence);
}

const invokedAsNpmHarness = process.env.npm_lifecycle_event === 'manual:multilingual-parity';
const invokedWithScriptArg = process.argv.slice(1)
    .some(argument => resolve(argument) === fileURLToPath(import.meta.url));
if (invokedAsNpmHarness || invokedWithScriptArg) {
    await main();
}
