import path from 'node:path';
import { LIBRARY_SCAN_REVISION, LIBRARY_SCHEMA_VERSIONS } from './paths.mjs';
import { walkLibrary } from './walk.mjs';
import { classifyLibraryName, censusFamilyFor } from './classify.mjs';
import { createHashCache } from './hash-cache.mjs';
import { compareUtf8, readJsonIfPresent, writeJsonAtomic } from '../io.mjs';

/**
 * Builds the PRIVATE library ledger: one explicit record per filesystem
 * entry under the authorized root, with a deterministic state for every
 * regular file (included / archive-container / duplicate / excluded:<reason>
 * / review:unknown-extension / failed:*). Bytes are never copied: the ledger
 * retains source-relative paths and later census phases resolve bytes from
 * the source tree (or the existing Moodle payload store) by hash.
 *
 * The Moodle occurrence/payload universe stays untouched — overlap is
 * recorded as a per-payload `inMoodleCorpus` flag on LIBRARY records only.
 */
export function buildLibraryLedger(roots, { log = () => {}, verifyHashes = false } = {}) {
    const walked = walkLibrary(roots.libraryRoot);
    const cache = createHashCache(roots.hashCachePath);
    const moodleShas = loadMoodlePayloadShas(roots);

    const seenPayloads = new Map();
    let hashedCount = 0;
    const entries = walked.map(entry => {
        if (entry.entryKind !== 'file' || entry.state !== 'unclassified') return entry;
        const classification = classifyLibraryName(entry.relativePath);
        const hashResult = cache.hashFile(path.join(roots.libraryRoot, entry.relativePath), entry.relativePath, { verify: verifyHashes });
        hashedCount += 1;
        if (hashedCount % 500 === 0) log(`hashed ${hashedCount} files`);
        if (hashResult.status !== 'hashed') {
            return { ...entry, classification, state: hashResult.status, failure: hashResult.failure ?? null, sha256: null };
        }
        const record = {
            ...entry,
            classification,
            sha256: hashResult.sha256,
            byteLength: hashResult.byteLength,
            state: classification.state === 'archive' ? 'archive-container' : classification.state,
        };
        registerPayload(seenPayloads, record, moodleShas);
        return record;
    });
    cache.flush();

    const ledger = {
        schema: LIBRARY_SCHEMA_VERSIONS.ledger,
        scanRevision: LIBRARY_SCAN_REVISION,
        libraryRoot: roots.libraryRoot,
        moodleLedgerPresent: moodleShas !== null,
        entries,
        uniquePayloads: [...seenPayloads.values()].sort((a, b) => compareUtf8(a.sha256, b.sha256)),
        summary: summarizeEntries(entries, seenPayloads),
    };
    writeJsonAtomic(roots.ledgerPath, ledger);
    return ledger;
}

function registerPayload(seenPayloads, record, moodleShas) {
    const existing = seenPayloads.get(record.sha256);
    if (existing) {
        if (existing.byteLength !== record.byteLength) {
            throw new Error(`SHA-256 collision or size mismatch for library payload ${record.sha256}`);
        }
        existing.occurrenceCount += 1;
        if (!existing.states.includes(record.state)) existing.states.push(record.state);
        if (!existing.extensions.includes(record.classification.extension)) existing.extensions.push(record.classification.extension);
        if (existing.censusFamily === 'none') existing.censusFamily = censusFamilyFor(record.classification.kind);
        // Only resource states collapse to `duplicate`; excluded/review files
        // keep their named reason even when their bytes repeat elsewhere.
        if (record.state === 'included' || record.state === 'archive-container') {
            record.state = `duplicate-of:${existing.firstRelativePath}`;
        }
        return;
    }
    seenPayloads.set(record.sha256, {
        sha256: record.sha256,
        byteLength: record.byteLength,
        occurrenceCount: 1,
        firstRelativePath: record.relativePath,
        kind: record.classification.kind,
        extensions: [record.classification.extension],
        states: [record.state],
        censusFamily: censusFamilyFor(record.classification.kind),
        inMoodleCorpus: moodleShas ? moodleShas.has(record.sha256) : null,
    });
}

/** SHA set of every payload the Moodle pipeline already knows, if it ran. */
function loadMoodlePayloadShas(roots) {
    const moodle = readJsonIfPresent(roots.moodlePrivateLedgerPath);
    if (!moodle) return null;
    const shas = new Set();
    for (const payload of moodle.uniquePayloads ?? []) shas.add(payload.sha256);
    for (const archive of moodle.archiveOccurrences ?? []) shas.add(archive.sha256);
    for (const resource of moodle.directResources ?? []) shas.add(resource.sha256);
    return shas;
}

function summarizeEntries(entries, seenPayloads) {
    const byState = {};
    const byKind = {};
    let regularFiles = 0;
    let regularFileBytes = 0;
    for (const entry of entries) {
        const stateKey = entry.state.startsWith('duplicate-of:') ? 'duplicate' : entry.state;
        byState[stateKey] = (byState[stateKey] ?? 0) + 1;
        if (entry.entryKind !== 'file') continue;
        regularFiles += 1;
        regularFileBytes += entry.byteLength ?? 0;
        const kind = entry.classification?.kind ?? 'unhashable';
        byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
    const payloads = [...seenPayloads.values()];
    return {
        entryCount: entries.length,
        regularFileCount: regularFiles,
        regularFileBytes,
        uniquePayloadCount: payloads.length,
        duplicateOccurrenceCount: byState.duplicate ?? 0,
        moodleOverlapPayloadCount: payloads.filter(payload => payload.inMoodleCorpus === true).length,
        byState: sortObject(byState),
        byKind: sortObject(byKind),
    };
}

function sortObject(record) {
    return Object.fromEntries(Object.entries(record).sort(([a], [b]) => compareUtf8(a, b)));
}
