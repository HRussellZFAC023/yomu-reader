import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'docs/academy/audio/learning-voice-model-evidence.json');
const productionPath = resolve(
    process.env.LEARNING_VOICE_PRODUCTION
        ?? 'docs/academy/audio/learning-voice-production.json',
);
const modelRoot = resolve(
    process.env.AIVIS_MODEL_ROOT
        ?? `${homedir()}/Library/Application Support/AivisSpeech-Engine/Models`,
);
const engineCachePath = resolve(
    process.env.AIVIS_ENGINE_CACHE
        ?? resolve(modelRoot, '..', 'aivm_infos_cache.json'),
);
const productionSource = await readFile(productionPath);
const production = JSON.parse(productionSource);
const engineCacheSource = await readFile(engineCachePath);
const engineCache = JSON.parse(engineCacheSource);
const models = new Map();
for (const mapping of production.voiceMappings ?? []) {
    const existing = models.get(mapping.modelUuid);
    if (existing) {
        for (const field of ['modelName', 'modelVersion', 'modelPayloadSha256', 'modelSourceUrl', 'modelLicense']) {
            if (existing[field] !== mapping[field]) {
                throw new Error(`Conflicting ${field} locks for ${mapping.modelUuid}.`);
            }
        }
        existing.mappings.push(mapping);
        continue;
    }
    models.set(mapping.modelUuid, {
        uuid: mapping.modelUuid,
        modelName: mapping.modelName,
        modelVersion: mapping.modelVersion,
        modelPayloadSha256: mapping.modelPayloadSha256,
        modelSourceUrl: mapping.modelSourceUrl,
        modelDistribution: mapping.modelDistribution,
        modelLicense: mapping.modelLicense,
        mappings: [mapping],
    });
}
if (models.size === 0) throw new Error('Learning voice production contract has no model mappings.');

const evidence = [];
const engineStyleMappings = [];
let archivedLicense = null;
for (const expected of models.values()) {
    const fileName = `${expected.uuid}.aivmx`;
    const payload = await readFile(resolve(modelRoot, fileName));
    const payloadSha256 = sha256(payload);
    if (payloadSha256 !== expected.modelPayloadSha256) {
        throw new Error(`Unexpected Aivis model payload hash for ${expected.uuid}: ${payloadSha256}`);
    }
    const manifest = extractEmbeddedManifest(payload);
    if (manifest.uuid !== expected.uuid
        || manifest.name !== expected.modelName
        || manifest.version !== expected.modelVersion
        || manifest.model_architecture !== 'Style-Bert-VITS2 (JP-Extra)') {
        throw new Error(`Unexpected embedded manifest identity for ${expected.uuid}.`);
    }
    if (typeof expected.modelSourceUrl !== 'string'
        || !expected.modelSourceUrl.startsWith('https://hub.aivis-project.com/')
        || expected.modelLicense !== 'ACML-1.0') {
        throw new Error(`Unexpected source or licence lock for ${expected.uuid}.`);
    }
    if (expected.modelDistribution?.kind !== 'installed-aivmx-distribution'
        || expected.modelDistribution.fileName !== fileName
        || expected.modelDistribution.bytes !== payload.length
        || expected.modelDistribution.sha256 !== payloadSha256
        || expected.modelDistribution.authority !== 'exact-distribution-bytes') {
        throw new Error(`Unexpected model distribution lock for ${expected.uuid}.`);
    }
    const licenseSha256 = sha256(manifest.license);
    if (archivedLicense && archivedLicense.sha256 !== licenseSha256) {
        throw new Error(`Learning voice models do not embed the same archived licence: ${expected.uuid}.`);
    }
    archivedLicense ??= {
        id: expected.modelLicense,
        source: 'embedded aivm_manifest.license',
        sha256: licenseSha256,
        text: manifest.license,
    };
    const cached = engineCache.aivm_infos?.[expected.uuid];
    if (!cached
        || cached.manifest?.uuid !== expected.uuid
        || cached.manifest?.name !== expected.modelName
        || cached.manifest?.version !== expected.modelVersion
        || cached.file_size !== payload.length
        || basename(cached.file_path ?? '') !== fileName) {
        throw new Error(`Aivis engine cache is stale for ${expected.uuid}.`);
    }
    const availableStyles = (cached.speakers ?? []).flatMap(item => {
        const speaker = item.speaker;
        return (speaker?.styles ?? []).map(style => ({
            engineSpeakerUuid: speaker.speaker_uuid,
            engineSpeakerName: speaker.name,
            engineSpeakerVersion: speaker.version,
            styleId: style.id,
            styleName: style.name,
            styleType: style.type,
        }));
    });
    for (const mapping of expected.mappings) {
        if (mapping.engineFamily !== 'AivisSpeech + Style-Bert-VITS2 JP-Extra') {
            throw new Error(`Unexpected engine family for ${mapping.mappingId}.`);
        }
        const style = availableStyles.find(candidate => candidate.styleId === mapping.styleId);
        if (!style
            || style.styleName !== mapping.styleName
            || style.engineSpeakerName !== expected.modelName
            || style.engineSpeakerVersion !== expected.modelVersion) {
            throw new Error(`Aivis engine style mapping is stale for ${mapping.mappingId}.`);
        }
        engineStyleMappings.push({
            mappingId: mapping.mappingId,
            speakerId: mapping.speakerId,
            surfaceClasses: mapping.surfaceClasses,
            engineFamily: mapping.engineFamily,
            modelUuid: expected.uuid,
            modelName: expected.modelName,
            modelVersion: expected.modelVersion,
            modelPayloadSha256: payloadSha256,
            engineSpeakerUuid: style.engineSpeakerUuid,
            engineSpeakerName: style.engineSpeakerName,
            styleId: style.styleId,
            styleName: style.styleName,
            styleType: style.styleType,
        });
    }
    evidence.push({
        uuid: manifest.uuid,
        name: manifest.name,
        version: manifest.version,
        creators: manifest.creators,
        modelArchitecture: manifest.model_architecture,
        modelFormat: manifest.model_format,
        payloadFileName: fileName,
        payloadSha256,
        manifestSha256: sha256(canonicalJson(manifest)),
        licenseSha256,
        distribution: {
            kind: 'installed-aivmx-distribution',
            fileName,
            bytes: payload.length,
            sha256: payloadSha256,
            authority: 'exact-distribution-bytes',
        },
        sourceRecord: {
            url: expected.modelSourceUrl,
            authority: 'discovery-record-only',
            authoritativeForDistributionBytes: false,
        },
        speakers: (manifest.speakers ?? []).map(speaker => ({
            name: speaker.name,
            styles: (speaker.styles ?? []).map(style => ({
                name: style.name,
                localId: style.local_id,
            })),
        })),
    });
}

const archive = {
    schema: 'yomu-academy.learning-voice-model-evidence.v3',
    capturedOn: '2026-07-20',
    batchId: production.batchId,
    productionContractSha256: sha256(productionSource),
    sourceKind: 'installed-aivmx-embedded-manifest-and-engine-cache',
    scope: 'Model, licence, speaker and style identity only; weights, icons, portraits and voice samples are not copied.',
    license: archivedLicense,
    models: evidence,
    engine: {
        ...production.render.engine,
        versionResponseEncoding: 'utf8-plain-text',
        versionResponseSha256: sha256(production.render.engine.version),
    },
    engineStyleSource: {
        kind: 'AivisSpeech Engine aivm_infos_cache.json',
        fileName: basename(engineCachePath),
        fileSha256: sha256(engineCacheSource),
        relevantMappingsSha256: sha256(canonicalJson(engineStyleMappings)),
    },
    engineStyleMappings,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(archive, null, 2)}\n`);
console.log(`Archived ${evidence.length} model manifests at ${output}.`);

function extractEmbeddedManifest(payload) {
    const marker = payload.indexOf(Buffer.from('aivm_manifest'));
    const start = payload.indexOf(0x7b, marker);
    if (marker < 0 || start < 0) throw new Error('Embedded aivm_manifest metadata was not found.');
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < payload.length; index += 1) {
        const byte = payload[index];
        if (quoted) {
            if (escaped) escaped = false;
            else if (byte === 0x5c) escaped = true;
            else if (byte === 0x22) quoted = false;
            continue;
        }
        if (byte === 0x22) quoted = true;
        else if (byte === 0x7b) depth += 1;
        else if (byte === 0x7d && --depth === 0) {
            return JSON.parse(payload.subarray(start, index + 1).toString('utf8'));
        }
    }
    throw new Error('Embedded aivm_manifest JSON is incomplete.');
}

function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}
