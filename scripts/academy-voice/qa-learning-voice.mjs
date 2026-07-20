import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const catalogPath = resolve(root, 'public/academy/audio/learning-voice-playback.json');
const mirrorCatalogPath = resolve(root, 'docs/public/academy/audio/learning-voice-playback.json');
const evidencePath = resolve(root, 'docs/academy/audio/learning-voice-model-evidence.json');
const queryEvidencePath = resolve(root, 'docs/academy/audio/learning-voice-query-evidence.json');
const reviewsPath = resolve(root, 'docs/academy/audio/learning-voice-model-reviews.json');
const productionPath = resolve(root, 'docs/academy/audio/learning-voice-production.json');
const outputPath = resolve(root, 'docs/academy/audio/learning-voice-acceptance.json');
const whisperModel = process.env.WHISPER_MODEL ? resolve(process.env.WHISPER_MODEL) : null;

const catalogSource = await readFile(catalogPath);
const mirrorCatalogSource = await readFile(mirrorCatalogPath);
if (!catalogSource.equals(mirrorCatalogSource)) throw new Error('Hosted learning voice catalog mirror is stale.');
const catalog = JSON.parse(catalogSource);
const evidenceSource = await readFile(evidencePath);
const evidence = JSON.parse(evidenceSource);
const queryEvidenceSource = await readFile(queryEvidencePath);
const queryEvidence = JSON.parse(queryEvidenceSource);
const productionSource = await readFile(productionPath);
const production = JSON.parse(productionSource);
if (evidence.schema !== 'yomu-academy.learning-voice-model-evidence.v2'
    || evidence.batchId !== production.batchId
    || evidence.productionContractSha256 !== sha256(productionSource)) {
    throw new Error('Archived learning voice model evidence is stale for this production contract.');
}
if (queryEvidence.schema !== 'yomu-academy.learning-voice-query-evidence.v1'
    || queryEvidence.batchId !== production.batchId
    || queryEvidence.productionContractSha256 !== sha256(productionSource)
    || queryEvidence.modelEvidenceSha256 !== sha256(evidenceSource)) {
    throw new Error('Archived canonical query evidence is stale for this production contract.');
}
const reviews = await optionalJson(reviewsPath);
const evidenceByUuid = new Map(evidence.models.map(model => [model.uuid, model]));
const styleEvidenceByMappingId = new Map(
    evidence.engineStyleMappings.map(mapping => [mapping.mappingId, mapping]),
);
const productionEntryById = new Map(
    production.entries.map(entry => [entry.identity.voiceLineId, entry]),
);
const productionMappingById = new Map(
    production.voiceMappings.map(mapping => [mapping.mappingId, mapping]),
);
const reviewSet = validateReviews(reviews, catalog.entries);
const contractValidation = JSON.parse(run('python3', [
    'scripts/academy-voice/render-learning-voice.py',
]).stdout);
const temporary = whisperModel ? await mkdtemp(resolve(tmpdir(), 'yomu-learning-voice-qa-')) : null;

const entries = [];
try {
    for (const entry of catalog.entries) {
        const publicPath = resolve(root, 'public', entry.url.replace(/^\//u, ''));
        const mirrorPath = resolve(root, 'docs/public', entry.url.replace(/^\//u, ''));
        const asset = await readFile(publicPath);
        const mirror = await readFile(mirrorPath);
        const assetStat = await stat(publicPath);
        const probe = probeAudio(publicPath);
        const loudness = measureLoudness(publicPath);
        const silence = measureSilence(publicPath, probe.durationSeconds);
        const provenance = evidenceByUuid.get(entry.modelUuid);
        const source = productionEntryById.get(entry.lineId);
        const mapping = productionMappingById.get(source?.mappingId);
        const styleEvidence = styleEvidenceByMappingId.get(source?.mappingId);
        const asr = whisperModel
            ? await transcribe(publicPath, entry.japanese, resolve(temporary, basename(publicPath)))
            : { status: 'not-run', reason: 'Set WHISPER_MODEL to run acoustic transcription.' };
        const checks = {
            sourceHash: sha256(entry.japanese) === entry.sourceSha256,
            sourceRevision: entry.sourceRevision === entry.sourceSha256,
            nativeBand: entry.band === 'native' && entry.locale === 'ja-JP',
            assetHash: sha256(asset) === entry.assetSha256,
            bytes: assetStat.size === entry.bytes,
            hostedMirror: asset.equals(mirror),
            codec: probe.codec === 'opus',
            sampleRate: probe.sampleRate === 48_000,
            channels: probe.channels === 1,
            duration: Math.abs(probe.durationSeconds - entry.durationSeconds) <= 0.03,
            loudness: loudness.integratedLufs >= -24 && loudness.integratedLufs <= -15,
            truePeak: loudness.truePeakDbfs <= -1,
            leadingSilence: silence.leadingSeconds <= 0.5,
            trailingSilence: silence.trailingSeconds <= 0.5,
            interiorSilence: silence.longestInteriorSeconds <= 0.65,
            provenance: Boolean(source && mapping && provenance && styleEvidence
                && mapping.modelUuid === entry.modelUuid
                && mapping.modelName === entry.modelName
                && mapping.modelVersion === entry.modelVersion
                && mapping.modelPayloadSha256 === entry.modelPayloadSha256
                && mapping.modelSourceUrl === entry.modelSourceUrl
                && mapping.modelLicense === entry.modelLicense
                && mapping.styleId === entry.styleId
                && mapping.styleName === entry.styleName
                && provenance.name === entry.modelName
                && provenance.version === entry.modelVersion
                && provenance.payloadSha256 === entry.modelPayloadSha256
                && provenance.licenseSha256 === evidence.license.sha256
                && entry.modelLicense === evidence.license.id
                && provenance.primarySourceUrl === entry.modelSourceUrl
                && styleEvidence.speakerId === mapping.speakerId
                && styleEvidence.modelUuid === entry.modelUuid
                && styleEvidence.modelName === entry.modelName
                && styleEvidence.modelVersion === entry.modelVersion
                && styleEvidence.modelPayloadSha256 === entry.modelPayloadSha256
                && styleEvidence.styleId === entry.styleId
                && styleEvidence.styleName === entry.styleName),
            acousticTranscription: asr.status === 'passed',
            ownerQualityApproval: production.qualityApproval?.ownerQualityApproved === true
                && entry.review?.listening?.ownerQualityApproved === true,
            honestReviewFields: entry.review?.listening?.ownerLineByLineReviewed === false
                && entry.review?.listening?.humanReviewed === false
                && (!entry.review?.listening?.audioModelReviewed || reviewSet.passed),
            acceptedState: entry.reviewStatus === 'accepted'
                && entry.qualityApprovalStatus === 'owner-approved',
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
            acousticTranscription: asr,
            checks,
            verdict: Object.values(checks).every(Boolean) ? 'pass' : 'fail',
        });
    }
} finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
}

const report = {
    schema: 'yomu-academy.learning-voice-acceptance.v4',
    generatedOn: '2026-07-20',
    batchId: production.batchId,
    ownerQualityApproved: production.qualityApproval.ownerQualityApproved,
    ownerQualityApprovalScope: production.qualityApproval.scope,
    ownerLineByLineReviewed: production.qualityApproval.ownerLineByLineReviewed,
    humanReviewed: false,
    audioModelReviewed: reviewSet.passed,
    independentAudioModelReviews: reviewSet.count,
    objectiveQa: {
        ffmpeg: commandVersion('ffmpeg'),
        ffprobe: commandVersion('ffprobe'),
        whisper: whisperModel ? { modelFile: basename(whisperModel), modelSha256: sha256(await readFile(whisperModel)) } : null,
    },
    archivedLicenceEvidence: {
        path: 'docs/academy/audio/learning-voice-model-evidence.json',
        schema: evidence.schema,
        id: evidence.license.id,
        sha256: evidence.license.sha256,
        modelEvidenceSha256: sha256(evidenceSource),
        engineStyleSource: evidence.engineStyleSource,
    },
    archivedQueryEvidence: {
        path: 'docs/academy/audio/learning-voice-query-evidence.json',
        schema: queryEvidence.schema,
        sha256: sha256(queryEvidenceSource),
        entries: queryEvidence.entries.length,
        styleMappings: queryEvidence.styleMappings.length,
    },
    productionContract: {
        path: 'docs/academy/audio/learning-voice-production.json',
        sha256: sha256(productionSource),
        validation: contractValidation,
    },
    historicalModelReviewEvidence: {
        ...reviewSet,
        requiredForFutureAcceptance: false,
    },
    catalogSha256: sha256(catalogSource),
    entries,
    counts: {
        entries: entries.length,
        objectivePassed: entries.filter(entry => entry.verdict === 'pass').length,
        accepted: catalog.entries.filter(entry => (
            entry.reviewStatus === 'accepted' && entry.qualityApprovalStatus === 'owner-approved'
        )).length,
        nativeBand: catalog.entries.filter(entry => entry.band === 'native').length,
        bindings: catalog.entries.flatMap(entry => entry.bindings).length,
    },
    complete: entries.length === production.triage.reviewedRequiredVoiceLineIds.length
        && entries.every(entry => entry.verdict === 'pass'),
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Learning voice QA: ${report.counts.objectivePassed}/${report.counts.entries} passed; complete=${report.complete}.`);
if (!report.complete) process.exitCode = 1;

function probeAudio(file) {
    const result = run('ffprobe', [
        '-v', 'error',
        '-show_entries', 'stream=codec_name,sample_rate,channels',
        '-show_entries', 'format=duration',
        '-of', 'json',
        file,
    ]);
    const parsed = JSON.parse(result.stdout);
    const stream = parsed.streams?.[0];
    return {
        codec: stream?.codec_name,
        sampleRate: Number(stream?.sample_rate),
        channels: Number(stream?.channels),
        durationSeconds: Number(parsed.format?.duration),
    };
}

function measureLoudness(file) {
    const result = run('ffmpeg', [
        '-hide_banner', '-nostats', '-i', file,
        '-af', 'ebur128=peak=true', '-f', 'null', '-',
    ]);
    const integrated = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/gu.exec(result.stderr);
    const peak = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+) dBFS/gu.exec(result.stderr);
    if (!integrated || !peak) throw new Error(`Could not parse EBU measurements for ${file}.`);
    return { integratedLufs: Number(integrated[1]), truePeakDbfs: Number(peak[1]) };
}

function measureSilence(file, durationSeconds) {
    const result = run('ffmpeg', [
        '-hide_banner', '-nostats', '-i', file,
        '-af', 'silencedetect=noise=-45dB:d=0.05', '-f', 'null', '-',
    ]);
    const spans = [];
    let start = null;
    for (const line of result.stderr.split('\n')) {
        const started = /silence_start: ([\d.]+)/u.exec(line);
        if (started) start = Number(started[1]);
        const ended = /silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/u.exec(line);
        if (ended && start !== null) {
            spans.push({ start, end: Number(ended[1]), duration: Number(ended[2]) });
            start = null;
        }
    }
    const leading = spans.find(span => span.start <= 0.001)?.duration ?? 0;
    const trailingSpan = spans.findLast(span => durationSeconds - span.end <= 0.03);
    const interior = spans.filter(span => span.start > 0.001 && durationSeconds - span.end > 0.03);
    return {
        leadingSeconds: round(leading),
        trailingSeconds: round(trailingSpan?.duration ?? 0),
        longestInteriorSeconds: round(Math.max(0, ...interior.map(span => span.duration))),
    };
}

async function transcribe(file, expected, outputBase) {
    const wavPath = `${outputBase}.wav`;
    run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', file,
        '-ar', '16000', '-ac', '1', wavPath,
    ]);
    run('whisper-cli', [
        '--model', whisperModel,
        '--language', 'ja',
        '--output-json',
        '--output-file', outputBase,
        '--no-prints',
        '--file', wavPath,
    ]);
    const result = JSON.parse(await readFile(`${outputBase}.json`, 'utf8'));
    const transcript = (result.transcription ?? []).map(segment => segment.text ?? '').join('').trim()
        || result.text?.trim()
        || '';
    const normalizedExpected = normalizeJapanese(expected);
    const normalizedTranscript = normalizeJapanese(transcript);
    const characterErrorRate = normalizedExpected
        ? levenshtein(normalizedExpected, normalizedTranscript) / [...normalizedExpected].length
        : 1;
    return {
        status: characterErrorRate <= 0.15 ? 'passed' : 'failed',
        transcript,
        normalizedTranscript,
        characterErrorRate: round(characterErrorRate, 4),
    };
}

function validateReviews(value, entries) {
    const expectedHashes = entries.map(entry => entry.assetSha256).sort();
    const accepted = Array.isArray(value?.reviews)
        ? value.reviews.filter(review => review.audioActuallyAuditioned === true
            && review.humanReviewed === false
            && review.overallVerdict === 'pass'
            && review.assetSha256s?.slice().sort().join(',') === expectedHashes.join(','))
        : [];
    const reviewerKeys = new Set(accepted.map(review => `${review.reviewer?.service}:${review.reviewer?.modelFamily}`));
    return {
        path: 'docs/academy/audio/learning-voice-model-reviews.json',
        count: accepted.length,
        independentReviewerFamilies: reviewerKeys.size,
        passed: accepted.length >= 2 && reviewerKeys.size >= 2,
    };
}

function run(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr}`);
    return result;
}

function commandVersion(command) {
    return run(command, ['-version']).stdout.split('\n')[0];
}

async function optionalJson(path) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
}

function normalizeJapanese(value) {
    const normalized = value.normalize('NFKC').replaceAll('三百', '300');
    return [...normalized].filter(character => /[\p{L}\p{N}]/u.test(character)).join('');
}

function levenshtein(left, right) {
    const a = [...left];
    const b = [...right];
    let previous = [0, ...b.map((_, index) => index + 1)];
    for (let row = 0; row < a.length; row += 1) {
        const current = [row + 1];
        for (let column = 0; column < b.length; column += 1) {
            current[column + 1] = Math.min(
                current[column] + 1,
                previous[column + 1] + 1,
                previous[column] + (a[row] === b[column] ? 0 : 1),
            );
        }
        previous = current;
    }
    return previous[b.length] ?? a.length;
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function round(value, places = 3) {
    return Number(value.toFixed(places));
}
