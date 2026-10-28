import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PUBLIC_ROOT = path.resolve('public');
const DOCS_PUBLIC_ROOT = path.resolve('docs/public');
const PUBLIC_LISTENING_MANIFEST = path.resolve(
    'public/academy/content/listening/listening-crosswalk.v1.json',
);
const DOCS_LISTENING_MANIFEST = path.resolve(
    'docs/public/academy/content/listening/listening-crosswalk.v1.json',
);

export interface ListeningManifestEntry {
    readonly locator: string;
    readonly availability: string;
    readonly source?: {
        readonly corpus: string;
        readonly sha256: string;
        readonly bytes: number;
        readonly mediaType: string;
        readonly codec: string;
        readonly questionMapRef: string;
    };
    readonly delivery?: { readonly mode: string; readonly url: string };
    readonly provenance: readonly string[];
}

interface ListeningManifest {
    readonly entries: readonly ListeningManifestEntry[];
}

export interface PackagedListeningExpectation {
    readonly locator: string;
    readonly url: string;
    readonly sha256: string;
    readonly bytes: number;
}

export interface PublicAssetExpectation {
    readonly url: string;
    readonly sha256: string;
    readonly bytes?: number;
}

let listeningManifest: ListeningManifest | undefined;

export function verifyCommittedPublicAsset(expectation: PublicAssetExpectation): Buffer {
    const relativePath = expectation.url.replace(/^\/+/, '');
    const publicBytes = readFileSync(path.join(PUBLIC_ROOT, relativePath));
    const docsBytes = readFileSync(path.join(DOCS_PUBLIC_ROOT, relativePath));

    assert.equal(sha256(publicBytes), expectation.sha256, `${expectation.url} does not match its committed SHA-256`);
    if (expectation.bytes !== undefined) {
        assert.equal(publicBytes.byteLength, expectation.bytes, `${expectation.url} has an unexpected byte length`);
    }
    assert.deepEqual(docsBytes, publicBytes, `${expectation.url} differs between public and docs/public`);
    return publicBytes;
}

export function verifyCommittedPackagedListening(
    expectation: PackagedListeningExpectation,
): ListeningManifestEntry {
    const manifest = readCommittedListeningManifest();
    const entry = manifest.entries.find(candidate => candidate.locator === expectation.locator);
    assert.ok(entry, `Missing committed listening provenance for ${expectation.locator}`);
    assert.equal(entry.availability, 'source-verified');
    assert.deepEqual(entry.source && {
        sha256: entry.source.sha256,
        bytes: entry.source.bytes,
        mediaType: entry.source.mediaType,
        codec: entry.source.codec,
    }, {
        sha256: expectation.sha256,
        bytes: expectation.bytes,
        mediaType: 'audio/mpeg',
        codec: 'mp3',
    });
    assert.deepEqual(entry.delivery, { mode: 'packaged-static', url: expectation.url });
    assert.ok(entry.source?.questionMapRef, `${expectation.locator} has no committed question-map provenance`);
    assert.ok(entry.provenance.length > 0, `${expectation.locator} has no committed provenance notes`);

    const bytes = verifyCommittedPublicAsset(expectation);
    assert.equal(bytes.subarray(0, 3).toString('ascii'), 'ID3', `${expectation.url} is not an ID3 MP3`);
    return entry;
}

function readCommittedListeningManifest(): ListeningManifest {
    if (listeningManifest) return listeningManifest;
    const publicBytes = readFileSync(PUBLIC_LISTENING_MANIFEST);
    const docsBytes = readFileSync(DOCS_LISTENING_MANIFEST);
    assert.deepEqual(docsBytes, publicBytes, 'The committed listening crosswalk mirror has drifted');
    listeningManifest = JSON.parse(publicBytes.toString('utf8')) as ListeningManifest;
    return listeningManifest;
}

function sha256(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
}
