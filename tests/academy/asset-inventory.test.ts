import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
    buildAcademyAssetInventory,
    OUTPUT_PATH,
    serializeAcademyAssetInventory,
    validateAcademyAssetInventory,
// @ts-expect-error The audit is an intentionally standalone Node ESM script.
} from '../../scripts/academy-asset-audit.mjs';
import { sha256File } from './helpers/hash-memo';

interface InventoryAsset {
    readonly id: string;
    readonly path: string;
    readonly state: 'active' | 'orphaned' | 'deprecated';
    readonly present: boolean;
    readonly runtimeAuthorized: boolean;
    readonly runtimeHomes: readonly string[];
    readonly replacementPath?: string | null;
    readonly noDeletionPerformedByAudit?: boolean;
}

interface AssetInventory {
    readonly counts: {
        readonly currentRasterFiles: number;
        readonly currentRasterFilesAccountedFor: number;
        readonly active: number;
        readonly orphaned: number;
        readonly deprecated: number;
        readonly deprecatedPresent: number;
        readonly missingExpressionVariants: number;
        readonly expressionMatrixSlots: number;
        readonly approvedExpressionVariants: number;
        readonly reviewCandidateExpressionVariants: number;
        readonly deliveredMatrixExpressionVariants: number;
        readonly offMatrixDeliveredSprites: number;
    };
    readonly assets: {
        readonly active: readonly InventoryAsset[];
        readonly orphaned: readonly InventoryAsset[];
        readonly deprecated: readonly InventoryAsset[];
    };
    readonly expressionCoverage: {
        readonly offMatrixDelivered: ReadonlyArray<{ path: string; currentState: string; countsTowardExpressionMatrix: boolean }>;
        readonly missingVariants: ReadonlyArray<{
            character: string;
            angle: string;
            expression: string;
            plannedPath: string;
            state: 'missing-expression-variant';
        }>;
    };
    readonly noFilesDeletedByAudit: boolean;
}

const inventory = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')) as AssetInventory;

function currentRasterHashes() {
    const root = path.resolve('public/academy/art');
    const files = execFileSync('git', ['ls-files', '-z', '--', 'public/academy/art'], { encoding: 'utf8' })
        .split('\0')
        .filter(file => /\.(?:jpe?g|png|webp)$/iu.test(file))
        .map(file => path.resolve(file))
        .filter(file => fs.existsSync(file));
    return Object.fromEntries(files.sort().map(file => [
        path.relative(root, file),
        // Recovered review files are catalogued separately; this audit proves the
        // release-tracked tree without making local recovery bytes a CI input.
        sha256File(file),
    ]));
}

describe('Academy active, orphaned, deprecated, and missing asset inventory', () => {
    it('is the canonical source-derived inventory and passes the read-only CLI audit', () => {
        expect(fs.readFileSync(OUTPUT_PATH, 'utf8')).toBe(serializeAcademyAssetInventory());
        expect(validateAcademyAssetInventory(buildAcademyAssetInventory())).toEqual([]);

        const before = currentRasterHashes();
        expect(execFileSync(process.execPath, ['scripts/academy-asset-audit.mjs', 'validate'], { encoding: 'utf8' }))
            .toContain(`${inventory.counts.active} active, ${inventory.counts.orphaned} orphaned, ${inventory.counts.deprecated} deprecated, ${inventory.counts.missingExpressionVariants} missing expression variants`);
        expect(currentRasterHashes()).toEqual(before);
    });

    it('accounts for every current raster exactly once without conflating authorization and presence', () => {
        const releaseRasterCount = Object.keys(currentRasterHashes()).length;
        expect(inventory.counts.currentRasterFiles).toBe(releaseRasterCount);
        expect(inventory.counts.currentRasterFilesAccountedFor).toBe(releaseRasterCount);
        expect(inventory.counts.active).toBe(inventory.assets.active.length);
        expect(inventory.counts.orphaned).toBe(inventory.assets.orphaned.length);
        expect(inventory.counts.deprecated).toBe(inventory.assets.deprecated.length);
        expect(inventory.counts.deprecatedPresent)
            .toBe(inventory.assets.deprecated.filter(asset => asset.present).length);
        expect(inventory.assets.active.every(asset => asset.present && asset.runtimeAuthorized && asset.runtimeHomes.length > 0)).toBe(true);
        expect(inventory.assets.orphaned.every(asset => asset.present && !asset.runtimeAuthorized && asset.runtimeHomes.length === 0)).toBe(true);
        expect(inventory.assets.deprecated.every(asset => !asset.runtimeAuthorized && asset.runtimeHomes.length === 0)).toBe(true);
        expect(new Set([
            ...inventory.assets.active,
            ...inventory.assets.orphaned,
            ...inventory.assets.deprecated.filter(asset => asset.present),
        ].map(asset => asset.path)).size).toBe(releaseRasterCount);
    });

    it('reports off-matrix cast deliveries without confusing them with missing matrix slots', () => {
        expect(inventory.expressionCoverage.offMatrixDelivered)
            .toHaveLength(inventory.counts.offMatrixDeliveredSprites);
        expect(inventory.expressionCoverage.offMatrixDelivered.every(entry =>
            entry.path.startsWith('/academy/art/characters/')
            && entry.countsTowardExpressionMatrix === false,
        )).toBe(true);
        expect(new Set(inventory.expressionCoverage.offMatrixDelivered.map(entry => entry.path)).size)
            .toBe(inventory.expressionCoverage.offMatrixDelivered.length);
    });

    it('retains absent rejected and superseded sprites as non-destructive deprecation records', () => {
        expect(inventory.noFilesDeletedByAudit).toBe(true);
        expect(inventory.assets.deprecated).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'xingyu-neutral-halfbody-v001',
                path: '/academy/art/characters/xingyu/xingyu__neutral__halfbody__v001.png',
                state: 'deprecated',
                present: false,
                noDeletionPerformedByAudit: true,
            }),
            expect.objectContaining({
                id: 'sophie-flat-v002-to-painted-v003',
                path: '/academy/art/characters/sophie/sophie__neutral__halfbody__v002.png',
                replacementPath: '/academy/art/characters/sophie/sophie__bookshop-neutral__halfbody__v003.png',
                present: false,
                noDeletionPerformedByAudit: true,
            }),
        ]));
    });

    it('lists every missing matrix expression variant without treating off-matrix sprites as coverage', () => {
        expect(inventory.counts).toMatchObject({
            expressionMatrixSlots: 630,
            missingExpressionVariants: inventory.expressionCoverage.missingVariants.length,
            offMatrixDeliveredSprites: inventory.expressionCoverage.offMatrixDelivered.length,
        });
        expect(
            inventory.counts.approvedExpressionVariants +
            inventory.counts.reviewCandidateExpressionVariants,
        ).toBe(inventory.counts.deliveredMatrixExpressionVariants);
        expect(
            inventory.counts.deliveredMatrixExpressionVariants +
            inventory.counts.missingExpressionVariants,
        ).toBe(inventory.counts.expressionMatrixSlots);
        expect(new Set(inventory.expressionCoverage.missingVariants.map(variant => variant.plannedPath)).size)
            .toBe(inventory.expressionCoverage.missingVariants.length);
        expect(inventory.expressionCoverage.missingVariants).toContainEqual({
            character: 'xingyu',
            angle: 'front-near-front',
            expression: 'thoughtful',
            plannedPath: '/academy/art/characters/xingyu/xingyu__thoughtful__front-near-front__halfbody__v001.png',
            state: 'missing-expression-variant',
            present: false,
            sourceLedger: 'public/academy/art/CLASSMATE-SPRITE-INVENTORY.json',
        });
        const releasePaths = new Set([
            ...inventory.assets.active,
            ...inventory.assets.orphaned,
            ...inventory.assets.deprecated.filter(asset => asset.present),
        ].map(asset => asset.path));
        expect(inventory.expressionCoverage.missingVariants.every(variant =>
            !releasePaths.has(variant.plannedPath))).toBe(true);
    });
});
