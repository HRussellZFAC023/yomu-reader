import { execFileSync } from 'node:child_process';
import { EXTRACTION_REVISION, PRIVATE_SCHEMA_VERSIONS, insideRoot } from './paths.mjs';
import { readJsonIfPresent, writeJsonAtomic } from './io.mjs';
import { createPayloadStore } from './payload-store.mjs';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav']);

/**
 * ffprobe census of every unique audio payload. Resumable: entries carry the
 * extraction revision and complete entries are reused on re-run.
 */
export function runAudioCensus(roots, ledger, { log = () => {}, retryFailures = false } = {}) {
    const store = createPayloadStore(roots.privateRoot);
    const censusPath = insideRoot(roots.privateRoot, 'audio-census.v1.json');
    const previous = readJsonIfPresent(censusPath);
    const cache = new Map((previous?.extractionRevision === EXTRACTION_REVISION ? previous.payloads : [])
        .filter(entry => entry.status === 'probed' || (!retryFailures && entry.status?.startsWith('failed:')))
        .map(entry => [entry.payloadSha256, entry]));

    const payloads = [];
    for (const payload of ledger.uniquePayloads) {
        const extension = payload.classifications.map(entry => entry.extension).find(value => AUDIO_EXTENSIONS.has(value));
        if (!extension) continue;
        const cached = cache.get(payload.sha256);
        if (cached) {
            payloads.push(cached);
            continue;
        }
        log(`audio census ${payload.sha256}`);
        payloads.push(probeOne(store.pathFor(payload.sha256), payload, extension));
    }
    const census = {
        schema: PRIVATE_SCHEMA_VERSIONS.audioCensus,
        extractionRevision: EXTRACTION_REVISION,
        payloads,
    };
    writeJsonAtomic(censusPath, census);
    return census;
}

function probeOne(audioPath, payload, extension) {
    const base = { payloadSha256: payload.sha256, byteLength: payload.byteLength, extension };
    try {
        const stdout = execFileSync('ffprobe', [
            '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', audioPath,
        ], {
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
            timeout: 60_000,
            killSignal: 'SIGKILL',
        });
        const probe = JSON.parse(stdout);
        const audioStream = (probe.streams ?? []).find(stream => stream.codec_type === 'audio');
        if (!audioStream) return { ...base, status: 'failed:no-audio-stream' };
        return {
            ...base,
            status: 'probed',
            durationSeconds: probe.format?.duration ? Number(probe.format.duration) : null,
            codec: audioStream.codec_name ?? null,
            sampleRate: audioStream.sample_rate ? Number(audioStream.sample_rate) : null,
            channels: audioStream.channels ?? null,
            bitRate: probe.format?.bit_rate ? Number(probe.format.bit_rate) : null,
        };
    } catch (error) {
        return { ...base, status: 'failed:ffprobe', failure: String(error?.message ?? error) };
    }
}
