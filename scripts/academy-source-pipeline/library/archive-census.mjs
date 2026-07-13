import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LIBRARY_SCHEMA_VERSIONS } from './paths.mjs';
import { insideRoot } from '../paths.mjs';
import { compareUtf8, readJsonIfPresent, sha256Hex, writeJsonAtomic } from '../io.mjs';
import { readZipMembers, readMemberPayload } from '../zip.mjs';
import { classifyLibraryName } from './classify.mjs';

const ENCRYPTED_FLAG = 0x0001;

/**
 * Member census for every unique library archive payload (.zip/.apkg/.colpkg).
 * Members are hashed IN MEMORY straight from the source archive — no member
 * byte is ever exploded or copied into the artifact root. Unsupported,
 * encrypted, ZIP64 or corrupt archives receive explicit failure states so no
 * container silently disappears from the denominators. Cached per archive
 * SHA-256, so re-runs only parse new bytes.
 */
export function runArchiveCensus(roots, ledger, { log = () => {} } = {}) {
    const archives = ledger.uniquePayloads
        .filter(payload => payload.censusFamily === 'archive')
        .sort((a, b) => compareUtf8(a.sha256, b.sha256));

    const results = archives.map(payload => {
        const cachePath = insideRoot(roots.archiveCensusRoot, `${payload.sha256}.json`);
        const cached = readJsonIfPresent(cachePath);
        if (cached?.schema === LIBRARY_SCHEMA_VERSIONS.archiveCensus) return cached;
        log(`archive census ${payload.sha256}`);
        const record = censusOneArchive(roots, payload);
        writeJsonAtomic(cachePath, record);
        return record;
    });
    return { schema: LIBRARY_SCHEMA_VERSIONS.archiveCensus, archives: results };
}

function censusOneArchive(roots, payload) {
    const base = {
        schema: LIBRARY_SCHEMA_VERSIONS.archiveCensus,
        payloadSha256: payload.sha256,
        byteLength: payload.byteLength,
        kind: payload.kind,
    };
    let bytes;
    try {
        bytes = readFileSync(path.join(roots.libraryRoot, payload.firstRelativePath));
    } catch (error) {
        return { ...base, status: 'failed:read', failure: String(error?.message ?? error), members: [] };
    }
    if (sha256Hex(bytes) !== payload.sha256) {
        return { ...base, status: 'failed:source-bytes-changed-since-scan', members: [] };
    }
    let parsed;
    try {
        parsed = readZipMembers(bytes, `<library archive ${payload.sha256.slice(0, 12)}>`);
    } catch (error) {
        const message = String(error?.message ?? error);
        const status = message.includes('ZIP64') ? 'failed:zip64-unsupported' : 'failed:corrupt-or-unsupported';
        return { ...base, status, failure: message, members: [] };
    }
    const members = parsed.members.map(member => describeMember(parsed.buffer, member));
    const filePayloads = members.filter(member => member.memberKind === 'file' && member.status === 'hashed');
    return {
        ...base,
        status: 'censused',
        memberOccurrenceCount: members.filter(member => member.memberKind === 'file').length,
        uniqueMemberPayloadCount: new Set(filePayloads.map(member => member.payloadSha256)).size,
        failedMemberCount: members.filter(member => member.memberKind === 'file' && member.status !== 'hashed').length,
        members,
    };
}

function describeMember(buffer, member) {
    const classification = classifyLibraryName(member.name);
    const base = {
        centralDirectoryIndex: member.centralDirectoryIndex,
        name: member.name,
        memberKind: member.memberKind,
        compression: member.compression,
        compressedBytes: member.compressedBytes,
        uncompressedBytes: member.uncompressedBytes,
        classification,
    };
    if (member.memberKind !== 'file') return { ...base, status: 'not-a-file' };
    if ((member.flags ?? 0) & ENCRYPTED_FLAG) return { ...base, status: 'failed:encrypted-member' };
    try {
        const payload = readMemberPayload(buffer, member, '<library archive>');
        return { ...base, status: 'hashed', payloadSha256: sha256Hex(payload) };
    } catch (error) {
        return { ...base, status: 'failed:member-extract', failure: String(error?.message ?? error) };
    }
}
