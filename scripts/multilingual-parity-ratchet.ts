import 'fake-indexeddb/auto';
import { parityDictionaryId } from './lib/multilingual-parity-dictionary';

import { File as NodeFile } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import publishedCatalogJson from '../config/dictionaries/published/v1/catalog.json';
import { YomitanDictionaryStore, type YomitanTermEntry } from '../src/reader/dictionaries/yomitan';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../src/reader/languages/active';
import {
    MULTILINGUAL_PARITY_CORPUS_RULE,
    multilingualParityCorpus,
    multilingualParityCorpusSha256,
    multilingualParityGoldSpans,
    type MultilingualParityTargetCorpus,
} from './lib/multilingual-parity-corpus';
import {
    MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION,
    MULTILINGUAL_PARITY_MEASUREMENT_MODE,
    MULTILINGUAL_PARITY_SCHEMA_VERSION,
    measureMultilingualParityTarget,
    multilingualParityContractState,
    multilingualParityRuntimeIdentity,
    multilingualParityToolchainManifestFailures,
    multilingualParityWrittenCheckpointFailures,
    type MultilingualParityContractInput,
    type MultilingualParityMeasurement,
    type MultilingualParitySpan,
} from './lib/multilingual-parity-contract';
import {
    multilingualParityArchiveScanMode,
    type MultilingualParityArchiveScan,
} from './lib/multilingual-parity-archive';

interface PublishedCatalogEntry {
    id: string;
    title: string;
    version: string;
    categories: string[];
    headwordLanguages: string[];
    definitionLanguages: string[];
    license: unknown;
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

export interface DictionaryEvidence {
    id: string;
    title: string;
    version: string;
    catalogRevision: string;
    sha256: string;
    bytes: number;
    url: string;
    license: unknown;
}

export interface BaselineTarget {
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
}

export interface MultilingualParityBaseline {
    schemaVersion: number;
    measurementMode: string;
    measurementAlgorithmVersion: string;
    measuredAt: string;
    gitCommit: string;
    gitDirty: boolean;
    gitStatusSha256: string;
    node: string;
    icu: string;
    defaultLocale: string;
    corpusSha256: string;
    corpusRule: string;
    suggestedBenchmarkPercent: number;
    lookupContractInputs: MultilingualParityContractInput[];
    results: BaselineTarget[];
}

export interface EvidenceTarget {
    language: string;
    lookupContractSha256: string;
    dictionary: DictionaryEvidence;
    archiveScan: MultilingualParityArchiveScan;
    terms: YomitanTermEntry[];
}

export interface MultilingualParityEvidence {
    schemaVersion: number;
    measurementMode: string;
    measurementAlgorithmVersion: string;
    generatedAt: string;
    corpusSha256: string;
    lookupContractInputs: MultilingualParityContractInput[];
    targets: EvidenceTarget[];
}

const catalog = publishedCatalogJson as PublishedCatalog;
const BASELINE_PATH = resolve('config/quality/multilingual-lookup-baseline.json');
const EVIDENCE_PATH = resolve('config/quality/multilingual-lookup-evidence.json');
const SUGGESTED_BENCHMARK_PERCENT = 60;
const CLEAN_GIT_STATUS_SHA256 = createHash('sha256').update('').digest('hex');
const rosterLanguages = multilingualParityCorpus().map(target => target.language);
const contractState = await multilingualParityContractState(rosterLanguages);
const expectedLookupContracts = contractState.contractByLanguage;
// Async, so it cannot run inside the synchronous validator the tests call.
const toolchainManifestFailures = await multilingualParityToolchainManifestFailures();

async function readJson<T>(path: string): Promise<T> {
    return JSON.parse(await readFile(path, 'utf8')) as T;
}

function sameTargetSet(actual: readonly string[], expected: readonly string[]): boolean {
    return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}



function expectedDictionaryEvidence(entry: PublishedCatalogEntry): DictionaryEvidence {
    return {
        id: entry.id,
        title: entry.title,
        version: entry.version,
        catalogRevision: catalog.revision,
        sha256: entry.distribution.object.sha256,
        bytes: entry.distribution.object.bytes,
        url: new URL(entry.distribution.object.key, catalog.objectsBaseUrl).href,
        license: entry.license,
    };
}

function dictionaryProvenanceFailures(
    label: string,
    actual: DictionaryEvidence | undefined,
    expected: DictionaryEvidence,
): string[] {
    if (!actual || typeof actual !== 'object') return [`${label} dictionary provenance is absent`];
    const failures: string[] = [];
    for (const field of ['id', 'title', 'version', 'catalogRevision', 'sha256', 'bytes', 'url'] as const) {
        if (actual[field] !== expected[field]) {
            failures.push(`${label} dictionary ${field} differs from the frozen published catalog`);
        }
    }
    if (!isDeepStrictEqual(actual.license, expected.license)) {
        failures.push(`${label} dictionary license differs from the frozen published catalog`);
    }
    return failures;
}

function archiveScanFailures(
    label: string,
    language: string,
    actual: MultilingualParityArchiveScan | undefined,
): string[] {
    if (!actual || typeof actual !== 'object') return [`${label} archive scan provenance is absent`];
    const expectedMode = multilingualParityArchiveScanMode(language);
    const failures: string[] = [];
    if (actual.mode !== expectedMode) {
        failures.push(`${label} archive scan mode is ${String(actual.mode)}, expected ${expectedMode}`);
    }
    if (expectedMode !== 'candidate-filtered-full-archive') return failures;
    for (const field of ['termBanks', 'scannedTermRows', 'retainedTermRows'] as const) {
        if (!Number.isInteger(actual[field]) || Number(actual[field]) < 0) {
            failures.push(`${label} archive scan ${field} is absent or invalid`);
        }
    }
    if (Number(actual.termBanks) === 0) failures.push(`${label} archive scan contains no term banks`);
    if (Number(actual.scannedTermRows) === 0) failures.push(`${label} archive scan contains no term rows`);
    if (Number(actual.retainedTermRows) > Number(actual.scannedTermRows)) {
        failures.push(`${label} archive scan retained more rows than it scanned`);
    }
    return failures;
}

function roundedPercent(annotated: number, contentWords: number): number {
    return Number(((annotated / contentWords) * 100).toFixed(1));
}

function corpusCounts(target: MultilingualParityTargetCorpus): { sentences: number; contentWords: number } {
    return {
        sentences: target.sentences.length,
        contentWords: target.sentences.reduce(
            (total, sentence) => total + multilingualParityGoldSpans(sentence).length,
            0,
        ),
    };
}

function corpusGoldSpans(target: MultilingualParityTargetCorpus): MultilingualParitySpan[] {
    return target.sentences.flatMap(sentence => multilingualParityGoldSpans(sentence));
}

function spanKey(span: MultilingualParitySpan): string {
    return JSON.stringify([span.sentenceId, span.start, span.end, span.word]);
}

function baselineMissFailures(
    language: string,
    actual: unknown,
    targetCorpus: MultilingualParityTargetCorpus,
    annotated: number,
): string[] {
    if (!Array.isArray(actual)) return [`${language}: baseline exact misses are absent or not an array`];
    const failures: string[] = [];
    const goldSpans = corpusGoldSpans(targetCorpus);
    const goldByKey = new Map(goldSpans.map(span => [spanKey(span), span]));
    const misses = actual as MultilingualParitySpan[];
    const seen = new Set<string>();
    for (const miss of misses) {
        if (!miss || typeof miss !== 'object') {
            failures.push(`${language}: baseline exact misses contain a malformed row`);
            continue;
        }
        const key = spanKey(miss);
        const gold = goldByKey.get(key);
        if (!gold || !isDeepStrictEqual(miss, gold)) {
            failures.push(`${language}: baseline exact miss is not a corpus gold span`);
        }
        if (seen.has(key)) failures.push(`${language}: baseline exact misses contain a duplicate span`);
        seen.add(key);
    }
    const expectedMissCount = goldSpans.length - annotated;
    if (misses.length !== expectedMissCount) {
        failures.push(
            `${language}: baseline exact-miss count is ${misses.length}, expected ${expectedMissCount}`,
        );
    }
    const orderedMisses = goldSpans.filter(span => seen.has(spanKey(span)));
    if (orderedMisses.length === misses.length && !isDeepStrictEqual(misses, orderedMisses)) {
        failures.push(`${language}: baseline exact misses are not in corpus order`);
    }
    return failures;
}

export function validateMultilingualParityInputs(
    baseline: MultilingualParityBaseline,
    evidence: MultilingualParityEvidence,
    corpus: readonly MultilingualParityTargetCorpus[] = multilingualParityCorpus(),
): string[] {
    // Split into a document pass and four per-target passes because the
    // complexity ratchet was right that one 170-line validator is not
    // reviewable: every check here is independent, so each group is now
    // separately testable and the orchestration below reads as the order the
    // failures are reported in.
    const baselineResults = Array.isArray(baseline.results) ? baseline.results : [];
    const evidenceTargets = Array.isArray(evidence.targets) ? evidence.targets : [];
    const failures: string[] = [
        ...parityDocumentFailures(baseline, evidence, corpus, baselineResults, evidenceTargets),
    ];
    for (const targetCorpus of corpus) {
        const { language } = targetCorpus;
        const baselineTarget = baselineResults.find(result => result.language === language);
        const evidenceTarget = evidenceTargets.find(target => target.language === language);
        if (!baselineTarget || !evidenceTarget) continue;

        const dictionaryId = parityDictionaryId(language);
        const catalogEntry = catalog.entries.find(entry => entry.id === dictionaryId);
        if (!catalogEntry) {
            failures.push(`${language}: frozen published catalog has no ${dictionaryId}`);
            continue;
        }
        failures.push(
            ...parityCatalogFailures(language, dictionaryId, catalogEntry),
            ...parityProvenanceFailures(language, catalogEntry, baselineTarget, evidenceTarget),
            ...parityCountFailures(language, targetCorpus, baselineTarget),
        );
        if (!Array.isArray(evidenceTarget.terms)) {
            failures.push(`${language}: evidence terms are absent or not an array`);
        }
    }
    return failures;
}

/** Checks that describe the run as a whole rather than any one target. */
function parityDocumentFailures(
    baseline: MultilingualParityBaseline,
    evidence: MultilingualParityEvidence,
    corpus: readonly MultilingualParityTargetCorpus[],
    baselineResults: MultilingualParityBaseline['results'],
    evidenceTargets: MultilingualParityEvidence['targets'],
): string[] {
    const failures: string[] = [];
    const languages = corpus.map(target => target.language);
    const corpusSha256 = multilingualParityCorpusSha256(corpus);
    if (!Array.isArray(baseline.results)) failures.push('baseline results are absent or not an array');
    if (!Array.isArray(evidence.targets)) failures.push('evidence targets are absent or not an array');
    if (baseline.schemaVersion !== MULTILINGUAL_PARITY_SCHEMA_VERSION) {
        failures.push(`baseline schema is ${baseline.schemaVersion}, expected ${MULTILINGUAL_PARITY_SCHEMA_VERSION}`);
    }
    if (evidence.schemaVersion !== MULTILINGUAL_PARITY_SCHEMA_VERSION) {
        failures.push(`evidence schema is ${evidence.schemaVersion}, expected ${MULTILINGUAL_PARITY_SCHEMA_VERSION}`);
    }
    if (baseline.measurementMode !== MULTILINGUAL_PARITY_MEASUREMENT_MODE) {
        failures.push(`baseline measurement mode is ${baseline.measurementMode}, expected ${MULTILINGUAL_PARITY_MEASUREMENT_MODE}`);
    }
    if (evidence.measurementMode !== MULTILINGUAL_PARITY_MEASUREMENT_MODE) {
        failures.push(`evidence measurement mode is ${evidence.measurementMode}, expected ${MULTILINGUAL_PARITY_MEASUREMENT_MODE}`);
    }
    if (baseline.measurementAlgorithmVersion !== MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION) {
        failures.push(
            `baseline measurement algorithm is ${baseline.measurementAlgorithmVersion}, expected ${MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION}`,
        );
    }
    if (evidence.measurementAlgorithmVersion !== MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION) {
        failures.push(
            `evidence measurement algorithm is ${evidence.measurementAlgorithmVersion}, expected ${MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION}`,
        );
    }
    if (baseline.corpusSha256 !== corpusSha256) failures.push('baseline corpus SHA-256 is stale');
    if (evidence.corpusSha256 !== corpusSha256) failures.push('evidence corpus SHA-256 is stale');
    // Shared verbatim with the recorder's post-write self-check, so the gate and
    // the tool that has to satisfy it cannot disagree about what "stale" means.
    // These name the input files that moved: the aggregate digest alone reported
    // 33 targets and no cause, which is how a rewritten package-lock.json read
    // as an algorithm change twice.
    failures.push(
        ...toolchainManifestFailures,
        ...multilingualParityWrittenCheckpointFailures(
            'baseline',
            { lookupContractInputs: baseline.lookupContractInputs, rows: baselineResults },
            contractState,
        ),
        ...multilingualParityWrittenCheckpointFailures(
            'evidence',
            { lookupContractInputs: evidence.lookupContractInputs, rows: evidenceTargets },
            contractState,
        ),
    );
    if (baseline.suggestedBenchmarkPercent !== SUGGESTED_BENCHMARK_PERCENT) {
        failures.push(
            `baseline suggested benchmark is ${baseline.suggestedBenchmarkPercent}, expected ${SUGGESTED_BENCHMARK_PERCENT}`,
        );
    }
    if (baseline.corpusRule !== MULTILINGUAL_PARITY_CORPUS_RULE) {
        failures.push('baseline corpus rule differs from the executable exact-span rule');
    }
    failures.push(...parityProvenanceMetadataFailures(baseline, evidence));
    if (!sameTargetSet(baselineResults.map(result => result.language), languages)) {
        failures.push('baseline target set differs from the learning-target roster');
    }
    if (!sameTargetSet(evidenceTargets.map(target => target.language), languages)) {
        failures.push('evidence target set differs from the learning-target roster');
    }
    if (new Set(baselineResults.map(result => result.language)).size !== baselineResults.length) {
        failures.push('baseline contains a duplicate target');
    }
    if (new Set(evidenceTargets.map(target => target.language)).size !== evidenceTargets.length) {
        failures.push('evidence contains a duplicate target');
    }
    return failures;
}

/** Where the numbers came from: clean worktree, known commit, matching runtime. */
function parityProvenanceMetadataFailures(
    baseline: MultilingualParityBaseline,
    evidence: MultilingualParityEvidence,
): string[] {
    const failures: string[] = [];
    if (baseline.gitDirty !== false) {
        failures.push('baseline was not generated from a clean worktree');
    }
    if (baseline.gitStatusSha256 !== CLEAN_GIT_STATUS_SHA256) {
        failures.push('baseline git status digest is not clean');
    }
    if (!/^[0-9a-f]{40}$/u.test(baseline.gitCommit)) {
        failures.push('baseline source commit is absent or malformed');
    }
    if (!Number.isFinite(Date.parse(baseline.measuredAt))) {
        failures.push('baseline measurement timestamp is absent or malformed');
    }
    if (evidence.generatedAt !== baseline.measuredAt) {
        failures.push('evidence timestamp differs from the baseline measurement');
    }
    const currentRuntime = multilingualParityRuntimeIdentity();
    if (baseline.node !== currentRuntime.node) {
        failures.push(`baseline Node runtime is ${baseline.node}, current runtime is ${currentRuntime.node}`);
    }
    if (baseline.icu !== currentRuntime.icu) {
        failures.push(`baseline ICU runtime is ${baseline.icu}, current runtime is ${currentRuntime.icu}`);
    }
    if (baseline.defaultLocale !== currentRuntime.defaultLocale) {
        failures.push(
            `baseline default locale is ${String(baseline.defaultLocale)}, current locale is ${currentRuntime.defaultLocale}`,
        );
    }
    return failures;
}

function parityCatalogFailures(
    language: string,
    dictionaryId: string,
    catalogEntry: typeof catalog.entries[number],
): string[] {
    const failures: string[] = [];
    if (catalogEntry.distribution.state !== 'published' || !catalogEntry.categories.includes('terms')) {
        failures.push(`${language}: ${dictionaryId} is not a published terms dictionary`);
    }
    if (
        !catalogEntry.headwordLanguages.includes(language)
        || !catalogEntry.definitionLanguages.includes('en')
    ) {
        failures.push(`${language}: ${dictionaryId} has the wrong headword or definition language`);
    }
    return failures;
}

function parityProvenanceFailures(
    language: string,
    catalogEntry: typeof catalog.entries[number],
    baselineTarget: MultilingualParityBaselineResult,
    evidenceTarget: MultilingualParityEvidenceTarget,
): string[] {
    const expectedDictionary = expectedDictionaryEvidence(catalogEntry);
    const failures = [
        ...dictionaryProvenanceFailures(`${language}: baseline`, baselineTarget.dictionary, expectedDictionary),
        ...dictionaryProvenanceFailures(`${language}: evidence`, evidenceTarget.dictionary, expectedDictionary),
        ...archiveScanFailures(`${language}: baseline`, language, baselineTarget.archiveScan),
        ...archiveScanFailures(`${language}: evidence`, language, evidenceTarget.archiveScan),
    ];
    if (!isDeepStrictEqual(baselineTarget.archiveScan, evidenceTarget.archiveScan)) {
        failures.push(`${language}: baseline and evidence archive scan provenance differ`);
    }
    return failures;
}

function parityCountFailures(
    language: string,
    targetCorpus: MultilingualParityTargetCorpus,
    baselineTarget: MultilingualParityBaselineResult,
): string[] {
    const failures: string[] = [];
    const expectedCounts = corpusCounts(targetCorpus);
    if (!Number.isInteger(baselineTarget.sentences) || baselineTarget.sentences !== expectedCounts.sentences) {
        failures.push(
            `${language}: baseline sentence count is ${baselineTarget.sentences}, expected ${expectedCounts.sentences}`,
        );
    }
    if (
        !Number.isInteger(baselineTarget.contentWords)
        || baselineTarget.contentWords !== expectedCounts.contentWords
    ) {
        failures.push(
            `${language}: baseline content-word total is ${baselineTarget.contentWords}, expected ${expectedCounts.contentWords}`,
        );
    }
    const annotatedIsValid = Number.isInteger(baselineTarget.annotated)
        && baselineTarget.annotated >= 0
        && baselineTarget.annotated <= expectedCounts.contentWords;
    if (!annotatedIsValid) {
        failures.push(
            `${language}: baseline annotated count ${baselineTarget.annotated} is outside 0..${expectedCounts.contentWords}`,
        );
        return failures;
    }
    const expectedPercent = roundedPercent(baselineTarget.annotated, expectedCounts.contentWords);
    if (!Number.isFinite(baselineTarget.percent) || baselineTarget.percent !== expectedPercent) {
        failures.push(
            `${language}: baseline percent is ${baselineTarget.percent}, expected ${expectedPercent.toFixed(1)}`,
        );
    }
    const expectedStatus = expectedPercent >= SUGGESTED_BENCHMARK_PERCENT ? 'MEETS' : 'BELOW';
    if (baselineTarget.suggestedBar !== expectedStatus) {
        failures.push(
            `${language}: baseline suggested status is ${baselineTarget.suggestedBar}, expected ${expectedStatus}`,
        );
    }
    failures.push(
        ...baselineMissFailures(language, baselineTarget.misses, targetCorpus, baselineTarget.annotated),
    );
    return failures;
}

async function importEvidence(store: YomitanDictionaryStore, target: EvidenceTarget): Promise<void> {
    await store.clear();
    if (!target.terms.length) return;
    await store.importFile(new NodeFile([JSON.stringify({
        formatName: 'yomu-yomitan-dictionaries',
        formatVersion: 2,
        terms: target.terms,
    })], `${target.language}-published-evidence.json`, { type: 'application/json' }) as unknown as File);
}

async function measuredAnnotated(language: string, target: EvidenceTarget): Promise<MultilingualParityMeasurement> {
    const targetCorpus = multilingualParityCorpus().find(candidate => candidate.language === language);
    if (!targetCorpus) throw new Error(`${language}: corpus is absent.`);
    if (!setActiveLearningTargetLanguage(language)) throw new Error(`${language}: target module is absent.`);
    const store = new YomitanDictionaryStore();
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
    try {
        await importEvidence(store, target);
        const measurement = await measureMultilingualParityTarget(targetCorpus, store);
        await store.clear();
        return measurement;
    } finally {
        console.debug = original.debug;
        console.info = original.info;
        console.log = original.log;
        console.warn = original.warn;
    }
}

export function multilingualParityMeasurementFailures(
    language: string,
    expected: Pick<BaselineTarget, 'annotated' | 'contentWords' | 'misses'>,
    measured: MultilingualParityMeasurement,
): string[] {
    const failures: string[] = [];
    if (measured.contentWords !== expected.contentWords) {
        failures.push(`${language}: content-word total changed from ${expected.contentWords} to ${measured.contentWords}`);
    } else if (measured.annotated < expected.annotated) {
        failures.push(`${language}: coverage fell from ${expected.annotated}/${expected.contentWords} to ${measured.annotated}/${measured.contentWords}`);
    } else if (measured.annotated > expected.annotated) {
        failures.push(`${language}: coverage improved from ${expected.annotated}/${expected.contentWords} to ${measured.annotated}/${measured.contentWords}; refresh the baseline so it cannot regress`);
    }
    if (!isDeepStrictEqual(measured.misses, expected.misses)) {
        failures.push(`${language}: exact miss spans changed; refresh the authoritative baseline`);
    }
    return failures;
}

async function main(): Promise<void> {
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: globalThis,
        writable: true,
    });
    const corpus = multilingualParityCorpus();
    const languages = corpus.map(target => target.language);
    const [baseline, evidence] = await Promise.all([
        readJson<MultilingualParityBaseline>(BASELINE_PATH),
        readJson<MultilingualParityEvidence>(EVIDENCE_PATH),
    ]);
    const failures = validateMultilingualParityInputs(baseline, evidence, corpus);
    const rows: Array<Record<string, string | number>> = [];
    if (failures.length) {
        for (const failure of failures) console.error(`[multilingual-parity] ${failure}`);
        process.exitCode = 1;
        return;
    }
    try {
        for (const language of languages) {
            const expected = baseline.results.find(result => result.language === language);
            const targetEvidence = evidence.targets.find(target => target.language === language);
            if (!expected || !targetEvidence) continue;
            const measured = await measuredAnnotated(language, targetEvidence);
            const percent = roundedPercent(measured.annotated, measured.contentWords);
            rows.push({
                language,
                annotated: measured.annotated,
                contentWords: measured.contentWords,
                percent: `${percent.toFixed(1)}%`,
                baseline: `${expected.percent.toFixed(1)}%`,
            });
            failures.push(...multilingualParityMeasurementFailures(language, expected, measured));
        }
    } finally {
        resetActiveLearningTargetLanguage();
    }
    console.table(rows);
    if (failures.length) {
        for (const failure of failures) console.error(`[multilingual-parity] ${failure}`);
        process.exitCode = 1;
        return;
    }
    console.log(`[multilingual-parity] PASS: ${rows.length} targets equal their published-dictionary baseline.`);
}

const invokedAsNpmGate = process.env.npm_lifecycle_event === 'quality:multilingual-parity';
const invokedWithScriptArg = process.argv.slice(1)
    .some(argument => resolve(argument) === fileURLToPath(import.meta.url));
if (invokedAsNpmGate || invokedWithScriptArg) {
    await main();
}
