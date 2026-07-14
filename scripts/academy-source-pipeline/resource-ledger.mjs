import { readJson, writeJsonAtomic } from './io.mjs';

/**
 * Updates the committed RESOURCE-LEDGER from generated pipeline evidence
 * WITHOUT inflating source-question coverage: Stage 1's single audited and
 * implemented question remains quarantined (zero currently playable), and donor items are recorded only as
 * `migratedSourceItemCandidates`.
 */
export function updateResourceLedger(roots, { catalog, corpusStatus, packMigration }) {
    const ledger = readJson(roots.resourceLedgerPath);
    if (ledger.coverage.sourceQuestionsAudited !== 1
        || ledger.coverage.sourceQuestionsImplemented !== 1
        || ledger.coverage.sourceQuestionsPlayable !== 0) {
        throw new Error('RESOURCE-LEDGER coverage drifted from the audited/implemented/playable 1/1/0 baseline; refusing to update.');
    }

    ledger.baselineCounts = {
        ...ledger.baselineCounts,
        downloadedFolderArchives: catalog.summary.archiveOccurrenceCount,
        archiveMemberOccurrences: catalog.summary.memberOccurrenceCount,
        uniquePayloads: catalog.summary.uniquePayloadAssetCount,
        uncompressedBytesApproximate: catalog.summary.totalMemberUncompressedBytes,
        pdfOccurrences: corpusStatus.denominators.pdfOccurrences,
        uniquePdfPayloads: corpusStatus.denominators.uniquePdfPayloads,
        audioOccurrences: corpusStatus.denominators.audioOccurrences,
        uniqueAudioPayloads: corpusStatus.denominators.uniqueAudioPayloads,
    };
    ledger.status = 'stage-2-census-complete';
    ledger.coverage = {
        ...ledger.coverage,
        documentsCensused: corpusStatus.denominators.uniquePdfPayloads,
        sourceItemCandidates: packMigration.totals.sourceCandidateCount,
        positionedMediaRegionCandidates: corpusStatus.census.pdf.positionedMediaRegionCount,
        vectorReviewPages: corpusStatus.census.pdf.vectorReviewPageCount,
        audioPayloadsProbed: corpusStatus.census.audio.probed,
    };
    ledger.releaseGate = {
        ...ledger.releaseGate,
        allPayloadsCensused: corpusStatus.releaseGate.allPayloadsCensused,
    };
    ledger.stage2SourcePipeline = {
        status: 'census-complete-review-open',
        extractionRevision: corpusStatus.extractionRevision,
        publicOutputs: [
            '/academy/content/source-pipeline/catalog.v2.json',
            '/academy/content/source-pipeline/corpus-status.v1.json',
            '/academy/content/source-pipeline/pack-migration.v1.json',
        ],
        migratedSourceItemCandidates: packMigration.totals.sourceCandidateCount,
        migratedPackCount: packMigration.totals.packCount,
        unresolvedLocusCount: packMigration.totals.unresolvedLocusCount,
        pdfCensus: corpusStatus.census.pdf,
        audioCensus: corpusStatus.census.audio,
        note: 'All payloads have explicit storage/census states. Donor items remain source-item candidates, not verified or playable source questions.',
    };
    writeJsonAtomic(roots.resourceLedgerPath, ledger);
    return ledger;
}
