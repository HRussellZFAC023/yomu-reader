import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import {
    multilingualParityGoldSpans,
    type MultilingualParitySentence,
    type MultilingualParityTargetCorpus,
} from './multilingual-parity-corpus';

export const MULTILINGUAL_PARITY_SCHEMA_VERSION = 3;
export const MULTILINGUAL_PARITY_MEASUREMENT_MODE =
    'production-yomitan-inline-find-term-matches';
// v4: index reads stopped truncating at eight rows per key — an overflow
// probe scans the full key and a candidate-aware collector keeps the best
// compatible rows — so measurements are not comparable with v3 evidence.
export const MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION =
    'exact-gold-spans-v4-overflow-scan';

const CONTRACT_REVISION = 'multilingual-lookup-contract-v4';
const INLINE_MATCH_LIMIT = 256;
const RELEASE_VERSION_SENTINEL = 'yomu-release-version';

const COMMON_LOOKUP_FILES = [
    'src/reader/core/string-utils.ts',
    'src/reader/dictionaries/catalog/integrity.ts',
    'src/reader/languages/active.ts',
    'src/reader/languages/icu-segmentation.ts',
    'src/reader/languages/locale.ts',
    'src/reader/languages/lookup-candidates.ts',
    'src/reader/languages/lookup-normalization.ts',
    'src/reader/languages/lookup-policies.ts',
    'src/reader/languages/lookup-spans.ts',
    'src/reader/languages/module.ts',
    'src/reader/languages/morphology.ts',
    'src/reader/languages/registry.ts',
    'src/reader/languages/types.ts',
    'src/reader/platform/binary-realm.ts',
] as const;

// The authoritative archive run depends on the pinned Node/package tree and on
// the configuration Vite uses to transform the TypeScript sources. Hash these
// inputs for every target so a toolchain or transform change cannot keep
// replaying evidence produced by a different importer/matcher implementation.
const LOOKUP_TOOLCHAIN_INPUT_FILES = [
    '.nvmrc',
    'package.json',
    'package-lock.json',
    // vite-node loads the root Vite config before it transforms the recorder,
    // matcher, and importer modules. Its plugins, aliases, and defines are part
    // of the executable boundary even though this is not a browser build.
    'vite.config.ts',
    // Vite's esbuild transform reads the nearest tsconfig for every TypeScript
    // module. In particular, target and class-field semantics can change the
    // initialized state of YomitanDictionaryStore.
    'tsconfig.json',
] as const;

const JAPANESE_LOOKUP_FILES = [
    'src/reader/languages/japanese.ts',
    'src/reader/lookup/deinflect.ts',
    'src/reader/lookup/japanese-script.ts',
    'src/reader/lookup/japanese-segments.ts',
] as const;

const KOREAN_LOOKUP_FILES = [
    'src/reader/languages/korean.ts',
] as const;

const ROSTER_LOOKUP_FILES = [
    'src/reader/languages/han.ts',
    'src/reader/languages/roster-targets.ts',
] as const;

const TARGET_ROSTER_INPUT_FILES = [
    'src/reader/locales/roster.ts',
    'src/reader/locales/types.ts',
    'config/multilingual/languages.json',
] as const;

// This file owns the shared exact-span measurement implementation below.
// Hashing it and the gold-span implementation makes an algorithm edit invalidate
// both authoritative checkpoints and the compact replay evidence.
const MEASUREMENT_IMPLEMENTATION_FILES = [
    'scripts/manual/multilingual-parity.ts',
    'scripts/lib/multilingual-parity-archive.ts',
    'scripts/lib/multilingual-parity-contract.ts',
    'scripts/lib/multilingual-parity-corpus.ts',
    // WHICH dictionary a target is measured against is part of the measurement:
    // change it and older evidence stops being comparable. Left out of this list,
    // the recorder and the ratchet could disagree about the pin while both looked
    // healthy — which is exactly how Cantonese came to be measured against a
    // 28 KB archive no learner installs.
    'scripts/lib/multilingual-parity-dictionary.ts',
] as const;

let yomitanSourceFilesPromise: Promise<string[]> | undefined;
const contractBytesByPath = new Map<string, Promise<Buffer>>();
const contractHashByLanguage = new Map<string, Promise<string>>();

/**
 * Drop every memo so the next digest is computed from bytes read anew.
 *
 * The recorder needs this: it must re-verify what it just wrote the way a fresh
 * ratchet process will, and a memo populated before the write would let it
 * confirm its own stale reading of the tree.
 */
export function resetMultilingualParityContractCaches(): void {
    yomitanSourceFilesPromise = undefined;
    contractBytesByPath.clear();
    contractHashByLanguage.clear();
}

async function sourceFilesBelow(directory: string): Promise<string[]> {
    const root = resolve(directory);
    const files: string[] = [];
    const visit = async (path: string): Promise<void> => {
        const entries = await readdir(path, { withFileTypes: true });
        await Promise.all(entries.map(async entry => {
            const child = resolve(path, entry.name);
            if (entry.isDirectory()) {
                await visit(child);
            } else if (entry.isFile() && entry.name.endsWith('.ts')) {
                files.push(relative(process.cwd(), child));
            }
        }));
    };
    await visit(root);
    return files.sort();
}

async function yomitanSourceFiles(fresh = false): Promise<string[]> {
    if (fresh) return sourceFilesBelow('src/reader/dictionaries/yomitan');
    yomitanSourceFilesPromise ??= sourceFilesBelow('src/reader/dictionaries/yomitan');
    return yomitanSourceFilesPromise;
}

function jsonRecord(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} is not a JSON object.`);
    }
    return value as Record<string, unknown>;
}

function normalizeManifestVersion(record: Record<string, unknown>, label: string): void {
    if (typeof record.version !== 'string' || !record.version) {
        throw new TypeError(`${label} has no string version to normalize.`);
    }
    record.version = RELEASE_VERSION_SENTINEL;
}

/**
 * Bytes that represent one lookup-contract input.
 *
 * Application release identity does not affect dictionary import or matching.
 * Normalizing exactly the three root version fields keeps a release-only bump
 * from demanding a 33-archive re-measurement. Everything else in both manifests
 * remains in the serialized contract: scripts, dependency declarations, lock
 * resolutions, integrity values, and nested package versions still invalidate
 * the evidence when they change.
 */
export function multilingualParityContractInputBytes(path: string, bytes: Buffer): Buffer {
    if (path === 'package.json') return normalizedPackageManifestBytes(bytes);
    if (path === 'package-lock.json') return normalizedPackageLockBytes(bytes);
    return bytes;
}

function normalizedPackageManifestBytes(bytes: Buffer): Buffer {
    const manifest = jsonRecord(JSON.parse(bytes.toString('utf8')), 'package.json');
    normalizeManifestVersion(manifest, 'package.json');
    return Buffer.from(JSON.stringify(manifest));
}

function normalizedPackageLockBytes(bytes: Buffer): Buffer {
    const manifest = jsonRecord(JSON.parse(bytes.toString('utf8')), 'package-lock.json');
    normalizeManifestVersion(manifest, 'package-lock.json');
    const packages = jsonRecord(manifest.packages, 'package-lock.json packages');
    const rootPackage = jsonRecord(packages[''], 'package-lock.json root package');
    normalizeManifestVersion(rootPackage, 'package-lock.json root package');
    return Buffer.from(JSON.stringify(manifest));
}

function contractSourceBytes(path: string): Promise<Buffer> {
    const existing = contractBytesByPath.get(path);
    if (existing) return existing;
    const pending = readFile(resolve(path)).then(bytes => multilingualParityContractInputBytes(path, bytes));
    contractBytesByPath.set(path, pending);
    return pending;
}

function freshSourceBytes(path: string): Promise<Buffer> {
    return readFile(resolve(path));
}

async function freshContractSourceBytes(path: string): Promise<Buffer> {
    return multilingualParityContractInputBytes(path, await freshSourceBytes(path));
}

/** Options shared by every contract read. `fresh` bypasses all memoization. */
interface ContractReadOptions {
    fresh?: boolean;
}

function targetSourceFiles(language: string): readonly string[] {
    if (language === 'ja') return JAPANESE_LOOKUP_FILES;
    if (language === 'ko') return KOREAN_LOOKUP_FILES;
    return ROSTER_LOOKUP_FILES;
}

/**
 * Source boundary for this metric.
 *
 * The parity number deliberately measures the production Yomitan inline
 * matcher (`YomitanDictionaryStore.findTermMatches`) and its exact-span
 * selection against a real published dictionary. It does not claim to exercise
 * parser/provider routing, pointer interaction, or popup UI; those boundaries
 * are covered by their own production tests and are intentionally not hashed
 * here.
 */
export async function multilingualParityLookupContractSourceFiles(
    language: string,
    options: ContractReadOptions = {},
): Promise<readonly string[]> {
    return [...new Set([
        ...await yomitanSourceFiles(options.fresh),
        ...(language === 'ja' ? [] : TARGET_ROSTER_INPUT_FILES),
        ...COMMON_LOOKUP_FILES,
        ...LOOKUP_TOOLCHAIN_INPUT_FILES,
        ...targetSourceFiles(language),
        ...MEASUREMENT_IMPLEMENTATION_FILES,
    ])].sort();
}

/**
 * Hash of the production importer, inline matcher, target segmentation and
 * morphology, target-roster inputs, and the exact measurement algorithm.
 *
 * The compact evidence fixture contains only rows reached by this recorded
 * implementation. Any change inside the metric's real execution boundary
 * makes the fast gate reject that evidence until the published archives are
 * measured again.
 */
async function calculateLookupContractSha256(
    language: string,
    options: ContractReadOptions = {},
): Promise<string> {
    const files = await multilingualParityLookupContractSourceFiles(language, options);
    const read = options.fresh ? freshContractSourceBytes : contractSourceBytes;
    const hash = createHash('sha256');
    hash.update([
        CONTRACT_REVISION,
        MULTILINGUAL_PARITY_MEASUREMENT_MODE,
        MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION,
        language,
        '',
    ].join('\0'));
    for (const path of files) {
        hash.update(`${path}\0`);
        hash.update(await read(path));
        hash.update('\0');
    }
    return hash.digest('hex');
}

export function multilingualParityLookupContractSha256(language: string): Promise<string> {
    const existing = contractHashByLanguage.get(language);
    if (existing) return existing;
    const pending = calculateLookupContractSha256(language);
    contractHashByLanguage.set(language, pending);
    return pending;
}

/**
 * The same digest, recomputed from disk with no memo in the path.
 *
 * The recorder verifies its own output with this so its self-check cannot pass
 * by agreeing with bytes it read before the run started.
 */
function freshLookupContractSha256(language: string): Promise<string> {
    return calculateLookupContractSha256(language, { fresh: true });
}

/** One contract input and the digest of its lookup-significant bytes. */
export interface MultilingualParityContractInput {
    path: string;
    sha256: string;
}

/**
 * Per-file digests for every contract input across the roster.
 *
 * The aggregate per-target digest is the right thing to gate on and the wrong
 * thing to report: when it moves it names 33 targets and zero causes. A single
 * `npm install` rewrites `package-lock.json` — a hashed toolchain input — and
 * the gate answered that with 66 identical "lookup contract SHA-256 is stale"
 * lines, which cost two sessions of archaeology apiece. A file's digest does not
 * depend on the language reading it, so one document-level breakdown attributes
 * a stale aggregate for every target.
 */
export async function multilingualParityLookupContractInputs(
    languages: readonly string[],
    options: ContractReadOptions = {},
): Promise<MultilingualParityContractInput[]> {
    const paths = new Set<string>();
    for (const language of languages) {
        for (const path of await multilingualParityLookupContractSourceFiles(language, options)) {
            paths.add(path);
        }
    }
    const read = options.fresh ? freshContractSourceBytes : contractSourceBytes;
    return Promise.all([...paths].sort().map(async path => ({
        path,
        sha256: createHash('sha256').update(await read(path)).digest('hex'),
    })));
}

const SHORT_DIGEST_LENGTH = 12;

function shortDigest(sha256: string | undefined): string {
    return typeof sha256 === 'string' && sha256 ? sha256.slice(0, SHORT_DIGEST_LENGTH) : 'absent';
}

function contractInputDigestsByPath(
    inputs: readonly MultilingualParityContractInput[],
): Map<string, string> {
    return new Map(inputs.map(input => [input.path, input.sha256]));
}

function malformedContractInputs(inputs: readonly unknown[]): boolean {
    return inputs.some(input => {
        const row = input as Partial<MultilingualParityContractInput> | null;
        return !row || typeof row.path !== 'string' || typeof row.sha256 !== 'string';
    });
}

/**
 * Which recorded contract inputs disagree with the working tree, by path.
 *
 * Returns nothing when the breakdown is missing or malformed; the caller
 * reports that separately so a missing breakdown is never read as "nothing
 * changed".
 */
function changedContractInputs(
    recorded: readonly MultilingualParityContractInput[] | undefined,
    current: readonly MultilingualParityContractInput[],
): string[] {
    if (!Array.isArray(recorded) || malformedContractInputs(recorded)) return [];
    const recordedByPath = contractInputDigestsByPath(recorded);
    const currentByPath = contractInputDigestsByPath(current);
    const paths = new Set([...recordedByPath.keys(), ...currentByPath.keys()]);
    return [...paths]
        .filter(path => recordedByPath.get(path) !== currentByPath.get(path))
        .sort();
}

/** Names each contract input whose bytes moved, with both short digests. */
function contractInputFailures(
    label: string,
    recorded: readonly MultilingualParityContractInput[] | undefined,
    current: readonly MultilingualParityContractInput[],
): string[] {
    if (!Array.isArray(recorded)) {
        return [`${label} contract input breakdown is absent; re-record so a stale digest can name its cause`];
    }
    if (malformedContractInputs(recorded)) {
        return [`${label} contract input breakdown contains a malformed row`];
    }
    const recordedByPath = contractInputDigestsByPath(recorded);
    const currentByPath = contractInputDigestsByPath(current);
    return changedContractInputs(recorded, current).map(path =>
        `${label} contract input ${path} changed: recorded ${shortDigest(recordedByPath.get(path))}, current ${shortDigest(currentByPath.get(path))}`,
    );
}

/**
 * The stale-aggregate message, narrowed to the inputs this target actually
 * hashes so a target is never blamed for a file outside its own boundary.
 */
function staleContractFailure(
    label: string,
    changedPaths: readonly string[],
    targetSourceFilePaths: readonly string[],
): string {
    const owned = new Set(targetSourceFilePaths);
    const blamed = changedPaths.filter(path => owned.has(path));
    if (!blamed.length) {
        return `${label} lookup contract SHA-256 is stale; no recorded contract input explains it`;
    }
    return `${label} lookup contract SHA-256 is stale; changed contract inputs: ${blamed.join(', ')}`;
}

/** Everything a checkpoint is judged against, hashed once for the whole roster. */
interface ContractState {
    inputs: readonly MultilingualParityContractInput[];
    contractByLanguage: ReadonlyMap<string, string>;
    sourceFilesByLanguage: ReadonlyMap<string, readonly string[]>;
}

export async function multilingualParityContractState(
    languages: readonly string[],
    options: ContractReadOptions = {},
): Promise<ContractState> {
    const digest = options.fresh
        ? freshLookupContractSha256
        : multilingualParityLookupContractSha256;
    const [inputs, contracts, sourceFiles] = await Promise.all([
        multilingualParityLookupContractInputs(languages, options),
        Promise.all(languages.map(async language => [language, await digest(language)] as const)),
        Promise.all(languages.map(async language => [
            language,
            await multilingualParityLookupContractSourceFiles(language, options),
        ] as const)),
    ]);
    return {
        inputs,
        contractByLanguage: new Map(contracts),
        sourceFilesByLanguage: new Map(sourceFiles),
    };
}

/**
 * The one comparison both the recorder and the fast gate use.
 *
 * The recorder used to record a digest and the ratchet used to recompute one
 * with no shared code between them, so a disagreement could only ever surface as
 * a red gate on somebody else's machine. Sharing this means the recorder's
 * self-check fails in the same words, for the same reasons, as the gate it is
 * trying to satisfy.
 */
export function multilingualParityWrittenCheckpointFailures(
    label: string,
    document: {
        lookupContractInputs?: readonly MultilingualParityContractInput[];
        rows: ReadonlyArray<{ language: string; lookupContractSha256: string }>;
    },
    state: ContractState,
): string[] {
    const failures = contractInputFailures(
        label,
        document.lookupContractInputs,
        state.inputs,
    );
    const changed = changedContractInputs(document.lookupContractInputs, state.inputs);
    for (const row of document.rows) {
        if (row.lookupContractSha256 === state.contractByLanguage.get(row.language)) continue;
        failures.push(staleContractFailure(
            `${row.language}: ${label}`,
            changed,
            state.sourceFilesByLanguage.get(row.language) ?? [],
        ));
    }
    return failures;
}

interface ToolchainManifest {
    version?: unknown;
    packages?: { ''?: { version?: unknown } };
}

/**
 * `package.json` and `package-lock.json` must agree about the app version.
 *
 * Both are hashed into the lookup contract, and npm rewrites the lock's copy of
 * the version on the next install whenever the two disagree. So a bump that
 * edits `package.json` without regenerating the lock leaves the repository in a
 * state where the documented setup step — `npm install` — is guaranteed to
 * mutate a contract input and red the gate for everyone who runs it, while CI
 * stays green because it uses `npm ci` and never writes the lock. That is
 * exactly what happened at v1.8.78 and it stayed broken for seven versions.
 * Naming the drift costs nothing and turns an unattributable 66-line failure
 * into one sentence.
 */
function toolchainVersionFailures(
    manifestVersion: unknown,
    lockVersion: unknown,
    lockRootVersion: unknown,
): string[] {
    return ([
        ['package-lock.json version', lockVersion],
        ['package-lock.json packages root version', lockRootVersion],
    ] as const).flatMap(([field, actual]) => actual === manifestVersion
        ? []
        : [`${field} is ${String(actual)}, expected ${String(manifestVersion)} from package.json;`
            + ' run npm install and commit the lockfile so a setup step cannot rewrite a hashed contract input']);
}

export async function multilingualParityToolchainManifestFailures(
    read: (path: string) => Promise<Buffer> = freshSourceBytes,
): Promise<string[]> {
    const [manifest, lock] = await Promise.all([
        read('package.json').then(bytes => JSON.parse(bytes.toString('utf8')) as ToolchainManifest),
        read('package-lock.json').then(bytes => JSON.parse(bytes.toString('utf8')) as ToolchainManifest),
    ]);
    return toolchainVersionFailures(
        manifest.version,
        lock.version,
        lock.packages?.['']?.version,
    );
}

/**
 * Contract inputs with uncommitted changes, from `git status --porcelain=v1`.
 *
 * Recorded digests describe bytes on disk, so recording while a contract input
 * is modified publishes evidence nobody else can reproduce from the commit.
 */
export function multilingualParityDirtyContractInputs(
    porcelainStatus: string,
    inputs: readonly MultilingualParityContractInput[],
): string[] {
    const tracked = new Set(inputs.map(input => input.path));
    return [...new Set(multilingualParityStatusEntryPaths(porcelainStatus).filter(path => tracked.has(path)))].sort();
}

/**
 * Repository-relative paths named by a porcelain v1 status, renames included.
 */
export function multilingualParityStatusEntryPaths(porcelainStatus: string): string[] {
    return porcelainStatus
        .split('\n')
        .filter(line => line.trim())
        // Porcelain v1 is "XY path". Match the status column instead of slicing a
        // fixed three bytes: a caller that trimmed the text first leaves the
        // first line one byte short, and a fixed slice turned that into a path
        // that matched nothing while looking entirely plausible.
        .map(line => line.replace(/^[ ACDMRTU?!]{1,2}\s/u, ''))
        .flatMap(entry => entry.split(' -> '))
        .map(path => path.replace(/^"|"$/gu, ''));
}

export interface MultilingualParitySpan {
    sentenceId: string;
    word: string;
    start: number;
    end: number;
}

export interface MultilingualParityMeasurement {
    annotated: number;
    contentWords: number;
    misses: MultilingualParitySpan[];
}

interface InlineTermMatch {
    start: number;
    end: number;
}

interface InlineTermMatcher<TMatch extends InlineTermMatch> {
    findTermMatches(text: string, limit?: number): Promise<TMatch[]>;
}

/**
 * The one authoritative measurement algorithm used by archive generation and
 * compact replay. A content-word occurrence resolves only when the production
 * inline matcher returns its exact UTF-16 span.
 */
export async function measureMultilingualParityTarget<TMatch extends InlineTermMatch>(
    targetCorpus: MultilingualParityTargetCorpus,
    matcher: InlineTermMatcher<TMatch>,
    observeMatches?: (sentence: MultilingualParitySentence, matches: readonly TMatch[]) => void,
): Promise<MultilingualParityMeasurement> {
    let annotated = 0;
    let contentWords = 0;
    const misses: MultilingualParitySpan[] = [];
    for (const sentence of targetCorpus.sentences) {
        const matches = await matcher.findTermMatches(sentence.text, INLINE_MATCH_LIMIT);
        observeMatches?.(sentence, matches);
        for (const span of multilingualParityGoldSpans(sentence)) {
            contentWords++;
            if (matches.some(match => match.start === span.start && match.end === span.end)) {
                annotated++;
            } else {
                misses.push({ ...span });
            }
        }
    }
    return { annotated, contentWords, misses };
}

export interface MultilingualParityCheckpointIdentity {
    schemaVersion: number;
    measurementMode: string;
    measurementAlgorithmVersion: string;
    gitCommit: string;
    gitDirty: boolean;
    gitStatusSha256: string;
    node: string;
    icu: string;
    defaultLocale: string;
    corpusSha256: string;
}

/** Runtime inputs that can change ICU segmentation or locale-sensitive ordering. */
export function multilingualParityRuntimeIdentity(): Pick<
    MultilingualParityCheckpointIdentity,
    'node' | 'icu' | 'defaultLocale'
> {
    return {
        node: process.version,
        icu: process.versions.icu ?? 'unknown',
        // The lookup/import path contains localeCompare() and
        // toLocaleLowerCase() calls with no explicit locale. LANG/LC_ALL can
        // therefore change candidate ordering even under the same Node + ICU.
        defaultLocale: new Intl.Collator().resolvedOptions().locale,
    };
}

const CHECKPOINT_IDENTITY_FIELDS = [
    'schemaVersion',
    'measurementMode',
    'measurementAlgorithmVersion',
    'gitCommit',
    'gitDirty',
    'gitStatusSha256',
    'node',
    'icu',
    'defaultLocale',
    'corpusSha256',
] as const;

export function multilingualParityCheckpointIdentityFailures(
    actual: Partial<MultilingualParityCheckpointIdentity>,
    expected: MultilingualParityCheckpointIdentity,
): string[] {
    return CHECKPOINT_IDENTITY_FIELDS.flatMap(field =>
        actual[field] === expected[field]
            ? []
            : [`checkpoint ${field} is stale`],
    );
}
