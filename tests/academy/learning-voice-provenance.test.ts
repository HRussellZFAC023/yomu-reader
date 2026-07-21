import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const paths = {
    production: 'docs/academy/audio/learning-voice-production.json',
    models: 'docs/academy/audio/learning-voice-model-evidence.json',
    queries: 'docs/academy/audio/learning-voice-query-evidence.json',
    reviews: 'docs/academy/audio/learning-voice-model-reviews.json',
    acceptance: 'docs/academy/audio/learning-voice-acceptance.json',
    localExpected: 'docs/academy/audio/learning-voice-local-expected.json',
    productionProof: 'docs/academy/audio/learning-voice-production-proof.json',
    locks: 'docs/academy/audio/learning-voice-locks.json',
    catalog: 'public/academy/audio/learning-voice-playback.json',
    hostedCatalog: 'docs/public/academy/audio/learning-voice-playback.json',
};

function read(path: string): Buffer {
    return readFileSync(resolve(root, path));
}

function json(path: string): any {
    return JSON.parse(read(path).toString('utf8'));
}

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

describe('learning voice reproducible provenance', () => {
    it('binds exact model distributions, licence, engine/style records, queries, and accepted output bytes', () => {
        const production = json(paths.production);
        const models = json(paths.models);
        const queries = json(paths.queries);
        const catalog = json(paths.catalog);
        const mappings = new Map(production.voiceMappings.map((entry: any) => [entry.mappingId, entry]));
        const catalogById = new Map(catalog.entries.map((entry: any) => [entry.lineId, entry]));

        expect(models.schema).toBe('yomu-academy.learning-voice-model-evidence.v3');
        expect(models.productionContractSha256).toBe(sha256(read(paths.production)));
        expect(models.engine.versionResponseSha256).toBe(production.render.engine.versionResponseSha256);
        expect(sha256(models.license.text)).toBe(models.license.sha256);
        expect(models.models).toHaveLength(4);
        for (const model of models.models) {
            expect(model.distribution).toMatchObject({
                kind: 'installed-aivmx-distribution',
                authority: 'exact-distribution-bytes',
                sha256: model.payloadSha256,
            });
            expect(model.distribution.bytes).toBeGreaterThan(0);
            expect(model.sourceRecord).toMatchObject({
                authority: 'discovery-record-only',
                authoritativeForDistributionBytes: false,
            });
        }
        for (const style of models.engineStyleMappings) {
            const mapping = mappings.get(style.mappingId) as any;
            expect(style).toMatchObject({
                modelUuid: mapping.modelUuid,
                modelPayloadSha256: mapping.modelPayloadSha256,
                styleId: mapping.styleId,
                styleName: mapping.styleName,
            });
        }

        expect(queries.schema).toBe('yomu-academy.learning-voice-query-evidence.v2');
        expect(queries.productionContractSha256).toBe(sha256(read(paths.production)));
        expect(queries.modelEvidenceSha256).toBe(sha256(read(paths.models)));
        expect(queries.entries).toHaveLength(4);
        for (const archived of queries.entries) {
            const contract = production.entries.find((entry: any) => entry.identity.voiceLineId === archived.voiceLineId);
            const catalogEntry = catalogById.get(archived.voiceLineId) as any;
            expect(archived.audioQuerySha256).toBe(contract.audioQuerySha256);
            expect(archived.cacheKey).toBe(contract.expectedCacheKey);
            expect(archived.disposition).toBe(contract.disposition.status);
            if (archived.disposition === 'accepted') {
                const asset = readFileSync(resolve(root, 'public', catalogEntry.url.replace(/^\//u, '')));
                expect(archived.asset).toEqual({
                    url: catalogEntry.url,
                    sha256: sha256(asset),
                    bytes: asset.length,
                });
                expect(archived.rejectedAssetFingerprint).toBeNull();
            } else {
                expect(catalogEntry).toBeUndefined();
                expect(archived.asset).toBeNull();
                expect(archived.rejectedAssetFingerprint.sha256).toMatch(/^[a-f0-9]{64}$/u);
            }
        }
    });

    it('verifies committed evidence read-only after the deterministic build', () => {
        const protectedPaths = Object.values(paths);
        const before = protectedPaths.map(path => sha256(read(path)));
        const commands: Array<[string, string[]]> = [
            ['python3', ['scripts/academy-voice/render-learning-voice.py', '--engine', 'http://127.0.0.1:1']],
            ['node', ['scripts/academy-voice/reconcile-learning-voice-evidence.mjs']],
            ['node', ['scripts/academy-voice/qa-learning-voice.mjs']],
            ['node', ['scripts/academy-voice/capture-learning-voice-local-expected.mjs']],
            ['node', ['scripts/academy-voice/lock-learning-voice.mjs']],
            ['node', ['scripts/academy-voice/learning-voice-production-proof.mjs', '--dry-check']],
        ];
        for (const [command, args] of commands) {
            const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
            expect(result.status, result.stderr || result.stdout).toBe(0);
        }
        expect(protectedPaths.map(path => sha256(read(path)))).toEqual(before);
    });

    it('separates immutable local expectations from observed output and keeps production pending', () => {
        const expected = json(paths.localExpected);
        const productionProof = json(paths.productionProof);
        const dist = read(expected.build.distApp);
        const hosted = read(expected.build.hostedApp);

        expect(expected.schema).toBe('yomu-academy.learning-voice-local-expected.v1');
        expect(expected.scope).toContain('not deployment evidence');
        expect(dist.equals(hosted)).toBe(true);
        expect(sha256(dist)).toBe(expected.build.appSha256);
        expect(expected.acceptedBindingIds).toHaveLength(1);
        expect(productionProof).toMatchObject({
            schema: 'yomu-academy.learning-voice-production-proof.v1',
            deploymentStatus: 'pending',
            verdict: 'pending',
            base020Status: 'open',
            capabilityStatus: 'pending-live-release',
        });
        expect(productionProof.requiredCapabilities).toEqual(expect.arrayContaining([
            'response-content-sha256',
            'natural-playback-completion',
            'request-cancellation',
            'service-worker-controlled',
            'cache-offline-replay',
            'webkit-mobile',
            'axe-accessibility',
        ]));
    });

    it('contains no private workstation paths in release evidence or public catalog', () => {
        const privatePath = /(?:\/Users\/[^/]+\/|\/home\/[^/]+\/|[A-Za-z]:\\Users\\[^\\]+\\)/u;
        for (const path of Object.values(paths)) {
            expect(read(path).toString('utf8'), path).not.toMatch(privatePath);
        }
    });
});
