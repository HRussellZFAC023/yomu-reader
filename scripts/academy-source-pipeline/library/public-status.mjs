import { LIBRARY_SCHEMA_VERSIONS, LIBRARY_SCAN_REVISION } from './paths.mjs';
import { compareUtf8, readJson, writeJsonAtomic } from '../io.mjs';
import { findLeakedTokens, validatePublicValue } from '../privacy.mjs';

// These exact basenames are generic tool/output vocabulary, not identifying
// source labels. Each collides with a controlled public schema token or enum
// (`.cargo-lock`, `build-artifact`, `compiler-build-output`, `included`,
// `audio`). Full relative paths containing them remain guarded. Keep this
// deliberately narrow: every other basename, including Japanese, titles,
// usernames and distinctive source-derived names, is still a private token.
const GENERIC_PUBLIC_VOCABULARY_BASENAMES = new Set([
    '.cargo-lock', 'audio', 'build', 'include', 'output',
]);

const PUBLIC_ARCHIVE_FAILURE_REASONS = new Set([
    'failed:read',
    'failed:source-bytes-changed-since-scan',
    'failed:zip64-unsupported',
    'failed:corrupt-or-unsupported',
]);

/**
 * ALLOWLIST serializer for the single public library artifact. Aggregate
 * counts, enum states and totals only — no per-file rows, no paths, no
 * filenames, no hashes tied to names, no Japanese text. Unknown extensions
 * collapse to '(other)' so a private filename fragment can never ride out
 * through an extension histogram. The library universe is reported strictly
 * apart from Moodle: `claims.contributesToMoodleCounts` is pinned false.
 */
export function buildLibraryPublicStatus(ledger, archiveCensus, pdfCensus, mediaCensus) {
    const knownExtensions = new Set(
        ledger.entries
            .filter(entry => entry.classification && entry.classification.kind !== 'unknown')
            .map(entry => entry.classification.extension)
            .filter(extension => /^[\x20-\x7e]*$/.test(extension)),
    );
    const byExtension = new Map();
    for (const entry of ledger.entries) {
        if (entry.entryKind !== 'file' || !entry.classification) continue;
        const extension = knownExtensions.has(entry.classification.extension) ? entry.classification.extension : '(other)';
        byExtension.set(extension, (byExtension.get(extension) ?? 0) + 1);
    }
    const archives = archiveCensus.archives;
    const archiveFailureReasons = {};
    for (const archive of archives.filter(entry => entry.status?.startsWith('failed:'))) {
        const reason = PUBLIC_ARCHIVE_FAILURE_REASONS.has(archive.status)
            ? archive.status
            : 'failed:other';
        archiveFailureReasons[reason] = (archiveFailureReasons[reason] ?? 0) + 1;
    }
    const encryptedMemberCount = archives.reduce((total, archive) =>
        total + (archive.members ?? []).filter(member => member.status === 'failed:encrypted-member').length, 0);
    const mediaProbed = mediaCensus.payloads.filter(entry => entry.status === 'probed');
    return {
        schema: LIBRARY_SCHEMA_VERSIONS.publicStatus,
        scanRevision: LIBRARY_SCAN_REVISION,
        denominators: {
            entryCount: ledger.summary.entryCount,
            regularFileCount: ledger.summary.regularFileCount,
            regularFileBytes: ledger.summary.regularFileBytes,
            uniquePayloadCount: ledger.summary.uniquePayloadCount,
            duplicateOccurrenceCount: ledger.summary.duplicateOccurrenceCount,
        },
        byState: rows(ledger.summary.byState, 'state', 'entryCount'),
        byKind: rows(ledger.summary.byKind, 'kind', 'entryCount'),
        byExtension: rows(Object.fromEntries(byExtension), 'extension', 'entryCount'),
        archives: {
            containerPayloadCount: archives.length,
            censused: archives.filter(archive => archive.status === 'censused').length,
            failed: archives.filter(archive => archive.status?.startsWith('failed:')).length,
            memberOccurrenceCount: sum(archives, 'memberOccurrenceCount'),
            uniqueMemberPayloadCount: sum(archives, 'uniqueMemberPayloadCount'),
            failedMemberCount: sum(archives, 'failedMemberCount'),
            encryptedMemberCount,
            byFailureReason: rows(archiveFailureReasons, 'archiveFailureCode', 'containerCount'),
        },
        pdf: { ...pdfCensus.summary },
        media: {
            payloadCount: mediaCensus.payloads.length,
            probed: mediaProbed.length,
            reusedMoodleProbeCount: mediaCensus.payloads.filter(entry => entry.probeSource === 'reused-moodle-probe').length,
            failed: mediaCensus.payloads.filter(entry => entry.status?.startsWith('failed:')).length,
            totalDurationSeconds: Math.round(mediaProbed.reduce(
                (total, entry) => total + (Number.isFinite(entry.durationSeconds) ? entry.durationSeconds : 0), 0)),
        },
        moodleOverlap: {
            moodleLedgerPresent: ledger.moodleLedgerPresent,
            overlapPayloadCount: ledger.summary.moodleOverlapPayloadCount,
        },
        claims: {
            contributesToMoodleCounts: false,
            questionSignalCandidatesAreVerified: false,
            humanAuthoredCoverage: false,
        },
    };
}

/** Every private token the serialized public status must not contain. */
export function collectLibraryPrivateTokens(ledger) {
    const tokens = new Set();
    const add = value => {
        if (typeof value === 'string' && value.trim().length >= 4) tokens.add(value.trim());
    };
    add(ledger.libraryRoot);
    for (const entry of ledger.entries) {
        add(entry.relativePath);
        add(entry.sha256);
        const basename = entry.relativePath.split('/').pop();
        if (!GENERIC_PUBLIC_VOCABULARY_BASENAMES.has(basename)) add(basename);
    }
    for (const payload of ledger.uniquePayloads ?? []) add(payload.sha256);
    return tokens;
}

export function writeLibraryPublicStatus(roots, ledger, status) {
    const leaks = findLeakedTokens(JSON.stringify(status), collectLibraryPrivateTokens(ledger));
    if (leaks.length > 0) {
        throw new Error(`Refusing to publish library status: private tokens would leak: ${leaks.slice(0, 5).join(', ')}`);
    }
    const structuralViolations = validatePublicValue(status, { label: 'library-status' });
    if (structuralViolations.length > 0) {
        throw new Error(`Refusing to publish library status: public allowlist violations: ${structuralViolations.slice(0, 5).join(', ')}`);
    }
    writeJsonAtomic(roots.publicStatusPath, status);
    return roots.publicStatusPath;
}

/**
 * Records the mechanical library census in RESOURCE-LEDGER.json without
 * touching any Moodle denominator or coverage claim: the Stage 1 audited 1/1
 * baseline and the Moodle baselineCounts must be byte-identical afterwards.
 */
export function updateResourceLedgerLibrarySection(roots, status) {
    const ledger = readJson(roots.resourceLedgerPath);
    if (ledger.coverage?.sourceQuestionsAudited !== 1 || ledger.coverage?.sourceQuestionsPlayable !== 1) {
        throw new Error('RESOURCE-LEDGER Stage 1 coverage drifted from the audited 1/1 baseline; refusing to update.');
    }
    ledger.stage2LibraryCensus = {
        status: 'mechanical-census-complete-review-open',
        scanRevision: status.scanRevision,
        publicOutput: '/academy/content/source-pipeline/library-status.v1.json',
        denominators: { ...status.denominators },
        moodleOverlapPayloadCount: status.moodleOverlap.overlapPayloadCount,
        archives: {
            containerPayloadCount: status.archives.containerPayloadCount,
            censused: status.archives.censused,
            failed: status.archives.failed,
            byFailureReason: status.archives.byFailureReason,
        },
        pdf: {
            documentCount: status.pdf.documentCount,
            complete: status.pdf.complete,
            reusedMoodleCensus: status.pdf.reusedMoodleCensus,
            failed: status.pdf.failed,
            pageCount: status.pdf.pageCount,
        },
        media: {
            payloadCount: status.media.payloadCount,
            probed: status.media.probed,
            reusedMoodleProbeCount: status.media.reusedMoodleProbeCount,
            failed: status.media.failed,
        },
        note: 'Separate denominator universe from the Moodle corpus. Mechanical filesystem/archive/PDF/media census only; contributes no verified or playable source questions.',
    };
    writeJsonAtomic(roots.resourceLedgerPath, ledger);
    return ledger;
}

function rows(record, keyName, countName) {
    return Object.entries(record)
        .sort(([a], [b]) => compareUtf8(a, b))
        .map(([key, count]) => ({ [keyName]: key, [countName]: count }));
}

function sum(rowsList, key) {
    return rowsList.reduce((total, row) => total + (Number.isFinite(row[key]) ? row[key] : 0), 0);
}
