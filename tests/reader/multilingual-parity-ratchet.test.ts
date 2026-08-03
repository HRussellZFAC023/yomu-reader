import { createHash } from 'node:crypto';
import { parityDictionaryId } from '../../scripts/lib/multilingual-parity-dictionary';
import { readFile } from 'node:fs/promises';
import publishedCatalogJson from '../../config/dictionaries/published/v1/catalog.json';
import { describe, expect, it, vi } from 'vitest';

const SUGGESTED_BENCHMARK_PERCENT = 60;
// The corpus module deliberately reuses the older manual real-archive harness.
// Resolve both script modules at runtime so this focused test does not pull that
// executable's Node File/DOM File declarations into the repository tsc graph.
const ratchetModulePath = '../../scripts/' + 'multilingual-parity-ratchet';
const corpusModulePath = '../../scripts/lib/' + 'multilingual-parity-corpus';

interface DictionaryEvidence {
    id: string;
    title: string;
    version: string;
    catalogRevision: string;
    sha256: string;
    bytes: number;
    url: string;
    license: unknown;
}

interface BaselineTarget {
    language: string;
    lookupContractSha256: string;
    dictionary: DictionaryEvidence;
    archiveScan: ArchiveScan;
    sentences: number;
    annotated: number;
    contentWords: number;
    percent: number;
    suggestedBar: 'MEETS' | 'BELOW';
    misses: Span[];
}

interface MultilingualParityBaseline {
    schemaVersion: number;
    measurementMode: string;
    measurementAlgorithmVersion: string;
    measuredAt: string;
    gitCommit: string;
    gitDirty: boolean;
    gitStatusSha256: string;
    node: string;
    icu: string;
    corpusSha256: string;
    corpusRule: string;
    suggestedBenchmarkPercent: number;
    results: BaselineTarget[];
}

interface MultilingualParityEvidence {
    schemaVersion: number;
    measurementMode: string;
    measurementAlgorithmVersion: string;
    generatedAt: string;
    corpusSha256: string;
    targets: Array<{
        language: string;
        lookupContractSha256: string;
        dictionary: DictionaryEvidence;
        archiveScan: ArchiveScan;
        terms: unknown[];
    }>;
}

interface ArchiveScan {
    mode: 'full-production-import' | 'candidate-filtered-full-archive';
    termBanks?: number;
    scannedTermRows?: number;
    retainedTermRows?: number;
}

interface Span {
    sentenceId: string;
    word: string;
    start: number;
    end: number;
}

interface TargetSentence {
    id: string;
    text: string;
    contentWords: string[];
}

interface TargetCorpus {
    language: string;
    source: {
        kind: string;
        story: string;
        license: string;
        reviewStatus: string;
    };
    sentences: TargetSentence[];
}

const {
    multilingualParityMeasurementFailures,
    validateMultilingualParityInputs,
} = await import(ratchetModulePath) as {
    multilingualParityMeasurementFailures: (
        language: string,
        expected: Pick<BaselineTarget, 'annotated' | 'contentWords' | 'misses'>,
        measured: { annotated: number; contentWords: number; misses: Span[] },
    ) => string[];
    validateMultilingualParityInputs: (
        baseline: MultilingualParityBaseline,
        evidence: MultilingualParityEvidence,
    ) => string[];
};
const {
    MULTILINGUAL_PARITY_CORPUS_RULE,
    multilingualParityCorpus,
    multilingualParityCorpusSha256,
    multilingualParityGoldSpans,
} = await import(corpusModulePath) as {
    multilingualParityCorpus: () => readonly TargetCorpus[];
    multilingualParityCorpusSha256: () => string;
    multilingualParityGoldSpans: (sentence: TargetSentence) => Span[];
    MULTILINGUAL_PARITY_CORPUS_RULE: string;
};
const contractModulePath = '../../scripts/lib/' + 'multilingual-parity-contract';
const {
    MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION,
    MULTILINGUAL_PARITY_MEASUREMENT_MODE,
    MULTILINGUAL_PARITY_SCHEMA_VERSION,
    measureMultilingualParityTarget,
    multilingualParityCheckpointIdentityFailures,
    multilingualParityLookupContractSourceFiles,
    multilingualParityLookupContractSha256,
} = await import(contractModulePath) as {
    MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION: string;
    MULTILINGUAL_PARITY_MEASUREMENT_MODE: string;
    MULTILINGUAL_PARITY_SCHEMA_VERSION: number;
    measureMultilingualParityTarget: (
        target: TargetCorpus,
        matcher: { findTermMatches(text: string, limit?: number): Promise<Array<{ start: number; end: number }>> },
    ) => Promise<{ annotated: number; contentWords: number; misses: Span[] }>;
    multilingualParityCheckpointIdentityFailures: (
        actual: Partial<CheckpointIdentity>,
        expected: CheckpointIdentity,
    ) => string[];
    multilingualParityLookupContractSourceFiles: (language: string) => Promise<readonly string[]>;
    multilingualParityLookupContractSha256: (language: string) => Promise<string>;
};

interface CheckpointIdentity {
    schemaVersion: number;
    measurementMode: string;
    measurementAlgorithmVersion: string;
    gitCommit: string;
    gitDirty: boolean;
    gitStatusSha256: string;
    node: string;
    icu: string;
    corpusSha256: string;
}

function dictionaryEvidence(language: string): DictionaryEvidence {
    // Resolved the same way production does, rather than re-stating the old
    // `wty-<lang>-en` convention here. A fixture that hardcodes the convention
    // agrees with a ratchet that has drifted away from the product, which is how
    // Cantonese stayed measured against a 28 KB archive nobody installs.
    const id = parityDictionaryId(language);
    const entry = publishedCatalogJson.entries.find(candidate => candidate.id === id);
    if (!entry?.distribution.object) throw new Error(`Test fixture cannot find ${id}.`);
    return {
        id,
        title: entry.title,
        version: entry.version,
        catalogRevision: publishedCatalogJson.revision,
        sha256: entry.distribution.object.sha256,
        bytes: entry.distribution.object.bytes,
        url: new URL(entry.distribution.object.key, publishedCatalogJson.objectsBaseUrl).href,
        license: entry.license,
    };
}

function archiveScan(language: string): ArchiveScan {
    return language === 'fi'
        ? {
            mode: 'candidate-filtered-full-archive',
            termBanks: 1,
            scannedTermRows: 1,
            retainedTermRows: 0,
        }
        : { mode: 'full-production-import' };
}

async function validInputs(): Promise<{
    baseline: MultilingualParityBaseline;
    evidence: MultilingualParityEvidence;
}> {
    const corpus = multilingualParityCorpus();
    const corpusSha256 = multilingualParityCorpusSha256();
    const contracts = new Map(await Promise.all(corpus.map(async target => [
        target.language,
        await multilingualParityLookupContractSha256(target.language),
    ] as const)));
    return {
        baseline: {
            schemaVersion: MULTILINGUAL_PARITY_SCHEMA_VERSION,
            measurementMode: MULTILINGUAL_PARITY_MEASUREMENT_MODE,
            measurementAlgorithmVersion: MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION,
            measuredAt: '2026-07-31T00:00:00.000Z',
            gitCommit: '1'.repeat(40),
            gitDirty: false,
            gitStatusSha256: createHash('sha256').update('').digest('hex'),
            node: process.version,
            icu: process.versions.icu ?? 'unknown',
            corpusSha256,
            corpusRule: MULTILINGUAL_PARITY_CORPUS_RULE,
            suggestedBenchmarkPercent: SUGGESTED_BENCHMARK_PERCENT,
            results: corpus.map(target => {
                const contentWords = target.sentences.reduce(
                    (total, sentence) => total + sentence.contentWords.length,
                    0,
                );
                return {
                    language: target.language,
                    lookupContractSha256: contracts.get(target.language) ?? '',
                    dictionary: dictionaryEvidence(target.language),
                    archiveScan: archiveScan(target.language),
                    sentences: target.sentences.length,
                    annotated: 0,
                    contentWords,
                    percent: 0,
                    suggestedBar: 'BELOW' as const,
                    misses: target.sentences.flatMap(sentence => multilingualParityGoldSpans(sentence)),
                };
            }),
        },
        evidence: {
            schemaVersion: MULTILINGUAL_PARITY_SCHEMA_VERSION,
            measurementMode: MULTILINGUAL_PARITY_MEASUREMENT_MODE,
            measurementAlgorithmVersion: MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION,
            generatedAt: '2026-07-31T00:00:00.000Z',
            corpusSha256,
            targets: corpus.map(target => ({
                language: target.language,
                lookupContractSha256: contracts.get(target.language) ?? '',
                dictionary: dictionaryEvidence(target.language),
                archiveScan: archiveScan(target.language),
                terms: [],
            })),
        },
    };
}

describe('multilingual parity ratchet input validation', () => {
    it('accepts corpus-derived counts and frozen published-catalog provenance', async () => {
        const { baseline, evidence } = await validInputs();

        expect(validateMultilingualParityInputs(baseline, evidence)).toEqual([]);
    });

    it('rejects forged provenance even when baseline and evidence agree', async () => {
        const { baseline, evidence } = await validInputs();
        const language = baseline.results[0].language;
        baseline.results[0].dictionary.sha256 = '0'.repeat(64);
        evidence.targets[0].dictionary.sha256 = '0'.repeat(64);

        expect(validateMultilingualParityInputs(baseline, evidence)).toEqual(expect.arrayContaining([
            `${language}: baseline dictionary sha256 differs from the frozen published catalog`,
            `${language}: evidence dictionary sha256 differs from the frozen published catalog`,
        ]));
    });

    it('rejects stale counts, percentage arithmetic, and benchmark status', async () => {
        const { baseline, evidence } = await validInputs();
        const target = baseline.results[0];
        const language = target.language;
        target.sentences--;
        target.contentWords--;
        target.annotated = 1;
        target.percent = 100;
        target.suggestedBar = 'MEETS';

        expect(validateMultilingualParityInputs(baseline, evidence)).toEqual(expect.arrayContaining([
            expect.stringContaining(`${language}: baseline sentence count is`),
            expect.stringContaining(`${language}: baseline content-word total is`),
            expect.stringContaining(`${language}: baseline percent is 100`),
            `${language}: baseline suggested status is MEETS, expected BELOW`,
        ]));
    });

    it('rejects out-of-range annotations and a changed benchmark', async () => {
        const { baseline, evidence } = await validInputs();
        const target = baseline.results[0];
        baseline.suggestedBenchmarkPercent = 75;
        target.annotated = target.contentWords + 1;

        expect(validateMultilingualParityInputs(baseline, evidence)).toEqual(expect.arrayContaining([
            'baseline suggested benchmark is 75, expected 60',
            expect.stringContaining(`${target.language}: baseline annotated count`),
        ]));
    });

    it('rejects duplicate or incomplete target sets before replay', async () => {
        const { baseline, evidence } = await validInputs();
        baseline.results[1].language = baseline.results[0].language;
        evidence.targets.pop();

        expect(validateMultilingualParityInputs(baseline, evidence)).toEqual(expect.arrayContaining([
            'baseline target set differs from the learning-target roster',
            'baseline contains a duplicate target',
            'evidence target set differs from the learning-target roster',
        ]));
    });

    it('rejects compact evidence after the production lookup contract changes', async () => {
        const { baseline, evidence } = await validInputs();
        const language = baseline.results[0].language;
        baseline.results[0].lookupContractSha256 = '0'.repeat(64);
        evidence.targets[0].lookupContractSha256 = '0'.repeat(64);

        expect(validateMultilingualParityInputs(baseline, evidence)).toEqual(expect.arrayContaining([
            `${language}: baseline lookup contract SHA-256 is stale`,
            `${language}: evidence lookup contract SHA-256 is stale`,
        ]));
    });

    it('rejects a dirty or ambiguously described authoritative measurement', async () => {
        const { baseline, evidence } = await validInputs();
        baseline.gitDirty = true;
        baseline.corpusRule = 'Count something approximate.';
        evidence.generatedAt = '2026-08-01T00:00:00.000Z';

        expect(validateMultilingualParityInputs(baseline, evidence)).toEqual(expect.arrayContaining([
            'baseline was not generated from a clean worktree',
            'baseline corpus rule differs from the executable exact-span rule',
            'evidence timestamp differs from the baseline measurement',
        ]));
    });

    it('rejects stale measurement mode, algorithm, and clean-tree provenance', async () => {
        const { baseline, evidence } = await validInputs();
        baseline.measurementMode = 'some-other-matcher';
        evidence.measurementAlgorithmVersion = 'exact-gold-spans-v1';
        baseline.gitStatusSha256 = '0'.repeat(64);

        expect(validateMultilingualParityInputs(baseline, evidence)).toEqual(expect.arrayContaining([
            `baseline measurement mode is some-other-matcher, expected ${MULTILINGUAL_PARITY_MEASUREMENT_MODE}`,
            `evidence measurement algorithm is exact-gold-spans-v1, expected ${MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION}`,
            'baseline git status digest is not clean',
        ]));
    });

    it('rejects missing or implausible full-archive scan provenance', async () => {
        const { baseline, evidence } = await validInputs();
        const baselineFinnish = baseline.results.find(target => target.language === 'fi');
        const evidenceFinnish = evidence.targets.find(target => target.language === 'fi');
        if (!baselineFinnish || !evidenceFinnish) throw new Error('Finnish fixture is absent.');
        baselineFinnish.archiveScan = { mode: 'full-production-import' };
        evidenceFinnish.archiveScan = {
            mode: 'candidate-filtered-full-archive',
            termBanks: 1,
            scannedTermRows: 0,
            retainedTermRows: 2,
        };

        expect(validateMultilingualParityInputs(baseline, evidence)).toEqual(expect.arrayContaining([
            'fi: baseline archive scan mode is full-production-import, expected candidate-filtered-full-archive',
            'fi: evidence archive scan contains no term rows',
            'fi: evidence archive scan retained more rows than it scanned',
            'fi: baseline and evidence archive scan provenance differ',
        ]));
    });

    it('rejects evidence recorded by a different Node or ICU runtime', async () => {
        const { baseline, evidence } = await validInputs();
        // Deliberately impossible runtimes. This assertion first shipped pinning
        // 'v22.22.3' / '78.2' as the SUPPOSEDLY-different baseline -- which is
        // exactly what this repository requires and therefore exactly what the
        // current runtime reports, so the validator was right to find no mismatch
        // and the test could never exercise the path it names.
        baseline.node = 'v0.0.0-not-a-runtime';
        baseline.icu = '0.0';

        expect(validateMultilingualParityInputs(baseline, evidence)).toEqual(expect.arrayContaining([
            `baseline Node runtime is v0.0.0-not-a-runtime, current runtime is ${process.version}`,
            `baseline ICU runtime is 0.0, current runtime is ${process.versions.icu ?? 'unknown'}`,
        ]));
    });

    it('records the checked-in baseline on the audited release Node', async () => {
        const [nodeVersion, baselineJson] = await Promise.all([
            readFile('.nvmrc', 'utf8'),
            readFile('config/quality/multilingual-lookup-baseline.json', 'utf8'),
        ]);
        const baseline = JSON.parse(baselineJson) as MultilingualParityBaseline;

        expect(baseline.node).toBe(`v${nodeVersion.trim()}`);
    });

    it('rejects baseline misses that are not the exact corpus spans', async () => {
        const { baseline, evidence } = await validInputs();
        const target = baseline.results[0];
        const firstMiss = target.misses[0];
        target.misses[0] = {
            ...firstMiss,
            start: firstMiss.start + 1,
            end: firstMiss.end + 1,
        };

        expect(validateMultilingualParityInputs(baseline, evidence)).toContain(
            `${target.language}: baseline exact miss is not a corpus gold span`,
        );
    });
});

describe('multilingual parity measurement contract', () => {
    it('uses the production inline matcher with the fixed limit and records exact misses', async () => {
        const target: TargetCorpus = {
            language: 'en',
            source: {
                kind: 'test',
                story: 'test',
                license: 'MIT',
                reviewStatus: 'test',
            },
            sentences: [{
                id: 'en-test-1',
                text: 'alpha beta',
                contentWords: ['alpha', 'beta'],
            }],
        };
        const findTermMatches = vi.fn(async () => [{ start: 0, end: 5 }]);

        await expect(measureMultilingualParityTarget(target, { findTermMatches })).resolves.toEqual({
            annotated: 1,
            contentWords: 2,
            misses: [{ sentenceId: 'en-test-1', word: 'beta', start: 6, end: 10 }],
        });
        expect(findTermMatches).toHaveBeenCalledWith('alpha beta', 256);
    });

    it('fails an offsetting span swap even when the aggregate score is unchanged', () => {
        const first = { sentenceId: 's1', word: 'alpha', start: 0, end: 5 };
        const second = { sentenceId: 's1', word: 'beta', start: 6, end: 10 };

        expect(multilingualParityMeasurementFailures(
            'en',
            { annotated: 1, contentWords: 2, misses: [first] },
            { annotated: 1, contentWords: 2, misses: [second] },
        )).toEqual([
            'en: exact miss spans changed; refresh the authoritative baseline',
        ]);
    });

    it('hashes the shared measurement, dictionary-integrity, and pinned toolchain inputs', async () => {
        const files = await multilingualParityLookupContractSourceFiles('es');

        expect(files).toEqual(expect.arrayContaining([
            '.nvmrc',
            'package.json',
            'package-lock.json',
            'scripts/lib/multilingual-parity-contract.ts',
            'scripts/lib/multilingual-parity-corpus.ts',
            'scripts/lib/multilingual-parity-archive.ts',
            'scripts/manual/multilingual-parity.ts',
            'src/reader/dictionaries/catalog/integrity.ts',
            'src/reader/platform/binary-realm.ts',
            'src/reader/locales/roster.ts',
            'src/reader/locales/types.ts',
            'config/multilingual/languages.json',
        ]));
        expect(files).not.toContain('src/reader/locales/copy-tiers.ts');
        expect(files.some(path => path.startsWith('src/reader/locales/catalogs/'))).toBe(false);
    });

    it('invalidates checkpoints across measurement or runtime identities', () => {
        const expected: CheckpointIdentity = {
            schemaVersion: MULTILINGUAL_PARITY_SCHEMA_VERSION,
            measurementMode: MULTILINGUAL_PARITY_MEASUREMENT_MODE,
            measurementAlgorithmVersion: MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION,
            gitCommit: '1'.repeat(40),
            gitDirty: false,
            gitStatusSha256: createHash('sha256').update('').digest('hex'),
            node: process.version,
            icu: process.versions.icu ?? 'unknown',
            corpusSha256: '2'.repeat(64),
        };

        expect(multilingualParityCheckpointIdentityFailures({
            ...expected,
            measurementAlgorithmVersion: 'old-algorithm',
            icu: 'old-icu',
        }, expected)).toEqual([
            'checkpoint measurementAlgorithmVersion is stale',
            'checkpoint icu is stale',
        ]);
    });
});
