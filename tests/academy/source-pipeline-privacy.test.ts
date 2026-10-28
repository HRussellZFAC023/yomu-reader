// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { resolveRoots } from '../../scripts/academy-source-pipeline/paths.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { buildPrivateLedger } from '../../scripts/academy-source-pipeline/ledger.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { migrateDonorPacks } from '../../scripts/academy-source-pipeline/packs.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { buildListeningPairings } from '../../scripts/academy-source-pipeline/pairing.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { buildPublicCatalog, buildCorpusStatus, buildPackMigrationSummary } from '../../scripts/academy-source-pipeline/public-outputs.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { collectPrivateTokens, findLeakedTokens, validatePublicValue, validateClaims } from '../../scripts/academy-source-pipeline/privacy.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { loadManifest } from '../../scripts/academy-source-pipeline/manifest.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { validatePublicOutputs, COMMITTED_BASELINE, COMMITTED_MEDIA_BASELINE } from '../../scripts/academy-source-pipeline/validate.mjs';
import { buildFixture, toEnv, SECRET_TOKENS, DOCX_BYTES } from './helpers/source-pipeline-fixture';

const EMPTY_CENSUS = { documents: [] as any[] };
const EMPTY_AUDIO = { payloads: [] as any[] };

function buildOutputs() {
    const resolved = resolveRoots(toEnv(buildFixture()));
    const ledger = buildPrivateLedger(resolved, {});
    const packCandidates = migrateDonorPacks(resolved, ledger, {});
    const pairings = buildListeningPairings(resolved, packCandidates, EMPTY_AUDIO);
    const { manifest } = loadManifest(resolved.corpusRoot);
    return {
        resolved,
        ledger,
        manifest,
        packCandidates,
        catalog: buildPublicCatalog(ledger),
        corpusStatus: buildCorpusStatus(ledger, EMPTY_CENSUS, EMPTY_AUDIO, packCandidates),
        packMigration: buildPackMigrationSummary(packCandidates, pairings),
    };
}

describe('source pipeline privacy boundary', () => {
    it('leaks no private token, filename, title, prompt, or absolute path into any public output', () => {
        const outputs = buildOutputs();
        const serialized = JSON.stringify([outputs.catalog, outputs.corpusStatus, outputs.packMigration]);
        for (const token of SECRET_TOKENS) {
            expect(serialized).not.toContain(token);
        }
        const tokens = collectPrivateTokens(outputs);
        expect(tokens.size).toBeGreaterThan(5);
        expect(findLeakedTokens(serialized, tokens)).toEqual([]);
        expect(serialized).not.toContain('/Users/');
        expect(serialized).not.toContain('.zip');
    });

    it('passes the structural allowlist and rejects planted private keys and non-ASCII values', () => {
        const outputs = buildOutputs();
        expect(validatePublicValue(outputs.catalog)).toEqual([]);
        expect(validatePublicValue(outputs.corpusStatus)).toEqual([]);
        expect(validatePublicValue(outputs.packMigration)).toEqual([]);
        expect(outputs.corpusStatus.directResourceOccurrences).toHaveLength(1);
        expect(outputs.corpusStatus.directResourceOccurrences[0]).toMatchObject({
            id: 'direct-000001',
            status: 'stored',
            byteLength: DOCX_BYTES.length,
        });

        const tampered = { ...outputs.catalog, title: 'Secret Lesson Title' };
        expect(validatePublicValue(tampered).some((violation: string) => violation.includes('forbidden private key'))).toBe(true);
        const nonAscii = { ...outputs.catalog, schema: '秘密' };
        expect(validatePublicValue(nonAscii).some((violation: string) => violation.includes('non-ASCII'))).toBe(true);
    });

    it('detects private tokens after JSON quote and backslash escaping', () => {
        const token = 'Week 3 "Kanji" \\ review';
        const serialized = JSON.stringify({ leaked: token });
        expect(findLeakedTokens(serialized, new Set([token]))).toEqual([token]);
    });

    it('derives media denominators from the ledger, not census row counts', () => {
        const outputs = buildOutputs();
        expect(outputs.corpusStatus.pdfPayloads).toHaveLength(0);
        expect(outputs.corpusStatus.audioPayloads).toHaveLength(0);
        expect(outputs.corpusStatus.denominators.uniquePdfPayloads).toBe(2);
        expect(outputs.corpusStatus.denominators.uniqueAudioPayloads).toBe(1);
        expect(outputs.corpusStatus.releaseGate.allPayloadsCensused).toBe(false);
    });

    it('keeps the claim guard: candidates can never become verified/playable coverage', () => {
        const outputs = buildOutputs();
        expect(validateClaims(outputs.corpusStatus)).toEqual([]);

        const inflated = structuredClone(outputs.corpusStatus);
        inflated.claims.verifiedSourceQuestions = inflated.claims.sourceItemCandidates;
        inflated.claims.playableSourceQuestions = 879;
        inflated.releaseGate.sourceFidelityComplete = true;
        const violations = validateClaims(inflated);
        expect(violations.some((violation: string) => violation.includes('verifiedSourceQuestions'))).toBe(true);
        expect(violations.some((violation: string) => violation.includes('playableSourceQuestions'))).toBe(true);
        expect(violations.some((violation: string) => violation.includes('releaseGate.sourceFidelityComplete'))).toBe(true);

        const dishonestCensus = structuredClone(outputs.corpusStatus);
        dishonestCensus.releaseGate.allPayloadsCensused = !dishonestCensus.releaseGate.allPayloadsCensused;
        expect(validateClaims(dishonestCensus).some((violation: string) =>
            violation.includes('releaseGate.allPayloadsCensused'))).toBe(true);
    });
});

describe('committed public outputs', () => {
    const publicRoot = path.resolve(process.cwd(), 'public/academy/content/source-pipeline');
    const generated = existsSync(path.join(publicRoot, 'catalog.v2.json'));

    it.skipIf(!generated)('honour the audited 96/916/688 baseline and every validator', () => {
        expect(COMMITTED_BASELINE.archiveOccurrenceCount).toBe(96);
        expect(COMMITTED_BASELINE.memberOccurrenceCount).toBe(916);
        expect(COMMITTED_BASELINE.uniquePayloadAssetCount).toBe(688);
        expect(COMMITTED_MEDIA_BASELINE).toEqual({
            directResources: 3,
            uniqueDirectResourcePayloads: 1,
            pdfOccurrences: 716,
            uniquePdfPayloads: 527,
            audioOccurrences: 185,
            uniqueAudioPayloads: 146,
        });
        expect(validatePublicOutputs(publicRoot)).toEqual([]);
    });
});
