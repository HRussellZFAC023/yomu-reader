import { existsSync } from 'node:fs';
import path from 'node:path';
import { insideRoot } from '../paths.mjs';
import { readJsonIfPresent } from '../io.mjs';

/**
 * Resolver seam between the library harness and the existing Moodle census.
 *
 * Bytes: a payload is resolved to the Moodle content-addressed store when the
 * hash already lives there, otherwise to its ORIGINAL library source path —
 * the 42 GB library is never copied or hardlinked into artifacts.
 *
 * Results: completed Moodle per-hash census records (PDF census directories,
 * audio probes) are reused verbatim by hash so overlapping payloads are never
 * re-censused and Moodle outputs stay byte-stable.
 */
export function createPayloadResolver(roots) {
    const moodleAudio = readJsonIfPresent(roots.moodleAudioCensusPath);
    const moodleAudioBySha = new Map((moodleAudio?.payloads ?? []).map(entry => [entry.payloadSha256, entry]));
    return {
        pathFor(payload) {
            const stored = insideRoot(roots.moodlePayloadStoreRoot, payload.sha256);
            if (existsSync(stored)) return { source: 'moodle-payload-store', absolutePath: stored };
            return { source: 'library-source-path', absolutePath: path.join(roots.libraryRoot, payload.firstRelativePath) };
        },
        moodlePdfCensusFor(sha256) {
            const record = readJsonIfPresent(insideRoot(roots.moodlePdfCensusRoot, sha256, 'census.json'));
            return record?.payloadSha256 === sha256 ? record : null;
        },
        moodleAudioProbeFor(sha256) {
            return moodleAudioBySha.get(sha256) ?? null;
        },
    };
}
