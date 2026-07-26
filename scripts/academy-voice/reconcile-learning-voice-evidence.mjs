#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const write = process.argv.includes('--write');
const productionPath = resolve(root, 'docs/academy/audio/learning-voice-production.json');
const modelPath = resolve(root, 'docs/academy/audio/learning-voice-model-evidence.json');
const queryPath = resolve(root, 'docs/academy/audio/learning-voice-query-evidence.json');
const catalogPath = resolve(root, 'public/academy/audio/learning-voice-playback.json');

const productionSource = await readFile(productionPath);
const modelSource = await readFile(modelPath);
const querySource = await readFile(queryPath);
const catalogSource = await readFile(catalogPath);
const production = JSON.parse(productionSource);
const model = JSON.parse(modelSource);
const current = JSON.parse(querySource);
const catalog = JSON.parse(catalogSource);

if (production.schema !== 'yomu-academy.learning-voice-production.v2') {
    throw new Error('Unexpected production contract schema.');
}
if (model.schema !== 'yomu-academy.learning-voice-model-evidence.v4') {
    throw new Error('Unexpected model evidence schema.');
}

const currentById = new Map(current.entries.map(entry => [entry.voiceLineId, entry]));
const catalogById = new Map(catalog.entries.map(entry => [entry.lineId, entry]));
const entries = production.entries.map(source => {
    const lineId = source.identity.voiceLineId;
    const archived = currentById.get(lineId);
    if (!archived) throw new Error(`Archived canonical query is missing: ${lineId}`);
    const disposition = source.disposition.status;
    const catalogEntry = catalogById.get(lineId);
    if ((disposition === 'accepted') !== Boolean(catalogEntry)) {
        throw new Error(`Catalog disposition does not match production: ${lineId}`);
    }
    const rejectedAssetFingerprint = archived.rejectedAssetFingerprint ?? archived.asset ?? null;
    return {
        voiceLineId: lineId,
        mappingId: archived.mappingId,
        text: archived.text,
        request: archived.request,
        options: archived.options,
        audioQuery: archived.audioQuery,
        audioQuerySha256: archived.audioQuerySha256,
        cacheKey: archived.cacheKey,
        disposition,
        asset: catalogEntry ? {
            url: catalogEntry.url,
            sha256: catalogEntry.assetSha256,
            bytes: catalogEntry.bytes,
        } : null,
        rejectedAssetFingerprint: disposition === 'rejected' ? rejectedAssetFingerprint : null,
    };
});

const expected = {
    schema: 'yomu-academy.learning-voice-query-evidence.v2',
    capturedOn: current.capturedOn,
    batchId: production.batchId,
    productionContractSha256: sha256(productionSource),
    modelEvidenceSha256: sha256(modelSource),
    engine: production.render.engine,
    renderContract: {
        schema: production.render.schema,
        cacheKey: production.render.cacheKey,
    },
    styleMappings: current.styleMappings,
    entries,
};
if (write) {
    throw new Error('Query evidence writing requires the live loopback archive command; reconciliation is verification-only.');
}
if (JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new Error('Committed query evidence metadata is stale; refresh it intentionally without changing canonical query numbers.');
}
console.log(`Verified ${entries.length} immutable query records without mutation.`);

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}
