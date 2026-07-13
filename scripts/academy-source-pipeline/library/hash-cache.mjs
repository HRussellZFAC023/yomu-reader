import { createHash } from 'node:crypto';
import { openSync, readSync, closeSync, statSync } from 'node:fs';
import { LIBRARY_SCHEMA_VERSIONS } from './paths.mjs';
import { readJsonIfPresent, writeJsonAtomic } from '../io.mjs';

const READ_CHUNK_BYTES = 8 * 1024 * 1024;

/**
 * Resumable SHA-256 index for the 42 GB library.
 *
 * Verification semantics: a cache entry is trusted only when the file's
 * path identity, exact byte size AND nanosecond mtime all still match the
 * recorded values — same-size edits invalidate via mtimeNs. Set
 * `verify: true` (ACADEMY_LIBRARY_VERIFY_HASHES=1) to re-hash every file and
 * fail loudly on any digest drift. Files are hashed by streaming reads, so
 * multi-GB entries never load into memory; read failures return an explicit
 * `failed:read` record instead of disappearing.
 */
export function createHashCache(cachePath) {
    const previous = readJsonIfPresent(cachePath);
    const entries = previous?.schema === LIBRARY_SCHEMA_VERSIONS.hashCache ? previous.entries : {};
    let dirtyCount = 0;

    const persist = () => {
        writeJsonAtomic(cachePath, { schema: LIBRARY_SCHEMA_VERSIONS.hashCache, entries });
        dirtyCount = 0;
    };

    return {
        hashFile(absolutePath, relativePath, { verify = false } = {}) {
            let identity;
            try {
                const stats = statSync(absolutePath, { bigint: true });
                identity = { byteLength: Number(stats.size), mtimeNs: stats.mtimeNs.toString() };
            } catch (error) {
                return { status: 'failed:stat', failure: String(error?.message ?? error) };
            }
            const cached = entries[relativePath];
            const fresh = cached
                && cached.byteLength === identity.byteLength
                && cached.mtimeNs === identity.mtimeNs;
            if (fresh && !verify) return { status: 'hashed', sha256: cached.sha256, ...identity, fromCache: true };

            let sha256;
            try {
                sha256 = streamSha256(absolutePath);
            } catch (error) {
                delete entries[relativePath];
                dirtyCount += 1;
                return { status: 'failed:read', failure: String(error?.message ?? error), ...identity };
            }
            if (fresh && verify && cached.sha256 !== sha256) {
                throw new Error(`Hash verification failed for a cached entry (metadata unchanged, digest drifted): ${relativePath}`);
            }
            entries[relativePath] = { byteLength: identity.byteLength, mtimeNs: identity.mtimeNs, sha256 };
            dirtyCount += 1;
            if (dirtyCount >= 100) persist();
            return { status: 'hashed', sha256, ...identity, fromCache: false };
        },
        flush: persist,
    };
}

function streamSha256(absolutePath) {
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    const fd = openSync(absolutePath, 'r');
    try {
        let bytesRead;
        while ((bytesRead = readSync(fd, buffer, 0, READ_CHUNK_BYTES, null)) > 0) {
            hash.update(buffer.subarray(0, bytesRead));
        }
    } finally {
        closeSync(fd);
    }
    return hash.digest('hex');
}
