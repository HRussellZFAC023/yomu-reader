import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const smokeScriptPath = 'scripts/academy-voice/learning-voice-browser-smoke.mjs';
const runtimeSourcePaths = [
    'src/academy/integration/yomu-bridge.ts',
    'src/academy/audio/browser-speech.ts',
    'src/academy/audio/learning-voice.ts',
    'src/academy/audio/worker-tts.ts',
    'src/academy/routing/world-flow.ts',
    'src/academy/ui/cafe-world.ts',
    'src/academy/ui/lesson-screen.ts',
    'src/academy/ui/world-screen.ts',
];
const toolchainPaths = [
    'scripts/academy-voice/archive-learning-voice-provenance.mjs',
    'scripts/academy-voice/build-voice-production-manifest.mjs',
    'scripts/academy-voice/learning-voice-browser-smoke.mjs',
    'scripts/academy-voice/lock-learning-voice.mjs',
    'scripts/academy-voice/qa-learning-voice.mjs',
    'scripts/academy-voice/render-learning-voice.py',
    'scripts/sync-academy.cjs',
];
const sources = {
    productionContract: 'docs/academy/audio/learning-voice-production.json',
    catalog: 'public/academy/audio/learning-voice-playback.json',
    hostedCatalog: 'docs/public/academy/audio/learning-voice-playback.json',
    modelEvidence: 'docs/academy/audio/learning-voice-model-evidence.json',
    queryEvidence: 'docs/academy/audio/learning-voice-query-evidence.json',
    objectiveQa: 'docs/academy/audio/learning-voice-acceptance.json',
    browserSmoke: 'docs/academy/audio/learning-voice-browser-smoke.json',
};
const loaded = Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([key, path]) => {
    const bytes = await readFile(resolve(root, path));
    return [key, { path, bytes, sha256: sha256(bytes), json: JSON.parse(bytes) }];
})));
const historicalReviews = await optionalEvidence(
    'docs/academy/audio/learning-voice-model-reviews.json',
);
if (historicalReviews) loaded.historicalModelReviews = historicalReviews;

if (!loaded.catalog.bytes.equals(loaded.hostedCatalog.bytes)) {
    throw new Error('Hosted learning voice catalog is stale.');
}
const contractValidation = runContractValidation();
const production = loaded.productionContract.json;
const catalog = loaded.catalog.json;
const modelEvidence = loaded.modelEvidence.json;
const queryEvidence = loaded.queryEvidence.json;
const objectiveQa = loaded.objectiveQa.json;
if (modelEvidence.schema !== 'yomu-academy.learning-voice-model-evidence.v2'
    || modelEvidence.batchId !== production.batchId
    || modelEvidence.productionContractSha256 !== loaded.productionContract.sha256
    || modelEvidence.engineStyleSource?.relevantMappingsSha256 !== sha256(canonicalJson(
        modelEvidence.engineStyleMappings,
    ))) {
    throw new Error('Archived model, licence, or engine-style evidence is stale.');
}
if (queryEvidence.schema !== 'yomu-academy.learning-voice-query-evidence.v1'
    || queryEvidence.batchId !== production.batchId
    || queryEvidence.productionContractSha256 !== loaded.productionContract.sha256
    || queryEvidence.modelEvidenceSha256 !== loaded.modelEvidence.sha256
    || queryEvidence.entries?.length !== production.entries.length) {
    throw new Error('Archived canonical audio-query evidence is stale.');
}
if (!objectiveQa.complete || objectiveQa.schema !== 'yomu-academy.learning-voice-acceptance.v4') {
    throw new Error('Learning voice objective acceptance is incomplete.');
}
if (!objectiveQa.ownerQualityApproved || objectiveQa.ownerLineByLineReviewed !== false) {
    throw new Error('Learning voice owner approval is missing or overclaimed.');
}
if (objectiveQa.batchId !== production.batchId
    || objectiveQa.catalogSha256 !== loaded.catalog.sha256
    || objectiveQa.productionContract?.sha256 !== loaded.productionContract.sha256
    || objectiveQa.archivedLicenceEvidence?.modelEvidenceSha256 !== loaded.modelEvidence.sha256
    || objectiveQa.archivedQueryEvidence?.sha256 !== loaded.queryEvidence.sha256
    || objectiveQa.archivedLicenceEvidence?.sha256 !== modelEvidence.license?.sha256
    || canonicalJson(objectiveQa.archivedLicenceEvidence?.engineStyleSource)
        !== canonicalJson(modelEvidence.engineStyleSource)) {
    throw new Error('Learning voice objective acceptance is stale for this production contract.');
}
if (loaded.browserSmoke.json.verdict !== 'pass'
    || loaded.browserSmoke.json.schema !== 'yomu-academy.learning-voice-browser-smoke.v3'
    || loaded.browserSmoke.json.productionBuild?.mode !== 'production'
    || loaded.browserSmoke.json.productionBuild?.byteParity !== true) {
    throw new Error('Built-route learning voice smoke is incomplete.');
}
if (loaded.browserSmoke.json.batchId !== production.batchId
    || loaded.browserSmoke.json.catalogSha256 !== loaded.catalog.sha256
    || loaded.browserSmoke.json.productionContractSha256 !== loaded.productionContract.sha256) {
    throw new Error('Built-route learning voice smoke is stale for this production contract.');
}
if (loaded.browserSmoke.json.smokeScriptSha256 !== sha256(await readFile(resolve(root, smokeScriptPath)))
    || Object.keys(loaded.browserSmoke.json.runtimeSources ?? {}).sort().join(',') !== runtimeSourcePaths.slice().sort().join(',')) {
    throw new Error('Built-route learning voice smoke has stale or incomplete source coverage.');
}
const productionBuild = loaded.browserSmoke.json.productionBuild;
for (const [pathKey, hashKey] of [
    ['distApp', 'distAppSha256'],
    ['hostedApp', 'hostedAppSha256'],
]) {
    if (productionBuild[hashKey] !== sha256(await readFile(resolve(root, productionBuild[pathKey])))) {
        throw new Error(`Built-route learning voice smoke is stale for ${productionBuild[pathKey]}.`);
    }
}
if (productionBuild.candidateAppSha256 !== productionBuild.distAppSha256
    || productionBuild.distAppSha256 !== productionBuild.hostedAppSha256) {
    throw new Error('Production Academy app byte parity is stale.');
}
for (const sourcePath of runtimeSourcePaths) {
    const currentHash = sha256(await readFile(resolve(root, sourcePath)));
    if (loaded.browserSmoke.json.runtimeSources[sourcePath] !== currentHash) {
        throw new Error(`Built-route learning voice smoke is stale for ${sourcePath}.`);
    }
}
if (!production.qualityApproval?.ownerQualityApproved
    || production.qualityApproval?.ownerLineByLineReviewed !== false
    || production.qualityApproval?.humanReviewed !== false) {
    throw new Error('Learning voice production approval is invalid.');
}

const mappingById = new Map(production.voiceMappings.map(mapping => [mapping.mappingId, mapping]));
const sourceById = new Map(production.entries.map(entry => [entry.identity.voiceLineId, entry]));
const modelEvidenceByUuid = new Map(modelEvidence.models.map(model => [model.uuid, model]));
const styleEvidenceByMappingId = new Map(
    modelEvidence.engineStyleMappings.map(mapping => [mapping.mappingId, mapping]),
);
for (const mapping of production.voiceMappings) {
    const model = modelEvidenceByUuid.get(mapping.modelUuid);
    const style = styleEvidenceByMappingId.get(mapping.mappingId);
    if (!model
        || model.name !== mapping.modelName
        || model.version !== mapping.modelVersion
        || model.payloadSha256 !== mapping.modelPayloadSha256
        || model.primarySourceUrl !== mapping.modelSourceUrl
        || model.licenseSha256 !== modelEvidence.license.sha256
        || !style
        || style.speakerId !== mapping.speakerId
        || style.engineFamily !== mapping.engineFamily
        || canonicalJson(style.surfaceClasses) !== canonicalJson(mapping.surfaceClasses)
        || style.modelUuid !== mapping.modelUuid
        || style.modelName !== mapping.modelName
        || style.modelVersion !== mapping.modelVersion
        || style.modelPayloadSha256 !== mapping.modelPayloadSha256
        || style.styleId !== mapping.styleId
        || style.styleName !== mapping.styleName) {
        throw new Error(`Archived model/style mapping is stale: ${mapping.mappingId}`);
    }
}
const requiredIds = new Set(production.triage.reviewedRequiredVoiceLineIds);
if (catalog.entries.length !== requiredIds.size
    || catalog.entries.some(entry => !requiredIds.has(entry.lineId))) {
    throw new Error('Accepted catalog does not close the reviewed batch denominator.');
}
if (objectiveQa.entries.length !== catalog.entries.length
    || objectiveQa.entries.some(entry => entry.verdict !== 'pass' || !requiredIds.has(entry.lineId))) {
    throw new Error('Objective QA does not pass the complete reviewed denominator.');
}
const toolchain = Object.fromEntries(await Promise.all(toolchainPaths.map(async sourcePath => [
    sourcePath,
    sha256(await readFile(resolve(root, sourcePath))),
])));

const archive = {
    schema: 'yomu-academy.learning-voice-locks.v4',
    lockedOn: '2026-07-20',
    batchId: production.batchId,
    scope: production.scope,
    qualityApproval: production.qualityApproval,
    ownerQualityApproved: true,
    ownerLineByLineReviewed: false,
    humanReviewed: false,
    audioModelReviewed: catalog.entries.every(entry => entry.review.listening.audioModelReviewed === true),
    contractValidation,
    toolchain,
    engine: production.render.engine,
    encoder: production.render.encoder,
    renderContract: {
        schema: production.render.schema,
        cacheKey: production.render.cacheKey,
    },
    triage: production.triage,
    voiceMappings: production.voiceMappings,
    counts: {
        requiredVoiceLines: requiredIds.size,
        excludedCandidates: production.triage.reviewedExclusions.length,
        acceptedVoiceLines: catalog.entries.length,
        nativeBandVoiceLines: catalog.entries.filter(entry => entry.band === 'native').length,
        runtimeBindings: catalog.entries.flatMap(entry => entry.bindings).length,
        ownerQualityApproved: catalog.entries.filter(entry => (
            entry.review.listening.ownerQualityApproved === true
        )).length,
        humanReviewed: catalog.entries.filter(entry => entry.review.listening.humanReviewed === true).length,
    },
    evidence: Object.fromEntries(Object.entries(loaded).map(([key, value]) => [key, {
        path: value.path,
        sha256: value.sha256,
    }])),
    entries: catalog.entries.map(entry => {
        const source = sourceById.get(entry.lineId);
        const mapping = mappingById.get(source?.mappingId);
        if (!source || !mapping) throw new Error(`Production identity is missing: ${entry.lineId}`);
        return {
            lineId: entry.lineId,
            identity: source.identity,
            bindingIds: entry.bindings.map(binding => binding.lineId),
            speakerId: entry.speakerId,
            role: entry.role,
            intent: entry.intent,
            locale: entry.locale,
            band: entry.band,
            surface: entry.surface,
            japanese: entry.japanese,
            sourceSha256: entry.sourceSha256,
            sourceRevision: entry.sourceRevision,
            audioQuerySha256: entry.audioQuerySha256,
            cacheKey: entry.cacheKey,
            assetSha256: entry.assetSha256,
            bytes: entry.bytes,
            durationSeconds: entry.durationSeconds,
            url: entry.url,
            mappingId: source.mappingId,
            model: {
                uuid: entry.modelUuid,
                name: entry.modelName,
                version: entry.modelVersion,
                payloadSha256: entry.modelPayloadSha256,
                sourceUrl: entry.modelSourceUrl,
                license: entry.modelLicense,
                archivedLicenseSha256: loaded.modelEvidence.json.license.sha256,
                styleId: entry.styleId,
                styleName: entry.styleName,
            },
            queryOverrides: entry.queryOverrides,
            moraOverrides: entry.moraOverrides,
            acceptance: {
                reviewStatus: entry.reviewStatus,
                qualityApprovalStatus: entry.qualityApprovalStatus,
                ownerQualityApproved: entry.review.listening.ownerQualityApproved,
                ownerLineByLineReviewed: entry.review.listening.ownerLineByLineReviewed,
                audioModelReviewed: entry.review.listening.audioModelReviewed,
                humanReviewed: entry.review.listening.humanReviewed,
                independentAudioModelReviews: entry.review.listening.independentAudioModelReviews,
                objectiveQaVerdict: objectiveQa.entries.find(candidate => (
                    candidate.lineId === entry.lineId
                ))?.verdict,
            },
        };
    }),
};
await writeFile(
    resolve(root, 'docs/academy/audio/learning-voice-locks.json'),
    `${JSON.stringify(archive, null, 2)}\n`,
);
console.log(`Locked ${archive.counts.acceptedVoiceLines} native learning voice assets and ${archive.counts.runtimeBindings} bindings.`);

function runContractValidation() {
    const result = spawnSync('python3', ['scripts/academy-voice/render-learning-voice.py'], {
        cwd: root,
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(`Learning voice production contract failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout);
}

async function optionalEvidence(path) {
    try {
        const bytes = await readFile(resolve(root, path));
        return { path, bytes, sha256: sha256(bytes), json: JSON.parse(bytes) };
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
