#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const write = process.argv.includes('--write');
const paths = {
    catalog: 'public/academy/audio/learning-voice-playback.json',
    hostedCatalog: 'docs/public/academy/audio/learning-voice-playback.json',
    model: 'docs/academy/audio/learning-voice-model-evidence.json',
    query: 'docs/academy/audio/learning-voice-query-evidence.json',
    reviews: 'docs/academy/audio/learning-voice-model-reviews.json',
    production: 'docs/academy/audio/learning-voice-production.json',
    output: 'docs/academy/audio/learning-voice-acceptance.json',
};

const loaded = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => {
    const source = await readFile(resolve(root, path));
    return [key, { path, source, json: JSON.parse(source) }];
})));
const { catalog, hostedCatalog, model, query, reviews, production } = Object.fromEntries(
    Object.entries(loaded).map(([key, value]) => [key, value.json]),
);

require(loaded.catalog.source.equals(loaded.hostedCatalog.source), 'Hosted learning voice catalog mirror is stale.');
require(production.schema === 'yomu-academy.learning-voice-production.v2', 'Production contract schema is stale.');
require(model.schema === 'yomu-academy.learning-voice-model-evidence.v3', 'Model evidence schema is stale.');
require(query.schema === 'yomu-academy.learning-voice-query-evidence.v2', 'Query evidence schema is stale.');
require(reviews.schema === 'yomu-academy.learning-voice-model-reviews.v2', 'Model review schema is stale.');
require(model.productionContractSha256 === sha256(loaded.production.source), 'Model evidence is stale.');
require(query.productionContractSha256 === sha256(loaded.production.source), 'Query evidence contract hash is stale.');
require(query.modelEvidenceSha256 === sha256(loaded.model.source), 'Query evidence model hash is stale.');

const contractValidation = JSON.parse(run('python3', ['scripts/academy-voice/render-learning-voice.py']).stdout);
const sourceById = new Map(production.entries.map(entry => [entry.identity.voiceLineId, entry]));
const mappingById = new Map(production.voiceMappings.map(mapping => [mapping.mappingId, mapping]));
const modelByUuid = new Map(model.models.map(entry => [entry.uuid, entry]));
const queryById = new Map(query.entries.map(entry => [entry.voiceLineId, entry]));
const dispositionById = new Map(reviews.lineDispositions.map(entry => [entry.lineId, entry]));
const reviewLinesById = new Map();
for (const review of reviews.reviews) {
    for (const line of review.lines) {
        const lines = reviewLinesById.get(line.lineId) ?? [];
        lines.push({
            reviewer: review.reviewer,
            heardTranscript: line.heardTranscript,
            normalizedTranscript: line.normalizedTranscript,
            characterErrorRate: line.characterErrorRate,
            criticalPhraseGates: line.criticalPhraseGates,
            criticalPhraseGatePassed: line.criticalPhraseGatePassed,
            verdict: line.verdict,
        });
        reviewLinesById.set(line.lineId, lines);
    }
}

const entries = [];
for (const entry of catalog.entries) {
    const source = sourceById.get(entry.lineId);
    const mapping = mappingById.get(source?.mappingId);
    const archivedModel = modelByUuid.get(entry.modelUuid);
    const archivedQuery = queryById.get(entry.lineId);
    const reviewDisposition = dispositionById.get(entry.lineId);
    const independentReviews = reviewLinesById.get(entry.lineId) ?? [];
    const publicPath = resolve(root, 'public', entry.url.replace(/^\//u, ''));
    const hostedPath = resolve(root, 'docs/public', entry.url.replace(/^\//u, ''));
    const asset = await readFile(publicPath);
    const hostedAsset = await readFile(hostedPath);
    const assetStat = await stat(publicPath);
    const probe = probeAudio(publicPath);
    const loudness = measureLoudness(publicPath);
    const silence = measureSilence(publicPath, probe.durationSeconds);
    const checks = {
        acceptedDisposition: source?.disposition?.status === 'accepted'
            && reviewDisposition?.verdict === 'accepted',
        explicitCodexAcceptance: source?.disposition?.acceptedBy === 'Codex'
            && source?.disposition?.humanReviewed === false
            && entry.review?.listening?.codexAccepted === true
            && entry.review?.listening?.humanReviewed === false,
        independentCriticalPhraseReview: independentReviews.length >= 2
            && new Set(independentReviews.map(review => review.reviewer.modelFamily)).size >= 2
            && independentReviews.every(review => review.criticalPhraseGatePassed === true),
        noBlanketCerAcceptance: production.acceptancePolicy?.blanketCharacterErrorRateAllowed === false
            && production.acceptancePolicy?.criticalMorphemeNumeralParticleMismatch === 'hard-fail',
        sourceHash: sha256(entry.japanese) === entry.sourceSha256
            && entry.sourceRevision === entry.sourceSha256,
        queryIdentity: archivedQuery?.disposition === 'accepted'
            && archivedQuery?.audioQuerySha256 === entry.audioQuerySha256
            && archivedQuery?.cacheKey === entry.cacheKey,
        distributionIdentity: mapping?.modelPayloadSha256 === entry.modelPayloadSha256
            && archivedModel?.distribution?.sha256 === entry.modelPayloadSha256
            && archivedModel?.distribution?.bytes === mapping?.modelDistribution?.bytes
            && archivedModel?.licenseSha256 === model.license.sha256,
        assetHash: sha256(asset) === entry.assetSha256,
        bytes: assetStat.size === entry.bytes,
        hostedMirror: asset.equals(hostedAsset),
        codec: probe.codec === 'opus',
        sampleRate: probe.sampleRate === 48_000,
        channels: probe.channels === 1,
        duration: Math.abs(probe.durationSeconds - entry.durationSeconds) <= 0.03,
        loudness: loudness.integratedLufs >= -24 && loudness.integratedLufs <= -15,
        truePeak: loudness.truePeakDbfs <= -1,
        leadingSilence: silence.leadingSeconds <= 0.5,
        trailingSilence: silence.trailingSeconds <= 0.5,
        interiorSilence: silence.longestInteriorSeconds <= 0.65,
    };
    entries.push({
        lineId: entry.lineId,
        bindingIds: entry.bindings.map(binding => binding.lineId),
        intent: entry.intent,
        locale: entry.locale,
        band: entry.band,
        sourceSha256: entry.sourceSha256,
        sourceRevision: entry.sourceRevision,
        audioQuerySha256: entry.audioQuerySha256,
        cacheKey: entry.cacheKey,
        assetSha256: entry.assetSha256,
        modelUuid: entry.modelUuid,
        modelPayloadSha256: entry.modelPayloadSha256,
        measurements: { ...probe, ...loudness, ...silence },
        independentWaveformReviews: independentReviews,
        checks,
        verdict: Object.values(checks).every(Boolean) ? 'pass' : 'fail',
    });
}

const rejectedCandidates = production.entries
    .filter(entry => entry.disposition.status === 'rejected')
    .map(entry => ({
        lineId: entry.identity.voiceLineId,
        reasonCode: entry.disposition.reasonCode,
        criticalPhraseGates: entry.disposition.criticalPhraseGates,
        basis: entry.disposition.basis,
        rejectedAssetFingerprint: queryById.get(entry.identity.voiceLineId)?.rejectedAssetFingerprint,
        shipped: false,
    }));
const report = {
    schema: 'yomu-academy.learning-voice-acceptance.v5',
    generatedOn: '2026-07-21',
    batchId: production.batchId,
    codexAcceptance: {
        acceptedBy: 'Codex',
        humanReviewed: false,
        ownerLineByLineReviewed: false,
        basis: 'Objective audio checks plus independent waveform review with line-specific critical phrase gates.',
    },
    objectiveQa: {
        ffmpeg: commandVersion('ffmpeg'),
        ffprobe: commandVersion('ffprobe'),
    },
    archivedLicenceEvidence: {
        path: paths.model,
        schema: model.schema,
        id: model.license.id,
        sha256: model.license.sha256,
        modelEvidenceSha256: sha256(loaded.model.source),
        engine: model.engine,
        engineStyleSource: model.engineStyleSource,
    },
    archivedQueryEvidence: {
        path: paths.query,
        schema: query.schema,
        sha256: sha256(loaded.query.source),
        candidates: query.entries.length,
        styleMappings: query.styleMappings.length,
    },
    productionContract: {
        path: paths.production,
        sha256: sha256(loaded.production.source),
        validation: contractValidation,
    },
    historicalModelReviewEvidence: {
        path: paths.reviews,
        schema: reviews.schema,
        sha256: sha256(loaded.reviews.source),
        audioModelReviewed: true,
        humanReviewed: false,
        independentReviewerFamilies: new Set(reviews.reviews.map(review => review.reviewer.modelFamily)).size,
        blanketCharacterErrorRateAllowed: false,
    },
    catalogSha256: sha256(loaded.catalog.source),
    entries,
    rejectedCandidates,
    counts: {
        reviewedCandidates: production.entries.length,
        accepted: entries.length,
        rejected: rejectedCandidates.length,
        objectivePassed: entries.filter(entry => entry.verdict === 'pass').length,
        nativeBand: entries.filter(entry => entry.band === 'native').length,
        bindings: entries.flatMap(entry => entry.bindingIds).length,
    },
    complete: entries.length === production.triage.acceptedVoiceLineIds.length
        && rejectedCandidates.length === production.triage.rejectedVoiceLineIds.length
        && entries.every(entry => entry.verdict === 'pass'),
};
const expectedSource = `${JSON.stringify(report, null, 2)}\n`;

if (write) {
    await writeFile(resolve(root, paths.output), expectedSource);
    console.log(`Learning voice QA refreshed: ${report.counts.accepted} accepted, ${report.counts.rejected} rejected.`);
} else {
    require(loaded.output.source.equals(Buffer.from(expectedSource)),
        'Committed acceptance evidence is stale; run with --write only after intentional source changes.');
    console.log(`Learning voice QA verified read-only: ${report.counts.accepted} accepted, ${report.counts.rejected} rejected.`);
}
if (!report.complete) process.exitCode = 1;

function probeAudio(file) {
    const parsed = JSON.parse(run('ffprobe', [
        '-v', 'error',
        '-show_entries', 'stream=codec_name,sample_rate,channels',
        '-show_entries', 'format=duration',
        '-of', 'json',
        file,
    ]).stdout);
    const stream = parsed.streams?.[0];
    return {
        codec: stream?.codec_name,
        sampleRate: Number(stream?.sample_rate),
        channels: Number(stream?.channels),
        durationSeconds: Number(parsed.format?.duration),
    };
}

function measureLoudness(file) {
    const stderr = run('ffmpeg', [
        '-hide_banner', '-nostats', '-i', file,
        '-af', 'ebur128=peak=true', '-f', 'null', '-',
    ]).stderr;
    const integrated = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/gu.exec(stderr);
    const peak = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+) dBFS/gu.exec(stderr);
    require(integrated && peak, `Could not parse EBU measurements for ${file}.`);
    return { integratedLufs: Number(integrated[1]), truePeakDbfs: Number(peak[1]) };
}

function measureSilence(file, durationSeconds) {
    const stderr = run('ffmpeg', [
        '-hide_banner', '-nostats', '-i', file,
        '-af', 'silencedetect=noise=-45dB:d=0.05', '-f', 'null', '-',
    ]).stderr;
    const spans = [];
    let start = null;
    for (const line of stderr.split('\n')) {
        const started = /silence_start: ([\d.]+)/u.exec(line);
        if (started) start = Number(started[1]);
        const ended = /silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/u.exec(line);
        if (ended && start !== null) {
            spans.push({ start, end: Number(ended[1]), duration: Number(ended[2]) });
            start = null;
        }
    }
    const leading = spans.find(span => span.start <= 0.001)?.duration ?? 0;
    const trailing = spans.findLast(span => durationSeconds - span.end <= 0.03)?.duration ?? 0;
    const interior = spans.filter(span => span.start > 0.001 && durationSeconds - span.end > 0.03);
    return {
        leadingSeconds: round(leading),
        trailingSeconds: round(trailing),
        longestInteriorSeconds: round(Math.max(0, ...interior.map(span => span.duration))),
    };
}

function run(command, args) {
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
    return result;
}

function commandVersion(command) {
    return run(command, ['-version']).stdout.split('\n')[0];
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function round(value, places = 3) {
    return Number(value.toFixed(places));
}

function require(condition, message) {
    if (!condition) throw new Error(message);
}
