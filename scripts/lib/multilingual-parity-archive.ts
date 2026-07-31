import type { YomitanTermEntry } from '../../src/reader/dictionaries/yomitan';
import { assertDictionaryObjectIntegrity } from '../../src/reader/dictionaries/catalog/integrity';
import {
    targetTermMatchLookupCandidates,
    targetTermMatchQueriesReadingIndex,
} from '../../src/reader/dictionaries/yomitan/term-match';
import { readZipArchiveBytes } from '../../src/reader/dictionaries/yomitan/zip';
import {
    normalizeZipTermRow,
    yomitanZipDictionaryName,
    type YomitanZipIndex,
} from '../../src/reader/dictionaries/yomitan/zip-normalize';
import type { LearningTargetModule } from '../../src/reader/languages/types';
import type { MultilingualParityTargetCorpus } from './multilingual-parity-corpus';

export type MultilingualParityArchiveScanMode =
    | 'full-production-import'
    | 'candidate-filtered-full-archive';

export interface MultilingualParityArchiveScan {
    mode: MultilingualParityArchiveScanMode;
    termBanks?: number;
    scannedTermRows?: number;
    retainedTermRows?: number;
}

export interface CandidateFilteredArchiveResult {
    dictionary: string;
    terms: YomitanTermEntry[];
    scan: MultilingualParityArchiveScan;
}

const COMPACT_GLOSSARY = 'Published dictionary match (compact parity evidence).';
const CANDIDATE_FILTERED_TARGETS = new Set(['fi']);

export function multilingualParityArchiveScanMode(language: string): MultilingualParityArchiveScanMode {
    return CANDIDATE_FILTERED_TARGETS.has(language)
        ? 'candidate-filtered-full-archive'
        : 'full-production-import';
}

/**
 * Scan every term row in an integrity-verified published archive, retaining
 * only rows reachable through the production matcher's exact index keys.
 *
 * fake-indexeddb stores and structured-clones every imported object in memory;
 * Finnish's 118 MiB archive expands beyond 2 GiB of JSON and cannot be loaded
 * whole in the authoritative Node harness. Its production target starts only
 * at ICU segment boundaries, so the complete query-key set is finite before
 * the dictionary is opened. Filtering by that shared key seam is lossless for
 * this exact-span metric while keeping the real archive, row normalizer,
 * insertion order, rule fields, ranking fields, and production matcher.
 */
export async function candidateFilteredTermsFromPublishedArchive(
    archive: Uint8Array,
    filename: string,
    targetCorpus: MultilingualParityTargetCorpus,
    target: LearningTargetModule,
    integrity: { sha256: string; bytes: number },
): Promise<CandidateFilteredArchiveResult> {
    if (!target.lookupStartsAtSegmentBoundary) {
        throw new Error(`${targetCorpus.language}: candidate-filtered archive scan requires segment-boundary lookup.`);
    }

    await assertDictionaryObjectIntegrity(archive, integrity);
    const expressionKeys = corpusLookupKeys(targetCorpus, target);
    const readingKeys = targetTermMatchQueriesReadingIndex(target) ? expressionKeys : new Set<string>();
    const zip = readZipArchiveBytes(archive);
    const zipEntries = zip.entries();
    if (!zipEntries.some(entry => entry.name === 'index.json')) {
        throw new Error(`Published archive has no index.json; found: ${zipEntries.slice(0, 8).map(entry => entry.name).join(', ') || '(none)'}.`);
    }
    const index = JSON.parse(await zip.text('index.json')) as YomitanZipIndex;
    const dictionary = yomitanZipDictionaryName(index, filename);
    const termBanks = zipEntries
        .filter(entry => /^term_bank_\d+\.json$/iu.test(entry.name))
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
    const terms: YomitanTermEntry[] = [];
    let scannedTermRows = 0;

    for (const bank of termBanks) {
        const rows = JSON.parse(await zip.text(bank.name)) as unknown;
        if (!Array.isArray(rows)) throw new Error(`${bank.name}: expected a term row array.`);
        for (const row of rows) {
            scannedTermRows++;
            const entry = normalizeZipTermRow(row, dictionary);
            if (!entry) continue;
            if (!expressionKeys.has(entry.expression) && !readingKeys.has(entry.reading)) continue;
            // Inline matching never inspects glossary payloads, and the final
            // evidence already replaces them with this generated marker. Drop
            // multi-megabyte structured glossaries before fake-indexeddb clones
            // them while preserving every key, rule, score and sequence field.
            terms.push({ ...entry, glossary: [COMPACT_GLOSSARY] });
        }
    }

    return {
        dictionary,
        terms,
        scan: {
            mode: 'candidate-filtered-full-archive',
            termBanks: termBanks.length,
            scannedTermRows,
            retainedTermRows: terms.length,
        },
    };
}

function corpusLookupKeys(
    targetCorpus: MultilingualParityTargetCorpus,
    target: LearningTargetModule,
): Set<string> {
    const keys = new Set<string>();
    for (const sentence of targetCorpus.sentences) {
        // Scanning the complete sentence is a safe superset of production's
        // bounded windows: extra keys retain extra rows but cannot create a
        // match because findTermMatches still applies its production bounds.
        for (const segment of target.segment(sentence.text)) {
            for (const candidate of targetTermMatchLookupCandidates(target, segment.text)) {
                keys.add(candidate.key);
            }
        }
    }
    return keys;
}
