import { EXTRACTION_REVISION, PRIVATE_SCHEMA_VERSIONS, insideRoot } from './paths.mjs';
import { writeJsonAtomic } from './io.mjs';

const DURATION_TOLERANCE_SECONDS = 2;

/**
 * Listening/media pairing CANDIDATES: donor pack audio references matched to
 * unique Moodle audio payloads by duration proximity. Machine candidates only —
 * every pairing carries its basis and stays review-required with an explicit
 * transcript and rights status.
 */
export function buildListeningPairings(roots, packCandidates, audioCensus) {
    const probed = audioCensus.payloads.filter(entry => entry.status === 'probed' && entry.durationSeconds !== null);
    const pairings = [];
    for (const pack of packCandidates.packs) {
        for (const audioRef of pack.audioRefs) {
            const candidates = probed
                .map(entry => ({
                    payloadSha256: entry.payloadSha256,
                    durationDeltaSeconds: roundDelta(entry.durationSeconds - audioRef.durationSeconds),
                }))
                .filter(candidate => Math.abs(candidate.durationDeltaSeconds) <= DURATION_TOLERANCE_SECONDS)
                .sort((a, b) => Math.abs(a.durationDeltaSeconds) - Math.abs(b.durationDeltaSeconds)
                    || (a.payloadSha256 < b.payloadSha256 ? -1 : 1))
                .slice(0, 8);
            pairings.push({
                packId: pack.packId,
                audioRefId: audioRef.id,
                referenceDurationSeconds: audioRef.durationSeconds ?? null,
                basis: 'duration-proximity',
                confidence: confidenceFor(candidates),
                candidates,
                transcriptStatus: 'none',
                rights: 'private-use-review-required',
                reviewState: 'machine-candidate-review-required',
            });
        }
    }
    const output = {
        schema: PRIVATE_SCHEMA_VERSIONS.pairing,
        extractionRevision: EXTRACTION_REVISION,
        pairings,
        totals: {
            audioRefCount: pairings.length,
            withCandidates: pairings.filter(pairing => pairing.candidates.length > 0).length,
            uniqueMatches: pairings.filter(pairing => pairing.confidence === 'high').length,
        },
    };
    writeJsonAtomic(insideRoot(roots.privateRoot, 'listening-pairings.v1.json'), output);
    return output;
}

function confidenceFor(candidates) {
    if (candidates.length === 0) return 'none';
    if (candidates.length === 1) return 'high';
    return candidates.length <= 3 ? 'medium' : 'low';
}

function roundDelta(value) {
    return Math.round(value * 100) / 100;
}
