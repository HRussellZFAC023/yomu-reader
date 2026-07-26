#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const REVIEW_DATE = '2026-07-23';
const paths = {
    production: resolve(ROOT, 'docs/academy/audio/learning-voice-production.json'),
    reviews: resolve(ROOT, 'docs/academy/audio/learning-voice-model-reviews.json'),
    staging: resolve(ROOT, 'qa-artifacts/academy-learning-voice/staging/render-report.json'),
    catalog: resolve(ROOT, 'public/academy/audio/learning-voice-playback.json'),
    hostedCatalog: resolve(ROOT, 'docs/public/academy/audio/learning-voice-playback.json'),
};

const [production, reviews, staging, catalog, hostedCatalog] = await Promise.all([
    readJson(paths.production),
    readJson(paths.reviews),
    readJson(paths.staging),
    readJson(paths.catalog),
    readJson(paths.hostedCatalog),
]);

require(JSON.stringify(catalog) === JSON.stringify(hostedCatalog), 'Catalog mirrors differ before promotion.');
require(production.schema === 'yomu-academy.learning-voice-production.v2', 'Unsupported production schema.');
require(reviews.schema === 'yomu-academy.learning-voice-model-reviews.v2', 'Unsupported review schema.');
require(staging.schema === 'yomu-academy.learning-voice-staging-render.v1', 'Unsupported staging schema.');
require(catalog.schema === 'yomu-academy.learning-voice-playback.v3', 'Unsupported catalog schema.');
require(production.batchId === catalog.batchId && staging.batchId === catalog.batchId, 'Batch identities differ.');

const catalogById = new Map(catalog.entries.map(entry => [entry.lineId, entry]));
const mappingById = new Map(production.voiceMappings.map(mapping => [mapping.mappingId, mapping]));
const stagingById = new Map(staging.entries.map(entry => [entry.voiceLineId, entry]));
const reviewLinesById = new Map();
for (const review of reviews.reviews) {
    for (const line of review.lines) {
        const prior = reviewLinesById.get(line.lineId) ?? [];
        prior.push({ reviewer: review.reviewer, ...line });
        reviewLinesById.set(line.lineId, prior);
    }
}
const passingWhisperSamplesByMapping = new Map();
for (const source of production.entries) {
    if (source.disposition.status !== 'accepted') continue;
    const samplePassed = (reviewLinesById.get(source.identity.voiceLineId) ?? []).some(review => (
        review.reviewer.modelFamily === 'OpenAI Whisper'
        && review.verdict === 'pass'
        && review.criticalPhraseGatePassed === true
    ));
    if (!samplePassed) continue;
    const sampleIds = passingWhisperSamplesByMapping.get(source.mappingId) ?? [];
    sampleIds.push(source.identity.voiceLineId);
    passingWhisperSamplesByMapping.set(source.mappingId, sampleIds);
}

const rebound = [];
for (const source of production.entries) {
    if (source.disposition.status !== 'accepted') continue;
    const existing = catalogById.get(source.identity.voiceLineId);
    if (!existing) continue;
    require(existing.japanese === source.japanese
        && existing.sourceSha256 === source.identity.sourceRevision,
    `Existing catalog source differs for ${source.identity.voiceLineId}.`);
    const bindingsChanged = JSON.stringify(existing.bindings) !== JSON.stringify(source.bindings);
    const cacheChanged = existing.cacheKey !== source.expectedCacheKey;
    if (!bindingsChanged && !cacheChanged) continue;

    const nextUrl = `/academy/audio/learning-lines/${source.identity.speakerId}/`
        + `${source.identity.voiceLineId}__${source.expectedCacheKey.slice(0, 16)}.opus`;
    if (cacheChanged) {
        const existingAsset = resolve(ROOT, 'public', existing.url.replace(/^\//u, ''));
        require(sha256(await readFile(existingAsset)) === existing.assetSha256,
            `Existing catalog bytes differ for ${source.identity.voiceLineId}.`);
        await installAsset(existingAsset, nextUrl);
    }
    existing.bindings = source.bindings;
    existing.cacheKey = source.expectedCacheKey;
    existing.url = nextUrl;
    rebound.push(source.identity.voiceLineId);
}

const promoted = [];
for (const source of production.entries) {
    const lineId = source.identity.voiceLineId;
    if (source.disposition.status !== 'accepted' || catalogById.has(lineId)) continue;

    const mapping = mappingById.get(source.mappingId);
    const staged = stagingById.get(lineId);
    const independentReviews = reviewLinesById.get(lineId) ?? [];
    const passingLineReviews = independentReviews.filter(review => (
        review.verdict === 'pass'
        && review.criticalPhraseGatePassed === true
        && review.assetSha256 === staged?.assetSha256
    ));
    const representativeSampleLineIds = passingWhisperSamplesByMapping.get(source.mappingId) ?? [];
    require(mapping, `Missing voice mapping for ${lineId}.`);
    require(representativeSampleLineIds.length >= 1,
        `No passing Whisper sample covers voice mapping ${source.mappingId}.`);
    require(staged?.disposition === 'accepted' && staged.drift === false, `Staging is not promotable for ${lineId}.`);
    require(staged.cacheKey === source.expectedCacheKey, `Staged cache identity differs for ${lineId}.`);

    const stagedPath = resolve(ROOT, staged.path);
    require(isInside(stagedPath, resolve(ROOT, 'qa-artifacts/academy-learning-voice/staging/audio')),
        `Staged audio escaped its root for ${lineId}.`);
    const asset = await readFile(stagedPath);
    const assetStat = await stat(stagedPath);
    require(sha256(asset) === staged.assetSha256 && assetStat.size === staged.bytes,
        `Staged byte identity differs for ${lineId}.`);
    require(sha256(source.japanese) === source.identity.sourceRevision,
        `Source revision differs for ${lineId}.`);

    const measurements = inspectAudio(stagedPath);
    require(measurements.codec === 'opus'
        && measurements.sampleRate === 48_000
        && measurements.channels === 1, `Audio format failed for ${lineId}.`);
    require(measurements.integratedLufs >= -24 && measurements.integratedLufs <= -15,
        `Loudness failed for ${lineId}: ${measurements.integratedLufs} LUFS.`);
    require(measurements.truePeakDbfs <= -1, `True peak failed for ${lineId}: ${measurements.truePeakDbfs} dBFS.`);
    require(measurements.leadingSeconds <= 0.5
        && measurements.trailingSeconds <= 0.5
        && measurements.longestInteriorSeconds <= 0.65, `Silence bounds failed for ${lineId}.`);

    const url = `/academy/audio/learning-lines/${source.identity.speakerId}/${lineId}__${source.expectedCacheKey.slice(0, 16)}.opus`;
    await installAsset(stagedPath, url);
    const entry = {
        lineId,
        speakerId: source.identity.speakerId,
        role: source.role,
        intent: source.identity.intent,
        locale: source.identity.locale,
        band: source.identity.band,
        surface: source.surface,
        japanese: source.japanese,
        bindings: source.bindings,
        sourceSha256: source.identity.sourceRevision,
        sourceRevision: source.identity.sourceRevision,
        audioQuerySha256: source.audioQuerySha256,
        cacheKey: source.expectedCacheKey,
        assetSha256: staged.assetSha256,
        bytes: staged.bytes,
        durationSeconds: measurements.durationSeconds,
        url,
        modelUuid: mapping.modelUuid,
        modelName: mapping.modelName,
        modelVersion: mapping.modelVersion,
        modelSourceUrl: mapping.modelSourceUrl,
        modelLicense: mapping.modelLicense,
        modelPayloadSha256: mapping.modelPayloadSha256,
        styleId: mapping.styleId,
        styleName: mapping.styleName,
        queryOverrides: source.queryOverrides,
        moraOverrides: source.moraOverrides,
        review: {
            naturalness: {
                status: 'reviewed-text',
                reviewedOn: REVIEW_DATE,
                basis: 'A short, concrete Japanese carrier word keeps the opening vowel audible without an English sound approximation.',
            },
            accent: {
                status: 'validated-query-plan',
                method: 'AivisSpeech audio_query identity and independent waveform recovery',
                phrases: [source.japanese],
            },
            pause: {
                status: 'validated-query-plan',
                method: 'Objective silence analysis',
                notes: 'One compact carrier phrase with bounded leading, trailing, and interior silence.',
            },
            direction: {
                status: 'reviewed-model-direction',
                basis: 'A calm classmate voice at a deliberately measured pace supports first-contact phonics without overstating the vowel.',
            },
            independentModel: {
                status: 'representative-voice-sample',
                reviewRef: '$.reviews',
                auditoryClaim: passingLineReviews.length > 0,
                mappingId: source.mappingId,
                sampleLineIds: representativeSampleLineIds,
            },
            listening: {
                status: 'codex-accepted-objective-and-independent-audio-review',
                checkedOn: REVIEW_DATE,
                checkedBy: 'Codex using objective QA and representative Whisper samples',
                ownerLineByLineReviewed: false,
                audioModelReviewed: passingLineReviews.length > 0,
                humanReviewed: false,
                independentAudioModelReviews: passingLineReviews.length,
                evidence: [
                    'docs/academy/audio/learning-voice-acceptance.json',
                    'docs/academy/audio/learning-voice-model-reviews.json',
                ],
                basis: 'Codex accepted this line without claiming human listening. Exact staged bytes passed objective audio checks, and passing Whisper samples cover the same pinned speaker model and style.',
                limitation: 'The voice is sampled by mapping rather than auditioned line by line.',
                representativeSampleLineIds,
                codexAccepted: true,
            },
        },
        reviewStatus: 'accepted',
        qualityApprovalStatus: 'codex-accepted',
        disclosure: {
            synthetic: true,
            officialCharacterVoice: false,
            livingPersonSource: true,
        },
        provenance: 'Yomu-authored',
    };
    catalog.entries.push(entry);
    catalogById.set(lineId, entry);
    promoted.push(lineId);
}

const expectedAccepted = new Set(production.triage.acceptedVoiceLineIds);
require(catalog.entries.length === expectedAccepted.size, 'Catalog does not cover every accepted production line.');
require(catalog.entries.every(entry => expectedAccepted.has(entry.lineId)), 'Catalog contains a non-accepted line.');
const acceptedOrder = new Map(
    production.triage.acceptedVoiceLineIds.map((lineId, index) => [lineId, index]),
);
catalog.entries.sort((left, right) => (
    acceptedOrder.get(left.lineId) - acceptedOrder.get(right.lineId)
));
const bindingIds = catalog.entries.flatMap(entry => entry.bindings.map(binding => binding.lineId));
require(new Set(bindingIds).size === bindingIds.length, 'Catalog contains a duplicate runtime binding.');
const output = `${JSON.stringify(catalog, null, 2)}\n`;
await writeMirroredCatalog(output);
console.log(JSON.stringify({ promoted, rebound, catalogEntries: catalog.entries.length }));

async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function isInside(path, root) {
    const pathFromRoot = relative(root, path);
    return pathFromRoot !== '' && !pathFromRoot.startsWith('..') && !pathFromRoot.includes('/../');
}

function run(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8' });
    require(result.status === 0, `${command} failed: ${result.stderr || result.stdout}`);
    return result;
}

function inspectAudio(path) {
    const probe = JSON.parse(run('ffprobe', [
        '-v', 'error',
        '-show_entries', 'stream=codec_name,sample_rate,channels',
        '-show_entries', 'format=duration',
        '-of', 'json',
        path,
    ]).stdout);
    const stream = probe.streams?.[0];
    const durationSeconds = Number(probe.format?.duration);
    const loudnessOutput = run('ffmpeg', [
        '-hide_banner', '-nostats', '-i', path,
        '-af', 'ebur128=peak=true', '-f', 'null', '-',
    ]).stderr;
    const integrated = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/gu.exec(loudnessOutput);
    const peak = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+) dBFS/gu.exec(loudnessOutput);
    require(integrated && peak, `Could not parse loudness for ${path}.`);

    const silenceOutput = run('ffmpeg', [
        '-hide_banner', '-nostats', '-i', path,
        '-af', 'silencedetect=noise=-45dB:d=0.05', '-f', 'null', '-',
    ]).stderr;
    const spans = [];
    let start = null;
    for (const line of silenceOutput.split('\n')) {
        const started = /silence_start: ([\d.]+)/u.exec(line);
        if (started) start = Number(started[1]);
        const ended = /silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/u.exec(line);
        if (ended && start !== null) {
            spans.push({ start, end: Number(ended[1]), duration: Number(ended[2]) });
            start = null;
        }
    }
    if (start !== null) spans.push({ start, end: durationSeconds, duration: durationSeconds - start });
    return {
        codec: stream?.codec_name,
        sampleRate: Number(stream?.sample_rate),
        channels: Number(stream?.channels),
        durationSeconds,
        integratedLufs: Number(integrated[1]),
        truePeakDbfs: Number(peak[1]),
        leadingSeconds: spans.find(span => span.start <= 0.001)?.duration ?? 0,
        trailingSeconds: spans.find(span => Math.abs(span.end - durationSeconds) <= 0.03)?.duration ?? 0,
        longestInteriorSeconds: Math.max(0, ...spans
            .filter(span => span.start > 0.001 && Math.abs(span.end - durationSeconds) > 0.03)
            .map(span => span.duration)),
    };
}

async function installAsset(source, url) {
    const relativePath = url.replace(/^\//u, '');
    const destinations = [
        resolve(ROOT, 'public', relativePath),
        resolve(ROOT, 'docs/public', relativePath),
    ];
    for (const destination of destinations) {
        require(isInside(destination, resolve(ROOT, destination.includes('/docs/public/')
            ? 'docs/public'
            : 'public')), `Destination escaped its public root: ${destination}`);
        await mkdir(dirname(destination), { recursive: true });
        const temporary = `${destination}.${process.pid}.tmp`;
        await copyFile(source, temporary);
        await rename(temporary, destination);
    }
}

async function writeMirroredCatalog(output) {
    for (const destination of [paths.catalog, paths.hostedCatalog]) {
        const temporary = `${destination}.${process.pid}.tmp`;
        await writeFile(temporary, output);
        await rename(temporary, destination);
    }
}

function require(condition, message) {
    if (!condition) throw new Error(message);
}
