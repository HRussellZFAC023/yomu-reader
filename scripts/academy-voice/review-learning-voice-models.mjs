import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const whisperModel = requiredPath('WHISPER_MODEL');
const voskModel = requiredPath('VOSK_MODEL');
const uv = process.env.UV_BIN ?? resolve(process.env.HOME ?? '', '.local/bin/uv');
const catalog = JSON.parse(await readFile(resolve(root, 'public/academy/audio/learning-voice-playback.json'), 'utf8'));
const temporary = await mkdtemp(resolve(tmpdir(), 'yomu-learning-voice-reviews-'));

try {
    const prepared = [];
    for (const entry of catalog.entries) {
        const assetPath = resolve(root, 'public', entry.url.replace(/^\//u, ''));
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
        whisperLines.push(reviewLine(item.entry, transcript));
    }

    const voskResult = run(uv, [
        'run', '--with', 'vosk', 'python', '-c', voskReviewProgram(),
        voskModel,
        ...prepared.map(item => item.wavPath),
    ]);
    const voskTranscripts = JSON.parse(voskResult.stdout);
    const voskLines = prepared.map(item => reviewLine(item.entry, voskTranscripts[basename(item.wavPath)] ?? ''));
    const assetSha256s = catalog.entries.map(entry => entry.assetSha256).sort();
    const reviews = [
        buildReview({
            service: 'whisper.cpp local inference',
            modelFamily: 'OpenAI Whisper',
            displayedModel: basename(whisperModel),
            modelPayloadSha256: sha256(await readFile(whisperModel)),
            independentReviewIndex: 1,
        }, whisperLines, assetSha256s),
        buildReview({
            service: 'Vosk local inference',
            modelFamily: 'Kaldi Vosk Japanese',
            displayedModel: basename(voskModel),
            modelPayloadSha256: await directorySha256(voskModel),
            independentReviewIndex: 2,
        }, voskLines, assetSha256s),
    ];
    const report = {
        schema: 'yomu-academy.learning-voice-model-reviews.v1',
        reviewedOn: '2026-07-20',
        audioModelReviewed: reviews.every(review => review.audioActuallyAuditioned),
        humanReviewed: false,
        policy: {
            independentModelFamiliesRequired: 2,
            maximumCharacterErrorRate: 0.15,
            basis: 'Each reviewer must process the actual waveform and independently recover the intended Japanese. Signal, codec, clipping, loudness, and silence are assessed by the separate objective QA gate.',
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
        overallVerdict: reviews.every(review => review.overallVerdict === 'pass') ? 'pass' : 'fail',
    };
    await writeFile(
        resolve(root, 'docs/academy/audio/learning-voice-model-reviews.json'),
        `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(`Independent audio model reviews: ${reviews.filter(review => review.overallVerdict === 'pass').length}/2 passed.`);
    if (report.overallVerdict !== 'pass') process.exitCode = 1;
} finally {
    await rm(temporary, { recursive: true, force: true });
}

function buildReview(reviewer, lines, assetSha256s) {
    const overallVerdict = lines.every(line => line.verdict === 'pass') ? 'pass' : 'fail';
    return {
        reviewer,
        audioActuallyAuditioned: true,
        audioModelReviewed: true,
        humanReviewed: false,
        auditionMethod: 'direct local waveform inference',
        criteria: [
            'independent acoustic intelligibility',
            'Japanese waveform-to-text recovery',
            'character error rate at or below 0.15',
        ],
        assetSha256s,
        lines,
        overallVerdict,
        blockingDefects: lines.filter(line => line.verdict === 'fail').map(line => (
            `${line.lineId}: CER ${line.characterErrorRate}`
        )),
    };
}

function reviewLine(entry, transcript) {
    const expected = normalizeJapanese(entry.japanese);
    const heard = normalizeJapanese(transcript);
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
        verdict: characterErrorRate <= 0.15 ? 'pass' : 'fail',
    };
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

function round(value, places = 4) {
    return Number(value.toFixed(places));
}

function voskReviewProgram() {
    return String.raw`
import json, os, sys, wave
from vosk import KaldiRecognizer, Model, SetLogLevel
SetLogLevel(-1)
model = Model(sys.argv[1])
results = {}
for path in sys.argv[2:]:
    with wave.open(path, 'rb') as audio:
        recognizer = KaldiRecognizer(model, audio.getframerate())
        while True:
            data = audio.readframes(4000)
            if not data:
                break
            recognizer.AcceptWaveform(data)
        results[os.path.basename(path)] = json.loads(recognizer.FinalResult()).get('text', '')
print(json.dumps(results, ensure_ascii=False))
`;
}
