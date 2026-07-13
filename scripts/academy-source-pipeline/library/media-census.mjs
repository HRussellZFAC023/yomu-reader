import { execFileSync } from 'node:child_process';
import { LIBRARY_SCHEMA_VERSIONS } from './paths.mjs';
import { compareUtf8, readJsonIfPresent, writeJsonAtomic } from '../io.mjs';

/**
 * ffprobe census for every unique library audio, video and image payload:
 * duration, codec, stream layout, and pixel dimensions. Resumable — the
 * census file itself is the cache, keyed by payload SHA-256, flushed
 * periodically so a crash loses at most one batch. Moodle audio probes are
 * reused by hash via the resolver so overlapping payloads never re-probe.
 */
export function runLibraryMediaCensus(roots, ledger, resolver, { log = () => {}, retryFailures = false } = {}) {
    const mediaPayloads = ledger.uniquePayloads
        .filter(payload => payload.censusFamily === 'media')
        .sort((a, b) => compareUtf8(a.sha256, b.sha256));
    const previous = readJsonIfPresent(roots.mediaCensusPath);
    const cache = new Map((previous?.schema === LIBRARY_SCHEMA_VERSIONS.mediaCensus ? previous.payloads : [])
        .filter(entry => entry.status === 'probed' || (!retryFailures && entry.status?.startsWith('failed:')))
        .map(entry => [entry.payloadSha256, entry]));

    const payloads = [];
    let probedThisRun = 0;
    const flush = () => writeJsonAtomic(roots.mediaCensusPath, {
        schema: LIBRARY_SCHEMA_VERSIONS.mediaCensus,
        payloads,
    });
    for (const payload of mediaPayloads) {
        const cached = cache.get(payload.sha256);
        if (cached) {
            payloads.push(cached);
            continue;
        }
        const moodleProbe = resolver.moodleAudioProbeFor(payload.sha256);
        if (moodleProbe?.status === 'probed') {
            payloads.push({ ...moodleProbe, kind: payload.kind, probeSource: 'reused-moodle-probe' });
            continue;
        }
        payloads.push(probeOne(resolver.pathFor(payload), payload));
        probedThisRun += 1;
        if (probedThisRun % 200 === 0) {
            log(`media census: ${probedThisRun} new probes (${payloads.length}/${mediaPayloads.length})`);
            flush();
        }
    }
    flush();
    return { schema: LIBRARY_SCHEMA_VERSIONS.mediaCensus, payloads };
}

function probeOne(resolved, payload) {
    const base = {
        payloadSha256: payload.sha256,
        byteLength: payload.byteLength,
        kind: payload.kind,
        probeSource: resolved.source,
    };
    let probe;
    try {
        probe = JSON.parse(execFileSync('ffprobe', [
            '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', resolved.absolutePath,
        ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120_000, killSignal: 'SIGKILL' }));
    } catch (error) {
        return { ...base, status: 'failed:ffprobe', failure: String(error?.message ?? error) };
    }
    const streams = probe.streams ?? [];
    const audioStream = streams.find(stream => stream.codec_type === 'audio');
    const videoStream = streams.find(stream => stream.codec_type === 'video');
    if (!audioStream && !videoStream) return { ...base, status: 'failed:no-decodable-stream' };
    return {
        ...base,
        status: 'probed',
        containerFormat: probe.format?.format_name ?? null,
        durationSeconds: probe.format?.duration ? Number(probe.format.duration) : null,
        bitRate: probe.format?.bit_rate ? Number(probe.format.bit_rate) : null,
        streamCounts: {
            audio: streams.filter(stream => stream.codec_type === 'audio').length,
            video: streams.filter(stream => stream.codec_type === 'video').length,
            subtitle: streams.filter(stream => stream.codec_type === 'subtitle').length,
        },
        audio: audioStream ? {
            codec: audioStream.codec_name ?? null,
            sampleRate: audioStream.sample_rate ? Number(audioStream.sample_rate) : null,
            channels: audioStream.channels ?? null,
        } : null,
        video: videoStream ? {
            codec: videoStream.codec_name ?? null,
            width: videoStream.width ?? null,
            height: videoStream.height ?? null,
            frameCount: videoStream.nb_frames ? Number(videoStream.nb_frames) : null,
        } : null,
    };
}
