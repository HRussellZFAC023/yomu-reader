import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { EXTRACTION_REVISION, PRIVATE_SCHEMA_VERSIONS, insideRoot } from './paths.mjs';
import { compareUtf8, ordinalId, readJsonIfPresent, sha256Hex, writeJsonAtomic } from './io.mjs';
import { classifyMemberName, describePathShape } from './classify.mjs';
import { loadManifest, mapHarvestPath } from './manifest.mjs';
import { readZipMembers, readMemberPayload } from './zip.mjs';
import { createPayloadStore } from './payload-store.mjs';

const ARCHIVE_SCAN_REVISION = 'yomu-academy.source-pipeline.archive-scan/v2-crc32';

/**
 * Builds the PRIVATE occurrence/payload ledger for the whole raw corpus and
 * fills the deduplicated payload store. Resumable: per-archive scans are cached
 * by (archive sha256, extraction revision), so re-runs only touch new bytes.
 */
export function buildPrivateLedger(roots, { log = () => {}, expectedManifestSha256 } = {}) {
    const { modules, aggregate } = loadManifest(roots.corpusRoot, expectedManifestSha256);
    const store = createPayloadStore(roots.privateRoot);
    const cacheRoot = insideRoot(roots.privateRoot, 'scan-cache');

    const archiveFiles = [];
    const directFiles = [];
    for (const relativePath of walkFiles(roots.corpusRoot)) {
        if (relativePath === 'manifest.json') continue;
        (relativePath.toLowerCase().endsWith('.zip') ? archiveFiles : directFiles).push(relativePath);
    }
    archiveFiles.sort(compareUtf8);
    directFiles.sort(compareUtf8);

    const archives = [];
    for (const relativePath of archiveFiles) {
        archives.push(scanArchive({ roots, relativePath, modules, store, cacheRoot, log }));
    }
    const directResources = directFiles.map(relativePath => scanDirectResource({ roots, relativePath, modules, store }));

    const ledger = assembleLedger({ aggregate, archives, directResources });
    writeJsonAtomic(insideRoot(roots.privateRoot, 'private-ledger.v1.json'), ledger);
    return ledger;
}

function scanArchive({ roots, relativePath, modules, store, cacheRoot, log }) {
    const absolutePath = path.join(roots.corpusRoot, relativePath);
    const bytes = readFileSync(absolutePath);
    const sha256 = sha256Hex(bytes);
    const cachePath = insideRoot(cacheRoot, `${sha256}.json`);
    const cached = readJsonIfPresent(cachePath);
    if (cached?.extractionRevision === EXTRACTION_REVISION
        && cached?.archiveScanRevision === ARCHIVE_SCAN_REVISION
        && membersPresent(cached, store)) {
        return { ...cached, relativePath, mapping: mapHarvestPath(relativePath, modules) };
    }

    log(`scan ${relativePath}`);
    const { buffer, members } = readZipMembers(bytes, absolutePath);
    const memberRecords = members.map(member => {
        if (member.memberKind !== 'file') {
            return { ...member, payloadSha256: null };
        }
        const payload = readMemberPayload(buffer, member, absolutePath);
        const payloadSha256 = sha256Hex(payload);
        const classification = classifyMemberName(member.name);
        store.put(payloadSha256, classification.extension, payload);
        return { ...member, payloadSha256, classification, pathShape: describePathShape(member.name) };
    });
    const record = {
        extractionRevision: EXTRACTION_REVISION,
        archiveScanRevision: ARCHIVE_SCAN_REVISION,
        sha256,
        byteLength: bytes.length,
        members: memberRecords,
    };
    writeJsonAtomic(cachePath, record);
    return { ...record, relativePath, mapping: mapHarvestPath(relativePath, modules) };
}

function scanDirectResource({ roots, relativePath, modules, store }) {
    const absolutePath = path.join(roots.corpusRoot, relativePath);
    const bytes = readFileSync(absolutePath);
    const sha256 = sha256Hex(bytes);
    const classification = classifyMemberName(relativePath);
    store.put(sha256, classification.extension, bytes);
    return {
        relativePath,
        sha256,
        byteLength: bytes.length,
        classification,
        mapping: mapHarvestPath(relativePath, modules),
    };
}

function assembleLedger({ aggregate, archives, directResources }) {
    const sortedArchives = [...archives].sort((a, b) => compareUtf8(a.sha256, b.sha256) || compareUtf8(a.relativePath, b.relativePath));
    const archiveOccurrences = sortedArchives.map((archive, index) => ({
        id: ordinalId('archive', index),
        relativePath: archive.relativePath,
        sha256: archive.sha256,
        byteLength: archive.byteLength,
        mapping: archive.mapping,
        extractionRevision: archive.extractionRevision,
    }));

    const memberOccurrences = [];
    const payloads = new Map();
    sortedArchives.forEach((archive, archiveIndex) => {
        for (const member of archive.members) {
            if (member.memberKind !== 'file') continue;
            const occurrence = {
                id: ordinalId('member', memberOccurrences.length),
                archiveOccurrenceId: archiveOccurrences[archiveIndex].id,
                centralDirectoryIndex: member.centralDirectoryIndex,
                name: member.name,
                nameEncoding: member.nameEncoding,
                compression: member.compression,
                compressedBytes: member.compressedBytes,
                uncompressedBytes: member.uncompressedBytes,
                payloadSha256: member.payloadSha256,
                classification: member.classification,
                pathShape: member.pathShape,
            };
            memberOccurrences.push(occurrence);
            recordPayload(payloads, occurrence, archiveOccurrences[archiveIndex].id);
        }
    });
    for (const resource of directResources) {
        recordPayload(payloads, {
            payloadSha256: resource.sha256,
            uncompressedBytes: resource.byteLength,
            classification: resource.classification,
        }, null);
    }

    const uniquePayloads = [...payloads.values()].sort((a, b) => compareUtf8(a.sha256, b.sha256));
    return {
        schema: PRIVATE_SCHEMA_VERSIONS.ledger,
        extractionRevision: EXTRACTION_REVISION,
        manifest: aggregate,
        archiveOccurrences,
        directResources,
        memberOccurrences,
        uniquePayloads,
    };
}

function recordPayload(payloads, occurrence, archiveOccurrenceId) {
    const existing = payloads.get(occurrence.payloadSha256) ?? {
        sha256: occurrence.payloadSha256,
        byteLength: occurrence.uncompressedBytes,
        occurrenceCount: 0,
        archiveOccurrenceIds: [],
        directResourceCount: 0,
        classifications: [],
    };
    if (existing.byteLength !== occurrence.uncompressedBytes) {
        throw new Error(`SHA-256 collision or size mismatch for payload ${occurrence.payloadSha256}`);
    }
    if (archiveOccurrenceId) {
        existing.occurrenceCount += 1;
        if (!existing.archiveOccurrenceIds.includes(archiveOccurrenceId)) existing.archiveOccurrenceIds.push(archiveOccurrenceId);
    } else {
        existing.directResourceCount += 1;
    }
    const key = JSON.stringify(occurrence.classification);
    if (!existing.classifications.some(entry => JSON.stringify(entry) === key)) {
        existing.classifications.push(occurrence.classification);
    }
    payloads.set(occurrence.payloadSha256, existing);
}

function membersPresent(cached, store) {
    return cached.members.every(member => member.memberKind !== 'file'
        || store.has(member.payloadSha256));
}

function* walkFiles(root, prefix = '') {
    const entries = readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => compareUtf8(a.name, b.name));
    for (const entry of entries) {
        const relative = prefix ? path.join(prefix, entry.name) : entry.name;
        if (entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) yield* walkFiles(root, relative);
        else if (statSync(path.join(root, relative)).isFile()) yield relative;
    }
}
