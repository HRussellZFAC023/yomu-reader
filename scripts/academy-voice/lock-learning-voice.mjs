#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const write = process.argv.includes('--write');
const outputPath = resolve(root, 'docs/academy/audio/learning-voice-locks.json');
const toolchainPaths = [
    'src/academy/integration/yomu-bridge.ts',
    'src/academy/audio/browser-speech.ts',
    'src/academy/audio/learning-voice.ts',
    'src/academy/audio/worker-tts.ts',
    'src/academy/content/lesson-zero-follow-instructions.ts',
    'src/academy/content/lesson-zero-greeting.ts',
    'src/academy/content/lesson-zero-vowel-anchors.ts',
    'src/academy/domain/classroom-instruction-session.ts',
    'src/academy/domain/world-locations.ts',
    'src/academy/ui/classroom-instruction-screen.ts',
    'src/academy/ui/lesson-zero-greeting-screen.ts',
    'src/academy/ui/lesson-zero-vowel-screen.ts',
    'src/academy/ui/lesson-zero-vowel-writing-screen.ts',
    'src/academy/ui/cafe-world.ts',
    'scripts/academy-voice/archive-learning-voice-provenance.mjs',
    'scripts/academy-voice/capture-learning-voice-local-expected.mjs',
    'scripts/academy-voice/learning-voice-local-browser-proof.mjs',
    'scripts/academy-voice/learning-voice-production-proof.mjs',
    'scripts/academy-voice/lock-learning-voice.mjs',
    'scripts/academy-voice/promote-learning-voice-candidates.mjs',
    'scripts/academy-voice/qa-learning-voice.mjs',
    'scripts/academy-voice/reconcile-learning-voice-evidence.mjs',
    'scripts/academy-voice/render-learning-voice.py',
    'scripts/academy-voice/review-learning-voice-models.mjs',
];
const evidencePaths = {
    productionContract: 'docs/academy/audio/learning-voice-production.json',
    modelEvidence: 'docs/academy/audio/learning-voice-model-evidence.json',
    queryEvidence: 'docs/academy/audio/learning-voice-query-evidence.json',
    modelReviews: 'docs/academy/audio/learning-voice-model-reviews.json',
    objectiveQa: 'docs/academy/audio/learning-voice-acceptance.json',
    localExpected: 'docs/academy/audio/learning-voice-local-expected.json',
    productionProof: 'docs/academy/audio/learning-voice-production-proof.json',
    catalog: 'public/academy/audio/learning-voice-playback.json',
    hostedCatalog: 'docs/public/academy/audio/learning-voice-playback.json',
};

run('python3', ['scripts/academy-voice/render-learning-voice.py']);
run('node', ['scripts/academy-voice/reconcile-learning-voice-evidence.mjs']);
run('node', ['scripts/academy-voice/qa-learning-voice.mjs']);
run('node', ['scripts/academy-voice/capture-learning-voice-local-expected.mjs']);
run('node', ['scripts/academy-voice/learning-voice-production-proof.mjs', '--dry-check']);

const loaded = Object.fromEntries(await Promise.all(Object.entries(evidencePaths).map(async ([key, path]) => {
    const source = await readFile(resolve(root, path));
    return [key, { path, source, json: JSON.parse(source) }];
})));
const production = loaded.productionContract.json;
const catalog = loaded.catalog.json;
const acceptance = loaded.objectiveQa.json;
const query = loaded.queryEvidence.json;
if (!loaded.catalog.source.equals(loaded.hostedCatalog.source)) throw new Error('Hosted catalog mirror is stale.');
if (acceptance.complete !== true || acceptance.counts.accepted !== catalog.entries.length) {
    throw new Error('Acceptance evidence is incomplete.');
}

const acceptanceById = new Map(acceptance.entries.map(entry => [entry.lineId, entry]));
const entries = catalog.entries.map(entry => ({
    lineId: entry.lineId,
    bindingIds: entry.bindings.map(binding => binding.lineId),
    sourceRevision: entry.sourceRevision,
    audioQuerySha256: entry.audioQuerySha256,
    cacheKey: entry.cacheKey,
    assetSha256: entry.assetSha256,
    bytes: entry.bytes,
    model: {
        uuid: entry.modelUuid,
        payloadSha256: entry.modelPayloadSha256,
        styleId: entry.styleId,
        styleName: entry.styleName,
        license: entry.modelLicense,
    },
    acceptance: {
        acceptedBy: 'Codex',
        humanReviewed: false,
        objectiveVerdict: acceptanceById.get(entry.lineId)?.verdict,
    },
}));
const rejectedEntries = production.entries
    .filter(entry => entry.disposition.status === 'rejected')
    .map(entry => ({
        lineId: entry.identity.voiceLineId,
        reasonCode: entry.disposition.reasonCode,
        criticalPhraseGates: entry.disposition.criticalPhraseGates,
        rejectedAssetFingerprint: query.entries.find(candidate => (
            candidate.voiceLineId === entry.identity.voiceLineId
        ))?.rejectedAssetFingerprint,
        shipped: false,
    }));
const lock = {
    schema: 'yomu-academy.learning-voice-locks.v5',
    batchId: catalog.batchId,
    acceptedBy: 'Codex',
    humanReviewed: false,
    acceptedEntries: entries.length,
    rejectedEntries: rejectedEntries.length,
    acceptedBindings: entries.flatMap(entry => entry.bindingIds).length,
    toolchain: Object.fromEntries(await Promise.all(toolchainPaths.map(async path => (
        [path, sha256(await readFile(resolve(root, path)))]
    )))),
    evidence: Object.fromEntries(Object.entries(loaded).map(([key, value]) => [key, {
        path: value.path,
        sha256: sha256(value.source),
    }])),
    entries,
    rejected: rejectedEntries,
};
const expectedSource = `${JSON.stringify(lock, null, 2)}\n`;

if (write) {
    await writeFile(outputPath, expectedSource);
    console.log(`Locked ${entries.length} accepted and ${rejectedEntries.length} rejected learning voice candidates.`);
} else {
    const committed = await readFile(outputPath);
    if (!committed.equals(Buffer.from(expectedSource))) {
        throw new Error('Committed learning voice locks are stale; run with --write after intentional evidence refresh.');
    }
    console.log(`Verified ${entries.length} accepted and ${rejectedEntries.length} rejected learning voice candidates.`);
}

function run(command, args) {
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
    return result;
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}
