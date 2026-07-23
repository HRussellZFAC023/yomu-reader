#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = join(root, 'src/academy/content/story-sources/opening-arrival-bridge.v2.json');
const locksPath = join(root, 'docs/academy/audio/voice-line-locks.json');
const playbackPath = join(root, 'public/academy/audio/story-voice-playback.json');
const castPath = join(root, 'docs/academy/audio/aivis-cast-models.json');
const outputPath = join(root, 'docs/academy/audio/opening-arrival-voice-manifest.json');
const whisperModel = process.env.ACADEMY_WHISPER_MODEL
    ?? '/Users/heru/.cache/whisper-cpp/ggml-small.bin';
const engine = process.env.ACADEMY_AIVIS_ENGINE ?? 'http://127.0.0.1:10101';
const lineGates = {
    'line:opening-arrival:rie-evening::foundation': [/こんばんは/u, /[ヨよ]ムアカデミー/u, /ようこそ/u],
    'line:opening-arrival:rie-evening::n5': [/こんばんは/u, /ようこそ/u, /(?:席|セキ)はここ/u],
    'line:opening-arrival:rie-no-rush::foundation': [/ゆっくり/u, /いいです/u],
    'line:opening-arrival:rie-no-rush::n5': [/(?:急がなくて|イソガナクテ)/u, /(?:準備|ジュンビ)/u, /どうぞ/u],
    'line:opening-arrival:rie-fiction::foundation': [/(?:だいじょうぶ|大丈夫|ダイジョウブ)/u, /(?:いっしょ|一緒|イッショ)/u, /やりましょう/u],
    'line:opening-arrival:rie-fiction::n5': [/(?:今夜|コンヤ)/u, /(?:全部|ゼンブ)/u, /(?:だいじょうぶ|大丈夫|ダイジョウブ)/u, /(?:いっしょ|一緒|イッショ)/u],
    'line:opening-arrival:rie-learner-control::foundation': [/(?:わからない|分からない|ワカラナイ)/u, /(?:もどれ|戻れ|モドレ)/u],
    'line:opening-arrival:rie-learner-control::n5': [/(?:わからない|分からない|ワカラナイ)/u, /いつでも/u, /(?:もどって|戻って|モドッテ)/u, /(?:きけ|聞け|キケ)/u],
    'line:opening-arrival:rie-enter::foundation': [/(?:つきました|着きました|ツキマシタ)/u, /(?:はいりましょう|入りましょう|ハイリマショウ)/u],
    'line:opening-arrival:rie-enter::n5': [/(?:つきました|着きました|ツキマシタ)/u, /(?:はいりましょう|入りましょう|ハイリマショウ)/u],
};

const source = readJson(sourcePath);
const locks = readJson(locksPath);
const playback = readJson(playbackPath);
const rie = readJson(castPath).find(entry => entry.speaker === 'rie');
if (!rie?.uuid) throw new Error('The pinned Rie Aivis model is missing.');

const [versionResponse, modelsResponse, speakersResponse] = await Promise.all([
    fetch(`${engine}/version`),
    fetch(`${engine}/aivm_models`),
    fetch(`${engine}/speakers`),
]);
if (![versionResponse, modelsResponse, speakersResponse].every(response => response.ok)) {
    throw new Error('AivisSpeech did not return its version, model, and speaker contracts.');
}
const engineVersion = await versionResponse.json();
const models = await modelsResponse.json();
const speakers = await speakersResponse.json();
const installedModel = models[rie.uuid];
if (!installedModel) throw new Error(`Rie model is not installed: ${rie.uuid}`);
const installedSpeaker = speakers.find(speaker => speaker.speaker_uuid === installedModel.speakers?.[0]?.speaker_uuid)
    ?? speakers.find(speaker => speaker.name === rie.model);
const style = installedSpeaker?.styles?.[0];
if (!style) throw new Error('The pinned Rie model has no installed synthesis style.');

const temp = mkdtempSync(join(tmpdir(), 'yomu-arrival-voice-'));
try {
    const results = [];
    for (const [key, gates] of Object.entries(lineGates)) {
        const [lineId, band] = splitKey(key);
        const authored = sourceLine(source, lineId, band);
        const lock = locks[key];
        if (!lock || lock.status !== 'locked') throw new Error(`Arrival voice is not locked: ${key}`);
        if (lock.sourceSha256 !== authored.sourceSha256) throw new Error(`Arrival voice source drifted: ${key}`);
        const catalogEntry = playback.entries.find(entry => (
            entry.lineId === lineId
            && entry.band === band
            && entry.speakerId === authored.speakerId
            && entry.japanese === authored.japanese
            && entry.sourceSha256 === authored.sourceSha256
        ));
        if (!catalogEntry) throw new Error(`Arrival voice is absent from playback: ${key}`);

        const assetPath = join(root, 'public', catalogEntry.url.replace(/^\//u, ''));
        const assetSha256 = sha256File(assetPath);
        if (assetSha256 !== catalogEntry.assetSha256) throw new Error(`Arrival media hash drifted: ${key}`);
        if (statSync(assetPath).size !== catalogEntry.bytes) throw new Error(`Arrival media byte count drifted: ${key}`);

        const queryUrl = new URL('/audio_query', engine);
        queryUrl.searchParams.set('text', authored.japanese);
        queryUrl.searchParams.set('speaker', String(style.id));
        const queryResponse = await fetch(queryUrl, { method: 'POST' });
        if (!queryResponse.ok) throw new Error(`Aivis audio query failed for ${key}: ${queryResponse.status}`);
        const query = await queryResponse.json();
        for (const [field, value] of Object.entries(lock.pitch?.queryOverrides ?? {})) query[field] = value;
        const phrases = query.accent_phrases ?? query.accentPhrases ?? [];
        const pitchTrace = phrases.flatMap((phrase, accentPhrase) => phrase.moras.map((mora, index) => ({
            accentPhrase,
            accent: phrase.accent,
            mora: index,
            text: mora.text,
            pitch: mora.pitch,
        })));
        if (!pitchTrace.length || phrases.some(phrase => (
            !Number.isInteger(phrase.accent)
            || phrase.accent < 0
            || phrase.accent > phrase.moras.length
        ))) {
            throw new Error(`Arrival voice has no usable accent-phrase trace: ${key}`);
        }

        const media = probeMedia(assetPath);
        if (media.codec !== 'opus' || media.sampleRate !== 48_000 || media.channels !== 1) {
            throw new Error(`Arrival voice has the wrong media shape: ${key}`);
        }
        if (media.durationSeconds < 0.6 || media.durationSeconds > 12) {
            throw new Error(`Arrival voice duration is implausible: ${key} (${media.durationSeconds}s)`);
        }
        if (media.maxVolumeDb < -18 || media.maxVolumeDb > -0.1) {
            throw new Error(`Arrival voice loudness is outside the playable range: ${key} (${media.maxVolumeDb}dB)`);
        }

        const wavPath = join(temp, `${basename(assetPath, '.opus')}.wav`);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', assetPath, '-ar', '16000', '-ac', '1', wavPath]);
        const transcript = normalizeTranscript(execFileSync('whisper-cli', [
            '-m', whisperModel,
            '-l', 'ja',
            '-nt',
            '-np',
            wavPath,
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
        const failedGate = gates.find(gate => !gate.test(transcript));
        if (failedGate) throw new Error(`Arrival voice ASR gate ${failedGate} failed for ${key}: ${transcript}`);

        results.push({
            key,
            lineId,
            band,
            japanese: authored.japanese,
            sourceSha256: authored.sourceSha256,
            output: catalogEntry.url,
            assetSha256,
            bytes: catalogEntry.bytes,
            media,
            querySha256: sha256Text(stableJson(query)),
            accentPhraseCount: phrases.length,
            pitchTrace,
            whisper: {
                model: basename(whisperModel),
                transcript,
                gates: gates.map(gate => gate.source),
                passed: true,
            },
            verdict: 'pass',
        });
    }

    const manifest = {
        schema: 'yomu-academy.opening-arrival-voice-qa.v1',
        qualityBoundary: 'Codex objective QA: exact authored source, pinned Aivis model, accent-phrase and mora trace, render-time intonation controls, codec, duration, loudness, hash, and independent Japanese Whisper phrase gates. No human-audition claim.',
        source: {
            path: 'src/academy/content/story-sources/opening-arrival-bridge.v2.json',
            revision: source.revision,
            sha256: sha256File(sourcePath),
        },
        engine: {
            name: 'AivisSpeech Engine',
            version: engineVersion,
            modelUuid: rie.uuid,
            modelName: rie.model,
            styleId: style.id,
            styleName: style.name,
            payloadSha256: sha256File(installedModel.file_path),
        },
        whisper: {
            executable: 'whisper-cli',
            model: basename(whisperModel),
            modelSha256: sha256File(whisperModel),
            language: 'ja',
        },
        complete: results.length === Object.keys(lineGates).length && results.every(result => result.verdict === 'pass'),
        entries: results,
    };
    writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ output: outputPath, complete: manifest.complete, entries: results.length }));
} finally {
    rmSync(temp, { recursive: true, force: true });
}

function splitKey(key) {
    const separator = key.lastIndexOf('::');
    return [key.slice(0, separator), key.slice(separator + 2)];
}

function sourceLine(packageSource, lineId, band) {
    for (const scene of packageSource.scenes) {
        const node = scene.nodes.find(candidate => candidate.id === lineId);
        const variant = node?.variants?.[band];
        if (!node || !variant) continue;
        const sourceSha256 = sha256Text([
            packageSource.id,
            scene.id,
            node.speakerId ?? '',
            band,
            variant.japanese,
            variant.reading,
            variant.english,
        ].join('\n'));
        return { ...variant, speakerId: node.speakerId, sourceSha256 };
    }
    throw new Error(`Arrival source line is missing: ${lineId}::${band}`);
}

function probeMedia(path) {
    const probe = JSON.parse(execFileSync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration',
        '-of', 'json',
        path,
    ], { encoding: 'utf8' }));
    const volume = spawnSync('ffmpeg', ['-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], {
        encoding: 'utf8',
    });
    if (volume.status !== 0) throw new Error(`ffmpeg loudness probe failed for ${path}`);
    const maxVolume = /max_volume:\s*(-?\d+(?:\.\d+)?) dB/u.exec(volume.stderr)?.[1];
    const meanVolume = /mean_volume:\s*(-?\d+(?:\.\d+)?) dB/u.exec(volume.stderr)?.[1];
    if (!maxVolume || !meanVolume) throw new Error(`ffmpeg did not report loudness for ${path}`);
    return {
        codec: probe.streams[0].codec_name,
        sampleRate: Number(probe.streams[0].sample_rate),
        channels: Number(probe.streams[0].channels),
        durationSeconds: Number(Number(probe.format.duration).toFixed(3)),
        meanVolumeDb: Number(meanVolume),
        maxVolumeDb: Number(maxVolume),
    };
}

function normalizeTranscript(value) {
    return value.replace(/\s+/gu, '').replace(/[。、,.!?！？]/gu, '').trim();
}

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function sha256File(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sha256Text(value) {
    return createHash('sha256').update(value).digest('hex');
}

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}
