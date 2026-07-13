import path from 'node:path';

/**
 * Privacy boundary for public outputs. Two independent defences:
 *  1. structural — every object key must come from the public-schema allowlist,
 *     every string value must be printable ASCII (hashes, enums, opaque IDs);
 *  2. token — the serialized text must contain none of the private tokens
 *     harvested from the actual private data (names, titles, slugs, paths).
 */
const PUBLIC_KEY_ALLOWLIST = new Set([
    'schema', 'provenance', 'captureId', 'sourceManifestSha256', 'extractionRevision',
    'rights', 'publication', 'excluded', 'manifest', 'sha256', 'courseCount', 'sectionCount',
    'moduleCount', 'moduleTypeCounts', 'folder', 'resource', 'url', 'other', 'page', 'quiz', 'assign', 'label', 'forum',
    'summary', 'archiveOccurrenceCount', 'uniqueArchivePayloadCount', 'memberOccurrenceCount',
    'uniquePayloadAssetCount', 'directResourceCount', 'totalMemberUncompressedBytes',
    'duplicatePayloadOccurrenceCount', 'archivePayloads', 'archiveOccurrences', 'assets',
    'memberOccurrences', 'patterns', 'byFileType', 'id', 'byteLength', 'occurrenceCount',
    'archiveOccurrenceId', 'centralDirectoryIndex', 'memberKind', 'payloadSha256',
    'compressedBytes', 'uncompressedBytes', 'compression', 'classification', 'classifications',
    'kind', 'extension', 'pathShape', 'depth', 'characterSet', 'nameEncoding',
    'denominators', 'uniquePayloads', 'directResources', 'uniqueDirectResourcePayloads',
    'directResourceOccurrences', 'uniquePdfPayloads', 'pdfOccurrences',
    'uniqueAudioPayloads', 'audioOccurrences', 'census', 'pdf', 'audio', 'complete',
    'withoutTextLayer', 'failed', 'layoutFailed', 'nativeImageExtractionFailed', 'vectorExtractionFailed',
    'imageDependencyReviewRequired', 'probed', 'migration',
    'packCount', 'migratedSourceItemCandidates', 'unresolvedLocusCount', 'claims',
    'verifiedSourceQuestions', 'playableSourceQuestions', 'sourceItemCandidates',
    'questionSignalCandidatesAreVerified', 'releaseGate', 'sourceFidelityComplete',
    'mediaFidelityComplete', 'allPayloadsCensused', 'listeningPairingComplete',
    'pdfPayloads', 'audioPayloads', 'status', 'pageCount', 'textExtraction',
    'layoutExtractionStatus', 'nativeImageExtractionStatus', 'vectorExtractionStatus',
    'imageDependencyReview', 'imageDependentPageCount', 'questionSignalCandidateCount',
    'pagesWithoutTextLayer', 'pagesWithoutLayout', 'nativeImageObjectCount',
    'extractedNativeImageCount', 'positionedMediaRegionCount', 'textBoxCount',
    'vectorReviewPageCount', 'vectorProbeFailedPageCount', 'vectorHeavyPageCount',
    'vectorContentPageCount',
    'durationSeconds', 'codec', 'totals', 'donorItemCount', 'sourceCandidateCount',
    'instructionCount', 'augmentationRecordCount', 'candidatePageCount',
    'mediaReviewRequiredCount', 'audioMediaRefCount', 'imageMediaRefCount',
    'donorAnswerClaimCount', 'packsInMoodleCorpus',
    'pairing', 'audioRefCount', 'withCandidates', 'uniqueMatches', 'packs', 'packRef',
    'sourceSha256', 'inMoodleCorpus', 'counts',
    // Shared-Japanese-library status (aggregate-only; separate universe from Moodle).
    'scanRevision', 'entryCount', 'regularFileCount', 'regularFileBytes', 'uniquePayloadCount',
    'duplicateOccurrenceCount', 'byState', 'state', 'byKind', 'byExtension', 'archives',
    'containerPayloadCount', 'censused', 'uniqueMemberPayloadCount', 'failedMemberCount',
    'encryptedMemberCount', 'byFailureReason', 'archiveFailureCode', 'containerCount',
    'media', 'payloadCount', 'reusedMoodleProbeCount', 'totalDurationSeconds',
    'documentCount', 'reusedMoodleCensus', 'moodleOverlap', 'moodleLedgerPresent',
    'overlapPayloadCount', 'contributesToMoodleCounts', 'humanAuthoredCoverage',
]);

const FORBIDDEN_KEYS = new Set([
    'name', 'title', 'slug', 'notes', 'relativePath', 'sourcePath', 'sourceId',
    'primaryName', 'originalName', 'externalUrl', 'author', 'path', 'promptOriginal',
    'promptTranslation', 'answer', 'instructions', 'mapping',
]);

export function validatePublicValue(value, { label = 'public output' } = {}) {
    const violations = [];
    walk(value, `${label}`, violations);
    return violations;
}

function walk(value, trail, violations) {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return;
    if (typeof value === 'string') {
        if (!/^[\x20-\x7e]*$/.test(value)) violations.push(`${trail}: non-ASCII string value`);
        if (value.includes('/Users/') || value.includes(path.sep + 'Users' + path.sep)) violations.push(`${trail}: absolute private path`);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, `${trail}[${index}]`, violations));
        return;
    }
    for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(key)) violations.push(`${trail}.${key}: forbidden private key`);
        else if (!PUBLIC_KEY_ALLOWLIST.has(key)) violations.push(`${trail}.${key}: key not in public allowlist`);
        walk(child, `${trail}.${key}`, violations);
    }
}

/** Harvest representative private tokens from the real private data. */
export function collectPrivateTokens({ ledger, manifest, packCandidates }) {
    const tokens = new Set();
    const add = value => {
        if (typeof value === 'string' && value.trim().length >= 4) tokens.add(value.trim());
    };
    for (const archive of ledger?.archiveOccurrences ?? []) add(archive.relativePath);
    for (const occurrence of ledger?.memberOccurrences ?? []) {
        add(occurrence.name);
        add(occurrence.name?.split('/').pop());
    }
    for (const course of manifest?.courses ?? []) {
        add(course.title);
        for (const section of course.sections ?? []) {
            add(section.title);
            for (const module of section.modules ?? []) {
                add(module.title);
                add(module.externalUrl);
            }
        }
    }
    for (const pack of packCandidates?.packs ?? []) {
        add(pack.slug);
        add(pack.sourceDocument?.primaryName);
        add(pack.sourceDocument?.sourceId);
        for (const candidate of pack.sourceCandidates ?? []) add(candidate.promptOriginal);
        for (const record of pack.augmentation ?? []) add(record.promptTranslation);
    }
    return tokens;
}

export function findLeakedTokens(serializedText, tokens) {
    const leaks = [];
    for (const token of tokens) {
        if (privateTokenVariants(token).some(variant => serializedText.includes(variant))) leaks.push(token);
    }
    return leaks;
}

/**
 * Public JSON may later be placed in a URL, copied through a JSON encoder, or
 * embedded in another manifest. Treat those representations as the same
 * private token. Percent escapes are checked with both URI path semantics
 * (slashes retained) and component semantics (slashes escaped); lower-case
 * hex is included because URL encoders are not required to preserve case.
 */
function privateTokenVariants(token) {
    const variants = new Set([token, JSON.stringify(token).slice(1, -1)]);
    try {
        for (const encoded of [encodeURI(token), encodeURIComponent(token)]) {
            variants.add(encoded);
            variants.add(encoded.replace(/%[0-9A-F]{2}/g, match => match.toLowerCase()));
        }
    } catch {
        // A filesystem string may contain an unpaired surrogate. Raw and JSON
        // escaped variants above still fail closed; URI encoding is undefined.
    }
    return [...variants].filter(Boolean);
}

/**
 * Claim guard: public status may never turn machine candidates into verified
 * or playable coverage. Only the mechanical all-payload census gate may turn
 * true here; source/media/listening fidelity requires later human review.
 */
export function validateClaims(corpusStatus, { auditedSourceQuestions = 1, playableSourceQuestions = 1 } = {}) {
    const violations = [];
    const claims = corpusStatus.claims ?? {};
    if (claims.verifiedSourceQuestions !== auditedSourceQuestions) {
        violations.push(`claims.verifiedSourceQuestions must stay at ${auditedSourceQuestions} (got ${claims.verifiedSourceQuestions})`);
    }
    if (claims.playableSourceQuestions !== playableSourceQuestions) {
        violations.push(`claims.playableSourceQuestions must stay at ${playableSourceQuestions} (got ${claims.playableSourceQuestions})`);
    }
    if (claims.questionSignalCandidatesAreVerified !== false) {
        violations.push('claims.questionSignalCandidatesAreVerified must be false');
    }
    if (typeof claims.sourceItemCandidates !== 'number' || claims.sourceItemCandidates < 0) {
        violations.push('claims.sourceItemCandidates must be a non-negative count');
    }
    for (const gate of ['sourceFidelityComplete', 'mediaFidelityComplete', 'listeningPairingComplete']) {
        if (corpusStatus.releaseGate?.[gate] !== false) {
            violations.push(`releaseGate.${gate} must remain false until human review closes it`);
        }
    }
    const denominators = corpusStatus.denominators ?? {};
    const expectedCensusState = (corpusStatus.pdfPayloads?.length ?? 0) === denominators.uniquePdfPayloads
        && (corpusStatus.pdfPayloads ?? []).every(row => row.status?.startsWith('census-complete') || row.status?.startsWith('failed:'))
        && (corpusStatus.audioPayloads?.length ?? 0) === denominators.uniqueAudioPayloads
        && (corpusStatus.audioPayloads ?? []).every(row => row.status === 'probed' || row.status?.startsWith('failed:'))
        && (corpusStatus.directResourceOccurrences?.length ?? 0) === denominators.directResources
        && (corpusStatus.directResourceOccurrences ?? []).every(row => row.status === 'stored');
    if (corpusStatus.releaseGate?.allPayloadsCensused !== expectedCensusState) {
        violations.push(`releaseGate.allPayloadsCensused must equal the explicit payload-state census (${expectedCensusState})`);
    }
    return violations;
}
