import { existsSync } from 'node:fs';
import path from 'node:path';
import { PUBLIC_SCHEMA_VERSIONS } from './paths.mjs';
import { readJson } from './io.mjs';
import { validatePublicValue, validateClaims } from './privacy.mjs';

/**
 * Cheap deterministic validator for the COMMITTED public outputs. Needs no
 * private corpus, so it can run in `check:academy` and ordinary CI. Verifies
 * schema versions, the audited 96/916/688 corpus baseline, internal count
 * consistency, the privacy allowlist, and the claim guard.
 */
export const COMMITTED_BASELINE = Object.freeze({
    archiveOccurrenceCount: 96,
    memberOccurrenceCount: 916,
    uniquePayloadAssetCount: 688,
});
export const COMMITTED_MEDIA_BASELINE = Object.freeze({
    directResources: 3,
    uniqueDirectResourcePayloads: 1,
    pdfOccurrences: 716,
    uniquePdfPayloads: 527,
    audioOccurrences: 185,
    uniqueAudioPayloads: 146,
});

export function publicOutputsPresent(publicRoot) {
    return ['catalog.v2.json', 'corpus-status.v1.json', 'pack-migration.v1.json']
        .some(name => existsSync(path.join(publicRoot, name)));
}

export function validatePublicOutputs(publicRoot, {
    baseline = COMMITTED_BASELINE,
    mediaBaseline = COMMITTED_MEDIA_BASELINE,
} = {}) {
    const violations = [];
    const catalogPath = path.join(publicRoot, 'catalog.v2.json');
    const statusPath = path.join(publicRoot, 'corpus-status.v1.json');
    const migrationPath = path.join(publicRoot, 'pack-migration.v1.json');
    for (const filePath of [catalogPath, statusPath, migrationPath]) {
        if (!existsSync(filePath)) violations.push(`missing public output: ${path.basename(filePath)}`);
    }
    if (violations.length > 0) return violations;

    const catalog = readJson(catalogPath);
    const status = readJson(statusPath);
    const migration = readJson(migrationPath);

    if (catalog.schema !== PUBLIC_SCHEMA_VERSIONS.catalog) violations.push(`catalog schema mismatch: ${catalog.schema}`);
    if (status.schema !== PUBLIC_SCHEMA_VERSIONS.corpusStatus) violations.push(`corpus-status schema mismatch: ${status.schema}`);
    if (migration.schema !== PUBLIC_SCHEMA_VERSIONS.packMigration) violations.push(`pack-migration schema mismatch: ${migration.schema}`);

    validateCatalogCounts(catalog, baseline, violations);
    validateStatusCounts(status, catalog, mediaBaseline, violations);
    validateMigrationCounts(migration, violations);

    violations.push(...validatePublicValue(catalog, { label: 'catalog' }));
    violations.push(...validatePublicValue(status, { label: 'corpus-status' }));
    violations.push(...validatePublicValue(migration, { label: 'pack-migration' }));
    violations.push(...validateClaims(status));
    return violations;
}

function validateCatalogCounts(catalog, baseline, violations) {
    const summary = catalog.summary ?? {};
    for (const [key, expected] of Object.entries(baseline)) {
        if (summary[key] !== expected) violations.push(`catalog.summary.${key} must equal audited baseline ${expected} (got ${summary[key]})`);
    }
    if (catalog.archiveOccurrences.length !== summary.archiveOccurrenceCount) {
        violations.push('catalog.archiveOccurrences length disagrees with summary');
    }
    if (catalog.memberOccurrences.length !== summary.memberOccurrenceCount) {
        violations.push('catalog.memberOccurrences length disagrees with summary');
    }
    if (catalog.assets.length !== summary.uniquePayloadAssetCount) {
        violations.push('catalog.assets length disagrees with summary');
    }
    const memberCountFromArchives = catalog.archiveOccurrences.reduce((sum, archive) => sum + archive.memberOccurrenceCount, 0);
    if (memberCountFromArchives !== summary.memberOccurrenceCount) {
        violations.push('sum of archive memberOccurrenceCount disagrees with member occurrences');
    }
    const patternOccurrences = catalog.patterns.byFileType.reduce((sum, row) => sum + row.occurrenceCount, 0);
    if (patternOccurrences !== summary.memberOccurrenceCount) {
        violations.push('patterns.byFileType occurrence total disagrees with member occurrences');
    }
    const uniqueShas = new Set(catalog.memberOccurrences.map(occurrence => occurrence.payloadSha256));
    if (uniqueShas.size !== summary.uniquePayloadAssetCount) {
        violations.push('unique payload hash count disagrees with assets');
    }
    for (const occurrence of catalog.memberOccurrences) {
        if (!/^[a-f0-9]{64}$/.test(occurrence.payloadSha256 ?? '')) {
            violations.push(`member ${occurrence.id} has an invalid payload hash`);
            break;
        }
    }
    for (const asset of catalog.assets) {
        if (!Number.isSafeInteger(asset.byteLength) || asset.byteLength < 0) {
            violations.push(`asset ${asset.sha256} has an invalid byte length`);
            break;
        }
        if (asset.status !== 'stored') {
            violations.push(`asset ${asset.sha256} lacks an explicit stored state`);
            break;
        }
    }
}

function validateStatusCounts(status, catalog, mediaBaseline, violations) {
    const denominators = status.denominators ?? {};
    validateStatusDenominators(denominators, catalog, mediaBaseline, violations);
    validatePayloadCounts(status, denominators, violations);
    validateDirectResources(status.directResourceOccurrences, denominators, violations);
    validatePdfCensus(status, violations);
    validateAudioCensus(status, violations);
}

function validateStatusDenominators(denominators, catalog, mediaBaseline, violations) {
    if (denominators.archiveOccurrences !== catalog.summary.archiveOccurrenceCount
        || denominators.memberOccurrences !== catalog.summary.memberOccurrenceCount
        || denominators.uniquePayloads !== catalog.summary.uniquePayloadAssetCount) {
        violations.push('corpus-status denominators disagree with catalog summary');
    }
    for (const [key, expected] of Object.entries(mediaBaseline)) {
        if (denominators[key] !== expected) {
            violations.push(`corpus-status.denominators.${key} must equal audited baseline ${expected} (got ${denominators[key]})`);
        }
    }
}

function validatePayloadCounts(status, denominators, violations) {
    if (status.pdfPayloads.length !== denominators.uniquePdfPayloads) {
        violations.push('corpus-status pdfPayloads length disagrees with uniquePdfPayloads');
    }
    if (status.audioPayloads.length !== denominators.uniqueAudioPayloads) {
        violations.push('corpus-status audioPayloads length disagrees with uniqueAudioPayloads');
    }
    if (status.directResourceOccurrences.length !== denominators.directResources) {
        violations.push('corpus-status directResourceOccurrences length disagrees with directResources');
    }
}

function validateDirectResources(resources, denominators, violations) {
    const uniqueDirectShas = new Set(resources.map(resource => resource.payloadSha256));
    if (uniqueDirectShas.size !== denominators.uniqueDirectResourcePayloads) {
        violations.push('corpus-status unique direct-resource count disagrees with directResourceOccurrences');
    }
    for (const resource of resources) {
        if (resource.status !== 'stored' || !/^[a-f0-9]{64}$/.test(resource.payloadSha256 ?? '')) {
            violations.push(`direct resource ${resource.id} lacks an explicit stored state or valid payload hash`);
            break;
        }
    }
}

function validatePdfCensus(status, violations) {
    const pdfCensus = status.census?.pdf ?? {};
    if ((pdfCensus.complete ?? 0) + (pdfCensus.failed ?? 0) !== status.pdfPayloads.length) {
        violations.push('pdf census complete+failed does not cover every unique PDF payload');
    }
    validatePdfPayloadStates(status.pdfPayloads, violations);
    validatePdfFailureAggregates(status.pdfPayloads, pdfCensus, violations);
    validatePdfCountAggregates(status.pdfPayloads, pdfCensus, violations);
}

function validatePdfPayloadStates(pdfPayloads, violations) {
    for (const row of pdfPayloads) {
        if (!row.status || (!row.status.startsWith('census-complete') && !row.status.startsWith('failed:'))) {
            violations.push(`pdf payload ${row.payloadSha256} lacks an explicit census state`);
            break;
        }
        if (!row.layoutExtractionStatus || !row.nativeImageExtractionStatus || !row.vectorExtractionStatus) {
            violations.push(`pdf payload ${row.payloadSha256} lacks explicit layout/native-image/vector extraction states`);
            break;
        }
    }
}

function validatePdfFailureAggregates(pdfPayloads, pdfCensus, violations) {
    const layoutFailures = pdfPayloads.filter(row => row.layoutExtractionStatus.startsWith('failed:')).length;
    const nativeFailures = pdfPayloads.filter(row => row.nativeImageExtractionStatus.startsWith('failed:')).length;
    const vectorFailures = pdfPayloads.filter(row => row.vectorExtractionStatus !== 'complete').length;
    if (pdfCensus.layoutFailed !== layoutFailures
        || pdfCensus.nativeImageExtractionFailed !== nativeFailures
        || pdfCensus.vectorExtractionFailed !== vectorFailures) {
        violations.push('pdf extraction-failure aggregates disagree with payload states');
    }
}

function validatePdfCountAggregates(pdfPayloads, pdfCensus, violations) {
    for (const key of [
        'pageCount', 'pagesWithoutTextLayer', 'pagesWithoutLayout', 'nativeImageObjectCount',
        'extractedNativeImageCount', 'positionedMediaRegionCount', 'textBoxCount', 'vectorReviewPageCount',
        'vectorProbeFailedPageCount', 'vectorHeavyPageCount', 'vectorContentPageCount',
    ]) {
        const expected = pdfPayloads.reduce((sum, row) => sum + (Number.isFinite(row[key]) ? row[key] : 0), 0);
        if (pdfCensus[key] !== expected) violations.push(`pdf census aggregate ${key} disagrees with payload rows`);
    }
}

function validateAudioCensus(status, violations) {
    const audioCensus = status.census?.audio ?? {};
    if ((audioCensus.probed ?? 0) + (audioCensus.failed ?? 0) !== status.audioPayloads.length) {
        violations.push('audio census probed+failed does not cover every unique audio payload');
    }
    for (const row of status.audioPayloads) {
        if (!row.status || (row.status !== 'probed' && !row.status.startsWith('failed:'))) {
            violations.push(`audio payload ${row.payloadSha256} lacks an explicit probe state`);
            break;
        }
    }
}

function validateMigrationCounts(migration, violations) {
    const totals = migration.totals ?? {};
    if (migration.packs.length !== totals.packCount) violations.push('pack-migration packs length disagrees with totals.packCount');
    const itemSum = migration.packs.reduce((sum, pack) => sum + pack.counts.donorItemCount, 0);
    if (itemSum !== totals.donorItemCount) violations.push('pack-migration item totals disagree with per-pack counts');
    if (totals.sourceCandidateCount !== totals.donorItemCount) {
        violations.push('every donor item must survive as exactly one source candidate');
    }
    for (const pack of migration.packs) {
        if (pack.status !== 'candidates-review-required') {
            violations.push(`pack ${pack.packRef} claims a status beyond review-required candidates`);
            break;
        }
    }
}
