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
export const MULTILINGUAL_PARITY_MEASUREMENT_ALGORITHM_VERSION =
    'exact-gold-spans-v3-full-archive-filter';

const CONTRACT_REVISION = 'multilingual-lookup-contract-v3';
const INLINE_MATCH_LIMIT = 256;

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

// The authoritative archive run depends on the pinned Node and package tree as
// well as the TypeScript sources. Hash these manifests for every target so a
// runtime or dependency change cannot keep replaying evidence produced by a
// different importer/matcher implementation.
const LOOKUP_TOOLCHAIN_INPUT_FILES = [
    '.nvmrc',
    'package.json',
    'package-lock.json',
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
] as const;

let yomitanSourceFilesPromise: Promise<string[]> | undefined;
const sourceBytesByPath = new Map<string, Promise<Buffer>>();
const contractHashByLanguage = new Map<string, Promise<string>>();

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

async function yomitanSourceFiles(): Promise<string[]> {
    yomitanSourceFilesPromise ??= sourceFilesBelow('src/reader/dictionaries/yomitan');
    return yomitanSourceFilesPromise;
}

function sourceBytes(path: string): Promise<Buffer> {
    const existing = sourceBytesByPath.get(path);
    if (existing) return existing;
    const pending = readFile(resolve(path));
    sourceBytesByPath.set(path, pending);
    return pending;
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
export async function multilingualParityLookupContractSourceFiles(language: string): Promise<readonly string[]> {
    return [...new Set([
        ...await yomitanSourceFiles(),
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
async function calculateLookupContractSha256(language: string): Promise<string> {
    const files = await multilingualParityLookupContractSourceFiles(language);
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
        hash.update(await sourceBytes(path));
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
    corpusSha256: string;
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
