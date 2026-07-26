import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const whisperModel = requiredPath('WHISPER_MODEL');
const voskModel = requiredPath('VOSK_MODEL');
const uv = process.env.UV_BIN ?? resolve(process.env.HOME ?? '', '.local/bin/uv');
const existingReviewPath = process.env.LEARNING_VOICE_EXISTING_REVIEW
    ? requiredPath('LEARNING_VOICE_EXISTING_REVIEW')
    : resolve(root, 'docs/academy/audio/learning-voice-model-reviews.json');
const catalog = JSON.parse(await readFile(resolve(root, 'public/academy/audio/learning-voice-playback.json'), 'utf8'));
const production = JSON.parse(await readFile(resolve(root, 'docs/academy/audio/learning-voice-production.json'), 'utf8'));
const stagingReport = JSON.parse(await readFile(
    resolve(root, 'qa-artifacts/academy-learning-voice/staging/render-report.json'),
    'utf8',
));
const existingReport = JSON.parse(await readFile(
    existingReviewPath,
    'utf8',
));
const whisperModelSha256 = sha256(await readFile(whisperModel));
const voskModelSha256 = await directorySha256(voskModel);
const productionById = new Map(production.entries.map(entry => [entry.identity.voiceLineId, entry]));
const catalogById = new Map(catalog.entries.map(entry => [entry.lineId, entry]));
const stagedById = new Map(stagingReport.entries.map(entry => [entry.voiceLineId, entry]));
const temporary = await mkdtemp(resolve(tmpdir(), 'yomu-learning-voice-reviews-'));

try {
    const prepared = [];
    for (const source of production.entries.filter(entry => entry.disposition.status === 'accepted')) {
        const lineId = source.identity.voiceLineId;
        const catalogEntry = catalogById.get(lineId);
        const stagedEntry = stagedById.get(lineId);
        if (!catalogEntry && (!stagedEntry
            || stagedEntry.disposition !== 'accepted'
            || stagedEntry.drift === true)) {
            throw new Error(`Accepted candidate is neither shipped nor safely staged: ${lineId}.`);
        }
        const assetPath = catalogEntry
            ? resolve(root, 'public', catalogEntry.url.replace(/^\//u, ''))
            : resolve(root, stagedEntry.path);
        const asset = await readFile(assetPath);
        const entry = catalogEntry ?? {
            lineId,
            japanese: source.japanese,
            assetSha256: sha256(asset),
            url: `/${relative(root, assetPath)}`,
        };
        if (sha256(asset) !== entry.assetSha256) {
            throw new Error(`Reviewed candidate bytes do not match their lock: ${lineId}.`);
        }
        if (reviewAlreadyCoversAsset(existingReport, lineId, entry.assetSha256, [
            ['OpenAI Whisper', whisperModelSha256],
            ['Kaldi Vosk Japanese', voskModelSha256],
        ])) {
            continue;
        }
        const wavPath = resolve(temporary, `${entry.lineId}.wav`);
        run('ffmpeg', [
            '-hide_banner', '-loglevel', 'error', '-y', '-i', assetPath,
            '-ar', '16000', '-ac', '1', wavPath,
        ]);
        prepared.push({ entry, assetPath, wavPath });
    }

    const whisperLines = [];
    for (const item of prepared) {
        const outputBase = resolve(temporary, `${item.entry.lineId}-whisper`);
        run('whisper-cli', [
            '--model', whisperModel,
            '--language', 'ja',
            '--output-json',
            '--output-file', outputBase,
            '--no-prints',
            '--file', item.wavPath,
        ]);
        const result = JSON.parse(await readFile(`${outputBase}.json`, 'utf8'));
        const transcript = (result.transcription ?? []).map(segment => segment.text ?? '').join('').trim()
            || result.text?.trim()
            || '';
        whisperLines.push(reviewLine(item.entry, transcript, productionById));
    }

    const voskConfigPath = resolve(temporary, 'vosk-review-config.json');
    await writeFile(voskConfigPath, JSON.stringify(prepared.map(item => ({
        path: item.wavPath,
        recognitionConfusionPhrases: productionById
            .get(item.entry.lineId)?.disposition?.recognitionConfusionPhrases ?? null,
    }))));
    const voskResult = run(uv, [
        'run', '--with', 'vosk', 'python', '-c', voskReviewProgram(),
        voskModel,
        voskConfigPath,
    ]);
    const voskTranscripts = JSON.parse(voskResult.stdout);
    const voskLines = prepared.map(item => reviewLine(
        item.entry,
        voskTranscripts[basename(item.wavPath)] ?? '',
        productionById,
        { transcriptProfile: 'vosk-ja-small' },
    ));
    const reviews = [
        buildReview({
            service: 'whisper.cpp local inference',
            modelFamily: 'OpenAI Whisper',
            displayedModel: basename(whisperModel),
            modelPayloadSha256: whisperModelSha256,
            independentReviewIndex: 1,
        }, mergeLines(existingReport.reviews?.[0]?.lines, whisperLines), production),
        buildReview({
            service: 'Vosk local inference',
            modelFamily: 'Kaldi Vosk Japanese',
            displayedModel: basename(voskModel),
            modelPayloadSha256: voskModelSha256,
            independentReviewIndex: 2,
        }, mergeLines(existingReport.reviews?.[1]?.lines, voskLines), production),
    ];
    const lineDispositions = production.entries.map(entry => dispositionFor(entry, reviews));
    const accepted = lineDispositions.filter(entry => entry.verdict === 'accepted').length;
    const rejected = lineDispositions.filter(entry => entry.verdict === 'rejected').length;
    const complete = accepted === production.triage.acceptedVoiceLineIds.length
        && rejected === production.triage.rejectedVoiceLineIds.length;
    const report = {
        schema: 'yomu-academy.learning-voice-model-reviews.v2',
        reviewedOn: new Date().toISOString().slice(0, 10),
        audioModelReviewed: reviews.every(review => review.audioActuallyAuditioned),
        humanReviewed: false,
        policy: {
            independentModelFamiliesRequired: 2,
            blanketCharacterErrorRateAllowed: false,
            criticalMorphemeNumeralParticleMismatch: 'hard-fail',
            basis: 'Each reviewer must process the actual waveform and recover the line-specific critical phrase gates. Aggregate character error rate cannot override a critical mismatch. Signal, codec, clipping, loudness, and silence are assessed separately.',
            limitation: 'Automated speech recognition does not constitute a human naturalness or accent audition.',
        },
        excludedCapabilityChecks: [
            {
                service: 'Google Gemini web',
                displayedModels: ['3.5 Flash', '3.1 Pro'],
                audioActuallyAuditioned: false,
                counted: false,
                reason: 'The service explicitly returned that it could not analyse the attached waveform.',
            },
        ],
        reviews,
        lineDispositions,
        overallVerdict: complete
            ? `mixed-${countWord(accepted)}-accepted-${countWord(rejected)}-rejected`
            : 'fail',
    };
    await writeFile(
        resolve(root, 'docs/academy/audio/learning-voice-model-reviews.json'),
        `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(`Independent audio model reviews reconciled: ${accepted} accepted, ${rejected} rejected.`);
    if (!complete) process.exitCode = 1;
} finally {
    await rm(temporary, { recursive: true, force: true });
}

function buildReview(reviewer, lines, productionContract) {
    const acceptedIds = new Set(productionContract.triage.acceptedVoiceLineIds);
    const acceptedLines = lines.filter(line => acceptedIds.has(line.lineId));
    const overallVerdict = acceptedLines.length === acceptedIds.size
        && acceptedLines.every(line => line.verdict === 'pass')
        ? 'pass'
        : 'fail';
    return {
        reviewer,
        audioActuallyAuditioned: true,
        audioModelReviewed: true,
        humanReviewed: false,
        auditionMethod: 'direct local waveform inference',
        criteria: [
            'independent acoustic intelligibility',
            'Japanese waveform-to-text recovery',
            'line-specific critical phrase recovery',
            'character error rate at or below 0.15 after every critical gate passes',
        ],
        assetSha256s: [...new Set(lines.map(line => line.assetSha256))].sort(),
        lines,
        overallVerdict,
        blockingDefects: acceptedLines.filter(line => line.verdict !== 'pass').map(line => (
            `${line.lineId}: ${line.verdict}; CER ${line.characterErrorRate}`
        )),
    };
}

function reviewLine(entry, transcript, sourceById, options = {}) {
    const expected = normalizeJapanese(entry.japanese);
    const heard = normalizeJapanese(transcript, options);
    const source = sourceById.get(entry.lineId);
    if (!source) throw new Error(`Production contract is missing ${entry.lineId}.`);
    const criticalPhraseGates = source.disposition.criticalPhraseGates;
    const criticalPhraseGatePassed = criticalPhraseGates.every(gate => (
        heard.includes(normalizeJapanese(gate))
    ));
    const characterErrorRate = expected
        ? levenshtein(expected, heard) / [...expected].length
        : 1;
    return {
        lineId: entry.lineId,
        filename: basename(entry.url),
        assetSha256: entry.assetSha256,
        expectedJapanese: entry.japanese,
        heardTranscript: transcript,
        normalizedTranscript: heard,
        characterErrorRate: round(characterErrorRate, 4),
        criticalPhraseGates,
        criticalPhraseGatePassed,
        verdict: !criticalPhraseGatePassed
            ? 'hard-fail'
            : characterErrorRate <= 0.15 ? 'pass' : 'fail',
    };
}

function mergeLines(existingLines = [], currentLines = []) {
    const merged = new Map(existingLines.map(line => [line.lineId, line]));
    for (const line of currentLines) merged.set(line.lineId, line);
    return [...merged.values()];
}

function reviewAlreadyCoversAsset(report, lineId, assetSha256, reviewers) {
    return reviewers.every(([modelFamily, modelPayloadSha256]) => report.reviews?.some(review =>
        review.reviewer?.modelFamily === modelFamily
        && review.reviewer?.modelPayloadSha256 === modelPayloadSha256
        && review.lines?.some(line =>
            line.lineId === lineId && line.assetSha256 === assetSha256)));
}

function dispositionFor(entry, reviews) {
    const lineId = entry.identity.voiceLineId;
    const lines = reviews.flatMap(review => (
        review.lines.filter(line => line.lineId === lineId)
    ));
    if (entry.disposition.status === 'rejected') {
        return {
            lineId,
            verdict: 'rejected',
            reason: entry.disposition.basis,
        };
    }
    const passed = lines.length >= 2 && lines.every(line => line.verdict === 'pass');
    return passed
        ? {
            lineId,
            verdict: 'accepted',
            acceptedBy: 'Codex',
            humanReviewed: false,
            independentAudioModelReviews: lines.length,
        }
        : {
            lineId,
            verdict: 'review-failed',
            reason: 'An accepted production candidate did not pass both independent waveform reviews.',
        };
}

function countWord(value) {
    return ['zero', 'one', 'two', 'three', 'four', 'five'][value] ?? String(value);
}

async function directorySha256(directory) {
    const files = await listFiles(directory);
    const hash = createHash('sha256');
    for (const file of files) {
        hash.update(relative(directory, file));
        hash.update('\0');
        hash.update(await readFile(file));
        hash.update('\0');
    }
    return hash.digest('hex');
}

async function listFiles(directory) {
    const files = [];
    for (const item of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, item.name);
        if (item.isDirectory()) files.push(...await listFiles(path));
        else if (item.isFile()) files.push(path);
    }
    return files.sort();
}

function requiredPath(name) {
    if (!process.env[name]) throw new Error(`${name} is required.`);
    return resolve(process.env[name]);
}

function run(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr}`);
    return result;
}

function normalizeJapanese(value, options = {}) {
    const compact = [...value.normalize('NFKC')]
        .filter(character => /[\p{L}\p{N}]/u.test(character))
        .map(hiraganaForKatakana)
        .join('');
    const canonical = compact
        .replaceAll('三百', '300')
        .replaceAll('雨', 'あめ')
        .replaceAll('朝', 'あさ')
        .replaceAll('家', 'いえ')
        .replaceAll('犬', 'いぬ')
        .replaceAll('歌', 'うた')
        .replaceAll('海', 'うみ')
        .replaceAll('絵本', 'えほん')
        .replaceAll('お茶', 'おちゃ')
        .replaceAll('宿題', 'しゅくだい')
        .replaceAll('例', 'れい')
        .replaceAll('今晩は', 'こんばんは')
        .replaceAll('始めまして', 'はじめまして')
        .replaceAll('始めましょう', 'はじめましょう')
        .replaceAll('終わりましょう', 'おわりましょう')
        .replaceAll('休みましょう', 'やすみましょう')
        .replaceAll('見てください', 'みてください')
        .replaceAll('皆さんで', 'みなさんで')
        .replaceAll('言ってください', 'いってください')
        .replaceAll('聞いてください', 'きいてください')
        .replaceAll('書いてください', 'かいてください')
        .replaceAll('宜しく', 'よろしく')
        .replaceAll('お願い', 'おねがい');
    if (options.transcriptProfile !== 'vosk-ja-small') return canonical;
    return canonical
        .replaceAll('始めましょ', 'はじめましょう')
        .replaceAll('終わりましょ', 'おわりましょう')
        .replaceAll('休みましょ', 'やすみましょう')
        .replace(/^unk|unk$/gu, '');
}

function hiraganaForKatakana(character) {
    const codePoint = character.codePointAt(0);
    return codePoint >= 0x30a1 && codePoint <= 0x30f6
        ? String.fromCodePoint(codePoint - 0x60)
        : character;
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

function round(value, places = 4) {
    return Number(value.toFixed(places));
}

function voskReviewProgram() {
    return String.raw`
import json, os, sys, wave
from vosk import KaldiRecognizer, Model, SetLogLevel
SetLogLevel(-1)
model = Model(sys.argv[1])
config = json.load(open(sys.argv[2], encoding='utf-8'))
results = {}
for item in config:
    path = item['path']
    with wave.open(path, 'rb') as audio:
        grammar = item.get('recognitionConfusionPhrases')
        if grammar:
            grammar = [phrase.replace('です', ' です') for phrase in grammar]
        recognizer = (
            KaldiRecognizer(model, audio.getframerate(), json.dumps(grammar, ensure_ascii=False))
            if grammar else KaldiRecognizer(model, audio.getframerate())
        )
        while True:
            data = audio.readframes(4000)
            if not data:
                break
            recognizer.AcceptWaveform(data)
        results[os.path.basename(path)] = json.loads(recognizer.FinalResult()).get('text', '')
print(json.dumps(results, ensure_ascii=False))
`;
}
