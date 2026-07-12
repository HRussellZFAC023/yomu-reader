// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { resolveRoots } from '../../scripts/academy-source-pipeline/paths.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { buildPrivateLedger } from '../../scripts/academy-source-pipeline/ledger.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { buildPublicCatalog } from '../../scripts/academy-source-pipeline/public-outputs.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { sha256Hex } from '../../scripts/academy-source-pipeline/io.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { readMemberPayload, readZipMembers } from '../../scripts/academy-source-pipeline/zip.mjs';
import { buildFixture, toEnv, PDF_SHARED, PDF_UNIQUE, MP3_BYTES, DOCX_BYTES } from './helpers/source-pipeline-fixture';

function scan(roots = buildFixture()) {
    const resolved = resolveRoots(toEnv(roots));
    const ledger = buildPrivateLedger(resolved, {});
    return { roots, resolved, ledger };
}

describe('source pipeline ledger and catalog', () => {
    it('separates occurrence and unique-payload denominators and keeps hash/size integrity', () => {
        const { ledger } = scan();
        expect(ledger.archiveOccurrences).toHaveLength(2);
        expect(ledger.memberOccurrences).toHaveLength(4);

        const memberShas = new Set(ledger.memberOccurrences.map((occurrence: any) => occurrence.payloadSha256));
        expect(memberShas.size).toBe(3);
        expect(memberShas.has(sha256Hex(Buffer.from(PDF_SHARED)))).toBe(true);
        expect(memberShas.has(sha256Hex(Buffer.from(PDF_UNIQUE)))).toBe(true);
        expect(memberShas.has(sha256Hex(Buffer.from(MP3_BYTES)))).toBe(true);

        expect(ledger.directResources).toHaveLength(1);
        expect(ledger.directResources[0].sha256).toBe(sha256Hex(Buffer.from(DOCX_BYTES)));
        expect(ledger.uniquePayloads).toHaveLength(4);

        const shared = ledger.uniquePayloads.find((payload: any) => payload.sha256 === sha256Hex(Buffer.from(PDF_SHARED)));
        expect(shared?.occurrenceCount).toBe(2);
        expect(shared?.byteLength).toBe(PDF_SHARED.length);
    });

    it('maps every archive back to its manifest module', () => {
        const { ledger } = scan();
        expect(ledger.archiveOccurrences.map((archive: any) => archive.mapping.status)).toEqual(['mapped', 'mapped']);
        const moduleIds = ledger.archiveOccurrences.map((archive: any) => archive.mapping.moduleId).sort();
        expect(moduleIds).toEqual([101, 103]);
    });

    it('extracts exactly one deduplicated payload per unique hash', () => {
        const { resolved, ledger } = scan();
        const payloadFiles = readdirSync(path.join(resolved.privateRoot, 'payloads'));
        expect(payloadFiles).toHaveLength(ledger.uniquePayloads.length);
        for (const payload of ledger.uniquePayloads) {
            expect(payloadFiles.some(name => name.startsWith(payload.sha256))).toBe(true);
        }
    });

    it('produces a byte-identical catalog across independent runs (determinism)', () => {
        const roots = buildFixture();
        const first = JSON.stringify(buildPublicCatalog(scan(roots).ledger), null, 2);
        const second = JSON.stringify(buildPublicCatalog(scan(roots).ledger), null, 2);
        expect(second).toBe(first);
    });

    it('reports archive-only assets and consistent catalog sums', () => {
        const { ledger } = scan();
        const catalog = buildPublicCatalog(ledger);
        expect(catalog.summary.archiveOccurrenceCount).toBe(2);
        expect(catalog.summary.memberOccurrenceCount).toBe(4);
        expect(catalog.summary.uniquePayloadAssetCount).toBe(3);
        expect(catalog.summary.directResourceCount).toBe(1);
        expect(catalog.assets).toHaveLength(3);
        expect(catalog.assets.every((asset: any) => asset.status === 'stored')).toBe(true);
        expect(catalog.summary.duplicatePayloadOccurrenceCount).toBe(1);
        const patternTotal = catalog.patterns.byFileType.reduce((sum: number, row: any) => sum + row.occurrenceCount, 0);
        expect(patternTotal).toBe(4);
    });

    it('is resumable: a second run reuses per-archive scan caches without rescanning', () => {
        const roots = buildFixture();
        const resolved = resolveRoots(toEnv(roots));
        const firstLogs: string[] = [];
        buildPrivateLedger(resolved, { log: (message: string) => firstLogs.push(message) });
        expect(firstLogs.filter(message => message.startsWith('scan '))).toHaveLength(2);

        const secondLogs: string[] = [];
        const ledger = buildPrivateLedger(resolved, { log: (message: string) => secondLogs.push(message) });
        expect(secondLogs.filter(message => message.startsWith('scan '))).toHaveLength(0);
        expect(ledger.memberOccurrences).toHaveLength(4);
    });

    it('writes outputs atomically, leaving no temp files behind', () => {
        const { resolved } = scan();
        const leftovers = readdirSync(resolved.privateRoot).filter(name => name.includes('.tmp-'));
        expect(leftovers).toEqual([]);
        expect(existsSync(path.join(resolved.privateRoot, 'private-ledger.v1.json'))).toBe(true);
    });

    it('refuses a manifest whose hash does not match the expected capture', () => {
        const roots = buildFixture();
        const resolved = resolveRoots(toEnv(roots));
        expect(() => buildPrivateLedger(resolved, { expectedManifestSha256: 'f'.repeat(64) }))
            .toThrow(/Manifest hash mismatch/);
    });

    it('verifies ZIP CRC32 even when corrupt payload length is unchanged', () => {
        const zip = Buffer.from(zipSync({ 'member.txt': strToU8('same-length-payload') }, { level: 0 }));
        const { members } = readZipMembers(zip, 'fixture.zip');
        const member = members[0];
        const corrupt = Buffer.from(zip);
        const nameLength = corrupt.readUInt16LE(member.localHeaderOffset + 26);
        const extraLength = corrupt.readUInt16LE(member.localHeaderOffset + 28);
        const dataStart = member.localHeaderOffset + 30 + nameLength + extraLength;
        corrupt[dataStart] ^= 0xff;
        expect(() => readMemberPayload(corrupt, member, 'fixture.zip')).toThrow(/CRC32 mismatch/);
    });
});
