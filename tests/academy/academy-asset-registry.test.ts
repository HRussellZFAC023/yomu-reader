import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { buildRegistry, serializeRegistry, validateRegistry } from '../../scripts/academy-asset-registry.mjs';
import { ACADEMY_RUNTIME_ASSET_REGISTRY } from '../../src/academy/assets';

const buildCurrentRegistry = () => buildRegistry({ runtimeRegistry: ACADEMY_RUNTIME_ASSET_REGISTRY });

describe('Academy Lessons 27-41 and world asset registry', () => {
    it('is deterministically generated and mirrored', async () => {
        const registry = await buildCurrentRegistry();
        const serialized = serializeRegistry(registry);
        expect(validateRegistry(registry)).toEqual([]);
        expect(fs.readFileSync(path.resolve('public/academy/art/ACADEMY-ASSET-REGISTRY.json'), 'utf8')).toBe(serialized);
        expect(fs.readFileSync(path.resolve('docs/public/academy/art/ACADEMY-ASSET-REGISTRY.json'), 'utf8')).toBe(serialized);
        const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8')) as {
            assets: Array<{ id: string; verdict: string; runtimeHome: string[]; deliveries: Array<{ path: string; sha256: string }> }>;
        };
        const entry = ledger.assets.find(asset => asset.id === 'academy-asset-registry-v1')!;
        expect(entry).toMatchObject({
            verdict: 'generated-conformance-data/non-runtime',
            runtimeHome: [],
        });
        expect(entry.deliveries[0].sha256).toBe(
            crypto.createHash('sha256').update(serialized).digest('hex'),
        );
    });

    it('reconciles provenance, runtime use, orphan status, variants, and gaps for the complete scope', async () => {
        const registry = await buildCurrentRegistry();
        expect(registry.scope).toEqual({
            lessons: {
                first: 27,
                last: 41,
                packageIds: ['l2-l02', 'l2-l03', 'l2-l04', 'l2-l05', 'l2-l06', 'l2-l07', 'l2-l08', 'l2-l09', 'l2-l10', 'l2-l11', 'l2-l12', 'l2-l13', 'l2-l14', 'l2-l15', 'l2-l16'],
            },
            worlds: ['station', 'cafe', 'konbini'],
        });
        for (const entry of [...registry.lessons, ...registry.worlds]) {
            expect(entry).toHaveProperty('provenance');
            expect(entry).toHaveProperty('runtimeUse');
            expect(entry).toHaveProperty('orphanStatus');
            expect(entry).toHaveProperty('responsiveVariants');
            expect(entry).toHaveProperty('missingPurposefulAssets');
        }
    });

    it('records actual lesson plate homes without authorizing name-only cast art', async () => {
        const registry = await buildCurrentRegistry();
        for (const lesson of registry.lessons) {
            expect(lesson.runtimeUse.status).toBe('active-runtime');
            expect(lesson.runtimeUse.plateAsset.runtimeUses).toContain(`lesson:${lesson.packageId}`);
            expect(lesson.intentionalOmissions).toContain('name-only-cast-does-not-authorize-likeness-art');
            expect(lesson.provenance.media.some(media => media.type === 'source-visual')).toBe(true);
        }
    });

    it('closes Lesson 28 with explicit single-source art direction and Lessons 36-41 with responsive owners', async () => {
        const registry = await buildCurrentRegistry();
        const lesson28 = registry.lessons.find(lesson => lesson.ordinal === 28)!;
        const lesson36 = registry.lessons.find(lesson => lesson.ordinal === 36)!;
        const lesson37 = registry.lessons.find(lesson => lesson.ordinal === 37)!;
        const lesson38 = registry.lessons.find(lesson => lesson.ordinal === 38)!;
        const lesson39 = registry.lessons.find(lesson => lesson.ordinal === 39)!;
        const lesson40 = registry.lessons.find(lesson => lesson.ordinal === 40)!;
        const lesson41 = registry.lessons.find(lesson => lesson.ordinal === 41)!;
        expect(lesson28.responsiveVariants).toMatchObject({
            status: 'complete-art-directed-single-source',
            artDirection: {
                strategy: 'art-directed-crop',
                sourceVariant: 'wide',
                objectPosition: '62% center',
            },
        });
        expect(lesson28.responsiveVariants.mobile!.path).toBe(lesson28.responsiveVariants.wide!.path);
        expect(lesson28.missingPurposefulAssets).toEqual([]);
        expect(lesson36).toMatchObject({
            plateAssetId: 'location.station',
            orphanStatus: 'active-runtime',
            responsiveVariants: { status: 'complete-distinct-pair' },
        });
        expect(lesson36.runtimeUse.plateAsset.runtimeUses).toContain('lesson:l2-l11');
        expect(lesson36.missingPurposefulAssets).toEqual([]);
        expect([lesson37, lesson38, lesson39, lesson40, lesson41]).toMatchObject([
            {
                plateAssetId: 'location.writing-studio',
                orphanStatus: 'active-runtime',
                responsiveVariants: { status: 'complete-distinct-pair' },
                missingPurposefulAssets: [],
            },
            {
                plateAssetId: 'location.cafe',
                orphanStatus: 'active-runtime',
                responsiveVariants: { status: 'complete-distinct-pair' },
                missingPurposefulAssets: [],
            },
            {
                plateAssetId: 'location.language-lab',
                orphanStatus: 'active-runtime',
                responsiveVariants: { status: 'complete-distinct-pair' },
                missingPurposefulAssets: [],
            },
            {
                plateAssetId: 'location.classroom',
                orphanStatus: 'active-runtime',
                responsiveVariants: { status: 'complete-distinct-pair' },
                missingPurposefulAssets: [],
            },
            {
                plateAssetId: 'location.classroom',
                orphanStatus: 'active-runtime',
                responsiveVariants: { status: 'complete-distinct-pair' },
                missingPurposefulAssets: [],
            },
        ]);
        expect(lesson37.runtimeUse.plateAsset.runtimeUses).toContain('lesson:l2-l12');
        expect(lesson38.runtimeUse.plateAsset.runtimeUses).toContain('lesson:l2-l13');
        expect(lesson39.runtimeUse.plateAsset.runtimeUses).toContain('lesson:l2-l14');
        expect(lesson40.runtimeUse.plateAsset.runtimeUses).toContain('lesson:l2-l15');
        expect(lesson41.runtimeUse.plateAsset.runtimeUses).toContain('lesson:l2-l16');
    });

    it('promotes only the exact cafe order candidate and keeps unrelated recovery candidates non-runtime', async () => {
        const registry = await buildCurrentRegistry();
        const cafe = registry.worlds.find(world => world.id === 'cafe')!;
        expect(cafe.runtimeUse.plates).toHaveLength(1);
        expect(cafe.runtimeUse.items).toHaveLength(1);
        expect(cafe.runtimeUse.items[0]).toMatchObject({
            id: 'item.cafe-order-scene',
            provenance: {
                sourceSha256: '13773a75ec1369166c763ac2b57f4d1f7bf01baeb7530d0638e104c80de1cf74',
            },
            runtimeUses: ['reward:cafe:inspectable-order-scene'],
        });
        expect(cafe.recoveredCandidates.length).toBeGreaterThan(0);
        expect(cafe.recoveredCandidates.every(candidate =>
            candidate.orphanStatus === 'recovered-archive-only'
            && candidate.runtimeUses.length === 0
            && candidate.approval.includes('not-runtime-authorized'))).toBe(true);
        expect(cafe.recoveredCandidates.some(candidate => candidate.sha256 === '13773a75ec1369166c763ac2b57f4d1f7bf01baeb7530d0638e104c80de1cf74')).toBe(false);
        expect(cafe.missingPurposefulAssets).toEqual([]);
        expect(registry.missingPurposefulAssets).toEqual([]);
    });

    it('tracks superseded source-audio duplicates by hash instead of calling them active', async () => {
        const registry = await buildCurrentRegistry();
        const lesson28 = registry.lessons.find(lesson => lesson.ordinal === 28)!;
        const localAudio = lesson28.provenance.media.find(media => media.path.endsWith('/moodle-b-22.mp3'))!;
        expect(localAudio).toMatchObject({
            orphanStatus: 'superseded-duplicate-delivery',
            runtimeUse: 'superseded-by-hash-addressed-listening:l2-l03',
        });
        expect(lesson28.provenance.packagedListening.some(asset => asset.sha256 === localAudio.sha256)).toBe(true);
    });
});
