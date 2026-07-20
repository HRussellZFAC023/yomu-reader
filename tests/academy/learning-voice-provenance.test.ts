import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const productionPath = resolve(root, 'docs/academy/audio/learning-voice-production.json');
const modelEvidencePath = resolve(root, 'docs/academy/audio/learning-voice-model-evidence.json');
const queryEvidencePath = resolve(root, 'docs/academy/audio/learning-voice-query-evidence.json');
const catalogPath = resolve(root, 'public/academy/audio/learning-voice-playback.json');
const hostedCatalogPath = resolve(root, 'docs/public/academy/audio/learning-voice-playback.json');

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

describe('learning voice reproducible provenance', () => {
    it('cross-checks every archived query and global-to-local engine style join', () => {
        const production = JSON.parse(readFileSync(productionPath, 'utf8'));
        const models = JSON.parse(readFileSync(modelEvidencePath, 'utf8'));
        const evidence = JSON.parse(readFileSync(queryEvidencePath, 'utf8'));
        const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
        const productionMappings = new Map(production.voiceMappings.map((entry: Record<string, unknown>) => (
            [entry.mappingId, entry]
        )));
        const modelByUuid = new Map(models.models.map((entry: Record<string, unknown>) => [entry.uuid, entry]));
        const engineMappingById = new Map(models.engineStyleMappings.map((entry: Record<string, unknown>) => (
            [entry.mappingId, entry]
        )));
        const catalogById = new Map(catalog.entries.map((entry: Record<string, unknown>) => [entry.lineId, entry]));

        expect(evidence.schema).toBe('yomu-academy.learning-voice-query-evidence.v1');
        expect(evidence.productionContractSha256).toBe(sha256(readFileSync(productionPath)));
        expect(evidence.modelEvidenceSha256).toBe(sha256(readFileSync(modelEvidencePath)));
        expect(production.render.cacheKey.canonicalization).toBe('python-json-sort-keys-utf8-compact-v1');
        expect(evidence.styleMappings).toHaveLength(4);
        expect(evidence.entries).toHaveLength(4);

        for (const archived of evidence.styleMappings) {
            const mapping = productionMappings.get(archived.mappingId) as Record<string, unknown>;
            const engineMapping = engineMappingById.get(archived.mappingId) as Record<string, unknown>;
            const model = modelByUuid.get(archived.modelUuid) as {
                payloadSha256: string;
                speakers: Array<{ name: string; styles: Array<{ name: string; localId: number }> }>;
            };
            const localStyle = model.speakers
                .find(speaker => speaker.name === engineMapping.engineSpeakerName)?.styles
                .find(style => style.name === mapping.styleName);
            expect(archived).toMatchObject({
                modelPayloadSha256: model.payloadSha256,
                globalStyleId: mapping.styleId,
                localStyleId: localStyle?.localId,
                styleName: mapping.styleName,
                engineSpeakerUuid: engineMapping.engineSpeakerUuid,
            });
        }

        for (const archived of evidence.entries) {
            const contract = production.entries.find((entry: { identity: { voiceLineId: string } }) => (
                entry.identity.voiceLineId === archived.voiceLineId
            ));
            const catalogEntry = catalogById.get(archived.voiceLineId) as Record<string, unknown>;
            expect(archived.audioQuerySha256).toBe(contract.audioQuerySha256);
            expect(archived.audioQuerySha256).toBe(catalogEntry.audioQuerySha256);
            expect(archived.text).toBe(contract.japanese);
            expect(archived.options).toEqual({
                queryOverrides: contract.queryOverrides,
                moraOverrides: contract.moraOverrides,
            });
            expect(archived.cacheKey).toBe(contract.expectedCacheKey);
            expect(archived.cacheKey).toBe(catalogEntry.cacheKey);
            const asset = readFileSync(resolve(root, 'public', String(catalogEntry.url).replace(/^\//u, '')));
            expect(archived.asset).toEqual({
                url: catalogEntry.url,
                sha256: sha256(asset),
                bytes: asset.length,
            });
        }
    });

    it('runs the verifier offline and without changing its evidence inputs', () => {
        const protectedPaths = [productionPath, modelEvidencePath, queryEvidencePath, catalogPath, hostedCatalogPath];
        const before = protectedPaths.map(path => sha256(readFileSync(path)));
        const validation = spawnSync('python3', [
            'scripts/academy-voice/render-learning-voice.py',
            '--engine', 'http://127.0.0.1:1',
        ], { cwd: root, encoding: 'utf8' });

        expect(validation.status, validation.stderr || validation.stdout).toBe(0);
        expect(JSON.parse(validation.stdout)).toMatchObject({
            validated: 4,
            bindings: 5,
            archivedQueries: 4,
            humanReviewed: false,
        });
        expect(protectedPaths.map(path => sha256(readFileSync(path)))).toEqual(before);
    });

    it('pins browser proof to production-mode dist and hosted app bytes', () => {
        const smoke = JSON.parse(readFileSync(
            resolve(root, 'docs/academy/audio/learning-voice-browser-smoke.json'),
            'utf8',
        ));
        const dist = readFileSync(resolve(root, smoke.productionBuild.distApp));
        const hosted = readFileSync(resolve(root, smoke.productionBuild.hostedApp));

        expect(smoke.schema).toBe('yomu-academy.learning-voice-browser-smoke.v3');
        expect(smoke.productionBuild).toMatchObject({ mode: 'production', byteParity: true });
        expect(dist.equals(hosted)).toBe(true);
        expect(sha256(dist)).toBe(smoke.productionBuild.candidateAppSha256);
        expect(sha256(dist)).toBe(smoke.productionBuild.distAppSha256);
        expect(sha256(hosted)).toBe(smoke.productionBuild.hostedAppSha256);
    });

    it('contains no private workstation paths in the release evidence or public catalog', () => {
        const releasePaths = [
            'docs/academy/audio/learning-voice-production.json',
            'docs/academy/audio/learning-voice-model-evidence.json',
            'docs/academy/audio/learning-voice-query-evidence.json',
            'docs/academy/audio/learning-voice-acceptance.json',
            'docs/academy/audio/learning-voice-browser-smoke.json',
            'docs/academy/audio/learning-voice-locks.json',
            'public/academy/audio/learning-voice-playback.json',
            'docs/public/academy/audio/learning-voice-playback.json',
        ];
        const privatePath = /(?:\/Users\/[^/]+\/|\/home\/[^/]+\/|[A-Za-z]:\\Users\\[^\\]+\\)/u;
        for (const path of releasePaths) {
            expect(readFileSync(resolve(root, path), 'utf8'), path).not.toMatch(privatePath);
        }
    });
});
