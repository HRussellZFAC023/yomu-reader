#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const storyRoot = join(root, 'src/academy/content/story-sources');
const audioRoot = join(root, 'public/academy/audio');
const docsRoot = join(root, 'docs/academy/audio');
const cast = readJson(join(docsRoot, 'aivis-cast-models.json'));
const locks = readJson(join(docsRoot, 'voice-line-locks.json'));
const uiLines = readJson(join(audioRoot, 'voice-lines.json'));
const learningCatalogPath = join(audioRoot, 'learning-voice-playback.json');
const learningLocksPath = join(docsRoot, 'learning-voice-locks.json');
const learningAcceptancePath = join(docsRoot, 'learning-voice-acceptance.json');
const learningCatalog = readJson(learningCatalogPath);
const learningLocks = readJson(learningLocksPath);
const learningAcceptance = readJson(learningAcceptancePath);
const learningToolchainCurrent = Object.entries(learningLocks.toolchain ?? {}).length > 0
    && Object.entries(learningLocks.toolchain).every(([sourcePath, sourceHash]) => (
        existsSync(join(root, sourcePath)) && fileDigest(join(root, sourcePath)) === sourceHash
    ));
const learningEvidenceCurrent = learningLocks.schema === 'yomu-academy.learning-voice-locks.v5'
    && learningLocks.batchId === learningCatalog.batchId
    && learningLocks.evidence?.catalog?.sha256 === fileDigest(learningCatalogPath)
    && learningLocks.evidence?.objectiveQa?.sha256 === fileDigest(learningAcceptancePath)
    && learningAcceptance.schema === 'yomu-academy.learning-voice-acceptance.v5'
    && learningAcceptance.batchId === learningCatalog.batchId
    && learningAcceptance.catalogSha256 === fileDigest(learningCatalogPath)
    && learningAcceptance.complete === true
    && learningToolchainCurrent;
const modelBySpeaker = new Map(cast.map(entry => [entry.speaker, entry]));

const story = readdirSync(storyRoot)
    .filter(file => file.endsWith('.v2.json'))
    .sort()
    .flatMap(file => storyEntries(file, readJson(join(storyRoot, file))));
const ui = Object.entries(uiLines)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, line]) => ({
        key: `ui:${id}`,
        surface: 'ui',
        sourceId: id,
        speakerId: line.speaker,
        japanese: line.text,
        sourceSha256: digest([line.speaker, line.text]),
        status: 'remote-ready',
        output: line.url,
    }));
const learning = learningEntries(
    learningCatalog,
    learningLocks,
    learningAcceptance,
    learningEvidenceCurrent,
);

const entries = [...story, ...ui, ...learning];
const manifest = {
    schema: 'yomu-academy.voice-production.v2',
    learningVoiceEvidence: {
        catalog: {
            path: 'public/academy/audio/learning-voice-playback.json',
            sha256: fileDigest(learningCatalogPath),
        },
        locks: {
            path: 'docs/academy/audio/learning-voice-locks.json',
            sha256: fileDigest(learningLocksPath),
        },
        acceptance: {
            path: 'docs/academy/audio/learning-voice-acceptance.json',
            sha256: fileDigest(learningAcceptancePath),
        },
    },
    counts: {
        entries: entries.length,
        storyVariants: story.length,
        uiLines: ui.length,
        learningVoiceLines: learning.length,
        learningBindings: learning.reduce((count, entry) => count + entry.bindingIds.length, 0),
        nativeBandLearningLines: learning.filter(entry => entry.band === 'native').length,
        acceptedLearningLines: learning.filter(entry => entry.status === 'accepted').length,
        codexAcceptedLearningLines: learning.filter(entry => entry.codexAccepted).length,
        humanReviewedLearningLines: learning.filter(entry => entry.humanReviewed).length,
        locked: entries.filter(entry => entry.status === 'locked').length,
        productionReady: entries.filter(entry => entry.status === 'locked' || entry.status === 'accepted').length,
        pilotRendered: entries.filter(entry => entry.pilotOutput).length,
        staleLocks: entries.filter(entry => entry.status === 'stale').length,
        missingModels: entries.filter(entry => entry.surface === 'story' && !entry.voiceModel?.uuid).length,
    },
    entries,
};

writeFileSync(join(docsRoot, 'voice-production-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const playbackCatalog = {
    schema: 'yomu-academy.story-voice-playback.v1',
    entries: story
        .filter(entry => (
            entry.status === 'locked'
            && entry.pitch?.status === 'pilot-rendered'
            && entry.pilotOutput
            && entry.speakerId !== 'learner'
            && entry.speakerId !== 'narrator'
        ))
        .map(entry => playbackEntry(entry)),
};
writeFileSync(join(audioRoot, 'story-voice-playback.json'), `${JSON.stringify(playbackCatalog, null, 2)}\n`);
console.log(JSON.stringify({ ...manifest.counts, playablePilots: playbackCatalog.entries.length }));

function learningEntries(catalog, lockArchive, acceptance, evidenceCurrent) {
    const lockByLine = new Map(lockArchive.entries.map(entry => [entry.lineId, entry]));
    const acceptanceByLine = new Map(acceptance.entries.map(entry => [entry.lineId, entry]));
    return catalog.entries.map(entry => {
        const lock = lockByLine.get(entry.lineId);
        const accepted = acceptanceByLine.get(entry.lineId);
        const current = evidenceCurrent
            && lock
            && lock.sourceRevision === entry.sourceRevision
            && lock.audioQuerySha256 === entry.audioQuerySha256
            && lock.cacheKey === entry.cacheKey
            && lock.assetSha256 === entry.assetSha256
            && lock.model?.payloadSha256 === entry.modelPayloadSha256
            && lock.acceptance?.acceptedBy === 'Codex'
            && lock.acceptance?.humanReviewed === false
            && accepted?.verdict === 'pass';
        return {
            key: `learning:${entry.lineId}`,
            surface: 'learning',
            sourceId: entry.lineId,
            lineId: entry.lineId,
            bindingIds: entry.bindings.map(binding => binding.lineId),
            speakerId: entry.speakerId,
            role: entry.role,
            intent: entry.intent,
            locale: entry.locale,
            band: entry.band,
            japanese: entry.japanese,
            sourceSha256: entry.sourceSha256,
            sourceRevision: entry.sourceRevision,
            audioQuerySha256: entry.audioQuerySha256,
            cacheKey: entry.cacheKey,
            assetSha256: entry.assetSha256,
            output: entry.url,
            status: current ? 'accepted' : 'stale',
            codexAccepted: entry.review?.listening?.codexAccepted === true,
            ownerLineByLineReviewed: entry.review?.listening?.ownerLineByLineReviewed === true,
            audioModelReviewed: entry.review?.listening?.audioModelReviewed === true,
            humanReviewed: entry.review?.listening?.humanReviewed === true,
            voiceModel: {
                uuid: entry.modelUuid,
                name: entry.modelName,
                version: entry.modelVersion,
                payloadSha256: entry.modelPayloadSha256,
                sourceUrl: entry.modelSourceUrl,
                license: entry.modelLicense,
                styleId: entry.styleId,
                styleName: entry.styleName,
            },
            queryOverrides: entry.queryOverrides,
            moraOverrides: entry.moraOverrides,
        };
    });
}

function storyEntries(file, source) {
    return source.scenes.flatMap(scene => scene.nodes.flatMap(node => {
        if (node.kind !== 'line') return [];
        return Object.entries(node.variants ?? {}).map(([band, variant]) => {
            const key = `${node.id}::${band}`;
            const sourceSha256 = digest([
                source.id,
                scene.id,
                node.speakerId ?? '',
                band,
                variant.japanese,
                variant.reading,
                variant.english,
            ]);
            const lock = locks[key];
            const status = !lock ? 'draft' : lock.sourceSha256 === sourceSha256 ? lock.status : 'stale';
            const pilotOutput = band === pilotBand(source, node)
                ? pilotPath(source.id, node.id, node.speakerId)
                : undefined;
            return {
                key,
                surface: 'story',
                sourceFile: file,
                chapterId: source.id,
                chapter: source.chapter ?? null,
                season: source.season,
                sceneId: scene.id,
                lineId: node.id,
                speakerId: node.speakerId ?? 'narrator',
                intent: node.intent ?? null,
                band,
                japanese: variant.japanese,
                reading: variant.reading,
                english: variant.english,
                sourceSha256,
                status,
                voiceModel: modelBySpeaker.get(node.speakerId ?? 'narrator') ?? null,
                pitch: lock?.pitch ?? { status: 'unreviewed' },
                ...(pilotOutput ? { pilotOutput } : {}),
            };
        });
    }));
}

function pilotBand(source, node) {
    if (source.id === 's1e01-the-blank-atlas' && node.id === 'line:blank-atlas:rie-konbanwa') {
        return 'foundation';
    }
    if (source.season === 1) return 'n5';
    if (source.season === 2) return 'n4';
    if (source.season === 3) return 'n3';
    return 'n2';
}

function pilotPath(chapterId, lineId, speakerId) {
    const stem = `${chapterId}__${lineId.split(':').at(-1)}__${speakerId ?? 'narrator'}.opus`;
    const relative = `story-pilot/${stem}`;
    return existsSync(join(audioRoot, relative)) ? `/academy/audio/${relative}` : undefined;
}

function playbackEntry(entry) {
    const publicRelative = entry.pilotOutput.replace(/^\//, '');
    const assetPath = join(root, 'public', publicRelative);
    const asset = readFileSync(assetPath);
    return {
        lineId: entry.lineId,
        speakerId: entry.speakerId,
        japanese: entry.japanese,
        band: entry.band,
        sourceSha256: entry.sourceSha256,
        assetSha256: createHash('sha256').update(asset).digest('hex'),
        bytes: statSync(assetPath).size,
        url: entry.pilotOutput,
        reviewStatus: 'locked',
    };
}

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function fileDigest(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function digest(parts) {
    return createHash('sha256').update(parts.join('\n')).digest('hex');
}
