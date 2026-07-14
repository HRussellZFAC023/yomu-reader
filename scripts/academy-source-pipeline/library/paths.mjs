import path from 'node:path';
import { insideRoot, resolveRoots } from '../paths.mjs';

/**
 * Roots and schema versions for the shared-Japanese-library harness. The
 * library census is a SEPARATE denominator universe from the Moodle corpus:
 * it shares the private artifact boundary and the per-hash census caches, but
 * never contributes occurrences, payloads, or question candidates to the
 * Moodle ledger or its public outputs.
 */
export const LIBRARY_SCAN_REVISION = 'yomu-academy.library.scan/v1';

export const LIBRARY_SCHEMA_VERSIONS = Object.freeze({
    ledger: 'yomu-academy.library.private-ledger/v1',
    hashCache: 'yomu-academy.library.hash-cache/v1',
    archiveCensus: 'yomu-academy.library.archive-census/v1',
    pdfCensus: 'yomu-academy.library.pdf-census/v1',
    mediaCensus: 'yomu-academy.library.media-census/v1',
    publicStatus: 'yomu-academy.library.status/v1',
});

const LIBRARY_STATUS_FILE = 'library-status.v1.json';

export function resolveLibraryRoots(env = process.env) {
    const base = resolveRoots(env);
    const libraryRoot = env.ACADEMY_LIBRARY_ROOT ?? '/Users/heru/Documents/Japanese';
    const libraryPrivateRoot = insideRoot(base.privateRoot, 'library');
    return Object.freeze({
        ...base,
        libraryRoot: path.resolve(libraryRoot),
        libraryPrivateRoot,
        ledgerPath: insideRoot(libraryPrivateRoot, 'library-ledger.v1.json'),
        hashCachePath: insideRoot(libraryPrivateRoot, 'hash-cache.v1.json'),
        archiveCensusRoot: insideRoot(libraryPrivateRoot, 'archive-census'),
        pdfCensusRoot: insideRoot(libraryPrivateRoot, 'pdf-census'),
        pdfCensusPath: insideRoot(libraryPrivateRoot, 'pdf-census.v1.json'),
        mediaCensusPath: insideRoot(libraryPrivateRoot, 'media-census.v1.json'),
        publicStatusPath: insideRoot(base.publicRoot, LIBRARY_STATUS_FILE),
        moodlePrivateLedgerPath: insideRoot(base.privateRoot, 'private-ledger.v1.json'),
        moodleAudioCensusPath: insideRoot(base.privateRoot, 'audio-census.v1.json'),
        moodlePdfCensusRoot: insideRoot(base.privateRoot, 'pdf-census'),
        moodlePayloadStoreRoot: insideRoot(base.privateRoot, 'payloads'),
    });
}
