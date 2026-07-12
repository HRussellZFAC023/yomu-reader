import { PUBLIC_SCHEMA_VERSIONS, insideRoot } from './paths.mjs';
import { compareUtf8, writeJsonAtomic } from './io.mjs';

/**
 * ALLOWLIST serializers for the three committed, metadata-only public outputs.
 * Every field is constructed explicitly from hashes, sizes, opaque ordinal IDs,
 * enum classifications, and aggregate counts. No source filename, path, title,
 * URL, note, prompt text, or private absolute path may ever be added here —
 * privacy regression tests pin that boundary.
 */
export function buildPublicCatalog(ledger) {
    const memberOccurrences = ledger.memberOccurrences.map(occurrence => ({
        id: occurrence.id,
        archiveOccurrenceId: occurrence.archiveOccurrenceId,
        centralDirectoryIndex: occurrence.centralDirectoryIndex,
        memberKind: 'file',
        payloadSha256: occurrence.payloadSha256,
        compressedBytes: occurrence.compressedBytes,
        uncompressedBytes: occurrence.uncompressedBytes,
        compression: occurrence.compression,
        classification: { kind: occurrence.classification.kind, extension: occurrence.classification.extension },
        pathShape: {
            depth: occurrence.pathShape.depth,
            characterSet: occurrence.pathShape.characterSet,
            nameEncoding: occurrence.nameEncoding,
        },
    }));
    const archiveOccurrences = ledger.archiveOccurrences.map(archive => ({
        id: archive.id,
        sha256: archive.sha256,
        byteLength: archive.byteLength,
        memberOccurrenceCount: memberOccurrences.filter(occurrence => occurrence.archiveOccurrenceId === archive.id).length,
    }));
    const archivePayloads = dedupeArchivePayloads(archiveOccurrences);
    // The catalog covers the 96 archives only; direct (non-ZIP) resources are
    // reported by count in the corpus status, never as catalog assets.
    const assets = ledger.uniquePayloads.filter(payload => payload.occurrenceCount > 0).map(payload => ({
        sha256: payload.sha256,
        byteLength: payload.byteLength,
        status: 'stored',
        occurrenceCount: payload.occurrenceCount,
        directResourceCount: payload.directResourceCount,
        archiveOccurrenceCount: payload.archiveOccurrenceIds.length,
        classifications: payload.classifications
            .map(entry => ({ memberKind: 'file', kind: entry.kind, extension: entry.extension }))
            .sort((a, b) => compareUtf8(a.extension, b.extension)),
    }));
    return {
        schema: PUBLIC_SCHEMA_VERSIONS.catalog,
        provenance: {
            captureId: `capture-${ledger.manifest.sha256.slice(0, 12)}`,
            sourceManifestSha256: ledger.manifest.sha256,
            extractionRevision: ledger.extractionRevision,
        },
        rights: {
            publication: 'metadata-only',
            excluded: [
                'archive-byte-content',
                'archive-source-paths',
                'member-byte-content',
                'member-names',
                'manifest-titles-urls-notes',
                'zip-comments-and-member-timestamps',
            ],
        },
        manifest: {
            sha256: ledger.manifest.sha256,
            courseCount: ledger.manifest.courseCount,
            sectionCount: ledger.manifest.sectionCount,
            moduleCount: ledger.manifest.moduleCount,
            moduleTypeCounts: ledger.manifest.moduleTypeCounts,
        },
        summary: {
            archiveOccurrenceCount: archiveOccurrences.length,
            uniqueArchivePayloadCount: archivePayloads.length,
            memberOccurrenceCount: memberOccurrences.length,
            uniquePayloadAssetCount: assets.length,
            directResourceCount: ledger.directResources.length,
            totalMemberUncompressedBytes: memberOccurrences.reduce((sum, occurrence) => sum + occurrence.uncompressedBytes, 0),
            duplicatePayloadOccurrenceCount: memberOccurrences.length
                - new Set(memberOccurrences.map(occurrence => occurrence.payloadSha256)).size,
        },
        archivePayloads,
        archiveOccurrences,
        assets,
        memberOccurrences,
        patterns: buildPatterns(memberOccurrences),
    };
}

export function buildCorpusStatus(ledger, pdfCensus, audioCensus, packCandidates) {
    const directResourceRows = ledger.directResources.map((resource, index) => ({
        id: `direct-${String(index + 1).padStart(6, '0')}`,
        payloadSha256: resource.sha256,
        byteLength: resource.byteLength,
        status: 'stored',
        classification: {
            kind: resource.classification.kind,
            extension: resource.classification.extension,
        },
    }));
    const pdfRows = pdfCensus.documents
        .map(document => ({
            payloadSha256: document.payloadSha256,
            status: document.status,
            pageCount: document.pageCount ?? null,
            // Truncate to the enum part: failure detail may carry private paths.
            textExtraction: document.textExtraction ? String(document.textExtraction).split(' (')[0] : null,
            layoutExtractionStatus: document.layoutExtraction?.status ?? 'failed:missing-layout-state',
            nativeImageExtractionStatus: document.nativeImageExtraction?.status ?? 'failed:missing-native-image-state',
            vectorExtractionStatus: document.vectorExtraction?.status ?? 'failed:missing-vector-state',
            imageDependencyReview: document.imageDependencyReview,
            imageDependentPageCount: document.summary?.imageDependentPageCount ?? null,
            questionSignalCandidateCount: document.summary?.questionSignalCandidateCount ?? null,
            pagesWithoutTextLayer: document.summary?.pagesWithoutTextLayer ?? null,
            pagesWithoutLayout: document.summary?.pagesWithoutLayout ?? null,
            nativeImageObjectCount: document.summary?.imageObjectCount ?? null,
            extractedNativeImageCount: document.nativeImageExtraction?.extractedObjectCount ?? null,
            positionedMediaRegionCount: document.summary?.nativeMediaRegionCount ?? null,
            textBoxCount: document.summary?.textBoxCount ?? null,
            vectorReviewPageCount: document.summary?.vectorReviewPageCount ?? null,
            vectorProbeFailedPageCount: document.vectorExtraction?.failedPageCount ?? null,
            vectorHeavyPageCount: document.vectorExtraction?.vectorHeavyPageCount ?? null,
            vectorContentPageCount: document.vectorExtraction?.vectorContentPageCount ?? null,
        }))
        .sort((a, b) => compareUtf8(a.payloadSha256, b.payloadSha256));
    const audioRows = audioCensus.payloads
        .map(entry => ({
            payloadSha256: entry.payloadSha256,
            status: entry.status,
            durationSeconds: entry.durationSeconds ?? null,
            codec: entry.codec ?? null,
        }))
        .sort((a, b) => compareUtf8(a.payloadSha256, b.payloadSha256));
    const expectedPdfPayloads = ledger.uniquePayloads.filter(payload =>
        payload.classifications.some(entry => entry.extension === '.pdf')).length;
    const expectedAudioPayloads = ledger.uniquePayloads.filter(payload =>
        payload.classifications.some(entry => ['.mp3', '.m4a', '.wav'].includes(entry.extension))).length;
    const allPayloadsCensused = pdfRows.length === expectedPdfPayloads
        && pdfRows.every(row => row.status.startsWith('census-complete') || row.status.startsWith('failed:'))
        && audioRows.length === expectedAudioPayloads
        && audioRows.every(row => row.status === 'probed' || row.status.startsWith('failed:'))
        && directResourceRows.length === ledger.directResources.length
        && directResourceRows.every(row => row.status === 'stored');
    return {
        schema: PUBLIC_SCHEMA_VERSIONS.corpusStatus,
        extractionRevision: ledger.extractionRevision,
        denominators: {
            archiveOccurrences: ledger.archiveOccurrences.length,
            memberOccurrences: ledger.memberOccurrences.length,
            uniquePayloads: new Set(ledger.memberOccurrences.map(occurrence => occurrence.payloadSha256)).size,
            directResources: ledger.directResources.length,
            uniqueDirectResourcePayloads: new Set(ledger.directResources.map(resource => resource.sha256)).size,
            uniquePdfPayloads: expectedPdfPayloads,
            pdfOccurrences: countOccurrences(ledger, '.pdf'),
            uniqueAudioPayloads: expectedAudioPayloads,
            audioOccurrences: countOccurrences(ledger, '.mp3', '.m4a', '.wav'),
        },
        census: {
            pdf: {
                complete: pdfRows.filter(row => row.status.startsWith('census-complete')).length,
                withoutTextLayer: pdfRows.filter(row => (row.pagesWithoutTextLayer ?? 0) > 0).length,
                failed: pdfRows.filter(row => row.status.startsWith('failed:')).length,
                layoutFailed: pdfRows.filter(row => row.layoutExtractionStatus.startsWith('failed:')).length,
                nativeImageExtractionFailed: pdfRows.filter(row => row.nativeImageExtractionStatus.startsWith('failed:')).length,
                vectorExtractionFailed: pdfRows.filter(row => row.vectorExtractionStatus !== 'complete').length,
                imageDependencyReviewRequired: pdfRows.filter(row => row.imageDependencyReview === 'review-required').length,
                pageCount: sumNullable(pdfRows, 'pageCount'),
                pagesWithoutTextLayer: sumNullable(pdfRows, 'pagesWithoutTextLayer'),
                pagesWithoutLayout: sumNullable(pdfRows, 'pagesWithoutLayout'),
                nativeImageObjectCount: sumNullable(pdfRows, 'nativeImageObjectCount'),
                extractedNativeImageCount: sumNullable(pdfRows, 'extractedNativeImageCount'),
                positionedMediaRegionCount: sumNullable(pdfRows, 'positionedMediaRegionCount'),
                textBoxCount: sumNullable(pdfRows, 'textBoxCount'),
                vectorReviewPageCount: sumNullable(pdfRows, 'vectorReviewPageCount'),
                vectorProbeFailedPageCount: sumNullable(pdfRows, 'vectorProbeFailedPageCount'),
                vectorHeavyPageCount: sumNullable(pdfRows, 'vectorHeavyPageCount'),
                vectorContentPageCount: sumNullable(pdfRows, 'vectorContentPageCount'),
            },
            audio: {
                probed: audioRows.filter(row => row.status === 'probed').length,
                failed: audioRows.filter(row => row.status.startsWith('failed:')).length,
            },
        },
        migration: {
            packCount: packCandidates.totals.packCount,
            migratedSourceItemCandidates: packCandidates.totals.sourceCandidateCount,
            unresolvedLocusCount: packCandidates.totals.unresolvedLocusCount,
        },
        claims: {
            verifiedSourceQuestions: 1,
            playableSourceQuestions: 1,
            sourceItemCandidates: packCandidates.totals.sourceCandidateCount,
            questionSignalCandidatesAreVerified: false,
        },
        releaseGate: {
            sourceFidelityComplete: false,
            mediaFidelityComplete: false,
            allPayloadsCensused,
            listeningPairingComplete: false,
        },
        directResourceOccurrences: directResourceRows,
        pdfPayloads: pdfRows,
        audioPayloads: audioRows,
    };
}

export function buildPackMigrationSummary(packCandidates, pairings) {
    return {
        schema: PUBLIC_SCHEMA_VERSIONS.packMigration,
        extractionRevision: packCandidates.extractionRevision,
        totals: { ...packCandidates.totals },
        pairing: { ...pairings.totals },
        packs: packCandidates.packs
            .map(pack => ({
                packRef: pack.packId,
                sourceSha256: pack.sourceDocument.sha256,
                inMoodleCorpus: pack.sourceDocument.inMoodleCorpus,
                pageCount: pack.sourceDocument.pageCount,
                counts: { ...pack.counts },
                status: 'candidates-review-required',
            }))
            .sort((a, b) => compareUtf8(a.packRef, b.packRef)),
    };
}

export function writePublicOutputs(roots, outputs) {
    const paths = {
        catalog: insideRoot(roots.publicRoot, 'catalog.v2.json'),
        corpusStatus: insideRoot(roots.publicRoot, 'corpus-status.v1.json'),
        packMigration: insideRoot(roots.publicRoot, 'pack-migration.v1.json'),
    };
    writeJsonAtomic(paths.catalog, outputs.catalog);
    writeJsonAtomic(paths.corpusStatus, outputs.corpusStatus);
    writeJsonAtomic(paths.packMigration, outputs.packMigration);
    return paths;
}

function dedupeArchivePayloads(archiveOccurrences) {
    const byHash = new Map();
    for (const archive of archiveOccurrences) {
        const existing = byHash.get(archive.sha256) ?? { sha256: archive.sha256, byteLength: archive.byteLength, occurrenceCount: 0 };
        existing.occurrenceCount += 1;
        byHash.set(archive.sha256, existing);
    }
    return [...byHash.values()].sort((a, b) => compareUtf8(a.sha256, b.sha256));
}

function buildPatterns(memberOccurrences) {
    const byFileType = new Map();
    for (const occurrence of memberOccurrences) {
        const key = `${occurrence.classification.kind}|${occurrence.classification.extension}`;
        const entry = byFileType.get(key) ?? {
            memberKind: 'file',
            kind: occurrence.classification.kind,
            extension: occurrence.classification.extension,
            occurrenceCount: 0,
            payloadShas: new Set(),
            archiveOccurrenceIds: new Set(),
            compressedBytes: 0,
            uncompressedBytes: 0,
        };
        entry.occurrenceCount += 1;
        entry.payloadShas.add(occurrence.payloadSha256);
        entry.archiveOccurrenceIds.add(occurrence.archiveOccurrenceId);
        entry.compressedBytes += occurrence.compressedBytes;
        entry.uncompressedBytes += occurrence.uncompressedBytes;
        byFileType.set(key, entry);
    }
    return {
        byFileType: [...byFileType.entries()].sort(([a], [b]) => compareUtf8(a, b)).map(([, entry]) => ({
            memberKind: entry.memberKind,
            kind: entry.kind,
            extension: entry.extension,
            occurrenceCount: entry.occurrenceCount,
            uniquePayloadAssetCount: entry.payloadShas.size,
            archiveOccurrenceCount: entry.archiveOccurrenceIds.size,
            compressedBytes: entry.compressedBytes,
            uncompressedBytes: entry.uncompressedBytes,
        })),
    };
}

function countOccurrences(ledger, ...extensions) {
    const wanted = new Set(extensions);
    return ledger.memberOccurrences.filter(occurrence => wanted.has(occurrence.classification.extension)).length;
}

function sumNullable(rows, key) {
    return rows.reduce((sum, row) => sum + (Number.isFinite(row[key]) ? row[key] : 0), 0);
}
